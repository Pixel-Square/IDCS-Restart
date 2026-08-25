from collections import OrderedDict
import os
import mimetypes
import re
from urllib.parse import quote

from django.http import FileResponse
from django.core import signing
from django.urls import reverse
from django.db.models import Sum
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import StudentCourseEnrollment
from academics.utils import get_user_staff_profile
from lms.models import StaffStorageQuota, StudyMaterial, StudyMaterialDownloadLog
from lms.permissions import get_hod_department_ids, is_hod_or_ahod_user, is_iqac_user
from lms.serializers import (
    StaffQuotaSerializer,
    StudyMaterialCreateSerializer,
    StudyMaterialDownloadLogSerializer,
    StudyMaterialSerializer,
)


OFFICE_PREVIEW_EXTENSIONS = {'.pptx', '.docx', '.xlsx'}
OFFICE_PREVIEW_TOKEN_SALT = 'lms-office-preview'
OFFICE_PREVIEW_TOKEN_MAX_AGE_SECONDS = 10 * 60


def _get_client_ip(request):
    xff = str(request.META.get('HTTP_X_FORWARDED_FOR', '') or '').strip()
    if xff:
        return xff.split(',')[0].strip()
    return str(request.META.get('REMOTE_ADDR', '') or '').strip() or None


def _can_access_material(user, material: StudyMaterial) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True

    if is_iqac_user(user):
        return True

    staff_profile = get_user_staff_profile(user)
    if staff_profile is not None:
        if material.uploaded_by_id == staff_profile.id:
            return True
        if is_hod_or_ahod_user(user):
            dept_ids = get_hod_department_ids(user)
            if material.uploaded_by and material.uploaded_by.department_id in dept_ids:
                return True

    student_profile = getattr(user, 'student_profile', None)
    if student_profile is not None:
        enrolled_ids = set(
            StudentCourseEnrollment.objects.filter(student=student_profile).values_list('course_id', flat=True)
        )
        try:
            section = student_profile.current_section
        except Exception:
            section = getattr(student_profile, 'section', None)
        try:
            if section and section.batch and section.batch.course_id:
                enrolled_ids.add(section.batch.course_id)
        except Exception:
            pass
        return material.course_id in enrolled_ids

    return False


def _group_materials_by_course(materials_qs, *, serializer_context):
    data = StudyMaterialSerializer(materials_qs, many=True, context=serializer_context).data
    grouped = OrderedDict()
    for item in data:
        cid = item.get('course')
        if cid not in grouped:
            grouped[cid] = {
                'course_id': cid,
                'course_name': item.get('course_name'),
                'department_code': item.get('department_code'),
                'materials': [],
            }
        grouped[cid]['materials'].append(item)
    return list(grouped.values())


def _resolve_material_filename(material: StudyMaterial) -> str:
    stored_name = os.path.basename(str(getattr(material.file, 'name', '') or '').strip())
    stored_ext = os.path.splitext(stored_name)[1]
    original_name = str(getattr(material, 'original_file_name', '') or '').strip()
    title_name = str(getattr(material, 'title', '') or '').strip()

    safe_name = original_name
    if not safe_name and title_name:
        if stored_ext and not title_name.lower().endswith(stored_ext.lower()):
            safe_name = f"{title_name}{stored_ext}"
        else:
            safe_name = title_name

    return safe_name or stored_name or 'study-material'


def _resolve_material_extension(material: StudyMaterial) -> str:
    safe_name = _resolve_material_filename(material)
    return str(os.path.splitext(safe_name)[1] or '').lower()


class StaffMaterialListCreateView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        staff_profile = get_user_staff_profile(request.user)
        if staff_profile is None:
            raise PermissionDenied('Staff access only.')

        qs = StudyMaterial.objects.filter(uploaded_by=staff_profile).select_related(
            'uploaded_by__user',
            'course__department',
            'teaching_assignment',
            'curriculum_row',
            'elective_subject',
        )
        course_id = request.query_params.get('course_id')
        if course_id:
            try:
                qs = qs.filter(course_id=int(course_id))
            except Exception:
                pass

        grouped = _group_materials_by_course(qs.order_by('course__name', '-created_at'), serializer_context={'request': request})
        return Response({'results': grouped})

    def post(self, request):
        serializer = StudyMaterialCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return Response(StudyMaterialSerializer(obj, context={'request': request}).data, status=status.HTTP_201_CREATED)


class StaffUploadOptionsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        staff_profile = get_user_staff_profile(request.user)
        if staff_profile is None:
            raise PermissionDenied('Staff access only.')

        from academics.models import AcademicYear, Course, StudentProfile, StudentSubjectBatch, TeachingAssignment
        from curriculum.models import ElectiveChoice
        from timetable.models import TimetableAssignment

        base_qs = TeachingAssignment.objects.filter(
            staff=staff_profile,
        ).select_related(
            'subject__course',
            'section__batch__course',
            'curriculum_row',
            'elective_subject',
            'academic_year',
        ).order_by('id')

        qs = base_qs.filter(
            staff=staff_profile,
            is_active=True,
        )

        try:
            if qs.filter(academic_year__is_active=True).exists():
                qs = qs.filter(academic_year__is_active=True)
        except Exception:
            pass

        if not qs.exists():
            try:
                from academics.views import _ensure_teaching_assignments_from_subject_batches

                _ensure_teaching_assignments_from_subject_batches(staff_profile)
                qs = base_qs.filter(is_active=True)
                try:
                    if qs.filter(academic_year__is_active=True).exists():
                        qs = qs.filter(academic_year__is_active=True)
                except Exception:
                    pass
            except Exception:
                pass

        # Fallback path for users who are assigned only via subject batches.
        # Create or reuse minimal teaching assignments so upload can proceed.
        batch_qs = StudentSubjectBatch.objects.filter(
            staff=staff_profile,
            is_active=True,
            curriculum_row__isnull=False,
        ).select_related('curriculum_row', 'section', 'academic_year').order_by('id')

        active_ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()

        for sb in batch_qs:
            section_obj = getattr(sb, 'section', None)
            if section_obj is None:
                try:
                    tt = TimetableAssignment.objects.filter(subject_batch=sb, section__isnull=False).select_related('section').first()
                    section_obj = getattr(tt, 'section', None)
                except Exception:
                    section_obj = None

            ay = getattr(sb, 'academic_year', None) or active_ay
            if not ay:
                continue

            try:
                TeachingAssignment.objects.get_or_create(
                    staff=staff_profile,
                    curriculum_row=sb.curriculum_row,
                    section=section_obj,
                    academic_year=ay,
                    defaults={'is_active': True},
                )
            except Exception:
                continue

        # Reload after fallback creation so dropdown includes batch-derived options.
        qs = base_qs.filter(is_active=True)
        try:
            if qs.filter(academic_year__is_active=True).exists():
                qs = qs.filter(academic_year__is_active=True)
        except Exception:
            pass

        # Final fallback: align with academics page behavior and do not hide all
        # options when flags are inconsistent.
        if not qs.exists():
            qs = base_qs

        # Preload relevant subject batches to infer course where TA has no section/subject course.
        sb_qs = StudentSubjectBatch.objects.filter(
            staff=staff_profile,
            is_active=True,
        ).select_related(
            'curriculum_row',
            'section__batch__course',
            'academic_year',
        )
        try:
            active_ay = AcademicYear.objects.filter(is_active=True).first()
            if active_ay and sb_qs.filter(academic_year=active_ay).exists():
                sb_qs = sb_qs.filter(academic_year=active_ay)
        except Exception:
            pass

        subject_batches_by_curriculum = {}
        for sb in sb_qs:
            cid = getattr(sb, 'curriculum_row_id', None)
            if not cid:
                continue
            subject_batches_by_curriculum.setdefault(int(cid), []).append(sb)

        rows = []
        seen = set()
        for ta in qs:
            candidate_courses = []

            def _add_course(course_obj):
                if not course_obj:
                    return
                if not getattr(course_obj, 'id', None):
                    return
                if any(int(getattr(x, 'id', 0)) == int(course_obj.id) for x in candidate_courses):
                    return
                candidate_courses.append(course_obj)

            try:
                if ta.section and ta.section.batch and ta.section.batch.course_id:
                    _add_course(ta.section.batch.course)
            except Exception:
                pass

            try:
                if ta.subject and ta.subject.course_id:
                    _add_course(ta.subject.course)
            except Exception:
                pass

            # Elective-only assignments often have no section/subject course link.
            # Infer candidate courses from enrolled students' sections via ElectiveChoice.
            if ta.elective_subject_id:
                try:
                    ec_qs = ElectiveChoice.objects.filter(
                        elective_subject_id=ta.elective_subject_id,
                        is_active=True,
                    ).select_related('student__section__batch__course', 'academic_year')

                    if ta.academic_year_id and ec_qs.filter(academic_year_id=ta.academic_year_id).exists():
                        ec_qs = ec_qs.filter(academic_year_id=ta.academic_year_id)

                    for ec in ec_qs[:2000]:
                        st = getattr(ec, 'student', None)
                        sec = getattr(st, 'section', None)
                        try:
                            if sec and sec.batch and sec.batch.course_id:
                                _add_course(sec.batch.course)
                        except Exception:
                            continue
                except Exception:
                    pass

                # Final fallback: use department-level courses for the elective's department.
                if not candidate_courses:
                    try:
                        dept_id = getattr(getattr(ta, 'elective_subject', None), 'department_id', None)
                        if dept_id:
                            for c in Course.objects.filter(department_id=dept_id).order_by('name')[:20]:
                                _add_course(c)
                    except Exception:
                        pass

            # Resolve from subject-batch mappings when TA lacks direct section/subject course link.
            if not candidate_courses and ta.curriculum_row_id:
                for sb in subject_batches_by_curriculum.get(int(ta.curriculum_row_id), []):
                    section_obj = getattr(sb, 'section', None)
                    try:
                        if section_obj and section_obj.batch and section_obj.batch.course_id:
                            _add_course(section_obj.batch.course)
                            continue
                    except Exception:
                        pass

                    try:
                        tt = TimetableAssignment.objects.filter(subject_batch=sb, section__isnull=False).select_related('section__batch__course').first()
                        if tt and tt.section and tt.section.batch and tt.section.batch.course_id:
                            _add_course(tt.section.batch.course)
                            continue
                    except Exception:
                        pass

                    try:
                        st = StudentProfile.objects.filter(subject_batches=sb).exclude(section_id__isnull=True).select_related('section__batch__course').first()
                        if st and st.section and st.section.batch and st.section.batch.course_id:
                            _add_course(st.section.batch.course)
                    except Exception:
                        pass

            if not candidate_courses:
                continue

            subject_code = None
            subject_name = None
            if ta.elective_subject:
                subject_code = ta.elective_subject.course_code
                subject_name = ta.elective_subject.course_name
            elif ta.curriculum_row:
                subject_code = ta.curriculum_row.course_code
                subject_name = ta.curriculum_row.course_name

            for course in candidate_courses:
                key = (ta.id, int(course.id))
                if key in seen:
                    continue
                seen.add(key)

                rows.append(
                    {
                        'teaching_assignment_id': ta.id,
                        'course_id': course.id,
                        'course_name': course.name,
                        'subject_code': subject_code,
                        'subject_name': subject_name,
                    }
                )

        return Response({'results': rows})


class StaffUploadMetadataView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        staff_profile = get_user_staff_profile(request.user)
        if staff_profile is None:
            raise PermissionDenied('Staff access only.')

        ta_id = request.query_params.get('teaching_assignment_id')
        if not ta_id:
            return Response({'detail': 'teaching_assignment_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ta_id_int = int(ta_id)
        except Exception:
            return Response({'detail': 'Invalid teaching_assignment_id.'}, status=status.HTTP_400_BAD_REQUEST)

        from academics.models import TeachingAssignment

        ta = TeachingAssignment.objects.filter(pk=ta_id_int, staff=staff_profile).select_related(
            'subject',
            'curriculum_row',
            'elective_subject',
            'academic_year',
        ).first()
        if ta is None:
            return Response({'detail': 'Teaching assignment not found.'}, status=status.HTTP_404_NOT_FOUND)

        subject_code = None
        subject_name = None
        if ta.elective_subject:
            subject_code = str(getattr(ta.elective_subject, 'course_code', '') or '').strip()
            subject_name = str(getattr(ta.elective_subject, 'course_name', '') or '').strip()
        elif ta.curriculum_row:
            subject_code = str(getattr(ta.curriculum_row, 'course_code', '') or '').strip()
            subject_name = str(getattr(ta.curriculum_row, 'course_name', '') or '').strip()
        elif ta.subject:
            subject_code = str(getattr(ta.subject, 'code', '') or '').strip()
            subject_name = str(getattr(ta.subject, 'name', '') or '').strip()

        # Return empty metadata if no subject code is mapped.
        if not subject_code:
            return Response(
                {
                    'teaching_assignment_id': ta.id,
                    'subject_code': None,
                    'subject_name': None,
                    'co_options': [],
                    'sub_topics_by_co': {},
                }
            )

        try:
            from OBE.models import CdapRevision
        except Exception:
            CdapRevision = None

        rev = None
        if CdapRevision is not None:
            rev = CdapRevision.objects.filter(subject_id=subject_code).first()

        rows = []
        if rev is not None and isinstance(rev.rows, list):
            rows = rev.rows

        # Build unit metadata so blank row-level co values inherit unit's CO.
        unit_meta = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            unit_index = row.get('unit_index')
            if unit_index in (None, ''):
                continue
            try:
                unit_key = int(unit_index)
            except Exception:
                continue

            unit_name = str(row.get('unit_name') or '').strip()
            co_raw = str(row.get('co') or '').strip().upper()
            existing = unit_meta.get(unit_key) or {'unit_name': '', 'co': ''}
            if unit_name and not existing.get('unit_name'):
                existing['unit_name'] = unit_name
            if co_raw and not existing.get('co'):
                existing['co'] = co_raw
            unit_meta[unit_key] = existing

        def _normalize_co(value):
            txt = str(value or '').strip().upper()
            if not txt:
                return ''
            m = re.search(r'CO\s*[-_]?\s*(\d+)', txt)
            if m:
                return f"CO{m.group(1)}"
            # Ignore non-CO labels like "Sub Topics - (...)" in CDAP rows.
            return ''

        co_info = {}
        sub_topics_by_co = {}

        for row in rows:
            if not isinstance(row, dict):
                continue

            unit_index = row.get('unit_index')
            try:
                unit_key = int(unit_index) if unit_index not in (None, '') else None
            except Exception:
                unit_key = None

            meta = unit_meta.get(unit_key, {}) if unit_key is not None else {}
            fallback_unit_co = f"CO{unit_key}" if unit_key else ''
            raw_row_co = row.get('co') or meta.get('co')
            row_co = _normalize_co(raw_row_co)
            if not row_co and fallback_unit_co:
                row_co = fallback_unit_co
            if not row_co:
                continue

            unit_name = str(meta.get('unit_name') or row.get('unit_name') or '').strip()
            if row_co not in co_info:
                co_info[row_co] = {
                    'co': row_co,
                    'unit_names': [],
                }
            if unit_name and unit_name not in co_info[row_co]['unit_names']:
                co_info[row_co]['unit_names'].append(unit_name)

            # Prefer sub_topics column; fallback to topics if sub_topics is blank.
            topic_txt = str(row.get('sub_topics') or '').strip()
            if not topic_txt:
                topic_txt = str(row.get('topics') or '').strip()
            if not topic_txt:
                continue

            topic_bucket = sub_topics_by_co.setdefault(row_co, [])
            if topic_txt not in topic_bucket:
                topic_bucket.append(topic_txt)

        co_options = []
        for co_key in sorted(co_info.keys(), key=lambda x: int(re.sub(r'\D', '', x) or '999')):
            unit_names = co_info[co_key]['unit_names']
            unit_label = ' / '.join(unit_names) if unit_names else 'Unit'
            co_options.append(
                {
                    'value': co_key,
                    'label': f"{co_key} - ({unit_label})",
                    'unit_names': unit_names,
                }
            )

        # If CDAP rows are unavailable, provide a best-effort single option so upload remains usable.
        if not co_options:
            fallback_label = subject_name or subject_code
            co_options = [{'value': 'CO', 'label': f"CO - ({fallback_label})", 'unit_names': []}]
            sub_topics_by_co = {'CO': []}

        return Response(
            {
                'teaching_assignment_id': ta.id,
                'subject_code': subject_code,
                'subject_name': subject_name,
                'co_options': co_options,
                'sub_topics_by_co': sub_topics_by_co,
            }
        )


class StaffMaterialDetailView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def _get_material(self, request, pk):
        try:
            obj = StudyMaterial.objects.select_related('uploaded_by').get(pk=pk)
        except StudyMaterial.DoesNotExist:
            return None

        if getattr(request.user, 'is_superuser', False):
            return obj
        staff_profile = getattr(request.user, 'staff_profile', None)
        if staff_profile and obj.uploaded_by_id == staff_profile.id:
            return obj
        if is_iqac_user(request.user):
            return obj
        return None

    def patch(self, request, pk):
        obj = self._get_material(request, pk)
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        title = str((request.data or {}).get('title') or '').strip()
        description = (request.data or {}).get('description')
        if title:
            obj.title = title[:255]
        if description is not None:
            obj.description = str(description)
        obj.save(update_fields=['title', 'description', 'updated_at'])
        return Response(StudyMaterialSerializer(obj, context={'request': request}).data)

    def delete(self, request, pk):
        obj = self._get_material(request, pk)
        if not obj:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StudentCourseWiseMaterialsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        student_profile = getattr(request.user, 'student_profile', None)
        if student_profile is None:
            raise PermissionDenied('Student access only.')

        enrolled_ids = set(
            StudentCourseEnrollment.objects.filter(student=student_profile).values_list('course_id', flat=True)
        )
        try:
            section = student_profile.current_section
        except Exception:
            section = getattr(student_profile, 'section', None)
        try:
            if section and section.batch and section.batch.course_id:
                enrolled_ids.add(section.batch.course_id)
        except Exception:
            pass

        qs = StudyMaterial.objects.none()
        if enrolled_ids:
            qs = StudyMaterial.objects.filter(course_id__in=enrolled_ids).select_related(
                'uploaded_by__user',
                'course__department',
                'curriculum_row',
                'elective_subject',
                'teaching_assignment__subject',
                'teaching_assignment__curriculum_row',
                'teaching_assignment__elective_subject',
            )

        grouped = _group_materials_by_course(qs.order_by('course__name', '-created_at'), serializer_context={'request': request})
        return Response({'results': grouped})


class HODCourseWiseMaterialsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        if not is_hod_or_ahod_user(request.user):
            raise PermissionDenied('HOD/AHOD access only.')

        dept_ids = get_hod_department_ids(request.user)
        if not dept_ids and not getattr(request.user, 'is_superuser', False):
            raise PermissionDenied('No managed departments found.')

        qs = StudyMaterial.objects.select_related(
            'uploaded_by__department',
            'uploaded_by__user',
            'course__department',
            'curriculum_row',
            'elective_subject',
            'teaching_assignment__subject',
            'teaching_assignment__curriculum_row',
            'teaching_assignment__elective_subject',
        )
        if not getattr(request.user, 'is_superuser', False):
            qs = qs.filter(uploaded_by__department_id__in=dept_ids)

        grouped = _group_materials_by_course(qs.order_by('course__name', '-created_at'), serializer_context={'request': request})
        return Response({'results': grouped})


class IQACCourseWiseMaterialsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        if not is_iqac_user(request.user):
            raise PermissionDenied('IQAC access only.')

        qs = StudyMaterial.objects.select_related(
            'uploaded_by__department',
            'uploaded_by__user',
            'course__department',
            'curriculum_row',
            'elective_subject',
            'teaching_assignment__subject',
            'teaching_assignment__curriculum_row',
            'teaching_assignment__elective_subject',
        )
        course_id = request.query_params.get('course_id')
        if course_id:
            try:
                qs = qs.filter(course_id=int(course_id))
            except Exception:
                pass

        grouped = _group_materials_by_course(qs.order_by('course__name', '-created_at'), serializer_context={'request': request})
        return Response({'results': grouped})


class MyQuotaView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        staff_profile = get_user_staff_profile(request.user)
        if staff_profile is None:
            raise PermissionDenied('Staff access only.')

        quota, _ = StaffStorageQuota.objects.get_or_create(staff=staff_profile)
        used = StudyMaterial.objects.filter(
            uploaded_by=staff_profile,
            material_type=StudyMaterial.TYPE_FILE,
        ).aggregate(total=Sum('file_size_bytes')).get('total') or 0

        return Response(
            {
                'staff_id': staff_profile.staff_id,
                'quota_bytes': int(quota.quota_bytes),
                'used_bytes': int(used),
                'remaining_bytes': max(int(quota.quota_bytes) - int(used), 0),
            }
        )


class IQACQuotaListUpdateView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        if not is_iqac_user(request.user):
            raise PermissionDenied('IQAC access only.')

        qs = StaffStorageQuota.objects.select_related('staff', 'staff__user').order_by('staff__staff_id')
        department_id = request.query_params.get('department_id')
        if department_id:
            try:
                qs = qs.filter(staff__department_id=int(department_id))
            except Exception:
                pass

        serializer = StaffQuotaSerializer(qs, many=True)
        return Response({'results': serializer.data})

    def patch(self, request):
        if not is_iqac_user(request.user):
            raise PermissionDenied('IQAC access only.')

        staff_id = (request.data or {}).get('staff_id')
        quota_bytes = (request.data or {}).get('quota_bytes')
        if not staff_id:
            return Response({'detail': 'staff_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if quota_bytes in (None, ''):
            return Response({'detail': 'quota_bytes is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quota_value = int(quota_bytes)
            if quota_value < 0:
                raise ValueError
        except Exception:
            return Response({'detail': 'quota_bytes must be a non-negative integer.'}, status=status.HTTP_400_BAD_REQUEST)

        from academics.models import StaffProfile

        staff = StaffProfile.objects.filter(pk=staff_id).first()
        if staff is None:
            return Response({'detail': 'Staff not found.'}, status=status.HTTP_404_NOT_FOUND)

        quota, _ = StaffStorageQuota.objects.get_or_create(staff=staff)
        quota.quota_bytes = quota_value
        quota.updated_by = request.user
        quota.save(update_fields=['quota_bytes', 'updated_by', 'updated_at'])

        return Response(StaffQuotaSerializer(quota).data)


class StudyMaterialDownloadView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, pk):
        try:
            material = StudyMaterial.objects.select_related(
                'uploaded_by',
                'uploaded_by__department',
                'course',
            ).get(pk=pk)
        except StudyMaterial.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not _can_access_material(request.user, material):
            raise PermissionDenied('You do not have access to this material.')

        StudyMaterialDownloadLog.objects.create(
            material=material,
            downloaded_by=request.user,
            downloaded_by_staff=getattr(request.user, 'staff_profile', None),
            downloaded_by_student=getattr(request.user, 'student_profile', None),
            client_ip=_get_client_ip(request),
            user_agent=str(request.META.get('HTTP_USER_AGENT', '') or '')[:1000],
        )

        if material.material_type == StudyMaterial.TYPE_LINK:
            return Response(
                {
                    'material_type': StudyMaterial.TYPE_LINK,
                    'url': material.external_url,
                }
            )

        if not material.file:
            return Response({'detail': 'Material file is missing.'}, status=status.HTTP_404_NOT_FOUND)

        inline = str(request.query_params.get('inline', '') or '').strip().lower() in {'1', 'true', 'yes'}
        safe_name = _resolve_material_filename(material)
        guessed_type, _ = mimetypes.guess_type(safe_name)
        content_type = guessed_type or 'application/octet-stream'
        return FileResponse(
            material.file.open('rb'),
            as_attachment=not inline,
            filename=safe_name,
            content_type=content_type,
        )


class StudyMaterialOfficePreviewUrlView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, pk):
        try:
            material = StudyMaterial.objects.select_related(
                'uploaded_by',
                'uploaded_by__department',
                'course',
            ).get(pk=pk)
        except StudyMaterial.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not _can_access_material(request.user, material):
            raise PermissionDenied('You do not have access to this material.')

        if material.material_type != StudyMaterial.TYPE_FILE or not material.file:
            return Response({'detail': 'Office preview is available only for uploaded files.'}, status=status.HTTP_400_BAD_REQUEST)

        ext = _resolve_material_extension(material)
        if ext not in OFFICE_PREVIEW_EXTENSIONS:
            return Response(
                {'detail': 'Office Online preview is supported only for .pptx, .docx, and .xlsx files.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = {
            'material_id': material.id,
            'requested_by': int(request.user.id),
        }
        token = signing.dumps(payload, salt=OFFICE_PREVIEW_TOKEN_SALT)
        public_url = request.build_absolute_uri(
            reverse('lms-office-preview-file', kwargs={'token': token})
        )
        viewer_url = f"https://view.officeapps.live.com/op/embed.aspx?src={quote(public_url, safe='')}"

        return Response(
            {
                'material_id': material.id,
                'public_preview_url': public_url,
                'viewer_url': viewer_url,
            }
        )


class StudyMaterialOfficePreviewFileView(APIView):
    permission_classes = (permissions.AllowAny,)

    def get(self, request, token):
        try:
            payload = signing.loads(
                token,
                salt=OFFICE_PREVIEW_TOKEN_SALT,
                max_age=OFFICE_PREVIEW_TOKEN_MAX_AGE_SECONDS,
            )
            material_id = int(payload.get('material_id'))
            requested_by = int(payload.get('requested_by'))
        except Exception:
            return Response({'detail': 'Invalid or expired preview token.'}, status=status.HTTP_403_FORBIDDEN)

        material = StudyMaterial.objects.filter(pk=material_id, material_type=StudyMaterial.TYPE_FILE).first()
        if not material or not material.file:
            return Response({'detail': 'Material file is missing.'}, status=status.HTTP_404_NOT_FOUND)

        ext = _resolve_material_extension(material)
        if ext not in OFFICE_PREVIEW_EXTENSIONS:
            return Response({'detail': 'Unsupported file type for Office preview.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from django.contrib.auth import get_user_model

            user = get_user_model().objects.filter(pk=requested_by).first()
            if user:
                StudyMaterialDownloadLog.objects.create(
                    material=material,
                    downloaded_by=user,
                    downloaded_by_staff=getattr(user, 'staff_profile', None),
                    downloaded_by_student=getattr(user, 'student_profile', None),
                    client_ip=_get_client_ip(request),
                    user_agent=str(request.META.get('HTTP_USER_AGENT', '') or '')[:1000],
                )
        except Exception:
            pass

        safe_name = _resolve_material_filename(material)
        guessed_type, _ = mimetypes.guess_type(safe_name)
        content_type = guessed_type or 'application/octet-stream'
        return FileResponse(
            material.file.open('rb'),
            as_attachment=False,
            filename=safe_name,
            content_type=content_type,
        )


class DownloadAuditLogsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        user = request.user
        staff_profile = get_user_staff_profile(user)
        is_hod = is_hod_or_ahod_user(user)
        is_iqac = is_iqac_user(user)
        is_super = getattr(user, 'is_superuser', False)

        qs = StudyMaterialDownloadLog.objects.select_related(
            'material',
            'material__course',
            'downloaded_by',
            'downloaded_by_staff',
            'downloaded_by_student',
            'material__uploaded_by',
            'material__uploaded_by__department',
        )

        if is_super or is_iqac:
            pass
        elif is_hod:
            dept_ids = get_hod_department_ids(user)
            qs = qs.filter(material__uploaded_by__department_id__in=dept_ids)
        elif staff_profile is not None:
            qs = qs.filter(material__uploaded_by=staff_profile)
        else:
            raise PermissionDenied('Not allowed to view download audit logs.')

        material_id = request.query_params.get('material_id')
        if material_id:
            try:
                qs = qs.filter(material_id=int(material_id))
            except Exception:
                pass

        serializer = StudyMaterialDownloadLogSerializer(qs.order_by('-downloaded_at')[:500], many=True)
        return Response({'results': serializer.data})
