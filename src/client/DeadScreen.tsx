import type { Team } from '../../shared/types';
import { WesternButton } from '../components/WesternButton';
import { Skull, Trophy, Handshake } from 'lucide-react';

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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="western-card text-center max-w-md w-full p-8 md:p-12 relative overflow-visible">
           {/* Decorative corner elements could go here */}
           
          {isDraw ? (
            <div className="space-y-4">
              <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto border-4 border-amber-800 shadow-lg">
                <Handshake className="w-12 h-12 text-amber-800" />
              </div>
              <div>
                <h1 className="text-4xl font-display uppercase text-amber-900 tracking-widest">Draw!</h1>
                <p className="text-xl font-mono text-amber-800/70">Everyone's down!</p>
              </div>
            </div>
          ) : didWin ? (
            <div className="space-y-4">
               <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                  <div className="w-32 h-32 bg-yellow-400 rounded-full flex items-center justify-center border-4 border-yellow-600 shadow-xl animate-bounce-subtle">
                     <Trophy className="w-16 h-16 text-yellow-900" />
                  </div>
               </div>
               <div className="mt-16">
                  <h1 className="text-5xl font-display uppercase text-yellow-600 drop-shadow-sm tracking-wide">Victory!</h1>
                  <p className="text-xl font-mono text-amber-900/60 mt-2">
                    {playerTeam === 'sheriffs' ? 'Justice is served!' : 'Crime pays!'}
                  </p>
               </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto border-4 border-red-900 shadow-lg">
                <Skull className="w-12 h-12 text-red-900" />
              </div>
              <div>
                <h1 className="text-4xl font-display uppercase text-red-900 tracking-widest">Wasted</h1>
                <p className="text-xl font-mono text-red-900/60 mt-2">
                  {winner === 'sheriffs' ? 'The sheriffs got you!' : 'The outlaws won!'}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 mt-12">
            {onPlayAgain && (
              <WesternButton 
                variant="primary"
                size="xl"
                className="w-full shadow-lg"
                onClick={onPlayAgain}
              >
                🔄 Play Again
              </WesternButton>
            )}
            {onEndSession && (
              <WesternButton 
                variant="danger"
                size="lg"
                className="w-full opacity-80 hover:opacity-100"
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
    <div className="min-h-screen bg-black/90 flex items-center justify-center p-4">
      <div className="western-card text-center max-w-sm w-full p-8 bg-[#2a1a11] border-red-900/50">
        <div className="text-8xl mb-6 opacity-80 animate-pulse">
            {playerTeam === 'sheriffs' ? '🪦' : '⚰️'}
        </div>
        <h1 className="text-4xl font-display mb-2 uppercase text-red-500 tracking-widest">You're Dead</h1>
        <p className="text-lg font-mono text-amber-200/50">Spectating the shootout...</p>
        
        <div className="mt-8 flex items-center justify-center gap-2 text-amber-500/40 text-sm font-bold uppercase tracking-widest">
           <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0s' }} />
           <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0.2s' }} />
           <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}
