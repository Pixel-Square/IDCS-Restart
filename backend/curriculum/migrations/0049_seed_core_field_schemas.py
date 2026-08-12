"""Data migration: seed core CurriculumFieldSchema rows for every college."""
from django.db import migrations


CORE_FIELDS = [
    # key, label, data_type, sort_order, scope
    ('course_name',    'Course Name',     'text',   1,  'both'),
    ('class_type',     'Class Type',      'select', 2,  'both'),
    ('category',       'Category',        'text',   3,  'both'),
    ('is_elective',    'Elective',        'bool',   4,  'both'),
    ('l',              'L',               'int',    5,  'both'),
    ('t',              'T',               'int',    6,  'both'),
    ('p',              'P',               'int',    7,  'both'),
    ('s',              'S',               'int',    8,  'both'),
    ('c',              'Credits (C)',     'int',    9,  'both'),
    ('internal_mark',  'INT',             'int',    10, 'both'),
    ('external_mark',  'EXT',             'int',    11, 'both'),
    ('total_mark',     'TTL',             'int',    12, 'both'),
    ('qp_type',        'QP Type',         'text',   13, 'master'),
    ('is_dept_core',   'Dept Core',       'bool',   14, 'both'),
    ('mnemonic',       'Mnemonic',        'text',   15, 'department'),
    ('question_paper_type', 'QP Type',   'text',   16, 'department'),
    ('total_hours',    'Total Hours',     'int',    17, 'department'),
]

CLASS_TYPE_OPTIONS = [
    'THEORY', 'THEORY_PMBL', 'LAB', 'PURE_LAB', 'LAB_2',
    'TCPL', 'TCPR', 'PRACTICAL', 'PRBL', 'PROJECT',
    'AUDIT', 'SPECIAL', 'ENGLISH',
]


def seed_field_schemas(apps, schema_editor):
    College = apps.get_model('college', 'College')
    CurriculumFieldSchema = apps.get_model('curriculum', 'CurriculumFieldSchema')

    for college in College.objects.all():
        for key, label, data_type, sort_order, scope in CORE_FIELDS:
            opts = CLASS_TYPE_OPTIONS if key == 'class_type' else []
            CurriculumFieldSchema.objects.get_or_create(
                college=college,
                key=key,
                defaults={
                    'label': label,
                    'data_type': data_type,
                    'options': opts,
                    'default_value': '',
                    'is_core': True,
                    'scope': scope,
                    'is_active': True,
                    'sort_order': sort_order,
                },
            )


def reverse_seed(apps, schema_editor):
    # Reverse: remove only the core fields we seeded (non-destructive on custom ones)
    CurriculumFieldSchema = apps.get_model('curriculum', 'CurriculumFieldSchema')
    keys = [row[0] for row in CORE_FIELDS]
    CurriculumFieldSchema.objects.filter(key__in=keys, is_core=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('curriculum', '0048_curriculumfieldschema'),
    ]

    operations = [
        migrations.RunPython(seed_field_schemas, reverse_seed),
    ]
