export const SKINS = [
  { id: 'classic', name: 'Yellow bird', threshold: 0 },
  { id: 'rose', name: 'Red bird', threshold: 25 },
  { id: 'blue', name: 'Blue bird', threshold: 50 },
];
export const METRICS = { width: 288, height: 512, groundHeight: 112, birdWidth: 34, birdHeight: 24, pipeWidth: 52 };
export function viewportLayout(width, height) {
  const scale = Math.min(Math.max(1, width) / METRICS.width, Math.max(1, height) / METRICS.height);
  return { scale, width: width / scale, height: height / scale };
}
export function difficulty(score) {
  const level = Math.floor(score / 10);
  return { level: level + 1, speed: Math.min(240, 110 + level * 13), spacing: Math.min(320, 190 + level * 15), gap: Math.max(100, 112 - level * 2), gravity: Math.min(1200, 900 + level * 12), flap: -Math.min(360, 280 + level * 6) };
}
export class Game {
  constructor({ width = 288, height = 512, random = Math.random, onEvent = () => {} } = {}) {
    this.width = width; this.height = height; this.random = random; this.onEvent = onEvent;
    this.reset();
  }
  reset() {
    this.state = 'ready'; this.score = 0; this.health = 2; this.elapsed = 0; this.distance = 0;
    this.bird = { x: this.width * .3, y: this.ground * .5, vy: 0, radius: 12 };
    this.pipes = []; this.pickups = []; this.invincible = 0; this.active = null; this.powerLeft = 0;
    this.nextPowerScore = 7 + Math.floor(this.random() * 3); this.powerCount = 0;
    this.spawnX = Math.max(this.width + 30, this.bird.x + 210); this.lastLevel = 1;
  }
  get ground() { return this.height - METRICS.groundHeight; }
  resize(width, height) {
    const oldGround = this.ground, oldX = this.bird.x;
    this.width = width; this.height = height;
    this.bird.x = width * .3;
    this.bird.y = Math.max(20, Math.min(this.ground - 20, this.bird.y / oldGround * this.ground));
    const shift = this.bird.x - oldX;
    this.spawnX += shift;
    for (const pipe of this.pipes) {
      pipe.x += shift;
      pipe.center = Math.max(pipe.gap / 2 + 30, Math.min(this.ground - pipe.gap / 2 - 30, pipe.center / oldGround * this.ground));
    }
    for (const item of this.pickups) { item.x += shift; item.y = item.y / oldGround * this.ground; }
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
    this.bird.y = Math.max(20, Math.min(this.ground - 20, this.bird.y));
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
    const d = difficulty(this.score), ground = this.ground;
    this.invincible = Math.max(0, this.invincible - dt);
    if (this.active) { this.powerLeft -= dt; if (this.powerLeft <= 0) { this.active = null; this.powerLeft = 0; this.onEvent('powerEnd'); } }
    const speed = d.speed * (this.active === 'snail' ? .6 : 1);
    this.distance += speed * dt;
    this.bird.vy += d.gravity * dt;
    this.bird.y += this.bird.vy * dt;
    this.spawnX -= speed * dt;
    while (this.spawnX < this.width + 100) {
      const margin = 50, gap = d.gap;
      const center = margin + gap / 2 + this.random() * (ground - margin * 2 - gap);
      this.pipes.push({ x: this.spawnX, center, gap, width: METRICS.pipeWidth, scored: false, hit: false });
      this.spawnX += d.spacing;
    }
    for (const p of this.pipes) {
      p.x -= speed * dt;
      if (!p.scored && p.x + p.width < this.bird.x - this.bird.radius) {
        p.scored = true; this.score++; this.onEvent('score', { score: this.score });
        const level = difficulty(this.score).level;
        if (level !== this.lastLevel) { this.lastLevel = level; this.onEvent('level', { level }); }
        if (this.score >= this.nextPowerScore) {
          this.pickups.push({ x: this.bird.x + 95, y: p.center, type: this.random() < .5 ? 'snail' : 'cloak' });
          this.nextPowerScore += 8 + Math.floor(this.random() * 5);
        }
      }
      const r = this.bird.radius;
      if (!p.hit && this.bird.x + r > p.x && this.bird.x - r < p.x + p.width && (this.bird.y - r < p.center - p.gap / 2 || this.bird.y + r > p.center + p.gap / 2)) this.hit(p);
      if (this.state === 'over') return;
    }
    for (const item of this.pickups) {
      item.x -= speed * dt;
      if (!item.taken && Math.hypot(item.x - this.bird.x, item.y - this.bird.y) < 28) { item.taken = true; this.activate(item.type); }
    }
    this.pipes = this.pipes.filter(p => p.x > -100);
    this.pickups = this.pickups.filter(p => p.x > -30 && !p.taken);
    if (this.bird.y < this.bird.radius) { this.bird.y = this.bird.radius; this.bird.vy = Math.max(0, this.bird.vy); }
    if (this.bird.y + this.bird.radius >= ground) {
      // The ground always costs a heart, including while cloaked.
      const cloak = this.active; this.active = null; this.hit(); this.active = cloak;
      this.bird.y = ground - this.bird.radius - 2; this.bird.vy = -250;
    }
  }
}
