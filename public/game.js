import { Game, viewportLayout } from './engine.mjs';
import { SPRITES, loadAssets, drawSprite, drawBird, drawBackground, drawGround, drawPipe, drawNumber } from './assets.mjs';
import { TRANSITION_TIMING, transitionEase, resultPresentation } from './transitions.mjs';
import { flapAngle, impactPresentation } from './bird-presentation.mjs';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d'), ui = $('game-ui');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let screen = 'home', loaded = false, view;
let clock = 0, previous = performance.now(), idleDistance = 0;
let best = 0, finalScore = 0, newBest = false;
let splash = { kind: 'home', alpha: reducedMotion ? 1 : 0, from: 0, to: 1, elapsed: 0, duration: TRANSITION_TIMING.splashIn };
let navigation = null, resultsElapsed = 0, resultExitElapsed = null;
let flapElapsed = Infinity, birdTilt = 0, impact = null;

// BEST is shown only with the official scorecard and number sprites.
try {
  const saved = localStorage.getItem('flappy-best');
  const legacy = JSON.parse(localStorage.getItem('flabby-guest') || '{}').best;
  const value = Number(saved ?? legacy ?? 0);
  if (Number.isSafeInteger(value) && value >= 0) best = value;
} catch {}

const game = new Game({ onEvent(type, data) {
  if (type === 'hit') impact = { elapsed: 0, startingAngle: birdTilt };
  if (type === 'score') canvas.setAttribute('aria-label', `Score ${data.score}. Tap, Space, or Up to flap.`);
  if (type === 'over') {
    screen = 'over'; finalScore = data.score; newBest = finalScore > best;
    resultsElapsed = 0; resultExitElapsed = null;
    best = Math.max(best, finalScore);
    try { localStorage.setItem('flappy-best', String(best)); } catch {}
    updateControls();
  }
} });

function updateControls() {
  $('play-controls').hidden = !loaded || !['home', 'over'].includes(screen);
  $('menu-button').hidden = !loaded || screen === 'home';
  updateControlPresentation();
}
function updateControlPresentation() {
  const result = resultPresentation(resultsElapsed, resultExitElapsed, reducedMotion);
  const controls = $('play-controls');
  controls.style.opacity = String(screen === 'over' ? result.replayOpacity : splash.alpha);
  controls.style.transform = `translate(-50%, ${screen === 'over' ? result.replayY : 0}px)`;
  $('play-button').disabled = !!navigation || (screen === 'over' && result.replayOpacity === 0);
  ui.style.opacity = String(1 - (impact ? impactPresentation(impact.elapsed, impact.startingAngle, reducedMotion).flash : 0));
}
function paintControls() {
  if (!loaded) return;
  document.querySelectorAll('[data-sprite]').forEach(c => {
    const sprite = SPRITES[c.dataset.sprite];
    c.width = sprite.width; c.height = sprite.height;
    const context = c.getContext('2d'); context.clearRect(0, 0, c.width, c.height);
    drawSprite(context, c.dataset.sprite, 0, 0);
  });
}
function resize() {
  const rect = $('game-frame').getBoundingClientRect(), next = viewportLayout(rect.width, rect.height);
  if (view && view.pixelsWide === rect.width && view.pixelsHigh === rect.height && view.dpr === Math.min(devicePixelRatio || 1, 3)) return;
  view = { ...next, dpr: Math.min(devicePixelRatio || 1, 3), pixelsWide: rect.width, pixelsHigh: rect.height };
  canvas.width = Math.round(rect.width * view.dpr); canvas.height = Math.round(rect.height * view.dpr);
  game.resize(view.width, view.height);
  ui.style.width = `${view.width}px`; ui.style.height = `${view.height}px`; ui.style.transform = `scale(${view.scale})`;
  ui.style.setProperty('--buttons-y', `${game.ground - 88}px`);
  paintControls();
}
new ResizeObserver(resize).observe($('game-frame'));
resize();

function fadeSplash(kind, to, duration) {
  const from = splash.kind === kind ? splash.alpha : 0;
  splash = { kind, from, to, alpha: reducedMotion ? to : from, elapsed: 0, duration };
}
function showReady() {
  game.reset(); screen = 'ready'; navigation = null;
  flapElapsed = Infinity; birdTilt = 0; impact = null;
  resultsElapsed = 0; resultExitElapsed = null;
  fadeSplash('ready', 1, TRANSITION_TIMING.splashIn);
  updateControls(); canvas.focus({ preventScroll: true });
}
function prepareRun() {
  if (!loaded || navigation) return;
  if (reducedMotion) { showReady(); return; }
  if (screen === 'home') {
    fadeSplash('home', 0, TRANSITION_TIMING.splashOut);
    navigation = { elapsed: 0, duration: TRANSITION_TIMING.splashOut };
  } else if (screen === 'over') {
    resultExitElapsed = 0;
    navigation = { elapsed: 0, duration: TRANSITION_TIMING.resultsOut };
  } else return;
  updateControls();
}
function returnHome() {
  navigation = null; resultExitElapsed = null; resultsElapsed = 0;
  game.reset(); screen = 'home';
  flapElapsed = Infinity; birdTilt = 0; impact = null;
  splash = { kind: 'home', alpha: reducedMotion ? 1 : 0, from: 0, to: 1, elapsed: 0, duration: TRANSITION_TIMING.splashIn };
  updateControls(); canvas.focus({ preventScroll: true });
}
function flap() {
  if (!loaded) { initializeAssets(); return; }
  if (navigation) return;
  if (screen === 'home') prepareRun();
  else if (screen === 'ready') {
    game.start(); screen = 'playing'; flapElapsed = 0;
    fadeSplash('ready', 0, TRANSITION_TIMING.splashOut); updateControls();
  }
  else if (game.state === 'playing') { game.flap(); flapElapsed = 0; }
}
$('play-button').addEventListener('click', prepareRun);
$('menu-button').addEventListener('click', returnHome);
canvas.addEventListener('pointerdown', event => { event.preventDefault(); flap(); });
document.addEventListener('keydown', event => {
  if (event.code === 'Escape') { event.preventDefault(); returnHome(); }
  if (['Space', 'ArrowUp', 'Enter'].includes(event.code) && !event.target.closest('button')) {
    event.preventDefault(); if (!event.repeat) flap();
  }
});

function advancePresentation(dt) {
  if (navigation) {
    navigation.elapsed += dt;
    if (navigation.elapsed >= navigation.duration) {
      const remainder = navigation.elapsed - navigation.duration;
      showReady(); dt = remainder;
    }
  }
  splash.elapsed += dt;
  const progress = reducedMotion ? 1 : transitionEase(splash.elapsed / splash.duration);
  splash.alpha = splash.from + (splash.to - splash.from) * progress;
  if (screen === 'over') {
    resultsElapsed += dt;
    if (resultExitElapsed !== null) resultExitElapsed += dt;
  }
  updateControlPresentation();
}
function frame(time) {
  const elapsed = Math.max(0, (time - previous) / 1000 || .016);
  const dt = Math.min(elapsed, .035); previous = time; clock += dt;
  flapElapsed += dt;
  if (impact) impact.elapsed += elapsed;
  advancePresentation(elapsed);
  if (['home', 'ready'].includes(screen) && !reducedMotion) idleDistance += dt * 18;
  game.update(dt);
  const distance = ['home', 'ready'].includes(screen) ? idleDistance : game.distance;
  const ground = game.ground, width = game.width, center = ground / 2;
  const factor = view.scale * view.dpr;
  ctx.setTransform(factor, 0, 0, factor, 0, 0); ctx.imageSmoothingEnabled = false;
  drawBackground(ctx, width, game.height, ground, distance);
  for (const pipe of game.pipes) {
    drawPipe(ctx, pipe.x, 0, pipe.width, pipe.center - pipe.gap / 2, true);
    drawPipe(ctx, pipe.x, pipe.center + pipe.gap / 2, pipe.width, ground - pipe.center - pipe.gap / 2);
  }
  if (loaded) {
    const wing = Math.sin(clock * (game.state === 'playing' ? 19 : 7));
    if (splash.kind === 'ready' && splash.alpha > 0 && ['ready', 'playing'].includes(screen)) {
      ctx.save(); ctx.globalAlpha = splash.alpha;
      drawSprite(ctx, 'ready', width / 2 - 98, center - 112);
      drawSprite(ctx, 'tutorial', width / 2 - 57, center - 36); ctx.restore();
    }
    if (screen === 'home') {
      ctx.save(); ctx.globalAlpha = splash.alpha;
      drawSprite(ctx, 'title', width / 2 - 89, center - 100); ctx.restore();
      drawBird(ctx, width / 2, center - 8 + (reducedMotion ? 0 : Math.sin(clock * 3) * 4), wing);
    } else if (screen === 'ready') {
      drawBird(ctx, game.bird.x, game.bird.y + (reducedMotion ? 0 : Math.sin(clock * 3) * 3), wing);
    } else {
      const falling = ['falling', 'over'].includes(game.state);
      birdTilt = impact ? impactPresentation(impact.elapsed, impact.startingAngle, reducedMotion).angle : flapAngle(flapElapsed, game.bird.vy);
      drawBird(ctx, game.bird.x, game.bird.y, falling ? 0 : wing,
        falling && !impact ? 1.3 : birdTilt);
      if (screen !== 'over') drawNumber(ctx, game.score, width / 2, 48);
    }
  }
  drawGround(ctx, width, ground, distance);
  if (screen === 'over' && loaded) {
    const result = resultPresentation(resultsElapsed, resultExitElapsed, reducedMotion);
    ctx.save(); ctx.globalAlpha = result.cardOpacity; ctx.translate(0, result.cardY);
    drawSprite(ctx, 'over', width / 2 - 102, center - 102);
    const x = width / 2 - 113, y = center - 20;
    drawSprite(ctx, 'scorePanel', x - 6, y - 2);
    const medal = finalScore >= 40 ? 'platinum' : finalScore >= 30 ? 'gold' : finalScore >= 20 ? 'silver' : finalScore >= 10 ? 'bronze' : null;
    if (medal) {
      ctx.save(); ctx.globalAlpha *= result.medalOpacity;
      drawSprite(ctx, medal, x + 26 + 22 * (1 - result.medalScale), y + 42 + 22 * (1 - result.medalScale), result.medalScale);
      ctx.restore();
    }
    drawNumber(ctx, finalScore, x + 210, y + 35, .5, 'right');
    drawNumber(ctx, best, x + 210, y + 77, .5, 'right');
    if (newBest) drawSprite(ctx, 'new', x + 129, y + 78);
    ctx.restore();
  }
  if (impact) {
    ctx.save(); ctx.fillStyle = '#fff'; ctx.globalAlpha = impactPresentation(impact.elapsed, impact.startingAngle, reducedMotion).flash;
    ctx.fillRect(0, 0, width, game.height); ctx.restore();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function initializeAssets() {
  loadAssets().then(() => { loaded = true; updateControls(); paintControls(); }).catch(error => console.error(error));
}
initializeAssets();
