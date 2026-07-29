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
