from django.db import migrations


def encrypt_canva_tokens(apps, schema_editor):
    from erp.crypto_utils import encrypt_secret

    CanvaServiceToken = apps.get_model('template_api', 'CanvaServiceToken')
    for row in CanvaServiceToken.objects.all().iterator():
        changed = False

        current_access = row.access_token or ''
        encrypted_access = encrypt_secret(current_access)
        if encrypted_access != current_access:
            row.access_token = encrypted_access
            changed = True

        current_refresh = row.refresh_token or ''
        encrypted_refresh = encrypt_secret(current_refresh)
        if encrypted_refresh != current_refresh:
            row.refresh_token = encrypted_refresh
            changed = True

        if changed:
            row.save(update_fields=['access_token', 'refresh_token'])


class Migration(migrations.Migration):

    dependencies = [
        ('template_api', '0004_canvaoauthstate'),
    ]

    operations = [
        migrations.RunPython(encrypt_canva_tokens, migrations.RunPython.noop),
    ]
