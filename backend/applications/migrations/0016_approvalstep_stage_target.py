from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0015_applicationrolehierarchystages'),
    ]

    operations = [
        migrations.AddField(
            model_name='approvalstep',
            name='stage',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='approval_steps',
                to='applications.applicationrolehierarchystage',
            ),
        ),
        migrations.AlterField(
            model_name='approvalstep',
            name='role',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='approval_steps',
                to='accounts.role',
            ),
        ),
    ]
