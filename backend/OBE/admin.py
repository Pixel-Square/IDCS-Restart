from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered
from django.http import Http404
from django.template.response import TemplateResponse
from django.urls import path
from django.urls import reverse
from django.utils.html import format_html
from django.utils.http import urlencode
from django import forms

from .models import Cia1Mark, ObeMarkTableLock, ClassTypeWeights, FinalInternalMark
from .services.final_internal_marks import recompute_final_internal_marks


@admin.register(Cia1Mark)
class Cia1MarkAdmin(admin.ModelAdmin):
    list_display = ('subject', 'student', 'mark', 'updated_at', 'bi')
    search_fields = ('subject__code', 'student__reg_no', 'student__user__username')
    list_filter = ('subject',)

    def bi(self, obj):
        try:
            base = reverse('admin:bi_factmark_changelist')
        except Exception:
            return '-'
        qs = urlencode(
            {
                'assessment_key__exact': 'cia1',
                'subject_code__exact': getattr(getattr(obj, 'subject', None), 'code', '') or '',
                'reg_no__exact': getattr(getattr(obj, 'student', None), 'reg_no', '') or '',
            }
        )
        return format_html('<a href="{}?{}" title="Open in BI">📊 BI</a>', base, qs)

    bi.short_description = 'BI'


@admin.register(ObeMarkTableLock)
class ObeMarkTableLockAdmin(admin.ModelAdmin):
    list_display = (
        'bi',
        'assessment',
        'subject_code',
        'section_name',
        'staff_user',
        'is_published',
        'mark_entry_blocked',
        'mark_manager_locked',
        'updated_at',
    )
    search_fields = ('subject_code', 'subject_name', 'section_name', 'staff_user__username')
    list_filter = ('assessment', 'is_published', 'mark_entry_blocked', 'mark_manager_locked')
    raw_id_fields = ('staff_user', 'teaching_assignment', 'academic_year')
    readonly_fields = ('created_at', 'updated_at')

    def bi(self, obj):
        try:
            base = reverse('admin:bi_factmark_changelist')
        except Exception:
            return '-'
        qs = urlencode(
            {
                'assessment_key__exact': str(getattr(obj, 'assessment', '') or '').strip().lower(),
                'subject_code__exact': str(getattr(obj, 'subject_code', '') or '').strip(),
            }
        )
        return format_html('<a href="{}?{}" title="Open marks in BI">📊 BI</a>', base, qs)

    bi.short_description = 'BI'
from .models import CdapRevision, CdapActiveLearningAnalysisMapping

@admin.register(CdapRevision)
class CdapRevisionAdmin(admin.ModelAdmin):
    list_display = ('subject_id', 'status', 'updated_at')
    search_fields = ('subject_id', 'status')
    readonly_fields = ('created_at', 'updated_at')




@admin.register(CdapActiveLearningAnalysisMapping)
class CdapActiveLearningAnalysisMappingAdmin(admin.ModelAdmin):
    list_display = ('id', 'updated_at')
    readonly_fields = ('updated_at',)


# ---------------------------------------------------------------------------
# ClassTypeWeights – explicit admin with human-readable field labels and a
# structured display of the internal_mark_weights slot array.
# ---------------------------------------------------------------------------

class ClassTypeWeightsAdminForm(forms.ModelForm):
    """Override field labels so the admin shows 'SSA', 'CIA', 'LAB' instead of
    the raw model field names ssa1 / cia1 / formative1."""

    class Meta:
        model = ClassTypeWeights
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['ssa1'].label = 'SSA Weight'
        self.fields['cia1'].label = 'CIA Weight'
        self.fields['formative1'].label = 'LAB / Review / Formative Weight'


@admin.register(ClassTypeWeights)
class ClassTypeWeightsAdmin(admin.ModelAdmin):
    form = ClassTypeWeightsAdminForm

    list_display = ('class_type', 'ssa1', 'cia1', 'formative1', 'updated_at', 'updated_by')
    search_fields = ('class_type',)
    readonly_fields = ('internal_mark_weights_display', 'updated_at')

    fieldsets = (
        ('Class Type', {
            'fields': ('class_type',),
        }),
        ('CO Attainment Weights', {
            'description': (
                'Top-level weights used in CO attainment blending. '
                '<b>SSA</b> = SSA quiz, <b>CIA</b> = CIA exam, '
                '<b>LAB / Review / Formative</b> = third component label depends on class type.'
            ),
            'fields': ('ssa1', 'cia1', 'formative1'),
        }),
        ('Internal Mark Weights (per slot)', {
            'description': (
                'Per-slot weights used in Internal Mark calculation. '
                'TCPL uses 21 slots (4 × CO group of SSA / CIA / LAB / CIA-Exam + 5 ME columns). '
                'All other class types use 17 slots (4 × CO group of SSA / CIA / Formative + 5 ME columns). '
                '<br><b>To edit raw values use the JSON field below the table.</b>'
            ),
            'fields': ('internal_mark_weights_display', 'internal_mark_weights'),
        }),
        ('Audit', {
            'fields': ('updated_by', 'updated_at'),
        }),
    )

    def internal_mark_weights_display(self, obj):
        """Render the internal_mark_weights array as a readable HTML table."""
        arr = obj.internal_mark_weights
        ct = str(obj.class_type or '').strip().upper()

        if not isinstance(arr, list) or not arr:
            return format_html('<em>No weights stored yet.</em>')

        is_tcpl = ct == 'TCPL'
        is_lab = ct in ('LAB', 'PRACTICAL')

        # ------------------------------------------------------------------ #
        # TCPL – 21 slots: CO1-4 each have SSA / CIA / LAB / CIA-Exam, then 5 ME
        # ------------------------------------------------------------------ #
        if is_tcpl:
            rows_html = ''
            for co_idx in range(4):
                base = co_idx * 4
                co_num = co_idx + 1
                lab_label = 'LAB 1' if co_num <= 2 else 'LAB 2'
                ssa = arr[base] if base < len(arr) else '—'
                cia = arr[base + 1] if base + 1 < len(arr) else '—'
                lab = arr[base + 2] if base + 2 < len(arr) else '—'
                cia_exam = arr[base + 3] if base + 3 < len(arr) else '—'
                ssa_label = 'SSA 1' if co_num <= 2 else 'SSA 2'
                cia_label = 'CIA 1' if co_num <= 2 else 'CIA 2'
                rows_html += (
                    f'<tr><th style="padding:4px 10px;background:#f0f4ff;text-align:left">CO{co_num}</th>'
                    f'<td style="padding:4px 10px"><b>{ssa_label}</b>: {ssa}</td>'
                    f'<td style="padding:4px 10px"><b>{cia_label}</b>: {cia}</td>'
                    f'<td style="padding:4px 10px"><b>{lab_label}</b>: {lab}</td>'
                    f'<td style="padding:4px 10px"><b>CIA Exam</b>: {cia_exam}</td></tr>'
                )
            # ME block starts at index 16
            me_vals = arr[16:21] if len(arr) >= 21 else arr[16:]
            me_cells = ''.join(
                f'<td style="padding:4px 10px"><b>CO{i+1}</b>: {v}</td>'
                for i, v in enumerate(me_vals)
            )
            rows_html += f'<tr><th style="padding:4px 10px;background:#f0f4ff;text-align:left">ME</th>{me_cells}</tr>'
            return format_html(
                '<table style="border-collapse:collapse;border:1px solid #ccc;font-size:13px">'
                '<thead><tr>'
                '<th style="padding:4px 10px;background:#e8eaf6"></th>'
                '<th style="padding:4px 10px;background:#e8eaf6">SSA</th>'
                '<th style="padding:4px 10px;background:#e8eaf6">CIA</th>'
                '<th style="padding:4px 10px;background:#e8eaf6">LAB</th>'
                '<th style="padding:4px 10px;background:#e8eaf6">CIA Exam</th>'
                '</tr></thead><tbody>{}</tbody></table>',
                format_html(rows_html),
            )

        # ------------------------------------------------------------------ #
        # LAB / PRACTICAL – only CIA columns + MODEL slot matter
        # ------------------------------------------------------------------ #
        if is_lab:
            rows_html = ''
            co_slots = [(0, 1, 'CO1', 'CIA 1'), (1, 4, 'CO2', 'CIA 1'), (2, 7, 'CO3', 'CIA 2'), (3, 10, 'CO4', 'CIA 2')]
            for _, idx, co_label, cia_label in co_slots:
                val = arr[idx] if idx < len(arr) else '—'
                rows_html += (
                    f'<tr><th style="padding:4px 10px;background:#f0f4ff;text-align:left">{co_label}</th>'
                    f'<td style="padding:4px 10px"><b>{cia_label}</b>: {val}</td></tr>'
                )
            me_val = arr[16] if len(arr) > 16 else '—'
            rows_html += (
                f'<tr><th style="padding:4px 10px;background:#f0f4ff;text-align:left">ME</th>'
                f'<td style="padding:4px 10px"><b>MODEL</b>: {me_val}</td></tr>'
            )
            return format_html(
                '<table style="border-collapse:collapse;border:1px solid #ccc;font-size:13px">'
                '<thead><tr>'
                '<th style="padding:4px 10px;background:#e8eaf6"></th>'
                '<th style="padding:4px 10px;background:#e8eaf6">CIA / MODEL</th>'
                '</tr></thead><tbody>{}</tbody></table>',
                format_html(rows_html),
            )

        # ------------------------------------------------------------------ #
        # Generic 17-slot: CO1-4 each have SSA / CIA / FA, then 5 ME
        # ------------------------------------------------------------------ #
        ct_is_tcpr = ct == 'TCPR'
        rows_html = ''
        for co_idx in range(4):
            co_num = co_idx + 1
            base = co_idx * 3
            ssa_label = 'SSA 1' if co_num <= 2 else 'SSA 2'
            cia_label = 'CIA 1' if co_num <= 2 else 'CIA 2'
            fa_label = ('Review 1' if co_num <= 2 else 'Review 2') if ct_is_tcpr else ('Formative 1' if co_num <= 2 else 'Formative 2')
            ssa = arr[base] if base < len(arr) else '—'
            cia = arr[base + 1] if base + 1 < len(arr) else '—'
            fa = arr[base + 2] if base + 2 < len(arr) else '—'
            rows_html += (
                f'<tr><th style="padding:4px 10px;background:#f0f4ff;text-align:left">CO{co_num}</th>'
                f'<td style="padding:4px 10px"><b>{ssa_label}</b>: {ssa}</td>'
                f'<td style="padding:4px 10px"><b>{cia_label}</b>: {cia}</td>'
                f'<td style="padding:4px 10px"><b>{fa_label}</b>: {fa}</td></tr>'
            )
        me_vals = arr[12:17] if len(arr) >= 17 else arr[12:]
        me_cells = ''.join(
            f'<td style="padding:4px 10px"><b>CO{i+1}</b>: {v}</td>'
            for i, v in enumerate(me_vals)
        )
        rows_html += f'<tr><th style="padding:4px 10px;background:#f0f4ff;text-align:left">ME</th>{me_cells}</tr>'
        fa_header = 'Review' if ct_is_tcpr else 'Formative'
        return format_html(
            '<table style="border-collapse:collapse;border:1px solid #ccc;font-size:13px">'
            '<thead><tr>'
            '<th style="padding:4px 10px;background:#e8eaf6"></th>'
            '<th style="padding:4px 10px;background:#e8eaf6">SSA</th>'
            '<th style="padding:4px 10px;background:#e8eaf6">CIA</th>'
            '<th style="padding:4px 10px;background:#e8eaf6">{}</th>'
            '</tr></thead><tbody>{}</tbody></table>',
            fa_header,
            format_html(rows_html),
        )

    internal_mark_weights_display.short_description = 'Internal Mark Weights (structured view)'


@admin.register(FinalInternalMark)
class FinalInternalMarkAdmin(admin.ModelAdmin):
    list_display = (
        'student_summary_link',
        'course_code',
        'course_name',
        'section_name',
        'final_mark_display',
        'max_mark',
        'computed_from',
        'computed_by',
        'computed_at',
    )
    list_filter = ('subject__semester', 'subject', 'teaching_assignment__academic_year')
    search_fields = (
        'student__reg_no',
        'student__user__username',
        'student__user__first_name',
        'student__user__last_name',
        'subject__code',
        'subject__name',
    )
    readonly_fields = ('created_at', 'computed_at')
    actions = ('recompute_final_internal_marks_action',)

    def _get_role_names(self, user):
        try:
            return {str(n).strip().upper() for n in user.user_roles.values_list('role__name', flat=True)}
        except Exception:
            return set()

    def _can_view_final_internal_marks(self, request):
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_active', False) or not getattr(user, 'is_staff', False):
            return False
        if getattr(user, 'is_superuser', False):
            return True

        # This project uses custom role-based permissions via accounts.Permission.
        if user.has_perm('obe.view') or user.has_perm('obe.master.manage'):
            return True

        role_names = self._get_role_names(user)
        return bool(role_names & {'IQAC', 'ADMIN', 'HOD', 'AHOD', 'FACULTY', 'ADVISOR', 'STAFF'})

    def has_module_permission(self, request):
        return self._can_view_final_internal_marks(request)

    def has_view_permission(self, request, obj=None):
        return self._can_view_final_internal_marks(request)

    def has_add_permission(self, request):
        # FinalInternalMark rows are generated by sync/recompute; avoid manual add.
        return False

    def has_change_permission(self, request, obj=None):
        user = getattr(request, 'user', None)
        if not self._can_view_final_internal_marks(request):
            return False
        if not user:
            return False
        return bool(getattr(user, 'is_superuser', False) or user.has_perm('obe.master.manage'))

    def has_delete_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('student__user', 'subject', 'teaching_assignment__section')

    def student_summary_link(self, obj):
        sid = getattr(obj, 'student_id', None)
        if not sid:
            return '-'
        try:
            url = reverse('admin:obe_finalinternalmark_student_summary', args=[sid])
        except Exception:
            return str(getattr(obj, 'student', '-') or '-')
        reg = getattr(getattr(obj, 'student', None), 'reg_no', '') or ''
        user = getattr(getattr(obj, 'student', None), 'user', None)
        name = (f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}".strip() if user else '') or getattr(user, 'username', '')
        label = f"{reg} - {name}".strip(' -')
        return format_html('<a href="{}">{}</a>', url, label or sid)

    student_summary_link.short_description = 'Student'

    def course_code(self, obj):
        return getattr(getattr(obj, 'subject', None), 'code', '-')

    course_code.short_description = 'Course Code'

    def course_name(self, obj):
        return getattr(getattr(obj, 'subject', None), 'name', '-')

    course_name.short_description = 'Course Name'

    def section_name(self, obj):
        return getattr(getattr(getattr(obj, 'teaching_assignment', None), 'section', None), 'name', '-')

    section_name.short_description = 'Section'

    def final_mark_display(self, obj):
        val = getattr(obj, 'final_mark', None)
        return '-' if val is None else val

    final_mark_display.short_description = 'Final Mark'
    final_mark_display.admin_order_field = 'final_mark'

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                'student/<int:student_id>/',
                self.admin_site.admin_view(self.student_summary_view),
                name='obe_finalinternalmark_student_summary',
            )
        ]
        return custom + urls

    def student_summary_view(self, request, student_id: int):
        qs = (
            FinalInternalMark.objects.filter(student_id=student_id)
            .select_related('student__user', 'subject', 'teaching_assignment__section')
            .order_by('subject__code', 'teaching_assignment_id')
        )
        if not qs.exists():
            raise Http404('No final internal marks found for this student.')

        first = qs.first()
        student = getattr(first, 'student', None)
        context = {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'title': 'Student Final Internal Marks',
            'student': student,
            'rows': qs,
        }
        return TemplateResponse(request, 'admin/OBE/finalinternalmark/student_summary.html', context)

    def recompute_final_internal_marks_action(self, request, queryset):
        result = recompute_final_internal_marks(actor_user_id=getattr(request.user, 'id', None))
        self.message_user(
            request,
            (
                f"Final internal marks synced: "
                f"TAs={result.get('processed_teaching_assignments', 0)}, "
                f"rows={result.get('upserted_rows', 0)}, "
                f"deleted={result.get('deleted_rows', 0)}"
            ),
        )

    recompute_final_internal_marks_action.short_description = 'Recompute stored final internal marks (all active assignments)'


# ---------------------------------------------------------------------------
# Register any remaining OBE models that don't have explicit admin classes above.
# ---------------------------------------------------------------------------
obe_app_config = next((cfg for cfg in apps.get_app_configs() if cfg.name == 'OBE'), None)


def _build_default_admin(model):
    field_names = {f.name for f in model._meta.fields}

    list_display_candidates = [
        'id',
        'assessment',
        'subject',
        'subject_code',
        'section_name',
        'student',
        'staff_user',
        'mark',
        'status',
        'updated_at',
        'created_at',
    ]
    list_display = tuple(name for name in list_display_candidates if name in field_names) or ('id',)

    list_filter_candidates = ['assessment', 'status', 'is_published', 'created_at', 'updated_at']
    list_filter = tuple(name for name in list_filter_candidates if name in field_names)

    search_fields = []
    if 'subject_code' in field_names:
        search_fields.append('subject_code')
    if 'section_name' in field_names:
        search_fields.append('section_name')
    if 'status' in field_names:
        search_fields.append('status')
    if 'assessment' in field_names:
        search_fields.append('assessment')
    if 'subject' in field_names:
        search_fields.extend(['subject__code', 'subject__name'])
    if 'student' in field_names:
        search_fields.extend([
            'student__reg_no',
            'student__user__username',
            'student__user__first_name',
            'student__user__last_name',
        ])
    if 'staff_user' in field_names:
        search_fields.append('staff_user__username')

    readonly_fields = tuple(name for name in ('created_at', 'updated_at') if name in field_names)

    attrs = {
        'list_display': list_display,
        'list_filter': list_filter,
        'search_fields': tuple(search_fields),
        'readonly_fields': readonly_fields,
    }
    return type(f'{model.__name__}AutoAdmin', (admin.ModelAdmin,), attrs)


if obe_app_config:
    for model in obe_app_config.get_models():
        if model not in admin.site._registry:
            try:
                admin.site.register(model, _build_default_admin(model))
            except AlreadyRegistered:
                pass
