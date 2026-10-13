import { z } from "zod";
import type { ShotFlight } from './ballistics.js';

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
  appearance?: number; // Character design 0–7; missing legacy values use 0.
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
  aimedSlot: number;
  toSlot: number;
  trajectory: "straight" | "up" | "down";
  hit: "player" | "barrel" | "bullet" | "woman" | "miss";
  shooterId?: string;
  targetId?: string; // player hit, or owner of the barrel that was hit
  lethal?: boolean; // this bullet took the target's last heart
  source?: "player" | "gatling";
  targetTeam?: Team; // present for shots fired from the middle of the street
  civilianHitT?: number; // first body intersection on the shared flight curve
  flight?: ShotFlight; // identical authoritative path for bullets and bird collisions
  firedAt?: number; // ms after resolutionStartedAt
}

// Game configuration
export interface RandomEventSettings {
  strongWind: boolean;
  walkingWoman: boolean;
  gatlingMan: boolean;
  rain: boolean;
}

export interface GameConfig {
  tickDuration: number; // ms, default 4000
  slotsPerSide: number; // default 5
  /** Missing flags default to enabled for older clients/configurations. */
  events?: Partial<RandomEventSettings>;
}

export type WindDirection = "up" | "down";
export type StrongWindPhase = "calm" | "warning" | "active";

// Server-authoritative random-event state. A warning lasts for the current
// round, then the same direction is used for both active rounds.
export interface StrongWindState {
  phase: StrongWindPhase;
  direction: WindDirection | null;
  activeRoundsRemaining: number;
  cooldownRoundsRemaining: number;
}

export interface SwallowState {
  id: string;
  seed: number;
  bornAt: number;
  /** Presence means dead. Ground position persists across weather events. */
  remains?: {
    x: number; y: number; fromY: number;
    hitX: number; hitY: number; hitAngle: number; hitAt: number; hitTick: number;
  };
}

export interface RainState {
  phase: 'dry' | 'warning' | 'active';
  warningRoundsRemaining: number;
  swallows: SwallowState[];
  /** Makes the ammunition loss idempotent for broadcasts/reconnects. */
  ammoAppliedTick: number | null;
}

export type WalkingWomanPhase = "inactive" | "walking" | "waiting" | "dead" | "gone";

export interface GatlingCrush {
  leg: 'arrival' | 'departure';
  /** Planning fraction on arrival; resolution milliseconds on departure. */
  at: number;
  /** Exact, possibly fractional lane at physical contact. */
  slot: number;
  before: Pick<WalkingWomanState, 'phase' | 'slot' | 'fromSlot' | 'direction' | 'bloodTrail' | 'killedFromTeam'>;
}

// A survivor waits off-board, then returns in the opposite direction. A dead
// woman can be dragged away, but "gone" is permanent and never respawns her.
export interface WalkingWomanState {
  phase: WalkingWomanPhase;
  direction: WindDirection | null;
  slot: number | null;
  fromSlot: number | null;
  cooldownRoundsRemaining: number;
  bloodTrail: number[];
  killedFromTeam: Team | null;
  /** Once the gatling cart has run over the body, it keeps sliding down-street. */
  crushedByGatling?: boolean;
  /** Present this round's crush at wheel contact rather than before arrival. */
  gatlingCrushedThisRound?: boolean;
  gatlingCrush?: GatlingCrush;
  /** Persistent contact position for short wheel marks, not full-street lines. */
  gatlingCrushSlot?: number;
}

export interface GatlingTarget {
  team: Team;
  slot: number;
}

export type GatlingManPhase = "inactive" | "warning" | "active";

// The targets are rolled when the event starts so every connected screen
// sees the exact same eight-shot burst during resolution.
export interface GatlingManState {
  phase: GatlingManPhase;
  cooldownRoundsRemaining: number;
  targets: GatlingTarget[];
}

export interface PendingSuicide {
  playerId: string;
  dueTick: number;
}

// Full game state
export interface GameState {
  roomCode: string;
  revision: number;
  resolutionStartedAt?: number;
  resolutionFrom?: {
    players: Player[];
    barrels: Barrel[];
    walkingWoman?: WalkingWomanState;
    pendingSuicides?: PendingSuicide[];
  };
  phase: GamePhase;
  tick: number;
  config: GameConfig;
  strongWind: StrongWindState;
  rain: RainState;
  walkingWoman: WalkingWomanState;
  gatlingMan: GatlingManState;
  pendingSuicides: PendingSuicide[];
  lastTickSuicides: string[];
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
  appearance?: number;
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
  selectAppearance: (appearance: number) => void;
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
