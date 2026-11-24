// Numeric formations from YHH2101OFfI. Artwork remains the supplied atlas only.
export const FINAL_REFERENCE={video:'YHH2101OFfI',speed:118,width:288,ground:400,captureFps:30};
export const PIPE_CLEARANCE=3;
export const RUSH_APPROACH=429.48;
const pitch=52+PIPE_CLEARANCE;
const pair=(dx,top,bottom,extra={})=>({dx,top:[0,top+64,0],bottom:[0,bottom+64,0],...extra});
const vertical=(id,source,centers,gap,spacing=pitch,motion)=>({
  id,source,family:spacing===pitch?'tunnel':'gates',clearance:24,
  pairs:centers.map((y,i)=>pair(i*spacing,y-gap/2,y+gap/2,{motion})),
});
const rail=(from,to,speed,start=0,extra={})=>({type:'rail',from,to,speed,start,...extra});
const risingExit=(dx,tunnel=false)=>pair(dx,40,284,{safetyGroup:20,anchorEntry:false,bottomMotion:rail(0,-144,24,tunnel?(dx+26-140)/118:(dx+160-RUSH_APPROACH-26)/118)});
function optionalExit(chunk){
  const fixed=chunk.pairs;
  chunk.layout=random=>random()<.4?[...fixed,risingExit(fixed.at(-1).dx+pitch,true)]:fixed;
  chunk.exitAtLastGate=true;
  return chunk;
}
function rising(id,window=false){
  const chunk=vertical(id,[15,18],[168,168,168],124,pitch,rail(32,-64,42,-1.5));
  chunk.family='rising';chunk.motif='rising';chunk.minEntry=156;
  const exits=window?[[60,246],[136,282],[180,286]]:[[64,250],[132,280],[184,286]];
  exits.forEach(([top,bottom],i)=>chunk.pairs.push(pair((i+3)*pitch,top,bottom,{safetyGroup:i+1,anchorEntry:false})));
  return chunk;
}
function bank(id,{continuation=false}={}){
  // 18–22 s: low preview, shared ascent, then a complete retraction. The
  // following two posts rise together and separate on their faster descent.
  const roofV=[98,-60,-112,-108,-160],floorV=[223,223,223,292,292];
  const chunk={id,source:[18,23],family:'diagonal',motif:'floor-bank',diagonal:true,anchor:168,minEntry:168,maxEntry:168,exitCenter:196,entryInset:64,clearance:3,
    pairs:floorV.map((v,i)=>{
      const group=i<3?0:1,tu=156.5+i*54,bu=-182+i*54;
      const tx=(tu-roofV[i])*Math.SQRT1_2-3,ty=(tu+roofV[i])*Math.SQRT1_2-64;
      const bx=(bu+v)*Math.SQRT1_2-3,by=(v-bu)*Math.SQRT1_2-64,dx=Math.min(tx,bx)-26;
      return {dx,top:[tx-dx-26,ty+64,Math.PI/4],bottom:[bx-dx-26,by+64,-Math.PI/4],
        bottomMotion:group?{type:'bank',from:125,to:-35,speed:50,start:-2.14,returnSpeed:i===4?104:72,alongShaft:true,group}
          :{type:'bank',from:45,to:-20,speed:26,start:-.67,returnSpeed:26,alongShaft:true,group},
      };
    }),
  };
  if(continuation){chunk.exitAtLastGate=true;chunk.pairs.push(pair(530,138,282,{motion:rail(-40,50,48,-.5),safetyGroup:1,allowRoofOverlap:true,afterFloor:true}));}
  return chunk;
}
function diagonalTunnel(drop=false){
  // 48–51 s: measured cap lengths on a 54-pixel perpendicular grid. Jitter
  // only along the shafts preserves the captured 45-degree angles and gaps.
  const topV=[11,-44.5,-68.45,-145.1,-143,-241.9],bottomV=[208,226.84,309.78,419.03,444.77,528.84];
  const layout=random=>{const pairs=topV.map((v,i)=>{
    const tv=v+(i?random()*8-4:0),bv=bottomV[i]+(i?random()*8-4:0);
    const tu=125+i*54,bu=-97+i*54;
    const tx=(tu-tv)*Math.SQRT1_2-78.4888527117,ty=(tu+tv)*Math.SQRT1_2-64;
    const bx=(bu+bv)*Math.SQRT1_2-78.4888527117,by=(bv-bu)*Math.SQRT1_2-64,dx=Math.min(tx,bx);
    const extension=i===5?92:0;
    return {dx,top:[tx-dx,ty+64,Math.PI/4],bottom:[bx-dx-extension,by+64-extension,-Math.PI/4]};
  });
    const floor=drop?270:278;
    pairs.push(pair(550,178,floor,{top:[0,242,-Math.PI/4],bottom:[0,floor+64,Math.PI/4],allowRoofOverlap:true,overlayAfter:true,joinFloor:true,anchorEntry:false,safetyGroup:10}));
    return pairs;
  };
  return {id:drop?'diagonal-drop-exit':'stationary-diagonal-tunnel',source:drop?[48,53]:[48,51],family:'diagonal',motif:'angled-tunnel',diagonal:true,passageHeight:72,anchor:92,maxEntry:180,entryInset:32,clearance:3,pairs:layout(()=>.5),layout};
}
function rushGates(){
  const layout=random=>{
    const heights=[[168,142,204],[188,130,214],[146,204,158],[198,154,112]][Math.min(3,Math.floor(random()*4))];
    const speeds=[[24,76,32],[36,40,88],[28,64,76]][Math.min(2,Math.floor(random()*3))];
    const count=2+Math.min(2,Math.floor(random()*3)),withExit=random()<.5;
    const ys=[...heights,heights[0]-12].slice(0,count),xs=ys.map((_,i)=>i*188);
    xs.push(xs.at(-1)+200);ys.push(104);
    const pairs=ys.map((y,i)=>pair(xs[i],y-55,y+55,{safetyGroup:i,anchorEntry:false,motion:{type:'rush',speed:i===count?96:i===count-1?40:speeds[i],trigger:RUSH_APPROACH,hold:i===count?1.1:0}}));
    // At 62 s the section ends with a fixed roof and a slowly rising floor.
    // The next pair is positioned from the follower's actual crossing/hold,
    // not its original unaccelerated x. This removes the long empty exit.
    if(withExit)pairs.push(risingExit(xs.at(-1)+31));
    return pairs;
  };
  return {id:'left-rush-gates',source:[52,64],family:'rush',motif:'rush',entryInset:160,exitAtLastGate:true,clearance:24,pairs:layout(()=>.5),layout};
}
function longTunnel(id,low=false){
  const top=low?[118,128,108,132,156,182,180,142,156]:[108,88,96,120,150,182,180,142,156];
  const chunk={id,source:[34,39],family:'tunnel',rare:'long',maxEntry:180,clearance:12,
    pairs:top.map((y,i)=>pair(i*pitch,y,Math.min(286,y+112))),
  };
  chunk.pairs.push(pair(9*pitch+12,178,286,{
    top:[0,178+64,-Math.PI/4],allowRoofOverlap:true,overlayAfter:true,anchorEntry:false,safetyGroup:2,
  }));
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
  // Climb through a tight entrance, ride one descending opening, then leave
  // through a low tunnel. The full bird-width crossing stays on the downstroke.
  const chunk=vertical('tunnel-plunger',[31,35],[204,168,118,164,218,226],116,pitch);
  chunk.family='plunger';chunk.motif='plunger';chunk.minEntry=156;chunk.maxEntry=180;
  const moving=chunk.pairs[3];moving.lowDip=true;
  moving.motion={type:'plunger',from:-76,to:76,speed:210,start:(moving.dx-38)/118,returnSpeed:210,slowAt:(moving.dx+14)/118,afterSpeed:60};
  return chunk;
}
export const FINAL_OPENING_CHUNK=vertical('opening-moving-pair',[6,10],[168,168,168],124,156);
FINAL_OPENING_CHUNK.family='opening';
FINAL_OPENING_CHUNK.pairs[0].motion=rail(-50,60,50,-1);
export const CAPTURED_FINAL_CHUNKS=[
  vertical('stationary-tunnel',[12,14.7],[168,168,168,168,168],108),
  rising('rising-trio'),rising('rising-trio-window',true),
  descendingPursuit(),
  tunnelPlunger(),
  bank('diagonal-rise'),
  bank('diagonal-fall',{continuation:true}),
  bank('displaced-roof-bank'),
  diagonalTunnel(),diagonalTunnel(true),
  optionalExit(vertical('short-high-tunnel',[34,36.5],[168,154,144,154],112)),
  optionalExit(vertical('short-low-tunnel',[36.5,39],[168,182,192,182],112)),
  {id:'stepped-roof-tunnel',source:[34,37],family:'tunnel',clearance:24,
    pairs:[[116,236],[98,224],[132,252],[110,260],[154,296]].map(([a,b],i)=>pair(i*pitch,a,b))},
  {id:'floor-valley-tunnel',source:[39,43],family:'tunnel',clearance:24,
    pairs:[[128,244],[122,264],[134,280],[118,258],[126,246]].map(([a,b],i)=>pair(i*pitch,a,b))},
  rushGates(),
  longTunnel('long-dropping-tunnel'),longTunnel('long-low-tunnel',true),
];
