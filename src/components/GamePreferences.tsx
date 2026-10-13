import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX, Accessibility, WifiOff, X } from 'lucide-react';
import { isMuted, subscribeAudioPreferences } from '../sound';
import AudioControls from './AudioControls';
import { socket } from '../socket';
import { reducedMotion, setMotionPreference, subscribeMotionPreference } from '../lib/motionPreferences';
export { reducedMotion } from '../lib/motionPreferences';
import './audioPreferences.css';
export default function GamePreferences() {
  const muted = useSyncExternalStore(subscribeAudioPreferences, isMuted, isMuted);
  const [open, setOpen] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotionPreference, reducedMotion, () => false);
  const [offline, setOffline] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { const down = () => setOffline(true), up = () => setOffline(false); socket.on('disconnect', down); socket.on('connect_error', down); socket.on('connect', up); return () => { socket.off('disconnect', down); socket.off('connect_error', down); socket.off('connect', up); }; }, []);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const dismiss = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <>
    <div className="game-preferences">
      <button ref={trigger} aria-label="Sound settings" aria-expanded={open} aria-controls="audio-preferences" onClick={() => setOpen(!open)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
      <button className="motion-toggle" aria-label="Reduce motion" title={reduced ? 'Reduced animations — click for full motion' : 'Full animations — click to reduce motion'} aria-pressed={reduced} onClick={() => setMotionPreference(reduced ? 'full' : 'reduced')}><Accessibility size={18} />{reduced && <span>Reduced motion</span>}</button>
    </div>
    {open && <div ref={panel} id="audio-preferences" className="audio-preferences" role="dialog" aria-label="Sound settings">
      <header><strong>Sound settings</strong><button ref={close} aria-label="Close sound settings" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={17} /></button></header>
      <AudioControls />
    </div>}
    {offline && <div className="connection-banner" role="status"><WifiOff size={16} /> Connection lost. Reconnecting…</div>}
  </>;
}
