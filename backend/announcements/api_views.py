from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Prefetch
from django.utils import timezone

from .models import Announcement, AnnouncementCourse, AnnouncementRead
from .serializers import (
    AnnouncementListSerializer,
    AnnouncementDetailSerializer,
    AnnouncementReadSerializer,
    CourseSimpleSerializer
)
from academics.models import Course, StudentCourseEnrollment
from accounts.models import UserRole


class AnnouncementPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class IsHodOrIqac(permissions.BasePermission):
    """Permission to check if user is HOD or IQAC."""
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        # Check if user has HOD or IQAC role
        user_roles = request.user.roles.values_list('name', flat=True)
        return 'HOD' in user_roles or 'IQAC' in user_roles or request.user.is_superuser


class AnnouncementViewSet(viewsets.ModelViewSet):
    """ViewSet for managing announcements."""
    
    pagination_class = AnnouncementPagination
    
    def get_permission(self):
        """Return permission class based on action."""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsHodOrIqac()]
        return [permissions.IsAuthenticated()]
    
    def get_permissions(self):
        """Return list of permission instances."""
        return [permission() for permission in self.get_permission()]
    
    def get_serializer_class(self):
        """Return serializer class based on action."""
        if self.action == 'retrieve':
            return AnnouncementDetailSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return AnnouncementDetailSerializer
        return AnnouncementListSerializer
    
    def get_queryset(self):
        """Return filtered queryset based on user."""
        user = self.user
        
        if user.is_superuser:
            # Superusers see all announcements
            queryset = Announcement.objects.filter(is_published=True)
        else:
            # Check user's enrolled courses
            student_enrollments = StudentCourseEnrollment.objects.filter(
                student__user=user
            ).values_list('course_id', flat=True)
            
            # Announcements for user's courses or global announcements
            queryset = Announcement.objects.filter(
                Q(courses__id__in=student_enrollments) | Q(courses__isnull=True),
                is_published=True
            ).distinct()
        
        # Always prefetch related data
        queryset = queryset.select_related(
            'created_by'
        ).prefetch_related(
            'courses',
            'reads'
        )
        
        return queryset.order_by('-created_at')
    
    @property
    def user(self):
        return self.request.user
    
    def create(self, request, *args, **kwargs):
        """Create a new announcement."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    def perform_create(self, serializer):
        """Perform creation with current user."""
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        """Mark announcement as read by current user."""
        announcement = self.get_object()
        read_obj, created = AnnouncementRead.objects.get_or_create(
            announcement=announcement,
            user=request.user
        )
        
        serializer = AnnouncementReadSerializer(read_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def mark_as_unread(self, request, pk=None):
        """Mark announcement as unread by current user."""
        announcement = self.get_object()
        AnnouncementRead.objects.filter(
            announcement=announcement,
            user=request.user
        ).delete()
        return Response({'status': 'marked as unread'}, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def my_courses(self, request):
        """Get courses for current user to filter announcements."""
        if request.user.is_authenticated:
            # Get student's enrolled courses
            enrollments = StudentCourseEnrollment.objects.filter(
                student__user=request.user
            ).select_related('course')
            courses = [enrollment.course for enrollment in enrollments]
            serializer = CourseSimpleSerializer(courses, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response([], status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def available_courses(self, request):
        """Get all available courses for announcement targeting (HOD/IQAC only)."""
        if not request.user.is_authenticated:
            return Response([], status=status.HTTP_401_UNAUTHORIZED)
        
        # Check if user is HOD or IQAC
        user_roles = request.user.roles.values_list('name', flat=True)
        if 'HOD' not in user_roles and 'IQAC' not in user_roles and not request.user.is_superuser:
            return Response([], status=status.HTTP_403_FORBIDDEN)
        
        # Return all courses
        courses = Course.objects.all().order_by('code')
        serializer = CourseSimpleSerializer(courses, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
