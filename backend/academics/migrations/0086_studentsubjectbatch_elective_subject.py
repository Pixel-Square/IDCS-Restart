from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0085_add_internal_external_ids'),
        ('curriculum', '0026_alter_curriculumdepartment_class_type_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='studentsubjectbatch',
            name='elective_subject',
            field=models.ForeignKey(
                blank=True,
                help_text='Direct elective subject mapping for elective batches.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='subject_batches',
                to='curriculum.electivesubject',
            ),
        ),
    ]
