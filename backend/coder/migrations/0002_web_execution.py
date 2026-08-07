from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('coder', '0001_initial'),
    ]

    operations = [
        # --- CodingProject: add web execution fields ---
        migrations.AddField(
            model_name='codingproject',
            name='project_type',
            field=models.CharField(
                choices=[
                    ('CONSOLE', 'Console'),
                    ('WEB', 'Web'),
                    ('SPRING_BOOT', 'Spring Boot'),
                    ('FRONTEND', 'Frontend'),
                    ('FULL_STACK', 'Full Stack'),
                ],
                default='CONSOLE',
                help_text='Type of project determines execution strategy',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='runtime',
            field=models.CharField(
                choices=[('JAVA', 'Java'), ('PYTHON', 'Python'), ('NODE', 'Node.js')],
                default='JAVA',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='runtime_version',
            field=models.CharField(default='21', max_length=16),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='build_tool',
            field=models.CharField(
                choices=[('MAVEN', 'Maven'), ('GRADLE', 'Gradle'), ('NPM', 'npm'), ('NONE', 'None')],
                default='MAVEN',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='start_command',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Command to start the web application e.g. java -jar target/app.jar',
                max_length=512,
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='app_port',
            field=models.PositiveIntegerField(
                default=8080,
                help_text='Port the application binds to inside the container',
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='preview_enabled',
            field=models.BooleanField(
                default=False,
                help_text='Enable live preview panel for this assessment',
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='env_vars',
            field=models.JSONField(
                default=dict,
                help_text='Safe environment variables {KEY: VALUE} passed to the container',
            ),
        ),
        migrations.AddField(
            model_name='codingproject',
            name='working_directory',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Working directory inside the container (defaults to /workspace)',
                max_length=256,
            ),
        ),

        # --- New model: CodeExecutionSession ---
        migrations.CreateModel(
            name='CodeExecutionSession',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ('container_id', models.CharField(
                    blank=True, default='',
                    help_text='Docker container ID',
                    max_length=128,
                )),
                ('status', models.CharField(
                    choices=[
                        ('QUEUED', 'Queued'),
                        ('BUILDING', 'Building'),
                        ('STARTING', 'Starting'),
                        ('RUNNING', 'Running'),
                        ('FAILED', 'Failed'),
                        ('STOPPED', 'Stopped'),
                        ('EXPIRED', 'Expired'),
                    ],
                    default='QUEUED',
                    max_length=16,
                )),
                ('internal_port', models.PositiveIntegerField(
                    blank=True, null=True,
                    help_text='Host-side mapped port for this container',
                )),
                ('preview_token', models.CharField(
                    db_index=True, max_length=64, unique=True,
                    help_text='Secure token for the preview proxy URL',
                )),
                ('build_log', models.TextField(blank=True, default='')),
                ('run_log', models.TextField(blank=True, default='')),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('ready_at', models.DateTimeField(blank=True, null=True)),
                ('stopped_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(
                    help_text='Session auto-expires at this time',
                )),
                ('exit_code', models.IntegerField(blank=True, null=True)),
                ('last_activity', models.DateTimeField(auto_now=True)),
                ('student', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='coder_execution_sessions',
                    to='academics.studentprofile',
                )),
                ('assessment', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='execution_sessions',
                    to='coder.codeassessment',
                )),
            ],
            options={
                'verbose_name': 'Code Execution Session',
                'verbose_name_plural': 'Code Execution Sessions',
                'ordering': ('-started_at',),
            },
        ),
    ]
