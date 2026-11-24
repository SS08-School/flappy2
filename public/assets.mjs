// All graphics come directly from the user-supplied official v1.3 atlas.
// Coordinates are native pixels; the viewport applies one uniform scale.
const ROOT = '/assets/flappy/';
export const ASSET_FILES = ['official-v1.3.png'];
export const SPRITES = {
  sparkleSmall: { x: 276, y: 682, width: 10, height: 10 },
  sparkleMedium: { x: 276, y: 734, width: 10, height: 10 },
  yellow: { width: 34, height: 24, frames: [[6, 982], [62, 982], [118, 982]] },
  blue: { width: 34, height: 24, frames: [[174, 982], [230, 658], [230, 710]] },
  red: { width: 34, height: 24, frames: [[230, 762], [230, 814], [230, 866]] },
  day: { x: 0, y: 0, width: 288, height: 512 },
  night: { x: 292, y: 0, width: 288, height: 512 },
  ground: { x: 584, y: 0, width: 336, height: 112 },
  pipeTop: { x: 112, y: 646, width: 52, height: 320 },
  pipeBottom: { x: 168, y: 646, width: 52, height: 320 },
  title: { x: 702, y: 182, width: 178, height: 48 },
  ready: { x: 584, y: 116, width: 196, height: 62 },
  over: { x: 784, y: 116, width: 204, height: 54 },
  tutorial: { x: 584, y: 182, width: 114, height: 100 },
  play: { x: 702, y: 234, width: 116, height: 70 },
  leaderboard: { x: 822, y: 234, width: 116, height: 70 },
  rate: { x: 924, y: 0, width: 74, height: 48 },
  copyright: { x: 884, y: 182, width: 126, height: 14 },
  sparkle: { x: 276, y: 786, width: 10, height: 10 },
  menu: { x: 924, y: 52, width: 80, height: 28 },
  scorePanel: { x: 0, y: 516, width: 238, height: 126 },
  platinum: { x: 242, y: 516, width: 44, height: 44 },
  gold: { x: 242, y: 564, width: 44, height: 44 },
  silver: { x: 224, y: 906, width: 44, height: 44 },
  bronze: { x: 224, y: 954, width: 44, height: 44 },
  new: { x: 224, y: 1002, width: 32, height: 14 },
};
// Every score glyph is cropped from the uploaded atlas; no font-rendered digits.
const DIGITS = [[992,120,24],[272,910,16],[584,320,24],[612,320,24],[640,320,24],[668,320,24],[584,368,24],[612,368,24],[640,368,24],[668,368,24]];
const RESULT_DIGITS = [[274,612,14],[278,954,10],[274,978,14],[262,1002,14],[1004,0,14],[1004,24,14],[1010,52,14],[1010,84,14],[586,484,14],[622,412,14]];
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
export function drawSprite(ctx, name, x, y, scale = 1, snap = true) {
  if (!atlas) return;
  const s = SPRITES[name];
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, s.x, s.y, s.width, s.height, snap ? Math.round(x) : x, snap ? Math.round(y) : y, s.width * scale, s.height * scale);
}
export function drawBird(ctx, x, y, wing = 0, angle = 0, color = 'yellow') {
  if (!atlas) return;
  const s = SPRITES[color];
  const [sx, sy] = s.frames[wing > .3 ? 0 : wing < -.3 ? 2 : 1];
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, sx, sy, s.width, s.height, -17, -12, 34, 24); ctx.restore();
}
export function drawBackground(ctx, width, height, ground, night = false) {
  ctx.fillStyle = night ? '#008793' : '#4ec0ca'; ctx.fillRect(0, 0, width, height);
  if (!atlas) return;
  const s = SPRITES.day;
  for (let x = 0; x < width; x += s.width) {
    // The reference skyline is stationary; only the ground and pipes scroll.
    // Tall screens gain sky; wide screens gain tiles. Sprite proportions never change.
    drawSprite(ctx, night ? 'night' : 'day', x, ground - 400);
  }
}
export function drawGround(ctx, width, ground, distance) {
  if (!atlas) return;
  // The atlas pattern repeats every 24 native pixels. Wrap at that period so
  // one sprite covers the locked viewport throughout the loop. Wider views
  // overlap one full repeat, preventing fractional-scale tile-edge seams.
  const period = 24, stride = SPRITES.ground.width - period;
  const offset = distance % period;
  for (let x = -offset; x < width; x += stride) {
    drawSprite(ctx, 'ground', x, ground, 1, false);
    if (x + SPRITES.ground.width >= width) break;
  }
}
export function drawPipe(ctx, x, y, width, height, up = false, alpha = 1) {
  if (!atlas || height <= 0) return;
  const s = up ? SPRITES.pipeTop : SPRITES.pipeBottom;
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  const scale = width / s.width, naturalHeight = s.height * scale;
  if (height <= naturalHeight) {
    const sourceHeight = height / scale;
    ctx.drawImage(atlas, s.x, up ? s.y + s.height - sourceHeight : s.y, s.width, sourceHeight,
      x, y, width, height);
  } else {
    // Extend only the uniform shaft, preserving the native cap and pipe width.
    const extension = height - naturalHeight;
    ctx.drawImage(atlas, s.x, up ? s.y : s.y + 30, s.width, 1,
      x, up ? y : y + naturalHeight, width, extension);
    ctx.drawImage(atlas, s.x, s.y, s.width, s.height,
      x, up ? y + extension : y, width, naturalHeight);
  }
  ctx.restore();
}
export function drawNumber(ctx, value, x, y, scale = 1, align = 'center', result = false) {
  if (!atlas) return;
  const digits = String(Math.max(0, Math.floor(value))).split('').map(n => (result ? RESULT_DIGITS : DIGITS)[Number(n)]);
  const height = result ? 20 : 36;
  const width = (digits.reduce((sum, d) => sum + d[2], 0) + (digits.length - 1) * 4) * scale;
  let left = x - (align === 'right' ? width : align === 'left' ? 0 : width / 2);
  for (const [sx, sy, sw] of digits) {
    ctx.drawImage(atlas, sx, sy, sw, height, Math.round(left), Math.round(y), sw * scale, height * scale);
    left += (sw + 4) * scale;
  }
}
