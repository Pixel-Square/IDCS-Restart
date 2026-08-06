"""
Celery tasks for the backups_logs application.

Each task maps 1:1 to an existing synchronous service function.
The task wraps the service call with:
  - Immediate model status update to 'running'
  - The existing service logic (unchanged)
  - Final status update to 'success' or 'failed'

No backup/restore/config logic lives here — it stays in services.py.
"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


def _set_snapshot_running(snapshot_id):
    """Mark a BackupSnapshot as running."""
    from .models import BackupSnapshot
    BackupSnapshot.objects.filter(id=snapshot_id).update(status='running')


def _set_export_running(export_id):
    """Mark a ConfigExport as running."""
    from .models import ConfigExport
    ConfigExport.objects.filter(id=export_id).update(status='running')


@shared_task(bind=True, name='backups_logs.raw_snapshot')
def task_raw_snapshot(self, section_id, user_id=None):
    """
    Async wrapper for perform_raw_snapshot().
    Returns snapshot id on success.
    """
    from django.contrib.auth import get_user_model
    from .services import perform_raw_snapshot

    User = get_user_model()
    user = User.objects.filter(id=user_id).first() if user_id else None

    try:
        snapshot = perform_raw_snapshot(section_id, user=user)
        return {'status': 'success', 'snapshot_id': str(snapshot.id)}
    except Exception as exc:
        logger.exception(f"task_raw_snapshot failed for section {section_id}")
        raise self.retry(exc=exc, max_retries=0)  # no retries — let it fail cleanly


@shared_task(bind=True, name='backups_logs.restore_raw_snapshot')
def task_restore_raw_snapshot(self, snapshot_id, user_id=None):
    """
    Async wrapper for perform_raw_restore().
    The entire safety-snapshot + restore chain runs as one task.
    """
    from django.contrib.auth import get_user_model
    from .services import perform_raw_restore
    from .models import BackupSnapshot

    User = get_user_model()
    user = User.objects.filter(id=user_id).first() if user_id else None

    # Set the target snapshot to 'running' so the UI can reflect this
    _set_snapshot_running(snapshot_id)

    try:
        perform_raw_restore(snapshot_id, user=user)
        return {'status': 'success', 'snapshot_id': str(snapshot_id)}
    except Exception as exc:
        logger.exception(f"task_restore_raw_snapshot failed for snapshot {snapshot_id}")
        raise self.retry(exc=exc, max_retries=0)


@shared_task(bind=True, name='backups_logs.config_export')
def task_config_export(self, section_id, user_id=None, export_type='manual', academic_year=None, semester_label=None):
    """
    Async wrapper for perform_config_export().
    """
    from django.contrib.auth import get_user_model
    from .services import perform_config_export

    User = get_user_model()
    user = User.objects.filter(id=user_id).first() if user_id else None

    try:
        export = perform_config_export(
            section_id, 
            user=user, 
            export_type=export_type,
            academic_year=academic_year,
            semester_label=semester_label
        )
        return {'status': 'success', 'export_id': str(export.id)}
    except Exception as exc:
        logger.exception(f"task_config_export failed for section {section_id}")
        raise self.retry(exc=exc, max_retries=0)


@shared_task(bind=True, name='backups_logs.config_import')
def task_config_import(self, export_id, target_section_id, user_id=None):
    """
    Async wrapper for perform_config_import().
    The entire safety-snapshot + import chain runs as one task.
    """
    from django.contrib.auth import get_user_model
    from .services import perform_config_import
    from .models import ConfigExport

    User = get_user_model()
    user = User.objects.filter(id=user_id).first() if user_id else None

    # Mark the export as running so the UI can reflect this
    _set_export_running(export_id)

    try:
        perform_config_import(export_id, target_section_id, user=user)
        return {'status': 'success', 'export_id': str(export_id)}
    except Exception as exc:
        logger.exception(f"task_config_import failed for export {export_id}")
        raise self.retry(exc=exc, max_retries=0)
