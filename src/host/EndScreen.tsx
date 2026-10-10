import type { CSSProperties, ReactNode } from 'react';
import type { GameState, Player, PlayerStats } from '../../shared/types';
import { socket } from '../socket';
import { WesternBackdrop, StarEmblem, SkullEmblem, WesternBtn } from '../components/WesternUI';
import CowboyPortrait from '../components/CowboyPortrait';
import { computeAwards, mvp } from '../lib/awards';
import { BotBadge, SessionScore, nameSeed, teamLabel } from './components/HostBits';
import './host.css';

interface EndScreenProps {
  gameState: GameState;
}

const accuracy = (s?: PlayerStats) => (s && s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : null);

export default function EndScreen({ gameState }: EndScreenProps) {
  const { winner, tick, players, barrels, session } = gameState;

  const handlePlayAgain = () => socket.emit('playAgain');
  const handleEndSession = () => {
    socket.emit('endSession');
    sessionStorage.removeItem('okCorral-hostSession');
    window.location.href = '/';
  };

  const seated = players.filter((p) => p.slot >= 0);
  const kills = seated.filter((p) => !p.isAlive).length;
  const barrelsStanding = barrels.filter((b) => b.hp > 0).length;
  const star = mvp(gameState);
  const awards = computeAwards(gameState, 5);
  const rows = [...seated].sort((a, b) =>
    a.team === b.team ? a.slot - b.slot : a.team === 'sheriffs' ? -1 : 1,
  );

  let headline: string;
  let emblem: ReactNode;
  let flavor: string;
  if (winner === 'draw') {
    headline = 'STALEMATE';
    emblem = <StarEmblem size={64} color="#8a621e" />;
    flavor = 'both sides fell · the saloon stays empty';
  } else if (winner === 'sheriffs') {
    headline = 'THE SHERIFFS';
    emblem = <StarEmblem size={64} color="#ffd875" />;
    flavor = 'take the town · the Outlaws ride no more';
  } else {
    headline = 'THE OUTLAWS';
    emblem = <SkullEmblem size={64} />;
    flavor = "ride out victorious · the law lies bleedin'";
  }
  const winClass = winner === 'draw' || !winner ? 'draw' : winner;

  return (
    <WesternBackdrop dark>
      <div className="hx-sparkles" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 61) % 100}%`,
              width: 2 + (i % 4),
              height: 2 + (i % 4),
              animationDelay: `${-(i * 0.7)}s`,
            }}
          />
        ))}
      </div>

      <div className="host-screen he">
        <section className="he-left">
          <div className={`he-paper he-paper--${winClass}`}>
            <div className="he-paper__stars">★ ★ ★</div>
            <div className="he-paper__order">
              {winner === 'draw' ? 'BY ORDER OF NO ONE' : 'BY ORDER OF THE MARSHAL'}
            </div>
            <h1 className="he-paper__title">{winner === 'draw' ? 'DRAW' : 'VICTORY'}</h1>
            <div className="he-paper__team">
              {emblem}
              <span>{headline}</span>
              {emblem}
            </div>
            <div className="he-paper__flavor">{flavor}</div>
            <div className="he-paper__meta">
              {tick} {tick === 1 ? 'ROUND' : 'ROUNDS'} · {kills} {kills === 1 ? 'ELIMINATION' : 'ELIMINATIONS'} · {barrelsStanding} BARRELS STANDING
            </div>
          </div>

          {star?.stats && <MvpSpotlight player={star} />}

          <div className="he-actions">
            <WesternBtn big onClick={handlePlayAgain}>↺ Play Again</WesternBtn>
            <WesternBtn primary big onClick={handleEndSession}>▷ End Session</WesternBtn>
          </div>
        </section>

        <section className="he-right">
          {session && <SessionScore session={session} className="he-session" />}

          <div className="he-block">
            <h2 className="he-h2">Awards</h2>
            {awards.length > 0 ? (
              <div className="he-awards">
                {awards.map((a, i) => (
                  <article
                    key={a.id}
                    className={`he-award he-award--${a.player.team}`}
                    style={{ '--i': i } as CSSProperties}
                  >
                    <div className="he-award__icon" aria-hidden="true">{a.icon}</div>
                    <div className="he-award__title">{a.title}</div>
                    <div className={`he-award__name hx-c-${a.player.team}`}>
                      {a.player.name}
                      {a.player.isBot && <BotBadge />}
                    </div>
                    <div className="he-award__blurb">{a.blurb}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="he-empty">No awards handed out — the dust is still settlin'.</div>
            )}
          </div>

          <div className="he-block he-block--table">
            <h2 className="he-h2">Match Recap</h2>
            <div className="he-table-wrap">
              <table className="he-table">
                <thead>
                  <tr>
                    <th scope="col">Gunslinger</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">Shots</th>
                    <th scope="col" className="num">Hits</th>
                    <th scope="col" className="num">Kills</th>
                    <th scope="col" className="num">Blocked</th>
                    <th scope="col" className="num">Acc.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <RecapRow key={p.id} player={p} isMvp={p.id === star?.id} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </WesternBackdrop>
  );
}

function statusText(p: Player): string {
  if (p.isAlive) return 'Standing';
  const t = p.stats?.diedOnTick;
  return t != null ? `Fell R${t}` : 'Fell';
}

function RecapRow({ player: p, isMvp }: { player: Player; isMvp: boolean }) {
  const s = p.stats;
  const acc = accuracy(s);
  const dash = <span className="he-dim">—</span>;
  return (
    <tr className={`he-row he-row--${p.team}${p.isAlive ? '' : ' he-row--dead'}`}>
      <th scope="row">
        <span className={`he-row__name hx-c-${p.team}`}>
          {p.name}
          {isMvp && <span className="he-mvp-tag" title="Most valuable player">MVP</span>}
          {p.isBot && <BotBadge />}
        </span>
      </th>
      <td>
        <span className={p.isAlive ? 'he-alive' : 'he-dead'}>
          {p.isAlive ? '★ ' : '✝ '}
          {statusText(p)}
        </span>
      </td>
      <td className="num">{s ? s.shots : dash}</td>
      <td className="num">{s ? s.hits : dash}</td>
      <td className="num">{s ? s.kills : dash}</td>
      <td className="num">{s ? s.blocked : dash}</td>
      <td className="num">{acc != null ? `${acc}%` : dash}</td>
    </tr>
  );
}

function MvpSpotlight({ player }: { player: Player }) {
  const s = player.stats!;
  const acc = accuracy(s);
  const chips: [string, string | number][] = [
    ['Kills', s.kills],
    ['Hits', s.hits],
    ['Accuracy', acc != null ? `${acc}%` : '—'],
    ['Blocked', s.blocked],
  ];
  return (
    <div className={`he-mvp he-mvp--${player.team}`}>
      <div className="he-mvp__portrait" aria-hidden="true">
        <span className="he-mvp__halo" />
        <CowboyPortrait
          team={player.team}
          size={260}
          facing={player.team === 'sheriffs' ? 1 : -1}
          seed={nameSeed(player.name)}
        />
      </div>
      <div className="he-mvp__body">
        <div className="he-mvp__kicker">★ Most Valuable Gunslinger ★</div>
        <div className={`he-mvp__name hx-c-${player.team}`}>
          {player.name}
          {player.isBot && <BotBadge />}
        </div>
        <div className="he-mvp__sub">
          {teamLabel(player.team)} · {player.isAlive ? 'still standing' : s.diedOnTick != null ? `fell in round ${s.diedOnTick}` : 'fell in the fight'}
        </div>
        <div className="he-mvp__stats">
          {chips.map(([label, value]) => (
            <div key={label} className="he-stat">
              <div className="he-stat__value">{value}</div>
              <div className="he-stat__label">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
