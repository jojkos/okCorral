import type { GameState } from '../../shared/types';
import { socket } from '../socket';
import { WesternBackdrop, StarEmblem, SkullEmblem, WesternBtn, westernStyles as S } from '../components/WesternUI';

interface EndScreenProps {
  gameState: GameState;
}

export default function EndScreen({ gameState }: EndScreenProps) {
  const { winner, tick, players, barrels } = gameState;

  const handlePlayAgain = () => socket.emit('playAgain');
  const handleEndSession = () => {
    socket.emit('endSession');
    sessionStorage.removeItem('okCorral-hostSession');
    window.location.href = '/';
  };

  const kills = players.filter((p) => !p.isAlive && p.slot >= 0).length;
  const barrelsStanding = barrels.filter((b) => b.hp > 0).length;

  let headline: string;
  let teamColor: string;
  let emblem: React.ReactNode;
  let flavor: string;
  if (winner === 'draw') {
    headline = 'STALEMATE';
    teamColor = '#8a621e';
    emblem = <StarEmblem size={72} color="#8a621e" />;
    flavor = 'both sides fell · the saloon stays empty';
  } else if (winner === 'sheriffs') {
    headline = 'THE SHERIFFS';
    teamColor = '#1f3d6b';
    emblem = <StarEmblem size={72} color="#ffd875" />;
    flavor = 'take the town · the Outlaws ride no more';
  } else {
    headline = 'THE OUTLAWS';
    teamColor = '#6b1f1f';
    emblem = <SkullEmblem size={72} />;
    flavor = 'ride out victorious · the law lies bleedin\'';
  }

  return (
    <WesternBackdrop dark>
      {Array.from({ length: 24 }).map((_, i) => {
        const x = (i * 137) % 1280;
        const y = (i * 191) % 800;
        const sz = 2 + (i % 4);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: sz,
              height: sz,
              borderRadius: '50%',
              background: '#ffd875',
              opacity: 0.6,
              boxShadow: '0 0 10px #ffd875',
              pointerEvents: 'none',
            }}
          />
        );
      })}

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 60,
          gap: 28,
        }}
      >
        <div
          style={{
            ...S.paper,
            padding: '50px 80px',
            textAlign: 'center',
            transform: 'rotate(-1deg)',
            border: '3px solid #3e2417',
            maxWidth: 860,
          }}
        >
          <div style={{ ...S.mono, fontSize: 14, color: '#6b4423', letterSpacing: 6, fontWeight: 'bold' }}>★ ★ ★</div>
          <div style={{ ...S.serif, fontSize: 28, color: '#6b4423', letterSpacing: 4, marginTop: 10 }}>
            {winner === 'draw' ? 'BY ORDER OF NO ONE' : 'BY ORDER OF THE MARSHAL'}
          </div>
          <h1
            style={{
              ...S.title,
              fontSize: 140,
              margin: '10px 0 6px',
              color: '#3e2417',
              letterSpacing: 12,
              textShadow: '0 4px 0 rgba(100,60,20,0.25)',
            }}
          >
            {winner === 'draw' ? 'DRAW' : 'VICTORY'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 16 }}>
            {emblem}
            <div style={{ ...S.serif, fontSize: 48, color: teamColor, letterSpacing: 3 }}>{headline}</div>
            {emblem}
          </div>
          <div style={{ ...S.serif, fontSize: 22, color: '#6b4423', marginTop: 10, fontStyle: 'italic' }}>{flavor}</div>
          <div style={{ ...S.mono, fontSize: 11, color: '#6b4423', letterSpacing: 3, marginTop: 22, opacity: 0.7 }}>
            {tick} ROUNDS · {kills} ELIMINATIONS · {barrelsStanding} BARRELS STANDING
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <WesternBtn big onClick={handlePlayAgain}>↺ Play Again</WesternBtn>
          <WesternBtn primary big onClick={handleEndSession}>▷ End Session</WesternBtn>
        </div>
      </div>
    </WesternBackdrop>
  );
}
