"""
Migration: Seed TAMIL + TAM_THEORY QP patterns.

Pattern: 5 × 2-mark + 1 × 15-mark = 25 marks per CO per exam.

CIA1 (CO1 + CO2, total = 50):
  Q1–Q5  (2mk each) → CO1
  Q6–Q10 (2mk each) → CO2
  Q11    (15mk)      → CO1
  Q12    (15mk)      → CO2
  → CO1 = 5×2+15 = 25, CO2 = 5×2+15 = 25

CIA2 (CO2 + CO3, total = 50) — uses QP1FINAL offset (cos 3,4 → offset maps to CO2,CO3):
  Q1–Q5  (2mk each) → CO3  (offset: CO2)
  Q6–Q10 (2mk each) → CO4  (offset: CO3)
  Q11    (15mk)      → CO3  (offset: CO2)
  Q12    (15mk)      → CO4  (offset: CO3)
  → CO2 = 5×2+15 = 25, CO3 = 5×2+15 = 25

MODEL (CO1 + CO2 + CO3, total = 75):
  Q1–Q5   (2mk each) → CO1
  Q6–Q10  (2mk each) → CO2
  Q11–Q15 (2mk each) → CO3
  Q16     (15mk)     → CO1
  Q17     (15mk)     → CO2
  Q18     (15mk)     → CO3
  → CO1 = CO2 = CO3 = 25 marks each

All patterns use update_or_create to avoid overwriting manual IQAC edits.
"""
from django.db import migrations

# ── Pattern definitions ──────────────────────────────────────────────────────

CIA1_PATTERN = {
    'marks': [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 15, 15],
    'cos':   [1, 1, 1, 1, 1, 2, 2, 2, 2, 2,  1,  2],
}

# CIA2 uses standard parseCo34 numbering (3=CO3, 4=CO4).
# The QP1FINAL offset in the frontend (qp1FinalCia2Offset) shifts these
# to CO2 and CO3 when the class type is treated as QP1FINAL-like.
CIA2_PATTERN = {
    'marks': [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 15, 15],
    'cos':   [2, 2, 2, 2, 2, 3, 3, 3, 3, 3,  2,  3],
}

MODEL_PATTERN = {
    'marks': [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 15, 15, 15],
    'cos':   [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3,  1,  2,  3],
}


def seed_patterns(apps, schema_editor):
    ObeQpPatternConfig = apps.get_model('OBE', 'ObeQpPatternConfig')
    for exam, pattern in [
        ('CIA1',  CIA1_PATTERN),
        ('CIA2',  CIA2_PATTERN),
        ('MODEL', MODEL_PATTERN),
    ]:
        ObeQpPatternConfig.objects.update_or_create(
            class_type='TAMIL',
            question_paper_type='TAM_THEORY',
            exam=exam,
            defaults={'pattern': pattern},
        )


def reverse_seed(apps, schema_editor):
    ObeQpPatternConfig = apps.get_model('OBE', 'ObeQpPatternConfig')
    for exam, pattern in [
        ('CIA1',  CIA1_PATTERN),
        ('CIA2',  CIA2_PATTERN),
        ('MODEL', MODEL_PATTERN),
    ]:
        ObeQpPatternConfig.objects.filter(
            class_type='TAMIL',
            question_paper_type='TAM_THEORY',
            exam=exam,
            pattern=pattern,
        ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('OBE', '0069_seed_english_elective1_model_pattern'),
    ]

    operations = [
        migrations.RunPython(seed_patterns, reverse_code=reverse_seed),
    ]
