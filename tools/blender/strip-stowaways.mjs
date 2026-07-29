/* Blender's glTF exporter smuggles a stray unskinned node into the file when
 * animations are exported (reproduced: absent with export_animations=false, and
 * use_selection does NOT prevent it). This drops any mesh node that carries no
 * skin weights — our rigged file should contain exactly one skinned mesh.
 *
 *   node strip-stowaways.mjs in.glb out.glb
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { statSync } from "fs";

const [, , IN, OUT] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});
const doc = await io.read(IN);
const root = doc.getRoot();

console.log("before: nodes", root.listNodes().length, "meshes", root.listMeshes().length,
  "skins", root.listSkins().length, "animations", root.listAnimations().length);

let dropped = 0;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const skinned = mesh.listPrimitives().some((p) => p.getAttribute("JOINTS_0"));
  if (skinned) continue;
  console.log("  dropping unskinned node:", node.getName() || "(unnamed)",
    "verts", mesh.listPrimitives().reduce((s, p) => s + (p.getAttribute("POSITION")?.getCount() || 0), 0));
  node.dispose();
  mesh.dispose();
  dropped++;
}

// clear anything now orphaned (the stray's accessors/buffers)
for (const mesh of root.listMeshes()) {
  if (mesh.listParents().filter((p) => p.propertyType === "Node").length === 0) mesh.dispose();
}
for (const acc of root.listAccessors()) {
  if (acc.listParents().filter((p) => p.propertyType !== "Root").length === 0) acc.dispose();
}

console.log("after : nodes", root.listNodes().length, "meshes", root.listMeshes().length,
  "skins", root.listSkins().length, "animations", root.listAnimations().length,
  "| dropped", dropped);
console.log("animations:", root.listAnimations().map((a) => a.getName()).join(", "));

await io.write(OUT, doc);
console.log("wrote", OUT, statSync(OUT).size, "bytes (in was", statSync(IN).size + ")");
