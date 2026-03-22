from django.db import migrations, models


def _make_unique_email(original: str, pk: int, seen: set[str]) -> str:
    email = (original or '').strip().lower()

    # Ensure a non-empty value (Postgres unique treats '' as a value).
    if not email:
        candidate = f'user-{pk}@example.invalid'
    else:
        # If already unique, keep as-is.
        if email not in seen:
            candidate = email
        else:
            # De-dupe by appending the pk to the local part.
            if '@' in email:
                local, domain = email.split('@', 1)
                candidate = f'{local}+{pk}@{domain}'
            else:
                candidate = f'{email}+{pk}@example.invalid'

    # Final safety: ensure uniqueness even if the generated candidate collides.
    base = candidate
    i = 1
    while candidate in seen:
        candidate = f'{base}.{i}'
        i += 1

    seen.add(candidate)
    return candidate


def backfill_and_dedupe_emails(apps, schema_editor):
    User = apps.get_model('accounts', 'User')

    seen: set[str] = set()

    # Iterate in a stable order so the same duplicates always get the same result.
    for user in User.objects.all().only('pk', 'email').order_by('pk'):
        desired = _make_unique_email(getattr(user, 'email', ''), user.pk, seen)
        if (user.email or '') != desired:
            user.email = desired
            user.save(update_fields=['email'])


def ensure_unique_email_index_postgres(apps, schema_editor):
    # Avoid failing if the unique index/constraint already exists.
    # This project uses Postgres; keep other DBs as a no-op.
    if getattr(schema_editor.connection, 'vendor', '') != 'postgresql':
        return

    schema_editor.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'i'
                  AND c.relname = 'accounts_user_email_b2644a56_uniq'
            ) THEN
                CREATE UNIQUE INDEX accounts_user_email_b2644a56_uniq
                ON accounts_user (email);
            END IF;
        END $$;
        """
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0023_superuserimpersonationpermission_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_and_dedupe_emails, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(ensure_unique_email_index_postgres, reverse_code=migrations.RunPython.noop),
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AlterField(
                    model_name='user',
                    name='email',
                    field=models.EmailField(
                        blank=False,
                        help_text='Required. Used as the unique login identifier.',
                        max_length=254,
                        unique=True,
                        verbose_name='email address',
                    ),
                ),
            ],
        ),
    ]
