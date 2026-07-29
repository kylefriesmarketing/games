"""Rig + animate the toy T-rex, headless. No GUI, no service, no credits.

Bone positions come from measuring the actual vertex cloud (trex-analyze.py):
Blender is Z-up after glTF import, so head is at -Y around z=+0.5, the tail sweeps
to +Y and drops to the floor, feet sit at x=+-0.21, ground is z=-0.717.

⚠️ The AI bake ships with 16,826 non-manifold edges (9,925 duplicated verts), and
bone-heat weighting cannot solve on that — it silently weights NOTHING. Merging by
distance first drops it to 12 and heat then binds 100% of vertices. Do not remove
the clean step. UVs survive because Blender stores them per face-corner.

Two glTF animations: "idle" (breathing + tail sway + head drift, loops seamlessly)
and "roar" (wind up, lunge, shake out, settle).

Run: blender.exe -b -P trex-rig.py -- <in.glb> <out.glb>
"""
import bpy, sys, math, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, DST = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
mesh = meshes[0]
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("MESH", mesh.name, "verts", len(mesh.data.vertices), "dims", [round(v, 3) for v in mesh.dimensions])

# ---- clean the bake so heat weighting can solve --------------------------------
bm = bmesh.new(); bm.from_mesh(mesh.data)
nm_before = sum(1 for e in bm.edges if not e.is_manifold); bm.free()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.0002)
bpy.ops.mesh.delete_loose()
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
bm = bmesh.new(); bm.from_mesh(mesh.data)
nm_after = sum(1 for e in bm.edges if not e.is_manifold); bm.free()
print("CLEAN non-manifold", nm_before, "->", nm_after, "| verts now", len(mesh.data.vertices))

# ---- skeleton, in metres, measured off the vertex cloud ------------------------
GROUND = -0.717
B = [
    ("root",     (0, 0.00, GROUND),      (0, -0.18, GROUND),     None,      False),
    ("hips",     (0, -0.10, -0.10),      (0, -0.30,  0.02),      "root",    False),
    ("spine",    (0, -0.30,  0.02),      (0, -0.48,  0.22),      "hips",    True),
    ("chest",    (0, -0.48,  0.22),      (0, -0.60,  0.40),      "spine",   True),
    ("neck",     (0, -0.60,  0.40),      (0, -0.74,  0.50),      "chest",   True),
    ("head",     (0, -0.74,  0.50),      (0, -0.94,  0.47),      "neck",    True),
    ("tail01",   (0, -0.10, -0.10),      (0,  0.12, -0.20),      "hips",    False),
    ("tail02",   (0,  0.12, -0.20),      (0,  0.34, -0.36),      "tail01",  True),
    ("tail03",   (0,  0.34, -0.36),      (0,  0.56, -0.52),      "tail02",  True),
    ("tail04",   (0,  0.56, -0.52),      (0,  0.88, -0.57),      "tail03",  True),
]
for s, x in ((".L", 1), (".R", -1)):
    B += [
        ("thigh" + s, (x * 0.16, -0.22, -0.06), (x * 0.19, -0.30, -0.40), "hips",       False),
        ("shin" + s,  (x * 0.19, -0.30, -0.40), (x * 0.21, -0.24, -0.62), "thigh" + s,  True),
        ("foot" + s,  (x * 0.21, -0.24, -0.62), (x * 0.21, -0.42, GROUND), "shin" + s,  True),
    ]

arm_data = bpy.data.armatures.new("trex_rig")
arm = bpy.data.objects.new("trex_rig", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for name, head, tail, parent, conn in B:
    b = arm_data.edit_bones.new(name)
    b.head = Vector(head); b.tail = Vector(tail)
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = conn
bpy.ops.object.mode_set(mode="OBJECT")
print("BONES", len(arm_data.bones))

# ---- bind ----------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
weighted = sum(1 for v in mesh.data.vertices if v.groups)
print("BIND weighted", weighted, "of", len(mesh.data.vertices))
if weighted < len(mesh.data.vertices):
    raise SystemExit("BIND FAILED — refusing to ship a half-skinned mesh")

# ---- animation -----------------------------------------------------------------
FPS = 24
bpy.context.scene.render.fps = FPS
pb = arm.pose.bones

def fcurves_of(act):        # Blender 5: actions are slotted — no act.fcurves any more
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    yield fc

def key(bone, frame, rot=None, loc=None):
    b = pb[bone]
    b.rotation_mode = "XYZ"
    if rot is not None:
        b.rotation_euler = [math.radians(a) for a in rot]
        b.keyframe_insert("rotation_euler", frame=frame)
    if loc is not None:
        b.location = Vector(loc)
        b.keyframe_insert("location", frame=frame)

def new_action(name):
    for b in pb:
        b.rotation_mode = "XYZ"
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
    return act

# --- idle: a plastic dinosaur standing guard. He breathes; the tail drifts. ---
IDLE = 96                                   # 4.0s — one full sine cycle, so it loops clean
act_idle = new_action("idle")
for f in range(0, IDLE + 1, 8):
    p = f / IDLE * math.tau
    breath = math.sin(p * 2)                # two breaths per loop
    sway = math.sin(p)
    key("chest", f, rot=(breath * 1.6, 0, 0))
    key("spine", f, rot=(breath * 0.9, 0, 0))
    key("hips",  f, rot=(0, 0, sway * 1.1), loc=(0, 0, breath * 0.004))
    # each tail segment lags the one before it, so the sway travels down the tail
    key("tail01", f, rot=(0, 0, math.sin(p - 0.35) * 3.4))
    key("tail02", f, rot=(0, 0, math.sin(p - 0.70) * 4.6))
    key("tail03", f, rot=(0, 0, math.sin(p - 1.05) * 5.6))
    key("tail04", f, rot=(0, 0, math.sin(p - 1.40) * 6.4))
    key("neck", f, rot=(breath * -1.2, 0, math.sin(p + 0.6) * -2.2))
    key("head", f, rot=(math.sin(p * 2 + 1.0) * 1.8, 0, math.sin(p + 0.9) * -2.6))
for fc in fcurves_of(act_idle):
    m = fc.modifiers.new("CYCLES"); m.mode_before = m.mode_after = "REPEAT"
arm.animation_data.action = None

# --- roar: wind up, lunge, shake it out, back to guard ---
act_roar = new_action("roar")
POSE = {
    0:  {"neck": (0, 0, 0),   "head": (0, 0, 0),    "chest": (0, 0, 0),   "spine": (0, 0, 0),
         "tail02": (0, 0, 0), "tail03": (0, 0, 0),  "hips": (0, 0, 0)},
    10: {"neck": (14, 0, 0),  "head": (10, 0, 0),   "chest": (7, 0, 0),   "spine": (4, 0, 0),
         "tail02": (-6, 0, 0), "tail03": (-9, 0, 0), "hips": (3, 0, 0)},
    18: {"neck": (-26, 0, 0), "head": (-30, 0, 0),  "chest": (-13, 0, 0), "spine": (-8, 0, 0),
         "tail02": (11, 0, 0), "tail03": (15, 0, 0), "hips": (-6, 0, 0)},
    26: {"neck": (-20, 0, 5), "head": (-25, 0, -6), "chest": (-10, 0, 0), "spine": (-6, 0, 0),
         "tail02": (8, 0, 7),  "tail03": (12, 0, 10), "hips": (-4, 0, 0)},
    34: {"neck": (-10, 0, -4), "head": (-14, 0, 5), "chest": (-5, 0, 0),  "spine": (-3, 0, 0),
         "tail02": (4, 0, -6), "tail03": (6, 0, -8), "hips": (-2, 0, 0)},
    48: {"neck": (0, 0, 0),   "head": (0, 0, 0),    "chest": (0, 0, 0),   "spine": (0, 0, 0),
         "tail02": (0, 0, 0), "tail03": (0, 0, 0),  "hips": (0, 0, 0)},
}
for f, bones in POSE.items():
    for bone, rot in bones.items():
        key(bone, f, rot=rot)
arm.animation_data.action = None
print("ACTIONS", [a.name for a in bpy.data.actions])

# ---- export --------------------------------------------------------------------
# ⚠️ export ONLY the mesh + armature. Exporting the whole scene while animations are
# enabled smuggles a stray 42-vert node into the GLB (reproduced: it is absent when
# export_animations=False). use_selection keeps the file to exactly what we built.
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=DST,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",   # every action becomes its own named glTF animation
    export_skins=True,
    export_yup=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)
print("EXPORTED", DST)
