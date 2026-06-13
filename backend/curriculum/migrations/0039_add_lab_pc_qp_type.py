from django.db import migrations

def add_lab_pc_qp_type(apps, schema_editor):
    QuestionPaperType = apps.get_model('curriculum', 'QuestionPaperType')
    QuestionPaperType.objects.get_or_create(
        code='LAB_PC',
        defaults={'label': 'lab_PC', 'is_active': True, 'sort_order': 5}
    )

def remove_lab_pc_qp_type(apps, schema_editor):
    QuestionPaperType = apps.get_model('curriculum', 'QuestionPaperType')
    QuestionPaperType.objects.filter(code='LAB_PC').delete()

class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0038_alter_curriculumdepartment_class_type_and_more'),
    ]

    operations = [
        migrations.RunPython(add_lab_pc_qp_type, remove_lab_pc_qp_type),
    ]
