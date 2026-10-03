'use client';

/**
 * The public landing page — a real restaurant's website, not a dashboard.
 *
 * Client-rendered on the static export: it reads the slug from the URL and
 * fetches the published profile and menu from the same-origin public API, which
 * is the one source of truth the till and the kitchen also read. Everything on
 * the page is real data — the restaurant's name, description, photos, live menu
 * with prices and availability, the featured shelf the manager curates, and the
 * contact details — never invented.
 *
 * Arabic-first and RTL, Mobile-first, theme-aware through the design tokens.
 * When the restaurant takes orders from the page, "order now" leads to the menu
 * and its cart; when it does not, to the WhatsApp and phone links.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Clock,
  Leaf,
  MapPin,
  Phone,
  ShoppingBag,
  Sparkles,
  Truck,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react';

import { formatMoney, t } from '@/i18n';
import { CartProvider, useCart } from './OrderFlow';

const LOCALE = 'ar' as const;
const NUMERALS = 'arabic-indic' as const;
const label = (key: Parameters<typeof t>[0]) => t(key, LOCALE);
const money = (minor: string) => formatMoney(BigInt(minor), NUMERALS);

interface LandingItem {
  id: string;
  category_id: string;
  name_ar: string;
  description_ar: string;
  price_minor: string;
  is_available: boolean;
  is_featured: boolean;
  image_url: string | null;
}
interface LandingCategory {
  id: string;
  name_ar: string;
  items: LandingItem[];
}
interface Landing {
  name_ar: string;
  description_ar: string;
  address_ar: string;
  phone: string;
  whatsapp: string;
  map_url: string;
  hours: { day_ar?: string; open?: string; close?: string }[];
  photos: { url?: string }[];
  /** The manager's own branding. Either may be null; the page copes with both. */
  logo_url: string | null;
  hero_image_url: string | null;
  /** Which restaurant this page is; sent back with each order. */
  slug?: string;
  /** Whether the page takes delivery orders; the menu is public either way. */
  online_ordering_enabled?: boolean;
  menu: LandingCategory[];
  featured: LandingItem[];
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: Landing };

const WHY = [
  { icon: Award, title: 'landing.why.qualityTitle', desc: 'landing.why.qualityDesc' },
  { icon: Leaf, title: 'landing.why.freshTitle', desc: 'landing.why.freshDesc' },
  { icon: Zap, title: 'landing.why.fastTitle', desc: 'landing.why.fastDesc' },
  { icon: Truck, title: 'landing.why.deliveryTitle', desc: 'landing.why.deliveryDesc' },
  { icon: Wallet, title: 'landing.why.priceTitle', desc: 'landing.why.priceDesc' },
  { icon: Sparkles, title: 'landing.why.serviceTitle', desc: 'landing.why.serviceDesc' },
] as const;

export function LandingClient() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const slug = segments[0] === 'r' ? segments[1] : undefined;
    if (slug === '_') {
      setState({ status: 'error' });
      return;
    }
    const endpoint = slug ? `/api/v1/public/${slug}/` : '/api/v1/public/';
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('not found');
        const data = (await response.json()) as Landing;
        if (!cancelled) setState({ status: 'ok', data });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <LandingSkeleton />;
  if (state.status === 'error') {
    return (
      <main dir="rtl" lang="ar" className="flex min-h-screen items-center justify-center bg-bg text-text">
        <span className="text-ar-base text-text-muted">{label('landing.unavailable')}</span>
      </main>
    );
  }
  return <Landing data={state.data} />;
}

function Landing({ data }: { data: Landing }) {
  // What the manager chose comes first. The old fallbacks stay behind it, so a
  // restaurant that has not uploaded a cover still gets a photograph rather than
  // an empty band — and one that has gets exactly the image it picked.
  const heroImage =
    data.hero_image_url ??
    data.photos?.[0]?.url ??
    data.featured.find((i) => i.image_url)?.image_url ??
    null;
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  // "Order now" goes where ordering actually happens: the menu and its cart
  // when the page takes orders, the WhatsApp and phone section when it does not.
  const ordering = data.online_ordering_enabled === true;

  return (
    <CartProvider ordering={data.online_ordering_enabled === true} slug={data.slug}>
      <main dir="rtl" lang="ar" className="min-h-screen bg-bg text-text">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-12 px-16 py-10 sm:px-24">
          <span className="flex items-center gap-8 text-ar-lg font-bold">
            {/* The uploaded logo, or the generic mark when there is none. The
                name stays either way — a logo is decoration, the name is the
                thing a visitor needs to read. */}
            {data.logo_url ? (
              <img
                src={data.logo_url}
                alt={data.name_ar}
                className="h-32 w-32 rounded-md object-contain"
              />
            ) : (
              <Utensils size={22} className="text-accent" />
            )}
            {data.name_ar}
          </span>
          <button
            type="button"
            onClick={() => scrollTo(ordering ? 'menu' : 'order')}
            className="inline-flex min-h-control-md items-center gap-6 rounded-full bg-accent px-16 text-ar-sm font-semibold text-text-on-accent transition hover:opacity-90"
          >
            <ShoppingBag size={16} />
            {label('landing.orderNow')}
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[68vh] items-end overflow-hidden">
        {heroImage ? (
          <img src={heroImage} alt={data.name_ar} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-surface-2 to-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        <div className="relative mx-auto w-full max-w-6xl px-16 pb-40 pt-56 sm:px-24">
          <div className="flex max-w-2xl flex-col gap-16 text-white">
            <h1 className="text-ar-3xl font-bold leading-tight sm:text-[2.75rem]">{data.name_ar}</h1>
            {data.description_ar ? (
              <p className="max-w-xl text-ar-lg text-white/85">{data.description_ar}</p>
            ) : (
              <p className="max-w-xl text-ar-lg text-white/85">{label('landing.orderCtaSubtitle')}</p>
            )}
            <div className="flex flex-wrap gap-12 pt-4">
              <button
                type="button"
                onClick={() => scrollTo(ordering ? 'menu' : 'order')}
                className="inline-flex min-h-control-xl items-center gap-8 rounded-full bg-accent px-24 text-ar-md font-semibold text-text-on-accent shadow-lg transition hover:opacity-90"
              >
                <ShoppingBag size={20} />
                {label('landing.orderNow')}
              </button>
              <button
                type="button"
                onClick={() => scrollTo('menu')}
                className="inline-flex min-h-control-xl items-center gap-8 rounded-full border border-white/70 bg-white/10 px-24 text-ar-md font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                <Utensils size={20} />
                {label('landing.browseMenu')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Featured shelf */}
      {data.featured.length ? (
        <Section title={label('landing.featured')} icon={<Sparkles size={22} className="text-accent" />}>
          <div className="-mx-4 flex snap-x snap-mandatory gap-14 overflow-x-auto px-4 pb-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {data.featured.map((item) => (
              <div key={item.id} className="snap-start">
                <FeaturedCard item={item} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Dynamic menu with category filter */}
      <MenuSection menu={data.menu} />

      {/* Why us */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-16 py-40 sm:px-24">
          <SectionHeading title={label('landing.whyUs')} />
          <div className="mt-24 grid grid-cols-1 gap-14 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col gap-10 rounded-xl border border-line bg-bg p-20">
                <span className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-accent-tint text-accent">
                  <Icon size={24} />
                </span>
                <span className="text-ar-lg font-semibold">{label(title)}</span>
                <span className="text-ar-base text-text-muted">{label(desc)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Order CTA + contact */}
      <section id="order" className="scroll-mt-header border-t border-line">
        <div className="mx-auto max-w-6xl px-16 py-40 sm:px-24">
          <div className="flex flex-col items-center gap-16 rounded-2xl bg-gradient-to-br from-accent/15 to-surface-2 p-24 text-center sm:p-40">
            <h2 className="max-w-2xl text-ar-2xl font-bold sm:text-ar-3xl">{label('landing.orderCtaTitle')}</h2>
            <p className="max-w-xl text-ar-base text-text-muted">{label('landing.orderCtaSubtitle')}</p>
            <div className="flex flex-wrap justify-center gap-12">
              {data.whatsapp ? (
                <a
                  href={`https://wa.me/${data.whatsapp.replace(/[^\d]/g, '')}`}
                  className="inline-flex min-h-control-xl items-center gap-8 rounded-full bg-accent px-24 text-ar-md font-semibold text-text-on-accent shadow-md transition hover:opacity-90"
                >
                  <ShoppingBag size={20} />
                  {label('landing.whatsapp')}
                </a>
              ) : null}
              {data.phone ? (
                <a
                  href={`tel:${data.phone}`}
                  className="inline-flex min-h-control-xl items-center gap-8 rounded-full border border-strong border-accent px-24 text-ar-md font-semibold text-accent transition hover:bg-accent-tint"
                >
                  <Phone size={20} />
                  {label('landing.call')}
                </a>
              ) : null}
            </div>
          </div>

          {/* Restaurant info */}
          <div className="mt-28 grid grid-cols-1 gap-16 md:grid-cols-2">
            {data.description_ar ? (
              <div className="flex flex-col gap-8 rounded-xl border border-line bg-surface p-20">
                <h3 className="text-ar-lg font-semibold">{label('landing.aboutUs')}</h3>
                <p className="text-ar-base text-text-muted">{data.description_ar}</p>
                {data.address_ar ? (
                  <span className="mt-4 flex items-center gap-8 text-ar-sm text-text-muted">
                    <MapPin size={16} className="text-accent" />
                    {data.address_ar}
                  </span>
                ) : null}
                {data.map_url ? (
                  <a href={data.map_url} className="text-ar-sm font-medium text-accent">
                    {label('landing.location')}
                  </a>
                ) : null}
              </div>
            ) : null}

            {data.hours?.length ? (
              <div className="flex flex-col gap-10 rounded-xl border border-line bg-surface p-20">
                <h3 className="flex items-center gap-8 text-ar-lg font-semibold">
                  <Clock size={18} className="text-accent" />
                  {label('landing.hours')}
                </h3>
                {data.hours.map((row, index) => (
                  <div key={index} className="flex justify-between text-ar-base text-text-muted">
                    <span>{row.day_ar}</span>
                    <span className="numeric text-text" dir="ltr">
                      {row.open} – {row.close}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

        <Footer data={data} onNavigate={(id) => scrollTo(id === 'order' && ordering ? 'menu' : id)} />
      </main>
    </CartProvider>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl px-16 py-32 sm:px-24">
        <SectionHeading title={title} icon={icon} />
        <div className="mt-18">{children}</div>
      </div>
    </section>
  );
}

function SectionHeading({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-10">
      {icon}
      <h2 className="text-ar-2xl font-bold">{title}</h2>
    </div>
  );
}

function MenuSection({ menu }: { menu: LandingCategory[] }) {
  const cart = useCart();
  const [activeId, setActiveId] = useState<string | null>(null);

  const allItems = useMemo(() => menu.flatMap((c) => c.items), [menu]);
  const shown = activeId ? menu.find((c) => c.id === activeId)?.items ?? [] : allItems;

  return (
    <section id="menu" className="scroll-mt-header border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-16 py-40 sm:px-24">
        <SectionHeading title={label('landing.ourMenu')} icon={<Utensils size={22} className="text-accent" />} />
        {cart.ordering ? null : (
          <p role="note" className="mt-16 rounded-lg border border-line bg-surface-2 px-16 py-12 text-ar-base text-text-muted">
            {label('landing.orderingClosed')}
          </p>
        )}

        {/* Dynamic filter — the "All" chip plus one per category from the API. */}
        <div className="sticky top-header z-30 -mx-16 mt-16 flex gap-8 overflow-x-auto bg-surface/90 px-16 py-10 backdrop-blur sm:-mx-24 sm:px-24">
          <Chip label={label('landing.all')} active={activeId === null} onClick={() => setActiveId(null)} />
          {menu.map((c) => (
            <Chip key={c.id} label={c.name_ar} active={activeId === c.id} onClick={() => setActiveId(c.id)} />
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="mt-24 text-ar-base text-text-muted">{label('landing.menuEmpty')}</p>
        ) : (
          <div className="mt-18 grid grid-cols-1 gap-14 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Chip({ label: text, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'min-h-control-md flex-none rounded-full bg-accent px-18 text-ar-sm font-semibold text-text-on-accent'
          : 'min-h-control-md flex-none rounded-full border border-line bg-bg px-18 text-ar-sm text-text-muted transition hover:border-accent'
      }
    >
      {text}
    </button>
  );
}

function ItemImage({ item, className }: { item: LandingItem; className?: string }) {
  if (item.image_url) {
    return <img src={item.image_url} alt={item.name_ar} className={`h-full w-full object-cover ${className ?? ''}`} />;
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-tint to-surface-2 ${className ?? ''}`}>
      <Utensils size={30} className="text-accent/60" />
    </div>
  );
}

function ItemCard({ item }: { item: LandingItem }) {
  const cart = useCart();
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-line bg-bg shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-44 overflow-hidden">
        <ItemImage item={item} className="transition duration-300 group-hover:scale-105" />
        {!item.is_available ? (
          <span className="absolute end-8 top-8 rounded-full bg-black/70 px-10 py-2 text-ar-xs font-medium text-white">
            {label('landing.soldOut')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-8 p-14">
        <div className="flex items-start justify-between gap-8">
          <h3 className="text-ar-base font-semibold">{item.name_ar}</h3>
          <span className="numeric flex-none text-num-base font-bold text-accent">{money(item.price_minor)}</span>
        </div>
        {item.description_ar ? (
          <p className="line-clamp-2 text-ar-sm text-text-muted">{item.description_ar}</p>
        ) : null}
        {cart.ordering ? (
          <button
            type="button"
            onClick={() => cart.add(item)}
            disabled={!item.is_available}
            className="mt-auto inline-flex min-h-control-md items-center justify-center gap-6 rounded-lg bg-accent-tint text-ar-sm font-semibold text-accent transition hover:bg-accent hover:text-text-on-accent disabled:opacity-40"
          >
            <ShoppingBag size={16} />
            {label('landing.add')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function FeaturedCard({ item }: { item: LandingItem }) {
  const cart = useCart();
  return (
    <article className="group flex w-[15rem] flex-none flex-col overflow-hidden rounded-xl border border-line bg-bg shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:w-[16.5rem]">
      <div className="relative h-[10rem] overflow-hidden">
        <ItemImage item={item} className="transition duration-300 group-hover:scale-105" />
        {/* A "most-ordered" ribbon marks the shelf's cards at a glance. */}
        <span className="absolute end-10 top-10 inline-flex items-center gap-4 rounded-full bg-accent px-10 py-3 text-ar-xs font-semibold text-text-on-accent shadow">
          <Sparkles size={13} />
          {label('landing.featured')}
        </span>
        {!item.is_available ? (
          <span className="absolute start-10 top-10 rounded-full bg-black/70 px-10 py-2 text-ar-xs font-medium text-white">
            {label('landing.soldOut')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-6 p-14">
        <h3 className="truncate text-ar-lg font-semibold">{item.name_ar}</h3>
        {item.description_ar ? (
          <p className="line-clamp-1 text-ar-sm text-text-muted">{item.description_ar}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-8 pt-4">
          <span className="numeric text-num-lg font-bold text-accent">{money(item.price_minor)}</span>
          {cart.ordering ? (
            <button
              type="button"
              onClick={() => cart.add(item)}
              disabled={!item.is_available}
              aria-label={label('landing.add')}
              className="inline-flex min-h-control-md items-center justify-center gap-6 rounded-full bg-accent px-16 text-ar-sm font-semibold text-text-on-accent transition hover:opacity-90 disabled:opacity-40"
            >
              <ShoppingBag size={16} />
              {label('landing.add')}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Footer({ data, onNavigate }: { data: Landing; onNavigate: (id: string) => void }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-surface-2">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-24 px-16 py-32 sm:grid-cols-3 sm:px-24">
        <div className="flex flex-col gap-8">
          <span className="flex items-center gap-8 text-ar-lg font-bold">
            <Utensils size={20} className="text-accent" />
            {data.name_ar}
          </span>
          <p className="text-ar-sm text-text-muted">{data.description_ar || label('landing.footerAbout')}</p>
        </div>

        <div className="flex flex-col gap-8">
          <span className="text-ar-md font-semibold">{label('landing.footerLinks')}</span>
          <button type="button" onClick={() => onNavigate('menu')} className="text-start text-ar-sm text-text-muted hover:text-accent">
            {label('landing.ourMenu')}
          </button>
          <button type="button" onClick={() => onNavigate('order')} className="text-start text-ar-sm text-text-muted hover:text-accent">
            {label('landing.orderNow')}
          </button>
        </div>

        <div className="flex flex-col gap-8">
          <span className="text-ar-md font-semibold">{label('landing.footerContact')}</span>
          {data.phone ? (
            <a href={`tel:${data.phone}`} className="flex items-center gap-8 text-ar-sm text-text-muted hover:text-accent">
              <Phone size={15} />
              <span className="numeric" dir="ltr">{data.phone}</span>
            </a>
          ) : null}
          {data.address_ar ? (
            <span className="flex items-center gap-8 text-ar-sm text-text-muted">
              <MapPin size={15} />
              {data.address_ar}
            </span>
          ) : null}
        </div>
      </div>
      <div className="border-t border-line py-12 text-center text-ar-xs text-text-muted">
        © <span className="numeric" dir="ltr">{year}</span> {data.name_ar} · {label('landing.footerRights')}
      </div>
    </footer>
  );
}

function LandingSkeleton() {
  return (
    <main dir="rtl" lang="ar" className="min-h-screen bg-bg">
      <div className="h-[68vh] animate-pulse bg-surface-2" />
      <div className="mx-auto max-w-6xl px-16 py-32 sm:px-24">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        <div className="mt-18 grid grid-cols-1 gap-14 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
    </main>
  );
}
