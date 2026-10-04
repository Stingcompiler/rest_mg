'use client';

/**
 * Catalogue management — the single screen where the menu is built and kept.
 *
 * Shared by the manager and the cashier (the server's `IsCatalogEditor` gates
 * both). It edits the *structure* of the menu online — create and retire
 * categories and items, set price, availability, the featured flag, and upload a
 * photo — which is the authoritative source every other surface reads: the till,
 * the kitchen, and the public landing page. There is no second copy to keep in
 * step, so a change here is the change everywhere.
 *
 * Arabic-first and RTL like the rest, Mobile-first: the category list is a side
 * column on a wide screen and a horizontal strip on a phone, and the item editor
 * is a sheet that fills a small screen.
 */
import { useRef, useState } from 'react';
import { ArrowRight, ImageOff, Plus, Star, Pencil, Trash2, X } from 'lucide-react';

import { Button, EmptyState, ErrorState, IconButton, LoadingList, SettingsMenu, TextField, Toggle } from '@/components';
import { useModalDialog } from '@/lib/useModalDialog';
import { toMinor, fromMinor } from '@/db';
import { useI18n } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';
import { homeForRole } from '@/lib/http';
import { IMAGE_ACCEPT, checkImageFile, imageProblemKey, isRefusedImage } from '@/lib/images';
import {
  useCategories,
  useCreateCategory,
  useCreateItem,
  useDeactivateCategory,
  useItems,
  useRetireItem,
  useUpdateCategory,
  useUpdateItem,
  useUploadItemImage,
} from './hooks';
import type { Category, MenuItem } from './api';
import { describeError } from '@/lib/describeError';

export function CatalogScreen() {
  const i18n = useI18n();
  const auth = useAuth();
  const categories = useCategories();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | 'new' | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | 'new' | null>(null);

  const list = categories.data ?? [];
  const currentId = activeCategoryId ?? list[0]?.id ?? null;
  const items = useItems(currentId ?? undefined);

  const goHome = () => window.location.assign(homeForRole(auth.user?.role ?? 'cashier'));

  return (
    <div className="flex h-screen flex-col bg-bg text-text" dir={i18n.dir}>
      <header className="flex h-header flex-none items-center justify-between gap-12 border-b border-line bg-surface px-16 sm:px-20">
        <div className="flex min-w-0 items-center gap-12">
          <IconButton variant="quiet" label={i18n.t('catalog.back')} onClick={goHome}>
            <ArrowRight size={22} className="rtl:rotate-180" />
          </IconButton>
          <h1 className="truncate text-ar-lg font-semibold sm:text-ar-xl">{i18n.t('catalog.title')}</h1>
        </div>
        <SettingsMenu />
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Categories: a strip on the phone, a column on the tablet. */}
        <nav className="flex flex-none items-center gap-8 overflow-x-auto border-b border-line bg-bg-sunken p-14 md:w-denomination-panel md:flex-col md:items-stretch md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-e">
          {categories.isLoading ? (
            <span className="text-ar-sm text-text-muted">…</span>
          ) : (
            <>
              {list.map((category) => (
                <div key={category.id} className="flex flex-none items-center gap-4 md:flex-none">
                  <button
                    type="button"
                    onClick={() => setActiveCategoryId(category.id)}
                    className={
                      category.id === currentId
                        ? 'flex min-h-control-xl flex-none items-center whitespace-nowrap rounded-md bg-surface-2 px-14 text-ar-md font-medium text-text md:flex-1'
                        : 'flex min-h-control-xl flex-none items-center whitespace-nowrap rounded-md px-14 text-ar-md text-text-muted md:flex-1'
                    }
                  >
                    {category.name_ar}
                  </button>
                  <IconButton variant="quiet" label={i18n.t('catalog.editCategory')} onClick={() => setEditingCategory(category)}>
                    <Pencil size={18} />
                  </IconButton>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setEditingCategory('new')}
                className="flex min-h-control-xl flex-none items-center gap-6 whitespace-nowrap rounded-md border border-dashed border-line px-14 text-ar-sm text-accent md:justify-center"
              >
                <Plus size={16} />
                {i18n.t('catalog.addCategory')}
              </button>
            </>
          )}
        </nav>

        {/* Items of the selected category. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-none items-center justify-between gap-12 border-b border-line bg-surface px-16 py-12">
            <span className="text-ar-base text-text-muted">
              {list.find((c) => c.id === currentId)?.name_ar ?? ''}
            </span>
            <Button variant="primary" onClick={() => setEditingItem('new')} disabled={!currentId}>
              <span className="flex items-center gap-6">
                <Plus size={18} />
                {i18n.t('catalog.addItem')}
              </span>
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-16">
            {items.isLoading ? (
              <LoadingList rows={5} rowClassName="h-item-card" />
            ) : items.isError ? (
              <ErrorState
                title={i18n.t('common.loadFailed')}
                detail={i18n.t(describeError(items.error))}
                onRetry={() => void items.refetch()}
                retryLabel={i18n.t('common.retry')}
              />
            ) : (items.data ?? []).length === 0 ? (
              <EmptyState title={i18n.t('catalog.empty')} />
            ) : (
              <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 xl:grid-cols-3">
                {(items.data ?? []).map((item) => (
                  <ItemCard key={item.id} item={item} onEdit={() => setEditingItem(item)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editingItem ? (
        <ItemEditor
          item={editingItem === 'new' ? null : editingItem}
          categories={list}
          defaultCategoryId={currentId}
          onClose={() => setEditingItem(null)}
        />
      ) : null}

      {editingCategory ? (
        <CategoryEditor
          category={editingCategory === 'new' ? null : editingCategory}
          onClose={() => setEditingCategory(null)}
        />
      ) : null}
    </div>
  );
}

/** One item, with the two flags a cashier flips most — availability and
 *  featured — as live toggles, and edit/retire actions. */
function ItemCard({ item, onEdit }: { item: MenuItem; onEdit: () => void }) {
  const i18n = useI18n();
  const update = useUpdateItem();
  const retire = useRetireItem();
  const [confirming, setConfirming] = useState(false);

  const patch = (changes: Partial<Pick<MenuItem, 'is_available' | 'is_featured'>>) =>
    update.mutate({
      id: item.id,
      body: {
        category_id: item.category_id,
        name_ar: item.name_ar,
        name_en: item.name_en,
        description_ar: item.description_ar,
        price_minor: item.price_minor,
        is_available: changes.is_available ?? item.is_available,
        is_featured: changes.is_featured ?? item.is_featured,
      },
    });

  return (
    <div className="flex flex-col gap-10 rounded-lg border border-line bg-surface p-12">
      <div className="flex gap-12">
        <div className="flex size-thumb-sm flex-none items-center justify-center overflow-hidden rounded-md bg-surface-2">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name_ar} className="h-full w-full object-cover" />
          ) : (
            <ImageOff size={22} className="text-text-disabled" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-6">
            <span className="truncate text-ar-base font-medium">{item.name_ar}</span>
            {item.is_featured ? <Star size={15} className="flex-none fill-warning text-warning" /> : null}
          </div>
          {item.description_ar ? (
            <span className="truncate text-ar-sm text-text-muted">{item.description_ar}</span>
          ) : null}
          <span className="numeric mt-auto text-num-base font-semibold">{i18n.money(BigInt(item.price_minor))}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-8 border-t border-line pt-10">
        <label className="flex items-center gap-6 text-ar-sm text-text-muted">
          <Toggle checked={item.is_available} onChange={() => patch({ is_available: !item.is_available })} label={i18n.t('catalog.available')} />
          {item.is_available ? i18n.t('catalog.available') : i18n.t('catalog.unavailable')}
        </label>
        <label className="flex items-center gap-6 text-ar-sm text-text-muted">
          <Toggle checked={item.is_featured} onChange={() => patch({ is_featured: !item.is_featured })} label={i18n.t('catalog.featured')} />
          {i18n.t('catalog.featured')}
        </label>
        <div className="ms-auto flex gap-4">
          <IconButton variant="quiet" label={i18n.t('catalog.editItem')} onClick={onEdit}>
            <Pencil size={18} />
          </IconButton>
          <IconButton variant="quiet" label={i18n.t('catalog.retire')} onClick={() => setConfirming(true)} className="text-danger">
            <Trash2 size={18} />
          </IconButton>
        </div>
      </div>

      {confirming ? (
        <div className="flex items-center justify-between gap-8 rounded-md bg-surface-2 p-8 text-ar-sm">
          <span>{i18n.t('catalog.confirmRetire')}</span>
          <div className="flex gap-6">
            <Button variant="danger" onClick={() => { retire.mutate(item.id); setConfirming(false); }}>
              {i18n.t('catalog.retire')}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>{i18n.t('catalog.cancel')}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A centred modal shell, used by both editors. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const i18n = useI18n();
  // Focus in, Tab kept inside, Escape out (batch 15).
  const panel = useRef<HTMLDivElement>(null);
  useModalDialog(panel, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir={i18n.dir}>
      <button type="button" tabIndex={-1} aria-label={i18n.t('catalog.cancel')} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-line bg-surface sm:rounded-xl"
      >
        <div className="flex flex-none items-center justify-between border-b border-line px-16 py-12">
          <span className="font-display text-ar-lg font-semibold">{title}</span>
          <IconButton variant="quiet" label={i18n.t('catalog.cancel')} onClick={onClose}>
            <X size={22} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-16">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
      {label}
      {children}
    </label>
  );
}

function ItemEditor({
  item,
  categories,
  defaultCategoryId,
  onClose,
}: {
  item: MenuItem | null;
  categories: Category[];
  defaultCategoryId: string | null;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const create = useCreateItem();
  const update = useUpdateItem({ inlineError: true });
  const upload = useUploadItemImage();

  const [nameAr, setNameAr] = useState(item?.name_ar ?? '');
  const [nameEn, setNameEn] = useState(item?.name_en ?? '');
  const [descAr, setDescAr] = useState(item?.description_ar ?? '');
  const [categoryId, setCategoryId] = useState(item?.category_id ?? defaultCategoryId ?? '');
  const [price, setPrice] = useState(item ? fromMinor(BigInt(item.price_minor)) : '');
  const [available, setAvailable] = useState(item?.is_available ?? true);
  const [featured, setFeatured] = useState(item?.is_featured ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(item?.image_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || upload.isPending;

  const pickFile = (f: File | null) => {
    // Told now rather than after the item is saved and the upload refused.
    const problem = f ? checkImageFile(f) : null;
    if (problem) {
      setError(i18n.t(imageProblemKey(problem)));
      return;
    }
    setError(null);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : item?.image_url ?? null);
  };

  const save = async () => {
    setError(null);
    const digits = price.replace(/[^\d]/g, '');
    if (!nameAr.trim() || !digits || !categoryId) {
      setError(i18n.t('catalog.requiredFields'));
      return;
    }
    const body = {
      category_id: categoryId,
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      description_ar: descAr.trim(),
      price_minor: toMinor(digits).toString(),
      is_available: available,
      is_featured: featured,
    };
    try {
      const saved = item ? await update.mutateAsync({ id: item.id, body }) : await create.mutateAsync(body);
      if (file) await upload.mutateAsync({ id: saved.id, file });
      onClose();
    } catch (caught) {
      if (isRefusedImage(caught)) setError(i18n.t('common.imageRefused'));
      else setError(i18n.t(describeError(caught)));
    }
  };

  return (
    <Modal title={item ? i18n.t('catalog.editItem') : i18n.t('catalog.addItem')} onClose={onClose}>
      <div className="flex flex-col gap-12">
        <div className="flex items-center gap-14">
          <div className="flex size-thumb-md flex-none items-center justify-center overflow-hidden rounded-md bg-surface-2">
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImageOff size={26} className="text-text-disabled" />}
          </div>
          <label className="cursor-pointer text-ar-sm text-accent">
            {item?.image_url || file ? i18n.t('catalog.changeImage') : i18n.t('catalog.uploadImage')}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <Field label={i18n.t('catalog.name')}>
          <TextField value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </Field>
        <Field label={i18n.t('catalog.nameEn')}>
          <TextField value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
        </Field>
        <Field label={i18n.t('catalog.description')}>
          <TextField value={descAr} onChange={(e) => setDescAr(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-12">
          <Field label={i18n.t('catalog.category')}>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-control-xl rounded-md border border-line bg-surface-2 px-14 text-ar-base text-text outline-none"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name_ar}</option>
              ))}
            </select>
          </Field>
          <Field label={i18n.t('catalog.price')}>
            <TextField inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} dir="ltr" className="text-end" />
          </Field>
        </div>
        <div className="flex gap-20">
          <label className="flex items-center gap-8 text-ar-base">
            <Toggle checked={available} onChange={() => setAvailable((v) => !v)} label={i18n.t('catalog.available')} />
            {i18n.t('catalog.available')}
          </label>
          <label className="flex items-center gap-8 text-ar-base">
            <Toggle checked={featured} onChange={() => setFeatured((v) => !v)} label={i18n.t('catalog.featured')} />
            {i18n.t('catalog.featured')}
          </label>
        </div>

        {error ? (
          <span role="alert" className="text-ar-sm text-danger">
            {error}
          </span>
        ) : null}
        <div className="flex gap-10">
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{i18n.t('catalog.save')}</Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{i18n.t('catalog.cancel')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CategoryEditor({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const i18n = useI18n();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const deactivate = useDeactivateCategory();
  const [nameAr, setNameAr] = useState(category?.name_ar ?? '');
  const [nameEn, setNameEn] = useState(category?.name_en ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || deactivate.isPending;

  const save = async () => {
    setError(null);
    if (!nameAr.trim()) {
      setError(i18n.t('catalog.requiredFields'));
      return;
    }
    const body = { name_ar: nameAr.trim(), name_en: nameEn.trim() };
    try {
      if (category) await update.mutateAsync({ id: category.id, body });
      else await create.mutateAsync(body);
      onClose();
    } catch (caught) {
      setError(i18n.t(describeError(caught)));
    }
  };

  return (
    <Modal title={category ? i18n.t('catalog.editCategory') : i18n.t('catalog.addCategory')} onClose={onClose}>
      <div className="flex flex-col gap-12">
        <Field label={i18n.t('catalog.categoryName')}>
          <TextField value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </Field>
        <Field label={i18n.t('catalog.categoryNameEn')}>
          <TextField value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
        </Field>
        {error ? (
          <span role="alert" className="text-ar-sm text-danger">
            {error}
          </span>
        ) : null}
        <div className="flex items-center gap-10">
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{i18n.t('catalog.save')}</Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{i18n.t('catalog.cancel')}</Button>
          {category ? (
            <Button
              variant="danger"
              onClick={() => { deactivate.mutate(category.id); onClose(); }}
              disabled={busy}
            >
              {i18n.t('catalog.deactivate')}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

