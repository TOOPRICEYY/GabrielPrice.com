# Applies the generated-body edits to main.html (exact string replacements; fails loudly if the anchor text moved).
import sys
fn = sys.argv[1]; s = open(fn).read()
def rep(old, new, count=1):
    global s
    if new in s: return                      # already applied
    assert s.count(old) == count, (old[:80], s.count(old)); s = s.replace(old, new)
DQS = r'''const clayMat = satin('#ecebe7');
// Gabriel's faceted body (FIGURE_MAN.exact): flat facets, and dual-quaternion skinning so bent knees, hips and elbows keep
// their volume instead of folding in the way linear blend skinning does (each vertex's bones are blended as rigid motions)
let figureExact = false, figureCuffScale = 1, figureCuffTilt = null;
const DQS_PARS = `#include <skinning_pars_vertex>
#ifdef USE_SKINNING
vec4 dqMul(vec4 a, vec4 b) { return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); }
vec4 m2q(mat4 m) {
  float t = m[0][0] + m[1][1] + m[2][2];
  if (t > 0.0) { float s = sqrt(t + 1.0) * 2.0; return vec4((m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, .25 * s); }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { float s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0; return vec4(.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s, (m[1][2] - m[2][1]) / s); }
  if (m[1][1] > m[2][2]) { float s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0; return vec4((m[1][0] + m[0][1]) / s, .25 * s, (m[2][1] + m[1][2]) / s, (m[2][0] - m[0][2]) / s); }
  float s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0; return vec4((m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, .25 * s, (m[0][1] - m[1][0]) / s);
}
void dqAdd(mat4 bm, float w, vec4 q0, inout vec4 r, inout vec4 d) {
  mat4 M = bindMatrixInverse * bm * bindMatrix; vec4 q = m2q(M), t = .5 * dqMul(vec4(M[3].xyz, 0.0), q);
  if (dot(q, q0) < 0.0) { q = -q; t = -t; }
  r += w * q; d += w * t;
}
#endif`;
const DQS_VERT = `#ifdef USE_SKINNING
  vec4 q0 = m2q(bindMatrixInverse * boneMatX * bindMatrix), qr = vec4(0.0), qd = vec4(0.0);
  dqAdd(boneMatX, skinWeight.x, q0, qr, qd); dqAdd(boneMatY, skinWeight.y, q0, qr, qd);
  dqAdd(boneMatZ, skinWeight.z, q0, qr, qd); dqAdd(boneMatW, skinWeight.w, q0, qr, qd);
  float ql = length(qr); qr /= ql; qd /= ql;
  transformed += 2.0 * cross(qr.xyz, cross(qr.xyz, transformed) + qr.w * transformed) + 2.0 * (qr.w * qd.xyz - qd.w * qr.xyz + cross(qr.xyz, qd.xyz));
#endif`;
function useDQS(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <skinning_pars_vertex>', DQS_PARS).replace('#include <skinning_vertex>', DQS_VERT);
  };
  m.customProgramCacheKey = () => 'dqs'; m.needsUpdate = true;
  return m;
}'''
rep("const clayMat = satin('#ecebe7');", DQS)
rep("      const k = .15 * W[i] * band(T[i]); if (k <= 0 || pos[i * 3] < 1) continue;",
    "      const k = man.exact ? 0 : .15 * W[i] * band(T[i]); if (k <= 0 || pos[i * 3] < 1) continue;   // the exact body keeps its own thigh")
rep("    for (let j = 0; j < THIGH_FIT.length; j += 4)", "    if (!man.exact) for (let j = 0; j < THIGH_FIT.length; j += 4)")
rep("  skinned.castShadow = true; skinned.receiveShadow = true; skinned.frustumCulled = false;",
    """  skinned.castShadow = true; skinned.receiveShadow = true; skinned.frustumCulled = false;
  figureExact = !!man.exact; figureCuffScale = man.cuffScale || 1; figureCuffTilt = man.cuffTilt || null;
  if (figureExact) {
    clayMat.flatShading = true; useDQS(clayMat);
    skinned.customDepthMaterial = useDQS(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  }""")
rep("    for (const c of CHAINS[k]) corr[c] = { C, Ci: corr[k].Ci, root: false };",
    """    // restFix: this body's rest elbow / knee bend differs from the MakeHuman rest the poses were authored on; D turns it onto that rest
    for (const c of CHAINS[k]) { const D = man.restFix && man.restFix[BONE_MAP[c]]; corr[c] = { C: D ? C.clone().multiply(new THREE.Quaternion(...D)) : C, Ci: corr[k].Ci, root: false }; }""")
rep("    thighAxis = { a: cAt(.24).sub(H), b: cAt(.61).sub(H) };          // upperleg01.L's frame (rest bones carry no rotation)",
    """    thighAxis = { a: cAt(.24).sub(H), b: cAt(.61).sub(H) };          // upperleg01.L's frame (rest bones carry no rotation)
    if (man.thighAxis) thighAxis = { a: new THREE.Vector3(...man.thighAxis.a), b: new THREE.Vector3(...man.thighAxis.b) };   // measured on true cross-sections""")
rep("    const tuck = 1 - .22 * worn;", "    const tuck = figureExact ? 1 : 1 - .22 * worn;")
rep("    const slim = 1 - .2 * worn;", "    const slim = figureExact ? 1 : 1 - .2 * worn;")
rep("  part('kneeThigh', devThigh); part('cuffs', devThigh);",
    """  part('kneeThigh', devThigh); part('cuffs', devThigh);
  // a body with a thicker thigh than Gabriel's (FIGURE_MAN.cuffScale): both cuffs grow across the thigh only, about the line through
  // their mounts on the hinge upright, so they keep their height and stay on the upright while opening round the leg
  if (figureCuffScale !== 1) {
    const a = CUFF_UP.clone().normalize(), k = figureCuffScale - 1, S = new THREE.Matrix4().set(
      1 + k * (1 - a.x * a.x), -k * a.x * a.y, -k * a.x * a.z, 0,  -k * a.y * a.x, 1 + k * (1 - a.y * a.y), -k * a.y * a.z, 0,
      -k * a.z * a.x, -k * a.z * a.y, 1 + k * (1 - a.z * a.z), 0,  0, 0, 0, 1);
    const m = parts.cuffs.m; m.matrixAutoUpdate = false;
    m.matrix.makeTranslation(CUFF_MOUNT.x, CUFF_MOUNT.y, CUFF_MOUNT.z).multiply(S).multiply(new THREE.Matrix4().makeTranslation(-CUFF_MOUNT.x, -CUFF_MOUNT.y, -CUFF_MOUNT.z));
  }""")
rep("const CUFF_CAD = new THREE.Vector3(-4.35, 51.16, 14.95);         // centre of the upper thigh cuff (Top v1, the enlarged cuff in Hinge Mirrored v15), CAD pose", """const CUFF_CAD = new THREE.Vector3(-4.35, 51.16, 14.95);         // centre of the upper thigh cuff (Top v1, the enlarged cuff in Hinge Mirrored v15), CAD pose
const CUFF_MOUNT = new THREE.Vector3(-11.42, 35.74, 10.52), CUFF_UP = new THREE.Vector3(-0.114, 0.959, 0.258);   // lower cuff's mount on the upright; up the upright through both mounts""")
rep("      kicker.thighPivot.quaternion.setFromUnitVectors(_a.copy(CUFF_CAD).sub(P).normalize(), _ax);",
    """      kicker.thighPivot.quaternion.setFromUnitVectors(_a.copy(CUFF_CAD).sub(P).normalize(), _ax);
      // body-specific [about the hinge axis, outward]: a thigh bulkier near the hip than Gabriel's needs the thigh side tipped
      // slightly forward and out about the hinge so the upper cuff clears it (the hinge itself stays put)
      if (figureCuffTilt) kicker.thighPivot.quaternion.premultiply(_q.setFromAxisAngle(X_AX, figureCuffTilt[0])).premultiply(_q.setFromAxisAngle(_t.set(0, 0, 1), figureCuffTilt[1]));""")
open(fn, 'w').write(s); print('patched', fn)
