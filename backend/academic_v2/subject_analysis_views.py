"""Subject-wise academic analytics — Phase 1 (College → Dept → Faculty → Subject).

Reuses the Faculty Analysis architecture:
  StaffProfile → TeachingAssignment → subject (elective_subject > curriculum_row
  > Subject) → section → academic_year. Marks are tied to TeachingAssignment
  and normalized per-assessment against the observed maximum in scope.
"""
import logging

from django.db.models import Avg, Sum, Min, Max, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from academics.models import (
    Department, AcademicYear, Subject, StudentProfile, DailyAttendanceRecord,
)
from .academic_performance_views import (
    resolve_user_auth_context, active_student_cohort,
)
from .authorization import (
    get_performance_scope, clamp_department_param,
)

logger = logging.getLogger(__name__)


class SubjectWiseAnalysisView(APIView):
    """Subject-wise academic analytics — Phase 1.

    List mode  (no `subject` param): subjects actually taught within the
    selected academic scope (data-driven subject options).
    Detail mode (`subject`=<code>): subject header, faculty list, KPIs,
    section-wise metrics, per-student rows and comparison charts.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            auth_ctx = resolve_user_auth_context(request.user)
            scope = get_performance_scope(request.user)
            p = request.query_params
            dept_code = clamp_department_param(scope, p.get("dept", "").strip())
            req_batch = p.get("year", "").strip()
            req_sem = p.get("sem", "").strip()
            req_sec = p.get("section", "").strip()
            req_exam = (p.get("exam", "").strip() or "All Assessments")
            faculty_pk = p.get("faculty", "").strip()
            subject_code = p.get("subject", "").strip()
            return self._analyze(
                request, auth_ctx, scope, dept_code, req_batch, req_sem,
                req_sec, req_exam, faculty_pk, subject_code,
            )
        except Exception as e:
            logger.exception("Error in SubjectWiseAnalysisView: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_200_OK)

    def _analyze(self, request, auth_ctx, scope, dept_code, req_batch,
                 req_sem, req_sec, req_exam, faculty_pk, subject_code):
        from OBE.models import (
            Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
            Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
        )
        assessment_registry = [
            ("CIA 1", Cia1Mark, "mark"),
            ("CIA 2", Cia2Mark, "mark"),
            ("SSA 1", Ssa1Mark, "mark"),
            ("SSA 2", Ssa2Mark, "mark"),
            ("Review 1", Review1Mark, "mark"),
            ("Review 2", Review2Mark, "mark"),
            ("Formative 1", Formative1Mark, "total"),
            ("Formative 2", Formative2Mark, "total"),
            ("Model Exam", ModelExamMark, "total_mark"),
            ("Lab Exam", LabExamMark, "total_mark"),
            ("Final Internal", FinalInternalMark, "final_mark"),
        ]

        from academics.models import TeachingAssignment

        # ---- Teaching-assignment scope (identical to Faculty Analysis) ------
        ta_qs = TeachingAssignment.objects.filter(is_active=True).select_related(
            "staff", "staff__user", "staff__department", "subject",
            "curriculum_row", "elective_subject", "section", "section__semester",
            "section__batch", "section__batch__course",
            "section__batch__course__department", "academic_year",
        )
        ta_qs = ta_qs.filter(staff__department__isnull=False)
        if faculty_pk:
            try:
                ta_qs = ta_qs.filter(staff_id=int(faculty_pk))
            except (TypeError, ValueError):
                return Response({"error": "Invalid faculty parameter."}, status=status.HTTP_400_BAD_REQUEST)
        if dept_code:
            ta_qs = ta_qs.filter(
                Q(section__batch__course__department__code__iexact=dept_code)
                | Q(section__batch__course__department__short_name__iexact=dept_code)
                | Q(staff__department__code__iexact=dept_code)
                | Q(staff__department__short_name__iexact=dept_code)
            )
        if req_batch:
            _ay_ids = list(AcademicYear.objects.filter(name__startswith=req_batch).values_list("id", flat=True))
            if not _ay_ids:
                _ay_ids = list(AcademicYear.objects.filter(name__contains=req_batch).values_list("id", flat=True))
            if _ay_ids:
                ta_qs = ta_qs.filter(academic_year_id__in=_ay_ids)
        if req_sem:
            try:
                ta_qs = ta_qs.filter(section__semester__number=int(req_sem))
            except Exception:
                pass
        if req_sec:
            ta_qs = ta_qs.filter(section__name__iexact=req_sec)

        ta_list = list(ta_qs)

        def _ta_subject(ta):
            """Real subject identity (elective > curriculum row > Subject)."""
            if ta.elective_subject_id:
                es = ta.elective_subject
                return (getattr(es, "course_code", "") or "", getattr(es, "course_name", "") or "")
            if ta.curriculum_row_id:
                cr = ta.curriculum_row
                return (getattr(cr, "course_code", "") or "", getattr(cr, "course_name", "") or "")
            if ta.subject_id:
                return (ta.subject.code or "", ta.subject.name or "")
            return ("", "")

        def _att_pct(student_ids):
            ids = list({i for i in student_ids if i})
            if not ids:
                return None
            qs = DailyAttendanceRecord.objects.filter(student_id__in=ids)
            tot = qs.count()
            if tot == 0:
                return None
            pres = qs.filter(status__in=["P", "OD", "PRESENT", "ON_DUTY"]).count()
            return round((pres / tot) * 100.0, 1)

        # Group TAs by subject identity (code, name).
        subj_groups = {}  # (code, name) -> [ta, ...]
        for ta in ta_list:
            ident = _ta_subject(ta)
            if not ident[0] and not ident[1]:
                continue
            subj_groups.setdefault(ident, []).append(ta)

        # ---- LIST MODE: subjects available in the selected scope ------------
        if not subject_code:
            subjects_out = []
            for (code, name), tas in sorted(subj_groups.items(), key=lambda kv: kv[0][0] or kv[0][1]):
                faculties = {}
                sec_ids = set()
                for ta in tas:
                    faculties[ta.staff_id] = ta.staff
                    if ta.section_id:
                        sec_ids.add(ta.section_id)
                subjects_out.append({
                    "subject_code": code or name or "—",
                    "subject_name": name or code or "—",
                    "faculties": [
                        {
                            "id": str(sf.id),
                            "name": sf.user.get_full_name() or sf.user.username,
                            "staff_id": sf.staff_id or f"FAC{sf.id}",
                        }
                        for sf in faculties.values()
                    ],
                    "sections": sorted({ta.section.name for ta in tas if ta.section}),
                    "sections_count": len(sec_ids),
                    "faculty_count": len(faculties),
                    "ta_count": len(tas),
                })
            return Response({"subjects": subjects_out, "assessment": req_exam}, status=status.HTTP_200_OK)

        # ---- DETAIL MODE: resolve the subject --------------------------------
        target = None
        for ident, tas in subj_groups.items():
            if ident[0] and ident[0].lower() == subject_code.lower():
                target = (ident, tas)
                break
        if target is None:
            for ident, tas in subj_groups.items():
                if ident[1] and ident[1].lower() == subject_code.lower():
                    target = (ident, tas)
                    break
        if target is None:
            return Response(
                {"error": "Subject not found in the selected academic scope."},
                status=status.HTTP_404_NOT_FOUND,
            )
        (sub_code, sub_name), sub_tas = target
        sub_ta_ids = [ta.id for ta in sub_tas]
        sub_sec_ids = {ta.section_id for ta in sub_tas if ta.section_id}

        # Security: college-wide roles may inspect any subject; everyone else
        # only subjects taught within their allowed departments or by
        # themselves (same authorization architecture as Faculty Analysis).
        if not scope["is_college_wide"]:
            allowed_dept_ids = scope.get("_allowed_dept_id_set", set())
            ok = False
            for ta in sub_tas:
                if ta.staff.user_id == request.user.id:
                    ok = True
                    break
                ta_dept_ids = {
                    ta.staff.department_id,
                    ta.section.batch.course.department_id if ta.section_id else None,
                }
                if any(d and d in allowed_dept_ids for d in ta_dept_ids):
                    ok = True
                    break
            if not ok:
                return Response(
                    {"error": "You are not authorized to view this subject's data."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ---- Normalized mark aggregation --------------------------------------
        # Each assessment is normalized against its own observed maximum in
        # scope, so SSA /20 and CIA /50 are never mixed raw.
        registry_by_name = {name: (M, f) for name, M, f in assessment_registry}
        selected_name = req_exam if req_exam in registry_by_name else None
        # "Semester Exam" is sourced exclusively from the COE final-result table
        # (normalized against each row's own max_marks) — never from the internal
        # mark models, so selecting it must not fall back to All Assessments.
        semester_only = (req_exam == "Semester Exam")
        if selected_name:
            scan = [(selected_name, *registry_by_name[selected_name])]
        elif semester_only:
            scan = []
        else:
            scan = assessment_registry

        per_assessment = {}              # name -> [count, sum_pct, pass_count]
        per_section = {}                 # section_name -> [count, sum_pct, pass_count]
        per_student = {}                 # student_id -> [count, sum_pct, pass_count]
        per_student_per_assessment = {}  # student_id -> {name: [count, sum_pct, pass]}
        total_cnt, total_sum, total_pass = 0, 0.0, 0

        sec_by_ta = {ta.id: (ta.section.name if ta.section else "—") for ta in sub_tas}
        for a_name, M, a_field in scan:
            qs = M.objects.filter(teaching_assignment_id__in=sub_ta_ids).exclude(**{a_field + "__isnull": True})
            ref = qs.aggregate(m=Max(a_field))["m"]
            if not ref or float(ref) <= 0:
                continue
            ref = float(ref)
            a_st = per_assessment.setdefault(a_name, [0, 0.0, 0])
            for ta_id, sid, val in qs.values_list("teaching_assignment_id", "student_id", a_field):
                pct = (float(val) / ref) * 100.0
                passed = pct >= 50.0
                a_st[0] += 1; a_st[1] += pct; a_st[2] += 1 if passed else 0
                s_st = per_section.setdefault(sec_by_ta.get(ta_id, "—"), [0, 0.0, 0])
                s_st[0] += 1; s_st[1] += pct; s_st[2] += 1 if passed else 0
                st = per_student.setdefault(sid, [0, 0.0, 0])
                st[0] += 1; st[1] += pct; st[2] += 1 if passed else 0
                sa = per_student_per_assessment.setdefault(sid, {}).setdefault(a_name, [0, 0.0, 0])
                sa[0] += 1; sa[1] += pct; sa[2] += 1 if passed else 0
                total_cnt += 1; total_sum += pct; total_pass += 1 if passed else 0

        # ---- Students in the subject scope -------------------------------------
        cohort_qs = (
            active_student_cohort().filter(section_id__in=sub_sec_ids)
            if sub_sec_ids else StudentProfile.objects.none()
        )
        cohort_map = {s.id: s for s in cohort_qs.select_related(
            "user", "section", "section__semester", "home_department"
        )}
        for sid in set(per_student.keys()):
            if sid not in cohort_map:
                extra = StudentProfile.objects.filter(id=sid).select_related(
                    "user", "section", "section__semester", "home_department"
                ).first()
                if extra:
                    cohort_map[sid] = extra
        reg_to_id = {s.reg_no: s.id for s in cohort_map.values() if s.reg_no}

        # Semester Exam — COE final results (reg_no + course_code match).
        # Normalized against each row's own max_marks; only resolvable students
        # are counted (unknown reg_nos are ignored, never guessed).
        if selected_name is None or selected_name == "Semester Exam":
            try:
                from COE.models import CoeFinalResult
                cohort_regs = [r for r in reg_to_id.keys() if r]
                if cohort_regs and sub_code:
                    coe_qs = CoeFinalResult.objects.filter(
                        reg_no__in=cohort_regs, course_code__iexact=sub_code
                    ).exclude(max_marks=0)
                    for reg, val, mx in coe_qs.values_list("reg_no", "total_marks", "max_marks"):
                        if not mx or float(mx) <= 0:
                            continue
                        sid = reg_to_id.get(reg)
                        if sid is None:
                            continue
                        pct = (float(val) / float(mx)) * 100.0
                        passed = pct >= 50.0
                        coe_st = per_assessment.setdefault("Semester Exam", [0, 0.0, 0])
                        coe_st[0] += 1; coe_st[1] += pct; coe_st[2] += 1 if passed else 0
                        s_obj = cohort_map[sid]
                        s_st = per_section.setdefault(
                            s_obj.section.name if s_obj.section_id else "—", [0, 0.0, 0]
                        )
                        s_st[0] += 1; s_st[1] += pct; s_st[2] += 1 if passed else 0
                        st = per_student.setdefault(sid, [0, 0.0, 0])
                        st[0] += 1; st[1] += pct; st[2] += 1 if passed else 0
                        sa = per_student_per_assessment.setdefault(sid, {}).setdefault("Semester Exam", [0, 0.0, 0])
                        sa[0] += 1; sa[1] += pct; sa[2] += 1 if passed else 0
                        total_cnt += 1; total_sum += pct; total_pass += 1 if passed else 0
            except Exception:
                logger.exception("Semester Exam aggregation failed for subject %s", sub_code)

        # ---- Student rows -------------------------------------------------------
        students_out = []
        for sid, s_obj in cohort_map.items():
            agg = per_student.get(sid)
            per_a = per_student_per_assessment.get(sid, {})
            if selected_name:
                a = per_a.get(selected_name)
                marks = (a[1] / a[0]) if a else None
                a_lbl = selected_name
            elif per_a:
                # All Assessments: average of independently normalized values.
                tot_cnt = sum(v[0] for v in per_a.values())
                tot_sum = sum(v[1] for v in per_a.values())
                marks = (tot_sum / tot_cnt) if tot_cnt else None
                a_lbl = "All Assessments"
            else:
                marks, a_lbl = None, "All Assessments"
            students_out.append({
                "student_id": str(sid),
                "reg_no": s_obj.reg_no or f"REG{sid}",
                "name": s_obj.user.get_full_name() or s_obj.user.username,
                "section": s_obj.section.name if s_obj.section_id else "—",
                "semester": str(s_obj.section.semester.number) if (s_obj.section and s_obj.section.semester) else "—",
                "assessment": a_lbl,
                "marks_pct": round(marks, 1) if marks is not None else None,
                "result": ("Pass" if agg and (agg[1] / agg[0]) >= 50.0 else "Fail") if agg and agg[0] else None,
                "total_records": agg[0] if agg else 0,
                "attendance_pct": None,
            })
        students_out.sort(key=lambda r: (r["reg_no"] or "").strip())

        # Bulk per-student attendance (single grouped query — no N+1).
        sid_list = [int(r["student_id"]) for r in students_out]
        att_map = {}
        if sid_list:
            att_rows = (
                DailyAttendanceRecord.objects.filter(student_id__in=sid_list)
                .values("student_id", "status")
                .annotate(c=Count("id"))
            )
            for row in att_rows:
                e = att_map.setdefault(row["student_id"], [0, 0])
                e[0] += row["c"]
                if row["status"] in ("P", "OD", "PRESENT", "ON_DUTY"):
                    e[1] += row["c"]
        for r in students_out:
            e = att_map.get(int(r["student_id"]))
            r["attendance_pct"] = round((e[1] / e[0]) * 100.0, 1) if e and e[0] else None

        # ---- Section-wise analysis ----------------------------------------------
        sections_out = []
        sec_cohort = {}
        if sub_sec_ids:
            for sid, sec_name in active_student_cohort().filter(
                section_id__in=sub_sec_ids, section__isnull=False
            ).values_list("id", "section__name"):
                sec_cohort.setdefault(sec_name, set()).add(sid)
        for sec_name in sorted({(ta.section.name if ta.section else "—") for ta in sub_tas}):
            s_st = per_section.get(sec_name)
            cohort_ids = sec_cohort.get(sec_name, set())
            sections_out.append({
                "section": sec_name,
                "students": len(cohort_ids) or (s_st[0] if s_st else 0),
                "avg_marks_pct": round(s_st[1] / s_st[0], 1) if s_st and s_st[0] else None,
                "pass_pct": round((s_st[2] / s_st[0]) * 100.0, 1) if s_st and s_st[0] else None,
                "attendance_pct": _att_pct(cohort_ids),
                "total_records": s_st[0] if s_st else 0,
            })

        # ---- Faculty actually teaching this subject (never arbitrary) -----------
        fac_map = {}
        for ta in sub_tas:
            entry = fac_map.setdefault(ta.staff_id, {"staff": ta.staff, "sections": set()})
            if ta.section:
                entry["sections"].add(ta.section.name)
        faculty_out = [
            {
                "id": str(v["staff"].id),
                "name": v["staff"].user.get_full_name() or v["staff"].user.username,
                "staff_id": v["staff"].staff_id or f"FAC{v['staff'].id}",
                "designation": v["staff"].designation or "",
                "sections": sorted(v["sections"]),
            }
            for v in fac_map.values()
        ]
        faculty_out.sort(key=lambda f: f["name"].lower())

        # ---- Charts --------------------------------------------------------------
        pcts = [r["marks_pct"] for r in students_out if r["marks_pct"] is not None]
        distribution = []
        for low in range(0, 100, 10):
            high = low + 10
            c = sum(1 for v in pcts if (0 <= v <= high)) if low == 0 else sum(1 for v in pcts if low < v <= high)
            distribution.append({"label": f"{low}-{high}", "students": c})
        assessments_out = [
            {
                "assessment": a,
                "students": v[0],
                "avg_marks_pct": round(v[1] / v[0], 1) if v[0] else None,
                "pass_pct": round((v[2] / v[0]) * 100.0, 1) if v[0] else None,
                "total_records": v[0],
            }
            for a, v in per_assessment.items() if v[0]
        ]
        assessments_out.sort(key=lambda a: a["assessment"])

        dept_lbl = dept_code or (
            (sub_tas[0].section.batch.course.department.short_name
             or sub_tas[0].section.batch.course.department.name)
            if sub_tas and sub_tas[0].section_id
            and sub_tas[0].section.batch.course.department_id else ""
        )

        metrics = {
            "students": len(cohort_map),
            "average_marks_pct": round(total_sum / total_cnt, 1) if total_cnt else None,
            "pass_pct": round((total_pass / total_cnt) * 100.0, 1) if total_cnt else None,
            "attendance_pct": _att_pct(cohort_map.keys()),
            "pass_count": total_pass,
            "fail_count": total_cnt - total_pass,
            "total_records": total_cnt,
        }

        return Response({
            "subject": {
                "id": sub_ta_ids[0] if sub_ta_ids else None,
                "code": sub_code or sub_name or "—",
                "name": sub_name or sub_code or "—",
                "department": dept_lbl,
                "academic_year": req_batch or "",
                "semester": req_sem or "",
            },
            "faculty": faculty_out,
            "metrics": metrics,
            "sections": sections_out,
            "students": students_out,
            "assessments": assessments_out,
            "charts": {
                "marks_distribution": distribution,
                "section_avg": [{"label": s["section"], "value": s["avg_marks_pct"]} for s in sections_out],
                "section_pass": [{"label": s["section"], "value": s["pass_pct"]} for s in sections_out],
                "assessment_comparison": [
                    {"label": a["assessment"], "value": a["avg_marks_pct"]} for a in assessments_out
                ],
                "pass_fail": [
                    {"label": "Pass", "value": total_pass},
                    {"label": "Fail", "value": total_cnt - total_pass},
                ],
            },
            "assessment": req_exam,
            "user_context": auth_ctx,
        }, status=status.HTTP_200_OK)





