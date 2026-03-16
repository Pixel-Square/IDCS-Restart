from rest_framework import serializers
from .models import DimStudent, DimSubject, DimTeachingAssignment, FactMark


class DimStudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DimStudent
        fields = '__all__'


class DimSubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = DimSubject
        fields = '__all__'


class DimTeachingAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DimTeachingAssignment
        fields = '__all__'


class FactMarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = FactMark
        fields = '__all__'
