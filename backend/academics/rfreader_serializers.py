from rest_framework import serializers
from .models import RFReaderGate, RFReaderStudent, RFReaderScan


class RFReaderGateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RFReaderGate
        fields = [
            'id',
            'name',
            'description',
            'is_active',
            'created_at',
            'updated_at',
        ]


class RFReaderStudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RFReaderStudent
        fields = [
            'id',
            'roll_no',
            'name',
            'impres_code',
            'rf_uid',
            'is_active',
            'created_at',
            'updated_at',
        ]


class RFReaderScanSerializer(serializers.ModelSerializer):
    gate = RFReaderGateSerializer(read_only=True)
    student = RFReaderStudentSerializer(read_only=True)

    class Meta:
        model = RFReaderScan
        fields = [
            'id',
            'gate',
            'uid',
            'student',
            'raw_line',
            'source',
            'scanned_at',
        ]
