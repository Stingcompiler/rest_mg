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
  X,
  Zap,
} from 'lucide-react';

import { formatMoney, t } from '@/i18n';
import { Ornament } from '@/components/primitives/indicators';
import { IconButton } from '@/components/primitives/controls';
import { browserStorage } from './browserStorage';
import { forgetOrder, recallOrder, type PlacedOrder } from './lastOrder';
import { CartProvider, ORDER_PLACED_EVENT, useCart } from './OrderFlow';
import { pageLoadFailure, type PageLoadFailure } from './pageLoad';
import { FINISHED_STATUSES, customerStatusKey } from './statusText';

const LOCALE = 'ar' as const;
const NUMERALS = 'arabic-indic' as const;
const label = (key: Parameters<typeof t>[0], params?: Record<string, string | number>) => t(key, LOCALE, params);
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

type State =
  | { status: 'loading' }
  | { status: 'error'; failure: PageLoadFailure }
  | { status: 'ok'; data: Landing };

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
      setState({ status: 'error', failure: 'not_enabled' });
      return;
    }
    const endpoint = slug ? `/api/v1/public/${slug}/` : '/api/v1/public/';
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) {
          if (!cancelled) setState({ status: 'error', failure: pageLoadFailure(response) });
          return;
        }
        const data = (await response.json()) as Landing;
        if (!cancelled) setState({ status: 'ok', data });
      } catch (error) {
        // A dropped line is not a page that is switched off (batch 14).
        if (!cancelled) setState({ status: 'error', failure: pageLoadFailure(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <LandingSkeleton />;
  if (state.status === 'error') {
    return (
      <main dir="rtl" lang="ar" className="flex min-h-screen flex-col items-center justify-center gap-16 bg-bg p-24 text-center text-text">
        <span className="max-w-md text-ar-base text-text-muted">
          {label(state.failure === 'retry' ? 'landing.loadRetry' : 'landing.unavailable')}
        </span>
        {state.failure === 'retry' ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-control-xl items-center justify-center rounded-md bg-accent px-24 text-ar-md font-semibold text-text-on-accent"
          >
            {label('common.retry')}
          </button>
        ) : null}
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
  const allItems = useMemo(() => data.menu.flatMap((category) => category.items), [data.menu]);

  // The tab and a shared link said "نقاط البيع", the app's own name (batch 14).
  useEffect(() => {
    document.title = data.name_ar;
    const description = document.querySelector('meta[name="description"]') ?? document.head.appendChild(document.createElement('meta'));
    description.setAttribute('name', 'description');
    description.setAttribute('content', data.description_ar || data.name_ar);
  }, [data.name_ar, data.description_ar]);

  return (
    <CartProvider
      ordering={data.online_ordering_enabled === true}
      slug={data.slug}
      menu={allItems}
      pickupAddress={data.address_ar || undefined}
    >
      <main dir="rtl" lang="ar" className="min-h-screen bg-bg text-text">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-40 border-b border-gold-soft bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-12 px-16 py-10 sm:px-24">
          <span className="flex items-center gap-8 font-display text-ar-xl font-semibold">
            {/* The uploaded logo, or the generic mark when there is none. The
                name stays either way — a logo is decoration, the name is the
                thing a visitor needs to read. */}
            {data.logo_url ? (
              <img
                src={data.logo_url}
                alt={data.name_ar}
                className="size-logo rounded-md object-contain"
              />
            ) : (
              <Utensils size={22} className="text-gold" />
            )}
            {data.name_ar}
          </span>
          <button
            type="button"
            onClick={() => scrollTo(ordering ? 'menu' : 'order')}
            className="inline-flex min-h-control-md items-center gap-6 rounded-md bg-accent px-16 text-ar-sm font-semibold text-text-on-accent transition hover:bg-accent-hover"
          >
            <ShoppingBag size={16} />
            {label('landing.orderNow')}
          </button>
        </div>
      </header>

      <OrderStatus slug={data.slug ?? '_'} />

      {/* Hero */}
      <section className="relative flex min-h-[68vh] items-end overflow-hidden">
        {heroImage ? (
          <img src={heroImage} alt={data.name_ar} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-ink" />
        )}
        {/* Ink, not black: the overlay is part of the palette (batch 13). */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/10" />
        <div className="relative mx-auto w-full max-w-6xl px-16 pb-40 pt-56 sm:px-24">
          <div className="flex max-w-2xl flex-col gap-16 text-on-ink">
            <h1 className="font-display text-ar-4xl font-semibold leading-normal sm:text-display-xl">{data.name_ar}</h1>
            <Ornament align="start" />
            {data.description_ar ? (
              <p className="max-w-xl text-ar-lg text-on-ink-muted">{data.description_ar}</p>
            ) : (
              <p className="max-w-xl text-ar-lg text-on-ink-muted">{label('landing.orderCtaSubtitle')}</p>
            )}
            <div className="flex flex-wrap gap-12 pt-4">
              <button
                type="button"
                onClick={() => scrollTo(ordering ? 'menu' : 'order')}
                className="inline-flex min-h-control-xl items-center gap-8 rounded-md bg-on-ink px-24 text-ar-md font-semibold text-ink shadow-raised transition hover:bg-surface-2"
              >
                <ShoppingBag size={20} />
                {label('landing.orderNow')}
              </button>
              <button
                type="button"
                onClick={() => scrollTo('menu')}
                className="inline-flex min-h-control-xl items-center gap-8 rounded-md border border-gold-soft bg-ink/30 px-24 text-ar-md font-semibold text-on-ink backdrop-blur transition hover:bg-ink/60"
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
        <Section title={label('landing.featured')}>
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
      <section className="bg-bg">
        <div className="mx-auto max-w-6xl px-16 py-56 sm:px-24">
          <SectionHeading title={label('landing.whyUs')} />
          <div className="mt-32 grid grid-cols-1 gap-14 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col items-center gap-10 rounded-md border border-line bg-surface p-24 text-center">
                {/* A thin gold ring, not a green blob (batch 13). */}
                <span className="flex size-control-xl items-center justify-center rounded-full border border-gold-soft text-gold">
                  <Icon size={22} strokeWidth={1.5} />
                </span>
                <span className="font-display text-ar-lg font-semibold">{label(title)}</span>
                <span className="text-ar-base text-text-muted">{label(desc)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Order CTA + contact */}
      <section id="order" className="scroll-mt-header border-t border-line">
        <div className="mx-auto max-w-6xl px-16 py-40 sm:px-24">
          <div className="flex flex-col items-center gap-16 rounded-md bg-ink p-24 text-center text-on-ink sm:p-40">
            <h2 className="max-w-2xl font-display text-ar-2xl font-semibold sm:text-ar-3xl">{label('landing.orderCtaTitle')}</h2>
            <Ornament />
            <p className="max-w-xl text-ar-base text-on-ink-muted">{label('landing.orderCtaSubtitle')}</p>
            <div className="flex flex-wrap justify-center gap-12">
              {data.whatsapp ? (
                <a
                  href={`https://wa.me/${data.whatsapp.replace(/[^\d]/g, '')}`}
                  className="inline-flex min-h-control-xl items-center gap-8 rounded-md bg-on-ink px-24 text-ar-md font-semibold text-ink shadow-raised transition hover:bg-surface-2"
                >
                  <ShoppingBag size={20} />
                  {label('landing.whatsapp')}
                </a>
              ) : null}
              {data.phone ? (
                <a
                  href={`tel:${data.phone}`}
                  className="inline-flex min-h-control-xl items-center gap-8 rounded-md border border-gold-soft px-24 text-ar-md font-semibold text-on-ink transition hover:bg-ink-2"
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
              <div className="flex flex-col gap-8 rounded-md border border-line bg-surface p-24">
                <h3 className="font-display text-ar-lg font-semibold">{label('landing.aboutUs')}</h3>
                <p className="text-ar-base text-text-muted">{data.description_ar}</p>
                {data.address_ar ? (
                  <span className="mt-4 flex items-center gap-8 text-ar-sm text-text-muted">
                    <MapPin size={16} className="text-gold" />
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
              <div className="flex flex-col gap-10 rounded-md border border-line bg-surface p-24">
                <h3 className="flex items-center gap-8 font-display text-ar-lg font-semibold">
                  <Clock size={18} className="text-gold" />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-16 py-56 sm:px-24">
        <SectionHeading title={title} />
        <div className="mt-32">{children}</div>
      </div>
    </section>
  );
}

/**
 * A section title: centred, in the display face, over the gold rule. Every
 * section used to open the same way, a green icon and a bold line, so the
 * page read as one long list (batch 13).
 */
function SectionHeading({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-12 text-center">
      <h2 className="font-display text-ar-3xl font-semibold">{title}</h2>
      <Ornament />
    </div>
  );
}

function MenuSection({ menu }: { menu: LandingCategory[] }) {
  const cart = useCart();
  const [activeId, setActiveId] = useState<string | null>(null);

  const allItems = useMemo(() => menu.flatMap((c) => c.items), [menu]);
  const shown = activeId ? menu.find((c) => c.id === activeId)?.items ?? [] : allItems;

  return (
    <section id="menu" className="scroll-mt-header border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-16 py-56 sm:px-24">
        <SectionHeading title={label('landing.ourMenu')} />
        {cart.ordering ? null : (
          <p role="note" className="mt-16 rounded-lg border border-line bg-surface-2 px-16 py-12 text-ar-base text-text-muted">
            {label('landing.orderingClosed')}
          </p>
        )}

        {/* Dynamic filter — the "All" chip plus one per category from the API. */}
        <div className="sticky top-header z-30 -mx-16 mt-24 flex gap-8 overflow-x-auto bg-surface/90 px-16 py-10 backdrop-blur sm:-mx-24 sm:justify-center sm:px-24">
          <Chip label={label('landing.all')} active={activeId === null} onClick={() => setActiveId(null)} />
          {menu.map((c) => (
            <Chip key={c.id} label={c.name_ar} active={activeId === c.id} onClick={() => setActiveId(c.id)} />
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="mt-24 text-ar-base text-text-muted">{label('landing.menuEmpty')}</p>
        ) : (
          <div className="mt-24 grid grid-cols-1 gap-18 sm:grid-cols-2 lg:grid-cols-3">
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
          ? 'min-h-control-md flex-none rounded-md bg-ink px-18 text-ar-sm font-semibold text-on-ink'
          : 'min-h-control-md flex-none rounded-md border border-line bg-surface px-18 text-ar-sm text-text-muted transition hover:border-gold-soft hover:text-text'
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
    <div className={`flex h-full w-full items-center justify-center bg-surface-2 ${className ?? ''}`}>
      <Utensils size={30} strokeWidth={1.25} className="text-gold" />
    </div>
  );
}

function ItemCard({ item }: { item: LandingItem }) {
  const cart = useCart();
  return (
    // Hairline, a little lift on hover, and the price in gold (batch 13).
    <article className="group flex flex-col overflow-hidden rounded-md border border-line bg-bg shadow-card transition hover:shadow-raised">
      <div className="relative h-card-image overflow-hidden">
        <ItemImage item={item} className="transition duration-500 group-hover:scale-105" />
        {!item.is_available ? (
          <span className="absolute end-8 top-8 rounded-sm bg-ink px-10 py-2 text-ar-xs font-medium text-on-ink">
            {label('landing.soldOut')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-8 p-18">
        <div className="flex items-baseline justify-between gap-8">
          <h3 className="text-ar-md font-semibold">{item.name_ar}</h3>
          <span className="numeric flex-none text-num-md font-semibold text-gold">{money(item.price_minor)}</span>
        </div>
        {item.description_ar ? (
          <p className="line-clamp-2 text-ar-sm text-text-muted">{item.description_ar}</p>
        ) : null}
        {cart.ordering ? (
          <button
            type="button"
            onClick={() => cart.add(item)}
            disabled={!item.is_available}
            className="mt-auto inline-flex min-h-control-md items-center justify-center gap-6 rounded-md border border-accent text-ar-sm font-semibold text-accent transition hover:bg-accent hover:text-text-on-accent disabled:opacity-40"
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
    <article className="group flex w-[15rem] flex-none flex-col overflow-hidden rounded-md border border-line bg-surface shadow-card transition hover:shadow-raised sm:w-[16.5rem]">
      <div className="relative h-[10rem] overflow-hidden">
        <ItemImage item={item} className="transition duration-500 group-hover:scale-105" />
        {/* The featured mark: gold on ink. */}
        <span className="absolute end-10 top-10 inline-flex items-center gap-4 rounded-sm bg-ink px-10 py-2 text-ar-xs font-semibold text-gold-soft shadow-card">
          <Sparkles size={13} />
          {label('landing.featured')}
        </span>
        {!item.is_available ? (
          <span className="absolute start-10 top-10 rounded-sm bg-ink px-10 py-2 text-ar-xs font-medium text-on-ink">
            {label('landing.soldOut')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-6 p-18">
        <h3 className="truncate font-display text-ar-lg font-semibold">{item.name_ar}</h3>
        {item.description_ar ? (
          <p className="line-clamp-1 text-ar-sm text-text-muted">{item.description_ar}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-8 pt-4">
          <span className="numeric text-num-lg font-semibold text-gold">{money(item.price_minor)}</span>
          {cart.ordering ? (
            <button
              type="button"
              onClick={() => cart.add(item)}
              disabled={!item.is_available}
              aria-label={label('landing.add')}
              className="inline-flex min-h-control-md items-center justify-center gap-6 rounded-md bg-accent px-16 text-ar-sm font-semibold text-text-on-accent transition hover:bg-accent-hover disabled:opacity-40"
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
    // The page closes on ink (batch 13).
    <footer className="bg-ink text-on-ink">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-24 px-16 py-40 sm:grid-cols-3 sm:px-24">
        <div className="flex flex-col gap-10">
          <span className="flex items-center gap-8 font-display text-ar-xl font-semibold">
            <Utensils size={20} className="text-gold-soft" />
            {data.name_ar}
          </span>
          <span aria-hidden="true" className="h-px w-thumb-sm bg-gold-soft" />
          <p className="text-ar-sm text-on-ink-muted">{data.description_ar || label('landing.footerAbout')}</p>
        </div>

        <div className="flex flex-col gap-8">
          <span className="font-display text-ar-md font-semibold">{label('landing.footerLinks')}</span>
          <button type="button" onClick={() => onNavigate('menu')} className="text-start text-ar-sm text-on-ink-muted hover:text-on-ink">
            {label('landing.ourMenu')}
          </button>
          <button type="button" onClick={() => onNavigate('order')} className="text-start text-ar-sm text-on-ink-muted hover:text-on-ink">
            {label('landing.orderNow')}
          </button>
        </div>

        <div className="flex flex-col gap-8">
          <span className="font-display text-ar-md font-semibold">{label('landing.footerContact')}</span>
          {data.phone ? (
            <a href={`tel:${data.phone}`} className="flex items-center gap-8 text-ar-sm text-on-ink-muted hover:text-on-ink">
              <Phone size={15} />
              <span className="numeric" dir="ltr">{data.phone}</span>
            </a>
          ) : null}
          {data.address_ar ? (
            <span className="flex items-center gap-8 text-ar-sm text-on-ink-muted">
              <MapPin size={15} />
              {data.address_ar}
            </span>
          ) : null}
        </div>
      </div>
      <div className="border-t border-ink-2 py-14 text-center text-ar-xs text-on-ink-muted">
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
        <div className="h-8 w-thumb-w animate-pulse rounded-xs bg-surface-2" />
        <div className="mt-18 grid grid-cols-1 gap-14 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-card-skeleton animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
    </main>
  );
}



/**
 * How the customer's last order stands, at the top of the page, for twelve
 * hours after placing it (batch 14). It asks the server every half minute
 * until the order is delivered or cancelled.
 */
function OrderStatus({ slug }: { slug: string }) {
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setOrder(recallOrder(browserStorage(), slug));
    read();
    window.addEventListener(ORDER_PLACED_EVENT, read);
    return () => window.removeEventListener(ORDER_PLACED_EVENT, read);
  }, [slug]);

  useEffect(() => {
    if (!order) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const response = await fetch(`/api/v1/public/order/${order.id}/`);
        const body = response.ok ? await response.json() : null;
        const next = typeof body?.delivery_status === 'string' ? body.delivery_status : 'unknown';
        if (stopped) return;
        setStatus(next);
        if (FINISHED_STATUSES.has(next)) return;
      } catch {
        if (!stopped) setStatus('unknown');
      }
      if (!stopped) timer = setTimeout(() => void check(), 30_000);
    };
    void check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [order]);

  if (!order) return null;
  const key = status ? customerStatusKey(status) : null;
  return (
    <div role="status" aria-live="polite" className="border-b border-gold-soft bg-ink text-on-ink">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-12 px-16 py-10 sm:px-24">
        <span className="flex flex-wrap items-baseline gap-x-10 gap-y-2">
          <span className="font-display text-ar-md font-semibold">{label('landing.status.title', { number: order.number })}</span>
          {key ? <span className="text-ar-sm text-on-ink-muted">{label(key)}</span> : null}
        </span>
        <IconButton
          variant="quiet"
          label={label('landing.status.dismiss')}
          className="text-on-ink-muted hover:bg-ink-2"
          onClick={() => {
            forgetOrder(browserStorage(), slug);
            setOrder(null);
          }}
        >
          <X size={20} />
        </IconButton>
      </div>
    </div>
  );
}
