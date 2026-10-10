import assert from 'node:assert/strict';
import { io, Socket } from 'socket.io-client';
const url = process.env.TEST_SERVER || 'http://localhost:3001';
const sockets: Socket[] = [];
function event(socket: Socket, name: string, predicate = (_: any) => true): Promise<any> {
  return new Promise((resolve,reject) => {
    const timer=setTimeout(()=>{socket.off(name,listener);reject(new Error(`Timeout: ${name}`));},5000);
    const listener=(data:any)=>{if(predicate(data)){clearTimeout(timer);socket.off(name,listener);resolve(data);}};
    socket.on(name,listener);
  });
}
async function connect() { const s=io(url,{autoConnect:false});sockets.push(s);const p=event(s,'connect');s.connect();await p;return s; }
let host:Socket|undefined;
try {
  host=await connect();
  const roomEvent=event(host,'roomCreated');
  host.emit('createRoom',{hostId:`test-host-${Date.now()}`,config:{tickDuration:4000,slotsPerSide:5}});
  const {roomCode}=await roomEvent;
  const a=await connect(),b=await connect();
  for(const [s,id] of [[a,'a'],[b,'b']] as const) {
    const joined=event(s,'joined');s.emit('joinRoom',{roomCode,playerId:`test-${roomCode}-${id}`,playerName:id});await joined;
  }
  const tickEvent=event(a,'tickStart');host.emit('startGame');const {tick,startTime}=await tickEvent;
  const first=await a.timeout(2000).emitWithAck('submitAction',{tick,startedAt:startTime,action:'SHOOT_STRAIGHT'});
  assert.equal(first.accepted,true);
  const duplicate=await a.timeout(2000).emitWithAck('submitAction',{tick,startedAt:startTime,action:'RELOAD'});
  assert.equal(duplicate.action,'SHOOT_STRAIGHT');
  const stale=await b.timeout(2000).emitWithAck('submitAction',{tick,startedAt:startTime-1,action:'COVER'});
  assert.equal(stale.accepted,false);
  const second=await b.timeout(2000).emitWithAck('submitAction',{tick,startedAt:startTime,action:'RELOAD'});
  assert.equal(second.accepted,true);
  a.disconnect();const online=event(a,'connect');a.connect();await online;
  const restored=event(a,'gameState',s=>s.players.some((p:any)=>p.id===`test-${roomCode}-a`&&p.actionLocked));
  a.emit('joinRoom',{roomCode,playerId:`test-${roomCode}-a`,playerName:'a'});
  assert.equal((await restored).players.find((p:any)=>p.id===`test-${roomCode}-a`).currentAction,'SHOOT_STRAIGHT');
  const [resolvedA,resolvedB]=await Promise.all([event(a,'tickEnd'),event(b,'tickEnd')]);
  assert.equal(resolvedA.state.resolutionStartedAt,resolvedB.state.resolutionStartedAt);
  assert.equal(resolvedA.state.players.find((p:any)=>p.id===`test-${roomCode}-b`).hp,2);
  assert.equal(resolvedA.state.resolutionFrom.players.find((p:any)=>p.id===`test-${roomCode}-b`).hp,3);
  console.log('PASS: real sockets, round-bound acknowledgements, duplicate handling, reconnect, synchronized resolution and unchanged shot damage.');
} finally {
  host?.emit('endSession');
  await new Promise(resolve=>setTimeout(resolve,100));
  sockets.forEach(s=>s.disconnect());
}
