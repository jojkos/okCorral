import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { RoomManager } from "./rooms.js";
import {
  JoinRoomSchema,
  SelectTeamSchema,
  LockActionSchema,
  GameConfigSchema,
} from "../shared/validation.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameConfig,
} from "../shared/types.js";

const app = express();
const httpServer = createServer(app);

// Serve static files from the dist directory
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "../dist");

console.log("--- DEBUG: Static File Serving ---");
console.log("__dirname:", __dirname);
console.log("Resolved distPath:", distPath);

if (fs.existsSync(distPath)) {
  console.log("dist directory exists. Contents:", fs.readdirSync(distPath));
} else {
  console.error("CRITICAL: dist directory does NOT exist at:", distPath);
}

app.use(
  express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript");
      }
    },
  }),
);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: true, // allow any origin so LAN clients (e.g. http://192.168.x.x:5173) can connect
    methods: ["GET", "POST"],
  },
});

const roomManager = new RoomManager(io);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Host creates a room
  socket.on("createRoom", (data: { config: GameConfig; hostId: string }) => {
    try {
      const validConfig = GameConfigSchema.parse(data.config);
      const hostId = data.hostId || socket.id;
      socket.data.hostId = hostId;
      const roomCode = roomManager.createRoom(hostId, validConfig);
      socket.join(roomCode);
      socket.emit("roomCreated", { roomCode });
      console.log(`Room created: ${roomCode} by ${socket.id}`);
    } catch (error) {
      socket.emit("error", "Invalid configuration");
    }
  });

  socket.on("resumeHost", (data: { roomCode: string; hostId: string }) => {
    try {
      const roomCode = data.roomCode.toUpperCase();
      const hostId = data.hostId;
      const result = roomManager.resumeHost(roomCode, hostId);
      if (result.success) {
        socket.data.hostId = hostId;
        socket.join(roomCode);
        if (result.state) {
          socket.emit("gameState", result.state);
        }
        roomManager.broadcastState(roomCode);
      } else {
        socket.emit("error", result.error || "Failed to resume host");
      }
    } catch {
      socket.emit("error", "Invalid host resume request");
    }
  });

  // Player joins a room
  socket.on("joinRoom", (data) => {
    try {
      const { roomCode, playerName, playerId } = JoinRoomSchema.parse(data);
      const result = roomManager.joinRoom(
        playerId,
        roomCode.toUpperCase(),
        playerName,
      );

      if (result.success) {
        socket.join(roomCode.toUpperCase());
        socket.data.playerId = playerId;
        socket.emit("joined", {
          player: result.player!,
          roomCode: roomCode.toUpperCase(),
        });
        roomManager.broadcastState(roomCode.toUpperCase());
      } else {
        socket.emit("error", result.error || "Failed to join room");
      }
    } catch (error) {
      socket.emit("error", "Invalid room code or name");
    }
  });

  // Player selects team
  socket.on("selectTeam", (team) => {
    try {
      const validTeam = SelectTeamSchema.parse(team);
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) return;
      const roomCode = roomManager.getPlayerRoom(playerId);
      if (roomCode) {
        const result = roomManager.selectTeam(playerId, roomCode, validTeam);
        if (result.success) {
          roomManager.broadcastState(roomCode);
        } else {
          socket.emit("error", result.error || "Failed to select team");
        }
      }
    } catch (error) {
      socket.emit("error", "Invalid team");
    }
  });

  // Player leaves team
  socket.on("leaveTeam", () => {
    const playerId = socket.data.playerId as string | undefined;
    if (!playerId) return;
    const roomCode = roomManager.getPlayerRoom(playerId);
    if (roomCode) {
      roomManager.leaveTeam(playerId, roomCode);
      roomManager.broadcastState(roomCode);
    }
  });

  // Player locks in action
  socket.on("lockAction", (action) => {
    try {
      const validAction = LockActionSchema.parse(action);
      const playerId = socket.data.playerId as string | undefined;
      if (!playerId) return;
      const roomCode = roomManager.getPlayerRoom(playerId);
      if (roomCode) {
        roomManager.lockAction(playerId, roomCode, validAction);
      }
    } catch (error) {
      socket.emit("error", "Invalid action");
    }
  });

  // Any player can start the game
  socket.on("startGame", () => {
    const playerId = socket.data.playerId as string | undefined;
    if (!playerId) return;
    const roomCode = roomManager.getPlayerRoom(playerId);
    if (roomCode) {
      const result = roomManager.startGame(roomCode);
      if (!result.success) {
        socket.emit("error", result.error || "Cannot start game");
      }
    }
  });

  // Play again
  socket.on("playAgain", () => {
    const playerId = socket.data.playerId as string | undefined;
    if (!playerId) return;
    const roomCode = roomManager.getPlayerRoom(playerId);
    if (roomCode) {
      roomManager.resetToLobby(roomCode);
    }
  });

  // End session
  socket.on("endSession", () => {
    const hostId = socket.data.hostId as string | undefined;
    if (!hostId) return;
    const roomCode = roomManager.getPlayerRoom(hostId);
    if (roomCode) {
      roomManager.endSession(roomCode);
    }
  });

  // Host updates config
  socket.on("updateConfig", (config) => {
    const hostId = socket.data.hostId as string | undefined;
    if (!hostId) return;
    const roomCode = roomManager.getPlayerRoom(hostId);
    if (roomCode) {
      roomManager.updateConfig(roomCode, hostId, config);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    const playerId = socket.data.playerId as string | undefined;
    const hostId = socket.data.hostId as string | undefined;
    if (playerId) {
      roomManager.handleDisconnect(playerId);
    }
    if (hostId && hostId !== playerId) {
      roomManager.handleDisconnect(hostId);
    }
  });
});

// Serve index.html for all other routes (SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = "0.0.0.0"; // listen on all interfaces so LAN clients can connect
httpServer.listen(PORT, HOST, () => {
  console.log(
    `Server running on http://${HOST}:${PORT} (LAN: use your machine's IP)`,
  );
});
