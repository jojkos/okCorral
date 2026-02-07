import { useState, useEffect } from 'react';
import type { GameState, Player, Barrel, Bullet } from '../../shared/types';
import { socket } from '../socket';
import { playTickStart, playTickResolve } from '../sound';

interface ArenaProps {
  gameState: GameState;
}

export default function Arena({ gameState }: ArenaProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [activeBullets, setActiveBullets] = useState<Bullet[]>([]);

  const { config, players, barrels, tick, phase, tickStartTime } = gameState;

  useEffect(() => {
    if (phase !== 'planning' || !tickStartTime) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - tickStartTime;
      const remaining = Math.max(0, config.tickDuration - elapsed);
      setTimeLeft(remaining);
    }, 50);

    return () => clearInterval(interval);
  }, [phase, tickStartTime, config.tickDuration]);

  useEffect(() => {
    const handleTickEnd = ({ bullets }: { bullets: Bullet[] }) => {
      setActiveBullets(bullets);
      setTimeout(() => setActiveBullets([]), 800);
    };

    socket.on('tickEnd', handleTickEnd);
    socket.on('tickStart', playTickStart);
    socket.on('tickEnd', playTickResolve);
    return () => {
      socket.off('tickEnd', handleTickEnd);
      socket.off('tickStart', playTickStart);
      socket.off('tickEnd', playTickResolve);
    };
  }, []);

  const sheriffs = players.filter(p => p.team === 'sheriffs' && p.slot >= 0);
  const outlaws = players.filter(p => p.team === 'outlaws' && p.slot >= 0);

  const sheriffsAlive = sheriffs.filter(p => p.isAlive).length;
  const outlawsAlive = outlaws.filter(p => p.isAlive).length;

  const progress = phase === 'planning' ? (timeLeft / config.tickDuration) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#d4c4a8]">
      {/* Header HUD */}
      <div className="bg-neutral-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-3xl">⭐</span>
          <span className="text-3xl font-black text-blue-400">{sheriffsAlive}</span>
        </div>
        
        <div className="flex-1 mx-6 max-w-md">
          <div className="text-center text-lg font-bold uppercase tracking-wider text-yellow-500 mb-1" style={{ fontFamily: 'Rye, serif' }}>
            {phase === 'planning' && `Round ${tick}`}
            {phase === 'resolution' && '💥 Shootout!'}
          </div>
          <div className="relative h-4 bg-neutral-700 rounded-full overflow-hidden">
            <div 
              className={`absolute inset-y-0 left-0 transition-all duration-75 rounded-full ${
                progress < 30 ? 'bg-red-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {phase === 'planning' && (
            <div className="text-center text-sm font-mono mt-1 opacity-70">
              {(timeLeft / 1000).toFixed(1)}s
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-3xl font-black text-red-400">{outlawsAlive}</span>
          <span className="text-3xl">💀</span>
        </div>
      </div>

      {/* Arena */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-6">
        <div className="western-card bg-[#f6edd8] w-full max-w-6xl h-full min-h-[420px] p-6 relative overflow-hidden">
          {/* Center divider */}
          <div className="absolute inset-y-6 left-1/2 w-1 bg-amber-800/20 -translate-x-1/2" />
          <div className="absolute left-1/2 top-10 -translate-x-1/2 text-3xl opacity-30">⚔️</div>

          {/* Slots */}
          <div
            className="relative grid gap-4 h-full"
            style={{
              gridTemplateRows: `repeat(${config.slotsPerSide}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: config.slotsPerSide }).map((_, slot) => {
              const sheriffPlayer = sheriffs.find(p => p.slot === slot);
              const outlawPlayer = outlaws.find(p => p.slot === slot);
              const sheriffBarrel = barrels.find(b => b.team === 'sheriffs' && b.slot === slot);
              const outlawBarrel = barrels.find(b => b.team === 'outlaws' && b.slot === slot);
              return (
                <div key={`row-${slot}`} className="flex items-center gap-6">
                  <SlotSide player={sheriffPlayer} barrel={sheriffBarrel} team="sheriffs" />
                  <div className="flex-1 h-px bg-amber-900/15" />
                  <SlotSide player={outlawPlayer} barrel={outlawBarrel} team="outlaws" flipped />
                </div>
              );
            })}
          </div>

          {/* Bullet animations */}
          {activeBullets.map((bullet) => (
            <BulletAnimation key={bullet.id} bullet={bullet} config={config} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface SlotSideProps {
  player: Player | undefined;
  barrel: Barrel | undefined;
  team: 'sheriffs' | 'outlaws';
  flipped?: boolean;
}

function SlotSide({ player, barrel, team, flipped }: SlotSideProps) {
  const isSheriff = team === 'sheriffs';
  const isAlive = player?.isAlive ?? false;
  const isCovered = player?.isCovered && barrel && barrel.hp > 0;
  const barrelHp = barrel?.hp ?? 0;

  return (
    <div className={`flex items-center gap-4 ${flipped ? 'flex-row-reverse' : ''}`}>
      {/* Player Token (Circle) */}
      <div className={`relative transition-all duration-300 ${player ? '' : 'opacity-30'} ${player && !isAlive ? 'grayscale opacity-50' : ''}`}>
        <div className={`
          w-12 h-12 md:w-14 md:h-14 rounded-full shadow-lg border-3 flex items-center justify-center
          transition-all duration-200
          ${isSheriff 
            ? 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-900' 
            : 'bg-gradient-to-br from-red-500 to-red-700 border-red-900'
          }
          ${isAlive ? 'scale-100' : 'scale-90'}
        `}>
          {player && isAlive ? (
            <span className="text-white text-xl md:text-2xl font-bold">
              {player.name.charAt(0).toUpperCase()}
            </span>
          ) : player ? (
            <span className="text-2xl">💀</span>
          ) : (
            <span className="text-xl">•</span>
          )}
        </div>

        {/* HP Pips above player */}
        {player && isAlive && (
          <div className={`absolute -top-2 left-1/2 -translate-x-1/2 flex gap-0.5`}>
            {[0, 1, 2].map(i => (
              <div 
                key={i} 
                className={`w-2.5 h-2.5 rounded-full border border-black/40 transition-colors ${
                  i < player.hp 
                    ? 'bg-green-400 shadow-sm' 
                    : 'bg-red-900/60'
                }`}
              />
            ))}
          </div>
        )}

        {/* Ammo indicators below */}
        {player && isAlive && (
          <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5`}>
            {[0, 1, 2].map(i => (
              <div 
                key={i} 
                className={`w-1.5 h-3 rounded-sm border border-black/30 ${
                  i < player.ammo 
                    ? 'bg-yellow-400' 
                    : 'bg-neutral-400/40'
                }`}
              />
            ))}
          </div>
        )}

        {/* Action locked indicator */}
        {player && isAlive && player.actionLocked && (
          <div className="absolute -right-1 -top-1 w-4 h-4 bg-yellow-400 rounded-full animate-pulse border-2 border-black/30" />
        )}
      </div>

      {/* Barrel (tied to slot) */}
      <div className={`relative transition-all duration-300 ${flipped ? 'mr-1' : 'ml-1'} ${isCovered ? 'ring-2 ring-green-400 ring-offset-2' : ''}`}>
        <div className={`
          transition-all duration-300 rounded-lg border-2 flex items-center justify-center font-bold
          w-10 h-14 md:w-11 md:h-16
          ${barrelHp === 3 ? 'bg-amber-600 border-amber-900 text-amber-100' :
            barrelHp === 2 ? 'bg-amber-500 border-amber-800 text-amber-900' :
            barrelHp === 1 ? 'bg-amber-400 border-amber-700 text-amber-900' :
            'bg-neutral-300 border-neutral-400 text-neutral-500 opacity-40'
          }
        `}>
          {barrelHp > 0 ? (
            <div className="flex flex-col items-center">
              <span className="text-xs">🛢️</span>
              <div className="flex gap-px mt-0.5">
                {[0, 1, 2].map(i => (
                  <div 
                    key={i} 
                    className={`w-1.5 h-1.5 rounded-full ${
                      i < barrelHp ? 'bg-green-400' : 'bg-red-800/50'
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <span className="text-xs opacity-50">×</span>
          )}
        </div>

        {/* Cover shield overlay */}
        {isCovered && (
          <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 border border-black/30 shadow">
            <span className="text-xs">🛡️</span>
          </div>
        )}
      </div>

      {/* Name tag */}
      {player && (
        <div className={`hidden md:block px-2 py-0.5 bg-black/80 text-white text-xs rounded-full font-mono max-w-24 truncate ${
          !isAlive ? 'line-through opacity-50' : ''
        }`}>
          {player.name}
        </div>
      )}
    </div>
  );
}

interface BulletAnimationProps {
  bullet: Bullet;
  config: { slotsPerSide: number };
}

function BulletAnimation({ bullet, config }: BulletAnimationProps) {
  const slotPercent = 100 / config.slotsPerSide;
  const fromTop = bullet.fromSlot * slotPercent + slotPercent / 2;
  
  const isFromSheriff = bullet.fromTeam === 'sheriffs';
  const startX = isFromSheriff ? '20%' : '80%';
  const endX = isFromSheriff ? '80%' : '20%';
  
  // Calculate trajectory offset
  let toTop = fromTop;
  if (bullet.trajectory === 'up') toTop = Math.max(0, fromTop - slotPercent);
  if (bullet.trajectory === 'down') toTop = Math.min(100, fromTop + slotPercent);

  return (
    <div
      className="absolute w-5 h-2 rounded-full z-20 pointer-events-none"
      style={{
        left: startX,
        top: `${fromTop}%`,
        transform: 'translate(-50%, -50%)',
        background: bullet.hit === 'player' ? '#ef4444' : 
                   bullet.hit === 'barrel' ? '#f59e0b' : 
                   bullet.hit === 'bullet' ? '#fbbf24' : '#facc15',
        boxShadow: '0 0 8px rgba(250, 204, 21, 0.6)',
        animation: `bulletFly 0.4s ease-out forwards`,
        '--end-x': endX,
        '--end-y': `${toTop}%`,
      } as React.CSSProperties}
    >
      {bullet.hit === 'player' && <span className="absolute -top-2 -right-2 text-lg">💥</span>}
      {bullet.hit === 'barrel' && <span className="absolute -top-2 -right-2 text-sm">💨</span>}
    </div>
  );
}
