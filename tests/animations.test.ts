import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animationCases, wind } from './animationCases';
import { drawStrongWindWeather } from '../src/host/arena/scene';
import { slotLayout } from '../shared/arenaGeometry';
import { resolveReducedMotion } from '../src/lib/motionPreferences';

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
    assert.ok(frame.calls.length>0);
  }
});

test('wind is visible in both phases and directions, moves over time, and stays visible with reduced motion',()=>{
  for(const phase of ['warning','active'] as const)for(const direction of ['up','down'] as const){
    const capture=(time:number,motion:boolean)=>{const frame=context();drawStrongWindWeather(frame.ctx,slotLayout(5),wind(phase,direction),time,motion);frame.balanced();return frame.calls;};
    assert.ok(capture(2,true).filter(c=>c[0]==='stroke').length>30);
    assert.notDeepEqual(capture(2,true),capture(3,true));
    assert.deepEqual(capture(2,false),capture(3,false));
  }
  const calm=context();drawStrongWindWeather(calm.ctx,slotLayout(5),wind('calm','down'),1,true);assert.equal(calm.calls.length,0);
});
