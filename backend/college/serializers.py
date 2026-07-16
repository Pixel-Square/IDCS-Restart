from rest_framework import serializers
from .models import College


class CollegeSerializer(serializers.ModelSerializer):
    class Meta:
        model = College
        fields = [
            'id', 'code', 'name', 'short_name',
            'address', 'city', 'state', 'country', 'postal_code',
            'phone', 'email', 'website',
            'established_year', 'logo', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
