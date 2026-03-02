from __future__ import annotations

from typing import Optional

from django.contrib.auth.backends import BaseBackend
from django.contrib.auth import get_user_model


class PowerBIIdentifierBackend(BaseBackend):
    """Authenticate using username OR Student reg_no OR Staff staff_id.

    This is intended for the PowerBI portal login UX.
    """

    def authenticate(self, request, username: Optional[str] = None, password: Optional[str] = None, **kwargs):
        if not username or not password:
            return None

        identifier = str(username).strip()
        if not identifier:
            return None

        UserModel = get_user_model()

        # 1) Standard username login (preserve default behavior)
        try:
            user = UserModel._default_manager.get(username=identifier)
        except UserModel.DoesNotExist:
            user = None

        if user is not None and self.user_can_authenticate(user) and user.check_password(password):
            return user

        # 2) Student register number
        try:
            from academics.models import StudentProfile

            sp = StudentProfile.objects.select_related('user').filter(reg_no__iexact=identifier).first()
            if sp and sp.user and self.user_can_authenticate(sp.user) and sp.user.check_password(password):
                return sp.user
        except Exception:
            pass

        # 3) Staff ID
        try:
            from academics.models import StaffProfile

            st = StaffProfile.objects.select_related('user').filter(staff_id__iexact=identifier).first()
            if st and st.user and self.user_can_authenticate(st.user) and st.user.check_password(password):
                return st.user
        except Exception:
            pass

        return None

    def get_user(self, user_id):
        UserModel = get_user_model()
        try:
            return UserModel._default_manager.get(pk=user_id)
        except UserModel.DoesNotExist:
            return None

    def user_can_authenticate(self, user) -> bool:
        is_active = getattr(user, 'is_active', None)
        return is_active or is_active is None
