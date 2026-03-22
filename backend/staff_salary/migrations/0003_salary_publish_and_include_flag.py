from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('staff_salary', '0002_staffsalarydeclaration_type2_pf_value'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='salarymonthlyinput',
            name='include_in_salary',
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name='SalaryMonthPublish',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField(help_text='Use first day of month', unique=True)),
                ('published_at', models.DateTimeField(auto_now=True)),
                ('published_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='salary_month_publishes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-month'],
            },
        ),
        migrations.CreateModel(
            name='SalaryPublishedReceipt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField(help_text='Use first day of month')),
                ('is_salary_included', models.BooleanField(default=True)),
                ('receipt_data', models.JSONField(blank=True, default=dict)),
                ('published_at', models.DateTimeField(auto_now=True)),
                ('published_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='salary_receipts_published', to=settings.AUTH_USER_MODEL)),
                ('staff', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='salary_published_receipts', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-month', 'staff_id'],
                'unique_together': {('month', 'staff')},
            },
        ),
    ]
