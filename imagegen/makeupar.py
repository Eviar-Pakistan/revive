"""
Makeupar / Perfect Corp YCE HD — moisture-only client for Revive.

Flow: prepare HD image → File API init → PUT to pre-signed URL →
start skin-analysis task (hd_moisture only) → poll → return moisture %.
"""
from __future__ import annotations

import io
import logging
import time
import uuid
from typing import Any

import requests
from django.conf import settings
from PIL import Image

logger = logging.getLogger(__name__)

# Revive only needs moisture from Makeupar HD
HD_ACTIONS = (
    'hd_moisture',
)


def _auth_headers(json_body: bool = True) -> dict:
    key = (getattr(settings, 'MAKEUPAR_API_KEY', '') or '').strip()
    if not key:
        raise ValueError(
            'Makeupar API key missing. Add MAKEUPAR_API_KEY to .env and restart.'
        )
    headers = {'Authorization': f'Bearer {key}'}
    if json_body:
        headers['Content-Type'] = 'application/json'
    return headers


def _api_root() -> str:
    return (
        getattr(settings, 'MAKEUPAR_BASE_URL', '')
        or 'https://yce-api-01.makeupar.com/s2s'
    ).rstrip('/')


def _file_url() -> str:
    version = getattr(settings, 'MAKEUPAR_FILE_API_VERSION', 'v2.0')
    return f'{_api_root()}/{version}/file'


def _task_url(task_id: str | None = None) -> str:
    version = getattr(settings, 'MAKEUPAR_TASK_API_VERSION', 'v2.1')
    base = f'{_api_root()}/{version}/task/skin-analysis'
    if task_id:
        return f'{base}/{task_id}'
    return base


def prepare_hd_jpeg(image: Image.Image) -> tuple[bytes, str, str]:
    """
    Prepare image for Makeupar HD:
    - short side >= 1080
    - long side <= 4096
    - JPEG under 10MB
    Returns (bytes, content_type, file_name).
    """
    img = image.convert('RGB')
    min_short = int(getattr(settings, 'MAKEUPAR_HD_MIN_SHORT_SIDE', 1080))
    max_long = int(getattr(settings, 'MAKEUPAR_HD_MAX_LONG_SIDE', 4096))
    max_bytes = int(getattr(settings, 'MAKEUPAR_HD_MAX_BYTES', 10 * 1024 * 1024))
    quality = int(getattr(settings, 'MAKEUPAR_HD_JPEG_QUALITY', 92))

    w, h = img.size
    short, long_side = min(w, h), max(w, h)

    if short < min_short:
        scale = min_short / float(short)
        img = img.resize(
            (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
            Image.Resampling.LANCZOS,
        )
        w, h = img.size
        long_side = max(w, h)

    if long_side > max_long:
        scale = max_long / float(long_side)
        img = img.resize(
            (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
            Image.Resampling.LANCZOS,
        )
        w, h = img.size

    short = min(w, h)
    if short < min_short:
        raise ValueError(
            f'Image cannot meet HD requirements (short side {short}px after resize; need ≥{min_short}).'
        )

    data = None
    current_quality = quality
    while current_quality >= 55:
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=current_quality, optimize=True)
        data = buffer.getvalue()
        if len(data) <= max_bytes:
            break
        current_quality -= 7
    else:
        while data and len(data) > max_bytes and max(img.size) > min_short:
            nw = max(min_short if img.width <= img.height else 1, int(img.width * 0.9))
            nh = max(min_short if img.height < img.width else 1, int(img.height * 0.9))
            if min(nw, nh) < min_short:
                break
            img = img.resize((nw, nh), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=70, optimize=True)
            data = buffer.getvalue()

    if not data or len(data) > max_bytes:
        raise ValueError('Could not compress image under Makeupar 10MB HD limit.')

    logger.info(
        'Makeupar HD image ready: %dx%d, %d KB, q~%d',
        img.width,
        img.height,
        len(data) // 1024,
        current_quality,
    )
    file_name = f'revive_moisture_{uuid.uuid4().hex[:12]}.jpg'
    return data, 'image/jpeg', file_name


def upload_file(image_bytes: bytes, content_type: str, file_name: str) -> str:
    """Init File API + PUT bytes to pre-signed URL. Returns file_id."""
    init_payload = {
        'files': [
            {
                'content_type': content_type,
                'file_name': file_name,
                'file_size': len(image_bytes),
            }
        ]
    }
    resp = requests.post(
        _file_url(),
        headers=_auth_headers(json_body=True),
        json=init_payload,
        timeout=60,
    )
    if not resp.ok:
        raise ValueError(f'Makeupar file init failed: {resp.status_code} {resp.text[:400]}')

    payload = resp.json() if resp.content else {}
    files = (payload.get('data') or {}).get('files') or []
    if not files:
        raise ValueError('Makeupar file init returned no files: ' + str(payload)[:400])

    file_info = files[0]
    file_id = file_info.get('file_id')
    requests_meta = file_info.get('requests') or []
    if not file_id or not requests_meta:
        raise ValueError(
            'Makeupar file init missing file_id or upload request: ' + str(payload)[:400]
        )

    put_meta = requests_meta[0]
    put_url = put_meta.get('url')
    put_headers = dict(put_meta.get('headers') or {})
    method = (put_meta.get('method') or 'PUT').upper()
    if not put_url:
        raise ValueError('Makeupar file init missing pre-signed upload URL.')

    put_headers['Content-Type'] = content_type
    put_headers['Content-Length'] = str(len(image_bytes))

    put_resp = requests.request(
        method,
        put_url,
        headers=put_headers,
        data=image_bytes,
        timeout=120,
    )
    if not put_resp.ok:
        raise ValueError(
            f'Makeupar file PUT failed: {put_resp.status_code} {put_resp.text[:400]}'
        )

    logger.info('Makeupar file uploaded, file_id length=%d', len(str(file_id)))
    return str(file_id)


def start_skin_analysis(file_id: str) -> str:
    body = {
        'src_file_id': file_id,
        'dst_actions': list(HD_ACTIONS),
        'miniserver_args': {
            'enable_mask_overlay': False,
        },
        'format': 'json',
        'pf_camera_kit': False,
    }
    resp = requests.post(
        _task_url(),
        headers=_auth_headers(json_body=True),
        json=body,
        timeout=60,
    )
    if not resp.ok:
        raise ValueError(f'Makeupar task start failed: {resp.status_code} {resp.text[:500]}')

    payload = resp.json() if resp.content else {}
    task_id = (payload.get('data') or {}).get('task_id')
    if not task_id:
        raise ValueError('Makeupar task_id missing: ' + str(payload)[:400])
    return str(task_id)


def poll_skin_analysis(task_id: str) -> dict[str, Any]:
    interval = float(getattr(settings, 'MAKEUPAR_POLL_INTERVAL_S', 2))
    max_attempts = int(getattr(settings, 'MAKEUPAR_POLL_MAX_ATTEMPTS', 90))

    for attempt in range(1, max_attempts + 1):
        resp = requests.get(
            _task_url(task_id),
            headers=_auth_headers(json_body=True),
            timeout=60,
        )
        if not resp.ok:
            raise ValueError(f'Makeupar poll failed: {resp.status_code} {resp.text[:400]}')

        payload = resp.json() if resp.content else {}
        data = payload.get('data') or {}
        status = data.get('task_status')
        logger.info('Makeupar poll attempt %s status=%s', attempt, status)

        if status == 'success':
            return payload
        if status == 'error':
            err_code = str(data.get('error') or '')
            err_msg = str(data.get('error_message') or '')
            if err_code == 'error_src_face_too_small' or (
                'face' in err_msg.lower() and 'small' in err_msg.lower()
            ):
                raise ValueError(
                    'Come closer — face width must be more than 60% of the photo width. '
                    'Fill more of the frame with your face and try again.'
                )
            if err_code == 'error_src_face_out_of_bound':
                raise ValueError(
                    'Center your face — keep the full face inside the frame and try again.'
                )
            if err_code == 'error_lighting_dark':
                raise ValueError(
                    'Increase light — the photo is too dark for moisture analysis.'
                )
            raise ValueError('Makeupar task error: ' + str(payload)[:600])

        time.sleep(interval)

    raise ValueError('Makeupar poll timed out waiting for moisture analysis.')


def _health_score(item: dict | None) -> float | None:
    if not item:
        return None
    if item.get('ui_score') is not None:
        try:
            return float(item['ui_score'])
        except (TypeError, ValueError):
            pass
    if item.get('raw_score') is not None:
        try:
            return float(item['raw_score'])
        except (TypeError, ValueError):
            pass
    if item.get('score') is not None:
        try:
            return float(item['score'])
        except (TypeError, ValueError):
            pass
    return None


def _first_mask(item: dict | None) -> str | None:
    if not item:
        return None
    urls = item.get('mask_urls') or []
    if isinstance(urls, list) and urls:
        return str(urls[0])
    # Some payloads nest a single mask_url / output url
    for key in ('mask_url', 'url', 'output_url', 'image_url'):
        val = item.get(key)
        if val:
            return str(val)
    return None


def map_makeupar_to_moisture(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Map Makeupar HD output → Revive moisture result.

    moisture_level = Makeupar hd_moisture health/ui_score (0–100).
    needs_revive = moisture_level < MOISTURE_REVIVE_THRESHOLD (default 50).
    """
    data = payload.get('data') or {}
    results = data.get('results') or {}
    output = results.get('output') or []
    by_type: dict[str, dict] = {}
    for item in output:
        if isinstance(item, dict) and item.get('type'):
            by_type[str(item['type'])] = item

    moisture = by_type.get('hd_moisture')
    resize = by_type.get('resize_image')
    moisture_level = _health_score(moisture)

    if moisture_level is None:
        raise ValueError('Makeupar did not return an hd_moisture score.')

    moisture_level = max(0.0, min(100.0, float(moisture_level)))
    threshold = float(getattr(settings, 'MOISTURE_REVIVE_THRESHOLD', 50))
    needs_revive = moisture_level < threshold

    score = round(moisture_level, 1)
    return {
        'moisture_level': score,
        'total_score': score,
        'needs_revive': needs_revive,
        'threshold': threshold,
        'cta': 'Get Your Revive Right Now' if needs_revive else '',
        'mask_url': _first_mask(moisture),
        'base_image_url': _first_mask(resize),
        'disclaimer': 'Cosmetic skin observation only — not a medical diagnosis.',
    }


def analyze_moisture_with_makeupar(pil_image: Image.Image) -> dict[str, Any]:
    """Full HD pipeline. Returns moisture analysis dict."""
    image_bytes, content_type, file_name = prepare_hd_jpeg(pil_image)
    file_id = upload_file(image_bytes, content_type, file_name)
    task_id = start_skin_analysis(file_id)
    final = poll_skin_analysis(task_id)
    return map_makeupar_to_moisture(final)
