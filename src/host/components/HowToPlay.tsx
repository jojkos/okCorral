import type { ReactNode } from 'react';
import { ArrowUpDown, Crosshair, RefreshCw, Shield, Smartphone, Trophy, Zap } from 'lucide-react';

const RULES: { icon: ReactNode; label: string; text: ReactNode }[] = [
  { icon: <Smartphone />, label: 'Pick ONE', text: 'action per round on your phone — it stays secret' },
  { icon: <ArrowUpDown />, label: 'Move ↑ / ↓', text: 'dodges shots aimed at your old lane' },
  { icon: <Shield />, label: 'Cover', text: <>hide behind your barrel — <em>barrels break after 3 hits!</em></> },
  { icon: <RefreshCw />, label: 'Reload', text: '+1 bullet (you start with 1, max 3)' },
  { icon: <Crosshair />, label: 'Shoot', text: 'straight or diagonally up / down — 1 damage' },
  { icon: <Zap />, label: 'Clang!', text: 'bullets that meet mid-air cancel out' },
  { icon: <Trophy />, label: 'Win', text: 'last team standing wins — both wiped out is a draw' },
];

export default function HowToPlay({ roundSeconds }: { roundSeconds: number }) {
  return (
    <section className="hl-howto" aria-labelledby="hl-howto-title">
      <div className="hl-howto__nail hl-howto__nail--l" />
      <div className="hl-howto__nail hl-howto__nail--r" />
      <h2 id="hl-howto-title" className="hl-howto__title">How to Play</h2>
      <p className="hl-howto__sub">
        {roundSeconds}s to choose · everyone fires at once · 3 hearts each
      </p>
      <ol className="hl-howto__list">
        {RULES.map((r) => (
          <li key={r.label} className="hl-howto__item">
            <span className="hl-howto__icon">{r.icon}</span>
            <span className="hl-howto__text">
              <b>{r.label}</b> {r.text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
