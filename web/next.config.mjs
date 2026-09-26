// Dev-only routes are named `page.dev.tsx`, and `dev.tsx` counts as a page
// extension only while developing. In a production build the suffix means
// nothing, so `/gallery` (the component bench) is not a route at all: no HTML is
// exported for it, and since nothing imports its component tree any more, its
// JavaScript never enters a chunk either. Django refuses the path as well —
// belt and braces, because a stale `web/out` would otherwise still serve it.
const DEV_ONLY_EXTENSIONS = ['dev.tsx', 'dev.ts'];
const BASE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  pageExtensions:
    process.env.NODE_ENV === 'development'
      ? [...BASE_EXTENSIONS, ...DEV_ONLY_EXTENSIONS]
      : BASE_EXTENSIONS,

  // Monolith: the frontend is exported as a static SPA and served by Django on
  // one origin. Django can't run Node SSR, so there is no server rendering —
  // every route is client-rendered against the same-origin API. Response
  // headers (Cache-Control, Service-Worker-Allowed) move to Django, since
  // next.config headers() is not honoured by a static export.
  output: 'export',

  // Directory-style routes (out/pos/index.html, out/manager/login/index.html)
  // so Django maps a request path straight to a file.
  trailingSlash: true,

  // No Next image optimiser in an export — images are served as-is.
  images: { unoptimized: true },
};

export default nextConfig;
