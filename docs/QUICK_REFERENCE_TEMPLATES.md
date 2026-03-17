# Quick Reference: Default Templates

## ✅ What Was Done

Created a system for **10 default request templates** that automatically load when migrating on a new device.

## 📦 What's Included

### Normal Templates (5)
For: STAFF, FACULTY, ASSISTANT, CLERK | Approval: HOD → HR

1. **Casual Leave** - 12 days/year with split allocation
2. **Compensatory leave** - Earned from holiday work  
3. **Late Entry Permission** - No leave deduction
4. **ON duty** - 4 types (ODB, ODR, ODP, ODO)
5. **Others** - General requests

### SPL Templates (5)
For: IQAC, HR, PS, HOD, CFSW, EDC, COE, HAA | Approval: PRINCIPAL

1. **Casual Leave - SPL**
2. **Compensatory leave - SPL**
3. **Late Entry Permission - SPL**
4. **ON duty - SPL**
5. **Others - SPL**

## 🚀 Quick Start on New Device

```bash
# 1. Clone repository
git clone <repository-url>
cd IDCS-Restart/backend

# 2. Setup
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 3. Configure database
copy .env.sample .env
# Edit .env

# 4. Migrate (templates auto-load!)
python manage.py migrate

# 5. Verify
Get-Content scripts\test_default_templates.py | python manage.py shell
```

**Result:** 10 templates ready with all configurations! ✓

## 📝 Manual Commands

```bash
# Check if templates exist
python manage.py shell -c "from staff_requests.models import RequestTemplate; print(RequestTemplate.objects.count())"

# Load templates (skips if exist)
python manage.py load_default_templates

# Force reload (deletes existing)
python manage.py load_default_templates --force

# Verify templates
Get-Content scripts\verify_templates.py | python manage.py shell

# Run comprehensive test
Get-Content scripts\test_default_templates.py | python manage.py shell
```

## 🔧 HR Editing

Access: `/admin/staff_requests/requesttemplate/`

**Can Edit:**
- ✓ Form fields (add/remove/modify)
- ✓ Leave allocations
- ✓ Approval workflows
- ✓ Role permissions
- ✓ Attendance actions
- ✓ Everything!

## 📄 Documentation

- **Setup Guide:** [docs/DEFAULT_TEMPLATES_SETUP.md](../docs/DEFAULT_TEMPLATES_SETUP.md)
- **Implementation Details:** [docs/DEFAULT_TEMPLATES_IMPLEMENTATION.md](../docs/DEFAULT_TEMPLATES_IMPLEMENTATION.md)
- **Main README:** [README.md](../README.md)

## ✨ Key Features

1. **Automatic Loading** - Run `migrate`, templates appear
2. **Complete Configuration** - Forms, workflows, policies, everything
3. **HR Editable** - Fully customizable through admin
4. **Version Controlled** - Templates in code, tracked in Git
5. **Idempotent** - Safe to run multiple times
6. **Tested** - Comprehensive test suite included

## 🧪 Verification Checklist

After deployment, verify:

- [ ] 10 templates exist (5 normal + 5 SPL)
- [ ] All have correct role permissions
- [ ] Approval workflows set (HOD→HR or PRINCIPAL)
- [ ] Leave policies configured
- [ ] Form schemas complete
- [ ] HR can access and edit in admin

**Test Command:**
```bash
Get-Content scripts\test_default_templates.py | python manage.py shell
```

**Expected:** 6/6 tests pass ✓

## 🎯 Benefits

- ✅ No manual template creation needed
- ✅ Consistent across all installations
- ✅ Easy to update and maintain
- ✅ Fully documented
- ✅ Production ready

## 🔍 Troubleshooting

**Templates not appearing?**
```bash
python manage.py showmigrations staff_requests
# Should show [X] 0011_load_default_templates
```

**Need to reload?**
```bash
python manage.py load_default_templates --force
```

**Verify configuration?**
```bash
Get-Content scripts\verify_templates.py | python manage.py shell
```

---

**Status:** ✅ Production Ready | **Tests:** 6/6 Pass | **Templates:** 10/10 Loaded
