from django.conf import settings
from django.db import models


class StaffSalaryDeclaration(models.Model):
    staff = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salary_declaration',
    )
    basic_salary = models.FloatField(default=0.0)
    allowance = models.FloatField(default=0.0)
    pf_enabled = models.BooleanField(default=True)
    type2_pf_value = models.FloatField(default=0.0, help_text='Type 2 PF value per staff (unique per employee)')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['staff_id']


class SalaryPFConfig(models.Model):
    threshold_amount = models.FloatField(default=15000.0)
    fixed_pf_amount = models.FloatField(default=1800.0)
    percentage_rate = models.FloatField(default=12.0)
    type1_department_ids = models.JSONField(default=list, blank=True)
    type2_department_ids = models.JSONField(default=list, blank=True)
    type2_constant_value = models.FloatField(default=0.0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Salary PF Config'
        verbose_name_plural = 'Salary PF Config'


class SalaryFormulaConfig(models.Model):
    expressions = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Salary Formula Config'
        verbose_name_plural = 'Salary Formula Config'


class SalaryDeductionType(models.Model):
    MODE_CHOICES = (
        ('emi', 'EMI'),
        ('monthly', 'Monthly'),
    )
    name = models.CharField(max_length=100, unique=True)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='monthly')
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['sort_order', 'id']


class SalaryEarnType(models.Model):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['sort_order', 'id']


class SalaryEMIPlan(models.Model):
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salary_emi_plans',
    )
    deduction_type = models.ForeignKey(
        SalaryDeductionType,
        on_delete=models.CASCADE,
        related_name='emi_plans',
    )
    total_amount = models.FloatField(default=0.0)
    months = models.PositiveIntegerField(default=1)
    start_month = models.DateField(help_text='Use first day of month')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_month', 'staff_id']


class SalaryMonthlyInput(models.Model):
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salary_monthly_inputs',
    )
    month = models.DateField(help_text='Use first day of month')
    earn_values = models.JSONField(default=dict, blank=True)
    deduction_values = models.JSONField(default=dict, blank=True)
    include_in_salary = models.BooleanField(default=True)
    od_new = models.FloatField(default=0.0)
    others = models.FloatField(default=0.0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['staff', 'month']]
        ordering = ['-month', 'staff_id']


class SalaryMonthPublish(models.Model):
    month = models.DateField(unique=True, help_text='Use first day of month')
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='salary_month_publishes',
    )
    published_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-month']


class SalaryPublishedReceipt(models.Model):
    month = models.DateField(help_text='Use first day of month')
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salary_published_receipts',
    )
    is_salary_included = models.BooleanField(default=True)
    receipt_data = models.JSONField(default=dict, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='salary_receipts_published',
    )
    published_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['month', 'staff']]
        ordering = ['-month', 'staff_id']
