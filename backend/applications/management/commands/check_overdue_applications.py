from django.core.management.base import BaseCommand
from django.utils import timezone

from applications import models as app_models
from applications.services import sla_engine


class Command(BaseCommand):
    help = 'Find IN_REVIEW applications and escalate overdue steps.'

    def handle(self, *args, **options):
        qs = app_models.Application.objects.filter(current_state=app_models.Application.ApplicationState.IN_REVIEW).select_related('application_type', 'current_step')
        now = timezone.now()
        count = 0
        for app in qs.iterator():
            try:
                escalated = sla_engine.escalate_overdue_application(app)
                if escalated:
                    count += 1
                    self.stdout.write(f'Escalated application {app.id} at {now}')
            except Exception as exc:
                self.stderr.write(f'Error processing application {app.id}: {exc}')

        self.stdout.write(f'Done. Escalations sent: {count}')
