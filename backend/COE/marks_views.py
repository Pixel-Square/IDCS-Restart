"""
Row-based marks storage API for COE mark entry.
Replaces the single JSON blob pattern with individual rows per dummy.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CoeStudentMarks


class CoeStudentMarksView(APIView):
    """
    Row-based marks storage endpoints.
    
    GET  ?dummy=<dummy_number>    → Single entry: { dummy_number, marks, qp_type }
    GET  (no params)              → All entries: { entries: [...] }
    POST { dummy_number, marks, qp_type }  → { saved: true }
    POST { entries: [...] }       → Bulk save
    DELETE ?dummy=<dummy_number>  → { deleted: true }
    """

    def get(self, request):
        dummy = (request.query_params.get('dummy') or '').strip()
        
        if dummy:
            # Get single entry
            try:
                obj = CoeStudentMarks.objects.get(dummy_number=dummy)
                return Response({
                    'dummy_number': obj.dummy_number,
                    'marks': obj.marks,
                    'qp_type': obj.qp_type,
                })
            except CoeStudentMarks.DoesNotExist:
                return Response({
                    'dummy_number': dummy,
                    'marks': None,
                    'qp_type': None,
                })
        else:
            # Get all entries
            entries = CoeStudentMarks.objects.all().values(
                'dummy_number', 'marks', 'qp_type'
            )
            return Response({'entries': list(entries)})

    def post(self, request):
        if not getattr(request.user, 'is_authenticated', False):
            return Response(
                {'detail': 'Authentication required.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Check if bulk save
        entries = request.data.get('entries')
        if entries and isinstance(entries, list):
            # Bulk save
            saved_count = 0
            for entry in entries:
                dummy = str(entry.get('dummy_number') or '').strip()
                if not dummy:
                    continue
                marks = entry.get('marks', {})
                qp_type = str(entry.get('qp_type') or 'QP1').strip()
                CoeStudentMarks.objects.update_or_create(
                    dummy_number=dummy,
                    defaults={'marks': marks, 'qp_type': qp_type},
                )
                saved_count += 1
            return Response({'saved': True, 'count': saved_count}, status=status.HTTP_200_OK)

        # Single save
        dummy = str(request.data.get('dummy_number') or '').strip()
        if not dummy:
            return Response(
                {'detail': 'dummy_number is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        marks = request.data.get('marks', {})
        qp_type = str(request.data.get('qp_type') or 'QP1').strip()

        CoeStudentMarks.objects.update_or_create(
            dummy_number=dummy,
            defaults={'marks': marks, 'qp_type': qp_type},
        )
        return Response({'saved': True}, status=status.HTTP_200_OK)

    def delete(self, request):
        if not getattr(request.user, 'is_authenticated', False):
            return Response(
                {'detail': 'Authentication required.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        dummy = (request.query_params.get('dummy') or '').strip()
        if not dummy:
            return Response(
                {'detail': 'dummy query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        CoeStudentMarks.objects.filter(dummy_number=dummy).delete()
        return Response({'deleted': True}, status=status.HTTP_200_OK)


class CoeStudentMarksBulkView(APIView):
    """
    Bulk operations for marks.
    
    GET  ?dummies=D1,D2,D3  → { entries: [...] } for specific dummies
    POST { dummies: [...] } → { entries: [...] } for specific dummies
    """

    def get(self, request):
        dummies_param = request.query_params.get('dummies', '')
        dummies = [d.strip() for d in dummies_param.split(',') if d.strip()]
        
        if dummies:
            entries = CoeStudentMarks.objects.filter(
                dummy_number__in=dummies
            ).values('dummy_number', 'marks', 'qp_type')
        else:
            entries = CoeStudentMarks.objects.all().values(
                'dummy_number', 'marks', 'qp_type'
            )
        
        return Response({'entries': list(entries)})

    def post(self, request):
        dummies = request.data.get('dummies', [])
        if not dummies or not isinstance(dummies, list):
            return Response(
                {'detail': 'dummies array is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        entries = CoeStudentMarks.objects.filter(
            dummy_number__in=dummies
        ).values('dummy_number', 'marks', 'qp_type')
        
        return Response({'entries': list(entries)})
