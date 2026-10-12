import { useEffect, useState } from 'react';
import type { GameState } from '../../shared/types';
import { socket, serverNow } from '../socket';
import { newerState, presentState } from './presentation';

export function useGameState() {
  const [state, setState] = useState<GameState | null>(null);
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const update = (next: GameState) => { setNow(serverNow()); setState(prev => newerState(prev, next)); };
    const end = ({ state: next }: { state: GameState }) => update(next);
    socket.on('gameState', update);
    socket.on('tickEnd', end);
    return () => { socket.off('gameState', update); socket.off('tickEnd', end); };
  }, []);
  useEffect(() => {
    if (state?.phase !== 'resolution' && !(state?.phase === 'planning' && state.walkingWoman.gatlingCrush)) return;
    const timer = setInterval(() => setNow(serverNow()), 16);
    return () => clearInterval(timer);
  }, [state?.phase, state?.resolutionStartedAt, state?.tickStartTime, state?.walkingWoman.gatlingCrush]);
  return state ? presentState(state, now) : null;
}
