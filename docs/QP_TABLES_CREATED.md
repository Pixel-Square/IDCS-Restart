# QP Type Database Tables - Created

## ✅ Tables Successfully Created

### 1. acv2_qp_type (QP Type Master Table)

**Purpose:** Master data for Question Paper Types (SSA, CIA, MODEL, LAB, etc.)

**Columns:**
```
id                  UUID          PRIMARY KEY
name               VARCHAR(100)   UNIQUE - Type name (e.g., "SSA-1", "CIA-1")
code               VARCHAR(20)    UNIQUE - Type code (e.g., "SSA", "CIA")
description        TEXT           Optional description
is_active          BOOLEAN        Default: TRUE
college_id         UUID           FOREIGN KEY (nullable) - Multi-tenant support
created_at         DATETIME       Auto-set
updated_at         DATETIME       Auto-updated
updated_by_id      UUID           FOREIGN KEY to User (nullable)
```

**Indexes:**
- (is_active, college_id)
- (name) - UNIQUE
- (code) - UNIQUE

**Constraints:**
- Unique on (name, college_id) when college is not null
- Unique on (code, college_id) when college is not null

---

### 2. acv2_question (Individual Question Model)

**Purpose:** Stores individual questions with marks, BTL, and CO mapping

**Columns:**
```
id                  UUID          PRIMARY KEY
qp_pattern_id       UUID          FOREIGN KEY -> AcV2QpPattern (required)
title              VARCHAR(255)   Question title (e.g., "Q1", "Part A - Q1")
max_marks          DECIMAL(5,2)   Maximum marks for this question
btl_level          INTEGER        BTL Level (1-6) - nullable
co_number          INTEGER        Course Outcome number - nullable
is_enabled         BOOLEAN        Default: TRUE - Whether question is active
order              INTEGER        Default: 0 - Sequence in pattern
created_at         DATETIME       Auto-set
updated_at         DATETIME       Auto-updated
updated_by_id      UUID           FOREIGN KEY to User (nullable)
```

**Indexes:**
- (qp_pattern_id, order) - Composite
- (co_number)
- (is_enabled)

**Constraints:**
- Unique on (qp_pattern_id, order)
- Foreign Key: qp_pattern_id → acv2_qp_pattern.id (CASCADE)

**Ordering:** By order ASC (default)

---

### 3. acv2_qp_assignment (Assignment Junction Table)

**Purpose:** Links Class Types to QP Types to Exam Assignments

**Columns:**
```
id                    UUID          PRIMARY KEY
class_type_id         UUID          FOREIGN KEY -> AcV2ClassType (required)
qp_type_id           UUID          FOREIGN KEY -> AcV2QpType (required)
exam_assignment_id   UUID          FOREIGN KEY -> AcV2ExamAssignment (nullable)
weight               DECIMAL(5,2)  Percentage weight
is_active            BOOLEAN       Default: TRUE
config               JSON          Optional exam-specific configuration
created_at           DATETIME      Auto-set
updated_at           DATETIME      Auto-updated
updated_by_id        UUID          FOREIGN KEY to User (nullable)
```

**Indexes:**
- (class_type_id, qp_type_id) - Composite
- (is_active)

**Constraints:**
- Unique on (class_type_id, qp_type_id, exam_assignment_id)
- Foreign Keys:
  - class_type_id → acv2_classtype.id (CASCADE)
  - qp_type_id → acv2_qp_type.id (CASCADE)
  - exam_assignment_id → acv2_examassignment.id (SET_NULL, nullable)

**Ordering:** By class_type_id, qp_type_id

---

## Database Schema Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    acv2_qp_type (Master)                        │
│                    ───────────────────                           │
│ id (PK) | name | code | description | is_active | college_id   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                    ┌─────────┴─────────┐
                    │                   │
        ┌───────────┴──────┐  ┌────────┴──────────┐
        │                  │  │                   │
┌──────────────────────┐   │  │   ┌──────────────────────────┐
│ acv2_qp_assignment   │   │  │   │  acv2_classtype         │
│ ──────────────────   │   │  │   │  ─────────────          │
│ id (PK)              │───┘  │   │ id (PK)                 │
│ class_type_id (FK)────────┐ │   │ name, code, display_... │
│ qp_type_id (FK) ─────────┐ └ ─► │ total_internal_marks    │
│ exam_assignment_id (FK)  │      │ allow_customize_quest...│
│ weight               │      │ is_active               │
│ is_active            │      └─────────────────────────┘
│ config (JSON)        │
└──────────────────────┘
        │
        │
        ▼
┌──────────────────────────┐
│ acv2_examassignment      │
│ ────────────────────     │
│ id (PK)                  │
│ exam, qp_type, weight... │
└──────────────────────────┘


┌──────────────────────────────────┐
│     acv2_qp_pattern              │
│     ───────────────              │
│ id (PK)                          │
│ qp_type (legacy string)          │
│ class_type_id (FK, nullable)     │
│ pattern (JSON - legacy)          │
└──────────────────────────────────┘
              │
              ├──→ Many Questions
              │
              ▼
┌──────────────────────────────────┐
│      acv2_question               │
│      ──────────────              │
│ id (PK)                          │
│ qp_pattern_id (FK)               │
│ title, max_marks, btl_level      │
│ co_number, is_enabled, order     │
└──────────────────────────────────┘
```

---

## Django Admin Interface

All three tables are now registered in Django Admin with full CRUD functionality:

### QP Type Admin
- **URL:** `/admin/academic_v2/acv2qptype/`
- **Features:** List, filter by is_active/college, search by name/code
- **Fields:** name, code, description, college, is_active, updated_by, timestamps

### Question Admin
- **URL:** `/admin/academic_v2/acv2question/`
- **Features:** List with QP Pattern context, filter by enabled/BTL/CO, search
- **Fields:** qp_pattern, title, max_marks, btl_level, co_number, is_enabled, order
- **Inline Support:** Can edit questions directly in QP Pattern admin page

### QP Assignment Admin
- **URL:** `/admin/academic_v2/acv2qpassignment/`
- **Features:** List with full context, filter by active/class_type/qp_type
- **Fields:** class_type, qp_type, exam_assignment, weight, is_active, config
- **Search:** Search by class type name, QP type name, exam name

---

## How to Use

### 1. Create a QP Type (Master Data)

In Django Admin → Academic 2.1 → QP Types:
```
Name: SSA-1
Code: SSA
Description: School of Studies Assessment 1
Is Active: ✓
College: (optional)
```

### 2. Add Questions to a QP Pattern

In Django Admin → Academic 2.1 → QP Patterns:
- Click on a pattern
- Scroll to "Questions" section
- Click "Add Question"
- Fill in:
  - Title: Q1
  - Max Marks: 2
  - BTL Level: 2
  - CO Number: 1
  - Is Enabled: ✓
  - Order: 0

### 3. Create QP Assignments (Link Class Type → QP Type)

In Django Admin → Academic 2.1 → QP Assignments:
```
Class Type: THEORY
QP Type: SSA-1
Exam Assignment: (select from existing exams)
Weight: 5
Is Active: ✓
Config: {} (leave empty or add JSON config)
```

---

## SQL Schema (Reference)

### acv2_qp_type
```sql
CREATE TABLE acv2_qp_type (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    college_id UUID REFERENCES college_college(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by_id UUID REFERENCES auth_user(id) ON DELETE SET NULL
);
CREATE INDEX acv2_qp_type_is_active_college_idx ON acv2_qp_type(is_active, college_id);
```

### acv2_question
```sql
CREATE TABLE acv2_question (
    id UUID PRIMARY KEY,
    qp_pattern_id UUID NOT NULL REFERENCES acv2_qp_pattern(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    max_marks DECIMAL(5, 2),
    btl_level INTEGER CHECK (btl_level >= 1 AND btl_level <= 6),
    co_number INTEGER,
    is_enabled BOOLEAN DEFAULT TRUE,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by_id UUID REFERENCES auth_user(id) ON DELETE SET NULL,
    UNIQUE (qp_pattern_id, "order")
);
CREATE INDEX acv2_question_pattern_order_idx ON acv2_question(qp_pattern_id, "order");
CREATE INDEX acv2_question_co_number_idx ON acv2_question(co_number);
CREATE INDEX acv2_question_is_enabled_idx ON acv2_question(is_enabled);
```

### acv2_qp_assignment
```sql
CREATE TABLE acv2_qp_assignment (
    id UUID PRIMARY KEY,
    class_type_id UUID NOT NULL REFERENCES acv2_classtype(id) ON DELETE CASCADE,
    qp_type_id UUID NOT NULL REFERENCES acv2_qp_type(id) ON DELETE CASCADE,
    exam_assignment_id UUID REFERENCES acv2_examassignment(id) ON DELETE SET NULL,
    weight DECIMAL(5, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    config JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by_id UUID REFERENCES auth_user(id) ON DELETE SET NULL,
    UNIQUE (class_type_id, qp_type_id, exam_assignment_id)
);
CREATE INDEX acv2_qp_assignment_class_qp_idx ON acv2_qp_assignment(class_type_id, qp_type_id);
CREATE INDEX acv2_qp_assignment_is_active_idx ON acv2_qp_assignment(is_active);
```

---

## Data Migration (From Legacy System)

### Extract Unique QP Types from existing data
```python
# In Django shell
from academic_v2.models import AcV2QpPattern, AcV2QpType

# Get unique qp_types
qp_types = set()
for pattern in AcV2QpPattern.objects.all():
    if pattern.qp_type:
        qp_types.add(pattern.qp_type)

# Create QP Type records
for qp_code in sorted(qp_types):
    AcV2QpType.objects.get_or_create(
        code=qp_code.upper(),
        defaults={'name': f"{qp_code}-1", 'description': f"Type: {qp_code}"}
    )

print(f"Created {AcV2QpType.objects.count()} QP Types")
```

### Migrate Questions from JSON to individual records
```python
from academic_v2.models import AcV2QpPattern, AcV2Question

for pattern in AcV2QpPattern.objects.all():
    p = pattern.pattern or {}
    titles = p.get('titles', [])
    marks = p.get('marks', [])
    btls = p.get('btls', [])
    cos = p.get('cos', [])
    enabled = p.get('enabled', [])
    
    for i, title in enumerate(titles):
        AcV2Question.objects.create(
            qp_pattern=pattern,
            title=title,
            max_marks=marks[i] if i < len(marks) else 0,
            btl_level=btls[i] if i < len(btls) else None,
            co_number=cos[i] if i < len(cos) else None,
            is_enabled=enabled[i] if i < len(enabled) else True,
            order=i
        )
        
print("Question migration complete")
```

---

## Verification Checklist

- ✅ Tables created in database
- ✅ Django models registered in admin
- ✅ Foreign keys and indexes created
- ✅ Gunicorn restarted with new models
- ✅ Admin interface accessible
- ⏳ **Next:** Create sample data and API endpoints
