from django.db.models import Max, Q

def get_remark(pct):
    if pct >= 90: return "Excellent"
    if pct >= 80: return "Very Good"
    if pct >= 70: return "Good"
    if pct >= 60: return "Satisfactory"
    if pct >= 50: return "Needs Improvement"
    return "Needs Significant Improvement"

def get_student_marks_data(student, exam_type, subject_filter=''):
    exam = exam_type.upper().strip()
    marks_data = []
    assessment_label = exam_type.strip() or "CIA 1"

    def _matches_subject(qs):
        if subject_filter:
            return qs.filter(
                Q(subject__code__iexact=subject_filter)
                | Q(subject__name__icontains=subject_filter)
            )
        return qs

    if "SEMESTER" in exam:
        from COE.models import CoeFinalResult
        coe_qs = CoeFinalResult.objects.filter(reg_no=student.reg_no)
        if subject_filter:
            coe_qs = coe_qs.filter(
                Q(course_code__iexact=subject_filter)
                | Q(course_name__icontains=subject_filter)
            )
        for c in coe_qs:
            total = float(c.total_marks or 0.0)
            max_mark = float(c.max_marks or 100.0)
            pct = (total / max_mark) * 100.0 if max_mark > 0 else 0.0
            subj = getattr(c, "subject", None)
            marks_data.append({
                "subject_code": c.course_code or (subj.code if subj else ""),
                "subject_name": c.course_name or (subj.name if subj else c.course_code),
                "assessment": "Semester Exam",
                "score": total,
                "score_pct": pct,
                "remark": get_remark(pct),
            })
    else:
        from OBE.models import (
            Cia1Mark, Cia2Mark, Ssa1Mark, Ssa2Mark, Review1Mark, Review2Mark,
            Formative1Mark, Formative2Mark, ModelExamMark, LabExamMark, FinalInternalMark,
        )
        all_models = [
            ("CIA 1", Cia1Mark, "mark"), ("CIA 2", Cia2Mark, "mark"),
            ("SSA 1", Ssa1Mark, "mark"), ("SSA 2", Ssa2Mark, "mark"),
            ("REVIEW 1", Review1Mark, "mark"), ("REVIEW 2", Review2Mark, "mark"),
            ("FORMATIVE 1", Formative1Mark, "total"), ("FORMATIVE 2", Formative2Mark, "total"),
            ("MODEL", ModelExamMark, "total_mark"), ("LAB", LabExamMark, "total_mark"),
            ("FINAL INTERNAL", FinalInternalMark, "final_mark"),
        ]
        
        max_refs = {}
        def get_max_ref(model, field):
            if model not in max_refs:
                ref = model.objects.aggregate(m=Max(field))["m"]
                max_refs[model] = float(ref) if ref and float(ref) > 0 else 100.0
            return max_refs[model]

        def _score_of(m, field):
            val = getattr(m, field, None)
            if val is None and field != "total_mark":
                val = getattr(m, "total_mark", None)
            try:
                return float(val) if val is not None else None
            except (TypeError, ValueError):
                return None

        if exam in ("ALL", "ALL ASSESSMENTS"):
            acc = {}
            for label, model, field in all_models:
                max_ref = get_max_ref(model, field)
                for m in _matches_subject(model.objects.filter(student=student).select_related("subject")):
                    if not m.subject:
                        continue
                    code = m.subject.code
                    if code not in acc:
                        acc[code] = {"name": m.subject.name, "scores": [], "pcts": []}
                    score = _score_of(m, field)
                    if score is not None:
                        acc[code]["scores"].append(score)
                        acc[code]["pcts"].append((score / max_ref) * 100.0)
            for code, data in acc.items():
                if not data["scores"]:
                    continue
                avg_score = round(sum(data["scores"]) / len(data["scores"]), 1)
                avg_pct = round(sum(data["pcts"]) / len(data["pcts"]), 1)
                marks_data.append({
                    "subject_code": code,
                    "subject_name": data["name"],
                    "assessment": "All Assessments",
                    "score": avg_score,
                    "score_pct": avg_pct,
                    "remark": get_remark(avg_pct),
                })
        else:
            selected_model = Cia1Mark
            selected_field = "mark"
            for key, model, field in all_models:
                if key in exam:
                    selected_model = model
                    selected_field = field
                    assessment_label = key
                    break
            
            max_ref = get_max_ref(selected_model, selected_field)
            for m in _matches_subject(selected_model.objects.filter(student=student).select_related("subject")):
                if not m.subject:
                    continue
                score = _score_of(m, selected_field)
                if score is not None:
                    pct = (score / max_ref) * 100.0
                    marks_data.append({
                        "subject_code": m.subject.code,
                        "subject_name": m.subject.name,
                        "assessment": assessment_label,
                        "score": score,
                        "score_pct": pct,
                        "remark": get_remark(pct),
                    })
                else:
                    marks_data.append({
                        "subject_code": m.subject.code,
                        "subject_name": m.subject.name,
                        "assessment": assessment_label,
                        "score": '—',
                        "score_pct": None,
                        "remark": '—',
                    })
    return marks_data
