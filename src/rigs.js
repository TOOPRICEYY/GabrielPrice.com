// ---------- the figure uses every device (fork) ----------
// Sections 7–15: walk in the full brace, crutch with Water Break, knee scooter (ride, belt, exploded, drive), swerve couch that parks at a hearth,
// Assym Restore on the hearth in use, then taken apart.
// Fusion meshes (workshop_data.js): Water Break v2, Scooter Asm v6, Steering hub v9, Assym Restore v1.
// Stand-ins built here because Fusion has no model of them: the crutch, sofa, wheel stand, Thrustmaster T128 wheel and
// T2PM pedals (modelled from the product's published dimensions), hearth and cat.
// Hands and feet are placed by two-bone IK on top of the keyed poses; hands close on bars with the finger bones.

const RD = Math.PI / 180;
const win = (s, a, b, c, d) => smooth(seg(s, a, b)) * (1 - smooth(seg(s, c, d)));
const HZ = 330;                                   // hearth line, world z (in front of the parked couch)

// poses for the new sections (authored like the others: Euler offsets from a legs-straight T-pose).
// The rest elbow is flexed about 47° forward: +y on the left forearm (−y on the right) straightens it, ~3° per 0.05.
Object.assign(poses, {
  crutch: { lArm: [0, 0, -1.22], rArm: [0, 0, 1.0], lFore: [0, .45, 0], rFore: [0, -.3, 0], lUp: [-.32, 0, .06], lLeg: [.75, 0, 0], rUp: [0, 0, -.06], head: [.05, -.15, 0], spine: [0, 0, .04] },
  scoot: { spine: [.16, 0, 0], spine1: [.12, 0, 0], spine2: [.05, 0, 0], head: [-.18, 0, 0], lArm: [-.9, 0, -.9], rArm: [-.9, 0, .9],
    lUp: [-.1, 0, .05], rUp: [-.2, 0, -.05], rLeg: [1.4, 0, 0] },
  seat: { spine: [-.06, 0, 0], head: [.04, 0, 0], lUp: [-1.45, 0, .07], rUp: [-1.45, 0, -.07], lLeg: [1.35, 0, 0], rLeg: [1.35, 0, 0],
    lArm: [-.9, 0, -.85], rArm: [-.9, 0, .85], lFore: [0, -.6, 0], rFore: [0, .6, 0] },
  lounge: { spine: [-.16, 0, 0], spine1: [-.06, 0, 0], head: [.12, .3, 0], lUp: [-1.4, 0, .12], rUp: [-1.4, 0, -.12], lLeg: [1.2, 0, 0], rLeg: [1.2, 0, 0],
    lArm: [.45, 0, -.65], rArm: [.45, 0, .65], lFore: [0, .35, 0], rFore: [0, -.35, 0] },
});
poseKeys.splice(poseKeys.length - 1, 1,
  [6.75, 'neutral'], [7.25, 'neutral'], [7.75, 'crutch'], [8.25, 'crutch'], [8.75, 'scoot'], [12.25, 'scoot'],
  [12.75, 'seat'], [13.4, 'seat'], [13.8, 'lounge'], [16.3, 'lounge'], [16.85, 'neutral']);
// camera keys: [s, pos, look, 0, screenShift] — positive shift puts the subject right of centre (card on the left)
const HORN_R = 2.3;                                // Assym Restore: tilt servo horn hole radius, cm (outer hole of a long single-arm horn)
const MANTEL_Y = 100;                              // top of the mantel shelf over the firebox
const ASSYM_AT = new THREE.Vector3(46, MANTEL_Y, HZ + 8);   // Assym Restore's base centre, standing on the mantel
// city street under the couch: centre line at x = cx (couch centre −64 sits in the right-hand lane), lanes ST.lane wide,
// running from z0 to z1; it fades out as the couch drives in to the hearth
const ST = { cx: -64 + 175, lane: 350, walk: 260, z0: -7000, z1: 3000, cross: -760 };
// the street's centreline: straight up +z to zB, a left-hand bend of radius RB through 90°, a straight along +x, then a
// roundabout. at(s) gives the point, heading a (travel along (sin a, cos a)) and curvature k at arc length s from z0
const STP = { zB: 1200, RB: 1500, LX: 1300, RR: 700 };
STP.LA = STP.zB - ST.z0; STP.LC = STP.RB * Math.PI / 2; STP.S1 = STP.LA + STP.LC + STP.LX;
STP.at = (s) => {
  const C = ST.cx, { zB, RB, LA, LC } = STP;
  if (s <= LA) return { x: C, z: zB - (LA - s), a: 0, k: 0 };
  if (s <= LA + LC) { const t = (s - LA) / RB; return { x: C + RB * (1 - Math.cos(t)), z: zB + RB * Math.sin(t), a: t, k: 1 / RB }; }
  return { x: C + RB + (s - LA - LC), z: zB + RB, a: Math.PI / 2, k: 0 };
};
STP.plaza = [ST.cx + STP.RB + STP.LX + STP.RR - 120, STP.zB + STP.RB];
// couch course, shown once you take the wheel: a gate across the road by the start, one through the bend, a drift lap round the
// roundabout's island, then back through the first gate to close the lap. gates: [x, z, heading, width]
// game feel for the couch drive: body lean, skid marks, drift smoke, camera kick
const JU = { roll: 5 * RD, pitch: 3 * RD, skidN: 700, skidLife: 7, smokeN: 220, fov: 10 };
const CC = { gates: (() => { const b = STP.at(STP.LA + STP.LC / 2); return [[ST.cx, 450, 0, 2 * ST.lane - 20], [b.x, b.z, b.a, 2 * ST.lane - 20]]; })(),
  ring: STP.plaza, ringR: 380, tap: .3 };
// couch, driven with the keys: car-like (Ackermann) with oversteer. L = front to rear module axle (cm), zr = rear axle z in the couch,
// speeds cm/s, accelerations cm/s²; grip = how fast (1/s) the direction of travel catches up with the heading, so the steady
// drift angle is about yaw rate / grip
const CD = { L: 64, zr: -32, dMax: 32 * RD, vLock: 220, acc: 560, drag: .85, brake: 650, vTop: 660, over: .9, grip: 3.2, gripN: 14, gripHB: .9, wTank: 1.3, vTank: 70, slipMax: 65 * RD };
// the scooter has four sections (ride, belt, exploded, drive); everything after it sits SCOOT_SH sections later than it used to
const SCOOT_SH = 3;
// Assym Restore has an up-close section (solid, turning back and forth) between in use and exploded: the exploded view and the close sit ASSYM_IN later
const ASSYM_IN = 1;
// a drive-ready section after the couch card (chase view, key prompt): the couch timeline holds at COUCH_HOLD through it, and the
// parking, hearth and Assym scenes after it sit COUCH_IN sections later
const COUCH_IN = 1, COUCH_HOLD = 10.05;
// scooter course: cones every SC.gap cm down the middle of a sidewalk; the autopilot weaves x = amp·sin(π z / gap)
const SC = { gap: 240, amp: 60, len: 1920, walkW: 180, slab: 120, nCone: 4, vAuto: 90, L: 51.2, dMax: 35 * RD,
  rampX: -62, rampW: 34, rampL: 50, rampH: 18, hop: 200, g: 981 };   // kicker ramps beside every other cone, opposite the slalom line
// exploded view: each part's offset in Fusion axes (x = rider's right, y = forward, z = up), cm, relative to its parent
// (the wheel pulley rides in the right rear wheel, the front wheels and fork on the steering, the motor pulley on the motor)
const SC_EX = { kneepad: [0, 0, 14], column: [0, 0, 16], basket: [0, 24, 6], fork: [0, 6, -10], wFL: [-14, 6, -10], wFR: [14, 6, -10],
  steer: [0, 22, 6], wRL: [-18, 0, 0], wRR: [30, 0, 0], wpulley: [-14, 0, 0], belt: [9, 0, 0], motor: [5, 6, 20], mpulley: [9, 0, 0],
  mount: [0, 0, 10], battery: [-22, 0, 4], frame: [0, 0, 0] };
camKeys.splice(camKeys.length - 1, 1,
  [6.75, [330, 108, 160], [0, 86, 12], 0, -50], [7.25, [330, 108, 160], [0, 86, 12], 0, -50],
  [7.75, [-215, 125, 300], [-14, 84, 4], 0, 48], [8.25, [-215, 125, 300], [-14, 84, 4], 0, 48],
  // scooter: hero from the back right corner (the belt side), punch in on the belt, pull back for the exploded view, then a chase view to drive
  [8.75, [-310, 118, -190], [-10, 64, 12], 0, -48], [9.25, [-310, 118, -190], [-10, 64, 12], 0, -48],
  [9.75, [-80, 68, -18], [-15, 14, -8], 0, 11], [10.25, [-80, 68, -18], [-15, 14, -8], 0, 11],
  [10.75, [-190, 195, -210], [-10, 45, 12], 0, -44], [11.25, [-190, 195, -210], [-10, 45, 12], 0, -44],
  [11.75, [-195, 265, -305], [-6, 40, 70], 0, -40], [12.25, [-195, 265, -305], [-6, 40, 70], 0, -40],
  [12.75, [95, 200, 430], [-40, 62, 10], 0, 30], [13.25, [95, 200, 430], [-40, 62, 10], 0, 30],
  [14.25, [95, 200, 430], [-40, 62, 10], 0, 30],   // drive-ready section (s 14): the chase view takes over, this only holds the way back
  [14.75, [370, 190, 10], [40, 62, 250], 0, -45], [15.25, [370, 190, 10], [40, 62, 250], 0, -45],
  // Assym up close (solid, turning back and forth), then pulled back a little for the exploded view
  [15.75, [ASSYM_AT.x - 56, ASSYM_AT.y + 26, ASSYM_AT.z - 80], [ASSYM_AT.x, ASSYM_AT.y + 9, ASSYM_AT.z], 0, 9, 1.4],
  [16.25, [ASSYM_AT.x - 56, ASSYM_AT.y + 26, ASSYM_AT.z - 80], [ASSYM_AT.x, ASSYM_AT.y + 9, ASSYM_AT.z], 0, 9, 1.4],
  [16.75, [ASSYM_AT.x - 72, ASSYM_AT.y + 38, ASSYM_AT.z - 104], [ASSYM_AT.x, ASSYM_AT.y + 21, ASSYM_AT.z], 0, -26],
  [17.25, [ASSYM_AT.x - 72, ASSYM_AT.y + 38, ASSYM_AT.z - 104], [ASSYM_AT.x, ASSYM_AT.y + 21, ASSYM_AT.z], 0, -26],
  [18, [0, 100, 480], [0, 94, 0], 0, 60]);

// a pose layered over the keyed one (the walk is procedural, not a keyframe)
const poseMix = { w: 0, pose: {} };
// ---------- two-bone IK ----------
const ik = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(),
  q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion(), t: new THREE.Vector3(), pp: new THREE.Vector3() };
function aimBone(bone, child, target) {
  // turn `bone` in world space so the direction bone → child points at target
  bone.getWorldPosition(ik.a); child.getWorldPosition(ik.d);
  ik.d.sub(ik.a).normalize(); ik.e.copy(target).sub(ik.a).normalize();
  ik.q.setFromUnitVectors(ik.d, ik.e);
  bone.getWorldQuaternion(ik.w).premultiply(ik.q);
  bone.parent.getWorldQuaternion(ik.p).invert();
  bone.quaternion.copy(ik.p.multiply(ik.w));
  bone.updateMatrixWorld(true);
}
function solve2(up, low, end, target, pole, w) {
  if (w <= 0.001) return;
  up.getWorldPosition(ik.a); low.getWorldPosition(ik.b); end.getWorldPosition(ik.c);
  const l1 = ik.a.distanceTo(ik.b), l2 = ik.b.distanceTo(ik.c);
  ik.t.copy(target).sub(ik.a); const dist = Math.min(Math.max(ik.t.length(), Math.abs(l1 - l2) + .01), l1 + l2 - .01);
  const dir = ik.t.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  ik.pp.copy(pole).sub(ik.a); ik.pp.addScaledVector(dir, -ik.pp.dot(dir)).normalize();
  const elbow = ik.a.clone().addScaledVector(dir, x).addScaledVector(ik.pp, h);
  const wrist = ik.a.clone().addScaledVector(dir, dist);
  aimBone(up, low, elbow.lerp(ik.b, 1 - w));
  end.getWorldPosition(ik.c);
  aimBone(low, end, wrist.lerp(ik.c, 1 - w));
}
const wpos = (b, v = new THREE.Vector3()) => b.getWorldPosition(v);

// ---------- hands: MakeHuman finger bones (fork skin), power grip on a bar ----------
// Rest bones carry no rotation, so a finger's local axes are the mesh axes at rest and a curl is a plain axis-angle.
const HAND = {};
const _hq = new THREE.Quaternion(), _hq2 = new THREE.Quaternion(), _hm = new THREE.Matrix4(), _hm2 = new THREE.Matrix4();
function handSetup() {
  const fb = {}; figure.traverse(o => { if (o.isBone) fb[o.name] = o; });
  const tails = window.FIGURE_MAN.tails || {};
  const V = (a) => new THREE.Vector3(...a), H = (n) => restHead[n].clone();
  for (const sd of ['L', 'R']) {
    if (!fb['finger3-1.' + sd]) return;
    const W = H('wrist.' + sd), k2 = H('finger2-1.' + sd), k5 = H('finger5-1.' + sd), k3 = H('finger3-1.' + sd);
    const fwd = V(tails['finger3-3.' + sd]).sub(W).normalize();
    const across = k2.clone().sub(k5).normalize();                       // index → little finger, reversed
    const n = (sd === 'R' ? across.clone().cross(fwd) : fwd.clone().cross(across)).normalize();   // out of the palm
    const e1 = across.clone(), e2 = n.clone().addScaledVector(e1, -n.dot(e1)).normalize(), e3 = e1.clone().cross(e2);
    const palm = W.clone().add(k2).add(k5).add(k3).multiplyScalar(.25).addScaledVector(e2, 1.2);   // palm surface, mesh units
    const fingers = [];
    for (let f = 1; f <= 5; f++) for (let k = 1; k <= 3; k++) {
      const nm = `finger${f}-${k}.${sd}`, head = H(nm), next = k < 3 ? H(`finger${f}-${k + 1}.${sd}`) : V(tails[nm]);
      const d = next.clone().sub(head).normalize();
      const toward = f === 1 ? palm.clone().addScaledVector(e2, 2).sub(head).normalize() : e2;   // thumb closes onto the palm
      fingers.push({ b: fb[nm], f, k, axis: d.clone().cross(toward).normalize() });
    }
    HAND[sd] = { fingers, basis: new THREE.Matrix4().makeBasis(e1, e2, e3), palmOff: palm.sub(W), curl: 0 };
  }
}
function curlHand(sd, c) {
  const h = HAND[sd]; if (!h) return; h.curl = c;
  for (const x of h.fingers) {
    const a = x.f === 1 ? [.35, .55, .6][x.k - 1] : [1.05, 1.35, .95][x.k - 1];
    x.b.quaternion.setFromAxisAngle(x.axis, a * c);
  }
}
// Power grip: knuckle line along the bar (axis A, signed so it points index-ward), palm facing the bar centre C.
// cHat: preferred direction from the palm to the bar centre (perpendicular to A); default is from the shoulder toward the bar.
// The hand may roll round the bar: of the roll angles within ±80° of cHat, the one that bends the wrist least wins
// (with a small pull back toward cHat). Twist about the forearm is taken up by the forearm itself (pronation /
// supination, up to ±85°), so the wrist only bends, and not far.
const _gq = new THREE.Quaternion(), _gq3 = new THREE.Quaternion(), _gsave = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
const _sw = { r: new THREE.Quaternion(), t: new THREE.Quaternion(), d: new THREE.Vector3() };
// split the world-frame turn from the forearm-carried hand Qn to the target Qt into twist about axis d and the bend left over
function swingTwist(Qt, Qn, d) {
  const r = _sw.r.copy(Qt).multiply(_gq4.copy(Qn).invert()); if (r.w < 0) { r.x = -r.x; r.y = -r.y; r.z = -r.z; r.w = -r.w; }
  const p = r.x * d.x + r.y * d.y + r.z * d.z, t = _sw.t.set(d.x * p, d.y * p, d.z * p, r.w).normalize();
  const twist = 2 * Math.atan2(p, r.w), sw = _gq5.copy(r).multiply(_gq4.copy(t).invert());
  return { twist, bend: 2 * Math.acos(Math.min(1, Math.abs(sw.w))) };
}
const _gq4 = new THREE.Quaternion(), _gq5 = new THREE.Quaternion();
function handQ(h, a, c, out) { _hm.makeBasis(a, c, a.clone().cross(c)); return out.setFromRotationMatrix(_hm2.copy(_hm).multiply(_hm.copy(h.basis).transpose())); }
function grasp(sd, C, A, r, w, pole, curl = 1, cHat = null) {
  const h = HAND[sd]; if (w <= .001) return;
  const up = sd === 'L' ? bones.lArm : bones.rArm, low = sd === 'L' ? bones.lFore : bones.rFore, end = sd === 'L' ? bones.lHand : bones.rHand;
  const a = A.clone().normalize();
  const c = cHat ? cHat.clone() : C.clone().sub(wpos(up)); c.addScaledVector(a, -c.dot(a)).normalize();
  if (!h) { solve2(up, low, end, C.clone().addScaledVector(c, -r - 4), pole, w); return; }
  const wristFor = (cc, Q) => C.clone().addScaledVector(cc, -(r + .6)).sub(h.palmOff.clone().multiplyScalar(figureScale).applyQuaternion(Q));
  [up, low, end].forEach((b, i) => _gsave[i].copy(b.quaternion));
  // first pass with the preferred roll, to find where the forearm ends up
  handQ(h, a, c, _gq); solve2(up, low, end, wristFor(c, _gq), pole, 1);
  end.parent.getWorldQuaternion(_gq3).multiply(end.quaternion);           // the hand carried straight on by the forearm
  const fa = wpos(end).sub(wpos(end.parent)).normalize();
  let best = 0, bestCost = Infinity;
  const cc = new THREE.Vector3();
  for (let deg = -80; deg <= 80; deg += 5) {
    cc.copy(c).applyAxisAngle(a, deg * RD); handQ(h, a, cc, _gq);
    const st = swingTwist(_gq, _gq3, fa);
    const cost = st.bend + Math.max(0, Math.abs(st.twist) - 85 * RD) * 2 + .25 * Math.abs(deg * RD);
    if (cost < bestCost) { bestCost = cost; best = deg; }
  }
  cc.copy(c).applyAxisAngle(a, best * RD); handQ(h, a, cc, _gq);
  [up, low, end].forEach((b, i) => { b.quaternion.copy(_gsave[i]); b.updateMatrixWorld(true); });
  solve2(up, low, end, wristFor(cc, _gq), pole, w);
  // forearm takes the twist: turn the bone above the wrist about its own axis (the wrist stays put)
  {
    const fb = end.parent; fb.getWorldQuaternion(_gq3); _gq3.multiply(end.quaternion);
    const d = wpos(end).sub(wpos(fb)).normalize(), tw = Math.max(-85 * RD, Math.min(85 * RD, swingTwist(_gq, _gq3, d).twist)) * w;
    const ppw = fb.parent.getWorldQuaternion(_gq4.clone());
    const T = new THREE.Quaternion().setFromAxisAngle(d, tw);
    fb.quaternion.copy(ppw.clone().invert().multiply(T).multiply(ppw).multiply(fb.quaternion)); fb.updateMatrixWorld(true);
  }
  end.parent.getWorldQuaternion(_hq2).invert();
  end.quaternion.slerp(_hq2.multiply(_gq), w); end.updateMatrixWorld(true);
  curlHand(sd, Math.max(h.curl, curl * w));
}// ---------- device materials: one set per rig, so fading one rig never touches another ----------
function dmat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .2, transparent: true, opacity: 0, ...o }); }
function matSet() {
  return { dark: dmat(0x24262b, { roughness: .55 }), paint: dmat(0x1d1f24, { roughness: .28, metalness: .35 }), plastic: dmat(0x2a2c31, { roughness: .8, metalness: 0 }),
    rubber: dmat(0x18181b, { roughness: .9, metalness: 0 }), alu: dmat(0xb4bac2, { roughness: .4, metalness: .85 }), steel: dmat(0x8d939b, { roughness: .35, metalness: .9 }),
    print: dmat(0x34373e, { roughness: .62, metalness: .05 }), blue: dmat(0x2c55c9, { roughness: .35, metalness: .6 }), red: dmat(0xd8262e, { roughness: .4, metalness: .3 }),
    leather: dmat(0x8b5a3c, { roughness: .85, metalness: 0 }), leather2: dmat(0x7a4e33, { roughness: .85, metalness: 0 }),
    cyan: dmat(0x00c8e0, { roughness: .4, metalness: 0, emissive: 0x00c8e0, emissiveIntensity: .5 }) };
}
// material.userData.k scales the faded opacity (glass, water); userData.own = the rig sets that material itself
function fade(group, o) {
  group.visible = o > .002;
  if (!group.visible) return;
  group.traverse(m => { if (m.material && !m.material.userData.own) { const k = m.material.userData.k ?? 1; m.material.opacity = o * k; m.material.transparent = o * k < .999; m.material.depthWrite = o * k > .5; } });
}
const wsBin = () => rigs.bin || (rigs.bin = Uint8Array.from(atob(window.WS_B64), c => c.charCodeAt(0)).buffer);
function wsEntryGeo(e) {
  const bin = wsBin(), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, e.p, e.nv * 3), 3));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin, e.n, e.nv * 4), 4), 3, 0, true));
  g.setIndex(new THREE.BufferAttribute(e.w === 2 ? new Uint16Array(bin, e.i, e.ni) : new Uint32Array(bin, e.i, e.ni), 1));
  return g;
}
function wsGeo(slug) { const o = {}; for (const e of window.WS_MAN[slug].parts) o[e.k] = wsEntryGeo(e); return o; }
// models packed per material class: [{ k: group, m: class, g: geometry }]
const wsParts = (slug) => window.WS_MAN[slug].parts.map(e => ({ k: e.k, m: e.m || 'print', g: wsEntryGeo(e) }));
const wsJoint = (slug, name) => window.WS_MAN[slug].joints.find(j => j.name === name);
function pivotAt(parent, origin) {
  const p = new THREE.Group(); p.position.fromArray(origin); parent.add(p);
  const inner = new THREE.Group(); inner.position.fromArray(origin).negate(); p.add(inner);
  return { p, inner };
}
function mesh(g, m, parent) { const x = new THREE.Mesh(g, m); x.castShadow = true; parent.add(x); return x; }
function tube(pts, r, m, parent, seg = 48) {
  const c = new THREE.CatmullRomCurve3(pts); const x = new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, 12), m); x.castShadow = true; parent.add(x); return x;
}
function rod(a, b, r, m, parent, r2 = r) {
  const v = b.clone().sub(a), c = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, v.length(), 16), m);
  c.position.copy(a).add(b).multiplyScalar(.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); c.castShadow = true; parent.add(c); return c;
}
function box(w, h, d, m, parent, x = 0, y = 0, z = 0) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b; }
// rounded slab: a rounded rectangle (w × d) extruded to height h, lying in xz with its base at y = 0
function slab(w, d, h, r, m, parent, bevel = .4) {
  const s = new THREE.Shape(), x = w / 2 - r, z = d / 2 - r;
  s.moveTo(-x, -d / 2); s.lineTo(x, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -z); s.lineTo(w / 2, z); s.quadraticCurveTo(w / 2, d / 2, x, d / 2);
  s.lineTo(-x, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, z); s.lineTo(-w / 2, -z); s.quadraticCurveTo(-w / 2, -d / 2, -x, -d / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(.01, h - 2 * bevel), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
  const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
}

const rigs = { ready: false };
// ---------- gait (level walking, average adult; degrees vs % of the stride) ----------
const GAIT_K = [[0, 5], [5, 10], [10, 16], [15, 18], [20, 16], [30, 9], [40, 5], [50, 7], [55, 13], [60, 30], [65, 48], [70, 60], [73, 62], [80, 55], [85, 40], [90, 22], [95, 8], [100, 5]];
const GAIT_A = [[0, 0], [8, -5], [30, 4], [45, 9], [62, -15], [75, 0], [100, 0]];
const GAIT_PH = [[2, 'Initial contact'], [12, 'Loading response'], [31, 'Mid stance'], [50, 'Terminal stance'], [62, 'Pre-swing'], [75, 'Initial swing'], [87, 'Mid swing'], [100, 'Terminal swing']];
function curveAt(T, pc) {
  pc = ((pc % 100) + 100) % 100; const n = T.length, i = Math.max(0, T.findIndex((g, j) => j < n - 1 && pc <= T[j + 1][0]));
  const p0 = T[i > 0 ? i - 1 : n - 2][1], p1 = T[i][1], p2 = T[i + 1][1], p3 = T[i + 2 < n ? i + 2 : 1][1], t = (pc - T[i][0]) / (T[i + 1][0] - T[i][0]);
  return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
const hipAt = (pc) => 10 + 18 * Math.cos(2 * Math.PI * pc / 100);   // thigh flexion: +28° at heel strike, −8° at toe-off
function walkPose(pc) {
  const pr = pc + 50, hl = hipAt(pc), hr = hipAt(pr);
  return { lUp: [-hl * RD, 0, .03], lLeg: [curveAt(GAIT_K, pc) * RD, 0, 0], rUp: [-hr * RD, 0, -.03], rLeg: [curveAt(GAIT_K, pr) * RD, 0, 0],
    rFoot: [-curveAt(GAIT_A, pr) * RD, 0, 0],
    lArm: [-.32 * (hr - 10) / 18, 0, -1.25], rArm: [-.32 * (hl - 10) / 18, 0, 1.25], lFore: [0, .4, 0], rFore: [0, -.4, 0],
    spine2: [0, .06 * Math.cos(2 * Math.PI * pc / 100), 0] };
}

function rigBuild() {
  handSetup();
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

  // ===== crutch (stand-in aluminium axillary crutch: rails front and back of the body, grip running fore-aft) =====
  // with Water Break (Fusion) clipped between the rails under the grip, holding a 500 ml bottle
  {
    const D = matSet(); const g = new THREE.Group(); scene.add(g);
    const body = new THREE.Group(); g.add(body);            // tip at origin, +y up the crutch, +z forward
    const rail = (sz) => tube([V(0, 46, 1.3 * sz), V(0, 52, 3.6 * sz), V(0, 58.3, 4.69 * sz), V(0, 76.6, 5.27 * sz), V(0, 90, 5.5 * sz), V(0, 108, 5.3 * sz), V(0, 128, 4.4 * sz)], 1.1, D.alu, body, 64);
    rail(1); rail(-1);
    rod(V(0, 2.5), V(0, 40), 1.05, D.alu, body);                                         // extension leg
    for (let y = 10; y <= 34; y += 2.5) { const h = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .3, 8), D.dark); h.rotation.x = Math.PI / 2; h.position.set(0, y, 1.03); body.add(h); }
    rod(V(0, 36), V(0, 49), 1.35, D.alu, body);                                           // outer sleeve
    for (const y of [36.4, 48.5]) { const c = new THREE.Mesh(new THREE.TorusGeometry(1.4, .3, 6, 18), D.dark); c.rotation.x = Math.PI / 2; c.position.y = y; body.add(c); }
    const btn = new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 8), D.steel); btn.position.set(0, 21, 1.15); body.add(btn);
    // rubber tip: tapered boot with tread rings
    rod(V(0, 0), V(0, 4.2), 2.1, D.rubber, body, 1.45);
    for (const y of [.6, 1.4]) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.05, .22, 6, 20), D.rubber); r.rotation.x = Math.PI / 2; r.position.y = y; body.add(r); }
    // hand grip: foam sleeve on a through-bolt between the rails
    const gripMesh = rod(V(0, 90, -4.6), V(0, 90, 4.6), 1.6, D.rubber, body);
    rod(V(0, 90, -6.4), V(0, 90, 6.4), .35, D.steel, body);
    for (const z of [-6.7, 6.7]) { const n = new THREE.Mesh(new THREE.CylinderGeometry(.65, .65, .5, 6), D.steel); n.rotation.x = Math.PI / 2; n.position.set(0, 90, z); body.add(n); }
    // underarm pad: foam capsule along z over a rail bridge
    rod(V(0, 128, -4.6), V(0, 128, 4.6), .9, D.alu, body);
    const pad = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 13, 6, 14), D.rubber); pad.rotation.x = Math.PI / 2; pad.scale.set(1.25, 1, 1); pad.position.set(0, 130.4, 0); body.add(pad);
    // Water Break: Fusion +x → crutch +z, Fusion y up; hooks land on the rails at y 58.3 and 76.6
    const wb = new THREE.Group(); wb.rotation.y = -Math.PI / 2; wb.position.y = 70; body.add(wb);
    for (const p of wsParts('waterbreak')) mesh(p.g, D.print, wb);
    // the bottle: clear PET, water inside cut by a world-level plane so the surface stays level while the crutch swings
    const bottle = new THREE.Group(); bottle.position.y = 60.75; body.add(bottle);
    const prof = [[0, 0], [2.9, 0], [3.25, .5], [3.3, 2], [3.15, 4], [3.3, 6], [3.3, 13.5], [2.9, 15.5], [1.9, 17.2], [1.35, 18], [1.35, 18.6]].map(([r, y]) => new THREE.Vector2(r, y));
    const pet = dmat(0xcfe8f5, { roughness: .08, metalness: 0, side: THREE.DoubleSide }); pet.userData.k = .32;
    bottle.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), pet));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.7, 20), D.blue); cap.position.y = 19.4; bottle.add(cap);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(3.33, 3.33, 4.5, 32, 1, true), dmat(0x2c55c9, { roughness: .6, metalness: 0 })); label.position.y = 9.5; bottle.add(label);
    const waterPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const water = dmat(0x5fb6e6, { roughness: .1, metalness: 0, clippingPlanes: [waterPlane], clipShadows: true }); water.userData.k = .55;
    const wprof = prof.slice(0, 9).map(v => new THREE.Vector2(Math.max(0, v.x - .12), v.y + .05));
    bottle.add(new THREE.Mesh(new THREE.LatheGeometry(wprof, 28), water));
    const surf = new THREE.Mesh(new THREE.CircleGeometry(3.15, 28), dmat(0x8fd0f2, { roughness: .05, metalness: 0, side: THREE.DoubleSide })); surf.material.userData.k = .7; scene.add(surf);
    rigs.crutch = { g, body, bottle, waterPlane, surf, grip: gripMesh, th: 0, phi: 0, dphi: 0, t: 0, D, level: 12.5 };
  }

  // ===== knee scooter (Fusion: Scooter Asm v6, with the C6374 motor, HTD-3M belt and wheel pulley) =====
  // every Fusion component sits in its own "ex" group so the exploded view can slide it out along SC_EX (Fusion axes:
  // x = rider's right, y = forward, z = up); pivots (wheels, steering, motor) move by shifting the pivot itself
  {
    const D = matSet(); const parts = wsParts('scooter6');
    const g = new THREE.Group(); g.rotation.y = Math.PI; scene.add(g);                 // Fusion +y (forward) → world +z
    const root = new THREE.Group(); root.rotation.x = -Math.PI / 2; root.position.y = 10.16; g.add(root); // z-up → y-up, wheels on the floor
    const kneepad = new THREE.Group(); root.add(kneepad);
    const steer = pivotAt(root, wsJoint('scooter6', 'Steering').origin);
    const wheels = {};
    for (const [k, jn, par] of [['wRL', 'Rear L Wheel', root], ['wRR', 'Rear R Wheel', root], ['wFL', 'Front L Wheel', steer.inner], ['wFR', 'Front R Wheel', steer.inner]])
      wheels[k] = pivotAt(par, wsJoint('scooter6', jn).origin);
    // motor spins about its own axis (Fusion x through the can's centre)
    const mBox = new THREE.Box3(); for (const p of parts) if (p.k === 'motor') { p.g.computeBoundingBox(); mBox.union(p.g.boundingBox); }
    const mc = mBox.getCenter(new THREE.Vector3());
    const motor = pivotAt(root, [0, mc.y, mc.z]);
    const matOf = (p) => p.k === 'mpulley' ? D.alu : p.k === 'battery' ? D.blue : (p.k === 'wRL' || p.k === 'wRR') && p.m === 'plastic' ? D.blue : (D[p.m] || D.print);
    const parentOf = { frame: root, mount: root, battery: root, belt: root, kneepad, column: steer.inner, basket: steer.inner, fork: steer.inner,
      motor: motor.inner, mpulley: motor.inner, wpulley: wheels.wRR.inner };
    for (const k in wheels) parentOf[k] = wheels[k].inner;
    const ex = {}, box = {};
    let wheelPulleyR = 7.6, motorPulleyR = 1.7;
    for (const p of parts) {
      if (!ex[p.k]) { ex[p.k] = new THREE.Group(); parentOf[p.k].add(ex[p.k]); box[p.k] = new THREE.Box3(); }
      mesh(p.g, matOf(p), ex[p.k]);
      p.g.computeBoundingBox(); box[p.k].union(p.g.boundingBox);
    }
    motorPulleyR = (box.mpulley.max.y - box.mpulley.min.y) / 2; wheelPulleyR = (box.wpulley.max.z - box.wpulley.min.z) / 2;
    // grip centres (Fusion), for the hands: bar axis is Fusion x
    const grips = [V(-17, 46, 81.2), V(17, 46, 81.2)].map(p => { const o = new THREE.Object3D(); o.position.copy(p); steer.inner.add(o); return o; });
    // pivots keep their rest position so the explode can add to it
    const piv = { steer, motor, ...wheels }; for (const k in piv) piv[k].p.userData.o = piv[k].p.position.clone();
    // the course: a faint sidewalk with small cones down its middle, in its own frame (course x across, z along it);
    // the frame tracks the scooter's pose, so it is moved under the scooter rather than the scooter over it
    const course = new THREE.Group(); scene.add(course);
    const CM = { walk: dmat(0xb9b6ae, { roughness: .95, metalness: 0 }), seam: dmat(0x85827a, { roughness: 1, metalness: 0 }),
      cone: dmat(0xff6a1f, { roughness: .55, metalness: 0 }), band: dmat(0xf4f4f0, { roughness: .3, metalness: 0, emissive: 0xffffff, emissiveIntensity: .15 }),
      foot: dmat(0x2a2a2e, { roughness: .9, metalness: 0 }) };
    CM.walk.userData.k = .75; CM.seam.userData.k = .85;
    const LEN = SC.len, Wd = SC.walkW;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(Wd, .6, LEN), CM.walk); slab.position.y = .3; slab.receiveShadow = true; course.add(slab);
    for (let z = -LEN / 2; z <= LEN / 2 + .1; z += SC.slab) { const j = new THREE.Mesh(new THREE.BoxGeometry(Wd, .1, .8), CM.seam); j.position.set(0, .65, z); course.add(j); }
    for (const x of [-Wd / 2, Wd / 2]) { const e = new THREE.Mesh(new THREE.BoxGeometry(.8, .1, LEN), CM.seam); e.position.set(x, .65, 0); course.add(e); }
    const cones = [];
    for (let k = -SC.nCone; k < SC.nCone; k++) {
      const c = new THREE.Group(); c.position.set(0, .6, SC.gap / 2 + k * SC.gap); course.add(c);
      const tip = new THREE.Group(); c.add(tip);                       // tips over about a base edge when hit
      const body = new THREE.Group(); tip.add(body);
      const b = new THREE.Mesh(new THREE.BoxGeometry(13, 1.2, 13), CM.foot); b.position.y = .6; b.castShadow = true; body.add(b);
      const cn = new THREE.Mesh(new THREE.CylinderGeometry(.9, 5.2, 17, 20), CM.cone); cn.position.y = 9.7; cn.castShadow = true; body.add(cn);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 3.35, 3, 20, 1, true), CM.band); band.position.y = 10.6; body.add(band);
      cones.push({ g: c, tip, body, k });
    }
    // kicker ramps: a wedge climbing along +z beside every other cone, on the side the slalom line leaves open
    CM.ramp = dmat(0x8d8a84, { roughness: .7, metalness: 0 });
    const rs = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(SC.rampL, 0), new THREE.Vector2(SC.rampL, SC.rampH)]);
    const rg = new THREE.ExtrudeGeometry(rs, { depth: SC.rampW, bevelEnabled: false });
    rg.rotateY(-Math.PI / 2); rg.translate(SC.rampW / 2, 0, -SC.rampL / 2);          // shape x → course z, extrusion → across
    for (let k = -SC.nCone; k < SC.nCone; k += 2) {
      const r = new THREE.Group(); r.position.set(SC.rampX, .6, SC.gap / 2 + k * SC.gap); course.add(r);
      const m = new THREE.Mesh(rg, CM.ramp); m.castShadow = m.receiveShadow = true; r.add(m);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(SC.rampW, 1.4, 2.4), CM.cone); lip.position.set(0, SC.rampH - .6, SC.rampL / 2 - 1.2); r.add(lip);
    }
    rigs.scooter = { g, root, kneepad, steer, wheels: Object.values(wheels), motor, grips, ratio: wheelPulleyR / motorPulleyR, rW: wheelPulleyR, rM: motorPulleyR,
      rearY: wsJoint('scooter6', 'Rear L Wheel').origin[1], psi: 0, X: 0, Z: 0, v: 0, spin: 0, delta: 0, D, ex, box, piv, course, cones, CM,
      keys: new Set(), last: -1e9, knock: {}, hits: 0, y: 0, vy: 0, p: 0, air: false, hop: false, jumps: 0 };
  }

  // ===== swerve couch: stand-in sofa; Fusion steering hub rings on four modules; wheel stand with a T128 and T2PM pedals =====
  {
    const D = matSet(); const g = new THREE.Group(); scene.add(g);
    const sbox = (w, h, d, x, y, z, m) => box(w, h, d, m, g, x, y + h / 2, z);
    sbox(213, 24, 90, 0, 16, 0, D.leather2);                          // base
    for (const x of [-71, 0, 71]) sbox(68, 12, 66, x, 40, 9, D.leather); // seat cushions, top at 52
    sbox(213, 50, 22, 0, 40, -34, D.leather);                         // back
    sbox(14, 26, 90, -99.5, 40, 0, D.leather); sbox(14, 26, 90, 99.5, 40, 0, D.leather); // arms
    const SX = 64;                                                    // driver's seat (figure's right-hand cushion)
    const STAND_Y = 16, TRAY_Z = 81, TRAY_TILT = 0;   // heights below are in the stand frame
    // --- wheel stand (stand-in): its base frame bolts to the front of the couch's base, flush with the base's underside
    // (clear of the floor, above the wheels), then pedal tray, mast leaning back, deck ---
    const st = new THREE.Group(); st.position.set(SX, STAND_Y, 0); g.add(st);
    for (const x of [-17, 17]) box(4, 3.5, 72, D.paint, st, x, 1.75, 81);
    box(38, 3.5, 4, D.paint, st, 0, 1.75, 47); box(38, 3.5, 4, D.paint, st, 0, 1.75, 115);
    // pedal deck: sits flat on the base frame rails, close to the couch
    const tray = new THREE.Group(); tray.position.set(0, 3.5, TRAY_Z); tray.rotation.x = TRAY_TILT; st.add(tray);
    box(36, 1, 34, D.paint, tray, 0, .5, 0);
    rod(V(0, 3.5, 110), V(0, 75 - STAND_Y, 66), 2.6, D.paint, st);                // mast, leaning back toward the driver
    rod(V(0, 3.5, 110), V(0, 24, 94), 1.6, D.paint, st);                // brace
    const deck = new THREE.Group(); deck.position.set(0, 76 - STAND_Y, 60); deck.rotation.x = .12; st.add(deck);   // high enough for the wheel to clear the knees
    box(30, 1.2, 26, D.paint, deck, 0, .6, 0);
    // --- Thrustmaster T128 base (published: 26 × 30 × 28 cm with the wheel; 270–900° rotation) ---
    const t128 = new THREE.Group(); t128.position.set(0, 1.2, 1); deck.add(t128);
    {
      const sh = new THREE.Shape();                                     // side profile in (z, y): back high, sloping nose toward the driver
      sh.moveTo(11, 0); sh.lineTo(-10, 0); sh.lineTo(-10.5, 7.5); sh.quadraticCurveTo(-10.5, 13.5, -5, 14); sh.lineTo(6, 13); sh.quadraticCurveTo(11, 12, 11, 7); sh.lineTo(11, 0);
      const hg = new THREE.ExtrudeGeometry(sh, { depth: 17, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 3, curveSegments: 10 });
      hg.translate(0, 0, -8.5); hg.rotateY(Math.PI / 2);                  // extrude along x, profile in zy (+z away from driver)
      const housing = new THREE.Mesh(hg, D.plastic); housing.castShadow = true; t128.add(housing);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(12, .4, 6), D.dark); vent.position.set(0, 13.9, 3); vent.rotation.x = -.08; t128.add(vent);
      const logo = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), dmat(0xd8d8d8, { roughness: .4 })); logo.position.set(0, 9, -11.75); logo.rotation.y = Math.PI; t128.add(logo);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 2.2, 24), D.dark); collar.rotation.x = Math.PI / 2; collar.position.set(0, 9, -11.6); t128.add(collar);
      // clamp under the deck: jaw, screw and knob
      box(8, 2, 6, D.dark, t128, 0, -2.4, 4); rod(V(0, -3.4, 4), V(0, -6, 4), .6, D.steel, t128);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.6, 8), D.dark); knob.position.set(0, -6.6, 4); t128.add(knob);
    }
    // --- T128 wheel: round 28 cm rim, three spokes, hub with buttons, 4-colour rev LEDs, magnetic paddles ---
    const wheelMount = new THREE.Group(); wheelMount.position.set(0, 10.2, -13); wheelMount.rotation.y = Math.PI; t128.add(wheelMount);   // local +z → driver
    const wtilt = new THREE.Group(); wtilt.rotation.x = -.08; wheelMount.add(wtilt);
    const wheel = new THREE.Group(); wheel.position.z = 3.2; wtilt.add(wheel);
    {
      const RIM = 13.2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM, 1.45, 14, 72), D.rubber); rim.castShadow = true; wheel.add(rim);
      for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, r = new THREE.Mesh(new THREE.TorusGeometry(1.5, .12, 4, 12), D.dark); r.position.set(Math.cos(a) * RIM, Math.sin(a) * RIM, 0); r.rotation.y = Math.PI / 2; r.rotation.x = 0; r.lookAt(r.position.clone().add(V(-Math.sin(a), Math.cos(a), 0))); wheel.add(r); }
      const spoke = (a, w) => { const s = new THREE.Mesh(new THREE.BoxGeometry(RIM - 4, w, 1.4), D.plastic); s.position.set(Math.cos(a) * (RIM / 2 + 2), Math.sin(a) * (RIM / 2 + 2), -.4); s.rotation.z = a; s.castShadow = true; wheel.add(s); };
      spoke(0, 3.4); spoke(Math.PI, 3.4); spoke(-Math.PI / 2, 2.6);
      const hub = new THREE.Group(); hub.position.z = -.2; wheel.add(hub);
      const hs = new THREE.Shape(); hs.moveTo(-6.5, -4.2); hs.lineTo(6.5, -4.2); hs.quadraticCurveTo(8, -4.2, 8, -2.5); hs.lineTo(7.2, 3.3); hs.quadraticCurveTo(6.8, 5, 5, 5); hs.lineTo(-5, 5); hs.quadraticCurveTo(-6.8, 5, -7.2, 3.3); hs.lineTo(-8, -2.5); hs.quadraticCurveTo(-8, -4.2, -6.5, -4.2);
      const hm = new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: 2.2, bevelEnabled: true, bevelSize: .5, bevelThickness: .5, bevelSegments: 2 }), D.plastic); hm.position.z = -1.1; hm.castShadow = true; hub.add(hm);
      const face = new THREE.Mesh(new THREE.ShapeGeometry(hs), D.dark); face.position.z = 1.65; face.scale.set(.9, .88, 1); hub.add(face);
      // d-pad (left), action buttons (right), centre logo, small buttons below
      for (const [x, y, w, h] of [[-4.6, .6, 2.4, .75], [-4.6, .6, .75, 2.4]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, .5), D.steel); b.position.set(x, y, 1.85); hub.add(b); }
      for (const [x, y, c] of [[4.6, 1.8, 0x2fbf71], [5.8, .6, 0xe0484b], [3.4, .6, 0xd65fc3], [4.6, -.6, 0x4a8cf0]]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .45, 16), dmat(0x3a3c42, { roughness: .35 })); b.rotation.x = Math.PI / 2; b.position.set(x, y, 1.85); hub.add(b);
        const mk = new THREE.Mesh(new THREE.RingGeometry(.18, .3, 12), dmat(c, { emissive: c, emissiveIntensity: .4 })); mk.position.set(x, y, 2.09); hub.add(mk);
      }
      for (const x of [-2.2, 2.2]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .4, 12), dmat(0x3a3c42, { roughness: .35 })); b.rotation.x = Math.PI / 2; b.position.set(x, -2.6, 1.85); hub.add(b); }
      const tl = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), dmat(0xd8d8d8, { roughness: .35, metalness: .6 })); tl.position.set(0, -.2, 1.9); hub.add(tl);
      const leds = [0x3be36b, 0x3be36b, 0xffd23a, 0xff8a1f, 0xff3b3b, 0x5a7dff].map((c, i) => { const m = dmat(c, { emissive: c, emissiveIntensity: 0 }); const l = new THREE.Mesh(new THREE.BoxGeometry(.9, .45, .3), m); l.position.set(-2.75 + i * 1.1, 4.1, 1.85); hub.add(l); return m; });
      for (const sx of [-1, 1]) { const pd = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, .5), D.alu); pd.position.set(sx * 8.4, 2.2, -1.9); pd.rotation.z = sx * -.25; hub.add(pd); }
      rigs.couchLeds = leds;
    }
    // hand anchors on the rim (wheel frame): left hand at 10 o'clock, right at 2 (seen by the driver)
    const handPts = [150, 30].map(a => { const o = new THREE.Object3D(); o.position.set(Math.cos(a * RD) * 13.2, Math.sin(a * RD) * 13.2, 0); o.userData.a = a * RD; wheel.add(o); return o; });
    // --- T2PM pedals on the tray: brake (left foot, the braced leg) and throttle (right) ---
    const pedals = [];
    {
      const pb = new THREE.Group(); pb.position.set(0, 1, 2); tray.add(pb);
      slab(30, 26, 2.4, 3, D.plastic, pb);
      const heel = slab(26, 6, 1.4, 1.5, D.rubber, pb); heel.position.set(0, 2.2, -10);
      for (const [x, nm] of [[6.5, 'brake'], [-6.5, 'gas']]) {                   // figure's left is +x
        // T2PM-style: each arm pivots at the heel end and rises away from the driver; the foot pushes the plate forward and down
        const hinge = new THREE.Group(); hinge.position.set(x, 2.4, -7); hinge.rotation.y = Math.PI; pb.add(hinge);
        const arm = new THREE.Group(); arm.rotation.x = .75; hinge.add(arm);
        box(2.2, 1.6, 15, D.alu, arm, 0, 0, -7.5);
        const plate = slab(7.6, 12.5, 1, 1.6, D.steel, arm); plate.position.set(0, .9, -12); plate.rotation.x = 0;
        for (let i = 0; i < 5; i++) box(6, .25, .5, D.dark, arm, 0, 1.95, -16.5 + i * 2.2);
        const foot = new THREE.Object3D(); foot.position.set(0, 4.5, -12.5); arm.add(foot);
        pedals.push({ nm, arm, foot, rest: .75 });
      }
      box(10, 4, 5, D.plastic, pb, 0, 3.2, 9.5);                             // sensor housing
    }
    const feet = [pedals[0].foot, pedals[1].foot];                                 // left foot → brake, right → gas
    // --- four swerve modules: the Fusion steering ring + a drive wheel, both turning to the module angle ---
    const hub = wsGeo('couchhub').ring; hub.computeBoundingBox(); const hc = hub.boundingBox.getCenter(new THREE.Vector3());
    const mods = [[-92, 32], [92, 32], [-92, -32], [92, -32]].map(([x, z]) => {
      const m = new THREE.Group(); m.position.set(x, 0, z); g.add(m);
      const ringG = new THREE.Group(); ringG.position.y = 12; m.add(ringG);
      const r = new THREE.Mesh(hub, D.red); r.position.copy(hc).negate(); const rr = new THREE.Group(); rr.rotation.z = Math.PI / 2; rr.add(r); ringG.add(rr);
      const yaw = new THREE.Group(); m.add(yaw);
      const roll = new THREE.Group(); roll.position.y = 7.5; yaw.add(roll);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 4, 20), D.rubber); tire.rotation.z = Math.PI / 2; tire.castShadow = true; roll.add(tire);
      const hubcap = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2, 12), D.alu); roll.add(hubcap);
      const arrow = new THREE.Group(); arrow.position.y = 2; yaw.add(arrow);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.6, .6, 1), D.cyan); shaft.position.z = .5; arrow.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6, 12), D.cyan); head.rotation.x = Math.PI / 2; arrow.add(head);
      return { m, ringG, yaw, roll, arrow, shaft, head, x, z, a: 0, s: 0, spin: 0 };
    });
    rigs.couch = { g, mods, wheel, handPts, feet, pedals, SX, x: 0, z: 0, h: 0, vx: 0, vz: 0, w: 0, t: 0, keys: new Set(), last: -1e9, kLast: -1e9, steer: 0, D,
      dr: 0, dl: 0, u: 0, v: 0, r: 0, cy: 0, slip: 0, sp: 0, phi: 0, df: 0, tk: 0, lean: 0, nod: 0, spPrev: 0, dS: 0, combo: 1, dT: 0, grT: 0, score: 0, bank: 0, bankT: -9, ori: 0, oriS: 0, tap: {}, tut: 0, tutT: 0, dist: 0 };
    rigs.chase = { p: new THREE.Vector3(), t: new THREE.Vector3(), w: 0 };
  }

  // ===== city street for the couch, drawn as a hologram: glowing outlines over barely-there faces, so it reads as a simulated
  // city and stays out of the way. Two lanes (the couch in the right one) that bend left into a roundabout, curbs, sidewalks,
  // streetlights, blocks with floor lines; everything is laid out along the centreline STP.at(s), offset o to the driver's right
  {
    const g = new THREE.Group(); scene.add(g);
    const hol = (c, k, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, ...o }); m.userData.k = k; return m; };
    const line = (c, k) => { const m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false }); m.userData.k = k; return m; };
    const M = { road: hol(0x2a3a5c, .1), face: hol(0x00c8e0, .035), lane: hol(0x00e0ff, .38), mid: hol(0xff5fd2, .42),
      edge: line(0x00c8e0, .42), far: line(0x9a7cff, .26), lamp: hol(0xbff6ff, .5) };
    const HW = ST.lane, S1 = STP.S1, DS = 60;
    const E = [], F = [];                                         // segment lists: near (street level) and far (the blocks)
    const seg = (A, a, b) => A.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const off = (s, o, y = 0) => { const p = STP.at(s); return [p.x - o * Math.cos(p.a), y, p.z + o * Math.sin(p.a)]; };   // right = (−cos a, sin a)
    // a flat ribbon between offsets o0 and o1 over s0..s1
    const ribbon = (o0, o1, s0, s1, m, y) => {
      const P = [], I = []; const n = Math.max(1, Math.ceil((s1 - s0) / DS));
      for (let i = 0; i <= n; i++) { const s = s0 + (s1 - s0) * i / n; P.push(...off(s, o0, y), ...off(s, o1, y)); if (i) I.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i); }
      const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gm.setIndex(I);
      const mesh = new THREE.Mesh(gm, m); mesh.frustumCulled = false; g.add(mesh); return mesh;
    };
    const polyline = (A, o, y, s0 = 0, s1 = S1) => { let q = off(s0, o, y); for (let s = s0 + DS; s <= s1 + .1; s += DS) { const r = off(Math.min(s, s1), o, y); seg(A, q, r); q = r; } };
    ribbon(-HW, HW, 0, S1, M.road, .3);
    // lane lines: magenta double centre line, cyan edges, a crosswalk with its stop line on the first straight
    for (const dx of [-9, 9]) ribbon(dx - 4, dx + 4, 0, S1 - 200, M.mid, .4);
    for (const o of [-HW + 30, HW - 30]) ribbon(o - 4, o + 4, 0, S1, M.lane, .4);
    const sX = ST.cross - ST.z0;
    for (let o = -HW + 60; o <= HW - 60; o += 90) ribbon(o - 20, o + 20, sX - 150, sX + 150, M.lane, .4);
    ribbon(10, HW - 30, sX - 230, sX - 210, M.lane, .4);
    for (const sd of [-1, 1]) {
      const oe = sd * HW, ow = sd * (HW + 16 + ST.walk);
      // curb and the sidewalk's outer edge as lines, with its joints
      polyline(E, oe, 15); polyline(E, oe, 0); polyline(E, ow, 0);
      for (let s = 0; s <= S1; s += 300) seg(E, off(s, oe, 15), off(s, ow, 15));
      // streetlights: a pole, an arm over the road, a glowing head
      for (let s = 300; s < S1; s += 1100) {
        const p = STP.at(s), b = off(s, sd * (HW + 60)), a = off(s, sd * (HW + 60 - 220), 790), hd = off(s, sd * (HW + 60 - 240), 785);
        seg(E, b, [b[0], 760, b[2]]); seg(E, [b[0], 740, b[2]], a);
        const head = new THREE.Mesh(new THREE.BoxGeometry(70, 8, 26), M.lamp); head.position.fromArray(hd); head.rotation.y = p.a + Math.PI / 2; g.add(head);
      }
      // blocks along the side, each square to the street where it stands; on the inside of the bend the step is measured on the
      // blocks' far edge so they fan out instead of overlapping
      let s = 0, i = sd > 0 ? 2 : 0; const rnd = (k) => { const v = Math.sin(k * 127.1 + sd * 311.7) * 43758.5453; return v - Math.floor(v); };
      while (s < S1 - 300) {
        const w = 500 + 500 * rnd(i), d = 600 + 300 * rnd(i + .5), h = 700 + 1300 * rnd(i + .25), gap = 40 + 80 * rnd(i + .75);
        const o0 = ow + sd * 40, o1 = o0 + sd * d, p = STP.at(s + w / 2), f = Math.max(.15, 1 + p.k * o1 * 1);   // left turn: inside is o < 0
        const ca = Math.cos(p.a), sa = Math.sin(p.a), om = (o0 + o1) / 2, cx = p.x - om * ca, cz = p.z + om * sa;
        // corners in the street frame: u along (sin a, cos a), v to the right (−cos a, sin a)
        const C4 = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [cx + u * sa - v * ca, cz + u * ca + v * sa]);
        for (const y of [0, h]) for (let q = 0; q < 4; q++) seg(F, [C4[q][0], y, C4[q][1]], [C4[(q + 1) % 4][0], y, C4[(q + 1) % 4][1]]);
        for (let q = 0; q < 4; q++) seg(F, [C4[q][0], 0, C4[q][1]], [C4[q][0], h, C4[q][1]]);
        for (let y = 320; y < h - 60; y += 320) for (let q = 0; q < 4; q++) seg(F, [C4[q][0], y, C4[q][1]], [C4[(q + 1) % 4][0], y, C4[(q + 1) % 4][1]]);
        const b = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), M.face); b.position.set(cx, h / 2, cz); b.rotation.y = p.a; g.add(b);
        s += (w + gap) / f; i++;
      }
    }
    // the roundabout at the far end: an asphalt disc, its curb, a dashed lane circle and the island (the drift ring's pylon sits on it)
    const [px, pz] = STP.plaza, RR = STP.RR;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(RR, 96), M.road); disc.rotation.x = -Math.PI / 2; disc.position.set(px, .32, pz); g.add(disc);
    for (let i = 0; i < 96; i++) {
      const a0 = i / 96 * 2 * Math.PI, a1 = (i + 1) / 96 * 2 * Math.PI, sinA = Math.sin(a0), cosA = Math.cos(a0), sinB = Math.sin(a1), cosB = Math.cos(a1);
      const inRoad = Math.abs(a0 + Math.PI / 2) < .62 || Math.abs(a0 - 1.5 * Math.PI) < .62;    // leave the mouth open where the street comes in (−x side)
      if (!inRoad) { seg(E, [px + RR * sinA, 15, pz + RR * cosA], [px + RR * sinB, 15, pz + RR * cosB]); seg(E, [px + RR * sinA, 0, pz + RR * cosA], [px + RR * sinB, 0, pz + RR * cosB]); }
      seg(E, [px + 160 * sinA, 15, pz + 160 * cosA], [px + 160 * sinB, 15, pz + 160 * cosB]);
      if (i % 2) seg(E, [px + 430 * sinA, 1, pz + 430 * cosA], [px + 430 * sinB, 1, pz + 430 * cosB]);
    }
    rigs.street = { g, M };
  }
  // ===== the couch course: holographic gates, floor chevrons on the next one, and a drift ring round a pylon =====
  {
    const g = new THREE.Group(); scene.add(g);
    const hol = (c, k) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }); m.userData.k = k; return m; };
    const chev = new THREE.Shape([new THREE.Vector2(-40, 0), new THREE.Vector2(0, 34), new THREE.Vector2(40, 0), new THREE.Vector2(40, 14), new THREE.Vector2(0, 48), new THREE.Vector2(-40, 14)]);
    const chevG = new THREE.ShapeGeometry(chev); chevG.rotateX(-Math.PI / 2); chevG.scale(1, 1, -1);   // flat, pointing along +z
    const gates = CC.gates.map(([x, z, h, gw]) => {
      const G = new THREE.Group(); G.position.set(x, 0, z); G.rotation.y = h; g.add(G);
      const m = hol(0x00e0ff, .5), mc = hol(0xff5fd2, 0); const W = gw / 2;
      for (const sx of [-W, W]) { const p = new THREE.Mesh(new THREE.BoxGeometry(8, 170, 8), m); p.position.set(sx, 85, 0); G.add(p); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 8, 10, 8), m); bar.position.y = 170; G.add(bar);
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 10), m); ln.rotation.x = -Math.PI / 2; ln.position.y = .6; G.add(ln);
      for (let i = 0; i < 3; i++) for (const cx of [-W / 2, W / 2]) { const c = new THREE.Mesh(chevG, mc); c.position.set(cx, .7, -130 - 70 * i); G.add(c); }
      return { G, m, mc, x, z, h, W };
    });
    // drift ring: a floor ring, a progress arc that fills as you go round, and the pylon in the middle
    const rm = hol(0x9a7cff, .45), pm = hol(0xff5fd2, .85), cm = hol(0xff5fd2, .5);
    const ring = new THREE.Mesh(new THREE.RingGeometry(CC.ringR - 8, CC.ringR + 8, 96), rm); ring.rotation.x = -Math.PI / 2; ring.position.set(CC.ring[0], .6, CC.ring[1]); g.add(ring);
    const arcG = new THREE.RingGeometry(CC.ringR + 12, CC.ringR + 30, 96, 1, Math.PI / 2, 2 * Math.PI);
    const arc = new THREE.Mesh(arcG, pm); arc.rotation.x = -Math.PI / 2; arc.position.set(CC.ring[0], .7, CC.ring[1]); g.add(arc); arcG.setDrawRange(0, 0);
    const py = new THREE.Mesh(new THREE.CylinderGeometry(14, 40, 160, 16, 1, true), cm); py.position.set(CC.ring[0], 80, CC.ring[1]); g.add(py);
    // the steer arrow on the floor under the couch, and a curved arrow round it for an on-the-spot spin
    const am = hol(0x00b8ff, .6), aG = new THREE.Group(); g.add(aG);
    const shG = new THREE.PlaneGeometry(6, 1); shG.rotateX(-Math.PI / 2); shG.translate(0, 0, .5);
    const shaft = new THREE.Mesh(shG, am); aG.add(shaft);
    const hdG = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-14, 0), new THREE.Vector2(14, 0), new THREE.Vector2(0, 26)])); hdG.rotateX(-Math.PI / 2); hdG.scale(1, 1, -1);
    const head = new THREE.Mesh(hdG, am); aG.add(head);
    const spinM = hol(0x00e0ff, 0), spin = new THREE.Group(); g.add(spin);
    const sArc = new THREE.Mesh(new THREE.RingGeometry(158, 164, 48, 1, -.5, 1.9), spinM); sArc.rotation.x = -Math.PI / 2; spin.add(sArc);
    const sHd = new THREE.Mesh(hdG, spinM); spin.add(sHd);
    { const a = 1.4; sHd.position.set(161 * Math.cos(a), 0, -161 * Math.sin(a)); sHd.rotation.y = a + Math.PI; }
    const arrow = { g: aG, shaft, head, spin, spinM };
    // skid marks: a ring buffer of quads (RGBA vertex colours, alpha fading with age) laid behind the wheels while they slide
    const N = JU.skidN, sP = new Float32Array(N * 12), sC = new Float32Array(N * 16), sI = [];
    for (let i = 0; i < N; i++) sI.push(4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 1, 4 * i + 3, 4 * i + 2);
    const sG = new THREE.BufferGeometry(); sG.setAttribute('position', new THREE.BufferAttribute(sP, 3)); sG.setAttribute('color', new THREE.BufferAttribute(sC, 4)); sG.setIndex(sI);
    const skM = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }); skM.userData.k = .85;
    const skid = new THREE.Mesh(sG, skM); skid.frustumCulled = false; skid.renderOrder = 1; g.add(skid);
    // drift smoke: holographic flecks that puff off the sliding wheels, rise and fade
    const PN = JU.smokeN, pP = new Float32Array(PN * 3), pC = new Float32Array(PN * 4);
    const pG = new THREE.BufferGeometry(); pG.setAttribute('position', new THREE.BufferAttribute(pP, 3)); pG.setAttribute('color', new THREE.BufferAttribute(pC, 4));
    const pM = new THREE.PointsMaterial({ size: 13, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }); pM.userData.k = .9;
    const smoke = new THREE.Points(pG, pM); smoke.frustumCulled = false; g.add(smoke);
    const juice = { sG, sP, sC, born: new Float32Array(N).fill(-99), str: new Float32Array(N), n: 0, last: [null, null, null, null],
      pG, pP, pC, pv: new Float32Array(PN * 3), pl: new Float32Array(PN).fill(-1), pn: 0 };
    rigs.course = { g, gates, rm, pm, cm, arcG, arrow, juice, i: 0, acc: 0, a0: null, t0: -1, best: 0, last: 0, laps: 0 };
  }

  // ===== hearth (stand-in) with a mantel shelf over the firebox; Assym Restore v7 (Fusion) stands on the shelf =====
  {
    const D = matSet(); const g = new THREE.Group(); g.position.set(0, 0, HZ); scene.add(g);
    const stone = dmat(0x9a9085, { roughness: .9, metalness: 0 }), brick = dmat(0x8a4a38, { roughness: .95, metalness: 0 }), mortar = dmat(0x5c3a2e, { roughness: 1, metalness: 0 });
    const oak = dmat(0x6b4a33, { roughness: .7, metalness: 0 });
    // raised hearth slab facing −z (the couch), brick surround behind it, firebox with embers
    const hs = slab(170, 46, 15, 3, stone, g); hs.position.z = 0;
    box(196, 128, 26, brick, g, 0, 64, 34);
    for (let y = 8; y < 128; y += 7.5) box(196.4, .5, 26.4, mortar, g, 0, y, 34);
    box(84, 62, 4, dmat(0x120c0a, { roughness: 1, metalness: 0 }), g, 0, 46, 20.6);
    const fireM = dmat(0xff7a2a, { emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 1, metalness: 0 }); fireM.userData.own = true;
    const embers = new THREE.Mesh(new THREE.BoxGeometry(60, 4, 10), fireM); embers.position.set(0, 17, 16); g.add(embers);
    for (const x of [-16, 0, 16]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 34, 10), dmat(0x3a2418, { roughness: 1, metalness: 0 })); l.rotation.z = Math.PI / 2 + x * .01; l.rotation.y = x * .03; l.position.set(x * .4, 20, 15 + x * .1); g.add(l); }
    const fireLight = new THREE.PointLight(0xff7a30, 0, 380, 1.6); fireLight.position.set(0, 30, 0); g.add(fireLight);
    // mantel: an oak shelf over the firebox (top at MANTEL_Y), on two corbels, with a thin cap on the brick above
    const shelf = slab(184, 26, 5, 1.5, oak, g); shelf.position.set(0, MANTEL_Y - 5, 9);
    for (const x of [-74, 74]) { box(7, 16, 14, oak, g, x, MANTEL_Y - 13, 14); box(7, 5, 9, oak, g, x, MANTEL_Y - 23.5, 16.5); }
    slab(204, 30, 3, 1.5, oak, g).position.set(0, 128, 33);
    // Assym Restore: Fusion y up (base bottom at y −8.8), laser looks out of the shade's slot along Fusion +z → turn it to face the couch
    const dev = new THREE.Group(); dev.position.copy(ASSYM_AT).sub(g.position).add(V(0, 8.8, 0)); dev.rotation.y = Math.PI; g.add(dev);
    const AM = { shade: dmat(0x2f6f6a, { roughness: .45, metalness: .05 }), cap: dmat(0x24262b, { roughness: .5, metalness: .1 }),
      base: dmat(0x24262b, { roughness: .55, metalness: .05 }), servoHousing: dmat(0xe8e2d4, { roughness: .6, metalness: 0 }),
      servo: dmat(0x2a62c9, { roughness: .45, metalness: .1 }), laserHousing: dmat(0xe8e2d4, { roughness: .6, metalness: 0 }),
      laser: dmat(0xb8a24a, { roughness: .3, metalness: .85 }), speaker: dmat(0x1f5b2e, { roughness: .5, metalness: .2 }),
      panServo: dmat(0x1b1c20, { roughness: .4, metalness: .1 }), horn: dmat(0xf4f4f2, { roughness: .5, metalness: 0 }),
      rod: dmat(0xb8bcc4, { roughness: .3, metalness: .9 }), cam: dmat(0x1f3a2c, { roughness: .45, metalness: .2 }) };
    // v7: the MG996R in the base turns everything above the base (its spline sits in the base); the speakers stay with the base
    const fixed = new THREE.Group(); dev.add(fixed);
    const pan = new THREE.Group(); dev.add(pan);
    const P = {};
    for (const p of wsParts('assym')) {
      const ex = new THREE.Group(); (['base', 'speaker'].includes(p.k) ? fixed : pan).add(ex);
      const m = mesh(p.g, AM[p.k], ex); p.g.computeBoundingBox();
      if (['shade', 'cap', 'base'].includes(p.k)) m.renderOrder = 2;        // shells blend over the internals when they go translucent
      P[p.k] = { ex, m, c: p.g.boundingBox.getCenter(new THREE.Vector3()) };
    }
    // device frame: the camera looks along about (−.6, 0, −.8), so parts spread up and across that line, not toward it
    const off = { cap: V(0, 26, 0), shade: V(0, 14, 0), laserHousing: V(-3, 4.5, 2), laser: V(-5.5, 7, 5), servoHousing: V(4, 1, -3), servo: V(7.5, 3.5, -6),
      base: V(0, -2, 0), speaker: V(-8, -2, 6), panServo: V(6, -3, -4.5), horn: V(10, 2.5, -7.5), rod: V(-9, 3, 7), cam: V(-6, 1, 4.5) };
    for (const k in P) P[k].off = off[k] || V(0, 0, 0);
    // tilt linkage, read off the model's holes (Fusion yz, cm): the laser housing is a bell crank on a pin at LP; the push rod
    // joins its rear arm at LA and the 9 g servo's horn (shaft LS) at LH. Tilt θ (front down) lifts LA; the horn angle φ is
    // whatever keeps the rod its own length.
    // The model's horn hole is 1.19 cm out, and lifting the 2.4 cm crank arm with it caps the tilt near 30°. The rod goes to the outer
    // hole of a long single-arm horn instead (HORN_R out): that lifts the crank arm almost its full length, so the beam can point
    // nearly straight down. The horn's arm is stretched to match and the rod lengthened to reach.
    const LP = V(0, 4.03, 4.625), LA = V(0, 4.09, 2.225), LS = V(0, -2.275, 2.875), LH0 = V(0, -2.275, 1.69), LH = V(0, LS.y, LS.z - HORN_R), LROD = LA.distanceTo(LH);
    {
      const pa = P.horn.m.geometry.attributes.position, hub = LS.z - .45, k = (HORN_R - .45) / (LS.z - LH0.z - .45);
      for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i); if (z < hub) pa.setZ(i, hub - (hub - z) * k); }
      pa.needsUpdate = true; P.horn.m.geometry.computeBoundingBox(); P.horn.m.geometry.computeBoundingSphere();
      P.horn.c = P.horn.m.geometry.boundingBox.getCenter(new THREE.Vector3());
      P.rod.m.matrixAutoUpdate = false;
    }
    const rotX = (v, c, a, out) => { const y = v.y - c.y, z = v.z - c.z, co = Math.cos(a), si = Math.sin(a); return out.set(v.x, c.y + y * co - z * si, c.z + y * si + z * co); };
    const _a = new THREE.Vector3(), _h = new THREE.Vector3();
    const hornFor = (th) => {               // φ with |H(φ) − A(θ)| = rod length, or null if the horn can't reach
      rotX(LA, LP, th, _a); let lo = -Math.PI / 2, hi = Math.PI / 2;
      const f = (ph) => rotX(LH, LS, ph, _h).distanceTo(_a) - LROD;
      if (f(lo) * f(hi) > 0) return null;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
      return (lo + hi) / 2;
    };
    let thMax = 0; while (thMax < 1.2 && hornFor(thMax + .005) !== null) thMax += .005;
    const _rq = new THREE.Vector3(), _d0 = LA.clone().sub(LH0), L0 = _d0.length(), ang = (d) => Math.atan2(d.z, d.y);
    const _M = new THREE.Matrix4(), _R = new THREE.Matrix4();
    const setTilt = (th) => {
      th = Math.max(0, Math.min(thMax, th)); const ph = hornFor(th) ?? 0;
      for (const k of ['laser', 'laserHousing']) { const m = P[k].m; m.rotation.x = th; m.position.set(0, LP.y, LP.z).sub(rotX(LP, V(0, 0, 0), th, _rq)).setX(0); }
      P.horn.m.rotation.x = ph; P.horn.m.position.set(0, LS.y, LS.z).sub(rotX(LS, V(0, 0, 0), ph, _rq)).setX(0);
      const A = rotX(LA, LP, th, new THREE.Vector3()), H = rotX(LH, LS, ph, new THREE.Vector3()), d = A.clone().sub(H);
      // rod: the model's rod (LH0 → LA at rest) laid along H → A, stretched along its own axis to the new length
      _M.makeTranslation(H.x, H.y, H.z).multiply(_R.makeRotationX(ang(d))).multiply(_R.makeScale(1, d.length() / L0, 1))
        .multiply(_R.makeRotationX(-ang(_d0))).multiply(_R.makeTranslation(-LH0.x, -LH0.y, -LH0.z));
      P.rod.m.matrix.copy(_M); P.rod.m.matrixWorldNeedsUpdate = true;
      return th;
    };
    // laser: the module's long axis (Fusion +z out of the slot); tilting it is what moves the dot nearer or farther
    const lb = P.laser.m.geometry.boundingBox, tip = V(lb.getCenter(new THREE.Vector3()).x, (lb.min.y + lb.max.y) / 2, lb.max.z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0, depthWrite: false }));
    beam.frustumCulled = false; scene.add(beam);
    rigs.hearth = { g, dev, pan, fixed, P, AM, tip, beam, embers, fireLight, shelf, pa: 0, pT: 0, ta: 0, tT: 0, thMax, setTilt, D, stone };
  }

  // ===== the cat (stand-in, primitives): chases the dot wherever it lands on the floor =====
  {
    const D = matSet(); const g = new THREE.Group(); scene.add(g);
    const blob = (sx, sy, sz, x, y, z, par = g) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), D.dark); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    const body = new THREE.Group(); g.add(body);
    blob(9, 9, 20, 0, 17, 0, body);
    const head = new THREE.Group(); head.position.set(0, 27, 18); body.add(head);
    blob(7, 6.2, 6.5, 0, 0, 0, head);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 4), D.dark); e.position.set(sx * 4, 6, -1); e.rotation.z = -sx * .25; head.add(e); }
    const legs = [[-5, 12], [5, 12], [-5, -12], [5, -12]].map(([x, z]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.6, 14, 8), D.dark); l.position.set(x, 7, z); l.castShadow = true; body.add(l); return l; });
    const tailC = new THREE.CatmullRomCurve3([V(0, 20, -18), V(0, 26, -28), V(0, 36, -31), V(0, 42, -27)]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tailC, 16, 1.4, 6), D.dark); body.add(tail);
    g.position.set(105, 0, 255);
    rigs.cat = { g, body, head, legs, tail, h: Math.PI, gait: 0, v: 0 };
  }
  rigs.dot = { p: new THREE.Vector3(), on: false };
  rigs.ready = true;
  rigUI();
}

// ---------- card controls ----------
const ui = {};
const ASSYM_BOM = [['shade', 'Faceted shade with the laser slot'], ['cap', 'Top cap'], ['laserHousing', 'Laser housing (tilt crank)'], ['laser', '5 V laser module'],
  ['rod', 'Push rod'], ['horn', 'Servo horn'], ['servo', '9 g tilt servo'], ['servoHousing', 'Servo housing'], ['cam', 'ESP32-CAM'],
  ['panServo', 'MG996R pan servo'], ['base', 'Base'], ['speaker', '3 W speaker', 2]];
const SCOOT_BOM = [['frame', 'Frame'], ['column', 'Steering column and bars'], ['fork', 'Front fork'], ['basket', 'Basket'], ['kneepad', 'Knee pad'],
  ['motor', 'C6374 outrunner'], ['mpulley', 'HTD 3M motor pulley'], ['mount', 'Motor mount'], ['belt', 'HTD 3M belt'], ['wpulley', 'Wheel pulley'],
  ['battery', 'Battery pack'], ['wRR', '8 in solid wheel', 4]];
function balloonSet(svgEl, bom) {
  const NS = 'http://www.w3.org/2000/svg';
  return bom.map(([k], i) => {
    const g = document.createElementNS(NS, 'g'), mk = (n, a) => { const e = document.createElementNS(NS, n); for (const q in a) e.setAttribute(q, a[q]); g.appendChild(e); return e; };
    const b = { k, l: mk('line', {}), d: mk('circle', { class: 'dot', r: 2 }), c: mk('circle', { r: 10 }), t: mk('text', {}) }; b.t.textContent = i + 1;
    svgEl.appendChild(g); return b;
  });
}
const bomHTML = (bom) => bom.map(([, n, q], i) => `<li><span class="n">${i + 1}</span><span>${n}</span><span class="q">×${q || 1}</span></li>`).join('');
function rigUI() {
  const $ = (id) => document.getElementById(id);
  // gait plot
  const svg = $('gait'), NS = 'http://www.w3.org/2000/svg';
  const X = (pc) => 28 + pc / 100 * 284, Y = (a) => 104 - a / 70 * 92;
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
  el('rect', { class: 'swing', x: X(62), y: 8, width: X(100) - X(62), height: 96 });
  for (const a of [0, 30, 60]) { el('line', { x1: 28, x2: 312, y1: Y(a), y2: Y(a) }); el('text', { x: 4, y: Y(a) + 3 }).textContent = a + '°'; }
  el('text', { x: X(22), y: 116 }).textContent = 'stance'; el('text', { x: X(76), y: 116 }).textContent = 'swing';
  let d = ''; for (let pc = 0; pc <= 100; pc++) d += (pc ? 'L' : 'M') + X(pc).toFixed(1) + ' ' + Y(curveAt(GAIT_K, pc)).toFixed(1);
  el('path', { class: 'curve', d });
  ui.gait = { X, Y, cur: el('line', { class: 'cursor', y1: 8, y2: 104 }), dot: el('circle', { r: 4 }), read: $('gaitRead'), btn: $('walkBtn'), walking: !reduced, pc: 0, scrub: false };
  ui.gait.btn.setAttribute('aria-pressed', ui.gait.walking);
  ui.gait.btn.onclick = () => { ui.gait.walking = !ui.gait.walking; ui.gait.btn.setAttribute('aria-pressed', ui.gait.walking); };
  const scrub = (e) => { const b = svg.getBoundingClientRect(); ui.gait.pc = clamp01(((e.clientX - b.left) / b.width * 320 - 28) / 284) * 100; ui.gait.walking = false; ui.gait.btn.setAttribute('aria-pressed', false); };
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); scrub(e); });
  svg.addEventListener('pointermove', (e) => { if (svg.hasPointerCapture(e.pointerId)) scrub(e); });
  ui.crSwing = $('crSwing'); ui.crSwingOut = $('crSwingOut'); ui.crRead = $('crRead');
  ui.scSteer = $('scSteer'); ui.scSteerOut = $('scSteerOut'); ui.scKnee = $('scKnee'); ui.scKneeOut = $('scKneeOut'); ui.scRead = $('scRead');
  ui.cwSpin = $('cwSpin'); ui.cwSpinOut = $('cwSpinOut');
  ui.modtable = $('modtable');
  ui.modtable.innerHTML = ['FL', 'FR', 'RL', 'RR'].map(n => `<div><b>${n}</b><span>0°</span><br><span>0%</span></div>`).join('');
  ui.cells = [...ui.modtable.children].map(x => x.querySelectorAll('span'));
  ui.cwSpin.addEventListener('input', () => { rigs.couch.last = clock.elapsedTime; });
  ui.cwSpin.addEventListener('change', () => { ui.cwSpin.value = 0; });
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (rigs.couchOn && (k.length === 1 ? 'wasdqe '.includes(k) : k.startsWith('arrow') || k === 'shift')) {
      const Co = rigs.couch; Co.keys.add(k); Co.last = clock.elapsedTime; if (k !== 'q' && k !== 'e') Co.kLast = clock.elapsedTime;
      // a quick double tap of A or D swings the steering geometry 90° round the couch (−90, 0, +90): it then drives sideways
      const sd = k === 'a' || k === 'arrowleft' ? 1 : k === 'd' || k === 'arrowright' ? -1 : 0;
      if (sd && !e.repeat) {
        const T = clock.elapsedTime;
        if (T - (Co.tap[sd] || -9) < CC.tap) { Co.ori = Math.max(-1, Math.min(1, Co.ori + sd)); Co.tap[sd] = -9; Co.oriUsed = (Co.oriUsed || 0) + 1; } else Co.tap[sd] = T;
      }
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();          // steer and handbrake here instead of scrolling
    }
    if (rigs.scootOn && (k.length === 1 ? 'wasd '.includes(k) : k.startsWith('arrow'))) {
      const S = rigs.scooter; S.last = clock.elapsedTime; S.useSlider = false;
      if (k === ' ') { if (!e.repeat) S.hop = true; } else S.keys.add(k);
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();          // steer and hop here instead of scrolling the page
    }
  });
  addEventListener('keyup', (e) => { rigs.couch.keys.delete(e.key.toLowerCase()); rigs.scooter.keys.delete(e.key.toLowerCase()); });
  addEventListener('blur', () => { rigs.couch.keys.clear(); rigs.scooter.keys.clear(); });
  ui.scSteer.addEventListener('input', () => { rigs.scooter.last = clock.elapsedTime; rigs.scooter.useSlider = true; });
  ui.scBelt = $('scBelt');
  ui.asRead = $('asRead'); ui.laser = $('laser');
  ui.ptr = null; ui.ptrT = -1e9;
  addEventListener('pointermove', (e) => { ui.ptr = { x: e.clientX, y: e.clientY }; ui.ptrT = performance.now(); }, { passive: true });
  // Assym Restore: bill of materials and the balloons that point at each part
  $('bom2').innerHTML = bomHTML(ASSYM_BOM); ui.callouts2 = $('callouts2'); ui.balloons2 = balloonSet(ui.callouts2, ASSYM_BOM);
  $('bom3').innerHTML = bomHTML(SCOOT_BOM); ui.callouts3 = $('callouts3'); ui.balloons3 = balloonSet(ui.callouts3, SCOOT_BOM);
  // clips play only while their card is on screen
  for (const vid of document.querySelectorAll('video[data-src]')) new IntersectionObserver(([en]) => {
    if (en.isIntersecting) { if (!vid.src) vid.src = vid.dataset.src; if (!reduced) vid.play().catch(() => {}); } else vid.pause();
  }).observe(vid);
}

// ---------- per frame ----------
const R3 = { v: new THREE.Vector3(), u: new THREE.Vector3(), k: new THREE.Vector3(), q: new THREE.Quaternion(), a: new THREE.Vector3(), c: new THREE.Vector3() };
const UP = new THREE.Vector3(0, 1, 0), FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function walkWeight(s) { return win(s, 6.55, 6.85, 7.3, 7.6); }
const PARK = { x: 0, z: 110 };                      // where the couch stops, hearth ahead

// called after applyPose (which already blended poseMix) and before the Kicker block
function rigFrame(s, dt) {
  if (!rigs.ready) return;
  const T = clock.elapsedTime;
  const sL0 = s - SCOOT_SH;                          // the couch and hearth scenes keep their old timings on this shifted scroll
  const sL = sL0 <= COUCH_HOLD ? sL0 : Math.max(COUCH_HOLD, sL0 - COUCH_IN);   // ...held still through the drive-ready section
  rigs.chasePre = win(s, 13.3, 13.6, 14.05, 14.3);  // drive-ready: the chase view without touching a key
  const wWalk = walkWeight(s), wCr = win(s, 7.5, 7.78, 8.22, 8.5), wSc = win(s, 8.5, 8.78, 12.22, 12.5), wCo = win(sL, 9.5, 9.78, 12.45 + ASSYM_IN, 12.85 + ASSYM_IN);
  rigs.couchOn = wCo > .5 && sL < 10.3;
  curlHand('L', .18); curlHand('R', .18);
  figure.position.set(0, 0, 0);
  floorGrid.position.set(0, .05, 0); floorGrid.rotation.y = 0; floorGrid.material.opacity = .32;
  rigs.chase.w = 0;

  // ----- walk in the brace -----
  if (wWalk > 0) {
    const G = ui.gait;
    if (G.walking && !reduced) G.pc = (G.pc + dt / 1.1 * 100) % 100;
    figure.position.y = -1.2 * wWalk * (1 - Math.cos(4 * Math.PI * G.pc / 100)) / 2;
    floorGrid.position.z = -((T * 120) % 20) * (G.walking ? 1 : 0);
    const k = curveAt(GAIT_K, G.pc);
    G.cur.setAttribute('x1', G.X(G.pc)); G.cur.setAttribute('x2', G.X(G.pc)); G.dot.setAttribute('cx', G.X(G.pc)); G.dot.setAttribute('cy', G.Y(k));
    G.read.textContent = Math.round(k) + '° knee · ' + Math.round(G.pc) + '% · ' + GAIT_PH.find(p => G.pc <= p[0])[1];
  }

  crutchFrame(s, dt, wCr);
  scooterFrame(s, dt, wSc);
  couchFrame(sL, dt, wCo);
  hearthFrame(sL, dt, T);
}

// ----- crutch under the right arm, walking the one-crutch gait; Water Break holds a bottle between the rails -----
// one cycle: (1) crutch and the left foot swing forward together while the right leg holds the weight, then (2) the
// right foot steps through past them while the crutch tip and left foot stay planted. On the treadmill like the walk:
// the figure stays put and the floor slides back, so planted points move backward at the walking speed.
const CG = { tc: 1.5, v: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion() };
const ease2 = (x) => x * x * (3 - 2 * x);
// fore-aft position (−1 … 1, × quarter stride) and lift (0 … 1) of a point that swings in [a, a+.5) and is planted otherwise
function cgPath(p, a) {
  let u = ((p - a) % 1 + 1) % 1;
  if (u < .5) { const x = u / .5; return { z: -1 + 2 * ease2(x), up: Math.sin(Math.PI * x) }; }
  return { z: 1 - 2 * (u - .5) / .5, up: 0 };
}
function crutchFrame(s, dt, w) {
  const C = rigs.crutch; fade(C.g, w); fade(C.surf, w);
  if (w <= 0) return;
  const A = +ui.crSwing.value * RD, Lc = 131, Q = .5 * Lc * Math.sin(A);   // quarter stride from the swing angle
  ui.crSwingOut.textContent = ui.crSwing.value + '°';
  if (!reduced) C.p = ((C.p || 0) + dt / CG.tc) % 1; else C.p = .25;
  const p = C.p, cr = cgPath(p, 0), lf = cgPath(p, 0), rf = cgPath(p, .5);
  // the body rides highest over each single-leg (or leg + crutch) support and dips at the hand-offs
  figure.position.y = w * (-2.6 - 1.4 * Math.cos(4 * Math.PI * p));
  C.dist = (C.dist || 0) + (reduced ? 0 : 4 * Q / CG.tc * dt);
  floorGrid.position.z = -(C.dist % 20) * w;
  figure.updateMatrixWorld(true);
  // legs: ankle targets in the figure's frame (feet under the hips, flat when planted, toes lifting through the swing)
  const fq = figure.getWorldQuaternion(CG.q);
  for (const [up, leg, foot, P] of [[bones.lUp, bones.lLeg, bones.lFoot, lf], [bones.rUp, bones.rLeg, bones.rFoot, rf]]) {
    const hip = figure.worldToLocal(wpos(up));
    const t = figure.localToWorld(CG.p.set(hip.x * .9, 8.5 + 7 * P.up, 4 + Q * P.z));
    solve2(up, leg, foot, t, wpos(up).add(CG.v.set(0, 0, 60).applyQuaternion(fq)), w);
    const pitch = P.up > 0 ? -.35 * P.up : 0;
    CG.q2.setFromAxisAngle(R3.k.set(1, 0, 0), pitch); const want = fq.clone().multiply(CG.q2);
    foot.quaternion.slerp(foot.parent.getWorldQuaternion(R3.q).invert().multiply(want), w);
  }
  figure.updateMatrixWorld(true);
  const sh = wpos(bones.rArm), topP = R3.v.set(sh.x + 1.5, sh.y - 13, sh.z - 1);
  // crutch: top in the armpit, tip on the floor a little out to the side, moving with the left foot
  const dx = 12, tipZ = topP.z + 22 + Q * cr.z, tipY = 4 * cr.up;
  const tipP = R3.u.set(topP.x - dx, tipY, tipZ);
  C.g.position.copy(topP); C.g.quaternion.identity();
  const axis = topP.clone().sub(tipP).normalize();
  C.body.quaternion.setFromUnitVectors(UP, axis);
  C.body.position.copy(tipP).sub(topP);
  C.g.updateMatrixWorld(true);
  // the slosh is driven by the crutch's angular acceleration about the armpit (finite differences of its swing angle)
  const th = Math.atan2(tipZ - topP.z, topP.y - tipY);
  if (dt > 1e-4) { const om = (th - (C.thp ?? th)) / dt; C.al = (om - (C.omp ?? om)) / dt; C.omp = om; }
  C.thp = th; const al = Math.max(-60, Math.min(60, C.al || 0));
  // right hand closes on the grip: index finger forward along the bolt, palm on top pushing down
  const grip = C.body.localToWorld(new THREE.Vector3(0, 90, 0));
  const gA = R3.a.set(0, 0, 1).transformDirection(C.body.matrixWorld);
  const down = new THREE.Vector3(0, -1, 0).transformDirection(C.body.matrixWorld);
  const cHat = down.clone().addScaledVector(new THREE.Vector3(-1, 0, 0), .25);
  grasp('R', grip, gA, 1.6, w, wpos(bones.rArm).add(new THREE.Vector3(-30, -20, -40)), 1, cHat);
  // water: in the bottle's frame gravity tips by atan(r·α/g); the surface chases that with a damped slosh
  const lvl = C.bottle.localToWorld(new THREE.Vector3(0, C.level, 0));
  const r = lvl.distanceTo(topP) / 100, eq = Math.atan(r * al / 9.81), w0 = 8, z = .25;
  C.dphi += (-w0 * w0 * (C.phi - eq) - 2 * z * w0 * C.dphi) * dt; C.phi = Math.max(-.6, Math.min(.6, C.phi + C.dphi * dt));
  // the swing is about world x, so the slosh tilts the surface in the y–z plane
  const n = R3.k.set(0, Math.cos(C.phi), Math.sin(C.phi));
  C.waterPlane.setFromNormalAndCoplanarPoint(n.clone().negate(), lvl);
  C.surf.position.copy(lvl); C.surf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const tilt = Math.acos(Math.min(1, axis.clone().applyQuaternion(C.g.quaternion).y)) / RD;
  ui.crRead.textContent = 'Crutch ' + tilt.toFixed(0) + '° off vertical · water surface ' + (C.phi / RD).toFixed(1) + '° · capped, nothing spills';
}

// ----- knee scooter: right knee on the pad, hands on the grips, left foot on the floor -----
// Four sections: it weaves a line of cones on a sidewalk by itself (seen from the back right, the belt side), the camera
// punches in on the belt, the scooter stops and comes apart, then it goes back together and the reader can drive it.
// The autopilot is pure pursuit on the slalom line; any key (or the steering slider) takes over, and 3 s of nothing hands back.
const SCF = { v: new THREE.Vector3(), q: new THREE.Quaternion(), a: new THREE.Vector3() };
function scooterFrame(s, dt, w) {
  const S = rigs.scooter; fade(S.g, w); fade(S.course, w);
  rigs.ghost = 0; rigs.scootOn = false;
  if (w <= 0) { ui.callouts3.style.opacity = 0; return; }
  const T = clock.elapsedTime, RW = 10.16, L = SC.L, kneeH = +ui.scKnee.value;
  const e = ease(win(s, 10.55, 10.85, 11.3, 11.6));                 // exploded
  const moving = 1 - win(s, 10.4, 10.7, 11.35, 11.65);               // it rolls to a stop before it comes apart
  rigs.ghost = win(s, 10.5, 10.8, 11.35, 11.6);                     // the rider goes see-through while it is apart
  rigs.scootOn = s > 11.6 && s < 12.4;
  ui.scKneeOut.textContent = (kneeH > 0 ? '+' : '') + kneeH + ' cm';
  // driver: keys (or the slider) if touched in the last 3 s, else the autopilot
  const K = S.keys; if (K.size) S.last = T;                    // a held key keeps it yours
  const manual = rigs.scootOn && T - S.last < 3;
  let vT, dT;
  if (manual) {
    const fwd = K.has('w') || K.has('arrowup'), back = K.has('s') || K.has('arrowdown');
    const left = K.has('a') || K.has('arrowleft'), right = K.has('d') || K.has('arrowright');
    vT = fwd ? 160 : back ? -60 : S.useSlider ? SC.vAuto : 0;
    dT = left ? SC.dMax : right ? -SC.dMax : S.useSlider ? +ui.scSteer.value * RD : 0;   // rider's left is world +x
  } else {
    // pure pursuit: aim the rear axle at a point on the slalom line Ld ahead; δ = atan(2 L sin α / Ld)
    const Ld = 90, zt = S.Z + Ld, xt = SC.amp * Math.sin(Math.PI * zt / SC.gap);
    let al = Math.atan2(xt - S.X, zt - S.Z) - S.psi; al = Math.atan2(Math.sin(al), Math.cos(al));
    dT = Math.abs(al) > Math.PI / 2 ? Math.sign(al) * SC.dMax : Math.atan(2 * L * Math.sin(al) / Ld);
    dT = Math.max(-SC.dMax, Math.min(SC.dMax, dT)); vT = SC.vAuto;
    S.useSlider = false;
  }
  if (reduced) vT = 0;
  S.v += (vT * moving - S.v) * (1 - Math.pow(.05, dt));
  S.delta += (dT * moving - S.delta) * (1 - Math.pow(.002, dt));
  if (!S.useSlider) ui.scSteer.value = Math.round(S.delta / RD);
  ui.scSteerOut.textContent = Math.round(S.delta / RD) + '°';
  // exploded view: pivots shift, every other part slides in its own group
  for (const k in SC_EX) {
    const o = SC_EX[k];
    if (S.piv[k]) S.piv[k].p.position.copy(S.piv[k].p.userData.o).add(SCF.v.fromArray(o).multiplyScalar(e));
    else if (S.ex[k]) S.ex[k].position.fromArray(o).multiplyScalar(e);
  }
  S.kneepad.position.z = kneeH; S.steer.p.rotation.z = S.delta;
  // off the ground: S.y is the rear axle's height above the walk, S.p the nose-up pitch about it; the knee pad, 28 cm ahead of the
  // scooter's origin, rises by y + (28 − rear) sin p and the rider with it
  S.g.rotation.x = -S.p * w;
  const up = (S.y + (28 - S.rearY) * Math.sin(S.p)) * w;
  figure.position.y += up;
  figure.updateMatrixWorld(true);
  const hipR = wpos(bones.rUp), l1 = hipR.distanceTo(wpos(bones.rLeg)), l2 = wpos(bones.rLeg).distanceTo(wpos(bones.rFoot));
  const padTop = 38.1 + kneeH + RW, ky = padTop + 4.5 + up;
  // sink the hips just enough for the thigh to reach the pad
  const dy = Math.min(0, ky + .96 * l1 - hipR.y) * w; figure.position.y += dy; hipR.y += dy;
  const kz = hipR.z + Math.sqrt(Math.max(0, l1 * l1 - (hipR.y - ky) ** 2));
  const Kn = new THREE.Vector3(hipR.x, ky, kz);
  // scooter: Fusion knee point (0, 28, pad top) under the knee; world = P + (−x, z + RW, y)
  S.g.position.set(Kn.x, (S.y - S.rearY * Math.sin(S.p)) * w, Kn.z - 28);
  // apart, the rider rides up with the knee pad
  const lift = SC_EX.kneepad[2] * e;
  figure.position.y += lift * w; Kn.y += lift;
  figure.updateMatrixWorld(true); S.g.updateMatrixWorld(true);
  solve2(bones.rUp, bones.rLeg, bones.rFoot, Kn.clone().add(new THREE.Vector3(0, .5, -l2)), wpos(bones.rUp).add(new THREE.Vector3(0, -10, 60)), w);
  const hipL = wpos(bones.lUp);
  solve2(bones.lUp, bones.lLeg, bones.lFoot, new THREE.Vector3(hipL.x + 3, 9.5 + up, hipL.z + 6), hipL.clone().add(new THREE.Vector3(0, -10, 60)), w);
  // hands close on the grips (index fingers toward the stem, palms behind and over the bar); they let go while it is apart
  const gw = w * (1 - e);
  if (gw > 0) {
    const gl = S.grips[0].getWorldPosition(new THREE.Vector3()), gr = S.grips[1].getWorldPosition(new THREE.Vector3());
    const cHat = new THREE.Vector3(0, -1, .55);
    grasp('L', gl, gr.clone().sub(gl), 1.5, gw, wpos(bones.lArm).add(new THREE.Vector3(35, -25, -25)), 1, cHat);
    grasp('R', gr, gl.clone().sub(gr), 1.5, gw, wpos(bones.rArm).add(new THREE.Vector3(-35, -25, -25)), 1, cHat);
  }
  // roll: track the scooter's pose on the course (rear axle X, Z, heading ψ) with the bicycle model ψ' = v·tan δ / L,
  // then hold the scooter still on screen and move the course and floor by the inverse of that pose
  S.psi += S.v * Math.tan(S.delta) / L * dt;
  S.X += Math.sin(S.psi) * S.v * dt; S.Z += Math.cos(S.psi) * S.v * dt;
  // ramps and hops: the walk's height under the rear axle and the front wheel (a ramp is a wedge rising H over its length along +z)
  const P2r = 2 * SC.gap, rampAt = (x, z) => {
    const lz = (((z - SC.gap / 2 + SC.rampL / 2) % P2r) + P2r) % P2r;            // from the foot of the nearest ramp
    return Math.abs(x - SC.rampX) < SC.rampW / 2 && lz < SC.rampL ? lz / SC.rampL : -1;
  };
  const fR = rampAt(S.X, S.Z), fF = rampAt(S.X + Math.sin(S.psi) * L, S.Z + Math.cos(S.psi) * L);
  const gR = Math.max(0, fR) * SC.rampH, gF = Math.max(0, fF) * SC.rampH;
  if (S.hop && !S.air && moving > .9) { S.air = true; S.vy = Math.max(S.vy, 0) + SC.hop; S.jumps++; }
  S.hop = false;
  if (S.air) {
    S.vy -= SC.g * dt; S.y += S.vy * dt;
    S.p += (-.04 - S.p) * (1 - Math.pow(.2, dt));                                // the nose drops a little in the air
    if (S.y <= gR && S.vy <= 0) { S.y = gR; S.vy = 0; S.air = false; }
  } else if (gR < S.y - .5) {
    // off the lip: launch with the climb rate, plus the kick of the lip (pure geometry would only give a couple of cm at these speeds)
    S.air = true; S.vy = Math.max(S.vy, 0) + .8 * Math.abs(S.v) * Math.sin(S.p); S.jumps++;
  } else {
    S.vy = dt > 1e-4 ? (gR - S.y) / dt : 0; S.y = gR;
    const pT = fR >= 0 ? Math.atan(SC.rampH / SC.rampL) : Math.asin(Math.min(1, gF / L));   // on the ramp: its slope; else the front wheel's climb
    S.p += (pT - S.p) * (1 - Math.pow(1e-4, dt));
  }
  if (w <= 0 || moving < .5) { S.y = 0; S.vy = 0; S.p = 0; S.air = false; }
  S.spin += S.v / RW * dt; for (const wh of S.wheels) wh.p.rotation.x = -S.spin;   // Fusion x is the rider's right, so rolling forward is −x
  S.motor.p.rotation.x = -S.spin * S.ratio;           // the belt steps the motor's speed down to the rear right wheel
  const rear = SCF.a.set(S.g.position.x, 0, S.g.position.z + S.rearY);
  const P2 = 2 * SC.gap, Zw = Math.floor(S.Z / P2) * P2;              // the course repeats every two cones
  S.course.rotation.y = -S.psi;
  S.course.position.copy(rear).add(R3.k.set(-S.X, 0, -(S.Z - Zw)).applyAxisAngle(UP, -S.psi));
  const m = R3.k.set(-(((S.X % 20) + 20) % 20), 0, -(((S.Z % 20) + 20) % 20)).applyAxisAngle(UP, -S.psi);
  const quarter = Math.PI / 2, psiR = S.psi - Math.round(S.psi / quarter) * quarter;
  floorGrid.rotation.y = -psiR * w;
  floorGrid.position.set((rear.x + m.x) * w, .05, (rear.z + m.z) * w);
  // cones: knocked over when the scooter's footprint (wheels, plus the left foot out to the side) reaches one; up again after 3 s
  const cp = Math.cos(S.psi), sp = Math.sin(S.psi);
  for (const c of S.cones) {
    const cz = c.g.position.z + Zw, n = Math.round((cz - SC.gap / 2) / SC.gap);
    const dx = -S.X, dz = cz - S.Z, lx = dx * cp - dz * sp, lz = dx * sp + dz * cp;
    let kn = S.knock[n];
    if (!kn && S.y < 16 && lx > -26 && lx < 36 && lz > -16 && lz < 66 && Math.abs(S.v) > 5) {    // hopped high enough, it clears them
      // it goes over forward and off to whichever side of the scooter it was on
      const sg = Math.sign(S.v), side = lx >= 0 ? 1.3 : -1.3;
      let fx = sp * sg + cp * side, fz = cp * sg - sp * side; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
      kn = S.knock[n] = { t: T, dx: fx, dz: fz }; S.hits++;
    }
    let f = 0;
    if (kn) {
      const age = T - kn.t;
      if (age > 4) delete S.knock[n];
      else f = age < .35 ? ease(age / .35) : age > 3.2 ? 1 - ease((age - 3.2) / .8) : 1;
      c.tip.position.set(kn.dx * (6.5 + 34 * f), 0, kn.dz * (6.5 + 34 * f)); c.body.position.set(-kn.dx * 6.5, 0, -kn.dz * 6.5);
      c.tip.quaternion.setFromAxisAngle(R3.u.set(kn.dz, 0, -kn.dx), 1.45 * f);
    }
    if (!f) { c.tip.position.set(0, 0, 0); c.body.position.set(0, 0, 0); c.tip.quaternion.identity(); }
  }
  // readouts
  const rpm = Math.abs(S.v) / RW / (2 * Math.PI) * 60, R = Math.abs(S.delta) > .005 ? L / Math.tan(Math.abs(S.delta)) : Infinity;
  ui.scBelt.textContent = 'Wheel ' + Math.round(rpm) + ' rpm · motor ' + Math.round(rpm * S.ratio) + ' rpm · pulleys ' + (2 * S.rM * 10).toFixed(0) + ' and ' +
    (2 * S.rW * 10).toFixed(0) + ' mm across (' + S.ratio.toFixed(1) + ':1)';
  ui.scRead.textContent = (manual ? 'You are driving' : 'Autopilot, weaving the cones and missing the ramps') + ' · ' + (Math.abs(S.v) * .036).toFixed(1) + ' km/h · turning radius ' +
    (isFinite(R) && R < 5000 ? (R / 100).toFixed(2) + ' m' : 'straight') + ' · cones knocked ' + S.hits + (S.air ? ' · airborne ' + Math.round(S.y) + ' cm' : S.jumps ? ' · jumps ' + S.jumps : '');
  // balloons on the parts while it is apart
  const show = clamp01(e * 3) * (s > 10.5 && s < 11.65 ? 1 : 0);
  ui.callouts3.style.opacity = show;
  if (show > .01) {
    S.g.updateMatrixWorld(true);
    const W = innerWidth, Hs = innerHeight, ctr = S.g.localToWorld(R3.c.set(0, 40, 0)).project(camera), wp = new THREE.Vector3();
    for (const b of ui.balloons3) {
      S.ex[b.k].localToWorld(wp.copy(S.box[b.k].getCenter(R3.u))); wp.project(camera);
      const x = (wp.x * .5 + .5) * W, y = (-wp.y * .5 + .5) * Hs;
      let ux = wp.x - ctr.x, uy = -(wp.y - ctr.y); const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
      const bx = x + ux * 46, by = y + uy * 46;
      b.l.setAttribute('x1', x); b.l.setAttribute('y1', y); b.l.setAttribute('x2', bx); b.l.setAttribute('y2', by);
      b.d.setAttribute('cx', x); b.d.setAttribute('cy', y); b.c.setAttribute('cx', bx); b.c.setAttribute('cy', by); b.t.setAttribute('x', bx); b.t.setAttribute('y', by);
    }
  }
}

// ----- swerve couch: seated, hands on the T128, feet on the T2PM; then it drives to the hearth and parks -----
const PF = { v: new THREE.Vector3(), h: new THREE.Vector3(), d: new THREE.Vector3(), n: new THREE.Vector3(), t: new THREE.Vector3(), t2: new THREE.Vector3(),
  s: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), qw: new THREE.Quaternion(), m: new THREE.Matrix4(),
  HEEL: 5, ANK: 1.9 + 7.3 };                     // ankle 5 cm up the arm from the pivot; plate face + ankle height above it (measured)
// the steering frame in couch coordinates: forward f, rear axle middle R and wheelbase L from the module positions
function CDframe(Co) {
  const fx = Math.sin(Co.oriS), fz = Math.cos(Co.oriS);
  let lo = Infinity, hi = -Infinity; for (const md of Co.mods) { const d = md.x * fx + md.z * fz; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  return { fx, fz, Rx: fx * lo, Rz: fz * lo, L: Math.max(40, hi - lo), hi };
}
// the course: next gate lit with chevrons, gates passed by getting within half a gate of its middle; the ring wants a full lap round the pylon
function courseFrame(Co, dt, w) {
  const C = rigs.course, T = clock.elapsedTime, n = CC.gates.length;
  fade(C.g, w); if (w <= .002) return '';
  const p = Co.g.position, onRing = C.i === n;
  // steer vector: from the middle of the couch toward heading + steering angle, longer with speed; a ring of ticks while it spins
  { const A = C.arrow, ang = Co.g.rotation.y + Co.oriS + Co.dl, len = 40 + Math.abs(Co.sp) * .7;
    const hf = Co.g.rotation.y + Co.oriS, st0 = CDframe(Co).hi + 48;            // starts just off the leading edge
    A.g.position.set(p.x + Math.sin(hf) * st0 * (Co.sp < -5 ? -1 : 1), 1.2, p.z + Math.cos(hf) * st0 * (Co.sp < -5 ? -1 : 1)); A.g.rotation.y = Co.sp < -5 ? ang + Math.PI : ang; A.shaft.scale.z = len; A.head.position.z = len;
    A.spin.position.set(p.x, 1.2, p.z); A.spin.rotation.y = Co.g.rotation.y + Co.oriS + Co.dl; A.spinM.userData.k = .5 * clamp01(Math.abs(Co.tk) / .4); A.spin.scale.x = Co.tk < 0 ? -1 : 1; }
  C.gates.forEach((G, j) => { const cur = j === C.i % (n + 1) && !onRing, nxt = j === (C.i + 1) % (n + 1); G.m.userData.k = cur ? .95 : nxt ? .4 : .12; G.mc.userData.k = cur ? .7 * (.6 + .4 * Math.sin(T * 6)) : 0; G.m.color.setHex(cur ? 0xff5fd2 : 0x00e0ff); const pa = G.pulse ? T - G.pulse : 9; G.G.scale.setScalar(1 + (pa < .6 ? .35 * Math.sin(pa / .6 * Math.PI) : 0)); if (pa < .6) G.m.userData.k = 1; });
  C.rm.userData.k = onRing ? .8 : .25; C.cm.userData.k = onRing ? .9 : .3;
  fade(C.g, w);
  if (!onRing) {
    const G = C.gates[C.i];
    const ux = p.x - G.x, uz = p.z - G.z, along = ux * Math.sin(G.h) + uz * Math.cos(G.h), lat = ux * Math.cos(G.h) - uz * Math.sin(G.h);
    if (Math.abs(along) < 90 && Math.abs(lat) < G.W + 40) {     // through it, either way
      if (C.i === 0) { if (C.t0 >= 0 && C.done) { C.last = T - C.t0; C.best = C.best ? Math.min(C.best, C.last) : C.last; C.laps++; C.flash = T; } C.t0 = T; C.done = false; }
      G.pulse = T; C.i++; C.acc = 0; C.a0 = null;
    }
  } else {
    const dx = p.x - CC.ring[0], dz = p.z - CC.ring[1], r = Math.hypot(dx, dz), a = Math.atan2(dx, dz);
    if (r < CC.ringR + 260) { if (C.a0 !== null) { let d = a - C.a0; d = Math.atan2(Math.sin(d), Math.cos(d)); C.acc += d; } C.a0 = a; }
    else if (r > CC.ringR + 500) { C.acc = 0; C.a0 = null; }
    if (Math.abs(C.acc) >= 2 * Math.PI) { C.i = 0; C.done = true; C.acc = 0; C.a0 = null; }
  }
  C.arcG.setDrawRange(0, 6 * Math.round(96 * clamp01(Math.abs(C.acc) / (2 * Math.PI))));
  const tm = (t) => Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
  const target = onRing ? 'Drift a full lap round the roundabout ' + Math.round(Math.abs(C.acc) / (2 * Math.PI) * 100) + '%' : C.i === 0 && C.done ? 'Back through gate 1 to finish' : 'Gate ' + (C.i + 1) + ' of ' + n;
  return target + (C.t0 >= 0 ? ' · ' + tm(T - C.t0) : '') + (C.best ? ' · best ' + tm(C.best) : '') + (C.flash && T - C.flash < 4 ? ' · lap ' + tm(C.last) + '!' : '');
}
// skid marks and smoke from each module that is sliding (its wheel's velocity off its own heading), and while it spins on the spot
function juiceFrame(Co, dt, w) {
  const J = rigs.course.juice, T = clock.elapsedTime, N = JU.skidN;
  const slide = clamp01((Math.abs(Co.slip) - 5 * RD) / (20 * RD)) * clamp01(Math.abs(Co.sp) / 60), hb = Co.keys.has(' ') && Math.abs(Co.sp) > 40;
  const spin = clamp01(Math.abs(Co.tk) / 1);
  const str = w > .3 ? Math.max(slide, hb ? .8 : 0, spin * .7) : 0;
  Co.g.updateMatrixWorld(true);
  Co.mods.forEach((md, i) => {
    const p = Co.g.localToWorld(PF.v.set(md.x, 1.1, md.z));
    if (str > .08 && dt > 1e-4) {
      const L = J.last[i];
      if (L && L.distanceToSquared(p) > 36) {
        const dx = p.x - L.x, dz = p.z - L.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * 5, nz = dx / l * 5, k = J.n++ % N;
        J.sP.set([L.x + nx, 1.1, L.z + nz, L.x - nx, 1.1, L.z - nz, p.x + nx, 1.1, p.z + nz, p.x - nx, 1.1, p.z - nz], k * 12);
        J.born[k] = T; J.str[k] = str; L.copy(p);
      } else if (!L) J.last[i] = p.clone();
      // smoke: a few flecks per frame from the rear pair (or all four while spinning)
      if ((md.z < 0 || spin > .3) && Math.random() < str * 1.6) {
        const q = J.pn++ % JU.smokeN; J.pP.set([p.x + (Math.random() - .5) * 20, 4, p.z + (Math.random() - .5) * 20], q * 3);
        J.pv.set([(Math.random() - .5) * 40 - Co.vx * .15, 30 + Math.random() * 50, (Math.random() - .5) * 40 - Co.vz * .15], q * 3); J.pl[q] = 0;
      }
    } else J.last[i] = null;
  });
  // fade the marks by age; flecks rise, slow and fade over 1.1 s
  for (let k = 0; k < N; k++) {
    const a = J.str[k] * clamp01(1 - (T - J.born[k]) / JU.skidLife);
    for (let v = 0; v < 4; v++) J.sC.set([.42, .2, .62, a], (4 * k + v) * 4);
  }
  J.sG.attributes.position.needsUpdate = J.sG.attributes.color.needsUpdate = true;
  for (let q = 0; q < JU.smokeN; q++) {
    if (J.pl[q] < 0) { J.pC[q * 4 + 3] = 0; continue; }
    J.pl[q] += dt; const age = J.pl[q] / 1.1; if (age >= 1) { J.pl[q] = -1; J.pC[q * 4 + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) { J.pP[q * 3 + c] += J.pv[q * 3 + c] * dt; J.pv[q * 3 + c] *= Math.pow(.2, dt); }
    const pink = q % 3 === 0; J.pC.set(pink ? [1, .37, .82, (1 - age) * .8] : [.55, .9, 1, (1 - age) * .7], q * 4);
  }
  J.pG.attributes.position.needsUpdate = J.pG.attributes.color.needsUpdate = true;
}
// drift score: points for slip angle × speed while it slides, a combo that climbs the longer you hold it, banked when it grips again
function driftHud(Co, dt) {
  const T = clock.elapsedTime, sl = Math.abs(Co.slip) / RD, drifting = sl > 10 && Math.abs(Co.sp) > 90;
  if (drifting) { Co.dT += dt; Co.grT = 0; Co.combo = Math.min(5, 1 + Math.floor(Co.dT / 1.5)); Co.dS += sl * Math.abs(Co.sp) * dt * .02 * Co.combo; }
  else if (Co.dS > 0) { Co.grT += dt; if (Co.grT > .6) { Co.score += Math.round(Co.dS); Co.bank = Math.round(Co.dS); Co.bankT = T; Co.dS = 0; Co.dT = 0; Co.combo = 1; } }
  const kmh = Math.round(Math.abs(Co.sp) * .036);
  return kmh + ' km/h' + (Co.dS > 0 ? ' · DRIFT ×' + Co.combo + ' ' + Math.round(Co.dS).toLocaleString() : T - Co.bankT < 2.5 ? ' · +' + Co.bank.toLocaleString() + '!' : '') +
    (Co.score ? ' · score ' + Co.score.toLocaleString() : '') + ' · ';
}
// just-in-time tips while you drive: each one waits for you to try it, then the next
const TIPS = [
  ['<kbd>W</kbd> to go, <kbd>A</kbd> <kbd>D</kbd> to steer, <kbd>S</kbd> to brake', (Co) => Co.dist > 500],
  ['Follow the road through the pink gates: it bends left into a roundabout', (Co, t) => rigs.course.i > 0 || t > 5],
  ['Get some speed, then hold <kbd>Shift</kbd> through a turn to drift', (Co) => Co.df > .5 && Math.abs(Co.slip) > 12 * RD],
  ['Drifting! Steer the other way to hold the slide, let go of <kbd>Shift</kbd> to grip', (Co, t) => t > 4],
  ['Double-tap <kbd>A</kbd> or <kbd>D</kbd>: the steering swings 90° and the couch drives sideways', (Co) => Co.oriUsed > 0],
  ['Double-tap the other way to swing it back. <kbd>Space</kbd> is the handbrake', (Co, t) => t > 6],
  ['Stop, let go of <kbd>W</kbd>, and hold <kbd>A</kbd> or <kbd>D</kbd> to spin on the spot like a tank', (Co) => Math.abs(Co.tk) > .8]];
function tipFrame(Co, dt, show, hud) {
  let el = rigs.tipEl;
  if (!el) {
    el = rigs.tipEl = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:4;pointer-events:none;text-align:center;' +
      'font-family:var(--f-mono);font-size:12px;line-height:1.5;color:#1d1b2e;background:rgba(255,255,255,.82);border:1px solid rgba(110,80,255,.35);padding:8px 14px;' +
      'max-width:min(92vw,520px);transition:opacity .25s;opacity:0';
    el.innerHTML = '<div class="tip" style="font-size:13px"></div><div class="hud" style="color:#6a4cff;letter-spacing:.06em;margin-top:3px"></div>';
    document.body.appendChild(el); el.tipN = -1;
  }
  el.style.opacity = show ? 1 : 0; if (!show) return;
  el.style.left = (innerWidth > 720 ? 460 + (innerWidth - 460) / 2 : innerWidth / 2) + 'px';
  Co.tutT += dt;
  if (Co.tut < TIPS.length && TIPS[Co.tut][1](Co, Co.tutT)) { Co.tut++; Co.tutT = 0; }
  if (el.tipN !== Co.tut) { el.tipN = Co.tut; el.firstChild.innerHTML = Co.tut < TIPS.length ? TIPS[Co.tut][0] : ''; el.firstChild.style.display = Co.tut < TIPS.length ? '' : 'none'; }
  el.lastChild.textContent = hud;
}
function couchFrame(s, dt, w) {
  const Co = rigs.couch; fade(Co.g, w);
  // the street, until it pulls in by the fire; the grid fades under the asphalt
  const wSt = w * (1 - smooth(seg(s, 10.1, 10.5)));
  fade(rigs.street.g, wSt); floorGrid.material.opacity = .32 * (1 - .85 * wSt);
  if (w <= 0) { fade(rigs.course.g, 0); if (rigs.tipEl) rigs.tipEl.style.opacity = 0; return; }
  Co.t += dt;
  const pk = smooth(seg(s, 10.2, 10.7));             // parking: 0 = free driving, 1 = stopped in front of the hearth
  const wDrive = w * (1 - smooth(seg(s, 10.45, 10.8)));  // hands and feet on the controls until he sits back
  let vx = 0, vz = 0, om = +ui.cwSpin.value;
  const K = Co.keys, Tn = clock.elapsedTime; if (K.size) Co.last = Co.kLast = Tn;
  const VMAX = 70, WMAX = .8, k = 1 - Math.pow(.02, dt);
  // keys: driven like a car (Ackermann on the front modules, rear fixed) with the back end stepping out in a drift; the camera
  // pulls in behind for a third-person view. Left alone for 3 s, it goes back to showing off what a holonomic base can do.
  const drive = rigs.couchOn && Tn - Co.kLast < 3 && !reduced;
  Co.dr += ((drive ? 1 : 0) - Co.dr) * (1 - Math.pow(.15, dt));
  const ch0 = Math.cos(Co.h), sh0 = Math.sin(Co.h);
  if (drive) {
    const has = (a, b) => K.has(a) || K.has(b);
    const thr = (has('w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0), st = (has('a', 'arrowleft') ? 1 : 0) - (has('d', 'arrowright') ? 1 : 0);
    const hb = K.has(' ');                                                // handbrake: the rear lets go
    Co.df += ((K.has('shift') ? 1 : 0) - Co.df) * (1 - Math.pow(.02, dt));   // Shift: drift mode (oversteer, loose rear); otherwise it grips
    // steering frame: the body stays put while the modules re-aim, so the direction of travel swings with it (with some speed lost)
    const dO = (Co.ori * Math.PI / 2 - Co.oriS) * (1 - Math.pow(1e-4, dt)); Co.oriS += dO; Co.phi += dO;
    if (Math.abs(dO) > 1e-4) Co.sp *= Math.pow(.6, Math.abs(dO) / (Math.PI / 2));
    const fr = CDframe(Co);
    // steering lock eases off with speed so it stays drivable at the top end
    Co.dl += (st * CD.dMax / (1 + Math.abs(Co.sp) / CD.vLock) - Co.dl) * (1 - Math.pow(.003, dt));
    let a = thr * CD.acc - CD.drag * Co.sp;
    if (thr && Math.sign(thr) !== Math.sign(Co.sp) && Math.abs(Co.sp) > 5) a = -Math.sign(Co.sp) * CD.brake;
    if (hb) a -= Math.sign(Co.sp) * Math.min(Math.abs(Co.sp) / dt, CD.brake * .4);
    Co.sp += a * dt;
    // the body yaws at the Ackermann rate u·tan δ / L, overdriven as speed builds (oversteer); the direction of travel only
    // follows the heading as fast as the tyres grip, so in a hard turn the couch points into the corner and slides: a drift
    const rK = Co.sp * Math.tan(Co.dl) / fr.L;
    Co.r += (rK * (1 + CD.over * Co.df * clamp01(Math.abs(Co.sp) / CD.vTop)) - Co.r) * (1 - Math.pow(.02, dt));
    // tank steer: off the throttle and slow, A/D also spin it on the spot (every module tangent to a circle round the middle);
    // it fades out as speed builds, where Ackermann takes over
    const wTk = thr ? 0 : st * CD.wTank * (1 - clamp01(Math.abs(Co.sp) / CD.vTank));
    Co.tk += (wTk - Co.tk) * (1 - Math.pow(.01, dt));
    Co.h += (Co.r + Co.tk) * dt; Co.phi += Co.tk * dt;
    const hv = Co.h + Co.oriS;                                            // the heading the steering works in
    let sl = Math.atan2(Math.sin(hv - Co.phi), Math.cos(hv - Co.phi));
    sl *= Math.exp(-(hb ? CD.gripHB : CD.gripN + (CD.grip - CD.gripN) * Co.df) * dt); sl = Math.max(-CD.slipMax, Math.min(CD.slipMax, sl));
    Co.phi = hv - sl; Co.slip = sl;
    Co.vx = Co.sp * Math.sin(Co.phi); Co.vz = Co.sp * Math.cos(Co.phi); Co.w = Co.r;
    Co.x += Co.vx * dt; Co.z += Co.vz * dt; Co.dist += Math.abs(Co.sp) * dt;
    Co.u = Co.sp * Math.cos(sl); Co.v = -Co.sp * Math.sin(sl);
  } else {
    const q = 1 - (rigs.chasePre || 0);                // drive-ready: it settles, square to the street, waiting for a key
    if (Tn - Co.last > 3 && !reduced) { vx = .7 * q * Math.cos(Co.t * .5); vz = .7 * q * Math.sin(Co.t * .5); om = .55 * q * Math.sin(Co.t * .23); }   // circle while turning: only a holonomic base does this
    if (Co.dr < .02) Co.h = Math.atan2(Math.sin(Co.h), Math.cos(Co.h));
    const mg = Math.hypot(vx, vz); if (mg > 1) { vx /= mg; vz /= mg; }
    Co.vx += (vx * VMAX - .6 * Co.x - Co.vx) * k; Co.vz += (vz * VMAX - .6 * Co.z - Co.vz) * k; Co.w += (om * WMAX - .5 * Co.h - Co.w) * k;
    Co.x += Co.vx * dt; Co.z += Co.vz * dt; Co.h += Co.w * dt;
    Co.u = sh0 * Co.vx + ch0 * Co.vz; Co.v = ch0 * Co.vx - sh0 * Co.vz; Co.r = Co.w; Co.dl *= 1 - k; Co.slip = 0;
    Co.ori = 0; Co.tk = 0; Co.oriS *= 1 - k; Co.sp = Co.u; Co.phi = Co.h;          // so a takeover starts from how it is moving, steering square
  }
  // the shown pose blends from free driving to the parking spot; module speeds come from how the shown pose moves
  const X = Co.x + (PARK.x - Co.x) * pk, Z = Co.z + (PARK.z - Co.z) * pk, H = Co.h * (1 - pk);
  if (Co.px === undefined) { Co.px = X; Co.pz = Z; Co.ph = H; Co.svx = Co.svz = Co.sw = 0; }
  if (dt > 1e-4) {
    const f = 1 - Math.pow(.001, dt);
    Co.svx += ((X - Co.px) / dt - Co.svx) * f; Co.svz += ((Z - Co.pz) / dt - Co.svz) * f; Co.sw += ((H - Co.ph) / dt - Co.sw) * f;
  }
  Co.px = X; Co.pz = Z; Co.ph = H;
  ui.cwSpinOut.textContent = (Co.sw / WMAX).toFixed(2);
  const base = new THREE.Vector3(-Co.SX, 0, 6);
  // lean: the body rolls out of a turn (lateral accel u·ω) and squats back under throttle, nose dips under braking
  const drv = Co.dr * (1 - pk);
  if (dt > 1e-4) {
    const ax = (Co.sp - Co.spPrev) / dt, ay = Co.sp * (Co.r + Co.tk); Co.spPrev = Co.sp;
    const f = 1 - Math.pow(.004, dt);
    Co.lean += (Math.max(-JU.roll, Math.min(JU.roll, ay / 900 * JU.roll)) * drv - Co.lean) * f;
    Co.nod += (Math.max(-JU.pitch, Math.min(JU.pitch, -ax / 600 * JU.pitch)) * drv - Co.nod) * f;
  }
  Co.g.rotation.order = 'YXZ'; Co.g.position.set(base.x + X, 0, base.z + Z); Co.g.rotation.set(Co.nod, H, Co.lean);
  // third-person chase: behind the backrest and up, swinging round after the heading with a lag so a drift shows its angle
  {
    Co.g.updateMatrixWorld(true);
    const C = rigs.chase, P = Co.g.localToWorld(PF.v.set(Co.SX / 2, 0, 20));   // between the couch's middle and the driver
    const Hv = H + Co.oriS;                                             // behind the steering frame, not the backrest
    Co.cy += Math.atan2(Math.sin(Hv - Co.cy), Math.cos(Hv - Co.cy)) * (1 - Math.pow(.08, dt));
    if (Co.dr < .01) Co.cy = H;
    const sy = Math.sin(Co.cy), cy = Math.cos(Co.cy);
    const spd01 = clamp01(Math.abs(Co.sp) / CD.vTop), back = 720 - 140 * spd01;           // it pulls in a little as speed builds (the FOV opens)
    C.p.set(P.x - sy * back, 330 - 60 * spd01, P.z - cy * back); C.t.set(P.x + sy * 260, 30, P.z + cy * 260); C.w = Math.max(smooth(Co.dr), rigs.chasePre || 0) * w * (1 - pk);
    C.fov = JU.fov * spd01 * spd01;
    // shake while sliding hard, from a few sines so it reads as rumble rather than jitter
    const sh = clamp01((Math.abs(Co.slip) - 6 * RD) / (30 * RD)) * spd01 * 6, Tc = clock.elapsedTime;
    C.p.x += sh * Math.sin(Tc * 37.1) * Math.cos(Tc * 13.3); C.p.y += sh * .7 * Math.sin(Tc * 41.7 + 1); C.t.y += sh * .4 * Math.sin(Tc * 29.3 + 2);
    if (innerWidth > 720) { const off = 120 * (1 - (rigs.chasePre || 0)), px = cy * off, pz = -sy * off; C.p.x += px; C.p.z += pz; C.t.x += px; C.t.z += pz; }   // clear the card on the left
    if (C.w > .001) floorGrid.position.set(Math.round(P.x / 20) * 20, .05, Math.round(P.z / 20) * 20);
  }
  { const wc = smooth(Co.dr) * w * (1 - pk); juiceFrame(Co, dt, wc); tipFrame(Co, dt, wc > .5, driftHud(Co, dt) + courseFrame(Co, dt, wc)); }
  // the wheel turns with the spin rate (it is what he steers with), within the T128's lock
  const stT = Co.dr > .5 ? Co.dl * 2.4 : Co.sw / WMAX * 1.3;            // driving, the T128 turns with the steering angle (+ = counterclockwise to him = left)
  Co.steer += (Math.max(-1.2, Math.min(1.2, stT)) - Co.steer) * (1 - Math.pow(.01, dt));
  Co.wheel.rotation.z = Co.steer;
  const spd = Co.dr > .5 ? Math.min(1, Math.abs(Co.sp) / CD.vTop) : Math.min(1, Math.hypot(Co.svx, Co.svz) / VMAX + Math.abs(Co.sw) / WMAX * .4);
  Co.pedals[1].arm.rotation.x = Co.pedals[1].rest - .32 * spd;     // throttle follows speed
  rigs.couchLeds.forEach((m, i) => { m.emissiveIntensity = spd * 6 > i + .3 ? 1.6 : .05; });
  Co.g.updateMatrixWorld(true);
  // figure: hips onto the seat (seat top 52, hip joints ~9 cm above), turning with the couch
  figure.updateMatrixWorld(true);
  const hipsL = figure.worldToLocal(wpos(bones.hips));
  const seatW = Co.g.localToWorld(new THREE.Vector3(Co.SX, 61, -6));
  const place = seatW.sub(hipsL.clone().applyAxisAngle(UP, H));
  figure.position.lerp(place, w); figure.rotation.order = 'YXZ'; figure.rotation.set(Co.nod * w, H * w, Co.lean * w);
  figure.updateMatrixWorld(true);
  const fq = figure.quaternion;
  if (wDrive > 0) {
    // hands round the rim at 10 and 2: knuckle line along the rim toward 12, palm on the driver's side of the rim
    const wq = Co.wheel.getWorldQuaternion(R3.q);
    for (const [i, sd] of [[0, 'L'], [1, 'R']]) {
      const o = Co.handPts[i], a = o.userData.a + Co.steer, C = o.getWorldPosition(new THREE.Vector3());
      const tng = (sd === 'L' ? new THREE.Vector3(Math.sin(a), -Math.cos(a), 0) : new THREE.Vector3(-Math.sin(a), Math.cos(a), 0));
      // index points toward the top of the rim: pick the tangent direction that climbs
      if (tng.y < 0) tng.negate();
      const cHat = new THREE.Vector3(-.6 * Math.cos(a), -.6 * Math.sin(a), -.8);
      const sideX = sd === 'L' ? 30 : -30;
      grasp(sd, C, tng.applyQuaternion(wq), 1.45, wDrive, wpos(sd === 'L' ? bones.lArm : bones.rArm).add(new THREE.Vector3(sideX, -30, -10).applyQuaternion(fq)), 1, cHat.applyQuaternion(wq));
    }
  }
  // feet on the pedals, even sitting back: heel by the pivot, sole flat along the plate, toes up it
  Co.pedals[0].arm.rotation.x = Co.pedals[0].rest;
  for (const [i, up, leg, foot] of [[0, bones.lUp, bones.lLeg, bones.lFoot], [1, bones.rUp, bones.rLeg, bones.rFoot]]) {
    const P = Co.pedals[i], pole = wpos(up).add(PF.v.set(0, 20, 60).applyQuaternion(fq));
    P.arm.updateMatrixWorld(true);
    const hw = P.arm.getWorldPosition(PF.h), aq = P.arm.getWorldQuaternion(PF.q);
    const d = PF.d.set(0, 0, -1).applyQuaternion(aq), n = PF.n.set(0, 1, 0).applyQuaternion(aq);   // along the arm, plate normal
    solve2(up, leg, foot, PF.t.copy(hw).addScaledVector(d, PF.HEEL).addScaledVector(n, PF.ANK), pole, w);
    // bones carry no rest rotation, so a foot's toe direction is +z and its sole normal +y in its own frame
    const t = PF.t2.copy(d).addScaledVector(n, -d.dot(n)).normalize(), b = PF.b.crossVectors(t, n);
    PF.m.makeBasis(b.negate(), n, t); PF.qw.setFromRotationMatrix(PF.m);
    foot.quaternion.slerp(PF.q2.copy(foot.parent.getWorldQuaternion(PF.q)).invert().multiply(PF.qw), w);
  }
  // module kinematics in the couch frame: v_i = v + ω × r_i
  const ch = Math.cos(-H), sh = Math.sin(-H);
  let lvx = Co.svx * ch + Co.svz * sh, lvz = -Co.svx * sh + Co.svz * ch, sw = Co.sw, VM = VMAX;
  // driving: the modules hold Ackermann (each front one at its own angle, rear straight), turning about a point on the rear axle line
  if (Co.dr > .5) {
    // v_i = u f + ω × (r_i − R): f the steering frame's forward, R the middle of its rear axle line (no sideways slip there)
    const fr = CDframe(Co); sw = Co.u * Math.tan(Co.dl) / fr.L;
    lvx = Co.u * fr.fx - sw * fr.Rz; lvz = Co.u * fr.fz + sw * fr.Rx; VM = CD.vTop;
    sw += Co.tk;                                                        // plus the on-the-spot spin about the middle
  }
  let top = 1; for (const md of Co.mods) { md.tx = lvx + sw * md.z; md.tz = lvz - sw * md.x; top = Math.max(top, Math.hypot(md.tx, md.tz) / VM); }
  Co.mods.forEach((md, i) => {
    let sp = Math.hypot(md.tx, md.tz) / VM / top;
    if (sp > .02) {
      let a = Math.atan2(md.tx, md.tz), da = Math.atan2(Math.sin(a - md.a), Math.cos(a - md.a));
      if (Math.abs(da) > Math.PI / 2) { da -= Math.sign(da) * Math.PI; sp = -sp; }   // reverse the wheel rather than steer past 90°
      md.a += Math.max(-7 * dt, Math.min(7 * dt, da));
    } else sp = 0;
    md.s = sp; md.spin += sp * VM / 7.5 * dt;
    md.yaw.rotation.y = md.a; md.ringG.rotation.y = md.a; md.roll.rotation.x = md.spin;
    const len = Math.abs(sp) * 34 + .01; md.shaft.scale.z = len; md.shaft.position.z = Math.sign(sp || 1) * len / 2; md.head.position.z = Math.sign(sp || 1) * (len + 3);
    md.head.rotation.x = sp >= 0 ? Math.PI / 2 : -Math.PI / 2;
    md.arrow.visible = pk < .98;
    ui.cells[i][0].textContent = Math.round(((md.a / RD) % 360 + 540) % 360 - 180) + '°'; ui.cells[i][1].textContent = Math.round(sp * 100) + '%';
  });
}

// ----- the hearth, and Assym Restore on it: in use (laser for the cat), then exploded with its shells turned translucent -----
// PAN: the MG996R's stock 180°, centred on the couch. Past ±90° the laser would face the brick behind it, so more travel buys nothing.
const AS = { ray: new THREE.Raycaster(), bray: new THREE.Raycaster(), nd: new THREE.Vector2(), hit: new THREE.Vector3(), tipW: new THREE.Vector3(), d: new THREE.Vector3(), cam: new THREE.Vector3(),
  PAN: 90 * RD, sb: null, solid: null, tg: [], hits: [], sph: new THREE.Sphere(),
  FIG: [['hips', 'spine2', 13], ['spine2', 'head', 9], ['lUp', 'lLeg', 7.5], ['lLeg', 'lFoot', 5.5], ['rUp', 'rLeg', 7.5], ['rLeg', 'rFoot', 5.5],
    ['lArm', 'lFore', 5], ['lFore', 'lHand', 4], ['rArm', 'rFore', 5], ['rFore', 'rHand', 4]] };   // bone to bone, radius (cm)
// the cat's floor plan: footprints as xz boxes [x0, z0, x1, z1, r], read off the scene every frame (every part of the couch and hearth that
// reaches below the cat's ears, and the figure's shins and feet). The cat's centre stays r clear of each: R for its body and head (nose
// 24.5 cm out), RT from anything taller than TY, which its tail (32.4 cm out, 22.6 cm up and higher) could sweep. It plans PAD further
// off, so cutting a corner while it turns doesn't bring it inside r.
// the cat jumping onto the couch seat (cushion top 52 cm): take-off within reach of the front edge, an arc over dur seconds,
// and a lap-sized gap kept either side of the figure's hips
const CJ = { dur: .55, arc: 30, reach: 66, lap: 26, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), f: new THREE.Vector3(), g: new THREE.Vector3() };
const CN = { R: 25, RT: 33, TY: 22, PAD: 7, H: 42, bx: new THREE.Box3(), obs: [], N: [], D: [], P: [], U: [], g: new THREE.Vector3(), p: new THREE.Vector3(),
  a: new THREE.Vector3(), k: new THREE.Vector3(), f: new THREE.Vector3(), d: new THREE.Vector3(), n: new THREE.Vector3(), q: new THREE.Quaternion(),
  wx: 0, wz: 0, len: 0, reach: true, t0: 0, t1: 1 };
function catObstacles() {
  const o = CN.obs, b = CN.bx; o.length = 0;
  const kids = (g, skip) => { if (g.visible) for (const c of g.children) if (c !== skip && !c.isLight) { b.setFromObject(c); if (!b.isEmpty() && b.min.y < CN.H) o.push([b.min.x, b.min.z, b.max.x, b.max.z, b.max.y > CN.TY ? CN.RT : CN.R]); } };
  kids(rigs.couch.g); kids(rigs.hearth.g, rigs.hearth.dev);
  // the skinned figure has no useful bounding box: sample the legs from the bones (sole 7.3 cm under the ankle, heel 5 back, toe 20 forward)
  if (figure.visible) for (const sd of 'lr') {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, y1 = 0;
    const ex = (v) => { if (v.y < CN.H) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); y1 = Math.max(y1, v.y); } };
    const hp = bones[sd + 'Up'].getWorldPosition(CN.a), kn = bones[sd + 'Leg'].getWorldPosition(CN.k), an = bones[sd + 'Foot'].getWorldPosition(CN.f);
    for (let t = 0; t <= 1; t += .125) { ex(CN.p.lerpVectors(hp, kn, t)); ex(CN.p.lerpVectors(kn, an, t)); }
    const q = bones[sd + 'Foot'].getWorldQuaternion(CN.q), d = CN.d.set(0, 0, 1).applyQuaternion(q), n = CN.n.set(0, 1, 0).applyQuaternion(q);
    for (const s of [-5, 20]) ex(CN.p.copy(an).addScaledVector(n, -7.3).addScaledVector(d, s));
    if (x0 < 1e9) o.push([x0 - 6, z0 - 6, x1 + 6, z1 + 6, y1 + 6 > CN.TY ? CN.RT : CN.R]);   // 6 cm of calf and shoe round the bone line
  }
  for (let i = o.length; i--;) { const a = o[i]; if (o.some((c, j) => j !== i && c[0] <= a[0] && c[1] <= a[1] && c[2] >= a[2] && c[3] >= a[3] && c[4] >= a[4])) o.splice(i, 1); }   // drop boxes inside others
}
// clearance of a point: how far it is beyond the r of the nearest footprint, per axis (< 0: the cat would be touching it)
const catClr = (x, z) => { let m = 1e9; for (const b of CN.obs) m = Math.min(m, Math.max(b[0] - x, x - b[2], b[1] - z, z - b[3]) - b[4]); return m; };
function catSlab(p, d, lo, hi) {                   // clip the segment's [t0, t1] to one axis of a box; false once it misses
  if (Math.abs(d) < 1e-9) return p > lo && p < hi;
  let u = (lo - p) / d, w = (hi - p) / d; if (u > w) { const t = u; u = w; w = t; }
  CN.t0 = Math.max(CN.t0, u); CN.t1 = Math.min(CN.t1, w); return CN.t0 < CN.t1;
}
function catSeg(ax, az, bx, bz, g) {               // true when a → b keeps a clearance of g all the way
  for (const b of CN.obs) { const r = b[4] + g; CN.t0 = 0; CN.t1 = 1; if (catSlab(ax, bx - ax, b[0] - r, b[2] + r) && catSlab(az, bz - az, b[1] - r, b[3] + r)) return false; }
  return true;
}
function catFree(x, z, g, out) {                   // the nearest point with a clearance of g, searched in rings outward
  if (catClr(x, z) >= g) return out.set(x, 0, z);
  for (let r = 2; r < 900; r += 2) for (let k = 0, n = Math.max(24, r | 0); k < n; k++) {
    const a = k / n * 2 * Math.PI, px = x + r * Math.sin(a), pz = z + r * Math.cos(a);
    if (catClr(px, pz) >= g) return out.set(px, 0, pz);
  }
  return out.set(x, 0, z);
}
// shortest path from the cat to the goal over a visibility graph (the corners of the grown footprints); sets the next waypoint
// (CN.wx, CN.wz), the length still to run (CN.len) and whether the goal can be reached at all (CN.reach)
function catPlan(sx, sz, gx, gz) {
  const G = CN.PAD, N = CN.N, D = CN.D, P = CN.P, U = CN.U; N.length = D.length = P.length = U.length = 0;
  N.push(sx, sz, gx, gz);
  for (const b of CN.obs) for (let c = 0; c < 4; c++) { const r = b[4] + G, x = c & 1 ? b[2] + r : b[0] - r, z = c & 2 ? b[3] + r : b[1] - r; if (catClr(x, z) > G - .5) N.push(x, z); }
  const n = N.length / 2, gs = Math.min(G, catClr(sx, sz)) - 1;          // leaving the start, allow the clearance it has now
  for (let i = 0; i < n; i++) { D.push(i ? Infinity : 0); P.push(-1); U.push(false); }
  for (;;) {
    let i = -1; for (let k = 0; k < n; k++) if (!U[k] && D[k] < Infinity && (i < 0 || D[k] < D[i])) i = k;
    if (i < 0) break; U[i] = true; if (i === 1) break;
    for (let j = 1; j < n; j++) if (!U[j]) {
      const l = D[i] + Math.hypot(N[2 * j] - N[2 * i], N[2 * j + 1] - N[2 * i + 1]);
      if (l < D[j] && catSeg(N[2 * i], N[2 * i + 1], N[2 * j], N[2 * j + 1], i ? G - 1 : gs)) { D[j] = l; P[j] = i; }
    }
  }
  // walled in: settle for the reachable corner nearest the goal
  let e = 1; CN.reach = U[1];
  if (!CN.reach) { let best = 1e9; for (let k = 0; k < n; k++) if (U[k]) { const l = Math.hypot(N[2 * k] - gx, N[2 * k + 1] - gz); if (l < best) { best = l; e = k; } } }
  CN.len = D[e]; while (P[e] > 0) e = P[e];
  CN.wx = N[2 * e]; CN.wz = N[2 * e + 1];
}
function hearthFrame(s, dt, T) {
  const sX = s - ASSYM_IN;                           // the exploded view and the close, after the up-close section
  const Hh = rigs.hearth, wH = smooth(seg(s, 10.3, 10.75)) * (1 - smooth(seg(sX, 12.5, 12.9)));
  const wAs = win(s, 10.6, 10.85, 11.4, 11.65), e = ease(win(sX, 11.7, 12.0, 12.45, 12.7)), xr = win(sX, 11.55, 11.8, 12.5, 12.75);
  // x-ray: the shade, cap and base fade to a tint (fade() multiplies by userData.k) so the internals show through
  for (const k of ['shade', 'cap', 'base']) Hh.AM[k].userData.k = 1 - .8 * xr;
  fade(Hh.g, wH);
  const fireM = Hh.embers.material;
  fireM.opacity = wH; fireM.transparent = wH < .999; Hh.embers.visible = wH > .002;
  fireM.emissiveIntensity = 1 + .35 * Math.sin(T * 7.3) + .2 * Math.sin(T * 13.1 + 1);
  Hh.fireLight.intensity = wH * (4000 + 900 * Math.sin(T * 9.1) + 600 * Math.sin(T * 17.3));
  Hh.beam.visible = false; ui.laser.style.opacity = 0;
  const Ct = rigs.cat; fade(Ct.g, wAs);
  if (wH <= 0) { ui.callouts2.style.opacity = 0; return; }

  // in use: the cursor picks a spot on the floor, the servo turns the shade (and the laser in its slot) to face it
  if (wAs > 0) {
    let x, y;
    if (ui.ptr && performance.now() - ui.ptrT < 4000) { x = ui.ptr.x; y = ui.ptr.y; }
    else { const u = reduced ? 0 : T * .8; x = innerWidth * (.62 + .22 * Math.sin(u * 1.3)); y = innerHeight * (.6 + .15 * Math.sin(u * 2.1 + 1)); }
    AS.nd.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); AS.ray.setFromCamera(AS.nd, camera);
    // the cursor can point at the hearth or the mantel itself, not just the floor: then the laser tips steeply down to it
    if (!AS.solid) { AS.solid = []; for (const c of Hh.g.children) if (c !== Hh.dev) c.traverse(m => { if (m.isMesh) AS.solid.push(m); }); }
    AS.hits.length = 0; AS.onObj = AS.ray.intersectObjects(AS.solid, false, AS.hits).length > 0;
    if (AS.onObj) AS.hit.copy(AS.hits[0].point);
    if (AS.onObj || AS.ray.ray.intersectPlane(FLOOR, AS.hit)) {
      const dx = AS.hit.x - ASSYM_AT.x, dz = AS.hit.z - ASSYM_AT.z;
      Hh.pT = Math.max(-AS.PAN, Math.min(AS.PAN, Math.atan2(-dx, -dz)));   // device faces −z: pan 0 points at the couch
      // tilt: aim the beam down at the cursor's spot; the linkage caps it (Hh.thMax), past that the dot stays at its nearest reach
      Hh.P.laser.m.localToWorld(AS.tipW.copy(Hh.tip));
      Hh.tT = Math.atan2(AS.tipW.y - AS.hit.y, Math.max(1, Math.hypot(AS.hit.x - AS.tipW.x, AS.hit.z - AS.tipW.z)));
    }
  } else { Hh.pT = 0; Hh.tT = 0; }
  Hh.pa += (Hh.pT - Hh.pa) * (1 - Math.pow(.004, dt));
  // swung wide, the beam runs along the mantel: cap the tilt so it clears the shelf's far edge (and the dot lands farther out on the floor)
  let tCap = Hh.thMax;
  if (wAs > 0 && !AS.onObj) {                       // aimed at the hearth or shelf itself, it may land on them
    const sb = AS.sb || (AS.sb = new THREE.Box3().setFromObject(Hh.shelf)), ux = -Math.sin(Hh.pa), uz = -Math.cos(Hh.pa);
    Hh.P.laser.m.localToWorld(AS.tipW.copy(Hh.tip));
    const r = Math.hypot(AS.tipW.x - ASSYM_AT.x, AS.tipW.z - ASSYM_AT.z), px = ASSYM_AT.x + ux * r, pz = ASSYM_AT.z + uz * r;   // the tip, at this pan
    const ex = Math.max(0, Math.min(ux > 1e-6 ? (sb.max.x - px) / ux : ux < -1e-6 ? (sb.min.x - px) / ux : 1e9, uz > 1e-6 ? (sb.max.z - pz) / uz : uz < -1e-6 ? (sb.min.z - pz) / uz : 1e9));
    tCap = Math.min(tCap, Math.atan2(AS.tipW.y - sb.max.y - 1, ex));
  }
  Hh.ta += (Math.min(tCap, Hh.tT) - Hh.ta) * (1 - Math.pow(.004, dt)); Hh.ta = Math.min(Hh.ta, tCap);
  // up close: still solid and the base stays put, as on the mantel. The head moves the way it does teasing the cat: it darts to a
  // new spot (pan ±25°, a third to two thirds of the tilt), holds, sometimes wiggles the dot in a little circle, then darts again.
  // It fades in and out over the section's ends, so it hands over smoothly to the cat scene and the exploded view.
  const wIn = win(s, 11.4, 11.65, 12.32, 12.52);
  if (wIn > 0) {
    const h = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    const per = .85, k = Math.floor(T / per), f = T / per - k, d = ease(Math.min(1, f / .2));
    const pk = (i) => .44 * (2 * h(i) - 1), tk = (i) => Hh.thMax * (.3 + .35 * h(i + 101));
    let pn = pk(k - 1) + (pk(k) - pk(k - 1)) * d, tl = tk(k - 1) + (tk(k) - tk(k - 1)) * d;
    if (h(k + 57) > .5) { const wg = smooth(seg(f, .3, .45)) * (1 - smooth(seg(f, .85, 1))); pn += .05 * wg * Math.cos(T * 19); tl += .04 * wg * Math.sin(T * 19); }
    Hh.pan.rotation.y = Hh.pa + wIn * pn;
    Hh.setTilt(Math.min(Hh.thMax, Hh.ta + wIn * tl));
  } else { Hh.pan.rotation.y = Hh.pa; Hh.setTilt(Hh.ta); }   // in use (and everywhere else): the cursor's aim
  // exploded view: every part slides out along its own offset (the shade turns back to zero first)
  for (const k in Hh.P) Hh.P[k].ex.position.copy(Hh.P[k].off).multiplyScalar(e);
  Hh.dev.position.y = ASSYM_AT.y + 8.8 + 4 * e;      // lift it off the hearth so the base has room
  Hh.g.updateMatrixWorld(true);
  const dc = Hh.dev.getWorldPosition(R3.c);

  const wBeam = Math.max(wAs, wIn);                 // the laser stays on through the up-close section too
  const wLit = Math.max(wAs, .35 * wIn);           // dimmer up close, so it doesn't pull the eye off the lamp
  if (wBeam > 0) {
    // the beam leaves along the tilted laser's own axis
    Hh.P.laser.m.localToWorld(AS.tipW.copy(Hh.tip));
    AS.d.set(0, 0, 1).transformDirection(Hh.P.laser.m.matrixWorld);
    if (AS.d.y > -.02) AS.d.y = -.02;
    let L = AS.tipW.y / -AS.d.y;
    // the beam stops at the first thing it meets: the hearth, the couch or the figure on it
    AS.tg.length = 0; AS.tg.push(...AS.solid); if (rigs.couch.g.visible) AS.tg.push(rigs.couch.g);
    AS.bray.set(AS.tipW, AS.d); AS.bray.far = L; AS.hits.length = 0;
    if (AS.bray.intersectObjects(AS.tg, true, AS.hits).length) L = AS.hits[0].distance;
    // the skinned figure has no mesh worth casting at: spheres strung along its bones stand in for it
    if (figure.visible) for (const [a, b, r] of AS.FIG) {
      const pa = bones[a].getWorldPosition(CN.a), pb = bones[b].getWorldPosition(CN.k), n = Math.ceil(pa.distanceTo(pb) / r);
      for (let i = 0; i <= n; i++) { AS.sph.center.lerpVectors(pa, pb, i / n); AS.sph.radius = r; if (AS.bray.ray.intersectSphere(AS.sph, CN.p)) L = Math.min(L, CN.p.distanceTo(AS.tipW)); }
    }
    const dot = rigs.dot.p.copy(AS.tipW).addScaledVector(AS.d, L);
    if (Array.isArray(window.__dot)) dot.set(window.__dot[0], window.__dot[2] || 0, window.__dot[1]);   // debug hook for path checks
    Hh.beam.visible = true; Hh.beam.material.opacity = .85 * wLit;
    Hh.beam.position.copy(AS.tipW).addScaledVector(AS.d, L / 2); Hh.beam.scale.set(1, L, 1); Hh.beam.quaternion.setFromUnitVectors(UP, AS.d);
    const sp = dot.clone().project(camera);
    ui.laser.style.transform = `translate(${(sp.x * .5 + .5) * innerWidth}px, ${(-sp.y * .5 + .5) * innerHeight}px)`; ui.laser.style.opacity = wLit;
    if (wAs > 0) {
    // the cat runs at the dot round whatever is in the way, slows to pounce distance, then waits. A dot on or behind something it
    // can't get to (the couch, the hearth) moves its goal to the nearest floor it can stand on, and it runs right up to that.
    // the couch seat is somewhere the cat can go: a dot on the cushions (or on the figure lounging there) sends it running to the
    // front edge and jumping up; on the seat it chases along the cushions, and when the dot leaves it jumps back down
    const Co = rigs.couch, P = Ct.g.position;
    const s0 = Co.g.localToWorld(CJ.a.set(-100, 52, -20)), s1 = Co.g.localToWorld(CJ.b.set(100, 52, 38));
    const sx0 = Math.min(s0.x, s1.x), sx1 = Math.max(s0.x, s1.x), sz0 = Math.min(s0.z, s1.z), sz1 = Math.max(s0.z, s1.z);
    const fx = bones.hips.getWorldPosition(CJ.f).x;                      // the figure's lap: keep off it
    const onSeat = Co.g.visible && dot.y > 30 && dot.x > sx0 - 6 && dot.x < sx1 + 6 && dot.z > sz0 - 6 && dot.z < sz1 + 6;
    const seatPt = (x, z, out) => {                                      // nearest spot on the cushions that isn't the lap
      x = Math.max(sx0 + 10, Math.min(sx1 - 10, x)); z = Math.max(sz0 + 8, Math.min(sz1 - 8, z));
      if (Math.abs(x - fx) < CJ.lap) x = fx + (x < fx ? -CJ.lap : CJ.lap);
      if (x < sx0 + 10 || x > sx1 - 10) x = fx + (x < fx ? CJ.lap : -CJ.lap);
      return out.set(x, 52, z);
    };
    let dd = Math.hypot(dot.x - P.x, dot.z - P.z), off = false, where = '';
    if (Ct.jmp) {
      // mid-jump: a ballistic-looking arc from take-off to landing, legs tucked
      const J = Ct.jmp; J.t = Math.min(1, J.t + dt / CJ.dur);
      P.lerpVectors(J.a, J.b, J.t); P.y += CJ.arc * Math.sin(Math.PI * J.t);
      Ct.h = Math.atan2(J.b.x - J.a.x, J.b.z - J.a.z); Ct.v = J.a.distanceTo(J.b) / CJ.dur;
      if (J.t >= 1) { Ct.up = J.up; P.y = J.up ? 52 : 0; Ct.jmp = null; Ct.v *= .3; }
      where = J.up ? ' · jumping up' : ' · jumping down';
    } else if (Ct.up) {
      if (!onSeat) {                                                     // the dot's gone: down to the floor in front
        catObstacles(); const to = catFree(P.x, sz1 + 34, CN.PAD, new THREE.Vector3());
        Ct.jmp = { t: 0, a: P.clone(), b: to, up: false };
      } else {
        const g = seatPt(dot.x, dot.z, CJ.g); dd = Math.hypot(g.x - P.x, g.z - P.z);
        const want = dd > 14 ? Math.min(160, dd * 3) : 0;
        if (dd > 14) { const h = Math.atan2(g.x - P.x, g.z - P.z), dh = Math.atan2(Math.sin(h - Ct.h), Math.cos(h - Ct.h)); Ct.h += dh * (1 - Math.pow(.0005, dt)); }
        Ct.v += (want - Ct.v) * (1 - Math.pow(.01, dt));
        const q = seatPt(P.x + Math.sin(Ct.h) * Ct.v * dt, P.z + Math.cos(Ct.h) * Ct.v * dt, CJ.c); P.set(q.x, 52, q.z);
        where = ' · on the couch';
      }
    } else {
      // on the floor: run round whatever is in the way, slow to pounce distance, then wait. A dot on or behind something it can't
      // get to (the hearth) moves its goal to the nearest floor it can stand on, and it runs right up to that.
      catObstacles(); P.y = 0;
      if (catClr(P.x, P.z) < 0) catFree(P.x, P.z, .5, P);                // never start inside anything (or stay there if it moved in)
      const gx = onSeat ? Math.max(sx0 + 15, Math.min(sx1 - 15, dot.x)) : dot.x, gz = onSeat ? sz1 + 30 : dot.z;   // seat: go to its front edge
      const gl = catFree(gx, gz, CN.PAD, CN.g); off = !onSeat && catClr(dot.x, dot.z) < 0;
      catPlan(P.x, P.z, gl.x, gl.z);
      const stop = onSeat ? 8 : off || !CN.reach ? 6 : 18;
      let want = CN.len > stop ? Math.min(240, CN.len * 3) : 0;
      if (CN.len > stop) {
        const h = Math.atan2(CN.wx - P.x, CN.wz - P.z), dh = Math.atan2(Math.sin(h - Ct.h), Math.cos(h - Ct.h));
        Ct.h += dh * (1 - Math.pow(.0005, dt));
        want *= Math.max(.35, Math.cos(dh));                             // ease off through a sharp turn rather than skid wide
      }
      Ct.v += (want - Ct.v) * (1 - Math.pow(.01, dt));
      // move one axis at a time and drop a step that would touch something: it slides along an edge instead of through it
      const sx = Math.sin(Ct.h) * Ct.v * dt, sz = Math.cos(Ct.h) * Ct.v * dt;
      if (catClr(P.x + sx, P.z) >= 0) P.x += sx;
      if (catClr(P.x, P.z + sz) >= 0) P.z += sz;
      // at the seat's front edge and close enough to spring: jump up onto the nearest free cushion
      if (onSeat && CN.len <= stop + 4 && P.z - sz1 < CJ.reach && P.x > sx0 - 20 && P.x < sx1 + 20)
        Ct.jmp = { t: 0, a: P.clone(), b: seatPt(P.x, sz1 - 14, new THREE.Vector3()), up: true };
      if (off || !CN.reach) where = ' · as close as it can get';
    }
    Ct.g.rotation.y = Ct.h; Ct.gait += Ct.v * dt * .12;
    Ct.legs.forEach((l, i) => { l.rotation.x = Ct.jmp ? (i > 1 ? -.9 : .9) : Math.sin(Ct.gait + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(.7, Ct.v / 120); });
    Ct.body.position.y = Math.abs(Math.sin(Ct.gait)) * Math.min(4, Ct.v / 50);
    Ct.head.rotation.x = .25; Ct.tail.rotation.z = Math.sin(T * (Ct.v > 20 ? 9 : 4)) * .25;
    ui.asRead.textContent = 'pan ' + (Hh.pa / RD).toFixed(0) + '°' + (Math.abs(Hh.pT) > AS.PAN - .01 ? ' (at its stop)' : '') + ' · tilt ' + (Hh.ta / RD).toFixed(0) + '°' + (Hh.tT > tCap + .01 ? (tCap < Hh.thMax ? ' (clearing the shelf)' : ' (at its limit)') : '') +
      ' · dot ' + Math.round(Math.hypot(dot.x - ASSYM_AT.x, dot.z - ASSYM_AT.z)) + ' cm out' + (dot.y > 1 ? ', off the floor' : '') +
      ' · cat ' + Math.round(dd) + ' cm ' + (where === ' · as close as it can get' ? 'off' : 'behind') + where;
    }
  }

  // balloons on the parts while it is apart
  const show = clamp01(e * 3) * (sX > 11.6 && sX < 12.75 ? 1 : 0);
  ui.callouts2.style.opacity = show;
  if (show > .01) {
    const W = innerWidth, Hs = innerHeight, ctr = dc.clone().add(R3.k.set(0, 2, 0)).project(camera), wp = new THREE.Vector3();
    for (const b of ui.balloons2) {
      const p = Hh.P[b.k]; p.m.localToWorld(wp.copy(p.c)); wp.project(camera);
      const x = (wp.x * .5 + .5) * W, y = (-wp.y * .5 + .5) * Hs;
      let ux = wp.x - ctr.x, uy = -(wp.y - ctr.y); const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
      const bx = x + ux * 46, by = y + uy * 46;
      b.l.setAttribute('x1', x); b.l.setAttribute('y1', y); b.l.setAttribute('x2', bx); b.l.setAttribute('y2', by);
      b.d.setAttribute('cx', x); b.d.setAttribute('cy', y); b.c.setAttribute('cx', bx); b.c.setAttribute('cy', by); b.t.setAttribute('x', bx); b.t.setAttribute('y', by);
    }
  }
}
