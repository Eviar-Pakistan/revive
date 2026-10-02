from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.conf import settings
from PIL import Image
import logging

from .models import AnalysisRun

logger = logging.getLogger(__name__)


def record_completed_analysis(request, moisture_level=None, needs_revive=False, provider=''):
    """Persist a successful moisture analysis for admin totals."""
    try:
        if hasattr(request, 'session'):
            try:
                if not request.session.session_key:
                    request.session.save()
            except Exception:
                pass
            session_key = request.session.session_key or ''
        else:
            session_key = ''
        ua = (request.META.get('HTTP_USER_AGENT') or '')[:255]
        AnalysisRun.objects.create(
            provider=str(provider or '')[:32],
            moisture_level=moisture_level,
            needs_revive=bool(needs_revive),
            session_key=session_key[:64],
            user_agent=ua,
        )
    except Exception as exc:
        logger.warning('Could not record completed analysis: %s', exc)


def index(request):
    return render(request, 'index.html', {
        'MOISTURE_REVIVE_THRESHOLD': getattr(settings, 'MOISTURE_REVIVE_THRESHOLD', 50),
        'MAKEUPAR_API_KEY': getattr(settings, 'MAKEUPAR_API_KEY', '') or '',
    })


@require_http_methods(['POST'])
def analyze_moisture_api(request):
    """
    Accept a selfie, run Makeupar HD moisture analysis, return:
      moisture_level (0–100), needs_revive (true when < threshold), cta copy.
    """
    try:
        if 'image' not in request.FILES:
            return JsonResponse({'error': 'No image provided'}, status=400)

        makeupar_key = (getattr(settings, 'MAKEUPAR_API_KEY', '') or '').strip()
        if not makeupar_key:
            return JsonResponse(
                {
                    'error': (
                        'No moisture analysis provider configured. '
                        'Add MAKEUPAR_API_KEY to .env and restart.'
                    )
                },
                status=503,
            )

        user_image = Image.open(request.FILES['image']).convert('RGB')
        from .makeupar import analyze_moisture_with_makeupar

        result = analyze_moisture_with_makeupar(user_image)
        record_completed_analysis(
            request,
            moisture_level=result.get('moisture_level'),
            needs_revive=result.get('needs_revive', False),
            provider='makeupar',
        )
        moisture = result['moisture_level']
        return JsonResponse({
            'success': True,
            'provider': 'makeupar',
            'moisture_level': moisture,
            'total_score': moisture,
            'needs_revive': result['needs_revive'],
            'threshold': result['threshold'],
            'cta': result.get('cta') or '',
            'mask_url': result.get('mask_url'),
            'base_image_url': result.get('base_image_url'),
            'disclaimer': result.get('disclaimer'),
        })

    except Exception as e:
        logger.error('Error in analyze_moisture_api: %s', e)
        return JsonResponse({'error': f'Processing error: {str(e)}'}, status=500)
