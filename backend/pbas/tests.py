from types import SimpleNamespace
from django.test import SimpleTestCase
from django.urls import resolve

from .serializers import filter_visible_nodes


class PBASRouteCompatibilityTests(SimpleTestCase):
    def test_master_department_tree_route_resolves(self):
        match = resolve('/api/pbas/custom-departments/master/tree/')
        self.assertEqual(match.view_name, 'pbas-master-dept-tree')
        self.assertEqual(match.kwargs['dept_id'] if 'dept_id' in match.kwargs else 'master', 'master')

    def test_approvals_route_resolves(self):
        match = resolve('/api/pbas/submissions/approvals/')
        self.assertEqual(match.view_name, 'pbas-submissions-approvals')


class PBASVisibilityFilterTests(SimpleTestCase):
    def test_student_view_keeps_parent_when_student_leaf_exists(self):
        student_leaf = SimpleNamespace(audience='student', children=[])
        faculty_leaf = SimpleNamespace(audience='faculty', children=[])
        parent = SimpleNamespace(audience='faculty', children=[student_leaf, faculty_leaf])

        visible = filter_visible_nodes([parent], ['student', 'both'])

        self.assertEqual(len(visible), 1)
        self.assertEqual(visible[0].audience, 'faculty')
        self.assertEqual(len(filter_visible_nodes(visible[0].children, ['student', 'both'])), 1)

    def test_staff_view_hides_student_only_branches(self):
        student_leaf = SimpleNamespace(audience='student', children=[])
        faculty_leaf = SimpleNamespace(audience='faculty', children=[])
        parent = SimpleNamespace(audience='faculty', children=[student_leaf, faculty_leaf])

        visible = filter_visible_nodes([parent], ['faculty', 'both'])

        self.assertEqual(len(visible), 1)
        self.assertEqual(visible[0].audience, 'faculty')
        self.assertEqual(len(filter_visible_nodes(visible[0].children, ['faculty', 'both'])), 1)
        self.assertEqual(filter_visible_nodes(visible[0].children, ['faculty', 'both'])[0].audience, 'faculty')
