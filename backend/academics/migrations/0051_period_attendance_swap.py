import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0050_two_stage_unlock_approval'),
    ]

    operations = [
        migrations.AddField(
            model_name='periodattendancesession',
            name='assigned_to',
            field=models.ForeignKey(
                blank=True,
                help_text='Staff assigned to take attendance for this period (via swap)',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assigned_period_sessions',
                to='academics.staffprofile',
            ),
        ),
        migrations.CreateModel(
            name='PeriodAttendanceSwapRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assigned_at', models.DateTimeField(auto_now_add=True)),
                ('reason', models.TextField(blank=True)),
                ('assigned_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='period_swaps_assigned',
                    to='academics.staffprofile',
                )),
                ('assigned_to', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='period_swaps_received',
                    to='academics.staffprofile',
                )),
                ('session', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='swap_records',
                    to='academics.periodattendancesession',
                )),
            ],
            options={
                'verbose_name': 'Period Attendance Swap Record',
                'verbose_name_plural': 'Period Attendance Swap Records',
                'ordering': ('-assigned_at',),
            },
        ),
    ]
