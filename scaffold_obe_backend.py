#!/usr/bin/env python3
import os
import io
import re
from pathlib import Path

REPO = Path(os.getcwd())

def write_text(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def find_frontend_root() -> Path:
    # Heuristics: a directory containing package.json + src/pages
    candidates = []
    for pkg in REPO.rglob("package.json"):
        root = pkg.parent
        if (root / "src" / "pages").is_dir():
            candidates.append(root)

    if not candidates:
        # fallback: look for src/pages anywhere
        for pages in REPO.rglob("src/pages"):
            candidates.append(pages.parent.parent)

    # Prefer one containing staff/subjects/[id].tsx
    for root in candidates:
        if (root / "src" / "pages" / "staff" / "subjects" / "[id].tsx").is_file():
            return root

    return candidates[0] if candidates else None

def scaffold_pages(frontend_root: Path):
    pages_root = frontend_root / "src" / "pages" / "staff" / "obe"
    write_text(pages_root / "index.tsx", OBE_INDEX_TSX)
    write_text(pages_root / "[courseId].tsx", OBE_COURSE_TSX)

def patch_sidebar_best_effort(frontend_root: Path):
    """
    Try to find a sidebar/menu config and insert an OBE link for staff.
    This is best-effort: if we can't confidently patch, we print instructions.
    """
    patterns = [
        "**/*sidebar*.tsx",
        "**/*Sidebar*.tsx",
        "**/*menu*.ts",
        "**/*menu*.tsx",
        "**/*nav*.ts",
        "**/*nav*.tsx",
    ]

    files = []
    for pat in patterns:
        files.extend(frontend_root.rglob(pat))

    # Filter obvious build artifacts
    files = [p for p in files if "node_modules" not in str(p) and ".next" not in str(p) and "dist" not in str(p)]

    obe_link_snippet = "{ label: 'OBE', href: '/staff/obe', roles: ['staff'] },"
    inserted = False

    for p in files:
        try:
            text = p.read_text(encoding="utf-8")
        except Exception:
            continue

        # Only attempt patch if file already contains staff role logic and hrefs
        if ("roles" not in text and "role" not in text and "staff" not in text) or ("/staff/" not in text):
            continue

        # Try common pattern: nav items array with objects containing href/label
        # If file already has /staff/obe, skip
        if "/staff/obe" in text:
            inserted = True
            continue

        # Insert near other staff links (after the last /staff/ link)
        staff_link_matches = list(re.finditer(r"href:\s*['\"](/staff/[^'\"]+)['\"]", text))
        if not staff_link_matches:
            continue

        last = staff_link_matches[-1]
        # find end of the object containing that link (best-effort: next "}," after match)
        tail = text[last.end():]
        close_idx = tail.find("},")
        if close_idx == -1:
            continue

        insert_pos = last.end() + close_idx + 2
        new_text = text[:insert_pos] + "\n  " + obe_link_snippet + text[insert_pos:]
        try:
            p.write_text(new_text, encoding="utf-8", newline="\n")
            inserted = True
            print(f"Patched sidebar/menu: {p}")
            break
        except Exception:
            pass

    if not inserted:
        print("\nCould not auto-patch sidebar/menu safely.")
        print("Manual add: add a staff-only link to /staff/obe in your sidebar config.\n")

OBE_INDEX_TSX = """import { useEffect, useState } from 'react';
import Link from 'next/link';

type Dashboard = { role?: string };
type Course = {
  id: string;
  name: string;
  subject_code?: string;
  department?: string;
  year?: number;
};

export default function ObeCoursesPage() {
  const [role, setRole] = useState<string | undefined>(undefined);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Best-effort role check (uses your existing endpoint seen in logs)
        const dashRes = await fetch('/api/accounts/dashboard/');
        const dash: Dashboard = await dashRes.json();
        setRole(dash.role);

        // Courses list (temporary): uses OBE subjects search endpoint
        const res = await fetch('/api/obe/subjects');
        const json = await res.json();
        setCourses(json.results ?? []);
      } catch {
        // ignore, show empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;

  if (role && role !== 'staff') {
    return <div style={{ padding: 16 }}>Not authorized.</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: 0 }}>OBE • Courses</h1>
      <div style={{ marginTop: 12 }}>
        {courses.length === 0 ? (
          <div style={{ color: '#666' }}>No courses found.</div>
        ) : (
          courses.map((c) => (
            <div key={c.id} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>
                <Link href={`/staff/obe/${c.id}`}>{c.name}</Link>
              </div>
              <div style={{ color: '#666', marginTop: 4 }}>
                {c.subject_code ? `${c.subject_code} • ` : ''}
                {c.department ?? ''}{c.year ? ` • Year ${c.year}` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
"""

OBE_COURSE_TSX = """import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type Dashboard = { role?: string };
type TabKey = 'cdap' | 'articulation' | 'marks';

export default function ObeCourseDetailPage() {
  const router = useRouter();
  const courseId = router.query.courseId as string | undefined;

  const [role, setRole] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>('cdap');

  useEffect(() => {
    (async () => {
      try {
        const dashRes = await fetch('/api/accounts/dashboard/');
        const dash: Dashboard = await dashRes.json();
        setRole(dash.role);
      } catch {
        // ignore
      }
    })();
  }, []);

  if (!courseId) return <div style={{ padding: 16 }}>Loading...</div>;

  if (role && role !== 'staff') {
    return <div style={{ padding: 16 }}>Not authorized.</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>OBE • Course</h1>
        <div style={{ color: '#666' }}>Subject ID: {courseId}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #ddd', marginBottom: 12 }}>
        <TabButton active={tab === 'cdap'} onClick={() => setTab('cdap')} label="CDAP" />
        <TabButton active={tab === 'articulation'} onClick={() => setTab('articulation')} label="Articulation Matrix" />
        <TabButton active={tab === 'marks'} onClick={() => setTab('marks')} label="Mark Entry" />
      </div>

      {tab === 'cdap' && <div>CDAP for {courseId} (wire your CDAPEditor here)</div>}
      {tab === 'articulation' && <div>Articulation Matrix for {courseId} (wire ArticulationMatrix here)</div>}
      {tab === 'marks' && <div>Mark Entry for {courseId} (wire MarkEntryTabs here)</div>}
    </div>
  );
}

function TabButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        border: 'none',
        background: 'transparent',
        padding: '10px 12px',
        borderBottom: props.active ? '2px solid #1677ff' : '2px solid transparent',
        fontWeight: props.active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {props.label}
    </button>
  );
}
"""

def main():
    frontend_root = find_frontend_root()
    if not frontend_root:
        raise SystemExit("Could not find frontend root (package.json + src/pages). Run from repo root.")
    scaffold_pages(frontend_root)
    patch_sidebar_best_effort(frontend_root)

    print("\nCreated:")
    print(f"- {frontend_root / 'src/pages/staff/obe/index.tsx'}")
    print(f"- {frontend_root / 'src/pages/staff/obe/[courseId].tsx'}")
    print("\nNext: start frontend dev server and open /staff/obe")

if __name__ == "__main__":
    main()