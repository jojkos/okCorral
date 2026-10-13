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
    const joined=event(s,'joined');s.emit('joinRoom',{roomCode,playerId:`test-${roomCode}-${id}`,playerName:id});
    assert.equal((await joined).player.appearance,0,'legacy join payloads receive the default design');
  }
  const aid=`test-${roomCode}-a`,bid=`test-${roomCode}-b`;
  const appearanceOf=(state:any,id:string)=>state.players.find((p:any)=>p.id===id)?.appearance;
  // A choice changes only its sender, and reaches both the other phone and TV.
  const selectedOnPhone=event(b,'gameState',s=>appearanceOf(s,aid)===7);
  const selectedOnHost=event(host,'gameState',s=>appearanceOf(s,aid)===7);
  a.emit('selectAppearance',7);
  const [phoneLooks,hostLooks]=await Promise.all([selectedOnPhone,selectedOnHost]);
  assert.equal(appearanceOf(phoneLooks,bid),0,'selectAppearance cannot target somebody else');
  assert.equal(appearanceOf(hostLooks,aid),7);
  const otherSelected=event(a,'gameState',s=>appearanceOf(s,bid)===2);
  b.emit('selectAppearance',2);await otherSelected;
  for(const invalid of [-1,8,1.5,'3',{appearance:4,playerId:bid}]) {
    const rejected=event(a,'error',message=>message==='Invalid character design');
    a.emit('selectAppearance',invalid);await rejected;
  }
  // A host without a joined player has nobody whose appearance it may edit.
  host.emit('selectAppearance',5);
  const unchangedLooks=event(host,'gameState');host.emit('requestState');
  const safeLooks=await unchangedLooks;
  assert.equal(appearanceOf(safeLooks,aid),7);assert.equal(appearanceOf(safeLooks,bid),2);
  // Nested switch patches are authoritative and broadcast to every phone.
  const changed=event(b,'gameState',s=>s.config.events?.rain===false);
  host.emit('updateConfig',{events:{rain:false}});
  const settings=await changed;
  assert.deepEqual(settings.config.events,{strongWind:true,walkingWoman:true,gatlingMan:true,rain:false});
  const allOff={strongWind:false,walkingWoman:false,gatlingMan:false,rain:false};
  const off=event(a,'gameState',s=>s.config.events?.strongWind===false);
  host.emit('updateConfig',{events:allOff});await off;
  a.emit('updateConfig',{events:{rain:true}});
  const unchanged=event(a,'gameState');a.emit('requestState');
  assert.deepEqual((await unchanged).config.events,allOff,'a phone cannot enable events');
  const tickEvent=event(a,'tickStart');host.emit('startGame');const {tick,startTime}=await tickEvent;
  const lockedAppearance=event(a,'error',message=>message==='Character designs are locked once the gunfight starts');
  a.emit('selectAppearance',3);await lockedAppearance;
  host.emit('updateConfig',{events:{rain:true}});
  const lockedConfig=event(host,'gameState');host.emit('requestState');
  const lockedState=await lockedConfig;
  assert.deepEqual(lockedState.config.events,allOff,'event settings lock at match start');
  assert.equal(appearanceOf(lockedState,aid),7,'appearance is locked at match start');
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
  const privateRejoin=event(a,'joined');
  a.emit('joinRoom',{roomCode,playerId:`test-${roomCode}-a`,playerName:'a'});
  assert.equal((await privateRejoin).player.appearance,7,'the joined acknowledgement restores the selected design');
  // Planning broadcasts hide the choice; a duplicate ack returns it only to its owner.
  const restoredState=await restored;
  assert.equal(restoredState.players.find((p:any)=>p.id===`test-${roomCode}-a`).currentAction,'NONE');
  assert.equal(appearanceOf(restoredState,aid),7,'the selected design survives socket reconnect');
  const rejoinedChoice=await a.timeout(2000).emitWithAck('submitAction',{tick,startedAt:startTime,action:'RELOAD'});
  assert.equal(rejoinedChoice.accepted,true);
  assert.equal(rejoinedChoice.action,'SHOOT_STRAIGHT');
  const [resolvedA,resolvedB]=await Promise.all([event(a,'tickEnd'),event(b,'tickEnd')]);
  assert.equal(resolvedA.state.resolutionStartedAt,resolvedB.state.resolutionStartedAt);
  assert.equal(resolvedA.state.players.find((p:any)=>p.id===`test-${roomCode}-b`).hp,2);
  assert.equal(resolvedA.state.resolutionFrom.players.find((p:any)=>p.id===`test-${roomCode}-b`).hp,3);
  const resolutionLocked=event(b,'error',message=>message==='Character designs are locked once the gunfight starts');
  b.emit('selectAppearance',6);await resolutionLocked;
  assert.equal(appearanceOf(resolvedA.state,bid),2);
  // The phone's normal submission API must accept an aim beyond the board.
  const next=await event(b,'tickStart');
  const edge=await b.timeout(2000).emitWithAck('submitAction',{tick:next.tick,startedAt:next.startTime,action:'SHOOT_UP'});
  assert.equal(edge.accepted,true);
  const edgeResult=await event(b,'tickEnd');
  const shot=edgeResult.bullets.find((bullet:any)=>bullet.shooterId===`test-${roomCode}-b`);
  assert.deepEqual([shot.aimedSlot,shot.toSlot,shot.hit],[-1,-1,'miss']);
  assert.equal(edgeResult.state.players.find((p:any)=>p.id===`test-${roomCode}-b`).ammo,1);
  const lobbyAgain=event(a,'gameState',s=>s.phase==='lobby');host.emit('playAgain');
  const retained=await lobbyAgain;
  assert.equal(appearanceOf(retained,aid),7);assert.equal(appearanceOf(retained,bid),2);
  const reselect=event(b,'gameState',s=>appearanceOf(s,aid)===5);
  a.emit('selectAppearance',5);await reselect;
  console.log('PASS: real sockets, character selection/validation/ownership/lobby locking/reconnect/rematch, event switch synchronization and host/lobby permissions, round-bound acknowledgements, duplicate handling, reconnect, synchronized resolution, shot damage and off-board shooting.');
} finally {
  host?.emit('endSession');
  await new Promise(resolve=>setTimeout(resolve,100));
  sockets.forEach(s=>s.disconnect());
}
