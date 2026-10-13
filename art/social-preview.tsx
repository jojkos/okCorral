import { createRoot } from 'react-dom/client';
import CowboyPortrait from '../src/components/CowboyPortrait';
import { preloadCowboySprites } from '../src/lib/cowboySprites';

// Open /art/social-preview.html with Vite at a 1200×630 viewport and capture
// the complete card to public/og/ok-corral-v1.jpg. Uses the actual game artwork.
await Promise.all([
  preloadCowboySprites(),
  document.fonts.load('104px Rye'),
  document.fonts.load('36px Outfit'),
  document.fonts.load('16px "Space Mono"'),
]);
createRoot(document.getElementById('root')!).render(
  <main className="card">
    <div className="landscape" />
    <p className="eyebrow">A GAME OF NERVE &amp; TIMING</p>
    <h1>O.K. CORRAL</h1>
    <div className="sheriff"><CowboyPortrait team="sheriffs" size={405} animated={false} /></div>
    <div className="outlaw"><CowboyPortrait team="outlaws" facing={-1} size={405} animated={false} /></div>
    <div className="copy"><p>One town.<br />Two sides.</p><p>Everybody draws<br />at once.</p></div>
    <div className="how"><strong>One big screen.</strong><br />Your phones are the controllers.</div>
    <div className="side left">★ SHERIFFS</div>
    <div className="side right">OUTLAWS ★</div>
    <div className="site">okcorral.onrender.com</div>
  </main>,
);
