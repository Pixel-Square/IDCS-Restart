# Generated migration for CourseQuestionBank models

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0083_merge_20260424_1934'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('OBE', '0060_rename_obe_final_i_subject_8c1d53_idx_obe_final_i_subject_b203e4_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='CourseQuestionBank',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('course_code', models.CharField(db_index=True, max_length=64)),
                ('course_name', models.CharField(blank=True, max_length=255)),
                ('s_no', models.IntegerField()),
                ('question_text', models.TextField()),
                ('course_outcome', models.CharField(blank=True, help_text='CO mapping', max_length=255, null=True)),
                ('part', models.CharField(blank=True, help_text='Part A, B, C etc', max_length=10, null=True)),
                ('btl', models.IntegerField(blank=True, help_text="Bloom's Taxonomy Level (1-6)", null=True)),
                ('marks', models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True)),
                ('is_finalized', models.BooleanField(default=False)),
                ('finalized_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='finalized_question_banks', to='academics.staffprofile')),
                ('finalized_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_question_banks', to='academics.staffprofile')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'obe_course_question_bank',
                'ordering': ('course_code', 's_no'),
                'unique_together': {('course_code', 's_no')},
            },
        ),
        migrations.AddIndex(
            model_name='coursequestionbank',
            index=models.Index(fields=['course_code', 'is_finalized'], name='obe_question_bank_course_idx'),
        ),
        migrations.AddIndex(
            model_name='coursequestionbank',
            index=models.Index(fields=['is_finalized', 'updated_at'], name='obe_question_bank_finalized_idx'),
        ),
    ]
