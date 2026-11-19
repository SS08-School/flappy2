import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Game, viewportLayout } from '../public/engine.mjs';

export async function checkClient({ reducedMotion = true } = {}) {
  const elements = new Map(), frames = [], stored = new Map(), images = [];
  let rect = { width: 1280, height: 720 }, document;
  const alphaStack = [];
  const context = { globalAlpha: 1, clearRect() {}, drawImage() {}, fillRect() {}, save() { alphaStack.push(this.globalAlpha); }, restore() { this.globalAlpha = alphaStack.pop(); }, translate() {}, rotate() {}, setTransform() {}, fillText() { throw new Error('Added text is not allowed'); } };
  let now = 0;
  const tick = seconds => { now += seconds * 1000; frames.shift()(now); };
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const [,tag,attrs] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    if (!id && !attrs.includes('data-')) continue;
    const element = {
      tagName: tag.toUpperCase(), hidden: /(?:^|\s)hidden(?:\s|$)/.test(attrs), events: {}, dataset: {}, style: { setProperty() {} },
      addEventListener(type, fn) { this.events[type] = fn; },
      getContext: () => context, getBoundingClientRect: () => rect,
      focus() { document.activeElement = this; }, setAttribute() {},
    };
    for (const [,key,value] of attrs.matchAll(/data-([\w-]+)="([^"]+)"/g)) element.dataset[key] = value;
    elements.set(id || `anonymous-${elements.size}`, element);
  }
  document = {
    activeElement: elements.get('game'), getElementById: id => elements.get(id) || null, addEventListener() {},
    querySelectorAll: () => [...elements.values()].filter(e => e.dataset.sprite),
  };
  const sandbox = {
    document, devicePixelRatio: 1, Game, viewportLayout, console, performance: { now: () => 0 },
    matchMedia: () => ({ matches: reducedMotion }), ResizeObserver: class { observe() {} },
    requestAnimationFrame: callback => frames.push(callback),
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key,value) => stored.set(key,value) },
    Image: class { set src(value) { images.push(value); queueMicrotask(() => this.onload()); } },
    fetch() { throw new Error('Game must not call account or leaderboard APIs'); },
  };
  const assets = (await readFile(new URL('../public/assets.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const transitions = (await readFile(new URL('../public/transitions.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '').replace(/\bclamp\b/g, 'transitionClamp');
  const birdPresentation = (await readFile(new URL('../public/bird-presentation.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '').replace(/\bclamp\b/g, 'birdClamp');
  const client = (await readFile(new URL('../public/game.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
  const controller = await new vm.Script(`(async () => { ${assets}\n${transitions}\n${birdPresentation}\n${client}\nreturn { game, prepareRun, flap, resize, screen: () => screen }; })()`).runInNewContext(sandbox);
  await Promise.resolve();
  assert.deepEqual(images, ['/assets/flappy/official-v1.3.png']);
  assert.equal(controller.screen(), 'home'); assert.equal(elements.get('play-controls').hidden, false);
  controller.prepareRun();
  if (!reducedMotion) {
    assert.equal(controller.screen(), 'home', 'title fades before changing screens');
    controller.prepareRun(); tick(.25); assert.equal(controller.screen(), 'home');
    tick(.26);
  }
  assert.equal(controller.screen(), 'ready'); controller.flap(); assert.equal(controller.game.state, 'playing');
  tick(.016); controller.game.hit();
  elements.get('menu-button').events.click();
  assert.equal(controller.screen(), 'home', 'Menu immediately returns to title even during death fall');
  assert.equal(controller.game.pipes.length, 0); assert.equal(controller.game.score, 0);
  controller.prepareRun(); if (!reducedMotion) tick(.51); controller.flap(); rect = { width: 390, height: 844 }; controller.resize();
  assert.equal(controller.game.state, 'playing'); assert.ok(Math.abs(controller.game.width - 288) < .001);
  controller.game.score = 12; controller.game.hit();
  for (let i = 0; i < 120 && controller.game.state !== 'over'; i++) tick(.016);
  assert.equal(controller.screen(), 'over'); assert.equal(elements.get('play-controls').hidden, false);
  assert.equal(stored.get('flappy-best'), '12', 'BEST persists silently');
  assert.equal(elements.get('menu-overlay'), undefined); assert.equal(elements.get('save-status'), undefined); assert.equal(elements.get('health'), undefined);
  if (!reducedMotion) {
    assert.equal(elements.get('play-button').disabled, true, 'replay waits for its reveal');
    tick(1.2); assert.equal(elements.get('play-button').disabled, false);
    controller.prepareRun(); tick(.5); assert.equal(controller.screen(), 'over', 'scorecard animates out before replay');
  }
  elements.get('menu-button').events.click(); assert.equal(controller.screen(), 'home');
  if (!reducedMotion) { tick(2); assert.equal(controller.screen(), 'home', 'Menu cancels a pending replay transition'); }
  return `Client (${reducedMotion ? 'reduced' : 'full'} motion): screen flow, transition cancellation, Menu-to-title, BEST, resize, and uploaded-assets-only rendering passed.`;
}
