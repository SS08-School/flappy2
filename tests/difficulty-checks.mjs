import assert from 'node:assert/strict';
import { Game,PHYSICS } from '../public/engine.mjs';
import { FINAL_TEST_SCORE,FINAL_PIPE_SPEED,FINAL_OPENING_ID,FINAL_CHUNK_KINDS,createFinalChunk,pipePose,pipeMotion,finalPipeHits,pipeBounds,pipeScoreX,triangle } from '../public/difficulty.mjs';
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
    assert.equal(chunk.pipes.length,source.pairs.length);
    chunk.pipes.forEach((p,j)=>{
      assert.equal(p.width,52);assert.equal(p.x,614.4+source.pairs[j].dx+(source.entryInset||0));
      assert.deepEqual(p.topRecord,source.pairs[j].top);assert.deepEqual(p.bottomRecord,source.pairs[j].bottom);
      assert.ok(pipeBounds(p,336).minX>=614.4-1e-8);
      assert.equal(p.upperRetraction,chunk.pipes[0].upperRetraction,'whole roof stays aligned');
      assert.equal(p.lowerRetraction,chunk.pipes[0].lowerRetraction,'whole floor stays aligned');
    });
    assert.ok(chunk.nextX-chunk.endX>=104-1e-7,'clear separation after visible shafts');
    previousKind=chunk.kind;previousFamily=chunk.family;
  }
  assert.equal(seen.size,8);
  const flat=chunkOfKind('stationary-tunnel');assert.equal(flat.pipes.length,5);
  assert.equal(flat.pipes.at(-1).x-flat.pipes[0].x+52,260,'short stationary section, not a concatenated tunnel');
  for(const p of flat.pipes){assert.equal(p.motion,undefined);assert.deepEqual(atTime(p,0),atTime(p,20));}
  const rising=chunkOfKind('rising-trio');assert.equal(rising.pipes.length,3);
  const initial=rising.pipes.map(p=>atTime(p,0).center),later=rising.pipes.map(p=>atTime(p,1).center);
  assert.ok(later.every((y,i)=>y<initial[i]),'three gates rise together');
  assert.ok(later.every(y=>Math.abs(y-later[0])<1e-8));
  for(const kind of ['diagonal-rise','diagonal-fall']){
    const bank=chunkOfKind(kind);assert.equal(bank.pipes.length,3);
    for(const p of bank.pipes){assert.equal(p.top.angle,Math.PI/4);assert.equal(p.bottom.angle,-Math.PI/4);}
    for(let time=0;time<6;time+=.13){
      const shifts=bank.pipes.map(p=>{atTime(p,time);return pipeMotion(p).y;});
      assert.ok(shifts.every(y=>Math.abs(y-shifts[0])<1e-8),'a whole bank shares one phase');
    }
    const p=bank.pipes[0],post=pipePose(p).top;
    assert.ok(finalPipeHits(p,{x:p.x+26+post.x+Math.sin(post.angle)*4,y:post.y-Math.cos(post.angle)*4,radius:12},336));
  }
  const shutter=chunkOfKind('reversing-gates').pipes[0],m=shutter.motion;
  const turn=(.5-m.phase)*m.period,epsilon=.001;
  const left=(triangle(turn,m.period,m.phase)-triangle(turn-epsilon,m.period,m.phase))/epsilon;
  const right=(triangle(turn+epsilon,m.period,m.phase)-triangle(turn,m.period,m.phase))/epsilon;
  assert.ok(Math.abs(left-4/m.period)<1e-7&&Math.abs(right+4/m.period)<1e-7,'instant reversal, no slowdown');
  for(let t=-2;t<2;t+=.01){assert.ok(Math.abs(atTime(shutter,t).top.y-atTime(shutter,t+m.period).top.y)<1e-7);}
  const rush=chunkOfKind('left-rush-gates'),p=rush.pipes[0];
  p.referenceBirdX=p.x-261;assert.ok(Math.abs(pipeMotion(p).x)<1e-8,'lunge waits for a readable approach');
  p.referenceBirdX=p.x-200;assert.ok(pipeMotion(p).x<0);assert.ok(pipeScoreX(p)<p.x+13,'points follow the actual moving gate');
  p.referenceBirdX=p.x+200;assert.equal(pipeMotion(p).x,-96);
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
  return 'Final: fixed introduction at 5, eight short distinct sections, synchronized banks, sharp constant-speed reversals, isolated left lunges, accurate scoring and FPS consistency passed.';
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
