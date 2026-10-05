# Inkinesis project page

An independent, English-language research project page for [Inkinesis](https://github.com/codewayco/Inkinesis). Plain HTML, CSS, JavaScript and local assets. No install, build, API keys, backend, or model service is needed.

## Preview locally

From this folder, run:

```sh
python3 -m http.server 8877 --bind 127.0.0.1
```

Open <http://127.0.0.1:8877/>. Use an HTTP server rather than opening `index.html` as a file: the live gallery fetches its catalog and compressed preview rigs.

## Publish with GitHub Pages

1. Create `codewayco/inkinesis-webpage` and push the contents of this folder to its `main` branch.
2. In **Settings → Pages**, select **Deploy from a branch**, `main`, and `/ (root)`.
3. The expected address is <https://codewayco.github.io/inkinesis-webpage/>. `.nojekyll` is included; there is no build step.
4. After that address works, update the Project Website badge in the main Inkinesis README to point there.

If using another repository name, update `og:image` in `index.html`. Runtime assets use relative paths and work beneath a GitHub Pages project path.

No deployment has been performed by the page authoring workflow. The main Inkinesis repository is independent of this folder.

## What's included

- Original research title, author, affiliation and manuscript abstract.
- Disabled **Paper · Soon** button, GitHub **Code** link and **Watch video** button for the full 53-character showcase.
- Four featured live rigs and all 53 characters in a searchable gallery; each opens an interactive rig, original generation prompt and unmodified release download links.
- Bounded controls that respect each rig's reported motion capabilities. Unsupported controls are disabled.
- Actual renderer footage, pipeline figure, VTube Studio face and hand-driven arm recordings, and software BibTeX.
- Desktop and mobile teaser compositions, reduced-motion support and keyboard-accessible dialogs.

## Files and maintenance

- `index.html`: page content, author name, abstract, software citation and release links. Replace the disabled Paper button with a real link when the manuscript is public.
- `static/css/`: local Bulma 0.9.1 and page styles using Google Sans Flex headings and the system Arial body font.
- `static/js/app.js`: gallery, navigation, videos and dialogs.
- `static/js/viewer.js`: loading, WebGL preview lifecycle and user controls.
- `static/js/rig-engine.js`: compiled Inkinesis runtime and original four-second showcase choreography. See `SOURCES.md`.
- `static/avatars.json`: 53 catalog records, complete prompts, capabilities and download URLs.
- `static/rigs/`: gzip-compressed web previews. Textures are optimized; geometry and control bindings are retained.
- `static/provenance.json`: original and preview asset hashes.
- `static/media/`: teaser, complete showcase, method figure and application recordings.

Browsers need ES modules, WebGL2 and `DecompressionStream`. Original illustrations and release download links remain accessible if a rig preview fails. Rigs load on demand; the complete showcase loads when opened. All playback is local; there are no model API calls or analytics.

The Inkinesis runtime and custom interaction code are Apache-2.0. Academic template adaptations, Bulma and character media have separate notices; see `ASSET-NOTICE.md` and `SOURCES.md`. Manuscript PDFs, private recordings, credentials, model weights and proprietary SDK binaries are not included.

## Research interactions

- **Mesh:** wireframes are evaluated from the same posed vertices and triangle indices as the textured rig. The overlay includes overlapping part meshes; it is not a newly inferred mesh.
- **Method:** six HTML-labelled pipeline panels, step highlighting and mobile horizontal scrolling. Verified joints separate the VLM proposal from Inkinesis verification. The export panel overlays actual posed Cubism Core triangles.
- **Garment ownership:** three saved Saffron Orbit assignment rules switch both the pixel map and the matched pose. Displacement counts come from the recorded topwear ablation, with provenance in `static/media/method/provenance.json`.
- **Inside the character:** six semantic layer groups from the saved Purple Couture decomposition. Scroll to separate/reassemble, or use the keyboard-accessible slider. Labels appear only at full separation; mobile uses a two-column layer grid. Reduced-motion users start with manual control.
- **Comparisons:** three matched manuscript experiments: shared clothing chains, joint blending and facial pitch. Each pair uses identical settings and framing; these are selected geometric examples, not a perceptual benchmark.
- **Limitations:** a bounded large-angle Tidal Glass stress sweep and a saved held-prop illustration example. The excluded photo input and its output are not included.
- **Quick start:** copyable local-viewer commands and upstream acknowledgments. BibTeX remains the final content section, followed by a short attribution footer.

`static/media/research/sources.json` identifies the source files and media transformations. `static/js/research.js` handles the new page interactions. Garment controls and limb availability are based on actual bound parameters via `static/js/motion.js`. Ember Waltz has subpixel garment deformation in its original rig, which is disclosed in its viewer rather than amplified.

Run the capability and motion regression checks with Node.js 22+:

```sh
node --test tests/motion.test.mjs
```

The footer credits the Academic Project Page Template and Nerfies with a visible CC BY-SA 4.0 link. Comparison labels read “Without / Inkinesis”; the exact baseline and method names remain beneath each pair. Links and primary buttons use one blue accent; author and affiliation text remain black and unlinked.
