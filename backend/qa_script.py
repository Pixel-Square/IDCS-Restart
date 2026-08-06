import time
from backups_logs.registry import section_registry
from backups_logs.tasks import task_raw_snapshot, task_restore_raw_snapshot, task_config_export, task_config_import
from backups_logs.models import BackupSnapshot, ConfigExport, ActivityLog
from celery.result import AsyncResult

def wait_task(task_id, timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        res = AsyncResult(task_id)
        if res.ready():
            return res.state, res.result
        time.sleep(1)
    return "TIMEOUT", None

print("\n--- 2. Full-cycle test: Restore (Raw Snapshots) ---")
failed_restores = []
sections = section_registry.get_all_sections()
for s in sections:
    sid = s.section_id
    print(f"Testing {sid} raw restore cycle...")
    
    # 1. Trigger raw snapshot
    snap_task = task_raw_snapshot.delay(sid)
    state, res = wait_task(snap_task.id)
    if state != 'SUCCESS':
        print(f"  [FAIL] Raw snapshot failed for {sid}: {res}")
        failed_restores.append(sid)
        continue
    snapshot_id = res['snapshot_id']
    
    # 2. Trigger restore
    rest_task = task_restore_raw_snapshot.delay(snapshot_id)
    state, res = wait_task(rest_task.id)
    if state != 'SUCCESS':
        print(f"  [FAIL] Restore failed for {sid}: {res}")
        failed_restores.append(sid)
        continue
        
    # 3. Check safety snapshot and activity logs
    # There should be a new safety snapshot created just before restore
    safety_snap = BackupSnapshot.objects.filter(section_id=sid, status='success').order_by('-created_at').first()
    if not safety_snap or str(safety_snap.id) == snapshot_id:
         print(f"  [FAIL] Missing safety snapshot for {sid}")
         failed_restores.append(sid)
         continue
         
    logs = ActivityLog.objects.filter(section_id=sid).order_by('-timestamp')
    restore_log = logs.filter(action_type='restore').first()
    safety_log = logs.filter(action_type='backup', related_snapshot=safety_snap).first()
    
    if not restore_log or not restore_log.success:
         print(f"  [FAIL] Missing/failed restore ActivityLog for {sid}")
         failed_restores.append(sid)
         continue
    if not safety_log or not safety_log.success:
         print(f"  [FAIL] Missing/failed safety backup ActivityLog for {sid}")
         failed_restores.append(sid)
         continue
         
    print(f"  [PASS] {sid}")

print("\n--- 3. Full-cycle test: Config Export/Import ---")
failed_configs = []
for s in sections:
    sid = s.section_id
    try:
        has_config = bool(s.get_config_queryset_map())
    except NotImplementedError:
        has_config = False
        
    if not has_config:
        continue
        
    print(f"Testing {sid} config export/import cycle...")
    
    # 1. Trigger config export
    exp_task = task_config_export.delay(sid)
    state, res = wait_task(exp_task.id)
    if state != 'SUCCESS':
        print(f"  [FAIL] Config export failed for {sid}: {res}")
        failed_configs.append(sid)
        continue
    export_id = res['export_id']
    
    # 2. Preview (synchronous)
    try:
        from backups_logs.services import preview_config_import
        diff = preview_config_import(export_id, sid)
    except Exception as e:
        print(f"  [FAIL] Preview failed for {sid}: {e}")
        failed_configs.append(sid)
        continue
        
    # 3. Import
    imp_task = task_config_import.delay(export_id, sid)
    state, res = wait_task(imp_task.id)
    if state != 'SUCCESS':
        print(f"  [FAIL] Config import failed for {sid}: {res}")
        failed_configs.append(sid)
        continue
        
    # 4. Check safety snapshot and activity logs
    safety_snap = BackupSnapshot.objects.filter(section_id=sid, status='success').order_by('-created_at').first()
    if not safety_snap:
         print(f"  [FAIL] Missing safety snapshot for {sid} config import")
         failed_configs.append(sid)
         continue
         
    logs = ActivityLog.objects.filter(section_id=sid).order_by('-timestamp')
    import_log = logs.filter(action_type='config_import').first()
    
    if not import_log or not import_log.success:
         print(f"  [FAIL] Missing/failed config import ActivityLog for {sid}")
         failed_configs.append(sid)
         continue
         
    print(f"  [PASS] {sid}")

print("\n--- 4. Schema version validation check ---")
# Pick two newly registered sections
for sid in ['staff_attendance', 'curriculum']:
    print(f"Testing schema validation for {sid}...")
    snap = BackupSnapshot.objects.filter(section_id=sid, status='success').first()
    if not snap:
        print(f"  [FAIL] No snapshot available for {sid}")
        continue
    # Modify schema version in DB
    original_version = snap.schema_version
    snap.schema_version = "v999.0"
    snap.save(update_fields=['schema_version'])
    
    rest_task = task_restore_raw_snapshot.delay(str(snap.id))
    state, res = wait_task(rest_task.id)
    
    # Revert schema version
    snap.schema_version = original_version
    snap.save(update_fields=['schema_version'])
    
    if state != 'FAILURE' or 'Schema version mismatch' not in str(res):
        print(f"  [FAIL] Schema validation did not block restore properly. State: {state}, Res: {res}")
    else:
        print(f"  [PASS] Restore blocked due to schema version mismatch for {sid}")

print("\n--- 5. Cross-contamination check ---")
cross_contamination_failed = []
from django.db import models
from accounts.models import User
from academics.models import StudentProfile, StaffProfile, AcademicYear
forbidden_models = {User, StudentProfile, StaffProfile, AcademicYear}

for s in sections:
    sid = s.section_id
    raw_map = s.get_raw_queryset_map()
    config_map = {}
    try:
        config_map = s.get_config_queryset_map()
    except NotImplementedError:
        pass
        
    for m in list(raw_map.keys()) + list(config_map.keys()):
        if m in forbidden_models:
            print(f"  [FAIL] {sid} includes forbidden cross-module model: {m.__name__}")
            cross_contamination_failed.append(sid)
            
if not cross_contamination_failed:
    print("  [PASS] No cross-contamination detected in queryset maps.")

print("\n--- 7. Signal idempotency check ---")
from academics.models import AcademicYear
import mock
from backups_logs.signals import trigger_semester_end_archive

# Find an AcademicYear to toggle
ay = AcademicYear.objects.first()
if not ay:
    print("  [SKIP] No AcademicYear found.")
else:
    original_active = ay.is_active
    
    with mock.patch('backups_logs.tasks.task_config_export.delay') as mock_task:
        # Case 1: active -> inactive (should trigger)
        ay.is_active = True
        ay.save()
        mock_task.reset_mock()
        
        ay.is_active = False
        ay.save()
        
        if mock_task.call_count != 1:
            print(f"  [FAIL] Signal fired {mock_task.call_count} times on active->inactive transition.")
        else:
            print("  [PASS] Signal fired exactly once on active->inactive transition.")
            
        mock_task.reset_mock()
        
        # Case 2: inactive -> inactive (should NOT trigger)
        ay.is_active = False
        ay.save()
        if mock_task.call_count != 0:
            print(f"  [FAIL] Signal fired {mock_task.call_count} times on inactive->inactive transition.")
        else:
            print("  [PASS] Signal did not fire on repeated inactive saves.")
            
    # Restore original state
    ay.is_active = original_active
    ay.save()

