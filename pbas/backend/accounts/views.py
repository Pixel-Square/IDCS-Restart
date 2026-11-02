from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import User, Role, Department, College, StaffProfile
from .serializers import UserSerializer, RoleSerializer, DepartmentSerializer, CollegeSerializer

class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []


    def post(self, request):
        email = request.data.get('email', '').strip()
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        identifier = email or username
        if not identifier or not password:
            return Response({'error': 'Email/username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = None
        # Try authenticate with email as USERNAME_FIELD
        user = authenticate(request, username=identifier, password=password)
        if not user:
            # Fallback check if user entered username instead of email
            try:
                candidate = User.objects.filter(username=identifier).first()
                if candidate and candidate.check_password(password):
                    user = candidate
            except Exception:
                pass

        if not user:
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({'error': 'Account is disabled.'}, status=status.HTTP_403_FORBIDDEN)

        refresh = RefreshToken.for_user(user)
        user_data = UserSerializer(user).data

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': user_data,
        })

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

class DemoUsersView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        """Returns demo accounts for quick-login & testing across all PBAS roles."""
        demo_accounts = [
            {
                'role': 'Faculty Submitter',
                'badge': 'FACULTY',
                'email': 'faculty@pbas.edu',
                'password': 'password123',
                'name': 'Dr. Aris Thorne',
                'department': 'Computer Science & Engineering',
                'staff_id': 'CSE_FAC_01',
                'description': 'Can submit PBAS scores, attach evidence PDFs, links, and track approval status.'
            },
            {
                'role': 'HOD Approver',
                'badge': 'HOD',
                'email': 'hod@pbas.edu',
                'password': 'password123',
                'name': 'Prof. Rajesh K',
                'department': 'Computer Science & Engineering',
                'staff_id': 'CSE_HOD_01',
                'description': 'Can review departmental faculty submissions, approve/reject, and add remarks.'
            },
            {
                'role': 'Principal (Executive)',
                'badge': 'PRINCIPAL',
                'email': 'principal@pbas.edu',
                'password': 'password123',
                'name': 'Dr. Meenakshi S',
                'department': 'Administration',
                'staff_id': 'PRIN_01',
                'description': 'Final authority for institutional score appraisals and career advancement clearance.'
            },
            {
                'role': 'IQAC / PBAS Admin',
                'badge': 'IQAC',
                'email': 'iqac@pbas.edu',
                'password': 'password123',
                'name': 'Dr. Suresh V',
                'department': 'Internal Quality Assurance Cell',
                'staff_id': 'IQAC_01',
                'description': 'Configures PBAS categories, points limits, duration windows, and views all analytics.'
            },
            {
                'role': 'Student Submitter',
                'badge': 'STUDENT',
                'email': 'student@pbas.edu',
                'password': 'password123',
                'name': 'Aditi Sharma',
                'department': 'Computer Science & Engineering',
                'reg_no': '7376221CS101',
                'description': 'Can submit student development & co-curricular evidence for credit verification.'
            },
        ]
        return Response(demo_accounts)

class RoleListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        roles = Role.objects.all().order_by('name')
        return Response(RoleSerializer(roles, many=True).data)

class DepartmentListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        depts = Department.objects.all().order_by('code')
        return Response(DepartmentSerializer(depts, many=True).data)

class CollegeListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []


    def get(self, request):
        colleges = College.objects.all().order_by('code')
        return Response(CollegeSerializer(colleges, many=True).data)
