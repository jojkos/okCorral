import { useEffect, useRef, useState } from 'react';
import { EMOTES, type Emote } from '../../../shared/types';
import { socket } from '../../socket';
import * as sfx from '../../sound';

const COOLDOWN_MS = 1200;

// Cosmetic emotes shown on the TV. The server rate-limits too; this cooldown
// just keeps the phone honest and gives visual feedback.
export default function EmoteBar({ label = 'Holler at the TV' }: { label?: string }) {
  const [coolUntil, setCoolUntil] = useState(0);
  const [last, setLast] = useState<Emote | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const cooling = coolUntil > 0;
  const send = (e: Emote) => {
    if (cooling || !socket.connected) return;
    socket.emit('emote', e);
    (sfx as any).playEmotePop?.();
    navigator.vibrate?.(12);
    setLast(e);
    setCoolUntil(Date.now() + COOLDOWN_MS);
    timer.current = setTimeout(() => setCoolUntil(0), COOLDOWN_MS);
  };
  return (
    <section className={`emote-bar ${cooling ? 'cooling' : ''}`} aria-label="Emotes">
      <span className="emote-label">{label}</span>
      <div className="emote-row">
        {EMOTES.map(e => (
          <button key={e} type="button" className={`emote-btn ${cooling && last === e ? 'sent' : ''}`} disabled={cooling} onClick={() => send(e)} aria-label={`Send ${e}`}>
            <span>{e}</span>
          </button>
        ))}
      </div>
      <i className="emote-cool" key={coolUntil} aria-hidden />
    </section>
  );
}
