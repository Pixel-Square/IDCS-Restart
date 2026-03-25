from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('COE', '0003_coeexamdummy_qp_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='CoeArrearStudent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('batch', models.CharField(max_length=32)),
                ('department', models.CharField(db_index=True, max_length=16)),
                ('semester', models.CharField(db_index=True, max_length=16)),
                ('course_code', models.CharField(db_index=True, max_length=64)),
                ('course_name', models.CharField(max_length=255)),
                ('student_register_number', models.CharField(db_index=True, max_length=64)),
                ('student_name', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['department', 'semester'], name='COE_coearre_departm_86f297_idx'),
                    models.Index(fields=['course_code', 'semester'], name='COE_coearre_course__6840a4_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(fields=('department', 'semester', 'course_code', 'student_register_number'), name='uniq_coe_arrear_dept_sem_course_reg'),
                ],
            },
        ),
    ]
