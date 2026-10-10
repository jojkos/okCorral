import { useState, useEffect } from 'react';
import GamePreferences from './components/GamePreferences';
import { Monitor, Smartphone, ArrowUpRight } from 'lucide-react';
import CowboyPortrait from './components/CowboyPortrait';
import HostApp from './host/HostApp';
import ClientApp from './client/ClientApp';

type Mode = 'select' | 'host' | 'client';

export default function App() {
  const [mode, setMode] = useState<Mode>(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Check for explicit mode in URL
    const modeParam = params.get('mode');
    if (modeParam === 'host' || params.has('code')) return 'host';
    if (modeParam === 'join' || params.has('join')) return 'client';
    
    return 'select';
  });

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode');
      
      if (modeParam === 'host' || params.has('code')) {
        setMode('host');
      } else if (modeParam === 'join' || params.has('join')) {
        setMode('client');
      } else {
        setMode('select');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleHostClick = () => {
    // Push to history with unique URL
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'host');
    window.history.pushState({ mode: 'host' }, '', url.toString());
    setMode('host');
  };

  const handleClientClick = () => {
    // Push to history with unique URL
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'join');
    window.history.pushState({ mode: 'client' }, '', url.toString());
    setMode('client');
  };

  if (mode === 'host') {
    return <><GamePreferences /><HostApp /></>;
  }

  if (mode === 'client') {
    return <><GamePreferences /><ClientApp /></>;
  }

  return <main className="landing-screen">
    <GamePreferences />
    <header className="landing-top"><span className="brand-mark">OC /</span><span>A GAME OF NERVE & TIMING</span><span>EST. 1881</span></header>
    <div className="landing-content">
      <div className="eyebrow">GATHER YOUR POSSE</div>
      <h1>O.K.<br /><span>CORRAL</span></h1>
      <p className="landing-tagline">One town. Two sides.<br />Everybody draws at once.</p>
      <div className="landing-actions">
        <button className="launch-card host-card" onClick={handleHostClick}><Monitor size={25} /><span><strong>Host a showdown</strong><small>Put the arena on your big screen</small></span><ArrowUpRight size={22} /></button>
        <button className="launch-card join-card" onClick={handleClientClick}><Smartphone size={25} /><span><strong>Join the posse</strong><small>Your phone is your controller</small></span><ArrowUpRight size={22} /></button>
      </div>
      <div className="landing-footer"><span>SHERIFFS vs OUTLAWS</span><span>PHONES IN HAND. EYES ON THE ARENA.</span></div>
    </div>
    <div className="hero-cowboys" aria-hidden="true"><CowboyPortrait team="sheriffs" size={380} /><CowboyPortrait team="outlaws" size={380} facing={-1} seed={7} /></div>
  </main>;
}
