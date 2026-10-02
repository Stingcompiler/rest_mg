"""Uploaded images: decoded, bounded, re-encoded and renamed before storage.

Assigning an upload to an ImageField and saving the model runs no image
validation — that only happens in forms — so an HTML file could be stored as a
menu photo and served back as ``text/html`` on the app's own origin (review
finding F03). Every upload path goes through ``clean_image`` instead, and what
is stored is never the client's bytes or the client's file name: it is an image
this module encoded, under a name the server chose.
"""
from __future__ import annotations

import io
import uuid
from dataclasses import dataclass

from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import status
from rest_framework.response import Response

ACCEPTED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})


@dataclass(frozen=True)
class ImageSpec:
    """How one kind of image is stored."""

    max_side: int
    # A logo is a mark with flat colours and hard edges; JPEG smears those.
    always_png: bool = False


ITEM_PHOTO = ImageSpec(max_side=1200)
LOGO = ImageSpec(max_side=512, always_png=True)
HERO_IMAGE = ImageSpec(max_side=2000)


class InvalidImage(Exception):
    """The upload is not an image this server will store."""


def clean_image(upload, spec: ImageSpec) -> ContentFile:
    """Return the upload re-encoded as a bounded JPEG or PNG, or raise InvalidImage.

    Accepts JPEG, PNG and WebP only. The byte and pixel limits are checked
    before the pixels are decoded, so an oversized or decompression-bomb file is
    refused without being expanded in memory. Metadata other than the colour
    profile is dropped, the EXIF orientation is applied, and the longest side is
    scaled down to ``spec.max_side`` (never up). Transparent images stay PNG;
    opaque ones become JPEG unless the spec keeps PNG.
    """
    if upload.size is None or upload.size > settings.IMAGE_UPLOAD_MAX_BYTES:
        raise InvalidImage("The image is larger than the upload limit.")

    try:
        upload.seek(0)
        with Image.open(upload) as source:
            if source.format not in ACCEPTED_FORMATS:
                raise InvalidImage("Only JPEG, PNG or WebP images are accepted.")
            if source.width * source.height > settings.IMAGE_UPLOAD_MAX_PIXELS:
                raise InvalidImage("The image has too many pixels.")
            source.load()
            # A transposed copy, so it outlives the source file being closed.
            image = ImageOps.exif_transpose(source)
            icc_profile = source.info.get("icc_profile")

        has_alpha = image.mode in ("RGBA", "LA", "PA") or (
            image.mode == "P" and "transparency" in image.info
        )
        as_png = has_alpha or spec.always_png
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail((spec.max_side, spec.max_side), Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        extra = {"icc_profile": icc_profile} if icc_profile else {}
        if as_png:
            image.save(buffer, format="PNG", optimize=True, **extra)
        else:
            image.save(buffer, format="JPEG", quality=85, optimize=True, progressive=True, **extra)
    except InvalidImage:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise InvalidImage("The file is not a readable image.") from exc

    extension = "png" if as_png else "jpg"
    return ContentFile(buffer.getvalue(), name=f"{uuid.uuid4().hex}.{extension}")


def invalid_image_response(error: InvalidImage) -> Response:
    return Response(
        {"error": {"code": "invalid_image", "message": str(error)}},
        status=status.HTTP_400_BAD_REQUEST,
    )
