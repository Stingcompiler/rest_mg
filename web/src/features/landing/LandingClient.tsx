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
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Clock,
  Leaf,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  Sparkles,
  Truck,
  Utensils,
  Wallet,
  X,
  Zap,
} from 'lucide-react';

import { formatInteger, formatMoney, t } from '@/i18n';
import { Ornament } from '@/components/primitives/indicators';
import { IconButton } from '@/components/primitives/controls';
import { scrollBehavior } from '@/lib/motion';
import { browserStorage } from './browserStorage';
import { forgetOrder, recallOrder, type PlacedOrder } from './lastOrder';
import { CartProvider, ORDER_PLACED_EVENT, useCart } from './OrderFlow';
import { activeSection } from './menuSpy';
import { pageLoadFailure, type PageLoadFailure } from './pageLoad';
import { FINISHED_STATUSES, customerStatusKey } from './statusText';

const LOCALE = 'ar' as const;
const NUMERALS = 'arabic-indic' as const;
const label = (key: Parameters<typeof t>[0], params?: Record<string, string | number>) => t(key, LOCALE, params);
const money = (minor: string) => formatMoney(BigInt(minor), NUMERALS);
const int = (n: number) => formatInteger(n, NUMERALS);

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
  // Glides, unless the visitor asked the system for less motion (batch 18).
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior() });
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
      <TopBar data={data} ordering={ordering} onOrder={() => scrollTo(ordering ? 'menu' : 'order')} />

      <OrderStatus slug={data.slug ?? '_'} />

      {/* Hero. Shorter on a phone, and shorter still without a photo: an empty
          ink block two thirds of the screen tall kept every dish below the
          first screen (batch 19). */}
      <section
        className={`relative flex items-end overflow-hidden ${
          heroImage ? 'min-h-[52vh] sm:min-h-[68vh]' : 'min-h-[36vh] sm:min-h-[44vh]'
        }`}
      >
        {heroImage ? (
          <img src={heroImage} alt={data.name_ar} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-ink" />
        )}
        {/* Ink, not black: the overlay is part of the palette (batch 13). */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/10" />
        <div className="relative mx-auto w-full max-w-6xl px-16 pb-32 pt-40 sm:px-24 sm:pb-40 sm:pt-56">
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
              {/* With ordering on, "order now" already leads to the menu, and
                  a second button to the same place was noise (batch 19). */}
              {ordering ? null : (
                <button
                  type="button"
                  onClick={() => scrollTo('menu')}
                  className="inline-flex min-h-control-xl items-center gap-8 rounded-md border border-gold-soft bg-ink/30 px-24 text-ar-md font-semibold text-on-ink backdrop-blur transition hover:bg-ink/60"
                >
                  <Utensils size={20} />
                  {label('landing.browseMenu')}
                </button>
              )}
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
                  <Icon size={22} />
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

/**
 * The sticky top bar. The name stays on one line, cut short if it must; the
 * order button shrinks to its icon on a phone, where the name and the button
 * each used to break onto two lines (batch 19). Once there is something in the
 * cart the button counts it and opens it.
 */
function TopBar({ data, ordering, onOrder }: { data: Landing; ordering: boolean; onOrder: () => void }) {
  const cart = useCart();
  const hasCart = ordering && cart.count > 0;
  const text = hasCart ? label('landing.cart.view') : label('landing.orderNow');
  return (
    <header className="sticky top-0 z-40 border-b border-gold-soft bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-header max-w-6xl items-center justify-between gap-12 px-16 sm:px-24">
        <span className="flex min-w-0 items-center gap-8 font-display text-ar-lg font-semibold sm:text-ar-xl">
          {/* The uploaded logo, or the generic mark when there is none. The
              name stays either way — a logo is decoration, the name is the
              thing a visitor needs to read. */}
          {data.logo_url ? (
            <img src={data.logo_url} alt="" className="size-logo flex-none rounded-md object-contain" />
          ) : (
            <Utensils size={22} className="flex-none text-gold" />
          )}
          <span className="min-w-0 truncate">{data.name_ar}</span>
        </span>
        <button
          type="button"
          onClick={() => (hasCart ? cart.open() : onOrder())}
          aria-label={hasCart ? `${text}: ${int(cart.count)}` : text}
          className="relative inline-flex min-h-control-md min-w-control-md flex-none items-center justify-center gap-6 rounded-md bg-accent px-12 text-ar-sm font-semibold text-text-on-accent transition hover:bg-accent-hover sm:px-16"
        >
          <ShoppingBag size={18} />
          <span className="sr-only sm:not-sr-only">{text}</span>
          {hasCart ? (
            <span className="absolute -end-4 -top-4 flex min-w-badge items-center justify-center rounded-full bg-gold-soft px-4 text-num-xs text-ink">
              {int(cart.count)}
            </span>
          ) : null}
        </button>
      </div>
    </header>
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
 * A section title: large, in the display face, aligned to the start like the
 * text under it. The gold rule that followed every title (batch 13) now marks
 * the hero alone, and a short emerald bar opens the title instead (batch 18).
 */
function SectionHeading({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-start gap-10">
      <span aria-hidden="true" className="h-4 w-thumb-sm rounded-full bg-accent" />
      <h2 className="font-display text-ar-3xl font-semibold">{title}</h2>
    </div>
  );
}

const sectionId = (id: string) => `menu-${id}`;

/**
 * The menu: one list with a title per category, and a sticky bar that jumps
 * to a category and marks the one being read. The bar used to filter the menu
 * to one category, which hid the rest of it from anyone scrolling (batch 19).
 */
function MenuSection({ menu }: { menu: LandingCategory[] }) {
  const cart = useCart();
  const categories = useMemo(() => menu.filter((category) => category.items.length > 0), [menu]);
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (bar.current?.getBoundingClientRect().bottom ?? 0) + 8;
      const tops = categories.map((category) => ({
        id: category.id,
        top: document.getElementById(sectionId(category.id))?.getBoundingClientRect().top ?? Infinity,
      }));
      setActiveId(activeSection(tops, line));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [categories]);

  // Keep the marked chip in view inside the bar as the visitor scrolls. The
  // bar scrolls sideways and nothing else does: scrollIntoView on the chip
  // also scrolled the page, and dragged it down to the menu on load.
  useEffect(() => {
    const nav = bar.current;
    const chip = activeId ? nav?.querySelector<HTMLElement>(`[data-category="${activeId}"]`) : null;
    if (!nav || !chip) return;
    const outer = nav.getBoundingClientRect();
    const inner = chip.getBoundingClientRect();
    if (inner.left >= outer.left && inner.right <= outer.right) return;
    const delta = inner.left + inner.width / 2 - (outer.left + outer.width / 2);
    nav.scrollBy({ left: delta, behavior: scrollBehavior() });
  }, [activeId]);

  const jump = (id: string) => {
    setActiveId(id);
    document.getElementById(sectionId(id))?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  };

  return (
    <section id="menu" className="scroll-mt-header border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-16 py-40 sm:px-24 sm:py-56">
        <SectionHeading title={label('landing.ourMenu')} />
        {cart.ordering ? null : (
          <p role="note" className="mt-16 rounded-lg border border-line bg-surface-2 px-16 py-12 text-ar-base text-text-muted">
            {label('landing.orderingClosed')}
          </p>
        )}

        {categories.length === 0 ? (
          <p className="mt-24 text-ar-base text-text-muted">{label('landing.menuEmpty')}</p>
        ) : (
          <>
            {/* No scrollbar: on a phone it drew a grey line across the first
                dish (batch 19). */}
            <nav
              ref={bar}
              aria-label={label('landing.ourMenu')}
              className="sticky top-header z-30 -mx-16 mt-24 flex gap-8 overflow-x-auto bg-surface/90 px-16 py-10 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-24 sm:px-24"
            >
              {categories.map((category) => {
                const active = activeId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    data-category={category.id}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => jump(category.id)}
                    className={
                      active
                        ? 'min-h-control-md flex-none rounded-md bg-ink px-18 text-ar-sm font-semibold text-on-ink'
                        : 'min-h-control-md flex-none rounded-md border border-line bg-surface px-18 text-ar-sm text-text-muted transition hover:border-gold-soft hover:text-text'
                    }
                  >
                    {category.name_ar}
                  </button>
                );
              })}
            </nav>

            {categories.map((category) => (
              <div key={category.id} id={sectionId(category.id)} className="scroll-mt-menu pt-28">
                <h3 className="font-display text-ar-xl font-semibold">{category.name_ar}</h3>
                <div className="mt-8 grid grid-cols-1 sm:mt-16 sm:grid-cols-2 sm:gap-18 lg:grid-cols-3">
                  {category.items.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * A dish's photo, or nothing. A box with a fork icon stood in for every
 * missing photo, so a menu without photos looked unfinished (batch 19).
 */
function DishPhoto({ item, className }: { item: LandingItem; className?: string }) {
  if (!item.image_url) return null;
  return (
    <div className={`relative flex-none overflow-hidden bg-surface-2 ${className ?? ''}`}>
      <img
        src={item.image_url}
        alt={item.name_ar}
        loading="lazy"
        className="h-full w-full object-cover transition duration-slow group-hover:scale-105"
      />
    </div>
  );
}

/** A price, in gold, with its currency: "١٧٬٢٥٠" alone left the visitor to guess. */
function Price({ minor, size = 'md' }: { minor: string; size?: 'md' | 'lg' }) {
  return (
    <span className="flex-none">
      <span className={`numeric font-semibold text-gold ${size === 'lg' ? 'text-num-lg' : 'text-num-md'}`}>
        {money(minor)}
      </span>{' '}
      <span className="text-ar-xs text-text-muted">{label('landing.currency')}</span>
    </span>
  );
}

function SoldOut() {
  return (
    <span className="flex-none rounded-sm bg-ink px-8 py-2 text-ar-xs font-medium text-on-ink">
      {label('landing.soldOut')}
    </span>
  );
}

/**
 * A round "+" that turns into a counter in place once the dish is in the cart,
 * as delivery apps do. "أضف" spanned the card, never said how many were added,
 * and opened the whole cart on every tap (batch 19).
 */
function AddControl({ item }: { item: LandingItem }) {
  const cart = useCart();
  const qty = cart.lines.find((line) => line.item.id === item.id)?.qty ?? 0;
  if (qty === 0) {
    return (
      <IconButton
        variant="solid"
        label={label('landing.addItem', { name: item.name_ar })}
        onClick={() => cart.add(item)}
        disabled={!item.is_available}
        className="rounded-full"
      >
        <Plus size={20} />
      </IconButton>
    );
  }
  return (
    <div className="flex flex-none items-center rounded-full border border-accent">
      <IconButton
        variant="accent"
        label={label('pos.cart.qtyLess', { name: item.name_ar })}
        onClick={() => cart.setQty(item.id, qty - 1)}
        className="rounded-full"
      >
        <Minus size={18} />
      </IconButton>
      <span className="numeric min-w-icon-lg text-center text-num-base font-semibold text-accent" aria-live="polite">
        {int(qty)}
      </span>
      <IconButton
        variant="accent"
        label={label('pos.cart.qtyMore', { name: item.name_ar })}
        onClick={() => cart.add(item)}
        className="rounded-full"
      >
        <Plus size={18} />
      </IconButton>
    </div>
  );
}

function ItemCard({ item }: { item: LandingItem }) {
  const cart = useCart();
  return (
    // A row on a phone, text first and the photo beside it, divided by a
    // hairline; a card from 640px up (batch 19).
    <article className="group flex flex-row gap-12 border-b border-line py-16 sm:flex-col sm:gap-0 sm:overflow-hidden sm:rounded-md sm:border sm:bg-bg sm:py-0 sm:shadow-card sm:transition sm:hover:shadow-raised">
      <DishPhoto item={item} className="order-last size-row-image rounded-md sm:order-first sm:h-card-image sm:w-full sm:rounded-none" />
      <div className="flex min-w-0 flex-1 flex-col gap-6 sm:p-18">
        <div className="flex items-start justify-between gap-8">
          {/* Under its category's h3 (batch 19). */}
          <h4 className="text-ar-md font-semibold">{item.name_ar}</h4>
          {item.is_available ? null : <SoldOut />}
        </div>
        {item.description_ar ? (
          <p className="line-clamp-2 text-ar-sm text-text-muted">{item.description_ar}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-8 pt-4">
          <Price minor={item.price_minor} />
          {cart.ordering ? <AddControl item={item} /> : null}
        </div>
      </div>
    </article>
  );
}

function FeaturedCard({ item }: { item: LandingItem }) {
  const cart = useCart();
  return (
    <article className="group flex h-full w-[15rem] flex-none flex-col overflow-hidden rounded-md border border-line bg-surface shadow-card transition hover:shadow-raised sm:w-[16.5rem]">
      <DishPhoto item={item} className="h-[10rem]" />
      <div className="flex flex-1 flex-col gap-6 p-18">
        <div className="flex items-center justify-between gap-8">
          {/* The featured mark: gold on ink. */}
          <span className="inline-flex items-center gap-4 rounded-sm bg-ink px-10 py-2 text-ar-xs font-semibold text-gold-soft">
            <Sparkles size={13} />
            {label('landing.featured')}
          </span>
          {item.is_available ? null : <SoldOut />}
        </div>
        <h3 className="truncate font-display text-ar-lg font-semibold">{item.name_ar}</h3>
        {item.description_ar ? (
          <p className="line-clamp-1 text-ar-sm text-text-muted">{item.description_ar}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-8 pt-4">
          <Price minor={item.price_minor} size="lg" />
          {cart.ordering ? <AddControl item={item} /> : null}
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
            <div key={i} className="h-card-skeleton animate-pulse rounded-md bg-surface-2" />
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
