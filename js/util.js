/* THE HOUSE — small shared helpers.
 * Pure functions only: nothing in here reads or writes the room's state, which is
 * what makes them safe to hand around. Imported by room.js and its sibling modules.
 * (Native ES modules, no build step — "three" resolves via the importmap in index.html.)
 */
import * as THREE from "three";

/* ---- materials + geometry shorthands ------------------------------------- */
export function mat(color, rough) {
  return new THREE.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.9 : rough });
}
export function box(w, h, d, m) {
  var g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.castShadow = g.receiveShadow = true;
  return g;
}
/* A texture drawn on the fly — this room has no image files for most of what it
   shows, so nearly every label, screen and sticker starts life here. */
/* ⚠️⚠️ COLOUR-MANAGED BY DEFAULT, as of the flagship pass. The canvas 2D API paints
 * in sRGB — that is what every hex colour and gradient in this project MEANS — but
 * CanvasTexture ships with NoColorSpace, so for months 67 of the house's 107 painted
 * textures were sampled as if their bytes were linear light: lifted mids, crushed
 * saturation, and a visible mismatch against the GLB props, whose loader flags sRGB
 * automatically. The room's lighting was then hand-tuned ON TOP of the bug.
 * The fourth argument opts OUT for data textures — alpha masks, dust, rain, contact
 * shadows, anything whose channels are quantities rather than colours. Bump maps are
 * unaffected either way: bumpFrom() builds its own CanvasTexture and reads raw canvas
 * pixels, and the flag is a sampler property, not a pixel mutation. */
export function canvasTex(w, h, draw, linear) {
  var c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  var t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  if (!linear) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/* a regular n-gon, centred on the current canvas origin */
export function poly(g, n, r, rot, fill) {
  g.beginPath();
  for (var i = 0; i < n; i++) {
    var a = rot + i / n * Math.PI * 2;
    g[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath(); g.fillStyle = fill; g.fill();
}

/* ---- storage + text ------------------------------------------------------ */
// every read is defensive: private mode throws, and a half-written save shouldn't
// take the whole room down with it
export function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
}
export function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ }
}
export function readSave(key, fn) {
  try { var v = localStorage.getItem(key); return v ? fn(JSON.parse(v)) : null; } catch (e) { return null; }
}
export function countOf(x) {
  return x == null ? null : (Array.isArray(x) ? x.length : Object.keys(x).length);
}
export function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
export function hex6(n) { return "#" + ("00000" + n.toString(16)).slice(-6); }
