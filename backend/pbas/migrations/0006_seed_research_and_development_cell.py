from django.db import migrations
from django.db.models import Q


DEPARTMENT_TITLE = 'Research and Development Cell'
ROOT_LABEL = 'Part C: Research & Development (30 Marks)'


R6_SEPARATE_CHILDREN = [
    'R6.1 Tata McGraw-Hill: Author 6, Co-author 3',
    'R6.1 Pearson: Author 6, Co-author 3',
    'R6.1 PHI: Author 6, Co-author 3',
    'R6.1 IEEE Press: Author 6, Co-author 3',
    'R6.1 Wiley: Author 6, Co-author 3',
    'R6.1 Oxford: Author 6, Co-author 3',
    'R6.1 Galgotia: Author 6, Co-author 3',
    'R6.1 Cengage: Author 6, Co-author 3',
    'R6.2 S.K. Kataria: Author 4, Co-author 2',
    'R6.2 S. Chand: Author 4, Co-author 2',
    'R6.2 Khanna: Author 4, Co-author 2',
    'R6.2 Lakshmi Pvt Ltd: Author 4, Co-author 2',
    'R6.2 Dhanpat Rai: Author 4, Co-author 2',
    'R6.3 Other Books with ISBN (Hardbound): Author 2, Co-author 1',
]


def _find_academic_department(AcademicDepartment):
    return (
        AcademicDepartment.objects.filter(
            Q(name__iexact='Research and Development Cell')
            | Q(name__icontains='Research and Development')
            | Q(short_name__iexact='RDC')
            | Q(code__iexact='RDC')
        )
        .order_by('id')
        .first()
    )


def _ensure_department(PBASCustomDepartment, AcademicDepartment):
    academic_dept = _find_academic_department(AcademicDepartment)

    dept = (
        PBASCustomDepartment.objects.filter(
            Q(title__iexact=DEPARTMENT_TITLE)
            | Q(title__icontains='Research and Development Cell')
            | Q(title__icontains='Research & Development')
        )
        .order_by('created_at')
        .first()
    )

    if dept is None and academic_dept is not None:
        dept = (
            PBASCustomDepartment.objects.filter(academic_department_id=academic_dept.id)
            .order_by('created_at')
            .first()
        )

    if dept is None:
        return PBASCustomDepartment.objects.create(
            title=DEPARTMENT_TITLE,
            academic_department=academic_dept,
            accesses=[],
            show_in_submission=True,
        )

    dirty = False
    if dept.title != DEPARTMENT_TITLE:
        dept.title = DEPARTMENT_TITLE
        dirty = True
    if not dept.show_in_submission:
        dept.show_in_submission = True
        dirty = True
    if academic_dept is not None and getattr(dept, 'academic_department_id', None) is None:
        dept.academic_department_id = academic_dept.id
        dirty = True
    if dirty:
        dept.save(update_fields=['title', 'show_in_submission', 'academic_department'])
    return dept


def _build_tree_payload():
    return [
        {
            'label': ROOT_LABEL,
            'limit': 30,
            'children': [
                {
                    'label': 'R1 Publications (20 Marks)',
                    'limit': 20,
                    'children': [
                        {
                            'label': 'R1.1 Journals (Collaborative publications within KRGI-1 bonus credit) — Refer Annexure II — Scoring: minimum 10 credits (Ph.D holders), 6 credits (non-Ph.D)',
                        },
                        {
                            'label': 'R1.2 Conference Proceedings indexed in Scopus — First/Corresponding author: 1; Co-author: 0.5',
                        },
                        {
                            'label': 'R1.3 Book chapters indexed in Scopus — First/Corresponding author: 2; Co-author: 1',
                        },
                    ],
                },
                {
                    'label': 'R2 Patents & Copyrights (10 Marks)',
                    'limit': 10,
                    'children': [
                        {'label': 'R2.1 Patent Published (Institute Name): 2 each'},
                        {'label': 'R2.2 Patent Granted (Institute Name): 5 each'},
                        {'label': 'R2.3 Revenue generated from Patent (Rs. 10000): 1'},
                    ],
                },
                {
                    'label': 'R3 Consultancy, Funding & Grants',
                    'children': [
                        {
                            'label': 'R3.1 Research Grant (Max 5 Marks)',
                            'limit': 5,
                            'children': [
                                {'label': 'Applied: 0.5 per proposal'},
                                {'label': 'Received: amount divided by 50K'},
                            ],
                        },
                        {
                            'label': 'R3.2 Research Project (Max 4 Marks)',
                            'limit': 4,
                            'children': [
                                {'label': 'Submitted to Govt. Agency / Industry: 0.5 per proposal'},
                                {'label': 'Submitted with Industry/Institute (IIT) partner (Interdisciplinary/Collaborative): 1 per proposal'},
                                {'label': 'Fund received from Govt. Agency / Industry: amount divided by 1 lakh'},
                                {'label': 'Fund received for Interdisciplinary/Collaborative project: 2 additional credits'},
                            ],
                        },
                        {
                            'label': 'R3.4 Funds received for Start-ups (Internal incubation centre preferred): amount divided by 1 lakh (Max 5 Marks)',
                            'limit': 5,
                        },
                        {
                            'label': 'R3.5 Consultancy Received (bonus 2 credits if revenue > ₹2,00,000): amount divided by 10000',
                        },
                    ],
                },
                {
                    'label': 'R4 Citation Impact of published work (calendar year from Scopus): 1 citation = 0.1, or h-index growth +1 credit per 2-point increase (Max 5 Marks)',
                    'limit': 5,
                },
                {
                    'label': 'R5 Ph.D Guidance / Pursuing PhD',
                    'children': [
                        {'label': 'R5.1 Research Supervisor - Recognition: 3 credits (applicable in year of recognition)'},
                        {'label': 'R5.2 Research Scholar - Registration (during assessment year): External 1.5/candidate, Internal 2/candidate, Full Time 3/candidate'},
                        {'label': 'R5.3 Research Scholar - Completion (during assessment year): Part Time 4/candidate, Full Time 5/candidate'},
                        {'label': 'R5.4 DC member / Viva Voce Examiners (during assessment year): 1/candidate'},
                    ],
                },
                {
                    'label': 'R6 Book Publication (15 Marks)',
                    'limit': 15,
                    'children': [{'label': s} for s in R6_SEPARATE_CHILDREN],
                },
            ],
        }
    ]


def _create_nodes(PBASNode, department, items, parent=None):
    for idx, item in enumerate(items):
        node = PBASNode.objects.create(
            department=department,
            parent=parent,
            label=item.get('label') or '',
            audience='faculty',
            input_mode='upload',
            link=None,
            uploaded_name=None,
            limit=item.get('limit', None),
            college_required=False,
            position=idx,
        )
        children = item.get('children') or []
        if children:
            _create_nodes(PBASNode, department, children, parent=node)


def _normalize_existing_r6(PBASNode, dept):
    root = PBASNode.objects.filter(department=dept, parent__isnull=True, label=ROOT_LABEL).first()
    if not root:
        return

    r6 = PBASNode.objects.filter(department=dept, parent=root, label__icontains='R6 Book Publication').first()
    if not r6:
        return

    current_children = list(PBASNode.objects.filter(department=dept, parent=r6).order_by('position', 'created_at'))
    current_labels = [c.label for c in current_children]
    if current_labels == R6_SEPARATE_CHILDREN:
        return

    for c in current_children:
        c.delete()
    for idx, label in enumerate(R6_SEPARATE_CHILDREN):
        PBASNode.objects.create(
            department=dept,
            parent=r6,
            label=label,
            audience='faculty',
            input_mode='upload',
            link=None,
            uploaded_name=None,
            limit=None,
            college_required=False,
            position=idx,
        )


def seed_research_and_development_cell(apps, schema_editor):
    PBASCustomDepartment = apps.get_model('pbas', 'PBASCustomDepartment')
    PBASNode = apps.get_model('pbas', 'PBASNode')
    AcademicDepartment = apps.get_model('academics', 'Department')

    dept = _ensure_department(PBASCustomDepartment, AcademicDepartment)

    if not PBASNode.objects.filter(department=dept, parent__isnull=True, label=ROOT_LABEL).exists():
        payload = _build_tree_payload()
        _create_nodes(PBASNode, dept, payload, parent=None)
    else:
        _normalize_existing_r6(PBASNode, dept)


class Migration(migrations.Migration):

    dependencies = [
        ('pbas', '0005_backfill_show_in_submission_saved'),
    ]

    operations = [
        migrations.RunPython(seed_research_and_development_cell, migrations.RunPython.noop),
    ]
