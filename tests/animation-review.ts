import { animationCases, drawBackground } from './animationCases';
import { reducedMotion, setMotionPreference, subscribeMotionPreference } from '../src/lib/motionPreferences';
import { slotLayout } from '../shared/arenaGeometry';
import { drawStrongWindWeather } from '../src/host/arena/scene';
import { createWindMotion, stepWindMotion } from '../src/host/arena/windMotion';
import { preloadCowboySprites } from '../src/lib/cowboySprites';
import '../src/index.css';

document.body.style.cssText='padding:24px;background:#25231d;color:#ead3b0;font:16px sans-serif';
const root=document.querySelector<HTMLDivElement>('#root')!;
root.innerHTML='<h1 style="font-size:28px">Production animation checks</h1><p id="result" role="status">Checking…</p><button id="motion">Toggle reduced motion</button><label>Case <select id="case"></select></label><p id="wind-readout"></p><canvas aria-label="Animation review" width="1600" height="900" style="width:100%;max-width:1280px"></canvas><ol id="checks"></ol>';
const canvas=root.querySelector('canvas')!,ctx=canvas.getContext('2d',{willReadFrequently:true})!;
const select=root.querySelector<HTMLSelectElement>('#case')!;
const controls=document.createElement('p');
controls.innerHTML='<label><input id="manual" type="checkbox"> Hold a frame</label> <label>Progress <input id="progress" type="range" min="0" max="100" value="100"></label>';
canvas.before(controls);
const manual=root.querySelector<HTMLInputElement>('#manual')!,progress=root.querySelector<HTMLInputElement>('#progress')!;
for(const entry of animationCases)select.add(new Option(entry.name,entry.name));
const bg=new Image();bg.src='/frontier.svg';
const errors:string[]=[];
window.addEventListener('error',event=>{errors.push(event.message);root.querySelector('#result')!.textContent=errors.join(' | ');});
function fingerprint(){const pixels=ctx.getImageData(0,0,1600,900).data;let hash=2166136261;for(let i=0;i<pixels.length;i+=4)hash=Math.imul(hash^pixels[i]^pixels[i+1]^pixels[i+2]^pixels[i+3],16777619);return hash;}
// Run the actual browser canvas, including loaded sprites and production minification.
async function verify(){
  await preloadCowboySprites();
  await Promise.all(['/characters/gunslingers.webp','/characters/gatling-gunner.png','/frontier.svg'].map(src=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error(`Missing ${src}`));img.src=src;})));
  let passed=0;
  for(const entry of animationCases){
    try{
      const hashes:number[]=[];
      for(const progress of [.15,.6]){ctx.clearRect(0,0,1600,900);entry.draw(ctx,progress,true,5);hashes.push(fingerprint());}
      if(hashes[0]===hashes[1])throw new Error('Frames did not change');
      for(const slots of [2,8])for(const progress of [0,.5,1]){ctx.clearRect(0,0,1600,900);entry.draw(ctx,progress,false,slots);}
      passed++;const row=document.createElement('li');row.textContent=`PASS — ${entry.name}`;root.querySelector('#checks')!.append(row);
    }catch(error){errors.push(`${entry.name}: ${error}`);}
  }
  root.querySelector('#result')!.textContent=errors.length?`FAIL: ${errors.join(' | ')}`:`PASS: ${passed}/${animationCases.length} animated cases; all assets loaded; reduced-motion and 2/8-lane checks passed`;
  const windFrame=createWindMotion();let last=performance.now();
  const frame=(now:number)=>{
    ctx.clearRect(0,0,1600,900);drawBackground(ctx,bg,0);
    const entry=animationCases.find(c=>c.name===select.value)!,seconds=(now-last)/1000;last=now;
    if(entry.wind){
      // Real elapsed time, not the looping snapshot progress: this lets QA
      // judge speed and switch warning -> active without resetting positions.
      stepWindMotion(windFrame,entry.wind,seconds>.5||document.hidden?0:seconds,!reducedMotion());
      drawStrongWindWeather(ctx,slotLayout(5),entry.wind,windFrame.travel);
      root.querySelector('#wind-readout')!.textContent=`${entry.wind.direction} · ${entry.wind.phase} · brush ${Math.abs(windFrame.speed).toFixed(0)} px/s · dust ${Math.abs(windFrame.speed*2.4).toFixed(0)} px/s · travel ${windFrame.travel.toFixed(0)} px`;
    }else{
      root.querySelector('#wind-readout')!.textContent='';
      entry.draw(ctx,manual.checked?Number(progress.value)/100:(now%2400)/2400,!reducedMotion(),5);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
root.querySelector('#motion')!.addEventListener('click',()=>setMotionPreference(reducedMotion()?'full':'reduced'));
subscribeMotionPreference(()=>{root.querySelector('#motion')!.textContent=reducedMotion()?'Reduced motion ON':'Full motion ON';});
void verify().catch(error=>{root.querySelector('#result')!.textContent=String(error);});
