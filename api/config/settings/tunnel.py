"""Serving this machine's app over a public tunnel (Cloudflare, ngrok, similar).

Neither existing module fits, which is why this one exists.

`dev` is wrong for one reason that outweighs its convenience: DEBUG. A tunnel
puts this process on the open internet, and with DEBUG on every unhandled error
answers with a page carrying the traceback, the settings and the SECRET_KEY — to
whoever asked. `prod` is wrong because it is PostgreSQL only, and the whole point
of a tunnel is to show the data that is on *this* machine, which is SQLite.

So: production-shaped, on the development database.

TLS terminates at the tunnel, which then speaks plain HTTP to this process. The
only way Django can know the visitor arrived over HTTPS is the X-Forwarded-Proto
header the tunnel sets. Trusting that header is safe *because the tunnel is the
only thing that can reach this port* — bind this to a public interface and the
header becomes a lie anyone can tell.
"""
from __future__ import annotations

import os

from .base import *  # noqa: F401,F403

DEBUG = False

# WhiteNoise, because with DEBUG off runserver stops serving /static/ and the
# admin loses its stylesheet. Only Django's own static goes through it; the
# frontend is served by config/spa.py and is unaffected.
MIDDLEWARE.insert(  # noqa: F405
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,  # noqa: F405
    "whitenoise.middleware.WhiteNoiseMiddleware",
)

# The same zero-setup SQLite dev runs on, so the tunnel shows the data already
# seeded here. An explicit DATABASE_URL still wins.
if not os.environ.get("DATABASE_URL"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
        }
    }

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# The browser reaches the app over HTTPS, so the session and auth cookies carry
# the Secure flag. The cost is deliberate: reaching the till over plain http on
# the local network will not log in any more, only the tunnel hostname will.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
AUTH_COOKIE_SECURE = True

# Deliberately no SECURE_SSL_REDIRECT. The tunnel already serves HTTPS and only
# HTTPS, so it would never fire for a real visitor — but it would bounce anyone
# opening the app from the local network to an https://192.168.x.x that has no
# certificate at all.

# `check --deploy` flags the absence of SECURE_SSL_REDIRECT and SECURE_HSTS_SECONDS.
# Both are answered by the tunnel rather than ignored: it accepts HTTPS only, so
# there is no plaintext request to redirect, and HSTS belongs on the edge that
# owns the certificate. Setting either here would only affect local-network
# access, where it would break it.
