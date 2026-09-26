'use client';

/**
 * The activity log, rendered.
 *
 * One list, used in two places: a short tail on the dashboard, and the full
 * list on the staff screen. Each entry is turned into a sentence a manager can
 * read at a glance — "created عمر", "edited سمية", with the specific field
 * changes spelled out underneath — plus who did it and when.
 *
 * A role value in an edit diff is itself translated (`role.cashier` → كاشير),
 * so the log reads in the viewer's language, not in the database's codes.
 */
import {
  UserPlus, UserCog, UserMinus, UserCheck,
  UtensilsCrossed, Pencil, Trash2, Image as ImageIcon,
  FolderPlus, FolderMinus, Tag, Truck,
} from 'lucide-react';

import { EmptyState, LoadingList } from '@/components';
import { formatDate, formatTime, useI18n } from '@/i18n';
import { useAuditLog } from './hooks';
import type { AuditAction, AuditEntry, AuditQuery } from './api';

const ICON: Record<AuditAction, React.ReactNode> = {
  'staff.created': <UserPlus size={18} className="text-success" />,
  'staff.updated': <UserCog size={18} className="text-accent" />,
  'staff.deactivated': <UserMinus size={18} className="text-danger" />,
  'staff.reactivated': <UserCheck size={18} className="text-success" />,
  'item.created': <UtensilsCrossed size={18} className="text-success" />,
  'item.updated': <Pencil size={18} className="text-accent" />,
  'item.retired': <Trash2 size={18} className="text-danger" />,
  'item.image': <ImageIcon size={18} className="text-accent" />,
  'category.created': <FolderPlus size={18} className="text-success" />,
  'category.updated': <Pencil size={18} className="text-accent" />,
  'category.deactivated': <FolderMinus size={18} className="text-danger" />,
  'price.bulk': <Tag size={18} className="text-warning" />,
  'delivery.status': <Truck size={18} className="text-accent" />,
};

const ROLE_KEY = {
  owner: 'role.owner',
  manager: 'role.manager',
  cashier: 'role.cashier',
  kitchen: 'role.kitchen',
} as const;

export function ActivityLog({ query = {} }: { query?: AuditQuery }) {
  const i18n = useI18n();
  const log = useAuditLog(query);

  if (log.isLoading) return <LoadingList rows={4} rowClassName="h-control-xl" />;
  if (log.isError) return <EmptyState title={i18n.t('common.retry')} />;
  if (!log.data?.results.length) return <EmptyState title={i18n.t('manager.audit.empty')} />;

  return (
    <ul className="flex flex-col divide-y divide-line">
      {log.data.results.map((entry) => (
        <Row key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function Row({ entry }: { entry: AuditEntry }) {
  const i18n = useI18n();
  const when = new Date(entry.created_at);

  return (
    <li className="flex items-start gap-12 py-12">
      <span className="mt-2 flex-none">{ICON[entry.action]}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <span className="text-ar-base">
          {i18n.t(`manager.audit.action.${entry.action}` as never, { name: entry.target_label })}
          <span className="text-text-muted">
            {' · '}
            {i18n.t('manager.audit.by', { name: entry.actor_name })}
          </span>
        </span>
        <Changes entry={entry} />
      </div>
      {/* Timestamps are always Western and LTR — a stamp, not prose. */}
      <span className="flex-none text-num-sm text-text-muted" dir="ltr">
        {formatDate(when)} {formatTime(when)}
      </span>
    </li>
  );
}

/** The per-field detail of an edit: "role: كاشير → مطبخ". */
function Changes({ entry }: { entry: AuditEntry }) {
  const i18n = useI18n();
  // Any action may carry a before/after diff; staff edits are no longer the
  // only ones that do.

  const readValue = (field: string, value: unknown): string => {
    if (field === 'role' && typeof value === 'string' && value in ROLE_KEY) {
      return i18n.t(ROLE_KEY[value as keyof typeof ROLE_KEY]);
    }
    return String(value);
  };

  const rows = Object.entries(entry.metadata).filter(([, v]) => Array.isArray(v));
  if (!rows.length) return null;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map(([field, pair]) => {
        const [before, after] = pair as [unknown, unknown];
        if (field === 'password') {
          return (
            <li key={field} className="text-ar-sm text-text-muted">
              {i18n.t('manager.audit.passwordReset')}
            </li>
          );
        }
        return (
          <li key={field} className="text-ar-sm text-text-muted">
            {i18n.t(`manager.audit.field.${field}` as never)}
            {': '}
            <span className="line-through">{readValue(field, before)}</span>
            {' → '}
            <span className="text-text">{readValue(field, after)}</span>
          </li>
        );
      })}
    </ul>
  );
}
