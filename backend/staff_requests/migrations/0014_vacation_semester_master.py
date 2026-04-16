from django.db import migrations, models
import django.db.models.deletion


def backfill_semester_refs(apps, schema_editor):
    VacationSemester = apps.get_model('staff_requests', 'VacationSemester')
    VacationSlot = apps.get_model('staff_requests', 'VacationSlot')

    for slot in VacationSlot.objects.all().order_by('id'):
        name = (slot.semester or '').strip() or 'Default Semester'
        from_date = slot.semester_from_date or slot.from_date
        to_date = slot.semester_to_date or slot.to_date

        sem, _ = VacationSemester.objects.get_or_create(
            name=name,
            defaults={
                'from_date': from_date,
                'to_date': to_date,
                'is_active': True,
            },
        )

        # If semester exists, widen date window to include all linked slots.
        changed = False
        if from_date and sem.from_date and from_date < sem.from_date:
            sem.from_date = from_date
            changed = True
        if to_date and sem.to_date and to_date > sem.to_date:
            sem.to_date = to_date
            changed = True
        if changed:
            sem.save(update_fields=['from_date', 'to_date', 'updated_at'])

        slot.semester_ref_id = sem.id
        slot.save(update_fields=['semester_ref'])


def clear_semester_refs(apps, schema_editor):
    VacationSlot = apps.get_model('staff_requests', 'VacationSlot')
    VacationSlot.objects.all().update(semester_ref=None)


class Migration(migrations.Migration):

    dependencies = [
        ('staff_requests', '0013_vacation_rule_condition_and_semester_window'),
    ]

    operations = [
        migrations.CreateModel(
            name='VacationSemester',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80, unique=True)),
                ('from_date', models.DateField(db_index=True)),
                ('to_date', models.DateField(db_index=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Vacation Semester',
                'verbose_name_plural': 'Vacation Semesters',
                'ordering': ['from_date', 'id'],
            },
        ),
        migrations.AddField(
            model_name='vacationslot',
            name='semester_ref',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='slots', to='staff_requests.vacationsemester'),
        ),
        migrations.RunPython(backfill_semester_refs, clear_semester_refs),
    ]
