"""
IDCS Coder - Execution Manager

Orchestrates the full lifecycle of a web application execution session:
  1. Save files to workspace
  2. Build (Maven / npm / etc.)
  3. Start application container
  4. Poll for readiness
  5. Update session status
  6. Handle stop / cleanup
"""
import logging
import time

import requests as http_requests
from django.utils import timezone

logger = logging.getLogger(__name__)

# Session lifetime constants
SESSION_MAX_LIFETIME_MINUTES = 30
BUILD_TIMEOUT_SECONDS = 300       # 5 min max build
READINESS_TIMEOUT_SECONDS = 90    # 90s to start


# ---------------------------------------------------------------------------
# Main entry point: start_execution_session
# ---------------------------------------------------------------------------

def start_execution_session(session_id: int) -> None:
    """
    Called in a background thread by the API view.
    Handles the full build -> start -> readiness flow.
    """
    from coder.models import CodeExecutionSession
    from coder.execution.docker_runner import (
        docker_available, _get_image, create_workspace, cleanup_workspace,
        run_build, start_app_container, find_free_port, get_container_logs,
    )

    try:
        session = CodeExecutionSession.objects.select_related(
            'student', 'assessment__coding_project',
        ).get(pk=session_id)
    except CodeExecutionSession.DoesNotExist:
        logger.error(f"ExecutionSession {session_id} not found")
        return

    if not docker_available():
        _fail_session(session, build_log='[ERROR] Docker execution service is unavailable. Contact administrator.')
        return

    project = getattr(session.assessment, 'coding_project', None)
    if not project:
        _fail_session(session, build_log='[ERROR] No project configuration found for this assessment.')
        return

    files = _get_student_files(session)
    if not files:
        _fail_session(session, build_log='[ERROR] No project files found.')
        return

    image = _get_image(project.runtime, project.build_tool, project.project_type)

    # Auto-detect project type and determine build/start commands
    try:
        build_cmd, start_cmd, app_port = _resolve_commands(project, files)
    except ValueError as ve:
        _fail_session(session, build_log=f"[ERROR] Configuration Error\n{ve}")
        return

    work_dir = create_workspace(files)

    try:
        # -- BUILDING -------------------------------------------------------
        _set_status(session, 'BUILDING')
        _append_build_log(session, f'[INFO] Workspace created. Image: {image}')
        logger.info(f"Session {session_id}: building with image={image}, cmd={build_cmd or '(none)'}")

        if build_cmd:
            _append_build_log(session, f'[INFO] Running build: {build_cmd}')
            build_result = run_build(
                work_dir=work_dir,
                image=image,
                build_command=build_cmd,
                memory_limit_mb=min(project.memory_limit_mb * 2, 2048),
                cpu_limit=project.cpu_limit,
                timeout_seconds=BUILD_TIMEOUT_SECONDS,
                env_vars=project.env_vars or {},
                working_directory=project.working_directory or '',
            )

            build_log = (build_result.get('stdout') or '') + (build_result.get('stderr') or '')
            session.build_log = (session.build_log + '\n' + build_log)[-50000:]
            session.save(update_fields=['build_log'])

            if not build_result['success']:
                _fail_session(session, build_log=session.build_log)
                cleanup_workspace(work_dir)
                return
        else:
            _append_build_log(session, '[INFO] No build step required (static/interpreted project).')

        # -- STARTING -------------------------------------------------------
        _set_status(session, 'STARTING')
        logger.info(f"Session {session_id}: starting application, cmd={start_cmd}")
        _append_build_log(session, f'[INFO] Starting application: {start_cmd}')

        host_port = find_free_port()
        app_result = start_app_container(
            work_dir=work_dir,
            image=image,
            start_command=start_cmd,
            app_port=app_port,
            host_port=host_port,
            memory_limit_mb=project.memory_limit_mb,
            cpu_limit=project.cpu_limit,
            env_vars=project.env_vars or {},
            working_directory=project.working_directory or '',
        )

        if not app_result['container_id']:
            _fail_session(session, build_log=session.build_log, run_log=f"[ERROR] {app_result['error']}")
            cleanup_workspace(work_dir)
            return

        session.container_id = app_result['container_id']
        session.internal_port = host_port
        session.save(update_fields=['container_id', 'internal_port'])

        # -- READINESS POLLING ----------------------------------------------
        ready = _wait_for_readiness(host_port=host_port, timeout=READINESS_TIMEOUT_SECONDS)

        # Collect run log from container
        run_log = get_container_logs(app_result['container_id'])
        session.run_log = run_log[-50000:]
        session.save(update_fields=['run_log'])

        if ready:
            session.status = 'RUNNING'
            session.ready_at = timezone.now()
            session.save(update_fields=['status', 'ready_at', 'run_log'])
            logger.info(f"Session {session_id}: RUNNING on host port {host_port}")
        else:
            _fail_session(session, run_log=run_log + '\n[ERROR] Application did not become ready in time.')
            _stop_container_by_id(app_result['container_id'])
            cleanup_workspace(work_dir)

    except Exception as e:
        logger.exception(f"Session {session_id} unhandled error: {e}")
        _fail_session(session, run_log=str(e))
        cleanup_workspace(work_dir)


# ---------------------------------------------------------------------------
# Smart command resolution with project-type auto-detection
# ---------------------------------------------------------------------------

def _resolve_commands(project, files: dict) -> tuple:
    """
    Determine the build command, start command, and app_port based on:
    1. Project-level explicit config (from incharge)
    2. Auto-detection from files if nothing explicit is set

    Returns: (build_cmd, start_cmd, app_port)
    """
    build_cmd = (project.build_command or '').strip()
    start_cmd = (project.start_command or '').strip()
    app_port = project.app_port or 8080

    file_paths = set(files.keys())

    # File presence heuristics
    has_pom = any('pom.xml' in p for p in file_paths)
    has_gradle = any('build.gradle' in p for p in file_paths)
    has_package_json = any(
        p.strip('/') == 'package.json' or p.endswith('/package.json')
        for p in file_paths
    )
    has_vite_config = any('vite.config' in p for p in file_paths)
    has_index_html = any(
        p.strip('/') == 'index.html' or p.endswith('/index.html')
        for p in file_paths
    )

    pt = project.project_type  # SPRING_BOOT, FRONTEND, WEB, CONSOLE, FULL_STACK

    if pt == 'SPRING_BOOT' or (pt in ('WEB', 'FULL_STACK') and has_pom):
        # Check for multiple main classes
        main_classes = []
        import re
        for path, content in files.items():
            if path.endswith('.java') and content and '@SpringBootApplication' in content:
                pkg_match = re.search(r'^\s*package\s+([a-zA-Z0-9_.]+)\s*;', content, re.MULTILINE)
                class_match = re.search(r'class\s+([a-zA-Z0-9_]+)', content)
                if class_match:
                    pkg = pkg_match.group(1) + '.' if pkg_match else ''
                    main_classes.append(f"{pkg}{class_match.group(1)}")

        entry_point = (project.entry_point or '').strip()
        if entry_point.endswith('.java'):
            entry_point = entry_point.replace('/', '.')
            if 'src.main.java.' in entry_point:
                entry_point = entry_point.split('src.main.java.')[-1]
            entry_point = entry_point.replace('.java', '')

        if len(main_classes) > 1 and not entry_point:
            err_msg = "Multiple Spring Boot main classes detected:\n"
            for i, mc in enumerate(main_classes, 1):
                err_msg += f"{i}. {mc}\n"
            err_msg += "Configure the project's Entry Point."
            raise ValueError(err_msg)

        if not build_cmd:
            build_cmd = (
                'if [ -f mvnw ]; then chmod +x mvnw && ./mvnw clean package -DskipTests 2>&1; '
                'else mvn clean package -DskipTests 2>&1; fi'
            )
        
        if entry_point and ('mvn ' in build_cmd or 'mvnw ' in build_cmd):
            build_cmd = build_cmd.replace('package', f'package -Dspring-boot.main-class={entry_point} -Dstart-class={entry_point}')

        if not start_cmd:
            start_cmd = f'java -jar target/*.jar --server.port={app_port}'

    elif pt == 'FRONTEND' or (has_package_json and has_vite_config):
        if not build_cmd:
            build_cmd = 'npm install --prefer-offline 2>&1'
        if not start_cmd:
            # Vite dev server MUST bind 0.0.0.0 so the proxy can reach it
            start_cmd = f'npm run dev -- --host 0.0.0.0 --port {app_port}'

    elif has_package_json:
        # Generic Node / Express project
        if not build_cmd:
            build_cmd = 'npm install --prefer-offline 2>&1'
        if not start_cmd:
            # Try "npm start" first, fallback "node index.js"
            start_cmd = 'npm start 2>&1 || node index.js 2>&1'
        if not app_port:
            app_port = 3000

    elif has_index_html and pt == 'WEB':
        # Plain static HTML — serve with Python
        build_cmd = ''
        if not start_cmd:
            start_cmd = f'python3 -m http.server {app_port} --bind 0.0.0.0'

    elif has_gradle:
        if not build_cmd:
            build_cmd = 'chmod +x gradlew && ./gradlew build -x test 2>&1'
        if not start_cmd:
            start_cmd = f'java -jar build/libs/*.jar --server.port={app_port}'

    # Final fallback defaults
    if not start_cmd:
        if project.runtime == 'PYTHON':
            start_cmd = 'python3 app.py'
        elif project.runtime == 'NODE':
            start_cmd = 'node index.js'
        else:
            start_cmd = f'java -jar target/*.jar --server.port={app_port}'

    # Fallback ./mvnw to mvn if mvnw wrapper is missing from the workspace files
    has_mvnw = any(p.strip('/') == 'mvnw' or p.endswith('/mvnw') for p in file_paths)
    if not has_mvnw:
        if './mvnw' in build_cmd:
            build_cmd = build_cmd.replace('./mvnw', 'mvn')
        if './mvnw' in start_cmd:
            start_cmd = start_cmd.replace('./mvnw', 'mvn')

    return build_cmd, start_cmd, app_port


# ---------------------------------------------------------------------------
# Stop a session
# ---------------------------------------------------------------------------

def stop_execution_session(session_id: int) -> bool:
    """Stop the container and mark session as STOPPED."""
    from coder.models import CodeExecutionSession
    from coder.execution.docker_runner import stop_container

    try:
        session = CodeExecutionSession.objects.get(pk=session_id)
    except CodeExecutionSession.DoesNotExist:
        return False

    if session.container_id:
        stop_container(session.container_id)

    session.status = 'STOPPED'
    session.stopped_at = timezone.now()
    session.save(update_fields=['status', 'stopped_at'])
    logger.info(f"Session {session_id} stopped")
    return True


# ---------------------------------------------------------------------------
# Readiness check
# ---------------------------------------------------------------------------

def _wait_for_readiness(host_port: int, timeout: int = 90) -> bool:
    url = f'http://127.0.0.1:{host_port}/'
    deadline = time.time() + timeout
    logger.info(f"Polling readiness at {url} for up to {timeout}s")
    while time.time() < deadline:
        try:
            resp = http_requests.get(url, timeout=3, allow_redirects=True)
            if resp.status_code < 500:
                logger.info(f"Application ready! HTTP {resp.status_code}")
                return True
        except Exception:
            pass
        time.sleep(2)
    logger.warning(f"Readiness timeout on port {host_port}")
    return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_status(session, status: str) -> None:
    session.status = status
    session.save(update_fields=['status'])


def _append_build_log(session, line: str) -> None:
    """Append a single info line to build_log and flush to DB."""
    session.build_log = (session.build_log + '\n' + line).lstrip('\n')
    session.save(update_fields=['build_log'])


def _fail_session(session, build_log: str = '', run_log: str = '') -> None:
    if build_log:
        session.build_log = build_log[-50000:]
    if run_log:
        session.run_log = run_log[-50000:]
    session.status = 'FAILED'
    session.stopped_at = timezone.now()
    session.save(update_fields=['status', 'stopped_at', 'build_log', 'run_log'])


def _stop_container_by_id(container_id: str) -> None:
    from coder.execution.docker_runner import stop_container
    if container_id:
        stop_container(container_id)


def _get_student_files(session) -> dict:
    """Get student's current project files as {filepath: content}."""
    if session.source_snapshot:
        return session.source_snapshot
    from coder.models import ProjectFile
    try:
        project = session.assessment.coding_project
        files = {}
        for f in ProjectFile.objects.filter(project=project):
            files[f.get_path()] = f.content
        return files
    except Exception as e:
        logger.error(f"Failed to get student files: {e}")
        return {}


# ---------------------------------------------------------------------------
# Cleanup: stop expired sessions
# ---------------------------------------------------------------------------

def cleanup_expired_sessions() -> int:
    """
    Stop and clean up all expired/idle sessions.
    Called periodically (e.g. management command or cron).
    Returns count of sessions cleaned.
    """
    from coder.models import CodeExecutionSession
    from coder.execution.docker_runner import stop_container

    now = timezone.now()
    expired = CodeExecutionSession.objects.filter(
        status='RUNNING',
        expires_at__lt=now,
    )
    count = 0
    for session in expired:
        if session.container_id:
            stop_container(session.container_id)
        session.status = 'EXPIRED'
        session.stopped_at = now
        session.save(update_fields=['status', 'stopped_at'])
        count += 1

    if count:
        logger.info(f"Cleaned up {count} expired execution sessions")
    return count



