"""
Delete all StaffRequest and ApprovalLog records while preserving RequestTemplate entries.
Use with caution: this permanently deletes request submissions and their approval logs.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')

import django
from django.db import transaction

django.setup()

from staff_requests.models import StaffRequest, ApprovalLog, RequestTemplate


def main():
    print('Starting deletion of StaffRequest and ApprovalLog records...')

    total_requests = StaffRequest.objects.count()
    total_logs = ApprovalLog.objects.count()
    total_templates = RequestTemplate.objects.count()

    print(f'Found {total_requests} StaffRequest(s), {total_logs} ApprovalLog(s), and {total_templates} RequestTemplate(s).')

    if total_requests == 0 and total_logs == 0:
        print('Nothing to delete.')
        return

    with transaction.atomic():
        # Delete ApprovalLog entries first (not strictly necessary due to CASCADE, but explicit)
        deleted_logs, _ = ApprovalLog.objects.all().delete()
        # Delete StaffRequest entries
        deleted_requests, _ = StaffRequest.objects.all().delete()

    print(f'Deleted {deleted_logs} ApprovalLog entry(ies) and {deleted_requests} StaffRequest(s).')
    remaining_templates = RequestTemplate.objects.count()
    print(f'Remaining RequestTemplate count: {remaining_templates} (templates preserved).')


if __name__ == '__main__':
    main()
