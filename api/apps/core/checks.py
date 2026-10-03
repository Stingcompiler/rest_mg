"""Deploy-time checks.

``single_branch`` fails when the database already holds more than one branch
while ``SINGLE_BRANCH`` is on — a second branch that predates the guard in
``Branch.save``, or one written around it. Run after migrations:

    python manage.py check --tag single_branch
"""
from __future__ import annotations

from django.conf import settings
from django.core.checks import Error, register
from django.db import DatabaseError


@register("single_branch")
def single_branch(app_configs, **kwargs):
    if not settings.SINGLE_BRANCH:
        return []
    from apps.core.models import Branch

    try:
        count = Branch.objects.count()
    except DatabaseError:
        # Before the first migration there is no table to count yet.
        return []
    if count <= 1:
        return []
    return [
        Error(
            f"{count} branches exist, but this installation is set up for one.",
            hint="Set SINGLE_BRANCH=false if the restaurant runs several branches, "
            "and give each branch's staff and devices their branch.",
            id="core.E001",
        )
    ]
