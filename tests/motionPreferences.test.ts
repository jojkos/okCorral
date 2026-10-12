import { test } from 'node:test';
import assert from 'node:assert/strict';

test('motion controls, CSS, OS changes and other tabs share one preference, even with blocked storage',async t=>{
  let blocked=true;
  const saved=new Map<string,string>();
  const document={documentElement:{dataset:{} as Record<string,string>}};
  const systemListeners=new Set<()=>void>();
  const storageListeners=new Set<(event:{key:string|null})=>void>();
  const media={matches:true,addEventListener(_type:string,fn:()=>void){systemListeners.add(fn);},removeEventListener(_type:string,fn:()=>void){systemListeners.delete(fn);}};
  const globals={document,matchMedia:()=>media,
    localStorage:{getItem(key:string){if(blocked)throw new Error('blocked');return saved.get(key)??null;},setItem(key:string,value:string){if(blocked)throw new Error('blocked');saved.set(key,value);},removeItem(key:string){saved.delete(key);}},
    addEventListener(_type:string,fn:(event:{key:string|null})=>void){storageListeners.add(fn);},
    removeEventListener(_type:string,fn:(event:{key:string|null})=>void){storageListeners.delete(fn);},
  };
  for(const [key,value] of Object.entries(globals)){
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else Reflect.deleteProperty(globalThis,key);});
  }
  const motion=await import('../src/lib/motionPreferences');
  assert.equal(motion.reducedMotion(),true,'no stored choice respects the OS');
  let notifications=0;
  const unsubscribe=motion.subscribeMotionPreference(()=>notifications++);
  assert.equal(document.documentElement.dataset.motion,'reduced');
  motion.setMotionPreference('full');
  assert.equal(motion.reducedMotion(),false,'full motion works even if the OS reduces motion and storage is blocked');
  assert.equal(document.documentElement.dataset.motion,'full');
  blocked=false;
  motion.setMotionPreference('reduced');
  assert.equal(saved.get('okCorral-motion'),'reduced');
  saved.set('okCorral-motion','full');
  storageListeners.forEach(fn=>fn({key:'okCorral-motion'}));
  assert.equal(motion.reducedMotion(),false);
  assert.equal(document.documentElement.dataset.motion,'full');
  motion.setMotionPreference('system');
  assert.equal(motion.reducedMotion(),true);
  media.matches=false;systemListeners.forEach(fn=>fn());
  assert.equal(motion.reducedMotion(),false);
  assert.equal(document.documentElement.dataset.motion,'full');
  assert.ok(notifications>=5);
  unsubscribe();
  assert.equal(systemListeners.size,0);assert.equal(storageListeners.size,0);
});
