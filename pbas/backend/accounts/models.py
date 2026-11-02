from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings

class Role(models.Model):
    name = models.CharField(max_length=64, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name

class Department(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=64, blank=True)

    def __str__(self):
        return f"{self.code} - {self.name}"

class College(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=64, blank=True)

    def __str__(self):
        return f"{self.code} - {self.name}"

class User(AbstractUser):
    email = models.EmailField('email address', unique=True)
    username = models.CharField(max_length=150, unique=False)
    roles = models.ManyToManyField(Role, related_name='users', blank=True)
    profile_image = models.CharField(max_length=500, blank=True, default='')
    mobile_no = models.CharField(max_length=32, blank=True, default='')

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        full_name = f"{self.first_name} {self.last_name}".strip()
        return full_name if full_name else (self.username or self.email)

    def get_role_names(self):
        return [r.name.upper() for r in self.roles.all()]

    def has_role(self, *role_names):
        user_roles = set(self.get_role_names())
        check = {r.upper() for r in role_names}
        if self.is_superuser:
            return True
        return bool(user_roles & check)

    @property
    def profile_type(self):
        if hasattr(self, 'student_profile') and self.student_profile is not None:
            return 'student'
        if hasattr(self, 'staff_profile') and self.staff_profile is not None:
            return 'faculty'
        return 'faculty'

class StaffProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='staff_profile')
    staff_id = models.CharField(max_length=64, unique=True, db_index=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    designation = models.CharField(max_length=128, blank=True, default='Assistant Professor')
    profile_image = models.CharField(max_length=500, blank=True, default='')
    
    # PBAS Credit Trackers
    pbas_credit = models.IntegerField(default=0)
    pbas_academics_credit = models.IntegerField(default=0)
    pbas_student_development_credit = models.IntegerField(default=0)
    pbas_research_development_credit = models.IntegerField(default=0)
    pbas_institutional_contribution_credit = models.IntegerField(default=0)

    def __str__(self):
        full = self.user.get_full_name() or self.user.username
        return f"{full} ({self.staff_id})"

class StudentProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='student_profile')
    reg_no = models.CharField(max_length=64, unique=True, db_index=True)
    home_department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='students')
    batch = models.CharField(max_length=32, blank=True, default='2022-2026')
    pbas_credit = models.IntegerField(default=0)

    def __str__(self):
        full = self.user.get_full_name() or self.user.username
        return f"{full} ({self.reg_no})"

class StudentMentorMap(models.Model):
    student = models.ForeignKey(StudentProfile, on_delete=models.CASCADE, related_name='mentor_mappings')
    mentor = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='mentee_mappings')
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Mentor: {self.mentor.staff_id} -> Student: {self.student.reg_no}"
