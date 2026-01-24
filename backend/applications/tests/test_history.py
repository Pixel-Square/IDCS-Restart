from django.test import TestCase
from django.contrib.auth import get_user_model

from applications import models as app_models
from applications.serializers.approval import ApplicationApprovalHistorySerializer


class HistoryTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='hist_user')
        self.at = app_models.ApplicationType.objects.create(name='H', code='HIST')
        self.app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.user)

    def test_approval_history_serializer(self):
        # create actions in time order
        a1 = app_models.ApprovalAction.objects.create(application=self.app, step=None, acted_by=self.user, action=app_models.ApprovalAction.Action.APPROVED)
        a2 = app_models.ApprovalAction.objects.create(application=self.app, step=None, acted_by=None, action=app_models.ApprovalAction.Action.SKIPPED)
        qs = app_models.ApprovalAction.objects.filter(application=self.app).order_by('acted_at')
        ser = ApplicationApprovalHistorySerializer(qs, many=True)
        data = ser.data
        self.assertEqual(len(data), 2)
        # first entry should have acted_by with id
        self.assertIsNotNone(data[0]['acted_by'])
