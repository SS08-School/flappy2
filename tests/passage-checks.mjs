import assert from 'node:assert/strict';
import { Game,PHYSICS } from '../public/engine.mjs';
import { LEVEL3_CHUNK_KINDS,LEVEL3_OPENING_ID,LEVEL3_PIPE_SPEED,Level3Director,createLevel3Chunk,pipePose,pipeBounds,pipeShaftLength,flightTarget,chunkOpening } from '../public/difficulty.mjs';
import { postVertices,clipToGround,slabRange } from '../public/pipe-safety.mjs';
import { LEVEL3_CHUNKS,LEVEL3_OPENING_CHUNK,ROOF_APPROACH_ID } from '../public/level3-chunks.mjs';
const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function sequence(kinds,ground=336,entryCenter=ground/2,random=seeded(17)){
  let x=300,entry=entryCenter,entryPort,previousKind;const chunks=[],pipes=[];
  for(const kind of kinds){const chunk=createLevel3Chunk({x,ground,entryCenter:entry,entryPort,previousKind,referenceBirdX:188,kind,id:chunks.length,random});chunks.push(chunk);pipes.push(...chunk.pipes);x=chunk.nextX;entry=chunk.exitCenter;entryPort=chunk.exitPort;previousKind=kind;}
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
export function flyPassage(scene,{minFlapInterval=.2,safetyMargin=0,beamWidth=64}={}){
  const start=scene.chunks[0].startX-140,dt=PHYSICS.step;
  const minFlapFrames=Math.ceil(minFlapInterval/dt);
  const total=Math.ceil((scene.chunks.at(-1).nextX-start)/(LEVEL3_PIPE_SPEED*dt));
  const limits=[],targets=[];
  for(let frame=0;frame<=total+3;frame++){
    const x=start+frame*LEVEL3_PIPE_SPEED*dt;let top=12,bottom=scene.ground-12;
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
    beam=[...candidates.values()].sort((a,b)=>a.cost-b.cost).slice(0,beamWidth);
    if(!beam.length)return {ok:false,time:frame*dt,x:start+frame*LEVEL3_PIPE_SPEED*dt,reason:'no viable input sequence'};
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
export function checkChunkContinuity(){
  const fixtures=[['rising-trio','long-low-tunnel'],['short-low-tunnel','long-dropping-tunnel'],
    ['tunnel-plunger','stationary-tunnel'],['long-low-tunnel','rising-trio'],['stationary-tunnel','rising-trio']];
  for(const kinds of fixtures)for(const profile of [.1,.5,.9]){
    const scene=sequence(kinds,336,168,()=>profile),[left,right]=scene.chunks;
    const join=[left.pipes.at(-1),...right.connectors,right.corePipes[0]];
    for(let i=1;i<join.length;i++){
      assert.ok(Math.abs(join[i].x-join[i-1].x-55)<1e-7,
        kinds.join(' -> ')+': boundary and connecting pipes must retain the ordinary tunnel pitch');
    }
    assert.ok(sharedHandoff(left,right,336)>=80-1e-7,'compact joins preserve aligned flight openings');
    const result=flyPassage(scene,{minFlapInterval:.25,safetyMargin:3});
    assert.ok(result.ok,kinds.join(' -> ')+': compact transition stays realistically flyable: '+JSON.stringify(result));
  }
  // Exercise the production queue as well as the chunk factory. Scrolling
  // and a live change of framing must not reopen the reported visible seam.
  for(const width of [240,288,614.4]){
    const game=new Game({width,random:()=>.5});
    game.difficulty=3;game.level3Queued=true;game.nextChunkX=300;game.lastExitCenter=168;
    game.level3Director={next:id=>id?'long-low-tunnel':'rising-trio'};
    game.appendLevel3Chunk();game.appendLevel3Chunk();
    const before=game.pipes.filter(p=>p.chunkId===0).at(-1),after=game.pipes.find(p=>p.chunkId===1);
    assert.ok(Math.abs(after.x-before.x-55)<1e-7,'engine queue preserves the same small pipe gap across chunks');
    game.resize(width===240?614.4:240,384);
    assert.ok(Math.abs(after.x-before.x-55)<1e-7,'changing framing does not change the join');
  }
  return 'Chunk continuity: ordinary three-pixel gaps extend through tunnel boundaries and height connectors; buffered flights and the live engine queue pass across screen widths.';
}
export function checkWindingTunnels(){
  const kinds=['stepped-roof-tunnel','floor-valley-tunnel','long-dropping-tunnel','long-low-tunnel'];
  for(const kind of kinds){
    const profiles=new Set(),directions=new Set(),long=kind.startsWith('long-');
    for(const profile of [.1,.35,.6,.85])for(const depth of [0,.5,1])for(const ground of [336,575]){
      const values=[profile,depth],random=()=>values.length?values.shift():.5;
      const chunk=createLevel3Chunk({x:300,ground,entryCenter:168+(ground-336)/2,referenceBirdX:188,kind,random});
      const bank=chunk.corePipes.slice(0,long?9:5),poses=bank.map(p=>pipePose(p));
      const ys=poses.map(p=>p.center),range=Math.max(...ys)-Math.min(...ys);
      assert.equal(chunk.corePipes.length,long?10:5,'variation keeps the existing section length');
      assert.ok(Math.abs(bank.at(-1).x-bank[0].x+52-(long?492:272))<1e-7,'main tunnel keeps its authored footprint');
      assert.ok(range>=(long?74:34),'each varied tunnel has a real dip or climb');
      assert.ok(ys.some((y,i)=>i&&y>ys[i-1])&&ys.some((y,i)=>i&&y<ys[i-1]),'each route changes direction, rather than drifting in a straight line');
      const changes=ys.slice(1).map((y,i)=>Math.abs(y-ys[i]));
      assert.ok(Math.max(...changes)>=28,'routes include a pronounced drop or climb');
      assert.ok(Math.min(...changes)<17,'larger turns are broken up by small uneven changes');
      for(const change of changes)assert.ok(change<=36,'larger bends retain enough shared aperture for a full-sized bird');
      for(const pose of poses)assert.ok(pose.bottom.y-pose.top.y>=108-1e-7,'height fitting retains the opening throughout the bend');
      if(long){
        const shared=Math.min(...poses.map(p=>p.bottom.y))-Math.max(...poses.map(p=>p.top.y));
        assert.ok(shared<54,'long sections do not leave a full-flap-sized straight corridor through every bend');
      }
      profiles.add(ys.map(y=>(y-ys[0]).toFixed(3)).join(','));
      directions.add(Math.sign(ys.find(y=>Math.abs(y-ys[0])>1)-ys[0]));
      const samples=[profile,depth],scene=sequence(['stationary-tunnel',kind,'short-low-tunnel'],ground,ground/2,()=>samples.length?samples.shift():.5);
      const result=flyPassage(scene,{minFlapInterval:.25,safetyMargin:3,beamWidth:128});
      assert.ok(result.ok,kind+', profile '+profile+', depth '+depth+', ground '+ground+': '+JSON.stringify(result));
    }
    assert.ok(profiles.size>=8,'shape and depth choices produce varied tunnel routes');
    assert.equal(directions.size,2,'both dip-first and climb-first routes are available');
  }
  // Entrance height guides must move with the section, without holding a
  // convoy still or letting faster gates collide with the guide ahead.
  const rushSamples=[.5,.5,.35];
  const rush=sequence(['stepped-roof-tunnel','left-rush-gates'],336,100,()=>rushSamples.length?rushSamples.shift():.5).chunks[1];
  const prefix=rush.connectors.at(-1);
  assert.ok(prefix,'regression includes the entrance connector');
  assert.equal(rush.corePipes[0].x-prefix.x,78,'moving guides replace the empty approach rather than adding another spawn gap');
  for(let x=rush.startX-500;x<rush.nextX+600;x+=4){
    for(const pipe of rush.corePipes){
      const pose=pipePose({...pipe,referenceBirdX:x});
      const front=pipePose({...prefix,referenceBirdX:x});
      assert.ok(pipe.x+pose.top.x-prefix.x-front.top.x-prefix.width>=24-1e-7,'rushing gates stay physically clear of their moving guides');
      if(!pipe.motion.hold && pipe.x+pose.top.x-x<=426.48){
        const dt=.01,next=pipePose({...pipe,x:pipe.x-118*dt,referenceBirdX:x});
        assert.ok(pipe.x-118*dt+next.top.x<pipe.x+pose.top.x-118*dt,'ordinary gates keep their extra left motion before and after passing the bird');
      }
    }
  }
  return 'Winding tunnels: four up/down profiles with randomized depths retain their lengths, aligned walls and buffered flight paths; accelerated entrances remain separated.';
}
export function checkRoofApproach(){
  let roofs=0;
  for(let seed=1;seed<=12;seed++){
    const director=new Level3Director(seeded(seed));let previous;
    for(let id=0;id<150;id++){
      const kind=director.next(id),roof=LEVEL3_CHUNKS.find(c=>c.id===kind)?.motif==='floor-bank';
      if(roof){assert.equal(previous,ROOF_APPROACH_ID,'every selected roof has its descending approach');roofs++;}
      if(previous===ROOF_APPROACH_ID)assert.ok(roof,'the approach leads immediately into its reserved roof');
      previous=kind;
    }
  }
  assert.ok(roofs>30,'the scheduling check exercises repeated roof selections');
  for(const kind of ['diagonal-rise','diagonal-fall','displaced-roof-bank'])for(const profile of [.1,.5,.9])for(const ground of [336,575])for(const entry of [100,ground/2,ground-100]){
    const scene=sequence(['stationary-tunnel',ROOF_APPROACH_ID,kind,'short-low-tunnel'],ground,entry,()=>profile);
    const approach=scene.chunks[1],roof=scene.chunks[2],bank=approach.corePipes,poses=bank.map(p=>pipePose(p));
    assert.equal(bank.length,6,'descending lead-in stays compact');
    assert.equal(roof.connectors.length,0,'the low corridor joins the moving roof directly');
    assert.ok(Math.abs(poses.at(-1).center-poses[0].center-70)<1e-7,'approach guides the bird seventy pixels downward');
    for(let i=0;i<bank.length;i++){
      assert.ok(Math.abs(poses[i].bottom.y-poses[i].top.y-112)<1e-7,'approach stays narrow and enclosed');
      if(i){assert.ok(poses[i].center>poses[i-1].center,'corridor descends continuously');assert.equal(bank[i].x-bank[i-1].x,55);}
    }
    // Compare the roof with the standalone formation at matching clocks:
    // the new setup cannot alter its geometry, fitting or movement profiles.
    const original=createLevel3Chunk({x:roof.coreStartX,ground,entryCenter:168+(ground-336)/2,referenceBirdX:188,kind,random:()=>profile});
    for(let i=0;i<roof.corePipes.length;i++){
      const pipe=roof.corePipes[i],bare=original.corePipes[i];
      assert.deepEqual(pipe.bottomMotion,bare.bottomMotion,'roof movement remains unchanged');
      assert.deepEqual(pipe.topRecord,bare.topRecord);assert.deepEqual(pipe.bottomRecord,bare.bottomRecord);
      for(const time of [-3,-1,0,1,2,4,6]){
        const clock=pipe.x-pipe.chunkOffset+26+time*LEVEL3_PIPE_SPEED;
        assert.deepEqual(pipePose({...pipe,referenceBirdX:clock}),pipePose({...bare,referenceBirdX:clock}),'roof has identical poses throughout the full rise and return');
      }
    }
    if(ground===336){
      let firstEdge=Infinity;
      for(const time of [-3,-1,0,1,2,4,6])for(const pipe of roof.corePipes){
        const clock=pipe.x-pipe.chunkOffset+26+time*LEVEL3_PIPE_SPEED;
        firstEdge=Math.min(firstEdge,pipeBounds({...pipe,referenceBirdX:clock},ground).minX);
      }
      assert.ok(firstEdge-approach.endX>=3,'the release never overlaps the descending corridor');
      assert.ok(firstEdge-approach.endX<40,'the release stays short instead of leaving a chunk-sized empty gap');
    }
    const result=flyPassage(scene,{minFlapInterval:.25,safetyMargin:3,beamWidth:128});
    assert.ok(result.ok,'descending roof approach '+kind+', profile '+profile+', ground '+ground+', entry '+entry+': '+JSON.stringify(result));
  }
  return 'Roof approaches: guaranteed descending enclosed setup, direct low handoff, unchanged roof poses and buffered flights through every roof profile passed.';
}
export function checkPassages(){
  const kinds=[LEVEL3_OPENING_ID,...LEVEL3_CHUNK_KINDS];let joins=0;
  for(const left of kinds)for(const right of LEVEL3_CHUNK_KINDS){
    const a=left===LEVEL3_OPENING_ID?LEVEL3_OPENING_CHUNK:LEVEL3_CHUNKS.find(c=>c.id===left),b=LEVEL3_CHUNKS.find(c=>c.id===right);
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
    const random=seeded(seed),director=new Level3Director(random),order=[director.next(0)];let previousKind=LEVEL3_OPENING_ID;
    for(let i=0;i<24;i++){
      const chunk=createLevel3Chunk({x:300,ground:336,random,previousKind,kind:director.next(i+1)});order.push(chunk.kind);previousKind=chunk.kind;
    }
    for(const ground of [336,575]){const result=flyPassage(sequence(order,ground,ground/2,seeded(seed)));assert.ok(result.ok,'seed '+seed+', ground '+ground+': '+JSON.stringify(result));}
  }
  // Reproduce the reported closing-floor -> rising-trio handoff in the actual
  // engine queue. Core movement stays unchanged; visible gates connect heights.
  const game=new Game({width:614.4,height:384,random:()=>.1});
  game.difficulty=3;game.level3Queued=true;game.nextChunkX=300;game.lastExitCenter=168;
  game.level3Director={next:id=>id?'rising-trio':'rising-floor-interlude'};
  game.appendLevel3Chunk();const outgoing=game.pipes.slice(),port={...game.lastExitPort},start=game.nextChunkX;
  game.appendLevel3Chunk();const incoming=game.pipes.filter(p=>p.chunkId===1),bridges=incoming.filter(p=>p.connector),core=incoming.filter(p=>!p.connector);
  assert.equal(bridges.length,2,'two ordinary gates visibly join the high closing gap to the rising trio');
  assert.ok(sharedHandoff({pipes:outgoing,exitCenter:port.center},{pipes:incoming,startX:start},336)>=80);
  const bare=createLevel3Chunk({x:start,ground:336,entryCenter:port.center,referenceBirdX:188,kind:'rising-trio',random:()=>.1});
  assert.ok(sharedHandoff({pipes:outgoing,exitCenter:port.center},bare,336)<56,'regression reproduces the former pinched handoff');
  for(let i=0;i<core.length;i++){
    assert.deepEqual(core[i].motion,bare.corePipes[i].motion,'joining chunks does not change recorded movement');
    assert.deepEqual(core[i].topRecord,bare.corePipes[i].topRecord);assert.deepEqual(core[i].bottomRecord,bare.corePipes[i].bottomRecord);
  }
  game.resize(288,623);
  assert.ok(game.lastExitPort.center>=game.lastExitPort.top&&game.lastExitPort.center<=game.lastExitPort.bottom,'resize recomputes the queued exit from actual geometry');
  const resizedLeft=game.pipes.filter(p=>p.chunkId===0),resizedRight=game.pipes.filter(p=>p.chunkId===1);
  assert.ok(sharedHandoff({pipes:resizedLeft,exitCenter:port.center},{pipes:resizedRight,startX:resizedRight[0].x},336)>=80,'reported handoff remains aligned after resizing');
  // Include extreme entry heights and very tall views in the aperture check.
  for(const ground of [575,960])for(const entry of [100,ground/2,ground-100])for(const left of LEVEL3_CHUNK_KINDS)for(const right of LEVEL3_CHUNK_KINDS){
    const a=LEVEL3_CHUNKS.find(c=>c.id===left),b=LEVEL3_CHUNKS.find(c=>c.id===right);
    if(left===right||a.rare&&b.rare||!b.rare&&(a.family===b.family||a.motif&&a.motif===b.motif))continue;
    const scene=sequence([left,right],ground,entry);
    assert.ok(sharedHandoff(...scene.chunks,ground)>=80-1e-7,'tall-view handoff '+left+' -> '+right+', ground '+ground+', entry '+entry);
  }
  for(const entry of [100,126,210,236]){
    const result=flyPassage(sequence([LEVEL3_OPENING_ID,'rising-trio','stationary-tunnel'],336,entry));
    assert.ok(result.ok,'classic-to-level-3 entry '+entry+': '+JSON.stringify(result));
  }
  for(const ground of [336,575])for(const entry of [100,ground/2,ground-100]){
    const result=flyPassage(sequence(['tunnel-plunger','stationary-tunnel'],ground,entry),{minFlapInterval:.3,safetyMargin:5});
    assert.ok(result.ok,'elevator tunnel with at least 300 ms between presses and five pixels of spare clearance, ground '+ground+', entry '+entry+': '+JSON.stringify(result));
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
    const chunk=createLevel3Chunk({x:300,ground,entryCenter:entry,kind,referenceBirdX:188,random:()=>profile});
    for(let x=chunk.startX;x<chunk.endX-40;x+=4){
      const opening=chunkOpening(chunk.pipes,x,ground);
      if(opening.bottom-opening.top>180)continue;
      let y=opening.bottom-20,vy=PHYSICS.flap;
      for(let frame=1;frame<=18;frame++){
        y+=vy*PHYSICS.step+PHYSICS.gravity*PHYSICS.step**2;vy+=PHYSICS.gravity*PHYSICS.step;
        const roof=chunkOpening(chunk.pipes,x+frame*LEVEL3_PIPE_SPEED*PHYSICS.step,ground).top;
        assert.ok(y-12-roof>=8,kind+': full flap needs roof headroom at '+x+', ground '+ground+', entry '+entry);
      }
    }
    const scene=sequence(['stationary-tunnel',kind,'short-low-tunnel'],ground,entry,()=>profile);
    // Keep more candidate input phases through the tight tunnel: a valid
    // exit arc can rank behind the centerline-biased beam before the turn.
    const result=flyPassage(scene,{minFlapInterval:.25,safetyMargin:5,beamWidth:128});
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
