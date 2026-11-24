import assert from 'node:assert/strict';
import { PHYSICS } from '../public/engine.mjs';
import { FINAL_CHUNK_KINDS,FINAL_OPENING_ID,FINAL_PIPE_SPEED,FinalDirector,createFinalChunk,pipePose,pipeShaftLength,flightTarget } from '../public/difficulty.mjs';
import { postVertices,clipToGround,slabRange } from '../public/pipe-safety.mjs';
const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function sequence(kinds,ground=336,entryCenter=ground/2){
  let x=300,entry=entryCenter;const chunks=[],pipes=[];
  for(const kind of kinds){const chunk=createFinalChunk({x,ground,entryCenter:entry,referenceBirdX:188,kind,id:chunks.length});chunks.push(chunk);pipes.push(...chunk.pipes);x=chunk.nextX;entry=chunk.exitCenter;}
  return {chunks,pipes,ground,entryCenter};
}
function targetAt(chunks,x,clockX=x){
  return flightTarget(chunks.find(c=>x<c.endX+20)||chunks.at(-1),x,clockX);
}
// Search actual flap/no-flap inputs at 50 ms decision intervals. Every arc is
// integrated at the game's 60 Hz, with at least 200 ms between presses. The beam
// keeps real states (no teleporting, interpolation of states or changed physics).
export function flyPassage(scene){
  const start=scene.chunks[0].startX-140,dt=PHYSICS.step;
  const total=Math.ceil((scene.chunks.at(-1).nextX-start)/(FINAL_PIPE_SPEED*dt));
  const limits=[],targets=[];
  for(let frame=0;frame<=total+3;frame++){
    const x=start+frame*FINAL_PIPE_SPEED*dt;let top=12,bottom=scene.ground-12;
    for(const pipe of scene.pipes){
      if(x<pipe.x-120||x>pipe.x+scene.ground+300)continue;
      pipe.referenceBirdX=x;const pose=pipePose(pipe);
      for(const [post,up] of [[pose.top,true],[pose.bottom,false]]){
        const range=slabRange(postVertices(pipe,post,up,pipeShaftLength(pipe,scene.ground)),x-12,x+12);
        if(range){if(up)top=Math.max(top,range[1]+12);else bottom=Math.min(bottom,range[0]-12);}
      }
    }
    limits.push([top,bottom]);targets.push(targetAt(scene.chunks,x));
  }
  let beam=[{y:scene.entryCenter,vy:0,age:60,flaps:0}];
  for(let frame=0;frame<total;frame+=3){
    const candidates=new Map(),target=targets[frame+3],targetV=(target-targets[frame])/(dt*3);
    for(const state of beam)for(const flap of [false,true]){
      if(flap&&state.age<12)continue;
      let y=state.y,vy=flap?PHYSICS.flap:state.vy,valid=true;
      for(let step=1;step<=3;step++){
        y+=vy*dt+PHYSICS.gravity*dt*dt;vy+=PHYSICS.gravity*dt;
        const [top,bottom]=limits[frame+step];
        if(y<top||y>bottom){valid=false;break;}
      }
      if(!valid)continue;
      const age=flap?3:state.age+3,flaps=state.flaps+Number(flap);
      const cost=(y-target)**2+(vy-targetV)**2*.006+flaps*.01;
      const key=Math.round(y/3)+':'+age;
      if(!candidates.has(key)||candidates.get(key).cost>cost)candidates.set(key,{y,vy,age,flaps,cost});
    }
    beam=[...candidates.values()].sort((a,b)=>a.cost-b.cost).slice(0,64);
    if(!beam.length)return {ok:false,time:frame*dt,x:start+frame*FINAL_PIPE_SPEED*dt,reason:'no viable input sequence'};
  }
  return {ok:true,time:total*dt,flaps:beam[0].flaps};
}
// Separating-axis check uses the rendered solid polygons, including long shafts.
function overlap(a,b){
  if(!a.length||!b.length)return false;
  for(const shape of [a,b])for(let i=0;i<shape.length;i++){
    const p=shape[i],q=shape[(i+1)%shape.length],axis=[q[1]-p[1],p[0]-q[0]];
    if(Math.hypot(...axis)<1e-8)continue;
    const project=poly=>poly.map(v=>v[0]*axis[0]+v[1]*axis[1]),av=project(a),bv=project(b);
    if(Math.min(Math.max(...av),Math.max(...bv))-Math.max(Math.min(...av),Math.min(...bv))<=1e-6)return false;
  }
  return true;
}
function distance(a,b){
  const pointSegment=(p,u,v)=>{
    const dx=v[0]-u[0],dy=v[1]-u[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dy)/length)):0;
    return Math.hypot(p[0]-u[0]-t*dx,p[1]-u[1]-t*dy);
  };
  let minimum=Infinity;
  for(const [points,edges] of [[a,b],[b,a]])for(const p of points)for(let i=0;i<edges.length;i++)minimum=Math.min(minimum,pointSegment(p,edges[i],edges[(i+1)%edges.length]));
  return minimum;
}
export function checkPassages(){
  const kinds=[FINAL_OPENING_ID,...FINAL_CHUNK_KINDS];let joins=0;
  for(const left of kinds)for(const right of FINAL_CHUNK_KINDS){
    const scene=sequence([left,right]);
    for(const phase of [0,.25,.5,.75,1]){
      const clock=scene.chunks[0].startX+phase*700;
      scene.pipes.forEach(p=>{p.referenceBirdX=clock;});
      const posts=scene.pipes.flatMap(p=>{const pose=pipePose(p);return [[pose.top,true],[pose.bottom,false]].map(([post,up])=>({kind:p.kind,x:p.x,chunk:p.chunkId,up,overlap:p.allowRoofOverlap,polygon:clipToGround(postVertices(p,post,up,pipeShaftLength(p,336)),336)}));});
      for(let i=0;i<posts.length;i++)for(let j=i+1;j<posts.length;j++){
        if(posts[i].up&&posts[j].up&&posts[i].chunk===posts[j].chunk&&(posts[i].overlap||posts[j].overlap))continue;
        assert.ok(!overlap(posts[i].polygon,posts[j].polygon),left+' -> '+right+': overlapping '+posts[i].kind+' '+posts[i].x+' '+posts[i].up+' / '+posts[j].kind+' '+posts[j].x+' '+posts[j].up);
        assert.ok(distance(posts[i].polygon,posts[j].polygon)>=2.9,left+' -> '+right+': pipes touch instead of leaving the small gap');
      }
    }
    for(let x=scene.chunks[0].startX-20;x<scene.chunks.at(-1).endX+20;x+=6){
      scene.pipes.forEach(p=>{p.referenceBirdX=x;});
      let ceiling=12,floor=324;
      for(const p of scene.pipes){
        const pose=pipePose(p);
        for(const [post,up] of [[pose.top,true],[pose.bottom,false]]){
          const range=slabRange(postVertices(p,post,up,pipeShaftLength(p,336)),x-12,x+12);
          if(range){if(up)ceiling=Math.max(ceiling,range[1]+12);else floor=Math.min(floor,range[0]-12);}
        }
      }
      assert.ok(floor-ceiling>=32,left+' -> '+right+': insufficient bird-sized clearance at '+x);
    }
    const result=flyPassage(scene);assert.ok(result.ok,left+' -> '+right+' is not flyable: '+JSON.stringify(result));
    joins++;
  }
  for(let seed=1;seed<=12;seed++){
    const random=seeded(seed),director=new FinalDirector(random),order=[director.next(0)];let previousKind=FINAL_OPENING_ID;
    for(let i=0;i<24;i++){
      const chunk=createFinalChunk({x:300,ground:336,random,previousKind,kind:director.next(i+1)});order.push(chunk.kind);previousKind=chunk.kind;
    }
    for(const ground of [336,575]){const result=flyPassage(sequence(order,ground));assert.ok(result.ok,'seed '+seed+', ground '+ground+': '+JSON.stringify(result));}
  }
  for(const entry of [100,126,210,236]){
    const result=flyPassage(sequence([FINAL_OPENING_ID,'rising-trio','reversing-gates'],336,entry));
    assert.ok(result.ok,'classic-to-final entry '+entry+': '+JSON.stringify(result));
  }
  return 'Passages: '+joins+' ordered joins keep usable clearances; only designated upper exits overlap. Scheduled rapid/long sections and seeded portrait/landscape flights pass with original gravity/flaps.';
}
