"""Seed audit cycles and import questions from the Cycle Audit Excel workbook.

Usage:
    python manage.py seed_audit_data --xlsx "C:/path/to/Cycle Audit Web App.xlsx"

If --xlsx is omitted, it only ensures Cycle 1 and Cycle 2 exist.
"""
from django.core.management.base import BaseCommand, CommandError

from audits.models import AuditCycle, AuditQuestion


class Command(BaseCommand):
    help = 'Seed audit cycles (1 & 2) and optionally import questions from an Excel workbook.'

    def add_arguments(self, parser):
        parser.add_argument('--xlsx', dest='xlsx', default=None,
                            help='Path to the Cycle Audit Excel workbook (.xlsx).')

    def handle(self, *args, **options):
        # Ensure the two audit cycles exist.
        c1, _ = AuditCycle.objects.get_or_create(
            cycle=1,
            defaults={'name': 'Cycle 1', 'label': 'Audit Cycle 1'},
        )
        c2, _ = AuditCycle.objects.get_or_create(
            cycle=2,
            defaults={'name': 'Cycle 2', 'label': 'Audit Cycle 2'},
        )
        self.stdout.write(self.style.SUCCESS(f'Cycles ready: {c1} / {c2}'))

        xlsx = options.get('xlsx')
        if not xlsx:
            self.stdout.write('No --xlsx provided; skipping question import.')
            return

        try:
            import openpyxl
        except ImportError:
            raise CommandError('openpyxl is not installed. Run: pip install openpyxl')

        try:
            wb = openpyxl.load_workbook(xlsx, data_only=True)
        except Exception as exc:
            raise CommandError(f'Could not read workbook: {exc}')

        imported = 0
        for ws in wb.worksheets:
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or len(row) < 2 or row[0] is None or row[1] is None:
                    continue
                try:
                    sl_no = int(row[0])
                except (TypeError, ValueError):
                    continue
                details = str(row[1]).strip()
                if not details:
                    continue
                documents = str(row[2] or '').strip() if len(row) > 2 else ''
                description = str(row[3] or '').strip() if len(row) > 3 else ''
                max_marks = 10.0
                if len(row) > 4 and row[4] is not None:
                    try:
                        max_marks = float(row[4])
                    except (TypeError, ValueError):
                        max_marks = 10.0

                AuditQuestion.objects.update_or_create(
                    sl_no=sl_no,
                    defaults={
                        'details': details[:300],
                        'documents_checklist': documents,
                        'detailed_description': description,
                        'max_marks': max_marks,
                        'is_active': True,
                    },
                )
                imported += 1

        self.stdout.write(self.style.SUCCESS(
            f'Imported {imported} questions. Total active: '
            f'{AuditQuestion.objects.filter(is_active=True).count()}'
        ))
