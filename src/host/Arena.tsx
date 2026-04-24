import { useEffect, useState } from 'react';
import type { GameState, Bullet } from '../../shared/types';
import { socket } from '../socket';
import { playTickStart, playTickResolve } from '../sound';
import CanvasArena from './CanvasArena';

interface ArenaProps {
  gameState: GameState;
}

export default function Arena({ gameState }: ArenaProps) {
  const [bulletsToAnimate, setBulletsToAnimate] = useState<Bullet[] | null>(null);

  useEffect(() => {
    const handleTickEnd = ({ bullets }: { bullets: Bullet[] }) => {
      if (bullets && bullets.length > 0) {
        setBulletsToAnimate(bullets);
      }
    };

    socket.on('tickEnd', handleTickEnd);
    socket.on('tickStart', playTickStart);
    socket.on('tickEnd', playTickResolve);
    return () => {
      socket.off('tickEnd', handleTickEnd);
      socket.off('tickStart', playTickStart);
      socket.off('tickEnd', playTickResolve);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center">
      <div
        style={{
          aspectRatio: '1600 / 900',
          maxWidth: '100vw',
          maxHeight: '100vh',
          width: '100%',
          height: '100%',
        }}
      >
        <CanvasArena
          gameState={gameState}
          bulletsToAnimate={bulletsToAnimate}
          onBulletsConsumed={() => setBulletsToAnimate(null)}
        />
      </div>
    </div>
  );
}
