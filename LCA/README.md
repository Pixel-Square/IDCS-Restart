# LCA (Learning Content Analysis) Complete Module & Migration Package

This folder contains all **Frontend**, **Backend**, **Services**, **Migrations**, and **Database Data Fixtures** required to merge the LCA module into another branch or system.

---

## 📁 Package Directory Structure

```
LCA/
├── README.md                          # Merge & Integration Guide (this file)
├── load_lca_data.py                   # Automated Python Data Loader Script
├── data/
│   └── lca_fixture.json               # Full Database Data Fixture (JSON format)
├── frontend/
│   ├── pages/
│   │   ├── lca/
│   │   │   ├── LCAPage.tsx            # Main LCA Interactive Unit Breakdown & PBR Page
│   │   │   ├── COTargetPage.tsx       # Course Outcome Target Setting & Weighting Page
│   │   │   ├── CDAPPage.tsx           # Course Development & Action Plan Page
│   │   │   ├── ArticulationMatrixPage.tsx # CO to PO/PSO Mapping Matrix Page
│   │   │   └── LCAInstructionsPage.tsx   # LCA filling guidelines page
│   │   └── cdap/                      # Re-export proxies
│   │       ├── COTargetPage.tsx
│   │       ├── CDAPPage.tsx
│   │       └── ArticulationMatrixPage.tsx
│   ├── services/
│   │   └── lcaDb.ts                   # LCA API service calls
│   └── integration/
│       └── App_routes_snippet.tsx     # Route definitions snippet for App.tsx
└── backend/
    ├── models_lca.py                  # LCA & CDAP Django ORM Models
    ├── views_lca.py                   # LCA & CDAP API View Handlers
    ├── serializers_lca.py             # DRF Serializers
    ├── urls_lca.py                    # API URL Patterns
    ├── services/                      # Excel Parser & Articulation Matrix Generators
    │   ├── cdap_parser.py
    │   ├── articulation_parser.py
    │   └── articulation_from_revision.py
    └── migrations/                    # Database Migrations
        ├── 0031_lca_revision.py
        ├── 0051_co_target_revision.py
        └── 0001_lca_module_initial.py  # Consolidated initial migration
```

---

## 🚀 How to Merge into Another Branch/System (Step-by-Step)

### 1. Frontend Integration

1. **Copy Frontend Pages and Services:**
   - Copy `LCA/frontend/pages/lca/` -> `frontend/src/pages/lca/`
   - Copy `LCA/frontend/pages/cdap/` -> `frontend/src/pages/cdap/`
   - Copy `LCA/frontend/services/lcaDb.ts` -> `frontend/src/services/lcaDb.ts`

2. **Register Frontend Routes:**
   Add the following routes to `frontend/src/App.tsx`:
   ```tsx
   import LCAPage from './pages/lca/LCAPage';
   import COTargetPage from './pages/lca/COTargetPage';
   import CDAPPage from './pages/lca/CDAPPage';
   import ArticulationMatrixPage from './pages/lca/ArticulationMatrixPage';
   import LCAInstructionsPage from './pages/lca/LCAInstructionsPage';

   // Inside <Routes>:
   <Route path="/obe/course/:code/lca" element={<LCAPage />} />
   <Route path="/obe/course/:code/lca/pbr" element={<LCAPage />} />
   <Route path="/obe/course/:code/lca/cotarget" element={<COTargetPage />} />
   <Route path="/obe/course/:code/cdap" element={<CDAPPage />} />
   <Route path="/obe/course/:code/articulation" element={<ArticulationMatrixPage />} />
   <Route path="/obe/course/:code/lca/instructions" element={<LCAInstructionsPage />} />
   ```

3. **Check Dependencies:**
   Ensure `xlsx` is installed for PBR Excel parsing:
   ```bash
   npm install xlsx
   ```

---

### 2. Backend Integration

1. **Add Models to Backend (`backend/OBE/models.py` or equivalent):**
   Copy the model definitions from `LCA/backend/models_lca.py` (`LcaRevision`, `CoTargetRevision`, `CdapRevision`, `CdapActiveLearningAnalysisMapping`).

2. **Copy Helper Services:**
   Copy the files in `LCA/backend/services/` (`cdap_parser.py`, `articulation_parser.py`, `articulation_from_revision.py`) to `backend/OBE/services/`.

3. **Add Views & URLs:**
   Add the views from `LCA/backend/views_lca.py` to `backend/OBE/views.py` and register the URL patterns from `LCA/backend/urls_lca.py` into `backend/OBE/urls.py`.

4. **Run Database Migrations:**
   ```bash
   cd backend
   python manage.py makemigrations
   python manage.py migrate
   ```

---

### 3. Data Migration (Loading Existing LCA Data)

To load all current LCA records into your new database, run:

```bash
# Using Python CLI directly:
python LCA/load_lca_data.py

# OR using Django management command:
cd backend
python manage.py loaddata ../LCA/data/lca_fixture.json
```

---

## 🤖 AI Prompt to Merge Automatically on Target System

When moving this `LCA` folder to another system or branch, you can give the following prompt to an AI coding assistant on that system:

```text
Please merge the LCA module contained in the LCA/ folder into this repository:
1. Copy LCA/frontend/pages/lca and LCA/frontend/services/lcaDb.ts into frontend/src/.
2. Register the LCA routes in frontend/src/App.tsx.
3. Merge backend models from LCA/backend/models_lca.py into backend/OBE/models.py and API endpoints from LCA/backend/views_lca.py into backend/OBE/views.py & urls.py.
4. Copy LCA/backend/services/* into backend/OBE/services/.
5. Run `python manage.py migrate` to apply database tables.
6. Run `python manage.py loaddata LCA/data/lca_fixture.json` to migrate the existing LCA dataset.
```
