import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClientPlayer, GameState, ActionType } from '../../shared/types';
import { socket } from '../socket';
import { playTickStart, playTickResolve, playLockAction, playDeath, playDenied } from '../sound';
import {
  WesternBackdrop,
  MiniCowboy,
  WesternBtn,
  westernStyles as S,
} from '../components/WesternUI';

interface ControllerProps {
  player: ClientPlayer;
  gameState: GameState | null;
  error: string | null;
  onLeave: () => void;
}

export default function Controller({ player, gameState, error, onLeave }: ControllerProps) {
  const [lockedAction, setLockedAction] = useState<ActionType | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const myPlayer = gameState?.players.find((p) => p.id === player.id);
  const isPlanning = gameState?.phase === 'planning';
  const isLobby = gameState?.phase === 'lobby';

  useEffect(() => {
    if (!isPlanning || !gameState?.tickStartTime) {
      setTimeLeft(0);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - gameState.tickStartTime!;
      const remaining = Math.max(0, gameState.config.tickDuration - elapsed);
      setTimeLeft(remaining);
    }, 50);
    return () => clearInterval(interval);
  }, [isPlanning, gameState?.tickStartTime, gameState?.config.tickDuration]);

  useEffect(() => { setLockedAction(null); }, [gameState?.tick]);

  useEffect(() => {
    socket.on('tickStart', playTickStart);
    socket.on('tickEnd', playTickResolve);
    return () => {
      socket.off('tickStart', playTickStart);
      socket.off('tickEnd', playTickResolve);
    };
  }, []);

  // When the server confirms the lock (actionLocked flips true), cancel the
  // pending ack-timeout so we don't revert a valid lock.
  useEffect(() => {
    if (myPlayer?.actionLocked) clearAckTimer();
  }, [myPlayer?.actionLocked]);
  useEffect(() => () => clearAckTimer(), []);

  // Death SFX: fire once when this player transitions alive → dead.
  const wasAliveRef = useRef(true);
  useEffect(() => {
    if (myPlayer) {
      if (wasAliveRef.current && !myPlayer.isAlive) {
        playDeath();
      }
      wasAliveRef.current = myPlayer.isAlive;
    }
  }, [myPlayer?.isAlive, myPlayer]);

  // Ack tracking: when we emit a lockAction we give the server a short window
  // to echo it back. If actionLocked doesn't flip true in time we assume the
  // emit raced against a phase change and revert the optimistic lock.
  const lockAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAckTimer = () => {
    if (lockAckTimerRef.current) {
      clearTimeout(lockAckTimerRef.current);
      lockAckTimerRef.current = null;
    }
  };

  const handleAction = useCallback((action: ActionType) => {
    if (lockedAction || !isPlanning || !myPlayer?.isAlive) return;
    if (action.startsWith('SHOOT') && (myPlayer?.ammo || 0) <= 0) return;
    if (action === 'RELOAD' && (myPlayer?.ammo || 0) >= 3) return;
    setLockedAction(action);
    socket.emit('lockAction', action);
    playLockAction();
    try { navigator.vibrate?.(50); } catch { /* vibration unavailable */ }

    clearAckTimer();
    lockAckTimerRef.current = setTimeout(() => {
      lockAckTimerRef.current = null;
      setLockedAction((cur) => (cur === action ? null : cur));
      playDenied();
    }, 600);
  }, [lockedAction, isPlanning, myPlayer]);

  const hp = myPlayer?.hp ?? 3;
  const ammo = myPlayer?.ammo ?? 1;
  const progressPct = isPlanning ? (timeLeft / (gameState?.config.tickDuration || 4000)) * 100 : 0;
  const isSheriff = player.team === 'sheriffs';
  const teamColor = isSheriff ? '#3a6fb5' : '#b53a3a';

  if (isLobby) {
    return (
      <WesternBackdrop>
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            gap: 20,
            textAlign: 'center',
          }}
        >
          <MiniCowboy team={player.team ?? 'sheriffs'} size={120} />
          <div>
            <h1 style={{ ...S.title, fontSize: 36, margin: 0, color: teamColor }}>
              {isSheriff ? 'SHERIFF' : 'OUTLAW'}
            </h1>
            <div style={{ ...S.serif, color: '#f4e9d6', fontSize: 22, letterSpacing: 1, marginTop: 4 }}>{player.name}</div>
            <div style={{ ...S.mono, fontSize: 11, color: '#d9cbb0', opacity: 0.6, letterSpacing: 2, marginTop: 4 }}>
              SLOT {(player.slot || 0) + 1}
            </div>
          </div>
          <div style={{ ...S.mono, fontSize: 13, color: '#e0b04a', letterSpacing: 2, opacity: 0.8 }}>
            Waitin' on the Marshal to call it…
          </div>
          <WesternBtn primary big onClick={() => socket.emit('startGame')}>▶ START GUNFIGHT</WesternBtn>
          <button
            onClick={onLeave}
            style={{
              background: 'transparent',
              border: 'none',
              ...S.mono,
              fontSize: 10,
              color: '#d9cbb0',
              opacity: 0.5,
              letterSpacing: 2,
              cursor: 'pointer',
              marginTop: 20,
            }}
          >
            LEAVE ROOM
          </button>
        </div>
      </WesternBackdrop>
    );
  }

  const phaseLabel = isPlanning
    ? `PLANNING · ${(timeLeft / 1000).toFixed(1)}s`
    : gameState?.phase === 'resolution' ? 'SHOOTOUT'
    : (gameState?.phase || '').toUpperCase();

  return (
    <WesternBackdrop>
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top HUD */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(224,176,74,0.2)', background: 'rgba(15,8,4,0.8)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ ...S.mono, fontSize: 10, color: '#e0b04a', letterSpacing: 2, fontWeight: 'bold' }}>{phaseLabel}</div>
            <div style={{ ...S.mono, fontSize: 10, color: '#d9cbb0', opacity: 0.7, letterSpacing: 1 }}>
              ROUND {gameState?.tick || 0} · SLOT {(myPlayer?.slot ?? player.slot ?? 0) + 1}
            </div>
          </div>
          <div
            style={{
              height: 8,
              background: 'rgba(0,0,0,0.6)',
              borderRadius: 4,
              border: '1px solid rgba(224,176,74,0.3)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: progressPct < 30 ? '#e03a3a' : '#ffd875',
                boxShadow: '0 0 8px #ffd875',
                transition: 'width 80ms linear',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <svg key={i} width={22} height={22} viewBox="0 0 24 24">
                  <path
                    d="M 12 21 C 2 14, 2 5, 7 5 C 10 5, 12 8, 12 8 C 12 8, 14 5, 17 5 C 22 5, 22 14, 12 21 Z"
                    fill={i < hp ? '#ff4c4c' : '#2a1012'}
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth="1"
                  />
                </svg>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 14,
                    height: 18,
                    borderRadius: 2,
                    background: i < ammo ? '#ffd875' : '#333',
                    border: '1px solid #1a1410',
                    boxShadow: i < ammo ? '0 0 4px #ffd875' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Portrait */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <MiniCowboy team={player.team ?? 'sheriffs'} size={120} />
            <div style={{ ...S.serif, color: '#f4e9d6', fontSize: 22, letterSpacing: 2, marginTop: 6 }}>
              {player.name.toUpperCase()}
            </div>
            <div style={{ ...S.mono, fontSize: 10, color: teamColor, letterSpacing: 2, opacity: 0.8 }}>
              {(isSheriff ? 'SHERIFFS' : 'OUTLAWS')} · SLOT {(myPlayer?.slot ?? player.slot ?? 0) + 1}
            </div>
          </div>
          {lockedAction && (
            <div
              style={{
                position: 'absolute',
                inset: 20,
                border: '3px solid #4ade80',
                borderRadius: 8,
                background: 'rgba(74,222,128,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(2px)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 60 }}>🔒</div>
                <div style={{ ...S.title, fontSize: 24, color: '#4ade80', letterSpacing: 3 }}>LOCKED IN</div>
                <div style={{ ...S.mono, fontSize: 11, color: '#d9cbb0', opacity: 0.8, letterSpacing: 2, marginTop: 4 }}>
                  {lockedAction.replace('_', ' ')}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              margin: '0 18px',
              padding: '10px 14px',
              background: 'rgba(181,58,58,0.15)',
              border: '2px solid #b53a3a',
              borderRadius: 4,
              color: '#ff8080',
              textAlign: 'center',
              ...S.mono,
              fontWeight: 'bold',
            }}
          >
            {error}
          </div>
        )}

        {/* Controls */}
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DpadBtn label="▲ UP" disabled={!!lockedAction || !isPlanning} onClick={() => handleAction('MOVE_UP')} active={lockedAction === 'MOVE_UP'} />
            <DpadBtn label="▼ DOWN" disabled={!!lockedAction || !isPlanning} onClick={() => handleAction('MOVE_DOWN')} active={lockedAction === 'MOVE_DOWN'} />
            <ActionBtn color="#3a6fb5" icon="🛡" label="COVER" disabled={!!lockedAction || !isPlanning} onClick={() => handleAction('COVER')} active={lockedAction === 'COVER'} />
            <ActionBtn color="#e0b04a" icon="⟳" label="RELOAD" disabled={!!lockedAction || !isPlanning || ammo >= 3} onClick={() => handleAction('RELOAD')} active={lockedAction === 'RELOAD'} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionBtn color="#b53a3a" icon={isSheriff ? '↗' : '↖'} label="SHOOT UP" disabled={!!lockedAction || !isPlanning || ammo <= 0} onClick={() => handleAction('SHOOT_UP')} active={lockedAction === 'SHOOT_UP'} />
            <ActionBtn color="#b53a3a" icon={isSheriff ? '→' : '←'} label="SHOOT" primary disabled={!!lockedAction || !isPlanning || ammo <= 0} onClick={() => handleAction('SHOOT_STRAIGHT')} active={lockedAction === 'SHOOT_STRAIGHT'} />
            <ActionBtn color="#b53a3a" icon={isSheriff ? '↘' : '↙'} label="SHOOT DOWN" disabled={!!lockedAction || !isPlanning || ammo <= 0} onClick={() => handleAction('SHOOT_DOWN')} active={lockedAction === 'SHOOT_DOWN'} />
          </div>
          <button
            onClick={onLeave}
            style={{
              gridColumn: '1 / -1',
              background: 'transparent',
              border: 'none',
              ...S.mono,
              fontSize: 10,
              color: '#d9cbb0',
              opacity: 0.5,
              letterSpacing: 2,
              cursor: 'pointer',
              marginTop: 8,
            }}
          >
            LEAVE ROOM
          </button>
        </div>
      </div>
    </WesternBackdrop>
  );
}

function DpadBtn({ label, disabled, onClick, active }: { label: string; disabled: boolean; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        minHeight: 70,
        background: active
          ? 'linear-gradient(180deg, #4ade80 0%, #16a34a 100%)'
          : disabled
            ? 'rgba(30,15,6,0.5)'
            : 'linear-gradient(180deg, #3a2414 0%, #1f140a 100%)',
        border: `2px solid ${active ? '#4ade80' : disabled ? '#3e2417' : '#6b4423'}`,
        borderRadius: 6,
        color: active ? '#1a0e08' : disabled ? '#6b4423' : '#f4e9d6',
        fontFamily: "'Space Mono', monospace",
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !active ? 0.5 : 1,
        boxShadow: disabled ? 'none' : '0 3px 0 rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,200,150,0.15)',
      }}
    >
      {label}
    </button>
  );
}

function ActionBtn({
  color,
  icon,
  label,
  primary,
  disabled,
  onClick,
  active,
}: {
  color: string;
  icon: string;
  label: string;
  primary?: boolean;
  disabled: boolean;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active
          ? 'linear-gradient(180deg, #4ade80 0%, #16a34a 100%)'
          : disabled
            ? 'rgba(30,15,6,0.5)'
            : primary
              ? `linear-gradient(180deg, ${color} 0%, ${color}99 100%)`
              : 'linear-gradient(180deg, #3a2414 0%, #1f140a 100%)',
        border: `2px solid ${active ? '#4ade80' : disabled ? '#3e2417' : color}`,
        borderRadius: 6,
        color: active ? '#1a0e08' : disabled ? '#6b4423' : primary ? '#f4e9d6' : color,
        fontFamily: "'Space Mono', monospace",
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !active ? 0.5 : 1,
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: disabled ? 'none' : primary ? `0 3px 0 ${color}66` : '0 3px 0 rgba(0,0,0,0.7)',
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ marginTop: 2 }}>{label}</div>
    </button>
  );
}
