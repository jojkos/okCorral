import { useEffect, useState } from 'react';
import type { GameState } from '../../../shared/types';
import { socket, serverNow } from '../../socket';
import { VOLLEY } from '../../lib/presentation';
import { personalRecap, roundHeadline, type RecapLine } from '../../lib/recap';

export interface RoundRecap { tick: number; startedAt: number; lines: RecapLine[]; headline: string | null }

// Module scope so the buzz fires once per round even when the phone swaps
// Controller → DeadScreen at the very moment of impact.
let handledRound: number | null = null;
let lastRecap: RoundRecap | null = null;
// The UI receives a "presented" state whose hp/alive flags lag until impact;
// the recap headline needs the authoritative outcome, so keep the raw one.
let raw: GameState | null = null;
const keep = (s: GameState) => { if (!raw || raw.roomCode !== s.roomCode || s.revision >= raw.revision) raw = s; };
const keepEnd = ({ state }: { state: GameState }) => keep(state);
// (Re)attach idempotently: ClientApp's cleanup calls socket.off('gameState')
// without a handler, which would silently drop a listener added only once.
function listen() {
  socket.off('gameState', keep); socket.on('gameState', keep);
  socket.off('tickEnd', keepEnd); socket.on('tickEnd', keepEnd);
}
listen();

const HIT = [80, 40, 120], BLOCK = [30, 30, 30], KILL = [40, 30, 40, 30, 90];

function buzz(gs: GameState, meId: string) {
  const bullets = gs.lastTickBullets || [];
  const hit = bullets.some(b => b.targetId === meId && b.hit === 'player');
  const kill = bullets.some(b => b.shooterId === meId && b.lethal);
  const blocked = bullets.some(b => b.targetId === meId && b.hit === 'barrel');
  const parts = [hit && HIT, kill && KILL, !hit && blocked && BLOCK].filter(Boolean) as number[][];
  if (!parts.length) return;
  const pattern = parts.reduce<number[]>((acc, p) => (acc.length ? [...acc, 140, ...p] : [...p]), []);
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

// Watches the resolution timeline and, once bullets land (VOLLEY.impact),
// fires haptics and snapshots the personal recap for this round.
export function useRoundFeedback(gs: GameState | null, meId: string) {
  const [recap, setRecap] = useState<RoundRecap | null>(lastRecap);
  const startedAt = gs?.phase === 'resolution' ? gs.resolutionStartedAt : undefined;
  useEffect(listen, []);
  useEffect(() => {
    if (startedAt == null) return;
    const check = () => {
      const elapsed = serverNow() - startedAt;
      if (elapsed < VOLLEY.impact) return false;
      if (handledRound === startedAt) { if (lastRecap?.startedAt === startedAt) setRecap(lastRecap); return true; }
      const state = raw && raw.resolutionStartedAt === startedAt ? raw : gs;
      if (!state) return true;
      handledRound = startedAt;
      // Don't buzz for a stale round seen after a reconnect.
      if (elapsed < VOLLEY.settle + 800) buzz(state, meId);
      const me = state.players.find(p => p.id === meId);
      if (me) {
        lastRecap = { tick: state.tick, startedAt, lines: personalRecap(state, me), headline: roundHeadline(state) };
        setRecap(lastRecap);
      }
      return true;
    };
    if (check()) return;
    const t = setInterval(() => { if (check()) clearInterval(t); }, 40);
    return () => clearInterval(t);
    // gs identity changes every frame during resolution; key on the round only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, meId]);
  return recap;
}
