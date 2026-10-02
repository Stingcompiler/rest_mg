import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

# base.py falls back to a development key so a laptop runs without setup. A
# production process must never sign sessions with it.
if not os.environ.get("DJANGO_SECRET_KEY"):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set in production.")

# WhiteNoise serves Django's own static (the admin) in production, where DEBUG is
# off and runserver's static handler is gone. It sits right after the security
# middleware and only handles STATIC_URL; the frontend catch-all serves the rest.
# Dev does not need it (runserver serves /static/), so it is prod-only.
MIDDLEWARE.insert(  # noqa: F405
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,  # noqa: F405
    "whitenoise.middleware.WhiteNoiseMiddleware",
)
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Sign-in limits must count across every gunicorn process and survive a
# restart, so they live in the database. The table is created at build time
# (`manage.py createcachetable`, render.yaml).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

# Behind the platform's proxy the client address arrives in X-Forwarded-For.
# Counting the proxies lets the sign-in limits use the real client address and
# ignore whatever a client puts in that header itself. Verify on deploy.
REST_FRAMEWORK = {**REST_FRAMEWORK, "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "1"))}  # noqa: F405

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31_536_000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
AUTH_COOKIE_SECURE = True
