from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import CdapRevision, CdapActiveLearningAnalysisMapping
from .services.cdap_parser import parse_cdap_excel
from .services.articulation_parser import parse_articulation_matrix_excel
from .services.articulation_from_revision import build_articulation_matrix_from_revision_rows
from accounts.utils import get_user_permissions


def _require_permissions(request, required_codes: set[str]):
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    if getattr(user, 'is_superuser', False):
        return None

    user_perms = set(get_user_permissions(user))
    if user_perms.intersection(required_codes):
        return None

    needed = ', '.join(sorted(required_codes))
    return Response({'detail': f'Permission required: {needed}.'}, status=status.HTTP_403_FORBIDDEN)


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def upload_cdap(request):
    auth = _require_permissions(request, {'obe.cdap.upload'})
    if auth:
        return auth
    if 'file' not in request.FILES:
        return Response({'detail': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)
    parsed = parse_cdap_excel(request.FILES['file'])
    return Response(parsed)


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def upload_articulation_matrix(request):
    auth = _require_permissions(request, {'obe.cdap.upload'})
    if auth:
        return auth
    if 'file' not in request.FILES:
        return Response({'detail': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)
    parsed = parse_articulation_matrix_excel(request.FILES['file'])
    return Response(parsed)


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cdap_revision(request, subject_id):
    required = {'obe.view'} if request.method == 'GET' else {'obe.cdap.upload'}
    auth = _require_permissions(request, required)
    if auth:
        return auth

    if request.method == 'GET':
        rev = CdapRevision.objects.filter(subject_id=subject_id).first()
        if not rev:
            return Response({
                'subject_id': str(subject_id),
                'status': 'draft',
                'rows': [],
                'books': {'textbook': '', 'reference': ''},
                'active_learning': {'grid': [], 'dropdowns': []},
            })
        return Response({
            'subject_id': str(rev.subject_id),
            'status': rev.status,
            'rows': rev.rows,
            'books': rev.books,
            'active_learning': rev.active_learning,
        })

    body = request.data or {}
    if body is None:
        return Response({'detail': 'Invalid JSON'}, status=status.HTTP_400_BAD_REQUEST)

    defaults = {
        'rows': body.get('rows', []),
        'books': body.get('books', {}),
        'active_learning': body.get('active_learning', {}),
        'status': body.get('status', 'draft'),
        'updated_by': getattr(request.user, 'id', None),
    }

    obj = CdapRevision.objects.filter(subject_id=subject_id).first()
    if obj:
        for k, v in defaults.items():
            setattr(obj, k, v)
        obj.save(update_fields=list(defaults.keys()) + ['updated_at'])
    else:
        obj = CdapRevision(subject_id=subject_id, created_by=getattr(request.user, 'id', None), **defaults)
        obj.save()

    return Response({
        'subject_id': str(obj.subject_id),
        'status': obj.status,
        'rows': obj.rows,
        'books': obj.books,
        'active_learning': obj.active_learning,
    })


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def active_learning_mapping(request):
    required = {'obe.view'} if request.method == 'GET' else {'obe.master.manage'}
    auth = _require_permissions(request, required)
    if auth:
        return auth

    row = CdapActiveLearningAnalysisMapping.objects.filter(id=1).first()

    if request.method == 'GET':
        return Response({
            'mapping': row.mapping if row else {},
            'updated_at': row.updated_at.isoformat() if row and row.updated_at else None,
        })

    body = request.data or {}
    if body is None:
        return Response({'detail': 'Invalid JSON'}, status=status.HTTP_400_BAD_REQUEST)

    mapping = body.get('mapping', {})
    if row:
        row.mapping = mapping
        row.updated_by = getattr(request.user, 'id', None)
        row.save(update_fields=['mapping', 'updated_by', 'updated_at'])
    else:
        row = CdapActiveLearningAnalysisMapping(id=1, mapping=mapping, updated_by=getattr(request.user, 'id', None))
        row.save()

    return Response({'mapping': row.mapping, 'updated_at': row.updated_at.isoformat()})


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def articulation_matrix(request, subject_id: str):
    auth = _require_permissions(request, {'obe.view'})
    if auth:
        return auth

    rev = CdapRevision.objects.filter(subject_id=subject_id).first()
    rows = []
    extras = {}
    if rev and isinstance(rev.rows, list):
        rows = rev.rows

    if rev and isinstance(getattr(rev, 'active_learning', None), dict):
        maybe = rev.active_learning.get('articulation_extras')
        if isinstance(maybe, dict):
            extras = maybe

    matrix = build_articulation_matrix_from_revision_rows(rows)

    # Merge assessment rows (SSA / Active Learning / Special activity) extracted from page-2
    if extras and isinstance(matrix.get('units'), list):
        for u in matrix['units']:
            unit_label = str(u.get('unit') or '')
            picked = extras.get(unit_label)
            if not isinstance(picked, list) or not picked:
                continue
            base_rows = u.get('rows') or []
            # append at bottom with fresh serials
            next_serial = 0
            try:
                next_serial = max(int(r.get('s_no') or 0) for r in base_rows) if base_rows else 0
            except Exception:
                next_serial = len(base_rows)
            for rr in picked:
                next_serial += 1
                u.setdefault('rows', []).append({
                    'excel_row': rr.get('excel_row'),
                    's_no': next_serial,
                    'co_mapped': rr.get('co_mapped') or rr.get('co_mapped'.upper()) or rr.get('co') or rr.get('label') or '',
                    'topic_no': rr.get('topic_no') or '',
                    'topic_name': rr.get('topic_name') or rr.get('topic') or '',
                    'po': rr.get('po') or [],
                    'pso': rr.get('pso') or [],
                    'hours': rr.get('hours') or rr.get('class_session_hours') or '',
                })

    matrix['meta'] = {**(matrix.get('meta') or {}), 'subject_id': str(subject_id)}
    return Response(matrix)
