from rest_framework import serializers

from applications import models as app_models


class ApplicationAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.SerializerMethodField(read_only=True)
    file_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = app_models.ApplicationAttachment
        fields = ('id', 'label', 'file_url', 'uploaded_by', 'uploaded_at')
        read_only_fields = fields

    def get_uploaded_by(self, obj):
        if not obj.uploaded_by:
            return None
        return {'id': obj.uploaded_by.id, 'username': getattr(obj.uploaded_by, 'username', None)}

    def get_file_url(self, obj):
        try:
            return obj.file.url
        except Exception:
            return None


class ApplicationAttachmentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = app_models.ApplicationAttachment
        fields = ('id', 'label', 'file')
