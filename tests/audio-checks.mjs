import assert from 'node:assert/strict';
import { GameAudio, SOUND_FILES, DEATH_SOUND_DELAY } from '../public/audio.mjs';
import { MedalGlimmer } from '../public/medal-presentation.mjs';
import { createClient } from './client-checks.mjs';

export async function checkAudio() {
  const requests = [], sources = [];
  const context = {
    state: 'suspended', currentTime: 12, destination: {}, resumes: 0,
    async resume() { this.resumes++; this.state = 'running'; },
    async decodeAudioData(bytes) { return bytes; },
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start(time, offset) { this.startAt = time; this.offset = offset; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
  };
  const audio = new GameAudio({ createContext: () => context, fetchAudio: async url => {
    requests.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  } });
  await audio.ready;
  assert.equal(requests.length, Object.keys(SOUND_FILES).length);
  audio.play('wing'); assert.equal(sources.length, 0, 'no autoplay before a gesture');
  audio.unlock(); audio.play('wing'); audio.play('wing');
  assert.equal(context.resumes, 1); assert.equal(sources.length, 2, 'fast flaps get independent sources');
  assert.equal(sources[0].startAt, 12); assert.ok(sources[0].offset < .02);
  audio.play('point'); assert.equal(sources.at(-1).offset, .12, 'skip point recording padding');
  audio.play('die', DEATH_SOUND_DELAY); assert.equal(sources.at(-1).startAt, 12.2);
  sources[0].onended(); audio.stop();
  assert.ok(sources.slice(1).every(s => s.stopped), 'replay cancels delayed and active sounds');
  const unavailable = new GameAudio({ createContext() { throw new Error('unsupported'); } });
  unavailable.unlock(); unavailable.play('wing'); unavailable.stop();

  const calls = [], stub = { unlock() {}, stop() { calls.push(['stop']); }, play(...args) { calls.push(args); } };
  const c = await createClient({ reducedMotion: false, audio: stub });
  c.tick(.36); c.controller.prepareRun(); c.tick(.9);
  assert.deepEqual(calls, [['stop'], ['swoosh']], 'Play transitions swoosh, idle wing animation is silent');
  c.controller.flap(); c.controller.flap();
  assert.equal(calls.filter(([n]) => n === 'wing').length, 2, 'one sound per actual flap, including first tap');
  const g = c.controller.game;
  g.pipes = [{ x: g.bird.x - 20, center: g.bird.y, gap: 100, width: 52, scored: false }];
  c.tick(.02); c.tick(.02);
  assert.equal(calls.filter(([n]) => n === 'point').length, 1);
  g.hit(); g.hit(); c.controller.flap();
  assert.equal(calls.filter(([n]) => n === 'hit').length, 1);
  assert.equal(calls.filter(([n]) => n === 'wing').length, 2, 'no wing sound after death');
  assert.deepEqual(calls.find(([n]) => n === 'die'), ['die', .2]);
  for (let i=0;i<180;i++) c.tick(1/60);
  assert.equal(calls.filter(([n]) => n === 'swoosh').length, 3, 'scene, heading and card each swoosh once');
  c.controller.prepareRun(); c.tick(.9);
  const groundStart = calls.length;
  c.controller.flap(); g.bird.y = g.ground; c.tick(.02);
  assert.equal(calls.slice(groundStart).filter(([n]) => n === 'hit').length, 1);
  assert.equal(calls.slice(groundStart).filter(([n]) => n === 'die').length, 0, 'ground-only hit has no falling whistle');
  return 'Audio: gesture unlock, overlapping flaps, point onset, collision sequence, result swooshes and replay cancellation passed.';
}

export function checkGlimmer() {
  const glimmer = new MedalGlimmer(); let randomCalls = 0;
  const random = () => (++randomCalls % 4) / 4;
  const frames = [0,.1,.2,.3,.4].map(t => glimmer.sample(t, random));
  assert.deepEqual(frames.map(f => f.sprite), ['sparkleSmall','sparkleMedium','sparkle','sparkleMedium','sparkleSmall']);
  assert.ok(frames.every(f => f.x === frames[0].x && f.y === frames[0].y), 'twinkle stays in one place');
  assert.equal(randomCalls, 2);
  const next = glimmer.sample(.5, random);
  assert.equal(randomCalls, 4); assert.notEqual(next.x, frames[0].x, 'jump only between half-second pulses');
  assert.ok(next.x >= 0 && next.x < 40 && next.y >= 0 && next.y < 40);
  return 'Glimmer: official small/medium/large frames, stationary pulses and half-second random repositioning passed.';
}
