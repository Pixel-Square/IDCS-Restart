import csv
import logging

from django.http import HttpResponse
from django.db.utils import ProgrammingError
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication

from .authentication import ReportingApiKeyAuthentication
from .permissions import CanViewPowerBIDataOrApiKey
from .services import query_reporting_view
from .simple_query import get_simple_marks_data
# v2 reporting endpoints must use Academic 2.1 data only (avoid obe_* tables).
from .services_v2_acv2 import query_v2_marks

logger = logging.getLogger(__name__)


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
    page = _to_positive_int(request.query_params.get('page', 1), 1)
    page_size = _to_positive_int(request.query_params.get('page_size', 500), 500)
    
    try:
        result = query_reporting_view(
            format_key=format_key,
            filters=filters,
            page=page,
            page_size=page_size,
        )
    except ProgrammingError as e:
        # Views don't exist; use simple fallback query with real Academic 2.1 data
        if 'does not exist' in str(e).lower():
            logger.warning(f'Reporting view not found for {format_key}; using fallback query with Academic 2.1 data')
            data = get_simple_marks_data(page=page, page_size=page_size, filters=filters)
            out_format = str(request.query_params.get('format', 'json')).strip().lower()
            if out_format == 'csv':
                return _as_csv_response(default_filename, data['columns'], data['rows'])
            return Response({
                'format_key': format_key,
                'count': len(data['rows']),
                'total': data['total'],
                'page': page,
                'page_size': page_size,
                'columns': data['columns'],
                'rows': data['rows'],
            })
        raise
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)

    out_format = str(request.query_params.get('format', 'json')).strip().lower()
    if out_format == 'csv':
        return _as_csv_response(default_filename, result.columns, result.rows)

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
@authentication_classes([ReportingApiKeyAuthentication, JWTAuthentication])
@permission_classes([CanViewPowerBIDataOrApiKey])
def theory_marks(request):
    return _mark_response(request, 'theory', 'powerbi_theory_marks.csv')


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication, JWTAuthentication])
@permission_classes([CanViewPowerBIDataOrApiKey])
def tcpr_tcpl_marks(request):
    return _mark_response(request, 'tcpr-tcpl', 'powerbi_tcpr_tcpl_marks.csv')


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication, JWTAuthentication])
@permission_classes([CanViewPowerBIDataOrApiKey])
def project_lab_marks(request):
    return _mark_response(request, 'project-lab', 'powerbi_project_lab_marks.csv')


# ─────────────────────────────────────────────────────────────────────────────
# v2 endpoints — one row per student × course, with staff/mentor/attendance/COs
# ─────────────────────────────────────────────────────────────────────────────

def _v2_filters_from_request(request):
    q = request.query_params
    return {
        'year':        q.get('year'),
        'sem':         q.get('sem'),
        'dept':        q.get('dept'),
        'section':     q.get('section'),
        'course_code': q.get('course_code'),
    }


def _v2_mark_response(request, format_key: str):
    filters = _v2_filters_from_request(request)
    q = request.query_params
    try:
        result = query_v2_marks(
            format_key=format_key,
            filters=filters,
            page=q.get('page'),
            page_size=q.get('page_size'),
        )
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)

    page      = _to_positive_int(q.get('page', 1), 1)
    page_size = _to_positive_int(q.get('page_size', 500), 500)

    out_format = str(q.get('format', 'json')).strip().lower()
    if out_format == 'csv':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="powerbi_v2_{format_key}.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(result.columns)
        for row in result.rows:
            writer.writerow([row.get(c) for c in result.columns])
        return response

    return Response({
        'format_key': format_key,
        'count':      len(result.rows),
        'total':      result.total,
        'page':       page,
        'page_size':  page_size,
        'columns':    result.columns,
        'rows':       result.rows,
    })


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication, JWTAuthentication])
@permission_classes([CanViewPowerBIDataOrApiKey])
def v2_theory_marks(request):
    """API 1 — THEORY, PRBL, THEORY_PMBL.
    Columns: year, sem, dept, section, reg_no, student_name,
             course_type, course_code, course_category, course_name,
             course_staff_name, mentor_name, attendance_percentage,
             ssa1, ssa2, cia1, cia2, model_exam, internal_mark,
             co1, co2, co3, co4, co5
    """
    return _v2_mark_response(request, 'theory')


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication, JWTAuthentication])
@permission_classes([CanViewPowerBIDataOrApiKey])
def v2_tcpr_tcpl_marks(request):
    """API 2 — TCPR, TCPL.
    Columns: year, sem, dept, section, reg_no, student_name,
             course_type, course_code, course_category, course_name,
             course_staff_name, mentor_name, attendance_percentage,
             ssa1, ssa2, cia1, cia2, model_exam,
             formative1, formative2, lab_cia1, lab_cia2,
             final_internal, co1, co2, co3, co4, co5
    """
    return _v2_mark_response(request, 'tcpr-tcpl')


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication, JWTAuthentication])
@permission_classes([CanViewPowerBIDataOrApiKey])
def v2_project_lab_marks(request):
    """API 3 — PROJECT, LAB.
    Columns: year, sem, dept, section, reg_no, student_name,
             course_type, course_code, course_category, course_name,
             course_staff_name, mentor_name, attendance_percentage,
             review1, review2, formative1, formative2,
             lab_cia1, lab_cia2, lab_model,
             final_internal, co1, co2, co3, co4, co5
    """
    return _v2_mark_response(request, 'project-lab')


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication, JWTAuthentication])
@permission_classes([CanViewPowerBIDataOrApiKey])
def v2_pure_lab_marks(request):
    """API 4 — PURE_LAB.
    Columns: year, sem, dept, section, reg_no, student_name,
             course_type, course_code, course_category, course_name,
             course_staff_name, mentor_name, attendance_percentage,
             formative1, formative2, lab_cia1, lab_cia2, lab_model,
             final_internal, co1, co2, co3, co4, co5
    """
    return _v2_mark_response(request, 'pure-lab')


@api_view(['GET'])
@authentication_classes([ReportingApiKeyAuthentication, JWTAuthentication])
@permission_classes([CanViewPowerBIDataOrApiKey])
def v2_special_marks(request):
    """API 5 — SPECIAL (all assessment types; NULL where not applicable).
    Columns: year, sem, dept, section, reg_no, student_name,
             course_type, course_code, course_category, course_name,
             course_staff_name, mentor_name, attendance_percentage,
             ssa1, ssa2, cia1, cia2, model_exam,
             formative1, formative2, review1, review2,
             final_internal, co1, co2, co3, co4, co5
    """
    return _v2_mark_response(request, 'special')
