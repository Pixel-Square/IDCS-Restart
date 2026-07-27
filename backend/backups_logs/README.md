# Backups & Logs Module (`backups_logs`)

This module provides the foundation for a section-based backup, restore, and audit log system. It implements a registry pattern so that other Django apps can expose their data to be backed up without creating tight coupling.

## The Section Registry Pattern

Instead of hardcoding the list of apps and models to backup, the `backups_logs` app provides a registry object (`section_registry`). Any app that has data worth backing up defines a `BackupSection` class and registers it.

### How to Register a Section

1. Create a class that inherits from `BackupSection`.
2. Implement the required attributes and methods.
3. Register the class in your app's `apps.py` inside the `ready()` method.

**Example:**
```python
# my_app/backup_sections.py
from backups_logs.registry import BackupSection
from .models import MyModel, MyConfigModel

class MyAppBackupSection(BackupSection):
    section_id = "my_app_data"
    display_name = "My App Core Data"

    def get_raw_queryset_map(self):
        return {MyModel: MyModel.objects.all()}

    def get_config_queryset_map(self):
        return {MyConfigModel: MyConfigModel.objects.all()}

    def restore_raw(self, data):
        # Implementation for restoring raw data
        pass

    def import_config(self, data):
        # Implementation for importing config data
        pass
```

```python
# my_app/apps.py
from django.apps import AppConfig

class MyAppConfig(AppConfig):
    name = 'my_app'

    def ready(self):
        from backups_logs.registry import section_registry
        from .backup_sections import MyAppBackupSection
        
        section_registry.register(MyAppBackupSection())
```

## Supported Modules (15 Sections)

The enterprise backups module currently tracks 15 applications. They are categorized based on whether they contain a configuration layer (rules, mappings, structures) that can be migrated between environments, or if they are entirely transactional/operational data (raw-only).

### Config-Supported Modules
These modules implement both `get_raw_queryset_map` and `get_config_queryset_map`. They allow for config diffing, preview, and import.
- **Feedback** (`feedback`)
- **Announcements** (`announcements`)
- **Timetable** (`timetable`)
- **Staff Requests** (`staff_requests`)
- **Curriculum** (`curriculum`)
- **Staff Attendance** (`staff_attendance`)
- **Staff Salary** (`staff_salary`)
- **Applications** (`applications`)
- **OBE** (`obe`)

### Raw-Only Modules
These modules only implement `get_raw_queryset_map` because they consist purely of transient operational data or have no meaningful configuration layer.
- **Academic Calendar** (`academic_calendar`): Pure transactional timeline state.
- **Question Bank** (`question_bank`): Raw library of questions and answers.
- **IDCS Scan** (`idcsscan`): Operational gatepass logs.
- **PBAS** (`pbas`): User submission data hierarchy with no systemic configuration.
- **COE** (`coe`): Raw exam dummy numbers, assignments, and key-value state.
- **Template API** (`template_api`): Auth tokens, event logs, and poster references.

> **Note**: The core `academics` module and infrastructure apps (`accounts`) are explicitly excluded to prevent breaking widespread foreign key constraints across the entire platform during restores.

## Restore Semantics

For structural integrity, **all 15 registered sections** follow a strict **wipe-and-replace** strategy for their raw data restores.
During a `restore_raw()` operation, the target models are explicitly wiped in reverse-dependency order before the snapshot is deserialized. This ensures foreign keys are cleanly resolved and stale data is not left orphaned.

Config imports (`import_config()`), by contrast, use an **upsert-and-delete** strategy to carefully sync the database state with the incoming export without unnecessarily triggering cascade deletions across live data.

## Models

- **`BackupSnapshot`**: Represents a raw data snapshot for a specific registered section. Tracks file path, status, and creator.
- **`ConfigExport`**: Represents an export of configuration/settings. Distinguishes between manual exports and automatic semester-end archives.
- **`ActivityLog`**: Audit trail to track who performed a backup/restore/export/import, on what section, and when.
- **`SectionRegistryMeta`**: An optional DB-backed cache of registered sections to help with admin display and historical reference.
