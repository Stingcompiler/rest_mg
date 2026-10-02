"""Serving uploaded media: images only, and inert.

Uploads are re-encoded by ``apps.core.images`` before they are stored, so only
JPEG and PNG files should ever be here. This view is the second line of defence:
anything else that lands in MEDIA_ROOT — copied in by hand, left by an older
build — is never served, and what is served carries a sandbox policy, so even a
file that is not what its name says cannot run script with this origin's
authority. ``X-Content-Type-Options: nosniff`` comes from SecurityMiddleware.
"""
from __future__ import annotations

from pathlib import PurePosixPath

from django.http import Http404
from django.views.static import serve

SERVABLE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp"})


def serve_media(request, path, document_root=None):
    if PurePosixPath(path).suffix.lower() not in SERVABLE_SUFFIXES:
        raise Http404("Not an image.")
    response = serve(request, path, document_root=document_root)
    response["Content-Security-Policy"] = "sandbox"
    return response
