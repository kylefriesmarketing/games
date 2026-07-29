"""Measure the T-rex before rigging him.

Auto-rigging fails when bones are guessed. This finds the real anatomy from the
vertex cloud: which way he faces, where the legs are, where the spine runs, how
far the tail and head reach. Read-only.

Run: blender.exe -b -P trex-analyze.py -- <glb>
"""
import bpy, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
print("MESHES", len(meshes), [m.name for m in meshes])

# world-space vertex cloud of everything
pts = []
for m in meshes:
    mw = m.matrix_world
    for v in m.data.vertices:
        pts.append(mw @ v.co)
print("VERTS", len(pts))

mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
size = mx - mn
print("BBOX min", [round(v, 3) for v in mn], "max", [round(v, 3) for v in mx])
print("SIZE", [round(v, 3) for v in size])
# Blender is Z-up; glTF Y-up gets converted on import, so Z = height here
print("HEIGHT_AXIS z =", round(size.z, 3), "| footprint x =", round(size.x, 3), "y =", round(size.y, 3))

# Slice up the height and report the horizontal extent + centroid of each band.
# Legs = narrow low bands; body = wide middle; head/tail = the extremes in the long axis.
print("\n--- height bands (z) : count, x-range, y-range, centroid ---")
NB = 12
for i in range(NB):
    z0 = mn.z + size.z * i / NB
    z1 = mn.z + size.z * (i + 1) / NB
    band = [p for p in pts if z0 <= p.z < z1]
    if not band:
        print(f"band {i:2d} z[{z0:.3f},{z1:.3f}] EMPTY")
        continue
    bx = [p.x for p in band]; by = [p.y for p in band]
    cx = sum(bx) / len(bx); cy = sum(by) / len(by)
    print(f"band {i:2d} z[{z0:.3f},{z1:.3f}] n={len(band):5d} "
          f"x[{min(bx):+.3f},{max(bx):+.3f}] y[{min(by):+.3f},{max(by):+.3f}] c=({cx:+.3f},{cy:+.3f})")

# Which horizontal axis is "long" (nose-to-tail)?
long_axis = "y" if size.y > size.x else "x"
print("\nLONG_AXIS (nose-to-tail) =", long_axis)

# Walk the long axis: where is the mass? The tail end is thin+low, the head end is
# higher and also thinnish; the hips are the tallest, widest section.
print(f"\n--- {long_axis} bands : count, z-range, width, centroid_z ---")
lo = getattr(mn, long_axis); hi = getattr(mx, long_axis)
NL = 14
for i in range(NL):
    a0 = lo + (hi - lo) * i / NL
    a1 = lo + (hi - lo) * (i + 1) / NL
    band = [p for p in pts if a0 <= getattr(p, long_axis) < a1]
    if not band:
        print(f"seg {i:2d} [{a0:+.3f},{a1:+.3f}] EMPTY")
        continue
    zs = [p.z for p in band]
    other = "x" if long_axis == "y" else "y"
    os_ = [getattr(p, other) for p in band]
    print(f"seg {i:2d} [{a0:+.3f},{a1:+.3f}] n={len(band):5d} "
          f"z[{min(zs):.3f},{max(zs):.3f}] {other}_width={max(os_) - min(os_):.3f} cz={sum(zs)/len(zs):+.3f}")

# Foot-level footprint: cluster the lowest 12% of verts left/right to locate the two feet.
print("\n--- feet (lowest 12% of height) ---")
foot_cut = mn.z + size.z * 0.12
feet = [p for p in pts if p.z <= foot_cut]
if feet:
    other = "x" if long_axis == "y" else "y"
    vals = sorted(getattr(p, other) for p in feet)
    mid = (vals[0] + vals[-1]) / 2
    left = [p for p in feet if getattr(p, other) < mid]
    right = [p for p in feet if getattr(p, other) >= mid]
    for name, grp in (("A", left), ("B", right)):
        if not grp: continue
        print(f"foot {name}: n={len(grp)} "
              f"x=({min(p.x for p in grp):+.3f}..{max(p.x for p in grp):+.3f}) "
              f"y=({min(p.y for p in grp):+.3f}..{max(p.y for p in grp):+.3f}) "
              f"centroid=({sum(p.x for p in grp)/len(grp):+.3f},"
              f"{sum(p.y for p in grp)/len(grp):+.3f},{sum(p.z for p in grp)/len(grp):+.3f})")
print("ANALYZE OK")
