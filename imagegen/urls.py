from django.urls import path

from .views import index, analyze_moisture_api

urlpatterns = [
    path('', index, name='index'),
    path('api/analyze-moisture/', analyze_moisture_api, name='analyze_moisture_api'),
]
