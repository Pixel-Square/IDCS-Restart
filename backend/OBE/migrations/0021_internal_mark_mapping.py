from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0001_initial'),
        ('OBE', '0020_review1_review2_marks'),
    ]

    operations = [
        migrations.CreateModel(
            name='InternalMarkMapping',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mapping', models.JSONField(default=dict)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'subject',
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='internal_mark_mapping',
                        to='academics.subject',
                    ),
                ),
            ],
            options={
                'db_table': 'obe_internal_mark_mapping',
            },
        ),
    ]
