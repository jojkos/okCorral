import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/types";

// Use current origin so LAN clients (e.g. http://192.168.x.x:5173) connect via same host; Vite proxies /socket.io to backend
const SOCKET_URL = window.location.origin;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  SOCKET_URL,
  {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  },
);

export function connectSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }

    socket.connect();

    socket.once("connect", () => {
      console.log("Socket connected:", socket.id);
      resolve();
    });

    socket.once("connect_error", (error) => {
      console.error("Socket connection error:", error);
      reject(error);
    });
  });
}

export function disconnectSocket(): void {
  socket.disconnect();
}
