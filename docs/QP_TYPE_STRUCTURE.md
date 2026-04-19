# QP Type Database Structure

## Overview
The QP (Question Paper) Type system has been restructured to separate concerns and provide a cleaner data model:

1. **QP Type** - Master table for exam types (SSA, CIA, MODEL, LAB, etc.)
2. **Question** - Individual question records with marks, BTL, CO mapping
3. **QP Assignment** - Junction table linking Class Types to QP Types to Exam Assignments
4. **QP Pattern** - Template storing the question structure (still used, but now properly organized)

## Database Models

### 1. AcV2QpType (NEW)
**Master table for Question Paper Types**

```python
class AcV2QpType(models.Model):
    id: UUID
    name: str (e.g., "SSA-1", "CIA-1", "MODEL EXAM")  # Unique
    code: str (e.g., "SSA", "CIA", "MODEL")  # Unique
    description: str
    is_active: bool
    college: FK -> College (optional, for multi-tenant)
    created_at: datetime
    updated_at: datetime
    updated_by: FK -> User
```

**Purpose:**
- Centralized master data for exam types
- Can be referenced from multiple class types and exam assignments
- Eliminates string duplication across the system

**Database Table:** `acv2_qp_type`

---

### 2. AcV2Question (NEW)
**Individual question within a QP Pattern**

```python
class AcV2Question(models.Model):
    id: UUID
    qp_pattern: FK -> AcV2QpPattern  # Parent pattern
    title: str (e.g., "Q1", "Part A - Q1")
    max_marks: Decimal
    btl_level: int (1-6, optional)  # Bloom's Taxonomy Level
    co_number: int (optional)  # Course Outcome number
    is_enabled: bool  # Whether question is active
    order: int  # Sequence in pattern
    created_at: datetime
    updated_at: datetime
    updated_by: FK -> User
```

**Purpose:**
- Properly normalizes question data (was stored as JSON arrays in QP Pattern)
- Allows individual question management
- Enables row-level permissions and auditing
- Easier to query/filter by CO, BTL, or enabled status

**Database Table:** `acv2_question`

---

### 3. AcV2QpAssignment (NEW)
**Junction table: Class Type → QP Type → Exam Assignment**

```python
class AcV2QpAssignment(models.Model):
    id: UUID
    class_type: FK -> AcV2ClassType  # e.g., THEORY, LAB, TCPR
    qp_type: FK -> AcV2QpType  # e.g., SSA-1, CIA-1
    exam_assignment: FK -> AcV2ExamAssignment (optional)
    weight: Decimal  # % weight for this exam type
    is_active: bool
    config: JSON  # Optional exam-specific config
    created_at: datetime
    updated_at: datetime
    updated_by: FK -> User
```

**Purpose:**
- Defines which QP Types are used in which Class Types
- Links to specific Exam Assignments for courses
- Stores exam-specific configuration
- Maintains the relationship: ClassType has many QpTypes, QpTypes have many ExamAssignments

**Database Table:** `acv2_qp_assignment`

---

### 4. AcV2QpPattern (UPDATED)
**Template storing question structure**

```python
class AcV2QpPattern(models.Model):
    id: UUID
    name: str
    default_weight: Decimal
    qp_type: str  # Will be deprecated - use AcV2QpType FK instead
    class_type: FK -> AcV2ClassType (optional)
    pattern: JSON  # Legacy - will migrate to AcV2Question rows
    batch: FK -> Batch (optional)
    college: FK -> College (optional)
    is_active: bool
    questions: Reverse FK -> AcV2Question[]  # NEW relationship
```

**Purpose:**
- Still contains the template/structure of questions
- Now has explicit questions through AcV2Question model
- Pattern JSON will be gradually migrated to individual Question rows

---

## Data Model Relationships

```
AcV2ClassType
    ├── exam_assignments: JSON (legacy)
    └── qp_assignments: FK -> AcV2QpAssignment[]
            ├── qp_type: FK -> AcV2QpType
            │   ├── name (e.g., "SSA-1")
            │   └── code (e.g., "SSA")
            ├── exam_assignment: FK -> AcV2ExamAssignment (optional)
            └── config: JSON

AcV2QpPattern
    ├── class_type: FK -> AcV2ClassType (optional)
    ├── pattern: JSON (legacy structure)
    └── questions: FK -> AcV2Question[]
            ├── title (e.g., "Q1")
            ├── max_marks
            ├── btl_level (1-6)
            ├── co_number
            └── is_enabled
```

---

## Migration Guide

### For Existing Data

1. **QP Types** - Create master QpType records from existing qp_type strings
   ```python
   # Extract unique qp_type values from AcV2QpPattern and AcV2ExamAssignment
   # Create AcV2QpType records
   AcV2QpType.objects.create(name="SSA-1", code="SSA", is_active=True)
   AcV2QpType.objects.create(name="CIA-1", code="CIA", is_active=True)
   # ... etc
   ```

2. **Questions** - Migrate from pattern JSON to AcV2Question rows
   ```python
   # For each AcV2QpPattern
   pattern = AcV2QpPattern.objects.get(id=...)
   p = pattern.pattern or {}
   for i, title in enumerate(p.get('titles', [])):
       AcV2Question.objects.create(
           qp_pattern=pattern,
           title=title,
           max_marks=p['marks'][i],
           btl_level=p['btls'][i] if i < len(p['btls']) else None,
           co_number=p['cos'][i] if i < len(p['cos']) else None,
           is_enabled=p['enabled'][i] if i < len(p['enabled']) else True,
           order=i
       )
   ```

3. **QP Assignments** - Link Class Types to QP Types
   ```python
   # For each exam in AcV2ClassType.exam_assignments
   for exam_config in class_type.exam_assignments:
       qp_type_obj = AcV2QpType.objects.get(code=exam_config['qp_type'])
       AcV2QpAssignment.objects.create(
           class_type=class_type,
           qp_type=qp_type_obj,
           weight=exam_config['weight'],
           is_active=exam_config.get('enabled', True),
           config={
               'covered_cos': exam_config.get('covered_cos', []),
               'allow_customize': exam_config.get('allow_customize', False)
           }
       )
   ```

---

## API Usage

### Get QP Types
```python
# Get all active QP types
qp_types = AcV2QpType.objects.filter(is_active=True)

# Get by code
ssa_type = AcV2QpType.objects.get(code="SSA")
```

### Get Questions in a Pattern
```python
# Get all enabled questions ordered
questions = pattern.questions.filter(is_enabled=True).order_by('order')

# Get questions for a specific CO
co1_questions = pattern.questions.filter(co_number=1, is_enabled=True)

# Calculate total marks
total = sum(q.max_marks for q in pattern.questions.filter(is_enabled=True))
```

### Get Assignments for a Class Type
```python
# Get all QP assignments
assignments = class_type.qp_assignments.filter(is_active=True)

# Get specific QP type for this class type
ssa_assignment = class_type.qp_assignments.get(qp_type__code="SSA")
```

---

## Benefits

1. **Data Normalization**
   - QP Types are master data (no duplication)
   - Questions are first-class objects (not just JSON arrays)

2. **Flexibility**
   - Easy to query questions by CO, BTL, or enabled status
   - Can add question-level attributes (difficulty, reference, author, etc.)

3. **Auditability**
   - Track who created/updated questions
   - Maintain question history

4. **Maintainability**
   - Cleaner data model
   - Easier to extend with new features
   - Better database performance with proper indexes

5. **Reusability**
   - Same QP Type used across multiple class types
   - Same question structure applied to different courses

---

## Migration Steps (Backcompat)

### Phase 1: Parallel Storage (Current)
- Keep existing JSON structures
- Populate new tables
- Gradually migrate frontend/backend to use new models

### Phase 2: Deprecation
- Mark old structures as deprecated
- Redirect all queries to new models
- Provide migration utilities

### Phase 3: Cleanup
- Remove legacy JSON fields
- Archive old data if needed

---

## Database Statistics

**New Tables:**
- `acv2_qp_type` - Master QP types
- `acv2_question` - Individual questions
- `acv2_qp_assignment` - Assignments

**Index Summary:**
- `acv2_qp_type`: (is_active, college), (is_active)
- `acv2_question`: (qp_pattern, order), (co_number), (is_enabled)
- `acv2_qp_assignment`: (class_type, qp_type), (is_active)

**Constraints:**
- QP Type: unique (name, college), unique (code, college)
- Question: unique (qp_pattern, order)
- QP Assignment: unique (class_type, qp_type, exam_assignment)
