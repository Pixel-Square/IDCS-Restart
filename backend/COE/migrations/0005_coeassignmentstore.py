from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('COE', '0004_coearrearstudent'),
    ]

    operations = [
        migrations.CreateModel(
            name='CoeAssignmentStore',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('store_key', models.CharField(db_index=True, max_length=64, unique=True)),
                ('assignments', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
    ]