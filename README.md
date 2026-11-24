# Flappy Bird — v1.3 reference build

Flappy Bird v1.3 movement and graphics based on the [supplied gameplay reference](https://www.youtube.com/watch?v=8nJhk_u4krI), using the uploaded official sprite sheet and supplied sound effects. The bird stays yellow. A test final difficulty randomly selects frame-traced video chunks. Recording watermarks are omitted.

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

The skyline is stationary; ground and pipes move at the same speed. Day and night backgrounds use the uploaded atlas, with daytime on the first run and random variants afterward. The title includes the original Rate, Play, leaderboard and copyright graphics. All visible words and digits come from the sheet.

The ground scroll wraps at the atlas's 24-pixel pattern repeat, overlapping matching repeats in wider views to prevent seams. Touching the top edge ends control and triggers the hit/death fall, just like a pipe collision.

The opening pipe has no spawn delay. Its initial distance is fixed using the 16:10 view, placing it exactly outside that view and farther offscreen in narrower windows. The first point arrives about 3.67 seconds into the run at every supported aspect ratio; later pipes follow every 1.3 seconds. Following pipes are queued a full spacing ahead of the shared start edge, so they always exist before entering the visible screen. Resizing preserves each pipe's distance from the bird.

## Difficulty levels

**Level 1** is the unchanged original pipe layout: fixed 120 px/s travel, 156 px spacing and 100 px gaps. **Final** activates at score **5** for testing (`FINAL_TEST_SCORE` in `public/difficulty.mjs`). No intermediate levels are implemented.

Final always opens with one moving pair followed by two ordinary spaced gates. The catalog now contains **18 reference formations**, including compound sequences from the [High Score 999 video](https://www.youtube.com/watch?v=YHH2101OFfI): three rising pairs leading into a low opening (15–18 s), uneven stationary diagonal roofs over two independently moving three-pipe floor groups (18–21 s), a stationary diagonal tunnel measured at 48–51 s, predictable descending gates (8–11 s), a diagonal passage immediately followed by a moving gate (20–23 s), stepped/valley tunnels, rare longer tunnels ending in a downward passage, and sets of rapidly reversing gates (around 25 s).

A director schedules rapid sets of **two or three gates every 8–10 chunks**. Their openings have different heights and alternate phases, with a nominal 0.9-second movement cycle and immediate constant-speed reversals; ground visibility may shorten the travel range and cycle while preserving speed. Two longer nine-pipe tunnel variants appear occasionally, roughly every 10–14 chunks. Their last columns lower the route before a short overlapping upper pipe forces the downward exit. Its finite shaft ends inside the immediately preceding roof pipe, limiting intentional overlap to one pipe. Rendering, collision and footprint checks use that same length. Only designated upper transitions overlap; lower pipes and ordinary formations retain their small gaps.

Dense vertical caps are separated by **3 native pixels**; diagonal banks use a measured **54-pixel perpendicular pitch** for the 52-pixel pipes, leaving about 2 pixels. The first floor bank at 18–19 s forms a rising staircase: each successive tip is about 38 pixels right and 38 pixels up. Fixed diagonal roofs now have staggered end positions and lengths. Floor groups differ in speed, phase, baseline height and travel distance; individual tips within a group are also displaced. Moving caps slide along their own shaft axes, preserving the narrow gap between parallel shafts while bringing the raised platforms closer to the bird. Each bank keeps its own safety adjustment, so a terminal gate does not raise an entire preceding roof.

Extra section padding is reduced from 104–156 to **3–24 native pixels** after the visible shaft footprint. Important transitions are part of the same formation instead of being separated by an empty interlude. The director remembers the last five chunk IDs and excludes them from selection, while also avoiding adjacent matching families and recent matching motifs when possible. Long tunnels remain deliberate rare formations. Only horizontal left-moving formations are excluded from the first five final chunks; vertical motion and the initial moving pair remain eligible.

Left-moving sets randomize between four height profiles and three speed profiles, with extra horizontal speeds of **24–88 px/s** on top of the normal 118 px/s scroll. Some accelerate the middle gate more; others make the last gate fastest, as in the late reference sequence. The fixed approach begins **429.48 native pixels ahead of the actual bird**, just outside the widest current viewport, so visible gates are already moving. Extra movement continues through the crossing and off the left edge; scoring uses each gate’s actual position. Changing the bird’s x position updates the shared motion reference instead of using the screen center. Entry spacing clears the preceding angled tails without the older oversized gap. These values are fitted to measured footage and playability, not recovered original constants.

Lower pipes have a ground-visibility bound. Ordinary pipes keep the full 26-pixel cap plus at least 24 native shaft pixels above the ground; only scheduled rapid gates may approach the ground with just two shaft pixels remaining. The cap projection is checked for angled pipes as well. Moving groups reverse earlier when necessary, preserving their linear speed rather than pausing against a clamp. Static floors retract along their shafts, and vertical gates retain at least the original 100-pixel opening. The bound is recomputed after live resizing.

The level switches on the fifth point. Final is queued ahead of time immediately after the fifth classic gate, preserving the normal 156-pixel seam. The switch does not replace visible obstacles or restart the spawn clock. Final's measured horizontal travel is 118 native px/s. Rendering, collisions and scoring share the same transforms and freeze on impact. All images remain native-width crops of the uploaded green pipes; no other graphics or controls are added.

The source timestamps in `public/final-chunks.mjs` identify each reference behavior. Geometry is aligned and shortened for this project, with playability corrections, rather than presented as pixel-exact recovered game code. The earlier warped perspective samples are excluded. The reference's 400-pixel ground is aligned to the current viewport without stretching sprites.

Rendering uses `requestAnimationFrame` with a 240 FPS ceiling. Lower-refresh displays run at their available rate. Drawing previews the unsimulated fraction of the next fixed step using the current flap velocity, instead of blending past positions a full step behind. The preview stays within the screen and never changes physics, collision tests, scoring or difficulty. Keyboard and pointer inputs apply immediately and appear on the next displayed frame. The browser and monitor determine the actual achievable frame rate.

Input handlers synchronize the simulation to the current event time, commit any pending fraction with the old velocity, then apply the full flap impulse immediately. Pre-key time cannot weaken a new flap after a slow frame. Fractional steps compose to the same original 60 Hz flight arc; the render limiter only controls drawing. Small timestamp jitter is tolerated without dropping a refresh, and hidden tabs pause without building up catch-up time. There is no debounce or intentional jump delay; browser scheduling and hardware still determine physical input-to-display latency.

Screen changes fade through black. The Game Over heading, slide-up card, score count-up, medal and buttons appear in the reference order. Numeric timings are measured from a compressed 30 fps recording, so they are approximations rather than recovered original source constants.

The additional [bird-animation reference](https://www.youtube.com/watch?v=1vo4HPystfM) shows a slower idle cycle (14 recorded frames, about 0.467 s) and a faster playing cycle (6 frames, 0.2 s). A tap restarts the raised-wing pose; a steep descent holds the middle wing. Idle bobbing repeats every 0.75 seconds and travels about eight native pixels peak to peak. These use the three existing official yellow-bird frames; the recording supplies timing measurements only. The descent threshold and bob amplitude are fitted estimates from compressed footage.

Each actual flap plays wing, each passed pipe plays point, and a collision plays hit once. Pipe collisions add the falling death sound 0.2 seconds later; direct ground crashes only play hit. Play/replay transitions, the Game Over heading and the scorecard each play swoosh. The supplied files are copied unchanged into `public/assets/audio/`; playback skips leading padding, including 120 ms in the point recording. Web Audio preloads and decodes the files, supports overlapping flaps, and cancels active/pending sounds on replay. Missing audio support does not block gameplay.

The medal glimmer follows the supplied `17-57-55` capture: small, medium, large, medium, small official sparkle frames at 10 Hz. Each half-second pulse stays at one random position, then jumps to a new position around the medal. It starts with the awarded medal and is omitted for reduced motion.

BEST persists silently in browser local storage. There are no accounts, custom dialogs, powerups, unlocks, extra lives, downloaded graphics or fonts. Existing ignored database files remain untouched.

## Verify

```sh
npm test
```

Checks cover the first-hit loss, delayed pipes, fixed spacing/speed, 60 Hz stepping, portrait sizing, Escape behavior, black-bar input, scene/result staging, official atlas integrity, audio delivery and events, audio unlock/cancellation, and stationary glimmer pulses. Passage checks cover all 342 ordered formation joins, visible full-shaft separation of at least 2.9 native pixels for vertical pipes and 1.9 for diagonal banks at multiple movement phases, with explicit exceptions only for designated upper exits overlapping at most one preceding pipe, and simulated flights through every pairing and seeded long runs in landscape and portrait geometry, and every combination of rush height/speed profiles. Flight searches integrate the original 60 Hz physics, with at least 200 ms between flap presses; they do not teleport the bird or change its physics. Client checks use DOM/canvas and audio test doubles; they do not replace browser playback verification.

`public/engine.mjs` contains physics, `public/assets.mjs` defines official crops, `public/game.js` renders the reference screens, and the presentation modules contain visual timing. See [ASSET_CREDITS.md](ASSET_CREDITS.md).
