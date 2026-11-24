import { FINAL_REFERENCE, CAPTURED_FINAL_CHUNKS, FINAL_OPENING_CHUNK } from './final-chunks.mjs';
import { fitPassage, postVertices, clipToGround, pathHeight, slabRange } from './pipe-safety.mjs';
export const FINAL_TEST_SCORE=5;
export const FINAL_PIPE_SPEED=FINAL_REFERENCE.speed;
export const FINAL_CHUNK_KINDS=CAPTURED_FINAL_CHUNKS.map(chunk=>chunk.id);
export const FINAL_OPENING_ID=FINAL_OPENING_CHUNK.id;
export const PIPE_EXPOSURE={cap:26,ordinaryShaft:24,rapidShaft:2,ceilingMargin:12};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export class FinalDirector {
  constructor(random=Math.random){
    this.random=random;this.nextLong=5+Math.floor(random()*3);this.recent=[];this.lastDescent=-Infinity;this.lastPlunger=-Infinity;
  }
  next(id){
    let kind;
    if(id===0)kind=FINAL_OPENING_ID;
    else if(id>=this.nextLong){
      this.nextLong=id+10+Math.floor(this.random()*5);kind=this.random()<.5?'long-dropping-tunnel':'long-low-tunnel';
    }else{
      const last=CAPTURED_FINAL_CHUNKS.find(c=>c.id===this.recent.at(-1));
      let pool=CAPTURED_FINAL_CHUNKS.filter(c=>!c.rare&&!this.recent.includes(c.id)&&(id>=5||!['rush','plunger'].includes(c.family))&&(c.id!=='descending-pursuit'||id>=5&&id-this.lastDescent>=8)&&(c.id!=='tunnel-plunger'||id-this.lastPlunger>=8));
      const varied=pool.filter(c=>c.family!==last?.family);if(varied.length)pool=varied;
      const motifs=this.recent.map(k=>CAPTURED_FINAL_CHUNKS.find(c=>c.id===k)?.motif);
      const different=pool.filter(c=>!c.motif||!motifs.includes(c.motif));if(different.length)pool=different;
      kind=pool[Math.min(pool.length-1,Math.floor(this.random()*pool.length))].id;
    }
    if(kind==='descending-pursuit')this.lastDescent=id;
    if(kind==='tunnel-plunger')this.lastPlunger=id;
    this.recent.push(kind);if(this.recent.length>5)this.recent.shift();
    return kind;
  }
}
// Constant velocity, with an immediate, deterministic reversal at each end.
export function triangle(time,period,phase=0){
  const unit=((time/period+phase)%1+1)%1;
  return 1-4*Math.abs(unit-.5);
}
export function motionRange(motion){
  return ['sweep','rail','bank','plunger'].includes(motion?.type)?[Math.min(motion.from,motion.to),Math.max(motion.from,motion.to)]:[-(motion?.amplitude||0),motion?.amplitude||0];
}
export function railPosition(time,motion){
  const distance=Math.abs(motion.to-motion.from),forward=distance/motion.speed,back=distance/(motion.returnSpeed||motion.speed),period=forward+back;
  const at=((time-motion.start)%period+period)%period;
  const travel=at<forward?at*motion.speed:distance-(at-forward)*(motion.returnSpeed||motion.speed);
  return motion.from+Math.sign(motion.to-motion.from)*travel;
}
function rushPosition(time,motion,width){
  const lead=(motion.trigger+width/2)/FINAL_PIPE_SPEED;
  const holdStart=-motion.speed*lead/(FINAL_PIPE_SPEED+motion.speed),hold=motion.hold||0;
  if(!hold||time<holdStart)return -Math.max(0,(time+lead)*motion.speed);
  const start=-(holdStart+lead)*motion.speed;
  return start+Math.min(time-holdStart,hold)*FINAL_PIPE_SPEED;
}
export function pipeMotion(pipe,xOffset=0,part){
  const motion=(part&&(pipe[part+'FittedMotion']||pipe[part+'Motion']))||pipe.fittedMotion||pipe.motion;
  if(!motion)return {x:0,y:0};
  const clockX=motion.type==='rush'?pipe.x:pipe.x-pipe.chunkOffset;
  const time=(pipe.referenceBirdX-clockX-xOffset-pipe.width/2)/FINAL_PIPE_SPEED;
  if(motion.type==='rush'){
    // The fixed maximum-view approach is relative to the bird, not the screen
    // center. Extra travel starts offscreen, so a visible gate is already moving.
    let previousRight=-Infinity,left;
    for(const ahead of [...(pipe.rushAhead||[]),{distance:0,motion,width:pipe.width}]){
      const at=pipe.x-ahead.distance,clock=(pipe.referenceBirdX-at-xOffset-ahead.width/2)/FINAL_PIPE_SPEED;
      left=Math.max(at+rushPosition(clock,ahead.motion,ahead.width),previousRight+3);
      previousRight=left+ahead.width;
    }
    return {x:left-pipe.x,y:0};
  }
  const y=motion.type==='bank'?(time<=motion.start?motion.from:time<=motion.start+Math.abs(motion.to-motion.from)/motion.speed
    ?motion.from+Math.sign(motion.to-motion.from)*(time-motion.start)*motion.speed
    :motion.to+Math.sign(motion.from-motion.to)*Math.min(Math.abs(motion.to-motion.from),(time-motion.start-Math.abs(motion.to-motion.from)/motion.speed)*motion.returnSpeed))
    :motion.type==='plunger'?railPosition(time<=motion.slowAt?time:motion.slowAt+(time-motion.slowAt)*motion.afterSpeed/motion.speed,motion)
    :motion.type==='rail'?railPosition(time,motion):motion.type==='sweep'?(motion.preFrom!==undefined&&time<motion.start
    ?motion.from+Math.sign(motion.preFrom-motion.from)*clamp((motion.start-time)*motion.preSpeed,0,Math.abs(motion.preFrom-motion.from))
    :motion.from+Math.sign(motion.to-motion.from)*clamp((time-motion.start)*motion.speed,0,Math.abs(motion.to-motion.from)))
    :motion.amplitude*triangle(time,motion.period,motion.phase);
  const angle=(part==='top'?pipe.topRecord:pipe.bottomRecord)[2];
  return {x:motion.alongShaft?-Math.tan(angle)*y:0,y};
}
export function pipePose(pipe,xOffset=0){
  if(pipe.level!=='final')return {center:pipe.center,angle:0};
  const upper=pipeMotion(pipe,xOffset,'top'),lower=pipeMotion(pipe,xOffset,'bottom');
  const pairedLift=pipe.pairedLift||0;
  const retraction=(pipe.upperRetraction||0)-(pipe.roofExtension||0);
  const top={x:pipe.topRecord[0]+upper.x+Math.tan(pipe.topRecord[2])*retraction,y:pipe.topRecord[1]+pipe.verticalOffset+upper.y-retraction-pairedLift-(pipe.capRoofLift||0)-(pipe.motionRoofLift||0),angle:pipe.topRecord[2]};
  const lift=pipe.floorLift||0,angle=pipe.bottomRecord[2];
  const bottom={x:pipe.bottomRecord[0]+lower.x+Math.tan(angle)*(lift-(pipe.lowerRetraction||0)),y:pipe.bottomRecord[1]+pipe.verticalOffset+lower.y+(pipe.lowerRetraction||0)-lift-pairedLift+(pipe.pairedDrop||0),angle};
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
    pipe.floorLift=0;pipe.pairedLift=0;pipe.pairedDrop=0;pipe.capRoofLift=0;pipe.motionRoofLift=0;pipe.roofExtension=0;pipe.fittedMotion=undefined;pipe.bottomFittedMotion=undefined;
  }
  for(const pipe of pipes){
    if(pipe.level!=='final')continue;
    const post=basePose(pipe).bottom,motion=pipe.bottomMotion||pipe.motion;
    const amplitude=motionRange(motion)[1];
    const shaft=pipe.lowDip?PIPE_EXPOSURE.rapidShaft:PIPE_EXPOSURE.ordinaryShaft;
    const depth=pipe.width/2*Math.abs(Math.sin(post.angle))+(PIPE_EXPOSURE.cap+shaft)*Math.cos(post.angle);
    const excess=Math.max(0,post.y+amplitude+depth-ground);
    if(!['triangle','sweep','rail','bank','plunger'].includes(motion?.type)){pipe.floorLift=excess;continue;}
    const paired=!pipe.bottomMotion;
    const key=[pipe.chunkId,pipe.safetyGroup,paired?'pair':'floor',motion.group??'',motion.type,motion.period,motion.phase,motion.from,motion.to,motion.speed,motion.returnSpeed,motion.start].join(':');
    if(!groups.has(key))groups.set(key,{pipes:[],motion,paired,excess:0});
    const group=groups.get(key);group.pipes.push(pipe);group.excess=Math.max(group.excess,excess);
  }
  for(const {pipes:bank,motion,paired,excess} of groups.values()){
    if(excess<=0)continue;
    if(['sweep','rail','bank','plunger'].includes(motion.type)){
      // Translate the whole path, retaining its complete travel and duration.
      // Ground fitting must never turn it into a short fast bounce.
      for(const pipe of bank){if(paired)pipe.pairedLift=excess;else pipe.floorLift=excess;}
      continue;
    }
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
    const independent=pipe.bottomMotion||pipe.topMotion;
    const bottom=independent?motionRange(pipe.bottomMotion||pipe.motion)[0]:0,top=independent?motionRange(pipe.topMotion||pipe.motion)[1]:0;
    pipe.capRoofLift=Math.max(0,100-(pose.bottom.y+bottom-pose.top.y-top));
  }
  for(const id of new Set(pipes.filter(p=>p.arrivalClearance).map(p=>p.chunkId))){
    const bank=pipes.filter(p=>p.chunkId===id),saved=bank.map(p=>p.referenceBirdX);let lift=0;
    const start=Math.min(...bank.map(p=>p.x))-32,end=Math.max(...bank.map(p=>postEndX(p,ground,'bottom')))+32;
    for(let x=start;x<=end;x+=4){
      let roof=0,floor=ground;
      for(const pipe of bank){pipe.referenceBirdX=x;const pose=pipePose(pipe);
        for(const [post,up] of [[pose.top,true],[pose.bottom,false]]){
          const range=slabRange(postVertices(pipe,post,up,pipeShaftLength(pipe,ground,up)),x-12,x+12);
          if(range){if(up)roof=Math.max(roof,range[1]);else floor=Math.min(floor,range[0]);}
        }
      }
      lift=Math.max(lift,58-(floor-roof));
    }
    bank.forEach((pipe,i)=>{pipe.motionRoofLift=lift;pipe.referenceBirdX=saved[i];});
  }
  for(const pipe of pipes)if(pipe.level==='final'){
    const post=basePose(pipe).top,motion=pipe.topMotion||pipe.motion;
    const capDepth=pipe.width/2*Math.abs(Math.sin(post.angle))+PIPE_EXPOSURE.cap*Math.cos(post.angle);
    pipe.roofExtension=Math.max(0,PIPE_EXPOSURE.ceilingMargin+capDepth-post.y-motionRange(motion)[0]);
    if(post.angle===0&&pipe.bottomRecord[2]===0&&!pipe.topMotion&&!pipe.bottomMotion){
      const floor=basePose(pipe).bottom,shaft=pipe.lowDip?PIPE_EXPOSURE.rapidShaft:PIPE_EXPOSURE.ordinaryShaft;
      const room=ground-PIPE_EXPOSURE.cap-shaft-floor.y-motionRange(pipe.motion)[1];
      pipe.pairedDrop=Math.min(pipe.roofExtension,Math.max(0,room));
    }
  }
}
function postEndX(pipe,ground,part){
  const post=basePose(pipe)[part],motion=pipe[part+'FittedMotion']||pipe[part+'Motion']||pipe.fittedMotion||pipe.motion;
  let end=-Infinity;
  for(const dy of motionRange(motion)){
    const dx=motion?.alongShaft?-Math.tan(post.angle)*dy:0;
    const polygon=clipToGround(postVertices(pipe,{...post,x:post.x+dx,y:post.y+dy},part==='top',pipeShaftLength(pipe,ground,part==='top')),ground);
    for(const point of polygon)end=Math.max(end,point[0]);
  }
  return end;
}
export function pipeShaftLength(pipe,ground,up=false){return up&&pipe.topLength?pipe.topLength:(ground+400)/Math.SQRT1_2;}
export function pipeBounds(pipe,ground,xOffset=0){
  const pose=pipePose(pipe,xOffset);let minX=Infinity,maxX=-Infinity;
  for(const [post,up] of [[pose.top,true],[pose.bottom,false]]){
    const polygon=clipToGround(postVertices({...pipe,x:pipe.x+xOffset},post,up,pipeShaftLength(pipe,ground,up)),ground);
    for(const point of polygon){minX=Math.min(minX,point[0]);maxX=Math.max(maxX,point[0]);}
  }
  return {minX,maxX};
}
export function pipeHorizontalExtent(pipe,ground){const b=pipeBounds(pipe,ground),center=pipe.x+pipe.width/2;return Math.max(center-b.minX,b.maxX-center);}
export function pipeScoreX(pipe){return pipe.x+pipe.width/4+(pipe.motion?.type==='rush'?pipePose(pipe).top.x:0);}
export function finalPipeHits(pipe,bird,ground){
  const pose=pipePose(pipe);
  return [[pose.top,true],[pose.bottom,false]].some(([post,up])=>{
    const dx=bird.x-pipe.x-pipe.width/2-post.x,dy=bird.y-post.y;
    const x=dx*Math.cos(post.angle)+dy*Math.sin(post.angle),y=-dx*Math.sin(post.angle)+dy*Math.cos(post.angle);
    const length=pipeShaftLength(pipe,ground,up);
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
  const layout=source.layout?source.layout(random):source.pairs;
  const amplitude=Math.max(...layout.flatMap(p=>[p.motion?.amplitude||0,p.topMotion?.amplitude||0,p.bottomMotion?.amplitude||0]));
  const nominalCenter=(source.anchor??168)+(ground-336)/2;
  const layoutOffset=clamp(entryCenter??nominalCenter,Math.max(90+amplitude,(source.minEntry??-Infinity)+(ground-336)/2),Math.min(ground-90-amplitude,(source.maxEntry??Infinity)+(ground-336)/2))-nominalCenter;
  const verticalOffset=(ground-336)/2-64+layoutOffset;
  const pipes=layout.map(pair=>{
    const dx=pair.dx+(source.entryInset||0);
    const ownLayoutOffset=pair.anchorEntry===false?0:layoutOffset;
    const pipe={x:x+dx,chunkOffset:dx,width,gap:pair.bottom[1]-pair.top[1],level:'final',kind:source.id,chunkId:id,scored:false,
      topRecord:[...pair.top],bottomRecord:[...pair.bottom],motion:pair.motion,topMotion:pair.topMotion,bottomMotion:pair.bottomMotion,
      safetyGroup:pair.safetyGroup||0,lowDip:pair.lowDip||false,allowRoofOverlap:pair.allowRoofOverlap||false,arrivalClearance:source.motif==='floor-bank',shaftGap:source.diagonal?2:3,verticalOffset:verticalOffset-layoutOffset+ownLayoutOffset,layoutOffset:ownLayoutOffset,referenceBirdX};
    return Object.assign(pipe,pipePose(pipe));
  });
  for(let i=0;i<pipes.length;i++)if(pipes[i].motion?.type==='rush'){
    pipes[i].rushAhead=pipes.slice(0,i).filter(p=>p.motion?.type==='rush').map(p=>({distance:pipes[i].x-p.x,motion:p.motion,width:p.width}));
  }
  // A close moving-gate continuation clears the preceding angled floors at
  // any viewport height. Only its designated upper connection may overlap.
  for(let i=0;i<pipes.length;i++)if(layout[i].afterFloor||layout[i].overlayAfter){
    const prior=pipes.slice(0,i),floor=Math.max(...prior.map(p=>postEndX(p,ground,'bottom')))+3;
    const roofs=prior.map(p=>postEndX(p,ground,'top')).sort((a,b)=>b-a);
    const pipe=pipes[i],pose=basePose(pipe);
    const minX=part=>Math.min(...clipToGround(postVertices({...pipe,x:0},pose[part],part==='top',pipeShaftLength(pipe,ground,part==='top')),ground).map(p=>p[0]));
    if(layout[i].joinFloor){
      pipe.x=floor-minX('bottom');
      pipe.topRecord[0]+=(roofs[1]??roofs[0])+3-pipe.x-minX('top');
    }else pipe.x=Math.max(floor-minX('bottom'),(roofs[1]??-Infinity)+3-minX('top'));
    pipe.chunkOffset=pipe.x-x;
  }
  let endX=Math.max(...pipes.map(p=>p.x+width));
  const safety=fitPassage({pipes,x,nextX:endX+source.clearance,ground,entryCenter,
    pose:basePose,envelope:basePose,length:pipeShaftLength,height:source.passageHeight});
  // Captured floor banks use their recorded rails. Fit the roof to the actual
  // arrival clearance below instead of widening a static midpoint corridor.
  if(source.motif==='floor-bank')for(const pipe of pipes){pipe.upperRetraction=0;pipe.lowerRetraction=0;}
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
  const nodes=safety.nodes.slice(0,-2),last=pipes.at(-1);
  const exit=source.exitAtLastGate?pipePose({...last,referenceBirdX:last.x+last.width/2}).center:source.exitCenter===undefined?nodes.at(-1)[1]:source.exitCenter+(ground-336)/2;
  nodes.push([endX,exit],[nextX,exit]);
  for(const pipe of pipes)Object.assign(pipe,pipePose(pipe));
  return {kind:source.id,family:source.family,pipes,layout,nextX,endX,startX:x,exitCenter:exit,safePath:nodes,source:source.source};
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
  const moving=chunk.pipes.find(p=>['triangle','sweep','rail','bank','plunger'].includes(p.motion?.type));
  if(!moving)return pathHeight(chunk.safePath,x);
  const shift=pipeMotion({...moving,referenceBirdX:clockX},0,'bottom').y;
  const first=moving.x+moving.width/2;
  const partial=chunk.pipes.some(p=>!['triangle','sweep','rail','bank','plunger'].includes(p.motion?.type));
  const lastMoving=chunk.pipes.filter(p=>['triangle','sweep','rail','bank','plunger'].includes(p.motion?.type)).at(-1);
  const fadeStart=partial?lastMoving.x+lastMoving.width+12:chunk.endX;
  const fadeEnd=partial?fadeStart+78:chunk.nextX;
  const weight=clamp((x-(chunk.startX-104))/(first-(chunk.startX-104)),0,1)*clamp((fadeEnd-x)/(fadeEnd-fadeStart),0,1);
  return pathHeight(chunk.safePath,x)+(shift-(moving.pairedLift||0)+(chunk.family==='rising'?30:0))*weight;
}
