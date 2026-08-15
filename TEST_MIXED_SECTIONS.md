# Testing Mixed Sections Curriculum - Debug Guide

## Quick Test (Without Django)

### 1. Find a Mixed Section ID from Database

```bash
# SSH into server or use local Django shell
cd /home/iqac2/IDCS-Restart/backend
python3 manage.py shell
```

```python
from academics.models import MixedSection
# List all active mixed sections
for ms in MixedSection.objects.filter(is_active=True)[:5]:
    print(f"ID: {ms.id}, Name: {ms.name}, Batch: {ms.batch.name if ms.batch else 'None'}, Sections: {ms.sections.count()}")
```

Or via SQL:
```bash
sqlite3 backend/db.sqlite3 << 'EOF'
SELECT id, name, batch_id FROM academics_mixedsection LIMIT 5;
EOF
```

### 2. Test with Debug Mode

**Option A: Via cURL (from server)**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/api/timetable/curriculum-for-mixed-section/?mixed_section_id=1&debug=1"
```

**Option B: Via Python requests (in Django shell)**
```python
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User

# Get or create a token for a user
user = User.objects.first()  # or get specific user
token, _ = Token.objects.get_or_create(user=user)

client = APIClient()
client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
response = client.get('/api/timetable/curriculum-for-mixed-section/?mixed_section_id=1&debug=1')
import json
print(json.dumps(response.json(), indent=2))
```

**Option C: Check Django Logs**
After making the request above, check for detailed logs:
```bash
# If using gunicorn, check logs
tail -f /var/log/idcs/gunicorn.log | grep "MixedSection"

# Or check Django console output if running development server
```

## Expected Debug Output Structure

```json
{
  "results": [ /* courses found */ ],
  "debug": {
    "message": "Mixed section X: Deduplicated to Y courses from Z dept-sem pairs",
    "dept_sem_pairs": [[dept_id1, sem_num1], [dept_id2, sem_num2], ...],
    "dept_section_map": {
      "dept_id1": [["batch", null], ["section", 123, "A"], ...],
      "dept_id2": [["section", 456, "B"], ...]
    },
    "section_details": {
      "123": {"name": "A", "dept_id": 1, "sem": 3},
      "456": {"name": "B", "dept_id": 2, "sem": 3}
    },
    "courses_per_dept": {
      "dept_1_sem_3": 45,
      "dept_2_sem_3": 0,  /* <-- Check if 0 here! */
      "dept_1_sem_3: "ERROR: ..."
    },
    "chosen_sections": [
      {"id": 123, "name": "A"},
      {"id": 456, "name": "B"}
    ],
    "courses_count": 45
  }
}
```

## Diagnosis Guide

### ❌ If chosen sections' courses aren't showing:

#### 1. Check dept_section_map
- **Issue**: Chosen sections are empty or show `null` departments?
  - Problem: Sections don't have batch or department set
  - Fix: Verify Section.batch and Section.batch.department are properly configured in database

#### 2. Check section_details  
- **Issue**: Shows `"error": "No department found"` for a section?
  - Problem: Section's batch doesn't have course.department or batch.department
  - Solution: Query database:
  ```sql
  SELECT s.id, s.name, s.batch_id, b.course_id, b.department_id 
  FROM academics_section s 
  LEFT JOIN academics_batch b ON s.batch_id = b.id 
  WHERE s.id = <section_id>;
  ```

#### 3. Check courses_per_dept
- **Issue**: Shows 0 courses for a department?
  - Problem: CurriculumDepartment table doesn't have records for that department
  - Solution: Check curriculum data:
  ```sql
  SELECT COUNT(*) FROM curriculum_curriculumdepartment 
  WHERE department_id = <dept_id> AND semester_id = <sem_id>;
  ```

#### 4. Check results count
- **Issue**: courses_count is low or 0?
  - Problem: Either department resolution failed OR curriculum data is missing
  - Next step: Check dept_sem_pairs to see what was queried

## Detailed Testing Steps

### Step 1: List Mixed Sections
```bash
python3 manage.py shell << 'EOF'
from academics.models import MixedSection, Section
ms = MixedSection.objects.filter(is_active=True).first()
print(f"Mixed Section: {ms.id} - {ms.name}")
print(f"Batch: {ms.batch.id} - {ms.batch.name}")
print(f"Batch Department: {ms.batch.course.department if ms.batch.course else ms.batch.department}")
print(f"Semester: {ms.semester.number if ms.semester else 'None'}")
print(f"\nChosen Sections ({ms.sections.count()}):")
for s in ms.sections.all():
    print(f"  - {s.id} ({s.name}) -> Batch {s.batch_id}, Dept {s.batch.course.department if s.batch.course else s.batch.department}")
EOF
```

### Step 2: Test API with Debug
```bash
MIXED_SECTION_ID=1  # Change this
curl -s "http://localhost:8000/api/timetable/curriculum-for-mixed-section/?mixed_section_id=${MIXED_SECTION_ID}&debug=1" \
  -H "Authorization: Bearer <token>" | python3 -m json.tool
```

### Step 3: Analyze Logs
Look for patterns:
- ✅ `✓ Resolved dept` - department found for section
- ⚠️  `Could not resolve department for chosen section` - department missing
- ℹ️  `Found X courses` - curriculum data found for department

## Common Issues & Fixes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Batch courses show, chosen sections don't | Chosen section dept not in CurriculumDepartment | Import curriculum for that department |
| dept_sem_pairs is empty | Batch and all sections missing departments | Set batch.department or batch.course.department |
| courses_count is 0 | All queries returned 0 results | Check if CurriculumDepartment has data for semester |
| section_details shows errors | Sections not properly linked to batch | Update section.batch FK in database |

## Log Level Configuration

To see more detailed logs, update Django settings:

```python
# In settings.py, add or update:
LOGGING = {
    'version': 1,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'loggers': {
        'timetable.views': {
            'level': 'INFO',
            'handlers': ['console'],
        },
    },
}
```

Then restart gunicorn or dev server to apply.
