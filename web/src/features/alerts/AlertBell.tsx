'use client';

/**
 * The control that makes the alert audible, and lets someone turn it off.
 *
 * It carries more weight than a mute button because of a browser rule that has
 * no equivalent in the physical world: a page may not make a sound until the
 * person has interacted with it. A kitchen tablet propped up and never touched
 * will therefore stay silent through an entire service, with nothing on screen
 * explaining why.
 *
 * So this button has three states, not two, and says which one it is in:
 * silenced by choice, silenced by the browser and one tap from working, or
 * working. Pressing it is itself the interaction the browser is waiting for.
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';

import { Button } from '@/components';
import { useI18n } from '@/i18n';
import { audioReady, noticePermission, primeAudio, requestNoticePermission } from '@/lib/chime';

export interface AlertBellProps {
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}

export function AlertBell({ muted, onMutedChange }: AlertBellProps) {
  const i18n = useI18n();
  const [ready, setReady] = useState(true);

  // Whether sound would actually play is only knowable on the client, and can
  // change the moment the person touches anything.
  useEffect(() => {
    const check = () => setReady(audioReady());
    check();
    const timer = setInterval(check, 2_000);
    return () => clearInterval(timer);
  }, []);

  const press = () => {
    if (muted) {
      // Unmuting is a gesture, so it is also the moment sound becomes possible.
      primeAudio();
      onMutedChange(false);
      if (noticePermission() === 'default') void requestNoticePermission();
      setReady(audioReady());
      return;
    }
    if (!ready) {
      // Not muted, just not permitted to make noise yet. This press fixes it.
      primeAudio();
      if (noticePermission() === 'default') void requestNoticePermission();
      setReady(audioReady());
      return;
    }
    onMutedChange(true);
  };

  const state = muted ? 'off' : ready ? 'on' : 'blocked';
  const label = i18n.t(
    state === 'off' ? 'alerts.soundOff' : state === 'on' ? 'alerts.soundOn' : 'alerts.enableSound',
  );
  const Icon = state === 'off' ? BellOff : state === 'on' ? BellRing : Bell;

  return (
    <Button
      variant={state === 'blocked' ? 'primary' : 'secondary'}
      onClick={press}
      aria-pressed={state === 'on'}
      aria-label={label}
      title={label}
    >
      <span className="flex items-center gap-6">
        <Icon size={18} />
        {state === 'blocked' ? label : null}
      </span>
    </Button>
  );
}
