/* THE ROOM — small shared helpers.
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
export function canvasTex(w, h, draw) {
  var c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
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
