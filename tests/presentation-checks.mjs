import assert from 'node:assert/strict';
import { TRANSITION_TIMING, transitionEase, resultPresentation } from '../public/transitions.mjs';
import { flapAngle, impactPresentation, wingPose, BIRD_TIMING, UP_TILT } from '../public/bird-presentation.mjs';
import { createClient } from './client-checks.mjs';

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
  for(const start of [UP_TILT,0,Math.PI/4,Math.PI/2]){
    let previous=start;
    for(let t=0;t<1;t+=.001){const angle=impactPresentation(t,start).angle;assert.ok(angle>=previous-1e-10&&angle<=Math.PI/2+1e-10,'death rotation never reverses toward forward');previous=angle;}
  }
  assert.equal(wingPose(0),wingPose(BIRD_TIMING.wingCycle));
  assert.ok(TRANSITION_TIMING.panelDelay>TRANSITION_TIMING.headerDelay,'header precedes card');
  return 'Reference presentation: staggered header/card/counter/buttons, wing cadence, tilt and impact passed.';
}

const birdCommand=c=>c.elements.get('game').context.commands.find(p=>p.kind==='image'&&p.args[2]===34&&p.args[3]===24);
const palette={yellow:[[6,982],[62,982],[118,982]],blue:[[174,982],[230,658],[230,710]],red:[[230,762],[230,814],[230,866]]};
const colorOf=c=>Object.keys(palette).find(color=>palette[color].some(([x,y])=>{const p=birdCommand(c);return p.args[0]===x&&p.args[1]===y;}));
const backgroundOf=c=>c.elements.get('game').context.commands.find(p=>p.kind==='image'&&p.args[2]===288&&p.args[3]===512).args[0];
export async function checkBirdVariants(){
  for(const [menu,color] of Object.keys(palette).entries())for(const [run,runColor] of Object.keys(palette).entries())for(const night of [false,true]){
    const values=[(menu+.5)/3,(run+.5)/3,night?.75:.25];let draws=0;
    const c=await createClient({width:288,height:384,random:()=>{draws++;return values.shift()??0;}});
    c.tick(1/240);assert.equal(colorOf(c),color);assert.equal(backgroundOf(c),0,'menu always uses the official day background');
    c.controller.prepareRun();c.tick(1/240);
    assert.equal(colorOf(c),runColor,'first run is selected independently of the menu bird');assert.equal(backgroundOf(c),night?292:0,'first run can be day or night');
    assert.equal(draws,3,'menu, run bird and run background have independent random draws');
    c.controller.flap();c.controller.game.score=1;c.controller.game.bird.y=c.controller.game.ground;c.tick(.02);
    assert.equal(colorOf(c),runColor,'the selected color stays through death and results');
    c.controller.prepareRun();c.tick(1/240);assert.equal(colorOf(c),'yellow','replay rerolls the bird');assert.equal(backgroundOf(c),0,'replay rerolls the background');
    assert.equal(draws,5);
  }
  return 'All three official bird colors and both run backgrounds are independent from the menu, including first play and replay.';
}
export async function checkNewBestPlacement(){
  const c=await createClient({width:288,height:384});c.controller.prepareRun();c.controller.flap();
  const game=c.controller.game;game.score=1;game.bird.y=game.ground;c.tick(.02);
  const commands=c.elements.get('game').context.commands;
  const badge=commands.find(p=>p.kind==='image'&&p.args[0]===224&&p.args[1]===1002&&p.args[2]===32);
  assert.ok(badge);assert.deepEqual(Array.from(badge.args.slice(4)),[166,189,32,14],'NEW stays two native pixels left of BEST, matching the supplied screenshot');
  c.controller.prepareRun();c.controller.flap();game.score=1;game.bird.y=game.ground;c.tick(.02);
  assert.ok(!c.elements.get('game').context.commands.some(p=>p.kind==='image'&&p.args[0]===224&&p.args[1]===1002&&p.args[2]===32),'a tied best is not marked NEW');
  return 'NEW uses the official badge at native (166,189), immediately left of BEST, and only appears for an improved score.';
}
export async function checkDeathContinuity(){
  for(const fps of [30,60,144,240]){
    const c=await createClient({reducedMotion:false,width:614.4,height:384});c.tick(.36);c.controller.prepareRun();c.tick(.9);c.controller.flap();
    const game=c.controller.game;game.pipes=[];
    for(let i=0;i<Math.ceil(.7*fps);i++){game.bird.y=100;game.bird.vy=0;c.tick(1/fps);}
    // Collision occurs between draws: the old rendered pose is forward, but
    // the incoming physical descent is already nose-down.
    game.bird.vy=700;game.hit();
    for(let i=0;i<Math.ceil(.8*fps);i++){
      c.tick(1/fps);const p=birdCommand(c),angle=Math.atan2(p.matrix[1],p.matrix[0]);
      assert.ok(Math.abs(angle-Math.PI/2)<1e-8,'a nose-down impact never resets to forward');
    }
    c.tick(3);c.controller.prepareRun();c.tick(.9);c.controller.flap();game.pipes=[];
    assert.equal(game.state,'playing');
    for(let i=0;i<Math.ceil(.7*fps);i++){game.bird.y=100;game.bird.vy=0;c.tick(1/fps);}
    game.bird.y=game.ground-13;game.bird.vy=700;c.elapse(.003);c.controller.flap();c.tick(1/240);
    const p=birdCommand(c);assert.ok(Math.abs(Math.atan2(p.matrix[1],p.matrix[0])-Math.PI/2)<1e-8,'a too-late flap cannot reset the death pose while committing old motion');
  }
  const upward=await createClient({reducedMotion:false});upward.tick(.36);upward.controller.prepareRun();upward.tick(.9);upward.controller.flap();
  const game=upward.controller.game;game.pipes=[];
  for(let i=0;i<90;i++){game.bird.y=100;game.bird.vy=0;upward.tick(1/120);}
  upward.controller.flap();game.hit();upward.tick(1/240);
  const p=birdCommand(upward);assert.ok(Math.abs(Math.atan2(p.matrix[1],p.matrix[0])-UP_TILT)<1e-8,'an upward collision keeps its actual incoming flap pose');
  return 'Death poses retain the actual incoming nose-down angle through between-frame collisions and late inputs at 30–240 Hz.';
}
