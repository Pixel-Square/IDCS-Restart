from django.db.models.signals import post_save, m2m_changed
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

    # Run propagation immediately to ensure changes are reflected in the UI
    # before the user navigates away.
    if instance.for_all_departments:
        target_dept_ids = set(Department.objects.values_list('id', flat=True))
    else:
        target_dept_ids = set(instance.departments.values_list('id', flat=True))
    
    # Track current linked departments to reflect removals.
    existing_dept_ids = set(
        CurriculumDepartment.objects.filter(master=instance).values_list('department_id', flat=True)
    )
    removed_dept_ids = existing_dept_ids - target_dept_ids

    if removed_dept_ids:
        removed_qs = CurriculumDepartment.objects.filter(
            master=instance,
            department_id__in=removed_dept_ids,
        )
        for row in removed_qs:
            if getattr(row, 'overridden', False):
                # Keep overridden rows but unlink from master.
                row._syncing = True
                row.master = None
                row.save(update_fields=['master'])
            else:
                row.delete()

    dept_qs = Department.objects.filter(id__in=target_dept_ids)

    update_fields = [
        'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category',
        'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
        'editable', 'is_elective', 'is_dept_core', 'enabled_assessments',
    ]

    for dept in dept_qs:
        defaults = {
            'master': instance,
            'department': dept,
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
            'is_dept_core': getattr(instance, 'is_dept_core', False),
            'batch': getattr(instance, 'batch', None),
            # defaults for dept-specific fields
            'total_hours': (instance.l or 0) + (instance.t or 0) + (instance.p or 0),
            'question_paper_type': 'QP1',
        }

        # 1. Try to find existing row by master link first (most reliable for updates)
        obj = CurriculumDepartment.objects.filter(master=instance, department=dept).first()
        created_row = False

        if not obj:
            # 2. Fallback: find by unique curriculum key to link existing orphaned rows
            if instance.course_code:
                obj = CurriculumDepartment.objects.filter(
                    department=dept,
                    regulation=instance.regulation,
                    semester=instance.semester,
                    course_code=instance.course_code,
                    batch=getattr(instance, 'batch', None),
                ).first()
            
            if not obj:
                # 3. Create new if still not found
                obj = CurriculumDepartment.objects.create(**defaults)
                created_row = True
            else:
                # Link to master
                obj.master = instance
                obj.save(update_fields=['master'])

        if not created_row:
            # Always keep the master link current
            obj.master = instance
            # Always sync batch from master
            obj.batch = getattr(instance, 'batch', None)
            
            # Only update curriculum content fields when not overridden
            if not getattr(obj, 'overridden', False):
                for f in update_fields:
                    if f in defaults:
                        setattr(obj, f, defaults[f])
            
            # Signal to CurriculumDepartment.save() that this is a system sync
            obj._syncing = True
            try:
                obj.save()
            except Exception:
                pass


@receiver(m2m_changed, sender=CurriculumMaster.departments.through)
def propagate_master_departments_changed(sender, instance: CurriculumMaster, action, **kwargs):
    if action in {'post_add', 'post_remove', 'post_clear'}:
        propagate_master_to_departments(CurriculumMaster, instance, created=False)
