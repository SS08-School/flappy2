// Numeric formations from YHH2101OFfI. Artwork remains the supplied atlas only.
export const LEVEL3_REFERENCE={video:'YHH2101OFfI',speed:118,width:288,ground:400,captureFps:30};
export const PIPE_CLEARANCE=3;
export const RUSH_APPROACH=429.48;
export const ROOF_APPROACH_ID='roof-descending-approach';
const pitch=52+PIPE_CLEARANCE;
const pair=(dx,top,bottom,extra={})=>({dx,top:[0,top+64,0],bottom:[0,bottom+64,0],...extra});
const vertical=(id,source,centers,gap,spacing=pitch,motion)=>({
  id,source,family:spacing===pitch?'tunnel':'gates',clearance:24,
  pairs:centers.map((y,i)=>pair(i*spacing,y-gap/2,y+gap/2,{motion})),
});
const rail=(from,to,speed,start=0,extra={})=>({type:'rail',from,to,speed,start,...extra});
const risingExit=()=>pair(0,40,264,{safetyGroup:20,anchorEntry:false,minimumGap:26,risingFloor:true,
  bottomMotion:{type:'sweep',from:0,to:-198,speed:24,start:-(264-140)/24}});
function rising(id,window=false){
  const chunk=vertical(id,[15,18],[168,168,168],124,pitch,rail(32,-64,42,-1.5));
  chunk.family='rising';chunk.motif='rising';chunk.minEntry=156;
  const exits=window?[[60,246],[136,282],[180,286]]:[[64,250],[132,280],[184,286]];
  exits.forEach(([top,bottom],i)=>chunk.pairs.push(pair((i+3)*pitch,top,bottom,{safetyGroup:i+1,anchorEntry:false})));
  return chunk;
}
function roofApproach(){
  // Descend through uneven pockets before the floor bank lifts the bird.
  // Neither wall forms the old six-post staircase.
  const chunk=vertical(ROOF_APPROACH_ID,[15,18],[150,182,168,216,202,220],112);
  Object.assign(chunk,{rare:'roof',minEntry:168,maxEntry:168,preserveRoute:true,passageHeight:76});
  chunk.pairs.forEach((p,i)=>{p.minimumGap=108;p.top[1]+=[0,-3,-6,2,-2,0][i];p.bottom[1]+=[0,4,-4,6,-4,0][i];});
  return chunk;
}
function bank(id,{continuation=false}={}){
  // 18–22 s: the leading trio rises and stays extended. The following two
  // posts share both reversal and return times, with different travel speeds. Their
  // short stopped tips and the fixed third floor form three regular saw teeth.
  const pairFloor=308.9,sawStep=12,tailReturn=125+54*Math.SQRT1_2-sawStep;
  const floorV=[251,251,251,pairFloor,pairFloor,pairFloor+108+(125-2*sawStep)*Math.SQRT2];
  const profiles=[
    {trio:22,start:-.5,pair:54,lead:82},
    {trio:26,start:-.67,pair:50,lead:72},
    {trio:24,start:-.6,pair:48,lead:76},
  ];
  const layout=random=>{
    const profile=profiles[Math.min(2,Math.floor(random()*3))];
    // Keep the recorded end of the trio's rise, but spread its full ascent
    // over the maximum widescreen approach instead of waiting visibly low.
    const trioStart=-3.6,trioEnd=profile.start+65/profile.trio;
    const pairs=floorV.map((v,i)=>{
      const group=i<3?0:i<5?1:2,bu=-182+i*54;
      // The right post travels farther between its short saw-tooth endpoint
      // and the peak. Scale both velocities by that distance so the pair
      // starts, reverses and stops together, without a delayed reversal.
      const low=i===4?tailReturn:125,travelRatio=(low+35)/160;
      const roofX=i===0?96:292+(i-1)*54*Math.SQRT1_2;
      // The fixed exit floor also carries the intermediate roof shaft that
      // bridges the long leading roof into the four-step slope. Its separate
      // post offset preserves the floor position and shared movement clock.
      const tx=i===5?194:roofX,ty=i===5?61:i===0?72:50+(i-1)*54*Math.SQRT1_2;
      const bx=(bu+v)*Math.SQRT1_2-3,by=(v-bu)*Math.SQRT1_2-64,dx=Math.min(roofX,bx)-26;
      return {dx,top:[tx-dx-26,ty+64,Math.PI/4],roofGroup:i===5?2:i?1:0,safetyGroup:group,minimumShaft:group===1?8:24,bottom:[bx-dx-26,by+64,-Math.PI/4],
        bottomMotion:group===2?undefined:group===1?{type:'bank',from:low,to:-35,speed:profile.pair*travelRatio,start:1.06-160/profile.pair,returnSpeed:profile.lead*travelRatio,
          returnTo:low,alongShaft:true,group}
          :{type:'sweep',from:45,to:-20,speed:65/(trioEnd-trioStart),start:trioStart,alongShaft:true,group},
      };
    });
    if(continuation)pairs.push(pair(530,138,282,{motion:rail(-40,50,48,-.5),safetyGroup:1,allowRoofOverlap:true,afterFloor:true}));
    return pairs;
  };
  const chunk={id,source:[18,23],family:'diagonal',motif:'floor-bank',diagonal:true,anchor:168,minEntry:168,maxEntry:168,exitCenter:196,entryInset:64,clearance:3,
    alignedRoof:true,pairs:layout(()=>.5),layout,
  };
  if(continuation)chunk.exitAtLastGate=true;
  return chunk;
}
function diagonalTunnel(drop=false,high=false){
  // 48–51 s: measured cap lengths on a 54-pixel perpendicular grid. Jitter
  // only along the shafts preserves the captured 45-degree angles and gaps.
  const topV=[11,-44.5,-68.45,-145.1,-143,-241.9],bottomV=[208,226.84,309.78,419.03,444.77,528.84];
  const layout=random=>{const pairs=topV.map((v,i)=>{
    const tv=v+(i?random()*8-4:0),bv=bottomV[i]+(i?random()*8-4:0);
    const tu=125+i*54,bu=-97+i*54;
    const tx=(tu-tv)*Math.SQRT1_2-78.4888527117,ty=(tu+tv)*Math.SQRT1_2-64;
    const bx=(bu+bv)*Math.SQRT1_2-78.4888527117,by=(bv-bu)*Math.SQRT1_2-64,dx=Math.min(tx,bx);
    const extension=i===5?92:0,rearTip=i===5?6:0,exitTrim=i===5?4:0;
    // Expose a little rear shaft beyond the foreground overlay. Shorten its
    // cap along the same axis to retain flap headroom through the exit turn.
    return {dx,safetyGroup:i,top:[tx-dx+rearTip*2+exitTrim,ty+64-exitTrim-(high?24:12),Math.PI/4],bottom:[bx-dx-extension,by+64-extension-(high?40:20),-Math.PI/4]};
  });
    const floor=drop?270:278;
    pairs.push(pair(550,178,floor,{top:[0,242,-Math.PI/4],bottom:[0,floor+64,Math.PI/4],allowRoofOverlap:true,overlayAfter:true,joinFloor:true,anchorEntry:false,safetyGroup:10,passageHeight:high?96:104}));
    return pairs;
  };
  // Reserve room for the full flap arc, not just a collision circle sliding
  // along the centerline. Keep the high variant slightly tighter.
  return {id:high?'high-diagonal-tunnel':drop?'diagonal-drop-exit':'stationary-diagonal-tunnel',source:drop?[48,53]:[48,51],family:'diagonal',motif:'angled-tunnel',diagonal:true,passageHeight:high?68:76,anchor:92,minEntry:168,maxEntry:180,entryInset:32,clearance:3,pairs:layout(()=>.5),layout};
}
function rushGates(short=false){
  const layout=random=>{
    const heights=[[168,142,204],[188,130,214],[146,204,158],[198,154,112]][Math.min(3,Math.floor(random()*4))];
    const approachMax=70+6*random();
    const count=short?2+Math.min(1,Math.floor(random()*2)):3+Math.min(1,Math.floor(random()*2));
    // Sample continuous speeds, with each regular rear gate visibly slower.
    // They retain visibly different velocities instead of all catching the
    // first slow gate and being held to its speed by the separation guard.
    let speed=approachMax;
    const speeds=Array.from({length:count},(_,i)=>{
      if(i)speed-=12+2*random();
      return speed;
    });
    const ys=[...heights,heights[0]-12].slice(0,count),xs=ys.map((_,i)=>i*156);
    if(!short){ys[ys.length-1]=Math.min(154,ys.at(-1));xs.push(xs.at(-1)+176);ys.push(104);}
    for(let i=1;i<ys.length;i++)ys[i]=Math.max(ys[i-1]-50,Math.min(ys[i-1]+50,ys[i]));
    if(!short){
      // A slower final approach needs extra room before the fast follower
      // catches the bird. Reserve that room instead of clamping its hold away.
      const world=LEVEL3_REFERENCE.speed,lead=(RUSH_APPROACH+26)/world;
      const holdAt=-96*lead/(world+96),front=speeds[count-1];
      const separation=52+24+Math.abs(ys[count]-ys[count-1])*.8;
      const spacing=Math.max(176,Math.ceil(world*((separation-front*lead)/(world+front)-holdAt))+8);
      xs[count]=xs[count-1]+spacing;
    }
    const pairs=ys.map((y,i)=>pair(xs[i],y-50,y+50,{safetyGroup:i,anchorEntry:false,motion:{type:'rush',speed:i===count?96:speeds[i],trigger:RUSH_APPROACH,hold:!short&&i===count?1.1:0}}));
    // At 62 s the section ends with a fixed roof and a slowly rising floor.
    // The next pair is positioned from the follower's actual crossing/hold,
    // not its original unaccelerated x. This removes the long empty exit.
    return pairs;
  };
  return {id:short?'short-left-rush-gates':'left-rush-gates',source:short?[52,57]:[52,64],family:'rush',motif:'rush',entryInset:160,exitAtLastGate:true,clearance:24,pairs:layout(()=>.5),layout};
}
function windingTunnel(id,long=false,low=false){
  // Floors are mostly irregular, with only one optional short step run.
  // Roofs have their own uneven silhouette instead of following the floor.
  const profiles=[
    {floor:[0,18,-12,6],roof:[4,-8,6,-4]},
    {floor:[0,-16,12,-8],roof:[-4,8,-6,6]},
    {floor:[0,22,-6,16],roof:[0,12,-8,4]},
    {floor:[0,-14,-28,-8],roof:[0,-18,-10,-24]},
  ];
  const layout=random=>{
    const profile=profiles[Math.min(profiles.length-1,Math.floor(random()*profiles.length))],shape=profile.floor;
    const depth=.95+random()*.1,center=168+(low?6:0);
    // A rare long route contains a real ledge, rather than distributing the
    // entire dip over many stairs. Its roof follows one column later so the
    // bird can enter the chute before the low ceiling closes in.
    const detail=i=>(i===1||i===2||i>5)?shape[i%4]*.2:0;
    const bounded=v=>Math.max(-8,Math.min(112,v));
    const floor=[0,-8,12,4,104,96,110,98,108].map((v,i)=>bounded(v*depth+detail(i)));
    const roof=[6,0,10,-8,8,-4,104,92,106].map((v,i)=>bounded(v*depth-detail(i)*.6));
    const pairs=long?floor.map((offset,i)=>{
      const bottom=low?-roof[i]:offset,top=Math.min(low?-offset:roof[i],bottom+16);
      return pair(i*pitch,center-62+top,center+62+bottom,{minimumGap:108});
    }):shape.map((offset,i)=>{
      const direction=low?-1:1;
      const roof=(profile.roof[i]*depth+random()*6-3)*direction;
      return pair(i*pitch,center-62+roof,center+62+offset*depth*direction,{minimumGap:108});
    });
    if(long)pairs.push(pair(9*pitch+12,178,286,{
      top:[0,178+64,-Math.PI/4],allowRoofOverlap:true,overlayAfter:true,anchorEntry:false,safetyGroup:2,passageHeight:92,
    }));
    return pairs;
  };
  return {id,source:long?[34,39]:low?[39,43]:[34,37],family:'tunnel',rare:long?'long':undefined,
    minEntry:156,maxEntry:180,preserveRoute:true,routeSlope:long?1:.72,passageHeight:76,clearance:long?12:24,pairs:layout(()=>.5),layout};
}
function shortUnevenTunnel(id,source,low=false){
  const chunk=vertical(id,source,[168,168,168],124);
  const roof=low?[0,12,-8]:[0,-12,8],floor=low?[0,22,-12]:[0,-24,10];
  chunk.pairs.forEach((p,i)=>{p.top[1]+=roof[i];p.bottom[1]+=floor[i];p.minimumGap=108;});
  return chunk;
}
function descendingPursuit(){
  // 32–34 s: one complete gate plunges along a straight, readable rail.
  const chunk=vertical('descending-pursuit',[32,34],[164],116,pitch,rail(-76,76,210,.77,{returnSpeed:210}));
  chunk.family='descent';chunk.motif='descent';chunk.minEntry=156;chunk.maxEntry=180;
  chunk.pairs.forEach(p=>{p.dx+=130;p.lowDip=true;});
  chunk.pairs.unshift(pair(0,80,250,{anchorEntry:false,safetyGroup:3}));
  chunk.pairs.push(pair(250,142,286,{anchorEntry:false,safetyGroup:1}),pair(305,156,286,{anchorEntry:false,safetyGroup:2}));
  return chunk;
}
function tunnelPlunger(){
  // Guide the climb into a roomy elevator opening. A slightly shorter rail
  // reserves flap headroom at both ends without clipping its cap at the sky.
  const gates=[[0,200,128],[84,172,124],[156,130,124],[211,108,120],[266,164,140],[321,204,128],[376,226,124]];
  const chunk={id:'tunnel-plunger',source:[31,35],family:'plunger',motif:'plunger',guidedEntry:true,clearance:24,
    anchor:168,minEntry:168,maxEntry:168,pairs:gates.map(([dx,center,gap],i)=>pair(dx,center-gap/2,center+gap/2,{safetyGroup:i}))};
  const moving=chunk.pairs[4];moving.lowDip=true;
  moving.motion={type:'plunger',from:-64,to:64,speed:210,start:(moving.dx-38)/118,returnSpeed:210,slowAt:(moving.dx+14)/118,afterSpeed:60};
  return chunk;
}
export const LEVEL3_OPENING_CHUNK=vertical('opening-tunnel',[6,10],[168,168,168],116,pitch);
LEVEL3_OPENING_CHUNK.family='opening';
export const LEVEL3_CHUNKS=[
  vertical('stationary-tunnel',[12,14.7],[168,168,168],108),
  rising('rising-trio'),rising('rising-trio-window',true),
  roofApproach(),
  descendingPursuit(),
  tunnelPlunger(),
  bank('diagonal-rise'),
  bank('diagonal-fall',{continuation:true}),
  bank('displaced-roof-bank'),
  diagonalTunnel(),diagonalTunnel(true),diagonalTunnel(false,true),
  shortUnevenTunnel('short-high-tunnel',[34,36.5]),
  shortUnevenTunnel('short-low-tunnel',[36.5,39],true),
  windingTunnel('stepped-roof-tunnel'),windingTunnel('floor-valley-tunnel',false,true),
  rushGates(),
  rushGates(true),
  {id:'rising-floor-interlude',family:'interlude',motif:'interlude',clearance:24,exitAtLastGate:true,pairs:[risingExit()]},
  windingTunnel('long-dropping-tunnel',true),windingTunnel('long-low-tunnel',true,true),
];
