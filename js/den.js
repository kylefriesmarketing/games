/* Blender craftsmanship for the den. Existing meshes keep their identity, material,
 * saved state and callbacks; the authored library supplies geometry and joinery. */
import * as THREE from 'three';
import { canvasTex } from './util.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export function craftDen(ctx) {
  ctx.parent.updateMatrixWorld(true);
  const sources = [], byKey = new Map(), preserve = new Set(ctx.preserve);
  const names = new Map(Object.entries(ctx.named).map(([k, v]) => [v, k]));
  const hash = s => { let h = 2166136261; for (let i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),16777619); return (h>>>0).toString(16); };
  ctx.roots.forEach(root => root.traverse(o => {
    if (!o.isMesh || o.userData.bakedFallback || preserve.has(o) || !o.geometry.attributes.position) return;
    let p=o.parent; while(p && p!==ctx.parent) { if(p.userData.bakedFallback) return; p=p.parent; }
    if (Array.isArray(o.material) || o.material.opacity===0 || o.material.depthWrite===false) return;
    const sig=JSON.stringify([o.geometry.type,o.geometry.parameters,o.matrixWorld.elements.map(n=>+n.toFixed(5)),o.userData.name||'']);
    const key=names.get(o)||'den_'+hash(sig);
    if(byKey.has(key)) return;
    sources.push({key,mesh:o}); byKey.set(key,o); o.userData.denCraftKey=key;
  }));
  const state={sources,ready:false,applied:0,details:0,export:()=>({
    sources:sources.map(({key,mesh:o})=>({key,type:o.geometry.type,parameters:o.geometry.parameters,
      positions:Array.from(o.geometry.attributes.position.array),uv:o.geometry.attributes.uv?Array.from(o.geometry.attributes.uv.array):null,
      indices:o.geometry.index?Array.from(o.geometry.index.array):null,
      matrix:o.matrixWorld.elements,label:o.userData.name||'',color:o.material.color?.getHexString(),mapped:!!o.material.map})),
    anchors:Object.fromEntries(Object.entries(ctx.anchors).map(([k,o])=>[k,o.matrixWorld.elements]))
  })};
  finishSurfaces(ctx, sources);
  if(new URLSearchParams(location.search).has('denAuthor')) return state;
  const draco=new DRACOLoader(); draco.setDecoderPath('assets/lib/draco/');
  const loader=new GLTFLoader(); loader.setDRACOLoader(draco);
  ctx.boot.glb();
  loader.load('assets/props/house/den-craft.glb',g=>{
    try {
      g.scene.traverse(o=>{
        if(!o.isMesh) return;
        const original=byKey.get(o.name);
        if(original) { original.geometry=o.geometry; state.applied++; }
      });
      for(const [key,anchor] of Object.entries(ctx.anchors)) {
        const detail=g.scene.getObjectByName('detail_'+key);
        if(!detail) continue;
        anchor.add(detail); state.details++;
        let proto=anchor.userData.name?anchor:null;
        if(!proto) anchor.traverse(o=>{if(!proto&&o.userData.name) proto=o;});
        detail.traverse(o=>{if(o.isMesh&&proto) ctx.clickable(o,proto.userData.name,proto.userData.action,proto.userData.hint);});
      }
      const room=g.scene.getObjectByName('detail_room');
      if(room) ctx.parent.add(room);
      state.ready=true;
    } catch(e) { console.warn('Den craftsmanship failed',e); }
    finally { ctx.boot.glbDone(); draco.dispose(); }
  },undefined,()=>{ctx.boot.glbDone();draco.dispose();});
  return state;
}
