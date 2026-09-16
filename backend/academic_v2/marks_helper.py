from django.db.models import Max, Q

# NOTE: DEFAULT_TOTALS removed. All total marks are now derived dynamically using get_max_ref.

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

        def _get_record_max(model, m, field):
            if hasattr(m, 'max_mark') and getattr(m, 'max_mark') is not None:
                return float(m.max_mark)
            if hasattr(m, 'max_marks') and getattr(m, 'max_marks') is not None:
                return float(m.max_marks)
            
            try:
                from academic_v2.models import AcV2ExamAssignment
                mapping = {
                    'Cia1Mark': 'CIA 1', 'Cia2Mark': 'CIA 2', 
                    'ModelExamMark': 'Model Exam', 'LabExamMark': 'Lab Exam',
                    'Ssa1Mark': 'SSA 1', 'Ssa2Mark': 'SSA 2',
                    'Review1Mark': 'Review 1', 'Review2Mark': 'Review 2',
                    'Formative1Mark': 'Formative 1', 'Formative2Mark': 'Formative 2',
                }
                exam_name = mapping.get(model.__name__)
                if exam_name and getattr(m, 'teaching_assignment_id', None):
                    assignment = AcV2ExamAssignment.objects.filter(
                        teaching_assignment_id=m.teaching_assignment_id, 
                        exam__iexact=exam_name
                    ).first()
                    if assignment and getattr(assignment, 'max_marks', None):
                        return float(assignment.max_marks)
            except Exception:
                pass
            
            return get_max_ref(model, field)

        def _score_of(m, field):
            val = getattr(m, field, None)
            if val is None and field != "total_mark":
                val = getattr(m, "total_mark", None)
            try:
                return float(val) if val is not None else None
            except (TypeError, ValueError):
                return None

        if exam in ("ALL", "ALL ASSESSMENTS"):
            for label, model, field in all_models:
                for m in _matches_subject(model.objects.filter(student=student).select_related("subject")):
                    if not m.subject:
                        continue
                    score = _score_of(m, field)
                    if score is not None:
                        total_marks = _get_record_max(model, m, field)
                        pct = (score / total_marks) * 100.0 if total_marks > 0 else 0.0
                        marks_data.append({
                            "subject_code": m.subject.code,
                            "subject_name": m.subject.name,
                            "assessment": label,
                            "score": score,
                            "max_mark": total_marks,
                            "score_pct": round(pct, 1),
                            "remark": get_remark(pct),
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

            for m in _matches_subject(selected_model.objects.filter(student=student).select_related("subject")):
                if not m.subject:
                    continue
                score = _score_of(m, selected_field)
                if score is not None:
                    total_marks = _get_record_max(selected_model, m, selected_field)
                    pct = (score / total_marks) * 100.0 if total_marks > 0 else 0.0
                    marks_data.append({
                        "subject_code": m.subject.code,
                        "subject_name": m.subject.name,
                        "assessment": assessment_label,
                        "score": score,
                        "max_mark": total_marks,
                        "score_pct": round(pct, 1),
                        "remark": get_remark(pct),
                    })
                else:
                    marks_data.append({
                        "subject_code": m.subject.code,
                        "subject_name": m.subject.name,
                        "assessment": assessment_label,
                        "score": '—',
                        "max_mark": '—',
                        "score_pct": None,
                        "remark": '—',
                    })
    return marks_data
