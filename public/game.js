import { Game, METRICS, PHYSICS, viewportLayout } from './engine.mjs';
import { SPRITES, loadAssets, drawSprite, drawBird, drawBackground, drawGround, drawPipe, drawNumber } from './assets.mjs';
import { TRANSITION_TIMING as TIMING, resultPresentation, transitionEase } from './transitions.mjs';
import { flapAngle, impactPresentation, wingPose, idleBob } from './bird-presentation.mjs';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d'), ui = $('game-ui');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let screen = 'home', loaded = false, view, night = false, rounds = 0;
let clock = 0, previous = performance.now(), landDistance = 0;
let best = 0, previousBest = 0, finalScore = 0, newBest = false;
let scene = { phase: reducedMotion ? 'idle' : 'in', elapsed: 0 }, sceneBlack = reducedMotion ? 0 : 1;
let readyAge = 0, readyExitAge = null, flapElapsed = Infinity;
let birdTilt = 0, lastWing = 0, impact = null;

try {
  const saved = localStorage.getItem('flappy-best');
  const legacy = JSON.parse(localStorage.getItem('flabby-guest') || '{}').best;
  const value = Number(saved ?? legacy ?? 0);
  if (Number.isSafeInteger(value) && value >= 0) best = value;
} catch {}

const game = new Game({ onEvent(type, data) {
  if (type === 'hit') {
    impact = { elapsed: 0, startingAngle: birdTilt, wing: lastWing };
    previousBest = best; finalScore = game.score; screen = 'hit'; updateControls();
  }
  if (type === 'score') canvas.setAttribute('aria-label', `Score ${data.score}. Tap, Space, or Up to flap.`);
  if (type === 'over') {
    if (!impact) { impact = { elapsed: 0, startingAngle: birdTilt, wing: lastWing }; previousBest = best; }
    screen = 'over'; finalScore = data.score; newBest = finalScore > previousBest;
    best = Math.max(best, finalScore);
    try { localStorage.setItem('flappy-best', String(best)); } catch {}
    updateControls();
  }
} });

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
  if (view && view.pixelsWide === rect.width && view.pixelsHigh === rect.height && view.dpr === Math.min(devicePixelRatio || 1, 3)) return;
  view = { ...next, dpr: Math.min(devicePixelRatio || 1, 3), pixelsWide: rect.width, pixelsHigh: rect.height };
  canvas.width = Math.round(rect.width * view.dpr); canvas.height = Math.round(rect.height * view.dpr);
  game.resize(view.width, view.height);
  ui.style.width = `${view.width}px`; ui.style.height = `${view.height}px`; ui.style.transform = `scale(${view.scale})`;
  // UI shadows sit behind the foreground ground strip, as in the reference.
  ui.style.clipPath = `inset(0px 0px ${METRICS.groundHeight}px 0px)`;
  ui.style.setProperty('--buttons-y', `${game.ground - 60}px`);
  ui.style.setProperty('--rate-x', `${(game.width - METRICS.width) / 2 + 107}px`);
  ui.style.setProperty('--rate-y', `${(game.height - METRICS.height) / 2 + 207}px`);
  paintControls();
}
new ResizeObserver(resize).observe($('game-frame'));
resize();

function showReady() {
  game.reset(); screen = 'ready';
  night = rounds++ > 0 && Math.random() < .5;
  readyAge = 0; readyExitAge = null; flapElapsed = Infinity; birdTilt = 0; impact = null;
  updateControls(); canvas.focus({ preventScroll: true });
}
function prepareRun() {
  if (!loaded || scene.phase !== 'idle' || !['home', 'over'].includes(screen)) return;
  if (screen === 'over' && !resultState().finished) return;
  if (reducedMotion) { showReady(); return; }
  scene = { phase: 'out', elapsed: 0 }; updateControls();
}
function flap() {
  if (!loaded) { initializeAssets(); return; }
  if (scene.phase !== 'idle') return;
  if (screen === 'ready') {
    const bob = reducedMotion ? 0 : idleBob(clock);
    game.start(); game.bird.y += bob; screen = 'playing'; flapElapsed = 0; readyExitAge = 0; updateControls();
  } else if (game.state === 'playing') { game.flap(); flapElapsed = 0; }
}
$('play-button').addEventListener('click', prepareRun);
document.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.isPrimary === false || event.target.closest('button')) return;
  event.preventDefault(); flap();
});
document.addEventListener('keydown', event => {
  // Escape deliberately has no game action.
  if (['Space', 'ArrowUp', 'Enter'].includes(event.code) && !event.target.closest('button')) {
    event.preventDefault(); if (!event.repeat) flap();
  }
});

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
      const sparkle = (impact.elapsed % 1.2) / 1.2;
      ctx.globalAlpha *= Math.max(0, 1 - Math.abs(sparkle - .5) * 5);
      drawSprite(ctx, 'sparkle', 59 + 30 * sparkle, 176 + 28 * sparkle);
    }
    ctx.restore();
  }
  ctx.restore();
}
function frame(time) {
  const elapsed = Math.max(0, (time - previous) / 1000 || .016), dt = Math.min(elapsed, .1); previous = time;
  advanceScene(elapsed);
  if (scene.phase !== 'hold') readyAge += elapsed;
  if (readyExitAge !== null) readyExitAge += elapsed;
  flapElapsed += dt; clock += dt;
  if (impact) impact.elapsed += elapsed;
  const oldDistance = game.distance;
  game.update(dt);
  if (!impact) landDistance += game.state === 'playing' ? game.distance - oldDistance : PHYSICS.speed * dt;
  updateControls();
  const factor = view.scale * view.dpr;
  ctx.setTransform(factor, 0, 0, factor, 0, 0); ctx.imageSmoothingEnabled = false;
  const width = game.width, ground = game.ground, ox = (width - METRICS.width) / 2, oy = (game.height - METRICS.height) / 2;
  drawBackground(ctx, width, game.height, ground, night);
  for (const pipe of game.pipes) {
    drawPipe(ctx, pipe.x, 0, pipe.width, pipe.center - pipe.gap / 2, true);
    drawPipe(ctx, pipe.x, pipe.center + pipe.gap / 2, pipe.width, ground - pipe.center - pipe.gap / 2);
  }
  if (loaded) {
    const wing = impact ? impact.wing : wingPose(clock);
    if (screen === 'home') {
      drawSprite(ctx, 'title', ox + 55, oy + 86);
      drawBird(ctx, ox + 144, oy + 164 + (reducedMotion ? 0 : idleBob(clock)), wing);
    } else {
      if (!impact || (!reducedMotion && impact.elapsed < TIMING.headerDelay)) drawNumber(ctx, game.score, width / 2, 18);
      const readyOpacity = reducedMotion ? readyExitAge === null ? 1 : 0 : readyExitAge === null ? Math.min(1, readyAge / TIMING.readyIn) : Math.max(0, 1 - readyExitAge / TIMING.readyOut);
      if (readyOpacity > 0 && ['ready', 'playing'].includes(screen)) {
        ctx.save(); ctx.globalAlpha = readyOpacity;
        drawSprite(ctx, 'ready', ox + 46, oy + 84); drawSprite(ctx, 'tutorial', ox + 87, oy + 156); ctx.restore();
      }
      birdTilt = impact ? impactPresentation(impact.elapsed, impact.startingAngle, reducedMotion).angle : game.state === 'ready' ? 0 : flapAngle(flapElapsed, game.bird.vy);
      drawBird(ctx, game.bird.x, game.bird.y + (screen === 'ready' && !reducedMotion ? idleBob(clock) : 0), wing, birdTilt);
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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function initializeAssets() {
  loadAssets().then(() => { loaded = true; updateControls(); paintControls(); }).catch(error => console.error(error));
}
initializeAssets();
