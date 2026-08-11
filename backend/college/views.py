from __future__ import annotations

import io
import itertools

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, filters, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import College, FeatureCatalog, CollegeFeature
from .serializers import CollegeSerializer, CollegeUserSerializer, CollegeFeatureSerializer
from accounts.models import User, Role, UserRole
from academics.models import StudentProfile, StaffProfile, Department, Course


def _resolve_college_id(request):
    """Return a college_id from the request: X-College-Id header > POST body > query param.

    This ensures college isolation regardless of how the frontend sends the
    college identifier — explicit header, JSON body field ``college``, or URL
    query param ``college_id``.
    """
    # 1. X-College-Id header (set by middleware from localStorage)
    cid = getattr(request, 'college_id', None)
    if cid is not None:
        return cid
    # 2. Request body (JSON: {"college": 5})
    cid = (request.data or {}).get('college')
    if cid is not None:
        try:
            return int(cid)
        except (TypeError, ValueError):
            pass
    # 3. Query param (?college_id=5)
    raw = request.query_params.get('college_id')
    if raw:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    return None
from accounts.permissions_super_admin import IsSuperAdminOrSuperuser


# ---------------------------------------------------------------------------
# College CRUD
# ---------------------------------------------------------------------------

class CollegeListCreateView(generics.ListCreateAPIView):
    """List all colleges or create a new one. Accessible to SUPER_ADMIN."""
    serializer_class = CollegeSerializer
    permission_classes = [IsSuperAdminOrSuperuser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['code', 'name', 'short_name', 'city']
    ordering_fields = ['code', 'name', 'city', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        qs = College.objects.all()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs


class CollegeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update or delete a college. Requires SUPER_ADMIN."""
    serializer_class = CollegeSerializer
    permission_classes = [IsSuperAdminOrSuperuser]
    queryset = College.objects.all()


# ---------------------------------------------------------------------------
# College Users — List
# ---------------------------------------------------------------------------

class CollegeUsersListView(APIView):
    """GET /api/college/colleges/<id>/users/  — list all users for a college.

    Query params:
      search     — filter by name, email, reg_no, staff_id
      role       — filter by role name (e.g. STUDENT, FACULTY, SUPER_ADMIN)
      page       — page number (default 1)
      page_size  — results per page (default 50, max 200)

    Response shape:
      {
        "total": <int>,
        "total_students": <int>,
        "total_staff": <int>,
        "page": <int>,
        "page_size": <int>,
        "results": [ ... ]
      }
    """
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request, pk):
        from django.db.models import Q
        from django.core.paginator import Paginator, EmptyPage

        college = get_object_or_404(College, pk=pk)
        search = request.query_params.get('search', '').strip()
        role_filter = request.query_params.get('role', '').strip().upper()

        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(200, max(1, int(request.query_params.get('page_size', 50))))
        except (TypeError, ValueError):
            page_size = 50

        # ── Students ────────────────────────────────────────────────────────
        students_qs = (
            StudentProfile.objects
            .filter(college=college)
            .select_related('user', 'home_department')
            .order_by('user__first_name', 'user__last_name', 'reg_no')
        )

        # ── Staff ───────────────────────────────────────────────────────────
        staff_qs = (
            StaffProfile.objects
            .filter(college=college)
            .select_related('user', 'department')
            .order_by('user__first_name', 'user__last_name', 'staff_id')
        )

        # ── Role filter ─────────────────────────────────────────────────────
        if role_filter:
            students_qs = students_qs.filter(
                user__user_roles__role__name__iexact=role_filter
            ).distinct()
            staff_qs = staff_qs.filter(
                user__user_roles__role__name__iexact=role_filter
            ).distinct()

        # ── Search filter ───────────────────────────────────────────────────
        if search:
            q_student = (
                Q(user__username__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(reg_no__icontains=search)
            )
            q_staff = (
                Q(user__username__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(staff_id__icontains=search)
            )
            students_qs = students_qs.filter(q_student)
            staff_qs = staff_qs.filter(q_staff)

        # ── Counts (before pagination) ───────────────────────────────────────
        total_students = students_qs.count()
        total_staff = staff_qs.count()
        total = total_students + total_staff

        # ── Paginate across combined list ───────────────────────────────────
        # Students are listed first, then staff.
        all_profiles = list(students_qs) + list(staff_qs)
        paginator = Paginator(all_profiles, page_size)
        try:
            page_obj = paginator.page(page)
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages)

        serializer = CollegeUserSerializer(page_obj.object_list, many=True)
        return Response({
            'total': total,
            'total_students': total_students,
            'total_staff': total_staff,
            'page': page_obj.number,
            'page_size': page_size,
            'total_pages': paginator.num_pages,
            'results': serializer.data,
        })



# ---------------------------------------------------------------------------
# College Users — Import Template Download
# ---------------------------------------------------------------------------

class CollegeUserImportTemplateView(APIView):
    """GET /api/college/colleges/<id>/users/import-template/?role=STUDENT
    Download an Excel template for the given role type."""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request, pk):
        college = get_object_or_404(College, pk=pk)
        role = request.query_params.get('role', 'STUDENT').strip().upper()

        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment
        except ImportError:
            return Response({'detail': 'openpyxl not installed'}, status=500)

        wb = Workbook()
        ws = wb.active
        ws.title = f'{role} Import'

        header_font = Font(bold=True, color='FFFFFF', size=11)
        header_fill = PatternFill(start_color='1F4E79', end_color='1F4E79', fill_type='solid')
        header_align = Alignment(horizontal='center')

        if role == 'STUDENT':
            headers = ['Register Number*', 'Email*', 'First Name', 'Last Name',
                       'Batch', 'Status', 'Degree (Course Code)', 'Branch (Department Code)',
                       'Phone Number']
            example = ['22CS001', 'student@college.edu', 'John', 'Doe',
                       '2022', 'ACTIVE', 'BTECH', 'CSE', '9876543210']
        elif role in ('FACULTY', 'STAFF'):
            headers = ['Staff ID*', 'Email*', 'First Name', 'Last Name',
                       'Department Code', 'Designation', 'Status', 'Phone Number']
            example = ['FAC001', 'faculty@college.edu', 'Jane', 'Smith',
                       'CSE', 'Assistant Professor', 'ACTIVE', '9876543210']
        else:
            # Generic / other roles
            headers = ['Register Number / Staff ID*', 'Email*', 'First Name', 'Last Name',
                       'Profile Type* (STUDENT/STAFF)', 'Department Code', 'Designation',
                       'Batch', 'Status', 'Phone Number']
            example = ['ID001', 'user@college.edu', 'Alex', 'Kumar',
                       'STAFF', 'CSE', 'Lab Assistant', '', 'ACTIVE', '9876543210']

        for col_idx, h in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col_idx, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            ws.column_dimensions[cell.column_letter].width = max(20, len(h) + 4)

        for col_idx, val in enumerate(example, start=1):
            ws.cell(row=2, column=col_idx, value=val)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        from django.http import HttpResponse
        response = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{college.code}_{role}_import_template.xlsx"'
        return response


# ---------------------------------------------------------------------------
# College Users — Import
# ---------------------------------------------------------------------------

class CollegeUserImportView(APIView):
    """POST /api/college/colleges/<id>/users/import/
    Upload an Excel file to bulk-create users for this college."""
    permission_classes = [IsSuperAdminOrSuperuser]

    def post(self, request, pk):
        college = get_object_or_404(College, pk=pk)
        role = request.data.get('role', 'STUDENT').strip().upper()
        file = request.FILES.get('file')

        if not file:
            return Response({'detail': 'No file uploaded.'}, status=400)

        name = getattr(file, 'name', '') or ''
        if not name.lower().endswith('.xlsx'):
            return Response({'detail': 'Please upload an .xlsx file.'}, status=400)

        try:
            from openpyxl import load_workbook
            content = file.read()
            wb = load_workbook(filename=io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
        except Exception:
            return Response({'detail': 'Failed to read Excel file.'}, status=400)

        rows = list(ws.iter_rows(min_row=2, values_only=True))
        if not rows:
            return Response({'detail': 'No data rows found.'}, status=400)

        created_count = 0
        updated_count = 0
        failed = []

        for row_idx, row in enumerate(rows, start=2):
            try:
                row = list(row) + [''] * 20  # pad to avoid index errors
                cells = [str(c).strip() if c is not None else '' for c in row]

                with transaction.atomic():
                    if role == 'STUDENT':
                        user_obj, profile = self._import_student(cells, college)
                    elif role in ('FACULTY', 'STAFF'):
                        user_obj, profile = self._import_staff(cells, college)
                    else:
                        user_obj, profile = self._import_other(cells, college, role)

                    # Assign roles
                    target_role = role if role not in ('FACULTY',) else 'STAFF'
                    if role == 'STUDENT':
                        target_role = 'STUDENT'
                    role_obj, _ = Role.objects.get_or_create(name=target_role)
                    if not user_obj.user_roles.filter(role=role_obj).exists():
                        UserRole.objects.create(user=user_obj, role=role_obj)

                    # For FACULTY specifically, also add FACULTY role
                    if role == 'FACULTY':
                        fac_role, _ = Role.objects.get_or_create(name='FACULTY')
                        if not user_obj.user_roles.filter(role=fac_role).exists():
                            try:
                                UserRole.objects.create(user=user_obj, role=fac_role)
                            except Exception:
                                pass

                    created_count += 1

            except Exception as e:
                failed.append({
                    'row': row_idx,
                    'error': str(e),
                    'data': cells[:5] if 'cells' in dir() else [],
                })

        return Response({
            'created': created_count,
            'updated': updated_count,
            'failed': failed,
            'total_rows': len(rows),
        })

    def _cell(self, cells, idx):
        try:
            v = cells[idx]
            if v is None:
                return ''
            # Normalize float→int for numeric IDs
            try:
                if isinstance(v, float) and v == int(v):
                    return str(int(v))
            except Exception:
                pass
            return str(v).strip()
        except IndexError:
            return ''

    def _import_student(self, cells, college):
        reg_no = self._cell(cells, 0)
        email = self._cell(cells, 1)
        first_name = self._cell(cells, 2)
        last_name = self._cell(cells, 3)
        batch = self._cell(cells, 4)
        status_val = self._cell(cells, 5).upper() or 'ACTIVE'
        course_code = self._cell(cells, 6)
        dept_code = self._cell(cells, 7)
        phone = self._cell(cells, 8)

        if not reg_no:
            raise ValueError('Register Number is required')
        if not email:
            email = f'{reg_no}@imported.local'

        dept = None
        if dept_code:
            dept = Department.objects.filter(
                Q(code__iexact=dept_code) | Q(short_name__iexact=dept_code) | Q(name__iexact=dept_code)
            ).first()

        # Find or create user
        existing = StudentProfile.objects.filter(reg_no=reg_no).select_related('user').first()
        if existing:
            user_obj = existing.user
            user_obj.set_password(reg_no)
            user_obj.must_change_password = True
            if first_name:
                user_obj.first_name = first_name
            if last_name:
                user_obj.last_name = last_name
            if phone:
                user_obj.mobile_no = phone
            user_obj.save()
            existing.college = college
            existing.batch = batch or existing.batch
            existing.status = status_val
            if dept:
                existing.home_department = dept
            if phone:
                existing.mobile_number = phone
            existing.save(update_fields=['college', 'batch', 'status', 'home_department', 'mobile_number'])
            return user_obj, existing
        else:
            user_obj = User(
                username=first_name or reg_no,
                email=email,
                first_name=first_name,
                last_name=last_name,
                must_change_password=True,
            )
            if phone:
                user_obj.mobile_no = phone
            user_obj.set_password(reg_no)
            user_obj.save()

            profile = StudentProfile(
                user=user_obj,
                college=college,
                reg_no=reg_no,
                batch=batch,
                status=status_val,
            )
            if phone:
                profile.mobile_number = phone
            if dept:
                profile.home_department = dept
            profile.save()
            return user_obj, profile

    def _import_staff(self, cells, college):
        staff_id = self._cell(cells, 0)
        email = self._cell(cells, 1)
        first_name = self._cell(cells, 2)
        last_name = self._cell(cells, 3)
        dept_code = self._cell(cells, 4)
        designation = self._cell(cells, 5)
        status_val = self._cell(cells, 6).upper() or 'ACTIVE'
        phone = self._cell(cells, 7)

        if not staff_id:
            raise ValueError('Staff ID is required')
        if not email:
            email = f'{staff_id}@imported.local'

        dept = None
        if dept_code:
            dept = Department.objects.filter(
                Q(code__iexact=dept_code) | Q(short_name__iexact=dept_code) | Q(name__iexact=dept_code)
            ).first()

        existing = StaffProfile.objects.filter(staff_id=staff_id).select_related('user').first()
        if existing:
            user_obj = existing.user
            user_obj.set_password(staff_id)
            user_obj.must_change_password = True
            if first_name:
                user_obj.first_name = first_name
            if last_name:
                user_obj.last_name = last_name
            if phone:
                user_obj.mobile_no = phone
            user_obj.save()
            existing.college = college
            existing.designation = designation or existing.designation
            existing.status = status_val
            if dept:
                existing.department = dept
            if phone:
                existing.mobile_number = phone
            existing.save(update_fields=['college', 'designation', 'status', 'department', 'mobile_number'])
            return user_obj, existing
        else:
            user_obj = User(
                username=first_name or staff_id,
                email=email,
                first_name=first_name,
                last_name=last_name,
                must_change_password=True,
            )
            if phone:
                user_obj.mobile_no = phone
            user_obj.set_password(staff_id)
            user_obj.save()

            profile = StaffProfile(
                user=user_obj,
                college=college,
                staff_id=staff_id,
                department=dept,
                designation=designation,
                status=status_val,
            )
            if phone:
                profile.mobile_number = phone
            profile.save()
            return user_obj, profile

    def _import_other(self, cells, college, role_name):
        id_val = self._cell(cells, 0)
        email = self._cell(cells, 1)
        first_name = self._cell(cells, 2)
        last_name = self._cell(cells, 3)
        profile_type = self._cell(cells, 4).upper() or 'STAFF'
        dept_code = self._cell(cells, 5)
        designation = self._cell(cells, 6)
        batch = self._cell(cells, 7)
        status_val = self._cell(cells, 8).upper() or 'ACTIVE'
        phone = self._cell(cells, 9)

        if not id_val:
            raise ValueError('ID is required')
        if not email:
            email = f'{id_val}@imported.local'

        if profile_type == 'STUDENT':
            cells_student = [id_val, email, first_name, last_name, batch, status_val, '', dept_code, phone]
            return self._import_student(cells_student, college)
        else:
            cells_staff = [id_val, email, first_name, last_name, dept_code, designation, status_val, phone]
            return self._import_staff(cells_staff, college)


# ---------------------------------------------------------------------------
# College Users — Delete
# ---------------------------------------------------------------------------

class CollegeUserDeleteView(APIView):
    """DELETE /api/college/colleges/<college_id>/users/<user_id>/"""
    permission_classes = [IsSuperAdminOrSuperuser]

    def delete(self, request, pk, user_id):
        college = get_object_or_404(College, pk=pk)
        user = get_object_or_404(User, pk=user_id)

        # Remove association, don't delete the user entirely
        sp = getattr(user, 'student_profile', None)
        if sp and sp.college_id == college.pk:
            sp.college = None
            sp.save(update_fields=['college'])

        st = getattr(user, 'staff_profile', None)
        if st and st.college_id == college.pk:
            st.college = None
            st.save(update_fields=['college'])

        return Response(status=204)


# ---------------------------------------------------------------------------
# College Features — List & Bulk Update
# ---------------------------------------------------------------------------

class CollegeFeaturesListView(APIView):
    """GET /api/college/colleges/<id>/features/
    Returns all features from the catalog with per-college toggle state.
    Missing CollegeFeature rows are auto-created from the catalog.

    PUT /api/college/colleges/<id>/features/
    Bulk-update feature toggles. Body: { "features": { "obe": true, "coe": false } }
    """
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request, pk):
        college = get_object_or_404(College, pk=pk)
        catalog = FeatureCatalog.objects.all()

        # Auto-create missing CollegeFeature rows
        existing_codes = set(
            CollegeFeature.objects.filter(college=college).values_list('feature__code', flat=True)
        )
        new_entries = []
        for feat in catalog:
            if feat.code not in existing_codes:
                new_entries.append(
                    CollegeFeature(college=college, feature=feat, is_enabled=feat.is_default)
                )
        if new_entries:
            CollegeFeature.objects.bulk_create(new_entries, ignore_conflicts=True)

        college_features = (
            CollegeFeature.objects
            .filter(college=college)
            .select_related('feature')
            .order_by('feature__sort_order', 'feature__category')
        )
        serializer = CollegeFeatureSerializer(college_features, many=True)
        return Response(serializer.data)

    def put(self, request, pk):
        college = get_object_or_404(College, pk=pk)
        features_map = request.data.get('features', {})
        if not isinstance(features_map, dict):
            return Response({'detail': 'features must be a dict of {code: bool}'}, status=400)

        from django.utils import timezone
        now = timezone.now()

        updated = 0
        for code, enabled in features_map.items():
            feat = FeatureCatalog.objects.filter(code=code).first()
            if not feat:
                continue
            cf, created = CollegeFeature.objects.get_or_create(
                college=college, feature=feat,
                defaults={'is_enabled': bool(enabled)}
            )
            if not created and cf.is_enabled != bool(enabled):
                cf.is_enabled = bool(enabled)
                if enabled:
                    cf.enabled_at = now
                    cf.disabled_at = None
                else:
                    cf.disabled_at = now
                cf.save(update_fields=['is_enabled', 'enabled_at', 'disabled_at'])
            updated += 1

        return Response({'updated': updated})


# ---------------------------------------------------------------------------
# College Features — Single Toggle
# ---------------------------------------------------------------------------

class CollegeFeatureToggleView(APIView):
    """PATCH /api/college/colleges/<id>/features/<code>/
    Toggle a single feature. Body: { "is_enabled": true }
    """
    permission_classes = [IsSuperAdminOrSuperuser]

    def patch(self, request, pk, code):
        college = get_object_or_404(College, pk=pk)
        feat = get_object_or_404(FeatureCatalog, code=code)
        enabled = request.data.get('is_enabled')
        if enabled is None:
            return Response({'detail': 'is_enabled is required'}, status=400)

        from django.utils import timezone
        now = timezone.now()

        cf, _ = CollegeFeature.objects.get_or_create(
            college=college, feature=feat,
            defaults={'is_enabled': bool(enabled)}
        )
        cf.is_enabled = bool(enabled)
        if enabled:
            cf.enabled_at = now
            cf.disabled_at = None
        else:
            cf.disabled_at = now
        cf.save(update_fields=['is_enabled', 'enabled_at', 'disabled_at'])

        return Response({
            'code': feat.code,
            'name': feat.name,
            'is_enabled': cf.is_enabled,
        })


# ---------------------------------------------------------------------------
# Departments — CRUD (Super Admin + College Admin)
# ---------------------------------------------------------------------------

class DepartmentListCreateView(APIView):
    """GET  /api/college/departments/  — list all departments.
       POST /api/college/departments/  — create a new department.
    """
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request):
        qs = Department.objects.all().order_by('code')
        college_id = _resolve_college_id(request)
        if college_id:
            try:
                qs = qs.filter(college_id=int(college_id))
            except (TypeError, ValueError):
                pass
        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(code__icontains=search) | Q(name__icontains=search) | Q(short_name__icontains=search)
            )
        data = []
        for d in qs:
            data.append({
                'id': d.id,
                'code': d.code,
                'name': d.name,
                'short_name': d.short_name,
                'is_teaching': d.is_teaching,
                'parent': d.parent_id,
                'parent_name': str(d.parent) if d.parent else None,
                'is_sh_main': d.is_sh_main,
                'college': d.college_id,
            })
        return Response(data)

    def post(self, request):
        code = (request.data.get('code') or '').strip()
        name = (request.data.get('name') or '').strip()
        if not code or not name:
            return Response({'detail': 'code and name are required.'}, status=400)
        college_id = _resolve_college_id(request)
        if Department.objects.filter(code=code, college_id=college_id or None).exists():
            return Response({'detail': f'Department with code "{code}" already exists in this college.'}, status=400)
        d = Department.objects.create(
            code=code,
            name=name,
            short_name=(request.data.get('short_name') or '').strip(),
            is_teaching=request.data.get('is_teaching', True),
            parent_id=request.data.get('parent') or None,
            is_sh_main=request.data.get('is_sh_main', False),
            college_id=college_id or None,
        )
        return Response({
            'id': d.id, 'code': d.code, 'name': d.name,
            'short_name': d.short_name, 'is_teaching': d.is_teaching,
            'parent': d.parent_id, 'is_sh_main': d.is_sh_main,
            'college': d.college_id,
        }, status=201)


class DepartmentDetailView(APIView):
    """GET/PUT/DELETE /api/college/departments/<id>/"""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request, pk):
        d = get_object_or_404(Department, pk=pk)
        return Response({
            'id': d.id, 'code': d.code, 'name': d.name,
            'short_name': d.short_name, 'is_teaching': d.is_teaching,
            'parent': d.parent_id, 'parent_name': str(d.parent) if d.parent else None,
            'is_sh_main': d.is_sh_main,
            'college': d.college_id,
        })

    def put(self, request, pk):
        d = get_object_or_404(Department, pk=pk)
        if 'code' in request.data:
            new_code = request.data['code'].strip()
            if new_code != d.code and Department.objects.filter(code=new_code, college_id=d.college_id).exists():
                return Response({'detail': f'Code "{new_code}" already in use in this college.'}, status=400)
            d.code = new_code
        if 'name' in request.data:
            d.name = request.data['name'].strip()
        if 'short_name' in request.data:
            d.short_name = (request.data['short_name'] or '').strip()
        if 'is_teaching' in request.data:
            d.is_teaching = bool(request.data['is_teaching'])
        if 'parent' in request.data:
            d.parent_id = request.data['parent'] or None
        if 'is_sh_main' in request.data:
            d.is_sh_main = bool(request.data['is_sh_main'])
        if 'college' in request.data:
            d.college_id = request.data['college'] or None
        d.save()
        return Response({
            'id': d.id, 'code': d.code, 'name': d.name,
            'short_name': d.short_name, 'is_teaching': d.is_teaching,
            'parent': d.parent_id, 'is_sh_main': d.is_sh_main,
            'college': d.college_id,
        })

    def delete(self, request, pk):
        d = get_object_or_404(Department, pk=pk)
        d.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Batches — CRUD (Super Admin only)
# ---------------------------------------------------------------------------

class BatchListCreateView(APIView):
    """GET  /api/college/batches/  — list all batches.
       POST /api/college/batches/  — create a new batch.
    """
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request):
        from academics.models import Batch
        qs = Batch.objects.all().select_related('course', 'course__department', 'department', 'regulation', 'batch_year').order_by('-name')
        college_id = _resolve_college_id(request)
        if college_id:
            try:
                qs = qs.filter(college_id=int(college_id))
            except (TypeError, ValueError):
                pass
        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(course__name__icontains=search) |
                Q(department__code__icontains=search)
            )
        data = []
        for b in qs:
            data.append({
                'id': b.id,
                'name': b.name,
                'course': b.course_id,
                'course_name': str(b.course) if b.course else None,
                'department': b.department_id,
                'department_name': str(b.department) if b.department else (str(b.course.department) if b.course and b.course.department else None),
                'start_year': b.start_year,
                'end_year': b.end_year,
                'regulation': b.regulation_id,
                'regulation_code': str(b.regulation) if b.regulation else None,
                'is_active': b.is_active,
                'batch_year': b.batch_year_id,
                'college': b.college_id,
            })
        return Response(data)

    def post(self, request):
        from academics.models import Batch
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'detail': 'name is required.'}, status=400)
        course_id = request.data.get('course') or None
        department_id = request.data.get('department') or None
        college_id = _resolve_college_id(request)
        b = Batch.objects.create(
            name=name,
            course_id=course_id,
            department_id=department_id,
            college_id=college_id or None,
            start_year=request.data.get('start_year') or None,
            end_year=request.data.get('end_year') or None,
            regulation_id=request.data.get('regulation') or None,
            is_active=request.data.get('is_active', True),
        )
        return Response({
            'id': b.id, 'name': b.name, 'course': b.course_id,
            'department': b.department_id, 'start_year': b.start_year,
            'end_year': b.end_year, 'regulation': b.regulation_id,
            'is_active': b.is_active,
            'college': b.college_id,
        }, status=201)


class BatchDetailView(APIView):
    """GET/PUT/DELETE /api/college/batches/<id>/"""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request, pk):
        from academics.models import Batch
        b = get_object_or_404(Batch, pk=pk)
        return Response({
            'id': b.id, 'name': b.name, 'course': b.course_id,
            'course_name': str(b.course) if b.course else None,
            'department': b.department_id,
            'department_name': str(b.department) if b.department else None,
            'start_year': b.start_year, 'end_year': b.end_year,
            'regulation': b.regulation_id,
            'regulation_code': str(b.regulation) if b.regulation else None,
            'is_active': b.is_active,
        })

    def put(self, request, pk):
        from academics.models import Batch
        b = get_object_or_404(Batch, pk=pk)
        if 'name' in request.data:
            b.name = request.data['name'].strip()
        if 'course' in request.data:
            b.course_id = request.data['course'] or None
        if 'department' in request.data:
            b.department_id = request.data['department'] or None
        if 'start_year' in request.data:
            b.start_year = request.data['start_year'] or None
        if 'end_year' in request.data:
            b.end_year = request.data['end_year'] or None
        if 'regulation' in request.data:
            b.regulation_id = request.data['regulation'] or None
        if 'is_active' in request.data:
            b.is_active = bool(request.data['is_active'])
        if 'college' in request.data:
            b.college_id = request.data['college'] or None
        b.save()
        return Response({
            'id': b.id, 'name': b.name, 'course': b.course_id,
            'department': b.department_id, 'start_year': b.start_year,
            'end_year': b.end_year, 'regulation': b.regulation_id,
            'is_active': b.is_active,
            'college': b.college_id,
        })

    def delete(self, request, pk):
        from academics.models import Batch
        b = get_object_or_404(Batch, pk=pk)
        b.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Regulations — CRUD (Super Admin only)
# ---------------------------------------------------------------------------

class RegulationListCreateView(APIView):
    """GET  /api/college/regulations/  — list all regulations.
       POST /api/college/regulations/  — create a new regulation.
    """
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request):
        from curriculum.models import Regulation
        qs = Regulation.objects.all().order_by('-code')
        college_id = _resolve_college_id(request)
        if college_id:
            try:
                qs = qs.filter(college_id=int(college_id))
            except (TypeError, ValueError):
                pass
        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(code__icontains=search) | Q(name__icontains=search))
        data = []
        for r in qs:
            data.append({
                'id': r.id,
                'code': r.code,
                'name': r.name,
                'is_active': r.is_active,
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'college': r.college_id,
            })
        return Response(data)

    def post(self, request):
        from curriculum.models import Regulation
        code = (request.data.get('code') or '').strip()
        if not code:
            return Response({'detail': 'code is required.'}, status=400)
        college_id = _resolve_college_id(request)
        if Regulation.objects.filter(code=code, college_id=college_id or None).exists():
            return Response({'detail': f'Regulation "{code}" already exists in this college.'}, status=400)
        r = Regulation.objects.create(
            code=code,
            name=(request.data.get('name') or '').strip(),
            college_id=college_id or None,
            is_active=request.data.get('is_active', True),
        )
        return Response({
            'id': r.id, 'code': r.code, 'name': r.name, 'is_active': r.is_active,
            'college': r.college_id,
        }, status=201)


class RegulationDetailView(APIView):
    """GET/PUT/DELETE /api/college/regulations/<id>/"""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request, pk):
        from curriculum.models import Regulation
        r = get_object_or_404(Regulation, pk=pk)
        return Response({
            'id': r.id, 'code': r.code, 'name': r.name, 'is_active': r.is_active,
            'college': r.college_id,
        })

    def put(self, request, pk):
        from curriculum.models import Regulation
        r = get_object_or_404(Regulation, pk=pk)
        if 'code' in request.data:
            new_code = request.data['code'].strip()
            if new_code != r.code and Regulation.objects.filter(code=new_code, college_id=r.college_id).exists():
                return Response({'detail': f'Code "{new_code}" already in use in this college.'}, status=400)
            r.code = new_code
        if 'name' in request.data:
            r.name = (request.data['name'] or '').strip()
        if 'is_active' in request.data:
            r.is_active = bool(request.data['is_active'])
        if 'college' in request.data:
            r.college_id = request.data['college'] or None
        r.save()
        return Response({
            'id': r.id, 'code': r.code, 'name': r.name, 'is_active': r.is_active,
            'college': r.college_id,
        })

    def delete(self, request, pk):
        from curriculum.models import Regulation
        r = get_object_or_404(Regulation, pk=pk)
        r.delete()
        return Response(status=204)


# ---------------------------------------------------------------------------
# Lookup helpers for frontend dropdowns
# ---------------------------------------------------------------------------

class CourseListView(APIView):
    """GET /api/college/courses/ — list all courses for dropdown use."""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request):
        courses = Course.objects.all().select_related('department', 'program').order_by('name')
        college_id = _resolve_college_id(request)
        if college_id:
            try:
                courses = courses.filter(department__college_id=int(college_id))
            except (TypeError, ValueError):
                pass
        data = [
            {'id': c.id, 'name': c.name, 'department': c.department_id,
             'department_name': str(c.department) if c.department else None}
            for c in courses
        ]
        return Response(data)


# ---------------------------------------------------------------------------
# Public search endpoints (for external staff registration)
# ---------------------------------------------------------------------------

from django.db.models import Q as _Q
from rest_framework.decorators import api_view


@api_view(['GET'])
def search_colleges(request):
    """Public endpoint to search colleges by name or code."""
    query = request.GET.get('q', '').strip()
    limit = min(int(request.GET.get('limit', 20)), 50)
    if len(query) < 2:
        return Response({'results': [], 'message': 'Enter at least 2 characters'})
    colleges = College.objects.filter(
        _Q(name__icontains=query) | _Q(short_name__icontains=query) | _Q(code__icontains=query)
    ).filter(is_active=True).order_by('name')[:limit]
    results = [
        {'id': c.id, 'code': c.code, 'name': c.name, 'short_name': c.short_name,
         'city': c.city, 'display': f"{c.name}" + (f", {c.city}" if c.city else "")}
        for c in colleges
    ]
    return Response({'results': results})


@api_view(['GET'])
def list_all_colleges(request):
    """Public endpoint to get all active colleges."""
    colleges = College.objects.filter(is_active=True).order_by('name')
    results = [
        {'id': c.id, 'code': c.code, 'name': c.name, 'short_name': c.short_name,
         'city': c.city, 'display': f"{c.name}" + (f", {c.city}" if c.city else "")}
        for c in colleges
    ]
    return Response({'results': results, 'total': len(results)})
