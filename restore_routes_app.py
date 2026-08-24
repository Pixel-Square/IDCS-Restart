import re

with open('frontend/src/App.tsx', 'r') as f:
    app = f.read()

if 'AcademicPerformancePage' not in app:
    app = app.replace(
        'import DashboardPage from "./pages/dashboard/Dashboard";',
        'import DashboardPage from "./pages/dashboard/Dashboard";\nconst AcademicPerformancePage = safeLazy(() => import(\'./pages/Academic 2.1/AcademicPerformancePage\'), \'AcademicPerformancePage\');\nconst AcademicVisualsPage = safeLazy(() => import(\'./pages/visual_admin/AcademicVisualsPage\'), \'AcademicVisualsPage\');'
    )
    app = app.replace(
        '<Route path="/dashboard" element={<DashboardPage />} />',
        '<Route path="/dashboard" element={<DashboardPage />} />\n                <Route path="/academic-performance" element={<AcademicPerformancePage />} />\n                <Route path="/academic-visuals" element={<AcademicVisualsPage />} />'
    )
    with open('frontend/src/App.tsx', 'w') as f:
        f.write(app)
    print("Fixed App.tsx")
