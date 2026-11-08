# Sources and transformations

## Research content

- Title, author, affiliation and abstract: the Inkinesis manuscript (`paper/drafts/inkinesis.pdf` in the Inkinesis repository).
- Character prompts and excerpts: `paper/data/gallery/supplementary-prompts.tex`, matched by catalog ID, carried in `lab/data/cast.json` and `lab/data/ember-prompt.txt` / `ember-excerpt.txt`.
- Every number quoted on the page is a manuscript or delivery-check figure: 94 prompt-drawn characters; contact loss 2.86 % with the wrist carriers and 95.71 % without; torso drift 0.28 % (anatomical ownership), 11.26 % (soft assignment) and 11.77 % (nearest bone), with 1,380 / 12,697 / 4,131 of 40,985 torso-quadrilateral topwear pixels displaced by more than 2 canvas px; 0 limb or garment fold-overs; 94/94 Live2D exports within the 0.005 px tolerance under the official Cubism Core, worst 0.18 × 10⁻³ px over 164 poses; two-hand objects realise 44.50 % of the commanded motion against 95.58 % overall, with ±3.75° at the shoulder and ±7.5° at the elbow in the shown example. Nothing on the page is recomputed from these; the live views measure the delivered rigs in the browser and label those measurements as such.

## Browser runtime

`static/js/rig-engine.js` bundles the Inkinesis evaluator, renderer and showcase motion from the source paths below. Unused import paths are tree-shaken. The renderer texture MIME type is changed from PNG to WebP for the optimized assets. The original 4-second showcase choreography is retained. The evaluator also reads deform keyforms stored flat (one array per key), as the binary rig container provides them; the terms are summed in the same order, so the posed geometry is bit-identical to the nested JSON form. `static/js/stage.js` draws several previews into one transparent WebGL canvas with per-rig placement and zoom (deformation comes from the unchanged `evaluateCombined`); `static/js/ainime-held.js` holds the commanded arm values of the held-object rigs, clamped to each rig's parameter bounds; `static/js/motion.js` reads the motion capabilities the rigs declare.

### Source snapshot SHA-256

| Upstream path | SHA-256 |
| --- | --- |
| `player/src/combinedRuntime.ts` | `f5aa94ba048b302be925fa26a83959345c4a2a60984b18605de83e6f738459d7` |
| `player/src/combinedRenderer.ts` | `7bdce56fcdbe55af3287a7c00d7e20b765f3c45d4669c8e61de010f7ed1d7a37` |
| `tools/media/showcaseMotion.ts` | `f851874d14d03cb6544e9768003b6de1a2917aa425abe358ee846e54eb041596` |
| `paper/drafts/inkinesis.pdf` | `25ea7b0b88ead14dbcbe44d7653dbe27d6eccd4caf287e813711028a31987f9c` |
| `paper/data/gallery/supplementary-prompts.tex` | `53e532fa79de8e6a46fa474c466f481ac12fa93698831140c277c090ba73cf4a` |
| `paper/data/gallery/gallery-macros.tex` | `484da8440ca8169dcf1f581fdba5276d7767799a0a1f2536ffe0356a78c557e4` |

## Rigs and catalog

- `lab/rigs/`: web previews (`inkinesis-web-preview-v1`) of every rig the page draws: the thirty example avatars of the Inkinesis studio and the evaluation rigs the hero, evidence, comparison and limitations sections use (`paper/comparison/results/combined94-20261008/rigs/<id>/character.inp` and `example-avatars/<id>/character.inp`). Each preview keeps the full puppet JSON (every node, parameter, binding and capability as delivered); each atlas is cropped to the rectangle its parts' UVs use, re-encoded as WebP at the original scale, and the UVs are remapped to that crop. Topology, bindings and parameter bounds are unchanged. Built with `tools/rigs/fromInp.mjs` and `rebuild.mjs`, then stored as `.ikr` containers with `toBinary.mjs`: keyforms as int32 at their own decimal scale (key-to-key differences) or float64, textures as raw bytes, gzip-compressed; every value decodes to exactly the number of the JSON preview, which the tool checks before writing. Release download links point to the unmodified files.
- `lab/data/cast.json`: the thirty studio avatars in the studio's order, with the studio labels, the live limb counts read from each rig, the held object, and the prompt text. Built with `tools/rigs/cast30.mjs` from the studio catalog (`example-avatars/catalog.json`). Card images (`lab/cast/`) and 1024×1536 illustrations (`lab/cast-full/`) are the characters' original illustrations, resized.
- `lab/data/core-deltas.json`: the per-rig maxima of the Inkinesis delivery verification of 2026-10-08 (`anime-avatars/delivery-verification-11-20.json`): largest |official Cubism Core − source evaluator| over every vertex and recorded pose, frame counts and triangle checks. `lab/data/core-vertex-05-emerald-star-wand.json.gz`: the same comparison kept per vertex for Emerald Star Wand, the rig of the verification view, recorded on 2026-11-06 with `tools/rigs/corePerVertex.mts` from `example-avatars/13-emerald-star-wand/character.inp` (SHA-256 `70a6dfc1…`) and its Live2D export `anime-avatars/05-emerald-star-wand/rig-run/live2d-fb3af41a-6b57-447c-a54a-51321224a278`: 2,539 poses, largest difference 0.000123 px.
- `lab/data/asset/`: what Vermilion Shrine Bells' `.inp` and validated Live2D export contain, read from the files themselves with `tools/rigs/assetCard.mjs`; each `.inp` page is cropped to the rectangle that holds artwork and labelled with the parts that sample it (`tools/rigs/inpPages.mjs`; byte-identical copies are reported, not repeated), and the packed Live2D page is previewed at 1024 px. Nothing else from the packages is copied.
- `lab/data/ember-source.webp`: Ember Forge Smith's illustration as drawn from its prompt, the input of the replay section.

## Recorded media

- `static/media/ainime/hero-held.webm` / `.mp4` and poster: a recording of an earlier hero stage with ten held-object rigs (Chromium MediaRecorder, VP9; MP4 transcoded from it). It plays while the live rigs load and replaces them without WebGL 2, with reduced motion or with Save-Data.
- `static/media/method/ownership-pose-*.webp` and `moved-pose-*.png`: the saved Saffron Orbit topwear ablation from `paper/data/clothing-ablation/saffron-orbit/`: the recorded pose renders with anatomical, soft-falloff and nearest-bone ownership, and the red overlays of the samples the saved analytic displacement metric counts (1,380 / 12,697 / 4,131 of 40,985 torso-quadrilateral topwear pixels moved by more than 2 canvas px at Arm L [30, 60], Arm R [−30, 0]). All renders share one crop. The overlay includes samples behind other parts and is not a visible-pixel segmentation. It is a recorded development ablation of one saved example. Hashes and projections are in `static/media/method/provenance.json`.
- `static/media/research/limit-head.mp4` and poster: the head stress sweep of the limitations section, rendered from the published preview rig of Tidal Glass with the manuscript stress combination (yaw −45°, pitch −30°, roll −30°, mouth opening 1), smoothly interpolated within its parameter bounds. Source hash in `static/media/research/sources.json`.

## Page

The page is a single `index.html` with its own stylesheet (`lab/css/lab.css`) and modules (`lab/js/`). Its header lineage is the Academic Project Page Template (CC BY-SA 4.0), which builds on Nerfies; the attribution is retained in the page footer. Google Sans Flex 600 is served locally from the official Google Fonts distribution with its OFL notice. The webcam section loads MediaPipe Tasks Vision and its face and pose landmark models from their public CDNs at runtime.
