import type { Team } from '../../shared/types';
import {
  WesternBackdrop,
  StarEmblem,
  SkullEmblem,
  WesternBtn,
  westernStyles as S,
} from '../components/WesternUI';

interface DeadScreenProps {
  isEnded: boolean;
  winner: Team | 'draw' | null;
  playerTeam: Team | null;
  playerName?: string;
  deathTick?: number;
  onPlayAgain?: () => void;
  onEndSession?: () => void;
}

export default function DeadScreen({
  isEnded,
  winner,
  playerTeam,
  playerName,
  deathTick,
  onPlayAgain,
  onEndSession,
}: DeadScreenProps) {
  const didWin = winner === playerTeam;
  const isDraw = winner === 'draw';

  if (isEnded) {
    return (
      <WesternBackdrop dark>
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 30,
            textAlign: 'center',
            gap: 22,
          }}
        >
          <div
            style={{
              ...S.paper,
              padding: '40px 32px',
              textAlign: 'center',
              border: '3px solid #3e2417',
              maxWidth: 420,
              width: '100%',
              transform: 'rotate(-0.5deg)',
            }}
          >
            <div style={{ ...S.mono, fontSize: 12, color: '#6b4423', letterSpacing: 6, fontWeight: 'bold' }}>★ ★ ★</div>
            <h1
              style={{
                ...S.title,
                fontSize: 72,
                margin: '12px 0 6px',
                color: '#3e2417',
                letterSpacing: 8,
              }}
            >
              {isDraw ? 'DRAW' : didWin ? 'VICTORY' : 'DEFEAT'}
            </h1>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
              {isDraw ? <StarEmblem size={56} color="#8a621e" /> : playerTeam === 'sheriffs' ? <StarEmblem size={56} color="#ffd875" /> : <SkullEmblem size={56} />}
            </div>
            <div style={{ ...S.serif, fontSize: 22, color: '#6b4423', marginTop: 12, fontStyle: 'italic' }}>
              {isDraw
                ? 'everyone\'s in the dirt'
                : didWin
                  ? (playerTeam === 'sheriffs' ? 'justice is served' : 'the law never stood a chance')
                  : (winner === 'sheriffs' ? 'the sheriffs got ya' : 'the outlaws took the town')}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
            {onPlayAgain && <WesternBtn primary big onClick={onPlayAgain}>↺ PLAY AGAIN</WesternBtn>}
            {onEndSession && <WesternBtn big onClick={onEndSession}>✕ LEAVE GAME</WesternBtn>}
          </div>
        </div>
      </WesternBackdrop>
    );
  }

  return (
    <WesternBackdrop dark>
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 30,
          textAlign: 'center',
          gap: 22,
        }}
      >
        <div
          style={{
            width: 260,
            padding: '30px 20px 40px',
            borderRadius: '130px 130px 10px 10px',
            background: 'linear-gradient(180deg, #7a7268 0%, #4a4238 100%)',
            color: '#1a0e08',
            border: '3px solid #1a0e08',
            transform: 'rotate(-2deg)',
            boxShadow: '0 10px 0 #1a0e08, 0 20px 40px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ ...S.mono, fontSize: 11, letterSpacing: 4, fontWeight: 'bold', opacity: 0.7 }}>R.I.P.</div>
          {(playerName || 'UNKNOWN').toUpperCase().split(' ').map((line, i) => (
            <div key={i} style={{ ...S.title, fontSize: 30, color: '#1a0e08', marginTop: i === 0 ? 10 : 0, letterSpacing: 3 }}>
              {line}
            </div>
          ))}
          <div style={{ fontSize: 44, marginTop: 12 }}>💀</div>
          {deathTick != null && (
            <div style={{ ...S.serif, fontSize: 14, marginTop: 10, fontStyle: 'italic', opacity: 0.8 }}>
              Gunned down · Round {deathTick}
            </div>
          )}
        </div>

        <div
          style={{
            ...S.title,
            fontSize: 42,
            color: '#b53a3a',
            letterSpacing: 6,
            textShadow: '0 0 20px rgba(181,58,58,0.5)',
          }}
        >
          YOU'RE DEAD
        </div>

        <div style={{ ...S.serif, fontSize: 16, color: '#d9cbb0', opacity: 0.75, maxWidth: 300, lineHeight: 1.5 }}>
          Watch yer team carry on. Maybe they'll avenge ya. Maybe they won't.
        </div>

        <div style={{ ...S.mono, fontSize: 10, color: '#e0b04a', opacity: 0.6, letterSpacing: 3, marginTop: 8 }}>
          ★ SPECTATING ★
        </div>
      </div>
    </WesternBackdrop>
  );
}
