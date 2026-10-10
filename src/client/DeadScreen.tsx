import { useEffect, useRef, useState } from 'react';
import type { GameState, Team } from '../../shared/types';
import { serverNow } from '../socket';
import {
  WesternBackdrop,
  StarEmblem,
  SkullEmblem,
  WesternBtn,
} from '../components/WesternUI';
import { computeAwards, mvp } from '../lib/awards';
import LaneMiniMap from './components/LaneMiniMap';
import EmoteBar from './components/EmoteBar';
import { useRoundFeedback, type RoundRecap } from './components/useRoundFeedback';
import './controller.css';

interface DeadScreenProps {
  isEnded: boolean;
  winner: Team | 'draw' | null;
  playerTeam: Team | null;
  playerName?: string;
  deathTick?: number;
  gameState?: GameState | null;
  playerId?: string;
  onPlayAgain?: () => void;
  onEndSession?: () => void;
}

export default function DeadScreen({
  isEnded,
  winner,
  playerTeam,
  playerName,
  deathTick,
  gameState,
  playerId,
  onPlayAgain,
  onEndSession,
}: DeadScreenProps) {
  const me = gameState?.players.find(p => p.id === playerId);
  // Fires the death buzz (DeadScreen replaces the controller at impact).
  const recap = useRoundFeedback(isEnded ? null : gameState ?? null, playerId ?? '');
  const diedOn = me?.stats?.diedOnTick ?? deathTick;
  const deathRecap = useRef<RoundRecap | null>(null);
  if (recap && diedOn != null && recap.tick === diedOn) deathRecap.current = recap;

  if (isEnded) return <EndedView winner={winner} playerTeam={playerTeam} gameState={gameState ?? null} playerId={playerId} onPlayAgain={onPlayAgain} onEndSession={onEndSession} />;

  const killer = deathRecap.current?.lines.find(l => l.tone === 'bad')?.text;
  return (
    <WesternBackdrop dark>
      <main className="ds">
        <section className="ds-grave">
          <div className="ds-stone">
            <span className="ds-rip">R.I.P.</span>
            <strong>{(playerName || 'Unknown').toUpperCase()}</strong>
            <span className="ds-when">{diedOn != null ? `Gunned down · Round ${diedOn}` : 'Gunned down'}</span>
          </div>
          <div className="ds-copy">
            <h1>YOU'RE DEAD</h1>
            <p>{killer ? `${killer}.` : 'Watch yer team carry on.'} Maybe they'll avenge ya.</p>
          </div>
        </section>
        {gameState && <SpectateStatus gameState={gameState} />}
        {gameState && playerId && playerTeam && <LaneMiniMap gameState={gameState} meId={playerId} team={playerTeam} showLocks={gameState.phase === 'planning'} />}
        <EmoteBar label="Heckle from the grave" />
        <div className="ds-spectating">★ SPECTATING ★</div>
      </main>
    </WesternBackdrop>
  );
}

function SpectateStatus({ gameState }: { gameState: GameState }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => { const t = setInterval(() => setNow(serverNow()), 100); return () => clearInterval(t); }, []);
  const planning = gameState.phase === 'planning';
  const left = planning ? Math.max(0, (gameState.tickStartTime ?? now) + gameState.config.tickDuration - now) : 0;
  const alive = (t: Team) => gameState.players.filter(p => p.team === t && p.isAlive && p.slot >= 0).length;
  return (
    <section className="ds-status">
      <span className="eyebrow">Round {gameState.tick}</span>
      <strong>{planning ? 'Folks are aiming…' : 'The showdown'}</strong>
      <span className="ds-alive">Standing: <b className="sheriffs">{alive('sheriffs')} sheriffs</b> · <b className="outlaws">{alive('outlaws')} outlaws</b></span>
      <b className="ds-time">{planning ? `${(left / 1000).toFixed(1)}s` : 'DRAW'}</b>
    </section>
  );
}

function EndedView({ winner, playerTeam, gameState, playerId, onPlayAgain, onEndSession }: {
  winner: Team | 'draw' | null; playerTeam: Team | null; gameState: GameState | null; playerId?: string; onPlayAgain?: () => void; onEndSession?: () => void;
}) {
  const didWin = winner === playerTeam;
  const isDraw = winner === 'draw';
  const me = gameState?.players.find(p => p.id === playerId);
  const s = me?.stats;
  const awards = gameState ? computeAwards(gameState).filter(a => a.player.id === playerId) : [];
  const isMvp = !!gameState && !!playerId && mvp(gameState)?.id === playerId;
  const session = gameState?.session;
  const accuracy = s && s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : null;
  const stats = s ? [
    { k: 'Shots', v: s.shots },
    { k: 'Hits', v: s.hits },
    { k: 'Kills', v: s.kills },
    { k: 'Blocked', v: s.blocked },
    { k: 'Dmg taken', v: s.damageTaken },
    { k: 'Accuracy', v: accuracy == null ? '—' : `${accuracy}%` },
  ] : [];
  return (
    <WesternBackdrop dark>
      <main className="ds ds-ended">
        <section className={`ds-verdict ${isDraw ? 'draw' : didWin ? 'win' : 'loss'}`}>
          <span className="ds-stars">★ ★ ★</span>
          <h1>{isDraw ? 'DRAW' : didWin ? 'VICTORY' : 'DEFEAT'}</h1>
          <div className="ds-emblem">{isDraw ? <StarEmblem size={40} color="#8a621e" /> : playerTeam === 'sheriffs' ? <StarEmblem size={40} color="#ffd875" /> : <SkullEmblem size={40} />}</div>
          <p>
            {isDraw
              ? "everyone's in the dirt"
              : didWin
                ? (playerTeam === 'sheriffs' ? 'justice is served' : 'the law never stood a chance')
                : (winner === 'sheriffs' ? 'the sheriffs got ya' : 'the outlaws took the town')}
          </p>
          {me && <span className="ds-survived">{me.isAlive ? `You survived with ${me.hp} ♥` : `You fell in round ${s?.diedOnTick ?? '?'}`}</span>}
        </section>

        {(awards.length > 0 || isMvp) && (
          <section className="ds-awards">
            {isMvp && <div className="ds-award mvp"><span>⭐</span><div><strong>MVP</strong><small>Top gun of the match</small></div></div>}
            {awards.map(a => <div key={a.id} className="ds-award"><span>{a.icon}</span><div><strong>{a.title}</strong><small>{a.blurb}</small></div></div>)}
          </section>
        )}

        {stats.length > 0 && (
          <section className="ds-stats" aria-label="Your stats">
            {stats.map(x => <div key={x.k}><b>{x.v}</b><span>{x.k}</span></div>)}
          </section>
        )}

        {session && (
          <section className="ds-session" aria-label="Session score">
            <span className="eyebrow">Session</span>
            <div><span className="sheriffs">Sheriffs <b>{session.sheriffs}</b></span><i>–</i><span className="outlaws"><b>{session.outlaws}</b> Outlaws</span></div>
            {session.draws > 0 && <small>{session.draws} draw{session.draws > 1 ? 's' : ''}</small>}
          </section>
        )}

        <EmoteBar label={didWin ? 'Rub it in' : 'Tip your hat'} />

        <div className="ds-buttons">
          {onPlayAgain && <WesternBtn primary big onClick={onPlayAgain}>↺ PLAY AGAIN</WesternBtn>}
          {onEndSession && <WesternBtn big onClick={onEndSession}>✕ LEAVE GAME</WesternBtn>}
        </div>
      </main>
    </WesternBackdrop>
  );
}
