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
      m.map = t; m.color.set(0xffffff); m.needsUpdate = true;
    });
    return m;
  }
  var woodM = texMat("assets/tex/wood.jpg", 0x8a6a42, 0.75, 1, 1);
  var woodMSide = texMat("assets/tex/wood.jpg", 0x8a6a42, 0.75, 0.35, 1);

  var pick = []; // clickable meshes
  function clickable(mesh, name, action, hint) { mesh.userData = { name: name, action: action, hint: hint || "click to open" }; pick.push(mesh); return mesh; }
  function go(url) { return function () { window.location.href = url; }; }
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
  var rug = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), texMat("assets/tex/rug.jpg", 0x27506b, 0.95, 1, 1));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.1, 0.012, 1.0); rug.receiveShadow = true; scene.add(rug);
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
  var frontM = texMat("assets/tex/chest_front.jpg", 0x7a4326, 0.7, 1, 1);
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
  // the chest knows how the war is going (same-origin campaign save)
  var ttNow = ttCampaign();
  var chestHint = "AGE OF TOYS — the toybox RTS";
  if (ttNow.done >= TT_IDS.length) chestHint = "AGE OF TOYS — all " + TT_IDS.length + " missions won";
  else if (ttNow.started) chestHint = "AGE OF TOYS — " + ttNow.done + " / " + TT_IDS.length + " missions · the war goes on";
  chest.children.forEach(function (m) { clickable(m, "AGE OF TOYS", go(BASE + "toybox-tactics/"), chestHint); });
  [robot, lidG].forEach(function (g) { g.children.forEach(function (m) { clickable(m, "AGE OF TOYS", go(BASE + "toybox-tactics/"), chestHint); }); });
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
  chest.position.set(1.75, 0, 0.15); chest.rotation.y = -0.38; scene.add(chest);

  /* ---- THE RUG WAR: two plastic armies, frozen mid-battle ------------------- */
  // Set up on the galaxy rug the way the Kid left them. Hovering wakes the
  // battle: they waddle in place, muzzles flash. Clicking joins the war.
  var war = new THREE.Group();
  var warHint = ttNow.started
    ? "the rug war — " + ttNow.done + " / " + TT_IDS.length + " missions · take command"
    : "the rug war — AGE OF TOYS, set up and waiting";
  var greenM = new THREE.MeshStandardMaterial({ color: 0x3d6b35, roughness: 0.55 });
  var tanM = new THREE.MeshStandardMaterial({ color: 0xc2a36b, roughness: 0.55 });
  var warFigs = [], warFlashes = [], warPuffs = [];
  // one molded plastic figure: base + everything above it leaning as one piece
  function armyMan(m, pose) {
    var g = new THREE.Group();
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.014, 12), m);
    base.position.y = 0.007; base.castShadow = true; g.add(base);
    var fig = new THREE.Group(); g.add(fig);
    var legs = box(0.034, 0.05, 0.022, m); legs.position.y = 0.039; fig.add(legs);
    var torso = box(0.042, 0.052, 0.028, m); torso.position.y = 0.092; fig.add(torso);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 8), m); head.position.y = 0.132; head.castShadow = true; fig.add(head);
    var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), m);
    helmet.position.y = 0.131; fig.add(helmet);
    var arms = box(0.06, 0.016, 0.016, m); arms.position.set(0.012, 0.105, 0.024); arms.rotation.y = -0.45; fig.add(arms);
    var rifle = box(0.01, 0.012, 0.1, m); rifle.position.set(0.016, 0.11, 0.05); fig.add(rifle);
    if (pose === "kneel") { fig.scale.y = 0.8; fig.rotation.x = 0.1; }
    if (pose === "charge") { fig.rotation.x = 0.3; }
    return { g: g, fig: fig };
  }
  // a crossed pair of additive planes at the rifle tip; blinks while the war is awake
  function muzzle(fig) {
    var fm = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    var f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.022), fm);
    f1.position.set(0.016, 0.11, 0.105); f1.userData.skip = true;
    var f2 = f1.clone(); f2.rotation.z = Math.PI / 2; f2.userData.skip = true;
    fig.add(f1); fig.add(f2);
    warFlashes.push(fm);
  }
  // (x, z, facing jitter, pose, has muzzle flash, knocked over)
  var GREEN_LINE = [
    [-0.20, -0.18, 0.15, "aim", true, false],
    [-0.27, 0.00, -0.1, "kneel", true, false],
    [-0.20, 0.17, 0.25, "charge", false, false],
    [-0.33, 0.09, 0.0, "aim", false, false],
    [-0.09, 0.07, 0.5, "aim", false, true],
  ];
  var TAN_LINE = [
    [0.20, -0.10, -0.2, "aim", true, false],
    [0.28, 0.06, 0.1, "kneel", true, false],
    [0.21, 0.20, -0.3, "charge", false, false],
    [0.34, -0.06, 0.05, "aim", false, false],
    [0.08, -0.15, -0.6, "aim", false, true],
  ];
  function deploy(line, m, facing) {
    line.forEach(function (s) {
      var man = armyMan(m, s[3]);
      man.g.position.set(s[0], 0, s[1]);
      man.g.rotation.y = facing + s[2];
      var baseZ = 0;
      if (s[5]) { baseZ = 1.42; man.g.rotation.z = baseZ; man.g.position.y = 0.012; } // knocked flat, base and all
      else if (s[4]) muzzle(man.fig);
      warFigs.push({ g: man.g, phase: Math.random() * 6.28, baseZ: baseZ, fallen: s[5] });
      war.add(man.g);
    });
  }
  deploy(GREEN_LINE, greenM, Math.PI / 2);
  deploy(TAN_LINE, tanM, -Math.PI / 2);
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
  war.position.set(0.1, 0.013, 1.0); war.rotation.y = 0.32; scene.add(war);
  var warHeat = 0;

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
  [mon, pcScreen, kb, tower].forEach(function (m) { clickable(m, "CHAMELEON 3D", cycleScreen, "CHAMELEON 3D — coming soon · click for the screensaver"); });

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
  });

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
  boom.position.set(-0.95, 0, 1.6); boom.rotation.y = 0.4; scene.add(boom);

  /* ---- the entry: camera dolly in + the tape starts (click unlocked audio) ---- */
  var introT = -1, INTRO = 3.2;
  var noMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.__roomEnter = function () {
    introT = noMotion ? 1 : 0; // reduced motion skips the dolly, keeps the music
    if (!ac) buildAudio();
    audioOn = true; ac.resume(); powerLED.material.color.set(0xff3b30);
    var last = null;
    try { last = localStorage.getItem("room-knock"); } catch (e) { /* private mode */ }
    if (KNOCK_DEBUG || last !== new Date().toDateString()) {
      knockAt = performance.now() / 1000 + (KNOCK_DEBUG || 45 + Math.random() * 105);
    }
  };
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
  var phase = PHASES.evening, phaseHour = -1;
  function applyPhase() {
    var h = roomHour();
    if (h === phaseHour) return;
    phaseHour = h;
    var p = phaseFor(h);
    if (p === phase && amb.intensity === p.ambI) return;
    phase = p;
    amb.color.set(p.amb); amb.intensity = p.ambI;
    moon.color.set(p.moonC); moon.intensity = p.moonI;
    winViewM.color.setRGB(p.lift, p.lift, p.lift * p.liftB);
    if (acNodes && acNodes.rain) acNodes.rain.gain.value = p.rainG;
  }
  applyPhase();
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
  // five more minutes: the bed actually means it. The lights ease down, somebody
  // snores, the robot tiptoes. Click again to get up early — or don't.
  var napUntil = -1, nap = 0, nextSnore = 0;
  bed.children.forEach(function (m) {
    clickable(m, "the bed", function () {
      var now = performance.now() / 1000;
      if (napUntil > now) { napUntil = -1; clickSfx(1500); } // okay, okay — up
      else { napUntil = now + 12; nextSnore = now + 1.8; clickSfx(800); }
    }, "the bed — five more minutes");
  });

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
  var robotWrap = null, robotAng = 0; // he patrols the rug, forever
  var robotDir = 1, robotBoost = 0, keyG = null, keyFast = 0;
  function windRobot() { // a turn of the key: a burst of speed, and he changes his mind
    robotBoost = Math.min(robotBoost + 1.2, 3);
    robotDir *= -1;
    keyFast = 0.7;
    ratchetSfx();
  }
  prop("assets/props/robot.glb", 0.42, 0.1 + Math.sin(0) * 0.9, 0, 1.0 + Math.cos(0) * 0.9, Math.PI / 2, function (wrap) {
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

  /* ---- coming-soon posters, not hung yet (leaning under the window) ----------- */
  function leaningPoster(tex, x, z, rotY, name, hint) {
    var g = new THREE.Group();
    var backing = box(0.56, 0.82, 0.02, mat(0xe8e2d4, 0.9)); backing.position.y = 0.41; g.add(backing);
    var m = new THREE.MeshStandardMaterial({ color: 0x333944, roughness: 0.85 });
    texLoader.load(tex, function (t) { t.anisotropy = 8; m.map = t; m.color.set(0xffffff); m.needsUpdate = true; });
    var art = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.78), m);
    art.position.set(0, 0.41, 0.012); g.add(art);
    g.position.set(x, 0, z); g.rotation.y = rotY;
    g.rotateOnAxis(new THREE.Vector3(1, 0, 0), -0.1); // leans back on the wall
    scene.add(g);
    [backing, art].forEach(function (mm) { clickable(mm, name, null, hint); });
  }
  leaningPoster("assets/tex/poster_brainrot.jpg", 1.25, -2.42, 0.12, "BRAINROT INC", "BRAINROT INC — coming to the room"); // left of the window; the TV hides the right corner
  leaningPoster("assets/tex/poster_c3d.jpg", 2.86, -2.38, -0.1, "CHAMELEON 3D", "CHAMELEON 3D — coming to the room");

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

  /* ---- keyboard: Tab walks the room, Enter opens, Esc puts things back -------- */
  var kbTargets = null, kbCount = 0, kbIndex = -1, kbFocus = null;
  function kbList() { // one entry per named thing; prefer the mesh that does something
    if (kbTargets && kbCount === pick.length) return kbTargets;
    var seen = {};
    kbTargets = []; kbCount = pick.length;
    pick.forEach(function (m) {
      var n = m.userData.name;
      if (seen[n] === undefined) { seen[n] = kbTargets.length; kbTargets.push(m); }
      else if (!kbTargets[seen[n]].userData.action && m.userData.action) kbTargets[seen[n]] = m;
    });
    return kbTargets;
  }
  var kbV = new THREE.Vector3();
  function kbShow(m) {
    kbFocus = m;
    m.getWorldPosition(kbV); kbV.project(camera);
    tip.style.left = ((kbV.x * 0.5 + 0.5) * window.innerWidth) + "px";
    tip.style.top = ((-kbV.y * 0.5 + 0.5) * window.innerHeight - 14) + "px";
    tip.textContent = m.userData.hint; tip.classList.add("show");
  }
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.getElementById("notebook").classList.remove("open");
      document.body.classList.remove("listing");
      return;
    }
    if (document.body.classList.contains("listing")) return; // the list has native tab order
    if (e.key === "Tab") {
      e.preventDefault();
      var L = kbList();
      if (!L.length) return;
      kbIndex = (kbIndex + (e.shiftKey ? -1 : 1) + L.length) % L.length;
      kbShow(L[kbIndex]);
    } else if ((e.key === "Enter" || e.key === " ") && kbFocus) {
      var ec = document.getElementById("enter");
      if ((!ec || ec.classList.contains("gone")) && kbFocus.userData.action) kbFocus.userData.action();
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
    // with no pointer to follow (phones, or just resting), take a slow look around
    var idle = t - pointerMovedAt > 6;
    var mx = idle ? Math.sin(t * 0.07) * 0.4 : mouse.x;
    var my = idle ? Math.sin(t * 0.05 + 2) * 0.18 : mouse.y;
    var baseX = mx * 0.55, baseY = 1.72 + my * 0.24;
    if (introT >= 0 && introT < 1) { // the dolly in from the doorway
      introT = Math.min(1, introT + dt / INTRO);
      var ke = 1 - Math.pow(1 - introT, 3);
      camera.position.set(baseX * ke, 2.6 + (baseY - 2.6) * ke, 7.4 + (4.9 - 7.4) * ke);
    } else {
      camera.position.x += (baseX - camera.position.x) * 0.04;
      camera.position.y += (baseY - camera.position.y) * 0.04;
    }
    lookAt.x += ((mx * 1.25) - lookAt.x) * 0.04; // pan the gaze — the bed and side walls come into view
    camera.lookAt(lookAt);
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
      screen.material.map = tvCartoon ? (phase.test ? testT : cartoonT) : staticT;
      screen.material.needsUpdate = true;
      crtLight.color.set(tvCartoon ? (phase.test ? 0xc8c8e0 : 0xffd9a0) : 0x7db4ff);
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
    if (robotWrap) { // wind-up tin robot: circles the rug with a little waddle-rock
      robotBoost *= Math.pow(0.5, dt / 2.5); // the spring unwinds
      if (robotBoost < 0.02) robotBoost = 0;
      robotAng += dt * 0.32 * robotDir * (1 + robotBoost) * (1 - 0.72 * nap); // he tiptoes past the bed
      robotWrap.position.set(0.1 + Math.sin(robotAng) * 0.9, 0, 1.0 + Math.cos(robotAng) * 0.9);
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
    for (var bu = 0; bu < bulbs.length; bu++) bulbs[bu].material.opacity = (0.55 + 0.4 * Math.sin(t * twinkleRate + bulbs[bu].userData.phase)) * (0.35 + 0.65 * dim);
    for (var si = 0; si < stars.length; si++) stars[si].material.opacity = phase.stars + 0.35 * Math.sin(t * 0.5 + stars[si].userData.phase);
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
    var o = (t - pointerMovedAt < 0.35 || (frameCount & 3) === 0) ? pickAt() : hovered;
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
  window.__room = { scene: scene, camera: camera, renderer: renderer, pick: pick, ray: ray, THREE: THREE }; // debug hook (THREE: modules hide the global)
})();
