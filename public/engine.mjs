// Native-pixel measurements from the supplied v1.3 gameplay reference.
import { FINAL_TEST_SCORE, FINAL_PIPE_SPEED, FinalDirector, createFinalChunk, pipePose, finalPipeHits, pipeBounds, pipeScoreX, fitFloorVisibility } from './difficulty.mjs';
export const METRICS = { width: 288, height: 384, maxAspectRatio: 16 / 10, groundHeight: 48, birdWidth: 34, birdHeight: 24, pipeWidth: 52 };
const birdX = width => 90 + (width - METRICS.width) * .3;
const maxWorldWidth = METRICS.height * METRICS.maxAspectRatio;
export const PHYSICS = { speed: 120, spacing: 156, gap: 100, gravity: 1100, flap: -330, firstPipeDistance: maxWorldWidth - birdX(maxWorldWidth), step: 1 / 60 };

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
  get pipeStartX() { return this.bird.x + PHYSICS.firstPipeDistance; }
  get speed() { return this.difficulty === 'final' ? FINAL_PIPE_SPEED : PHYSICS.speed; }
  reset() {
    this.state = 'ready'; this.score = 0; this.distance = 0; this.elapsed = 0; this.accumulator = 0;
    this.bird = { x: birdX(this.width), y: 188 + (this.height - METRICS.height) / 2, vy: 0, radius: 12 };
    this.pipes = [];
    this.nextPipeAt = 0;
    this.difficulty = 1; this.chunkSerial = 0; this.lastChunkKind = null;
    this.classicSpawned = 0; this.finalQueued = false; this.nextChunkX = null;
    this.lastExitCenter = null;
    this.finalDirector = null;
  }
  resize(width, height) {
    const oldGround = this.ground, oldX = this.bird.x;
    this.width = width; this.height = height;
    this.bird.x = birdX(width);
    this.bird.y = Math.max(12, Math.min(this.ground - 12, this.bird.y / oldGround * this.ground));
    const shift = this.bird.x - oldX;
    if (this.nextChunkX !== null) this.nextChunkX += shift;
    if (this.lastExitCenter !== null) this.lastExitCenter += (this.ground - oldGround) / 2;
    for (const pipe of this.pipes) {
      pipe.x += shift;
      pipe.center = Math.max(pipe.gap / 2 + 30, Math.min(this.ground - pipe.gap / 2 - 30, pipe.center / oldGround * this.ground));
      if (pipe.level === 'final') {
        pipe.verticalOffset = (this.ground - 336) / 2 - 64 + pipe.layoutOffset;
        pipe.referenceBirdX += shift;
        Object.assign(pipe, pipePose(pipe));
      }
    }
    fitFloorVisibility(this.pipes,this.ground);
    for(const pipe of this.pipes)if(pipe.level==='final')Object.assign(pipe,pipePose(pipe));
  }
  presentation() {
    if (!['playing', 'falling'].includes(this.state)) return { birdY: this.bird.y, pipeOffset: 0 };
    // Preview the unsimulated fraction using the same arc as committed steps.
    const remainder = Math.max(0, Math.min(PHYSICS.step, this.accumulator));
    return {
      birdY: Math.max(this.bird.radius, Math.min(this.ground - this.bird.radius,
        this.bird.y + this.bird.vy * remainder + PHYSICS.gravity * remainder * (remainder + PHYSICS.step) / 2)),
      pipeOffset: this.state === 'playing' ? -this.speed * remainder : 0,
    };
  }
  spawnPipe(x) {
    const margin = 50;
    const center = margin + PHYSICS.gap / 2 + this.random() * (this.ground - margin * 2 - PHYSICS.gap);
    this.pipes.push({ x, center, gap: PHYSICS.gap, width: METRICS.pipeWidth, scored: false, level: 1 });
    this.classicSpawned++;
  }
  appendFinalChunk() {
    const last = this.pipes.at(-1);
    const id = this.chunkSerial++;
    this.finalDirector ||= new FinalDirector(this.random);
    const chunk = createFinalChunk({
      x: this.nextChunkX ?? Math.max(this.pipeStartX, last ? last.x + PHYSICS.spacing : this.pipeStartX),
      ground: this.ground, entryCenter: this.lastExitCenter ?? last?.center ?? this.ground / 2,
      previousKind: this.lastChunkKind, id, random: this.random, width: METRICS.pipeWidth,
      kind: this.finalDirector.next(id),
      referenceBirdX: this.bird.x,
    });
    this.pipes.push(...chunk.pipes); this.lastChunkKind = chunk.kind;
    this.nextChunkX = chunk.nextX;
    this.lastExitCenter = chunk.exitCenter;
  }
  activateFinal() {
    if (this.difficulty === 'final' || this.score < FINAL_TEST_SCORE) return;
    this.difficulty = 'final';
    // Final's first chunk is already queued after the fifth classic pair.
    // Switching levels changes no positions and inserts no transition gap.
    if (!this.finalQueued) { this.finalQueued = true; this.appendFinalChunk(); }
    this.onEvent('difficulty', { level: 'final' });
  }
  start() { this.reset(); this.state = 'playing'; this.spawnPipe(this.pipeStartX); this.flap(); }
  flap() {
    if (this.state !== 'playing') return;
    // Finish time BEFORE the input with the old velocity. The new impulse
    // must never be aged by time that passed before the key/pointer event.
    const pending = Math.max(0, this.accumulator); this.accumulator = 0;
    if (pending > 1e-10) this.step(pending);
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
    // This composes exactly across fractional input boundaries and equals
    // the original semi-implicit 60 Hz arc for a full fixed step.
    this.bird.y += this.bird.vy * dt + PHYSICS.gravity * dt * (dt + PHYSICS.step) / 2;
    this.bird.vy += PHYSICS.gravity * dt;
    if (this.state === 'playing' && this.bird.y - this.bird.radius <= 0) {
      this.bird.y = this.bird.radius; this.hit();
    }
    if (this.state === 'playing') {
      const delta = this.speed * dt;
      this.distance += delta; this.elapsed += dt;
      this.activateFinal();
      if (this.nextChunkX !== null) this.nextChunkX -= delta;
      for (const pipe of this.pipes) {
        pipe.x -= delta;
        if (pipe.level === 'final') Object.assign(pipe, pipePose(pipe));
      }
      while (!this.finalQueued && this.elapsed + 1e-10 >= this.nextPipeAt) {
        if (this.classicSpawned >= FINAL_TEST_SCORE) {
          this.finalQueued = true; this.appendFinalChunk(); break;
        }
        // Queue the following pipe a full spacing beyond the shared start
        // edge, before it can enter even the widest supported viewport.
        this.spawnPipe(this.pipeStartX + PHYSICS.spacing - (this.elapsed - this.nextPipeAt) * PHYSICS.speed);
        this.nextPipeAt += PHYSICS.spacing / PHYSICS.speed;
      }
      // Build captured chunks far enough ahead that even the angled banks
      // exist before entering the view. Prefetch never adds physical spacing.
      while (this.finalQueued && this.nextChunkX < this.pipeStartX + 800) this.appendFinalChunk();
      for (const pipe of this.pipes) {
        const r = this.bird.radius;
        const collision = pipe.level === 'final' ? finalPipeHits(pipe, this.bird, this.ground)
          : this.bird.x + r > pipe.x && this.bird.x - r < pipe.x + pipe.width && (this.bird.y - r < pipe.center - pipe.gap / 2 || this.bird.y + r > pipe.center + pipe.gap / 2);
        if (collision) {
          this.hit(); break;
        }
        if (!pipe.scored && (pipe.level === 'final' ? pipeScoreX(pipe) : pipe.x + pipe.width / 4) < this.bird.x) {
          pipe.scored = true; this.score++; this.activateFinal(); this.onEvent('score', { score: this.score });
        }
      }
      this.pipes = this.pipes.filter(pipe => pipe.level === 'final'
        ? pipeBounds(pipe, this.ground).maxX > 0 : pipe.x > -METRICS.pipeWidth);
    }
    if (this.bird.y + this.bird.radius >= this.ground) {
      if (this.state === 'playing') this.hit();
      this.bird.y = this.ground - this.bird.radius; this.bird.vy = 0; this.end();
    }
  }
}
