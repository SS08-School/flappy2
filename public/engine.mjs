// Native-pixel measurements from the supplied v1.3 gameplay reference.
export const METRICS = { width: 288, height: 384, groundHeight: 48, birdWidth: 34, birdHeight: 24, pipeWidth: 52 };
export const PHYSICS = { speed: 120, spacing: 156, gap: 100, gravity: 1100, flap: -330, firstPipeDelay: 2.2, step: 1 / 60 };

export function viewportLayout(width, height) {
  const scale = Math.min(Math.max(1, width) / METRICS.width, Math.max(1, height) / METRICS.height);
  return { scale, width: width / scale, height: height / scale };
}

export class Game {
  constructor({ width = METRICS.width, height = METRICS.height, random = Math.random, onEvent = () => {} } = {}) {
    this.width = width; this.height = height; this.random = random; this.onEvent = onEvent;
    this.reset();
  }
  get ground() { return this.height - METRICS.groundHeight; }
  reset() {
    this.state = 'ready'; this.score = 0; this.distance = 0; this.elapsed = 0; this.accumulator = 0;
    this.bird = { x: 90 + (this.width - METRICS.width) * .3, y: 188 + (this.height - METRICS.height) / 2, vy: 0, radius: 12 };
    this.pipes = [];
    this.nextPipeAt = PHYSICS.firstPipeDelay;
  }
  resize(width, height) {
    const oldGround = this.ground, oldX = this.bird.x;
    this.width = width; this.height = height;
    this.bird.x = 90 + (width - METRICS.width) * .3;
    this.bird.y = Math.max(12, Math.min(this.ground - 12, this.bird.y / oldGround * this.ground));
    const shift = this.bird.x - oldX;
    for (const pipe of this.pipes) {
      pipe.x += shift;
      pipe.center = Math.max(pipe.gap / 2 + 30, Math.min(this.ground - pipe.gap / 2 - 30, pipe.center / oldGround * this.ground));
    }
  }
  presentation() {
    if (!['playing', 'falling'].includes(this.state)) return { birdY: this.bird.y, pipeOffset: 0 };
    // Preview only the remaining fraction of the next fixed step. Blending
    // historical positions added a full step of visible input latency.
    const remainder = Math.max(0, Math.min(PHYSICS.step, this.accumulator));
    return {
      birdY: Math.max(this.bird.radius, Math.min(this.ground - this.bird.radius,
        this.bird.y + (this.bird.vy + PHYSICS.gravity * PHYSICS.step) * remainder)),
      pipeOffset: this.state === 'playing' ? -PHYSICS.speed * remainder : 0,
    };
  }
  start() { this.reset(); this.state = 'playing'; this.flap(); }
  flap() {
    if (this.state !== 'playing') return;
    this.bird.vy = PHYSICS.flap; this.onEvent('flap');
  }
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
    this.accumulator += Math.max(0, Math.min(dt, .1));
    while (this.accumulator + 1e-10 >= PHYSICS.step) {
      this.accumulator -= PHYSICS.step;
      this.step(PHYSICS.step);
      if (this.state === 'over') { this.accumulator = 0; break; }
    }
  }
  step(dt) {
    this.bird.vy += PHYSICS.gravity * dt;
    this.bird.y += this.bird.vy * dt;
    if (this.state === 'playing' && this.bird.y - this.bird.radius <= 0) {
      this.bird.y = this.bird.radius; this.hit();
    }
    if (this.state === 'playing') {
      const delta = PHYSICS.speed * dt;
      this.distance += delta; this.elapsed += dt;
      for (const pipe of this.pipes) pipe.x -= delta;
      while (this.elapsed + 1e-10 >= this.nextPipeAt) {
        const margin = 50;
        const center = margin + PHYSICS.gap / 2 + this.random() * (this.ground - margin * 2 - PHYSICS.gap);
        this.pipes.push({ x: this.width - (this.elapsed - this.nextPipeAt) * PHYSICS.speed, center, gap: PHYSICS.gap, width: METRICS.pipeWidth, scored: false });
        this.nextPipeAt += PHYSICS.spacing / PHYSICS.speed;
      }
      for (const pipe of this.pipes) {
        const r = this.bird.radius;
        if (this.bird.x + r > pipe.x && this.bird.x - r < pipe.x + pipe.width && (this.bird.y - r < pipe.center - pipe.gap / 2 || this.bird.y + r > pipe.center + pipe.gap / 2)) {
          this.hit(); break;
        }
        if (!pipe.scored && pipe.x + pipe.width / 4 < this.bird.x) {
          pipe.scored = true; this.score++; this.onEvent('score', { score: this.score });
        }
      }
      this.pipes = this.pipes.filter(pipe => pipe.x > -METRICS.pipeWidth);
    }
    if (this.bird.y + this.bird.radius >= this.ground) {
      if (this.state === 'playing') this.hit();
      this.bird.y = this.ground - this.bird.radius; this.bird.vy = 0; this.end();
    }
  }
}
