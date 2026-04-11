from COE.models import CoeKeyValueStore
from django.db import transaction

FK = 'ECE::SEM8'
CK_WRONG = 'ECE::SEM8::20GE7811::Business Ethics (NPTEL)'
CK_RIGHT = 'ECE::SEM8::20GE7812::Healthcare Enterpreneurship (NPTEL)'
BUNDLE = '20GE7812EC001'
D1 = 'E2560500186'  # PRIYADHARSHINI.A
D2 = 'E2560500222'  # SHAM LICE W

with transaction.atomic():
    cb = CoeKeyValueStore.objects.select_for_update().get(store_name='coe-course-bundle-dummies-v1')
    data = cb.data or {}
    cm = data.get(FK, {})

    # Set Business Ethics (NPTEL) to all dummies except D1
    wrong = cm.get(CK_WRONG, {'courseDummies': [], 'bundles': {}})
    wrong['courseDummies'] = [x for x in wrong.get('courseDummies', []) if x != D1]
    for k in list(wrong.get('bundles', {})):
        wrong['bundles'][k] = [x for x in wrong['bundles'][k] if x != D1]
    cm[CK_WRONG] = wrong

    # Set Healthcare Enterpreneurship (NPTEL) to ONLY D1 and D2
    right = {
        'courseDummies': [D1, D2],
        'bundles': {BUNDLE: [D1, D2]}
    }
    cm[CK_RIGHT] = right

    data[FK] = cm
    cb.data = data
    cb.save()

print('FORCE BUNDLE STRUCTURE COMPLETE')
