# Migration to add missing Engineering Physics (Theory) subject
# GEA1101 - Engineering Physics (Theory) for semester 1

from django.db import migrations, models
import django.db.models.deletion


def add_engineering_physics(apps, schema_editor):
    """Add GEA1101 - Engineering Physics (Theory) to CurriculumMaster"""
    CurriculumMaster = apps.get_model('curriculum', 'CurriculumMaster')
    Semester = apps.get_model('academics', 'Semester')
    Department = apps.get_model('academics', 'Department')
    
    try:
        # Get or create semester 1
        semester, _ = Semester.objects.get_or_create(number=1)
        
        # Find all regulations that have GEA1102 (Engineering Physics Lab) to determine which regulations need GEA1101
        regulations_with_gea1102 = set(
            CurriculumMaster.objects.filter(
                semester=semester,
                course_code='GEA1102'
            ).values_list('regulation', flat=True)
        )
        
        if not regulations_with_gea1102:
            # If no GEA1102, try to get regulations from any subject in semester 1
            regulations_with_gea1102 = set(
                CurriculumMaster.objects.filter(
                    semester=semester,
                    course_code__startswith='GEA'
                ).values_list('regulation', flat=True)
            )
        
        if not regulations_with_gea1102:
            # Fallback: use R2023 if no matching regulations found
            regulations_with_gea1102 = {'R2023'}
        
        # For each regulation that has GEA1102, add GEA1101 if it doesn't exist
        for regulation in regulations_with_gea1102:
            existing = CurriculumMaster.objects.filter(
                regulation=regulation,
                semester=semester,
                course_code='GEA1101'
            ).exists()
            
            if existing:
                print(f'GEA1101 already exists for regulation {regulation}')
                continue
            
            # Create Engineering Physics (Theory) entry
            gea1101, created = CurriculumMaster.objects.get_or_create(
                regulation=regulation,
                semester=semester,
                course_code='GEA1101',
                defaults={
                    'course_name': 'Engineering Physics',
                    'class_type': 'THEORY',
                    'category': 'ES',  # Engineering Science
                    'l': 2,  # Lecture hours
                    't': 0,  # Tutorial hours
                    'p': 0,  # Practical hours
                    's': 0,  # Self-study hours
                    'c': 3,  # Credits
                    'internal_mark': 40,
                    'external_mark': 60,
                    'total_mark': 100,
                    'for_all_departments': True,
                    'editable': False,
                }
            )
            
            if created:
                print(f'Created GEA1101 - Engineering Physics (Theory) for regulation {regulation}')
                
                # Try to add to all teaching departments
                departments = Department.objects.filter(is_teaching=True)
                if departments.exists():
                    gea1101.departments.set(departments)
                    print(f'Associated GEA1101 with {departments.count()} departments')
            else:
                print(f'GEA1101 already exists for regulation {regulation}')
            
    except Exception as e:
        print(f'Error adding Engineering Physics: {e}')


def reverse_add_engineering_physics(apps, schema_editor):
    """Remove GEA1101 from CurriculumMaster"""
    CurriculumMaster = apps.get_model('curriculum', 'CurriculumMaster')
    
    try:
        # Remove all GEA1101 entries regardless of regulation
        deleted_count, _ = CurriculumMaster.objects.filter(
            course_code='GEA1101'
        ).delete()
        print(f'Removed {deleted_count} GEA1101 entries - Engineering Physics')
    except Exception as e:
        print(f'Error removing Engineering Physics: {e}')


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0028_dynamic_class_type_validation'),
        ('academics', '0087_alter_staffprofile_staff_id'),
    ]

    operations = [
        migrations.RunPython(add_engineering_physics, reverse_add_engineering_physics),
    ]
