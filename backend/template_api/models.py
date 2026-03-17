"""
template_api/models.py

EventPosterAttachment — stores Canva-exported poster files linked to a frontend event ID.
The file is downloaded from Canva's CDN by the backend proxy view and saved to MEDIA_ROOT.
"""
from django.conf import settings
from django.db import models


class CanvaServiceToken(models.Model):
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


class BrandingEventLog(models.Model):
    class Status(models.TextChoices):
        INFO = 'info', 'Info'
        SUCCESS = 'success', 'Success'
        WARNING = 'warning', 'Warning'
        ERROR = 'error', 'Error'

    event_type = models.CharField(max_length=128, db_index=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.INFO, db_index=True)
    message = models.TextField(blank=True)

    request_path = models.CharField(max_length=512, blank=True, db_index=True)
    request_method = models.CharField(max_length=16, blank=True, db_index=True)
    ip_address = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='branding_event_logs',
    )

    event_id = models.CharField(max_length=128, blank=True, db_index=True)
    reference_id = models.CharField(max_length=256, blank=True, db_index=True)

    request_data = models.JSONField(null=True, blank=True)
    response_data = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['event_type', '-created_at']),
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['event_id', '-created_at']),
            models.Index(fields=['reference_id', '-created_at']),
        ]
        verbose_name = 'Branding Event Log'
        verbose_name_plural = 'Branding Event Logs'

    def __str__(self) -> str:
        label = self.event_id or self.reference_id or 'n/a'
        return f'[{self.status}] {self.event_type} ({label})'
