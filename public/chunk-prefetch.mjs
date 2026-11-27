import { createLevel3Chunk } from './difficulty.mjs';

export function buildPreparedChunk({options,seed}) {
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  return createLevel3Chunk({...options,random});
}

// Geometry fitting can exceed a display frame. Keep it off the thread that
// receives presses; the engine requests it several seconds before arrival.
export function createChunkPrefetch({makeWorker=()=>new Worker(new URL('./chunk-worker.mjs',import.meta.url),{type:'module'})}={}) {
  if(typeof Worker==='undefined'&&arguments.length===0)return null;
  let worker;
  try{worker=makeWorker();}catch{return null;}
  let generation=0,failed=false;
  const pending=new Map(),ready=new Map();
  worker.addEventListener('message',({data})=>{
    if(data.generation!==generation||!pending.has(data.id))return;
    if(data.error){failed=true;return;}
    ready.set(data.id,data.chunk);
  });
  worker.addEventListener('error',()=>{failed=true;});
  return {
    reset(){generation++;pending.clear();ready.clear();},
    take(request){
      if(ready.has(request.id)){
        const chunk=ready.get(request.id);ready.delete(request.id);pending.delete(request.id);return chunk;
      }
      if(!pending.has(request.id)){
        const {random,...options}=request;
        const job={generation,id:request.id,options,seed:Math.floor(random()*4294967296)>>>0};
        pending.set(request.id,job);
        if(!failed)try{worker.postMessage(job);}catch{failed=true;}
      }
      // Browsers without working module workers retain the existing generator.
      if(failed){const job=pending.get(request.id);pending.delete(request.id);return buildPreparedChunk(job);}
      return null;
    },
  };
}
