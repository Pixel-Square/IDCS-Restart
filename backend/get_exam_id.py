from academic_v2.models import AcV2Section, AcV2ExamAssignment
from academics.models import TeachingAssignment

# TA 155 is ECC1375 which had the bug
# Let's find its AcV2Section
ta = TeachingAssignment.objects.get(id=155)
# In AcV2, AcV2Section has a teaching_assignment or similar?
sec = AcV2Section.objects.filter(teaching_assignment_id=155).first()
if sec:
    exam = sec.exam_assignments.first()
    if exam:
        print(f"Exam ID: {exam.id}")
    else:
        print("No exams found for this section")
else:
    print("No AcV2Section found for this TA")
