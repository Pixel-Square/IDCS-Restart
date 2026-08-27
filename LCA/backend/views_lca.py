import os
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models_lca import LcaRevision, CoTargetRevision, CdapRevision, CdapActiveLearningAnalysisMapping
from .services.cdap_parser import parse_cdap_excel, parse_articulation_matrix_excel
from .services.articulation_from_revision import build_articulation_matrix_from_revision_rows

def _require_permissions(request, required_codes: set[str]):
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return Response({'detail': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
    if getattr(user, 'is_superuser', False):
        return None
    # Best effort permission check
    return None

@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def lca_revision(request, subject_id):
    if request.method == 'GET':
        rev = LcaRevision.objects.filter(subject_id=subject_id).first()
        if not rev:
            return Response({'subject_id': str(subject_id), 'status': 'draft', 'data': {}})
        return Response({'subject_id': str(rev.subject_id), 'status': rev.status, 'data': rev.data})

    body = request.data or {}
    defaults = {
        'data': body.get('data', {}),
        'status': body.get('status', 'draft'),
        'updated_by': getattr(request.user, 'id', None),
    }

    obj = LcaRevision.objects.filter(subject_id=subject_id).first()
    if obj:
        for k, v in defaults.items():
            setattr(obj, k, v)
        obj.save(update_fields=list(defaults.keys()) + ['updated_at'])
    else:
        obj = LcaRevision(subject_id=subject_id, created_by=getattr(request.user, 'id', None), **defaults)
        obj.save()

    return Response({'subject_id': str(obj.subject_id), 'status': obj.status, 'data': obj.data})


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def co_target_revision(request, subject_id):
    if request.method == 'GET':
        rev = CoTargetRevision.objects.filter(subject_id=subject_id).first()
        if not rev:
            return Response({'subject_id': str(subject_id), 'status': 'draft', 'data': {}})
        return Response({'subject_id': str(rev.subject_id), 'status': rev.status, 'data': rev.data})

    body = request.data or {}
    defaults = {
        'data': body.get('data', {}),
        'status': body.get('status', 'draft'),
        'updated_by': getattr(request.user, 'id', None),
    }

    obj = CoTargetRevision.objects.filter(subject_id=subject_id).first()
    if obj:
        for k, v in defaults.items():
            setattr(obj, k, v)
        obj.save(update_fields=list(defaults.keys()) + ['updated_at'])
    else:
        obj = CoTargetRevision(subject_id=subject_id, created_by=getattr(request.user, 'id', None), **defaults)
        obj.save()

    return Response({'subject_id': str(obj.subject_id), 'status': obj.status, 'data': obj.data})


@api_view(['GET', 'PUT'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def cdap_revision(request, subject_id):
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
    incoming_status = str(body.get('status', 'draft') or 'draft').strip().lower()

    defaults = {
        'rows': body.get('rows', []),
        'books': body.get('books', {}),
        'active_learning': body.get('active_learning', {}),
        'status': incoming_status or 'draft',
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
    row = CdapActiveLearningAnalysisMapping.objects.filter(id=1).first()

    if request.method == 'GET':
        return Response({
            'mapping': row.mapping if row else {},
            'updated_at': row.updated_at.isoformat() if row and row.updated_at else None,
        })

    body = request.data or {}
    mapping = body.get('mapping', {})
    if row:
        row.mapping = mapping
        row.updated_by = getattr(request.user, 'id', None)
        row.save(update_fields=['mapping', 'updated_by', 'updated_at'])
    else:
        row = CdapActiveLearningAnalysisMapping(id=1, mapping=mapping, updated_by=getattr(request.user, 'id', None))
        row.save()

    return Response({'mapping': row.mapping, 'updated_at': row.updated_at.isoformat()})


def _normalize_al_key(s: Any) -> str:
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]+", "", str(s).lower())


# Maps normalized co_mapped label -> list of al_grid row indices to combine
_AL_GRID_ROW_MAP = {
    'ssa1':            [0],
    'ssa2':            [1],
    'activelearning1': [2, 4],  # ACTIVE LEARNING 1 (SKILL) + ACTIVE LEARNING 1 (ATTITUDE)
    'activelearning2': [3, 5],  # ACTIVE LEARNING 2 (SKILL) + ACTIVE LEARNING 2 (ATTITUDE)
    'specialactivity': [6],
}


def _co_mapped_to_al_indices(co_mapped_norm: str) -> list:
    for key, indices in _AL_GRID_ROW_MAP.items():
        if key in co_mapped_norm:
            return indices
    return []


def _build_al_po_from_grid(al_grid_indices: list, al_grid: list) -> list:
    merged = [False] * 11
    for idx in al_grid_indices:
        if idx < len(al_grid) and isinstance(al_grid[idx], list):
            row = al_grid[idx]
            for c in range(11):
                if c < len(row) and row[c]:
                    merged[c] = True
    return merged


def _pick_topic_from_dropdowns(al_grid_indices: list, al_dropdowns: list) -> str:
    for idx in al_grid_indices:
        if idx < len(al_dropdowns) and al_dropdowns[idx]:
            return str(al_dropdowns[idx]).strip()
    return ''


def _global_po_for_topic(topic_norm: str, global_mapping: dict) -> list:
    if not topic_norm:
        return []
    for k, v in global_mapping.items():
        if _normalize_al_key(k) == topic_norm and isinstance(v, list):
            return v
    return []


def _resolve_active_learning_po_vals(co_mapped, topic_name, hours_value, al_grid, al_dropdowns, global_mapping, extra_po=None, existing_po=None):
    co_mapped_norm = _normalize_al_key(co_mapped)
    topic_name_norm = _normalize_al_key(topic_name)

    # 1. Build from al_grid using the co_mapped -> grid-row mapping
    grid_indices = _co_mapped_to_al_indices(co_mapped_norm)
    grid_bool = _build_al_po_from_grid(grid_indices, al_grid)
    has_grid_data = any(grid_bool)

    # 2. Global mapping by topic name
    global_po = _global_po_for_topic(topic_name_norm, global_mapping)

    # 3. Try by dropdown topic match if topic was empty / no grid data
    if not has_grid_data and not global_po and al_dropdowns:
        for idx, drop_val in enumerate(al_dropdowns):
            if drop_val and _normalize_al_key(drop_val) == topic_name_norm:
                if idx < len(al_grid) and isinstance(al_grid[idx], list):
                    for c in range(min(11, len(al_grid[idx]))):
                        if al_grid[idx][c]:
                            grid_bool[c] = True
                    has_grid_data = any(grid_bool)
                    break

    po_vals = []
    for i in range(11):
        is_checked = (
            (has_grid_data and grid_bool[i]) or
            (global_po and i < len(global_po) and global_po[i]) or
            (isinstance(extra_po, list) and i < len(extra_po) and extra_po[i] not in ('-', None, '', False, 0)) or
            (isinstance(existing_po, list) and i < len(existing_po) and existing_po[i] not in ('-', None, '', False, 0))
        )
        po_vals.append(hours_value if is_checked else '-')

    return po_vals


def _resolve_active_learning_pso_vals(hours_value, extra_pso=None, existing_pso=None):
    pso_vals = []
    for i in range(3):
        is_checked = False
        if isinstance(extra_pso, list) and i < len(extra_pso) and extra_pso[i] not in ('-', None, '', False, 0):
            is_checked = True
        elif isinstance(existing_pso, list) and i < len(existing_pso) and existing_pso[i] not in ('-', None, '', False, 0):
            is_checked = True
        pso_vals.append(hours_value if is_checked else '-')
    return pso_vals


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def articulation_matrix(request, subject_id: str):
    rev = CdapRevision.objects.filter(subject_id=subject_id).first()
    rows = []
    extras = {}
    al_data = {}
    if rev and isinstance(rev.rows, list):
        rows = rev.rows

    if rev and isinstance(getattr(rev, 'active_learning', None), dict):
        al_data = rev.active_learning
        maybe = al_data.get('articulation_extras')
        if isinstance(maybe, dict):
            extras = maybe

    # 7-row grid and dropdown selections from CDAPEditor's Active Learning Mapping
    al_grid = al_data.get('grid', []) if isinstance(al_data, dict) else []
    al_dropdowns = al_data.get('dropdowns', []) if isinstance(al_data, dict) else []

    matrix = build_articulation_matrix_from_revision_rows(rows)
    global_mapping_row = CdapActiveLearningAnalysisMapping.objects.filter(id=1).first()
    global_mapping = global_mapping_row.mapping if global_mapping_row and isinstance(global_mapping_row.mapping, dict) else {}

    if isinstance(matrix.get('units'), list):
        for u in matrix['units']:
            unit_label = str(u.get('unit') or '')
            base_rows = u.get('rows') or []
            picked = extras.get(unit_label, []) if isinstance(extras, dict) else []

            extra_map = {}
            if isinstance(picked, list):
                for rr in picked:
                    if isinstance(rr, dict):
                        co_lbl = _normalize_al_key(rr.get('co_mapped') or rr.get('co') or rr.get('label') or '')
                        if co_lbl:
                            extra_map[co_lbl] = rr

            # Enrich existing special rows in base_rows
            for r in base_rows:
                co_m = str(r.get('co_mapped') or '')
                co_norm = _normalize_al_key(co_m)
                top_n = str(r.get('topic_name') or r.get('topic') or '')
                is_special = any(k in co_m.lower() or k in top_n.lower() for k in ['ssa', 'active learning', 'special'])
                if not is_special:
                    continue

                grid_indices = _co_mapped_to_al_indices(co_norm)

                # Fill topic_name from al_dropdowns if currently empty
                if (not top_n or top_n == '-') and grid_indices:
                    topic_from_dropdown = _pick_topic_from_dropdowns(grid_indices, al_dropdowns)
                    if topic_from_dropdown:
                        top_n = topic_from_dropdown
                        r['topic_name'] = top_n

                extra_rr = extra_map.get(co_norm) or {}
                if (not top_n or top_n == '-') and isinstance(extra_rr, dict):
                    extra_topic = extra_rr.get('topic_name') or extra_rr.get('topic') or ''
                    if extra_topic:
                        top_n = str(extra_topic).strip()
                        r['topic_name'] = top_n

                h_val = r.get('hours') or (extra_rr.get('hours') if isinstance(extra_rr, dict) else 2) or 2
                try:
                    h_val = int(h_val) if str(h_val) != '-' else 2
                except Exception:
                    h_val = 2

                extra_po = extra_rr.get('po') if isinstance(extra_rr, dict) else None
                extra_pso = extra_rr.get('pso') if isinstance(extra_rr, dict) else None

                r['po'] = _resolve_active_learning_po_vals(co_m, top_n, h_val, al_grid, al_dropdowns, global_mapping, extra_po, r.get('po'))
                r['pso'] = _resolve_active_learning_pso_vals(h_val, extra_pso, r.get('pso'))

            # Add any missing rows from articulation_extras
            if isinstance(picked, list) and picked:
                existing_co_mapped = {_normalize_al_key(r.get('co_mapped')) for r in base_rows}
                next_serial = max((int(r.get('s_no') or 0) for r in base_rows), default=0) if base_rows else 0

                for rr in picked:
                    if not isinstance(rr, dict):
                        continue
                    co_mapped = rr.get('co_mapped') or rr.get('co') or rr.get('label') or ''
                    co_norm = _normalize_al_key(co_mapped)
                    activity_name = str(rr.get('topic_name') or rr.get('topic') or '').strip()

                    if co_norm in existing_co_mapped:
                        continue

                    grid_indices = _co_mapped_to_al_indices(co_norm)
                    if not activity_name and grid_indices:
                        activity_name = _pick_topic_from_dropdowns(grid_indices, al_dropdowns)

                    next_serial += 1
                    hours_value = rr.get('hours') or rr.get('class_session_hours') or 2
                    try:
                        hours_value = int(hours_value) if str(hours_value) != '-' else 2
                    except Exception:
                        hours_value = 2

                    po_vals = _resolve_active_learning_po_vals(
                        co_mapped, activity_name, hours_value, al_grid, al_dropdowns, global_mapping, rr.get('po')
                    )
                    pso_vals = _resolve_active_learning_pso_vals(hours_value, rr.get('pso'))

                    u.setdefault('rows', []).append({
                        'excel_row': rr.get('excel_row'),
                        's_no': next_serial,
                        'co_mapped': co_mapped,
                        'topic_no': rr.get('topic_no') or '-',
                        'topic_name': activity_name,
                        'po': po_vals,
                        'pso': pso_vals,
                        'hours': hours_value,
                    })

    matrix['meta'] = {**(matrix.get('meta') or {}), 'subject_id': str(subject_id)}
    return Response(matrix)







@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def upload_cdap(request):
    if 'file' not in request.FILES:
        return Response({'detail': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)
    parsed = parse_cdap_excel(request.FILES['file'])
    return Response(parsed)


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def upload_articulation_matrix(request):
    if 'file' not in request.FILES:
        return Response({'detail': 'Missing file'}, status=status.HTTP_400_BAD_REQUEST)
    parsed = parse_articulation_matrix_excel(request.FILES['file'])
    return Response(parsed)
