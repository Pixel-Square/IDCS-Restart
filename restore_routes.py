import re

# Fix App.tsx
with open('frontend/src/App.tsx', 'r') as f:
    app = f.read()

if 'AcademicPerformancePage' not in app:
    app = app.replace(
        "const DashboardPage = safeLazy(() => import('./pages/DashboardPage'), 'DashboardPage');",
        "const DashboardPage = safeLazy(() => import('./pages/DashboardPage'), 'DashboardPage');\nconst AcademicPerformancePage = safeLazy(() => import('./pages/Academic 2.1/AcademicPerformancePage'), 'AcademicPerformancePage');\nconst AcademicVisualsPage = safeLazy(() => import('./pages/visual_admin/AcademicVisualsPage'), 'AcademicVisualsPage');"
    )
    app = app.replace(
        '<Route path="/student/dashboard" element={<StudentDashboardPage />} />',
        '<Route path="/student/dashboard" element={<StudentDashboardPage />} />\n                <Route path="/academic-performance" element={<AcademicPerformancePage />} />\n                <Route path="/academic-visuals" element={<AcademicVisualsPage />} />'
    )
    with open('frontend/src/App.tsx', 'w') as f:
        f.write(app)
    print("Fixed App.tsx")

# Fix DashboardSidebar.tsx
with open('frontend/src/components/layout/DashboardSidebar.tsx', 'r') as f:
    sidebar = f.read()

if 'academic_performance' not in sidebar:
    to_insert = """  // Academic Performance (accessible to all users)
  if (!items.some((item) => item.key === 'academic_performance')) {
    items.push({ key: 'academic_performance', label: 'Academic Performance', to: '/academic-performance' });
  }

  // Academic Visuals (accessible to multiple roles)
  const canSeeAcademicVisuals = isVisualAdmin || rolesUpper.some(r => ['PRINCIPAL', 'IQAC', 'ADMIN', 'SUPER_ADMIN'].includes(r));
  if (canSeeAcademicVisuals) {
    if (!items.some((item) => item.key === 'academic_visuals')) {
      items.push({ key: 'academic_visuals', label: 'Academic Visuals', to: '/academic-visuals' });
    }
  }
"""
    # Find a good place to insert, right after `academic_controller` or end of `if (isIqac...`
    # Let's just insert before `return (`
    sidebar = sidebar.replace(
        "  // Process route checks for expanded states",
        to_insert + "\n  // Process route checks for expanded states"
    )
    with open('frontend/src/components/layout/DashboardSidebar.tsx', 'w') as f:
        f.write(sidebar)
    print("Fixed DashboardSidebar.tsx")

