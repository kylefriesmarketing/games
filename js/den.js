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
  Object.assign(ctx.anchors.coffee.userData,{name:'the coffee table',action:null,hint:'rings from mugs. a shelf for things you will read later.'});
  ctx.clickable(ctx.named.coffeeTop,'the coffee table',null,ctx.anchors.coffee.userData.hint);
  ctx.clickable(ctx.named.aquariumCabinet,'the aquarium',null,'two fish, a small jungle, and the cold green glow.');
  state.defaultFloor = finishSurfaces(ctx, sources);
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

function finishSurfaces(ctx, sources) {
  let seed=127;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const grain=canvasTex(512,128,(c,w,h)=>{
    c.fillStyle='#d9cabb';c.fillRect(0,0,w,h);
    for(let i=0;i<160;i++) {const y=random()*h;c.strokeStyle=i%3?'rgba(42,27,16,.12)':'rgba(255,245,220,.22)';c.lineWidth=.3+random();c.beginPath();c.moveTo(0,y);c.bezierCurveTo(w*.3,y+random()*12-6,w*.7,y-5,w,y+3);c.stroke();}
  });
  for(const k of ['coffeeTop','recordBody','recordCrate','cigarBody','cigarLid','aquariumCabinet']) {
    const m=ctx.named[k].material;m.map=grain;m.roughness=.72;m.needsUpdate=true;
  }
  const concrete=canvasTex(512,512,(c,w,h)=>{
    c.fillStyle='#96968f';c.fillRect(0,0,w,h);
    for(let i=0;i<17000;i++) {const n=80+random()*130;c.fillStyle=`rgba(${n},${n},${n},.12)`;c.fillRect(random()*w,random()*h,1+random()*2,1+random()*2);}
    for(let i=0;i<40;i++){const x=random()*w,y=random()*h,r=20+random()*80,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(45,42,36,.13)');g.addColorStop(1,'rgba(45,42,36,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  });
  const cc=concrete.image.getContext('2d');cc.strokeStyle='rgba(48,47,42,.28)';cc.lineWidth=1.2;cc.strokeRect(1,1,510,510);concrete.needsUpdate=true;
  ctx.named.lampShade.material.color.setHex(0xa38c6c);
  concrete.wrapS=concrete.wrapT=THREE.RepeatWrapping;concrete.repeat.set(5.35,3.5);
  ctx.named.floor.userData.noHighlight=true;
  ctx.named.floor.material.map=concrete;ctx.named.floor.material.needsUpdate=true;
  const rug=canvasTex(768,576,(c,w,h)=>{
    c.fillStyle='#633b31';c.fillRect(0,0,w,h);
    const colors=['#b49461','#324e4d','#b49461','#714b38','#c1a173'];
    colors.forEach((col,i)=>{c.strokeStyle=col;c.lineWidth=i===1?15:4;c.strokeRect(16+i*10,16+i*10,w-32-i*20,h-32-i*20);});
    const diamond=(x,y,r,col)=>{c.fillStyle=col;c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r*.72,y);c.lineTo(x,y+r);c.lineTo(x-r*.72,y);c.closePath();c.fill();};
    for(let x=96;x<w-70;x+=64)for(const y of [40,h-40])diamond(x,y,13,'#c0a371');
    for(let y=90;y<h-65;y+=58)for(const x of [40,w-40])diamond(x,y,12,'#c0a371');
    diamond(w/2,h/2,178,'#c0a371');diamond(w/2,h/2,166,'#324e4d');diamond(w/2,h/2,105,'#b78c58');diamond(w/2,h/2,91,'#754434');diamond(w/2,h/2,30,'#c0a371');
    for(const x of [155,w-155])for(const y of [140,h-140]){diamond(x,y,37,'#a77b50');diamond(x,y,25,'#324e4d');}
    c.globalAlpha=.13;for(let y=0;y<h;y+=2){c.fillStyle=y%4?'#ead9bd':'#221c18';c.fillRect(0,y,w,1);}c.globalAlpha=1;
    for(let i=0;i<14000;i++){c.fillStyle=i%2?'rgba(240,226,200,.035)':'rgba(0,0,0,.04)';c.fillRect(random()*w,random()*h,2,1);}
  });
  ctx.named.rug.material.map=rug;ctx.named.rug.material.needsUpdate=true;
  // The fish stay in the existing animation loop; clearer glass reveals the habitat.
  ctx.preserve.filter(o=>o.userData.name==='the aquarium').forEach(o=>{o.material.opacity=o.material.emissiveIntensity>0?.09:.16;o.material.depthWrite=false;o.material.needsUpdate=true;});
  sources.filter(s=>s.mesh.userData.name==='the posters').forEach(({mesh:o},i)=>{
    o.material.map=canvasTex(384,512,(c,w,h)=>{
      c.fillStyle=i?'#234a45':'#203b59';c.fillRect(0,0,w,h);c.strokeStyle='#d7b77a';c.lineWidth=3;c.strokeRect(18,18,w-36,h-36);
      c.textAlign='center';c.fillStyle='#efe0bd';c.font='bold 34px Georgia';c.fillText(i?'LAKESIDE':'SPRING FLING',w/2,77);c.font='19px Georgia';c.fillText(i?'the long way home':"CLASS OF ’96",w/2,108);
      c.fillStyle='#d7b77a';c.beginPath();c.arc(263,214,42,0,Math.PI*2);c.fill();
      c.fillStyle=i?'#376b60':'#476784';c.beginPath();c.moveTo(35,342);c.lineTo(142,184);c.lineTo(230,313);c.lineTo(300,241);c.lineTo(349,342);c.fill();
      c.fillStyle='#172e39';c.beginPath();c.moveTo(35,348);c.lineTo(192,234);c.lineTo(349,348);c.fill();c.fillRect(35,348,314,91);
      c.strokeStyle='#b8c1ad';c.lineWidth=2;for(let j=0;j<8;j++){c.beginPath();c.moveTo(78+j*8,363+j*8);c.lineTo(304-j*6,363+j*8);c.stroke();}
      c.fillStyle='#d7b77a';c.font='14px Georgia';c.fillText(i?'KEEP A LITTLE OF THE SUMMER':'ONE NIGHT. EVERYBODY THERE.',w/2,471);
    });o.material.needsUpdate=true;
  });
  const game=ctx.named.boardgame;
  const cover=new THREE.Mesh(new THREE.PlaneGeometry(.342,.241),new THREE.MeshStandardMaterial({roughness:.78,map:canvasTex(512,360,(c,w,h)=>{
    c.fillStyle='#254660';c.fillRect(0,0,w,h);c.strokeStyle='#dab36d';c.lineWidth=9;c.strokeRect(18,18,w-36,h-36);c.textAlign='center';c.fillStyle='#f2ddac';c.font='bold 67px Georgia';c.fillText('GAME NIGHT',w/2,102);c.font='22px Georgia';c.fillText('A FAMILY TRADITION OF DISAGREEMENT',w/2,142);
    for(let i=0;i<3;i++){const x=124+i*112;c.fillStyle=['#a74632','#d5aa59','#427469'][i];c.fillRect(x-39,191,78,78);c.fillStyle='#f3e5cc';for(let d=0;d<=i;d++){c.beginPath();c.arc(x-18+d*18,214+d*16,7,0,Math.PI*2);c.fill();}}c.fillStyle='#dbc59b';c.font='18px Georgia';c.fillText('2–6 PLAYERS • AGES 8 AND UP',w/2,319);
  })}));
  cover.position.y=.0308;cover.rotation.x=-Math.PI/2;game.add(cover);ctx.clickable(cover,game.userData.name,game.userData.action,game.userData.hint);
  return concrete;
}

