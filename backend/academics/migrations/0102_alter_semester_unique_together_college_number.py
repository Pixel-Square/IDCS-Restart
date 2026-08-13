from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0101_alter_academicyear_unique_together'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='semester',
            unique_together={('college', 'number')},
        ),
    ]
