from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .permissions import IsSuperAdmin
from .registry import section_registry
from .models import BackupSnapshot, ConfigExport

class BackupsLandingAPIView(APIView):
    """
    API view for the Backups & Logs landing page.
    Returns the list of registered backup sections (read-only)
    to visually confirm the registry is wired correctly.
    """
    # Restrict access to everything under backups_logs to Super Admin only.
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        sections = section_registry.get_all_sections()
        data = []
        for s in sections:
            try:
                supports_config = bool(s.get_config_queryset_map())
            except NotImplementedError:
                supports_config = False
            
            # Fetch latest snapshot
            latest_snap = BackupSnapshot.objects.filter(section_id=s.section_id, status='success').order_by('-created_at').first()
            snap_data = None
            if latest_snap:
                actor_name = "System"
                if latest_snap.created_by:
                    actor_name = f"{latest_snap.created_by.first_name} {latest_snap.created_by.last_name}".strip() or latest_snap.created_by.username
                snap_data = {
                    "timestamp": latest_snap.created_at,
                    "status": latest_snap.status,
                    "actor_name": actor_name
                }
                
            # Fetch latest config export
            latest_exp = ConfigExport.objects.filter(section_id=s.section_id, status='success').order_by('-created_at').first()
            exp_data = None
            if latest_exp:
                actor_name = "System"
                if latest_exp.created_by:
                    actor_name = f"{latest_exp.created_by.first_name} {latest_exp.created_by.last_name}".strip() or latest_exp.created_by.username
                elif latest_exp.export_type == 'semester_archive':
                    actor_name = "System (Semester End Auto-Archive)"
                exp_data = {
                    "timestamp": latest_exp.created_at,
                    "status": latest_exp.status,
                    "actor_name": actor_name,
                    "export_type": latest_exp.export_type
                }
                
            data.append({
                "section_id": s.section_id,
                "display_name": s.display_name,
                "supports_config": supports_config,
                "latest_snapshot": snap_data,
                "latest_config_export": exp_data
            })
            
        return Response({"sections": data})

class TriggerSnapshotAPIView(APIView):
    """
    API view to trigger a raw snapshot for a given section (async via Celery).
    Returns immediately with a task_id for polling.
    """
    permission_classes = [IsSuperAdmin]
    
    def post(self, request, section_id):
        from .tasks import task_raw_snapshot
        section = section_registry.get_section(section_id)
        if not section:
            return Response({"error": f"Section '{section_id}' is not registered."}, status=status.HTTP_400_BAD_REQUEST)
        result = task_raw_snapshot.delay(section_id, user_id=request.user.id)
        return Response({
            "task_id": result.id,
            "status": "pending",
            "message": f"Raw snapshot for '{section_id}' queued."
        }, status=status.HTTP_202_ACCEPTED)

class ListSnapshotsAPIView(APIView):
    """
    API view to list all raw snapshots for a given section.
    """
    permission_classes = [IsSuperAdmin]
    
    def get(self, request, section_id):
        snapshots = BackupSnapshot.objects.filter(section_id=section_id).order_by('-created_at')
        data = [
            {
                "id": str(snap.id),
                "status": snap.status,
                "timestamp": snap.created_at,
                "file_reference": snap.file_reference
            }
            for snap in snapshots
        ]
        return Response(data)


class TriggerConfigExportAPIView(APIView):
    permission_classes = [IsSuperAdmin]
    
    def post(self, request, section_id):
        from .tasks import task_config_export
        section = section_registry.get_section(section_id)
        if not section:
            return Response({"error": f"Section '{section_id}' is not registered."}, status=status.HTTP_400_BAD_REQUEST)
        result = task_config_export.delay(section_id, user_id=request.user.id)
        return Response({
            "task_id": result.id,
            "status": "pending",
            "message": f"Config export for '{section_id}' queued."
        }, status=status.HTTP_202_ACCEPTED)

class ListConfigExportsAPIView(APIView):
    permission_classes = [IsSuperAdmin]
    
    def get(self, request, section_id):
        from .models import ConfigExport
        
        qs = ConfigExport.objects.filter(section_id=section_id)
        
        export_type = request.query_params.get('export_type')
        if export_type:
            qs = qs.filter(export_type=export_type)
            
        exports = qs.order_by('-created_at')
        data = [
            {
                "id": str(exp.id),
                "status": exp.status,
                "timestamp": exp.created_at,
                "file_reference": exp.file_reference,
                "export_type": exp.export_type,
                "academic_year": exp.academic_year,
                "semester_label": exp.semester_label
            }
            for exp in exports
        ]
        return Response(data)

class PreviewConfigImportAPIView(APIView):
    permission_classes = [IsSuperAdmin]
    
    def post(self, request):
        from .services import preview_config_import
        export_id = request.data.get('export_id')
        target_section_id = request.data.get('target_section_id')
        
        if not export_id or not target_section_id:
            return Response({"error": "export_id and target_section_id are required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            diff = preview_config_import(export_id, target_section_id, user=request.user)
            return Response({"diff": diff})
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class RestoreSnapshotAPIView(APIView):
    permission_classes = [IsSuperAdmin]
    
    def post(self, request, snapshot_id):
        from .tasks import task_restore_raw_snapshot
        # Validate snapshot exists before queuing
        try:
            snapshot = BackupSnapshot.objects.get(id=snapshot_id)
        except BackupSnapshot.DoesNotExist:
            return Response({"error": f"Snapshot '{snapshot_id}' not found."}, status=status.HTTP_404_NOT_FOUND)
        
        result = task_restore_raw_snapshot.delay(str(snapshot.id), user_id=request.user.id)
        # Store task_id on the snapshot for polling
        snapshot.task_id = result.id
        snapshot.save(update_fields=['task_id'])
        return Response({
            "task_id": result.id,
            "snapshot_id": str(snapshot.id),
            "status": "pending",
            "message": "Restore queued. A safety snapshot will be taken first."
        }, status=status.HTTP_202_ACCEPTED)


class ConfirmConfigImportAPIView(APIView):
    permission_classes = [IsSuperAdmin]
    
    def post(self, request, export_id):
        from .tasks import task_config_import
        target_section_id = request.data.get('target_section_id')
        
        if not target_section_id:
            return Response({"error": "target_section_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate export exists before queuing
        try:
            export = ConfigExport.objects.get(id=export_id)
        except ConfigExport.DoesNotExist:
            return Response({"error": f"Export '{export_id}' not found."}, status=status.HTTP_404_NOT_FOUND)

        result = task_config_import.delay(str(export.id), target_section_id, user_id=request.user.id)
        export.task_id = result.id
        export.save(update_fields=['task_id'])
        return Response({
            "task_id": result.id,
            "export_id": str(export.id),
            "status": "pending",
            "message": "Config import queued. A safety snapshot will be taken first."
        }, status=status.HTTP_202_ACCEPTED)


class TaskStatusAPIView(APIView):
    """
    Lightweight status-check endpoint for Celery tasks.
    Returns the current state and result/error detail for any backups_logs task.
    Frontend polls this after triggering any async operation.
    """
    permission_classes = [IsSuperAdmin]
    
    def get(self, request, task_id):
        from celery.result import AsyncResult
        from .models import ActivityLog
        
        result = AsyncResult(task_id)
        
        # Map Celery states to our UI-friendly states
        state_map = {
            'PENDING': 'pending',
            'STARTED': 'running',
            'SUCCESS': 'success',
            'FAILURE': 'failed',
            'RETRY': 'running',
            'REVOKED': 'failed',
        }
        
        ui_status = state_map.get(result.state, result.state.lower())
        
        detail = ''
        if result.state == 'FAILURE':
            # Surface the exception message
            detail = str(result.result) if result.result else 'Unknown error'
        elif result.state == 'SUCCESS':
            detail = str(result.result) if result.result else ''
            
        return Response({
            "task_id": task_id,
            "status": ui_status,
            "celery_state": result.state,
            "detail": detail,
        })

class TriggerSemesterEndAPIView(APIView):
    """
    Manual trigger for Semester End Automation (Fallback).
    Finds the latest AcademicYear and queues the semester archive export for 'feedback'.
    """
    permission_classes = [IsSuperAdmin]
    
    def post(self, request):
        from academics.models import AcademicYear
        from .tasks import task_config_export
        
        # Pick the most recently created AcademicYear (whether active or deactivated)
        latest_year = AcademicYear.objects.order_by('-id').first()
        if not latest_year:
            return Response({"error": "No AcademicYear found."}, status=status.HTTP_400_BAD_REQUEST)
            
        result = task_config_export.delay(
            'feedback', 
            user_id=request.user.id,
            export_type='semester_archive',
            academic_year=latest_year.name,
            semester_label=latest_year.parity
        )
        return Response({
            "task_id": result.id,
            "status": "pending",
            "message": f"Semester End Automation queued for {latest_year.name} ({latest_year.parity})."
        }, status=status.HTTP_202_ACCEPTED)

from rest_framework.pagination import PageNumberPagination

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

class ActivityLogListAPIView(APIView):
    permission_classes = [IsSuperAdmin]
    
    def get(self, request):
        from .models import ActivityLog
        from django.db.models import Q
        
        queryset = ActivityLog.objects.select_related('actor', 'related_export').all()
        
        # Filtering
        section_id = request.query_params.get('section_id')
        if section_id:
            queryset = queryset.filter(section_id=section_id)
            
        action_type = request.query_params.get('action_type')
        if action_type:
            queryset = queryset.filter(action_type=action_type)
            
        success_str = request.query_params.get('success')
        if success_str:
            is_success = success_str.lower() == 'true'
            queryset = queryset.filter(success=is_success)
            
        actor_search = request.query_params.get('actor')
        if actor_search:
            # Try to search by email, first_name, last_name or id
            queryset = queryset.filter(
                Q(actor__email__icontains=actor_search) |
                Q(actor__first_name__icontains=actor_search) |
                Q(actor__last_name__icontains=actor_search) |
                Q(actor__id__icontains=actor_search)
            )
            
        date_from = request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(timestamp__gte=date_from)
            
        date_to = request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(timestamp__lte=date_to)
            
        # Sorting (default -timestamp)
        queryset = queryset.order_by('-timestamp')
        
        # Pagination
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        
        # Serialize enriched data
        data = []
        action_type_dict = dict(ActivityLog.ACTION_TYPE_CHOICES)
        
        for log in (page if page is not None else queryset):
            # Resolve section display name
            section = section_registry.get_section(log.section_id)
            section_display = section.display_name if section else log.section_id
            
            # Resolve actor name
            actor_name = "System/Unknown"
            if log.actor:
                full_name = f"{log.actor.first_name} {log.actor.last_name}".strip()
                if not full_name:
                    full_name = "User"
                actor_name = f"{full_name} ({log.actor.email})"
            elif log.related_export_id and getattr(log.related_export, 'export_type', '') == 'semester_archive':
                actor_name = "System (Semester End Auto-Archive)"
                
            data.append({
                "id": str(log.id),
                "action_type": log.action_type,
                "action_type_display": action_type_dict.get(log.action_type, log.action_type),
                "section_id": log.section_id,
                "section_display_name": section_display,
                "actor_name": actor_name,
                "timestamp": log.timestamp,
                "success": log.success,
                "detail": log.detail,
                "related_snapshot_id": str(log.related_snapshot_id) if log.related_snapshot_id else None,
                "related_export_id": str(log.related_export_id) if log.related_export_id else None
            })
            
        if page is not None:
            return paginator.get_paginated_response(data)
            
        return Response(data)
