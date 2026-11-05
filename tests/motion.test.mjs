import test from 'node:test';
import assert from 'node:assert/strict';
import {motionProfile} from '../static/js/motion.js';

test('missing chain metadata does not invent moving limbs', () => {
  assert.deepEqual(motionProfile({meta: {}, param: []}), {arms: [], legs: [], garmentSway: false});
  const param = [{name: 'Arm L', bindings: [{}]}];
  assert.equal(motionProfile({meta: {}, param}).arms.length, 1);
  assert.equal(motionProfile({meta: {motionCapabilities: {chains: {'Arm L': {mode: 'fixed'}}}}, param}).arms.length, 0);
  assert.equal(motionProfile({meta: {capabilities: {arms: false}}, param}).arms.length, 0);
});
