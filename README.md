# Flabby Bird

A playable Flappy Bird inspired fangame based on the proposal by Sebastian Szeliga and Joel Ramirez. The game covers the entire browser viewport, with all controls inside the game. All graphics are taken directly from the supplied official v1.3 sprite sheet; original sound effects are bundled locally. No runtime asset downloads or package dependencies are required. See [ASSET_CREDITS.md](ASSET_CREDITS.md) for sources.

## Run locally

Install **Node.js 22.13 or newer** (Node 24 LTS recommended), then run from this folder:

```sh
npm start
```

Open **http://localhost:3000**. `npm run dev` restarts the server when source files change. Set `PORT` to choose a different port. The server listens on the local machine only.

## Play

- Select the original **Play** button, then **Space**, **Up**, or tap to start and flap. **P**, **Escape**, or the in-game **Menu** button pauses and opens the menu.
- Two lives; the first collision grants two seconds of recovery. The lives counter uses text because the official sheet contains no heart graphic.
- Every 10 points increases speed and pipe spacing. Difficulty has a ceiling.
- Collect an official **silver medal** for the snail effect (slower world for seven seconds) or an official **gold medal** for the cloak effect (pass through pipes for six seconds). Cloaks do not protect against the ground.
- The first powerup appears at 7–9 points, then every 8–12 points.
- Only the official yellow, red, and blue birds are available. Red unlocks at 25 points and blue at 50. Previous custom bird selections return to yellow.
- Backgrounds alternate between the original day and night scenes every 30 points.
- Accounts, leaderboard, birds, sound settings, and instructions are inside **Menu**. Closing it resumes the flight. Switching tabs or resizing the viewport pauses it.

## Display

The original 288 × 512 logical viewport defines the scale: bird 34 × 24, pipes 52 wide, ground 112 high. A single uniform scale fits that viewport within the current browser dimensions. Wider screens extend the repeating scenery horizontally; taller screens add sky vertically. Sprites are never stretched to match an aspect ratio. The canvas uses the device pixel ratio, nearest-neighbor rendering, and the full viewport with no page scrolling, surrounding cards, or outside navigation.

The title, Get Ready prompt, tap instructions, digits, Play and leaderboard buttons, Game Over heading, medals, and scorecard use the official sheet. Additional functional menu labels use system monospace text over nine-sliced official button and panel borders. There are no generated illustrations, custom recolors, or procedural sprite fallbacks.

## Accounts and progression

Create an account using a pilot name and a password of at least eight characters. Account scores, selected outfits, sessions, and weekly badges persist in `data/flabby.sqlite`. Guest progress uses browser local storage. Guest scores are not imported into an account or the leaderboard.

The weekly board resets **Monday at 00:00 UTC**; old scores remain on the all-time board. The previous week's top 10 receive a dated High Flyer badge, awarded lazily on the next profile or leaderboard request. Tied scores use the earliest flight time, then user ID. There are no seeded leaderboard entries.

Passwords use salted scrypt hashes. Sessions use random HttpOnly, SameSite cookies. State-changing API calls check browser origins, authentication attempts are rate limited, and score submissions require a single-use run token with a duration sanity check. **The browser still controls game simulation: this is a local prototype, not cheat-resistant competitive hosting.** Public deployment would need server-authoritative runs, HTTPS (`COOKIE_SECURE=1`), account recovery, and production operations.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/register` | Create account with `{name,password}` |
| POST | `/api/login` | Start account session |
| POST | `/api/logout` | End session |
| GET | `/api/me` | Current profile, stats, badges, outfit |
| POST | `/api/runs` | Start signed-in run; returns token |
| POST | `/api/scores` | Save `{token,score}` once |
| GET | `/api/leaderboard?period=weekly` | Current weekly top 10 |
| GET | `/api/leaderboard?period=all` | All-time top 10 |
| POST | `/api/skin` | Equip unlocked `{skin}` |

## Verify

```sh
npm test
```

Tests use an isolated in-memory SQLite database and ephemeral HTTP port. They cover physics, damage, powers, viewport geometry and resize, authentication, score validation, replay protection, official bird unlocks, session expiry, weekly rollover, and badge awards. The client controller also runs against DOM/audio/canvas test doubles to verify title, Get Ready, play, pause/resume, results, guest saving, and menu flows. This controller check does not replace visual browser verification.

Source: `public/engine.mjs` is the deterministic game model, `public/assets.mjs` loads and renders the bundled sprites and sound effects, `public/game.js` provides the game UI, and `server.mjs` serves the game and account API using Node's built-in SQLite. The database and generated runtime files are ignored by Git.
