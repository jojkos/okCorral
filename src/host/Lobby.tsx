import { useState, useEffect } from 'react';
import type { GameState, Player, GameConfig } from '../../shared/types';
import { socket } from '../socket';
import { WesternButton } from '../client/components/WesternButton';
import { cn } from '../client/lib/utils';
import QRCode from 'qrcode';

interface LobbyProps {
  roomCode: string | null;
  gameState: GameState | null;
  error: string | null;
}

export default function Lobby({ roomCode, gameState, error }: LobbyProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [localConfig, setLocalConfig] = useState({
    tickDuration: 4000,
    slotsPerSide: 5,
  });

  useEffect(() => {
    if (roomCode) {
      const joinUrl = `${window.location.origin}?join=${roomCode}`;
      QRCode.toDataURL(joinUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#3D261A', light: '#F4E9D6' }
      }).then(setQrCodeUrl);
    }
  }, [roomCode]);

  useEffect(() => {
    if (gameState?.config) {
      setLocalConfig({
        tickDuration: gameState.config.tickDuration,
        slotsPerSide: gameState.config.slotsPerSide,
      });
    }
  }, [gameState?.config]);

  const updateConfig = (config: Partial<GameConfig>) => {
    socket.emit('updateConfig', config);
  };

  if (!roomCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-3xl animate-pulse font-display text-primary">
          Setting up the Saloon...
        </div>
      </div>
    );
  }

  const sheriffs = gameState?.players.filter(p => p.team === 'sheriffs' && p.slot >= 0) || [];
  const outlaws = gameState?.players.filter(p => p.team === 'outlaws' && p.slot >= 0) || [];
  const unassigned = gameState?.players.filter(p => p.slot < 0) || [];

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 bg-background font-body text-foreground">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl md:text-5xl uppercase font-display text-primary drop-shadow-sm">
            Waiting for Cowboys
          </h1>
          {error && (
            <div className="mt-2 text-destructive font-bold text-lg animate-shake">{error}</div>
          )}
          <p className="text-muted-foreground mt-2 text-lg">
            Scan the code or go to <span className="font-mono font-bold text-foreground">{window.location.host}</span> to join.
          </p>
        </div>
        
        <div className="flex items-start gap-6">
          <WesternButton 
            onClick={() => setShowSettings(true)}
            variant="secondary"
            className="px-4 py-2"
          >
            <span className="text-2xl mr-2">⚙️</span> Settings
          </WesternButton>
          
          <div className="western-card p-4 flex flex-col items-center bg-[#F4E9D6] transform rotate-1 shadow-lg">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">
              Room Code
            </span>
            <div className="text-5xl md:text-6xl font-black tracking-wider font-mono text-foreground border-2 border-dashed border-primary/20 px-4 py-1 rounded bg-white/50">
              {roomCode}
            </div>
          </div>
          
          {qrCodeUrl && (
            <div className="western-card p-2 hidden lg:block transform -rotate-1 shadow-lg">
              <img src={qrCodeUrl} alt="Join QR Code" className="w-32 h-32" />
            </div>
          )}
        </div>
      </header>

      {/* Teams Grid */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto w-full">
        {/* Sheriffs */}
        <div className="western-card p-6 flex flex-col relative overflow-hidden min-h-[300px] border-blue-800/30">
          <div className="absolute top-0 left-0 w-full h-2 bg-blue-600" />
          <h2 className="text-3xl text-blue-800 mb-6 uppercase flex items-center gap-3 font-display border-b border-blue-900/10 pb-4">
            <span className="text-4xl">⭐</span> Sheriffs
            <span className="text-xl opacity-60 font-mono ml-auto">({sheriffs.length}/{localConfig.slotsPerSide})</span>
          </h2>
          <div className="flex-1 grid grid-cols-1 gap-2 content-start">
            {sheriffs.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {sheriffs.length === 0 && (
              <div className="text-center text-neutral-400 py-12 italic border-2 border-dashed border-neutral-300 rounded-lg">
                Waiting for deputies...
              </div>
            )}
            {/* Empty slots visualization */}
            {Array.from({ length: Math.max(0, localConfig.slotsPerSide - sheriffs.length) }).map((_, i) => (
               <div key={`empty-${i}`} className="h-10 border-2 border-dashed border-blue-200 rounded-lg bg-blue-50/30"></div>
            ))}
          </div>
        </div>

        {/* Outlaws */}
        <div className="western-card p-6 flex flex-col relative overflow-hidden min-h-[300px] border-red-800/30">
          <div className="absolute top-0 left-0 w-full h-2 bg-red-600" />
          <h2 className="text-3xl text-red-800 mb-6 uppercase flex items-center gap-3 font-display border-b border-red-900/10 pb-4">
            <span className="text-4xl">💀</span> Outlaws
            <span className="text-xl opacity-60 font-mono ml-auto">({outlaws.length}/{localConfig.slotsPerSide})</span>
          </h2>
          <div className="flex-1 grid grid-cols-1 gap-2 content-start">
            {outlaws.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {outlaws.length === 0 && (
              <div className="text-center text-neutral-400 py-12 italic border-2 border-dashed border-neutral-300 rounded-lg">
                Waiting for bandits...
              </div>
            )}
             {/* Empty slots visualization */}
             {Array.from({ length: Math.max(0, localConfig.slotsPerSide - outlaws.length) }).map((_, i) => (
               <div key={`empty-${i}`} className="h-10 border-2 border-dashed border-red-200 rounded-lg bg-red-50/30"></div>
            ))}
          </div>
        </div>
      </main>

      {/* Unassigned players */}
      {unassigned.length > 0 && (
        <div className="western-card p-4 mt-6 max-w-6xl mx-auto w-full bg-amber-100/50 border-amber-300">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm font-bold uppercase text-amber-800 tracking-widest mr-2">In the Saloon:</span>
            {unassigned.map((player) => (
              <span key={player.id} className="bg-white px-4 py-1.5 rounded-full text-sm font-semibold border-2 border-amber-200 text-amber-900 shadow-sm">
                🤠 {player.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Settings Overlay */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
          <div className="western-card p-8 max-w-md w-full shadow-2xl transform scale-100 animate-slide-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-[#8B5E3C]/20">
              <h3 className="text-2xl font-bold uppercase font-display text-primary">Game Settings</h3>
              <button 
                onClick={() => setShowSettings(false)} 
                className="text-2xl hover:text-destructive w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block mb-2 text-sm font-bold uppercase text-neutral-600 tracking-wider">
                  Round Duration (ms)
                </label>
                <div className="relative">
                  <input 
                    type="number"
                    min="1000"
                    max="30000"
                    step="500"
                    value={localConfig.tickDuration}
                    onChange={(e) => {
                      const val = Math.max(1000, Math.min(30000, Number(e.target.value)));
                      setLocalConfig(c => ({ ...c, tickDuration: val }));
                    }}
                    onBlur={() => updateConfig({ tickDuration: localConfig.tickDuration })}
                    className="w-full px-4 py-3 text-xl border-2 border-[#8B5E3C] rounded-lg bg-[#FFF8DC] text-center font-mono focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold">ms</span>
                </div>
                <p className="text-xs text-neutral-500 mt-2 font-mono">{(localConfig.tickDuration / 1000).toFixed(1)} seconds per round</p>
              </div>
              
              <div>
                <label className="block mb-2 text-sm font-bold uppercase text-neutral-600 tracking-wider">
                  Slots per Side
                </label>
                <input 
                  type="number"
                  min="1"
                  max="10"
                  value={localConfig.slotsPerSide}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(10, Number(e.target.value)));
                    setLocalConfig(c => ({ ...c, slotsPerSide: val }));
                  }}
                  onBlur={() => updateConfig({ slotsPerSide: localConfig.slotsPerSide })}
                  className="w-full px-4 py-3 text-xl border-2 border-[#8B5E3C] rounded-lg bg-[#FFF8DC] text-center font-mono focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <p className="text-xs text-neutral-500 mt-2 font-mono">Max {localConfig.slotsPerSide} players per team</p>
              </div>
            </div>

            <WesternButton
              variant="primary"
              className="w-full mt-8 text-xl py-4"
              onClick={() => setShowSettings(false)}
            >
              Save & Close
            </WesternButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerCard({ player }: { player: Player }) {
  const isSheriff = player.team === 'sheriffs';
  
  return (
    <div className={cn(
      "flex items-center gap-4 p-3 rounded-lg border-2 transition-all duration-300 animate-slide-in",
      isSheriff 
        ? 'bg-blue-50 border-blue-200 text-blue-900' 
        : 'bg-red-50 border-red-200 text-red-900'
    )}>
      <div className="text-3xl filter drop-shadow-sm">
        {isSheriff ? '🤠' : '🎭'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate text-lg font-display tracking-wide">{player.name}</div>
        <div className="text-xs opacity-70 uppercase font-mono tracking-wider">Slot {player.slot + 1}</div>
      </div>
      <div className={cn(
        "w-3 h-3 rounded-full animate-pulse",
        isSheriff ? "bg-blue-500" : "bg-red-500"
      )} />
    </div>
  );
}
