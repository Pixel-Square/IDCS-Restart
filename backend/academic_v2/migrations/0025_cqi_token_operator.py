"""
Migration: CQI Token Registry + CQI Operator tables.

Creates:
  - acv2_cqi_token  (AcV2CqiToken)
  - acv2_cqi_operator (AcV2CqiOperator)

Seeds all built-in system tokens and comparison operators so the frontend
can immediately render a fully functional dynamic condition builder without
any additional admin configuration.

Token categories seeded:
  core       — BEFORE_CQI, AFTER_CQI, TOTAL_CQI, CQI/X
  co_alias   — CO-RAW, CO-MAX, CO-WEIGHT, CO-TOTAL-RAW, CO-TOTAL-WEIGHT
  co_dynamic — COX_PERCENT, BEFORE_CQI_COX_TOTAL, AFTER_CQI_COX_TOTAL

Operators seeded: <, <=, >, >=, ==, !=
"""

import uuid
from django.db import migrations, models
import django.db.models.deletion


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

SYSTEM_TOKENS = [
    # ---- core tokens ----
    {
        'code': 'BEFORE_CQI',
        'label': 'Before CQI (current CO total before adding CQI marks)',
        'description': (
            'The weighted CO total accumulated from all non-CQI exams for the current CO, '
            'BEFORE any CQI contribution is applied. This is the primary attainment check token.'
        ),
        'category': 'core',
        'is_dynamic_co': False,
        'available_in_condition': True,
        'available_in_formula': True,
        'order': 10,
    },
    {
        'code': 'AFTER_CQI',
        'label': 'After CQI (current CO total after adding CQI marks)',
        'description': (
            'The estimated CO total AFTER applying the CQI contribution. '
            'Equals BEFORE_CQI + CQI input value.'
        ),
        'category': 'core',
        'is_dynamic_co': False,
        'available_in_condition': True,
        'available_in_formula': True,
        'order': 11,
    },
    {
        'code': 'TOTAL_CQI',
        'label': 'Total CQI (grand total of all CQI inputs for this student)',
        'description': (
            'Sum of all CQI input values entered for the current student across all covered COs. '
            'Useful for whole-student threshold checks.'
        ),
        'category': 'core',
        'is_dynamic_co': False,
        'available_in_condition': True,
        'available_in_formula': True,
        'order': 12,
    },
    {
        'code': 'CQI',
        'label': 'CQI input value (entered by faculty for this CO)',
        'description': 'The raw CQI mark entered by the faculty for the current student and CO (0–10 scale).',
        'category': 'core',
        'is_dynamic_co': False,
        'available_in_condition': False,
        'available_in_formula': True,
        'order': 13,
    },
    {
        'code': 'X',
        'label': 'X — alias for CQI input value',
        'description': 'Alias for [CQI]. The raw CQI mark entered by faculty for this student/CO.',
        'category': 'core',
        'is_dynamic_co': False,
        'available_in_condition': False,
        'available_in_formula': True,
        'order': 14,
    },
    # ---- co_alias tokens (current CO) ----
    {
        'code': 'CO-RAW',
        'label': 'CO Raw marks (current CO, from exams)',
        'description': 'Total raw marks obtained by the student for the current CO across all non-CQI exams.',
        'category': 'co_alias',
        'is_dynamic_co': False,
        'available_in_condition': True,
        'available_in_formula': True,
        'order': 20,
    },
    {
        'code': 'CO-MAX',
        'label': 'CO Maximum marks (current CO)',
        'description': 'Maximum achievable marks for the current CO across all non-CQI exams.',
        'category': 'co_alias',
        'is_dynamic_co': False,
        'available_in_condition': False,
        'available_in_formula': True,
        'order': 21,
    },
    {
        'code': 'CO-WEIGHT',
        'label': 'CO Weighted % (current CO, before CQI)',
        'description': 'Weighted percentage for the current CO: (CO-RAW / CO-MAX) × 100.',
        'category': 'co_alias',
        'is_dynamic_co': False,
        'available_in_condition': True,
        'available_in_formula': True,
        'order': 22,
    },
    {
        'code': 'CO-TOTAL-RAW',
        'label': 'CO Total Raw (alias for CO-RAW)',
        'description': 'Alias for [CO-RAW]. Provided for clarity in formulas.',
        'category': 'co_alias',
        'is_dynamic_co': False,
        'available_in_condition': False,
        'available_in_formula': True,
        'order': 23,
    },
    {
        'code': 'CO-TOTAL-WEIGHT',
        'label': 'CO Total Weight % (alias for CO-WEIGHT)',
        'description': 'Alias for [CO-WEIGHT]. Provided for clarity in formulas.',
        'category': 'co_alias',
        'is_dynamic_co': False,
        'available_in_condition': False,
        'available_in_formula': True,
        'order': 24,
    },
    # ---- co_dynamic tokens ----
    {
        'code': 'COX_PERCENT',
        'label': 'COx Percent — weighted % for the current CO (dynamic alias)',
        'description': (
            'Dynamic alias that resolves to CO1_PERCENT, CO2_PERCENT, … at runtime based on the '
            'current CO being evaluated. Equals (CO-RAW / CO-MAX) × 100. '
            'Use this in conditions to check if the student has attained the threshold for THIS CO.'
        ),
        'category': 'co_dynamic',
        'is_dynamic_co': True,
        'available_in_condition': True,
        'available_in_formula': True,
        'order': 30,
    },
    {
        'code': 'BEFORE_CQI_COX_TOTAL',
        'label': 'Before CQI COx Total — CO total before CQI (dynamic alias)',
        'description': (
            'Dynamic alias for the current CO weighted total BEFORE CQI is applied. '
            'Equivalent to BEFORE_CQI when used in a per-CO context. '
            'COX is substituted with the actual CO number at runtime.'
        ),
        'category': 'co_dynamic',
        'is_dynamic_co': True,
        'available_in_condition': True,
        'available_in_formula': True,
        'order': 31,
    },
    {
        'code': 'AFTER_CQI_COX_TOTAL',
        'label': 'After CQI COx Total — CO total after CQI (dynamic alias)',
        'description': (
            'Dynamic alias for the current CO weighted total AFTER CQI is applied. '
            'Equivalent to AFTER_CQI when used in a per-CO context. '
            'COX is substituted with the actual CO number at runtime.'
        ),
        'category': 'co_dynamic',
        'is_dynamic_co': True,
        'available_in_condition': True,
        'available_in_formula': True,
        'order': 32,
    },
]

SYSTEM_OPERATORS = [
    {'code': '<',  'symbol': '<',  'label': 'Less than',             'order': 1},
    {'code': '<=', 'symbol': '≤',  'label': 'Less than or equal',    'order': 2},
    {'code': '>',  'symbol': '>',  'label': 'Greater than',          'order': 3},
    {'code': '>=', 'symbol': '≥',  'label': 'Greater than or equal', 'order': 4},
    {'code': '==', 'symbol': '=',  'label': 'Equal to',              'order': 5},
    {'code': '!=', 'symbol': '≠',  'label': 'Not equal to',          'order': 6},
]


def seed_tokens_and_operators(apps, schema_editor):
    AcV2CqiToken = apps.get_model('academic_v2', 'AcV2CqiToken')
    AcV2CqiOperator = apps.get_model('academic_v2', 'AcV2CqiOperator')

    for t in SYSTEM_TOKENS:
        AcV2CqiToken.objects.get_or_create(
            code=t['code'],
            college=None,
            class_type=None,
            defaults={
                'id': uuid.uuid4(),
                'label': t['label'],
                'description': t['description'],
                'category': t['category'],
                'is_dynamic_co': t['is_dynamic_co'],
                'is_system': True,
                'available_in_condition': t['available_in_condition'],
                'available_in_formula': t['available_in_formula'],
                'order': t['order'],
                'is_active': True,
            },
        )

    for op in SYSTEM_OPERATORS:
        AcV2CqiOperator.objects.get_or_create(
            code=op['code'],
            defaults={
                'id': uuid.uuid4(),
                'symbol': op['symbol'],
                'label': op['label'],
                'order': op['order'],
                'is_active': True,
            },
        )


def unseed_tokens_and_operators(apps, schema_editor):
    # Reverse migration: do nothing (table drop handles cleanup)
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('academic_v2', '0024_bypass_session_share_limit'),
        ('college', '0001_initial'),
    ]

    operations = [
        # ------------------------------------------------------------------ #
        # AcV2CqiToken
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name='AcV2CqiToken',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('code', models.CharField(max_length=80)),
                ('label', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('category', models.CharField(
                    choices=[
                        ('core', 'Core CQI'),
                        ('co_alias', 'CO Alias'),
                        ('co_dynamic', 'CO Dynamic'),
                        ('exam', 'Exam Token'),
                        ('custom', 'Custom Variable'),
                    ],
                    default='custom',
                    max_length=20,
                )),
                ('is_dynamic_co', models.BooleanField(default=False)),
                ('is_system', models.BooleanField(default=False)),
                ('available_in_condition', models.BooleanField(default=True)),
                ('available_in_formula', models.BooleanField(default=True)),
                ('order', models.IntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('college', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='cqi_tokens',
                    to='college.college',
                )),
                ('class_type', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='cqi_tokens',
                    to='academic_v2.acv2classtype',
                )),
            ],
            options={
                'verbose_name': 'CQI Token',
                'verbose_name_plural': 'CQI Tokens',
                'db_table': 'acv2_cqi_token',
                'ordering': ['order', 'category', 'code'],
            },
        ),
        migrations.AddConstraint(
            model_name='acv2cqitoken',
            constraint=models.UniqueConstraint(
                condition=django.db.models.Q(college__isnull=False, class_type__isnull=False),
                fields=['code', 'college', 'class_type'],
                name='unique_cqi_token_college_classtype',
            ),
        ),
        migrations.AddConstraint(
            model_name='acv2cqitoken',
            constraint=models.UniqueConstraint(
                condition=django.db.models.Q(college__isnull=False, class_type__isnull=True),
                fields=['code', 'college'],
                name='unique_cqi_token_college_global',
            ),
        ),
        migrations.AddConstraint(
            model_name='acv2cqitoken',
            constraint=models.UniqueConstraint(
                condition=django.db.models.Q(college__isnull=True, class_type__isnull=True),
                fields=['code'],
                name='unique_cqi_token_global',
            ),
        ),
        # ------------------------------------------------------------------ #
        # AcV2CqiOperator
        # ------------------------------------------------------------------ #
        migrations.CreateModel(
            name='AcV2CqiOperator',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('code', models.CharField(max_length=10, unique=True)),
                ('symbol', models.CharField(max_length=10)),
                ('label', models.CharField(max_length=80)),
                ('order', models.IntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'verbose_name': 'CQI Operator',
                'verbose_name_plural': 'CQI Operators',
                'db_table': 'acv2_cqi_operator',
                'ordering': ['order'],
            },
        ),
        # ------------------------------------------------------------------ #
        # Seed initial data
        # ------------------------------------------------------------------ #
        migrations.RunPython(seed_tokens_and_operators, unseed_tokens_and_operators),
    ]
