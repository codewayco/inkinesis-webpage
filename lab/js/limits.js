/* Limitations: a two-hand object is restricted rather than solved jointly. The commanded raise
 * and the angle the rig allows are both read live from the delivered rig.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {loadPreview, defaults} from './scene.js';
import {heldValues} from '../../static/js/ainime-held.js';
import {showcaseLegs} from './rigmath.js';
import {$, reduced, heldRig, whenNear} from './util.js';

const ID = '44-citrus-seahorse-luthier';

export function limits(scene) {
  const el = $('#limit-view');
  if (!el || !scene.ok) return;
  whenNear(el, async () => {
    const asset = await loadPreview(heldRig(ID)), base = defaults(asset);
    const cmd = $('.am-cmd', el), real = $('.am-real', el), cmdBar = $('.am-cmd-bar', el), realBar = $('.am-real-bar', el);
    let rig = null;
    const view = scene.view(el, {update});
    rig = await view.add(asset, {fit: .9, y: .46});
    el.classList.add('is-live');
    function update(t) {
      if (!rig) return;
      const r = reduced ? 1 : .5 - .5 * Math.cos(t * 1.5), commanded = 30 * r;
      rig.values = {...base, ...heldValues(rig, ID, r), ...(reduced ? {} : showcaseLegs(asset, t))};
      const reached = Math.abs(rig.values['Arm L']?.[0] ?? 0);
      cmd.textContent = commanded.toFixed(1) + '°'; real.textContent = reached.toFixed(1) + '°';
      cmdBar.style.width = (commanded / 30 * 100) + '%'; realBar.style.width = (reached / 30 * 100) + '%';
    }
  });
}
