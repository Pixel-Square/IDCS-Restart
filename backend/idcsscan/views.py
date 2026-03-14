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
from datetime import datetime, time, timedelta
from typing import Any, Optional

from django.db import transaction
from django.db.models import Q
from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from academics.models import StaffProfile, StudentProfile
from applications import models as app_models
from applications.services import application_state
from applications.services.approval_engine import _get_flow_for_application


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
    roles = [r.name.upper() for r in user.roles.all()] if hasattr(user, "roles") else []
    return "SECURITY" in roles


def _parse_clock_time(value: Any) -> Optional[time]:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).time()
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
    rows = (
        app.data.select_related("field")
        .all()
    )

    for row in sorted(rows, key=lambda r: (getattr(r.field, "order", 0), getattr(r.field, "field_key", ""))):
        ftype = str(getattr(row.field, "field_type", "") or "").upper()
        if ftype not in ("DATE IN OUT", "DATE OUT IN"):
            continue

        payload = row.value if isinstance(row.value, dict) else {}
        date_str = str(payload.get("date") or "").strip()
        day = parse_date(date_str)
        if not day:
            continue

        if ftype == "DATE IN OUT":
            start_key, end_key = "in_time", "out_time"
        else:
            start_key, end_key = "out_time", "in_time"

        start_t = _parse_clock_time(payload.get(start_key))
        end_t = _parse_clock_time(payload.get(end_key))
        if not start_t or not end_t:
            continue

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

    return None


def _validate_scan_time_window(app: app_models.Application, now: Optional[datetime] = None) -> tuple[bool, Optional[str], Optional[dict]]:
    window = _extract_gate_window(app)
    if not window:
        return True, None, None

    current = now or timezone.now()
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
                if c:
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
        if not _has_scan_permission(request.user):
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
        if not _has_scan_permission(request.user):
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

        sp = (
            StudentProfile.objects.select_related(
                "user", "section__batch__course__department", "home_department"
            )
            .filter(rfid_uid__iexact=uid)
            .first()
        )
        if not sp:
            return Response(
                {
                    "allowed": False,
                    "reason": "unknown_uid",
                    "message": "This RFID card is not registered to any student.",
                    "approval_timeline": [],
                },
                status=status.HTTP_200_OK,
            )

        student_data = _student_detail(sp)

        # Find pending app ready for SECURITY final step
        pending_qs = (
            app_models.Application.objects.filter(
                student_profile=sp,
                current_state__in=["SUBMITTED", "IN_REVIEW"],
                gatepass_scanned_at__isnull=True,
            )
            .select_related("application_type", "current_step__role", "current_step")
        )

        ready_app = None
        ready_flow = None
        outside_window_message = None
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
                in_window, window_msg, _ = _validate_scan_time_window(app, now_ref)
                if in_window:
                    ready_app = app
                    ready_flow = flow
                    break
                if not outside_window_message:
                    outside_window_message = window_msg

        # Case: already approved but scan pending
        if ready_app is None:
            approved_qs = app_models.Application.objects.filter(
                student_profile=sp,
                current_state="APPROVED",
                gatepass_scanned_at__isnull=True,
            ).select_related("application_type")
            for app in approved_qs:
                flow = _get_flow_for_application(app)
                if not flow:
                    continue
                final_step = flow.steps.filter(is_final=True).select_related("role").first()
                if final_step and final_step.role and final_step.role.name.upper() == "SECURITY":
                    in_window, window_msg, _ = _validate_scan_time_window(app, now_ref)
                    if in_window:
                        ready_app = app
                        ready_flow = flow
                        break
                    if not outside_window_message:
                        outside_window_message = window_msg

        if ready_app is None and outside_window_message:
            return Response(
                {
                    "allowed": False,
                    "reason": "outside_gate_window",
                    "message": outside_window_message,
                    "student": student_data,
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
                locked.save(update_fields=["gatepass_scanned_at", "gatepass_scanned_by"])

            timeline = _build_timeline(ready_app, ready_flow) if ready_flow else []
            return Response(
                {
                    "allowed": True,
                    "message": "You may leave the college.",
                    "application_id": ready_app.id,
                    "application_type": ready_app.application_type.name,
                    "scanned_at": now.isoformat(),
                    "student": student_data,
                    "approval_timeline": timeline,
                },
                status=status.HTTP_200_OK,
            )

        # Already scanned recently?
        already_scanned = (
            app_models.Application.objects.filter(
                student_profile=sp,
                gatepass_scanned_at__isnull=False,
            )
            .order_by("-gatepass_scanned_at")
            .first()
        )
        if already_scanned:
            flow = _get_flow_for_application(already_scanned)
            sla_still_open = True
            if flow and getattr(flow, "sla_hours", None):
                sla_expiry = already_scanned.gatepass_scanned_at + timedelta(hours=flow.sla_hours)
                if timezone.now() >= sla_expiry:
                    sla_still_open = False
            if sla_still_open:
                timeline = _build_timeline(already_scanned, flow) if flow else []
                return Response(
                    {
                        "allowed": False,
                        "reason": "already_scanned",
                        "message": "Student already exited at "
                        + already_scanned.gatepass_scanned_at.strftime("%I:%M %p")
                        + ".",
                        "student": student_data,
                        "approval_timeline": timeline,
                    },
                    status=status.HTTP_200_OK,
                )

        return Response(
            {
                "allowed": False,
                "reason": "no_gatepass",
                "message": "Gatepass not Applied in IDCS",
                "student": student_data,
                "approval_timeline": [],
            },
            status=status.HTTP_200_OK,
        )


# ── Staff endpoints ────────────────────────────────────────────────────────

class SearchStaffView(APIView):
    """GET /api/idscan/search-staff/?q=<query> — search staff by staff_id / name."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
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
        if not _has_scan_permission(request.user):
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
        if not _has_scan_permission(request.user):
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