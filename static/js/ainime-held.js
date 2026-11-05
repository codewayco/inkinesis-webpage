/* Held-object characters of the evaluation set and their held arms.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {clampParam, chainAvailable} from './stage.js';

/* Held arms and their raise pose, as used for the manuscript teaser (shoulder 30°, elbow 25°,
 * mirrored for left arms). */
export const HELD = {
  '16-ember-forge-smith': {name: 'Ember Forge Smith', props: 'hammer and tongs', arms: {'Arm R': [30, 25], 'Arm L': [-30, -25]}},
  '11-vermilion-shrine-bells': {name: 'Vermilion Shrine Bells', props: 'gohei and kagura bells', arms: {'Arm R': [30, 25], 'Arm L': [-30, -25]}},
  '15-neon-penlight-cheer': {name: 'Neon Penlight Cheer', props: 'penlight', arms: {'Arm R': [30, 25]}},
  '17-cedar-ridge-ranger': {name: 'Cedar Ridge Ranger', props: 'axe and horn', arms: {'Arm R': [30, 25], 'Arm L': [-30, -25]}},
  '18-midnight-brass-busker': {name: 'Midnight Brass Busker', props: 'trumpet', arms: {'Arm R': [30, 25]}},
  '14-twinlens-shutter-girl': {name: 'Twinlens Shutter Girl', props: 'twin-lens reflex camera', arms: {'Arm R': [30, 25]}},
  '30-vermilion-crane-host': {name: 'Vermilion Crane Host', props: 'folded fan', arms: {'Arm R': [30, 25]}},
  '13-foxfire-festival-sweet': {name: 'Foxfire Festival Sweet', props: 'candy apple and fox mask', arms: {'Arm R': [30, 25], 'Arm L': [-30, -25]}},
  '19-asphalt-comet-skater': {name: 'Asphalt Comet Skater', props: 'skateboard', arms: {'Arm L': [-30, -25]}},
  '44-citrus-seahorse-luthier': {name: 'Citrus Seahorse Luthier', props: 'guitar (two hands)', arms: {'Arm L': [-30, -25]}},
  '12-strawberry-cream-patissier': {name: 'Strawberry Cream Patissier', props: 'piping bag and whisk', arms: {'Arm R': [30, 25], 'Arm L': [-30, -25]}},
};

/** Command the held arms of a rig at raise fraction r (0 = drawn pose, 1 = teaser pose). */
export function heldValues(rig, id, r, extra = {}) {
  const values = {...extra};
  for (const [name, pose] of Object.entries(HELD[id].arms)) {
    if (!chainAvailable(rig.asset, name)) continue;
    const v = clampParam(rig.asset, name, pose.map(x => x * r));
    if (v) values[name] = v;
  }
  return values;
}

