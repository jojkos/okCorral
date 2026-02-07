import type { GameState } from '../../shared/types';
import { socket } from '../socket';
import { WesternButton } from '../components/WesternButton';

interface EndScreenProps {
  gameState: GameState;
}

export default function EndScreen({ gameState }: EndScreenProps) {
  const { winner } = gameState;

  const handlePlayAgain = () => {
    socket.emit('playAgain');
  };

  const handleEndSession = () => {
    socket.emit('endSession');
  sessionStorage.removeItem('okCorral-hostSession');
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="western-card max-w-2xl w-full text-center p-12 animate-slide-in">
        {winner === 'draw' ? (
          <>
            <div className="text-8xl mb-6">🤝</div>
            <h1 className="text-5xl mb-4 uppercase text-amber-700">Draw!</h1>
            <p className="text-2xl text-neutral-600">Both teams eliminated!</p>
          </>
        ) : winner === 'sheriffs' ? (
          <>
            <div className="text-8xl mb-6">⭐</div>
            <h1 className="text-5xl mb-4 uppercase text-blue-700">Sheriffs Win!</h1>
            <p className="text-2xl text-neutral-600">Law and order prevails!</p>
          </>
        ) : (
          <>
            <div className="text-8xl mb-6">💀</div>
            <h1 className="text-5xl mb-4 uppercase text-red-700">Outlaws Win!</h1>
            <p className="text-2xl text-neutral-600">Crime pays... this time!</p>
          </>
        )}

        <div className="flex gap-4 justify-center mt-12">
          <WesternButton 
            variant="primary"
            size="lg"
            onClick={handlePlayAgain}
          >
            🔄 Play Again
          </WesternButton>
          <WesternButton 
            variant="danger"
            size="lg"
            onClick={handleEndSession}
          >
            🚪 End Session
          </WesternButton>
        </div>

        <p className="mt-8 text-neutral-400 text-sm">
          Players can also start a new game from their phones
        </p>
      </div>
    </div>
  );
}
