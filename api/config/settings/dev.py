import os

from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]
CORS_ALLOW_ALL_ORIGINS = True
AUTH_COOKIE_SECURE = False

# Development uses SQLite for a zero-setup local run — no server to install or
# start. Production and the test suite stay PostgreSQL (config/db.py is the
# authority there); the ephemeral-filesystem reasons SQLite is unfit for deploy
# do not apply to a developer's laptop. An explicit DATABASE_URL still wins, so
# a developer who wants to run dev against real PostgreSQL can.
if not os.environ.get("DATABASE_URL"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
        }
    }
