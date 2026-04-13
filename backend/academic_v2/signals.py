from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='academic_v2.AcV2ClassType')
def sync_class_type_to_curriculum(sender, instance, **kwargs):
    """When an Academic v2 class type is created/updated, ensure a matching
    entry exists in the curriculum ClassType table so it can be selected
    in department curriculum dropdowns."""
    try:
        from curriculum.models import ClassType
        code = instance.short_code or instance.name
        label = instance.display_name or instance.name
        obj, created = ClassType.objects.update_or_create(
            code=code,
            defaults={'label': label},
        )
    except Exception:
        pass
