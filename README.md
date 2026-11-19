# Flappy Bird — v1.3 reference build

Silent recreation of the [supplied gameplay reference](https://www.youtube.com/watch?v=8nJhk_u4krI), using only the uploaded official sprite sheet. The bird stays yellow. Recording watermarks are omitted.

## Run

With Node.js 18 or newer:

```sh
npm start
```

Open **http://localhost:3000**. `npm run dev` restarts the server on source changes. There are no package dependencies.

## Controls

Select Play, then click or tap anywhere, including the black bars, or press Space/Up to flap. **Escape does nothing and never resets the run.** Rate and leaderboard buttons are visual placeholders, as requested. Sound remains off.

## Reference measurements

The viewport is locked to the video's **3:4** shape, at a native **288 × 384** logical resolution. The body class `aspect-locked` controls the lock; keep it until the user requests unlocking.

| Element | Native measurement |
| --- | --- |
| Bird / pipe width | 34 × 24 / 52 px |
| Foreground ground strip | 48 px; ground at y=336 |
| Pipe speed / spacing / gap | 120 px/s / 156 px / 100 px |
| First pipe delay | Approximately 2.2 s from the first flap |
| Simulation | Fixed 60 Hz |
| Flap impulse / gravity | −330 px/s / 1100 px/s², fitted from the recorded flight arc |
| Large score | Centered at y=18, official 24 × 36 glyphs |
| Result score | Separate official 14 × 20 glyphs (10 px wide for 1) |
| Title / Ready / Game Over | Native y=86 / 84 / 68 |
| Result card | Native x=25, y=130 including its shadow |
| Buttons | Native x=20 and 152, y=276 |

The skyline is stationary; ground and pipes move at the same speed. Day and night backgrounds use the uploaded atlas, with daytime on the first run and random variants afterward. The title includes the original Rate, Play, leaderboard and copyright graphics. All visible words and digits come from the sheet.

Screen changes fade through black. The Game Over heading, slide-up card, score count-up, medal and buttons appear in the reference order. Numeric timings are measured from a compressed 30 fps recording, so they are approximations rather than recovered original source constants.

BEST persists silently in browser local storage. There are no accounts, custom dialogs, powerups, unlocks, extra lives, difficulty ramps, downloaded graphics, fonts or audio. Existing ignored database files remain untouched.

## Verify

```sh
npm test
```

Checks cover the first-hit loss, delayed pipes, fixed spacing/speed, 60 Hz stepping, portrait sizing, Escape behavior, black-bar input, scene/result staging, official atlas integrity and static-file access. Client checks use DOM/canvas test doubles; they do not replace visual browser verification.

`public/engine.mjs` contains physics, `public/assets.mjs` defines official crops, `public/game.js` renders the reference screens, and the presentation modules contain visual timing. See [ASSET_CREDITS.md](ASSET_CREDITS.md).
