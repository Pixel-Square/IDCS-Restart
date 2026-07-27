from backups_logs.registry import BackupSection
from .models import (
    ApplicationType,
    ApplicationField,
    ApprovalFlow,
    ApprovalStep,
    RoleApplicationPermission,
    ApplicationRoleHierarchy,
    ApplicationRoleHierarchyStage,
    ApplicationRoleHierarchyStageRole,
    ApplicationRoleHierarchyStageUser,
    ApplicationFormVersion,
    Application,
    ApplicationData,
    ApprovalAction,
    ApplicationAttachment,
)


class ApplicationsBackupSection(BackupSection):
    """
    Backup section for the Applications module.

    CONFIG: ApplicationType, ApplicationField, ApprovalFlow, ApprovalStep,
    RoleApplicationPermission, ApplicationRoleHierarchy/Stage/StageRole/StageUser,
    ApplicationFormVersion. These define the forms, workflows, and permissions.

    RAW: Application, ApplicationData, ApprovalAction, ApplicationAttachment.
    These track the actual submitted applications and actions.

    Restore strategy: wipe-and-replace. Deletion order respects FK dependencies.
    """
    section_id = "applications"
    display_name = "Applications"

    def get_raw_queryset_map(self):
        return {
            ApplicationType: ApplicationType.objects.all(),
            ApplicationField: ApplicationField.objects.all(),
            ApprovalFlow: ApprovalFlow.objects.all(),
            ApprovalStep: ApprovalStep.objects.all(),
            RoleApplicationPermission: RoleApplicationPermission.objects.all(),
            ApplicationRoleHierarchy: ApplicationRoleHierarchy.objects.all(),
            ApplicationRoleHierarchyStage: ApplicationRoleHierarchyStage.objects.all(),
            ApplicationRoleHierarchyStageRole: ApplicationRoleHierarchyStageRole.objects.all(),
            ApplicationRoleHierarchyStageUser: ApplicationRoleHierarchyStageUser.objects.all(),
            ApplicationFormVersion: ApplicationFormVersion.objects.all(),
            Application: Application.objects.all(),
            ApplicationData: ApplicationData.objects.all(),
            ApprovalAction: ApprovalAction.objects.all(),
            ApplicationAttachment: ApplicationAttachment.objects.all(),
        }

    def get_config_queryset_map(self):
        return {
            ApplicationType: ApplicationType.objects.all(),
            ApplicationField: ApplicationField.objects.all(),
            ApprovalFlow: ApprovalFlow.objects.all(),
            ApprovalStep: ApprovalStep.objects.all(),
            RoleApplicationPermission: RoleApplicationPermission.objects.all(),
            ApplicationRoleHierarchy: ApplicationRoleHierarchy.objects.all(),
            ApplicationRoleHierarchyStage: ApplicationRoleHierarchyStage.objects.all(),
            ApplicationRoleHierarchyStageRole: ApplicationRoleHierarchyStageRole.objects.all(),
            ApplicationRoleHierarchyStageUser: ApplicationRoleHierarchyStageUser.objects.all(),
            ApplicationFormVersion: ApplicationFormVersion.objects.all(),
        }

    def restore_raw(self, data):
        from django.core import serializers
        ApplicationAttachment.objects.all().delete()
        ApprovalAction.objects.all().delete()
        ApplicationData.objects.all().delete()
        Application.objects.all().delete()
        ApplicationFormVersion.objects.all().delete()
        ApplicationRoleHierarchyStageUser.objects.all().delete()
        ApplicationRoleHierarchyStageRole.objects.all().delete()
        ApplicationRoleHierarchyStage.objects.all().delete()
        ApplicationRoleHierarchy.objects.all().delete()
        RoleApplicationPermission.objects.all().delete()
        ApprovalStep.objects.all().delete()
        ApprovalFlow.objects.all().delete()
        ApplicationField.objects.all().delete()
        ApplicationType.objects.all().delete()
        for des_obj in serializers.deserialize('json', data):
            des_obj.save()

    def import_config(self, data):
        from django.core import serializers
        deserialized = list(serializers.deserialize('json', data))

        imported_pks = {
            ApplicationType: set(),
            ApplicationField: set(),
            ApprovalFlow: set(),
            ApprovalStep: set(),
            RoleApplicationPermission: set(),
            ApplicationRoleHierarchy: set(),
            ApplicationRoleHierarchyStage: set(),
            ApplicationRoleHierarchyStageRole: set(),
            ApplicationRoleHierarchyStageUser: set(),
            ApplicationFormVersion: set(),
        }

        for des_obj in deserialized:
            model_class = des_obj.object.__class__
            if model_class in imported_pks:
                imported_pks[model_class].add(str(des_obj.object.pk))

        # Delete existing in reverse dep order
        for obj in ApplicationFormVersion.objects.all():
            if str(obj.pk) not in imported_pks[ApplicationFormVersion]:
                obj.delete()
        for obj in ApplicationRoleHierarchyStageUser.objects.all():
            if str(obj.pk) not in imported_pks[ApplicationRoleHierarchyStageUser]:
                obj.delete()
        for obj in ApplicationRoleHierarchyStageRole.objects.all():
            if str(obj.pk) not in imported_pks[ApplicationRoleHierarchyStageRole]:
                obj.delete()
        for obj in ApplicationRoleHierarchyStage.objects.all():
            if str(obj.pk) not in imported_pks[ApplicationRoleHierarchyStage]:
                obj.delete()
        for obj in ApplicationRoleHierarchy.objects.all():
            if str(obj.pk) not in imported_pks[ApplicationRoleHierarchy]:
                obj.delete()
        for obj in RoleApplicationPermission.objects.all():
            if str(obj.pk) not in imported_pks[RoleApplicationPermission]:
                obj.delete()
        for obj in ApprovalStep.objects.all():
            if str(obj.pk) not in imported_pks[ApprovalStep]:
                obj.delete()
        for obj in ApprovalFlow.objects.all():
            if str(obj.pk) not in imported_pks[ApprovalFlow]:
                obj.delete()
        for obj in ApplicationField.objects.all():
            if str(obj.pk) not in imported_pks[ApplicationField]:
                obj.delete()
        for obj in ApplicationType.objects.all():
            if str(obj.pk) not in imported_pks[ApplicationType]:
                obj.delete()

        for des_obj in deserialized:
            des_obj.save()
