/* THE ROOM — the little treasures the games leave behind.
 * One builder per collectible, each returning a THREE.Group sized in metres for a
 * shelf or a desktop (they end up ~4-12cm across). Shared toy materials live here
 * too so the whole set stays visually consistent.
 */
import * as THREE from "three";
import { mat, box, canvasTex } from "./util.js";

var goldM = new THREE.MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.35, metalness: 0.7 });
var glassM = new THREE.MeshStandardMaterial({ color: 0xbfe8e0, roughness: 0.12, transparent: true, opacity: 0.3 });
var toyWood = mat(0x8a6242, 0.8), toyWoodD = mat(0x5e4028, 0.85);
export function buildBracelet() {
  var g = new THREE.Group(), cols = [0xe05a7a, 0x5ab8e0, 0xe0c05a, 0x7ae08a, 0xb87ae0];
  var band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 8, 24), mat(0xd8cfc0, 0.8));
  band.rotation.x = -Math.PI / 2; band.position.y = 0.012; g.add(band);
  for (var i = 0; i < 8; i++) {
    var b = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), mat(cols[i % cols.length], 0.5));
    b.position.set(Math.cos(i / 8 * Math.PI * 2) * 0.05, 0.012, Math.sin(i / 8 * Math.PI * 2) * 0.05);
    g.add(b);
  }
  return g;
}
export function buildLaurel() {
  var g = new THREE.Group();
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 8, 28, Math.PI * 1.72), goldM);
  ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI * 0.64; ring.position.y = 0.012; g.add(ring);
  for (var i = 0; i < 10; i++) {
    var a = Math.PI * 0.64 + (i + 0.5) / 10 * Math.PI * 1.72;
    var lf = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.028, 6), goldM);
    lf.position.set(Math.cos(a) * 0.052, 0.014, -Math.sin(a) * 0.052);
    lf.rotation.x = Math.PI / 2; lf.rotation.y = -a + Math.PI / 2;
    g.add(lf);
  }
  return g;
}
export function buildCompass() {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24), goldM);
  body.position.y = 0.01; g.add(body);
  var face = new THREE.Mesh(new THREE.CircleGeometry(0.037, 24), new THREE.MeshBasicMaterial({
    map: canvasTex(64, 64, function (gc) {
      gc.fillStyle = "#f2ead6"; gc.beginPath(); gc.arc(32, 32, 32, 0, 7); gc.fill();
      gc.fillStyle = "#333"; gc.font = "bold 13px Georgia, serif"; gc.textAlign = "center"; gc.textBaseline = "middle";
      gc.fillText("N", 32, 10); gc.fillText("S", 32, 54); gc.fillText("E", 54, 32); gc.fillText("W", 10, 32);
      gc.strokeStyle = "#c0392b"; gc.lineWidth = 3;
      gc.beginPath(); gc.moveTo(30, 46); gc.lineTo(37, 16); gc.stroke();
    }),
  }));
  face.rotation.x = -Math.PI / 2; face.position.y = 0.021; g.add(face);
  var loop = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 6, 12), goldM);
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
  var hull = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.016), toyWoodD);
  hull.position.y = 0.038; g.add(hull);
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
      gc.beginPath(); gc.moveTo(32, 32); gc.lineTo(32, 52); gc.stroke();  // six o'clock —
      gc.beginPath(); gc.moveTo(32, 32); gc.lineTo(44, 22); gc.stroke(); // teatime forever
    }),
  }));
  face.rotation.x = -Math.PI / 2; face.position.y = 0.014; g.add(face);
  var crownK = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), goldM);
  crownK.rotation.z = Math.PI / 2; crownK.position.set(0.048, 0.007, 0); g.add(crownK);
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
    new THREE.MeshStandardMaterial({ color: 0x7a0f1e, roughness: 0.3, emissive: 0x3a0008, emissiveIntensity: 0.5 }));
  ink.position.y = 0.014; g.add(ink);
  var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.014, 10), mat(0x8a6a3a, 0.4));
  cap.position.y = 0.052; g.add(cap);
  var quill = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.024), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 32, function (gc, w, h) {
      gc.clearRect(0, 0, w, h);
      gc.fillStyle = "#ece6da";
      gc.beginPath(); gc.moveTo(4, h / 2); gc.quadraticCurveTo(w * 0.55, -4, w, h * 0.3);
      gc.quadraticCurveTo(w * 0.55, h + 4, 4, h / 2); gc.fill();
      gc.fillStyle = "#7a0f1e"; // the tip has been dipped
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
export function buildSpitfire() { // on a little display stand, banking for the trees
  var g = new THREE.Group();
  var base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.01, 16), toyWoodD);
  base.position.y = 0.005; g.add(base);
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.055, 8), mat(0x8a8f98, 0.4));
  pole.position.y = 0.036; g.add(pole);
  var plane = new THREE.Group(); plane.position.y = 0.068; plane.rotation.set(0, 0.6, 0.35);
  var raf = mat(0x66784f, 0.7);
  var fus = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.006, 0.08, 10), raf);
  fus.rotation.z = Math.PI / 2; plane.add(fus);
  var nose = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.018, 10), raf);
  nose.rotation.z = -Math.PI / 2; nose.position.x = 0.049; plane.add(nose);
  var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x9fc8e8, roughness: 0.15 }));
  canopy.scale.set(1.6, 1, 1); canopy.position.set(0.01, 0.008, 0); plane.add(canopy);
  var wings = box(0.026, 0.003, 0.1, raf); wings.position.set(0.012, 0, 0); plane.add(wings);
  var tailW = box(0.014, 0.0025, 0.036, raf); tailW.position.set(-0.036, 0.002, 0); plane.add(tailW);
  var fin = box(0.014, 0.014, 0.0025, raf); fin.position.set(-0.038, 0.009, 0); plane.add(fin);
  var prp = box(0.002, 0.03, 0.004, toyWoodD); prp.position.x = 0.059; prp.rotation.x = 0.6; plane.add(prp);
  [-0.036, 0.036].forEach(function (z) { // roundels
    var blue = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.0008, 12), mat(0x2a4a8a, 0.6));
    blue.position.set(0.012, 0.0022, z); plane.add(blue);
    var red = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0012, 10), mat(0xb03030, 0.6));
    red.position.set(0.012, 0.0024, z); plane.add(red);
  });
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

