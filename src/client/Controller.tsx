import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUp, ArrowDown, ArrowUpRight, ArrowDownRight, ArrowRight, Shield, RotateCw, Check, LoaderCircle, Heart, Crosshair, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import type { ClientPlayer, GameState, ActionType } from '../../shared/types';
import { socket, serverNow } from '../socket';
import { VOLLEY } from '../lib/presentation';
import { playTickStart, playTickResolve, playLockAction } from '../sound';
import * as sfx from '../sound';
import { WesternBackdrop } from '../components/WesternUI';
import CowboyPortrait from '../components/CowboyPortrait';
import LaneMiniMap, { type MapHighlight } from './components/LaneMiniMap';
import { MOVE_OFFSET, SHOT_OFFSET, movePreview, shotPreview, threatsTo, type Preview } from './components/boardInfo';
import { useRoundFeedback } from './components/useRoundFeedback';
import RecapCard from './components/RecapCard';
import './controller.css';

interface ControllerProps { player: ClientPlayer; gameState: GameState | null; error: string | null; onLeave: () => void }
const labels: Record<ActionType, string> = { MOVE_UP: 'Move up', MOVE_DOWN: 'Move down', COVER: 'Take cover', RELOAD: 'Reload', SHOOT_UP: 'Shoot up', SHOOT_STRAIGHT: 'Shoot straight', SHOOT_DOWN: 'Shoot down', NONE: 'No action' };
const RECAP_PLANNING_MS = 2500;
export default function Controller({ player, gameState, error, onLeave }: ControllerProps) {
  const mine = gameState?.players.find(p => p.id === player.id);
  const [pending, setPending] = useState<ActionType | null>(null);
  // The server hides everyone's choice during planning, so remember our own from the ack.
  const [lockedAs, setLockedAs] = useState<ActionType | null>(null);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(serverNow);
  const [connected, setConnected] = useState(socket.connected);
  const [hover, setHover] = useState<ActionType | null>(null);
  const [dismissedRecap, setDismissedRecap] = useState<number | null>(null);
  const current = useRef(gameState); current.current = gameState;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const planning = gameState?.phase === 'planning';
  const confirmed = mine?.actionLocked ? (lockedAs ?? (mine.currentAction !== 'NONE' ? mine.currentAction : 'NONE')) : null;
  const chosen = confirmed || pending;
  const hp = mine?.hp ?? 3, ammo = mine?.ammo ?? 1;
  const slot = mine?.slot ?? player.slot;
  const lanes = gameState?.config.slotsPerSide ?? 5;
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
  useEffect(() => { setPending(null); setLockedAs(null); setNotice(''); inFlight.current = false; }, [gameState?.tick, gameState?.roomCode]);
  useEffect(() => { if (confirmed) { setPending(null); inFlight.current = false; setNotice(''); } }, [confirmed]);
  const submit = useCallback((action: ActionType) => {
    if (!socket.connected || !planning || !mine?.isAlive || confirmed || pending || inFlight.current) return;
    if ((action.startsWith('SHOOT') && ammo === 0) || (action === 'RELOAD' && ammo === 3)) return;
    // Presentation guard: these tiles are disabled because the server would ignore them.
    const offset = SHOT_OFFSET[action] ?? MOVE_OFFSET[action];
    if (offset != null && offset !== 0 && (mine.slot + offset < 0 || mine.slot + offset >= (gameState?.config.slotsPerSide ?? 5))) return;
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
        setPending(result.action || action); setLockedAs(result.action || action); playLockAction();
        navigator.vibrate?.(25);
      } else { setPending(null); setNotice(result.reason || 'Action unavailable'); }
    });
  }, [planning, mine?.isAlive, mine?.slot, confirmed, pending, ammo, gameState]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      const actions: Record<string, ActionType> = { w: 'MOVE_UP', s: 'MOVE_DOWN', a: 'COVER', r: 'RELOAD', q: 'SHOOT_UP', e: 'SHOOT_DOWN', ' ': 'SHOOT_STRAIGHT' };
      const action = actions[e.key.toLowerCase()]; if (action) { e.preventDefault(); submit(action); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [submit]);

  // Countdown urgency: last 3 seconds while nothing is locked → one tick + pulse per second.
  const secsLeft = Math.ceil(left / 1000);
  const urgent = planning && !chosen && left > 0 && left <= 3000;
  const pulsed = useRef('');
  useEffect(() => {
    if (!urgent || secsLeft < 1 || secsLeft > 3) return;
    const k = `${gameState?.tick}:${secsLeft}`;
    if (pulsed.current === k) return;
    pulsed.current = k;
    try { navigator.vibrate?.(18); } catch { /* unsupported */ }
    (sfx as any).playCountdownTick?.((4 - secsLeft) / 3);
  }, [urgent, secsLeft, gameState?.tick]);

  // Hits, blocks and kills buzz once per round at impact; recap is snapshotted then too.
  const recap = useRoundFeedback(gameState, player.id);
  const recapVisible = !!recap && !!gameState && dismissedRecap !== recap.startedAt && (
    (gameState.phase === 'resolution' && gameState.resolutionStartedAt === recap.startedAt && now >= recap.startedAt + VOLLEY.impact)
    || (planning && recap.tick === gameState.tick - 1 && now - (gameState.tickStartTime ?? 0) < RECAP_PLANNING_MS));

  useEffect(() => { if (!planning || chosen) setHover(null); }, [planning, chosen]);

  const disabled = !!chosen || !planning || !connected || !mine?.isAlive;
  const team = mine?.team ?? player.team ?? 'sheriffs';
  const previews: Partial<Record<ActionType, Preview | null>> = {};
  if (gameState && mine) for (const a of ['SHOOT_UP', 'SHOOT_STRAIGHT', 'SHOOT_DOWN'] as const) previews[a] = shotPreview(gameState, mine, a);
  if (gameState && mine) for (const a of ['MOVE_UP', 'MOVE_DOWN'] as const) previews[a] = movePreview(gameState, mine, a);
  const threats = gameState && mine?.isAlive ? threatsTo(gameState, mine) : [];
  const threatIds = new Set(threats.map(t => t.id));

  // Mini-map highlight: what you're pointing at (planning) or what you locked.
  const focus = (planning && !chosen ? hover : null) ?? chosen;
  let highlight: MapHighlight | null = null;
  if (focus && SHOT_OFFSET[focus] != null && previews[focus] && !previews[focus]!.offBoard) highlight = { kind: 'shot', lane: previews[focus]!.lane, locked: !!confirmed };
  else if (focus && MOVE_OFFSET[focus] != null && planning && previews[focus] && !previews[focus]!.offBoard) highlight = { kind: 'move', lane: previews[focus]!.lane, locked: !!confirmed };

  const coverOk = (barrel?.hp ?? 0) > 0;
  const tiles = [
    { action: 'MOVE_UP', icon: ArrowUp, key: 'W', area: 'mu' },
    { action: 'SHOOT_UP', icon: ArrowUpRight, key: 'Q', area: 'su', shot: true },
    { action: 'COVER', icon: Shield, key: 'A', area: 'cv' },
    { action: 'SHOOT_STRAIGHT', icon: ArrowRight, key: 'SPACE', area: 'ss', shot: true },
    { action: 'MOVE_DOWN', icon: ArrowDown, key: 'S', area: 'md' },
    { action: 'SHOOT_DOWN', icon: ArrowDownRight, key: 'E', area: 'sd', shot: true },
    { action: 'RELOAD', icon: RotateCw, key: 'R', area: 'rl' },
  ] as const;
  const noteFor = (action: ActionType, shot: boolean): { text: string; tone: string; off: boolean } => {
    if (shot && ammo === 0) return { text: 'Reload to shoot', tone: 'muted', off: false };
    const pv = previews[action];
    if (pv) return { text: pv.text, tone: pv.tone, off: pv.offBoard };
    if (action === 'COVER') return coverOk ? { text: `Barrel ${barrel!.hp}/3 holds`, tone: 'ok', off: false } : { text: "Barrel destroyed — cover won't help", tone: 'danger', off: false };
    if (action === 'RELOAD') return { text: ammo === 3 ? 'Ammo full' : `+1 bullet · ${ammo}/3`, tone: 'muted', off: false };
    return { text: '', tone: 'muted', off: false };
  };

  return <WesternBackdrop dark><main className="controller-shell ctl">
    <div className="ctl-top">
      <header className="ctl-head">
        <span className="ctl-portrait"><CowboyPortrait team={team} size={54} facing={team === 'outlaws' ? -1 : 1} /></span>
        <div className="ctl-who"><span className="eyebrow">{team === 'sheriffs' ? 'The law' : 'The wanted'} · Lane {slot + 1}/{lanes}</span><h1>{player.name}</h1></div>
        <div className="ctl-vitals">
          <div aria-label={`${hp} of 3 health`}>{[0, 1, 2].map(i => <Heart key={i} size={17} fill={i < hp ? '#f58b78' : 'transparent'} color={i < hp ? '#f58b78' : '#626b70'} />)}</div>
          <div aria-label={`${ammo} of 3 bullets`}>{[0, 1, 2].map(i => <i key={i} className={`cartridge ${i < ammo ? 'loaded' : ''}`} />)}</div>
        </div>
      </header>
      <section className={`ctl-round ${urgent ? 'urgent' : ''} ${planning ? '' : 'showdown'}`}>
        <div className="ctl-round-row">
          <span className="eyebrow">Round {gameState?.tick || 0}</span>
          <strong>{planning ? (chosen ? 'Locked. Hold steady' : urgent ? 'Hurry, partner!' : 'Make your move') : 'The showdown'}</strong>
          <b>{planning ? `${(left / 1000).toFixed(1)}s` : 'DRAW'}</b>
        </div>
        <div className="round-track"><i style={{ width: `${Math.min(100, left / (gameState?.config.tickDuration || 4000) * 100)}%` }} /></div>
      </section>
      {recapVisible && recap && <RecapCard recap={recap} onClose={() => setDismissedRecap(recap.startedAt)}
        footer={planning ? `Round ${gameState!.tick} · ${(left / 1000).toFixed(1)}s left` : 'Bullets landed'} />}
    </div>

    {gameState && <LaneMiniMap gameState={gameState} meId={player.id} team={team} highlight={highlight} threatIds={threatIds} showLocks={planning}
      footer={mine?.isAlive ? (threats.length
        ? <span className="mm-threat danger"><AlertTriangle size={13} /> {threats.length} gun{threats.length > 1 ? 's' : ''} can reach you{coverOk ? ' · duck or dodge' : ' · no barrel, move!'}</span>
        : <span className="mm-threat calm"><ShieldCheck size={13} /> No loaded guns can reach you</span>) : null} />}

    <div className={`lock-strip ctl-lock ${confirmed ? 'confirmed' : ''} ${urgent ? 'urgent' : ''}`} role="status" aria-live="polite">
      {confirmed ? <Check size={18} /> : pending ? <LoaderCircle size={18} className="spin" /> : <Crosshair size={18} />}
      <span>{!connected ? 'Reconnecting — hold tight' : !planning ? 'Watch the arena' : confirmed ? (confirmed === 'NONE' ? 'Action locked in' : `${labels[confirmed]} · locked in`) : pending ? `${labels[pending]} · sending…` : 'One action. Tap to lock it in.'}</span>
    </div>

    <div className="ctl-grid">{tiles.map(({ action, icon: Icon, key, area, ...rest }) => {
      const shot = 'shot' in rest;
      const note = noteFor(action, shot);
      const tileDisabled = disabled || note.off || (shot && ammo === 0) || (action === 'RELOAD' && ammo === 3);
      const enter = () => { if (!disabled) setHover(action); };
      const leave = () => setHover(h => (h === action ? null : h));
      return <button key={action} style={{ gridArea: area }}
        className={`ctl-tile ${shot ? 'shot' : ''} ${action === 'RELOAD' ? 'reload' : ''} ${chosen === action ? 'selected' : ''} ${hover === action && !chosen ? 'aiming' : ''} tone-${note.tone}`}
        disabled={tileDisabled} onClick={() => { (sfx as any).playUiTap?.(); submit(action); }}
        onPointerEnter={enter} onPointerDown={enter} onPointerLeave={leave} onPointerCancel={leave} onFocus={enter} onBlur={leave}>
        <Icon size={24} />
        <span className="ctl-tile-text"><strong>{labels[action]}</strong>{note.text && <small>{note.tone === 'danger' && <AlertTriangle size={10} />}{note.text}</small>}</span>
        {chosen === action && <Check className="ctl-tile-check" size={16} />}
        <kbd>{key}</kbd>
      </button>;
    })}</div>
    {(error || notice) && <p className="controller-notice" role="status">{error || notice}</p>}
    <button className="quiet-button leave-button" onClick={onLeave}><X size={11} /> Leave room</button>
  </main></WesternBackdrop>;
}
