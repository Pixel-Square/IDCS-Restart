from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('staff_attendance', '0013_staffbiometricpunchlog'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='staffbiometricpunchlog',
            new_name='staff_biome_user_id_04f2e6_idx',
            old_name='staff_biome_user_id_16fc4d_idx',
        ),
        migrations.RenameIndex(
            model_name='staffbiometricpunchlog',
            new_name='staff_biome_source_2bf6a8_idx',
            old_name='staff_biome_source_9bbd35_idx',
        ),
    ]
