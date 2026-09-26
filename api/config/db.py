"""DATABASE_URL parsing.

PostgreSQL only. Render's filesystem is ephemeral, so SQLite is never a
deployment target; the sole exception is `config.settings.test`, which falls
back to an in-memory database when no PostgreSQL instance is reachable and says
so loudly.
"""
from __future__ import annotations

from urllib.parse import unquote, urlparse


def parse_database_url(url: str) -> dict:
    parsed = urlparse(url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError(
            f"Unsupported database scheme {parsed.scheme!r}. This project is PostgreSQL only."
        )
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or ""),
        "CONN_MAX_AGE": 600,
        "ATOMIC_REQUESTS": False,
    }
