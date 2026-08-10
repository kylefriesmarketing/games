/* THE HALLWAY — the first room of the rest of the house.
 *
 * The bedroom door finally opens. Behind it: a corridor that runs north to the
 * front door, with every future room's door already in the walls — taped off,
 * light leaking underneath, patient. Traversal is the point: you cannot get
 * anywhere in this house except by walking the hall, exactly like a real one.
 *
 * Same construction philosophy as the room: Three.js primitives + canvas
 * textures, zero new asset files. The hall lives in the SAME scene as the
 * bedroom, built beyond the left wall (x < -WALL_X); the wall between them got
 * a real doorway cut in it, so from inside the hall you can look back through
 * the open door and see the lamp light. That shot is the whole feature.
 *
 * room.js integration is deliberately thin: it passes a small ctx and calls
 * three hooks — camTick() (may own the camera), glowTick() (lights follow the
 * room's dim), and space() (pick/Tab filtering). Everything else lives here.
 *
 * The photo wall is real: it reads PROFILE.ACHIEVEMENTS + profileState(), so
 * earned awards hang as little polaroids and unearned ones are dusty frames
 * whose hints tell you what they'd take. The wall fills in as you play.
 */
import * as THREE from "three";
import { mat, box, canvasTex, esc } from "./util.js";
import * as PROFILE from "./profile.js";
import * as AUDIO from "./audio.js";

export function buildHallway(ctx) {
  var scene = ctx.scene, camera = ctx.camera, lookAt = ctx.lookAt,
      clickable = ctx.clickable, glow = ctx.glow;

  /* ---- the shell -------------------------------------------------------------
   * Interior: x -7.45..-4.35 (3.1m wide), z -3.45..4.5 (8m long), ceiling 2.95.
   * ⚠️ It WIDENS WESTWARD ONLY. E_IN is not a free number — it is the back face of
   * the bedroom's left wall, so moving it would move the bedroom. Everything on the
   * west side (wall, stairs, both taped doors, the basement hole, the stairwell
   * void) is anchored to W_IN and moves with it; everything centred uses XC.
   * East wall IS the back of the bedroom's left wall (room.js cut the doorway).
   * Everything hangs off one group so the whole hall is one on/off switch. */
  var g = new THREE.Group(); g.name = "hallway"; scene.add(g);
  var W_IN = -7.45, E_IN = -4.35, XC = -5.90, Z_S = 4.5, Z_N = -3.45, CEIL = 2.95;
  var HW = E_IN - W_IN; // 3.1 — hall width, so the caps/ceiling/skirting follow it

  function add(m) { g.add(m); return m; }
  function tag(m, name, action, hint) { // hall clickables carry a space tag for the pick filter
    clickable(m, name, action, hint); m.userData.space = "hall"; return m;
  }

  // wood plank floor, drawn — slightly raised so it never fights the bedroom
  // floor slab, which extends under the hall's east edge
  var plankT = canvasTex(512, 512, function (c, w, h) {
    c.fillStyle = "#4c3826"; c.fillRect(0, 0, w, h);
    for (var y = 0; y < 8; y++) {
      var off = (y % 2) * 64;
      c.fillStyle = ["#54402c", "#4a3524", "#584330", "#503b28"][y % 4];
      c.fillRect(0, y * 64 + 2, w, 60);
      c.strokeStyle = "rgba(20,12,6,0.7)"; c.lineWidth = 3;
      c.strokeRect(-4, y * 64 + 1, w + 8, 62);
      for (var s = 0; s < 3; s++) { // seams between boards
        var sx = (off + 170 * (s + 1) + y * 37) % w;
        c.beginPath(); c.moveTo(sx, y * 64); c.lineTo(sx, y * 64 + 62); c.stroke();
      }
      c.fillStyle = "rgba(0,0,0,0.35)"; // nail heads
      for (var n = 0; n < 6; n++) c.fillRect((off + 80 * n + y * 53) % w, y * 64 + 30, 3, 3);
    }
  });
  plankT.wrapS = plankT.wrapT = THREE.RepeatWrapping; plankT.repeat.set(1.2, 4);
  var plankM = new THREE.MeshStandardMaterial({ map: plankT, roughness: 0.9 });
  // the floor is three pieces because the basement stairwell is a real hole in it
  var HOLE = { x0: -7.4, x1: -6.55, z0: 0.35, z1: 1.3 }; // the way down
  [[W_IN, E_IN, Z_N, HOLE.z0],          // north of the hole, full width
   [W_IN, E_IN, HOLE.z1, Z_S],          // south of the hole, full width
   [HOLE.x1, E_IN, HOLE.z0, HOLE.z1]]   // beside the hole, east sliver
    .forEach(function (r) {
      var fl = new THREE.Mesh(new THREE.PlaneGeometry(r[1] - r[0], r[3] - r[2]), plankM);
      fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
      fl.position.set((r[0] + r[1]) / 2, 0.0045, (r[2] + r[3]) / 2); add(fl);
    });

  // the runner — every 90s hallway has one, dark red with a tired gold border
  var runT = canvasTex(256, 1024, function (c, w, h) {
    c.fillStyle = "#5d2325"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#b8934a"; c.lineWidth = 10; c.strokeRect(18, 18, w - 36, h - 36);
    c.strokeStyle = "rgba(184,147,74,0.55)"; c.lineWidth = 4; c.strokeRect(34, 34, w - 68, h - 68);
    c.fillStyle = "rgba(184,147,74,0.5)";
    for (var d = 0; d < 9; d++) { // the diamond parade
      c.save(); c.translate(w / 2, 90 + d * 106); c.rotate(Math.PI / 4); c.fillRect(-16, -16, 32, 32); c.restore();
    }
    c.fillStyle = "rgba(0,0,0,0.18)"; // walked-on middle
    c.fillRect(w * 0.3, 60, w * 0.4, h - 120);
  });
  var runner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 6.6),
    new THREE.MeshStandardMaterial({ map: runT, roughness: 0.97 }));
  // on the doorway's axis, so the runner points at the front door down its length
  runner.rotation.x = -Math.PI / 2; runner.position.set(-5.70, 0.009, 0.8); runner.receiveShadow = true;
  add(runner);
  tag(runner, "the runner", null, "the hallway runner — it has seen every midnight snack run");

  // walls, ceiling, trim — same wallpaper spirit, drawn darker (halls get no windows)
  var hwallT = canvasTex(256, 256, function (c, w, h) {
    c.fillStyle = "#33394a"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(255,255,255,0.05)"; c.lineWidth = 2;
    for (var x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.fillStyle = "rgba(255,255,255,0.04)";
    for (var y = 16; y < h; y += 32) for (var x2 = 16; x2 < w; x2 += 32) c.fillRect(x2 - 2, y - 2, 4, 4);
  });
  hwallT.wrapS = hwallT.wrapT = THREE.RepeatWrapping; hwallT.repeat.set(4, 1.6);
  var hwallM = new THREE.MeshStandardMaterial({ map: hwallT, roughness: 0.95 });
  var west = box(0.1, 3.4, Z_S - Z_N, hwallM); west.position.set(W_IN - 0.05, 1.7, (Z_S + Z_N) / 2); add(west);
  var capN = box(HW + 0.2, 3.4, 0.1, hwallM); capN.position.set(XC, 1.7, Z_N - 0.05); add(capN);
  var capS = box(HW + 0.2, 3.4, 0.1, hwallM); capS.position.set(XC, 1.7, Z_S + 0.05); add(capS);
  // The ceiling is TWO pieces, not one, because the stairs go through it — same
  // trick as the floor being three pieces around the basement hole. The opening is
  // z -3.6..-1.45 over the west side, so you can look up the flight to the landing.
  var ceilM = mat(0x2a2f3d, 0.98);
  var STW = { x0: W_IN - 0.15, x1: W_IN + 1.10, z0: -3.6, z1: -1.45 }; // the stairwell void
  var CZ_S = Z_S + 0.15, CX_E = XC + (HW + 0.3) / 2;      // the ceiling's south + east edges
  var ceilA = box(HW + 0.3, 0.1, CZ_S - STW.z1, ceilM);   // everything south of the void
  ceilA.position.set(XC, CEIL + 0.05, (STW.z1 + CZ_S) / 2); add(ceilA);
  var ceilB = box(CX_E - STW.x1, 0.1, STW.z1 - STW.z0, ceilM); // the strip beside it
  ceilB.position.set((STW.x1 + CX_E) / 2, CEIL + 0.05, (STW.z0 + STW.z1) / 2); add(ceilB);
  // the stairwell's own lid + the two faces that close it, so the void is a shaft
  // and not a hole into nothing
  var stwLid = box(STW.x1 - STW.x0, 0.1, STW.z1 - STW.z0, ceilM);
  stwLid.position.set((STW.x0 + STW.x1) / 2, 3.45, (STW.z0 + STW.z1) / 2); add(stwLid);
  var stwE = box(0.1, 0.45, STW.z1 - STW.z0, hwallM);
  stwE.position.set(STW.x1, 3.175, (STW.z0 + STW.z1) / 2); add(stwE);
  var stwS = box(STW.x1 - STW.x0, 0.45, 0.1, hwallM);
  stwS.position.set((STW.x0 + STW.x1) / 2, 3.175, STW.z1); add(stwS);
  [[W_IN + 0.001, (Z_S + Z_N) / 2, Z_S - Z_N, Math.PI / 2],   // baseboards
   [E_IN - 0.001, (Z_S + Z_N) / 2, Z_S - Z_N, -Math.PI / 2],
   [XC, Z_N + 0.001, HW, 0]].forEach(function (b) {
    var sk = new THREE.Mesh(new THREE.PlaneGeometry(b[2], 0.14), mat(0x241b12, 0.85));
    if (b[3]) { sk.rotation.y = b[3]; sk.position.set(b[0], 0.075, b[1]); }
    else sk.position.set(b[0], 0.075, b[1]);
    add(sk);
  });
  var hstripe = new THREE.Mesh(new THREE.PlaneGeometry(Z_S - Z_N, 0.22), mat(0x6e3c4b, 0.95));
  hstripe.rotation.y = Math.PI / 2; hstripe.position.set(W_IN + 0.002, 2.45, (Z_S + Z_N) / 2); add(hstripe); // the border tries to follow you out of the bedroom

  /* ---- doors that aren't ready yet -------------------------------------------
   * Each is a painted slab + knob + crossed renovation tape + a plaque + light
   * under the door, because every one of these rooms already has a life going on
   * behind it. The signs promise rooms, not dates — dates are marketing's job. */
  function slabDoor(x, z, ry, w, colr, name, hint, spillColor, spillOp) {
    var grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; add(grp);
    var d = box(0.05, 2.05, w, mat(colr, 0.72)); d.position.set(0, 1.025, 0); grp.add(d);
    [[2.09, 0.08, w + 0.14, 0], [1.02, 2.12, 0.08, -w / 2 - 0.03], [1.02, 2.12, 0.08, w / 2 + 0.03]]
      .forEach(function (j) { var jm = box(0.08, j[1], j[2], mat(0x241b12, 0.8)); jm.position.set(0.015, j[0], j[3]); grp.add(jm); });
    var kb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.6 }));
    kb.position.set(0.045, 1.0, w * 0.36); grp.add(kb);
    if (spillColor != null) {
      var sp = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.08),
        new THREE.MeshBasicMaterial({ color: spillColor, transparent: true, opacity: spillOp, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.rotation.x = -Math.PI / 2; sp.rotation.z = Math.PI / 2; sp.position.set(0.09, 0.012, 0); grp.add(sp);
      grp.userData.spill = sp; grp.userData.spillOp = spillOp;
    }
    [d, kb].forEach(function (m) { tag(m, name, null, hint); });
    return grp;
  }
  function tapeX(doorGrp, w) { // PARDON OUR DUST, in physical form
    var tm = new THREE.MeshStandardMaterial({ color: 0xd9c04a, roughness: 0.6 });
    [0.9, -0.9].forEach(function (r) {
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, Math.sqrt(w * w + 2.9)), tm);
      t.position.set(0.055, 1.02, 0); t.rotation.x = r; doorGrp.add(t);
    });
  }
  function plaque(doorGrp, title, sub) {
    var pt = canvasTex(256, 96, function (c, w, h) {
      c.fillStyle = "#e8dcc0"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#8a6f3c"; c.lineWidth = 5; c.strokeRect(5, 5, w - 10, h - 10);
      c.fillStyle = "#3a3020"; c.font = "bold 30px Georgia, serif"; c.textAlign = "center";
      c.fillText(title, w / 2, 40);
      c.font = "italic 20px Georgia, serif"; c.fillStyle = "#6a5a38";
      c.fillText(sub, w / 2, 72);
    });
    var p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.195),
      new THREE.MeshStandardMaterial({ map: pt, roughness: 0.85 }));
    p.rotation.y = Math.PI / 2; p.position.set(0.06, 2.42, 0); p.rotation.z = 0.015; // hung a little crooked, like everything here
    doorGrp.add(p);
  }

  // THE LIVING ROOM — right across the hall from the bedroom, exactly where it
  // should be. The flicker under the door is a television nobody turned off.
  var livDoor = slabDoor(W_IN + 0.03,1.9, 0, 1.0, 0x4a3524, "the living room door",
    "the living room — under renovation. someone left the TV on in there", 0x9db8ff, 0.2);
  tapeX(livDoor, 1.0); plaque(livDoor, "LIVING ROOM", "opening soon");

  // THE KITCHEN — across from the photo wall. Cold light, steady: that's the
  // fridge, humming to itself until 2027.
  var kitDoor = slabDoor(W_IN + 0.03,-0.35, 0, 0.92, 0x54582e, "the kitchen door",
    "the kitchen — opening 2027. the fridge hums like it knows something", 0xbfe8d8, 0.16);
  tapeX(kitDoor, 0.92); plaque(kitDoor, "KITCHEN", "2027");

  // THE CLOSET — the one door down here that DOES open. Seasonal storage, one
  // spare hallway gag, and a shoebox that is pointedly empty.
  var cloG = new THREE.Group(); cloG.position.set(E_IN - 0.03, 0, 3.35); add(cloG);
  [[2.09, 0.08, 0.96, 0], [1.02, 2.12, 0.08, -0.43], [1.02, 2.12, 0.08, 0.43]]
    .forEach(function (j) { var jm = box(0.08, j[1], j[2], mat(0x241b12, 0.8)); jm.position.set(-0.015, j[0], j[3]); cloG.add(jm); });
  var cloBackT = canvasTex(256, 512, function (c, w, h) { // painted depths: shelf, dark, one lost mitten
    c.fillStyle = "#171410"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#241d15"; c.fillRect(0, 60, w, 26); // the shelf line
    c.fillStyle = "#3a3226";
    for (var b = 0; b < 3; b++) c.fillRect(24 + b * 78, 18, 60, 40); // boxes of who-knows
    c.fillStyle = "#7d2f2f"; c.fillRect(w - 58, h - 90, 30, 40); // the mitten that lost its twin
  });
  var cloBack = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 2.0),
    new THREE.MeshStandardMaterial({ map: cloBackT, roughness: 0.95 }));
  cloBack.rotation.y = -Math.PI / 2; cloBack.position.set(0.34, 1.06, 0); cloG.add(cloBack);
  var rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.6, roughness: 0.4 }));
  rod.rotation.x = Math.PI / 2; rod.position.set(0.22, 1.78, 0); cloG.add(rod);
  var MONTH = new Date().getMonth() + 1;
  var wear = MONTH >= 12 || MONTH <= 2 ? [0x6e2f2f, 0x2f4a6e, 0x4a6e2f] : // winter coats
             MONTH <= 5 ? [0xd9c04a, 0x4a8ad9, 0x8a8a8a] :                 // raincoats
             MONTH <= 8 ? [0xd97b4a, 0x4ad9b8, 0xd94a8a] :                 // summer nothing-much
                          [0x8a5a2f, 0x5a2f8a, 0x2f8a5a];                  // fall jackets
  wear.forEach(function (colr, i) {
    var hang = new THREE.Group(); hang.position.set(0.22, 1.78, -0.22 + i * 0.22); cloG.add(hang);
    var wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), rod.material);
    wire.position.y = -0.05; hang.add(wire);
    var coat = box(0.09, 0.62, 0.19, mat(colr, 0.9)); coat.position.y = -0.42; hang.add(coat);
    var arm = box(0.09, 0.4, 0.055, mat(colr, 0.9)); arm.position.set(0, -0.3, 0.115); arm.rotation.x = 0.16; hang.add(arm);
  });
  var shoebox2 = box(0.3, 0.11, 0.18, mat(0x9a8a6a, 0.9)); shoebox2.position.set(0.28, 0.055, 0.24); shoebox2.rotation.y = 0.4; cloG.add(shoebox2);
  var cloDoorP = new THREE.Group(); cloDoorP.position.set(0, 0, 0.44); cloG.add(cloDoorP); // hinged on the south jamb
  var cloDoor = box(0.045, 2.05, 0.84, mat(0x4a3524, 0.72)); cloDoor.position.set(0, 1.025, -0.42); cloDoorP.add(cloDoor);
  var cloKnob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.6 }));
  cloKnob.position.set(-0.04, 1.0, -0.76); cloDoorP.add(cloKnob);
  var cloOpen = false, cloAnim = 0;
  function closetToggle() { cloOpen = !cloOpen; AUDIO.ratchetSfx && AUDIO.ratchetSfx(); }
  [cloDoor, cloKnob].forEach(function (m) {
    tag(m, "the closet", closetToggle, "the hall closet");
  });
  tag(shoebox2, "another shoebox", null, "another shoebox — empty. for now.");
  tag(cloBack, "the closet shelf", null, "boxes of who-knows and one mitten that lost its twin");

  /* ---- the stairs ------------------------------------------------------------ */
  // UP: eight steps against the west wall, climbing north into the dark, a rope
  // of tape across the second one. The upstairs is real; it just isn't YOURS yet.
  var stairM = new THREE.MeshStandardMaterial({ map: plankT, roughness: 0.88 });
  var STAIR_X = W_IN + 0.47, RAIL_X = STAIR_X + 0.44; // hard against the west wall
  for (var st = 0; st < 8; st++) {
    var step = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.3), stairM);
    step.position.set(STAIR_X,0.09 + st * 0.185, -0.9 - st * 0.3); step.castShadow = step.receiveShadow = true; add(step);
    if (st === 2) tag(step, "the stairs up", null, "upstairs — her room, their room, the attic. 2027.");
  }
  // The flight lands on a real landing and meets a real door — taped like every
  // other room in this house, because upstairs isn't yours yet either. (It used to
  // end in a flat black plane, which read as an unfinished wall rather than a way
  // up.) Top step surface is y 1.475, so everything up here is measured off that.
  var LAND_Y = 1.475;
  var landing = box(1.0, 0.1, 0.62, stairM);
  landing.position.set(STAIR_X,LAND_Y - 0.05, -3.14); landing.receiveShadow = true; add(landing);
  var upDoor = slabDoor(STAIR_X, -3.38, -Math.PI / 2, 0.92, 0x4a3a2a, "the stairs up",
    "upstairs — her room, their room, the attic. 2027.", 0xffd9a0, 0.13);
  upDoor.position.y = LAND_Y;
  // ⚠️ squashed to 0.88 ON PURPOSE: at full height the jamb tops out at y 3.60 and
  // the stairwell lid is at 3.40. Measured, not guessed — 1.475 + 2.12*0.88 = 3.34.
  upDoor.scale.set(1, 0.88, 0.95);
  tapeX(upDoor, 0.92);
  var rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.35), mat(0x3a2c1c, 0.7));
  rail.position.set(RAIL_X, 1.5, -1.95); rail.rotation.x = 0.55; add(rail);
  [[1.0, -0.95], [1.35, -1.9], [1.7, -2.85]].forEach(function (p, i) {
    var post = new THREE.Mesh(new THREE.BoxGeometry(0.045, p[0], 0.045), mat(0x3a2c1c, 0.7));
    post.position.set(RAIL_X, p[0] / 2 + i * 0.37, p[1]); add(post);
  });
  var upTape = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.012), new THREE.MeshStandardMaterial({ color: 0xd9c04a, roughness: 0.6 }));
  upTape.position.set(STAIR_X,0.72, -1.42); upTape.rotation.z = 0.06; add(upTape);
  tag(upTape, "the stairs up", null, "upstairs — her room, their room, the attic. 2027.");
  var upSign = canvasTex(256, 128, function (c, w, h) {
    c.fillStyle = "#e8dcc0"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#8a6f3c"; c.lineWidth = 5; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = "#3a3020"; c.font = "bold 34px Georgia, serif"; c.textAlign = "center";
    c.fillText("UPSTAIRS", w / 2, 52);
    c.font = "italic 22px Georgia, serif"; c.fillStyle = "#6a5a38"; c.fillText("pardon our dust — 2027", w / 2, 92);
  });
  var upSignM = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: upSign, roughness: 0.85 }));
  upSignM.rotation.y = Math.PI / 2; upSignM.position.set(W_IN + 0.02, 1.85, -0.72); upSignM.rotation.z = -0.02; add(upSignM);

  // DOWN: a real hole in the floor, steps descending into a cold green glow.
  // The chain says not yet. The temperature says the basement is already awake.
  var holeDark = box(HOLE.x1 - HOLE.x0, 0.02, HOLE.z1 - HOLE.z0, mat(0x05070a, 1));
  holeDark.position.set((HOLE.x0 + HOLE.x1) / 2, -1.3, (HOLE.z0 + HOLE.z1) / 2); add(holeDark);
  for (var ds = 0; ds < 5; ds++) {
    var dstep = new THREE.Mesh(new THREE.BoxGeometry(HOLE.x1 - HOLE.x0 - 0.06, 0.16, 0.24), stairM);
    dstep.position.set((HOLE.x0 + HOLE.x1) / 2, -0.1 - ds * 0.22, HOLE.z0 + 0.16 + ds * 0.19); add(dstep);
  }
  [[HOLE.x1 + 0.02, HOLE.z0 - 0.03, (HOLE.x1 - HOLE.x0) + 0.1, 0],   // railings around the hole
   [HOLE.x1 + 0.02, HOLE.z1 + 0.03, (HOLE.x1 - HOLE.x0) + 0.1, 0]].forEach(function (r, i) {
    var hr = new THREE.Mesh(new THREE.BoxGeometry(r[2], 0.05, 0.05), mat(0x3a2c1c, 0.7));
    hr.position.set((HOLE.x0 + HOLE.x1) / 2 + 0.05, 0.62, r[1]); add(hr);
    var hp = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.045), mat(0x3a2c1c, 0.7));
    hp.position.set(HOLE.x1, 0.31, r[1]); add(hp);
  });
  var eastRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, HOLE.z1 - HOLE.z0 + 0.1), mat(0x3a2c1c, 0.7));
  eastRail.position.set(HOLE.x1 + 0.02, 0.62, (HOLE.z0 + HOLE.z1) / 2); add(eastRail);
  var bGlow = new THREE.Mesh(new THREE.PlaneGeometry(HOLE.x1 - HOLE.x0, HOLE.z1 - HOLE.z0),
    new THREE.MeshBasicMaterial({ color: 0x77d9a8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
  bGlow.rotation.x = -Math.PI / 2; bGlow.position.set((HOLE.x0 + HOLE.x1) / 2, 0.02, (HOLE.z0 + HOLE.z1) / 2); add(bGlow);
  var chain = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, HOLE.z1 - HOLE.z0 + 0.06), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.7, roughness: 0.45 }));
  chain.position.set(HOLE.x1, 0.5, (HOLE.z0 + HOLE.z1) / 2); chain.rotation.x = 0.12; add(chain);
  var downHit = box(HOLE.x1 - HOLE.x0, 0.6, HOLE.z1 - HOLE.z0, new THREE.MeshBasicMaterial({ visible: false }));
  downHit.position.set((HOLE.x0 + HOLE.x1) / 2, 0.3, (HOLE.z0 + HOLE.z1) / 2); add(downHit);
  tag(downHit, "the stairs down", null, "the basement — opening soon. the light down there already works.");
  tag(chain, "the stairs down", null, "the basement — opening soon. the light down there already works.");

  /* ---- THE PHOTO WALL --------------------------------------------------------
   * Twenty frames on the east wall, one per achievement, two staggered rows.
   * Earned = a warm little polaroid with its icon and the date it happened.
   * Unearned = a dusty empty frame whose hint tells you what it would take.
   * This is the achievements screen, except it's furniture. */
  var photoWall = new THREE.Group(); add(photoWall);
  var pState = PROFILE.profileState();
  function photoTex(a, when) {
    return canvasTex(128, 160, function (c, w, h) {
      if (when) {
        var hue = 0; for (var i = 0; i < a.id.length; i++) hue = (hue * 31 + a.id.charCodeAt(i)) % 360;
        c.fillStyle = "#efe6d2"; c.fillRect(0, 0, w, h); // polaroid paper
        c.fillStyle = "hsl(" + hue + ",30%,26%)"; c.fillRect(10, 10, w - 20, h - 48);
        c.fillStyle = "hsl(" + hue + ",42%,60%)";     // a horizon, for the memory to happen in
        c.fillRect(10, 62, w - 20, 8);
        c.font = "44px serif"; c.textAlign = "center"; c.fillText(a.icon, w / 2, 58);
        c.fillStyle = "#3a3226"; c.font = "bold 12px Georgia, serif";
        c.fillText(a.name.length > 18 ? a.name.slice(0, 17) + "…" : a.name, w / 2, h - 24);
        c.font = "italic 11px Georgia, serif"; c.fillStyle = "#7a6a50";
        c.fillText(when, w / 2, h - 9);
      } else {
        c.fillStyle = "#41414a"; c.fillRect(0, 0, w, h);   // a photo nobody's taken yet
        c.fillStyle = "#54545e"; c.fillRect(10, 10, w - 20, h - 48);
        c.font = "40px serif"; c.textAlign = "center"; c.globalAlpha = 0.3; c.fillText(a.icon, w / 2, 58);
        c.globalAlpha = 1; c.fillStyle = "#7a7a86"; c.font = "bold 26px Georgia, serif"; c.fillText("?", w / 2, h - 18);
      }
    });
  }
  var frames = [];
  PROFILE.ACHIEVEMENTS.forEach(function (a, i) {
    var row = i % 2, col = (i / 2) | 0;
    var z = 1.15 - col * 0.4, y = row ? 1.46 : 1.94;
    var fr = new THREE.Group(); fr.position.set(E_IN + 0.012, y, z); fr.rotation.z = (((i * 7) % 5) - 2) * 0.012; photoWall.add(fr);
    var when = pState.ach[a.id] || null;
    var frameM = mat(when ? 0x6a4e2e : 0x3c3630, 0.8);
    var back = box(0.02, 0.36, 0.30, frameM); fr.add(back);
    var ph = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.30),
      new THREE.MeshStandardMaterial({ map: photoTex(a, when), roughness: 0.9 }));
    ph.rotation.y = -Math.PI / 2; ph.position.x = -0.013; fr.add(ph);
    tag(ph, "photo: " + a.name.toLowerCase(),
      null, when ? a.icon + " " + a.name + " — " + when : "an empty frame — " + a.hint);
    frames.push({ a: a, ph: ph, back: back });
  });
  // the wall repaints itself when new memories arrive (room.js calls this after evaluate())
  function refreshPhotos() {
    var p = PROFILE.profileState();
    frames.forEach(function (f) {
      var when = p.ach[f.a.id] || null;
      var wasEarned = f.earned; f.earned = !!when;
      if (wasEarned === f.earned) return;
      f.ph.material.map = photoTex(f.a, when); f.ph.material.needsUpdate = true;
      f.back.material = mat(when ? 0x6a4e2e : 0x3c3630, 0.8);
      f.ph.userData.hint = when ? f.a.icon + " " + f.a.name + " — " + when : "an empty frame — " + f.a.hint;
    });
  }
  frames.forEach(function (f) { f.earned = !!pState.ach[f.a.id]; });

  /* ---- THE FRONT DOOR (north end) --------------------------------------------
   * The hall ends where the house does. Arch window over the door with the porch
   * light coming through, a mat that says WELCOME to people arriving (so it's
   * upside down to you), an umbrella stand, hooks wearing this season's coat.
   * This is also where the once-a-night knock has been coming from all along. */
  // ⚠️ NOT on XC. The staircase runs down the west side and eats x W_IN..W_IN+0.93,
  // so a door centred on the hall's own centre line puts itself through the bottom
  // of the flight — which is exactly what it used to do. FRONT_X centres the doorway
  // in the CLEAR span instead (stairs' east edge -6.52 to E_IN -4.35), and the runner
  // shares that axis so the carpet points at the door down its whole length.
  // Anything parented to this group has to live within about ±0.62 of it; the table
  // and the umbrella stand are deliberately NOT parented here.
  var FRONT_X = -5.70;
  // the hall table lives beside the doorway now — that's what the widening bought
  var TBL_X = -4.60, TBL_Z = -3.15;
  var front = new THREE.Group(); front.position.set(FRONT_X, 0, Z_N + 0.01); add(front);
  var fDoor = box(0.98, 2.08, 0.06, mat(0x5a3a24, 0.65)); fDoor.position.set(0, 1.04, 0.03); front.add(fDoor);
  [[-0.56, 0], [0.56, 0]].forEach(function (j) {
    var jm = box(0.1, 2.2, 0.09, mat(0x241b12, 0.8)); jm.position.set(j[0], 1.1, 0.045); front.add(jm);
  });
  var lint = box(1.24, 0.1, 0.09, mat(0x241b12, 0.8)); lint.position.set(0, 2.24, 0.045); front.add(lint);
  var archT = canvasTex(256, 128, function (c, w, h) { // night through the fan-light
    var grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#101a30"); grd.addColorStop(1, "#28344e");
    c.fillStyle = grd; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(255,214,140,0.75)";                 // porch light, promising
    c.beginPath(); c.arc(w / 2, h, 34, Math.PI, 0); c.fill();
    c.fillStyle = "rgba(255,255,255,0.8)";
    [[30, 28], [70, 44], [186, 30], [222, 52], [130, 20]].forEach(function (s) { c.fillRect(s[0], s[1], 2, 2); });
    c.strokeStyle = "#241b12"; c.lineWidth = 10;            // the fan ribs
    for (var r = -2; r <= 2; r++) { c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2 + r * 52, 6); c.stroke(); }
  });
  var arch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24, 0, Math.PI),
    new THREE.MeshBasicMaterial({ map: archT }));
  arch.position.set(0, 2.3, 0.055); front.add(arch);
  var fkT = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xc8a44a, roughness: 0.3, metalness: 0.65 }));
  fkT.position.set(0.36, 1.02, 0.09); front.add(fkT);
  var slot = box(0.26, 0.035, 0.02, new THREE.MeshStandardMaterial({ color: 0xc8a44a, roughness: 0.35, metalness: 0.6 }));
  slot.position.set(0, 0.78, 0.07); front.add(slot);
  var matT = canvasTex(256, 128, function (c, w, h) {
    c.fillStyle = "#4a5238"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#33392a"; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
    c.save(); c.translate(w / 2, h / 2); c.rotate(Math.PI); // it greets the OTHER direction
    c.fillStyle = "#c8bd8f"; c.font = "bold 40px Georgia, serif"; c.textAlign = "center";
    c.fillText("WELCOME", 0, 14); c.restore();
  });
  var wmat = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.4), new THREE.MeshStandardMaterial({ map: matT, roughness: 0.98 }));
  wmat.rotation.x = -Math.PI / 2; wmat.position.set(0, 0.0075, 0.42); front.add(wmat);
  // ⚠️ the stand is NOT in the front group — it belongs to the hall table now, and
  // parenting it to the doorway meant it moved whenever the doorway did. It stands
  // just south of the table against the east wall: door, table, stand, in a row.
  var STAND_X = TBL_X, STAND_Z = TBL_Z + 0.40;
  var stand = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.5, 12), mat(0x39536e, 0.6));
  stand.position.set(STAND_X, 0.25, STAND_Z); add(stand);
  [[-0.12, 0.5, 0x8a4a3a], [0.1, 0.42, 0x3a5a7a]].forEach(function (u) {
    var um = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.026, 0.62, 8), mat(u[2], 0.8));
    um.position.set(STAND_X + u[0] * 0.3, u[1] + 0.28, STAND_Z); um.rotation.z = u[0]; add(um);
  });
  // ⚠️ the hooks are on the EAST WALL, not beside the door. They used to hang at
  // local x -0.85, which after the doorway moved put them half inside the staircase
  // and half behind the west jamb — the coat rendered as a floating orange sliver.
  // Above the hall table is where a coat actually goes anyway.
  var hooks = new THREE.Group(); hooks.position.set(E_IN - 0.02, 0, -3.05);
  hooks.rotation.y = -Math.PI / 2; add(hooks);
  var hooksBar = box(0.3, 0.05, 0.03, mat(0x3a2c1c, 0.7)); hooksBar.position.set(0, 1.72, 0.04); hooks.add(hooksBar);
  var hookCoat = box(0.2, 0.56, 0.1, mat(wear[0], 0.9)); hookCoat.position.set(0, 1.36, 0.08); hooks.add(hookCoat);
  var scarf = box(0.06, 0.34, 0.11, mat(0xb8934a, 0.95)); scarf.position.set(0.07, 1.42, 0.095); scarf.rotation.z = 0.1;
  if (MONTH >= 11 || MONTH <= 2) hooks.add(scarf);
  if (MONTH === 12) { // the wreath goes up when the room hangs its own lights
    var wreath = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 10, 22), mat(0x2f5a34, 0.85));
    wreath.position.set(0, 1.62, 0.085); front.add(wreath);
    var bow = box(0.1, 0.07, 0.03, mat(0xa32b33, 0.7)); bow.position.set(0, 1.79, 0.09); front.add(bow);
  }
  [fDoor, fkT].forEach(function (m) {
    tag(m, "the front door", null, "the front door — the whole outside is on the other side. grand opening soon.");
  });
  tag(slot, "the mail slot", null, "the mail slot — the daily letter will land here someday");
  tag(wmat, "the welcome mat", null, "it says WELCOME to people coming in. you live here.");
  tag(stand, "the umbrella stand", null, "two umbrellas. it has never once rained indoors.");

  // the hall table by the front door, with the family telephone
  var tbl = new THREE.Group(); tbl.position.set(TBL_X, 0, TBL_Z); add(tbl);
  var top = box(0.5, 0.04, 0.36, mat(0x4a3421, 0.6)); top.position.y = 0.72; top.castShadow = true; tbl.add(top);
  [[-0.21, -0.14], [0.21, -0.14], [-0.21, 0.14], [0.21, 0.14]].forEach(function (l) {
    var leg = box(0.04, 0.72, 0.04, mat(0x3a2a1a, 0.7)); leg.position.set(l[0], 0.36, l[1]); tbl.add(leg);
  });
  var doily = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), mat(0xd8d2c0, 0.95));
  doily.rotation.x = -Math.PI / 2; doily.position.set(-0.08, 0.745, 0); tbl.add(doily);
  var phoneG = new THREE.Group(); phoneG.position.set(-0.08, 0.75, 0); phoneG.rotation.y = -0.5; tbl.add(phoneG);
  var phBase = box(0.2, 0.1, 0.16, mat(0x1d1f26, 0.5)); phBase.position.y = 0.05; phoneG.add(phBase);
  var dial = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.015, 20), mat(0xd8d2c0, 0.6));
  dial.position.set(0, 0.105, 0.02); dial.rotation.x = 0.35; phoneG.add(dial);
  var hset = box(0.22, 0.045, 0.05, mat(0x1d1f26, 0.5)); hset.position.set(0, 0.15, -0.045); phoneG.add(hset);
  [-0.085, 0.085].forEach(function (hx) { var cup = box(0.05, 0.05, 0.055, mat(0x1d1f26, 0.5)); cup.position.set(hx, 0.165, -0.045); phoneG.add(cup); });
  [phBase, hset, dial].forEach(function (m) { tag(m, "the telephone", null, "the telephone — it's for you. (it's never for you.)"); });

  // the way home: the open doorway itself is clickable (an invisible hitbox in
  // the opening — the swung slab ends up too far right of the hall's gaze)
  var homeHit = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.0, 0.9),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  homeHit.position.set(-4.3, 1.03, 2.1); add(homeHit);
  tag(homeHit, "your room", function () { leave(); }, "your room — the lamp is still on");
  var notepad = box(0.1, 0.008, 0.13, mat(0xe8e2d0, 0.95)); notepad.position.set(0.15, 0.746, 0.06); notepad.rotation.y = 0.3; tbl.add(notepad);
  tag(notepad, "the phone pad", null, "a number with no name next to it. mom's handwriting.");

  /* ---- light ------------------------------------------------------------------ */
  // Two ceiling bulbs on cords. The south one has the pull chain — yes, you can
  // turn the hall lights off; no, the underdoor spills don't care.
  function bulbAt(z, warm) {
    var bg = new THREE.Group(); bg.position.set(XC, 0, z); add(bg);
    var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 6), mat(0x1d1a14, 0.9));
    cord.position.y = CEIL - 0.17; bg.add(cord);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 1.6, roughness: 0.4 }));
    bulb.position.y = CEIL - 0.37; bg.add(bulb);
    var shade2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.1, 0.09, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.7, side: THREE.DoubleSide }));
    shade2.position.y = CEIL - 0.3; bg.add(shade2);
    var li = new THREE.PointLight(warm, 0, 9.5, 1.55); li.position.set(0, CEIL - 0.45, 0); bg.add(li);
    var halo = glow ? glow(0xffd9a0, XC, CEIL - 0.37, z, 0.5, 0.5, 0.3) : null;
    if (halo) { g.add(halo); halo.position.set(XC, CEIL - 0.37, z); }
    return { g: bg, bulb: bulb, light: li, halo: halo, z: z };
  }
  var bulbS = bulbAt(1.9, 0xffd9a0), bulbN = bulbAt(-2.2, 0xffd9a0);
  var hallFill = new THREE.PointLight(0xffe4c0, 0.5, 11, 2); // the soft everything-light halls have
  hallFill.position.set(XC, 2.1, 0.6); add(hallFill);
  var lightsOn = true;
  var pull = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.24, 6), mat(0xd8d2c0, 0.8));
  pull.position.set(XC + 0.09, CEIL - 0.5, 1.9); add(pull);
  var bead = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), mat(0xd8d2c0, 0.7));
  bead.position.set(XC + 0.09, CEIL - 0.63, 1.9); add(bead);
  function pullChain() {
    lightsOn = !lightsOn; AUDIO.clickSfx && AUDIO.clickSfx(lightsOn ? 1200 : 700);
  }
  [pull, bead].forEach(function (m) { tag(m, "the pull chain", pullChain, "the pull chain — clack."); });

  /* ---- state & camera ---------------------------------------------------------
   * space: "bedroom" | "hall". The transition walks the camera through the real
   * doorway while the door swings; while it runs, busy() guards the pointer.
   * In the hall the camera stands at the south end and looks the length of it —
   * the front door far ahead, every future room on the way. Same mouse-parallax
   * feel as the bedroom so the two spaces read as one house. */
  var space = "bedroom", mode = "idle", tt = 0, seen = { hall: false };
  try { seen.hall = !!localStorage.getItem("room-hall-seen"); } catch (e) { }
  var P = { // camera choreography, in order of appearance
    rest: new THREE.Vector3(-5.90, 1.7, 3.72),      // standing at the south end
    look: new THREE.Vector3(-5.72, 1.26, -1.4),     // gazing up the corridor, a hair toward the photo wall
    door1: new THREE.Vector3(-3.15, 1.66, 2.1),     // stepping to the door (bedroom side)
    doorL: new THREE.Vector3(-4.6, 1.5, 2.1),       // looking through it
    door2: new THREE.Vector3(-4.85, 1.66, 2.1),     // in the doorway itself
    hallL: new THREE.Vector3(-5.95, 1.4, 0.6)       // first glance up the hall
  };
  var c0 = new THREE.Vector3(), l0 = new THREE.Vector3(); // where the walk started
  function enter() {
    if (mode !== "idle" || space === "hall") return;
    if (ctx.onEnter) ctx.onEnter();
    mode = "entering"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.ratchetSfx && AUDIO.ratchetSfx(); // the latch
    if (!seen.hall) {
      seen.hall = true;
      try { localStorage.setItem("room-hall-seen", "1"); } catch (e) { }
      if (ctx.kidSay) ctx.kidSay("the hallway! the whole house is waking up.", 5);
    }
  }
  function leave() {
    if (mode !== "idle" || space !== "hall") return;
    mode = "leaving"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    if (ctx.onLeave) ctx.onLeave();
  }
  function toggleDoor() { if (space === "hall") leave(); else enter(); }
  function ease(x) { return x * x * (3 - 2 * x); }
  var _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function walk(pts, lks, t) { // piecewise keyframe path, eased per leg
    var n = pts.length - 1, x = Math.min(0.9999, Math.max(0, t)) * n, i = x | 0, f = ease(x - i);
    _v.lerpVectors(pts[i], pts[i + 1], f);
    _w.lerpVectors(lks[i], lks[i + 1], f);
  }
  var BED_LOOK = new THREE.Vector3(0, 1.2, -0.4); // the bedroom's home gaze (room.js only ever steers its x)
  function camTick(t, dt, mx, my) {
    if (mode === "entering" || mode === "leaving") {
      tt = Math.min(1, tt + dt / 2.3);
      var doorK = mode === "entering" ? tt : 1 - tt; // the door swings with the walk
      // +2.6 rad: the slab opens INTO the hall and lies nearly flat along the east
      // wall, so the camera's walk line never clips it
      if (ctx.doorPivot) ctx.doorPivot.rotation.y = 2.6 * ease(Math.min(1, Math.max(0, (doorK - 0.05) / 0.4)));
      if (mode === "entering")
        walk([c0, P.door1, P.door2, P.rest], [l0, P.doorL, P.hallL, P.look], tt);
      else
        walk([c0, P.door2, P.door1], [l0, P.doorL, BED_LOOK], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "entering") { space = "hall"; if (ctx.doorPivot) ctx.doorPivot.rotation.y = 2.6; }
        else { // home again; the door clicks shut and the bedroom camera glides back on its own
          space = "bedroom"; lookAt.copy(BED_LOOK);
          if (ctx.doorPivot) ctx.doorPivot.rotation.y = 0;
          AUDIO.clickSfx && AUDIO.clickSfx(500);
        }
        mode = "idle";
      }
      return true;
    }
    if (space === "hall") { // at rest in the hall: same parallax drift as the bedroom
      var bx = P.rest.x + mx * 0.5, by = P.rest.y + my * 0.22, bz = P.rest.z;
      camera.position.x += (bx - camera.position.x) * 0.04;
      camera.position.y += (by - camera.position.y) * 0.04;
      camera.position.z += (bz - camera.position.z) * 0.04;
      lookAt.x += ((P.look.x + mx * 0.9) - lookAt.x) * 0.04;
      lookAt.y += ((P.look.y + my * 0.6) - lookAt.y) * 0.04;
      lookAt.z += (P.look.z - lookAt.z) * 0.04;
      camera.lookAt(lookAt);
      return true;
    }
    return false; // bedroom: room.js keeps its own camera
  }

  /* ---- per-frame life ---------------------------------------------------------
   * dim comes from the room (the bed's "five more minutes" fades the whole
   * house); the hall breathes with it. The TV flicker under the living room
   * door never stops. Nobody has ever seen the TV. */
  function glowTick(t, dt, dim) {
    var on = lightsOn ? 1 : 0.06;
    var breathe = 0.94 + 0.06 * Math.sin(t * 0.8);
    [bulbS, bulbN].forEach(function (b) {
      b.light.intensity = 2.7 * dim * on * breathe;
      b.bulb.material.emissiveIntensity = 2.0 * dim * on;
      if (b.halo) b.halo.material.opacity = 0.34 * dim * on * breathe;
    });
    hallFill.intensity = 0.5 * dim * on;
    if (livDoor.userData.spill) // somebody's shows are on in there
      livDoor.userData.spill.material.opacity = livDoor.userData.spillOp * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.3)));
    if (kitDoor.userData.spill) kitDoor.userData.spill.material.opacity = kitDoor.userData.spillOp * (0.9 + 0.1 * Math.sin(t * 0.4));
    bGlow.material.opacity = 0.08 + 0.05 * Math.sin(t * 0.9); // the basement, breathing
    var target = cloOpen ? -1.6 : 0;
    cloAnim += (target - cloAnim) * Math.min(1, dt * 7);
    cloDoorP.rotation.y = cloAnim;
  }

  return {
    group: g,
    space: function () { return space; },
    active: function () { return space === "hall" || mode !== "idle"; },
    busy: function () { return mode !== "idle"; },
    enter: enter, leave: leave, toggleDoor: toggleDoor,
    forceExit: function () { // bfcache restore etc: no walking, just be back home
      mode = "idle"; space = "bedroom";
      if (ctx.doorPivot) ctx.doorPivot.rotation.y = 0;
      cloOpen = false; cloAnim = 0; cloDoorP.rotation.y = 0;
    },
    camTick: camTick, glowTick: glowTick, refreshPhotos: refreshPhotos
  };
}
