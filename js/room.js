/* ============================================================================
 * THE ROOM — a 90s bedroom you can click. Every object is a doorway:
 * the bookshelf holds the stories (spines out, like a real shelf), the toy
 * chest holds the RTS, the brain on the desk is Brainrot Inc, the beige PC is
 * Chameleon 3D, the TV is the channel guide (list view), and the notebook
 * knows your progress across every game on this origin.
 * Three.js primitives + generated textures — no model files, no build step.
 * ========================================================================== */
(function () {
  if (!window.THREE) { document.body.classList.add("no3d"); return; }

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
  var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.7, 4.6);
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

  /* ---- the room shell ---------------------------------------------------- */
  var floorM = texMat("assets/tex/carpet.jpg", 0x6b5a48, 0.98, 4, 3);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), floorM);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  var rug = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), mat(0x27506b, 0.95));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0.1, 0.012, 1.0); rug.receiveShadow = true; scene.add(rug);
  var rugRing = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.52, 40), mat(0x8a4d5e, 0.95));
  rugRing.rotation.x = -Math.PI / 2; rugRing.position.set(0.1, 0.012, 1.0); scene.add(rugRing);
  var wallM = mat(0x38404f, 0.95);
  var back = box(9, 3.4, 0.1, wallM); back.position.set(0, 1.7, -2.6); scene.add(back);
  var left = box(0.1, 3.4, 7, wallM); left.position.set(-3.6, 1.7, 0); scene.add(left);
  var right = box(0.1, 3.4, 7, wallM); right.position.set(3.6, 1.7, 0); scene.add(right);
  var stripe = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.28), mat(0x8a4d5e, 0.95)); // 90s wallpaper border
  stripe.position.set(0, 2.6, -2.54); scene.add(stripe);
  var skirt = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.14), mat(0x2a2019, 0.85));
  skirt.position.set(0, 0.07, -2.54); scene.add(skirt);

  /* ---- window with night rain (back wall, right) -------------------------- */
  var rainT = canvasTex(256, 320, function (g, w, h) {
    g.fillStyle = "#0d1626"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(180,205,240,0.35)";
    for (var i = 0; i < 46; i++) { var x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14 + Math.random() * 10); g.stroke(); }
    g.fillStyle = "rgba(230,240,255,0.5)"; g.beginPath(); g.arc(w * 0.72, h * 0.2, 16, 0, 7); g.fill();
  });
  var winPane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.7), new THREE.MeshBasicMaterial({ map: rainT }));
  winPane.position.set(2.35, 1.95, -2.53); scene.add(winPane);
  var winFrame = box(1.6, 1.9, 0.06, mat(0x2a2019, 0.8)); winFrame.position.set(2.35, 1.95, -2.57); scene.add(winFrame);
  var winBar = box(0.05, 1.7, 0.07, mat(0x2a2019, 0.8)); winBar.position.set(2.35, 1.95, -2.55); scene.add(winBar);

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
  ];
  var DECOR = [0x3b4a55, 0x5e3a3a, 0x39543e, 0x584a2e, 0x46485e, 0x2f3e4a, 0x64513a];
  // two rows; playable books stand tall and slightly proud of the row
  [0, 1].forEach(function (row) {
    var y = boardY[row], xCursor = -caseW / 2 + 0.22, d = 0;
    var order = row === 0 ? [null, PLAY[2], null, PLAY[3], null, null]
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

  /* ---- glow stars on the ceiling (pure 90s) --------------------------------- */
  for (var s = 0; s < 14; s++) {
    var st = new THREE.Mesh(new THREE.CircleGeometry(0.03, 6), new THREE.MeshBasicMaterial({ color: 0xb8ffc9 }));
    st.position.set((Math.random() - 0.5) * 6, 3.32, (Math.random() - 0.5) * 4);
    st.rotation.x = Math.PI / 2; scene.add(st);
  }

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

  var frameCount = 0;
  function tick() {
    requestAnimationFrame(tick);
    camera.position.x += ((mouse.x * 0.5) - camera.position.x) * 0.04;
    camera.position.y += ((1.7 + mouse.y * 0.22) - camera.position.y) * 0.04;
    camera.lookAt(lookAt);
    if ((frameCount++ & 3) === 0) { // TV static flicker
      var d = staticCtx.createImageData(128, 96);
      for (var i = 0; i < d.data.length; i += 4) {
        var v = (Math.random() * 255) | 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      staticCtx.putImageData(d, 0, 0);
      staticT.needsUpdate = true;
      crtLight.intensity = 0.5 + Math.random() * 0.35;
    }
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
  window.__room = { scene: scene, camera: camera, pick: pick, ray: ray }; // debug hook
})();
