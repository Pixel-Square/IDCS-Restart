from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from academics.models import SectionAdvisor, StaffProfile, Section, AcademicYear, PeriodAttendanceSession
from datetime import date

User = get_user_model()


class Command(BaseCommand):
    help = 'Check and setup section advisors for testing MyClass functionality'

    def add_arguments(self, parser):
        parser.add_argument(
            '--setup',
            action='store_true',
            help='Create sample section advisor assignments',
        )
        parser.add_argument(
            '--username',
            type=str,
            help='Username to assign as section advisor',
        )
        parser.add_argument(
            '--check-user',
            type=str,
            help='Check specific user advisor status',
        )

    def handle(self, *args, **options):
        self.stdout.write('=== Section Advisor Analysis ===')
        
        # Check existing section advisors
        advisors = SectionAdvisor.objects.all().select_related('advisor', 'section', 'academic_year')
        self.stdout.write(f'Total SectionAdvisor records: {advisors.count()}')
        
        active_advisors = SectionAdvisor.objects.filter(is_active=True)
        self.stdout.write(f'Active SectionAdvisor records: {active_advisors.count()}')
        
        if advisors.exists():
            self.stdout.write('\nExisting Section Advisors:')
            for sa in advisors[:10]:  # Show first 10
                self.stdout.write(f'  - {sa.advisor.user.username} -> {sa.section.name} (Active: {sa.is_active})')
        
        # Check staff profiles
        staff_profiles = StaffProfile.objects.all().select_related('user')
        self.stdout.write(f'\nTotal Staff Profiles: {staff_profiles.count()}')
        
        if staff_profiles.exists():
            self.stdout.write('Sample Staff Profiles:')
            for staff in staff_profiles[:5]:
                emp_id = getattr(staff, 'staff_id', getattr(staff, 'emp_id', 'No ID'))
                self.stdout.write(f'  - {staff.user.username} (ID: {staff.id}, StaffID: {emp_id})')
        
        # Check sections
        sections = Section.objects.all().select_related('batch')
        self.stdout.write(f'\nTotal Sections: {sections.count()}')
        
        if sections.exists():
            self.stdout.write('Sample Sections:')
            for section in sections[:5]:
                batch_name = section.batch.name if section.batch else 'No batch'
                self.stdout.write(f'  - {section.name} (ID: {section.id}, Batch: {batch_name})')
        
        # Check period attendance sessions for today
        today = date.today()
        today_sessions = PeriodAttendanceSession.objects.filter(date=today)
        self.stdout.write(f'\nPeriod Attendance Sessions for {today}: {today_sessions.count()}')
        
        if today_sessions.exists():
            self.stdout.write('Sample Sessions:')
            for session in today_sessions[:3]:
                section_name = session.section.name if session.section else 'Unknown'
                # Get subject from teaching assignment if available
                subject_name = 'No subject'
                if hasattr(session, 'teaching_assignment') and session.teaching_assignment:
                    subject_name = session.teaching_assignment.subject.name if session.teaching_assignment.subject else 'No subject'
                period_index = session.period.index if session.period else '?'
                self.stdout.write(f'  - {section_name} Period {period_index} - {subject_name}')
        
        # Check specific user if requested
        if options['check_user']:
            self.check_user_advisor_status(options['check_user'])
        
        # Setup section advisors if requested
        if options['setup']:
            self.setup_section_advisors(options.get('username'))

    def setup_section_advisors(self, username=None):
        self.stdout.write('\n=== Setting up Section Advisors ===')
        
        # Get or create academic year
        current_year, created = AcademicYear.objects.get_or_create(
            name='2025-2026',
            defaults={'start_date': date(2025, 6, 1), 'end_date': date(2026, 5, 31)}
        )
        if created:
            self.stdout.write(f'Created academic year: {current_year.name}')
        
        # Get sections
        sections = Section.objects.all()[:3]  # Get first 3 sections
        
        if not sections:
            self.stdout.write(self.style.ERROR('No sections found! Please create sections first.'))
            return
        
        # Get staff to assign as advisors
        if username:
            try:
                user = User.objects.get(username=username)
                staff_profile = user.staff_profile
                staff_profiles = [staff_profile]
                self.stdout.write(f'Using specified user: {username}')
            except (User.DoesNotExist, AttributeError):
                self.stdout.write(self.style.ERROR(f'User {username} not found or has no staff profile'))
                return
        else:
            # Get first available staff profiles  
            staff_profiles = StaffProfile.objects.all()[:len(sections)]
        
        if not staff_profiles:
            self.stdout.write(self.style.ERROR('No staff profiles found! Please create staff profiles first.'))
            return
        
        # Create section advisor assignments
        created_count = 0
        for i, section in enumerate(sections):
            staff = staff_profiles[i % len(staff_profiles)]  # Cycle through staff if more sections
            
            advisor, created = SectionAdvisor.objects.get_or_create(
                section=section,
                academic_year=current_year,
                defaults={
                    'advisor': staff,
                    'is_active': True
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(f'✓ Assigned {staff.user.username} as advisor to {section.name}')
            else:
                # Update existing advisor  
                advisor.advisor = staff
                advisor.is_active = True
                advisor.save()
                self.stdout.write(f'⟳ Updated advisor for {section.name} to {staff.user.username}')
        
        self.stdout.write(f'\nCreated {created_count} new section advisor assignments.')
        self.stdout.write('Section advisors setup complete!')

    def check_user_advisor_status(self, username):
        self.stdout.write(f'\n=== Checking User: {username} ===')
        
        try:
            user = User.objects.get(username=username)
            self.stdout.write(f'✓ User found: {user.username} ({user.get_full_name()})')
            
            try:
                staff_profile = user.staff_profile
                self.stdout.write(f'✓ Staff profile found: ID {staff_profile.id}')
                
                # Check section advisor assignments
                advisor_assignments = SectionAdvisor.objects.filter(
                    advisor=staff_profile,
                    is_active=True
                ).select_related('section', 'academic_year')
                
                self.stdout.write(f'Section Advisor Assignments: {advisor_assignments.count()}')
                
                if advisor_assignments.exists():
                    for sa in advisor_assignments:
                        self.stdout.write(f'  - Advisor for {sa.section.name} (Year: {sa.academic_year.name})')
                        
                        # Check if this section has period attendance sessions today
                        today = date.today()
                        sessions_today = PeriodAttendanceSession.objects.filter(
                            section=sa.section,
                            date=today
                        )
                        self.stdout.write(f'    Period sessions today: {sessions_today.count()}')
                        
                        if sessions_today.exists():
                            for session in sessions_today[:3]:
                                # Get subject from teaching assignment
                                subject = 'No subject'
                                if hasattr(session, 'teaching_assignment') and session.teaching_assignment:
                                    if session.teaching_assignment.subject:
                                        subject = session.teaching_assignment.subject.name
                                period = session.period.index if session.period else '?'
                                records_count = session.records.count()
                                self.stdout.write(f'      Period {period}: {subject} ({records_count} records)')
                else:
                    self.stdout.write('❌ No section advisor assignments found')
                
            except AttributeError:
                self.stdout.write('❌ No staff profile found for this user')
                
        except User.DoesNotExist:
            self.stdout.write(f'❌ User {username} not found')