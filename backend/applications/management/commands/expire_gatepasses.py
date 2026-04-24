"""Management command: expire_gatepasses

Runs at midnight (12:00 AM IST) to expire gatepass applications whose
selected date has passed.

Behaviour:
  - SUBMITTED / IN_REVIEW gatepasses whose gatepass date is yesterday or
    earlier → mark as CANCELLED (auto-cancelled at midnight).
  - APPROVED gatepasses that have NOT been scanned out and whose hard expiry
    (midnight of the next day after the gatepass date) has passed → mark as
    CANCELLED (auto-cancelled at midnight).

Schedule this command via Windows Task Scheduler or cron to run daily at
00:01 IST (or just after midnight).

Usage:
    python manage.py expire_gatepasses [--dry-run]
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from applications import models as app_models
from applications.services.gatepass_utils import extract_gate_date, gatepass_hard_expiry, is_gatepass_application


class Command(BaseCommand):
    help = "Cancel gatepass applications that have passed their midnight expiry."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would be done without making any DB changes.",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        now = timezone.now()
        today_local = timezone.localtime(now).date()

        cancelled_pending = 0
        cancelled_approved = 0
        skipped = 0
        errors = 0

        self.stdout.write(
            f"[expire_gatepasses] Running at {timezone.localtime(now).strftime('%Y-%m-%d %H:%M:%S %Z')}"
            + (" [DRY RUN]" if dry_run else "")
        )

        # ── 1. Cancel SUBMITTED / IN_REVIEW gatepasses whose date has passed ──
        pending_qs = (
            app_models.Application.objects
            .filter(current_state__in=["SUBMITTED", "IN_REVIEW"])
            .select_related("application_type")
            .prefetch_related("data__field")
        )

        for app in pending_qs.iterator(chunk_size=200):
            try:
                if not is_gatepass_application(app):
                    skipped += 1
                    continue

                gate_date = extract_gate_date(app)
                if gate_date is None:
                    skipped += 1
                    continue

                # Cancel if gate date is strictly before today (yesterday or older)
                if gate_date >= today_local:
                    skipped += 1
                    continue

                self.stdout.write(
                    f"  [PENDING->CANCELLED] app_id={app.id} gate_date={gate_date} "
                    f"state={app.current_state}"
                )

                if not dry_run:
                    with transaction.atomic():
                        locked = app_models.Application.objects.select_for_update().get(pk=app.pk)
                        # Re-check state inside lock
                        if locked.current_state not in ("SUBMITTED", "IN_REVIEW"):
                            continue
                        locked.current_state = app_models.Application.ApplicationState.CANCELLED
                        locked.status = app_models.Application.ApplicationState.CANCELLED
                        locked.final_decision_at = now
                        locked.current_step = None
                        locked.save(update_fields=["current_state", "status", "final_decision_at", "current_step"])

                cancelled_pending += 1

            except Exception as exc:
                errors += 1
                self.stderr.write(f"  [ERROR] app_id={app.id}: {exc}")

        # ── 2. Cancel APPROVED gatepasses that expired (not scanned out) ──
        approved_qs = (
            app_models.Application.objects
            .filter(
                current_state="APPROVED",
                gatepass_scanned_at__isnull=True,  # no OUT scan yet
            )
            .select_related("application_type")
            .prefetch_related("data__field")
        )

        for app in approved_qs.iterator(chunk_size=200):
            try:
                if not is_gatepass_application(app):
                    skipped += 1
                    continue

                expiry = gatepass_hard_expiry(app)
                if expiry is None:
                    skipped += 1
                    continue

                # Cancel only if hard expiry has passed
                if now < expiry:
                    skipped += 1
                    continue

                self.stdout.write(
                    f"  [APPROVED->CANCELLED] app_id={app.id} expiry={timezone.localtime(expiry).strftime('%Y-%m-%d %H:%M')}"
                )

                if not dry_run:
                    with transaction.atomic():
                        locked = app_models.Application.objects.select_for_update().get(pk=app.pk)
                        # Re-check state inside lock
                        if locked.current_state != "APPROVED" or locked.gatepass_scanned_at is not None:
                            continue
                        locked.current_state = app_models.Application.ApplicationState.CANCELLED
                        locked.status = app_models.Application.ApplicationState.CANCELLED
                        locked.final_decision_at = now
                        locked.current_step = None
                        locked.save(update_fields=["current_state", "status", "final_decision_at", "current_step"])

                cancelled_approved += 1

            except Exception as exc:
                errors += 1
                self.stderr.write(f"  [ERROR] app_id={app.id}: {exc}")

        self.stdout.write(
            f"[expire_gatepasses] Done. "
            f"Cancelled pending={cancelled_pending}, "
            f"Cancelled approved={cancelled_approved}, "
            f"Skipped={skipped}, Errors={errors}"
        )
