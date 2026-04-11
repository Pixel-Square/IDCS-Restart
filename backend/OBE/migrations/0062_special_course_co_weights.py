from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0061_special_course_qp_pattern'),
        ('academics', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SpecialCourseCoWeights',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('weights', models.JSONField(default=dict)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('teaching_assignment', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='special_co_weights',
                    to='academics.teachingassignment',
                )),
            ],
            options={
                'db_table': 'obe_special_course_co_weights',
            },
        ),
    ]
