"""
COE Cache Invalidation Signals
================================
Whenever curriculum, teaching assignment, elective, or arrear student data
changes in IDCS, these signals automatically clear the COE students-map cache
so that the COE module immediately reflects the latest data.

Models watched:
  - curriculum.CurriculumDepartment  → course_code / course_name edits
  - curriculum.ElectiveSubject        → elective code / name changes
  - academics.TeachingAssignment      → staff-subject mapping changes
  - COE.CoeArrearStudent              → arrear student uploads / deletions

Both the shared Django cache (Redis/Memcached) AND the in-process
_LOCAL_STUDENTS_MAP_CACHE / _LOCAL_STUDENTS_MAP_BYTES_CACHE dicts are cleared
so that even in-process stale hits are eliminated.
"""

import logging

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _clear_coe_students_map_cache():
    """
    Delete every versioned COE students-map cache entry from the shared cache
    backend AND from the in-process fallback dicts in views.py.

    The cache keys follow the pattern:
        coe:students-map:v<N>:dept=<DEPT>:sem=<SEM>[:bytes]

    We use cache.delete_pattern when available (django-redis), otherwise we
    iterate over all known dept/sem combinations and delete them individually.
    """
    from django.core.cache import cache

    # Also wipe the in-process dicts imported directly from views.py
    try:
        from COE import views as coe_views
        coe_views._LOCAL_STUDENTS_MAP_CACHE.clear()
        coe_views._LOCAL_STUDENTS_MAP_BYTES_CACHE.clear()
    except Exception as exc:
        logger.debug("COE signal: could not clear in-process cache dicts: %s", exc)

    # Try pattern-delete (redis-py / django-redis)
    try:
        deleted = cache.delete_pattern("coe:students-map:*")
        logger.info("COE signal: cleared ~%s students-map cache entries via pattern delete.", deleted)
        return
    except AttributeError:
        pass  # Cache backend doesn't support delete_pattern — fall through
    except Exception as exc:
        logger.warning("COE signal: pattern delete failed (%s), falling back to key-by-key delete.", exc)

    # Fallback: enumerate all dept × sem × version combos and delete individually
    VERSION = 4  # must match cache_key version in views.py
    SEMS = list(range(1, 9)) + ['ALL']
    # Known department labels (kept in sync with _normalize_department_label)
    DEPTS = [
        'ALL', 'IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'AIML', 'AIDS',
        'MCT', 'S&H', 'T&P', 'MBA', 'MCA', 'ME', 'CE',
    ]
    keys = []
    for dept in DEPTS:
        for sem in SEMS:
            base = f"coe:students-map:v{VERSION}:dept={dept}:sem={sem}"
            keys.append(base)
            keys.append(f"{base}:bytes")

    try:
        cache.delete_many(keys)
        logger.info("COE signal: deleted %d students-map cache keys via delete_many.", len(keys))
    except Exception as exc:
        logger.warning("COE signal: delete_many also failed: %s", exc)


# ---------------------------------------------------------------------------
# curriculum.CurriculumDepartment
# ---------------------------------------------------------------------------

def _watch_curriculum_department():
    try:
        from curriculum.models import CurriculumDepartment

        @receiver(post_save, sender=CurriculumDepartment, dispatch_uid="coe_cache_bust_curriculum_dept_save")
        def on_curriculum_dept_save(sender, instance, **kwargs):
            logger.debug("COE signal: CurriculumDepartment %s saved → busting cache", instance.pk)
            _clear_coe_students_map_cache()

        @receiver(post_delete, sender=CurriculumDepartment, dispatch_uid="coe_cache_bust_curriculum_dept_delete")
        def on_curriculum_dept_delete(sender, instance, **kwargs):
            logger.debug("COE signal: CurriculumDepartment %s deleted → busting cache", instance.pk)
            _clear_coe_students_map_cache()

    except ImportError:
        logger.debug("COE signal: curriculum app not found, skipping CurriculumDepartment signals.")


# ---------------------------------------------------------------------------
# curriculum.CurriculumMaster (master template changes)
# ---------------------------------------------------------------------------

def _watch_curriculum_master():
    try:
        from curriculum.models import CurriculumMaster

        @receiver(post_save, sender=CurriculumMaster, dispatch_uid="coe_cache_bust_curriculum_master_save")
        def on_curriculum_master_save(sender, instance, **kwargs):
            logger.debug("COE signal: CurriculumMaster %s saved → busting cache", instance.pk)
            _clear_coe_students_map_cache()

        @receiver(post_delete, sender=CurriculumMaster, dispatch_uid="coe_cache_bust_curriculum_master_delete")
        def on_curriculum_master_delete(sender, instance, **kwargs):
            _clear_coe_students_map_cache()

    except ImportError:
        pass


# ---------------------------------------------------------------------------
# curriculum.ElectiveSubject
# ---------------------------------------------------------------------------

def _watch_elective_subject():
    try:
        from curriculum.models import ElectiveSubject

        @receiver(post_save, sender=ElectiveSubject, dispatch_uid="coe_cache_bust_elective_subject_save")
        def on_elective_subject_save(sender, instance, **kwargs):
            logger.debug("COE signal: ElectiveSubject %s saved → busting cache", instance.pk)
            _clear_coe_students_map_cache()

        @receiver(post_delete, sender=ElectiveSubject, dispatch_uid="coe_cache_bust_elective_subject_delete")
        def on_elective_subject_delete(sender, instance, **kwargs):
            _clear_coe_students_map_cache()

    except ImportError:
        pass


# ---------------------------------------------------------------------------
# academics.TeachingAssignment
# ---------------------------------------------------------------------------

def _watch_teaching_assignment():
    try:
        from academics.models import TeachingAssignment

        @receiver(post_save, sender=TeachingAssignment, dispatch_uid="coe_cache_bust_teaching_assignment_save")
        def on_teaching_assignment_save(sender, instance, **kwargs):
            logger.debug("COE signal: TeachingAssignment %s saved → busting cache", instance.pk)
            _clear_coe_students_map_cache()

        @receiver(post_delete, sender=TeachingAssignment, dispatch_uid="coe_cache_bust_teaching_assignment_delete")
        def on_teaching_assignment_delete(sender, instance, **kwargs):
            _clear_coe_students_map_cache()

    except ImportError:
        pass


# ---------------------------------------------------------------------------
# academics.Subject  (the master subject table — code/name edits land here)
# ---------------------------------------------------------------------------

def _watch_subject():
    try:
        from academics.models import Subject

        @receiver(post_save, sender=Subject, dispatch_uid="coe_cache_bust_subject_save")
        def on_subject_save(sender, instance, **kwargs):
            logger.debug("COE signal: Subject %s saved → busting cache", instance.pk)
            _clear_coe_students_map_cache()

        @receiver(post_delete, sender=Subject, dispatch_uid="coe_cache_bust_subject_delete")
        def on_subject_delete(sender, instance, **kwargs):
            _clear_coe_students_map_cache()

    except ImportError:
        pass


# ---------------------------------------------------------------------------
# COE.CoeArrearStudent  (arrear student uploads / edits)
# ---------------------------------------------------------------------------

def _watch_arrear_student():
    try:
        from COE.models import CoeArrearStudent

        @receiver(post_save, sender=CoeArrearStudent, dispatch_uid="coe_cache_bust_arrear_save")
        def on_arrear_save(sender, instance, **kwargs):
            logger.debug("COE signal: CoeArrearStudent %s saved → busting cache", instance.pk)
            _clear_coe_students_map_cache()

        @receiver(post_delete, sender=CoeArrearStudent, dispatch_uid="coe_cache_bust_arrear_delete")
        def on_arrear_delete(sender, instance, **kwargs):
            _clear_coe_students_map_cache()

    except ImportError:
        pass


# ---------------------------------------------------------------------------
# academics.StudentSectionAssignment  (student section changes)
# ---------------------------------------------------------------------------

def _watch_section_assignment():
    try:
        from academics.models import StudentSectionAssignment

        @receiver(post_save, sender=StudentSectionAssignment, dispatch_uid="coe_cache_bust_section_assignment_save")
        def on_section_assignment_save(sender, instance, **kwargs):
            _clear_coe_students_map_cache()

        @receiver(post_delete, sender=StudentSectionAssignment, dispatch_uid="coe_cache_bust_section_assignment_delete")
        def on_section_assignment_delete(sender, instance, **kwargs):
            _clear_coe_students_map_cache()

    except ImportError:
        pass


def register_all():
    """Register all COE cache-busting signal handlers. Called from CoeConfig.ready()."""
    _watch_curriculum_department()
    _watch_curriculum_master()
    _watch_elective_subject()
    _watch_teaching_assignment()
    _watch_subject()
    _watch_arrear_student()
    _watch_section_assignment()
    logger.info("COE: cache-busting signals registered.")
