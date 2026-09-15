from django.db import migrations, models


def backfill_pbas_category_credits(apps, schema_editor):
    StudentProfile = apps.get_model('academics', 'StudentProfile')
    StaffProfile = apps.get_model('academics', 'StaffProfile')
    PBASSubmission = apps.get_model('pbas', 'PBASSubmission')

    category_fields = {
        'academics': 'pbas_academics_credit',
        'student development': 'pbas_student_development_credit',
        'research and development': 'pbas_research_development_credit',
        'institutional contribution': 'pbas_institutional_contribution_credit',
    }

    for submission in PBASSubmission.objects.filter(status='approved').select_related('node', 'node__parent', 'user'):
        root = submission.node
        while root.parent_id:
            root = root.parent
        title = (root.label or '').strip().lower()
        category = next((key for key in category_fields if key in title), None)
        field_name = category_fields.get(category)
        points = submission.node.pbas_credit or 0
        if not field_name or points <= 0:
            continue

        student = StudentProfile.objects.filter(user_id=submission.user_id).first()
        profile = student or StaffProfile.objects.filter(user_id=submission.user_id).first()
        if profile:
            setattr(profile, field_name, (getattr(profile, field_name, 0) or 0) + points)
            profile.save(update_fields=[field_name])


class Migration(migrations.Migration):
    dependencies = [
        ('academics', '0096_remove_sectionadvisor_unique_active_advisor_per_section_year_and_more'),
        ('pbas', '0013_pbassubmission_approval_history_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='studentprofile',
            name='pbas_academics_credit',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='studentprofile',
            name='pbas_student_development_credit',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='studentprofile',
            name='pbas_research_development_credit',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='studentprofile',
            name='pbas_institutional_contribution_credit',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='staffprofile',
            name='pbas_academics_credit',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='staffprofile',
            name='pbas_student_development_credit',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='staffprofile',
            name='pbas_research_development_credit',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='staffprofile',
            name='pbas_institutional_contribution_credit',
            field=models.IntegerField(default=0),
        ),
        migrations.RunPython(backfill_pbas_category_credits, migrations.RunPython.noop),
    ]