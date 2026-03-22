"""
template_api/models.py

EventPosterAttachment — stores Canva-exported poster files linked to a frontend event ID.
The file is downloaded from Canva's CDN by the backend proxy view and saved to MEDIA_ROOT.
"""
from django.db import models
from erp.crypto_utils import decrypt_secret, encrypt_secret


class CanvaServiceToken(models.Model):
    _SENSITIVE_FIELDS = {'access_token', 'refresh_token'}
    """
    Stores the Canva OAuth token belonging to the Branding user.
    Used as a **service account** so HODs can invoke Canva API calls
    (autofill, export, create design) without connecting their own Canva account.
    Only one row is ever kept — it is overwritten each time the Branding user
    re-connects.
    """
    access_token  = models.TextField()
    refresh_token = models.TextField(blank=True)
    expires_at    = models.BigIntegerField(default=0)  # Unix ms
    user_id       = models.CharField(max_length=256, blank=True)
    display_name  = models.CharField(max_length=256, blank=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Canva Service Token'

    def __setattr__(self, name, value):
        if name in self._SENSITIVE_FIELDS and isinstance(value, str):
            value = encrypt_secret(value)
        super().__setattr__(name, value)

    def __getattribute__(self, name):
        value = super().__getattribute__(name)
        if name in {'access_token', 'refresh_token'} and isinstance(value, str):
            return decrypt_secret(value)
        return value

    def __str__(self) -> str:
        return f'Canva token for {self.display_name}'


class CanvaOAuthState(models.Model):
    """
    Short-lived PKCE state record created by oauth_authorize and consumed by
    oauth_callback.  Stored in the DB so it works regardless of whether the
    browser's redirect_uri hostname differs from the authorize hostname
    (e.g. localhost vs 127.0.0.1 in development).
    Auto-deleted after use or after 10 minutes.
    """
    state        = models.CharField(max_length=64, unique=True, db_index=True)
    verifier     = models.TextField()
    redirect_uri = models.CharField(max_length=1024)
    origin       = models.CharField(max_length=256, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Canva OAuth State'

    def __str__(self) -> str:
        return f'state={self.state[:8]}…'


class CanvaTemplate(models.Model):
    """
    A Canva design saved by the Branding user as a reusable event-poster template.
    Visible to all HODs in the event-creation flow.
    """
    name              = models.CharField(max_length=256)
    canva_design_id   = models.CharField(max_length=256)
    thumbnail_url     = models.URLField(max_length=1024, blank=True)
    is_brand_template = models.BooleanField(default=False)
    edit_url          = models.URLField(max_length=1024, blank=True)
    saved_by          = models.CharField(max_length=64, blank=True)
    saved_at          = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-saved_at']

    def __str__(self) -> str:
        return self.name


class EventPosterAttachment(models.Model):
    FORMAT_PNG = 'png'
    FORMAT_PDF = 'pdf'
    FORMAT_CHOICES = [
        (FORMAT_PNG, 'PNG'),
        (FORMAT_PDF, 'PDF'),
    ]

    # Frontend localStorage event UUID
    event_id       = models.CharField(max_length=128, db_index=True)
    canva_design_id = models.CharField(max_length=256, blank=True)
    format         = models.CharField(max_length=10, choices=FORMAT_CHOICES, default=FORMAT_PNG)
    # Stored file (downloaded from Canva CDN by the proxy view)
    file           = models.FileField(upload_to='event_posters/%Y/%m/')
    # The original CDN URL that was fetched (for traceability)
    source_url     = models.URLField(max_length=1024, blank=True)
    uploaded_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self) -> str:
        return f'Poster {self.format.upper()} for event {self.event_id}'
