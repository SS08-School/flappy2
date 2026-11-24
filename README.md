# Flappy Bird — v1.3 reference build

Flappy Bird v1.3 movement and graphics based on the [supplied gameplay reference](https://www.youtube.com/watch?v=8nJhk_u4krI), using the uploaded official sprite sheet and supplied sound effects. The menu and every run independently choose an official yellow, blue or red bird. A test final difficulty randomly selects frame-traced video chunks. Recording watermarks are omitted.

## Run

With Node.js 18 or newer:

```sh
npm start
```

Open **http://localhost:3000**. `npm run dev` restarts the server on source changes. There are no package dependencies.

## Controls

Select Play, then click or tap anywhere, including the black bars, or press Space/Up/W to flap. **Escape does nothing and never resets the run.** Rate and leaderboard buttons are visual placeholders, as requested. Sound unlocks on interaction; the idle bird animation is silent.

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

The skyline is stationary; ground and pipes move at the same speed. Day and night backgrounds use the uploaded atlas, with a permanently daytime menu and an independent day/night choice for every run, including the first. The title includes the original Rate, Play, leaderboard and copyright graphics. All visible words and digits come from the sheet.

The ground scroll wraps at the atlas's 24-pixel pattern repeat, overlapping matching repeats in wider views to prevent seams. Touching the top edge ends control and triggers the hit/death fall, just like a pipe collision.

The opening pipe has no spawn delay. Its initial distance is fixed using the 16:10 view, placing it exactly outside that view and farther offscreen in narrower windows. The first point arrives about 3.67 seconds into the run at every supported aspect ratio; later pipes follow every 1.3 seconds. Following pipes are queued a full spacing ahead of the shared start edge, so they always exist before entering the visible screen. Resizing preserves each pipe's distance from the bird.

## Difficulty levels

**Level 1** is the unchanged original pipe layout: fixed 120 px/s travel, 156 px spacing and 100 px gaps. **Final** activates at score **5** for testing (`FINAL_TEST_SCORE` in `public/difficulty.mjs`). No intermediate levels are implemented.

Final opens with a descending pair followed by two ordinary spaced gates. The catalog contains **15 formations** measured against complete sequences from the [High Score 999 video](https://www.youtube.com/watch?v=YHH2101OFfI), including the three rising pairs followed immediately by three uneven fixed gates (15–18 s), the uneven fixed roof and two moving three-pipe floor banks (18–23 s), and the diagonal tunnel with a downward overlay exit and opposing floor tips (48–53 s). Longer tunnels have a deeper internal drop and a downward exit.

The 18-second floor banks now follow **nonrepeating tracks**, rather than repeating triangle cycles. The first bank rises at approximately **26 native px/s** over 65 pixels. The next briefly rises at 50 px/s, reverses once near the reference’s 19-second mark, then descends at approximately **72 px/s** over 160 pixels. Scroll-compensated cap positions at 18.8–20.0 seconds are checked against the source samples with a six-pixel tolerance along the shaft. Their initial offsets account for the formation’s approach distance relative to the bird. Movement follows the shaft axes, retaining a 54-pixel perpendicular pitch for the 52-pixel pipes. The roof stays stationary and uneven. Ground fitting translates a complete rail instead of reducing its distance and period into a short fast bounce. The roof is fitted against the actual arrival opening, retaining room for the unchanged bird physics. The first bank finishes its rise after the reference crossing to prevent its trailing tips closing into the roof in the wider view.

Rapid reversing/shaky formations are **disabled**. The director retains five-chunk repeat exclusion, avoids nearby matching motifs where possible, and excludes only left-moving sections from the first five final chunks. Occasional ten-pair long tunnel variants remain scheduled roughly every 10–14 chunks. Ordinary section padding remains 3–24 native pixels after the visible shaft footprint.

Single upper diagonal overlays now extend all the way to the ceiling. Their horizontal position is calculated from the preceding roof and floor footprints, so they cross at most the last roof pipe. All such upper overlays draw after ordinary pipes. The diagonal drop exit continues into a second, oppositely angled floor pipe, creating the reference dip into the ground and back up without joining the two solid shafts.

The left-moving section is one compound sequence, with five varied-height approaches and its own rising-floor exit. Its extra horizontal speeds vary between **24 and 88 px/s**, with a fixed approach beginning **429.48 native pixels ahead of the actual bird**. Two pairs briefly match the bird’s horizontal position for **1.1 and 0.8 seconds** before resuming their leftward motion; additional left-moving pairs continue within the same section. Its final gate has a stationary roof and a floor that rises continuously at **24 px/s** from the fixed offscreen approach until the crossing. Scoring, collision and rendering share these poses. Timing remains relative to the bird’s actual position, including resizing or a future change in its horizontal placement.

All lower pipes retain the full 26-pixel cap and at least 24 native shaft pixels above ground. Static adjustments follow the shaft direction. Moving rails retain their full configured distance and speed, and the bound is recomputed after resizing. Vertical gates retain an opening of at least 100 native pixels.

The level switches on the fifth point. Final is queued ahead of time immediately after the fifth classic gate, preserving the normal 156-pixel seam. The switch does not replace visible obstacles or restart the spawn clock. Final's measured horizontal travel is 118 native px/s. Rendering, collisions and scoring share the same transforms and freeze on impact. All images remain native-width crops of the uploaded green pipes; no other graphics or controls are added.

The source timestamps in `public/final-chunks.mjs` identify each reference behavior. Geometry is aligned and shortened for this project, with playability corrections, rather than presented as pixel-exact recovered game code. The earlier warped perspective samples are excluded. The reference's 400-pixel ground is aligned to the current viewport without stretching sprites.

Rendering uses `requestAnimationFrame` with a 240 FPS ceiling. Lower-refresh displays run at their available rate. Drawing previews the unsimulated fraction of the next fixed step using the current flap velocity, instead of blending past positions a full step behind. The preview stays within the screen and never changes physics, collision tests, scoring or difficulty. Keyboard and pointer inputs apply immediately and appear on the next displayed frame. Tab and Shift+Tab are prevented from moving focus or triggering a game action; the canvas and Play button are removed from the Tab order. The browser and monitor determine the actual achievable frame rate.

Input handlers synchronize the simulation to the current event time, commit any pending fraction with the old velocity, then apply the full flap impulse immediately. Pre-key time cannot weaken a new flap after a slow frame. Fractional steps compose to the same original 60 Hz flight arc; the render limiter only controls drawing. Small timestamp jitter is tolerated without dropping a refresh, and hidden tabs pause without building up catch-up time. There is no debounce or intentional jump delay; browser scheduling and hardware still determine physical input-to-display latency.

The official NEW badge already matches the supplied screenshot at native (166, 189), two pixels left of BEST. It is shown only after beating the previous best, not tying it.

Screen changes fade through black. The Game Over heading, slide-up card, score count-up, medal and buttons appear in the reference order. Numeric timings are measured from a compressed 30 fps recording, so they are approximations rather than recovered original source constants.

The additional [bird-animation reference](https://www.youtube.com/watch?v=1vo4HPystfM) shows a slower idle cycle (14 recorded frames, about 0.467 s) and a faster playing cycle (6 frames, 0.2 s). A tap restarts the raised-wing pose; a steep descent holds the middle wing. Idle bobbing repeats every 0.75 seconds and travels about eight native pixels peak to peak. These use the corresponding three official frames for each selected bird color; the recording supplies timing measurements only. The descent threshold and bob amplitude are fitted estimates from compressed footage. Collision capture uses the incoming flight angle and retains an already downward rendered pose. A flap rejected during pending collision motion cannot restart the flap presentation; upward impacts still retain their raised pose. The existing flash, rotation and result timings are unchanged.

Each actual flap plays wing, each passed pipe plays point, and a collision plays hit once. Pipe collisions add the falling death sound 0.2 seconds later; direct ground crashes only play hit. Play/replay transitions, the Game Over heading and the scorecard each play swoosh. The supplied files are copied unchanged into `public/assets/audio/`; playback skips leading padding, including 120 ms in the point recording. Web Audio preloads and decodes the files, supports overlapping flaps, and cancels active/pending sounds on replay. Missing audio support does not block gameplay.

The medal glimmer follows the supplied `17-57-55` capture: small, medium, large, medium, small official sparkle frames at 10 Hz. Each half-second pulse stays at one random position, then jumps to a new position around the medal. It starts with the awarded medal and is omitted for reduced motion.

BEST persists silently in browser local storage. There are no accounts, custom dialogs, powerups, unlocks, extra lives, downloaded graphics or fonts. Existing ignored database files remain untouched.

## Verify

```sh
npm test
```

Checks cover the first-hit loss, delayed pipes, fixed spacing/speed, 60 Hz stepping, portrait sizing, Escape behavior, black-bar input, scene/result staging, official atlas integrity, audio delivery and events, audio unlock/cancellation, and stationary glimmer pulses. Passage checks cover all 171 director-eligible formation joins, visible full-shaft separation of at least 2.9 native pixels for vertical pipes and 1.9 for diagonal banks at multiple movement phases, with explicit exceptions only for designated upper exits overlapping at most one preceding pipe, and simulated flights through every supported pairing and seeded long runs in landscape and portrait geometry, and every combination of rush height/speed profiles. Flight searches integrate the original 60 Hz physics, with at least 200 ms between flap presses; they do not teleport the bird or change its physics. Client checks use DOM/canvas and audio test doubles; they do not replace browser playback verification.

`public/engine.mjs` contains physics, `public/assets.mjs` defines official crops, `public/game.js` renders the reference screens, and the presentation modules contain visual timing. See [ASSET_CREDITS.md](ASSET_CREDITS.md).
