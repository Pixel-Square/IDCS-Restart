from typing import Any

from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from applications import models as app_models
from applications.serializers import (
    ApplicationCreateSerializer,
    ApplicationListSerializer,
    ApplicationDetailSerializer,
    ApprovalActionSerializer,
)
from applications.services import approval_engine
from applications.services import access_control
from applications.serializers.approval import ApplicationApprovalHistorySerializer
from django.shortcuts import get_object_or_404


class CreateApplicationView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        serializer = ApplicationCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        application = serializer.save()
        return Response({'id': application.id, 'status': application.status}, status=status.HTTP_201_CREATED)


class MyApplicationsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        qs = app_models.Application.objects.filter(applicant_user=request.user).order_by('-created_at')
        serializer = ApplicationListSerializer(qs, many=True)
        return Response(serializer.data)


class PendingApplicationsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, *args, **kwargs):
        # For now, consider only SUBMITTED applications
        candidates = app_models.Application.objects.filter(status=app_models.Application.Status.SUBMITTED).order_by('-created_at')
        pending = []
        for app in candidates:
            if approval_engine.user_can_act(app, request.user):
                pending.append(app)

        serializer = ApplicationListSerializer(pending, many=True)
        return Response(serializer.data)


class ApplicationDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)

        # Centralized access control
        if not access_control.can_user_view_application(application, request.user):
            return Response({'detail': 'Not authorized to view this application'}, status=status.HTTP_403_FORBIDDEN)

        serializer = ApplicationDetailSerializer(application)
        return Response(serializer.data)


class ApplicationApproveView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)
        remarks = request.data.get('remarks')

        with transaction.atomic():
            try:
                updated = approval_engine.process_approval(application, request.user, 'APPROVE', remarks=remarks)
            except Exception as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'id': updated.id, 'status': updated.status})


class ApplicationRejectView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)
        remarks = request.data.get('remarks')

        with transaction.atomic():
            try:
                updated = approval_engine.process_approval(application, request.user, 'REJECT', remarks=remarks)
            except Exception as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'id': updated.id, 'status': updated.status})


class ApplicationApprovalHistoryView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)

        # Centralized access control for viewing history
        if not access_control.can_user_view_application(application, request.user):
            return Response({'detail': 'Not authorized to view approval history'}, status=403)

        # Build actions queryset ordered chronologically (created/acted_at asc)
        actions_qs = application.actions.select_related('acted_by', 'step__role').prefetch_related('acted_by__roles').order_by('acted_at')

        timeline = ApplicationApprovalHistorySerializer(actions_qs, many=True).data

        return Response({
            'application_id': application.id,
            'application_type': application.application_type.name if application.application_type else None,
            'current_state': application.current_state,
            'timeline': timeline,
        })
