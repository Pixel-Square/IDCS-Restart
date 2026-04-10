from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from feedback.models import FeedbackForm
from accounts.models import UserRole

User = get_user_model()


class Command(BaseCommand):
    help = 'Debug and fix HOD export permissions'

    def add_arguments(self, parser):
        parser.add_argument(
            '--check',
            action='store_true',
            help='Check allow_hod_view status for all forms'
        )
        parser.add_argument(
            '--enable-all',
            action='store_true',
            help='Enable allow_hod_view for all IQAC-created forms'
        )
        parser.add_argument(
            '--form-id',
            type=int,
            help='Check/enable specific form ID'
        )

    def handle(self, *args, **options):
        if options['check']:
            self.check_forms(options.get('form_id'))
        elif options['enable_all']:
            self.enable_all_forms()
        else:
            self.stdout.write(self.style.WARNING('Please use --check or --enable-all flag'))

    def check_forms(self, form_id=None):
        """Check allow_hod_view status for feedback forms."""
        self.stdout.write(self.style.SUCCESS('\n==== FEEDBACK FORM AUDIT ====\n'))

        query = FeedbackForm.objects.select_related('created_by').all()
        if form_id:
            query = query.filter(id=form_id)

        if not query.exists():
            self.stdout.write(self.style.WARNING(f'No forms found'))
            return

        for form in query:
            creator_roles = list(form.created_by.roles.values_list('name', flat=True))
            is_iqac_created = 'IQAC' in creator_roles or 'ADMIN' in creator_roles
            
            role_display = ', '.join(creator_roles) if creator_roles else 'NO ROLE'
            
            status_color = self.style.SUCCESS if form.allow_hod_view else self.style.WARNING
            status_text = status_color(f'allow_hod_view={form.allow_hod_view}')
            
            self.stdout.write(
                f'Form ID {form.id}: {form.type} | '
                f'Created by: {form.created_by.username} ({role_display}) | '
                f'{status_text} | '
                f'Status: {form.status} | '
                f'Active: {form.active}'
            )

    def enable_all_forms(self):
        """Enable allow_hod_view for all IQAC-created forms."""
        self.stdout.write(self.style.SUCCESS('\n==== ENABLING allow_hod_view ====\n'))

        # Get all IQAC and ADMIN users
        iqac_admin_users = User.objects.filter(
            roles__name__in=['IQAC', 'ADMIN']
        ).distinct()

        self.stdout.write(f'Found {iqac_admin_users.count()} IQAC/ADMIN users')

        # Find all forms created by IQAC/ADMIN users
        forms_to_update = FeedbackForm.objects.filter(
            created_by__in=iqac_admin_users,
            allow_hod_view=False
        )

        count = forms_to_update.count()
        self.stdout.write(f'Found {count} IQAC-created forms with allow_hod_view=False\n')

        if count == 0:
            self.stdout.write(self.style.SUCCESS('All IQAC forms already have allow_hod_view=True'))
            return

        for form in forms_to_update:
            form.allow_hod_view = True
            form.save(update_fields=['allow_hod_view'])
            creator_roles = list(form.created_by.roles.values_list('name', flat=True))
            self.stdout.write(
                f'✓ Form {form.id} ({form.type}) by {form.created_by.username} → allow_hod_view=True'
            )

        self.stdout.write(self.style.SUCCESS(f'\n✓ Updated {count} forms'))
