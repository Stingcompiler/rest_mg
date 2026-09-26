"""A single error shape for every endpoint.

The Next.js proxy normalises nothing it does not have to; the API is the one
place errors are given a stable form:

    {"error": {"code": "validation_error", "message": "...", "detail": {...}}}
"""
from __future__ import annotations

from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from apps.core.models import HardDeleteBlocked

_CODES = {
    status.HTTP_400_BAD_REQUEST: "validation_error",
    status.HTTP_401_UNAUTHORIZED: "unauthenticated",
    status.HTTP_403_FORBIDDEN: "forbidden",
    status.HTTP_404_NOT_FOUND: "not_found",
    status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
    status.HTTP_409_CONFLICT: "conflict",
    status.HTTP_429_TOO_MANY_REQUESTS: "rate_limited",
}


def normalised_exception_handler(exc, context):
    if isinstance(exc, HardDeleteBlocked):
        exc = exceptions.PermissionDenied(str(exc))
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()

    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    code = _CODES.get(response.status_code, "error")
    detail = response.data
    message = detail.get("detail") if isinstance(detail, dict) else None
    if message is None:
        message = "The request could not be completed."

    return Response(
        {"error": {"code": code, "message": str(message), "detail": detail}},
        status=response.status_code,
        headers=getattr(response, "headers", None),
    )
