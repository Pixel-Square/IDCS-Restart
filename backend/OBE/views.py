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
    if rev and isinstance(rev.rows, list):
        rows = rev.rows

    matrix = build_articulation_matrix_from_revision_rows(rows)

    # Get global mapping from OBE Master
    global_mapping_row = CdapActiveLearningAnalysisMapping.objects.filter(id=1).first()
    global_mapping = global_mapping_row.mapping if global_mapping_row and isinstance(global_mapping_row.mapping, dict) else {}

    # Activity labels used in OBE Master
    activity_labels = {
        'SSA1': 'SSA 1',
        'SSA2': 'SSA 2',
        'ACTIVE LEARNING 1 (SKILL)': 'Active Learning 1',
        'ACTIVE LEARNING 2 (SKILL)': 'Active Learning 2',
        'ACTIVE LEARNING 1 (ATTITUDE)': 'Active Learning 1',
        'ACTIVE LEARNING 2 (ATTITUDE)': 'Active Learning 2',
        'SPECIAL ACTIVITY': 'Special activity',
    }

    # Apply global mapping to units 1-4 (CO1-CO2 use set 1, CO3-CO4 use set 2)
    if global_mapping and isinstance(matrix.get('units'), list):
        for u in matrix['units']:
            unit_idx = u.get('unit_index', 0)
            if unit_idx not in [1, 2, 3, 4]:
                continue
            
            # Determine which set: CO1-2 uses set 1, CO3-4 uses set 2
            use_set_2 = unit_idx in [3, 4]
            
            base_rows = u.get('rows') or []
            next_serial = 0
            try:
                next_serial = max(int(r.get('s_no') or 0) for r in base_rows) if base_rows else 0
            except Exception:
                next_serial = len(base_rows)
            
            # Add three rows: SSA, Active Learning, Special Activity
            activities_to_add = [
                ('SSA2' if use_set_2 else 'SSA1', 'SSA 2' if use_set_2 else 'SSA 1', 2),
                ('ACTIVE LEARNING 2 (SKILL)' if use_set_2 else 'ACTIVE LEARNING 1 (SKILL)', 
                 'Active Learning 2' if use_set_2 else 'Active Learning 1', 2),
                ('SPECIAL ACTIVITY', 'Special activity', 0),
            ]
            
            for mapping_key, display_label, default_hours in activities_to_add:
                next_serial += 1
                
                # Get PO mapping from global mapping (array of 11 booleans)
                po_mapping = global_mapping.get(mapping_key, [])
                if not isinstance(po_mapping, list):
                    po_mapping = []
                
                # Convert boolean mapping to hours (if checked, use default_hours, else '-')
                po_vals = []
                for i in range(11):
                    is_checked = po_mapping[i] if i < len(po_mapping) else False
                    po_vals.append(default_hours if is_checked else '-')
                
                # PSO values (always '-' for now, can be enhanced later)
                pso_vals = ['-', '-', '-']
                
                u.setdefault('rows', []).append({
                    'excel_row': None,
                    's_no': next_serial,
                    'co_mapped': display_label,
                    'topic_no': '-',
                    'topic_name': display_label.upper(),
                    'po': po_vals,
                    'pso': pso_vals,
                    'hours': default_hours if default_hours else '-',
                })

    matrix['meta'] = {**(matrix.get('meta') or {}), 'subject_id': str(subject_id)}
    return Response(matrix)
