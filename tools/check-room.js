// THE ROOM asset audit: every "assets/..." path referenced in js/room.js and
// index.html must exist on disk, and every file in assets/tex + assets/props
// must be referenced (catches typos, stale renames, and dead weight).
// Run: node tools/check-room.js   (from games-hub/ or anywhere)
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sources = ["js/room.js", "index.html"].map(f => path.join(root, f));

const refs = new Set();
for (const src of sources) {
  const text = fs.readFileSync(src, "utf8");
  for (const m of text.matchAll(/assets\/[a-zA-Z0-9_\-./]+\.[a-z0-9]+/g)) refs.add(m[0]);
}

let missing = 0, orphaned = 0;
for (const ref of [...refs].sort()) {
  if (!fs.existsSync(path.join(root, ref))) { console.log("MISSING  " + ref); missing++; }
}

// Only audit content folders for orphans; assets/lib is loader infrastructure
// (draco decoder files are fetched by DRACOLoader at runtime, never referenced by name).
for (const dir of ["assets/tex", "assets/props"]) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    const rel = dir + "/" + f;
    if (!refs.has(rel)) { console.log("ORPHAN   " + rel + " (on disk, never referenced)"); orphaned++; }
  }
}

console.log(`\n${refs.size} refs checked: ${missing} missing, ${orphaned} orphaned`);
process.exit(missing ? 1 : 0);
