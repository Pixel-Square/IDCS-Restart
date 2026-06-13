import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from college.models import Student
from academics.models import *
from erp.models import *

student_id = '2503811724322072'
student = Student.objects.filter(register_number=student_id).first()
if not student:
    student = Student.objects.filter(roll_number=student_id).first()

if not student:
    print(f"Student {student_id} not found")
else:
    print(f"Found student: {student.name} ({student.register_number})")
    
    # Check section
    print(f"Section: {student.section}")
    print(f"Batch: {student.batch}")
    print(f"Department: {student.department}")

    # Check enrollments or academic section mappings?
