# Flappy Bird — v1.3 reference build

Recreation of the [supplied gameplay reference](https://www.youtube.com/watch?v=8nJhk_u4krI), using the uploaded official sprite sheet and supplied sound effects. The bird stays yellow. Recording watermarks are omitted.

## Run

With Node.js 18 or newer:

```sh
npm start
```

Open **http://localhost:3000**. `npm run dev` restarts the server on source changes. There are no package dependencies.

## Controls

Select Play, then click or tap anywhere, including the black bars, or press Space/Up to flap. **Escape does nothing and never resets the run.** Rate and leaderboard buttons are visual placeholders, as requested. Sound unlocks on interaction; the idle bird animation is silent.

## Reference measurements

The viewport is locked to the video's **3:4** shape, at a native **288 × 384** logical resolution. The body class `aspect-locked` controls the lock; keep it until the user requests unlocking.

| Element | Native measurement |
| --- | --- |
| Bird / pipe width | 34 × 24 / 52 px |
| Foreground ground strip | 48 px; ground at y=336 |
| Pipe speed / spacing / gap | 120 px/s / 156 px / 100 px |
| First pipe delay | Approximately 2.2 s from the first flap |
| Simulation | Fixed 60 Hz |
| Rendering | Display refresh rate, capped at 240 FPS; interpolated bird/pipes and continuous ground scrolling |
| Flap impulse / gravity | −330 px/s / 1100 px/s², fitted from the recorded flight arc |
| Large score | Centered at y=18, official 24 × 36 glyphs |
| Result score | Separate official 14 × 20 glyphs (10 px wide for 1) |
| Title / Ready / Game Over | Native y=86 / 84 / 68 |
| Result card | Native x=25, y=130 including its shadow |
| Buttons | Native x=20 and 152, y=276 |

The skyline is stationary; ground and pipes move at the same speed. Day and night backgrounds use the uploaded atlas, with daytime on the first run and random variants afterward. The title includes the original Rate, Play, leaderboard and copyright graphics. All visible words and digits come from the sheet.

The ground scroll wraps at the atlas's 24-pixel pattern repeat, keeping a single draw across the locked viewport and overlapping matching repeats in wider views to prevent seams. Touching the top edge ends control and triggers the hit/death fall, just like a pipe collision.

Rendering uses `requestAnimationFrame` with a 240 FPS ceiling. Lower-refresh displays run at their available rate. Drawing interpolates between fixed physics steps, with fractional positions for moving sprites; physics, collision tests, scoring and difficulty remain independent of rendering frequency. The browser and monitor determine the actual achievable frame rate.

Screen changes fade through black. The Game Over heading, slide-up card, score count-up, medal and buttons appear in the reference order. Numeric timings are measured from a compressed 30 fps recording, so they are approximations rather than recovered original source constants.

Each actual flap plays wing, each passed pipe plays point, and a collision plays hit once. Pipe collisions add the falling death sound 0.2 seconds later; direct ground crashes only play hit. Play/replay transitions, the Game Over heading and the scorecard each play swoosh. The supplied files are copied unchanged into `public/assets/audio/`; playback skips leading padding, including 120 ms in the point recording. Web Audio preloads and decodes the files, supports overlapping flaps, and cancels active/pending sounds on replay. Missing audio support does not block gameplay.

The medal glimmer follows the supplied `17-57-55` capture: small, medium, large, medium, small official sparkle frames at 10 Hz. Each half-second pulse stays at one random position, then jumps to a new position around the medal. It starts with the awarded medal and is omitted for reduced motion.

BEST persists silently in browser local storage. There are no accounts, custom dialogs, powerups, unlocks, extra lives, difficulty ramps, downloaded graphics or fonts. Existing ignored database files remain untouched.

## Verify

```sh
npm test
```

Checks cover the first-hit loss, delayed pipes, fixed spacing/speed, 60 Hz stepping, portrait sizing, Escape behavior, black-bar input, scene/result staging, official atlas integrity, audio delivery and events, audio unlock/cancellation, and stationary glimmer pulses. Client checks use DOM/canvas and audio test doubles; they do not replace browser playback verification.

`public/engine.mjs` contains physics, `public/assets.mjs` defines official crops, `public/game.js` renders the reference screens, and the presentation modules contain visual timing. See [ASSET_CREDITS.md](ASSET_CREDITS.md).
