import assert from 'node:assert/strict';
import { Game, difficulty, viewportLayout, SKINS, METRICS } from '../public/engine.mjs';
import { createApp, weekStart } from '../server.mjs';
import { ASSET_FILES, createSoundBank, SPRITES } from '../public/assets.mjs';
import { readFile } from 'node:fs/promises';

export function checkEngine() {
  const events = [];
  const game = new Game({ random: () => .5, onEvent: (type, data) => events.push({ type, data }) });
  game.start();
  assert.equal(game.health, 2);
  assert.ok(game.bird.vy < 0);
  game.hit(); assert.equal(game.health, 1); assert.equal(game.state, 'playing');
  game.hit(); assert.equal(game.health, 1, 'recovery prevents repeated damage');
  game.invincible = 0; game.hit(); assert.equal(game.state, 'over'); assert.equal(game.health, 0);
  assert.equal(events.filter(e => e.type === 'over').length, 1);
  game.start();game.activate('cloak');game.hit();assert.equal(game.health, 2, 'cloak bypasses pipes');
  game.bird.y = game.ground - 1;game.bird.vy = 100;game.update(.02);assert.equal(game.health, 1, 'ground still hurts while cloaked');
  game.start();game.pause();const y=game.bird.y;game.update(.02);assert.equal(game.bird.y,y,'pause freezes physics');game.resume();game.update(.02);assert.notEqual(game.bird.y,y);
  game.start();game.activate('snail');game.update(.02);const slow=game.distance;
  game.start();game.update(.02);assert.ok(game.distance>slow,'snail slows the world');
  game.start();game.pipes=[{x:game.bird.x-75,center:game.bird.y,gap:112,width:52,scored:false}];game.update(.02);assert.equal(game.score,1);game.update(.02);assert.equal(game.score,1,'pipe only scores once');
  game.start();game.activate('snail');for(let i=0;i<220;i++){game.bird.y=200;game.bird.vy=0;game.pipes=[];game.spawnX=10000;game.update(.035);}assert.equal(game.active,null,'power expires');
  assert.ok(difficulty(10).speed>difficulty(9).speed);assert.ok(difficulty(10).spacing>difficulty(9).spacing);
  assert.equal(difficulty(99999).speed,240);assert.ok(difficulty(99999).gap>=100);
  for (const [width, height] of [[1920,1080],[390,844],[844,390],[288,512],[2560,1080]]) {
    const view = viewportLayout(width, height);
    assert.ok(Math.abs(view.width * view.scale - width) < .001);
    assert.ok(Math.abs(view.height * view.scale - height) < .001);
    assert.ok(view.width >= 288 - .001 && view.height >= 512 - .001);
    assert.equal(METRICS.birdWidth / METRICS.pipeWidth, 34 / 52, 'native object proportions');
  }
  game.start(); game.update(.02); game.pause();
  const firstPipe = game.pipes[0], distanceToPipe = firstPipe.x - game.bird.x;
  game.resize(910,512);
  assert.ok(Math.abs(firstPipe.x-game.bird.x-distanceToPipe)<.001,'resize keeps distance to obstacles');
  assert.equal(game.health,2); assert.equal(game.state,'paused'); assert.equal(game.ground,400);
  assert.deepEqual(SKINS.map(s=>s.id),['classic','rose','blue'],'only official bird colors');
  return 'Physics: damage recovery, cloak, ground, pause, snail, scoring, expiration, and difficulty passed.';
}

export async function checkServer() {
  let time = Date.parse('2026-11-19T12:00:00Z');
  const app = await createApp({ database: ':memory:', now: () => time });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '';
  const request = async (path, body, extra = {}) => {
    const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : {'Content-Type':'application/json'}), Cookie: cookie, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie'); if(set)cookie=set.split(';')[0];
    return { status:r.status, body:await r.json(), cookie:set };
  };
  try {
    assert.equal(weekStart(new Date('2026-11-22T23:59:00Z')),'2026-11-16');
    assert.equal(weekStart(new Date('2026-11-23T00:00:00Z')),'2026-11-23');
    assert.equal((await fetch(base)).status,200);
    assert.equal((await fetch(base+'/assets.mjs')).status,200);
    for (const filename of ASSET_FILES) {
      const resource = await fetch(`${base}/assets/flappy/${filename}`);
      assert.equal(resource.status, 200, `${filename} is served`);
      assert.equal(resource.headers.get('content-type'), filename.endsWith('.png') ? 'image/png' : 'audio/wav');
      const bytes = Buffer.from(await resource.arrayBuffer());
      assert.deepEqual(bytes, await readFile(new URL(`../public/assets/flappy/${filename}`, import.meta.url)), 'asset is served unchanged');
      assert.equal(bytes.toString('ascii', 1, 4), filename.endsWith('.png') ? 'PNG' : 'IFF');
      if (filename.endsWith('.wav')) assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    }
    const head = await fetch(base+'/assets/flappy/official-v1.3.png', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.ok(Number(head.headers.get('content-length')) > 0); assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(base+'/assets/flappy/missing.png')).status,404);
    assert.equal((await fetch(base+'/assets/flappy/%2e%2e%2fserver.mjs')).status,404);
    assert.equal((await fetch(base+'/server.mjs')).status,404,'source code is not public');
    assert.equal((await request('/api/me')).body.user,null);
    assert.equal((await request('/api/runs',{})).status,401);
    assert.equal((await request('/api/register',{name:'ab',password:'password123'})).status,400);
    assert.equal((await request('/api/register',{name:'TestPilot',password:'short'})).status,400);
    const registered=await request('/api/register',{name:'TestPilot',password:'password123'});
    assert.equal(registered.status,200);assert.match(registered.cookie,/HttpOnly/);assert.match(registered.cookie,/SameSite=Lax/);
    assert.equal(registered.body.user.best,0);assert.ok(!('hash' in registered.body.user));
    assert.equal((await request('/api/register',{name:'testpilot',password:'password123'})).status,409);
    assert.equal((await request('/api/skin',{skin:'gold'})).status,400,'locked skin cannot be equipped');
    assert.equal((await request('/api/skin',{skin:'toString'})).status,400,'invalid skin rejected');
    assert.equal((await request('/api/runs',{}, {Origin:'https://other.example'})).status,403);
    const run=(await request('/api/runs',{})).body.token;
    assert.equal((await request('/api/scores',{token:run,score:999})).status,400,'impossible immediate score rejected');
    time+=60000;
    const score=await request('/api/scores',{token:run,score:30});assert.equal(score.status,201);assert.equal(score.body.user.best,30);assert.equal(score.body.user.flights,1);
    assert.equal((await request('/api/scores',{token:run,score:30})).status,409,'run cannot be submitted twice');
    assert.equal((await request('/api/skin',{skin:'rose'})).body.user.skin,'rose');
    assert.equal((await request('/api/skin',{skin:'mint'})).status,400,'custom recolors are no longer offered');
    const board=(await request('/api/leaderboard')).body;assert.equal(board.entries.length,1);assert.equal(board.entries[0].score,30);assert.equal(board.entries[0].you,true);
    await request('/api/logout',{});assert.equal((await request('/api/me')).body.user,null);
    assert.equal((await request('/api/login',{name:'testpilot',password:'wrongpass'})).status,401);
    assert.equal((await request('/api/login',{name:'TESTPILOT',password:'password123'})).status,200);
    time=Date.parse('2026-11-23T00:00:01Z');
    assert.equal((await request('/api/leaderboard')).body.entries.length,0,'weekly board resets');
    assert.equal((await request('/api/leaderboard?period=all')).body.entries.length,1,'all-time scores preserved');
    const profile=(await request('/api/me')).body.user;assert.equal(profile.weekly,0);assert.equal(profile.best,30);assert.equal(profile.rewards.length,1);assert.equal(profile.rewards[0].rank,1);
    await request('/api/me');assert.equal((await request('/api/me')).body.user.rewards.length,1,'weekly rewards are idempotent');
    time+=31*86400000;assert.equal((await request('/api/me')).body.user,null,'session expires');
    return 'Server: accounts, sessions, validation, origin checks, score replay protection, unlocks, weekly reset, rewards, and expiry passed.';
  } finally { await app.close(); }
}

export async function checkAssets() {
  const data = await readFile(new URL('../public/assets/flappy/official-v1.3.png', import.meta.url));
  const sheet = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  const source = await readFile(new URL('../Mobile - Flappy Bird - Miscellaneous - General Sprites (v1.3).png', import.meta.url)).catch(() => null);
  if (source) assert.deepEqual(data, source, 'uploaded official atlas is preserved unchanged');
  for (const color of ['yellow', 'red', 'blue']) {
    const sprite = SPRITES[color];
    for (const [x, y] of sprite.frames) {
      assert.ok(x >= 0 && y >= 0 && x + sprite.width <= sheet.width && y + sprite.height <= sheet.height, `${color} animation stays inside sprite sheet`);
    }
  }
  for (const sprite of Object.values(SPRITES).filter(s=>!s.frames)) assert.ok(sprite.x+sprite.width<=sheet.width && sprite.y+sprite.height<=sheet.height,'UI and scenery sprite bounds');
  const effects = [];
  const bank = createSoundBank(path => {
    const effect = { path, currentTime: 0, plays: 0, pauses: 0, play() { this.plays++; return Promise.resolve(); }, pause() { this.pauses++; } };
    effects.push(effect); return effect;
  });
  bank.play('flap'); bank.play('flap');
  const playing = effects.filter(effect => effect.plays);
  assert.equal(playing.length, 2, 'rapid flaps use separate audio voices');
  assert.ok(playing.every(effect => effect.path.endsWith('sfx_wing.wav')));
  bank.stop(); assert.ok(effects.every(effect => effect.pauses === 1), 'muting stops every active effect');
  return 'Assets: sprite bounds, pooled flap playback, and muting passed.';
}
