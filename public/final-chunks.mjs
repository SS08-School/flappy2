// Numeric layouts/behaviors from the supplied YHH2101OFfI footage; no artwork.
export const FINAL_REFERENCE={video:'YHH2101OFfI',speed:118,width:288,ground:400,captureFps:30};
export const PIPE_CLEARANCE=3;
const pitch=52+PIPE_CLEARANCE;
const vertical=(id,source,centers,gap,spacing=pitch,motion)=>({
  id,source,family:spacing===pitch?'tunnel':'gates',clearance:104,
  pairs:centers.map((center,i)=>({dx:i*spacing,top:[0,center+64-gap/2,0],bottom:[0,center+64+gap/2,0],motion})),
});
const shutter={type:'triangle',amplitude:44,period:1.4,phase:.25};
function bank(id,source,speeds,phase){
  // Fixed roof, two floor posts per speed group. Shaft-axis travel keeps the
  // small perpendicular gap intact even when neighboring groups move differently.
  const amplitude=30;
  return {id,source,family:'diagonal',entryInset:34,clearance:104,
    pairs:Array.from({length:4},(_,i)=>({dx:i*78,
      top:[0,88+64,Math.PI/4],bottom:[0,248+64,-Math.PI/4],
      bottomMotion:{type:'triangle',amplitude,period:4*amplitude/speeds[Math.floor(i/2)],phase,alongShaft:true,group:Math.floor(i/2)},
    })),
  };
}
export const FINAL_OPENING_CHUNK=vertical('opening-moving-pair',[6,10],[168,168,168],124,156);
FINAL_OPENING_CHUNK.family='opening';
FINAL_OPENING_CHUNK.pairs[0].motion={...shutter,amplitude:28,period:1.8};
export const CAPTURED_FINAL_CHUNKS=[
  vertical('stationary-tunnel',[12,14.7],[168,168,168,168,168],108),
  {...vertical('rising-trio',[15,17],[168,168,168],124),family:'rising',
    pairs:vertical('',[],[168,168,168],124).pairs.map(p=>({...p,bottomMotion:{type:'triangle',amplitude:32,period:7.2,phase:.75,group:0}}))},
  bank('diagonal-rise',[18,19.7],[56,88],.75),
  bank('diagonal-fall',[19.7,22],[72,104],.25),
  {...vertical('reversing-gates',[22,25],[168,168],136,156,shutter),family:'shutter',clearance:156},
  vertical('short-high-tunnel',[34,36.5],[168,154,144,154],112),
  vertical('short-low-tunnel',[36.5,39],[168,182,192,182],112),
  {...vertical('left-rush-gates',[52,58],[168,142,204],110,168),family:'rush',entryInset:180,clearance:156,
    pairs:vertical('',[],[168,142,204],110,168).pairs.map((p,i)=>({...p,motion:{type:'rush',speed:i===2?360:260,trigger:146,passMargin:24}}))},
];
