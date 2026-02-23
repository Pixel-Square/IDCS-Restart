from django.db import migrations, models


DEFAULT_TEMPLATES = [
    {
        'code': 'mobile_verify',
        'name': 'Mobile Number Verification OTP',
        'template': 'Your OTP is {otp}. It is valid for {expiry} minutes.',
        'enabled': True,
        'expiry_minutes': 5,
    },
]


def seed_notification_templates(apps, schema_editor):
    NotificationTemplate = apps.get_model('accounts', 'NotificationTemplate')

    for row in DEFAULT_TEMPLATES:
        NotificationTemplate.objects.get_or_create(
            code=row['code'],
            defaults={
                'name': row['name'],
                'template': row['template'],
                'enabled': row['enabled'],
                'expiry_minutes': row['expiry_minutes'],
            },
        )


def unseed_notification_templates(apps, schema_editor):
    NotificationTemplate = apps.get_model('accounts', 'NotificationTemplate')
    NotificationTemplate.objects.filter(code__in=[t['code'] for t in DEFAULT_TEMPLATES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_add_notifications_permission'),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=100, unique=True)),
                ('name', models.CharField(max_length=255)),
                ('template', models.TextField()),
                ('enabled', models.BooleanField(default=False)),
                ('expiry_minutes', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.RunPython(seed_notification_templates, unseed_notification_templates),
    ]
