import type { CSSProperties, ReactNode } from 'react';
import { Shield, Skull, Check } from 'lucide-react';
import type { Barrel, GameState, Player, Team } from '../../../shared/types';
import { enemyOf, laneBarrel, laneOccupant, shortName } from './boardInfo';

export interface MapHighlight {
  kind: 'shot' | 'move';
  lane: number; // target lane (may be off-board → not drawn)
  locked?: boolean;
}

interface Props {
  gameState: GameState;
  meId: string;
  team: Team; // whose perspective (YOU/THEM); sides match the TV: sheriffs left, outlaws right
  highlight?: MapHighlight | null;
  threatIds?: Set<string>;
  showLocks?: boolean;
  footer?: ReactNode;
}

const teamLabel = (t: Team) => (t === 'sheriffs' ? 'Sheriffs' : 'Outlaws');

function Pips({ n, max = 3, kind }: { n: number; max?: number; kind: 'hp' | 'ammo' }) {
  return <span className={`mm-pips mm-pips--${kind}`} aria-hidden>{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}

function BarrelCell({ barrel, manned, target, mine, lane }: { barrel?: Barrel; manned: boolean; target: boolean; mine: boolean; lane: number }) {
  const hp = barrel?.hp ?? 0;
  return (
    <div className={`mm-barrel ${hp <= 0 ? 'broken' : ''} ${manned ? 'manned' : ''} ${target ? 'is-target' : ''} ${mine ? 'mine' : 'theirs'}`}
      style={{ gridRow: lane + 1 }} title={hp > 0 ? `Barrel ${hp}/3` : 'Barrel destroyed'}>
      {hp > 0 ? <span className="mm-barrel-body">{[2, 1, 0].map(i => <i key={i} className={i < hp ? 'on' : ''} />)}</span> : <span className="mm-barrel-broken">✕</span>}
    </div>
  );
}

function TokenCell({ p, me, mine, lane, threat, target, moveTarget, showLock, barrelUp }: {
  p?: Player; me: boolean; mine: boolean; lane: number; threat: boolean; target: boolean; moveTarget: boolean; showLock: boolean; barrelUp: boolean;
}) {
  const cls = ['mm-cell', mine ? 'mine' : 'theirs', me ? 'is-me' : '', target ? 'is-target' : '', moveTarget ? 'is-move' : '', lane % 2 ? 'odd' : ''].join(' ');
  if (!p) return <div className={cls} style={{ gridRow: lane + 1 }}><span className="mm-empty">{moveTarget ? 'move here' : '·'}</span></div>;
  const covered = p.isAlive && p.isCovered && barrelUp;
  return (
    <div className={cls} style={{ gridRow: lane + 1 }}>
      <span className={`mm-avatar ${p.team} ${p.isAlive ? '' : 'dead'} ${covered ? 'covered' : ''} ${threat ? 'threat' : ''}`}>
        {p.isAlive ? (me ? '★' : p.name.slice(0, 1).toUpperCase()) : <Skull size={12} />}
        {covered && <span className="mm-badge mm-badge--cover"><Shield size={8} strokeWidth={3} /></span>}
        {showLock && p.isAlive && p.actionLocked && <span className="mm-badge mm-badge--lock"><Check size={8} strokeWidth={4} /></span>}
      </span>
      <span className="mm-meta">
        <span className="mm-name">{me ? 'YOU' : shortName(p.name)}</span>
        {p.isAlive ? <span className="mm-stats"><Pips n={p.hp} kind="hp" /><Pips n={p.ammo} kind="ammo" /></span> : <span className="mm-stats mm-dead">down</span>}
      </span>
    </div>
  );
}

export default function LaneMiniMap({ gameState: gs, meId, team, highlight, threatIds, showLocks, footer }: Props) {
  const lanes = gs.config.slotsPerSide;
  const enemy = enemyOf(team);
  // Mirror for outlaws so the phone map matches the TV (outlaws on the right).
  const flipped = team === 'outlaws';
  const me = gs.players.find(p => p.id === meId);
  const myLane = me && me.slot >= 0 ? me.slot : -1;
  const rowH = lanes <= 3 ? 32 : lanes === 4 ? 30 : lanes === 5 ? 27 : lanes === 6 ? 24 : lanes === 7 ? 21 : 19;
  const hl = highlight && highlight.lane >= 0 && highlight.lane < lanes ? highlight : null;
  const style = { '--mm-lanes': lanes, '--mm-row': `${rowH}px` } as CSSProperties;
  const cells = [];
  for (let lane = 0; lane < lanes; lane++) {
    const mineP = laneOccupant(gs, team, lane), theirP = laneOccupant(gs, enemy, lane);
    const myBarrel = laneBarrel(gs, team, lane), theirBarrel = laneBarrel(gs, enemy, lane);
    const shotHere = hl?.kind === 'shot' && hl.lane === lane;
    const moveHere = hl?.kind === 'move' && hl.lane === lane;
    cells.push(
      <TokenCell key={`m${lane}`} p={mineP} me={mineP?.id === meId} mine lane={lane} threat={false} target={false} moveTarget={moveHere} showLock={!!showLocks} barrelUp={(myBarrel?.hp ?? 0) > 0} />,
      <BarrelCell key={`mb${lane}`} barrel={myBarrel} manned={!!mineP?.isAlive && !!mineP.isCovered} target={false} mine lane={lane} />,
      <BarrelCell key={`tb${lane}`} barrel={theirBarrel} manned={!!theirP?.isAlive && !!theirP.isCovered} target={shotHere} mine={false} lane={lane} />,
      <TokenCell key={`t${lane}`} p={theirP} me={false} mine={false} lane={lane} threat={!!theirP && !!threatIds?.has(theirP.id)} target={shotHere} moveTarget={false} showLock={false} barrelUp={(theirBarrel?.hp ?? 0) > 0} />,
    );
  }
  const y = (l: number) => l + 0.5;
  return (
    <section className="mm" aria-label="Board map">
      <div className={`mm-head ${flipped ? 'flipped' : ''}`}>
        <span className={`mm-side ${team}`}>YOU · {teamLabel(team)}</span>
        <span className={`mm-side ${enemy}`}>THEM · {teamLabel(enemy)}</span>
      </div>
      <div className={`mm-board ${rowH <= 21 ? 'compact' : ''} ${flipped ? 'flipped' : ''}`} style={style}>
        {cells}
        <div className="mm-gap" style={{ gridRow: `1 / span ${lanes}` }}>
          {Array.from({ length: lanes }, (_, l) => <span key={l} className={`mm-lane-no ${l === myLane ? 'mine' : ''}`} style={{ top: `${(y(l) / lanes) * 100}%` }}>{l + 1}</span>)}
          {hl?.kind === 'shot' && myLane >= 0 && (
            <svg className={`mm-aim ${hl.locked ? 'locked' : ''}`} viewBox={`0 0 10 ${lanes}`} preserveAspectRatio="none" aria-hidden>
              <line x1={flipped ? 10 : 0} y1={y(myLane)} x2={flipped ? 0 : 10} y2={y(hl.lane)} vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
      </div>
      {footer && <div className="mm-foot">{footer}</div>}
    </section>
  );
}
