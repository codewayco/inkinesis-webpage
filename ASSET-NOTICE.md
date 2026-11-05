# Asset and dependency notice

The Apache-2.0 license in `LICENSE` applies to the page code and the reused Inkinesis browser implementation. The academic template lineage and the heading font have the separate terms below. The license does not grant rights to external model weights, provider services, generated character artwork, or proprietary runtime SDKs.

## Character media and prompts

The example characters shown on the page (the thirty avatars of the Inkinesis studio and the evaluation rigs the live sections use), their original generation prompts and manuscript-derived descriptions are included for this project page with the project owner's authorization. Illustrations, recorded renders and web preview rigs derive from the Inkinesis example catalog, the 94-character evaluation and supporting manuscript materials. No additional asset license is asserted here; use and redistribution remain subject to applicable generation-service terms and rights in the supplied inputs. See the upstream [asset notice](https://github.com/codewayco/Inkinesis/blob/main/LICENSE-ASSETS.md).

Web preview rigs keep the delivered geometry, parameters and bindings; their textures are cropped, UV-remapped and WebP-encoded to reduce transfer size. Release download links point to the unmodified files. `static/media/method/provenance.json` and `static/media/research/sources.json` record the hashes and transformations of the recorded method renders and the stress recording. Manuscript PDFs and intermediate experiment outputs are not included.

## Academic template lineage

The publication header lineage is the [Academic Project Page Template](https://github.com/eliahuhorwitz/Academic-project-page-template/tree/original-version), derived from Nerfies, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The page now uses its own stylesheet and markup; the attribution is retained in the page footer, this notice and `SOURCES.md`.

## Runtime and upstream projects

The browser evaluator, renderer and showcase motion are adapted from Inkinesis under Apache-2.0. No psd2live implementation, See-through model weights, proprietary Cubism SDK, or provider model code is bundled. The page describes those components' role in the upstream workflow; their licenses and service terms remain separate. The webcam section loads MediaPipe Tasks Vision (Apache-2.0) and its landmark models from public CDNs at runtime; camera frames are processed on the device and never uploaded.

## Heading font

Google Sans Flex is served locally from Google Fonts under the SIL Open Font License 1.1. Copyright 2022 The Google Sans Flex Project Authors. The license is retained in `static/fonts/google-sans-flex-OFL.txt`. Upstream: https://github.com/googlefonts/googlesans-flex. Body text uses the system font stack; no other font is redistributed.
