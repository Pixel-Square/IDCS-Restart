from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from .models import CurriculumMaster, CurriculumDepartment
from academics.models import Department

import logging

logger = logging.getLogger(__name__)


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
    
    # Also include departments that ALREADY have this master linked 
    # (to ensure we update existing rows even if they've been unlinked from the master's target list)
    existing_dept_ids = set(CurriculumDepartment.objects.filter(master=instance).values_list('department_id', flat=True))
    
    all_dept_ids = target_dept_ids.union(existing_dept_ids)
    dept_qs = Department.objects.filter(id__in=all_dept_ids)

    update_fields = [
        'regulation', 'semester', 'course_code', 'course_name', 'class_type', 'category',
        'l', 't', 'p', 's', 'c', 'internal_mark', 'external_mark', 'total_mark',
        'editable', 'is_elective', 'is_dept_core', 'enabled_assessments',
        'question_paper_type',
    ]

    # Use the master's qp_type for department rows
    master_qp = (getattr(instance, 'qp_type', None) or '').strip() or 'QP1'

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
            'is_dept_core': getattr(instance, 'is_dept_core', False),
            'batch': getattr(instance, 'batch', None),
            # defaults for dept-specific fields
            'total_hours': (instance.l or 0) + (instance.t or 0) + (instance.p or 0),
            'question_paper_type': master_qp,
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


@receiver(post_save, sender=CurriculumDepartment)
def sync_dept_changes_to_master_and_siblings(sender, instance: CurriculumDepartment, **kwargs):
    """When a department row's class_type or question_paper_type changes,
    propagate the change back to the master and to all sibling department rows.

    This ensures that a change made via department curriculum or IQAC interface
    is reflected for users in ALL departments, not just the one that was edited.
    
    Skipped when the save is triggered by system sync (_syncing=True) to
    prevent infinite loops.
    """
    # Don't run during system sync (master -> dept propagation)
    if getattr(instance, '_syncing', False):
        return

    master = getattr(instance, 'master', None)
    if not master:
        return

    # Check if class_type or question_paper_type actually changed
    new_ct = (instance.class_type or '').strip()
    new_qp = (instance.question_paper_type or '').strip()
    master_ct = (master.class_type or '').strip()
    master_qp = (getattr(master, 'qp_type', None) or '').strip()

    ct_changed = new_ct and new_ct != master_ct
    qp_changed = new_qp and new_qp != master_qp

    if not ct_changed and not qp_changed:
        return

    logger.info(
        'sync_dept_changes_to_master_and_siblings: dept_row=%s course=%s '
        'class_type %s->%s, qp_type %s->%s',
        instance.pk, instance.course_code,
        master_ct, new_ct, master_qp, new_qp,
    )

    # 1. Update the master record
    master_update_fields = []
    if ct_changed:
        master.class_type = new_ct
        master_update_fields.append('class_type')
    if qp_changed:
        master.qp_type = new_qp
        master_update_fields.append('qp_type')

    if master_update_fields:
        try:
            # Use update() to avoid triggering master post_save (which would
            # re-propagate to all depts). We handle sibling sync ourselves below.
            CurriculumMaster.objects.filter(pk=master.pk).update(
                **{f: getattr(master, f) for f in master_update_fields}
            )
        except Exception as e:
            logger.error('Failed to update master %s: %s', master.pk, e)

    # 2. Update all sibling department rows (same master, different departments)
    siblings = CurriculumDepartment.objects.filter(master=master).exclude(pk=instance.pk)
    sibling_update = {}
    if ct_changed:
        sibling_update['class_type'] = new_ct
    if qp_changed:
        sibling_update['question_paper_type'] = new_qp

    if sibling_update:
        try:
            updated = siblings.update(**sibling_update)
            logger.info(
                'Updated %d sibling dept rows for master=%s with %s',
                updated, master.pk, sibling_update,
            )
        except Exception as e:
            logger.error('Failed to update siblings for master %s: %s', master.pk, e)
