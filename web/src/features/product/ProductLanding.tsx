'use client';

/**
 * Orderak's own page, for the owner of a restaurant (batch 67).
 *
 * Type software, goal contact (Design Reference LANDING.md). The order is the
 * reference's: what it does and for whom, the product itself, a few tasks each
 * with a screenshot, how it goes, the price in one honest line, questions, and
 * the one action again. The look is the product's own: ivory, ink, emerald and
 * a little gold. Nothing moves; there is nothing to turn off.
 *
 * It is the home page (batch 68). A restaurant's own page is at /r/<slug>/;
 * the hero links to a real one as an example.
 */
import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { BrandMark } from '@/components';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { PRODUCT_CONTACT, PRODUCT_CONTENT } from './content';

const CONTAINER = 'mx-auto w-full max-w-6xl px-16 sm:px-24';
const SECTION = 'py-40 sm:py-56';

function Cta({ label, size = 'lg' }: { label: string; size?: 'md' | 'lg' }) {
  const i18n = useI18n();
  const href = `https://wa.me/${PRODUCT_CONTACT.whatsappNumber}?text=${encodeURIComponent(PRODUCT_CONTENT[i18n.locale].whatsappMessage)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md bg-accent font-semibold text-text-on-accent outline-none transition-colors hover:bg-accent-hover active:bg-accent-pressed',
        size === 'lg' ? 'min-h-control-xl px-24 text-ar-lg' : 'min-h-control-md px-16 text-ar-base',
      )}
    >
      {label}
    </a>
  );
}

/** The other two ways in, quieter than the button: a call, and the introduction site. */
function ContactAlt({ onInk = false }: { onInk?: boolean }) {
  const i18n = useI18n();
  const c = PRODUCT_CONTENT[i18n.locale];
  const link = cn(
    'inline-flex min-h-control-stepper items-center underline underline-offset-4',
    onInk ? 'text-on-ink hover:text-gold-soft' : 'text-accent hover:text-accent-hover',
  );
  return (
    <p className={cn('flex flex-wrap items-center gap-x-16 text-ar-base', onInk ? 'text-on-ink-muted' : 'text-text-muted')}>
      <span className="flex flex-wrap items-center gap-x-8">
        {c.contactAlt.call}
        <a href={`tel:+${PRODUCT_CONTACT.whatsappNumber}`} className={link}>
          <span className="numeric" dir="ltr">{PRODUCT_CONTACT.phoneLocal}</span>
        </a>
      </span>
      <a href={PRODUCT_CONTACT.site} target="_blank" rel="noopener noreferrer" className={link}>
        {c.contactAlt.site}
      </a>
    </p>
  );
}

function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-display text-ar-2xl font-semibold text-text sm:text-ar-3xl">
      {children}
    </h2>
  );
}

export function ProductLanding() {
  const i18n = useI18n();
  const c = PRODUCT_CONTENT[i18n.locale];
  const year = new Date().getFullYear();

  // A real restaurant page to show as an example, found from the server rather
  // than written in: the link is there only while one is published.
  const [exampleSlug, setExampleSlug] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/public/')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { slug?: string } | null) => {
        if (alive && data?.slug) setExampleSlug(data.slug);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div dir={i18n.dir} lang={i18n.locale} className="min-h-dvh bg-bg text-text">
      {/* Stuck to the top, the button with it: on a phone it is always in reach. */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg">
        <div className={cn(CONTAINER, 'flex min-h-control-2xl items-center justify-between gap-12')}>
          <BrandMark inline />
          <nav aria-label={c.cta} className="hidden items-center gap-24 text-ar-base text-text-muted md:flex">
            <a href="#features" className="hover:text-text">{c.nav.features}</a>
            <a href="#how" className="hover:text-text">{c.nav.how}</a>
            <a href="#faq" className="hover:text-text">{c.nav.faq}</a>
          </nav>
          <div className="flex items-center gap-8">
            <a href="/login/" className="inline-flex min-h-control-stepper items-center px-8 text-ar-sm text-text-muted outline-none hover:text-text">
              {c.nav.login}
            </a>
            <button
              type="button"
              onClick={() => i18n.setLocale(i18n.locale === 'ar' ? 'en' : 'ar')}
              className="inline-flex min-h-control-stepper items-center px-8 text-ar-sm text-text-muted outline-none hover:text-text"
            >
              {c.switchLabel}
            </button>
            <Cta label={c.ctaShort} size="md" />
          </div>
        </div>
      </header>

      <main>
        {/* What it does and for whom, the action, and the product itself. */}
        <section className={cn(CONTAINER, 'grid items-center gap-32 py-40 sm:py-56 lg:grid-cols-2')}>
          <div className="flex flex-col gap-20">
            <h1 className="font-display text-ar-3xl font-semibold leading-snug text-text sm:text-ar-4xl lg:text-display-xl">
              {c.hero.headline}
            </h1>
            <p className="max-w-xl text-ar-md text-text-muted sm:text-ar-lg">{c.hero.subhead}</p>
            <div className="flex flex-wrap items-center gap-16">
              <Cta label={c.cta} />
              {exampleSlug ? (
                <a href={`/r/${exampleSlug}/`} className="inline-flex min-h-control-stepper items-center text-ar-base text-accent underline underline-offset-4">
                  {c.hero.exampleLabel}
                </a>
              ) : null}
            </div>
            <ContactAlt />
          </div>
          <img
            src={c.hero.image}
            alt={c.hero.alt}
            width={c.hero.width}
            height={c.hero.height}
            fetchPriority="high"
            className="h-auto w-full rounded-lg border border-line shadow-raised"
          />
        </section>

        {/* Facts the product can be held to: the only evidence there is so far. */}
        <section aria-label={c.featuresTitle} className="border-y border-line bg-surface">
          <ul className={cn(CONTAINER, 'flex flex-wrap items-center justify-center gap-x-24 gap-y-8 py-16 text-ar-base text-text-muted')}>
            {c.facts.map((fact, index) => (
              <li key={fact} className="flex items-center gap-24">
                {index > 0 ? <span aria-hidden className="size-6 rotate-45 bg-gold-soft" /> : null}
                {fact}
              </li>
            ))}
          </ul>
        </section>

        <section id="features" className={cn(CONTAINER, SECTION)}>
          <SectionTitle>{c.featuresTitle}</SectionTitle>
          <div className="mt-32 flex flex-col gap-40 sm:gap-56">
            {c.features.map((feature, index) => (
              <article key={feature.id} className="grid items-center gap-24 lg:grid-cols-2 lg:gap-40">
                {/* Alternate sides by order, which holds in either direction. */}
                <div className={cn('flex flex-col gap-12', index % 2 === 1 && 'lg:order-2')}>
                  <h3 className="font-display text-ar-xl font-semibold text-text sm:text-ar-2xl">{feature.title}</h3>
                  <p className="max-w-lg text-ar-md text-text-muted">{feature.body}</p>
                </div>
                <img
                  src={feature.image}
                  alt={feature.alt}
                  width={feature.width}
                  height={feature.height}
                  loading="lazy"
                  decoding="async"
                  className={cn('h-auto w-full rounded-lg border border-line shadow-raised', index % 2 === 1 && 'lg:order-1')}
                />
              </article>
            ))}
          </div>
          <p className="mt-32 text-ar-sm text-text-muted">{c.shotsNote}</p>
        </section>

        <section id="how" className="border-y border-line bg-surface">
          <div className={cn(CONTAINER, SECTION)}>
            <SectionTitle>{c.howTitle}</SectionTitle>
            <ol className="mt-32 grid gap-24 sm:grid-cols-3">
              {c.steps.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-8 border-t border-line pt-16">
                  <span className="numeric font-display text-ar-3xl font-semibold text-gold">{i18n.int(index + 1)}</span>
                  <h3 className="text-ar-lg font-semibold text-text">{step.title}</h3>
                  <p className="text-ar-md text-text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The price, honestly: it depends, and the page says so. */}
        <section className={cn(CONTAINER, SECTION, 'flex flex-col items-start gap-16')}>
          <SectionTitle>{c.pricing.title}</SectionTitle>
          <p className="max-w-xl text-ar-md text-text-muted">{c.pricing.body}</p>
          <Cta label={c.cta} />
          <ContactAlt />
        </section>

        <section id="faq" className="border-t border-line bg-surface">
          <div className={cn(CONTAINER, SECTION)}>
            <SectionTitle>{c.faqTitle}</SectionTitle>
            <div className="mt-24 max-w-3xl">
              {c.faq.map((item) => (
                <details key={item.q} className="group border-b border-line">
                  <summary className="flex min-h-control-xl cursor-pointer list-none items-center justify-between gap-12 py-12 text-ar-lg font-medium text-text outline-none [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown size={20} aria-hidden className="flex-none text-text-muted group-open:rotate-180" />
                  </summary>
                  <p className="pb-16 text-ar-md text-text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-ink text-on-ink">
          <div className={cn(CONTAINER, SECTION, 'flex flex-col items-start gap-16')}>
            <h2 className="font-display text-ar-2xl font-semibold sm:text-ar-3xl">{c.closing.title}</h2>
            <p className="max-w-xl text-ar-md text-on-ink-muted">{c.closing.body}</p>
            <Cta label={c.cta} />
            <ContactAlt onInk />
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-2 bg-ink text-on-ink-muted">
        <div className={cn(CONTAINER, 'flex flex-col gap-12 py-24 text-ar-sm sm:flex-row sm:items-center sm:justify-between')}>
          <BrandMark inline onInk />
          <span className="flex flex-wrap items-center gap-x-16">
            <span>
              © <span className="numeric" dir="ltr">{year}</span> · {c.footer.rights}
            </span>
            <a
              href="https://stingdev.pro"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-control-stepper items-center text-gold-soft underline underline-offset-4 hover:text-on-ink"
            >
              {c.footer.poweredBy}
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
