"""
Academic 2.1 Permissions Migration
Seeds permissions for the Academic 2.1 OBE Mark Entry system
and assigns them to appropriate roles.
"""

from django.db import migrations


# All Academic 2.1 permissions
PERMISSIONS = [
    # Page access permissions
    ('academic_v2.page.staff', 'Access Academic 2.1 staff pages (Assigned Courses, Mark Entry)'),
    ('academic_v2.page.admin', 'Access Academic 2.1 admin pages (Publish Control, Class Types, Patterns, Approvals)'),
    
    # Mark entry permissions
    ('academic_v2.marks.view_own', 'View own course marks'),
    ('academic_v2.marks.edit_own', 'Enter and edit marks for assigned courses'),
    ('academic_v2.marks.publish', 'Publish marks (locks for editing)'),
    ('academic_v2.marks.request_edit', 'Request edit access for published marks'),
    ('academic_v2.marks.view_all', 'View all marks across departments'),
    
    # Admin permissions
    ('academic_v2.admin.semester_config', 'Manage semester configurations (due dates, publish control)'),
    ('academic_v2.admin.class_types', 'Manage class types and exam assignments'),
    ('academic_v2.admin.qp_patterns', 'Manage question paper patterns'),
    ('academic_v2.admin.approve_edit', 'Approve edit requests for published marks'),
    
    # HOD specific
    ('academic_v2.hod.view_department', 'View department marks and internal reports'),
    ('academic_v2.hod.approve_edit', 'HOD approve edit requests'),
    
    # Internal marks
    ('academic_v2.internal.view_own', 'View internal marks for own courses'),
    ('academic_v2.internal.view_department', 'View internal marks for department'),
    ('academic_v2.internal.view_all', 'View all internal marks'),
    ('academic_v2.internal.export', 'Export internal marks to Excel/PDF'),
]

# Role to permissions mapping
ROLE_PERMISSIONS = {
    'STAFF': [
        'academic_v2.page.staff',
        'academic_v2.marks.view_own',
        'academic_v2.marks.edit_own',
        'academic_v2.marks.publish',
        'academic_v2.marks.request_edit',
        'academic_v2.internal.view_own',
    ],
    'FACULTY': [
        'academic_v2.page.staff',
        'academic_v2.marks.view_own',
        'academic_v2.marks.edit_own',
        'academic_v2.marks.publish',
        'academic_v2.marks.request_edit',
        'academic_v2.internal.view_own',
    ],
    'HOD': [
        'academic_v2.page.staff',
        'academic_v2.marks.view_own',
        'academic_v2.marks.edit_own',
        'academic_v2.marks.publish',
        'academic_v2.marks.request_edit',
        'academic_v2.hod.view_department',
        'academic_v2.hod.approve_edit',
        'academic_v2.internal.view_own',
        'academic_v2.internal.view_department',
        'academic_v2.internal.export',
    ],
    'AHOD': [
        'academic_v2.page.staff',
        'academic_v2.marks.view_own',
        'academic_v2.marks.edit_own',
        'academic_v2.marks.publish',
        'academic_v2.marks.request_edit',
        'academic_v2.hod.view_department',
        'academic_v2.internal.view_own',
        'academic_v2.internal.view_department',
    ],
    'IQAC': [
        'academic_v2.page.staff',
        'academic_v2.page.admin',
        'academic_v2.marks.view_all',
        'academic_v2.admin.semester_config',
        'academic_v2.admin.class_types',
        'academic_v2.admin.qp_patterns',
        'academic_v2.admin.approve_edit',
        'academic_v2.internal.view_all',
        'academic_v2.internal.export',
    ],
    'ADMIN': [
        'academic_v2.page.staff',
        'academic_v2.page.admin',
        'academic_v2.marks.view_all',
        'academic_v2.admin.semester_config',
        'academic_v2.admin.class_types',
        'academic_v2.admin.qp_patterns',
        'academic_v2.admin.approve_edit',
        'academic_v2.internal.view_all',
        'academic_v2.internal.export',
    ],
}


def seed_academic_v2_permissions(apps, schema_editor):
    """Seed permissions and assign to roles."""
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')
    RolePermission = apps.get_model('accounts', 'RolePermission')
    
    # Create all permissions
    perm_map = {}
    for code, description in PERMISSIONS:
        perm_obj, created = Permission.objects.get_or_create(
            code=code,
            defaults={'description': description}
        )
        if not created and not (perm_obj.description or '').strip() and description:
            perm_obj.description = description
            perm_obj.save(update_fields=['description'])
        perm_map[code] = perm_obj
    
    # Assign permissions to roles
    for role_name, perm_codes in ROLE_PERMISSIONS.items():
        # Use filter().first() to handle multiple roles gracefully
        role = Role.objects.filter(name__iexact=role_name).first()
        if role:
            for code in perm_codes:
                perm = perm_map.get(code)
                if perm:
                    RolePermission.objects.get_or_create(role=role, permission=perm)


def reverse_seed(apps, schema_editor):
    """Remove seeded permissions."""
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')
    
    codes = [code for code, _ in PERMISSIONS]
    
    # Remove role assignments
    RolePermission.objects.filter(permission__code__in=codes).delete()
    
    # Remove permissions
    Permission.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):
    
    dependencies = [
        ('academic_v2', '0001_initial'),  # After schema migration
        ('accounts', '0001_initial'),  # Permission model
    ]
    
    operations = [
        migrations.RunPython(seed_academic_v2_permissions, reverse_seed),
    ]
