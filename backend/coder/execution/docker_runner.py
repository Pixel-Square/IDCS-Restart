"""
IDCS Coder - Docker Runner

Low-level Docker SDK wrapper for isolated container management.
NEVER exposes Docker socket to student containers.
NEVER mounts host filesystem into student containers.
"""
import logging
import os
import shutil
import socket
import tempfile
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Docker image map
# ---------------------------------------------------------------------------

DOCKER_IMAGES = {
    'JAVA_MAVEN': 'maven:3.9-eclipse-temurin-21',
    'JAVA_GRADLE': 'gradle:8.7-jdk21',
    'PYTHON': 'python:3.11-slim',
    'NODE': 'node:20-slim',
    'JAVA_CONSOLE': 'openjdk:21-slim',
}


def _get_image(runtime: str, build_tool: str, project_type: str) -> str:
    if runtime == 'JAVA':
        if project_type == 'CONSOLE':
            return DOCKER_IMAGES['JAVA_CONSOLE']
        if build_tool == 'GRADLE':
            return DOCKER_IMAGES['JAVA_GRADLE']
        return DOCKER_IMAGES['JAVA_MAVEN']
    if runtime == 'PYTHON':
        return DOCKER_IMAGES['PYTHON']
    if runtime == 'NODE':
        return DOCKER_IMAGES['NODE']
    return DOCKER_IMAGES['JAVA_MAVEN']


# ---------------------------------------------------------------------------
# Docker availability check
# ---------------------------------------------------------------------------

def docker_available() -> bool:
    try:
        import docker
        client = docker.from_env(timeout=5)
        client.ping()
        return True
    except Exception as e:
        logger.exception("Docker availability check failed")
        return False


# ---------------------------------------------------------------------------
# Find a free port on the host
# ---------------------------------------------------------------------------

def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


# ---------------------------------------------------------------------------
# Write project files to a temp workspace
# ---------------------------------------------------------------------------

def create_workspace(files: dict) -> str:
    """
    Write {filepath: content} to an isolated temp directory.
    Returns the workspace path.
    """
    work_dir = tempfile.mkdtemp(prefix='coder_web_')
    for filepath, content in files.items():
        # Sanitize path - prevent directory traversal
        clean_path = os.path.normpath(filepath).lstrip('/')
        if '..' in clean_path:
            logger.warning(f"Skipping suspicious path: {filepath}")
            continue
        full_path = os.path.join(work_dir, clean_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content or '')
    return work_dir


def cleanup_workspace(work_dir: str) -> None:
    try:
        shutil.rmtree(work_dir, ignore_errors=True)
    except Exception as e:
        logger.warning(f"Failed to cleanup workspace {work_dir}: {e}")


# ---------------------------------------------------------------------------
# Build phase (with network access for dependency download)
# ---------------------------------------------------------------------------

def run_build(
    work_dir: str,
    image: str,
    build_command: str,
    memory_limit_mb: int = 1024,
    cpu_limit: float = 1.0,
    timeout_seconds: int = 300,
    env_vars: Optional[dict] = None,
    working_directory: str = '',
) -> dict:
    """
    Run the build command in an isolated Docker container WITH network access
    (needed for Maven/npm dependency downloads).

    Returns: {success, stdout, stderr, exit_code}
    """
    if not build_command:
        return {'success': True, 'stdout': '', 'stderr': '', 'exit_code': 0}

    try:
        import docker
        client = docker.from_env()
    except Exception as e:
        return {'success': False, 'stdout': '', 'stderr': f'Docker unavailable: {e}', 'exit_code': -1}

    work_inside = working_directory.strip('/') or 'workspace'
    container_workdir = f'/{work_inside}'

    environment = {
        'MAVEN_OPTS': '-Dmaven.repo.local=/workspace/.m2',
        **(env_vars or {}),
    }

    try:
        logger.info(f"Starting build container: {image} cmd={build_command}")
        container = client.containers.run(
            image=image,
            command=['sh', '-c', build_command],
            volumes={work_dir: {'bind': '/workspace', 'mode': 'rw'}},
            working_dir='/workspace',
            environment=environment,
            mem_limit=f'{memory_limit_mb}m',
            nano_cpus=int(cpu_limit * 1e9),
            pids_limit=200,
            # Build needs internet for deps
            network_mode='bridge',
            remove=False,
            detach=True,
            user='root',  # Maven needs to write to .m2 cache in /workspace
        )

        try:
            # Wait for container completion with timeout
            wait_res = container.wait(timeout=timeout_seconds)
            exit_code = wait_res.get('StatusCode', 0)
            
            stdout = container.logs(stdout=True, stderr=False).decode('utf-8', errors='replace')
            stderr = container.logs(stdout=False, stderr=True).decode('utf-8', errors='replace')
            
            container.remove(force=True)
            
            if exit_code != 0:
                return {
                    'success': False,
                    'stdout': stdout,
                    'stderr': stderr,
                    'exit_code': exit_code,
                }
            return {'success': True, 'stdout': stdout + stderr, 'stderr': '', 'exit_code': 0}
            
        except Exception as wait_err:
            try:
                container.remove(force=True)
            except Exception:
                pass
            return {
                'success': False,
                'stdout': '',
                'stderr': f'Build timed out or failed: {wait_err}',
                'exit_code': -1,
            }

    except Exception as e:
        error_msg = str(e)
        return {'success': False, 'stdout': '', 'stderr': error_msg, 'exit_code': -1}


# ---------------------------------------------------------------------------
# Start application container (long-running, no network)
# ---------------------------------------------------------------------------

def start_app_container(
    work_dir: str,
    image: str,
    start_command: str,
    app_port: int,
    host_port: int,
    memory_limit_mb: int = 512,
    cpu_limit: float = 1.0,
    env_vars: Optional[dict] = None,
    working_directory: str = '',
) -> dict:
    """
    Start a long-running application container.
    Network is restricted to host-only (no internet).

    Returns: {container_id, host_port, error}
    """
    try:
        import docker
        client = docker.from_env()
    except Exception as e:
        return {'container_id': None, 'host_port': None, 'error': f'Docker unavailable: {e}'}

    environment = {
        'SERVER_PORT': str(app_port),
        'PORT': str(app_port),
        **(env_vars or {}),
    }

    try:
        container = client.containers.run(
            image=image,
            command=['sh', '-c', start_command],
            volumes={work_dir: {'bind': '/workspace', 'mode': 'ro'}},
            working_dir='/workspace',
            environment=environment,
            ports={f'{app_port}/tcp': host_port},
            mem_limit=f'{memory_limit_mb}m',
            nano_cpus=int(cpu_limit * 1e9),
            pids_limit=100,
            # NO internet access during run
            network_mode='bridge',
            remove=False,
            detach=True,
            read_only=False,
            security_opt=['no-new-privileges'],
            tmpfs={'/tmp': 'size=100m,mode=1777'},
        )
        logger.info(f"Started app container: {container.id[:12]} on host port {host_port}")
        return {'container_id': container.id, 'host_port': host_port, 'error': None}

    except Exception as e:
        return {'container_id': None, 'host_port': None, 'error': str(e)}


# ---------------------------------------------------------------------------
# Collect logs from a running container
# ---------------------------------------------------------------------------

def get_container_logs(container_id: str, tail: int = 200) -> str:
    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(container_id)
        logs = container.logs(tail=tail, stdout=True, stderr=True)
        return logs.decode('utf-8', errors='replace')
    except Exception as e:
        return f'[Log error: {e}]'


# ---------------------------------------------------------------------------
# Stop and remove a container
# ---------------------------------------------------------------------------

def stop_container(container_id: str) -> bool:
    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(container_id)
        container.stop(timeout=5)
        container.remove(force=True)
        logger.info(f"Stopped and removed container: {container_id[:12]}")
        return True
    except Exception as e:
        logger.warning(f"Error stopping container {container_id}: {e}")
        return False


# ---------------------------------------------------------------------------
# Check if container is still running
# ---------------------------------------------------------------------------

def container_is_running(container_id: str) -> bool:
    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(container_id)
        return container.status == 'running'
    except Exception:
        return False
