from django.apps import apps
from django.http import JsonResponse
from django.urls import reverse, NoReverseMatch
from django.contrib.admin.views.decorators import staff_member_required


@staff_member_required
def admin_counts(request):
    """Return a JSON map of admin changelist URL -> object count.

    This endpoint is intended for the admin index dashboard to show
    live counts for each registered model.
    """
    data = {}
    for model in apps.get_models():
        try:
            admin_url = reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist")
        except NoReverseMatch:
            admin_url = None

        # Attempt to count objects for the model; on error return null
        try:
            count = model.objects.count()
        except Exception:
            count = None

        if admin_url:
            data[admin_url] = count

    return JsonResponse(data)
