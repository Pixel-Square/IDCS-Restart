from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile

from applications import models as app_models
from applications.services import access_control, attachment_service
from applications.serializers.approval import ApplicationApprovalHistorySerializer
from applications import services as services_pkg


class AccessAndAttachmentTests(TestCase):
    def setUp(self):
        User = app_models.Application._meta.get_field('applicant_user').remote_field.model
        self.applicant = User.objects.create(username='applicant')
        self.other = User.objects.create(username='other')
        self.superuser = User.objects.create(username='admin', is_superuser=True)

        # roles
        self.role_mentor = app_models.Role.objects.create(name='MENTOR')
        self.mentor = User.objects.create(username='mentor')
        self.mentor.roles.add(self.role_mentor)

        # application type and flow
        self.at = app_models.ApplicationType.objects.create(name='Leave', code='LV2')
        self.flow = app_models.ApprovalFlow.objects.create(application_type=self.at, is_active=True)
        self.step1 = app_models.ApprovalStep.objects.create(approval_flow=self.flow, order=1, role=self.role_mentor)

        self.app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.applicant)

    def test_can_user_view_application_rules(self):
        # applicant can view
        self.assertTrue(access_control.can_user_view_application(self.app, self.applicant))
        # superuser can view
        self.assertTrue(access_control.can_user_view_application(self.app, self.superuser))
        # approver can view (has role)
        self.assertTrue(access_control.can_user_view_application(self.app, self.mentor))
        # unrelated cannot
        self.assertFalse(access_control.can_user_view_application(self.app, self.other))
        # acted_by user can view
        app_models.ApprovalAction.objects.create(application=self.app, step=self.step1, acted_by=self.other, action=app_models.ApprovalAction.Action.APPROVED)
        self.assertTrue(access_control.can_user_view_application(self.app, self.other))

    def test_attachment_upload_and_soft_delete(self):
        # applicant can upload in DRAFT
        f = SimpleUploadedFile('a.txt', b'hello')
        att = app_models.ApplicationAttachment.objects.create(application=self.app, uploaded_by=self.applicant, file=f, label='note')
        self.assertFalse(att.is_deleted)
        # list_attachments returns it
        qs = attachment_service.list_attachments(self.app, self.applicant)
        self.assertEqual(qs.count(), 1)

        # soft-delete: mark is_deleted=True
        att.is_deleted = True
        att.save(update_fields=['is_deleted'])
        qs2 = attachment_service.list_attachments(self.app, self.applicant)
        self.assertEqual(qs2.count(), 0)

    def test_approval_history_serializer(self):
        # create actions
        a1 = app_models.ApprovalAction.objects.create(application=self.app, step=self.step1, acted_by=self.mentor, action=app_models.ApprovalAction.Action.APPROVED, remarks='ok')
        a2 = app_models.ApprovalAction.objects.create(application=self.app, step=self.step1, acted_by=None, action=app_models.ApprovalAction.Action.SKIPPED, remarks='auto')
        ser = ApplicationApprovalHistorySerializer([a1, a2], many=True)
        data = ser.data
        self.assertEqual(len(data), 2)
        # first entry contains acted_by dict
        self.assertIn('acted_by', data[0])
