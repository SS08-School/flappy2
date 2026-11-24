import assert from 'node:assert/strict';
import { createClient } from './client-checks.mjs';
import { readAtlasPixels } from './score-checks.mjs';

export async function checkBackgroundJoins() {
  const atlas=await readAtlasPixels();
  const pixel=(x,y)=>atlas.pixels.readUInt32BE((y*atlas.width+x)*4);
  for(const night of [false,true]) {
    for(const [width,height,dpr] of [[390,844,3],[844,390,2],[1903,1180,1],[1920,1200,1.25]]) {
      const c=await createClient({width,height,dpr,random:()=>night?.9:0});
      c.controller.prepareRun(); c.tick(.02);
      const tiles=c.elements.get('game').context.commands.filter(command=>command.kind==='image'&&command.args[3]===512);
      const base=night?292:0;
      assert.ok(tiles.length>=2,'all supported frames exercise a background join');
      assert.equal(tiles[0].args[0],base);
      let covered=0;
      for(let i=0;i<tiles.length;i++) {
        const [sx,sy,sw,sh,dx,dy,dw,dh]=tiles[i].args;
        assert.equal(sw,dw,'background artwork is never stretched');
        assert.equal(sh,dh); assert.equal(sy,0);
        assert.equal(dy,c.controller.game.ground-400);
        assert.ok(dx<=covered,'no uncovered tile edge');
        if(i) {
          const previous=tiles[i-1].args;
          const overlap=previous[4]+previous[6]-dx;
          assert.ok(overlap>=22,'matching overlap covers fractional-scale raster edges');
          // Check every actual RGBA pixel in the overlap, including clouds,
          // buildings, bushes and night stars. A clipped feature fails here.
          for(let x=0;x<overlap;x++)for(let y=0;y<512;y++) {
            assert.equal(pixel(sx+x,y),pixel(previous[0]+dx-previous[4]+x,y),
              `matching ${night?'night':'day'} tile pixels at ${dx+x},${y}`);
          }
        }
        covered=Math.max(covered,dx+dw);
      }
      assert.ok(covered>=c.controller.game.width,'background covers the complete viewport');
    }
  }
  return 'Background: exact atlas-pixel joins for day/night clouds, skyline and bushes across portrait, landscape and fractional scales passed.';
}
