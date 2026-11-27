import { LEVEL3_REFERENCE, LEVEL3_CHUNKS, LEVEL3_OPENING_CHUNK, ROOF_APPROACH_ID } from './level3-chunks.mjs';
import { fitPassage, postVertices, clipToGround, pathHeight, slabRange, polygonsHaveGap } from './pipe-safety.mjs';
export const LEVEL3_TEST_SCORE=5;
export const LEVEL3_PIPE_SPEED=LEVEL3_REFERENCE.speed;
export const LEVEL3_CHUNK_KINDS=LEVEL3_CHUNKS.map(chunk=>chunk.id);
export const LEVEL3_OPENING_ID=LEVEL3_OPENING_CHUNK.id;
export const PIPE_EXPOSURE={cap:26,ordinaryShaft:24,rapidShaft:2,ceilingMargin:12};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export class Level3Director {
  constructor(random=Math.random){
    this.random=random;this.nextLong=7+Math.floor(random()*3);this.recent=[];this.lastDescent=-Infinity;this.lastPlunger=-Infinity;this.lastRush=-Infinity;
    this.pendingKind=null;this.sections=0;this.lastRushSection=-Infinity;this.lastRoofSection=-Infinity;
  }
  next(id){
    let kind;
    if(this.pendingKind){kind=this.pendingKind;this.pendingKind=null;}
    else if(id===0)kind=LEVEL3_OPENING_ID;
    else if(id>=this.nextLong){
      this.nextLong=id+7+Math.floor(this.random()*3);kind=this.random()<.5?'long-dropping-tunnel':'long-low-tunnel';
    }else{
      const last=LEVEL3_CHUNKS.find(c=>c.id===this.recent.at(-1));
      let pool=LEVEL3_CHUNKS.filter(c=>!c.rare&&!this.recent.includes(c.id)&&(this.sections>=5||!['rush','plunger'].includes(c.family))&&(c.family!=='rush'||id-this.lastRush>=6&&this.sections-this.lastRushSection>=6)&&(c.motif!=='floor-bank'||this.sections-this.lastRoofSection>=7)&&(c.id!=='descending-pursuit'||id>=5&&id-this.lastDescent>=8)&&(c.id!=='tunnel-plunger'||id-this.lastPlunger>=8));
      const varied=pool.filter(c=>c.family!==last?.family);if(varied.length)pool=varied;
      const motifs=this.recent.map(k=>LEVEL3_CHUNKS.find(c=>c.id===k)?.motif);
      const different=pool.filter(c=>!c.motif||!motifs.includes(c.motif));if(different.length)pool=different;
      kind=pool[Math.min(pool.length-1,Math.floor(this.random()*pool.length))].id;
    }
    if(LEVEL3_CHUNKS.find(c=>c.id===kind)?.motif==='floor-bank'&&this.recent.at(-1)!==ROOF_APPROACH_ID){
      this.pendingKind=kind;kind=ROOF_APPROACH_ID;
    }
    if(LEVEL3_CHUNKS.find(c=>c.id===kind)?.family==='rush'&&!this.recent.includes('rising-floor-interlude')&&this.random()<.3){
      this.pendingKind=kind;kind='rising-floor-interlude';
    }
    if(kind==='descending-pursuit')this.lastDescent=id;
    if(kind==='tunnel-plunger')this.lastPlunger=id;
    if(LEVEL3_CHUNKS.find(c=>c.id===kind)?.family==='rush'){this.lastRush=id;this.lastRushSection=this.sections;}
    if(LEVEL3_CHUNKS.find(c=>c.id===kind)?.motif==='floor-bank')this.lastRoofSection=this.sections;
    if(kind!=='rising-floor-interlude')this.sections++;
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
  return ['sweep','rail','bank','plunger'].includes(motion?.type)?[Math.min(motion.from,motion.to,motion.returnTo??motion.from),Math.max(motion.from,motion.to,motion.returnTo??motion.from)]:[-(motion?.amplitude||0),motion?.amplitude||0];
}
export function railPosition(time,motion){
  const distance=Math.abs(motion.to-motion.from),forward=distance/motion.speed,back=distance/(motion.returnSpeed||motion.speed),period=forward+back;
  const at=((time-motion.start)%period+period)%period;
  const travel=at<forward?at*motion.speed:distance-(at-forward)*(motion.returnSpeed||motion.speed);
  return motion.from+Math.sign(motion.to-motion.from)*travel;
}
function rushPosition(time,motion,width){
  const lead=(motion.trigger+width/2)/LEVEL3_PIPE_SPEED;
  const holdStart=-motion.speed*lead/(LEVEL3_PIPE_SPEED+motion.speed),hold=motion.hold||0;
  if(!hold||time<holdStart)return -Math.max(0,(time+lead)*motion.speed);
  const start=-(holdStart+lead)*motion.speed;
  return start+Math.min(time-holdStart,hold)*LEVEL3_PIPE_SPEED;
}
function rushReservation(motion,width){
  // Fixed world-space run-in: accelerated gates may catch the preceding
  // section only after it has left even the widest rear view. This covers
  // the current bird position and a future centered bird without changing
  // encounter timing between aspect ratios or moving unrelated formations.
  return Math.ceil(motion.speed/(LEVEL3_PIPE_SPEED+motion.speed)*(motion.trigger+width/2+320));
}
export function pipeMotion(pipe,xOffset=0,part){
  const motion=(part&&(pipe[part+'FittedMotion']||pipe[part+'Motion']))||pipe.fittedMotion||pipe.motion;
  if(!motion)return {x:0,y:0};
  const clockX=motion.type==='rush'?pipe.x:pipe.x-pipe.chunkOffset;
  const time=(pipe.referenceBirdX-clockX-xOffset-pipe.width/2)/LEVEL3_PIPE_SPEED;
  if(motion.type==='rush'){
    // The fixed maximum-view approach is relative to the bird, not the screen
    // center. Extra travel starts offscreen, so a visible gate is already moving.
    let previousRight=-Infinity,previousCenter,left;
    for(const ahead of [...(pipe.rushAhead||[]),{distance:0,motion,width:pipe.width,center:(pipe.topRecord[1]+pipe.bottomRecord[1])/2}]){
      const at=pipe.x-ahead.distance,clock=(pipe.referenceBirdX-at-xOffset-ahead.width/2)/LEVEL3_PIPE_SPEED;
      const clearance=previousCenter===undefined?0:24+Math.abs(ahead.center-previousCenter)*.8;
      left=Math.max(at+rushPosition(clock,ahead.motion,ahead.width),previousRight+clearance);
      previousRight=left+ahead.width;previousCenter=ahead.center;
    }
    return {x:left-pipe.x,y:0};
  }
  const y=motion.type==='bank'?(time<=motion.start?motion.from:time<=motion.start+Math.abs(motion.to-motion.from)/motion.speed
    ?motion.from+Math.sign(motion.to-motion.from)*(time-motion.start)*motion.speed
    :motion.to+Math.sign((motion.returnTo??motion.from)-motion.to)*clamp((time-motion.start-Math.abs(motion.to-motion.from)/motion.speed)*motion.returnSpeed,0,Math.abs((motion.returnTo??motion.from)-motion.to)))
    :motion.type==='plunger'?railPosition(time<=motion.slowAt?time:motion.slowAt+(time-motion.slowAt)*motion.afterSpeed/motion.speed,motion)
    :motion.type==='rail'?railPosition(time,motion):motion.type==='sweep'?(motion.preFrom!==undefined&&time<motion.start
    ?motion.from+Math.sign(motion.preFrom-motion.from)*clamp((motion.start-time)*motion.preSpeed,0,Math.abs(motion.preFrom-motion.from))
    :motion.from+Math.sign(motion.to-motion.from)*clamp((time-motion.start)*motion.speed,0,Math.abs(motion.to-motion.from)))
    :motion.amplitude*triangle(time,motion.period,motion.phase);
  const angle=(part==='top'?pipe.topRecord:pipe.bottomRecord)[2];
  return {x:motion.alongShaft?-Math.tan(angle)*y:0,y};
}
export function pipePose(pipe,xOffset=0){
  if(pipe.level!==3)return {center:pipe.center,angle:0};
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
  const groups=new Map(),staticBanks=new Map();
  for(const pipe of pipes){
    if(pipe.level!==3)continue;
    pipe.floorLift=0;pipe.pairedLift=0;pipe.pairedDrop=0;pipe.capRoofLift=0;pipe.motionRoofLift=0;pipe.roofExtension=0;pipe.fittedMotion=undefined;pipe.bottomFittedMotion=undefined;
    if(!pipe.motion&&!pipe.topMotion&&!pipe.bottomMotion&&pipe.topRecord[2]===0&&pipe.bottomRecord[2]===0){
      const key=[pipe.chunkId,pipe.safetyGroup,pipe.layoutOffset].join(':');
      if(!staticBanks.has(key))staticBanks.set(key,[]);
      staticBanks.get(key).push(pipe);
    }
  }
  for(const pipe of pipes){
    if(pipe.level!==3)continue;
    const post=basePose(pipe).bottom,motion=pipe.bottomMotion||pipe.motion;
    const amplitude=motionRange(motion)[1];
    const shaft=pipe.minimumShaft??(pipe.lowDip?PIPE_EXPOSURE.rapidShaft:PIPE_EXPOSURE.ordinaryShaft);
    const depth=pipe.width/2*Math.abs(Math.sin(post.angle))+(PIPE_EXPOSURE.cap+shaft)*Math.cos(post.angle);
    const excess=Math.max(0,post.y+amplitude+depth-ground);
    if(!['triangle','sweep','rail','bank','plunger'].includes(motion?.type)){pipe.floorLift=excess;continue;}
    const paired=!pipe.bottomMotion;
    const key=[pipe.chunkId,pipe.safetyGroup,paired?'pair':'floor',motion.group??'',motion.type,motion.period,motion.phase,motion.from,motion.to,motion.speed,motion.type==='bank'?'linked':motion.returnSpeed,motion.start].join(':');
    if(!groups.has(key))groups.set(key,{pipes:[],motion,paired,excess:0});
    const group=groups.get(key);group.pipes.push(pipe);group.excess=Math.max(group.excess,excess);
  }
  // Fit a stationary straight bank as one shape. Per-pipe clamping flattens
  // most of a varied bank and leaves isolated short tips at the screen edges.
  for(const bank of staticBanks.values()){
    const lift=Math.max(...bank.map(pipe=>pipe.floorLift));
    for(const pipe of bank)pipe.floorLift=lift;
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
  for(const pipe of pipes)if(pipe.level===3&&pipe.topRecord[2]===0&&pipe.bottomRecord[2]===0){
    const pose=basePose(pipe);
    // Raising a submerged static floor must not shrink a normal gate below
    // the original game's 100-pixel opening. Lift its roof only if needed.
    const independent=pipe.bottomMotion||pipe.topMotion;
    const bottom=independent?motionRange(pipe.bottomMotion||pipe.motion)[0]:0,top=independent?motionRange(pipe.topMotion||pipe.motion)[1]:0;
    pipe.capRoofLift=Math.max(0,(pipe.minimumGap??100)-(pose.bottom.y+bottom-pose.top.y-top),
      pipe.approachCeiling===undefined?0:pose.top.y-pipe.approachCeiling-(ground-336)/2);
  }
  for(const bank of staticBanks.values()){
    const lift=Math.max(...bank.map(pipe=>pipe.capRoofLift));
    for(const pipe of bank)pipe.capRoofLift=lift;
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
  for(const pipe of pipes)if(pipe.level===3&&!pipe.noTop){
    const post=basePose(pipe).top,motion=pipe.topMotion||pipe.motion;
    const capDepth=pipe.width/2*Math.abs(Math.sin(post.angle))+PIPE_EXPOSURE.cap*Math.cos(post.angle);
    pipe.roofExtension=Math.max(0,PIPE_EXPOSURE.ceilingMargin+capDepth-post.y-motionRange(motion)[0]);
    if(post.angle===0&&pipe.bottomRecord[2]===0&&!pipe.topMotion&&!pipe.bottomMotion){
      const floor=basePose(pipe).bottom,shaft=pipe.lowDip?PIPE_EXPOSURE.rapidShaft:PIPE_EXPOSURE.ordinaryShaft;
      const room=ground-PIPE_EXPOSURE.cap-shaft-floor.y-motionRange(pipe.motion)[1];
      pipe.pairedDrop=Math.min(pipe.roofExtension,Math.max(0,room));
    }
  }
  for(const bank of staticBanks.values()){
    const extension=Math.max(...bank.map(pipe=>pipe.roofExtension));
    const room=Math.min(...bank.map(pipe=>ground-PIPE_EXPOSURE.cap-(pipe.minimumShaft??PIPE_EXPOSURE.ordinaryShaft)-basePose(pipe).bottom.y+pipe.pairedDrop));
    const drop=Math.min(extension,Math.max(0,room));
    for(const pipe of bank){pipe.roofExtension=extension;pipe.pairedDrop=drop;}
  }
  for(const id of new Set(pipes.filter(p=>p.alignedRoof).map(p=>p.chunkId))){
    for(const group of new Set(pipes.filter(p=>p.chunkId===id&&!p.noTop).map(p=>p.roofGroup))){
      const roof=pipes.filter(p=>p.chunkId===id&&!p.noTop&&p.roofGroup===group),extension=Math.max(...roof.map(p=>p.roofExtension||0));
      for(const pipe of roof)pipe.roofExtension=extension;
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
function exposeRoofTips(pipes,ground){
  // Slide only the foreground roof along x until its near edge clears every
  // complete rear cap. Shaft overlap and the lower exit stay as authored.
  for(const overlay of pipes.filter(p=>p.allowRoofOverlap&&p.topRecord[2]<-.1)){
    const caps=pipes.filter(p=>p!==overlay&&!p.noTop).map(p=>postVertices(p,pipePose(p).top,true,PIPE_EXPOSURE.cap));
    for(let pass=0;pass<=caps.length;pass++){
      const post=pipePose(overlay).top,shaft=postVertices(overlay,post,true,pipeShaftLength(overlay,ground,true));
      const covered=caps.filter(cap=>!polygonsHaveGap(shaft,cap));if(!covered.length)break;
      const co=Math.cos(post.angle),si=Math.sin(post.angle),ox=overlay.x+overlay.width/2+post.x;
      const shift=Math.max(...covered.map(cap=>(Math.max(...cap.map(([x,y])=>(x-ox)*co+(y-post.y)*si))+overlay.width/2+3)/co));
      overlay.topRecord[0]+=Math.max(.01,shift);
    }
  }
}
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
export function level3PipeHits(pipe,bird,ground){
  const pose=pipePose(pipe);
  return [[pose.top,true],[pose.bottom,false]].some(([post,up])=>{
    if(up&&pipe.noTop)return false;
    const dx=bird.x-pipe.x-pipe.width/2-post.x,dy=bird.y-post.y;
    const x=dx*Math.cos(post.angle)+dy*Math.sin(post.angle),y=-dx*Math.sin(post.angle)+dy*Math.cos(post.angle);
    const length=pipeShaftLength(pipe,ground,up);
    const nearX=clamp(x,-pipe.width/2,pipe.width/2),nearY=clamp(y,up?-length:0,up?0:length);
    return (x-nearX)**2+(y-nearY)**2<bird.radius**2;
  });
}
// Sample the solid geometry at the bird's arrival time, including the width of
// its collision circle. A wide, empty exit retains the authored route height.
export function chunkOpening(pipes,at,ground,fallback=ground/2){
  let top=0,bottom=ground;
  for(const pipe of pipes){
    const pose=pipePose({...pipe,referenceBirdX:at});
    for(const [post,up] of [[pose.top,true],[pose.bottom,false]]){
      const range=slabRange(postVertices(pipe,post,up,pipeShaftLength(pipe,ground,up)),at-12,at+12);
      if(range){if(up)top=Math.max(top,range[1]);else bottom=Math.min(bottom,range[0]);}
    }
  }
  const center=bottom-top<=180?(top+bottom)/2:clamp(fallback,top+32,bottom-32);
  return {top,bottom,center};
}
function gateArrival(pipe,offset){
  if(pipe.motion?.type!=='rush')return pipe.x+offset;
  let low=pipe.x-600,high=pipe.x+pipe.width;
  for(let i=0;i<40;i++){
    const at=(low+high)/2,edge=pipe.x+pipePose({...pipe,referenceBirdX:at}).top.x+offset;
    if(at<edge)low=at;else high=at;
  }
  return (low+high)/2+1e-7;
}
function connectChunk(chunk,{ground,entryCenter,entryPort,id,width,referenceBirdX}){
  const firstAt=gateArrival(chunk.corePipes[0],-12);
  const incoming=entryPort||{top:entryCenter-50,bottom:entryCenter+50,center:entryCenter};
  const arrival=chunkOpening(chunk.corePipes,firstAt,ground,entryCenter);
  const shared=Math.min(incoming.bottom,arrival.bottom)-Math.max(incoming.top,arrival.top);
  const needsJoin=shared<80||incoming.center<arrival.top+32||incoming.center>arrival.bottom-32;
  if(!needsJoin)return chunk;
  const pitch=chunk.family==='rush'?78:width+3;
  const count=Math.max(1,Math.ceil(Math.abs(arrival.center-incoming.center)/28)-1),span=count*pitch;
  const connectors=[];
  for(let i=0;i<count;i++){
    const progress=(i+1)/(count+1),bend=count>3&&i>0&&i<count-1?(i%2?3:-3):0;
    const center=clamp(incoming.center+(arrival.center-incoming.center)*progress+bend,100,ground-112);
    const native=center-(ground-336)/2,dx=i*pitch;
    const pipe={x:chunk.startX+dx,chunkOffset:dx,width,gap:124,level:3,kind:chunk.kind,chunkId:id,connector:true,scored:false,
      topRecord:[0,native-62+64,0],bottomRecord:[0,native+62+64,0],layoutOffset:0,verticalOffset:(ground-336)/2-64,
      safetyGroup:-i-1,shaftGap:3,referenceBirdX};
    Object.assign(pipe,pipePose(pipe));connectors.push(pipe);
  }
  fitFloorVisibility(connectors,ground);
  for(const pipe of chunk.corePipes)pipe.x+=span;
  // Height guides belong to the moving section too. A static guide used to
  // hold the entire convoy back after it caught up, including left of the bird.
  if(chunk.family==='rush'){
    const speed=chunk.corePipes[0].motion.speed;
    for(const pipe of connectors)pipe.motion={type:'rush',speed,trigger:chunk.corePipes[0].motion.trigger};
    // The guides replace the old empty approach reservation; retaining both
    // would leave a conspicuous wait before the first moving gate.
    const entryInset=chunk.corePipes[0].x-chunk.startX-span;
    for(const pipe of chunk.corePipes)pipe.x-=entryInset;
    chunk.endX-=entryInset;chunk.nextX-=entryInset;
    const moving=[...connectors,...chunk.corePipes];
    const reservation=rushReservation(moving[0].motion,width);
    for(const pipe of moving)pipe.x+=reservation;
    chunk.coreStartX+=reservation;chunk.endX+=reservation;chunk.nextX+=reservation;
    for(let i=0;i<moving.length;i++)moving[i].rushAhead=moving.slice(0,i).map(p=>({distance:moving[i].x-p.x,width:p.width,
      center:(p.topRecord[1]+p.bottomRecord[1])/2,motion:p.motion}));
  }
  chunk.coreStartX+=span;chunk.endX+=span;chunk.nextX+=span;
  chunk.pipes=[...connectors,...chunk.corePipes];
  const firstMiddle=gateArrival(chunk.corePipes[0],width/2);
  const middleOpening=chunkOpening(chunk.corePipes,firstMiddle,ground,arrival.center);
  chunk.connectionEndX=firstMiddle;
  chunk.safePath=[[chunk.startX-32,incoming.center],...connectors.map(p=>[p.x+width/2,pipePose(p).center]),
    [firstAt+span,arrival.center],[firstMiddle,middleOpening.center],...chunk.safePath.filter(n=>n[0]>firstMiddle-span+1e-7).map(([x,y])=>[x+span,y])];
  if(chunk.family==='rush'){
    chunk.safePath=[[chunk.startX-32,incoming.center],...[...connectors,...chunk.corePipes].map(p=>{
      const at=gateArrival(p,width/2);return [at,chunkOpening(chunk.pipes,at,ground,incoming.center).center];
    }),[chunk.endX,chunk.exitCenter],[chunk.nextX,chunk.exitCenter]];
  }
  chunk.connectors=connectors;
  return chunk;
}
export function createLevel3Chunk({x,ground,entryCenter,entryPort,random=Math.random,previousKind,id=0,width=52,referenceBirdX=188,kind}){
  const previous=LEVEL3_CHUNKS.find(c=>c.id===previousKind);
  let choices=LEVEL3_CHUNKS.filter(c=>c.id!==previousKind&&!c.rare);
  // Never concatenate dense slices into an endless tunnel.
  const dense=family=>['tunnel','rising','diagonal'].includes(family);
  if(dense(previous?.family))choices=choices.filter(c=>c.family!==previous.family);
  const source=kind===LEVEL3_OPENING_ID?LEVEL3_OPENING_CHUNK:kind?LEVEL3_CHUNKS.find(c=>c.id===kind):choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
  // The dedicated descent supplies most of the approach. Retain only the
  // short release needed to begin a flap after clearing its enclosed roof.
  if(source.motif==='floor-bank'&&previousKind===ROOF_APPROACH_ID)x-=Math.min(32,source.entryInset||0);
  // Accelerated approaches can reach back toward the preceding section.
  // Keep their authored safety reservation out of ordinary tunnel joins.
  if(entryPort&&source.family==='rush'&&!['rush','interlude'].includes(previous?.family))x+=Math.max(0,(previous?.clearance||3)-3);
  // Continue the tunnel's normal three-pixel pipe gap across section edges.
  // The full shaft footprint below still reserves room for angled/moving posts.
  const clearance=['rush','interlude'].includes(source.family)?source.clearance:3;
  const layout=source.layout?source.layout(random):source.pairs;
  const amplitude=Math.max(...layout.flatMap(p=>[p.motion?.amplitude||0,p.topMotion?.amplitude||0,p.bottomMotion?.amplitude||0]));
  const nominalCenter=(source.anchor??168)+(ground-336)/2;
  const layoutOffset=clamp(entryCenter??nominalCenter,Math.max(90+amplitude,(source.minEntry??-Infinity)+(ground-336)/2),Math.min(ground-90-amplitude,(source.maxEntry??Infinity)+(ground-336)/2))-nominalCenter;
  const verticalOffset=(ground-336)/2-64+layoutOffset;
  const pipes=layout.map(pair=>{
    const dx=pair.dx+(source.entryInset||0);
    const ownLayoutOffset=pair.anchorEntry===false?0:layoutOffset;
    const pipe={x:x+dx,chunkOffset:dx,width,gap:pair.bottom[1]-pair.top[1],level:3,kind:source.id,chunkId:id,scored:false,
      topRecord:[...pair.top],bottomRecord:[...pair.bottom],motion:pair.motion,topMotion:pair.topMotion,bottomMotion:pair.bottomMotion,passageHeight:pair.passageHeight,
      safetyGroup:pair.safetyGroup||0,minimumShaft:pair.minimumShaft,noTop:pair.noTop||false,roofGroup:pair.roofGroup,alignedRoof:source.alignedRoof||false,risingFloor:pair.risingFloor||false,minimumGap:pair.minimumGap,approachCeiling:pair.approachCeiling,lowDip:pair.lowDip||false,allowRoofOverlap:pair.allowRoofOverlap||false,arrivalClearance:source.motif==='floor-bank',shaftGap:source.diagonal?2:3,verticalOffset:verticalOffset-layoutOffset+ownLayoutOffset,layoutOffset:ownLayoutOffset,referenceBirdX};
    return Object.assign(pipe,pipePose(pipe));
  });
  if(source.family==='rush'){
    const extra=Math.max(0,rushReservation(pipes[0].motion,width)-(pipes[0].x-x));
    for(const pipe of pipes){pipe.x+=extra;pipe.chunkOffset+=extra;}
  }
  for(let i=0;i<pipes.length;i++)if(pipes[i].motion?.type==='rush'){
    pipes[i].rushAhead=pipes.slice(0,i).filter(p=>p.motion?.type==='rush').map(p=>({distance:pipes[i].x-p.x,motion:p.motion,width:p.width,center:(p.topRecord[1]+p.bottomRecord[1])/2}));
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
  // Fit shaped tunnels around their own entrance. Connecting gates handle
  // the incoming height later, so fitting cannot flatten the authored bends.
  const safety=source.guidedEntry?{nodes:[]}:fitPassage({pipes,x,nextX:endX+clearance,ground,entryCenter:source.preserveRoute?basePose(pipes[0]).center:entryCenter,
    pose:basePose,envelope:basePose,length:pipeShaftLength,height:source.passageHeight,slope:source.routeSlope});
  // Captured floor banks use their recorded rails. Fit the roof to the actual
  // arrival clearance below instead of widening a static midpoint corridor.
  if(source.motif==='floor-bank')for(const pipe of pipes){pipe.upperRetraction=0;pipe.lowerRetraction=0;}
  for(const pipe of pipes)if(pipe.risingFloor||pipe.motion?.type==='rush'){pipe.upperRetraction=0;pipe.lowerRetraction=0;}
  // Preserve clean parallel edges: retract the entire roof/floor as a bank.
  for(const group of new Set(pipes.map(p=>p.safetyGroup))){
    const bank=pipes.filter(p=>p.safetyGroup===group);
    const upper=Math.max(...bank.map(p=>p.upperRetraction||0)),lower=Math.max(...bank.map(p=>p.lowerRetraction||0));
    for(const pipe of bank){pipe.upperRetraction=upper;pipe.lowerRetraction=lower;}
  }
  if(source.motif==='angled-tunnel'){
    // Keep the measured uneven cap lengths instead of flattening both walls
    // to the single most retracted post. Bound the resulting zigzag so real
    // flap arcs still fit through the enclosed sections.
    const upper=Math.max(...pipes.slice(0,6).map(p=>p.upperRetraction||0));
    const lower=Math.max(...pipes.slice(0,6).map(p=>p.lowerRetraction||0));
    for(const pipe of pipes.slice(0,6)){
      pipe.upperRetraction=Math.max(pipe.upperRetraction||0,upper-8);
      pipe.lowerRetraction=Math.max(pipe.lowerRetraction||0,lower-12);
    }
    // Release the last floor before the downward exit, retaining a complete
    // flap arc beneath the final roof and its foreground overlay.
    pipes[5].lowerRetraction=lower;
    pipes[5].upperRetraction=upper;
  }
  fitFloorVisibility(pipes,ground);
  if(source.motif==='angled-tunnel'){
    // The recorded route sits high and alternates around the unequal tips.
    // Extend the middle floor shafts farther into the broad pockets, keeping
    // the final floor low for the open downward turn and opposing ground tip.
    const extension=source.id==='high-diagonal-tunnel'?[50,50,62,74,54]:[50,52,66,78,54];
    for(const [i,pipe] of pipes.slice(0,6).entries()){
      const post=pipePose(pipe).top;
      const capDepth=width/2*Math.abs(Math.sin(post.angle))+PIPE_EXPOSURE.cap*Math.cos(post.angle);
      const rise=Math.max(0,Math.min(20,post.y-PIPE_EXPOSURE.ceilingMargin-capDepth));
      pipe.upperRetraction+=rise;
      if(i<5)pipe.lowerRetraction-=extension[i];
    }
  }
  const guidedRisingExit=pipes.some(p=>p.risingFloor);
  if(guidedRisingExit)for(const pipe of pipes){
    const node=safety.nodes.find(n=>Math.abs(n[0]-pipe.x-pipe.width/2)<1e-7);
    if(!node)continue;
    if(pipe.approachCeiling!==undefined)node[1]=Math.min(node[1],pipePose(pipe).top.y+40);
    if(pipe.risingFloor)node[1]=pipePose({...pipe,referenceBirdX:pipe.x+pipe.width/2}).center;
  }
  if(source.guidedEntry){
    // Ceiling fitting can shift the elevator slightly on shorter displays.
    // Center the last guide on its actual opening at first bird contact,
    // rather than asking the player to correct that shift inside the tunnel.
    const movingIndex=pipes.findIndex(pipe=>pipe.motion?.type==='plunger');
    if(movingIndex>0){
      const moving=pipes[movingIndex],guide=pipes[movingIndex-1];
      const arrival=pipePose({...moving,referenceBirdX:moving.x-12});
      const delta=arrival.center-pipePose(guide).center;
      guide.topRecord[1]+=delta;guide.bottomRecord[1]+=delta;
    }
    // The static lead-in points to the actual arrival opening. Its tight gaps
    // are authored with the moving trajectory, rather than widened around a
    // neutral pose the bird never encounters. These nodes guide analysis only.
    for(let i=0;i<2;i++){
      const pipe=pipes[i],post=pipePose(pipe).top;
      const ceiling=Math.max(PIPE_EXPOSURE.ceilingMargin+PIPE_EXPOSURE.cap,(entryCenter??ground/2)-(i?20:40));
      pipe.approachCeiling=ceiling-(ground-336)/2;
      pipe.capRoofLift+=Math.max(0,post.y-ceiling);
    }
    safety.nodes.push([x-140,entryCenter??ground/2]);
    for(const pipe of pipes){
      if(pipe.motion?.type==='plunger'){
        const saved=pipe.referenceBirdX;
        for(const at of [pipe.x-12,pipe.x+13,pipe.x+39,pipe.x+pipe.width+12]){
          pipe.referenceBirdX=at;safety.nodes.push([at,pipePose(pipe).center]);
        }
        pipe.referenceBirdX=saved;
      }else safety.nodes.push([pipe.x+pipe.width/2,pipePose(pipe).center]);
    }
    const exit=safety.nodes.at(-1)[1];safety.nodes.push([endX,exit],[endX+clearance,exit]);
  }
  exposeRoofTips(pipes,ground);
  // Reserve the full visible shaft footprint, at both movement extremes.
  // The next chunk begins after these tails, not merely after the last cap.
  for(const pipe of pipes){
    for(const part of ['top','bottom'])endX=Math.max(endX,postEndX(pipe,ground,part));
  }
  const nextX=endX+clearance;
  const nodes=safety.nodes.slice(0,-2),last=pipes.at(-1);
  const exit=source.exitAtLastGate?pipePose({...last,referenceBirdX:last.x+last.width/2}).center:source.exitCenter===undefined?nodes.at(-1)[1]:source.exitCenter+(ground-336)/2;
  nodes.push([endX,exit],[nextX,exit]);
  for(const pipe of pipes)Object.assign(pipe,pipePose(pipe));
  let chunk={kind:source.id,family:source.family,ground,contouredPassage:source.motif==='angled-tunnel',guidedEntry:source.guidedEntry||false,guidedRisingExit,pipes,corePipes:pipes,coreStartX:x,connectors:[],layout,nextX,endX,startX:x,exitCenter:exit,safePath:nodes,source:source.source};
  if(previousKind&&entryCenter!==undefined)chunk=connectChunk(chunk,{ground,entryCenter,entryPort,id,width,referenceBirdX});
  chunk.exitPort=chunkOpening(chunk.pipes,chunk.nextX-12,ground,exit);
  chunk.exitCenter=chunk.exitPort.center;
  return chunk;
}
// Analysis route follows the same shared clock as the moving bank, then blends
// back to its nominal exit through the empty interlude. It never moves the bird.
export function flightTarget(chunk,x,clockX=x){
  if(chunk.connectors?.length&&x<=chunk.connectionEndX)return pathHeight(chunk.safePath,x);
  if(chunk.contouredPassage)return chunkOpening(chunk.pipes,clockX,chunk.ground,pathHeight(chunk.safePath,x)).center;
  if(chunk.corePipes.some(p=>p.arrivalClearance))return chunkOpening(chunk.pipes,clockX,chunk.ground,pathHeight(chunk.safePath,x)).center;
  if(chunk.guidedEntry||chunk.guidedRisingExit)return pathHeight(chunk.safePath,x);
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
