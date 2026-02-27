from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO, StringIO
import csv
from typing import Any, Dict, List, Optional, Sequence, Tuple

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from openpyxl import Workbook

try:
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.pdfgen import canvas

    _HAS_REPORTLAB = True
except Exception:
    _HAS_REPORTLAB = False

from .models import (
    PowerBIExportLog,
    Room,
    RoomJoinRequest,
    RoomMember,
    RoomSheet,
    RoomSheetColumn,
    Sheet,
    SheetColumn,
)
from .services import (
    fetch_rows,
    is_safe_ident,
    list_bi_views,
    list_view_columns,
)


POWERBI_GROUP = 'powerbi_viewer'
DEFAULT_LIMIT = 200


def _parse_limit_param(request: HttpRequest, *, default: int | None, max_limit: int = 50000) -> int | None:
    """Parse ?limit= for table previews.

    - blank / missing -> default
    - 0 / all / * -> no limit (None)
    - otherwise -> int clamped to max_limit
    """
    raw = request.GET.get('limit')
    if raw is None or str(raw).strip() == '':
        return default

    s = str(raw).strip().lower()
    if s in {'all', '*', 'none'}:
        return None

    try:
        n = int(s)
    except Exception:
        return default

    if n <= 0:
        return None
    return max(1, min(n, int(max_limit)))


def _has_powerbi_access(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        return user.groups.filter(name=POWERBI_GROUP).exists()
    except Exception:
        return False


def _powerbi_protect(view_func):
    def _wrapped(request: HttpRequest, *args, **kwargs):
        if not _has_powerbi_access(request.user):
            return redirect('/powerbi/login/?next=' + request.path)
        return view_func(request, *args, **kwargs)

    return _wrapped


def _client_ip(request: HttpRequest) -> str | None:
    try:
        forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
        if forwarded:
            return forwarded
        return request.META.get('REMOTE_ADDR')
    except Exception:
        return None


def welcome(request: HttpRequest) -> HttpResponse:
    return render(request, 'powerbi_portal/welcome.html', {})


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def profile(request: HttpRequest) -> HttpResponse:
    return render(request, 'powerbi_portal/profile.html', {})


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def dashboard(request: HttpRequest) -> HttpResponse:
    # Recent 5 components (BI views)
    all_views = list_bi_views()
    recent_components = all_views[:5]
    
    # Recent 5 sheets
    recent_sheets = Sheet.objects.filter(owner=request.user).order_by('-updated_at')[:5]
    
    # Recent 5 rooms
    recent_rooms = Room.objects.filter(memberships__user=request.user).distinct().order_by('-created_at')[:5]
    
    return render(request, 'powerbi_portal/dashboard.html', {
        'recent_components': recent_components,
        'total_components': len(all_views),
        'recent_sheets': recent_sheets,
        'total_sheets': Sheet.objects.filter(owner=request.user).count(),
        'recent_rooms': recent_rooms,
        'total_rooms': Room.objects.filter(memberships__user=request.user).distinct().count(),
    })


# ------------------------ Components ------------------------


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def components(request: HttpRequest) -> HttpResponse:
    views = list_bi_views()
    return render(request, 'powerbi_portal/components.html', {'views': views})


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def component_table(request: HttpRequest, view_name: str) -> HttpResponse:
    if view_name not in list_bi_views():
        return redirect('/powerbi/components/')

    try:
        limit = int(request.GET.get('limit') or DEFAULT_LIMIT)
    except Exception:
        limit = DEFAULT_LIMIT
    limit = max(1, min(limit, 2000))

    cols, rows = fetch_rows(view_name=view_name, columns=[], limit=limit)

    return render(
        request,
        'powerbi_portal/component_table.html',
        {
            'view_name': view_name,
            'available_views': list_bi_views(),
            'limit': limit,
            'cols': cols,
            'rows': rows,
        },
    )


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def component_column(request: HttpRequest, view_name: str, column_name: str) -> HttpResponse:
    if view_name not in list_bi_views():
        return redirect('/powerbi/components/')

    cols = list_view_columns(view_name)
    if column_name not in cols:
        return redirect(f'/powerbi/components/{view_name}/')

    preview_cols, preview_rows = fetch_rows(view_name=view_name, columns=[column_name], limit=5)

    return render(
        request,
        'powerbi_portal/component_column.html',
        {
            'view_name': view_name,
            'column_name': column_name,
            'columns': cols,
            'preview_cols': preview_cols,
            'preview_rows': preview_rows,
        },
    )


# ------------------------ Sheets ------------------------


def _sheet_available_sources() -> List[str]:
    # keep it simple: allow any bi_* view as a source
    return list_bi_views()


def _can_join_source_view(base_view: str, source_view: str) -> bool:
    """Whether source_view can be included in a sheet preview built off base_view."""
    if source_view == base_view:
        return True
    if source_view not in list_bi_views() or not is_safe_ident(source_view):
        return False
    if base_view not in list_bi_views() or not is_safe_ident(base_view):
        return False

    try:
        base_cols = set(list_view_columns(base_view))
        vcols = set(list_view_columns(source_view))
    except Exception:
        return False

    # Prefer joining on (student_id, subject_id) when possible; otherwise fall back
    # to student_id-only joins.
    if 'student_id' not in base_cols or 'student_id' not in vcols:
        return False
    if 'subject_id' in base_cols and 'subject_id' in vcols:
        return True
    return True


def _build_sheet_query_plan(
    base_view: str,
    selected_columns: Sequence[Tuple[str, str, str]],
) -> Tuple[str, List[str]]:
    """Return (sql, select_headers).

    selected_columns: (source_view, source_column, header_label)

    Strategy:
    - Base table alias is b
    - Any non-base source view becomes a LEFT JOIN alias vN
    - Join keys supported: student_id+subject_id, or student_id only.
    """

    if base_view not in list_bi_views() or not is_safe_ident(base_view):
        base_view = 'bi_obe_student_subject_wide'

    base_cols = set(list_view_columns(base_view))

    default_cols: List[Tuple[str, str, str]] = []
    for k in ('student_id', 'subject_id', 'reg_no', 'student_name', 'subject_code', 'subject_name'):
        if k in base_cols:
            default_cols.append((base_view, k, k))

    # Merge columns so that user-selected columns override default headers
    # for the same (source_view, source_column).
    #
    # Important: we keep default columns at the front for usability, but
    # if the user saved/renamed the same column, we must honor that header
    # (otherwise the table header differs from the saved metadata and push
    # icons won't map correctly).
    merged: Dict[Tuple[str, str], Tuple[str, str, str]] = {}
    order: List[Tuple[str, str]] = []

    for c in default_cols:
        key = (c[0], c[1])
        if key not in merged:
            order.append(key)
        merged[key] = c

    for c in list(selected_columns):
        key = (c[0], c[1])
        if key not in merged:
            order.append(key)
        # Override defaults (especially header labels)
        merged[key] = c

    cols_all = [merged[k] for k in order]

    alias_map: Dict[str, str] = {base_view: 'b'}
    joins: List[str] = []

    def _best_join_keys(vcols: set[str]) -> List[str]:
        if 'student_id' not in base_cols or 'student_id' not in vcols:
            return []
        if 'subject_id' in base_cols and 'subject_id' in vcols:
            return ['student_id', 'subject_id']
        return ['student_id']

    def _ensure_alias(v: str) -> Optional[str]:
        if v in alias_map:
            return alias_map[v]
        if v not in list_bi_views() or not is_safe_ident(v):
            return None
        vcols = set(list_view_columns(v))
        join_keys = _best_join_keys(vcols)
        if not join_keys:
            return None

        alias = f'v{len(alias_map)}'
        alias_map[v] = alias
        on = ' AND '.join([f'{alias}.{k} = b.{k}' for k in join_keys])
        joins.append(f'LEFT JOIN {v} {alias} ON {on}')
        return alias

    select_exprs: List[str] = []
    headers: List[str] = []

    for (sv, sc, header) in cols_all:
        if sv not in list_bi_views() or not is_safe_ident(sv):
            continue
        if not is_safe_ident(sc):
            continue
        if sc not in list_view_columns(sv):
            continue

        if sv == base_view:
            alias = 'b'
        else:
            alias = _ensure_alias(sv)
            if not alias:
                continue

        safe_header = (header or sc)[:128]
        safe_header = safe_header.replace('"', '')
        headers.append(safe_header)
        select_exprs.append(f'{alias}.{sc} AS "{safe_header}"')

    if not select_exprs:
        headers = list_view_columns(base_view)
        select_exprs = [f'b.{c}' for c in headers]

    sql = f"SELECT {', '.join(select_exprs)} FROM {base_view} b " + ' '.join(joins)
    return sql, headers


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def sheets(request: HttpRequest) -> HttpResponse:
    if request.method == 'POST' and request.POST.get('action') == 'create':
        name = str(request.POST.get('name') or '').strip()
        if not name:
            messages.error(request, 'Sheet name is required.')
        else:
            Sheet.objects.create(owner=request.user, name=name)
            messages.success(request, 'Sheet created.')
        return redirect('/powerbi/sheets/')

    my_sheets = Sheet.objects.filter(owner=request.user).order_by('-updated_at')
    rooms = Room.objects.filter(memberships__user=request.user).distinct().order_by('-created_at')

    return render(
        request,
        'powerbi_portal/sheets.html',
        {
            'sheets': my_sheets,
            'rooms': rooms,
        },
    )


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def sheet_detail(request: HttpRequest, sheet_id: int) -> HttpResponse:
    sheet = get_object_or_404(Sheet, id=sheet_id, owner=request.user)

    # Sheets: default to unlimited unless user specifies a limit.
    limit = _parse_limit_param(request, default=None, max_limit=50000)

    cols_meta = list(sheet.columns.all())

    selected = [(c.source_view, c.source_column, c.header_label) for c in cols_meta]
    sql, headers = _build_sheet_query_plan(sheet.base_view, selected)

    # Map rendered header labels back to SheetColumn ids (for per-header actions in UI).
    # Must match _build_sheet_query_plan's safe_header behaviour.
    push_colid_by_header: Dict[str, int] = {}
    for c in cols_meta:
        hdr = (c.header_label or c.source_column)[:128]
        hdr = hdr.replace('"', '')
        # If duplicates exist, keep the first mapping.
        push_colid_by_header.setdefault(hdr, int(c.id))

    # Execute the query by treating it as a subquery (to allow LIMIT safely)
    # NOTE: identifiers are validated upstream.
    from django.db import connections

    conn = connections['bi'] if 'bi' in connections.databases else connections['default']
    with conn.cursor() as cursor:
        if limit is None:
            cursor.execute(sql)
        else:
            cursor.execute(f"{sql} LIMIT %s", [limit])
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description] if cursor.description else []

    available_views = _sheet_available_sources()
    available_views_with_columns = [{'name': v, 'columns': list_view_columns(v)} for v in available_views]
    
    # Get rooms where user is a member (include room sheets for push targeting)
    user_rooms = (
        Room.objects.filter(memberships__user=request.user)
        .distinct()
        .prefetch_related('room_sheets')
    )

    return render(
        request,
        'powerbi_portal/sheet_detail.html',
        {
            'sheet': sheet,
            'cols_meta': cols_meta,
            'available_views': available_views,
            'available_views_with_columns': available_views_with_columns,
            'limit': limit,
            'cols': cols,
            'rows': rows,
            'user_rooms': user_rooms,
            'push_colid_by_header': push_colid_by_header,
        },
    )


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def sheet_add_column(request: HttpRequest, sheet_id: int) -> HttpResponse:
    sheet = get_object_or_404(Sheet, id=sheet_id, owner=request.user)
    if request.method != 'POST':
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    source_view = str(request.POST.get('view') or '').strip()
    source_column = str(request.POST.get('column') or '').strip()
    header_label = str(request.POST.get('header') or source_column).strip() or source_column

    if source_view not in list_bi_views() or not is_safe_ident(source_view):
        messages.error(request, 'Invalid component view.')
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    cols = list_view_columns(source_view)
    if source_column not in cols or not is_safe_ident(source_column):
        messages.error(request, 'Invalid column.')
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    # Ensure the added column will actually appear in the preview table.
    if source_view != sheet.base_view and not _can_join_source_view(sheet.base_view, source_view):
        messages.error(
            request,
            'This column cannot be added to this sheet (no join mapping to the sheet base view).',
        )
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    last_order = sheet.columns.order_by('-sort_order').values_list('sort_order', flat=True).first() or 0
    next_order = int(last_order) + 1
    try:
        SheetColumn.objects.create(
            sheet=sheet,
            source_view=source_view,
            source_column=source_column,
            header_label=header_label[:128],
            sort_order=next_order,
        )
        sheet.save(update_fields=['updated_at'])
        messages.success(request, 'Column added.')
    except Exception:
        messages.error(request, 'Column already added or could not be added.')

    return redirect(f'/powerbi/sheets/{sheet.id}/')


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def sheet_rename_column(request: HttpRequest, sheet_id: int) -> HttpResponse:
    sheet = get_object_or_404(Sheet, id=sheet_id, owner=request.user)
    if request.method != 'POST':
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    col_id = int(request.POST.get('col_id') or 0)
    new_header = str(request.POST.get('header') or '').strip()
    if not new_header:
        messages.error(request, 'Header is required.')
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    col = get_object_or_404(SheetColumn, id=col_id, sheet=sheet)
    col.header_label = new_header[:128]
    col.save(update_fields=['header_label'])
    sheet.save(update_fields=['updated_at'])
    return redirect(f'/powerbi/sheets/{sheet.id}/')


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def sheet_delete_column(request: HttpRequest, sheet_id: int) -> HttpResponse:
    sheet = get_object_or_404(Sheet, id=sheet_id, owner=request.user)
    if request.method != 'POST':
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    col_id = int(request.POST.get('col_id') or 0)
    col = get_object_or_404(SheetColumn, id=col_id, sheet=sheet)
    col.delete()
    sheet.save(update_fields=['updated_at'])
    messages.success(request, 'Column deleted.')
    return redirect(f'/powerbi/sheets/{sheet.id}/')


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def sheet_push_column(request: HttpRequest, sheet_id: int) -> HttpResponse:
    """Push a single column from a sheet to a room"""
    sheet = get_object_or_404(Sheet, id=sheet_id, owner=request.user)
    if request.method != 'POST':
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    col_id = int(request.POST.get('col_id') or 0)
    room_id = int(request.POST.get('room_id') or 0)
    room_sheet_id = int(request.POST.get('room_sheet_id') or 0)
    
    col = get_object_or_404(SheetColumn, id=col_id, sheet=sheet)
    room = get_object_or_404(Room, id=room_id, memberships__user=request.user)

    if not _can_edit_room(room, request.user):
        messages.error(request, 'Only the room leader/co-leader can push columns into room sheets.')
        return redirect(f'/powerbi/sheets/{sheet.id}/')

    # Add this column into a stable room sheet (per room + source sheet).
    # - Header is SNAPSHOT at push-time.
    # - Live data is preserved because we store source_view/source_column.
    with transaction.atomic():
        # If user selected an explicit room sheet, push into it.
        # Otherwise, push into a stable auto-created room sheet per source sheet.
        rs = None
        if room_sheet_id > 0:
            rs = RoomSheet.objects.filter(id=room_sheet_id, room=room).first()
            if not rs:
                messages.error(request, 'Selected room sheet not found.')
                return redirect(f'/powerbi/sheets/{sheet.id}/')
        else:
            # Prefer an existing RoomSheet that was created from this sheet.
            rs = RoomSheet.objects.filter(room=room, created_from_sheet=sheet).first()
            if not rs:
                # Otherwise create a deterministic, collision-safe name.
                candidate_names = [sheet.name, f'{sheet.name} ({sheet.id})']
                for nm in candidate_names:
                    rs, _created = RoomSheet.objects.get_or_create(
                        room=room,
                        name=nm,
                        defaults={
                            'base_view': sheet.base_view,
                            'created_from_sheet': sheet,
                            'created_by': request.user,
                        },
                    )
                    if rs:
                        break

        # Ensure the pushed column can be previewed in the target room sheet.
        if rs and col.source_view != rs.base_view and not _can_join_source_view(rs.base_view, col.source_view):
            messages.error(
                request,
                'This column cannot be added to the selected room sheet (no join mapping to that room sheet base view).',
            )
            return redirect(f'/powerbi/sheets/{sheet.id}/')

        next_order = int(rs.columns.aggregate(m=Max('sort_order')).get('m') or 0) + 1
        rcol, created_col = RoomSheetColumn.objects.get_or_create(
            room_sheet=rs,
            source_view=col.source_view,
            source_column=col.source_column,
            defaults={
                'header_label': (col.header_label or col.source_column)[:128],
                'sort_order': next_order,
            },
        )

        if not created_col:
            # Manual push refreshes the snapshot header.
            rcol.header_label = (col.header_label or col.source_column)[:128]
            rcol.save(update_fields=['header_label'])

        rs.save(update_fields=['updated_at'])

    messages.success(request, f'Pushed column to room: {room.name}')
    return redirect(f'/powerbi/sheets/{sheet.id}/')


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def sheet_push(request: HttpRequest, sheet_id: int) -> HttpResponse:
    sheet = get_object_or_404(Sheet, id=sheet_id, owner=request.user)
    if request.method != 'POST':
        return redirect('/powerbi/sheets/')

    # This endpoint previously pushed the entire sheet at once.
    # The intended behaviour is to push individual columns (or multiple columns) into rooms.
    messages.error(request, 'Whole-sheet push is disabled. Open the sheet and push individual columns to a room.')
    return redirect(f'/powerbi/sheets/{sheet.id}/')


# ------------------------ Collaboration / Rooms ------------------------


def _room_role(room: Room, user) -> str | None:
    if getattr(user, 'is_superuser', False):
        return RoomMember.ROLE_LEADER
    m = RoomMember.objects.filter(room=room, user=user).first()
    return m.role if m else None


def _can_edit_room(room: Room, user) -> bool:
    role = _room_role(room, user)
    return role in (RoomMember.ROLE_LEADER, RoomMember.ROLE_CO_LEADER)


def _is_room_leader(room: Room, user) -> bool:
    role = _room_role(room, user)
    return role == RoomMember.ROLE_LEADER


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def collaboration(request: HttpRequest) -> HttpResponse:
    if request.method == 'POST' and request.POST.get('action') == 'create_room':
        name = str(request.POST.get('name') or '').strip()
        if not name:
            messages.error(request, 'Room name is required.')
            return redirect('/powerbi/collaboration/')

        with transaction.atomic():
            room = Room.objects.create(name=name, leader=request.user)
            RoomMember.objects.create(room=room, user=request.user, role=RoomMember.ROLE_LEADER)
        messages.success(request, 'Room created.')
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/')

    rooms = Room.objects.all().order_by('-created_at')

    member_room_ids = set(
        RoomMember.objects.filter(user=request.user).values_list('room_id', flat=True)
    )
    my_reqs = RoomJoinRequest.objects.filter(user=request.user, room__in=rooms)
    req_by_room_id = {r.room_id: r for r in my_reqs}

    return render(
        request,
        'powerbi_portal/collaboration.html',
        {
            'rooms': rooms,
            'member_room_ids': member_room_ids,
            'req_by_room_id': req_by_room_id,
        },
    )


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_detail(request: HttpRequest, room_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id)
    if not getattr(request.user, 'is_superuser', False):
        is_member = RoomMember.objects.filter(room=room, user=request.user).exists() or (room.leader_id == request.user.id)
        if not is_member:
            return redirect(f'/powerbi/collaboration/rooms/{room.id}/request/')
    memberships = RoomMember.objects.filter(room=room).select_related('user').order_by('role', 'user__username')
    room_sheets = RoomSheet.objects.filter(room=room).order_by('-updated_at')

    User = get_user_model()
    powerbi_users = User.objects.filter(groups__name=POWERBI_GROUP).distinct().order_by('username')

    return render(
        request,
        'powerbi_portal/room_detail.html',
        {
            'room': room,
            'memberships': memberships,
            'room_sheets': room_sheets,
            'can_manage_members': _is_room_leader(room, request.user),
            'can_manage_sheets': _is_room_leader(room, request.user),
            'powerbi_users': powerbi_users,
        },
    )


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_request_join(request: HttpRequest, room_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id)

    if getattr(request.user, 'is_superuser', False):
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/')

    if RoomMember.objects.filter(room=room, user=request.user).exists() or (room.leader_id == request.user.id):
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/')

    jr = RoomJoinRequest.objects.filter(room=room, user=request.user).select_related('decided_by').first()

    if request.method == 'POST':
        reason = str(request.POST.get('reason') or '').strip()
        jr, _created = RoomJoinRequest.objects.update_or_create(
            room=room,
            user=request.user,
            defaults={
                'reason': reason,
                'status': RoomJoinRequest.STATUS_PENDING,
                'decided_by': None,
                'decided_reason': '',
                'decided_at': None,
            },
        )
        messages.success(request, 'Join request sent to the room leader.')
        return redirect('/powerbi/collaboration/')

    return render(
        request,
        'powerbi_portal/room_request_join.html',
        {
            'room': room,
            'join_request': jr,
        },
    )


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def notifications(request: HttpRequest) -> HttpResponse:
    user = request.user

    is_super = bool(getattr(user, 'is_superuser', False))
    leader_rooms = Room.objects.all() if is_super else Room.objects.filter(leader=user)

    if request.method == 'POST':
        action = str(request.POST.get('action') or '').strip()
        req_id = int(request.POST.get('request_id') or 0)
        decided_reason = str(request.POST.get('decided_reason') or '').strip()

        jr = RoomJoinRequest.objects.select_related('room', 'user').filter(id=req_id).first()
        if not jr:
            messages.error(request, 'Request not found.')
            return redirect('/powerbi/notifications/')

        if (not is_super) and (jr.room.leader_id != user.id):
            return HttpResponse('Forbidden', status=403)

        if action == 'approve':
            jr.status = RoomJoinRequest.STATUS_APPROVED
            jr.decided_by = user
            jr.decided_reason = decided_reason
            jr.decided_at = timezone.now()
            jr.save(update_fields=['status', 'decided_by', 'decided_reason', 'decided_at', 'updated_at'])
            RoomMember.objects.update_or_create(
                room=jr.room,
                user=jr.user,
                defaults={'role': RoomMember.ROLE_MEMBER},
            )
            messages.success(request, f'Approved {getattr(jr.user, "username", "user")}.')
        elif action == 'reject':
            jr.status = RoomJoinRequest.STATUS_REJECTED
            jr.decided_by = user
            jr.decided_reason = decided_reason
            jr.decided_at = timezone.now()
            jr.save(update_fields=['status', 'decided_by', 'decided_reason', 'decided_at', 'updated_at'])
            messages.success(request, f'Rejected {getattr(jr.user, "username", "user")}.')
        else:
            messages.error(request, 'Invalid action.')

        return redirect('/powerbi/notifications/')

    pending_for_leader = (
        RoomJoinRequest.objects.select_related('room', 'user')
        .filter(room__in=leader_rooms, status=RoomJoinRequest.STATUS_PENDING)
        .order_by('-updated_at')
    )

    my_requests = (
        RoomJoinRequest.objects.select_related('room', 'decided_by')
        .filter(user=user)
        .order_by('-updated_at')
    )

    return render(
        request,
        'powerbi_portal/notifications.html',
        {
            'pending_for_leader': pending_for_leader,
            'my_requests': my_requests,
            'is_leader': bool(is_super or leader_rooms.exists()),
        },
    )


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_sheet_create(request: HttpRequest, room_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id, memberships__user=request.user)
    if not _is_room_leader(room, request.user):
        return HttpResponse('Forbidden', status=403)
    if request.method != 'POST':
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/')

    name = str(request.POST.get('name') or '').strip()
    if not name:
        messages.error(request, 'Room sheet name is required.')
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/')

    try:
        RoomSheet.objects.create(room=room, name=name[:128], created_by=request.user)
        messages.success(request, 'Room sheet created.')
    except Exception:
        messages.error(request, 'Could not create room sheet (name may already exist).')

    return redirect(f'/powerbi/collaboration/rooms/{room.id}/')


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_sheet_delete(request: HttpRequest, room_id: int, room_sheet_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id, memberships__user=request.user)
    if not _is_room_leader(room, request.user):
        return HttpResponse('Forbidden', status=403)
    if request.method != 'POST':
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/')

    room_sheet = get_object_or_404(RoomSheet, id=room_sheet_id, room=room)
    room_sheet.delete()
    messages.success(request, 'Room sheet deleted.')
    return redirect(f'/powerbi/collaboration/rooms/{room.id}/')


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_members(request: HttpRequest, room_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id, memberships__user=request.user)
    if not _is_room_leader(room, request.user):
        return HttpResponse('Forbidden', status=403)

    if request.method != 'POST':
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/')

    co_leader_ids = {int(x) for x in request.POST.getlist('co_leaders') if str(x).isdigit()}
    member_ids = {int(x) for x in request.POST.getlist('members') if str(x).isdigit()}
    member_ids = member_ids - co_leader_ids

    User = get_user_model()
    allowed_users = User.objects.filter(groups__name=POWERBI_GROUP).distinct()

    leader_id = room.leader_id
    co_leader_ids.discard(leader_id)
    member_ids.discard(leader_id)
    desired_ids = co_leader_ids | member_ids

    with transaction.atomic():
        RoomMember.objects.filter(room=room).exclude(user=room.leader).exclude(user_id__in=desired_ids).delete()

        for uid in sorted(co_leader_ids):
            if not allowed_users.filter(id=uid).exists():
                continue
            RoomMember.objects.update_or_create(
                room=room,
                user_id=uid,
                defaults={'role': RoomMember.ROLE_CO_LEADER},
            )

        for uid in sorted(member_ids):
            if not allowed_users.filter(id=uid).exists():
                continue
            RoomMember.objects.update_or_create(
                room=room,
                user_id=uid,
                defaults={'role': RoomMember.ROLE_MEMBER},
            )

    messages.success(request, 'Members updated.')
    return redirect(f'/powerbi/collaboration/rooms/{room.id}/')


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_sheet_detail(request: HttpRequest, room_id: int, room_sheet_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id, memberships__user=request.user)
    room_sheet = get_object_or_404(RoomSheet, id=room_sheet_id, room=room)

    # Room sheets: default to unlimited unless user specifies a limit.
    limit = _parse_limit_param(request, default=None, max_limit=50000)

    cols_meta = list(room_sheet.columns.all())
    selected = [(c.source_view, c.source_column, c.header_label) for c in cols_meta]
    sql, _headers = _build_sheet_query_plan(room_sheet.base_view, selected)

    from django.db import connections

    conn = connections['bi'] if 'bi' in connections.databases else connections['default']
    with conn.cursor() as cursor:
        if limit is None:
            cursor.execute(sql)
        else:
            cursor.execute(f"{sql} LIMIT %s", [limit])
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description] if cursor.description else []

    return render(
        request,
        'powerbi_portal/room_sheet_detail.html',
        {
            'room': room,
            'room_sheet': room_sheet,
            'cols_meta': cols_meta,
            'limit': limit,
            'cols': cols,
            'rows': rows,
            'can_edit': _can_edit_room(room, request.user),
            'can_export': _is_room_leader(room, request.user),
            'has_reportlab': _HAS_REPORTLAB,
        },
    )


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_sheet_rename_column(request: HttpRequest, room_id: int, room_sheet_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id, memberships__user=request.user)
    if not _can_edit_room(room, request.user):
        return HttpResponse('Forbidden', status=403)

    room_sheet = get_object_or_404(RoomSheet, id=room_sheet_id, room=room)
    if request.method != 'POST':
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/sheets/{room_sheet.id}/')

    col_id = int(request.POST.get('col_id') or 0)
    new_header = str(request.POST.get('header') or '').strip()
    if not new_header:
        messages.error(request, 'Header is required.')
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/sheets/{room_sheet.id}/')

    col = get_object_or_404(RoomSheetColumn, id=col_id, room_sheet=room_sheet)
    col.header_label = new_header[:128]
    col.save(update_fields=['header_label'])
    room_sheet.save(update_fields=['updated_at'])
    return redirect(f'/powerbi/collaboration/rooms/{room.id}/sheets/{room_sheet.id}/')


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_sheet_delete_column(request: HttpRequest, room_id: int, room_sheet_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id, memberships__user=request.user)
    if not _can_edit_room(room, request.user):
        return HttpResponse('Forbidden', status=403)

    room_sheet = get_object_or_404(RoomSheet, id=room_sheet_id, room=room)
    if request.method != 'POST':
        return redirect(f'/powerbi/collaboration/rooms/{room.id}/sheets/{room_sheet.id}/')

    col_id = int(request.POST.get('col_id') or 0)
    col = get_object_or_404(RoomSheetColumn, id=col_id, room_sheet=room_sheet)
    col.delete()
    room_sheet.save(update_fields=['updated_at'])
    messages.success(request, 'Column deleted.')
    return redirect(f'/powerbi/collaboration/rooms/{room.id}/sheets/{room_sheet.id}/')


def _xlsx_bytes(cols: List[str], rows: List[Tuple[Any, ...]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = 'data'
    ws.append(cols)
    for r in rows:
        out = []
        for v in r:
            if isinstance(v, Decimal):
                out.append(float(v))
            else:
                out.append(v)
        ws.append(out)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def _csv_bytes(cols: List[str], rows: List[Tuple[Any, ...]]) -> bytes:
    sio = StringIO()
    writer = csv.writer(sio)
    writer.writerow(cols)
    for r in rows:
        out = []
        for v in r:
            if isinstance(v, Decimal):
                out.append(float(v))
            else:
                out.append(v)
        writer.writerow(out)
    return sio.getvalue().encode('utf-8-sig')


def _pdf_bytes(view_name: str, cols: List[str], rows: List[Tuple[Any, ...]]) -> bytes:
    if not _HAS_REPORTLAB:
        raise RuntimeError('PDF export is not available (reportlab not installed).')

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(letter))
    width, height = landscape(letter)

    title = f'{view_name} (first {len(rows)} rows)'
    c.setFont('Helvetica-Bold', 12)
    c.drawString(24, height - 24, title)

    c.setFont('Helvetica', 7)
    x0 = 24
    y = height - 40
    row_h = 10

    max_cols = min(len(cols), 24)
    col_w = (width - 48) / max_cols if max_cols else (width - 48)

    def _cell(v: Any) -> str:
        if v is None:
            return ''
        s = str(v)
        return s[:40]

    for i in range(max_cols):
        c.drawString(x0 + i * col_w, y, str(cols[i])[:18])
    y -= row_h

    for r in rows:
        if y < 24:
            c.showPage()
            c.setFont('Helvetica', 7)
            y = height - 24
        for i in range(max_cols):
            c.drawString(x0 + i * col_w, y, _cell(r[i] if i < len(r) else ''))
        y -= row_h

    c.showPage()
    c.save()
    return buf.getvalue()


@login_required(login_url='/powerbi/login/')
@_powerbi_protect
def room_sheet_export(request: HttpRequest, room_id: int, room_sheet_id: int) -> HttpResponse:
    room = get_object_or_404(Room, id=room_id, memberships__user=request.user)
    if not _is_room_leader(room, request.user):
        return HttpResponse('Forbidden', status=403)

    room_sheet = get_object_or_404(RoomSheet, id=room_sheet_id, room=room)

    export_type = str(request.GET.get('format') or '').strip().lower()
    if export_type not in {'xlsx', 'csv', 'pdf'}:
        export_type = 'xlsx'

    try:
        limit = int(request.GET.get('limit') or 5000)
    except Exception:
        limit = 5000
    if export_type == 'pdf':
        limit = max(1, min(limit, 500))
    else:
        limit = max(1, min(limit, 50000))

    cols_meta = list(room_sheet.columns.all())
    _maybe_autofix_base_view_from_columns(room_sheet, cols_meta)
    selected = [(c.source_view, c.source_column, c.header_label) for c in cols_meta]
    sql, _headers = _build_sheet_query_plan(room_sheet.base_view, selected)

    from django.db import connections

    conn = connections['bi'] if 'bi' in connections.databases else connections['default']
    with conn.cursor() as cursor:
        cursor.execute(f"{sql} LIMIT %s", [limit])
        rows = cursor.fetchall()
        cols = [d[0] for d in cursor.description] if cursor.description else []

    if export_type == 'xlsx':
        data = _xlsx_bytes(cols, rows)
        content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        filename = f'{room_sheet.name}.xlsx'
    elif export_type == 'csv':
        data = _csv_bytes(cols, rows)
        content_type = 'text/csv; charset=utf-8'
        filename = f'{room_sheet.name}.csv'
    else:
        data = _pdf_bytes(room_sheet.name, cols, rows)
        content_type = 'application/pdf'
        filename = f'{room_sheet.name}.pdf'

    try:
        PowerBIExportLog.objects.create(
            user=request.user,
            view_name=room_sheet.base_view,
            limit=limit,
            row_count=len(rows),
            ip_address=_client_ip(request),
            user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:2000],
            export_type=export_type,
            room=room,
            room_sheet=room_sheet,
        )
    except Exception:
        pass

    resp = HttpResponse(data, content_type=content_type)
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp
