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
            switching={isOutlaw}
            meId={player.id}
            onPick={() => onSelectTeam('sheriffs')}
            onSeat={(slot) => socket.emit('takeSeat', { team: 'sheriffs', slot })}
          />
          <TeamPickCard
            team="outlaws"
            players={outlaws}
            max={config.slotsPerSide}
            selected={isOutlaw}
            switching={isSheriff}
            meId={player.id}
            onPick={() => onSelectTeam('outlaws')}
            onSeat={(slot) => socket.emit('takeSeat', { team: 'outlaws', slot })}
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
  switching,
  meId,
  onPick,
  onSeat,
}: {
  team: Team;
  players: Player[];
  max: number;
  selected: boolean;
  /** Player is on the other team; tapping this card switches sides. */
  switching: boolean;
  meId: string;
  onPick: () => void;
  /** Sit in a specific lane (0-based) on this team. */
  onSeat: (slot: number) => void;
}) {
  const isSheriff = team === 'sheriffs';
  const main = isSheriff ? '#83c6c2' : '#ee987b';
  const dark = isSheriff ? '#254c59' : '#613d36';
  const isFull = players.length >= max && !selected;
  const compact = max > 5;

  return (
    <div
      style={{
        ...S.wood,
        border: `3px solid ${selected ? '#ffd875' : main}`,
        padding: '14px 14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'relative',
        background: `linear-gradient(180deg, ${dark}66 0%, #182c35 100%)`,
        boxShadow: selected
          ? `0 0 30px ${main}66, inset 0 0 30px ${main}33`
          : 'inset 0 1px 0 rgba(255,200,150,0.1), 0 6px 20px rgba(0,0,0,0.5)',
        opacity: isFull ? 0.55 : 1,
        color: 'inherit',
      }}
    >
      {selected && <CornerTag bg="#ffd875" color="#1a0e08">✓ YOUR SIDE</CornerTag>}
      {switching && !isFull && <CornerTag bg={dark} color="#f4e9d6" border={main}>⇄ TAP A SPOT TO SWITCH</CornerTag>}

      <button
        onClick={onPick}
        disabled={selected || isFull}
        aria-label={selected ? undefined : `Join the ${isSheriff ? 'sheriffs' : 'outlaws'}`}
        style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', padding: 0, color: 'inherit', textAlign: 'left', cursor: selected || isFull ? 'default' : 'pointer' }}
      >
        {isSheriff ? <StarEmblem size={42} /> : <SkullEmblem size={42} />}
        <div style={{ flex: 1 }}>
          <div style={{ ...S.title, color: main, fontSize: 26, letterSpacing: 2 }}>
            {isSheriff ? 'SHERIFFS' : 'OUTLAWS'}
          </div>
          <div style={{ ...S.serif, color: '#d9cbb0', fontSize: 13, fontStyle: 'italic' }}>
            {isSheriff ? 'Badge, duty, honor.' : 'Whiskey, dust, trouble.'}
          </div>
        </div>
        <div style={{ ...S.mono, fontSize: 22, color: '#e0b04a', fontWeight: 'bold' }}>
          {players.length}
          <span style={{ opacity: 0.4, fontSize: 14 }}>/{max}</span>
        </div>
      </button>

      {/* One row per lane: pick exactly where you stand when the shooting starts. */}
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : '1fr', gap: 5 }}>
        {Array.from({ length: max }).map((_, slot) => {
          const p = players.find((pl) => pl.slot === slot);
          const mine = p?.id === meId;
          const free = !p;
          return (
            <button
              key={slot}
              onClick={() => free && onSeat(slot)}
              disabled={!free}
              aria-label={free ? `Take lane ${slot + 1}` : `Lane ${slot + 1}: ${mine ? 'you' : p!.name}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: compact ? 32 : 34, padding: '4px 10px',
                borderRadius: 6, textAlign: 'left', color: 'inherit', cursor: free ? 'pointer' : 'default',
                background: mine ? '#ffd8752a' : free ? 'rgba(255,255,255,0.04)' : `${dark}88`,
                border: mine ? '2px solid #ffd875' : free ? '1px dashed rgba(217,203,176,0.35)' : `1px solid ${main}55`,
              }}
            >
              <span style={{ ...S.mono, fontSize: 11, color: mine ? '#ffd875' : '#b9ab92', width: 44, flex: 'none', letterSpacing: 1 }}>LANE {slot + 1}</span>
              <span style={{ ...S.mono, fontSize: 13, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: mine ? '#ffd875' : free ? 'rgba(217,203,176,0.55)' : '#f4e9d6' }}>
                {mine ? '★ YOU' : free ? (compact ? '+ sit' : '+ tap to stand here') : `${p!.name}${p!.isBot ? ' · bot' : ''}`}
              </span>
            </button>
          );
        })}
      </div>
      {isFull && (
        <div style={{ ...S.mono, fontSize: 11, color: '#ff8080', letterSpacing: 2, fontWeight: 'bold' }}>
          TEAM FULL
        </div>
      )}
    </div>
  );
}

function CornerTag({ children, bg, color, border }: { children: React.ReactNode; bg: string; color: string; border?: string }) {
  return (
    <div
      style={{
        position: 'absolute', top: -12, right: 14, ...S.mono, fontSize: 10, fontWeight: 'bold', color, background: bg,
        border: border ? `1px solid ${border}` : undefined, padding: '3px 10px', borderRadius: 3, letterSpacing: 2,
      }}
    >
      {children}
    </div>
  );
}
