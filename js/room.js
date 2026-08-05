/* ============================================================================
 * THE ROOM — a 90s bedroom you can click. Every object is a doorway:
 * the bookshelf holds the stories (spines out, like a real shelf), the toy
 * chest holds the RTS, the brain on the desk opens Dumb Tony's BRAINROT
 * (live in the shared GameRepos), the beige PC is waiting on its next game,
 * the TV is the channel guide (list view), and the notebook knows your
 * progress across every game on this origin.
 * Three.js primitives + generated textures + a few generated GLB hero props.
 * ES module: three + loaders resolve via the importmap in index.html.
 * ========================================================================== */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { mat, box, canvasTex, loadJSON, saveJSON, readSave, countOf, esc, hex6 } from "./util.js";
import { STICKER_DESIGNS } from "./stickers.js";
import * as COLL from "./collectibles.js";
import * as PROFILE from "./profile.js";
import * as AUDIO from "./audio.js";
import { createPost } from "./post.js";
// the sound effects are called from all over the room; keep the short names
var clickSfx = AUDIO.clickSfx, rumble = AUDIO.rumble, ratchetSfx = AUDIO.ratchetSfx,
    snoreSfx = AUDIO.snoreSfx, knockSfx = AUDIO.knockSfx;

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
  // Film response instead of a straight clamp: the lamp and the neon roll off into
  // colour instead of clipping to flat white, and the darks keep their detail.
  // (AgX was tried and greys out the neon — this room wants the punchier curve.)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  document.getElementById("room").appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c12);
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.72, 4.9);
  var lookAt = new THREE.Vector3(0, 1.2, -0.4);
  camera.lookAt(lookAt);

  /* ---- the lens: real bloom instead of faked halos --------------------------- */
  var post = createPost(renderer, scene, camera);
  try { // phones get it too, but it's the first thing to turn off if a room feels heavy
    var _pw = localStorage.getItem("room-glow");
    if (_pw === "0") post.enabled = false;
  } catch (e) { }
  function drawFrame() {
    if (post.available && post.enabled) post.render();
    else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
  }
  function setGlow(on) {
    if (!post.available) return;
    post.enabled = !!on;
    try { localStorage.setItem("room-glow", on ? "1" : "0"); } catch (e) { }
    drawFrame();
  }

  /* ---- helpers ---------------------------------------------------------- */
  var texLoader = new THREE.TextureLoader();
  // Generated texture with graceful color fallback; applies repeat wrapping.
  function texMat(url, fallbackColor, rough, repX, repY) {
    var m = mat(fallbackColor, rough);
    texLoader.load(url, function (t) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repX || 1, repY || 1);
      t.anisotropy = 8;
      m.userData.baseMap = t; // "as found" restores this (the material swap system)
      if (m.userData.customMap) return; // a swapped wallpaper got here first — don't clobber it
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
  // A "look here" ping: a warm pulse that hangs over a spot for a few seconds. Used when
  // a treasure is placed from the drawer — half the room is off-camera at that moment.
  var pings = [];
  function pingAt(x, y, z) {
    var sp = glow(0xffd9a0, x, y + 0.12, z, 0.01, 0.01, 0.9);
    scene.add(sp);
    pings.push({ sp: sp, t: 0 });
  }

  // Contact shadows: the soft dark pool a thing sits in. One real shadow-casting lamp
  // can't ground everything in the room, and without this every toy looks like it's
  // hovering a centimetre off the carpet. Cheap, and it rides along as furniture moves.
  var contactTex = canvasTex(128, 128, function (g, w, h) {
    var rad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    // weighted toward the core: a tight dark contact that falls off fast reads as
    // "sitting on the floor", where an even spread just looks like a grey smudge
    rad.addColorStop(0, "rgba(0,0,0,0.80)");
    rad.addColorStop(0.32, "rgba(0,0,0,0.46)");
    rad.addColorStop(0.62, "rgba(0,0,0,0.16)");
    rad.addColorStop(0.85, "rgba(0,0,0,0.04)");
    rad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rad; g.fillRect(0, 0, w, h);
  });
  function contactShadow(parent, rx, rz, op, y) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, (rz || rx) * 2),
      new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false,
        opacity: op == null ? 0.85 : op }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y == null ? 0.022 : y;   // above the floor (0) and the rug (0.012)
    m.renderOrder = -1;
    m.userData.skip = true;                  // never a clickable in its own right
    parent.add(m);
    return m;
  }
  // the kid gets one too, but scene-level: it stays on the carpet and fades out as he
  // climbs onto the bed, instead of riding up with him
  var kidShadow = contactShadow(scene, 0.2, 0.2, 0.5);

  var pick = []; // clickable meshes
  function clickable(mesh, name, action, hint) { mesh.userData = { name: name, action: action, hint: hint || "click to open" }; pick.push(mesh); return mesh; }
  function go(url) { var f = function () { markVisited(url); window.location.href = url; }; f.__nav = url; return f; } // __nav marks doorway actions — THE KID walks to those
  var BASE = "https://kylefriesmarketing.github.io/";
  // Declared up here because BOTH the duffel bag and its wall poster read it, and the
  // poster is built earlier in the file. Empty string ⇒ both revert to "coming soon".
  var HOOD_RUN_URL = BASE + "hood-run/"; // live 2026-07-22

  /* ---- reading the sibling games' saves (same origin) ------------------------ */
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
  // The room ships ~10MB of GLBs. Fetching them all at once means the browser
  // splits the pipe twenty ways and NOTHING shows up for ages — the kid arrives
  // no sooner than the skateboard. So: a small priority queue. Low number = sooner.
  var GLB_PRIO = {
    "kid.glb": 0, "kid_idle.glb": 1, "kid_walk.glb": 1,                 // the star of the room
    "bed.glb": 1, "robot.glb": 1, "brain.glb": 2, "chair.glb": 2,       // big/animated things you notice
    "bean.glb": 3, "island.glb": 3, "trex.glb": 3, "globe.glb": 3,
    "skate.glb": 4,                                                     // 1.4MB for a prop against a wall
  };
  var loadQ = [], loadActive = 0, LOAD_MAX = 4;
  function prioFor(url) {
    var f = url.split("/").pop();
    if (GLB_PRIO[f] != null) return GLB_PRIO[f];
    if (f.indexOf("kid_") === 0) return 2;   // his other animation clips: small, and he needs them
    if (f.indexOf("army_") === 0) return 5;  // toy soldiers, thumb-sized on the rug
    return 3;
  }
  var pumpScheduled = false;
  function queueGLB(url, cb) {
    loadQ.push({ url: url, prio: prioFor(url), cb: cb });
    // Everything registers synchronously as this module runs, so hold the first
    // pump until that pass is done — otherwise whatever was declared earliest wins
    // regardless of priority, which is exactly what we're trying to avoid.
    if (!pumpScheduled) { pumpScheduled = true; setTimeout(function () { pumpScheduled = false; pumpGLB(); }, 0); }
  }
  function pumpGLB() {
    while (loadActive < LOAD_MAX && loadQ.length) {
      loadQ.sort(function (a, b) { return a.prio - b.prio; });
      var job = loadQ.shift();
      loadActive++;
      gltfL.load(job.url, (function (j) {
        return function (g) { loadActive--; try { j.cb(g); } finally { pumpGLB(); } };
      })(job), undefined, function () { loadActive--; pumpGLB(); }); // a missing prop must never stall the queue
    }
  }
  // Generated props ease in instead of popping when their GLB finishes loading.
  var fadeIns = [];
  function fadeInObject(root) {
    var mats = [];
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        if (m && !m.__fading) {
          m.__fading = true; m.__wasTransparent = m.transparent;
          m.__designOp = m.opacity; // glass stays glass — never fade UP past the designed opacity
          m.transparent = true; m.opacity = 0; mats.push(m);
        }
      });
    });
    if (!mats.length) return;
    var entry = { mats: mats, t: 0 };
    fadeIns.push(entry);
    setTimeout(function () { // safety: never leave a prop invisible if the tab was backgrounded (rAF paused)
      if (entry.t >= 1) return;
      entry.t = 1;
      for (var i = 0; i < mats.length; i++) {
        mats[i].opacity = mats[i].__designOp != null ? mats[i].__designOp : 1;
        mats[i].transparent = mats[i].__wasTransparent; mats[i].__fading = false;
      }
      var ix = fadeIns.indexOf(entry); if (ix >= 0) fadeIns.splice(ix, 1);
    }, 1600);
  }
  // Load a GLB, scale it to height h, sit its base at local y=0, place at (x,y,z).
  function prop(url, h, x, y, z, rotY, onReady) {
    queueGLB(url, function (g) {
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
      var mx = null;
      if (g.animations && g.animations.length) {
        mx = new THREE.AnimationMixer(root);
        mx.clipAction(g.animations[0]).play(); // first clip is the idle, by convention
        mixers.push(mx);
      }
      if (onReady) onReady(wrap, root, mx, g.animations || []); // mixer + clips: props with a second clip drive it themselves
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
  /* The view is PAINTED now (the old photo read as a flat photograph inside a
   * storybook room) and it has real depth: three canvas layers — sky, scenery,
   * foreground — each drawn 1.5 windows wide; tick() scrolls their texture offsets
   * against the camera sway, so the world outside parallaxes. What's out there is
   * a paint-box choice (WINDOW_VIEWS, further down) and every layer repaints for
   * the room's hour. */
  var WIN_OVER = 1.5, WIN_OFF0 = (1 - 1 / WIN_OVER) / 2;         // horizontal overscan for parallax
  var WIN_OVERY = 1.12, WIN_OFFY = (1 - 1 / WIN_OVERY) / 2;      // a little vertical headroom too
  var winLayerT = [], winLayerM = [];
  for (var wl = 0; wl < 3; wl++) (function (wl) {
    var t = canvasTex(768, 512, function (g, w, h) { g.clearRect(0, 0, w, h); });
    t.repeat.set(1 / WIN_OVER, 1 / WIN_OVERY); t.offset.set(WIN_OFF0, WIN_OFFY); t.anisotropy = 8;
    var m = new THREE.MeshBasicMaterial({ map: t, transparent: wl > 0, depthWrite: wl === 0 });
    var p = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 1.74), m);
    p.position.set(2.35, 1.95, -2.538 + wl * 0.005); // far behind, near almost at the glass
    scene.add(p);
    winLayerT.push(t); winLayerM.push(m);
  })(wl);
  // a fourth layer for TRANSIENT LIFE — cars, gulls, owls, shooting stars. Cleared when
  // idle; only re-uploaded while something is actually crossing the view.
  var winEvT = canvasTex(768, 512, function (g, w, h) { g.clearRect(0, 0, w, h); });
  winEvT.repeat.set(1 / WIN_OVER, 1 / WIN_OVERY); winEvT.offset.set(WIN_OFF0, WIN_OFFY); winEvT.anisotropy = 8;
  var winEvM = new THREE.MeshBasicMaterial({ map: winEvT, transparent: true, depthWrite: false });
  var winEvP = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 1.74), winEvM);
  winEvP.position.set(2.35, 1.95, -2.5245); // in front of the near layer, behind the glass
  scene.add(winEvP);
  function winLift(r, g2, b) {
    for (var i = 0; i < 3; i++) winLayerM[i].color.setRGB(r, g2, b);
    winEvM.color.setRGB(r, g2, b);
  }
  winLift(1, 1, 1);
  var rainT = canvasTex(256, 320, function (g) { g.clearRect(0, 0, 256, 320); });
  var winPane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.7),
    new THREE.MeshBasicMaterial({ map: rainT, transparent: true, depthWrite: false }));
  winPane.position.set(2.35, 1.95, -2.515); scene.add(winPane);
  clickable(winPane, "the window", null, "the window — still raining out there");

  /* ---- WINDOW VIEWS: what's out there is up to you ------------------------------
   * Five painted worlds, three layers each (far / mid / near), storybook-flat like
   * everything else in the room. Painters are deterministic (seeded scatter) so a
   * repaint never shimmers. Layer fns get (ctx, w, h, phaseName). */
  var WIN_SKY = { // per phase: [skyTop, skyBottom, starAlpha, moon?, groundTone]
    day:     ["#7d9cc0", "#b8ccd8", 0,    0, "#55645c"],
    dusk:    ["#464070", "#e8935a", 0.25, 0, "#3c3844"],
    evening: ["#232c46", "#54648e", 0.6,  1, "#262b38"],
    night:   ["#10162a", "#28324e", 1,    1, "#151a26"],
  };
  function _wr(seed) { var s = seed || 7; return function () { s = (s * 16807 + 11) % 2147483647; return (s & 0xffff) / 0x10000; }; }
  function _sky(g, w, h, ph, horizon) {
    var s = WIN_SKY[ph] || WIN_SKY.evening;
    var gr = g.createLinearGradient(0, 0, 0, h * (horizon == null ? 1 : horizon));
    gr.addColorStop(0, s[0]); gr.addColorStop(1, s[1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (s[2] > 0) {
      var r = _wr(7); g.fillStyle = "rgba(240,242,255," + 0.85 * s[2] + ")";
      for (var i = 0; i < 70; i++) { var sx = r() * w, sy = r() * h * 0.55, big = r() < 0.18 ? 2 : 1; g.fillRect(sx, sy, big, big); }
    }
    return s;
  }
  function _moon(g, x, y, rad) {
    var halo = g.createRadialGradient(x, y, rad * 0.6, x, y, rad * 3.2);
    halo.addColorStop(0, "rgba(240,236,214,0.35)"); halo.addColorStop(1, "rgba(240,236,214,0)");
    g.fillStyle = halo; g.beginPath(); g.arc(x, y, rad * 3.2, 0, 7); g.fill();
    g.fillStyle = "#f0ecd6"; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    g.fillStyle = "rgba(200,196,180,0.5)";
    g.beginPath(); g.arc(x - rad * 0.3, y - rad * 0.2, rad * 0.18, 0, 7); g.fill();
    g.beginPath(); g.arc(x + rad * 0.25, y + rad * 0.3, rad * 0.12, 0, 7); g.fill();
  }
  function _winGrid(g, x, y, w, h, cols, rows, litP, seed) { // lit windows on a dark tower
    var r = _wr(seed), cw = w / cols, ch = h / rows;
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      g.fillStyle = r() < litP ? "rgba(255,214,138,0.9)" : "rgba(70,80,100,0.4)";
      g.fillRect(x + i * cw + 1, y + j * ch + 1, Math.max(1, cw - 2), Math.max(1, ch - 2));
    }
  }
  function _house(g, x, base, w, h, lit) {
    g.fillStyle = "#232733"; g.fillRect(x, base - h, w, h);
    g.beginPath(); g.moveTo(x - w * 0.08, base - h); g.lineTo(x + w / 2, base - h - w * 0.34); g.lineTo(x + w * 1.08, base - h); g.fill();
    g.fillStyle = lit ? "rgba(255,214,138,0.95)" : "rgba(60,72,90,0.6)";
    g.fillRect(x + w * 0.14, base - h * 0.72, w * 0.22, h * 0.3);
    g.fillRect(x + w * 0.6, base - h * 0.72, w * 0.22, h * 0.3);
  }
  function _pine(g, x, base, w, h) {
    g.beginPath(); g.moveTo(x, base);
    g.lineTo(x + w * 0.5, base - h); g.lineTo(x + w, base); g.fill();
    g.beginPath(); g.moveTo(x + w * 0.12, base - h * 0.45);
    g.lineTo(x + w * 0.5, base - h * 1.12); g.lineTo(x + w * 0.88, base - h * 0.45); g.fill();
  }
  var WINDOW_VIEWS = {
    street: { label: "the street", icon: "🌧️", rain: true, hint: "still raining out there", layers: [
      function (g, w, h, ph) { // far: sky, moon, a HAZY distant roofline (unmistakably far away)
        var s = _sky(g, w, h, ph, 0.8);
        if (s[3]) _moon(g, w * 0.68, h * 0.16, 18);
        g.globalAlpha = ph === "day" ? 0.35 : 0.5; // atmosphere: the block behind fades into the sky
        g.fillStyle = ph === "day" ? "#8095ae" : "#232c40";
        var r = _wr(31), x = -10;
        g.beginPath(); g.moveTo(x, h * 0.78);
        while (x < w + 20) { // one continuous silhouette, gable after gable — never loose boxes
          var rw = 60 + r() * 60, rh = 22 + r() * 26;
          g.lineTo(x, h * 0.78 - rh); g.lineTo(x + rw * 0.5, h * 0.78 - rh - 14); g.lineTo(x + rw, h * 0.78 - rh);
          x += rw;
        }
        g.lineTo(x, h * 0.78); g.closePath(); g.fill();
        g.globalAlpha = 1;
        g.fillStyle = s[4]; g.fillRect(0, h * 0.78, w, h); // the wet street
        if (ph !== "day") { g.fillStyle = "rgba(255,214,138,0.12)"; g.fillRect(0, h * 0.78, w, 3); }
      },
      function (g, w, h, ph) { // mid: a REAL fence line, two houses on it, tree, streetlamp
        var lit = ph !== "day", base = h * 0.84;
        // the picket fence runs the whole street, rails first so every picket connects
        g.fillStyle = "#2a2f3c";
        g.fillRect(0, base - 40, w, 5); g.fillRect(0, base - 18, w, 5);
        for (var px2 = 4; px2 < w; px2 += 16) {
          g.fillRect(px2, base - 48, 7, 48);
          g.beginPath(); g.moveTo(px2, base - 48); g.lineTo(px2 + 3.5, base - 55); g.lineTo(px2 + 7, base - 48); g.fill();
        }
        _house(g, w * 0.16, base, 120, 100, lit);
        _house(g, w * 0.62, base, 140, 116, lit && ph !== "dusk");
        g.strokeStyle = "#1a1f2b"; g.lineWidth = 7; // the tree
        g.beginPath(); g.moveTo(w * 0.47, base); g.quadraticCurveTo(w * 0.46, base - 90, w * 0.44, base - 130); g.stroke();
        g.lineWidth = 3;
        [[-30, -160], [18, -172], [40, -140]].forEach(function (b) {
          g.beginPath(); g.moveTo(w * 0.45, base - 110); g.quadraticCurveTo(w * 0.45 + b[0] * 0.6, base + b[1] * 0.8, w * 0.45 + b[0], base + b[1]); g.stroke();
        });
        // streetlamp — the room's shaft light is THIS lamp
        g.fillStyle = "#161a24"; g.fillRect(w * 0.86, base - 150, 5, 150);
        g.fillRect(w * 0.855, base - 156, 16, 8);
        if (lit) {
          var lg = g.createRadialGradient(w * 0.865, base - 150, 2, w * 0.865, base - 150, 60);
          lg.addColorStop(0, "rgba(255,214,138,0.55)"); lg.addColorStop(1, "rgba(255,214,138,0)");
          g.fillStyle = lg; g.beginPath(); g.arc(w * 0.865, base - 150, 60, 0, 7); g.fill();
          g.fillStyle = "rgba(255,214,138,0.10)";
          g.beginPath(); g.ellipse(w * 0.865, base + 6, 54, 10, 0, 0, 7); g.fill();
        }
      },
      function (g, w, h, ph) { // near: the hedge, the mailbox, a puddle
        var base = h * 0.95; // sits inside the parallax crop — content past ~0.95h never shows
        g.fillStyle = "#101521";
        for (var x = -20; x < w + 20; x += 34) { g.beginPath(); g.arc(x, base + 4, 34, Math.PI, 0); g.fill(); }
        g.fillRect(0, base - 2, w, h - base + 2);
        g.fillStyle = "#151a26"; g.fillRect(w * 0.31, base - 74, 5, 48); // mailbox
        g.fillRect(w * 0.29, base - 86, 20, 13);
        if (ph !== "day") { g.strokeStyle = "rgba(200,220,250,0.25)"; g.lineWidth = 2;
          g.beginPath(); g.ellipse(w * 0.55, base - 16, 26, 4, 0, 0, 7); g.stroke(); }
      },
    ] },
    city: { label: "the city", icon: "🌃", rain: false, hint: "the city never blinks", layers: [
      function (g, w, h, ph) { // far: haze towers
        var s = _sky(g, w, h, ph, 0.85);
        if (s[3]) _moon(g, w * 0.2, h * 0.14, 14);
        var r = _wr(53), x = 0;
        g.fillStyle = ph === "day" ? "#6a7a92" : "#1d2436";
        while (x < w) { var tw = 34 + r() * 44, th = h * (0.22 + r() * 0.3); g.fillRect(x, h * 0.85 - th, tw, th); x += tw + 6; }
        g.fillStyle = s[4]; g.fillRect(0, h * 0.85, w, h);
      },
      function (g, w, h, ph) { // mid: the near skyline, lit up
        var r = _wr(97), litP = ph === "day" ? 0.10 : ph === "dusk" ? 0.5 : 0.8;
        var xs = [0.03, 0.2, 0.4, 0.58, 0.78], tallest = 0, tx = 0;
        xs.forEach(function (fx, i) {
          var tw = 70 + r() * 50, th = h * (0.34 + r() * 0.34), x = fx * w;
          g.fillStyle = "#121826"; g.fillRect(x, h * 0.9 - th, tw, th);
          _winGrid(g, x + 6, h * 0.9 - th + 8, tw - 12, th - 16, 5, Math.max(4, (th / 26) | 0), litP, 100 + i);
          if (th > tallest) { tallest = th; tx = x + tw / 2; }
        });
        g.strokeStyle = "#0d1320"; g.lineWidth = 3; // antenna + beacon on the tallest
        g.beginPath(); g.moveTo(tx, h * 0.9 - tallest); g.lineTo(tx, h * 0.9 - tallest - 26); g.stroke();
        g.fillStyle = "rgba(255,70,70,0.9)"; g.beginPath(); g.arc(tx, h * 0.9 - tallest - 28, 3.4, 0, 7); g.fill();
        if (ph !== "day") { // one neon smudge low in the streets
          var ng = g.createRadialGradient(w * 0.52, h * 0.86, 4, w * 0.52, h * 0.86, 70);
          ng.addColorStop(0, "rgba(255,90,168,0.4)"); ng.addColorStop(1, "rgba(255,90,168,0)");
          g.fillStyle = ng; g.beginPath(); g.arc(w * 0.52, h * 0.86, 70, 0, 7); g.fill();
        }
      },
      function (g, w, h) { // near: our own rooftop
        g.fillStyle = "#0b0f1a"; g.fillRect(0, h * 0.87, w, h * 0.13);
        g.fillRect(0, h * 0.85, w, 6);
        g.fillRect(w * 0.1, h * 0.82, 26, 14); g.fillRect(w * 0.7, h * 0.81, 34, 16); // vents
        g.fillRect(w * 0.315, h * 0.68, 4, 34); g.fillRect(w * 0.365, h * 0.68, 4, 34); // water tower
        g.fillRect(w * 0.3, h * 0.56, 48, 34);
        g.beginPath(); g.moveTo(w * 0.295, h * 0.56); g.lineTo(w * 0.324, h * 0.5); g.lineTo(w * 0.352, h * 0.56); g.fill();
      },
    ] },
    woods: { label: "the pines", icon: "🌲", rain: false, hint: "the pines are patient", layers: [
      function (g, w, h, ph) { // far: the ridge and a big moon
        var s = _sky(g, w, h, ph, 0.8);
        if (s[3]) _moon(g, w * 0.3, h * 0.2, 30); else if (ph === "dusk") _moon(g, w * 0.3, h * 0.22, 22);
        g.fillStyle = ph === "day" ? "#5e7086" : "#1a2230";
        g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w * 0.22, h * 0.44); g.lineTo(w * 0.4, h * 0.58);
        g.lineTo(w * 0.62, h * 0.4); g.lineTo(w * 0.8, h * 0.54); g.lineTo(w, h * 0.48); g.lineTo(w, h); g.lineTo(0, h); g.fill();
        g.fillStyle = s[4]; g.fillRect(0, h * 0.8, w, h);
      },
      function (g, w, h, ph) { // mid: two ranks of pines, mist in the day
        var r = _wr(41);
        g.fillStyle = "#1c2836";
        for (var x = -20; x < w + 20; x += 44) _pine(g, x, h * 0.72, 52, 78 + r() * 30);
        if (ph === "day" || ph === "dusk") { g.fillStyle = "rgba(200,212,220,0.16)"; g.fillRect(0, h * 0.6, w, h * 0.1); }
        g.fillStyle = "#141d29";
        for (var x2 = -30; x2 < w + 30; x2 += 58) _pine(g, x2, h * 0.86, 68, 100 + r() * 36);
      },
      function (g, w, h, ph) { // near: boughs in the corners, fireflies after dark
        g.fillStyle = "#0e1420"; g.fillRect(0, h * 0.88, w, h * 0.12);
        g.fillStyle = "#0d1420";
        [[0, 0, 1], [w, 0, -1]].forEach(function (c) {
          for (var i = 0; i < 4; i++) {
            g.beginPath(); g.ellipse(c[0] + c[2] * (20 + i * 34), 20 + i * 26, 56, 16, c[2] * (0.5 - i * 0.12), 0, 7); g.fill();
          }
        });
        if (ph === "evening" || ph === "night") {
          var r = _wr(61); g.fillStyle = "rgba(255,224,130,0.85)";
          for (var i2 = 0; i2 < 9; i2++) { g.beginPath(); g.arc(r() * w, h * (0.45 + r() * 0.4), 1.6, 0, 7); g.fill(); }
        }
      },
    ] },
    sea: { label: "the sea", icon: "🌊", rain: false, hint: "the tide is thinking", layers: [
      function (g, w, h, ph) { // far: horizon, moon glint on the water
        var s = _sky(g, w, h, ph, 0.55);
        var sg = g.createLinearGradient(0, h * 0.55, 0, h);
        sg.addColorStop(0, ph === "day" ? "#4a7a96" : "#17293e"); sg.addColorStop(1, ph === "day" ? "#356078" : "#0d1a2c");
        g.fillStyle = sg; g.fillRect(0, h * 0.55, w, h * 0.45);
        if (s[3]) {
          _moon(g, w * 0.62, h * 0.18, 20);
          g.fillStyle = "rgba(240,236,214,0.18)";
          var r = _wr(19);
          for (var y = h * 0.57; y < h * 0.95; y += 7) { var gw = 8 + r() * 30; g.fillRect(w * 0.62 - gw / 2 + (r() - 0.5) * 14, y, gw, 2); }
        }
      },
      function (g, w, h, ph) { // mid: wave lines and a little sail
        g.strokeStyle = ph === "day" ? "rgba(220,236,240,0.5)" : "rgba(140,180,210,0.35)"; g.lineWidth = 2.5;
        [0.62, 0.72, 0.83].forEach(function (fy, i) {
          g.beginPath();
          for (var x = -20; x < w + 20; x += 46) g.quadraticCurveTo(x + 12, h * fy - 7, x + 23, h * fy), g.quadraticCurveTo(x + 34, h * fy + 7, x + 46, h * fy);
          g.stroke();
        });
        g.fillStyle = "#101724"; // the sail out there
        g.fillRect(w * 0.285, h * 0.585, 3, 26);
        g.beginPath(); g.moveTo(w * 0.29, h * 0.585); g.lineTo(w * 0.29, h * 0.63); g.lineTo(w * 0.33, h * 0.625); g.fill();
        g.beginPath(); g.moveTo(w * 0.27, h * 0.635); g.lineTo(w * 0.34, h * 0.635); g.lineTo(w * 0.325, h * 0.65); g.lineTo(w * 0.283, h * 0.65); g.fill();
      },
      function (g, w, h, ph) { // near: the dunes, grass, a gull or two
        g.fillStyle = "#231f19"; g.beginPath();
        g.moveTo(0, h); g.lineTo(0, h * 0.9); g.quadraticCurveTo(w * 0.3, h * 0.84, w * 0.55, h * 0.92);
        g.quadraticCurveTo(w * 0.8, h * 0.98, w, h * 0.93); g.lineTo(w, h); g.fill();
        g.strokeStyle = "#1a1712"; g.lineWidth = 2;
        var r = _wr(23);
        for (var i = 0; i < 22; i++) {
          var gx = r() * w, gy = h * (0.88 + r() * 0.07);
          g.beginPath(); g.moveTo(gx, gy); g.quadraticCurveTo(gx + (r() - 0.5) * 10, gy - 16, gx + (r() - 0.5) * 22, gy - 26); g.stroke();
        }
        if (ph === "day" || ph === "dusk") {
          g.strokeStyle = "#20242e"; g.lineWidth = 2.5;
          [[0.42, 0.3], [0.5, 0.24]].forEach(function (b) {
            g.beginPath(); g.moveTo(w * b[0] - 10, h * b[1]); g.quadraticCurveTo(w * b[0] - 4, h * b[1] - 7, w * b[0], h * b[1]);
            g.quadraticCurveTo(w * b[0] + 4, h * b[1] - 7, w * b[0] + 10, h * b[1]); g.stroke();
          });
        }
      },
    ] },
    space: { label: "space", icon: "🚀", rain: false, hint: "second star to the right", layers: [
      function (g, w, h) { // far: the deep field — space ignores the clock
        var gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, "#05060e"); gr.addColorStop(1, "#0d1024");
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        var r = _wr(11); g.fillStyle = "rgba(240,242,255,0.9)";
        for (var i = 0; i < 110; i++) { var big = r() < 0.12 ? 2 : 1; g.fillRect(r() * w, r() * h, big, big); }
        [["rgba(122,74,138,0.14)", 0.3, 0.35, 130], ["rgba(58,90,138,0.12)", 0.75, 0.6, 110]].forEach(function (n) {
          var ng = g.createRadialGradient(w * n[1], h * n[2], 8, w * n[1], h * n[2], n[3]);
          ng.addColorStop(0, n[0]); ng.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = ng; g.beginPath(); g.arc(w * n[1], h * n[2], n[3], 0, 7); g.fill();
        });
        g.fillStyle = "#c8a06a"; g.beginPath(); g.arc(w * 0.72, h * 0.28, 26, 0, 7); g.fill(); // the ringed one
        g.fillStyle = "rgba(160,130,90,0.5)"; g.beginPath(); g.arc(w * 0.7, h * 0.265, 26, 0, 7); g.fill();
        g.strokeStyle = "rgba(220,200,160,0.7)"; g.lineWidth = 3;
        g.beginPath(); g.ellipse(w * 0.72, h * 0.28, 44, 12, -0.3, 0, 7); g.stroke();
      },
      function (g, w, h) { // mid: the belt, and somebody's rocket
        var r = _wr(83); g.fillStyle = "#3c4250";
        for (var i = 0; i < 8; i++) {
          var ax = r() * w, ay = h * (0.5 + (r() - 0.5) * 0.24), ar = 4 + r() * 9;
          g.beginPath(); g.ellipse(ax, ay, ar, ar * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill();
        }
        var rx = w * 0.24, ry = h * 0.62; // the little rocket
        g.save(); g.translate(rx, ry); g.rotate(-0.5);
        g.fillStyle = "#c8ccd6"; g.beginPath(); g.ellipse(0, 0, 11, 24, 0, 0, 7); g.fill();
        g.fillStyle = "#9e3b30";
        g.beginPath(); g.moveTo(-10, 12); g.lineTo(-18, 26); g.lineTo(-6, 20); g.fill();
        g.beginPath(); g.moveTo(10, 12); g.lineTo(18, 26); g.lineTo(6, 20); g.fill();
        g.beginPath(); g.arc(0, -24, 7, Math.PI, 0); g.fill();
        g.fillStyle = "#2c3440"; g.beginPath(); g.arc(0, -6, 5, 0, 7); g.fill();
        g.fillStyle = "rgba(255,190,90,0.9)";
        g.beginPath(); g.moveTo(-5, 25); g.lineTo(0, 42); g.lineTo(5, 25); g.fill();
        g.restore();
      },
      function (g, w, h) { // near: the moon below, a satellite above
        g.fillStyle = "#cfd2da";
        g.beginPath(); g.arc(w * 0.5, h * 1.55, h * 0.75, 0, 7); g.fill();
        g.fillStyle = "rgba(150,152,162,0.6)";
        var r = _wr(29);
        for (var i = 0; i < 7; i++) { g.beginPath(); g.arc(w * (0.2 + r() * 0.6), h * (0.86 + r() * 0.1), 4 + r() * 8, 0, 7); g.fill(); }
        g.fillStyle = "#a8adb8"; g.fillRect(w * 0.82, h * 0.12, 14, 10); // the satellite
        g.fillStyle = "#3a5a8a"; g.fillRect(w * 0.795, h * 0.135, 22, 4); g.fillRect(w * 0.845, h * 0.135, 22, 4);
      },
    ] },
  };
  var curViewKey = "street", winDrawnKey = null;
  function winPhaseName() { for (var k in PHASES) if (PHASES[k] === phase) return k; return "evening"; }
  function redrawWindow() {
    var v = WINDOW_VIEWS[curViewKey] || WINDOW_VIEWS.street;
    var stamp = curViewKey + "|" + winPhaseName();
    if (stamp === winDrawnKey) return;
    winDrawnKey = stamp;
    for (var i = 0; i < 3; i++) {
      var t = winLayerT[i], g = t.image.getContext("2d");
      g.clearRect(0, 0, 768, 512);
      v.layers[i](g, 768, 512, winPhaseName());
      t.needsUpdate = true;
    }
  }
  function curViewRain() { return (WINDOW_VIEWS[curViewKey] || WINDOW_VIEWS.street).rain; }
  function applyWindowView() {
    curViewKey = WINDOW_VIEWS[paintState.view] ? paintState.view : "street";
    var v = WINDOW_VIEWS[curViewKey];
    redrawWindow();
    winPane.userData.hint = "the window — " + v.hint;
    if (!v.rain) { rainCtx.clearRect(0, 0, 256, 320); rainT.needsUpdate = true; }
    AUDIO.setRain(v.rain ? phase.rainG : 0);
    if (winEv) { winEv.ev = null; winEvClear(); winEv.next = 6 + Math.random() * 8; } // fresh view, fresh traffic
  }

  /* ---- window LIFE: every half-minute or so, something crosses the view --------- */
  function _evCar(g, w, h, f, ev) { // headlights slide the road; taillight going the other way
    var ph = winPhaseName(), road = h * 0.80;
    var x = w * (0.1 + f * 0.8); if (ev.dir < 0) x = w - x;
    g.fillStyle = "#11141d";
    g.beginPath(); g.roundRect(x - 26, road - 20, 52, 15, 5); g.fill();
    g.beginPath(); g.roundRect(x - 14, road - 30, 28, 12, 4); g.fill();
    var nose = x + ev.dir * 26;
    if (ph !== "day") {
      var cg = g.createRadialGradient(nose, road - 12, 1, nose, road - 12, 60);
      cg.addColorStop(0, "rgba(255,236,180,0.7)"); cg.addColorStop(1, "rgba(255,236,180,0)");
      g.fillStyle = cg; g.beginPath();
      g.moveTo(nose, road - 16); g.lineTo(nose + ev.dir * 62, road - 26);
      g.lineTo(nose + ev.dir * 62, road + 4); g.lineTo(nose, road - 6); g.fill();
    }
    g.fillStyle = "#ffecb4"; g.fillRect(nose - 2, road - 15, 4, 4);
    g.fillStyle = "#ff5a5a"; g.fillRect(x - ev.dir * 26 - 2, road - 15, 4, 4);
  }
  function _evFenceCat(g, w, h, f, ev) { // a neighbourhood cat takes the fence route
    var y = h * 0.84 - 52 + Math.sin(f * 26) * 1.6;
    var x = w * (0.2 + f * 0.6); if (ev.dir < 0) x = w - x;
    g.fillStyle = "#0d1119";
    g.beginPath(); g.ellipse(x, y, 13, 5.5, 0, 0, 7); g.fill();                  // body
    g.beginPath(); g.arc(x + ev.dir * 12, y - 4, 4.5, 0, 7); g.fill();           // head
    g.beginPath(); g.moveTo(x + ev.dir * 9, y - 7); g.lineTo(x + ev.dir * 11, y - 12); g.lineTo(x + ev.dir * 13, y - 7); g.fill();
    g.beginPath(); g.moveTo(x + ev.dir * 13, y - 8); g.lineTo(x + ev.dir * 15, y - 12); g.lineTo(x + ev.dir * 17, y - 7); g.fill();
    g.strokeStyle = "#0d1119"; g.lineWidth = 2.4;                                 // tail asks a question
    g.beginPath(); g.moveTo(x - ev.dir * 12, y - 2);
    g.quadraticCurveTo(x - ev.dir * 22, y - 6 - Math.sin(f * 26) * 3, x - ev.dir * 20, y - 16); g.stroke();
  }
  function _evPlane(g, w, h, f, ev) { // red-eye crossing, contrail and all
    var x = w * (0.08 + f * 0.84); if (ev.dir < 0) x = w - x;
    var y = h * (0.12 + f * 0.03);
    g.strokeStyle = "rgba(220,228,240,0.10)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x - ev.dir * 10, y); g.lineTo(x - ev.dir * 120, y + 4); g.stroke();
    g.fillStyle = "rgba(235,240,250,0.9)"; g.fillRect(x - 1.5, y - 1.5, 3, 3);
    if (Math.sin(f * 90) > 0.2) { g.fillStyle = "rgba(255,80,80,0.95)"; g.fillRect(x + ev.dir * 5 - 1.5, y - 1.5, 3, 3); }
  }
  function _evShootStar(g, w, h, f, ev) { // there and gone
    var r = _wr(ev.seed), x0 = w * (0.25 + r() * 0.4), y0 = h * (0.08 + r() * 0.2);
    var dx = (r() > 0.5 ? 1 : -1) * (60 + r() * 60), dy = 40 + r() * 30;
    var x = x0 + dx * f, y = y0 + dy * f, a = Math.sin(f * Math.PI);
    var tg = g.createLinearGradient(x - dx * 0.22, y - dy * 0.22, x, y);
    tg.addColorStop(0, "rgba(240,244,255,0)"); tg.addColorStop(1, "rgba(240,244,255," + 0.9 * a + ")");
    g.strokeStyle = tg; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - dx * 0.22, y - dy * 0.22); g.lineTo(x, y); g.stroke();
  }
  function _evOwl(g, w, h, f, ev) { // low glide between the pines
    var x = w * (0.15 + f * 0.7); if (ev.dir < 0) x = w - x;
    var y = h * (0.48 + Math.sin(f * 6.5) * 0.05);
    var flap = Math.sin(f * 34) * 8;
    g.strokeStyle = "#0c111c"; g.lineWidth = 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(x - 12, y - flap); g.quadraticCurveTo(x, y - 3, x + 12, y - flap); g.stroke();
    g.fillStyle = "#0c111c"; g.beginPath(); g.ellipse(x, y, 5, 3.4, 0, 0, 7); g.fill();
  }
  function _evGull(g, w, h, f, ev) { // one lazy loop over the water
    var x = w * (0.12 + f * 0.76); if (ev.dir < 0) x = w - x;
    var y = h * (0.3 + Math.sin(f * 4) * 0.06);
    var flap = Math.sin(f * 22) * 5;
    g.strokeStyle = "#2a3140"; g.lineWidth = 2.6; g.lineCap = "round";
    g.beginPath(); g.moveTo(x - 9, y - flap); g.quadraticCurveTo(x, y + 2, x + 9, y - flap); g.stroke();
  }
  function _evShip(g, w, h, f) { // a light on the horizon, saying something slowly
    var x = w * 0.72, y = h * 0.565;
    g.fillStyle = "#0e1622"; g.fillRect(x - 9, y - 3, 18, 4);
    if (Math.sin(f * 22) > 0.3) {
      g.fillStyle = "rgba(255,230,150,0.95)"; g.fillRect(x - 1.5, y - 7, 3, 3);
      var lg = g.createRadialGradient(x, y - 6, 1, x, y - 6, 14);
      lg.addColorStop(0, "rgba(255,230,150,0.4)"); lg.addColorStop(1, "rgba(255,230,150,0)");
      g.fillStyle = lg; g.beginPath(); g.arc(x, y - 6, 14, 0, 7); g.fill();
    }
  }
  function _evSat(g, w, h, f, ev) { // the satellite makes its rounds
    var x = w * (0.1 + f * 0.8); if (ev.dir < 0) x = w - x;
    var y = h * (0.14 + f * 0.1);
    g.fillStyle = "#a8adb8"; g.fillRect(x - 4, y - 3, 8, 6);
    g.fillStyle = "#3a5a8a"; g.fillRect(x - 16, y - 1.5, 10, 3); g.fillRect(x + 6, y - 1.5, 10, 3);
    if (Math.sin(f * 50) > 0.92) { g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(x - 1, y - 6, 2, 2); }
  }
  var WIN_EVENTS = {
    street: [{ dur: 4.2, draw: _evCar }, { dur: 6.0, draw: _evFenceCat }],
    city: [{ dur: 8.0, draw: _evPlane }, { dur: 0.9, draw: _evShootStar }],
    woods: [{ dur: 3.4, draw: _evOwl }, { dur: 0.9, draw: _evShootStar }],
    sea: [{ dur: 5.5, draw: _evGull }, { dur: 3.2, draw: _evShip }],
    space: [{ dur: 0.8, draw: _evShootStar }, { dur: 11, draw: _evSat }],
  };
  var winEv = { next: 9 + Math.random() * 12, ev: null, t: 0, dir: 1, seed: 1 };
  function winEvClear() { winEvT.image.getContext("2d").clearRect(0, 0, 768, 512); winEvT.needsUpdate = true; }
  function winEvStart(i) { // (also the debug handle's way in)
    var pool = WIN_EVENTS[curViewKey] || [];
    if (!pool.length) { winEv.next = 20; return; }
    winEv.ev = pool[i != null ? i % pool.length : (Math.random() * pool.length) | 0];
    winEv.t = 0; winEv.dir = Math.random() < 0.5 ? -1 : 1; winEv.seed = (Math.random() * 1e6) | 0;
  }
  function winEvTick(dt2, fc) {
    if (winEv.ev) {
      winEv.t += dt2;
      if (winEv.t >= winEv.ev.dur) { winEv.ev = null; winEvClear(); winEv.next = 14 + Math.random() * 26; }
      else if ((fc % 3) === 0) { // 20fps is plenty for a passing car
        var g = winEvT.image.getContext("2d");
        g.clearRect(0, 0, 768, 512);
        winEv.ev.draw(g, 768, 512, winEv.t / winEv.ev.dur, winEv);
        winEvT.needsUpdate = true;
      }
    } else { winEv.next -= dt2; if (winEv.next <= 0) winEvStart(); }
  }
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
  // a point light shadows through a cube map — 6 faces, so phones keep the cheap one
  lampLight.shadow.mapSize.set(coarse ? 512 : 1024, coarse ? 512 : 1024);
  lampLight.shadow.bias = -0.004;   // kills the acne the default 0 leaves on the desk
  lampLight.shadow.radius = 2.5;
  var crtLight = new THREE.PointLight(0x7db4ff, 0.7, 4, 2); crtLight.position.set(2.3, 1.0, -1.4); scene.add(crtLight);
  var shelfGlow = new THREE.PointLight(0xffd9a0, 0.55, 5, 2); shelfGlow.position.set(-1.3, 1.8, -1.4); scene.add(shelfGlow);
  // Flat ambient lights every face identically, which is why unlit corners went dead.
  // A hemisphere carries part of that load instead: cool from the ceiling, warm bounced
  // up off the carpet. AMB_FLAT hands the difference over so the room doesn't just get
  // brighter — it gets shaped. Both scale together per phase (and when the bed dims it).
  var AMB_FLAT = 0.76, BOUNCE_K = 0.44;
  var bounce = new THREE.HemisphereLight(0x2c3440, 0x4a3526, 0.44);
  bounce.position.set(0, 3.2, 0); scene.add(bounce);

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
    queueGLB(url, function (g) {
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

  // the beige 90s computer — waiting on its next game. For now it just runs a
  // screensaver; click it to flip between the starfield and the bouncing logo.
  var pc = new THREE.Group();
  var beige = mat(0xd6cdb4, 0.55), beigeDark = mat(0xbfb59a, 0.6);
  var mon = box(0.62, 0.5, 0.5, beige); mon.position.y = 1.14; pc.add(mon);
  var monFoot = box(0.3, 0.07, 0.3, beigeDark); monFoot.position.y = 0.855; pc.add(monFoot);
  var monNeck = box(0.18, 0.06, 0.18, beigeDark); monNeck.position.y = 0.91; pc.add(monNeck);
  var pcScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ color: 0x06080c }));
  pcScreen.position.set(0, 1.14, 0.253); pc.add(pcScreen);
  var kb = box(0.5, 0.035, 0.2, beige); kb.position.set(0, 0.835, 0.33); kb.rotation.x = 0.06; pc.add(kb);
  var kbKeys = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.15), new THREE.MeshStandardMaterial({
    map: canvasTex(128, 48, function (g, w, h) {
      g.fillStyle = "#bfb59a"; g.fillRect(0, 0, w, h); g.fillStyle = "#8f866e";
      for (var r = 0; r < 4; r++) for (var c2 = 0; c2 < 14; c2++) g.fillRect(3 + c2 * 9, 3 + r * 11, 7, 8);
    }), roughness: 0.7,
  }));
  kbKeys.rotation.x = -Math.PI / 2 + 0.06; kbKeys.position.set(0, 0.854, 0.33); pc.add(kbKeys);
  // the PC has nothing to run yet, so it does what a 90s PC does when it's idle
  var ssCanvas = document.createElement("canvas"); ssCanvas.width = 256; ssCanvas.height = 192;
  var ssCtx = ssCanvas.getContext("2d");
  var ssT = new THREE.CanvasTexture(ssCanvas);
  var ssM = new THREE.MeshBasicMaterial({ map: ssT });
  // Five of them, because a 90s PC with nothing to run is still worth looking at.
  var SCREENSAVERS = [["stars", "starfield"], ["logo", "bouncing logo"], ["pipes", "pipes"],
                      ["mystify", "mystify"], ["rain", "code rain"]];
  var ssKind = "stars"; // applyPaint() restores the saved choice at boot
  var ssStars = [];
  for (var sst = 0; sst < 70; sst++) ssStars.push({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: 0.15 + Math.random() * 0.85 });
  var ssLogo = { x: 40, y: 60, vx: 46, vy: 36, hue: 130 };
  var ssPipe = { x: 128, y: 96, dx: 1, dy: 0, hue: 190, len: 0, drawn: 0 };
  var ssMyst = { pts: [], hue: 280 };
  for (var mp = 0; mp < 4; mp++) ssMyst.pts.push({ x: 30 + Math.random() * 190, y: 25 + Math.random() * 140,
    vx: (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 26), vy: (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 22) });
  var ssRain = [];
  for (var rc = 0; rc < 26; rc++) ssRain.push({ y: Math.random() * -190, sp: 55 + Math.random() * 95 });
  var RAIN_GLYPHS = "01<>[]{}/\\|=+*#$%&@ABCDEFGHJKLMNPQRSTUVWXYZ";
  pcScreen.material = ssM;
  function cycleScreen() { // clicking the PC walks through them (and remembers)
    var i = 0;
    for (var s = 0; s < SCREENSAVERS.length; s++) if (SCREENSAVERS[s][0] === ssKind) i = s;
    setPaint("screen", SCREENSAVERS[(i + 1) % SCREENSAVERS.length][0]);
    clickSfx(1900);
    if (decorMode && dwTabName === "paint") dwRender();
  }
  function drawScreensaver(dt2) {
    var g = ssCtx, w = 256, h = 192, i;
    if (ssKind === "stars") { // flying through the wallpaper stars
      g.fillStyle = "rgba(4,6,12,0.35)"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#dfe6ff";
      for (i = 0; i < ssStars.length; i++) {
        var st = ssStars[i];
        st.z -= dt2 * 0.35;
        if (st.z < 0.06) { st.x = Math.random() - 0.5; st.y = Math.random() - 0.5; st.z = 1; }
        var px = w / 2 + st.x / st.z * w * 0.9, py = h / 2 + st.y / st.z * h * 0.9;
        var r = Math.min(2.6, 0.4 / st.z);
        if (px > 0 && px < w && py > 0 && py < h) g.fillRect(px, py, r, r);
      }
    } else if (ssKind === "logo") { // the logo roams, kisses a corner once an epoch
      g.fillStyle = "#06080c"; g.fillRect(0, 0, w, h);
      var lw = 92, lh = 34;
      ssLogo.x += ssLogo.vx * dt2; ssLogo.y += ssLogo.vy * dt2;
      if (ssLogo.x < 0 || ssLogo.x > w - lw) { ssLogo.vx *= -1; ssLogo.x = Math.max(0, Math.min(w - lw, ssLogo.x)); ssLogo.hue = (ssLogo.hue + 67) % 360; }
      if (ssLogo.y < 0 || ssLogo.y > h - lh) { ssLogo.vy *= -1; ssLogo.y = Math.max(0, Math.min(h - lh, ssLogo.y)); ssLogo.hue = (ssLogo.hue + 67) % 360; }
      g.strokeStyle = "hsl(" + ssLogo.hue + ",80%,60%)"; g.lineWidth = 2;
      g.strokeRect(ssLogo.x, ssLogo.y, lw, lh);
      g.fillStyle = "hsl(" + ssLogo.hue + ",80%,70%)";
      g.font = "bold 15px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("SOON", ssLogo.x + lw / 2, ssLogo.y + lh / 2 + 1);
    } else if (ssKind === "pipes") { // it never gets anywhere, it just keeps plumbing
      if (ssPipe.drawn === 0) { g.fillStyle = "#0a0c10"; g.fillRect(0, 0, w, h); }
      var step = 46 * dt2;
      var nx = ssPipe.x + ssPipe.dx * step, ny = ssPipe.y + ssPipe.dy * step;
      g.strokeStyle = "hsl(" + ssPipe.hue + ",70%,58%)"; g.lineWidth = 5; g.lineCap = "round";
      g.beginPath(); g.moveTo(ssPipe.x, ssPipe.y); g.lineTo(nx, ny); g.stroke();
      ssPipe.x = nx; ssPipe.y = ny; ssPipe.len += step; ssPipe.drawn += step;
      var wall = nx < 8 || nx > w - 8 || ny < 8 || ny > h - 8;
      if (wall || ssPipe.len > 18 + Math.random() * 34) {   // elbow
        g.fillStyle = "hsl(" + ssPipe.hue + ",70%,68%)";
        g.beginPath(); g.arc(ssPipe.x, ssPipe.y, 3.4, 0, 7); g.fill();
        var turn = Math.random() < 0.5 ? 1 : -1, odx = ssPipe.dx;
        ssPipe.dx = -ssPipe.dy * turn; ssPipe.dy = odx * turn;
        if (wall) { // steer back inside rather than grinding along the edge
          ssPipe.dx = nx < 8 ? 1 : nx > w - 8 ? -1 : 0;
          ssPipe.dy = ssPipe.dx ? 0 : (ny < 8 ? 1 : -1);
        }
        ssPipe.x = Math.max(8, Math.min(w - 8, ssPipe.x));
        ssPipe.y = Math.max(8, Math.min(h - 8, ssPipe.y));
        ssPipe.len = 0; ssPipe.hue = (ssPipe.hue + 23) % 360;
      }
      if (ssPipe.drawn > 5200) { ssPipe.drawn = 0; } // a fresh sheet now and then
    } else if (ssKind === "mystify") { // a polygon dragging its own ghosts
      g.fillStyle = "rgba(6,8,14,0.10)"; g.fillRect(0, 0, w, h);
      ssMyst.hue = (ssMyst.hue + dt2 * 22) % 360;
      for (i = 0; i < ssMyst.pts.length; i++) {
        var p = ssMyst.pts[i];
        p.x += p.vx * dt2; p.y += p.vy * dt2;
        if (p.x < 2 || p.x > w - 2) { p.vx *= -1; p.x = Math.max(2, Math.min(w - 2, p.x)); }
        if (p.y < 2 || p.y > h - 2) { p.vy *= -1; p.y = Math.max(2, Math.min(h - 2, p.y)); }
      }
      g.strokeStyle = "hsl(" + (ssMyst.hue | 0) + ",85%,64%)"; g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(ssMyst.pts[0].x, ssMyst.pts[0].y);
      for (i = 1; i < ssMyst.pts.length; i++) g.lineTo(ssMyst.pts[i].x, ssMyst.pts[i].y);
      g.closePath(); g.stroke();
    } else { // code rain
      g.fillStyle = "rgba(2,8,4,0.16)"; g.fillRect(0, 0, w, h);
      g.font = "bold 11px monospace"; g.textAlign = "center"; g.textBaseline = "top";
      for (i = 0; i < ssRain.length; i++) {
        var col = ssRain[i];
        col.y += col.sp * dt2;
        if (col.y > h + 20) { col.y = -10 - Math.random() * 90; col.sp = 55 + Math.random() * 95; }
        var gx = 5 + i * 10;
        g.fillStyle = "#d6ffe0";
        g.fillText(RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0], gx, col.y);
        g.fillStyle = "rgba(70,220,120,0.75)";
        g.fillText(RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0], gx, col.y - 12);
        g.fillStyle = "rgba(50,170,95,0.45)";
        g.fillText(RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0], gx, col.y - 24);
      }
      g.textBaseline = "middle";
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
  [mon, pcScreen, kb, tower].forEach(function (m) {
    clickable(m, "the computer", cycleScreen, "the computer — nothing installed yet · click to change the screensaver");
  });

  // the brain on the desk — BRAINROT (generated neon brain, glows its own colors)
  var brainG = new THREE.Group();
  var BRAINROT_URL = "https://dumb-tony.github.io/GameRepos/brainrot/";
  var BRAINROT_HINT = "BRAINROT: RISE OF THE MEME — Dumb Tony's mind-plague strategy";
  var brainStand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.06, 20), woodMSide); brainStand.position.y = 0.845; brainG.add(brainStand);
  clickable(brainStand, "BRAINROT", go(BRAINROT_URL), BRAINROT_HINT);
  var brainGlow = new THREE.PointLight(0xff3bd0, 0.5, 1.1, 2); brainGlow.position.set(0, 1.02, 0); brainG.add(brainGlow);
  queueGLB("assets/props/brain.glb", function (g) {
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
  // Strung along the RIGHT wall over the bed, where you'd actually hang them —
  // they used to run the back wall and fought the neon sign for the same eyeline.
  // They swag between two nails, so the sag is a curve across the run, not per-bulb.
  var LIGHT_Z0 = -0.55, LIGHT_Z1 = 2.75, LIGHT_N = 13;
  for (var li = 0; li < LIGHT_N; li++) {
    var f = li / (LIGHT_N - 1);
    var bz = LIGHT_Z0 + f * (LIGHT_Z1 - LIGHT_Z0);
    var sag = Math.sin(f * Math.PI) * 0.17;          // deepest in the middle of the run
    var by = 2.46 - sag;
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8),
      new THREE.MeshBasicMaterial({ color: bulbCols[li % 5], transparent: true, opacity: 0.9 }));
    bulb.position.set(3.5, by, bz);
    bulb.userData.phase = li * 0.7;
    var bglow = glow(bulbCols[li % 5], 3.47, by, bz, 0.16, 0.16, 0.5);
    bulb.userData.glow = bglow; scene.add(bglow); // little halo so each bulb reads as lit
    scene.add(bulb); bulbs.push(bulb);
  }
  // the wire they hang from, sagging through the same curve
  (function lightWire() {
    var pts = [];
    for (var w = 0; w <= 40; w++) {
      var f2 = w / 40;
      pts.push(new THREE.Vector3(3.53, 2.46 - Math.sin(f2 * Math.PI) * 0.17 + 0.03,
        LIGHT_Z0 + f2 * (LIGHT_Z1 - LIGHT_Z0)));
    }
    var wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.006, 5, false),
      new THREE.MeshStandardMaterial({ color: 0x2f2a24, roughness: 0.9 }));
    scene.add(wire);
  })();
  // (the old photo-era streetlamp glow sprite is gone — the painted views draw their own lamps)

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
  var powerLED = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x552222 }));
  powerLED.position.set(0, 0.215, 0.088); boom.add(powerLED);
  boom.children.forEach(function (m) {
    clickable(m, "the boombox", function () {
      var on = AUDIO.toggle(phase.rainG);
      powerLED.material.color.set(on ? 0xff3b30 : 0x552222);
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
    "G FOR GEORGE":   { key: "gg_persist",      pick: function (m) { return countOf(m.endings); }, total: 14, noun: "tellings" }
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
    AUDIO.start(phase.rainG); powerLED.material.color.set(0xff3b30);
    kidGreet = true; // he looks up and waves as you walk in
    try { // how many times you've stepped in before (drives his greeting)
      priorVisits = parseInt(localStorage.getItem("room-visits") || "0", 10) || 0;
      localStorage.setItem("room-visits", priorVisits + 1);
    } catch (e) { priorVisits = 0; }
    setTimeout(function () { // let the saves settle, then tell them what they just earned
      try {
        var fresh = PROFILE.evaluate(profileCtx()).unseen;
        if (fresh.length) {
          kidSay(fresh.length === 1
            ? "hey — " + fresh[0].name.toLowerCase() + ". it's in the notebook."
            : "you've earned " + fresh.length + " new things. they're in the notebook.", 5.5);
        }
      } catch (e) { /* never let a nicety break the room */ }
    }, 12000);
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
    AUDIO.followVisibility(document.hidden);
  });

  /* ---- DUST MOTES: the whole room's air, lit by whatever they drift through -----
   * They used to be 60 specks parked in the desk corner at one flat brightness. Now
   * they fill the room and each one is coloured every frame by the lights it happens
   * to be near — so a mote is invisible in the dark, warms up crossing the lamp,
   * turns pink through the lava lamp's glow, blue in front of the TV. With the bloom
   * pass they flare as they pass, which is the whole trick. */
  var moteGeo = new THREE.BufferGeometry(), moteN = 150;
  var motePos = new Float32Array(moteN * 3), moteCol = new Float32Array(moteN * 3);
  var moteDrift = new Float32Array(moteN); // each speck falls at its own lazy rate
  for (var mi = 0; mi < moteN; mi++) {
    motePos[mi * 3] = -3.2 + Math.random() * 6.4;
    motePos[mi * 3 + 1] = 0.25 + Math.random() * 2.5;
    motePos[mi * 3 + 2] = -2.3 + Math.random() * 4.6;
    moteCol[mi * 3] = moteCol[mi * 3 + 1] = moteCol[mi * 3 + 2] = 0;
    moteDrift[mi] = 0.6 + Math.random() * 0.9;
  }
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute("color", new THREE.BufferAttribute(moteCol, 3));
  // additive + per-vertex colour: the room lights them, nothing else
  var motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.018, vertexColors: true,
    transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
    sizeAttenuation: true }));
  scene.add(motes);
  // what can light a speck. `o` reads a live light (it moves with its furniture).
  var MOTE_LIGHTS = [
    { o: lampLight, c: [1.0, 0.80, 0.52], fall: 3.2, gain: 0.95 },   // the desk lamp
    { o: crtLight, c: [0.52, 0.72, 1.0], fall: 3.6, gain: 0.75 },    // the TV
    { p: [0.55, 0.86, -2.16], c: [1.0, 0.42, 0.58], fall: 6.0, gain: 0.8 },  // the lava lamp
    { p: [-1.3, 2.42, -2.45], c: [1.0, 0.45, 0.75], fall: 5.0, gain: 0.55 }, // the neon sign
    { p: [2.35, 1.95, -2.45], c: [0.72, 0.82, 1.0], fall: 2.2, gain: 0.5 },  // the window
  ];

  /* ---- the streetlight leans in through the window ------------------------------
   * A soft wedge of light on the floor under the window. Not a real volumetric — a
   * pair of additive planes with a gradient that fades at both ends, which holds up
   * because the camera only ever pans a little. Brightest at night, gone by day. */
  var shaftTex = canvasTex(64, 128, function (g, w, h) {
    var lg = g.createLinearGradient(0, 0, 0, h);      // fade in from the glass, out on the floor
    lg.addColorStop(0, "rgba(255,214,160,0.0)");
    lg.addColorStop(0.18, "rgba(255,214,160,0.55)");
    lg.addColorStop(0.65, "rgba(255,214,160,0.22)");
    lg.addColorStop(1, "rgba(255,214,160,0)");
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    var eg = g.createLinearGradient(0, 0, w, 0);      // soften the long edges
    eg.addColorStop(0, "rgba(0,0,0,1)");
    eg.addColorStop(0.5, "rgba(0,0,0,0)");
    eg.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = eg; g.fillRect(0, 0, w, h);
  });
  var shaftG = new THREE.Group();
  [0, Math.PI / 2].forEach(function (rot) {           // crossed planes hold up as the view pans
    var m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.1), new THREE.MeshBasicMaterial({
      map: shaftTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, opacity: 0.5,
    }));
    m.rotation.y = rot; shaftG.add(m);
  });
  shaftG.position.set(2.3, 1.15, -1.55);
  shaftG.rotation.x = 0.62;                           // tipped so it lands on the floor, not the wall
  shaftG.renderOrder = 2;
  scene.add(shaftG);

  /* ---- the season drifts through the room (view-only) --------------------------
   * A gentle fall keyed to the real month — snow in winter, petals in spring, leaves
   * in autumn, clear skies in summer. Purely decorative (Math.random, never the sim),
   * and switchable off in the paint tab for anyone who'd rather it stayed still.
   * ?season=winter|spring|autumn|summer pins it for tinkering. */
  var SEASON_LOOKS = {
    winter: { color: 0xeaf2ff, size: 0.032, fall: 0.26, sway: 0.5, op: 0.8 },   // snow
    spring: { color: 0xffc4dc, size: 0.030, fall: 0.19, sway: 1.0, op: 0.72 },  // petals
    autumn: { color: 0xe8944a, size: 0.034, fall: 0.23, sway: 0.85, op: 0.72 }, // leaves
  };
  var seasonFX = (function () {
    var q = /[?&]season=(winter|spring|autumn|summer|none)/.exec(location.search);
    if (q) return (q[1] === "summer" || q[1] === "none") ? null : q[1];
    var m = _md[0];
    if (m === 12 || m <= 2) return "winter";
    if (m >= 3 && m <= 5) return "spring";
    if (m >= 9 && m <= 11) return "autumn";
    return null; // summer: clear skies
  })();
  var seaN = 46, seaGeo = new THREE.BufferGeometry(), seaPos = new Float32Array(seaN * 3), seaPh = new Float32Array(seaN);
  for (var sfi = 0; sfi < seaN; sfi++) {
    seaPos[sfi * 3] = -3.3 + Math.random() * 6.6;
    seaPos[sfi * 3 + 1] = Math.random() * 3.3;
    seaPos[sfi * 3 + 2] = -2.3 + Math.random() * 4.9;
    seaPh[sfi] = Math.random() * 6.28;
  }
  seaGeo.setAttribute("position", new THREE.BufferAttribute(seaPos, 3));
  var seaMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false });
  var seaPoints = new THREE.Points(seaGeo, seaMat); seaPoints.visible = false; scene.add(seaPoints);
  function applySeasonFX() {
    var look = (seasonFX && !paintState.noSeason) ? SEASON_LOOKS[seasonFX] : null;
    seaPoints.visible = !!look;
    if (look) { seaMat.color.set(look.color); seaMat.size = look.size; seaMat.opacity = look.op; seaMat.needsUpdate = true; }
  }

  /* ---- the room follows your clock -------------------------------------------- */
  // Four moods keyed to the visitor's real hour. Each phase sets the ambient
  // wash, the "moon" (which doubles as daylight), the window's lift, how hard
  // it rains (streaks + audio), how the TV behaves, and how often the storm
  // flashes. ?hour=23 in the URL pins a phase for tinkering.
  var PHASES = {
    day:     { amb: 0x4a5468, ambI: 1.3, shaft: 0.0,  moonC: 0xbcc8da, moonI: 0.8,  lift: 1.04, liftB: 1.0,  stars: 0.12, streaks: 36, rainG: 0.04,  grade: [1.0, 1.0, 1.01, 1.0],  test: false, fMin: 20, fRnd: 30, on: [13, 9], off: [2, 3] },
    dusk:    { amb: 0x4a3c40, ambI: 1.15, shaft: 0.28, moonC: 0xe8935a, moonI: 0.55, lift: 1.0,  liftB: 0.96, stars: 0.3,  streaks: 44, rainG: 0.05,  grade: [1.03, 0.995, 0.97, 1.0],  test: false, fMin: 16, fRnd: 26, on: [9, 8],  off: [3, 4] },
    evening: { amb: 0x2c3440, ambI: 1.0, shaft: 0.5,  moonC: 0x7d9cc4, moonI: 0.4,  lift: 0.96, liftB: 1.05, stars: 0.45, streaks: 44, rainG: 0.05,  grade: [1.0, 0.995, 1.03, 0.99],  test: false, fMin: 14, fRnd: 26, on: [9, 8],  off: [3, 4] },
    night:   { amb: 0x1e2634, ambI: 0.85, shaft: 0.62, moonC: 0x8fb4e8, moonI: 0.52, lift: 0.88, liftB: 1.1,  stars: 0.78, streaks: 64, rainG: 0.085, grade: [0.97, 0.99, 1.06, 0.96], test: true,  fMin: 8,  fRnd: 14, on: [7, 5],  off: [4, 5] },
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
    if (p === phase && amb.intensity === p.ambI * AMB_FLAT) return; // must match what we set below
    phase = p;
    amb.color.set(p.amb); amb.intensity = p.ambI * AMB_FLAT;
    bounce.color.set(p.amb); bounce.intensity = p.ambI * BOUNCE_K;
    moon.color.set(p.moonC); moon.intensity = p.moonI;
    // the streetlight only reads once the room is darker than it is
    shaftG.children.forEach(function (m) { m.material.opacity = p.shaft; });
    shaftG.visible = p.shaft > 0.001;
    winLift(p.lift, p.lift, p.lift * p.liftB);
    redrawWindow(); // the painted view follows the hour
    // the lens takes the hour too: colder and dimmer as the night gets later
    if (post.available && post.setGrade) post.setGrade(p.grade[0], p.grade[1], p.grade[2], p.grade[3]);
    AUDIO.setRain(curViewRain() ? p.rainG : 0);
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
  // The room has four hours of the day built in; the switch used to reach only two.
  // lightMode is null (follow your clock) or a PHASES key. Old saves stored 1/2.
  var LIGHT_MODES = [null, "day", "dusk", "evening", "night"];
  var LIGHT_LABEL = { day: "daytime", dusk: "golden hour", evening: "after bedtime", night: "the dead of night" };
  var lightMode = null;
  try {
    var _lm = localStorage.getItem("room-light");
    if (_lm === "1") lightMode = "day";                     // migrate the old numeric modes
    else if (_lm === "2") lightMode = "night";
    else if (LIGHT_MODES.indexOf(_lm) > 0) lightMode = _lm;
  } catch (e) { /* private mode */ }
  function applyLightMode() {
    phaseOverride = lightMode;
    phaseHour = -1; applyPhase();
    var lift = lightMode === "day" ? 0.028 : lightMode === "dusk" ? 0.014
             : lightMode === "evening" ? -0.014 : lightMode === "night" ? -0.028 : 0;
    swNub.position.y = 1.32 + lift;
    var hint = lightMode ? "the light switch — " + LIGHT_LABEL[lightMode] : "the light switch — follows your clock";
    swPlate.userData.hint = swNub.userData.hint = hint;
  }
  function setLightMode(m) {
    lightMode = LIGHT_MODES.indexOf(m) >= 0 ? m : null;
    applyLightMode();
    try { localStorage.setItem("room-light", lightMode == null ? "0" : lightMode); } catch (e) { /* private mode */ }
  }
  function cycleLights() {
    setLightMode(LIGHT_MODES[(LIGHT_MODES.indexOf(lightMode) + 1) % LIGHT_MODES.length]);
    if (typeof clickSfx === "function") clickSfx(lightMode ? 1500 : 1000);
    if (decorMode && dwTabName === "paint") dwRender(); // keep the drawer in step with the wall switch
  }
  [swPlate, swNub].forEach(function (m) { clickable(m, "the light switch", cycleLights, "the light switch — the hour of the day, or follow your clock"); });
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
  queueGLB("assets/props/bed.glb", function (g) {
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
  // REX — rigged headlessly in Blender 2026-07-29 (16 bones, heat-weighted). "idle"
  // loops on its own via prop(); poking him plays "roar" once and hands back to idle.
  prop("assets/props/trex.glb", 0.3, 0.95, 0, -1.35, 0.7, function (wrap, root, mx, clips) {
    registerMovable({ key: "trex", label: "rex", root: wrap, r: 0.2, rot: true });
    var idleA = null, roarA = null;
    (clips || []).forEach(function (c) {
      if (!mx) return;
      if (/idle/i.test(c.name)) idleA = mx.clipAction(c);
      else if (/roar/i.test(c.name)) roarA = mx.clipAction(c);
    });
    // a skinned mesh whose bones move outside its bind-pose bounds can vanish when the
    // camera swings — cheap insurance on a prop this small
    root.traverse(function (o) { if (o.isSkinnedMesh) o.frustumCulled = false; });
    function rexRoar() {
      clickSfx(300);
      try { rumble(0.3); } catch (e) { }   // the thunder synth, doing dinosaur duty
      if (!mx || !roarA) return;
      if (idleA) idleA.fadeOut(0.12);
      roarA.reset(); roarA.setLoop(THREE.LoopOnce, 1); roarA.clampWhenFinished = false;
      roarA.fadeIn(0.08).play();
    }
    if (mx) mx.addEventListener("finished", function (e) {
      if (roarA && e.action === roarA && idleA) { idleA.reset().fadeIn(0.25).play(); }
    });
    wrap.traverse(function (o) {
      if (o.isMesh) clickable(o, "rex", roarA ? rexRoar : null, "rex — he guards the toy chest" + (roarA ? " · poke him" : ""));
    });
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
  var posterBrainrot = null; // WHAT'S OUT hides this with its game
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
  // HOOD RUN's poster takes the back-wall spot beside the shelf. Drawn, not photographed:
  // a night skyline, the last of the sun behind it, and somebody already running.
  var posterHood = null;
  (function wallPosterHood() {
    var g = new THREE.Group(); posterHood = g;
    var backing = box(0.56, 0.82, 0.02, mat(0xe8e2d4, 0.9)); g.add(backing);
    var art = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.78), new THREE.MeshStandardMaterial({
      roughness: 0.88,
      map: canvasTex(320, 480, function (c, w, h) {
        var sky = c.createLinearGradient(0, 0, 0, h * 0.72);           // dusk over the city
        sky.addColorStop(0, "#10131f"); sky.addColorStop(0.55, "#2b2340"); sky.addColorStop(1, "#e8734a");
        c.fillStyle = sky; c.fillRect(0, 0, w, h);
        c.fillStyle = "rgba(255,214,150,0.9)";                          // low sun
        c.beginPath(); c.arc(w * 0.68, h * 0.6, 34, 0, 7); c.fill();
        var towers = [[8, 250, 44, 0], [50, 300, 34, 1], [86, 215, 40, 0], [128, 285, 30, 1],
                      [160, 190, 48, 0], [210, 265, 36, 1], [248, 225, 34, 0], [284, 300, 30, 1]];
        towers.forEach(function (t) {                                    // silhouettes, near ones darker
          var top = h * 0.72 - t[1] * 0.42;
          c.fillStyle = t[3] ? "#0b0d16" : "#171b2b";
          c.fillRect(t[0], top, t[2], h * 0.72 - top + 4);
          c.fillStyle = "rgba(255,206,140,0.5)";                         // lit windows
          for (var wy = top + 8; wy < h * 0.72 - 10; wy += 13)
            for (var wx = t[0] + 6; wx < t[0] + t[2] - 6; wx += 11)
              if (((wx + wy) % 7) < 3) c.fillRect(wx, wy, 4, 6);
        });
        c.fillStyle = "#0b0d16"; c.fillRect(0, h * 0.72, w, h * 0.28);   // the street
        c.strokeStyle = "rgba(232,115,74,0.55)"; c.lineWidth = 3;         // speed lines
        [0.79, 0.845, 0.9].forEach(function (fy, i) {
          c.beginPath(); c.moveTo(w * (0.06 + i * 0.04), h * fy); c.lineTo(w * (0.34 + i * 0.05), h * fy); c.stroke();
        });
        c.save();                                                        // the runner
        c.translate(w * 0.56, h * 0.845); c.scale(1.15, 1.15);
        // coral, NOT the street's own near-black — a silhouette the same colour as
        // the road behind it is a silhouette nobody can see
        c.fillStyle = "#e8734a";
        c.beginPath(); c.arc(6, -46, 7, 0, 7); c.fill();                 // head
        c.lineWidth = 7; c.strokeStyle = "#e8734a"; c.lineCap = "round";
        c.beginPath(); c.moveTo(4, -38); c.lineTo(0, -18); c.stroke();   // torso
        c.beginPath(); c.moveTo(0, -18); c.lineTo(-14, -2); c.stroke();  // back leg
        c.beginPath(); c.moveTo(0, -18); c.lineTo(16, -8); c.lineTo(14, 6); c.stroke(); // front leg
        c.beginPath(); c.moveTo(4, -34); c.lineTo(-12, -28); c.stroke(); // trailing arm
        c.beginPath(); c.moveTo(4, -34); c.lineTo(18, -40); c.stroke();  // leading arm
        c.restore();
        c.fillStyle = "#f6efdd"; c.textAlign = "center";                  // the wordmark
        c.font = "bold 46px Inter, Arial, sans-serif";
        c.fillText("HOOD RUN", w / 2, h * 0.16);
        c.fillStyle = "#e8734a"; c.font = "bold 15px Inter, Arial, sans-serif";
        c.fillText("THE CROSSTOWN DASH", w / 2, h * 0.215);
        c.strokeStyle = "rgba(246,239,221,0.35)"; c.lineWidth = 2;
        c.strokeRect(10, 10, w - 20, h - 20);
      }),
    }));
    art.position.z = 0.012; g.add(art);
    g.position.set(-3.05, 1.9, -2.53); g.rotation.z = -0.02; // taped a touch crooked, like the rest
    scene.add(g);
    [backing, art].forEach(function (mm) {
      clickable(mm, "HOOD RUN", HOOD_RUN_URL ? go(HOOD_RUN_URL) : null,
        HOOD_RUN_URL ? "HOOD RUN — the Crosstown Dash · click to run" : "HOOD RUN — coming soon");
    });
  })();

  /* ---- THE POSTER FRAMES: swappable prints, one per game (2026-07-27) ---------
   * Every game got a painted 90s poster; three frames around the room each hold
   * whichever print you choose (🌟 walls tab). Clicking a frame opens the game
   * whose poster hangs in it. Persists in "room-posters" and rides share codes. */
  var POSTER_ART = [ // title = the GAME_KEYS/PLAY title, so ownership flows into the frames
    { key: "ageoftoys", label: "AGE OF TOYS", url: BASE + "toybox-tactics/", tip: "AGE OF TOYS — the toy chest's own war story" },
    { key: "south", label: "SOUTH", title: "SOUTH", url: BASE + "south/", tip: "SOUTH — bring all 27 home" },
    { key: "stillbreathing", label: "STILL BREATHING", title: "STILL BREATHING", url: BASE + "still-breathing/", tip: "STILL BREATHING — four true ordeals" },
    { key: "ninecircles", label: "NINE CIRCLES", title: "NINE CIRCLES", url: BASE + "nine-circles/", tip: "NINE CIRCLES — a descent" },
    { key: "choosewisely", label: "CHOOSE WISELY", title: "CHOOSE WISELY", url: BASE + "choose-wisely/", tip: "CHOOSE WISELY — the shop remembers you" },
    { key: "nobody", label: "NOBODY", title: "NOBODY", url: BASE + "nobody/", tip: "NOBODY — the Odyssey; argue with the poem" },
    { key: "tidebound", label: "TIDEBOUND", title: "TIDEBOUND", url: "https://dumb-tony.github.io/GameRepos/tidebound/", tip: "TIDEBOUND — the island that isn't on any chart" },
    { key: "elementary", label: "ELEMENTARY", title: "ELEMENTARY", url: BASE + "sherlock/", tip: "ELEMENTARY — observe, infer, live with being wrong" },
    { key: "curiouser", label: "CURIOUSER", title: "CURIOUSER", url: BASE + "alice/", tip: "CURIOUSER — wake as yourself" },
    { key: "redink", label: "THE RED INK", title: "DRACULA", url: BASE + "dracula/", tip: "DRACULA: THE RED INK — argue with the book" },
    { key: "george", label: "G FOR GEORGE", title: "G FOR GEORGE", url: BASE + "george/", tip: "G FOR GEORGE — 336 feet to the trees" },
  ];
  var POSTER_CYCLE = [{ key: "none", label: "(bare wall)" }].concat(POSTER_ART); // cycling to "none" takes the frame down
  var posterByKey = { none: POSTER_CYCLE[0] };
  POSTER_ART.forEach(function (p) { posterByKey[p.key] = p; });
  var POSTER_SPOTS = [ // wall inner faces are x=±3.55
    { key: "p1", label: "the frame over the bed", x: 3.53, y: 2.08, z: 1.05, ry: -Math.PI / 2, rz: 0.02, def: "ageoftoys" },
    { key: "p2", label: "the frame by the speakers", x: 3.53, y: 1.98, z: 0.05, ry: -Math.PI / 2, rz: -0.015, def: "south" },
    { key: "p3", label: "the frame by the beanbag", x: -3.53, y: 1.82, z: 1.6, ry: Math.PI / 2, rz: 0.02, def: "curiouser" },
  ];
  var posterState = loadJSON("room-posters") || {};
  var posterFrames = {}, posterTexCache = {};
  POSTER_SPOTS.forEach(function (s) {
    var g = new THREE.Group();
    var backing = box(0.56, 0.82, 0.02, mat(0xe8e2d4, 0.9)); g.add(backing);
    var m = new THREE.MeshStandardMaterial({ color: 0x333944, roughness: 0.85 });
    var art = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.78), m);
    art.position.z = 0.012; g.add(art);
    scene.add(g);
    var f = posterFrames[s.key] = { g: g, m: m, meshes: [backing, art], cur: null };
    f.cfg = { isFrame: true, spot: s, root: g, label: s.label, rot: false, kind: "frame" };
    [backing, art].forEach(function (mm) {
      clickable(mm, "", null, ""); // registered once; applyPosters mutates userData
      mm.userData.__frame = f.cfg; // decor mode grabs frames like stickers
    });
    framePlace(s);
  });
  function framePlace(s) { // default spot, or wherever it was dragged (posterState._pos)
    var g = posterFrames[s.key].g;
    var pos = (posterState._pos || {})[s.key];
    if (pos) {
      var pl = wallPlace(pos.w, pos.x, pos.y, pos.z);
      g.position.set(pl.x, clamp(pos.y, 0.62, 2.85), pl.z); // frames are taller than stickers — keep the middle band
      g.rotation.y = pl.ry; g.rotation.z = s.rz;
    } else {
      g.position.set(s.x, s.y, s.z); g.rotation.y = s.ry; g.rotation.z = s.rz;
    }
  }
  function moveFrameTo(s, wp) {
    if (!posterState._pos) posterState._pos = {};
    posterState._pos[s.key] = { w: wp.wall, x: +wp.place.x.toFixed(3), y: +wp.place.y.toFixed(3), z: +wp.place.z.toFixed(3) };
    framePlace(s);
  }
  var _posterWrapT = null;
  function posterWrapTex() { // an unowned print hangs wrapped, like the books on the shelf
    if (_posterWrapT) return _posterWrapT;
    return (_posterWrapT = canvasTex(256, 384, function (g, w, h) {
      g.fillStyle = "hsl(210,32%,66%)"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "hsla(210,45%,84%,0.9)"; g.lineWidth = 5;
      for (var i = -h; i < w; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
      g.fillStyle = "#e8dcc0"; g.fillRect(w * 0.42, 0, w * 0.16, h);       // ribbon
      g.fillStyle = "#e8dcc0"; g.fillRect(0, h * 0.44, w, h * 0.10);
      g.fillStyle = "#c9a35c"; g.fillRect(w * 0.40, h * 0.42, w * 0.20, h * 0.14); // knot
      g.save(); g.translate(w * 0.5, h * 0.72); g.rotate(-0.08);            // gift tag
      g.fillStyle = "#f6efdd"; g.fillRect(-40, -28, 80, 56);
      g.strokeStyle = "#b7a888"; g.lineWidth = 3; g.strokeRect(-40, -28, 80, 56);
      g.fillStyle = "#5a4632"; g.font = "bold 40px Georgia, serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 0, 2);
      g.restore();
    }));
  }
  function posterLocked(d) { // ownership flows from the storefront (safe before GAME_KEYS exists)
    return !!(d.title && typeof GAME_KEYS === "object" && GAME_KEYS && GAME_KEYS[d.title] && gameLocked(d.title));
  }
  function applyPosters() {
    POSTER_SPOTS.forEach(function (s) {
      var f = posterFrames[s.key];
      framePlace(s);
      var d = posterByKey[posterState[s.key]] || posterByKey[s.def];
      if (d.key === "none") { f.cur = "none"; f.g.visible = false; return; }
      f.g.visible = true;
      var locked = posterLocked(d);
      var want = locked ? d.key + ":wrapped" : d.key;
      if (f.cur === want) return;
      f.cur = want;
      if (locked) {
        f.m.map = posterWrapTex(); f.m.color.set(0xffffff); f.m.needsUpdate = true;
        f.meshes.forEach(function (mm) {
          mm.userData.name = d.label; // no __nav: the kid doesn't fetch what you don't own
          mm.userData.action = function () { openStore(d.title); };
          mm.userData.hint = d.label + " — still wrapped · click to get the key";
        });
        return;
      }
      f.m.map = null; f.m.color.set(0x333944); f.m.needsUpdate = true; // grey while the print loads
      var apply = function (t) {
        if (f.cur !== d.key) return; // they cycled again while this one loaded
        f.m.map = t; f.m.color.set(0xffffff); f.m.needsUpdate = true;
      };
      if (posterTexCache[d.key]) apply(posterTexCache[d.key]);
      else texLoader.load("assets/tex/poster-" + d.key + ".jpg", function (t) { t.anisotropy = 8; posterTexCache[d.key] = t; apply(t); });
      f.meshes.forEach(function (mm) {
        mm.userData.name = d.label; mm.userData.action = go(d.url);
        mm.userData.hint = d.tip + " · click to play";
      });
    });
  }
  function cyclePoster(spotKey, dir) {
    var s = null;
    POSTER_SPOTS.forEach(function (ss) { if (ss.key === spotKey) s = ss; });
    if (!s) return;
    var cur = posterState[spotKey] || s.def;
    var i = 0;
    POSTER_CYCLE.forEach(function (p, pi) { if (p.key === cur) i = pi; });
    i = (i + dir + POSTER_CYCLE.length) % POSTER_CYCLE.length;
    posterState[spotKey] = POSTER_CYCLE[i].key;
    saveJSON("room-posters", posterState);
    applyPosters();
  }
  applyPosters();

  /* ---- HOOD RUN: the getaway corner by the door ------------------------------- */
  // A stuffed duffel bag with the take spilling out, and the safe it came out of.
  // Set HOOD_RUN_URL when the game goes live and this becomes a doorway on its own.
  var hoodG = new THREE.Group();
  var canvasM = mat(0x2f3a44, 0.95), canvasDark = mat(0x222a32, 0.95);
  var billM = mat(0x5f8a5c, 0.85), bandM = mat(0xc9a35c, 0.6);
  var duffel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 18), canvasM);
  duffel.rotation.z = Math.PI / 2; duffel.position.set(0, 0.13, 0); duffel.castShadow = true; hoodG.add(duffel);
  [-0.17, 0.17].forEach(function (x) { // the rounded ends
    var cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), canvasM);
    cap.position.set(x, 0.13, 0); cap.scale.x = 0.55; hoodG.add(cap);
  });
  var zip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.05), canvasDark);
  zip.position.set(0, 0.253, 0.01); hoodG.add(zip);
  [-0.07, 0.07].forEach(function (x) { // carry handles
    var hn = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 14, Math.PI), canvasDark);
    hn.position.set(x, 0.25, 0); hn.rotation.y = Math.PI / 2; hoodG.add(hn);
  });
  // The bag knows how your runs are going (same-origin hr-save), the way the toy
  // chest knows about the campaign: the further you've got, the bigger the take.
  var hrNow = (function () {
    var s = readSave("hr-save", function (m) { return m; });
    if (!s) return { played: false, best: 0, runs: 0 };
    return { played: !!((s.lifetime && s.lifetime.runs > 0) || s.bestDist > 0),
             best: s.bestDist || 0, runs: (s.lifetime && s.lifetime.runs) || 0 };
  })();
  var hrExtra = Math.min(4, Math.floor(hrNow.best / 500)); // a fresh bag holds four bundles; +1 per 500m, capped
  // the take: banded bundles, a couple still in the bag, a couple spilled on the carpet
  [[0.02, 0.28, 0.02, 0.5], [-0.05, 0.29, -0.03, -0.3], [0.24, 0.026, 0.11, 1.1], [0.29, 0.026, -0.04, -0.6],
   [0.09, 0.30, -0.04, 0.9], [-0.16, 0.28, 0.04, -0.9], [0.34, 0.026, 0.17, 0.3], [0.19, 0.026, -0.15, -1.2]]
    .slice(0, 4 + hrExtra)
    .forEach(function (b) {
      var bundle = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.038, 0.05), billM);
      bundle.position.set(b[0], b[1], b[2]); bundle.rotation.y = b[3];
      bundle.rotation.z = b[1] < 0.1 ? 0 : 0.18; bundle.castShadow = true; hoodG.add(bundle);
      var band = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.041, 0.052), bandM);
      band.position.copy(bundle.position); band.rotation.copy(bundle.rotation); hoodG.add(band);
    });
  // the safe it all came out of, door swung open
  var safeG = new THREE.Group();
  var safeM = mat(0x39404a, 0.6), safeTrim = mat(0x8a8f98, 0.35);
  var safeBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.2), safeM);
  safeBody.position.y = 0.12; safeBody.castShadow = true; safeG.add(safeBody);
  var safeHole = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.19, 0.02), mat(0x14181e, 0.95));
  safeHole.position.set(0, 0.12, 0.1); safeG.add(safeHole);
  var safeDoor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.23, 0.03), safeM);
  safeDoor.position.set(0.2, 0.12, 0.16); safeDoor.rotation.y = -1.1; safeDoor.castShadow = true; safeG.add(safeDoor);
  var dial = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.018, 16), safeTrim);
  dial.rotation.x = Math.PI / 2; dial.position.set(0.24, 0.12, 0.19); dial.rotation.z = 0.6; safeG.add(dial);
  var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.02), mat(0xd9d9dd, 0.4));
  spoke.position.set(0.24, 0.12, 0.2); spoke.rotation.z = 0.6; safeG.add(spoke);
  safeG.position.set(-0.34, 0, -0.16); safeG.rotation.y = 0.45; hoodG.add(safeG);
  hoodG.position.set(-2.85, 0, 1.75); hoodG.rotation.y = 0.35; scene.add(hoodG);
  var hoodHint = !HOOD_RUN_URL ? "HOOD RUN — the take from City Trust · coming soon"
    : hrNow.played ? "HOOD RUN — " + Math.round(hrNow.best).toLocaleString() + " m best · go further"
    : "HOOD RUN — the Crosstown Dash · click to run";
  hoodG.traverse(function (o) {
    if (o.isMesh) clickable(o, "HOOD RUN", HOOD_RUN_URL ? go(HOOD_RUN_URL) : function () {
      try { kidSay("that one's not finished yet. soon, though.", 4); } catch (e) { }
      clickSfx(1100);
    }, hoodHint);
  });

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
  queueGLB("assets/props/kid.glb", function (g) {
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
        queueGLB(p[1], function (cg) {
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
    { x: 2.12, z: 1.05, act: "bed", seat: 1 },       // the bedside → climb up and lie down (may enter the bed's circle)
    { x: -2.42, z: 1.62, act: "fidget" },            // crouched over the duffel bag, counting it
    { x: 2.25, z: -1.72, act: "window" }             // between the chest and the TV, watching the world go by
  ];
  var KID_WINDOW = KID_STATIONS[KID_STATIONS.length - 1]; // the traffic outside can pull him over
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
    { x: -1.86, z: -0.32, r: 0.34 }, // the desk chair
    { x: -2.85, z: 1.75, r: 0.34 }   // the duffel bag + safe (index 7)
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
    // when the boombox is going, he can't help himself — dance on the rug.
    // and when something's crossing the window, it sometimes catches his eye.
    var s = (AUDIO.isOn() && kidActions.dance && Math.random() < 0.45)
      ? KID_DANCE
      : (typeof winEv === "object" && winEv && winEv.ev && Math.random() < 0.35)
      ? KID_WINDOW
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
    endTour(true);   // they've found their own way — the tour bows out
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
  // earned awards read normally; the rest show what they'd take, so the page is a
  // to-do list rather than a wall of question marks
  function ACH_HTML(res) {
    var got = {};
    res.earned.forEach(function (a) { got[a.id] = 1; });
    return PROFILE.ACHIEVEMENTS.map(function (a) {
      var have = !!got[a.id];
      return "<div class='nb-ach" + (have ? "" : " locked") + "'>" +
        "<span class='nb-ach-i'>" + (have ? a.icon : "·") + "</span>" +
        "<span><b>" + esc(a.name) + "</b><i>" + esc(have ? "earned" : a.hint) + "</i></span></div>";
    }).join("");
  }
  function fmtDur(sec) {
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h ? h + "h " + m + "m" : m + "m";
  }
  // Log the visit as soon as the room loads, not on the "step inside" click — you're
  // here either way, and the card read "days here 0" for anyone still on the card.
  PROFILE.touchVisit();

  /* ---- the cross-game snapshot ------------------------------------------------
   * Only the room can see every game at once (they all share this origin), so this
   * is where a player's whole shelf gets added up. Feeds the card and the awards. */
  function profileCtx() {
    var started = 0, complete = false, total = 0, perGame = [];
    for (var title in GAME_SAVES) {
      var p = gameProgress(title);
      var done = p ? p.done : 0, cap = (p && p.total) || 0;
      if (p && p.started) started++;
      if (cap && done >= cap) complete = true;
      total += done;
      perGame.push({ title: title, done: done, total: cap, started: !!(p && p.started), noun: p ? p.noun : "endings" });
    }
    var tt = ttCampaign();
    var hr = readSave("hr-save", function (m) { return m; });
    var tony = 0;
    ["brainball", "palm"].forEach(function (k) {   // Tony's games unlock by visiting
      try { if (localStorage.getItem("room-visited-" + k)) tony++; } catch (e) { }
    });
    var pst = PROFILE.profileState();
    return {
      perGame: perGame,
      gamesStarted: started + (tt.done + tt.secrets > 0 ? 1 : 0) + (hr && (hr.bestDist > 0) ? 1 : 0),
      gamesTotal: Object.keys(GAME_SAVES).length + 2,   // the stories, plus Age of Toys and Hood Run
      anyComplete: complete,
      totalEndings: total + tt.done + tt.secrets,
      toysMissions: tt.done + tt.secrets,
      hoodRuns: hr ? (hr.lifetime && hr.lifetime.runs) || (hr.bestDist > 0 ? 1 : 0) : 0,
      hoodBest: hr ? Math.round(hr.bestDist || 0) : 0,
      tonyVisits: tony,
      collectibles: collectiblesEarned(),
      collectiblesTotal: COLLECT.length,
      roomNamed: roomOwnerName(),
      savedRooms: roomSlots.length,
      visits: priorVisits + 1,
      days: PROFILE.daysVisited(),
      lateNight: pst.lateNight,
      first: pst.first,
      catPetted: (function () { try { return !!localStorage.getItem("room-cat-pet"); } catch (e) { return false; } })(),
      posterSwapped: !!(posterState.p1 || posterState.p2 || posterState.p3), // any frame ever changed
    };
  }
  function buildPages() {
    nbPages = [];
    // page 1: who you are across the whole shelf
    var c = profileCtx(), res = PROFILE.evaluate(c);
    var card = "<div class='nb-rank'>" + esc(PROFILE.rankFor(c)) + "</div>";
    if (c.roomNamed) card += nbRow("this room belongs to", esc(c.roomNamed));
    card += nbRow("endings found", c.totalEndings);
    card += nbRow("games opened", c.gamesStarted + " / " + c.gamesTotal);
    card += nbRow("treasures", c.collectibles + " / " + c.collectiblesTotal);
    card += nbRow("awards", res.earned.length + " / " + res.total);
    card += nbRow("days here", c.days + (c.first ? " · since " + c.first : ""));
    if (c.hoodBest) card += nbRow("furthest run", c.hoodBest + " m");
    nbPages.push({ title: "the shelf, so far", html: card });
    // page 2: the awards themselves
    var aw = ACH_HTML(res);
    nbPages.push({ title: "what you've done", html: aw });
    // page 3: the key ring — what's in your library (the storefront skeleton, made visible)
    var kr = "";
    for (var kt in GAME_KEYS) {
      var gk = GAME_KEYS[kt];
      kr += nbRow(kt, gameLocked(kt) ? "🎁 wrapped — " + gk.price : "🔑 on your ring");
    }
    kr += nbRow("Age of Toys", "🔑 came with the room");
    kr += nbRow("Hood Run", "🔑 came with the room");
    kr += nbRow("Brainrot", "🔑 came with the room");
    nbPages.push({ title: "the key ring", html: kr });
    var rows = [
      ["Choose Wisely", readSave("chooseWisely.meta.v2", function (m) { return countOf(m.endingsFound); }), 56],
      ["Nine Circles", readSave("nc_persist", function (m) { return countOf(m.endings); }), null],
      ["Still Breathing", readSave("sb_persist", function (m) { return countOf(m.endings); }), null],
      ["SOUTH", readSave("south_persist", function (m) { return countOf(m.endings); }), null],
      ["NOBODY", readSave("nobody_persist", function (m) { return countOf(m.endings); }), null],
      ["CURIOUSER", readSave("alice_persist", function (m) { return countOf(m.wakings); }), 8],
      ["DRACULA", readSave("dracula_persist", function (m) { return countOf(m.endings); }), 6],
      ["G for George", readSave("gg_persist", function (m) { return countOf(m.endings); }), 14],
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
    var hr = readSave("hr-save", function (m) { return m; });
    html += nbRow("Hood Run", hr && hr.bestDist > 0 ? Math.round(hr.bestDist) + " m best" : "no run yet");
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
  function showNotebook() { buildPages(); nbShow(0); PROFILE.markSeen(); }
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
      var sto = document.getElementById("store-ov");
      if (sto && sto.classList.contains("open")) { closeStore(); return; }
      if (decorMode) { decorSet(false); return; }
      document.getElementById("notebook").classList.remove("open");
      document.body.classList.remove("listing");
      return;
    }
    if (document.body.classList.contains("listing")) return; // the list has native tab order
    if (document.activeElement && document.activeElement.tagName === "INPUT") return; // typing your name in the drawer
    if (decorMode && decorKey(e)) return; // arrows nudge, [ ] spin, Del removes, ctrl+Z undoes
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
    if (post && post.setSize) post.setSize();
  });

  /* ============================================================================
   * MAKE IT YOURS — rearrange mode + THE SHOEBOX collection.
   * Rearrange: every big toy and most of the furniture can be dragged around the
   * floor (scroll or the toolbar spins it); the kid's obstacle map, his hand-tuned
   * stations, and the tied lights/halos all follow, and the layout persists.
   * The shoebox: every game leaves a unique little collectible behind once you've
   * earned it — display the ones you like, anywhere a surface will hold them.
   * ========================================================================== */

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
    // a pool of shade under it — parented, so dragging and spinning carry it along,
    // and putting the thing away in WHAT'S OUT hides its shadow with it
    if (cfg.kind !== "coll" && !cfg.flat) {
      var sr = cfg.shadowR || (cfg.r || 0.3) * 1.15;
      contactShadow(cfg.root, sr, cfg.shadowRZ || sr, cfg.shadowOp);
    }
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
  // Read the layout off the LIVE objects, never off localStorage — a snapshot taken
  // before the last save (mid-drag, or a programmatic move) would otherwise capture
  // a stale room, which silently breaks undo and share links.
  function currentLayout() {
    var out = {};
    movables.forEach(function (c) {
      if (c.kind === "coll") return;
      var r = c.root;
      if (Math.abs(r.position.x - c.def.x) > 0.01 || Math.abs(r.position.z - c.def.z) > 0.01 ||
          Math.abs(r.rotation.y - c.def.ry) > 0.01)
        out[c.key] = { x: +r.position.x.toFixed(3), z: +r.position.z.toFixed(3), ry: +r.rotation.y.toFixed(3) };
    });
    return out;
  }
  function persistLayout() { saveJSON("room-layout", currentLayout()); }
  function persistFor(cfg) {
    if (cfg.isSticker) persistStickers();
    else if (cfg.isFrame) saveJSON("room-posters", posterState);
    else if (cfg.kind === "coll") persistColl(cfg);
    else persistLayout();
  }

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
      if (ob.userData.__stk) return ob.userData.__stk.cfg; // a wall sticker
      if (ob.userData.__frame) return ob.userData.__frame; // a poster frame slides along the walls
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
    var st = document.getElementById("store-ov");
    if (st && st.classList.contains("open")) return true;   // the key card owns the pointer
    var nb = document.getElementById("notebook");
    if (nb && nb.classList.contains("open")) return true;   // no click-through on the open notebook
    if (!decorMode) return false;
    if (e.target && e.target.tagName !== "CANVAS") return true; // toolbar clicks aren't grabs
    setPointer(e);
    var cfg = decorPickMovable();
    decorSelect(cfg);
    if (cfg) {
      pushUndo(); // so a drag is undoable
      var p = (cfg.isSticker || cfg.isFrame) ? null : floorPoint();
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
    if (cfg.isSticker) { var wp = wallPoint(); if (wp) moveStickerTo(cfg.entry, wp); return; }
    if (cfg.isFrame) { var fp = wallPoint(); if (fp) moveFrameTo(cfg.spot, fp); return; }
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
    if (!cfg) return;
    if (cfg.isSticker) { scaleSticker(cfg.entry, e.deltaY > 0 ? -0.1 : 0.1); return; } // scroll resizes a sticker
    if (!cfg.rot) return;
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
      var isStk = !!cfg.isSticker;
      document.getElementById("dw-sel-name").textContent =
        isStk ? "a sticker — scroll to size, ⟲⟳ to spin" :
        cfg.isFrame ? cfg.label + " — drag it along any wall" : cfg.label;
      ["dw-rotl", "dw-rotr"].forEach(function (id) {
        var b = document.getElementById(id); if (b) b.disabled = !(isStk || cfg.rot); // stickers spin in-plane
      });
      var back = document.getElementById("dw-back"); if (back) back.textContent = isStk ? "remove" : "put back";
    }
  }
  // keyboard while decorating: arrows nudge the selection, [ ] spin it, Delete puts it
  // away, Ctrl/Cmd+Z undoes. (spinSelected/nudgeSelected/pushUndo etc. are hoisted.)
  function decorKey(e) {
    var k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "Z")) { e.preventDefault(); doUndo(); return true; }
    if (!selCfg) return false;
    if (k === "Delete" || k === "Backspace") {
      e.preventDefault(); pushUndo();
      if (selCfg.isSticker) { removeSticker(selCfg.entry); decorSelect(null); }
      else if (selCfg.isFrame) { // a frame goes back to its home spot
        if (posterState._pos) delete posterState._pos[selCfg.spot.key];
        framePlace(selCfg.spot); persistFor(selCfg);
      }
      else { applyMove(selCfg, selCfg.def.x, selCfg.def.z, selCfg.def.ry, selCfg.surface ? selCfg.def.y : null); persistFor(selCfg); }
      dwRender(); return true;
    }
    if (k === "[" || k === ",") { e.preventDefault(); spinSelected(0.15); return true; }
    if (k === "]" || k === ".") { e.preventDefault(); spinSelected(-0.15); return true; }
    var A = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (A) { e.preventDefault(); nudgeSelected(A[0] * (e.shiftKey ? 0.02 : 0.06), A[1] * (e.shiftKey ? 0.02 : 0.06)); return true; }
    return false;
  }
  function nudgeSelected(dx, dy) {
    if (!selCfg) return;
    if (selCfg.isFrame) { // arrows slide a frame along its wall
      var sk = selCfg.spot.key, g0 = selCfg.root;
      if (!posterState._pos) posterState._pos = {};
      var fw = (posterState._pos[sk] && posterState._pos[sk].w) ||
        (Math.abs(g0.position.z + 2.53) < 0.1 ? "back" : g0.position.x < 0 ? "left" : "right");
      var fp = posterState._pos[sk] || { w: fw, x: g0.position.x, y: g0.position.y, z: g0.position.z };
      fp.y = clamp(fp.y - dy, 0.62, 2.85);
      if (fw === "back") fp.x = clamp(fp.x + dx, -2.2, 2.2);
      else fp.z = clamp(fp.z + (fw === "left" ? dx : -dx), -2.2, 2.2);
      posterState._pos[sk] = fp;
      framePlace(selCfg.spot); persistFor(selCfg);
      return;
    }
    if (selCfg.isSticker) {
      var e = selCfg.entry;
      e.y = clamp(e.y - dy, 0.5, 3.0);                                  // up arrow raises
      if (e.wall === "back") e.x = clamp(e.x + dx, -2.2, 2.2);
      else e.z = clamp(e.z + (e.wall === "left" ? dx : -dx), -2.2, 2.4); // horizontal along the side wall
      positionSticker(e); persistStickers();
      return;
    }
    applyMove(selCfg, selCfg.root.position.x + dx, selCfg.root.position.z + dy,
      selCfg.root.rotation.y, selCfg.surface ? selCfg.root.position.y : null);
    persistFor(selCfg);
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
    if (on) { dwTab(dwTabName); dismissNudge(); endTour(true); } // the drawer wakes up on whatever tab it was left on
    if (on && !decorSaidLine) {
      decorSaidLine = true;
      try { kidSay("rearranging? okay — mom will never believe it wasn't me.", 4.5); } catch (e) { }
    }
  }
  // First-time visitors might never spot the decorate button — pulse it once, with a
  // little callout, until they use it (then never again).
  function dismissNudge() {
    document.body.classList.remove("nudge-decor");
    var n = document.getElementById("decor-nudge"); if (n) n.classList.remove("show");
    try { localStorage.setItem("room-decor-seen", "1"); } catch (e) { }
  }
  function decorReset() {
    pushUndo(); // it throws away every position you set — that has to be recoverable
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
  registerMovable({ key: "chest", label: "the toy chest", root: chest, r: 0.62, rot: true, obs: 0, stations: [0],
    shadowR: 0.66, shadowRZ: 0.44 });
  registerMovable({ key: "rug", label: "the rug", root: rug, r: 1.5, stations: [2], flat: true, onMove: function (x, z) {
    rugCX = x; rugCZ = z;                    // the robot's patrol recenters every frame
    war.position.x = x; war.position.z = z;  // the army men are set up ON the rug
    KID_DANCE.x = x + 0.5; KID_DANCE.z = z + 0.62;
  } });
  registerMovable({ key: "bed", label: "the bed", root: bed, r: 0.82, obs: 1, stations: [7],
    shadowR: 0.62, shadowRZ: 1.02, onMove: function (x, z) {
    var dx = x - 2.92, dz = z - 1.1; // the climb waypoints ride with the bed (translate only — the lie clip owns the yaw)
    KID_BED.sideX = 2.12 + dx; KID_BED.sideZ = 1.05 + dz;
    KID_BED.upX = 2.62 + dx;
    KID_BED.x = 2.9 + dx; KID_BED.z = 0.88 + dz;
  } });
  registerMovable({ key: "desk", label: "the desk", root: desk, r: 0.82, obs: 2, stations: [4],
    shadowR: 1.12, shadowRZ: 0.58, attachObjs: [lampLight, gLamp, gBrain] });
  registerMovable({ key: "tv", label: "the TV", root: crt, r: 0.55, rot: true, obs: 5, stations: [1],
    shadowR: 0.62, shadowRZ: 0.42, attachObjs: [crtLight, gCrt] });
  registerMovable({ key: "nstand", label: "the nightstand", root: nstand, r: 0.3, rot: true, attachObjs: [gLava] });
  registerMovable({ key: "hoodbag", label: "the duffel bag", root: hoodG, r: 0.34, rot: true, obs: 7, stations: [8] });

  /* ---- WHO LIVES HERE: the pet system (2026-07-29) -------------------------------
   * One pet at a time, picked in the drawer (🧸 stuff tab), persisted in "room-pet"
   * and carried by share codes. The CAT is the Higgsfield plush bake — she doesn't
   * walk (curled mesh, no rig; the rig library is biped-only), she BLINKS between
   * perches. The other three are procedural in the room's toy style: the TURTLE
   * genuinely walks the floor, the FISH orbits a bowl on the TV stand, the HAMSTER
   * rolls his ball like a very small roomba. All of them can be petted. */
  var petKind = (function () { try { return localStorage.getItem("room-pet") || "cat"; } catch (e) { return "cat"; } })();
  if (["cat", "turtle", "fish", "hamster", "none"].indexOf(petKind) < 0) petKind = "cat";
  var PET_LABEL = { cat: "the cat", turtle: "the turtle", fish: "the fish", hamster: "the hamster", none: "no pet" };
  var catG = null, catSpot = "bed", catNextMove = 1e9, catPetOnce = false, catNoticed = false;
  var catAnim = "sleep", catAnimT = 0; // procedural life: dream-twitch, wake-stretch, pet-wiggle
  var CAT_OB = { x: 0, z: 0, r: 0 }; // the shared pet obstacle (cat-on-rug / turtle / hamster)
  KID_OBSTACLES.push(CAT_OB);
  var catV = new THREE.Vector3();
  function catSpotPos(which) {
    if (which === "rug") return { x: rug.position.x + 0.62, y: 0.02, z: rug.position.z + 0.42 };
    if (which === "bean" && movableByKey.bean) {
      var b = movableByKey.bean.root.position;
      return { x: b.x - 0.02, y: 0.33, z: b.z + 0.04 };
    }
    catV.set(0.13, 0, 0.54); bed.localToWorld(catV); // the foot corner — clear of where the kid lies
    return { x: catV.x, y: 0.42, z: catV.z };        // KID_BED.upY: the mattress top
  }
  function petSyncOb() { // the kid walks around whoever is actually on the floor
    var r = 0;
    if (!(outState && outState.cat)) { // outState is declared later in the file — boot-order safe
      if (petKind === "cat" && catG && catG.visible && catSpot === "rug") r = 0.30;
      else if (petKind === "turtle" && turtleG && turtleG.visible) r = 0.20;
      else if (petKind === "hamster" && hamG && hamG.visible) r = 0.16;
    }
    CAT_OB.r = r;
  }
  var catSyncOb = petSyncOb; // the cat paths predate the menagerie
  function catSettle() { // glue her to the current perch (called every frame — furniture moves)
    if (!catG) return;
    var p = catSpotPos(catSpot);
    catG.position.set(p.x, p.y, p.z);
    CAT_OB.x = p.x; CAT_OB.z = p.z;
  }
  function catRelocate() {
    var spots = ["bed", "bed", "bed", "rug", "bean"]; // she has a favorite
    var next = spots[(Math.random() * spots.length) | 0];
    catNextMove = performance.now() / 1000 + 200 + Math.random() * 260;
    if (next === catSpot) return;
    catSpot = next;
    catG.visible = false; // blink out…
    setTimeout(function () {
      if (outState.cat) return; // hidden in the underbed box meanwhile — stay away
      catG.rotation.y = ({ bed: 2.3, rug: -0.8, bean: 0.7 })[catSpot] + (Math.random() - 0.5) * 0.6;
      catG.visible = true; // BEFORE catSyncOb — it reads visibility, and she must be solid the frame she lands
      catSettle(); catSyncOb();
      fadeInObject(catG); // …and she was always there
    }, 900 + Math.random() * 1400);
  }
  function catPet() {
    rumble(0.12); // the thunder generator makes a passable purr at this size
    clickSfx(500);
    catAnim = "wiggle"; catAnimT = 0; // a happy shiver under the hand
    try { localStorage.setItem("room-cat-pet", "1"); } catch (ec) { } // Friend of the cat
    if (!catPetOnce) {
      catPetOnce = true;
      try { kidSay("that's the cat. she came with the room. or we came with her.", 5); } catch (e) { }
    }
  }
  prop("assets/props/cat.glb", 0.26, 3.14, 0.42, 1.70, 2.3, function (wrap) {
    catG = wrap;
    wrap.traverse(function (o) { if (o.isMesh) clickable(o, "the cat", catPet, "the cat — do not wake"); });
    catG.visible = petKind === "cat" && !(outState && outState.cat); // she only comes out if she lives here
    catSettle(); petSyncOb();
    catNextMove = performance.now() / 1000 + 200 + Math.random() * 260;
  });

  /* ---- the procedural pets ---- */
  function petTouched() { try { localStorage.setItem("room-cat-pet", "1"); } catch (e) { } }
  // THE TURTLE: the only resident who actually walks. Slow wander between clear floor
  // spots; head bobs while moving; bumps (or pets) send him into his shell for a beat.
  var turtleG = null, turtle = { tx: 0, tz: 1.9, waitT: 2, headT: 0, moving: false, legP: 0 };
  function buildTurtle() {
    var g = new THREE.Group();
    var shellM = mat(0x3f6b45, 0.7), shellD = mat(0x2e5236, 0.75), skinM = mat(0x8a9a5c, 0.8);
    var shell = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), shellM);
    shell.scale.set(1.15, 0.62, 1.0); shell.position.y = 0.062; shell.castShadow = true; g.add(shell);
    var rim = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.098, 0.02, 16), shellD);
    rim.position.y = 0.036; g.add(rim);
    var headG = new THREE.Group(); headG.position.set(0, 0.05, 0.095); g.add(headG);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.05, 8), skinM);
    neck.rotation.x = Math.PI / 2.6; neck.position.z = 0.012; headG.add(neck);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), skinM);
    head.position.set(0, 0.022, 0.038); headG.add(head);
    [-1, 1].forEach(function (s) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), mat(0x1a1a1a, 0.4));
      eye.position.set(s * 0.014, 0.03, 0.055); headG.add(eye);
    });
    g.userData.head = headG;
    var legs = [];
    [[-0.06, 0.05], [0.06, 0.05], [-0.06, -0.06], [0.06, -0.06]].forEach(function (p) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.035, 8), skinM);
      leg.position.set(p[0], 0.018, p[1]); g.add(leg); legs.push(leg);
    });
    g.userData.legs = legs;
    var tail = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 6), skinM);
    tail.rotation.x = Math.PI / 2; tail.position.set(0, 0.035, -0.1); g.add(tail);
    g.position.set(-0.4, 0, 2.1);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; clickable(o, "the turtle", turtlePet, "the turtle — he'll get there"); } });
    return g;
  }
  function turtlePet() {
    turtle.headT = 1; turtle.waitT = Math.max(turtle.waitT, 2.5); turtle.moving = false;
    clickSfx(420); petTouched();
    if (!catPetOnce) { catPetOnce = true; try { kidSay("that's the turtle. he's been crossing the room since tuesday.", 5); } catch (e) { } }
  }
  function turtlePickTarget() {
    for (var i = 0; i < 12; i++) {
      var x = -3.0 + Math.random() * 6.0, z = -1.6 + Math.random() * 3.8, ok = true;
      for (var o = 0; o < KID_OBSTACLES.length; o++) {
        var ob = KID_OBSTACLES[o], dx = x - ob.x, dz = z - ob.z;
        if (ob.r > 0 && ob !== CAT_OB && dx * dx + dz * dz < (ob.r + 0.3) * (ob.r + 0.3)) { ok = false; break; }
      }
      if (ok) { turtle.tx = x; turtle.tz = z; return true; }
    }
    return false;
  }
  // THE FISH: a bowl on the TV stand; she orbits, wiggles, and darts when tapped.
  var fishG = null, fish = { a: 0, dart: 0 };
  function buildFish() {
    var g = new THREE.Group();
    var bowl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 14, 0, Math.PI * 2, 0.5, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xbfe8e0, roughness: 0.1, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
    bowl.position.y = 0.075; g.add(bowl);
    var water = new THREE.Mesh(new THREE.CircleGeometry(0.075, 18),
      new THREE.MeshStandardMaterial({ color: 0x5ab8d8, roughness: 0.2, transparent: true, opacity: 0.5 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.115; g.add(water);
    var grav = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.014, 16), mat(0xc9b68a, 0.9));
    grav.position.y = 0.022; g.add(grav);
    var fg = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), mat(0xe8863a, 0.5));
    body.scale.set(1.5, 1, 0.8); fg.add(body);
    var tail = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.028, 6), mat(0xf0a05a, 0.5));
    tail.rotation.z = Math.PI / 2; tail.position.x = -0.036; fg.add(tail);
    fg.position.y = 0.075; g.add(fg);
    g.userData.fish = fg; g.userData.tail = tail;
    g.traverse(function (o) { if (o.isMesh) clickable(o, "the fish", fishPet, "the fish — thinks about the ocean"); });
    return g;
  }
  function fishPet() {
    fish.dart = 1; clickSfx(1900); petTouched();
    if (!catPetOnce) { catPetOnce = true; try { kidSay("that's the fish. she has seen things. bowl things.", 5); } catch (e) { } }
  }
  function fishSettle() { // the bowl rides the TV stand
    if (!fishG) return;
    var tv = movableByKey.tv;
    if (tv) fishG.position.set(tv.root.position.x + 0.38, 0.442, tv.root.position.z + 0.24);
  }
  // THE HAMSTER: a clear ball, a small determined pilot, no brakes.
  var hamG = null, ham = { ang: 0.8, speed: 0.32 };
  function buildHamster() {
    var g = new THREE.Group();
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8ecff, roughness: 0.15, transparent: true, opacity: 0.3 }));
    ball.position.y = 0.085; g.add(ball);
    g.userData.ball = ball;
    var hg = new THREE.Group(); hg.position.y = 0.048; hg.scale.setScalar(1.3); g.add(hg);
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), mat(0xd8a86a, 0.85));
    body.scale.set(1.15, 0.9, 1); body.position.y = 0.012; hg.add(body);
    var rump = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), mat(0xf0e2c8, 0.85));
    rump.position.set(0, 0.006, -0.02); hg.add(rump);
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), mat(0xb8875a, 0.8));
      ear.position.set(s * 0.018, 0.045, 0.02); hg.add(ear);
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 6), mat(0x1a1a1a, 0.4));
      eye.position.set(s * 0.013, 0.026, 0.035); hg.add(eye);
    });
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), mat(0xe89aa0, 0.6));
    nose.position.set(0, 0.018, 0.042); hg.add(nose);
    g.userData.pilot = hg;
    g.position.set(0.9, 0, 2.3);
    g.traverse(function (o) { if (o.isMesh) clickable(o, "the hamster", hamPet, "the hamster — places to be"); });
    return g;
  }
  function hamPet() {
    ham.speed = 0.85; ham.ang += (Math.random() - 0.5) * 2; // spooked into the fast lane
    clickSfx(640); petTouched();
    if (!catPetOnce) { catPetOnce = true; try { kidSay("that's the hamster. the ball was his idea.", 5); } catch (e) { } }
  }
  function petGroup(kind) {
    return kind === "cat" ? catG : kind === "turtle" ? turtleG : kind === "fish" ? fishG : kind === "hamster" ? hamG : null;
  }
  function setPet(kind) {
    if (["cat", "turtle", "fish", "hamster", "none"].indexOf(kind) < 0) kind = "cat";
    petKind = kind;
    try { localStorage.setItem("room-pet", kind); } catch (e) { }
    // build lazily, then show only the resident
    if (kind === "turtle" && !turtleG) { turtleG = buildTurtle(); scene.add(turtleG); turtlePickTarget(); }
    if (kind === "fish" && !fishG) { fishG = buildFish(); scene.add(fishG); fishSettle(); }
    if (kind === "hamster" && !hamG) { hamG = buildHamster(); scene.add(hamG); }
    ["cat", "turtle", "fish", "hamster"].forEach(function (k) {
      var g = petGroup(k);
      if (g) g.visible = (k === kind) && !(outState && outState.cat); // boot-order safe
    });
    var g2 = petGroup(kind);
    if (g2 && g2.visible) fadeInObject(g2);
    petSyncOb();
    kbListDirty = true;
  }
  setPet(petKind); // build whoever the save says lives here (the cat arrives async regardless)

  /* ---- THE SHOEBOX: one collectible per game ------------------------------------ */
  // one collectible per game — have() reads the same-origin saves; Tony's three
  // unlock by walking through their doorway (go() stamps the visit).
  function anyOf(key, pickFn) { var v = readSave(key, pickFn); return v != null && v > 0; }
  var COLLECT = [
    // ⚠️ nothing homes on the WINDOWSILL — the toy chest + TV stand in front of that wall
    // hide it from the room camera entirely (Kyle: "hard to see or grab"). Small treasures
    // live on the surfaces the camera favors: the lamplit desk, the nightstand, the TV
    // stand. `anchor` makes home x/z OFFSETS from that movable's live position.
    { key: "bracelet", title: "the friendship bracelet", from: "CHOOSE WISELY", icon: "🧶",
      earn: "find an ending in CHOOSE WISELY", where: "on the TV stand",
      have: function () { return anyOf("chooseWisely.meta.v2", function (m) { return countOf(m.endingsFound); }); },
      anchor: "tv", home: { x: -0.44, y: 0.442, z: 0.27 }, build: COLL.buildBracelet },
    { key: "laurel", title: "the gold laurel", from: "NINE CIRCLES", icon: "🏵️",
      earn: "reach an ending in NINE CIRCLES", where: "on the nightstand, in the lava light",
      have: function () { return anyOf("nc_persist", function (m) { return countOf(m.endings); }); },
      // (and never the shelf top either — y 2.392 is above eye level, flat things vanish)
      anchor: "nstand", home: { x: -0.17, y: 0.552, z: 0.12 }, build: COLL.buildLaurel },
    { key: "compass", title: "the brass compass", from: "STILL BREATHING", icon: "🧭",
      earn: "survive an ordeal in STILL BREATHING", where: "on the desk, in the lamplight",
      have: function () { return anyOf("sb_persist", function (m) { return countOf(m.endings); }); },
      anchor: "desk", home: { x: 0.57, y: 0.851, z: 0.25 }, build: COLL.buildCompass },
    { key: "bottle", title: "the ship in a bottle", from: "SOUTH", icon: "⛵",
      earn: "bring a voyage home in SOUTH", where: "on the floor by the rug",
      have: function () { return anyOf("south_persist", function (m) { return countOf(m.endings); }); },
      home: { x: 1.9, y: 0, z: 0.35 }, build: COLL.buildBottle },
    { key: "horse", title: "the little wooden horse", from: "NOBODY", icon: "🐴",
      earn: "reach an ending in NOBODY", where: "up on top of the big shelf",
      have: function () { return anyOf("nobody_persist", function (m) { return countOf(m.endings); }); },
      home: { x: -1.85, y: 2.392, z: -2.32 }, build: COLL.buildHorse },
    { key: "watch", title: "the White Rabbit's watch", from: "CURIOUSER", icon: "⌚",
      earn: "wake from the dream in CURIOUSER", where: "on the nightstand, by the lava lamp",
      have: function () { return anyOf("alice_persist", function (m) { return countOf(m.wakings); }); },
      anchor: "nstand", home: { x: 0.16, y: 0.552, z: 0.10 }, build: COLL.buildWatch },
    { key: "inkwell", title: "the red inkwell", from: "DRACULA — THE RED INK", icon: "🖋️",
      earn: "decide the book's fate in DRACULA", where: "on the desk, by the lamp",
      have: function () { return anyOf("dracula_persist", function (m) { return countOf(m.endings); }); },
      anchor: "desk", home: { x: -0.55, y: 0.851, z: 0.30 }, build: COLL.buildInkwell },
    { key: "lens", title: "the magnifying glass", from: "ELEMENTARY", icon: "🔍",
      earn: "solve a case in ELEMENTARY", where: "on the floor, mid-room",
      have: function () { return anyOf("sherlock_persist", function (m) { return m && m.solved ? countOf(m.solved) : null; }); },
      home: { x: -1.35, y: 0, z: 1.9 }, build: COLL.buildLens },
    { key: "spitfire", title: "the model Spitfire", from: "G FOR GEORGE", icon: "✈️",
      earn: "finish a telling in G FOR GEORGE", where: "up on top of the big shelf",
      have: function () { return anyOf("gg_persist", function (m) { return countOf(m.endings); }); },
      home: { x: -1.05, y: 2.392, z: -2.32 }, build: COLL.buildSpitfire },
    { key: "crown", title: "the Shelf King's crown", from: "AGE OF TOYS", icon: "👑",
      earn: "win a campaign mission in AGE OF TOYS", where: "up on top of the big shelf",
      have: function () { var c = ttCampaign(); return c.done + c.secrets > 0; },
      home: { x: -2.25, y: 2.392, z: -2.32 }, build: COLL.buildCrown },
    { key: "brainball", title: "the squishy brain", from: "BRAINROT", icon: "🧠",
      earn: "visit BRAINROT — the brain on the desk", where: "on the TV stand, by the screen",
      have: function () { try { return !!localStorage.getItem("room-visited-brainball"); } catch (e) { return false; } },
      anchor: "tv", home: { x: -0.28, y: 0.452, z: 0.31 }, build: COLL.buildBrainball },
    { key: "goldbar", title: "the gold bar", from: "HOOD RUN", icon: "🟨",
      earn: "make a run in HOOD RUN", where: "in the getaway corner, by the safe",
      have: function () {
        return !!readSave("hr-save", function (m) {
          return (m && ((m.lifetime && m.lifetime.runs > 0) || m.bestDist > 0)) ? 1 : null;
        });
      },
      // was the shelf top (y 2.392) — a 1.7cm ingot up there is invisible from below
      home: { x: -2.55, y: 0, z: 1.35 }, build: COLL.buildGoldBar },
    { key: "palm", title: "the pocket island", from: "TIDEBOUND", icon: "🌴",
      earn: "visit TIDEBOUND — the toy island", where: "on the floor by the shoebox",
      have: function () { try { return !!localStorage.getItem("room-visited-palm"); } catch (e) { return false; } },
      home: { x: -0.9, y: 0, z: 2.8 }, build: COLL.buildPalm },
  ];
  var collByKey = {};
  COLLECT.forEach(function (c) { collByKey[c.key] = c; });
  var VISIT_KEYS = { "GameRepos/brainrot": "brainball", "GameRepos/tidebound": "palm" };
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
    var hx = c.home.x, hz = c.home.z;
    if (c.anchor && movableByKey[c.anchor]) { // anchored homes ride their furniture, even after a remodel
      var ar = movableByKey[c.anchor].root.position;
      hx = ar.x + c.home.x; hz = ar.z + c.home.z;
    }
    gp.position.set(hx, c.home.y || 0, hz);
    // a fingertip-sized grab proxy: these are 4-12cm trinkets, often across the room —
    // an invisible sphere makes them clickable/draggable without pixel-hunting.
    // (MeshBasicMaterial has no emissive, so the hover highlight can never light it up.)
    var proxy = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    proxy.position.y = 0.05; gp.add(proxy);
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

  /* ============================================================================
   * TIER 1 + 2 EXTRAS — wall stickers, room presets, undo, a shareable snapshot
   * and a shareable room LINK. A single roomStateBlob()/applyRoomState() serves
   * undo, presets, and the share codes at once.
   * ========================================================================== */

  /* ---- wall stickers ------------------------------------------------------------ */
  function stickerTex(draw) {
    return canvasTex(128, 128, function (g, w, h) { g.clearRect(0, 0, w, h); g.translate(w / 2, h / 2); draw(g); });
  }
  var STK_BY_ID = {}; STICKER_DESIGNS.forEach(function (d) { STK_BY_ID[d.id] = d; });
  var stickerTexCache = {};
  function stickerMat(id) {
    if (!stickerTexCache[id]) stickerTexCache[id] = stickerTex(STK_BY_ID[id].draw);
    return new THREE.MeshBasicMaterial({ map: stickerTexCache[id], transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }
  var WALLS = { back: back, left: left, right: right };
  var WALL_MESHES = [back, left, right];
  // world placement + facing for a hit on each wall (a hair off the surface, into the room)
  function wallPlace(wallName, x, y, z) {
    if (wallName === "back") return { x: clamp(x, -2.2, 2.2), y: clamp(y, 0.5, 3.0), z: -2.54, ry: 0 };
    if (wallName === "left") return { x: -3.54, y: clamp(y, 0.5, 3.0), z: clamp(z, -2.2, 2.4), ry: Math.PI / 2 };
    return { x: 3.54, y: clamp(y, 0.5, 3.0), z: clamp(z, -2.2, 2.2), ry: -Math.PI / 2 };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function wallPoint() { // raycast the three walls; report which one and where
    ray.setFromCamera(mouse, camera);
    var hits = ray.intersectObjects(WALL_MESHES, false);
    if (!hits.length) return null;
    var h = hits[0], wn = h.object === back ? "back" : h.object === left ? "left" : "right";
    return { wall: wn, place: wallPlace(wn, h.point.x, h.point.y, h.point.z) };
  }
  var stickers = [];
  function buildStickerMesh(e) {
    var s = 0.42 * (e.scale || 1);
    var m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), stickerMat(e.design));
    m.userData.__stk = e; e.mesh = m; scene.add(m);
    positionSticker(e);
    e.cfg = { isSticker: true, entry: e, label: "a sticker", root: m, rot: false, kind: "sticker" };
    return m;
  }
  var STK_NORMAL = { back: new THREE.Vector3(0, 0, 1), left: new THREE.Vector3(1, 0, 0), right: new THREE.Vector3(-1, 0, 0) };
  var _sq0 = new THREE.Quaternion(), _sq1 = new THREE.Quaternion(), _sz = new THREE.Vector3(0, 0, 1);
  function positionSticker(e) {
    var p = wallPlace(e.wall, e.x, e.y, e.z);
    e.x = p.x; e.y = p.y; e.z = p.z;
    e.mesh.position.set(p.x, p.y, p.z);
    // face the wall's normal, then roll the decal in its own plane by e.rot
    var n = STK_NORMAL[e.wall] || STK_NORMAL.back;
    _sq0.setFromUnitVectors(_sz, n);
    _sq1.setFromAxisAngle(n, e.rot || 0);
    e.mesh.quaternion.copy(_sq1.multiply(_sq0));
  }
  function rotateSticker(e, d) { e.rot = ((e.rot || 0) + d); positionSticker(e); persistStickers(); }
  function moveStickerTo(e, wp) {
    e.wall = wp.wall; e.x = wp.place.x; e.y = wp.place.y; e.z = wp.place.z;
    positionSticker(e);
  }
  function scaleSticker(e, d) {
    e.scale = clamp((e.scale || 1) + d, 0.5, 2.4);
    var s = 0.42 * e.scale; e.mesh.geometry.dispose(); e.mesh.geometry = new THREE.PlaneGeometry(s, s);
    persistStickers();
  }
  function addSticker(design, wp) {
    var place = wp ? wp.place : wallPlace("back", 1.35, 2.2, 0);
    var e = { design: design, wall: wp ? wp.wall : "back", x: place.x, y: place.y, z: place.z, scale: 1 };
    buildStickerMesh(e); stickers.push(e); persistStickers();
    return e;
  }
  function removeSticker(e) {
    var i = stickers.indexOf(e); if (i >= 0) stickers.splice(i, 1);
    if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); }
    persistStickers();
  }
  function persistStickers() {
    saveJSON("room-stickers", stickers.map(function (e) {
      return { d: e.design, w: e.wall, x: +e.x.toFixed(3), y: +e.y.toFixed(3), z: +e.z.toFixed(3), s: +(e.scale || 1).toFixed(2), r: +(e.rot || 0).toFixed(3) };
    }));
  }
  function rebuildStickers(list) {
    stickers.slice().forEach(function (e) { if (e.mesh) { scene.remove(e.mesh); e.mesh.geometry.dispose(); } });
    stickers = [];
    (list || []).forEach(function (o) {
      if (!STK_BY_ID[o.d]) return;
      var e = { design: o.d, wall: o.w || "back", x: o.x, y: o.y, z: o.z, scale: o.s || 1, rot: o.r || 0 };
      buildStickerMesh(e); stickers.push(e);
    });
  }
  rebuildStickers(loadJSON("room-stickers") || []);

  /* ---- one blob for the whole room: powers undo, presets, and share links ------- */
  function roomStateBlob() {
    return {
      v: 1, // schema version — decodeRoom tolerates older/newer
      l: currentLayout(), // live positions, not whatever was last written to storage
      p: JSON.parse(JSON.stringify(paintState)),
      o: JSON.parse(JSON.stringify(outState)),
      c: JSON.parse(JSON.stringify(shoeState.placed || {})),
      k: stickers.map(function (e) { return { d: e.design, w: e.wall, x: e.x, y: e.y, z: e.z, s: e.scale || 1, r: e.rot || 0 }; }),
      ps: JSON.parse(JSON.stringify(posterState)), // which print hangs in each frame
      pt: petKind, // who lives here
    };
  }
  function applyRoomState(b) {
    if (!b) return;
    if (b.pt) setPet(b.pt); // older blobs have no pet — leave the resident alone
    posterState = b.ps || {}; saveJSON("room-posters", posterState); applyPosters();
    paintState = b.p || {}; saveJSON("room-paint", paintState); applyPaint();
    outState = b.o || {}; saveJSON("room-out", outState); applyOut();
    var lay = b.l || {}; saveJSON("room-layout", lay);
    movables.forEach(function (c) {
      if (c.kind === "coll" || c.kind === "sticker") return;
      var sv = lay[c.key];
      if (sv) applyMove(c, sv.x, sv.z, sv.ry == null ? c.def.ry : sv.ry);
      else applyMove(c, c.def.x, c.def.z, c.def.ry);
    });
    var want = b.c || {};
    COLLECT.forEach(function (c) {
      var placed = !!shoeState.placed[c.key], wantIt = want[c.key] && c.have();
      if (wantIt && !placed) placeColl(c.key);
      else if (!wantIt && placed) unplaceColl(c.key);
    });
    Object.keys(want).forEach(function (k) {
      var cfg = movableByKey["coll:" + k], w = want[k];
      if (cfg && w && w.x != null) applyMove(cfg, w.x, w.z, w.ry, w.y);
    });
    rebuildStickers(b.k || []);
    if (decorMode) dwRender();
  }

  /* ---- undo (one step back through anything you just did) ------------------------ */
  var undoStack = [];
  function pushUndo() {
    undoStack.push(roomStateBlob());
    if (undoStack.length > 30) undoStack.shift();
    var u = document.getElementById("dw-undo"); if (u) u.disabled = false;
  }
  function doUndo() {
    if (!undoStack.length) { try { kidSay("nothing to undo — this is how it's always been.", 3.5); } catch (e) { } return; }
    applyRoomState(undoStack.pop());
    var u = document.getElementById("dw-undo"); if (u) u.disabled = !undoStack.length;
  }

  /* ---- My Rooms: keep several looks and switch between them ---------------------- */
  var ROOM_SLOT_MAX = 4;
  var roomSlots = loadJSON("room-slots") || [];
  function persistSlots() { saveJSON("room-slots", roomSlots); }
  function saveRoom(name) {
    if (roomSlots.length >= ROOM_SLOT_MAX) { try { kidSay("no more shelf space — delete one first.", 3.5); } catch (e) { } return false; }
    name = (name || "").replace(/[^\w '\-]/g, "").trim().slice(0, 16) || ("Room " + (roomSlots.length + 1));
    roomSlots.push({ name: name, blob: roomStateBlob() });
    persistSlots();
    try { kidSay("saved \"" + name + "\". switch back anytime.", 4); } catch (e) { }
    return true;
  }
  function loadRoom(i) {
    var s = roomSlots[i]; if (!s) return;
    pushUndo(); applyRoomState(s.blob);
    try { kidSay("here's \"" + s.name + "\" — hit undo if you miss the old one.", 4.5); } catch (e) { }
  }
  function delRoom(i) { if (roomSlots[i]) { roomSlots.splice(i, 1); persistSlots(); } }
  function renameRoom(i, name) {
    if (!roomSlots[i]) return;
    name = (name || "").replace(/[^\w '\-]/g, "").trim().slice(0, 16);
    if (name) { roomSlots[i].name = name; persistSlots(); }
  }
  // wipe every choice this visitor made — but never the collectibles they EARNED
  function startFresh() {
    pushUndo();
    saveJSON("room-layout", {});
    movables.forEach(function (c) { if (c.kind !== "coll") applyMove(c, c.def.x, c.def.z, c.def.ry); });
    Object.keys(shoeState.placed || {}).forEach(function (k) { unplaceColl(k); });
    rebuildStickers([]); persistStickers();
    outState = {}; saveJSON("room-out", outState); applyOut();
    pbWash();
    try { kidSay("clean slate. it feels bigger in here already.", 4.5); } catch (e) { }
  }
  function extractCode(str) { // accept a full share link OR a bare TR1. code
    if (!str) return null;
    var m = /room=([^&\s]+)/.exec(str);
    var raw = m ? decodeURIComponent(m[1]) : str.trim();
    return raw.slice(0, 4) === "TR1." ? raw : null;
  }
  function pasteRoom(str) {
    var code = extractCode(str), blob = code && decodeRoom(code);
    if (!blob) { try { kidSay("hmm — that code didn't work. paste the whole link?", 4); } catch (e) { } return false; }
    pushUndo(); applyRoomState(blob);
    try { kidSay("there it is — someone else's room, now yours to keep.", 4.5); } catch (e) { }
    return true;
  }

  /* ---- one-tap looks ------------------------------------------------------------- */
  var ROOM_PRESETS = {
    "cozy":  { walls: 2, carpet: 1, rug: 3, neon: 1, lights: "warm glow" },
    "gamer": { walls: 0, carpet: 3, rug: 0, neon: 3, lights: "ocean" },
    "sunny": { walls: 1, carpet: 2, rug: 2, neon: 2, lights: "classic" },
    "spooky":{ walls: 4, carpet: 3, rug: 0, neon: 4, lights: "candy" },
    "dreamy":{ walls: 4, carpet: 4, rug: 3, neon: 0, lights: "rainbow" },
  };
  function applyPreset(name) {
    var p = ROOM_PRESETS[name]; if (!p) return;
    pushUndo();
    for (var k in p) paintState[k] = p[k];
    saveJSON("room-paint", paintState); applyPaint();
    if (decorMode) dwRender();
    try { kidSay("ooh — " + name + ". i like it.", 3.5); } catch (e) { }
  }
  function surpriseMe() {
    pushUndo();
    paintState.walls = (Math.random() * PAINT.walls.opts.length) | 0;
    paintState.carpet = (Math.random() * PAINT.carpet.opts.length) | 0;
    paintState.rug = (Math.random() * PAINT.rug.opts.length) | 0;
    paintState.neon = (Math.random() * NEON_OPTS.length) | 0;
    var pk = Object.keys(LIGHT_PALS); paintState.lights = pk[(Math.random() * pk.length) | 0];
    // half the time the dice reach for a real material too — but only ones you've earned
    function texRoll(row, chance) {
      if (Math.random() >= chance) return 0;
      var pool = [];
      row.opts.forEach(function (o, i) { if (!matTexLocked(o)) pool.push(i); });
      return pool[(Math.random() * pool.length) | 0] || 0;
    }
    paintState.wallsTex = texRoll(MAT_TEX.walls, 0.5);
    paintState.carpetTex = texRoll(MAT_TEX.carpet, 0.4);
    paintState.rugTex = texRoll(MAT_TEX.rug, 0.35);
    var wvKeys = Object.keys(WINDOW_VIEWS);
    paintState.view = Math.random() < 0.4 ? wvKeys[(Math.random() * wvKeys.length) | 0] : "street";
    saveJSON("room-paint", paintState); applyPaint();
    if (decorMode) dwRender();
  }

  /* ---- THEMES: whole-room looks you earn by playing ------------------------------
   * A theme is a preset with the lights and the hour of the day thrown in — one tap
   * changes everything. The first is always yours; the rest unlock as you collect the
   * little trophies the games leave behind, so decorating stays a reason to keep playing.
   * paint keys index PAINT.*.opts / NEON_OPTS / LIGHT_PALS; hour is a LIGHT_MODES value
   * (null = follow your clock); screen is a SCREENSAVERS key. */
  var ROOM_THEMES = [
    { key: "asfound", name: "as found", icon: "🛏️", need: 0, reset: true, hour: null },
    { key: "cabin", name: "cozy cabin", icon: "🔥", need: 0,
      paint: { walls: 0, carpet: 1, wood: 1, door: 1, rug: 1, neon: 1, lights: "warm glow", screen: "stars",
               wallsTex: 3, carpetTex: 1, rugTex: 0, view: "woods" }, hour: "evening" }, // pine walls, pines outside
    { key: "arcade", name: "neon arcade", icon: "🕹️", need: 2,
      paint: { walls: 0, carpet: 3, wood: 4, door: 4, rug: 0, neon: 3, lights: "ocean", screen: "logo",
               wallsTex: 2, carpetTex: 0, rugTex: 0, view: "city" }, hour: "night" }, // the neon grid print, city lights out there
    { key: "attic", name: "haunted attic", icon: "🕸️", need: 4,
      paint: { walls: 0, carpet: 3, wood: 2, door: 4, rug: 0, neon: 4, lights: "candy", screen: "rain",
               wallsTex: 5, carpetTex: 2, rugTex: 0 }, hour: "night" }, // ghost wallpaper over bare boards
    { key: "sunroom", name: "sunroom", icon: "🌿", need: 6,
      paint: { walls: 0, carpet: 2, wood: 3, door: 3, rug: 2, neon: 2, lights: "classic", screen: "mystify",
               wallsTex: 4, carpetTex: 0, rugTex: 1, view: "sea" }, hour: "day" }, // daisies, racetrack rug, the sea out there
    { key: "winter", name: "winter room", icon: "❄️", need: 9,
      paint: { walls: 3, carpet: 3, wood: 3, door: 2, rug: 3, neon: 3, lights: "ocean", screen: "stars",
               wallsTex: 1, carpetTex: 1, rugTex: 0 }, hour: "dusk" }, // glow stars under a sky tint
  ];
  var THEME_BY_KEY = {};
  ROOM_THEMES.forEach(function (t) { THEME_BY_KEY[t.key] = t; });
  function collectiblesEarned() { var n = 0; COLLECT.forEach(function (c) { if (c.have()) n++; }); return n; }
  function themeUnlocked(t) { return !t.need || collectiblesEarned() >= t.need; }
  function applyTheme(key) {
    var t = THEME_BY_KEY[key]; if (!t) return;
    if (!themeUnlocked(t)) {
      try { kidSay("that one's locked — find " + (t.need - collectiblesEarned()) + " more treasures first.", 4); } catch (e) { }
      clickSfx(700); return;
    }
    pushUndo();
    if (t.reset) pbWash();
    else {
      var p = t.paint || {};
      ["walls", "carpet", "wood", "door", "rug", "neon", "lights", "screen",
       "wallsTex", "carpetTex", "rugTex", "view"].forEach(function (f) {
        if (p[f] != null) paintState[f] = p[f];
      });
      saveJSON("room-paint", paintState); applyPaint();
    }
    if ("hour" in t) setLightMode(t.hour);
    if (decorMode) dwRender();
    try { kidSay("the " + t.name + ". now we're talking.", 3.8); } catch (e) { }
  }

  /* ---- the snapshot (a real photo of your room, downloaded) ---------------------- */
  function shareRoom() {
    scene.updateMatrixWorld(true);
    var W = 1600, H = 1000, rd = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    rd.setPixelRatio(1); rd.setSize(W, H);
    rd.shadowMap.enabled = true; rd.shadowMap.type = THREE.PCFSoftShadowMap;
    // the photo has to match what you're looking at — a fresh renderer starts with no
    // tone mapping, which would hand you a flat, washed-out version of your own room
    rd.toneMapping = renderer.toneMapping;
    rd.toneMappingExposure = renderer.toneMappingExposure;
    rd.outputColorSpace = renderer.outputColorSpace;
    var cam = new THREE.PerspectiveCamera(52, W / H, 0.1, 50);
    cam.position.set(0, 1.72, 4.8); cam.lookAt(new THREE.Vector3(0, 1.28, -0.5));
    rd.render(scene, cam);
    var url;
    try { url = rd.domElement.toDataURL("image/png"); } catch (e) { rd.dispose(); return; }
    var nm = roomOwnerName();
    var a = document.createElement("a");
    a.href = url; a.download = (nm ? nm.replace(/\s+/g, "-").toLowerCase() + "s-room" : "my-room") + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    rd.dispose();
    try { kidSay("say cheese! it's in your downloads.", 4); } catch (e2) { }
  }

  /* ---- a link that rebuilds your exact room for whoever opens it ------------------ */
  function encodeRoom() {
    try { return "TR1." + btoa(unescape(encodeURIComponent(JSON.stringify(roomStateBlob())))); } catch (e) { return null; }
  }
  function decodeRoom(code) {
    try { if (!code || code.slice(0, 4) !== "TR1.") return null; return JSON.parse(decodeURIComponent(escape(atob(code.slice(4))))); } catch (e) { return null; }
  }
  function roomLink() {
    var c = encodeRoom();
    return location.origin + location.pathname + (c ? "?room=" + encodeURIComponent(c) : "");
  }
  function copyRoomLink() {
    var link = roomLink();
    function done() { try { kidSay("link copied — go show somebody your room.", 4.5); } catch (e) { } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { window.prompt("copy your room link:", link); });
    else window.prompt("copy your room link:", link);
  }

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
    "#dw-tabs{flex-wrap:wrap;gap:5px}" +
    "#dw-tabs button{flex:1 1 auto;min-width:46px;font-family:inherit;font-size:9px;letter-spacing:.02em;text-transform:uppercase;" +
    "color:var(--dim);background:none;border:1px solid var(--line);border-radius:7px;padding:7px 2px;" +
    "cursor:pointer;position:relative;white-space:nowrap}" +
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
    ".dw-card.locked{opacity:.62;cursor:default}" +
    ".dw-earn{font-size:8.5px;line-height:1.25;font-style:italic;color:var(--faint);margin-top:3px}" +
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
    // material swatches: little rectangles that show the actual print
    ".dw-sw.dw-tex button{width:44px;height:30px;border-radius:7px;background-size:cover;background-position:center;" +
    "background-color:#1a2130;color:#8fa0b8;font-size:13px;line-height:1}" +
    ".dw-sw.dw-tex button.locked{filter:grayscale(.85) brightness(.6)}" +
    // the poster-frame cyclers (◀ TITLE ▶)
    ".dw-cyc{display:flex;align-items:center;gap:6px}" +
    ".dw-cyc b{min-width:106px;text-align:center;font-size:11px;letter-spacing:0.4px;white-space:nowrap}" +
    ".dw-cyc button{width:26px;height:26px;border-radius:6px;border:1px solid var(--line);background:#1a2130;color:#cfd8e6;cursor:pointer}" +
    // thumbs are wider than cursors — the new small controls grow on touch screens
    "@media (pointer:coarse){.dw-cyc button{width:34px;height:34px}" +
    ".dw-sw.dw-tex button{width:52px;height:36px}.dw-sw button{width:34px;height:34px}}" +
    ".dw-name{display:flex;gap:7px;margin-top:4px}" +
    ".dw-name input{flex:1;font-family:Georgia,serif;font-size:13px;background:rgba(255,255,255,.06);" +
    "color:var(--bone);border:1px solid var(--line);border-radius:5px;padding:7px 9px;min-width:0}" +
    ".dw-name button,.dw-wide{font-family:'Inter',sans-serif;font-size:9.5px;letter-spacing:.1em;" +
    "text-transform:uppercase;color:var(--dim);background:none;border:1px solid var(--line);border-radius:5px;" +
    "padding:6px 10px;cursor:pointer}" +
    ".dw-wide{display:block;width:100%;margin-top:10px}" +
    "#dw-actions{display:flex;gap:6px;padding:8px 10px 0}" +
    "#dw-actions button{flex:1;font-family:inherit;font-size:9.5px;letter-spacing:.04em;color:var(--dim);" +
    "background:none;border:1px solid var(--line);border-radius:6px;padding:7px 2px;cursor:pointer}" +
    "#dw-actions button:hover:not(:disabled){color:var(--bone);border-color:var(--dim)}" +
    "#dw-actions button:disabled{opacity:.35;cursor:default}" +
    "#decor-nudge{position:fixed;top:100px;right:22px;z-index:7;font-family:'Inter',sans-serif;font-size:12px;" +
    "font-weight:600;color:#0a0c12;background:#ffd9a0;border-radius:8px;padding:8px 12px;max-width:180px;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.4);opacity:0;transition:opacity .5s;pointer-events:none}" +
    "#decor-nudge.show{opacity:1}" +
    "#decor-nudge:after{content:'';position:absolute;top:-6px;right:18px;border:6px solid transparent;" +
    "border-top:0;border-bottom-color:#ffd9a0}" +
    "body.decorating #decor-nudge,body.listing #decor-nudge,body.no3d #decor-nudge{display:none}" +
    "@keyframes decorPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,90,168,0)}50%{box-shadow:0 0 16px 3px rgba(255,90,168,.6)}}" +
    "body.nudge-decor #decor-btn{animation:decorPulse 1.8s ease-in-out infinite;color:#ffd9a0;border-color:#8a6f4a}" +
    "@media (prefers-reduced-motion:reduce){body.nudge-decor #decor-btn{animation:none;color:#ffd9a0;border-color:#8a6f4a}}" +
    "@media (max-width:640px),(max-aspect-ratio:9/10){#decor-drawer{top:auto;left:10px;right:10px;bottom:10px;" +
    "width:auto;max-height:52vh}}" +
    "#decor-btn:focus-visible,#decor-drawer button:focus-visible,.dw-name input:focus-visible{" +
    "outline:2px solid #ff5aa8;outline-offset:2px}";
  document.head.appendChild(decorStyle);
  document.body.insertAdjacentHTML("beforeend",
    '<button id="decor-btn" type="button">decorate</button>' +
    '<div id="decor-nudge">✨ make it yours — decorate the room</div>' +
    '<div id="decor-drawer" role="region" aria-label="decorate the room">' +
    '<div id="dw-tabs" role="tablist">' +
    '<button type="button" role="tab" data-tab="stuff">🧸 stuff<span id="dw-new" hidden>●</span></button>' +
    '<button type="button" role="tab" data-tab="paint">🎨 paint</button>' +
    '<button type="button" role="tab" data-tab="walls">🌟 walls</button>' +
    '<button type="button" role="tab" data-tab="shelf">📦 shelf</button>' +
    '<button type="button" role="tab" data-tab="saved">💾 saved</button></div>' +
    '<div id="dw-sel" hidden><span id="dw-sel-name"></span><span>' +
    '<button id="dw-rotl" type="button" aria-label="spin left">⟲</button>' +
    '<button id="dw-rotr" type="button" aria-label="spin right">⟳</button>' +
    '<button id="dw-back" type="button">put back</button></span></div>' +
    '<div id="dw-body" role="tabpanel"></div>' +
    '<div id="dw-actions"><button id="dw-undo" type="button" disabled>↶ undo</button>' +
    '<button id="dw-photo" type="button">📷 photo</button>' +
    '<button id="dw-link" type="button">🔗 share link</button></div>' +
    '<div id="dw-foot"><button id="dw-reset" type="button">reset the room</button>' +
    '<button id="dw-done" type="button">done</button></div>' +
    "</div>");
  var dwTabName = "stuff";
  function dwTab(name) {
    dwTabName = name || "stuff";
    // never carry a half-finished action across tabs — an armed "start fresh"
    // coming back live would wipe the room on one stray click
    renamingSlot = -1; freshArmed = false;
    document.querySelectorAll("#dw-tabs button").forEach(function (b) {
      var on = b.getAttribute("data-tab") === dwTabName;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
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
    el.innerHTML = dwTabName === "paint" ? dwPaintHTML() : dwTabName === "shelf" ? dwShelfHTML()
                 : dwTabName === "walls" ? dwWallsHTML() : dwTabName === "saved" ? dwSavedHTML() : dwStuffHTML();
    var inp = document.getElementById("dw-name-inp");
    if (inp) inp.value = paintState.name || "";
  }
  var renamingSlot = -1, freshArmed = false; // "start fresh" asks twice before it wipes
  function dwSavedHTML() {
    var html = '<div class="dw-hint">keep different looks — a cozy night, a battle station — and switch anytime</div>';
    html += '<div class="dw-name"><input id="dw-slot-name" maxlength="16" placeholder="name this room" autocomplete="off" spellcheck="false">' +
      '<button type="button" data-act="saveroom">save</button></div>';
    html += '<div class="dw-sec">saved rooms (' + roomSlots.length + " / " + ROOM_SLOT_MAX + ")</div>";
    if (!roomSlots.length) html += '<div class="dw-hint">nothing saved yet — name this one and hit save</div>';
    else roomSlots.forEach(function (s, i) {
      if (i === renamingSlot) { // this row is being renamed in place
        html += '<div class="dw-name"><input id="dw-rename-inp" maxlength="16" value="' + esc(s.name) +
          '" autocomplete="off" spellcheck="false">' +
          '<button type="button" data-renameok="' + i + '">✓</button></div>';
        return;
      }
      html += '<div class="dw-row"><span>' + esc(s.name) + "</span><span>" +
        '<button type="button" data-loadroom="' + i + '">load</button> ' +
        '<button type="button" data-renameroom="' + i + '" aria-label="rename">✎</button> ' +
        '<button type="button" data-delroom="' + i + '" aria-label="delete">✕</button></span></div>';
    });
    html += '<div class="dw-sec">got a friend\'s room?</div>' +
      '<div class="dw-name"><input id="dw-paste" placeholder="paste a room link or code" autocomplete="off" spellcheck="false">' +
      '<button type="button" data-act="pasteroom">load it</button></div>';
    html += '<div class="dw-sec">start over</div>' +
      '<div class="dw-hint">resets this room to how you found it — your saved rooms and everything you\'ve earned stay put</div>' +
      '<button type="button" class="dw-wide" data-act="fresh">' +
      (freshArmed ? "tap again to reset this room" : "start fresh") + "</button>";
    return html;
  }
  document.getElementById("decor-btn").addEventListener("click", function () { decorSet(!decorMode); clickSfx(1300); });
  document.getElementById("dw-tabs").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (b) { dwTab(b.getAttribute("data-tab")); clickSfx(1400); }
  });
  document.getElementById("dw-rotl").addEventListener("click", function () { spinSelected(0.22); });
  document.getElementById("dw-rotr").addEventListener("click", function () { spinSelected(-0.22); });
  function spinSelected(d) {
    if (!selCfg) return;
    if (selCfg.isSticker) { rotateSticker(selCfg.entry, d); clickSfx(1500); }
    else if (selCfg.rot) { decorRotate(selCfg, d); clickSfx(1500); }
  }
  document.getElementById("dw-back").addEventListener("click", function () {
    if (!selCfg) return;
    pushUndo();
    if (selCfg.isSticker) { removeSticker(selCfg.entry); decorSelect(null); dwRender(); clickSfx(900); return; }
    if (selCfg.isFrame) {
      if (posterState._pos) delete posterState._pos[selCfg.spot.key];
      framePlace(selCfg.spot); persistFor(selCfg); clickSfx(1100); return;
    }
    applyMove(selCfg, selCfg.def.x, selCfg.def.z, selCfg.def.ry, selCfg.surface ? selCfg.def.y : null);
    persistFor(selCfg); clickSfx(1100);
  });
  document.getElementById("dw-reset").addEventListener("click", function () { pushUndo(); decorReset(); clickSfx(900); });
  document.getElementById("dw-done").addEventListener("click", function () { decorSet(false); clickSfx(1300); });
  document.getElementById("dw-undo").addEventListener("click", function () { doUndo(); clickSfx(1100); });
  document.getElementById("dw-photo").addEventListener("click", function () { shareRoom(); clickSfx(1500); });
  document.getElementById("dw-link").addEventListener("click", function () { copyRoomLink(); clickSfx(1500); });
  (function decorNudge() { // pulse the decorate button once for first-timers, after they're inside
    var seen; try { seen = localStorage.getItem("room-decor-seen"); } catch (e) { }
    if (seen) return;
    if (tourEligible()) return; // the tour ends by lighting this button itself — don't do both
    var iv = setInterval(function () {
      var ec = document.getElementById("enter");
      if (ec && !ec.classList.contains("gone")) return; // still on the entry card
      clearInterval(iv);
      setTimeout(function () {
        try { if (localStorage.getItem("room-decor-seen")) return; } catch (e) { }
        if (decorMode) return;
        var n = document.getElementById("decor-nudge"); if (!n) return;
        document.body.classList.add("nudge-decor"); n.classList.add("show");
        setTimeout(dismissNudge, 11000); // auto-fade; also cleared the moment they open the drawer
      }, 4500);
    }, 2000);
  })();
  // Enter submits whichever field you're in — nobody should have to hunt for the button
  document.getElementById("dw-body").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target || e.target.tagName !== "INPUT") return;
    e.preventDefault();
    var by = { "dw-slot-name": '#dw-body button[data-act="saveroom"]',
               "dw-paste": '#dw-body button[data-act="pasteroom"]',
               "dw-rename-inp": "#dw-body button[data-renameok]",
               "dw-name-inp": "#dw-name-set" }[e.target.id];
    var btn = by && document.querySelector(by);
    if (btn) btn.click();
  });
  document.getElementById("dw-body").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    var key, act = b.getAttribute("data-act");
    if ((key = b.getAttribute("data-coll"))) {
      pushUndo();
      if (shoeState.placed[key]) unplaceColl(key);
      else {
        placeColl(key); clickSfx(1700);
        var pc = collByKey[key]; // say where it landed AND ping it — half the room is off-camera
        if (pc && pc.inst) pingAt(pc.inst.position.x, pc.inst.position.y + 0.06, pc.inst.position.z);
        if (pc && pc.cfg) pc.cfg.pop = 1; // the same little landing bounce a click gives it
        if (pc && pc.where) { try { kidSay(pc.title + " is out — " + pc.where + ".", 4.5); } catch (e8) { } }
      }
      dwRender();
    } else if ((key = b.getAttribute("data-paint"))) {
      pushUndo(); setPaint(key, +b.getAttribute("data-i")); dwRender(); clickSfx(1600);
    } else if ((key = b.getAttribute("data-tex"))) {
      var ti = +b.getAttribute("data-i"), topt = MAT_TEX[key].opts[ti];
      if (topt && matTexLocked(topt)) {
        var tneed = (topt[4] || 0) - collectiblesEarned();
        try { kidSay("that one's still packed away — find " + tneed + " more treasure" + (tneed === 1 ? "" : "s") + " first.", 4); } catch (e9) { }
        clickSfx(700);
      } else { pushUndo(); setPaint(key + "Tex", ti); dwRender(); clickSfx(1600); }
    } else if ((key = b.getAttribute("data-postspot"))) {
      pushUndo(); cyclePoster(key, +b.getAttribute("data-dir")); dwRender(); clickSfx(1600);
    } else if ((key = b.getAttribute("data-view"))) {
      pushUndo(); setPaint("view", key); dwRender(); clickSfx(1600);
    } else if ((key = b.getAttribute("data-pet"))) {
      pushUndo(); setPet(key); dwRender(); clickSfx(1500);
      var pl = { cat: "the cat's back on the bed.", turtle: "a turtle. he set off already.",
        fish: "a fish for the TV stand. she's doing laps.", hamster: "the hamster. mind your ankles.",
        none: "just us then. quieter this way." }[key];
      if (pl) { try { kidSay(pl, 4.5); } catch (ep) { } }
    } else if (b.getAttribute("data-neon") != null && b.getAttribute("data-neon") !== "") {
      pushUndo(); setPaint("neon", +b.getAttribute("data-neon")); dwRender(); clickSfx(1600);
    } else if ((key = b.getAttribute("data-lights"))) {
      pushUndo(); setPaint("lights", key); dwRender(); clickSfx(1600);
    } else if ((key = b.getAttribute("data-light"))) {
      setLightMode(key === "clock" ? null : key); dwRender(); clickSfx(1500);
    } else if ((key = b.getAttribute("data-screen"))) {
      pushUndo(); setPaint("screen", key); dwRender(); clickSfx(1700);
    } else if ((key = b.getAttribute("data-preset"))) {
      applyPreset(key); clickSfx(1600);
    } else if ((key = b.getAttribute("data-theme"))) {
      applyTheme(key); clickSfx(1600);
    } else if ((key = b.getAttribute("data-sticker"))) {
      pushUndo(); var ne = addSticker(key); decorSelect(ne.cfg); dwRender(); clickSfx(1700);
      try { kidSay("stuck it on the wall. drag it where you want.", 4); } catch (e0) { }
    } else if ((key = b.getAttribute("data-out"))) {
      pushUndo();
      outState[key] = outState[key] ? 0 : 1;
      if (!outState[key]) delete outState[key];
      saveJSON("room-out", outState);
      applyOut(); dwRender(); clickSfx(outState[key] ? 900 : 1700);
      if (outState[key] && !obSaidLine) {
        obSaidLine = true;
        try { kidSay("into the underbed box it goes. it'll keep.", 4); } catch (e2) { }
      }
    } else if (b.id === "dw-name-set") {
      pushUndo();
      paintState.name = document.getElementById("dw-name-inp").value;
      saveJSON("room-paint", paintState);
      applyPaint(); dwRender(); clickSfx(1700);
      var nm = roomOwnerName();
      if (nm) { try { kidSay(nm + "'s room. it's official — it's on the wall.", 4.5); } catch (e3) { } }
    } else if (act === "glow") {
      setGlow(!post.enabled); dwRender(); clickSfx(post.enabled ? 1700 : 900);
    } else if (act === "wash") {
      pushUndo(); pbWash(); dwRender(); clickSfx(900);
    } else if (act === "seasontoggle") {
      paintState.noSeason = !paintState.noSeason;
      if (!paintState.noSeason) delete paintState.noSeason;
      saveJSON("room-paint", paintState); applySeasonFX(); dwRender(); clickSfx(paintState.noSeason ? 900 : 1600);
    } else if (act === "surprise") {
      surpriseMe(); clickSfx(1700);
    } else if (act === "allout") {
      pushUndo(); outState = {};
      saveJSON("room-out", outState);
      applyOut(); dwRender(); clickSfx(1700);
    } else if (act === "clearstickers") {
      pushUndo(); rebuildStickers([]); persistStickers(); dwRender(); clickSfx(900);
    } else if (act === "saveroom") {
      var nm = document.getElementById("dw-slot-name");
      if (saveRoom(nm ? nm.value : "")) { dwRender(); clickSfx(1700); }
    } else if (act === "pasteroom") {
      var pv = document.getElementById("dw-paste");
      if (pasteRoom(pv ? pv.value : "")) { dwRender(); clickSfx(1700); } else clickSfx(700);
    } else if (act === "fresh") {
      if (!freshArmed) {
        freshArmed = true; dwRender(); clickSfx(900);
        setTimeout(function () { // disarm, and put the label back so it can't lie
          if (!freshArmed) return;
          freshArmed = false;
          if (decorMode && dwTabName === "saved") dwRender();
        }, 6000);
      }
      else { freshArmed = false; startFresh(); dwRender(); clickSfx(700); }
    } else if ((key = b.getAttribute("data-loadroom")) != null) {
      loadRoom(+key); dwRender(); clickSfx(1600);
    } else if ((key = b.getAttribute("data-delroom")) != null) {
      delRoom(+key); dwRender(); clickSfx(900);
    } else if ((key = b.getAttribute("data-renameroom")) != null) {
      renamingSlot = +key; dwRender();
      var ri = document.getElementById("dw-rename-inp"); if (ri) { ri.focus(); ri.select(); }
      clickSfx(1400);
    } else if ((key = b.getAttribute("data-renameok")) != null) {
      var rv = document.getElementById("dw-rename-inp");
      renameRoom(+key, rv ? rv.value : ""); renamingSlot = -1; dwRender(); clickSfx(1600);
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
        // say what it takes, on the card. This used to be a hover title only, which is
        // invisible on a phone and reads as "there's no way to get this thing".
        return '<div class="dw-card locked"><div class="i">?</div>' +
          '<div class="n">' + c.from + '</div>' +
          '<div class="dw-earn">' + c.earn + "</div></div>";
      }
      return '<button type="button" class="dw-card' + (placed ? " on" : "") + '" data-coll="' + c.key +
        '" aria-pressed="' + (placed ? "true" : "false") +
        '" title="' + c.title + " — " + (placed ? "out in the room · click to box it" : "click to put it in the room") + '">' +
        '<div class="i">' + c.icon + '</div><div class="n">' + c.title.replace(/^the /, "") + "</div></button>";
    }).join("");
    var petCards = [["cat", "🐱", "the cat"], ["turtle", "🐢", "the turtle"], ["fish", "🐟", "the fish"],
      ["hamster", "🐹", "the hamster"], ["none", "🚫", "no pet"]].map(function (p) {
      return '<button type="button" class="dw-card' + (petKind === p[0] ? " on" : "") + '" data-pet="' + p[0] +
        '" aria-pressed="' + (petKind === p[0] ? "true" : "false") + '"><div class="i">' + p[1] +
        '</div><div class="n">' + p[2] + "</div></button>";
    }).join("");
    return '<div class="dw-hint">drag anything in the room to move it · scroll spins it · shelves and sills catch the little things</div>' +
      '<div class="dw-sec">who lives here</div><div class="dw-grid">' + petCards + "</div>" +
      '<div class="dw-sec">the shoebox — ' + found + " of " + COLLECT.length + " found · " + out + " on display</div>" +
      '<div class="dw-grid">' + cards + "</div>";
  }
  function sbxRender() { if (decorMode && dwTabName === "stuff") dwRender(); }
  function sbxOpen() { decorSet(true); dwTab("stuff"); }
  function sbxClose() { decorSet(false); }

  // 2026-07-27: the gold bar + laurel used to home on the SHELF TOP — above eye level,
  // where the shelf's front edge hides flat things ("nothing spawned"). If a save still
  // holds that exact spot (never dragged), blank it so the new home applies. {} keeps
  // the key in `placed` (so it still restores) while placeColl falls through to home.
  // …and the WINDOWSILL emptied the same day: the chest + TV hide it from the camera.
  [["goldbar", -0.65, 2.392, -2.32], ["laurel", -1.45, 2.392, -2.32],
   ["laurel", 1.55, 1.021, -2.44], ["bracelet", 2.65, 1.021, -2.44],
   ["compass", 1.75, 1.021, -2.44], ["watch", 2.05, 1.021, -2.44],
   ["inkwell", 2.35, 1.021, -2.44], ["brainball", 2.95, 1.021, -2.44]].forEach(function (mh) {
    var sv = shoeState.placed[mh[0]];
    if (sv && sv.x != null && Math.abs(sv.x - mh[1]) < 0.02 &&
        Math.abs((sv.y || 0) - mh[2]) < 0.02 && Math.abs(sv.z - mh[3]) < 0.02)
      shoeState.placed[mh[0]] = {};
  });
  // restore what was on display, and count anything newly earned
  for (var pk in shoeState.placed) if (collByKey[pk]) placeColl(pk);
  sbxRefreshNew();
  // once you're inside, the kid mentions new arrivals (or your remodeling) — once
  (function kidNoticer() {
    // the room grew (the cat, real wallpaper, a poster per game) — RETURNING visitors
    // get told once; newcomers see it all as baseline, so their flag sets silently.
    var newsDue = false;
    try {
      if (!localStorage.getItem("room-news-1")) {
        var returning = !!(localStorage.getItem("room-toured") || localStorage.getItem("room-decor-seen"));
        if (!returning) for (var t in GAME_SAVES) { var pr = gameProgress(t); if (pr && pr.started) { returning = true; break; } }
        if (returning) newsDue = true;
        else localStorage.setItem("room-news-1", "1"); // a newcomer's first night IS the news
      }
    } catch (e9) { }
    var iv = setInterval(function () {
      var ec = document.getElementById("enter");
      if (ec && !ec.classList.contains("gone")) return; // still on the porch
      clearInterval(iv);
      setTimeout(function () {
        try {
          if (newsDue) {
            kidSay("while you were out: we got a cat. and real wallpaper. and every game printed a poster. it's all in the drawer.", 8);
            localStorage.setItem("room-news-1", "1");
            // "…in the drawer" points somewhere — light the DECORATE button so they find it
            if (!decorMode) {
              var nn = document.getElementById("decor-nudge");
              if (nn) { document.body.classList.add("nudge-decor"); nn.classList.add("show"); setTimeout(dismissNudge, 9000); }
            }
          }
          else if (sbxNew > 0) kidSay("psst — the shoebox has something new in it.", 5);
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
    wood: { label: "the woodwork", mats: [woodM, woodMSide], opts: [ // shelf, desk, chest, nightstand…
      ["as found", 0xffffff], ["honey", 0xf2dcae], ["walnut", 0xa6845e],
      ["ash", 0xdcd6cc], ["rosewood", 0xd8a898]] },
    // the door has no texture, so its swatches REPLACE the colour outright (a painted door)
    door: { label: "the door", mats: [doorM], replace: true, opts: [
      ["as found", 0xffffff], ["red", 0x9e3b30], ["blue", 0x3c5a86],
      ["green", 0x3f6b45], ["black", 0x2a2a2e]] },
  };
  /* Real MATERIAL swaps — actual wallpaper prints, floors and a second rug, not just
   * tints (the tints still multiply over whichever material is up). Each opt is
   * [label, file|null, repX, repY]; keys mirror PAINT rows so the swatches can sit
   * under their tint row. paintState.<k>Tex indexes opts; 0/absent = as found. */
  // opts: [label, file, repX, repY, treasuresNeeded] — materials unlock like themes do,
  // by collectibles earned (the play-to-decorate loop). 0/absent = free from night one.
  var MAT_TEX = {
    walls: { mats: [wallM, wallMSide], scales: [1, 0.78], label: "the wallpaper", opts: [
      // order is FROZEN (saved paintState + theme wallsTex index into it) — needs vary, order doesn't
      ["as found", null],
      ["glow stars", "wp-stars.webp", 4.4, 1.65, 0],
      ["arcade grid", "wp-arcade.webp", 3.2, 1.2, 5],
      ["knotty pine", "wp-pine.webp", 2.6, 1.0, 3],
      ["daisy field", "wp-floral.webp", 3.8, 1.45, 2],
      ["spooky cute", "wp-spooky.webp", 3.8, 1.45, 4],
      ["pinstripe", "wp-stripe.webp", 3.0, 1.15, 1]] },
    carpet: { mats: [floorM], scales: [1], label: "the floor", opts: [
      ["as found", null],
      ["shag pile", "fl-shag.webp", 3.2, 2.5, 1],
      ["oak boards", "fl-oak.webp", 3.0, 2.35, 3]] },
    rug: { mats: null /* rug.material, resolved at apply */, scales: [1], label: "the rug print", opts: [
      ["galaxy", null],
      ["racetrack", "rug-racetrack.webp", 1, 1, 2]] },
  };
  function matTexLocked(opt) { return (opt[4] || 0) > collectiblesEarned(); }
  var matTexCache = {};
  function texFor(file, rx, ry, cb) {
    var ck = file + "@" + rx.toFixed(2) + "x" + ry.toFixed(2);
    if (matTexCache[ck]) { cb(matTexCache[ck]); return; }
    texLoader.load("assets/tex/" + file, function (t) {
      // mirrored repeat hides the AI tiles' imperfect seams — every edge meets itself
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
      t.repeat.set(rx, ry); t.anisotropy = 8;
      matTexCache[ck] = t; cb(t);
    });
  }
  function applyMaterials() {
    for (var k in MAT_TEX) (function (k) {
      var row = MAT_TEX[k], opt = row.opts[paintState[k + "Tex"] || 0] || row.opts[0];
      (row.mats || [rug.material]).forEach(function (m, mi) {
        if (!opt[1]) { // as found — the original texture comes back (it may still be loading)
          m.userData.customMap = null;
          if (m.map !== (m.userData.baseMap || null)) { m.map = m.userData.baseMap || null; m.needsUpdate = true; }
          return;
        }
        m.userData.customMap = opt[1];
        texFor(opt[1], opt[2] * (row.scales[mi] || 1), opt[3], function (t) {
          if (m.userData.customMap !== opt[1]) return; // they clicked again while this loaded
          m.map = t; m.needsUpdate = true;
        });
      });
    })(k);
  }
  function matTexRowHTML(k) {
    var row = MAT_TEX[k], cur = paintState[k + "Tex"] || 0;
    var h = '<div class="dw-sw dw-tex">';
    row.opts.forEach(function (o, i) {
      var lk = matTexLocked(o); // locked prints still SHOW (dimmed) — a reason to keep playing
      h += '<button type="button" data-tex="' + k + '" data-i="' + i + '"' +
        (i === cur ? ' class="on"' : lk ? ' class="locked"' : "") +
        (o[1] ? ' style="background-image:url(assets/tex/' + o[1] + ')"' : "") +
        ' title="' + (lk ? "find " + o[4] + " treasure" + (o[4] === 1 ? "" : "s") + " to unlock " + o[0] : o[0]) +
        '" aria-label="' + row.label + ": " + o[0] + (lk ? " (locked)" : "") + '">' +
        (lk ? "🔒" : o[1] ? "" : "✕") + "</button>";
    });
    return h + "</div>";
  }
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
    // bigger canvas + a dark outline on every letter: this hangs right under the neon,
    // and washed-out crayon on cream disappears into all that pink
    var bT = canvasTex(1024, 128, function (g, w, h) {
      // the paper is unlit but tone mapping still lifts it, so the crayon has to be
      // deep to survive — pastel letters bleach out to nothing up here
      g.fillStyle = "#f2ead4"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#a89268"; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      var cols = ["#8f1d13", "#123f73", "#0f5c30", "#4e2263", "#9c4409"];
      g.font = "bold 66px Georgia, serif"; g.textBaseline = "middle";
      g.lineJoin = "round";
      var tw = 0;
      for (var m = 0; m < text.length; m++) tw += g.measureText(text[m]).width + 4;
      var x = Math.max(24, (w - tw) / 2);
      for (var i = 0; i < text.length; i++) {
        var yy = h / 2 + (i % 2 ? 5 : -5);
        g.strokeStyle = "#2b2118"; g.lineWidth = 5;
        g.strokeText(text[i], x, yy);              // outline first, so colour reads on any wall
        g.fillStyle = cols[i % cols.length];
        g.fillText(text[i], x, yy);
        x += g.measureText(text[i]).width + 4;
      }
    });
    nameMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.82, 0.23), new THREE.MeshBasicMaterial({ map: bT }));
    // z sits IN FRONT of the neon's additive halo (-2.46) so depth-testing keeps the
    // glow off the paper — behind it, the sign simply bleaches the name away
    nameMesh.position.set(-1.3, season === "bday" ? 2.30 : 2.50, -2.43); // the birthday banner outranks you one day a year
    nameMesh.rotation.z = 0.02;
    scene.add(nameMesh);
  }
  function applyPaint() {
    for (var k in PAINT) {
      var row = PAINT[k], opt = row.opts[paintState[k] || 0] || row.opts[0];
      var mats = row.mats || [rug.material], rep = row.replace;
      mats.forEach(function (m) {
        m.userData.tint = opt[1];
        if (rep) { // untextured: remember the original colour so "as found" can come back
          if (m.userData.base == null) m.userData.base = m.color.getHex();
          m.color.set(opt[1] === 0xffffff ? m.userData.base : opt[1]);
        } else if (m.map || opt[1] !== 0xffffff) m.color.set(opt[1]);
      });
    }
    if (!season) { // the calendar's own light shows (yule/spook/bday) always win
      var pal = LIGHT_PALS[paintState.lights || "classic"] || LIGHT_PALS.classic;
      for (var b = 0; b < bulbs.length; b++) {
        bulbs[b].material.color.set(pal[b % pal.length]);
        if (bulbs[b].userData.glow) bulbs[b].userData.glow.material.color.set(pal[b % pal.length]);
      }
    }
    applyMaterials(); // material swaps first conceptually, but tints above only touch .color so order is safe
    applyWindowView(); // what's out the window is paint too
    var wantSS = paintState.screen || "stars";           // the PC keeps whichever it was left on
    for (var s = 0; s < SCREENSAVERS.length; s++) if (SCREENSAVERS[s][0] === wantSS) ssKind = wantSS;
    applyNeonPaint();
    applyNameBanner();
    applySeasonFX();
  }
  function setPaint(key, val) {
    paintState[key] = val;
    saveJSON("room-paint", paintState);
    applyPaint();
  }

  /* ---- the paint tab (lives in the drawer — swatches preview live) --------------- */
  function dwPaintHTML() {
    var html = '<div class="dw-hint">same room, your colors — watch it change as you click</div>';
    var earned = collectiblesEarned();
    html += '<div class="dw-sec">whole-room looks — ' + earned + " treasure" + (earned === 1 ? "" : "s") + " found</div>";
    html += '<div class="dw-grid">';
    ROOM_THEMES.forEach(function (t) {
      var lk = !themeUnlocked(t);
      html += '<button type="button" class="dw-card' + (lk ? " locked" : "") + '" data-theme="' + t.key +
        '"' + (lk ? ' title="find ' + t.need + ' treasures to unlock"' : "") + '><div class="i">' +
        (lk ? "🔒" : t.icon) + '</div><div class="n">' + (lk ? t.need + " found" : t.name) + "</div></button>";
    });
    html += '<button type="button" class="dw-card" data-act="surprise"><div class="i">🎲</div><div class="n">surprise me</div></button>';
    html += "</div>";
    for (var k in PAINT) {
      var row = PAINT[k], cur = paintState[k] || 0;
      html += '<div class="dw-sec">' + row.label + '</div><div class="dw-sw">';
      row.opts.forEach(function (o, i) {
        html += '<button type="button" data-paint="' + k + '" data-i="' + i + '"' +
          (i === cur ? ' class="on"' : "") + ' style="background:' + hex6(o[1]) + '" title="' + o[0] +
          '" aria-label="' + row.label + ": " + o[0] + '"></button>';
      });
      html += "</div>";
      if (MAT_TEX[k]) html += matTexRowHTML(k); // the material swatches live right under their tint row
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
    html += '<div class="dw-sec">the hour of the day</div><div class="dw-grid">';
    LIGHT_MODES.forEach(function (m) {
      var on = lightMode === m;
      html += '<button type="button" class="dw-card' + (on ? " on" : "") + '" data-light="' + (m || "clock") +
        '" aria-pressed="' + (on ? "true" : "false") + '"><div class="i">' +
        (m === "day" ? "☀️" : m === "dusk" ? "🌇" : m === "evening" ? "🌆" : m === "night" ? "🌙" : "🕰️") +
        '</div><div class="n">' + (m ? LIGHT_LABEL[m] : "your clock") + "</div></button>";
    });
    html += "</div>";
    if (post.available) {
      html += '<div class="dw-sec">the lens</div>' +
        '<button type="button" class="dw-wide" data-act="glow" aria-pressed="' + (post.enabled ? "true" : "false") + '">' +
        (post.enabled ? "✨ the glow is on — turn it off" : "turn the glow back on") + "</button>";
    }
    html += '<div class="dw-sec">out the window</div><div class="dw-grid">';
    for (var wvk in WINDOW_VIEWS) {
      var wvv = WINDOW_VIEWS[wvk], wvon = (WINDOW_VIEWS[paintState.view] ? paintState.view : "street") === wvk;
      html += '<button type="button" class="dw-card' + (wvon ? " on" : "") + '" data-view="' + wvk +
        '" aria-pressed="' + (wvon ? "true" : "false") + '"><div class="i">' + wvv.icon +
        '</div><div class="n">' + wvv.label + "</div></button>";
    }
    html += "</div>";
    html += '<div class="dw-sec">the computer screen</div><div class="dw-grid">';
    SCREENSAVERS.forEach(function (s) {
      var on = ssKind === s[0];
      html += '<button type="button" class="dw-card' + (on ? " on" : "") + '" data-screen="' + s[0] +
        '" aria-pressed="' + (on ? "true" : "false") + '"><div class="i">' +
        ({ stars: "✨", logo: "📺", pipes: "🧵", mystify: "🔷", rain: "🟩" })[s[0]] +
        '</div><div class="n">' + s[1] + "</div></button>";
    });
    html += "</div>";
    if (seasonFX) {
      var seaOn = !paintState.noSeason;
      var seaName = { winter: "snow", spring: "petals", autumn: "leaves" }[seasonFX];
      html += '<div class="dw-sec">the season</div>' +
        '<button type="button" class="dw-wide" data-act="seasontoggle" aria-pressed="' + (seaOn ? "true" : "false") + '">' +
        (seaOn ? "❄ " + seaName + " is falling — turn it off" : "let the " + seaName + " fall").replace("❄", { winter: "❄", spring: "🌸", autumn: "🍂" }[seasonFX]) +
        "</button>";
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
    [wallM, wallMSide, floorM, rug.material, woodM, woodMSide].forEach(function (m) { m.userData.tint = null; m.color.set(0xffffff); });
    doorM.userData.tint = null; if (doorM.userData.base != null) doorM.color.set(doorM.userData.base);
    if (neonMesh && neonImg && neonImg.complete) { var t = new THREE.Texture(neonImg); t.needsUpdate = true; t.anisotropy = 8; neonMesh.material.map = t; neonMesh.material.color.set(0xffffff); neonMesh.material.needsUpdate = true; }
    applyPaint();
  }
  function pbOpen() { decorSet(true); dwTab("paint"); }
  function pbClose() { decorSet(false); }
  applyPaint(); // restore this visitor's colors + name

  /* ---- the walls tab (stickers — click to stick, then drag on the walls) --------- */
  function dwWallsHTML() {
    var html = '<div class="dw-hint">click one to stick it up, then drag it anywhere on the walls · scroll to resize</div>';
    html += '<div class="dw-grid">';
    STICKER_DESIGNS.forEach(function (d) {
      html += '<button type="button" class="dw-card" data-sticker="' + d.id + '" title="' + d.id + '"><div class="i">' + d.label + "</div></button>";
    });
    html += "</div>";
    html += '<div class="dw-sec">the poster frames — every game made one · drag a frame to move it</div>';
    POSTER_SPOTS.forEach(function (s) {
      var d = posterByKey[posterState[s.key]] || posterByKey[s.def];
      var nm = posterLocked(d) ? "🎁 " + d.label : d.label; // wrapped prints show their bow in the list too
      html += '<div class="dw-row"><span>' + s.label + "</span>" +
        '<span class="dw-cyc"><button type="button" data-postspot="' + s.key + '" data-dir="-1" aria-label="' + s.label + ': previous poster">◀</button>' +
        '<b>' + nm + "</b>" +
        '<button type="button" data-postspot="' + s.key + '" data-dir="1" aria-label="' + s.label + ': next poster">▶</button></span></div>';
    });
    html += '<div class="dw-sec">' + stickers.length + " sticker" + (stickers.length === 1 ? "" : "s") + " up right now</div>";
    if (stickers.length) html += '<button type="button" class="dw-wide" data-act="clearstickers">take them all down</button>';
    return html;
  }

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
    { key: "cat", sec: "toys", label: "the pet (they won't mind)",
      get: function () { return [petGroup(petKind)]; } },
    { key: "island", sec: "toys", label: "the toy island (TIDEBOUND)", obs: 3,
      get: function () { return movableByKey.island ? [movableByKey.island.root] : []; } },
    { key: "hoodbag", sec: "toys", label: "the duffel bag (HOOD RUN) + poster", obs: 7,
      get: function () { return [hoodG, posterHood]; } },
    { key: "brain", sec: "desk", label: "the brain (BRAINROT) + poster", halos: function () { return [gBrain]; },
      get: function () { return [brainG, posterBrainrot]; } },
    { key: "pc", sec: "desk", label: "the beige PC",
      get: function () { return [pc]; } },
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
    catSyncOb(); // her floor-obstacle follows her visibility (dynamic r — the generic obs path can't own it)
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
          '<button type="button" data-out="' + h.key + '"' + (hidden ? "" : ' class="on"') +
          ' aria-pressed="' + (hidden ? "false" : "true") + '">' +
          (hidden ? "put it out" : "out ✓") + "</button></div>";
      });
    });
    html += '<button type="button" class="dw-wide" data-act="allout">everything back out</button>';
    return html;
  }
  function obOpen() { decorSet(true); dwTab("shelf"); }
  function obClose() { decorSet(false); }
  applyOut(); // restore this visitor's shelf

  /* ============================================================================
   * THE STOREFRONT SKELETON — the ownership layer the game-key model will sit on.
   * EVERY game here is free today (free: true), so nothing is locked for anyone;
   * this is the machinery, wired and provable. A game that needs a key sits on
   * the shelf wrapped like a present until you redeem one. Add ?store=demo to
   * preview that whole flow without changing what real visitors see.
   * ========================================================================== */
  var storeDemo = /[?&]store=demo/.test(location.search);
  var ownedKeys = loadJSON("room-keys") || [];
  var GAME_KEYS = {};
  PLAY.forEach(function (p) {
    var sku = p.t.replace(/[^A-Z0-9]/g, "");
    GAME_KEYS[p.t] = { sku: sku, code: "KEY-" + sku, price: "$0.99", free: true, url: p.url, tip: p.tip, color: p.c };
  });
  function gameLocked(title) {
    var g = GAME_KEYS[title];
    if (!g) return false;
    if (g.free && !storeDemo) return false;              // today: the whole shelf is free
    return ownedKeys.indexOf(g.sku) < 0;
  }
  function ownKey(sku) {
    if (ownedKeys.indexOf(sku) < 0) { ownedKeys.push(sku); saveJSON("room-keys", ownedKeys); }
  }
  // a present: pastel paper, a ribbon, and a tag with nothing written on it yet
  function wrapPaperTex(seed) {
    return canvasTex(64, 64, function (g, w, h) {
      var hue = (seed * 47) % 360;
      g.fillStyle = "hsl(" + hue + ",42%,72%)"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "hsla(" + hue + ",50%,88%,0.9)"; g.lineWidth = 3;
      for (var i = -h; i < w; i += 14) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    });
  }
  function wrapSpineTex(seed) {
    return canvasTex(128, 512, function (g, w, h) {
      var hue = (seed * 47) % 360;
      g.fillStyle = "hsl(" + hue + ",42%,72%)"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "hsla(" + hue + ",50%,88%,0.9)"; g.lineWidth = 5;
      for (var i = -h; i < w; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
      g.fillStyle = "#e8dcc0"; g.fillRect(w * 0.28, 0, w * 0.44, h);          // ribbon
      g.fillStyle = "#c9a35c"; g.fillRect(w * 0.28, h * 0.42, w * 0.44, 10);  // knot
      g.save(); g.translate(w / 2, h * 0.62); g.rotate(-0.08);                 // gift tag
      g.fillStyle = "#f6efdd"; g.fillRect(-26, -20, 52, 40);
      g.strokeStyle = "#b7a888"; g.lineWidth = 2; g.strokeRect(-26, -20, 52, 40);
      g.fillStyle = "#5a4632"; g.font = "bold 30px Georgia, serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 0, 1);
      g.restore();
    });
  }
  var wrapCache = {};
  function wrappedMats(title, i) {
    if (wrapCache[title]) return wrapCache[title];
    var paper = new THREE.MeshStandardMaterial({ map: wrapPaperTex(i + 1), roughness: 0.75 });
    var spine = new THREE.MeshStandardMaterial({ map: wrapSpineTex(i + 1), roughness: 0.7 });
    return (wrapCache[title] = [paper, paper, paper, paper, spine, paper]);
  }
  function applyStore() {
    PLAY.forEach(function (p, i) {
      var bk = bookByTitle[p.t]; if (!bk) return;
      if (gameLocked(p.t)) {
        if (!bk.userData.__origMats) bk.userData.__origMats = bk.material;
        highlightOff(bk); // never leave a hover clone behind when the covers swap
        bk.material = wrappedMats(p.t, i);
        bk.userData.action = function () { openStore(p.t); };  // no __nav: the kid doesn't fetch what you don't own
        bk.userData.hint = p.t + " — still wrapped · click to get the key";
      } else if (bk.userData.__origMats) {
        highlightOff(bk);
        bk.material = bk.userData.__origMats; bk.userData.__origMats = null;
        bk.userData.action = go(p.url);
        bk.userData.hint = p.tip;
      }
    });
    applyPosters(); // the frames consult the same ownership — a redeemed key unwraps its poster too
    kbListDirty = true;
  }

  var storeStyle = document.createElement("style");
  storeStyle.textContent =
    "#store-ov{position:fixed;inset:0;z-index:26;display:none;align-items:center;justify-content:center;" +
    "background:rgba(5,7,10,.74)}" +
    "#store-ov.open{display:flex}" +
    ".st-card{width:min(380px,92vw);background:#12161f;color:var(--bone);border:1px solid var(--line);" +
    "border-radius:12px;padding:22px 24px;box-shadow:0 30px 80px rgba(0,0,0,.6);" +
    "font-family:'Inter',sans-serif;text-align:center}" +
    ".st-gift{font-size:34px}" +
    ".st-title{font-weight:800;font-size:19px;letter-spacing:.04em;margin:8px 0 4px}" +
    ".st-hook{font-family:Georgia,serif;font-style:italic;font-size:13px;color:var(--dim);line-height:1.5;margin-bottom:14px}" +
    ".st-price{font-size:22px;font-weight:700;color:#ffd9a0;margin-bottom:4px}" +
    ".st-soon{font-size:11px;color:var(--faint);margin-bottom:14px}" +
    ".st-row{display:flex;gap:7px;margin-bottom:10px}" +
    ".st-row input{flex:1;min-width:0;font-family:'Inter',sans-serif;font-size:13px;letter-spacing:.08em;" +
    "text-transform:uppercase;background:rgba(255,255,255,.06);color:var(--bone);border:1px solid var(--line);" +
    "border-radius:6px;padding:9px 10px}" +
    ".st-card button{font-family:'Inter',sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;" +
    "color:var(--dim);background:none;border:1px solid var(--line);border-radius:6px;padding:9px 13px;cursor:pointer}" +
    ".st-card button:hover{color:var(--bone);border-color:var(--dim)}" +
    ".st-msg{font-size:11.5px;min-height:16px;margin-bottom:10px}" +
    ".st-msg.bad{color:#ff8a8a}.st-msg.good{color:#8ae0a0}" +
    ".st-hint{font-size:10.5px;color:var(--faint);margin-top:8px;line-height:1.5}" +
    ".st-card input:focus-visible,.st-card button:focus-visible{outline:2px solid #ff5aa8;outline-offset:2px}";
  document.head.appendChild(storeStyle);
  document.body.insertAdjacentHTML("beforeend",
    '<div id="store-ov" role="dialog" aria-modal="true" aria-label="get a key"><div class="st-card">' +
    '<div class="st-gift">🎁</div>' +
    '<div class="st-title" id="st-title"></div>' +
    '<div class="st-hook" id="st-hook"></div>' +
    '<div class="st-price" id="st-price"></div>' +
    '<div class="st-soon">keys aren\'t on sale yet — this is a preview of how it will work</div>' +
    '<div class="st-msg" id="st-msg"></div>' +
    '<div class="st-row"><input id="st-code" placeholder="enter a key" autocomplete="off" spellcheck="false">' +
    '<button id="st-redeem" type="button">redeem</button></div>' +
    '<button id="st-close" type="button">maybe later</button>' +
    '<div class="st-hint" id="st-hint"></div>' +
    "</div></div>");
  var storeTitle = null;
  function openStore(title) {
    storeTitle = title;
    var g = GAME_KEYS[title]; if (!g) return;
    document.getElementById("st-title").textContent = title;
    document.getElementById("st-hook").textContent = g.tip;
    document.getElementById("st-price").textContent = g.price;
    document.getElementById("st-msg").textContent = ""; document.getElementById("st-msg").className = "st-msg";
    document.getElementById("st-code").value = "";
    document.getElementById("st-hint").textContent = storeDemo ? "preview mode — this one's key is " + g.code : "";
    document.getElementById("store-ov").classList.add("open");
    clickSfx(1200);
  }
  function closeStore() { document.getElementById("store-ov").classList.remove("open"); storeTitle = null; }
  function redeemKey(code) {
    var g = GAME_KEYS[storeTitle]; if (!g) return false;
    if (String(code || "").trim().toUpperCase() !== g.code) return false;
    ownKey(g.sku); applyStore();
    return true;
  }
  document.getElementById("st-redeem").addEventListener("click", function () {
    var msg = document.getElementById("st-msg");
    if (redeemKey(document.getElementById("st-code").value)) {
      msg.textContent = "unwrapped — it's yours."; msg.className = "st-msg good";
      clickSfx(1900);
      try { kidSay("a new one for the shelf! open it, open it.", 4.5); } catch (e) { }
      setTimeout(closeStore, 1100);
    } else {
      msg.textContent = "that key doesn't fit this one."; msg.className = "st-msg bad";
      clickSfx(700);
    }
  });
  document.getElementById("st-code").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("st-redeem").click(); }
  });
  document.getElementById("st-close").addEventListener("click", function () { closeStore(); clickSfx(1100); });
  applyStore();

  /* ============================================================================
   * THE TOUR — the kid shows a first-timer around.
   * Everything in this room is discoverable only by clicking things at random,
   * which means most of it never gets found. So on a first visit he walks the
   * circuit himself and points out the four doorways and the decorate button.
   * It never blocks anything: touch a doorway (or open the drawer) and it steps
   * aside for good. Returning visitors, and anyone who already has progress,
   * never see it.
   * ========================================================================== */
  var TOUR = [
    { x: -1.25, z: -1.5, say: "so — these are the books. every one's a whole story. pick any of them.", dur: 5.2 },
    { x: 1.4, z: -1.0, say: "that chest is the toy war. it keeps track of how your campaign's going.", dur: 5.0 },
    // stands off the bag rather than beside it: that corner is boxed in by the beanbag
    // and the island, and threading the gap took him ~50s of shuffling
    { x: -1.7, z: 1.75, say: "the bag by the door is the newest one. best not to ask.", dur: 4.4 },
    { x: 0.72, z: 2.05, say: "this shoebox holds everything the games leave behind. it fills up as you play.", dur: 5.4 },
    { x: 0.35, z: 1.4, say: "oh — and all of it moves. hit DECORATE up there: paint it, wallpaper it, hang the posters you like.", dur: 6.4, nudge: true },
  ];
  var tourOn = false, tourTimer = null, tourWatch = null;
  function tourEligible() {
    try {
      if (localStorage.getItem("room-toured")) return false;      // already shown once
      if (localStorage.getItem("room-decor-seen")) return false;  // they already found it themselves
    } catch (e) { return false; }
    for (var t in GAME_SAVES) { var p = gameProgress(t); if (p && p.started) return false; } // not a newcomer
    return true;
  }
  function endTour(quiet) {
    if (!tourOn) return;
    tourOn = false;
    clearTimeout(tourTimer); clearInterval(tourWatch);
    try { localStorage.setItem("room-toured", "1"); } catch (e) { }
    var b = document.getElementById("tour-skip"); if (b) b.remove();
    kidState.mode = "roam"; kidPickStation();
    if (!quiet) { try { kidSay("go on then. it's your room.", 3.6); } catch (e) { } }
  }
  function tourStep(i) {
    if (!tourOn) return;
    if (i >= TOUR.length) { endTour(); return; }
    var s = TOUR[i];
    kidState.mode = "roam"; kidState.station = null; kidState.ignoreObs = -1; kidState.walkT = 0;
    kidGoto(s.x, s.z);
    var started = performance.now();
    clearInterval(tourWatch);
    tourWatch = setInterval(function () {
      if (!tourOn) { clearInterval(tourWatch); return; }
      var dx = kid.position.x - s.x, dz = kid.position.z - s.z;
      var arrived = Math.sqrt(dx * dx + dz * dz) < 0.5;
      // he may be blocked, or the tab may be throttling his walk — say it anyway
      if (!arrived && performance.now() - started < 9000) return;
      clearInterval(tourWatch);
      kidSay(s.say, s.dur);
      if (s.nudge) {  // the last beat lights up the button he's talking about
        var n = document.getElementById("decor-nudge");
        document.body.classList.add("nudge-decor");
        if (n) n.classList.add("show");
      }
      tourTimer = setTimeout(function () { tourStep(i + 1); }, s.dur * 1000 + 500);
    }, 450);
  }
  function startTour() {
    if (tourOn || decorMode) return;
    tourOn = true;
    document.body.insertAdjacentHTML("beforeend",
      '<button id="tour-skip" type="button">skip the tour</button>');
    var sk = document.getElementById("tour-skip");
    sk.addEventListener("click", function () { endTour(true); clickSfx(1100); });
    kidSay("first time? come on, i'll show you round.", 4);
    tourTimer = setTimeout(function () { tourStep(0); }, 3800);
  }
  var tourStyle = document.createElement("style");
  tourStyle.textContent =
    "#tour-skip{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9;" +
    "font-family:'Inter',sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;" +
    "color:var(--dim);background:rgba(10,14,20,.72);border:1px solid var(--line);border-radius:6px;" +
    "padding:8px 14px;cursor:pointer}" +
    "#tour-skip:hover{color:var(--bone);border-color:var(--dim)}" +
    "body.listing #tour-skip,body.no3d #tour-skip,body.decorating #tour-skip{display:none}" +
    "#tour-skip:focus-visible{outline:2px solid #ff5aa8;outline-offset:3px}";
  document.head.appendChild(tourStyle);
  /* ============================================================================
   * WELCOME TO THE ROOM — the front page. The kid's tour walks the FLOOR; this
   * explains the OFFER: which style of game lives in which corner (the books are
   * stories you steer, the chest is the strategy game, the duffel is the runner…).
   * Opens once for everyone, then lives under the ❔ button forever. Each row's
   * "show me" closes the card and pings the real spot in the room.
   * ========================================================================== */
  var WELCOME_KEY = "room-welcome-seen";
  var welcomeWillShow = false;
  try { welcomeWillShow = !localStorage.getItem(WELCOME_KEY); } catch (e) { }
  var welcomeStyle = document.createElement("style");
  welcomeStyle.textContent =
    "#wel-ov{position:fixed;inset:0;z-index:27;display:none;align-items:center;justify-content:center;" +
    "background:rgba(5,7,10,.78)}" +
    "#wel-ov.open{display:flex}" +
    ".wel-card{width:min(460px,94vw);max-height:88vh;overflow:auto;background:#f2ead4;color:#2b2118;" +
    "border:1px solid #b7a888;border-radius:10px;padding:22px 24px 18px;transform:rotate(-.4deg);" +
    "box-shadow:0 30px 80px rgba(0,0,0,.65);font-family:Georgia,serif}" +
    ".wel-kick{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8a6f4a;text-align:center}" +
    ".wel-title{font-size:30px;font-weight:800;text-align:center;margin:2px 0 4px;letter-spacing:.04em}" +
    ".wel-sub{font-style:italic;font-size:13.5px;text-align:center;color:#5a4632;margin-bottom:14px;line-height:1.45}" +
    ".wel-row{display:flex;gap:10px;align-items:flex-start;margin-bottom:11px;font-size:13px;line-height:1.5}" +
    ".wel-ic{font-size:20px;line-height:1.2;flex:none}" +
    ".wel-row b{letter-spacing:.02em}" +
    ".wel-row button{flex:none;align-self:center;font-family:'Inter',sans-serif;font-size:9px;letter-spacing:.1em;" +
    "text-transform:uppercase;color:#5a4632;background:none;border:1px solid #b7a888;border-radius:6px;" +
    "padding:6px 9px;cursor:pointer;white-space:nowrap}" +
    ".wel-row button:hover{color:#2b2118;border-color:#5a4632}" +
    ".wel-foot{font-size:12px;font-style:italic;color:#5a4632;border-top:1px solid #d8ccae;padding-top:10px;" +
    "margin-top:4px;line-height:1.5}" +
    "#wel-close{display:block;width:100%;margin-top:12px;font-family:'Inter',sans-serif;font-size:11px;" +
    "letter-spacing:.14em;text-transform:uppercase;color:#f2ead4;background:#5a4632;border:none;" +
    "border-radius:7px;padding:11px;cursor:pointer}" +
    "#wel-close:hover{background:#6d5741}" +
    ".wel-hint{font-size:10px;text-align:center;color:#8a6f4a;margin-top:8px}" +
    "#wel-btn{position:fixed;top:22px;right:22px;z-index:6;font-family:'Inter',sans-serif;font-size:10px;" +
    "letter-spacing:.14em;text-transform:uppercase;color:var(--dim);background:rgba(10,14,20,.66);" +
    "border:1px solid var(--line);border-radius:6px;padding:9px 12px;cursor:pointer}" +
    "#wel-btn:hover{color:var(--bone);border-color:var(--dim)}" +
    "body.listing #wel-btn,body.no3d #wel-btn{display:none}" +
    "#wel-btn:focus-visible,.wel-card button:focus-visible{outline:2px solid #ff5aa8;outline-offset:2px}";
  document.head.appendChild(welcomeStyle);
  document.body.insertAdjacentHTML("beforeend",
    '<div id="wel-ov" role="dialog" aria-modal="true" aria-label="welcome to the room"><div class="wel-card">' +
    '<div class="wel-kick">a guide to</div>' +
    '<div class="wel-title">THE ROOM</div>' +
    '<div class="wel-sub">every toy in here opens a game.<br>different corners, different kinds of night:</div>' +
    '<div class="wel-row"><span class="wel-ic">📚</span><div><b>the bookshelf</b> — eleven story games. ' +
    "books you read and <i>steer</i>: shipwrecks and mountains, a shop that remembers you, Sherlock, Wonderland, " +
    'Dracula, the Odyssey, a prison camp, hell itself. every spine is its own night.</div>' +
    '<button type="button" data-wel="shelf">show me</button></div>' +
    '<div class="wel-row"><span class="wel-ic">🧸</span><div><b>the toy chest</b> — AGE OF TOYS, the big one. ' +
    'a real strategy game: raise a toy army, wage the bedroom war, keep a campaign going for weeks.</div>' +
    '<button type="button" data-wel="chest">show me</button></div>' +
    '<div class="wel-row"><span class="wel-ic">💰</span><div><b>the getaway corner</b> — HOOD RUN, the arcade runner. ' +
    'the duffel bag by the door. grab the take and go; it only ends when you do.</div>' +
    '<button type="button" data-wel="bag">show me</button></div>' +
    '<div class="wel-row"><span class="wel-ic">🖥️</span><div><b>the desk &amp; the island</b> — doorways to a ' +
    "friend's games: the brain on the desk is BRAINROT, the toy island is TIDEBOUND.</div>" +
    '<button type="button" data-wel="desk">show me</button></div>' +
    '<div class="wel-row"><span class="wel-ic">👟</span><div><b>the shoebox</b> — every game leaves a treasure ' +
    'behind when you play it. collect them, put them out on display; some unlock looks for the room itself.</div>' +
    '<button type="button" data-wel="shoebox">show me</button></div>' +
    '<div class="wel-row"><span class="wel-ic">🎨</span><div><b>and the room is yours</b> — hit DECORATE: ' +
    'move the furniture, paint and wallpaper, hang the game posters, pick a pet, then save your room or ' +
    'share it as a code.</div>' +
    '<button type="button" data-wel="decor">show me</button></div>' +
    '<div class="wel-foot">the notebook on the desk keeps your whole story — progress in every game, your ' +
    'awards, your keys. and if you ever want the walking version, the kid gives tours.</div>' +
    '<button id="wel-close" type="button">let me look around</button>' +
    '<div class="wel-hint">this guide stays under the ❔ button, top right</div>' +
    "</div></div>" +
    '<button id="wel-btn" type="button" title="welcome — a guide to the room">❔ guide</button>');
  var welcomeFirst = false;
  function welPing(key) {
    var mk = movableByKey;
    if (key === "shelf") { pingAt(-0.2, 1.75, -2.3); pingAt(0.8, 1.15, -2.3); }
    else if (key === "chest") pingAt(1.45, 0.62, -1.85);
    else if (key === "bag") { var h = mk.hoodbag; pingAt(h ? h.root.position.x : -2.85, 0.4, h ? h.root.position.z : 1.75); }
    else if (key === "desk") {
      var d = mk.desk; pingAt(d ? d.root.position.x + 0.4 : -1.95, 1.05, d ? d.root.position.z : -0.8);
      var isl = mk.island; if (isl && isl.root.visible) pingAt(isl.root.position.x, 0.5, isl.root.position.z);
    }
    else if (key === "shoebox") { var s = mk.shoebox; pingAt(s ? s.root.position.x : 0.72, 0.35, s ? s.root.position.z : 2.62); }
    else if (key === "decor") {
      var n = document.getElementById("decor-nudge");
      document.body.classList.add("nudge-decor");
      if (n) n.classList.add("show");
      setTimeout(dismissNudge, 8000);
    }
  }
  function welKey(e) { if (e.key === "Escape") { e.preventDefault(); closeWelcome(); } }
  function openWelcome(first) {
    welcomeFirst = !!first;
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch (e) { }
    document.getElementById("wel-ov").classList.add("open");
    document.addEventListener("keydown", welKey, true);
    var c = document.getElementById("wel-close"); if (c) c.focus();
  }
  function closeWelcome() {
    document.getElementById("wel-ov").classList.remove("open");
    document.removeEventListener("keydown", welKey, true);
    if (welcomeFirst) {
      welcomeFirst = false;
      if (tourEligible()) setTimeout(function () { startTour(); }, 1400); // the card hands off to the walking tour
      else { try { kidSay("that's the lay of the land. start anywhere — the books don't bite. mostly.", 5.5); } catch (e) { } }
    }
  }
  document.getElementById("wel-btn").addEventListener("click", function () { openWelcome(false); clickSfx(1400); });
  document.getElementById("wel-close").addEventListener("click", function () { closeWelcome(); clickSfx(1300); });
  document.getElementById("wel-ov").addEventListener("click", function (e) {
    if (e.target && e.target.id === "wel-ov") closeWelcome(); // the dim backdrop closes it too
    var b = e.target && e.target.closest ? e.target.closest("button[data-wel]") : null;
    if (b) { closeWelcome(); welPing(b.getAttribute("data-wel")); clickSfx(1600); }
  });
  (function welcomeWaiter() { // the front page opens once, just after you step inside
    if (!welcomeWillShow) return;
    var iv = setInterval(function () {
      var ec = document.getElementById("enter");
      if (ec && !ec.classList.contains("gone")) return;
      clearInterval(iv);
      setTimeout(function () {
        var seen = null; try { seen = localStorage.getItem(WELCOME_KEY); } catch (e) { }
        if (!seen) openWelcome(true);
      }, 2000);
    }, 1200);
  })();

  (function tourWaiter() {   // wait until they're actually inside the room
    if (welcomeWillShow) return; // the welcome card starts the tour itself when it closes
    if (!tourEligible()) return;
    var iv = setInterval(function () {
      var ec = document.getElementById("enter");
      if (ec && !ec.classList.contains("gone")) return;
      clearInterval(iv);
      setTimeout(function () { if (tourEligible()) startTour(); }, 2600);
    }, 1200);
  })();

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
          setKidAction(act === "window" ? "idle" : act, 0.35); // window-watching stands on the idle clip
          kidState.ignoreObs = -1;
          kidState.targetY = (kidState.station && kidState.station.y) || 0;
          kidState.glanceT = 2.5 + Math.random() * 4; // first look-at-you a beat after he settles
          kidState.mode = "act";
          kidState.t = (act === "dance" ? 11 : act === "sit" ? 8 : act === "window" ? 9 : 3.5) + Math.random() * 5;
          if (act === "window" && Math.random() < 0.65) { // a thought for whatever's out there
            var wline = { street: "still raining. good.", city: "somebody's always awake over there.",
              woods: "the owl's out there somewhere.", sea: "the tide's thinking it over.",
              space: "second star to the right. that one." }[curViewKey];
            if (wline) { try { kidSay(wline, 4.5); } catch (ew) { } }
          }
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
      } else if (actNow === "window") { // face the glass; one quick "you seeing this?" look back
        kidState.glanceT -= dt;
        if (kidState.glanceT <= 0 && kidState.glanceT > -1.3)
          kidFace(Math.atan2(camera.position.x - kid.position.x, camera.position.z - kid.position.z), 2.2);
        else {
          if (kidState.glanceT <= -1.3) kidState.glanceT = 6 + Math.random() * 6;
          kidFace(Math.atan2(2.35 - kid.position.x, -2.53 - kid.position.z), 3);
        }
      }
      // if the boombox stops mid-dance, wander off
      if (actNow === "dance" && !AUDIO.isOn()) kidState.t = Math.min(kidState.t, 0.5);
      // mid-tour he holds his spot instead of wandering off to the next station
      if (kidState.t <= 0 && !tourOn) { kidState.targetY = 0; kidState.mode = "roam"; kidPickStation(); }
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
    kidShadow.position.x = kid.position.x; kidShadow.position.z = kid.position.z;
    kidShadow.material.opacity = 0.5 * Math.max(0, 1 - Math.max(0, kid.position.y) * 3.2);
    if ((frameCount % 120) === 0) applyPhase(); // the room checks the clock
    // five more minutes: while the bed has you, the whole room breathes lower
    nap += (((t < napUntil) ? 1 : 0) - nap) * Math.min(1, dt * 1.8);
    var dim = 1 - 0.8 * nap;
    amb.intensity = phase.ambI * AMB_FLAT * (1 - 0.65 * nap);
    bounce.intensity = phase.ambI * BOUNCE_K * (1 - 0.65 * nap); // the bounce sleeps too
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
      for (var fm = 0; fm < fin.mats.length; fm++) {
        var fmm = fin.mats[fm];
        fmm.opacity = fin.t * (fmm.__designOp != null ? fmm.__designOp : 1); // glass fades up to glass, not to solid
      }
      if (fin.t >= 1) { fin.mats.forEach(function (m) { m.transparent = m.__wasTransparent; m.__fading = false; }); fadeIns.splice(fi, 1); }
    }
    for (var pi = pings.length - 1; pi >= 0; pi--) { // "look here" pulses breathe, then let go
      var pg = pings[pi]; pg.t += dt;
      var pf = pg.t / 2.6;
      if (pf >= 1) { scene.remove(pg.sp); pg.sp.material.dispose(); pings.splice(pi, 1); continue; }
      var ps = (0.42 + Math.sin(pg.t * 8) * 0.12) * Math.min(1, pf / 0.1);
      pg.sp.scale.set(ps, ps, 1);
      pg.sp.material.opacity = pf > 0.65 ? 0.9 * (1 - pf) / 0.35 : 0.9;
    }
    // the boombox thumps its cones to the tape (72bpm = 1.2 beats/s)
    var thump = AUDIO.isOn() ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.2)), 6) : 0;
    for (var bc = 0; bc < boomCones.length; bc++) {
      var cn = boomCones[bc];
      cn.position.z = cn.__z0 + thump * 0.012;
      cn.scale.set(1 + thump * 0.16, 1 + thump * 0.16, 1);
    }
    if (petKind === "cat" && catG && catG.visible) { // the cat: breathes, twitches in dreams, stretches before she moves
      catSettle();
      // the kid tiptoes past her once — the two living things acknowledge each other
      if (!catNoticed && t > 30 && kidState.mode === "roam") {
        var cdx = kid.position.x - catG.position.x, cdz = kid.position.z - catG.position.z;
        if (cdx * cdx + cdz * cdz < 1.1) {
          catNoticed = true;
          try { kidSay("shh — she's sleeping. she's always sleeping.", 4); } catch (ek) { }
        }
      }
      catAnimT += dt;
      if (catAnim === "stretch") {        // wake + arch, THEN blink to the next perch
        var cf = Math.min(1, catAnimT / 0.9), ca = Math.sin(cf * Math.PI);
        catG.scale.set(1 - ca * 0.05, 1 + ca * 0.10, 1 + ca * 0.16);
        if (cf >= 1) { catAnim = "sleep"; catG.scale.set(1, 1, 1); catRelocate(); }
      } else if (catAnim === "wiggle") {  // petted: a happy shiver, then back to sleep
        var wf = Math.min(1, catAnimT / 0.7);
        catG.rotation.z = Math.sin(wf * Math.PI * 4) * 0.05 * (1 - wf);
        catG.scale.set(1, 1 + Math.sin(wf * Math.PI) * 0.06, 1);
        if (wf >= 1) { catAnim = "sleep"; catG.rotation.z = 0; }
      } else if (catAnim === "twitch") {  // a paw going somewhere in a dream
        var tf = Math.min(1, catAnimT / 0.4);
        catG.rotation.z = Math.sin(tf * Math.PI * 6) * 0.018 * (1 - tf * 0.5);
        if (tf >= 1) { catAnim = "sleep"; catG.rotation.z = 0; }
      } else {
        catG.scale.set(1, 1 + Math.sin(t * 1.35) * 0.018, 1); // slow sleeping breath (base at y=0, so only the top rises)
        if (Math.random() < dt / 24) { catAnim = "twitch"; catAnimT = 0; }
        else if (t > catNextMove && !decorMode) { catAnim = "stretch"; catAnimT = 0; }
      }
    } else if (petKind === "turtle" && turtleG && turtleG.visible) { // the turtle: the room's only true pedestrian
      var T = turtle;
      T.headT = Math.max(0, T.headT - dt / 1.6);
      turtleG.userData.head.scale.setScalar(1 - T.headT * 0.8); // into the shell and back out
      turtleG.userData.head.position.z = 0.095 - T.headT * 0.06;
      if (T.moving) {
        var tdx = T.tx - turtleG.position.x, tdz = T.tz - turtleG.position.z;
        if (tdx * tdx + tdz * tdz < 0.003) { T.moving = false; T.waitT = 6 + Math.random() * 14; }
        else {
          var twant = Math.atan2(tdx, tdz), tdr = twant - turtleG.rotation.y;
          while (tdr > Math.PI) tdr -= Math.PI * 2; while (tdr < -Math.PI) tdr += Math.PI * 2;
          turtleG.rotation.y += tdr * Math.min(1, dt * 2);
          var tsp = 0.065 * (1 - T.headT); // no walking while shy
          turtleG.position.x = Math.max(-3.3, Math.min(3.3, turtleG.position.x + Math.sin(turtleG.rotation.y) * tsp * dt));
          turtleG.position.z = Math.max(-2.25, Math.min(2.4, turtleG.position.z + Math.cos(turtleG.rotation.y) * tsp * dt));
          T.legP += dt * 6;
          for (var li = 0; li < turtleG.userData.legs.length; li++)
            turtleG.userData.legs[li].position.y = 0.018 + Math.max(0, Math.sin(T.legP + li * Math.PI / 2)) * 0.008;
          turtleG.userData.head.position.y = 0.05 + Math.sin(T.legP * 0.5) * 0.006;
          for (var toi = 0; toi < KID_OBSTACLES.length; toi++) { // bump → shell → new plan
            var tob = KID_OBSTACLES[toi];
            if (tob === CAT_OB || tob.r <= 0) continue;
            var tbx = turtleG.position.x - tob.x, tbz = turtleG.position.z - tob.z;
            if (tbx * tbx + tbz * tbz < (tob.r + 0.12) * (tob.r + 0.12)) { T.headT = 1; T.moving = false; T.waitT = 3 + Math.random() * 4; break; }
          }
        }
      } else {
        T.waitT -= dt;
        if (T.waitT <= 0 && turtlePickTarget()) T.moving = true;
      }
      CAT_OB.x = turtleG.position.x; CAT_OB.z = turtleG.position.z;
    } else if (petKind === "fish" && fishG && fishG.visible) { // the fish: laps of the known world
      fishSettle();
      fish.dart = Math.max(0, fish.dart - dt / 1.4);
      fish.a += dt * (0.9 + fish.dart * 5);
      var ff = fishG.userData.fish;
      ff.position.set(Math.cos(fish.a) * 0.048, 0.075 + Math.sin(fish.a * 2.3) * 0.012, Math.sin(fish.a) * -0.048);
      ff.rotation.y = fish.a + Math.PI / 2; // nose along the orbit
      fishG.userData.tail.rotation.y = Math.sin(t * (6 + fish.dart * 10)) * 0.5;
    } else if (petKind === "hamster" && hamG && hamG.visible) { // the hamster: no brakes, no regrets
      ham.speed += (0.32 - ham.speed) * Math.min(1, dt * 0.5); // calms back down after a fright
      var hnx = hamG.position.x + Math.sin(ham.ang) * ham.speed * dt;
      var hnz = hamG.position.z + Math.cos(ham.ang) * ham.speed * dt;
      var hb = false;
      if (hnx < -3.25 || hnx > 3.25) { ham.ang = -ham.ang + (Math.random() - 0.5) * 0.4; hb = true; }
      if (!hb && (hnz < -2.25 || hnz > 2.4)) { ham.ang = Math.PI - ham.ang + (Math.random() - 0.5) * 0.4; hb = true; }
      if (!hb) for (var hoi = 0; hoi < KID_OBSTACLES.length; hoi++) {
        var hob = KID_OBSTACLES[hoi];
        if (hob === CAT_OB || hob.r <= 0) continue;
        var hdx = hnx - hob.x, hdz = hnz - hob.z;
        if (hdx * hdx + hdz * hdz < (hob.r + 0.1) * (hob.r + 0.1)) { ham.ang = Math.atan2(hdx, hdz) + (Math.random() - 0.5) * 0.5; hb = true; break; }
      }
      if (!hb) { hamG.position.x = hnx; hamG.position.z = hnz; }
      hamG.userData.ball.rotation.x += ham.speed * dt / 0.085; // rolling
      hamG.userData.pilot.rotation.y = ham.ang;                 // the pilot faces travel
      hamG.userData.pilot.position.y = 0.052 + Math.abs(Math.sin(t * 10)) * (ham.speed > 0.5 ? 0.004 : 0.0016);
      CAT_OB.x = hamG.position.x; CAT_OB.z = hamG.position.z;
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
    if (pc.visible && (frameCount & 1) === 0) drawScreensaver(dt * 2); // the PC dreams at half rate (and not at all when it's put away)
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
    var mp = motes.geometry.attributes.position, mc = motes.geometry.attributes.color;
    var moteLit = (frameCount % 2) === 0; // relight every other frame — nobody can tell
    for (var mo = 0; mo < moteN; mo++) {
      var my = mp.getY(mo) + dt * 0.022 * moteDrift[mo];
      if (my > 2.85) { // back to the floor, somewhere else in the room
        my = 0.2;
        mp.setX(mo, -3.2 + Math.random() * 6.4);
        mp.setZ(mo, -2.3 + Math.random() * 4.6);
      }
      mp.setY(mo, my);
      var mx = mp.getX(mo) + dt * 0.012 * Math.sin(t * 0.35 + mo);
      mp.setX(mo, mx);
      if (!moteLit) continue;
      // colour this speck by whatever light it's drifting through
      var mz = mp.getZ(mo), lr = 0, lg = 0, lb = 0;
      for (var ml = 0; ml < MOTE_LIGHTS.length; ml++) {
        var src = MOTE_LIGHTS[ml], sp = src.o ? src.o.position : src.p;
        var sx = src.o ? sp.x : sp[0], sy = src.o ? sp.y : sp[1], sz = src.o ? sp.z : sp[2];
        var ddx = mx - sx, ddy = my - sy, ddz = mz - sz;
        var k = src.gain / (1 + (ddx * ddx + ddy * ddy + ddz * ddz) * src.fall);
        if (src.o) k *= Math.min(1.4, src.o.intensity); // a dimmed lamp lights less dust
        lr += src.c[0] * k; lg += src.c[1] * k; lb += src.c[2] * k;
      }
      var mdim = dim * 0.9 + 0.1;
      mc.setXYZ(mo, Math.min(1.3, lr) * mdim, Math.min(1.3, lg) * mdim, Math.min(1.3, lb) * mdim);
    }
    mp.needsUpdate = true;
    if (moteLit) mc.needsUpdate = true;
    if (seaPoints.visible) { // the season falls: down + a lazy sway, recycled at the ceiling
      var look = SEASON_LOOKS[seasonFX], sp = seaGeo.attributes.position;
      for (var se = 0; se < seaN; se++) {
        var sy = sp.getY(se) - dt * look.fall;
        if (sy < 0) { sy = 3.3; sp.setX(se, -3.3 + Math.random() * 6.6); sp.setZ(se, -2.3 + Math.random() * 4.9); }
        sp.setY(se, sy);
        sp.setX(se, sp.getX(se) + dt * look.sway * 0.14 * Math.sin(t * 0.7 + seaPh[se]));
      }
      sp.needsUpdate = true;
    }
    // neon hum: tiny flicker, and a rare stutter
    if (neonMesh) {
      var hum = 0.96 + 0.04 * Math.sin(t * 11) * Math.sin(t * 1.3);
      if (Math.random() < 0.002) hum *= 0.4;
      neonMesh.material.opacity = hum * (0.35 + 0.65 * dim);
      neonLight.intensity = 1.1 * hum * dim;
    }
    // the storm outside — light first, thunder when the distance allows.
    // Only the rainy view HAS a storm; the pines/sea/city/space sit it out.
    if (curViewRain()) {
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
        var wv = phase.lift + flash * 1.5; // lightning lifts the whole painted view
        winLift(wv, wv, wv * phase.liftB);
        if ((frameCount & 1) === 0) drawRain(flash > 0.25);
      } else if ((frameCount % 6) === 0) drawRain(false);
    } else if (flash > 0.01) { flash = 0; moon.intensity = phase.moonI; winLift(phase.lift, phase.lift, phase.lift * phase.liftB); }
    // parallax: the painted layers slide against the camera sway — depth through glass.
    // Far tracks the camera hardest (that's how windows work); both axes move.
    for (var wli = 0; wli < 3; wli++) {
      winLayerT[wli].offset.x = WIN_OFF0 - camera.position.x * [0.10, 0.052, 0.02][wli];
      winLayerT[wli].offset.y = WIN_OFFY - (camera.position.y - 1.72) * [0.11, 0.06, 0.024][wli];
    }
    winEvT.offset.x = WIN_OFF0 - camera.position.x * 0.03; // the life layer rides mid-depth
    winEvT.offset.y = WIN_OFFY - (camera.position.y - 1.72) * 0.034;
    winEvTick(dt, frameCount);
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
    drawFrame();
  }
  // Bake world matrices + paint one frame immediately, so picking works even
  // before the animation loop has run (background tabs throttle rAF).
  scene.updateMatrixWorld(true);
  drawFrame();
  tick();
  window.__room = { scene: scene, camera: camera, renderer: renderer, pick: pick, ray: ray, THREE: THREE, // debug hook (THREE: modules hide the global)
    kid: kid, kidState: kidState, kidStep: kidStep, kidGoto: kidGoto, kidObstacles: KID_OBSTACLES, kidStations: KID_STATIONS,
    kidActions: function () { return kidActions; }, setKidAction: setKidAction, kidMixer: function () { return kidMixer; },
    kidSay: kidSay, kidGreetLine: kidGreetLine, kidFetchLine: kidFetchLine, gameProgress: gameProgress,
    screen: { draw: drawScreensaver, cycle: cycleScreen, kind: function () { return ssKind; },
      kinds: SCREENSAVERS, canvas: ssCanvas },
    light: { mode: function () { return lightMode; }, set: setLightMode, cycle: cycleLights, modes: LIGHT_MODES },
    tour: { start: startTour, end: endTour, stops: TOUR, on: function () { return tourOn; },
      eligible: tourEligible, step: tourStep },
    audio: AUDIO,
    profile: { ctx: profileCtx, evaluate: PROFILE.evaluate, rank: PROFILE.rankFor,
      achievements: PROFILE.ACHIEVEMENTS, state: PROFILE.profileState,
      days: PROFILE.daysVisited, touch: PROFILE.touchVisit, markSeen: PROFILE.markSeen },
    season: { fx: function () { return seasonFX; }, on: function () { return seaPoints.visible; },
      set: function (v) { seasonFX = SEASON_LOOKS[v] ? v : null; applySeasonFX(); }, apply: applySeasonFX, points: seaPoints },
    decor: { movables: movables, byKey: movableByKey, set: decorSet, mode: function () { return decorMode; },
      apply: applyMove, reset: decorReset, persist: persistLayout, hub: KID_HUB,
      layout: function () { return loadJSON("room-layout"); } },
    shoe: { defs: COLLECT, byKey: collByKey, state: function () { return shoeState; }, open: sbxOpen, close: sbxClose,
      place: placeColl, unplace: unplaceColl, render: sbxRender,
      newCount: function () { return sbxNew; } },
    paint: { state: function () { return paintState; }, set: setPaint, apply: applyPaint, open: pbOpen, close: pbClose,
      defs: { PAINT: PAINT, NEON_OPTS: NEON_OPTS, LIGHT_PALS: LIGHT_PALS, MAT_TEX: MAT_TEX },
      materials: applyMaterials, texCache: matTexCache,
      name: roomOwnerName, banner: function () { return nameMesh; } },
    cat: { g: function () { return catG; }, spot: function () { return catSpot; }, ob: CAT_OB,
      relocate: catRelocate, settle: catSettle, pet: catPet,
      hurry: function () { catNextMove = 0; } },
    mixers: mixers, // animation mixers (the pane suspends rAF — tests drive these by hand)
    winlife: { start: winEvStart, tick: winEvTick, state: winEv, clear: winEvClear, events: WIN_EVENTS },
    post: post, draw: drawFrame, setGlow: setGlow, // tune live: __room.post.p.bloomStrength = … ; __room.draw()
    pets: { kind: function () { return petKind; }, set: setPet, group: function () { return petGroup(petKind); },
      labels: PET_LABEL, turtle: function () { return { g: turtleG, s: turtle }; },
      fish: function () { return { g: fishG, s: fish }; }, hamster: function () { return { g: hamG, s: ham }; },
      petTurtle: turtlePet, petFish: fishPet, petHamster: hamPet },
    posters: { art: POSTER_ART, spots: POSTER_SPOTS, frames: posterFrames, cycleList: POSTER_CYCLE,
      state: function () { return posterState; }, cycle: cyclePoster, apply: applyPosters,
      move: moveFrameTo, place: framePlace, locked: posterLocked },
    catAnim: function () { return catAnim; },
    out: { defs: HIDEABLES, state: function () { return outState; }, apply: applyOut, open: obOpen, close: obClose,
      set: function (key, hidden) {
        if (hidden) outState[key] = 1; else delete outState[key];
        saveJSON("room-out", outState); applyOut();
      } },
    extras: { stickers: function () { return stickers; }, addSticker: addSticker, designs: STICKER_DESIGNS,
      preset: applyPreset, presets: ROOM_PRESETS, surprise: surpriseMe, undo: doUndo, undoDepth: function () { return undoStack.length; },
      themes: ROOM_THEMES, theme: applyTheme, themeUnlocked: themeUnlocked, earned: collectiblesEarned,
      blob: roomStateBlob, applyBlob: applyRoomState, encode: encodeRoom, decode: decodeRoom, link: roomLink, share: shareRoom,
      slots: function () { return roomSlots; }, saveRoom: saveRoom, loadRoom: loadRoom, delRoom: delRoom, paste: pasteRoom },
    store: { keys: GAME_KEYS, owned: function () { return ownedKeys; }, locked: gameLocked, demo: function () { return storeDemo; },
      open: openStore, close: closeStore, redeem: redeemKey, apply: applyStore,
      grant: function (sku) { ownKey(sku); applyStore(); },
      revoke: function () { ownedKeys = []; saveJSON("room-keys", ownedKeys); applyStore(); } } };

  /* ---- someone shared a room? offer to rebuild it ------------------------------- */
  (function checkSharedRoom() {
    var m = /[?&]room=([^&]+)/.exec(location.search);
    if (!m) return;
    var blob = decodeRoom(decodeURIComponent(m[1]));
    if (!blob) return;
    var bar = document.createElement("div");
    bar.setAttribute("style", "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:31;" +
      "display:flex;gap:10px;align-items:center;font-family:'Inter',system-ui,sans-serif;font-size:12.5px;" +
      "color:#f3efe4;background:rgba(12,16,24,.92);border:1px solid rgba(150,160,180,.4);border-radius:10px;" +
      "padding:10px 14px;box-shadow:0 12px 40px rgba(0,0,0,.5);max-width:92vw");
    bar.innerHTML = "<span>somebody shared a room with you — take a look?</span>" +
      "<button id='sr-yes' style=\"font-family:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#ffd9a0;background:none;border:1px solid #8a6f4a;border-radius:6px;padding:6px 12px;cursor:pointer\">see it</button>" +
      "<button id='sr-no' style=\"font-family:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);background:none;border:1px solid var(--line);border-radius:6px;padding:6px 12px;cursor:pointer\">not now</button>";
    function clean() { if (bar.parentNode) bar.parentNode.removeChild(bar); try { history.replaceState(null, "", location.pathname); } catch (e) { } }
    document.body.appendChild(bar);
    document.getElementById("sr-yes").addEventListener("click", function () {
      pushUndo(); applyRoomState(blob); clean();
      try { kidSay("this is how they set it up. don't like it? hit undo.", 5); } catch (e) { }
    });
    document.getElementById("sr-no").addEventListener("click", clean);
  })();
})();
