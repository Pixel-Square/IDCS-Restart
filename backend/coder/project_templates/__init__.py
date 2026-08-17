"""
IDCS Coder — Project Template Registry

Templates define the initial folder + file structure for common project types.
Each template is a Python dict with a 'tree' key describing the project tree.

Tree format:
  {
    'folders': [
      {
        'path': 'src/main/java/com/example',  # auto-creates all intermediate folders
        'is_locked': False,
      },
    ],
    'files': [
      {
        'path': 'src/main/java/com/example/Application.java',
        'content': '...',
        'is_locked': False,
      },
    ],
    'project_defaults': {
      'project_type': 'SPRING_BOOT',
      'runtime': 'JAVA',
      'build_command': 'mvn clean package -DskipTests',
      'run_command': 'java -jar target/*.jar',
      'start_command': 'java -jar target/*.jar',
      'app_port': 8080,
      'preview_enabled': True,
    }
  }
"""
from .spring_boot import SPRING_BOOT_TEMPLATES
from .fullstack import FULLSTACK_TEMPLATES
from .frontend import FRONTEND_TEMPLATES
from .console import CONSOLE_TEMPLATES

# Master registry — list of {id, label, description, project_type, framework, template}
TEMPLATE_REGISTRY = [
    *SPRING_BOOT_TEMPLATES,
    *FULLSTACK_TEMPLATES,
    *FRONTEND_TEMPLATES,
    *CONSOLE_TEMPLATES,
]


def get_template(template_id: str) -> dict | None:
    for t in TEMPLATE_REGISTRY:
        if t['id'] == template_id:
            return t
    return None


def get_templates_grouped() -> dict:
    """Return templates grouped by project_type -> framework -> list."""
    grouped = {}
    for t in TEMPLATE_REGISTRY:
        pt = t['project_type']
        fw = t.get('framework', 'General')
        if pt not in grouped:
            grouped[pt] = {}
        if fw not in grouped[pt]:
            grouped[pt][fw] = []
        grouped[pt][fw].append({
            'id': t['id'],
            'label': t['label'],
            'description': t.get('description', ''),
        })
    return grouped


def apply_template(project, template_id: str) -> dict:
    """
    Apply a template to a CodingProject instance.
    Creates all folders and files defined in the template.
    Returns {'folders_created': N, 'files_created': N, 'warnings': [...]}
    """
    # Late import to avoid circular import at module load time
    from coder.models import ProjectFolder, ProjectFile

    tpl = get_template(template_id)
    if not tpl:
        raise ValueError(f'Template {template_id!r} not found')

    tree = tpl['tree']

    # Delete existing files/folders for a clean start
    ProjectFile.objects.filter(project=project).delete()
    ProjectFolder.objects.filter(project=project).delete()

    # ── Create folders ───────────────────────────────────────────────────────
    path_to_folder: dict[str, ProjectFolder] = {}

    def _ensure_folder(path_str: str, is_locked: bool = False) -> ProjectFolder:
        if path_str in path_to_folder:
            return path_to_folder[path_str]
        parts = path_str.strip('/').split('/')
        parent = None
        for i, part in enumerate(parts):
            partial_path = '/'.join(parts[:i + 1])
            if partial_path not in path_to_folder:
                folder, _ = ProjectFolder.objects.get_or_create(
                    project=project,
                    parent=parent,
                    name=part,
                    defaults={'is_locked': is_locked if i == len(parts) - 1 else False},
                )
                path_to_folder[partial_path] = folder
            parent = path_to_folder[partial_path]
        return path_to_folder[path_str]

    folders_created = 0
    for folder_spec in tree.get('folders', []):
        _ensure_folder(folder_spec['path'], folder_spec.get('is_locked', False))
        folders_created += 1

    # ── Create files ─────────────────────────────────────────────────────────
    files_created = 0
    warnings = []
    for file_spec in tree.get('files', []):
        file_path = file_spec['path'].strip('/')
        parts = file_path.rsplit('/', 1)
        if len(parts) == 2:
            folder_path, filename = parts
            parent_folder = _ensure_folder(folder_path)
        else:
            parent_folder = None
            filename = parts[0]

        try:
            ProjectFile.objects.create(
                project=project,
                folder=parent_folder,
                name=filename,
                content=file_spec.get('content', ''),
                is_locked=file_spec.get('is_locked', False),
            )
            files_created += 1
        except Exception as e:
            warnings.append(f'Could not create {file_path}: {e}')

    # ── Apply project defaults ────────────────────────────────────────────────
    defaults = tpl.get('project_defaults', {})
    if defaults:
        for field, value in defaults.items():
            if hasattr(project, field):
                setattr(project, field, value)
        project.save()

    return {
        'folders_created': folders_created,
        'files_created': files_created,
        'warnings': warnings,
    }
