import logging
from django.db.models.signals import pre_save
from django.dispatch import receiver
from academics.models import AcademicYear

logger = logging.getLogger(__name__)

@receiver(pre_save, sender=AcademicYear)
def trigger_semester_end_archive(sender, instance: AcademicYear, **kwargs):
    """
    Detects when an AcademicYear transitions from is_active=True to is_active=False.
    This signifies the end of a semester/academic year in the system.
    We trigger an automatic config export for the 'feedback' section.
    """
    if not instance.pk:
        return  # newly created, can't be deactivating
        
    # Only care if it is being deactivated
    if instance.is_active:
        return
        
    try:
        # Fetch the old state from the DB
        old_instance = AcademicYear.objects.get(pk=instance.pk)
        
        # If it was active and is now being deactivated
        if old_instance.is_active and not instance.is_active:
            logger.info(f"Semester end detected: Deactivating AcademicYear {instance.name} ({instance.parity})")
            
            # Fire the celery task for the 'feedback' section
            from .tasks import task_config_export
            
            # Use 'System' user (None) and pass archive metadata
            task_config_export.delay(
                'feedback', 
                user_id=None,
                export_type='semester_archive',
                academic_year=old_instance.name,
                semester_label=old_instance.parity
            )
            
    except AcademicYear.DoesNotExist:
        pass
    except Exception as e:
        logger.exception("Failed to trigger semester end config archive")
