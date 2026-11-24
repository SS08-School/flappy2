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
      if(!chunk.layout[j].afterFloor&&!chunk.layout[j].overlayAfter)assert.ok(Math.abs(p.x-expectedX)<1e-8);
      if(!chunk.layout[j].joinFloor)assert.deepEqual(p.topRecord,chunk.layout[j].top);
      assert.deepEqual(p.bottomRecord,chunk.layout[j].bottom);
      assert.ok(pipeBounds(p,336).minX>=614.4-1e-8);
      const bank=chunk.pipes.find(q=>q.safetyGroup===p.safetyGroup);
      assert.equal(p.upperRetraction,bank.upperRetraction,'each roof bank stays aligned');
      assert.equal(p.lowerRetraction,bank.lowerRetraction,'each floor bank stays aligned');
    });
    assert.ok(chunk.nextX-chunk.endX>=3-1e-7&&chunk.nextX-chunk.endX<=24+1e-7,'sections meet without large empty padding');
    previousKind=chunk.kind;previousFamily=chunk.family;
  }
  assert.equal(seen.size,CAPTURED_FINAL_CHUNKS.filter(c=>!c.rare).length);
  const director=new FinalDirector(seeded()),rapid=[],long=[],history=[],descents=[];
  for(let id=0;id<120;id++){
    const kind=director.next(id);
    assert.ok(!history.slice(-5).includes(kind),'no formation repeats within five chunks');history.push(kind);
    if(id<5)assert.notEqual(kind,'left-rush-gates','only horizontal rushes are excluded from the first five');
    if(id===0)assert.equal(kind,FINAL_OPENING_ID);
    if(kind==='descending-pursuit'){
      assert.ok(id>=5,'fast descent cannot appear in the first five chunks');
      if(descents.length)assert.ok(id-descents.at(-1)>=8,'seven intervening chunks before another fast descent');
      descents.push(id);
    }
    if(kind?.startsWith('rapid-gates-'))rapid.push(id);
    if(kind?.startsWith('long-'))long.push(id);
  }
  assert.equal(rapid.length,0,'rapid reversing formations are disabled');
  assert.ok(descents.length>=2,'fast downward passage remains available in random runs');
  assert.ok(long.length>=6&&long.length<=12);
  assert.ok(CAPTURED_FINAL_CHUNKS.every(c=>!c.id.includes('rapid')&&!c.id.includes('reversing')));
  for(const kind of ['long-dropping-tunnel','long-low-tunnel']){
    const tunnel=chunkOfKind(kind);
    assert.equal(tunnel.pipes.length,10);assert.ok(tunnel.pipes.at(-1).allowRoofOverlap);
    assert.ok(tunnel.exitCenter>tunnel.safePath[1][1]+35,'long tunnel ends through a lower opening');
  }
  const flat=chunkOfKind('stationary-tunnel');assert.equal(flat.pipes.length,5);
  assert.equal(flat.pipes.at(-1).x-flat.pipes[0].x+52,272,'five columns with small visible gaps, not a concatenated tunnel');
  for(const p of flat.pipes){assert.equal(p.motion,undefined);assert.deepEqual(atTime(p,0),atTime(p,20));}
  const rising=chunkOfKind('rising-trio');assert.equal(rising.pipes.length,6);
  const initial=rising.pipes.slice(0,3).map(p=>atTime(p,0)),later=rising.pipes.slice(0,3).map(p=>atTime(p,1));
  assert.ok(later.every((p,i)=>p.bottom.y<initial[i].bottom.y&&p.top.y<initial[i].top.y),'three complete pairs rise together');
  assert.ok(pipePose(rising.pipes[5]).center>later[0].center+60,'rising group leads directly through uneven pipes into a lower opening');
  assert.ok(new Set(rising.pipes.slice(3).map(p=>p.top.y)).size===3,'three uneven fixed exits follow the rising trio');
  for(const kind of ['diagonal-rise','diagonal-fall']){
    const chunk=chunkOfKind(kind),bank={pipes:chunk.pipes.slice(0,5)};
    assert.equal(bank.pipes.length,5,'roof formation has a trio and a following pair');
    const roof=bank.pipes.map(p=>atTime(p,0).top);
    assert.ok(new Set(roof.map(p=>p.y)).size>=3,'fixed roof has staggered cap lengths');
    for(const p of bank.pipes){assert.equal(p.top.angle,Math.PI/4);assert.equal(p.bottom.angle,-Math.PI/4);}
    for(let time=0;time<6;time+=.13){
      const shifts=bank.pipes.map((p,i)=>{assert.deepEqual(atTime(p,time).top,roof[i],'diagonal roof never moves');return pipeMotion(p,0,'bottom').y;});
      assert.ok(Math.abs(shifts[0]-shifts[1])<1e-8&&Math.abs(shifts[1]-shifts[2])<1e-8,'leading three-pipe floor group stays synchronized');
    }
    assert.equal(bank.pipes[0].bottomMotion.speed,26);
    assert.equal(bank.pipes[3].bottomMotion.speed,72);
    assert.ok(bank.pipes[3].bottomMotion.returnSpeed>bank.pipes[0].bottomMotion.speed,'following pair catches the trio while rising');
    const tail=bank.pipes[4],lead=bank.pipes[3];
    const tailDown=atTime(tail,1.5).bottom.y-atTime(tail,1.4).bottom.y;
    const leadDown=atTime(lead,1.5).bottom.y-atTime(lead,1.4).bottom.y;
    assert.ok(tailDown>leadDown+2,'trailing floor separates by descending faster');
    for(const p of bank.pipes){
      const motion=p.bottomMotion,duration=Math.abs(motion.to-motion.from)/motion.speed;
      const a=atTime(p,motion.start).bottom.y,b=atTime(p,motion.start+duration).bottom.y;
      assert.ok(Math.abs((b-a)-(motion.to-motion.from))<1e-7,'ground fitting preserves the complete recorded rail travel');
      assert.equal(p.bottomFittedMotion,undefined,'no faster shortened substitute cycle');
      assert.notEqual(atTime(p,motion.start-.02).bottom.y,atTime(p,motion.start-.01).bottom.y,'bank already moves before the encounter');
      assert.notEqual(atTime(p,motion.start+duration+.01).bottom.y,atTime(p,motion.start+duration+.02).bottom.y,'bank reverses without waiting after its first crossing');
    }
    // Scroll-compensated v=(x+y)/sqrt(2), measured in the 30 FPS recording.
    // These samples span the second bank's reversal and long descent.
    for(const [videoTime,expected] of [[18.8,253.7],[19,241.3],[19.2,262],[19.4,281.7],[19.6,302.4],[19.8,322.1],[20,342.8]]){
      const pipe=bank.pipes[3];atTime(pipe,1.06+videoTime-19);
      assert.ok(Math.abs(292+Math.SQRT2*pipeMotion(pipe,0,'bottom').y-expected)<6,'second bank follows measured source trajectory');
    }
    atTime(bank.pipes[0],.1);atTime(bank.pipes[3],.1);
    assert.ok(Math.abs(pipeMotion(bank.pipes[0],0,'bottom').y-pipeMotion(bank.pipes[3],0,'bottom').y)>1,'groups do not move as one oversized opening');
    const p=bank.pipes[0],post=pipePose(p).top;
    assert.ok(finalPipeHits(p,{x:p.x+26+post.x+Math.sin(post.angle)*4,y:post.y-Math.cos(post.angle)*4,radius:12},336));
  }
  const connected=chunkOfKind('diagonal-fall');assert.ok(connected.pipes.at(-1).motion,'diagonal passage leads directly into a moving gate');
  const rush=chunkOfKind('left-rush-gates'),p=rush.pipes[0];
  p.referenceBirdX=p.x-400;assert.ok(pipeMotion(p).x<0,'extra movement is already active on approach');
  assert.ok(pipeScoreX(p)<p.x+13,'points follow the actual moving gate');
  const contacts=[];
  for(const gate of rush.pipes.filter(p=>p.motion?.type==='rush')){
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
  assert.ok(new Set(rush.pipes.map(p=>p.bottomRecord[1])).size>=3,'rush openings have different heights');
  for(const gate of rush.pipes.filter(p=>p.motion?.type==='rush'&&!p.motion.hold)){
    const a=pipeMotion({...gate,x:-200,referenceBirdX:188}).x,b=pipeMotion({...gate,x:-200-118*.02,referenceBirdX:188}).x;
    assert.ok(Math.abs((a-b)/.02-gate.motion.speed)<1e-7,'extra movement continues after leaving the left edge');
  }
  for(const gate of rush.pipes.filter(p=>p.motion?.hold)){
    const motion=gate.motion,lead=(motion.trigger+26)/118,start=-motion.speed*lead/(118+motion.speed),positions=[];
    for(const t of [start+.05,start+motion.hold/2,start+motion.hold-.05]){
      const sample={...gate,x:188-26-118*t,referenceBirdX:188};
      positions.push(sample.x+26+pipePose(sample).top.x);
    }
    assert.ok(positions.every(x=>Math.abs(x-188)<1e-7),'holding pair matches actual bird x while the world continues scrolling');
    const released=start+motion.hold+.2;
    const a={...gate,x:188-26-118*released,referenceBirdX:188},b={...a,x:a.x-118*.02};
    assert.ok(Math.abs(pipeMotion(a).x-pipeMotion(b).x)<1e-8,'released follower has no second extra leftward burst');
  }
  const follower=rush.pipes.at(-2),end=rush.pipes.at(-1),motion=follower.motion;
  assert.equal(rush.pipes.filter(p=>p.motion?.hold).length,1,'only one follower per section');
  assert.ok(motion.hold>0&&motion.speed>rush.pipes.at(-3).motion.speed,'the final moving pair approaches faster than the previous pair');
  assert.ok(pipePose(follower).center<=112,'the follower is high and requires flying upward');
  const lead=(motion.trigger+26)/118,holdAt=(follower.x-rush.startX)/118-motion.speed*lead/(118+motion.speed);
  const exitAt=(end.x-rush.startX)/118,wait=exitAt-holdAt-motion.hold;
  assert.ok(wait>.7&&wait<1.1,'rising-floor exit arrives within about a second after the hold');
  const roof=atTime(end,exitAt-1).top,bottom=atTime(end,exitAt-1).bottom.y;
  assert.deepEqual(atTime(end,exitAt).top,roof,'final roof remains stationary');
  assert.ok(Math.abs(atTime(end,exitAt).bottom.y-bottom+24)<1e-7,'final floor rises continuously at 24 px/s');
  const descent=chunkOfKind('descending-pursuit'),moving=descent.pipes.filter(p=>p.motion);
  assert.equal(moving.length,1);assert.equal(moving[0].motion.speed,210);
  assert.ok(atTime(moving[0],1.1).center-atTime(moving[0],.8).center>62,'fast gate pulls the player downward through a long predictable stroke');
  for(const kind of ['stationary-diagonal-tunnel','diagonal-drop-exit']){
    const tunnel=chunkOfKind(kind),closing=tunnel.pipes.filter(p=>p.topMotion);
    assert.equal(closing.length,1,'only one ceiling pipe closes the diagonal gap');
    assert.ok(tunnel.pipes.every(p=>!p.bottomMotion),'diagonal floor remains rigid');
    assert.ok(atTime(closing[0],.1).top.y>atTime(closing[0],0).top.y,'closing post extends into the opening');
    assert.equal(tunnel.pipes.at(-2).bottomRecord[2],-Math.PI/4);
    assert.equal(tunnel.pipes.at(-1).bottomRecord[2],Math.PI/4,'both tunnel variants finish with the opposing ground-dip pipes');
    const incoming=pipePose(tunnel.pipes.at(-2)).bottom,emerging=pipePose(tunnel.pipes.at(-1)).bottom;
    assert.ok(emerging.y-incoming.y>45,'long incoming shaft precedes the short emerging tip');
  }
  for(const kind of [FINAL_OPENING_ID,...FINAL_CHUNK_KINDS])for(const pipe of chunkOfKind(kind).pipes){
    for(const part of ['top','bottom']){
      const motion=pipe[part+'Motion']||pipe.motion;if(!motion||motion.type==='rush')continue;
      assert.equal(motion.type,'rail','vertical movers use continuous rails');
      for(let t=-4;t<13;t+=.173){
        atTime(pipe,t);const a=pipeMotion(pipe,0,part).y;
        atTime(pipe,t+.001);const b=pipeMotion(pipe,0,part).y;
        atTime(pipe,t+.002);const c=pipeMotion(pipe,0,part).y;
        assert.ok(Math.abs(a-b)>1e-7||Math.abs(b-c)>1e-7,'moving pipe has no stationary approach or departure interval');
      }
    }
  }
  let baseline;
  for(const fps of [30,60,144,240]){
    const run=new Game({width:614.4,height:384,random:seeded()});run.start();run.score=5;run.activateFinal();
    let remaining=1.6;while(remaining>1e-10){const dt=Math.min(remaining,1/fps);run.bird.y=168;run.bird.vy=0;run.update(dt);remaining-=dt;}
    assert.equal(run.state,'playing');const sample=run.pipes.map(p=>[p.x,p.center].map(v=>Number(v.toFixed(6))));baseline ||= sample;assert.deepEqual(sample,baseline);
  }
  const resized=new Game({width:614.4,height:384});resized.start();resized.score=5;resized.activateFinal();
  resized.pipes=chunkOfKind('rising-trio',{x:300,referenceBirdX:resized.bird.x}).pipes;
  const recorded=resized.pipes[0],old=pipePose(recorded),distance=recorded.x-resized.bird.x;resized.resize(288,623);
  assert.ok(Math.abs(recorded.x-resized.bird.x-distance)<1e-8);
  assert.ok(Math.abs(pipePose(recorded).top.y-old.top.y-(623-384)/2)<1e-8);
  return 'Final: continuous rails, delayed fast-descent cooldown, three-plus-two floor groups, one closing ceiling post, long-to-short ground dip and follower release passed.';
}
export async function checkFinalClient(){
  const c=await createClient({width:1228.8,height:768});c.controller.prepareRun();c.controller.flap();
  const game=c.controller.game;game.score=5;game.activateFinal();game.pipes=chunkOfKind('diagonal-rise',{x:100,referenceBirdX:game.bird.x}).pipes;c.tick(1/240);
  const commands=c.elements.get('game').context.commands.filter(c=>c.kind==='image'&&[112,168].includes(c.args[0])&&c.args[1]>=646);
  assert.ok(commands.some(c=>c.matrix[1]>.1)&&commands.some(c=>c.matrix[1]<-.1));
  assert.ok(c.images.every(path=>path==='/assets/flappy/official-v1.3.png'));
  assert.equal(c.elements.get('play-controls').hidden,true);
  for(const target of [c.elements.get('game'),c.elements.get('play-button')]){
    let prevented=false;const before=game.state,velocity=game.bird.vy;
    c.events.get('keydown')({code:'Tab',repeat:false,target:{closest:()=>target===c.elements.get('play-button')?target:null},preventDefault(){prevented=true;}});
    assert.ok(prevented,'Tab does not perform browser focus navigation');assert.equal(game.state,before);assert.equal(game.bird.vy,velocity);
  }
  game.pipes=chunkOfKind('long-dropping-tunnel',{x:-30,referenceBirdX:game.bird.x}).pipes;game.state='ready';c.tick(1/240);
  const rendered=c.elements.get('game').context.commands.filter(c=>c.kind==='image'&&[112,168].includes(c.args[0])&&c.args[1]>=646);
  assert.ok(rendered.at(-1).matrix[1]<0&&rendered.at(-1).matrix[2]>0,'upper diagonal overlay draws after ordinary pipes');
  return 'Final client: opposite clean pipe orientations and official artwork only passed.';
}
export function checkFloorVisibility(){
  const visible=(pipe,ground)=>{
    const pose=pipePose(pipe),post=pose.bottom,co=Math.cos(post.angle),si=Math.sin(post.angle);
    const corners=[[-26,0],[26,0],[26,26],[-26,26]].map(([x,y])=>post.y+x*si+y*co);
    const remaining=ground-Math.max(...corners),shaft=pipe.lowDip?2:24;
    assert.ok(remaining>=shaft*co-1e-7,pipe.kind+': lower cap or minimum shaft is submerged');
    if(post.angle===0&&pose.top.angle===0)assert.ok(post.y-pose.top.y>=100-1e-7,'raised floors retain at least the original gate opening');
    const upper=pose.top,roofCorners=[[-26,-26],[26,-26],[26,0],[-26,0]].map(([x,y])=>upper.y+x*Math.sin(upper.angle)+y*Math.cos(upper.angle));
    assert.ok(Math.min(...roofCorners)>=12-1e-7,pipe.kind+': entire upper cap stays clear of the ceiling');
  };
  for(const ground of [336,575,960])for(const entryCenter of [100,ground/2,ground-100]){
    for(const kind of [FINAL_OPENING_ID,...FINAL_CHUNK_KINDS]){
      const chunk=chunkOfKind(kind,{ground,entryCenter});
      for(let time=0;time<13;time+=.037)for(const pipe of chunk.pipes){atTime(pipe,time);visible(pipe,ground);}
    }
  }
  const resized=new Game({width:288,height:1008});resized.start();resized.score=5;resized.activateFinal();
  resized.pipes=chunkOfKind('diagonal-rise',{ground:960,entryCenter:800}).pipes;
  resized.resize(614.4,384);
  for(let time=0;time<3;time+=.017)for(const pipe of resized.pipes){atTime(pipe,time);visible(pipe,resized.ground);}
  const moving=chunkOfKind('diagonal-rise',{entryCenter:236}).pipes[3],motion=moving.bottomMotion;
  const a=atTime(moving,motion.start+.01).bottom.y,b=atTime(moving,motion.start+.02).bottom.y;
  assert.ok(Math.abs(Math.abs(b-a)/.01-motion.speed)<1e-7,'ground fitting preserves the full rail speed');
  return 'Pipe exposure: complete upper caps retain 12 pixels of ceiling clearance; floors retain full caps and minimum shafts across travel, entry heights and resizing.';
}
