import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animationCases, wind } from './animationCases';
import { drawStrongWindWeather } from '../src/host/arena/scene';
import { createWindMotion, stepWindMotion } from '../src/host/arena/windMotion';
import { slotLayout } from '../shared/arenaGeometry';
import { resolveReducedMotion } from '../src/lib/motionPreferences';
import { windOffset } from '../shared/shooting';

// Validate canvas geometry without requiring a display or native dependencies.
Object.defineProperty(globalThis,'Path2D',{value:class Path2D {},configurable:true});
function context() {
  let depth=0;
  let values:Record<PropertyKey,unknown>={globalAlpha:1};
  const stack:typeof values[]=[];
  const calls:unknown[][]=[];
  const gradient={addColorStop(offset:number){assert.ok(offset>=0&&offset<=1);}};
  const ctx=new Proxy({} as CanvasRenderingContext2D,{
    get(_target,key){if(key in values)return values[key];return (...args:unknown[])=>{
      for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${String(key)} has a non-finite coordinate`);
      calls.push([key,...args]);
      if(key==='save'){depth++;stack.push({...values});}
      if(key==='restore'){assert.ok(--depth>=0,'unbalanced canvas restore');values=stack.pop()!;}
      if(key==='ellipse')assert.ok(Number(args[2])>=0&&Number(args[3])>=0);
      if(key==='arc')assert.ok(Number(args[2])>=0);
      if(key==='createRadialGradient')assert.ok(Number(args[2])>=0&&Number(args[5])>=0);
      if(key==='measureText')return {width:String(args[0]).length*12};
      if(key==='createLinearGradient'||key==='createRadialGradient')return gradient;
    };},
    set(_target,key,value){if(typeof value==='number')assert.ok(Number.isFinite(value),String(key));values[key]=value;return true;},
  });
  return {ctx,calls,balanced:()=>assert.equal(depth,0)};
}

test('explicit full motion overrides the OS; default and reduced choices respect accessibility',()=>{
  for(const system of [false,true]){
    assert.equal(resolveReducedMotion('full',system),false);
    assert.equal(resolveReducedMotion('reduced',system),true);
    assert.equal(resolveReducedMotion('system',system),system);
  }
});

for(const animation of animationCases)test(`animation geometry: ${animation.name}`,()=>{
  for(const slots of [2,5,8])for(const motion of [false,true])for(const progress of [0,.15,.4,.85,1]){
    const frame=context();animation.draw(frame.ctx,progress,motion,slots);frame.balanced();
    assert.ok(frame.calls.length>0 || (animation.name==='Gatling arrival' && !motion && progress===0));
  }
});

test('wind is visible in both phases and directions, moves over time, and stays visible with reduced motion',()=>{
  for(const phase of ['warning','active'] as const)for(const direction of ['up','down'] as const){
    const capture=(time:number,motion:boolean)=>{const frame=context(),weather=wind(phase,direction),movement=createWindMotion();stepWindMotion(movement,weather,time,motion);drawStrongWindWeather(frame.ctx,slotLayout(5),weather,movement.travel);frame.balanced();return frame.calls;};
    assert.ok(capture(2,true).filter(c=>c[0]==='stroke').length>30);
    assert.notDeepEqual(capture(2,true),capture(3,true));
    assert.deepEqual(capture(2,false),capture(3,false));
  }
  const calm=context();drawStrongWindWeather(calm.ctx,slotLayout(5),wind('calm','down'),1);assert.equal(calm.calls.length,0);
});

test('wind travels visibly in the same direction as bullet deflection at any frame rate',()=>{
  for(const direction of ['up','down'] as const){
    const weather=wind('active',direction),sign=windOffset(weather);
    const results:number[]=[];
    for(const fps of [10,20,30,60,144]){
      const movement=createWindMotion();
      for(let i=0;i<fps*4;i++)stepWindMotion(movement,weather,1/fps,true);
      // Strong wind crosses the playable street in roughly one short round.
      assert.ok(sign*movement.travel>730);
      results.push(movement.travel);
    }
    for(const distance of results)assert.ok(Math.abs(distance-results[0])<1e-8);
    const warning=createWindMotion();
    stepWindMotion(warning,wind('warning',direction),2,true);
    assert.ok(sign*warning.travel>130,'warning must visibly roll, not barely creep');
  }
});

test('warning -> active and consecutive active rounds preserve weed position, size and rotation',()=>{
  for(const direction of ['up','down'] as const){
    const movement=createWindMotion(),warning=wind('warning',direction),active=wind('active',direction);
    stepWindMotion(movement,warning,40,true);
    const capture=(weather:typeof warning)=>{
      const frame=context();drawStrongWindWeather(frame.ctx,slotLayout(5),weather,movement.travel);
      return frame.calls.filter(c=>c[0]==='translate'||c[0]==='rotate'||c[0]==='scale');
    };
    const before=capture(warning);
    assert.deepEqual(capture(active).slice(0,before.length),before,'phase change must not teleport or resize existing weeds');
    const start=movement.travel;
    stepWindMotion(movement,active,1/60,true);
    assert.ok(Math.abs(movement.travel-start)<4);
    assert.equal(Math.sign(movement.travel-start),windOffset(active));
    const firstRound=capture(active);
    assert.deepEqual(capture({...active,activeRoundsRemaining:1}),firstRound);
  }
});

test('dust heads and brush advance with the wind; tails trail behind, and wrap outside view',()=>{
  const L=slotLayout(5),height=L.slotHeight*L.n,span=height+400;
  for(const direction of ['up','down'] as const){
    const weather=wind('active',direction),dir=windOffset(weather);
    const capture=(travel:number)=>{const frame=context();drawStrongWindWeather(frame.ctx,L,weather,travel);return frame.calls;};
    const a=capture(0),b=capture(dir*2);
    const heads=a.filter(c=>c[0]==='quadraticCurveTo').slice(0,13),nextHeads=b.filter(c=>c[0]==='quadraticCurveTo').slice(0,13);
    for(let i=0;i<heads.length;i++){
      const delta=Number(nextHeads[i][4])-Number(heads[i][4]);
      assert.ok(Math.abs(delta-dir*4.8)<1e-8||Math.abs(delta-dir*4.8+dir*span)<1e-8);
      const gradient=a.filter(c=>c[0]==='createLinearGradient')[i];
      assert.equal(Math.sign(Number(gradient[4])-Number(gradient[2])),-dir);
    }
    // Follow complete shapes through enough frames to include both wrap edges.
    let previous=capture(0);
    for(let travel=10;travel<=span;travel+=10){
      const next=capture(travel*dir);
      for(const kind of ['translate','moveTo']){
        // The first 13 moveTo calls are dust heads (the remaining ones are brush).
        const coordinates=(calls:unknown[][])=>calls.filter(c=>c[0]===kind).slice(0,kind==='moveTo'?13:5).map(c=>Number(c[2]));
        const ys=coordinates(previous),nextYs=coordinates(next);
        for(let i=0;i<ys.length;i++)if(Math.abs(nextYs[i]-ys[i])>span/2){
          const offscreen=(y:number)=>y+160<L.top-10||y-160>L.top+height+10;
          assert.ok(offscreen(ys[i])&&offscreen(nextYs[i]),'wrap must not pop a visible shape');
        }
      }
      previous=next;
    }
  }
});

test('reduced motion freezes wind in place and resumes without a jump or reversed drift',()=>{
  const movement=createWindMotion(),weather=wind('active','down');
  stepWindMotion(movement,weather,2,true);
  const before={...movement};
  stepWindMotion(movement,weather,60,false);
  assert.deepEqual(movement,before);
  stepWindMotion(movement,weather,1/60,true);
  assert.ok(movement.travel-before.travel>0&&movement.travel-before.travel<4);
  const turn=movement.travel;
  stepWindMotion(movement,wind('warning','up'),1/60,true);
  assert.ok(movement.travel<turn);
});
