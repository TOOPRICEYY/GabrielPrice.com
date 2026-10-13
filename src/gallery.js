// Project gallery after the last scroll section, and the full-screen project page each card opens.
// Inlined by build.sh at /*GALLERY*/ (a module script after main's). Meshes come from gallery_data.js (pack_gallery.py).
// The project page has its own canvas and renderer; its inner scroll drives the model the way the main page's scroll drives the figure:
// hero turntable -> exploded with balloons -> parts come together one by one -> section cut -> specs and photos.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------- projects ----------
// model: key in GAL_MAN. names: Fusion body name prefix -> part name (first match wins). explode: name prefix -> [x, y, z] cm, else radial.
// ph: built-in placeholder visual for projects with no model yet. soon: blurred card, does not open.
const PROJECTS = [
  { id: 'sidetable', title: 'Slide Table', kind: 'Furniture', model: 'sidetable',
    blurb: 'Pine plates doubled into each side, a top board under a marble slab, and a latched box shelf between them.',
    names: [['Component10', 'Marble top'], ['Component9', 'Top board'], ['Component7', 'Top rail'], ['Component8', 'Top rail'], ['Component17', 'Drawer slide'],
            ['Shelf:1 Body1', 'Shelf floor'], ['Shelf:1 Body2', 'Shelf front'], ['Shelf:1 Body3', 'Shelf back'],
            ['Component13', 'Side plate, outer'], ['Component15', 'Side plate, outer'], ['Component14', 'Side plate, inner'], ['Component12', 'Side plate, inner'],
            ['Latch v5:1+Component1', 'Latch'], ['Latch v5:1+Component2', 'Latch pin']],
    explode: [['Component10', [0, 34, 0]], ['Component9', [0, 22, 0]], ['Component7', [0, 12, -16]], ['Component8', [0, 12, 16]],
              ['Component17(Mirror)', [0, 8, -10]], ['Component17', [0, 8, 10]], ['Component13', [0, 0, 30]], ['Component14', [0, 0, 16]],
              ['Component15', [0, 0, -30]], ['Component12', [0, 0, -16]], ['Shelf:1 Body1', [0, -10, 0]], ['Shelf:1 Body2', [-22, 0, 0]],
              ['Shelf:1 Body3', [20, 0, 0]], ['Latch v5:1+Component1', [-14, 26, 0]], ['Latch v5:1+Component2', [-20, 30, 0]]],
    mat: (k, m) => m.startsWith('Pine') ? 'pine' : m.startsWith('Marble') ? 'marble' : 'steel',
    // the top (board, slab, its rails and the latch) runs sideways on the two drawer slides (Component17 + mirror, along Fusion x);
    // the latch pin hangs outside the -x wall, so it can only open towards +x. The slides' middle members go half as far.
    slide: { parts: ['Component9', 'Component10', 'Component7', 'Component8', 'Latch v5:1+Component1'], by: [22, 0, 0], half: ['Component17'] },
    props: sideTableProps, anim: () => sideTableProps.anim?.(),
    text: {
      open: ['Slide the top.', 'It runs sideways on two drawer slides to open the box.'],
      hero: ['Slide Table.', 'A bedside table cut from flat pine, with a marble top.'],
      explode: ['Fifteen parts.', ''],
      build: ['Back together.', ''],
      specs: ['Slide Table', 'Pine plates, a marble slab and two drawer slides.'] } },
  { id: 'holdfast', title: 'Holdfast', kind: 'Software', ph: 'holdfast',
    blurb: 'A Screen Time controller for iPhone, Mac and Windows. Changing a rule, or buying more time, means typing a passage first.',
    chapters: [{ key: 'hero', cam: [24, 8, 4.0], spin: .5 }, { key: 'try', cam: [0, 4, 3.6] }, { key: 'passage', cam: [-26, 6, 3.6], side: 'right' }, { key: 'specs', cam: [-34, 10, 4.0], spin: .5 }],
    text: {
      hero: ['Holdfast.', 'Screen Time control where changing a rule means typing a passage first.'],
      try: ['Try it.', 'The real interface, running on demo data.'],
      passage: ['More time costs words.', 'Each extra hour doubles the passage.'],
      specs: ['Holdfast', 'iPhone, Mac and Windows.'] },
    specs: `<dl class="spec"><dt>iPhone</dt><dd>FamilyControls, ManagedSettings, DeviceActivity</dd><dt>Mac</dt><dd>Network Extension content filter</dd><dt>Windows</dt><dd>Filtering Platform service (experimental)</dd><dt>Interface</dt><dd>React + TypeScript, one bundle for all three</dd></dl>
      <div class="gx-hf"><img src="holdfast/icon.webp" alt="Holdfast app icon: a blue path escaping a black labyrinth"><img src="holdfast/phone.webp" alt="Holdfast dashboard on a phone"></div>` },
  { id: 'mittenmade', title: 'MittenMade', kind: 'Woodcraft shop', ph: 'mittenmade',
    blurb: 'Michigan, carved in wood: topographic state pieces, ornaments and custom family signs, sold at mittenmade.shop.',
    chapters: [{ key: 'hero', cam: [-18, 10, 3.0], spin: .6 }, { key: 'relief', cam: [62, 4, 2.7], side: 'right' }, { key: 'products', cam: [-40, 14, 3.2] }, { key: 'specs', cam: [20, 10, 3.0], spin: .6 }],
    text: {
      hero: ['MittenMade.', 'My shop: Michigan, carved in wood.'],
      relief: ['Carved from the map.', ''],
      products: ['What I make.', ''],
      specs: ['MittenMade', ''] },
    products: `<div class="gx-gal"><figure><img loading="lazy" src="mittenmade/oak.webp" alt="A freestanding carved oak Michigan, lit pink and red"><figcaption><b>Oak</b>Freestanding state</figcaption></figure>
      <figure><img loading="lazy" src="mittenmade/ornament.webp" alt="A carved Michigan ornament hanging in a pine tree with a red ribbon"><figcaption><b>Ornament</b>For the tree</figcaption></figure>
      <figure><img loading="lazy" src="mittenmade/sign.webp" alt="An oak family sign with a carved Michigan beside the name The Richards"><figcaption><b>Custom</b>Family sign</figcaption></figure></div>`,
    specs: `<dl class="spec"><dt>Shop</dt><dd><a href="https://mittenmade.shop" target="_blank" rel="noopener">mittenmade.shop</a></dd><dt>Etsy</dt><dd><a href="https://www.etsy.com/shop/MittenMadeWoodCraft" target="_blank" rel="noopener">MittenMadeWoodCraft</a></dd><dt>Instagram</dt><dd><a href="https://www.instagram.com/mittenmadegr" target="_blank" rel="noopener">@mittenmadegr</a></dd></dl>
      <div class="gx-hf"><img src="mittenmade/face.webp" alt="A carved Michigan standing outdoors in low sun"></div>` },
  { id: 'gauge', title: 'Tensile Tester', kind: '3D printing', model: 'gauge',
    blurb: 'A three-part printed gauge with a dogbone keyed into its post.',
    names: [['Body1', 'Base and post'], ['Body2', 'Cap and sleeve'], ['Vertical Dogbone', 'Dogbone']],
    explode: [['Body2', [0, 10, 0]], ['Body1', [0, -2, 0]], ['Vertical Dogbone', [-10, 4, 0]]],
    mat: (k) => k.includes('Dogbone') ? 'accent' : 'print',
    text: {
      hero: ['Tensile Tester.', 'A small printed gauge in three parts.'],
      explode: ['Three parts.', ''],
      build: ['Back together.', ''],
      cut: ['Cut through.', ''],
      specs: ['Tensile Tester', 'Base, cap and dogbone, all printed.'] } },
  { id: 'desk', title: 'Pedestal Desk', kind: 'Furniture', ph: 'desk',
    blurb: 'A height-adjustable desk from construction lumber: a post on cross feet, and a top on a sleeve that slides along it.',
    chapters: [{ key: 'hero', cam: [32, 14, 3.0], spin: .6 }, { key: 'open', cam: [78, 8, 2.9], side: 'right' }, { key: 'specs', cam: [-28, 16, 3.1], spin: .6 }],
    slide: { parts: ['Sleeve', 'Collar', 'Top', 'Bolt'], by: [0, 18, 0] },   // the top and its sleeve ride up the post in the 'open' chapter
    text: {
      hero: ['Pedestal Desk.', 'A height-adjustable desk from 2×4s, for working outside.'],
      open: ['Raise it.', 'The top slides up the post to standing height.'],
      specs: ['Pedestal Desk', ''] },
    specs: `<dl class="spec"><dt>Built</dt><dd>July 2026</dd><dt>Stock</dt><dd>Pine 2×4s, a 4×4 post, a pine top</dd><dt>Adjust</dt><dd>Sleeve slides on the post, bolt holds the height</dd></dl>
      <div class="gx-hf"><img src="photos/pedestal_desk.webp" alt="The pedestal desk in a yard with a laptop, a drill and printed parts on its top"></div>` },
  { id: 'hexacopter', title: 'Heavy Lift Hexacopter', kind: 'Drone', ph: 'hex',
    blurb: 'A six-rotor ArduPilot drone that lifts an 8 kg payload.',
    chapters: [{ key: 'hero', cam: [30, 20, 3.3], spin: .6 }, { key: 'flight', cam: [-24, 8, 3.1], side: 'right' }, { key: 'liftoff', cam: [0, 78, 3.4] }, { key: 'specs', cam: [-40, 18, 3.4], spin: .6 }],   // props aren't in the radius, so these sit further out
    props: hexProps, anim: () => hexProps.anim?.(),
    text: {
      hero: ['Heavy Lift Hexacopter.', 'Six rotors on ArduPilot, lifting 8 kg.'],
      flight: ['Off the ground.', ''],
      liftoff: ['From its camera.', 'Takeoff to the rooftops, 4× speed.'],
      specs: ['Heavy Lift Hexacopter', ''] },
    flight: `<figure class="gx-vid"><video src="photos/drone_flight.mp4" poster="photos/drone_flight.webp" muted loop playsinline preload="metadata" aria-label="The hexacopter hovering over a backyard shed"></video></figure>`,
    liftoff: `<figure class="gx-vid"><video src="photos/drone_liftoff.mp4" poster="photos/drone_liftoff.webp" muted loop playsinline preload="metadata" aria-label="Looking straight down from the drone as it lifts off snowy ground and climbs over the neighborhood roofs"></video></figure>`,
    specs: `<dl class="spec"><dt>Autopilot</dt><dd>ArduPilot</dd><dt>Payload</dt><dd>8 kg</dd><dt>Frame</dt><dd>Six aluminum arms, a clear dome over the electronics</dd><dt>Props</dt><dd>Two-blade carbon fiber</dd></dl>
      <div class="gx-gal two"><figure><img loading="lazy" src="photos/drone_build.webp" alt="The heavy lift hexacopter on a wood floor with its transmitter"><figcaption><b>Built</b></figcaption></figure>
      <figure><img loading="lazy" src="photos/drone_thrust.webp" alt="Thrust test rig: an Arduino drives an ESC, the motor and carbon prop sit on a kitchen scale, a multimeter reads the current from a Turnigy LiPo"><figcaption><b>Thrust test</b>Motor on a scale</figcaption></figure></div>` },
  { id: 'flyingbike', title: 'Flying Bike', kind: 'In progress', model: 'flyingbike', soon: true,
    blurb: 'Coming soon.', mat: () => 'neon' },
];

// ---------- markup ----------
const css = `
section.gallery { display: block; min-height: 100vh; max-width: 1280px; margin-inline: auto; padding-block: 18vh 20vh; }
.gal-wrap { pointer-events: auto; background: color-mix(in srgb, var(--vellum) 90%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid var(--rule); padding: 26px; display: flex; flex-direction: column; gap: 14px; }
.gal-wrap > p { color: var(--graphite-2); }
.gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; margin-top: 8px; }
.gal-item { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--rule); background: var(--vellum); transition: transform .25s, border-color .25s, box-shadow .25s; }
.gal-item:hover, .gal-item:focus-visible { transform: translateY(-3px); border-color: var(--cobalt); box-shadow: 0 10px 30px -14px var(--cobalt); }
.gal-item:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 2px; }
.gal-thumb { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-bottom: 1px solid var(--rule);
  background: radial-gradient(ellipse 70% 60% at 50% 60%, color-mix(in srgb, var(--sun) 22%, transparent), transparent 70%), linear-gradient(180deg, var(--vellum-2), var(--vellum)); }
.gal-thumb::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px); background-size: 24px 24px; opacity: .6; }
.gal-thumb img { position: relative; width: 100%; height: 100%; object-fit: contain; display: block; transition: transform .5s; }
.gal-item:hover .gal-thumb img { transform: scale(1.05) rotate(-1deg); }
.gal-meta { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; }
.gal-meta h3 { font-family: var(--f-display); font-size: 22px; line-height: 1.05; font-weight: 600; margin: 0; letter-spacing: -.01em; }
.gal-meta p { font-size: 13px; color: var(--graphite-2); }
.gal-tag { font-family: var(--f-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--cobalt); }
.gal-item.soon { cursor: default; }
.gal-item.soon:hover { transform: none; border-color: var(--rule); box-shadow: none; }
.gal-item.soon .gal-thumb img { filter: blur(10px) saturate(1.4); transform: scale(1.12); }
.gal-item.soon h3 { filter: blur(5px); user-select: none; }
.gal-soon { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--f-mono); font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: var(--graphite); }
.gal-soon span { background: var(--sheet); border: 1px solid var(--graphite); padding: 6px 12px; }
#gxbg { position: fixed; inset: 0; z-index: 19; background: color-mix(in srgb, var(--vellum) 55%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); opacity: 0; transition: opacity .35s; }
#gx { position: fixed; z-index: 20; inset: max(12px, 3vh) max(12px, 3vw); background: var(--vellum); border: 1px solid var(--graphite); box-shadow: 0 30px 80px -30px rgba(23, 21, 31, .5); overflow: hidden;
  opacity: 0; transform: translateY(24px) scale(.985); transition: opacity .35s, transform .35s; }
#gx.on, #gxbg.on { opacity: 1; }
#gx.on { transform: none; }
#gx[hidden], #gxbg[hidden] { display: none; }
#gx::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 45% 50% at 50% 48%, color-mix(in srgb, var(--sun) 20%, transparent), transparent 70%),
    linear-gradient(var(--rule) 1px, transparent 1px) 0 0 / 80px 80px, linear-gradient(90deg, var(--rule) 1px, transparent 1px) 0 0 / 80px 80px; }
#gxc { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#gxsvg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
#gxsvg line { stroke: var(--cobalt); stroke-width: 1; }
#gxsvg circle { fill: var(--vellum); stroke: var(--cobalt); stroke-width: 1.2; }
#gxsvg text { fill: var(--cobalt); font-family: var(--f-mono); font-size: 11px; text-anchor: middle; dominant-baseline: central; }
#gxsvg g.hl circle:not(.dot) { fill: var(--cobalt); } #gxsvg g.hl text { fill: var(--vellum); }
.gx-scroll { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; cursor: grab; }
.gx-scroll.dragging { cursor: grabbing; }
.gx-ch { min-height: 100%; display: flex; align-items: center; padding: 76px 28px 40px; box-sizing: border-box; }
.gx-ch.right { justify-content: flex-end; }
.gx-ch .card { cursor: auto; }
.gx-top { position: absolute; z-index: 2; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 14px; padding: 14px 16px 14px 28px; pointer-events: none;
  background: linear-gradient(180deg, var(--vellum), transparent); }
.gx-top .eyebrow { flex: 1; min-width: 0; }
.gx-top .eyebrow b { font-family: var(--f-display); font-size: 18px; letter-spacing: -.01em; text-transform: none; color: var(--graphite); font-weight: 600; }
.gx-top button { pointer-events: auto; font-family: var(--f-mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--graphite); background: var(--sheet); border: 1px solid var(--graphite); padding: 6px 10px; cursor: pointer; }
.gx-top button:hover { background: var(--graphite); color: var(--vellum); }
.gx-sheet { font-family: var(--f-mono); font-size: 11px; letter-spacing: .1em; color: var(--graphite-2); font-variant-numeric: tabular-nums; }
.gx-hint { position: absolute; z-index: 2; left: 28px; bottom: 14px; font-family: var(--f-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--graphite-2); pointer-events: none; }
.gx-ch.wide { flex-direction: column; align-items: stretch; justify-content: center; gap: 14px; }
.gx-ch.wide .card { width: min(760px, 100%); }
.gx-app { height: min(68vh, 760px); border: 1px solid var(--graphite); background: #fff; box-shadow: 0 24px 60px -30px rgba(23, 21, 31, .55); cursor: auto; }
.gx-app iframe { width: 100%; height: 100%; border: 0; display: block; }
.gx-pass { display: flex; flex-direction: column; gap: 8px; }
.gx-ladder { display: flex; flex-wrap: wrap; gap: 6px; font-family: var(--f-mono); font-size: 11px; }
.gx-ladder span { border: 1px solid var(--rule); padding: 2px 7px; color: var(--graphite-2); }
.gx-ladder span.on { border-color: var(--cobalt); color: var(--cobalt); }
.gx-pass-exp { font-size: 12px; color: var(--graphite-2); border-left: 2px solid var(--cobalt); padding-left: 10px; }
.gx-pass-box { font-size: 14px; line-height: 1.55; border: 1px solid var(--rule); background: var(--vellum); padding: 10px 12px; min-height: 8.2em; }
.gx-pass-box .ok { color: #1a9a50; }
.gx-pass-box .bad { color: #e0303a; font-weight: 700; }
.gx-pass-box .miss { color: #e0303a; opacity: .5; text-decoration: line-through; }
.gx-pass-box .caret { display: inline-block; width: 2px; height: 1.1em; vertical-align: -2px; background: var(--cobalt); margin-left: 1px; animation: gxblink 1s steps(1) infinite; }
@keyframes gxblink { 50% { opacity: 0; } }
.gx-pass-res { font-family: var(--f-mono); font-size: 11px; color: var(--graphite-2); min-height: 1.4em; }
.gx-gal { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.gx-gal figure { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.gx-gal img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; border: 1px solid var(--rule); cursor: zoom-in; }
.gx-hf img, .gx-vid video { cursor: zoom-in; }
.gx-gal.two { grid-template-columns: repeat(2, 1fr); }
.gx-vid { margin: 12px 0 0; }
.gx-vid video { width: 100%; aspect-ratio: 1; display: block; object-fit: cover; border: 1px solid var(--rule); background: var(--vellum-2); }
.gx-gal figcaption { font-family: var(--f-mono); font-size: 10px; line-height: 1.35; color: var(--graphite-2); }
.gx-gal figcaption b { display: block; color: var(--cobalt); font-weight: 500; letter-spacing: .08em; }
.gx-hf { display: flex; gap: 10px; align-items: flex-end; }
.gx-hf img { display: block; border: 1px solid var(--rule); height: min(30vh, 260px); width: auto; }
.gx-hf img:first-child { height: 72px; }
.gx-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.gx-photos div { aspect-ratio: 3 / 4; border: 1px dashed var(--rule); display: grid; place-items: center; font-family: var(--f-mono); font-size: 10px; color: var(--graphite-2); text-transform: uppercase; letter-spacing: .1em; }
@media (max-width: 720px) {
  section.gallery { padding-block: 10vh 14vh; }
  .gal-wrap { padding: 18px; }
  .gal-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .gal-meta p { display: none; }
  .gal-meta h3 { font-size: 18px; }
  #gx { inset: 0; border: 0; }
  .gx-ch, .gx-ch.right { justify-content: center; align-items: flex-end; padding: 60px 16px 40px; }
  .gx-top { padding-left: 16px; }
  .gx-hint { display: none; }
  .gx-ch.wide { justify-content: flex-start; }
  .gx-app { height: 66vh; }
}`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));
const grid = document.getElementById('galgrid');
const bg = Object.assign(document.createElement('div'), { id: 'gxbg', hidden: true });
const ov = Object.assign(document.createElement('div'), { id: 'gx', hidden: true });
ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'gx-title');
ov.innerHTML = `<canvas id="gxc" aria-hidden="true"></canvas><svg id="gxsvg" aria-hidden="true"></svg><div class="gx-scroll"></div>
  <div class="gx-top"><div class="eyebrow"><span id="gx-kind"></span> <b id="gx-title"></b></div><span class="gx-sheet" id="gx-sheet"></span><button type="button" id="gx-close">Close ✕</button></div>
  <div class="gx-hint">Scroll to explore · drag to turn</div>`;
document.body.append(bg, ov);
const scroller = ov.querySelector('.gx-scroll'), svg = ov.querySelector('#gxsvg'), canvasEl = ov.querySelector('#gxc');

// ---------- three ----------
let renderer, scene, camera, controls, floor;
const plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6);   // section cut: keeps x <= constant
const tok = (n) => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888');
function initGL() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 6, 4); scene.add(key, new THREE.HemisphereLight(0xffffff, 0x8877aa, .5));
  camera = new THREE.PerspectiveCamera(32, 1, .5, 5000);
  controls = new OrbitControls(camera, scroller);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = true;
  scroller.style.touchAction = 'pan-y';                     // OrbitControls sets 'none'; keep vertical swipes scrolling the page
  controls.addEventListener('start', () => { userCam = true; scroller.classList.add('dragging'); });
  controls.addEventListener('end', () => scroller.classList.remove('dragging'));
  floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ transparent: true, opacity: .14, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
}
let MATS;
function mats() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
  const m = (color, o) => new THREE.MeshStandardMaterial({ color, side: THREE.FrontSide, ...o });
  MATS = { pine: m(0xd8b07a, { roughness: .72, metalness: 0 }), marble: m(0xf3f1ed, { roughness: .22, metalness: 0 }), steel: m(0x9aa1aa, { roughness: .35, metalness: .85 }),
    print: m(dark ? 0x5a5e68 : 0x3a3d45, { roughness: .6, metalness: .05 }), accent: m(tok('--sun'), { roughness: .45, metalness: .1 }),
    cap: new THREE.MeshBasicMaterial({ color: tok('--cobalt'), side: THREE.BackSide, clippingPlanes: [plane] }),
    neon: m(tok('--neon'), { roughness: .3, metalness: .2, emissive: tok('--neon'), emissiveIntensity: .25 }), knit: m(tok('--sun'), { roughness: .9 }) };
  floor.material.color.copy(tok('--cobalt'));
}

// mesh data: positions f32, normals i8x4 (padded), indices u16, all in one base64 blob
let RAW;
function geoOf(e) {
  if (!RAW) {   // a plain loop: Uint8Array.from(atob(…), fn) calls fn per byte and is ~100x slower
    const t = atob(window.GAL_B64), u = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
    RAW = u.buffer;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAW, e.p, e.nv * 3), 3));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(RAW, e.n, e.nv * 4), 4), 3, 0, true));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(RAW, e.i, e.ni), 1));
  g.computeBoundingBox(); return g;
}
const pick = (list, k) => list?.find(([pre]) => k.startsWith(pre))?.[1];

// each project's model: a group of parts, each with a rest position, an explode offset and a build order
const MODELS = {};
function model(P) {
  if (MODELS[P.id]) return MODELS[P.id];
  const grp = new THREE.Group(), parts = [];
  if (P.model) {
    for (const e of window.GAL_MAN[P.model].parts) {
      const g = geoOf(e), mesh = new THREE.Mesh(g, MATS[P.mat(e.k, e.m)]);
      mesh.add(new THREE.Mesh(g, MATS.cap));            // inside faces show flat violet where the section plane opens the part
      parts.push({ mesh, k: e.k, name: pick(P.names, e.k) || e.k, c: g.boundingBox.getCenter(new THREE.Vector3()), lo: g.boundingBox.min.y });
    }
  } else parts.push(...placeholder(P));
  const box = new THREE.Box3(); for (const p of parts) box.expandByObject(p.mesh);
  const C = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), R = size.length() / 2;
  const base = new THREE.Vector3(-C.x, -box.min.y, -C.z);  // stand it on the floor, centred
  for (const p of parts) {
    p.base = base.clone(); p.mesh.position.copy(base); p.mesh.material = Array.isArray(p.mesh.material) ? p.mesh.material.map(m => m.clone()) : p.mesh.material.clone(); grp.add(p.mesh);
    const sl = P.slide?.parts.some(x => p.k.startsWith(x)) ? 1 : P.slide?.half?.some(x => p.k.startsWith(x)) ? .5 : 0; if (sl) p.slide = new THREE.Vector3(...P.slide.by).multiplyScalar(sl);
    const ex = pick(P.explode, p.k);
    p.ex = ex ? new THREE.Vector3(...ex) : p.c.clone().sub(C).multiplyScalar(.8).add(p.c.clone().sub(C).normalize().multiplyScalar(R * .3));
  }
  const bx = new THREE.Box3(); for (const p of parts) { p.mesh.geometry.computeBoundingBox(); bx.union(p.mesh.geometry.boundingBox.clone().translate(base).translate(p.ex)); }
  for (const p of parts) for (const m of [p.mesh.material].flat()) m.clippingPlanes = [plane];
  if (P.props) P.props(parts);                     // dressing (books, a cup) rides on a part as its child, so it slides and explodes with it
  [...parts].sort((a, b) => a.lo - b.lo || a.k.localeCompare(b.k)).forEach((p, i) => p.order = i);
  const groups = [...new Set(parts.map(p => p.name))];                       // balloon numbers: one per distinct part name
  for (const p of parts) p.n = groups.indexOf(p.name) + 1;
  const M = { grp, parts, groups, R, size, H: size.y, cutMax: size.x / 2 + 1, Rx: Math.max(R, bx.getSize(new THREE.Vector3()).length() / 2), Hx: bx.getCenter(new THREE.Vector3()).y * 2, ex: 0 };
  M.ready = P._ready || Promise.resolve();
  MODELS[P.id] = M; return M;
}
// side table dressing, in the table's Fusion coordinates (cm, Y up): the box is x -2.4..13, y 13.9..41.2, z -43.2..-2.2 inside
function sideTableProps(parts) {
  const on = (pre) => parts.find(p => p.k.startsWith(pre)).mesh;
  const floor = on('Shelf:1 Body1'), slab = on('Component10');
  const std = (color, o) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...o }), paper = std(0xf1ead8, { roughness: .9 });
  const box = (w, h, d, m, x, y, z, ry = 0, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.set(0, ry, rz); return b; };
  // a row of books standing on the shelf floor, spines to the front, then a short stack lying flat
  const cols = [0x2b6f77, 0x8c2f39, 0xd9a441, 0x2d3a64, 0xe6dccb, 0x6a4c93, 0x3f7d4e, 0xb5562f, 0x1f2933];
  let z = -42.4; const fy = 13.9;
  cols.forEach((c, i) => {
    const th = 1.6 + (i * 37 % 10) / 6, h = 17 + (i * 53 % 9), d = 12 + (i * 29 % 4);
    const g = new THREE.Group(); g.position.set(-1.6 + d / 2, fy, z + th / 2);
    g.add(box(d, h, th, std(c), 0, h / 2, 0), box(d - .5, h - .5, th - .35, paper, -.2, h / 2 + .05, 0));
    g.add(box(.06, h * .7, th * .6, std(0xf3e6c0, { metalness: .6, roughness: .35 }), -d / 2 - .03, h * .55, 0));   // a gilt band on the spine
    if (i === cols.length - 1) g.rotation.x = -.22;                              // the last one leans
    floor.add(g); z += th + .15;
  });
  [[0x9e3d4f, 13, 2.2], [0x2f5d62, 12, 1.8], [0xcfc2a8, 11.5, 2.6]].reduce((y, [c, w, th]) => {
    const g = new THREE.Group(); g.position.set(5.4, y, -11); g.rotation.y = (y * 7 % 5 - 2) * .05;
    g.add(box(w * .7, th, w, std(c), 0, th / 2, 0), box(w * .7 - .4, th - .3, w - .5, paper, .2, th / 2, 0)); floor.add(g); return y + th;
  }, fy);
  const glasses = new THREE.Group(); glasses.position.set(5.5, fy + 6.6 + .4, -11); glasses.rotation.y = .5;          // reading glasses on the stack
  const rim = std(0x1d1b22, { metalness: .4, roughness: .4 });
  for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.1, .18, 8, 32), rim); r.rotation.x = Math.PI / 2; r.position.x = sx * 2.5; glasses.add(r); }
  glasses.add(box(1.2, .2, .3, rim, 0, 0, 0)); floor.add(glasses);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 5, 32), std(0xefe3cf, { roughness: .95 })); candle.position.set(9.5, fy + 2.5, -4.5); floor.add(candle);   // a candle tin in the corner
  const tin = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, .25, 32), std(0xb8945a, { metalness: .8, roughness: .3 })); tin.position.set(9.5, fy + 5.1, -4.5); floor.add(tin);
  // a cup of tea on the marble, with steam
  const cup = new THREE.Group(); cup.position.set(9, 42.2, -16);
  const china = std(0xfbfaf6, { roughness: .25 });
  const prof = [[0, .5], [3.0, .5], [3.6, 1.2], [4.1, 4], [4.3, 7], [4.0, 7], [3.8, 4.2], [3.2, 1.6], [0, 1.4]].map(([r, y]) => new THREE.Vector2(r, y));
  cup.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 48), china));
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(7, 5.5, .5, 48), china); saucer.position.y = .25; cup.add(saucer);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(1.5, .35, 10, 24, Math.PI * 1.2), china); handle.position.set(4.4, 4.4, 0); handle.rotation.z = -Math.PI * .6; cup.add(handle);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(3.95, 40), std(0x7a3f12, { roughness: .15 })); tea.rotation.x = -Math.PI / 2; tea.position.y = 6.2; cup.add(tea);
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide });
  const steam = [0, 1, 2].map(i => {
    const pts = Array.from({ length: 12 }, (_, j) => new THREE.Vector3(Math.sin(j * .7 + i * 2) * .9, 7 + j * 1.1, Math.cos(j * .5 + i) * .6));
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .22 - i * .04, 6), steamMat); m.rotation.y = i * 2.1; cup.add(m); return m;
  });
  slab.add(cup);
  sideTableProps.anim = () => { const t = clock.elapsedTime; steam.forEach((m, i) => { m.rotation.y = i * 2.1 + t * .4; m.position.y = (t * .6 + i * .4) % 1.2 - .4; }); steamMat.opacity = .2 + Math.sin(t * 1.3) * .06; };
}
const MM_OUTLINE = [[-15.59,25.68],[-15.59,25.62],[-15.3,25.56],[-15.22,25.45],[-14.7,25.24],[-14.44,24.93],[-14.32,24.55],[-13.89,24.24],[-12.45,23.72],[-11.18,23.4],[-8.79,22.36],[-8.27,22.42],[-7.78,22.19],[-6.86,21.96],[-6.77,21.87],[-6.83,21.35],[-5.68,20.89],[-5.59,20.66],[-5.56,20.12],[-5.68,20.06],[-5.71,19.57],[-5.91,19.14],[-5.85,19.02],[-5.56,18.88],[-5.13,18.9],[-5.13,18.79],[-5.53,18.36],[-5.53,18.16],[-5.24,17.75],[-4.9,17.52],[-4.76,17.58],[-4.58,17.95],[-4.03,18.59],[-3.0,20.43],[-2.68,20.66],[-2.51,20.92],[-2.39,20.92],[-2.28,20.69],[-1.93,20.61],[-1.59,20.89],[-1.5,21.15],[-1.35,21.3],[-0.78,21.38],[-0.75,21.21],[-0.98,21.04],[-1.38,20.46],[-1.04,20.2],[-0.89,20.2],[-0.61,20.58],[0.2,21.12],[0.4,21.59],[0.55,21.73],[0.84,21.84],[1.41,21.87],[1.7,21.76],[1.96,21.76],[2.22,21.9],[2.8,21.9],[3.26,22.33],[3.6,22.54],[3.98,22.54],[5.01,22.31],[5.48,22.1],[5.62,21.96],[5.62,20.92],[5.3,20.86],[5.3,20.49],[5.16,20.32],[4.9,20.2],[4.76,19.94],[4.78,19.48],[4.96,19.22],[5.33,18.93],[5.33,18.79],[4.99,18.65],[4.38,18.62],[3.92,18.18],[3.83,18.04],[3.8,16.74],[3.57,16.14],[3.26,15.82],[2.94,15.85],[2.77,16.05],[2.77,16.25],[3.0,16.92],[3.0,17.2],[2.82,17.49],[2.82,17.72],[2.94,17.95],[2.65,17.78],[2.54,17.35],[2.25,17.15],[2.13,16.69],[1.99,16.57],[1.7,16.57],[1.5,16.48],[1.15,16.17],[1.12,15.56],[1.07,15.48],[0.43,15.24],[0.4,15.01],[0.52,14.76],[0.52,14.41],[0.29,13.46],[-0.03,12.71],[-0.63,12.05],[-0.35,11.47],[-0.32,11.12],[-0.69,10.09],[-0.69,9.71],[-0.52,9.16],[0.4,6.95],[0.17,4.01],[0.12,3.98],[0.06,3.54],[-0.37,2.74],[-1.07,1.84],[-1.44,1.01],[-1.79,0.66],[-1.9,0.63],[-1.9,0.55],[-1.59,0.52],[-1.5,0.4],[-0.86,0.35],[5.5,0.23],[7.49,0.12],[7.52,0.03],[9.11,0.03],[9.14,0.12],[11.33,0.14],[11.61,0.43],[11.84,0.86],[12.31,1.21],[12.59,1.59],[12.74,2.56],[12.85,2.88],[13.14,3.17],[13.6,3.31],[13.86,3.52],[13.89,4.09],[14.12,4.44],[14.12,4.73],[14.27,4.87],[14.64,4.93],[14.7,4.76],[14.99,4.58],[15.19,4.67],[15.36,5.45],[15.48,6.74],[15.16,7.38],[14.73,9.54],[14.15,11.44],[13.89,11.9],[13.4,12.16],[13.08,12.22],[12.31,11.82],[11.96,11.76],[11.76,11.53],[11.61,11.47],[11.47,11.01],[11.33,10.84],[11.18,10.46],[10.86,10.32],[10.43,9.77],[9.68,9.94],[9.34,10.23],[9.37,10.78],[9.57,11.47],[9.77,11.64],[10.17,11.7],[10.61,11.96],[10.72,12.1],[10.75,12.54],[10.89,12.8],[11.33,13.05],[11.61,13.4],[11.82,14.55],[11.87,15.45],[11.73,15.99],[11.44,16.34],[11.3,16.4],[11.27,16.63],[11.44,16.95],[11.7,16.97],[11.79,17.09],[11.47,17.72],[11.38,18.07],[11.12,18.44],[10.66,18.53],[10.17,18.85],[9.88,18.88],[9.45,19.28],[9.22,19.34],[8.82,19.31],[8.5,19.83],[8.24,20.06],[7.23,20.2],[6.51,20.78],[6.4,21.79],[6.48,21.96],[6.8,22.19],[7.03,22.19],[7.81,21.84],[8.18,21.96],[8.65,21.96],[9.45,21.84],[9.57,21.93],[9.48,22.19],[9.11,22.45],[9.02,22.77],[8.9,22.88],[8.41,23.05],[8.44,23.26],[8.18,24.12],[7.93,24.5],[7.64,24.61],[7.38,24.5],[7.29,24.38],[7.03,24.35],[6.66,24.55],[6.08,24.47],[5.3,24.64],[5.22,24.78],[5.22,25.3],[5.42,25.71],[5.3,26.08],[4.27,26.08],[3.8,25.76],[3.46,25.68],[0.84,25.62],[0.26,25.22],[-0.32,25.01],[-0.98,24.41],[-1.1,24.41],[-1.47,24.64],[-1.96,24.55],[-2.39,25.01],[-2.59,25.01],[-2.94,24.78],[-3.66,24.81],[-3.89,25.27],[-4.21,25.62],[-4.67,26.43],[-5.16,26.8],[-5.48,26.92],[-6.43,27.06],[-6.77,27.03],[-6.89,26.8],[-7.03,26.8],[-7.06,26.95],[-6.92,27.09],[-6.8,27.09],[-6.8,27.18],[-6.69,27.26],[-6.71,27.32],[-7.29,26.95],[-7.52,26.89],[-7.64,26.74],[-7.78,26.77],[-7.67,27.26],[-7.29,27.75],[-6.22,28.88],[-5.88,29.05],[-5.53,29.37],[-5.01,29.39],[-4.9,29.48],[-4.99,29.77],[-5.48,29.91],[-5.5,30.0],[-6.22,30.0],[-6.25,29.91],[-6.83,29.83],[-7.52,29.57],[-7.95,29.08],[-9.39,28.21],[-9.68,27.75],[-9.88,27.64],[-10.46,27.61],[-10.75,27.23],[-11.04,27.09],[-11.79,26.89],[-13.0,26.89],[-13.92,26.17],[-14.44,25.99],[-15.16,25.97]], MM_W = 31.18;
// built-in visuals for projects with no Fusion model: Holdfast's monitor and phone (textured with its real interface), and a stand-in mitten
// Hexacopter: sized from the build photo (cm, y up): a grey centre plate under a clear dome, six round aluminium arms with
// pancake motors, two skids on four legs and the battery tray below. The carbon props ride on the motors (hexProps) so they can spin.
function hexPlaceholder() {
  const std = (color, o) => new THREE.MeshStandardMaterial({ color, ...o });
  const plate = std(0x6d7078, { roughness: .5, metalness: .3 }), alu = MATS.steel, motorM = std(0xc9ccd2, { roughness: .25, metalness: .9 }),
    blue = std(0x2f45c8, { roughness: .5 }), black = std(0x1c1d22, { roughness: .6 }),
    dome = new THREE.MeshStandardMaterial({ color: 0xe8f0ff, roughness: .05, metalness: 0, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide });
  const part = (k, g, mat, name = k.replace(/ \d$/, '')) => { g.computeBoundingBox(); return { mesh: new THREE.Mesh(g, mat), k, name, c: g.boundingBox.getCenter(new THREE.Vector3()), lo: g.boundingBox.min.y }; };
  const Y = 22, out = [part('Centre plate', new THREE.CylinderGeometry(12, 12, 1.2, 6).translate(0, Y, 0), plate),
    part('Dome', new THREE.SphereGeometry(11.5, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, Y + .6, 0), dome),
    part('Battery', new THREE.BoxGeometry(16, 4.5, 7).translate(0, Y - 4, 0), blue)];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6, cx = Math.cos(a), cz = Math.sin(a), L = 46;
    const arm = new THREE.CylinderGeometry(1.1, 1.1, L - 8, 16); arm.rotateZ(Math.PI / 2); arm.translate((L - 8) / 2 + 8, Y + 1.4, 0); arm.rotateY(-a);
    out.push(part('Arm ' + i, arm, alu));
    out.push(part('Motor ' + i, new THREE.CylinderGeometry(3.3, 3.3, 3.2, 28).translate(cx * L, Y + 4.2, cz * L), motorM));
  }
  // legs splay from under the centre plate out onto the skids
  const tube = (a, b, r) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 12);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); return g.translate(...a.clone().add(b).multiplyScalar(.5).toArray()); };
  const SK = 13;
  for (const [x, z] of [[-7, -1], [7, -1], [-7, 1], [7, 1]]) out.push(part('Leg ' + out.length, tube(new THREE.Vector3(x, Y - .6, z * 7), new THREE.Vector3(x * 1.15, 1.4, z * SK), .7), alu, 'Leg'));
  for (const z of [-SK, SK]) {
    const sk = new THREE.CylinderGeometry(.8, .8, 40, 14); sk.rotateZ(Math.PI / 2); sk.translate(0, 1.2, z); out.push(part('Skid ' + (z > 0 ? 1 : 2), sk, alu));
    for (const x of [-20.5, 20.5]) { const f = new THREE.CylinderGeometry(1.3, 1.3, 3.5, 14); f.rotateZ(Math.PI / 2); f.translate(x, 1.2, z); out.push(part('Foot ' + (x > 0 ? 1 : 2) + z, f, black, 'Foot')); }
  }
  return out;
}
function hexProps(parts) {
  const carbon = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: .3, metalness: .4 });
  const blade = new THREE.BoxGeometry(38, .35, 3.4); const props = [];
  parts.filter(p => p.k.startsWith('Motor')).forEach((p, i) => {
    const pr = new THREE.Group(); pr.position.copy(p.c).add(new THREE.Vector3(0, 2, 0));
    const b = new THREE.Mesh(blade, carbon); b.rotation.x = .12; pr.add(b);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 16), carbon); pr.add(hub);
    pr.rotation.y = i * 1.1; pr.userData.dir = i % 2 ? 1 : -1; p.mesh.add(pr); props.push(pr);
  });
  // idle spin: props turn over slowly on the turntable, the way they read in a photo rather than a blur
  hexProps.anim = () => { const t = clock.elapsedTime; props.forEach((pr, i) => { pr.rotation.y = i * 1.1 + pr.userData.dir * t * 2.2; }); };
}
function placeholder(P) {
  if (P.ph === 'hex') return hexPlaceholder();
  // Pedestal Desk: blocks sized from the photo (cm, y up): crossed 2×4 feet, a 4×4 post, a two-board sleeve with a front collar, and the top
  if (P.ph === 'desk') {
    const box = (k, w, h, d, x, y, z, mat = MATS.pine) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.computeBoundingBox(); return { mesh: new THREE.Mesh(g, mat), k, name: k.replace(/ \d$/, ''), c: g.boundingBox.getCenter(new THREE.Vector3()), lo: g.boundingBox.min.y }; };
    const bolt = new THREE.CylinderGeometry(.6, .6, 20, 16); bolt.rotateZ(Math.PI / 2); bolt.translate(0, 62, 2); bolt.computeBoundingBox();
    return [box('Foot 1', 72, 3.8, 8.9, 0, 1.9, 0), box('Foot 2', 8.9, 3.8, 72, 0, 5.7, 0), box('Post', 8.9, 72, 8.9, 0, 43.6, 0),
      box('Sleeve 1', 3.8, 40, 8.9, -6.35, 78, 0), box('Sleeve 2', 3.8, 40, 8.9, 6.35, 78, 0),
      box('Collar 1', 16.5, 8.9, 3.8, 0, 62, 6.35), box('Collar 2', 16.5, 8.9, 3.8, 0, 80, 6.35),
      box('Top', 80, 2, 55, 0, 99, 0), { mesh: new THREE.Mesh(bolt, MATS.steel), k: 'Bolt', name: 'Bolt', c: bolt.boundingBox.getCenter(new THREE.Vector3()), lo: 61 }];
  }
  if (P.ph === 'holdfast') {
    const side = MATS.print, scrMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), phMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const scr = new THREE.Mesh(new THREE.BoxGeometry(34, 21.25, 1.2), [side, side, side, side, scrMat, side]); scr.geometry.translate(0, 17, 0);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 7, 24), MATS.steel); stand.geometry.translate(0, 3.5, -1.2);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, .8, 48), MATS.steel); foot.geometry.translate(0, .4, -1.2);
    const ph = new THREE.Mesh(new THREE.BoxGeometry(7.4, 16, .8), [side, side, side, side, phMat, side]);
    ph.geometry.translate(0, 8, 0); ph.geometry.rotateX(-.12); ph.geometry.rotateY(-.42); ph.geometry.translate(17, 0, 7);
    // the face material is looked up on load, since model() swaps in clones
    const ld = new THREE.TextureLoader(), tex = (url, mesh) => ld.loadAsync(url).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; const m = mesh.material[4]; m.map = t; m.needsUpdate = true; }).catch(() => {});
    P._ready = Promise.all([tex('holdfast/screen.webp', scr), tex('holdfast/phone.webp', ph)]);
    return [['Monitor', scr], ['Stand', stand], ['Foot', foot], ['Phone', ph]].map(([k, mesh]) => { mesh.geometry.computeBoundingBox(); return { mesh, k, name: k, c: mesh.geometry.boundingBox.getCenter(new THREE.Vector3()), lo: mesh.geometry.boundingBox.min.y }; });
  }
  // MittenMade: the outline traced from the shop's cut-out photo (mittenmade/tex.webp, 30 cm tall), extruded, with that photo on both faces as colour and bump
  const shape = new THREE.Shape(MM_OUTLINE.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: true, bevelThickness: .25, bevelSize: .2, bevelSegments: 2, curveSegments: 4 });
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + MM_W / 2) / MM_W, pos.getY(i) / 30);
  g.translate(0, 0, -1.1);
  const face = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .75, bumpScale: 2.5 }), edge = new THREE.MeshStandardMaterial({ color: 0xb98a56, roughness: .8 });
  const mesh = new THREE.Mesh(g, [face, edge]);
  P._ready = new THREE.TextureLoader().loadAsync('mittenmade/tex.webp').then(t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = mesh.material[0]; m.map = t; m.bumpMap = t; m.needsUpdate = true;
  }).catch(() => {});
  g.computeBoundingBox();
  return [{ mesh, k: 'Michigan', name: 'Michigan', c: g.boundingBox.getCenter(new THREE.Vector3()), lo: 0 }];
}

// ---------- chapters ----------
// cam: [azimuth deg, elevation deg, distance in model radii]; side: which side the card sits on (the model pans the other way)
const CH_MODEL = [{ key: 'hero', cam: [35, 16, 3.4], spin: 1 }, { key: 'open', cam: [-112, 66, 3.3], side: 'right' }, { key: 'explode', cam: [55, 26, 4.6], side: 'right' }, { key: 'build', cam: [20, 22, 3.8] },
  { key: 'cut', cam: [88, 10, 3.3], side: 'right' }, { key: 'specs', cam: [-30, 16, 3.5], spin: 1 }];
const CH_PH = [{ key: 'hero', cam: [25, 14, 4.2], spin: 1 }, { key: 'demo', cam: [0, 6, 3.6], side: 'right' }, { key: 'specs', cam: [-35, 18, 4.4], spin: 1 }];
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

let P, M, CH, chEls = [], open = false, tT = 0, tN = 0, userCam = false, az = 0, spinAz = 0, lastFocus;
const cur = { az: 0, el: 0, d: 0, pan: 0 };
function chapterHTML(P, c, i) {
  const [h, p] = P.text[c.key] || ['', ''];
  let extra = '';
  if (c.key === 'explode') extra = `<ol class="bom">${M.groups.map((g, j) => `<li data-k="${j + 1}"><span class="n">${j + 1}</span><span>${g}</span><span class="q">×${M.parts.filter(q => q.name === g).length}</span></li>`).join('')}</ol>`;
  if (c.key === 'try') return `<div class="gx-ch wide"><div class="card"><div class="eyebrow">${String(i + 1).padStart(2, '0')} <b>${P.title}</b></div><h2>${h}</h2>${p ? `<p>${p}</p>` : ''}</div>
    <div class="gx-app"><iframe title="Holdfast interface in demo mode" data-src="holdfast/index.html?preview=1"></iframe></div></div>`;
  if (c.key === 'passage') extra = `<div class="gx-pass"><div class="gx-ladder">${['1st · 1×', '2nd · 2×', '3rd · 4×', '4th · 8×'].map((x, j) => `<span${j ? '' : ' class="on"'}>${x}</span>`).join('')}</div>
    <div class="gx-pass-exp">${PASSAGE}</div><div class="gx-pass-box" aria-live="off"></div><div class="gx-pass-res"></div></div>`;
  if (typeof P[c.key] === 'string' && c.key !== 'specs') extra = P[c.key];   // per-chapter html (products)
  if (c.key === 'specs' && P.specs) extra = P.specs;
  else if (c.key === 'specs') {
    const s = M.size, doc = P.model ? window.GAL_MAN[P.model].doc : null;
    extra = (doc ? `<dl class="spec"><dt>Model</dt><dd>${doc}, from Fusion</dd><dt>Size</dt><dd>${s.x.toFixed(1)} × ${s.z.toFixed(1)} × ${s.y.toFixed(1)} cm</dd><dt>Parts</dt><dd>${M.parts.length}</dd></dl>` : '')
      ;
  }
  return `<div class="gx-ch${c.side === 'right' ? ' right' : ''}"><div class="card"><div class="eyebrow">${String(i + 1).padStart(2, '0')} <b>${P.title}</b></div><h2>${h}</h2>${p ? `<p>${p}</p>` : ''}${extra}</div></div>`;
}
function openProject(id, from) {
  P = PROJECTS.find(p => p.id === id); if (!P || P.soon) return;
  initGL(); if (!MATS) mats();
  if (M) scene.remove(M.grp);
  linkParts(); if (link) link.reset(linkSet);
  M = model(P); scene.add(M.grp); CH = P.chapters || (P.model ? CH_MODEL.filter(c => P.text[c.key]) : CH_PH);   // a project without text for a chapter skips it
  floor.scale.setScalar(M.R * 1.6);
  ov.querySelector('#gx-kind').textContent = P.kind; ov.querySelector('#gx-title').textContent = P.title;
  scroller.innerHTML = CH.map((c, i) => chapterHTML(P, c, i)).join('');
  scroller.querySelectorAll('.card').forEach(c => c.addEventListener('pointerdown', e => e.stopPropagation()));   // cards select text, they don't orbit
  scroller.querySelectorAll('iframe[data-src]').forEach(f => {
    f.src = f.dataset.src;
    // if the embedded app can't start here, show a still of it instead of an empty frame
    setTimeout(() => { let ok = true; try { ok = !!f.contentDocument?.querySelector('#root')?.childElementCount; } catch {} if (!ok && f.isConnected) f.replaceWith(Object.assign(document.createElement('img'), { src: 'holdfast/screen.webp', alt: 'Holdfast dashboard in demo mode', style: 'width:100%;height:100%;object-fit:cover;object-position:top left' })); }, 8000);
  });
  passLast = '';
  chEls = [...scroller.children]; scroller.scrollTop = 0; tT = tN = 0; userCam = false; spinAz = 0;
  lastFocus = from; bg.hidden = ov.hidden = false; document.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(() => { bg.classList.add('on'); ov.classList.add('on'); });
  resize(); snapCam(); open = true; syncClips(true); clock.getDelta(); requestAnimationFrame(tick);
  ov.querySelector('#gx-close').focus({ preventScroll: true });
}
// chapter clips: only the one in the chapter on screen plays; all of them stop when the page closes
let clipCh = -1;
function syncClips(force) {
  const i = open ? Math.round(tT) : -1; if (i === clipCh && !force) return; clipCh = i;
  chEls.forEach((el, j) => el.querySelectorAll('video').forEach(v => { if (j === i) { v.muted = true; v.play().catch(() => {}); } else v.pause(); }));
}
function closeProject() {
  if (!open) return; open = false; syncClips(true); link?.reset(linkSet);
  bg.classList.remove('on'); ov.classList.remove('on'); document.documentElement.style.overflow = '';
  setTimeout(() => { if (!open) bg.hidden = ov.hidden = true; }, 350);
  lastFocus?.focus({ preventScroll: true });
}
ov.querySelector('#gx-close').addEventListener('click', closeProject);
bg.addEventListener('click', closeProject);
addEventListener('keydown', e => { if (open && e.key === 'Escape') closeProject(); });
scroller.addEventListener('scroll', () => {
  const mid = scroller.scrollTop + scroller.clientHeight / 2, cs = chEls.map(el => el.offsetTop + el.offsetHeight / 2);
  let t = 0; if (mid > cs[0]) { t = cs.length - 1; for (let i = 0; i < cs.length - 1; i++) if (mid <= cs[i + 1]) { t = i + (mid - cs[i]) / (cs[i + 1] - cs[i]); break; } }
  tT = t; syncClips(); if (userCam) { userCam = false; fromCamera(); }   // scrolling eases the camera back onto the path
}, { passive: true });
function resize() { if (!renderer) return; const w = ov.clientWidth, h = ov.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w <= 720 ? 40 : 30; camera.updateProjectionMatrix(); }
addEventListener('resize', () => open && resize());

// camera path: key per chapter, lerped by scroll, and eased so a jump in scroll is not a jump in view
function keyAt(t) {
  const i = Math.min(CH.length - 2, Math.floor(t)), f = sm(t - i), a = CH[i], b = CH[i + 1] || a;
  const L = (u, v) => u + (v - u) * f, side = (c) => c.side === 'right' ? -1 : 1;
  return { az: L(a.cam[0], b.cam[0]), el: L(a.cam[1], b.cam[1]), d: L(a.cam[2], b.cam[2]), pan: L(side(a), side(b)), spin: L(a.spin || 0, b.spin || 0) };
}
function snapCam() { Object.assign(cur, keyAt(0)); }
function fromCamera() {
  const v = camera.position.clone().sub(controls.target);
  cur.az = THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z)) - spinAz; cur.el = THREE.MathUtils.radToDeg(Math.asin(v.y / v.length())); cur.d = v.length() / (M.R + (M.Rx - M.R) * M.ex);
}
function placeCam(k, dt) {
  const narrow = ov.clientWidth <= 720, e = 1 - Math.pow(.02, dt);
  let daz = k.az - cur.az; daz = ((daz + 540) % 360) - 180;
  cur.az += daz * e; cur.el += (k.el - cur.el) * e; cur.d += (k.d * (narrow ? 1.3 : 1) - cur.d) * e; cur.pan += (k.pan - cur.pan) * e;
  spinAz += k.spin * dt * 12;
  spinAz += (Math.round(spinAz / 360) * 360 - spinAz) * (1 - k.spin) * e;   // off the turntable chapters the spin unwinds to the nearest whole turn
  const R = M.R + (M.Rx - M.R) * M.ex, a = THREE.MathUtils.degToRad(cur.az + spinAz), el = THREE.MathUtils.degToRad(cur.el), d = cur.d * R;   // pulls back to fit the exploded parts
  controls.target.set(0, (M.H + (M.Hx - M.H) * M.ex) * .5 - (narrow ? R * .35 : 0), 0);
  camera.position.set(Math.sin(a) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(a) * Math.cos(el) * d).add(controls.target);
  // sideways pan in screen space so the model sits clear of the card (desktop only)
  const w = ov.clientWidth, h = ov.clientHeight;
  if (!narrow) camera.setViewOffset(w, h, -cur.pan * w * .16, 0, w, h); else camera.clearViewOffset();
}

// model state from t: 0..1 explode, 1.25..2.25 parts come back in build order; on the cut chapter c a plane cuts in over c-.6..c+.2 and clears over c+.6..c+1
function applyModel(t) {
  if (!P.model) {                                   // placeholder: a slow bob, and a lean-in on the demo chapter
    M.grp.position.y = Math.sin(clock.elapsedTime / .9) * M.R * .02; plane.constant = 1e6;   // the page clock, so a visit replay paces it
    const io = CH.findIndex(q => q.key === 'open'), op = io < 0 ? 0 : sm((t - io + .7) / .55) * (1 - sm((t - io - .1) / .3));
    for (const p of M.parts) if (p.slide) p.mesh.position.copy(p.base).addScaledVector(p.slide, op);   // e.g. the desk top riding up its post
    if (P.anim) P.anim(M);                          // e.g. the hexacopter's props
    return;
  }
  // explode ramps in over the .6 before the explode chapter; parts go back in order from .75 before the build chapter
  const ie = CH.findIndex(q => q.key === 'explode'), ib = CH.findIndex(q => q.key === 'build'), io = CH.findIndex(q => q.key === 'open');
  const N = M.parts.length, k = sm((t - ib + .75) / 1) * (N + .5);
  // the top slides open on the way into the open chapter and shuts again before the explode starts
  const op = io < 0 ? 0 : sm((t - io + .7) / .55) * (1 - sm((t - io - .1) / .3));
  for (const p of M.parts) {
    const ex = t < ib - .75 ? sm((t - ie + .6) / .6) : 1 - sm(k - p.order);
    p.mesh.position.copy(p.base).addScaledVector(p.ex, ex); p.cur = ex;
    if (p.slide) p.mesh.position.addScaledVector(p.slide, op);
  }
  if (P.anim) P.anim(M);
  const c = CH.findIndex(q => q.key === 'cut'), cut = c < 0 ? 0 : sm((t - c + .6) / .8) * (1 - sm((t - c - .6) / .4));
  plane.constant = cut > .001 ? M.cutMax * (1 - cut) : 1e6;
  M.ex = M.parts.reduce((a, p) => a + p.cur, 0) / M.parts.length;
}
const balloonsOn = (t) => { const ie = CH.findIndex(q => q.key === 'explode'); return ie < 0 ? 0 : Math.max(0, 1 - Math.max(0, Math.abs(t - ie) - .2) * 3); };
const _v = new THREE.Vector3();
// parts list ↔ model (partLinker in main.html): a row stands for every part sharing its name and balloon number
let link, linkSet, bubbles = [];
function linkParts() {
  if (link || !window.__partLinker) return;
  link = window.__partLinker(scroller, () => camera, () => canvasEl.getBoundingClientRect());
  linkSet = link.add({ events: scroller, rowsRoot: () => scroller, sel: '.bom [data-k]',
    roots: (k) => M.parts.filter((p) => String(p.n) === k).map((p) => p.mesh), all: () => M.parts.map((p) => p.mesh),
    active: () => open && !!P.model && balloonsOn(tN) > .3,
    bubbles: () => { const r = canvasEl.getBoundingClientRect(); return bubbles.map((b) => ({ k: b.k, x: b.x + r.left, y: b.y + r.top })); } });
}
function balloons(t) {
  const w = balloonsOn(t);
  bubbles = [];
  if (!P.model || w < .02) { svg.innerHTML = ''; return; }
  const W = ov.clientWidth, H = ov.clientHeight, seen = new Set(), on = link?.lit(linkSet); let out = '';
  for (const p of M.parts) {
    if (seen.has(p.n)) continue; seen.add(p.n);
    p.mesh.updateMatrixWorld(); _v.copy(p.c).applyMatrix4(p.mesh.matrixWorld).project(camera);
    const x = (_v.x * .5 + .5) * W, y = (-_v.y * .5 + .5) * H, ox = x + (x > W / 2 ? 34 : -34), oy = y - 26;
    bubbles.push({ k: p.n, x: ox, y: oy });
    out += `<g opacity="${w.toFixed(2)}"${String(p.n) === on ? ' class="hl"' : ''}><circle class="dot" r="2.5" cx="${x}" cy="${y}" style="fill:var(--cobalt);stroke:none"/><line x1="${x}" y1="${y}" x2="${ox}" y2="${oy}"/><circle r="10" cx="${ox}" cy="${oy}"/><text x="${ox}" y="${oy}">${p.n}</text></g>`;
  }
  svg.innerHTML = out;
}
// Holdfast's passage check, scrubbed by scroll: a typed attempt with a few slips, then the word-level diff the app shows on Check Passage
// (case-insensitive, whitespace collapsed; green = matches, red = wrong or extra, faded red struck through = left out)
const PASSAGE = 'I set this rule when I was thinking clearly about what I want my evenings to be. The feeling of needing to check right now will pass in a few minutes. If I still want the time after typing this, it is mine.';
const TYPED = 'I set this rule when I was thinking clearly about what I want my evenings to be. The feeling of needing to chek right now will pass in a few minutes. If I still want time after typing this this, it is mine.';
function wordDiff(exp, got) {
  const a = exp.split(/\s+/), b = got.split(/\s+/).filter(Boolean), k = (w) => w.toLowerCase();
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = k(a[i]) === k(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && k(a[i]) === k(b[j])) { out.push(['ok', b[j]]); i++; j++; }
    else if (j < b.length && (i >= a.length || L[i][j + 1] >= L[i + 1][j])) out.push(['bad', b[j++]]);
    else out.push(['miss', a[i++]]);
  }
  return out;
}
const DIFF = wordDiff(PASSAGE, TYPED);
let passLast = '';
function passage(u) {
  const box = scroller.querySelector('.gx-pass-box'); if (!box) return;
  const n = Math.round(sm((u + .7) / .7) * TYPED.length), checked = u > .12, key = checked + ':' + n;
  if (key === passLast) return; passLast = key;
  scroller.querySelector('.gx-pass').classList.toggle('checked', checked);
  if (!checked) { box.textContent = TYPED.slice(0, n); box.insertAdjacentHTML('beforeend', '<span class="caret"></span>'); scroller.querySelector('.gx-pass-res').textContent = ''; return; }
  box.innerHTML = DIFF.map(([c, w]) => `<span class="${c}">${w}</span>`).join(' ');
  const slips = DIFF.filter((d, i) => d[0] !== 'ok' && (!i || DIFF[i - 1][0] === 'ok')).length;   // a run of red is one slip
  scroller.querySelector('.gx-pass-res').textContent = `${slips} slips to fix. Fix them and the first hour is yours; the next one costs twice as many words.`;
}
const clock = new THREE.Clock();
function tick() {
  if (!open) return; requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), .05 * (clock.pace || 1));
  tN += (tT - tN) * (1 - Math.pow(.0009, dt));
  applyModel(tN);
  if (!userCam) placeCam(keyAt(tN), dt);
  if (Array.isArray(window.__gcam)) { camera.position.fromArray(window.__gcam[0]); controls.target.fromArray(window.__gcam[1]); camera.lookAt(controls.target); }   // a visit replay: the visitor's view
  try { link?.frame(); } catch (e) { console.warn(e); } controls.update(); renderer.render(scene, camera); balloons(tN);
  const pi = CH.findIndex(q => q.key === 'passage'); if (pi >= 0) passage(tN - pi);
  ov.querySelector('#gx-sheet').textContent = String(Math.round(tN) + 1).padStart(2, '0') + ' / ' + String(CH.length).padStart(2, '0');
}

// ---------- gallery cards, with thumbnails rendered from the models once the gallery is near ----------
grid.innerHTML = PROJECTS.map(p => `<button type="button" class="gal-item${p.soon ? ' soon' : ''}" data-id="${p.id}"${p.soon ? ' aria-disabled="true"' : ''}>
  <div class="gal-thumb"><img alt="" data-thumb="${p.id}">${p.soon ? '<div class="gal-soon"><span>Coming soon</span></div>' : ''}</div>
  <div class="gal-meta"><span class="gal-tag">${p.kind}</span><h3>${p.title}</h3><p>${p.blurb}</p></div></button>`).join('');
grid.addEventListener('click', e => { const b = e.target.closest('.gal-item'); if (b) openProject(b.dataset.id, b); });
async function thumbs() {
  initGL(); if (!MATS) mats();
  await Promise.all(PROJECTS.map(p => model(p).ready));
  if (open) return;                                 // the page's renderer is in use; the cards keep their placeholders
  const W = 560, H = 420; renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = 30; camera.clearViewOffset(); camera.updateProjectionMatrix();
  for (const p of PROJECTS) {
    const m = model(p); scene.add(m.grp); floor.visible = false;
    const k = (p.chapters || (p.model ? CH_MODEL : CH_PH))[0].cam, a = THREE.MathUtils.degToRad(k[0]), el = THREE.MathUtils.degToRad(k[1]), d = k[2] * m.R * .92;
    const tg = new THREE.Vector3(0, m.H * .5, 0);
    camera.position.set(Math.sin(a) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(a) * Math.cos(el) * d).add(tg); camera.lookAt(tg);
    renderer.render(scene, camera);
    grid.querySelector(`[data-thumb="${p.id}"]`).src = renderer.domElement.toDataURL('image/png');
    scene.remove(m.grp); floor.visible = true;
  }
}
new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); thumbs(); } }, { rootMargin: '800px' }).observe(grid);
// state(): the open project, how far down its page (0..1) and its camera, for the visit capture and replay;
// a replay also paces the clock and settles the model on the scroll position after a seek
window.__gallery = { open: openProject, close: closeProject, PROJECTS, scroller, clock, settle: () => { tN = tT; },
  state: () => open && P ? { id: P.id, top: scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight), cam: [camera.position.toArray(), controls.target.toArray()] } : null };
