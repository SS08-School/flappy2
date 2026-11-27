import assert from 'node:assert/strict';
import { Game,PHYSICS } from '../public/engine.mjs';
import { createChunkPrefetch,buildPreparedChunk } from '../public/chunk-prefetch.mjs';
import { pipeBounds,pipePose } from '../public/difficulty.mjs';

function controlledWorker(){
  const events=new Map(),jobs=[];
  return {jobs,addEventListener:(name,fn)=>events.set(name,fn),postMessage:job=>jobs.push(job),
    deliver(job){events.get('message')({data:{generation:job.generation,id:job.id,chunk:structuredClone(buildPreparedChunk(job))}});},
    fail(){events.get('error')();}};
}
const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function checkBackgroundPrefetch(){
  let arrivals=0;
  for(const seed of [17,41,823])for(const deliveryFrames of [1,6]){
    const worker=controlledWorker(),prefetch=createChunkPrefetch({makeWorker:()=>worker});
    const game=new Game({width:614.4,random:seeded(seed),chunkPrefetch:prefetch});
    game.start();game.hit=()=>{};
    let waitingSince=0;
    for(let frame=0;frame<4500;frame++){
      if(frame===1700)game.resize(240,384);if(frame===2100)game.resize(614.4,384);
      if(worker.jobs.length&&frame-waitingSince>=deliveryFrames){worker.deliver(worker.jobs.shift());waitingSince=frame;}
      const before=new Map(game.pipes.filter(p=>p.level===3).map(p=>[p,{x:p.x,pose:pipePose(p)}]));
      const queued=worker.jobs.length;
      const distanceBefore=game.distance;
      game.bird.y=168;game.bird.vy=0;game.update(PHYSICS.step);
      if(!queued&&worker.jobs.length)waitingSince=frame;
      for(const pipe of game.pipes.filter(p=>p.level===3)){
        if(!before.has(pipe)){
          arrivals++;assert.ok(pipeBounds(pipe,game.ground).minX>=game.width,'worker results enter the queue before becoming visible');
        }else{
          const previous=before.get(pipe),pose=pipePose(pipe);
          assert.ok(Math.abs(pipe.x-previous.x+game.distance-distanceBefore)<1e-7,'delivery never rewinds an existing obstacle');
          if(!pipe.motion&&!pipe.topMotion&&!pipe.bottomMotion)assert.ok(Math.abs(pose.top.x-previous.pose.top.x)<1e-7,'background generation never moves unrelated pipes');
        }
      }
      if(worker.jobs.length){
        const count=worker.jobs.length,serial=game.chunkSerial;
        game.flap();assert.equal(game.bird.vy,PHYSICS.flap,'a pending worker job cannot defer a flap');
        assert.equal(game.chunkSerial,serial);assert.equal(worker.jobs.length,count,'flaps never duplicate or synchronously build the pending job');
      }
    }
    assert.ok(game.chunkSerial>=12,'delayed generation supplies a full live run');
  }
  const worker=controlledWorker(),prefetch=createChunkPrefetch({makeWorker:()=>worker});
  const game=new Game({width:614.4,chunkPrefetch:prefetch,random:seeded(22)});
  game.start();assert.equal(game.appendLevel3Chunk(),false);
  const old=worker.jobs.shift();game.start();assert.equal(game.appendLevel3Chunk(),false);
  const current=worker.jobs.shift();worker.deliver(old);
  assert.equal(game.appendLevel3Chunk(),false,'replay discards a previous run worker result');
  worker.deliver(current);
  const expected=buildPreparedChunk(current);
  game.distance+=12;game.resize(240,384);
  const shift=game.bird.x-current.options.referenceBirdX-12;
  assert.equal(game.appendLevel3Chunk(),true);
  for(let i=0;i<expected.pipes.length;i++){
    const actual=game.pipes.filter(p=>p.level===3)[i],original=expected.pipes[i];
    assert.ok(Math.abs(actual.x-original.x-shift)<1e-7,'delivery compensates exactly for scrolling and rotation');
    assert.deepEqual(pipePose(actual),pipePose({...original,x:original.x+shift,referenceBirdX:game.bird.x}),'delivery retains the exact captured movement phase');
  }
  const fallbackWorker=controlledWorker(),fallback=createChunkPrefetch({makeWorker:()=>fallbackWorker});
  fallbackWorker.fail();assert.ok(fallback.take({...current.options,random:seeded(2)}),'unsupported workers retain playable fallback generation');
  assert.ok(arrivals>150);
  return 'Background prefetch: delayed results, scrolling, rotation, replay cancellation, immediate flaps and worker failure fallback pass.';
}
