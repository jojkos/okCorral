import { useState, useEffect } from 'react';
import type { GameState, Player, GameConfig } from '../../shared/types';
import { socket } from '../socket';
import { WesternButton } from '../components/WesternButton';
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
        width: 160,
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-3xl animate-pulse" style={{ fontFamily: 'Rye, serif' }}>
          Setting up the Saloon...
        </div>
      </div>
    );
  }

  const sheriffs = gameState?.players.filter(p => p.team === 'sheriffs' && p.slot >= 0) || [];
  const outlaws = gameState?.players.filter(p => p.team === 'outlaws' && p.slot >= 0) || [];
  const unassigned = gameState?.players.filter(p => p.slot < 0) || [];

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl md:text-4xl uppercase text-orange-700">
            Waiting for Cowboys
          </h1>
          {error && (
            <div className="mt-2 text-red-600 font-bold">{error}</div>
          )}
        </div>
        
        <div className="flex items-center gap-4 md:gap-6">
          <button 
            onClick={() => setShowSettings(true)}
            className="western-card px-3 py-2 text-sm font-bold uppercase hover:bg-amber-100 transition-colors"
          >
            ⚙️
          </button>
          
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Room Code
            </span>
            <div className="text-4xl md:text-6xl font-black tracking-wider" style={{ fontFamily: 'Space Mono, monospace' }}>
              {roomCode}
            </div>
          </div>
          
          {qrCodeUrl && (
            <div className="western-card p-1.5 hidden sm:block">
              <img src={qrCodeUrl} alt="Join QR Code" className="w-24 md:w-32 h-24 md:h-32" />
            </div>
          )}
        </div>
      </header>

      {/* Teams Grid */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-5xl mx-auto w-full">
        {/* Sheriffs */}
        <div className="western-card p-4 md:p-6 flex flex-col relative overflow-hidden min-h-[200px]">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600" />
          <h2 className="text-xl md:text-2xl text-blue-800 mb-4 uppercase flex items-center gap-2">
            ⭐ Sheriffs
            <span className="text-base opacity-60">({sheriffs.length}/{localConfig.slotsPerSide})</span>
          </h2>
          <div className="flex-1 space-y-2">
            {sheriffs.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {sheriffs.length === 0 && (
              <p className="text-center text-neutral-400 py-6">
                Waiting for deputies...
              </p>
            )}
          </div>
        </div>

        {/* Outlaws */}
        <div className="western-card p-4 md:p-6 flex flex-col relative overflow-hidden min-h-[200px]">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-red-600" />
          <h2 className="text-xl md:text-2xl text-red-800 mb-4 uppercase flex items-center gap-2">
            💀 Outlaws
            <span className="text-base opacity-60">({outlaws.length}/{localConfig.slotsPerSide})</span>
          </h2>
          <div className="flex-1 space-y-2">
            {outlaws.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {outlaws.length === 0 && (
              <p className="text-center text-neutral-400 py-6">
                Waiting for bandits...
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Unassigned players */}
      {unassigned.length > 0 && (
        <div className="western-card p-3 mt-4 max-w-5xl mx-auto w-full">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-bold uppercase text-neutral-500">Picking side:</span>
            {unassigned.map((player) => (
              <span key={player.id} className="bg-amber-200 px-3 py-1 rounded-full text-sm font-semibold">
                🤠 {player.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-6 text-center">
        <p className="text-neutral-400 text-sm md:text-base">
          Players start the game from their phones
        </p>
      </footer>

      {/* Settings Overlay */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
          <div className="western-card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold uppercase">Game Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-2xl hover:opacity-70">×</button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block mb-2 text-sm font-semibold uppercase text-neutral-600">
                  Round Duration (ms)
                </label>
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
                  className="w-full px-4 py-3 text-lg border-2 border-amber-800 rounded-lg bg-amber-50 text-center font-mono"
                />
                <p className="text-xs text-neutral-500 mt-1">{(localConfig.tickDuration / 1000).toFixed(1)} seconds per round</p>
              </div>
              
              <div>
                <label className="block mb-2 text-sm font-semibold uppercase text-neutral-600">
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
                  className="w-full px-4 py-3 text-lg border-2 border-amber-800 rounded-lg bg-amber-50 text-center font-mono"
                />
                <p className="text-xs text-neutral-500 mt-1">Max {localConfig.slotsPerSide} players per team</p>
              </div>
            </div>

            <WesternButton
              variant="primary"
              className="w-full mt-6"
              onClick={() => setShowSettings(false)}
            >
              Done
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
    <div className={`flex items-center gap-3 p-3 rounded-lg border-2 ${
      isSheriff 
        ? 'bg-blue-50 border-blue-300' 
        : 'bg-red-50 border-red-300'
    }`}>
      <div className="text-2xl">
        {isSheriff ? '🤠' : '🎭'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{player.name}</div>
        <div className="text-xs text-neutral-500 uppercase">Slot {player.slot + 1}</div>
      </div>
    </div>
  );
}
