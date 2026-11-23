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

The game adapts to the available browser viewport, up to a maximum landscape aspect ratio of **16:10**. Portrait phones and narrower displays fill the page; wider displays get centered side bars. CSS uses dynamic viewport units to follow mobile browser controls. The **288 × 384** reference defines sprite scale and UI measurements; wider views extend the world horizontally without stretching the artwork.

Continue development on `main`. The `Flappy-Bird-Original-Mobile-Version-11-23-2026` branch preserves the original mobile version and must remain unchanged.

| Element | Native measurement |
| --- | --- |
| Bird / pipe width | 34 × 24 / 52 px |
| Foreground ground strip | 48 px; ground at y=336 |
| Pipe speed / spacing / gap | 120 px/s / 156 px / 100 px |
| First pipe | Starts offscreen on the first flap, 426.48 native px ahead of the bird, based on the maximum 16:10 world |
| Simulation | 60 Hz steps, with fractional steps at exact input times |
| Rendering | Display refresh rate, capped at 240 FPS; fractional-step bird/pipe previews and continuous ground scrolling |
| Flap impulse / gravity | −330 px/s / 1100 px/s², fitted from the recorded flight arc |
| Large score | Centered at y=18, official 24 × 36 glyphs |
| Result score | Separate official 14 × 20 glyphs (10 px wide for 1) |
| Title / Ready / Game Over | Native y=86 / 84 / 68 |
| Result card | Native x=25, y=130 including its shadow |
| Buttons | Native x=20 and 152, y=276 |

The skyline is stationary; ground and pipes move at the same speed. Day and night backgrounds use the uploaded atlas, with daytime on the first run and random variants afterward. The title includes the original Rate, Play, leaderboard and copyright graphics. All visible words and digits come from the sheet.

The ground scroll wraps at the atlas's 24-pixel pattern repeat, overlapping matching repeats in wider views to prevent seams. Touching the top edge ends control and triggers the hit/death fall, just like a pipe collision.

The opening pipe has no spawn delay. Its initial distance is fixed using the 16:10 view, placing it exactly outside that view and farther offscreen in narrower windows. The first point arrives about 3.67 seconds into the run at every supported aspect ratio; later pipes follow every 1.3 seconds. Following pipes are queued a full spacing ahead of the shared start edge, so they always exist before entering the visible screen. Resizing preserves each pipe's distance from the bird.

Rendering uses `requestAnimationFrame` with a 240 FPS ceiling. Lower-refresh displays run at their available rate. Drawing previews the unsimulated fraction of the next fixed step using the current flap velocity, instead of blending past positions a full step behind. The preview stays within the screen and never changes physics, collision tests, scoring or difficulty. Keyboard and pointer inputs apply immediately and appear on the next displayed frame. The browser and monitor determine the actual achievable frame rate.

Input handlers synchronize the simulation to the current event time, commit any pending fraction with the old velocity, then apply the full flap impulse immediately. Pre-key time cannot weaken a new flap after a slow frame. Fractional steps compose to the same original 60 Hz flight arc; the render limiter only controls drawing. Small timestamp jitter is tolerated without dropping a refresh, and hidden tabs pause without building up catch-up time. There is no debounce or intentional jump delay; browser scheduling and hardware still determine physical input-to-display latency.

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
