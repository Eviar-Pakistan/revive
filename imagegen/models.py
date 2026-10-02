from django.db import models


class AnalysisRun(models.Model):
    """One row per successful moisture analysis completion."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    provider = models.CharField(max_length=32, blank=True, default='')
    moisture_level = models.FloatField(null=True, blank=True)
    needs_revive = models.BooleanField(default=False)
    session_key = models.CharField(max_length=64, blank=True, default='')
    user_agent = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Completed analysis'
        verbose_name_plural = 'Completed analyses'

    def __str__(self):
        when = self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else '?'
        moist = f'{self.moisture_level:.0f}%' if self.moisture_level is not None else '?'
        return f'{when} moisture={moist} ({self.provider or "unknown"})'
