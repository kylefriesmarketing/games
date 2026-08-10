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
  var W_IN = -7.45, E_IN = -4.35, XC = -5.90, Z_S = 8.8, Z_N = -3.45, CEIL = 2.95;
  var HW = E_IN - W_IN; // 3.1 — hall width, so the caps/ceiling/skirting follow it
  // ⚠️ The hall runs PAST the bedroom now. The east wall is the back of the
  // bedroom's left wall, which only exists for z -3.5..3.5 — so everything south of
  // BED_END has no east wall unless the hall builds its own. It was already 1m short
  // before the extension; nobody noticed because it was behind the camera.
  var BED_END = 3.45;
  // the sliding door's opening, needed up here because capS is built in PIECES
  // around it — a glass door in front of a solid wall shows you a solid wall
  var SD_W = 2.24, SD_H = 2.08;
  // and the front doorway's centre, for the same reason — capN is cut around it
  var FRONT_X = -5.70;

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
  // tiled along its length, not stretched — the diamond parade has to keep the same
  // spacing now that the runner is 11m instead of 6.6
  runT.wrapS = THREE.ClampToEdgeWrapping; runT.wrapT = THREE.RepeatWrapping;
  runT.repeat.set(1, 1.65);
  var runner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 11.0),
    new THREE.MeshStandardMaterial({ map: runT, roughness: 0.97 }));
  // on the doorway's axis, so the runner points at the front door down its length
  runner.rotation.x = -Math.PI / 2; runner.position.set(-5.70, 0.009, 2.4); runner.receiveShadow = true;
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
  // the hall's OWN east wall, south of where the bedroom stops
  var eastS = box(0.1, 3.4, Z_S + 0.1 - BED_END, hwallM);
  eastS.position.set(E_IN + 0.05, 1.7, (BED_END + Z_S + 0.1) / 2); add(eastS);
  // the NORTH cap is cut too, now that the front door opens onto a real porch.
  // (Same lesson as capS: a door you can walk through needs a hole, not a slab.)
  var FDO = { x0: FRONT_X - 0.63, x1: FRONT_X + 0.63, y1: 2.30 };
  [[W_IN - 0.1, FDO.x0, 0, 3.4],
   [FDO.x1, E_IN + 0.1, 0, 3.4],
   [W_IN - 0.1, E_IN + 0.1, FDO.y1, 3.4]].forEach(function (p) {
    var seg = box(p[1] - p[0], p[3] - p[2], 0.1, hwallM);
    seg.position.set((p[0] + p[1]) / 2, (p[2] + p[3]) / 2, Z_N - 0.05); add(seg);
  });
  // ⚠️ the SOUTH cap has a hole in it. Built as one slab (like capN) the sliding
  // door renders against solid wallpaper and the yard, the deck and the porch light
  // are all sealed behind it — which is exactly what the first pass did.
  var SDO = { x0: XC - (SD_W / 2 + 0.09), x1: XC + (SD_W / 2 + 0.09), y1: SD_H + 0.13 };
  [[W_IN - 0.1, SDO.x0, 0, 3.4],            // west of the opening
   [SDO.x1, E_IN + 0.1, 0, 3.4],            // east of it
   [W_IN - 0.1, E_IN + 0.1, SDO.y1, 3.4]]   // the header above it
    .forEach(function (p) {
      var seg = box(p[1] - p[0], p[3] - p[2], 0.1, hwallM);
      seg.position.set((p[0] + p[1]) / 2, (p[2] + p[3]) / 2, Z_S + 0.05); add(seg);
    });
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
  // the hall table lives beside the doorway now — that's what the widening bought
  var TBL_X = -4.60, TBL_Z = -3.15;
  var front = new THREE.Group(); front.position.set(FRONT_X, 0, Z_N + 0.01); add(front);
  // the slab hangs on a real hinge now — the porch is on the other side of it.
  // Pivot on the WEST jamb so it swings inward across the west half of the opening,
  // away from the hall table; rotating -1.95 rad lays it along the hall wall and
  // leaves the walk line clear.
  var fPivot = new THREE.Group(); fPivot.position.set(-0.49, 0, 0.03); front.add(fPivot);
  var fDoor = box(0.98, 2.08, 0.06, mat(0x5a3a24, 0.65)); fDoor.position.set(0.49, 1.04, 0); fPivot.add(fDoor);
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
  fkT.position.set(0.85, 1.02, 0.06); fPivot.add(fkT); // rides the slab, obviously
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
    tag(m, "the front door", function () { stepOut(); },
      "the front door — click to step out onto the porch");
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

  /* ---- OUT THE FRONT: the porch, the yard, the street (a THIRD space) ---------
   * You can actually step outside now. The porch is a real place you stand on —
   * same contract as the hall, so the house keeps its rule that you only get
   * anywhere by walking there.
   *
   * ⚠️ Everything out here is lit by PHASE, not by the hall's bulbs. setPhase()
   * is called from room.js's applyPhaseObj, so the sky, the sun and the street
   * agree with the bedroom window — which looks at THIS street. Get them out of
   * step and the house stops being one place.
   */
  var GROUND = -0.45;                       // the yard sits below the floor slab
  var HOUSE_F = Z_N - 0.05;                 // the front face of the house
  var yardG = new THREE.Group(); add(yardG);
  function yadd(m) { yardG.add(m); return m; }
  function ytag(m, name, action, hint) {    // porch clickables live in their own space
    clickable(m, name, action, hint); m.userData.space = "porch"; return m;
  }

  // --- the house from outside: siding, and a fan-light over the door
  var sideT = canvasTex(128, 128, function (c, w, h) {
    c.fillStyle = "#8d8f84"; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 8; i++) {           // lap siding, one board at a time
      c.fillStyle = i % 2 ? "#93958a" : "#87897e";
      c.fillRect(0, i * 16, w, 15);
      c.fillStyle = "rgba(0,0,0,0.22)"; c.fillRect(0, i * 16 + 14, w, 2);
    }
  });
  sideT.wrapS = sideT.wrapT = THREE.RepeatWrapping; sideT.repeat.set(4, 3);
  var sidingM = new THREE.MeshStandardMaterial({ map: sideT, roughness: 0.95 });
  sidingM.color.setHex(0xeae6da);   // same reason as the neighbours: it multiplies
  [[W_IN - 0.1, FDO.x0], [FDO.x1, E_IN + 0.1]].forEach(function (p) {
    var sv = box(p[1] - p[0], 3.4, 0.04, sidingM);
    sv.position.set((p[0] + p[1]) / 2, 1.7, HOUSE_F - 0.03); yadd(sv);
  });
  var sideHdr = box(HW + 0.2, 3.4 - FDO.y1, 0.04, sidingM);
  sideHdr.position.set(XC, (FDO.y1 + 3.4) / 2, HOUSE_F - 0.03); yadd(sideHdr);
  var trimM = mat(0xe8e2d4, 0.85);
  [[-0.63, 0], [0.63, 0]].forEach(function (t) {   // door casing, from outside
    var cs = box(0.12, 2.36, 0.06, trimM); cs.position.set(FRONT_X + t[0], 1.18, HOUSE_F - 0.06); yadd(cs);
  });
  var csHead = box(1.38, 0.12, 0.06, trimM); csHead.position.set(FRONT_X, 2.36, HOUSE_F - 0.06); yadd(csHead);
  var fanOut = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xffdca8, emissive: 0xffc98a, emissiveIntensity: 0.5, roughness: 0.6 }));
  fanOut.position.set(FRONT_X, 2.44, HOUSE_F - 0.07); fanOut.rotation.y = Math.PI; yadd(fanOut);

  // --- the porch: deck, posts, a roof over it, a light, somewhere to sit
  var deckT = canvasTex(128, 128, function (c, w, h) {
    c.fillStyle = "#6b7168"; c.fillRect(0, 0, w, h);
    for (var b = 0; b < 6; b++) {
      c.fillStyle = ["#717767", "#686e60", "#757b6b", "#6c7264"][b % 4];
      c.fillRect(0, b * 21 + 1, w, 19);
      c.strokeStyle = "rgba(20,22,16,0.5)"; c.lineWidth = 2;
      c.strokeRect(-2, b * 21, w + 4, 20);
    }
  });
  deckT.wrapS = deckT.wrapT = THREE.RepeatWrapping; deckT.repeat.set(3, 2);
  var pdeckM = new THREE.MeshStandardMaterial({ map: deckT, roughness: 0.95 });
  var PX0 = -8.45, PX1 = -3.25, PZ0 = HOUSE_F, PZ1 = HOUSE_F - 2.35;
  var pdeck = box(PX1 - PX0, 0.14, PZ0 - PZ1, pdeckM);
  pdeck.position.set((PX0 + PX1) / 2, -0.07, (PZ0 + PZ1) / 2); pdeck.receiveShadow = true; yadd(pdeck);
  ytag(pdeck, "the porch", null, "the porch. the boards know exactly which one creaks.");
  var pskirt = box(PX1 - PX0, 0.32, 0.06, mat(0x4a4a40, 0.9));
  pskirt.position.set((PX0 + PX1) / 2, -0.30, PZ1); yadd(pskirt);
  var postM = mat(0xe4dece, 0.85);
  [PX0 + 0.22, PX1 - 0.22].forEach(function (px) {
    var pst = box(0.14, 2.85, 0.14, postM); pst.position.set(px, 1.42, PZ1 + 0.2); pst.castShadow = true; yadd(pst);
  });
  var proof = box(PX1 - PX0 + 0.5, 0.14, PZ0 - PZ1 + 0.55, mat(0x4a3a2e, 0.9));
  proof.position.set((PX0 + PX1) / 2, 2.92, (PZ0 + PZ1) / 2 - 0.1); yadd(proof);
  var pfascia = box(PX1 - PX0 + 0.5, 0.2, 0.07, postM);
  pfascia.position.set((PX0 + PX1) / 2, 2.82, PZ1 - 0.27); yadd(pfascia);
  var prail = box(PX1 - PX0, 0.07, 0.07, postM);
  prail.position.set((PX0 + PX1) / 2, 0.86, PZ1 + 0.05); yadd(prail);
  for (var bal = 0; bal < 17; bal++) {                 // balusters, skipping the steps
    var bxp = PX0 + 0.25 + bal * ((PX1 - PX0 - 0.5) / 16);
    if (bxp > FRONT_X - 0.75 && bxp < FRONT_X + 0.75) continue;
    var bl2 = box(0.05, 0.78, 0.05, postM); bl2.position.set(bxp, 0.45, PZ1 + 0.05); yadd(bl2);
  }
  // porch light by the door, and it is the one that answers the knock
  var plampBody = box(0.14, 0.24, 0.12, mat(0x2a2119, 0.7));
  plampBody.position.set(FRONT_X + 0.95, 2.06, HOUSE_F - 0.12); yadd(plampBody);
  var plampGlass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 0.09),
    new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffd9a0, emissiveIntensity: 1.4, roughness: 0.5 }));
  plampGlass.position.set(FRONT_X + 0.95, 2.05, HOUSE_F - 0.12); yadd(plampGlass);
  var porchLite = new THREE.PointLight(0xffd2a0, 1.9, 8, 1.7);
  porchLite.position.set(FRONT_X + 0.8, 2.0, HOUSE_F - 0.5); yadd(porchLite);
  ytag(plampGlass, "the porch light", null, "the porch light. left on for whoever isn't home yet.");
  // a chair nobody has sat in since the summer
  var chSeat = box(0.5, 0.06, 0.46, mat(0x6a7a5e, 0.9)); chSeat.position.set(PX0 + 0.85, 0.42, PZ1 + 0.62); yadd(chSeat);
  var chBack = box(0.5, 0.5, 0.06, mat(0x6a7a5e, 0.9)); chBack.position.set(PX0 + 0.85, 0.68, PZ1 + 0.4); yadd(chBack);
  [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]].forEach(function (l) {
    var lg = box(0.05, 0.4, 0.05, mat(0x5a6a50, 0.9));
    lg.position.set(PX0 + 0.85 + l[0], 0.2, PZ1 + 0.62 + l[1]); yadd(lg);
  });
  ytag(chSeat, "the porch chair", null, "one chair. there used to be two.");
  // steps down to the path
  [[0, -0.06], [1, -0.19], [2, -0.32]].forEach(function (s) {
    var stp = box(1.5, 0.13, 0.32, pdeckM);
    stp.position.set(FRONT_X, s[1], PZ1 - 0.16 - s[0] * 0.32); yadd(stp);
  });

  /* ---- THE YARD ---------------------------------------------------------------
   * ⚠️ REBUILT TO SCALE. The first pass put 5m houses 19m away across a 6m road,
   * which is why the street read as a diorama: at that ratio everything is
   * doll-sized. Real setbacks are ~28m porch-to-porch across a ~9m road, and a
   * house is 10-12m wide, not 5. The numbers below are the corrected ones and the
   * whole layout hangs off them — moving one means moving the row.
   *
   * Depth comes from OVERLAP, not from distance: near hedge, path, street trees,
   * parked cars, road, far kerb, far hedges, houses, their trees. Nine layers
   * between you and the sky, plus fog to close it off. */
  var Z_WALK = -17.0, Z_KERB = -18.8, Z_ROADF = -27.6, Z_FKERB = -29.4, Z_NFACE = -34.0;
  var grassM = new THREE.MeshStandardMaterial({ color: 0x54754a, roughness: 1 });
  // ⚠️ TWO strips, not one big plane. A single lawn spanning the whole depth sits at
  // GROUND while the road sits at GROUND-0.06, so the grass rendered straight over
  // the top of the road and the street simply wasn't there.
  [[4.0, Z_WALK], [Z_FKERB, -52]].forEach(function (lz) {
    var lw = new THREE.Mesh(new THREE.PlaneGeometry(80, Math.abs(lz[0] - lz[1])), grassM);
    lw.rotation.x = -Math.PI / 2;
    lw.position.set(-5.0, GROUND, (lz[0] + lz[1]) / 2); lw.receiveShadow = true; yadd(lw);
  });
  var pathM = mat(0x8a867a, 0.95);
  var path = box(1.3, 0.06, 10.6, pathM); path.position.set(FRONT_X, GROUND + 0.02, -11.7); yadd(path);
  ytag(path, "the front walk", null, "the front walk. the third slab has been cracked since forever.");

  /* ---- things that grow -------------------------------------------------------
   * Every canopy is registered in `swayers` and the wind moves them in glowTick.
   * Three blobs per tree, offset and different sizes — one sphere reads as a
   * lollipop and that is what a placeholder looks like. */
  var swayers = [];
  var barkM = mat(0x4a3a2c, 0.95);
  function treeAt(x, z, h, spread, leafC, tilt) {
    var g2 = new THREE.Group(); g2.position.set(x, GROUND, z); yadd(g2);
    // ⚠️ trunk is 0.72 of the height, not 0.62. Street trees have to be LIMBED UP or
    // the canopy sits at eye level and the row becomes a wall — the first pass put
    // four of them across the near kerb and you couldn't see the street at all.
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.07, h * 0.74, 7), barkM);
    trunk.position.y = h * 0.37; trunk.rotation.z = (tilt || 0); g2.add(trunk);
    var leafM = new THREE.MeshStandardMaterial({ color: leafC, roughness: 0.98, flatShading: true });
    var can = new THREE.Group(); can.position.y = h * 0.74; g2.add(can);
    [[0, 0, 0, 1], [spread * 0.42, h * 0.13, spread * 0.2, 0.72], [-spread * 0.36, h * 0.09, -spread * 0.26, 0.66]]
      .forEach(function (b) {
        var blob = new THREE.Mesh(new THREE.IcosahedronGeometry(spread * 0.5 * b[3], 0), leafM);
        blob.position.set(b[0], b[1], b[2]); blob.scale.y = 0.82; blob.castShadow = true; can.add(blob);
      });
    swayers.push({ o: can, ph: x * 0.7 + z * 0.3, amp: 0.012 + spread * 0.004 });
    return g2;
  }
  function shrubAt(x, z, r, c) {
    var s2 = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.98, flatShading: true }));
    s2.position.set(x, GROUND + r * 0.62, z); s2.scale.y = 0.74; yadd(s2);
    swayers.push({ o: s2, ph: x + z, amp: 0.01 });
    return s2;
  }
  function hedgeAt(x0, x1, z, h, d, c) {
    var hm = new THREE.MeshStandardMaterial({ color: c, roughness: 0.99, flatShading: true });
    var n = Math.max(2, Math.round((x1 - x0) / 0.85));
    for (var i = 0; i < n; i++) {                       // lumpy, not a box
      var bx = x0 + (i + 0.5) * ((x1 - x0) / n);
      var lump = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.62, 0), hm);
      lump.position.set(bx, GROUND + h * 0.5, z + (i % 2 ? 0.05 : -0.05));
      lump.scale.set(1.15, 0.78, d / (h * 1.24)); yadd(lump);
    }
  }
  // our own planting: a hedge along the porch, shrubs at the corners, one big tree
  hedgeAt(PX0 - 0.1, FRONT_X - 0.85, PZ1 - 0.35, 0.8, 0.7, 0x3f6136);
  hedgeAt(FRONT_X + 0.85, PX1 + 0.1, PZ1 - 0.35, 0.8, 0.7, 0x3f6136);
  shrubAt(PX0 - 0.9, PZ1 - 0.5, 0.55, 0x47693c);
  shrubAt(PX1 + 0.9, PZ1 - 0.6, 0.48, 0x436439);
  // ONE tree in our own yard, and pushed well off the sightline down the path
  treeAt(FRONT_X + 5.8, -10.4, 6.6, 4.4, 0x3d6234, -0.04);
  [[-1.2, -7.4, 0.34], [-2.0, -8.1, 0.28], [1.3, -7.8, 0.3]].forEach(function (f) {
    shrubAt(FRONT_X + f[0], f[1], f[2], 0x5c7a3a);      // the flowerbed by the path
  });
  // ⚠️ the street trees are on the FAR verge, not ours. Across the road they frame
  // the houses and give the middle distance something to overlap; on the near kerb
  // they were 12m from the camera and simply blocked the whole street.
  [[-19.5, 7.4, 5.0], [-12.5, 6.6, 4.4], [-2.5, 7.8, 5.4], [9.0, 6.8, 4.6]].forEach(function (t2, ti) {
    treeAt(t2[0], Z_FKERB + 1.1, t2[1], t2[2], ti % 2 ? 0x3a5c31 : 0x406537, 0);
  });
  // mailbox at the kerb
  var mbPost = box(0.09, 1.05, 0.09, mat(0x4a3a28, 0.85)); mbPost.position.set(FRONT_X + 1.5, GROUND + 0.52, Z_WALK + 0.6); yadd(mbPost);
  var mbBox = box(0.22, 0.24, 0.42, mat(0x9aa2a8, 0.5)); mbBox.position.set(FRONT_X + 1.5, GROUND + 1.14, Z_WALK + 0.6); yadd(mbBox);
  var mbFlag = box(0.03, 0.18, 0.05, mat(0xb03a2e, 0.7)); mbFlag.position.set(FRONT_X + 1.63, GROUND + 1.3, Z_WALK + 0.7); yadd(mbFlag);
  ytag(mbBox, "the mailbox", null, "the mailbox. the flag is up, which means something is going OUT.");
  // the bike somebody dropped instead of parking
  var bikeG = new THREE.Group(); bikeG.position.set(FRONT_X - 2.3, GROUND, -8.4); bikeG.rotation.y = 0.7; yadd(bikeG);
  [-0.42, 0.42].forEach(function (wz) {
    var wh = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 18), mat(0x24262a, 0.7));
    wh.position.set(0, 0.1, wz); wh.rotation.x = 1.35; bikeG.add(wh);
  });
  var bkFrame = box(0.06, 0.06, 0.8, mat(0xc23a2e, 0.5)); bkFrame.position.set(0, 0.2, 0); bkFrame.rotation.x = 0.16; bikeG.add(bkFrame);
  var bkSeat = box(0.1, 0.05, 0.2, mat(0x1d1f22, 0.7)); bkSeat.position.set(0, 0.3, -0.24); bikeG.add(bkSeat);
  var bkBar = box(0.42, 0.05, 0.05, mat(0x24262a, 0.6)); bkBar.position.set(0, 0.34, 0.3); bikeG.add(bkBar);
  bikeG.children.forEach(function (m) { ytag(m, "the bike", null, "dropped, not parked. it has always been dropped, not parked."); });

  // --- the driveway, running down the side to the garage the hall keeps taped shut
  var driveM = mat(0x3e4048, 0.95);
  var drive = box(3.2, 0.06, 23.2, driveM); drive.position.set(-11.2, GROUND + 0.02, -7.3); yadd(drive);
  ytag(drive, "the driveway", null, "the driveway. it goes down the side to the garage.");
  var garM = new THREE.MeshStandardMaterial({ map: sideT, roughness: 0.95 });
  var garage = box(4.7, 3.0, 4.4, garM); garage.position.set(-9.9, 1.5 + GROUND, 6.4); yadd(garage);
  var garRoof = box(5.1, 0.16, 4.8, mat(0x3a2f26, 0.9)); garRoof.position.set(-9.9, 3.08 + GROUND, 6.4); yadd(garRoof);
  var garDoorT = canvasTex(128, 96, function (c, w, h) {
    c.fillStyle = "#b9bcb4"; c.fillRect(0, 0, w, h);
    for (var p = 0; p < 4; p++) {                       // four panels, like every garage door
      c.strokeStyle = "rgba(40,44,40,0.55)"; c.lineWidth = 3;
      c.strokeRect(6, p * 24 + 4, w - 12, 18);
    }
  });
  var garDoor = box(3.4, 2.3, 0.1, new THREE.MeshStandardMaterial({ map: garDoorT, roughness: 0.7 }));
  garDoor.position.set(-10.4, 1.15 + GROUND, 4.18); yadd(garDoor);
  ytag(garDoor, "the garage", null, "the garage, from the outside. still shut. 2027.");
  // the car, parked where it always is
  var carG = new THREE.Group(); carG.position.set(-11.2, GROUND, -8.6); yadd(carG);
  var carBody = box(1.9, 0.62, 4.3, mat(0x6b2f36, 0.5)); carBody.position.y = 0.62; carG.add(carBody);
  var carCab = box(1.72, 0.56, 2.1, mat(0x5e2a30, 0.5)); carCab.position.set(0, 1.18, -0.1); carG.add(carCab);
  var carGlass = new THREE.MeshStandardMaterial({ color: 0x1d2630, roughness: 0.15 });
  [[0, -1.16, 1.66, 0.5], [0, 0.96, 1.66, 0.5]].forEach(function (gp) {
    var gw = box(gp[2], gp[3], 0.05, carGlass); gw.position.set(gp[0], 1.2, gp[1]); carG.add(gw);
  });
  [[-0.9, -1.4], [0.9, -1.4], [-0.9, 1.4], [0.9, 1.4]].forEach(function (wp) {
    var tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), mat(0x1a1c1e, 0.85));
    tyre.rotation.z = Math.PI / 2; tyre.position.set(wp[0], 0.34, wp[1]); carG.add(tyre);
  });
  carG.children.forEach(function (m) { ytag(m, "the car", null, "the car. it starts most mornings."); });

  // --- the street: sidewalk, kerb, an 8.8m road (was 6.2 and read as a lane)
  var roadM = mat(0x2a2c31, 0.98);
  var road = box(78, 0.05, Z_ROADF - Z_KERB, roadM);
  road.position.set(-5.0, GROUND - 0.06, (Z_KERB + Z_ROADF) / 2); yadd(road);
  var walkM = mat(0x7e7a72, 0.95);
  [[Z_WALK - 0.9, 1.8], [Z_FKERB + 0.9, 1.8]].forEach(function (sw) {
    var s3 = box(78, 0.06, sw[1], walkM); s3.position.set(-5.0, GROUND + 0.02, sw[0]); yadd(s3);
  });
  [Z_KERB, Z_ROADF].forEach(function (kz) {
    var kb = box(78, 0.18, 0.2, mat(0x8a867e, 0.9)); kb.position.set(-5.0, GROUND - 0.01, kz); yadd(kb);
  });
  for (var dash = 0; dash < 22; dash++) {                // centre line
    var dl = box(2.0, 0.02, 0.15, mat(0xb8b090, 0.9));
    dl.position.set(-42 + dash * 4.2, GROUND - 0.03, (Z_KERB + Z_ROADF) / 2); yadd(dl);
  }
  var slPost = box(0.14, 5.2, 0.14, mat(0x3a3d42, 0.6)); slPost.position.set(-2.6, GROUND + 2.6, Z_WALK - 1.4); yadd(slPost);
  var slArm = box(1.1, 0.1, 0.1, mat(0x3a3d42, 0.6)); slArm.position.set(-3.15, GROUND + 5.16, Z_WALK - 1.4); yadd(slArm);
  var slHead = box(0.56, 0.15, 0.28, mat(0x2a2d31, 0.6)); slHead.position.set(-3.66, GROUND + 5.04, Z_WALK - 1.4); yadd(slHead);
  var slLamp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffdca0, emissiveIntensity: 1.6, roughness: 0.5 }));
  slLamp.position.set(-3.66, GROUND + 4.94, Z_WALK - 1.4); yadd(slLamp);
  var streetLight = new THREE.PointLight(0xffe0b0, 1.5, 18, 1.6);
  streetLight.position.set(-3.66, GROUND + 4.7, Z_WALK - 1.4); yadd(streetLight);
  ytag(slPost, "the streetlight", null, "the streetlight. it buzzes, and it has always buzzed.");
  var slMoths = [];
  for (var sm = 0; sm < 4; sm++) {
    var smo = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    smo.position.set(-3.66, GROUND + 4.9, Z_WALK - 1.4); yadd(smo);
    slMoths.push({ m: smo, ph: sm * 1.7, r: 0.3 + sm * 0.12, sp: 1.2 + sm * 0.4 });
  }

  /* --- the houses. FOUR of them, all different: different widths, heights, roof
   * pitches, sidings, setbacks, and different things in their yards. The first
   * pass was three identical boxes evenly spaced, which is the single loudest
   * "this is placeholder geometry" signal there is. */
  var nbWin = [], tvWin = null;
  var NB = [
    // ⚠️ body colours are near-WHITE tints. `sideT` is already a mid-grey siding
    // canvas, and material.color MULTIPLIES it — tinting with another grey squares
    // the value and every house came out a near-black silhouette in daylight.
    { x: -24.5, w: 11.0, d: 7.0, h: 4.6, back: 0.0, body: 0xf2efe4, roof: 0x6a5a48, pitch: 2.0, gar: true,  lit: [1, 0, 1] },
    { x: -11.5, w: 12.5, d: 7.6, h: 5.1, back: 1.4, body: 0xd8e8e2, roof: 0x54646a, pitch: 2.6, gar: false, lit: [0, 1, 0] },
    { x: 2.0,   w: 10.0, d: 6.6, h: 4.3, back: -0.8, body: 0xf6e4cc, roof: 0x7a5442, pitch: 1.7, gar: true,  lit: [1, 1, 0] },
    { x: 14.5,  w: 11.5, d: 7.2, h: 4.9, back: 0.9, body: 0xe6e2d6, roof: 0x5c564e, pitch: 2.3, gar: false, lit: [0, 0, 1] },
  ];
  NB.forEach(function (n, ni) {
    var fz = Z_NFACE - n.back, cz = fz - n.d / 2;
    var body = box(n.w, n.h, n.d, new THREE.MeshStandardMaterial({ map: sideT, color: n.body, roughness: 0.95 }));
    body.position.set(n.x, GROUND + n.h / 2, cz); yadd(body);
    var roofN = new THREE.Mesh(new THREE.ConeGeometry(n.w * 0.78, n.pitch, 4), mat(n.roof, 0.92));
    roofN.rotation.y = Math.PI / 4; roofN.position.set(n.x, GROUND + n.h + n.pitch / 2 - 0.1, cz); yadd(roofN);
    // three windows and a door, and not all the windows agree about bedtime
    n.lit.forEach(function (on, wi) {
      var wm = new THREE.MeshStandardMaterial({
        color: on ? 0xffdca0 : 0x161c24,
        emissive: on ? 0xffca82 : 0x000000, emissiveIntensity: on ? 1.1 : 0, roughness: 0.5,
      });
      var wmm = box(1.1, 1.15, 0.08, wm);
      wmm.position.set(n.x + (wi - 1) * (n.w * 0.3), GROUND + n.h * 0.55, fz + 0.05); yadd(wmm);
      if (on) nbWin.push(wm);
      if (ni === 2 && wi === 0) tvWin = wm;          // somebody opposite is still watching something
    });
    var nd = box(1.0, 2.1, 0.1, mat(0x4a3524, 0.75));
    nd.position.set(n.x + n.w * 0.34, GROUND + 1.05, fz + 0.06); yadd(nd);
    if (n.gar) {                                      // a garage, and a drive up to it
      var gd = box(3.2, 2.2, 0.1, mat(0xb0b3ab, 0.7));
      gd.position.set(n.x - n.w * 0.28, GROUND + 1.1, fz + 0.06); yadd(gd);
      var nDrive = box(3.4, 0.05, Z_FKERB - fz, driveM);
      nDrive.position.set(n.x - n.w * 0.28, GROUND + 0.02, (fz + Z_FKERB) / 2); yadd(nDrive);
    }
    // their yards: a hedge along the walk and a tree, all slightly different
    // a hedge along their walk; the trees live on the verge, not stacked in front
    hedgeAt(n.x - n.w * 0.5, n.x + n.w * 0.5, fz + 1.6, 0.75 + (ni % 3) * 0.1, 0.7,
            ni % 2 ? 0x3b5b33 : 0x44653a);
  });
  // a car parked across the road, and one on our side — more layers to see past
  function parkedCar(x, z, ry, c1, c2) {
    var cg = new THREE.Group(); cg.position.set(x, GROUND, z); cg.rotation.y = ry; yadd(cg);
    var b2 = box(1.9, 0.6, 4.2, mat(c1, 0.5)); b2.position.y = 0.6; cg.add(b2);
    var c3 = box(1.72, 0.54, 2.0, mat(c2, 0.5)); c3.position.set(0, 1.15, -0.1); cg.add(c3);
    [[-0.9, -1.35], [0.9, -1.35], [-0.9, 1.35], [0.9, 1.35]].forEach(function (wp) {
      var ty = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12), mat(0x1a1c1e, 0.85));
      ty.rotation.z = Math.PI / 2; ty.position.set(wp[0], 0.33, wp[1]); cg.add(ty);
    });
    return cg;
  }
  parkedCar(-17.6, Z_KERB - 1.6, Math.PI / 2, 0x2f4a5e, 0x27404f);
  parkedCar(6.4, Z_ROADF + 1.6, -Math.PI / 2, 0x4a4438, 0x3d3830);

  // --- the neighbours on OUR side, set back and half out of frame. These are the
  // overlap that makes the yard feel like it's in a street rather than on a stage.
  [[-22.5, -7.5, 12.0, 5.2, 0xe8e4d8], [12.5, -6.2, 11.0, 4.8, 0xdfe6e4]].forEach(function (s4) {
    var sb = box(s4[2], s4[3], 9.0, new THREE.MeshStandardMaterial({ map: sideT, color: s4[4], roughness: 0.95 }));
    sb.position.set(s4[0], GROUND + s4[3] / 2, s4[1] - 4.5); yadd(sb);
    var sr = new THREE.Mesh(new THREE.ConeGeometry(s4[2] * 0.78, 2.3, 4), mat(0x36302a, 0.92));
    sr.rotation.y = Math.PI / 4; sr.position.set(s4[0], GROUND + s4[3] + 1.05, s4[1] - 4.5); yadd(sr);
    hedgeAt(s4[0] - 5, s4[0] + 5, s4[1] + 0.6, 0.9, 0.8, 0x3d5f34);
  });

  // --- the sky. One big backdrop that the phase repaints.
  var skyC = document.createElement("canvas"); skyC.width = 8; skyC.height = 128;
  var skyCtx = skyC.getContext("2d");
  var skyTex = new THREE.CanvasTexture(skyC);
  // ⚠️ THE REAL FIX, after two rounds of just painting it darker: util.js's canvasTex
  // never sets a colour space, so a canvas is decoded as LINEAR data. A #141b2b night
  // sky (0.078) is then treated as 0.078 of LIGHT, multiplied by exposure 2.42 and
  // tone-mapped — arriving on screen at roughly rgb(115), a grey afternoon. Declaring
  // sRGB decodes it to 0.0075 first and it lands where it was painted. Everything
  // else in this room is authored against the wrong behaviour, so this is set HERE
  // and not in canvasTex — changing that would re-tint the entire house.
  skyTex.colorSpace = THREE.SRGBColorSpace;
  // ⚠️ z -74, BEHIND everything. At -30.5 it stood in front of the houses opposite
  // (which are at -37) and quietly deleted the entire far side of the street — the
  // geometry was all there, the backdrop was just parked on top of it.
  var skyDome = new THREE.Mesh(new THREE.PlaneGeometry(200, 96),
    new THREE.MeshBasicMaterial({ map: skyTex }));
  skyDome.position.set(-5.0, GROUND + 26, -74); yadd(skyDome);
  skyDome.material.fog = false;   // the sky IS the horizon; fogging it greys it out
  // ⚠️ Fog is set ONCE and left on, with `near` at 22, because toggling scene.fog
  // recompiles every material in the house and you'd eat that hitch on every trip
  // through the front door. Nothing indoors is more than ~15 units from its camera
  // — the bedroom's far wall is 7.5, the hall's slider is 14 — so at near 22 this
  // only ever touches the yard, which is exactly the layer that needed closing off.
  scene.fog = new THREE.Fog(0x1a2438, 24, 88);
  var yardHemi = new THREE.HemisphereLight(0x8fa8c8, 0x2a3524, 0.5); yadd(yardHemi);
  var yardSun = new THREE.DirectionalLight(0xbcc8da, 0.5);
  yardSun.position.set(-12, 14, -20); yadd(yardSun);

  // ⚠️ the yard's hours are the ROOM's hours. The bedroom window looks at this
  // same street; if these two ever drift the house stops being one place.
  // these are honest colours now that skyTex declares sRGB — what you paint is what
  // you get, so they can be read against the bedroom window's palette directly
  var PORCH_SKY = {
    day:     { top: "#4a6f9e", bot: "#a8c0d4", hemi: 0.85, sun: 0.85, sunC: 0xd8dfe8, hemiC: 0x9fb8d8, lamp: 0.15 },
    dusk:    { top: "#2e4468", bot: "#c88a5e", hemi: 0.58, sun: 0.5,  sunC: 0xe8a06a, hemiC: 0x7a7a92, lamp: 0.7 },
    evening: { top: "#16233f", bot: "#46587c", hemi: 0.66, sun: 0.48, sunC: 0x8fa8cc, hemiC: 0x6a7d9e, lamp: 1 },
    night:   { top: "#0a1020", bot: "#202c44", hemi: 0.46, sun: 0.34, sunC: 0x7d94bc, hemiC: 0x4c5e7e, lamp: 1 },
  };
  var porchPhase = "evening";
  function setPhase(name) {
    if (!PORCH_SKY[name]) name = "evening";
    porchPhase = name;
    var s = PORCH_SKY[name];
    var gr = skyCtx.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, s.top); gr.addColorStop(1, s.bot);
    skyCtx.fillStyle = gr; skyCtx.fillRect(0, 0, 8, 128);
    if (name === "night" || name === "evening") {          // stars, but only when there are stars
      for (var st2 = 0; st2 < 26; st2++) {
        skyCtx.fillStyle = "rgba(255,255,255," + (0.2 + Math.random() * 0.5).toFixed(2) + ")";
        skyCtx.fillRect(Math.random() * 8, Math.random() * 70, 1, 1);
      }
    }
    skyTex.needsUpdate = true;
    yardHemi.intensity = s.hemi; yardHemi.color.setHex(s.hemiC);
    yardSun.intensity = s.sun; yardSun.color.setHex(s.sunC);
    streetLight.intensity = 1.5 * s.lamp;
    slLamp.material.emissiveIntensity = 1.6 * s.lamp;
    porchLite.intensity = 1.9 * s.lamp;
    plampGlass.material.emissiveIntensity = 1.4 * s.lamp;
    fanOut.material.emissiveIntensity = 0.5 * s.lamp;
    nbWin.forEach(function (m) { m.emissiveIntensity = 1.1 * s.lamp; });
    if (scene.fog) scene.fog.color.set(s.bot);   // haze is the sky, near the ground
  }
  setPhase("evening");

  // --- a car goes past now and then. It is the only thing in this house that is
  // ever in a hurry.
  var passG = parkedCar(0, (Z_KERB + Z_ROADF) / 2 - 2.1, Math.PI / 2, 0x5a5f66, 0x4b5057);
  var passHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe9b0, emissiveIntensity: 1.8, roughness: 0.4 }));
  passHead.position.set(0, 0.62, -2.0); passG.add(passHead);
  var passLite = new THREE.PointLight(0xffe0b0, 0, 12, 1.8); passLite.position.set(0, 0.9, -3.0); passG.add(passLite);
  var passX = 999, passDir = 1, passWait = 6 + Math.random() * 14;

  // --- THE SILHOUETTE. The knock has been unanswered for the whole life of this
  // house. Open the door soon after one and somebody is on the path — and by the
  // time the door is actually open, they are not.
  var figG = new THREE.Group(); figG.position.set(FRONT_X + 0.35, GROUND, -8.6); figG.visible = false; yadd(figG);
  var figM = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1 });
  var figBody = box(0.46, 1.0, 0.28, figM); figBody.position.y = 0.92; figG.add(figBody);
  var figHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), figM);
  figHead.position.y = 1.57; figG.add(figHead);
  [-0.3, 0.3].forEach(function (lx) {
    var lg2 = box(0.15, 0.44, 0.18, figM); lg2.position.set(lx * 0.55, 0.22, 0); figG.add(lg2);
  });
  var figT = 0;              // >0 while they're standing there
  function knockCame() { figT = 7.0; }   // room.js's nightly knock arms it
  // the way back in, from the porch side
  var inHit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.3),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  inHit.position.set(FRONT_X, 1.05, HOUSE_F + 0.06); yadd(inHit);
  ytag(inHit, "the front door", function () { stepIn(); }, "back inside — the hall light is still on");

  /* ---- THE BACK OF THE HOUSE (south end) --------------------------------------
   * Turn around and the hall keeps going. A sliding glass door to the yard with
   * the blinds half drawn, the garage taped shut like every other room, the
   * laundry, and the corner where the boots and the chest freezer live. This is
   * the un-glamorous end of a house, which is exactly why it sells the house:
   * nobody builds a fake laundry nook. */
  var backG = new THREE.Group(); add(backG);
  function badd(m) { backG.add(m); return m; }

  // --- the yard, painted, seen through the glass. Three depths: a backdrop
  // canvas out past the fence, real deck boards just outside the sill, and the
  // blinds in front of everything. Layering is what stops it reading as a poster.
  // ⚠️ painted MUCH darker than it looks in the canvas. This is a MeshBasicMaterial,
  // so it skips lighting but still goes through ACES at exposure 1.45 in the
  // composite — the first pass used ordinary night colours and came out a pale
  // sunlit green. Everything here is roughly half the value you'd expect.
  var yardT = canvasTex(512, 320, function (c, w, h) {
    var sky = c.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, "#05080f"); sky.addColorStop(1, "#141b2b");
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    for (var s = 0; s < 40; s++) { // stars, same night as the bedroom window
      c.fillStyle = "rgba(255,255,255," + (0.2 + Math.random() * 0.45).toFixed(2) + ")";
      c.fillRect(Math.random() * w, Math.random() * h * 0.5, 2, 2);
    }
    c.fillStyle = "#0b120b"; c.fillRect(0, h * 0.58, w, h * 0.42);           // lawn
    c.fillStyle = "#140f0a";                                                 // the fence, board by board
    for (var b = 0; b < 26; b++) c.fillRect(b * 20 + 2, h * 0.40, 17, h * 0.20);
    c.fillRect(0, h * 0.44, w, 5); c.fillRect(0, h * 0.53, w, 5);
    c.fillStyle = "#080605";                                                 // next door, one light on
    c.fillRect(w * 0.60, h * 0.12, w * 0.30, h * 0.30);
    c.fillStyle = "rgba(255,206,138,0.8)"; c.fillRect(w * 0.66, h * 0.20, 26, 20);
    c.fillStyle = "#080b06";                                                 // the tree that drops things on the deck
    c.beginPath(); c.arc(w * 0.16, h * 0.30, 62, 0, 7); c.fill();
    c.fillRect(w * 0.15, h * 0.30, 10, h * 0.30);
  });
  var yard = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.9),
    new THREE.MeshBasicMaterial({ map: yardT }));
  yard.position.set(XC, 1.5, Z_S + 2.6); yard.rotation.y = Math.PI; badd(yard);

  var deckM = new THREE.MeshStandardMaterial({ color: 0x5b4530, roughness: 0.95 });
  var deck = box(3.4, 0.08, 1.5, deckM); deck.position.set(XC, -0.04, Z_S + 0.78); badd(deck);
  [[-0.24, 0.5], [-0.44, 1.0]].forEach(function (st) {                      // steps down to the lawn
    var s2 = box(2.0, 0.08, 0.34, deckM); s2.position.set(XC, st[0], Z_S + 1.5 + st[1] * 0.34); badd(s2);
  });
  [-1.5, 1.5].forEach(function (rx) {                                        // deck rail
    var rp = box(0.07, 0.8, 0.07, deckM); rp.position.set(XC + rx, 0.4, Z_S + 1.4); badd(rp);
  });
  var drail = box(3.2, 0.07, 0.07, deckM); drail.position.set(XC, 0.78, Z_S + 1.4); badd(drail);

  // --- the slider itself: aluminium frame, two panes, the east one clear
  var SD_Z = Z_S - 0.03; // (SD_W / SD_H live up with the shell — capS is cut around them)
  var alu = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.35, metalness: 0.55 });
  var glassM2 = new THREE.MeshStandardMaterial({
    color: 0xcfe2e8, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.16,
  });
  [[0, SD_H + 0.09, SD_W + 0.18, 0.09], [0, -0.03, SD_W + 0.18, 0.09]].forEach(function (f) {
    var fr = box(f[2], f[3], 0.14, alu); fr.position.set(XC + f[0], f[1], SD_Z); badd(fr);
  });
  [-1, 1].forEach(function (s) {
    var fr = box(0.09, SD_H + 0.2, 0.14, alu);
    fr.position.set(XC + s * (SD_W / 2 + 0.045), SD_H / 2, SD_Z); badd(fr);
  });
  var midStile = box(0.07, SD_H, 0.16, alu); midStile.position.set(XC, SD_H / 2, SD_Z - 0.02); badd(midStile);
  [-1, 1].forEach(function (s) {
    var pane = new THREE.Mesh(new THREE.PlaneGeometry(SD_W / 2 - 0.08, SD_H - 0.06), glassM2);
    pane.position.set(XC + s * SD_W / 4, SD_H / 2, SD_Z + s * 0.03); badd(pane);
  });
  var sdHandle = box(0.035, 0.30, 0.05, alu); sdHandle.position.set(XC + 0.16, 1.02, SD_Z - 0.06); badd(sdHandle);
  var sdTrack = box(SD_W + 0.18, 0.03, 0.16, mat(0x6a727a, 0.5)); sdTrack.position.set(XC, 0.02, SD_Z); badd(sdTrack);

  // --- vertical blinds, half drawn: slats bunched across the west pane, the east
  // pane left clear so there's an actual slice of yard to look at
  var blindRail = box(SD_W + 0.16, 0.07, 0.09, mat(0xd8d2c4, 0.9));
  blindRail.position.set(XC, SD_H + 0.02, SD_Z - 0.11); badd(blindRail);
  var slatM = new THREE.MeshStandardMaterial({ color: 0xb3ab98, roughness: 0.95, side: THREE.DoubleSide });
  for (var bl = 0; bl < 11; bl++) {
    var bx = XC - SD_W / 2 + 0.09 + bl * 0.105;                 // packed over the west half only
    var slat = new THREE.Mesh(new THREE.PlaneGeometry(0.10, SD_H - 0.12), slatM);
    slat.position.set(bx, SD_H / 2 - 0.04, SD_Z - 0.11);
    slat.rotation.y = 0.62 + (bl % 2) * 0.05;                    // turned, not flat — you see their edges
    badd(slat);
  }
  var blindWand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), mat(0xcfc8b6, 0.8));
  blindWand.position.set(XC - SD_W / 2 + 0.06, SD_H - 0.42, SD_Z - 0.13); badd(blindWand);

  // the porch light is OUTSIDE and shines in — the one real light at this end
  var porchLamp = box(0.16, 0.22, 0.12, mat(0x2a2119, 0.7));
  porchLamp.position.set(XC + 1.35, 2.26, Z_S + 0.16); badd(porchLamp);
  var porchGlass = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.09),
    new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffd9a0, emissiveIntensity: 1.5, roughness: 0.5 }));
  porchGlass.position.set(XC + 1.35, 2.24, Z_S + 0.16); badd(porchGlass);
  var porchLight = new THREE.PointLight(0xffd2a0, 1.5, 7, 1.8);
  porchLight.position.set(XC + 1.0, 2.2, Z_S + 0.5); badd(porchLight);
  var moths = [];
  for (var mo = 0; mo < 3; mo++) {
    var moth = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.035),
      new THREE.MeshBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    moth.position.set(XC + 1.35, 2.24, Z_S + 0.3); badd(moth);
    moths.push({ m: moth, ph: mo * 2.1, r: 0.18 + mo * 0.07, sp: 1.6 + mo * 0.5 });
  }
  [sdHandle, midStile].concat(backG.children.filter(function (c) { return c.material === glassM2; }))
    .forEach(function (m) {
      tag(m, "the sliding door", null, "the back yard — the grass needs cutting. summer 2027.");
    });
  tag(blindRail, "the blinds", null, "vertical blinds, half drawn. they have always been half drawn.");

  // --- THE GARAGE: taped like every other room that isn't yours yet
  var garDoor = slabDoor(W_IN + 0.03, 6.3, 0, 1.0, 0x3f4a52, "the garage door",
    "the garage — one car, a workbench, and everything that didn't fit. 2027.", 0xbfc8d8, 0.12);
  tapeX(garDoor, 1.0); plaque(garDoor, "GARAGE", "opening soon");

  // --- THE LAUNDRY: the truest thing at the back of any hallway
  var launG = new THREE.Group(); launG.position.set(E_IN - 0.34, 0, 5.45); add(launG);
  var applM = mat(0xe4e6e2, 0.45), applD = mat(0x2b2f33, 0.5);
  [-0.34, 0.34].forEach(function (lz, i) {
    var body = box(0.6, 0.88, 0.62, applM); body.position.set(0, 0.44, lz); body.castShadow = true; launG.add(body);
    var win = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 20), applD);
    win.rotation.z = Math.PI / 2; win.position.set(-0.30, 0.46, lz); launG.add(win);
    var glassW = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.03, 20),
      new THREE.MeshStandardMaterial({ color: i ? 0x39414a : 0x2a3038, roughness: 0.2 }));
    glassW.rotation.z = Math.PI / 2; glassW.position.set(-0.325, 0.46, lz); launG.add(glassW);
    var panel = box(0.05, 0.1, 0.5, applD); panel.position.set(-0.28, 0.83, lz); launG.add(panel);
    [-0.14, 0, 0.14].forEach(function (kz) {
      var kn = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10), mat(0x8f959b, 0.4));
      kn.rotation.z = Math.PI / 2; kn.position.set(-0.315, 0.83, lz + kz); launG.add(kn);
    });
  });
  var basket = box(0.34, 0.24, 0.26, mat(0x4d7ea8, 0.85)); basket.position.set(0.02, 1.0, -0.3); launG.add(basket);
  var wash = box(0.3, 0.1, 0.22, mat(0xd8cfc0, 0.95)); wash.position.set(0.02, 1.15, -0.3); launG.add(wash);
  var sock = box(0.12, 0.03, 0.07, mat(0xe8e2d2, 0.95));
  sock.position.set(-0.62, 0.015, 0.62); sock.rotation.y = 0.7; launG.add(sock);
  // bifold doors, folded open against the wall
  [-0.78, 0.78].forEach(function (bz) {
    var bf = box(0.06, 2.05, 0.34, mat(0x8a7a5c, 0.8)); bf.position.set(-0.1, 1.025, bz); launG.add(bf);
    var bf2 = box(0.3, 2.05, 0.06, mat(0x7d6f52, 0.8)); bf2.position.set(-0.28, 1.025, bz + (bz < 0 ? 0.17 : -0.17)); launG.add(bf2);
  });
  launG.children.forEach(function (m) {
    if (m.isMesh) tag(m, "the laundry", null, "the laundry. one sock has been down here since 1997.");
  });
  tag(sock, "the lost sock", null, "the sock. its twin is upstairs, which is not open yet.");

  // --- THE MUD ROOM: boots, leashes, a bowl, and the prints that prove a dog
  var mudG = new THREE.Group(); mudG.position.set(E_IN - 0.26, 0, 7.75); add(mudG);
  [[-0.30, 0x3a4a5e, 0.20], [-0.16, 0x3a4a5e, 0.20], [0.10, 0x5e3a2e, 0.16], [0.24, 0x5e3a2e, 0.16]]
    .forEach(function (bt) {
      var boot = box(0.16, bt[2], 0.12, mat(bt[1], 0.9));
      boot.position.set(0, bt[2] / 2, bt[0]); mudG.add(boot);
      var toe = box(0.2, 0.06, 0.12, mat(bt[1], 0.9)); toe.position.set(-0.03, 0.03, bt[0]); mudG.add(toe);
    });
  var hookRail = box(0.05, 0.06, 0.7, mat(0x4a3a24, 0.8)); hookRail.position.set(-0.06, 1.6, 0); mudG.add(hookRail);
  [-0.24, 0, 0.24].forEach(function (hz) {
    var hk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), mat(0x8f959b, 0.4));
    hk.rotation.x = Math.PI / 2; hk.position.set(-0.1, 1.55, hz); mudG.add(hk);
  });
  var leash = box(0.03, 0.42, 0.05, mat(0xa8202e, 0.85)); leash.position.set(-0.12, 1.34, -0.24); mudG.add(leash);
  var leashLoop = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 14), mat(0xa8202e, 0.85));
  leashLoop.position.set(-0.12, 1.14, -0.24); leashLoop.rotation.y = Math.PI / 2; mudG.add(leashLoop);
  var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.06, 16), mat(0x3f7a5e, 0.6));
  bowl.position.set(-0.22, 0.03, 0.52); mudG.add(bowl);
  var bowlIn = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 16), mat(0x24303a, 0.4));
  bowlIn.position.set(-0.22, 0.062, 0.52); mudG.add(bowlIn);
  mudG.children.forEach(function (m) {
    if (m.isMesh) tag(m, "the mud room", null, "boots, leashes, a bowl. somebody in this house has a dog.");
  });
  // the prints — a floor decal, because a dog that never appears is funnier
  var pawT = canvasTex(256, 256, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    for (var p = 0; p < 9; p++) {
      var px = 40 + Math.sin(p * 1.1) * 60 + p * 6, py = 18 + p * 26;
      c.fillStyle = "rgba(78,58,38," + (0.42 - p * 0.04).toFixed(2) + ")";
      c.beginPath(); c.ellipse(px, py, 11, 9, 0, 0, 7); c.fill();
      for (var t2 = 0; t2 < 4; t2++) {
        c.beginPath(); c.ellipse(px - 12 + t2 * 8, py - 13, 4, 5, 0, 0, 7); c.fill();
      }
    }
  });
  var paws = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.4),
    new THREE.MeshStandardMaterial({ map: pawT, transparent: true, roughness: 1 }));
  paws.rotation.x = -Math.PI / 2; paws.position.set(E_IN - 0.75, 0.011, 7.0); badd(paws);

  // --- THE OVERFLOW CORNER: chest freezer + the shelves every house grows
  var frz = box(1.24, 0.86, 0.66, mat(0xe8eae6, 0.5));
  frz.position.set(W_IN + 0.36, 0.43, 7.5); frz.rotation.y = Math.PI / 2; frz.castShadow = true; badd(frz);
  var frzLid = box(1.2, 0.07, 0.64, mat(0xdcdedb, 0.45));
  frzLid.position.set(W_IN + 0.36, 0.89, 7.5); frzLid.rotation.y = Math.PI / 2; badd(frzLid);
  var frzSeal = box(0.06, 0.04, 0.6, mat(0x9aa0a0, 0.6)); frzSeal.position.set(W_IN + 0.68, 0.72, 7.5); badd(frzSeal);
  tag(frz, "the chest freezer", null, "the chest freezer. nobody remembers what is at the bottom of it.");
  tag(frzLid, "the chest freezer", null, "the chest freezer. nobody remembers what is at the bottom of it.");
  var shelfM = mat(0x7d8489, 0.6);
  [1.25, 1.72, 2.19].forEach(function (sy, si) {
    var sh = box(0.42, 0.04, 1.5, shelfM); sh.position.set(W_IN + 0.24, sy, 7.5); badd(sh);
    [[-0.6, 0x8a5a3a], [0.0, 0x4a6a8a], [0.55, 0x6a6a4a]].forEach(function (bn, bi) {
      if ((si + bi) % 3 === 2) return;                      // not every slot has a bin
      var bin = box(0.34, 0.26, 0.4, mat(bn[1], 0.85));
      bin.position.set(W_IN + 0.24, sy + 0.15, 7.5 + bn[0]); badd(bin);
    });
  });
  [-0.72, 0.72].forEach(function (uz) {
    var up = box(0.05, 2.3, 0.05, shelfM); up.position.set(W_IN + 0.24, 1.15, 7.5 + uz); badd(up);
  });

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
  var bulbS = bulbAt(1.9, 0xffd9a0), bulbN = bulbAt(-2.2, 0xffd9a0),
      bulbB = bulbAt(6.4, 0xffd9a0); // the back stretch got its own after the extension
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
  var facing = "north", turnTo = "north", turnK = 1; // which end of the hall you're facing
  try { seen.hall = !!localStorage.getItem("room-hall-seen"); } catch (e) { }
  var P = { // camera choreography, in order of appearance
    rest: new THREE.Vector3(-5.90, 1.7, 3.72),      // standing at the south end
    look: new THREE.Vector3(-5.72, 1.26, -1.4),     // gazing up the corridor, a hair toward the photo wall
    lookS: new THREE.Vector3(-5.80, 1.20, 8.4),     // and the other way: the slider, the yard beyond it
    // stood near the FRONT edge of the deck, not up against the door — from a metre
    // off the house, "turn round" just filled the frame with the doorway
    porch: new THREE.Vector3(-5.70, 1.62, -5.35),   // out on the boards
    porchL: new THREE.Vector3(-5.62, 0.75, -14.5),  // down the path at the street
    porchB: new THREE.Vector3(-6.05, 1.72, -2.4),   // turned round: the house you live in
    fdoor1: new THREE.Vector3(-5.72, 1.68, -1.9),   // coming up the hall to the door
    fdoor2: new THREE.Vector3(-5.70, 1.66, -3.85),  // in the doorway itself
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
    facing = turnTo = "north"; turnK = 1;
    c0.copy(camera.position); l0.copy(lookAt);
    syncTurnBtn();
    AUDIO.ratchetSfx && AUDIO.ratchetSfx(); // the latch
    if (!seen.hall) {
      seen.hall = true;
      try { localStorage.setItem("room-hall-seen", "1"); } catch (e) { }
      if (ctx.kidSay) ctx.kidSay("the hallway! the whole house is waking up.", 5);
    }
  }
  function leave() {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "hall") return;
    mode = "leaving"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    if (turnBtn) turnBtn.style.display = "none";
    if (ctx.onLeave) ctx.onLeave();
  }
  function toggleDoor() { if (space === "hall") leave(); else if (space === "bedroom") enter(); }
  // ⚠️ the front door's swing is driven by the SAME tt as the walk, exactly like
  // the bedroom door — so the slab is always open by the time the camera is in it
  function stepOut() {
    if (mode !== "idle" || space !== "hall") return;
    mode = "out"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.ratchetSfx && AUDIO.ratchetSfx();
    if (turnBtn) turnBtn.style.display = "none";
  }
  function stepIn() {
    if (mode !== "idle" || space !== "porch") return;
    mode = "in"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    if (turnBtn) turnBtn.style.display = "none";
  }
  // which end of wherever you're standing you're looking at
  function restPos() { return space === "porch" ? P.porch : P.rest; }
  function aimFor(f) {
    if (space === "porch") return f === "house" ? P.porchB : P.porchL;
    return f === "south" ? P.lookS : P.look;
  }
  function flipOf(f) {
    if (space === "porch") return f === "street" ? "house" : "street";
    return f === "north" ? "south" : "north";
  }
  function ease(x) { return x * x * (3 - 2 * x); }
  var _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function walk(pts, lks, t) { // piecewise keyframe path, eased per leg
    var n = pts.length - 1, x = Math.min(0.9999, Math.max(0, t)) * n, i = x | 0, f = ease(x - i);
    _v.lerpVectors(pts[i], pts[i + 1], f);
    _w.lerpVectors(lks[i], lks[i + 1], f);
  }
  var BED_LOOK = new THREE.Vector3(0, 1.2, -0.4); // the bedroom's home gaze (room.js only ever steers its x)
  function camTick(t, dt, mx, my) {
    // ⚠️ THE YARD IS HIDDEN FROM THE BEDROOM, and not just to save draw calls.
    // yardHemi and yardSun are a HemisphereLight and a DirectionalLight — neither
    // has any distance falloff and neither is stopped by a wall — so left on they
    // wash straight through the house and light the bedroom. The streetlight
    // reaches it too (distance 16, and the bedroom is 13 away). Toggling the group
    // is the cheap fix that also kills the geometry cost.
    // ⚠️ and the WHOLE HALL is hidden from the bedroom, not just the yard. The
    // bedroom door is shut when you're in there, so none of it is visible — but it
    // was still costing 258 draw calls a frame. Kept up during transitions, when
    // the door is open and you really are looking down it.
    g.visible = space !== "bedroom" || mode !== "idle";
    yardG.visible = space !== "bedroom";
    if (mode === "out" || mode === "in") {           // through the front door, both ways
      tt = Math.min(1, tt + dt / 2.5);
      var k2 = mode === "out" ? tt : 1 - tt;
      fPivot.rotation.y = -1.95 * ease(Math.min(1, Math.max(0, (k2 - 0.04) / 0.42)));
      // whoever knocked is gone before the door is properly open — that's the whole
      // point of them, so it's cleared on the way out, not on arrival
      if (mode === "out" && tt > 0.3) figT = 0;
      if (mode === "out") walk([c0, P.fdoor1, P.fdoor2, P.porch], [l0, P.porchB, P.porchL, P.porchL], tt);
      else walk([c0, P.fdoor2, P.fdoor1, P.rest], [l0, P.porchB, P.look, P.look], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "out") { space = "porch"; facing = turnTo = "street"; fPivot.rotation.y = -1.95; }
        else {
          space = "hall"; facing = turnTo = "north"; fPivot.rotation.y = 0;
          AUDIO.clickSfx && AUDIO.clickSfx(500);
        }
        turnK = 1; mode = "idle"; syncTurnBtn();
      }
      return true;
    }
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
        facing = turnTo = "north"; turnK = 1; // you always arrive looking up the hall
        syncTurnBtn();
      }
      return true;
    }
    if (space === "hall" || space === "porch") { // at rest: same parallax drift as the bedroom
      // ⚠️ the swing is driven by a SEPARATE eased term, not by lerping lookAt
      // straight from one end to the other. A direct lerp passes the target
      // through the camera's own position on the way past, and the view whips
      // through the ceiling. `turnK` walks a point around a circle instead.
      var aim = gaze();
      if (mode === "turning") {
        turnK = Math.min(1, turnK + dt / 1.15);
        if (turnK >= 1) { mode = "idle"; facing = turnTo; syncTurnBtn(); }
      }
      var rp = restPos();
      var bx = rp.x + mx * 0.5, by = rp.y + my * 0.22, bz = rp.z;
      camera.position.x += (bx - camera.position.x) * 0.04;
      camera.position.y += (by - camera.position.y) * 0.04;
      camera.position.z += (bz - camera.position.z) * 0.04;
      var k = mode === "turning" ? 0.16 : 0.04;   // the turn itself is brisker than the drift
      lookAt.x += ((aim.x + mx * 0.9) - lookAt.x) * k;
      lookAt.y += ((aim.y + my * 0.6) - lookAt.y) * k;
      lookAt.z += (aim.z - lookAt.z) * k;
      camera.lookAt(lookAt);
      return true;
    }
    return false; // bedroom: room.js keeps its own camera
  }
  // where the camera is looking right now: one end, the other, or swinging between
  // them along an arc that keeps the gaze point out in the room
  var _g = new THREE.Vector3();
  function gaze() {
    var from = aimFor(facing);
    if (mode !== "turning") return from;
    var to = aimFor(turnTo), rp = restPos(), f = ease(turnK);
    // interpolate the ANGLE about the camera, not the point, so it sweeps the wall
    var a0 = Math.atan2(from.x - rp.x, from.z - rp.z);
    var a1 = Math.atan2(to.x - rp.x, to.z - rp.z);
    var d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var a = a0 + d * f, r = 5.2;
    _g.set(rp.x + Math.sin(a) * r, from.y + (to.y - from.y) * f, rp.z + Math.cos(a) * r);
    return _g;
  }
  function turn(to) {
    if ((space !== "hall" && space !== "porch") || mode === "entering" || mode === "leaving" ||
        mode === "out" || mode === "in") return;
    to = to || flipOf(facing);
    if (to === facing && mode !== "turning") { syncTurnBtn(); return; }
    turnTo = to; turnK = 0; mode = "turning";
    AUDIO.clickSfx && AUDIO.clickSfx(760);
    syncTurnBtn();
  }

  /* The one bit of DOM this module owns. It is BOTTOM-CENTRE deliberately: the
   * room's own buttons live in a column down the right edge and stacking a fourth
   * onto it is how the guide button ended up sitting on the list button. Styles are
   * inline for the same reason — nothing here can collide with room.js's CSS. */
  var turnBtn = null;
  function syncTurnBtn() {
    if (!turnBtn) {
      turnBtn = document.createElement("button");
      turnBtn.id = "hall-turn";
      turnBtn.type = "button";
      turnBtn.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:26px;z-index:14;" +
        "display:none;padding:9px 16px;border-radius:999px;cursor:pointer;" +
        "font:600 13px/1 Georgia,serif;letter-spacing:.02em;" +
        "color:#f2e2c4;background:rgba(28,22,16,.72);border:1px solid rgba(242,226,196,.28);" +
        "backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 18px rgba(0,0,0,.42)";
      turnBtn.addEventListener("click", function (e) { e.stopPropagation(); turn(); });
      // the pointer listener that owns the room would otherwise fire a pick behind it
      turnBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      document.body.appendChild(turnBtn);
    }
    var show = space === "hall" || space === "porch" || mode === "entering";
    turnBtn.style.display = show ? "block" : "none";
    var next = flipOf(mode === "turning" ? turnTo : facing);
    var LBL = { south: "the back of the house", north: "the front door",
                house: "the house", street: "the street" };
    turnBtn.textContent = "⟲  turn around — " + (LBL[next] || "the other way");
    turnBtn.setAttribute("aria-label", "Turn around to face " + (LBL[next] || "the other way"));
  }

  /* ---- per-frame life ---------------------------------------------------------
   * dim comes from the room (the bed's "five more minutes" fades the whole
   * house); the hall breathes with it. The TV flicker under the living room
   * door never stops. Nobody has ever seen the TV. */
  function glowTick(t, dt, dim) {
    var on = lightsOn ? 1 : 0.06;
    var breathe = 0.94 + 0.06 * Math.sin(t * 0.8);
    [bulbS, bulbN, bulbB].forEach(function (b) {
      b.light.intensity = 2.7 * dim * on * breathe;
      b.bulb.material.emissiveIntensity = 2.0 * dim * on;
      if (b.halo) b.halo.material.opacity = 0.34 * dim * on * breathe;
    });
    hallFill.intensity = 0.5 * dim * on;
    // the porch light is OUTSIDE, so the pull chain doesn't touch it — that's the
    // point of it: turn the hall off and the yard is still faintly there
    porchLight.intensity = 1.5 * dim;
    porchGlass.material.emissiveIntensity = 1.5 * dim;
    for (var mi = 0; mi < moths.length; mi++) {   // and the things that love it
      var mm = moths[mi], a = t * mm.sp + mm.ph;
      mm.m.position.set(XC + 1.35 + Math.cos(a) * mm.r,
                        2.24 + Math.sin(a * 1.7) * mm.r * 0.7,
                        Z_S + 0.3 + Math.sin(a) * mm.r * 0.5);
      mm.m.rotation.z = Math.sin(a * 9) * 0.5;
    }
    if (livDoor.userData.spill) // somebody's shows are on in there
      livDoor.userData.spill.material.opacity = livDoor.userData.spillOp * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.3)));
    if (kitDoor.userData.spill) kitDoor.userData.spill.material.opacity = kitDoor.userData.spillOp * (0.9 + 0.1 * Math.sin(t * 0.4));
    bGlow.material.opacity = 0.08 + 0.05 * Math.sin(t * 0.9); // the basement, breathing
    var target = cloOpen ? -1.6 : 0;
    cloAnim += (target - cloAnim) * Math.min(1, dt * 7);
    cloDoorP.rotation.y = cloAnim;
    // somebody on the path, briefly
    if (figT > 0) { figT -= dt; figG.visible = true; figG.position.x = FRONT_X + 0.35 + Math.sin(t * 0.7) * 0.05; }
    else if (figG.visible) figG.visible = false;

    /* ---- the street, alive ---------------------------------------------------
     * Skipped entirely from indoors — the yard group is hidden there, so none of
     * this is visible and none of it should cost anything. */
    if (!yardG.visible) return;
    var gust = 0.6 + 0.4 * Math.sin(t * 0.23);            // the wind comes and goes
    for (var si = 0; si < swayers.length; si++) {
      var sw2 = swayers[si];
      sw2.o.rotation.z = Math.sin(t * 0.9 + sw2.ph) * sw2.amp * gust;
      sw2.o.rotation.x = Math.cos(t * 0.7 + sw2.ph * 1.3) * sw2.amp * 0.6 * gust;
    }
    for (var mi2 = 0; mi2 < slMoths.length; mi2++) {      // and the things that love the lamp
      var sm2 = slMoths[mi2], ma = t * sm2.sp + sm2.ph;
      sm2.m.position.set(-3.66 + Math.cos(ma) * sm2.r, GROUND + 4.9 + Math.sin(ma * 1.6) * sm2.r * 0.6,
                         Z_WALK - 1.4 + Math.sin(ma) * sm2.r * 0.6);
      sm2.m.rotation.z = Math.sin(ma * 10) * 0.5;
    }
    if (tvWin) {  // nobody opposite has ever turned that television off either
      var fl = 0.55 + 0.45 * Math.abs(Math.sin(t * 3.7) * Math.sin(t * 1.9));
      tvWin.emissiveIntensity = 1.1 * PORCH_SKY[porchPhase].lamp * fl;
      tvWin.color.setRGB(0.62 + fl * 0.2, 0.7 + fl * 0.16, 1.0);
    }
    if (passX > 90) {                                      // waiting to send another one
      passWait -= dt;
      if (passWait <= 0) {
        passDir = Math.random() < 0.5 ? 1 : -1;
        passX = passDir > 0 ? -46 : 46;
        passG.rotation.y = passDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        passG.position.z = (Z_KERB + Z_ROADF) / 2 + (passDir > 0 ? -2.1 : 2.1);
        passWait = 14 + Math.random() * 26;
      }
      passG.visible = false; passLite.intensity = 0;
    } else {
      passX += dt * 13.5 * passDir;
      passG.visible = true; passG.position.x = passX;
      passLite.intensity = 1.5 * PORCH_SKY[porchPhase].lamp;
      if ((passDir > 0 && passX > 46) || (passDir < 0 && passX < -46)) passX = 999;
    }
  }

  /* ---- performance ------------------------------------------------------------
   * ⚠️ NOTHING IN THIS MODULE CASTS OR RECEIVES A SHADOW, and it never did — the
   * hall's bulbs, the porch light, the streetlight and yardSun all have castShadow
   * off. But util.js's box() turns castShadow ON for every box it makes, so all 523
   * meshes out here were being fed to the BEDROOM lamp's shadow map: a point light,
   * so a cube map, so six faces, so six passes over geometry sealed behind a wall
   * the lamp cannot see past. Measured from the bedroom camera: shadows accounted
   * for 486 of 886 draw calls and 1.04M of 1.63M triangles.
   * If you ever give a hall light castShadow, this loop is why nothing happens. */
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  return {
    group: g,
    space: function () { return space; },
    active: function () { return space !== "bedroom" || mode !== "idle"; },
    busy: function () { return mode !== "idle"; },
    enter: enter, leave: leave, toggleDoor: toggleDoor,
    forceExit: function () { // bfcache restore etc: no walking, just be back home
      mode = "idle"; space = "bedroom";
      facing = turnTo = "north"; turnK = 1;
      if (turnBtn) turnBtn.style.display = "none";
      if (ctx.doorPivot) ctx.doorPivot.rotation.y = 0;
      fPivot.rotation.y = 0; figT = 0; figG.visible = false;
      yardG.visible = false;   // camTick would do it next frame, but bfcache may not get one
      cloOpen = false; cloAnim = 0; cloDoorP.rotation.y = 0;
    },
    turn: turn, facing: function () { return facing; },
    stepOut: stepOut, stepIn: stepIn,
    setPhase: setPhase, phase: function () { return porchPhase; },
    knock: knockCame,
    camTick: camTick, glowTick: glowTick, refreshPhotos: refreshPhotos
  };
}
