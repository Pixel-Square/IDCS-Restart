import csv

from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpResponse
from django.shortcuts import render

from .permissions import can_access_reporting
from .services import query_reporting_view


@staff_member_required
def powerbi_exports_home(request):
    if not can_access_reporting(request.user):
        return render(
            request,
            'admin/reporting/powerbi_exports.html',
            {
                'title': 'Power BI Exports',
                'forbidden': True,
            },
            status=403,
        )

    return render(
        request,
        'admin/reporting/powerbi_exports.html',
        {
            'title': 'Power BI Exports',
            'forbidden': False,
        },
    )


@staff_member_required
def export_csv(request, format_key: str):
    if not can_access_reporting(request.user):
        return HttpResponse('Forbidden', status=403)

    filters = {
        'year': request.GET.get('year'),
        'sem': request.GET.get('sem'),
        'dept': request.GET.get('dept'),
        'sec': request.GET.get('sec'),
        'course_type': request.GET.get('course_type'),
        'course_code': request.GET.get('course_code'),
        'course_category': request.GET.get('course_category'),
    }

    try:
        result = query_reporting_view(
            format_key=format_key,
            filters=filters,
            page=1,
            page_size=200000,
        )
    except ValueError as exc:
        return HttpResponse(str(exc), status=400)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="powerbi_{format_key}_export.csv"'

    writer = csv.writer(response)
    writer.writerow(result.columns)
    for row in result.rows:
        writer.writerow([row.get(c) for c in result.columns])

    return response
