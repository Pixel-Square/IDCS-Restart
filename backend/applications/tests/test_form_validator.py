from django.test import TestCase
from django.core.exceptions import ValidationError

from applications import models as app_models
from applications.services import form_validator
from django.contrib.auth import get_user_model


class FormValidatorTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='alice', password='pw')
        self.at = app_models.ApplicationType.objects.create(name='Leave', code='LEAVE')

    def _create_app_and_fields(self, fields_schema):
        # create ApplicationField rows matching the schema
        for idx, f in enumerate(fields_schema):
            app_models.ApplicationField.objects.create(
                application_type=self.at,
                field_key=f['field_key'],
                label=f.get('label', f['field_key']),
                field_type=f.get('field_type', 'TEXT'),
                is_required=f.get('is_required', False),
                order=idx,
                meta=f.get('meta', {}),
            )

        app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.user)
        return app

    def test_text_field_required_and_length(self):
        schema = {
            'fields': [
                {'field_key': 'reason', 'field_type': 'TEXT', 'is_required': True, 'meta': {'min_length': 5, 'max_length': 20}},
            ]
        }
        # create fields table
        self._create_app_and_fields(schema['fields'])

        fv = app_models.ApplicationFormVersion.objects.create(application_type=self.at, version=1, schema=schema, is_active=True)
        app = app_models.Application.objects.filter(application_type=self.at).first()

        # Missing value should raise
        with self.assertRaises(ValidationError):
            form_validator.validate_application_data(fv, app.data.all())

        # provide too short
        field = app_models.ApplicationField.objects.get(application_type=self.at, field_key='reason')
        app_models.ApplicationData.objects.create(application=app, field=field, value='hey')
        with self.assertRaises(ValidationError):
            form_validator.validate_application_data(fv, app.data.select_related('field').all())

        # valid length
        app.data.update(value='Hello world')
        self.assertTrue(form_validator.validate_application_data(fv, app.data.select_related('field').all()))

    def test_select_enum_and_types(self):
        schema = {
            'fields': [
                {'field_key': 'leave_type', 'field_type': 'SELECT', 'is_required': True, 'meta': {'choices': ['SICK', 'CASUAL']}},
                {'field_key': 'is_paid', 'field_type': 'BOOLEAN', 'is_required': False},
                {'field_key': 'days', 'field_type': 'NUMBER', 'is_required': True},
            ]
        }
        self._create_app_and_fields(schema['fields'])
        fv = app_models.ApplicationFormVersion.objects.create(application_type=self.at, version=1, schema=schema, is_active=True)
        app = app_models.Application.objects.filter(application_type=self.at).first()

        # invalid select
        lf = app_models.ApplicationField.objects.get(field_key='leave_type', application_type=self.at)
        df = app_models.ApplicationField.objects.get(field_key='days', application_type=self.at)
        bf = app_models.ApplicationField.objects.get(field_key='is_paid', application_type=self.at)
        app_models.ApplicationData.objects.create(application=app, field=lf, value='INVALID')
        app_models.ApplicationData.objects.create(application=app, field=df, value=2)
        app_models.ApplicationData.objects.create(application=app, field=bf, value=True)

        with self.assertRaises(ValidationError):
            form_validator.validate_application_data(fv, app.data.select_related('field').all())

        # correct choice
        app_models.ApplicationData.objects.filter(field=lf).update(value='SICK')
        self.assertTrue(form_validator.validate_application_data(fv, app.data.select_related('field').all()))
from django.test import TestCase
from django.core.exceptions import ValidationError

from applications import models as app_models
from applications.services import form_validator


class FormValidatorTests(TestCase):
    def setUp(self):
        self.at = app_models.ApplicationType.objects.create(name='Leave', code='LEAVE')
        # create fields used by schema
        self.f_text = app_models.ApplicationField.objects.create(
            application_type=self.at, field_key='reason', label='Reason', field_type='TEXT', is_required=True, order=1, meta={'min_length':5, 'max_length':200}
        )
        self.f_number = app_models.ApplicationField.objects.create(
            application_type=self.at, field_key='days', label='Days', field_type='NUMBER', is_required=True, order=2, meta={}
        )
        self.f_select = app_models.ApplicationField.objects.create(
            application_type=self.at, field_key='type', label='Type', field_type='SELECT', is_required=False, order=3, meta={'choices':['SICK','CASUAL']}
        )
        self.form_version = app_models.ApplicationFormVersion.objects.create(
            application_type=self.at,
            version=1,
            schema={'fields': [
                {'field_key': 'reason', 'field_type': 'TEXT', 'is_required': True, 'meta': {'min_length':5, 'max_length':200}},
                {'field_key': 'days', 'field_type': 'NUMBER', 'is_required': True, 'meta': {}},
                {'field_key': 'type', 'field_type': 'SELECT', 'is_required': False, 'meta': {'choices': ['SICK','CASUAL']}},
            ]},
            is_active=True,
        )

    def _make_application_with_values(self, values: dict):
        user_model = app_models.Application._meta.get_field('applicant_user').remote_field.model
        u = user_model.objects.create(username='alice')
        app = app_models.Application.objects.create(application_type=self.at, applicant_user=u)
        # create ApplicationData rows
        for fk, val in values.items():
            field = app_models.ApplicationField.objects.get(application_type=self.at, field_key=fk)
            app_models.ApplicationData.objects.create(application=app, field=field, value=val)
        return app

    def test_validate_valid_data(self):
        app = self._make_application_with_values({'reason': 'Medical leave', 'days': 2, 'type': 'SICK'})
        # should not raise
        result = form_validator.validate_application_data(self.form_version, app.data.all())
        self.assertTrue(result)

    def test_missing_required_field_raises(self):
        app = self._make_application_with_values({'reason': '', 'days': 2})
        with self.assertRaises(ValidationError) as cm:
            form_validator.validate_application_data(self.form_version, app.data.all())
        self.assertIn('reason', cm.exception.message_dict)

    def test_text_length_constraints(self):
        app = self._make_application_with_values({'reason': 'bad', 'days': 1})
        with self.assertRaises(ValidationError) as cm:
            form_validator.validate_application_data(self.form_version, app.data.all())
        self.assertIn('reason', cm.exception.message_dict)

    def test_select_enum_validation(self):
        app = self._make_application_with_values({'reason': 'Valid reason', 'days': 1, 'type': 'VACATION'})
        with self.assertRaises(ValidationError) as cm:
            form_validator.validate_application_data(self.form_version, app.data.all())
        self.assertIn('type', cm.exception.message_dict)
