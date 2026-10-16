'use client';

/**
 * Device enrolment and revocation. A tablet is provisioned here — the token is
 * shown exactly once, at enrolment, and never again (only its hash is stored).
 * A lost tablet is revoked here too, which locks it out of sync immediately.
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button, ConfirmDialog, EmptyState, ErrorState, LoadingList, Numeric, TextField } from '@/components';
import { describeError } from '@/lib/describeError';
import { formatDate, useI18n } from '@/i18n';
import { ManagerShell } from './ManagerShell';
import { useDevices, useEnrolDevice, useRevokeDevice } from './hooks';
import { useMe } from './hooks';

export function DevicesScreen() {
  const i18n = useI18n();
  const devices = useDevices();
  const me = useMe();
  const enrol = useEnrolDevice();
  const revoke = useRevokeDevice();
  const [label, setLabel] = useState('');
  const [freshToken, setFreshToken] = useState<string | null>(null);
  // Revoking cuts that tablet off at once, so it asks first (batch 59).
  const [revoking, setRevoking] = useState<string | null>(null);
  const revokingDevice = (devices.data ?? []).find((device) => device.id === revoking);

  const onEnrol = () => {
    const branchId = me.data?.branch_id;
    if (!label.trim() || !branchId) return;
    enrol.mutate(
      { label: label.trim(), branchId },
      {
        onSuccess: (device) => {
          setFreshToken(device.token ?? null);
          setLabel('');
        },
      },
    );
  };

  return (
    <ManagerShell title={i18n.t('manager.devices.title')} description={i18n.t('manager.devices.pageDescription')}>
      <div className="flex max-w-2xl flex-col gap-16">
        {/* Wraps: in one row the enrol button ran off a phone's edge (batch 59). */}
        <div className="flex flex-wrap items-end gap-12 border-b border-line pb-16">
          <label className="flex min-w-0 flex-1 basis-field-min flex-col gap-6">
            <span className="text-ar-sm text-text-muted">{i18n.t('manager.devices.label')}</span>
            <TextField value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <Button variant="primary" onClick={onEnrol} disabled={enrol.isPending || !label.trim()}>
            {i18n.t('manager.devices.enrol')}
          </Button>
        </div>

        {freshToken ? (
          <div className="flex flex-col gap-8 rounded-lg border-strong border-accent bg-accent-tint p-16">
            <span className="text-ar-sm text-text-muted">{i18n.t('manager.devices.tokenOnce')}</span>
            <code className="numeric break-all rounded-md bg-surface p-12 text-num-sm text-text">{freshToken}</code>
          </div>
        ) : null}

        {devices.isLoading ? (
          <LoadingList rows={3} rowClassName="h-control-xl" />
        ) : devices.isError ? (
          <ErrorState
          title={i18n.t('common.loadFailed')}
          detail={i18n.t(describeError(devices.error))}
          retryLabel={i18n.t('common.retry')}
          onRetry={() => void devices.refetch()}
          icon={<AlertTriangle size={30} />}
        />
        ) : (
          <div className="flex flex-col">
            {(devices.data ?? []).map((device) => {
              const active = device.revoked_at === null;
              return (
                <div key={device.id} className="flex flex-wrap items-center gap-x-16 gap-y-8 border-b border-line py-14">
                  <span className="min-w-0 flex-1 basis-32 break-words text-ar-base font-medium">{device.label}</span>
                  <span className={active ? 'text-ar-sm text-success' : 'text-ar-sm text-text-disabled'}>
                    {active ? i18n.t('manager.devices.active') : i18n.t('manager.devices.revoked')}
                  </span>
                  {device.last_seen_at ? (
                    <Numeric className="text-num-sm text-text-muted">{formatDate(new Date(device.last_seen_at))}</Numeric>
                  ) : null}
                  {active ? (
                    <Button variant="quietDanger" onClick={() => setRevoking(device.id)} disabled={revoke.isPending}>
                      {i18n.t('manager.devices.revoke')}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <ConfirmDialog
          open={revoking !== null}
          title={i18n.t('manager.devices.revokeTitle', { name: revokingDevice?.label ?? '' })}
          body={i18n.t('manager.devices.revokeBody')}
          confirmLabel={i18n.t('manager.devices.revoke')}
          cancelLabel={i18n.t('common.back')}
          pending={revoke.isPending}
          onCancel={() => setRevoking(null)}
          onConfirm={() => revoking && revoke.mutate(revoking, { onSuccess: () => setRevoking(null) })}
        />
      </div>
    </ManagerShell>
  );
}
