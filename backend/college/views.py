from rest_framework import generics, permissions, filters, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from .models import College
from .serializers import CollegeSerializer


class CollegeListCreateView(generics.ListCreateAPIView):
    """List all colleges or create a new one. Accessible to authenticated staff."""
    serializer_class = CollegeSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['code', 'name', 'short_name', 'city']
    ordering_fields = ['code', 'name', 'city', 'created_at']
    ordering = ['name']

    def get_queryset(self):
        qs = College.objects.all()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs


class CollegeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update or delete a college. Requires superuser or staff."""
    serializer_class = CollegeSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = College.objects.all()
