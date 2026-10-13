import { useState, useEffect, useRef } from 'react';
import { socket, connectSocket } from '../socket';
import { useGameState } from '../lib/useGameState';
import type { ClientPlayer } from '../../shared/types';
import JoinScreen from './JoinScreen';
import TeamSelect from './TeamSelect';
import Controller from './Controller';
import DeadScreen from './DeadScreen';

interface ClientSession {
  roomCode: string;
  playerId: string;
  playerName: string;
}

const CLIENT_SESSION_KEY = 'okCorral-clientSession';

function getOrCreatePlayerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `player-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

export default function ClientApp() {
  const [connected, setConnected] = useState(false);
  const [player, setPlayer] = useState<ClientPlayer | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const gameState = useGameState();
  const joinedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ClientSession | null>(null);
  const autoJoinAttempted = useRef(false);
  const sessionRef = useRef<ClientSession | null>(null);
  const playerIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
    playerIdRef.current = session?.playerId || player?.id || null;
  }, [session]);

  useEffect(() => {
    playerIdRef.current = player?.id || sessionRef.current?.playerId || null;
  }, [player?.id]);

  useEffect(() => {
    const savedSession = sessionStorage.getItem(CLIENT_SESSION_KEY);
    let parsedSession: ClientSession | null = null;
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession) as ClientSession;
        if (parsed.roomCode && parsed.playerId && parsed.playerName) {
          parsedSession = parsed;
          setSession(parsed);
          setRoomCode(parsed.roomCode);
        }
      } catch {
        sessionStorage.removeItem(CLIENT_SESSION_KEY);
      }
    }

    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode && joinCode.length === 4) {
      const normalized = joinCode.toUpperCase();
      setRoomCode(normalized);
      if (parsedSession) {
        const next = { ...parsedSession, roomCode: normalized };
        setSession(next);
        sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(next));
      }
    }

    connectSocket().then(() => {
      setConnected(true);
    }).catch(() => {
      setError('Failed to connect to server');
    });

    const reconnect = () => {
      setConnected(true);
      if (joinedRef.current && sessionRef.current) socket.emit('joinRoom', sessionRef.current);
    };
    socket.on('connect', reconnect);

    socket.on('joined', ({ player: joinedPlayer, roomCode: code }) => {
      joinedRef.current = true;
      playerIdRef.current = joinedPlayer.id;
      setPlayer(joinedPlayer);
      setRoomCode(code);
      const nextSession: ClientSession = {
        roomCode: code,
        playerId: joinedPlayer.id,
        playerName: sessionRef.current?.playerName || joinedPlayer.name,
      };
      sessionRef.current = nextSession;
      setSession(nextSession);
      sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(nextSession));
      setError(null);
    });

    socket.on('gameState', (state) => {

      const currentPlayerId = playerIdRef.current;
      if (!currentPlayerId) return;
      const updatedPlayer = state.players.find(p => p.id === currentPlayerId);
      if (updatedPlayer) {
        setPlayer({
          id: updatedPlayer.id,
          name: updatedPlayer.name,
          team: updatedPlayer.team,
          slot: updatedPlayer.slot,
          appearance: updatedPlayer.appearance ?? 0,
        });
      }
    });

    // Host closed the room: forget it and go back to the start screen.
    const closed = () => {
      sessionStorage.removeItem(CLIENT_SESSION_KEY);
      joinedRef.current = false;
      window.location.href = '/';
    };
    socket.on('roomClosed', closed);

    socket.on('error', (message) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    return () => {
      socket.off('connect', reconnect);
      socket.off('joined');
      socket.off('gameState');
      socket.off('error');
      socket.off('roomClosed', closed);
    };
  }, []);

  // Removed auto-join effect to prevent getting stuck in old sessions.
  // The JoinScreen will pre-fill with session data, allowing the user to confirm or change code.

  const leaveSession = () => {
    try { socket.emit('leaveRoom'); } catch { /* socket not ready */ }
    sessionStorage.removeItem(CLIENT_SESSION_KEY);
    setSession(null);
    setPlayer(null);
    setRoomCode(null);
    joinedRef.current = false;
    autoJoinAttempted.current = false;
    window.location.href = '/';
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl font-bold animate-pulse" style={{ fontFamily: 'Rye, serif' }}>
          Connecting...
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <JoinScreen 
        initialCode={roomCode || ''} 
        initialName={session?.playerName || ''}
        error={error}
        onJoin={(code, name) => {
          const playerId = session?.playerId || getOrCreatePlayerId();
          const nextSession: ClientSession = {
            roomCode: code.toUpperCase(),
            playerName: name,
            playerId,
          };
          sessionRef.current = nextSession;
      setSession(nextSession);
          sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(nextSession));
          socket.emit('joinRoom', { roomCode: code.toUpperCase(), playerName: name, playerId });
        }}
      />
    );
  }

  if (gameState?.phase === 'lobby') {
    return (
      <TeamSelect 
        player={player}
        gameState={gameState}
        error={error}
        onSelectTeam={(team) => socket.emit('selectTeam', team)}
        onSelectAppearance={(appearance) => socket.emit('selectAppearance', appearance)}
        onLeave={leaveSession}
      />
    );
  }

  if (gameState?.phase === 'ended') {
    const myPlayer = gameState.players.find(p => p.id === player.id);
    return (
      <DeadScreen 
        isEnded={true}
        winner={gameState.winner}
        playerTeam={myPlayer?.team || null}
        gameState={gameState}
        playerId={player.id}
        onPlayAgain={() => socket.emit('playAgain')}
        onEndSession={() => {
          socket.emit('leaveRoom');
          sessionStorage.removeItem(CLIENT_SESSION_KEY);
          window.location.reload();
        }}
      />
    );
  }

  const myPlayer = gameState?.players.find(p => p.id === player.id);
  if (myPlayer && !myPlayer.isAlive) {
    return (
      <DeadScreen
        isEnded={false}
        winner={null}
        playerTeam={myPlayer.team}
        playerName={player.name}
        deathTick={gameState?.tick}
        gameState={gameState}
        playerId={player.id}
      />
    );
  }

  return (
    <Controller 
      player={player} 
      gameState={gameState}
      error={error}
      onLeave={leaveSession}
    />
  );
}
