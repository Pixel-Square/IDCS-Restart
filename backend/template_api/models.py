"""
template_api/models.py

EventPosterAttachment — stores Canva-exported poster files linked to a frontend event ID.
The file is downloaded from Canva's CDN by the backend proxy view and saved to MEDIA_ROOT.
"""
from django.db import models


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
