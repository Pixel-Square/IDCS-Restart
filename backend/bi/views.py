"""
Power BI REST API Endpoints
These endpoints provide read-only access to BI data for Power BI dashboards.
Authentication: JWT Bearer token required
"""

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from .models import DimStudent, DimSubject, DimTeachingAssignment, FactMark
from .serializers import (
    DimStudentSerializer,
    DimSubjectSerializer, 
    DimTeachingAssignmentSerializer,
    FactMarkSerializer,
)


class DimStudentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for BI Student Dimension
    List: GET /api/bi/students/
    Detail: GET /api/bi/students/{id}/
    
    Query Parameters:
    - search: Search by name, username, email, reg_no
    - dept_code: Filter by department code
    - batch_name: Filter by batch
    - course_name: Filter by course
    """
    queryset = DimStudent.objects.all()
    serializer_class = DimStudentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['first_name', 'last_name', 'username', 'email', 'reg_no']
    ordering_fields = ['student_id', 'first_name', 'batch_name', 'dept_code']
    
    def get_queryset(self):
        queryset = DimStudent.objects.all()
        
        # Filter by department
        dept_code = self.request.query_params.get('dept_code')
        if dept_code:
            queryset = queryset.filter(dept_code=dept_code)
        
        # Filter by batch
        batch_name = self.request.query_params.get('batch_name')
        if batch_name:
            queryset = queryset.filter(batch_name=batch_name)
        
        # Filter by course
        course_name = self.request.query_params.get('course_name')
        if course_name:
            queryset = queryset.filter(course_name=course_name)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get student summary statistics
        GET /api/bi/students/summary/
        """
        total = DimStudent.objects.count()
        by_department = DimStudent.objects.values('dept_code', 'dept_name').annotate(
            count=__import__('django.db.models', fromlist=['Count']).Count('student_id')
        )
        by_batch = DimStudent.objects.values('batch_name').annotate(
            count=__import__('django.db.models', fromlist=['Count']).Count('student_id')
        )
        
        return Response({
            'total_students': total,
            'by_department': list(by_department),
            'by_batch': list(by_batch),
        })


class DimSubjectViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for BI Subject Dimension
    List: GET /api/bi/subjects/
    Detail: GET /api/bi/subjects/{id}/
    
    Query Parameters:
    - search: Search by subject_code, subject_name
    - semester_no: Filter by semester
    - course_name: Filter by course
    - dept_code: Filter by department
    """
    queryset = DimSubject.objects.all()
    serializer_class = DimSubjectSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['subject_code', 'subject_name', 'course_name']
    ordering_fields = ['subject_id', 'semester_no', 'subject_name']
    
    def get_queryset(self):
        queryset = DimSubject.objects.all()
        
        # Filter by semester
        semester_no = self.request.query_params.get('semester_no')
        if semester_no:
            queryset = queryset.filter(semester_no=semester_no)
        
        # Filter by course
        course_name = self.request.query_params.get('course_name')
        if course_name:
            queryset = queryset.filter(course_name=course_name)
        
        # Filter by department
        dept_code = self.request.query_params.get('dept_code')
        if dept_code:
            queryset = queryset.filter(dept_code=dept_code)
        
        return queryset


class DimTeachingAssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for BI Teaching Assignment Dimension
    List: GET /api/bi/teaching-assignments/
    Detail: GET /api/bi/teaching-assignments/{id}/
    
    Query Parameters:
    - search: Search by staff name, subject name
    - is_active: Filter by active status (true/false)
    - academic_year: Filter by academic year
    - dept_code: Filter by department
    """
    queryset = DimTeachingAssignment.objects.all()
    serializer_class = DimTeachingAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['staff_first_name', 'staff_last_name', 'subject_name', 'academic_year']
    ordering_fields = ['teaching_assignment_id', 'academic_year', 'staff_username']
    
    def get_queryset(self):
        queryset = DimTeachingAssignment.objects.all()
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Filter by academic year
        academic_year = self.request.query_params.get('academic_year')
        if academic_year:
            queryset = queryset.filter(academic_year=academic_year)
        
        # Filter by department
        dept_code = self.request.query_params.get('dept_code')
        if dept_code:
            queryset = queryset.filter(dept_code=dept_code)
        
        return queryset


class FactMarkViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for BI Mark Facts
    List: GET /api/bi/marks/
    Detail: GET /api/bi/marks/{id}/
    
    Query Parameters:
    - source_table: Filter by source table name
    - component_key: Filter by component key
    """
    queryset = FactMark.objects.all()
    serializer_class = FactMarkSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['fact_key', 'source_table']
    
    def get_queryset(self):
        queryset = FactMark.objects.all()
        
        # Filter by source table
        source_table = self.request.query_params.get('source_table')
        if source_table:
            queryset = queryset.filter(source_table=source_table)
        
        # Filter by component key
        component_key = self.request.query_params.get('component_key')
        if component_key:
            queryset = queryset.filter(component_key=component_key)
        
        return queryset
