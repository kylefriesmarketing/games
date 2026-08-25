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
  const fns = new Map();   // top-level FUNCTION names only — see the nested-var check below
  text.split(/\r?\n/).forEach((line, i) => {
    /* ⚠️ BOTH `var` AND `function` declarations. The first version of this tool only
     * watched `var`, and a second `function ground(...)` — a decal helper added 3,000
     * lines below the texture helper of the same name — walked straight past it. A
     * later function DECLARATION replaces an earlier one at the same scope exactly
     * like a later var, and the failure was the same shape: a Group handed to code
     * that expected a texture, and a dead page. */
    /* ⚠️⚠️ AND THE OTHER DIRECTION: a DEEPER `var` that reuses a top-level name.
     * `var` hoists to the top of its enclosing FUNCTION, so a `var paperM` five
     * hundred lines inside an IIFE makes that name `undefined` for the WHOLE IIFE —
     * including code above it that meant the outer one. That is not a shadowing you
     * can see by reading around either site, and it cost a debugging session: a new
     * top-level helper `paperM()` was called at line 417 and threw "paperM is not a
     * function", because an unrelated `var paperM` for a paper-coloured material sat
     * at line 621 inside the same IIFE. The tool only watched two-space declarations
     * and sailed straight past it. It watches deeper ones now, but only when they
     * collide with a name already taken at the top level — anything else is a
     * genuinely local variable and none of our business. */
    /* ⚠️ ONLY when it shadows a top-level FUNCTION. Restricting it that way is the
     * whole reason this check is usable: flagging every nested `var` that reuses any
     * top-level name produced TEN hits on the current tree, all benign — `var g` for
     * a canvas context inside a draw callback, a local `pot`, a local `deck`. A wall
     * of false positives is how check-room.js came to be ignored for months, and it
     * is not worth repeating here. Shadowing a top-level HELPER is different: you
     * call it expecting the helper and get `undefined` instead. */
    const deep = /^ {4,}var\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
    if (deep && fns.has(deep[1]) && !DORMANT.has(deep[1])) {
      console.log(`${f}:${i + 1}  NESTED var ${deep[1]} shadows the top-level FUNCTION ` +
        `${deep[1]}() (line ${fns.get(deep[1])}). var hoists to the top of its enclosing ` +
        `function, so every call above this line gets undefined, not the helper.`);
      bad++;
      return;
    }
    const m = /^ {2}(?:var\s+([A-Za-z_$][\w$]*)\s*=|function\s+([A-Za-z_$][\w$]*)\s*\()/.exec(line);
    if (!m) return;
    const name = m[1] || m[2];
    if (seen.has(name)) {
      if (DORMANT.has(name)) { known++; return; }
      console.log(`${f}:${i + 1}  DUPLICATE ${m[1] ? "var" : "function"} ${name}  (first declared at line ${seen.get(name)})`);
      bad++;
    } else { seen.set(name, i + 1); if (m[2]) fns.set(name, i + 1); }
  });
}

console.log(bad
  ? `\n${bad} NEW duplicate top-level declaration(s). The later one silently wins — ` +
    `check whether anything reads the earlier one after that line, then either rename ` +
    `or add it to DORMANT with the reason.`
  : `clean (${known} known-dormant duplicate${known === 1 ? "" : "s"} allowlisted)`);
process.exit(bad ? 1 : 0);
