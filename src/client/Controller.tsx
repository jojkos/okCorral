import { useState, useEffect, useCallback } from 'react';
import type { ClientPlayer, GameState, ActionType } from '../../shared/types';
import { socket } from '../socket';
import { WesternButton } from '../components/WesternButton';
import { playTickStart, playTickResolve } from '../sound';

interface ControllerProps {
  player: ClientPlayer;
  gameState: GameState | null;
  error: string | null;
  onLeave: () => void;
}

export default function Controller({ player, gameState, error, onLeave }: ControllerProps) {
  const [lockedAction, setLockedAction] = useState<ActionType | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const myPlayer = gameState?.players.find(p => p.id === player.id);
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

  useEffect(() => {
    setLockedAction(null);
  }, [gameState?.tick]);

  useEffect(() => {
    const handleTickStart = () => playTickStart();
    const handleTickEnd = () => playTickResolve();
    socket.on('tickStart', handleTickStart);
    socket.on('tickEnd', handleTickEnd);
    return () => {
      socket.off('tickStart', handleTickStart);
      socket.off('tickEnd', handleTickEnd);
    };
  }, []);

  const handleAction = useCallback((action: ActionType) => {
    if (lockedAction || !isPlanning || !myPlayer?.isAlive) return;

    if (action.startsWith('SHOOT') && (myPlayer?.ammo || 0) <= 0) return;
    if (action === 'RELOAD' && (myPlayer?.ammo || 0) >= 3) return;

    setLockedAction(action);
    socket.emit('lockAction', action);

    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }, [lockedAction, isPlanning, myPlayer]);

  const hp = myPlayer?.hp ?? 3;
  const ammo = myPlayer?.ammo ?? 1;
  const progress = isPlanning ? (timeLeft / (gameState?.config.tickDuration || 4000)) * 100 : 0;

  if (isLobby) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="western-card text-center p-8 max-w-sm w-full">
          <div className="text-5xl mb-4">
            {player.team === 'sheriffs' ? '⭐' : '💀'}
          </div>
          <h2 className="text-2xl mb-2 uppercase">
            <span className={player.team === 'sheriffs' ? 'text-blue-800' : 'text-red-800'}>
              {player.team === 'sheriffs' ? 'Sheriff' : 'Outlaw'}
            </span>{' '}
            {player.name}
          </h2>
          <p className="text-lg text-neutral-600 mb-6">Slot {(player.slot || 0) + 1}</p>
          
          <div className="animate-pulse text-xl text-neutral-500 mb-8">
            Waiting for game to start...
          </div>

          <WesternButton
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => socket.emit('startGame')}
          >
            🎮 Start Gunfight!
          </WesternButton>
        </div>
      </div>
    );
  }

  const teamLabel = myPlayer?.team === 'sheriffs' ? 'Sheriffs' : 'Outlaws';
  const teamAccent = myPlayer?.team === 'sheriffs' ? 'text-blue-800' : 'text-red-800';
  const teamBadge = myPlayer?.team === 'sheriffs' ? '⭐' : '💀';

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 gap-4 bg-[#f3e9d4]">
      <div className="western-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full border-2 border-amber-800 flex items-center justify-center">
              {teamBadge}
            </div>
            <div>
              <div className={`text-sm uppercase font-bold ${teamAccent}`}>{teamLabel}</div>
              <div className="text-xs text-neutral-500">{player.name}</div>
            </div>
          </div>

          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">Round</div>
            <div className="text-2xl font-bold uppercase text-amber-700" style={{ fontFamily: 'Rye, serif' }}>
              {gameState?.tick || 0}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="text-[10px] uppercase tracking-wider text-neutral-500 hover:text-neutral-700"
              onClick={onLeave}
            >
              Leave
            </button>
            <div className="flex items-center gap-1">
              {[0, 1, 2].map(i => (
                <span key={i} className={`text-xl ${i < hp ? 'text-red-500' : 'text-neutral-400'}`}>
                  ❤
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {[0, 1, 2].map(i => (
                <span key={i} className={`text-xl ${i < ammo ? 'text-yellow-600' : 'text-neutral-400'}`}>
                  •
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 h-2 bg-amber-200 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-100 ${progress < 30 ? 'bg-red-500' : 'bg-amber-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {lockedAction && (
          <div className="mt-2 text-center text-xs font-bold uppercase text-green-700">
            ✓ Action Locked
          </div>
        )}
      </div>

      {error && (
        <div className="western-card p-3 text-red-700 text-center font-bold">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 gap-4">
        <div className="western-card p-4">
          <div className="text-center text-sm font-bold uppercase text-neutral-600 mb-4">Move</div>
          <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
            <div />
            <button
              className={`ctrl-btn aspect-square flex items-center justify-center text-4xl ${
                lockedAction === 'MOVE_UP' ? 'locked' : ''
              }`}
              onClick={() => handleAction('MOVE_UP')}
              disabled={!!lockedAction || !isPlanning}
            >
              ⬆️
            </button>
            <div />

            <div />
            <div className="flex items-center justify-center text-2xl text-neutral-400">🚶</div>
            <div />

            <div />
            <button
              className={`ctrl-btn aspect-square flex items-center justify-center text-4xl ${
                lockedAction === 'MOVE_DOWN' ? 'locked' : ''
              }`}
              onClick={() => handleAction('MOVE_DOWN')}
              disabled={!!lockedAction || !isPlanning}
            >
              ⬇️
            </button>
            <div />
          </div>
        </div>

        <div className="western-card p-4">
          <div className="text-center text-sm font-bold uppercase text-neutral-600 mb-4">Actions</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="western-card p-3" style={{ borderColor: '#dc2626', borderWidth: '3px' }}>
              <div className="text-center text-xs font-bold uppercase text-red-800 mb-2">Shoot</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  className={`ctrl-btn flex flex-col items-center justify-center text-lg ${
                    lockedAction === 'SHOOT_UP' ? 'locked' : ''
                  }`}
                  onClick={() => handleAction('SHOOT_UP')}
                  disabled={!!lockedAction || !isPlanning || ammo <= 0}
                  style={{ backgroundColor: ammo > 0 ? '#fef2f2' : undefined }}
                >
                  🔫
                  <span className="text-xs">↗</span>
                </button>
                <button
                  className={`ctrl-btn flex flex-col items-center justify-center text-lg ${
                    lockedAction === 'SHOOT_STRAIGHT' ? 'locked' : ''
                  }`}
                  onClick={() => handleAction('SHOOT_STRAIGHT')}
                  disabled={!!lockedAction || !isPlanning || ammo <= 0}
                  style={{ backgroundColor: ammo > 0 ? '#fef2f2' : undefined }}
                >
                  🔫
                  <span className="text-xs">→</span>
                </button>
                <button
                  className={`ctrl-btn flex flex-col items-center justify-center text-lg ${
                    lockedAction === 'SHOOT_DOWN' ? 'locked' : ''
                  }`}
                  onClick={() => handleAction('SHOOT_DOWN')}
                  disabled={!!lockedAction || !isPlanning || ammo <= 0}
                  style={{ backgroundColor: ammo > 0 ? '#fef2f2' : undefined }}
                >
                  🔫
                  <span className="text-xs">↘</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                className={`ctrl-btn flex-1 flex flex-col items-center justify-center ${
                  lockedAction === 'RELOAD' ? 'locked' : ''
                }`}
                onClick={() => handleAction('RELOAD')}
                disabled={!!lockedAction || !isPlanning || ammo >= 3}
              >
                <span className="text-3xl">🔄</span>
                <span className="text-xs font-bold uppercase">Reload</span>
              </button>
              <button
                className={`ctrl-btn flex-1 flex flex-col items-center justify-center ${
                  lockedAction === 'COVER' ? 'locked' : ''
                }`}
                onClick={() => handleAction('COVER')}
                disabled={!!lockedAction || !isPlanning}
                style={{ backgroundColor: '#dbeafe' }}
              >
                <span className="text-3xl">🛡️</span>
                <span className="text-xs font-bold uppercase">Cover</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
