import type { Player, SessionScore as SessionScoreT, Team } from '../../../shared/types';
import CowboyPortrait from '../../components/CowboyPortrait';

// Same seed the arena uses, so a player's cowboy looks identical everywhere.
export function nameSeed(name: string): number {
  return Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0);
}

export function teamLabel(team: Team): string {
  return team === 'sheriffs' ? 'Sheriffs' : 'Outlaws';
}

/** Head-and-shoulders crop of the animated canvas cowboy. Size is set in CSS. */
export function PlayerAvatar({ player, className = '' }: { player: Pick<Player, 'name' | 'team'>; className?: string }) {
  return (
    <span className={`hx-avatar hx-avatar--${player.team} ${className}`} aria-hidden="true">
      <CowboyPortrait
        team={player.team}
        size={150}
        facing={player.team === 'sheriffs' ? 1 : -1}
        seed={nameSeed(player.name)}
      />
    </span>
  );
}

export function BotBadge() {
  return <span className="hx-bot-badge">BOT</span>;
}

export function hasSessionGames(s?: SessionScoreT): s is SessionScoreT {
  return !!s && s.sheriffs + s.outlaws + s.draws > 0;
}

/** "SHERIFFS 2 — 1 OUTLAWS · 0 draws" */
export function SessionScore({ session, className = '' }: { session: SessionScoreT; className?: string }) {
  const games = session.sheriffs + session.outlaws + session.draws;
  return (
    <div className={`hx-session ${className}`} aria-label={`Session score: Sheriffs ${session.sheriffs}, Outlaws ${session.outlaws}, ${session.draws} draws`}>
      <span className="hx-session__label">Session · {games} {games === 1 ? 'game' : 'games'}</span>
      <span className="hx-session__line">
        <span className="hx-c-sheriffs">SHERIFFS</span>
        <b className="hx-session__num hx-c-sheriffs">{session.sheriffs}</b>
        <span className="hx-session__dash">—</span>
        <b className="hx-session__num hx-c-outlaws">{session.outlaws}</b>
        <span className="hx-c-outlaws">OUTLAWS</span>
        <span className="hx-session__draws">· {session.draws} {session.draws === 1 ? 'draw' : 'draws'}</span>
      </span>
    </div>
  );
}
