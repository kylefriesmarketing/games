/* ============================================================================
 * THE ROOM — a 90s bedroom you can click. Every object is a doorway:
 * the bookshelf holds the stories (spines out, like a real shelf), the toy
 * chest holds the RTS, the brain on the desk is Brainrot Inc, the beige PC is
 * Chameleon 3D, the TV is the channel guide (list view), and the notebook
 * knows your progress across every game on this origin.
 * Three.js primitives + generated textures + a few generated GLB hero props.
 * ES module: three + loaders resolve via the importmap in index.html.
 * ========================================================================== */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

(function () {
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) { document.body.classList.add("no3d"); return; }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById("room").appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c12);
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.72, 4.9);
  var lookAt = new THREE.Vector3(0, 1.2, -0.4);
  camera.lookAt(lookAt);

  /* ---- helpers ---------------------------------------------------------- */
  function mat(color, rough) { return new THREE.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.9 : rough }); }
  function box(w, h, d, m) { var g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.castShadow = g.receiveShadow = true; return g; }
  function canvasTex(w, h, draw) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  var texLoader = new THREE.TextureLoader();
  // Generated texture with graceful color fallback; applies repeat wrapping.
  function texMat(url, fallbackColor, rough, repX, repY) {
    var m = mat(fallbackColor, rough);
    texLoader.load(url, function (t) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repX || 1, repY || 1);
      t.anisotropy = 8;
      m.map = t; m.color.set(0xffffff); m.needsUpdate = true;
    });
    return m;
  }
  var woodM = texMat("assets/tex/wood.jpg", 0x8a6a42, 0.75, 1, 1);
  var woodMSide = texMat("assets/tex/wood.jpg", 0x8a6a42, 0.75, 0.35, 1);

  /* ---- generated GLB hero props --------------------------------------------- */
  var dracoL = new DRACOLoader(); dracoL.setDecoderPath("assets/lib/draco/");
  var gltfL = new GLTFLoader(); gltfL.setDRACOLoader(dracoL);
  // Load a GLB, scale it to height h, sit its base at local y=0, place at (x,y,z).
  function prop(url, h, x, y, z, rotY, onReady) {
    gltfL.load(url, function (g) {
      var root = g.scene;
      root.traverse(function (o) { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      var bb = new THREE.Box3().setFromObject(root);
      var size = bb.getSize(new THREE.Vector3());
      var s = h / (size.y || 1);
      root.scale.setScalar(s);
      bb.setFromObject(root);
      var ctr = bb.getCenter(new THREE.Vector3());
      root.position.set(-ctr.x, -bb.min.y, -ctr.z);
      var wrap = new THREE.Group();
      wrap.add(root);
      wrap.position.set(x, y, z); wrap.rotation.y = rotY || 0;
      scene.add(wrap);
      if (onReady) onReady(wrap, root);
    });
  }

  /* ---- the room shell ---------------------------------------------------- */
  var floorM = texMat("assets/tex/carpet.jpg", 0x6b5a48, 0.98, 4, 3);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), floorM);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  var rug = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), texMat("assets/tex/rug.jpg", 0x27506b, 0.95, 1, 1));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.1, 0.012, 1.0); rug.receiveShadow = true; scene.add(rug);
  var wallM = texMat("assets/tex/wallpaper.jpg", 0x38404f, 0.95, 3.4, 1.3);
  var wallMSide = texMat("assets/tex/wallpaper.jpg", 0x38404f, 0.95, 2.6, 1.3);
  var back = box(9, 3.4, 0.1, wallM); back.position.set(0, 1.7, -2.6); scene.add(back);
  var left = box(0.1, 3.4, 7, wallMSide); left.position.set(-3.6, 1.7, 0); scene.add(left);
  var right = box(0.1, 3.4, 7, wallMSide); right.position.set(3.6, 1.7, 0); scene.add(right);
  var stripe = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.28), mat(0x8a4d5e, 0.95)); // 90s wallpaper border
  stripe.position.set(0, 2.6, -2.54); scene.add(stripe);
  var skirt = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.14), mat(0x2a2019, 0.85));
  skirt.position.set(0, 0.07, -2.54); scene.add(skirt);

  /* ---- window: the street below, behind live rain streaks ------------------ */
  // Wall front face is z=-2.55, stripe -2.54. Layering back→front: photo -2.53,
  // rain -2.515, frame bars proud at -2.51 (they embed into the wall, never coplanar).
  var winViewM = new THREE.MeshBasicMaterial({ color: 0xb8c2d6 }); // placeholder tint; texture loads over it
  winViewM.color.setRGB(1.25, 1.25, 1.325); // resting lift — the photo is a dark night shot
  texLoader.load("assets/tex/window_view.jpg", function (t) { t.anisotropy = 8; winViewM.map = t; winViewM.needsUpdate = true; });
  var winView = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 1.74), winViewM);
  winView.position.set(2.35, 1.95, -2.53); scene.add(winView);
  var rainT = canvasTex(256, 320, function (g) { g.clearRect(0, 0, 256, 320); });
  var winPane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.7),
    new THREE.MeshBasicMaterial({ map: rainT, transparent: true, depthWrite: false }));
  winPane.position.set(2.35, 1.95, -2.515); scene.add(winPane);
  var frameM = mat(0x2a2019, 0.8);
  [[2.35, 2.85, 1.64, 0.10], [2.35, 1.05, 1.64, 0.10]].forEach(function (b) { // top + bottom rails
    var m = box(b[2], b[3], 0.09, frameM); m.position.set(b[0], b[1], -2.51); scene.add(m);
  });
  [1.62, 3.08].forEach(function (x) { // side jambs
    var m = box(0.10, 1.9, 0.09, frameM); m.position.set(x, 1.95, -2.51); scene.add(m);
  });
  var winBar = box(0.05, 1.7, 0.07, frameM); winBar.position.set(2.35, 1.95, -2.505); scene.add(winBar);
  var sill = box(1.8, 0.07, 0.22, frameM); sill.position.set(2.35, 0.985, -2.47); scene.add(sill);

  /* ---- lights ------------------------------------------------------------ */
  scene.add(new THREE.AmbientLight(0x2c3440, 1.0));
  var moon = new THREE.DirectionalLight(0x7d9cc4, 0.4); moon.position.set(2.4, 3.5, 1.0); scene.add(moon);
  var lampLight = new THREE.PointLight(0xffc27d, 1.5, 9, 1.5); lampLight.position.set(-2.4, 1.6, -0.2); lampLight.castShadow = true; scene.add(lampLight);
  var crtLight = new THREE.PointLight(0x7db4ff, 0.7, 4, 2); crtLight.position.set(2.3, 1.0, -1.4); scene.add(crtLight);
  var shelfGlow = new THREE.PointLight(0xffd9a0, 0.55, 5, 2); shelfGlow.position.set(-1.3, 1.8, -1.4); scene.add(shelfGlow);

  var pick = []; // clickable meshes
  function clickable(mesh, name, action, hint) { mesh.userData = { name: name, action: action, hint: hint || "click to open" }; pick.push(mesh); return mesh; }
  function go(url) { return function () { window.location.href = url; }; }
  var BASE = "https://kylefriesmarketing.github.io/";

  /* ---- THE BOOKSHELF: flat on the back wall, spines to the camera --------- */
  var shelfG = new THREE.Group();
  var caseW = 2.5, boardY = [0.62, 1.52], caseH = 2.35;
  var caseSideL = box(0.09, caseH, 0.5, woodMSide); caseSideL.position.set(-caseW / 2, caseH / 2, 0); shelfG.add(caseSideL);
  var caseSideR = box(0.09, caseH, 0.5, woodMSide); caseSideR.position.set(caseW / 2, caseH / 2, 0); shelfG.add(caseSideR);
  var caseTop = box(caseW + 0.14, 0.08, 0.52, woodM); caseTop.position.set(0, caseH, 0); shelfG.add(caseTop);
  var caseBack = box(caseW, caseH, 0.04, mat(0x241a12, 0.95)); caseBack.position.set(0, caseH / 2, -0.22); shelfG.add(caseBack);
  boardY.forEach(function (y) { var b = box(caseW, 0.07, 0.5, woodM); b.position.set(0, y - 0.04, 0); shelfG.add(b); });
  var baseBoard = box(caseW, 0.12, 0.5, woodM); baseBoard.position.set(0, 0.06, 0); shelfG.add(baseBoard);

  function spineTex(text, bg, fg) {
    return canvasTex(128, 512, function (g, w, h) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 5;
      g.strokeRect(9, 9, w - 18, h - 18);
      g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
      g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
      g.font = "bold 44px Georgia, serif";
      var t = text, size = 44;
      while (g.measureText(t).width > h - 70 && size > 22) { size -= 2; g.font = "bold " + size + "px Georgia, serif"; }
      g.fillText(t, 0, 0);
    });
  }
  // a standing book: spine faces +z (the camera)
  function book(w, h, colors, spineT) {
    var pageM = mat(0xe6dcc4, 0.95), coverM = mat(colors, 0.6);
    var spineM = spineT ? new THREE.MeshStandardMaterial({ map: spineT, roughness: 0.55 }) : coverM;
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z
    var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.34), [coverM, coverM, pageM, coverM, spineM, coverM]);
    b.castShadow = true;
    return b;
  }
  var PLAY = [
    { t: "SOUTH", c: 0x2e5877, url: BASE + "south/", tip: "SOUTH — bring all 27 home" },
    { t: "STILL BREATHING", c: 0x9a3b1e, url: BASE + "still-breathing/", tip: "STILL BREATHING — four true ordeals" },
    { t: "NINE CIRCLES", c: 0x8a6a24, url: BASE + "nine-circles/", tip: "NINE CIRCLES — a descent" },
    { t: "CHOOSE WISELY", c: 0x53386b, url: BASE + "choose-wisely/", tip: "CHOOSE WISELY — the shop remembers you" },
    { t: "NOBODY", c: 0xc96f3b, url: BASE + "nobody/", tip: "NOBODY — the Odyssey; argue with the poem" },
  ];
  var DECOR = [0x3b4a55, 0x5e3a3a, 0x39543e, 0x584a2e, 0x46485e, 0x2f3e4a, 0x64513a];
  // two rows; playable books stand tall and slightly proud of the row
  [0, 1].forEach(function (row) {
    var y = boardY[row], xCursor = -caseW / 2 + 0.22, d = 0;
    var order = row === 0 ? [null, PLAY[2], null, PLAY[3], PLAY[4], null]
                          : [null, PLAY[0], null, null, PLAY[1], null];
    order.forEach(function (slot) {
      if (slot) {
        var bw = 0.24, bh = 0.8;
        var bk = book(bw, bh, slot.c, spineTex(slot.t, "#" + slot.c.toString(16).padStart(6, "0"), "#efe2c4"));
        bk.position.set(xCursor + bw / 2, y + bh / 2, 0.10);
        clickable(bk, slot.t, go(slot.url), slot.tip);
        shelfG.add(bk);
        xCursor += bw + 0.035;
      } else {
        var n = 1 + ((Math.random() * 2) | 0);
        for (var k = 0; k < n; k++) {
          var w2 = 0.11 + Math.random() * 0.08, h2 = 0.56 + Math.random() * 0.14;
          var dec = book(w2, h2, DECOR[(d++) % DECOR.length], null);
          dec.position.set(xCursor + w2 / 2, y + h2 / 2, 0.04);
          if (Math.random() < 0.25) { dec.rotation.z = -0.09; dec.position.y -= 0.012; }
          shelfG.add(dec);
          xCursor += w2 + 0.028;
        }
      }
    });
  });
  shelfG.position.set(-1.3, 0, -2.32); scene.add(shelfG);

  /* ---- THE TOY CHEST v2: Age of Toys (right-center floor) ------------------ */
  var chest = new THREE.Group();
  var cW = 1.35, cH = 0.62, cD = 0.8;
  var chestBody = box(cW, cH, cD, woodM); chestBody.position.y = cH / 2; chest.add(chestBody);
  // painted front panel (generated art)
  var frontM = texMat("assets/tex/chest_front.png", 0x7a4326, 0.7, 1, 1);
  var front = new THREE.Mesh(new THREE.PlaneGeometry(cW - 0.08, cH - 0.1), frontM);
  front.position.set(0, cH / 2, cD / 2 + 0.006); chest.add(front);
  // dark interior + rounded open lid (half-cylinder), hinged at the back
  var interior = box(cW - 0.1, 0.05, cD - 0.1, mat(0x14100c, 1)); interior.position.y = cH - 0.03; chest.add(interior);
  var lidG = new THREE.Group();
  var lid = new THREE.Mesh(new THREE.CylinderGeometry(cD / 2, cD / 2, cW, 22, 1, false, 0, Math.PI), woodM);
  lid.rotation.z = Math.PI / 2; lid.castShadow = true;
  lidG.add(lid);
  var lidCapL = new THREE.Mesh(new THREE.CircleGeometry(cD / 2, 22, 0, Math.PI), woodMSide);
  lidCapL.position.x = -cW / 2; lidCapL.rotation.y = -Math.PI / 2; lidG.add(lidCapL);
  var lidCapR = lidCapL.clone(); lidCapR.position.x = cW / 2; lidCapR.rotation.y = Math.PI / 2; lidG.add(lidCapR);
  lidG.position.set(0, cH, -cD / 2);           // hinge along the back edge
  lidG.rotation.x = -2.35;                      // thrown open against the back
  chest.add(lidG);
  // metal bands + latch
  [-cW / 3, cW / 3].forEach(function (x) {
    var band = box(0.06, cH + 0.02, cD + 0.02, mat(0x2c2c30, 0.4)); band.position.set(x, cH / 2, 0); chest.add(band);
  });
  var latch = box(0.1, 0.12, 0.03, mat(0xc9a23a, 0.35)); latch.position.set(0, cH - 0.08, cD / 2 + 0.02); chest.add(latch);
  // toys peeking out: a red robot and a green soldier
  var robot = new THREE.Group();
  var rBody = box(0.16, 0.2, 0.12, mat(0xb5382c, 0.5)); rBody.position.y = 0.1; robot.add(rBody);
  var rHead = box(0.11, 0.1, 0.1, mat(0xc9463a, 0.5)); rHead.position.y = 0.26; robot.add(rHead);
  var rEye = box(0.07, 0.024, 0.012, mat(0x7be08a, 0.2)); rEye.position.set(0, 0.27, 0.055); robot.add(rEye);
  var rAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), mat(0x2c2c30, 0.4)); rAnt.position.y = 0.36; robot.add(rAnt);
  robot.position.set(-0.3, cH - 0.06, -0.05); robot.rotation.z = 0.35; chest.add(robot);
  var soldier = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 10), mat(0x3d6b35, 0.6));
  soldier.position.set(0.32, cH + 0.08, -0.1); soldier.rotation.z = -0.5; soldier.castShadow = true; chest.add(soldier);
  var block1 = box(0.15, 0.15, 0.15, mat(0xc9a23a, 0.7)); block1.position.set(0.95, 0.075, 0.55); block1.rotation.y = 0.5; chest.add(block1);
  var block2 = box(0.13, 0.13, 0.13, mat(0x3c7ab5, 0.7)); block2.position.set(1.12, 0.065, 0.3); chest.add(block2);
  chest.children.forEach(function (m) { clickable(m, "AGE OF TOYS", go(BASE + "toybox-tactics/"), "AGE OF TOYS — the toybox RTS"); });
  [robot, lidG].forEach(function (g) { g.children.forEach(function (m) { clickable(m, "AGE OF TOYS", go(BASE + "toybox-tactics/"), "AGE OF TOYS — the toybox RTS"); }); });
  chest.position.set(1.75, 0, 0.15); chest.rotation.y = -0.38; scene.add(chest);

  /* ---- THE DESK: computer, brain, notebook, lamp (left side) --------------- */
  var desk = new THREE.Group();
  var dTop = box(2.1, 0.07, 0.95, woodM); dTop.position.y = 0.78; desk.add(dTop);
  [[-0.98, 0], [0.98, 0]].forEach(function (p) {
    var panel = box(0.07, 0.75, 0.9, woodMSide); panel.position.set(p[0], 0.375, 0); desk.add(panel);
  });
  var drawer = box(0.9, 0.16, 0.06, woodMSide); drawer.position.set(-0.5, 0.66, 0.44); desk.add(drawer);
  var knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), mat(0xc9a23a, 0.35)); knob.position.set(-0.5, 0.66, 0.49); desk.add(knob);

  // the beige 90s computer — CHAMELEON 3D (coming soon)
  var pc = new THREE.Group();
  var beige = mat(0xd6cdb4, 0.55), beigeDark = mat(0xbfb59a, 0.6);
  var mon = box(0.62, 0.5, 0.5, beige); mon.position.y = 1.14; pc.add(mon);
  var monFoot = box(0.3, 0.07, 0.3, beigeDark); monFoot.position.y = 0.855; pc.add(monFoot);
  var monNeck = box(0.18, 0.06, 0.18, beigeDark); monNeck.position.y = 0.91; pc.add(monNeck);
  var screenM = texMat("assets/tex/screen_c3d.png", 0x0e3a34, 0.3, 1, 1);
  screenM.emissive = new THREE.Color(0x2a5a4a); screenM.emissiveIntensity = 0.35;
  var pcScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), screenM);
  pcScreen.position.set(0, 1.14, 0.253); pc.add(pcScreen);
  var kb = box(0.5, 0.035, 0.2, beige); kb.position.set(0, 0.835, 0.33); kb.rotation.x = 0.06; pc.add(kb);
  var kbKeys = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.15), new THREE.MeshStandardMaterial({
    map: canvasTex(128, 48, function (g, w, h) {
      g.fillStyle = "#bfb59a"; g.fillRect(0, 0, w, h); g.fillStyle = "#8f866e";
      for (var r = 0; r < 4; r++) for (var c2 = 0; c2 < 14; c2++) g.fillRect(3 + c2 * 9, 3 + r * 11, 7, 8);
    }), roughness: 0.7,
  }));
  kbKeys.rotation.x = -Math.PI / 2 + 0.06; kbKeys.position.set(0, 0.854, 0.33); pc.add(kbKeys);
  pc.position.set(0.35, 0, -0.12); pc.rotation.y = -0.12; desk.add(pc);
  var tower = box(0.24, 0.62, 0.6, beige); tower.position.set(1.28, 0.31, -0.05); desk.add(tower);
  var towerSlots = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.3), new THREE.MeshStandardMaterial({
    map: canvasTex(64, 96, function (g, w, h) {
      g.fillStyle = "#bfb59a"; g.fillRect(0, 0, w, h); g.fillStyle = "#6e6753";
      g.fillRect(6, 10, w - 12, 10); g.fillRect(6, 28, w - 12, 10); g.fillStyle = "#3a3a2e"; g.fillRect(6, 60, w - 12, 4);
    }), roughness: 0.6,
  }));
  towerSlots.position.set(1.28, 0.42, 0.256); desk.add(towerSlots);
  [mon, pcScreen, kb, tower].forEach(function (m) { clickable(m, "CHAMELEON 3D", null, "CHAMELEON 3D — coming soon to the room"); });

  // the brain on the desk — BRAINROT INC (coming soon)
  var brainG = new THREE.Group();
  var brainStand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.06, 20), woodMSide); brainStand.position.y = 0.845; brainG.add(brainStand);
  function hemisphere(side) {
    var geo = new THREE.SphereGeometry(0.13, 24, 18);
    var pos = geo.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var n = Math.sin(v.x * 41 + v.y * 29) * Math.cos(v.y * 37 + v.z * 31) * 0.011 // wrinkles
            + Math.sin(v.z * 53 + v.x * 23) * 0.008;
      v.addScaledVector(v.clone().normalize(), n);
      pos.setXYZ(i, v.x * 0.82, v.y * 0.8, v.z * 1.12);
    }
    geo.computeVertexNormals();
    var h = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd88a94, roughness: 0.38 }));
    h.position.x = side * 0.055; h.castShadow = true;
    return h;
  }
  var bL = hemisphere(-1), bR = hemisphere(1);
  bL.position.y = bR.position.y = 0.99; brainG.add(bL); brainG.add(bR);
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.09, 10), mat(0xc4747e, 0.5));
  stem.position.set(0, 0.9, -0.02); stem.rotation.x = 0.3; brainG.add(stem);
  brainG.children.forEach(function (m) { clickable(m, "BRAINROT INC", null, "BRAINROT INC — coming soon to the room"); });
  brainG.position.set(-0.42, 0, 0.05); desk.add(brainG);

  // lamp (click = toggle)
  var lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.06, 16), mat(0x24303a, 0.5)); lampBase.position.set(-0.85, 0.85, -0.2); desk.add(lampBase);
  var lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), mat(0x24303a, 0.5)); lampArm.position.set(-0.85, 1.1, -0.2); desk.add(lampArm);
  var shade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffc27d, emissive: 0xff9d45, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
  shade.position.set(-0.85, 1.38, -0.2); desk.add(shade);
  var lampOn = true;
  [lampBase, lampArm, shade].forEach(function (m) {
    clickable(m, "the lamp", function () {
      lampOn = !lampOn;
      lampLight.intensity = lampOn ? 1.5 : 0.12;
      shade.material.emissiveIntensity = lampOn ? 0.9 : 0.05;
    }, "the lamp — click it");
  });

  // notebook (click = progress panel)
  function labelTex(text, bg, fg) {
    return canvasTex(256, 128, function (g, w, h) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.font = "bold 30px Georgia, serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2);
    });
  }
  var noteM = new THREE.MeshStandardMaterial({ map: labelTex("what i finished", "#e8dcc0", "#5a4632"), roughness: 0.95 });
  var note = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3),
    [mat(0xe8dcc0), mat(0xe8dcc0), noteM, mat(0xd8ccb2), mat(0xe8dcc0), mat(0xe8dcc0)]);
  note.position.set(-0.42, 0.83, 0.42); note.rotation.y = 0.3; desk.add(note);
  clickable(note, "the notebook", showNotebook, "the notebook — what you have finished");

  desk.position.set(-2.35, 0, -0.8); desk.rotation.y = 1.05; scene.add(desk);

  /* ---- THE TV: channel guide (list view) + VHS decor ------------------------ */
  var crt = new THREE.Group();
  var stand = box(1.1, 0.42, 0.65, woodMSide); stand.position.y = 0.21; crt.add(stand);
  var tv = box(0.85, 0.68, 0.7, mat(0x3a3a38, 0.55)); tv.position.y = 0.78; crt.add(tv);
  var staticCanvas = document.createElement("canvas"); staticCanvas.width = 128; staticCanvas.height = 96;
  var staticCtx = staticCanvas.getContext("2d");
  var staticT = new THREE.CanvasTexture(staticCanvas);
  var screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.47), new THREE.MeshBasicMaterial({ map: staticT }));
  screen.position.set(0, 0.8, 0.355); crt.add(screen);
  var vhs = box(0.4, 0.09, 0.23, new THREE.MeshStandardMaterial({ map: labelTex("MY TAPES", "#141414", "#c9c9c9"), roughness: 0.6 }));
  vhs.position.set(0.28, 0.465, 0.12); vhs.rotation.y = 0.25; crt.add(vhs);
  function toListView() { document.body.classList.add("listing"); }
  [tv, screen, vhs, stand].forEach(function (m) { clickable(m, "the channel guide", toListView, "the TV — every channel we have (list view)"); });
  crt.position.set(3.0, 0, -1.35); crt.rotation.y = -0.7; scene.add(crt);

  /* ---- glow stars on the ceiling (pure 90s, breathing) ---------------------- */
  var stars = [];
  for (var s = 0; s < 16; s++) {
    var st = new THREE.Mesh(new THREE.CircleGeometry(0.03, 6),
      new THREE.MeshBasicMaterial({ color: 0xb8ffc9, transparent: true, opacity: 0.7 }));
    st.position.set((Math.random() - 0.5) * 6, 3.32, (Math.random() - 0.5) * 4);
    st.rotation.x = Math.PI / 2; st.userData.phase = Math.random() * 6.28;
    scene.add(st); stars.push(st);
  }

  /* ---- ceiling fan (lazy summer spin) ---------------------------------------- */
  var fan = new THREE.Group();
  var fanRod = box(0.045, 0.3, 0.045, mat(0x3a3226, 0.6)); fanRod.position.y = 3.25; fan.add(fanRod);
  var fanHub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 16), mat(0x40382c, 0.5));
  fanHub.position.y = 3.06; fanHub.castShadow = true; fan.add(fanHub);
  var fanBlades = new THREE.Group(); fanBlades.position.y = 2.99;
  for (var fb = 0; fb < 4; fb++) {
    var bl = box(0.62, 0.018, 0.14, mat(0x6b5844, 0.8));
    bl.position.x = 0.38; bl.rotation.z = 0.06;
    var arm = new THREE.Group(); arm.rotation.y = fb * Math.PI / 2; arm.add(bl); fanBlades.add(arm);
  }
  fan.add(fanBlades);
  var fanGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.4, emissive: 0xffe9c2, emissiveIntensity: 0.25 }));
  fanGlobe.position.y = 2.9; fan.add(fanGlobe);
  fan.position.set(0.4, 0, 0.3); scene.add(fan);

  /* ---- THE NEON SIGN (generated) above the bookshelf ------------------------ */
  var neonLight = new THREE.PointLight(0xff5aa8, 0.0, 6, 1.8);
  neonLight.position.set(-1.3, 2.85, -2.2); scene.add(neonLight);
  var neonMesh = null;
  texLoader.load("assets/tex/neon.png", function (t) {
    t.anisotropy = 8;
    neonMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.07),
      new THREE.MeshBasicMaterial({ map: t, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    neonMesh.position.set(-1.3, 2.9, -2.5);
    scene.add(neonMesh);
    neonLight.intensity = 1.1;
  });

  /* ---- THE LAVA LAMP on a little nightstand --------------------------------- */
  var nstand = new THREE.Group();
  var nsTop = box(0.5, 0.06, 0.42, woodM); nsTop.position.y = 0.52; nstand.add(nsTop);
  var nsBody = box(0.44, 0.46, 0.36, woodMSide); nsBody.position.y = 0.26; nstand.add(nsBody);
  var lava = new THREE.Group();
  var lvBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.085, 0.1, 18), mat(0x8a8f98, 0.3)); lvBase.position.y = 0.6; lava.add(lvBase);
  var lvCap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.05, 0.07, 18), mat(0x8a8f98, 0.3)); lvCap.position.y = 1.03; lava.add(lvCap);
  var lvGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.082, 0.36, 18, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xff7d5a, roughness: 0.15, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
  lvGlass.position.y = 0.83; lava.add(lvGlass);
  var blobs = [];
  for (var bi = 0; bi < 5; bi++) {
    var blob = new THREE.Mesh(new THREE.SphereGeometry(0.018 + Math.random() * 0.02, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xff4d7d, emissive: 0xff2d63, emissiveIntensity: 1.6, roughness: 0.3 }));
    blob.userData = { phase: Math.random() * 6.28, speed: 0.25 + Math.random() * 0.3 };
    lava.add(blob); blobs.push(blob);
  }
  var lavaLight = new THREE.PointLight(0xff5a7d, 0.8, 3.2, 2); lavaLight.position.set(0, 0.9, 0); lava.add(lavaLight);
  var lavaOn = true;
  [lvBase, lvCap, lvGlass].forEach(function (m) {
    clickable(m, "the lava lamp", function () {
      lavaOn = !lavaOn;
      lavaLight.intensity = lavaOn ? 0.8 : 0.05;
      blobs.forEach(function (b) { b.material.emissiveIntensity = lavaOn ? 1.6 : 0.15; });
    }, "the lava lamp — groovy");
  });
  nstand.add(lava);
  nstand.position.set(0.55, 0, -2.25); scene.add(nstand);

  /* ---- STRING LIGHTS under the wallpaper border ------------------------------ */
  var bulbs = [], bulbCols = [0xff6a5a, 0xffd166, 0x8ad7ff, 0x7be08a, 0xc79bff];
  for (var li = 0; li < 13; li++) {
    var bx = -4.1 + li * 0.68, sag = 0.1 * Math.sin((li % 4) / 3 * Math.PI);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8),
      new THREE.MeshBasicMaterial({ color: bulbCols[li % 5], transparent: true, opacity: 0.9 }));
    bulb.position.set(bx, 2.42 - sag, -2.5);
    bulb.userData.phase = li * 0.7;
    scene.add(bulb); bulbs.push(bulb);
  }

  /* ---- THE BOOMBOX: synth lo-fi + rain (WebAudio, no files) ------------------ */
  var boom = new THREE.Group();
  var bbBody = box(0.56, 0.24, 0.17, mat(0x23262c, 0.45)); bbBody.position.y = 0.12; boom.add(bbBody);
  [-0.17, 0.17].forEach(function (x) {
    var spk = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 20), mat(0x101216, 0.6));
    spk.rotation.x = Math.PI / 2; spk.position.set(x, 0.12, 0.085); boom.add(spk);
    var cone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.015, 14), mat(0x3a3f48, 0.5));
    cone.rotation.x = Math.PI / 2; cone.position.set(x, 0.12, 0.093); boom.add(cone);
  });
  var deck = box(0.14, 0.08, 0.02, mat(0x3a3f48, 0.4)); deck.position.set(0, 0.13, 0.086); boom.add(deck);
  var audioOn = false, ac = null, acNodes = null;
  function buildAudio() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    var master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    // rain: looped white noise, band-shaped
    var len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var rain = ac.createBufferSource(); rain.buffer = buf; rain.loop = true;
    var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400;
    var hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 300;
    var rg = ac.createGain(); rg.gain.value = 0.05;
    rain.connect(lp); lp.connect(hp); hp.connect(rg); rg.connect(master); rain.start();
    // the tape: an 8-bar lofi loop rendered offline once, then looped forever
    renderTune(ac.sampleRate, function (buf) {
      var tape = ac.createBufferSource(); tape.buffer = buf; tape.loop = true;
      var tg = ac.createGain(); tg.gain.value = 0.42;
      tape.connect(tg); tg.connect(master); tape.start();
    });
    acNodes = { master: master };
  }
  // Composes the boombox tape: 72bpm swung lofi, Dm7-G7-Cmaj7-Am7, two bars each.
  function renderTune(sampleRate, done) {
    var beat = 60 / 72, bar = beat * 4, lenS = bar * 8;
    var oc = new OfflineAudioContext(2, Math.ceil(lenS * sampleRate), sampleRate);
    var warm = oc.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 3800;
    var out = oc.createGain(); out.gain.value = 0.9;
    out.connect(warm); warm.connect(oc.destination);
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.001, t + a + d);
    }
    function tone(f, t, dur, peak, type, pan) { // EP-ish: fundamental + soft octave shimmer
      var o = oc.createOscillator(); o.type = type || "sine"; o.frequency.value = f;
      var o2 = oc.createOscillator(); o2.frequency.value = f * 2.003;
      var g = oc.createGain(), g2 = oc.createGain();
      var p = oc.createStereoPanner(); p.pan.value = pan || 0; p.connect(out);
      env(g, t, 0.012, peak, dur); env(g2, t, 0.012, peak * 0.28, dur * 0.6);
      o.connect(g); g.connect(p); o2.connect(g2); g2.connect(p);
      o.start(t); o.stop(t + dur + 0.2); o2.start(t); o2.stop(t + dur + 0.2);
    }
    function noiseSrc(dur) {
      var b = oc.createBuffer(1, Math.ceil(dur * sampleRate), sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      var s = oc.createBufferSource(); s.buffer = b; return s;
    }
    function kick(t) {
      var o = oc.createOscillator(); o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
      var g = oc.createGain(); env(g, t, 0.004, 0.5, 0.22);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
    }
    function snare(t) {
      var n = noiseSrc(0.16);
      var f = oc.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.8;
      var g = oc.createGain(); env(g, t, 0.002, 0.16, 0.13);
      n.connect(f); f.connect(g); g.connect(out); n.start(t);
      var o = oc.createOscillator(); o.frequency.value = 185;
      var og = oc.createGain(); env(og, t, 0.002, 0.1, 0.08);
      o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.2);
    }
    function hat(t, loud) {
      var n = noiseSrc(0.05);
      var f = oc.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7200;
      var g = oc.createGain(); env(g, t, 0.001, loud ? 0.05 : 0.028, 0.035);
      n.connect(f); f.connect(g); g.connect(out); n.start(t);
    }
    (function vinyl() { // sparse crackle across the whole tape
      var b = oc.createBuffer(1, Math.ceil(lenS * sampleRate), sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) if (Math.random() < 0.00012) d[i] = (Math.random() * 2 - 1) * 0.6;
      var s = oc.createBufferSource(); s.buffer = b;
      var f = oc.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 5200;
      var g = oc.createGain(); g.gain.value = 0.5;
      s.connect(f); f.connect(g); g.connect(out); s.start(0);
    })();
    var N = { A1: 55, C2: 65.41, D2: 73.42, G2: 98, A2: 110,
              C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
              C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440 };
    var chords = [
      { b: N.D2, v: [N.D3, N.F3, N.A3, N.C4] },  // Dm7
      { b: N.G2, v: [N.D3, N.F3, N.G3, N.B3] },  // G7
      { b: N.C2, v: [N.C3, N.E3, N.G3, N.B3] },  // Cmaj7
      { b: N.A1, v: [N.A2, N.C3, N.E3, N.G3] }   // Am7
    ];
    var sw = beat * 0.08; // the swing push
    chords.forEach(function (ch, c) {
      var t0 = c * bar * 2;
      ch.v.forEach(function (f, vi) { // rolled chord on the one, softer answer mid-phrase
        var pan = (vi - 1.5) * 0.22;
        tone(f, t0 + 0.001 + vi * 0.014, 2.4, 0.075, "sine", pan);
        tone(f, t0 + bar + beat * 1.5 + sw + vi * 0.01, 1.6, 0.05, "sine", pan);
      });
      [0, beat * 2, bar, bar + beat * 2].forEach(function (bt, i) { // bass on 1 and 3
        tone(ch.b, t0 + bt + 0.001, i % 2 ? 0.5 : 0.7, 0.17, "sine", 0);
      });
      for (var b2 = 0; b2 < 2; b2++) {
        var bt0 = t0 + b2 * bar;
        kick(bt0); kick(bt0 + beat * 2);
        if (b2 === 1 && c === 3) kick(bt0 + beat * 3.5 + sw); // fill into the loop seam
        snare(bt0 + beat); snare(bt0 + beat * 3);
        for (var e = 0; e < 8; e++) hat(bt0 + e * beat * 0.5 + (e % 2 ? sw : 0), e % 4 === 0);
      }
    });
    [ // the melody drifts in for the back half
      { t: bar * 4 + beat * 0.5 + sw, f: N.E4, d: 0.9 },
      { t: bar * 4 + beat * 2, f: N.D4, d: 1.4 },
      { t: bar * 5 + beat * 1.5 + sw, f: N.B3, d: 1.1 },
      { t: bar * 6 + beat * 0.5 + sw, f: N.G4, d: 0.8 },
      { t: bar * 6 + beat * 2, f: N.E4, d: 1.6 },
      { t: bar * 7 + beat * 1.5 + sw, f: N.A4, d: 0.7 },
      { t: bar * 7 + beat * 2.5 + sw, f: N.G4, d: 1.8 }
    ].forEach(function (m) { tone(m.f, m.t, m.d, 0.055, "triangle", 0.15); });
    oc.startRendering().then(done);
  }
  function rumble() { // thunder, if the box is on
    if (!ac || !audioOn) return;
    var len = ac.sampleRate * 1.4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource(); src.buffer = buf;
    var f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 120;
    var g = ac.createGain(); g.gain.value = 0.22;
    src.connect(f); f.connect(g); g.connect(acNodes.master); src.start();
  }
  var powerLED = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x552222 }));
  powerLED.position.set(0, 0.215, 0.088); boom.add(powerLED);
  boom.children.forEach(function (m) {
    clickable(m, "the boombox", function () {
      if (!ac) buildAudio();
      audioOn = !audioOn;
      if (audioOn) { ac.resume(); powerLED.material.color.set(0xff3b30); }
      else { ac.suspend(); powerLED.material.color.set(0x552222); }
    }, "the boombox — a lofi tape and the rain");
  });
  boom.position.set(-0.95, 0, 1.6); boom.rotation.y = 0.4; scene.add(boom);

  /* ---- DUST MOTES in the lamplight ------------------------------------------- */
  var moteGeo = new THREE.BufferGeometry(), moteN = 60, motePos = new Float32Array(moteN * 3);
  for (var mi = 0; mi < moteN; mi++) {
    motePos[mi * 3] = -2.6 + Math.random() * 1.6;
    motePos[mi * 3 + 1] = 0.8 + Math.random() * 1.2;
    motePos[mi * 3 + 2] = -1.4 + Math.random() * 1.6;
  }
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  var motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.014, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(motes);

  /* ---- lightning state -------------------------------------------------------- */
  var flash = 0, nextFlash = 12 + Math.random() * 20;
  var rainCtx = rainT.image.getContext("2d");
  function drawRain(bright) {
    var g = rainCtx, w = 256, h = 320;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(200,220,250," + (bright ? 0.8 : 0.4) + ")";
    g.lineWidth = 1.4;
    for (var i = 0; i < 44; i++) { var x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14 + Math.random() * 10); g.stroke(); }
    // clinging droplets
    g.fillStyle = "rgba(210,228,255,0.35)";
    for (var dnum = 0; dnum < 8; dnum++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, 7); g.fill(); }
    rainT.needsUpdate = true;
  }

  /* ---- THE BED: space comforter, right side ---------------------------------- */
  var bed = new THREE.Group();
  var headboard = box(1.05, 0.85, 0.07, woodMSide); headboard.position.set(0, 0.42, -0.98); bed.add(headboard);
  var footboard = box(1.05, 0.45, 0.06, woodMSide); footboard.position.set(0, 0.22, 0.98); bed.add(footboard);
  var bedbase = box(1.0, 0.22, 1.95, woodM); bedbase.position.y = 0.22; bed.add(bedbase);
  var sheetTopM = texMat("assets/tex/bedsheet.jpg", 0x1e2a52, 0.95, 1, 1.8);
  var sheetSideM = mat(0x1e2a52, 0.95);
  var comforter = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.2, 1.6),
    [sheetSideM, sheetSideM, sheetTopM, sheetSideM, sheetSideM, sheetSideM]);
  comforter.position.set(0, 0.43, 0.14); comforter.castShadow = comforter.receiveShadow = true; bed.add(comforter);
  var pillow = box(0.62, 0.14, 0.34, mat(0xe8e4da, 0.95)); pillow.position.set(0, 0.42, -0.68); pillow.rotation.x = -0.08; bed.add(pillow);
  bed.position.set(2.93, 0, 1.0); bed.rotation.y = -0.09; scene.add(bed); // deep enough to sit inside the frame

  /* ---- generated hero props: the clutter that makes it a real room ----------- */
  function propTip(name, hint) {
    return function (wrap) { wrap.traverse(function (o) { if (o.isMesh) clickable(o, name, null, hint); }); };
  }
  prop("assets/props/bean.glb", 0.62, -2.05, 0, 1.2, 0.95,
    propTip("the beanbag", "the beanbag — best seat in the house"));
  prop("assets/props/trex.glb", 0.3, 1.05, 0, 0.72, -0.55,
    propTip("rex", "rex — he guards the toy chest"));
  prop("assets/props/skate.glb", 0.78, -3.33, 0, 0.55, 1.45, function (wrap) {
    wrap.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), 0.10); // top rests against the left wall (inner face x=-3.55)
    propTip("the skateboard", "the skateboard — one day, the driveway")(wrap);
  });
  prop("assets/props/globe.glb", 0.36, -2.26, 0.815, -0.75, -0.3, // desk-local (0, 0.10) — verified on the rotated slab
    propTip("the globe", "the globe — somewhere better, probably"));

  /* ---- THE SOLAR SYSTEM POSTER (back wall, between shelf and window) ---------- */
  var posterM = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.9 });
  texLoader.load("assets/tex/solar_poster.png", function (t) { t.anisotropy = 8; posterM.map = t; posterM.color.set(0xffffff); posterM.needsUpdate = true; });
  var solar = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.04), posterM);
  solar.position.set(0.78, 1.98, -2.53); solar.rotation.z = -0.02; // taped up a little crooked
  scene.add(solar);

  /* ---- the TV flips between static and Saturday cartoons ---------------------- */
  var cartoonT = null, tvCartoon = false, tvFlip = 6 + Math.random() * 6;
  texLoader.load("assets/tex/tv_cartoon.png", function (t) { t.anisotropy = 4; cartoonT = t; });

  /* ---- the notebook panel (DOM): reads the sibling games' saves ------------- */
  function readSave(key, fn) {
    try { var v = localStorage.getItem(key); return v ? fn(JSON.parse(v)) : null; } catch (e) { return null; }
  }
  function countOf(x) { return x == null ? null : (Array.isArray(x) ? x.length : Object.keys(x).length); }
  function showNotebook() {
    var rows = [
      ["Choose Wisely", readSave("chooseWisely.meta.v2", function (m) { return countOf(m.endingsFound); }), 56],
      ["Nine Circles", readSave("nc_persist", function (m) { return countOf(m.endings); }), null],
      ["Still Breathing", readSave("sb_persist", function (m) { return countOf(m.endings); }), null],
      ["SOUTH", readSave("south_persist", function (m) { return countOf(m.endings); }), null],
      ["NOBODY", readSave("nobody_persist", function (m) { return countOf(m.endings); }), null],
    ];
    var html = rows.map(function (r) {
      var v = r[1] == null ? "not started" : r[1] + (r[2] ? " / " + r[2] : "") + " endings";
      return "<div class='nb-row'><span>" + r[0] + "</span><b>" + v + "</b></div>";
    }).join("");
    var panel = document.getElementById("notebook");
    panel.querySelector(".nb-body").innerHTML = html;
    panel.classList.add("open");
  }
  document.getElementById("nb-close").addEventListener("click", function () {
    document.getElementById("notebook").classList.remove("open");
  });

  /* ---- picking / hover / parallax -------------------------------------------- */
  var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(-2, -2), hovered = null;
  var tip = document.getElementById("tip");
  function setPointer(e) {
    var t = e.touches ? e.touches[0] : e;
    if (!t) return;
    mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
    tip.style.left = t.clientX + "px"; tip.style.top = (t.clientY - 14) + "px";
  }
  window.addEventListener("pointermove", setPointer, { passive: true });
  function pickAt() {
    ray.setFromCamera(mouse, camera);
    var hit = ray.intersectObjects(pick, false)[0];
    return hit ? hit.object : null;
  }
  window.addEventListener("pointerdown", function (e) {
    setPointer(e);
    var o = pickAt();
    if (o && o.userData.action) o.userData.action();
    else if (o) {
      tip.textContent = o.userData.hint; tip.classList.add("show");
      setTimeout(function () { tip.classList.remove("show"); }, 1600);
    }
  });

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  var frameCount = 0, lastT = performance.now() / 1000;
  function tick() {
    requestAnimationFrame(tick);
    var t = performance.now() / 1000, dt = Math.min(t - lastT, 0.1); lastT = t;
    camera.position.x += ((mouse.x * 0.55) - camera.position.x) * 0.04;
    camera.position.y += ((1.72 + mouse.y * 0.24) - camera.position.y) * 0.04;
    lookAt.x += ((mouse.x * 1.25) - lookAt.x) * 0.04; // pan the gaze — the bed and side walls come into view
    camera.lookAt(lookAt);
    // the TV surfs between dead air and Saturday cartoons
    tvFlip -= dt;
    if (tvFlip <= 0 && cartoonT) {
      tvCartoon = !tvCartoon;
      screen.material.map = tvCartoon ? cartoonT : staticT;
      screen.material.needsUpdate = true;
      crtLight.color.set(tvCartoon ? 0xffd9a0 : 0x7db4ff);
      tvFlip = tvCartoon ? 9 + Math.random() * 8 : 3 + Math.random() * 4;
    }
    if (tvCartoon) {
      crtLight.intensity = 0.72 + 0.08 * Math.sin(t * 9);
    } else if ((frameCount & 3) === 0) { // static flicker
      var d = staticCtx.createImageData(128, 96);
      for (var i = 0; i < d.data.length; i += 4) {
        var v = (Math.random() * 255) | 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      staticCtx.putImageData(d, 0, 0);
      staticT.needsUpdate = true;
      crtLight.intensity = 0.5 + Math.random() * 0.35;
    }
    frameCount++;
    // lava blobs rise and fall, slow and thick
    if (lavaOn) for (var lb = 0; lb < blobs.length; lb++) {
      var b = blobs[lb], ph = t * b.userData.speed + b.userData.phase;
      b.position.y = 0.72 + 0.13 * Math.sin(ph);
      b.position.x = 0.012 * Math.sin(ph * 1.7);
      b.position.z = 0.012 * Math.cos(ph * 1.3);
      var sq = 1 + 0.25 * Math.sin(ph * 2.3);
      b.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    }
    fanBlades.rotation.y += dt * 2.1;
    // string lights twinkle; stars breathe; motes drift
    for (var bu = 0; bu < bulbs.length; bu++) bulbs[bu].material.opacity = 0.55 + 0.4 * Math.sin(t * 1.6 + bulbs[bu].userData.phase);
    for (var si = 0; si < stars.length; si++) stars[si].material.opacity = 0.45 + 0.35 * Math.sin(t * 0.5 + stars[si].userData.phase);
    var mp = motes.geometry.attributes.position;
    for (var mo = 0; mo < moteN; mo++) {
      var y = mp.getY(mo) + dt * 0.03 * (0.5 + Math.sin(mo));
      if (y > 2.1) y = 0.8;
      mp.setY(mo, y);
      mp.setX(mo, mp.getX(mo) + dt * 0.01 * Math.sin(t * 0.4 + mo));
    }
    mp.needsUpdate = true;
    // neon hum: tiny flicker, and a rare stutter
    if (neonMesh) {
      var hum = 0.96 + 0.04 * Math.sin(t * 11) * Math.sin(t * 1.3);
      if (Math.random() < 0.002) hum *= 0.4;
      neonMesh.material.opacity = hum;
      neonLight.intensity = 1.1 * hum;
    }
    // the storm outside
    nextFlash -= dt;
    if (nextFlash <= 0) { flash = 1; nextFlash = 14 + Math.random() * 26; rumble(); }
    if (flash > 0.01) {
      flash *= Math.pow(0.02, dt); // fast decay
      moon.intensity = 0.4 + flash * 2.2;
      var wv = 1.25 + flash * 1.5; // photo is a dark night shot — lift it so the streetlamp reads
      winViewM.color.setRGB(wv, wv, wv * 1.06);
      if ((frameCount & 1) === 0) drawRain(flash > 0.25);
    } else if ((frameCount % 6) === 0) drawRain(false);
    var o = pickAt();
    if (o !== hovered) {
      if (hovered && hovered.material && hovered.material.emissive && hovered !== shade && hovered !== screen && hovered !== pcScreen) hovered.material.emissiveIntensity = 0;
      hovered = o;
      document.body.style.cursor = o ? "pointer" : "default";
      if (o) {
        tip.textContent = o.userData.hint; tip.classList.add("show");
        if (o.material && o.material.emissive !== undefined && o !== shade && o !== screen && o !== pcScreen) {
          o.material.emissive = new THREE.Color(0xffc27d);
          o.material.emissiveIntensity = 0.28;
        }
      } else tip.classList.remove("show");
    }
    renderer.render(scene, camera);
  }
  // Bake world matrices + paint one frame immediately, so picking works even
  // before the animation loop has run (background tabs throttle rAF).
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  tick();
  window.__room = { scene: scene, camera: camera, pick: pick, ray: ray, THREE: THREE }; // debug hook (THREE: modules hide the global)
})();
