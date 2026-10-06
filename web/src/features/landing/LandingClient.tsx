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
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Clock,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';

import { TIME_ZONE, formatInteger, formatMoney, t } from '@/i18n';
import { dayName, openState, type HoursRow } from '@/lib/hours';
import { Ornament } from '@/components/primitives/indicators';
import { IconButton } from '@/components/primitives/controls';
import { cn } from '@/lib/cn';
import { prefersReducedMotion, scrollBehavior } from '@/lib/motion';
import { useModalDialog } from '@/lib/useModalDialog';
import { browserStorage } from './browserStorage';
import { forgetOrder, recallOrder, type PlacedOrder } from './lastOrder';
import { CartProvider, ORDER_PLACED_EVENT, useCart } from './OrderFlow';
import { activeSection, readingLine } from './menuSpy';
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
  /** `days` since batch 23 (0 = Sunday … 6 = Saturday). */
  hours: HoursRow[];
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
          heroImage ? 'min-h-[52vh] sm:min-h-[68vh] lg:min-h-[80vh]' : 'min-h-[36vh] sm:min-h-[44vh] lg:min-h-[62vh]'
        }`}
      >
        {heroImage ? (
          // A slow drift on the photo, so the hero is never a still (batch 28).
          <img src={heroImage} alt={data.name_ar} className="absolute inset-0 h-full w-full animate-kenburns object-cover" />
        ) : (
          // Without a photo: embers glowing over ink, for a grill (batch 28).
          <div className="absolute inset-0 ember animate-ember" />
        )}
        {/* Ink, not black: the overlay is part of the palette (batch 13). */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/10" />
        <div className="relative mx-auto w-full max-w-6xl px-16 pb-32 pt-40 sm:px-24 sm:pb-40 sm:pt-56">
          <div className="flex max-w-2xl flex-col gap-16 text-on-ink">
            <h1 className="font-display text-ar-4xl font-semibold leading-normal sm:text-display-xl"><HeroWords text={data.name_ar} /></h1>
            <Ornament align="start" />
            <OpenBadge data={data} />
            {data.description_ar ? (
              <p className="max-w-xl animate-rise text-ar-lg text-on-ink-muted" style={{ animationDelay: '360ms' }}>
                {data.description_ar}
              </p>
            ) : (
              <p className="max-w-xl animate-rise text-ar-lg text-on-ink-muted" style={{ animationDelay: '360ms' }}>
                {label('landing.orderCtaSubtitle')}
              </p>
            )}
            <div className="flex animate-rise flex-wrap gap-12 pt-4" style={{ animationDelay: '480ms' }}>
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
        {/* "There is more below": a cue that bobs at the hero's foot. */}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-12 mx-auto hidden w-fit animate-bob text-on-ink-muted sm:block">
          <ChevronDown size={26} />
        </span>
      </section>

      {/* The dishes in motion, a band of names under the hero (batch 28). */}
      <DishMarquee menu={data.menu} />


      {/* What a visitor looks for, from the restaurant itself: under the hero
          on a large screen, after the menu on a phone (batch 20). */}
      <InfoBand data={data} ordering={ordering} className="hidden lg:block" />

      {/* Featured shelf */}
      {data.featured.length ? (
        <Section title={label('landing.featured')}>
          <div className="-mx-4 flex snap-x snap-mandatory gap-14 overflow-x-auto px-4 pb-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {data.featured.map((item, index) => (
              <Reveal key={item.id} delay={index * 90} className="snap-start">
                <FeaturedCard item={item} />
              </Reveal>
            ))}
          </div>
        </Section>
      ) : null}

      {/* The menu, with its category bar */}
      <MenuSection menu={data.menu} />

      <InfoBand data={data} ordering={ordering} className="lg:hidden" />

      {/* Order CTA + contact */}
      <section id="order" className="scroll-mt-header border-t border-line">
        <div className="mx-auto max-w-6xl px-16 py-40 sm:px-24">
          <div className="ember flex animate-ember flex-col items-center gap-16 rounded-md p-24 text-center text-on-ink sm:p-40">
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
        </div>
      </section>

        <Footer data={data} onNavigate={(id) => scrollTo(id === 'order' && ordering ? 'menu' : id)} />
      </main>
    </CartProvider>
  );
}

/**
 * "مفتوح الآن · يغلق 23:00", or when it next opens, on the restaurant's clock
 * (batch 23). Nothing when the hours have no days to read. Checked again every
 * minute, so a page left open turns over at closing time.
 */
function OpenBadge({ data }: { data: Landing }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const state = openState(data.hours, now, TIME_ZONE);
  if (!state) return null;
  const detail = state.open
    ? label('landing.open.closes', { time: state.closes })
    : state.when === 'today'
      ? label('landing.closed.opensToday', { time: state.opens })
      : state.when === 'tomorrow'
        ? label('landing.closed.opensTomorrow', { time: state.opens })
        : label('landing.closed.opensOn', { day: dayName(state.when, 'ar'), time: state.opens });
  return (
    <span className="inline-flex w-fit items-center gap-8 rounded-full border border-gold-soft bg-ink/40 px-12 py-4 text-ar-sm text-on-ink backdrop-blur">
      <span aria-hidden="true" className={`size-dot rounded-full ${state.open ? 'bg-success' : 'bg-warning'}`} />
      <span className="font-semibold">{label(state.open ? 'landing.open.now' : 'landing.closed.now')}</span>
      <span className="text-on-ink-muted">· {detail}</span>
    </span>
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
  // Ink over the hero, ivory once the page scrolls: the bar reads what is
  // under it (batch 28).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b backdrop-blur transition-colors duration-base',
        scrolled ? 'border-gold-soft bg-surface/90 text-text' : 'border-ink-2 bg-ink text-on-ink',
      )}
    >
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
          className={cn(
            'relative inline-flex min-h-control-md min-w-control-md flex-none items-center justify-center gap-6 rounded-md px-12 text-ar-sm font-semibold transition sm:px-16',
            scrolled ? 'bg-accent text-text-on-accent hover:bg-accent-hover' : 'bg-on-ink text-ink hover:bg-surface-2',
          )}
        >
          <ShoppingBag size={18} />
          <span className="sr-only sm:not-sr-only">{text}</span>
          {hasCart ? (
            <span
              key={cart.count}
              className="absolute -end-4 -top-4 flex min-w-badge animate-pop items-center justify-center rounded-full bg-gold-soft px-4 text-num-xs text-ink"
            >
              {int(cart.count)}
            </span>
          ) : null}
        </button>
      </div>
    </header>
  );
}

/**
 * The restaurant's name, a word at a time (batch 28). Each word is its own
 * box so it can rise into place; the spaces stay between the boxes, where an
 * inline-block would swallow them.
 */
function HeroWords({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, index) => (
        <span key={index}>
          <span className="inline-block animate-rise" style={{ animationDelay: `${index * 110}ms` }}>
            {word}
          </span>
          {index < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </>
  );
}

/**
 * The dish names running past under the hero (batch 28), the way praised
 * restaurant sites keep their page moving. Two copies side by side, so when
 * the first has moved its own width the second is where it began and the
 * loop has no seam. Decoration only: hidden from screen readers, which have
 * the menu itself; paused under a pointer; stopped under "reduce motion".
 */
function DishMarquee({ menu }: { menu: LandingCategory[] }) {
  const names = menu.flatMap((category) => category.items.map((item) => item.name_ar)).slice(0, 12);
  if (names.length < 3) return null;
  return (
    <div aria-hidden="true" className="overflow-hidden border-b border-ink-2 bg-ink py-10 text-on-ink sm:py-14">
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex flex-none items-center">
            {names.map((name, index) => (
              <span key={index} className="flex items-center gap-24 px-12 font-display text-ar-lg font-semibold sm:text-ar-xl">
                {name}
                <Sparkles size={16} className="text-gold-soft" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A block that rises into place the first time it enters the screen, then
 * stays (batch 28). Where the browser cannot watch, or the visitor asked for
 * less motion, it is simply there.
 */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn(shown ? 'animate-rise' : 'opacity-0', className)} style={shown ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
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
    <Reveal className="flex flex-col items-start gap-10">
      <span aria-hidden="true" className="h-4 w-thumb-sm rounded-full bg-accent" />
      <h2 className="font-display text-ar-3xl font-semibold">{title}</h2>
    </Reveal>
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
      const line = readingLine({
        wide: window.matchMedia('(min-width: 1024px)').matches,
        headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
        barBottom: bar.current?.getBoundingClientRect().bottom ?? 0,
      });
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
      <div className="mx-auto max-w-6xl px-16 pb-40 pt-24 sm:px-24 sm:py-56">
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
            {/* A bar under the top bar on a phone, a column beside the dishes
                from 1024px (batch 20). No scrollbar: on a phone it drew a grey
                line across the first dish (batch 19). */}
            <div className="lg:mt-32 lg:grid lg:grid-cols-menu-page lg:items-start lg:gap-32">
              <nav
                ref={bar}
                aria-label={label('landing.ourMenu')}
                className="sticky top-header z-30 -mx-16 mt-24 flex gap-8 overflow-x-auto bg-surface/90 px-16 py-10 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-24 sm:px-24 lg:flex-col lg:top-header-gap lg:mx-0 lg:mt-0 lg:gap-4 lg:overflow-visible lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
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
                          ? 'min-h-control-md flex-none rounded-md bg-ink px-18 text-ar-sm font-semibold text-on-ink lg:text-start'
                          : 'min-h-control-md flex-none rounded-md border border-line bg-surface px-18 text-ar-sm text-text-muted transition hover:border-gold-soft hover:text-text lg:border-transparent lg:bg-transparent lg:text-start'
                      }
                    >
                      {category.name_ar}
                    </button>
                  );
                })}
              </nav>

              <div>
                {categories.map((category) => (
                  <div
                    key={category.id}
                    id={sectionId(category.id)}
                    className="scroll-mt-menu pt-28 lg:scroll-mt-header-gap lg:pt-0 lg:[&:not(:first-child)]:pt-40"
                  >
                    <h3 className="font-display text-ar-xl font-semibold">{category.name_ar}</h3>
                    <div className="mt-8 grid grid-cols-1 sm:mt-16 sm:grid-cols-2 sm:gap-18 xl:grid-cols-3">
                      {category.items.map((item, index) => (
                        // A row at a time, the cards of a row a beat apart.
                        <Reveal key={item.id} delay={(index % 3) * 80} className="grid">
                          <ItemCard item={item} />
                        </Reveal>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
        {/* Re-mounted on every change, so it pops each time (batch 28). */}
        <span key={qty} className="inline-block animate-pop">
          {int(qty)}
        </span>
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
  const [open, setOpen] = useState(false);
  return (
    // A row on a phone, text first and the photo beside it, divided by a
    // hairline; a card from 640px up (batch 19). The whole dish opens its
    // details, through the name's button stretched over it; the "+" sits
    // above that stretch, so it still adds (batch 20).
    <article className="group relative flex flex-row gap-12 border-b border-line py-16 sm:flex-col sm:gap-0 sm:overflow-hidden sm:rounded-md sm:border sm:bg-bg sm:py-0 sm:shadow-card sm:transition sm:hover:shadow-raised">
      <DishPhoto item={item} className="order-last size-row-image rounded-md sm:order-first sm:h-card-image sm:w-full sm:rounded-none" />
      <div className="flex min-w-0 flex-1 flex-col gap-6 sm:p-18">
        <div className="flex items-start justify-between gap-8">
          {/* Under its category's h3 (batch 19). */}
          <h4 className="text-ar-md font-semibold">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-label={label('landing.dishDetails', { name: item.name_ar })}
              className="text-start after:absolute after:inset-0"
            >
              {item.name_ar}
            </button>
          </h4>
          {item.is_available ? null : <SoldOut />}
        </div>
        {item.description_ar ? (
          <p className="line-clamp-2 text-ar-sm text-text-muted">{item.description_ar}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-8 pt-4">
          <Price minor={item.price_minor} />
          <div className="relative z-10">{cart.ordering ? <AddControl item={item} /> : null}</div>
        </div>
      </div>
      {open ? <DishDetails item={item} onClose={() => setOpen(false)} /> : null}
    </article>
  );
}

/**
 * A dish on its own: the photo large, the whole description, the price and
 * the counter. Tapping a dish did nothing before (batch 20). A sheet from the
 * bottom on a phone, a centred dialog from 640px, like the cart.
 */
function DishDetails({ item, onClose }: { item: LandingItem; onClose: () => void }) {
  const cart = useCart();
  const dialog = useRef<HTMLDivElement>(null);
  useModalDialog(dialog, onClose);
  const titleId = `dish-${item.id}`;
  // On <body>, not inside the card: inside it, hovering the dialog was
  // hovering the card, and its photo zoomed.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir="rtl" lang="ar">
      <button type="button" tabIndex={-1} aria-label={label('landing.confirm.close')} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-xl border border-line bg-surface text-text sm:rounded-xl"
      >
        <DishPhoto item={item} className="h-dish-photo w-full" />
        <div className="flex flex-col gap-12 p-24">
          <div className="flex items-start justify-between gap-12">
            <h2 id={titleId} className="font-display text-ar-2xl font-semibold">
              {item.name_ar}
            </h2>
            <IconButton variant="quiet" label={label('landing.confirm.close')} onClick={onClose}>
              <X size={22} />
            </IconButton>
          </div>
          {item.is_available ? null : <SoldOut />}
          {item.description_ar ? <p className="text-ar-base text-text-muted">{item.description_ar}</p> : null}
          <div className="flex items-center justify-between gap-12 pt-8">
            <Price minor={item.price_minor} size="lg" />
            {cart.ordering ? <AddControl item={item} /> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The facts a visitor comes for, from the restaurant's own profile: when it is
 * open, how to order, and where it is. Six cards of stock copy ("جودة عالية")
 * stood here, and these facts sat in two boxes at the very bottom (batch 20).
 * A fact the restaurant has not filled in is left out; with none, nothing is
 * drawn.
 */
function InfoBand({ data, ordering, className }: { data: Landing; ordering: boolean; className: string }) {
  const hours = (data.hours ?? []).filter((row) => row.day_ar || row.open || row.close);
  if (!hours.length && !ordering && !data.address_ar) return null;
  return (
    <section aria-label={label('landing.info.title')} className={className}>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-18 px-16 py-24 sm:px-24 lg:grid-cols-3 lg:gap-24 lg:py-28">
          {hours.length ? (
            <Reveal>
              <Fact icon={<Clock size={20} />} title={label('landing.hours')}>
                {hours.map((row, index) => (
                  <span key={index} className="flex justify-between gap-12">
                    <span>{row.day_ar}</span>
                    <span className="numeric text-text" dir="ltr">
                      {row.open} – {row.close}
                    </span>
                  </span>
                ))}
              </Fact>
            </Reveal>
          ) : null}
          {ordering ? (
            <Reveal delay={90}>
              <Fact icon={<ShoppingBag size={20} />} title={label('landing.info.orderTitle')}>
                <span>{label('landing.info.orderBody')}</span>
              </Fact>
            </Reveal>
          ) : null}
          {data.address_ar ? (
            <Reveal delay={180}>
              <Fact icon={<MapPin size={20} />} title={label('landing.info.whereTitle')}>
                <span>{data.address_ar}</span>
                {data.map_url ? (
                  <a href={data.map_url} className="w-fit font-medium text-accent">
                    {label('landing.location')}
                  </a>
                ) : null}
              </Fact>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Fact({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-12">
      <span className="flex size-control-md flex-none items-center justify-center rounded-full border border-gold-soft text-gold">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4 text-ar-sm text-text-muted">
        <h3 className="text-ar-base font-semibold text-text">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function FeaturedCard({ item }: { item: LandingItem }) {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  return (
    <article className="group relative flex h-full w-[15rem] flex-none flex-col overflow-hidden rounded-md border border-line bg-surface shadow-card transition hover:shadow-raised sm:w-[16.5rem]">
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
        <h3 className="truncate font-display text-ar-lg font-semibold">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={label('landing.dishDetails', { name: item.name_ar })}
            className="text-start after:absolute after:inset-0"
          >
            {item.name_ar}
          </button>
        </h3>
        {item.description_ar ? (
          <p className="line-clamp-1 text-ar-sm text-text-muted">{item.description_ar}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-8 pt-4">
          <Price minor={item.price_minor} size="lg" />
          <div className="relative z-10">{cart.ordering ? <AddControl item={item} /> : null}</div>
        </div>
      </div>
      {open ? <DishDetails item={item} onClose={() => setOpen(false)} /> : null}
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
        {/* The product the page runs on, after the restaurant's own line. */}
        <span className="mt-4 block text-gold-soft">{label('landing.poweredBy')}</span>
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
