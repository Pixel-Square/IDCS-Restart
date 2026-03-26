from pathlib import Path

from django.db import migrations


def _read_reporting_sql() -> str:
    # Primary expected layout:
    # backend/reporting/migrations/0001_*.py -> backend/scripts/sql/*.sql
    backend_root = Path(__file__).resolve().parents[2]
    sql_path = backend_root / 'scripts' / 'sql' / 'powerbi_step1_reporting_views.sql'

    # Fallback for unusual deployment layouts where scripts may be at repo root.
    if not sql_path.exists():
        repo_root = Path(__file__).resolve().parents[3]
        alt = repo_root / 'scripts' / 'sql' / 'powerbi_step1_reporting_views.sql'
        if alt.exists():
            sql_path = alt

    # In some dev/test workspaces the optional reporting SQL bundle is not checked in.
    # Allow migrations to proceed; the reporting views can be applied later.
    if not sql_path.exists():
        return ''

    sql = sql_path.read_text(encoding='utf-8')
    # Migration already runs in a transaction; avoid nested BEGIN/COMMIT from script.
    sql = sql.replace('BEGIN;\n\n', '').replace('\n\nCOMMIT;\n', '\n')
    return sql


def apply_reporting_sql(apps, schema_editor):
    sql = _read_reporting_sql()
    if not sql.strip():
        print('reporting.0001_powerbi_reporting_views: SQL file missing; skipping view creation.')
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(sql)


def rollback_reporting_sql(apps, schema_editor):
    rollback_sql = """
    DROP VIEW IF EXISTS reporting.vw_marks_project_lab CASCADE;
    DROP VIEW IF EXISTS reporting.vw_marks_tcpr_tcpl CASCADE;
    DROP VIEW IF EXISTS reporting.vw_marks_theory CASCADE;

    DROP VIEW IF EXISTS reporting.vw_pbi_cqi_published_scores CASCADE;
    DROP VIEW IF EXISTS reporting.vw_pbi_lab_assessment_co_scores CASCADE;
    DROP VIEW IF EXISTS reporting.vw_pbi_model_co_scores CASCADE;
    DROP VIEW IF EXISTS reporting.vw_pbi_cia2_co_scores CASCADE;
    DROP VIEW IF EXISTS reporting.vw_pbi_cia1_co_scores CASCADE;
    DROP VIEW IF EXISTS reporting.vw_pbi_mark_totals CASCADE;
    DROP VIEW IF EXISTS reporting.vw_pbi_student_subject_base CASCADE;

    DROP FUNCTION IF EXISTS reporting.co_key_to_int(text);
    DROP FUNCTION IF EXISTS reporting.to_numeric_or_zero(text);
    """
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(rollback_sql)


class Migration(migrations.Migration):
    initial = True
    atomic = False

    dependencies = []

    operations = [
        migrations.RunPython(apply_reporting_sql, rollback_reporting_sql),
    ]
