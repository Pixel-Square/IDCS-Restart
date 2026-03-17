import os
import sys
import django
import logging

# Add backend to path so we can import modules
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from applications.models import Application
from applications.services import approval_engine
from applications.serializers.application import ApplicationDetailSerializer, _is_gatepass_application, _extract_time_window

def debug_sla(app_id):
    try:
        app = Application.objects.get(pk=app_id)
        if not app:
            print(f"Application #{app_id} not found.")
            return

        print(f"Checking Application #{app.id} (Type: {app.application_type.name})")
        print(f"Current State: {app.current_state}")

        # 1. Is _is_gatepass_application True?
        is_gp = _is_gatepass_application(app)
        print(f"Is Gatepass Application? {is_gp}")

        # 2. Window Extraction
        window = _extract_time_window(app)
        print(f"Extracted Time Window: {window}")

        # 3. SLA Deadline
        serializer = ApplicationDetailSerializer(app)
        deadline = serializer.get_sla_deadline(app)
        print(f"Calculated SLA Deadline: {deadline}")

    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    debug_sla(10)
