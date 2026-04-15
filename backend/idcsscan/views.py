"""
IDCSScan API views

Provides endpoints for the RFID hardware scanner integration:

Students:
  - GET  /api/idscan/lookup/?uid=<UID>          look up student by RFID UID
  - GET  /api/idscan/search/?q=<query>          search students (name / reg_no)
  - POST /api/idscan/assign-uid/                assign RFID UID to a student
  - POST /api/idscan/unassign-uid/              remove RFID UID from a student
  - POST /api/idscan/gatepass-check/            check & lock a gatepass for a student

Staff:
  - GET  /api/idscan/search-staff/?q=<query>    search staff (staff_id / name)
  - POST /api/idscan/assign-staff-uid/          assign RFID UID to a staff member
  - POST /api/idscan/unassign-staff-uid/        remove RFID UID from a staff member

Common:
  - GET  /api/idscan/lookup-any/?uid=<UID>      resolve UID for student OR staff (used by WebSerial page)

All endpoints require authentication.
Assign/unassign/gatepass-check require SECURITY role.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import AcademicYear, StaffProfile, StudentProfile
from academics.models import RFReaderGate, RFReaderScan
from academics.rfreader_serializers import RFReaderGateSerializer
from applications import models as app_models
from applications.services import application_state
from applications.services.approval_engine import _get_flow_for_application

from idcsscan.models import GatepassOfflineScan
from idcsscan.serializers import SecurityStaffProfileSerializer


class PingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response({"ok": True}, status=status.HTTP_200_OK)


# ── Helpers ────────────────────────────────────────────────────────────────

def _normalize_uid(uid: str) -> str:
    """
    Normalize card UID so 'AF DF:DE-EC' == 'afdfdeec' == 'AFDFDEEC'
    """
    raw = (uid or "").strip()
    raw = re.sub(r"[^0-9A-Fa-f]", "", raw)
    return raw.upper()


def _display_name(user: Any) -> Optional[str]:
    if not user:
        return None
    name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return name if name else getattr(user, "username", None)


def _has_scan_permission(user: Any) -> bool:
    # Prefer explicit permission if configured.
    try:
        if user and getattr(user, "has_perm", None) and user.has_perm("idcsscan.scan"):
            return True
    except Exception:
        pass

    effective_roles = set()
    try:
        if hasattr(user, "roles"):
            effective_roles |= {str(r.name or "").upper() for r in user.roles.all()}
    except Exception:
        pass

    # Support deployments where staff roles are stored outside User.roles
    # (RoleAssignment / DepartmentRole) but should still grant scan access.
    try:
        staff_profile = getattr(user, "staff_profile", None)
        if staff_profile is not None:
            from academics.models import DepartmentRole, RoleAssignment

            dept_roles = DepartmentRole.objects.filter(staff=staff_profile, is_active=True).values_list(
                "role", flat=True
            )
            for r in dept_roles:
                effective_roles.add(str(r or "").strip().upper())

            ra_roles = RoleAssignment.objects.filter(staff=staff_profile, is_active=True).values_list(
                "role__name", flat=True
            )
            for r in ra_roles:
                effective_roles.add(str(r or "").strip().upper())
    except Exception:
        pass

    return "SECURITY" in effective_roles


def _has_card_management_permission(user: Any) -> bool:
    """Permission for assigning/unassigning RFID cards.

    Intentionally separate from `_has_scan_permission` so gate-scan endpoints
    can remain SECURITY-only.
    """

    try:
        if user and getattr(user, "has_perm", None) and user.has_perm("idcsscan.manage_cards"):
            return True
    except Exception:
        pass

    try:
        roles = {str(r.name or "").upper() for r in user.roles.all()}
    except Exception:
        roles = set()

    return bool(roles.intersection({"SECURITY", "LIBRARY", "IQAC", "ADMIN"}))


def _has_gate_management_permission(user: Any) -> bool:
    """Permission for HR/SECURITY to manage gate setup + related admin tasks."""

    try:
        if user and getattr(user, "has_perm", None) and user.has_perm("idcsscan.manage_gate"):
            return True
    except Exception:
        pass

    try:
        roles = {str(r.name or "").upper() for r in user.roles.all()}
    except Exception:
        roles = set()

    return bool(roles.intersection({"HR", "SECURITY", "ADMIN", "IQAC"}))


def _has_security_user_management_permission(user: Any) -> bool:
    try:
        if user and getattr(user, "has_perm", None) and user.has_perm("idcsscan.manage_security_users"):
            return True
    except Exception:
        pass
    return _has_gate_management_permission(user)


def _has_offline_data_permission(user: Any) -> bool:
    try:
        if user and getattr(user, "has_perm", None) and user.has_perm("idcsscan.pull_offline_data"):
            return True
    except Exception:
        pass
    return _has_gate_management_permission(user)


def _is_security_user(user: Any) -> bool:
    if not user:
        return False
    try:
        return user.roles.filter(name__iexact="SECURITY").exists()
    except Exception:
        return False


def _ensure_aware(dt: datetime) -> datetime:
    try:
        if timezone.is_aware(dt):
            return dt
        return timezone.make_aware(dt, timezone.get_current_timezone())
    except Exception:
        return dt


def _resolve_profile_by_uid(uid: str) -> tuple[Optional[str], Optional[dict], Any]:
    """Return (profile_type, profile_data, applicant_user) for a UID."""

    sp_student = (
        StudentProfile.objects.select_related(
            "user", "section__batch__course__department", "home_department"
        )
        .filter(rfid_uid__iexact=uid)
        .first()
    )
    if sp_student:
        return "student", _student_detail(sp_student), sp_student.user

    sp_staff = (
        StaffProfile.objects.select_related("user", "department")
        .filter(rfid_uid__iexact=uid)
        .first()
    )
    if sp_staff:
        return "staff", _staff_detail(sp_staff), sp_staff.user

    return None, None, None


def _extract_department_for_profile(profile_type: Optional[str], profile_data: Optional[dict]) -> tuple[Optional[int], Optional[str]]:
    if not profile_type or not profile_data:
        return None, None

    if profile_type == "student":
        dep_id = None
        dep_name = None
        try:
            dep_id = profile_data.get("department_id")
        except Exception:
            dep_id = None
        try:
            dep_name = profile_data.get("department")
        except Exception:
            dep_name = None
        return (int(dep_id) if dep_id else None), (str(dep_name) if dep_name else None)

    if profile_type == "staff":
        dep_id = None
        dep_name = None
        try:
            dep_id = profile_data.get("department_id")
        except Exception:
            dep_id = None
        try:
            dep_name = profile_data.get("department")
        except Exception:
            dep_name = None
        return (int(dep_id) if dep_id else None), (str(dep_name) if dep_name else None)

    return None, None


def _apply_offline_gatepass_scan(
    *,
    uid: str,
    direction: str,
    scanned_at: datetime,
    security_user: Any,
) -> tuple[bool, str, Optional[app_models.Application]]:
    """Apply an OFFLINE OUT/IN scan to an Application.

    Offline pulls are intentionally permissive: no gate-window checks, no approval
    checks, and no dependency on an existing "pending" state. We just attach the
    scan timestamps to the most appropriate Application for the user.
    """

    profile_type, profile_data, applicant_user = _resolve_profile_by_uid(uid)
    if not applicant_user:
        return False, "This RFID card is not registered to any user.", None

    scanned_at = _ensure_aware(scanned_at)
    direction = str(direction or "").strip().upper()

    if direction == "IN":
        in_pending = (
            app_models.Application.objects.filter(
                applicant_user=applicant_user,
                gatepass_scanned_at__isnull=False,
                gatepass_in_scanned_at__isnull=True,
            )
            .order_by("-gatepass_scanned_at")
            .first()
        )
        if in_pending is None:
            in_pending = (
                app_models.Application.objects.filter(
                    applicant_user=applicant_user,
                    gatepass_in_scanned_at__isnull=True,
                )
                .order_by("-created_at")
                .first()
            )
        if in_pending is None:
            return False, "No application found for this user.", None

        with transaction.atomic():
            locked = app_models.Application.objects.select_for_update().get(pk=in_pending.pk)
            if locked.gatepass_scanned_at and not locked.gatepass_in_scanned_at:
                locked.gatepass_in_scanned_at = scanned_at
                locked.gatepass_in_scanned_by = security_user
                try:
                    locked.gatepass_in_scanned_mode = app_models.Application.GatepassScanMode.OFFLINE
                    locked.save(
                        update_fields=[
                            "gatepass_in_scanned_at",
                            "gatepass_in_scanned_by",
                            "gatepass_in_scanned_mode",
                        ]
                    )
                except Exception:
                    locked.save(update_fields=["gatepass_in_scanned_at", "gatepass_in_scanned_by"])

        return True, "IN scan recorded.", in_pending

    # OUT scan (default)
    ready_app = (
        app_models.Application.objects.filter(
            applicant_user=applicant_user,
            gatepass_scanned_at__isnull=True,
        )
        .order_by("-created_at")
        .first()
    )
    if ready_app is None:
        ready_app = (
            app_models.Application.objects.filter(applicant_user=applicant_user)
            .order_by("-created_at")
            .first()
        )
    if ready_app is None:
        return False, "No application found for this user.", None

    with transaction.atomic():
        locked = app_models.Application.objects.select_for_update().get(pk=ready_app.pk)

        locked.gatepass_scanned_at = scanned_at
        locked.gatepass_scanned_by = security_user
        try:
            locked.gatepass_scanned_mode = app_models.Application.GatepassScanMode.OFFLINE
            locked.save(
                update_fields=[
                    "gatepass_scanned_at",
                    "gatepass_scanned_by",
                    "gatepass_scanned_mode",
                ]
            )
        except Exception:
            locked.save(update_fields=["gatepass_scanned_at", "gatepass_scanned_by"])

    return True, "OUT scan recorded.", ready_app


def _build_offline_log_rows(
    *,
    role_filter: str,
    dept_id: Optional[int],
    out_filter: str,
    in_filter: str,
    q: str,
    from_dt: Optional[datetime],
    to_dt: Optional[datetime],
    base_url: str,
    limit: int,
) -> list[dict]:
    """Build log rows for OFFLINE scans that were pulled.

    These rows come from `GatepassOfflineScan` directly (not from Application)
    so HR can see offline activity even when there is no matching Application.
    """

    if limit <= 0:
        return []

    # Only consider pulled items.
    qs = (
        GatepassOfflineScan.objects.filter(status=GatepassOfflineScan.Status.PULLED)
        .select_related("pulled_security_user")
        .order_by("-recorded_at")
    )

    if from_dt:
        qs = qs.filter(recorded_at__gte=from_dt)
    if to_dt:
        qs = qs.filter(recorded_at__lte=to_dt)

    # Pull a bigger slice; we dedupe by UID.
    scan_cap = min(limit * 50, 5000)
    items = list(qs[:scan_cap])

    q_norm = _normalize_uid(q) if q else ""

    by_uid: dict[str, dict] = {}
    for rec in items:
        uid = _normalize_uid(rec.uid)
        if not uid:
            continue

        if q_norm and q_norm not in uid:
            # If user typed a UID-like value, match against UID only.
            # (We cannot safely search names for unknown users here.)
            continue

        entry = by_uid.get(uid)
        if entry is None:
            entry = {
                "uid": uid,
                "out_at": None,
                "in_at": None,
                "log_at": None,
                "gate_username": None,
                "application_id": None,
                "user_role": None,
                "user_username": None,
                "user_name": uid,
                "department_name": None,
                "reg_no": None,
                "staff_id": None,
                "profile_image_url": None,
                "__sort_dt": None,
            }

            # Best-effort resolve role/department for filtering/display.
            p_type, p_data, u = _resolve_profile_by_uid(uid)
            if p_type in ("student", "staff"):
                entry["user_role"] = "STUDENT" if p_type == "student" else "STAFF"
                entry["user_username"] = getattr(u, "username", None) if u else None
                entry["user_name"] = _display_name(u) if u else uid
                _dep_id, dep_name = _extract_department_for_profile(p_type, p_data)
                entry["department_name"] = dep_name
                entry["_department_id"] = _dep_id
                try:
                    entry["profile_image_url"] = p_data.get("profile_image_url") if isinstance(p_data, dict) else None
                except Exception:
                    entry["profile_image_url"] = None

                try:
                    if entry.get("profile_image_url") and str(entry["profile_image_url"]).startswith("/"):
                        entry["profile_image_url"] = f"{base_url}{entry['profile_image_url']}"
                except Exception:
                    pass
                if p_type == "student":
                    try:
                        entry["reg_no"] = p_data.get("reg_no") if isinstance(p_data, dict) else None
                    except Exception:
                        entry["reg_no"] = None
                if p_type == "staff":
                    try:
                        entry["staff_id"] = p_data.get("staff_id") if isinstance(p_data, dict) else None
                    except Exception:
                        entry["staff_id"] = None
            else:
                entry["_department_id"] = None

            by_uid[uid] = entry

        # Record the most recent OUT/IN times per UID.
        if rec.direction == "OUT" and entry["out_at"] is None:
            entry["out_at"] = timezone.localtime(rec.recorded_at).isoformat() if rec.recorded_at else None
            entry["gate_username"] = getattr(rec.pulled_security_user, "username", None) if rec.pulled_security_user else None
            entry["application_id"] = -(rec.id or 0)
        elif rec.direction == "IN" and entry["in_at"] is None:
            entry["in_at"] = timezone.localtime(rec.recorded_at).isoformat() if rec.recorded_at else None
            if not entry.get("gate_username"):
                entry["gate_username"] = (
                    getattr(rec.pulled_security_user, "username", None) if rec.pulled_security_user else None
                )
            if entry.get("application_id") is None:
                entry["application_id"] = -(rec.id or 0)

        # Track the latest recorded datetime for sorting.
        try:
            if rec.recorded_at:
                prev = entry.get("__sort_dt")
                if prev is None or rec.recorded_at > prev:
                    entry["__sort_dt"] = rec.recorded_at
        except Exception:
            pass

    rows: list[dict] = []
    for uid, entry in by_uid.items():
        # Apply filters.
        r_role = str(entry.get("user_role") or "")
        if role_filter in ("STUDENT", "STAFF") and r_role != role_filter:
            continue

        dep_match_id = entry.get("_department_id")
        if dept_id is not None and (not dep_match_id or int(dep_match_id) != int(dept_id)):
            continue

        out_at = entry.get("out_at")
        in_at = entry.get("in_at")

        out_status = "EXITED" if out_at else "NOT_EXITED"
        in_status = "NOT_RETURNED" if not in_at else "ON_TIME"

        if out_filter in ("EXITED", "NOT_EXITED") and out_status != out_filter:
            continue
        if in_filter in ("ON_TIME", "LATE", "NOT_RETURNED") and in_status != in_filter:
            continue

        rows.append(
            {
                "application_id": int(entry.get("application_id") or 0),
                "uid": entry.get("uid"),
                "user_username": entry.get("user_username"),
                "user_name": entry.get("user_name"),
                "user_role": entry.get("user_role"),
                "department_name": entry.get("department_name"),
                "reg_no": entry.get("reg_no"),
                "staff_id": entry.get("staff_id"),
                "profile_image_url": entry.get("profile_image_url"),
                "gate_username": entry.get("gate_username"),
                "mode": "OFFLINE",
                "status": "",
                "reason": "",
                "out_status": out_status,
                "in_status": in_status,
                "out_at": out_at,
                "in_at": in_at,
                "log_at": None,
                "__sort_dt": entry.get("__sort_dt"),
            }
        )

    return rows[:limit]


class ManageGatesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        if not _has_gate_management_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        gates = RFReaderGate.objects.all().order_by("name")
        return Response(RFReaderGateSerializer(gates, many=True).data)

    def post(self, request, *args, **kwargs):
        if not _has_gate_management_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = RFReaderGateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gate = serializer.save()
        return Response(RFReaderGateSerializer(gate).data, status=status.HTTP_201_CREATED)


class ManageGateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk: int, *args, **kwargs):
        if not _has_gate_management_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            gate = RFReaderGate.objects.get(pk=pk)
        except RFReaderGate.DoesNotExist:
            return Response({"detail": "Gate not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = RFReaderGateSerializer(gate, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        gate = serializer.save()
        return Response(RFReaderGateSerializer(gate).data)

    def delete(self, request, pk: int, *args, **kwargs):
        if not _has_gate_management_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            gate = RFReaderGate.objects.get(pk=pk)
        except RFReaderGate.DoesNotExist:
            return Response({"detail": "Gate not found."}, status=status.HTTP_404_NOT_FOUND)

        gate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ManageSecurityUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        if not _has_security_user_management_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        qs = StaffProfile.objects.select_related("user", "department").filter(user__roles__name__iexact="SECURITY")
        qs = qs.order_by("staff_id")
        return Response(SecurityStaffProfileSerializer(qs, many=True).data)

    def post(self, request, *args, **kwargs):
        if not _has_security_user_management_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = SecurityStaffProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff_profile = serializer.save()
        return Response(SecurityStaffProfileSerializer(staff_profile).data, status=status.HTTP_201_CREATED)


class ManageSecurityUserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk: int, *args, **kwargs):
        if not _has_security_user_management_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            staff_profile = StaffProfile.objects.select_related("user", "department").get(pk=pk)
        except StaffProfile.DoesNotExist:
            return Response({"detail": "Staff not found."}, status=status.HTTP_404_NOT_FOUND)

        # Only allow edits for users who currently have SECURITY role
        if not staff_profile.user.roles.filter(name__iexact="SECURITY").exists():
            return Response({"detail": "Target user is not a SECURITY user."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = SecurityStaffProfileSerializer(staff_profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        staff_profile = serializer.save()
        return Response(SecurityStaffProfileSerializer(staff_profile).data)


class RFReaderScanExportCsvView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        if not _has_offline_data_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        gate_id = str(request.query_params.get("gate_id") or "").strip()
        date_from = str(request.query_params.get("from") or "").strip()
        date_to = str(request.query_params.get("to") or "").strip()
        limit_raw = str(request.query_params.get("limit") or "2000").strip()
        try:
            limit = max(1, min(int(limit_raw), 20000))
        except Exception:
            limit = 2000

        qs = RFReaderScan.objects.select_related("gate", "student").all().order_by("-scanned_at")
        if gate_id:
            try:
                qs = qs.filter(gate_id=int(gate_id))
            except Exception:
                pass

        d_from = _parse_any_date(date_from)
        d_to = _parse_any_date(date_to)
        tz = timezone.get_current_timezone()
        if d_from:
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            qs = qs.filter(scanned_at__gte=start_dt)
        if d_to:
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
            qs = qs.filter(scanned_at__lte=end_dt)

        rows = list(qs[:limit])

        import csv
        from django.http import HttpResponse

        resp = HttpResponse(content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename="rfreader_scans.csv"'
        writer = csv.writer(resp)
        writer.writerow(["scan_id", "scanned_at", "gate", "uid", "student_roll_no", "student_name", "source"])
        for scan in rows:
            writer.writerow(
                [
                    scan.pk,
                    scan.scanned_at.isoformat() if scan.scanned_at else "",
                    getattr(scan.gate, "name", "") if scan.gate else "",
                    scan.uid,
                    getattr(scan.student, "roll_no", "") if scan.student else "",
                    getattr(scan.student, "name", "") if scan.student else "",
                    scan.source,
                ]
            )
        return resp


def _extract_reason(app: app_models.Application) -> Optional[str]:
    """Best-effort extraction of a human reason/purpose from ApplicationData."""
    try:
        rows = list(app.data.select_related("field").all())
    except Exception:
        return None

    preferred_keys = [
        "reason",
        "purpose",
        "remarks",
        "remark",
        "notes",
        "note",
        "message",
        "description",
    ]

    def normalize(v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, dict):
            # common patterns
            for k in ("text", "reason", "remarks", "note", "message", "description", "value"):
                if k in v and v.get(k) not in (None, ""):
                    return str(v.get(k)).strip()
            return ""
        if isinstance(v, (list, tuple)):
            return " ".join(str(x).strip() for x in v if str(x).strip())
        return str(v).strip()

    # First: match preferred keys
    for row in rows:
        try:
            key = str(getattr(row.field, "field_key", "") or "").strip().lower()
        except Exception:
            key = ""
        if key and key in preferred_keys:
            txt = normalize(getattr(row, "value", None))
            if txt:
                return txt

    # Second: fallback any TEXT/textarea-like field with content
    for row in rows:
        try:
            ftype = str(getattr(row.field, "field_type", "") or "").upper()
        except Exception:
            ftype = ""
        if ftype in ("TEXT",):
            txt = normalize(getattr(row, "value", None))
            if txt:
                return txt

    return None


class GatepassLogsView(APIView):
    """GET /api/idscan/gatepass-logs/

    HR view: returns gatepass-related application rows with scan status.

    Query params:
      - role: STUDENT|STAFF
      - department_id: int
      - status: application current_state
      - out: EXITED|NOT_EXITED
      - in: ON_TIME|LATE|NOT_RETURNED
            - from: YYYY-MM-DD (inclusive; filters by OUT/IN scan time, with created_at fallback)
            - to: YYYY-MM-DD (inclusive)
      - q: search (name/username/reg_no/staff_id)
      - limit: int (default 200, max 2000)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        if not _has_gate_management_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        role = str(request.query_params.get("role") or "").strip().upper()
        status_filter = str(request.query_params.get("status") or "").strip().upper()
        out_filter = str(request.query_params.get("out") or "").strip().upper()
        in_filter = str(request.query_params.get("in") or "").strip().upper()
        q = str(request.query_params.get("q") or "").strip()

        def _parse_date_param(raw: str, *, is_end: bool) -> Optional[datetime]:
            raw = str(raw or "").strip()
            if not raw:
                return None
            try:
                # Accept YYYY-MM-DD
                d = date.fromisoformat(raw)
                if is_end:
                    dt = datetime(d.year, d.month, d.day, 23, 59, 59, 999999)
                else:
                    dt = datetime(d.year, d.month, d.day, 0, 0, 0)
                return _ensure_aware(dt)
            except Exception:
                return None

        from_dt = _parse_date_param(request.query_params.get("from") or "", is_end=False)
        to_dt = _parse_date_param(request.query_params.get("to") or "", is_end=True)

        try:
            base_url = str(request.build_absolute_uri("/") or "").rstrip("/")
        except Exception:
            base_url = ""

        dept_raw = str(request.query_params.get("department_id") or "").strip()
        dept_id: Optional[int] = None
        if dept_raw:
            try:
                dept_id = int(dept_raw)
            except Exception:
                dept_id = None

        limit_raw = str(request.query_params.get("limit") or "200").strip()
        try:
            limit = max(1, min(int(limit_raw), 2000))
        except Exception:
            limit = 200

        qs = (
            app_models.Application.objects
            .select_related(
                "application_type",
                "applicant_user",
                "student_profile__section__batch__course__department",
                "student_profile__home_department",
                "staff_profile__department",
                "gatepass_scanned_by",
                "gatepass_in_scanned_by",
            )
            .prefetch_related("data__field")
            .all()
            .order_by("-created_at")
        )

        if from_dt or to_dt:
            # Filter by scan times (OUT/IN) when present.
            # Only fall back to created_at when there are no scans.
            scanned_any = Q(gatepass_scanned_at__isnull=False) | Q(gatepass_in_scanned_at__isnull=False)
            scanned_range = Q()
            if from_dt:
                scanned_range &= Q(gatepass_scanned_at__gte=from_dt) | Q(gatepass_in_scanned_at__gte=from_dt)
            if to_dt:
                scanned_range &= Q(gatepass_scanned_at__lte=to_dt) | Q(gatepass_in_scanned_at__lte=to_dt)

            no_scans_created = Q(gatepass_scanned_at__isnull=True, gatepass_in_scanned_at__isnull=True)
            if from_dt:
                no_scans_created &= Q(created_at__gte=from_dt)
            if to_dt:
                no_scans_created &= Q(created_at__lte=to_dt)

            qs = qs.filter((scanned_any & scanned_range) | no_scans_created)

        if status_filter:
            qs = qs.filter(current_state__iexact=status_filter)

        if role == "STUDENT":
            qs = qs.filter(student_profile__isnull=False)
        elif role == "STAFF":
            qs = qs.filter(staff_profile__isnull=False)

        if dept_id is not None:
            qs = qs.filter(
                Q(staff_profile__department_id=dept_id)
                | Q(student_profile__section__batch__course__department_id=dept_id)
                | Q(student_profile__home_department_id=dept_id)
            )

        if q:
            qs = qs.filter(
                Q(applicant_user__username__icontains=q)
                | Q(applicant_user__first_name__icontains=q)
                | Q(applicant_user__last_name__icontains=q)
                | Q(student_profile__reg_no__icontains=q)
                | Q(student_profile__reg_no__icontains=q)
                | Q(staff_profile__staff_id__icontains=q)
            )

        results: list[dict] = []

        # Include OFFLINE pulled scans directly in logs.
        # These are minimal rows and do not depend on having an Application.
        if not status_filter:
            offline_rows = _build_offline_log_rows(
                role_filter=role,
                dept_id=dept_id,
                out_filter=out_filter,
                in_filter=in_filter,
                q=q,
                from_dt=from_dt,
                to_dt=to_dt,
                base_url=base_url,
                limit=limit,
            )
            results.extend(offline_rows)
        # Read a larger slice to account for non-gatepass applications.
        # This keeps the endpoint fast while still returning enough rows.
        remaining = max(0, limit - len(results))
        scan_cap = min(max(remaining, 1) * 10, 5000)
        for app in qs[:scan_cap]:
            if len(results) >= limit:
                break

            gate_window = _extract_gate_window(app)
            # Only show gatepass-like applications (have a gate window) OR those that already have scans.
            if not gate_window and not (app.gatepass_scanned_at or app.gatepass_in_scanned_at):
                continue

            out_status = "EXITED" if app.gatepass_scanned_at else "NOT_EXITED"
            if out_filter and out_filter in ("EXITED", "NOT_EXITED") and out_status != out_filter:
                continue

            if app.gatepass_in_scanned_at:
                end_dt = gate_window.get("end") if isinstance(gate_window, dict) else None
                late = bool(end_dt and app.gatepass_in_scanned_at > end_dt)
                in_status = "LATE" if late else "ON_TIME"
            else:
                in_status = "NOT_RETURNED"

            if in_filter and in_filter in ("ON_TIME", "LATE", "NOT_RETURNED") and in_status != in_filter:
                continue

            applicant_role = "STUDENT" if app.student_profile_id else ("STAFF" if app.staff_profile_id else None)

            uid = None
            reg_no = None
            staff_id = None
            profile_image_url = None
            try:
                if app.student_profile:
                    uid = getattr(app.student_profile, "rfid_uid", None) or None
                    reg_no = getattr(app.student_profile, "reg_no", None) or None
                    profile_image_url = (
                        app.student_profile.profile_image.url if getattr(app.student_profile, "profile_image", None) else None
                    )
                elif app.staff_profile:
                    uid = getattr(app.staff_profile, "rfid_uid", None) or None
                    staff_id = getattr(app.staff_profile, "staff_id", None) or None
                    profile_image_url = (
                        app.staff_profile.profile_image.url if getattr(app.staff_profile, "profile_image", None) else None
                    )
            except Exception:
                pass

            try:
                if profile_image_url and str(profile_image_url).startswith("/") and base_url:
                    profile_image_url = f"{base_url}{profile_image_url}"
            except Exception:
                pass

            dept_name = None
            try:
                if app.staff_profile and getattr(app.staff_profile, "department", None):
                    dept_name = app.staff_profile.department.name
                elif app.student_profile:
                    sp = app.student_profile
                    if getattr(sp, "section", None) and getattr(sp.section, "batch", None) and getattr(sp.section.batch, "course", None):
                        dept_name = sp.section.batch.course.department.name
                    elif getattr(sp, "home_department", None):
                        dept_name = sp.home_department.name
            except Exception:
                dept_name = None

            gate_user = app.gatepass_in_scanned_by or app.gatepass_scanned_by
            gate_username = getattr(gate_user, "username", None) if gate_user else None

            mode = "ONLINE"
            try:
                if str(getattr(app, "gatepass_scanned_mode", "ONLINE") or "").upper() == "OFFLINE":
                    mode = "OFFLINE"
                if str(getattr(app, "gatepass_in_scanned_mode", "ONLINE") or "").upper() == "OFFLINE":
                    mode = "OFFLINE"
            except Exception:
                mode = "ONLINE"

            out_at = None
            in_at = None
            try:
                if app.gatepass_scanned_at:
                    out_at = timezone.localtime(app.gatepass_scanned_at).isoformat()
            except Exception:
                out_at = app.gatepass_scanned_at.isoformat() if app.gatepass_scanned_at else None
            try:
                if app.gatepass_in_scanned_at:
                    in_at = timezone.localtime(app.gatepass_in_scanned_at).isoformat()
            except Exception:
                in_at = app.gatepass_in_scanned_at.isoformat() if app.gatepass_in_scanned_at else None

            # Offline rows should appear in logs with minimal info.
            if mode == "OFFLINE":
                current_state = ""
                reason = ""
            else:
                current_state = app.current_state
                reason = _extract_reason(app)

            sort_dt = None
            try:
                sort_dt = app.gatepass_in_scanned_at or app.gatepass_scanned_at or app.created_at
            except Exception:
                sort_dt = None
            if sort_dt:
                try:
                    sort_dt = timezone.localtime(sort_dt)
                except Exception:
                    pass
            log_at = sort_dt.isoformat() if sort_dt else None

            results.append(
                {
                    "application_id": app.id,
                    "uid": uid,
                    "user_username": getattr(app.applicant_user, "username", None),
                    "user_name": _display_name(app.applicant_user),
                    "user_role": applicant_role,
                    "department_name": dept_name,
                    "reg_no": reg_no,
                    "staff_id": staff_id,
                    "profile_image_url": profile_image_url,
                    "gate_username": gate_username,
                    "mode": mode,
                    "status": current_state,
                    "reason": reason,
                    "out_status": out_status,
                    "in_status": in_status,
                    "out_at": out_at,
                    "in_at": in_at,
                    "log_at": log_at,
                    "__sort_dt": sort_dt,
                }
            )

        # Ensure the combined OFFLINE + ONLINE list is ordered by the most recent activity.
        def _row_dt(row: dict) -> Optional[datetime]:
            dt = row.get("__sort_dt")
            if isinstance(dt, datetime):
                return dt
            # Fallback: parse log_at/out_at/in_at if needed
            for k in ("log_at", "out_at", "in_at"):
                v = row.get(k)
                if not v:
                    continue
                try:
                    parsed = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
                    return _ensure_aware(parsed)
                except Exception:
                    continue
            return None

        results.sort(key=lambda r: _row_dt(r) or datetime.min.replace(tzinfo=timezone.get_current_timezone()), reverse=True)
        for r in results:
            r.pop("__sort_dt", None)
            # Fill log_at for offline rows if missing.
            if not r.get("log_at"):
                dt = _row_dt(r)
                if dt:
                    try:
                        r["log_at"] = timezone.localtime(dt).isoformat()
                    except Exception:
                        r["log_at"] = dt.isoformat()

        return Response({"results": results[:limit]}, status=status.HTTP_200_OK)


class GatepassOfflineSecurityUsersView(APIView):
    """GET /api/idscan/gatepass-offline/security-users/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        if not _has_offline_data_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        User = get_user_model()
        qs = (
            User.objects.filter(user_roles__role__name__iexact="SECURITY")
            .distinct()
            .select_related("staff_profile__department")
            .order_by("username")
        )

        items: list[dict] = []
        for u in qs[:500]:
            dept = None
            try:
                sp = getattr(u, "staff_profile", None)
                dep = getattr(sp, "department", None) if sp is not None else None
                dept = getattr(dep, "short_name", None) or getattr(dep, "name", None)
            except Exception:
                dept = None

            items.append(
                {
                    "id": u.id,
                    "username": getattr(u, "username", None),
                    "name": _display_name(u),
                    "department": dept,
                }
            )

        return Response({"results": items}, status=status.HTTP_200_OK)


class GatepassOfflineRecordsView(APIView):
    """GET /api/idscan/gatepass-offline/ — list pending OFFLINE scans."""

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        if not _has_offline_data_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        role = str(request.query_params.get("role") or "").strip().upper()
        direction = str(request.query_params.get("direction") or "").strip().upper()
        q = str(request.query_params.get("q") or "").strip()

        dept_raw = str(request.query_params.get("department_id") or "").strip()
        dept_id: Optional[int] = None
        if dept_raw:
            try:
                dept_id = int(dept_raw)
            except Exception:
                dept_id = None

        limit_raw = str(request.query_params.get("limit") or "200").strip()
        try:
            limit = max(1, min(int(limit_raw), 2000))
        except Exception:
            limit = 200

        qs = GatepassOfflineScan.objects.filter(status=GatepassOfflineScan.Status.PENDING).order_by("-recorded_at")
        if direction in ("OUT", "IN"):
            qs = qs.filter(direction=direction)

        # Fetch a larger slice; apply role/department filters after resolving UID.
        scan_cap = min(limit * 10, 5000)
        items = list(qs[:scan_cap])

        uids = [i.uid for i in items if i.uid]
        student_qs = (
            StudentProfile.objects.select_related("user", "section__batch__course__department", "home_department")
            .filter(rfid_uid__in=uids)
        )
        staff_qs = (
            StaffProfile.objects.select_related("user", "department")
            .filter(rfid_uid__in=uids)
        )
        student_by_uid: dict[str, StudentProfile] = {str(s.rfid_uid or "").upper(): s for s in student_qs if s.rfid_uid}
        staff_by_uid: dict[str, StaffProfile] = {str(s.rfid_uid or "").upper(): s for s in staff_qs if s.rfid_uid}

        results: list[dict] = []
        for rec in items:
            if len(results) >= limit:
                break

            uid_norm = _normalize_uid(rec.uid)

            resolved_role: Optional[str] = None
            resolved_name: Optional[str] = None
            resolved_username: Optional[str] = None
            resolved_dept_id: Optional[int] = None
            resolved_dept_name: Optional[str] = None

            if uid_norm in student_by_uid:
                sp = student_by_uid[uid_norm]
                resolved_role = "STUDENT"
                try:
                    resolved_username = getattr(getattr(sp, "user", None), "username", None)
                    resolved_name = _display_name(getattr(sp, "user", None))
                except Exception:
                    pass
                try:
                    dep = getattr(getattr(getattr(sp, "section", None), "batch", None), "course", None)
                    dep = getattr(dep, "department", None)
                    if dep is None:
                        dep = getattr(sp, "home_department", None)
                    resolved_dept_id = getattr(dep, "id", None)
                    resolved_dept_name = getattr(dep, "short_name", None) or getattr(dep, "name", None)
                except Exception:
                    pass

            elif uid_norm in staff_by_uid:
                sp = staff_by_uid[uid_norm]
                resolved_role = "STAFF"
                try:
                    resolved_username = getattr(getattr(sp, "user", None), "username", None)
                    resolved_name = _display_name(getattr(sp, "user", None))
                except Exception:
                    pass
                try:
                    dep = getattr(sp, "department", None)
                    resolved_dept_id = getattr(dep, "id", None)
                    resolved_dept_name = getattr(dep, "short_name", None) or getattr(dep, "name", None)
                except Exception:
                    pass

            if role in ("STUDENT", "STAFF") and resolved_role != role:
                continue
            if dept_id is not None and (not resolved_dept_id or int(resolved_dept_id) != int(dept_id)):
                continue

            if q:
                q_low = q.lower()
                hay = " ".join(
                    [
                        rec.uid or "",
                        uid_norm,
                        resolved_username or "",
                        resolved_name or "",
                        resolved_dept_name or "",
                    ]
                ).lower()
                if q_low not in hay:
                    continue

            results.append(
                {
                    "id": rec.id,
                    "uid": uid_norm,
                    "direction": rec.direction,
                    "recorded_at": rec.recorded_at.isoformat() if rec.recorded_at else None,
                    "device_label": rec.device_label or "",
                    "user_role": resolved_role,
                    "user_username": resolved_username,
                    "user_name": resolved_name,
                    "department_id": resolved_dept_id,
                    "department_name": resolved_dept_name,
                    "pull_error": rec.pull_error or "",
                }
            )

        return Response({"results": results}, status=status.HTTP_200_OK)


class GatepassOfflineUploadView(APIView):
    """POST /api/idscan/gatepass-offline/upload/

    Accepts { device_label?: string, records: [{uid, direction, recorded_at}] }
    Stores as PENDING for HR to Pull/Ignore.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if not _has_scan_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        device_label = str(request.data.get("device_label") or "").strip()[:120]
        records = request.data.get("records")
        if not isinstance(records, list) or not records:
            return Response({"error": "records must be a non-empty array"}, status=status.HTTP_400_BAD_REQUEST)

        created = 0
        skipped = 0
        now = timezone.now()

        for raw in records[:2000]:
            if not isinstance(raw, dict):
                continue
            uid = _normalize_uid(str(raw.get("uid") or ""))
            direction = str(raw.get("direction") or "OUT").strip().upper()
            if direction not in ("OUT", "IN"):
                direction = "OUT"
            if not uid:
                continue

            recorded_at_raw = raw.get("recorded_at")
            dt: Optional[datetime] = None
            try:
                if isinstance(recorded_at_raw, str) and recorded_at_raw:
                    dt = datetime.fromisoformat(recorded_at_raw.replace("Z", "+00:00"))
                elif isinstance(recorded_at_raw, datetime):
                    dt = recorded_at_raw
            except Exception:
                dt = None

            if dt is None:
                dt = now
            dt = _ensure_aware(dt)

            if GatepassOfflineScan.objects.filter(uid=uid, direction=direction, recorded_at=dt).exists():
                skipped += 1
                continue

            GatepassOfflineScan.objects.create(
                uid=uid,
                direction=direction,
                recorded_at=dt,
                device_label=device_label,
                uploaded_by=request.user,
            )
            created += 1

        return Response({"created": created, "skipped": skipped}, status=status.HTTP_200_OK)


class GatepassOfflinePullView(APIView):
    """POST /api/idscan/gatepass-offline/<id>/pull/  Body: { security_user_id }"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int, *args, **kwargs):
        if not _has_offline_data_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            rec = GatepassOfflineScan.objects.get(pk=pk)
        except GatepassOfflineScan.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if rec.status != GatepassOfflineScan.Status.PENDING:
            return Response({"error": "Record is not pending"}, status=status.HTTP_409_CONFLICT)

        sec_id = request.data.get("security_user_id")
        if not sec_id:
            return Response({"error": "security_user_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        sec = User.objects.filter(pk=sec_id).first()
        if not sec or not _is_security_user(sec):
            return Response({"error": "Invalid security user"}, status=status.HTTP_400_BAD_REQUEST)

        rec.status = GatepassOfflineScan.Status.PULLED
        rec.pulled_at = timezone.now()
        rec.pulled_by = request.user
        rec.pulled_security_user = sec
        rec.pull_error = ""
        rec.save(update_fields=["status", "pulled_at", "pulled_by", "pulled_security_user", "pull_error"])

        # Do not require an Application to exist for OFFLINE pulls.
        # Pulled records will appear in Gatepass Logs from GatepassOfflineScan.
        return Response({"success": True, "message": "Pulled."}, status=status.HTTP_200_OK)


class GatepassOfflineIgnoreView(APIView):
    """POST /api/idscan/gatepass-offline/<id>/ignore/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int, *args, **kwargs):
        if not _has_offline_data_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            rec = GatepassOfflineScan.objects.get(pk=pk)
        except GatepassOfflineScan.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if rec.status != GatepassOfflineScan.Status.PENDING:
            return Response({"error": "Record is not pending"}, status=status.HTTP_409_CONFLICT)

        rec.status = GatepassOfflineScan.Status.IGNORED
        rec.ignored_at = timezone.now()
        rec.ignored_by = request.user
        rec.pull_error = ""
        rec.save(update_fields=["status", "ignored_at", "ignored_by", "pull_error"])

        return Response({"success": True}, status=status.HTTP_200_OK)


class GatepassOfflinePullAllView(APIView):
    """POST /api/idscan/gatepass-offline/pull-all/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if not _has_offline_data_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        sec_id = request.data.get("security_user_id")
        if not sec_id:
            return Response({"error": "security_user_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        sec = User.objects.filter(pk=sec_id).first()
        if not sec or not _is_security_user(sec):
            return Response({"error": "Invalid security user"}, status=status.HTTP_400_BAD_REQUEST)

        role = str(request.data.get("role") or "").strip().upper()
        direction = str(request.data.get("direction") or "").strip().upper()
        q = str(request.data.get("q") or "").strip()
        dept_id = request.data.get("department_id")
        try:
            dept_id_int = int(dept_id) if dept_id not in (None, "") else None
        except Exception:
            dept_id_int = None

        limit_raw = str(request.data.get("limit") or "500").strip()
        try:
            limit = max(1, min(int(limit_raw), 5000))
        except Exception:
            limit = 500

        pending = GatepassOfflineScan.objects.filter(status=GatepassOfflineScan.Status.PENDING).order_by("-recorded_at")
        if direction in ("OUT", "IN"):
            pending = pending.filter(direction=direction)
        if q:
            pending = pending.filter(uid__icontains=q)

        recs = list(pending[: min(limit * 10, 5000)])
        pulled = 0
        failed = 0
        for rec in recs:
            if pulled + failed >= limit:
                break
            uid_norm = _normalize_uid(rec.uid)
            p_type, p_data, _u = _resolve_profile_by_uid(uid_norm)
            resolved_role = "STUDENT" if p_type == "student" else "STAFF" if p_type == "staff" else None
            dep_id_res, _dep_name_res = _extract_department_for_profile(p_type, p_data)

            if role in ("STUDENT", "STAFF") and resolved_role != role:
                continue
            if dept_id_int is not None and (not dep_id_res or int(dep_id_res) != int(dept_id_int)):
                continue

            rec.status = GatepassOfflineScan.Status.PULLED
            rec.pulled_at = timezone.now()
            rec.pulled_by = request.user
            rec.pulled_security_user = sec
            rec.pull_error = ""
            rec.save(update_fields=["status", "pulled_at", "pulled_by", "pulled_security_user", "pull_error"])
            pulled += 1

        return Response({"pulled": pulled, "failed": failed}, status=status.HTTP_200_OK)


class GatepassOfflineIgnoreAllView(APIView):
    """POST /api/idscan/gatepass-offline/ignore-all/"""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if not _has_offline_data_permission(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        role = str(request.data.get("role") or "").strip().upper()
        direction = str(request.data.get("direction") or "").strip().upper()
        q = str(request.data.get("q") or "").strip()
        dept_id = request.data.get("department_id")
        try:
            dept_id_int = int(dept_id) if dept_id not in (None, "") else None
        except Exception:
            dept_id_int = None

        limit_raw = str(request.data.get("limit") or "500").strip()
        try:
            limit = max(1, min(int(limit_raw), 5000))
        except Exception:
            limit = 500

        pending = GatepassOfflineScan.objects.filter(status=GatepassOfflineScan.Status.PENDING).order_by("-recorded_at")
        if direction in ("OUT", "IN"):
            pending = pending.filter(direction=direction)
        if q:
            pending = pending.filter(uid__icontains=q)

        recs = list(pending[: min(limit * 10, 5000)])
        ignored = 0
        for rec in recs:
            if ignored >= limit:
                break

            uid_norm = _normalize_uid(rec.uid)
            p_type, p_data, _u = _resolve_profile_by_uid(uid_norm)
            resolved_role = "STUDENT" if p_type == "student" else "STAFF" if p_type == "staff" else None
            dep_id_res, _dep_name_res = _extract_department_for_profile(p_type, p_data)

            if role in ("STUDENT", "STAFF") and resolved_role != role:
                continue
            if dept_id_int is not None and (not dep_id_res or int(dep_id_res) != int(dept_id_int)):
                continue

            rec.status = GatepassOfflineScan.Status.IGNORED
            rec.ignored_at = timezone.now()
            rec.ignored_by = request.user
            rec.pull_error = ""
            rec.save(update_fields=["status", "ignored_at", "ignored_by", "pull_error"])
            ignored += 1

        return Response({"ignored": ignored}, status=status.HTTP_200_OK)


def _parse_clock_time(value: Any) -> Optional[time]:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    for fmt in ("%I:%M %p", "%I:%M:%S %p"):
        try:
            return datetime.strptime(raw.upper(), fmt).time()
        except ValueError:
            continue
    return None


def _parse_any_date(value: Any):
    raw = str(value or "").strip()
    if not raw:
        return None

    d = parse_date(raw)
    if d:
        return d

    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue

    return None


def _extract_gate_window(app: app_models.Application) -> Optional[dict]:
    """
    Build an allowed scan window from composite application fields.

    Supported field types:
    - DATE IN OUT  -> Date + In Time + Out Time
    - DATE OUT IN  -> Date + Out Time + In Time
    """
    rows = app.data.select_related("field").all()

    for row in sorted(rows, key=lambda r: (getattr(r.field, "order", 0), getattr(r.field, "field_key", ""))):
        ftype = str(getattr(row.field, "field_type", "") or "").upper()
        if ftype not in ("DATE IN OUT", "DATE OUT IN"):
            continue

        payload = row.value if isinstance(row.value, dict) else {}
        date_str = str(payload.get("date") or "").strip()
        day = _parse_any_date(date_str)
        if not day:
            continue

        out_t = _parse_clock_time(payload.get("out_time"))
        in_t = _parse_clock_time(payload.get("in_time"))

        # Build candidate interpretations and choose the most plausible duration
        # (shorter gatepass window). This protects against swapped field-key mappings.
        candidates: list[tuple[time, time]] = []
        if out_t and in_t:
            candidates.append((out_t, in_t))
            candidates.append((in_t, out_t))

        # Backward-compatible fallback for legacy payload variants.
        if ftype == "DATE IN OUT":
            legacy_start_key, legacy_end_key = "in_time", "out_time"
        else:
            legacy_start_key, legacy_end_key = "out_time", "in_time"

        legacy_start_t = _parse_clock_time(payload.get(legacy_start_key))
        legacy_end_t = _parse_clock_time(payload.get(legacy_end_key))
        if legacy_start_t and legacy_end_t:
            candidates.append((legacy_start_t, legacy_end_t))

        if not candidates:
            continue

        def _duration_seconds(start_time: time, end_time: time) -> int:
            start_seconds = start_time.hour * 3600 + start_time.minute * 60 + start_time.second
            end_seconds = end_time.hour * 3600 + end_time.minute * 60 + end_time.second
            if end_seconds <= start_seconds:
                end_seconds += 24 * 3600
            return end_seconds - start_seconds

        # Prefer the shortest practical window to avoid accidental 22h reversal.
        start_t, end_t = min(candidates, key=lambda pair: _duration_seconds(pair[0], pair[1]))

        tz = timezone.get_current_timezone()
        start_dt = timezone.make_aware(datetime.combine(day, start_t), tz)
        end_dt = timezone.make_aware(datetime.combine(day, end_t), tz)
        # If end is earlier than start, treat as overnight window.
        if end_dt <= start_dt:
            end_dt = end_dt + timedelta(days=1)

        return {
            "field_key": getattr(row.field, "field_key", ""),
            "field_type": ftype,
            "start": start_dt,
            "end": end_dt,
        }

    # Fallback: separate DATE + TIME fields
    # (best-effort; prefers time fields whose key/label contain 'in'/'out')
    date_day = None
    for row in sorted(rows, key=lambda r: (getattr(r.field, "order", 0), getattr(r.field, "field_key", ""))):
        ftype = str(getattr(row.field, "field_type", "") or "").upper()
        if ftype != "DATE":
            continue
        val = row.value
        if isinstance(val, dict) and "date" in val:
            raw = str(val.get("date") or "").strip()
        else:
            raw = str(val or "").strip()
        date_day = _parse_any_date(raw)
        if date_day:
            break

    if date_day:
        time_rows: list[tuple[Optional[str], time]] = []
        for row in sorted(rows, key=lambda r: (getattr(r.field, "order", 0), getattr(r.field, "field_key", ""))):
            ftype = str(getattr(row.field, "field_type", "") or "").upper()
            if ftype != "TIME":
                continue
            t = _parse_clock_time(row.value)
            if not t:
                continue
            key = str(getattr(row.field, "field_key", "") or "").lower()
            label = str(getattr(row.field, "label", "") or "").lower()
            role = None
            if "in" in key or "in" in label:
                role = "in"
            if "out" in key or "out" in label:
                role = "out" if role is None else role
            time_rows.append((role, t))

        if len(time_rows) >= 2:
            in_t = next((t for role, t in time_rows if role == "in"), None)
            out_t = next((t for role, t in time_rows if role == "out"), None)
            if not in_t or not out_t:
                times_only = [t for _, t in time_rows]
                in_t = min(times_only)
                out_t = max(times_only)

            def _duration_seconds(start_time: time, end_time: time) -> int:
                start_seconds = start_time.hour * 3600 + start_time.minute * 60 + start_time.second
                end_seconds = end_time.hour * 3600 + end_time.minute * 60 + end_time.second
                if end_seconds <= start_seconds:
                    end_seconds += 24 * 3600
                return end_seconds - start_seconds

            # If inferred roles are swapped in config, pick the plausible shorter window.
            cand_a = (out_t, in_t)
            cand_b = (in_t, out_t)
            start_t, end_t = min((cand_a, cand_b), key=lambda pair: _duration_seconds(pair[0], pair[1]))

            tz = timezone.get_current_timezone()
            start_dt = timezone.make_aware(datetime.combine(date_day, start_t), tz)
            end_dt = timezone.make_aware(datetime.combine(date_day, end_t), tz)
            if end_dt <= start_dt:
                end_dt = end_dt + timedelta(days=1)

            return {
                "field_key": None,
                "field_type": "DATE+TIME",
                "start": start_dt,
                "end": end_dt,
            }

    return None


def _gatepass_hard_expiry(app: app_models.Application, window: Optional[dict] = None) -> Optional[datetime]:
    """Gatepass validity hard-stop at next midnight of the selected gate date."""
    base_day = _extract_gate_date(app)
    if base_day is None and isinstance(window, dict):
        start = window.get("start")
        if start is not None:
            try:
                base_day = timezone.localtime(start).date()
            except Exception:
                base_day = start.date()

    if base_day is None:
        return None

    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime.combine(base_day + timedelta(days=1), time.min), tz)


def _extract_gate_date(app: app_models.Application) -> Optional[date]:
    """Best-effort extraction of the gatepass date from application data."""
    rows = app.data.select_related("field").all()
    for row in sorted(rows, key=lambda r: (getattr(r.field, "order", 0), getattr(r.field, "field_key", ""))):
        ftype = str(getattr(row.field, "field_type", "") or "").upper()
        value = row.value

        if ftype in ("DATE IN OUT", "DATE OUT IN"):
            payload = value if isinstance(value, dict) else {}
            day = _parse_any_date(payload.get("date"))
            if day:
                return day

        if ftype == "DATE":
            if isinstance(value, dict) and "date" in value:
                day = _parse_any_date(value.get("date"))
            else:
                day = _parse_any_date(value)
            if day:
                return day

    return None


def _has_gatepass_in_time(app: app_models.Application) -> bool:
    """Return True when the application payload has an explicit IN time configured."""
    rows = app.data.select_related("field").all()
    for row in sorted(rows, key=lambda r: (getattr(r.field, "order", 0), getattr(r.field, "field_key", ""))):
        ftype = str(getattr(row.field, "field_type", "") or "").upper()

        if ftype == "DATE OUT IN":
            payload = row.value if isinstance(row.value, dict) else {}
            return _parse_clock_time(payload.get("in_time")) is not None

        if ftype == "DATE IN OUT":
            payload = row.value if isinstance(row.value, dict) else {}
            return _parse_clock_time(payload.get("out_time")) is not None

    return False


def _is_security_gatepass_application(app: app_models.Application) -> bool:
    """True when application follows a SECURITY-final gatepass flow."""
    flow = _get_flow_for_application(app)
    if not flow:
        return False

    final_step = flow.steps.filter(is_final=True).select_related("role").first()
    if not (final_step and final_step.role and str(final_step.role.name or "").upper() == "SECURITY"):
        return False

    return bool(_extract_gate_window(app) or _extract_gate_date(app))


def _validate_scan_time_window(app: app_models.Application, now: Optional[datetime] = None) -> tuple[bool, Optional[str], Optional[dict]]:
    window = _extract_gate_window(app)
    current = now or timezone.now()

    hard_expiry = _gatepass_hard_expiry(app, window)
    if hard_expiry and current >= hard_expiry:
        msg = "Gatepass expired because the selected date is over (expired at 12:00 AM next day)."
        return False, msg, window

    if not window:
        # Out-only gatepass still expires at day-end of the selected date.
        day = _extract_gate_date(app)
        if not day:
            return True, None, None

        tz = timezone.get_current_timezone()
        start_dt = timezone.make_aware(datetime.combine(day, time.min), tz)
        end_dt = timezone.make_aware(datetime.combine(day, time.max), tz)

        date_window = {
            "field_key": None,
            "field_type": "DATE_ONLY",
            "start": start_dt,
            "end": end_dt,
        }

        if start_dt <= current <= end_dt:
            return True, None, date_window

        msg = (
            "Gatepass is valid only for the selected date and expires at 12:00 AM next day. "
            f"Selected date: {timezone.localtime(start_dt).strftime('%d %b %Y')}."
        )
        return False, msg, date_window

    if window["start"] <= current <= window["end"]:
        return True, None, window

    start_local = timezone.localtime(window["start"])
    end_local = timezone.localtime(window["end"])
    msg = (
        "Gatepass is valid only during the allowed duration: "
        f"{start_local.strftime('%d %b %Y, %I:%M %p')} to {end_local.strftime('%d %b %Y, %I:%M %p')}."
    )
    return False, msg, window


def _student_detail(sp: StudentProfile) -> dict:
    user = sp.user
    display_name = _display_name(user) or getattr(user, "username", "")

    section = None
    batch_name = None
    dept_name = None

    try:
        sec = sp.section
        if sec:
            section = getattr(sec, "name", None)
            b = getattr(sec, "batch", None)
            if b:
                batch_name = str(b)
                c = getattr(b, "course", None)
                d = getattr(c, "department", None)
                if d:
                    dept_name = getattr(d, "name", None)
    except Exception:
        pass

    if not dept_name:
        try:
            hd = sp.home_department
            if hd:
                dept_name = getattr(hd, "name", None)
        except Exception:
            pass

    profile_image_url = None
    if sp.profile_image:
        profile_image_url = sp.profile_image.url

    return {
        "id": sp.pk,
        "reg_no": sp.reg_no,
        "name": display_name,
        "rfid_uid": sp.rfid_uid or None,
        "section": section,
        "batch": batch_name,
        "department": dept_name,
        "status": getattr(sp, "status", None),
        "profile_image_url": profile_image_url,
    }


def _staff_detail(sp: StaffProfile) -> dict:
    user = sp.user
    display_name = _display_name(user) or getattr(user, "username", "")

    dept = getattr(sp, "current_department", None) or getattr(sp, "department", None)
    dept_name = getattr(dept, "name", None) if dept else None

    profile_image_url = None
    if sp.profile_image:
        profile_image_url = sp.profile_image.url

    return {
        "id": sp.pk,
        "staff_id": sp.staff_id,
        "name": display_name,
        "rfid_uid": sp.rfid_uid or None,
        "department": dept_name,
        "designation": getattr(sp, "designation", None),
        "status": getattr(sp, "status", None),
        "profile_image_url": profile_image_url,
    }


def _build_timeline(application: app_models.Application, flow: Any) -> list[dict]:
    steps = list(flow.steps.select_related("role").order_by("order"))
    if not steps:
        return []

    actions = (
        application.actions.order_by("acted_at")
        .select_related("step__role", "acted_by")
    )
    actions_by_step = {a.step_id: a for a in actions if a.step_id is not None}

    first_order = steps[0].order
    last_order = steps[-1].order

    result: list[dict] = []
    for step in steps:
        action = actions_by_step.get(step.id)
        is_starter = step.order == first_order
        is_final = step.order == last_order

        if action:
            raw_status = action.action
            status_val = "SUBMITTED" if is_starter else raw_status
            result.append(
                {
                    "step_order": step.order,
                    "step_role": step.role.name if step.role else None,
                    "is_starter": is_starter,
                    "is_final": is_final,
                    "status": status_val,
                    "acted_by": _display_name(action.acted_by),
                    "acted_at": action.acted_at.isoformat() if action.acted_at else None,
                    "remarks": action.remarks or None,
                }
            )
        else:
            result.append(
                {
                    "step_order": step.order,
                    "step_role": step.role.name if step.role else None,
                    "is_starter": is_starter,
                    "is_final": is_final,
                    "status": "PENDING",
                    "acted_by": None,
                    "acted_at": None,
                    "remarks": None,
                }
            )

    return result


# ── Student endpoints ──────────────────────────────────────────────────────

class LookupByUIDView(APIView):
    """GET /api/idscan/lookup/?uid=<UID> — find a student by RFID UID."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        uid = _normalize_uid(request.query_params.get("uid") or "")
        if not uid:
            return Response({"error": "uid parameter required"}, status=status.HTTP_400_BAD_REQUEST)

        sp = (
            StudentProfile.objects.select_related(
                "user", "section__batch__course__department", "home_department"
            )
            .filter(rfid_uid__iexact=uid)
            .first()
        )
        if not sp:
            return Response({"found": False, "uid": uid}, status=status.HTTP_200_OK)

        return Response({"found": True, "uid": uid, "student": _student_detail(sp)}, status=status.HTTP_200_OK)


class SearchStudentsView(APIView):
    """GET /api/idscan/search/?q=<query> — search students by name or reg_no."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if not _has_card_management_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        q = (request.query_params.get("q") or "").strip()
        if len(q) < 1:
            return Response([], status=status.HTTP_200_OK)

        qs = (
            StudentProfile.objects.select_related(
                "user", "section__batch__course__department", "home_department"
            )
            .filter(
                Q(reg_no__icontains=q)
                | Q(user__username__icontains=q)
                | Q(user__first_name__icontains=q)
                | Q(user__last_name__icontains=q)
            )
            .order_by("reg_no")[:30]
        )
        return Response([_student_detail(sp) for sp in qs], status=status.HTTP_200_OK)


class AssignUIDView(APIView):
    """POST /api/idscan/assign-uid/ — assign UID to a student. Body: { student_id, uid }"""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if not _has_card_management_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get("student_id")
        uid = _normalize_uid(request.data.get("uid") or "")

        if not student_id or not uid:
            return Response({"error": "student_id and uid are required"}, status=status.HTTP_400_BAD_REQUEST)

        # Conflict across students
        conflict = StudentProfile.objects.filter(rfid_uid__iexact=uid).exclude(pk=student_id).first()
        if conflict:
            return Response(
                {"error": f"UID {uid} is already assigned to student {conflict.reg_no}."},
                status=status.HTTP_409_CONFLICT,
            )

        # Conflict across staff
        if StaffProfile.objects.filter(rfid_uid__iexact=uid).exists():
            return Response(
                {"error": f"UID {uid} is already assigned to a staff profile."},
                status=status.HTTP_409_CONFLICT,
            )

        sp = StudentProfile.objects.filter(pk=student_id).first()
        if not sp:
            return Response({"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND)

        sp.rfid_uid = uid
        sp.save(update_fields=["rfid_uid"])
        return Response({"success": True, "student": _student_detail(sp)}, status=status.HTTP_200_OK)


class UnassignUIDView(APIView):
    """POST /api/idscan/unassign-uid/ — remove UID from a student. Body: { student_id }"""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if not _has_card_management_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        student_id = request.data.get("student_id")
        if not student_id:
            return Response({"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        sp = StudentProfile.objects.filter(pk=student_id).first()
        if not sp:
            return Response({"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND)

        sp.rfid_uid = ""
        sp.save(update_fields=["rfid_uid"])
        return Response({"success": True}, status=status.HTTP_200_OK)


# ── Gatepass scan endpoint (student UID) ───────────────────────────────────

class GatepassCheckView(APIView):
    """POST /api/idscan/gatepass-check/ — gate scan approval for student."""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if not _has_scan_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        uid = _normalize_uid(request.data.get("uid") or "")
        if not uid:
            return Response({"error": "uid is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Resolve UID to an applicant profile (student OR staff)
        profile_type: Optional[str] = None
        profile_data: Optional[dict] = None
        applicant_user = None

        sp_student = (
            StudentProfile.objects.select_related(
                "user", "section__batch__course__department", "home_department"
            )
            .filter(rfid_uid__iexact=uid)
            .first()
        )
        if sp_student:
            profile_type = "student"
            profile_data = _student_detail(sp_student)
            applicant_user = sp_student.user
        else:
            sp_staff = (
                StaffProfile.objects.select_related("user", "department")
                .filter(rfid_uid__iexact=uid)
                .first()
            )
            if sp_staff:
                profile_type = "staff"
                profile_data = _staff_detail(sp_staff)
                applicant_user = sp_staff.user

        if not applicant_user:
            return Response(
                {
                    "allowed": False,
                    "reason": "unknown_uid",
                    "message": "This RFID card is not registered to any user.",
                    "profile_type": None,
                    "profile": None,
                    "approval_timeline": [],
                },
                status=status.HTTP_200_OK,
            )

        # Backwards compatible fields
        student_data = profile_data if profile_type == "student" else None
        staff_data = profile_data if profile_type == "staff" else None

        # Find pending app ready for SECURITY final step
        pending_qs = (
            app_models.Application.objects.filter(
                applicant_user=applicant_user,
                current_state__in=["SUBMITTED", "IN_REVIEW"],
                gatepass_scanned_at__isnull=True,
            )
            .select_related("application_type", "current_step__role", "current_step")
        )

        ready_app = None
        ready_flow = None
        blocked_app = None
        blocked_flow = None
        outside_window_message = None
        outside_window_status: Optional[str] = None
        outside_window: Optional[dict] = None
        saw_expired_gatepass = False
        now_ref = timezone.now()

        for app in pending_qs:
            flow = _get_flow_for_application(app)
            if not flow:
                continue
            final_step = flow.steps.filter(is_final=True).select_related("role").first()
            if not (final_step and final_step.role and final_step.role.name.upper() == "SECURITY"):
                continue

            steps = list(flow.steps.select_related("role").order_by("order"))
            actions = {a.step_id: a.action for a in app.actions.all()}
            starter_step = steps[0] if steps else None

            blocking = False
            for step in steps:
                if step.is_final and step.role and step.role.name.upper() == "SECURITY":
                    break
                act = actions.get(step.id)
                if step == starter_step:
                    if not act:
                        blocking = True
                        break
                else:
                    if not act or act not in ("APPROVED", "SKIPPED"):
                        blocking = True
                        break

            if not blocking:
                in_window, window_msg, window = _validate_scan_time_window(app, now_ref)
                if in_window:
                    ready_app = app
                    ready_flow = flow
                    break
                # If gatepass window is already over AND OUT scan not done, treat as expired (not active).
                if isinstance(window, dict):
                    end = window.get('end')
                    if end and now_ref > end and not app.gatepass_scanned_at:
                        saw_expired_gatepass = True
                        continue

                if not outside_window_message:
                    outside_window_message = window_msg
                    outside_window = window
                    if window is not None:
                        start = window.get('start') if isinstance(window, dict) else None
                        end = window.get('end') if isinstance(window, dict) else None

                        if start and now_ref < start:
                            outside_window_status = 'before_start'
                        elif end and now_ref > end:
                            outside_window_status = 'after_end'
            else:
                # A gatepass flow exists but is not fully approved yet.
                # Remember the most recent one so GateScan can show pending role.
                if blocked_app is None or getattr(app, 'created_at', None) and getattr(blocked_app, 'created_at', None) and app.created_at > blocked_app.created_at:
                    blocked_app = app
                    blocked_flow = flow

        # Case: already approved but scan pending
        if ready_app is None:
            approved_qs = app_models.Application.objects.filter(
                applicant_user=applicant_user,
                current_state="APPROVED",
                gatepass_scanned_at__isnull=True,
            ).select_related("application_type")
            for app in approved_qs:
                flow = _get_flow_for_application(app)
                if not flow:
                    continue
                final_step = flow.steps.filter(is_final=True).select_related("role").first()
                if final_step and final_step.role and final_step.role.name.upper() == "SECURITY":
                    in_window, window_msg, window = _validate_scan_time_window(app, now_ref)
                    if in_window:
                        ready_app = app
                        ready_flow = flow
                        break
                    # If gatepass window is already over AND OUT scan not done, treat as expired (not active).
                    if isinstance(window, dict):
                        end = window.get('end')
                        if end and now_ref > end and not app.gatepass_scanned_at:
                            saw_expired_gatepass = True
                            continue

                    if not outside_window_message:
                        outside_window_message = window_msg
                        outside_window = window
                        if window is not None:
                            start = window.get('start') if isinstance(window, dict) else None
                            end = window.get('end') if isinstance(window, dict) else None

                            if start and now_ref < start:
                                outside_window_status = 'before_start'
                            elif end and now_ref > end:
                                outside_window_status = 'after_end'

        # Case: OUT already scanned, allow IN scan (even if after window; will be marked late in UI).
        in_pending = None
        in_pending_qs = (
            app_models.Application.objects.filter(
                applicant_user=applicant_user,
                current_state="APPROVED",
                gatepass_scanned_at__isnull=False,
                gatepass_in_scanned_at__isnull=True,
            )
            .select_related("application_type")
            .order_by("-gatepass_scanned_at")
        )
        for candidate in in_pending_qs[:25]:
            if _is_security_gatepass_application(candidate):
                in_pending = candidate
                break
        if in_pending is not None:
            now = now_ref
            has_in_time = _has_gatepass_in_time(in_pending)
            gate_window = _extract_gate_window(in_pending)
            gate_end = gate_window.get('end') if isinstance(gate_window, dict) else None
            hard_expiry = _gatepass_hard_expiry(in_pending, gate_window)

            if hard_expiry and now >= hard_expiry:
                return Response(
                    {
                        "allowed": False,
                        "reason": "not_approved",
                        "message": "Gatepass expired because selected date ended at 12:00 AM. Apply a new gatepass.",
                        "gatepass_window_start": gate_window['start'].isoformat() if gate_window else None,
                        "gatepass_window_end": gate_window['end'].isoformat() if gate_window else None,
                        "profile_type": profile_type,
                        "profile": profile_data,
                        "student": student_data,
                        "staff": staff_data,
                        "approval_timeline": [],
                    },
                    status=status.HTTP_200_OK,
                )

            # For out-only gatepasses (no IN time), allow IN scan after cooldown.
            # Mark as late only when scan happens after the selected gatepass date.
            late_return = False
            if has_in_time:
                late_return = bool(gate_end and now > gate_end)
            else:
                gate_day = _extract_gate_date(in_pending)
                if gate_day is not None:
                    late_return = timezone.localtime(now).date() > gate_day
            cooldown_until = None
            cooldown_remaining_seconds = 0
            if in_pending.gatepass_scanned_at:
                cooldown_until = in_pending.gatepass_scanned_at + timedelta(minutes=5)
                if now < cooldown_until:
                    cooldown_remaining_seconds = int((cooldown_until - now).total_seconds())
                    return Response(
                        {
                            "allowed": False,
                            "reason": "in_scan_cooldown",
                            "message": "IN scan can be recorded only after 5 minutes from OUT scan.",
                            "cooldown": True,
                            "cooldown_until": cooldown_until.isoformat(),
                            "cooldown_remaining_seconds": max(cooldown_remaining_seconds, 0),
                            "application_id": in_pending.id,
                            "application_type": in_pending.application_type.name,
                            "profile_type": profile_type,
                            "profile": profile_data,
                            "student": student_data,
                            "staff": staff_data,
                            "approval_timeline": [],
                        },
                        status=status.HTTP_200_OK,
                    )

            with transaction.atomic():
                locked = app_models.Application.objects.select_for_update().get(pk=in_pending.pk)
                # Double-check still pending IN scan.
                if locked.gatepass_scanned_at and not locked.gatepass_in_scanned_at:
                    locked.gatepass_in_scanned_at = now
                    locked.gatepass_in_scanned_by = request.user
                    try:
                        locked.gatepass_in_scanned_mode = app_models.Application.GatepassScanMode.ONLINE
                        locked.save(update_fields=["gatepass_in_scanned_at", "gatepass_in_scanned_by", "gatepass_in_scanned_mode"])
                    except Exception:
                        locked.save(update_fields=["gatepass_in_scanned_at", "gatepass_in_scanned_by"])

            flow = _get_flow_for_application(in_pending)
            timeline = _build_timeline(in_pending, flow) if flow else []
            in_scan_message = "IN scan recorded."
            if late_return:
                in_scan_message = "NEW IN & late"
            return Response(
                {
                    "allowed": True,
                    "message": in_scan_message,
                    "late_return": late_return,
                    "gatepass_window_start": gate_window['start'].isoformat() if gate_window else None,
                    "gatepass_window_end": gate_window['end'].isoformat() if gate_window else None,
                    "application_id": in_pending.id,
                    "application_type": in_pending.application_type.name,
                    "scanned_at": now.isoformat(),
                    "profile_type": profile_type,
                    "profile": profile_data,
                    "student": student_data,
                    "staff": staff_data,
                    "approval_timeline": timeline,
                },
                status=status.HTTP_200_OK,
            )

        # If an application is ready but outside window, show the window message.
        # (This must take priority over other pending applications.)
        if ready_app is None and outside_window_message:
            outside_reason = "outside_gate_window"
            outside_msg = outside_window_message
            if outside_window_status == "after_end":
                outside_reason = "not_approved"
                outside_msg = "Gatepass expired because the selected IN time window is over. Apply a new gatepass."
            return Response(
                {
                    "allowed": False,
                    "reason": outside_reason,
                    "message": outside_msg,
                    "window_status": outside_window_status,
                    "gatepass_window_start": outside_window['start'].isoformat() if outside_window else None,
                    "gatepass_window_end": outside_window['end'].isoformat() if outside_window else None,
                    "profile_type": profile_type,
                    "profile": profile_data,
                    "student": student_data,
                    "staff": staff_data,
                    "approval_timeline": [],
                },
                status=status.HTTP_200_OK,
            )

        # Case: gatepass exists but still pending at some role (not fully approved)
        if ready_app is None and blocked_app is not None:
            flow = blocked_flow or _get_flow_for_application(blocked_app)
            timeline = _build_timeline(blocked_app, flow) if flow else []

            current_step = getattr(blocked_app, 'current_step', None)
            current_role = getattr(current_step, 'role', None) if current_step else None
            pending_role = getattr(current_role, 'name', None) if current_role else None

            msg = f"Pending approval at {pending_role}." if pending_role else "Gatepass is pending approval."
            return Response(
                {
                    "allowed": False,
                    "reason": "not_fully_approved",
                    "message": msg,
                    "application_id": blocked_app.id,
                    "application_type": blocked_app.application_type.name if blocked_app.application_type else None,
                    "profile_type": profile_type,
                    "profile": profile_data,
                    "student": student_data,
                    "staff": staff_data,
                    "approval_timeline": timeline,
                },
                status=status.HTTP_200_OK,
            )

        # If the most recent gatepass (SECURITY-final) is rejected, show REJECTED.
        # Important: consider ONLY the latest gatepass-like application, not historical rejections.
        latest_gatepass = None
        latest_gatepass_flow = None
        try:
            recent_apps = (
                app_models.Application.objects.filter(applicant_user=applicant_user)
                .select_related("application_type")
                .order_by("-created_at")[:25]
            )
            for a in recent_apps:
                flow = _get_flow_for_application(a)
                if not flow:
                    continue
                if not _is_security_gatepass_application(a):
                    continue
                latest_gatepass = a
                latest_gatepass_flow = flow
                break
        except Exception:
            latest_gatepass = None
            latest_gatepass_flow = None

        if latest_gatepass is not None and str(latest_gatepass.current_state or "").upper() == "REJECTED":
            timeline = _build_timeline(latest_gatepass, latest_gatepass_flow) if latest_gatepass_flow else []
            return Response(
                {
                    "allowed": False,
                    "reason": "not_approved",
                    "message": "Gatepass was rejected.",
                    "application_id": latest_gatepass.id,
                    "application_type": latest_gatepass.application_type.name if latest_gatepass.application_type else None,
                    "profile_type": profile_type,
                    "profile": profile_data,
                    "student": student_data,
                    "staff": staff_data,
                    "approval_timeline": timeline,
                },
                status=status.HTTP_200_OK,
            )

        # If only expired gatepasses exist, treat as no active gatepass.
        if ready_app is None and saw_expired_gatepass:
            return Response(
                {
                    "allowed": False,
                    "reason": "not_approved",
                    "message": "Gatepass expired because allowed time is over. Apply a new gatepass.",
                    "profile_type": profile_type,
                    "profile": profile_data,
                    "student": student_data,
                    "staff": staff_data,
                    "approval_timeline": [],
                },
                status=status.HTTP_200_OK,
            )

        if ready_app is not None:
            now = now_ref
            with transaction.atomic():
                locked = app_models.Application.objects.select_for_update().get(pk=ready_app.pk)

                if locked.current_state in ("SUBMITTED", "IN_REVIEW"):
                    security_step = locked.current_step
                    if security_step:
                        already = app_models.ApprovalAction.objects.filter(
                            application=locked,
                            step=security_step,
                            action=app_models.ApprovalAction.Action.APPROVED,
                        ).exists()
                        if not already:
                            app_models.ApprovalAction.objects.create(
                                application=locked,
                                step=security_step,
                                acted_by=request.user,
                                action=app_models.ApprovalAction.Action.APPROVED,
                                remarks="Approved by RFID gatepass scan",
                            )
                    application_state.approve_application(locked)
                    locked.refresh_from_db()

                locked.gatepass_scanned_at = now
                locked.gatepass_scanned_by = request.user
                try:
                    locked.gatepass_scanned_mode = app_models.Application.GatepassScanMode.ONLINE
                    locked.save(update_fields=["gatepass_scanned_at", "gatepass_scanned_by", "gatepass_scanned_mode"])
                except Exception:
                    locked.save(update_fields=["gatepass_scanned_at", "gatepass_scanned_by"])

            timeline = _build_timeline(ready_app, ready_flow) if ready_flow else []
            return Response(
                {
                    "allowed": True,
                    "message": "You may leave the college.",
                    "application_id": ready_app.id,
                    "application_type": ready_app.application_type.name,
                    "scanned_at": now.isoformat(),
                    "profile_type": profile_type,
                    "profile": profile_data,
                    "student": student_data,
                    "staff": staff_data,
                    "approval_timeline": timeline,
                },
                status=status.HTTP_200_OK,
            )

        # If the most recent gatepass is already completed (OUT+IN scanned),
        # treat as "no active gatepass".
        already_scanned = (
            app_models.Application.objects.filter(
                applicant_user=applicant_user,
                gatepass_scanned_at__isnull=False,
                gatepass_in_scanned_at__isnull=False,
            )
            .order_by("-gatepass_scanned_at")
            .first()
        )
        if already_scanned:
            completed_at = None
            try:
                completed_at = timezone.localtime(already_scanned.gatepass_in_scanned_at)
            except Exception:
                completed_at = None

            msg = "No active gatepass found."
            if completed_at:
                msg = f"No active gatepass found. Last gatepass completed at {completed_at.strftime('%d %b %Y, %I:%M %p')}."

            return Response(
                {
                    "allowed": False,
                    "reason": "no_gatepass",
                    "message": msg,
                    "profile_type": profile_type,
                    "profile": profile_data,
                    "student": student_data,
                    "staff": staff_data,
                    "approval_timeline": [],
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "allowed": False,
                "reason": "no_gatepass",
                "message": "Gatepass not Applied in IDCS",
                "profile_type": profile_type,
                "profile": profile_data,
                "student": student_data,
                "staff": staff_data,
                "approval_timeline": [],
            },
            status=status.HTTP_200_OK,
        )


# ── Staff endpoints ────────────────────────────────────────────────────────

class SearchStaffView(APIView):
    """GET /api/idscan/search-staff/?q=<query> — search staff by staff_id / name."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if not _has_card_management_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        q = (request.query_params.get("q") or "").strip()
        if len(q) < 1:
            return Response([], status=status.HTTP_200_OK)

        qs = (
            StaffProfile.objects.select_related("user", "department")
            .filter(
                Q(staff_id__icontains=q)
                | Q(user__username__icontains=q)
                | Q(user__first_name__icontains=q)
                | Q(user__last_name__icontains=q)
            )
            .order_by("staff_id")[:20]
        )
        return Response([_staff_detail(sp) for sp in qs], status=status.HTTP_200_OK)


class AssignStaffUIDView(APIView):
    """POST /api/idscan/assign-staff-uid/ — assign UID to staff. Body: { staff_id, uid }"""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if not _has_card_management_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        staff_pk = request.data.get("staff_id")
        uid = _normalize_uid(request.data.get("uid") or "")

        if not staff_pk or not uid:
            return Response({"error": "staff_id and uid are required"}, status=status.HTTP_400_BAD_REQUEST)

        # Prevent duplicate UID across staff
        conflict_staff = StaffProfile.objects.filter(rfid_uid__iexact=uid).exclude(pk=staff_pk).first()
        if conflict_staff:
            return Response(
                {"error": f"UID {uid} is already assigned to staff {conflict_staff.staff_id}."},
                status=status.HTTP_409_CONFLICT,
            )

        # Prevent duplicate UID across students
        conflict_student = StudentProfile.objects.filter(rfid_uid__iexact=uid).first()
        if conflict_student:
            return Response(
                {"error": f"UID {uid} is already assigned to student {conflict_student.reg_no}."},
                status=status.HTTP_409_CONFLICT,
            )

        sp = StaffProfile.objects.select_related("user", "department").filter(pk=staff_pk).first()
        if not sp:
            return Response({"error": "Staff not found"}, status=status.HTTP_404_NOT_FOUND)

        sp.rfid_uid = uid
        sp.save(update_fields=["rfid_uid"])
        return Response({"success": True, "staff": _staff_detail(sp)}, status=status.HTTP_200_OK)


class UnassignStaffUIDView(APIView):
    """POST /api/idscan/unassign-staff-uid/ — remove UID from staff. Body: { staff_id }"""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if not _has_card_management_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        staff_pk = request.data.get("staff_id")
        if not staff_pk:
            return Response({"error": "staff_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        sp = StaffProfile.objects.filter(pk=staff_pk).first()
        if not sp:
            return Response({"error": "Staff not found"}, status=status.HTTP_404_NOT_FOUND)

        sp.rfid_uid = ""
        sp.save(update_fields=["rfid_uid"])
        return Response({"success": True}, status=status.HTTP_200_OK)


# ── UID resolve for student OR staff (WebSerial UI) ─────────────────────────

class LookupAnyView(APIView):
    """GET /api/idscan/lookup-any/?uid=<UID> — resolve UID across students+staff."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        uid = _normalize_uid(request.query_params.get("uid") or "")
        if len(uid) < 8:
            return Response({"found": False, "uid": uid, "profile_type": None, "profile": None}, status=status.HTTP_200_OK)

        student = (
            StudentProfile.objects.select_related(
                "user", "section__batch__course__department", "home_department"
            )
            .filter(rfid_uid__iexact=uid)
            .first()
        )
        staff = (
            StaffProfile.objects.select_related("user", "department")
            .filter(rfid_uid__iexact=uid)
            .first()
        )

        if student and staff:
            return Response(
                {
                    "found": True,
                    "uid": uid,
                    "profile_type": "conflict",
                    "profile": {"message": "UID is assigned to both student and staff. Unassign one."},
                },
                status=status.HTTP_409_CONFLICT,
            )

        if student:
            return Response(
                {"found": True, "uid": uid, "profile_type": "student", "profile": _student_detail(student)},
                status=status.HTTP_200_OK,
            )

        if staff:
            return Response(
                {"found": True, "uid": uid, "profile_type": "staff", "profile": _staff_detail(staff)},
                status=status.HTTP_200_OK,
            )

        return Response({"found": False, "uid": uid, "profile_type": None, "profile": None}, status=status.HTTP_200_OK)


class CardsDataView(APIView):
    """GET /api/idscan/cards-data/ — list all students and staff ID card status."""
    permission_classes = (IsAuthenticated,)
    
    def get(self, request):
        if not _has_card_management_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        acad_start: Optional[int] = None
        sem_offset = 2
        try:
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.order_by('-id').first()
            if ay and ay.name:
                acad_start = int(str(ay.name).split('-')[0])
                sem_offset = 1 if (ay.parity or '').upper() == 'ODD' else 2
        except Exception:
            acad_start = None
            sem_offset = 2
            
        students = StudentProfile.objects.select_related(
            "user", "section__batch__course__department", "section__semester", "home_department"
        ).all()
        
        staff = StaffProfile.objects.select_related("user", "department").all()
        
        data = []
        for s in students:
            profile_image_url = None
            try:
                if getattr(s, 'profile_image', None):
                    profile_image_url = s.profile_image.url
            except Exception:
                profile_image_url = None

            sem_number: Optional[int] = None
            try:
                if getattr(s, 'section', None) and getattr(s.section, 'semester', None):
                    sem_number = getattr(s.section.semester, 'number', None)
                elif acad_start is not None and getattr(s, 'section', None) and getattr(s.section, 'batch', None):
                    batch = s.section.batch
                    start_year = getattr(batch, 'start_year', None)
                    if start_year is None:
                        try:
                            start_year = int(str(getattr(batch, 'name', '')).split('-')[0])
                        except Exception:
                            start_year = None
                    if start_year is not None:
                        delta = int(acad_start) - int(start_year)
                        computed = delta * 2 + int(sem_offset)
                        if computed > 0:
                            sem_number = computed
            except Exception:
                sem_number = None

            username = getattr(s.user, "username", "") if s.user else ""
            dept = ""
            if s.section and s.section.batch and s.section.batch.course and s.section.batch.course.department:
                dept = s.section.batch.course.department.short_name or s.section.batch.course.department.code
            elif s.home_department:
                dept = s.home_department.short_name or s.home_department.code
            data.append({
                "id": s.id,
                "role": "STUDENT",
                "identifier": s.reg_no,
                "username": username,
                "name": f"{s.user.first_name} {s.user.last_name}".strip() if s.user else "",
                "department": dept,
                "section": s.section.name if s.section else None,
                "batch": str(s.section.batch) if s.section and s.section.batch else None,
                "semester": sem_number,
                "rfid_uid": s.rfid_uid,
                "status": "Connected" if s.rfid_uid else "Not Connected",
                "profile_image_url": profile_image_url,
            })
            
        for s in staff:
            profile_image_url = None
            try:
                if getattr(s, 'profile_image', None):
                    profile_image_url = s.profile_image.url
            except Exception:
                profile_image_url = None

            username = getattr(s.user, "username", "") if s.user else ""
            dept = (s.department.short_name or s.department.code) if s.department else ""
            data.append({
                "id": s.id,
                "role": "STAFF",
                "identifier": s.staff_id,
                "username": username,
                "name": f"{s.user.first_name} {s.user.last_name}".strip() if s.user else "",
                "department": dept,
                "rfid_uid": s.rfid_uid,
                "status": "Connected" if s.rfid_uid else "Not Connected",
                "profile_image_url": profile_image_url,
            })
            
        return Response({"results": data}, status=status.HTTP_200_OK)


class BulkEntryPeopleView(APIView):
    """GET /api/idscan/bulk-entry/people/
    
    Returns a filtered list of students or staff for bulk RFID assignment.
    
    Query params:
      role      - "STUDENT" or "STAFF" (required)
      dept      - department id (optional)
      section   - section id (optional, for STUDENT only)
    """
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if not _has_card_management_permission(request.user):
            return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)

        role = (request.query_params.get('role') or '').upper()
        dept = request.query_params.get('dept')
        section = request.query_params.get('section')

        data = []

        if role == 'STUDENT' or not role:
            qs = StudentProfile.objects.select_related(
                "user", "section__batch__course__department", "home_department"
            ).all()
            if dept:
                try:
                    qs = qs.filter(section__batch__course__department_id=int(dept))
                except (ValueError, TypeError):
                    pass
            if section:
                try:
                    qs = qs.filter(section_id=int(section))
                except (ValueError, TypeError):
                    pass
            for s in qs:
                profile_image_url = None
                try:
                    if getattr(s, 'profile_image', None):
                        profile_image_url = s.profile_image.url
                except Exception:
                    pass

                dept_name = ""
                if s.section and s.section.batch and s.section.batch.course and s.section.batch.course.department:
                    dept_name = s.section.batch.course.department.short_name or s.section.batch.course.department.code
                elif s.home_department:
                    dept_name = s.home_department.short_name or s.home_department.code

                data.append({
                    "id": s.id,
                    "role": "STUDENT",
                    "identifier": s.reg_no,
                    "username": getattr(s.user, "username", "") if s.user else "",
                    "name": f"{s.user.first_name} {s.user.last_name}".strip() if s.user else "",
                    "department": dept_name,
                    "section": s.section.name if s.section else None,
                    "rfid_uid": s.rfid_uid,
                    "profile_image_url": profile_image_url,
                })

        if role == 'STAFF' or not role:
            qs_staff = StaffProfile.objects.select_related("user", "department").all()
            if dept:
                try:
                    qs_staff = qs_staff.filter(department_id=int(dept))
                except (ValueError, TypeError):
                    pass
            for s in qs_staff:
                profile_image_url = None
                try:
                    if getattr(s, 'profile_image', None):
                        profile_image_url = s.profile_image.url
                except Exception:
                    pass

                dept_name = (s.department.short_name or s.department.code) if s.department else ""
                data.append({
                    "id": s.id,
                    "role": "STAFF",
                    "identifier": s.staff_id,
                    "username": getattr(s.user, "username", "") if s.user else "",
                    "name": f"{s.user.first_name} {s.user.last_name}".strip() if s.user else "",
                    "department": dept_name,
                    "section": None,
                    "rfid_uid": s.rfid_uid,
                    "profile_image_url": profile_image_url,
                })

        return Response({"results": data}, status=status.HTTP_200_OK)


# ═══════════════════════════════════════════════════════════════════════════════
# Fingerprint Enrollment API Views
# ═══════════════════════════════════════════════════════════════════════════════

from idcsscan.models import FingerprintEnrollment
from idcsscan.serializers import (
    FingerprintEnrollmentReadSerializer,
    FingerprintEnrollmentWriteSerializer,
)


class FingerprintEnrollView(APIView):
    """
    POST /api/idscan/fingerprint/enroll/

    Enroll (or re-enroll) a fingerprint for a user.

    Body (JSON):
      {
        "user_id": 42,                   // OR "reg_no" OR "staff_id"
        "reg_no": "811722104001",
        "staff_id": "100123",
        "finger": "R_INDEX",
        "template_b64": "<base64>",
        "template_format": "ISO_19794_2",
        "quality_score": 82,
        "device_type": "SecuGen-Hamster"
      }

    Requires SECURITY / IQAC / ADMIN role.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _has_card_management_permission(request.user):
            return Response(
                {"detail": "You do not have permission to enroll fingerprints."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = FingerprintEnrollmentWriteSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        enrollment = serializer.save()

        return Response(
            {
                "detail": "Fingerprint enrolled successfully.",
                "enrollment": FingerprintEnrollmentReadSerializer(enrollment).data,
            },
            status=status.HTTP_201_CREATED,
        )


class FingerprintListView(APIView):
    """
    GET /api/idscan/fingerprint/list/

    Query params (one required):
      ?user_id=42  OR  ?reg_no=811722104001  OR  ?staff_id=100123
      ?active_only=true  (default: true)

    Returns all enrolled fingerprints for the user.
    Requires SECURITY / IQAC / ADMIN role.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _has_card_management_permission(request.user):
            return Response(
                {"detail": "Permission denied."},
                status=status.HTTP_403_FORBIDDEN,
            )

        User = get_user_model()
        user_id = request.query_params.get("user_id")
        reg_no = (request.query_params.get("reg_no") or "").strip()
        staff_id = (request.query_params.get("staff_id") or "").strip()
        active_only = request.query_params.get("active_only", "true").lower() in ("true", "1", "yes")

        user = None
        if user_id:
            user = User.objects.filter(pk=user_id).first()
        elif reg_no:
            sp = StudentProfile.objects.select_related("user").filter(reg_no=reg_no).first()
            user = sp.user if sp else None
        elif staff_id:
            sp = StaffProfile.objects.select_related("user").filter(staff_id=staff_id).first()
            user = sp.user if sp else None

        if not user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        qs = FingerprintEnrollment.objects.filter(user=user)
        if active_only:
            qs = qs.filter(is_active=True)
        qs = qs.order_by("finger", "-enrolled_at")

        return Response(
            {"results": FingerprintEnrollmentReadSerializer(qs, many=True).data},
            status=status.HTTP_200_OK,
        )


class FingerprintDeactivateView(APIView):
    """
    POST /api/idscan/fingerprint/deactivate/

    Body: { "enrollment_id": 5 }  OR  { "user_id": 42, "finger": "R_INDEX" }

    Deactivates a fingerprint enrollment.
    Requires SECURITY / IQAC / ADMIN role.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _has_card_management_permission(request.user):
            return Response(
                {"detail": "Permission denied."},
                status=status.HTTP_403_FORBIDDEN,
            )

        enrollment_id = request.data.get("enrollment_id")
        user_id = request.data.get("user_id")
        finger = (request.data.get("finger") or "").strip()

        qs = FingerprintEnrollment.objects.filter(is_active=True)
        if enrollment_id:
            qs = qs.filter(pk=enrollment_id)
        elif user_id and finger:
            qs = qs.filter(user_id=user_id, finger=finger)
        else:
            return Response(
                {"detail": "Provide enrollment_id, or both user_id and finger."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated = qs.update(is_active=False, deactivated_at=timezone.now())
        if updated == 0:
            return Response(
                {"detail": "No active enrollment found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {"detail": f"{updated} enrollment(s) deactivated."},
            status=status.HTTP_200_OK,
        )


class FingerprintStatusView(APIView):
    """
    GET /api/idscan/fingerprint/status/

    Quick check: does this user have any active fingerprints enrolled?

    Query params: ?user_id=42 OR ?reg_no=... OR ?staff_id=...

    Returns: { "enrolled": true, "count": 2, "fingers": ["R_INDEX", "R_THUMB"] }
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        User = get_user_model()
        user_id = request.query_params.get("user_id")
        reg_no = (request.query_params.get("reg_no") or "").strip()
        staff_id = (request.query_params.get("staff_id") or "").strip()

        user = None
        if user_id:
            user = User.objects.filter(pk=user_id).first()
        elif reg_no:
            sp = StudentProfile.objects.select_related("user").filter(reg_no=reg_no).first()
            user = sp.user if sp else None
        elif staff_id:
            sp = StaffProfile.objects.select_related("user").filter(staff_id=staff_id).first()
            user = sp.user if sp else None

        if not user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        active = FingerprintEnrollment.objects.filter(user=user, is_active=True)
        fingers = list(active.values_list("finger", flat=True).distinct())

        # Build user details
        user_name = user.get_full_name() or user.username
        user_type = "unknown"
        identifier = ""
        department = ""
        profile_image = ""
        if hasattr(user, "student_profile"):
            sp = user.student_profile
            user_type = "student"
            identifier = getattr(sp, "reg_no", "")
            department = getattr(sp, "department", "") or ""
            if getattr(sp, "profile_image", None):
                try:
                    profile_image = sp.profile_image.url
                except Exception:
                    pass
        elif hasattr(user, "staff_profile"):
            sp = user.staff_profile
            user_type = "staff"
            identifier = getattr(sp, "staff_id", "")
            department = getattr(sp, "department", "") or ""
            if getattr(sp, "profile_image", None):
                try:
                    profile_image = sp.profile_image.url
                except Exception:
                    pass

        return Response(
            {
                "enrolled": len(fingers) > 0,
                "count": len(fingers),
                "fingers": fingers,
                "user_id": user.id,
                "user_name": user_name,
                "user_type": user_type,
                "identifier": identifier,
                "department": department,
                "profile_image": profile_image,
            },
            status=status.HTTP_200_OK,
        )


class FingerprintResetAllView(APIView):
    """
    POST /api/idscan/fingerprint/reset-all/

    Deactivate ALL active fingerprint enrollments for a user.
    Body: { "reg_no": "..." } or { "staff_id": "..." } or { "user_id": 42 }

    Requires SECURITY / IQAC / ADMIN role.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _has_card_management_permission(request.user):
            return Response(
                {"detail": "Permission denied."},
                status=status.HTTP_403_FORBIDDEN,
            )

        User = get_user_model()
        user_id = request.data.get("user_id")
        reg_no = (request.data.get("reg_no") or "").strip()
        staff_id = (request.data.get("staff_id") or "").strip()

        user = None
        if user_id:
            user = User.objects.filter(pk=user_id).first()
        elif reg_no:
            sp = StudentProfile.objects.select_related("user").filter(reg_no=reg_no).first()
            user = sp.user if sp else None
        elif staff_id:
            sp = StaffProfile.objects.select_related("user").filter(staff_id=staff_id).first()
            user = sp.user if sp else None

        if not user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        updated = FingerprintEnrollment.objects.filter(
            user=user, is_active=True,
        ).update(is_active=False, deactivated_at=timezone.now())

        if updated == 0:
            return Response(
                {"detail": "No active enrollments to reset."},
                status=status.HTTP_200_OK,
            )

        return Response(
            {"detail": f"{updated} fingerprint(s) deactivated.", "count": updated},
            status=status.HTTP_200_OK,
        )


class FingerprintIdentifyView(APIView):
    """
    POST /api/idscan/fingerprint/identify/

    Body: { "template_b64": "<base64>" }

    NOTE: This performs an exact-byte equality lookup against stored
    `FingerprintEnrollment.template` values. This is a best-effort / simple
    server-side matcher — for robust biometric matching a proper matcher/SDK
    should be integrated.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data or {}
        b64 = (data.get("template_b64") or "").strip()
        if not b64:
            return Response({"detail": "template_b64 is required."}, status=status.HTTP_400_BAD_REQUEST)

        import base64

        try:
            raw = base64.b64decode(b64, validate=True)
        except Exception:
            return Response({"detail": "Invalid base64 data."}, status=status.HTTP_400_BAD_REQUEST)

        if len(raw) < 8:
            return Response({"detail": "Template too small."}, status=status.HTTP_400_BAD_REQUEST)

        # Exact-match search (limited but useful for deterministic templates)
        enrollment = FingerprintEnrollment.objects.filter(template=raw, is_active=True).select_related('user').first()
        if not enrollment:
            return Response({"detail": "No matching fingerprint found."}, status=status.HTTP_404_NOT_FOUND)

        # Build a compact user payload similar to FingerprintStatusView
        user = enrollment.user
        user_name = user.get_full_name() or user.username
        identifier = ""
        user_type = "unknown"
        department = ""
        profile_image = ""
        if hasattr(user, 'student_profile'):
            sp = user.student_profile
            user_type = 'student'
            identifier = getattr(sp, 'reg_no', '')
            department = getattr(sp, 'department', '') or ''
            if getattr(sp, 'profile_image', None):
                try:
                    profile_image = sp.profile_image.url
                except Exception:
                    profile_image = ''
        elif hasattr(user, 'staff_profile'):
            sp = user.staff_profile
            user_type = 'staff'
            identifier = getattr(sp, 'staff_id', '')
            department = getattr(sp, 'department', '') or ''
            if getattr(sp, 'profile_image', None):
                try:
                    profile_image = sp.profile_image.url
                except Exception:
                    profile_image = ''

        return Response(
            {
                "user_id": user.id,
                "user_name": user_name,
                "user_type": user_type,
                "identifier": identifier,
                "department": department,
                "profile_image": profile_image,
                "enrollment_id": enrollment.id,
                "finger": enrollment.finger,
            },
            status=status.HTTP_200_OK,
        )