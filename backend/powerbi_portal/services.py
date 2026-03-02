from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, List, Sequence, Tuple

from django.contrib.auth import get_user_model
from django.db import connections


IDENT_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


@dataclass(frozen=True)
class ViewColumn:
    name: str


def get_conn():
    return connections['bi'] if 'bi' in connections.databases else connections['default']


def quote_ident(conn, ident: str) -> str:
    return conn.ops.quote_name(ident)


def is_safe_ident(ident: str) -> bool:
    return bool(ident and IDENT_RE.match(ident))


def list_bi_views() -> List[str]:
    conn = get_conn()
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT viewname
            FROM pg_catalog.pg_views
            WHERE schemaname = 'public'
              AND viewname LIKE 'bi\\_%'
            ORDER BY viewname
            """
        )
        return [r[0] for r in cursor.fetchall()]


def list_view_columns(view_name: str) -> List[str]:
    if not is_safe_ident(view_name):
        return []
    conn = get_conn()
    qv = quote_ident(conn, view_name)
    with conn.cursor() as cursor:
        cursor.execute(f'SELECT * FROM {qv} LIMIT 0')
        return [d[0] for d in (cursor.description or [])]


def fetch_rows(view_name: str, columns: Sequence[str], limit: int) -> Tuple[List[str], List[Tuple[Any, ...]]]:
    if not is_safe_ident(view_name):
        return [], []

    conn = get_conn()
    qv = quote_ident(conn, view_name)

    safe_cols = [c for c in columns if is_safe_ident(c)]
    if not safe_cols:
        safe_cols = list_view_columns(view_name)

    select_list = ', '.join(quote_ident(conn, c) for c in safe_cols)

    with conn.cursor() as cursor:
        cursor.execute(f'SELECT {select_list} FROM {qv} LIMIT %s', [limit])
        cols = [d[0] for d in cursor.description] if cursor.description else []
        rows = cursor.fetchall()
        return cols, rows


def users_with_powerbi_access(group_name: str = 'powerbi_viewer'):
    User = get_user_model()
    return User.objects.filter(groups__name=group_name).distinct().order_by('username')
