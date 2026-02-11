from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from applications import models as app_models
from applications.serializers.types import (
    ApplicationTypeListSerializer,
    ApplicationTypeSchemaSerializer,
)


class ApplicationTypeListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        qs = app_models.ApplicationType.objects.filter(is_active=True).order_by('name')
        serializer = ApplicationTypeListSerializer(qs, many=True)
        return Response(serializer.data)


class ApplicationTypeSchemaView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, id: int, *args, **kwargs):
        app_type = get_object_or_404(app_models.ApplicationType, pk=id, is_active=True)

        # fields for this application type
        fields_qs = app_models.ApplicationField.objects.filter(application_type=app_type).order_by('order')

        # active form version if any (prefer is_active, fallback to latest)
        active_form = app_models.ApplicationFormVersion.objects.filter(application_type=app_type, is_active=True).order_by('-version').first()
        if not active_form:
            active_form = app_models.ApplicationFormVersion.objects.filter(application_type=app_type).order_by('-version').first()

        payload = {
            'id': app_type.id,
            'name': app_type.name,
            'code': app_type.code,
            'description': app_type.description,
            'fields': fields_qs,
            'active_form': active_form,
            'role_permissions': app_type.role_permissions.all(),
        }

        serializer = ApplicationTypeSchemaSerializer(payload)
        return Response(serializer.data, status=status.HTTP_200_OK)
