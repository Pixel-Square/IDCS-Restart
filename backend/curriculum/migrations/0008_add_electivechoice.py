from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0007_electivesubject'),
        ('academics', '0031_alter_teachingassignment_section_nullable'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ElectiveChoice',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('elective_subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='choices', to='curriculum.electivesubject')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='elective_choices', to='academics.studentprofile')),
                ('academic_year', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='elective_choices', to='academics.academicyear')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={'verbose_name': 'Elective Choice', 'verbose_name_plural': 'Elective Choices'},
        ),
        migrations.AlterUniqueTogether(
            name='electivechoice',
            unique_together={('student', 'elective_subject', 'academic_year')},
        ),
    ]
