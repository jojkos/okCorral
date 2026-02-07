import { useState, useEffect, useCallback } from 'react';
import type { ClientPlayer, GameState, ActionType } from '../../shared/types';
import { socket } from '../socket';
import { WesternButton } from '../components/WesternButton';
import { playTickStart, playTickResolve } from '../sound';
import { cn } from './lib/utils';

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

  // Tick timer
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

  // Reset locked action on new tick
  useEffect(() => {
    setLockedAction(null);
  }, [gameState?.tick]);

  // Sounds
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
  const isSheriff = player.team === 'sheriffs';

  if (isLobby) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <div className="western-card text-center p-8 max-w-sm w-full relative">
          <div className="text-6xl mb-4 filter drop-shadow-md">
            {isSheriff ? '⭐' : '💀'}
          </div>
          <h2 className={cn(
            "text-3xl mb-2 uppercase font-display",
            isSheriff ? "text-blue-800" : "text-red-800"
          )}>
            {isSheriff ? 'Sheriff' : 'Outlaw'}
          </h2>
          <div className="text-xl font-bold mb-6 text-foreground/80">
             {player.name}
          </div>
          <p className="text-lg text-neutral-600 mb-6 font-mono border-t border-b border-black/10 py-2">
            Slot {(player.slot || 0) + 1}
          </p>
          
          <div className="animate-pulse text-xl text-neutral-500 mb-8 font-bold">
            Waiting for game to start...
          </div>

          <WesternButton
            variant="primary"
            size="lg"
            className="w-full text-xl py-6 shadow-lg"
            onClick={() => socket.emit('startGame')}
          >
            🎮 Start Gunfight!
          </WesternButton>
        </div>
      </div>
    );
  }

  const teamAccent = isSheriff ? 'text-blue-800' : 'text-red-800';
  const teamBadge = isSheriff ? '⭐' : '💀';

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 gap-4 bg-background">
      {/* Header Info Card */}
      <div className="western-card p-3 md:p-4 shadow-md bg-white/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-full border-2 flex items-center justify-center bg-white shadow-sm",
              isSheriff ? "border-blue-700" : "border-red-700"
            )}>
              <span className="text-2xl">{teamBadge}</span>
            </div>
            <div>
              <div className={cn("text-xs uppercase font-bold tracking-wider", teamAccent)}>
                {isSheriff ? 'Sheriff' : 'Outlaw'}
              </div>
              <div className="text-sm font-bold text-foreground truncate max-w-[100px]">{player.name}</div>
            </div>
          </div>

          <div className="text-center bg-amber-100/50 px-3 py-1 rounded border border-amber-900/20">
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold">Round</div>
            <div className="text-2xl font-bold uppercase text-amber-900 leading-none font-display">
              {gameState?.tick || 0}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
             <div className="flex items-center gap-1 bg-white/80 px-2 py-0.5 rounded-full border border-black/5">
              {[0, 1, 2].map(i => (
                <span key={i} className={`text-sm transition-all ${i < hp ? 'opacity-100 scale-100' : 'opacity-20 scale-90 grayscale'}`}>
                  ❤
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-white/80 px-2 py-0.5 rounded-full border border-black/5">
              {[0, 1, 2].map(i => (
                <span key={i} className={`text-sm transition-all ${i < ammo ? 'opacity-100 scale-100 text-yellow-600' : 'opacity-20 scale-90 text-neutral-400'}`}>
                  ●
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Timer Bar */}
        <div className="mt-4 h-3 bg-neutral-200 rounded-full overflow-hidden border border-black/10 relative">
          <div 
            className={cn(
              "h-full transition-all duration-100 absolute left-0 top-0 bottom-0",
              progress < 30 ? 'bg-red-500' : 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {lockedAction && (
          <div className="mt-2 text-center text-xs font-bold uppercase text-green-700 animate-pulse bg-green-100 border border-green-300 rounded py-1">
            ✓ Action Locked
          </div>
        )}
      </div>

      {error && (
        <div className="western-card p-3 text-destructive text-center font-bold bg-destructive/10 border-destructive">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex-1 grid grid-cols-1 gap-4 pb-4">
        {/* Movement */}
        <div className="western-card p-4 relative overflow-hidden">
          <div className="text-center text-xs font-bold uppercase text-muted-foreground mb-2 mt-[-4px] tracking-widest">Move</div>
          
          <div className="flex items-center justify-center gap-6">
             <WesternButton
              variant="secondary"
              className={cn("h-20 w-20 rounded-full text-4xl shadow-md", lockedAction === 'MOVE_UP' && "ring-4 ring-green-500 bg-green-100")}
              onClick={() => handleAction('MOVE_UP')}
              disabled={!!lockedAction || !isPlanning}
            >
              ⬆️
            </WesternButton>

            <WesternButton
              variant="secondary"
              className={cn("h-20 w-20 rounded-full text-4xl shadow-md", lockedAction === 'MOVE_DOWN' && "ring-4 ring-green-500 bg-green-100")}
              onClick={() => handleAction('MOVE_DOWN')}
              disabled={!!lockedAction || !isPlanning}
            >
              ⬇️
            </WesternButton>
          </div>
        </div>

        {/* Actions */}
        <div className="western-card p-4 grid grid-cols-2 gap-4">
           {/* Shoot Controls */}
           <div className="col-span-1 bg-red-50/50 rounded-lg p-2 border border-red-900/10">
              <div className="text-center text-xs font-bold uppercase text-red-800/70 mb-2 tracking-widest">Shoot</div>
              <div className="flex flex-col gap-2">
                 <WesternButton
                    variant="danger"
                    className={cn("flex-1 text-2xl h-14", lockedAction === 'SHOOT_UP' && "ring-4 ring-green-500")}
                    onClick={() => handleAction('SHOOT_UP')}
                    disabled={!!lockedAction || !isPlanning || ammo <= 0}
                 >
                    ↗
                 </WesternButton>
                 <WesternButton
                    variant="danger"
                    className={cn("flex-1 text-2xl h-14", lockedAction === 'SHOOT_STRAIGHT' && "ring-4 ring-green-500")}
                    onClick={() => handleAction('SHOOT_STRAIGHT')}
                    disabled={!!lockedAction || !isPlanning || ammo <= 0}
                 >
                    →
                 </WesternButton>
                 <WesternButton
                    variant="danger"
                    className={cn("flex-1 text-2xl h-14", lockedAction === 'SHOOT_DOWN' && "ring-4 ring-green-500")}
                    onClick={() => handleAction('SHOOT_DOWN')}
                    disabled={!!lockedAction || !isPlanning || ammo <= 0}
                 >
                    ↘
                 </WesternButton>
              </div>
           </div>

           {/* Utility Controls */}
            <div className="col-span-1 flex flex-col gap-3">
               <WesternButton
                  variant="secondary"
                  className={cn("flex-1 flex-col h-auto py-2", lockedAction === 'RELOAD' && "ring-4 ring-green-500 bg-green-100")}
                  onClick={() => handleAction('RELOAD')}
                  disabled={!!lockedAction || !isPlanning || ammo >= 3}
               >
                  <span className="text-3xl mb-1">🔄</span>
                  <span className="text-[10px] font-bold uppercase">Reload</span>
               </WesternButton>
               
               <WesternButton
                  variant="secondary"
                  className={cn("flex-1 flex-col h-auto py-2 bg-blue-50 border-blue-200 text-blue-900", lockedAction === 'COVER' && "ring-4 ring-green-500 bg-green-100")}
                  onClick={() => handleAction('COVER')}
                  disabled={!!lockedAction || !isPlanning}
               >
                  <span className="text-3xl mb-1">🛡️</span>
                  <span className="text-[10px] font-bold uppercase">Cover</span>
               </WesternButton>
            </div>
        </div>

         <div className="text-center">
            <button
               className="text-xs font-bold uppercase text-muted-foreground hover:text-destructive transition-colors px-4 py-2"
               onClick={onLeave}
            >
               Leave Room
            </button>
         </div>
      </div>
    </div>
  );
}
