import json
import logging
from itertools import chain
from django.utils import timezone
from django.core import serializers
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from .models import BackupSnapshot, ActivityLog, ConfigExport
from .registry import section_registry

logger = logging.getLogger(__name__)

def perform_raw_snapshot(section_id, user=None):
    """
    Creates a raw snapshot of all data models registered for the given section_id.
    """
    section = section_registry.get_section(section_id)
    if not section:
        raise ValueError(f"Section {section_id} is not registered.")
    
    # 1. Create a pending BackupSnapshot
    snapshot = BackupSnapshot.objects.create(
        section_id=section_id,
        created_by=user,
        status='pending',
        schema_version='1.0'
    )
    
    # 2. ActivityLog entry for initiation
    activity = ActivityLog.objects.create(
        action_type='backup',
        section_id=section_id,
        actor=user,
        success=False,  # Will update on success
        related_snapshot=snapshot
    )
    
    try:
        # Retrieve the raw querysets from the section
        qs_map = section.get_raw_queryset_map()
        
        # Combine all objects from querysets
        # This will evaluate the querysets and chain them together
        all_objects = chain(*[qs for qs in qs_map.values()])
        
        # 3. Serialize to JSON
        # 'json' serializer is built into Django and creates a list of dicts.
        json_data = serializers.serialize('json', all_objects)
        
        # 4. Save to default_storage
        timestamp_str = timezone.now().strftime('%Y%m%d_%H%M%S')
        file_path = f"backups/{section_id}/{timestamp_str}.json"
        
        saved_path = default_storage.save(file_path, ContentFile(json_data.encode('utf-8')))
        
        # 5. Update snapshot status to success
        snapshot.status = 'success'
        snapshot.file_reference = saved_path
        snapshot.save()
        
        # 6. Update activity log to success
        activity.success = True
        activity.save()
        
        return snapshot
        
    except Exception as e:
        logger.exception(f"Failed to create raw snapshot for section {section_id}")
        # Mark as failed
        snapshot.status = 'failed'
        snapshot.notes = str(e)
        snapshot.save()
        
        activity.detail = str(e)
        activity.save()
        
        raise e


def perform_config_export(section_id, user=None, export_type='manual', academic_year=None, semester_label=None):
    """
    Creates a configuration export for the given section_id.
    """
    section = section_registry.get_section(section_id)
    if not section:
        raise ValueError(f"Section {section_id} is not registered.")
    
    export = ConfigExport.objects.create(
        section_id=section_id,
        created_by=user,
        export_type=export_type,
        academic_year=academic_year,
        semester_label=semester_label,
        status='pending',
        schema_version='1.0'
    )
    
    activity = ActivityLog.objects.create(
        action_type='config_export',
        section_id=section_id,
        actor=user,
        success=False,
        related_export=export
    )
    
    try:
        qs_map = section.get_config_queryset_map()
        all_objects = chain(*[qs for qs in qs_map.values()])
        
        json_data = serializers.serialize('json', all_objects)
        
        timestamp_str = timezone.now().strftime('%Y%m%d_%H%M%S')
        file_path = f"backups/config/{section_id}/{timestamp_str}.json"
        
        saved_path = default_storage.save(file_path, ContentFile(json_data.encode('utf-8')))
        
        export.status = 'success'
        export.file_reference = saved_path
        export.save()
        
        activity.success = True
        activity.save()
        
        return export
        
    except Exception as e:
        logger.exception(f"Failed to create config export for section {section_id}")
        export.status = 'failed'
        export.save()
        
        activity.detail = str(e)
        activity.save()
        raise e


def preview_config_import(export_id, target_section_id, user=None):
    """
    Generates a diff of what would happen if the config export were imported 
    into the target section. No database changes are applied.
    """
    export = ConfigExport.objects.get(id=export_id)
    section = section_registry.get_section(target_section_id)
    if not section:
        raise ValueError(f"Section {target_section_id} is not registered.")
    
    try:
        file = default_storage.open(export.file_reference, 'r')
        json_data = file.read()
        file.close()
    except Exception as e:
        raise ValueError(f"Could not read export file: {e}")
        
    # Read live objects to compare against
    live_qs_map = section.get_config_queryset_map()
    
    diff = {
        "added": [],
        "updated": [],
        "removed": []
    }
    
    try:
        deserialized_objects = list(serializers.deserialize('json', json_data))
    except Exception as e:
        raise ValueError(f"Invalid JSON data in export file: {e}")
    
    imported_pks_by_model = {}
    
    for des_obj in deserialized_objects:
        obj = des_obj.object
        model_class = obj.__class__
        model_name = model_class.__name__
        
        if model_class not in imported_pks_by_model:
            imported_pks_by_model[model_class] = set()
            
        imported_pks_by_model[model_class].add(str(obj.pk))
        
        live_qs = live_qs_map.get(model_class)
        if live_qs is None:
            # Model not part of current config mapping
            diff["added"].append(f"{model_name} PK={obj.pk} (Model not currently active in section config)")
            continue
            
        live_obj = live_qs.filter(pk=obj.pk).first()
        if not live_obj:
            diff["added"].append(f"{model_name} PK={obj.pk}")
        else:
            # Compare fields
            changed_fields = []
            for field in obj._meta.fields:
                if field.name == 'id' or field.name == 'pk':
                    continue
                imported_val = getattr(obj, field.name)
                live_val = getattr(live_obj, field.name)
                if imported_val != live_val:
                    changed_fields.append(field.name)
            
            if changed_fields:
                diff["updated"].append(f"{model_name} PK={obj.pk} (Changed fields: {', '.join(changed_fields)})")
                
    # Check for removed objects (exist in live DB but not in imported JSON)
    for model_class, qs in live_qs_map.items():
        model_name = model_class.__name__
        imported_pks = imported_pks_by_model.get(model_class, set())
        
        for live_obj in qs.all():
            if str(live_obj.pk) not in imported_pks:
                diff["removed"].append(f"{model_name} PK={live_obj.pk}")
                
    # Log the preview action
    ActivityLog.objects.create(
        action_type='config_import',
        section_id=target_section_id,
        actor=user,
        success=True,
        detail="preview only, no changes applied",
        related_export=export
    )
    return diff


def _take_safety_snapshot(section_id, user=None):
    """
    Helper to trigger a raw snapshot as a safety mechanism before a destructive operation.
    """
    snapshot = perform_raw_snapshot(section_id, user=user)
    snapshot.notes = "SAFETY_SNAPSHOT"
    snapshot.save()
    return snapshot


def perform_raw_restore(snapshot_id, user=None):
    """
    Restores a section to the state captured in the given raw snapshot.
    Guarded by a mandatory safety snapshot.
    """
    from django.db import transaction
    snapshot = BackupSnapshot.objects.get(id=snapshot_id)
    section_id = snapshot.section_id
    section = section_registry.get_section(section_id)
    
    if not section:
        raise ValueError(f"Section {section_id} is not registered.")
        
    if snapshot.schema_version != '1.0':
        raise ValueError(f"Incompatible schema version: {snapshot.schema_version}. Expected 1.0.")
        
    try:
        file = default_storage.open(snapshot.file_reference, 'r')
        json_data = file.read()
        file.close()
    except Exception as e:
        raise ValueError(f"Could not read snapshot file: {e}")
        
    # Validate it parses
    try:
        list(serializers.deserialize('json', json_data))
    except Exception as e:
        raise ValueError(f"Invalid JSON data in snapshot file: {e}")
        
    # 1. Take safety snapshot
    try:
        safety_snapshot = _take_safety_snapshot(section_id, user)
    except Exception as e:
        # Abort if safety fails
        ActivityLog.objects.create(
            action_type='restore',
            section_id=section_id,
            actor=user,
            success=False,
            detail=f"Aborted restore due to safety snapshot failure: {e}",
            related_snapshot=snapshot
        )
        raise RuntimeError(f"Safety snapshot failed, restore aborted: {e}")

    # 2. Perform restore in atomic transaction
    try:
        with transaction.atomic():
            section.restore_raw(json_data)
            
        ActivityLog.objects.create(
            action_type='restore',
            section_id=section_id,
            actor=user,
            success=True,
            detail=f"Restore successful. Safety snapshot ID: {safety_snapshot.id}",
            related_snapshot=snapshot
        )
    except Exception as e:
        logger.exception(f"Failed to restore snapshot {snapshot_id}")
        ActivityLog.objects.create(
            action_type='restore',
            section_id=section_id,
            actor=user,
            success=False,
            detail=f"Restore failed during execution: {e}",
            related_snapshot=snapshot
        )
        raise e


def perform_config_import(export_id, target_section_id, user=None):
    """
    Imports a configuration export into the target section.
    Guarded by a mandatory safety snapshot.
    """
    from django.db import transaction
    export = ConfigExport.objects.get(id=export_id)
    section = section_registry.get_section(target_section_id)
    
    if not section:
        raise ValueError(f"Section {target_section_id} is not registered.")
        
    if export.schema_version != '1.0':
        raise ValueError(f"Incompatible schema version: {export.schema_version}. Expected 1.0.")
        
    try:
        file = default_storage.open(export.file_reference, 'r')
        json_data = file.read()
        file.close()
    except Exception as e:
        raise ValueError(f"Could not read export file: {e}")
        
    # Validate it parses
    try:
        list(serializers.deserialize('json', json_data))
    except Exception as e:
        raise ValueError(f"Invalid JSON data in export file: {e}")
        
    # 1. Take safety snapshot
    try:
        safety_snapshot = _take_safety_snapshot(target_section_id, user)
    except Exception as e:
        ActivityLog.objects.create(
            action_type='config_import',
            section_id=target_section_id,
            actor=user,
            success=False,
            detail=f"Aborted import due to safety snapshot failure: {e}",
            related_export=export
        )
        raise RuntimeError(f"Safety snapshot failed, import aborted: {e}")

    # 2. Perform import in atomic transaction
    try:
        with transaction.atomic():
            section.import_config(json_data)
            
        ActivityLog.objects.create(
            action_type='config_import',
            section_id=target_section_id,
            actor=user,
            success=True,
            detail=f"Config import successful. Safety snapshot ID: {safety_snapshot.id}",
            related_export=export
        )
    except Exception as e:
        logger.exception(f"Failed to import config {export_id}")
        ActivityLog.objects.create(
            action_type='config_import',
            section_id=target_section_id,
            actor=user,
            success=False,
            detail=f"Config import failed during execution: {e}",
            related_export=export
        )
        raise e
