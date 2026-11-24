// Preserve source x positions/orientations; retract only walls that intrude
// into a continuous, generously sized flight corridor.
export const PASSAGE = { height:92, slope:.4, birdRadius:12, edgeMargin:76 };
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function postVertices(pipe,post,up,length){
  const a=up?-length:0,b=up?0:length,co=Math.cos(post.angle),si=Math.sin(post.angle);
  return [[-pipe.width/2,a],[pipe.width/2,a],[pipe.width/2,b],[-pipe.width/2,b]].map(([x,y])=>[pipe.x+pipe.width/2+post.x+x*co-y*si,post.y+x*si+y*co]);
}
export function clipToGround(polygon,ground){
  for(const [edge,sign] of [[0,1],[ground,-1]]){
    const clipped=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],ia=(a[1]-edge)*sign>=0,ib=(b[1]-edge)*sign>=0;
      if(ia)clipped.push(a);
      if(ia!==ib){const t=(edge-a[1])/(b[1]-a[1]);clipped.push([a[0]+(b[0]-a[0])*t,edge]);}
    }
    polygon=clipped;
  }
  return polygon;
}
export function slabRange(polygon,left,right){
  for(const [edge,sign] of [[left,1],[right,-1]]){
    const clipped=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],ia=(a[0]-edge)*sign>=0,ib=(b[0]-edge)*sign>=0;
      if(ia)clipped.push(a);
      if(ia!==ib){const t=(edge-a[0])/(b[0]-a[0]);clipped.push([edge,a[1]+(b[1]-a[1])*t]);}
    }
    polygon=clipped;
  }
  return polygon.length?[Math.min(...polygon.map(p=>p[1])),Math.max(...polygon.map(p=>p[1]))]:null;
}
export function pathHeight(nodes,x){
  if(x<=nodes[0][0])return nodes[0][1];
  for(let i=1;i<nodes.length;i++)if(x<=nodes[i][0]){const a=nodes[i-1],b=nodes[i],t=(x-a[0])/(b[0]-a[0]);return a[1]+(b[1]-a[1])*t;}
  return nodes.at(-1)[1];
}
export function fitPassage({pipes,x,nextX,ground,entryCenter,pose,envelope,length}){
  const first=pose(pipes[0]),entry=clamp(entryCenter??first.center,PASSAGE.edgeMargin,ground-PASSAGE.edgeMargin);
  const nodes=[[x-32,entry],[x,entry]];
  for(const pipe of pipes){
    const at=pipe.x+pipe.width/2,shape=pose(pipe),target=clamp(shape.center,PASSAGE.edgeMargin,ground-PASSAGE.edgeMargin),last=nodes.at(-1);
    const maxChange=(at-last[0])*PASSAGE.slope,y=clamp(target,last[1]-maxChange,last[1]+maxChange);
    nodes.push([at,y]);pipe.safeCenter=y;
  }
  const exit=nodes.at(-1)[1];nodes.push([nextX,exit],[nextX+32,exit]);
  const xs=new Set(nodes.map(p=>p[0]));
  for(let at=x-32;at<=nextX+32;at+=4)xs.add(at);
  for(const pipe of pipes){
    const shape=envelope(pipe);
    for(const [post,up] of [[shape.top,true],[shape.bottom,false]])for(const [at] of postVertices(pipe,post,up,length(pipe,ground)))for(const dx of [-PASSAGE.birdRadius,PASSAGE.birdRadius])if(at+dx>=x-32&&at+dx<=nextX+32)xs.add(at+dx);
  }
  for(const pipe of pipes){
    const shape=envelope(pipe);
    for(const [post,up] of [[shape.top,true],[shape.bottom,false]]){
      const polygon=postVertices(pipe,post,up,length(pipe,ground));let correction=0;
      for(const at of xs){
        const range=slabRange(polygon,at-PASSAGE.birdRadius,at+PASSAGE.birdRadius);if(!range)continue;
        const y=pathHeight(nodes,at);
        correction=Math.max(correction,up?range[1]-(y-PASSAGE.height/2):(y+PASSAGE.height/2)-range[0]);
      }
      if(correction>1e-7){const key=up?'upperRetraction':'lowerRetraction';pipe[key]=(pipe[key]||0)+correction+1;}
    }
  }
  return {nodes,exitCenter:exit};
}
