from django.db import models


class College(models.Model):
    """Primary college record storing institutional details.

    Fields chosen to cover typical needs: code for short identifier, full
    name, address fields, contacts, website, logo path, established year,
    and active flag.
    """

    code = models.CharField(max_length=32, unique=True, help_text='Short college code (e.g. IDCS)')
    name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=64, blank=True, help_text='Optional short display name')

    address = models.TextField(blank=True)
    city = models.CharField(max_length=128, blank=True)
    state = models.CharField(max_length=128, blank=True)
    country = models.CharField(max_length=128, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)

    phone = models.CharField(max_length=64, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)

    established_year = models.PositiveSmallIntegerField(null=True, blank=True)
    logo = models.CharField(max_length=255, blank=True, help_text='Path or URL to logo image')

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'College'
        verbose_name_plural = 'Colleges'

    def __str__(self):
        return f"{self.code} - {self.short_name or self.name}"
