import assert from 'node:assert/strict';
import { transitionEase, resultPresentation } from '../public/transitions.mjs';
import { flapAngle, impactPresentation } from '../public/bird-presentation.mjs';

export function checkPresentation() {
  assert.equal(transitionEase(0), 0); assert.equal(transitionEase(1), 1);
  assert.ok(transitionEase(.5) > .79 && transitionEase(.5) < .81, 'standard CSS ease curve');
  const start = resultPresentation(0), cardVisible = resultPresentation(.6), replayVisible = resultPresentation(1.2), complete = resultPresentation(1.8);
  assert.equal(start.cardOpacity, 0); assert.equal(start.cardY, 40);
  assert.equal(cardVisible.cardOpacity, 1); assert.equal(cardVisible.replayOpacity, 0);
  assert.equal(replayVisible.replayOpacity, 1); assert.ok(replayVisible.medalScale > 1 && replayVisible.medalScale < 2);
  assert.ok(Math.abs(complete.medalScale - 1) < .00001);
  const gone = resultPresentation(2, 1); assert.equal(gone.cardOpacity, 0); assert.equal(gone.cardY, -40);
  const reduced = resultPresentation(0, null, true); assert.equal(reduced.cardOpacity, 1); assert.equal(reduced.replayOpacity, 1); assert.equal(reduced.medalScale, 1);
  assert.equal(flapAngle(.39, 100), -.3, 'upward pose lasts through the measured hold');
  assert.ok(flapAngle(.49, 180) > -.3 && flapAngle(.49, 180) < .54, 'nose-down release is gradual');
  assert.ok(flapAngle(.7, 300) > 0, 'bird tips down after the hold');
  const hit = impactPresentation(0, -.3), settling = impactPresentation(.3, -.3), settled = impactPresentation(.6, -.3);
  assert.equal(hit.flash, .8); assert.equal(hit.angle, -.3);
  assert.ok(settling.flash > 0 && settling.flash < hit.flash); assert.ok(settling.angle > hit.angle);
  assert.equal(settled.flash, 0); assert.equal(settled.angle, Math.PI / 2);
  assert.equal(impactPresentation(0, -.3, true).flash, 0);
  return 'Presentation: staged transitions, replay exit, upward-pose hold, impact fade/rotation, and reduced motion passed.';
}
