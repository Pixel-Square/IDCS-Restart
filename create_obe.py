#!/usr/bin/env python3
"""
Create backend/OBE Django app and register it in INSTALLED_APPS.

Usage: python create_obe.py
"""
import os
import sys
from datetime import date
import io
import re

ROOT = os.getcwd()
APP_DIR = os.path.join(ROOT, "backend", "OBE")
MIG_DIR = os.path.join(APP_DIR, "migrations")

FILES = {
    os.path.join(APP_DIR, "__init__.py"): "",
    os.path.join(APP_DIR, "apps.py"):
"""from django.apps import AppConfig

class ObeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend.OBE'
""",
    os.path.join(APP_DIR, "models.py"):
"""from django.db import models

class Example(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name
""",
    os.path.join(APP_DIR, "admin.py"):
"""from django.contrib import admin
from .models import Example

@admin.register(Example)
class ExampleAdmin(admin.ModelAdmin):
    list_display = ('id', 'name')
""",
    os.path.join(APP_DIR, "views.py"):
"""from django.shortcuts import render
""",
    os.path.join(APP_DIR, "urls.py"):
"""from django.urls import path

urlpatterns = []
""",
    os.path.join(APP_DIR, "tests.py"):
"""from django.test import TestCase
""",
    os.path.join(MIG_DIR, "__init__.py"): "",
}

def ensure_dirs():
    os.makedirs(MIG_DIR, exist_ok=True)

def write_files():
    for path, content in FILES.items():
        dirp = os.path.dirname(path)
        if not os.path.isdir(dirp):
            os.makedirs(dirp, exist_ok=True)
        # write with LF endings and UTF-8
        with io.open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        print("Created", os.path.relpath(path, ROOT))

def find_settings():
    candidates = []
    for dirpath, dirs, files in os.walk(ROOT):
        for name in files:
            if name == "settings.py":
                full = os.path.join(dirpath, name)
                try:
                    with io.open(full, "r", encoding="utf-8") as fh:
                        txt = fh.read()
                    if "INSTALLED_APPS" in txt:
                        candidates.append(full)
                except Exception:
                    continue
    if not candidates:
        return None
    # prefer a settings.py under a directory named 'erp' or 'backend/erp'
    for c in candidates:
        parts = c.replace("\\", "/").split("/")
        if "erp" in parts:
            return c
    return candidates[0]

def register_in_settings(settings_path):
    with io.open(settings_path, "r", encoding="utf-8") as f:
        text = f.read()
    backup_line = f"# Added backend.OBE.apps.ObeConfig on {date.today().isoformat()}\n"
    if backup_line.strip() not in text:
        text = backup_line + text
    app_entry = "'backend.OBE.apps.ObeConfig',"
    if app_entry in text:
        print("App already registered in", os.path.relpath(settings_path, ROOT))
        with io.open(settings_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        return settings_path

    # locate INSTALLED_APPS list and insert before the closing bracket
    m = re.search(r"INSTALLED_APPS\s*=\s*\[", text)
    if not m:
        print("Could not find INSTALLED_APPS in", settings_path)
        return None
    # find the end of this list by balancing brackets
    start = m.start()
    idx = m.end()  # position after '['
    depth = 1
    i = idx
    while i < len(text):
        ch = text[i]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                break
        i += 1
    if depth != 0:
        print("Could not parse INSTALLED_APPS list in", settings_path)
        return None
    # Insert before position i (the closing ])
    before = text[:i]
    after = text[i:]
    # Determine indentation by looking at the previous line
    prev_line = before.splitlines()[-1] if before.splitlines() else ""
    indent = re.match(r"(\s*)", prev_line).group(1) if prev_line is not None else "    "
    insert = f"\n{indent}{app_entry}\n"
    new_text = before + insert + after
    # write back with LF endings
    with io.open(settings_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_text)
    print("Updated", os.path.relpath(settings_path, ROOT))
    return settings_path

def main():
    ensure_dirs()
    write_files()
    settings_path = find_settings()
    if not settings_path:
        print("ERROR: could not find a settings.py with INSTALLED_APPS. Please run script again and supply the path if needed.")
        print("You can manually add 'backend.OBE.apps.ObeConfig', to your INSTALLED_APPS and add a top-line comment like:")
        print("# Added backend.OBE.apps.ObeConfig on " + date.today().isoformat())
        sys.exit(1)
    reg = register_in_settings(settings_path)
    if not reg:
        print("Failed to update settings. Please add 'backend.OBE.apps.ObeConfig', to INSTALLED_APPS manually.")
        sys.exit(1)
    print("\nDone. Next steps:")
    print("1) From your repo root run:")
    print("   python manage.py makemigrations OBE")
    print("   python manage.py migrate")
    print("2) Start the server or run checks:")
    print("   python manage.py runserver")
    print("\nIf you want a different settings file, rerun the script after editing it or provide the correct settings.py path in the repo.")

if __name__ == "__main__":
    main()