// Run after build-den.py: node pack-den.cjs <gltf-kit/node_modules> <sharp/node_modules> <games-hub>
const fs = require('fs'), path = require('path');
const [mods, imageMods, root] = process.argv.slice(2);
const { NodeIO } = require(path.resolve(mods, '@gltf-transform/core'));
const { ALL_EXTENSIONS, EXTTextureWebP } = require(path.resolve(mods, '@gltf-transform/extensions'));
const draco = require(path.resolve(mods, 'draco3dgltf'));
const sharp = require(path.resolve(imageMods, 'sharp'));
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
    'draco3d.encoder': await draco.createEncoderModule()
  });
  const file = path.resolve(root, 'assets/props/house/den-sofa.glb');
  const doc = await io.read(file);
  for (const t of doc.getRoot().listTextures()) {
    const bytes = await sharp(Buffer.from(t.getImage())).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
    t.setImage(bytes).setMimeType('image/webp');
  }
  doc.createExtension(EXTTextureWebP).setRequired(true);
  await io.write(file, doc);
  console.log('Packed sofa:', fs.statSync(file).size, 'bytes');
})().catch(e => { console.error(e); process.exitCode = 1; });
