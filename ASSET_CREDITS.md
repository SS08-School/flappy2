# Asset credits

Flappy Bird was created by **Dong Nguyen / .GEARS**. This browser build follows the supplied v1.3 video reference. The [additional bird-animation clip](https://www.youtube.com/watch?v=1vo4HPystfM) is used only to measure wing cadence and idle bobbing; no artwork or audio from it is shipped.

All runtime graphics use the uploaded **Mobile - Flappy Bird - Miscellaneous - General Sprites (v1.3).png**, copied unchanged to `public/assets/flappy/official-v1.3.png`.

SHA-256: `e905c929c0de3d59c565d8903db7f3ca27cd78fa76212dcf14db2796d3b2ad7d`.

The yellow bird, day/night backgrounds, ground, pipes, title, Get Ready instructions, Rate/Play/leaderboard buttons, copyright caption, large and result-screen number glyphs, Game Over heading, medals, all three sparkle sizes, NEW indicator, and scorecard are cropped directly from that sheet. No generated graphics, recolors, external fonts, added visible text, or other downloaded runtime assets are used.

The user supplied `wing.mp3`, `hit.mp3`, `die.mp3`, `swooshing.mp3` and `Flappy_Bird_Point_Sound.ogg` in `data/sound effects/`. They are copied byte-for-byte to `public/assets/audio/`. No sound was downloaded from another game project or generated. The reference recording is used for timing analysis only and is not shipped.

The reference video's recording overlays and watermarks are not part of the game and are not reproduced. Rate and leaderboard buttons currently display the original graphics without opening an external service.

Final difficulty uses the same official green pipe crops, including the opposing upper/lower banks. Numeric section layouts and movement behaviors reference the supplied [High Score 999 video](https://www.youtube.com/watch?v=YHH2101OFfI). Sections are shortened and aligned for playability; staggered stationary roofs cover displaced floor groups, with constant-speed reversals, three-pipe staircases, a separately measured stationary diagonal tunnel (48–51 s), finite one-pipe exit overlaps, and varied bird-relative leftward approaches that continue offscreen. No images, sounds, colored pipes, flowers, Mario or other assets from that recording are shipped, and no AI-generated assets are used.
