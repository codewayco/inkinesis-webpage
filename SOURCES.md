# Sources and transformations

The page uses the Inkinesis manuscript and delivered assets, not generated research claims.

## Research content

- Title, author, affiliation and expanded abstract: `paper/drafts/inkinesis.pdf`.
- Character prompts: `paper/data/gallery/supplementary-prompts.tex`, matched by catalog ID.
- Reported timing and correspondence counts: `paper/data/gallery/gallery-macros.tex` and the manuscript.
- VTube Studio explanation: the application manuscript, “Driving a Generated Character in VTube Studio.”
- Software citation: upstream `CITATION.cff`; no unpublished paper identifier is invented.

## Browser runtime

`static/js/rig-engine.js` bundles the Inkinesis evaluator, renderer and showcase motion from the source paths below. Unused import paths are tree-shaken. The renderer texture MIME type is changed from PNG to WebP for the optimized assets. The original 4-second angle/timing choreography is retained.

Web previews preserve the rig node geometry, parameters and bindings. Each atlas is alpha-cropped with transparent padding, its UVs are remapped to the cropped rectangle, and the texture is resized to at most 1600 px and WebP encoded before gzip compression. Original downloads remain unchanged.

The desktop and mobile teasers were captured from this evaluator at 24 fps. Application videos are H.264 conversions of existing README GIF excerpts, at original speed. The complete showcase is copied without editing.

## Source snapshot SHA-256

| Upstream path | SHA-256 |
| --- | --- |
| `player/src/combinedRuntime.ts` | `f5aa94ba048b302be925fa26a83959345c4a2a60984b18605de83e6f738459d7` |
| `player/src/combinedRenderer.ts` | `7bdce56fcdbe55af3287a7c00d7e20b765f3c45d4669c8e61de010f7ed1d7a37` |
| `tools/media/showcaseMotion.ts` | `f851874d14d03cb6544e9768003b6de1a2917aa425abe358ee846e54eb041596` |
| `paper/drafts/inkinesis.pdf` | `25ea7b0b88ead14dbcbe44d7653dbe27d6eccd4caf287e813711028a31987f9c` |
| `paper/data/gallery/supplementary-prompts.tex` | `53e532fa79de8e6a46fa474c466f481ac12fa93698831140c277c090ba73cf4a` |
| `paper/data/gallery/gallery-macros.tex` | `484da8440ca8169dcf1f581fdba5276d7767799a0a1f2536ffe0356a78c557e4` |

## Page template

The publication header follows the Academic Project Page Template original-version branch (CC BY-SA 4.0), as used by Textoon. The page uses the same Bulma 0.9.1 base locally and a white-background stylesheet with Arial body text and Google Sans Flex headings. Rig scene backgrounds and teaser compositions are white; motion parameters and timing are unchanged.

## Interactive research examples

`static/media/research/sources.json` records manuscript comparison images and saved decomposition layer files. Pair images are cropped identically and encoded as WebP without retouching. Layer groups are alpha-composited and cropped with original registration stored in `layers.json`.

The Mesh view uses `evaluateCombined` from the existing rig engine and original triangle indices. Canvas 2D overlays the posed wireframe on the WebGL texture render, including overlapping meshes. No motion or topology is invented.

The Tidal Glass stress clip uses the current published preview rig and the manuscript stress-control combination (yaw -45, pitch -30, roll -30, mouth 1), smoothly interpolated within its parameter bounds and cropped consistently. The held-prop clip comes from the saved Graphite Orchid Violinist stress recording. Transparent recording backgrounds are composited on white. No photo input example is included.

Google Sans Flex 600 is served locally from the official Google Fonts distribution, with its OFL notice. Template attribution is visible in the page footer.

The coordinated facial movement card uses Obsidian Bat Cabaret. Both variants are rebuilt from its saved poses, atlas, landmarks, reference and configuration, with only `coherentPitch` disabled for “Without” in an isolated scratch builder. The shared variant matches published nodes and parameters. Variant geometry, textures, neck bindings and non-head controls are unchanged. Source and variant hashes and validation are recorded in `static/media/research/sources.json`.

A single paired 6-second, 24-fps recording uses 0° → −30° → 0°, mouth opening 0.7, eyes open and zero yaw/roll. The wider shared framing shows the head and shoulders. This selected range avoids the exposed neck boundary seen in positive-pitch stress poses; it is not a demonstration of all angles. The swipe samples both halves of the exact same video frame. A separate full-width detail row shows equal eye/brow close-ups rendered at the same −30° pose (2.5 seconds) with identical closer cameras. Blue ellipses are separate annotations; textures and contrast are unchanged. The text describes the visible separated brow contour in this specific comparison, not universal or perceptual superiority.

The opening teaser lineup (2026-10-05) is Purple Couture, Saffron Orbit, Ochre Nomad, Ruby Encore and Saffron Jester Acrobat. The mobile composition retains positions 1, 2 and 5. Both are 4-second, 24-fps recordings of the unchanged showcase motion from `static/js/rig-engine.js`, on white, with supported chains only. Their posters are neutral first frames. Input/output hashes and supported limb profiles are in `static/media/hero-provenance.json`.

## Method evidence refresh — 5 October 2026

The six web pipeline panels are composed from the saved Purple Couture source, semantic layers, registered expression edits and verified `analysis.json` landmarks in `old-avatars-v0.2/04-purple-couture/run`. The posed composition uses the published web preview. The export panel is a fresh render of the matching exported MOC3 through official Cubism Core; its right half overlays the actual posed Core triangles using the renderer’s MVP matrix. No SDK code is distributed. The recorded validation contains 379 poses, 1 strict mismatch and 0 Core-aware mismatches; the visible caption preserves that distinction. The new presentation uses step badges 01 / 02 / 02 / 02 / 03 / 04 and explicitly distinguishes VLM proposal from Inkinesis verification.

The ownership explorer uses the saved Saffron Orbit topwear ablation from `paper/data/clothing-ablation/saffron-orbit/`: nearest-bone labels, soft-falloff weights and anatomical labels, plus the recorded matching pose renders. All maps share a crop and all renders share a crop. Only topwear is colored; soft weights are mixed colors, not discrete bone labels. Pixel displacement counts are from `paper/data/clothing-ablation/summary.json`, measured on 40,985 garment pixels in the torso quadrilateral. These are geometric measurements of one saved example, not perceptual quality scores. The anatomical map reads ownership from delivered fragments; its pose render is the ablation script’s reconstructed anatomical rig. It is a recorded development ablation, not a re-evaluation of every current gallery rig.

Input/output hashes, source paths, exact pose controls, exported topology counts and verification values are in `static/media/method/provenance.json`. “Inside the character” and all existing comparison interactions are preserved.

## Measured ownership overlay and Method flow

The optional red overlay recomputes the saved analytic displacement metric from lossless label maps and the stored arm chains at Arm L [30,60], Arm R [-30,0]. All three counts reproduce exactly: 1,380 / 4,131 / 12,697 of 40,985 torso-quadrilateral topwear pixels exceed 2 canvas pixels. The left overlay locates these samples at rest; the right projects their measured displacements through the original render camera and unchanged crop. It includes samples behind other parts and must not be described as visible-pixel segmentation. `moved-pixels.json.gz` preserves all sparse [rest x, rest y, posed x, posed y] samples; `provenance.json` records hashes and projections.

Method now presents pipeline → saved layers → ownership → motion limits → component evidence. Layer pieces interpolate smoothly into anatomically ordered grid slots, keeping head groups above the legs. Legs end on the bottom row. All Method subsection headings use the same styling, and ownership figures stack on mobile. The shortened export summary explicitly retains the runtime-sampling qualification; strict/Core-aware counts remain available in the verification footnote.
