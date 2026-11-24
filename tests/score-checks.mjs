import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { createClient } from './client-checks.mjs';

// Inspect actual atlas pixels so a swapped digit cannot pass by merely
// asserting that the renderer uses the same incorrect coordinate table.
export async function readAtlasPixels() {
  const png = await readFile(new URL('../public/assets/flappy/official-v1.3.png', import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), chunks=[];
  assert.equal(png[24],8); assert.equal(png[25],6); assert.equal(png[28],0);
  for (let offset=8;offset<png.length;) {
    const length=png.readUInt32BE(offset), type=png.toString('ascii',offset+4,offset+8);
    if(type==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));
    offset+=length+12;
  }
  const raw=inflateSync(Buffer.concat(chunks)), stride=width*4, pixels=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)];
    for(let x=0;x<stride;x++) {
      const index=y*stride+x, a=x>=4?pixels[index-4]:0, b=y?pixels[index-stride]:0, c=y&&x>=4?pixels[index-stride-4]:0;
      const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
      const prediction=[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:c][filter];
      pixels[index]=(raw[y*(stride+1)+x+1]+prediction)&255;
    }
  }
  return { width, height, pixels };
}

export async function checkScoreDigits() {
  const {width,pixels}=await readAtlasPixels();
  const white=(x,y)=>{const i=(y*width+x)*4;return pixels[i]>240&&pixels[i+1]>240&&pixels[i+2]>240&&pixels[i+3]>240;};
  // Top, upper left/right, middle, lower left/right, bottom strokes.
  const strokes=['1110111','0010010','1011101','1011011','0111010','1101011','1101111','1010010','1111111','1111011'];
  const identify=command=>{
    const [sx,sy,width,height]=command.args;
    assert.equal(height,20);
    if(width===10) {
      assert.ok(white(sx+6,sy+10)&&!white(sx+2,sy+10),'narrow glyph is a 1');
      return '1';
    }
    const bits=[[6,2],[2,6],[11,6],[6,9],[2,13],[11,13],[6,16]].map(([x,y])=>white(sx+x,sy+y)?'1':'0').join('');
    const digit=strokes.indexOf(bits); assert.ok(digit>=0,`recognized digit strokes ${bits}`);
    return String(digit);
  };
  const c=await createClient(); c.controller.prepareRun();
  let expectedBest=0;
  for (const score of [33,2,9,0,1,4,5,6,7,8,23,39,99,1234567890]) {
    c.controller.game.start(); c.controller.game.score=score; c.controller.game.hit(); c.controller.game.end(); c.tick(.02);
    const digits=c.elements.get('game').context.commands.filter(command=>command.kind==='image'&&command.args[3]===20&&command.args[5]===165);
    assert.equal(digits.map(identify).join(''),String(score),`${score} renders as its actual digits on the scorecard`);
    expectedBest=Math.max(expectedBest,score);
    assert.equal(c.stored.get('flappy-best'),String(expectedBest),'stored best uses the actual numeric score');
    assert.equal(c.controller.game.score,score,'drawing never changes the run score');
  }
  return 'Scorecard: actual atlas pixels identify every digit correctly, including 33, 2/3/9 swaps and multi-digit results.';
}
