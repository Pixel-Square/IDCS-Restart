import os, django, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
sys.path.insert(0, os.path.dirname(__file__))
django.setup()
from django.db import connection
print("Django setup OK", flush=True)

from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.models import User
from academic_v2.academic_visuals_views import AcademicVisualDynamicOptionsView
from academic_v2.academic_performance_views import department_has_cohort
from academics.models import Department

factory = APIRequestFactory()
su = User.objects.filter(is_superuser=True).first()
req = factory.get('/x/'); force_authenticate(req, user=su)
r = AcademicVisualDynamicOptionsView.as_view()(req)
print('departments:', [(d['code'], d['label']) for d in r.data['departments']])
print('DB READER present:', any('DB READER' in (d.get('name') or '') or d['code'] == '20212' for d in r.data['departments']))


factory = APIRequestFactory()
su = User.objects.filter(is_superuser=True).first()
def call(params):
    req = factory.get('/x/', params or {})
    force_authenticate(req, user=su)
    return req

print('=== DB READER / department_has_cohort ===')
d18 = Department.objects.get(code='20212')
print('DB READER has cohort:', department_has_cohort(d18))
for c in ['243', '104', 'RE', 'T&P', 'S&H']:
    d = Department.objects.filter(code=c).first()
    if d:
        print(f'{c}: has_cohort={department_has_cohort(d)}')

print('\n=== dynamic-options (no context) ===')
req = call({})
r = AcademicVisualDynamicOptionsView.as_view()(req)
depts = [d['code'] for d in r.data['departments']]
print('departments:', depts)
print('DB READER in list:', '20212' in depts or any('DB READER' in (d.get('name') or '') for d in r.data['departments']))

print('\n=== dynamic-options (dept=AI&DS code 243) ===')
req = call({'dept': '243'})
r = AcademicVisualDynamicOptionsView.as_view()(req)
print('sections:', r.data['sections'])
print('semesters:', r.data['semesters'])
print('subjects (n=%d):' % len(r.data['subjects']), [(s['code'], s['name']) for s in r.data['subjects'][:10]])

print('\n=== dynamic-options (dept=243, year=2023, sem=6) ===')
req = call({'dept': '243', 'year': '2023', 'sem': '6'})
r = AcademicVisualDynamicOptionsView.as_view()(req)
print('sections:', r.data['sections'])
print('semesters:', r.data['semesters'])
print('subjects (n=%d):' % len(r.data['subjects']), [(s['code'], s['name']) for s in r.data['subjects'][:12]])

print('\n=== student-curriculum-marks subject context ===')
req = call({'dept': '243', 'year': '2023', 'sem': '6', 'exam': 'All Assessments'})
r = StudentCurriculumMarksView.as_view()(req)
print('students:', len(r.data['students']), 'subjects:', len(r.data['subjects']))
print('subjects:', [(s['code'], s['name']) for s in r.data['subjects'][:12]])

print('\n=== charts metrics ===')
stu = StudentProfile.objects.filter(reg_no__icontains='2303811724321001').first() or StudentProfile.objects.first()
req = call({'exam': 'CIA 1'})
r = StudentAnalysisChartsView.as_view()(req, student_id=str(stu.id))
d = r.data
print('reg:', d['reg_no'], 'avg_pct:', d.get('avg_pct'), 'pass_pct:', d.get('pass_pct'))
print('marks sample:', d['marks_data'][:3])

from academics.models import Department, Section, Subject, StudentProfile, Course, Batch, TeachingAssignment

print('--- Students per department (home_department) ---')
for d in Department.objects.annotate(n=Count('home_students')):
    print(f'  {d.code!r} {d.name!r}: {d.n} students (home_department FK)')

print('\n--- Students via section.batch.course.department ---')
for d in Department.objects.annotate(n=Count('courses__batches__sections__students', distinct=True)):
    print(f'  {d.code!r}: {d.n}')

print('\n--- Department curriculum relations ---')
print('Department has master_curricula + curriculum_rows; inspecting models:')
from django.apps import apps
for m in apps.get_models():
    if 'curriculum' in m.__name__.lower():
        print(' ', m.__name__, [f.name for f in m._meta.get_fields()])

print('\n--- Does DB READER dept have students anywhere? ---')
d18 = Department.objects.get(code='20212')
print('home_department:', StudentProfile.objects.filter(home_department=d18).count())
print('via batch course:', StudentProfile.objects.filter(section__batch__course__department=d18).count())
print('sections managed:', Section.objects.filter(managing_department=d18).count())
print('batches:', Batch.objects.filter(department=d18).count(), Batch.objects.filter(course__department=d18).count())

print('\n--- Subject.course coverage ---')
print('total subjects:', Subject.objects.count())
print('with course set:', Subject.objects.filter(course__isnull=False).count())
print('without course:', Subject.objects.filter(course__isnull=True).count())
print('with semester set:', Subject.objects.filter(semester__isnull=False).count())

print('\n--- Subjects per course.department (Subject.course is NULL for all - skip) ---')
print('subject.course is NULL for ALL subjects -> curriculum is authoritative')

print('\n--- CurriculumDepartment sample ---')
from curriculum.models import CurriculumDepartment
CD = CurriculumDepartment
print('CD model:', CD.__name__)
print('CD count:', CD.objects.count())
for cd in CD.objects.select_related('department', 'semester')[:10]:
    print(f'  cd id={cd.id} dept={cd.department.code if cd.department else None} batch={cd.batch!r} sem={cd.semester.number if cd.semester else None} code={cd.course_code!r} name={cd.course_name!r}')

print('\n--- CurriculumDepartment for AI&DS ---')
ai = Department.objects.get(code='243')
cds = CD.objects.filter(department=ai).select_related('semester')
print('AI&DS CD rows:', cds.count())
from collections import Counter
combo = Counter((str(c.batch), c.semester.number if c.semester else None) for c in cds)
print('  (batch, sem) combos:', dict(combo))
print('  sample codes:', [c.course_code for c in cds[:15]])

print('\n--- Do CD course_codes match Subject.code? ---')
codes_cd = set(c.course_code for c in cds if c.course_code)
all_subj = {s.code for s in Subject.objects.all() if s.code}
print('  CD distinct codes:', len(codes_cd), '| Subject distinct codes:', len(all_subj))
print('  intersection:', len(codes_cd & all_subj))
print('  sample intersection:', list(codes_cd & all_subj)[:10])

print('\n--- Subjects of AI&DS cohort via all candidate relationships ---')
ai_students = StudentProfile.objects.filter(
    Q(home_department=ai) | Q(section__batch__course__department=ai)
)
ai_regs = list(ai_students.values_list('id', flat=True))
ai_secs = Section.objects.filter(Q(batch__course__department=ai) | Q(students__home_department=ai)).distinct()
print('AI&DS students:', ai_students.count(), 'sections:', list(ai_secs.values_list('name', 'batch__name', 'semester__number')))

# 1. via cohort sections' curriculum: CD(dept, batch, sem) codes
sec0 = ai_secs.first()
print('sample section:', sec0.name, sec0.batch.name, sec0.semester.number if sec0.semester else None)
cd_sec = CD.objects.filter(department=ai, semester=sec0.semester, batch=str(sec0.batch.name))
print('CD rows for section context:', cd_sec.count(), 'codes:', sorted(set(cd_sec.values_list('course_code', flat=True)))[:15])

# 3. via curriculum course_code match
via_cd = Subject.objects.filter(code__in=codes_cd)
print('via CurriculumDepartment codes:', via_cd.count())

# 4. via marks
from OBE.models import Cia1Mark
via_marks = Subject.objects.filter(cia1_marks__student_id__in=ai_regs).distinct()
print('via CIA1 marks:', via_marks.count())
print('  sample:', list(via_marks.values_list('code', 'name')[:8]))


print('\n--- TeachingAssignment as subject->section linkage ---')
print('total TAs:', TeachingAssignment.objects.count())
print('TAs with subject:', TeachingAssignment.objects.filter(subject__isnull=False).count())
for d in Department.objects.all():
    n = TeachingAssignment.objects.filter(section__batch__course__department=d).count()
    nsub = Subject.objects.filter(teaching_assignments__section__batch__course__department=d).distinct().count()
    if n:
        print(f'  {d.code!r}: {n} TAs, {nsub} distinct subjects')

print('\n--- Sample AI&DS cohort subjects (students->marks) ---')
ai = Department.objects.get(code='243')
ai_students = StudentProfile.objects.filter(
    Q(home_department=ai) | Q(section__batch__course__department=ai)
)
print('AI&DS students:', ai_students.count())
ai_secs = Section.objects.filter(Q(batch__course__department=ai) | Q(students__home_department=ai)).distinct()
print('AI&DS sections:', list(ai_secs.values_list('id', 'name', 'batch__name', 'semester__number')))

from OBE.models import Cia1Mark
ai_regs = list(ai_students.values_list('id', flat=True))
subs_from_marks = Subject.objects.filter(cia1_marks__student_id__in=ai_regs).distinct()
print('AI&DS subjects via CIA1 marks:', subs_from_marks.count(), list(subs_from_marks.values_list('code','name')[:10]))

print('\n--- Academic years / batches ---')
print('batches:', list(Batch.objects.values_list('name', 'is_active')[:20]))
from academics.models import AcademicYear
print('AcademicYear rows:', list(AcademicYear.objects.values_list('name')[:10]))
