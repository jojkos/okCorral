import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { useGameState } from '../lib/useGameState';
import Lobby from './Lobby';
import Arena from './Arena';
import EndScreen from './EndScreen';
import HostMenu from './components/HostMenu';
import './host.css';
import { startAmbient, stopAmbient, playVictory, playDefeat } from '../sound';

const DEFAULT_CONFIG = { tickDuration: 4000, slotsPerSide: 5 };
const KEY = 'okCorral-hostSession';
export default function HostApp() {
  const gameState = useGameState();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previousPhase = useRef<string>();
  useEffect(() => {
    let session: { hostId: string; roomCode?: string };
    try { session = JSON.parse(sessionStorage.getItem(KEY) || 'null') || { hostId: crypto.randomUUID() }; }
    catch { session = { hostId: crypto.randomUUID() }; }
    const code = new URLSearchParams(location.search).get('code');
    if (code) session.roomCode = code.toUpperCase();
    sessionStorage.setItem(KEY, JSON.stringify(session));
    let requested = false;
    const connect = () => {
      setError(null);
      if (session.roomCode) socket.emit('resumeHost', { roomCode: session.roomCode, hostId: session.hostId });
      else if (!requested) { requested = true; socket.emit('createRoom', { config: DEFAULT_CONFIG, hostId: session.hostId }); }
    };
    const created = ({ roomCode: code }: { roomCode: string }) => {
      session.roomCode = code; setRoomCode(code);
      sessionStorage.setItem(KEY, JSON.stringify(session));
      const url = new URL(location.href); url.searchParams.set('code', code);
      history.replaceState({}, '', url);
    };
    const failed = (message: string) => {
      setError(message);
      if (message === 'Room not found') {
        session.roomCode = undefined; requested = false; connect();
      }
    };
    const lost = () => { requested = false; };
    socket.on('connect', connect); socket.on('disconnect', lost);
    socket.on('roomCreated', created); socket.on('error', failed);
    if (socket.connected) connect(); else socket.connect();
    return () => {
      socket.off('connect', connect); socket.off('disconnect', lost);
      socket.off('roomCreated', created); socket.off('error', failed);
    };
  }, []);
  useEffect(() => {
    const phase = gameState?.phase;
    if (phase === 'planning' || phase === 'resolution') startAmbient(); else stopAmbient();
    if (phase === 'ended' && previousPhase.current !== phase) {
      if (gameState?.winner === 'draw') playDefeat(); else playVictory();
    }
    previousPhase.current = phase;
  }, [gameState?.phase, gameState?.winner]);
  useEffect(() => () => stopAmbient(), []);
  const screen = gameState?.phase === 'ended' ? <EndScreen gameState={gameState} />
    : gameState && gameState.phase !== 'lobby' ? <Arena gameState={gameState} />
    : <Lobby roomCode={gameState?.roomCode || roomCode} gameState={gameState} error={error} />;
  return <>{screen}{(gameState?.roomCode || roomCode) && <HostMenu phase={gameState?.phase} />}</>;
}
