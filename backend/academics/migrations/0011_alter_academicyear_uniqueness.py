from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0009_academicyear_parity_batch_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='academicyear',
            name='name',
            field=models.CharField(max_length=32),
        ),
        migrations.AlterUniqueTogether(
            name='academicyear',
            unique_together={('name', 'parity')},
        ),
    ]
