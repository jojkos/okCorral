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
  // Presentation/meta only — never read by the combat resolver.
  isBot?: boolean;
  stats?: PlayerStats;
}

// Per-match tallies for the end-screen awards. Reset on game start.
export interface PlayerStats {
  shots: number;
  hits: number; // bullets that damaged a player
  barrelHits: number; // bullets that struck an enemy barrel
  misses: number;
  clashes: number; // bullets destroyed mid-air
  kills: number;
  damageTaken: number;
  blocked: number; // enemy bullets absorbed by own barrel
  covers: number;
  reloads: number;
  moves: number;
  diedOnTick: number | null;
}

export const EMOTES = ["🤠", "😂", "😱", "💀", "🔥", "👋", "🎯", "🐔"] as const;
export type Emote = (typeof EMOTES)[number];

export interface SessionScore {
  sheriffs: number;
  outlaws: number;
  draws: number;
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
  shooterId?: string;
  targetId?: string; // player hit, or owner of the barrel that was hit
  lethal?: boolean; // this bullet took the target's last heart
}

// Game configuration
export interface GameConfig {
  tickDuration: number; // ms, default 4000
  slotsPerSide: number; // default 5
}

// Full game state
export interface GameState {
  roomCode: string;
  revision: number;
  resolutionStartedAt?: number;
  resolutionFrom?: { players: Player[]; barrels: Barrel[] };
  phase: GamePhase;
  tick: number;
  config: GameConfig;
  players: Player[];
  barrels: Barrel[];
  winner: Team | "draw" | null;
  tickStartTime: number | null;
  pendingActions: { playerId: string; action: ActionType }[];
  lastTickBullets: Bullet[];
  session?: SessionScore;
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
  emote: (data: { playerId: string; emoji: Emote }) => void;
  roomClosed: () => void;
}

// Socket events from client to server
export interface ClientToServerEvents {
  syncClock: (reply: (serverTime: number) => void) => void;
  requestState: () => void;
  submitAction: (data: { action: ActionType; tick: number; startedAt: number }, reply: (result: { accepted: boolean; action?: ActionType; tick: number; reason?: string }) => void) => void;
  createRoom: (data: { config: GameConfig; hostId: string }) => void;
  resumeHost: (data: { roomCode: string; hostId: string }) => void;
  joinRoom: (data: { roomCode: string; playerName: string; playerId: string }) => void;
  selectTeam: (team: Team) => void;
  takeSeat: (data: { team: Team; slot: number }) => void;
  leaveTeam: () => void;
  lockAction: (action: ActionType) => void;
  startGame: () => void;
  playAgain: () => void;
  endSession: () => void;
  leaveRoom: () => void;
  updateConfig: (config: Partial<GameConfig>) => void;
  emote: (emoji: Emote) => void;
  addBot: (team: Team) => void;
  removeBot: (team: Team) => void;
}
