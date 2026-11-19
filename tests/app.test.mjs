import test from 'node:test';
import { checkEngine, checkServer, checkAssets } from './checks.mjs';
test('game physics and progression', checkEngine);
test('account and leaderboard API', checkServer);
test('bundled sprites and sound playback', checkAssets);
