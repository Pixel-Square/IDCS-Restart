import uuid
from django.db import models

class CdapRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject_id = models.CharField(max_length=64, unique=True)
    status = models.TextField(default='draft')
    rows = models.JSONField(default=list)
    books = models.JSONField(default=dict)
    active_learning = models.JSONField(default=dict)
    created_by = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cdap_revisions'


class LcaRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject_id = models.CharField(max_length=64, unique=True)
    status = models.TextField(default='draft')
    data = models.JSONField(default=dict)
    created_by = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lca_revisions'


class CoTargetRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject_id = models.CharField(max_length=64, unique=True)
    status = models.TextField(default='draft')
    data = models.JSONField(default=dict)
    created_by = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'co_target_revisions'


class CdapActiveLearningAnalysisMapping(models.Model):
    id = models.IntegerField(primary_key=True)
    mapping = models.JSONField(default=dict)
    updated_by = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cdap_active_learning_analysis_mapping'
