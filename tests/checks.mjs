import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Game, PHYSICS, viewportLayout } from '../public/engine.mjs';
import { createApp } from '../server.mjs';
import { ASSET_FILES, SPRITES } from '../public/assets.mjs';

export function checkEngine() {
  const events = [], game = new Game({ random: () => .5, onEvent: (type, data) => events.push({ type, data }) });
  game.start(); assert.equal(game.state, 'playing'); assert.ok(game.bird.vy < 0);
  game.pipes = [{ x: game.bird.x - 10, center: game.bird.y + 100, gap: 100, width: 52, scored: false }];
  game.update(.01); assert.equal(game.state, 'falling', 'first pipe collision ends control');
  const vy = game.bird.vy, distance = game.distance, score = game.score;
  game.flap(); assert.equal(game.bird.vy, vy, 'cannot flap after collision');
  for (let i = 0; i < 100; i++) game.update(.035);
  assert.equal(game.state, 'over'); assert.equal(game.distance, distance); assert.equal(game.score, score);
  assert.equal(events.filter(e => e.type === 'over').length, 1, 'one game-over event');
  game.start(); game.bird.y = game.ground - 1; game.bird.vy = 100; game.update(.02);
  assert.equal(game.state, 'over', 'first ground collision ends the run');
  game.start(); game.pipes = [{ x: game.bird.x - 70, center: game.bird.y, gap: 100, width: 52, scored: false }];
  game.update(.02); assert.equal(game.score, 1); game.update(.02); assert.equal(game.score, 1, 'one point per pipe');
  game.start(); game.score = 999; game.update(.02);
  assert.equal(game.distance, PHYSICS.speed * .02, 'speed does not increase with score');
  assert.ok(game.pipes.every(p => p.gap === 100 && p.width === 52));
  assert.ok(!('health' in game) && !('pickups' in game) && !('active' in game), 'no proposal mechanics');
  for (const [width, height] of [[1920,1080],[390,844],[844,390],[288,512],[2560,1080]]) {
    const view = viewportLayout(width, height);
    assert.ok(Math.abs(view.width * view.scale - width) < .001);
    assert.ok(Math.abs(view.height * view.scale - height) < .001);
    assert.ok(view.width >= 288 - .001 && view.height >= 512 - .001);
  }
  const pipe = game.pipes[0], relativeX = pipe.x - game.bird.x;
  game.resize(910,512); assert.ok(Math.abs(pipe.x - game.bird.x - relativeX) < .001);
  assert.equal(game.state, 'playing', 'resize preserves the run without a menu');
  game.reset(); assert.equal(game.state, 'ready'); assert.equal(game.score, 0); assert.equal(game.pipes.length, 0);
  return 'Original rules: first-hit loss, death fall, fixed speed, scoring, reset, and widescreen geometry passed.';
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
    for (const path of ['/game.js','/engine.mjs','/assets.mjs','/style.css']) assert.equal((await fetch(base + path)).status, 200);
    const sprite = await fetch(base + '/assets/flappy/official-v1.3.png'); assert.equal(sprite.status, 200); assert.equal(sprite.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await sprite.arrayBuffer()), await readFile(new URL('../public/assets/flappy/official-v1.3.png', import.meta.url)));
    const head = await fetch(base + '/assets/flappy/official-v1.3.png', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const path of ['/server.mjs','/data/flabby.sqlite','/api/me','/api/leaderboard','/assets/flappy/sfx_wing.wav','/assets/flappy/%2e%2e%2fserver.mjs']) assert.equal((await fetch(base + path)).status, 404, `${path} is unavailable`);
    assert.equal((await fetch(base + '/api/register', { method: 'POST' })).status, 405);
    return 'Server: static game, official atlas, removed APIs, private-file protection, and no session cookies passed.';
  } finally { await app.close(); }
}
