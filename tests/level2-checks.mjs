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
  for(let frame=0;frame<720;frame++){
    game.bird.y=168;game.bird.vy=0;game.update(PHYSICS.step);
    for(const pipe of game.pipes)if(!seen.has(pipe)){
      seen.add(pipe);spawned.push(pipe);
      origins.set(pipe,pipe.x+game.distance);
      assert.ok(pipe.x>=game.width-1e-8,'all three stages are prepared offscreen');
    }
    const expected=game.score<LEVEL2_TEST_SCORE?1:game.score<LEVEL3_TEST_SCORE?2:3;
    assert.equal(game.difficulty,expected,'score 5 starts stage 2; score 7 starts stage 3');
    if(expected===2)assert.equal(game.speed,PHYSICS.speed,'stage 2 keeps stage 1 horizontal speed');
    assert.equal(game.state,'playing','the default moving pair path remains playable');
  }
  assert.deepEqual(spawned.slice(0,7).map(p=>p.level),[1,1,1,1,1,2,2]);
  assert.equal(spawned.filter(p=>p.level===2).length,LEVEL2_TEST_LENGTH);
  for(let i=1;i<7;i++)assert.ok(Math.abs(origins.get(spawned[i])-origins.get(spawned[i-1])-PHYSICS.spacing)<1e-7,'stage 1/2 keep exactly 156-pixel spacing, including their handoff');
  assert.deepEqual(changes,[[2,5],[3,7]],'each stage change occurs once at the requested score');
  const positions=game.pipes.map(p=>p.x);game.activateDifficulty();
  assert.deepEqual(game.pipes.map(p=>p.x),positions,'stage activation never replaces or teleports visible pipes');
  game.start();assert.equal(game.difficulty,1);assert.equal(game.score,0);
  return 'Stage progression: five original pairs, exactly two independently moving pairs, then the existing stage 3 opener; spacing, offscreen births and replay passed.';
}

export function checkLevel2Motion(){
  for(const random of [()=>0,()=>1,seeded(153)]){
    const game=new Game({random});game.classicSpawned=5;
    for(let i=0;i<16;i++)game.spawnPipe(i*156,2);
    for(const pipe of game.pipes){
      assert.ok(pipe.baseCenter>=100&&pipe.baseCenter<=236,'stage 2 uses the original random base-height range');
      assert.equal(pipe.gap,108);assert.equal(pipe.width,52);
      const motion=pipe.verticalMotion;let last,up=false,down=false;
      assert.ok(motion.speed>=16&&motion.speed<=22,'motion remains gentle');
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

export async function checkLevel2Rendering(){
  const c=await createClient({width:480,height:640}),game=c.controller.game;
  c.controller.prepareRun();c.controller.flap();game.score=5;game.activateDifficulty();game.pipes=[];game.classicSpawned=5;game.nextPipeAt=Infinity;
  game.spawnPipe(200,2);const pipe=game.pipes[0],tops=[];
  for(let frame=0;frame<64;frame++){
    game.bird.y=168;game.bird.vy=0;c.tick(1/240);
    const images=c.elements.get('game').context.commands.filter(q=>q.kind==='image'&&q.args[2]===52);
    const top=images.find(q=>q.args[0]===112),bottom=images.find(q=>q.args[0]===168);
    const center=game.pipeCenter(pipe,Math.max(0,game.accumulator));
    assert.ok(Math.abs(top.args[7]-(center-pipe.gap/2))<1e-7,'upper pipe previews the current subframe motion');
    assert.ok(Math.abs(bottom.args[5]-(center+pipe.gap/2))<1e-7,'lower pipe shares exactly the same motion');
    assert.ok(Math.abs(bottom.args[5]-top.args[7]-LEVEL2_PHYSICS.gap)<1e-7);
    tops.push(top.args[7]);
  }
  assert.ok(new Set(tops.map(n=>n.toFixed(6))).size>55,'240 Hz drawing does not wait for 60 Hz physics ticks');
  assert.equal(c.images.join(','),'/assets/flappy/official-v1.3.png');
  return 'Stage 2 rendering: paired official pipe sprites share one fixed opening and move smoothly between physics ticks.';
}
