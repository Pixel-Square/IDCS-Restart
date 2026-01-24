from django.test import TestCase
from django.core.exceptions import ValidationError

from applications import models as app_models
from applications.services import application_state


class SubmissionFlowTests(TestCase):
    def setUp(self):
        user_model = app_models.Application._meta.get_field('applicant_user').remote_field.model
        self.user = user_model.objects.create(username='submitter')
        self.at = app_models.ApplicationType.objects.create(name='Generic', code='GEN')
        # create a required field so validation can run
        self.f_reason = app_models.ApplicationField.objects.create(
            application_type=self.at, field_key='reason', label='Reason', field_type='TEXT', is_required=True, order=1, meta={'min_length':3}
        )

    def test_submit_creates_form_version_and_binds(self):
        app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.user)
        # No active form version present; submit should snapshot
        application_state.submit_application(app, self.user)
        app.refresh_from_db()
        self.assertIsNotNone(app.form_version)
        self.assertEqual(app.current_state, app_models.Application.ApplicationState.SUBMITTED)

    def test_submit_validation_fails_for_bad_data(self):
        app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.user)
        # create ApplicationData with short reason => invalid
        app_models.ApplicationData.objects.create(application=app, field=self.f_reason, value='x')
        with self.assertRaises(Exception):
            application_state.submit_application(app, self.user)
