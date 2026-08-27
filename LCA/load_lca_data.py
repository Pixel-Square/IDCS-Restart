#!/usr/bin/env python3
"""
LCA & CDAP Data Loader Script

Run this script from inside your Django project root or backend directory:
    python load_lca_data.py

Or use standard Django management command:
    python manage.py loaddata LCA/data/lca_fixture.json
"""

import os
import sys
import subprocess

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    fixture_path = os.path.join(script_dir, "data", "lca_fixture.json")

    if not os.path.exists(fixture_path):
        print(f"Error: Fixture file not found at {fixture_path}")
        sys.exit(1)

    print("==================================================")
    print("      LCA & CDAP Data Migration Loader            ")
    print("==================================================")
    print(f"Fixture Path: {fixture_path}")

    # Determine command to run loaddata
    manage_py = os.path.join(os.getcwd(), "manage.py")
    if not os.path.exists(manage_py):
        # Look in parent directory or subdirectories
        if os.path.exists(os.path.join(os.path.dirname(script_dir), "backend", "manage.py")):
            manage_py = os.path.join(os.path.dirname(script_dir), "backend", "manage.py")
        elif os.path.exists(os.path.join(script_dir, "manage.py")):
            manage_py = os.path.join(script_dir, "manage.py")

    cmd = [sys.executable, manage_py, "loaddata", fixture_path]
    print(f"Executing: {' '.join(cmd)}")

    try:
        res = subprocess.run(cmd, check=True)
        print("✓ Data loaded successfully!")
    except subprocess.CalledProcessError as e:
        print(f"✕ Error loading fixture data: {e}")
        sys.exit(e.returncode)

if __name__ == "__main__":
    main()
