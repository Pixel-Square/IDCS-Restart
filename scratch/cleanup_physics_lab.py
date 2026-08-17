import os, sys, django
sys.path.append("/home/iqac2/IDCS-Restart/backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()

from django.db import transaction
from academics.models import TeachingAssignment, StudentSubjectBatch
from timetable.models import TimetableAssignment
from curriculum.models import CurriculumDepartment

@transaction.atomic
def run_cleanup():
    print("Starting physics lab curriculum row cleanup...")
    
    # 1. Update/delete TeachingAssignments
    # Let's handle each section
    for section_id in range(41, 53):
        tas = TeachingAssignment.objects.filter(section_id=section_id, curriculum_row_id__in=[503, 559], is_active=True)
        if not tas.exists():
            continue
            
        print(f"\nProcessing Section {section_id} ({tas.first().section.name}):")
        
        # Group by staff
        by_staff = {}
        for ta in tas:
            by_staff.setdefault(ta.staff_id, []).append(ta)
            
        for staff_id, staff_tas in by_staff.items():
            if len(staff_tas) > 1:
                # Duplicate for same staff. Keep the one with curriculum_row 503, delete the other
                org_ta = next((ta for ta in staff_tas if ta.curriculum_row_id == 503), None)
                dup_ta = next((ta for ta in staff_tas if ta.curriculum_row_id == 559), None)
                if org_ta and dup_ta:
                    print(f"  Deleting duplicate TeachingAssignment {dup_ta.id} for staff {staff_id} because original {org_ta.id} exists.")
                    dup_ta.delete()
                else:
                    print(f"  Warning: staff {staff_id} has {len(staff_tas)} assignments but not a clear 503/559 pair.")
            else:
                # Single assignment. If it is 559, update it to 503
                ta = staff_tas[0]
                if ta.curriculum_row_id == 559:
                    print(f"  Updating TeachingAssignment {ta.id} from curriculum 559 to 503.")
                    ta.curriculum_row_id = 503
                    ta.save()
                    
    # 2. Update StudentSubjectBatches
    ssb_updated = StudentSubjectBatch.objects.filter(curriculum_row_id=559).update(curriculum_row_id=503)
    print(f"\nUpdated {ssb_updated} StudentSubjectBatch records from 559 to 503.")
    
    # 3. Update TimetableAssignments
    tta_updated = TimetableAssignment.objects.filter(curriculum_row_id=559).update(curriculum_row_id=503)
    print(f"Updated {tta_updated} TimetableAssignment records from 559 to 503.")
    
    # 4. Delete the duplicate curriculum rows
    deleted_count, _ = CurriculumDepartment.objects.filter(id__in=[556, 557, 558, 559]).delete()
    print(f"Deleted {deleted_count} duplicate CurriculumDepartment rows (556, 557, 558, 559).")
    
    print("\nCleanup successfully completed!")

if __name__ == "__main__":
    run_cleanup()
