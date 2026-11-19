# Flabby Bird

A playable Flappy Bird inspired fangame based on the proposal by Sebastian Szeliga and Joel Ramirez. Bird animations, pipes, day/night backgrounds, ground, and sound effects are bundled locally from [noanonoa/flappy-bird](https://github.com/noanonoa/flappy-bird). No runtime asset downloads or package dependencies are required. See [ASSET_CREDITS.md](ASSET_CREDITS.md) for sources.

## Run locally

Install **Node.js 22.13 or newer** (Node 24 LTS recommended), then run from this folder:

```sh
npm start
```

Open **http://localhost:3000**. `npm run dev` restarts the server when source files change. Set `PORT` to choose a different port. The server listens on the local machine only.

## Play

- **Space**, **Up**, or a tap on the game flaps. **P** or **Escape** pauses.
- Two health halves; the first collision grants two seconds of recovery.
- Every 10 points increases speed and pipe spacing. Difficulty has a ceiling.
- Collect a **snail** to slow the world for seven seconds or a **cloak** to pass through pipes for six seconds. Cloaks do not protect against the ground.
- The first powerup appears at 7–9 points, then every 8–12 points.
- Six outfits unlock at personal bests of 0, 10, 25, 50, 100, and 200.
- The original yellow, red, and blue bird animations appear in the wardrobe, alongside three custom recolors. Backgrounds alternate between day and night every 30 points.
- Closing a dialog resumes an active flight. Switching tabs pauses it.

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

Tests use an isolated in-memory SQLite database and ephemeral HTTP port. They cover physics, damage, powers, pause, score progression, authentication, score validation, replay protection, outfit locks, session expiry, weekly rollover, and badge awards.

Source: `public/engine.mjs` is the deterministic game model, `public/assets.mjs` loads and renders the bundled sprites and sound effects, `public/game.js` provides the game UI, and `server.mjs` serves the game and account API using Node's built-in SQLite. The database and generated runtime files are ignored by Git.
