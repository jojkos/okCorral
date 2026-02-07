import { z } from "zod";

// Teams
export type Team = "sheriffs" | "outlaws";

// Player actions
export const ActionTypeSchema = z.enum([
  "MOVE_UP",
  "MOVE_DOWN",
  "COVER",
  "SHOOT_STRAIGHT",
  "SHOOT_UP",
  "SHOOT_DOWN",
  "RELOAD",
  "NONE",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

// Game phases
export type GamePhase = "lobby" | "planning" | "resolution" | "ended";

// Player state
export interface Player {
  id: string;
  name: string;
  team: Team;
  slot: number;
  hp: number;
  ammo: number;
  isAlive: boolean;
  actionLocked: boolean;
  currentAction: ActionType;
  isCovered: boolean;
}

// Barrel state
export interface Barrel {
  team: Team;
  slot: number;
  hp: number;
}

// Bullet for animation
export interface Bullet {
  id: string;
  fromTeam: Team;
  fromSlot: number;
  toSlot: number;
  trajectory: "straight" | "up" | "down";
  hit: "player" | "barrel" | "bullet" | "miss";
}

// Game configuration
export interface GameConfig {
  tickDuration: number; // ms, default 4000
  slotsPerSide: number; // default 5
}

// Full game state
export interface GameState {
  roomCode: string;
  phase: GamePhase;
  tick: number;
  config: GameConfig;
  players: Player[];
  barrels: Barrel[];
  winner: Team | "draw" | null;
  tickStartTime: number | null;
  pendingActions: { playerId: string; action: ActionType }[];
  lastTickBullets: Bullet[];
}

// Client-side player info (what the client receives about itself)
export interface ClientPlayer {
  id: string;
  name: string;
  team: Team | null;
  slot: number;
}

// Socket events from server to client
export interface ServerToClientEvents {
  roomCreated: (data: { roomCode: string }) => void;
  playerJoined: (data: { player: ClientPlayer; allPlayers: Player[] }) => void;
  playerLeft: (data: { playerId: string }) => void;
  gameState: (state: GameState) => void;
  error: (message: string) => void;
  joined: (data: { player: ClientPlayer; roomCode: string }) => void;
  teamChanged: (data: { playerId: string; team: Team; slot: number }) => void;
  actionLocked: (data: { playerId: string }) => void;
  tickStart: (data: {
    tick: number;
    duration: number;
    startTime: number;
  }) => void;
  tickEnd: (data: {
    tick: number;
    bullets: Bullet[];
    state: GameState;
  }) => void;
  gameEnded: (data: { winner: Team | "draw" }) => void;
}

// Socket events from client to server
export interface ClientToServerEvents {
  createRoom: (data: { config: GameConfig; hostId: string }) => void;
  resumeHost: (data: { roomCode: string; hostId: string }) => void;
  joinRoom: (data: { roomCode: string; playerName: string; playerId: string }) => void;
  selectTeam: (team: Team) => void;
  leaveTeam: () => void;
  lockAction: (action: ActionType) => void;
  startGame: () => void;
  playAgain: () => void;
  endSession: () => void;
  updateConfig: (config: Partial<GameConfig>) => void;
}
