import { useState, useEffect, useRef } from 'react';
import { socket, connectSocket } from '../socket';
import type { GameState } from '../../shared/types';
import Lobby from './Lobby';
import Arena from './Arena';
import EndScreen from './EndScreen';

const DEFAULT_CONFIG = {
  tickDuration: 4000,
  slotsPerSide: 5,
};

interface HostSession {
  roomCode: string;
  hostId: string;
}

const HOST_SESSION_KEY = 'okCorral-hostSession';

function getOrCreateHostId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `host-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

export default function HostApp() {
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<HostSession | null>(null);
  const hostIdRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const existingCode = params.get('code');
    const savedSession = sessionStorage.getItem(HOST_SESSION_KEY);
    let initialSession: HostSession | null = null;
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession) as HostSession;
        if (parsed.roomCode && parsed.hostId) {
          initialSession = parsed;
          setSession(parsed);
          setRoomCode(parsed.roomCode);
        }
      } catch {
        sessionStorage.removeItem(HOST_SESSION_KEY);
      }
    }

    connectSocket().then(() => {
      setConnected(true);

      const hostId = initialSession?.hostId || getOrCreateHostId();
      hostIdRef.current = hostId;
      if (existingCode && existingCode.length === 4) {
        const normalized = existingCode.toUpperCase();
        setRoomCode(normalized);
        socket.emit('resumeHost', { roomCode: normalized, hostId });
        const nextSession: HostSession = { roomCode: normalized, hostId };
        setSession(nextSession);
        sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify(nextSession));
      } else if (initialSession?.roomCode && initialSession.hostId) {
        socket.emit('resumeHost', { roomCode: initialSession.roomCode, hostId: initialSession.hostId });
      } else {
        socket.emit('createRoom', { config: DEFAULT_CONFIG, hostId });
      }
    }).catch((err) => {
      setError('Failed to connect to server');
      console.error(err);
    });

    socket.on('roomCreated', ({ roomCode }) => {
      setRoomCode(roomCode);
      const hostId = hostIdRef.current || getOrCreateHostId();
      hostIdRef.current = hostId;
      const nextSession: HostSession = { roomCode, hostId };
      setSession(nextSession);
      sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify(nextSession));
      // Update URL with room code (replace, not push, since App already pushed host state)
      const url = new URL(window.location.href);
      url.searchParams.set('code', roomCode);
      window.history.replaceState({ roomCode }, '', url.toString());
    });

    socket.on('gameState', (state) => {
      setGameState(state);
    });

    socket.on('error', (message) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    return () => {
      socket.off('roomCreated');
      socket.off('gameState');
      socket.off('error');
    };
  }, []);

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-3xl font-bold animate-pulse" style={{ fontFamily: 'Rye, serif' }}>
          Connecting to Saloon...
        </div>
      </div>
    );
  }

  if (error && !roomCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="western-card p-8 text-center max-w-md">
          <div className="text-2xl text-red-700 mb-4">⚠️ {error}</div>
          <button 
            className="western-btn western-btn-primary px-6 py-3"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!roomCode || !gameState || gameState.phase === 'lobby') {
    return (
      <Lobby
        roomCode={roomCode}
        gameState={gameState}
        error={error}
      />
    );
  }

  if (gameState.phase === 'ended') {
    return <EndScreen gameState={gameState} />;
  }

  return <Arena gameState={gameState} />;
}
