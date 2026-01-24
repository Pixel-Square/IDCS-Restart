from django.test import TestCase
from django.contrib.auth import get_user_model

from applications import models as app_models
from applications.services import approval_engine, application_state


class ApprovalWorkflowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.mentor_role = app_models.Role.objects.create(name='MENTOR') if hasattr(app_models, 'Role') else None
        # accounts.Role lives in accounts.models.Role
        from accounts.models import Role
        self.mentor_role = Role.objects.create(name='MENTOR')
        self.advisor_role = Role.objects.create(name='ADVISOR')
        self.hod_role = Role.objects.create(name='HOD')
        self.ahod_role = Role.objects.create(name='AHOD')

        self.mentor = User.objects.create_user(username='mentor')
        self.mentor.roles.add(self.mentor_role)
        self.advisor = User.objects.create_user(username='advisor')
        self.advisor.roles.add(self.advisor_role)
        self.hod = User.objects.create_user(username='hod')
        self.hod.roles.add(self.hod_role)
        self.ahod = User.objects.create_user(username='ahod')
        self.ahod.roles.add(self.ahod_role)

        self.app_type = app_models.ApplicationType.objects.create(name='TypeA', code='TYPEA')
        self.flow = app_models.ApprovalFlow.objects.create(application_type=self.app_type)
        # attach steps
        self.step1 = app_models.ApprovalStep.objects.create(approval_flow=self.flow, order=1, role=self.mentor_role)
        self.step2 = app_models.ApprovalStep.objects.create(approval_flow=self.flow, order=2, role=self.advisor_role, auto_skip_if_unavailable=True, escalate_to_role=self.ahod_role)
        self.step3 = app_models.ApprovalStep.objects.create(approval_flow=self.flow, order=3, role=self.hod_role)

        self.applicant = User.objects.create_user(username='applicant')
        self.app = app_models.Application.objects.create(application_type=self.app_type, applicant_user=self.applicant)

    def test_full_approve_flow(self):
        # submit to bind form_version and set first step
        application_state._snapshot_schema_for_application_type(self.app_type)
        # manually set current step to first
        application_state.move_to_in_review(self.app, self.step1)

        # mentor approves
        updated = approval_engine.process_approval(self.app, self.mentor, 'APPROVE')
        updated.refresh_from_db()
        # After mentor approval, flow should move to next available
        self.assertEqual(updated.current_state, app_models.Application.ApplicationState.IN_REVIEW)

    def test_auto_skip_unavailable(self):
        # make advisor unavailable by monkeypatching is_approver_available
        original = approval_engine.is_approver_available
        approval_engine.is_approver_available = lambda role, app: False
        try:
            application_state.move_to_in_review(self.app, self.step1)
            approval_engine.process_approval(self.app, self.mentor, 'APPROVE')
            # after approval, advisor should be auto-skipped and hod becomes current
            self.app.refresh_from_db()
            self.assertEqual(self.app.current_step.order, 3)
            # There should be a SKIPPED action recorded for step2
            skipped = app_models.ApprovalAction.objects.filter(application=self.app, action=app_models.ApprovalAction.Action.SKIPPED).exists()
            self.assertTrue(skipped)
        finally:
            approval_engine.is_approver_available = original

    def test_reject_halts_flow(self):
        application_state.move_to_in_review(self.app, self.step1)
        # mentor rejects
        approval_engine.process_approval(self.app, self.mentor, 'REJECT')
        self.app.refresh_from_db()
        self.assertEqual(self.app.current_state, app_models.Application.ApplicationState.REJECTED)

    def test_override_role_can_act(self):
        # add a special override role to flow
        self.flow.override_roles.add(self.hod_role)
        application_state.move_to_in_review(self.app, self.step1)
        # hod (override) should be able to approve first step
        approval_engine.process_approval(self.app, self.hod, 'APPROVE')
        self.app.refresh_from_db()
        self.assertEqual(self.app.current_state, app_models.Application.ApplicationState.IN_REVIEW)

    def test_sla_escalation_allows_escalate_role(self):
        # mark step2 as overdue by monkeypatching sla_engine.is_step_overdue
        from applications.services import sla_engine
        original = sla_engine.is_step_overdue
        sla_engine.is_step_overdue = lambda application: True
        try:
            # move to step2
            application_state.move_to_in_review(self.app, self.step2)
            # ahod (escalation role) should be allowed to act
            allowed = approval_engine.user_can_act(self.app, self.ahod)
            self.assertTrue(allowed)
        finally:
            sla_engine.is_step_overdue = original
from django.test import TestCase
from django.core.exceptions import PermissionDenied

from applications import models as app_models
from applications.services import approval_engine, application_state


class ApprovalWorkflowTests(TestCase):
    def setUp(self):
        # create roles
        self.role_mentor = app_models.Role.objects.create(name='MENTOR')
        self.role_advisor = app_models.Role.objects.create(name='ADVISOR')
        self.role_hod = app_models.Role.objects.create(name='HOD')
        self.role_ahod = app_models.Role.objects.create(name='AHOD')

        # users
        UserModel = app_models.Application._meta.get_field('applicant_user').remote_field.model
        self.applicant = UserModel.objects.create(username='applicant')
        self.mentor = UserModel.objects.create(username='mentor')
        self.advisor = UserModel.objects.create(username='advisor')
        self.hod = UserModel.objects.create(username='hod')
        self.ahod = UserModel.objects.create(username='ahod')

        # assign roles
        self.mentor.roles.add(self.role_mentor)
        self.advisor.roles.add(self.role_advisor)
        self.hod.roles.add(self.role_hod)
        self.ahod.roles.add(self.role_ahod)

        # application type and flow
        self.at = app_models.ApplicationType.objects.create(name='Leave', code='LV')
        self.flow = app_models.ApprovalFlow.objects.create(application_type=self.at, is_active=True)
        # create steps: mentor -> advisor -> hod
        self.step1 = app_models.ApprovalStep.objects.create(approval_flow=self.flow, order=1, role=self.role_mentor, auto_skip_if_unavailable=False)
        self.step2 = app_models.ApprovalStep.objects.create(approval_flow=self.flow, order=2, role=self.role_advisor, auto_skip_if_unavailable=True)
        self.step3 = app_models.ApprovalStep.objects.create(approval_flow=self.flow, order=3, role=self.role_hod, auto_skip_if_unavailable=False, escalate_to_role=self.role_ahod)

        # create application and bind to flow via submit
        self.app = app_models.Application.objects.create(application_type=self.at, applicant_user=self.applicant)
        application_state.submit_application(self.app, self.applicant)

    def test_mentor_approve_moves_to_next(self):
        # mentor acts
        updated = approval_engine.process_approval(self.app, self.mentor, 'APPROVE', remarks='ok')
        self.assertEqual(updated.current_state, app_models.Application.ApplicationState.IN_REVIEW)
        # next current_step should be advisor (step2)
        self.assertEqual(updated.current_step.order, self.step2.order)
        # an ApprovalAction exists for step1
        self.assertTrue(app_models.ApprovalAction.objects.filter(application=self.app, step=self.step1, action=app_models.ApprovalAction.Action.APPROVED).exists())

    def test_auto_skip_unavailable(self):
        # monkeypatch is_approver_available to make advisor unavailable
        orig = approval_engine.is_approver_available
        try:
            def stub(role, application):
                if role == self.role_advisor:
                    return False
                return True
            approval_engine.is_approver_available = stub

            # mentor approves, advisor should be auto-skipped and flow goes to HOD
            updated = approval_engine.process_approval(self.app, self.mentor, 'APPROVE')
            self.assertEqual(updated.current_step.order, self.step3.order)
            # ensure a SKIPPED action was recorded for step2
            self.assertTrue(app_models.ApprovalAction.objects.filter(application=self.app, step=self.step2, action=app_models.ApprovalAction.Action.SKIPPED).exists())
        finally:
            approval_engine.is_approver_available = orig

    def test_reject_stops_flow(self):
        # mentor rejects
        updated = approval_engine.process_approval(self.app, self.mentor, 'REJECT', remarks='no')
        self.assertEqual(updated.current_state, app_models.Application.ApplicationState.REJECTED)
        self.assertTrue(app_models.ApprovalAction.objects.filter(application=self.app, step=self.step1, action=app_models.ApprovalAction.Action.REJECTED).exists())

    def test_override_role_allows_action(self):
        # create a role with override and assign to a user
        override_role = app_models.Role.objects.create(name='OVERRIDER')
        self.flow.override_roles.add(override_role)
        overrider = app_models.Application._meta.get_field('applicant_user').remote_field.model.objects.create(username='boss')
        overrider.roles.add(override_role)

        # even though overrider doesn't match step role, they may approve
        updated = approval_engine.process_approval(self.app, overrider, 'APPROVE')
        # after override approval, flow advances
        self.assertIn(updated.current_state, [app_models.Application.ApplicationState.IN_REVIEW, app_models.Application.ApplicationState.APPROVED])

    def test_sla_escalation_allows_escalated_role(self):
        # simulate SLA overdue and AHOD allowed to act on HOD step
        # move directly to HOD step
        application_state.move_to_in_review(self.app, self.step3)

        # monkeypatch sla_engine.is_step_overdue to True
        from applications import services as services_pkg
        sla_engine = services_pkg.sla_engine
        orig = sla_engine.is_step_overdue
        try:
            sla_engine.is_step_overdue = lambda application: True
            # AHOD should be allowed to act via escalation
            allowed = approval_engine.user_can_act(self.app, self.ahod)
            self.assertTrue(allowed)
            # AHOD approves
            updated = approval_engine.process_approval(self.app, self.ahod, 'APPROVE')
            # after approval, should be approved or moved forward
            self.assertIn(updated.current_state, [app_models.Application.ApplicationState.IN_REVIEW, app_models.Application.ApplicationState.APPROVED])
        finally:
            sla_engine.is_step_overdue = orig

    def test_missing_flow_raises(self):
        # create an application type without flow
        at2 = app_models.ApplicationType.objects.create(name='X', code='X')
        app2 = app_models.Application.objects.create(application_type=at2, applicant_user=self.applicant)
        with self.assertRaises(ValueError):
            approval_engine.process_approval(app2, self.mentor, 'APPROVE')
