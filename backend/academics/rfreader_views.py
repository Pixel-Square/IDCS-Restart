from rest_framework import generics
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import RFReaderGate, RFReaderStudent, RFReaderScan
from .permissions import IsIQAC
from .rfreader_serializers import RFReaderGateSerializer, RFReaderStudentSerializer, RFReaderScanSerializer


class RFReaderGateListCreateView(generics.ListCreateAPIView):
    queryset = RFReaderGate.objects.all()
    serializer_class = RFReaderGateSerializer
    permission_classes = [IsAuthenticated, IsIQAC]


class RFReaderStudentListCreateView(generics.ListCreateAPIView):
    queryset = RFReaderStudent.objects.all()
    serializer_class = RFReaderStudentSerializer
    permission_classes = [IsAuthenticated, IsIQAC]


class RFReaderLastScanView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, IsIQAC]

    def get(self, request, *args, **kwargs):
        scan = RFReaderScan.objects.select_related('gate', 'student').order_by('-scanned_at').first()
        if not scan:
            return Response({
                'scanned_at': None,
                'uid': None,
                'roll_no': None,
                'name': None,
                'impres_code': None,
                'gate': None,
            })

        data = RFReaderScanSerializer(scan).data
        # Flatten a few fields for the UI convenience
        student = data.get('student') or {}
        return Response({
            'scanned_at': data.get('scanned_at'),
            'uid': data.get('uid'),
            'roll_no': student.get('roll_no'),
            'name': student.get('name'),
            'impres_code': student.get('impres_code'),
            'gate': data.get('gate'),
        })
