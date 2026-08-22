from rest_framework import serializers
from .models import TimetableTemplate, TimetableSlot, TimetableAssignment, Venue
from .models import SpecialTimetable, SpecialTimetableEntry, PeriodSwapRequest


class VenueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        fields = ('id', 'name', 'code', 'venue_type', 'capacity', 'location', 'description', 'is_active', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at')


class PeriodDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimetableSlot
        fields = ('id', 'template', 'index', 'start_time', 'end_time', 'is_break', 'is_lunch', 'label')


class TimetableTemplateSerializer(serializers.ModelSerializer):
    periods = PeriodDefinitionSerializer(many=True, read_only=True)

    class Meta:
        model = TimetableTemplate
        fields = ('id', 'name', 'description', 'created_by', 'is_public', 'is_active', 'parity', 'created_at', 'periods')


def get_teaching_assignments_for_section_and_curriculum(section, curriculum_row):
    if not section or not curriculum_row:
        return []
    
    from academics.models import TeachingAssignment
    
    # 1. Start with the direct section teaching assignments
    section_ids = [section.id]
    
    # 2. If it's a shared/S&H section (i.e. batch has no course, or department is S&H)
    is_shared = False
    try:
        is_shared = (getattr(section.batch, 'course_id', None) is None)
        if not is_shared:
            code = getattr(section.department, 'code', None) or getattr(section, 'department_short_name', None)
            is_shared = (code == 'S&H' or section.department_id is None)
    except Exception:
        pass
        
    if is_shared:
        # Resolve secondary sections of students enrolled in this section
        try:
            from academics.models import StudentSectionAssignment
            primary_student_ids = list(
                StudentSectionAssignment.objects.filter(
                    section=section,
                    end_date__isnull=True,
                    section_type='PRIMARY'
                ).values_list('student_id', flat=True).distinct()
            )
            if primary_student_ids:
                secondary_section_ids = list(
                    StudentSectionAssignment.objects.filter(
                        student_id__in=primary_student_ids,
                        end_date__isnull=True,
                        section_type='SECONDARY'
                    ).values_list('section_id', flat=True).distinct()
                )
                if secondary_section_ids:
                    section_ids.extend(secondary_section_ids)
        except Exception:
            pass
            
        # Also include core-dept sections for the same batch year/regulation + semester
        try:
            batch_year_id = getattr(section.batch, 'batch_year_id', None)
            regulation_id = getattr(section.batch, 'regulation_id', None)
            sem_num = getattr(section.semester, 'number', None)
            
            # home departments of students
            home_dept_ids = list(
                StudentSectionAssignment.objects.filter(
                    section=section,
                    end_date__isnull=True,
                    section_type='PRIMARY',
                    student__home_department__isnull=False
                ).values_list('student__home_department_id', flat=True).distinct()
            )
            if batch_year_id and sem_num and home_dept_ids:
                from academics.models import Section as AcademicsSection
                from django.db.models import Q
                core_dept_section_ids = list(
                    AcademicsSection.objects.filter(
                        semester__number=sem_num,
                        batch__batch_year_id=batch_year_id
                    ).filter(
                        Q(batch__course__department_id__in=home_dept_ids) |
                        Q(batch__department_id__in=home_dept_ids)
                    ).filter(
                        Q(batch__regulation_id=regulation_id) if regulation_id else Q()
                    ).values_list('id', flat=True).distinct()
                )
                if core_dept_section_ids:
                    section_ids.extend(core_dept_section_ids)
        except Exception:
            pass
            
    # Deduplicate section IDs
    section_ids = list(set(section_ids))
    
    # 3. Query all active teaching assignments in these sections for the active academic year
    from academics.models import AcademicYear
    active_ay = AcademicYear.objects.filter(is_active=True).order_by('-id').first()
    
    tas = TeachingAssignment.objects.filter(
        section_id__in=section_ids,
        is_active=True
    )
    if active_ay:
        tas = tas.filter(academic_year=active_ay)
        
    tas = tas.select_related('staff__user', 'curriculum_row', 'elective_subject', 'elective_subject__parent')
    
    # 4. Filter the teaching assignments to match the curriculum_row.
    # We match by curriculum_row directly OR by course_code/course_name (for program core/shared curriculum rows)
    matched_staff_profiles = []
    seen_staff_ids = set()
    
    target_code = getattr(curriculum_row, 'course_code', None)
    target_name = (getattr(curriculum_row, 'course_name', None) or '').strip().lower()
    
    # Equivalent course codes mapping for shared sections (e.g. S&H 1st Year)
    # If the target course is in one of these groups, we match teaching assignments
    # from any course in the same group.
    EQUIVALENT_GROUPS = [
        {"ADI1151", "AMB1121"},
        {"ADI1153", "AMB1131"},
        {"CGA1101-CSE", "CGA1101-IT"},
        {"CGA1111-CSE", "CGA1111-IT"},
    ]
    
    target_codes = {str(target_code).strip().upper()} if target_code else set()
    if target_code:
        tc_upper = str(target_code).strip().upper()
        for group in EQUIVALENT_GROUPS:
            if tc_upper in group:
                target_codes = group
                break
    
    for ta in tas:
        if not ta.staff:
            continue
        
        # Check direct curriculum row match
        cr = ta.curriculum_row
        es = ta.elective_subject
        parent = getattr(es, 'parent', None) if es else None
        
        matches = False
        if cr and cr.id == curriculum_row.id:
            matches = True
        elif es and parent and parent.id == curriculum_row.id:
            matches = True
        else:
            # Fallback to course_code or course_name matching for shared sections
            ta_row = cr or parent
            if ta_row:
                ta_code = getattr(ta_row, 'course_code', None)
                ta_name = (getattr(ta_row, 'course_name', None) or '').strip().lower()
                if target_codes and ta_code and str(ta_code).strip().upper() in target_codes:
                    matches = True
                elif target_name and ta_name and target_name == ta_name:
                    matches = True
            elif es:
                # also check if the elective subject itself matches by code/name
                es_code = getattr(es, 'course_code', None)
                es_name = (getattr(es, 'course_name', None) or '').strip().lower()
                if target_codes and es_code and str(es_code).strip().upper() in target_codes:
                    matches = True
                elif target_name and es_name and target_name == es_name:
                    matches = True
                    
        if matches:
            if ta.staff.id not in seen_staff_ids:
                seen_staff_ids.add(ta.staff.id)
                matched_staff_profiles.append(ta.staff)
                
    return matched_staff_profiles


def _get_staff_name(u, sp):
    if not u:
        return getattr(sp, 'staff_id', '')
    name = u.get_full_name().strip()
    if not name:
        name = u.username
    return name or getattr(sp, 'staff_id', '')


class TimetableAssignmentSerializer(serializers.ModelSerializer):
    period_id = serializers.PrimaryKeyRelatedField(queryset=TimetableSlot.objects.all(), source='period', write_only=True)
    day = serializers.IntegerField(write_only=True)
    # accept a numeric subject_batch id in payload; resolve to object in validate to avoid import-time cycles
    subject_batch_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    staff_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    venue_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    venue = serializers.SerializerMethodField(read_only=True)
    staff = serializers.SerializerMethodField(read_only=True)
    effective_staff = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TimetableAssignment
        fields = ('id', 'period', 'period_id', 'day', 'section', 'section_id', 'staff', 'effective_staff', 'staff_id', 'curriculum_row', 'subject_batch', 'subject_batch_id', 'subject_text', 'venue', 'venue_id')
        read_only_fields = ('period', 'section')
    
    def get_venue(self, obj):
        try:
            v = getattr(obj, 'venue', None)
            if not v:
                return None
            return {
                'id': v.id,
                'name': getattr(v, 'name', None),
                'code': getattr(v, 'code', None),
                'venue_type': getattr(v, 'venue_type', None),
                'capacity': getattr(v, 'capacity', 0),
            }
        except Exception:
            return None

    def get_staff(self, obj):
        """Return the actual staff who teaches the subject.
        
        Priority:
        1. Subject batch staff
        2. Timetable assignment staff (explicitly chosen by advisor/creator)
        3. Subject teaching assignment staff (fallback from curriculum_row)
        """
        try:
            # 1. Subject batch staff
            if obj.subject_batch and obj.subject_batch.staff:
                sp = obj.subject_batch.staff
                u = getattr(sp, 'user', None)
                return {
                    'id': sp.id,
                    'staff_id': getattr(sp, 'staff_id', None),
                    'name': _get_staff_name(u, sp),
                    'first_name': u.first_name if u else '',
                    'last_name': u.last_name if u else '',
                    'username': u.username if u else '',
                    'user': getattr(sp, 'user_id', None)
                }
            
            # 2. Timetable assignment staff (explicitly chosen)
            if obj.staff:
                sp = obj.staff
                u = getattr(sp, 'user', None)
                return {
                    'id': sp.id,
                    'staff_id': getattr(sp, 'staff_id', None),
                    'name': _get_staff_name(u, sp),
                    'first_name': u.first_name if u else '',
                    'last_name': u.last_name if u else '',
                    'username': u.username if u else '',
                    'user': getattr(sp, 'user_id', None)
                }
            
            # 3. Subject teaching assignment staff (fallback from curriculum_row)
            if obj.curriculum_row and obj.section:
                sps = get_teaching_assignments_for_section_and_curriculum(obj.section, obj.curriculum_row)
                if sps:
                    if len(sps) == 1:
                        sp = sps[0]
                        u = getattr(sp, 'user', None)
                        return {
                            'id': sp.id,
                            'staff_id': getattr(sp, 'staff_id', None),
                            'name': _get_staff_name(u, sp),
                            'first_name': u.first_name if u else '',
                            'last_name': u.last_name if u else '',
                            'username': u.username if u else '',
                            'user': getattr(sp, 'user_id', None)
                        }
                    else:
                        # Combine details for multi-faculty
                        names = []
                        usernames = []
                        staff_ids = []
                        for sp in sps:
                            u = getattr(sp, 'user', None)
                            full_name = _get_staff_name(u, sp)
                            if full_name:
                                names.append(full_name)
                            usernames.append(u.username if u else '')
                            staff_ids.append(getattr(sp, 'staff_id', ''))
                        
                        combined_name = ", ".join(sorted(names))
                        combined_username = ", ".join(sorted(filter(None, usernames)))
                        combined_staff_id = ", ".join(sorted(filter(None, staff_ids)))
                        
                        return {
                            'id': None,  # None indicates multi-faculty fallback
                            'staff_id': combined_staff_id,
                            'name': combined_name,
                            'first_name': '',
                            'last_name': '',
                            'username': combined_username,
                            'user': None
                        }
            return None
        except Exception:
            return None
    
    def get_effective_staff(self, obj):
        """Return the actual staff who should mark attendance.
        
        Priority:
        1. Subject batch staff (if batch-specific assignment)
        2. Timetable assignment staff (explicitly chosen)
        3. Subject teaching assignment staff (fallback from curriculum_row)
        """
        try:
            # If there's a subject_batch with assigned staff, use that
            if obj.subject_batch and obj.subject_batch.staff:
                return obj.subject_batch.staff.id
            
            # Prioritize explicit timetable assignment staff
            if obj.staff:
                return obj.staff.id
            
            # If there's a curriculum_row, get the actual teaching staff from TeachingAssignment
            if obj.curriculum_row and obj.section:
                sps = get_teaching_assignments_for_section_and_curriculum(obj.section, obj.curriculum_row)
                if sps:
                    return sps[0].id
            
            return None
        except Exception:
            return None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # nothing needed at init; we'll resolve subject_batch_id to object in validate
        pass

    def validate(self, attrs):
        # ensure curriculum_row matches section.semester when provided
        period = attrs.get('period')
        section = attrs.get('section')
        # if section not provided in attrs, try to resolve from initial_data
        if not section and 'section_id' in self.initial_data:
            try:
                from academics.models import Section
                section = Section.objects.filter(pk=int(self.initial_data.get('section_id'))).first()
                attrs['section'] = section
            except Exception:
                section = None
        
        # resolve subject_batch if provided as id in initial_data (handling null/empty)
        if 'subject_batch_id' in self.initial_data:
            val = self.initial_data.get('subject_batch_id')
            if val is None or val == '' or val == 'null':
                attrs['subject_batch'] = None
                subject_batch = None
            else:
                try:
                    from academics.models import StudentSubjectBatch
                    sb = StudentSubjectBatch.objects.filter(pk=int(val)).first()
                    attrs['subject_batch'] = sb
                    subject_batch = sb
                except Exception:
                    subject_batch = attrs.get('subject_batch')
        else:
            subject_batch = attrs.get('subject_batch')

        # resolve staff if provided as id in initial_data (handling null/empty)
        if 'staff_id' in self.initial_data:
            val = self.initial_data.get('staff_id')
            if val is None or val == '' or val == 'null':
                attrs['staff'] = None
            else:
                try:
                    from academics.models import StaffProfile
                    staff = StaffProfile.objects.filter(pk=int(val)).first()
                    attrs['staff'] = staff
                except Exception:
                    pass

        # resolve venue if provided as id in initial_data (handling null/empty)
        venue = None
        if 'venue_id' in self.initial_data:
            val = self.initial_data.get('venue_id')
            if val is None or val == '' or val == 'null':
                attrs['venue'] = None
                venue = None
            else:
                try:
                    from timetable.models import Venue
                    v = Venue.objects.filter(pk=int(val), is_active=True).first()
                    attrs['venue'] = v
                    venue = v
                except Exception:
                    venue = None
        else:
            venue = attrs.get('venue')

        # A physical venue (lab/hall) can only host ONE class at a time. Two different
        # sections may not use the same venue on the same day+period simultaneously.
        attrs_day = attrs.get('day')
        if venue and period and attrs_day and section:
            from timetable.models import TimetableAssignment as _TTA
            qs = _TTA.objects.filter(
                venue=venue,
                day=attrs_day,
                period=period,
            ).exclude(section__isnull=True).exclude(section=section)
            if getattr(self, 'instance', None) is not None:
                qs = qs.exclude(pk=self.instance.pk)
            conflict = qs.first()
            if conflict:
                other_section = getattr(conflict, 'section', None)
                other_name = getattr(other_section, 'name', None)
                raise serializers.ValidationError(
                    f"Venue '{venue.name}' is already booked for {conflict.get_day_display()} period "
                    f"{getattr(conflict.period, 'index', '?')} by section {other_name or getattr(conflict, 'section_id', None)}. "
                    f"A venue can only host one section at a time."
                )


        curriculum_row = attrs.get('curriculum_row')
        if curriculum_row and section:
            try:
                row_sem = getattr(curriculum_row, 'semester', None)
                sec_sem = getattr(section, 'semester', None)
                # both expose .number when present
                if row_sem and sec_sem and getattr(row_sem, 'number', None) != getattr(sec_sem, 'number', None):
                    raise serializers.ValidationError('Curriculum row semester does not match section semester')
            except Exception:
                pass
        # if a subject_batch is provided, ensure it belongs to the selected curriculum_row
        if subject_batch and curriculum_row:
            try:
                if getattr(subject_batch, 'curriculum_row_id', None) and getattr(subject_batch, 'curriculum_row_id') != getattr(curriculum_row, 'id', None):
                    raise serializers.ValidationError('Selected subject batch does not belong to the chosen curriculum row')
            except Exception:
                pass

        # if a subject_batch is provided, ensure it belongs to this section (when batch.section is set)
        if subject_batch and section:
            try:
                sb_section_id = getattr(subject_batch, 'section_id', None)
                if sb_section_id is not None and int(sb_section_id) != int(getattr(section, 'id', 0) or 0):
                    raise serializers.ValidationError('Selected subject batch does not belong to the chosen section')
            except serializers.ValidationError:
                raise
            except Exception:
                pass
        return attrs

    def create(self, validated_data):
        # resolve section if provided as id in initial_data
        try:
            from academics.models import Section
            if 'section' not in validated_data and 'section_id' in self.initial_data:
                sid = int(self.initial_data.get('section_id'))
                validated_data['section'] = Section.objects.get(pk=sid)
        except Exception:
            pass
        return super().create(validated_data)


class SpecialTimetableEntrySerializer(serializers.ModelSerializer):
    timetable_id = serializers.PrimaryKeyRelatedField(queryset=SpecialTimetable.objects.all(), source='timetable', write_only=True)
    period_id = serializers.PrimaryKeyRelatedField(queryset=TimetableSlot.objects.all(), source='period', write_only=True)
    # accept numeric subject_batch id from payload
    subject_batch_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    staff_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    staff = serializers.SerializerMethodField(read_only=True)
    effective_staff = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SpecialTimetableEntry
        # expose only id-based writable fields to avoid duplicate source mapping
        fields = ('id', 'timetable_id', 'date', 'period_id', 'staff', 'effective_staff', 'staff_id', 'curriculum_row', 'subject_batch', 'subject_batch_id', 'subject_text', 'is_active')
    
    def get_staff(self, obj):
        """Return the actual staff who teaches the subject.
        
        Priority:
        1. Subject batch staff
        2. Special timetable entry staff (explicitly chosen by advisor/creator)
        3. Subject teaching assignment staff (fallback from curriculum_row)
        """
        try:
            sp = None
            if obj.subject_batch and obj.subject_batch.staff:
                sp = obj.subject_batch.staff
            elif obj.staff:
                sp = obj.staff
            elif obj.curriculum_row and obj.timetable and obj.timetable.section:
                try:
                    from academics.models import TeachingAssignment
                    ta = TeachingAssignment.objects.filter(
                        section=obj.timetable.section,
                        curriculum_row=obj.curriculum_row,
                        is_active=True
                    ).select_related('staff__user').first()
                    if ta and ta.staff:
                        sp = ta.staff
                except Exception:
                    pass
                
            if sp:
                u = getattr(sp, 'user', None)
                return {
                    'id': sp.id,
                    'staff_id': getattr(sp, 'staff_id', None),
                    'name': u.get_full_name() if u else getattr(sp, 'staff_id', ''),
                    'first_name': u.first_name if u else '',
                    'last_name': u.last_name if u else '',
                    'username': u.username if u else '',
                    'user': getattr(sp, 'user_id', None)
                }
            return None
        except Exception:
            return None

    def validate(self, attrs):
        # Keep existing behavior from base, then apply subject-batch/section safety.
        attrs = super().validate(attrs)

        # resolve staff if provided as id in initial_data (handling null/empty)
        if 'staff_id' in self.initial_data:
            val = self.initial_data.get('staff_id')
            if val is None or val == '' or val == 'null':
                attrs['staff'] = None
            else:
                try:
                    from academics.models import StaffProfile
                    staff = StaffProfile.objects.filter(pk=int(val)).first()
                    attrs['staff'] = staff
                except Exception:
                    pass

        # resolve subject_batch if provided as id in initial_data (handling null/empty)
        if 'subject_batch_id' in self.initial_data:
            val = self.initial_data.get('subject_batch_id')
            if val is None or val == '' or val == 'null':
                attrs['subject_batch'] = None
                subject_batch = None
            else:
                try:
                    from academics.models import StudentSubjectBatch
                    sb = StudentSubjectBatch.objects.filter(pk=int(val)).first()
                    attrs['subject_batch'] = sb
                    subject_batch = sb
                except Exception:
                    subject_batch = attrs.get('subject_batch')
        else:
            subject_batch = attrs.get('subject_batch')

        try:
            timetable = attrs.get('timetable')
            section = getattr(timetable, 'section', None) if timetable else None
            if subject_batch and section:
                sb_section_id = getattr(subject_batch, 'section_id', None)
                if sb_section_id is not None and int(sb_section_id) != int(getattr(section, 'id', 0) or 0):
                    raise serializers.ValidationError('Selected subject batch does not belong to this section')
        except serializers.ValidationError:
            raise
        except Exception:
            pass
        return attrs

    def get_effective_staff(self, obj):
        """Return the actual staff who should mark attendance.
        
        Priority:
        1. Subject batch staff (if batch-specific assignment)
        2. Special timetable entry staff (explicitly chosen)
        3. Subject teaching assignment staff (fallback from curriculum_row)
        """
        try:
            # If there's a subject_batch with assigned staff, use that
            if obj.subject_batch and obj.subject_batch.staff:
                return obj.subject_batch.staff.id
            
            # Prioritize explicit special timetable entry staff
            if obj.staff:
                return obj.staff.id
            
            # If there's a curriculum_row, get the actual teaching staff from TeachingAssignment
            if obj.curriculum_row and obj.timetable and obj.timetable.section:
                try:
                    from academics.models import TeachingAssignment
                    ta = TeachingAssignment.objects.filter(
                        section=obj.timetable.section,
                        curriculum_row=obj.curriculum_row,
                        is_active=True
                    ).select_related('staff').first()
                    if ta and ta.staff:
                        return ta.staff.id
                except Exception:
                    pass
            
            return None
        except Exception:
            return None


class SpecialTimetableSerializer(serializers.ModelSerializer):
    entries = SpecialTimetableEntrySerializer(many=True, read_only=True)

    class Meta:
        model = SpecialTimetable
        fields = ('id', 'name', 'section', 'created_by', 'is_active', 'created_at', 'entries')


class PeriodSwapRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.SerializerMethodField()
    requested_to_name = serializers.SerializerMethodField()
    section_name = serializers.SerializerMethodField()
    from_period_label = serializers.SerializerMethodField()
    to_period_label = serializers.SerializerMethodField()
    
    class Meta:
        model = PeriodSwapRequest
        fields = (
            'id', 'section', 'section_name', 'requested_by', 'requested_by_name',
            'requested_to', 'requested_to_name', 'from_date', 'from_period',
            'from_period_label', 'from_subject_text', 'to_date', 'to_period',
            'to_period_label', 'to_subject_text', 'status', 'reason',
            'response_message', 'created_at', 'updated_at', 'responded_at'
        )
        read_only_fields = ('created_at', 'updated_at', 'responded_at')
    
    def get_requested_by_name(self, obj):
        try:
            return obj.requested_by.user.get_full_name() if obj.requested_by.user else obj.requested_by.staff_id
        except:
            return 'Unknown'
    
    def get_requested_to_name(self, obj):
        try:
            return obj.requested_to.user.get_full_name() if obj.requested_to.user else obj.requested_to.staff_id
        except:
            return 'Unknown'
    
    def get_section_name(self, obj):
        try:
            return obj.section.name
        except:
            return 'Unknown'
    
    def get_from_period_label(self, obj):
        try:
            return obj.from_period.label or f"Period {obj.from_period.index}"
        except:
            return 'Unknown'
    
    def get_to_period_label(self, obj):
        try:
            return obj.to_period.label or f"Period {obj.to_period.index}"
        except:
            return 'Unknown'
