import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Game, METRICS, PHYSICS, viewportLayout } from '../public/engine.mjs';
import { createApp } from '../server.mjs';
import { ASSET_FILES, SPRITES } from '../public/assets.mjs';
import { SOUND_FILES } from '../public/audio.mjs';
export function checkClassicVariety(){
  let state=194,random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const game=new Game({random}),values=[];
  for(let i=0;i<500;i++){game.spawnPipe(i*156);values.push(game.pipes.at(-1).center);}
  assert.ok(Math.min(...values)>=100&&Math.max(...values)<=236);
  assert.ok(Math.max(...values)-Math.min(...values)>125,'classic openings cover the original height range');
  assert.ok(new Set(values.map(y=>y.toFixed(4))).size>480,'classic heights remain continuous, not a few preset elevations');
  const bins=Array(6).fill(0);for(const y of values)bins[Math.min(5,Math.floor((y-100)/136*6))]++;
  assert.ok(bins.every(n=>n>35),'all parts of the available height range appear');
  const draws=[.1,.9,.1,.5],repeat=new Game({random:()=>draws.shift()??.5});
  repeat.spawnPipe(0);repeat.spawnPipe(156);repeat.spawnPipe(312);
  assert.ok(Math.abs(repeat.pipes[2].center-repeat.pipes[0].center)>=16,'an alternating repeat is resampled');
  return 'Classic pipes: continuous heights cover the full original range, with near-repeat/alternation rejection and no fixed two-height cycle.';
}

export function checkEngine() {
  const events = [], game = new Game({ random: () => .5, onEvent: (type, data) => events.push({ type, data }) });
  game.start(); assert.equal(game.state, 'playing'); assert.ok(game.bird.vy < 0);
  game.pipes = [{ x: game.bird.x - 10, center: game.bird.y + 100, gap: 100, width: 52, scored: false }];
  game.update(.02); assert.equal(game.state, 'falling', 'first pipe collision ends control');
  const vy = game.bird.vy, distance = game.distance, score = game.score;
  game.flap(); assert.equal(game.bird.vy, vy, 'cannot flap after collision');
  for (let i = 0; i < 100; i++) game.update(.035);
  assert.equal(game.state, 'over'); assert.equal(game.distance, distance); assert.equal(game.score, score);
  assert.equal(events.filter(e => e.type === 'over').length, 1, 'one game-over event');
  const trajectories = [30,60,120].map(fps => {
    const run = new Game(); run.start();
    for (let frame=0;frame<fps/5;frame++) run.update(1/fps);
    return {y:run.bird.y,distance:run.distance};
  });
  assert.ok(trajectories.every(t=>Math.abs(t.y-trajectories[0].y)<1e-9&&t.distance===trajectories[0].distance),'30/60/120 Hz renders produce identical physics');
  game.start(); game.bird.y = game.ground - 1; game.bird.vy = 100; game.update(.02);
  assert.equal(game.state, 'over', 'first ground collision ends the run');
  game.start(); game.score = 7; game.bird.y = game.bird.radius + 1;
  const topEvents = events.length;
  game.update(PHYSICS.step);
  assert.equal(game.state, 'falling', 'top edge collision kills the bird');
  assert.equal(game.bird.y, game.bird.radius, 'collision keeps the bird on screen');
  const topDistance = game.distance;
  game.flap(); assert.equal(game.bird.vy, 0, 'top collision disables flapping immediately');
  for (let i=0;i<100;i++) game.update(PHYSICS.step);
  assert.equal(game.state, 'over'); assert.equal(game.score, 7); assert.equal(game.distance, topDistance);
  assert.equal(events.slice(topEvents).filter(e => e.type === 'hit').length, 1);
  assert.equal(events.slice(topEvents).filter(e => e.type === 'over').length, 1);
  game.start(); game.pipes = [{ x: game.bird.x - 20, center: game.bird.y, gap: 100, width: 52, scored: false }];
  game.update(.02); assert.equal(game.score, 1); game.update(.02); assert.equal(game.score, 1, 'one point per pipe');
  game.start(); game.score = 4; game.update(PHYSICS.step);
  assert.equal(game.distance, 2, 'fixed native two-pixel step does not change with score');
  assert.ok(game.pipes.every(p => p.gap === 100 && p.width === 52));
  assert.ok(!('health' in game) && !('pickups' in game) && !('active' in game), 'no proposal mechanics');
  for (const [width, height] of [[1920,1080],[390,844],[844,390],[288,384],[2560,1080]]) {
    const view = viewportLayout(width, height);
    assert.ok(Math.abs(view.width * view.scale - view.pixelsWide) < .001);
    assert.ok(Math.abs(view.height * view.scale - view.pixelsHigh) < .001);
    assert.equal(view.height,METRICS.height);
    assert.ok(view.width>=240-.001&&view.width<=614.4+.001);
    assert.ok(Math.max(view.pixelsWide/view.pixelsHigh,view.pixelsHigh/view.pixelsWide)<=1.6+1e-9);
  }
  game.start();
  const pump = () => { game.bird.y = 188; game.bird.vy = 0; game.update(PHYSICS.step); };
  assert.equal(game.pipes.length,1,'first pipe exists immediately, offscreen');
  assert.ok(game.pipes[0].x>=game.width);
  pump(); assert.equal(game.pipes.length,2,'following pipe is queued ahead of the screen');
  for (let i = 0; i < 78; i++) pump();
  assert.equal(game.pipes.length, 3); assert.ok(Math.abs(game.pipes[1].x - game.pipes[0].x - 156) < .001, 'reference pipe spacing');
  const pipe = game.pipes[0], relativeX = pipe.x - game.bird.x;
  game.resize(910,384); assert.ok(Math.abs(pipe.x - game.bird.x - relativeX) < .001);
  assert.equal(game.state, 'playing', 'resize preserves the run without a menu');
  game.reset(); assert.equal(game.state, 'ready'); assert.equal(game.score, 0); assert.equal(game.pipes.length, 0);
  return 'Game rules: pipe/ground/ceiling loss, death fall, fixed speed, scoring, reset, and widescreen geometry passed.';
}

export function checkPipeTiming() {
  let baseline;
  for (const [width,height] of [[614.4,384],[512,384],[384,384],[288,384],[288,623.2615384615]]) {
    for (const fps of [30,60,144,240]) {
      const points=[], game=new Game({width,height,random:()=>.5,onEvent(type){if(type==='score')points.push(Number(game.elapsed.toFixed(6)));}});
      game.start();
      assert.ok(game.pipes[0].x>=width-1e-8,'first pipe starts fully offscreen');
      assert.ok(Math.abs(game.pipes[0].x-game.bird.x-426.48)<1e-8,'starting distance uses the maximum 16:10 world');
      if(width===614.4)assert.ok(Math.abs(game.pipes[0].x-width)<1e-8,'widest view starts as close as possible');
      const seen=new Set(game.pipes);
      for(let frame=0;frame<fps*8;frame++) {
        game.bird.y=game.ground/2;game.bird.vy=0;game.update(1/fps);
        for(const pipe of game.pipes)if(!seen.has(pipe)){assert.ok(pipe.x>=width-1e-8,'new pipes are queued offscreen without popping in');seen.add(pipe);}
        const classic=game.pipes.filter(p=>p.level===1);
        for(let i=1;i<classic.length;i++)assert.ok(Math.abs(classic[i].x-classic[i-1].x-156)<1e-8,'level 1 pipe spacing stays constant');
      }
      assert.equal(game.state,'playing');
      assert.equal(points[0],3.666667,'opening score arrives without the old 2.2 second delay');
      baseline ||= points;
      assert.deepEqual(points,baseline,'all aspect ratios and refresh rates encounter pipes at the same times');
    }
  }
  return 'Pipes: immediate offscreen start, fixed 16:10-based distance, no pop-in, constant spacing and identical encounter times at 30–240 Hz passed.';
}

export async function checkAssets() {
  assert.equal(ASSET_FILES.join(','), 'official-v1.3.png');
  assert.equal((await readdir(new URL('../public/assets/flappy/', import.meta.url))).join(','), 'official-v1.3.png');
  const data = await readFile(new URL('../public/assets/flappy/official-v1.3.png', import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'), 'e905c929c0de3d59c565d8903db7f3ca27cd78fa76212dcf14db2796d3b2ad7d', 'only the unchanged uploaded sprite sheet');
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  for (const s of Object.values(SPRITES)) {
    for (const [x,y] of s.frames || [[s.x,s.y]]) assert.ok(x + s.width <= width && y + s.height <= height, 'sprite bounds');
  }
  return 'Assets: uploaded atlas checksum, sprite bounds, and absence of downloaded assets passed.';
}

export async function checkServer() {
  const app = await createApp();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const page = await fetch(base); assert.equal(page.status, 200); assert.equal(page.headers.get('set-cookie'), null);
    const html = await page.text(), body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/)[1];
    assert.equal(body.replace(/<[^>]*>/g, '').trim(), '', 'no visible text outside official image sprites');
    for (const path of ['/game.js','/engine.mjs','/assets.mjs','/transitions.mjs','/bird-presentation.mjs','/style.css']) assert.equal((await fetch(base + path)).status, 200);
    const manifestResponse=await fetch(base+'/manifest.webmanifest');
    assert.equal(manifestResponse.headers.get('content-type'),'application/manifest+json');
    const manifest=await manifestResponse.json();assert.equal(manifest.display,'fullscreen');
    assert.equal(manifest.orientation,undefined,'home-screen play permits both orientations');
    for(const icon of manifest.icons)assert.equal((await fetch(base+icon.src)).status,200,'official sprite app icons are served');
    const sprite = await fetch(base + '/assets/flappy/official-v1.3.png'); assert.equal(sprite.status, 200); assert.equal(sprite.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await sprite.arrayBuffer()), await readFile(new URL('../public/assets/flappy/official-v1.3.png', import.meta.url)));
    const head = await fetch(base + '/assets/flappy/official-v1.3.png', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const file of Object.values(SOUND_FILES)) {
      const sound = await fetch(base + '/assets/audio/' + file);
      assert.equal(sound.status, 200);
      assert.equal(sound.headers.get('content-type'), file.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
      assert.deepEqual(Buffer.from(await sound.arrayBuffer()), await readFile(new URL('../public/assets/audio/' + file, import.meta.url)));
    }
    for (const file of ['audio.mjs','medal-presentation.mjs','difficulty.mjs','level3-chunks.mjs','pipe-safety.mjs']) assert.equal((await fetch(base + '/' + file)).status, 200);
    for (const path of ['/server.mjs','/data/flabby.sqlite','/api/me','/api/leaderboard','/assets/flappy/sfx_wing.wav','/assets/flappy/%2e%2e%2fserver.mjs']) assert.equal((await fetch(base + path)).status, 404, `${path} is unavailable`);
    assert.equal((await fetch(base + '/api/register', { method: 'POST' })).status, 405);
    return 'Server: static game, official atlas, removed APIs, private-file protection, and no session cookies passed.';
  } finally { await app.close(); }
}
