from django.contrib.auth.backends import ModelBackend

from .models import User


class CustomAdminBackend(ModelBackend):
    """Compatibility backend for deployments that use the legacy admin path."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = username or kwargs.get('email')
        if not identifier or password is None:
            return None

        try:
            user = User.objects.get(email__iexact=str(identifier).strip())
        except (User.DoesNotExist, User.MultipleObjectsReturned):
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None