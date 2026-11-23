import { FINAL_REFERENCE, CAPTURED_FINAL_CHUNKS, FINAL_OPENING_CHUNK } from './final-chunks.mjs';
import { fitPassage, postVertices, clipToGround, pathHeight } from './pipe-safety.mjs';
export const FINAL_TEST_SCORE=5;
export const FINAL_PIPE_SPEED=FINAL_REFERENCE.speed;
export const FINAL_CHUNK_KINDS=CAPTURED_FINAL_CHUNKS.map(chunk=>chunk.id);
export const FINAL_OPENING_ID=FINAL_OPENING_CHUNK.id;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// Constant velocity, with an immediate, deterministic reversal at each end.
export function triangle(time,period,phase=0){
  const unit=((time/period+phase)%1+1)%1;
  return 1-4*Math.abs(unit-.5);
}
export function pipeMotion(pipe,xOffset=0){
  if(!pipe.motion)return {x:0,y:0};
  const clockX=pipe.motion.type==='rush'?pipe.x:pipe.x-pipe.chunkOffset;
  const time=(pipe.referenceBirdX-clockX-xOffset-pipe.width/2)/FINAL_PIPE_SPEED;
  if(pipe.motion.type==='rush')return {x:-clamp((time+(pipe.motion.trigger+pipe.width/2)/FINAL_PIPE_SPEED)*pipe.motion.speed,0,pipe.motion.distance),y:0};
  return {x:0,y:pipe.motion.amplitude*triangle(time,pipe.motion.period,pipe.motion.phase)};
}
export function pipePose(pipe,xOffset=0){
  if(pipe.level!=='final')return {center:pipe.center,angle:0};
  const shift=pipeMotion(pipe,xOffset);
  const top={x:pipe.topRecord[0]+shift.x,y:pipe.topRecord[1]+pipe.verticalOffset+shift.y-(pipe.upperRetraction||0),angle:pipe.topRecord[2]};
  const bottom={x:pipe.bottomRecord[0]+shift.x,y:pipe.bottomRecord[1]+pipe.verticalOffset+shift.y+(pipe.lowerRetraction||0),angle:pipe.bottomRecord[2]};
  return {top,bottom,center:(top.y+bottom.y)/2,angle:0};
}
function basePose(pipe){
  const pose=pipePose(pipe),shift=pipeMotion(pipe);
  for(const post of [pose.top,pose.bottom]){post.x-=shift.x;post.y-=shift.y;}
  pose.center-=shift.y;return pose;
}
export function pipeShaftLength(pipe,ground){return (ground+400)/Math.SQRT1_2;}
export function pipeBounds(pipe,ground,xOffset=0){
  const pose=pipePose(pipe,xOffset),length=pipeShaftLength(pipe,ground);let minX=Infinity,maxX=-Infinity;
  for(const [post,up] of [[pose.top,true],[pose.bottom,false]]){
    const polygon=clipToGround(postVertices({...pipe,x:pipe.x+xOffset},post,up,length),ground);
    for(const point of polygon){minX=Math.min(minX,point[0]);maxX=Math.max(maxX,point[0]);}
  }
  return {minX,maxX};
}
export function pipeHorizontalExtent(pipe,ground){const b=pipeBounds(pipe,ground),center=pipe.x+pipe.width/2;return Math.max(center-b.minX,b.maxX-center);}
export function pipeScoreX(pipe){return pipe.x+pipe.width/4+(pipe.motion?.type==='rush'?pipePose(pipe).top.x:0);}
export function finalPipeHits(pipe,bird,ground){
  const pose=pipePose(pipe),length=pipeShaftLength(pipe,ground);
  return [[pose.top,true],[pose.bottom,false]].some(([post,up])=>{
    const dx=bird.x-pipe.x-pipe.width/2-post.x,dy=bird.y-post.y;
    const x=dx*Math.cos(post.angle)+dy*Math.sin(post.angle),y=-dx*Math.sin(post.angle)+dy*Math.cos(post.angle);
    const nearX=clamp(x,-pipe.width/2,pipe.width/2),nearY=clamp(y,up?-length:0,up?0:length);
    return (x-nearX)**2+(y-nearY)**2<bird.radius**2;
  });
}
export function createFinalChunk({x,ground,entryCenter,random=Math.random,previousKind,id=0,width=52,referenceBirdX=188,kind}){
  const previous=CAPTURED_FINAL_CHUNKS.find(c=>c.id===previousKind);
  let choices=CAPTURED_FINAL_CHUNKS.filter(c=>c.id!==previousKind);
  // Never concatenate dense slices into an endless tunnel.
  const dense=family=>['tunnel','rising','diagonal'].includes(family);
  if(dense(previous?.family))choices=choices.filter(c=>c.family!==previous.family);
  const source=kind===FINAL_OPENING_ID?FINAL_OPENING_CHUNK:kind?CAPTURED_FINAL_CHUNKS.find(c=>c.id===kind):choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
  const amplitude=Math.max(...source.pairs.map(p=>p.motion?.amplitude||0));
  const nominalCenter=168+(ground-336)/2;
  const layoutOffset=clamp(entryCenter??nominalCenter,90+amplitude,ground-90-amplitude)-nominalCenter;
  const verticalOffset=(ground-336)/2-64+layoutOffset;
  const pipes=source.pairs.map(pair=>{
    const dx=pair.dx+(source.entryInset||0);
    const pipe={x:x+dx,chunkOffset:dx,width,gap:pair.bottom[1]-pair.top[1],level:'final',kind:source.id,chunkId:id,scored:false,
      topRecord:pair.top,bottomRecord:pair.bottom,motion:pair.motion,verticalOffset,layoutOffset,referenceBirdX};
    return Object.assign(pipe,pipePose(pipe));
  });
  let endX=Math.max(...pipes.map(p=>p.x+width));
  const safety=fitPassage({pipes,x,nextX:endX+source.clearance,ground,entryCenter,
    pose:basePose,envelope:basePose,length:pipeShaftLength});
  // Preserve clean parallel edges: retract the entire roof/floor as a bank.
  const upper=Math.max(...pipes.map(p=>p.upperRetraction||0)),lower=Math.max(...pipes.map(p=>p.lowerRetraction||0));
  for(const pipe of pipes){pipe.upperRetraction=upper;pipe.lowerRetraction=lower;}
  // Reserve the full visible shaft footprint, at both movement extremes.
  // The next chunk begins after these tails, not merely after the last cap.
  for(const pipe of pipes){
    const base=basePose(pipe),dy=pipe.motion?.amplitude||0;
    for(const shift of [-dy,dy])for(const [post,up] of [[base.top,true],[base.bottom,false]]){
      const polygon=clipToGround(postVertices(pipe,{...post,y:post.y+shift},up,pipeShaftLength(pipe,ground)),ground);
      for(const point of polygon)endX=Math.max(endX,point[0]);
    }
  }
  const nextX=endX+source.clearance;
  const nodes=safety.nodes.slice(0,-2),exit=nodes.at(-1)[1];nodes.push([endX,exit],[nextX,exit]);
  for(const pipe of pipes)Object.assign(pipe,pipePose(pipe));
  return {kind:source.id,family:source.family,pipes,nextX,endX,startX:x,exitCenter:exit,safePath:nodes,source:source.source};
}
// Analysis route follows the same shared clock as the moving bank, then blends
// back to its nominal exit through the empty interlude. It never moves the bird.
export function flightTarget(chunk,x,clockX=x){
  const moving=chunk.pipes.find(p=>p.motion?.type==='triangle');
  if(!moving)return pathHeight(chunk.safePath,x);
  const anchor=moving.x-moving.chunkOffset;
  const time=(clockX-anchor-moving.width/2)/FINAL_PIPE_SPEED;
  const shift=moving.motion.amplitude*triangle(time,moving.motion.period,moving.motion.phase);
  const first=moving.x+moving.width/2;
  const partial=chunk.pipes.some(p=>p.motion?.type!=='triangle');
  const fadeStart=partial?moving.x+moving.width+12:chunk.endX;
  const fadeEnd=partial?fadeStart+78:chunk.nextX;
  const weight=clamp((x-(chunk.startX-104))/(first-(chunk.startX-104)),0,1)*clamp((fadeEnd-x)/(fadeEnd-fadeStart),0,1);
  return pathHeight(chunk.safePath,x)+shift*weight;
}
