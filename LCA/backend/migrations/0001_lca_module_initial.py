import uuid
from django.db import migrations, models

class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='CdapRevision',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('subject_id', models.CharField(max_length=64, unique=True)),
                ('status', models.TextField(default='draft')),
                ('rows', models.JSONField(default=list)),
                ('books', models.JSONField(default=dict)),
                ('active_learning', models.JSONField(default=dict)),
                ('created_by', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'cdap_revisions',
            },
        ),
        migrations.CreateModel(
            name='LcaRevision',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('subject_id', models.CharField(max_length=64, unique=True)),
                ('status', models.TextField(default='draft')),
                ('data', models.JSONField(default=dict)),
                ('created_by', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'lca_revisions',
            },
        ),
        migrations.CreateModel(
            name='CoTargetRevision',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('subject_id', models.CharField(max_length=64, unique=True)),
                ('status', models.TextField(default='draft')),
                ('data', models.JSONField(default=dict)),
                ('created_by', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'co_target_revisions',
            },
        ),
        migrations.CreateModel(
            name='CdapActiveLearningAnalysisMapping',
            fields=[
                ('id', models.IntegerField(primary_key=True, serialize=False)),
                ('mapping', models.JSONField(default=dict)),
                ('updated_by', models.IntegerField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'cdap_active_learning_analysis_mapping',
            },
        ),
    ]
