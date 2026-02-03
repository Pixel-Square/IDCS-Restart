from rest_framework import serializers
from .models import TimetableTemplate, TimetableSlot, TimetableAssignment


class PeriodDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimetableSlot
        fields = ('id', 'template', 'index', 'start_time', 'end_time', 'is_break', 'is_lunch', 'label')


class TimetableTemplateSerializer(serializers.ModelSerializer):
    periods = PeriodDefinitionSerializer(many=True, read_only=True)

    class Meta:
        model = TimetableTemplate
        fields = ('id', 'name', 'description', 'created_by', 'is_public', 'is_active', 'parity', 'created_at', 'periods')


class TimetableAssignmentSerializer(serializers.ModelSerializer):
    period_id = serializers.PrimaryKeyRelatedField(queryset=TimetableSlot.objects.all(), source='period', write_only=True)
    day = serializers.IntegerField(write_only=True)

    class Meta:
        model = TimetableAssignment
        fields = ('id', 'period', 'period_id', 'day', 'section', 'section_id', 'staff', 'curriculum_row', 'subject_text')
        read_only_fields = ('period', 'section')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

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
