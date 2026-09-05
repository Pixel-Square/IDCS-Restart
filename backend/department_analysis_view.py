"""Department-level drill-down analytics view."""

from django.db.models import Q

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework import status

from academics.models import Department, DailyAttendanceRecord

from academic_v2.authorization import (
    get_performance_scope,
    clamp_department_param,
    allowed_student_q,
)
from academic_v2.academic_performance_views import (
    resolve_department_id,
    get_student_dept_q,
    active_student_cohort,
    resolve_exam_models,
)
from rest_framework.views import APIView



class DepartmentAnalysisView(APIView):
    """Department drill-down analytics."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scope = get_performance_scope(request.user)
        dept = request.query_params.get("dept", "").strip()
        year = request.query_params.get("year", "").strip()
        sem_raw = request.query_params.get("sem", "").strip()
        exam_type = request.query_params.get("exam", "All Assessments").strip()
        section_val = request.query_params.get("section", "").strip()
        dept_id = resolve_department_id(dept) if dept else None
        effective_dept = clamp_department_param(scope, dept) if dept else ""
        sem_num = int(sem_raw) if sem_raw.isdigit() else None

        student_qs = active_student_cohort().select_related("home_department", "section", "user")
        if effective_dept:
            student_qs = student_qs.filter(get_student_dept_q(effective_dept))
        if year:
            student_qs = student_qs.filter(Q(batch=year) | Q(section__batch__name=year))
        if sem_num:
            student_qs = student_qs.filter(section__semester__number=sem_num)
        if section_val:
            student_qs = student_qs.filter(section__name__iexact=section_val)
        _sq = allowed_student_q(scope, get_student_dept_q)
        if _sq is not None:
            student_qs = student_qs.filter(_sq)
        student_ids = list(student_qs.values_list("id", flat=True))
        total_students = len(student_ids)

        mark_models = resolve_exam_models(exam_type)

        # Map each mark model to the single concrete value field it stores, so we
        # can aggregate correctly across models that do not share the same column
        # (e.g. Cia1Mark.mark vs ModelExamMark.total_mark vs FinalInternalMark.final_mark).
        from OBE.models import (
            Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
            Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
        )
        _MODEL_VALUE_FIELD = {
            Cia1Mark: "mark", Cia2Mark: "mark",
            Ssa1Mark: "mark", Ssa2Mark: "mark",
            Review1Mark: "mark", Review2Mark: "mark",
            Formative1Mark: "total", Formative2Mark: "total",
            ModelExamMark: "total_mark", LabExamMark: "total_mark",
            FinalInternalMark: "final_mark",
        }
        model_fields = [(_MODEL_VALUE_FIELD.get(M, "mark"), M) for M in mark_models]

        student_scores = {}
        for value_field, M in model_fields:
            for m in M.objects.filter(student_id__in=student_ids).values("student_id", value_field):
                sid = m["student_id"]
                val = float(m.get(value_field) or 0.0)
                if val > 0:
                    student_scores.setdefault(sid, []).append(val)

        pass_count = 0
        fail_count = 0
        student_avg = {}
        for sid, scores in student_scores.items():
            avg = sum(scores) / len(scores)
            student_avg[sid] = avg
            if avg >= 50.0:
                pass_count += 1
            else:
                fail_count += 1
        untested = total_students - len(student_scores)
        fail_count += untested
        all_avgs = list(student_avg.values())
        overall_avg = round(sum(all_avgs) / len(all_avgs), 1) if all_avgs else 0.0
        pass_pct = round((pass_count / total_students) * 100.0, 1) if total_students > 0 else 0.0

        att_qs = DailyAttendanceRecord.objects.filter(student_id__in=student_ids)
        total_att = att_qs.count()
        if total_att > 0:
            present_cnt = att_qs.filter(status__in=["P", "OD", "PRESENT", "ON_DUTY"]).count()
            attendance = round((present_cnt / total_att) * 100.0, 1)
        else:
            attendance = None

        section_wise = []
        section_stats = {}
        for s in student_qs.select_related("section"):
            sec_name = s.section.name if s.section else "Unknown"
            if sec_name not in section_stats:
                section_stats[sec_name] = {"students": 0, "scores": []}
            section_stats[sec_name]["students"] += 1
            if s.id in student_avg:
                section_stats[sec_name]["scores"].append(student_avg[s.id])
        for sec_name, stats in sorted(section_stats.items()):
            scores = stats["scores"]
            passed = sum(1 for v in scores if v >= 50.0)
            section_wise.append({
                "section": sec_name,
                "students": stats["students"],
                "avg_marks": round(sum(scores) / len(scores), 1) if scores else None,
                "pass_pct": round((passed / len(scores)) * 100.0, 1) if scores else 0.0,
                "attendance": None,
            })

        subject_stats = {}
        for value_field, M in model_fields:
            for m in M.objects.filter(student_id__in=student_ids).select_related("subject").values(
                "student_id", "subject__code", "subject__name", value_field
            ):
                code = m.get("subject__code") or ""
                name = m.get("subject__name") or code
                val = float(m.get(value_field) or 0.0)
                if val > 0 and code:
                    if code not in subject_stats:
                        subject_stats[code] = {"name": name, "scores": []}
                    subject_stats[code]["scores"].append(val)
        subject_wise = []
        for code, stats in sorted(subject_stats.items()):
            scores = stats["scores"]
            passed = sum(1 for v in scores if v >= 50.0)
            subject_wise.append({
                "subject_code": code,
                "subject_name": stats["name"],
                "students": len(scores),
                "avg_marks": round(sum(scores) / len(scores), 1) if scores else 0.0,
                "pass_pct": round((passed / len(scores)) * 100.0, 1) if scores else 0.0,
                "pass_count": passed,
                "fail_count": len(scores) - passed,
            })

        distribution = {"0-49": 0, "50-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0}
        for avg in student_avg.values():
            if avg < 50:
                distribution["0-49"] += 1
            elif avg < 60:
                distribution["50-59"] += 1
            elif avg < 70:
                distribution["60-69"] += 1
            elif avg < 78:
                distribution["70-79"] += 1
            elif avg < 90:
                distribution["80-89"] += 1
            else:
                distribution["90-100"] += 1

        student_list = []
        for s in student_qs.select_related("user", "section")[:200]:
            avg = student_avg.get(s.id, None)
            student_list.append({
                "student_id": str(s.id),
                "reg_no": s.reg_no or "",
                "name": s.user.get_full_name() or s.user.username,
                "section": s.section.name if s.section else "",
                "avg_marks": round(avg, 1) if avg is not None else None,
                "result": "Pass" if (avg is not None and avg >= 50.0) else ("Fail" if avg is not None else "N/A"),
            })

        dept_name = ""
        if dept_id:
            d = Department.objects.filter(pk=dept_id).first()
            dept_name = d.name if d else dept

        return Response({
            "department": dept_name,
            "department_id": dept_id,
            "filters": {"year": year, "sem": sem_raw, "exam": exam_type, "section": section_val},
            "metrics": {
                "total_students": total_students,
                "pass_count": pass_count,
                "fail_count": fail_count,
                "pass_pct": pass_pct,
                "avg_marks": overall_avg,
                "attendance": attendance,
            },
            "section_wise": section_wise,
            "subject_wise": subject_wise,
            "distribution": distribution,
            "students": student_list,
        }, status=status.HTTP_200_OK)



