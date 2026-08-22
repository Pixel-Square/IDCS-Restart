import sys
import json

from academics.models import TeachingAssignment, Section, StaffProfile
from curriculum.models import CurriculumDepartment

dump_path = "/tmp/ta_dump.sql"

copying = False
to_insert = []
with open(dump_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line.startswith("COPY public.academics_teachingassignment"):
            copying = True
            continue
        if copying and line == "\\.":
            break
        if copying:
            parts = line.split('\t')
            def parse_val(v):
                return None if v == '\\N' else v

            try:
                ta_id = int(parts[0])
                is_active = parts[1] == 't'
                ac_yr = parse_val(parts[2])
                sec_id = parse_val(parts[3])
                staff_id = parse_val(parts[4])
                sub_id = parse_val(parts[5])
                cr_id = parse_val(parts[6])
                elec_id = parse_val(parts[7])
                cus_sub = parse_val(parts[8])
                assessments_str = parse_val(parts[9])
                
                assessments = []
                if assessments_str:
                    try:
                        assessments = json.loads(assessments_str)
                    except:
                        pass
                
                to_insert.append({
                    'id': ta_id,
                    'is_active': is_active,
                    'academic_year_id': ac_yr,
                    'section_id': sec_id,
                    'staff_id': staff_id,
                    'subject_id': sub_id,
                    'curriculum_row_id': cr_id,
                    'elective_subject_id': elec_id,
                    'custom_subject': cus_sub,
                    'enabled_assessments': assessments
                })
            except Exception as e:
                print(f"Error parsing line: {line} -> {e}")

existing_ids = set(TeachingAssignment.objects.values_list('id', flat=True))
missing = [r for r in to_insert if r['id'] not in existing_ids]

print(f"Found {len(missing)} missing rows to restore.")

# Validate foreign keys
valid_sec_ids = set(Section.objects.values_list('id', flat=True))
valid_staff_ids = set(StaffProfile.objects.values_list('id', flat=True))
valid_cr_ids = set(CurriculumDepartment.objects.values_list('id', flat=True))

objs = []
skipped = 0
for m in missing:
    if m['section_id'] and int(m['section_id']) not in valid_sec_ids:
        skipped += 1
        continue
    if m['staff_id'] and int(m['staff_id']) not in valid_staff_ids:
        skipped += 1
        continue
    if m['curriculum_row_id'] and int(m['curriculum_row_id']) not in valid_cr_ids:
        skipped += 1
        continue
    
    objs.append(TeachingAssignment(**m))

if objs:
    TeachingAssignment.objects.bulk_create(objs)
    print(f"Restore complete. Restored {len(objs)} rows. Skipped {skipped} rows due to missing foreign keys.")
else:
    print("Nothing to restore.")
