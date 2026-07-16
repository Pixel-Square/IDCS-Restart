from django.urls import path
from .views import CollegeListCreateView, CollegeDetailView

urlpatterns = [
    path('colleges/', CollegeListCreateView.as_view(), name='college-list-create'),
    path('colleges/<int:pk>/', CollegeDetailView.as_view(), name='college-detail'),
]
