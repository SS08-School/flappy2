import test from 'node:test';
import { checkEngine, checkServer, checkAssets } from './checks.mjs';
import { checkClient } from './client-checks.mjs';
test('game physics and progression', checkEngine);
test('account and leaderboard API', checkServer);
test('bundled sprites and sound playback', checkAssets);
test('fullscreen client controller', checkClient);
