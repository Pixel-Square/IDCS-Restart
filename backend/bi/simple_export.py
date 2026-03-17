"""
Simple Direct Download API - No complex auth required
Just use your username/password for HTTP Basic Auth
"""

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.authentication import BasicAuthentication
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
import csv
from io import StringIO

from bi.models import DimStudent, DimSubject, DimTeachingAssignment


@api_view(['POST'])
def login_simple(request):
    """
    Simple login: POST with username/password
    Returns download links for CSV files
    
    Usage:
    curl -X POST https://db.krgi.co.in/api/bi-simple/login/ \
      -H "Content-Type: application/json" \
      -d '{"username": "iqac@krct.ac.in", "password": "Iqac@2024"}'
    """
    from django.contrib.auth import authenticate
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    username = request.data.get('username') or request.data.get('identifier')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'error': 'Provide username and password'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Authenticate user
    user = authenticate(username=username, password=password)
    if user is None:
        # Try by email
        try:
            user = User.objects.get(email__iexact=username)
            if not user.check_password(password):
                user = None
        except User.DoesNotExist:
            user = None

    if user is None:
        return Response(
            {'error': 'Invalid username or password'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    return Response({
        'status': 'Success',
        'user': user.username,
        'message': 'Download links are ready',
        'download_links': {
            'students': f'https://db.krgi.co.in/api/bi-simple/download/students/?username={username}&password={password}',
            'subjects': f'https://db.krgi.co.in/api/bi-simple/download/subjects/?username={username}&password={password}',
            'staff': f'https://db.krgi.co.in/api/bi-simple/download/staff/?username={username}&password={password}',
        }
    })


@api_view(['GET'])
def download_students_simple(request):
    """
    Download students CSV with Basic Auth
    
    Usage:
    curl -u "iqac@krct.ac.in:Iqac@2024" \
      https://db.krgi.co.in/api/bi-simple/download/students/
    """
    from django.contrib.auth import authenticate
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    
    # Get credentials from query params or auth header
    username = request.query_params.get('username')
    password = request.query_params.get('password')
    
    if not username or not password:
        return Response(
            {'error': 'Provide username and password as query params'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = authenticate(username=username, password=password)
    if user is None:
        try:
            user = User.objects.get(email__iexact=username)
            if not user.check_password(password):
                user = None
        except User.DoesNotExist:
            user = None

    if user is None:
        return Response(
            {'error': 'Invalid credentials'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    # Get students
    students = DimStudent.objects.all()
    
    # Apply filters
    dept = request.query_params.get('dept_code')
    if dept:
        students = students.filter(dept_code=dept)
    
    batch = request.query_params.get('batch_name')
    if batch:
        students = students.filter(batch_name=batch)

    # Create CSV
    output = StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        'StudentID', 'RegistrationNumber', 'FirstName', 'LastName', 'Email',
        'Batch', 'Course', 'Department', 'Status', 'Section'
    ])
    
    # Data
    for s in students[:10000]:
        writer.writerow([
            s.student_id,
            s.reg_no,
            s.first_name,
            s.last_name,
            s.email,
            s.batch_name,
            s.course_name,
            s.dept_code,
            s.status,
            s.section_name,
        ])
    
    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="students.csv"'
    return response


@api_view(['GET'])
def download_subjects_simple(request):
    """Download subjects CSV"""
    from django.contrib.auth import authenticate, get_user_model
    
    User = get_user_model()
    username = request.query_params.get('username')
    password = request.query_params.get('password')
    
    user = authenticate(username=username, password=password)
    if user is None:
        try:
            user = User.objects.get(email__iexact=username)
            if not user.check_password(password):
                return Response({'error': 'Invalid credentials'}, status=401)
        except:
            return Response({'error': 'Invalid credentials'}, status=401)

    subjects = DimSubject.objects.all()
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['SubjectID', 'SubjectCode', 'SubjectName', 'Semester', 'Course', 'Department'])
    
    for s in subjects[:10000]:
        writer.writerow([s.subject_id, s.subject_code, s.subject_name, s.semester_no, s.course_name, s.dept_code])
    
    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="subjects.csv"'
    return response


@api_view(['GET'])
def download_staff_simple(request):
    """Download staff assignments CSV"""
    from django.contrib.auth import authenticate, get_user_model
    
    User = get_user_model()
    username = request.query_params.get('username')
    password = request.query_params.get('password')
    
    user = authenticate(username=username, password=password)
    if user is None:
        try:
            user = User.objects.get(email__iexact=username)
            if not user.check_password(password):
                return Response({'error': 'Invalid credentials'}, status=401)
        except:
            return Response({'error': 'Invalid credentials'}, status=401)

    assignments = DimTeachingAssignment.objects.all()
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['AssignmentID', 'StaffName', 'StaffID', 'Subject', 'AcademicYear', 'Department', 'Active'])
    
    for a in assignments[:10000]:
        writer.writerow([
            a.teaching_assignment_id,
            f"{a.staff_first_name} {a.staff_last_name}",
            a.staff_id,
            a.subject_name,
            a.academic_year,
            a.dept_code,
            a.is_active
        ])
    
    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="staff.csv"'
    return response
