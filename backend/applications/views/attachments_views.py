from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from django.shortcuts import get_object_or_404

from applications import models as app_models
from applications.services import attachment_service
from applications.serializers.attachment import ApplicationAttachmentSerializer, ApplicationAttachmentCreateSerializer


class ApplicationAttachmentListCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)
        qs = attachment_service.list_attachments(application, request.user)
        serializer = ApplicationAttachmentSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request, id: int, *args, **kwargs):
        application = get_object_or_404(app_models.Application, pk=id)
        if not attachment_service.can_upload(application, request.user):
            return Response({'detail': 'Not authorized to upload attachments'}, status=status.HTTP_403_FORBIDDEN)

        serializer = ApplicationAttachmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        inst = serializer.save(application=application, uploaded_by=request.user)
        out = ApplicationAttachmentSerializer(inst)
        return Response(out.data, status=status.HTTP_201_CREATED)


class ApplicationAttachmentDeleteView(APIView):
    permission_classes = (IsAuthenticated,)

    def delete(self, request, id: int, *args, **kwargs):
        attachment = get_object_or_404(app_models.ApplicationAttachment, pk=id)
        application = attachment.application
        if not attachment_service.can_delete(application, request.user):
            return Response({'detail': 'Not authorized to delete attachment'}, status=status.HTTP_403_FORBIDDEN)

        # Soft delete
        attachment.is_deleted = True
        attachment.save(update_fields=['is_deleted'])
        return Response(status=status.HTTP_204_NO_CONTENT)
