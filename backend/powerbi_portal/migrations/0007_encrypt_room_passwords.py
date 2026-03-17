from django.db import migrations, models


def encrypt_room_passwords(apps, schema_editor):
    from erp.crypto_utils import encrypt_secret

    Room = apps.get_model('powerbi_portal', 'Room')
    for room in Room.objects.all().iterator():
        changed = False

        current_sql = room.sql_server_password or ''
        encrypted_sql = encrypt_secret(current_sql)
        if encrypted_sql != current_sql:
            room.sql_server_password = encrypted_sql
            changed = True

        current_pg = room.postgres_password or ''
        encrypted_pg = encrypt_secret(current_pg)
        if encrypted_pg != current_pg:
            room.postgres_password = encrypted_pg
            changed = True

        if changed:
            room.save(update_fields=['sql_server_password', 'postgres_password'])


class Migration(migrations.Migration):

    dependencies = [
        ('powerbi_portal', '0006_room_public_bi_token'),
    ]

    operations = [
        migrations.AlterField(
            model_name='room',
            name='sql_server_password',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='room',
            name='postgres_password',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(encrypt_room_passwords, migrations.RunPython.noop),
    ]
