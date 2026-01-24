from django.test import TestCase
from django.core.exceptions import ValidationError

from applications import models as app_models
from applications.services import application_state
from django.contrib.auth import get_user_model


class SubmissionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='submitter', password='pw')
        self.at = app_models.ApplicationType.objects.create(name='Leave', code='LEAVE2')

    def test_submit_binds_form_version_and_validates(self):
        # create a field schema and an active form version
        field = app_models.ApplicationField.objects.create(application_type=self.at, field_key='reason', label='Reason', field_type='TEXT', is_required=True)
        app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.user)

        # missing data -> validation should raise within submit
        with self.assertRaises(Exception):
            application_state.submit_application(app, self.user)

        # provide data and submit
        app_models.ApplicationData.objects.create(application=app, field=field, value='Because I need leave')
        application_state.submit_application(app, self.user)
        app.refresh_from_db()
        self.assertEqual(app.current_state, app_models.Application.ApplicationState.SUBMITTED)
        self.assertIsNotNone(app.form_version)
