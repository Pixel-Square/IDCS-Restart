from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0001_initial'),
        ('staff_requests', '0014_vacation_semester_master'),
    ]

    operations = [
        migrations.CreateModel(
            name='VacationConfirmSlot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('semester', models.CharField(blank=True, default='', max_length=80)),
                ('slot_name', models.CharField(blank=True, default='Confirmed Slot', max_length=120)),
                ('from_date', models.DateField(db_index=True)),
                ('to_date', models.DateField(db_index=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('semester_ref', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='confirm_slots', to='staff_requests.vacationsemester')),
            ],
            options={
                'verbose_name': 'Vacation Confirm Slot',
                'verbose_name_plural': 'Vacation Confirm Slots',
                'ordering': ['from_date', 'id'],
            },
        ),
        migrations.AddField(
            model_name='vacationconfirmslot',
            name='departments',
            field=models.ManyToManyField(blank=True, related_name='vacation_confirm_slots', to='academics.department'),
        ),
    ]
