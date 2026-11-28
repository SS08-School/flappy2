import assert from 'node:assert/strict';
import { Game,PHYSICS,LEVEL2_PHYSICS } from '../public/engine.mjs';
import { LEVEL2_TEST_SCORE,LEVEL2_TEST_LENGTH,LEVEL3_TEST_SCORE } from '../public/difficulty.mjs';
import { createClient } from './client-checks.mjs';

const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

export function checkLevel2Progression(){
  const changes=[],game=new Game({width:614.4,random:()=>.5,onEvent(type,data){if(type==='difficulty')changes.push([data.level,game.score]);}});
  game.start();const seen=new Set(game.pipes),spawned=[...game.pipes];
  const origins=new Map(game.pipes.map(p=>[p,p.x+game.distance]));
  assert.ok(game.pipes[0].x>=game.width-1e-8,'first pair starts offscreen');
  for(let frame=0;frame<1800&&game.score<LEVEL3_TEST_SCORE;frame++){
    game.bird.y=168;game.bird.vy=0;game.update(PHYSICS.step);
    for(const pipe of game.pipes)if(!seen.has(pipe)){
      seen.add(pipe);spawned.push(pipe);
      origins.set(pipe,pipe.x+game.distance);
      assert.ok(pipe.x>=game.width-1e-8,'all three stages are prepared offscreen');
    }
    const expected=game.score<LEVEL2_TEST_SCORE?1:game.score<LEVEL3_TEST_SCORE?2:3;
    assert.equal(game.difficulty,expected,'score 5 starts stage 2; score 9 starts stage 3');
    if(expected===2)assert.equal(game.speed,PHYSICS.speed,'stage 2 keeps stage 1 horizontal speed');
    assert.equal(game.state,'playing','the default moving pair path remains playable');
  }
  assert.deepEqual(spawned.slice(0,9).map(p=>p.level),[1,1,1,1,1,2,2,2,2]);
  assert.equal(spawned.filter(p=>p.level===2).length,LEVEL2_TEST_LENGTH);
  for(let i=1;i<9;i++)assert.ok(Math.abs(origins.get(spawned[i])-origins.get(spawned[i-1])-PHYSICS.spacing)<1e-7,'stage 1/2 keep exactly 156-pixel spacing, including their handoff');
  assert.deepEqual(changes,[[2,5],[3,9]],'each stage change occurs once at the requested score');
  const positions=game.pipes.map(p=>p.x);game.activateDifficulty();
  assert.deepEqual(game.pipes.map(p=>p.x),positions,'stage activation never replaces or teleports visible pipes');
  game.start();assert.equal(game.difficulty,1);assert.equal(game.score,0);
  return 'Stage progression: five original pairs, exactly four independently moving pairs, then the existing stage 3 opener; spacing, offscreen births and replay passed.';
}

export function checkLevel2Motion(){
  for(const random of [()=>0,()=>1,seeded(153)]){
    const game=new Game({random});game.classicSpawned=5;
    for(let i=0;i<16;i++)game.spawnPipe(i*156,2);
    for(const pipe of game.pipes){
      assert.ok(pipe.baseCenter>=100&&pipe.baseCenter<=236,'stage 2 uses the original random base-height range');
      assert.equal(pipe.gap,108);assert.equal(pipe.width,52);
      const motion=pipe.verticalMotion;let last,up=false,down=false;
      assert.ok(motion.speed>=20&&motion.speed<=28,'motion is moderately faster and remains gentle');
      for(let time=0;time<motion.period*2;time+=.013){
        const center=game.pipeCenter(pipe,time);
        assert.ok(center-pipe.gap/2>=26-1e-7&&center+pipe.gap/2<=game.ground-26+1e-7,'complete pipe caps remain above ground and below the ceiling');
        assert.ok(Math.abs(center-game.pipeCenter(pipe,time+motion.period))<1e-7,'each rail repeats exactly and predictably');
        if(last!==undefined){assert.ok(Math.abs(center-last)<=motion.speed*.013+1e-7,'no jumps or sudden extra speed');up ||= center<last;down ||= center>last;}
        last=center;
      }
      assert.ok(up&&down,'each pair travels in both directions');
    }
    const a=game.pipes[0],b=game.pipes[1];
    assert.notDeepEqual(a.verticalMotion,b.verticalMotion,'neighboring pairs have independent motion, even with a constant random source');
    const before=game.pipeCenter(a,.137),relativeX=a.x-game.bird.x;
    game.resize(614.4,384);assert.equal(game.pipeCenter(a,.137),before);
    assert.ok(Math.abs(a.x-game.bird.x-relativeX)<1e-7,'camera changes do not change approach timing');
  }
  for(const hitRoof of [false,true]){
    const game=new Game({random:()=>.5});game.start();game.pipes=[];game.nextPipeAt=Infinity;
    game.spawnPipe(game.bird.x-10,2);const pipe=game.pipes[0];
    game.bird.y=pipe.center-(hitRoof?pipe.gap/2-game.bird.radius+2:0);game.bird.vy=0;
    game.update(PHYSICS.step);
    assert.equal(game.state,hitRoof?'falling':'playing','collision follows the moving opening');
    game.hit();const frozen={x:pipe.x,y:pipe.center,time:game.elapsed};game.update(.1);
    assert.deepEqual({x:pipe.x,y:game.pipeCenter(pipe),time:game.elapsed},frozen,'moving pairs freeze on impact');
  }
  let baseline;
  for(const width of [240,288,614.4])for(const fps of [30,60,144,240]){
    const game=new Game({width,random:seeded(71)});game.start();game.difficulty=2;game.pipes=[];game.nextPipeAt=Infinity;game.hit=()=>{};
    game.spawnPipe(game.bird.x+240,2);game.spawnPipe(game.bird.x+396,2);
    for(let frame=0;frame<fps;frame++){game.bird.y=168;game.bird.vy=0;game.update(1/fps);}
    const sample=game.pipes.map(p=>[p.x-game.bird.x,p.center,game.pipeCenter(p,.007)].map(n=>Number(n.toFixed(7))));
    baseline ||= sample;assert.deepEqual(sample,baseline,'motion and spacing are independent of device shape and refresh rate');
  }
  return 'Stage 2: bounded independent rails, constant 108-pixel gaps, real moving collisions, impact freeze and 30–240 Hz/device invariance passed.';
}

export function checkLevel2Variety(){
  let sameDirection=0,oppositeDirection=0,unevenSameDirection=0;
  const speeds=new Set(),patterns=new Set();
  for(let seed=1;seed<=150;seed++){
    const game=new Game({random:seeded(seed*173)});game.classicSpawned=5;
    for(let i=0;i<4;i++)game.spawnPipe(game.bird.x+PHYSICS.firstPipeDistance+i*PHYSICS.spacing,2);
    const pattern=[];
    for(let i=1;i<4;i++){
      const a=game.pipes[i-1],b=game.pipes[i],time=(b.x-game.bird.x)/PHYSICS.speed;
      speeds.add(b.verticalMotion.speed.toFixed(5));
      assert.ok(Math.abs(a.verticalMotion.speed-b.verticalMotion.speed)>=2-1e-7,'neighboring pairs do not share near-identical vertical speeds');
      assert.ok(Math.abs(a.verticalMotion.period-b.verticalMotion.period)>=.2,'different cycle lengths prevent persistent synchronized or mirrored motion');
      const ya=game.pipeCenter(a,time),yb=game.pipeCenter(b,time);
      const da=Math.sign(game.pipeCenter(a,time+.001)-ya),db=Math.sign(game.pipeCenter(b,time+.001)-yb);
      pattern.push(da===db?'same':'opposite');
      if(da===db){sameDirection++;if(Math.abs(ya-yb)>=28)unevenSameDirection++;}else oppositeDirection++;
    }
    patterns.add(pattern.join(','));
  }
  assert.ok(speeds.size>400,'speeds are continuously random rather than a few presets');
  assert.ok(sameDirection>50&&oppositeDirection>50,'both same-direction and opposite-direction neighbors occur');
  assert.ok(unevenSameDirection>30,'same-direction pairs can occupy visibly different heights');
  assert.ok(patterns.size>=7,'neighboring directions do not follow a fixed alternating pattern');
  return 'Stage 2 variety: 150 seeded four-pair sections use independent continuous speeds and cycle lengths, with mixed directions and distinct-height same-direction passages.';
}

export async function checkLevel2Rendering(){
  for(const [width,height,dpr] of [[480,640,1],[1233,980,1],[1920,1200,2],[390,844,3]]){
    const c=await createClient({width,height,dpr}),game=c.controller.game;
    c.controller.prepareRun();c.controller.flap();game.score=5;game.activateDifficulty();game.pipes=[];game.classicSpawned=5;game.nextPipeAt=Infinity;
    game.spawnPipe(200,2);const pipe=game.pipes[0],tops=[];
    for(let frame=0;frame<64;frame++){
      game.bird.y=168;game.bird.vy=0;c.tick(1/240);
      const images=c.elements.get('game').context.commands.filter(q=>q.kind==='image'&&q.args[2]===52);
      const top=images.find(q=>q.args[0]===112),bottom=images.find(q=>q.args[0]===168);
      const factor=top.matrix[0],topY=top.matrix[5]/factor+top.args[5]+top.args[7],bottomY=bottom.matrix[5]/factor+bottom.args[5];
      const center=game.pipeCenter(pipe,Math.max(0,game.accumulator));
      assert.ok(Math.abs(topY-(center-pipe.gap/2))<=.5/factor+1e-7,'cap follows the current subframe position to the nearest device pixel');
      assert.ok(Math.abs(bottomY-topY-LEVEL2_PHYSICS.gap)<1e-7,'both caps share one translation and retain the exact opening');
      assert.ok(Math.abs(top.matrix[5]-Math.round(top.matrix[5]))<1e-7,'sampling phase stays fixed on the device-pixel grid');
      assert.deepEqual(top.args.slice(0,4),[112,646,52,320],'upper source crop stays fixed throughout vertical motion');
      assert.deepEqual(bottom.args.slice(0,4),[168,646,52,320],'lower source crop stays fixed throughout vertical motion');
      assert.ok(topY-320<=0&&bottomY+320>=game.ground,'complete shafts cover the ceiling and ground through the full rail');
      tops.push(topY);
    }
    const factor=c.elements.get('game').context.commands.find(q=>q.kind==='image'&&q.args[0]===112&&q.args[2]===52).matrix[0];
    if(factor>=3)assert.ok(new Set(tops).size>16,'high-refresh rendering displays intermediate pixels between 60 Hz steps');
    assert.equal(c.images.join(','),'/assets/flappy/official-v1.3.png');
  }
  return 'Stage 2 rendering: fixed full-sprite crops and shared device-pixel translation eliminate sampling shimmer while preserving high-refresh previews and exact gaps across display scales.';
}
