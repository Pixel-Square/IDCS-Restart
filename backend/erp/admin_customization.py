from django.contrib import admin

from .admin_site import CollegeScopedAdminSite

# -----------------------------------------------------------------------
# Patch the default admin site so that all college-scoped (tenant) apps
# are hidden from the main admin index.  They remain accessible exclusively
# through the College Dashboard (/admin/college/college/<id>/dashboard/).
# -----------------------------------------------------------------------
admin.site.__class__ = CollegeScopedAdminSite

# Customize Django admin branding for KR DATABASE
admin.site.site_title = 'KR DATABASE Admin'
admin.site.site_header = 'KR DATABASE Administration'
admin.site.index_title = 'Dashboard'
