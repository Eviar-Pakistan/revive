from django.contrib import admin
from django.utils.html import format_html

from .models import AnalysisRun


@admin.register(AnalysisRun)
class AnalysisRunAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'created_at',
        'moisture_level',
        'needs_revive',
        'provider',
        'session_key_short',
    )
    list_filter = ('needs_revive', 'provider', 'created_at')
    search_fields = ('session_key', 'user_agent', 'provider')
    readonly_fields = (
        'created_at',
        'provider',
        'moisture_level',
        'needs_revive',
        'session_key',
        'user_agent',
    )
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'

    def session_key_short(self, obj):
        key = obj.session_key or ''
        return key[:12] + '…' if len(key) > 12 else (key or '—')

    session_key_short.short_description = 'Session'

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        total = AnalysisRun.objects.count()
        revive_count = AnalysisRun.objects.filter(needs_revive=True).count()
        extra_context['title'] = format_html(
            'Completed analyses — total: <strong>{}</strong> · needs revive: <strong>{}</strong>',
            total,
            revive_count,
        )
        return super().changelist_view(request, extra_context=extra_context)
