import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bullet, GameState, Player, SwallowState } from '../shared/types';
import { advanceRain, applyRainAmmo, initialRainState, resolveSwallowHits, SWALLOW_COUNT } from '../server/rain';
import { initialGatlingManState, initialStrongWindState, initialWalkingWomanState } from '../server/randomEvents';
import { resolveActions } from '../server/actions';
import { chooseBotAction } from '../server/bots';
import { flightPoint, type ShotFlight } from '../shared/ballistics';
import { swallowIntersection, swallowPosition } from '../shared/swallows';
import { VOLLEY } from '../shared/volley';
import { slotLayout } from '../shared/arenaGeometry';
import { RoomManager } from '../server/rooms';
import type { Server } from 'socket.io';

const calm=initialStrongWindState();
const mk=(id:string,team:Player['team'],ammo=1):Player=>({id,name:id,team,slot:1,hp:3,ammo,isAlive:true,actionLocked:false,currentAction:'NONE',isCovered:false});
function game():GameState {
  return {roomCode:'RAIN',revision:0,phase:'resolution',tick:4,config:{tickDuration:4000,slotsPerSide:5},
    rain:initialRainState(),strongWind:calm,walkingWoman:initialWalkingWomanState(),gatlingMan:initialGatlingManState(),
    players:[mk('s','sheriffs'),mk('o','outlaws')],barrels:[],pendingSuicides:[],lastTickSuicides:[],winner:null,
    tickStartTime:0,resolutionStartedAt:4000,pendingActions:[],lastTickBullets:[]};
}
const bird=(seed=17):SwallowState=>({id:`bird-${seed}`,seed,bornAt:0});
function shotThrough(b:SwallowState,at=1000):Bullet {
  const pos=swallowPosition(b,4000+at);
  return {id:'test',fromTeam:'sheriffs',fromSlot:0,aimedSlot:0,toSlot:0,trajectory:'straight',hit:'miss',firedAt:750,
    flight:{fromX:pos.x-400,fromY:pos.y,controlX:pos.x,controlY:pos.y,toX:pos.x+400,toY:pos.y}};
}

test('rain rolls at exactly 10%, warns for two full rounds and can first rain on round five',()=>{
  let rain=initialRainState();
  for(let tick=1;tick<=2;tick++) rain=advanceRain(rain,tick,5,calm,tick*4000,()=>{throw Error('too early to roll');});
  assert.equal(advanceRain(rain,3,5,calm,12000,()=>.1).phase,'dry');
  rain=advanceRain(rain,3,5,calm,12000,()=>.099999);
  assert.equal(rain.phase,'warning'); assert.equal(rain.warningRoundsRemaining,2);
  assert.equal(rain.swallows.length,SWALLOW_COUNT);
  const ids=rain.swallows.map(b=>b.id);
  rain=advanceRain(rain,4,5,calm,16000,()=>{throw Error('do not reroll a scheduled rain');});
  assert.equal(rain.phase,'warning'); assert.equal(rain.warningRoundsRemaining,1);
  assert.deepEqual(rain.swallows.map(b=>b.id),ids);
  rain=advanceRain(rain,5,5,calm,20000,()=>{throw Error('rain is already scheduled');});
  assert.equal(rain.phase,'active'); assert.equal(rain.swallows.length,0);
  rain=advanceRain(rain,6,5,calm,24000,()=>.8);
  assert.equal(rain.phase,'dry','rain lasts exactly one round');
  assert.equal(advanceRain(rain,7,5,calm,28000,()=>0).phase,'warning','no artificial cooldown');
});

test('rain removes one loaded bullet once, never health or negative ammo; bots and reloading use the new amount',()=>{
  const state=game(); state.rain.phase='active';
  state.players=[0,1,2,3].map((ammo,i)=>({...mk(String(i),'sheriffs',ammo),slot:i}));
  state.players.push({...mk('dead','outlaws',2),isAlive:false},{...mk('spectator','outlaws',2),slot:-1});
  applyRainAmmo(state);applyRainAmmo(state);
  assert.deepEqual(state.players.map(p=>p.ammo),[0,0,1,2,2,2]);
  assert.ok(state.players.every(p=>p.hp===3));
  const reload=game(); reload.rain.phase='active'; applyRainAmmo(reload);
  assert.equal(chooseBotAction(reload,reload.players[0],()=>.5),'RELOAD');
  reload.players[0].currentAction='RELOAD';
  const resolved=resolveActions(reload).state;
  assert.equal(resolved.players[0].ammo,1,'reload during rain is not penalized again');
  applyRainAmmo(resolved);assert.equal(resolved.players[0].ammo,1);
  const warning=game();warning.rain.phase='warning';applyRainAmmo(warning);
  assert.equal(warning.players[0].ammo,1,'swallows do not wet powder yet');
});

test('moving swallow collision leaves bullets unchanged, kills once and can hit multiple birds on one path',()=>{
  const state=game(), b=bird(); state.rain.swallows=[b,{...b,id:'second'}];
  const bullet=shotThrough(b), original=structuredClone(bullet);
  resolveSwallowHits(state,[bullet]);
  assert.deepEqual(bullet,original);
  assert.ok(state.rain.swallows.every(b=>b.remains));
  const corpse=structuredClone(state.rain.swallows);
  assert.ok(corpse[0].remains!.hitAt>750&&corpse[0].remains!.hitAt<VOLLEY.impact);
  assert.ok(corpse[0].remains!.y>corpse[0].remains!.hitY);
  resolveSwallowHits(state,[bullet]);assert.deepEqual(state.rain.swallows,corpse);
  assert.deepEqual(state.pendingSuicides,[]);
});

test('a near miss stays alive and a curved path only hits where bird and bullet coincide in time',()=>{
  const b=bird(), bullet=shotThrough(b), flight=bullet.flight!;
  assert.notEqual(swallowIntersection(b,flight,4750,500),null);
  const away={...flight,fromY:flight.fromY-70,controlY:flight.controlY-70,toY:flight.toY-70};
  assert.equal(swallowIntersection(b,away,4750,500),null);
  const pos=swallowPosition(b,5000);
  const curved:ShotFlight={fromX:pos.x-400,fromY:pos.y-90,controlX:pos.x,controlY:pos.y+120,toX:pos.x+400,toY:pos.y-150};
  assert.notEqual(swallowIntersection(b,curved,4750,500),null);
  assert.deepEqual(swallowPosition(JSON.parse(JSON.stringify(b)),5000),pos,'reconnect preserves exact flight');
});

function birdOn(bullet:Bullet,state:GameState) {
  for(let seed=0;seed<10000;seed++) {
    const b=bird(seed), at=bullet.firedAt!;
    if(swallowIntersection(b,bullet.flight!,state.resolutionStartedAt!+at,VOLLEY.impact-at)!==null)return b;
  }
  throw Error('test fixture could not find a crossing bird');
}
test('real player, wind-curved, off-board and gatling shots retain their combat outcome after hitting a bird',()=>{
  for(const kind of ['player','curve','offboard','gatling'] as const) {
    const state=game();
    if(kind==='gatling')state.gatlingMan={phase:'active',cooldownRoundsRemaining:0,targets:[{team:'outlaws',slot:2}]};
    else state.players[0].currentAction=kind==='curve'?'SHOOT_DOWN':kind==='offboard'?'SHOOT_UP':'SHOOT_STRAIGHT';
    if(kind==='curve')state.strongWind={phase:'active',direction:'up',activeRoundsRemaining:2,cooldownRoundsRemaining:0};
    if(kind==='offboard')state.players[0].slot=0;
    const clean=resolveActions(state), first=clean.bullets[0];
    state.rain.swallows=[birdOn(first,state)];
    const hit=resolveActions(state);
    assert.ok(hit.state.rain.swallows[0].remains,kind);
    assert.deepEqual(hit.state.players,clean.state.players);
    assert.deepEqual(hit.state.barrels,clean.state.barrels);
    assert.deepEqual(hit.state.pendingSuicides,clean.state.pendingSuicides);
    assert.deepEqual(hit.bullets.map(({id,...b})=>b),clean.bullets.map(({id,...b})=>b));
  }
});

test('birds beyond a stopped bullet survive clashes, cover and civilian hits',()=>{
  const state=game(), b=bird(), full=shotThrough(b);
  const short={...full,flight:{...full.flight!,controlX:full.flight!.fromX+40,toX:full.flight!.fromX+80}};
  for(const hit of ['bullet','barrel','woman'] as const) {
    state.rain.swallows=[b];resolveSwallowHits(state,[{...short,hit}]);
    assert.equal(state.rain.swallows[0].remains,undefined);
  }
  const impact=swallowIntersection(b,full.flight!,4750,500)!;
  const bulletPos=flightPoint(full.flight!,impact), birdPos=swallowPosition(b,4750+500*impact);
  assert.ok(Math.hypot(bulletPos.x-birdPos.x,bulletPos.y-birdPos.y)<13);
});

test('bird corpses persist through rain, drift one lane with active wind only and disappear permanently offscreen',()=>{
  const state=game();state.rain.phase='warning';state.rain.warningRoundsRemaining=1;
  state.rain.swallows=[bird()];resolveSwallowHits(state,[shotThrough(bird())]);
  let rain=advanceRain(state.rain,5,5,calm,20000,()=>.9);
  assert.equal(rain.phase,'active');assert.equal(rain.swallows.length,1);
  const y=rain.swallows[0].remains!.y;
  rain=advanceRain(rain,6,5,{...calm,phase:'warning',direction:'down'},24000,()=>.9);
  assert.equal(rain.swallows[0].remains!.y,y);
  for(const direction of ['up','down'] as const) {
    const moved=advanceRain(rain,7,5,{...calm,phase:'active',direction},28000,()=>.9);
    assert.equal(moved.swallows[0].remains!.fromY,y);
    assert.equal(moved.swallows[0].remains!.y,y+(direction==='up'?-1:1)*slotLayout(5).slotHeight);
  }
  for(let tick=7;tick<30;tick++)rain=advanceRain(rain,tick,5,{...calm,phase:'active',direction:'down'},tick*4000,()=>.9);
  assert.equal(rain.swallows.length,0);
});

test('room lifecycle broadcasts rain ammo before planning, reconnect does not subtract again, and restart clears birds',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const states:GameState[]=[];
  const io={to:()=>({emit:(event:string,data:GameState)=>{if(event==='gameState')states.push(structuredClone(data));}})} as unknown as Server;
  const manager=new RoomManager(io), room=manager.createRoom('host',{tickDuration:4000,slotsPerSide:5});
  try {
    manager.joinRoom('a',room,'Ada');manager.joinRoom('b',room,'Billy');
    manager.selectTeam('a',room,'sheriffs');manager.selectTeam('b',room,'outlaws');manager.startGame(room);
    const state=manager.resumeHost(room,'host').state!;
    state.tick=4;state.rain={...initialRainState(),phase:'warning',warningRoundsRemaining:1,swallows:[bird()]};
    state.players.forEach(p=>p.ammo=3);
    t.mock.timers.tick(4000);t.mock.timers.tick(2600);
    const wet=states.at(-1)!;
    assert.equal(wet.phase,'planning');assert.equal(wet.tick,5);assert.equal(wet.rain.phase,'active');
    assert.deepEqual(wet.players.map(p=>p.ammo),[2,2]);
    manager.handleDisconnect('a');manager.joinRoom('a',room,'Ada');manager.broadcastState(room);
    assert.deepEqual(states.at(-1)!.rain,wet.rain);assert.deepEqual(states.at(-1)!.players.map(p=>p.ammo),[2,2]);
    manager.resetToLobby(room);assert.deepEqual(manager.resumeHost(room,'host').state!.rain,initialRainState());
    manager.startGame(room);assert.deepEqual(manager.resumeHost(room,'host').state!.rain,initialRainState());
  } finally {manager.endSession(room);t.mock.timers.reset();}
});
