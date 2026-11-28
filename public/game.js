import { Game, METRICS, PHYSICS, viewportLayout } from './engine.mjs';
import { SPRITES, loadAssets, drawSprite, drawBird, drawBackground, drawGround, drawPipe, drawNumber } from './assets.mjs';
import { TRANSITION_TIMING as TIMING, resultPresentation, transitionEase } from './transitions.mjs';
import { flapAngle, impactPresentation, wingPose, idleBob } from './bird-presentation.mjs';
import { GameAudio, DEATH_SOUND_DELAY } from './audio.mjs';
import { MedalGlimmer } from './medal-presentation.mjs';
import { pipePose, pipeShaftLength, pipeBounds } from './difficulty.mjs';
import { createChunkPrefetch } from './chunk-prefetch.mjs';

const $ = id => document.getElementById(id);
// Let supporting browsers present the game canvas without an extra compositor
// queue, including after its surface is recreated by a fullscreen resize.
const canvas = $('game'), ctx = canvas.getContext('2d', { desynchronized: true }), ui = $('game-ui');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let screen = 'home', loaded = false, view, night = false, pageFocused = document.hasFocus?.() ?? true;
const suspended = () => document.hidden || !pageFocused;
const randomBird = () => ['yellow', 'blue', 'red'][Math.floor(Math.random() * 3)];
const menuBird = randomBird();
let runBird = menuBird;
let clock = 0, previous = performance.now(), landDistance = 0;
const RENDER_INTERVAL = 1000 / 240;
const FRAME_TOLERANCE = .25; // Avoid missing a refresh over sub-millisecond timestamp jitter.
let nextFrameAt = previous + RENDER_INTERVAL;
let best = 0, previousBest = 0, finalScore = 0, newBest = false;
let scene = { phase: reducedMotion ? 'idle' : 'in', elapsed: 0 }, sceneBlack = reducedMotion ? 0 : 1;
let readyAge = 0, readyExitAge = null, flapElapsed = Infinity;
let pendingReadyFlap = false;
let birdTilt = 0, lastWing = 0, impact = null;
const audio = new GameAudio();
let glimmer = new MedalGlimmer();

try {
  const saved = localStorage.getItem('flappy-best');
  const legacy = JSON.parse(localStorage.getItem('flabby-guest') || '{}').best;
  const value = Number(saved ?? legacy ?? 0);
  if (Number.isSafeInteger(value) && value >= 0) best = value;
} catch {}

const game = new Game({ chunkPrefetch:createChunkPrefetch(), onEvent(type, data) {
  if (type === 'flap') audio.play('wing');
  if (type === 'hit') {
    audio.play('hit');
    // Ground-only crashes have no subsequent falling whistle.
    if (game.bird.y + game.bird.radius < game.ground) audio.play('die', DEATH_SOUND_DELAY);
    impact = captureImpact();
    previousBest = best; finalScore = game.score; screen = 'hit'; updateControls();
  }
  if (type === 'score') {
    audio.play('point');
    canvas.setAttribute('aria-label', `Score ${data.score}. Tap, Space, W, or Up to flap.`);
  }
  if (type === 'over') {
    if (!impact) { impact = captureImpact(); previousBest = best; }
    screen = 'over'; finalScore = data.score; newBest = finalScore > previousBest;
    best = Math.max(best, finalScore);
    try { localStorage.setItem('flappy-best', String(best)); } catch {}
    updateControls();
  }
} });

function captureImpact() {
  // A collision may occur between renders or while a late flap commits its
  // pending old motion. Retain the incoming downward pose in either case.
  const incomingAngle = flapAngle(flapElapsed, game.bird.vy);
  const startingAngle = birdTilt > Math.PI / 4 ? Math.max(birdTilt, incomingAngle) : incomingAngle;
  return { elapsed: 0, startingAngle, wing: lastWing, headerSound: false, panelSound: false };
}

function resultState() { return resultPresentation(impact?.elapsed ?? 0, finalScore, reducedMotion); }
function updateControls() {
  const result = resultState();
  const showReplay = screen === 'over' && result.finished;
  $('play-controls').hidden = !loaded || !(screen === 'home' || showReplay);
  $('rate-button').hidden = !loaded || screen !== 'home';
  $('play-button').disabled = scene.phase !== 'idle' || (screen === 'over' && result.replayOpacity === 0);
  $('play-controls').style.opacity = String(screen === 'over' ? result.replayOpacity : 1);
  const flash = impact ? impactPresentation(impact.elapsed, impact.startingAngle, reducedMotion).flash : 0;
  ui.style.opacity = String((1 - sceneBlack) * (1 - flash));
}
function paintControls() {
  if (!loaded) return;
  document.querySelectorAll('[data-sprite]').forEach(c => {
    const sprite = SPRITES[c.dataset.sprite]; c.width = sprite.width; c.height = sprite.height;
    drawSprite(c.getContext('2d'), c.dataset.sprite, 0, 0);
  });
}
function resize() {
  const rect = $('game-frame').getBoundingClientRect(), next = viewportLayout(rect.width, rect.height);
  if (view && view.frameWidth === rect.width && view.frameHeight === rect.height && view.dpr === Math.min(devicePixelRatio || 1, 3)) return;
  view = { ...next, dpr: Math.min(devicePixelRatio || 1, 3), frameWidth: rect.width, frameHeight: rect.height };
  canvas.width = Math.round(view.pixelsWide * view.dpr); canvas.height = Math.round(view.pixelsHigh * view.dpr);
  game.resize(view.width, view.height);
  ui.style.width = `${view.width}px`; ui.style.height = `${view.height}px`; ui.style.transform = `scale(${view.scale})`;
  // UI shadows sit behind the foreground ground strip, as in the reference.
  ui.style.clipPath = `inset(0px 0px ${METRICS.groundHeight}px 0px)`;
  ui.style.setProperty('--buttons-y', `${game.ground - 60}px`);
  ui.style.setProperty('--buttons-gap', `${Math.max(8,Math.min(16,game.width-232))}px`);
  ui.style.setProperty('--rate-x', `${(game.width - METRICS.width) / 2 + 107}px`);
  ui.style.setProperty('--rate-y', `${(game.height - METRICS.height) / 2 + 207}px`);
  paintControls();
  // Fullscreen/F11 and monitor changes can stall callbacks while the browser
  // replaces the canvas surface. Neither that stall nor the old frame deadline
  // should carry into the first input on the resized surface.
  if (!document.hidden) pageFocused = document.hasFocus?.() ?? pageFocused;
  resetFrameTiming();
}
new ResizeObserver(resize).observe($('game-frame'));
resize();

function showReady() {
  game.reset(); screen = 'ready';
  runBird = randomBird(); night = Math.random() >= .5;
  readyAge = 0; readyExitAge = null; flapElapsed = Infinity; birdTilt = 0; impact = null;
  glimmer = new MedalGlimmer();
  updateControls(); canvas.focus({ preventScroll: true });
}
function prepareRun() {
  recoverInputFocus();
  advance(performance.now());
  if (!loaded || scene.phase !== 'idle' || !['home', 'over'].includes(screen)) return;
  if (screen === 'over' && !resultState().finished) return;
  audio.unlock(); audio.stop(); audio.play('swoosh');
  if (reducedMotion) { showReady(); return; }
  scene = { phase: 'out', elapsed: 0 }; updateControls();
}
function flap(inputTime) {
  if(document.hidden)return;
  recoverInputFocus();
  if (!loaded) { audio.unlock(); initializeAssets(); return; }
  const now=performance.now();
  // A busy frame can deliver an event after its physical press. Apply the
  // impulse at that timestamp, not after simulating the queue delay as a fall.
  // Old/foreign-clock timestamps must never rewind committed simulation.
  const at=Number.isFinite(inputTime)&&inputTime>=0&&inputTime<=now?Math.max(previous,inputTime):now;
  advance(at);
  if (scene.phase !== 'idle') {
    // Retain a tap during the ready-screen fade instead of silently losing it.
    if (screen === 'ready' || scene.phase === 'out') pendingReadyFlap = true;
    return;
  }
  applyFlap();
  audio.unlock();
}
function applyFlap() {
  if (screen === 'ready') {
    const bob = reducedMotion ? 0 : idleBob(clock);
    game.start(); game.bird.y += bob;
    screen = 'playing'; flapElapsed = 0; readyExitAge = 0; updateControls();
  } else if (game.state === 'playing') { game.flap(); if(game.state === 'playing') flapElapsed = 0; }
}
function recoverInputFocus() {
  // A click that restores browser focus can arrive before the focus event.
  if (!document.hidden && !pageFocused) {
    pageFocused = true; previous = performance.now(); nextFrameAt = previous;
  }
}
function resetFrameTiming() {
  previous = performance.now(); nextFrameAt = previous + RENDER_INTERVAL;
}
$('play-button').addEventListener('click', prepareRun);
document.addEventListener('pointerdown', event => {
  if (event.button !== 0 || (event.target.closest('button')&&screen!=='ready'&&game.state!=='playing')) return;
  event.preventDefault(); flap(event.timeStamp);
}, { capture: true, passive: false });
document.addEventListener('keydown', event => {
  if(event.code==='Tab'){event.preventDefault();return;}
  // Escape deliberately has no game action.
  if ((['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(event.code) || [' ', 'ArrowUp', 'w', 'W', 'Enter'].includes(event.key)) && (!event.target.closest('button')||screen==='ready'||game.state==='playing')) {
    event.preventDefault(); if (!event.repeat) flap(event.timeStamp);
  }
}, { capture: true });

document.addEventListener('visibilitychange', () => {
  previous = performance.now(); nextFrameAt = previous;
});
for(const type of ['selectstart','dragstart','contextmenu','dblclick','gesturestart','gesturechange','gestureend','touchmove']){
  document.addEventListener(type,event=>event.preventDefault(),{passive:false});
}
window.addEventListener('blur', () => {
  pageFocused=false;previous=performance.now();nextFrameAt=previous;
});
window.addEventListener('focus', () => {
  if(!pageFocused){pageFocused=true;previous=performance.now();nextFrameAt=previous;}
});
document.addEventListener('fullscreenchange', () => {
  resize();
  // The fullscreen event may arrive after ResizeObserver, or without a size
  // change at all. Also handle a focus event swallowed by the browser switch.
  if (!document.hidden) pageFocused = document.hasFocus?.() ?? pageFocused;
  resetFrameTiming();
});
window.addEventListener('orientationchange', resize);

function advanceScene(dt) {
  while (scene.phase !== 'idle' && dt > 0) {
    const duration = scene.phase === 'out' ? TIMING.sceneOut : scene.phase === 'hold' ? TIMING.sceneHold : TIMING.sceneIn;
    const step = Math.min(dt, duration - scene.elapsed); scene.elapsed += step; dt -= step;
    if (scene.elapsed + 1e-9 < duration) break;
    if (scene.phase === 'out') { showReady(); scene = { phase: 'hold', elapsed: 0 }; }
    else if (scene.phase === 'hold') scene = { phase: 'in', elapsed: 0 };
    else scene = { phase: 'idle', elapsed: 0 };
  }
  sceneBlack = scene.phase === 'idle' ? 0 : scene.phase === 'hold' ? 1 : scene.phase === 'out' ? transitionEase(scene.elapsed / TIMING.sceneOut) : 1 - transitionEase(scene.elapsed / TIMING.sceneIn);
}
function renderResults(xOffset, yOffset) {
  const result = resultState();
  if (result.headerOpacity > 0) {
    ctx.save(); ctx.globalAlpha = result.headerOpacity;
    drawSprite(ctx, 'over', xOffset + 42, yOffset + 68 + result.headerY); ctx.restore();
  }
  if (!result.cardVisible) return;
  ctx.save(); ctx.translate(xOffset, yOffset + result.cardY);
  drawSprite(ctx, 'scorePanel', 25, 130);
  drawNumber(ctx, result.displayScore, 236, 165, 1, 'right', true);
  drawNumber(ctx, Math.max(previousBest, result.displayScore), 236, 207, 1, 'right', true);
  if (result.finished && newBest) drawSprite(ctx, 'new', 166, 189);
  const medal = finalScore >= 40 ? 'platinum' : finalScore >= 30 ? 'gold' : finalScore >= 20 ? 'silver' : finalScore >= 10 ? 'bronze' : null;
  if (medal && result.medalOpacity > 0) {
    ctx.save(); ctx.globalAlpha = result.medalOpacity;
    drawSprite(ctx, medal, 57 + 22 * (1 - result.medalScale), 174 + 22 * (1 - result.medalScale), result.medalScale);
    if (!reducedMotion && result.finished) {
      const sparkle = glimmer.sample(impact.elapsed - result.finishedAt);
      drawSprite(ctx, sparkle.sprite, 57 + sparkle.x, 174 + sparkle.y);
    }
    ctx.restore();
  }
  ctx.restore();
}
function advance(time) {
  if(suspended()){previous=time;nextFrameAt=time;return;}
  const elapsed = Math.max(0, (time - previous) / 1000), dt = Math.min(elapsed, .1);
  if (elapsed === 0) return;
  previous = time;
  advanceScene(elapsed);
  if (scene.phase !== 'hold') readyAge += elapsed;
  if (readyExitAge !== null) readyExitAge += elapsed;
  flapElapsed += dt; clock += dt;
  if (impact) impact.elapsed += elapsed;
  game.update(dt);
  if (impact) {
    for (const [flag, delay] of [['headerSound', TIMING.headerDelay], ['panelSound', TIMING.panelDelay]]) {
      if (!impact[flag] && impact.elapsed >= delay) {
        impact[flag] = true;
        // Do not replay missed sounds after a background-tab pause.
        if (impact.elapsed - delay < .15) audio.play('swoosh');
      }
    }
  }
  if (!impact) landDistance += game.speed * dt;
  if (pendingReadyFlap && scene.phase === 'idle' && screen === 'ready') {
    pendingReadyFlap = false; applyFlap();
  }
}
function frame() {
  // A queued RAF timestamp can precede a just-handled input or focus event.
  // Sample the clock now so the first available frame shows the new flap.
  const time=performance.now();
  requestAnimationFrame(frame);
  if (suspended()) { previous = time; nextFrameAt = time + RENDER_INTERVAL; return; }
  // Simulation and input timing do not wait for the render limiter.
  advance(time);
  if (time + FRAME_TOLERANCE < nextFrameAt) return;
  // Retain the 240 FPS budget without making tiny clock jitter skip a refresh.
  nextFrameAt += (Math.floor((time - nextFrameAt + FRAME_TOLERANCE) / RENDER_INTERVAL) + 1) * RENDER_INTERVAL;
  updateControls();
  const factor = view.scale * view.dpr;
  // Keep nearest-neighbor sampling in the same phase while a pipe moves.
  // Rounding native pixels would stutter at high refresh rates; round only
  // the final device-pixel translation, leaving physics and timing untouched.
  const pipePixel = value => Math.round(value * factor) / factor;
  ctx.setTransform(factor, 0, 0, factor, 0, 0); ctx.imageSmoothingEnabled = false;
  const width = game.width, ground = game.ground, ox = (width - METRICS.width) / 2, oy = (game.height - METRICS.height) / 2;
  drawBackground(ctx, width, game.height, ground, screen === 'home' ? false : night);
  const pose = game.presentation();
  const upperOverlays=[];
  const drawLevel3Post=(pipe,post,up)=>{
    if(up&&pipe.noTop)return;
    const length=pipeShaftLength(pipe,ground,up);
    ctx.save();ctx.translate(pipePixel(pipe.x+pose.pipeOffset+pipe.width/2+post.x),pipePixel(post.y));ctx.rotate(post.angle);
    drawPipe(ctx,-pipe.width/2,up?-length:0,pipe.width,length,up);ctx.restore();
  };
  for (const pipe of game.pipes) {
    const bounds = pipe.level === 3 ? pipeBounds(pipe, ground, pose.pipeOffset)
      : { minX: pipe.x + pose.pipeOffset, maxX: pipe.x + pose.pipeOffset + pipe.width };
    if (bounds.maxX < 0 || bounds.minX > width) continue;
    if (pipe.level === 3) {
      const shape = pipePose(pipe, pose.pipeOffset);
      for (const [post, up] of [[shape.top, true], [shape.bottom, false]]) {
        if(up&&pipe.allowRoofOverlap&&post.angle<0)upperOverlays.push([pipe,post]);
        else drawLevel3Post(pipe,post,up);
      }
      continue;
    }
    const pipeX=pipePixel(pipe.x+pose.pipeOffset);
    const center=game.pipeCenter(pipe,game.state==='playing'?Math.max(0,Math.min(PHYSICS.step,game.accumulator)):0);
    if(pipe.level===2){
      // Move complete, fixed-size atlas crops. Resizing a fractional source
      // rectangle every frame changed its sampling phase and made these slow
      // vertical movements shimmer. The excess shaft stays behind the ground
      // or above the viewport, while both caps share one device-pixel offset.
      ctx.save();ctx.translate(pipeX,pipePixel(center-pipe.gap/2));
      drawPipe(ctx,0,-SPRITES.pipeTop.height,pipe.width,SPRITES.pipeTop.height,true);
      ctx.translate(0,pipe.gap);
      drawPipe(ctx,0,0,pipe.width,SPRITES.pipeBottom.height);
      ctx.restore();continue;
    }
    drawPipe(ctx, pipeX, 0, pipe.width, center - pipe.gap / 2, true);
    // Hide the shaft's final pixel beneath the foreground at every scale.
    drawPipe(ctx, pipeX, center + pipe.gap / 2, pipe.width, ground - center - pipe.gap / 2 + 1);
  }
  for(const [pipe,post] of upperOverlays)drawLevel3Post(pipe,post,true);
  if (loaded) {
    // Actual flaps reset flapElapsed, restarting the faster official wing cycle.
    const flying = game.state === 'playing';
    const wing = impact ? impact.wing : wingPose(flying ? flapElapsed : clock, flying, game.bird.vy);
    if (screen === 'home') {
      drawSprite(ctx, 'title', ox + 55, oy + 86);
      drawBird(ctx, ox + 144, oy + 164 + (reducedMotion ? 0 : idleBob(clock)), wing, 0, menuBird);
    } else {
      if (!impact || (!reducedMotion && impact.elapsed < TIMING.headerDelay)) drawNumber(ctx, game.score, width / 2, 18);
      const readyOpacity = reducedMotion ? readyExitAge === null ? 1 : 0 : readyExitAge === null ? Math.min(1, readyAge / TIMING.readyIn) : Math.max(0, 1 - readyExitAge / TIMING.readyOut);
      if (readyOpacity > 0 && ['ready', 'playing'].includes(screen)) {
        ctx.save(); ctx.globalAlpha = readyOpacity;
        drawSprite(ctx, 'ready', ox + 46, oy + 84); drawSprite(ctx, 'tutorial', ox + 87, oy + 156); ctx.restore();
      }
      birdTilt = impact ? impactPresentation(impact.elapsed, impact.startingAngle, reducedMotion).angle : game.state === 'ready' ? 0 : flapAngle(flapElapsed, game.bird.vy);
      drawBird(ctx, game.bird.x, pose.birdY + (screen === 'ready' && !reducedMotion ? idleBob(clock) : 0), wing, birdTilt, runBird);
      if (impact) renderResults(ox, oy);
    }
    lastWing = wing;
  }
  drawGround(ctx, width, ground, landDistance);
  if (loaded && screen === 'home') drawSprite(ctx, 'copyright', ox + 81, ground + 19);
  if (impact) {
    ctx.save(); ctx.fillStyle = '#fff'; ctx.globalAlpha = impactPresentation(impact.elapsed, impact.startingAngle, reducedMotion).flash;
    ctx.fillRect(0, 0, width, game.height); ctx.restore();
  }
  if (sceneBlack > 0) {
    ctx.save(); ctx.fillStyle = '#000'; ctx.globalAlpha = sceneBlack;
    ctx.fillRect(0, 0, width, game.height); ctx.restore();
  }
}
requestAnimationFrame(frame);
function initializeAssets() {
  Promise.all([loadAssets(), audio.ready]).then(() => { loaded = true; updateControls(); paintControls(); }).catch(error => console.error(error));
}
initializeAssets();
