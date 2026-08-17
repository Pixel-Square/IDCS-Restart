import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from academics.models import Section, StudentSectionAssignment

print("=== Student assignments in S&H sections G to K ===")
secs = Section.objects.filter(name__in=['G', 'H', 'I', 'J', 'K'])
for s in secs:
    assigns = StudentSectionAssignment.objects.filter(section=s, end_date__isnull=True)
    primary_assigns = assigns.filter(section_type='PRIMARY')
    print(f"Section {s.name} (ID: {s.id}):")
    print(f"  Total active assignments: {assigns.count()}")
    print(f"  Total active PRIMARY assignments: {primary_assigns.count()}")
    depts = primary_assigns.values_list('student__home_department__code', flat=True).distinct()
    print(f"  Home departments represented in PRIMARY: {list(depts)}")
