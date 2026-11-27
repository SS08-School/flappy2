import test from 'node:test';
import { checkEngine, checkServer, checkAssets, checkPipeTiming, checkClassicVariety } from './checks.mjs';
import { checkClient, checkGroundLoop, checkPipeAnchoring, checkBirdAnimation, checkRefreshRates, checkPipeSampling, checkInputLatency, checkResponsiveClient, checkDeviceInvariantGameplay, checkPreciseInputTiming } from './client-checks.mjs';
import { checkPresentation, checkBirdVariants, checkNewBestPlacement, checkDeathContinuity } from './presentation-checks.mjs';
import { checkAudio, checkGlimmer } from './audio-checks.mjs';
import { checkScoreDigits } from './score-checks.mjs';
import { checkBackgroundJoins } from './background-checks.mjs';
import { checkDifficulty, checkLevel3Client, checkFloorVisibility, checkStationaryBankAlignment, checkLiveChunkQueue, checkMovingSpeedVariety } from './difficulty-checks.mjs';
import { checkPassages, checkChunkContinuity, checkWindingTunnels, checkRoofApproach, checkOverlayTips, checkTurnWindows } from './passage-checks.mjs';
import { checkBackgroundPrefetch } from './prefetch-checks.mjs';

test('background obstacle preparation never blocks flaps or rewinds the queue', checkBackgroundPrefetch);
test('intentional pipe groups stay synchronized while independent neighbors vary',checkMovingSpeedVariety);
test('turns allow varied approach states without horizontal control',checkTurnWindows);
test('original game rules and widescreen geometry', checkEngine);
test('continuous random classic heights without alternating repeats', checkClassicVariety);
test('foreground diagonal overlays leave pipe tips uncovered', checkOverlayTips);
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
test('seamless original day and night background joins', checkBackgroundJoins);

test('pipe bases stay attached to the ground', checkPipeAnchoring);
test('240 FPS cap and refresh-independent motion', checkRefreshRates);

test('stable pipe pixels at fractional scales and high refresh rates', checkPipeSampling);
test('scorecard digit identity from actual sprite pixels', checkScoreDigits);
test('next-frame keyboard and pointer response', checkInputLatency);
test('responsive game screens and live resizing', checkResponsiveClient);

test('identical gameplay across devices and mobile rotation protections', checkDeviceInvariantGameplay);
test('aspect-independent offscreen pipe timing', checkPipeTiming);
test('precise input timestamps, frame stalls and refresh jitter', checkPreciseInputTiming);
test('random level 3 difficulty chunks and collisions', checkDifficulty);
test('live prefetch never teleports chunks or creates visible obstacles', checkLiveChunkQueue);
test('level 3 difficulty uses only official pipe graphics', checkLevel3Client);

test('lower pipe caps stay fully visible above ground', checkFloorVisibility);
test('stationary pipe groups preserve level tips and authored shapes', checkStationaryBankAlignment);
test('every supported chunk join has a realistically flyable passage', checkPassages);
test('continuous tunnel spacing across chunk joins', checkChunkContinuity);
test('varied tunnel dips and staircases remain realistically flyable', checkWindingTunnels);
test('descending enclosed approaches lead into unchanged roof formations', checkRoofApproach);
