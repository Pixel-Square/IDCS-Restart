from django.test import TestCase
from academics.models import Department, Section, TeachingAssignment, StaffProfile, AcademicYear, Batch, Semester
from curriculum.models import CurriculumDepartment, Regulation
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate
from academics.views import TeachingAssignmentViewSet
from rest_framework import status
import json

class SharedSectionAssignmentSyncTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(username="admin", password="password", email="admin@test.com")
        self.academic_year = AcademicYear.objects.create(name="2026-2027", is_active=True)
        
        # S&H main department and core departments
        self.sh_dept = Department.objects.create(code="S&H", name="Science & Humanities", is_sh_main=True)
        self.cse_dept = Department.objects.create(code="CSE", name="Computer Science Engineering")
        self.ece_dept = Department.objects.create(code="ECE", name="Electronics Communication Engineering")
        
        # Batch and Regulation
        self.regulation = Regulation.objects.create(code="R2023", name="R2023 Regulation")
        self.batch = Batch.objects.create(
            name="2026 Batch",
            regulation=self.regulation,
            start_year=2026,
            end_year=2030,
            department=self.sh_dept
        )
        
        # Semester
        self.semester = Semester.objects.create(number=1)
        
        # Shared Section
        self.section = Section.objects.create(
            name="A",
            managing_department=self.sh_dept,
            batch=self.batch,
            semester=self.semester
        )
        
        # Staff Profiles
        self.staff_user_1 = User.objects.create(username="staff1", first_name="Staff", last_name="One", email="staff1@test.com")
        self.staff_1 = StaffProfile.objects.create(user=self.staff_user_1, staff_id="ST001")
        
        self.staff_user_2 = User.objects.create(username="staff2", first_name="Staff", last_name="Two", email="staff2@test.com")
        self.staff_2 = StaffProfile.objects.create(user=self.staff_user_2, staff_id="ST002")

        # Curriculum rows representing the same subject (e.g. Mathematics II) for different departments in shared section
        self.cr_cse = CurriculumDepartment.objects.create(
            course_code="GEA1121",
            course_name="Engineering Mathematics II",
            semester=self.semester,
            regulation="R2023",
            department=self.cse_dept
        )
        self.cr_ece = CurriculumDepartment.objects.create(
            course_code="GEA1121",
            course_name="Engineering Mathematics II",
            semester=self.semester,
            regulation="R2023",
            department=self.ece_dept
        )

    def test_shared_section_sync_on_create_update_delete(self):
        # 1. Create teaching assignment via viewset
        factory = APIRequestFactory()
        view = TeachingAssignmentViewSet.as_view({'post': 'create'})
        
        payload = {
            'staff_id': self.staff_1.id,
            'section_id': self.section.id,
            'curriculum_row_id': self.cr_cse.id,
            'academic_year': self.academic_year.id,
            'is_active': True
        }
        
        req = factory.post('/api/academics/teaching-assignments/', data=json.dumps(payload), content_type='application/json')
        force_authenticate(req, user=self.user)
        
        response = view(req)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Check that assignment was created for CSE row
        self.assertTrue(TeachingAssignment.objects.filter(
            section=self.section,
            curriculum_row=self.cr_cse,
            staff=self.staff_1,
            is_active=True
        ).exists())
        
        # Check that it automatically synced/duplicated to the ECE row
        self.assertTrue(TeachingAssignment.objects.filter(
            section=self.section,
            curriculum_row=self.cr_ece,
            staff=self.staff_1,
            is_active=True
        ).exists())
        
        # Find the assignment ID to update/delete
        ta_cse = TeachingAssignment.objects.get(section=self.section, curriculum_row=self.cr_cse, staff=self.staff_1)
        
        # 2. Update assignment staff to staff_2
        update_view = TeachingAssignmentViewSet.as_view({'put': 'update'})
        update_payload = {
            'staff_id': self.staff_2.id,
            'section_id': self.section.id,
            'curriculum_row_id': self.cr_cse.id,
            'academic_year': self.academic_year.id,
            'is_active': True
        }
        req_update = factory.put(f'/api/academics/teaching-assignments/{ta_cse.id}/', data=json.dumps(update_payload), content_type='application/json')
        force_authenticate(req_update, user=self.user)
        
        res_update = update_view(req_update, pk=ta_cse.id)
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        
        # Check that both assignments updated staff to staff_2
        self.assertTrue(TeachingAssignment.objects.filter(
            section=self.section,
            curriculum_row=self.cr_cse,
            staff=self.staff_2
        ).exists())
        self.assertTrue(TeachingAssignment.objects.filter(
            section=self.section,
            curriculum_row=self.cr_ece,
            staff=self.staff_2
        ).exists())
        
        # 3. Delete assignment
        delete_view = TeachingAssignmentViewSet.as_view({'delete': 'destroy'})
        req_delete = factory.delete(f'/api/academics/teaching-assignments/{ta_cse.id}/')
        force_authenticate(req_delete, user=self.user)
        
        res_delete = delete_view(req_delete, pk=ta_cse.id)
        self.assertEqual(res_delete.status_code, status.HTTP_204_NO_CONTENT)
        
        # Check that both assignments were deleted
        self.assertFalse(TeachingAssignment.objects.filter(
            section=self.section,
            curriculum_row=self.cr_cse
        ).exists())
        self.assertFalse(TeachingAssignment.objects.filter(
            section=self.section,
            curriculum_row=self.cr_ece
        ).exists())
