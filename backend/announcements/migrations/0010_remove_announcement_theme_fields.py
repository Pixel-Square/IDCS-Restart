from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('announcements', '0009_theme_fields_refactor'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='announcement',
            name='theme_type',
        ),
        migrations.RemoveField(
            model_name='announcement',
            name='theme_color',
        ),
        migrations.RemoveField(
            model_name='announcement',
            name='theme_image',
        ),
    ]
