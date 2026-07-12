/* ============================================================================
 * THE ROOM — a 90s bedroom you can click. Every object is a doorway:
 * the bookshelf holds the stories, the toy chest holds the RTS, the CRT and
 * the VHS are the friends' games (coming soon), the notebook knows your
 * progress (all games share this origin, so their saves are readable here).
 * Three.js primitives + canvas textures only — no model files, no build step.
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
  var lookAt = new THREE.Vector3(0, 1.15, 0);
  camera.lookAt(lookAt);

  /* ---- helpers ---------------------------------------------------------- */
  function mat(color, rough) { return new THREE.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.9 : rough }); }
  function box(w, h, d, m) { var g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.castShadow = g.receiveShadow = true; return g; }
  function canvasTex(w, h, draw) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  function labelTex(text, bg, fg, vertical) {
    return canvasTex(256, vertical ? 512 : 128, function (g, w, h) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.font = "bold " + (vertical ? 34 : 40) + "px Georgia, serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      if (vertical) { g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.fillText(text, 0, 0); }
      else g.fillText(text, w / 2, h / 2);
    });
  }
  var texLoader = new THREE.TextureLoader();
  function artTex(url, fallbackColor, apply) {
    texLoader.load(url, function (t) { apply(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })); },
      undefined, function () { apply(mat(fallbackColor)); });
  }

  /* ---- the room shell ---------------------------------------------------- */
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), mat(0x6b5a48)); // 90s beige carpet
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  var rug = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), mat(0x27506b, 0.95));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.8); rug.receiveShadow = true; scene.add(rug);
  var wallM = mat(0x38404f, 0.95);
  var back = box(9, 3.4, 0.1, wallM); back.position.set(0, 1.7, -2.6); scene.add(back);
  var left = box(0.1, 3.4, 7, wallM); left.position.set(-3.6, 1.7, 0); scene.add(left);
  var right = box(0.1, 3.4, 7, wallM); right.position.set(3.6, 1.7, 0); scene.add(right);
  var stripe = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.28), mat(0x8a4d5e, 0.95)); // very 90s wallpaper border
  stripe.position.set(0, 2.35, -2.54); scene.add(stripe);

  /* ---- window with night rain (back wall) -------------------------------- */
  var rainT = canvasTex(256, 320, function (g, w, h) {
    g.fillStyle = "#0d1626"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(180,205,240,0.35)";
    for (var i = 0; i < 46; i++) { var x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14 + Math.random() * 10); g.stroke(); }
    g.fillStyle = "rgba(230,240,255,0.5)"; g.beginPath(); g.arc(w * 0.75, h * 0.2, 16, 0, 7); g.fill();
  });
  var winPane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshBasicMaterial({ map: rainT }));
  winPane.position.set(1.9, 1.85, -2.53); scene.add(winPane);
  var winFrame = box(1.7, 2.1, 0.06, mat(0x2a2019, 0.8)); winFrame.position.set(1.9, 1.85, -2.57); scene.add(winFrame);

  /* ---- lights ------------------------------------------------------------ */
  scene.add(new THREE.AmbientLight(0x28303c, 0.9));
  var moon = new THREE.DirectionalLight(0x7d9cc4, 0.35); moon.position.set(2.2, 3.5, 1.2); scene.add(moon);
  var lampLight = new THREE.PointLight(0xffc27d, 1.35, 8, 1.6); lampLight.position.set(-2.5, 1.75, -1.4); lampLight.castShadow = true; scene.add(lampLight);
  var crtLight = new THREE.PointLight(0x7db4ff, 0.8, 4, 2); crtLight.position.set(-1.6, 0.95, -1.9); scene.add(crtLight);

  var pick = []; // clickable meshes
  function clickable(mesh, name, action, hint) { mesh.userData = { name: name, action: action, hint: hint || "click to open" }; pick.push(mesh); return mesh; }
  function go(url) { return function () { window.location.href = url; }; }
  var BASE = "https://kylefriesmarketing.github.io/";

  /* ---- THE BOOKSHELF: four stories --------------------------------------- */
  var shelf = new THREE.Group();
  var wood = mat(0x4a3524, 0.8);
  var frame = box(1.9, 2.2, 0.45, wood); frame.position.y = 1.1; shelf.add(frame);
  var inner = box(1.7, 2.0, 0.4, mat(0x2c1f14, 0.9)); inner.position.set(0, 1.1, 0.03); shelf.add(inner);
  var shelfBoard = box(1.7, 0.06, 0.4, wood); shelfBoard.position.set(0, 1.1, 0.05); shelf.add(shelfBoard);
  var BOOKS = [
    { t: "SOUTH", c: "#274a63", url: BASE + "south/", tip: "SOUTH — bring all 27 home" },
    { t: "STILL BREATHING", c: "#7a2e18", url: BASE + "still-breathing/", tip: "STILL BREATHING — four true ordeals" },
    { t: "NINE CIRCLES", c: "#5e4a1f", url: BASE + "nine-circles/", tip: "NINE CIRCLES — a descent" },
    { t: "CHOOSE WISELY", c: "#3f2b4f", url: BASE + "choose-wisely/", tip: "CHOOSE WISELY — the shop remembers you" },
  ];
  BOOKS.forEach(function (b, i) {
    var bm = new THREE.MeshStandardMaterial({ map: labelTex(b.t, b.c, "#e8dcc0", true), roughness: 0.7 });
    var book = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.3),
      [mat(0xd8ccb2), mat(0xd8ccb2), mat(0xd8ccb2), mat(0xd8ccb2), bm, mat(0x1c1410)]);
    book.rotation.y = Math.PI / 2; // spine faces the room
    book.castShadow = true;
    var row = i < 2 ? 0 : 1;
    book.position.set(-0.45 + (i % 2) * 0.6, row === 0 ? 1.62 : 0.62, 0.12);
    clickable(book, b.t, go(b.url), b.tip);
    shelf.add(book);
  });
  shelf.position.set(2.7, 0, -1.1); shelf.rotation.y = -0.55; scene.add(shelf);

  /* ---- THE TOY CHEST: Age of Toys ----------------------------------------- */
  var chest = new THREE.Group();
  var chestBody = box(1.3, 0.55, 0.75, mat(0x7a4326, 0.75)); chestBody.position.y = 0.28; chest.add(chestBody);
  var lid = box(1.32, 0.16, 0.77, mat(0x8a5230, 0.75)); lid.position.set(0, 0.62, -0.12); lid.rotation.x = -0.5; chest.add(lid);
  var stencil = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3),
    new THREE.MeshStandardMaterial({ map: labelTex("AGE OF TOYS", "#7a4326", "#f4e6c0"), roughness: 0.8 }));
  stencil.position.set(0, 0.3, 0.39); chest.add(stencil);
  [[0.85, 0.08, 0.5, 0xb54a3c], [1.05, 0.08, 0.28, 0x3c7ab5], [0.72, 0.24, 0.42, 0xc9a23a]].forEach(function (p) {
    var bl = box(0.16, 0.16, 0.16, mat(p[3], 0.7)); bl.position.set(p[0], p[1], p[2]); bl.rotation.y = Math.random(); chest.add(bl);
  });
  chest.children.forEach(function (m) { clickable(m, "AGE OF TOYS", go(BASE + "toybox-tactics/"), "AGE OF TOYS — the toybox RTS"); });
  chest.position.set(-2.1, 0, 0.5); chest.rotation.y = 0.45; scene.add(chest);

  /* ---- THE CRT: Brainrot Inc (coming soon) + VHS: Chameleon 3D ------------ */
  var crt = new THREE.Group();
  var stand = box(1.2, 0.5, 0.7, mat(0x33261b, 0.85)); stand.position.y = 0.25; crt.add(stand);
  var tv = box(0.95, 0.75, 0.8, mat(0x4a4a48, 0.6)); tv.position.y = 0.9; crt.add(tv);
  var staticCanvas = document.createElement("canvas"); staticCanvas.width = 128; staticCanvas.height = 96;
  var staticCtx = staticCanvas.getContext("2d");
  var staticT = new THREE.CanvasTexture(staticCanvas);
  var screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), new THREE.MeshBasicMaterial({ map: staticT }));
  screen.position.set(0, 0.92, 0.41); crt.add(screen);
  clickable(tv, "BRAINROT INC", null, "BRAINROT INC — coming soon to the room");
  clickable(screen, "BRAINROT INC", null, "BRAINROT INC — coming soon to the room");
  var vhs = box(0.42, 0.09, 0.24, new THREE.MeshStandardMaterial({ map: labelTex("CHAMELEON 3D", "#141414", "#7be08a"), roughness: 0.6 }));
  vhs.position.set(0.25, 0.55, 0.15); vhs.rotation.y = 0.3; crt.add(vhs);
  clickable(vhs, "CHAMELEON 3D", null, "CHAMELEON 3D — coming soon to the room");
  crt.position.set(-1.7, 0, -1.9); crt.rotation.y = 0.35; scene.add(crt);

  /* ---- THE DESK, LAMP, NOTEBOOK ------------------------------------------- */
  var desk = new THREE.Group();
  var top = box(1.6, 0.08, 0.8, wood); top.position.y = 0.78; desk.add(top);
  [[-0.72, 0.37], [0.72, 0.37]].forEach(function (p) { var leg = box(0.08, 0.74, 0.7, wood); leg.position.set(p[0], p[1], 0); desk.add(leg); });
  var lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.06, 16), mat(0x24303a, 0.5)); lampBase.position.set(-0.55, 0.85, -0.15); desk.add(lampBase);
  var lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), mat(0x24303a, 0.5)); lampArm.position.set(-0.55, 1.1, -0.15); desk.add(lampArm);
  var shade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffc27d, emissive: 0xff9d45, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
  shade.position.set(-0.55, 1.38, -0.15); desk.add(shade);
  var lampOn = true;
  [lampBase, lampArm, shade].forEach(function (m) {
    clickable(m, "the lamp", function () {
      lampOn = !lampOn;
      lampLight.intensity = lampOn ? 1.35 : 0.12;
      shade.material.emissiveIntensity = lampOn ? 0.9 : 0.05;
    }, "the lamp — click it");
  });
  var noteM = new THREE.MeshStandardMaterial({ map: labelTex("what i finished", "#e8dcc0", "#5a4632"), roughness: 0.95 });
  var note = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3),
    [mat(0xe8dcc0), mat(0xe8dcc0), noteM, mat(0xd8ccb2), mat(0xe8dcc0), mat(0xe8dcc0)]);
  note.position.set(0.3, 0.84, 0.05); note.rotation.y = -0.25; desk.add(note);
  clickable(note, "the notebook", showNotebook, "the notebook — what you have finished");
  desk.position.set(-2.55, 0, -1.35); desk.rotation.y = 0.9; scene.add(desk);

  /* ---- POSTERS (decor that also links) ------------------------------------- */
  function poster(url, art, x, y, tilt, name, tip) {
    var frameP = box(1.06, 1.36, 0.04, mat(0x1c1410, 0.7)); frameP.position.set(x, y, -2.52); frameP.rotation.z = tilt; scene.add(frameP);
    artTex(art, 0x30455e, function (m) {
      var p = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.26), m);
      p.position.set(x, y, -2.49); p.rotation.z = tilt;
      clickable(p, name, go(url), tip); scene.add(p);
    });
  }
  poster(BASE + "choose-wisely/", BASE + "choose-wisely/assets/art/cover_hero.png", -0.4, 1.9, 0.02, "CHOOSE WISELY", "CHOOSE WISELY — the poster peels a little");
  poster(BASE + "still-breathing/", BASE + "still-breathing/assets/og.jpg", 0.75, 1.75, -0.03, "STILL BREATHING", "STILL BREATHING — taped at one corner");

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
    camera.position.x += ((mouse.x * 0.55) - camera.position.x) * 0.04;
    camera.position.y += ((1.7 + mouse.y * 0.25) - camera.position.y) * 0.04;
    camera.lookAt(lookAt);
    if ((frameCount++ & 3) === 0) { // CRT static flicker
      var d = staticCtx.createImageData(128, 96);
      for (var i = 0; i < d.data.length; i += 4) {
        var v = (Math.random() * 255) | 0;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      staticCtx.putImageData(d, 0, 0);
      staticT.needsUpdate = true;
      crtLight.intensity = 0.6 + Math.random() * 0.4;
    }
    var o = pickAt();
    if (o !== hovered) {
      if (hovered && hovered.material && hovered.material.emissive && hovered !== shade && hovered !== screen) hovered.material.emissiveIntensity = 0;
      hovered = o;
      document.body.style.cursor = o ? "pointer" : "default";
      if (o) {
        tip.textContent = o.userData.hint; tip.classList.add("show");
        if (o.material && o.material.emissive !== undefined && o !== shade && o !== screen) {
          o.material.emissive = new THREE.Color(0xffc27d);
          o.material.emissiveIntensity = 0.25;
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
