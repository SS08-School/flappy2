// Visual timings measured from the user's reference clip, not nebezbird.
const clamp = value => Math.max(0, Math.min(1, value));
export const BIRD_TIMING = { upHold: .4, upRelease: .18, hitFlash: .55, hitTurnDelay: .12, hitTurn: .43 };

export function flapAngle(elapsedSinceFlap, velocity) {
  const target = Math.max(-.3, Math.min(1.4, velocity * .003));
  const release = clamp((elapsedSinceFlap - BIRD_TIMING.upHold) / BIRD_TIMING.upRelease);
  return -.3 + (target + .3) * release;
}

export function impactPresentation(elapsed, startingAngle, reducedMotion = false) {
  const turn = clamp((elapsed - BIRD_TIMING.hitTurnDelay) / BIRD_TIMING.hitTurn);
  return {
    flash: reducedMotion ? 0 : .8 * (1 - clamp(elapsed / BIRD_TIMING.hitFlash)) ** 2,
    angle: reducedMotion ? Math.PI / 2 : startingAngle + (Math.PI / 2 - startingAngle) * turn ** 2,
  };
}
