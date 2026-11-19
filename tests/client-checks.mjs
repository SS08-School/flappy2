import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Game, SKINS, viewportLayout } from '../public/engine.mjs';

// Execute the real client controller with minimal DOM/audio/canvas test doubles.
// This exercises state transitions without requiring an installed browser.
export async function checkClient() {
  const elements = new Map(), frames = [], stored = new Map();
  let rect = { width: 1280, height: 720 };
  const context = { clearRect() {}, drawImage() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, setTransform() {} };
  let document;
  class Element {
    constructor(tag, id, attributes = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.attributes = attributes;
      this.hidden = /\bhidden\b/.test(attributes); this.style = { setProperty() {} };
      this.offsetWidth = id === 'menu-panel' ? 264 : 100; this.offsetHeight = id === 'menu-panel' ? 390 : 32;
      this.dataset = {}; this.events = {}; this.isConnected = true;
      for (const [, key, value] of attributes.matchAll(/data-([\w-]+)="([^"]+)"/g)) this.dataset[key] = value;
      this.classList = { toggle() {} };
    }
    set innerHTML(value) { this.html = value; register(value); }
    get innerHTML() { return this.html || ''; }
    addEventListener(type, fn) { this.events[type] = fn; }
    getContext() { return context; }
    getBoundingClientRect() { return rect; }
    focus() { document.activeElement = this; }
    closest(selector) { return selector === 'button,a' && this.tagName === 'BUTTON' ? this : null; }
    querySelector(selector) { return selector === 'canvas' ? this.background ||= new Element('canvas') : null; }
    querySelectorAll() { return []; }
    insertAdjacentHTML(_, html) { register(html); }
  }
  function register(html) {
    for (const [, tag, attributes] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
      const id = attributes.match(/\bid="([^"]+)"/)?.[1];
      if (id || attributes.includes('data-')) elements.set(id || `anonymous-${elements.size}`, new Element(tag, id, attributes));
    }
  }
  register(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  document = {
    activeElement: elements.get('game'), hidden: false,
    getElementById(id) { return elements.get(id) || null; },
    addEventListener() {},
    querySelectorAll(selector) {
      const data = selector.match(/^\[data-(.+)\]$/)?.[1];
      return [...elements.values()].filter(e => data ? e.dataset[data] : selector === '.pixel-button' && /class="[^"]*pixel-button/.test(e.attributes));
    },
  };
  const sandbox = {
    document, window: { addEventListener() {} }, devicePixelRatio: 1,
    Game, SKINS, viewportLayout, AbortSignal, setTimeout, clearTimeout,
    FormData: class { get() { return ''; } },
    matchMedia: () => ({ matches: true }),
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: callback => frames.push(callback),
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    Image: class { set src(value) { this.url = value; queueMicrotask(() => this.onload()); } },
    Audio: class { play() { return Promise.resolve(); } pause() {} },
    fetch: async () => ({ ok: true, json: async () => ({ user: null, entries: [] }) }),
  };
  const assets = (await readFile(new URL('../public/assets.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const client = (await readFile(new URL('../public/game.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
  const controller = await new vm.Script(`(async () => { ${assets}\n${client}\nreturn { game, prepareRun, flap, openMenu, closeMenu, resize, screen: () => screen }; })()`).runInNewContext(sandbox);
  await Promise.resolve();
  assert.equal(elements.get('loading-status').hidden, true, 'official atlas initializes');
  assert.equal(controller.screen(), 'home');
  assert.equal(elements.get('home-buttons').hidden, false);
  controller.prepareRun(); assert.equal(controller.screen(), 'ready');
  assert.equal(controller.game.state, 'ready', 'Get Ready waits for the first flap');
  controller.flap(); assert.equal(controller.game.state, 'playing');
  frames.shift()(16);
  controller.openMenu('menu'); assert.equal(controller.game.state, 'paused');
  const y = controller.game.bird.y; frames.shift()(32); assert.equal(controller.game.bird.y, y, 'menu freezes the flight');
  controller.closeMenu(); assert.equal(controller.game.state, 'playing');
  rect = { width: 390, height: 844 }; controller.resize();
  assert.equal(controller.game.state, 'paused', 'rotation or resize pauses automatically');
  assert.ok(Math.abs(controller.game.width - 288) < .001);
  assert.equal(controller.game.health, 2);
  controller.closeMenu(); assert.equal(controller.game.state, 'playing');
  controller.game.end(); assert.equal(controller.screen(), 'over');
  assert.equal(elements.get('over-buttons').hidden, false);
  assert.equal(elements.get('health').hidden, true);
  assert.equal(JSON.parse(stored.get('flabby-guest')).flights, 1, 'guest progress survives the new UI');
  controller.openMenu('birds');
  assert.ok(elements.get('menu-content').innerHTML.includes('Yellow bird'));
  assert.ok(!elements.get('menu-content').innerHTML.includes('Mint'));
  return 'Client: title, Get Ready, play, menu pause/resume, viewport resize, results, guest saving, and official birds passed.';
}
