/* ============================================================================
 * THE ROOM — a 90s bedroom you can click. Every object is a doorway:
 * the bookshelf holds the stories (spines out, like a real shelf), the toy
 * chest holds the RTS, the brain on the desk opens Dumb Tony's BRAINROT
 * (live in the shared GameRepos), the beige PC is Chameleon 3D (coming soon),
 * the TV is the channel guide (list view), and the notebook knows your
 * progress across every game on this origin.
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
  // phones render fewer pixels; nobody can tell on a 6" screen and the fans thank us
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
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
      m.map = t; m.color.set(m.userData.tint || 0xffffff); m.needsUpdate = true; // tint survives the async load (the paint box)
    });
    return m;
  }
  var woodM = texMat("assets/tex/wood.jpg", 0x8a6a42, 0.75, 1, 1);
  var woodMSide = texMat("assets/tex/wood.jpg", 0x8a6a42, 0.75, 0.35, 1);

  // Cheap "bloom": a soft additive halo billboard around each bright source. Sprites
  // always face the camera, so the glow reads right from every angle without a
  // post-processing pass (which would reroute the whole render path and cost mobile).
  var glowTex = canvasTex(128, 128, function (g, w, h) {
    var rad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rad.addColorStop(0, "rgba(255,255,255,0.9)");
    rad.addColorStop(0.35, "rgba(255,255,255,0.28)");
    rad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rad; g.fillRect(0, 0, w, h);
  });
  function glow(color, x, y, z, sx, sy, op) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: op == null ? 0.45 : op,
    }));
    s.position.set(x, y, z); s.scale.set(sx, sy || sx, 1);
    return s;
  }
  var gLava = null, gLamp = null; // halos wired to the lava/lamp on-off toggles

  var pick = []; // clickable meshes
  function clickable(mesh, name, action, hint) { mesh.userData = { name: name, action: action, hint: hint || "click to open" }; pick.push(mesh); return mesh; }
  function go(url) { var f = function () { markVisited(url); window.location.href = url; }; f.__nav = url; return f; } // __nav marks doorway actions — THE KID walks to those
  var BASE = "https://kylefriesmarketing.github.io/";

  /* ---- reading the sibling games' saves (same origin) ------------------------ */
  function readSave(key, fn) {
    try { var v = localStorage.getItem(key); return v ? fn(JSON.parse(v)) : null; } catch (e) { return null; }
  }
  function countOf(x) { return x == null ? null : (Array.isArray(x) ? x.length : Object.keys(x).length); }
  // Age of Toys: 15 storybook missions on the shelf, three secret pages beyond it.
  var TT_IDS = ["naptime", "sandbox", "bathtub", "hill", "finale",
                "crumbs", "sofa", "canyonrun", "nightlight", "shelfking",
                "tagged", "boxed", "bargain", "stranger", "wayhome"];
  function ttCampaign() {
    var p = readSave("tt-campaign", function (m) { return m; }) || {};
    var done = 0;
    TT_IDS.forEach(function (id) { if (p[id]) done++; });
    var secrets = 0;
    ["midnight", "alliance", "zero"].forEach(function (id) { if (p[id]) secrets++; });
    return { done: done, secrets: secrets, started: Object.keys(p).length > 0 };
  }

  /* ---- generated GLB hero props --------------------------------------------- */
  var dracoL = new DRACOLoader(); dracoL.setDecoderPath("assets/lib/draco/");
  var gltfL = new GLTFLoader(); gltfL.setDRACOLoader(dracoL);
  var mixers = []; // AnimationMixers for rigged props, stepped in tick()
  // Generated props ease in instead of popping when their GLB finishes loading.
  var fadeIns = [];
  function fadeInObject(root) {
    var mats = [];
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        if (m && !m.__fading) { m.__fading = true; m.__wasTransparent = m.transparent; m.transparent = true; m.opacity = 0; mats.push(m); }
      });
    });
    if (!mats.length) return;
    var entry = { mats: mats, t: 0 };
    fadeIns.push(entry);
    setTimeout(function () { // safety: never leave a prop invisible if the tab was backgrounded (rAF paused)
      if (entry.t >= 1) return;
      entry.t = 1;
      for (var i = 0; i < mats.length; i++) { mats[i].opacity = 1; mats[i].transparent = mats[i].__wasTransparent; mats[i].__fading = false; }
      var ix = fadeIns.indexOf(entry); if (ix >= 0) fadeIns.splice(ix, 1);
    }, 1600);
  }
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
      fadeInObject(root);
      if (g.animations && g.animations.length) {
        var mx = new THREE.AnimationMixer(root);
        mx.clipAction(g.animations[0]).play();
        mixers.push(mx);
      }
      if (onReady) onReady(wrap, root);
    });
  }

  /* ---- the room shell ---------------------------------------------------- */
  var floorM = texMat("assets/tex/carpet.jpg", 0x6b5a48, 0.98, 4, 3);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), floorM);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  var rugCX = 0.1, rugCZ = 1.0; // the rug is movable — the war and the robot's patrol follow it
  var rug = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), texMat("assets/tex/rug.jpg", 0x27506b, 0.95, 1, 1));
  rug.rotation.x = -Math.PI / 2; rug.position.set(rugCX, 0.012, rugCZ); rug.receiveShadow = true; scene.add(rug);
  clickable(rug, "the rug", null, "the rug — the whole galaxy, floor version");
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
  clickable(winPane, "the window", null, "the window — still raining out there");
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
  var amb = new THREE.AmbientLight(0x2c3440, 1.0); scene.add(amb);
  var moon = new THREE.DirectionalLight(0x7d9cc4, 0.4); moon.position.set(2.4, 3.5, 1.0); scene.add(moon);
  var lampLight = new THREE.PointLight(0xffc27d, 1.5, 9, 1.5); lampLight.position.set(-2.4, 1.6, -0.2); lampLight.castShadow = true; scene.add(lampLight);
  var crtLight = new THREE.PointLight(0x7db4ff, 0.7, 4, 2); crtLight.position.set(2.3, 1.0, -1.4); scene.add(crtLight);
  var shelfGlow = new THREE.PointLight(0xffd9a0, 0.55, 5, 2); shelfGlow.position.set(-1.3, 1.8, -1.4); scene.add(shelfGlow);

  // (pick/clickable/go/BASE are declared up with the helpers, before the room shell)

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
    { t: "TIDEBOUND", c: 0x2e6f63, url: "https://dumb-tony.github.io/GameRepos/tidebound/", tip: "TIDEBOUND — the island that isn't on any chart (Dumb Tony's)" },
    { t: "ELEMENTARY", c: 0xb0392b, url: BASE + "sherlock/", tip: "ELEMENTARY — observe, infer, and live with being wrong" },
    { t: "CURIOUSER", c: 0xba6fd0, url: BASE + "alice/", tip: "CURIOUSER — Alice in Wonderland; wake as yourself" },
    { t: "DRACULA", c: 0xb31f2b, url: BASE + "dracula/", tip: "DRACULA — the ensemble hunt; argue with the book" },
    { t: "G FOR GEORGE", c: 0x5a6b7d, url: BASE + "george/", tip: "G FOR GEORGE — the true Great Escape; 336 feet to the trees" },
  ];
  var DECOR = [0x3b4a55, 0x5e3a3a, 0x39543e, 0x584a2e, 0x46485e, 0x2f3e4a, 0x64513a];
  var bookByTitle = {}; // WHAT'S OUT hides individual playable books by title
  // two rows; playable books stand tall and slightly proud of the row
  [0, 1].forEach(function (row) {
    var y = boardY[row], xCursor = -caseW / 2 + 0.22, d = 0;
    var order = row === 0 ? [null, PLAY[2], PLAY[6], PLAY[3], PLAY[4], PLAY[8]]
                          : [null, PLAY[0], PLAY[5], PLAY[7], PLAY[1], PLAY[9]];
    order.forEach(function (slot) {
      if (slot) {
        var bw = 0.24, bh = 0.8;
        var bk = book(bw, bh, slot.c, spineTex(slot.t, "#" + slot.c.toString(16).padStart(6, "0"), "#efe2c4"));
        bk.position.set(xCursor + bw / 2, y + bh / 2, 0.10);
        clickable(bk, slot.t, go(slot.url), slot.tip);
        bookByTitle[slot.t] = bk;
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

  /* ---- THE TOY CHEST v2: Age of Toys (against the back wall, under the window) --- */
  var chest = new THREE.Group();
  var cW = 1.05, cH = 0.5, cD = 0.62;
  var chestBody = box(cW, cH, cD, woodM); chestBody.position.y = cH / 2; chest.add(chestBody);
  // painted front panel (generated art)
  var frontM = texMat("assets/tex/chest_front.jpg", 0x7a4326, 0.7, 1, 1);
  var front = new THREE.Mesh(new THREE.PlaneGeometry(cW - 0.08, cH - 0.1), frontM);
  front.position.set(0, cH / 2, cD / 2 + 0.006); chest.add(front);
  // rounded lid, closed and centered on top (a proper treasure/toy chest dome)
  var lidG = new THREE.Group();
  var lid = new THREE.Mesh(new THREE.CylinderGeometry(cD / 2, cD / 2, cW, 22, 1, false, 0, Math.PI), woodM);
  lid.rotation.z = Math.PI / 2; lid.castShadow = true;
  lidG.add(lid);
  var lidCapL = new THREE.Mesh(new THREE.CircleGeometry(cD / 2, 22, 0, Math.PI), woodMSide);
  lidCapL.position.x = -cW / 2; lidCapL.rotation.y = -Math.PI / 2; lidG.add(lidCapL);
  var lidCapR = lidCapL.clone(); lidCapR.position.x = cW / 2; lidCapR.rotation.y = Math.PI / 2; lidG.add(lidCapR);
  lidG.position.set(0, cH, 0);                 // centered on the chest top
  lidG.rotation.x = 0;                          // domed lid, closed
  chest.add(lidG);
  // metal bands (up the body AND arcing over the domed lid) + latch
  var bandM = mat(0x2c2c30, 0.4);
  [-cW / 3, cW / 3].forEach(function (x) {
    var band = box(0.06, cH + 0.02, cD + 0.02, bandM); band.position.set(x, cH / 2, 0); chest.add(band);
    var strap = new THREE.Mesh(new THREE.CylinderGeometry(cD / 2 + 0.008, cD / 2 + 0.008, 0.06, 22, 1, false, 0, Math.PI), bandM);
    strap.rotation.z = Math.PI / 2; strap.position.set(x, cH, 0); chest.add(strap); // over the dome
  });
  var latch = box(0.1, 0.12, 0.03, mat(0xc9a23a, 0.35)); latch.position.set(0, cH - 0.08, cD / 2 + 0.02); chest.add(latch);
  // (the peeking toys and spilled blocks are gone — the chest keeps its wars inside)
  // the chest knows how the war is going (same-origin campaign save)
  var ttNow = ttCampaign();
  var chestHint = "AGE OF TOYS — the toybox RTS";
  if (ttNow.done >= TT_IDS.length) chestHint = "AGE OF TOYS — all " + TT_IDS.length + " missions won";
  else if (ttNow.started) chestHint = "AGE OF TOYS — " + ttNow.done + " / " + TT_IDS.length + " missions · the war goes on";
  chest.children.forEach(function (m) { clickable(m, "AGE OF TOYS", go(BASE + "toybox-tactics/"), chestHint); });
  lidG.children.forEach(function (m) { clickable(m, "AGE OF TOYS", go(BASE + "toybox-tactics/"), chestHint); });
  // a campaign in progress smolders inside the open chest; a finished one shines
  var chestGlowBase = ttNow.done >= TT_IDS.length ? 1.3 : (ttNow.started ? 0.85 : 0);
  var chestGlow = new THREE.PointLight(ttNow.done >= TT_IDS.length ? 0xffd76a : 0xff9d45, chestGlowBase, 2.4, 2);
  chestGlow.position.set(0, cH + 0.22, -0.1); chest.add(chestGlow);
  var chestGlowDisc = null;
  if (chestGlowBase > 0) {
    chestGlowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20),
      new THREE.MeshBasicMaterial({
        map: canvasTex(64, 64, function (g, w, h) {
          var rad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
          rad.addColorStop(0, "rgba(255,205,110,0.9)"); rad.addColorStop(1, "rgba(255,150,60,0)");
          g.fillStyle = rad; g.fillRect(0, 0, w, h);
        }),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
    chestGlowDisc.rotation.x = -Math.PI / 2;
    chestGlowDisc.position.set(0, cH + 0.02, -0.1); chest.add(chestGlowDisc);
  }
  chest.position.set(1.45, 0, -1.73); chest.rotation.y = 0; scene.add(chest); // left of the window, off the wall so the open lid clears it, clear of the nightstand

  /* ---- THE RUG WAR: two plastic armies, frozen mid-battle ------------------- */
  // Set up on the galaxy rug the way the Kid left them. Hovering wakes the
  // battle: they waddle in place, muzzles flash. Clicking joins the war.
  var war = new THREE.Group();
  var warHint = ttNow.started
    ? "the rug war — " + ttNow.done + " / " + TT_IDS.length + " missions · take command"
    : "the rug war — AGE OF TOYS, set up and waiting";
  var warFigs = [], warFlashes = [], warPuffs = []; // (tick block keys off these; GLB men idle on their own)
  // Real Age of Toys units, toy-sized. The infantry idles are skinned meshy rigs:
  // they render at their AUTHORED height with no transform (the kid taught us),
  // so scale is one empirical constant — never bbox-normalize a skinned mesh.
  var WAR_SCALE = 0.16 / 1.7;
  function warUnit(url, x, z, rotY, opts) {
    opts = opts || {};
    gltfL.load(url, function (g) {
      var root = g.scene;
      root.traverse(function (o) { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      var wrap = new THREE.Group();
      if (opts.static) { // the tank is a plain mesh — bbox normalize is safe here
        var bb = new THREE.Box3().setFromObject(root), sz = bb.getSize(new THREE.Vector3());
        root.scale.setScalar((opts.h || 0.1) / (sz.y || 1));
        bb.setFromObject(root); var c = bb.getCenter(new THREE.Vector3());
        root.position.set(-c.x, -bb.min.y, -c.z);
      } else {
        root.scale.setScalar(WAR_SCALE);
      }
      wrap.add(root);
      wrap.position.set(x, 0, z); wrap.rotation.y = rotY;
      if (opts.fallen) { wrap.rotation.z = 1.42; wrap.position.y = 0.012; } // knocked flat
      war.add(wrap);
      if (g.animations && g.animations.length) { // the units breathe their in-game idles
        var umx = new THREE.AnimationMixer(root);
        umx.clipAction(g.animations[0]).play();
        umx.setTime(Math.random() * 2); // desync the sway
        mixers.push(umx);
      }
      root.traverse(function (o) {
        if (o.isMesh) { clickable(o, "THE RUG WAR", go(BASE + "toybox-tactics/"), warHint); o.userData.war = true; }
      });
    });
  }
  // the green line vs the scouts' line, with armor in support
  warUnit("assets/props/army_soldier.glb", -0.20, -0.18, Math.PI / 2 + 0.15);
  warUnit("assets/props/army_soldier.glb", -0.27, 0.00, Math.PI / 2 - 0.1);
  warUnit("assets/props/army_bazooka.glb", -0.33, 0.09, Math.PI / 2);
  warUnit("assets/props/army_soldier.glb", -0.09, 0.07, Math.PI / 2 + 0.5, { fallen: true });
  warUnit("assets/props/army_tank.glb", -0.52, -0.05, Math.PI / 2 - 0.08, { static: true, h: 0.12 });
  warUnit("assets/props/army_archer.glb", 0.20, -0.10, -Math.PI / 2 - 0.2);
  warUnit("assets/props/army_scout.glb", 0.28, 0.06, -Math.PI / 2 + 0.1);
  warUnit("assets/props/army_archer.glb", 0.34, -0.06, -Math.PI / 2 + 0.05);
  warUnit("assets/props/army_scout.glb", 0.08, -0.15, -Math.PI / 2 - 0.6, { fallen: true });
  // cotton-ball smoke over no-man's-land — frozen, like the rest of the battle
  for (var wp = 0; wp < 3; wp++) {
    var puff = new THREE.Mesh(new THREE.SphereGeometry(0.028 + wp * 0.008, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xb9bec7, roughness: 1, transparent: true, opacity: 0.42 }));
    puff.position.set(-0.04 + wp * 0.05, 0.06 + wp * 0.035, -0.02 + wp * 0.04);
    puff.scale.y = 0.75; puff.userData.skip = true;
    warPuffs.push(puff); war.add(puff);
  }
  war.traverse(function (o) {
    if (o.isMesh && !o.userData.skip) {
      clickable(o, "THE RUG WAR", go(BASE + "toybox-tactics/"), warHint);
      o.userData.war = true;
    }
  });
  war.position.set(rugCX, 0.013, rugCZ); war.rotation.y = 0.32; scene.add(war);
  var warHeat = 0;

  /* ---- THE DESK: computer, brain, notebook, lamp (left side) --------------- */
  var desk = new THREE.Group();
  var dTop = box(2.1, 0.07, 0.95, woodM); dTop.position.y = 0.78; desk.add(dTop);
  [[-0.98, 0], [0.98, 0]].forEach(function (p) {
    var panel = box(0.07, 0.75, 0.9, woodMSide); panel.position.set(p[0], 0.375, 0); desk.add(panel);
  });
  var drawer = box(0.9, 0.16, 0.06, woodMSide); drawer.position.set(-0.5, 0.66, 0.44); desk.add(drawer);
  var knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), mat(0xc9a23a, 0.35)); knob.position.set(-0.5, 0.66, 0.49); desk.add(knob);

  // the beige 90s computer — CHAMELEON 3D (live via the kylefriesmarketing/chameleon mirror)
  var pc = new THREE.Group();
  var beige = mat(0xd6cdb4, 0.55), beigeDark = mat(0xbfb59a, 0.6);
  var mon = box(0.62, 0.5, 0.5, beige); mon.position.y = 1.14; pc.add(mon);
  var monFoot = box(0.3, 0.07, 0.3, beigeDark); monFoot.position.y = 0.855; pc.add(monFoot);
  var monNeck = box(0.18, 0.06, 0.18, beigeDark); monNeck.position.y = 0.91; pc.add(monNeck);
  var screenM = texMat("assets/tex/screen_c3d.jpg", 0x0e3a34, 0.3, 1, 1);
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
  // the PC runs a screensaver if you poke it (it has nothing better to do yet)
  var ssCanvas = document.createElement("canvas"); ssCanvas.width = 256; ssCanvas.height = 192;
  var ssCtx = ssCanvas.getContext("2d");
  var ssT = new THREE.CanvasTexture(ssCanvas);
  var ssM = new THREE.MeshBasicMaterial({ map: ssT });
  var ssMode = 0; // 0: the C3D splash · 1: starfield · 2: the bouncing logo
  var ssStars = [];
  for (var sst = 0; sst < 70; sst++) ssStars.push({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: 0.15 + Math.random() * 0.85 });
  var ssLogo = { x: 40, y: 60, vx: 46, vy: 36, hue: 130 };
  function cycleScreen() {
    ssMode = (ssMode + 1) % 3;
    pcScreen.material = ssMode ? ssM : screenM;
    clickSfx(ssMode ? 1900 : 1300);
  }
  function drawScreensaver(dt2) {
    var g = ssCtx, w = 256, h = 192;
    if (ssMode === 1) { // flying through the wallpaper stars
      g.fillStyle = "rgba(4,6,12,0.35)"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#dfe6ff";
      for (var i = 0; i < ssStars.length; i++) {
        var st = ssStars[i];
        st.z -= dt2 * 0.35;
        if (st.z < 0.06) { st.x = Math.random() - 0.5; st.y = Math.random() - 0.5; st.z = 1; }
        var px = w / 2 + st.x / st.z * w * 0.9, py = h / 2 + st.y / st.z * h * 0.9;
        var r = Math.min(2.6, 0.4 / st.z);
        if (px > 0 && px < w && py > 0 && py < h) g.fillRect(px, py, r, r);
      }
    } else { // the logo roams, kisses a corner once an epoch
      g.fillStyle = "#06080c"; g.fillRect(0, 0, w, h);
      var lw = 92, lh = 34;
      ssLogo.x += ssLogo.vx * dt2; ssLogo.y += ssLogo.vy * dt2;
      if (ssLogo.x < 0 || ssLogo.x > w - lw) { ssLogo.vx *= -1; ssLogo.x = Math.max(0, Math.min(w - lw, ssLogo.x)); ssLogo.hue = (ssLogo.hue + 67) % 360; }
      if (ssLogo.y < 0 || ssLogo.y > h - lh) { ssLogo.vy *= -1; ssLogo.y = Math.max(0, Math.min(h - lh, ssLogo.y)); ssLogo.hue = (ssLogo.hue + 67) % 360; }
      g.strokeStyle = "hsl(" + ssLogo.hue + ",80%,60%)"; g.lineWidth = 2;
      g.strokeRect(ssLogo.x, ssLogo.y, lw, lh);
      g.fillStyle = "hsl(" + ssLogo.hue + ",80%,70%)";
      g.font = "bold 17px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("C3D", ssLogo.x + lw / 2, ssLogo.y + lh / 2 + 1);
    }
    g.fillStyle = "rgba(0,0,0,0.18)"; // cheap scanlines
    for (var sl = 0; sl < h; sl += 4) g.fillRect(0, sl, w, 1);
    ssT.needsUpdate = true;
  }
  pc.position.set(0.35, 0, -0.12); pc.rotation.y = -0.12; desk.add(pc);
  var tower = box(0.24, 0.62, 0.6, beige); tower.position.set(1.28, 0.31, -0.05); desk.add(tower);
  var towerSlots = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.3), new THREE.MeshStandardMaterial({
    map: canvasTex(64, 96, function (g, w, h) {
      g.fillStyle = "#bfb59a"; g.fillRect(0, 0, w, h); g.fillStyle = "#6e6753";
      g.fillRect(6, 10, w - 12, 10); g.fillRect(6, 28, w - 12, 10); g.fillStyle = "#3a3a2e"; g.fillRect(6, 60, w - 12, 4);
    }), roughness: 0.6,
  }));
  towerSlots.position.set(1.28, 0.42, 0.256); desk.add(towerSlots);
  var CHAMELEON_URL = "https://kylefriesmarketing.github.io/chameleon/chameleon3d.html";
  [mon, pcScreen, kb, tower].forEach(function (m) { clickable(m, "CHAMELEON 3D", go(CHAMELEON_URL), "CHAMELEON 3D — Dumb Tony's kitchen crawl · click to play"); });

  // the brain on the desk — BRAINROT (generated neon brain, glows its own colors)
  var brainG = new THREE.Group();
  var BRAINROT_URL = "https://dumb-tony.github.io/GameRepos/brainrot/";
  var BRAINROT_HINT = "BRAINROT: RISE OF THE MEME — Dumb Tony's mind-plague strategy";
  var brainStand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.06, 20), woodMSide); brainStand.position.y = 0.845; brainG.add(brainStand);
  clickable(brainStand, "BRAINROT", go(BRAINROT_URL), BRAINROT_HINT);
  var brainGlow = new THREE.PointLight(0xff3bd0, 0.5, 1.1, 2); brainGlow.position.set(0, 1.02, 0); brainG.add(brainGlow);
  gltfL.load("assets/props/brain.glb", function (g) {
    var root = g.scene;
    root.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        if (o.material && o.material.emissive !== undefined) { // let the neon paint self-illuminate
          if (o.material.map) o.material.emissiveMap = o.material.map;
          o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveIntensity = 0.45;
          o.material.needsUpdate = true;
        }
      }
    });
    var bb = new THREE.Box3().setFromObject(root), sz = bb.getSize(new THREE.Vector3());
    root.scale.setScalar(0.3 / (Math.max(sz.x, sz.y, sz.z) || 1)); // toy-sized, shards included
    bb.setFromObject(root); var ctr = bb.getCenter(new THREE.Vector3());
    root.position.set(-ctr.x, 0.875 - bb.min.y, -ctr.z); // centered on the stand
    brainG.add(root); fadeInObject(root);
    root.traverse(function (o) { if (o.isMesh) clickable(o, "BRAINROT", go(BRAINROT_URL), BRAINROT_HINT); });
  });
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
      if (gLamp) gLamp.material.opacity = lampOn ? 0.4 : 0;
      clickSfx(lampOn ? 1900 : 1300);
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
  // a rare shooting star streaks across the ceiling — make a wish
  var streakTex = canvasTex(128, 40, function (g, w, h) {
    g.clearRect(0, 0, w, h);
    var lg = g.createLinearGradient(0, 0, w, 0); // tapering tail → bright head (right)
    lg.addColorStop(0, "rgba(200,230,255,0)");
    lg.addColorStop(0.78, "rgba(214,236,255,0.6)");
    lg.addColorStop(1, "rgba(255,255,255,0.95)");
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(0, h / 2);
    g.quadraticCurveTo(w * 0.6, h * 0.14, w, h * 0.5);
    g.quadraticCurveTo(w * 0.6, h * 0.86, 0, h * 0.5);
    g.closePath(); g.fill();
    var rg = g.createRadialGradient(w * 0.9, h / 2, 0, w * 0.9, h / 2, h * 0.62); // the head
    rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(w * 0.55, 0, w * 0.45, h);
  });
  var shootStar = new THREE.Sprite(new THREE.SpriteMaterial({
    map: streakTex, color: 0xdff0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  }));
  shootStar.scale.set(0.85, 0.19, 1); shootStar.position.set(0, 3.34, 0); scene.add(shootStar);
  var shootT = -1, shootNext = 6 + Math.random() * 16, shootFrom = new THREE.Vector3(), shootTo = new THREE.Vector3();

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

  /* ---- the wall clock (it tells YOUR time) ------------------------------------ */
  var clockG = new THREE.Group();
  var clockRim = new THREE.Mesh(new THREE.CircleGeometry(0.175, 36), mat(0x2a2019, 0.6));
  var clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.155, 36),
    new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.9 }));
  clockFace.position.z = 0.004; clockG.add(clockRim); clockG.add(clockFace);
  for (var ci = 0; ci < 12; ci++) {
    var tk = new THREE.Mesh(new THREE.PlaneGeometry(ci % 3 ? 0.008 : 0.014, 0.03),
      new THREE.MeshBasicMaterial({ color: 0x333333 }));
    var ang = ci / 12 * Math.PI * 2;
    tk.position.set(Math.sin(ang) * 0.13, Math.cos(ang) * 0.13, 0.006);
    tk.rotation.z = -ang; clockG.add(tk);
  }
  function clockHand(len, w, col, z) {
    var g = new THREE.Group();
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ color: col }));
    m.position.y = len / 2 - 0.012; g.add(m); g.position.z = z; clockG.add(g); return g;
  }
  var hourHand = clockHand(0.08, 0.012, 0x222222, 0.008);
  var minHand = clockHand(0.125, 0.008, 0x222222, 0.010);
  var secHand = clockHand(0.13, 0.003, 0xc0392b, 0.012);
  clockG.position.set(2.35, 3.08, -2.53); scene.add(clockG);
  clickable(clockFace, "the clock", null, "the clock — it really is that time");

  /* ---- the door (left wall; the rest of the house is out there) --------------- */
  var doorM = mat(0x4a3524, 0.75);
  var doorSlab = box(0.05, 2.05, 0.92, doorM); doorSlab.position.set(-3.56, 1.025, 2.1); scene.add(doorSlab);
  [[2.09, 0.08, 1.06, 2.1], [1.02, 2.12, 0.08, 1.62], [1.02, 2.12, 0.08, 2.58]].forEach(function (j) {
    var m = box(0.09, j[1], j[2], mat(0x2a2019, 0.8)); m.position.set(-3.53, j[0], j[3]); scene.add(m);
  });
  var knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.3, metalness: 0.6 }));
  knob.position.set(-3.52, 1.0, 1.78); scene.add(knob);
  var spill = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09),
    new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  spill.rotation.x = -Math.PI / 2; spill.rotation.z = Math.PI / 2;
  spill.position.set(-3.47, 0.013, 2.1); scene.add(spill);
  [doorSlab, knob].forEach(function (m) {
    clickable(m, "the door", null, "the door — the rest of the house can wait");
  });
  // once a night, somebody knocks softly — they know you're still up.
  // ?knock=5 makes them impatient (seconds until the knock, for tinkering).
  var knockAt = -1, knockAnim = -1;
  var KNOCK_DEBUG = (function () {
    var m = /[?&]knock=(\d+)/.exec(location.search);
    return m ? parseInt(m[1], 10) : 0;
  })();

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
    applyNeonPaint(); // a saved sign color waits for the texture
  });

  /* ---- soft bloom halos on the bright sources (billboards, additive) ---------- */
  var gNeon = glow(0xff5aa8, -1.3, 2.86, -2.46, 2.7, 1.5, 0.5);  // the neon sign (recolorable)
  scene.add(gNeon);
  var gBrain = glow(0xff4d7d, -2.52, 1.0, -0.38, 0.85, 0.85, 0.5); // the Brainrot brain (follows the desk)
  scene.add(gBrain);
  gLava = glow(0xff5a7d, 0.55, 0.86, -2.16, 0.7, 0.95, 0.55);    // the lava lamp
  scene.add(gLava);
  gLamp = glow(0xffb14d, -2.4, 1.62, -0.18, 0.95, 0.95, 0.4);    // the desk lamp
  scene.add(gLamp);
  var gCrt = glow(0x8fb8ff, 2.7, 0.82, -0.98, 0.9, 0.72, 0.4);   // the CRT screen (follows the TV)
  scene.add(gCrt);

  /* ---- the calendar has opinions ---------------------------------------------- */
  // December: the string lights go red-green-gold and a paper snowflake hits the
  // window. Late October: pumpkin lights, and the lava lamp runs slime. July 11:
  // the room's birthday (it first opened 2026-07-11) — a crayon banner and party
  // lights. ?date=MM-DD pins the calendar for tinkering.
  var DATE_DEBUG = /[?&]date=(\d\d)-(\d\d)/.exec(location.search);
  var _md = DATE_DEBUG ? [+DATE_DEBUG[1], +DATE_DEBUG[2]]
                       : [new Date().getMonth() + 1, new Date().getDate()];
  var season = null;
  if (_md[0] === 12 && _md[1] <= 26) season = "yule";
  else if (_md[0] === 10 && _md[1] >= 24) season = "spook";
  else if (_md[0] === 7 && _md[1] === 11) season = "bday";
  if (season === "yule") { // a paper snowflake, taped inside the glass
    var flakeT = canvasTex(128, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "rgba(240,246,255,0.95)"; g.lineWidth = 4; g.lineCap = "round";
      g.translate(w / 2, h / 2);
      for (var a = 0; a < 6; a++) {
        g.rotate(Math.PI / 3);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 52); g.stroke();
        [20, 36].forEach(function (r) {
          g.beginPath(); g.moveTo(0, r); g.lineTo(10, r + 10); g.stroke();
          g.beginPath(); g.moveTo(0, r); g.lineTo(-10, r + 10); g.stroke();
        });
      }
    });
    var flake = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26),
      new THREE.MeshBasicMaterial({ map: flakeT, transparent: true, depthWrite: false }));
    flake.position.set(2.02, 2.32, -2.512); flake.rotation.z = 0.2; scene.add(flake);
  }
  if (season === "bday") { // the crayon banner, taped over the wallpaper border
    var bannerT = canvasTex(512, 64, function (g, w, h) {
      g.fillStyle = "#efe6d0"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#c9b895"; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
      var cols = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#e67e22"];
      g.font = "bold 32px Georgia, serif"; g.textBaseline = "middle";
      var msg = "HAPPY BIRTHDAY, ROOM", x = 20;
      for (var i = 0; i < msg.length; i++) {
        g.fillStyle = cols[i % cols.length];
        g.fillText(msg[i], x, h / 2 + (i % 2 ? 3 : -3));
        x += g.measureText(msg[i]).width + 2;
      }
    });
    var banner = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.21), new THREE.MeshBasicMaterial({ map: bannerT }));
    banner.position.set(-1.3, 2.56, -2.52); banner.rotation.z = 0.025; scene.add(banner);
  }

  /* ---- THE LAVA LAMP on a little nightstand --------------------------------- */
  var nstand = new THREE.Group();
  var nsTop = box(0.5, 0.06, 0.42, woodM); nsTop.position.y = 0.52; nstand.add(nsTop);
  var nsBody = box(0.44, 0.46, 0.36, woodMSide); nsBody.position.y = 0.26; nstand.add(nsBody);
  var lava = new THREE.Group();
  var lvBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.085, 0.1, 18), mat(0x8a8f98, 0.3)); lvBase.position.y = 0.6; lava.add(lvBase);
  var lvCap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.05, 0.07, 18), mat(0x8a8f98, 0.3)); lvCap.position.y = 1.03; lava.add(lvCap);
  // pink goo most of the year; slime for the last week of October
  var lavaCol = season === "spook"
    ? { glass: 0xa8ff7d, blob: 0x7be04a, glow: 0x46c92d, light: 0x7dff5a }
    : { glass: 0xff7d5a, blob: 0xff4d7d, glow: 0xff2d63, light: 0xff5a7d };
  var lvGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.082, 0.36, 18, 1, true),
    new THREE.MeshStandardMaterial({ color: lavaCol.glass, roughness: 0.15, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
  lvGlass.position.y = 0.83; lava.add(lvGlass);
  var blobs = [];
  for (var bi = 0; bi < 5; bi++) {
    var blob = new THREE.Mesh(new THREE.SphereGeometry(0.018 + Math.random() * 0.02, 12, 10),
      new THREE.MeshStandardMaterial({ color: lavaCol.blob, emissive: lavaCol.glow, emissiveIntensity: 1.6, roughness: 0.3 }));
    blob.userData = { phase: Math.random() * 6.28, speed: 0.25 + Math.random() * 0.3 };
    lava.add(blob); blobs.push(blob);
  }
  var lavaLight = new THREE.PointLight(lavaCol.light, 0.8, 3.2, 2); lavaLight.position.set(0, 0.9, 0); lava.add(lavaLight);
  var lavaOn = true;
  [lvBase, lvCap, lvGlass].forEach(function (m) {
    clickable(m, "the lava lamp", function () {
      lavaOn = !lavaOn;
      lavaLight.intensity = lavaOn ? 0.8 : 0.05;
      if (gLava) gLava.material.opacity = lavaOn ? 0.55 : 0;
      blobs.forEach(function (b) { b.material.emissiveIntensity = lavaOn ? 1.6 : 0.15; });
      clickSfx(lavaOn ? 1700 : 1200);
    }, "the lava lamp — groovy");
  });
  nstand.add(lava);
  nstand.position.set(0.55, 0, -2.25); scene.add(nstand);

  /* ---- STRING LIGHTS under the wallpaper border ------------------------------ */
  var bulbs = [], bulbCols = [0xff6a5a, 0xffd166, 0x8ad7ff, 0x7be08a, 0xc79bff];
  if (season === "yule") bulbCols = [0xff4444, 0x3fae5a, 0xffd166, 0xff4444, 0x3fae5a];
  else if (season === "spook") bulbCols = [0xff8c2a, 0x9b5de5, 0xff8c2a, 0x9b5de5, 0xff8c2a];
  var twinkleRate = season === "bday" ? 3.4 : 1.6; // party lights on the room's birthday
  for (var li = 0; li < 13; li++) {
    var bx = -4.1 + li * 0.68, sag = 0.1 * Math.sin((li % 4) / 3 * Math.PI);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8),
      new THREE.MeshBasicMaterial({ color: bulbCols[li % 5], transparent: true, opacity: 0.9 }));
    bulb.position.set(bx, 2.42 - sag, -2.5);
    bulb.userData.phase = li * 0.7;
    var bglow = glow(bulbCols[li % 5], bx, 2.42 - sag, -2.48, 0.16, 0.16, 0.5);
    bulb.userData.glow = bglow; scene.add(bglow); // little halo so each bulb reads as lit
    scene.add(bulb); bulbs.push(bulb);
  }
  scene.add(glow(0xffb060, 1.95, 2.28, -2.5, 0.55, 0.55, 0.45)); // the streetlamp out the window

  /* ---- THE BOOMBOX: synth lo-fi + rain (WebAudio, no files) ------------------ */
  var boom = new THREE.Group();
  var boomCones = []; // the speaker cones — they thump to the beat when the tape's on
  var bbBody = box(0.56, 0.24, 0.17, mat(0x23262c, 0.45)); bbBody.position.y = 0.12; boom.add(bbBody);
  [-0.17, 0.17].forEach(function (x) {
    var spk = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 20), mat(0x101216, 0.6));
    spk.rotation.x = Math.PI / 2; spk.position.set(x, 0.12, 0.085); boom.add(spk);
    var cone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.015, 14), mat(0x3a3f48, 0.5));
    cone.rotation.x = Math.PI / 2; cone.position.set(x, 0.12, 0.093); cone.__z0 = 0.093; // plain prop (clickable() rewrites userData)
    boom.add(cone); boomCones.push(cone);
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
    var rg = ac.createGain(); rg.gain.value = phase.rainG; // the hour decides how hard it pours
    rain.connect(lp); lp.connect(hp); hp.connect(rg); rg.connect(master); rain.start();
    // the tape: an 8-bar lofi loop rendered offline once, then looped forever
    renderTune(ac.sampleRate, function (buf) {
      var tape = ac.createBufferSource(); tape.buffer = buf; tape.loop = true;
      var tg = ac.createGain(); tg.gain.value = 0.42;
      tape.connect(tg); tg.connect(master); tape.start();
    });
    acNodes = { master: master, rain: rg };
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
  // thunder, if the box is on. strength ~1 = overhead crack, ~0.3 = far grumble
  function rumble(strength) {
    if (!ac || !audioOn) return;
    var s = strength == null ? 1 : strength;
    var secs = 1.0 + (1 - s) * 1.3; // distant thunder rolls longer
    var len = ac.sampleRate * secs, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource(); src.buffer = buf;
    var f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 70 + 80 * s;
    var g = ac.createGain(); g.gain.value = 0.08 + 0.17 * s;
    src.connect(f); f.connect(g); g.connect(acNodes.master); src.start();
  }
  function clickSfx(freq) { // a dry little switch tick
    if (!ac || !audioOn) return;
    var o = ac.createOscillator(); o.type = "square"; o.frequency.value = freq || 1600;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.035, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.04);
    o.connect(g); g.connect(acNodes.master); o.start(); o.stop(ac.currentTime + 0.06);
  }
  function ratchetSfx() { // winding the robot: five quick spring clicks
    if (!ac || !audioOn) return;
    for (var i = 0; i < 5; i++) {
      var t0 = ac.currentTime + i * 0.065;
      var o = ac.createOscillator(); o.type = "square"; o.frequency.value = 540 + i * 55;
      var g = ac.createGain();
      g.gain.setValueAtTime(0.03, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
      o.connect(g); g.connect(acNodes.master); o.start(t0); o.stop(t0 + 0.05);
    }
  }
  function snoreSfx() { // a low purr in, a breathy sigh out
    if (!ac || !audioOn) return;
    var t0 = ac.currentTime;
    var o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(64, t0); o.frequency.linearRampToValueAtTime(46, t0 + 1.0);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    o.connect(g); g.connect(acNodes.master); o.start(t0); o.stop(t0 + 1.3);
    var len = ac.sampleRate * 0.9, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i / len);
    var n = ac.createBufferSource(); n.buffer = b;
    var f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 480;
    var ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t0 + 1.25);
    ng.gain.exponentialRampToValueAtTime(0.03, t0 + 1.65);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
    n.connect(f); f.connect(ng); ng.connect(acNodes.master); n.start(t0 + 1.25);
  }
  function knockSfx() { // knuckles on a hollow door: two firm, one shy
    if (!ac || !audioOn) return;
    [0, 0.24, 0.46].forEach(function (at, i) {
      var t0 = ac.currentTime + at;
      var o = ac.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(115 - i * 10, t0);
      o.frequency.exponentialRampToValueAtTime(55, t0 + 0.09);
      var g = ac.createGain();
      g.gain.setValueAtTime(i === 2 ? 0.09 : 0.15, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.connect(g); g.connect(acNodes.master); o.start(t0); o.stop(t0 + 0.2);
    });
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
  // up on its own wall shelf over the bed head (right wall), angled into the room
  var bShelf = box(0.75, 0.045, 0.28, woodM); bShelf.position.set(3.41, 1.35, 0.35); scene.add(bShelf);
  [0.12, 0.58].forEach(function (bz) {
    var bracket = box(0.035, 0.16, 0.2, mat(0x2a2019, 0.8));
    bracket.position.set(3.5, 1.25, bz); scene.add(bracket);
  });
  boom.position.set(3.41, 1.373, 0.35); boom.rotation.y = -Math.PI / 2 + 0.12; scene.add(boom);

  /* ---- the entry: camera dolly in + the tape starts (click unlocked audio) ---- */
  var introT = -1, INTRO = 3.2, kidGreet = false; // kidGreet: wave hello once we're inside
  var noMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Touch devices get no hover tooltips, so a first-time phone visitor can't tell the
  // room is full of doorways — show one tasteful, self-fading hint (once per device).
  function showTouchHint() {
    if (!(window.matchMedia && window.matchMedia("(hover: none)").matches)) return;
    try { if (localStorage.getItem("room-tap-hint")) return; localStorage.setItem("room-tap-hint", "1"); } catch (e) { }
    var h = document.createElement("div");
    h.textContent = "every object is a doorway — tap around";
    h.setAttribute("style", "position:fixed;left:50%;bottom:8%;transform:translateX(-50%);z-index:8;" +
      "pointer-events:none;font-family:'Inter',system-ui,sans-serif;font-size:13px;letter-spacing:.03em;" +
      "color:#e7e3d8;background:rgba(8,12,18,.82);border:1px solid rgba(120,130,150,.35);border-radius:999px;" +
      "padding:9px 16px;opacity:0;transition:opacity .6s;max-width:82vw;text-align:center");
    document.body.appendChild(h);
    setTimeout(function () { h.style.opacity = "1"; }, 3600);   // after the dolly settles
    setTimeout(function () { h.style.opacity = "0"; }, 8600);
    setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 9400);
  }
  /* ---- the kid talks to you: a bubble that reads your save files -------------- */
  // Same-origin localStorage the notebook already reads — lets him greet returning
  // players and nudge whatever they left unfinished. Cross-origin games (Tony's)
  // can't be read from here, so they're never referenced.
  var GAME_SAVES = {
    "CHOOSE WISELY":  { key: "chooseWisely.meta.v2", pick: function (m) { return countOf(m.endingsFound); }, total: 56, noun: "endings" },
    "NINE CIRCLES":   { key: "nc_persist",      pick: function (m) { return countOf(m.endings); }, noun: "endings" },
    "STILL BREATHING":{ key: "sb_persist",      pick: function (m) { return countOf(m.endings); }, noun: "endings" },
    "SOUTH":          { key: "south_persist",   pick: function (m) { return countOf(m.endings); }, noun: "endings" },
    "NOBODY":         { key: "nobody_persist",  pick: function (m) { return countOf(m.endings); }, noun: "endings" },
    "CURIOUSER":      { key: "alice_persist",   pick: function (m) { return countOf(m.wakings); }, total: 8, noun: "wakings" },
    "DRACULA":        { key: "dracula_persist", pick: function (m) { return countOf(m.endings); }, total: 6, noun: "endings" },
    "ELEMENTARY":     { key: "sherlock_persist",pick: function (m) { return m && m.solved ? countOf(m.solved) : null; }, total: 11, noun: "cases" },
    "G FOR GEORGE":   { key: "gg_persist",      pick: function (m) { return countOf(m.endings); }, total: 15, noun: "tellings" }
  };
  function gameProgress(title) {
    var g = GAME_SAVES[title]; if (!g) return null;
    var n = readSave(g.key, g.pick);
    return { started: n != null && n > 0, done: n || 0, total: g.total || 0, noun: g.noun };
  }
  var priorVisits = 0; // visits BEFORE this one — captured in __roomEnter, read at greet
  function kidGreetLine() {
    var nm = roomOwnerName(); // if the room's been claimed, sometimes he says so
    if (nm && Math.random() < 0.35) return "welcome back to " + nm + "'s room. i just live here.";
    var unfinished = [], anyStarted = false;
    for (var t in GAME_SAVES) {
      var p = gameProgress(t); if (!p || !p.started) continue;
      anyStarted = true;
      if (!p.total || p.done < p.total) unfinished.push({ t: t, p: p });
    }
    if (priorVisits <= 0 && !anyStarted) return "hi! pick any book — i'll grab it for you.";
    if (unfinished.length) {
      var u = unfinished[(Math.random() * unfinished.length) | 0];
      var left = u.p.total ? (u.p.total - u.p.done) + " more " + u.p.noun : "more waiting";
      return "welcome back — " + u.t.toLowerCase() + " still has " + left + ".";
    }
    if (anyStarted) return "welcome back! everything's where you left it.";
    return "welcome back — what'll it be this time?";
  }
  function kidFetchLine(title) {
    var p = gameProgress(title); if (!p) return null;
    if (p.total && p.done >= p.total) return "again? you've seen every ending.";
    if (p.started) return "back for more — good.";
    return null; // first time with this one: let the game speak for itself
  }
  var kidBubbleEl = null, kidBubbleUntil = 0, kbBubV = new THREE.Vector3();
  function kidSay(text, dur) {
    if (!text) return;
    if (!kidBubbleEl) {
      kidBubbleEl = document.createElement("div");
      kidBubbleEl.setAttribute("style", "position:fixed;z-index:7;pointer-events:none;transform:translate(-50%,-100%);" +
        "font-family:'Inter',system-ui,sans-serif;font-size:12.5px;line-height:1.3;letter-spacing:.01em;color:#f3efe4;" +
        "background:rgba(12,16,24,.9);border:1px solid rgba(150,160,180,.4);border-radius:12px;padding:7px 12px;" +
        "max-width:min(60vw,240px);text-align:center;opacity:0;transition:opacity .35s;white-space:normal");
      document.body.appendChild(kidBubbleEl);
    }
    kidBubbleEl.textContent = text;
    kidBubbleUntil = performance.now() / 1000 + (dur || 4.5);
    kidBubbleEl.style.opacity = "1";
  }
  function updateKidBubble() { // follow the kid's head each frame, fade on its own
    if (!kidBubbleEl) return;
    if (performance.now() / 1000 > kidBubbleUntil) { if (kidBubbleEl.style.opacity !== "0") kidBubbleEl.style.opacity = "0"; return; }
    kid.getWorldPosition(kbBubV); kbBubV.y += 1.45; kbBubV.project(camera);
    if (kbBubV.z > 1) { kidBubbleEl.style.opacity = "0"; return; } // behind the camera
    kidBubbleEl.style.left = ((kbBubV.x * 0.5 + 0.5) * window.innerWidth) + "px";
    kidBubbleEl.style.top = ((-kbBubV.y * 0.5 + 0.5) * window.innerHeight) + "px";
  }

  window.__roomEnter = function () {
    introT = noMotion ? 1 : 0; // reduced motion skips the dolly, keeps the music
    if (!ac) buildAudio();
    audioOn = true; ac.resume(); powerLED.material.color.set(0xff3b30);
    kidGreet = true; // he looks up and waves as you walk in
    try { // how many times you've stepped in before (drives his greeting)
      priorVisits = parseInt(localStorage.getItem("room-visits") || "0", 10) || 0;
      localStorage.setItem("room-visits", priorVisits + 1);
    } catch (e) { priorVisits = 0; }
    showTouchHint();
    var last = null;
    try { last = localStorage.getItem("room-knock"); } catch (e) { /* private mode */ }
    if (KNOCK_DEBUG || last !== new Date().toDateString()) {
      knockAt = performance.now() / 1000 + (KNOCK_DEBUG || 45 + Math.random() * 105);
    }
  };
  // A quiet "coming to Steam" line on the entry card — the room is one release, not
  // a pile of links. Informational for now (pointer-events off so it never eats the
  // click that opens the door); swap to an <a href> once the wishlist page is live.
  (function steamBeat() {
    var inner = document.querySelector("#enter .e-inner");
    if (!inner || document.getElementById("steam-cta")) return;
    var el = document.createElement("div");
    el.id = "steam-cta";
    el.textContent = "coming soon to Steam · the whole shelf, one release";
    el.setAttribute("style", "margin-top:18px;pointer-events:none;font-family:'Inter',system-ui,sans-serif;" +
      "font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:#c9c4b6;opacity:.82;" +
      "text-shadow:0 1px 8px rgba(0,0,0,.9)");
    inner.appendChild(el);
  })();
  if (window.__entered) window.__roomEnter(); // card clicked before this module loaded
  document.addEventListener("visibilitychange", function () { // the tape pauses when you leave
    if (!ac || !audioOn) return;
    if (document.hidden) ac.suspend(); else ac.resume();
  });

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

  /* ---- the room follows your clock -------------------------------------------- */
  // Four moods keyed to the visitor's real hour. Each phase sets the ambient
  // wash, the "moon" (which doubles as daylight), the window's lift, how hard
  // it rains (streaks + audio), how the TV behaves, and how often the storm
  // flashes. ?hour=23 in the URL pins a phase for tinkering.
  var PHASES = {
    day:     { amb: 0x4a5468, ambI: 1.3,  moonC: 0xbcc8da, moonI: 0.8,  lift: 1.85, liftB: 1.0,  stars: 0.12, streaks: 36, rainG: 0.04,  test: false, fMin: 20, fRnd: 30, on: [13, 9], off: [2, 3] },
    dusk:    { amb: 0x4a3c40, ambI: 1.15, moonC: 0xe8935a, moonI: 0.55, lift: 1.5,  liftB: 0.94, stars: 0.3,  streaks: 44, rainG: 0.05,  test: false, fMin: 16, fRnd: 26, on: [9, 8],  off: [3, 4] },
    evening: { amb: 0x2c3440, ambI: 1.0,  moonC: 0x7d9cc4, moonI: 0.4,  lift: 1.25, liftB: 1.06, stars: 0.45, streaks: 44, rainG: 0.05,  test: false, fMin: 14, fRnd: 26, on: [9, 8],  off: [3, 4] },
    night:   { amb: 0x1e2634, ambI: 0.85, moonC: 0x8fb4e8, moonI: 0.52, lift: 0.92, liftB: 1.1,  stars: 0.78, streaks: 64, rainG: 0.085, test: true,  fMin: 8,  fRnd: 14, on: [7, 5],  off: [4, 5] },
  };
  var HOUR_DEBUG = (function () {
    var m = /[?&]hour=(\d+)/.exec(location.search);
    return m ? parseInt(m[1], 10) % 24 : null;
  })();
  function roomHour() { return HOUR_DEBUG != null ? HOUR_DEBUG : new Date().getHours(); }
  function phaseFor(h) {
    if (h >= 6 && h < 17) return PHASES.day;      // gray rainy afternoon
    if (h >= 17 && h < 20) return PHASES.dusk;    // the last warm light
    if (h >= 20) return PHASES.evening;           // after bedtime (the classic room)
    return PHASES.night;                          // the dead of night
  }
  var phase = PHASES.evening, phaseHour = -1, phaseOverride = null; // the wall switch can pin a mood
  function applyPhaseObj(p) {
    if (p === phase && amb.intensity === p.ambI) return;
    phase = p;
    amb.color.set(p.amb); amb.intensity = p.ambI;
    moon.color.set(p.moonC); moon.intensity = p.moonI;
    winViewM.color.setRGB(p.lift, p.lift, p.lift * p.liftB);
    if (acNodes && acNodes.rain) acNodes.rain.gain.value = p.rainG;
  }
  function applyPhase() {
    if (phaseOverride) { applyPhaseObj(PHASES[phaseOverride]); return; }
    var h = roomHour();
    if (h === phaseHour) return;
    phaseHour = h;
    applyPhaseObj(phaseFor(h));
  }
  applyPhase();

  /* ---- the light switch by the door: day / night / follow-the-clock ----------- */
  var swPlate = box(0.03, 0.14, 0.09, mat(0xeae4d6, 0.6)); swPlate.position.set(-3.55, 1.32, 1.62); scene.add(swPlate);
  var swNub = box(0.03, 0.05, 0.035, mat(0x3a3a3a, 0.4)); swNub.position.set(-3.53, 1.32, 1.62); scene.add(swNub);
  var lightMode = 0; // 0 = follow the clock, 1 = day (bright), 2 = night (dark)
  try { var _lm = parseInt(localStorage.getItem("room-light"), 10); if (_lm === 1 || _lm === 2) lightMode = _lm; } catch (e) { /* private mode */ }
  function applyLightMode() {
    phaseOverride = lightMode === 1 ? "day" : lightMode === 2 ? "night" : null;
    phaseHour = -1; applyPhase();
    swNub.position.y = 1.32 + (lightMode === 1 ? 0.028 : lightMode === 2 ? -0.028 : 0);
    var hint = lightMode === 1 ? "the light switch — day" : lightMode === 2 ? "the light switch — night" : "the light switch — follows your clock";
    swPlate.userData.hint = swNub.userData.hint = hint;
  }
  function cycleLights() {
    lightMode = (lightMode + 1) % 3;
    applyLightMode();
    try { localStorage.setItem("room-light", String(lightMode)); } catch (e) { /* private mode */ }
    if (typeof clickSfx === "function") clickSfx(lightMode ? 1500 : 1000);
  }
  [swPlate, swNub].forEach(function (m) { clickable(m, "the light switch", cycleLights, "the light switch — day, night, or follow your clock"); });
  if (lightMode) applyLightMode(); // restore the mood the visitor last chose
  // late-night TV has nothing on: SMPTE-ish bars where the cartoons would be
  var testT = canvasTex(128, 96, function (g, w, h) {
    ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"].forEach(function (c, i) {
      g.fillStyle = c; g.fillRect(Math.floor(i * w / 7), 0, Math.ceil(w / 7) + 1, Math.floor(h * 0.72));
    });
    g.fillStyle = "#101018"; g.fillRect(0, Math.floor(h * 0.72), w, h);
    g.fillStyle = "#9a9aa8"; g.font = "bold 11px monospace"; g.textAlign = "center";
    g.fillText("OFF AIR", w / 2, h * 0.88);
  });

  /* ---- lightning state -------------------------------------------------------- */
  var flash = 0, nextFlash = 12 + Math.random() * 20;
  var thunderIn = -1, thunderStrength = 1; // the gap between the light and the sound
  var rainCtx = rainT.image.getContext("2d");
  function drawRain(bright) {
    var g = rainCtx, w = 256, h = 320;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(200,220,250," + (bright ? 0.8 : 0.4) + ")";
    g.lineWidth = 1.4;
    for (var i = 0; i < phase.streaks; i++) { var x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14 + Math.random() * 10); g.stroke(); }
    // clinging droplets
    g.fillStyle = "rgba(210,228,255,0.35)";
    for (var dnum = 0; dnum < 8; dnum++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, 7); g.fill(); }
    rainT.needsUpdate = true;
  }

  /* ---- THE BED: generated frame + star comforter, right side ------------------ */
  // five more minutes: the bed actually means it. The lights ease down, somebody
  // snores, the robot tiptoes. Click again to get up early — or don't.
  var napUntil = -1, nap = 0, nextSnore = 0;
  function napToggle() {
    var now = performance.now() / 1000;
    if (napUntil > now) { napUntil = -1; clickSfx(1500); } // okay, okay — up
    else { napUntil = now + 12; nextSnore = now + 1.8; clickSfx(800); }
  }
  var bed = new THREE.Group();
  bed.position.set(2.92, 0, 1.1); bed.rotation.y = -0.05; scene.add(bed);
  var BED_LEN = 1.72, BED_YAW = 0; // long axis runs front-to-back (z); the chest moved off the wall so it can grow
  gltfL.load("assets/props/bed.glb", function (g) {
    var root = g.scene;
    root.traverse(function (o) { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    var bb = new THREE.Box3().setFromObject(root), sz = bb.getSize(new THREE.Vector3());
    root.scale.setScalar(BED_LEN / (Math.max(sz.x, sz.z) || 1)); // scale by the long horizontal axis
    root.rotation.y = BED_YAW;
    bed.add(root); bed.updateMatrixWorld(true);
    bb.setFromObject(root); var ctr = bb.getCenter(new THREE.Vector3());
    bed.worldToLocal(ctr);
    root.position.set(root.position.x - ctr.x, root.position.y - (bb.min.y - bed.position.y), root.position.z - ctr.z);
    root.traverse(function (o) { if (o.isMesh) clickable(o, "the bed", napToggle, "the bed — five more minutes"); });
  });

  /* ---- generated hero props: the clutter that makes it a real room ----------- */
  function propTip(name, hint) {
    return function (wrap) { wrap.traverse(function (o) { if (o.isMesh) clickable(o, name, null, hint); }); };
  }
  function propDoor(name, hint, url) { // a generated prop that is also a doorway
    return function (wrap) { wrap.traverse(function (o) { if (o.isMesh) clickable(o, name, go(url), hint); }); };
  }
  prop("assets/props/bean.glb", 0.62, -2.05, 0, 1.2, 0.95, function (wrap) {
    propTip("the beanbag", "the beanbag — best seat in the house")(wrap);
    registerMovable({ key: "bean", label: "the beanbag", root: wrap, r: 0.42, rot: true, obs: 4, stations: [6] });
  });
  prop("assets/props/trex.glb", 0.3, 0.95, 0, -1.35, 0.7, function (wrap) { // guards the relocated chest, facing the room
    propTip("rex", "rex — he guards the toy chest")(wrap);
    registerMovable({ key: "trex", label: "rex", root: wrap, r: 0.2, rot: true });
  });
  prop("assets/props/skate.glb", 0.78, -3.33, 0, 0.55, 1.45, function (wrap) {
    wrap.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), 0.10); // top rests against the left wall (inner face x=-3.55)
    propTip("the skateboard", "the skateboard — one day, the driveway")(wrap);
  });
  prop("assets/props/globe.glb", 0.36, -2.26, 0.815, -0.75, -0.3, function (wrap) { // desk-local (0, 0.10) — verified on the rotated slab
    propTip("the globe", "the globe — somewhere better, probably")(wrap);
    var dcfg = movableByKey.desk; // the globe rides the desk if the desk has been moved
    if (dcfg) {
      wrap.position.set(dcfg.root.position.x + 0.09, 0.815, dcfg.root.position.z + 0.05);
      dcfg.attach.push({ o: wrap, dx: 0.09, dy: 0.815, dz: 0.05 });
    }
  });
  var CHAIR_YAW = 1.05 + Math.PI; // faces back toward the desk; tuned after render
  prop("assets/props/chair.glb", 0.82, -1.86, 0, -0.32, CHAIR_YAW, function (wrap) {
    propTip("the chair", "the desk chair — worn in just right")(wrap);
    registerMovable({ key: "chair", label: "the desk chair", root: wrap, r: 0.34, rot: true, obs: 6 });
  });
  var robotWrap = null, robotAng = 0; // he patrols the rug, forever
  var robotDir = 1, robotBoost = 0, keyG = null, keyFast = 0;
  function windRobot() { // a turn of the key: a burst of speed, and he changes his mind
    robotBoost = Math.min(robotBoost + 1.2, 3);
    robotDir *= -1;
    keyFast = 0.7;
    ratchetSfx();
  }
  prop("assets/props/robot.glb", 0.42, rugCX + Math.sin(0) * 0.9, 0, rugCZ + Math.cos(0) * 0.9, Math.PI / 2, function (wrap) {
    robotWrap = wrap;
    // the wind-up key in his back, turning as slowly as he walks
    keyG = new THREE.Group();
    var keyM = mat(0x9a9fa8, 0.35);
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.07, 8), keyM);
    shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.035; keyG.add(shaft);
    [-1, 1].forEach(function (side) {
      var lobe = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.008, 8, 14), keyM);
      lobe.position.set(side * 0.028, 0, -0.072); keyG.add(lobe);
    });
    keyG.position.set(0, 0.27, -0.1);
    wrap.add(keyG);
    wrap.traverse(function (o) { if (o.isMesh) clickable(o, "the robot", windRobot, "the robot — wound up in 1994 · wind him again"); });
  });

  /* ---- BRAINROT poster: hung on the left wall ------------------------------- */
  var posterBrainrot = null, posterC3D = null; // WHAT'S OUT hides these with their games
  (function wallPosterBrainrot() {
    var g = new THREE.Group(); posterBrainrot = g;
    var backing = box(0.56, 0.82, 0.02, mat(0xe8e2d4, 0.9)); g.add(backing);
    var m = new THREE.MeshStandardMaterial({ color: 0x333944, roughness: 0.85 });
    texLoader.load("assets/tex/poster_brainrot.jpg", function (t) { t.anisotropy = 8; m.map = t; m.color.set(0xffffff); m.needsUpdate = true; });
    var art = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.78), m);
    art.position.z = 0.012; g.add(art);
    g.position.set(-3.53, 1.75, 0.35); g.rotation.y = Math.PI / 2; g.rotation.z = 0.02; // faces into the room off the left wall
    scene.add(g);
    [backing, art].forEach(function (mm) {
      clickable(mm, "BRAINROT", go("https://dumb-tony.github.io/GameRepos/brainrot/"), "BRAINROT: RISE OF THE MEME — click to play (Dumb Tony's)");
    });
  })();
  (function wallPosterC3D() { // hung properly on the back wall, left of the shelf — dead-on to the camera
    var g = new THREE.Group(); posterC3D = g;
    var backing = box(0.56, 0.82, 0.02, mat(0xe8e2d4, 0.9)); g.add(backing);
    var m = new THREE.MeshStandardMaterial({ color: 0x333944, roughness: 0.85 });
    texLoader.load("assets/tex/poster_c3d.jpg", function (t) { t.anisotropy = 8; m.map = t; m.color.set(0xffffff); m.needsUpdate = true; });
    var art = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.78), m);
    art.position.z = 0.012; g.add(art);
    g.position.set(-3.05, 1.9, -2.53); g.rotation.z = 0.018; // taped a touch crooked, like the rest
    scene.add(g);
    [backing, art].forEach(function (mm) {
      clickable(mm, "CHAMELEON 3D", go("https://kylefriesmarketing.github.io/chameleon/chameleon3d.html"), "CHAMELEON 3D — click to play (Dumb Tony's)");
    });
  })();

  /* ---- TIDEBOUND: a toy island diorama on the floor (generated) --------------- */
  prop("assets/props/island.glb", 0.62, -1.9, 0, 2.45, 0.5, function (wrap) {
    propDoor("TIDEBOUND", "TIDEBOUND — the island that isn't on any chart (Dumb Tony's)", "https://dumb-tony.github.io/GameRepos/tidebound/")(wrap);
    registerMovable({ key: "island", label: "the toy island", root: wrap, r: 0.5, rot: true, obs: 3, stations: [3] });
  });

  /* ==== THE KID: he lives here. He plays with everything until you ask for
   * something — then he walks over and opens it for you, and the camera leans
   * in while the game loads. White vinyl toy, bandage, camo beanie, logo tee. == */
  var kid = new THREE.Group();
  var vinylM = mat(0xf2efe8, 0.55);
  var teeT = canvasTex(128, 128, function (g, w, h) {
    g.fillStyle = "#5a7a44"; g.fillRect(0, 0, w, h);           // the green tee
    g.strokeStyle = "#efe8d2"; g.lineWidth = 3;
    g.beginPath(); g.arc(w * 0.75, h * 0.5, 22, 0, 6.29); g.stroke(); // logo ring (faces +z after wrap)
    g.fillStyle = "#d8cba6"; g.beginPath(); g.arc(w * 0.75, h * 0.5, 18, 0, 6.29); g.fill();
    g.fillStyle = "#7a5c3e"; g.fillRect(w * 0.75 - 13, h * 0.5 + 2, 26, 8); // the couch
    g.fillStyle = "#3d5a8a"; g.fillRect(w * 0.75 - 8, h * 0.5 - 5, 6, 8);   // the two of them
    g.fillStyle = "#4a7a55"; g.fillRect(w * 0.75 + 2, h * 0.5 - 5, 6, 8);
    g.fillStyle = "#2b2b22"; g.fillRect(w * 0.75 - 12, h * 0.5 - 14, 24, 7); // the TV
    g.fillStyle = "#efe8d2"; g.font = "bold 9px sans-serif"; g.textAlign = "center";
    g.fillText("GAMING CO.", w * 0.75, h * 0.5 + 27);
  });
  var teeM = new THREE.MeshStandardMaterial({ map: teeT, roughness: 0.9 });
  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.135, 0.3, 16), teeM);
  torso.position.y = 0.62; torso.castShadow = true; kid.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), vinylM);
  head.position.y = 0.93; head.castShadow = true; kid.add(head);
  var bandage = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.012), mat(0xd8c49a, 0.8));
  bandage.position.set(0.012, 0.925, 0.098); bandage.rotation.z = 0.28; kid.add(bandage);
  var beanie = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 12), mat(0x6b6a4f, 0.9));
  beanie.scale.set(1, 0.62, 1); beanie.position.y = 0.985; kid.add(beanie);
  var brim = new THREE.Mesh(new THREE.CylinderGeometry(0.113, 0.113, 0.035, 16), mat(0x5d5c44, 0.9));
  brim.position.y = 0.945; kid.add(brim);
  function kidLimb(px, py, len, r0, r1, colM, footed) {
    var g = new THREE.Group(); g.position.set(px, py, 0);
    var seg = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 10), colM);
    seg.position.y = -len / 2; seg.castShadow = true; g.add(seg);
    if (footed) {
      var shoe = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.14), mat(0x2b2b28, 0.7));
      shoe.position.set(0, -len - 0.02, 0.03); shoe.castShadow = true; g.add(shoe);
    } else {
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), vinylM);
      hand.position.y = -len - 0.01; g.add(hand);
    }
    kid.add(g); return g;
  }
  var cargoM = mat(0x8a7d5a, 0.95);
  var legL = kidLimb(-0.062, 0.47, 0.4, 0.05, 0.056, cargoM, true);
  var legR = kidLimb(0.062, 0.47, 0.4, 0.05, 0.056, cargoM, true);
  var armL = kidLimb(-0.15, 0.75, 0.28, 0.03, 0.027, vinylM, false);
  var armR = kidLimb(0.15, 0.75, 0.28, 0.03, 0.027, vinylM, false);
  kid.position.set(0.75, 0, 1.95); scene.add(kid);
  kid.traverse(function (o) { if (o.isMesh) clickable(o, "the kid", null, "that's the kid — this is his room"); });

  // If the rigged, walk-animated version exists, he upgrades himself in place.
  // The primitive stand-in above stays as the fallback when this load fails.
  // The kid has a whole little life: he walks, sits in the beanbag, lies on the bed,
  // and fidgets at the shelves. All clips share his skeleton (bound by bone name), so
  // they play on this one mesh and crossfade. See kid_*.glb (mesh-stripped clips).
  var kidMixer = null, kidActions = {}, kidCur = null, kidActionName = "";
  function setKidAction(name, fade) {
    var a = kidActions[name]; if (!a || name === kidActionName) return;
    a.enabled = true; a.setEffectiveTimeScale(1); a.setEffectiveWeight(1); a.reset(); a.play();
    if (kidCur && kidCur !== a) kidCur.crossFadeTo(a, fade == null ? 0.3 : fade, false);
    kidCur = a; kidActionName = name;
  }
  gltfL.load("assets/props/kid.glb", function (g) {
    var root = g.scene;
    root.traverse(function (o) { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    for (var pi = pick.length - 1; pi >= 0; pi--) { // retire the stand-in's clickables
      if (pick[pi].userData.name === "the kid") pick.splice(pi, 1);
    }
    while (kid.children.length) kid.remove(kid.children[0]);
    kid.add(root);
    // The rig is authored to render at height_meters (1.3) with NO transform on
    // the glTF scene, feet at the origin. Do not "normalize" it — every analytic
    // attempt fought the armature's scale conventions and lost (see memory).
    // One empirical constant for this asset: target 1.05m over authored 1.3m.
    root.scale.setScalar(1.05 / 1.3);
    root.position.set(0, 0, 0);
    window.__kidRoot = root; // debug handle for scale/anchor checks
    root.traverse(function (o) { if (o.isMesh) clickable(o, "the kid", null, "that's the kid — this is his room"); });
    kidMixer = new THREE.AnimationMixer(root);
    if (g.animations && g.animations[0]) { // the base file carries the walk cycle
      kidActions.walk = kidMixer.clipAction(g.animations[0]);
      kidActions.walk.play(); kidCur = kidActions.walk; kidActionName = "walk";
    }
    [["idle", "assets/props/kid_idle.glb"], ["sit", "assets/props/kid_sit.glb"],
     ["lie", "assets/props/kid_lie.glb"], ["fidget", "assets/props/kid_fidget.glb"],
     ["dance", "assets/props/kid_dance.glb"], ["wave", "assets/props/kid_wave.glb"]]
      .forEach(function (p) {
        gltfL.load(p[1], function (cg) {
          if (cg.animations && cg.animations[0]) {
            var act = kidMixer.clipAction(cg.animations[0], root);
            if (p[0] === "lie" || p[0] === "wave") { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
            kidActions[p[0]] = act;
          }
        });
      });
  });

  // Each spot has an action he does there. seat = an obstacle index he's allowed to sit ON
  // (ignored while approaching + during the sit); bed = the special climb-and-lie sequence.
  var KID_STATIONS = [
    { x: 1.4, z: -1.0, act: "fidget" },              // in front of the chest
    { x: 2.3, z: -0.75, act: "idle" },               // the TV
    { x: 0.35, z: 1.35, act: "fidget" },             // the rug (the army men)
    { x: -1.1, z: 2.05, act: "fidget" },             // at the island's shore
    { x: -1.35, z: 0.4, act: "idle" },               // the desk
    { x: -1.25, z: -1.65, act: "idle" },             // the shelf
    { x: -2.0, z: 1.52, act: "sit", seat: 4, y: 0.1, yaw: 0 }, // nestled in the beanbag, legs out the front toward the room
    { x: 2.12, z: 1.05, act: "bed", seat: 1 }        // the bedside → climb up and lie down (may enter the bed's circle)
  ];
  // side: where he stands; up: hoisted onto the mattress edge; lie: head on the pillow
  var KID_BED = { sideX: 2.12, sideZ: 1.05, upX: 2.62, upY: 0.42, x: 2.9, y: 0.04, z: 0.88 };
  // furniture he must walk AROUND, not through (circles in floor-plane; kid body ~0.18)
  var KID_R = 0.18;
  var KID_OBSTACLES = [
    { x: 1.45, z: -1.85, r: 0.62 },  // the toy chest (left of the window, off the wall)
    { x: 2.93, z: 1.0, r: 0.82 },    // the bed
    { x: -2.35, z: -0.8, r: 0.82 },  // the desk
    { x: -1.9, z: 2.45, r: 0.5 },    // the island
    { x: -2.05, z: 1.2, r: 0.42 },   // the beanbag
    { x: 3.0, z: -1.35, r: 0.55 },   // the TV stand
    { x: -1.86, z: -0.32, r: 0.34 }  // the desk chair
  ];
  // One avoidance step toward (tx,tz): steer around obstacles, then hard-clamp out
  // of any we'd still penetrate. Returns remaining distance to the target.
  function kidStep(dt, speed) {
    var kdx = kidState.tx - kid.position.x, kdz = kidState.tz - kid.position.z;
    var kdist = Math.sqrt(kdx * kdx + kdz * kdz);
    if (kdist < 0.001) return 0;
    var dx = kdx / kdist, dz = kdz / kdist; // desired heading
    for (var oi = 0; oi < KID_OBSTACLES.length; oi++) {
      if (oi === kidState.ignoreObs) continue; // he's allowed to sit on this one
      var o = KID_OBSTACLES[oi];
      var ox = o.x - kid.position.x, oz = o.z - kid.position.z;
      var od = Math.sqrt(ox * ox + oz * oz), infl = o.r + KID_R + 0.45;
      if (od > 0.001 && od < infl) {
        var ax = ox / od, az = oz / od, ahead = ax * dx + az * dz;
        if (ahead > 0) { // obstacle is in front of where we want to go — slide past it
          var px = -az, pz = ax;
          if (px * dx + pz * dz < 0) { px = az; pz = -ax; } // pick the side facing the target
          var push = (infl - od) / infl * (0.6 + ahead);
          dx += px * push; dz += pz * push;
        }
      }
    }
    var dl = Math.sqrt(dx * dx + dz * dz) || 1; dx /= dl; dz /= dl;
    var step = Math.min(speed * dt, kdist);
    var nx = kid.position.x + dx * step, nz = kid.position.z + dz * step;
    for (var ci = 0; ci < KID_OBSTACLES.length; ci++) { // never end a frame inside one
      if (ci === kidState.ignoreObs) continue;
      var oc = KID_OBSTACLES[ci], cx = nx - oc.x, cz = nz - oc.z;
      var cd = Math.sqrt(cx * cx + cz * cz), minD = oc.r + KID_R;
      if (cd < minD && cd > 0.001) { nx = oc.x + cx / cd * minD; nz = oc.z + cz / cd * minD; }
    }
    kidState.faceX = nx - kid.position.x; kidState.faceZ = nz - kid.position.z; // face travel
    kid.position.x = nx; kid.position.z = nz;
    return kdist;
  }
  var kidState = { mode: "roam", t: 0, tx: 0.35, tz: 1.35, phase: 0, walkT: 0, faceX: 0, faceZ: 1,
    via: false, fx: 0, fz: 0, station: null, ignoreObs: -1, targetY: 0 };
  var KID_HUB = { x: 0.3, z: 1.35 }; // clear rug-center staging point
  // Does the straight line a->b pass through any furniture? (the chest nearly touches the
  // bed, so the right-side corridor is a dead end greedy avoidance can wedge in.)
  function kidPathBlocked(ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az, len = Math.sqrt(dx * dx + dz * dz) || 1, n = Math.ceil(len / 0.15);
    for (var s = 1; s < n; s++) {
      var t = s / n, px = ax + dx * t, pz = az + dz * t;
      for (var o = 0; o < KID_OBSTACLES.length; o++) {
        if (o === kidState.ignoreObs) continue;
        var O = KID_OBSTACLES[o];
        if (Math.sqrt((px - O.x) * (px - O.x) + (pz - O.z) * (pz - O.z)) < O.r + KID_R - 0.02) return true;
      }
    }
    return false;
  }
  // Head for (x,z); if the direct line is blocked, stage through the open hub first.
  function kidGoto(x, z) {
    var nearHub = Math.abs(kid.position.x - KID_HUB.x) < 0.25 && Math.abs(kid.position.z - KID_HUB.z) < 0.25;
    if (!nearHub && kidPathBlocked(kid.position.x, kid.position.z, x, z)) {
      kidState.tx = KID_HUB.x; kidState.tz = KID_HUB.z; kidState.fx = x; kidState.fz = z; kidState.via = true;
    } else {
      kidState.tx = x; kidState.tz = z; kidState.via = false;
    }
  }
  var KID_DANCE = { x: 0.6, z: 1.62, act: "dance" }; // clear patch of rug (not on the army men), facing the room
  function kidPickStation() {
    // when the boombox is going, he can't help himself — dance on the rug
    var s = (audioOn && kidActions.dance && Math.random() < 0.45)
      ? KID_DANCE
      : KID_STATIONS[(Math.random() * KID_STATIONS.length) | 0];
    kidState.station = s;
    kidState.ignoreObs = (s.seat == null) ? -1 : s.seat; // may sit on the beanbag
    var jx = s.seat == null ? (Math.random() - 0.5) * 0.2 : 0;
    kidGoto(s.x + jx, s.z + (s.seat == null ? (Math.random() - 0.5) * 0.2 : 0));
  }
  var pendingNav = null, navTarget = null;
  var zoomT = -1, zoomFrom = new THREE.Vector3(), zoomTo = new THREE.Vector3(),
      zoomLookFrom = new THREE.Vector3(), zoomLookTo = new THREE.Vector3();
  function kidSummon(mesh) {
    if (pendingNav) return;
    pendingNav = mesh.userData.action; navTarget = mesh;
    kidState.fetchName = mesh.userData.name; // so he can react when he hands it over
    var box = new THREE.Box3().setFromObject(mesh);
    var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    var dir = new THREE.Vector3(0.35 - c.x, 0, 1.0 - c.z); dir.y = 0; // pull toward open floor
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    var standoff = Math.max(sz.x, sz.z) * 0.5 + 0.4; // stop clear of the object, not inside it
    var tx = c.x + dir.x * standoff, tz = c.z + dir.z * standoff;
    for (var oi = 0; oi < KID_OBSTACLES.length; oi++) { // and clear of any OTHER furniture
      var o = KID_OBSTACLES[oi], mx = tx - o.x, mz = tz - o.z;
      var md = Math.sqrt(mx * mx + mz * mz), need = o.r + KID_R + 0.05;
      if (md < need && md > 0.001) { tx = o.x + mx / md * need; tz = o.z + mz / md * need; }
    }
    kidState.mode = "summon"; kidState.t = 0; kidState.walkT = 0;
    kidGoto(tx, tz); // stage through the hub if the chest (or anything) is in the way
    setTimeout(function () { if (pendingNav) { var f = pendingNav; pendingNav = null; f(); } }, 4800); // failsafe — the door opens even if the tab hides
  }
  function kidStartZoom() {
    var bb = new THREE.Box3().setFromObject(navTarget);
    var ctr = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    var d = Math.max(0.55, sz.length() * 1.05);
    var dir = camera.position.clone().sub(ctr); dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    zoomFrom.copy(camera.position); zoomLookFrom.copy(lookAt);
    zoomTo.copy(ctr).addScaledVector(dir, d); zoomTo.y = ctr.y + 0.16;
    zoomLookTo.copy(ctr);
    zoomT = 0;
  }
  // Hitting BACK from a game restores this page from the bfcache exactly as it was
  // left: camera zoomed into a book, kid mid-reach. Reset the shot and the kid.
  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted) return;
    zoomT = -1; pendingNav = null; navTarget = null;
    introT = 1; // settle instantly; no re-dolly
    frameForAspect();
    camera.position.set(0, 1.72, camRestZ);
    lookAt.set(0, 1.2, -0.4);
    camera.lookAt(lookAt);
    kidState.mode = "roam"; kidState.via = false; kidState.ignoreObs = -1; kidState.targetY = 0;
    kid.position.y = 0; kid.rotation.x = 0;
    kidPickStation();
  });

  /* ---- THE SOLAR SYSTEM POSTER (back wall, between shelf and window) ---------- */
  var posterM = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.9 });
  texLoader.load("assets/tex/solar_poster.jpg", function (t) { t.anisotropy = 8; posterM.map = t; posterM.color.set(0xffffff); posterM.needsUpdate = true; });
  var solar = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.04), posterM);
  solar.position.set(0.78, 1.98, -2.53); solar.rotation.z = -0.02; // taped up a little crooked
  scene.add(solar);
  clickable(solar, "the poster", null, "the solar system — you are here");

  /* ---- the TV flips between static and Saturday cartoons ---------------------- */
  var cartoonT = null, tvCartoon = false, tvFlip = 6 + Math.random() * 6, crtBase = 0.7;
  texLoader.load("assets/tex/tv_cartoon.jpg", function (t) { t.anisotropy = 4; cartoonT = t; });

  /* ---- the notebook panel (DOM): reads the sibling games' saves --------------- */
  // It has grown pages: what i finished, then (once the war starts) the campaign
  // act by act, then the lifetime record from the Chronicle.
  var nbPages = [], nbIndex = 0;
  function nbRow(k, v) { return "<div class='nb-row'><span>" + k + "</span><b>" + v + "</b></div>"; }
  function fmtDur(sec) {
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h ? h + "h " + m + "m" : m + "m";
  }
  function buildPages() {
    nbPages = [];
    var rows = [
      ["Choose Wisely", readSave("chooseWisely.meta.v2", function (m) { return countOf(m.endingsFound); }), 56],
      ["Nine Circles", readSave("nc_persist", function (m) { return countOf(m.endings); }), null],
      ["Still Breathing", readSave("sb_persist", function (m) { return countOf(m.endings); }), null],
      ["SOUTH", readSave("south_persist", function (m) { return countOf(m.endings); }), null],
      ["NOBODY", readSave("nobody_persist", function (m) { return countOf(m.endings); }), null],
      ["CURIOUSER", readSave("alice_persist", function (m) { return countOf(m.wakings); }), 8],
      ["DRACULA", readSave("dracula_persist", function (m) { return countOf(m.endings); }), 6],
      ["G for George", readSave("gg_persist", function (m) { return countOf(m.endings); }), 15],
    ];
    var html = rows.map(function (r) {
      return nbRow(r[0], r[1] == null ? "not started" : r[1] + (r[2] ? " / " + r[2] : "") + " endings");
    }).join("");
    // Age of Toys writes a whole campaign, not endings — it gets its own line
    var tt = ttCampaign();
    var stories = readSave("tt-achievements", countOf);
    var ttText;
    if (!tt.started && !stories) ttText = "not started";
    else {
      ttText = tt.done + " / " + TT_IDS.length + " missions";
      if (tt.secrets) ttText += " +" + tt.secrets + " secret";
      if (stories) ttText += " · " + stories + (stories === 1 ? " story" : " stories");
    }
    html += nbRow("Age of Toys", ttText);
    // ELEMENTARY tracks cases closed and Norburys whispered, not endings
    var sl = readSave("sherlock_persist", function (m) { return m; });
    var slText;
    if (!sl || !sl.solved || countOf(sl.solved) === 0) slText = "not started";
    else {
      slText = countOf(sl.solved) + " / 11 cases";
      if (sl.norburys) slText += " · " + sl.norburys + " Norbur" + (sl.norburys === 1 ? "y" : "ies");
      if (sl.beeSeen) slText += " · ★ Sussex";
    }
    html += nbRow("Elementary", slText);
    // Tony's games live on his origin — their saves can't be read from here,
    // but the notebook should still know every game in the room.
    html += nbRow("Brainrot", "on Tony's shelf");
    html += nbRow("Tidebound", "on Tony's shelf");
    html += nbRow("Chameleon 3D", "kitchen prototype");
    nbPages.push({ title: "what i finished", html: html });
    if (tt.started || stories) { // the war, act by act
      var p = readSave("tt-campaign", function (m) { return m; }) || {};
      var h2 = [["Act I — The Bedroom Wars", 0], ["Act II — The Sleepover", 5], ["Act III — The Yard Sale", 10]]
        .map(function (a) {
          var n = 0;
          for (var i = a[1]; i < a[1] + 5; i++) if (p[TT_IDS[i]]) n++;
          return nbRow(a[0], n + " / 5");
        }).join("");
      h2 += nbRow("pages beyond the shelf", tt.secrets + " / 3");
      h2 += nbRow("bedtime stories", stories || 0);
      var ng = readSave("tt-campaign-ng", countOf);
      if (ng) h2 += nbRow("the second read-through", ng + (ng === 1 ? " mission" : " missions"));
      nbPages.push({ title: "the toybox war", html: h2 });
    }
    var chron = readSave("tt-chronicle", function (m) { return m; });
    if (chron && chron.games) { // the lifetime record
      var h3 = nbRow("battles", chron.games) + nbRow("victories", chron.wins || 0)
        + nbRow("time at war", fmtDur(chron.playSec || 0))
        + nbRow("toys lost", (chron.lost || 0).toLocaleString())
        + nbRow("snacks gathered", (chron.gathered || 0).toLocaleString());
      if (chron.shipsBuilt) h3 += nbRow("ships launched", chron.shipsBuilt);
      if (chron.bestScore) h3 += nbRow("best score", chron.bestScore.toLocaleString());
      nbPages.push({ title: "for the record", html: h3 });
    }
  }
  function nbShow(i) {
    nbIndex = Math.max(0, Math.min(nbPages.length - 1, i));
    var panel = document.getElementById("notebook");
    panel.querySelector("h2").textContent = nbPages[nbIndex].title;
    panel.querySelector(".nb-body").innerHTML = nbPages[nbIndex].html;
    document.getElementById("nb-nav").style.display = nbPages.length > 1 ? "" : "none";
    document.getElementById("nb-page").textContent = (nbIndex + 1) + " / " + nbPages.length;
    document.getElementById("nb-prev").disabled = nbIndex === 0;
    document.getElementById("nb-next").disabled = nbIndex === nbPages.length - 1;
    panel.classList.add("open");
  }
  function showNotebook() { buildPages(); nbShow(0); }
  document.getElementById("nb-prev").addEventListener("click", function () { nbShow(nbIndex - 1); clickSfx(1100); });
  document.getElementById("nb-next").addEventListener("click", function () { nbShow(nbIndex + 1); clickSfx(1100); });
  document.getElementById("nb-close").addEventListener("click", function () {
    document.getElementById("notebook").classList.remove("open");
  });

  /* ---- picking / hover / parallax -------------------------------------------- */
  var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(-2, -2), hovered = null;
  var tip = document.getElementById("tip");
  var pointerMovedAt = -10; // idle from the start, until a real pointer shows up
  function setPointer(e) {
    var t = e.touches ? e.touches[0] : e;
    if (!t) return;
    mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
    tip.style.left = t.clientX + "px"; tip.style.top = (t.clientY - 14) + "px";
    pointerMovedAt = performance.now() / 1000;
  }
  window.addEventListener("pointermove", setPointer, { passive: true });
  function visibleChain(o) { // the raycaster doesn't check visibility — we do
    while (o) { if (o.visible === false) return false; o = o.parent; }
    return true;
  }
  function pickAt() {
    ray.setFromCamera(mouse, camera);
    var hits = ray.intersectObjects(pick, false);
    for (var i = 0; i < hits.length; i++) {
      if (visibleChain(hits[i].object)) return hits[i].object; // put-away things pass clicks through
    }
    return null;
  }
  window.addEventListener("pointerdown", function (e) {
    if (decorPointerDown(e)) return; // rearrange mode (and open panels) own the pointer
    setPointer(e);
    var o = pickAt();
    if (o && o.userData.action) {
      if (o.userData.action.__nav) kidSummon(o); // doorways go through the kid
      else o.userData.action();
    }
    else if (o) {
      tip.textContent = o.userData.hint; tip.classList.add("show");
      setTimeout(function () { tip.classList.remove("show"); }, 1600);
    }
  });

  // Shared hover/focus highlight — a warm emissive on a CLONED material (never the shared
  // originals like woodM). Used by both the mouse and the keyboard so focus is visible.
  var HL = new THREE.Color(0xffc27d);
  function highlightOn(o) {
    if (!o || o.userData.__origMat) return;
    if (o === shade || o === screen || o === pcScreen) return; // these own their emissive
    var m = o.material; if (!m) return;
    if (Array.isArray(m)) { // multi-material things (the books, the notebook) — glow every face
      if (!m.length || m[0].emissive === undefined) return;
      o.userData.__origMat = m;
      o.material = m.map(function (mm) {
        var c = mm.clone();
        if (c.emissive !== undefined) { c.emissive = HL; c.emissiveIntensity = 0.22; }
        return c;
      });
    } else {
      if (m.emissive === undefined) return;
      o.userData.__origMat = m;
      var hm = m.clone(); hm.emissive = HL; hm.emissiveIntensity = 0.28; o.material = hm;
    }
  }
  function highlightOff(o) {
    if (o && o.userData.__origMat) { o.material = o.userData.__origMat; o.userData.__origMat = null; }
  }

  /* ---- keyboard: Tab walks the room, Enter opens, Esc puts things back -------- */
  var kbTargets = null, kbCount = 0, kbIndex = -1, kbFocus = null, kbListDirty = false;
  function kbList() { // one entry per named thing; prefer the mesh that does something
    if (kbTargets && kbCount === pick.length && !kbListDirty) return kbTargets;
    var seen = {};
    kbTargets = []; kbCount = pick.length; kbListDirty = false;
    pick.forEach(function (m) {
      if (!visibleChain(m)) return; // put-away things leave the Tab order too
      var n = m.userData.name;
      if (seen[n] === undefined) { seen[n] = kbTargets.length; kbTargets.push(m); }
      else if (!kbTargets[seen[n]].userData.action && m.userData.action) kbTargets[seen[n]] = m;
    });
    return kbTargets;
  }
  var kbV = new THREE.Vector3();
  function kbShow(m) {
    if (kbFocus && kbFocus !== m) highlightOff(kbFocus);
    kbFocus = m;
    highlightOn(m); // glow the focused thing, not just its tooltip
    m.getWorldPosition(kbV); kbV.project(camera);
    tip.style.left = ((kbV.x * 0.5 + 0.5) * window.innerWidth) + "px";
    tip.style.top = ((-kbV.y * 0.5 + 0.5) * window.innerHeight - 14) + "px";
    tip.textContent = m.userData.hint; tip.classList.add("show");
  }
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (decorMode) { decorSet(false); return; }
      document.getElementById("notebook").classList.remove("open");
      document.body.classList.remove("listing");
      return;
    }
    if (document.body.classList.contains("listing")) return; // the list has native tab order
    if (document.activeElement && document.activeElement.tagName === "INPUT") return; // typing your name in the drawer
    if (e.key === "Tab") {
      e.preventDefault();
      var L = kbList();
      if (!L.length) return;
      kbIndex = (kbIndex + (e.shiftKey ? -1 : 1) + L.length) % L.length;
      kbShow(L[kbIndex]);
    } else if ((e.key === "Enter" || e.key === " ") && kbFocus) {
      if (decorMode) return; // no doorways while rearranging
      var ec = document.getElementById("enter");
      if ((!ec || ec.classList.contains("gone")) && kbFocus.userData.action) {
        if (kbFocus.userData.action.__nav) kidSummon(kbFocus);
        else kbFocus.userData.action();
      }
    }
  });

  // Portrait phones see a thin vertical slice at FOV 55 — widen the lens and pull
  // the camera back so the whole room fits on a narrow screen.
  var camRestZ = 4.9;
  function frameForAspect() {
    var a = window.innerWidth / window.innerHeight;
    if (a < 0.65) { camera.fov = 74; camRestZ = 6.9; }
    else if (a < 0.9) { camera.fov = 66; camRestZ = 5.9; }
    else if (a < 1.25) { camera.fov = 60; camRestZ = 5.3; }
    else { camera.fov = 55; camRestZ = 4.9; }
    camera.aspect = a; camera.updateProjectionMatrix();
  }
  frameForAspect();
  window.addEventListener("resize", function () {
    frameForAspect();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ============================================================================
   * MAKE IT YOURS — rearrange mode + THE SHOEBOX collection.
   * Rearrange: every big toy and most of the furniture can be dragged around the
   * floor (scroll or the toolbar spins it); the kid's obstacle map, his hand-tuned
   * stations, and the tied lights/halos all follow, and the layout persists.
   * The shoebox: every game leaves a unique little collectible behind once you've
   * earned it — display the ones you like, anywhere a surface will hold them.
   * ========================================================================== */
  function loadJSON(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  var decorMode = false, dragging = null, selCfg = null, decorHover = null;
  var movables = [], movableByKey = {};
  var savedLayout = loadJSON("room-layout") || {};
  var RING_G = new THREE.RingGeometry(0.82, 1, 32);
  var HUB_HOME = { x: KID_HUB.x, z: KID_HUB.z };

  function registerMovable(cfg) {
    var r = cfg.root;
    cfg.def = { x: r.position.x, z: r.position.z, y: r.position.y, ry: r.rotation.y };
    // kid stations tied to this thing: remember their offsets so they ride along
    cfg.stOff = (cfg.stations || []).map(function (si) {
      var s = KID_STATIONS[si];
      return { i: si, dx: s.x - cfg.def.x, dz: s.z - cfg.def.z, yaw: s.yaw };
    });
    // scene-level lights/halos that visually belong to it
    cfg.attach = (cfg.attachObjs || []).map(function (o) {
      return { o: o, dx: o.position.x - cfg.def.x, dy: o.position.y, dz: o.position.z - cfg.def.z };
    });
    r.userData.__movKey = cfg.key;
    var ring = new THREE.Mesh(RING_G, new THREE.MeshBasicMaterial({
      color: 0xffc27d, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.userData.__ring = true;
    ring.scale.setScalar((cfg.r || 0.3) + 0.16);
    scene.add(ring); cfg.__ring = ring;
    movables.push(cfg); movableByKey[cfg.key] = cfg;
    if (cfg.kind !== "coll") { // furniture layout restores here; collectibles restore from the shoebox
      var sv = savedLayout[cfg.key];
      if (sv) applyMove(cfg, sv.x, sv.z, sv.ry == null ? cfg.def.ry : sv.ry);
    }
    if (outState) applyOut(); // late-loading GLBs (the island) honor a saved put-away
    return cfg;
  }
  function unregisterMovable(cfg) {
    var i = movables.indexOf(cfg);
    if (i >= 0) movables.splice(i, 1);
    delete movableByKey[cfg.key];
    if (cfg.__ring) { scene.remove(cfg.__ring); cfg.__ring.material.dispose(); }
  }
  // Move (and maybe spin) a movable; every coupled system follows in the same call.
  function applyMove(cfg, x, z, ry, y) {
    var r = cfg.root;
    x = Math.max(-3.35, Math.min(3.35, x)); // stay inside the walls
    z = Math.max(-2.35, Math.min(3.05, z)); // ...and in front of the camera
    r.position.x = x; r.position.z = z;
    if (y != null && cfg.surface) r.position.y = y;
    if (ry != null && cfg.rot) r.rotation.y = ry;
    var dry = r.rotation.y - cfg.def.ry, c = Math.cos(dry), s = Math.sin(dry);
    if (cfg.obs != null) { KID_OBSTACLES[cfg.obs].x = x; KID_OBSTACLES[cfg.obs].z = z; }
    cfg.stOff.forEach(function (o) { // stations rotate around the thing they belong to
      var st = KID_STATIONS[o.i];
      st.x = x + o.dx * c + o.dz * s;
      st.z = z - o.dx * s + o.dz * c;
      if (o.yaw != null) st.yaw = o.yaw + dry;
    });
    cfg.attach.forEach(function (a) {
      a.o.position.set(x + a.dx * c + a.dz * s, a.dy, z - a.dx * s + a.dz * c);
    });
    if (cfg.onMove) cfg.onMove(x, z, dry);
    fixHub();
    kidEvict(cfg);
  }
  // The hub is the kid's open-floor staging point — nudge it out of anything parked on it.
  function fixHub() {
    KID_HUB.x = HUB_HOME.x; KID_HUB.z = HUB_HOME.z;
    for (var i = 0; i < KID_OBSTACLES.length; i++) {
      var o = KID_OBSTACLES[i], dx = KID_HUB.x - o.x, dz = KID_HUB.z - o.z;
      var d = Math.sqrt(dx * dx + dz * dz), need = o.r + KID_R + 0.15;
      if (d < need) {
        if (d < 0.01) { dx = 0; dz = 1; d = 1; }
        KID_HUB.x = o.x + dx / d * need; KID_HUB.z = o.z + dz / d * need;
      }
    }
  }
  // If the kid is sitting on / lying in / heading to the thing being moved, he hops off.
  function kidEvict(cfg) {
    var st = kidState.station;
    if (!st) return;
    var mine = cfg.stOff.some(function (o) { return KID_STATIONS[o.i] === st; });
    if (!mine) return;
    kidState.station = null; kidState.mode = "roam"; kidState.t = 0; kidState.walkT = 0;
    kidState.ignoreObs = -1; kidState.targetY = 0;
    kidGoto(KID_HUB.x, KID_HUB.z);
  }
  function persistLayout() {
    var out = {};
    movables.forEach(function (c) {
      if (c.kind === "coll") return;
      var r = c.root;
      if (Math.abs(r.position.x - c.def.x) > 0.01 || Math.abs(r.position.z - c.def.z) > 0.01 ||
          Math.abs(r.rotation.y - c.def.ry) > 0.01)
        out[c.key] = { x: +r.position.x.toFixed(3), z: +r.position.z.toFixed(3), ry: +r.rotation.y.toFixed(3) };
    });
    saveJSON("room-layout", out);
  }
  function persistFor(cfg) { if (cfg.kind === "coll") persistColl(cfg); else persistLayout(); }

  /* ---- picking + dragging ----------------------------------------------------- */
  function floorPoint() {
    ray.setFromCamera(mouse, camera);
    var o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    var tt = -o.y / d.y;
    if (tt < 0) return null;
    return { x: o.x + d.x * tt, y: 0, z: o.z + d.z * tt };
  }
  var _sn = new THREE.Vector3();
  function surfacePoint() { // collectibles snap onto whatever flat top the pointer is over
    ray.setFromCamera(mouse, camera);
    var hits = ray.intersectObjects(SURFACES, false);
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (!h.face) continue;
      _sn.copy(h.face.normal).transformDirection(h.object.matrixWorld);
      if (_sn.y > 0.6) return { x: h.point.x, y: h.point.y + 0.002, z: h.point.z };
    }
    return null;
  }
  function decorPickMovable() {
    ray.setFromCamera(mouse, camera);
    var hits = ray.intersectObjects(scene.children, true);
    for (var i = 0; i < hits.length; i++) {
      var ob = hits[i].object;
      if (!ob.isMesh || ob.userData.__ring || !visibleChain(ob)) continue;
      if (ob.userData.war && movableByKey.rug) return movableByKey.rug; // the army men grab the rug
      var p = ob, found = null;
      while (p) { if (p.userData.__movKey) { found = movableByKey[p.userData.__movKey]; break; } p = p.parent; }
      if (found) return found;
      var mm = ob.material;
      if (mm && !Array.isArray(mm) && mm.transparent && (mm.opacity || 0) < 0.35) continue; // see through rain / ghost glass
      return null; // a solid non-movable — you can't grab through the furniture
    }
    return null;
  }
  function decorPointerDown(e) {
    var nb = document.getElementById("notebook");
    if (nb && nb.classList.contains("open")) return true;   // no click-through on the open notebook
    if (!decorMode) return false;
    if (e.target && e.target.tagName !== "CANVAS") return true; // toolbar clicks aren't grabs
    setPointer(e);
    var cfg = decorPickMovable();
    decorSelect(cfg);
    if (cfg) {
      var p = floorPoint();
      dragging = { cfg: cfg, ox: p && !cfg.surface ? cfg.root.position.x - p.x : 0,
                   oz: p && !cfg.surface ? cfg.root.position.z - p.z : 0 };
      document.body.style.cursor = "grabbing";
    }
    return true;
  }
  window.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    setPointer(e);
    var cfg = dragging.cfg;
    var p = cfg.surface ? (surfacePoint() || floorPoint()) : floorPoint();
    if (!p) return;
    applyMove(cfg, p.x + dragging.ox, p.z + dragging.oz, cfg.root.rotation.y, cfg.surface ? p.y : null);
  }, { passive: true });
  function endDrag() {
    if (!dragging) return;
    var cfg = dragging.cfg; dragging = null;
    document.body.style.cursor = decorMode ? "grab" : "default";
    persistFor(cfg);
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("wheel", function (e) {
    if (!decorMode) return;
    var cfg = dragging ? dragging.cfg : selCfg;
    if (!cfg || !cfg.rot) return;
    decorRotate(cfg, e.deltaY > 0 ? -0.16 : 0.16);
  }, { passive: true });
  function decorRotate(cfg, d) {
    applyMove(cfg, cfg.root.position.x, cfg.root.position.z, cfg.root.rotation.y + d,
      cfg.surface ? cfg.root.position.y : null);
    persistFor(cfg);
  }

  /* ---- rearrange mode UI -------------------------------------------------------- */
  var decorSaidLine = false;
  function decorSelect(cfg) {
    selCfg = cfg;
    var chip = document.getElementById("dw-sel");
    if (!chip) return;
    chip.hidden = !cfg;
    if (cfg) {
      document.getElementById("dw-sel-name").textContent = cfg.label;
      ["dw-rotl", "dw-rotr"].forEach(function (id) {
        var b = document.getElementById(id); if (b) b.disabled = !cfg.rot;
      });
    }
  }
  function decorSet(on) {
    if (on === decorMode) return;
    decorMode = on;
    endDrag();
    decorSelect(null);
    document.body.classList.toggle("decorating", on);
    var b = document.getElementById("decor-btn");
    if (b) b.textContent = on ? "done decorating" : "decorate";
    tip.classList.remove("show");
    document.body.style.cursor = "default";
    if (on) dwTab(dwTabName); // the drawer wakes up on whatever tab it was left on
    if (on && !decorSaidLine) {
      decorSaidLine = true;
      try { kidSay("rearranging? okay — mom will never believe it wasn't me.", 4.5); } catch (e) { }
    }
  }
  function decorReset() {
    movables.forEach(function (c) {
      if (c.kind === "coll") return;
      applyMove(c, c.def.x, c.def.z, c.def.ry);
    });
    saveJSON("room-layout", {});
    decorSelect(selCfg && selCfg.kind === "coll" ? selCfg : null);
  }
  function decorTick(t, dt) {
    for (var i = 0; i < movables.length; i++) {
      var c = movables[i], rg = c.__ring;
      if (rg) {
        rg.visible = decorMode && c.root.visible !== false; // put-away things don't advertise
        if (rg.visible) {
          rg.position.set(c.root.position.x, (c.surface ? c.root.position.y : 0) + 0.02, c.root.position.z);
          rg.material.opacity = c === selCfg ? 0.4 + 0.18 * Math.sin(t * 5) : c === decorHover ? 0.3 : 0.12;
        }
      }
      if (c.pop > 0) { // the little bounce when you poke a collectible
        c.pop = Math.max(0, c.pop - dt * 2.4);
        var ps = 1 + Math.sin(c.pop * Math.PI) * 0.22;
        c.root.scale.set(ps, ps, ps);
      }
    }
    if (gShoe) gShoe.material.opacity = sbxNew > 0 ? 0.26 + 0.2 * Math.sin(t * 2.6) : 0;
  }

  /* ---- register the furniture --------------------------------------------------- */
  registerMovable({ key: "chest", label: "the toy chest", root: chest, r: 0.62, rot: true, obs: 0, stations: [0] });
  registerMovable({ key: "rug", label: "the rug", root: rug, r: 1.5, stations: [2], onMove: function (x, z) {
    rugCX = x; rugCZ = z;                    // the robot's patrol recenters every frame
    war.position.x = x; war.position.z = z;  // the army men are set up ON the rug
    KID_DANCE.x = x + 0.5; KID_DANCE.z = z + 0.62;
  } });
  registerMovable({ key: "bed", label: "the bed", root: bed, r: 0.82, obs: 1, stations: [7], onMove: function (x, z) {
    var dx = x - 2.92, dz = z - 1.1; // the climb waypoints ride with the bed (translate only — the lie clip owns the yaw)
    KID_BED.sideX = 2.12 + dx; KID_BED.sideZ = 1.05 + dz;
    KID_BED.upX = 2.62 + dx;
    KID_BED.x = 2.9 + dx; KID_BED.z = 0.88 + dz;
  } });
  registerMovable({ key: "desk", label: "the desk", root: desk, r: 0.82, obs: 2, stations: [4],
    attachObjs: [lampLight, gLamp, gBrain] });
  registerMovable({ key: "tv", label: "the TV", root: crt, r: 0.55, rot: true, obs: 5, stations: [1],
    attachObjs: [crtLight, gCrt] });
  registerMovable({ key: "nstand", label: "the nightstand", root: nstand, r: 0.3, rot: true, attachObjs: [gLava] });

  /* ---- THE SHOEBOX: one collectible per game ------------------------------------ */
  var goldM = new THREE.MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.35, metalness: 0.7 });
  var glassM = new THREE.MeshStandardMaterial({ color: 0xbfe8e0, roughness: 0.12, transparent: true, opacity: 0.3 });
  var toyWood = mat(0x8a6242, 0.8), toyWoodD = mat(0x5e4028, 0.85);
  function buildBracelet() {
    var g = new THREE.Group(), cols = [0xe05a7a, 0x5ab8e0, 0xe0c05a, 0x7ae08a, 0xb87ae0];
    var band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 8, 24), mat(0xd8cfc0, 0.8));
    band.rotation.x = -Math.PI / 2; band.position.y = 0.012; g.add(band);
    for (var i = 0; i < 8; i++) {
      var b = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), mat(cols[i % cols.length], 0.5));
      b.position.set(Math.cos(i / 8 * Math.PI * 2) * 0.05, 0.012, Math.sin(i / 8 * Math.PI * 2) * 0.05);
      g.add(b);
    }
    return g;
  }
  function buildLaurel() {
    var g = new THREE.Group();
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 8, 28, Math.PI * 1.72), goldM);
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI * 0.64; ring.position.y = 0.012; g.add(ring);
    for (var i = 0; i < 10; i++) {
      var a = Math.PI * 0.64 + (i + 0.5) / 10 * Math.PI * 1.72;
      var lf = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.028, 6), goldM);
      lf.position.set(Math.cos(a) * 0.052, 0.014, -Math.sin(a) * 0.052);
      lf.rotation.x = Math.PI / 2; lf.rotation.y = -a + Math.PI / 2;
      g.add(lf);
    }
    return g;
  }
  function buildCompass() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24), goldM);
    body.position.y = 0.01; g.add(body);
    var face = new THREE.Mesh(new THREE.CircleGeometry(0.037, 24), new THREE.MeshBasicMaterial({
      map: canvasTex(64, 64, function (gc) {
        gc.fillStyle = "#f2ead6"; gc.beginPath(); gc.arc(32, 32, 32, 0, 7); gc.fill();
        gc.fillStyle = "#333"; gc.font = "bold 13px Georgia, serif"; gc.textAlign = "center"; gc.textBaseline = "middle";
        gc.fillText("N", 32, 10); gc.fillText("S", 32, 54); gc.fillText("E", 54, 32); gc.fillText("W", 10, 32);
        gc.strokeStyle = "#c0392b"; gc.lineWidth = 3;
        gc.beginPath(); gc.moveTo(30, 46); gc.lineTo(37, 16); gc.stroke();
      }),
    }));
    face.rotation.x = -Math.PI / 2; face.position.y = 0.021; g.add(face);
    var loop = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 6, 12), goldM);
    loop.position.set(0.053, 0.012, 0); g.add(loop);
    return g;
  }
  function buildBottle() { // the Endurance, safely home
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 16), glassM);
    body.rotation.z = Math.PI / 2; body.position.y = 0.048; g.add(body);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.018, 0.035, 12), glassM);
    neck.rotation.z = Math.PI / 2; neck.position.set(0.082, 0.048, 0); g.add(neck);
    var cork = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.018, 10), mat(0xb08a56, 0.9));
    cork.rotation.z = Math.PI / 2; cork.position.set(0.108, 0.048, 0); g.add(cork);
    var hull = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.016), toyWoodD);
    hull.position.y = 0.038; g.add(hull);
    [-0.012, 0.012].forEach(function (x, i) {
      var sail = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.026 - i * 0.008),
        new THREE.MeshStandardMaterial({ color: 0xf2ead6, side: THREE.DoubleSide, roughness: 0.9 }));
      sail.position.set(x, 0.058, 0); g.add(sail);
    });
    [-0.034, 0.034].forEach(function (x) {
      var f = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.018, 0.05), toyWoodD);
      f.position.set(x, 0.009, 0); g.add(f);
    });
    return g;
  }
  function buildHorse() { // wooden, wheeled, straight out of the poem
    var g = new THREE.Group();
    var body = box(0.07, 0.038, 0.024, toyWood); body.position.y = 0.062; g.add(body);
    var neck = box(0.016, 0.036, 0.018, toyWood); neck.position.set(0.03, 0.092, 0); neck.rotation.z = -0.35; g.add(neck);
    var head = box(0.03, 0.016, 0.016, toyWood); head.position.set(0.046, 0.108, 0); g.add(head);
    var mane = box(0.024, 0.008, 0.01, toyWoodD); mane.position.set(0.026, 0.108, 0); mane.rotation.z = -0.35; g.add(mane);
    [[-0.026, -0.008], [-0.026, 0.008], [0.026, -0.008], [0.026, 0.008]].forEach(function (p) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.036, 8), toyWood);
      leg.position.set(p[0], 0.03, p[1]); g.add(leg);
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 12), toyWoodD);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(p[0], 0.011, p[1] + (p[1] < 0 ? -0.008 : 0.008)); g.add(wheel);
    });
    return g;
  }
  function buildWatch() { // the White Rabbit's — permanently teatime
    var g = new THREE.Group();
    var cased = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.013, 24), goldM);
    cased.position.y = 0.007; g.add(cased);
    var face = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), new THREE.MeshBasicMaterial({
      map: canvasTex(64, 64, function (gc) {
        gc.fillStyle = "#f6efdd"; gc.beginPath(); gc.arc(32, 32, 32, 0, 7); gc.fill();
        gc.fillStyle = "#4a3a22"; gc.font = "10px Georgia, serif"; gc.textAlign = "center"; gc.textBaseline = "middle";
        gc.fillText("XII", 32, 9); gc.fillText("VI", 32, 55); gc.fillText("III", 55, 32); gc.fillText("IX", 9, 32);
        gc.strokeStyle = "#4a3a22"; gc.lineWidth = 3;
        gc.beginPath(); gc.moveTo(32, 32); gc.lineTo(32, 52); gc.stroke();  // six o'clock —
        gc.beginPath(); gc.moveTo(32, 32); gc.lineTo(44, 22); gc.stroke(); // teatime forever
      }),
    }));
    face.rotation.x = -Math.PI / 2; face.position.y = 0.014; g.add(face);
    var crownK = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), goldM);
    crownK.rotation.z = Math.PI / 2; crownK.position.set(0.048, 0.007, 0); g.add(crownK);
    for (var i = 0; i < 3; i++) {
      var link = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.002, 6, 10), goldM);
      link.rotation.x = -Math.PI / 2; link.position.set(0.062 + i * 0.011, 0.004, 0.008 + i * 0.006); g.add(link);
    }
    return g;
  }
  function buildInkwell() { // the red ink, corked. leave it corked.
    var g = new THREE.Group();
    var well = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.045, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8dce8, roughness: 0.1, transparent: true, opacity: 0.4 }));
    well.position.y = 0.0225; g.add(well);
    var ink = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.024, 12),
      new THREE.MeshStandardMaterial({ color: 0x7a0f1e, roughness: 0.3, emissive: 0x3a0008, emissiveIntensity: 0.5 }));
    ink.position.y = 0.014; g.add(ink);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.014, 10), mat(0x8a6a3a, 0.4));
    cap.position.y = 0.052; g.add(cap);
    var quill = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.024), new THREE.MeshBasicMaterial({
      map: canvasTex(128, 32, function (gc, w, h) {
        gc.clearRect(0, 0, w, h);
        gc.fillStyle = "#ece6da";
        gc.beginPath(); gc.moveTo(4, h / 2); gc.quadraticCurveTo(w * 0.55, -4, w, h * 0.3);
        gc.quadraticCurveTo(w * 0.55, h + 4, 4, h / 2); gc.fill();
        gc.fillStyle = "#7a0f1e"; // the tip has been dipped
        gc.beginPath(); gc.moveTo(4, h / 2); gc.lineTo(22, h * 0.32); gc.lineTo(22, h * 0.68); gc.fill();
      }), transparent: true, side: THREE.DoubleSide,
    }));
    quill.position.set(0.035, 0.05, 0.012); quill.rotation.z = 0.6; quill.rotation.y = -0.4; g.add(quill);
    return g;
  }
  function buildLens() {
    var g = new THREE.Group();
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 8, 24), goldM);
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.012; g.add(rim);
    var lens = new THREE.Mesh(new THREE.CircleGeometry(0.031, 24),
      new THREE.MeshStandardMaterial({ color: 0xcfe8f2, roughness: 0.05, transparent: true, opacity: 0.24, side: THREE.DoubleSide }));
    lens.rotation.x = -Math.PI / 2; lens.position.y = 0.012; g.add(lens);
    var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.06, 10), toyWoodD);
    handle.rotation.z = Math.PI / 2; handle.rotation.y = 0.5; handle.position.set(0.058, 0.008, -0.028); g.add(handle);
    return g;
  }
  function buildSpitfire() { // on a little display stand, banking for the trees
    var g = new THREE.Group();
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.01, 16), toyWoodD);
    base.position.y = 0.005; g.add(base);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.055, 8), mat(0x8a8f98, 0.4));
    pole.position.y = 0.036; g.add(pole);
    var plane = new THREE.Group(); plane.position.y = 0.068; plane.rotation.set(0, 0.6, 0.35);
    var raf = mat(0x66784f, 0.7);
    var fus = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.006, 0.08, 10), raf);
    fus.rotation.z = Math.PI / 2; plane.add(fus);
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.0085, 0.018, 10), raf);
    nose.rotation.z = -Math.PI / 2; nose.position.x = 0.049; plane.add(nose);
    var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x9fc8e8, roughness: 0.15 }));
    canopy.scale.set(1.6, 1, 1); canopy.position.set(0.01, 0.008, 0); plane.add(canopy);
    var wings = box(0.026, 0.003, 0.1, raf); wings.position.set(0.012, 0, 0); plane.add(wings);
    var tailW = box(0.014, 0.0025, 0.036, raf); tailW.position.set(-0.036, 0.002, 0); plane.add(tailW);
    var fin = box(0.014, 0.014, 0.0025, raf); fin.position.set(-0.038, 0.009, 0); plane.add(fin);
    var prp = box(0.002, 0.03, 0.004, toyWoodD); prp.position.x = 0.059; prp.rotation.x = 0.6; plane.add(prp);
    [-0.036, 0.036].forEach(function (z) { // roundels
      var blue = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.0008, 12), mat(0x2a4a8a, 0.6));
      blue.position.set(0.012, 0.0022, z); plane.add(blue);
      var red = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0012, 10), mat(0xb03030, 0.6));
      red.position.set(0.012, 0.0024, z); plane.add(red);
    });
    g.add(plane);
    return g;
  }
  function buildCrown() { // the Shelf King's
    var g = new THREE.Group();
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.026, 18, 1, true), goldM);
    band.position.y = 0.017; g.add(band);
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.028, 6), goldM);
      spike.position.set(Math.cos(a) * 0.044, 0.042, Math.sin(a) * 0.044); g.add(spike);
      var tipb = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), goldM);
      tipb.position.set(Math.cos(a) * 0.044, 0.058, Math.sin(a) * 0.044); g.add(tipb);
    }
    [[0, 0xc0392b], [2.1, 0x2a6ab8], [4.2, 0x27ae60]].forEach(function (p) {
      var jm = new THREE.MeshStandardMaterial({ color: p[1], roughness: 0.15, emissive: p[1], emissiveIntensity: 0.25 });
      var jewel = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), jm);
      jewel.position.set(Math.cos(p[0]) * 0.047, 0.016, Math.sin(p[0]) * 0.047); g.add(jewel);
    });
    return g;
  }
  function buildBrainball() {
    var g = new THREE.Group(), pink = mat(0xe88ab0, 0.95);
    var main = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 12), pink);
    main.scale.y = 0.82; main.position.y = 0.033; g.add(main);
    [[-0.018, 0.05, 0.012], [0.018, 0.05, 0.012], [-0.014, 0.048, -0.02], [0.016, 0.046, -0.018], [0, 0.055, -0.004]].forEach(function (p) {
      var lobe = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), pink);
      lobe.position.set(p[0], p[1], p[2]); g.add(lobe);
    });
    return g;
  }
  function buildCham() {
    var g = new THREE.Group(), grn = mat(0x7ac04a, 0.8);
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), grn);
    body.scale.set(1.5, 0.9, 0.85); body.position.y = 0.032; g.add(body);
    var head = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.028, 10), grn);
    head.rotation.z = -Math.PI / 2; head.position.set(0.052, 0.038, 0); g.add(head);
    var tail = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.006, 8, 16, 4.6), grn);
    tail.position.set(-0.048, 0.032, 0); tail.rotation.y = 0.2; g.add(tail);
    [[0.02, -0.016], [0.02, 0.016], [-0.02, -0.016], [-0.02, 0.016]].forEach(function (p) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.024, 8), grn);
      leg.position.set(p[0], 0.012, p[1]); g.add(leg);
    });
    [-0.008, 0.008].forEach(function (z) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), mat(0xf2ead6, 0.4));
      eye.position.set(0.046, 0.052, z * 1.6); g.add(eye);
      var pupil = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 6), mat(0x222222, 0.3));
      pupil.position.set(0.05, 0.054, z * 1.9); g.add(pupil);
    });
    return g;
  }
  function buildPalm() { // the island that isn't on any chart, pocket edition
    var g = new THREE.Group();
    var sea = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.066, 0.008, 20),
      new THREE.MeshStandardMaterial({ color: 0x4a9ab8, roughness: 0.3 }));
    sea.position.y = 0.004; g.add(sea);
    var sand = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.014, 18), mat(0xd8c08a, 0.95));
    sand.position.y = 0.014; g.add(sand);
    var seg = null;
    for (var i = 0; i < 3; i++) {
      seg = new THREE.Mesh(new THREE.CylinderGeometry(0.005 - i * 0.001, 0.006 - i * 0.001, 0.024, 8), toyWood);
      seg.position.set(i * 0.006, 0.03 + i * 0.022, 0); seg.rotation.z = -0.18 - i * 0.1; g.add(seg);
    }
    for (var f = 0; f < 5; f++) {
      var a = f / 5 * Math.PI * 2;
      var frond = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016),
        new THREE.MeshStandardMaterial({ color: 0x3f9a4a, roughness: 0.85, side: THREE.DoubleSide }));
      frond.position.set(0.018 + Math.cos(a) * 0.02, 0.085, Math.sin(a) * 0.02);
      frond.rotation.set(Math.sin(a) * 0.5, a, -0.5);
      g.add(frond);
    }
    var coco = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), toyWoodD);
    coco.position.set(0.018, 0.078, 0.008); g.add(coco);
    return g;
  }

  // one collectible per game — have() reads the same-origin saves; Tony's three
  // unlock by walking through their doorway (go() stamps the visit).
  function anyOf(key, pickFn) { var v = readSave(key, pickFn); return v != null && v > 0; }
  var COLLECT = [
    { key: "bracelet", title: "the friendship bracelet", from: "CHOOSE WISELY", icon: "🧶",
      earn: "find an ending in CHOOSE WISELY",
      have: function () { return anyOf("chooseWisely.meta.v2", function (m) { return countOf(m.endingsFound); }); },
      home: { x: 2.65, y: 1.021, z: -2.44 }, build: buildBracelet },
    { key: "laurel", title: "the gold laurel", from: "NINE CIRCLES", icon: "🏵️",
      earn: "reach an ending in NINE CIRCLES",
      have: function () { return anyOf("nc_persist", function (m) { return countOf(m.endings); }); },
      home: { x: -1.45, y: 2.392, z: -2.32 }, build: buildLaurel },
    { key: "compass", title: "the brass compass", from: "STILL BREATHING", icon: "🧭",
      earn: "survive an ordeal in STILL BREATHING",
      have: function () { return anyOf("sb_persist", function (m) { return countOf(m.endings); }); },
      home: { x: 1.75, y: 1.021, z: -2.44 }, build: buildCompass },
    { key: "bottle", title: "the ship in a bottle", from: "SOUTH", icon: "⛵",
      earn: "bring a voyage home in SOUTH",
      have: function () { return anyOf("south_persist", function (m) { return countOf(m.endings); }); },
      home: { x: 1.9, y: 0, z: 0.35 }, build: buildBottle },
    { key: "horse", title: "the little wooden horse", from: "NOBODY", icon: "🐴",
      earn: "reach an ending in NOBODY",
      have: function () { return anyOf("nobody_persist", function (m) { return countOf(m.endings); }); },
      home: { x: -1.85, y: 2.392, z: -2.32 }, build: buildHorse },
    { key: "watch", title: "the White Rabbit's watch", from: "CURIOUSER", icon: "⌚",
      earn: "wake from the dream in CURIOUSER",
      have: function () { return anyOf("alice_persist", function (m) { return countOf(m.wakings); }); },
      home: { x: 2.05, y: 1.021, z: -2.44 }, build: buildWatch },
    { key: "inkwell", title: "the red inkwell", from: "DRACULA — THE RED INK", icon: "🖋️",
      earn: "decide the book's fate in DRACULA",
      have: function () { return anyOf("dracula_persist", function (m) { return countOf(m.endings); }); },
      home: { x: 2.35, y: 1.021, z: -2.44 }, build: buildInkwell },
    { key: "lens", title: "the magnifying glass", from: "ELEMENTARY", icon: "🔍",
      earn: "solve a case in ELEMENTARY",
      have: function () { return anyOf("sherlock_persist", function (m) { return m && m.solved ? countOf(m.solved) : null; }); },
      home: { x: -1.35, y: 0, z: 1.9 }, build: buildLens },
    { key: "spitfire", title: "the model Spitfire", from: "G FOR GEORGE", icon: "✈️",
      earn: "finish a telling in G FOR GEORGE",
      have: function () { return anyOf("gg_persist", function (m) { return countOf(m.endings); }); },
      home: { x: -1.05, y: 2.392, z: -2.32 }, build: buildSpitfire },
    { key: "crown", title: "the Shelf King's crown", from: "AGE OF TOYS", icon: "👑",
      earn: "win a campaign mission in AGE OF TOYS",
      have: function () { var c = ttCampaign(); return c.done + c.secrets > 0; },
      home: { x: -2.25, y: 2.392, z: -2.32 }, build: buildCrown },
    { key: "brainball", title: "the squishy brain", from: "BRAINROT", icon: "🧠",
      earn: "visit BRAINROT — the brain on the desk",
      have: function () { try { return !!localStorage.getItem("room-visited-brainball"); } catch (e) { return false; } },
      home: { x: 2.95, y: 1.021, z: -2.44 }, build: buildBrainball },
    { key: "cham", title: "the rubber chameleon", from: "CHAMELEON 3D", icon: "🦎",
      earn: "visit CHAMELEON 3D — the beige PC",
      have: function () { try { return !!localStorage.getItem("room-visited-cham"); } catch (e) { return false; } },
      home: { x: -0.65, y: 2.392, z: -2.32 }, build: buildCham },
    { key: "palm", title: "the pocket island", from: "TIDEBOUND", icon: "🌴",
      earn: "visit TIDEBOUND — the toy island",
      have: function () { try { return !!localStorage.getItem("room-visited-palm"); } catch (e) { return false; } },
      home: { x: -0.9, y: 0, z: 2.8 }, build: buildPalm },
  ];
  var collByKey = {};
  COLLECT.forEach(function (c) { collByKey[c.key] = c; });
  var VISIT_KEYS = { "GameRepos/brainrot": "brainball", "chameleon": "cham", "GameRepos/tidebound": "palm" };
  function markVisited(url) {
    for (var k in VISIT_KEYS) {
      if (url.indexOf(k) >= 0) { try { localStorage.setItem("room-visited-" + VISIT_KEYS[k], "1"); } catch (e) { } }
    }
  }
  var SURFACES = [floor, rug, dTop, caseTop, sill, stand, nsTop]; // flat tops a collectible can sit on
  var shoeState = loadJSON("room-shoebox") || { placed: {}, seen: {} };
  if (!shoeState.placed) shoeState.placed = {};
  if (!shoeState.seen) shoeState.seen = {};
  function persistShoe() { saveJSON("room-shoebox", shoeState); }
  function persistColl(cfg) {
    var key = cfg.key.slice(5), r = cfg.root;
    shoeState.placed[key] = { x: +r.position.x.toFixed(3), y: +r.position.y.toFixed(3),
                              z: +r.position.z.toFixed(3), ry: +r.rotation.y.toFixed(3) };
    persistShoe();
  }
  function placeColl(key) {
    var c = collByKey[key];
    if (!c || c.inst) return;
    var gp = c.build();
    gp.position.set(c.home.x, c.home.y || 0, c.home.z);
    scene.add(gp);
    c.inst = gp;
    var hint = c.title + " — from " + c.from;
    var cfg = registerMovable({ key: "coll:" + key, label: c.title, root: gp, r: 0.14, rot: true, surface: true, kind: "coll" });
    c.cfg = cfg;
    gp.traverse(function (o) {
      if (o.isMesh) clickable(o, c.title, function () { cfg.pop = 1; clickSfx(1600); }, hint);
    });
    var sv = shoeState.placed[key];
    if (sv && sv.x != null) applyMove(cfg, sv.x, sv.z, sv.ry, sv.y);
    else persistColl(cfg); // first display — remember its home
  }
  function unplaceColl(key) {
    var c = collByKey[key];
    if (!c || !c.inst) return;
    for (var i = pick.length - 1; i >= 0; i--) { // it leaves the clickable + Tab order too
      var p = pick[i], mine = false;
      while (p) { if (p === c.inst) { mine = true; break; } p = p.parent; }
      if (mine) pick.splice(i, 1);
    }
    scene.remove(c.inst);
    unregisterMovable(c.cfg);
    if (selCfg === c.cfg) decorSelect(null);
    c.inst = null; c.cfg = null;
    delete shoeState.placed[key];
    persistShoe();
  }

  /* ---- the shoebox itself (a real thing on the floor) --------------------------- */
  var shoebox = new THREE.Group();
  var sbCard = mat(0xb08a5e, 0.95), sbCardD = mat(0x94714a, 0.95);
  var sbBody = box(0.44, 0.15, 0.3, sbCard); sbBody.position.y = 0.075; shoebox.add(sbBody);
  var sbLid = box(0.47, 0.035, 0.33, sbCardD); sbLid.position.set(0.012, 0.168, -0.008);
  sbLid.rotation.z = 0.05; sbLid.rotation.y = 0.05; shoebox.add(sbLid);
  var sbLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshStandardMaterial({
    map: canvasTex(256, 86, function (gc, w, h) {
      gc.fillStyle = "#e8dcc0"; gc.fillRect(0, 0, w, h);
      gc.strokeStyle = "#94714a"; gc.lineWidth = 4; gc.strokeRect(2, 2, w - 4, h - 4);
      gc.fillStyle = "#2a2a2a"; gc.font = "bold 40px 'Comic Sans MS', 'Segoe Print', cursive";
      gc.textAlign = "center"; gc.textBaseline = "middle";
      gc.fillText("MY STUFF", w / 2, h / 2 + 2);
      gc.fillStyle = "#c0392b"; gc.font = "22px 'Comic Sans MS', cursive";
      gc.fillText("★", 24, 20); gc.fillText("★", w - 24, h - 18);
    }), roughness: 0.9,
  }));
  sbLabel.position.set(0, 0.082, 0.151); shoebox.add(sbLabel);
  shoebox.position.set(0.72, 0, 2.62); shoebox.rotation.y = -0.25; scene.add(shoebox);
  var gShoe = glow(0xffd9a0, 0, 0.26, 0, 0.6, 0.5, 0);
  gShoe.position.set(0.72, 0.26, 2.62); scene.add(gShoe);
  shoebox.children.forEach(function (m) {
    clickable(m, "the shoebox", function () { sbxOpen(); clickSfx(1400); },
      "the shoebox — everything the games left behind");
  });
  registerMovable({ key: "shoebox", label: "the shoebox", root: shoebox, r: 0.3, rot: true, attachObjs: [gShoe] });

  /* ---- injected UI: the decorate button + THE DECORATOR'S DRAWER ---------------- */
  // One docked panel instead of full-screen modals: the room stays visible (and
  // draggable) while you work, so every swatch and toggle previews live. Desktop
  // docks it right (the camera eases over to keep the room centered); narrow
  // screens get a bottom sheet.
  var decorStyle = document.createElement("style");
  decorStyle.textContent =
    "#decor-btn{position:fixed;top:64px;right:22px;z-index:6;font-family:'Inter',sans-serif;font-size:10px;" +
    "letter-spacing:.16em;text-transform:uppercase;color:var(--dim);background:rgba(10,14,20,.6);" +
    "border:1px solid var(--line);border-radius:6px;padding:8px 12px;cursor:pointer}" +
    "#decor-btn:hover{color:var(--bone);border-color:var(--dim)}" +
    "body.decorating #decor-btn{color:#ffd9a0;border-color:#8a6f4a}" +
    "body.listing #decor-btn,body.no3d #decor-btn{display:none}" +
    "#decor-drawer{position:fixed;top:12px;right:12px;bottom:12px;width:292px;z-index:8;display:none;" +
    "flex-direction:column;background:rgba(9,13,20,.87);border:1px solid var(--line);border-radius:12px;" +
    "backdrop-filter:blur(6px);font-family:'Inter',sans-serif;color:var(--bone)}" +
    "body.decorating #decor-drawer{display:flex}" +
    "body.listing #decor-drawer,body.no3d #decor-drawer{display:none!important}" +
    "#dw-tabs{display:flex;gap:6px;padding:10px 10px 8px;border-bottom:1px solid var(--line)}" +
    "#dw-tabs button{flex:1;font-family:inherit;font-size:10px;letter-spacing:.08em;text-transform:uppercase;" +
    "color:var(--dim);background:none;border:1px solid var(--line);border-radius:7px;padding:7px 2px;" +
    "cursor:pointer;position:relative}" +
    "#dw-tabs button.on{color:#ffd9a0;border-color:#8a6f4a;background:rgba(255,194,125,.08)}" +
    "#dw-new{position:absolute;top:1px;right:5px;color:#ff5aa8;font-size:9px}" +
    "#dw-sel{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;" +
    "border-bottom:1px dashed var(--line);font-size:11.5px;color:#ffd9a0}" +
    "#dw-sel button{font-family:inherit;font-size:10px;color:var(--dim);background:none;" +
    "border:1px solid var(--line);border-radius:5px;padding:4px 8px;cursor:pointer}" +
    "#dw-sel button:disabled{opacity:.35;cursor:default}" +
    "#dw-body{flex:1;overflow-y:auto;padding:10px 12px;font-size:12px;line-height:1.4}" +
    "#dw-foot{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}" +
    "#dw-foot button{flex:1;font-family:inherit;font-size:10px;letter-spacing:.1em;text-transform:uppercase;" +
    "color:var(--dim);background:none;border:1px solid var(--line);border-radius:6px;padding:8px 4px;cursor:pointer}" +
    "#dw-foot button:hover,#dw-sel button:hover:not(:disabled),#dw-tabs button:hover{color:var(--bone);border-color:var(--dim)}" +
    ".dw-hint{font-size:11px;font-style:italic;color:var(--faint);margin-bottom:10px}" +
    ".dw-sec{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:12px 0 5px}" +
    ".dw-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}" +
    ".dw-card{font-family:inherit;color:inherit;background:rgba(255,255,255,.04);border:1px solid var(--line);" +
    "border-radius:7px;padding:7px 4px;text-align:center;cursor:pointer}" +
    ".dw-card.on{border-color:#8a6f4a;background:rgba(255,194,125,.08)}" +
    ".dw-card.locked{opacity:.45;cursor:default}" +
    ".dw-card .i{font-size:20px}" +
    ".dw-card .n{font-size:9px;letter-spacing:.03em;margin-top:3px;color:var(--dim)}" +
    ".dw-card.on .n{color:#ffd9a0}" +
    ".dw-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;" +
    "border-bottom:1px dotted var(--line)}" +
    ".dw-row.away span{opacity:.5}" +
    ".dw-row button{font-family:inherit;font-size:9px;letter-spacing:.08em;text-transform:uppercase;" +
    "color:var(--dim);background:none;border:1px solid var(--line);border-radius:5px;padding:4px 8px;" +
    "cursor:pointer;white-space:nowrap}" +
    ".dw-row button.on{color:#ffd9a0;border-color:#8a6f4a}" +
    ".dw-sw{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:4px}" +
    ".dw-sw button{width:30px;height:30px;border-radius:50%;cursor:pointer;border:2px solid var(--line);padding:0}" +
    ".dw-sw button.on{border-color:#ffd9a0;box-shadow:0 0 0 2px rgba(9,13,20,1),0 0 0 4px #8a6f4a}" +
    ".dw-name{display:flex;gap:7px;margin-top:4px}" +
    ".dw-name input{flex:1;font-family:Georgia,serif;font-size:13px;background:rgba(255,255,255,.06);" +
    "color:var(--bone);border:1px solid var(--line);border-radius:5px;padding:7px 9px;min-width:0}" +
    ".dw-name button,.dw-wide{font-family:'Inter',sans-serif;font-size:9.5px;letter-spacing:.1em;" +
    "text-transform:uppercase;color:var(--dim);background:none;border:1px solid var(--line);border-radius:5px;" +
    "padding:6px 10px;cursor:pointer}" +
    ".dw-wide{display:block;width:100%;margin-top:10px}" +
    "@media (max-width:640px),(max-aspect-ratio:9/10){#decor-drawer{top:auto;left:10px;right:10px;bottom:10px;" +
    "width:auto;max-height:46vh}}" +
    "#decor-btn:focus-visible,#decor-drawer button:focus-visible,.dw-name input:focus-visible{" +
    "outline:2px solid #ff5aa8;outline-offset:2px}";
  document.head.appendChild(decorStyle);
  document.body.insertAdjacentHTML("beforeend",
    '<button id="decor-btn" type="button">decorate</button>' +
    '<div id="decor-drawer" role="region" aria-label="decorate the room">' +
    '<div id="dw-tabs">' +
    '<button type="button" data-tab="stuff">🧸 stuff<span id="dw-new" hidden>●</span></button>' +
    '<button type="button" data-tab="paint">🎨 paint</button>' +
    '<button type="button" data-tab="shelf">📦 shelf</button></div>' +
    '<div id="dw-sel" hidden><span id="dw-sel-name"></span><span>' +
    '<button id="dw-rotl" type="button" aria-label="spin left">⟲</button>' +
    '<button id="dw-rotr" type="button" aria-label="spin right">⟳</button>' +
    '<button id="dw-back" type="button">put back</button></span></div>' +
    '<div id="dw-body"></div>' +
    '<div id="dw-foot"><button id="dw-reset" type="button">reset the room</button>' +
    '<button id="dw-done" type="button">done</button></div>' +
    "</div>");
  var dwTabName = "stuff";
  function dwTab(name) {
    dwTabName = name || "stuff";
    document.querySelectorAll("#dw-tabs button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === dwTabName);
    });
    dwRender();
    if (dwTabName === "stuff") { // opening the stuff tab is "seeing" the collection
      COLLECT.forEach(function (c) { if (c.have()) shoeState.seen[c.key] = 1; });
      persistShoe(); sbxNew = 0; dwNewDot();
    }
  }
  function dwNewDot() {
    var d = document.getElementById("dw-new");
    if (d) d.hidden = !(sbxNew > 0);
  }
  function dwRender() {
    var el = document.getElementById("dw-body");
    if (!el) return;
    el.innerHTML = dwTabName === "paint" ? dwPaintHTML() : dwTabName === "shelf" ? dwShelfHTML() : dwStuffHTML();
    var inp = document.getElementById("dw-name-inp");
    if (inp) inp.value = paintState.name || "";
  }
  document.getElementById("decor-btn").addEventListener("click", function () { decorSet(!decorMode); clickSfx(1300); });
  document.getElementById("dw-tabs").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (b) { dwTab(b.getAttribute("data-tab")); clickSfx(1400); }
  });
  document.getElementById("dw-rotl").addEventListener("click", function () { if (selCfg && selCfg.rot) { decorRotate(selCfg, 0.22); clickSfx(1500); } });
  document.getElementById("dw-rotr").addEventListener("click", function () { if (selCfg && selCfg.rot) { decorRotate(selCfg, -0.22); clickSfx(1500); } });
  document.getElementById("dw-back").addEventListener("click", function () {
    if (!selCfg) return;
    applyMove(selCfg, selCfg.def.x, selCfg.def.z, selCfg.def.ry, selCfg.surface ? selCfg.def.y : null);
    persistFor(selCfg); clickSfx(1100);
  });
  document.getElementById("dw-reset").addEventListener("click", function () { decorReset(); clickSfx(900); });
  document.getElementById("dw-done").addEventListener("click", function () { decorSet(false); clickSfx(1300); });
  document.getElementById("dw-body").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    var key;
    if ((key = b.getAttribute("data-coll"))) {
      if (shoeState.placed[key]) unplaceColl(key); else { placeColl(key); clickSfx(1700); }
      dwRender();
    } else if ((key = b.getAttribute("data-paint"))) {
      setPaint(key, +b.getAttribute("data-i")); dwRender(); clickSfx(1600);
    } else if (b.getAttribute("data-neon") != null && b.getAttribute("data-neon") !== "") {
      setPaint("neon", +b.getAttribute("data-neon")); dwRender(); clickSfx(1600);
    } else if ((key = b.getAttribute("data-lights"))) {
      setPaint("lights", key); dwRender(); clickSfx(1600);
    } else if ((key = b.getAttribute("data-out"))) {
      outState[key] = outState[key] ? 0 : 1;
      if (!outState[key]) delete outState[key];
      saveJSON("room-out", outState);
      applyOut(); dwRender(); clickSfx(outState[key] ? 900 : 1700);
      if (outState[key] && !obSaidLine) {
        obSaidLine = true;
        try { kidSay("into the underbed box it goes. it'll keep.", 4); } catch (e2) { }
      }
    } else if (b.id === "dw-name-set") {
      paintState.name = document.getElementById("dw-name-inp").value;
      saveJSON("room-paint", paintState);
      applyPaint(); dwRender(); clickSfx(1700);
      var nm = roomOwnerName();
      if (nm) { try { kidSay(nm + "'s room. it's official — it's on the wall.", 4.5); } catch (e3) { } }
    } else if (b.getAttribute("data-act") === "wash") {
      pbWash(); dwRender(); clickSfx(900);
    } else if (b.getAttribute("data-act") === "allout") {
      outState = {};
      saveJSON("room-out", outState);
      applyOut(); dwRender(); clickSfx(1700);
    }
  });

  /* ---- the stuff tab (the shoebox opens the drawer now) -------------------------- */
  var sbxNew = 0;
  function sbxRefreshNew() {
    sbxNew = 0;
    COLLECT.forEach(function (c) { if (c.have() && !shoeState.seen[c.key]) sbxNew++; });
    dwNewDot();
  }
  function dwStuffHTML() {
    var found = 0, out = 0;
    var cards = COLLECT.map(function (c) {
      var got = c.have();
      if (got) found++;
      var placed = !!shoeState.placed[c.key];
      if (placed) out++;
      if (!got) {
        return '<div class="dw-card locked" title="' + c.earn + '"><div class="i">?</div>' +
          '<div class="n">' + c.from + "</div></div>";
      }
      return '<button type="button" class="dw-card' + (placed ? " on" : "") + '" data-coll="' + c.key +
        '" title="' + c.title + " — " + (placed ? "out in the room · click to box it" : "click to put it in the room") + '">' +
        '<div class="i">' + c.icon + '</div><div class="n">' + c.title.replace(/^the /, "") + "</div></button>";
    }).join("");
    return '<div class="dw-hint">drag anything in the room to move it · scroll spins it · shelves and sills catch the little things</div>' +
      '<div class="dw-sec">the shoebox — ' + found + " of " + COLLECT.length + " found · " + out + " on display</div>" +
      '<div class="dw-grid">' + cards + "</div>";
  }
  function sbxRender() { if (decorMode && dwTabName === "stuff") dwRender(); }
  function sbxOpen() { decorSet(true); dwTab("stuff"); }
  function sbxClose() { decorSet(false); }

  // restore what was on display, and count anything newly earned
  for (var pk in shoeState.placed) if (collByKey[pk]) placeColl(pk);
  sbxRefreshNew();
  // once you're inside, the kid mentions new arrivals (or your remodeling) — once
  (function kidNoticer() {
    var iv = setInterval(function () {
      var ec = document.getElementById("enter");
      if (ec && !ec.classList.contains("gone")) return; // still on the porch
      clearInterval(iv);
      setTimeout(function () {
        try {
          if (sbxNew > 0) kidSay("psst — the shoebox has something new in it.", 5);
          else if (Object.keys(savedLayout).length && Math.random() < 0.4)
            kidSay("you moved my stuff around… no, it's good. it's good.", 4.5);
        } catch (e) { }
      }, 8000);
    }, 3000);
  })();

  /* ============================================================================
   * THE PAINT BOX — the other half of "make it yours": repaint the walls, the
   * carpet, the rug, recolor the neon sign and the string lights, and put your
   * NAME over the shelf in crayon. All tints are material.color multiplies over
   * the existing textures (zero new assets); everything persists per visitor.
   * ========================================================================== */
  var paintState = loadJSON("room-paint") || {};
  var PAINT = {
    walls: { label: "the walls", mats: [wallM, wallMSide], opts: [
      ["as found", 0xffffff], ["mint", 0xcfe4d2], ["peach", 0xf2d4c2],
      ["sky", 0xc6d8f0], ["lavender", 0xdccce8], ["butter", 0xf0e6be]] },
    carpet: { label: "the carpet", mats: [floorM], opts: [
      ["as found", 0xffffff], ["warm", 0xdcc8b4], ["sage", 0xc4d8c4],
      ["slate", 0xc4c8d8], ["rosy", 0xe4c4c4]] },
    rug: { label: "the rug", mats: null /* rug.material, resolved at apply */, opts: [
      ["galaxy", 0xffffff], ["ember", 0xf0a8a8], ["jungle", 0xa8e0b4], ["gold", 0xf0dca0]] },
  };
  var NEON_OPTS = [ // [label, hue-rotate degrees, light color]
    ["pink", 0, 0xff5aa8], ["gold", 60, 0xffb84d], ["lime", 130, 0x8ae05a],
    ["cyan", 200, 0x4dd8ff], ["violet", 265, 0x9a7dff]];
  var LIGHT_PALS = {
    classic: [0xff6a5a, 0xffd166, 0x8ad7ff, 0x7be08a, 0xc79bff],
    "warm glow": [0xffe2b8, 0xffd9a0, 0xffe8c8, 0xffd9a0, 0xffeacc],
    rainbow: [0xff4444, 0xff9d2a, 0xffd166, 0x4ae04a, 0x4a8aff, 0xb44aff],
    ocean: [0x4ad8d8, 0x4a8aff, 0x7dc8ff, 0x2ae0b0, 0x8ad7ff],
    candy: [0xff5aa8, 0xff8ac8, 0xffb8d8, 0xff5a7d, 0xffc8e0],
  };
  function roomOwnerName() {
    var n = paintState.name;
    if (!n) return null;
    n = String(n).replace(/[^\w '\-\.]/g, "").trim().slice(0, 14);
    return n || null;
  }
  var neonImg = null, nameMesh = null;
  function applyNeonPaint() {
    var opt = NEON_OPTS[paintState.neon || 0] || NEON_OPTS[0];
    neonLight.color.set(opt[2]);
    gNeon.material.color.set(opt[2]);
    if (!neonMesh) return; // the texture-load callback re-calls us
    if (!opt[1]) return;   // pink is the sign as manufactured
    if (!neonImg) {
      neonImg = new Image();
      neonImg.onload = applyNeonPaint;
      neonImg.src = "assets/tex/neon.png";
      return;
    }
    if (!neonImg.complete || !neonImg.naturalWidth) return;
    var c = document.createElement("canvas");
    c.width = neonImg.naturalWidth; c.height = neonImg.naturalHeight;
    var g = c.getContext("2d");
    if (typeof g.filter === "string") { g.filter = "hue-rotate(" + opt[1] + "deg)"; g.drawImage(neonImg, 0, 0); }
    else { g.drawImage(neonImg, 0, 0); neonMesh.material.color.set(opt[2]); } // old browsers: tint instead
    var t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    neonMesh.material.map = t; neonMesh.material.needsUpdate = true;
  }
  function applyNameBanner() {
    if (nameMesh) { scene.remove(nameMesh); nameMesh = null; }
    var nm = roomOwnerName();
    if (!nm) return;
    var text = nm.toUpperCase() + (/s$/i.test(nm) ? "'" : "'S") + " ROOM";
    var bT = canvasTex(512, 64, function (g, w, h) { // same crayon recipe as the birthday banner
      g.fillStyle = "#efe6d0"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#c9b895"; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
      var cols = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#e67e22"];
      g.font = "bold 30px Georgia, serif"; g.textBaseline = "middle";
      var tw = 0;
      for (var m = 0; m < text.length; m++) tw += g.measureText(text[m]).width + 2;
      var x = Math.max(14, (w - tw) / 2);
      for (var i = 0; i < text.length; i++) {
        g.fillStyle = cols[i % cols.length];
        g.fillText(text[i], x, h / 2 + (i % 2 ? 3 : -3));
        x += g.measureText(text[i]).width + 2;
      }
    });
    nameMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.21), new THREE.MeshBasicMaterial({ map: bT }));
    nameMesh.position.set(-1.3, season === "bday" ? 2.32 : 2.56, -2.52); // the birthday banner outranks you one day a year
    nameMesh.rotation.z = 0.02;
    scene.add(nameMesh);
  }
  function applyPaint() {
    for (var k in PAINT) {
      var row = PAINT[k], opt = row.opts[paintState[k] || 0] || row.opts[0];
      var mats = row.mats || [rug.material];
      mats.forEach(function (m) { m.userData.tint = opt[1]; if (m.map || opt[1] !== 0xffffff) m.color.set(opt[1]); });
    }
    if (!season) { // the calendar's own light shows (yule/spook/bday) always win
      var pal = LIGHT_PALS[paintState.lights || "classic"] || LIGHT_PALS.classic;
      for (var b = 0; b < bulbs.length; b++) {
        bulbs[b].material.color.set(pal[b % pal.length]);
        if (bulbs[b].userData.glow) bulbs[b].userData.glow.material.color.set(pal[b % pal.length]);
      }
    }
    applyNeonPaint();
    applyNameBanner();
  }
  function setPaint(key, val) {
    paintState[key] = val;
    saveJSON("room-paint", paintState);
    applyPaint();
  }

  /* ---- the paint tab (lives in the drawer — swatches preview live) --------------- */
  function hex6(n) { return "#" + ("00000" + n.toString(16)).slice(-6); }
  function dwPaintHTML() {
    var html = '<div class="dw-hint">same room, your colors — watch it change as you click</div>';
    for (var k in PAINT) {
      var row = PAINT[k], cur = paintState[k] || 0;
      html += '<div class="dw-sec">' + row.label + '</div><div class="dw-sw">';
      row.opts.forEach(function (o, i) {
        html += '<button type="button" data-paint="' + k + '" data-i="' + i + '"' +
          (i === cur ? ' class="on"' : "") + ' style="background:' + hex6(o[1]) + '" title="' + o[0] +
          '" aria-label="' + row.label + ": " + o[0] + '"></button>';
      });
      html += "</div>";
    }
    html += '<div class="dw-sec">the neon sign</div><div class="dw-sw">';
    NEON_OPTS.forEach(function (o, i) {
      html += '<button type="button" data-neon="' + i + '"' + (i === (paintState.neon || 0) ? ' class="on"' : "") +
        ' style="background:' + hex6(o[2]) + '" title="' + o[0] + '" aria-label="neon: ' + o[0] + '"></button>';
    });
    html += "</div>";
    html += '<div class="dw-sec">the string lights</div>';
    if (season) html += '<div class="dw-hint">the season has the lights right now — come back after</div>';
    else {
      html += '<div class="dw-sw">';
      for (var pk in LIGHT_PALS) {
        var pal = LIGHT_PALS[pk];
        html += '<button type="button" data-lights="' + pk + '"' +
          (pk === (paintState.lights || "classic") ? ' class="on"' : "") +
          ' style="background:linear-gradient(90deg,' + pal.slice(0, 4).map(hex6).join(",") + ')" title="' + pk +
          '" aria-label="lights: ' + pk + '"></button>';
      }
      html += "</div>";
    }
    html += '<div class="dw-sec">this room belongs to</div><div class="dw-name">' +
      '<input id="dw-name-inp" maxlength="14" placeholder="write your name" autocomplete="off" spellcheck="false">' +
      '<button id="dw-name-set" type="button">put it up</button></div>' +
      '<button type="button" class="dw-wide" data-act="wash">wash it all off</button>';
    return html;
  }
  function pbWash() { // back to as-found
    paintState = {};
    saveJSON("room-paint", paintState);
    [wallM, wallMSide, floorM, rug.material].forEach(function (m) { m.userData.tint = null; m.color.set(0xffffff); });
    if (neonMesh && neonImg && neonImg.complete) { var t = new THREE.Texture(neonImg); t.needsUpdate = true; t.anisotropy = 8; neonMesh.material.map = t; neonMesh.material.color.set(0xffffff); neonMesh.material.needsUpdate = true; }
    applyPaint();
  }
  function pbOpen() { decorSet(true); dwTab("paint"); }
  function pbClose() { decorSet(false); }
  applyPaint(); // restore this visitor's colors + name

  /* ============================================================================
   * WHAT'S OUT — choose which games are on display. Every book on the shelf,
   * the toy chest, the army men, the brain, the beige PC, the toy island: each
   * can go in the underbed box and come back whenever. Hidden things leave the
   * click/Tab/drag world entirely, their kid-obstacles collapse, and their wall
   * posters go with them. This is the future storefront skeleton: when game
   * keys arrive, ownership gates the same registry.
   * ========================================================================== */
  var outState = loadJSON("room-out") || {};
  var OUT_SECTIONS = [["books", "on the shelf"], ["toys", "on the floor"], ["desk", "on the desk"]];
  var HIDEABLES = [
    { key: "b_south", sec: "books", label: "SOUTH", get: function () { return [bookByTitle["SOUTH"]]; } },
    { key: "b_sb", sec: "books", label: "STILL BREATHING", get: function () { return [bookByTitle["STILL BREATHING"]]; } },
    { key: "b_nc", sec: "books", label: "NINE CIRCLES", get: function () { return [bookByTitle["NINE CIRCLES"]]; } },
    { key: "b_cw", sec: "books", label: "CHOOSE WISELY", get: function () { return [bookByTitle["CHOOSE WISELY"]]; } },
    { key: "b_nobody", sec: "books", label: "NOBODY", get: function () { return [bookByTitle["NOBODY"]]; } },
    { key: "b_tide", sec: "books", label: "TIDEBOUND (the book)", get: function () { return [bookByTitle["TIDEBOUND"]]; } },
    { key: "b_elem", sec: "books", label: "ELEMENTARY", get: function () { return [bookByTitle["ELEMENTARY"]]; } },
    { key: "b_alice", sec: "books", label: "CURIOUSER", get: function () { return [bookByTitle["CURIOUSER"]]; } },
    { key: "b_drac", sec: "books", label: "DRACULA", get: function () { return [bookByTitle["DRACULA"]]; } },
    { key: "b_george", sec: "books", label: "G FOR GEORGE", get: function () { return [bookByTitle["G FOR GEORGE"]]; } },
    { key: "chest", sec: "toys", label: "the toy chest (AGE OF TOYS)", obs: 0,
      get: function () { return [chest]; } },
    { key: "war", sec: "toys", label: "the army men on the rug",
      get: function () { return [war]; } },
    { key: "island", sec: "toys", label: "the toy island (TIDEBOUND)", obs: 3,
      get: function () { return movableByKey.island ? [movableByKey.island.root] : []; } },
    { key: "brain", sec: "desk", label: "the brain (BRAINROT) + poster", halos: function () { return [gBrain]; },
      get: function () { return [brainG, posterBrainrot]; } },
    { key: "pc", sec: "desk", label: "the beige PC (CHAMELEON 3D) + poster",
      get: function () { return [pc, posterC3D]; } },
  ];
  function applyOut() {
    HIDEABLES.forEach(function (h) {
      var hidden = !!outState[h.key];
      h.get().forEach(function (o) { if (o) o.visible = !hidden; });
      if (h.obs != null) { // no invisible walls: the kid walks where the toy isn't
        var ob = KID_OBSTACLES[h.obs];
        if (ob.__baseR == null) ob.__baseR = ob.r;
        ob.r = hidden ? 0 : ob.__baseR;
      }
      if (h.halos) h.halos().forEach(function (s) {
        if (!s) return;
        if (s.userData.__baseOp == null) s.userData.__baseOp = s.material.opacity;
        s.material.opacity = hidden ? 0 : s.userData.__baseOp;
      });
    });
    kbListDirty = true;
    if (selCfg && selCfg.root.visible === false) decorSelect(null);
  }

  /* ---- the shelf tab (lives in the drawer — the room empties as you click) ------- */
  var obSaidLine = false;
  function dwShelfHTML() {
    var html = '<div class="dw-hint">anything can wait in the underbed box — and come back whenever</div>';
    OUT_SECTIONS.forEach(function (sec) {
      html += '<div class="dw-sec">' + sec[1] + "</div>";
      HIDEABLES.forEach(function (h) {
        if (h.sec !== sec[0]) return;
        var hidden = !!outState[h.key];
        html += '<div class="dw-row' + (hidden ? " away" : "") + '"><span>' + h.label + "</span>" +
          '<button type="button" data-out="' + h.key + '"' + (hidden ? "" : ' class="on"') + ">" +
          (hidden ? "put it out" : "out ✓") + "</button></div>";
      });
    });
    html += '<button type="button" class="dw-wide" data-act="allout">everything back out</button>';
    return html;
  }
  function obOpen() { decorSet(true); dwTab("shelf"); }
  function obClose() { decorSet(false); }
  applyOut(); // restore this visitor's shelf

  var frameCount = 0, lastT = performance.now() / 1000;
  function tick() {
    requestAnimationFrame(tick);
    var t = performance.now() / 1000, dt = Math.min(t - lastT, 0.1); lastT = t;
    // with no pointer to follow (phones, or just resting), take a slow look around
    var idle = t - pointerMovedAt > 6;
    // decorating holds the camera steady (dragging with a drifting view fights you)
    // and eases the gaze right so the room centers beside the docked drawer
    var mx = decorMode ? (camera.aspect > 0.95 ? 0.42 : 0) : idle ? Math.sin(t * 0.07) * 0.4 : mouse.x;
    var my = decorMode ? 0 : idle ? Math.sin(t * 0.05 + 2) * 0.18 : mouse.y;
    var baseX = mx * 0.55, baseY = 1.72 + my * 0.24;
    if (zoomT >= 0) { // the kid opened something: lean in while it loads
      zoomT = Math.min(1, zoomT + dt / 1.15);
      var kz = zoomT * zoomT * (3 - 2 * zoomT);
      camera.position.lerpVectors(zoomFrom, zoomTo, kz);
      lookAt.lerpVectors(zoomLookFrom, zoomLookTo, kz);
      camera.lookAt(lookAt);
      if (zoomT >= 1 && pendingNav) { var navF = pendingNav; pendingNav = null; navF(); }
    } else {
      if (introT >= 0 && introT < 1) { // the dolly in from the doorway
        introT = Math.min(1, introT + dt / INTRO);
        var ke = 1 - Math.pow(1 - introT, 3);
        camera.position.set(baseX * ke, 2.6 + (baseY - 2.6) * ke, (camRestZ + 2.5) + (camRestZ - (camRestZ + 2.5)) * ke);
      } else {
        camera.position.x += (baseX - camera.position.x) * 0.04;
        camera.position.y += (baseY - camera.position.y) * 0.04;
        camera.position.z += ((camRestZ + (decorMode ? 0.55 : 0)) - camera.position.z) * 0.04; // settle to the aspect-aware distance (a step back while decorating)
      }
      lookAt.x += ((mx * 1.25) - lookAt.x) * 0.04; // pan the gaze — the bed and side walls come into view
      camera.lookAt(lookAt);
    }
    // THE KID: walks between spots, then actually DOES something where he lands —
    // sits in the beanbag, lies on the bed, fidgets at the shelves. Clips crossfade.
    function kidFace(want, rate) { // turn toward a heading
      var kdr = want - kid.rotation.y;
      while (kdr > Math.PI) kdr -= Math.PI * 2; while (kdr < -Math.PI) kdr += Math.PI * 2;
      kid.rotation.y += kdr * Math.min(1, dt * (rate || 6));
    }
    // he waves hello when you first step into the room (once the clip is ready)
    if (kidGreet && kidActions.wave && !pendingNav && zoomT < 0 &&
        kidState.mode !== "onBed" && kidState.mode !== "toBed" && kidState.mode !== "bedSlide") {
      kidGreet = false; kidState.mode = "greet"; kidState.t = 0;
      kid.position.y = 0; setKidAction("wave", 0.2);
      kidSay(kidGreetLine(), 5.5);
    }
    if (kidState.mode === "greet") {
      kidState.t += dt;
      kidFace(Math.atan2(-kid.position.x, 4.9 - kid.position.z), 5); // turn to the doorway/camera
      if (kidState.t > 2.6) { kidState.mode = "roam"; kidPickStation(); }
    } else if (kidState.mode === "roam" || kidState.mode === "summon") {
      var summoned = kidState.mode === "summon";
      setKidAction("walk", 0.2);
      var kdist = kidStep(dt, summoned ? 1.2 : 0.55);
      kidState.walkT += dt;
      var arrived = kdist <= 0.08, stuck = kidState.walkT > (summoned ? 3.2 : 10);
      if (kid.position.y > 0.01) kid.position.y += (0 - kid.position.y) * Math.min(1, dt * 3); // hop down if a click pulled him off the bed
      if (!arrived && !stuck) {
        kidFace(Math.atan2(kidState.faceX, kidState.faceZ), 9);
      } else if (arrived && kidState.via) { // reached the hub — press on to the real target
        kidState.via = false; kidState.walkT = 0; kidState.tx = kidState.fx; kidState.tz = kidState.fz;
      } else {
        kidState.walkT = 0; kidState.via = false;
        if (summoned) { kidState.mode = "open"; kidState.t = 0; setKidAction("fidget", 0.2); kidSay(kidFetchLine(kidState.fetchName), 3); }
        else if (kidState.station && kidState.station.act === "bed") { kidState.mode = "toBed"; }
        else {
          var act = (kidState.station && kidState.station.act) || "idle";
          setKidAction(act, 0.35);
          kidState.ignoreObs = -1;
          kidState.targetY = (kidState.station && kidState.station.y) || 0;
          kidState.glanceT = 2.5 + Math.random() * 4; // first look-at-you a beat after he settles
          kidState.mode = "act";
          kidState.t = (act === "dance" ? 11 : act === "sit" ? 8 : 3.5) + Math.random() * 5;
        }
      }
    } else if (kidState.mode === "act") { // sitting / idling / fidgeting / dancing where he stopped
      kidState.t -= dt;
      kid.position.y += ((kidState.targetY || 0) - kid.position.y) * Math.min(1, dt * 4);
      var actNow = kidState.station && kidState.station.act;
      if (actNow === "sit") kidFace(kidState.station.yaw != null ? kidState.station.yaw : 0.35, 3); // sink back, face the room
      else if (actNow === "dance") kidFace(0.1, 2); // face the room while he grooves
      else if (actNow === "idle") { // every few seconds he glances at whoever's watching, then looks away again
        kidState.glanceT -= dt;
        if (kidState.glanceT <= 0) {
          kidFace(Math.atan2(camera.position.x - kid.position.x, camera.position.z - kid.position.z), 2.2);
          if (kidState.glanceT <= -2) kidState.glanceT = 4 + Math.random() * 4;
        }
      }
      // if the boombox stops mid-dance, wander off
      if (actNow === "dance" && !audioOn) kidState.t = Math.min(kidState.t, 0.5);
      if (kidState.t <= 0) { kidState.targetY = 0; kidState.mode = "roam"; kidPickStation(); }
    } else if (kidState.mode === "toBed") { // hoist up at the bedside — over the rail, not through it
      setKidAction("idle", 0.3);
      kid.position.x += (KID_BED.upX - kid.position.x) * Math.min(1, dt * 1.4);
      kid.position.y += (KID_BED.upY - kid.position.y) * Math.min(1, dt * 2.6); // up first, then over the rail
      kidFace(0, 5); // turn to lie head-toward-the-pillow (the clip lies along -z)
      if (kid.position.y > KID_BED.upY - 0.05) { kidState.mode = "bedSlide"; }
    } else if (kidState.mode === "bedSlide") { // scoot to the middle and settle down
      kid.position.x += (KID_BED.x - kid.position.x) * Math.min(1, dt * 2);
      kid.position.y += (KID_BED.y - kid.position.y) * Math.min(1, dt * 1.4);
      kid.position.z += (KID_BED.z - kid.position.z) * Math.min(1, dt * 2);
      kidFace(0, 5);
      if (Math.abs(kid.position.x - KID_BED.x) < 0.05 && Math.abs(kid.position.z - KID_BED.z) < 0.06) {
        kid.rotation.y = 0;
        setKidAction("lie", 0.45); kidState.mode = "onBed"; kidState.t = 10 + Math.random() * 6;
      }
    } else if (kidState.mode === "onBed") {
      kidState.t -= dt;
      if (kidState.t <= 0) { kidState.mode = "offBed"; setKidAction("idle", 0.4); }
    } else if (kidState.mode === "offBed") { // slide back off at the bedside
      kid.position.x += (KID_BED.sideX - kid.position.x) * Math.min(1, dt * 2);
      kid.position.y += (0 - kid.position.y) * Math.min(1, dt * 2.4);
      kid.position.z += (KID_BED.sideZ - kid.position.z) * Math.min(1, dt * 2);
      if (Math.abs(kid.position.x - KID_BED.sideX) < 0.06 && kid.position.y < 0.05) {
        kid.position.y = 0; kidState.ignoreObs = -1; kidState.mode = "roam"; kidPickStation();
      }
    } else if (kidState.mode === "open") { // reaching for the thing you asked for
      kidState.t += dt;
      if (kidState.t >= 0.55) { kidState.mode = "stand"; kidStartZoom(); }
    } else if (kidState.mode === "stand" && !pendingNav && zoomT < 0) {
      kidState.mode = "roam"; kidPickStation(); // failsafe fired without us — recover
    }
    if (kidMixer) kidMixer.update(dt); // clips always advance now (idle/sit/lie animate in place)
    updateKidBubble(); // keep his speech bubble over his head
    if ((frameCount % 120) === 0) applyPhase(); // the room checks the clock
    // five more minutes: while the bed has you, the whole room breathes lower
    nap += (((t < napUntil) ? 1 : 0) - nap) * Math.min(1, dt * 1.8);
    var dim = 1 - 0.8 * nap;
    amb.intensity = phase.ambI * (1 - 0.65 * nap);
    lampLight.intensity = (lampOn ? 1.5 : 0.12) * dim;
    lavaLight.intensity = (lavaOn ? 0.8 : 0.05) * dim;
    shelfGlow.intensity = 0.55 * dim;
    if (nap > 0.5 && t > nextSnore) { nextSnore = t + 3.6; snoreSfx(); }
    // the TV surfs between dead air and whatever's on at this hour
    tvFlip -= dt;
    if (tvFlip <= 0 && cartoonT) {
      tvCartoon = !tvCartoon;
      // Late night used to be ALL test pattern — anyone playing after midnight never saw
      // the cartoons. Now the test card is just an occasional late-night beat.
      var showTest = phase.test && Math.random() < 0.3;
      screen.material.map = tvCartoon ? (showTest ? testT : cartoonT) : staticT;
      screen.material.needsUpdate = true;
      crtLight.color.set(tvCartoon ? (showTest ? 0xc8c8e0 : 0xffd9a0) : 0x7db4ff);
      tvFlip = tvCartoon ? phase.on[0] + Math.random() * phase.on[1]
                         : phase.off[0] + Math.random() * phase.off[1];
    }
    if (tvCartoon) {
      crtBase = 0.72 + 0.08 * Math.sin(t * 9);
    } else if ((frameCount & 3) === 0) { // static flicker
      var d = staticCtx.createImageData(128, 96);
      for (var i = 0; i < d.data.length; i += 4) {
        var v = (Math.random() * 255) | 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      staticCtx.putImageData(d, 0, 0);
      staticT.needsUpdate = true;
      crtBase = 0.5 + Math.random() * 0.35;
    }
    crtLight.intensity = crtBase * dim;
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
    for (var mi = 0; mi < mixers.length; mi++) mixers[mi].update(dt);
    for (var fi = fadeIns.length - 1; fi >= 0; fi--) { // props ease in as they finish loading
      var fin = fadeIns[fi]; fin.t = Math.min(1, fin.t + dt / 0.6);
      for (var fm = 0; fm < fin.mats.length; fm++) fin.mats[fm].opacity = fin.t;
      if (fin.t >= 1) { fin.mats.forEach(function (m) { m.transparent = m.__wasTransparent; m.__fading = false; }); fadeIns.splice(fi, 1); }
    }
    // the boombox thumps its cones to the tape (72bpm = 1.2 beats/s)
    var thump = audioOn ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.2)), 6) : 0;
    for (var bc = 0; bc < boomCones.length; bc++) {
      var cn = boomCones[bc];
      cn.position.z = cn.__z0 + thump * 0.012;
      cn.scale.set(1 + thump * 0.16, 1 + thump * 0.16, 1);
    }
    if (robotWrap) { // wind-up tin robot: circles the rug with a little waddle-rock
      robotBoost *= Math.pow(0.5, dt / 2.5); // the spring unwinds
      if (robotBoost < 0.02) robotBoost = 0;
      robotAng += dt * 0.32 * robotDir * (1 + robotBoost) * (1 - 0.72 * nap); // he tiptoes past the bed
      robotWrap.position.set(rugCX + Math.sin(robotAng) * 0.9, 0, rugCZ + Math.cos(robotAng) * 0.9);
      robotWrap.rotation.y = robotAng + robotDir * Math.PI / 2;
      robotWrap.rotation.z = Math.sin(t * 6.5 * (1 + robotBoost * 0.5)) * 0.045 * (1 - 0.75 * nap);
      if (keyG) {
        keyFast -= dt;
        keyG.rotation.z -= dt * (keyFast > 0 ? 22 : 1.4 + robotBoost * 7); // winding spins it hard
      }
    }
    if (ssMode && (frameCount & 1) === 0) drawScreensaver(dt * 2); // the PC dreams at half rate
    // the rug war wakes while you watch it, freezes when you look away
    warHeat += (((hovered && hovered.userData.war) ? 1 : 0) - warHeat) * Math.min(1, dt * 5);
    if (warHeat > 0.01) {
      for (var wf = 0; wf < warFigs.length; wf++) {
        var fg = warFigs[wf];
        if (fg.fallen) continue;
        fg.g.rotation.z = fg.baseZ + Math.sin(t * 9 + fg.phase) * 0.1 * warHeat; // plastic waddle
        fg.g.position.y = Math.abs(Math.sin(t * 9 + fg.phase)) * 0.006 * warHeat;
      }
      for (var wm = 0; wm < warFlashes.length; wm++) {
        var fm2 = warFlashes[wm];
        fm2.opacity = (Math.random() < 0.1 && warHeat > 0.3) ? warHeat : fm2.opacity * 0.55;
      }
      for (var wu = 0; wu < warPuffs.length; wu++) {
        warPuffs[wu].position.y += Math.sin(t * 1.7 + wu * 2) * 0.0003 * warHeat;
        warPuffs[wu].rotation.y += dt * 0.4 * warHeat;
      }
    }
    if (chestGlowBase > 0) { // the campaign smolders in the chest
      chestGlow.intensity = chestGlowBase * (0.82 + 0.22 * Math.sin(t * 2.1)) * dim;
      if (chestGlowDisc) chestGlowDisc.material.opacity = (0.75 + 0.25 * Math.sin(t * 2.1)) * (0.25 + 0.75 * dim);
    }
    // once a night, a knock at the door
    if (knockAt > 0 && t > knockAt) {
      knockAt = -1; knockAnim = t; knockSfx();
      try { localStorage.setItem("room-knock", new Date().toDateString()); } catch (e) { /* private mode */ }
      pick.forEach(function (m) { if (m.userData.name === "the door") m.userData.hint = "the door — someone said goodnight"; });
    }
    if (knockAnim > 0) { // the hallway light stirs, the knob jiggles
      var ka = (t - knockAnim) / 1.6;
      if (ka >= 1) { knockAnim = -1; spill.material.opacity = 0.32; knob.rotation.x = 0; }
      else {
        spill.material.opacity = 0.32 + 0.5 * Math.max(0, Math.sin(ka * 19)) * (1 - ka);
        knob.rotation.x = Math.sin(ka * 42) * 0.07 * (1 - ka);
      }
    }
    var nowD = new Date();
    var nowS = nowD.getSeconds() + nowD.getMilliseconds() / 1000;
    var nowM = nowD.getMinutes() + nowS / 60;
    secHand.rotation.z = -nowS / 60 * Math.PI * 2;
    minHand.rotation.z = -nowM / 60 * Math.PI * 2;
    hourHand.rotation.z = -((nowD.getHours() % 12) + nowM / 60) / 12 * Math.PI * 2;
    // string lights twinkle; stars breathe; motes drift
    for (var bu = 0; bu < bulbs.length; bu++) {
      var bop = (0.55 + 0.4 * Math.sin(t * twinkleRate + bulbs[bu].userData.phase)) * (0.35 + 0.65 * dim);
      bulbs[bu].material.opacity = bop;
      if (bulbs[bu].userData.glow) bulbs[bu].userData.glow.material.opacity = bop * 0.6; // halo twinkles too
    }
    for (var si = 0; si < stars.length; si++) stars[si].material.opacity = phase.stars + 0.35 * Math.sin(t * 0.5 + stars[si].userData.phase);
    if (shootT < 0) { // launch a shooting star now and then
      shootNext -= dt;
      if (shootNext <= 0) {
        shootT = 0; shootNext = 22 + Math.random() * 40;
        shootFrom.set(-2.8 - Math.random(), 3.34, -1.8 + Math.random());
        shootTo.set(2.8 + Math.random(), 3.34, 0.4 + Math.random() * 1.2);
      }
    } else {
      shootT = Math.min(1, shootT + dt / 0.75);
      shootStar.position.lerpVectors(shootFrom, shootTo, shootT);
      shootStar.material.opacity = Math.sin(shootT * Math.PI);
      if (shootT >= 1) { shootT = -1; shootStar.material.opacity = 0; }
    }
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
      neonMesh.material.opacity = hum * (0.35 + 0.65 * dim);
      neonLight.intensity = 1.1 * hum * dim;
    }
    // the storm outside — light first, thunder when the distance allows
    nextFlash -= dt;
    if (nextFlash <= 0) {
      flash = 1; nextFlash = phase.fMin + Math.random() * phase.fRnd;
      thunderStrength = 0.25 + Math.random() * 0.75;
      thunderIn = 0.15 + (1 - thunderStrength) * 2.2; // nearer strikes speak sooner
    }
    if (thunderIn > 0) { thunderIn -= dt; if (thunderIn <= 0) rumble(thunderStrength); }
    if (flash > 0.01) {
      flash *= Math.pow(0.02, dt); // fast decay
      moon.intensity = phase.moonI + flash * 2.2;
      var wv = phase.lift + flash * 1.5; // photo is a dark night shot — lift it so the streetlamp reads
      winViewM.color.setRGB(wv, wv, wv * phase.liftB);
      if ((frameCount & 1) === 0) drawRain(flash > 0.25);
    } else if ((frameCount % 6) === 0) drawRain(false);
    // raycast every frame only while the pointer is live; coast otherwise
    if (decorMode) {
      var mc = dragging ? dragging.cfg : decorPickMovable();
      if (mc !== decorHover) {
        decorHover = mc;
        highlightOff(hovered); hovered = null;
        document.body.style.cursor = mc ? (dragging ? "grabbing" : "grab") : "default";
        if (mc) {
          tip.textContent = mc.label + " — drag to move" + (mc.rot ? " · scroll to spin" : "");
          tip.classList.add("show");
        } else tip.classList.remove("show");
      }
      decorTick(t, dt);
    } else {
      var o = (t - pointerMovedAt < 0.35 || (frameCount & 3) === 0) ? pickAt() : hovered;
      if (o !== hovered) {
        highlightOff(hovered);
        hovered = o;
        document.body.style.cursor = o ? "pointer" : "default";
        if (o) {
          tip.textContent = o.userData.hint; tip.classList.add("show");
          highlightOn(o);
        } else tip.classList.remove("show");
      }
      decorTick(t, dt);
    }
    renderer.render(scene, camera);
  }
  // Bake world matrices + paint one frame immediately, so picking works even
  // before the animation loop has run (background tabs throttle rAF).
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  tick();
  window.__room = { scene: scene, camera: camera, renderer: renderer, pick: pick, ray: ray, THREE: THREE, // debug hook (THREE: modules hide the global)
    kid: kid, kidState: kidState, kidStep: kidStep, kidGoto: kidGoto, kidObstacles: KID_OBSTACLES, kidStations: KID_STATIONS,
    kidActions: function () { return kidActions; }, setKidAction: setKidAction, kidMixer: function () { return kidMixer; },
    kidSay: kidSay, kidGreetLine: kidGreetLine, kidFetchLine: kidFetchLine, gameProgress: gameProgress,
    decor: { movables: movables, byKey: movableByKey, set: decorSet, mode: function () { return decorMode; },
      apply: applyMove, reset: decorReset, persist: persistLayout, hub: KID_HUB,
      layout: function () { return loadJSON("room-layout"); } },
    shoe: { defs: COLLECT, byKey: collByKey, state: function () { return shoeState; }, open: sbxOpen, close: sbxClose,
      place: placeColl, unplace: unplaceColl, render: sbxRender,
      newCount: function () { return sbxNew; } },
    paint: { state: function () { return paintState; }, set: setPaint, apply: applyPaint, open: pbOpen, close: pbClose,
      defs: { PAINT: PAINT, NEON_OPTS: NEON_OPTS, LIGHT_PALS: LIGHT_PALS },
      name: roomOwnerName, banner: function () { return nameMesh; } },
    out: { defs: HIDEABLES, state: function () { return outState; }, apply: applyOut, open: obOpen, close: obClose,
      set: function (key, hidden) {
        if (hidden) outState[key] = 1; else delete outState[key];
        saveJSON("room-out", outState); applyOut();
      } } };
})();
