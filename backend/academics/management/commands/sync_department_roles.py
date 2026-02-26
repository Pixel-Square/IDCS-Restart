from django.core.management.base import BaseCommand
from academics.models import StaffProfile, DepartmentRole, AcademicYear
from accounts.models import Role


class Command(BaseCommand):
    help = 'Synchronize existing staff HOD/AHOD roles with DepartmentRole table'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force sync even for staff with existing department roles',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']
        
        # Define role mapping
        dept_role_mapping = {
            'HOD': DepartmentRole.DeptRole.HOD,
            'AHOD': DepartmentRole.DeptRole.AHOD,
            'Head of Department': DepartmentRole.DeptRole.HOD,
            'Assistant HOD': DepartmentRole.DeptRole.AHOD,
        }
        
        # Get active academic year
        active_academic_year = AcademicYear.objects.filter(is_active=True).first()
        if not active_academic_year:
            active_academic_year = AcademicYear.objects.order_by('-id').first()
        
        if not active_academic_year:
            self.stdout.write(
                self.style.ERROR('No academic year found. Cannot proceed with sync.')
            )
            return
        
        self.stdout.write(f"Using academic year: {active_academic_year.name}")
        
        # Find staff with HOD/AHOD roles
        hod_ahod_roles = Role.objects.filter(name__in=dept_role_mapping.keys())
        staff_with_leadership_roles = StaffProfile.objects.filter(
            user__roles__in=hod_ahod_roles,
            user__isnull=False
        ).distinct().select_related('user', 'department')
        
        self.stdout.write(f"Found {staff_with_leadership_roles.count()} staff members with HOD/AHOD roles")
        
        created_count = 0
        skipped_count = 0
        error_count = 0
        
        for staff in staff_with_leadership_roles:
            # Get staff's department
            staff_department = staff.get_current_department()
            if not staff_department:
                self.stdout.write(
                    self.style.WARNING(f"Staff {staff.staff_id} has no department - skipping")
                )
                skipped_count += 1
                continue
            
            # Get staff's roles that map to department roles
            user_roles = staff.user.roles.filter(name__in=dept_role_mapping.keys())
            
            for user_role in user_roles:
                dept_role_type = dept_role_mapping[user_role.name]
                
                # Check if department role already exists
                existing_dept_role = DepartmentRole.objects.filter(
                    staff=staff,
                    department=staff_department,
                    role=dept_role_type,
                    academic_year=active_academic_year,
                    is_active=True
                ).first()
                
                if existing_dept_role and not force:
                    self.stdout.write(f"  {staff.staff_id}: {dept_role_type} role already exists in {staff_department.code} - skipping")
                    skipped_count += 1
                    continue
                
                try:
                    if dry_run:
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"[DRY-RUN] Would create {dept_role_type} role for {staff.staff_id} in {staff_department.code}"
                            )
                        )
                        created_count += 1
                    else:
                        # Handle HOD uniqueness constraint
                        if dept_role_type == DepartmentRole.DeptRole.HOD:
                            # Deactivate any existing HOD for this department
                            old_hods = DepartmentRole.objects.filter(
                                department=staff_department,
                                role=DepartmentRole.DeptRole.HOD,
                                academic_year=active_academic_year,
                                is_active=True
                            ).exclude(staff=staff)
                            
                            if old_hods.exists():
                                self.stdout.write(f"  Deactivating previous HOD(s) for {staff_department.code}")
                                old_hods.update(is_active=False)
                        
                        # Create or reactivate department role
                        if existing_dept_role:
                            existing_dept_role.is_active = True
                            existing_dept_role.save()
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"  Reactivated {dept_role_type} role for {staff.staff_id} in {staff_department.code}"
                                )
                            )
                        else:
                            DepartmentRole.objects.create(
                                staff=staff,
                                department=staff_department,
                                role=dept_role_type,
                                academic_year=active_academic_year,
                                is_active=True
                            )
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"  Created {dept_role_type} role for {staff.staff_id} in {staff_department.code}"
                                )
                            )
                        created_count += 1
                        
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(
                            f"  Error creating {dept_role_type} role for {staff.staff_id}: {str(e)}"
                        )
                    )
                    error_count += 1
        
        # Summary
        self.stdout.write(f"\nSync completed:")
        self.stdout.write(f"  Created/Updated: {created_count}")
        self.stdout.write(f"  Skipped: {skipped_count}")
        self.stdout.write(f"  Errors: {error_count}")
        
        if dry_run:
            self.stdout.write(self.style.WARNING("\nThis was a dry run. No changes were made."))
            self.stdout.write("Run without --dry-run to apply changes.")