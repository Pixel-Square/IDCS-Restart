from django.db import transaction

from COE.models import CoeExamDummy, CoeKeyValueStore
from academics.models import StudentProfile


FK = 'ECE::SEM8'
CK_WRONG = 'ECE::SEM8::20GE7811::Business Ethics (NPTEL)'
CK_RIGHT = 'ECE::SEM8::20GE7812::Healthcare Enterpreneurship (NPTEL)'
BUNDLE = '20GE7812EC001'
BUNDLE_WRONG = '20GE7811EC001'

D1 = 'E2560500186'  # PRIYADHARSHINI.A
D2 = 'E2560500222'  # SHAM LICE W (original)
D_BAD = 'E2560500241'  # duplicate/bad

REG_D1 = '811722104114'
NAME_D1 = 'PRIYADHARSHINI.A'
REG_D2 = '811722243047'
NAME_D2 = 'SHAM LICE W'


def _remove_dummy_from_course(course_data: dict, dummy: str) -> None:
    course_data['courseDummies'] = [x for x in (course_data.get('courseDummies') or []) if x != dummy]
    bundles = course_data.get('bundles') or {}
    for key in list(bundles.keys()):
        bundles[key] = [x for x in (bundles.get(key) or []) if x != dummy]
    course_data['bundles'] = bundles


with transaction.atomic():
    cb = CoeKeyValueStore.objects.select_for_update().get(store_name='coe-course-bundle-dummies-v1')
    cb_data = cb.data or {}
    course_map = cb_data.get(FK, {})

    wrong = course_map.get(CK_WRONG, {'courseDummies': [], 'bundles': {}})
    right = course_map.get(CK_RIGHT, {'courseDummies': [], 'bundles': {}})

    # Move D1 away from Business Ethics.
    _remove_dummy_from_course(wrong, D1)
    wrong_course_dummies = list(wrong.get('courseDummies') or [])
    wrong_bundles = wrong.get('bundles') or {}
    wrong_bundles[BUNDLE_WRONG] = [x for x in wrong_course_dummies if x != D_BAD]
    wrong['bundles'] = wrong_bundles

    # Ensure D1 is in Healthcare and remove the bad duplicate D_BAD.
    _remove_dummy_from_course(right, D_BAD)
    right_course_dummies = list(right.get('courseDummies') or [])
    if D1 not in right_course_dummies:
        right_course_dummies.append(D1)
    if D2 not in right_course_dummies:
        right_course_dummies.append(D2)
    right['courseDummies'] = right_course_dummies

    right_bundles = right.get('bundles') or {}
    # Keep one canonical bundle with the full corrected course dummy list.
    bundle_dummies = [x for x in right_course_dummies if x != D_BAD]
    right_bundles[BUNDLE] = bundle_dummies
    right['bundles'] = right_bundles

    course_map[CK_WRONG] = wrong
    course_map[CK_RIGHT] = right
    cb_data[FK] = course_map
    cb.data = cb_data
    cb.save(update_fields=['data', 'updated_at'])

    sh = CoeKeyValueStore.objects.select_for_update().get(store_name='coe-students-shuffled-list-v1')
    sh_data = sh.data or {}
    shuffled_for_filter = sh_data.get(FK, {})
    shuffled_for_filter.pop(D_BAD, None)
    shuffled_for_filter[D1] = {'reg_no': REG_D1, 'name': NAME_D1}
    shuffled_for_filter[D2] = {'reg_no': REG_D2, 'name': NAME_D2}
    sh_data[FK] = shuffled_for_filter
    sh.data = sh_data
    sh.save(update_fields=['data', 'updated_at'])

    # Keep CoeExamDummy mapping consistent for mark-entry lookup.
    student_d1 = StudentProfile.objects.filter(reg_no=REG_D1).first()
    student_d2 = StudentProfile.objects.filter(reg_no=REG_D2).first()

    if student_d1:
        CoeExamDummy.objects.update_or_create(
            dummy_number=D1,
            defaults={'student': student_d1, 'semester': 'SEM8', 'qp_type': 'OE'},
        )
    if student_d2:
        CoeExamDummy.objects.update_or_create(
            dummy_number=D2,
            defaults={'student': student_d2, 'semester': 'SEM8', 'qp_type': 'OE'},
        )

    CoeExamDummy.objects.filter(dummy_number=D_BAD).delete()

print('SAFE TARGETED FIX COMPLETE')