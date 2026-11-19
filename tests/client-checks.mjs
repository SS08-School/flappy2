import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Game, METRICS, PHYSICS, viewportLayout } from '../public/engine.mjs';

export async function createClient({ reducedMotion = true, width = 480, height = 640 } = {}) {
  const elements = new Map(), frames = [], stored = new Map(), images = [], events = new Map();
  let rect = { width, height }, now = 0, document;
  function makeContext() {
    let matrix = [1,0,0,1,0,0]; const stack = [], commands = [];
    return {
      globalAlpha: 1, fillStyle: '#000', commands,
      clearRect() { commands.length = 0; },
      drawImage(image, ...args) { commands.push({ kind:'image', args, matrix:[...matrix], alpha:this.globalAlpha }); },
      fillRect(...args) { commands.push({ kind:'fill', args, color:this.fillStyle, matrix:[...matrix], alpha:this.globalAlpha }); },
      save() { stack.push({ matrix:[...matrix], alpha:this.globalAlpha, fill:this.fillStyle }); },
      restore() { const state = stack.pop(); matrix = state.matrix; this.globalAlpha = state.alpha; this.fillStyle = state.fill; },
      translate(x,y) { matrix[4] += matrix[0]*x + matrix[2]*y; matrix[5] += matrix[1]*x + matrix[3]*y; },
      rotate(angle) { const [a,b,c,d,e,f]=matrix, co=Math.cos(angle),si=Math.sin(angle); matrix=[a*co+c*si,b*co+d*si,c*co-a*si,d*co-b*si,e,f]; },
      setTransform(...value) { matrix=value; commands.length=0; },
      fillText() { throw new Error('Only official sprite text is allowed'); },
    };
  }
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const [,tag,attrs] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    if (!id && !attrs.includes('data-')) continue;
    const element = {
      tagName:tag.toUpperCase(), hidden:/(?:^|\s)hidden(?:\s|$)/.test(attrs), events:{}, dataset:{},
      style:{ setProperty(key,value) { this[key]=value; } },
      addEventListener(type,fn) { this.events[type]=fn; },
      getContext() { return this.context ||= makeContext(); }, getBoundingClientRect:()=>rect,
      focus() { document.activeElement=this; }, setAttribute() {},
    };
    for (const [,key,value] of attrs.matchAll(/data-([\w-]+)="([^"]+)"/g)) element.dataset[key]=value;
    elements.set(id || `anonymous-${elements.size}`,element);
  }
  document = {
    activeElement:elements.get('game'), getElementById:id=>elements.get(id)||null,
    addEventListener(type,fn) { events.set(type,fn); },
    querySelectorAll:()=>[...elements.values()].filter(e=>e.dataset.sprite),
  };
  const sandbox = {
    document, devicePixelRatio:1, Game, METRICS, PHYSICS, viewportLayout, console, performance:{now:()=>0},
    matchMedia:()=>({matches:reducedMotion}), ResizeObserver:class { observe() {} },
    requestAnimationFrame:callback=>frames.push(callback),
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
    Image:class { set src(value) { images.push(value); queueMicrotask(()=>this.onload()); } },
    fetch() { throw new Error('No account or leaderboard APIs may be called'); },
  };
  const assets=(await readFile(new URL('../public/assets.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
  const transitions=(await readFile(new URL('../public/transitions.mjs',import.meta.url),'utf8')).replace(/^export /gm,'').replace(/\bclamp\b/g,'transitionClamp');
  const presentation=(await readFile(new URL('../public/bird-presentation.mjs',import.meta.url),'utf8')).replace(/^export /gm,'').replace(/\bclamp\b/g,'birdClamp');
  const client=(await readFile(new URL('../public/game.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
  const controller=await new vm.Script(`(async()=>{${assets}\n${transitions}\nconst TIMING=TRANSITION_TIMING;\n${presentation}\n${client}\nreturn {game,prepareRun,flap,resize,screen:()=>screen};})()`).runInNewContext(sandbox);
  await Promise.resolve();
  return {controller,elements,events,stored,images,
    tick(seconds) { now+=seconds*1000; frames.shift()(now); },
    resize(w,h) { rect={width:w,height:h}; controller.resize(); },
  };
}

export async function checkClient({ reducedMotion = true } = {}) {
  const c=await createClient({reducedMotion}), {controller,elements,events,stored,images}=c;
  assert.equal(images.join(','),'/assets/flappy/official-v1.3.png');
  assert.equal(controller.screen(),'home'); assert.equal(elements.get('rate-button').hidden,false);
  if (!reducedMotion) c.tick(.36);
  controller.prepareRun();
  if (!reducedMotion) { c.tick(.2); assert.equal(controller.screen(),'home'); controller.prepareRun(); c.tick(.7); }
  assert.equal(controller.screen(),'ready'); assert.equal(controller.game.state,'ready');
  let prevented=false;
  const barTarget={closest:()=>null};
  events.get('pointerdown')({button:0,isPrimary:true,target:barTarget,preventDefault(){prevented=true;}});
  assert.ok(prevented); assert.equal(controller.game.state,'playing','black-bar click starts flight');
  c.tick(.05); controller.game.score=4;
  const before=controller.game.bird.vy;
  events.get('pointerdown')({button:0,isPrimary:true,target:barTarget,preventDefault(){}});
  assert.ok(controller.game.bird.vy<before,'black-bar click flaps once');
  events.get('keydown')({code:'Escape',target:barTarget,preventDefault(){throw new Error('Escape must be ignored');}});
  assert.equal(controller.game.state,'playing'); assert.equal(controller.game.score,4,'Escape never resets progress');
  c.resize(390,520); assert.equal(controller.game.width,288); assert.equal(controller.game.height,384);
  controller.game.score=12; controller.game.hit();
  for(let i=0;i<120&&controller.game.state!=='over';i++)c.tick(1/60);
  assert.equal(controller.screen(),'over'); assert.equal(stored.get('flappy-best'),'12');
  if (!reducedMotion) { assert.equal(elements.get('play-controls').hidden,true); c.tick(3); }
  assert.equal(elements.get('play-controls').hidden,false);
  controller.prepareRun(); if(!reducedMotion)c.tick(.9);
  assert.equal(controller.screen(),'ready');
  assert.equal(elements.get('menu-overlay'),undefined); assert.equal(elements.get('save-status'),undefined);
  return `Reference client (${reducedMotion?'reduced':'full'} motion): black-bar input, Escape safety, scenes, results, sprite-only UI and silent BEST passed.`;
}
