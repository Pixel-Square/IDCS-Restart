def get_exam_model(exam_type):
    from OBE.models import Cia1Mark, Cia2Mark, ModelExamMark, Formative1Mark, Formative2Mark
    exam = exam_type.upper()
    if exam == "CIA 1": return Cia1Mark
    if exam == "CIA 2": return Cia2Mark
    if exam == "MODEL": return ModelExamMark
    if exam == "FA 1": return Formative1Mark
    if exam == "FA 2": return Formative2Mark
    return Cia1Mark
print("OK")
