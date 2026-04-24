import { useState, useEffect, useRef } from 'react';
import { socket, connectSocket } from '../socket';
import type { GameState } from '../../shared/types';
import Lobby from './Lobby';
import Arena from './Arena';
import EndScreen from './EndScreen';
import { startAmbient, stopAmbient, playVictory, playDefeat } from '../sound';

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
  const hostIdRef = useRef<string | null>(null);
  const prevPhaseRef = useRef<GameState['phase'] | null>(null);
  const ambientOnRef = useRef(false);

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

    socket.on('roomCreated', ({ roomCode: newRoomCode }) => {
      setRoomCode(newRoomCode);
      const hostId = hostIdRef.current || getOrCreateHostId();
      hostIdRef.current = hostId;
      const nextSession: HostSession = { roomCode: newRoomCode, hostId };
      sessionStorage.setItem(HOST_SESSION_KEY, JSON.stringify(nextSession));
      const url = new URL(window.location.href);
      url.searchParams.set('code', newRoomCode);
      window.history.replaceState({ roomCode: newRoomCode }, '', url.toString());
    });

    // Track pending damage-reveal timer so we can cancel if a new tickEnd
    // arrives, and so the gameState handler can mask damage during that window.
    let damageTimer: ReturnType<typeof setTimeout> | null = null;
    let maskUntil = 0;

    const maskedMerge = (prev: GameState | null, incoming: GameState): GameState => {
      if (!prev || Date.now() >= maskUntil) return incoming;
      // Preserve pre-resolution HP/ammo/alive + barrel HP so the animation
      // window reveals damage on impact rather than on state broadcast.
      return {
        ...incoming,
        players: incoming.players.map((np) => {
          const op = prev.players.find((p) => p.id === np.id);
          if (!op) return np;
          return { ...np, hp: op.hp, isAlive: op.isAlive, ammo: op.ammo };
        }),
        barrels: incoming.barrels.map((nb) => {
          const ob = prev.barrels.find((b) => b.team === nb.team && b.slot === nb.slot);
          return ob ? { ...nb, hp: ob.hp } : nb;
        }),
      };
    };

    socket.on('gameState', (state) => {
      setGameState((prev) => maskedMerge(prev, state));
    });

    const handleTickEnd = ({ state: resolvedState }: { state: GameState }) => {
      // Cancel any previous pending reveal so stale data can't stomp later.
      if (damageTimer) {
        clearTimeout(damageTimer);
        damageTimer = null;
      }
      const animationMs = 1000;
      maskUntil = Date.now() + animationMs;

      setGameState((prev) => {
        if (!prev) return resolvedState;
        return {
          ...resolvedState,
          players: resolvedState.players.map((np) => {
            const op = prev.players.find((p) => p.id === np.id);
            if (!op) return np;
            return { ...np, hp: op.hp, isAlive: op.isAlive, ammo: op.ammo };
          }),
          barrels: resolvedState.barrels.map((nb) => {
            const ob = prev.barrels.find((b) => b.team === nb.team && b.slot === nb.slot);
            return ob ? { ...nb, hp: ob.hp } : nb;
          }),
        };
      });

      damageTimer = setTimeout(() => {
        damageTimer = null;
        maskUntil = 0;
        setGameState(resolvedState);
      }, animationMs);
    };
    socket.on('tickEnd', handleTickEnd);

    socket.on('error', (message) => {
      console.error('Socket error:', message);
      if (message.includes('Room not found') || message.includes('Invalid room')) {
        console.log('Room not found, resetting session and creating new room...');
        sessionStorage.removeItem(HOST_SESSION_KEY);
        setRoomCode(null);
        const hostId = hostIdRef.current || getOrCreateHostId();
        socket.emit('createRoom', { config: DEFAULT_CONFIG, hostId });
        return;
      }
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    return () => {
      socket.off('roomCreated');
      socket.off('gameState');
      socket.off('tickEnd', handleTickEnd);
      socket.off('error');
      if (damageTimer) clearTimeout(damageTimer);
    };
  }, []);

  // Ambient audio + phase-transition SFX
  useEffect(() => {
    const phase = gameState?.phase ?? null;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (phase && phase !== 'lobby' && phase !== 'ended' && !ambientOnRef.current) {
      startAmbient();
      ambientOnRef.current = true;
    }
    if ((phase === 'lobby' || phase === 'ended' || phase == null) && ambientOnRef.current) {
      stopAmbient();
      ambientOnRef.current = false;
    }

    if (prev !== 'ended' && phase === 'ended' && gameState?.winner) {
      if (gameState.winner === 'draw') playDefeat();
      else playVictory();
    }
  }, [gameState?.phase, gameState?.winner]);

  useEffect(() => () => {
    stopAmbient();
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
