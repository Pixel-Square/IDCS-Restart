"""
Backup Section Registry
-----------------------

This module provides a pattern for other Django apps in the project to "register"
themselves as a backup-able section without the backups_logs app needing to know
about their internals.

How to use:
1. In your app, create a subclass of `BackupSection`.
2. Implement the required methods.
3. In your app's `apps.py` inside the `ready()` method, call `section_registry.register(MySection())`.
"""

class BackupSection:
    """
    Base class for defining a backup-able section of the system.
    Other apps should subclass this and register it with the section_registry.
    """
    section_id: str = None
    display_name: str = None

    def __init__(self):
        if not self.section_id or not self.display_name:
            raise ValueError("BackupSection must define 'section_id' and 'display_name'")

    def get_raw_queryset_map(self):
        """
        Returns a dict of {model_class: queryset} representing the RAW data 
        to snapshot for this section.
        """
        return {}

    def get_config_queryset_map(self):
        """
        Returns a dict of {model_class: queryset} representing only the 
        SETTINGS/CONFIG portion of this section.
        """
        return {}

    def restore_raw(self, data):
        """
        Logic to restore raw data from a snapshot for this section.
        """
        raise NotImplementedError("Subclasses must implement restore_raw()")

    def import_config(self, data):
        """
        Logic to import configuration data from an export for this section.
        """
        raise NotImplementedError("Subclasses must implement import_config()")


class SectionRegistry:
    """
    Registry for holding all BackupSection implementations.
    """
    def __init__(self):
        self._sections = {}

    def register(self, section: BackupSection):
        if section.section_id in self._sections:
            raise ValueError(f"Section with id '{section.section_id}' is already registered.")
        self._sections[section.section_id] = section

    def get_section(self, section_id: str) -> BackupSection:
        return self._sections.get(section_id)

    def get_all_sections(self):
        return list(self._sections.values())


# Global registry instance
section_registry = SectionRegistry()
