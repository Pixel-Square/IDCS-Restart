from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model

from applications import models as app_models
from applications.services import attachment_service


class AttachmentTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='attach_user')
        self.at = app_models.ApplicationType.objects.create(name='A', code='ATT')
        self.app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.user)

    def test_upload_and_soft_delete(self):
        # attachments allowed in DRAFT
        f = SimpleUploadedFile('test.txt', b'hello')
        att = app_models.ApplicationAttachment.objects.create(application=self.app, uploaded_by=self.user, file=f, label='doc')
        # list via service should include it
        qs = attachment_service.list_attachments(self.app, self.user)
        self.assertEqual(qs.count(), 1)

        # soft-delete
        att.is_deleted = True
        att.save(update_fields=['is_deleted'])
        qs2 = attachment_service.list_attachments(self.app, self.user)
        self.assertEqual(qs2.count(), 0)
