from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0013_gatepass_scan_mode'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ApplicationRoleHierarchy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rank', models.PositiveIntegerField(default=0)),
                ('application_type', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='role_hierarchy', to='applications.applicationtype')),
                ('role', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='application_role_hierarchy', to='accounts.role')),
            ],
            options={
                'ordering': ('application_type', 'rank', 'role'),
                'unique_together': {('application_type', 'role')},
            },
        ),
    ]
