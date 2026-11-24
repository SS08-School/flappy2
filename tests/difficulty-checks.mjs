import assert from 'node:assert/strict';
import { Game,PHYSICS } from '../public/engine.mjs';
import { FINAL_TEST_SCORE,FINAL_PIPE_SPEED,FINAL_OPENING_ID,FINAL_CHUNK_KINDS,FinalDirector,createFinalChunk,pipePose,pipeMotion,finalPipeHits,pipeBounds,pipeScoreX,triangle } from '../public/difficulty.mjs';
import { CAPTURED_FINAL_CHUNKS } from '../public/final-chunks.mjs';
import { createClient } from './client-checks.mjs';
const seeded=(seed=17)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function chunkOfKind(kind,options={}){return createFinalChunk({x:614.4,ground:336,referenceBirdX:188,kind,...options});}
function atTime(pipe,time){pipe.referenceBirdX=pipe.x-pipe.chunkOffset+26+time*FINAL_PIPE_SPEED;return pipePose(pipe);}
export function checkDifficulty(){
  assert.equal(FINAL_TEST_SCORE,5);assert.equal(FINAL_PIPE_SPEED,118);
  const events=[],game=new Game({width:614.4,height:384,random:()=>.5,onEvent:(type,data)=>events.push({type,data})});
  game.start();assert.equal(game.difficulty,1);assert.equal(game.speed,120);
  let lastClassic,firstFinal;
  for(let i=0;i<540;i++){
    game.bird.y=168;game.bird.vy=0;game.update(PHYSICS.step);
    if(game.finalQueued&&!firstFinal){
      assert.ok(game.score<5);lastClassic=game.pipes.filter(p=>p.level===1).at(-1);firstFinal=game.pipes.find(p=>p.level==='final');
      assert.equal(firstFinal.kind,FINAL_OPENING_ID);assert.ok(firstFinal.motion);
      assert.equal(game.classicSpawned,5);
      assert.ok(Math.abs(firstFinal.x-lastClassic.x-156)<1e-8,'no added gap at the level switch');
      for(const p of game.pipes.filter(p=>p.level==='final'))assert.ok(pipeBounds(p,game.ground).minX>=game.width-1e-8,'queue entire sections offscreen');
    }
    if(firstFinal)assert.ok(Math.abs(firstFinal.x-lastClassic.x-156)<1e-7);
  }
  assert.equal(game.score,5);assert.equal(game.difficulty,'final');assert.equal(game.speed,118);
  assert.equal(events.filter(e=>e.type==='difficulty').length,1);
  const before=game.pipes.map(p=>[p.x,pipePose(p)]);game.hit();game.update(.1);
  assert.deepEqual(game.pipes.map(p=>[p.x,pipePose(p)]),before,'all motion freezes on hit');
  game.start();assert.equal(game.difficulty,1);assert.equal(game.finalQueued,false);
  const seen=new Set(),random=seeded();let previousKind,previousFamily;
  for(let i=0;i<200;i++){
    const chunk=createFinalChunk({x:614.4,ground:336,referenceBirdX:188,random,previousKind});
    assert.notEqual(chunk.kind,previousKind);seen.add(chunk.kind);
    if(['tunnel','rising','diagonal'].includes(previousFamily))assert.notEqual(chunk.family,previousFamily,'a dense section cannot chain directly into more of the same tunnel');
    const source=CAPTURED_FINAL_CHUNKS.find(c=>c.id===chunk.kind);
    assert.equal(chunk.pipes.length,chunk.layout.length);
    chunk.pipes.forEach((p,j)=>{
      assert.equal(p.width,52);
      const expectedX=614.4+chunk.layout[j].dx+(source.entryInset||0);
      if(!chunk.layout[j].afterFloor)assert.equal(p.x,expectedX);
      assert.deepEqual(p.topRecord,chunk.layout[j].top);assert.deepEqual(p.bottomRecord,chunk.layout[j].bottom);
      assert.ok(pipeBounds(p,336).minX>=614.4-1e-8);
      const bank=chunk.pipes.find(q=>q.safetyGroup===p.safetyGroup);
      assert.equal(p.upperRetraction,bank.upperRetraction,'each roof bank stays aligned');
      assert.equal(p.lowerRetraction,bank.lowerRetraction,'each floor bank stays aligned');
    });
    assert.ok(chunk.nextX-chunk.endX>=3-1e-7&&chunk.nextX-chunk.endX<=24+1e-7,'sections meet without large empty padding');
    previousKind=chunk.kind;previousFamily=chunk.family;
  }
  assert.equal(seen.size,CAPTURED_FINAL_CHUNKS.filter(c=>!c.rare).length);
  const director=new FinalDirector(seeded()),rapid=[],long=[],history=[];
  for(let id=0;id<120;id++){
    const kind=director.next(id);
    assert.ok(!history.slice(-5).includes(kind),'no formation repeats within five chunks');history.push(kind);
    if(id<5)assert.notEqual(kind,'left-rush-gates','only horizontal rushes are excluded from the first five');
    if(id===0)assert.equal(kind,FINAL_OPENING_ID);
    if(kind?.startsWith('rapid-gates-'))rapid.push(id);
    if(kind?.startsWith('long-'))long.push(id);
  }
  assert.ok(rapid.length>=10&&long.length>=6&&long.length<=12);
  for(let i=1;i<rapid.length;i++)assert.ok(rapid[i]-rapid[i-1]>=8&&rapid[i]-rapid[i-1]<=10,'rapid sets recur every 8–10 chunks');
  for(const count of [2,3])assert.equal(chunkOfKind('rapid-gates-'+count).pipes.length,count);
  for(const kind of ['long-dropping-tunnel','long-low-tunnel']){
    const tunnel=chunkOfKind(kind);
    assert.equal(tunnel.pipes.length,9);assert.ok(tunnel.pipes.at(-1).allowRoofOverlap);
    assert.ok(tunnel.exitCenter>tunnel.safePath[1][1]+35,'long tunnel ends through a lower opening');
  }
  const flat=chunkOfKind('stationary-tunnel');assert.equal(flat.pipes.length,5);
  assert.equal(flat.pipes.at(-1).x-flat.pipes[0].x+52,272,'five columns with small visible gaps, not a concatenated tunnel');
  for(const p of flat.pipes){assert.equal(p.motion,undefined);assert.deepEqual(atTime(p,0),atTime(p,20));}
  const rising=chunkOfKind('rising-trio');assert.equal(rising.pipes.length,5);
  const initial=rising.pipes.slice(0,3).map(p=>atTime(p,0)),later=rising.pipes.slice(0,3).map(p=>atTime(p,1));
  assert.ok(later.every((p,i)=>p.bottom.y<initial[i].bottom.y&&p.top.y<initial[i].top.y),'three complete pairs rise together');
  assert.ok(pipePose(rising.pipes[3]).center>initial[0].center+30,'rising group leads directly into a low opening');
  for(const kind of ['diagonal-rise','diagonal-fall']){
    const chunk=chunkOfKind(kind),bank={pipes:chunk.pipes.slice(0,6)};
    const roof=bank.pipes.map(p=>atTime(p,0).top);
    assert.ok(new Set(roof.map(p=>p.y)).size>=3,'fixed roof has staggered cap lengths');
    for(const p of bank.pipes){assert.equal(p.top.angle,Math.PI/4);assert.equal(p.bottom.angle,-Math.PI/4);}
    for(let time=0;time<6;time+=.13){
      const shifts=bank.pipes.map((p,i)=>{assert.deepEqual(atTime(p,time).top,roof[i],'diagonal roof never moves');return pipeMotion(p,0,'bottom').y;});
      assert.ok(Math.abs(shifts[0]-shifts[1])<1e-8&&Math.abs(shifts[1]-shifts[2])<1e-8&&Math.abs(shifts[3]-shifts[5])<1e-8,'each three-pipe floor group stays synchronized');
    }
    assert.notEqual(bank.pipes[0].bottomMotion.period,bank.pipes[3].bottomMotion.period,'neighboring groups move at different speeds');
    atTime(bank.pipes[0],.1);atTime(bank.pipes[3],.1);
    assert.ok(Math.abs(pipeMotion(bank.pipes[0],0,'bottom').y-pipeMotion(bank.pipes[3],0,'bottom').y)>1,'groups do not move as one oversized opening');
    const p=bank.pipes[0],post=pipePose(p).top;
    assert.ok(finalPipeHits(p,{x:p.x+26+post.x+Math.sin(post.angle)*4,y:post.y-Math.cos(post.angle)*4,radius:12},336));
  }
  const connected=chunkOfKind('diagonal-fall');assert.ok(connected.pipes.at(-1).motion,'diagonal passage leads directly into a moving gate');
  const shutter=chunkOfKind('reversing-gates').pipes[0],m=shutter.motion;
  const turn=(.5-m.phase)*m.period,epsilon=.001;
  const left=(triangle(turn,m.period,m.phase)-triangle(turn-epsilon,m.period,m.phase))/epsilon;
  const right=(triangle(turn+epsilon,m.period,m.phase)-triangle(turn,m.period,m.phase))/epsilon;
  assert.ok(Math.abs(left-4/m.period)<1e-7&&Math.abs(right+4/m.period)<1e-7,'instant reversal, no slowdown');
  for(let t=-2;t<2;t+=.01){assert.ok(Math.abs(atTime(shutter,t).top.y-atTime(shutter,t+m.period).top.y)<1e-7);}
  const rush=chunkOfKind('left-rush-gates'),p=rush.pipes[0];
  p.referenceBirdX=p.x-400;assert.ok(pipeMotion(p).x<0,'extra movement is already active on approach');
  assert.ok(pipeScoreX(p)<p.x+13,'points follow the actual moving gate');
  const contacts=[];
  for(const gate of rush.pipes){
    const contact=(146-12)/(118+gate.motion.speed);contacts.push(contact);
    assert.ok(contact<(146-12)/118,'continuous approach is faster than normal travel');
    for(const width of [288,512,614.4]){
      const run=new Game({width,height:384}),birdX=run.bird.x;
      const nominal=12+gate.motion.speed*gate.motion.trigger/118;
      const atContact=nominal/(1+gate.motion.speed/118);
      const sample={...gate,x:birdX+atContact,referenceBirdX:birdX};
      const leading=sample.x+pipePose(sample).top.x;
      assert.ok(Math.abs(leading-birdX-12)<1e-8,'contact timing follows actual bird position at every aspect ratio');
      const before=pipePose({...sample,x:sample.x+118*.01}).top.x;
      const after=pipePose({...sample,x:sample.x-118*.01}).top.x;
      assert.ok(Math.abs((before-after)/.02-gate.motion.speed)<1e-7,'gate remains accelerated as it reaches the bird');
      for(const actualBird of [birdX,width/2]){
        const edgeDistance=width-actualBird;
        const atEdge=(edgeDistance+gate.motion.speed*gate.motion.trigger/118)/(1+gate.motion.speed/118);
        const edge={...gate,x:actualBird+atEdge,referenceBirdX:actualBird};
        assert.ok(pipeMotion(edge).x<0,'gate is already moving extra when it first appears, including a centered bird');
      }
    }
  }
  assert.ok(new Set(contacts).size>1,'approach speeds differ within a set');
  assert.ok(new Set(rush.pipes.map(p=>p.bottomRecord[1])).size===3,'rush openings have different heights');
  for(const gate of rush.pipes){
    const a=pipeMotion({...gate,x:-200,referenceBirdX:188}).x,b=pipeMotion({...gate,x:-200-118*.02,referenceBirdX:188}).x;
    assert.ok(Math.abs((a-b)/.02-gate.motion.speed)<1e-7,'extra movement continues after leaving the left edge');
  }
  let baseline;
  for(const fps of [30,60,144,240]){
    const run=new Game({width:614.4,height:384,random:seeded()});run.start();run.score=5;run.activateFinal();
    let remaining=1.6;while(remaining>1e-10){const dt=Math.min(remaining,1/fps);run.bird.y=168;run.bird.vy=0;run.update(dt);remaining-=dt;}
    assert.equal(run.state,'playing');const sample=run.pipes.map(p=>[p.x,p.center].map(v=>Number(v.toFixed(6))));baseline ||= sample;assert.deepEqual(sample,baseline);
  }
  const resized=new Game({width:614.4,height:384});resized.start();resized.score=5;resized.activateFinal();
  resized.pipes=chunkOfKind('reversing-gates',{x:300,referenceBirdX:resized.bird.x}).pipes;
  const recorded=resized.pipes[0],old=pipePose(recorded),distance=recorded.x-resized.bird.x;resized.resize(288,623);
  assert.ok(Math.abs(recorded.x-resized.bird.x-distance)<1e-8);
  assert.ok(Math.abs(pipePose(recorded).top.y-old.top.y-(623-384)/2)<1e-8);
  return 'Final: connected formations, staggered roofs, displaced floor groups, scheduled rapid sets, rare long drop exits, continuously moving bird-relative approaches and FPS consistency passed.';
}
export async function checkFinalClient(){
  const c=await createClient({width:1228.8,height:768});c.controller.prepareRun();c.controller.flap();
  const game=c.controller.game;game.score=5;game.activateFinal();game.pipes=chunkOfKind('diagonal-rise',{x:100,referenceBirdX:game.bird.x}).pipes;c.tick(1/240);
  const commands=c.elements.get('game').context.commands.filter(c=>c.kind==='image'&&[112,168].includes(c.args[0])&&c.args[1]>=646);
  assert.ok(commands.some(c=>c.matrix[1]>.1)&&commands.some(c=>c.matrix[1]<-.1));
  assert.ok(c.images.every(path=>path==='/assets/flappy/official-v1.3.png'));
  assert.equal(c.elements.get('play-controls').hidden,true);
  return 'Final client: opposite clean pipe orientations and official artwork only passed.';
}
export function checkFloorVisibility(){
  const visible=(pipe,ground)=>{
    const pose=pipePose(pipe),post=pose.bottom,co=Math.cos(post.angle),si=Math.sin(post.angle);
    const corners=[[-26,0],[26,0],[26,26],[-26,26]].map(([x,y])=>post.y+x*si+y*co);
    const remaining=ground-Math.max(...corners),shaft=pipe.lowDip?2:24;
    assert.ok(remaining>=shaft*co-1e-7,pipe.kind+': lower cap or minimum shaft is submerged');
    if(post.angle===0&&pose.top.angle===0)assert.ok(post.y-pose.top.y>=100-1e-7,'raised floors retain at least the original gate opening');
  };
  for(const ground of [336,575,960])for(const entryCenter of [100,ground/2,ground-100]){
    for(const kind of [FINAL_OPENING_ID,...FINAL_CHUNK_KINDS]){
      const chunk=chunkOfKind(kind,{ground,entryCenter});
      for(let time=0;time<8;time+=.037)for(const pipe of chunk.pipes){atTime(pipe,time);visible(pipe,ground);}
    }
  }
  const resized=new Game({width:288,height:1008});resized.start();resized.score=5;resized.activateFinal();
  resized.pipes=chunkOfKind('rapid-gates-3',{ground:960,entryCenter:800}).pipes;
  resized.resize(614.4,384);
  for(let time=0;time<3;time+=.017)for(const pipe of resized.pipes){atTime(pipe,time);visible(pipe,resized.ground);}
  const moving=chunkOfKind('rapid-gates-3',{entryCenter:236}).pipes.at(-1),motion=moving.motion;
  const a=atTime(moving,.01).bottom.y,b=atTime(moving,.02).bottom.y;
  assert.ok(Math.abs(Math.abs(b-a)/.01-4*motion.amplitude/motion.period)<1e-7,'ground limit shifts the baseline without flattening the fast cycle');
  return 'Pipe exposure: ordinary caps retain 24 native shaft pixels; rapid caps remain fully visible across complete cycles, entry heights and live portrait-to-landscape resizing.';
}
