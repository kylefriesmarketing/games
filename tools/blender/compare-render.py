"""Side-by-side proof: does the rigged model still look like the original?

Renders the ORIGINAL trex and the RIGGED trex (at its animation rest frame) from an
identical camera, and reports material/UV/texture facts for both. If merging vertices
had broken the UVs, this is where it shows.

Run: blender.exe -b -P trex-compare.py -- <original.glb> <rigged.glb> <outdir>
"""
import bpy, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
ORIG, RIG, OUT = argv[0], argv[1], argv[2]
os.makedirs(OUT, exist_ok=True)

def describe(tag):
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        me = o.data
        uv = me.uv_layers.active
        mats = [m.name for m in me.materials if m]
        texs = []
        for m in me.materials:
            if not m or not m.use_nodes:
                continue
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    texs.append((n.image.name, tuple(n.image.size)))
        us = [l.uv[:] for l in uv.data[:200]] if uv else []
        print(f"{tag} {o.name}: verts={len(me.vertices)} loops={len(me.loops)} "
              f"uv_layer={'yes' if uv else 'NO'} mats={mats} textures={texs}")
        if us:
            print(f"{tag}   uv sample range x[{min(u[0] for u in us):.3f},{max(u[0] for u in us):.3f}] "
                  f"y[{min(u[1] for u in us):.3f},{max(u[1] for u in us):.3f}]")

def setup_scene():
    s = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            s.render.engine = eng; break
        except Exception:
            continue
    s.render.resolution_x = s.render.resolution_y = 600
    s.world = bpy.data.worlds.new("w"); s.world.use_nodes = True
    s.world.node_tree.nodes["Background"].inputs[0].default_value = (0.09, 0.11, 0.15, 1)
    tgt = bpy.data.objects.new("t", None); tgt.location = Vector((0, 0, 0))
    s.collection.objects.link(tgt)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    s.collection.objects.link(cam); s.camera = cam
    cam.location = Vector((2.2, -2.6, 0.85)); cam.data.lens = 50
    c = cam.constraints.new("TRACK_TO"); c.target = tgt
    c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
    for name, loc, e, sz in (("k", (3, -3, 4), 500, 4), ("f", (-3.5, -2, 1.5), 150, 5), ("r", (-1, 3.5, 2.5), 220, 3)):
        L = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        L.data.energy = e; L.data.size = sz; L.location = Vector(loc)
        lc = L.constraints.new("TRACK_TO"); lc.target = tgt
        lc.track_axis = "TRACK_NEGATIVE_Z"; lc.up_axis = "UP_Y"
        s.collection.objects.link(L)
    return s

# ---- original ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=ORIG)
describe("ORIG")
s = setup_scene()
s.render.filepath = os.path.join(OUT, "cmp_original.png")
bpy.ops.render.render(write_still=True)
print("rendered original")

# ---- rigged ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=RIG)
describe("RIG ")
print("STOWAWAYS", [o.name for o in bpy.data.objects
                    if o.type == "MESH" and not any(m.type == "ARMATURE" for m in o.modifiers)])
s = setup_scene()
s.frame_set(0)
s.render.filepath = os.path.join(OUT, "cmp_rigged.png")
bpy.ops.render.render(write_still=True)
print("rendered rigged")
print("COMPARE OK")
