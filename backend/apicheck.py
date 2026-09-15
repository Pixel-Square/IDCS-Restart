import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

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

from curriculum.models import CurriculumDepartment
d18 = Department.objects.get(code='20212')
rows = CurriculumDepartment.objects.filter(department=d18)
print('DB READER CD rows:', rows.count())
for cd in rows[:10]:
    print(f'  cd id={cd.id} code={cd.course_code!r} name={cd.course_name!r} batch={cd.batch!r} sem={cd.semester.number if cd.semester else None} class_type={cd.class_type!r}')
for c in ['S&H', 'T&P']:
    d = Department.objects.filter(code=c).first()
    if d:
        print(c, 'CD rows with code:', CurriculumDepartment.objects.filter(department=d).exclude(course_code__isnull=True).exclude(course_code='').count())
