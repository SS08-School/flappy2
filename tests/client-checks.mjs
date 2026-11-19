import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Game, viewportLayout } from '../public/engine.mjs';

export async function checkClient() {
  const elements = new Map(), frames = [], stored = new Map(), images = [];
  let rect = { width: 1280, height: 720 }, document;
  const context = { clearRect() {}, drawImage() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, setTransform() {}, fillText() { throw new Error('Added text is not allowed'); } };
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
    document, devicePixelRatio: 1, Game, viewportLayout, console,
    matchMedia: () => ({ matches: true }), ResizeObserver: class { observe() {} },
    requestAnimationFrame: callback => frames.push(callback),
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key,value) => stored.set(key,value) },
    Image: class { set src(value) { images.push(value); queueMicrotask(() => this.onload()); } },
    fetch() { throw new Error('Game must not call account or leaderboard APIs'); },
  };
  const assets = (await readFile(new URL('../public/assets.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const client = (await readFile(new URL('../public/game.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
  const controller = await new vm.Script(`(async () => { ${assets}\n${client}\nreturn { game, prepareRun, flap, resize, screen: () => screen }; })()`).runInNewContext(sandbox);
  await Promise.resolve();
  assert.deepEqual(images, ['/assets/flappy/official-v1.3.png']);
  assert.equal(controller.screen(), 'home'); assert.equal(elements.get('play-controls').hidden, false);
  controller.prepareRun(); assert.equal(controller.screen(), 'ready'); controller.flap(); assert.equal(controller.game.state, 'playing');
  frames.shift()(16); controller.game.hit();
  elements.get('menu-button').events.click();
  assert.equal(controller.screen(), 'home', 'Menu immediately returns to title even during death fall');
  assert.equal(controller.game.pipes.length, 0); assert.equal(controller.game.score, 0);
  controller.prepareRun(); controller.flap(); rect = { width: 390, height: 844 }; controller.resize();
  assert.equal(controller.game.state, 'playing'); assert.ok(Math.abs(controller.game.width - 288) < .001);
  controller.game.score = 12; controller.game.hit();
  for (let i = 0; i < 120 && controller.game.state !== 'over'; i++) frames.shift()(32 + i * 16);
  assert.equal(controller.screen(), 'over'); assert.equal(elements.get('play-controls').hidden, false);
  assert.equal(stored.get('flappy-best'), '12', 'BEST persists silently');
  assert.equal(elements.get('menu-overlay'), undefined); assert.equal(elements.get('save-status'), undefined); assert.equal(elements.get('health'), undefined);
  elements.get('menu-button').events.click(); assert.equal(controller.screen(), 'home');
  return 'Client: original title/ready/play/results flow, Menu-to-title, silent BEST, resize, and uploaded-assets-only rendering passed.';
}
