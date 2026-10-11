import { useState, useEffect } from 'react';
import type { GameState, Player, GameConfig, Team } from '../../shared/types';
import { socket } from '../socket';
import QRCode from 'qrcode';
import { Bot, Hourglass, Smartphone, UserMinus, UserPlus, UserRound } from 'lucide-react';
import {
  WesternBackdrop,
  StarEmblem,
  SkullEmblem,
  WesternBtn,
  westernStyles as S,
} from '../components/WesternUI';
import HowToPlay from './components/HowToPlay';
import { BotBadge, PlayerAvatar, SessionScore, hasSessionGames } from './components/HostBits';
import './host.css';

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
        width: 320,
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
        <div className="host-screen min-h-screen flex items-center justify-center">
          <div className="animate-pulse" style={{ ...S.title, fontSize: 'calc(var(--u) * 2.4)' }}>
            {error || 'Setting up the Saloon…'}
          </div>
        </div>
      </WesternBackdrop>
    );
  }

  const slotsPerSide = gameState?.config.slotsPerSide ?? localConfig.slotsPerSide;
  const sheriffs = gameState?.players.filter((p) => p.team === 'sheriffs' && p.slot >= 0) || [];
  const outlaws = gameState?.players.filter((p) => p.team === 'outlaws' && p.slot >= 0) || [];
  const unassigned = gameState?.players.filter((p) => p.slot < 0) || [];
  const canStart = sheriffs.length > 0 && outlaws.length > 0;
  const missing = [sheriffs.length === 0 && 'Sheriffs', outlaws.length === 0 && 'Outlaws'].filter(Boolean) as string[];
  const roundSeconds = +(localConfig.tickDuration / 1000).toFixed(1);

  return (
    <WesternBackdrop>
      <div className={`host-screen hl${slotsPerSide >= 6 ? ' hl--dense' : ''}`}>
        <Dust />

        {/* Header */}
        <header className="hl-head">
          <div className="hl-brand">
            <div className="hl-sign" aria-label="O.K. Corral">
              <span className="hl-sign__chain hl-sign__chain--l" />
              <span className="hl-sign__chain hl-sign__chain--r" />
              <div className="hl-sign__plank">
                <span className="hl-sign__kicker">★ Saloon &amp; Shootout ★</span>
                <h1 className="hl-sign__title">O.K. Corral</h1>
              </div>
            </div>
            <div className="hl-tagline">Draw yer irons — the Marshal's called a reckonin'</div>
            {error && <div className="hl-error">⚠ {error}</div>}
          </div>

          {hasSessionGames(gameState?.session) && (
            <SessionScore session={gameState!.session!} className="hl-session" />
          )}

          <div className="hl-join">
            <div className="hl-code">
              <div className="hl-code__label">Room code</div>
              <div className="hl-code__value">{roomCode}</div>
              <div className="hl-code__host">join at {window.location.host}</div>
            </div>
            {qrCodeUrl && (
              <div className="hl-qr">
                <img src={qrCodeUrl} alt="QR code to join this room" />
                <div className="hl-qr__label">Scan to ride in</div>
              </div>
            )}
          </div>
        </header>

        {/* Teams + rules */}
        <main className="hl-grid">
          <TeamPanel team="sheriffs" players={sheriffs} max={slotsPerSide} />
          <HowToPlay roundSeconds={roundSeconds} />
          <TeamPanel team="outlaws" players={outlaws} max={slotsPerSide} />
        </main>

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div className="hl-saloon">
            <span className="hl-saloon__label">In the saloon, picking a side:</span>
            {unassigned.map((p) => (
              <span key={p.id} className="hl-saloon__chip">🤠 {p.name}</span>
            ))}
          </div>
        )}

        {/* Call to action */}
        <footer className={`hl-cta ${canStart ? 'hl-cta--ready' : 'hl-cta--waiting'}`}>
          <div className="hl-cta__icon" aria-hidden="true">
            {canStart ? <Smartphone /> : <Hourglass />}
          </div>
          <div className="hl-cta__copy" role="status" aria-live="polite">
            {canStart ? (
              <>
                <div className="hl-cta__headline">Ready to ride!</div>
                <div className="hl-cta__detail">
                  Any player can press <b>START</b> on their phone
                </div>
              </>
            ) : (
              <>
                <div className="hl-cta__headline">Waiting for both teams…</div>
                <div className="hl-cta__detail">
                  {missing.join(' & ')} {missing.length > 1 ? 'need' : 'needs'} at least one gunslinger — scan the code or add a bot
                </div>
              </>
            )}
          </div>
          <div className="hl-cta__actions">
            <div className="hl-cta__config">
              ⚙ {roundSeconds}s rounds · {slotsPerSide} per side
            </div>
            <WesternBtn onClick={() => setShowSettings(true)}>⚙ Settings</WesternBtn>
            <WesternBtn primary big disabled={!canStart} onClick={() => socket.emit('startGame')}>
              ▶ Start the Showdown
            </WesternBtn>
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

// Slow-drifting dust motes. Positions are deterministic so re-renders don't jump.
function Dust() {
  return (
    <div className="hx-dust" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          style={{
            top: `${(i * 37) % 100}%`,
            left: `${(i * 53) % 100}%`,
            width: 2 + (i % 4),
            height: 2 + (i % 4),
            animationDuration: `${18 + (i % 7) * 4}s`,
            animationDelay: `${-(i * 2.3)}s`,
          }}
        />
      ))}
    </div>
  );
}

function TeamPanel({ team, players, max }: { team: Team; players: Player[]; max: number }) {
  const isSheriff = team === 'sheriffs';
  const full = players.length >= max;
  const bots = players.filter((p) => p.isBot).length;
  return (
    <section className={`hl-team hl-team--${team}`} aria-label={isSheriff ? 'Sheriffs' : 'Outlaws'}>
      <div className="hl-team__head">
        {isSheriff ? <StarEmblem size={48} /> : <SkullEmblem size={48} />}
        <div>
          <div className="hl-team__name">{isSheriff ? 'SHERIFFS' : 'OUTLAWS'}</div>
          <div className="hl-team__motto">{isSheriff ? 'Law of the land · left side' : 'Dead or alive · right side'}</div>
        </div>
        <div className="hl-team__count" aria-label={`${players.length} of ${max} seats filled`}>
          {players.length}
          <span>/{max}</span>
        </div>
      </div>

      <div className="hl-team__slots">
        {Array.from({ length: max }).map((_, i) => {
          const p = players.find((pl) => pl.slot === i);
          return <SlotRow key={i} slot={i} player={p} />;
        })}
      </div>

      <div className="hl-team__bots">
        <div className="hl-team__bot-btns">
          <button
            type="button"
            className="hl-botbtn"
            disabled={full}
            onClick={() => socket.emit('addBot', team)}
            title={full ? 'Team is full' : `Add a bot to the ${isSheriff ? 'Sheriffs' : 'Outlaws'}`}
          >
            <UserPlus aria-hidden="true" /> Add bot
          </button>
          <button
            type="button"
            className="hl-botbtn"
            disabled={bots === 0}
            onClick={() => socket.emit('removeBot', team)}
            title={bots === 0 ? 'No bots on this team' : 'Remove the last bot'}
          >
            <UserMinus aria-hidden="true" /> Remove bot
          </button>
        </div>
        <div className="hl-team__bot-hint">
          <Bot aria-hidden="true" /> Short on gunslingers? Bots fill seats.
        </div>
      </div>
    </section>
  );
}

function SlotRow({ slot, player }: { slot: number; player: Player | undefined }) {
  if (!player) {
    return (
      <div className="hl-slot hl-slot--empty">
        <span className="hl-slot__num">{slot + 1}</span>
        <span className="hl-slot__vacancy" aria-hidden="true"><UserRound /></span>
        <span className="hl-slot__empty-label">Seat available</span>
      </div>
    );
  }
  return (
    <div className="hl-slot hl-slot--taken">
      <span className="hl-slot__num">{slot + 1}</span>
      <PlayerAvatar player={player} className="hl-slot__avatar" />
      <span className="hl-slot__name">{player.name}</span>
      {player.isBot && <BotBadge />}
      <span className="hl-slot__dot" aria-hidden="true" />
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
              max={10000}
              step={500}
              value={config.tickDuration}
              onChange={(e) => {
                const val = Math.max(1000, Math.min(10000, Number(e.target.value)));
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
              min={2}
              max={8}
              value={config.slotsPerSide}
              onChange={(e) => {
                const val = Math.max(2, Math.min(8, Number(e.target.value)));
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
