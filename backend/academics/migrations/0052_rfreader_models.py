from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0051_period_attendance_swap'),
    ]

    operations = [
        migrations.CreateModel(
            name='RFReaderGate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=64, unique=True)),
                ('description', models.CharField(blank=True, max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'RF Reader Gate',
                'verbose_name_plural': 'RF Reader Gates',
                'ordering': ('name',),
            },
        ),
        migrations.CreateModel(
            name='RFReaderStudent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('roll_no', models.CharField(max_length=32, unique=True)),
                ('name', models.CharField(max_length=128)),
                ('impres_code', models.CharField(blank=True, max_length=64)),
                ('rf_uid', models.CharField(blank=True, max_length=32, null=True, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'RF Reader Student',
                'verbose_name_plural': 'RF Reader Students',
                'ordering': ('roll_no',),
            },
        ),
        migrations.CreateModel(
            name='RFReaderScan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('uid', models.CharField(max_length=32)),
                ('raw_line', models.TextField(blank=True)),
                ('source', models.CharField(default='SERIAL', max_length=16)),
                ('scanned_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('gate', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='scans', to='academics.rfreadergate')),
                ('student', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='scans', to='academics.rfreaderstudent')),
            ],
            options={
                'verbose_name': 'RF Reader Scan',
                'verbose_name_plural': 'RF Reader Scans',
                'ordering': ('-scanned_at',),
            },
        ),
    ]
