"""Migration: add hidden_for_departments M2M to CurriculumFieldSchema."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '__first__'),
        ('curriculum', '0049_seed_core_field_schemas'),
    ]

    operations = [
        migrations.AddField(
            model_name='curriculumfieldschema',
            name='hidden_for_departments',
            field=__import__('django.db.models', fromlist=['ManyToManyField']).ManyToManyField(
                blank=True,
                help_text='Departments that have removed this master field from their view.',
                related_name='hidden_curriculum_fields',
                to='academics.department',
            ),
        ),
    ]
