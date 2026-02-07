from django.contrib import admin
from .models import CurriculumMaster, CurriculumDepartment, ElectiveSubject, ElectiveChoice
from django.urls import path
from django.template.response import TemplateResponse
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import redirect
from django.contrib import messages
from django.db import transaction
import csv, io
from academics.models import Department


@admin.register(CurriculumMaster)
class CurriculumMasterAdmin(admin.ModelAdmin):
    change_list_template = 'admin/curriculum/master_change_list.html'
    list_display = ('regulation', 'semester', 'course_code', 'course_name', 'category', 'class_type', 'is_elective', 'for_all_departments', 'editable')
    list_filter = ('regulation', 'semester', 'for_all_departments', 'editable')
    search_fields = ('course_code', 'course_name')
    filter_horizontal = ('departments',)
    actions = ['propagate_to_departments']

    def get_urls(self):
        urls = super().get_urls()
        my_urls = [
            path('import-csv/', self.admin_site.admin_view(self.import_csv), name='curriculum_master_import'),
            path('download-template/', self.admin_site.admin_view(self.download_template), name='curriculum_master_template'),
        ]
        return my_urls + urls

    def download_template(self, request):
        """Return a CSV template for bulk import."""
        headers = ['regulation','semester','course_code','course_name','category','class_type','l','t','p','s','c','internal_mark','external_mark','for_all_departments','editable','departments']
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        # example row: applies to selected departments (three codes) and NOT to all
        # writer will quote fields that contain commas automatically; list the codes plainly
        writer.writerow(['2024','1','CS101','Introduction to CS','CORE','THEORY','3','0','0','0','3','30','70','False','False','042,205,148'])
        resp = HttpResponse(output.getvalue(), content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename=curriculum_master_template.csv'
        return resp

    def import_csv(self, request):
        context = dict(self.admin_site.each_context(request))
        if request.method == 'POST':
            uploaded = request.FILES.get('csv_file')
            if not uploaded:
                self.message_user(request, 'No file uploaded', level=messages.ERROR)
                return HttpResponseRedirect(request.path)

            try:
                data = uploaded.read().decode('utf-8')
                reader = csv.DictReader(io.StringIO(data))
            except Exception as e:
                self.message_user(request, f'Failed to read CSV: {e}', level=messages.ERROR)
                return HttpResponseRedirect(request.path)

            created = 0
            updated = 0
            errors = []
            with transaction.atomic():
                for idx, row in enumerate(reader, start=1):
                    try:
                        # Basic required fields
                        reg = row.get('regulation') or ''
                        sem_raw = (row.get('semester') or '').strip()
                        # accept values like '2', 'Sem 2', 'sem 2' -> extract first integer
                        import re
                        m = re.search(r"(\d+)", sem_raw)
                        sem_num = int(m.group(1)) if m else 0
                        if not reg or sem_num <= 0:
                            raise ValueError('regulation and semester required')
                        # resolve Semester instance
                        from academics.models import Semester
                        semester_obj, _ = Semester.objects.get_or_create(number=sem_num)

                        # find existing by regulation+semester + either course_code (preferred)
                        # or, when course_code is missing, match by course_name (case-insensitive)
                        cc = row.get('course_code') or None
                        cname = (row.get('course_name') or '').strip() or None
                        instance = None
                        if cc:
                            instance = CurriculumMaster.objects.filter(regulation=reg, semester__number=sem_num, course_code=cc).first()
                        else:
                            # If course_code is not provided, try to match a master with NULL course_code
                            # and the same course_name. If course_name is also missing, don't match to avoid
                            # repeatedly updating the first row for a regulation+semester.
                            if cname:
                                instance = CurriculumMaster.objects.filter(
                                    regulation=reg, semester__number=sem_num, course_code__isnull=True, course_name__iexact=cname
                                ).first()
                            else:
                                instance = None

                        vals = {
                            'regulation': reg,
                            'semester': semester_obj,
                            'course_code': cc,
                            'course_name': row.get('course_name') or None,
                            'category': row.get('category') or '',
                            'class_type': row.get('class_type') or 'THEORY',
                            'l': int(row.get('l') or 0),
                            't': int(row.get('t') or 0),
                            'p': int(row.get('p') or 0),
                            's': int(row.get('s') or 0),
                            'c': int(row.get('c') or 0),
                            'internal_mark': int(row.get('internal_mark') or 0),
                            'external_mark': int(row.get('external_mark') or 0),
                            'for_all_departments': (str(row.get('for_all_departments') or '').strip().lower() in ('1','true','yes')),
                            'editable': (str(row.get('editable') or '').strip().lower() in ('1','true','yes')),
                        }

                        if instance:
                            for k, v in vals.items():
                                setattr(instance, k, v)
                            instance.save()
                            updated += 1
                        else:
                            instance = CurriculumMaster.objects.create(**vals)
                            created += 1

                        # departments field: comma-separated department codes or ids
                        deps = (row.get('departments') or '')
                        if deps:
                            # normalize and accept comma or semicolon separators; strip surrounding quotes
                            raw = deps.strip().strip('"').strip("'")
                            # split on comma or semicolon
                            dep_list = [d.strip() for d in __import__('re').split(r'[;,]\s*', raw) if d.strip()]
                            dep_objs = []
                            unmatched = []
                            for d in dep_list:
                                try:
                                    # Try department code match first (codes like '042'), then numeric id
                                    dep = Department.objects.filter(code__iexact=d).first()
                                    if not dep and d.isdigit():
                                        dep = Department.objects.filter(id=int(d)).first()
                                    if dep:
                                        dep_objs.append(dep)
                                    else:
                                        unmatched.append(d)
                                except Exception:
                                    unmatched.append(d)
                            if dep_objs:
                                instance.departments.set(dep_objs)
                                instance.for_all_departments = False
                                instance.save()
                            if unmatched:
                                # surface unmatched department tokens as admin messages for troubleshooting
                                self.message_user(request, f'Row {idx}: unmatched departments: {",".join(unmatched)}', level=messages.WARNING)
                    except Exception as e:
                        errors.append(f'Row {idx}: {e}')

            msg = f'Import finished: {created} created, {updated} updated.'
            if errors:
                msg += f' {len(errors)} errors.'
                for err in errors[:10]:
                    self.message_user(request, err, level=messages.ERROR)
            self.message_user(request, msg)
            return redirect('admin:curriculum_curriculummaster_changelist')

        # GET: render upload form
        context.update({ 'opts': self.model._meta })
        return TemplateResponse(request, 'admin/curriculum/master_import.html', context)

    def propagate_to_departments(self, request, queryset):
        # trigger save() to cause post_save propagation for selected masters
        for obj in queryset:
            obj.save()
        self.message_user(request, f"Triggered propagation for {queryset.count()} master(s)")
    propagate_to_departments.short_description = 'Propagate selected masters to departments'


@admin.register(CurriculumDepartment)
class CurriculumDepartmentAdmin(admin.ModelAdmin):
    list_display = ('department', 'regulation', 'semester', 'course_code', 'course_name', 'is_elective', 'editable', 'overridden')
    list_filter = ('department', 'regulation', 'semester', 'is_elective', 'editable', 'overridden')
    search_fields = ('course_code', 'course_name')

    def get_readonly_fields(self, request, obj=None):
        # If this department row is linked to a master which is not editable,
        # show core curriculum fields as read-only in admin to prevent edits.
        ro = list(super().get_readonly_fields(request, obj))
        if obj and obj.master and not getattr(obj.master, 'editable', False):
            ro += [
                'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category', 'is_elective',
                'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
                'total_hours', 'question_paper_type',
            ]
        return ro

    def has_change_permission(self, request, obj=None):
        # Allow viewing in admin but prevent save via admin form if master is not editable.
        if obj and obj.master and not getattr(obj.master, 'editable', False):
            # still allow access to change page (read-only), but block POSTs via form
            if request.method != 'GET':
                return False
        return super().has_change_permission(request, obj=obj)


class ElectiveSubjectInline(admin.TabularInline):
    model = ElectiveSubject
    extra = 0
    fields = ('course_code', 'course_name', 'is_elective', 'class_type', 'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark', 'total_hours', 'question_paper_type', 'editable', 'approval_status')
    readonly_fields = ('approval_status',)


@admin.register(ElectiveSubject)
class ElectiveSubjectAdmin(admin.ModelAdmin):
    list_display = ('course_code', 'course_name', 'department', 'parent', 'regulation', 'semester', 'is_elective', 'editable', 'approval_status')
    list_filter = ('department', 'regulation', 'semester', 'is_elective', 'approval_status')
    search_fields = ('course_code', 'course_name')


@admin.register(ElectiveChoice)
class ElectiveChoiceAdmin(admin.ModelAdmin):
    list_display = ('student', 'elective_subject', 'academic_year', 'is_active')
    list_filter = ('academic_year', 'is_active')
    search_fields = ('student__user__username', 'student__reg_no', 'elective_subject__course_code', 'elective_subject__course_name')
