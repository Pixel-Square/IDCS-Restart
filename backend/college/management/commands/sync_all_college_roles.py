"""
One-time backfill command: sync CollegeRole entries for all existing colleges.

Run once after deploying the sync_college_roles utility to ensure every
college has the correct set of active/inactive CollegeRole entries based
on their currently-enabled features.

Usage:
    python manage.py sync_all_college_roles
    python manage.py sync_all_college_roles --college-id=5   # single college
"""

from django.core.management.base import BaseCommand

from college.models import College
from college.utils import sync_college_roles


class Command(BaseCommand):
    help = 'Sync CollegeRole entries for all colleges based on their enabled features.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--college-id',
            type=int,
            default=None,
            help='Sync only this college (by primary key).',
        )

    def handle(self, *args, **options):
        college_id = options.get('college_id')
        if college_id:
            colleges = College.objects.filter(pk=college_id)
        else:
            colleges = College.objects.filter(is_active=True)

        total = colleges.count()
        self.stdout.write(f'Syncing roles for {total} college(s)...\n')

        for i, college in enumerate(colleges, 1):
            result = sync_college_roles(college)
            activated = result.get('activated', [])
            deactivated = result.get('deactivated', [])
            self.stdout.write(
                f'  [{i}/{total}] {college.code}: '
                f'+{len(activated)} activated, -{len(deactivated)} deactivated'
            )
            if activated:
                self.stdout.write(f'    Activated: {", ".join(activated)}')
            if deactivated:
                self.stdout.write(f'    Deactivated: {", ".join(deactivated)}')

        self.stdout.write(self.style.SUCCESS(f'\nDone. Synced {total} college(s).'))
