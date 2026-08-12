from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('college', '0004_featurecatalog_permissions'),
        ('curriculum', '0047_curriculumdepartment_dynamic_data_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='CurriculumFieldSchema',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=64, help_text="Unique field key, e.g. 'co_attainment'")),
                ('label', models.CharField(max_length=128, help_text="Display label shown in table header")),
                ('data_type', models.CharField(
                    max_length=16,
                    choices=[('int', 'Integer'), ('float', 'Float'), ('text', 'Text'), ('bool', 'Boolean'), ('select', 'Select')],
                    default='text',
                )),
                ('options', models.JSONField(default=list, blank=True, help_text='Options for select type, e.g. ["A","B","C"]')),
                ('default_value', models.CharField(max_length=255, blank=True, default='')),
                ('is_core', models.BooleanField(default=False, help_text='Core fields come from master and cannot be freely deleted from dept')),
                ('scope', models.CharField(
                    max_length=16,
                    choices=[('master', 'Master Only'), ('department', 'Department Only'), ('both', 'Both')],
                    default='both',
                )),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.PositiveSmallIntegerField(default=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('college', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='curriculum_field_schemas',
                    to='college.college',
                )),
            ],
            options={
                'verbose_name': 'Curriculum Field Schema',
                'verbose_name_plural': 'Curriculum Field Schemas',
                'ordering': ('sort_order', 'key'),
                'unique_together': {('college', 'key')},
            },
        ),
    ]
