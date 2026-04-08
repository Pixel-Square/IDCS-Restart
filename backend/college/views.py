from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import College


@api_view(['GET'])
def search_colleges(request):
    """
    Public endpoint to search colleges by name or code.
    Used by external staff registration form.
    
    Query params:
        q: search query (min 2 chars required)
        limit: max results (default 20)
    
    Returns:
        List of colleges matching the query
    """
    query = request.GET.get('q', '').strip()
    limit = min(int(request.GET.get('limit', 20)), 50)  # Max 50
    
    if len(query) < 2:
        return Response({'results': [], 'message': 'Enter at least 2 characters'})
    
    colleges = College.objects.filter(
        Q(name__icontains=query) | 
        Q(short_name__icontains=query) |
        Q(code__icontains=query)
    ).filter(is_active=True).order_by('name')[:limit]
    
    results = [
        {
            'id': c.id,
            'code': c.code,
            'name': c.name,
            'short_name': c.short_name,
            'city': c.city,
            'display': f"{c.name}" + (f", {c.city}" if c.city else ""),
        }
        for c in colleges
    ]
    
    return Response({'results': results})


@api_view(['GET'])
def list_all_colleges(request):
    """
    Public endpoint to get all active colleges.
    Use sparingly - for dropdown pre-population.
    """
    colleges = College.objects.filter(is_active=True).order_by('name')
    
    results = [
        {
            'id': c.id,
            'code': c.code,
            'name': c.name,
            'short_name': c.short_name,
            'city': c.city,
            'display': f"{c.name}" + (f", {c.city}" if c.city else ""),
        }
        for c in colleges
    ]
    
    return Response({'results': results, 'total': len(results)})
