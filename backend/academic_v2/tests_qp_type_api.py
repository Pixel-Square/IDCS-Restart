from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from academic_v2.models import AcV2ClassType, AcV2QpAssignment, AcV2QpPattern, AcV2QpType


class QpTypeApiTests(TestCase):
    def test_create_qp_type_returns_201(self):
        User = get_user_model()
        user = User.objects.create_user(username='qp_type_api_user', password='StrongPass123!')

        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            '/api/academic-v2/qp-types/',
            {
                'name': 'QA TEST TYPE',
                'code': 'QAT',
                'description': 'Regression test',
                'class_type': None,
                'is_active': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data['code'], 'QAT')

    def test_admin_secure_delete_removes_qp_type_assignments(self):
        User = get_user_model()
        user = User.objects.create_user(
            username='qp_delete_admin',
            password='StrongPass123!',
            is_staff=True,
            is_superuser=True,
        )

        class_type = AcV2ClassType.objects.create(
            name='THEORY',
            short_code='TH',
            display_name='Theory',
        )
        qp_type = AcV2QpType.objects.create(
            name='Test QP Type X',
            code='TQX',
            class_type=class_type,
            description='Regression test',
        )
        assignment = AcV2QpAssignment.objects.create(
            class_type=class_type,
            qp_type=qp_type,
            exam_assignment=None,
        )
        AcV2QpPattern.objects.create(
            name='Test pattern',
            qp_type='TQX',
            class_type=class_type,
            default_weight=10,
        )

        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(
            '/api/academic-v2/admin/secure-delete/',
            {
                'object_type': 'qp_type',
                'id': 'TQX',
                'password': 'StrongPass123!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['success'], True)
        self.assertFalse(AcV2QpType.objects.filter(pk=qp_type.pk).exists())
        self.assertFalse(AcV2QpAssignment.objects.filter(pk=assignment.pk).exists())
