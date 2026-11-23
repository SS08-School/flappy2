// Layout/motion records from the supplied YHH2101OFfI reference and screenshots.
// Coordinates retain the footage's 400-pixel ground; dense sections are shortened.
// These are numeric records only. Artwork always comes from the uploaded atlas.
export const FINAL_REFERENCE = { video:'YHH2101OFfI', speed:118, width:288, ground:400, captureFps:30 };
const vertical=(id,source,centers,gap,spacing=52,motion)=>({
  id,source,family:spacing===52?'tunnel':'gates',clearance:104,
  pairs:centers.map((center,i)=>({dx:i*spacing,top:[0,center+64-gap/2,0],bottom:[0,center+64+gap/2,0],motion})),
});
const rise={type:'triangle',amplitude:32,period:7.2,phase:.75};
const diagonal={type:'triangle',amplitude:30,period:5.6,phase:.75};
const shutter={type:'triangle',amplitude:44,period:1.4,phase:.25};
function bank(id,source,centers,phase){
  return {id,source,family:'diagonal',clearance:104,
    pairs:centers.map((center,i)=>({dx:i*96,
      top:[0,center+64-92,Math.PI/4],bottom:[0,center+64+92,-Math.PI/4],
      motion:{...diagonal,phase},
    })),
  };
}
// The first final gate always moves, followed by two ordinary spaced gates.
export const FINAL_OPENING_CHUNK=vertical('opening-moving-pair',[6,10],[168,168,168],124,156);
FINAL_OPENING_CHUNK.family='opening';
FINAL_OPENING_CHUNK.pairs[0].motion={...shutter,amplitude:28,period:1.8};
export const CAPTURED_FINAL_CHUNKS=[
  // Screenshot 2: flat, completely stationary roof/floor, five columns only.
  vertical('stationary-tunnel',[12,14.7],[168,168,168,168,168],120),
  // Screenshot 3: three neighboring gates travel upward together.
  {...vertical('rising-trio',[15,17],[168,168,168],124,52,rise),family:'rising'},
  // Screenshots 4/5: orderly parallel banks, shared motion and no fan rotations.
  bank('diagonal-rise',[18,19.7],[182,168,154],.75),
  bank('diagonal-fall',[19.7,22],[154,168,182],.25),
  // Screenshot 6: a clear approach, then brisk constant-speed reversing gates.
  {...vertical('reversing-gates',[22,25],[168,168],144,156,shutter),family:'shutter',clearance:156},
  // Screenshot 7: retain the open stepped passage, cut to four columns.
  vertical('short-high-tunnel',[34,36.5],[168,154,144,154],124),
  vertical('short-low-tunnel',[36.5,39],[168,182,192,182],124),
  // Screenshot 8: isolated ordinary gates lunge left; no dense bank mixed in.
  {...vertical('left-rush-gates',[55,59],[168,146,184],114,188,
    {type:'rush',distance:96,speed:180,trigger:260}),family:'rush',entryInset:96,clearance:156},
];
