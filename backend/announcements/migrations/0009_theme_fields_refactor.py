from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('announcements', '0008_rename_announce_expiry_idx_announcemen_expiry__bb5922_idx'),
    ]

    operations = [
        migrations.RenameField(
            model_name='announcement',
            old_name='cover_image',
            new_name='theme_image',
        ),
        migrations.AddField(
            model_name='announcement',
            name='theme_color',
            field=models.CharField(default='#2563EB', max_length=16),
        ),
        migrations.AddField(
            model_name='announcement',
            name='theme_type',
            field=models.CharField(choices=[('COLOR', 'Color Theme'), ('IMAGE', 'Image Theme')], default='COLOR', max_length=10),
        ),
        migrations.AlterField(
            model_name='announcement',
            name='theme_image',
            field=models.ImageField(blank=True, null=True, upload_to='announcements/themes/'),
        ),
    ]
