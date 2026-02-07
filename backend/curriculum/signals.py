from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from .models import CurriculumMaster, CurriculumDepartment
from academics.models import Department


@receiver(post_save, sender=CurriculumMaster)
def propagate_master_to_departments(sender, instance: CurriculumMaster, created, **kwargs):
    """Create or update department-level curriculum rows after a master is saved.

    Behavior:
    - If `for_all_departments` is True -> create/update for all departments.
    - Otherwise create/update for `instance.departments.all()`.
    - Do not overwrite department rows where `overridden=True`.
    """

    def _propagate():
        if instance.for_all_departments:
            dept_qs = Department.objects.all()
        else:
            dept_qs = instance.departments.all()

        for dept in dept_qs:
            defaults = {
                'regulation': instance.regulation,
                'semester': instance.semester,
                'course_code': instance.course_code,
                'course_name': instance.course_name,
                'class_type': instance.class_type,
                'category': instance.category,
                'is_elective': instance.is_elective,
                'l': instance.l,
                't': instance.t,
                'p': instance.p,
                's': instance.s,
                'c': instance.c,
                'internal_mark': instance.internal_mark,
                'external_mark': instance.external_mark,
                'total_mark': instance.total_mark,
                'editable': instance.editable,
                # defaults for dept-specific only
                'total_hours': 20,
                'question_paper_type': 'QP1',
                'master': instance,
            }

            obj, created_row = CurriculumDepartment.objects.get_or_create(
                master=instance, department=dept, defaults=defaults
            )

            if not created_row:
                # update fields from master when not overridden
                if not obj.overridden:
                    # update allowed fields
                    update_fields = [
                        'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category',
                            'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark', 'editable', 'is_elective'
                    ]
                    for f in update_fields:
                        if f in defaults:
                            setattr(obj, f, defaults[f])

                    # Log the fields being updated for debugging
                    updated_fields = {f: defaults[f] for f in update_fields if f in defaults}
                    print(f"Updating fields for department {dept.id}: {updated_fields}")

                    # ensure master link is set
                    obj.master = instance
                    try:
                        obj.save()
                    except Exception as e:
                        print(f"Error saving department {dept.id}: {e}")

    # Run after transaction commit to ensure master is persisted
    transaction.on_commit(_propagate)
