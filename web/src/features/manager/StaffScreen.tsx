'use client';

/**
 * Staff accounts — the manager creating and maintaining the people who use the
 * system: the day cashier, the night cashier, the kitchen.
 *
 * A manager can add someone, edit their details in place (name, username, role,
 * or a password reset), deactivate them when they leave, and reactivate them if
 * they return. Accounts are never deleted, so every order and shift stays
 * attributable to a real person long after the fact — and every change here is
 * written to the activity log shown at the bottom.
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button, EmptyState, ErrorState, LoadingList, TextField } from '@/components';
import { useI18n } from '@/i18n';
import { ManagerShell } from './ManagerShell';
import { ActivityLog } from './ActivityLog';
import { useCreateStaff, useDeactivateStaff, useEditStaff, useStaff } from './hooks';
import type { StaffAccount } from './api';
import { describeError } from '@/lib/describeError';
import { useAuth } from '@/features/auth/AuthProvider';

const ROLES = ['cashier', 'kitchen', 'manager'] as const;

const ROLE_KEY = {
  owner: 'role.owner',
  manager: 'role.manager',
  cashier: 'role.cashier',
  kitchen: 'role.kitchen',
} as const;

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const i18n = useI18n();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-control-xl rounded-md border border-line bg-surface-2 px-14 text-ar-base text-text outline-none"
    >
      {ROLES.map((v) => (
        <option key={v} value={v}>
          {i18n.t(ROLE_KEY[v])}
        </option>
      ))}
    </select>
  );
}

export function StaffScreen() {
  const i18n = useI18n();
  const staff = useStaff();

  return (
    <ManagerShell title={i18n.t('manager.staff.title')} description={i18n.t('manager.staff.pageDescription')}>
      <div className="flex max-w-3xl flex-col gap-24">
        <AddStaffForm />

        {staff.isLoading ? (
          <LoadingList rows={4} rowClassName="h-control-xl" />
        ) : staff.isError ? (
          <ErrorState
          title={i18n.t('common.loadFailed')}
          detail={i18n.t(describeError(staff.error))}
          retryLabel={i18n.t('common.retry')}
          onRetry={() => void staff.refetch()}
          icon={<AlertTriangle size={30} />}
        />
        ) : (
          <div className="flex flex-col gap-8">
            {(staff.data ?? []).map((person) => (
              <StaffRow key={person.id} person={person} />
            ))}
          </div>
        )}

        <section className="flex flex-col gap-8">
          <h2 className="text-ar-md font-medium">{i18n.t('manager.audit.title')}</h2>
          <div className="rounded-lg border border-line bg-surface px-16">
            <ActivityLog query={{ action: 'staff', limit: 50 }} />
          </div>
        </section>
      </div>
    </ManagerShell>
  );
}

function AddStaffForm() {
  const i18n = useI18n();
  const create = useCreateStaff();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<string>('cashier');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    create.mutate(
      { username: username.trim(), display_name: displayName.trim(), role, password },
      {
        onSuccess: () => {
          setUsername('');
          setDisplayName('');
          setPassword('');
        },
        onError: (caught) => setError(i18n.t(describeError(caught))),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-16">
      <span className="text-ar-md font-medium">{i18n.t('manager.staff.add')}</span>
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.staff.username')}
          <TextField value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.staff.displayName')}
          <TextField value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.staff.role')}
          <RoleSelect value={role} onChange={setRole} />
        </label>
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.staff.password')}
          <TextField
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
      </div>
      {error ? <span className="text-ar-sm text-danger">{error}</span> : null}
      {create.isSuccess && !error ? (
        <span className="text-ar-sm text-success">{i18n.t('manager.staff.created')}</span>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={create.isPending || !username.trim() || !password}>
          {i18n.t('manager.staff.create')}
        </Button>
      </div>
    </form>
  );
}

function StaffRow({ person }: { person: StaffAccount }) {
  const i18n = useI18n();
  const edit = useEditStaff();
  const deactivate = useDeactivateStaff();
  const [editing, setEditing] = useState(false);

  if (editing) return <EditStaffRow person={person} onDone={() => setEditing(false)} />;

  return (
    <div className="flex flex-wrap items-center gap-x-16 gap-y-8 rounded-lg border border-line bg-surface p-14">
      <span className="min-w-0 flex-1 basis-32 text-ar-base font-medium">
        {person.display_name || person.username}
      </span>
      <span className="text-ar-sm text-text-muted">{person.username}</span>
      <span className="text-ar-sm text-accent">{i18n.t(ROLE_KEY[person.role])}</span>
      <span className={person.is_active ? 'text-ar-sm text-success' : 'text-ar-sm text-text-disabled'}>
        {person.is_active ? i18n.t('manager.staff.active') : i18n.t('manager.staff.inactive')}
      </span>
      {person.role !== 'owner' ? (
        <div className="flex gap-8">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {i18n.t('manager.staff.edit')}
          </Button>
          {person.is_active ? (
            <Button variant="danger" onClick={() => deactivate.mutate(person.id)} disabled={deactivate.isPending}>
              {i18n.t('manager.staff.deactivate')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => edit.mutate({ id: person.id, patch: { is_active: true } })}
              disabled={edit.isPending}
            >
              {i18n.t('manager.staff.reactivate')}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function EditStaffRow({ person, onDone }: { person: StaffAccount; onDone: () => void }) {
  const i18n = useI18n();
  const edit = useEditStaff();
  const auth = useAuth();
  // Your own password is changed from settings, with the current one.
  const isSelf = auth.user?.id === person.id;
  const [displayName, setDisplayName] = useState(person.display_name);
  const [username, setUsername] = useState(person.username);
  const [role, setRole] = useState<string>(person.role);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    // Send only what actually changed — the server logs the diff, and an empty
    // patch would still write a no-op the log would rather not carry.
    const patch: Record<string, string> = {};
    if (displayName !== person.display_name) patch.display_name = displayName;
    if (username.trim() !== person.username) patch.username = username.trim();
    if (role !== person.role) patch.role = role;
    if (password) patch.password = password;
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    edit.mutate(
      { id: person.id, patch },
      {
        onSuccess: onDone,
        onError: (caught) => setError(i18n.t(describeError(caught))),
      },
    );
  };

  return (
    <div className="flex flex-col gap-12 rounded-lg border border-accent bg-surface p-14">
      <span className="text-ar-sm font-medium">{i18n.t('manager.staff.editing', { name: person.display_name || person.username })}</span>
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.staff.displayName')}
          <TextField value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.staff.username')}
          <TextField value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
          {i18n.t('manager.staff.role')}
          <RoleSelect value={role} onChange={setRole} />
        </label>
        {isSelf ? (
          <p className="self-end text-ar-sm text-text-muted">{i18n.t('manager.staff.ownPasswordInSettings')}</p>
        ) : (
          <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
            {i18n.t('manager.staff.password')}
            <TextField
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={i18n.t('manager.staff.passwordHint')}
            />
          </label>
        )}
      </div>
      {error ? <span className="text-ar-sm text-danger">{error}</span> : null}
      <div className="flex gap-8">
        <Button variant="primary" onClick={save} disabled={edit.isPending}>
          {i18n.t('manager.staff.save')}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={edit.isPending}>
          {i18n.t('manager.staff.cancel')}
        </Button>
      </div>
    </div>
  );
}
