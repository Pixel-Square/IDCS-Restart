from curriculum.models import CurriculumDepartment, CurriculumMaster
from django.db.models import Count

print('CurriculumMaster count:', CurriculumMaster.objects.count())
print('CurriculumDepartment count:', CurriculumDepartment.objects.count())

masters_no_deps = CurriculumMaster.objects.annotate(dc=Count('departments')).filter(for_all_departments=False, dc=0)
print('Masters with for_all_departments=False but no departments set:', masters_no_deps.count())
for m in masters_no_deps[:20]:
    print('  ', m.pk, m.regulation, m.semester, m.course_code, m.course_name)

print('Department rows with master NULL:', CurriculumDepartment.objects.filter(master__isnull=True).count())

# Duplicate CurriculumDepartment groups by unique_together fields
dups = CurriculumDepartment.objects.values('department__code','regulation','semester','course_code').annotate(c=Count('id')).filter(c__gt=1)
print('Duplicate department groups (department, regulation, semester, course_code):', dups.count())
for d in dups[:20]:
    print('  ', d)

# Duplicate masters by (regulation, semester, course_code, course_name)
mdup = CurriculumMaster.objects.values('regulation','semester','course_code','course_name').annotate(c=Count('id')).filter(c__gt=1)
print('Duplicate masters (reg,sem,code,name):', mdup.count())
for d in mdup[:20]:
    print('  ', d)
