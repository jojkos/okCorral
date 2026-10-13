import type { ClientPlayer, GameState, Team, Player } from '../../shared/types';
import { CHARACTER_DESIGNS, getCharacterDesign } from '../../shared/characterDesigns';
import { socket } from '../socket';
import { WesternBackdrop, StarEmblem, SkullEmblem } from '../components/WesternUI';
import CowboyPortrait from '../components/CowboyPortrait';
import './team-select.css';

interface TeamSelectProps {
  player: ClientPlayer;
  gameState: GameState;
  error: string | null;
  onSelectTeam: (team: Team) => void;
  onSelectAppearance: (appearance: number) => void;
  onLeave: () => void;
}

export default function TeamSelect({ player, gameState, error, onSelectTeam, onSelectAppearance, onLeave }: TeamSelectProps) {
  const { config, players } = gameState;
  const sheriffs = players.filter((p) => p.team === 'sheriffs' && p.slot >= 0);
  const outlaws = players.filter((p) => p.team === 'outlaws' && p.slot >= 0);
  const unassigned = players.filter((p) => p.slot < 0);
  const bothSidesReady = sheriffs.length > 0 && outlaws.length > 0;
  const isSheriff = player.slot >= 0 && player.team === 'sheriffs';
  const isOutlaw = player.slot >= 0 && player.team === 'outlaws';
  const canStart = bothSidesReady && (isSheriff || isOutlaw);
  const characterTeam = isSheriff ? 'sheriffs' : isOutlaw ? 'outlaws' : null;
  const design = characterTeam ? getCharacterDesign(characterTeam, player.appearance) : null;

  return (
    <WesternBackdrop>
      <main className="phone-lobby">
        <header className="phone-lobby-header">
          <div>
            <div className="eyebrow">Room {gameState.roomCode}</div>
            <h1>Choose your side</h1>
            <p><strong>{player.name}</strong> · Tap an open lane to take your place.</p>
          </div>
          <button className="lobby-leave" onClick={onLeave}>Leave</button>
        </header>
        {error && <p className="phone-lobby-error" role="alert">{error}</p>}
        <div className="phone-lobby-teams">
          <TeamPickCard team="sheriffs" players={sheriffs} max={config.slotsPerSide}
            selected={isSheriff} meId={player.id} onPick={() => onSelectTeam('sheriffs')}
            onSeat={(slot) => socket.emit('takeSeat', { team: 'sheriffs', slot })} />
          <TeamPickCard team="outlaws" players={outlaws} max={config.slotsPerSide}
            selected={isOutlaw} meId={player.id} onPick={() => onSelectTeam('outlaws')}
            onSeat={(slot) => socket.emit('takeSeat', { team: 'outlaws', slot })} />
        </div>
        {characterTeam && design && <section className={`character-pick ${characterTeam}`} aria-labelledby="character-pick-title">
          <div className="character-pick-heading">
            <div><h2 id="character-pick-title">Choose your gunslinger</h2><p>Eight looks. Same grit, same abilities.</p></div>
            <span className="character-team-color">{characterTeam === 'sheriffs' ? 'The law · blue' : 'The wanted · red'}</span>
          </div>
          <div className="character-pick-grid" role="group" aria-label={`Character designs for ${characterTeam}`}>
            {CHARACTER_DESIGNS[characterTeam].map((option) => {
              const selected = option.id === design.id;
              return <button key={option.id} type="button"
                className={`character-card${selected ? ' is-selected' : ''}`} aria-pressed={selected}
                aria-label={`${option.name}${selected ? ', selected' : ''}. ${option.description}`}
                onClick={() => onSelectAppearance(option.id)}>
                <span className="character-card-portrait" aria-hidden="true"><CowboyPortrait team={characterTeam}
                  appearance={option.id} size={102} facing={characterTeam === 'outlaws' ? -1 : 1} animated={false} /></span>
                <strong>{option.name}</strong>
                <span className="character-card-status">{selected ? '✓ Selected' : 'Choose'}</span>
              </button>;
            })}
          </div>
          <p className="character-pick-description" aria-live="polite"><strong>{design.name}</strong> · {design.description}</p>
        </section>}
        {unassigned.length > 0 && <p className="lobby-undecided">Choosing a side: {unassigned.map((p) => p.name).join(' · ')}</p>}
        <footer className="phone-lobby-footer">
          <div className="phone-lobby-footer-inner">
            <p aria-live="polite">{canStart ? 'Both sides are ready. Let’s ride.' : bothSidesReady ? 'Choose a lane to join the gunfight.' : 'Waiting for a player on each side…'}</p>
            <button className="lobby-start" disabled={!canStart} onClick={() => socket.emit('startGame')}>Start gunfight <span aria-hidden="true">→</span></button>
          </div>
        </footer>
      </main>
    </WesternBackdrop>
  );
}

function TeamPickCard({ team, players, max, selected, meId, onPick, onSeat }: {
  team: Team; players: Player[]; max: number; selected: boolean; meId: string;
  onPick: () => void; onSeat: (slot: number) => void;
}) {
  const law = team === 'sheriffs';
  const title = law ? 'Sheriffs' : 'Outlaws';
  const full = players.length >= max && !selected;
  return (
    <section className={`team-pick ${team}${selected ? ' is-selected' : ''}${max > 5 ? ' is-dense' : ''}`} aria-label={title}>
      <div className="team-pick-heading">
        <button className="team-pick-join" onClick={onPick} disabled={selected || full} aria-label={`Join the ${team}`}>
          {law ? <StarEmblem size={30} /> : <SkullEmblem size={30} />}
          <span><strong>{title}</strong><small>{law ? 'Badge, duty, honor.' : 'Whiskey, dust, trouble.'}</small></span>
        </button>
        <div className="team-pick-status"><span>{players.length}/{max}</span><small>{selected ? '✓ Your side' : full ? 'Team full' : 'Open lanes'}</small></div>
      </div>
      <div className="team-pick-lanes">
        {Array.from({ length: max }, (_, slot) => {
          const occupant = players.find((p) => p.slot === slot);
          const mine = occupant?.id === meId;
          return (
            <button key={slot} className={`lane-pick${mine ? ' is-mine' : ''}${occupant ? ' is-occupied' : ''}`}
              onClick={() => !occupant && onSeat(slot)} disabled={!!occupant}
              aria-label={occupant ? `${title} lane ${slot + 1}: ${mine ? 'you' : occupant.name}` : `Take ${team} lane ${slot + 1}`}>
              <span className="lane-number" aria-hidden="true">{slot + 1}</span>
              <span className="lane-name">{mine ? 'You' : occupant ? occupant.name : max > 5 ? 'Open' : 'Available'}{occupant?.isBot && <small> · bot</small>}</span>
              {!occupant && <span className="lane-plus" aria-hidden="true">+</span>}
              {mine && <span className="lane-check" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
