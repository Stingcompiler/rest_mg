/**
 * Making an arrival noticeable: a sound, a browser notice, a marked tab title.
 *
 * Three ways of saying the same thing, because no one of them is reliable on
 * its own. A cook is not looking at the tablet, so sound carries. A browser
 * refuses to make sound until somebody has touched the page, so the tab title
 * carries when it cannot. And the person may be in another tab entirely, which
 * is what the browser notice is for.
 *
 * The sound is synthesised rather than shipped as a file: two short tones from
 * the WebAudio oscillator, which costs no asset, no network request and no
 * cache entry on a device that may be offline for days.
 */

const TONE_HZ = [880, 1174.7]; // A5 then D6 — two notes, rising, unmistakably a signal
const TONE_MS = 140;

let context: AudioContext | null = null;
let originalTitle: string | null = null;

/**
 * A chime that was due while the device was still refusing to make sound.
 *
 * Sign-in is a full page navigation, so the till arrives as a fresh document
 * that has never been touched — and a browser will not play audio in one. If
 * an order is already waiting at that moment the alert would simply be lost.
 *
 * So it is held instead. The badge and the tab title say it immediately, and
 * the sound follows the instant anything is tapped.
 */
let owed = false;

type WindowWithLegacyAudio = Window & { webkitAudioContext?: typeof AudioContext };

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/**
 * Wake the audio device on a user gesture.
 *
 * Browsers start an AudioContext suspended and refuse to resume it except from
 * a real interaction. Call this from any click or key press: until it has run
 * at least once, `chime()` is silent no matter how many orders arrive.
 */
export function primeAudio(): void {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().then(settleDebt);
    return;
  }
  settleDebt();
}

/** Play what was owed from before the device would make a sound. */
function settleDebt(): void {
  if (!owed) return;
  owed = false;
  chime();
}

/** Whether a chime would actually be heard, so the UI can offer to fix it. */
export function audioReady(): boolean {
  const ctx = audioContext();
  return ctx !== null && ctx.state === 'running';
}

/** Two rising tones. Silent, never throwing, if the device will not play. */
export function chime(): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') {
    // Not dropped — owed, and paid on the first touch.
    owed = true;
    return;
  }
  try {
    TONE_HZ.forEach((hz, index) => {
      const at = ctx.currentTime + (index * TONE_MS) / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      // A short envelope instead of a square start, so it reads as a chime and
      // not as a click on a cheap tablet speaker.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + TONE_MS / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + TONE_MS / 1000 + 0.02);
    });
  } catch {
    // A sound that will not play is never worth an exception on a till.
  }
}

/** Whether the browser will show notices, without asking for permission. */
export function noticePermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Ask for permission to show notices.
 *
 * Only ever call this from a button the user pressed. An unprompted request is
 * refused outright by some browsers and resented by every user.
 */
export async function requestNoticePermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** A notice that reaches the person even when this tab is not the front one. */
export function showNotice(title: string, body: string): void {
  if (noticePermission() !== 'granted') return;
  try {
    // `tag` collapses a burst into one notice rather than a stack of five.
    new Notification(title, { body, tag: 'sudan-pos-arrival', renotify: false } as NotificationOptions);
  } catch {
    // Some browsers only allow notices from a service worker. Nothing to do.
  }
}

/**
 * Mark the tab title with a count, and remember what it was.
 *
 * This is the one channel that always works — no permission, no audio device,
 * no gesture — so it is what the whole thing falls back to.
 */
export function markTitle(count: number): void {
  if (typeof document === 'undefined') return;
  if (originalTitle === null) originalTitle = document.title;
  document.title = count > 0 ? `(${count}) ${originalTitle}` : originalTitle;
}

export function clearTitleMark(): void {
  if (typeof document === 'undefined' || originalTitle === null) return;
  document.title = originalTitle;
}
