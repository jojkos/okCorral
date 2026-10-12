export type MotionPreference = 'system' | 'full' | 'reduced';
const KEY = 'okCorral-motion';

export function resolveReducedMotion(preference: MotionPreference, systemReduced: boolean): boolean {
  return preference === 'system' ? systemReduced : preference === 'reduced';
}

function readPreference(): MotionPreference {
  try {
    const value = globalThis.localStorage?.getItem(KEY);
    return value === 'full' || value === 'reduced' ? value : 'system';
  } catch { return 'system'; }
}

let preference = readPreference();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const listeners = new Set<() => void>();
export const reducedMotion = () => resolveReducedMotion(preference, media?.matches ?? false);

function notify() {
  // The same effective choice drives both canvas and CSS animations.
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = reducedMotion() ? 'reduced' : 'full';
  listeners.forEach(listener => listener());
}

export function setMotionPreference(next: MotionPreference) {
  preference = next;
  try {
    if (next === 'system') globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, next);
  } catch { /* Private browsing must not stop the canvas animation loop. */ }
  notify();
}

export function subscribeMotionPreference(listener: () => void) {
  listeners.add(listener);
  const onSystem = () => notify();
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) { preference = readPreference(); notify(); }
  };
  media?.addEventListener('change', onSystem);
  globalThis.addEventListener?.('storage', onStorage);
  notify();
  return () => {
    listeners.delete(listener);
    media?.removeEventListener('change', onSystem);
    globalThis.removeEventListener?.('storage', onStorage);
  };
}
