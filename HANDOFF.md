# THE ROOM — Recovery & Handoff Document

*Written 2026-07-27 by Claude (Kyle's build partner). If you are a fresh assistant
reading this: this file is your context. Read it top to bottom before touching
anything. If you are Kyle: keep this file — everything needed to recreate the
project or brief a new assistant is in here or linked from here.*

---

## 1. What this is

**THE ROOM** is Kyle Fries' game hub: a clickable 3D 90s bedroom (Three.js) where
every object opens one of his browser games. It is the centerpiece of his Steam
plan — one package (~$5.99), extra games unlocked by keys (~$0.99), every game's
marketing funnels here. Live at:

> **https://kylefriesmarketing.github.io/games/**

- **Repo:** `github.com/kylefriesmarketing/games` (GitHub Pages from `main`, `.nojekyll` matters)
- **Local:** `games-hub/` inside `C:\Users\kylef\Downloads\New folder` (its own git repo in the subfolder)
- **Deploy:** commit + `git push origin main` inside `games-hub/`. That's it.
- **The workspace root "New folder" has an EMPTY .git — it is NOT a repo.** The deploy
  repos on GitHub are the only undo. Never trust the root git status.

## 2. The whole shelf (every game the room links to)

| Game | Repo | Live path | In the room as |
|---|---|---|---|
| SOUTH (Shackleton) | `south` | /south/ | book |
| STILL BREATHING | `still-breathing` | /still-breathing/ | book |
| NINE CIRCLES | `nine-circles` | /nine-circles/ | book |
| CHOOSE WISELY | `choose-wisely` | /choose-wisely/ | book |
| NOBODY (Odyssey) | `nobody` | /nobody/ | book |
| ELEMENTARY (Sherlock) | `sherlock` | /sherlock/ | book |
| CURIOUSER (Alice) | `alice` | /alice/ | book |
| DRACULA: THE RED INK | `dracula` | /dracula/ | book |
| G FOR GEORGE | `george` | /george/ | book |
| AGE OF TOYS (flagship RTS) | `toybox-tactics` (fed by `../toybox-deploy`) | /toybox-tactics/ | toy chest |
| HOOD RUN | `hood-run` (Pages from **master** root) | /hood-run/ | duffel bag + safe |
| TIDEBOUND (friend Tony's) | dumb-tony.github.io/GameRepos/tidebound | external | toy island + book |
| BRAINROT (friend Tony's) | dumb-tony.github.io/GameRepos/brainrot | external | brain on desk |

All of Kyle's games are same-origin, so the room reads their localStorage saves
directly (progress notebook, collectible earns). Tony's two are cross-origin —
they unlock their collectibles by *visiting* (`room-visited-*` flags).

GitHub account: **kylefriesmarketing** (gh CLI portable at `~/tools/gh/bin/gh.exe`,
already authed). Portable Node: `C:\Users\kylef\tools\node` (NOT on PATH — prefix it).

## 3. Architecture

No build step. Native ES modules + importmap, Three.js r160 from CDN.

```
games-hub/
  index.html            page shell, list-view fallback, PWA links, JSON-LD
  sw.js                 service worker — SHELL list + CACHE version (see rules)
  manifest.webmanifest  PWA
  js/
    room.js             ~4,600 lines — the room itself (everything not split out)
    util.js             mat, box, canvasTex, loadJSON, saveJSON, readSave, countOf, esc, hex6
    stickers.js         STICKER_DESIGNS (12 wall stickers)
    collectibles.js     13 build* functions (one treasure per game) + shared toy materials
    profile.js          visit days, 16 achievements, rank ("room-profile" key)
    audio.js            WebAudio engine: start/toggle/setRain + clickSfx/rumble/ratchetSfx/snoreSfx/knockSfx
  assets/
    props/*.glb         bed, kid (animated), cat, trex, bean, chair, globe, skate…
    tex/                carpet/wallpaper/rug bases, wp-*/fl-* material swaps,
                        poster-*.jpg (11 game posters), window_view, neon
  media/                og-room.jpg + room-hero.jpg (real in-engine renders)
```

### Iron rules

1. **Any NEW js module must be added to `sw.js` SHELL *and* the CACHE version bumped**
   (currently `the-room-v5`) or offline users pin stale code forever. Code is
   network-first; assets are stale-while-revalidate (never cache-first — it pins).
2. **The workspace root is not a repo.** Commit only inside `games-hub/`.
   `git add js/room.js <specific files>` — a parallel session may own other files.
3. **Never `git add -A` in hood-run** (concurrent sessions leave WIP there).
4. Only ever read GLB/mp3/mp4 via metadata or scripts — never raw (token cost).

## 4. The room's systems (and their localStorage keys)

Everything persists per visitor in localStorage. `window.__room` is the debug API
(scene, camera, renderer, pick, ray, THREE, kid*, decor, shoe, paint, out, store,
screen, light, season, tour, profile, audio, cat, posters, extras).

- **Movables / rearrange mode** — `registerMovable`/`applyMove`; kid obstacles &
  stations follow furniture; layout in `room-layout`. DECORATE button opens the
  **Decorator's Drawer** (tabs: stuff / paint / walls / shelf / saved).
- **Collectibles ("the shoebox")** — one treasure per game, earned by playing
  (`have()` reads each game's save). Placed state in `room-shoebox`. Defs support
  `anchor:` (home x/z are offsets from a movable's live position). Every placed
  item gets an **invisible 8.5cm grab-proxy sphere**. Placement fires a glow ping
  + kid line saying where it landed.
  ⚠️ Homes must be on **camera-facing lit surfaces** (desk / nightstand / TV stand /
  floor). NEVER the windowsill (chest+TV occlude it) or the shelf top (above eye
  level — flat items vanish behind the shelf edge).
- **Paint Box** — tints (walls/carpet/rug/wood/door) + neon color + light palettes
  + screensavers + room name banner, in `room-paint`. **MAT_TEX material swaps**:
  6 real wallpapers, 2 floors, racetrack rug (`assets/tex/wp-*/fl-*/rug-*`), gated
  by treasures found (`opts[4]` = need). ⚠️ **opt order is FROZEN** — saved rooms
  and themes index into it. Mirrored-repeat hides AI tile seams. `texMat` has
  `userData.baseMap/customMap` so async loads never clobber a swap.
- **Themes** — whole-room looks gated on treasures (`ROOM_THEMES`), now carrying
  real materials (cabin=pine+shag, arcade=grid, attic=ghosts, sunroom=daisies+
  racetrack, winter=glow stars).
- **WHAT'S OUT** — per-object display toggles (books, army men, brain, PC, island,
  chest, duffel, cat) in `room-out`; hidden things leave click/Tab/obstacle world.
- **Stickers** — wall decals, drag/scale/rotate, in `room-stickers`.
- **Poster frames** — 3 swappable frames (11 painted game posters + "(bare wall)").
  Cycle in the walls tab; **frames drag along any wall** like stickers; positions
  in `room-posters` (`_pos`). Clicking a frame opens the game whose print hangs
  in it. Unowned prints hang **wrapped** (storefront).
- **PETS ("who lives here")** — one resident at a time, picked in the stuff tab,
  `room-pet`, rides share codes (`blob.pt`). THE CAT: sleeping plush GLB
  (`assets/props/cat.glb`), beds mostly, blinks to rug/beanbag, rides furniture,
  breathes/twitches/stretches/wiggles (**all procedural — the rig library is
  biped-only, a rigged curled cat unfolds into a sleeping human; do not pay for
  rigging**; purr = `rumble(0.12)`). Plus three procedural pets: TURTLE (truly walks
  the floor, shells up on bumps/pets), FISH (bowl rides the TV stand), HAMSTER
  (ball rolls roomba-style, bounces off obstacles). Shared kid-obstacle CAT_OB.
  ⚠️ `fadeInObject` preserves `__designOp` — translucent materials (ball, bowl)
  must fade up to their DESIGN opacity, never to 1.
- **THE KID** — GLB with 7 clips, walks stations, sits/lies (poses hand-tuned —
  don't nudge), waves, dances, gives the first-visit **tour**, speaks via
  `kidSay` (floating div). One-time **news whisper** for returning visitors
  (`room-news-1`).
- **WELCOME GUIDE** — parchment card explaining which game style lives where
  (books = stories you steer, chest = the RTS, duffel = the runner, desk/island =
  Tony's, shoebox = treasures, DECORATE = the rest). Auto-opens once
  (`room-welcome-seen`), forever after under the ❔ top-right. "show me" rows
  ping the real spot via `pingAt`. It hands off to the kid's tour on close for
  true newcomers (`tourWaiter` defers when `welcomeWillShow`). DOM overlays DO
  screenshot in the pane even over WebGL — only the canvas itself doesn't.
- **Storefront skeleton** — `GAME_KEYS` (all `free:true` today — NOTHING is locked
  for real visitors). `?store=demo` previews the locked experience: books wrapped
  as gifts, posters wrapped, key card modal (`KEY-<SKU>` redeems), notebook "key
  ring" page. Redeeming unwraps book + poster together. Keys in `room-keys`.
- **Share** — 📸 room photo (offscreen render — MUST copy toneMapping/exposure/
  outputColorSpace to any new renderer), 🔗 share codes (`TR1.` base64 of
  `roomStateBlob()`: layout+paint+out+collectibles+stickers+posters), room slots
  (`room-slots`), undo stack, presets, surprise-me.
- **Seasons & hours** — date-driven decoration (`seasonFX`) + light phases
  (day/dusk/evening/night in `PHASES`), light mode in `room-light`.
- **THE WINDOW** — a painted place, not a photo: three parallax canvas layers
  (`WINDOW_VIEWS`), five pickable views (street/city/woods/sea/space) in the
  paint tab, phase-aware repaints, storms only on the rainy street. Painters
  are seeded-deterministic; foreground content must stay above ~0.95h (the
  vertical parallax crop). `PHASES.lift` is now ~1.0 — the old 1.85 was
  compensation for the removed photo.
- **Profile/notebook** — cross-game progress + awards + key ring, `room-profile`.
- **THE HALLWAY (`js/hallway.js`)** — the first room of the house plan. The bedroom
  door is on a real hinge (`doorPivot` in room.js) and opens into a corridor built
  beyond the left wall — which now has an actual doorway cut in it (three pieces:
  `left`/`leftS`/`leftL`; the opening is z 1.64..2.56). Inside: the achievements
  PHOTO WALL (reads `PROFILE.profileState()` — earned awards hang as polaroids,
  unearned as dusty frames; `hall.refreshPhotos()` runs after every `evaluate()`),
  the seasonal hall closet (opens), stairs up (taped, "2027"), a real stairwell
  hole down to the basement (chained, cold glow), taped LIVING ROOM + KITCHEN
  doors with light spilling under them (the TV flicker is deliberate), the FRONT
  DOOR at the north end (fan-light, mail slot, WELCOME mat, December wreath), the
  rotary phone, and two bulbs with a working pull chain.
  **The space model:** every clickable carries `userData.space` ("bedroom" default,
  "hall", or "both" for the door). `pickAt`, `kbList` and the audit filter by
  `hall.space()` — that's how two rooms share one scene, one pick array, one
  camera. `hall.camTick()` owns the camera during the door walk and while
  standing in the hall (room.js's camera block is untouched otherwise);
  `hall.glowTick(t,dt,dim)` runs on the room's dimmer. Esc (or clicking the open
  doorway — invisible hitbox "your room") walks you home. State keys:
  `room-hall-seen`. ⚠️ Headless/pane testing: rAF throttling means the walk never
  advances on its own — drive `__room.hall.camTick(t, dt, 0, 0)` in a loop, same
  trick as everything else. ⚠️ Any new room module must join `sw.js` SHELL + bump
  CACHE (hallway = v8), per Iron Rule #1.

## 5. Testing & verification recipes (hard-won)

- **The Browser pane runs pages hidden**: rAF suspended (tick never runs — drive
  functions directly), timers clamped ≥1s, `innerWidth` can be 0 (shim via
  `defineProperty`), **`camera.aspect` boots NaN** (set + updateProjectionMatrix
  before projecting). Async GLBs raycast wrong until
  `scene.updateMatrixWorld(true)` + one `renderer.render()`.
- **Screenshots**: `computer{screenshot}` fails on WebGL. The page photographs
  itself: `renderer.setSize(1600,900,false)` → position camera → `render()` →
  `toDataURL()` **in the same synchronous task** → POST to a one-shot PowerShell
  HttpListener (`shot-receiver.ps1`, port 8409, param `-OutFile`; relaunch per
  shot) → Read the PNG. Never pipe base64 through tool results.
- **Module boot-death is SILENT**: if room.js throws mid-eval, `__room` never
  exists and no console error surfaces in the pane. Diagnose with
  `import("/games-hub/js/room.js?x=1").catch(e => e.stack)` — the rejection has
  the real error+line. `node --input-type=module --check < js/room.js` catches
  syntax only.
- **kidSay bubble detection**: the browser normalizes style attrs (adds spaces) —
  search for the text, not the exact style string.
- **Fingerprint refactors**: capture a ~19-field scene/state fingerprint before
  and after; prove noisy fields noisy before accepting drift.
- Balance/AI work in Age of Toys: see that project's own docs (`CLAUDE.md` at the
  workspace root is the Age of Toys bible).

## 5b. Rigging & animation — FREE, headless Blender

Blender 5.1.2 is installed (`C:\Program Files\Blender Foundation\Blender 5.1\`) and
everything can be scripted with `-b -P script.py`. **See `tools/blender/README.md`
for the full pipeline and every trap.** Rex is the worked example: 16 bones, heat
weights, idle + roar, done for 0 credits with no login or GUI.

Headline traps: AI bakes must be **merged by distance before binding** (heat
weighting fails *silently* on non-manifold geometry — assert 100% weighted);
Blender 5 replaced `action.fcurves` with slotted actions; bump `sw.js` CACHE when
a binary asset changes. Alternatives considered — Mixamo (Adobe login + drag UI),
Anything World (account + API key), AccuRIG (GUI only), Higgsfield rigging (8cr,
humanoid-only clip library) — none are needed.

## 6. Asset pipeline (Higgsfield MCP — when credits are available)

- Images: `nano_banana_2` (auto-swaps to flash), ~0–2cr, vet via `_min.webp`
  thumbnail (one Read) or montage several with sharp.
- 3D: `image_to_3d`, ~30cr flat, `should_texture:true`; rawUrl GLB has NO rig.
  Diet every bake: strip normal/occlusion maps (AI normals = dents), resample
  textures to 512 webp q88. ⚠️ `@gltf-transform/functions` clashes with sharp on
  this machine (ERR_DLOPEN) — use the manual NodeIO pattern (see
  `kid-fix.mjs`/`cat-diet` style scripts; permanent kit at `C:\Users\kylef\tools\gltf-kit`).
- Poster recipe: "Retro 1990s kids bedroom wall poster, painted gouache
  illustration: <scene>, bold title lettering reading <TITLE>, aged paper, no
  other text", 2:3, → 512×768 jpg q85 at `assets/tex/poster-<key>.jpg`.
  nano sometimes paints stray punctuation — patch locally with sharp, don't re-roll twice.
- **Always check `transactions` before batches** — prices drift, and parallel
  sessions spend from the same balance.

## 7. Current state (2026-07-27) & backlog

Everything described above is **built, verified, and live**. Recent arc: full
customization suite → themes/seasons → visual pass → PWA → kid onboarding →
refactor into modules → materials/cat/posters (Higgsfield) → cat life/earned
materials/movable frames/key ring → discoverability fixes (gold bar, sill
treasures, pings, news whisper).

**Parked / next candidates:**
- Chameleon was fully removed from the hub for copyright (computer shows a
  screensaver; a different game takes that slot someday). The public mirror repo
  `kylefriesmarketing/chameleon` still exists — Kyle's call.
- Kid voice lines (seed_audio ~0.8cr/line), poster art for future games, real key
  sales when Steam plan activates.
- ~~A second room through a door~~ — SHIPPED as the hallway (v8). Next: the rooms
  behind its taped doors, per `ROADMAP.md` + `CATALOG.md` at the workspace root
  (living room + basement are the 2026 openers; kid can't walk the hall yet; the
  duffel moves to the front door when the front yard opens).
- Refactor pass 3 candidates: kid state machine, drawer UI, storefront, tour
  (room.js is ~4,600 lines again).

## 8. How Kyle works (for a fresh assistant)

- Push to a **finished, verified, deployed** result; don't pause for check-ins on
  reversible work. Confirm irreversible/outward-facing things.
- He watches token spend: never read binaries, DOM-checks over screenshots when
  equivalent, slice big files.
- Batch Higgsfield work, confirm anything over ~25cr, check `transactions` first.
- He reports bugs plainly ("nothing spawns", "hard to see") — the cause is
  usually real but one level deeper than the report. Reproduce from the DEFAULT
  player camera before concluding anything.
- After any change: verify in-browser, screenshot proof where visual, THEN
  `git push`. The live site is the deliverable.
- His broader empire (Age of Toys + Godot port, Roblox games, client work, The
  Lunch Desk) is indexed in the assistant memory folder:
  `C:\Users\kylef\.claude\projects\C--Users-kylef-Downloads-New-folder\memory\`
  — `MEMORY.md` is the index; `games-hub-shelf.md` is this project's full log.
  If that folder is gone, this file is the seed: everything else is in the
  GitHub repos listed above.

*— end of handoff. The room is live, the light is on, the cat has the bed.*
