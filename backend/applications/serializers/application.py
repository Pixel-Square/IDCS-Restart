from typing import Dict, Optional

from datetime import time

from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers

from applications import models as app_models
from applications.services import approval_engine
from applications.services import application_state
from applications.serializers.approval import ApprovalActionSerializer


def _parse_clock_time(value) -> Optional[time]:
    from datetime import datetime as _dt

    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return _dt.strptime(raw, fmt).time()
        except ValueError:
            continue
    for fmt in ("%I:%M %p", "%I:%M:%S %p"):
        try:
            return _dt.strptime(raw.upper(), fmt).time()
        except ValueError:
            continue
    return None


def _parse_any_date(value) -> Optional[timezone.datetime.date]:
    from datetime import datetime as _dt

    raw = str(value or "").strip()
    if not raw:
        return None

    d = parse_date(raw)
    if d:
        return d

    # Common UI/export formats
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return _dt.strptime(raw, fmt).date()
        except ValueError:
            continue

    return None


def _extract_time_window(app: app_models.Application):
    """Extract a (start, end) aware datetime window from application fields.

    Supports:
    1) Composite fields:
       - DATE IN OUT  -> {date, in_time, out_time}
       - DATE OUT IN  -> {date, out_time, in_time}
    2) Separate fields (best-effort):
       - One DATE field + two TIME fields (keys/labels containing 'in'/'out' preferred)

    Overnight windows are supported (end <= start -> end + 1 day).
    """
    from datetime import datetime, timedelta

    rows = list(app.data.select_related("field").all())
    rows_sorted = sorted(
        rows,
        key=lambda r: (getattr(r.field, "order", 0), getattr(r.field, "field_key", "")),
    )

    # 1) Composite field types
    for row in rows_sorted:
        ftype = str(getattr(row.field, "field_type", "") or "").upper()
        if ftype not in ("DATE IN OUT", "DATE OUT IN"):
            continue

        payload = row.value if isinstance(row.value, dict) else {}
        day = _parse_any_date(str(payload.get("date") or "").strip())
        if not day:
            continue

        out_t = _parse_clock_time(payload.get("out_time"))
        in_t = _parse_clock_time(payload.get("in_time"))

        candidates = []
        if out_t and in_t:
            candidates.append((out_t, in_t))
            candidates.append((in_t, out_t))

        # Backward-compatible fallback for older payload variants.
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

        def _duration_seconds(start_time, end_time):
            start_seconds = start_time.hour * 3600 + start_time.minute * 60 + start_time.second
            end_seconds = end_time.hour * 3600 + end_time.minute * 60 + end_time.second
            if end_seconds <= start_seconds:
                end_seconds += 24 * 3600
            return end_seconds - start_seconds

        # Choose the shortest plausible window to avoid swapped IN/OUT mappings.
        start_t, end_t = min(candidates, key=lambda pair: _duration_seconds(pair[0], pair[1]))

        tz = timezone.get_current_timezone()
        start_dt = timezone.make_aware(datetime.combine(day, start_t), tz)
        end_dt = timezone.make_aware(datetime.combine(day, end_t), tz)
        if end_dt <= start_dt:
            end_dt = end_dt + timedelta(days=1)

        return {"start": start_dt, "end": end_dt}

    # 2) Separate DATE + TIME fields
    date_day = None
    for row in rows_sorted:
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

    if not date_day:
        return None

    time_rows = []
    for row in rows_sorted:
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

    if len(time_rows) < 2:
        return None

    in_t = next((t for role, t in time_rows if role == "in"), None)
    out_t = next((t for role, t in time_rows if role == "out"), None)
    if not in_t or not out_t:
        # fallback: earliest as start, latest as end
        times_only = [t for _, t in time_rows]
        in_t = min(times_only)
        out_t = max(times_only)

    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(date_day, in_t), tz)
    end_dt = timezone.make_aware(datetime.combine(date_day, out_t), tz)
    if end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)
    return {"start": start_dt, "end": end_dt}


def _display_name(user) -> str | None:
    """Return the best display name for a user: full name, else username."""
    if user is None:
        return None
    full = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full if full else getattr(user, 'username', None)


def _is_gatepass_application(app: app_models.Application) -> bool:
    """Gatepass = (final step is SECURITY) AND (has composite DATE IN OUT / DATE OUT IN field)."""
    try:
        flow = approval_engine._get_flow_for_application(app)
    except Exception:
        flow = None
    if not flow:
        return False

    try:
        final = flow.steps.filter(is_final=True).select_related('role').first()
        if not (final and final.role and str(final.role.name or '').upper() == 'SECURITY'):
            return False
    except Exception:
        return False

    try:
        for row in app.data.select_related('field').all():
            ftype = str(getattr(row.field, 'field_type', '') or '').upper()
            if ftype in ('DATE IN OUT', 'DATE OUT IN'):
                return True
    except Exception:
        return False

    return False


class ApplicationCreateSerializer(serializers.Serializer):
    application_type = serializers.PrimaryKeyRelatedField(queryset=app_models.ApplicationType.objects.filter(is_active=True))
    data = serializers.DictField(child=serializers.JSONField(), allow_empty=False)

    def validate(self, attrs):
        app_type = attrs['application_type']
        provided_keys = set(attrs['data'].keys())

        # Load expected fields for the application type
        fields_qs = app_models.ApplicationField.objects.filter(application_type=app_type)
        expected_keys = set(f.field_key for f in fields_qs)

        # Required fields must be present
        required_keys = set(f.field_key for f in fields_qs if f.is_required)
        missing = required_keys - provided_keys
        if missing:
            raise serializers.ValidationError({
                'data': f'Missing required fields: {", ".join(sorted(missing))}'
            })

        # Ensure no unknown keys provided
        unknown = provided_keys - expected_keys
        if unknown:
            raise serializers.ValidationError({
                'data': f'Unknown field keys for this application type: {", ".join(sorted(unknown))}'
            })

        return attrs

    def create(self, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError('Authentication required to create application')

        student_profile = None
        staff_profile = None
        try:
            student_profile = getattr(user, 'student_profile', None)
        except Exception:
            student_profile = None
        try:
            staff_profile = getattr(user, 'staff_profile', None)
        except Exception:
            staff_profile = None

        if student_profile is not None and not getattr(student_profile, 'pk', None):
            student_profile = None
        if staff_profile is not None and not getattr(staff_profile, 'pk', None):
            staff_profile = None

        app_type = validated_data['application_type']
        data: Dict = validated_data['data']

        application = app_models.Application.objects.create(
            application_type=app_type,
            applicant_user=user,
            student_profile=student_profile,
            staff_profile=staff_profile,
            current_state=app_models.Application.ApplicationState.DRAFT,
            status=app_models.Application.ApplicationState.DRAFT,
        )

        # Persist ApplicationData rows
        fields_map = {f.field_key: f for f in app_models.ApplicationField.objects.filter(application_type=app_type)}
        rows = []
        for key, val in data.items():
            field = fields_map.get(key)
            if not field:
                continue
            rows.append(app_models.ApplicationData(application=application, field=field, value=val))

        app_models.ApplicationData.objects.bulk_create(rows)

        # Submit via canonical state transition (binds form version + flow step)
        application = application_state.submit_application(application, user)

        return application


class ApplicationListSerializer(serializers.ModelSerializer):
    application_type_name = serializers.SerializerMethodField()
    application_type_code = serializers.SerializerMethodField()
    current_step_role = serializers.SerializerMethodField()
    needs_gatepass_scan = serializers.SerializerMethodField()
    sla_deadline = serializers.SerializerMethodField()
    time_window_active = serializers.SerializerMethodField()
    gatepass_window_start = serializers.SerializerMethodField()
    gatepass_window_end = serializers.SerializerMethodField()
    gatepass_expired = serializers.SerializerMethodField()

    class Meta:
        model = app_models.Application
        fields = (
            'id',
            'application_type_name',
            'application_type_code',
            'current_state',
            'status',
            'submitted_at',
            'created_at',
            'current_step_role',
            'gatepass_scanned_at',
            'gatepass_in_scanned_at',
            'needs_gatepass_scan',
            'sla_deadline',
            'time_window_active',
            'gatepass_window_start',
            'gatepass_window_end',
            'gatepass_expired',
        )

    def get_application_type_name(self, obj):
        return obj.application_type.name if obj.application_type else None

    def get_application_type_code(self, obj):
        return obj.application_type.code if obj.application_type else None

    def get_current_step_role(self, obj):
        step = approval_engine.get_current_approval_step(obj)
        if not step:
            return None
        if getattr(step, 'stage_id', None):
            return getattr(step.stage, 'name', None)
        return step.role.name if step.role else None

    def get_needs_gatepass_scan(self, obj):
        """True if this approved application requires an RFID gatepass exit scan."""
        if obj.current_state != 'APPROVED':
            return False
        if obj.gatepass_scanned_at:
            return False
        # Check if the flow's final step is SECURITY
        try:
            flow = approval_engine._get_flow_for_application(obj)
            if not flow:
                return False
            final = flow.steps.filter(is_final=True).select_related('role').first()
            return bool(final and final.role and final.role.name.upper() == 'SECURITY')
        except Exception:
            return False

    def get_sla_deadline(self, obj):
        """ISO deadline string for UI countdown.

        Priority:
        1) Composite DATE IN OUT / DATE OUT IN end datetime (if present)
        2) submitted_at + flow.sla_hours (fallback)
        """
        if obj.current_state in ("REJECTED", "CANCELLED"):
            return None

        # Gatepass-only SLA: derive from selected duration window (never from admin SLA).
        if _is_gatepass_application(obj):
            window = _extract_time_window(obj)
            if window is not None:
                # Always return window end as deadline (shows time until exit deadline)
                return window['end'].isoformat()
            # For gatepass, don't fall back to admin SLA
            return None

        if not obj.submitted_at:
            return None
        if obj.current_state == "APPROVED":
            return None  # Resolved unless a composite window exists

        try:
            flow = approval_engine._get_flow_for_application(obj)
        except Exception:
            return None
        if not flow or not flow.sla_hours:
            return None
        from datetime import timedelta

        deadline = obj.submitted_at + timedelta(hours=flow.sla_hours)
        return deadline.isoformat()

    def get_gatepass_window_end(self, obj):
        """ISO datetime string for the gate window end, if present."""
        if not _is_gatepass_application(obj):
            return None
        window = _extract_time_window(obj)
        return window['end'].isoformat() if window is not None else None

    def get_time_window_active(self, obj):
        if not _is_gatepass_application(obj):
            return False
        window = _extract_time_window(obj)
        if window is None:
            return False
        now = timezone.now()
        return window['start'] <= now <= window['end']

    def get_gatepass_window_start(self, obj):
        """ISO datetime string for the gate window start, if present."""
        if not _is_gatepass_application(obj):
            return None
        window = _extract_time_window(obj)
        return window['start'].isoformat() if window is not None else None

    def get_gatepass_expired(self, obj):
        """True if the selected duration window ended and not scanned yet.

        This can apply even while an application is still pending review.
        """
        state = str(obj.current_state or '').upper()
        if state in ('REJECTED', 'CANCELLED', 'DRAFT'):
            return False
        if not _is_gatepass_application(obj):
            return False
        if obj.gatepass_scanned_at:
            return False
        window = _extract_time_window(obj)
        if window is None:
            return False
        return timezone.now() > window['end']


class ApplicationDetailSerializer(serializers.ModelSerializer):
    application_type = serializers.SerializerMethodField()
    dynamic_fields = serializers.SerializerMethodField()
    current_step = serializers.SerializerMethodField()
    approval_history = serializers.SerializerMethodField()
    approval_timeline = serializers.SerializerMethodField()
    sla_hours = serializers.SerializerMethodField()
    sla_deadline = serializers.SerializerMethodField()
    time_window_active = serializers.SerializerMethodField()
    gatepass_window_start = serializers.SerializerMethodField()
    gatepass_window_end = serializers.SerializerMethodField()
    gatepass_expired = serializers.SerializerMethodField()

    class Meta:
        model = app_models.Application
        fields = ('id', 'application_type', 'current_state', 'status', 'created_at', 'submitted_at',
                  'dynamic_fields', 'current_step', 'approval_history', 'approval_timeline',
                  'sla_hours', 'sla_deadline', 'gatepass_scanned_at', 'gatepass_in_scanned_at',
                  'time_window_active', 'gatepass_window_start', 'gatepass_window_end', 'gatepass_expired')

    def get_application_type(self, obj):
        return obj.application_type.name if obj.application_type else None

    def get_dynamic_fields(self, obj):
        # Return list of {label, field_key, value}
        data = []
        qs = obj.data.select_related('field')
        for ad in qs:
            data.append({
                'label': ad.field.label,
                'field_key': ad.field.field_key,
                'field_type': ad.field.field_type,
                'value': ad.value,
            })
        return data

    def get_current_step(self, obj):
        step = approval_engine.get_current_approval_step(obj)
        if not step:
            return None
        if getattr(step, 'stage_id', None):
            return getattr(step.stage, 'name', None)
        return step.role.name if step.role else None

    def get_approval_history(self, obj):
        actions = obj.actions.order_by('acted_at')
        return ApprovalActionSerializer(actions, many=True).data

    def get_sla_hours(self, obj):
        flow = approval_engine._get_flow_for_application(obj)
        return flow.sla_hours if flow else None

    def get_sla_deadline(self, obj):
        """ISO deadline string for UI countdown.

        Gatepass (SECURITY-final + DATE IN/OUT field): use selected duration window end only (never admin SLA).
        Others: use flow SLA (submitted_at + flow.sla_hours).
        """
        state = str(obj.current_state or '').upper()
        if state in ('REJECTED', 'CANCELLED', 'DRAFT'):
            return None

        if _is_gatepass_application(obj):
            window = _extract_time_window(obj)
            if window is None:
                return None
            # Always return window end as deadline (shows time until exit deadline)
            return window['end'].isoformat()

        if not obj.submitted_at:
            return None
        if state == 'APPROVED':
            return None
        flow = approval_engine._get_flow_for_application(obj)
        if not flow or not flow.sla_hours:
            return None
        from datetime import timedelta

        deadline = obj.submitted_at + timedelta(hours=flow.sla_hours)
        return deadline.isoformat()

    def get_gatepass_window_end(self, obj):
        if not _is_gatepass_application(obj):
            return None
        window = _extract_time_window(obj)
        return window['end'].isoformat() if window is not None else None

    def get_gatepass_window_start(self, obj):
        if not _is_gatepass_application(obj):
            return None
        window = _extract_time_window(obj)
        return window['start'].isoformat() if window is not None else None

    def get_time_window_active(self, obj):
        if not _is_gatepass_application(obj):
            return False
        window = _extract_time_window(obj)
        if window is None:
            return False
        now = timezone.now()
        return window['start'] <= now <= window['end']

    def get_gatepass_expired(self, obj):
        state = str(obj.current_state or '').upper()
        if state in ('REJECTED', 'CANCELLED', 'DRAFT'):
            return False
        if not _is_gatepass_application(obj):
            return False
        if obj.gatepass_scanned_at:
            return False
        window = _extract_time_window(obj)
        if window is None:
            return False
        return timezone.now() > window['end']

    def get_approval_timeline(self, obj):
        """Return all flow steps merged with completed actions.

        Each entry has:
          step_order, step_role, is_starter, is_final,
          status (SUBMITTED | APPROVED | REJECTED | SKIPPED | PENDING),
          acted_by (display name or None), acted_at, remarks
        """
        flow = approval_engine._get_flow_for_application(obj)
        if not flow:
            # Fall back to returning just the existing actions when no flow
            result = []
            for idx, action in enumerate(obj.actions.order_by('acted_at').select_related('step__role', 'step__stage', 'acted_by')):
                result.append({
                    'step_order': action.step.order if action.step else idx + 1,
                    'step_role': (
                        getattr(action.step.stage, 'name', None)
                        if action.step and getattr(action.step, 'stage_id', None)
                        else (action.step.role.name if action.step and action.step.role else None)
                    ),
                    'is_starter': idx == 0,
                    'is_final': False,
                    'status': 'SUBMITTED' if idx == 0 else action.action,
                    'acted_by': _display_name(action.acted_by),
                    'acted_at': action.acted_at.isoformat() if action.acted_at else None,
                    'remarks': action.remarks or None,
                })
            return result

        steps = list(flow.steps.select_related('role', 'stage').order_by('order'))
        if not steps:
            return []

        # Build a map: step_id -> ApprovalAction (latest per step)
        actions_by_step = {}
        for action in obj.actions.order_by('acted_at').select_related('step__role', 'step__stage', 'acted_by'):
            if action.step_id is not None:
                actions_by_step[action.step_id] = action

        first_order = steps[0].order
        last_order = steps[-1].order
        result = []
        for step in steps:
            action = actions_by_step.get(step.id)
            is_starter = step.order == first_order
            is_final = step.order == last_order
            if action:
                raw_status = action.action  # APPROVED / REJECTED / SKIPPED
                status = 'SUBMITTED' if is_starter else raw_status
                result.append({
                    'step_order': step.order,
                    'step_role': getattr(step.stage, 'name', None) if getattr(step, 'stage_id', None) else (step.role.name if step.role else None),
                    'is_starter': is_starter,
                    'is_final': is_final,
                    'status': status,
                    'acted_by': _display_name(action.acted_by),
                    'acted_at': action.acted_at.isoformat() if action.acted_at else None,
                    'remarks': action.remarks or None,
                })
            else:
                result.append({
                    'step_order': step.order,
                    'step_role': getattr(step.stage, 'name', None) if getattr(step, 'stage_id', None) else (step.role.name if step.role else None),
                    'is_starter': is_starter,
                    'is_final': is_final,
                    'status': 'PENDING',
                    'acted_by': None,
                    'acted_at': None,
                    'remarks': None,
                })
        return result
