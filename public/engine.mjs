export const METRICS = { width: 288, height: 512, groundHeight: 112, birdWidth: 34, birdHeight: 24, pipeWidth: 52 };
export const PHYSICS = { speed: 120, spacing: 180, gap: 100, gravity: 900, flap: -280 };

export function viewportLayout(width, height) {
  const scale = Math.min(Math.max(1, width) / METRICS.width, Math.max(1, height) / METRICS.height);
  return { scale, width: width / scale, height: height / scale };
}

export class Game {
  constructor({ width = 288, height = 512, random = Math.random, onEvent = () => {} } = {}) {
    this.width = width; this.height = height; this.random = random; this.onEvent = onEvent;
    this.reset();
  }
  get ground() { return this.height - METRICS.groundHeight; }
  reset() {
    this.state = 'ready'; this.score = 0; this.distance = 0;
    this.bird = { x: this.width * .3, y: this.ground / 2, vy: 0, radius: 12 };
    this.pipes = [];
    this.spawnX = this.bird.x + 210;
  }
  resize(width, height) {
    const oldGround = this.ground, oldX = this.bird.x;
    this.width = width; this.height = height;
    this.bird.x = width * .3;
    this.bird.y = Math.max(12, Math.min(this.ground - 12, this.bird.y / oldGround * this.ground));
    const shift = this.bird.x - oldX;
    this.spawnX += shift;
    for (const pipe of this.pipes) {
      pipe.x += shift;
      pipe.center = Math.max(pipe.gap / 2 + 30, Math.min(this.ground - pipe.gap / 2 - 30, pipe.center / oldGround * this.ground));
    }
  }
  start() { this.reset(); this.state = 'playing'; this.flap(); }
  flap() { if (this.state === 'playing') this.bird.vy = PHYSICS.flap; }
  end() {
    if (this.state === 'over') return;
    this.state = 'over'; this.onEvent('over', { score: this.score });
  }
  hit() {
    if (this.state !== 'playing') return;
    this.state = 'falling'; this.bird.vy = Math.max(0, this.bird.vy);
    this.onEvent('hit');
  }
  update(dt) {
    if (!['playing', 'falling'].includes(this.state)) return;
    dt = Math.max(0, Math.min(dt, .035));
    this.bird.vy += PHYSICS.gravity * dt;
    this.bird.y += this.bird.vy * dt;
    if (this.state === 'playing') {
      const delta = PHYSICS.speed * dt;
      this.distance += delta; this.spawnX -= delta;
      for (const pipe of this.pipes) pipe.x -= delta;
      while (this.spawnX < this.width + 100) {
        const margin = 50;
        const center = margin + PHYSICS.gap / 2 + this.random() * (this.ground - margin * 2 - PHYSICS.gap);
        this.pipes.push({ x: this.spawnX, center, gap: PHYSICS.gap, width: METRICS.pipeWidth, scored: false });
        this.spawnX += PHYSICS.spacing;
      }
      for (const pipe of this.pipes) {
        const r = this.bird.radius;
        if (this.bird.x + r > pipe.x && this.bird.x - r < pipe.x + pipe.width && (this.bird.y - r < pipe.center - pipe.gap / 2 || this.bird.y + r > pipe.center + pipe.gap / 2)) {
          this.hit(); break;
        }
        if (!pipe.scored && pipe.x + pipe.width < this.bird.x - r) {
          pipe.scored = true; this.score++; this.onEvent('score', { score: this.score });
        }
      }
      this.pipes = this.pipes.filter(pipe => pipe.x > -METRICS.pipeWidth);
      if (this.bird.y < this.bird.radius) { this.bird.y = this.bird.radius; this.bird.vy = Math.max(0, this.bird.vy); }
    }
    if (this.bird.y + this.bird.radius >= this.ground) {
      if (this.state === 'playing') this.hit();
      this.bird.y = this.ground - this.bird.radius; this.bird.vy = 0; this.end();
    }
  }
}
