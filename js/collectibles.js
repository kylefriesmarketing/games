/* THE HOUSE — the little treasures the games leave behind.
 * One builder per collectible, each returning a THREE.Group sized in metres for a
 * shelf or a desktop (they end up ~4-12cm across). Shared toy materials live here
 * too so the whole set stays visually consistent.
 */
import * as THREE from "three";
import { mat, box, canvasTex } from "./util.js";

var goldM = new THREE.MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.35, metalness: 0.7 });
var glassM = new THREE.MeshStandardMaterial({ color: 0xbfe8e0, roughness: 0.12, transparent: true, opacity: 0.3 });
var toyWood = mat(0x8a6242, 0.8), toyWoodD = mat(0x5e4028, 0.85);
/* Dante's gold (NINE CIRCLES --gold #c9a35c) and the instrument gunmetal STILL BREATHING
 * paints its whole panel in — two of the shelf games' own metals, so their treasures
 * are not all the same brass. */
var danteGold = new THREE.MeshStandardMaterial({ color: 0xc9a35c, roughness: 0.38, metalness: 0.68 });
var gunmetal = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.42, metalness: 0.62 });
export function buildBracelet() { // CHOOSE WISELY — Milo and June's, the one on the HUD
  /* ⚠️ This was a string of candy beads. The game's bracelet is a WOVEN friendship
   * bracelet — the bond meter itself, three threads (candle-gold, sky, rose: the game's
   * --gold #ffcf7a, its blue and its rose) plaited round a brown string core, with the
   * knot and the two loose ends a kid leaves when they tie one on a friend. It mends,
   * frays and snaps in the game; here it is whole, because you found an ending. */
  var g = new THREE.Group();
  var core = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.0055, 8, 32), mat(0x8a6a4a, 0.9));
  core.rotation.x = -Math.PI / 2; core.position.y = 0.011; g.add(core);
  // the plait: three thin threads wound round the core at three phases
  [[0xffcf7a, 0], [0x8ad7ff, 2.09], [0xe08aa0, 4.19]].forEach(function (th) {
    var pts = [];
    for (var k = 0; k <= 96; k++) {
      var a = k / 96 * Math.PI * 2, w = a * 9 + th[1];
      pts.push(new THREE.Vector3(Math.cos(a) * (0.05 + Math.cos(w) * 0.0062), 0.011 + Math.sin(w) * 0.0062, Math.sin(a) * (0.05 + Math.cos(w) * 0.0062)));
    }
    var tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.0018, 5, true), mat(th[0], 0.75));
    g.add(tube);
  });
  // the knot, and the two ends trailing off it
  var knot = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 8), mat(0x8a6a4a, 0.9));
  knot.position.set(0.05, 0.011, 0); knot.scale.set(1.2, 1, 1.2); g.add(knot);
  [[0.018, 0.012, 0xffcf7a], [0.02, -0.014, 0x8ad7ff]].forEach(function (e) {
    var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0012, 0.03, 5), mat(e[2], 0.8));
    tail.position.set(0.05 + e[0], 0.006, e[1]); tail.rotation.z = -Math.PI / 2 + 0.25; tail.rotation.y = e[1] > 0 ? 0.5 : -0.5; g.add(tail);
  });
  return g;
}
export function buildLaurel() {
  var g = new THREE.Group();
  // the game's own --gold, not the shoebox's generic brass; and where the wreath opens,
  // the one star the last line of every cantica climbs out to — Beatrice's, pale
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 8, 28, Math.PI * 1.72), danteGold);
  ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI * 0.64; ring.position.y = 0.012; g.add(ring);
  var star = new THREE.Mesh(new THREE.OctahedronGeometry(0.0065, 0),
    new THREE.MeshStandardMaterial({ color: 0x9fb8c8, emissive: 0x9fb8c8, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.3 }));
  star.position.set(Math.cos(Math.PI * 0.5) * 0.052, 0.016, -Math.sin(Math.PI * 0.5) * 0.052); star.scale.set(1, 1.6, 1); g.add(star);
  for (var i = 0; i < 10; i++) {
    var a = Math.PI * 0.64 + (i + 0.5) / 10 * Math.PI * 1.72;
    var lf = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.028, 6), danteGold);
    lf.position.set(Math.cos(a) * 0.052, 0.014, -Math.sin(a) * 0.052);
    lf.rotation.x = Math.PI / 2; lf.rotation.y = -a + Math.PI / 2;
    g.add(lf);
  }
  return g;
}
export function buildCompass() {
  var g = new THREE.Group();
  /* STILL BREATHING is read off a dark instrument panel — its whole UI is #05070a with
   * grip-green vitals (#7cc47a) and one warn-orange (#e6603a). So this is the compass
   * from that panel: gunmetal case, green bezel, black face, the needle in the warn. */
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24), gunmetal);
  body.position.y = 0.01; g.add(body);
  var bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0405, 0.0028, 8, 32), mat(0x7cc47a, 0.5));
  bezel.rotation.x = -Math.PI / 2; bezel.position.y = 0.0205; g.add(bezel);
  var face = new THREE.Mesh(new THREE.CircleGeometry(0.037, 24), new THREE.MeshBasicMaterial({
    map: canvasTex(64, 64, function (gc) {
      gc.fillStyle = "#0e141b"; gc.beginPath(); gc.arc(32, 32, 32, 0, 7); gc.fill();
      gc.strokeStyle = "#2a3a30"; gc.lineWidth = 1; gc.beginPath(); gc.arc(32, 32, 24, 0, 7); gc.stroke();
      gc.fillStyle = "#e7e3d8"; gc.font = "bold 12px 'Courier New', monospace"; gc.textAlign = "center"; gc.textBaseline = "middle";
      gc.fillText("N", 32, 10); gc.fillText("S", 32, 54); gc.fillText("E", 54, 32); gc.fillText("W", 10, 32);
      gc.strokeStyle = "#e6603a"; gc.lineWidth = 3; gc.lineCap = "round";
      gc.beginPath(); gc.moveTo(30, 46); gc.lineTo(37, 16); gc.stroke();
      gc.strokeStyle = "#7cc47a"; gc.beginPath(); gc.moveTo(32, 32); gc.lineTo(30, 46); gc.stroke();   // the south half, in the green
      gc.fillStyle = "#e7e3d8"; gc.beginPath(); gc.arc(32, 32, 2.2, 0, 7); gc.fill();
    }),
  }));
  face.rotation.x = -Math.PI / 2; face.position.y = 0.021; g.add(face);
  var loop = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 6, 12), gunmetal);
  loop.position.set(0.053, 0.012, 0); g.add(loop);
  return g;
}
export function buildBottle() { // the Endurance, safely home
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 16), glassM);
  body.rotation.z = Math.PI / 2; body.position.y = 0.048; g.add(body);
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.018, 0.035, 12), glassM);
  neck.rotation.z = Math.PI / 2; neck.position.set(0.082, 0.048, 0); g.add(neck);
  var cork = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.018, 10), mat(0xb08a56, 0.9));
  cork.rotation.z = Math.PI / 2; cork.position.set(0.108, 0.048, 0); g.add(cork);
  // the Endurance was black-hulled (SOUTH's own --ship #101418); one amber lantern at the
  // stern because the whole game is twenty-seven men and a light that mustn't go out
  var hull = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.016), mat(0x101418, 0.55));
  hull.position.y = 0.038; g.add(hull);
  var strake = new THREE.Mesh(new THREE.BoxGeometry(0.061, 0.002, 0.0165), mat(0xe7e5dc, 0.7));   // the white waterline
  strake.position.y = 0.0325; g.add(strake);
  var lantern = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xe0a84a, emissiveIntensity: 1.4, roughness: 0.4 }));
  lantern.position.set(-0.028, 0.049, 0); g.add(lantern);
  [-0.012, 0.012].forEach(function (x, i) {
    var sail = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.026 - i * 0.008),
      new THREE.MeshStandardMaterial({ color: 0xf2ead6, side: THREE.DoubleSide, roughness: 0.9 }));
    sail.position.set(x, 0.058, 0); g.add(sail);
  });
  [-0.034, 0.034].forEach(function (x) {
    var f = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.018, 0.05), toyWoodD);
    f.position.set(x, 0.009, 0); g.add(f);
  });
  return g;
}
export function buildHorse() { // wooden, wheeled, straight out of the poem
  var g = new THREE.Group();
  var body = box(0.07, 0.038, 0.024, toyWood); body.position.y = 0.062; g.add(body);
  var neck = box(0.016, 0.036, 0.018, toyWood); neck.position.set(0.03, 0.092, 0); neck.rotation.z = -0.35; g.add(neck);
  var head = box(0.03, 0.016, 0.016, toyWood); head.position.set(0.046, 0.108, 0); g.add(head);
  var mane = box(0.024, 0.008, 0.01, toyWoodD); mane.position.set(0.026, 0.108, 0); mane.rotation.z = -0.35; g.add(mane);
  [[-0.026, -0.008], [-0.026, 0.008], [0.026, -0.008], [0.026, 0.008]].forEach(function (p) {
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.036, 8), toyWood);
    leg.position.set(p[0], 0.03, p[1]); g.add(leg);
    var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 12), toyWoodD);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(p[0], 0.011, p[1] + (p[1] < 0 ? -0.008 : 0.008)); g.add(wheel);
  });
  return g;
}
export function buildWatch() { // the White Rabbit's — permanently teatime
  var g = new THREE.Group();
  var cased = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.013, 24), goldM);
  cased.position.y = 0.007; g.add(cased);
  var face = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), new THREE.MeshBasicMaterial({
    map: canvasTex(64, 64, function (gc) {
      gc.fillStyle = "#f6efdd"; gc.beginPath(); gc.arc(32, 32, 32, 0, 7); gc.fill();
      gc.fillStyle = "#4a3a22"; gc.font = "10px Georgia, serif"; gc.textAlign = "center"; gc.textBaseline = "middle";
      gc.fillText("XII", 32, 9); gc.fillText("VI", 32, 55); gc.fillText("III", 55, 32); gc.fillText("IX", 9, 32);
      gc.strokeStyle = "#4a3a22"; gc.lineWidth = 3;
      // "It's always six o'clock now" — the Hatter. Both hands say so: hour straight down,
      // minute straight up. (The old minute hand pointed at two, which is nobody's teatime.)
      gc.beginPath(); gc.moveTo(32, 32); gc.lineTo(32, 50); gc.stroke();  // hour: six
      gc.lineWidth = 2; gc.beginPath(); gc.moveTo(32, 32); gc.lineTo(32, 12); gc.stroke();  // minute: twelve
      gc.fillStyle = "#4a3a22"; gc.beginPath(); gc.arc(32, 32, 2, 0, 7); gc.fill();
      gc.strokeStyle = "rgba(150,100,40,0.45)"; gc.lineWidth = 2;   // the tea ring someone set a cup on
      gc.beginPath(); gc.arc(44, 44, 16, 0.9, 3.3); gc.stroke();
    }),
  }));
  face.rotation.x = -Math.PI / 2; face.position.y = 0.014; g.add(face);
  var crownK = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), goldM);
  crownK.rotation.z = Math.PI / 2; crownK.position.set(0.048, 0.007, 0); g.add(crownK);
  // the tea ring on the surface it sits on — the Rabbit put it down mid-tea-party
  var tea = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.047, 32, 1, 0.6, 4.2),
    new THREE.MeshBasicMaterial({ color: 0x8a5a2a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  tea.rotation.x = -Math.PI / 2; tea.position.set(0.012, 0.0008, 0.01); g.add(tea);
  for (var i = 0; i < 3; i++) {
    var link = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.002, 6, 10), goldM);
    link.rotation.x = -Math.PI / 2; link.position.set(0.062 + i * 0.011, 0.004, 0.008 + i * 0.006); g.add(link);
  }
  return g;
}
export function buildInkwell() { // the red ink, corked. leave it corked.
  var g = new THREE.Group();
  var well = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.045, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8dce8, roughness: 0.1, transparent: true, opacity: 0.4 }));
  well.position.y = 0.0225; g.add(well);
  var ink = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.024, 12),
    new THREE.MeshStandardMaterial({ color: 0xb31f2b, roughness: 0.3, emissive: 0x4a0a10, emissiveIntensity: 0.5 }));   // THE RED INK itself: dracula --red
  ink.position.y = 0.014; g.add(ink);
  var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.014, 10), mat(0x8a6a3a, 0.4));
  cap.position.y = 0.052; g.add(cap);
  var quill = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.024), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 32, function (gc, w, h) {
      gc.clearRect(0, 0, w, h);
      gc.fillStyle = "#ece6da";
      gc.beginPath(); gc.moveTo(4, h / 2); gc.quadraticCurveTo(w * 0.55, -4, w, h * 0.3);
      gc.quadraticCurveTo(w * 0.55, h + 4, 4, h / 2); gc.fill();
      gc.fillStyle = "#b31f2b"; // the tip has been dipped
      gc.beginPath(); gc.moveTo(4, h / 2); gc.lineTo(22, h * 0.32); gc.lineTo(22, h * 0.68); gc.fill();
    }), transparent: true, side: THREE.DoubleSide,
  }));
  quill.position.set(0.035, 0.05, 0.012); quill.rotation.z = 0.6; quill.rotation.y = -0.4; g.add(quill);
  return g;
}
export function buildLens() {
  var g = new THREE.Group();
  var rim = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 8, 24), goldM);
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.012; g.add(rim);
  var lens = new THREE.Mesh(new THREE.CircleGeometry(0.031, 24),
    new THREE.MeshStandardMaterial({ color: 0xcfe8f2, roughness: 0.05, transparent: true, opacity: 0.24, side: THREE.DoubleSide }));
  lens.rotation.x = -Math.PI / 2; lens.position.y = 0.012; g.add(lens);
  var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.06, 10), toyWoodD);
  handle.rotation.z = Math.PI / 2; handle.rotation.y = 0.5; handle.position.set(0.058, 0.008, -0.028); g.add(handle);
  return g;
}
export function buildSpitfire() { // ⚠️ it is a LANCASTER — see below; the export name stays for the call site
  /* G FOR GEORGE's bible, line 2: the title is "the hero's Lancaster's call sign". The
   * shoebox was holding a single-engined fighter for a four-engined bomber's story — the
   * crew of seven, two parachutes out over the Ruhr. So: four nacelles on long wings,
   * the twin-fin tail, the greenhouse nose, dark-earth/green over black undersides,
   * and a tiny G on the flank. Still banking for the trees on its little stand. */
  var g = new THREE.Group();
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.01, 16), toyWoodD);
  base.position.y = 0.005; g.add(base);
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.055, 8), mat(0x8a8f98, 0.4));
  pole.position.y = 0.036; g.add(pole);
  var plane = new THREE.Group(); plane.position.y = 0.07; plane.rotation.set(0, 0.6, 0.3);
  var earth = mat(0x5a4a36, 0.75), green = mat(0x4e5a3a, 0.75), night = mat(0x14161a, 0.7);
  var fus = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0062, 0.1, 10), earth);
  fus.rotation.z = Math.PI / 2; plane.add(fus);
  var belly = new THREE.Mesh(new THREE.CylinderGeometry(0.0077, 0.0064, 0.098, 10, 1, false, Math.PI, Math.PI), night);
  belly.rotation.z = Math.PI / 2; plane.add(belly);   // black undersides, the bomber's night camouflage
  var noseG = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x9fc8e8, roughness: 0.15, transparent: true, opacity: 0.85 }));
  noseG.position.x = 0.05; noseG.scale.set(1.3, 1, 1); plane.add(noseG);   // the bomb-aimer's greenhouse
  var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x9fc8e8, roughness: 0.15 }));
  canopy.scale.set(2.2, 1, 1); canopy.position.set(0.028, 0.0072, 0); plane.add(canopy);
  var wings = box(0.022, 0.0028, 0.15, green); wings.position.set(0.014, -0.001, 0); plane.add(wings);
  var wingsU = box(0.022, 0.001, 0.15, night); wingsU.position.set(0.014, -0.0026, 0); plane.add(wingsU);
  [-0.056, -0.026, 0.026, 0.056].forEach(function (z) {   // four Merlins
    var nac = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.003, 0.03, 8), earth);
    nac.rotation.z = Math.PI / 2; nac.position.set(0.022, -0.001, z); plane.add(nac);
    var prp = box(0.0015, 0.02, 0.003, night); prp.position.set(0.038, -0.001, z); prp.rotation.x = z * 20; plane.add(prp);
  });
  var tailW = box(0.014, 0.0022, 0.05, green); tailW.position.set(-0.044, 0.002, 0); plane.add(tailW);
  [-0.025, 0.025].forEach(function (z) {   // the twin fins — the Lancaster's silhouette
    var fin = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 12), earth);
    fin.rotation.x = Math.PI / 2; fin.position.set(-0.046, 0.009, z); plane.add(fin);
  });
  [-0.05, 0.05].forEach(function (z) { // roundels on the wings
    var blue = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0008, 12), mat(0x2a4a8a, 0.6));
    blue.position.set(0.012, 0.0016, z); plane.add(blue);
    var red = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0012, 10), mat(0xb03030, 0.6));
    red.position.set(0.012, 0.0018, z); plane.add(red);
  });
  // the call sign on the flank: a square with the G, in the war's dull red
  var letter = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.008), new THREE.MeshBasicMaterial({
    map: canvasTex(48, 32, function (gc, w, h) {
      gc.clearRect(0, 0, w, h); gc.fillStyle = "#b03030"; gc.font = "bold 26px Arial, sans-serif"; gc.textAlign = "center"; gc.textBaseline = "middle";
      gc.fillText("G", w / 2, h / 2 + 2);
    }), transparent: true, side: THREE.DoubleSide }));
  letter.position.set(-0.012, 0.002, 0.0078); plane.add(letter);
  g.add(plane);
  return g;
}
export function buildCrown() { // the Shelf King's
  var g = new THREE.Group();
  var band = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.026, 18, 1, true), goldM);
  band.position.y = 0.017; g.add(band);
  for (var i = 0; i < 6; i++) {
    var a = i / 6 * Math.PI * 2;
    var spike = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.028, 6), goldM);
    spike.position.set(Math.cos(a) * 0.044, 0.042, Math.sin(a) * 0.044); g.add(spike);
    var tipb = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), goldM);
    tipb.position.set(Math.cos(a) * 0.044, 0.058, Math.sin(a) * 0.044); g.add(tipb);
  }
  [[0, 0xc0392b], [2.1, 0x2a6ab8], [4.2, 0x27ae60]].forEach(function (p) {
    var jm = new THREE.MeshStandardMaterial({ color: p[1], roughness: 0.15, emissive: p[1], emissiveIntensity: 0.25 });
    var jewel = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), jm);
    jewel.position.set(Math.cos(p[0]) * 0.047, 0.016, Math.sin(p[0]) * 0.047); g.add(jewel);
  });
  return g;
}
export function buildBrainball() {
  var g = new THREE.Group(), pink = mat(0xe88ab0, 0.95);
  var main = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 12), pink);
  main.scale.y = 0.82; main.position.y = 0.033; g.add(main);
  [[-0.018, 0.05, 0.012], [0.018, 0.05, 0.012], [-0.014, 0.048, -0.02], [0.016, 0.046, -0.018], [0, 0.055, -0.004]].forEach(function (p) {
    var lobe = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), pink);
    lobe.position.set(p[0], p[1], p[2]); g.add(lobe);
  });
  return g;
}
export function buildGoldBar() { // one ingot off the top of the pile
  var g = new THREE.Group();
  var inner = new THREE.Group(); inner.scale.set(2.1, 1, 1); // square frustum → a proper ingot
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.017, 4), goldM);
  body.rotation.y = Math.PI / 4; body.position.y = 0.0085;
  inner.add(body); g.add(inner);
  var stamp = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.038), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 48, function (gc, w, h) {
      gc.clearRect(0, 0, w, h);
      gc.fillStyle = "rgba(120,86,20,0.55)";
      gc.font = "bold 17px Georgia, serif"; gc.textAlign = "center"; gc.textBaseline = "middle";
      gc.fillText("999.9", w / 2, 15);
      gc.font = "bold 11px Georgia, serif";
      gc.fillText("FINE GOLD", w / 2, 33);
    }), transparent: true,
  }));
  stamp.rotation.x = -Math.PI / 2; stamp.position.y = 0.0172; g.add(stamp);
  return g;
}
export function buildRiftShard() { // BLOODRIFT — a splinter of the Rift, still lit
  var g = new THREE.Group();
  // the shards GLOW: this is the only emissive treasure in the room, which is the
  // point — bloomThreshold is 1.0 (linear), so emissiveIntensity has to clear it or
  // the post pass ignores it entirely and the shard reads as dull red plastic.
  var shardM = new THREE.MeshStandardMaterial({
    color: 0x8c1526, roughness: 0.22, metalness: 0.1,
    emissive: 0xd11a33, emissiveIntensity: 1.35,
  });
  var slab = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.012, 6), mat(0x1d1a20, 0.75));
  slab.position.y = 0.006; g.add(slab);
  // main shard: a stretched octahedron leaning off true, so it reads as broken
  // rather than placed — a 4-sided cone would have looked like a party hat
  var main = new THREE.Mesh(new THREE.OctahedronGeometry(0.031, 0), shardM);
  main.scale.set(0.52, 2.05, 0.52); main.position.y = 0.052; main.rotation.set(0.14, 0.5, -0.13);
  g.add(main);
  // splinters sit WIDE and clear of the main shard — tucked in close they were
  // hidden behind it from every angle and the treasure read as a single flame
  [[-0.030, 0.026, 0.016, 0.34, -0.6], [0.031, 0.022, -0.017, -0.3, 0.8]].forEach(function (s) {
    var sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), shardM);
    sp.scale.set(0.5, 1.7, 0.5);
    sp.position.set(s[0], s[1], s[2]); sp.rotation.set(s[3], 0, s[4]);
    g.add(sp);
  });
  return g;
}
export function buildTrophy() { // VICTORY LAP — first place, a long time ago now
  var g = new THREE.Group();
  // deliberately DULL: metalness 0.45 / roughness 0.62 reads as tarnished brass.
  // At the goldM settings (0.7 / 0.35) it looked freshly polished, which is the
  // opposite of the whole game.
  var brass = new THREE.MeshStandardMaterial({ color: 0xa8873f, roughness: 0.62, metalness: 0.45 });
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.016, 4), mat(0x2b211a, 0.7));
  base.rotation.y = Math.PI / 4; base.position.y = 0.008; g.add(base);
  var plate = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.011), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 36, function (gc, w, h) {
      gc.fillStyle = "#b39a52"; gc.fillRect(0, 0, w, h);
      gc.fillStyle = "#3a2f1c"; gc.font = "bold 15px Georgia, serif";
      gc.textAlign = "center"; gc.textBaseline = "middle";
      gc.fillText("1st  ·  STILL HERE", w / 2, h / 2 + 1);
    }),
  }));
  plate.position.set(0, 0.008, 0.0325); g.add(plate);
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.022, 10), brass);
  stem.position.y = 0.027; g.add(stem);
  var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.010, 0.03, 14), brass);
  cup.position.y = 0.053; g.add(cup);
  var lip = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0028, 6, 16), brass);
  lip.rotation.x = -Math.PI / 2; lip.position.y = 0.068; g.add(lip);
  [-1, 1].forEach(function (s) {
    var hn = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0028, 6, 12, Math.PI * 1.1), brass);
    hn.position.set(s * 0.026, 0.056, 0);
    hn.rotation.set(Math.PI / 2, 0, s > 0 ? -0.55 : Math.PI + 0.55);
    g.add(hn);
  });
  return g;
}
export function buildPalm() { // the island that isn't on any chart, pocket edition
  var g = new THREE.Group();
  var sea = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.066, 0.008, 20),
    new THREE.MeshStandardMaterial({ color: 0x4a9ab8, roughness: 0.3 }));
  sea.position.y = 0.004; g.add(sea);
  var sand = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.014, 18), mat(0xd8c08a, 0.95));
  sand.position.y = 0.014; g.add(sand);
  var seg = null;
  for (var i = 0; i < 3; i++) {
    seg = new THREE.Mesh(new THREE.CylinderGeometry(0.005 - i * 0.001, 0.006 - i * 0.001, 0.024, 8), toyWood);
    seg.position.set(i * 0.006, 0.03 + i * 0.022, 0); seg.rotation.z = -0.18 - i * 0.1; g.add(seg);
  }
  for (var f = 0; f < 5; f++) {
    var a = f / 5 * Math.PI * 2;
    var frond = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016),
      new THREE.MeshStandardMaterial({ color: 0x3f9a4a, roughness: 0.85, side: THREE.DoubleSide }));
    frond.position.set(0.018 + Math.cos(a) * 0.02, 0.085, Math.sin(a) * 0.02);
    frond.rotation.set(Math.sin(a) * 0.5, a, -0.5);
    g.add(frond);
  }
  var coco = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), toyWoodD);
  coco.position.set(0.018, 0.078, 0.008); g.add(coco);
  return g;
}


/* ---- the six that were missing (2026-08-11) -----------------------------------
 * Every game on the shelf leaves something behind; these six had doorways but no
 * treasure. Same rules as the rest: ~4-12cm, low poly, flat colour over canvas art
 * (only the compass and the trophy plate earn a texture), built about y=0 so the
 * shoebox can stand them on any surface.
 */
export function buildMug() { // SHORT STAFFED — the diner mug, chipped, never empty
  var g = new THREE.Group();
  var china = mat(0xe8e2d4, 0.55);
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.042, 16), china);
  body.position.y = 0.021; g.add(body);
  var coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.004, 16), mat(0x40241a, 0.35));
  coffee.position.y = 0.039; g.add(coffee);
  var band = new THREE.Mesh(new THREE.CylinderGeometry(0.0265, 0.0265, 0.006, 16), mat(0x9a2f2a, 0.5));
  band.position.y = 0.030; g.add(band);
  var handle = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0032, 6, 14, Math.PI * 1.25), china);
  handle.position.set(0.028, 0.022, 0); handle.rotation.set(Math.PI / 2, 0, -Math.PI * 0.62); g.add(handle);
  // the saucer it never gets put back on
  var sauc = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.040, 0.004, 18), china);
  sauc.position.y = 0.002; g.add(sauc);
  return g;
}
export function buildCap() { // HOME BREW — the first cap you ever crimped, on its mat
  var g = new THREE.Group();
  var matM = mat(0xd8c9a8, 0.95);
  var beermat = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.004, 20), matM);
  beermat.position.y = 0.002; g.add(beermat);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0022, 6, 20), mat(0x8a6a3a, 0.85));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.0045; g.add(ring);
  // the bottle, stout and brown
  var glass = new THREE.MeshStandardMaterial({ color: 0x4a2a12, roughness: 0.22, metalness: 0.05 });
  var bod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.056, 14), glass);
  bod.position.y = 0.032; g.add(bod);
  var shldr = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.018, 0.020, 14), glass);
  shldr.position.y = 0.070; g.add(shldr);
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.020, 12), glass);
  neck.position.y = 0.090; g.add(neck);
  var label = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.026, 14), mat(0xe6c05a, 0.7));
  label.position.y = 0.030; g.add(label);
  var crown = new THREE.Mesh(new THREE.CylinderGeometry(0.0098, 0.0098, 0.006, 12), mat(0xc03a30, 0.45));
  crown.position.y = 0.103; g.add(crown);
  // and one crimped off, lying on the mat
  var spent = new THREE.Mesh(new THREE.CylinderGeometry(0.0098, 0.0098, 0.005, 12), mat(0xc03a30, 0.45));
  spent.position.set(0.026, 0.0065, 0.012); spent.rotation.x = 0.16; g.add(spent);
  return g;
}
export function buildSparkPlug() { // FRESH CUT — the plug you finally changed
  var g = new THREE.Group();
  var steel = new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.42, metalness: 0.6 });
  var porc = mat(0xe4dccb, 0.5);
  // lying on its side on a shop rag, because that is where it lived for a season
  var rag = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.004, 0.046), mat(0x4e6b4a, 0.95));
  rag.position.y = 0.002; rag.rotation.y = 0.22; g.add(rag);
  var lay = new THREE.Group(); lay.position.set(0, 0.013, 0); lay.rotation.z = Math.PI / 2; lay.rotation.y = 0.22; g.add(lay);
  var ins = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0105, 0.030, 12), porc);
  ins.position.y = 0.024; lay.add(ins);
  var hex = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.010, 6), steel);
  hex.position.y = 0.004; lay.add(hex);
  var thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.018, 10), steel);
  thread.position.y = -0.010; lay.add(thread);
  var tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, 8), steel);
  tip.position.y = -0.022; lay.add(tip);
  var hook = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.009, 0.0035), steel);
  hook.position.set(0.006, -0.019, 0); lay.add(hook);
  var term = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 10), steel);
  term.position.y = 0.043; lay.add(term);
  // one blade of grass that came home in the tread
  var blade = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.020),
    new THREE.MeshStandardMaterial({ color: 0x6aa84a, roughness: 0.9, side: THREE.DoubleSide }));
  blade.position.set(-0.022, 0.012, 0.014); blade.rotation.set(0, 0.5, 0.3); g.add(blade);
  return g;
}
export function buildComic() { // THE LAST ISSUE — bagged, boarded, and read anyway
  var g = new THREE.Group();
  // leaning against nothing, the way a comic does when you stand it up to look at it
  var lean = new THREE.Group(); lean.rotation.z = -0.13; lean.rotation.y = 0.24; g.add(lean);
  var board = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.092, 0.003), mat(0xe8e0cc, 0.95));
  board.position.y = 0.046; lean.add(board);
  var cover = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.088, 0.004), mat(0xb4302c, 0.7));
  cover.position.set(0, 0.046, 0.0035); lean.add(cover);
  var sky = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.040, 0.001), mat(0x3a68b0, 0.7));
  sky.position.set(0, 0.056, 0.0060); lean.add(sky);
  var figure = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.030, 0.001), mat(0x1a1a22, 0.8));
  figure.position.set(-0.004, 0.052, 0.0068); lean.add(figure);       // a silhouette, mid-fall
  var cape = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.001), mat(0x1a1a22, 0.8));
  cape.position.set(0.008, 0.062, 0.0068); cape.rotation.z = -0.5; lean.add(cape);
  var banner = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.014, 0.001), mat(0xe6c34a, 0.6));
  banner.position.set(0, 0.083, 0.0060); lean.add(banner);            // the logo bar
  var price = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.010, 0.001), mat(0xf2ead6, 0.7));
  price.position.set(-0.021, 0.020, 0.0060); lean.add(price);         // the corner box
  var bag = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.098, 0.010),
    new THREE.MeshStandardMaterial({ color: 0xdfe8ea, roughness: 0.15, transparent: true, opacity: 0.22 }));
  bag.position.y = 0.049; lean.add(bag);                              // mylar, still on
  return g;
}
export function buildFang() { // QUARRY — the first trophy you took, on its cord
  var g = new THREE.Group();
  var bone = mat(0xe4dcc6, 0.6);
  // a display block, because a hunter mounts a trophy; it doesn't just keep it
  var blk = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.010, 0.034), mat(0x2f2a24, 0.8));
  blk.position.y = 0.005; g.add(blk);
  var plate = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.001, 0.008), mat(0xa8873f, 0.55));
  plate.position.set(0, 0.0105, 0.014); g.add(plate);
  // the tooth: curved, so two tapered segments at a slight angle read better than one
  var lower = new THREE.Mesh(new THREE.CylinderGeometry(0.0058, 0.0075, 0.026, 10), bone);
  lower.position.set(0, 0.023, 0); lower.rotation.z = 0.10; g.add(lower);
  var upper = new THREE.Mesh(new THREE.ConeGeometry(0.0058, 0.030, 10), bone);
  upper.position.set(-0.005, 0.050, 0); upper.rotation.z = 0.30; g.add(upper);
  var wrap = new THREE.Mesh(new THREE.TorusGeometry(0.0072, 0.0016, 6, 12), mat(0x7a4a2a, 0.9));
  wrap.rotation.x = Math.PI / 2; wrap.rotation.y = 0.10; wrap.position.set(0.001, 0.017, 0); g.add(wrap);
  // the cord, coiled where it was set down
  for (var i = 0; i < 3; i++) {
    var coil = new THREE.Mesh(new THREE.TorusGeometry(0.010 + i * 0.004, 0.0013, 5, 16), mat(0x6a4326, 0.9));
    coil.rotation.x = -Math.PI / 2; coil.position.set(0.012, 0.0108 + i * 0.0006, -0.006); g.add(coil);
  }
  return g;
}
export function buildIceCream() { // HERE COMES THE TRUCK — you caught it once
  var g = new THREE.Group();
  var wafer = mat(0xd9a862, 0.85);
  // a little wire stand, or it can only ever lie on its side
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0016, 6, 16), mat(0xb9b3a6, 0.4));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.030; g.add(ring);
  [0, 2.09, 4.19].forEach(function (a) {
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.032, 6), mat(0xb9b3a6, 0.4));
    leg.position.set(Math.cos(a) * 0.015, 0.016, Math.sin(a) * 0.015);
    leg.rotation.set(Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16); g.add(leg);
  });
  var cone = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.052, 12), wafer);
  cone.rotation.z = Math.PI; cone.position.y = 0.050; g.add(cone);     // tip DOWN, into the stand
  var scoop1 = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), mat(0xf6d9b0, 0.6));
  scoop1.position.y = 0.082; g.add(scoop1);                            // vanilla
  var scoop2 = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), mat(0xf2a8bc, 0.6));
  scoop2.position.set(0.004, 0.105, -0.003); g.add(scoop2);            // strawberry, sliding
  var flake = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.024, 6), mat(0x5e3a20, 0.8));
  flake.position.set(-0.008, 0.116, 0.004); flake.rotation.z = 0.42; g.add(flake);
  // one drip, already committed
  var drip = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 8, 6), mat(0xf6d9b0, 0.6));
  drip.position.set(-0.017, 0.068, 0.002); drip.scale.y = 1.8; g.add(drip);
  return g;
}

export function buildWaxComb() { // SURF — the comb that lives in every board bag
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.012, 0.042), mat(0xf2d43a, 0.5));
  body.position.y = 0.006; g.add(body);
  // the notched edge, which is the entire point of a comb
  for (var i = 0; i < 6; i++) {
    var tooth = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.007), mat(0xf2d43a, 0.5));
    tooth.position.set(-0.024 + i * 0.0096, 0.006, 0.0245); g.add(tooth);
  }
  var bevel = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.006, 0.010), mat(0xe8c62e, 0.5));
  bevel.position.set(0, 0.010, -0.019); g.add(bevel);
  // a nub of old wax stuck to it, sandy and going nowhere
  var wax = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), mat(0xefe6cf, 0.95));
  wax.scale.set(1, 0.55, 1); wax.position.set(0.019, 0.014, 0.006); g.add(wax);
  return g;
}

export function buildZebra() { // CLEAN THE ZOO — one that made it back to its habitat
  var g = new THREE.Group();
  var cream = mat(0xece8dc, 0.85), ink = mat(0x2b2e33, 0.85);
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.040, 0.032), cream);
  torso.position.y = 0.052; g.add(torso);
  for (var i = 0; i < 4; i++) {   // the stripes are the whole silhouette
    var band = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.041, 0.033), ink);
    band.position.set(-0.024 + i * 0.017, 0.052, 0); g.add(band);
  }
  [[-0.026, -0.011], [0.026, -0.011], [-0.026, 0.011], [0.026, 0.011]].forEach(function (p) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.034, 0.009), cream);
    leg.position.set(p[0], 0.017, p[1]); g.add(leg);
    var hoof = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.007, 0.010), ink);
    hoof.position.set(p[0], 0.004, p[1]); g.add(hoof);
  });
  var neck = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.030, 0.016), cream);
  neck.position.set(0.030, 0.080, 0); neck.rotation.z = -0.30; g.add(neck);
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.017, 0.017), cream);
  head.position.set(0.045, 0.094, 0); g.add(head);
  var muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.012, 0.014), ink);
  muzzle.position.set(0.058, 0.091, 0); g.add(muzzle);
  var mane = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.030, 0.014), ink);
  mane.position.set(0.026, 0.086, 0); mane.rotation.z = -0.30; g.add(mane);
  var tail = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.006, 0.006), ink);
  tail.position.set(-0.042, 0.062, 0); g.add(tail);
  return g;
}

export function buildBobber() { // BITE — the one that came off in the grass last August
  var g = new THREE.Group();
  var top = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd8443a, 0.6));
  top.position.y = 0.022; g.add(top);
  var bot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xf0ece0, 0.6));
  bot.position.y = 0.022; g.add(bot);
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.026, 6), mat(0xe8e2d2, 0.5));
  stem.position.y = 0.050; g.add(stem);
  var hook = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.0012, 4, 8, Math.PI * 1.4), mat(0x9aa1a9, 0.35));
  hook.rotation.x = Math.PI / 2; hook.position.set(0, 0.004, 0.014); g.add(hook);
  return g;
}

export function buildShard() { // THE KILN — a test tile, the only honest way to know a glaze
  var g = new THREE.Group();
  var tile = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.008, 0.052), mat(0xd8cbb0, 0.85));
  tile.position.y = 0.004; g.add(tile);
  // the glaze runs DOWN and pools at the foot — which is the whole reason you tilt a test tile
  var glaze = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.0035, 0.036), mat(0x2f6f7a, 0.28));
  glaze.position.set(0, 0.0095, 0.006); g.add(glaze);
  var pool = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.006, 0.008), mat(0x1e5a66, 0.22));
  pool.position.set(0, 0.010, 0.023); g.add(pool);
  var hole = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0014, 4, 10), mat(0xc7b99c, 0.85));
  hole.rotation.x = Math.PI / 2; hole.position.set(0, 0.008, -0.020); g.add(hole);
  return g;
}

export function buildArmyMan() { // TOYBOX: LAST WATCH — one that was still standing at dawn
  var g = new THREE.Group();
  var green = mat(0x4e6a3e, 0.85);
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.005, 12), green);
  base.position.y = 0.0025; g.add(base);
  var legs = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.024, 0.010), green);
  legs.position.y = 0.017; g.add(legs);
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.022, 0.011), green);
  torso.position.y = 0.040; g.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 6), green);
  head.position.y = 0.058; g.add(head);
  var helm = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), green);
  helm.position.y = 0.059; g.add(helm);
  var rifle = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0035, 0.030), green);
  rifle.position.set(0.010, 0.046, 0.008); rifle.rotation.x = 0.55; g.add(rifle);
  return g;
}

export function buildFangs() { // THE HAUNT — the good ones, from the bottom of the box
  var g = new THREE.Group();
  var white = mat(0xf2eee0, 0.5);
  var arch = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.006, 6, 14, Math.PI), white);
  arch.rotation.x = Math.PI / 2; arch.rotation.z = Math.PI; arch.position.y = 0.010; g.add(arch);
  [-0.011, 0.011].forEach(function (fx) {          // the two that matter
    var fang = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.016, 7), white);
    fang.position.set(fx, 0.004, 0.017); fang.rotation.x = Math.PI; g.add(fang);
  });
  var gum = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.0035, 5, 14, Math.PI), mat(0xc4485a, 0.6));
  gum.rotation.x = Math.PI / 2; gum.rotation.z = Math.PI; gum.position.y = 0.017; g.add(gum);
  return g;
}
