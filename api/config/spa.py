"""Serving the exported frontend.

The monolith is one Django process serving three things on one origin: the API
(``/api``, ``/admin``, ``/healthz``), and the static frontend export
(everything else). This view maps a request path to a file in ``web/out`` —
directory-style routes to their ``index.html`` — with two special cases:

  - every ``/r/<slug>`` serves the one landing shell, so any restaurant's public
    page works at runtime without a rebuild (the slug is read client-side);
  - ``pos-sw.js`` carries the header that lets the service worker claim ``/pos/``;
  - a screen's router payload (``…/index.txt``) loaded as a page redirects to
    the screen (batch 41);
  - the public page carries the published restaurant in its HTML, and the
    server answers ``robots.txt`` and ``sitemap.xml`` (batch 47).

For production the assets are better served by WhiteNoise or a CDN in front of
this; for a single-restaurant self-hosted box, one process is the point.
"""
from __future__ import annotations

import json
import mimetypes
from html import escape
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponse, HttpResponseNotFound, HttpResponseRedirect

# Windows' registry can hand back odd types; pin the ones that matter.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("image/svg+xml", ".svg")

FRONTEND_DIR: Path = settings.FRONTEND_DIR

# Development-only routes. `/gallery` is the component bench — every primitive in
# both themes and both directions. It is useful while building and has no place
# on a customer-facing box, so the server that hands out the export refuses it
# outside DEBUG. Gating here rather than at build time means the rule holds
# whatever happens to be sitting in web/out.
DEV_ONLY_PREFIXES = ("gallery",)


def _is_dev_only(rel: str) -> bool:
    head = rel.strip("/").split("/", 1)[0]
    return head in DEV_ONLY_PREFIXES


def _resolve(rel: str) -> Path | None:
    # One shell for every public landing page; the client reads the real slug.
    if rel.startswith("r/") and rel.strip("/") != "r/_":
        return FRONTEND_DIR / "r" / "_" / "index.html"

    candidate = (FRONTEND_DIR / rel).resolve()
    try:
        candidate.relative_to(FRONTEND_DIR.resolve())
    except ValueError:
        return None  # path traversal attempt

    if candidate.is_file():
        return candidate
    if (candidate / "index.html").is_file():
        return candidate / "index.html"
    html = FRONTEND_DIR / f"{rel.rstrip('/')}.html"
    if html.is_file():
        return html
    return None


# Staff screens are no search result.
PRIVATE_PREFIXES = ("/pos/", "/manager/", "/kitchen/", "/catalog/", "/deliveries/", "/login/", "/api/", "/admin/")


def _published(slug: str | None = None):
    from apps.profiles.models import RestaurantProfile

    published = RestaurantProfile.objects.filter(landing_page_enabled=True)
    return published.filter(slug=slug).first() if slug else published.order_by("created_at").first()


def _robots(request) -> HttpResponse:
    lines = ["User-agent: *", "Allow: /"]
    lines += [f"Disallow: {prefix}" for prefix in PRIVATE_PREFIXES]
    lines.append(f"Sitemap: {request.build_absolute_uri('/sitemap.xml')}")
    return HttpResponse("\n".join(lines) + "\n", content_type="text/plain; charset=utf-8")


def _sitemap(request) -> HttpResponse:
    from apps.profiles.models import RestaurantProfile

    urls = [request.build_absolute_uri("/")]
    for slug in RestaurantProfile.objects.filter(landing_page_enabled=True).order_by("created_at").values_list("slug", flat=True):
        urls.append(request.build_absolute_uri(f"/r/{slug}/"))
    body = "".join(f"<url><loc>{escape(url)}</loc></url>" for url in urls)
    return HttpResponse(
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>',
        content_type="application/xml; charset=utf-8",
    )


def _with_restaurant(request, html: str, profile) -> str:
    """The published restaurant in the page's head, for link previews and search.

    The name arrived only from the API, after the page ran: a link shared on
    WhatsApp previewed as «اوردراك» with no description (review F13).
    """
    name = escape(profile.name_ar)
    description = escape(profile.description_ar or profile.name_ar)
    url = escape(request.build_absolute_uri(request.path))
    tags = [
        f"<title>{name}</title>",
        f'<meta name="description" content="{description}"/>',
        f'<meta property="og:title" content="{name}"/>',
        f'<meta property="og:description" content="{description}"/>',
        '<meta property="og:type" content="restaurant"/>',
        f'<meta property="og:url" content="{url}"/>',
        '<meta property="og:locale" content="ar_AR"/>',
        f'<link rel="canonical" href="{url}"/>',
    ]
    if profile.hero_image:
        image = escape(request.build_absolute_uri(profile.hero_image.url))
        tags.append(f'<meta property="og:image" content="{image}"/>')
    data = {"@context": "https://schema.org", "@type": "Restaurant", "name": profile.name_ar, "url": request.build_absolute_uri(request.path)}
    if profile.phone:
        data["telephone"] = profile.phone
    if profile.address_ar:
        data["address"] = profile.address_ar
    if profile.description_ar:
        data["description"] = profile.description_ar
    # "<" escaped so no value can close the script element.
    ld = json.dumps(data, ensure_ascii=False, indent=1).replace("<", "\\u003c")
    tags.append(f'<script type="application/ld+json">{ld}</script>')
    start, end = html.find("<title>"), html.find("</title>")
    if start == -1 or end == -1:
        return html.replace("</head>", "".join(tags) + "</head>", 1)
    return html[:start] + "".join(tags) + html[end + len("</title>"):]


def _is_page_load(request) -> bool:
    """A browser loading an address as a page, not a script fetching it.

    Fetch metadata says so where the browser sends it; otherwise a request that
    is not the router's (no ``RSC`` header) and accepts HTML is a page load.
    """
    dest = request.headers.get("Sec-Fetch-Dest")
    if dest:
        return dest == "document"
    return "RSC" not in request.headers and "text/html" in request.headers.get("Accept", "")


def spa(request, path: str = ""):
    if not FRONTEND_DIR.exists():
        return HttpResponse(
            "Frontend is not built. Run `npm run build` in web/ to produce web/out.",
            status=503,
            content_type="text/plain; charset=utf-8",
        )

    rel = path.strip("/")

    # The router fetches a screen's payload to move to it; a tab still on the
    # build before a deploy cannot use it and loads its address as a page,
    # which showed raw router data (batch 41). Send that load to the screen.
    if (rel == "index.txt" or rel.endswith("/index.txt")) and _is_page_load(request):
        return HttpResponseRedirect("/" + rel[: -len("index.txt")])

    # Off in production, and indistinguishable from a route that never existed.
    if _is_dev_only(rel) and not settings.DEBUG:
        notfound = FRONTEND_DIR / "404.html"
        body = notfound.read_bytes() if notfound.is_file() else b"Not found"
        return HttpResponseNotFound(body)

    if rel == "robots.txt":
        return _robots(request)
    if rel == "sitemap.xml":
        return _sitemap(request)

    target = _resolve(rel)

    # The public page: the root, or a restaurant's own /r/<slug>/.
    public_slug = None
    parts = rel.split("/")
    if rel in ("", "index.html"):
        public_slug = ""
    elif len(parts) >= 2 and parts[0] == "r" and parts[1] not in ("", "_"):
        public_slug = parts[1]
    if target is not None and public_slug is not None and target.suffix == ".html":
        profile = _published(public_slug or None)
        if profile is not None:
            html = _with_restaurant(request, target.read_text(encoding="utf-8"), profile)
            return HttpResponse(html, content_type="text/html; charset=utf-8")

    if target is None:
        notfound = FRONTEND_DIR / "404.html"
        body = notfound.read_bytes() if notfound.is_file() else b"Not found"
        return HttpResponseNotFound(body)

    content_type, _ = mimetypes.guess_type(str(target))
    response = FileResponse(target.open("rb"), content_type=content_type or "application/octet-stream")

    if rel == "pos-sw.js":
        # Let a worker served from the root claim the /pos/ scope.
        response["Service-Worker-Allowed"] = "/pos/"
        response["Cache-Control"] = "no-cache"
    return response
