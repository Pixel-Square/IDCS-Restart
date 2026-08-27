from rest_framework import serializers
from .models_lca import LcaRevision, CoTargetRevision, CdapRevision, CdapActiveLearningAnalysisMapping

class LcaRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LcaRevision
        fields = '__all__'

class CoTargetRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoTargetRevision
        fields = '__all__'

class CdapRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CdapRevision
        fields = '__all__'

class CdapActiveLearningAnalysisMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CdapActiveLearningAnalysisMapping
        fields = '__all__'
