import assert from 'node:assert/strict';
import { Game,PHYSICS } from '../public/engine.mjs';
import { FINAL_CHUNK_KINDS,FINAL_OPENING_ID,FINAL_PIPE_SPEED,FinalDirector,createFinalChunk,pipePose,pipeShaftLength,flightTarget,chunkOpening } from '../public/difficulty.mjs';
import { postVertices,clipToGround,slabRange } from '../public/pipe-safety.mjs';
import { CAPTURED_FINAL_CHUNKS,FINAL_OPENING_CHUNK } from '../public/final-chunks.mjs';
const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function sequence(kinds,ground=336,entryCenter=ground/2,random=seeded(17)){
  let x=300,entry=entryCenter,entryPort,previousKind;const chunks=[],pipes=[];
  for(const kind of kinds){const chunk=createFinalChunk({x,ground,entryCenter:entry,entryPort,previousKind,referenceBirdX:188,kind,id:chunks.length,random});chunks.push(chunk);pipes.push(...chunk.pipes);x=chunk.nextX;entry=chunk.exitCenter;entryPort=chunk.exitPort;previousKind=kind;}
  return {chunks,pipes,ground,entryCenter};
}
function targetAt(chunks,x,clockX=x){
  const guided=chunks.find(c=>c.guidedEntry&&x>=c.safePath[0][0]&&x<c.startX);
  if(guided)return flightTarget(guided,x,clockX);
  return flightTarget(chunks.find(c=>x<c.endX+20)||chunks.at(-1),x,clockX);
}
function sharedHandoff(left,right,ground){
  const at=right.startX-12,a=chunkOpening(left.pipes,at,ground,left.exitCenter),b=chunkOpening(right.pipes,at,ground,left.exitCenter);
  return Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
}
// Search actual flap/no-flap inputs at 50 ms decision intervals. Every arc is
// integrated at the game's 60 Hz, with at least 200 ms between presses. The beam
// keeps real states (no teleporting, interpolation of states or changed physics).
export function flyPassage(scene,{minFlapInterval=.2,safetyMargin=0}={}){
  const start=scene.chunks[0].startX-140,dt=PHYSICS.step;
  const minFlapFrames=Math.ceil(minFlapInterval/dt);
  const total=Math.ceil((scene.chunks.at(-1).nextX-start)/(FINAL_PIPE_SPEED*dt));
  const limits=[],targets=[];
  for(let frame=0;frame<=total+3;frame++){
    const x=start+frame*FINAL_PIPE_SPEED*dt;let top=12,bottom=scene.ground-12;
    for(const pipe of scene.pipes){
      if(x<pipe.x-120||x>pipe.x+scene.ground+300)continue;
      pipe.referenceBirdX=x;const pose=pipePose(pipe);
      for(const [post,up] of [[pose.top,true],[pose.bottom,false]]){
        const range=slabRange(postVertices(pipe,post,up,pipeShaftLength(pipe,scene.ground,up)),x-12,x+12);
        if(range){if(up)top=Math.max(top,range[1]+12);else bottom=Math.min(bottom,range[0]-12);}
      }
    }
    top+=safetyMargin;bottom-=safetyMargin;
    limits.push([top,bottom]);targets.push(Math.max(top,Math.min(bottom,targetAt(scene.chunks,x))));
  }
  let beam=[{y:scene.entryCenter,vy:0,age:60,flaps:0}];
  for(let frame=0;frame<total;frame+=3){
    const candidates=new Map(),target=targets[frame+3],targetV=(target-targets[frame])/(dt*3);
    for(const state of beam)for(const flap of [false,true]){
      if(flap&&state.age<minFlapFrames)continue;
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
    const a=left===FINAL_OPENING_ID?FINAL_OPENING_CHUNK:CAPTURED_FINAL_CHUNKS.find(c=>c.id===left),b=CAPTURED_FINAL_CHUNKS.find(c=>c.id===right);
    // The director excludes repeats and adjacent matching normal motifs;
    // consecutive rare long sections cannot occur in its schedule either.
    if(left===right||a.rare&&b.rare||!b.rare&&(a.family===b.family||a.motif&&a.motif===b.motif))continue;
    const scene=sequence([left,right]);
    assert.ok(sharedHandoff(...scene.chunks,336)>=80-1e-7,left+' -> '+right+': handoff openings must align with comfortable shared clearance');
    for(const chunk of scene.chunks)assert.ok(chunk.safePath.every((n,i)=>!i||n[0]>chunk.safePath[i-1][0]),'connector route must advance without folded nodes');
    for(const phase of [0,.25,.5,.75,1]){
      const clock=scene.chunks[0].startX+phase*700;
      scene.pipes.forEach(p=>{p.referenceBirdX=clock;});
      const posts=scene.pipes.flatMap(p=>{const pose=pipePose(p);return [[pose.top,true],[pose.bottom,false]].map(([post,up])=>({kind:p.kind,x:p.x,chunk:p.chunkId,up,overlap:p.allowRoofOverlap,gap:p.shaftGap,polygon:clipToGround(postVertices(p,post,up,pipeShaftLength(p,336,up)),336)}));}).filter(p=>p.polygon.some(v=>v[0]>=clock-188)&&p.polygon.some(v=>v[0]<=clock+426.4));
      for(const post of posts.filter(p=>p.up&&p.overlap))assert.ok(posts.filter(p=>p!==post&&p.up&&p.chunk===post.chunk&&overlap(post.polygon,p.polygon)).length<=1,left+' -> '+right+': exit overlaps more than one roof pipe');
      for(let i=0;i<posts.length;i++)for(let j=i+1;j<posts.length;j++){
        if(posts[i].up&&posts[j].up&&posts[i].chunk===posts[j].chunk&&(posts[i].overlap||posts[j].overlap))continue;
        assert.ok(!overlap(posts[i].polygon,posts[j].polygon),left+' -> '+right+': overlapping '+posts[i].kind+' '+posts[i].x+' '+posts[i].up+' / '+posts[j].kind+' '+posts[j].x+' '+posts[j].up);
        assert.ok(distance(posts[i].polygon,posts[j].polygon)>=Math.min(posts[i].gap,posts[j].gap)-.1,left+' -> '+right+': pipes touch instead of leaving the small gap');
      }
    }
    for(let x=scene.chunks[0].startX-20;x<scene.chunks.at(-1).endX+20;x+=6){
      scene.pipes.forEach(p=>{p.referenceBirdX=x;});
      let ceiling=12,floor=324;
      for(const p of scene.pipes){
        const pose=pipePose(p);
        for(const [post,up] of [[pose.top,true],[pose.bottom,false]]){
          const range=slabRange(postVertices(p,post,up,pipeShaftLength(p,336,up)),x-12,x+12);
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
    for(const ground of [336,575]){const result=flyPassage(sequence(order,ground,ground/2,seeded(seed)));assert.ok(result.ok,'seed '+seed+', ground '+ground+': '+JSON.stringify(result));}
  }
  // Reproduce the reported closing-floor -> rising-trio handoff in the actual
  // engine queue. Core movement stays unchanged; visible gates connect heights.
  const game=new Game({width:614.4,height:384,random:()=>.1});
  game.difficulty='final';game.finalQueued=true;game.nextChunkX=300;game.lastExitCenter=168;
  game.finalDirector={next:id=>id?'rising-trio':'rising-floor-interlude'};
  game.appendFinalChunk();const outgoing=game.pipes.slice(),port={...game.lastExitPort},start=game.nextChunkX;
  game.appendFinalChunk();const incoming=game.pipes.filter(p=>p.chunkId===1),bridges=incoming.filter(p=>p.connector),core=incoming.filter(p=>!p.connector);
  assert.equal(bridges.length,2,'two ordinary gates visibly join the high closing gap to the rising trio');
  assert.ok(sharedHandoff({pipes:outgoing,exitCenter:port.center},{pipes:incoming,startX:start},336)>=80);
  const bare=createFinalChunk({x:start,ground:336,entryCenter:port.center,referenceBirdX:188,kind:'rising-trio',random:()=>.1});
  assert.ok(sharedHandoff({pipes:outgoing,exitCenter:port.center},bare,336)<56,'regression reproduces the former pinched handoff');
  for(let i=0;i<core.length;i++){
    assert.deepEqual(core[i].motion,bare.corePipes[i].motion,'joining chunks does not change recorded movement');
    assert.deepEqual(core[i].topRecord,bare.corePipes[i].topRecord);assert.deepEqual(core[i].bottomRecord,bare.corePipes[i].bottomRecord);
  }
  game.resize(288,623);
  assert.ok(game.lastExitPort.center>=game.lastExitPort.top&&game.lastExitPort.center<=game.lastExitPort.bottom,'resize recomputes the queued exit from actual geometry');
  const resizedLeft=game.pipes.filter(p=>p.chunkId===0),resizedRight=game.pipes.filter(p=>p.chunkId===1);
  assert.ok(sharedHandoff({pipes:resizedLeft,exitCenter:port.center+(575-336)/2},{pipes:resizedRight,startX:resizedRight[0].x},575)>=80,'reported handoff remains aligned after resizing');
  // Include extreme entry heights and very tall views in the aperture check.
  for(const ground of [575,960])for(const entry of [100,ground/2,ground-100])for(const left of FINAL_CHUNK_KINDS)for(const right of FINAL_CHUNK_KINDS){
    const a=CAPTURED_FINAL_CHUNKS.find(c=>c.id===left),b=CAPTURED_FINAL_CHUNKS.find(c=>c.id===right);
    if(left===right||a.rare&&b.rare||!b.rare&&(a.family===b.family||a.motif&&a.motif===b.motif))continue;
    const scene=sequence([left,right],ground,entry);
    assert.ok(sharedHandoff(...scene.chunks,ground)>=80-1e-7,'tall-view handoff '+left+' -> '+right+', ground '+ground+', entry '+entry);
  }
  for(const entry of [100,126,210,236]){
    const result=flyPassage(sequence([FINAL_OPENING_ID,'rising-trio','stationary-tunnel'],336,entry));
    assert.ok(result.ok,'classic-to-final entry '+entry+': '+JSON.stringify(result));
  }
  for(const ground of [336,575])for(const entry of [100,ground/2,ground-100]){
    const result=flyPassage(sequence(['tunnel-plunger','stationary-tunnel'],ground,entry),{minFlapInterval:.25});
    assert.ok(result.ok,'elevator tunnel with at least 250 ms between presses, ground '+ground+', entry '+entry+': '+JSON.stringify(result));
  }
  for(const kind of ['diagonal-rise','diagonal-fall','displaced-roof-bank'])for(const profile of [.1,.5,.9])for(const ground of [336,575]){
    const scene=sequence(['stationary-tunnel',kind,'short-low-tunnel'],ground,ground/2,()=>profile);
    const result=flyPassage(scene);
    assert.ok(result.ok,'floor-group variation '+profile+', '+kind+', ground '+ground+': '+JSON.stringify(result));
  }
  // A point-sized route can fit while a real flap strikes the descending roof.
  // Launch near the floor with eight pixels of extra clearance and check the
  // complete upward arc against the actual roof ahead, including its overlay.
  for(const kind of ['stationary-diagonal-tunnel','diagonal-drop-exit','high-diagonal-tunnel'])for(const ground of [336,575])for(const entry of [100,ground/2,ground-100])for(const profile of [.1,.5,.9]){
    const chunk=createFinalChunk({x:300,ground,entryCenter:entry,kind,referenceBirdX:188,random:()=>profile});
    for(let x=chunk.startX;x<chunk.endX-40;x+=4){
      const opening=chunkOpening(chunk.pipes,x,ground);
      if(opening.bottom-opening.top>180)continue;
      let y=opening.bottom-20,vy=PHYSICS.flap;
      for(let frame=1;frame<=18;frame++){
        y+=vy*PHYSICS.step+PHYSICS.gravity*PHYSICS.step**2;vy+=PHYSICS.gravity*PHYSICS.step;
        const roof=chunkOpening(chunk.pipes,x+frame*FINAL_PIPE_SPEED*PHYSICS.step,ground).top;
        assert.ok(y-12-roof>=8,kind+': full flap needs roof headroom at '+x+', ground '+ground+', entry '+entry);
      }
    }
    const scene=sequence(['stationary-tunnel',kind,'short-low-tunnel'],ground,entry,()=>profile);
    const result=flyPassage(scene,{minFlapInterval:.25,safetyMargin:5});
    assert.ok(result.ok,kind+': buffered flight through tunnel and both joins, ground '+ground+', entry '+entry+', profile '+profile+': '+JSON.stringify(result));
  }
  // Exercise every combination of horizontal velocity/height profiles, plus
  // the diagonal cap-length jitter, rather than repeatedly using one layout.
  for(let h=0;h<4;h++)for(let speed=0;speed<3;speed++){
    const values=[(h+.5)/4,(speed+.5)/3],random=()=>values.length?values.shift():.5;
    const result=flyPassage(sequence(['rising-trio-window','left-rush-gates','stationary-diagonal-tunnel','long-dropping-tunnel'],336,168,random));
    assert.ok(result.ok,'rush height '+h+', speed '+speed+': '+JSON.stringify(result));
  }
  for(let h=0;h<4;h++)for(let speed=0;speed<3;speed++)for(const count of [.1,.9])for(const exit of [.1,.9]){
    const values=[(h+.5)/4,(speed+.5)/3,count,exit],random=()=>values.length?values.shift():.5;
    const result=flyPassage(sequence(['stationary-tunnel','short-left-rush-gates','tunnel-plunger'],336,168,random));
    assert.ok(result.ok,'short rush height '+h+', speed '+speed+', count '+count+', exit '+exit+': '+JSON.stringify(result));
  }
  return 'Passages: '+joins+' director-eligible joins share at least 80 native pixels at handoff and remain flyable. The closing-floor regression, tall views, every rush profile and seeded flights pass with original physics.';
}
