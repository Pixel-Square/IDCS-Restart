from django.db import migrations, models
import accounts.models


class Migration(migrations.Migration):
    """
    Remove the unique constraint from User.username.
    Uniqueness is enforced by email (used as login identifier via
    IdentifierTokenObtainPairSerializer). Duplicate usernames (e.g. "John Smith")
    are now allowed; the email acts as the de-facto unique identity.
    """

    dependencies = [
        ('accounts', '0012_alter_userquery_admin_notes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='username',
            field=models.CharField(
                max_length=150,
                unique=False,
                help_text='150 characters or fewer. Letters, numbers, spaces, and @/./+/-/_ characters.',
                validators=[accounts.models.UsernameValidator()],
            ),
        ),
    ]
