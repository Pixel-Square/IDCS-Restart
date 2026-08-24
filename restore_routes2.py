import re

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
    sidebar = sidebar.replace(
        "  // Add Token Raise for all users at the end (no permission check needed)",
        to_insert + "  // Add Token Raise for all users at the end (no permission check needed)"
    )
    with open('frontend/src/components/layout/DashboardSidebar.tsx', 'w') as f:
        f.write(sidebar)
    print("Fixed DashboardSidebar.tsx")

