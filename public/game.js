import { Game, difficulty, SKINS } from './engine.mjs';
import { loadAssets, drawBird, drawBackground, drawGround, drawPipe as drawAssetPipe, createSoundBank } from './assets.mjs';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let user = null, serviceOnline = true, guest = { best: 0, flights: 0, skin: 'classic' };
try { guest = { ...guest, ...JSON.parse(localStorage.getItem('flabby-guest') || '{}') }; } catch {}
let sound = true;
try { sound = localStorage.getItem('flabby-sound') !== 'off'; } catch {}
let audio, clock = 0, previous = 0, idleDistance = 0, shake = 0, noteTimer, toastTimer;
let runPromise = Promise.resolve(null), saving = false, modalPaused = false, period = 'weekly', authMode = 'login', boardRequest = 0;
let skin = SKINS.find(s => s.id === guest.skin) || SKINS[0];
const particles = [];
const soundBank = createSoundBank();
loadAssets().then(() => {
  if ($('modal').open && document.querySelector('.skin-grid')) renderWardrobe();
}).catch(() => toast('Some sprites could not load. Refresh to try again.'));

async function api(path, body) {
  let response;
  try {
    response = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  } catch { throw new Error('The game server is unavailable. Your flight is still saved on this device.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Please try again.');
  return data;
}
function localSave() { try { localStorage.setItem('flabby-guest', JSON.stringify(guest)); } catch {} }
function best() { return user ? user.best : Number(guest.best) || 0; }
function syncProfile() {
  $('account-label').textContent = user?.name || 'Sign in';
  $('best-score').textContent = best();
  skin = SKINS.find(s => s.id === (user?.skin || guest.skin)) || SKINS[0];
}
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4000); }
function note(message) { $('flight-note').textContent = message; clearTimeout(noteTimer); noteTimer = setTimeout(() => $('flight-note').textContent = '', 2100); }
function tone(kind) {
  if (!sound) return;
  if (soundBank.play(kind)) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const notes = { flap: [450, 220, .055, .025], score: [700, 1100, .09, .04], hit: [160, 65, .18, .06], power: [540, 1250, .3, .045], over: [240, 90, .4, .05] }[kind];
    if (!notes) return;
    const [start, end, duration, volume] = notes, osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = kind === 'hit' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(start, audio.currentTime); osc.frequency.exponentialRampToValueAtTime(end, audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
  } catch {}
}
function burst(x, y, color, count = 12) {
  if (reducedMotion) return;
  for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 180, vy: (Math.random() - .5) * 180, life: .7, color });
}
const game = new Game({ onEvent(type, data) {
  if (type === 'flap') tone('flap');
  if (type === 'score') { $('score').textContent = data.score; tone('score'); }
  if (type === 'hit') {
    $('heart').classList.toggle('half', data.health === 1); $('heart').setAttribute('aria-label', `${data.health} health remaining`); $('health-text').textContent = `${data.health} / 2`;
    tone('hit'); shake = reducedMotion ? 0 : .3; burst(game.bird.x, game.bird.y, '#e8866a'); if (data.health) note('One heart. Plenty of courage.');
  }
  if (type === 'power') { tone('power'); burst(game.bird.x, game.bird.y, data.type === 'snail' ? '#ddbe6a' : '#c0a4df'); note(data.type === 'snail' ? 'SNAIL TIME · Take it slow' : 'CLOAK ON · Fly right through'); }
  if (type === 'level') { $('level-chip').textContent = `LEVEL ${String(data.level).padStart(2, '0')}`; note(`LEVEL ${data.level} · Finding your wings`); }
  if (type === 'over') finish(data);
} });

function sizeGame() {
  if (['playing', 'paused'].includes(game.state)) return;
  const narrow = window.innerWidth <= 700;
  const rect = canvas.getBoundingClientRect();
  canvas.width = narrow ? 480 : 1100;
  canvas.height = Math.round(canvas.width * rect.height / rect.width);
  game.width = canvas.width; game.height = canvas.height; game.reset();
}
sizeGame();
new ResizeObserver(() => { if (['ready', 'over'].includes(game.state)) sizeGame(); }).observe($('game-frame'));

async function start() {
  if (saving) return;
  if ($('modal').open) closeModal();
  sizeGame(); game.start(); particles.length = 0;
  tone('swoosh');
  $('intro').hidden = true; $('gameover').hidden = true; $('pause-screen').hidden = true;
  $('score').textContent = '0'; $('level-chip').textContent = 'LEVEL 01'; $('heart').classList.remove('half'); $('heart').setAttribute('aria-label', '2 health remaining'); $('health-text').textContent = '2 / 2';
  $('flight-note').textContent = ''; clearTimeout(noteTimer);
  $('pause-button').setAttribute('aria-label', 'Pause game');
  runPromise = user ? api('runs', {}).then(r => r.token).catch(error => { toast(error.message); return null; }) : Promise.resolve(null);
  canvas.focus({ preventScroll: true });
}
async function finish({ score }) {
  tone('over'); clearTimeout(noteTimer); $('flight-note').textContent = '';
  const oldBest = best(); guest.best = Math.max(Number(guest.best) || 0, score); guest.flights = (Number(guest.flights) || 0) + 1; localSave();
  $('final-score').textContent = score; $('final-best').textContent = Math.max(oldBest, score);
  $('result-eyebrow').textContent = score > oldBest ? 'A NEW PERSONAL BEST. LOOK AT YOU FLY.' : 'EVERY FLIGHT IS A FRESH START';
  $('gameover').hidden = false; $('power-indicator').hidden = true;
  if (user) {
    saving = true; $('retry-button').disabled = true; $('save-status').textContent = 'Saving your flight…';
    try {
      const token = await runPromise;
      if (!token) throw new Error('Saved on this device. Account score could not be submitted.');
      const result = await api('scores', { token, score }); user = result.user; syncProfile(); $('save-status').textContent = 'Flight saved. Your next best is waiting.';
    } catch (error) { $('save-status').textContent = error.message; }
    finally { saving = false; $('retry-button').disabled = false; }
  } else { $('save-status').textContent = 'Saved on this device. Sign in for the leaderboard.'; syncProfile(); }
  const unlocked = SKINS.find(s => s.threshold > oldBest && s.threshold <= score);
  if (unlocked) toast(`New outfit unlocked: ${unlocked.name}. Find it in your wardrobe.`);
}
function pause() {
  if (game.state === 'playing') { game.pause(); $('pause-screen').hidden = false; $('pause-button').setAttribute('aria-label', 'Resume game'); }
  else if (game.state === 'paused' && !$('modal').open) resume();
}
function resume() { game.resume(); $('pause-screen').hidden = true; $('pause-button').setAttribute('aria-label', 'Pause game'); canvas.focus({ preventScroll: true }); }
$('play-button').addEventListener('click', start); $('retry-button').addEventListener('click', start);
$('pause-button').addEventListener('click', pause); $('resume-button').addEventListener('click', resume);
$('quit-button').addEventListener('click', () => { $('pause-screen').hidden = true; game.end(); });
canvas.addEventListener('pointerdown', e => { e.preventDefault(); if (game.state === 'playing') game.flap(); });
document.addEventListener('keydown', e => {
  if ($('modal').open || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (['Space', 'ArrowUp', 'Enter'].includes(e.code)) {
    // Preserve normal keyboard activation of focused UI controls.
    if (e.target.closest('button,a') && game.state !== 'playing') return;
    e.preventDefault(); if (e.repeat) return;
    if (game.state === 'ready' || game.state === 'over') start(); else if (game.state === 'paused') resume(); else game.flap();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); pause(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') pause(); });
window.addEventListener('blur', () => { if (game.state === 'playing') pause(); });
function soundUI() { $('sound-button').classList.toggle('muted', !sound); $('sound-button').setAttribute('aria-label', `Turn sound ${sound ? 'off' : 'on'}`); }
$('sound-button').addEventListener('click', () => { sound = !sound; try { localStorage.setItem('flabby-sound', sound ? 'on' : 'off'); } catch {} soundUI(); if (sound) tone('score'); else soundBank.stop(); }); soundUI();

// Use the bundled sprite sheets, with the procedural art as a loading fallback.
function cloud(x, y, scale, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x,y+18*scale); ctx.lineTo(x,y+7*scale);ctx.lineTo(x+13*scale,y+7*scale);ctx.lineTo(x+13*scale,y);ctx.lineTo(x+33*scale,y);ctx.lineTo(x+33*scale,y-8*scale);ctx.lineTo(x+56*scale,y-8*scale);ctx.lineTo(x+56*scale,y);ctx.lineTo(x+72*scale,y);ctx.lineTo(x+72*scale,y+7*scale);ctx.lineTo(x+85*scale,y+7*scale);ctx.lineTo(x+85*scale,y+18*scale);ctx.closePath();ctx.fill();
}
function bush(x,y,r,color) { ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,Math.PI,0);ctx.arc(x+r*1.2,y,r*.8,Math.PI,0);ctx.lineTo(x+r*2,y+15);ctx.lineTo(x-r,y+15);ctx.closePath();ctx.fill(); }
function drawWorld() {
  const w = canvas.width, h = canvas.height, ground = h - 49;
  const dist = game.state === 'ready' || game.state === 'over' ? idleDistance : game.distance;
  const night = Math.floor(game.score / 30) % 2 === 1;
  $('game-frame').classList.toggle('night', night);
  const captions = document.querySelector('.world-caption');
  captions.firstElementChild.textContent = night ? 'AFTER HOURS' : 'THE MEADOWS';
  captions.lastElementChild.textContent = night ? '02 — A LITTLE NIGHT FLIGHT' : '01 — A GOOD DAY TO FLY';
  if (!drawBackground(ctx, w, ground, dist, night)) {
  const advanced = Math.min(.55, Math.floor(game.score / 30) * .15);
  const sky = ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,advanced ? '#a6ccc9' : '#c0e4d9');sky.addColorStop(1,'#edf1c5');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#f7f2cf';ctx.fillRect(w*.78, h*.2, 42,42);ctx.fillStyle='#e8e8bd';ctx.fillRect(w*.78+5,h*.2+42,34,3);
  for(let i=0;i<6;i++){const x=((i*243+60-dist*.065)%(w+260)+(w+260))%(w+260)-100;cloud(x,80+(i%3)*55, i%2 ? .9 : 1.25,'#f4f6dfbb');}
  // Distant stepped hills.
  ctx.fillStyle='#c3d9b5';ctx.beginPath();ctx.moveTo(0,ground);for(let x=-120;x<w+140;x+=20){const yy=ground-90-Math.round((Math.sin((x+dist*.08)*.009)+Math.sin(x*.017)*.35)*35/8)*8;ctx.lineTo(x,yy);}ctx.lineTo(w,ground);ctx.closePath();ctx.fill();
  const cityOffset = dist*.12%105;
  for(let i=-1;i<w/35+2;i++){const x=i*35-cityOffset, bh=40+((i*13+91)%7)*9;ctx.fillStyle=i%3?'#b1cfa7':'#b8d2ab';ctx.fillRect(x,ground-55-bh,27,bh+55);ctx.fillRect(x+5,ground-60-bh,17,5);ctx.fillStyle='#d6e2bd';for(let yy=ground-45-bh;yy<ground-45;yy+=13){ctx.fillRect(x+6,yy,4,5);ctx.fillRect(x+17,yy,4,5);}}
  for(let i=-1;i<w/125+2;i++) bush(i*125-dist*.2%125,ground-16,36+(i%3)*9,'#99bd86');
  for(let i=-1;i<w/90+2;i++) bush(i*90-dist*.33%90,ground+2,26+(i%2)*9,'#81a970');
  // Decorative birds in the distance.
  ctx.strokeStyle='#7fa694';ctx.lineWidth=2;for(let i=0;i<3;i++){const x=(w*.12+i*20-dist*.02)%w,y=h*.24+(i%2)*11;ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x,y+3);ctx.lineTo(x+4,y);ctx.stroke();}
  }
  if(game.state==='ready'||game.state==='over'){
    drawPipe(w*.075, ground-130, 68, 130, false,.48);drawPipe(w*.84,0,68,h*.23,true,.48);
    if(w>700){drawPipe(w*.84,ground-125,68,125,false,.48);drawPipe(w*.075,0,68,h*.17,true,.36);}
    const bx=w>700?w*.235:w*.17,by=h*(w>700?.51:.54);
    drawBird(ctx,bx,by+(reducedMotion?0:Math.sin(clock*2.5)*8),w>700?3.5:2.6,skin,Math.sin(clock*9),-.08);
    if(w>700){ctx.fillStyle='#fff4b9';for(let i=0;i<3;i++)ctx.fillRect(bx-45-i*14,by+8+i*4,5,3);}
  }
  // Grass and the checkered dirt runway.
  if (!drawGround(ctx, w, ground, dist)) {
  ctx.fillStyle='#5f8f50';ctx.fillRect(0,ground,w,4);ctx.fillStyle='#bdd388';ctx.fillRect(0,ground+4,w,11);ctx.fillStyle='#d5e4a5';ctx.fillRect(0,ground+5,w,3);
  ctx.fillStyle='#87ac5d';for(let x=-20;x<w+20;x+=18){const px=x-dist%18;ctx.fillRect(px,ground+9,9,3);ctx.fillRect(px+9,ground+12,9,3);}
  ctx.fillStyle='#e5dca9';ctx.fillRect(0,ground+15,w,34);ctx.fillStyle='#d9cf98';ctx.fillRect(0,ground+16,w,3);ctx.fillStyle='#cabe87';for(let x=0;x<w;x+=31)ctx.fillRect(x-dist*.4%31,ground+25+(x%3)*3,3,3);
  }
}
function drawPipe(x,y,width,height,up=false,alpha=1){
  if (drawAssetPipe(ctx,x,y,width,height,up,alpha)) return;
  if(height<=0)return;ctx.save();ctx.globalAlpha=alpha;
  ctx.fillStyle='#557747';ctx.fillRect(Math.round(x),Math.round(y),width,height);
  ctx.fillStyle='#98bf67';ctx.fillRect(x+3,y+2,width-6,height-2);
  ctx.fillStyle='#c1db86';ctx.fillRect(x+6,y+2,9,height-2);ctx.fillStyle='#adce78';ctx.fillRect(x+15,y+2,8,height-2);ctx.fillStyle='#7a9f54';ctx.fillRect(x+width-12,y+2,9,height-2);
  const cy=up?y+height-22:y;ctx.fillStyle='#4b7042';ctx.fillRect(x-5,cy,width+10,23);ctx.fillStyle='#a3c76e';ctx.fillRect(x-2,cy+3,width+4,16);ctx.fillStyle='#d0e597';ctx.fillRect(x+1,cy+3,width-3,4);ctx.fillStyle='#7f9f54';ctx.fillRect(x+width-9,cy+7,11,12);ctx.restore();
}
function drawPickup(item){
  const y=item.y+Math.sin(clock*4)*5;ctx.save();ctx.translate(item.x,y);ctx.rotate(Math.sin(clock*2)*.08);
  ctx.fillStyle=item.type==='snail'?'#fff1b9':'#e8d9f7';ctx.strokeStyle=item.type==='snail'?'#b99c50':'#9375b5';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-21,-21,42,42,10);ctx.fill();ctx.stroke();
  if(item.type==='snail'){ctx.fillStyle='#7f9d62';ctx.fillRect(-13,7,27,5);ctx.fillRect(10,-3,4,12);ctx.fillRect(14,-8,3,6);ctx.fillStyle='#c6a35d';ctx.beginPath();ctx.arc(-3,1,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8b743f';ctx.beginPath();ctx.arc(-3,1,5,0,Math.PI*1.6);ctx.stroke();}
  else{ctx.fillStyle='#9d7cbd';ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(8,-4);ctx.lineTo(14,13);ctx.lineTo(0,9);ctx.lineTo(-14,13);ctx.lineTo(-8,-4);ctx.closePath();ctx.fill();ctx.fillStyle='#dbc9ed';ctx.fillRect(-4,-7,8,6);ctx.fillStyle='#6d5590';ctx.fillRect(-3,-6,6,4);}
  ctx.restore();
}
function frame(time){
  const dt=Math.min((time-previous)/1000||.016,.035);previous=time;clock+=dt;
  if(game.state==='ready'||game.state==='over')idleDistance+=reducedMotion?0:dt*15;
  game.update(dt);
  ctx.save();if(shake>0){shake-=dt;ctx.translate((Math.random()-.5)*6,(Math.random()-.5)*6);}drawWorld();
  if(['playing','paused'].includes(game.state)){
    for(const p of game.pipes){drawPipe(p.x,0,p.width,p.center-p.gap/2,true,p.hit?.6:1);drawPipe(p.x,p.center+p.gap/2,p.width,canvas.height-49-p.center-p.gap/2,false,p.hit?.6:1);}
    game.pickups.forEach(drawPickup);
    if(game.active==='cloak'){ctx.fillStyle='#d1b7ed44';ctx.beginPath();ctx.arc(game.bird.x,game.bird.y,35+Math.sin(clock*6)*3,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e6d9f2';ctx.lineWidth=2;ctx.stroke();}
    const alpha=game.invincible>0&&Math.floor(clock*12)%2?.4:game.active==='cloak'?.6:1;
    drawBird(ctx,game.bird.x,game.bird.y,2.3,skin,Math.sin(clock*20),Math.max(-.3,Math.min(1,game.bird.vy*.0015)),alpha);
  }
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=120*dt;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,5,5);if(p.life<=0)particles.splice(i,1);}ctx.globalAlpha=1;ctx.restore();
  const active=!!game.active&&['playing','paused'].includes(game.state);$('power-indicator').hidden=!active;
  if(active){$('power-name').textContent=game.active==='snail'?'SNAIL · SLOW & STEADY':'CLOAK · NOTHING IN YOUR WAY';$('power-bar').style.width=`${game.powerLeft/(game.active==='snail'?7:6)*100}%`;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function openModal(type){
  if(!$('modal').open){modalPaused=game.state==='playing';if(modalPaused)game.pause();$('modal').showModal();}
  const content=$('modal-content');content.replaceChildren();
  $('modal-kicker').textContent={help:'THE FLIGHT MANUAL',leaderboard:'THE HIGH FLYERS CLUB',wardrobe:'A LITTLE PERSONALITY',account:'YOUR PILOT PROFILE'}[type]||'FLABBY BIRD';
  if(type==='help'){
    content.innerHTML=`<h2>Small wings. You’ve got this.</h2><p>Keep Flabby in the air, find your rhythm, and fly through the gaps. Every pipe you pass is one more point.</p><div class="manual-grid"><article><h3>Find your flap</h3><p>Press <kbd>SPACE</kbd> or <kbd>↑</kbd>, or tap the game. Press <kbd>P</kbd> to pause. A little tap goes a long way.</p></article><article><h3>A heart with two halves</h3><p>Your first hit costs half a heart. You get two seconds to recover. A second hit ends your flight.</p></article><article><h3>Good things come to birds</h3><p>Collect a snail for 7 seconds of slower pipes. A cloak lets you fly through pipes for 6 seconds. Watch the ground!</p></article><article><h3>Grow into your wings</h3><p>Every 10 points, the world speeds up and pipes spread farther apart. Powerups appear every 8–12 points after your first at 7–9.</p></article></div><p class="notice">Sign in to save scores across visits, unlock outfits, and enter the weekly leaderboard. The top 10 earn a dated badge after each week ends Monday at 00:00 UTC.</p><p>Inspired by Flappy Bird by Dong Nguyen / .GEARS. Sprites and sounds via <a href="https://github.com/noanonoa/flappy-bird" target="_blank" rel="noopener noreferrer">noanonoa/flappy-bird</a>.</p>`;
  }else if(type==='leaderboard'){period='weekly';renderBoard();}
  else if(type==='wardrobe')renderWardrobe();
  else if(type==='account'){authMode='login';renderAccount();}
}
function closeModal(){ $('modal').close(); }
$('close-modal').addEventListener('click',closeModal);
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('modal').addEventListener('close',()=>{boardRequest++;if(modalPaused){resume();modalPaused=false;}});
document.querySelectorAll('[data-dialog]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.dialog)));
$('account-button').addEventListener('click',()=>openModal('account'));
async function renderBoard(){
  const request=++boardRequest;
  $('modal-content').innerHTML=`<h2>A little friendly competition.</h2><p>Big flights deserve a little recognition.</p><div class="tabs"><button data-period="weekly" class="${period==='weekly'?'active':''}">This week</button><button data-period="all" class="${period==='all'?'active':''}">All time</button></div><div id="board-body" aria-live="polite"><p class="empty-state">Finding our high flyers…</p></div>`;
  document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{period=b.dataset.period;renderBoard();}));
  try{
    const data=await api(`leaderboard?period=${period}`);if(request!==boardRequest)return;
    $('board-body').innerHTML=data.entries.length?`<table class="leaderboard-table"><thead><tr><th>RANK</th><th>PILOT</th><th>BEST FLIGHT</th></tr></thead><tbody>${data.entries.map(e=>`<tr class="${e.you?'you':''}"><td>${String(e.rank).padStart(2,'0')}</td><td>${escapeHTML(e.name)}${e.you?' <small>(you)</small>':''}</td><td><strong>${e.score}</strong></td></tr>`).join('')}</tbody></table>`:'<div class="empty-state"><p>No flights on the board yet.<br>The first spot has your name on it.</p><button class="account-btn" id="board-signin" style="margin:15px auto">'+(user?'Ready for takeoff':'Sign in to join')+'</button></div>';
    const reset=new Date(data.resets);const resetLabel=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(reset);
    $('board-body').insertAdjacentHTML('beforeend',`<p class="reset-line">${period==='weekly'?`NEXT RESET · ${escapeHTML(resetLabel)}`:'YOUR BEST FLIGHTS, ALL IN ONE PLACE'}</p><p class="notice">Weekly top 10 earn a dated High Flyer badge for their profile. A new week is a fresh chance.</p>`);
    $('board-signin')?.addEventListener('click',()=>user?closeModal():openModal('account'));
  }catch(error){if(request===boardRequest)$('board-body').innerHTML=`<p class="empty-state">${escapeHTML(error.message)}</p><button class="account-btn" id="retry-board">Try again</button>`;$('retry-board')?.addEventListener('click',renderBoard);}
}
function renderWardrobe(){
  const unlockedBest=best();
  $('modal-content').innerHTML=`<h2>A fresh set of feathers.</h2><p>New personal bests unlock new looks. Same brave bird underneath.</p><div class="skin-grid">${SKINS.map(s=>`<button class="skin-card ${skin.id===s.id?'selected':''}" data-skin="${s.id}" ${unlockedBest<s.threshold?'disabled':''} aria-label="${s.name}${unlockedBest<s.threshold?`, unlock at ${s.threshold} points`:skin.id===s.id?', selected':''}"><canvas width="110" height="65" aria-hidden="true"></canvas><strong>${s.name}</strong><small>${unlockedBest<s.threshold?`Unlock at ${s.threshold} points`:skin.id===s.id?'Wearing it well':'Ready to wear'}</small></button>`).join('')}</div><p class="notice">Your best flight: ${unlockedBest} points. ${user?'Your outfits are saved to your account.':'Guest outfits are saved on this device. Account outfits unlock from signed-in flights.'}</p>`;
  document.querySelectorAll('[data-skin]').forEach(b=>{
    const s=SKINS.find(s=>s.id===b.dataset.skin),c=b.querySelector('canvas');drawBird(c.getContext('2d'),55,32,3.2,s);
    b.addEventListener('click',async()=>{b.disabled=true;try{if(user){const data=await api('skin',{skin:s.id});user=data.user;}else{guest.skin=s.id;localSave();}syncProfile();renderWardrobe();}catch(error){toast(error.message);b.disabled=false;}});
  });
}
function renderAccount(){
  const content=$('modal-content');
  if(user){
    content.innerHTML=`<h2>Hey, ${escapeHTML(user.name)}.</h2><p>A little progress with every flight.</p><div class="profile-stats"><div><strong>${user.best}</strong><span>PERSONAL BEST</span></div><div><strong>${user.weekly}</strong><span>THIS WEEK</span></div><div><strong>${user.flights}</strong><span>FLIGHTS</span></div></div><h3 style="font-size:13px">Your trophy shelf</h3>${user.rewards.length?user.rewards.map(r=>`<span class="badge">HIGH FLYER #${r.rank} · ${escapeHTML(r.week)}</span>`).join(''):'<p>No badges yet. Finish in the weekly top 10 to earn your first.</p>'}<button class="account-btn" id="signout" style="margin-top:20px">Sign out</button>`;
    $('signout').addEventListener('click',async()=>{try{await api('logout',{});user=null;syncProfile();renderAccount();toast('Signed out. Keep those wings warm.');}catch(error){toast(error.message);}});return;
  }
  const registering=authMode==='register';
  content.innerHTML=`<h2>${registering?'Your next adventure starts here.':'Welcome back, high flyer.'}</h2><p>Save your scores, collect outfits, and make a little name for yourself.</p><form class="auth-form" id="auth-form"><label>Pilot name<input name="name" autocomplete="username" required minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" placeholder="Your pilot name" title="3–18 letters, numbers, or underscores"></label><label>Password<input name="password" type="password" autocomplete="${registering?'new-password':'current-password'}" required minlength="8" maxlength="128" placeholder="At least 8 characters"></label><p class="form-error" id="auth-error" role="alert"></p><button class="play-btn" type="submit">${registering?'CREATE ACCOUNT':'SIGN IN'}</button></form><div class="auth-toggle">${registering?'Already part of the flock?':'New around here?'} <button id="auth-toggle">${registering?'Sign in':'Create an account'}</button></div><p class="notice">Guest scores stay on this device. Only flights played while signed in count toward account unlocks and the leaderboard.</p>`;
  $('auth-toggle').addEventListener('click',()=>{authMode=registering?'login':'register';renderAccount();});
  $('auth-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.target.querySelector('button[type="submit"]');button.disabled=true;$('auth-error').textContent='';
    const form=new FormData(e.target);
    try{const data=await api(registering?'register':'login',{name:form.get('name'),password:form.get('password')});user=data.user;serviceOnline=true;syncProfile();renderAccount();toast(registering?'Welcome to the flock. Your first flight is waiting.':'Good to see you. Let’s fly.');}
    catch(error){if($('auth-error'))$('auth-error').textContent=error.message;button.disabled=false;}
  });
}
syncProfile();
api('me').then(data=>{user=data.user;syncProfile();}).catch(()=>{serviceOnline=false;});
