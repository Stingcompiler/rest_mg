"""A Sudanese phone number, in the one form the restaurant dials.

Every website order is confirmed by phone before the kitchen sees it
(decision D1), so a number nobody can call is an order nobody can confirm. The
public form accepted anything that was not empty, and "123" made an order
(user-experience review, batch 11).

Accepted: spaces and dashes, Arabic-Indic digits, and the country code as
+249, 00249 or 249. Stored as 0 and nine digits ("0912345678"). The order page
applies the same rule before sending (web/src/lib/phone.ts).
"""
from __future__ import annotations

import re

_SEPARATORS = re.compile(r"[\s\-().]")
_PATTERN = re.compile(r"^(?:00249|249|0)?([19]\d{8})$", re.ASCII)
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def normalize_sudan_phone(raw: str) -> str | None:
    compact = _SEPARATORS.sub("", str(raw).translate(_ARABIC_INDIC))
    if compact.startswith("+"):
        compact = compact[1:]
    match = _PATTERN.match(compact)
    return f"0{match.group(1)}" if match else None
