import { Game, SKINS, viewportLayout } from './engine.mjs';
import { loadAssets, drawSprite, drawBird, drawBackground, drawGround, drawPipe, drawNumber, drawPanel, drawButton, createSoundBank } from './assets.mjs';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d'), ui = $('game-ui');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sounds = createSoundBank();
let user = null, guest = { best: 0, flights: 0, skin: 'classic' }, sound = true;
try { guest = { ...guest, ...JSON.parse(localStorage.getItem('flabby-guest') || '{}') }; sound = localStorage.getItem('flabby-sound') !== 'off'; } catch {}
let skin = SKINS[0], screen = 'home', loaded = false, view;
let clock = 0, previous = 0, idleDistance = 0, saving = false, runOwner = null;
let runPromise = Promise.resolve(null), finalScore = 0, finalBest = 0, newBest = false;
let menuOpen = false, menuPage = 'menu', resumeAfterMenu = false, returnFocus;
let boardVersion = 0, period = 'weekly', authMode = 'login', toastTimer;

async function api(path, body) {
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
  } catch { throw new Error('Server unavailable. Guest progress is saved on this device.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function persistGuest() { try { localStorage.setItem('flabby-guest', JSON.stringify(guest)); } catch {} }
function best() { return user ? user.best : Number(guest.best) || 0; }
function syncProfile() { skin = SKINS.find(s => s.id === (user?.skin || guest.skin)) || SKINS[0]; }
function tone(kind) { if (sound) sounds.play(kind); }
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true, 4000);
}
const game = new Game({ onEvent(type, data) {
  if (['flap', 'score', 'hit'].includes(type)) tone(type);
  if (type === 'hit') updateHealth();
  if (type === 'score') $('score-announcement').textContent = `Score ${data.score}`;
  if (type === 'power') tone('swoosh');
  if (type === 'over') finish(data);
} });

function updateHealth() {
  $('health-value').textContent = game.health;
  $('health').classList.toggle('last-life', game.health === 1);
}
function updateScreens() {
  $('home-buttons').hidden = screen !== 'home';
  $('over-buttons').hidden = screen !== 'over';
  $('save-status').hidden = screen !== 'over';
  $('health').hidden = !['playing', 'paused'].includes(game.state);
  $('menu-button').hidden = !loaded;
}
function resize() {
  const rect = $('game-frame').getBoundingClientRect();
  const next = viewportLayout(rect.width, rect.height);
  if (view && Math.abs(view.width - next.width) < .1 && Math.abs(view.height - next.height) < .1 && view.pixelsWide === rect.width && view.pixelsHigh === rect.height) return;
  if (game.state === 'playing') openMenu('menu');
  view = { ...next, dpr: Math.min(devicePixelRatio || 1, 3), pixelsWide: rect.width, pixelsHigh: rect.height };
  canvas.width = Math.round(rect.width * view.dpr); canvas.height = Math.round(rect.height * view.dpr);
  game.resize(view.width, view.height);
  ui.style.width = `${view.width}px`; ui.style.height = `${view.height}px`; ui.style.transform = `scale(${view.scale})`;
  ui.style.setProperty('--buttons-y', `${game.ground - 86}px`);
  ui.style.setProperty('--save-y', `${game.ground - 18}px`);
  ui.style.setProperty('--power-y', `${game.ground - 25}px`);
  paintControls();
}
new ResizeObserver(resize).observe($('game-frame'));
resize();

function prepareRun() {
  if (!loaded || saving) return;
  resumeAfterMenu = false; closeMenu(); game.reset(); screen = 'ready';
  $('save-status').textContent = ''; $('score-announcement').textContent = 'Score 0';
  updateHealth(); updateScreens(); tone('swoosh'); canvas.focus({ preventScroll: true });
}
function startRun() {
  if (screen !== 'ready' || !loaded) return;
  runOwner = user?.id || null;
  runPromise = user ? api('runs', {}).then(data => data.token).catch(error => { toast(error.message); return null; }) : Promise.resolve(null);
  game.start(); screen = 'playing'; updateHealth(); updateScreens();
}
async function finish({ score }) {
  tone('over'); screen = 'over';
  const oldBest = best(); finalScore = score; finalBest = Math.max(oldBest, score); newBest = score > oldBest;
  guest.best = Math.max(Number(guest.best) || 0, score); guest.flights = (Number(guest.flights) || 0) + 1; persistGuest();
  $('save-status').textContent = user && user.id === runOwner ? 'Saving...' : 'Saved on this device';
  updateScreens();
  if (user && user.id === runOwner) {
    saving = true; $('retry-button').disabled = true;
    try {
      const token = await runPromise;
      if (!token) throw new Error('Saved locally. Account score was not submitted.');
      const result = await api('scores', { token, score }); user = result.user; syncProfile();
      $('save-status').textContent = 'Score saved';
    } catch (error) { $('save-status').textContent = error.message; }
    finally { saving = false; $('retry-button').disabled = false; }
  }
  syncProfile();
}
function flap() {
  if (menuOpen || !loaded) return;
  if (screen === 'home') prepareRun();
  else if (screen === 'ready') startRun();
  else if (game.state === 'playing') game.flap();
}
$('play-button').addEventListener('click', prepareRun);
$('retry-button').addEventListener('click', prepareRun);
$('menu-button').addEventListener('click', () => openMenu('menu'));
$('close-menu').addEventListener('click', closeMenu);
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => openMenu(button.dataset.page)));
canvas.addEventListener('pointerdown', event => { event.preventDefault(); flap(); });
document.addEventListener('keydown', event => {
  if (menuOpen) {
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    if (event.key === 'Tab') {
      const focusable = [...$('menu-panel').querySelectorAll('button:not(:disabled),input')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $('menu-panel'))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); openMenu('menu'); return; }
  if (['Space', 'ArrowUp', 'Enter'].includes(event.code) && !event.target.closest('button,a')) {
    event.preventDefault(); if (!event.repeat) flap();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') openMenu('menu'); });
window.addEventListener('blur', () => { if (game.state === 'playing') openMenu('menu'); });

function paintControls() {
  if (!loaded) return;
  document.querySelectorAll('[data-sprite]').forEach(c => { const context = c.getContext('2d'); context.clearRect(0, 0, c.width, c.height); drawSprite(context, c.dataset.sprite, 0, 0); });
  document.querySelectorAll('.pixel-button').forEach(button => {
    const c = button.querySelector('canvas'); if (!c || !button.offsetWidth) return;
    c.width = button.offsetWidth; c.height = button.offsetHeight; drawButton(c.getContext('2d'), c.width, c.height);
  });
  if (menuOpen) {
    const c = $('panel-background'); c.width = $('menu-panel').offsetWidth; c.height = $('menu-panel').offsetHeight;
    drawPanel(c.getContext('2d'), c.width, c.height);
  }
}
new ResizeObserver(paintControls).observe($('menu-panel'));

function frame(time) {
  const dt = Math.min((time - previous) / 1000 || .016, .035); previous = time;
  const frozen = game.state === 'paused' || menuOpen;
  if (!frozen) clock += dt;
  if (!frozen && ['home', 'ready'].includes(screen) && !reducedMotion) idleDistance += dt * 18;
  game.update(dt);
  const distance = ['home', 'ready'].includes(screen) ? idleDistance : game.distance;
  const ground = game.ground, width = game.width, center = ground / 2;
  const factor = view.scale * view.dpr;
  ctx.setTransform(factor, 0, 0, factor, 0, 0); ctx.imageSmoothingEnabled = false;
  drawBackground(ctx, width, game.height, ground, distance, Math.floor(game.score / 30) % 2 === 1);
  for (const pipe of game.pipes) {
    drawPipe(ctx, pipe.x, 0, pipe.width, pipe.center - pipe.gap / 2, true, pipe.hit ? .6 : 1);
    drawPipe(ctx, pipe.x, pipe.center + pipe.gap / 2, pipe.width, ground - pipe.center - pipe.gap / 2, false, pipe.hit ? .6 : 1);
  }
  for (const item of game.pickups) {
    drawSprite(ctx, item.type === 'snail' ? 'silver' : 'gold', item.x - 11, item.y - 11, .5);
  }
  if (loaded) {
    const wing = Math.sin(clock * (game.state === 'playing' ? 19 : 7));
    if (screen === 'home') {
      drawSprite(ctx, 'title', width / 2 - 89, center - 100);
      drawBird(ctx, width / 2, center - 8 + (reducedMotion ? 0 : Math.sin(clock * 3) * 4), skin, wing);
    } else if (screen === 'ready') {
      drawSprite(ctx, 'ready', width / 2 - 92, center - 110);
      drawSprite(ctx, 'tutorial', width / 2 - 56, center - 36);
      drawBird(ctx, game.bird.x, game.bird.y + (reducedMotion ? 0 : Math.sin(clock * 3) * 3), skin, wing);
    } else {
      const alpha = game.invincible > 0 && Math.floor(clock * 12) % 2 ? .4 : game.active === 'cloak' ? .5 : 1;
      drawBird(ctx, game.bird.x, screen === 'over' ? ground - 13 : game.bird.y, skin, screen === 'over' ? 0 : wing,
        screen === 'over' ? 1.3 : Math.max(-.3, Math.min(1.4, game.bird.vy * .003)), alpha);
      if (screen !== 'over') drawNumber(ctx, game.score, width / 2, 48);
    }
  }
  drawGround(ctx, width, ground, distance);
  if (screen === 'over' && loaded) {
    drawSprite(ctx, 'over', width / 2 - 96, center - 100);
    const x = width / 2 - 113, y = center - 20;
    drawSprite(ctx, 'scorePanel', x, y);
    const medal = finalScore >= 40 ? 'platinum' : finalScore >= 30 ? 'gold' : finalScore >= 20 ? 'silver' : finalScore >= 10 ? 'bronze' : null;
    if (medal) drawSprite(ctx, medal, x + 26, y + 42);
    drawNumber(ctx, finalScore, x + 210, y + 35, .5, 'right');
    drawNumber(ctx, finalBest, x + 210, y + 77, .5, 'right');
    if (newBest) drawSprite(ctx, 'new', x + 129, y + 78, .5);
  }
  $('power-status').hidden = !game.active || !['playing', 'paused'].includes(game.state);
  if (game.active) $('power-status').textContent = `${game.active.toUpperCase()} ${Math.ceil(game.powerLeft)}s`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function button(label, id, extra = '') { return `<button class="pixel-button ${extra}" ${id ? `id="${id}"` : ''}><canvas aria-hidden="true"></canvas><span>${label}</span></button>`; }
function backButton() { return button('BACK', 'back-button', 'menu-back'); }
function renderPage(title, html) {
  boardVersion++; $('menu-title').textContent = title; $('menu-content').innerHTML = html;
  $('back-button')?.addEventListener('click', () => showPage('menu'));
  paintControls();
}
function openMenu(page) {
  if (!loaded) return;
  if (!menuOpen) {
    returnFocus = document.activeElement; resumeAfterMenu = game.state === 'playing';
    if (resumeAfterMenu) game.pause();
    menuOpen = true; $('menu-overlay').hidden = false;
    $('menu-button').inert = true; $('home-buttons').inert = true; $('over-buttons').inert = true;
    canvas.tabIndex = -1; updateScreens();
  }
  showPage(page); $('menu-panel').focus({ preventScroll: true });
}
function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false; boardVersion++; $('menu-overlay').hidden = true;
  $('menu-button').inert = false; $('home-buttons').inert = false; $('over-buttons').inert = false; canvas.tabIndex = 0;
  if (resumeAfterMenu && game.state === 'paused') game.resume();
  resumeAfterMenu = false; updateScreens();
  const target = returnFocus?.isConnected && !returnFocus.closest('[hidden]') ? returnFocus : canvas;
  target.focus({ preventScroll: true });
}
function showPage(page) {
  menuPage = page;
  if (page === 'menu') renderMenu();
  else if (page === 'leaderboard') { period = 'weekly'; renderBoard(); }
  else if (page === 'birds') renderBirds();
  else if (page === 'account') { authMode = 'login'; renderAccount(); }
  else if (page === 'settings') renderSettings();
  else if (page === 'help') renderHelp();
}
function renderMenu() {
  const active = game.state === 'paused';
  renderPage('MENU', `<div class="menu-grid">${button(active ? 'RESUME' : 'PLAY', 'menu-play', 'wide')}${button('LEADERBOARD', 'menu-leaderboard', 'wide')}${button('BIRDS', 'menu-birds')}${button('ACCOUNT', 'menu-account')}${button('SETTINGS', 'menu-settings')}${button('HOW TO PLAY', 'menu-help')}${active ? button('END RUN', 'menu-end', 'wide') : screen !== 'home' ? button('TITLE SCREEN', 'menu-home', 'wide') : ''}</div><p class="menu-caption">${user ? escapeHTML(user.name) : 'GUEST'} &nbsp; BEST ${best()}</p>`);
  $('menu-play').addEventListener('click', () => active ? closeMenu() : prepareRun());
  for (const page of ['leaderboard', 'birds', 'account', 'settings', 'help']) $(`menu-${page}`).addEventListener('click', () => showPage(page));
  $('menu-end')?.addEventListener('click', () => { resumeAfterMenu = false; closeMenu(); game.end(); });
  $('menu-home')?.addEventListener('click', () => { closeMenu(); game.reset(); screen = 'home'; updateScreens(); });
}
async function renderBoard() {
  renderPage('LEADERBOARD', `<div class="tabs"><button class="pixel-button" data-period="weekly" aria-pressed="${period === 'weekly'}"><canvas aria-hidden="true"></canvas><span>THIS WEEK</span></button><button class="pixel-button" data-period="all" aria-pressed="${period === 'all'}"><canvas aria-hidden="true"></canvas><span>ALL TIME</span></button></div><div id="board-body" aria-live="polite"><p class="empty-state">Loading...</p></div>${backButton()}`);
  const version = boardVersion;
  document.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { period = b.dataset.period; renderBoard(); }));
  try {
    const data = await api(`leaderboard?period=${period}`); if (!menuOpen || version !== boardVersion) return;
    $('board-body').innerHTML = data.entries.length ? `<table class="leaderboard-table"><thead><tr><th>#</th><th>PLAYER</th><th>SCORE</th></tr></thead><tbody>${data.entries.map(e => `<tr class="${e.you ? 'you' : ''}"><td>${e.rank}</td><td>${escapeHTML(e.name)}</td><td>${e.score}</td></tr>`).join('')}</tbody></table>` : '<p class="empty-state">No scores yet.</p>';
    $('board-body').insertAdjacentHTML('beforeend', `<p class="reset-line">${period === 'weekly' ? `Resets ${escapeHTML(new Date(data.resets).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} at 00:00 UTC.<br>Top 10 receive a weekly badge.` : 'Best score per player.'}</p>`);
    paintControls();
  } catch (error) {
    if (!menuOpen || version !== boardVersion) return;
    $('board-body').innerHTML = `<p>${escapeHTML(error.message)}</p>${button('RETRY', 'retry-board')}`;
    $('retry-board').addEventListener('click', renderBoard); paintControls();
  }
}
function renderBirds() {
  renderPage('BIRDS', `<div class="bird-list">${SKINS.map(s => `<div class="bird-card"><canvas class="preview" width="34" height="24" data-bird="${s.id}" aria-hidden="true"></canvas><div><strong>${s.name}</strong><small>${best() < s.threshold ? `Score ${s.threshold} to unlock` : skin.id === s.id ? 'Selected' : 'Unlocked'}</small></div><button class="pixel-button" data-skin="${s.id}" ${best() < s.threshold || skin.id === s.id ? 'disabled' : ''}><canvas aria-hidden="true"></canvas><span>${skin.id === s.id ? 'ON' : best() < s.threshold ? 'LOCKED' : 'USE'}</span></button></div>`).join('')}</div><p class="menu-caption">BEST ${best()}</p>${backButton()}`);
  document.querySelectorAll('[data-bird]').forEach(c => drawBird(c.getContext('2d'), 17, 12, SKINS.find(s => s.id === c.dataset.bird)));
  document.querySelectorAll('[data-skin]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      if (user) user = (await api('skin', { skin: b.dataset.skin })).user;
      else { guest.skin = b.dataset.skin; persistGuest(); }
      syncProfile(); if (menuOpen && menuPage === 'birds') renderBirds();
    } catch (error) { toast(error.message); b.disabled = false; }
  }));
}
function renderAccount() {
  if (user) {
    renderPage('ACCOUNT', `<p>${escapeHTML(user.name)}</p><div class="profile-stats"><div><strong>${user.best}</strong><span>BEST</span></div><div><strong>${user.weekly}</strong><span>WEEKLY</span></div><div><strong>${user.flights}</strong><span>RUNS</span></div></div><p>WEEKLY BADGES</p>${user.rewards.length ? user.rewards.slice(0, 4).map(r => `<span class="badge">#${r.rank} &middot; ${escapeHTML(r.week)}</span>`).join('') : '<p>No badges yet.</p>'}${button('SIGN OUT', 'signout')}<p class="menu-caption">${user.rewards.length > 4 ? `${user.rewards.length} badges total. Showing latest 4.` : ''}</p>${backButton()}`);
    $('signout').addEventListener('click', async () => { try { await api('logout', {}); user = null; syncProfile(); if (menuOpen && menuPage === 'account') renderAccount(); } catch (error) { toast(error.message); } }); return;
  }
  const register = authMode === 'register';
  renderPage(register ? 'CREATE ACCOUNT' : 'SIGN IN', `<form id="auth-form" class="form-grid"><label>PLAYER NAME<input name="name" autocomplete="username" required minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" title="3–18 letters, numbers, or underscores"></label><label>PASSWORD<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="8" maxlength="128" placeholder="8+ characters"></label><p class="form-error" id="auth-error" role="alert"></p><button class="pixel-button" type="submit"><canvas aria-hidden="true"></canvas><span>${register ? 'CREATE ACCOUNT' : 'SIGN IN'}</span></button></form><div class="auth-toggle"><button class="link-button" id="auth-toggle">${register ? 'Sign in instead' : 'Create an account'}</button></div><p class="menu-caption">Only signed-in runs enter the leaderboard.</p>${backButton()}`);
  $('auth-toggle').addEventListener('click', () => { authMode = register ? 'login' : 'register'; renderAccount(); });
  $('auth-form').addEventListener('submit', async event => {
    event.preventDefault(); const submit = event.target.querySelector('[type=submit]'); submit.disabled = true;
    const form = new FormData(event.target), errorElement = $('auth-error'); errorElement.textContent = '';
    try {
      user = (await api(register ? 'register' : 'login', { name: form.get('name'), password: form.get('password') })).user;
      syncProfile(); if (menuOpen && menuPage === 'account') renderAccount();
    } catch (error) { errorElement.textContent = error.message; submit.disabled = false; paintControls(); }
  });
}
function renderSettings() {
  renderPage('SETTINGS', `<div class="settings-row"><span>SOUND</span>${button(sound ? 'ON' : 'OFF', 'toggle-sound')}</div>${backButton()}`);
  $('toggle-sound').addEventListener('click', () => { sound = !sound; try { localStorage.setItem('flabby-sound', sound ? 'on' : 'off'); } catch {} if (!sound) sounds.stop(); else tone('score'); renderSettings(); });
}
function renderHelp() {
  renderPage('HOW TO PLAY', `<ul class="help-list"><li>Tap, Space, or Up to flap.</li><li>P or Escape opens the menu and pauses.</li><li>Two lives. After a hit, you have 2 seconds of protection.</li><li>Silver medal: snail, slower pipes for 7 seconds.</li><li>Gold medal: cloak, pass through pipes for 6 seconds. Ground still causes damage.</li><li>Speed increases every 10 points.</li></ul><p class="menu-caption">Flappy Bird: Dong Nguyen / .GEARS.<br>Original sounds via noanonoa/flappy-bird.</p>${backButton()}`);
}

syncProfile(); updateScreens();
loadAssets().then(() => { loaded = true; $('loading-status').hidden = true; updateScreens(); paintControls(); }).catch(error => { $('loading-status').textContent = `${error.message} Reload to retry.`; });
api('me').then(data => { user = data.user; syncProfile(); if (menuOpen) showPage(menuPage); }).catch(() => {});
