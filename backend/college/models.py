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


class FeatureCatalog(models.Model):
    """System-wide feature definition — the master list of all toggleable modules."""

    code = models.CharField(max_length=64, unique=True, help_text='Machine-readable feature code (e.g. obe, coe)')
    name = models.CharField(max_length=128, help_text='Human-readable feature name')
    description = models.TextField(blank=True, help_text='Brief description of what this feature provides')
    category = models.CharField(max_length=64, blank=True, help_text='Grouping category (e.g. Academics, HR)')
    icon = models.CharField(max_length=64, blank=True, help_text='Lucide icon name for frontend display')
    is_default = models.BooleanField(default=False, help_text='If True, enabled by default for new colleges')
    sort_order = models.IntegerField(default=0)
    # Comma-separated list of role names that this feature is relevant to.
    # E.g. "STUDENT,FACULTY,HOD" — used by the frontend to filter by role.
    applicable_roles = models.CharField(max_length=255, blank=True, default='',
        help_text='Comma-separated roles this feature is relevant to, e.g. STUDENT,FACULTY')
    # Comma-separated sidebar item keys that this feature gates.
    # If this feature is disabled, these sidebar items are hidden.
    sidebar_keys = models.CharField(max_length=512, blank=True, default='',
        help_text='Comma-separated sidebar keys controlled by this feature')
        
    permissions = models.ManyToManyField('accounts.Permission', blank=True, related_name='features',
        help_text='Permissions granted when this feature is assigned to a role')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Feature Catalog'
        verbose_name_plural = 'Feature Catalog'
        ordering = ['sort_order', 'category', 'name']

    def __str__(self):
        return f"{self.code} — {self.name}"


class CollegeFeature(models.Model):
    """Per-college feature toggle. One row per (college, feature) pair.
    Disabling a feature for one college has zero impact on another."""

    college = models.ForeignKey(College, on_delete=models.CASCADE, related_name='college_features')
    feature = models.ForeignKey(FeatureCatalog, on_delete=models.CASCADE, related_name='college_entries')
    is_enabled = models.BooleanField(default=False)
    enabled_at = models.DateTimeField(null=True, blank=True)
    disabled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('college', 'feature')
        verbose_name = 'College Feature'
        verbose_name_plural = 'College Features'
        ordering = ['feature__sort_order', 'feature__category']

    def __str__(self):
        state = 'ON' if self.is_enabled else 'OFF'
        return f"{self.college.code} / {self.feature.code} = {state}"
