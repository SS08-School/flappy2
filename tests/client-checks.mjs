import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Game, METRICS, PHYSICS, viewportLayout } from '../public/engine.mjs';

export async function createClient({ reducedMotion = true, width = 480, height = 640, audio = { unlock() {}, stop() {}, play() {} } } = {}) {
  const elements = new Map(), frames = [], stored = new Map(), images = [], events = new Map();
  let rect = { width, height }, now = 0, document;
  function makeContext() {
    let matrix = [1,0,0,1,0,0]; const stack = [], commands = [];
    return {
      globalAlpha: 1, fillStyle: '#000', commands, renderCount: 0,
      clearRect() { commands.length = 0; },
      drawImage(image, ...args) { commands.push({ kind:'image', args, matrix:[...matrix], alpha:this.globalAlpha }); },
      fillRect(...args) { commands.push({ kind:'fill', args, color:this.fillStyle, matrix:[...matrix], alpha:this.globalAlpha }); },
      save() { stack.push({ matrix:[...matrix], alpha:this.globalAlpha, fill:this.fillStyle }); },
      restore() { const state = stack.pop(); matrix = state.matrix; this.globalAlpha = state.alpha; this.fillStyle = state.fill; },
      translate(x,y) { matrix[4] += matrix[0]*x + matrix[2]*y; matrix[5] += matrix[1]*x + matrix[3]*y; },
      rotate(angle) { const [a,b,c,d,e,f]=matrix, co=Math.cos(angle),si=Math.sin(angle); matrix=[a*co+c*si,b*co+d*si,c*co-a*si,d*co-b*si,e,f]; },
      setTransform(...value) { matrix=value; commands.length=0; this.renderCount++; },
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
    GameAudio: class { constructor() { return audio; } }, DEATH_SOUND_DELAY: .2,
    matchMedia:()=>({matches:reducedMotion}), ResizeObserver:class { observe() {} },
    requestAnimationFrame:callback=>frames.push(callback),
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
    Image:class { set src(value) { images.push(value); queueMicrotask(()=>this.onload()); } },
    fetch() { throw new Error('No account or leaderboard APIs may be called'); },
  };
  const assets=(await readFile(new URL('../public/assets.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
  const transitions=(await readFile(new URL('../public/transitions.mjs',import.meta.url),'utf8')).replace(/^export /gm,'').replace(/\bclamp\b/g,'transitionClamp');
  const presentation=(await readFile(new URL('../public/bird-presentation.mjs',import.meta.url),'utf8')).replace(/^export /gm,'').replace(/\bclamp\b/g,'birdClamp');
  const medal=(await readFile(new URL('../public/medal-presentation.mjs',import.meta.url),'utf8')).replace(/^export /gm,'');
  const client=(await readFile(new URL('../public/game.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
  const controller=await new vm.Script(`(async()=>{${assets}\n${transitions}\nconst TIMING=TRANSITION_TIMING;\n${presentation}\n${medal}\n${client}\nreturn {game,prepareRun,flap,resize,screen:()=>screen};})()`).runInNewContext(sandbox);
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

export async function checkGroundLoop() {
  for (const [width, height] of [[390,520],[480,640],[517,689.3333333333]]) {
    const c = await createClient({ width, height });
    for (let frame=1;frame<=350;frame++) {
      c.tick(1/60);
      const tiles = c.elements.get('game').context.commands.filter(command => command.kind === 'image' && command.args[0] === 584 && command.args[1] === 0 && command.args[2] === 336 && command.args[3] === 112);
      assert.equal(tiles.length, 1, 'one continuous ground draw across portrait viewport, including wraps');
      const [,,,,left,,tileWidth] = tiles[0].args;
      assert.ok(left <= 0 && left + tileWidth >= c.controller.game.width, 'ground covers both viewport edges');
      const phase = (left + frame * 2) / 24;
      assert.ok(Math.abs(phase - Math.round(phase)) < 1e-7, 'stripe phase stays continuous through every wrap');
    }
  }
  const wide = await createClient({ width:1920, height:1080 }); wide.tick(.1);
  const tiles = wide.elements.get('game').context.commands.filter(command => command.kind === 'image' && command.args[0] === 584 && command.args[2] === 336);
  for (let i=1;i<tiles.length;i++) {
    assert.ok(tiles[i-1].args[4] + tiles[i-1].args[6] - tiles[i].args[4] >= 24, 'wider views overlap matching stripes instead of exposing tile edges');
    assert.equal((tiles[i].args[4] - tiles[i-1].args[4]) % 24, 0);
  }
  return 'Ground: repeated wraps at fractional portrait scales and matching overlapped widescreen tiles passed.';
}

export async function checkRefreshRates() {
  const baseline = new Game(); baseline.start(); baseline.update(.1); baseline.update(.1);
  for (const hz of [30,60,120,144,165,240,360,480,1000]) {
    const c = await createClient();
    for (let i=0;i<hz;i++) c.tick(1/hz);
    const context = c.elements.get('game').context;
    assert.equal(context.renderCount, Math.min(hz,240), `${hz} Hz obeys the 240 FPS render cap without throttling lower refresh rates`);
    c.controller.prepareRun(); c.controller.flap();
    let remaining = .2;
    while (remaining > 1e-10) { const dt=Math.min(remaining,1/hz); c.tick(dt); remaining-=dt; }
    assert.ok(Math.abs(c.controller.game.bird.y-baseline.bird.y)<1e-8, `${hz} Hz has the same flap trajectory`);
    assert.equal(c.controller.game.distance, baseline.distance, `${hz} Hz has the same pipe speed`);
    assert.equal(c.controller.game.score, 0);
  }
  const smooth = await createClient(); smooth.controller.prepareRun(); smooth.controller.flap();
  smooth.controller.game.pipes = [{ x:220, center:188, gap:200, width:52, scored:false }];
  const ys=[], xs=[];
  for (let i=0;i<16;i++) {
    smooth.tick(1/240);
    const commands=smooth.elements.get('game').context.commands;
    const bird=commands.find(command=>command.kind==='image' && command.args[1]===982 && command.args[2]===34);
    const pipe=commands.find(command=>command.kind==='image' && command.args[0]===112);
    ys.push(bird.matrix[5]); xs.push(pipe.args[4]);
  }
  assert.ok(new Set(ys.map(y=>y.toFixed(5))).size>=12, 'bird moves between 60 Hz physics steps');
  assert.ok(new Set(xs.map(x=>x.toFixed(5))).size>=12, 'pipes move between 60 Hz physics steps');
  const game=smooth.controller.game, before={ y:game.bird.y, distance:game.distance, score:game.score };
  for(let i=0;i<10;i++)game.presentation();
  assert.deepEqual({ y:game.bird.y, distance:game.distance, score:game.score },before,'interpolation never changes gameplay state');
  return 'Refresh rates: 30–1000 Hz callbacks cap at 240 FPS, preserve speed/trajectory, and interpolate bird/pipes between physics steps.';
}

export async function checkInputLatency() {
  for (const hz of [60,120,144,165,240]) {
    for (const input of ['keyboard','pointer']) {
      const c=await createClient(); c.controller.prepareRun();
      const target={closest:()=>null}, event={target,preventDefault(){}};
      const press=()=> input==='keyboard'
        ? c.events.get('keydown')({...event,code:'Space',repeat:false})
        : c.events.get('pointerdown')({...event,button:0,isPrimary:true});
      press();
      const game=c.controller.game, startY=game.bird.y;
      assert.equal(game.bird.vy,PHYSICS.flap,'input sets the flap impulse synchronously');
      c.tick(1/hz);
      const bird=c.elements.get('game').context.commands.find(command=>command.kind==='image'&&command.args[1]===982&&command.args[2]===34);
      const birdY=bird.matrix[5]/Math.hypot(bird.matrix[0],bird.matrix[1]);
      assert.ok(birdY<startY,`${hz} Hz ${input}: bird rises on the very next displayed frame`);
      if(hz>60) assert.equal(game.bird.y,startY,'substep drawing does not advance physics early');
      // A second flap while descending must also be visible before another physics tick.
      game.bird.y=200; game.bird.vy=200; game.accumulator=0;
      press(); c.tick(1/hz);
      const next=c.elements.get('game').context.commands.find(command=>command.kind==='image'&&command.args[1]===982&&command.args[2]===34);
      const nextY=next.matrix[5]/Math.hypot(next.matrix[0],next.matrix[1]);
      assert.ok(nextY<200,`${hz} Hz ${input}: repeated flap has no historical downward frame`);
      const state={y:game.bird.y,vy:game.bird.vy,score:game.score,distance:game.distance};
      for(let i=0;i<10;i++)game.presentation();
      assert.deepEqual({y:game.bird.y,vy:game.bird.vy,score:game.score,distance:game.distance},state);
    }
  }
  return 'Input latency: keyboard and pointer flaps rise on the next frame at 60–240 Hz, without advancing physics or replaying old motion.';
}

export async function checkResponsiveClient() {
  for (const [displayWidth,displayHeight] of [[1920,1200],[1920,1080],[3440,1440],[1024,768],[390,844],[844,390]]) {
    const width=Math.min(displayWidth,displayHeight*16/10), height=displayHeight;
    const c=await createClient({width,height}), game=c.controller.game;
    c.tick(.02);
    const context=c.elements.get('game').context;
    const centered=sprite=>{
      const command=context.commands.find(command=>command.kind==='image'&&command.args[0]===sprite[0]&&command.args[1]===sprite[1]);
      assert.ok(command,`sprite is rendered at ${displayWidth}×${displayHeight}`);
      const center=(command.args[4]+command.args[6]/2)*command.matrix[0]+command.matrix[4];
      assert.ok(Math.abs(center-width/2)<=width/game.width/2+1e-7, 'official UI remains horizontally centered within native pixel rounding');
    };
    centered([702,182]);
    assert.ok(Math.abs(game.width/game.height-width/height)<1e-9,'game world follows the fitted frame aspect ratio');
    assert.ok(Math.abs(parseFloat(c.elements.get('game-ui').style['--rate-x'])+37-game.width/2)<1e-7);
    assert.equal(parseFloat(c.elements.get('game-ui').style['--buttons-y']),game.ground-60);
    c.controller.prepareRun(); c.tick(.02); centered([584,116]);
    c.controller.flap(); game.score=33; game.hit(); game.end(); c.tick(.02); centered([0,516]);
    assert.equal(c.elements.get('play-controls').hidden,false,'replay remains available on each display shape');
  }
  const c=await createClient({width:390,height:844});c.controller.prepareRun();c.controller.flap();
  const game=c.controller.game;game.score=8;
  game.pipes=[{x:game.bird.x+100,center:game.ground/2,gap:100,width:52,scored:false}];
  c.resize(1920,1200);
  assert.equal(game.state,'playing');assert.equal(game.score,8);
  assert.ok(Math.abs(game.pipes[0].x-game.bird.x-100)<1e-9,'resize preserves obstacle distance without resetting the run');
  return 'Responsive layout: phone/tablet/16:10/capped wide frames keep sprites and screens centered; live resize preserves the run.';
}
