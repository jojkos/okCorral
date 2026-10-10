import { Check, Minus, X } from 'lucide-react';
import type { RoundRecap } from './useRoundFeedback';

const MAX_LINES = 3;

// Compact "what just happened to you" card. Overlays the header strip so the
// action tiles below never shift while it's showing.
export default function RecapCard({ recap, footer, onClose }: { recap: RoundRecap; footer?: string; onClose?: () => void }) {
  const shown = recap.lines.slice(0, MAX_LINES);
  const extra = recap.lines.length - shown.length;
  const worst = recap.lines.some(l => l.tone === 'bad') ? 'bad' : recap.lines.some(l => l.tone === 'good') ? 'good' : 'neutral';
  return (
    <button type="button" className={`recap-card tone-${worst}`} onClick={onClose} aria-live="polite" aria-label="Round recap, tap to close">
      <span className="recap-top">
        <span className="eyebrow">Round {recap.tick} recap</span>
        {recap.headline && <strong className="recap-headline">{recap.headline}</strong>}
      </span>
      <ul>
        {shown.map((l, i) => (
          <li key={i} className={`recap-line ${l.tone}`}>
            {l.tone === 'good' ? <Check size={13} strokeWidth={3} /> : l.tone === 'bad' ? <X size={13} strokeWidth={3} /> : <Minus size={13} strokeWidth={3} />}
            <span>{l.text}</span>
          </li>
        ))}
        {extra > 0 && <li className="recap-line neutral more">+{extra} more</li>}
      </ul>
      {footer && <span className="recap-foot">{footer} · tap to close</span>}
    </button>
  );
}
