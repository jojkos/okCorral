import { useState, useEffect, useRef } from 'react';
import { socket, connectSocket } from '../socket';
import type { GameState, ClientPlayer } from '../../shared/types';
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
  const [gameState, setGameState] = useState<GameState | null>(null);
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

    socket.on('joined', ({ player: joinedPlayer, roomCode: code }) => {
      setPlayer(joinedPlayer);
      setRoomCode(code);
      const nextSession: ClientSession = {
        roomCode: code,
        playerId: joinedPlayer.id,
        playerName: sessionRef.current?.playerName || joinedPlayer.name,
      };
      setSession(nextSession);
      sessionStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(nextSession));
      setError(null);
    });

    socket.on('gameState', (state) => {
      setGameState(state);
      const currentPlayerId = playerIdRef.current;
      if (!currentPlayerId) return;
      const updatedPlayer = state.players.find(p => p.id === currentPlayerId);
      if (updatedPlayer) {
        setPlayer({
          id: updatedPlayer.id,
          name: updatedPlayer.name,
          team: updatedPlayer.team,
          slot: updatedPlayer.slot,
        });
      }
    });

    socket.on('error', (message) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    return () => {
      socket.off('joined');
      socket.off('gameState');
      socket.off('error');
    };
  }, []);

  useEffect(() => {
    if (!connected || player || autoJoinAttempted.current) return;
    if (session?.roomCode && session.playerId && session.playerName) {
      autoJoinAttempted.current = true;
      socket.emit('joinRoom', {
        roomCode: session.roomCode,
        playerName: session.playerName,
        playerId: session.playerId,
      });
    }
  }, [connected, player, session]);

  const leaveSession = () => {
    sessionStorage.removeItem(CLIENT_SESSION_KEY);
    setSession(null);
    setPlayer(null);
    setRoomCode(null);
    setGameState(null);
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
        onPlayAgain={() => socket.emit('playAgain')}
        onEndSession={() => {
          socket.emit('endSession');
          sessionStorage.removeItem(CLIENT_SESSION_KEY);
          window.location.reload();
        }}
      />
    );
  }

  const myPlayer = gameState?.players.find(p => p.id === player.id);
  if (myPlayer && !myPlayer.isAlive) {
    return <DeadScreen isEnded={false} winner={null} playerTeam={myPlayer.team} />;
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
