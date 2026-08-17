"""
Migration 0003: Add workspace_type, single_file_name, single_file_language to CodingProject.
Existing records default to SINGLE_FILE / java / solution — safe because
existing CODING assessments that were "projects" will need to be updated
by the incharge to set workspace_type=PROJECT, but their existing files
and commands are preserved.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('coder', '0002_web_execution'),
    ]

    operations = [
        migrations.AddField(
            model_name='codingproject',
            name='workspace_type',
            field=models.CharField(
                choices=[('SINGLE_FILE', 'Single File'), ('PROJECT', 'Project')],
                default='SINGLE_FILE',
                help_text='Determines the coding environment type',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='single_file_name',
            field=models.CharField(
                default='solution',
                help_text='Base file name without extension (e.g. HelloWorld)',
                max_length=128,
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='single_file_language',
            field=models.CharField(
                choices=[
                    ('python', 'Python'),
                    ('java', 'Java'),
                    ('c', 'C'),
                    ('cpp', 'C++'),
                ],
                default='java',
                help_text='Programming language for single-file mode',
                max_length=8,
            ),
        ),
    ]
