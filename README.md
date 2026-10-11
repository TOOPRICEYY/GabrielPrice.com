# GabrielPrice.com: scroll mock

Open `index.html` in a browser (it loads three.js from jsDelivr, so you need to be online). It loads build photos and clips from `photos/`, so keep that folder next to it.

- `src/main.html`: the page, styles and scene and scroll code. `src/rigs.js` holds the other builds (see below). Edit these.
- `src/kicker_data.js`: The Kicker meshes from Fusion 360, packed as base64.
- `src/figure_data.js`: the figure (see "Gabriel's own body, rigged" below).
- `src/pack.py`: rebuilds `kicker_data.js` from `kicker_export/`. `src/pack_v20.py` packs the v20 export in `kicker_export_v20/`.
- `src/build.sh`: inlines the data and writes `index.html` and `artifact.html` (the body-only version used for the hosted preview).

The photo-proof test fork was merged into the main site on 2026-10-11 (again at fork v40). Later fork work can be merged again the same way. Section 07 has the as-built photo wipe over the render (`#proof`, keyed to s 5.95–6.8 in frame()) and a strip of builds (v1 clear PETG, v2 black PLA, v3 with the knee module).
Photos live in photos/, as WebP with EXIF stripped. Build it with `sh src/build.sh`, same as the main site. Published at https://claude.ai/artifact/Ct6ig3K5vHwUqkpuCh4FBr.

## The figure uses every device (2026-10-10)
Gabriel wanted the builds used by the figure itself, like the brace, so the separate Workshop sheet was folded into the scroll story. Sections 7–12 are: walk in the full brace, crutch with the cup holder, knee scooter, swerve couch, shoulder cat turret, and a closing card.
- `src/rigs.js` holds all of it. `build.sh` inlines it at `/*RIGS*/` in main.html. It adds poses, splices `poseKeys`/`camKeys`, builds the devices (`rigBuild`) and runs them each frame (`rigFrame`). Hands and feet go on grips, pedals and the wheel by two-bone IK on top of the keyed pose.
- Camera keys for these scenes carry a 5th value, a sideways pan in cm that moves the subject clear of the card on desktop. On phones the same keys back off ×1.35 and look lower. Between two such keys the camera orbits the target instead of moving in a straight line.
- Meshes: Scooter Asm v4, Cat Turret v4 and Steering hub v9 come from `src/workshop_data.js` (packed by `src/pack_workshop.py`). The crutch, sofa, steering column, swerve wheels and the cat are primitives built in code.
- The brace is Assembled BRace v6 (The Kicker v22 + die springs + knee hinge + thigh cuffs), packed by `src/pack_brace.py` from `GabrielPrice/fusion_exports/brace/`. Its knee axis sits on the figure's knee; the thigh side turns about the hinge so the upper cuff stays on the thigh axis.
- `src/workshop.html` is no longer included in the build. It is kept only for reference.

## Pose-doll body (2026-10-10, "mannequin refinement" thread)
Gabriel asked for no muscular definition, like a default pose doll in a modelling program. `src/figure/dummify.py` fairs the vertex positions only (cotangent bilaplacian, strength 2000 ≈ forms under ~7 cm are smoothed away): pecs, abs, navel, kneecaps, calves and clavicles go. Hands and the egg head are pinned, soles stay on the old floor, and the legs may only lose volume (never grow), so grasps, the brace cuffs, the calf shell and THIGH_FIT still fit. Topology, skin weights and bones are unchanged.
`src/figure/rings.py` then undraws the wireframe loops that ringed the nipples and navel. The previous body is kept as `src/figure/figure_data_before_dummy.js`.
Run: `python3 dummify.py figure_data_before_dummy.js out.js 2000 40 1 1` then `python3 rings.py out.js figure_data.js 4 3 7 0`.
Toes are still separate (only lightly affected); merging them into a mitten foot was tried and left folds, so it is not in.
Doll hands (same day): `src/figure/handfair.py` (strength 0.5) smooths knuckles, tendons and nail detail into plain tube fingers with round tips, keeping finger thickness; finger bones and grasps are unchanged. It runs last, on the output of rings.py: `python3 handfair.py figure_data.js out.js 0.5 8`.
Nipples (same day): `src/figure/chestfair.py d_in d_out 1 1 0 5` (used only to trim wire stubs that dead-ended at the nipples) then `src/figure/nipfix.py` puts the nipple and navel patches on a quadratic surface fitted to the skin around them and evens out their quads.

## Gabriel's own body, rigged (2026-10-11, "mannequin refinement" thread)
`src/figure_data.js` is now Gabriel's image-to-3D faceted figure (1,500 tris, flat facets, no wire lines). The MakeHuman body it replaced is kept at `src/figure/figure_data_makehuman.js`; copying it back over `figure_data.js` restores the old behaviour, since every change below is gated on `FIGURE_MAN.exact`.
- Skeleton: the same 66 MakeHuman bone names and hierarchy, refitted to this body (`src/figure/gen_rig/skel.py`).
- Hands (articulated, published as fork v30): the generated body's solid fists are cut off at the wrist and replaced by faceted hands built in `gen_rig/hand.py`: a chamfered palm, four 3-segment fingers and a 3-segment thumb, each segment rigidly bound to its MakeHuman finger bone with 50/50 blends at the knuckles. The existing `curlHand`/`grasp` in rigs.js closes them around the crutch, scooter bars and wheel unchanged. Fingers are flat-sided and taper toward the tips (v33). `gen_rig/hands_grips.png` and `hand_relaxed.png` show them.
- Neutral pose (v33): arms brought in to about 55° below horizontal, and `lFore`/`rFore` y ±0.81 straightens the elbows, which the MakeHuman rest the poses are written against otherwise bends about 47°; `lFore`/`rFore` x -0.72 turns the palms about 38° toward the front (v35). `gen_rig/neutral_arms.png`.
- Weights: bone heat on the 50k-tri original (`gen_rig/heat.py`, `genmesh_50k.js`), sampled onto the 1,500-tri body by `gen_rig/pack_gen.py`, which writes `figure_data.js`. The forearm's far half rides lowerarm02 so grasp twist spreads along it.
- main.html (`gen_rig/patch_main.py` applies these edits and is idempotent):
  - dual-quaternion skinning and flat shading on the figure, so bent knees and hips keep their volume;
  - no thigh slimming morph, no shin slim and no foot tuck under the brace;
  - `restFix` turns this body's straighter rest elbows and knees onto the MakeHuman rest the poses were written for;
  - `thighAxis` is measured on true cross-sections;
  - `cuffScale` (1.25) grows both thigh cuffs across the thigh about their mounts on the upright, and `cuffTilt` ([-0.1, 0.09] rad) tips the thigh side a little forward and out about the hinge. The thigh now clears the cuffs except about 1 cm at the upper cuff's mount. Gabriel offered a Fusion configuration with larger cuffs, which would replace this scaling.
- `gen_rig/legs_before_after.png` compares the old and new legs.

## Assym up close (2026-10-11, "Cat turret close-up viewing" thread)
Section 15 is new: Assym Restore stays solid and close up, the base stays put, and the head plays the way it does for the cat: the pan darts ±25° and the tilt flicks a third to two thirds of its range, holding and sometimes wiggling between moves (time-driven, faded in over the section by `wIn` in hearthFrame). The laser stays on, dimmed to 35% (`wLit`). The exploded view, the close and the closing shot moved one section later: `ASSYM_IN = 1` in rigs.js shifts the explode/x-ray/fade windows, and the closing pose, cam keys, `revEnd` and `lineMat` in main.html moved +1. 18 sections now. Fork v39.
