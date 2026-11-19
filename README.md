# Flappy Bird — Widescreen

Original Flappy Bird gameplay adapted to fill the browser viewport, using only the uploaded official v1.3 sprite sheet.

## Run

With Node.js 18 or newer installed:

```sh
npm start
```

Open **http://localhost:3000**. `npm run dev` restarts the server on source changes. Set `PORT` to choose another port. There are no package dependencies.

## Play

Select the official Play button, then tap, press Space, or press Up to flap. Pass through each pipe pair for one point. A single collision ends the run. Speed and gap size remain fixed. The Menu button (or Escape) returns directly to the title screen.

The original Game Over scorecard displays the score, BEST, NEW indicator, and earned medal using only the uploaded sprites. BEST is kept silently in browser local storage. There are no save messages, custom text boxes, accounts, leaderboards, unlocks, powerups, extra lives, difficulty levels, or custom menus.

All visible labels and numbers come from the official sprite sheet. Accessibility labels are nonvisual. The game is silent because no audio files were included in the uploaded assets.

## Display

The viewport is temporarily locked to the original **9:16 portrait ratio** for accuracy testing, with black letterboxing. The `aspect-locked` class on `<body>` controls this lock; leave it enabled until testing is complete.

Screen-transition timing is referenced from [nebez/floppybird's main.js](https://github.com/nebez/floppybird/blob/gh-pages/js/main.js): splash fades, the scorecard slide/fade, staged replay reveal, medal zoom, and replay exit. These are implemented locally for Canvas. No assets, libraries, gameplay, flap-frame animation, or layout from that project are imported. Menu still returns to the title screen immediately and cancels pending transitions.

The existing wing-frame animation is retained. The upward pose lasts about 0.4 seconds, then eases into the existing downward tilt. Impact adds a roughly half-second white flash and gradual downward rotation, measured from the user's supplied gameplay clip. Movement physics remain fixed. Reduced-motion preferences skip screen tweens and the impact flash.

The original 288 × 512 logical viewport defines a single uniform scale: bird 34 × 24, pipes 52 wide, ground 112 high. Wide screens extend the repeating scenery horizontally; tall screens add sky. Sprites retain their proportions. The canvas fills the viewport without scrolling and uses nearest-neighbor image rendering.

## Source and verification

- `public/engine.mjs`: movement, fixed pipe spacing and speed, collision, score, and resizing.
- `public/assets.mjs`: crops and renders the unchanged official atlas.
- `public/game.js`: title, Get Ready, gameplay, death fall, scorecard, and Menu-to-title behavior.
- `public/transitions.mjs`: screen-animation timing and easing only.
- `public/bird-presentation.mjs`: the reference clip's upward-pose and impact visuals, separate from physics.
- `server.mjs`: serves static game files only. The previous account APIs are removed; any existing ignored database files remain untouched.

```sh
npm test
```

Checks cover first-hit loss, death animation, fixed difficulty, scoring, viewport geometry, static-file access, the uploaded asset checksum, and client transitions with DOM/canvas test doubles. Those controller checks do not replace visual browser verification.

See [ASSET_CREDITS.md](ASSET_CREDITS.md) for the sole runtime asset's source.
