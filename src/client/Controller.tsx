import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUp, ArrowDown, ArrowUpRight, ArrowDownRight, ArrowRight, Shield, RotateCw, Check, LoaderCircle, Heart, Crosshair } from 'lucide-react';
import type { ClientPlayer, GameState, ActionType } from '../../shared/types';
import { socket, serverNow } from '../socket';
import { playTickStart, playTickResolve, playLockAction } from '../sound';
import { WesternBackdrop } from '../components/WesternUI';
import CowboyPortrait from '../components/CowboyPortrait';

interface ControllerProps { player: ClientPlayer; gameState: GameState | null; error: string | null; onLeave: () => void }
const labels: Record<ActionType, string> = { MOVE_UP: 'Move up', MOVE_DOWN: 'Move down', COVER: 'Take cover', RELOAD: 'Reload', SHOOT_UP: 'Shoot up', SHOOT_STRAIGHT: 'Shoot straight', SHOOT_DOWN: 'Shoot down', NONE: 'No action' };
export default function Controller({ player, gameState, error, onLeave }: ControllerProps) {
  const mine = gameState?.players.find(p => p.id === player.id);
  const [pending, setPending] = useState<ActionType | null>(null);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(serverNow);
  const [connected, setConnected] = useState(socket.connected);
  const current = useRef(gameState); current.current = gameState;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const planning = gameState?.phase === 'planning';
  const confirmed = mine?.actionLocked ? mine.currentAction : null;
  const chosen = confirmed || pending;
  const hp = mine?.hp ?? 3, ammo = mine?.ammo ?? 1;
  const slot = mine?.slot ?? player.slot;
  const barrel = gameState?.barrels.find(b => b.team === mine?.team && b.slot === slot);
  const left = planning ? Math.max(0, (gameState?.tickStartTime ?? now) + (gameState?.config.tickDuration ?? 4000) - now) : 0;
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(serverNow()), 50);
    const online = () => setConnected(true), offline = () => setConnected(false);
    socket.on('connect', online); socket.on('disconnect', offline);
    socket.on('tickStart', playTickStart); socket.on('tickEnd', playTickResolve);
    return () => { mounted.current = false; clearInterval(timer); socket.off('connect', online); socket.off('disconnect', offline); socket.off('tickStart', playTickStart); socket.off('tickEnd', playTickResolve); };
  }, []);
  useEffect(() => { setPending(null); setNotice(''); inFlight.current = false; }, [gameState?.tick, gameState?.roomCode]);
  useEffect(() => { if (confirmed) { setPending(null); inFlight.current = false; setNotice(''); } }, [confirmed]);
  const submit = useCallback((action: ActionType) => {
    if (!socket.connected || !planning || !mine?.isAlive || confirmed || pending || inFlight.current) return;
    if ((action.startsWith('SHOOT') && ammo === 0) || (action === 'RELOAD' && ammo === 3)) return;
    const tick = gameState!.tick;
    const startedAt = gameState!.tickStartTime!;
    inFlight.current = true; setPending(action); setNotice('');
    socket.timeout(3000).emit('submitAction', { action, tick, startedAt }, (err, result) => {
      if (!mounted.current || current.current?.tick !== tick || current.current.tickStartTime !== startedAt || current.current.phase !== 'planning') return;
      inFlight.current = false;
      if (err) {
        // A lost acknowledgement is not a rejection: recover the authoritative lock.
        socket.emit('requestState'); setNotice('Checking your action with the host…'); return;
      }
      if (result.accepted) {
        setPending(result.action || action); playLockAction();
        navigator.vibrate?.(25);
      } else { setPending(null); setNotice(result.reason || 'Action unavailable'); }
    });
  }, [planning, mine?.isAlive, confirmed, pending, ammo, gameState]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      const actions: Record<string, ActionType> = { w: 'MOVE_UP', s: 'MOVE_DOWN', a: 'COVER', r: 'RELOAD', q: 'SHOOT_UP', e: 'SHOOT_DOWN', ' ': 'SHOOT_STRAIGHT' };
      const action = actions[e.key.toLowerCase()]; if (action) { e.preventDefault(); submit(action); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [submit]);
  const disabled = !!chosen || !planning || !connected || !mine?.isAlive;
  const buttons = [
    { action: 'MOVE_UP', icon: ArrowUp, key: 'W', note: 'One lane up' },
    { action: 'SHOOT_UP', icon: ArrowUpRight, key: 'Q', note: 'Upper lane', shot: true },
    { action: 'MOVE_DOWN', icon: ArrowDown, key: 'S', note: 'One lane down' },
    { action: 'SHOOT_STRAIGHT', icon: ArrowRight, key: 'SPACE', note: 'Your lane', shot: true },
    { action: 'COVER', icon: Shield, key: 'A', note: barrel?.hp ? `${barrel.hp}/3 barrel strength` : 'Barrel destroyed' },
    { action: 'SHOOT_DOWN', icon: ArrowDownRight, key: 'E', note: 'Lower lane', shot: true },
    { action: 'RELOAD', icon: RotateCw, key: 'R', note: ammo === 3 ? 'Ammo full' : '+1 bullet' },
  ] as const;
  return <WesternBackdrop dark><main className="controller-shell">
    <header className="controller-heading"><div><span className="eyebrow">{player.team === 'sheriffs' ? 'The law' : 'The wanted'}</span><h1>{player.name}</h1></div><span className={`team-chip ${player.team}`}>Lane {slot + 1}</span></header>
    <section className="player-strip">
      <CowboyPortrait team={player.team || 'sheriffs'} size={92} facing={player.team === 'outlaws' ? -1 : 1} />
      <div className="vitals"><span>HEALTH</span><div aria-label={`${hp} of 3 health`}>{[0,1,2].map(i => <Heart key={i} size={22} fill={i < hp ? '#f58b78' : 'transparent'} color={i < hp ? '#f58b78' : '#626b70'} />)}</div></div>
      <div className="vitals"><span>AMMO</span><div aria-label={`${ammo} of 3 bullets`}>{[0,1,2].map(i => <i key={i} className={`cartridge ${i < ammo ? 'loaded' : ''}`} />)}</div></div>
    </section>
    <section className={`round-status ${left < 1000 && planning ? 'urgent' : ''}`}>
      <div><span className="eyebrow">Round {gameState?.tick || 0}</span><strong>{planning ? 'Make your move' : 'The showdown'}</strong><b>{planning ? `${(left / 1000).toFixed(1)}s` : 'DRAW'}</b></div>
      <div className="round-track"><i style={{ width: `${Math.min(100, left / (gameState?.config.tickDuration || 4000) * 100)}%` }} /></div>
    </section>
    <div className={`lock-strip ${confirmed ? 'confirmed' : ''}`} role="status" aria-live="polite">
      {confirmed ? <Check size={20} /> : pending ? <LoaderCircle size={20} className="spin" /> : <Crosshair size={20} />}
      <span>{!connected ? 'Reconnecting — hold tight' : !planning ? 'Watch the arena' : confirmed ? `${labels[confirmed]} · locked in` : pending ? `${labels[pending]} · sending…` : 'One action. Tap to lock it in.'}</span>
    </div>
    <div className="action-grid">{buttons.map(({ action, icon: Icon, key, note, ...rest }) => {
      const shot = 'shot' in rest;
      return <button key={action} className={`action-tile ${shot ? 'shot' : ''} ${chosen === action ? 'selected' : ''} ${action === 'RELOAD' ? 'reload-tile' : ''}`} disabled={disabled || (shot && ammo === 0) || (action === 'RELOAD' && ammo === 3)} onClick={() => submit(action)}>
        <Icon size={26} style={shot && player.team === 'outlaws' ? { transform: 'scaleX(-1)' } : undefined} /><span><strong>{labels[action]}</strong><small>{shot && ammo === 0 ? 'Reload to shoot' : note}</small></span><kbd>{key}</kbd>
      </button>;
    })}</div>
    {(error || notice) && <p className="controller-notice" role="status">{error || notice}</p>}
    <button className="quiet-button leave-button" onClick={onLeave}>Leave room</button>
  </main></WesternBackdrop>;
}
