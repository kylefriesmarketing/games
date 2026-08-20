/* DUPLICATE `var` AT THE SAME SCOPE — the bug that keeps happening here.
 *
 * hallway.js is one ~7,300-line function. `var` is function-scoped, so two blocks a
 * thousand lines apart that both write `var upH = ...` are the SAME variable, and the
 * later one silently overwrites the earlier. It has now happened twice:
 *
 *   `var matT`  the playmat texture shadowed the kitchen's
 *   `var upH`   a light holder shadowed the second storey's HEIGHT, so the holder
 *               became the number 2.93, sailed through a truthy guard, and crashed on
 *               `.a.intensity` with a message pointing nowhere near the cause — and
 *               it took down the whole page, so the symptom was "nothing boots"
 *
 * Neither is a syntax error. Neither survives review by reading. Run this instead:
 *
 *   node tools/check-shadow.mjs
 *
 * It only looks at declarations indented exactly two spaces, which in these files
 * means the top level of the one big builder function — the scope where a collision
 * is silent. Anything deeper is inside a nested function and genuinely local.
 */
import fs from "fs";

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ["js/hallway.js", "js/room.js"];

/* KNOWN AND DORMANT. Each of these is a genuine double declaration, and each was
 * checked by hand: every later CODE reference wants the second one (the remaining
 * mentions of `apron` and `kettle` after their second declaration are comments), so
 * none of them currently misbehaves. They are left alone because renaming them
 * changes no behaviour and only risks breaking something that works.
 * The allowlist exists so this stays a GATE — a check that always fails is a check
 * nobody runs. If a name appears here, somebody has already done the analysis; if a
 * NEW name shows up, nobody has. */
const DORMANT = new Set(["apron", "bbDeck", "bbBody", "kettle", "shelfM", "canG", "bkSeat", "knob"]);

let bad = 0, known = 0;
for (const f of files) {
  let text;
  try { text = fs.readFileSync(f, "utf8"); }
  catch (e) { console.log(`skip ${f} (${e.code})`); continue; }
  const seen = new Map();
  text.split(/\r?\n/).forEach((line, i) => {
    const m = /^ {2}var\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
    if (!m) return;
    const name = m[1];
    if (seen.has(name)) {
      if (DORMANT.has(name)) { known++; return; }
      console.log(`${f}:${i + 1}  DUPLICATE var ${name}  (first declared at line ${seen.get(name)})`);
      bad++;
    } else seen.set(name, i + 1);
  });
}

console.log(bad
  ? `\n${bad} NEW duplicate top-level declaration(s). The later one silently wins — ` +
    `check whether anything reads the earlier one after that line, then either rename ` +
    `or add it to DORMANT with the reason.`
  : `clean (${known} known-dormant duplicate${known === 1 ? "" : "s"} allowlisted)`);
process.exit(bad ? 1 : 0);
