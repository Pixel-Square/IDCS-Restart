from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


PERMISSION_CODE = 'accounts.profile_image_unlock_approve'


def add_profile_image_unlock_permission(apps, schema_editor):
    Role = apps.get_model('accounts', 'Role')
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    perm, _ = Permission.objects.get_or_create(
        code=PERMISSION_CODE,
        defaults={'description': 'Approve profile image unlock requests'},
    )

    # Assign to IQAC role by default for immediate operability.
    try:
        iqac_role = Role.objects.get(name__iexact='IQAC')
        RolePermission.objects.get_or_create(role=iqac_role, permission=perm)
    except Role.DoesNotExist:
        pass


def remove_profile_image_unlock_permission(apps, schema_editor):
    Permission = apps.get_model('accounts', 'Permission')
    RolePermission = apps.get_model('accounts', 'RolePermission')

    perm = Permission.objects.filter(code=PERMISSION_CODE).first()
    if not perm:
        return
    RolePermission.objects.filter(permission=perm).delete()
    perm.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0019_merge_20260314_0001'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProfileImageUpdateRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')], default='PENDING', max_length=16)),
                ('requested_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('review_note', models.TextField(blank=True, default='')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_profile_image_update_requests', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='profile_image_update_requests', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Profile Image Update Request',
                'verbose_name_plural': 'Profile Image Update Requests',
                'ordering': ['-requested_at'],
            },
        ),
        migrations.RunPython(add_profile_image_unlock_permission, remove_profile_image_unlock_permission),
    ]
