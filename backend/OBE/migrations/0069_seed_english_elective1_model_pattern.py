"""
Migration: Seed the ENGLISH+ELECTIVE1+MODEL QP pattern.

Pattern:  8 × 2-mark + 4 × 16-mark + 1 × 20-mark = 100 marks total
CO mapping (each CO max = 20):
  CO1: Q1(2) + Q2(2) + Q9(16)  = 20
  CO2: Q3(2) + Q4(2) + Q10(16) = 20
  CO3: Q5(2) + Q6(2) + Q11(16) = 20
  CO4: Q7(2) + Q8(2) + Q12(16) = 20
  CO5: Q13(20)                  = 20

Only inserts if no pattern already exists for this key, using update_or_create
so manual IQAC overrides are never clobbered.
"""
from django.db import migrations


ENGLISH_ELECTIVE1_MODEL_PATTERN = {
    "marks": [2, 2, 2, 2, 2, 2, 2, 2, 16, 16, 16, 16, 20],
    "cos":   [1, 1, 2, 2, 3, 3, 4, 4,  1,  2,  3,  4,  5],
}


def seed_pattern(apps, schema_editor):
    ObeQpPatternConfig = apps.get_model("OBE", "ObeQpPatternConfig")
    ObeQpPatternConfig.objects.update_or_create(
        class_type="ENGLISH",
        question_paper_type="ELECTIVE1",
        exam="MODEL",
        defaults={"pattern": ENGLISH_ELECTIVE1_MODEL_PATTERN},
    )


def reverse_seed(apps, schema_editor):
    # Only remove the row if it still has the seeded pattern (don't remove manual edits).
    ObeQpPatternConfig = apps.get_model("OBE", "ObeQpPatternConfig")
    ObeQpPatternConfig.objects.filter(
        class_type="ENGLISH",
        question_paper_type="ELECTIVE1",
        exam="MODEL",
        pattern=ENGLISH_ELECTIVE1_MODEL_PATTERN,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("OBE", "0068_obe_template_preset_and_audit"),
    ]

    operations = [
        migrations.RunPython(seed_pattern, reverse_code=reverse_seed),
    ]
