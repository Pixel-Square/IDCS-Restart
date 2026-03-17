from rest_framework import serializers
from .models import Announcement, AnnouncementCourse, AnnouncementRead
from academics.models import Course


class CourseSimpleSerializer(serializers.ModelSerializer):
    """Simple course serializer for announcement targets."""
    
    class Meta:
        model = Course
        fields = ['id', 'code', 'title']


class AnnouncementCourseSerializer(serializers.ModelSerializer):
    """Serializer for announcement course targets."""
    course = CourseSimpleSerializer(read_only=True)
    course_id = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.all(),
        write_only=True,
        source='course'
    )
    
    class Meta:
        model = AnnouncementCourse
        fields = ['course', 'course_id', 'created_at']
        read_only_fields = ['created_at']


class AnnouncementListSerializer(serializers.ModelSerializer):
    """Serializer for listing announcements."""
    
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    course_count = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    
    class Meta:
        model = Announcement
        fields = [
            'id', 'title', 'source', 'created_by_name', 'created_at', 
            'updated_at', 'is_published', 'course_count', 'is_read'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_course_count(self, obj):
        return obj.courses.count()
    
    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.reads.filter(user=request.user).exists()
        return False


class AnnouncementDetailSerializer(serializers.ModelSerializer):
    """Serializer for announcement detail view."""
    
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    courses = CourseSimpleSerializer(many=True, read_only=True)
    course_ids = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.all(),
        many=True,
        write_only=True,
        source='courses'
    )
    is_read = serializers.SerializerMethodField()
    read_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Announcement
        fields = [
            'id', 'title', 'content', 'source', 'created_by', 'created_by_name',
            'created_at', 'updated_at', 'courses', 'course_ids', 'is_published',
            'published_at', 'scheduled_for', 'is_read', 'read_count'
        ]
        read_only_fields = [
            'id', 'created_by', 'created_at', 'updated_at', 'published_at'
        ]
    
    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.reads.filter(user=request.user).exists()
        return False
    
    def get_read_count(self, obj):
        return obj.reads.count()
    
    def create(self, validated_data):
        courses = validated_data.pop('courses', [])
        request = self.context.get('request')
        validated_data['created_by'] = request.user
        
        # Determine source based on user role
        if hasattr(request.user, 'staff_profile'):
            designation = request.user.staff_profile.designation
            if 'HOD' in designation.upper():
                validated_data['source'] = 'hod'
            else:
                validated_data['source'] = 'iqac'
        
        announcement = Announcement.objects.create(**validated_data)
        
        # Add courses
        for course in courses:
            AnnouncementCourse.objects.create(announcement=announcement, course=course)
        
        return announcement
    
    def update(self, instance, validated_data):
        courses = validated_data.pop('courses', None)
        
        # Update announcement fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update courses if provided
        if courses is not None:
            instance.courses.clear()
            for course in courses:
                AnnouncementCourse.objects.create(announcement=instance, course=course)
        
        return instance


class AnnouncementReadSerializer(serializers.ModelSerializer):
    """Serializer for marking announcements as read."""
    
    class Meta:
        model = AnnouncementRead
        fields = ['announcement', 'read_at']
        read_only_fields = ['read_at']
