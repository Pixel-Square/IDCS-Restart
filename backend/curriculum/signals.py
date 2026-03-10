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

        update_fields = [
            'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category',
            'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
            'editable', 'is_elective', 'enabled_assessments',
        ]

        for dept in dept_qs:
            defaults = {
                'master': instance,
                'regulation': instance.regulation,
                'semester': instance.semester,
                'course_code': instance.course_code,
                'course_name': instance.course_name,
                'class_type': instance.class_type,
                'enabled_assessments': getattr(instance, 'enabled_assessments', []) or [],
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
                'batch': getattr(instance, 'batch', None),
                # defaults for dept-specific fields
                'total_hours': 20,
                'question_paper_type': 'QP1',
            }

            # Use the unique_together fields (department, regulation, semester, course_code)
            # as the lookup key so get_or_create never conflicts with the DB constraint.
            # For NULL course_code, fall back to master+department to avoid matching the
            # wrong row (NULLs are never equal in SQL unique indexes).
            if instance.course_code:
                lookup = {
                    'department': dept,
                    'regulation': instance.regulation,
                    'semester': instance.semester,
                    'course_code': instance.course_code,
                }
            else:
                lookup = {'master': instance, 'department': dept}

            try:
                obj, created_row = CurriculumDepartment.objects.get_or_create(
                    **lookup, defaults=defaults
                )
            except Exception as e:
                print(f"Error in get_or_create for department {dept.id}: {e}")
                continue

            if not created_row:
                # Always keep the master link current
                obj.master = instance
                # Always sync batch from master
                obj.batch = getattr(instance, 'batch', None)
                # Only update curriculum content fields when not overridden
                if not obj.overridden:
                    for f in update_fields:
                        if f in defaults:
                            setattr(obj, f, defaults[f])
                try:
                    obj.save()
                except Exception as e:
                    print(f"Error saving department {dept.id}: {e}")

    # Run after transaction commit to ensure master is persisted
    transaction.on_commit(_propagate)
