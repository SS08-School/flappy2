// The capture shows five discrete atlas frames at 10 Hz, with a new
// stationary random position every half-second, rather than a moving shine.
export class MedalGlimmer {
  constructor() { this.cycle = -1; }
  sample(elapsed, random = Math.random) {
    const tick = Math.floor(Math.max(0, elapsed) * 10 + 1e-9);
    const cycle = Math.floor(tick / 5);
    if (cycle !== this.cycle) {
      this.cycle = cycle; this.x = Math.floor(random() * 40); this.y = Math.floor(random() * 40);
    }
    return { x: this.x, y: this.y, sprite: ['sparkleSmall', 'sparkleMedium', 'sparkle', 'sparkleMedium', 'sparkleSmall'][tick % 5] };
  }
}
