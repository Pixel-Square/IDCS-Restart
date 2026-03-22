import os, sys, django
sys.path.append(r"c:\Users\sharu\IDCS-Restart\backend")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "erp.settings")
django.setup()
from OBE.models import ObeDueSchedule, ObeGlobalPublishControl, ObeAssessmentControl
from datetime import timedelta
from django.utils import timezone
now = timezone.now()
ObeDueSchedule.objects.update(due_at=now + timedelta(days=365))
ObeGlobalPublishControl.objects.update(is_open=True)
ObeAssessmentControl.objects.update(is_enabled=True, is_open=True)
print("Successfully extended OBE mark entry due dates by 365 days.")
