from django.db import migrations


def create_seed_publish_requests(apps, schema_editor):
    # apps.get_model('auth', 'User') may not exist in swapped user model setups; attempt common locations
    try:
        User = apps.get_model('auth', 'User')
    except LookupError:
        User = apps.get_model('accounts', 'User')

    ObePublishRequest = apps.get_model('OBE', 'ObePublishRequest')
    try:
        AcademicYear = apps.get_model('academics', 'AcademicYear')
    except LookupError:
        AcademicYear = None

    from django.utils import timezone
    from datetime import timedelta

    now = timezone.now()

    # try to find a staff user; if none exists, create a seed user 'obe_seed_user'
    staff = None
    try:
        staff = User.objects.filter(is_active=True).first()
    except Exception:
        staff = None

    if staff is None:
        try:
            staff = User.objects.filter(username='obe_seed_user').first()
        except Exception:
            staff = None

    if staff is None:
        try:
            # create a minimal seed user; avoid using create_user in migrations in case manager is customized
            staff = User.objects.create(username='obe_seed_user', is_active=True)
        except Exception:
            staff = None

    # try to find an academic year
    ay = None
    if AcademicYear is not None:
        try:
            ay = AcademicYear.objects.first()
        except Exception:
            ay = None

    # Create a few seed requests (skip if similar subject_code already exists)
    def ensure(subject_code, status='PENDING', approved_minutes=None, reason=None):
        if ObePublishRequest.objects.filter(subject_code=subject_code, assessment='formative1').exists():
            return
        # ensure we have a staff user; if not, skip creating this seed to avoid integrity errors
        if staff is None:
            return
        ObePublishRequest.objects.create(
            staff_user=staff,
            academic_year=ay if ay is not None else None,
            subject_code=subject_code,
            subject_name=f'Seed {subject_code}',
            assessment='formative1',
            reason=reason or 'Seed data request',
            status=status,
            approved_until=(now + timedelta(minutes=int(approved_minutes))) if (status == 'APPROVED' and approved_minutes) else None,
            reviewed_at=now if status in ('APPROVED', 'REJECTED') else None,
        )

    ensure('SEED-PEND-101', status='PENDING', reason='Pending seed request')
    ensure('SEED-APP-102', status='APPROVED', approved_minutes=120, reason='Approved seed request')
    ensure('SEED-REJ-103', status='REJECTED', reason='Rejected seed request')


def remove_seed_publish_requests(apps, schema_editor):
    ObePublishRequest = apps.get_model('OBE', 'ObePublishRequest')
    ObePublishRequest.objects.filter(subject_code__in=['SEED-PEND-101', 'SEED-APP-102', 'SEED-REJ-103']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0011_alter_labpublishedsheet_assessment'),
    ]

    operations = [
        migrations.RunPython(create_seed_publish_requests, reverse_code=remove_seed_publish_requests),
    ]
