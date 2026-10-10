import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';
import { estimateOffset } from './lib/presentation';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(window.location.origin, {
  autoConnect: false, reconnection: true, reconnectionDelay: 750, reconnectionDelayMax: 4000,
});
let offset = 0;
let bestRtt = Infinity;
let sampledAt = 0;
export const serverNow = () => Date.now() + offset;
export function syncClock() {
  if (!socket.connected) return;
  const sent = Date.now();
  socket.timeout(2500).emit('syncClock', (error, time) => {
    if (error || !Number.isFinite(time)) return;
    const received = Date.now();
    const rtt = received - sent;
    if (rtt <= bestRtt || received - sampledAt > 30000) {
      offset = estimateOffset(sent, received, time);
      bestRtt = rtt;
      sampledAt = received;
    }
  });
}
socket.on('connect', () => { bestRtt = Infinity; syncClock(); });
setInterval(syncClock, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  syncClock();
  if (socket.connected) socket.emit('requestState');
  else socket.connect();
});
export function connectSocket(): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const clean = () => { socket.off('connect', ready); socket.off('connect_error', failed); };
    const ready = () => { clean(); resolve(); };
    const failed = (e: Error) => { clean(); reject(e); };
    socket.once('connect', ready);
    socket.once('connect_error', failed);
    socket.connect();
  });
}
export function disconnectSocket() { socket.disconnect(); }
