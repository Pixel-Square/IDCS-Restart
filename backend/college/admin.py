from __future__ import annotations

from io import BytesIO

from django import forms
from django.contrib import admin, messages
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path


def _load_workbook(*args, **kwargs):
    # Import lazily because admin modules are imported during Django startup.
    from openpyxl import load_workbook

    return load_workbook(*args, **kwargs)

from .models import College, FeatureCatalog, CollegeFeature


class CollegeUploadExcelForm(forms.Form):
    file = forms.FileField(help_text='Upload .xlsx (Column A: code, Column B: college name)')


def _cell_to_str(v) -> str:
    if v is None:
        return ''
    try:
        if isinstance(v, float) and v.is_integer():
            v = int(v)
    except Exception:
        pass
    return str(v).strip()


def _is_header_row(code: str, name: str) -> bool:
    c = (code or '').strip().lower()
    n = (name or '').strip().lower()
    if c in {'code', 'college code', 'college_code'}:
        return True
    if n in {'name', 'college name', 'college_name'}:
        return True
    return False


class CollegeFeatureInline(admin.TabularInline):
    """Inline editor: toggle features directly from the College detail page."""
    model = CollegeFeature
    extra = 0
    fields = ('feature', 'is_enabled', 'enabled_at', 'disabled_at')
    readonly_fields = ('enabled_at', 'disabled_at')
    autocomplete_fields = ('feature',)


def _safe_count(model_path: str, college) -> int:
    """Safely get a count of records belonging to a college. Returns 0 on error."""
    try:
        app_label, model_name = model_path.split('.')
        from django.apps import apps
        Model = apps.get_model(app_label, model_name)
        return Model.objects.filter(college=college).count()
    except Exception:
        return 0


def _admin_url(app_label: str, model_name: str, college_id: int) -> str:
    """Build a pre-filtered admin changelist URL for a college-scoped model."""
    return f'/admin/{app_label}/{model_name.lower()}/?college__id__exact={college_id}'


@admin.register(College)
class CollegeAdmin(admin.ModelAdmin):
    list_display = ('code', 'short_name', 'name', 'city', 'is_active', 'dashboard_link')
    search_fields = ('code', 'short_name', 'name', 'city')
    list_filter = ('is_active', 'city')
    inlines = [CollegeFeatureInline]

    change_list_template = 'admin/college/college/change_list.html'
    change_form_template = 'admin/college/college/change_form.html'

    def dashboard_link(self, obj):
        from django.utils.html import format_html
        return format_html(
            '<a href="/admin/college/college/{}/dashboard/" '
            'style="background:#417690;color:#fff;padding:3px 10px;border-radius:4px;'
            'text-decoration:none;font-size:12px;font-weight:600;">Dashboard</a>',
            obj.pk,
        )
    dashboard_link.short_description = 'Dashboard'

    def get_urls(self):
        urls = super().get_urls()
        my_urls = [
            path(
                'upload-excel/',
                self.admin_site.admin_view(self.upload_excel_view),
                name='college_college_upload_excel',
            ),
            path(
                '<int:college_id>/dashboard/',
                self.admin_site.admin_view(self.college_dashboard_view),
                name='college_college_dashboard',
            ),
        ]
        return my_urls + urls

    # ------------------------------------------------------------------
    # College Dashboard
    # ------------------------------------------------------------------

    def college_dashboard_view(self, request: HttpRequest, college_id: int) -> HttpResponse:
        if not self.has_view_permission(request):
            raise PermissionError('Forbidden')

        college = get_object_or_404(College, pk=college_id)
        cid = college.pk

        def count(model_path):
            return _safe_count(model_path, college)

        def url(app, model):
            return _admin_url(app, model, cid)

        features_on = list(
            CollegeFeature.objects.filter(college=college, is_enabled=True)
            .select_related('feature')
            .values_list('feature__name', flat=True)
        )
        features_off = list(
            CollegeFeature.objects.filter(college=college, is_enabled=False)
            .select_related('feature')
            .values_list('feature__name', flat=True)
        )

        APP_CATEGORIES = {
            'academics': {'title': 'Academics', 'icon': 'graduation-cap', 'color': '#417690'},
            'curriculum': {'title': 'Curriculum', 'icon': 'book-open', 'color': '#205067'},
            'OBE': {'title': 'OBE / Marks', 'icon': 'chart-bar', 'color': '#264b5d'},
            'feedback': {'title': 'Feedback', 'icon': 'clipboard-list', 'color': '#1a7a4a'},
            'staff_requests': {'title': 'Staff Requests', 'icon': 'users', 'color': '#6b3a7d'},
            'staff_attendance': {'title': 'Staff Attendance', 'icon': 'clock', 'color': '#4b2a5d'},
            'staff_salary': {'title': 'Staff Salary', 'icon': 'dollar-sign', 'color': '#2b1a3d'},
            'timetable': {'title': 'Timetable', 'icon': 'calendar', 'color': '#7d4a1a'},
            'lms': {'title': 'LMS', 'icon': 'folder-open', 'color': '#1a5c7d'},
            'announcements': {'title': 'Announcements', 'icon': 'bell', 'color': '#1a5c7d'},
            'academic_calendar': {'title': 'Academic Calendar', 'icon': 'calendar', 'color': '#1a5c7d'},
            'COE': {'title': 'COE (Exams)', 'icon': 'target', 'color': '#7d1a1a'},
            'applications': {'title': 'Applications', 'icon': 'file-text', 'color': '#4a7d1a'},
            'certificates': {'title': 'Certificates', 'icon': 'award', 'color': '#7d5a1a'},
            'pbas': {'title': 'PBAS', 'icon': 'award', 'color': '#7d5a1a'},
            'idcsscan': {'title': 'IDCSScan', 'icon': 'scan-line', 'color': '#1a4a7d'},
            'question_bank': {'title': 'Question Bank', 'icon': 'help-circle', 'color': '#4a1a7d'},
            'template_api': {'title': 'Templates API', 'icon': 'image', 'color': '#4a1a7d'},
            'reporting': {'title': 'Reporting', 'icon': 'pie-chart', 'color': '#1a5c7d'},
            'data_import': {'title': 'Data Import', 'icon': 'upload', 'color': '#264b5d'},
        }

        sections_dict = {}
        for model in self.admin_site._registry:
            app_label = model._meta.app_label
            if app_label not in APP_CATEGORIES:
                continue

            has_college = any(f.name == 'college' for f in model._meta.get_fields())
            if not has_college:
                continue

            if app_label not in sections_dict:
                cat_info = APP_CATEGORIES[app_label]
                sections_dict[app_label] = {
                    'title': cat_info['title'],
                    'icon': cat_info['icon'],
                    'color': cat_info['color'],
                    'models': []
                }

            model_name = model.__name__
            model_path = f"{app_label}.{model_name}"
            
            label = str(model._meta.verbose_name_plural)
            if label.islower():
                label = label.title()
            elif len(label) > 0 and label[0].islower():
                label = label[0].upper() + label[1:]

            sections_dict[app_label]['models'].append({
                'label': label,
                'count': count(model_path),
                'url': url(app_label, model_name)
            })

        for sec in sections_dict.values():
            sec['models'].sort(key=lambda x: x['label'])

        sections = sorted(sections_dict.values(), key=lambda x: x['title'])

        context = {
            **self.admin_site.each_context(request),
            'college': college,
            'features_on': features_on,
            'features_off': features_off,
            'sections': sections,
            'title': f'Dashboard — {college.short_name or college.name}',
            'opts': self.model._meta,
        }
        return render(request, 'admin/college/college/dashboard.html', context)

    # ------------------------------------------------------------------
    # Excel upload
    # ------------------------------------------------------------------

    def upload_excel_view(self, request: HttpRequest) -> HttpResponse:
        if not self.has_change_permission(request):
            raise PermissionError('Forbidden')

        if request.method == 'POST':
            form = CollegeUploadExcelForm(request.POST, request.FILES)
            if form.is_valid():
                f = form.cleaned_data['file']
                name = getattr(f, 'name', '') or ''
                if not name.lower().endswith('.xlsx'):
                    messages.error(request, 'Please upload an .xlsx Excel file.')
                    return redirect('admin:college_college_upload_excel')

                try:
                    content = f.read()
                    wb = _load_workbook(filename=BytesIO(content), read_only=True, data_only=True)
                    ws = wb.active
                except Exception:
                    messages.error(request, 'Failed to read Excel file. Ensure it is a valid .xlsx file.')
                    return redirect('admin:college_college_upload_excel')

                created = 0
                updated = 0
                skipped = 0
                total = 0

                first = True
                for row in ws.iter_rows(min_row=1, values_only=True):
                    total += 1
                    code = _cell_to_str(row[0] if len(row) > 0 else '')
                    college_name = _cell_to_str(row[1] if len(row) > 1 else '')

                    if first and _is_header_row(code, college_name):
                        first = False
                        skipped += 1
                        continue
                    first = False

                    if not code or not college_name:
                        skipped += 1
                        continue

                    obj = College.objects.filter(code=code).first()
                    if obj is None:
                        College.objects.create(code=code, name=college_name, is_active=True)
                        created += 1
                    else:
                        if (obj.name or '').strip() != college_name:
                            obj.name = college_name
                            obj.save()
                            updated += 1

                messages.success(
                    request,
                    f'College import complete. Created: {created}, Updated: {updated}, Skipped: {skipped} (Rows: {total}).',
                )
                return redirect('admin:college_college_changelist')
        else:
            form = CollegeUploadExcelForm()

        context = {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'form': form,
            'title': 'Upload Colleges Excel',
        }
        return render(request, 'admin/college/college/upload_excel.html', context)


# ---------------------------------------------------------------------------
# Feature Catalog
# ---------------------------------------------------------------------------

@admin.register(FeatureCatalog)
class FeatureCatalogAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'category', 'is_default', 'sort_order', 'applicable_roles')
    list_filter = ('category', 'is_default')
    search_fields = ('code', 'name', 'description', 'applicable_roles', 'sidebar_keys')
    ordering = ('sort_order', 'category', 'name')
    list_editable = ('is_default', 'sort_order')
    filter_horizontal = ('permissions',)
    fieldsets = (
        (None, {
            'fields': ('code', 'name', 'description', 'category', 'icon'),
        }),
        ('Defaults & Ordering', {
            'fields': ('is_default', 'sort_order'),
        }),
        ('Mapping', {
            'fields': ('applicable_roles', 'sidebar_keys', 'permissions'),
            'description': 'Comma-separated values linking features to user roles and sidebar keys.',
        }),
    )


# ---------------------------------------------------------------------------
# College Feature
# ---------------------------------------------------------------------------

@admin.register(CollegeFeature)
class CollegeFeatureAdmin(admin.ModelAdmin):
    list_display = ('college', 'feature', 'is_enabled', 'enabled_at', 'disabled_at')
    list_filter = ('is_enabled', 'college', 'feature__category')
    search_fields = ('college__code', 'college__name', 'feature__code', 'feature__name')
    list_editable = ('is_enabled',)
    autocomplete_fields = ('college', 'feature')
    ordering = ('college__code', 'feature__sort_order')
