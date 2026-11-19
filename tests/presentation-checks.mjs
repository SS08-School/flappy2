import assert from 'node:assert/strict';
import { TRANSITION_TIMING, transitionEase, resultPresentation } from '../public/transitions.mjs';
import { flapAngle, impactPresentation, wingPose, BIRD_TIMING, UP_TILT } from '../public/bird-presentation.mjs';

export function checkPresentation() {
  assert.equal(transitionEase(0),0); assert.equal(transitionEase(1),1);
  assert.ok(transitionEase(.5)>.8,'fast original card deceleration');
  assert.equal(resultPresentation(.2,12).headerOpacity,0);
  assert.equal(resultPresentation(1,12).headerOpacity,1);
  assert.equal(resultPresentation(1,12).cardVisible,false);
  assert.ok(resultPresentation(1.7,12).cardY>0);
  assert.equal(resultPresentation(2,12).cardY,0);
  assert.equal(resultPresentation(2,12).displayScore,0);
  assert.equal(resultPresentation(3.2,12).displayScore,12);
  assert.equal(resultPresentation(3.2,12).replayOpacity,1);
  assert.equal(resultPresentation(0,12,true).displayScore,12);
  assert.equal(flapAngle(.39,100),UP_TILT);
  assert.ok(flapAngle(.49,180)>UP_TILT); assert.ok(flapAngle(.7,300)>0);
  const hit=impactPresentation(0,UP_TILT),settled=impactPresentation(.6,UP_TILT);
  assert.equal(hit.flash,.8); assert.equal(settled.flash,0); assert.equal(settled.angle,Math.PI/2);
  assert.equal(impactPresentation(0,UP_TILT,true).flash,0);
  assert.equal(wingPose(0),wingPose(BIRD_TIMING.wingCycle));
  assert.ok(TRANSITION_TIMING.panelDelay>TRANSITION_TIMING.headerDelay,'header precedes card');
  return 'Reference presentation: staggered header/card/counter/buttons, wing cadence, tilt and impact passed.';
}
