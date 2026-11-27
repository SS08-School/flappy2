import assert from 'node:assert/strict';
import { Game,PHYSICS } from '../public/engine.mjs';
import { LEVEL3_TEST_SCORE,LEVEL3_PIPE_SPEED,LEVEL3_OPENING_ID,LEVEL3_CHUNK_KINDS,Level3Director,createLevel3Chunk,chunkOpening,pipePose,pipeMotion,level3PipeHits,pipeBounds,pipeScoreX,triangle } from '../public/difficulty.mjs';
import { LEVEL3_CHUNKS } from '../public/level3-chunks.mjs';
import { createClient } from './client-checks.mjs';
const seeded=(seed=17)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function checkMovingSpeedVariety(){
  for(let seed=1;seed<=16;seed++)for(const kind of LEVEL3_CHUNK_KINDS){
    const chunk=chunkOfKind(kind,{entryCenter:seed%2?100:236,previousKind:'stationary-tunnel',random:seeded(seed)});
    for(let i=1;i<chunk.pipes.length;i++){
      const before=chunk.pipes[i-1],after=chunk.pipes[i];
      const a=before.bottomMotion||before.motion,b=after.bottomMotion||after.motion;
      if(a&&b)assert.ok(Math.abs(a.speed-b.speed)>1e-6,'adjacent moving pipes need distinct speeds: '+kind);
    }
  }
  return 'Moving-pipe variety: adjacent rails, floor groups, rushes and moving guides all use distinct speeds.';
}
export function chunkOfKind(kind,options={}){return createLevel3Chunk({x:614.4,ground:336,referenceBirdX:188,kind,...options});}
function atTime(pipe,time){pipe.referenceBirdX=pipe.x-pipe.chunkOffset+26+time*LEVEL3_PIPE_SPEED;return pipePose(pipe);}
export function checkLiveChunkQueue(){
  let appended=0,rushes=0;
  for(let seed=1;seed<=8;seed++){
    const game=new Game({width:614.4,random:seeded(seed)}),append=game.appendLevel3Chunk;
    // Keep a long run alive so this tests production scrolling/prefetch, not
    // just formations constructed together at their original coordinates.
    game.hit=()=>{};
    game.appendLevel3Chunk=function(){
      const before=new Map(this.pipes.filter(p=>p.level===3).map(p=>[p,pipePose(p)]));
      const result=append.call(this);appended++;
      if(this.lastChunkKind.includes('rush'))rushes++;
      for(const [pipe,pose]of before){
        const after=pipePose(pipe);
        assert.ok(Math.abs(after.top.x-pose.top.x)<1e-7&&Math.abs(after.bottom.x-pose.bottom.x)<1e-7,
          'prefetch must not teleport an existing '+pipe.kind+' at '+this.elapsed+' seconds');
      }
      for(const pipe of this.pipes)if(pipe.level===3&&!before.has(pipe))
        assert.ok(pipeBounds(pipe,this.ground).minX>=this.width-1e-7,'new '+pipe.kind+' geometry must be born offscreen');
      return result;
    };
    game.start();
    for(let frame=0;frame<4500;frame++){
      if(frame===2000)game.resize(288,384);if(frame===2600)game.resize(614.4,384);
      const staticPosts=game.pipes.filter(p=>p.level===3&&!p.motion&&!p.topMotion&&!p.bottomMotion)
        .map(p=>[p,p.x+pipePose(p).top.x,p.x+pipePose(p).bottom.x]);
      const travel=game.speed*PHYSICS.step;
      game.bird.y=168;game.bird.vy=0;game.update(PHYSICS.step);
      for(const [pipe,top,bottom]of staticPosts){
        const pose=pipePose(pipe);
        assert.ok(Math.abs(pipe.x+pose.top.x-top+travel)<1e-7&&Math.abs(pipe.x+pose.bottom.x-bottom+travel)<1e-7,
          'an unrelated stationary '+pipe.kind+' must retain normal world scrolling');
      }
    }
  }
  assert.ok(appended>100&&rushes>8,'queue coverage includes many moving-section handoffs');
  return 'Live queue: scrolling and rotation preserve outgoing bounds; prefetch adds every pipe offscreen without moving existing geometry.';
}
export function checkStationaryBankAlignment(){
  const kinds=['stationary-tunnel','short-high-tunnel','short-low-tunnel','stepped-roof-tunnel',
    'floor-valley-tunnel','long-dropping-tunnel','long-low-tunnel'];
  for(const kind of kinds)for(const ground of [336,575,960])for(const entry of [90,100,168,236,ground-90]){
    const chunk=chunkOfKind(kind,{ground,entryCenter:entry});
    const bank=chunk.corePipes.filter(p=>!p.motion&&!p.topMotion&&!p.bottomMotion&&p.topRecord[2]===0&&p.bottomRecord[2]===0);
    const first=bank[0],base=pipePose(first);
    if(kind.startsWith('short-')){
      const poses=bank.map(p=>pipePose(p));
      for(const part of ['top','bottom'])assert.ok((poses[1][part].y-poses[0][part].y)*(poses[2][part].y-poses[1][part].y)<0,
        'short formations are uneven instead of three ascending or descending steps');
    }
    for(const pipe of bank){
      const pose=pipePose(pipe);
      assert.ok(Math.abs(pose.top.y-base.top.y-(pipe.topRecord[1]-first.topRecord[1]))<1e-7,
        kind+': height fitting must preserve the authored roof shape, including equal-length tips');
      assert.ok(Math.abs(pose.bottom.y-base.bottom.y-(pipe.bottomRecord[1]-first.bottomRecord[1]))<1e-7,
        kind+': height fitting must preserve the authored floor shape');
    }
    if(kind==='stationary-tunnel'){
      assert.equal(new Set(bank.map(p=>pipePose(p).top.y)).size,1,'all tips in a flat roof stay exactly even');
      assert.equal(new Set(bank.map(p=>pipePose(p).bottom.y)).size,1,'all tips in a flat floor stay exactly even');
    }
  }
  // Previously these placements flattened most tips, leaving one short pipe.
  for(const [kind,entry] of [['short-high-tunnel',100],['short-low-tunnel',236],['floor-valley-tunnel',236]]){
    const bank=chunkOfKind(kind,{entryCenter:entry}).corePipes;
    assert.ok(new Set(bank.map(p=>pipePose(p).top.y)).size>=3,kind+': intended variation cannot collapse to a single odd tip');
  }
  return 'Stationary banks: flat tips stay level and intentional roof/floor shapes survive fitting near the ground and ceiling at every supported entry height.';
}
export function checkDifficulty(){
  assert.equal(LEVEL3_TEST_SCORE,5);assert.equal(LEVEL3_PIPE_SPEED,118);
  const events=[],game=new Game({width:614.4,height:384,random:()=>.5,onEvent:(type,data)=>events.push({type,data})});
  game.start();assert.equal(game.difficulty,1);assert.equal(game.speed,120);
  let lastClassic,firstLevel3;
  for(let i=0;i<540;i++){
    game.bird.y=168;game.bird.vy=0;game.update(PHYSICS.step);
    if(game.level3Queued&&!firstLevel3){
      assert.ok(game.score<5);lastClassic=game.pipes.filter(p=>p.level===1).at(-1);firstLevel3=game.pipes.find(p=>p.level===3);
      assert.equal(firstLevel3.kind,LEVEL3_OPENING_ID);assert.equal(firstLevel3.motion,undefined);
      const opener=game.pipes.filter(p=>p.chunkId===0);
      assert.equal(opener.length,3,'stage 3 always starts with exactly three upright tunnel pairs');
      assert.ok(opener.every(p=>p.topRecord[2]===0&&p.bottomRecord[2]===0&&!p.motion));
      assert.equal(opener[1].x-opener[0].x,55);assert.equal(opener[2].x-opener[1].x,55);
      assert.equal(game.classicSpawned,5);
      assert.ok(Math.abs(firstLevel3.x-lastClassic.x-172)<1e-8,'short deliberate release at the level switch');
      const opening=pipePose({...firstLevel3,referenceBirdX:firstLevel3.x+26});
      assert.ok(Math.abs(opening.center-lastClassic.center)>=30,'the first moving opening differs visibly from the last classic pair');
      for(const p of game.pipes.filter(p=>p.level===3))assert.ok(pipeBounds(p,game.ground).minX>=game.width-1e-8,'queue entire sections offscreen');
    }
    if(firstLevel3)assert.ok(Math.abs(firstLevel3.x-lastClassic.x-172)<1e-7);
  }
  assert.equal(game.score,5);assert.equal(game.difficulty,3);assert.equal(game.speed,118);
  assert.equal(events.filter(e=>e.type==='difficulty').length,1);
  for(const value of [0,.1,.25,.5,.75,.9,1])for(const width of [240,288,614.4]){
    const run=new Game({width,random:()=>value});run.spawnPipe(run.pipeStartX);run.appendLevel3Chunk();
    const classic=run.pipes[0],moving=run.pipes[1],arrival=pipePose({...moving,referenceBirdX:moving.x+26});
    assert.ok(Math.abs(arrival.center-classic.center)>=30,'level transition stays deliberate across random heights and aspect ratios');
    assert.ok(Math.abs(moving.x-classic.x-172)<1e-7,'transition release is fixed in world coordinates');
  }
  const before=game.pipes.map(p=>[p.x,pipePose(p)]);game.hit();game.update(.1);
  assert.deepEqual(game.pipes.map(p=>[p.x,pipePose(p)]),before,'all motion freezes on hit');
  game.start();assert.equal(game.difficulty,1);assert.equal(game.level3Queued,false);
  const seen=new Set(),random=seeded();let previousKind,previousFamily;
  for(let i=0;i<200;i++){
    const chunk=createLevel3Chunk({x:614.4,ground:336,referenceBirdX:188,random,previousKind});
    assert.notEqual(chunk.kind,previousKind);seen.add(chunk.kind);
    if(['tunnel','rising','diagonal'].includes(previousFamily))assert.notEqual(chunk.family,previousFamily,'a dense section cannot chain directly into more of the same tunnel');
    const source=LEVEL3_CHUNKS.find(c=>c.id===chunk.kind);
    assert.equal(chunk.pipes.length,chunk.layout.length);
    chunk.pipes.forEach((p,j)=>{
      assert.equal(p.width,52);
      const expectedX=614.4+chunk.layout[j].dx+(source.entryInset||0);
      if(!chunk.layout[j].afterFloor&&!chunk.layout[j].overlayAfter){
        if(source.family==='rush')assert.ok(Math.abs(p.x-expectedX-(chunk.pipes[0].x-614.4-(source.entryInset||0)))<1e-8,'rush reservation translates its complete formation uniformly');
        else assert.ok(Math.abs(p.x-expectedX)<1e-8);
      }
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
  assert.equal(seen.size,LEVEL3_CHUNKS.filter(c=>!c.rare).length);
  const director=new Level3Director(seeded()),rapid=[],long=[],history=[],descents=[],rushes=[];
  for(let id=0;id<120;id++){
    const kind=director.next(id);
    assert.ok(!history.slice(-5).includes(kind),'no formation repeats within five chunks');history.push(kind);
    if(LEVEL3_CHUNKS.find(c=>c.id===kind)?.family==='rush'){
      assert.ok(id>=5,'both rush lengths are excluded from the opening five chunks');
      if(rushes.length)assert.ok(id-rushes.at(-1)>=6,'five complete chunks separate any two rush sections');
      rushes.push(id);
    }
    if(id===0)assert.equal(kind,LEVEL3_OPENING_ID);
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
  assert.ok(long.length>=12&&long.length<=17,'long variants occur roughly every eight chunks');
  let precededRushes=0,plainRushes=0;const roofSeen=new Set();
  for(let seed=1;seed<=20;seed++){
    const director=new Level3Director(seeded(seed));let sections=0,lastRush=-Infinity,lastRoof=-Infinity,previous;
    for(let id=0;id<100;id++){
      const kind=director.next(id),rush=LEVEL3_CHUNKS.find(c=>c.id===kind)?.family==='rush';
      if(LEVEL3_CHUNKS.find(c=>c.id===kind)?.motif==='floor-bank'){
        assert.ok(sections-lastRoof>=7,'six complete intervening chunks separate every roof variant');
        lastRoof=sections;roofSeen.add(kind);
      }
      if(rush){
        assert.ok(sections>=5,'interludes do not count toward the five opening sections');
        assert.ok(sections-lastRush>=6,'five full sections separate rushes even when an interlude is added');
        lastRush=sections;
        if(previous==='rising-floor-interlude')precededRushes++;else plainRushes++;
      }
      if(kind!=='rising-floor-interlude')sections++;
      previous=kind;
    }
  }
  assert.ok(precededRushes>0&&plainRushes>0,'rising floors sometimes precede rushes without becoming mandatory');
  assert.equal(roofSeen.size,3,'all three roof variants remain available with the shared cooldown');
  assert.ok(LEVEL3_CHUNKS.every(c=>!c.id.includes('rapid')&&!c.id.includes('reversing')));
  for(const kind of ['long-dropping-tunnel','long-low-tunnel']){
    const tunnel=chunkOfKind(kind);
    assert.equal(tunnel.pipes.length,10);assert.ok(tunnel.pipes.at(-1).allowRoofOverlap);
    const floors=tunnel.corePipes.slice(0,9).map(p=>pipePose(p).bottom.y);
    assert.ok(Math.max(...floors.slice(1).map((y,i)=>Math.abs(y-floors[i])))>=90,'long variants contain a single large floor ledge, in either direction');
  }
  const flat=chunkOfKind('stationary-tunnel');assert.equal(flat.pipes.length,3);
  assert.equal(flat.pipes.at(-1).x-flat.pipes[0].x+52,162,'three columns make the ordinary flat tunnel brief');
  for(const p of flat.pipes){assert.equal(p.motion,undefined);assert.deepEqual(atTime(p,0),atTime(p,20));}
  for(const entryCenter of [100,168,236]){
    const opening=chunkOfKind(LEVEL3_OPENING_ID,{entryCenter});
    assert.equal(opening.pipes.length,3);assert.ok(opening.pipes.every(p=>!p.motion&&p.topRecord[2]===0),'stage 3 begins with a short upright tunnel');
    assert.equal(new Set(opening.pipes.map(p=>pipePose(p).top.y)).size,1,'the opening roof is flat');
    assert.equal(new Set(opening.pipes.map(p=>pipePose(p).bottom.y)).size,1,'the opening floor is flat');
  }
  const rising=chunkOfKind('rising-trio');assert.equal(rising.pipes.length,6);
  const initial=rising.pipes.slice(0,3).map(p=>atTime(p,0)),later=rising.pipes.slice(0,3).map(p=>atTime(p,1));
  assert.ok(later.every((p,i)=>p.bottom.y<initial[i].bottom.y&&p.top.y<initial[i].top.y),'three complete pairs rise together');
  assert.ok(pipePose(rising.pipes[5]).center>later[0].center+60,'rising group leads directly through uneven pipes into a lower opening');
  assert.ok(new Set(rising.pipes.slice(3).map(p=>p.top.y)).size===3,'three uneven fixed exits follow the rising trio');
  for(const kind of ['diagonal-rise','diagonal-fall']){
    const chunk=chunkOfKind(kind,{random:()=>.5}),bank={pipes:chunk.pipes.slice(0,6)};
    assert.equal(bank.pipes.length,6,'roof formation has a rising trio, returning pair and fixed third exit pipe');
    assert.equal(bank.pipes.filter(p=>!p.noTop).length,6,'intermediate roof fills the missing shaft between the leading pipe and slope');
    const roof=bank.pipes.map(p=>atTime(p,0).top);
    assert.ok(new Set(roof.map(p=>p.y)).size>=3,'fixed roof has staggered cap lengths');
    for(const p of bank.pipes){assert.equal(p.top.angle,Math.PI/4);assert.equal(p.bottom.angle,-Math.PI/4);}
    for(let time=0;time<6;time+=.13){
      const shifts=bank.pipes.map((p,i)=>{assert.deepEqual(atTime(p,time).top,roof[i],'diagonal roof never moves');return pipeMotion(p,0,'bottom').y;});
      assert.ok(Math.max(...shifts.slice(0,3))-Math.min(...shifts.slice(0,3))<10,'leading floor group stays coherent with individually varied speeds');
    }
    assert.ok(bank.pipes[0].bottomMotion.speed>10&&bank.pipes[0].bottomMotion.speed<13,'trio ascent spans the widescreen approach at a steady speed');
    assert.equal(new Set(bank.pipes.slice(0,3).map(p=>p.bottomMotion.speed)).size,3,'neighboring floors have distinct speeds');
    assert.equal(bank.pipes[3].bottomMotion.speed,50);
    assert.ok(bank.pipes[4].bottomMotion.speed>50,'right pipe covers its longer ascent faster');
    assert.ok(bank.pipes[3].bottomMotion.speed>bank.pipes[0].bottomMotion.speed,'following pair catches the trio while rising');
    const tail=bank.pipes[4],lead=bank.pipes[3];
    const peak=p=>p.bottomMotion.start+(p.bottomMotion.from-p.bottomMotion.to)/p.bottomMotion.speed;
    const leadPeak=peak(lead),tailPeak=peak(tail),descentAt=tailPeak+.1;
    assert.ok(Math.abs(tailPeak-leadPeak)<1e-8,'both moving floors reach their peak at the exact same time');
    const tailDown=atTime(tail,descentAt+.1).bottom.y-atTime(tail,descentAt).bottom.y;
    const leadDown=atTime(lead,descentAt+.1).bottom.y-atTime(lead,descentAt).bottom.y;
    assert.ok(tailDown>leadDown+1,'trailing floor separates by descending faster');
    for(const p of [lead,tail])assert.ok(atTime(p,peak(p)+.01).bottom.y>atTime(p,peak(p)).bottom.y,'each pipe descends immediately at its own reversal');
    for(const p of [lead,tail])assert.ok(atTime(p,leadPeak-.01).bottom.y>atTime(p,leadPeak).bottom.y,'both floors are still rising immediately before their shared peak');
    for(const p of bank.pipes.slice(0,5)){
      const motion=p.bottomMotion,duration=Math.abs(motion.to-motion.from)/motion.speed;
      const a=atTime(p,motion.start).bottom.y,b=atTime(p,motion.start+duration).bottom.y;
      assert.ok(Math.abs((b-a)-(motion.to-motion.from))<1e-7,'ground fitting preserves the complete recorded rail travel');
      assert.equal(p.bottomFittedMotion,undefined,'no faster shortened substitute cycle');
      if(motion.type==='sweep')assert.equal(atTime(p,motion.start+duration+.1).bottom.y,atTime(p,motion.start+duration+4).bottom.y,'leading trio stays extended instead of retracting');
      else{
        const returned=motion.start+duration+Math.abs(motion.returnTo-motion.to)/motion.returnSpeed;
        assert.ok(Math.abs(atTime(p,returned).bottom.y-b-(motion.returnTo-motion.to))<1e-7,'following pair completes its full return travel');
        assert.equal(atTime(p,returned+.1).bottom.y,atTime(p,returned+2).bottom.y,'returned pipe stays still at its low endpoint');
      }
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
    assert.ok(level3PipeHits(p,{x:p.x+26+post.x+Math.sin(post.angle)*4,y:post.y-Math.cos(post.angle)*4,radius:12},336));
    const leadStop=leadPeak+160/lead.bottomMotion.returnSpeed,tailStop=tailPeak+(tail.bottomMotion.returnTo-tail.bottomMotion.to)/tail.bottomMotion.returnSpeed;
    assert.ok(Math.abs(leadStop-tailStop)<1e-8,'following pair stops simultaneously');
    for(const fraction of [.01,.25,.5,.75,.99]){
      const time=tailPeak+(leadStop-tailPeak)*fraction;
      assert.ok(atTime(tail,time+.001).bottom.y-atTime(tail,time).bottom.y>atTime(lead,time+.001).bottom.y-atTime(lead,time).bottom.y,'right pipe moves faster throughout the overlapping descent');
    }
    for(const p of [lead,tail]){
      assert.ok(atTime(p,leadStop).bottom.y>atTime(p,leadStop-.001).bottom.y,'both pipes are still descending just before their shared stop');
      assert.equal(atTime(p,leadStop+.001).bottom.y,atTime(p,leadStop+1).bottom.y,'both pipes remain stopped after the shared endpoint');
    }
    const fixed=bank.pipes[5],fixedPose=atTime(fixed,-5).bottom;
    assert.equal(fixed.bottomMotion,undefined,'third pipe after the returning pair is stationary');
    for(let t=-5;t<8;t+=.17)assert.deepEqual(atTime(fixed,t).bottom,fixedPose,'third floor never participates in either moving group');
    const teeth=bank.pipes.slice(3,6).map(p=>{const b=atTime(p,leadStop+.1).bottom;return{x:p.x+26+b.x,y:b.y};});
    for(let i=1;i<teeth.length;i++){
      assert.ok(Math.abs(teeth[i-1].y-teeth[i].y-12)<1e-7,'stopped caps form three evenly stepped short saw teeth');
      assert.ok(Math.abs(teeth[i].x-teeth[i-1].x-(54*Math.SQRT2-12))<1e-7,'saw teeth have uniform horizontal spacing, without a deep middle dip');
    }
    const slope=bank.pipes.slice(1,5).map(p=>{const top=pipePose(p).top;return top.y-(p.x+26+top.x);});
    assert.ok(Math.max(...slope)-Math.min(...slope)<1e-7,'stepped roof run remains cleanly aligned');
  }
  const profiles=new Set();
  for(const value of [.1,.5,.9]){
    const chunk=chunkOfKind('diagonal-rise',{random:()=>value}),bank=chunk.pipes.slice(0,5);
    profiles.add(bank.map(p=>[p.bottomMotion.speed,p.bottomMotion.start,p.bottomMotion.returnSpeed].join(':')).join('|'));
    const tops=bank.map(p=>atTime(p,0).top);
    for(let t=-3;t<6;t+=.07){
      bank.forEach((p,i)=>assert.deepEqual(atTime(p,t).top,tops[i],'roof stays fixed in every floor-group variation'));
      const shifts=bank.map(p=>pipeMotion(p,0,'bottom').y);
      assert.ok(Math.max(...shifts.slice(0,3))-Math.min(...shifts.slice(0,3))<10,'variation retains a coherent group without identical speeds');
    }
    assert.ok(bank[4].bottomMotion.speed>bank[3].bottomMotion.speed,'right floor rises faster over its longer stroke in every variation');
    assert.ok(bank[4].bottomMotion.returnSpeed>bank[3].bottomMotion.returnSpeed,'following pair separates during retraction in every variation');
    const stops=bank.slice(3).map(p=>{const motion=p.bottomMotion;return motion.start+(motion.from-motion.to)/motion.speed+(motion.returnTo-motion.to)/motion.returnSpeed;});
    assert.ok(Math.abs(stops[0]-stops[1])<1e-8,'every profile finishes both returns together');
    assert.equal(bank[4].bottomMotion.start,bank[3].bottomMotion.start,'both floors start their rise together in every profile');
    const peaks=bank.slice(3).map(p=>p.bottomMotion.start+(p.bottomMotion.from-p.bottomMotion.to)/p.bottomMotion.speed);
    assert.ok(Math.abs(peaks[0]-peaks[1])<1e-8,'every profile reverses both moving floors simultaneously');
    for(const p of bank.slice(3)){
      const motion=p.bottomMotion,peak=motion.start+(motion.from-motion.to)/motion.speed;
      assert.ok(atTime(p,peak+.001).bottom.y>atTime(p,peak).bottom.y,'every profile reverses each pipe without a hold');
    }
  }
  assert.equal(profiles.size,3,'floor groups have three distinct bounded movement profiles');
  for(const ground of [336,575])for(const width of [288,614.4])for(const value of [.1,.5,.9]){
    const birdX=90+(width-288)*.3,chunk=chunkOfKind('diagonal-rise',{x:0,ground,referenceBirdX:birdX,random:()=>value});
    for(const pipe of chunk.pipes.slice(0,5)){
      let first;
      for(let t=-8;t<5;t+=.01){
        const origin=birdX-26-t*118,visible={...pipe,x:origin+pipe.chunkOffset,referenceBirdX:birdX,noTop:true};
        const bounds=pipeBounds(visible,ground);
        if(bounds.minX<=width&&bounds.maxX>=0){first={t,visible};break;}
      }
      assert.ok(first,'moving floor enters the viewport');
      const a=pipePose(first.visible).bottom.y,b=pipePose({...first.visible,x:first.visible.x-.01*118}).bottom.y;
      assert.ok(b<a-1e-6,'floor is already rising when it first becomes visible, without copying the recording pause');
    }
  }
  const connected=chunkOfKind('diagonal-fall');assert.ok(connected.pipes.at(-1).motion,'diagonal passage leads directly into a moving gate');
  const rush=chunkOfKind('left-rush-gates',{random:()=>.25}),p=rush.pipes[0];
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
      const sample={...gate,rushAhead:[],x:birdX+atContact,referenceBirdX:birdX};
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
    assert.ok(b<=a,'regular rush gates do not reverse after leaving the left edge');
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
  const follower=rush.pipes.find(p=>p.motion?.hold),motion=follower.motion;
  assert.equal(rush.pipes.filter(p=>p.motion?.hold).length,1,'only one follower per section');
  assert.ok(motion.hold>0&&motion.speed>rush.pipes.at(-2).motion.speed,'the final moving pair approaches faster than the previous pair');
  assert.ok(pipePose(follower).center<=112,'the follower is high and requires flying upward');
  for(const q of rush.corePipes)assert.equal(pipePose(q).bottom.y-pipePose(q).top.y,100,'rush gaps retain the reference 100-pixel opening');
  assert.ok(rush.corePipes.slice(1,-1).every((q,i)=>Math.abs(q.x-rush.corePipes[i].x-156)<1e-7),'ordinary rush gates are closer together');
  const sizes=new Set(),exits=new Set(),regularSpeeds=new Set();
  for(let seed=1;seed<=60;seed++){
    const varied=chunkOfKind('left-rush-gates',{random:seeded(seed*183)}),gates=varied.pipes.filter(p=>p.motion?.type==='rush');
    sizes.add(gates.length);exits.add(Boolean(varied.pipes.at(-1).bottomMotion));
    const regular=gates.filter(p=>!p.motion.hold);
    regular.forEach((p,i)=>{
      assert.ok(p.motion.speed>=22&&p.motion.speed<=76,'ordinary rush speed is sampled from a bounded continuous range');
      regularSpeeds.add(p.motion.speed.toFixed(3));
      if(i)assert.ok(regular[i-1].motion.speed-p.motion.speed>=6-1e-7,'regular approaches have distinct velocities instead of forming a same-speed convoy');
      const a=pipeMotion({...p,referenceBirdX:p.x+26-118}).x,b=pipeMotion({...p,referenceBirdX:p.x+26-118+1.18}).x;
      assert.ok(Math.abs((a-b)/.01-p.motion.speed)<1e-7,'rendered approach retains its distinct speed with the separation guard active');
    });
    for(let time=-5;time<14;time+=.037){
      const clock=varied.startX+26+time*118;
      gates.forEach(p=>{p.referenceBirdX=clock;});
      for(let i=1;i<gates.length;i++){
        const front=gates[i-1],rear=gates[i];
        assert.ok(rear.x+pipeMotion(rear).x-front.x-pipeMotion(front).x-front.width>=3-1e-7,'different rush speeds never create physical overlaps');
      }
    }
  }
  assert.equal(sizes.size,2,'full left-moving sections vary between four and five moving pairs');
  assert.ok(regularSpeeds.size>100,'rush speed variation is continuous rather than a few fixed presets');
  assert.deepEqual([...exits],[false],'rising floor is no longer attached to every rush section');
  const shortSizes=new Set();
  for(let seed=1;seed<=60;seed++){
    const short=chunkOfKind('short-left-rush-gates',{random:seeded(seed*183)}),gates=short.pipes.filter(p=>p.motion?.type==='rush');
    shortSizes.add(gates.length);
    assert.ok(gates.every(p=>!p.motion.hold),'short rush sections omit the repeated follower sequence');
    for(let time=-5;time<14;time+=.037){
      gates.forEach(p=>{p.referenceBirdX=short.startX+26+time*118;});
      for(let i=1;i<gates.length;i++)assert.ok(gates[i].x+pipeMotion(gates[i]).x-gates[i-1].x-pipeMotion(gates[i-1]).x-52>=3-1e-7,'short rush velocities preserve separation');
    }
  }
  assert.deepEqual([...shortSizes].sort(),[2,3],'short rush sections have two or three gates');
  {
    const chunk=chunkOfKind('rising-floor-interlude'),rising=chunk.pipes[0];
    assert.equal(chunk.corePipes.length,1,'rising floor is a standalone between-chunk obstacle');
    const crossing=rising.chunkOffset/118,pose=atTime(rising,crossing);
    assert.ok(Math.abs(pose.bottom.y-pose.top.y-100)<1e-7,'rising opening is 100 pixels at the actual crossing');
    assert.ok(Math.abs(atTime(rising,crossing+.5).bottom.y-atTime(rising,crossing+.5).top.y-88)<1e-7,'rising opening tightens to 88 pixels as the bird exits');
    assert.equal(rising.bottomRecord[1]-64,264,'only the lower post starts 20 pixels higher');
    for(const offset of [.4,1,1.6,2.5])assert.ok(atTime(rising,crossing+offset+.01).bottom.y<atTime(rising,crossing+offset).bottom.y,'floor continues upward after the bird passes');
    assert.ok(atTime(rising,crossing+13).bottom.y<=atTime(rising,crossing+2.5).bottom.y,'floor never retracts later');
  }
  for(const kind of ['short-high-tunnel','short-low-tunnel']){
    assert.ok(chunkOfKind(kind,{random:()=>.1}).pipes.every(p=>!p.risingFloor),'ordinary tunnel no longer has an attached rising-floor ending');
  }
  const descent=chunkOfKind('descending-pursuit'),moving=descent.pipes.filter(p=>p.motion);
  assert.equal(moving.length,1);assert.equal(moving[0].motion.speed,210);
  assert.ok(atTime(moving[0],1.1).center-atTime(moving[0],.8).center>62,'fast gate pulls the player downward through a long predictable stroke');
  for(const kind of ['stationary-diagonal-tunnel','diagonal-drop-exit','high-diagonal-tunnel']){
    const tunnel=chunkOfKind(kind);
    assert.ok(tunnel.pipes.every(p=>!p.topMotion&&!p.bottomMotion&&!p.motion),'the complete diagonal tunnel is stationary');
    assert.equal(tunnel.pipes.at(-2).bottomRecord[2],-Math.PI/4);
    assert.equal(tunnel.pipes.at(-1).bottomRecord[2],Math.PI/4,'both tunnel variants finish with the opposing ground-dip pipes');
    const incoming=pipePose(tunnel.pipes.at(-2)).bottom,emerging=pipePose(tunnel.pipes.at(-1)).bottom;
    assert.ok(emerging.y-incoming.y>32,'incoming cap remains more than one cap-height above the short emerging tip after headroom fitting');
  }
  {
    const ordinary=chunkOfKind('stationary-diagonal-tunnel',{entryCenter:168,random:()=>.5});
    const high=chunkOfKind('high-diagonal-tunnel',{entryCenter:168,random:()=>.5});
    const middle=chunk=>chunk.corePipes.slice(0,6).reduce((sum,p)=>sum+pipePose(p).center,0)/6;
    assert.ok(middle(high)<middle(ordinary)-8,'higher diagonal variation moves the already elevated route upward');
    const minimum=chunk=>{
      let gap=Infinity;
      for(let x=chunk.corePipes[1].x;x<chunk.corePipes[4].x;x+=2){
        const port=chunkOpening(chunk.pipes,x,336);gap=Math.min(gap,port.bottom-port.top);
      }
      return gap;
    };
    assert.ok(minimum(ordinary)<=140,'ordinary diagonal interior keeps the tighter reference-like flight corridor');
    assert.ok(minimum(high)<=132,'higher diagonal interior keeps its tighter flight corridor');
    assert.ok(minimum(high)<minimum(ordinary)-2,'higher diagonal route is slightly narrower');
  }
  for(const kind of ['stationary-diagonal-tunnel','diagonal-drop-exit','high-diagonal-tunnel'])for(const ground of [336,575])for(const entry of [100,168,236])for(const profile of [.1,.5,.9]){
    const chunk=chunkOfKind(kind,{ground,entryCenter:entry,random:()=>profile});
    const rear=chunk.pipes.at(-2),overlay=chunk.pipes.at(-1),r=pipePose(rear).top,o=pipePose(overlay).top;
    const rx=rear.x+26+r.x,ox=overlay.x+26+o.x;
    // A point near the top edge must remain inside the real rear shaft and
    // past the far side of the foreground pipe, leaving a visible sliver.
    const y=2,x=rx+r.y+26*Math.SQRT2-y-2;
    const localX=(x-rx)*Math.cos(r.angle)+(y-r.y)*Math.sin(r.angle);
    const localY=-(x-rx)*Math.sin(r.angle)+(y-r.y)*Math.cos(r.angle);
    const foregroundX=(x-ox)*Math.cos(o.angle)+(y-o.y)*Math.sin(o.angle);
    assert.ok(Math.abs(localX)<26&&localY<0,'exposed point belongs to the rear roof shaft');
    assert.ok(foregroundX>27,'rear shaft visibly protrudes beyond the far edge of the overlay');
  }
  for(const kind of [LEVEL3_OPENING_ID,...LEVEL3_CHUNK_KINDS])for(const pipe of chunkOfKind(kind).pipes){
    for(const part of ['top','bottom']){
      const motion=pipe[part+'Motion']||pipe.motion;if(!motion||motion.type==='rush')continue;
      assert.ok(['rail','bank','plunger','sweep'].includes(motion.type),'vertical motion uses deterministic paths');
      if(['bank','sweep'].includes(motion.type))continue;
      for(let t=-4;t<13;t+=.173){
        atTime(pipe,t);const a=pipeMotion(pipe,0,part).y;
        atTime(pipe,t+.001);const b=pipeMotion(pipe,0,part).y;
        atTime(pipe,t+.002);const c=pipeMotion(pipe,0,part).y;
        assert.ok(Math.abs(a-b)>1e-7||Math.abs(b-c)>1e-7,'moving pipe has no stationary approach or departure interval');
      }
    }
  }
  const plunger=chunkOfKind('tunnel-plunger'),trap=plunger.pipes.find(p=>p.motion?.type==='plunger');
  assert.equal(plunger.pipes.length,7);assert.equal(plunger.pipes.filter(p=>p.motion).length,1,'one elevator gate is enclosed in a short fixed tunnel');
  const fast=trap.motion,after=fast.slowAt+.05;
  const speedAt=t=>Math.abs(atTime(trap,t+.001).center-atTime(trap,t).center)/.001;
  assert.ok(Math.abs(speedAt(fast.start+.1)-210)<1e-6,'elevator restores the previous 210 px/s speed');
  assert.ok(Math.abs(speedAt(after)-60)<1e-6,'elevator slows as the bird starts leaving the gap');
  const enter=(trap.chunkOffset-38)/118,leave=(trap.chunkOffset+38)/118;
  assert.ok(fast.slowAt>enter&&fast.slowAt<leave,'slowdown happens within the exit portion of the crossing');
  const entrance=atTime(trap,enter).center,exit=atTime(trap,leave).center;
  assert.ok(exit-entrance>100,'bird follows the elevator gap down through a meaningful distance');
  for(let t=enter;t<leave;t+=.01)assert.ok(atTime(trap,t+.001).center>atTime(trap,t).center,'gap never reverses upward while the bird is inside it');
  assert.ok(pipePose(plunger.pipes[0]).center-pipePose(plunger.pipes[2]).center>60,'fixed tunnel entrance requires climbing first');
  assert.ok(Math.abs(pipePose(plunger.pipes[5]).center-exit)<20,'descending opening joins directly to the lower exit tunnel');
  const spacings=plunger.pipes.slice(1).map((p,i)=>p.x-plunger.pipes[i].x);
  assert.deepEqual(spacings,[84,72,55,55,55,55],'spread entry becomes a tight guide tunnel around the elevator');
  const authored=chunkOfKind('tunnel-plunger',{entryCenter:200});
  assert.deepEqual(authored.pipes.slice(0,4).map(p=>pipePose(p).bottom.y-pipePose(p).top.y),[128,124,124,120],'lead-in retains extra room for the climb into the elevator');
  for(const ground of [336,575,960])for(const entryCenter of [100,ground/2,ground-100]){
    const guided=chunkOfKind('tunnel-plunger',{ground,entryCenter}),moving=guided.pipes[4],guide=pipePose(guided.pipes[3]);
    const entry=atTime(moving,(moving.chunkOffset-38)/118);
    assert.ok(Math.abs(entry.bottom.y-entry.top.y-140)<1e-7,'moving opening preserves its full wider gap');
    assert.ok(Math.abs(guide.center-entry.center)<1e-7,'guide points to the exact elevator entry elevation');
    assert.ok(guide.top.y>=entry.top.y+10-1e-7&&guide.bottom.y<=entry.bottom.y-10+1e-7,'elevator has ten pixels of extra room above and below the guide opening');
  }
  assert.ok(Math.abs(atTime(trap,fast.slowAt+.000001).center-atTime(trap,fast.slowAt-.000001).center)<.001,'speed change preserves position continuity');
  let baseline;
  for(const fps of [30,60,144,240]){
    const run=new Game({width:614.4,height:384,random:seeded()});run.start();run.score=5;run.activateLevel3();
    let remaining=1.6;while(remaining>1e-10){const dt=Math.min(remaining,1/fps);run.bird.y=168;run.bird.vy=0;run.update(dt);remaining-=dt;}
    assert.equal(run.state,'playing');const sample=run.pipes.map(p=>[p.x,p.center].map(v=>Number(v.toFixed(6))));baseline ||= sample;assert.deepEqual(sample,baseline);
  }
  const resized=new Game({width:614.4,height:384});resized.start();resized.score=5;resized.activateLevel3();
  resized.pipes=chunkOfKind('rising-trio',{x:300,referenceBirdX:resized.bird.x}).pipes;
  const recorded=resized.pipes[0],old=pipePose(recorded),distance=recorded.x-resized.bird.x;resized.resize(288,623);
  assert.ok(Math.abs(recorded.x-resized.bird.x-distance)<1e-8);
  assert.ok(Math.abs(pipePose(recorded).top.y-old.top.y)<1e-8,'resizing never moves a pipe vertically');
  return 'Level 3: synchronized floor groups, high stationary diagonals, varied separated rushes, occasional continuously rising floors and guided elevator passage passed.';
}
export async function checkLevel3Client(){
  const c=await createClient({width:1228.8,height:768});c.controller.prepareRun();c.controller.flap();
  const game=c.controller.game;game.score=5;game.activateLevel3();game.pipes=chunkOfKind('diagonal-rise',{x:100,referenceBirdX:game.bird.x}).pipes;c.tick(1/240);
  const commands=c.elements.get('game').context.commands.filter(c=>c.kind==='image'&&[112,168].includes(c.args[0])&&c.args[1]>=646);
  assert.ok(commands.some(c=>c.matrix[1]>.1)&&commands.some(c=>c.matrix[1]<-.1));
  assert.ok(commands.some(c=>c.matrix[0]*c.matrix[3]-c.matrix[1]*c.matrix[2]<0),'long pipe shafts reflect the official shaft strip');
  assert.ok(commands.every(c=>c.args[3]!==1),'long shafts never splice in a stretched single row');
  assert.ok(c.images.every(path=>path==='/assets/flappy/official-v1.3.png'));
  assert.equal(c.elements.get('play-controls').hidden,true);
  for(const target of [c.elements.get('game'),c.elements.get('play-button')]){
    let prevented=false;const before=game.state,velocity=game.bird.vy;
    c.events.get('keydown')({code:'Tab',repeat:false,target:{closest:()=>target===c.elements.get('play-button')?target:null},preventDefault(){prevented=true;}});
    assert.ok(prevented,'Tab does not perform browser focus navigation');assert.equal(game.state,before);assert.equal(game.bird.vy,velocity);
  }
  game.pipes=chunkOfKind('long-dropping-tunnel',{x:-30,referenceBirdX:game.bird.x}).pipes;game.state='ready';c.tick(1/240);
  const rendered=c.elements.get('game').context.commands.filter(c=>c.kind==='image'&&[112,168].includes(c.args[0])&&c.args[1]>=646);
  const cap=rendered.filter(c=>c.args[0]===112&&c.args[3]===26).at(-1);
  assert.ok(cap.matrix[1]<0&&cap.matrix[2]>0,'upper diagonal overlay draws after ordinary pipes');
  return 'Level 3 client: opposite clean pipe orientations and official artwork only passed.';
}
export function checkFloorVisibility(){
  const visible=(pipe,ground)=>{
    const pose=pipePose(pipe),post=pose.bottom,co=Math.cos(post.angle),si=Math.sin(post.angle);
    const corners=[[-26,0],[26,0],[26,26],[-26,26]].map(([x,y])=>post.y+x*si+y*co);
    const remaining=ground-Math.max(...corners),shaft=pipe.minimumShaft??(pipe.lowDip?2:24);
    assert.ok(remaining>=shaft*co-1e-7,pipe.kind+': lower cap or minimum shaft is submerged');
    if(post.angle===0&&pose.top.angle===0)assert.ok(post.y-pose.top.y>=(pipe.minimumGap??100)-1e-7,'raised floors retain their prescribed opening');
    const upper=pose.top,roofCorners=[[-26,-26],[26,-26],[26,0],[-26,0]].map(([x,y])=>upper.y+x*Math.sin(upper.angle)+y*Math.cos(upper.angle));
    if(!pipe.noTop)assert.ok(Math.min(...roofCorners)>=12-1e-7,pipe.kind+': entire upper cap stays clear of the ceiling');
  };
  for(const ground of [336,575,960])for(const entryCenter of [100,ground/2,ground-100]){
    for(const kind of [LEVEL3_OPENING_ID,...LEVEL3_CHUNK_KINDS]){
      const chunk=chunkOfKind(kind,{ground,entryCenter});
      for(let time=0;time<13;time+=.037)for(const pipe of chunk.pipes){atTime(pipe,time);visible(pipe,ground);}
    }
  }
  const resized=new Game({width:288,height:1008});resized.start();resized.score=5;resized.activateLevel3();
  resized.pipes=chunkOfKind('diagonal-rise',{ground:resized.ground,entryCenter:168}).pipes;
  resized.resize(614.4,384);
  for(let time=0;time<3;time+=.017)for(const pipe of resized.pipes){atTime(pipe,time);visible(pipe,resized.ground);}
  const moving=chunkOfKind('diagonal-rise',{entryCenter:236}).pipes[3],motion=moving.bottomMotion;
  const a=atTime(moving,motion.start+.01).bottom.y,b=atTime(moving,motion.start+.02).bottom.y;
  assert.ok(Math.abs(Math.abs(b-a)/.01-motion.speed)<1e-7,'ground fitting preserves the full rail speed');
  return 'Pipe exposure: complete upper caps retain 12 pixels of ceiling clearance; floors retain full caps and minimum shafts across travel, entry heights and resizing.';
}
