import test from 'node:test';
import { checkEngine, checkServer, checkAssets } from './checks.mjs';
import { checkClient } from './client-checks.mjs';
test('original game rules and widescreen geometry', checkEngine);
test('static game server', checkServer);
test('uploaded official sprite sheet only', checkAssets);
test('original game client flow', checkClient);
