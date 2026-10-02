"""Base settings shared by every environment."""
from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from config.db import parse_database_url

BASE_DIR = Path(__file__).resolve().parents[2]

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key-do-not-deploy")
DEBUG = False
# Hosts this server answers to. Comma-separated in the environment, so a tunnel
# hostname or a LAN address is added without editing code. Django strips the port
# before matching, so entries here are bare hostnames.
ALLOWED_HOSTS = [h for h in os.environ.get("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",") if h]

# Django checks the Origin of unsafe requests against this list and wants the
# scheme with it. Behind a tunnel the browser's origin is the public https name,
# not the localhost this process is bound to, so it must be named here or the
# admin login answers 403.
CSRF_TRUSTED_ORIGINS = [
    o for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if o
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    # Spent and signed-out refresh tokens (apps.accounts.views, tokens).
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "apps.core",
    "apps.accounts",
    "apps.catalog",
    "apps.orders",
    "apps.shifts",
    "apps.profiles",
    "apps.sync",
    "apps.audit",
    "apps.customers",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {
    "default": parse_database_url(
        os.environ.get(
            "DATABASE_URL", "postgres://sudanpos:sudanpos@localhost:5432/sudanpos"
        )
    )
}

AUTH_USER_MODEL = "accounts.ManagerUser"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

# The restaurant is in Sudan; every server-side aggregate is bucketed in local time.
LANGUAGE_CODE = "ar"
TIME_ZONE = "Africa/Khartoum"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# Django's own static (the admin) collects here; WhiteNoise serves it in prod.
# The Next frontend does not use this — it is served from FRONTEND_DIR below.
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Uploaded media — item photos. Stored on disk under MEDIA_ROOT and served at
# MEDIA_URL. In the monolith the same Django process serves these (see the media
# route in config/urls), so a manager-uploaded photo is reachable from the
# public landing page on the same origin with no separate media host.
MEDIA_URL = "media/"
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media"))

# Limits on an uploaded image, checked before its pixels are decoded
# (apps.core.images). 40 megapixels is well past any phone camera.
IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
IMAGE_UPLOAD_MAX_PIXELS = 40_000_000

# The exported frontend (web/out) that this server also serves. In the monolith
# Django is the single origin for the app, the API, and the public landing page.
FRONTEND_DIR = BASE_DIR.parent / "web" / "out"

REST_FRAMEWORK = {
    # Authentication is declared per view. Nothing is authenticated by accident.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "apps.core.exceptions.normalised_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    # Rotation and the blacklist are done by apps.accounts.views.refresh itself,
    # which does not go through Simple JWT's refresh serializer that these flags
    # configure.
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Sign-in attempt limits (apps.accounts.throttles), in DRF's rate format.
LOGIN_THROTTLE_RATES = {
    "address": "20/min",
    "account_minute": "5/min",
    "account_hour": "30/hour",
}

# The throttle counts. One process's memory is enough for development; production
# shares them across processes (config/settings/prod.py).
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Records are not yet scoped to their branch on every read and write (review
# finding F02), so a second branch is refused until that work is done
# (apps.core.models.Branch, apps.core.checks). Turn off only together with it.
SINGLE_BRANCH = os.environ.get("SINGLE_BRANCH", "true").lower() not in {"0", "false", "no"}

# Manager auth travels in httpOnly cookies, never in localStorage.
AUTH_COOKIE_ACCESS = "sp_access"
AUTH_COOKIE_REFRESH = "sp_refresh"
AUTH_COOKIE_SECURE = True
AUTH_COOKIE_SAMESITE = "Lax"
AUTH_COOKIE_PATH = "/"

CORS_ALLOWED_ORIGINS = [
    o for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if o
]
CORS_ALLOW_CREDENTIALS = True

# --- Business constants (see docs/PLAN.md phase 0.1) --------------------------
# Cash variance beyond this fraction of expected cash requires a written reason
# before a shift may close.
SHIFT_VARIANCE_TOLERANCE = 0.01
# Sync batches larger than this are rejected rather than silently truncated.
SYNC_MAX_BATCH_RECORDS = 500
