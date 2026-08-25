// THE HOUSE asset audit: every "assets/..." path referenced in the source must exist
// on disk, and every file in assets/ must be referenced (catches typos, stale renames,
// and dead weight).
// Run: node tools/check-room.js   (from games-hub/ or anywhere)
//
/* ⚠️⚠️ THIS TOOL SPENT MONTHS CRYING WOLF, and that is how 3.2 MB of dead assets got
 * to ship. It reported 27 orphans of which only 7 were real — a 20-line wall of false
 * positives trains you to skim past it — while the single largest dead file in the
 * project (assets/tex/neon.png, 400 KB) sat in the CLEAN column. Two blind spots:
 *
 *   1. IT MATCHED INSIDE COMMENTS. A note reading "it used to be assets/tex/neon.png"
 *      counted as a live reference, so the file it was written to mourn stayed hidden.
 *      Prose is not a reference. Strip comments before matching.
 *   2. IT COULD NOT SEE PATHS BUILT AT RUNTIME — "assets/tex/poster-" + key + ".jpg"
 *      and the MAT_TEX "assets/tex/" + file — so twelve live posters and nine live
 *      wallpapers were each reported as orphans.
 *
 * If you add a THIRD way of assembling an asset path, teach it here in the same edit,
 * or the next person gets the wall of noise back. */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sources = ["js/room.js", "js/hallway.js", "js/collectibles.js", "js/profile.js",
  "js/stickers.js", "js/audio.js", "js/post.js", "js/util.js", "index.html", "sw.js"]
  .map(f => path.join(root, f)).filter(f => fs.existsSync(f));

const refs = new Set();
for (const src of sources) {
  const text = fs.readFileSync(src, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")       // block comments are prose, not references
    .replace(/^\s*\/\/.*$/gm, "");          // and so are line comments
  for (const m of text.matchAll(/assets\/[a-zA-Z0-9_\-./]+\.[a-z0-9]+/g)) refs.add(m[0]);
  // paths assembled at runtime, which no literal-string sweep can see.
  // ⚠️ `painted: true` entries never request a .jpg — they go straight to POSTER_PAINT —
  // so counting them as references would report two permanent MISSINGs and put this
  // tool right back in the boy-who-cried-wolf business it just climbed out of.
  for (const m of text.matchAll(/key:\s*"([a-z0-9]+)"[^\n]*$/gm)) {
    if (!/url:/.test(m[0]) || /painted:\s*true/.test(m[0])) continue;
    refs.add("assets/tex/poster-" + m[1] + ".jpg");
  }
  for (const m of text.matchAll(/"((?:wp|fl|rug)-[a-z0-9-]+\.webp)"/g)) refs.add("assets/tex/" + m[1]);
}

let missing = 0, orphaned = 0;
for (const ref of [...refs].sort()) {
  if (!fs.existsSync(path.join(root, ref))) { console.log("MISSING  " + ref); missing++; }
}

// ⚠️ assets/ ROOT is audited too — assets/og.jpg hid there for months because the sweep
// only walked tex/ and props/. assets/lib is skipped on purpose: the draco decoder files
// are fetched by DRACOLoader at runtime and never referenced by name.
for (const dir of ["assets", "assets/tex", "assets/props"]) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    const rel = dir + "/" + f;
    if (fs.statSync(path.join(root, rel)).isDirectory()) continue;
    if (!refs.has(rel)) { console.log("ORPHAN   " + rel + " (on disk, never referenced)"); orphaned++; }
  }
}

console.log(`\n${refs.size} refs checked: ${missing} missing, ${orphaned} orphaned`);
process.exit(missing ? 1 : 0);
