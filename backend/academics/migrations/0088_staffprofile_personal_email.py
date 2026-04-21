from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0087_merge_20260415_0001'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffprofile',
            name='personal_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
    ]
