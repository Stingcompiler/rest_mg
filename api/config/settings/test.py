"""Test settings.

PostgreSQL is the only supported database for this project. When DATABASE_URL
points at a reachable PostgreSQL instance these tests run against it, which is
what CI does and what any pre-merge run must do.

When no instance is reachable — a developer laptop without a local server — the
suite falls back to in-memory SQLite and prints a warning. That fallback exists
so the domain and API rules can be exercised locally; it is never a deployment
target, and PostgreSQL-specific behaviour (JSONB containment, bigint overflow at
the driver boundary, constraint deferral) is only truly covered by a PostgreSQL
run.
"""
from __future__ import annotations

import os
import socket
import sys
from urllib.parse import urlparse

from .base import *  # noqa: F401,F403

DEBUG = False
ALLOWED_HOSTS = ["testserver", "localhost"]
AUTH_COOKIE_SECURE = False
# Long enough for HS256 without warnings; never used outside the suite.
SECRET_KEY = "test-only-secret-key-that-is-long-enough-for-hs256-signing"


def _postgres_reachable(url: str, timeout: float = 0.4) -> bool:
    parsed = urlparse(url)
    host, port = parsed.hostname or "localhost", parsed.port or 5432
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


_database_url = os.environ.get(
    "DATABASE_URL", "postgres://sudanpos:sudanpos@localhost:5432/sudanpos"
)

if _postgres_reachable(_database_url):
    USING_POSTGRES_FOR_TESTS = True
elif os.environ.get("REQUIRE_POSTGRES_FOR_TESTS") == "1":
    # CI sets this: a run that silently fell back to SQLite would report green
    # without having exercised PostgreSQL at all.
    raise RuntimeError(
        f"REQUIRE_POSTGRES_FOR_TESTS is set but no PostgreSQL answers at "
        f"{urlparse(_database_url).hostname}:{urlparse(_database_url).port or 5432}."
    )
else:
    USING_POSTGRES_FOR_TESTS = False
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
    print(
        "\n  WARNING: no PostgreSQL at "
        f"{urlparse(_database_url).hostname}:{urlparse(_database_url).port or 5432} — "
        "running the suite on in-memory SQLite.\n"
        "  This is a local convenience only. CI and pre-merge runs must set "
        "DATABASE_URL to a PostgreSQL instance.\n",
        file=sys.stderr,
    )

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Throttles never trigger against a dummy cache, so the suite can sign in as
# often as it likes; tests/test_login_throttle.py switches to a real cache.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}

# Several tests need two branches. tests/test_single_branch.py turns the guard on.
SINGLE_BRANCH = False

# Uploads go to a throwaway directory, never the real one.
#
# ImageField writes a file the moment a test saves a model, and the test
# database being destroyed afterwards does not take those files with it. Run
# against the real MEDIA_ROOT the suite quietly littered the restaurant's own
# media folder with one-pixel PNGs on every run.
import tempfile  # noqa: E402

MEDIA_ROOT = tempfile.mkdtemp(prefix="sudanpos-test-media-")
