from COE.models import CoeKeyValueStore
from django.db import transaction

FK = 'ECE::SEM8'
CK_WRONG = 'ECE::SEM8::20GE7811::Business Ethics (NPTEL)'
CK_RIGHT = 'ECE::SEM8::20GE7812::Healthcare Enterpreneurship (NPTEL)'
BUNDLE = '20GE7812EC001'
D1 = 'E2560500186'  # PRIYADHARSHINI.A
D2 = 'E2560500222'  # SHAM LICE W
D_BAD = 'E2560500241'  # BAD/duplicate

with transaction.atomic():
    cb = CoeKeyValueStore.objects.select_for_update().get(store_name='coe-course-bundle-dummies-v1')
    data = cb.data or {}
    cm = data.get(FK, {})

    # 1. Remove D1 from WRONG course
    wrong = cm.get(CK_WRONG, {'courseDummies': [], 'bundles': {}})
    wrong['courseDummies'] = [x for x in wrong.get('courseDummies', []) if x != D1]
    for k in list(wrong.get('bundles', {})):
        wrong['bundles'][k] = [x for x in wrong['bundles'][k] if x != D1]
    cm[CK_WRONG] = wrong

    # 2. RIGHT course: Only D1 and D2 in courseDummies, remove D_BAD
    right = cm.get(CK_RIGHT, {'courseDummies': [], 'bundles': {}})
    right['courseDummies'] = [D1, D2]
    right['bundles'][BUNDLE] = [D1, D2]
    cm[CK_RIGHT] = right

    data[FK] = cm
    cb.data = data
    cb.save()

    # 3. Fix shuffled list
    sh = CoeKeyValueStore.objects.select_for_update().get(store_name='coe-students-shuffled-list-v1')
    shd = sh.data or {}
    f = shd.get(FK, {})
    f.pop(D_BAD, None)
    f[D1] = {'reg_no': '811722104114', 'name': 'PRIYADHARSHINI.A'}
    f[D2] = {'reg_no': '811722243047', 'name': 'SHAM LICE W'}
    shd[FK] = f
    sh.data = shd
    sh.save()

print('FORCE FIX COMPLETE')
