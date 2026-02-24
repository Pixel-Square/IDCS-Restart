from django.db import models


class DimStudent(models.Model):
    student_id = models.BigIntegerField(primary_key=True)
    reg_no = models.CharField(max_length=64)
    status = models.CharField(max_length=16)

    user_id = models.BigIntegerField()
    username = models.CharField(max_length=150)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.CharField(max_length=254)

    section_id = models.BigIntegerField(null=True)
    section_name = models.CharField(max_length=8, blank=True)
    batch_id = models.BigIntegerField(null=True)
    batch_name = models.CharField(max_length=32, blank=True)

    course_id = models.BigIntegerField(null=True)
    course_name = models.CharField(max_length=128, blank=True)
    program_id = models.BigIntegerField(null=True)
    program_name = models.CharField(max_length=32, blank=True)

    dept_id = models.BigIntegerField(null=True)
    dept_code = models.CharField(max_length=16, blank=True)
    dept_name = models.CharField(max_length=128, blank=True)

    mobile_number_verified_at = models.DateTimeField(null=True)

    class Meta:
        managed = False
        db_table = 'bi_dim_student'
        verbose_name = 'BI Student'
        verbose_name_plural = 'BI Students'


class DimSubject(models.Model):
    subject_id = models.BigIntegerField(primary_key=True)
    subject_code = models.CharField(max_length=32)
    subject_name = models.CharField(max_length=128)

    semester_id = models.BigIntegerField()
    semester_no = models.IntegerField(null=True)

    course_id = models.BigIntegerField(null=True)
    course_name = models.CharField(max_length=128, blank=True)
    program_id = models.BigIntegerField(null=True)
    program_name = models.CharField(max_length=32, blank=True)

    dept_id = models.BigIntegerField(null=True)
    dept_code = models.CharField(max_length=16, blank=True)
    dept_name = models.CharField(max_length=128, blank=True)

    class Meta:
        managed = False
        db_table = 'bi_dim_subject'
        verbose_name = 'BI Subject'
        verbose_name_plural = 'BI Subjects'


class DimTeachingAssignment(models.Model):
    teaching_assignment_id = models.BigIntegerField(primary_key=True)
    is_active = models.BooleanField()

    academic_year_id = models.BigIntegerField(null=True)
    academic_year = models.CharField(max_length=32, blank=True)
    academic_year_parity = models.CharField(max_length=8, blank=True)

    section_id = models.BigIntegerField(null=True)
    section_name = models.CharField(max_length=8, blank=True)

    subject_id = models.BigIntegerField(null=True)
    subject_code = models.CharField(max_length=32, blank=True)
    subject_name = models.CharField(max_length=128, blank=True)

    staff_profile_id = models.BigIntegerField(null=True)
    staff_id = models.CharField(max_length=64, blank=True)
    staff_user_id = models.BigIntegerField(null=True)
    staff_username = models.CharField(max_length=150, blank=True)
    staff_first_name = models.CharField(max_length=150, blank=True)
    staff_last_name = models.CharField(max_length=150, blank=True)

    enabled_assessments = models.JSONField(null=True)

    class Meta:
        managed = False
        db_table = 'bi_dim_teaching_assignment'
        verbose_name = 'BI Teaching Assignment'
        verbose_name_plural = 'BI Teaching Assignments'


class FactMark(models.Model):
    fact_key = models.CharField(max_length=128, primary_key=True)

    assessment_key = models.CharField(max_length=32)
    component_key = models.CharField(max_length=32)

    source_table = models.CharField(max_length=64)
    source_id = models.BigIntegerField()

    subject_id = models.BigIntegerField()
    subject_code = models.CharField(max_length=32)
    subject_name = models.CharField(max_length=128)

    student_id = models.BigIntegerField()
    reg_no = models.CharField(max_length=64)

    score = models.DecimalField(max_digits=12, decimal_places=3, null=True)

    created_at = models.DateTimeField(null=True)
    updated_at = models.DateTimeField(null=True)

    class Meta:
        managed = False
        db_table = 'bi_fact_marks'
        verbose_name = 'BI Mark'
        verbose_name_plural = 'BI Marks'
