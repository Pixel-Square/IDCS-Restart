import uuid
from django.db import models

class CdapRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject_id = models.UUIDField(unique=True)
    status = models.TextField(default='draft')
    rows = models.JSONField(default=list)
    books = models.JSONField(default=dict)
    active_learning = models.JSONField(default=dict)
    created_by = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.UUIDField(null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'cdap_revisions'

class CdapActiveLearningAnalysisMapping(models.Model):
    id = models.IntegerField(primary_key=True)
    mapping = models.JSONField(default=dict)
    updated_by = models.UUIDField(null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'cdap_active_learning_analysis_mapping'
