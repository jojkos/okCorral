import { Server } from "socket.io";
import type {
  GameState,
  GameConfig,
  Player,
  Barrel,
  Team,
  ActionType,
  ClientPlayer,
  PlayerStats,
  Emote,
  ServerToClientEvents,
  ClientToServerEvents,
} from "../shared/types.js";
import { resolveActions } from "./actions.js";
import { chooseBotAction, BOT_NAMES } from "./bots.js";

interface Room {
  code: string;
  hostId: string;
  state: GameState;
  tickTimer: NodeJS.Timeout | null;
  // setTimeout that schedules the next planning phase after resolution. Must
  // be cancelled on reset/end so a stale fire doesn't rekindle a dead room.
  continuationTimer: NodeJS.Timeout | null;
  // Fires on the animation budget after a game-ending resolution, emitting
  // the final state + gameEnded. Keeps the final volley visible.
  gameEndTimer: NodeJS.Timeout | null;
  // When the room has no connected sockets we start a grace timer. If nobody
  // reconnects, the room is deleted and all timers cleared.
  idleCleanupTimer: NodeJS.Timeout | null;
  // Socket IDs currently in the room. Updated by server/index.ts on
  // connect/disconnect so we don't need to await fetchSockets().
  sockets: Set<string>;
  // Pending bot decisions for the current planning phase.
  botTimers: NodeJS.Timeout[];
  // playerId -> last emote timestamp, for rate limiting.
  lastEmote: Map<string, number>;
}

const IDLE_CLEANUP_MS = 5 * 60 * 1000; // 5 minutes with no connected sockets
// Presentation budgets (see src/lib/presentation.ts VOLLEY). These only pace
// the animation between rounds; planning duration and rules are untouched.
const RESOLUTION_MS = 2600; // reveal → move → volley → impact → settle
const GAME_END_ANIM_MS = 3600; // final volley + slow-motion killing blow
const EMOTE_COOLDOWN_MS = 1200;

// During planning, locked choices are secret: everyone can see *that* a player
// is ready, never *what* they picked. Each phone learns its own choice from the
// submitAction acknowledgement. Resolution/ended states are sent in full.
export function publicState(state: GameState): GameState {
  if (state.phase !== "planning") return state;
  return {
    ...state,
    pendingActions: [],
    players: state.players.map((p) => ({ ...p, currentAction: "NONE" as ActionType })),
  };
}

export function emptyStats(): PlayerStats {
  return {
    shots: 0, hits: 0, barrelHits: 0, misses: 0, clashes: 0, kills: 0,
    damageTaken: 0, blocked: 0, covers: 0, reloads: 0, moves: 0, diedOnTick: null,
  };
}

// Player to room mapping
const playerRooms = new Map<string, string>();
const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Removed I and O to avoid confusion
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure uniqueness
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

function createInitialState(roomCode: string, config: GameConfig): GameState {
  const barrels: Barrel[] = [];

  // Create barrels for each slot on each side
  for (let slot = 0; slot < config.slotsPerSide; slot++) {
    barrels.push({ team: "sheriffs", slot, hp: 3 });
    barrels.push({ team: "outlaws", slot, hp: 3 });
  }

  return {
    roomCode,
    revision: 0,
    phase: "lobby",
    tick: 0,
    config,
    players: [],
    barrels,
    winner: null,
    tickStartTime: null,
    pendingActions: [],
    lastTickBullets: [],
    session: { sheriffs: 0, outlaws: 0, draws: 0 },
  };
}

function findAvailableSlot(
  players: Player[],
  team: Team,
  maxSlots: number,
): number | null {
  const takenSlots = players.filter((p) => p.team === team).map((p) => p.slot);

  for (let i = 0; i < maxSlots; i++) {
    if (!takenSlots.includes(i)) {
      return i;
    }
  }
  return null;
}

export class RoomManager {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;
  }

  createRoom(hostId: string, config: GameConfig): string {
    const code = generateRoomCode();
    const room: Room = {
      code,
      hostId,
      state: createInitialState(code, config),
      tickTimer: null,
      continuationTimer: null,
      gameEndTimer: null,
      idleCleanupTimer: null,
      sockets: new Set(),
      botTimers: [],
      lastEmote: new Map(),
    };
    rooms.set(code, room);
    playerRooms.set(hostId, code);
    return code;
  }

  // Called by server/index.ts so the RoomManager tracks live socket membership
  // and can cancel/start idle cleanup timers deterministically.
  noteSocketJoined(roomCode: string, socketId: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.sockets.add(socketId);
    if (room.idleCleanupTimer) {
      clearTimeout(room.idleCleanupTimer);
      room.idleCleanupTimer = null;
    }
  }

  noteSocketLeft(roomCode: string, socketId: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.sockets.delete(socketId);
    if (room.sockets.size === 0 && !room.idleCleanupTimer) {
      room.idleCleanupTimer = setTimeout(() => {
        const r = rooms.get(roomCode);
        if (r && r.sockets.size === 0) this.endSession(roomCode);
      }, IDLE_CLEANUP_MS);
    }
  }

  joinRoom(
    playerId: string,
    roomCode: string,
    playerName: string,
  ): { success: boolean; player?: ClientPlayer; error?: string } {
    const room = rooms.get(roomCode);
    if (!room) {
      return { success: false, error: "Room not found" };
    }

    // Check if player already exists (reconnection)
    const existingPlayer = room.state.players.find((p) => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.name = playerName || existingPlayer.name;
      playerRooms.set(playerId, roomCode);
      return {
        success: true,
        player: {
          id: existingPlayer.id,
          name: existingPlayer.name,
          team: existingPlayer.team,
          slot: existingPlayer.slot,
        },
      };
    }

    if (room.state.phase !== "lobby") {
      return { success: false, error: "Game already in progress" };
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      team: "sheriffs", // Default, will be changed on team select
      slot: -1, // Not assigned yet
      hp: 3,
      ammo: 1,
      isAlive: true,
      actionLocked: false,
      currentAction: "NONE",
      isCovered: false,
    };

    room.state.players.push(player);
    playerRooms.set(playerId, roomCode);

    // Auto-assign to team
    const sheriffsCount = room.state.players.filter(
      (p) => p.team === "sheriffs",
    ).length;
    const outlawsCount = room.state.players.filter(
      (p) => p.team === "outlaws",
    ).length;

    // Assign to smaller team, or sheriffs if equal
    const assignedTeam: Team =
      sheriffsCount <= outlawsCount ? "sheriffs" : "outlaws";

    // Find slot
    const slot = findAvailableSlot(
      room.state.players,
      assignedTeam,
      room.state.config.slotsPerSide,
    );

    if (slot !== null) {
      player.team = assignedTeam;
      player.slot = slot;
    }

    return {
      success: true,
      player: {
        id: player.id,
        name: player.name,
        team: player.team,
        slot: player.slot,
      },
    };
  }

  resumeHost(
    roomCode: string,
    hostId: string,
  ): { success: boolean; error?: string; state?: GameState } {
    const room = rooms.get(roomCode);
    if (!room) {
      return { success: false, error: "Room not found" };
    }

    if (room.hostId !== hostId) {
      return { success: false, error: "Invalid host" };
    }

    playerRooms.set(hostId, roomCode);
    return { success: true, state: room.state };
  }

  selectTeam(
    playerId: string,
    roomCode: string,
    team: Team,
  ): { success: boolean; error?: string } {
    const room = rooms.get(roomCode);
    if (!room) return { success: false, error: "Room not found" };

    if (room.state.phase !== "lobby") return { success: false, error: "Teams are locked once the gunfight starts" };

    const player = room.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Player not found" };

    // Re-selecting the same team while already seated is a no-op — don't
    // reshuffle the player's slot out from under them.
    if (player.team === team && player.slot >= 0) {
      return { success: true };
    }

    // Temporarily vacate current slot so findAvailableSlot doesn't count us.
    const previousSlot = player.slot;
    if (player.slot >= 0) player.slot = -1;

    const slot = findAvailableSlot(
      room.state.players,
      team,
      room.state.config.slotsPerSide,
    );
    if (slot === null) {
      // Restore and report failure.
      player.slot = previousSlot;
      return { success: false, error: "Team is full" };
    }

    player.team = team;
    player.slot = slot;
    return { success: true };
  }

  // Sit in a specific lane on a team (lobby only). The seat is kept at game start.
  takeSeat(playerId: string, roomCode: string, team: Team, slot: number): { success: boolean; error?: string } {
    const room = rooms.get(roomCode);
    if (!room) return { success: false, error: "Room not found" };
    if (room.state.phase !== "lobby") return { success: false, error: "Teams are locked once the gunfight starts" };
    if (slot < 0 || slot >= room.state.config.slotsPerSide) return { success: false, error: "No such spot" };
    const player = room.state.players.find((p) => p.id === playerId);
    if (!player) return { success: false, error: "Player not found" };
    const taken = room.state.players.find((p) => p.id !== playerId && p.team === team && p.slot === slot);
    if (taken) return { success: false, error: `${taken.name} already has that spot` };
    player.team = team;
    player.slot = slot;
    return { success: true };
  }

  // Called when a player explicitly leaves or their socket disconnects during
  // lobby. Removes them entirely so team counts stay honest and the room can
  // go idle if empty. No-op during an active game to avoid mid-match surgery.
  removePlayer(playerId: string, roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.state.phase !== "lobby") return;
    room.state.players = room.state.players.filter((p) => p.id !== playerId);
    playerRooms.delete(playerId);
    this.broadcastState(roomCode);
  }

  leaveTeam(playerId: string, roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.state.players.find((p) => p.id === playerId);
    if (player) {
      player.slot = -1;
    }
  }

  submitAction(playerId: string, roomCode: string, action: ActionType, tick: number, startedAt: number) {
    const room = rooms.get(roomCode);
    const player = room?.state.players.find(p => p.id === playerId);
    if (!room || room.state.phase !== 'planning' || room.state.tick !== tick || room.state.tickStartTime !== startedAt) {
      return { accepted: false, tick, reason: 'That round has finished.' };
    }
    if (!player || !player.isAlive) return { accepted: false, tick, reason: 'Player unavailable.' };
    if (!player.actionLocked) this.lockAction(playerId, roomCode, action);
    return { accepted: player.actionLocked, tick, action: player.currentAction,
      reason: player.actionLocked ? undefined : 'That action is unavailable.' };
  }

  lockAction(playerId: string, roomCode: string, action: ActionType): void {
    const room = rooms.get(roomCode);
    if (!room || room.state.phase !== "planning") return;

    const player = room.state.players.find((p) => p.id === playerId);
    if (!player || !player.isAlive || player.actionLocked) return;

    // Validate action
    if (action.startsWith("SHOOT") && player.ammo <= 0) return;
    if (action === "RELOAD" && player.ammo >= 3) return;

    player.actionLocked = true;
    player.currentAction = action;

    room.state.pendingActions.push({ playerId, action });

    // Broadcast that player locked in
    this.io.to(roomCode).emit("actionLocked", { playerId });
    this.broadcastState(roomCode);
  }

  startGame(roomCode: string): { success: boolean; error?: string } {
    const room = rooms.get(roomCode);
    if (!room) return { success: false, error: "Room not found" };
    if (room.state.phase !== "lobby")
      return { success: false, error: "Game already started" };

    // Check that all players have teams
    const sheriffsCount = room.state.players.filter(
      (p) => p.team === "sheriffs" && p.slot >= 0,
    ).length;
    const outlawsCount = room.state.players.filter(
      (p) => p.team === "outlaws" && p.slot >= 0,
    ).length;

    if (sheriffsCount === 0 || outlawsCount === 0) {
      return { success: false, error: "Both teams need at least one player" };
    }

    // Check slot constraints
    if (
      sheriffsCount > room.state.config.slotsPerSide ||
      outlawsCount > room.state.config.slotsPerSide
    ) {
      return { success: false, error: "Too many players for available slots" };
    }

    // Initialize game
    room.state.players.forEach((p) => {
      if (p.slot >= 0) {
        p.hp = 3;
        p.ammo = 1;
        p.isAlive = true;
        p.actionLocked = false;
        p.currentAction = "NONE";
        p.isCovered = false;
        p.stats = emptyStats();
      }
    });

    // Reset barrels
    room.state.barrels.forEach((b) => (b.hp = 3));

    room.state.tick = 0;
    room.state.winner = null;
    room.state.lastTickBullets = [];

    // Everyone starts exactly where they sat in the lobby.

    this.startPlanningPhase(roomCode);
    return { success: true };
  }

  private startPlanningPhase(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.state.resolutionFrom = undefined;
    room.state.resolutionStartedAt = undefined;
    room.state.phase = "planning";
    room.state.tick++;
    room.state.pendingActions = [];
    room.state.tickStartTime = Date.now();

    // Reset action locks
    room.state.players.forEach((p) => {
      p.actionLocked = false;
      p.currentAction = "NONE";
    });

    this.io.to(roomCode).emit("tickStart", {
      tick: room.state.tick,
      duration: room.state.config.tickDuration,
      startTime: room.state.tickStartTime,
    });

    this.broadcastState(roomCode);

    this.scheduleBots(room);

    // Set timer for resolution
    room.tickTimer = setTimeout(() => {
      this.resolveTick(roomCode);
    }, room.state.config.tickDuration);
  }

  private resolveTick(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.state.resolutionFrom = { players: structuredClone(room.state.players), barrels: structuredClone(room.state.barrels) };
    room.state.resolutionStartedAt = Date.now();
    room.state.revision++;
    room.state.phase = "resolution";

    // Resolve all actions
    const result = resolveActions(room.state);
    room.state = result.state;
    room.state.lastTickBullets = result.bullets;
    this.tallyStats(room, result.bullets);

    // Broadcast tick end with animation data
    this.io.to(roomCode).emit("tickEnd", {
      tick: room.state.tick,
      bullets: result.bullets,
      state: room.state,
    });

    // Check win condition
    const sheriffsAlive = room.state.players.filter(
      (p) => p.team === "sheriffs" && p.isAlive && p.slot >= 0,
    ).length;
    const outlawsAlive = room.state.players.filter(
      (p) => p.team === "outlaws" && p.isAlive && p.slot >= 0,
    ).length;

    const winner: Team | "draw" | null =
      sheriffsAlive === 0 && outlawsAlive === 0
        ? "draw"
        : sheriffsAlive === 0
          ? "outlaws"
          : outlawsAlive === 0
            ? "sheriffs"
            : null;

    if (winner) {
      const session = (room.state.session ??= { sheriffs: 0, outlaws: 0, draws: 0 });
      if (winner === "draw") session.draws++;
      else session[winner]++;
      // Defer the 'ended' transition so the final volley's animation plays
      // on the host before the EndScreen replaces the arena.
      room.gameEndTimer = setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r) return;
        r.gameEndTimer = null;
        r.state.winner = winner;
        r.state.phase = "ended";
        this.io.to(roomCode).emit("gameEnded", { winner });
        this.broadcastState(roomCode);
      }, GAME_END_ANIM_MS);
    } else {
      // Continue to next tick after delay for animation sequence
      // (600ms movement + 400ms bullet travel + impact display)
      room.continuationTimer = setTimeout(() => {
        const r = rooms.get(roomCode);
        if (!r) return;
        r.continuationTimer = null;
        this.startPlanningPhase(roomCode);
      }, RESOLUTION_MS);
    }
  }

  resetToLobby(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.tickTimer) { clearTimeout(room.tickTimer); room.tickTimer = null; }
    if (room.continuationTimer) { clearTimeout(room.continuationTimer); room.continuationTimer = null; }
    if (room.gameEndTimer) { clearTimeout(room.gameEndTimer); room.gameEndTimer = null; }
    this.clearBots(room);

    room.state.resolutionFrom = undefined;
    room.state.resolutionStartedAt = undefined;
    room.state.phase = "lobby";
    room.state.tick = 0;
    room.state.winner = null;
    room.state.pendingActions = [];
    room.state.lastTickBullets = [];
    room.state.tickStartTime = null;

    // Reset players but keep team assignments
    room.state.players.forEach((p) => {
      p.hp = 3;
      p.ammo = 1;
      p.isAlive = true;
      p.actionLocked = false;
      p.currentAction = "NONE";
      p.isCovered = false;
    });

    // Reset barrels
    room.state.barrels.forEach((b) => (b.hp = 3));

    this.broadcastState(roomCode);
  }

  endSession(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.tickTimer) clearTimeout(room.tickTimer);
    if (room.continuationTimer) clearTimeout(room.continuationTimer);
    if (room.gameEndTimer) clearTimeout(room.gameEndTimer);
    if (room.idleCleanupTimer) clearTimeout(room.idleCleanupTimer);
    this.clearBots(room);

    this.io.to(roomCode).emit("roomClosed");
    room.state.players.forEach((p) => playerRooms.delete(p.id));
    playerRooms.delete(room.hostId);

    rooms.delete(roomCode);
  }

  private clearBots(room: Room): void {
    room.botTimers.forEach(clearTimeout);
    room.botTimers = [];
  }

  // Bots lock in like a human would: at a random moment in the window,
  // never in the last ~400ms so they don't race the round end.
  private scheduleBots(room: Room): void {
    this.clearBots(room);
    const window = Math.max(300, room.state.config.tickDuration - 400);
    for (const bot of room.state.players.filter((p) => p.isBot && p.isAlive && p.slot >= 0)) {
      const delay = 350 + Math.random() * Math.max(0, window - 350);
      room.botTimers.push(setTimeout(() => {
        const r = rooms.get(room.code);
        if (!r || r.state.phase !== "planning") return;
        const live = r.state.players.find((p) => p.id === bot.id);
        if (!live || !live.isAlive || live.actionLocked) return;
        this.lockAction(live.id, r.code, chooseBotAction(r.state, live));
      }, delay));
    }
  }

  private tallyStats(room: Room, bullets: GameState["lastTickBullets"]): void {
    const byId = new Map(room.state.players.map((p) => [p.id, p]));
    for (const p of room.state.players) {
      if (p.slot < 0) continue;
      const s = (p.stats ??= emptyStats());
      if (p.currentAction === "COVER") s.covers++;
      else if (p.currentAction === "RELOAD") s.reloads++;
      else if (p.currentAction.startsWith("MOVE")) s.moves++;
      if (!p.isAlive && s.diedOnTick === null) s.diedOnTick = room.state.tick;
    }
    for (const b of bullets) {
      const shooter = b.shooterId ? byId.get(b.shooterId)?.stats : undefined;
      const target = b.targetId ? byId.get(b.targetId)?.stats : undefined;
      if (shooter) shooter.shots++;
      if (b.hit === "player") {
        if (shooter) { shooter.hits++; if (b.lethal) shooter.kills++; }
        if (target) target.damageTaken++;
      } else if (b.hit === "barrel") {
        if (shooter) shooter.barrelHits++;
        if (target) target.blocked++;
      } else if (b.hit === "miss") {
        if (shooter) shooter.misses++;
      } else if (b.hit === "bullet") {
        if (shooter) shooter.clashes++;
      }
    }
  }

  addBot(roomCode: string, team: Team): { success: boolean; error?: string } {
    const room = rooms.get(roomCode);
    if (!room || room.state.phase !== "lobby") return { success: false, error: "Bots can only join in the lobby" };
    const slot = findAvailableSlot(room.state.players, team, room.state.config.slotsPerSide);
    if (slot === null) return { success: false, error: "Team is full" };
    const taken = new Set(room.state.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${room.state.players.length + 1}`;
    room.state.players.push({
      id: `bot-${roomCode}-${Math.random().toString(36).slice(2, 9)}`,
      name, team, slot, hp: 3, ammo: 1, isAlive: true, actionLocked: false,
      currentAction: "NONE", isCovered: false, isBot: true,
    });
    this.broadcastState(roomCode);
    return { success: true };
  }

  removeBot(roomCode: string, team: Team): void {
    const room = rooms.get(roomCode);
    if (!room || room.state.phase !== "lobby") return;
    const bots = room.state.players.filter((p) => p.isBot && p.team === team);
    const last = bots[bots.length - 1];
    if (!last) return;
    room.state.players = room.state.players.filter((p) => p.id !== last.id);
    this.broadcastState(roomCode);
  }

  // Cosmetic only. Rate-limited so phones can't spam the TV.
  emote(roomCode: string, playerId: string, emoji: Emote): void {
    const room = rooms.get(roomCode);
    if (!room || !room.state.players.some((p) => p.id === playerId)) return;
    const now = Date.now();
    if (now - (room.lastEmote.get(playerId) ?? 0) < EMOTE_COOLDOWN_MS) return;
    room.lastEmote.set(playerId, now);
    this.io.to(roomCode).emit("emote", { playerId, emoji });
  }

  roomExists(roomCode: string): boolean {
    return rooms.has(roomCode);
  }

  updateConfig(
    roomCode: string,
    hostId: string,
    config: Partial<GameConfig>,
  ): void {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== hostId || room.state.phase !== "lobby") return;

    if (config.tickDuration !== undefined) {
      room.state.config.tickDuration = Math.max(
        1000,
        Math.min(10000, config.tickDuration),
      );
    }
    if (config.slotsPerSide !== undefined) {
      const newMax = Math.max(2, Math.min(8, config.slotsPerSide));
      room.state.config.slotsPerSide = newMax;
      // Evict players sitting beyond the new cap back to "unassigned" so the
      // lobby UI and startGame validation don't disagree.
      room.state.players.forEach((p) => {
        if (p.slot >= newMax) p.slot = -1;
      });
      // Recreate barrels
      room.state.barrels = [];
      for (let slot = 0; slot < newMax; slot++) {
        room.state.barrels.push({ team: "sheriffs", slot, hp: 3 });
        room.state.barrels.push({ team: "outlaws", slot, hp: 3 });
      }
    }

    this.broadcastState(roomCode);
  }

  handleDisconnect(playerId: string): void {
    const roomCode = playerRooms.get(playerId);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    // Don't remove player, just mark as disconnected
    // They can reconnect later
    playerRooms.delete(playerId);

    // If host disconnects, keep the room alive for reconnection
  }

  getPlayerRoom(playerId: string): string | undefined {
    return playerRooms.get(playerId);
  }

  broadcastState(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.state.revision++;
    this.io.to(roomCode).emit("gameState", publicState(room.state));
  }
}
