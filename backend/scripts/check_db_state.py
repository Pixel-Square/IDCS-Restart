from COE.models import CoeKeyValueStore

FK = 'ECE::SEM8'
CK_WRONG = 'ECE::SEM8::20GE7811::Business Ethics (NPTEL)'
CK_RIGHT = 'ECE::SEM8::20GE7812::Healthcare Enterpreneurship (NPTEL)'
BUNDLE = '20GE7812EC001'

cb = CoeKeyValueStore.objects.get(store_name='coe-course-bundle-dummies-v1')
data = cb.data
cm = data.get(FK, {})
wrong = cm.get(CK_WRONG, {})
right = cm.get(CK_RIGHT, {})

print('=== DATABASE STATE RIGHT NOW ===')
print('WRONG course has E2560500186:', 'E2560500186' in wrong.get('courseDummies', []))
print('RIGHT course has E2560500186:', 'E2560500186' in right.get('courseDummies', []))
print('RIGHT course has E2560500241:', 'E2560500241' in right.get('courseDummies', []))
print()
bundles = right.get('bundles', {})
print('Bundles in RIGHT course:', list(bundles.keys()))
if BUNDLE in bundles:
    bundle_dummies = bundles[BUNDLE]
    print(f'Bundle {BUNDLE} has {len(bundle_dummies)} dummies')
    print('Contains E2560500186:', 'E2560500186' in bundle_dummies)
    print('Contains E2560500222:', 'E2560500222' in bundle_dummies)
    print('Contains E2560500241:', 'E2560500241' in bundle_dummies)
else:
    print(f'Bundle {BUNDLE} NOT FOUND in bundles')
