from __future__ import annotations

from io import BytesIO

from django import forms
from django.contrib import admin, messages
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render
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
    # Normalize common numeric cases like 12.0 -> "12"
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


@admin.register(College)
class CollegeAdmin(admin.ModelAdmin):
    list_display = ('code', 'short_name', 'name', 'city', 'is_active')
    search_fields = ('code', 'short_name', 'name', 'city')
    list_filter = ('is_active', 'city')
    inlines = [CollegeFeatureInline]

    change_list_template = 'admin/college/college/change_list.html'

    def get_urls(self):
        urls = super().get_urls()
        my_urls = [
            path(
                'upload-excel/',
                self.admin_site.admin_view(self.upload_excel_view),
                name='college_college_upload_excel',
            ),
        ]
        return my_urls + urls

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
# Feature Catalog — master list of all toggleable modules
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
            'description': 'Comma-separated values linking features to user roles and sidebar keys. Plus explicit permission mapping.',
        }),
    )


# ---------------------------------------------------------------------------
# College Feature — per-college toggle state
# ---------------------------------------------------------------------------

@admin.register(CollegeFeature)
class CollegeFeatureAdmin(admin.ModelAdmin):
    list_display = ('college', 'feature', 'is_enabled', 'enabled_at', 'disabled_at')
    list_filter = ('is_enabled', 'college', 'feature__category')
    search_fields = ('college__code', 'college__name', 'feature__code', 'feature__name')
    list_editable = ('is_enabled',)
    autocomplete_fields = ('college', 'feature')
    ordering = ('college__code', 'feature__sort_order')
