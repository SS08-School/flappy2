export const SKINS = [
  { id: 'classic', name: 'Sunny side', color: '#ffd15c', shade: '#e7a744', threshold: 0 },
  { id: 'mint', name: 'Mint condition', color: '#a9dfb2', shade: '#64ad8e', threshold: 10 },
  { id: 'rose', name: 'Berry brave', color: '#efa9aa', shade: '#ce718b', threshold: 25 },
  { id: 'blue', name: 'Blue sky', color: '#95cce9', shade: '#6495c8', threshold: 50 },
  { id: 'lavender', name: 'Night owl', color: '#c5ade4', shade: '#947ab7', threshold: 100 },
  { id: 'gold', name: 'Golden hour', color: '#ffe993', shade: '#d2a238', threshold: 200 },
];
export function difficulty(score) {
  const level = Math.floor(score / 10);
  return { level: level + 1, speed: Math.min(340, 155 + level * 17), spacing: Math.min(440, 280 + level * 15), gap: Math.max(180, 225 - level * 4), gravity: Math.min(1250, 970 + level * 20), flap: -Math.min(420, 340 + level * 8) };
}

export class Game {
  constructor({ width = 1100, height = 620, random = Math.random, onEvent = () => {} } = {}) {
    this.width = width; this.height = height; this.random = random; this.onEvent = onEvent;
    this.reset();
  }
  reset() {
    this.state = 'ready'; this.score = 0; this.health = 2; this.elapsed = 0; this.distance = 0;
    this.bird = { x: this.width * .29, y: this.height * .45, vy: 0, radius: 14 };
    this.pipes = []; this.pickups = []; this.invincible = 0; this.active = null; this.powerLeft = 0;
    this.nextPowerScore = 7 + Math.floor(this.random() * 3); this.powerCount = 0;
    this.spawnX = this.width * .85; this.lastLevel = 1;
  }
  start() { this.reset(); this.state = 'playing'; this.flap(); }
  flap() { if (this.state === 'playing') { this.bird.vy = difficulty(this.score).flap; this.onEvent('flap'); } }
  pause() { if (this.state === 'playing') { this.state = 'paused'; return true; } return false; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }
  end() { if (this.state !== 'over') { this.state = 'over'; this.onEvent('over', { score: this.score, elapsed: this.elapsed }); } }
  hit(pipe) {
    if (this.invincible > 0 || this.active === 'cloak') return;
    this.health--; this.invincible = 2;
    if (pipe) pipe.hit = true;
    this.bird.vy = -190;
    this.bird.y = Math.max(32, Math.min(this.height - 87, this.bird.y));
    this.onEvent('hit', { health: this.health });
    if (!this.health) this.end();
  }
  activate(type) {
    this.active = type; this.powerLeft = type === 'snail' ? 7 : 6; this.powerCount++;
    this.onEvent('power', { type, duration: this.powerLeft });
  }
  update(dt) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, .035); this.elapsed += dt;
    const d = difficulty(this.score), ground = this.height - 49;
    this.invincible = Math.max(0, this.invincible - dt);
    if (this.active) { this.powerLeft -= dt; if (this.powerLeft <= 0) { this.active = null; this.powerLeft = 0; this.onEvent('powerEnd'); } }
    const speed = d.speed * (this.active === 'snail' ? .6 : 1);
    this.distance += speed * dt;
    this.bird.vy += d.gravity * dt;
    this.bird.y += this.bird.vy * dt;
    this.spawnX -= speed * dt;
    while (this.spawnX < this.width + 100) {
      const margin = 65, gap = Math.min(d.gap, this.height * .36);
      const center = margin + gap / 2 + this.random() * (ground - margin * 2 - gap);
      this.pipes.push({ x: this.spawnX, center, gap, width: 68, scored: false, hit: false });
      this.spawnX += d.spacing;
    }
    for (const p of this.pipes) {
      p.x -= speed * dt;
      if (!p.scored && p.x + p.width < this.bird.x - this.bird.radius) {
        p.scored = true; this.score++; this.onEvent('score', { score: this.score });
        const level = difficulty(this.score).level;
        if (level !== this.lastLevel) { this.lastLevel = level; this.onEvent('level', { level }); }
        if (this.score >= this.nextPowerScore) {
          this.pickups.push({ x: this.bird.x + 155, y: p.center, type: this.random() < .5 ? 'snail' : 'cloak' });
          this.nextPowerScore += 8 + Math.floor(this.random() * 5);
        }
      }
      const r = this.bird.radius;
      if (!p.hit && this.bird.x + r > p.x - 5 && this.bird.x - r < p.x + p.width + 5 && (this.bird.y - r < p.center - p.gap / 2 || this.bird.y + r > p.center + p.gap / 2)) this.hit(p);
    }
    for (const item of this.pickups) {
      item.x -= speed * dt;
      if (!item.taken && Math.hypot(item.x - this.bird.x, item.y - this.bird.y) < 38) { item.taken = true; this.activate(item.type); }
    }
    this.pipes = this.pipes.filter(p => p.x > -100);
    this.pickups = this.pickups.filter(p => p.x > -30 && !p.taken);
    if (this.bird.y < this.bird.radius) { this.bird.y = this.bird.radius; this.bird.vy = Math.max(0, this.bird.vy); }
    if (this.bird.y + this.bird.radius >= ground) {
      // The ground always costs a heart, including while cloaked.
      const cloak = this.active; this.active = null; this.hit(); this.active = cloak;
      this.bird.y = ground - this.bird.radius - 2; this.bird.vy = -290;
    }
  }
}

export function drawBird(ctx, x, y, scale = 3, skin = SKINS[0], wing = 0, angle = 0, alpha = 1) {
  // Original pixel sprite, drawn on a 19 x 15 grid.
  const outline = '#344a36';
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(angle); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
  ctx.translate(-9, -7);
  const box = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  box(5,1,8,1,outline);box(3,2,12,1,outline);box(2,3,14,7,outline);box(1,5,2,5,outline);box(3,10,13,2,outline);box(5,12,9,1,outline);
  box(5,2,7,2,skin.color);box(3,4,10,5,skin.color);box(3,9,12,2,skin.shade);box(5,11,8,1,skin.shade);
  box(10,3,5,6,'#fffdeb');box(12,3,3,5,'#fffdeb');box(14,4,2,4,outline);box(14,4,1,1,'#fff');
  box(12,9,7,3,outline);box(13,9,5,1,'#f5a35c');box(13,10,6,1,'#ec8653');
  const wy = wing > .3 ? 5 : wing < -.3 ? 8 : 7;
  box(0,wy,6,1,outline);box(0,wy+1,7,2,outline);box(1,wy+3,5,1,outline);box(1,wy+1,4,2,'#fff1aa');box(2,wy+3,3,1,skin.shade);
  ctx.restore();
}
