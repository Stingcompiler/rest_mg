'use client';

/**
 * The restaurant profile editor — the source the future public landing page
 * will render from. Everything the page needs is already stored server-side;
 * this is where it's edited. The publish toggle flips `landing_page_enabled`;
 * accepting orders from the page is a separate toggle, `online_ordering_enabled`.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Plus, Trash2 } from 'lucide-react';

import { Button, EmptyState, ErrorState, ImageSlot, LoadingList, TextField, Toggle } from '@/components';
import { describeError } from '@/lib/describeError';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { WEEK_ORDER, dayName, type HoursRow } from '@/lib/hours';
import { IMAGE_ACCEPT, checkImageFile, imageProblemKey, isRefusedImage } from '@/lib/images';
import { ManagerShell } from './ManagerShell';
import { useBranding, useProfile, useUpdateProfile } from './hooks';
import type { RestaurantProfile } from './api';
import { hoursProblem, toSavedHours } from './hoursForm';

export function ProfileScreen() {
  const i18n = useI18n();
  const profile = useProfile();
  const first = profile.data?.[0];

  return (
    <ManagerShell title={i18n.t('manager.profile.title')} description={i18n.t('manager.profile.pageDescription')}>
      {profile.isLoading ? (
        <LoadingList rows={5} rowClassName="h-control-xl" />
      ) : profile.isError || !first ? (
        <ErrorState
          title={i18n.t('common.loadFailed')}
          detail={i18n.t(describeError(profile.error))}
          retryLabel={i18n.t('common.retry')}
          onRetry={() => void profile.refetch()}
          icon={<AlertTriangle size={30} />}
        />
      ) : (
        <ProfileForm profile={first} />
      )}
    </ManagerShell>
  );
}

function ProfileForm({ profile }: { profile: RestaurantProfile }) {
  const i18n = useI18n();
  const update = useUpdateProfile();
  const [form, setForm] = useState(profile);

  useEffect(() => setForm(profile), [profile]);

  const field = <K extends keyof RestaurantProfile>(key: K, value: RestaurantProfile[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  // A row the page could not read stops the save, and says why (batch 23).
  const hoursError = hoursProblem(form.hours);

  const save = () => {
    update.mutate({
      id: profile.id,
      patch: {
        // The server validates the whole profile body, id included; without it
        // every save from this screen was refused.
        id: profile.id,
        slug: form.slug,
        name_ar: form.name_ar,
        name_en: form.name_en,
        description_ar: form.description_ar,
        address_ar: form.address_ar,
        phone: form.phone,
        whatsapp: form.whatsapp,
        hours: toSavedHours(form.hours),
        landing_page_enabled: form.landing_page_enabled,
        // Always sent: the server treats a missing flag as off.
        online_ordering_enabled: form.online_ordering_enabled,
      },
    });
  };

  return (
    <div className="flex max-w-2xl flex-col gap-16">
      <BrandingSection profile={profile} />

      <Labelled label={i18n.t('manager.profile.name')}>
        <TextField value={form.name_ar} onChange={(event) => field('name_ar', event.target.value)} />
      </Labelled>
      <Labelled label={i18n.t('manager.profile.description')}>
        <TextField value={form.description_ar} onChange={(event) => field('description_ar', event.target.value)} />
      </Labelled>
      <Labelled label={i18n.t('manager.profile.address')}>
        <TextField value={form.address_ar} onChange={(event) => field('address_ar', event.target.value)} />
      </Labelled>
      <div className="grid grid-cols-1 gap-16 sm:grid-cols-2">
        <Labelled label={i18n.t('manager.profile.phone')}>
          <TextField value={form.phone} onChange={(event) => field('phone', event.target.value)} />
        </Labelled>
        <Labelled label={i18n.t('manager.profile.whatsapp')}>
          <TextField value={form.whatsapp} onChange={(event) => field('whatsapp', event.target.value)} />
        </Labelled>
      </div>

      <HoursEditor rows={form.hours} onChange={(rows) => field('hours', rows)} error={hoursError} />

      <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-16">
        <span className="text-ar-base font-medium">{i18n.t('manager.profile.landingEnabled')}</span>
        <Toggle
          checked={form.landing_page_enabled}
          onChange={(next) => field('landing_page_enabled', next)}
          label={i18n.t('manager.profile.landingEnabled')}
        />
      </div>

      <div className="flex items-center justify-between gap-14 rounded-lg border border-line bg-surface p-16">
        <div className="flex flex-col gap-4">
          <span className="text-ar-base font-medium">{i18n.t('manager.profile.orderingEnabled')}</span>
          <span className="text-ar-sm text-text-muted">
            {i18n.t(
              !form.landing_page_enabled
                ? 'manager.profile.orderingNeedsPage'
                : form.online_ordering_enabled
                  ? 'manager.profile.orderingHintOn'
                  : 'manager.profile.orderingHintOff',
            )}
          </span>
        </div>
        <Toggle
          checked={form.online_ordering_enabled}
          onChange={(next) => field('online_ordering_enabled', next)}
          label={i18n.t('manager.profile.orderingEnabled')}
          disabled={!form.landing_page_enabled}
        />
      </div>

      <div className="flex items-center gap-14">
        <Button variant="primary" onClick={save} disabled={update.isPending || hoursError !== null}>
          {i18n.t('manager.profile.save')}
        </Button>
        {update.isSuccess ? <span className="text-ar-sm text-success">{i18n.t('manager.profile.saved')}</span> : null}
        {update.isError ? (
          <span role="status" className="text-ar-sm text-danger">{i18n.t('manager.profile.saveFailed')}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The opening hours, a row per span: the days it covers, when it opens and
 * when it closes. No screen edited them before (batch 23). A late night closes
 * after midnight (18:00 to 02:00); a split day is two rows on the same day.
 */
function HoursEditor({
  rows,
  onChange,
  error,
}: {
  rows: HoursRow[];
  onChange: (rows: HoursRow[]) => void;
  error: ReturnType<typeof hoursProblem>;
}) {
  const i18n = useI18n();
  const change = (index: number, patch: Partial<HoursRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <section className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-16">
      <div className="flex flex-col gap-4">
        <span className="text-ar-md font-medium">{i18n.t('manager.hours.title')}</span>
        <span className="text-ar-sm text-text-muted">{i18n.t('manager.hours.hint')}</span>
      </div>

      {rows.map((row, index) => {
        const days = row.days ?? [];
        return (
          <div key={index} className="flex flex-col gap-10 rounded-md border border-line p-12">
            {Array.isArray(row.days) ? null : (
              <span className="text-ar-sm text-warning">{i18n.t('manager.hours.legacy', { label: row.day_ar ?? '' })}</span>
            )}
            <div role="group" aria-label={i18n.t('manager.hours.days')} className="flex flex-wrap gap-6">
              {WEEK_ORDER.map((day) => {
                const on = days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => change(index, { days: on ? days.filter((d) => d !== day) : [...days, day] })}
                    className={cn(
                      'min-h-control-sm rounded-md border px-10 text-ar-sm transition',
                      on ? 'border-accent bg-accent text-text-on-accent' : 'border-line bg-surface-2 text-text-muted hover:text-text',
                    )}
                  >
                    {dayName(day, i18n.locale)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-12">
              <Labelled label={i18n.t('manager.hours.open')}>
                <TextField type="time" dir="ltr" value={row.open ?? ''} onChange={(event) => change(index, { open: event.target.value })} />
              </Labelled>
              <Labelled label={i18n.t('manager.hours.close')}>
                <TextField type="time" dir="ltr" value={row.close ?? ''} onChange={(event) => change(index, { close: event.target.value })} />
              </Labelled>
              <Button variant="danger" onClick={() => onChange(rows.filter((_, at) => at !== index))}>
                <span className="flex items-center gap-6">
                  <Trash2 size={16} />
                  {i18n.t('manager.hours.remove')}
                </span>
              </Button>
            </div>
          </div>
        );
      })}

      <div>
        <Button variant="secondary" onClick={() => onChange([...rows, { days: [], open: '08:00', close: '23:00' }])}>
          <span className="flex items-center gap-6">
            <Plus size={16} />
            {i18n.t('manager.hours.add')}
          </span>
        </Button>
      </div>

      {error ? (
        <span role="status" aria-live="polite" className="text-ar-sm text-danger">
          {i18n.t(error)}
        </span>
      ) : null}
    </section>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-6">
      <span className="text-ar-sm text-text-muted">{label}</span>
      {children}
    </label>
  );
}

/**
 * The two images the landing page is built around.
 *
 * Kept apart from the text form and saved on their own, because a file upload
 * is not a field: it succeeds or fails by itself, and a manager replacing a
 * logo should not have to press "save" on the whole profile — nor lose an
 * unsaved description because they picked a picture.
 */
function BrandingSection({ profile }: { profile: RestaurantProfile }) {
  const i18n = useI18n();
  const branding = useBranding();
  const [error, setError] = useState<string | null>(null);

  const send = (change: Parameters<typeof branding.mutate>[0]['change']) => {
    setError(null);
    branding.mutate({ id: profile.id, change });
  };

  const pick = (file: File | undefined, slot: 'logo' | 'heroImage') => {
    if (!file) return;
    // Checked here so the manager is told immediately, rather than waiting for
    // a round trip to be refused. The server still decides.
    const problem = checkImageFile(file);
    if (problem) {
      setError(i18n.t(imageProblemKey(problem)));
      return;
    }
    send(slot === 'logo' ? { logo: file } : { heroImage: file });
  };

  return (
    <section className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-16">
      <span className="text-ar-md font-medium">{i18n.t('manager.profile.branding')}</span>

      <div className="grid grid-cols-1 gap-16 sm:grid-cols-[1fr_1.6fr]">
        <ImageField
          label={i18n.t('manager.profile.logo')}
          hint={i18n.t('manager.profile.logoHint')}
          src={profile.logo_url}
          placeholder={i18n.t('manager.profile.noLogo')}
          frameClass="size-preview"
          busy={branding.isPending}
          onPick={(file) => pick(file, 'logo')}
          onClear={profile.logo_url ? () => send({ clearLogo: true }) : undefined}
        />
        <ImageField
          label={i18n.t('manager.profile.hero')}
          hint={i18n.t('manager.profile.heroHint')}
          src={profile.hero_image_url}
          placeholder={i18n.t('manager.profile.noHero')}
          frameClass="h-preview w-full"
          busy={branding.isPending}
          onPick={(file) => pick(file, 'heroImage')}
          onClear={profile.hero_image_url ? () => send({ clearHeroImage: true }) : undefined}
        />
      </div>

      {error ? (
        <span role="status" aria-live="polite" className="text-ar-sm text-danger">
          {error}
        </span>
      ) : null}
      {branding.isError && !error ? (
        <span role="status" className="text-ar-sm text-danger">
          {i18n.t(isRefusedImage(branding.error) ? 'common.imageRefused' : 'common.retry')}
        </span>
      ) : null}
    </section>
  );
}

function ImageField({
  label,
  hint,
  src,
  placeholder,
  frameClass,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  src: string | null;
  placeholder: string;
  frameClass: string;
  busy: boolean;
  onPick: (file: File | undefined) => void;
  onClear?: () => void;
}) {
  const i18n = useI18n();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-8">
      <span className="text-ar-sm text-text-muted">{label}</span>
      <div className={frameClass}>
        <ImageSlot src={src ?? undefined} alt={label} placeholder={placeholder} />
      </div>
      <span className="text-ar-xs text-text-muted">{hint}</span>
      <div className="flex flex-wrap items-center gap-8">
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            onPick(event.target.files?.[0]);
            // Cleared so picking the same file twice still fires a change.
            event.target.value = '';
          }}
        />
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
          <span className="flex items-center gap-6">
            <ImagePlus size={16} />
            {busy
              ? i18n.t('manager.profile.uploading')
              : i18n.t(src ? 'manager.profile.replace' : 'manager.profile.choose')}
          </span>
        </Button>
        {onClear ? (
          <Button variant="danger" onClick={onClear} disabled={busy}>
            <span className="flex items-center gap-6">
              <Trash2 size={16} />
              {i18n.t('manager.profile.removeImage')}
            </span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
