import { FINAL_REFERENCE, CAPTURED_FINAL_CHUNKS, FINAL_OPENING_CHUNK } from './final-chunks.mjs';
import { fitPassage, postVertices, clipToGround, pathHeight } from './pipe-safety.mjs';
export const FINAL_TEST_SCORE=5;
export const FINAL_PIPE_SPEED=FINAL_REFERENCE.speed;
export const FINAL_CHUNK_KINDS=CAPTURED_FINAL_CHUNKS.map(chunk=>chunk.id);
export const FINAL_OPENING_ID=FINAL_OPENING_CHUNK.id;
export const PIPE_EXPOSURE={cap:26,ordinaryShaft:24,rapidShaft:2};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export class FinalDirector {
  constructor(random=Math.random){
    this.random=random;this.nextRapid=8+Math.floor(random()*3);this.nextLong=5+Math.floor(random()*3);
  }
  next(id){
    if(id===0)return FINAL_OPENING_ID;
    if(id>=this.nextRapid){this.nextRapid=id+8+Math.floor(this.random()*3);return 'rapid-gates-'+(this.random()<.5?2:3);}
    if(id>=this.nextLong&&this.nextRapid-id>1){this.nextLong=id+10+Math.floor(this.random()*5);return this.random()<.5?'long-dropping-tunnel':'long-low-tunnel';}
    return undefined;
  }
}
// Constant velocity, with an immediate, deterministic reversal at each end.
export function triangle(time,period,phase=0){
  const unit=((time/period+phase)%1+1)%1;
  return 1-4*Math.abs(unit-.5);
}
export function pipeMotion(pipe,xOffset=0,part){
  const motion=(part&&(pipe[part+'FittedMotion']||pipe[part+'Motion']))||pipe.fittedMotion||pipe.motion;
  if(!motion)return {x:0,y:0};
  const clockX=motion.type==='rush'?pipe.x:pipe.x-pipe.chunkOffset;
  const time=(pipe.referenceBirdX-clockX-xOffset-pipe.width/2)/FINAL_PIPE_SPEED;
  if(motion.type==='rush'){
    // The fixed maximum-view approach is relative to the bird, not the screen
    // center. Extra travel starts offscreen, so a visible gate is already moving.
    const duration=(motion.trigger+pipe.width+motion.passMargin)/(FINAL_PIPE_SPEED+motion.speed);
    return {x:-clamp((time+(motion.trigger+pipe.width/2)/FINAL_PIPE_SPEED)*motion.speed,0,motion.speed*duration),y:0};
  }
  const y=motion.amplitude*triangle(time,motion.period,motion.phase);
  const angle=(part==='top'?pipe.topRecord:pipe.bottomRecord)[2];
  return {x:motion.alongShaft?-Math.tan(angle)*y:0,y};
}
export function pipePose(pipe,xOffset=0){
  if(pipe.level!=='final')return {center:pipe.center,angle:0};
  const upper=pipeMotion(pipe,xOffset,'top'),lower=pipeMotion(pipe,xOffset,'bottom');
  const pairedLift=pipe.pairedLift||0;
  const top={x:pipe.topRecord[0]+upper.x,y:pipe.topRecord[1]+pipe.verticalOffset+upper.y-(pipe.upperRetraction||0)-pairedLift-(pipe.capRoofLift||0),angle:pipe.topRecord[2]};
  const lift=pipe.floorLift||0,angle=pipe.bottomRecord[2];
  const bottom={x:pipe.bottomRecord[0]+lower.x+Math.tan(angle)*lift,y:pipe.bottomRecord[1]+pipe.verticalOffset+lower.y+(pipe.lowerRetraction||0)-lift-pairedLift,angle};
  return {top,bottom,center:(top.y+bottom.y)/2,angle:0};
}
function basePose(pipe){
  const pose=pipePose(pipe);
  for(const part of ['top','bottom']){const shift=pipeMotion(pipe,0,part);pose[part].x-=shift.x;pose[part].y-=shift.y;}
  pose.center=(pose.top.y+pose.bottom.y)/2;return pose;
}
export function fitFloorVisibility(pipes,ground){
  const groups=new Map();
  for(const pipe of pipes){
    if(pipe.level!=='final')continue;
    pipe.floorLift=0;pipe.pairedLift=0;pipe.capRoofLift=0;pipe.fittedMotion=undefined;pipe.bottomFittedMotion=undefined;
  }
  for(const pipe of pipes){
    if(pipe.level!=='final')continue;
    const post=basePose(pipe).bottom,motion=pipe.bottomMotion||pipe.motion;
    const amplitude=motion?.amplitude||0;
    const shaft=pipe.lowDip?PIPE_EXPOSURE.rapidShaft:PIPE_EXPOSURE.ordinaryShaft;
    const depth=pipe.width/2*Math.abs(Math.sin(post.angle))+(PIPE_EXPOSURE.cap+shaft)*Math.cos(post.angle);
    const excess=Math.max(0,post.y+amplitude+depth-ground);
    if(motion?.type!=='triangle'){pipe.floorLift=excess;continue;}
    const paired=!pipe.bottomMotion;
    const key=[pipe.chunkId,pipe.safetyGroup,paired?'pair':'floor',motion.group??'',motion.period,motion.phase].join(':');
    if(!groups.has(key))groups.set(key,{pipes:[],motion,paired,excess:0});
    const group=groups.get(key);group.pipes.push(pipe);group.excess=Math.max(group.excess,excess);
  }
  for(const {pipes:bank,motion,paired,excess} of groups.values()){
    if(excess<=0)continue;
    const amplitude=Math.max(Math.min(8,motion.amplitude),motion.amplitude-excess/2);
    const lift=excess-motion.amplitude+amplitude;
    const fitted={...motion,amplitude,period:motion.period*amplitude/motion.amplitude};
    for(const pipe of bank){
      // Turn earlier at the lower bound, preserving the original upper extent
      // and linear speed. Fit whole groups together; never pause via clamping.
      if(paired){pipe.pairedLift=lift;pipe.fittedMotion=fitted;}
      else{pipe.floorLift=lift;pipe.bottomFittedMotion=fitted;}
    }
  }
  for(const pipe of pipes)if(pipe.level==='final'&&pipe.topRecord[2]===0&&pipe.bottomRecord[2]===0){
    const pose=basePose(pipe);
    // Raising a submerged static floor must not shrink a normal gate below
    // the original game's 100-pixel opening. Lift its roof only if needed.
    pipe.capRoofLift=Math.max(0,100-(pose.bottom.y-pose.top.y));
  }
}
function postEndX(pipe,ground,part){
  const post=basePose(pipe)[part],motion=pipe[part+'FittedMotion']||pipe[part+'Motion']||pipe.fittedMotion||pipe.motion,amplitude=motion?.amplitude||0;
  let end=-Infinity;
  for(const dy of [-amplitude,amplitude]){
    const dx=motion?.alongShaft?-Math.tan(post.angle)*dy:0;
    const polygon=clipToGround(postVertices(pipe,{...post,x:post.x+dx,y:post.y+dy},part==='top',pipeShaftLength(pipe,ground)),ground);
    for(const point of polygon)end=Math.max(end,point[0]);
  }
  return end;
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
  let choices=CAPTURED_FINAL_CHUNKS.filter(c=>c.id!==previousKind&&!c.rare);
  // Never concatenate dense slices into an endless tunnel.
  const dense=family=>['tunnel','rising','diagonal'].includes(family);
  if(dense(previous?.family))choices=choices.filter(c=>c.family!==previous.family);
  const source=kind===FINAL_OPENING_ID?FINAL_OPENING_CHUNK:kind?CAPTURED_FINAL_CHUNKS.find(c=>c.id===kind):choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
  const amplitude=Math.max(...source.pairs.flatMap(p=>[p.motion?.amplitude||0,p.topMotion?.amplitude||0,p.bottomMotion?.amplitude||0]));
  const nominalCenter=168+(ground-336)/2;
  const layoutOffset=clamp(entryCenter??nominalCenter,90+amplitude,ground-90-amplitude)-nominalCenter;
  const verticalOffset=(ground-336)/2-64+layoutOffset;
  const pipes=source.pairs.map(pair=>{
    const dx=pair.dx+(source.entryInset||0);
    const pipe={x:x+dx,chunkOffset:dx,width,gap:pair.bottom[1]-pair.top[1],level:'final',kind:source.id,chunkId:id,scored:false,
      topRecord:pair.top,bottomRecord:pair.bottom,motion:pair.motion,topMotion:pair.topMotion,bottomMotion:pair.bottomMotion,
      safetyGroup:pair.safetyGroup||0,allowRoofOverlap:pair.allowRoofOverlap||false,lowDip:source.rare==='rapid',verticalOffset,layoutOffset,referenceBirdX};
    return Object.assign(pipe,pipePose(pipe));
  });
  // A close moving-gate continuation clears the preceding angled floors at
  // any viewport height. Only its designated upper connection may overlap.
  for(let i=0;i<pipes.length;i++)if(source.pairs[i].afterFloor){
    const edge=Math.max(...pipes.slice(0,i).map(p=>postEndX(p,ground,'bottom')))+3;
    pipes[i].x=Math.max(pipes[i].x,edge);pipes[i].chunkOffset=pipes[i].x-x;
  }
  let endX=Math.max(...pipes.map(p=>p.x+width));
  const safety=fitPassage({pipes,x,nextX:endX+source.clearance,ground,entryCenter,
    pose:basePose,envelope:basePose,length:pipeShaftLength});
  // Preserve clean parallel edges: retract the entire roof/floor as a bank.
  for(const group of new Set(pipes.map(p=>p.safetyGroup))){
    const bank=pipes.filter(p=>p.safetyGroup===group);
    const upper=Math.max(...bank.map(p=>p.upperRetraction||0)),lower=Math.max(...bank.map(p=>p.lowerRetraction||0));
    for(const pipe of bank){pipe.upperRetraction=upper;pipe.lowerRetraction=lower;}
  }
  fitFloorVisibility(pipes,ground);
  // Reserve the full visible shaft footprint, at both movement extremes.
  // The next chunk begins after these tails, not merely after the last cap.
  for(const pipe of pipes){
    for(const part of ['top','bottom'])endX=Math.max(endX,postEndX(pipe,ground,part));
  }
  const nextX=endX+source.clearance;
  const nodes=safety.nodes.slice(0,-2),exit=nodes.at(-1)[1];nodes.push([endX,exit],[nextX,exit]);
  for(const pipe of pipes)Object.assign(pipe,pipePose(pipe));
  return {kind:source.id,family:source.family,pipes,nextX,endX,startX:x,exitCenter:exit,safePath:nodes,source:source.source};
}
// Analysis route follows the same shared clock as the moving bank, then blends
// back to its nominal exit through the empty interlude. It never moves the bird.
export function flightTarget(chunk,x,clockX=x){
  const floor=chunk.pipes.find(p=>p.bottomMotion);
  if(floor){
    const nearest=chunk.pipes.reduce((best,p)=>Math.abs(p.x+p.width/2-x)<Math.abs(best.x+best.width/2-x)?p:best);
    const shift=pipeMotion({...nearest,referenceBirdX:clockX},0,'bottom');
    const blend=clamp((x-(chunk.startX-104))/104,0,1)*clamp((chunk.nextX-x)/(chunk.nextX-chunk.endX),0,1);
    return pathHeight(chunk.safePath,x)+shift.y*.5*blend;
  }
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
