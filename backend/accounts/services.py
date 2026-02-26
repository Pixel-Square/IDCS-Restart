import logging
from typing import Optional
from django.utils import timezone

logger = logging.getLogger(__name__)


def deactivate_user(user, profile_status: Optional[str] = None, reason: Optional[str] = None, actor: Optional[object] = None):
    """Deactivate a user safely without deleting any data.

    - sets `user.is_active = False`
    - sets profile.status to the provided `profile_status` or 'INACTIVE'
    - logs the operation (no DB audit table by default)

    This function intentionally does not delete any related records.
    """
    if user is None:
        raise ValueError('user is required')

    user.is_active = False
    user.save(update_fields=['is_active'])

    # set profile status if present
    sp = getattr(user, 'student_profile', None)
    st = getattr(user, 'staff_profile', None)

    final_status = profile_status or 'INACTIVE'

    try:
        if sp is not None:
            # students cannot be RESIGNED; map invalid to INACTIVE
            if final_status == 'RESIGNED':
                final_status = 'INACTIVE'
            # Ensure only valid student statuses (ACTIVE, INACTIVE, ALUMNI, DEBAR)
            if final_status not in ('ACTIVE', 'INACTIVE', 'ALUMNI', 'DEBAR'):
                final_status = 'INACTIVE'
            sp.status = final_status
            sp.save(update_fields=['status'])
        elif st is not None:
            # staff cannot be ALUMNI; map invalid to INACTIVE
            if final_status == 'ALUMNI':
                final_status = 'INACTIVE'
            st.status = final_status
            st.save(update_fields=['status'])
    except Exception:
        logger.exception('Failed to update profile status for user %s', getattr(user, 'pk', None))

    logger.info('User deactivated: user=%s actor=%s reason=%s status=%s time=%s',
                getattr(user, 'pk', None), getattr(actor, 'pk', None) if actor else None, reason, final_status, timezone.now())

    return True
