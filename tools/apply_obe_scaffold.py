#!/usr/bin/env python3
"""
apply_obe_scaffold.py

Scaffolds an OBE Django app and frontend pages, wires settings/urls, best-effort patches sidebar.

Run from repo root:
    python apply_obe_scaffold.py
"""
import os
import io
import re
from pathlib import Path
from datetime import date

REPO = Path.cwd()

def write_text(p: Path, content: str):
    p.parent.mkdir(parents=True, exist_ok=True)
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def read_text(p: Path):
    return p.read_text(encoding="utf-8")

def find_backend_root():
    cand = REPO / "backend" / "manage.py"
    if cand.exists():
        return REPO / "backend"
    cand = REPO / "manage.py"
    if cand.exists():
        return REPO
    raise SystemExit("Could not find manage.py under ./backend or repo root. Run from project root.")

def find_settings(backend_root: Path):
    preferred = backend_root / "erp" / "settings.py"
    if preferred.exists():
        return preferred
    for p in backend_root.rglob("settings.py"):
        try:
            if "INSTALLED_APPS" in read_text(p):
                return p
        except Exception:
            pass
    raise SystemExit("Could not find settings.py with INSTALLED_APPS under backend root.")

def find_urls(backend_root: Path):
    preferred = backend_root / "erp" / "urls.py"
    if preferred.exists():
        return preferred
    for p in backend_root.rglob("urls.py"):
        try:
            if "urlpatterns" in read_text(p):
                return p
        except Exception:
            pass
    raise SystemExit("Could not find urls.py with urlpatterns under backend root.")

def insert_installed_app(settings_path: Path, app_entry: str):
    text = read_text(settings_path)
    stamp = f"# Added {app_entry} on {date.today().isoformat()}\n"
    if stamp not in text:
        text = stamp + text
    if app_entry in text:
        write_text(settings_path, text)
        return False
    m = re.search(r"INSTALLED_APPS\s*=\s*\[", text)
    if not m:
        raise SystemExit("INSTALLED_APPS not found in settings.py")
    start = m.end()
    depth = 1
    i = start
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
        raise SystemExit("Could not parse INSTALLED_APPS list")
    before = text[:i]
    after = text[i:]
    # find indent
    last_line = before.splitlines()[-1] if before.splitlines() else ""
    indent = re.match(r"(\s*)", last_line).group(1) or "    "
    insert = f"\n{indent}{app_entry}\n"
    new_text = before + insert + after
    write_text(settings_path, new_text)
    return True

def add_include_to_urls(urls_path: Path, include_line: str):
    text = read_text(urls_path)
    if include_line in text:
        return False
    # ensure include is imported
    if "include" not in text.splitlines()[0:40]:
        text = re.sub(r"from\s+django\.urls\s+import\s+path",
                      "from django.urls import include, path",
                      text, count=1)
    m = re.search(r"urlpatterns\s*=\s*\[", text)
    if not m:
        raise SystemExit("urlpatterns not found in urls.py")
    start = m.end()
    depth = 1
    i = start
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
        raise SystemExit("Could not parse urlpatterns list")
    before = text[:i]
    after = text[i:]
    # indent guess
    last_line = before.splitlines()[-1] if before.splitlines() else ""
    indent = re.match(r"(\s*)", last_line).group(1) or "    "
    insert = f"\n{indent}{include_line}\n"
    new_text = before + insert + after
    write_text(urls_path, new_text)
    return True

def scaffold_backend(backend_root: Path, settings_path: Path, urls_path: Path):
    app_dir = backend_root / "OBE"
    services_dir = app_dir / "services"
    migrations_dir = app_dir / "migrations"

    (app_dir).mkdir(parents=True, exist_ok=True)
    (services_dir).mkdir(parents=True, exist_ok=True)
    (migrations_dir).mkdir(parents=True, exist_ok=True)

    write_text(app_dir / "__init__.py", "")
    write_text(migrations_dir / "__init__.py", "")

    write_text(app_dir / "apps.py",
"""from django.apps import AppConfig

class ObeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'OBE'
""")

    write_text(app_dir / "models.py",
"""import uuid
from django.db import models

class CdapRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject_id = models.UUIDField(unique=True)
    status = models.TextField(default='draft')
    rows = models.JSONField(default=list)
    books = models.JSONField(default=dict)
    active_learning = models.JSONField(default=dict)
    created_by = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.UUIDField(null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'cdap_revisions'

class CdapActiveLearningAnalysisMapping(models.Model):
    id = models.IntegerField(primary_key=True)
    mapping = models.JSONField(default=dict)
    updated_by = models.UUIDField(null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'cdap_active_learning_analysis_mapping'
""")

    write_text(services_dir / "cdap_parser.py",
"""# Minimal stub parser - replace with openpyxl/pandas implementation.
def parse_cdap_excel(file_obj):
    # file_obj is Django UploadedFile; you can read bytes: file_obj.read()
    return {
        "rows": [],
        "books": {"textbook": "", "reference": ""},
        "activeLearningOptions": [],
        "iqacRows": [],
    }
""")

    write_text(app_dir / "views.py",
"""import json
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import CdapRevision, CdapActiveLearningAnalysisMapping
from .services.cdap_parser import parse_cdap_excel

def _require_auth(request):
    if not getattr(request, 'user', None) or not request.user.is_authenticated:
        return JsonResponse({'detail': 'Authentication required.'}, status=401)
    return None

def _body_json(request):
    try:
        return json.loads((request.body or b'{}').decode('utf-8'))
    except Exception:
        return None

@csrf_exempt
@require_http_methods(['POST'])
def upload_cdap(request):
    auth = _require_auth(request)
    if auth:
        return auth
    if 'file' not in request.FILES:
        return HttpResponseBadRequest('Missing file')
    parsed = parse_cdap_excel(request.FILES['file'])
    return JsonResponse(parsed)

@csrf_exempt
@require_http_methods(['GET', 'PUT'])
def cdap_revision(request, subject_id):
    auth = _require_auth(request)
    if auth:
        return auth

    if request.method == 'GET':
        rev = CdapRevision.objects.filter(subject_id=subject_id).first()
        if not rev:
            return JsonResponse({
                'subject_id': str(subject_id),
                'status': 'draft',
                'rows': [],
                'books': {'textbook': '', 'reference': ''},
                'active_learning': {'grid': [], 'dropdowns': []},
            })
        return JsonResponse({
            'subject_id': str(rev.subject_id),
            'status': rev.status,
            'rows': rev.rows,
            'books': rev.books,
            'active_learning': rev.active_learning,
        })

    body = _body_json(request)
    if body is None:
        return HttpResponseBadRequest('Invalid JSON')

    defaults = {
        'rows': body.get('rows', []),
        'books': body.get('books', {}),
        'active_learning': body.get('active_learning', {}),
        'status': body.get('status', 'draft'),
        'updated_by': getattr(request.user, 'id', None),
    }

    obj = CdapRevision.objects.filter(subject_id=subject_id).first()
    if obj:
        for k, v in defaults.items():
            setattr(obj, k, v)
        obj.save(update_fields=list(defaults.keys()) + ['updated_at'])
    else:
        obj = CdapRevision(subject_id=subject_id, created_by=getattr(request.user, 'id', None), **defaults)
        obj.save()

    return JsonResponse({
        'subject_id': str(obj.subject_id),
        'status': obj.status,
        'rows': obj.rows,
        'books': obj.books,
        'active_learning': obj.active_learning,
    })

@csrf_exempt
@require_http_methods(['GET', 'PUT'])
def active_learning_mapping(request):
    auth = _require_auth(request)
    if auth:
        return auth

    row = CdapActiveLearningAnalysisMapping.objects.filter(id=1).first()

    if request.method == 'GET':
        return JsonResponse({
            'mapping': row.mapping if row else {},
            'updated_at': row.updated_at.isoformat() if row and row.updated_at else None,
        })

    body = _body_json(request)
    if body is None:
        return HttpResponseBadRequest('Invalid JSON')

    mapping = body.get('mapping', {})
    if row:
        row.mapping = mapping
        row.updated_by = getattr(request.user, 'id', None)
        row.save(update_fields=['mapping', 'updated_by', 'updated_at'])
    else:
        row = CdapActiveLearningAnalysisMapping(id=1, mapping=mapping, updated_by=getattr(request.user, 'id', None))
        row.save()

    return JsonResponse({'mapping': row.mapping, 'updated_at': row.updated_at.isoformat()})
""")

    write_text(app_dir / "urls.py",
"""from django.urls import path
from . import views

urlpatterns = [
    path('upload-cdap', views.upload_cdap),
    path('cdap-revision/<uuid:subject_id>', views.cdap_revision),
    path('active-learning-mapping', views.active_learning_mapping),
]
""")

    write_text(app_dir / "admin.py",
"""from django.contrib import admin
from .models import CdapRevision, CdapActiveLearningAnalysisMapping

@admin.register(CdapRevision)
class CdapRevisionAdmin(admin.ModelAdmin):
    list_display = ('subject_id', 'status', 'updated_at')
    search_fields = ('subject_id', 'status')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(CdapActiveLearningAnalysisMapping)
class CdapActiveLearningAnalysisMappingAdmin(admin.ModelAdmin):
    list_display = ('id', 'updated_at')
    readonly_fields = ('updated_at',)
""")

def find_frontend_root():
    # Prefer a dir containing package.json and src/pages or pages
    for p in REPO.iterdir():
        if (p / "package.json").exists():
            if (p / "src" / "pages").exists() or (p / "pages").exists():
                return p
    # fallback: search repo for package.json
    for pkg in REPO.rglob("package.json"):
        root = pkg.parent
        if (root / "src" / "pages").exists() or (root / "pages").exists():
            return root
    return None

OBE_INDEX_TSX = """import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ObeCoursesPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/obe/subjects');
        const json = await res.json();
        setCourses(json.results ?? []);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>OBE • Courses</h1>
      {courses.map((c) => (
        <div key={c.id} style={{ padding: 12, border: '1px solid #ddd', marginTop: 8 }}>
          <div style={{ fontWeight: 600 }}><Link href={`/staff/obe/${c.id}`}>{c.name}</Link></div>
          <div style={{ color: '#666' }}>{c.subject_code ?? ''} {c.department ?? ''}</div>
        </div>
      ))}
    </div>
  );
}
"""

OBE_COURSE_TSX = """import { useRouter } from 'next/router';
import { useState } from 'react';

export default function ObeCourseDetailPage() {
  const router = useRouter();
  const courseId = router.query.courseId as string | undefined;
  const [tab, setTab] = useState<'cdap'|'articulation'|'marks'>('cdap');

  if (!courseId) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1>OBE • Course</h1>
      <div style={{ color: '#666', marginBottom: 12 }}>Subject ID: {courseId}</div>

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #ddd', marginBottom: 12 }}>
        <button onClick={() => setTab('cdap')} style={{ padding: 8 }}>CDAP</button>
        <button onClick={() => setTab('articulation')} style={{ padding: 8 }}>Articulation Matrix</button>
        <button onClick={() => setTab('marks')} style={{ padding: 8 }}>Mark Entry</button>
      </div>

      {tab === 'cdap' && <div>CDAP editor placeholder for {courseId}</div>}
      {tab === 'articulation' && <div>Articulation matrix placeholder for {courseId}</div>}
      {tab === 'marks' && <div>Mark entry placeholder for {courseId}</div>}
    </div>
  );
}
"""

def scaffold_frontend(frontend_root: Path):
    pages_src = None
    if (frontend_root / "src" / "pages").exists():
        pages_src = frontend_root / "src" / "pages"
    elif (frontend_root / "pages").exists():
        pages_src = frontend_root / "pages"
    else:
        print("No pages root found in frontend; skipping frontend scaffolding.")
        return frontend_root

    dest = pages_src / "staff" / "obe"
    write_text(dest / "index.tsx", OBE_INDEX_TSX)
    write_text(dest / "[courseId].tsx", OBE_COURSE_TSX)
    print("Created frontend pages at:", dest)
    return frontend_root

def patch_sidebar(frontend_root: Path):
    # Best-effort: find files that render menu and contain 'Profile' text
    candidates = list(frontend_root.rglob("*Sidebar*.tsx")) + list(frontend_root.rglob("*sidebar*.tsx")) + list(frontend_root.rglob("*menu*.tsx"))
    candidates = [p for p in candidates if "node_modules" not in str(p) and ".next" not in str(p)]
    for p in candidates:
        try:
            text = read_text(p)
        except Exception:
            continue
        if "Profile" not in text:
            continue
        if "/staff/obe" in text or "OBE" in text:
            print("Sidebar file already contains OBE or patched:", p)
            return True
        # heuristic: insert OBE after 'Profile' occurrence
        new_text = text.replace("Profile", "Profile\\n  { label: 'OBE', href: '/staff/obe', show: dashboard?.is_staff === true },", 1)
        if new_text != text:
            try:
                write_text(p, new_text)
                print("Patched sidebar file:", p)
                return True
            except Exception:
                pass
    print("Could not safely patch sidebar automatically. Please add a staff-only link to /staff/obe in your sidebar component.")
    return False

def main():
    print("Scanning repository:", REPO)
    backend_root = find_backend_root()
    print("Backend root:", backend_root)
    settings_path = find_settings(backend_root)
    print("Settings path:", settings_path)
    urls_path = find_urls(backend_root)
    print("URLs path:", urls_path)

    scaffold_backend(backend_root, settings_path, urls_path)

    added = insert_installed_app(settings_path, "'OBE.apps.ObeConfig',")
    if added:
        print("Inserted 'OBE.apps.ObeConfig' into INSTALLED_APPS")
    else:
        print("'OBE.apps.ObeConfig' already present (or not added)")

    included = add_include_to_urls(urls_path, "path('api/obe/', include('OBE.urls')),")
    if included:
        print("Added include('OBE.urls') to urls.py")
    else:
        print("OBE include already present in urls.py (or not added)")

    frontend_root = find_frontend_root()
    if frontend_root:
        print("Frontend root:", frontend_root)
        scaffold_frontend(frontend_root)
        patch_sidebar(frontend_root)
    else:
        print("Frontend root not found; skipping frontend scaffolding.")

    print("\\nDone. Next steps:")
    print("  cd backend")
    print("  python manage.py check")
    print("  python manage.py runserver")
    print("  Start your frontend dev server (npm/yarn) and open /staff/obe")

if __name__ == '__main__':
    main()