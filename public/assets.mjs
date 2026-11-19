// All graphics come directly from the user-supplied official v1.3 atlas.
// Coordinates are native pixels; the viewport applies one uniform scale.
const ROOT = '/assets/flappy/';
export const ASSET_FILES = ['official-v1.3.png', 'sfx_wing.wav', 'sfx_point.wav', 'sfx_hit.wav', 'sfx_die.wav', 'sfx_swooshing.wav'];
export const SPRITES = {
  yellow: { width: 34, height: 24, frames: [[6, 982], [62, 982], [118, 982]] },
  red: { width: 34, height: 24, frames: [[230, 762], [230, 814], [230, 866]] },
  blue: { width: 34, height: 24, frames: [[174, 982], [230, 658], [230, 710]] },
  day: { x: 0, y: 0, width: 288, height: 512 },
  night: { x: 292, y: 0, width: 288, height: 512 },
  ground: { x: 584, y: 0, width: 336, height: 112 },
  pipeTop: { x: 112, y: 646, width: 52, height: 320 },
  pipeBottom: { x: 168, y: 646, width: 52, height: 320 },
  title: { x: 702, y: 182, width: 178, height: 44 },
  ready: { x: 590, y: 118, width: 184, height: 50 },
  over: { x: 790, y: 118, width: 192, height: 50 },
  tutorial: { x: 584, y: 182, width: 112, height: 100 },
  play: { x: 708, y: 236, width: 104, height: 58 },
  leaderboard: { x: 828, y: 236, width: 104, height: 58 },
  menu: { x: 924, y: 52, width: 80, height: 28 },
  scorePanel: { x: 6, y: 518, width: 226, height: 114 },
  platinum: { x: 242, y: 518, width: 44, height: 44 },
  gold: { x: 242, y: 566, width: 44, height: 44 },
  silver: { x: 224, y: 906, width: 44, height: 44 },
  bronze: { x: 224, y: 954, width: 44, height: 44 },
  new: { x: 224, y: 1002, width: 32, height: 14 },
};
const DIGITS = [[992,120,24],[272,910,16],[584,320,24],[612,320,24],[640,320,24],[668,320,24],[584,368,24],[612,368,24],[640,368,24],[668,368,24]];
let atlas, loading;
export function loadAssets() {
  loading ||= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { atlas = image; resolve(image); };
    image.onerror = () => { loading = null; reject(new Error('Sprite sheet failed to load.')); };
    image.src = ROOT + 'official-v1.3.png';
  });
  return loading;
}
export function drawSprite(ctx, name, x, y, scale = 1) {
  if (!atlas) return;
  const s = SPRITES[name];
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, s.x, s.y, s.width, s.height, Math.round(x), Math.round(y), s.width * scale, s.height * scale);
}
export function drawBird(ctx, x, y, skin, wing = 0, angle = 0, alpha = 1) {
  if (!atlas) return;
  const s = SPRITES[skin.id === 'rose' ? 'red' : skin.id === 'blue' ? 'blue' : 'yellow'];
  const [sx, sy] = s.frames[wing > .3 ? 0 : wing < -.3 ? 2 : 1];
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(angle);
  ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, sx, sy, s.width, s.height, -17, -12, 34, 24); ctx.restore();
}
export function drawBackground(ctx, width, height, ground, distance, night = false) {
  ctx.fillStyle = night ? '#008793' : '#4ec0ca'; ctx.fillRect(0, 0, width, height);
  if (!atlas) return;
  const s = night ? SPRITES.night : SPRITES.day;
  const offset = distance * .15 % s.width;
  for (let x = -offset; x < width; x += s.width) {
    // Anchor the original skyline to the original ground line (400 / 512).
    // Tall screens gain sky; wide screens gain tiles. Sprite proportions never change.
    drawSprite(ctx, night ? 'night' : 'day', x, ground - 400);
  }
}
export function drawGround(ctx, width, ground, distance) {
  if (!atlas) return;
  const offset = distance % SPRITES.ground.width;
  for (let x = -offset; x < width; x += SPRITES.ground.width) drawSprite(ctx, 'ground', x, ground);
}
export function drawPipe(ctx, x, y, width, height, up = false, alpha = 1) {
  if (!atlas || height <= 0) return;
  const s = up ? SPRITES.pipeTop : SPRITES.pipeBottom;
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  const scale = width / s.width, naturalHeight = s.height * scale;
  if (height <= naturalHeight) {
    const sourceHeight = height / scale;
    ctx.drawImage(atlas, s.x, up ? s.y + s.height - sourceHeight : s.y, s.width, sourceHeight,
      Math.round(x), Math.round(y), width, height);
  } else {
    // Extend only the uniform shaft, preserving the native cap and pipe width.
    const extension = height - naturalHeight;
    ctx.drawImage(atlas, s.x, up ? s.y : s.y + 30, s.width, 1,
      Math.round(x), Math.round(up ? y : y + naturalHeight), width, extension);
    ctx.drawImage(atlas, s.x, s.y, s.width, s.height,
      Math.round(x), Math.round(up ? y + extension : y), width, naturalHeight);
  }
  ctx.restore();
}
export function drawNumber(ctx, value, x, y, scale = 1, align = 'center') {
  if (!atlas) return;
  const digits = String(Math.max(0, Math.floor(value))).split('').map(n => DIGITS[Number(n)]);
  const width = (digits.reduce((sum, d) => sum + d[2], 0) + (digits.length - 1) * 4) * scale;
  let left = x - (align === 'right' ? width : align === 'left' ? 0 : width / 2);
  for (const [sx, sy, sw] of digits) {
    ctx.drawImage(atlas, sx, sy, sw, 36, Math.round(left), Math.round(y), sw * scale, 36 * scale);
    left += (sw + 4) * scale;
  }
}
export function drawPanel(ctx, width, height) {
  if (!atlas) return;
  const blit = (sx, sy, sw, sh, x, y, w, h) => ctx.drawImage(atlas, sx, sy, sw, sh, x, y, w, h);
  ctx.imageSmoothingEnabled = false;
  blit(140, 580, 1, 1, 8, 8, width - 16, height - 16);
  blit(14, 518, 210, 8, 8, 0, width - 16, 8);
  blit(14, 624, 210, 8, 8, height - 8, width - 16, 8);
  blit(6, 526, 8, 98, 0, 8, 8, height - 16);
  blit(224, 526, 8, 98, width - 8, 8, 8, height - 16);
  blit(6, 518, 8, 8, 0, 0, 8, 8); blit(224, 518, 8, 8, width - 8, 0, 8, 8);
  blit(6, 624, 8, 8, 0, height - 8, 8, 8); blit(224, 624, 8, 8, width - 8, height - 8, 8, 8);
}
export function drawButton(ctx, width, height) {
  if (!atlas) return;
  // Original orange MENU button, nine-sliced around its printed label.
  const blit = (sx, sy, sw, sh, x, y, w, h) => ctx.drawImage(atlas, sx, sy, sw, sh, x, y, w, h);
  ctx.imageSmoothingEnabled = false;
  blit(930, 58, 1, 1, 4, 4, width - 8, height - 10);
  blit(928, 52, 72, 4, 4, 0, width - 8, 4);
  blit(928, 74, 72, 6, 4, height - 6, width - 8, 6);
  blit(924, 56, 4, 18, 0, 4, 4, height - 10);
  blit(1000, 56, 4, 18, width - 4, 4, 4, height - 10);
  blit(924, 52, 4, 4, 0, 0, 4, 4); blit(1000, 52, 4, 4, width - 4, 0, 4, 4);
  blit(924, 74, 4, 6, 0, height - 6, 4, 6); blit(1000, 74, 4, 6, width - 4, height - 6, 4, 6);
}
export function createSoundBank(makeAudio = path => new Audio(path)) {
  const effects = { flap: 'sfx_wing.wav', score: 'sfx_point.wav', hit: 'sfx_hit.wav', over: 'sfx_die.wav', swoosh: 'sfx_swooshing.wav' };
  const pools = new Map(), positions = new Map();
  for (const [kind, file] of Object.entries(effects)) {
    pools.set(kind, Array.from({ length: kind === 'flap' ? 4 : 2 }, () => {
      const effect = makeAudio(ROOT + file); effect.preload = 'auto'; effect.volume = .35; return effect;
    })); positions.set(kind, 0);
  }
  return {
    play(kind) {
      const pool = pools.get(kind); if (!pool) return;
      const position = positions.get(kind), effect = pool[position];
      positions.set(kind, (position + 1) % pool.length);
      try { effect.currentTime = 0; effect.play()?.catch(() => {}); } catch {}
    },
    stop() { for (const pool of pools.values()) for (const effect of pool) { effect.pause(); effect.currentTime = 0; } },
  };
}
