"""
IDCS Coder - Services

Service layer for complex business logic:
- MCQ Excel import
- Locked code validation
- Code execution management
- Submission grading
"""
import io
import json
import random
import subprocess
import tempfile
import os
import shutil
import time
import logging
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# MCQ Import
# ---------------------------------------------------------------------------

def import_mcq_from_excel(assessment, file_obj) -> dict:
    """
    Parse an Excel file and create MCQQuestion records.

    Expected columns:
    - target         → question_text
    - correct_answer → correct_answer
    - wrong_ans1     → wrong_ans1
    - wrong_ans2     → wrong_ans2
    - wrong_ans3     → wrong_ans3

    Returns dict with {created, skipped, errors}
    """
    try:
        import openpyxl
    except ImportError:
        raise ImportError('openpyxl is required for Excel import.')

    from .models import MCQQuestion

    wb = openpyxl.load_workbook(file_obj, read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {'created': 0, 'skipped': 0, 'errors': ['Empty file']}

    header = [str(h).strip().lower() if h else '' for h in rows[0]]
    REQUIRED = {'target', 'correct_answer', 'wrong_ans1', 'wrong_ans2', 'wrong_ans3'}
    missing = REQUIRED - set(header)
    if missing:
        return {
            'created': 0,
            'skipped': 0,
            'errors': [f'Missing columns: {", ".join(sorted(missing))}'],
        }

    col = {name: idx for idx, name in enumerate(header)}
    created = 0
    skipped = 0
    errors = []

    # Start order from current max + 1
    existing_max = MCQQuestion.objects.filter(assessment=assessment).count()
    order = existing_max + 1

    for row_idx, row in enumerate(rows[1:], start=2):
        try:
            target = str(row[col['target']] or '').strip()
            correct = str(row[col['correct_answer']] or '').strip()
            w1 = str(row[col['wrong_ans1']] or '').strip()
            w2 = str(row[col['wrong_ans2']] or '').strip()
            w3 = str(row[col['wrong_ans3']] or '').strip()

            if not target or not correct:
                skipped += 1
                continue

            MCQQuestion.objects.create(
                assessment=assessment,
                question_text=target,
                correct_answer=correct,
                wrong_ans1=w1,
                wrong_ans2=w2,
                wrong_ans3=w3,
                order=order,
            )
            order += 1
            created += 1
        except Exception as e:
            errors.append(f'Row {row_idx}: {e}')
            skipped += 1

    return {'created': created, 'skipped': skipped, 'errors': errors}


# ---------------------------------------------------------------------------
# MCQ Evaluation
# ---------------------------------------------------------------------------

def evaluate_mcq_submission(assessment, answers: dict) -> dict:
    """
    Evaluate MCQ answers without exposing correct answers to caller.

    answers: {question_id (str): submitted_answer_text}
    Returns: {score, total_score, result_details (per question — no correct answer)}
    """
    from .models import MCQQuestion
    questions = MCQQuestion.objects.filter(assessment=assessment)

    score = 0.0
    total_score = 0.0
    result_details = []

    for q in questions:
        total_score += q.marks
        submitted = str(answers.get(str(q.id), '')).strip()
        is_correct = submitted == q.correct_answer.strip()
        if is_correct:
            score += q.marks

        result_details.append({
            'question_id': q.id,
            'is_correct': is_correct,
            'marks_awarded': q.marks if is_correct else 0,
            # IMPORTANT: Never expose correct_answer here
        })

    return {
        'score': score,
        'total_score': total_score,
        'result_details': result_details,
    }


# ---------------------------------------------------------------------------
# Locked Code Validation
# ---------------------------------------------------------------------------

def validate_locked_regions(assessment_id: int, submitted_files: dict) -> tuple[bool, str]:
    """
    Validate that student hasn't tampered with locked code regions.
    Uses SequenceMatcher to ensure character ranges are identical regardless of shifting.

    submitted_files: {filepath: content}
    Returns: (is_valid, error_message)
    """
    from .models import CodeAssessment, CodingProject, ProjectFile
    import difflib

    try:
        assessment = CodeAssessment.objects.get(pk=assessment_id)
        project = assessment.coding_project
    except (CodeAssessment.DoesNotExist, CodingProject.DoesNotExist):
        return True, ''

    locked_files = ProjectFile.objects.filter(
        project=project,
    ).prefetch_related('locked_regions')

    for orig_file in locked_files:
        path = orig_file.get_path()
        
        # Standardise lookup by stripping leading/trailing slashes
        student_content = None
        for key, val in submitted_files.items():
            if key.strip('/') == path.strip('/'):
                student_content = val
                break

        if student_content is None:
            if orig_file.is_locked:
                return False, f'Locked file "{path}" is missing from submission.'
            continue

        locked_regions = list(orig_file.locked_regions.all())
        if not locked_regions:
            continue

        orig_content = orig_file.content or ""
        stud_content = student_content or ""

        orig_lines = orig_content.splitlines(keepends=True)

        def get_offset(line, col):
            offset = 0
            for i in range(min(line - 1, len(orig_lines))):
                offset += len(orig_lines[i])
            offset += col - 1
            return min(offset, len(orig_content))

        # Check all locked regions
        matcher = difflib.SequenceMatcher(None, orig_content, stud_content)

        for region in locked_regions:
            start_offset = get_offset(region.start_line, region.start_column)
            end_offset = get_offset(region.end_line, region.end_column)

            if start_offset == end_offset:
                continue

            covered = False
            for a, b, size in matcher.get_matching_blocks():
                if a <= start_offset and end_offset <= a + size:
                    covered = True
                    break

            if not covered:
                col_info = f" (line {region.start_line} col {region.start_column} to line {region.end_line} col {region.end_column})"
                return False, (
                    f'Locked region in "{path}"{col_info} has been modified. '
                    f'Submission rejected.'
                )

    return True, ''


# ---------------------------------------------------------------------------
# Code Execution (Docker Sandbox)
# ---------------------------------------------------------------------------

def execute_code_in_sandbox(
    files: dict,
    language: str,
    build_command: str,
    run_command: str,
    input_data: str = '',
    time_limit: int = 10,
    memory_limit_mb: int = 256,
) -> dict:
    """
    Execute student code in an isolated Docker sandbox.

    files: {filepath: content}
    Returns: {stdout, stderr, exit_code, execution_time_ms, error}
    """
    import platform

    # Check if Docker is available
    docker_available = _check_docker_available()

    if not docker_available:
        return _fallback_execution(files, language, build_command, run_command, input_data, time_limit)

    return _docker_execution(
        files=files,
        language=language,
        build_command=build_command,
        run_command=run_command,
        input_data=input_data,
        time_limit=time_limit,
        memory_limit_mb=memory_limit_mb,
    )


def _check_docker_available() -> bool:
    try:
        result = subprocess.run(
            ['docker', 'info'],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except Exception:
        return False


def _get_docker_image(language: str) -> str:
    """Map language/extension to Docker image using centralised language_config."""
    from .language_config import get_docker_image
    return get_docker_image(language)


def _docker_execution(
    files: dict,
    language: str,
    build_command: str,
    run_command: str,
    input_data: str,
    time_limit: int,
    memory_limit_mb: int,
) -> dict:
    work_dir = tempfile.mkdtemp(prefix='coder_exec_')
    try:
        # Write files to temp directory
        for filepath, content in files.items():
            full_path = os.path.join(work_dir, filepath)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)

        image = _get_docker_image(language)
        start = time.time()

        # Build phase (if applicable)
        if build_command:
            build_cmd = [
                'docker', 'run', '--rm',
                '--network', 'none',
                '--memory', f'{memory_limit_mb}m',
                '--cpus', '0.5',
                '--pids-limit', '50',
                '-v', f'{work_dir}:/workspace',
                '-w', '/workspace',
                image,
                'sh', '-c', build_command,
            ]
            try:
                build_result = subprocess.run(
                    build_cmd,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if build_result.returncode != 0:
                    elapsed = int((time.time() - start) * 1000)
                    return {
                        'stdout': '',
                        'stderr': build_result.stderr,
                        'exit_code': build_result.returncode,
                        'execution_time_ms': elapsed,
                        'error': 'Compilation failed',
                    }
            except subprocess.TimeoutExpired:
                return {
                    'stdout': '', 'stderr': 'Build timed out.',
                    'exit_code': -1, 'execution_time_ms': 30000,
                    'error': 'Build timeout',
                }

        # Run phase
        run_cmd = [
            'docker', 'run', '--rm',
            '--network', 'none',
            '--memory', f'{memory_limit_mb}m',
            '--cpus', '0.5',
            '--pids-limit', '50',
            '-v', f'{work_dir}:/workspace',
            '-w', '/workspace',
            image,
            'sh', '-c', run_command,
        ]
        try:
            run_result = subprocess.run(
                run_cmd,
                input=input_data,
                capture_output=True,
                text=True,
                timeout=time_limit,
            )
            elapsed = int((time.time() - start) * 1000)
            return {
                'stdout': run_result.stdout,
                'stderr': run_result.stderr,
                'exit_code': run_result.returncode,
                'execution_time_ms': elapsed,
                'error': None,
            }
        except subprocess.TimeoutExpired:
            return {
                'stdout': '', 'stderr': f'Execution timed out after {time_limit}s.',
                'exit_code': -1, 'execution_time_ms': time_limit * 1000,
                'error': 'Timeout',
            }
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _fallback_execution(
    files: dict,
    language: str,
    build_command: str,
    run_command: str,
    input_data: str,
    time_limit: int,
) -> dict:
    """
    Fallback: run Python/JS/C code directly when Docker is unavailable.
    WARNING: Only safe for trusted environments. Use Docker in production.
    """
    return {
        'stdout': '',
        'stderr': 'Code execution sandbox is not available. Please contact administrator.',
        'exit_code': -1,
        'execution_time_ms': 0,
        'error': 'Sandbox unavailable',
    }


# ---------------------------------------------------------------------------
# Full Submission Pipeline
# ---------------------------------------------------------------------------

def process_submission(submission_id: int) -> None:
    """
    Full submission pipeline:
    1. Validate locked regions
    2. Compile
    3. Run public tests
    4. Run hidden tests
    5. Calculate score
    6. Update submission record
    7. Update StudentProgress
    """
    from .models import CodeSubmission, CodeAssessment, TestCase, CodeExecution

    try:
        submission = CodeSubmission.objects.select_related(
            'student', 'assessment__coding_project',
        ).get(pk=submission_id)
    except CodeSubmission.DoesNotExist:
        logger.error(f'Submission {submission_id} not found')
        return

    assessment = submission.assessment
    submission.status = 'RUNNING'
    submission.save(update_fields=['status'])

    try:
        # Step 1: Validate locked regions
        is_valid, err_msg = validate_locked_regions(
            assessment.id, submission.source_snapshot,
        )
        if not is_valid:
            submission.status = 'REJECTED'
            submission.error_message = err_msg
            submission.save(update_fields=['status', 'error_message'])
            return

        # Step 2: Get project config
        try:
            project = assessment.coding_project
            time_limit = project.time_limit_seconds
            mem_limit = project.memory_limit_mb
            if project.workspace_type == 'SINGLE_FILE':
                from .language_config import get_execution_commands, normalise_filename
                filename = normalise_filename(project.single_file_name, project.single_file_language)
                cmds = get_execution_commands(project.single_file_language, filename)
                build_cmd = cmds['build_command']
                run_cmd = cmds['run_command']
                # Ensure language tag matches
                if not submission.language:
                    submission.language = project.single_file_language
            else:
                build_cmd = project.build_command
                run_cmd = project.run_command
        except Exception:
            build_cmd = ''
            run_cmd = ''
            time_limit = 10
            mem_limit = 256


        # Step 3 & 4: Run all test cases
        test_cases = TestCase.objects.filter(assessment=assessment).order_by('order')
        passed = 0
        failed = 0
        score = 0.0
        total_score = 0.0
        result_details = []

        for tc in test_cases:
            total_score += tc.marks
            exec_result = execute_code_in_sandbox(
                files=submission.source_snapshot,
                language=submission.language,
                build_command=build_cmd,
                run_command=run_cmd,
                input_data=tc.input_data,
                time_limit=time_limit,
                memory_limit_mb=mem_limit,
            )

            actual_output = exec_result.get('stdout', '').strip()
            expected_output = tc.expected_output.strip()
            test_passed = (actual_output == expected_output and exec_result.get('exit_code', 1) == 0)

            if test_passed:
                passed += 1
                score += tc.marks
            else:
                failed += 1

            # For public tests: include details. For hidden: include only pass/fail
            detail = {
                'test_id': tc.id,
                'is_hidden': tc.is_hidden,
                'passed': test_passed,
                'marks_awarded': tc.marks if test_passed else 0,
            }
            if not tc.is_hidden:
                detail['input'] = tc.input_data
                detail['expected'] = tc.expected_output
                detail['actual'] = actual_output
                detail['error'] = exec_result.get('stderr', '')
            result_details.append(detail)

        submission.status = 'PASSED' if failed == 0 else 'FAILED'
        submission.score = score
        submission.total_score = total_score
        submission.passed_tests = passed
        submission.failed_tests = failed
        submission.result_details = result_details
        submission.save()

        # Step 7: Update StudentProgress
        _update_student_progress(submission)

    except Exception as e:
        logger.exception(f'Error processing submission {submission_id}: {e}')
        submission.status = 'ERROR'
        submission.error_message = str(e)
        submission.save(update_fields=['status', 'error_message'])


def _update_student_progress(submission):
    """Update StudentProgress after a submission."""
    from .models import StudentProgress

    course = submission.assessment.session.course
    student = submission.student

    progress, _ = StudentProgress.objects.get_or_create(
        student=student,
        course=course,
        defaults={
            'completed_sessions': [],
            'in_progress_sessions': [],
            'overall_score': 0,
            'total_possible_score': 0,
        },
    )

    session_id = submission.assessment.session_id
    if session_id not in progress.completed_sessions:
        if session_id in progress.in_progress_sessions:
            progress.in_progress_sessions.remove(session_id)
        progress.completed_sessions.append(session_id)

    # Recalculate overall score (best attempt per assessment)
    from .models import CodeSubmission
    best_submissions = CodeSubmission.objects.filter(
        student=student,
        assessment__session__course=course,
        status__in=['PASSED', 'FAILED'],
    ).order_by('assessment', '-score').distinct('assessment')

    total_score = sum(s.score for s in best_submissions)
    total_possible = sum(s.total_score for s in best_submissions)

    progress.overall_score = total_score
    progress.total_possible_score = total_possible
    progress.save()
