// Numeric formations from YHH2101OFfI. Artwork remains the supplied atlas only.
export const FINAL_REFERENCE={video:'YHH2101OFfI',speed:118,width:288,ground:400,captureFps:30};
export const PIPE_CLEARANCE=3;
export const RUSH_APPROACH=614.4;
const pitch=52+PIPE_CLEARANCE;
const pair=(dx,top,bottom,extra={})=>({dx,top:[0,top+64,0],bottom:[0,bottom+64,0],...extra});
const vertical=(id,source,centers,gap,spacing=pitch,motion)=>({
  id,source,family:spacing===pitch?'tunnel':'gates',clearance:24,
  pairs:centers.map((y,i)=>pair(i*spacing,y-gap/2,y+gap/2,{motion})),
});
const shutter={type:'triangle',amplitude:44,period:1.4,phase:.25};
function rising(id,window=false){
  const chunk=vertical(id,[15,18],[168,168,168],124,pitch,{type:'triangle',amplitude:32,period:7.2,phase:.75});
  chunk.family='rising';
  chunk.pairs.push(pair(240,window?180:172,window?308:292,{safetyGroup:1}));
  if(!window)chunk.pairs.push(pair(396,164,284,{safetyGroup:2}));
  return chunk;
}
function bank(id,source,speeds,phase,{continuation=false,extra=false}={}){
  const roof=[0,-26,12,-10,-34],steps=[18,0,16,0,22],count=extra?5:4;
  const chunk={id,source,family:'diagonal',entryInset:64,clearance:12,
    pairs:Array.from({length:count},(_,i)=>{
      const group=i<2?0:1,amplitude=group?32:18,base=(group?248:218)+steps[i],delta=base-248;
      return {dx:i*78,top:[-roof[i],88+roof[i]+64,Math.PI/4],bottom:[delta,base+64,-Math.PI/4],
        bottomMotion:{type:'triangle',amplitude,period:4*amplitude/speeds[group],phase:group?1-phase:phase,alongShaft:true,group},
      };
    }),
  };
  if(continuation)chunk.pairs.push(pair((count-1)*78+180,138,282,{motion:{...shutter},safetyGroup:1,allowRoofOverlap:true,afterFloor:true}));
  return chunk;
}
function longTunnel(id,low=false){
  const top=low?[118,128,108,126,116,132]:[108,88,96,80,100,110];
  const chunk={id,source:[34,39],family:'tunnel',rare:'long',clearance:12,
    pairs:top.map((y,i)=>pair(i*pitch,y,y+112)),
  };
  chunk.pairs.push(pair(6*pitch,126,278,{safetyGroup:1}),pair(7*pitch,148,306,{safetyGroup:1}));
  chunk.pairs.push(pair(8*pitch+12,178,318,{
    top:[0,178+64,-Math.PI/4],allowRoofOverlap:true,safetyGroup:2,
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
FINAL_OPENING_CHUNK.pairs[0].motion={...shutter,amplitude:28,period:1.8};
export const CAPTURED_FINAL_CHUNKS=[
  vertical('stationary-tunnel',[12,14.7],[168,168,168,168,168],108),
  rising('rising-trio'),rising('rising-trio-window',true),
  bank('diagonal-rise',[18,19.7],[56,88],.75),
  bank('diagonal-fall',[19.7,23],[72,104],.25,{continuation:true}),
  bank('displaced-roof-bank',[18,21],[64,96],.75,{extra:true}),
  {...vertical('reversing-gates',[22,25],[168,168],136,156,shutter),family:'shutter'},
  vertical('short-high-tunnel',[34,36.5],[168,154,144,154],112),
  vertical('short-low-tunnel',[36.5,39],[168,182,192,182],112),
  {id:'stepped-roof-tunnel',source:[34,37],family:'tunnel',clearance:24,
    pairs:[[116,236],[98,224],[132,252],[110,260],[154,296]].map(([a,b],i)=>pair(i*pitch,a,b))},
  {id:'floor-valley-tunnel',source:[39,43],family:'tunnel',clearance:24,
    pairs:[[128,244],[122,264],[134,280],[118,258],[126,246]].map(([a,b],i)=>pair(i*pitch,a,b))},
  {...vertical('left-rush-gates',[52,58],[168,142,204],110,168),family:'rush',entryInset:150,clearance:3,
    pairs:vertical('',[],[168,142,204],110,168).pairs.map((p,i)=>({...p,motion:{type:'rush',speed:i===2?32:20,trigger:RUSH_APPROACH,passMargin:24}}))},
  longTunnel('long-dropping-tunnel'),longTunnel('long-low-tunnel',true),rapid(2),rapid(3),
];
