import { useState, useEffect } from 'react';
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
    return <HostApp />;
  }

  if (mode === 'client') {
    return <ClientApp />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl text-center">
        <h1 className="text-5xl md:text-6xl uppercase text-amber-700">OK Corral</h1>
        <p className="mt-2 text-sm tracking-[0.3em] uppercase text-neutral-500">
          Digital Gunfight
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={handleHostClick}
            className="western-card p-8 md:p-10 text-center transition-transform hover:-translate-y-1"
            style={{ backgroundColor: '#C85F20', color: '#F8F1E2', borderColor: '#5A3A1B', boxShadow: '6px 6px 0px 0px #3E2612' }}
          >
            <div className="text-5xl mb-4">📺</div>
            <div className="text-xl uppercase tracking-widest">Start Hosting</div>
            <div className="mt-2 text-sm opacity-80">For the TV / Big Screen</div>
          </button>

          <button
            onClick={handleClientClick}
            className="western-card p-8 md:p-10 text-center transition-transform hover:-translate-y-1"
            style={{ backgroundColor: '#1F8EA4', color: '#F8F1E2', borderColor: '#0C4A55', boxShadow: '6px 6px 0px 0px #08323A' }}
          >
            <div className="text-5xl mb-4">🎮</div>
            <div className="text-xl uppercase tracking-widest">Join Game</div>
            <div className="mt-2 text-sm opacity-80">Join with Mobile</div>
          </button>
        </div>

        <p className="mt-10 text-xs text-neutral-500">
          Host on a big screen, players join on phones
        </p>
      </div>
    </div>
  );
}
