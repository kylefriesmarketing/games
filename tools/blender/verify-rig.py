"""Verify the rigged GLB and render proof frames.

Re-imports the exported file (so we test what ships), finds the mesh that is ACTUALLY
skinned, measures real deformation from the evaluated depsgraph, and renders with the
camera aimed by a TRACK_TO constraint and framed on the real bounding box.

Run: blender.exe -b -P trex-verify.py -- <glb> <outdir>
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
GLB, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)

print("--- objects ---")
for o in bpy.data.objects:
    info = f"{o.name:22s} type={o.type:9s} parent={o.parent.name if o.parent else '-':12s}"
    if o.type == "MESH":
        info += f" verts={len(o.data.vertices):6d} vgroups={len(o.vertex_groups):3d}"
        info += f" mods={[m.type for m in o.modifiers]}"
    if o.type == "ARMATURE":
        info += f" bones={len(o.data.bones)}"
    print(info)

skinned = [o for o in bpy.data.objects
           if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]
print("SKINNED MESHES", [o.name for o in skinned])
if not skinned:
    raise SystemExit("!! nothing is skinned — export lost the armature binding")
mesh = skinned[0]
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
print("ANIMATIONS", [a.name for a in bpy.data.actions])
print("BONES", len(arm.data.bones), "| vgroups on skinned mesh", len(mesh.vertex_groups))

# ---- real deformation measurement -------------------------------------------
def eval_pts(frame, action):
    for a in bpy.data.actions:
        if action in a.name:
            arm.animation_data_create(); arm.animation_data.action = a
            break
    bpy.context.scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    pts = [mw @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts

base = eval_pts(0, "roar")
mn = Vector((min(p.x for p in base), min(p.y for p in base), min(p.z for p in base)))
mx = Vector((max(p.x for p in base), max(p.y for p in base), max(p.z for p in base)))
ctr = (mn + mx) / 2
print("BBOX", [round(v, 3) for v in mn], [round(v, 3) for v in mx], "centre", [round(v, 3) for v in ctr])

print("\n--- deformation across the roar (max + mean vertex travel vs frame 0) ---")
for f in (10, 18, 26, 34, 48):
    pts = eval_pts(f, "roar")
    deltas = [(a - b).length for a, b in zip(pts, base)]
    print(f"frame {f:2d}  max {max(deltas):.4f}  mean {sum(deltas)/len(deltas):.4f}")
print("\n--- deformation across the idle ---")
ibase = eval_pts(0, "idle")
for f in (24, 48, 72, 96):
    pts = eval_pts(f, "idle")
    deltas = [(a - b).length for a, b in zip(pts, ibase)]
    print(f"frame {f:2d}  max {max(deltas):.4f}  mean {sum(deltas)/len(deltas):.4f}")
# a clean loop means frame 96 == frame 0
loop = [(a - b).length for a, b in zip(eval_pts(96, "idle"), ibase)]
print("LOOP SEAM max drift", round(max(loop), 5), "(0 = seamless)")

# ---- render ------------------------------------------------------------------
scene = bpy.context.scene
engines = [e.bl_rna.identifier for e in bpy.types.RenderEngine.__subclasses__()] if False else None
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
    try:
        scene.render.engine = eng
        break
    except Exception:
        continue
print("ENGINE", scene.render.engine)
if scene.render.engine == "BLENDER_WORKBENCH":
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
scene.render.resolution_x = scene.render.resolution_y = 460
scene.world = bpy.data.worlds.new("w"); scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.09, 0.11, 0.15, 1)

target = bpy.data.objects.new("target", None)
target.location = ctr
scene.collection.objects.link(target)

cam_data = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam); scene.camera = cam
radius = max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z)
cam.location = ctr + Vector((radius * 1.5, -radius * 1.7, radius * 0.55))
cam_data.lens = 50
con = cam.constraints.new("TRACK_TO"); con.target = target
con.track_axis = "TRACK_NEGATIVE_Z"; con.up_axis = "UP_Y"

for name, loc, energy, size in (("key", (3, -3, 4), 500, 4), ("fill", (-3.5, -2, 1.5), 150, 5),
                                ("rim", (-1, 3.5, 2.5), 220, 3)):
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    L.data.energy = energy; L.data.size = size
    L.location = Vector(loc)
    lc = L.constraints.new("TRACK_TO"); lc.target = target
    lc.track_axis = "TRACK_NEGATIVE_Z"; lc.up_axis = "UP_Y"
    scene.collection.objects.link(L)

def render(action, frames, tag):
    for a in bpy.data.actions:
        if action in a.name:
            arm.animation_data_create(); arm.animation_data.action = a
            break
    for f in frames:
        scene.frame_set(f)
        scene.render.filepath = os.path.join(OUT, f"{tag}_{f:03d}.png")
        bpy.ops.render.render(write_still=True)
    print("RENDERED", tag, frames)

render("idle", [0, 24, 48, 72], "idle")
render("roar", [0, 10, 18, 26], "roar")
print("VERIFY OK")
