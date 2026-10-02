"""
Django settings for revive project.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv
    env_file = BASE_DIR / '.env'
    if env_file.exists():
        load_dotenv(str(env_file))
except ImportError:
    pass

SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-revive-dev-change-me-before-production',
)

DEBUG = os.environ.get('DJANGO_DEBUG', '1').strip().lower() not in ('0', 'false', 'no', 'off')

ALLOWED_HOSTS = [
    '*',
    'localhost',
    '127.0.0.1',
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'imagegen',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'revive.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'revive.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Moisture CTA threshold — show "Get Your Revive Right Now" when below this %
MOISTURE_REVIVE_THRESHOLD = float(os.environ.get('MOISTURE_REVIVE_THRESHOLD', '50'))

# Makeupar / Perfect Corp YCE HD — moisture only (hd_moisture)
MAKEUPAR_API_KEY = os.environ.get('MAKEUPAR_API_KEY', '')
MAKEUPAR_BASE_URL = os.environ.get(
    'MAKEUPAR_BASE_URL',
    'https://yce-api-01.makeupar.com/s2s',
)
MAKEUPAR_FILE_API_VERSION = os.environ.get('MAKEUPAR_FILE_API_VERSION', 'v2.0')
MAKEUPAR_TASK_API_VERSION = os.environ.get('MAKEUPAR_TASK_API_VERSION', 'v2.1')
MAKEUPAR_HD_MIN_SHORT_SIDE = int(os.environ.get('MAKEUPAR_HD_MIN_SHORT_SIDE', '1080'))
MAKEUPAR_HD_MAX_LONG_SIDE = int(os.environ.get('MAKEUPAR_HD_MAX_LONG_SIDE', '4096'))
MAKEUPAR_HD_MAX_BYTES = int(os.environ.get('MAKEUPAR_HD_MAX_BYTES', str(10 * 1024 * 1024)))
MAKEUPAR_HD_JPEG_QUALITY = int(os.environ.get('MAKEUPAR_HD_JPEG_QUALITY', '92'))
MAKEUPAR_POLL_INTERVAL_S = float(os.environ.get('MAKEUPAR_POLL_INTERVAL_S', '2'))
MAKEUPAR_POLL_MAX_ATTEMPTS = int(os.environ.get('MAKEUPAR_POLL_MAX_ATTEMPTS', '90'))
