from academics.models import AcademicYear
from unittest import mock
from backups_logs.signals import trigger_semester_end_archive

print("\n--- 7. Signal idempotency check ---")
ay = AcademicYear.objects.first()
if not ay:
    print("  [SKIP] No AcademicYear found.")
else:
    original_active = ay.is_active
    
    with mock.patch('backups_logs.tasks.task_config_export.delay') as mock_task:
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
        
        ay.is_active = False
        ay.save()
        if mock_task.call_count != 0:
            print(f"  [FAIL] Signal fired {mock_task.call_count} times on inactive->inactive transition.")
        else:
            print("  [PASS] Signal did not fire on repeated inactive saves.")
            
    ay.is_active = original_active
    ay.save()
