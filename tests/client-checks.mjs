import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Game, METRICS, PHYSICS, viewportLayout } from '../public/engine.mjs';
import { LEVEL3_TEST_SCORE, createLevel3Chunk, pipePose, pipeShaftLength, pipeBounds, level3PipeHits } from '../public/difficulty.mjs';
import { createChunkPrefetch } from '../public/chunk-prefetch.mjs';

export async function createClient({ reducedMotion = true, width = 480, height = 640, dpr = 1, random = () => 0, coarsePointer = false, fullscreenRequest, audio = { unlock() {}, stop() {}, play() {} } } = {}) {
  const elements = new Map(), frames = [], stored = new Map(), images = [], events = new Map(), windowEvents=new Map();
  let rect = { width, height }, now = 0, document, focused = true;
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
      scale(x,y) { matrix[0]*=x;matrix[1]*=x;matrix[2]*=y;matrix[3]*=y; },
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
      getContext(type,options) { this.contextOptions ||= options; return this.context ||= makeContext(); }, getBoundingClientRect:()=>rect,
      focus() { document.activeElement=this; }, setAttribute() {},
    };
    for (const [,key,value] of attrs.matchAll(/data-([\w-]+)="([^"]+)"/g)) element.dataset[key]=value;
    elements.set(id || `anonymous-${elements.size}`,element);
  }
  document = {
    documentElement:{requestFullscreen:fullscreenRequest},
    hasFocus:()=>focused,
    activeElement:elements.get('game'), getElementById:id=>elements.get(id)||null,
    addEventListener(type,fn) { events.set(type,fn); },
    querySelectorAll:()=>[...elements.values()].filter(e=>e.dataset.sprite),
  };
  const visualMath = Object.create(Math); visualMath.random = random;
  const sandbox = {
    document, window:{addEventListener(type,fn){windowEvents.set(type,fn);}}, Math:visualMath, devicePixelRatio:dpr, Game, METRICS, PHYSICS, viewportLayout, pipePose, pipeShaftLength, pipeBounds, createChunkPrefetch, console, performance:{now:()=>now},
    GameAudio: class { constructor() { return audio; } }, DEATH_SOUND_DELAY: .2,
    matchMedia:query=>({matches:query.includes('coarse')?coarsePointer:reducedMotion}), ResizeObserver:class { observe() {} },
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
    tick(seconds,frameLag=0) { now+=seconds*1000; frames.shift()(now-frameLag*1000); },
    elapse(seconds) { now+=seconds*1000; },
    visibility(hidden) { document.hidden=hidden; events.get('visibilitychange')(); },
    focus(value) { focused=value;windowEvents.get(value?'focus':'blur')(); },
    resize(w,h) { rect={width:w,height:h}; controller.resize(); },
    fullscreen(w,h,nextDpr=dpr) {
      focused=true;rect={width:w,height:h};sandbox.devicePixelRatio=nextDpr;
      events.get('fullscreenchange')();
    },
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

export async function checkBirdAnimation() {
  const c=await createClient({reducedMotion:false});c.tick(.36);
  c.controller.prepareRun();c.tick(.7);
  assert.equal(c.controller.screen(),'ready');
  const game=c.controller.game;
  const bird=()=>c.elements.get('game').context.commands.find(c=>c.kind==='image'&&c.args[1]===982&&c.args[2]===34);
  const sample=playing=>{
    const starts=[],ys=[];let previous;
    for(let frame=0;frame<180;frame++){
      // Isolate wing timing from gravity and collision for a long clean sample.
      if(playing){game.bird.y=188;game.bird.vy=0;}
      c.tick(1/120);const pose=bird(),sx=pose.args[0];
      if(sx===6&&previous!==6)starts.push(frame/120);
      previous=sx;ys.push(pose.matrix[5]/Math.hypot(pose.matrix[0],pose.matrix[1]));
    }
    return {starts,ys};
  };
  const idle=sample(false);
  for(let i=1;i<idle.starts.length;i++)assert.ok(Math.abs(idle.starts[i]-idle.starts[i-1]-14/30)<1/120+1e-8,'idle cycles match 14 recorded frames');
  assert.ok(Math.abs(Math.max(...idle.ys)-Math.min(...idle.ys)-8)<.02,'idle bob travels eight native pixels peak to peak');
  for(let i=0;i<90;i++)assert.ok(Math.abs(idle.ys[i]-idle.ys[i+90])<1e-8,'bobbing repeats every 0.75 seconds');
  c.controller.flap();c.tick(1/240);assert.equal(bird().args[0],6,'first flap begins with the official raised wing');
  const flying=sample(true);
  assert.ok(flying.starts.length>=7);
  for(let i=1;i<flying.starts.length;i++)assert.ok(Math.abs(flying.starts[i]-flying.starts[i-1]-.2)<1/120+1e-8,'active cycles match six recorded frames');
  c.elapse(.071);c.controller.flap();c.tick(1/240);
  assert.equal(bird().args[0],6,'another tap restarts the raised-wing pose');
  game.bird.vy=300;game.bird.y=188;c.tick(1/240);
  assert.equal(bird().args[0],62,'a steep descent settles on the official middle wing');
  assert.ok(c.images.every(path=>path==='/assets/flappy/official-v1.3.png'));
  return 'Bird animation: 0.467 s idle / 0.2 s active cycles, flap resets, middle-wing dive pose and 0.75 s eight-pixel bob use only the uploaded atlas.';
}

export async function checkPipeAnchoring() {
  for(const [width,height] of [[1920,1200],[1280,800],[1024,768],[390,844],[391,845]]){
    const c=await createClient({width,height});c.controller.prepareRun();c.controller.flap();
    const game=c.controller.game;game.state='ready';
    for(const offset of [-80.75,-.49,-.25,0,.25,.49,79.51]){
      const center=game.ground/2+offset,cap=center+50;
      game.pipes=[{x:100,center,gap:100,width:52,scored:false,level:1}];c.tick(.02);
      const images=c.elements.get('game').context.commands.filter(c=>c.kind==='image');
      const lower=images.filter(c=>c.args[0]===168&&c.args[1]>=646&&c.args[1]<966&&c.args[2]===52);
      const head=lower.find(c=>c.args[1]===646);
      assert.ok(Math.abs(head.args[5]-cap)<1e-8,'fractional cap position matches the collision opening');
      const spans=lower.map(c=>[c.args[5],c.args[5]+c.args[7]]).sort((a,b)=>a[0]-b[0]);
      let end=cap;
      for(const [start,bottom] of spans){assert.ok(start<=end+1e-8,'pipe shaft has no internal split');end=Math.max(end,bottom);}
      assert.ok(end>=game.ground+1-1e-8,'pipe base extends beneath the foreground instead of floating');
      const upper=images.filter(c=>c.args[0]===112&&c.args[1]>=646&&c.args[1]<966&&c.args[2]===52);
      assert.ok(Math.abs(Math.max(...upper.map(c=>c.args[5]+c.args[7]))-(center-50))<1e-8,'upper cap stays on its exact opening boundary');
    }
  }
  return 'Pipe bases: fractional cap heights stay aligned, shafts remain continuous, and bases overlap the ground at phone/tablet/desktop scales.';
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

export async function checkPipeSampling() {
  for(const [width,height,dpr] of [[480,640,1],[1652,1033,1],[1440,900,1.25],[390,844,3]]){
    for(const kind of ['classic','stationary-diagonal-tunnel','diagonal-rise']){
      const c=await createClient({width,height,dpr,random:()=>.5});c.controller.prepareRun();c.controller.flap();
      const game=c.controller.game;game.state='ready';
      game.pipes=kind==='classic'?[{x:220,center:168,gap:100,width:52,level:1}]
        :createLevel3Chunk({x:0,ground:game.ground,kind,entryCenter:game.ground/2,referenceBirdX:game.bird.x,random:()=>.5}).pipes;
      let first,previous;const positions=new Set();
      for(let frame=0;frame<24;frame++){
        for(const pipe of game.pipes){pipe.x-=118/240;if(pipe.level===3)pipe.referenceBirdX=pipe.x-pipe.chunkOffset+26+(1.2+frame/240)*118;}
        c.tick(1/240);
        const commands=c.elements.get('game').context.commands;
        const cap=commands.find(q=>q.kind==='image'&&q.args[0]===(kind==='diagonal-rise'?168:112)&&(q.args[3]===26||kind==='classic'));
        assert.ok(cap,'test pipe is actually rendered');
        const m=cap.matrix,[,,,,x,y]=cap.args;
        const origin=[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
        if(first){
          assert.deepEqual(m.slice(0,4),first.linear,'a scrolling pipe keeps the same scale and angle');
          for(let axis=0;axis<2;axis++){
            const displacement=origin[axis]-first.origin[axis];
            assert.ok(Math.abs(displacement-Math.round(displacement))<1e-7,'pipe pixels translate rigidly instead of changing nearest-neighbor sampling phase');
          }
          assert.ok(origin[0]<=previous[0]+1e-7,'rendered pipe never jitters backward');
        }else first={origin,linear:m.slice(0,4)};
        previous=origin;positions.add(origin[0].toFixed(6));
      }
      assert.ok(positions.size>=10,'device-pixel alignment preserves motion between high-refresh frames');
    }
  }
  return 'Pipe sampling: upright, diagonal and moving posts retain a stable pixel pattern at fractional scales and device-pixel ratios.';
}

export async function checkInputLatency() {
  for (const hz of [60,120,144,165,240]) {
    for (const input of ['keyboard','pointer','w']) {
      const c=await createClient(); c.controller.prepareRun();
      const target={closest:()=>null}, event={target,preventDefault(){}};
      const press=()=> input!=='pointer'
        ? c.events.get('keydown')({...event,code:input==='w'?'KeyW':'Space',repeat:false})
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
  const mixed=await createClient();
  let menuPrevented=false;
  mixed.events.get('pointerdown')({button:0,target:{closest:()=>mixed.elements.get('play-button')},preventDefault(){menuPrevented=true;}});
  assert.equal(menuPrevented,false,'menu buttons retain their ordinary click behavior');
  mixed.controller.prepareRun();mixed.controller.flap();
  const buttonTarget={closest:()=>mixed.elements.get('play-button')};
  for(let i=0;i<40;i++){
    const game=mixed.controller.game;game.bird.y=180;game.bird.vy=200;
    if(i%2)mixed.events.get('pointerdown')({button:0,isPrimary:false,pointerType:'touch',target:buttonTarget,preventDefault(){}});
    else mixed.events.get('keydown')({code:i%4?'KeyW':'Space',repeat:false,target:buttonTarget,preventDefault(){}});
    assert.equal(game.bird.vy,PHYSICS.flap,'every distinct press registers during play, including alternate fingers and a retained button target');
  }
  return 'Input latency: keyboard and pointer flaps rise on the next frame at 60–240 Hz, without advancing physics or replaying old motion.';
}

export async function checkResponsiveClient() {
  for (const [displayWidth,displayHeight] of [[1920,1200],[1920,1080],[3440,1440],[1024,768],[390,844],[844,390]]) {
    const width=Math.min(displayWidth,displayHeight*16/10), height=Math.min(displayHeight,displayWidth*16/10);
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

export async function checkDeviceInvariantGameplay(){
  const shapes=[[1920,1200],[1024,768],[390,844],[844,390],[360,800]];
  const number=n=>Number(n.toFixed(6));
  const snapshot=(game,time=0)=>game.pipes.map(pipe=>{
    const sample={...pipe,x:pipe.x-game.speed*time,referenceBirdX:game.bird.x};
    const pose=pipePose(sample);
    return {level:pipe.level,kind:pipe.kind,x:number(sample.x-game.bird.x),center:number(pose.center),
      top:pose.top&&[number(pose.top.x),number(pose.top.y),number(pose.top.angle)],
      bottom:pose.bottom&&[number(pose.bottom.x),number(pose.bottom.y),number(pose.bottom.angle)],
      hit:pipe.level===3?level3PipeHits(sample,{x:game.bird.x,y:168+Math.sin(time)*55,radius:12},game.ground):false};
  });
  for(const seed of [17,823,9182]){
    let expected;
    for(const [width,height] of shapes){
      let state=seed;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
      const view=viewportLayout(width,height),game=new Game({...view,random});game.start();game.score=LEVEL3_TEST_SCORE;game.activateLevel3();
      for(let i=0;i<12;i++)game.appendLevel3Chunk();
      assert.equal(game.difficulty,3);assert.equal(game.height,384);assert.equal(game.ground,336);
      const samples=[0,.137,1,4,8,13,21,34].map(time=>snapshot(game,time));
      expected ||= samples;assert.deepEqual(samples,expected,'pipe layout, motion and collision decisions depend on gameplay time, not device shape');
      game.bird.y=201;game.bird.vy=-123;const before=snapshot(game,1.3),queue=number(game.nextChunkX-game.bird.x),port={...game.lastExitPort};
      for(const [nextWidth,nextHeight] of shapes){
        const next=viewportLayout(nextWidth,nextHeight);game.resize(next.width,next.height);
        assert.equal(game.bird.y,201);assert.equal(game.bird.vy,-123);assert.equal(game.difficulty,3);
        assert.deepEqual(snapshot(game,1.3),before,'rotation changes only camera framing, including for moving gates and roofs');
        assert.equal(number(game.nextChunkX-game.bird.x),queue);assert.deepEqual(game.lastExitPort,port);
      }
    }
  }
  const c=await createClient({width:390,height:844});c.controller.prepareRun();c.controller.flap();
  c.controller.game.bird.y=201;c.controller.game.bird.vy=-123;c.controller.game.score=8;
  c.resize(844,390);
  assert.equal(c.controller.game.state,'playing','phone rotation never pauses or resets the run');
  assert.equal(c.controller.game.bird.y,201);assert.equal(c.controller.game.bird.vy,-123);assert.equal(c.controller.game.score,8);
  for(const type of ['selectstart','dragstart','contextmenu','dblclick','gesturestart','gesturechange','gestureend','touchmove']){
    let prevented=false;c.events.get(type)({preventDefault(){prevented=true;}});assert.ok(prevented,'mobile browser interaction is blocked: '+type);
  }
  const css=await readFile(new URL('../public/style.css',import.meta.url),'utf8');
  assert.ok(css.includes('user-select:none')&&css.includes('-webkit-touch-callout:none')&&css.includes('touch-action:none'));
  assert.ok(css.includes('height:min(100dvh,160dvw)')&&css.includes('width:min(100dvw,160dvh)'),'both display orientations obey the 16:10 cap');
  return 'Device invariance: seeded level 3 layouts, moving-pipe poses, collisions and live rotations match across phone and desktop views; mobile selection, scrolling and callouts are blocked.';
}

export async function checkFullscreenInputTiming() {
  const target={closest:()=>null};
  for(const hz of [60,144,240])for(const mode of ['fullscreen','resize'])for(const input of ['pointer','keyboard']){
    const c=await createClient(),baseline=await createClient();
    for(const client of [c,baseline]){client.controller.prepareRun();client.controller.flap();client.tick(.02);}
    assert.equal(c.elements.get('game').contextOptions.desynchronized,true,'game requests low-latency canvas presentation');
    for(let toggle=0;toggle<6;toggle++){
      for(const client of [c,baseline]){
        client.controller.game.bird.y=180;client.controller.game.bird.vy=200;client.controller.game.accumulator=0;
      }
      // A browser display-mode change can stall callbacks and return focus
      // before dispatching focus. It must not turn into a delayed fall/flap.
      c.elapse(.12);
      if(mode==='fullscreen')c.focus(false);
      const dimensions=toggle%2?[480,640]:[1920,1200];
      if(mode==='fullscreen')c.fullscreen(...dimensions,toggle%2?1:2);
      else c.resize(...dimensions); // F11 uses ResizeObserver, not fullscreenchange.
      const press=client=>input==='pointer'
        ?client.events.get('pointerdown')({button:0,target,preventDefault(){}})
        :client.events.get('keydown')({code:'Space',repeat:false,target,preventDefault(){}});
      press(c);press(baseline);
      assert.equal(c.controller.game.bird.vy,PHYSICS.flap,'post-fullscreen impulse is synchronous');
      const count=c.elements.get('game').context.renderCount;
      c.tick(1/hz);baseline.tick(1/hz);
      assert.equal(c.elements.get('game').context.renderCount,count+1,'first available frame after toggling displays the flap');
      for(let frame=0;frame<8;frame++){
        c.tick(1/hz);baseline.tick(1/hz);
        assert.ok(Math.abs(c.controller.game.presentation().birdY-baseline.controller.game.presentation().birdY)<1e-8,'fullscreen cannot age inputs or permanently change flight timing');
      }
      assert.ok(Math.abs(c.controller.game.distance-baseline.controller.game.distance)<1e-8,'display-mode switch retains normal world speed');
    }
  }
  return 'Fullscreen/F11: repeated entry/exit, display scale changes, focus races and stalled callbacks retain immediate input and next-frame flight at 60–240 Hz.';
}

export async function checkPreciseInputTiming() {
  const target={closest:()=>null}, press=c=>c.events.get('keydown')({code:'Space',repeat:false,target,preventDefault(){}});
  const arc=(y,vy,t)=>y+vy*t+PHYSICS.gravity*t*(t+PHYSICS.step)/2;
  const fixed=new Game(), split=new Game();fixed.start();split.start();fixed.update(PHYSICS.step);
  split.step(.007);split.step(PHYSICS.step-.007);
  assert.ok(Math.abs(fixed.bird.y-(188+(PHYSICS.flap+PHYSICS.gravity*PHYSICS.step)*PHYSICS.step))<1e-9,'full steps preserve the original flight arc');
  assert.ok(Math.abs(fixed.bird.y-split.bird.y)<1e-9&&Math.abs(fixed.bird.vy-split.bird.vy)<1e-9,'fractional boundaries compose without changing the arc');
  for(const gap of [0,.001,.004,.008,.015,.033,.08]) {
    const c=await createClient();c.controller.prepareRun();c.elapse(gap);press(c);
    const game=c.controller.game, y=game.bird.y;
    assert.equal(game.bird.vy,PHYSICS.flap);assert.equal(game.elapsed,0,'first flap excludes time spent waiting on the ready screen');
    c.tick(1/240);
    assert.ok(Math.abs(game.presentation().birdY-arc(y,PHYSICS.flap,1/240))<1e-8,'late-frame first flap has exactly the same strength');
    c.tick(.05);c.elapse(.023);press(c);
    assert.equal(game.bird.vy,PHYSICS.flap);assert.equal(game.accumulator,0,'pre-key fractional time is committed before the impulse');
    const from=game.bird.y;c.tick(1/240);
    assert.ok(Math.abs(game.presentation().birdY-arc(from,PHYSICS.flap,1/240))<1e-8,'new flap never consumes pre-key time');
  }
  let baseline;
  for(const fps of [30,60,144,240,360]) {
    const c=await createClient();c.controller.prepareRun();press(c);
    const inputs=[.137,.487,.913];let now=0,frame=1,index=0;
    while(now<1-1e-10) {
      const nextFrame=Math.min(1,frame/fps), nextInput=inputs[index]??Infinity;
      if(nextInput<=nextFrame) {c.elapse(nextInput-now);now=nextInput;press(c);index++;}
      else {c.tick(nextFrame-now);now=nextFrame;frame++;}
    }
    const game=c.controller.game, pose=game.presentation();
    assert.equal(game.state,'playing');
    const sample=[pose.birdY,game.bird.vy+PHYSICS.gravity*game.accumulator,game.pipes[0].x+pose.pipeOffset-game.bird.x];
    baseline ||= sample;
    sample.forEach((value,i)=>assert.ok(Math.abs(value-baseline[i])<1e-8,'identical timestamped presses produce identical flight at every FPS'));
  }
  const paused=await createClient();paused.controller.prepareRun();press(paused);paused.tick(.02);
  const before=paused.controller.game.elapsed;paused.visibility(true);paused.tick(2);
  assert.equal(paused.controller.game.elapsed,before,'hidden tabs do not accumulate falling time');
  paused.visibility(false);press(paused);const resumed=paused.controller.game.bird.y;paused.tick(1/240);
  assert.ok(Math.abs(paused.controller.game.presentation().birdY-arc(resumed,PHYSICS.flap,1/240))<1e-8,'returning to the tab cannot age a new flap');
  const jitter=await createClient();let time=0;
  for(let frame=1;frame<=240;frame++){const next=frame/240+(frame%2?-.0001:.0001);jitter.tick(next-time);time=next;}
  assert.equal(jitter.elements.get('game').context.renderCount,240,'small timestamp jitter does not skip 240 Hz refreshes');
  for(const input of ['pointer','keyboard','w'])for(const delay of [.001,.008,.02,.05]){
    const immediate=await createClient(),queued=await createClient();
    for(const c of [immediate,queued]){
      c.controller.prepareRun();c.controller.flap();c.tick(.02);
      c.controller.game.bird.y=180;c.controller.game.bird.vy=200;c.controller.game.accumulator=0;
    }
    const send=c=>input==='pointer'
      ?c.events.get('pointerdown')({button:0,timeStamp:24,target,preventDefault(){}})
      :c.events.get('keydown')({code:input==='w'?'KeyW':'Space',repeat:false,timeStamp:24,target,preventDefault(){}});
    immediate.elapse(.004);send(immediate);immediate.elapse(delay);
    queued.elapse(.004+delay);send(queued);
    assert.equal(queued.controller.game.bird.vy,PHYSICS.flap,'queued input applies its impulse inside the event handler');
    immediate.tick(1/240);queued.tick(1/240);
    const a=immediate.controller.game,b=queued.controller.game;
    assert.ok(Math.abs(a.presentation().birdY-b.presentation().birdY)<1e-8,'queued '+input+' uses press time, without adding the delivery delay to the fall');
    assert.ok(Math.abs(a.distance-b.distance)<1e-8,'queued input does not change world speed');
  }
  for(const recovery of ['active','tab','window'])for(const input of ['pointer','keyboard']){
    const c=await createClient();c.controller.prepareRun();c.controller.flap();c.tick(.02);
    const game=c.controller.game;game.bird.y=180;game.bird.vy=200;game.accumulator=0;
    const frozen={y:game.bird.y,vy:game.bird.vy,distance:game.distance};
    if(recovery==='tab')c.visibility(true);
    if(recovery==='window')c.focus(false);
    if(recovery!=='active'){
      c.tick(2);
      assert.deepEqual({y:game.bird.y,vy:game.bird.vy,distance:game.distance},frozen,'leaving a tab or window suspends gameplay');
      if(recovery==='tab')c.visibility(false);else c.focus(true);
    }
    c.elapse(.001);
    if(input==='pointer')c.events.get('pointerdown')({button:0,target,preventDefault(){}});else press(c);
    assert.equal(game.bird.vy,PHYSICS.flap,'first press after focus returns applies immediately');
    const y=game.bird.y,count=c.elements.get('game').context.renderCount;
    c.tick(1/240,.01);
    const context=c.elements.get('game').context;
    assert.equal(context.renderCount,count+1,'an older RAF timestamp cannot suppress the first available frame');
    const bird=context.commands.find(q=>q.kind==='image'&&q.args[1]===982&&q.args[2]===34);
    assert.ok(bird.matrix[5]/Math.hypot(bird.matrix[0],bird.matrix[1])<y,'first available frame shows the flap even if its queued RAF timestamp predates the press');
  }
  for(const input of ['pointer','keyboard']){
    const c=await createClient();c.controller.prepareRun();c.controller.flap();c.tick(.02);
    c.focus(false);c.tick(2);c.elapse(.001);
    if(input==='pointer')c.events.get('pointerdown')({button:0,target,preventDefault(){}});else press(c);
    assert.equal(c.controller.game.bird.vy,PHYSICS.flap,'a real press restores focus even when the browser delivers focus afterward');
    c.tick(1/240);assert.equal(c.controller.game.state,'playing');
  }
  const fading=await createClient({reducedMotion:false});fading.tick(.4);fading.controller.prepareRun();
  fading.tick(.22);press(fading);fading.tick(.7);
  assert.equal(fading.controller.game.state,'playing','a press during the ready fade is retained until the screen is ready');
  for(const coarsePointer of [false,true]){
    let requests=0;
    const c=await createClient({coarsePointer,fullscreenRequest:()=>{requests++;return Promise.resolve();}});
    c.controller.prepareRun();
    c.events.get('pointerdown')({button:0,target,preventDefault(){}});
    c.tick(.02);press(c);
    c.events.get('pointerdown')({button:0,target,preventDefault(){}});
    assert.equal(requests,0,'Play, keyboard and pointer input never request fullscreen');
    assert.equal(c.controller.game.state,'playing','touch and desktop play work in the normal browser window');
    assert.equal(c.controller.game.bird.vy,PHYSICS.flap,'windowed pointer input still flaps immediately');
  }
  return 'Precise input: timestamps, focus-event races, queued ready taps and windowed desktop/mobile play pass without adding flap delay or requesting fullscreen.';
}
