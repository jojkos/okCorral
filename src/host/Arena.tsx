import type { GameState } from '../../shared/types';
import CanvasArena from './CanvasArena';
export default function Arena({ gameState }: { gameState: GameState }) {
  return <div className="fixed inset-0 bg-[#25231d] overflow-hidden flex items-center justify-center"><div className="arena-frame"><CanvasArena gameState={gameState} /></div></div>;
}
