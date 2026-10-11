# Mannequin lineup (2026-10-11)

Nine stylised bodies built on the site skeleton, published at https://claude.ai/artifact/Tz5sdtrYd68ybbHvKEMFaK.
Gabriel's reference for the direction: a flat-shaded faceted low-poly white figure on a square plinth.

- gen.py <styles> <grid cm> [rest]: SDF primitives on the skeleton from figure_data.js (expects it as ../d_n.js, edit
  the path) meshed by marching cubes to <style>.bin. Styles: faceted, athletic, vinyl, wooden, crash, boxy, mocap.
  Default display pose lowers the arms; pass `rest` to keep the site's rest pose. crash/mocap also write <style>.mk.json markers.
- pack.mjs '<json spec>' out.js: meshoptimizer decimation to window.LINEUP (Int16 cm*100 positions, base64).
  Spec used: faceted 1400, chiseled=athletic 1600, crystal=athletic 700, fine=athletic 4000; vinyl/wooden/mocap 24000,
  crash 30000, boxy 20000.
- build.py out.html data1.js data2.js: inlines data into page.html.

None of these are skinned yet. The chosen one needs skin weights transferred from the current figure, the quad
wireframe, and finger segments in the fists so grasps still work.
