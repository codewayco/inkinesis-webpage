<div align="center">

<h3><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/title-dark.png">
  <img src="docs/media/title-light.png" alt="Inkinesis" width="258">
</picture><br>
Prompt-to-Rig for Anime Characters with Garment Ownership, Held-Object Carriers, and Verified Live2D Export</h3>

<p><a href="https://wacv.thecvf.com/"><img src="docs/media/wacv-2027.png" alt="WACV 2027" width="222"></a><br><b>Describe a character. Make it move.</b></p>

![Paper](https://img.shields.io/badge/Paper-coming%20soon-lightgrey.svg)
[![Project Website](https://img.shields.io/badge/Project%20Website-1769aa.svg)](https://codewayco.github.io/inkinesis-webpage/)
[![Code](https://img.shields.io/badge/Code-1769aa.svg?logo=github&logoColor=white)](https://github.com/codewayco/Inkinesis)
[![Apache-2.0](https://img.shields.io/badge/Apache--2.0-blue.svg)](LICENSE)
[![Export: Inochi2D, Live2D](https://img.shields.io/badge/Export-Inochi2D%2C%20Live2D-6b4fbb.svg)](https://github.com/codewayco/Inkinesis/blob/main/docs/instructions/live2d_export.md)
<!-- When the paper is published, replace the Paper badge with the arXiv link. -->

</div>

This repository is the project page of [Inkinesis](https://github.com/codewayco/Inkinesis), published at <https://codewayco.github.io/inkinesis-webpage/>. Every character on the page is a live Inkinesis rig evaluated in the browser: the hero lineup, the method walkthrough, the ablations, the playground with the thirty studio avatars, the webcam mirror and the Live2D verification views all run the delivered rigs, not recordings.

## Preview locally

From this folder, run:

```sh
python3 serve.py
```

It starts a local server with caching disabled and opens <http://127.0.0.1:8877/> in your browser (the next free port is used if 8877 is busy). Stop it with Ctrl+C. Use an HTTP server rather than opening `index.html` as a file: the page fetches its catalog and compressed preview rigs.

Browsers need ES modules, WebGL 2 and `DecompressionStream`. The webcam section loads MediaPipe from a CDN at runtime; video never leaves the device.

## Publish with GitHub Pages

1. Push this folder to the `main` branch of `codewayco/inkinesis-webpage`.
2. In **Settings → Pages**, select **Deploy from a branch**, `main`, and `/ (root)`.
3. The page is served at <https://codewayco.github.io/inkinesis-webpage/>.

If using another repository name, update `og:image` in `index.html`.

## Files

- `index.html`: page content, abstract, citation and release links. It loads `lab/css/lab.css` and `lab/js/main.js`.
- `lab/js/`: one shared WebGL scene (`scene.js`) that draws every live rig on the page, and one module per section: `hero.js` (fifteen rigs, held-object and free-handed alternating, ghost-cursor demo), `evidence.js` (Core replay, live carrier loop, recorded ownership renders, live fold detector), `replay.js` (prompt-to-rig replay with a scrubbable progress bar and word-to-layer links), `story.js` (scroll-driven method), `compare.js` (three live ablations on one rig: carriers, garment ownership, joint blend), `playground.js` + `viewer.js` (the thirty studio avatars loading into one inline viewer, pose permalinks, tap-to-wake on touch), `mirror.js` (webcam), `verify.js` (click-to-zoom Core comparison and the per-rig heat map), `limits.js`, `asset.js` (what Vermilion Shrine Bells' `.inp` and Live2D package contain; data in `lab/data/asset/`).
- `lab/rigs/`: full-resolution web previews of every rig the page draws, rebuilt from the original `character.inp` files at the original atlas scale. `lab/data/cast.json`: the thirty example avatars of the Inkinesis studio in its order; card images in `lab/cast/`, 1024×1536 originals in `lab/cast-full/`. `lab/data/core-deltas.json` and `core-vertex-05-emerald-star-wand.json.gz`: the recorded official-Core comparisons the verification section draws.
- `static/js/rig-engine.js`, `stage.js`, `motion.js`, `ainime-held.js`: the Inkinesis runtime and helpers the lab modules import. See `SOURCES.md`.
- `static/media/`: the hero fallback recording, the recorded ownership renders and the head stress recording of the limitations section.
- `tools/rigs/`: `fromInp.mjs` builds a web preview straight from an `.inp` (needs `cwebp`); `rebuild.mjs` re-textures an existing preview; `cast30.mjs` regenerates `cast.json` from the studio catalog (`INKINESIS_DIR` points at an Inkinesis checkout); `assetCard.mjs` builds `lab/data/asset/` from a character's `.inp` and its validated Live2D export; `corePerVertex.mts` records the per-vertex Core comparison from inside an Inkinesis checkout.

## Tests

```sh
node --test tests/motion.test.mjs
```

## License

Code is Apache-2.0. Character media, the heading font and the page template lineage have separate notices; see `ASSET-NOTICE.md` and `SOURCES.md`.
