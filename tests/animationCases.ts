import type { GameState, Player, StrongWindState, WalkingWomanState } from '../shared/types';
import { slotLayout } from '../shared/arenaGeometry';
import { playerShotCurve } from '../shared/ballistics';
import { drawBackground, drawBarrel, drawStrongWindWeather, drawWalkingWoman } from '../src/host/arena/scene';
import { createWindMotion, stepWindMotion } from '../src/host/arena/windMotion';
import { actorFrame, drawActor } from '../src/host/arena/actors';
import { drawGatlingMan } from '../src/host/arena/gatling';
import { drawRain, drawRainGround, drawSwallows } from '../src/host/arena/rain';
import { drawBanners, drawBullets, drawEmotes, drawFloaters, drawHats, drawImpacts, drawMuzzles, ParticleSystem, stepHats } from '../src/host/arena/fx';
import { weatherTransitionCases } from './weatherTransitions.browser';
import { characterDesignCases } from './characterDesigns.browser';

export type AnimationCase = { name: string; durationMs?: number; wind?: StrongWindState; draw: (ctx: CanvasRenderingContext2D, progress: number, motion: boolean, slots: number) => void };
export const wind = (phase: StrongWindState['phase'], direction: 'up' | 'down'): StrongWindState => ({phase, direction, activeRoundsRemaining: 2, cooldownRoundsRemaining: 0});
const civilian = (phase: 'walking' | 'dead'): WalkingWomanState => ({phase, slot: 2, fromSlot: 1, direction: 'down', cooldownRoundsRemaining: 0, bloodTrail: phase === 'dead' ? [0, 1, 2] : [], killedFromTeam: 'sheriffs'});
export function animationGame(): GameState {
  return {roomCode:'TEST',revision:1,phase:'planning',tick:12,config:{tickDuration:4000,slotsPerSide:5},tickStartTime:10000,
    strongWind:wind('active','down'),walkingWoman:civilian('walking'),gatlingMan:{phase:'active',targets:[],cooldownRoundsRemaining:0},
    rain:{phase:'active',warningRoundsRemaining:0,ammoAppliedTick:12,swallows:[]},
    players:[],barrels:[],pendingActions:[],pendingSuicides:[],lastTickSuicides:[],lastTickBullets:[],winner:null};
}
export const animationCases: AnimationCase[] = [
  ...weatherTransitionCases,
  ...characterDesignCases,
  ...(['warning','active'] as const).flatMap(phase => (['up','down'] as const).map(direction => ({
    wind: wind(phase,direction),
    name:`Wind ${phase} ${direction}`, draw:(ctx:CanvasRenderingContext2D,p:number,motion:boolean,n:number)=>{
      const frame=createWindMotion(),weather=wind(phase,direction);
      stepWindMotion(frame,weather,2+p,motion);
      drawStrongWindWeather(ctx,slotLayout(n),weather,frame.travel);
    },
  }))),
  {name:'Rain and puddles',draw(ctx,p,motion){const gs=animationGame();drawRainGround(ctx,gs,p,motion);drawRain(ctx,gs,p,motion);}},
  {name:'Swallows in flight',draw(ctx,p,motion){const gs=animationGame();gs.rain.swallows=Array.from({length:6},(_,i)=>({id:String(i),seed:17+i*39,bornAt:5000}));drawSwallows(ctx,gs,10000+p*1000,p,-1,motion,'air');}},
  {name:'Swallow falling',draw(ctx,p,motion){const gs=animationGame();gs.rain.swallows=[{id:'bird',seed:7,bornAt:10000,remains:{x:800,y:570,fromY:570,hitX:800,hitY:460,hitAngle:0.4,hitAt:900,hitTick:12}}];for(const layer of ['air','ground'] as const)drawSwallows(ctx,gs,11000,p,900+p*500,motion,layer);}},
  {name:'Swallow remains in wind',draw(ctx,p,motion){const gs=animationGame();gs.rain.swallows=[{id:'bird',seed:7,bornAt:10000,remains:{x:800,y:700,fromY:550,hitX:800,hitY:460,hitAngle:0.4,hitAt:900,hitTick:11}}];drawSwallows(ctx,gs,11000,p,-1,motion,'ground');}},
  ...(['walking','dead'] as const).map(phase=>({name:`Civilian ${phase}`,draw:(ctx:CanvasRenderingContext2D,p:number,motion:boolean,n:number)=>drawWalkingWoman(ctx,slotLayout(n),civilian(phase),p,motion,p)})),
  ...(['entry','exit'] as const).flatMap(leg=>(['up','down'] as const).map(direction=>({
    name:`Civilian ${leg} ${direction}`,draw:(ctx:CanvasRenderingContext2D,p:number,motion:boolean,n:number)=>{
      const fromSlot=leg==='entry'?(direction==='down'?-1:n):(direction==='down'?n-1:0);
      const slot=leg==='entry'?(direction==='down'?0:n-1):(direction==='down'?n:-1);
      drawWalkingWoman(ctx,slotLayout(n),{...civilian('walking'),slot,fromSlot,direction},p*4,motion,p);
    },
  }))),
  ...(['up','down'] as const).map(direction=>({
    name:`Civilian remains exit ${direction}`,draw:(ctx:CanvasRenderingContext2D,p:number,motion:boolean,n:number)=>{
      const fromSlot=direction==='down'?n-1.35:.35,slot=direction==='down'?n+.15:-1.15;
      drawWalkingWoman(ctx,slotLayout(n),{...civilian('dead'),slot,fromSlot,direction,bloodTrail:[fromSlot,slot]},p*4,motion,p);
    },
  })),
  {name:'Civilian crushed',draw(ctx,p,motion,n){drawWalkingWoman(ctx,slotLayout(n),{...civilian('dead'),crushedByGatling:true},p,motion,p,{fall:p,compression:p,dust:1-p});}},
  ...(['arrival','firing','departure'] as const).map(leg=>({name:`Gatling ${leg}`,draw:(ctx:CanvasRenderingContext2D,p:number,motion:boolean,n:number)=>drawGatlingMan(ctx,slotLayout(n),animationGame().gatlingMan,2+p,motion,{team:'outlaws',slot:0},leg==='arrival'?p:1,leg==='firing',leg==='departure'?1390+p*1000:-1)})),
  ...(['move','cover','reload','recoil','death','guilt'] as const).map(action=>({name:`Player ${action}`,draw:(ctx:CanvasRenderingContext2D,p:number,motion:boolean,n:number)=>{
    const L=slotLayout(n),player:Player={id:'p',name:'Dusty',team:'sheriffs',slot:action==='move'?1:0,hp:3,ammo:1,isAlive:action!=='death',isCovered:action==='cover',actionLocked:true,currentAction:'NONE'};
    const anim={cover:action==='cover'?p:0,...(action==='death'?{deathAt:0}: {})};
    const frame=actorFrame(L,player,{...player,slot:0},undefined,450+p*400,{reveal:450,move:850},anim,motion);
    drawActor(ctx,L,player,frame,anim,{walk:action==='move'?Math.sin(p*8):0,recoil:action==='recoil'?p:0,reload:action==='reload'?p:0,suicide:action==='guilt'?p:0},p,motion);
  }})),
  {name:'Barrel hit and destruction',draw(ctx,p,_motion,n){const L=slotLayout(n);drawBarrel(ctx,L,410,L.feet[0],{team:'sheriffs',slot:0,hp:p>.7?0:2},{cover:1,team:'sheriffs',wobble:1,t:p});}},
  {name:'Wind-curved bullet',draw(ctx,p,_motion,n){drawBullets(ctx,[{...playerShotCurve(slotLayout(n),'sheriffs',0,0,1),id:'b',bornAt:0,dur:1,team:'sheriffs',hit:'miss'}],p);}},
  ...(['player','barrel','bullet','woman'] as const).map(kind=>({name:`Impact ${kind}`,draw:(ctx:CanvasRenderingContext2D,p:number)=>drawImpacts(ctx,[{x:800,y:450,t:0,kind,lethal:true}],p*.5)})),
  {name:'Muzzle flash',draw(ctx,p){drawMuzzles(ctx,[{x:600,y:450,t:0,life:.12,dir:1}],p*.1);}},
  {name:'Particles',draw(ctx,p){const system=new ParticleSystem();for(const [i,kind] of (['dot','square','streak','smoke'] as const).entries())system.add({kind,x:600+i*100,y:450,vx:80,vy:-50,life:2,age:0,size:12,color:'#dfb278'});system.step(p);system.draw(ctx);}},
  {name:'Flying hat',draw(ctx,p){const hats=[{x:800,y:450,vx:60,vy:-100,rot:0,vr:8,ground:700,team:'sheriffs' as const,s:1,landed:false}];stepHats(hats,p*.5);drawHats(ctx,hats);}},
  {name:'Round banner',draw(ctx,p){drawBanners(ctx,[{text:'SHOWDOWN',t:0,life:2,color:'#ffd875',size:64,y:450}],p);}},
  {name:'Impact label',draw(ctx,p){drawFloaters(ctx,[{x:800,y:450,text:'BLOCKED',t:0,color:'#8fe3c4',size:40,life:2}],p);}},
  {name:'Phone emote',draw(ctx,p){drawEmotes(ctx,[{x:800,y:450,emoji:'🤠',t:0,name:'Dusty',team:'sheriffs'}],p);}},
];
export { drawBackground };
