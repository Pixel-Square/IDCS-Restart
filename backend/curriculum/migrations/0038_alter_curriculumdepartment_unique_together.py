from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0037_alter_curriculumdepartment_class_type_and_more'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='curriculumdepartment',
            unique_together={('department', 'regulation', 'semester', 'course_code', 'batch')},
        ),
    ]
