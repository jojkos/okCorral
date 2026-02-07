import type { Team } from '../../shared/types';
import { WesternButton } from '../components/WesternButton';

interface DeadScreenProps {
  isEnded: boolean;
  winner: Team | 'draw' | null;
  playerTeam: Team | null;
  onPlayAgain?: () => void;
  onEndSession?: () => void;
}

export default function DeadScreen({ isEnded, winner, playerTeam, onPlayAgain, onEndSession }: DeadScreenProps) {
  const didWin = winner === playerTeam;
  const isDraw = winner === 'draw';

  if (isEnded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="western-card text-center max-w-sm w-full p-8">
          {isDraw ? (
            <>
              <div className="text-6xl mb-4">🤝</div>
              <h1 className="text-3xl mb-2 uppercase text-amber-700">Draw!</h1>
              <p className="text-neutral-600">Everyone's down!</p>
            </>
          ) : didWin ? (
            <>
              <div className="text-6xl mb-4">🏆</div>
              <h1 className="text-3xl mb-2 uppercase text-green-700">You Won!</h1>
              <p className="text-neutral-600">
                {playerTeam === 'sheriffs' ? 'Justice is served!' : 'Crime pays!'}
              </p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-4">💀</div>
              <h1 className="text-3xl mb-2 uppercase text-red-700">You Lost</h1>
              <p className="text-neutral-600">
                {winner === 'sheriffs' ? 'The sheriffs got you!' : 'The outlaws won!'}
              </p>
            </>
          )}

          <div className="flex flex-col gap-3 mt-8">
            {onPlayAgain && (
              <WesternButton 
                variant="primary"
                size="lg"
                className="w-full"
                onClick={onPlayAgain}
              >
                🔄 Play Again
              </WesternButton>
            )}
            {onEndSession && (
              <WesternButton 
                variant="danger"
                size="md"
                className="w-full"
                onClick={onEndSession}
              >
                🚪 Leave Game
              </WesternButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="western-card text-center max-w-sm w-full p-8">
        <div className="text-8xl mb-6 grayscale opacity-60">
          {playerTeam === 'sheriffs' ? '🤠' : '🎭'}
        </div>
        <h1 className="text-3xl mb-4 uppercase text-red-700">You're Dead</h1>
        <p className="text-lg text-neutral-600">Spectating the rest of the round...</p>
        
        <div className="mt-8 animate-pulse text-neutral-400">
          Waiting for the round to end
        </div>
      </div>
    </div>
  );
}
