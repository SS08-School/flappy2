import { drawBird as drawFallbackBird } from './engine.mjs';

// Sprite coordinates in noanonoa/flappy-bird's bundled Flappy Bird atlases.
// See ASSET_CREDITS.md for the pinned upstream revision and original sources.
const ROOT = '/assets/flappy/';
export const ASSET_FILES = [
  'og-theme.png', 'og-theme-2.png', 'sfx_wing.wav', 'sfx_point.wav',
  'sfx_hit.wav', 'sfx_die.wav', 'sfx_swooshing.wav',
];
export const SPRITES = {
  yellow: { sheet: 'original', width: 34, height: 24, frames: [[276, 114], [276, 140], [276, 166]] },
  red: { sheet: 'alternate', width: 18, height: 12, frames: [[115, 381], [115, 407], [115, 433]] },
  blue: { sheet: 'alternate', width: 18, height: 12, frames: [[87, 491], [115, 329], [115, 355]] },
  day: { x: 0, y: 0, width: 144, height: 256 },
  night: { x: 146, y: 0, width: 144, height: 256 },
  ground: { x: 276, y: 0, width: 224, height: 112 },
};
const sheets = {};
const birdFrames = new Map();
let loading;

function loadImage(name) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${name}`));
    image.src = ROOT + name;
  });
}
export function loadAssets() {
  loading ||= Promise.all([
    loadImage('og-theme.png').then(image => sheets.original = image),
    loadImage('og-theme-2.png').then(image => sheets.alternate = image),
  ]);
  return loading;
}

function framesFor(skin) {
  if (birdFrames.has(skin.id)) return birdFrames.get(skin.id);
  const base = skin.id === 'rose' ? 'red' : ['blue', 'lavender'].includes(skin.id) ? 'blue' : 'yellow';
  const sprite = SPRITES[base], source = sheets[sprite.sheet];
  if (!source) return null;
  const tint = ['mint', 'lavender', 'gold'].includes(skin.id);
  const rgb = skin.color.match(/[a-f0-9]{2}/gi).map(hex => parseInt(hex, 16));
  const frames = sprite.frames.map(([x, y]) => {
    const frame = document.createElement('canvas'); frame.width = sprite.width; frame.height = sprite.height;
    const c = frame.getContext('2d', { willReadFrequently: tint });
    c.drawImage(source, x, y, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height);
    if (tint) {
      const pixels = c.getImageData(0, 0, frame.width, frame.height);
      for (let p = 0; p < pixels.data.length; p += 4) {
        const [r, g, b, a] = pixels.data.subarray(p, p + 4);
        const body = base === 'blue' ? b > 100 && b > r * 1.1 : r > 180 && g > 150 && b < 160;
        if (!a || !body) continue;
        const light = Math.min(1.12, Math.max(.55, (r + g + b) / (base === 'blue' ? 460 : 490)));
        pixels.data[p] = Math.min(255, rgb[0] * light);
        pixels.data[p + 1] = Math.min(255, rgb[1] * light);
        pixels.data[p + 2] = Math.min(255, rgb[2] * light);
      }
      c.putImageData(pixels, 0, 0);
    }
    return frame;
  });
  birdFrames.set(skin.id, frames);
  return frames;
}

export function drawBird(ctx, x, y, scale, skin, wing = 0, angle = 0, alpha = 1) {
  const frames = framesFor(skin);
  if (!frames) return drawFallbackBird(ctx, x, y, scale, skin, wing, angle, alpha);
  const frame = frames[wing > .3 ? 0 : wing < -.3 ? 2 : 1];
  const width = scale * 19, height = width * frame.height / frame.width;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(angle);
  ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, -width / 2, -height / 2, width, height); ctx.restore();
}

export function drawBackground(ctx, width, ground, distance, night = false) {
  if (!sheets.alternate) return false;
  const s = night ? SPRITES.night : SPRITES.day;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = night ? '#138792' : '#54c0c9'; ctx.fillRect(0, 0, width, ground);
  const scale = 2, tileWidth = s.width * scale, tileHeight = s.height * scale;
  const offset = distance * .15 % tileWidth;
  for (let x = -offset; x < width; x += tileWidth) {
    ctx.drawImage(sheets.alternate, s.x, s.y, s.width, s.height, Math.round(x), ground - tileHeight, tileWidth, tileHeight);
  }
  ctx.restore(); return true;
}

export function drawGround(ctx, width, ground, distance) {
  if (!sheets.original) return false;
  const s = SPRITES.ground, tileWidth = s.width * 2, offset = distance % tileWidth;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  for (let x = -offset; x < width; x += tileWidth) {
    ctx.drawImage(sheets.original, s.x, s.y, s.width, s.height, Math.round(x), ground, tileWidth, s.height * 2);
  }
  ctx.restore(); return true;
}

export function drawPipe(ctx, x, y, width, height, up = false, alpha = 1) {
  if (!sheets.alternate) return false;
  if (height <= 0) return true;
  const sourceX = up ? 56 : 84, capHeight = Math.min(height, (width + 10) / 26 * 12);
  const shaftHeight = height - capHeight;
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  if (shaftHeight > 0) {
    ctx.drawImage(sheets.alternate, sourceX, up ? 323 : 335, 26, 148,
      Math.round(x - 5), Math.round(up ? y : y + capHeight), width + 10, shaftHeight);
  }
  ctx.drawImage(sheets.alternate, sourceX, up ? 471 : 323, 26, 12,
    Math.round(x - 5), Math.round(up ? y + height - capHeight : y), width + 10, capHeight);
  ctx.restore(); return true;
}

// A small pool permits quick repeated flaps without cutting off the previous sound.
export function createSoundBank(makeAudio = path => new Audio(path)) {
  const effects = { flap: 'sfx_wing.wav', score: 'sfx_point.wav', hit: 'sfx_hit.wav', over: 'sfx_die.wav', swoosh: 'sfx_swooshing.wav' };
  const pools = new Map(), positions = new Map();
  for (const [kind, filename] of Object.entries(effects)) {
    const pool = Array.from({ length: kind === 'flap' ? 4 : 2 }, () => {
      const effect = makeAudio(ROOT + filename); effect.preload = 'auto'; effect.volume = .35; return effect;
    });
    pools.set(kind, pool); positions.set(kind, 0);
  }
  return {
    play(kind) {
      const pool = pools.get(kind); if (!pool) return false;
      const position = positions.get(kind), effect = pool[position];
      positions.set(kind, (position + 1) % pool.length);
      try { effect.currentTime = 0; effect.play()?.catch(() => {}); } catch {}
      return true;
    },
    stop() { for (const pool of pools.values()) for (const effect of pool) { effect.pause(); effect.currentTime = 0; } },
  };
}
