import { useEffect, useState } from 'react';
import { Volume2, VolumeX, Wind, WifiOff } from 'lucide-react';
import { isMuted, setMuted } from '../sound';
import { socket } from '../socket';
export function reducedMotion() { return document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches; }
export default function GamePreferences() {
  const [muted, mute] = useState(isMuted);
  const [reduced, reduce] = useState(() => localStorage.getItem('okCorral-motion') === 'reduced');
  const [offline, setOffline] = useState(false);
  useEffect(() => { document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'; localStorage.setItem('okCorral-motion', reduced ? 'reduced' : 'full'); }, [reduced]);
  useEffect(() => { const down = () => setOffline(true), up = () => setOffline(false); socket.on('disconnect', down); socket.on('connect_error', down); socket.on('connect', up); return () => { socket.off('disconnect', down); socket.off('connect_error', down); socket.off('connect', up); }; }, []);
  return <><div className="game-preferences"><button aria-label={muted ? 'Enable sound' : 'Mute sound'} aria-pressed={muted} onClick={() => { setMuted(!muted); mute(!muted); }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><button aria-label="Reduce motion" aria-pressed={reduced} onClick={() => reduce(!reduced)}><Wind size={18} /></button></div>{offline && <div className="connection-banner" role="status"><WifiOff size={16} /> Connection lost. Reconnecting…</div>}</>;
}
