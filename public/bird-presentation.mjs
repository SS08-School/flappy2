// Visual timings measured from the user's reference clip, not nebezbird.
const clamp = value => Math.max(0, Math.min(1, value));
export const BIRD_TIMING = { upHold: .4, upRelease: .18, hitFlash: .55, hitTurnDelay: .12, hitTurn: .43, wingCycle: 28 / 60, bobCycle: .75 };
export const UP_TILT = -25 * Math.PI / 180;

export function wingPose(elapsed) {
  return [-1, 0, 1, 0][Math.floor(elapsed / (BIRD_TIMING.wingCycle / 4)) % 4];
}
export function idleBob(elapsed) { return 3 * Math.sin(elapsed * Math.PI * 2 / BIRD_TIMING.bobCycle); }

export function flapAngle(elapsedSinceFlap, velocity) {
  const target = Math.max(UP_TILT, Math.min(Math.PI / 2, velocity * .0045));
  const release = clamp((elapsedSinceFlap - BIRD_TIMING.upHold) / BIRD_TIMING.upRelease);
  return UP_TILT + (target - UP_TILT) * release;
}

export function impactPresentation(elapsed, startingAngle, reducedMotion = false) {
  const turn = clamp((elapsed - BIRD_TIMING.hitTurnDelay) / BIRD_TIMING.hitTurn);
  return {
    flash: reducedMotion ? 0 : .8 * (1 - clamp(elapsed / BIRD_TIMING.hitFlash)) ** 2,
    angle: reducedMotion ? Math.PI / 2 : startingAngle + (Math.PI / 2 - startingAngle) * turn ** 2,
  };
}
