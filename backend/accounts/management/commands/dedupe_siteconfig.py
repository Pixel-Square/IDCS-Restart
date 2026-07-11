from django.core.management.base import BaseCommand
from django.core import serializers
from accounts.models import SiteConfiguration
import json
import os


class Command(BaseCommand):
    help = (
        'Inspect SiteConfiguration rows and optionally consolidate duplicates into a single row. '
        'Creates a JSON backup of existing rows before deleting extras.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually delete duplicate rows and keep a single canonical one.')
        parser.add_argument('--backup-dir', default='/tmp', help='Directory to write JSON backup (default: /tmp)')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        backup_dir = options['backup_dir']

        qs = SiteConfiguration.objects.all().order_by('-updated_at')
        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.WARNING('No SiteConfiguration rows found. Nothing to do.'))
            return

        self.stdout.write(f'Found {count} SiteConfiguration row(s).')

        # Serialize backup
        os.makedirs(backup_dir, exist_ok=True)
        backup_path = os.path.join(backup_dir, 'siteconfiguration_backup.json')
        with open(backup_path, 'w', encoding='utf-8') as fh:
            data = serializers.serialize('json', qs)
            fh.write(data)

        self.stdout.write(f'Wrote backup to {backup_path}')

        if count == 1:
            self.stdout.write(self.style.SUCCESS('Only one row exists — nothing to consolidate.'))
            return

        # Choose canonical: most recently updated row
        canonical = qs.first()
        self.stdout.write('Canonical chosen (most recently updated):')
        self.stdout.write(f'  id={canonical.id} login_lockdown={canonical.login_lockdown} updated_at={canonical.updated_at}')

        # List others
        others = qs[1:]
        self.stdout.write('Other rows:')
        for o in others:
            self.stdout.write(f'  id={o.id} login_lockdown={o.login_lockdown} updated_at={o.updated_at}')

        if not apply_changes:
            self.stdout.write(self.style.WARNING('No changes applied. Re-run with --apply to consolidate and delete duplicates.'))
            return

        # Apply: delete others keeping canonical
        ids_to_delete = [o.id for o in others]
        SiteConfiguration.objects.filter(id__in=ids_to_delete).delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted duplicate rows: {ids_to_delete}'))
        self.stdout.write(self.style.SUCCESS('Consolidation complete.'))
