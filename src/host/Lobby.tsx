import { useState, useEffect } from 'react';
import type { GameState, Player, GameConfig, Team } from '../../shared/types';
import { socket } from '../socket';
import QRCode from 'qrcode';
import {
  WesternBackdrop,
  StarEmblem,
  SkullEmblem,
  MiniCowboy,
  WesternBtn,
  westernStyles as S,
} from '../components/WesternUI';

interface LobbyProps {
  roomCode: string | null;
  gameState: GameState | null;
  error: string | null;
}

export default function Lobby({ roomCode, gameState, error }: LobbyProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [localConfig, setLocalConfig] = useState({ tickDuration: 4000, slotsPerSide: 5 });

  useEffect(() => {
    if (roomCode) {
      const joinUrl = `${window.location.origin}?join=${roomCode}`;
      QRCode.toDataURL(joinUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#3e2417', light: '#e8d8b8' },
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
      <WesternBackdrop>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-3xl animate-pulse" style={{ ...S.title, fontSize: 32 }}>
            Setting up the Saloon…
          </div>
        </div>
      </WesternBackdrop>
    );
  }

  const sheriffs = gameState?.players.filter((p) => p.team === 'sheriffs' && p.slot >= 0) || [];
  const outlaws = gameState?.players.filter((p) => p.team === 'outlaws' && p.slot >= 0) || [];
  const unassigned = gameState?.players.filter((p) => p.slot < 0) || [];
  const canStart = sheriffs.length > 0 && outlaws.length > 0;

  return (
    <WesternBackdrop>
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: 36,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...S.mono, fontSize: 11, color: '#e0b04a', letterSpacing: 3, opacity: 0.8 }}>★ NOW PLAYING ★</div>
            <h1 style={{ ...S.title, fontSize: 68, margin: '4px 0 0 0', lineHeight: 1 }}>O.K. Corral</h1>
            <div style={{ ...S.serif, color: '#d9cbb0', fontSize: 22, marginTop: 8, letterSpacing: 1 }}>
              Draw yer irons — the Marshal's called a reckonin'
            </div>
            {error && (
              <div style={{ ...S.mono, color: '#ff7272', marginTop: 12, fontWeight: 'bold' }}>⚠ {error}</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ ...S.paper, padding: '14px 18px', transform: 'rotate(-1.5deg)', minWidth: 190 }}>
              <div style={{ ...S.mono, fontSize: 10, letterSpacing: 3, color: '#6b4423', fontWeight: 'bold', textAlign: 'center' }}>
                ROOM CODE
              </div>
              <div
                style={{
                  ...S.title,
                  fontSize: 58,
                  color: '#3e2417',
                  textAlign: 'center',
                  marginTop: 4,
                  letterSpacing: 6,
                  textShadow: '0 2px 0 rgba(100,60,20,0.3)',
                }}
              >
                {roomCode}
              </div>
              <div style={{ ...S.mono, fontSize: 10, color: '#6b4423', textAlign: 'center', opacity: 0.7 }}>
                {window.location.host}
              </div>
            </div>
            {qrCodeUrl && (
              <div style={{ ...S.paper, padding: 10, transform: 'rotate(1deg)' }}>
                <img src={qrCodeUrl} alt="Join QR Code" style={{ width: 130, height: 130, display: 'block' }} />
                <div style={{ ...S.mono, fontSize: 9, color: '#3e2417', textAlign: 'center', marginTop: 4, letterSpacing: 2 }}>
                  SCAN TO RIDE IN
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Teams */}
        <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, minHeight: 400 }}>
          <TeamPanel team="sheriffs" players={sheriffs} max={localConfig.slotsPerSide} />
          <TeamPanel team="outlaws" players={outlaws} max={localConfig.slotsPerSide} />
        </main>

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div
            style={{
              ...S.wood,
              padding: '10px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span style={{ ...S.mono, color: '#e0b04a', fontSize: 11, letterSpacing: 2, fontWeight: 'bold' }}>IN THE SALOON:</span>
            {unassigned.map((p) => (
              <span
                key={p.id}
                style={{
                  ...S.mono,
                  fontSize: 11,
                  color: '#f4e9d6',
                  background: 'rgba(107,68,35,0.4)',
                  padding: '4px 10px',
                  borderRadius: 3,
                  border: '1px solid #6b4423',
                }}
              >
                🤠 {p.name}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ ...S.mono, fontSize: 12, color: '#d9cbb0', opacity: 0.8 }}>
            <span style={{ color: '#e0b04a' }}>⚙</span> &nbsp;Round: {(localConfig.tickDuration / 1000).toFixed(1)}s &nbsp;·&nbsp; Slots per side: {localConfig.slotsPerSide}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <WesternBtn onClick={() => setShowSettings(true)}>⚙ Settings</WesternBtn>
            {canStart ? (
              <WesternBtn primary big onClick={() => socket.emit('startGame')}>▶ Start the Showdown</WesternBtn>
            ) : (
              <div
                style={{
                  ...S.mono,
                  fontSize: 13,
                  color: '#e0b04a',
                  padding: '12px 20px',
                  border: '1px dashed #6b4423',
                  borderRadius: 4,
                  opacity: 0.85,
                }}
              >
                Waitin' on more cowpokes…
              </div>
            )}
          </div>
        </footer>
      </div>

      {showSettings && (
        <SettingsModal
          config={localConfig}
          onConfigChange={setLocalConfig}
          onCommit={updateConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </WesternBackdrop>
  );
}

function TeamPanel({ team, players, max }: { team: Team; players: Player[]; max: number }) {
  const isSheriff = team === 'sheriffs';
  const main = isSheriff ? '#3a6fb5' : '#b53a3a';
  const dark = isSheriff ? '#1f3d6b' : '#6b1f1f';
  return (
    <div
      style={{
        ...S.wood,
        border: `2px solid ${main}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${dark}`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: `linear-gradient(180deg, ${dark} 0%, transparent 100%)`,
        }}
      >
        {isSheriff ? <StarEmblem size={40} /> : <SkullEmblem size={40} />}
        <div>
          <div style={{ ...S.title, color: main, fontSize: 26, letterSpacing: 2 }}>
            {isSheriff ? 'SHERIFFS' : 'OUTLAWS'}
          </div>
          <div style={{ ...S.mono, fontSize: 10, color: '#d9cbb0', opacity: 0.7, letterSpacing: 2 }}>
            {isSheriff ? 'LAW OF THE LAND' : 'DEAD OR ALIVE'}
          </div>
        </div>
        <div style={{ ...S.mono, marginLeft: 'auto', fontSize: 28, color: '#e0b04a', fontWeight: 'bold' }}>
          {players.length}
          <span style={{ opacity: 0.4, fontSize: 18 }}>/{max}</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: max }).map((_, i) => {
          const p = players.find((pl) => pl.slot === i);
          return <SlotRow key={i} slot={i} player={p} team={team} />;
        })}
      </div>
    </div>
  );
}

function SlotRow({ slot, player, team }: { slot: number; player: Player | undefined; team: Team }) {
  const isSheriff = team === 'sheriffs';
  const main = isSheriff ? '#3a6fb5' : '#b53a3a';
  if (!player) {
    return (
      <div
        style={{
          ...S.mono,
          height: 48,
          border: `1.5px dashed rgba(${isSheriff ? '138,179,222' : '222,138,138'},0.25)`,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          fontSize: 11,
          color: 'rgba(217,203,176,0.4)',
          letterSpacing: 2,
        }}
      >
        SLOT {slot + 1} · EMPTY
      </div>
    );
  }
  return (
    <div
      style={{
        height: 48,
        background: 'rgba(30,15,6,0.7)',
        border: `1px solid ${main}`,
        borderLeft: `4px solid ${main}`,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 14px',
      }}
    >
      <MiniCowboy team={team} size={32} />
      <div style={{ ...S.serif, color: '#f4e9d6', fontSize: 18, letterSpacing: 1, flex: 1 }}>{player.name}</div>
      <div style={{ ...S.mono, fontSize: 9, color: 'rgba(217,203,176,0.55)', letterSpacing: 2 }}>SLOT {slot + 1}</div>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: main, boxShadow: `0 0 8px ${main}` }} />
    </div>
  );
}

function SettingsModal({
  config,
  onConfigChange,
  onCommit,
  onClose,
}: {
  config: { tickDuration: number; slotsPerSide: number };
  onConfigChange: (c: { tickDuration: number; slotsPerSide: number }) => void;
  onCommit: (c: Partial<GameConfig>) => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...S.wood,
          padding: 32,
          width: '100%',
          maxWidth: 440,
          border: '2px solid #e0b04a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ ...S.title, fontSize: 24, margin: 0 }}>GAME SETTINGS</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f4e9d6',
              fontSize: 24,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <label style={{ display: 'block' }}>
            <div style={{ ...S.mono, fontSize: 10, letterSpacing: 2, color: '#e0b04a', fontWeight: 'bold', marginBottom: 6 }}>
              ROUND DURATION (ms)
            </div>
            <input
              type="number"
              min={1000}
              max={30000}
              step={500}
              value={config.tickDuration}
              onChange={(e) => {
                const val = Math.max(1000, Math.min(30000, Number(e.target.value)));
                onConfigChange({ ...config, tickDuration: val });
              }}
              onBlur={() => onCommit({ tickDuration: config.tickDuration })}
              style={{
                width: '100%',
                padding: '12px 14px',
                ...S.mono,
                fontSize: 18,
                background: 'rgba(255,248,220,0.9)',
                border: '2px solid #6b4423',
                borderRadius: 4,
                color: '#1a0e08',
                textAlign: 'center',
              }}
            />
            <div style={{ ...S.mono, fontSize: 10, color: '#d9cbb0', opacity: 0.6, marginTop: 4 }}>
              {(config.tickDuration / 1000).toFixed(1)} seconds per round
            </div>
          </label>

          <label style={{ display: 'block' }}>
            <div style={{ ...S.mono, fontSize: 10, letterSpacing: 2, color: '#e0b04a', fontWeight: 'bold', marginBottom: 6 }}>
              SLOTS PER SIDE
            </div>
            <input
              type="number"
              min={1}
              max={10}
              value={config.slotsPerSide}
              onChange={(e) => {
                const val = Math.max(1, Math.min(10, Number(e.target.value)));
                onConfigChange({ ...config, slotsPerSide: val });
              }}
              onBlur={() => onCommit({ slotsPerSide: config.slotsPerSide })}
              style={{
                width: '100%',
                padding: '12px 14px',
                ...S.mono,
                fontSize: 18,
                background: 'rgba(255,248,220,0.9)',
                border: '2px solid #6b4423',
                borderRadius: 4,
                color: '#1a0e08',
                textAlign: 'center',
              }}
            />
          </label>
        </div>

        <div style={{ marginTop: 24 }}>
          <WesternBtn primary big onClick={onClose}>SAVE & CLOSE</WesternBtn>
        </div>
      </div>
    </div>
  );
}
