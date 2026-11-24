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
const shutter={type:'triangle',amplitude:44,period:1.4,phase:.25};
function rising(id,window=false){
  const chunk=vertical(id,[15,18],[168,168,168],124,pitch,{type:'triangle',amplitude:32,period:7.2,phase:.75});
  chunk.family='rising';chunk.motif='rising';
  chunk.pairs.slice(0,3).forEach(p=>{p.motion={type:'triangle',amplitude:60,period:5,phase:.75};});
  chunk.pairs.push(pair(240,window?180:172,window?308:292,{safetyGroup:1}));
  if(!window)chunk.pairs.push(pair(396,164,284,{safetyGroup:2}));
  return chunk;
}
function bank(id,source,speeds,phase,{continuation=false}={}){
  // At 18.9 s the first three floor caps share one along-shaft coordinate:
  // each next cap is 54/sqrt(2) pixels right AND up. The next group has its
  // own length, phase and velocity. The uneven upper bank remains stationary.
  const roof=[32,30,49,36,73,41],step=54*Math.SQRT2;
  const floor=[205,205-step/2,205-step,240,221,204];
  const chunk={id,source,family:'diagonal',motif:'floor-bank',diagonal:true,anchor:144,entryInset:64,clearance:3,
    pairs:floor.map((base,i)=>{
      const group=i<3?0:1,amplitude=group?52:50;
      const bottomX=-205+i*step+base,topX=60+i*step-(roof[i]-32),dx=Math.min(bottomX,topX);
      return {dx,top:[topX-dx,roof[i]+64,Math.PI/4],bottom:[bottomX-dx,base+64,-Math.PI/4],
        bottomMotion:{type:'triangle',amplitude,period:4*amplitude/speeds[group],phase:group?1-phase:phase,alongShaft:true,group},
      };
    }),
  };
  if(continuation)chunk.pairs.push(pair(530,138,282,{motion:{...shutter},safetyGroup:1,allowRoofOverlap:true,afterFloor:true}));
  return chunk;
}
function diagonalTunnel(){
  // 48–51 s: measured cap lengths on a 54-pixel perpendicular grid. Jitter
  // only along the shafts preserves the captured 45-degree angles and gaps.
  const topV=[11,-44.5,-68.45,-145.1,-143,-241.9],bottomV=[208,226.84,309.78,419.03,444.77,528.84];
  const layout=random=>topV.map((v,i)=>{
    const tv=v+(i?random()*8-4:0),bv=bottomV[i]+(i?random()*8-4:0);
    const tu=125+i*54,bu=-97+i*54;
    const tx=(tu-tv)*Math.SQRT1_2-78.4888527117,ty=(tu+tv)*Math.SQRT1_2-64;
    const bx=(bu+bv)*Math.SQRT1_2-78.4888527117,by=(bv-bu)*Math.SQRT1_2-64,dx=Math.min(tx,bx);
    return {dx,top:[tx-dx,ty+64,Math.PI/4],bottom:[bx-dx,by+64,-Math.PI/4]};
  });
  return {id:'stationary-diagonal-tunnel',source:[48,51],family:'diagonal',motif:'angled-tunnel',diagonal:true,passageHeight:72,anchor:92,maxEntry:180,entryInset:32,clearance:3,pairs:layout(()=>.5),layout};
}
function rushGates(){
  const layout=random=>{
    const heights=[[168,142,204],[188,130,214],[146,204,158],[198,154,112]][Math.min(3,Math.floor(random()*4))];
    const speeds=[[24,76,32],[36,40,88],[28,64,76]][Math.min(2,Math.floor(random()*3))];
    return heights.map((y,i)=>pair(i*188,y-55,y+55,{safetyGroup:i,motion:{type:'rush',speed:speeds[i],trigger:RUSH_APPROACH}}));
  };
  return {id:'left-rush-gates',source:[52,58],family:'rush',motif:'rush',entryInset:160,clearance:3,pairs:layout(()=>.5),layout};
}
function longTunnel(id,low=false){
  const top=low?[118,128,108,126,116,132]:[108,88,96,80,100,110];
  const chunk={id,source:[34,39],family:'tunnel',rare:'long',clearance:12,
    pairs:top.map((y,i)=>pair(i*pitch,y,y+112)),
  };
  chunk.pairs.push(pair(6*pitch,126,278,{safetyGroup:1}),pair(7*pitch,148,306,{safetyGroup:1}));
  chunk.pairs.push(pair(8*pitch+12,178,318,{
    top:[0,178+64,-Math.PI/4],topLength:(pitch+12)*Math.SQRT2,allowRoofOverlap:true,safetyGroup:2,
  }));
  return chunk;
}
function rapid(count){
  const chunk=vertical('rapid-gates-'+count,[24,27],[188,138,202].slice(0,count),144,156);
  chunk.family='rapid';chunk.rare='rapid';
  chunk.pairs=chunk.pairs.map((p,i)=>({...p,safetyGroup:i,
    motion:{type:'triangle',amplitude:44,period:.9,phase:i%2?.75:.25},
  }));
  return chunk;
}
export const FINAL_OPENING_CHUNK=vertical('opening-moving-pair',[6,10],[168,168,168],124,156);
FINAL_OPENING_CHUNK.family='opening';
FINAL_OPENING_CHUNK.pairs[0].motion={...shutter,amplitude:58,period:2};
export const CAPTURED_FINAL_CHUNKS=[
  vertical('stationary-tunnel',[12,14.7],[168,168,168,168,168],108),
  rising('rising-trio'),rising('rising-trio-window',true),
  bank('diagonal-rise',[18,19.7],[62,70],.5),
  bank('diagonal-fall',[19.7,23],[72,104],.25,{continuation:true}),
  bank('displaced-roof-bank',[18,21],[64,96],.75,{extra:true}),
  diagonalTunnel(),
  {...vertical('following-descent',[8,11],[168,202,168],152,156),family:'following',motif:'follow',
    pairs:vertical('',[],[168,202,168],152,156).pairs.map((p,i)=>({...p,safetyGroup:i,motion:{type:'triangle',amplitude:50,period:2,phase:.25+i*.12}}))},
  {...vertical('reversing-gates',[22,25],[168,168],136,156,shutter),family:'shutter'},
  vertical('short-high-tunnel',[34,36.5],[168,154,144,154],112),
  vertical('short-low-tunnel',[36.5,39],[168,182,192,182],112),
  {id:'stepped-roof-tunnel',source:[34,37],family:'tunnel',clearance:24,
    pairs:[[116,236],[98,224],[132,252],[110,260],[154,296]].map(([a,b],i)=>pair(i*pitch,a,b))},
  {id:'floor-valley-tunnel',source:[39,43],family:'tunnel',clearance:24,
    pairs:[[128,244],[122,264],[134,280],[118,258],[126,246]].map(([a,b],i)=>pair(i*pitch,a,b))},
  rushGates(),
  longTunnel('long-dropping-tunnel'),longTunnel('long-low-tunnel',true),rapid(2),rapid(3),
];
