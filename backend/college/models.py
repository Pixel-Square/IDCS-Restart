from django.db import models
from django.core.exceptions import ValidationError


class College(models.Model):
    """Primary college record storing institutional details.

    Fields chosen to cover typical needs: code for short identifier, full
    name, address fields, contacts, website, logo path, established year,
    and active flag.
    """

    TIER_BASIC = 'BASIC'
    TIER_PRO = 'PRO'
    TIER_PREMIUM = 'PREMIUM'
    TIER_CHOICES = [
        (TIER_BASIC, 'Basic'),
        (TIER_PRO, 'Pro'),
        (TIER_PREMIUM, 'Premium'),
    ]

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

    # ── Media assets ────────────────────────────────────────────────────────
    # Logo: strict fixed resolution 180×180 px (square) for consistent use
    # in mark sheets, report headers, certificates, etc.
    logo = models.ImageField(
        upload_to='college_media/logos/',
        blank=True,
        null=True,
        help_text='College logo — must be exactly 180×180 px (PNG/JPG/WEBP)',
    )
    # Banner: strict fixed resolution 1200×400 px (3:1 landscape) for use
    # in report headers, letter-heads, portals, etc.
    banner = models.ImageField(
        upload_to='college_media/banners/',
        blank=True,
        null=True,
        help_text='College banner — must be exactly 1200×400 px (PNG/JPG/WEBP)',
    )

    is_active = models.BooleanField(default=True)

    tier = models.CharField(
        max_length=16,
        choices=TIER_CHOICES,
        default=TIER_BASIC,
        help_text='Subscription tier for this college: BASIC, PRO, or PREMIUM',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── Resolution constants (used in validation & docs) ───────────────────
    LOGO_WIDTH = 180
    LOGO_HEIGHT = 180
    BANNER_WIDTH = 1200
    BANNER_HEIGHT = 400

    class Meta:
        verbose_name = 'College'
        verbose_name_plural = 'Colleges'

    def clean(self):
        """Validate image dimensions strictly to ensure template consistency."""
        super().clean()
        try:
            from PIL import Image as PILImage
        except ImportError:
            return  # Pillow not installed; skip dimension check

        if self.logo and hasattr(self.logo, 'file'):
            try:
                self.logo.file.seek(0)
                img = PILImage.open(self.logo.file)
                w, h = img.size
                if (w, h) != (self.LOGO_WIDTH, self.LOGO_HEIGHT):
                    raise ValidationError(
                        {'logo': f'Logo must be exactly {self.LOGO_WIDTH}×{self.LOGO_HEIGHT} px. '
                                 f'Uploaded image is {w}×{h} px.'}
                    )
            except ValidationError:
                raise
            except Exception:
                pass

        if self.banner and hasattr(self.banner, 'file'):
            try:
                self.banner.file.seek(0)
                img = PILImage.open(self.banner.file)
                w, h = img.size
                if (w, h) != (self.BANNER_WIDTH, self.BANNER_HEIGHT):
                    raise ValidationError(
                        {'banner': f'Banner must be exactly {self.BANNER_WIDTH}×{self.BANNER_HEIGHT} px. '
                                   f'Uploaded image is {w}×{h} px.'}
                    )
            except ValidationError:
                raise
            except Exception:
                pass

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


class CollegeRole(models.Model):
    """Per-college role activation. Tracks which roles are active for a given college.

    STUDENT and STAFF are always auto-created for every new college.
    Additional roles are activated based on the features selected during
    college creation (derived from FeatureCatalog.applicable_roles).

    This model does NOT duplicate Role objects — it references the shared
    global Role table and simply records which ones are visible / assignable
    within each college's Roles & Permissions module.
    """

    college = models.ForeignKey(College, on_delete=models.CASCADE, related_name='college_roles')
    role = models.ForeignKey('accounts.Role', on_delete=models.CASCADE, related_name='college_roles')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('college', 'role')
        verbose_name = 'College Role'
        verbose_name_plural = 'College Roles'
        ordering = ['role__name']

    def __str__(self):
        state = 'ACTIVE' if self.is_active else 'INACTIVE'
        return f"{self.college.code} / {self.role.name} = {state}"

