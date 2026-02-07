import { useState, useEffect } from 'react';
import type { GameState, Player, Barrel, Bullet } from '../../shared/types';
import { socket } from '../socket';
import { playTickStart, playTickResolve } from '../sound';
import { cn } from '../client/lib/utils';
import { Shield, Skull, Star, Zap, CircleDot } from 'lucide-react';

interface ArenaProps {
  gameState: GameState;
}

interface Projectile {
  id: string;
  startX: string;
  startY: string;
  endX: string;
  endY: string;
  team: 'sheriffs' | 'outlaws';
}

interface Impact {
  id: string;
  x: string;
  y: string;
  type: 'wood' | 'flesh';
}

export default function Arena({ gameState }: ArenaProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [impacts, setImpacts] = useState<Impact[]>([]);
  const [muzzleFlashes, setMuzzleFlashes] = useState<{id: string, x: string, y: string}[]>([]);

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
      
      const newProjectiles: Projectile[] = [];
      const newMuzzles: {id: string, x: string, y: string}[] = [];
      const newImpacts: Impact[] = [];

      bullets.forEach(b => {
         const isSheriff = b.fromTeam === 'sheriffs';
         const slotPercent = 100 / config.slotsPerSide;
         const rowCenter = b.fromSlot * slotPercent + slotPercent / 2;
         
         // Start Coordinates
         // Sheriffs at 35% (Right of Left Col), Outlaws at 65% (Left of Right Col)
         // Adjusting slightly to align with gun/barrel position
         const startX = isSheriff ? '25%' : '75%'; 
         const startY = `${rowCenter}%`;

         // End Coordinates
         // If hit, ends at target column (65% for Sheriffs shooting right, 35% for Outlaws shooting left)
         const targetX = isSheriff ? '75%' : '25%';
         let targetYVal = b.fromSlot; // default straight

         if (b.trajectory === 'up') targetYVal -= 1;
         if (b.trajectory === 'down') targetYVal += 1;
         
         const targetY = `${(targetYVal * slotPercent) + (slotPercent / 2)}%`;

         // 1. Muzzle Flash (Immediate)
         newMuzzles.push({
            id: `muzzle-${b.id}`,
            x: startX,
            y: startY
         });

         // 2. Projectile (Fly across)
         newProjectiles.push({
            id: `proj-${b.id}`,
            startX,
            startY,
            endX: targetX,
            endY: targetY,
            team: b.fromTeam
         });

         // 3. Impact (Delayed by travel time ~400ms)
         // Only if it actually hit something (player or barrel)
         // For now, let's show impacts on the target line regardless? 
         // 'hit' property in Bullet usually means "did damage to player".
         // Use generic impact if !hit (hit barrel/missed but blocked), focused impact if hit.
         
         setTimeout(() => {
            setImpacts(prev => [...prev, {
                id: `imp-${b.id}`,
                x: targetX,
                y: targetY,
                type: b.hit ? 'flesh' : 'wood' // Simplification: hit=true means player damage. hit=false means blocked (wood) or miss.
            }]);
         }, 400); // Sync with CSS animation duration
      });

      setMuzzleFlashes(newMuzzles);
      setProjectiles(newProjectiles);

      // Cleanup
      setTimeout(() => setMuzzleFlashes([]), 200);
      setTimeout(() => setProjectiles([]), 450); // Clear just after anim finishes
      setTimeout(() => setImpacts([]), 1000); // clear impacts later
    };

    socket.on('tickEnd', handleTickEnd);
    socket.on('tickStart', playTickStart);
    socket.on('tickEnd', playTickResolve);
    return () => {
      socket.off('tickEnd', handleTickEnd);
      socket.off('tickStart', playTickStart);
      socket.off('tickEnd', playTickResolve);
    };
  }, [config.slotsPerSide]);

  const sheriffs = players.filter(p => p.team === 'sheriffs' && p.slot >= 0);
  const outlaws = players.filter(p => p.team === 'outlaws' && p.slot >= 0);

  const sheriffsAlive = sheriffs.filter(p => p.isAlive).length;
  const outlawsAlive = outlaws.filter(p => p.isAlive).length;

  const progress = phase === 'planning' ? (timeLeft / config.tickDuration) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-black font-sans">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-80"
        style={{ backgroundImage: "url('/bg-saloon.png')" }}
      />
      
      {/* Overlay Gradient */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

      {/* Header HUD */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/90 to-transparent">
        {/* Sheriffs Score */}
        <div className="western-card px-6 py-2 flex items-center gap-4 bg-[#1e293b]/90 border-blue-900/50 shadow-lg shadow-blue-900/20 transform -rotate-1 origin-top-left">
          <Star className="w-10 h-10 text-yellow-500 fill-yellow-500/20 filter drop-shadow-lg" />
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase text-blue-400 tracking-widest">Sheriffs</span>
            <span className="text-4xl font-display text-white leading-none">{sheriffsAlive}</span>
          </div>
        </div>
        
        {/* Center Panel (Timer/Phase) */}
        <div className="flex-1 max-w-2xl mx-8">
          <div className="western-card p-4 bg-[#2a1a11]/95 border-[#8B5E3C] shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-end mb-2">
              <div className="text-amber-500 font-bold uppercase tracking-[0.2em] text-sm">
                {phase === 'planning' ? 'Planning Phase' : 'Resolution Phase'}
              </div>
              <div className="text-3xl font-display text-[#F4E9D6] uppercase tracking-wider">
                {phase === 'resolution' ? '💥 Shootout!' : `Round ${tick}`}
              </div>
            </div>
            
            {/* Timer Bar */}
            <div className="relative h-6 bg-black/50 rounded-md border border-[#8B5E3C]/30 overflow-hidden shadow-inner">
               {/* Tick markers */}
               <div className="absolute inset-0 flex justify-between px-2 z-10 pointer-events-none opacity-20">
                 {[...Array(9)].map((_, i) => <div key={i} className="w-px h-full bg-white"></div>)}
               </div>
              <div 
                className={cn(
                  "absolute inset-y-0 left-0 transition-all duration-75 shadow-[0_0_15px_rgba(234,179,8,0.5)]",
                  phase === 'resolution' ? 'w-full bg-red-600 animate-pulse' : 
                  progress < 30 ? 'bg-red-500' : 'bg-amber-500'
                )}
                style={{ width: phase === 'resolution' ? '100%' : `${progress}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* Outlaws Score */}
        <div className="western-card px-6 py-2 flex items-center gap-4 bg-[#450a0a]/90 border-red-900/50 shadow-lg shadow-red-900/20 transform rotate-1 origin-top-right flex-row-reverse text-right">
          <Skull className="w-10 h-10 text-red-500 fill-red-500/20 filter drop-shadow-lg" />
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase text-red-400 tracking-widest">Outlaws</span>
            <span className="text-4xl font-display text-white leading-none">{outlawsAlive}</span>
          </div>
        </div>
      </div>

      {/* Main Arena Area - Standoff Layout */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4 lg:p-12 overflow-hidden">
        <div className="w-full h-full max-w-7xl flex relative">
          
          {/* Left Column: Sheriffs (Player | Barrel) */}
          <div className="flex-1 flex flex-col justify-around py-4 pr-4 md:pr-12 relative">
             <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black/20 to-transparent pointer-events-none" />
             {Array.from({ length: config.slotsPerSide }).map((_, slot) => {
                const player = sheriffs.find(p => p.slot === slot);
                const barrel = barrels.find(b => b.team === 'sheriffs' && b.slot === slot);
                return (
                   <div key={`sheriff-${slot}`} className="flex justify-end pr-2 md:pr-8">
                      <SlotItem player={player} barrel={barrel} team="sheriffs" />
                   </div>
                );
             })}
          </div>

          {/* Center No-Man's Land */}
          <div className="w-0 relative flex items-center justify-center">
             <div className="absolute inset-y-0 w-px bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.1)]"></div>
          </div>

          {/* Right Column: Outlaws (Barrel | Player) */}
          <div className="flex-1 flex flex-col justify-around py-4 pl-4 md:pl-12 relative">
             <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
             {Array.from({ length: config.slotsPerSide }).map((_, slot) => {
                const player = outlaws.find(p => p.slot === slot);
                const barrel = barrels.find(b => b.team === 'outlaws' && b.slot === slot);
                return (
                   <div key={`outlaw-${slot}`} className="flex justify-start pl-2 md:pl-8">
                      <SlotItem player={player} barrel={barrel} team="outlaws" flipped />
                   </div>
                );
             })}
          </div>
          
           {/* ---------------- EFFECTS LAYER ---------------- */}
           <div className="absolute inset-0 pointer-events-none z-50">
             
             {/* 1. Muzzle Flashes */}
             {muzzleFlashes.map(mf => (
               <div 
                 key={mf.id} 
                 className="absolute w-24 h-24 -translate-x-1/2 -translate-y-1/2"
                 style={{ left: mf.x, top: mf.y }}
               >
                 {/* Flash Burst - No Icon */}
                 <div className="absolute inset-0 bg-yellow-400 rounded-full opacity-50 blur-xl animate-pulse" />
                 <div className="absolute inset-[20%] bg-white rounded-full opacity-80 blur-md animate-ping" />
               </div>
             ))}

             {/* 2. Projectiles */}
             {projectiles.map(p => (
               <div
                 key={p.id}
                 className="absolute w-4 h-4 z-40 animate-bullet-travel"
                 style={{
                   '--fx-start-x': p.startX,
                   '--fx-start-y': p.startY,
                   '--fx-end-x': p.endX,
                   '--fx-end-y': p.endY,
                 } as React.CSSProperties}
               >
                 {/* Bullet Head */}
                 <div className="w-3 h-3 bg-white rounded-full shadow-[0_0_10px_#fff,0_0_20px_#fbbf24] relative z-10" />
                 
                 {/* Trail */}
                 <div className={cn(
                     "absolute top-1/2 -translate-y-1/2 h-1 w-24 blur-[1px]",
                     p.team === 'sheriffs' 
                       ? "right-0 bg-gradient-to-l from-white via-blue-400 to-transparent" 
                       : "left-0 bg-gradient-to-r from-white via-red-400 to-transparent"
                 )} />
               </div>
             ))}

             {/* 3. Impacts */}
             {impacts.map(imp => (
               <div
                  key={imp.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-50"
                  style={{ left: imp.x, top: imp.y }}
               >
                 {imp.type === 'flesh' ? (
                   // Blood/Flesh Hit
                   <div className="relative">
                      <div className="w-20 h-20 bg-red-600 rounded-full blur-2xl animate-ping opacity-60" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Skull className="w-12 h-12 text-white animate-bounce" />
                      </div>
                      <span className="absolute -top-10 left-1/2 -translate-x-1/2 text-red-500 font-black text-2xl animate-float">-1 HP</span>
                   </div>
                 ) : (
                   // Wood/Barrel Hit
                   <div className="relative">
                      <div className="w-12 h-12 bg-amber-700/60 rounded-full blur-md animate-ping" />
                      <CircleDot className="w-8 h-8 text-amber-200 animate-spin" />
                      <div className="absolute -inset-4 border-2 border-amber-500/50 rounded-full animate-ping" style={{ animationDuration: '0.3s' }} />
                   </div>
                 )}
               </div>
             ))}

           </div>
           {/* ---------------- END EFFECTS ---------------- */}

        </div>
      </div>
    </div>
  );
}

interface SlotItemProps {
  player: Player | undefined;
  barrel: Barrel | undefined;
  team: 'sheriffs' | 'outlaws';
  flipped?: boolean;
}

function SlotItem({ player, barrel, team, flipped }: SlotItemProps) {
  const isSheriff = team === 'sheriffs';
  const isAlive = player?.isAlive ?? false;
  const isCovered = player?.isCovered && barrel && barrel.hp > 0;
  
  return (
    <div className={cn("flex items-center gap-4 md:gap-8 relative group", flipped && "flex-row-reverse")}>
       
       {/* Player Token (Always on outer side) */}
       <div className={cn(
          "relative transition-all duration-500 transform",
          player ? "opacity-100 translate-y-0" : "opacity-20 translate-y-2 grayscale blur-[1px]",
          !isAlive && player && "grayscale opacity-60 scale-95 rotate-12"
       )}>
          {/* Token Body */}
          <div className={cn(
             "w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-2xl relative z-10",
             "border-[6px] transition-colors duration-300",
             isSheriff 
                ? "bg-[#1e293b] border-blue-600 shadow-blue-900/40" 
                : "bg-[#2a0a0a] border-red-600 shadow-red-900/40"
          )}>
             {/* Character Icon */}
             <div className="text-4xl md:text-5xl filter drop-shadow-md transform transition-transform group-hover:scale-110">
                {player && isAlive ? (
                  isSheriff ? '🤠' : '👺'
                ) : player ? (
                  '💀'
                ) : (
                  <span className="opacity-0">.</span>
                )}
             </div>

             {/* Action Locked Indicator */}
             {player?.actionLocked && isAlive && (
                <div className="absolute -top-1 -right-1 bg-green-500 text-white w-7 h-7 flex items-center justify-center rounded-full shadow-lg border-2 border-white animate-bounce">
                   <span className="text-xs font-bold">✓</span>
                </div>
             )}
          </div>

          {/* HP Bar */}
          {player && isAlive && (
             <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-1 bg-black/60 px-1.5 py-1 rounded-full backdrop-blur-sm border border-white/10 shadow-lg z-20">
                {[0, 1, 2].map(i => (
                   <div 
                      key={i} 
                      className={cn(
                         "w-2.5 h-2.5 rounded-full shadow-inner border border-black/50 transition-all duration-300",
                         i < player.hp 
                            ? "bg-gradient-to-tr from-green-500 to-green-400 scale-100" 
                            : "bg-red-900/30 scale-75 opacity-50"
                      )}
                   />
                ))}
             </div>
          )}
          
          {/* Ammo Bar */}
          {player && isAlive && (
             <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1 bg-black/60 px-1.5 py-1 rounded-full backdrop-blur-sm border border-white/10 shadow-lg z-20">
                {[0, 1, 2].map(i => (
                   <div 
                      key={i} 
                      className={cn(
                         "w-1.5 h-2.5 rounded-sm border border-black/50 transition-all duration-300",
                         i < player.ammo 
                            ? "bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)]" 
                            : "bg-neutral-600 opacity-40"
                      )}
                   />
                ))}
             </div>
          )}
          
          {/* Name Tag */}
          {player && (
             <div className={cn(
                "absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded bg-black/80 text-white text-[10px] font-bold uppercase tracking-wider border border-white/10 shadow-xl",
                !isAlive && "opacity-50 line-through"
             )}>
                {player.name}
             </div>
          )}
       </div>

       {/* Barrel (Always on inner side) */}
       <div className="relative transition-all duration-300 flex flex-col items-center">
          {barrel && barrel.hp > 0 ? (
             <div className={cn(
                "w-14 h-16 md:w-16 md:h-20 rounded-lg border-4 shadow-xl flex items-center justify-center relative transition-transform",
                "bg-[#5D4037] border-[#3E2723]",
                barrel.hp < 3 && "bg-[#4E342E]",
                barrel.hp < 2 && "bg-[#3E2723]",
             )}>
                {/* Visual details */}
                <div className="absolute inset-x-0 top-1/4 h-px bg-black/30 w-full" />
                <div className="absolute inset-x-0 bottom-1/4 h-px bg-black/30 w-full" />
                <div className="absolute top-[15%] w-full h-1.5 bg-neutral-700 border-y border-black/50" />
                <div className="absolute bottom-[15%] w-full h-1.5 bg-neutral-700 border-y border-black/50" />

                {/* Shield Icon if Covered */}
                {isCovered && (
                   <div className="absolute -top-2 -right-2 z-20 bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-bounce-subtle">
                      <Shield className="w-3 h-3" />
                   </div>
                )}
                
                {/* Barrel HP (Pips on the barrel) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1">
                   {[...Array(3)].map((_, i) => (
                      <div 
                         key={i} 
                         className={cn(
                            "w-2 h-2 rounded-full border border-black/40 shadow-inner",
                            i < barrel.hp ? "bg-amber-500" : "bg-black/40"
                         )}
                      />
                   ))}
                </div>
             </div>
          ) : (
             <div className="w-14 h-16 md:w-16 md:h-20 opacity-5 border-2 border-dashed border-white rounded-lg flex items-center justify-center">
                <span className="text-xl">×</span>
             </div>
          )}
       </div>
    </div>
  );
}
