from django.test import TestCase
from django.contrib.auth import get_user_model

from applications import models as app_models
from applications.services import access_control


class InboxAccessTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='u1')
        self.applicant = User.objects.create_user(username='applicant2')
        self.role = app_models.Role.objects.create(name='STAFF') if hasattr(app_models, 'Role') else None
        from accounts.models import Role
        self.role = Role.objects.create(name='STAFF')
        self.user.roles.add(self.role)

        self.at = app_models.ApplicationType.objects.create(name='A', code='A')
        self.app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.applicant)

    def test_applicant_can_view(self):
        self.assertTrue(access_control.can_user_view_application(self.app, self.applicant))

    def test_unrelated_cannot_view(self):
        self.assertFalse(access_control.can_user_view_application(self.app, self.user))

    def test_acting_user_can_view(self):
        # create an approval action by user
        aa = app_models.ApprovalAction.objects.create(application=self.app, step=None, acted_by=self.user, action=app_models.ApprovalAction.Action.SKIPPED)
        self.assertTrue(access_control.can_user_view_application(self.app, self.user))
