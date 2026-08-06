from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from ..models import Role, Permission, RolePermission
from ..permissions_super_admin import IsSuperAdminOrSuperuser


class RolesManagementListCreateView(APIView):
    """GET: list all roles with permissions.  POST: create a new role."""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request):
        roles = Role.objects.all().order_by('name')
        data = []
        for r in roles:
            feats = list(r.features.values_list('code', flat=True))
            perms = list(
                RolePermission.objects.filter(role=r)
                .select_related('permission')
                .values_list('permission__code', flat=True)
            )
            data.append({
                'id': r.id,
                'name': r.name,
                'description': r.description,
                'features': feats,
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

        from college.models import FeatureCatalog
        features = FeatureCatalog.objects.filter(code__in=feature_codes)
        role.features.set(features)

        return Response({
            'id': role.id,
            'name': role.name,
            'description': role.description,
            'features': list(role.features.values_list('code', flat=True)),
            'permissions': list(
                RolePermission.objects.filter(role=role).values_list('permission__code', flat=True)
            ),
        }, status=201)


class RoleDetailView(APIView):
    """GET / PUT / DELETE a single role."""
    permission_classes = [IsSuperAdminOrSuperuser]

    def get(self, request, pk):
        try:
            role = Role.objects.get(pk=pk)
        except Role.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        feats = list(role.features.values_list('code', flat=True))
        perms = list(
            RolePermission.objects.filter(role=role)
            .values_list('permission__code', flat=True)
        )
        return Response({
            'id': role.id,
            'name': role.name,
            'description': role.description,
            'features': feats,
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

        feats = list(role.features.values_list('code', flat=True))
        perms = list(
            RolePermission.objects.filter(role=role).values_list('permission__code', flat=True)
        )
        return Response({
            'id': role.id,
            'name': role.name,
            'description': role.description,
            'features': feats,
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
