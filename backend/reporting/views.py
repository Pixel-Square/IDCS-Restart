import csv

from django.http import HttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from .authentication import ReportingApiKeyAuthentication
from .permissions import HasReportingApiKey
from .services import query_reporting_view


def _filters_from_request(request):
    q = request.query_params
    return {
        'year': q.get('year'),
        'sem': q.get('sem'),
        'dept': q.get('dept'),
        'sec': q.get('sec'),
        'course_type': q.get('course_type'),
        'course_code': q.get('course_code'),
        'course_category': q.get('course_category'),
    }


def _as_csv_response(filename: str, columns: list[str], rows: list[dict]):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(columns)
    for row in rows:
        writer.writerow([row.get(c) for c in columns])
    return response


def _to_positive_int(raw, default: int) -> int:
    try:
        val = int(raw)
        return val if val > 0 else default
    except Exception:
        return default


def _mark_response(request, format_key: str, default_filename: str):
    filters = _filters_from_request(request)
    try:
        result = query_reporting_view(
            format_key=format_key,
            filters=filters,
            page=request.query_params.get('page'),
            page_size=request.query_params.get('page_size'),
        )
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)

    out_format = str(request.query_params.get('format', 'json')).strip().lower()
    if out_format == 'csv':
        return _as_csv_response(default_filename, result.columns, result.rows)

    page = _to_positive_int(request.query_params.get('page', 1), 1)
    page_size = _to_positive_int(request.query_params.get('page_size', 500), 500)
    return Response(
        {
            'format_key': format_key,
            'count': len(result.rows),
            'total': result.total,
            'page': page,
            'page_size': page_size,
            'columns': result.columns,
            'rows': result.rows,
        }
    )


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication])
@permission_classes([HasReportingApiKey])
def theory_marks(request):
    return _mark_response(request, 'theory', 'marks_theory.csv')


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication])
@permission_classes([HasReportingApiKey])
def tcpr_tcpl_marks(request):
    return _mark_response(request, 'tcpr-tcpl', 'marks_tcpr_tcpl.csv')


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication])
@permission_classes([HasReportingApiKey])
def project_lab_marks(request):
    return _mark_response(request, 'project-lab', 'marks_project_lab.csv')
