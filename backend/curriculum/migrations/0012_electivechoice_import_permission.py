# Generated manually for adding import permission to ElectiveChoice

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0011_alter_curriculumdepartment_question_paper_type_and_more'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='electivechoice',
            options={
                'permissions': [('import_elective_choices', 'Can import elective student mappings')],
                'verbose_name': 'Elective Choice',
                'verbose_name_plural': 'Elective Choices'
            },
        ),
    ]
