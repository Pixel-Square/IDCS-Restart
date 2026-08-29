# Generated manually — 2026-08-24
# Replaces logo CharField with ImageField, adds banner ImageField.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('college', '0004_featurecatalog_permissions'),
    ]

    operations = [
        # Drop the old logo CharField and replace with ImageField
        migrations.RemoveField(
            model_name='college',
            name='logo',
        ),
        migrations.AddField(
            model_name='college',
            name='logo',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='college_media/logos/',
                help_text='College logo — must be exactly 180×180 px (PNG/JPG/WEBP)',
            ),
        ),
        # Add banner ImageField
        migrations.AddField(
            model_name='college',
            name='banner',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to='college_media/banners/',
                help_text='College banner — must be exactly 1200×400 px (PNG/JPG/WEBP)',
            ),
        ),
    ]
