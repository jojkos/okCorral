import { Server } from "socket.io";
import type {
  GameState,
  GameConfig,
  Player,
  Barrel,
  Team,
  ActionType,
  ClientPlayer,
  ServerToClientEvents,
  ClientToServerEvents,
} from "../shared/types.js";
import { resolveActions } from "./actions.js";

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
}

const IDLE_CLEANUP_MS = 5 * 60 * 1000; // 5 minutes with no connected sockets
const GAME_END_ANIM_MS = 1600; // matches client bullet+impact budget

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
    phase: "lobby",
    tick: 0,
    config,
    players: [],
    barrels,
    winner: null,
    tickStartTime: null,
    pendingActions: [],
    lastTickBullets: [],
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
      }
    });

    // Reset barrels
    room.state.barrels.forEach((b) => (b.hp = 3));

    room.state.tick = 0;
    room.state.winner = null;
    room.state.lastTickBullets = [];

    // Randomize player positions
    const sheriffs = room.state.players.filter(
      (p) => p.team === "sheriffs" && p.slot >= 0,
    );
    const outlaws = room.state.players.filter(
      (p) => p.team === "outlaws" && p.slot >= 0,
    );

    // Fisher-Yates shuffle
    const shuffle = (array: any[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
    };

    shuffle(sheriffs);
    shuffle(outlaws);

    // Re-assign slots 0,1,2... based on shuffled order
    // This compacts them if there are gaps, but that's fine for a fresh start?
    // Actually, we should probably just swap their existing valid slots to maintain count?
    // Let's just re-assign 0..N to the shuffled players.
    sheriffs.forEach((p, i) => (p.slot = i));
    outlaws.forEach((p, i) => (p.slot = i));

    this.startPlanningPhase(roomCode);
    return { success: true };
  }

  private startPlanningPhase(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

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

    // Set timer for resolution
    room.tickTimer = setTimeout(() => {
      this.resolveTick(roomCode);
    }, room.state.config.tickDuration);
  }

  private resolveTick(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.state.phase = "resolution";

    // Resolve all actions
    const result = resolveActions(room.state);
    room.state = result.state;
    room.state.lastTickBullets = result.bullets;

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
      }, 2000);
    }
  }

  resetToLobby(roomCode: string): void {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.tickTimer) { clearTimeout(room.tickTimer); room.tickTimer = null; }
    if (room.continuationTimer) { clearTimeout(room.continuationTimer); room.continuationTimer = null; }
    if (room.gameEndTimer) { clearTimeout(room.gameEndTimer); room.gameEndTimer = null; }

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

    room.state.players.forEach((p) => playerRooms.delete(p.id));
    playerRooms.delete(room.hostId);

    rooms.delete(roomCode);
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
    this.io.to(roomCode).emit("gameState", room.state);
  }
}
