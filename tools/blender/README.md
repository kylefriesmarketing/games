# Headless Blender rigging — the free pipeline

Rig and animate any GLB with **no credits, no service, no login, no GUI**. Blender
5.1.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`
and every step here runs with `-b` (background).

Proven on **rex** (`assets/props/trex.glb`, 2026-07-29): 16 bones, heat-weighted,
"idle" + "roar", visually identical to the original.

## The four steps

```bash
BL="/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"

# 1. MEASURE first — never guess bone positions
"$BL" -b -P analyze-mesh.py -- model.glb

# 2. Rig + animate (edit the bone table + keyframes for your model)
"$BL" -b -P rig-trex.py -- model.glb rigged.glb

# 3. Strip Blender's export stowaway, re-encode Draco (also shrinks the file)
node strip-stowaways.mjs rigged.glb final.glb

# 4. Prove it: deformation measured from the depsgraph + rendered frames
"$BL" -b -P verify-rig.py -- final.glb ./shots
"$BL" -b -P compare-render.py -- model.glb final.glb ./shots   # original vs rigged
```

## Traps, all paid for already

- ⚠️ **AI bakes cannot be heat-weighted as-is.** The T-rex shipped with 16,826
  non-manifold edges and 9,925 duplicate verts; bone-heat weighting fails on that
  and — this is the dangerous part — **fails SILENTLY**, weighting zero vertices
  while the operator still returns `FINISHED`. Merge by distance first (16,826 → 12
  non-manifold) and it binds 100%. Never skip the clean step; always assert
  `weighted == len(vertices)` and refuse to ship otherwise.
- ⚠️ **UVs survive the merge** because Blender stores them per face-corner. Proof:
  loop count is identical before and after (94,110), same material, same texture.
- ⚠️ **Blender 5 removed `action.fcurves`** (slotted actions). Iterate
  `action.layers[*].strips[*].channelbags[*].fcurves` instead.
- ⚠️ Re-importing the exported GLB into Blender shows a phantom `Icosphere`. It is
  an **importer-side artifact — it is NOT in the file** (verified with
  gltf-transform and by parsing the GLB's JSON chunk in the browser: 1 mesh, 1 skin).
  Don't chase it.
- ⚠️ A changed binary asset needs the **`sw.js` CACHE version bumped**, or the
  service worker serves the stale model and you debug a file the page never loaded.
- ⚠️ The room's `prop()` auto-plays `animations[0]`, so **name/order the idle first**
  and it animates with zero room-code changes. A second clip is driven by the
  prop's own `onReady(wrap, root, mixer, clips)` callback.
- Pose matters more than tooling: bake characters **standing, limbs clear of the
  body**. A curled-up sleeping model (our cat) cannot be usefully rigged by anything.

## What this replaces

Mixamo (needs an Adobe login and a marker-drag UI), Anything World (needs an account
+ API key), AccuRIG (GUI-only), and Higgsfield's 8cr rigging (humanoids only — its
clip library is biped-only). This does all of it, for any creature, free.

## Authored basement den

`build-den.py` preserves the original couch silhouette and UVs, bakes a corduroy normal map, fits a tartan throw against the cushion mesh, and builds matching arcade chassis. It exports `den-sofa.glb`, `den-arcade-rift.glb`, and `den-arcade-issue.glb`. Source .blend files and temporary bake images go to a separate work directory.

Run Blender in background mode with `-P tools/blender/build-den.py -- <games-hub> <work-directory>`, then run `node tools/blender/pack-den.cjs <gltf-kit/node_modules> <sharp/node_modules> <games-hub>` to pack the sofa textures as WebP. Dependencies: Blender with NumPy, @gltf-transform/core and extensions, draco3dgltf, and sharp.

The cabinet static geometry is batched by material (six mesh draws per cabinet, plus the two live art planes). Named ScreenSocket and MarqueeSocket carry the mounting transforms. Three.js planes need local X rotation -PI/2 to account for Blender's Z-up basis. StartButton retains the one-shot press_start animation; the room triggers it on approach and respects reduced motion. DenAfghan owns its binding and fringe so the existing stash choices hide the whole throw and restore correctly after asynchronous loading.

Validation: render from standing and oblique camera angles; check both game portals and return; cycle all blanket choices and reload with folded-away saved; verify the button moves and returns; verify reduced-motion prevents the press. The general room audit currently mistakes the roaming char1 in the basement for bedroom geometry penetrating its ceiling; compare findings against the previous revision.

## Complete den finish library

The second den pass is authored by `build-den-room.py` and exports `assets/props/house/den-craft.glb`. It reads `den-source.json`, a snapshot of the original procedural geometry only. Higgsfield fallbacks are marked at propSwap registration and excluded; the portable TV, ping-pong table, exercise bike, previous sofa and arcade GLBs are untouched.

Run `Blender -b -P tools/blender/build-den-room.py -- <games-hub> <work-directory>`. It reuses the mesh helpers in build-den.py without running that script's sofa/cabinet jobs. The editable .blend is written to the work directory. To refresh source after geometry changes, open the game with `?denAuthor=1`, wait for boot, and save `JSON.stringify(__room.hall.den.export())` as den-source.json. The author flag keeps procedural geometry available for export.

Runtime integration is in `js/den.js`. Geometry is swapped into the original meshes so callbacks, material references, saved settings and fish movement survive. Stable keys derive from the original geometry and transforms; all 152 keys must match. Four dynamic arcade screen/marquee planes are explicitly excluded because their mount callbacks still need their original geometry parameters. Other live screens, labels, water and seasonal lights keep their own materials. Blender UV V is inverted before export so the original Three.js canvas textures remain upright.

The library includes 14 groups of fittings plus room trim: coffee-table shelf and mug, cigar-box hardware, console and controller details, record-console cloth/dials/tonearm and open crate, aquarium frame/cabinet/plants/filter, heater fittings, furnace louvers and duct transition, neon frame/shelf brackets/bottle labels, Halloween box and string wiring, toy-soldier details, lampshade/foot, hopper-window frame, column plates, rolled-rug bindings, baseboards, outlets, duct seams, storage labels, poster frames and a lower stair handrail. Small static details are batched by material per furniture anchor.

Den surfaces stay code-authored so existing customization remains available: walnut grain, woven rug, concrete with subtle slab joints, nostalgic prints and board-game cover. The concrete's default map is restored by the existing room-reset path. The aquarium now faces into the room and clears the east wall; fish movement runs in the aquarium group's local space.

Validation: all source bindings applied; five game portals launch and return; TV/tank/afghan settings cycle and persist after reload; floor reset restores its default map; no browser errors. Standing and close views cover seating, records, aquarium, TV cart, utility corner, storage and the overall room. The existing whole-house audit still flags the roaming char1 below the bedroom as a ceiling penetration, as it did before this pass.
