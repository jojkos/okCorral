import type { Bullet, GameState, Player } from '../../shared/types';

export type RecapTone = 'good' | 'bad' | 'neutral';
export interface RecapLine { text: string; tone: RecapTone }

const nameOf = (gs: GameState, id?: string) => gs.players.find(p => p.id === id)?.name ?? 'someone';
const shooterName = (gs: GameState, bullet: Bullet) => bullet.source === 'gatling' ? 'The gatling gunman' : nameOf(gs, bullet.shooterId);

// What happened to / because of one player in the last resolved round.
export function personalRecap(gs: GameState, me: Player): RecapLine[] {
  const out: RecapLine[] = [];
  const bullets: Bullet[] = gs.lastTickBullets || [];
  for (const b of bullets) {
    if (b.shooterId === me.id) {
      if (b.hit === 'player') out.push({ text: b.lethal ? `You gunned down ${nameOf(gs, b.targetId)}!` : `You hit ${nameOf(gs, b.targetId)}`, tone: 'good' });
      else if (b.hit === 'barrel') out.push({ text: `${nameOf(gs, b.targetId)}'s barrel took your bullet`, tone: 'neutral' });
      else if (b.hit === 'bullet') out.push({ text: 'Your bullet clashed mid-air', tone: 'neutral' });
      else if (b.hit === 'woman') out.push({ text: 'You shot the woman. You will take your own life next round', tone: 'bad' });
      else out.push({ text: 'Your shot hit nothing but air', tone: 'bad' });
    }
    if (b.targetId === me.id) {
      if (b.hit === 'player') out.push({ text: b.lethal ? `${shooterName(gs, b)} finished you off` : `${shooterName(gs, b)} hit you`, tone: 'bad' });
      else if (b.hit === 'barrel') out.push({ text: `Your barrel blocked ${shooterName(gs, b)}`, tone: 'good' });
    }
  }
  if (!out.length) {
    const a = me.currentAction;
    out.push({ text: a === 'RELOAD' ? 'Reloaded. +1 bullet' : a === 'COVER' ? 'You hid. Nobody fired at you' : a.startsWith('MOVE') ? 'You changed lanes' : a === 'NONE' ? 'You froze. No action locked' : 'Quiet round', tone: a === 'NONE' ? 'bad' : 'neutral' });
  }
  return out;
}

// Short headline for the whole round, used by host banners.
export function roundHeadline(gs: GameState): string | null {
  const bullets = gs.lastTickBullets || [];
  if (bullets.some(b => b.source === 'gatling')) return 'GATLING MAYHEM!';
  if (bullets.some(b => b.hit === 'woman')) return 'BYSTANDER SHOT!';
  if (gs.lastTickSuicides.length) return gs.lastTickSuicides.length > 1 ? 'GUILT CLAIMS THEM' : 'GUILT TAKES ITS TOLL';
  const kills = bullets.filter(b => b.lethal);
  const sAlive = gs.players.filter(p => p.team === 'sheriffs' && p.isAlive && p.slot >= 0).length;
  const oAlive = gs.players.filter(p => p.team === 'outlaws' && p.isAlive && p.slot >= 0).length;
  if (kills.length && sAlive === 0 && oAlive === 0) return 'MUTUAL DESTRUCTION';
  const byShooter = new Map<string, number>();
  kills.forEach(k => k.shooterId && byShooter.set(k.shooterId, (byShooter.get(k.shooterId) || 0) + 1));
  if ([...byShooter.values()].some(n => n >= 2)) return 'DOUBLE KILL';
  if (kills.length >= 2) return 'MASSACRE';
  if (kills.length === 1) {
    if ((sAlive === 1 && oAlive > 1) || (oAlive === 1 && sAlive > 1)) return 'LAST ONE STANDING';
    return 'GUNNED DOWN';
  }
  const clashes = bullets.filter(b => b.hit === 'bullet').length / 2;
  if (clashes >= 1) return 'CLANG!';
  if (bullets.length && bullets.every(b => b.hit === 'barrel' || b.hit === 'miss')) {
    return bullets.some(b => b.hit === 'barrel') ? 'SPLINTERS!' : 'ALL MISSED';
  }
  if (!bullets.length && gs.players.every(p => !p.isAlive || p.currentAction !== 'NONE')) return 'NERVES OF STEEL';
  return null;
}
