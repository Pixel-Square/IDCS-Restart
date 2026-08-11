"""
College tenant context — the single import point for college-scoping plumbing.

Usage in models::

    from college.tenant import get_current_college_id, auto_assign_college

    class MyModel(models.Model):
        college = models.ForeignKey('college.College', on_delete=models.CASCADE)

        def save(self, *args, **kwargs):
            auto_assign_college(self)
            super().save(*args, **kwargs)

Usage in views::

    from college.tenant import get_current_college_id

    qs = MyModel.objects.filter(college_id=get_current_college_id())
"""

from contextvars import ContextVar

_current_college_id: ContextVar = ContextVar('current_college_id', default=None)


def set_current_college_id(college_id: int | None) -> None:
    """Set the college context for the current request/thread."""
    _current_college_id.set(college_id)


def get_current_college_id() -> int | None:
    """Return the current request's college id, or None (super-admin global mode)."""
    return _current_college_id.get()


def get_current_college():
    """Return the College instance for the current request, or None."""
    cid = _current_college_id.get()
    if cid is None:
        return None
    from .models import College
    return College.objects.filter(pk=cid, is_active=True).first()


def auto_assign_college(instance, field: str = 'college') -> None:
    """Set *college* on *instance* from request context if not already set.

    Call this in ``Model.save()`` before ``super().save()`` so that every row
    created during a college-scoped request automatically receives the correct
    college FK, even if the view forgot to set it explicitly.

    Does nothing when no college context is active (super-admin global mode).
    """
    if getattr(instance, f'{field}_id', None) is None:
        cid = _current_college_id.get()
        if cid is not None:
            setattr(instance, f'{field}_id', cid)
