from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from ..models import Role, Permission, RolePermission
from ..permissions_super_admin import IsSuperAdminOrSuperuser
from college.permissions import IsCollegeAdminOrSuperAdmin


def _build_role_feature_map() -> dict:
    """
    Return a dict { ROLE_NAME_UPPER: sorted[feature_code, ...] }.

    Source of truth: FeatureCatalog.applicable_roles  (a comma-separated text
    field like "STUDENT,FACULTY,HOD").  The Role.features M2M table is treated
    as a secondary source — its entries are unioned in so that any manually
    assigned M2M entries are also honoured.
    """
    from college.models import FeatureCatalog

    role_to_features: dict[str, set] = {}

    for feat in FeatureCatalog.objects.prefetch_related('roles').all():
        # ── Primary source: applicable_roles text field ──────────────────────
        if feat.applicable_roles:
            for role_name in feat.applicable_roles.split(','):
                role_name = role_name.strip().upper()
                if role_name:
                    role_to_features.setdefault(role_name, set()).add(feat.code)

        # ── Secondary source: explicit M2M entries on Role.features ──────────
        for assigned_role in feat.roles.all():
            role_to_features.setdefault(assigned_role.name.upper(), set()).add(feat.code)

    return {k: sorted(v) for k, v in role_to_features.items()}


class RolesManagementListCreateView(APIView):
    """GET: list all roles with features & permissions.  POST: create a new role.

    GET  — open to any authenticated college admin or super admin.
    POST — restricted to SUPER_ADMIN / superusers only.

    Feature assignment logic:
        The canonical source is FeatureCatalog.applicable_roles (comma-
        separated role names).  The Role.features M2M table has historically
        been empty so we build a reverse-lookup from applicable_roles and
        merge in any explicit M2M entries.  This way the UI always shows
        accurate feature data without requiring a DB backfill.
    """

    def get_permissions(self):
        """Allow college admins to read; restrict writes to SUPER_ADMIN."""
        if self.request.method == 'GET':
            return [IsCollegeAdminOrSuperAdmin()]
        return [IsSuperAdminOrSuperuser()]

    def get(self, request):
        role_feature_map = _build_role_feature_map()

        college_id = getattr(request, 'college_id', None)

        if college_id:
            # College-scoped: only roles activated for this college
            from college.models import CollegeRole
            active_role_ids = list(
                CollegeRole.objects.filter(college_id=college_id, is_active=True)
                .values_list('role_id', flat=True)
            )
            roles = (
                Role.objects.filter(id__in=active_role_ids)
                .exclude(name__iexact='SUPER_ADMIN')
                .order_by('name')
            )
        else:
            # Global view (SUPER_ADMIN without college header)
            roles = Role.objects.exclude(name__iexact='SUPER_ADMIN').order_by('name')

        data = []
        for r in roles:
            features = role_feature_map.get(r.name.upper(), [])
            perms = list(
                RolePermission.objects.filter(role=r)
                .select_related('permission')
                .values_list('permission__code', flat=True)
            )
            data.append({
                'id': r.id,
                'name': r.name,
                'description': r.description,
                'features': features,
                'permissions': perms,
            })
        return Response(data)

    def post(self, request):
        name = (request.data.get('name') or '').strip().upper()
        description = (request.data.get('description') or '').strip()
        feature_codes = request.data.get('features', [])

        if not name:
            return Response({'detail': 'Role name is required.'}, status=400)

        if Role.objects.filter(name__iexact=name).exists():
            return Response({'detail': f'Role "{name}" already exists.'}, status=400)

        role = Role.objects.create(name=name, description=description)

        # For new roles: also write to the M2M table AND update applicable_roles
        # on each selected feature so they show up in both paths.
        from college.models import FeatureCatalog
        if feature_codes:
            features = list(FeatureCatalog.objects.filter(code__in=feature_codes))
            role.features.set(features)

            # Append role name to each feature's applicable_roles field
            for feat in features:
                existing = [r.strip() for r in feat.applicable_roles.split(',') if r.strip()]
                if name not in existing:
                    existing.append(name)
                    feat.applicable_roles = ','.join(existing)
                    feat.save(update_fields=['applicable_roles'])

        # Refresh feature list using the same logic as GET
        role_feature_map = _build_role_feature_map()
        return Response({
            'id': role.id,
            'name': role.name,
            'description': role.description,
            'features': role_feature_map.get(role.name.upper(), []),
            'permissions': list(
                RolePermission.objects.filter(role=role).values_list('permission__code', flat=True)
            ),
        }, status=201)


class RoleDetailView(APIView):
    """GET / PUT / DELETE a single role."""
    permission_classes = [IsSuperAdminOrSuperuser]

    def _get_features(self, role):
        role_feature_map = _build_role_feature_map()
        return role_feature_map.get(role.name.upper(), [])

    def get(self, request, pk):
        try:
            role = Role.objects.get(pk=pk)
        except Role.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        perms = list(
            RolePermission.objects.filter(role=role)
            .values_list('permission__code', flat=True)
        )
        return Response({
            'id': role.id,
            'name': role.name,
            'description': role.description,
            'features': self._get_features(role),
            'permissions': perms,
        })

    def put(self, request, pk):
        try:
            role = Role.objects.get(pk=pk)
        except Role.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        description = request.data.get('description')
        if description is not None:
            role.description = description.strip()
            role.save(update_fields=['description'])

        # NOTE: features/permissions are explicitly NOT updatable here
        # as per the requirement "there is no second chance to alter it".

        perms = list(
            RolePermission.objects.filter(role=role).values_list('permission__code', flat=True)
        )
        return Response({
            'id': role.id,
            'name': role.name,
            'description': role.description,
            'features': self._get_features(role),
            'permissions': perms,
        })

    def delete(self, request, pk):
        try:
            role = Role.objects.get(pk=pk)
        except Role.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        role.delete()
        return Response(status=204)


class PermissionsListView(APIView):
    """GET: list all available permissions for the picker UI."""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request):
        perms = Permission.objects.all().order_by('code')
        data = [{'code': p.code, 'description': p.description} for p in perms]
        return Response(data)


class FeaturesListView(APIView):
    """GET: list all available features for the picker UI."""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request):
        from college.models import FeatureCatalog
        features = FeatureCatalog.objects.all().order_by('sort_order', 'category', 'name')
        data = [{'code': f.code, 'name': f.name, 'description': f.description, 'category': f.category} for f in features]
        return Response(data)
