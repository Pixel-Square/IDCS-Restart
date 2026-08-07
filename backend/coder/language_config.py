"""
IDCS Coder — Language Execution Configuration

Centralised, extensible mapping of programming language →
Docker image, file extension, compile command, run command.

All {placeholders} are substituted at execution time:
  {file}   — the full filename, e.g. HelloWorld.java
  {class}  — the class/module name (no extension), e.g. HelloWorld
  {binary} — the compiled binary name, e.g. HelloWorld
"""

# ---------------------------------------------------------------------------
# Language registry
# ---------------------------------------------------------------------------

LANGUAGE_CONFIG = {
    'python': {
        'label': 'Python 3',
        'extension': '.py',
        'docker_image': 'python:3.11-slim',
        'compile_command': None,          # interpreted — no compile step
        'run_command': 'python3 {file}',
    },
    'java': {
        'label': 'Java 21',
        'extension': '.java',
        'docker_image': 'openjdk:21-slim',
        'compile_command': 'javac {file}',
        'run_command': 'java {class}',
    },
    'c': {
        'label': 'C (GCC)',
        'extension': '.c',
        'docker_image': 'gcc:12',
        'compile_command': 'gcc {file} -o {binary} -lm',
        'run_command': './{binary}',
    },
    'cpp': {
        'label': 'C++ (G++)',
        'extension': '.cpp',
        'docker_image': 'gcc:12',
        'compile_command': 'g++ {file} -o {binary} -lm',
        'run_command': './{binary}',
    },
}

# Supported languages list (for frontend dropdowns)
SUPPORTED_LANGUAGES = [
    {'value': 'python', 'label': 'Python'},
    {'value': 'java',   'label': 'Java'},
    {'value': 'c',      'label': 'C'},
    {'value': 'cpp',    'label': 'C++'},
]


def get_extension(language: str) -> str:
    """Return the file extension for a given language key."""
    cfg = LANGUAGE_CONFIG.get(language.lower(), {})
    return cfg.get('extension', '.txt')


def get_docker_image(language: str) -> str:
    """Return the Docker image for a given language key."""
    cfg = LANGUAGE_CONFIG.get(language.lower(), {})
    return cfg.get('docker_image', 'python:3.11-slim')


def normalise_filename(name: str, language: str) -> str:
    """
    Given a raw name (possibly already with extension) and a language,
    return a properly normalised filename.

    Examples:
      ('HelloWorld', 'java')   → 'HelloWorld.java'
      ('HelloWorld.py', 'java')→ 'HelloWorld.java'   # wrong ext → replace
      ('HelloWorld.py', 'python') → 'HelloWorld.py'  # correct ext → keep
      ('HelloWorld.java.java', 'java') → 'HelloWorld.java'  # dedup
    """
    ext = get_extension(language)
    # Strip any existing extension that matches our target or any known ext
    known_exts = {cfg['extension'] for cfg in LANGUAGE_CONFIG.values()}
    base = name
    for known in known_exts:
        if base.lower().endswith(known):
            base = base[: -len(known)]
            break
    return base + ext


def get_execution_commands(language: str, filename: str) -> dict:
    """
    Return resolved build + run commands for a single-file execution.

    filename: the actual file name with extension, e.g. 'HelloWorld.java'

    Returns:
        {
            'build_command': str or '',
            'run_command': str,
            'docker_image': str,
        }
    """
    cfg = LANGUAGE_CONFIG.get(language.lower())
    if not cfg:
        # Fallback to Python
        cfg = LANGUAGE_CONFIG['python']
        filename = filename  # unchanged

    ext = cfg['extension']
    # class name = filename without extension
    class_name = filename
    if class_name.lower().endswith(ext):
        class_name = class_name[: -len(ext)]

    binary_name = class_name  # same for C/C++

    compile_cmd = cfg.get('compile_command') or ''
    run_cmd = cfg.get('run_command', '')

    # Substitute placeholders
    if compile_cmd:
        compile_cmd = (
            compile_cmd
            .replace('{file}', filename)
            .replace('{class}', class_name)
            .replace('{binary}', binary_name)
        )
    run_cmd = (
        run_cmd
        .replace('{file}', filename)
        .replace('{class}', class_name)
        .replace('{binary}', binary_name)
    )

    return {
        'build_command': compile_cmd,
        'run_command': run_cmd,
        'docker_image': cfg['docker_image'],
    }
