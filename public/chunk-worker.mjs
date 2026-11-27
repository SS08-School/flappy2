import { buildPreparedChunk } from './chunk-prefetch.mjs';

self.addEventListener('message',({data})=>{
  const {generation,id}=data;
  try{self.postMessage({generation,id,chunk:buildPreparedChunk(data)});}
  catch(error){self.postMessage({generation,id,error:String(error)});}
});
