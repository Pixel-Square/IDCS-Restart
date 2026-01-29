from django.core.management.base import BaseCommand
from curriculum.models import CurriculumMaster


class Command(BaseCommand):
    help = 'Backfill department curriculum rows for existing CurriculumMaster entries'

    def handle(self, *args, **options):
        total = CurriculumMaster.objects.count()
        self.stdout.write(f'Found {total} master records. Triggering propagation...')
        for i, m in enumerate(CurriculumMaster.objects.all(), start=1):
            m.save()
            if i % 50 == 0:
                self.stdout.write(f'Processed {i}/{total}')
        self.stdout.write('Done.')
