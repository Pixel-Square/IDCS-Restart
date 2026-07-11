from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='academic_v2.AcV2ClassType')
def sync_class_type_to_curriculum(sender, instance, **kwargs):
    """When an Academic v2 class type is created/updated, ensure a matching
    entry exists in the curriculum ClassType table so it can be selected
    in department curriculum dropdowns."""
    try:
        from curriculum.models import ClassType
        code = instance.short_code or instance.name
        label = instance.display_name or instance.name
        obj, created = ClassType.objects.update_or_create(
            code=code,
            defaults={'label': label},
        )
    except Exception:
        pass


@receiver(post_save, sender='academics.TeachingAssignment')
def sync_teaching_assignment_to_acv2_section(sender, instance, **kwargs):
    """
    When a TeachingAssignment is created or updated, synchronize its staff's user
    to the faculty_user field of all corresponding AcV2Section records.
    Also auto-creates/syncs AcV2Course and AcV2Section if they don't exist yet.
    """
    try:
        from academic_v2.models import AcV2Section, AcV2Course, AcV2ClassType
        from academics.models import Subject as AcademicsSubject
        
        # Get the associated staff user
        staff_user = getattr(getattr(instance, 'staff', None), 'user', None)
        
        # Check if the assignment is active and has a section
        sec = instance.section
        if not getattr(instance, 'is_active', True) or not sec:
            # If deactivated, we can clear the faculty user but keep the records
            sections = AcV2Section.objects.filter(teaching_assignment=instance)
            for s in sections:
                if s.faculty_user != staff_user:
                    s.faculty_user = staff_user
                    s.save(update_fields=['faculty_user'])
            return

        cr = instance.curriculum_row
        es = instance.elective_subject
        if not cr and not es:
            # Fallback: only update existing linked AcV2Section records to use this staff_user
            sections = AcV2Section.objects.filter(teaching_assignment=instance)
            for s in sections:
                if s.faculty_user != staff_user:
                    s.faculty_user = staff_user
                    s.save(update_fields=['faculty_user'])
            return
        
        course_code = (cr.course_code if cr else None) or (getattr(es, 'course_code', None)) or '-'
        course_name = (cr.course_name if cr else None) or (getattr(es, 'course_name', None)) or '-'
        class_type_code = (cr.class_type if cr else None) or 'THEORY'
        qp_type_code = (
            getattr(cr, 'question_paper_type', None)
            or getattr(es, 'question_paper_type', None)
            or ''
        ).strip()
        
        # Find or create AcademicsSubject fallback
        subject = instance.subject or (
            AcademicsSubject.objects.filter(code=course_code).first()
            if course_code and course_code != '-' else None
        )
        semester = sec.semester if sec else None
        
        if not subject and semester and course_code and course_code != '-':
            try:
                # Try to get or create to avoid race conditions
                subject, _ = AcademicsSubject.objects.get_or_create(
                    code=course_code,
                    defaults={
                        'name': course_name,
                        'semester': semester
                    }
                )
            except Exception:
                # If get_or_create fails, fetch again
                subject = AcademicsSubject.objects.filter(code=course_code).first()

        acv2_course = None
        if subject and semester:
            acv2_ct = (
                AcV2ClassType.objects.filter(is_active=True, short_code__iexact=class_type_code).first()
                or AcV2ClassType.objects.filter(is_active=True, name__iexact=class_type_code).first()
            )
            
            acv2_course, created = AcV2Course.objects.get_or_create(
                subject=subject,
                semester=semester,
                defaults={
                    'subject_code': course_code,
                    'subject_name': course_name,
                    'class_type': acv2_ct,
                    'class_type_name': acv2_ct.display_name if acv2_ct else class_type_code,
                },
            )
            # Sync question_paper_type from curriculum onto AcV2Course
            if qp_type_code and acv2_course.question_paper_type != qp_type_code:
                acv2_course.question_paper_type = qp_type_code
                acv2_course.save(update_fields=['question_paper_type'])
            # Correct class_type if it was previously set to the wrong one
            if not created and acv2_ct and acv2_course.class_type_id != acv2_ct.id:
                acv2_course.class_type = acv2_ct
                acv2_course.class_type_name = acv2_ct.display_name if acv2_ct else class_type_code
                acv2_course.save(update_fields=['class_type', 'class_type_name'])
                
        if acv2_course:
            # Create/update AcV2Section
            acv2_sec, created = AcV2Section.objects.get_or_create(
                course=acv2_course,
                teaching_assignment=instance,
                defaults={
                    'section_name': sec.name if sec else 'A',
                    'faculty_user': staff_user,
                },
            )
            if not created and acv2_sec.faculty_user != staff_user:
                acv2_sec.faculty_user = staff_user
                acv2_sec.save(update_fields=['faculty_user'])
        else:
            # Fallback: update any existing linked AcV2Section records to use this staff_user
            sections = AcV2Section.objects.filter(teaching_assignment=instance)
            for s in sections:
                if s.faculty_user != staff_user:
                    s.faculty_user = staff_user
                    s.save(update_fields=['faculty_user'])
    except Exception:
        pass

