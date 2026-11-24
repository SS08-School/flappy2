import test from 'node:test';
import { checkEngine, checkServer, checkAssets, checkPipeTiming } from './checks.mjs';
import { checkClient, checkGroundLoop, checkPipeAnchoring, checkBirdAnimation, checkRefreshRates, checkPipeSampling, checkInputLatency, checkResponsiveClient, checkPreciseInputTiming } from './client-checks.mjs';
import { checkPresentation, checkBirdVariants, checkNewBestPlacement, checkDeathContinuity } from './presentation-checks.mjs';
import { checkAudio, checkGlimmer } from './audio-checks.mjs';
import { checkScoreDigits } from './score-checks.mjs';
import { checkDifficulty, checkFinalClient, checkFloorVisibility } from './difficulty-checks.mjs';
import { checkPassages } from './passage-checks.mjs';
test('original game rules and widescreen geometry', checkEngine);
test('static game server', checkServer);
test('uploaded official sprite sheet only', checkAssets);
test('original game client flow', () => checkClient());
test('animated client flow and cancellation', () => checkClient({ reducedMotion: false }));
test('screen transitions and reference-video bird presentation', checkPresentation);
test('independent official bird colors and day/night selection', checkBirdVariants);
test('NEW badge placement from the supplied reference', checkNewBestPlacement);
test('continuous death rotation across frame timing and late input', checkDeathContinuity);

test('reference idle and active bird animation', checkBirdAnimation);
test('supplied sound effects and gameplay timing', checkAudio);
test('reference medal glimmer', checkGlimmer);
test('seamless ground scrolling', checkGroundLoop);

test('pipe bases stay attached to the ground', checkPipeAnchoring);
test('240 FPS cap and refresh-independent motion', checkRefreshRates);

test('stable pipe pixels at fractional scales and high refresh rates', checkPipeSampling);
test('scorecard digit identity from actual sprite pixels', checkScoreDigits);
test('next-frame keyboard and pointer response', checkInputLatency);
test('responsive game screens and live resizing', checkResponsiveClient);
test('aspect-independent offscreen pipe timing', checkPipeTiming);
test('precise input timestamps, frame stalls and refresh jitter', checkPreciseInputTiming);
test('random final difficulty chunks and collisions', checkDifficulty);
test('final difficulty uses only official pipe graphics', checkFinalClient);

test('lower pipe caps stay fully visible above ground', checkFloorVisibility);
test('every supported chunk join has a realistically flyable passage', checkPassages);
