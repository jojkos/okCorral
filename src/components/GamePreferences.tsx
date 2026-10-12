import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Volume2, VolumeX, Wind, WifiOff, X } from 'lucide-react';
import { getAudioPreferences, getMusicStatus, isMuted, retryMusic, setAudioPreferences, setMuted, subscribeMusicStatus, WESTERN_TRACK, type AudioPreferences } from '../sound';
import { socket } from '../socket';
import './audioPreferences.css';
export function reducedMotion() { return document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches; }
export default function GamePreferences() {
  const [muted, mute] = useState(isMuted);
  const [audio, updateAudio] = useState(getAudioPreferences);
  const musicStatus = useSyncExternalStore(subscribeMusicStatus, getMusicStatus, getMusicStatus);
  const [open, setOpen] = useState(false);
  const [reduced, reduce] = useState(() => localStorage.getItem('okCorral-motion') === 'reduced');
  const [offline, setOffline] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const update = (next: Partial<AudioPreferences>) => { setAudioPreferences(next); updateAudio(getAudioPreferences()); };
  useEffect(() => { document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'; localStorage.setItem('okCorral-motion', reduced ? 'reduced' : 'full'); }, [reduced]);
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
      <button aria-label="Reduce motion" aria-pressed={reduced} onClick={() => reduce(!reduced)}><Wind size={18} /></button>
    </div>
    {open && <div ref={panel} id="audio-preferences" className="audio-preferences" role="dialog" aria-label="Sound settings">
      <header><strong>Sound settings</strong><button ref={close} aria-label="Close sound settings" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={17} /></button></header>
      <label className="audio-master"><input type="checkbox" checked={muted} onChange={e => { setMuted(e.target.checked); mute(e.target.checked); }} />Mute all sound</label>
      {(['music', 'effects'] as const).map(kind => {
        const title = kind === 'music' ? 'Music' : 'Effects';
        const enabled = audio[`${kind}Enabled`], volume = audio[`${kind}Volume`];
        return <fieldset key={kind} disabled={muted}>
          <legend>{title}</legend>
          <label className="audio-toggle"><input type="checkbox" checked={enabled} onChange={e => update({ [`${kind}Enabled`]: e.target.checked })} />{title} on</label>
          <div className="audio-level"><input aria-label={`${title} volume`} type="range" min="0" max="100" step="5" value={Math.round(volume * 100)} disabled={!enabled} onChange={e => update({ [`${kind}Volume`]: Number(e.target.value) / 100 })} /><output>{Math.round(volume * 100)}%</output></div>
          {kind === 'music' && <div className="audio-track">
            <strong>{WESTERN_TRACK.title}</strong>
            <span>Original western soundtrack · Runway</span>
            {musicStatus === 'loading' && <span role="status">Loading soundtrack…</span>}
            {musicStatus === 'error' && <span role="alert">Music couldn't load. <button type="button" onClick={retryMusic}>Try again</button></span>}
          </div>}
        </fieldset>;
      })}
    </div>}
    {offline && <div className="connection-banner" role="status"><WifiOff size={16} /> Connection lost. Reconnecting…</div>}
  </>;
}
