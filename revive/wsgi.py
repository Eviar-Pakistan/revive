"""
WSGI config for revive project.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'revive.settings')

application = get_wsgi_application()
