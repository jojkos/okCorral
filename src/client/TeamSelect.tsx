import type { ClientPlayer, GameState, Team, Player } from '../../shared/types';
import { socket } from '../socket';
import {
  WesternBackdrop,
  StarEmblem,
  SkullEmblem,
  WesternBtn,
  westernStyles as S,
} from '../components/WesternUI';

interface TeamSelectProps {
  player: ClientPlayer;
  gameState: GameState;
  error: string | null;
  onSelectTeam: (team: Team) => void;
  onLeave: () => void;
}

export default function TeamSelect({ player, gameState, error, onSelectTeam, onLeave }: TeamSelectProps) {
  const { config, players } = gameState;

  const sheriffs = players.filter((p) => p.team === 'sheriffs' && p.slot >= 0);
  const outlaws = players.filter((p) => p.team === 'outlaws' && p.slot >= 0);
  const unassigned = players.filter((p) => p.slot < 0);

  const canStartGame = sheriffs.length > 0 && outlaws.length > 0;
  const isSheriff = player.slot >= 0 && player.team === 'sheriffs';
  const isOutlaw = player.slot >= 0 && player.team === 'outlaws';

  return (
    <WesternBackdrop>
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 20,
          gap: 14,
        }}
      >
        <div style={{ textAlign: 'center', marginTop: 8, position: 'relative' }}>
          <button
            onClick={onLeave}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              background: 'transparent',
              border: 'none',
              ...S.mono,
              fontSize: 10,
              letterSpacing: 2,
              color: '#d9cbb0',
              opacity: 0.6,
              cursor: 'pointer',
            }}
          >
            LEAVE
          </button>
          <div style={{ ...S.mono, fontSize: 10, letterSpacing: 3, color: '#e0b04a', fontWeight: 'bold' }}>★ PICK YER SIDE ★</div>
          <h1 style={{ ...S.serif, color: '#f4e9d6', fontSize: 26, margin: '4px 0', letterSpacing: 1 }}>
            Which'll it be, {player.name}?
          </h1>
        </div>

        {error && (
          <div
            style={{
              ...S.mono,
              padding: '10px 14px',
              background: 'rgba(181,58,58,0.15)',
              border: '2px solid #b53a3a',
              borderRadius: 4,
              color: '#ff8080',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          <TeamPickCard
            team="sheriffs"
            players={sheriffs}
            max={config.slotsPerSide}
            selected={isSheriff}
            disabled={isOutlaw}
            onPick={() => onSelectTeam('sheriffs')}
          />
          <TeamPickCard
            team="outlaws"
            players={outlaws}
            max={config.slotsPerSide}
            selected={isOutlaw}
            disabled={isSheriff}
            onPick={() => onSelectTeam('outlaws')}
          />
        </div>

        {unassigned.length > 0 && (
          <div style={{ ...S.mono, fontSize: 10, color: '#d9cbb0', opacity: 0.6, textAlign: 'center', letterSpacing: 2 }}>
            UNDECIDED: {unassigned.map((p) => p.name).join(' · ')}
          </div>
        )}

        {canStartGame && !isSheriff && !isOutlaw ? null : canStartGame ? (
          <WesternBtn primary big onClick={() => socket.emit('startGame')}>▶ START GUNFIGHT</WesternBtn>
        ) : (
          <div style={{ ...S.mono, fontSize: 11, color: '#d9cbb0', opacity: 0.6, textAlign: 'center', letterSpacing: 2 }}>
            WAITING FOR PLAYERS ON BOTH SIDES…
          </div>
        )}
      </div>
    </WesternBackdrop>
  );
}

function TeamPickCard({
  team,
  players,
  max,
  selected,
  disabled,
  onPick,
}: {
  team: Team;
  players: Player[];
  max: number;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const isSheriff = team === 'sheriffs';
  const main = isSheriff ? '#3a6fb5' : '#b53a3a';
  const dark = isSheriff ? '#1f3d6b' : '#6b1f1f';
  const isFull = players.length >= max && !selected;
  const isDisabled = disabled || isFull;

  return (
    <button
      onClick={onPick}
      disabled={isDisabled || selected}
      style={{
        ...S.wood,
        border: `3px solid ${selected ? '#ffd875' : main}`,
        flex: 1,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        background: `linear-gradient(180deg, ${dark}66 0%, #1f140a 100%)`,
        boxShadow: selected
          ? `0 0 30px ${main}66, inset 0 0 30px ${main}33`
          : 'inset 0 1px 0 rgba(255,200,150,0.1), 0 6px 20px rgba(0,0,0,0.5)',
        cursor: isDisabled || selected ? 'default' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        textAlign: 'left',
        color: 'inherit',
      }}
    >
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            right: 14,
            ...S.mono,
            fontSize: 10,
            fontWeight: 'bold',
            color: '#1a0e08',
            background: '#ffd875',
            padding: '3px 10px',
            borderRadius: 3,
            letterSpacing: 2,
          }}
        >
          ✓ LOCKED IN
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {isSheriff ? <StarEmblem size={56} /> : <SkullEmblem size={56} />}
        <div style={{ flex: 1 }}>
          <div style={{ ...S.title, color: main, fontSize: 30, letterSpacing: 2 }}>
            {isSheriff ? 'SHERIFFS' : 'OUTLAWS'}
          </div>
          <div style={{ ...S.serif, color: '#d9cbb0', fontSize: 14, fontStyle: 'italic' }}>
            {isSheriff ? 'Badge, duty, honor.' : 'Whiskey, dust, trouble.'}
          </div>
        </div>
        <div style={{ ...S.mono, fontSize: 24, color: '#e0b04a', fontWeight: 'bold' }}>
          {players.length}
          <span style={{ opacity: 0.4, fontSize: 15 }}>/{max}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 2,
              background: i < players.length ? main : 'rgba(255,255,255,0.08)',
              boxShadow: i < players.length ? `0 0 6px ${main}` : 'none',
            }}
          />
        ))}
      </div>
      {isFull && (
        <div style={{ ...S.mono, fontSize: 11, color: '#ff8080', letterSpacing: 2, fontWeight: 'bold' }}>
          TEAM FULL
        </div>
      )}
    </button>
  );
}
