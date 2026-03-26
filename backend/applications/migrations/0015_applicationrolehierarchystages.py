from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0014_applicationrolehierarchy'),
        ('accounts', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ApplicationRoleHierarchyStage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='Stage', max_length=120)),
                ('order', models.PositiveIntegerField(default=1)),
                ('application_type', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='role_hierarchy_stages', to='applications.applicationtype')),
            ],
            options={
                'ordering': ('application_type', 'order', 'id'),
            },
        ),
        migrations.CreateModel(
            name='ApplicationRoleHierarchyStageRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rank', models.PositiveIntegerField(default=0)),
                ('role', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='role_hierarchy_stage_roles', to='accounts.role')),
                ('stage', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='stage_roles', to='applications.applicationrolehierarchystage')),
            ],
            options={
                'ordering': ('stage', 'rank', 'role'),
                'unique_together': {('stage', 'role')},
            },
        ),
        migrations.CreateModel(
            name='ApplicationRoleHierarchyStageUser',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stage', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='stage_users', to='applications.applicationrolehierarchystage')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='application_role_hierarchy_stage_users', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('stage', 'user')},
            },
        ),
    ]
