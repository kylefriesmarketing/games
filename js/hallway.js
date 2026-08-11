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
  (function () {   // the hall floor gets the same relief the bedroom's floors got
    var pb = bumpFrom(plankT, 1.7);
    if (pb) { pb.repeat.copy(plankT.repeat); plankM.bumpMap = pb; plankM.bumpScale = 0.9; }
  })();
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
  // the WEST wall is cut for the kitchen doorway — third hole in this house, same
  // lesson each time: a door you can walk through needs an opening, not a slab
  var KDO = { z0: -0.90, z1: 0.20, y1: 2.16 };
  [[Z_N, KDO.z0, 0, 3.4], [KDO.z1, Z_S, 0, 3.4], [KDO.z0, KDO.z1, KDO.y1, 3.4]].forEach(function (p) {
    var seg = box(0.1, p[3] - p[2], p[1] - p[0], hwallM);
    seg.position.set(W_IN - 0.05, (p[2] + p[3]) / 2, (p[0] + p[1]) / 2); add(seg);
  });
  // the hall's OWN east wall, south of where the bedroom stops — CUT for the closet.
  // ⚠️⚠️ FOURTH TIME THIS FILE HAS LEARNED IT: a door you can open needs a HOLE, not
  // a slab behind it. The closet door sits in the hall at x -4.40 and its shelf, rod
  // and coats sit at x -4.04 — with 10cm of solid wall in between. Opening it revealed
  // WALLPAPER, and had done since the day it was built. A ray fired east through the
  // closet reads: door @-4.40, WALL @-4.35, shelf @-4.04.
  var CLO_Z = 7.70, CDO = { z0: CLO_Z - 0.46, z1: CLO_Z + 0.46, y1: 2.16 };
  [[BED_END, CDO.z0, 0, 3.4],           // north of the closet
   [CDO.z1, Z_S + 0.1, 0, 3.4],         // south of it
   [CDO.z0, CDO.z1, CDO.y1, 3.4]]       // the header over it, opening-width only
    .forEach(function (p) {
      var seg = box(0.1, p[3] - p[2], p[1] - p[0], hwallM);
      seg.position.set(E_IN + 0.05, (p[2] + p[3]) / 2, (p[0] + p[1]) / 2); add(seg);
    });
  // the NORTH cap is cut too, now that the front door opens onto a real porch.
  // (Same lesson as capS: a door you can walk through needs a hole, not a slab.)
  var FDO = { x0: FRONT_X - 0.63, x1: FRONT_X + 0.63, y1: 2.30 };
  // ⚠️⚠️ THE HEADER SPANS THE OPENING ONLY (FDO.x0..FDO.x1), NOT THE WHOLE WALL.
  // Full-width, it lay exactly on top of the two side segments from y 2.30 to 3.40:
  // same thickness, same z, 1.34m² and 0.90m² of perfectly coincident wall in a band
  // right where the wall meets the ceiling. That is the "crown moulding flashing
  // white" — there is no moulding, it's two copies of the same wall fighting.
  // (capS had it too, and so did the siding. The kitchen doorway I cut later happens
  //  to be correct, which is what made the difference visible.)
  [[W_IN - 0.1, FDO.x0, 0, 3.4],
   [FDO.x1, E_IN + 0.1, 0, 3.4],
   [FDO.x0, FDO.x1, FDO.y1, 3.4]].forEach(function (p) {
    var seg = box(p[1] - p[0], p[3] - p[2], 0.1, hwallM);
    seg.position.set((p[0] + p[1]) / 2, (p[2] + p[3]) / 2, Z_N - 0.05); add(seg);
  });
  // ⚠️ the SOUTH cap has a hole in it. Built as one slab (like capN) the sliding
  // door renders against solid wallpaper and the yard, the deck and the porch light
  // are all sealed behind it — which is exactly what the first pass did.
  var SDO = { x0: XC - (SD_W / 2 + 0.09), x1: XC + (SD_W / 2 + 0.09), y1: SD_H + 0.13 };
  [[W_IN - 0.1, SDO.x0, 0, 3.4],            // west of the opening
   [SDO.x1, E_IN + 0.1, 0, 3.4],            // east of it
   [SDO.x0, SDO.x1, SDO.y1, 3.4]]           // ⚠️ the header spans the OPENING only —
    // full width it sat on top of both side segments (0.52m² each) at identical z
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
  // ⚠️ these sit ENTIRELY ON THE VOID SIDE of the ceiling's cut edge (x1-0.05, z1-0.05),
  // not centred on it. Centred, each one straddled the edge: half the shaft wall lay
  // inside the ceiling slab sharing its BOTTOM face at y 2.95 — 0.108m² and 0.062m² of
  // coplanar face right around the stairwell opening, which is the rim Kyle saw
  // flashing. Butted against the cut edge instead, nothing is coplanar and the reveal
  // of the opening reads properly.
  var stwE = box(0.1, 0.45, STW.z1 - STW.z0, hwallM);
  stwE.position.set(STW.x1 - 0.05, 3.175, (STW.z0 + STW.z1) / 2); add(stwE);
  var stwS = box(STW.x1 - STW.x0, 0.45, 0.1, hwallM);
  stwS.position.set((STW.x0 + STW.x1) / 2, 3.175, STW.z1 - 0.05); add(stwS);
  // ⚠️⚠️ BASEBOARDS ARE BOXES THAT STAND PROUD, NOT PLANES AT +0.001. A 1mm offset
  // is FAR below what the depth buffer can resolve with near 0.1 / far 120 — the
  // board and the wall behind it swap depth-test winners as the camera drifts, and
  // the whole skirting strobes. (Kyle: "the running boards flashing".) Real skirting
  // projects ~15mm from the wall, so modelling it correctly IS the fix: the board
  // now occupies its own 2cm of space and nothing is coplanar with anything.
  [[W_IN + 0.01, (Z_S + Z_N) / 2, 0.02, Z_S - Z_N],
   [E_IN - 0.01, (Z_S + Z_N) / 2, 0.02, Z_S - Z_N],
   [XC, Z_N + 0.01, HW, 0.02]].forEach(function (b) {
    var sk = box(b[2], 0.14, b[3], mat(0x241b12, 0.85));
    sk.position.set(b[0], 0.07, b[1]); add(sk);
  });
  // ⚠️ the border stripe is FLAT on the wall, so it can't stand proud like a board —
  // it uses polygonOffset instead, the same rule the contact shadows follow: bias
  // the depth test, never the position. At +0.002 it strobed like the skirting did.
  var hstripe = new THREE.Mesh(new THREE.PlaneGeometry(Z_S - Z_N, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x6e3c4b, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  hstripe.rotation.y = Math.PI / 2; hstripe.position.set(W_IN + 0.004, 2.45, (Z_S + Z_N) / 2); add(hstripe); // the border tries to follow you out of the bedroom

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
  function tapeX(doorGrp, w, h) { // PARDON OUR DUST, in physical form
    var tm = new THREE.MeshStandardMaterial({ color: 0xd9c04a, roughness: 0.6 });
    // ⚠️⚠️ THE STRIP IS CUT TO THE DOOR, not to a magic number. It used to be
    // sqrt(w*w + 2.9) long at a fixed 0.9rad, and a strip of length L tilted by a
    // about X spans L*cos(a) ACROSS the door — which came to 1.20m on a 0.92m door.
    // 14cm of tape hung off each side into the wall and the air. Solving it properly:
    // pick the span you want (w-0.06 across, h tall), then a = atan2(h, w) and
    // L = hypot(w, h) put the ends exactly on the corners.
    var sw = w - 0.06, sh = (h || 1.52);
    var ang = Math.atan2(sh, sw), len = Math.sqrt(sw * sw + sh * sh);
    // the two strips sit at DIFFERENT depths (0.049 / 0.062): both at 0.055 they
    // occupied the same slab of space and fought right where the X crosses. One
    // tape crosses in front of the other, the way tape actually goes on.
    [[ang, 0.049], [-ang, 0.062]].forEach(function (r) {
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, len), tm);
      t.position.set(r[1], 1.02, 0); t.rotation.x = r[0]; doorGrp.add(t);
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
  // …and it's OPEN now — the tape came off the day the room behind it got built.
  // The slab hangs on a real hinge (south jamb, swings INTO the kitchen), exactly
  // like the bedroom and front doors. The jambs and plaque stay on the wall.
  var kDoorPivot = new THREE.Group(); kDoorPivot.position.set(W_IN + 0.03, 0, -0.81); add(kDoorPivot);
  var kSlab = box(0.05, 2.05, 0.92, mat(0x54582e, 0.72)); kSlab.position.set(0, 1.025, 0.46); kDoorPivot.add(kSlab);
  var kKnob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.6 }));
  kKnob.position.set(0.05, 1.0, 0.80); kDoorPivot.add(kKnob);
  [[2.09, 0.08, 1.06, -0.35], [1.02, 2.12, 0.08, -0.87], [1.02, 2.12, 0.08, 0.17]].forEach(function (j) {
    var jm = box(0.08, j[1], j[2], mat(0x241b12, 0.8));
    jm.position.set(W_IN + 0.045, j[0], j[3]); add(jm);
  });
  var kSpill = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xbfe8d8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  kSpill.rotation.x = -Math.PI / 2; kSpill.rotation.z = Math.PI / 2;
  kSpill.position.set(W_IN + 0.12, 0.012, -0.35); add(kSpill);
  var kitDoor = kDoorPivot; kitDoor.userData.spill = kSpill; kitDoor.userData.spillOp = 0.16;
  (function () { // the sign belongs on the WALL, not the swinging slab
    var pg = new THREE.Group(); pg.position.set(W_IN + 0.03, 0, -0.35); add(pg);
    plaque(pg, "KITCHEN", "come in");
  })();
  [kSlab, kKnob].forEach(function (m) {
    tag(m, "the kitchen door", function () { enterKitchen(); },
      "the kitchen — the fridge hums. click to go in");
  });
  // the way back: an invisible hitbox in the opening, kitchen side
  var kBackHit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.0, 1.0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  kBackHit.position.set(W_IN - 0.15, 1.03, -0.35); add(kBackHit);
  clickable(kBackHit, "the hallway", function () { leaveKitchen(); }, "back to the hall");
  kBackHit.userData.space = "kitchen";

  // THE CLOSET — the one door down here that DOES open. Seasonal storage, one
  // spare hallway gag, and a shoebox that is pointedly empty.
  // ⚠️⚠️ z 7.70, NOT 3.35. At 3.35 it stood 37cm BEHIND the hall camera (which rests
  // at z 3.72) and 1.5m to the side, so it projected behind the near plane from
  // every resting view in the house — a fully built closet with seasonal coats that
  // literally nobody could ever see, including me, until a projection test went
  // looking for it. Kyle: "put it at the back."
  // The east wall is free from z 6.2 (past the laundry) to the slider, it is dead
  // centre-left of the south-facing view, and a coat closet by the back door with
  // the boots kicked off underneath it is where one actually belongs.
  var cloG = new THREE.Group(); cloG.position.set(E_IN - 0.03, 0, CLO_Z); add(cloG);
  [[2.09, 0.08, 0.96, 0], [1.02, 2.12, 0.08, -0.43], [1.02, 2.12, 0.08, 0.43]]
    .forEach(function (j) { var jm = box(0.08, j[1], j[2], mat(0x241b12, 0.8)); jm.position.set(-0.015, j[0], j[3]); cloG.add(jm); });
  // ⚠️ THE INTERIOR IS A REAL BOX NOW, not a painted plane. It used to be one 0.82x2.0
  // canvas with a shelf, some boxes and a mitten drawn on it — which was the right call
  // while the closet was sealed behind a wall and never opened. Now that the wall is
  // cut and the door actually swings, a flat cheats badly: the eye gets parallax from
  // the jambs and none from the "depth" behind them.
  var cloIn = mat(0x2b241b, 0.96);                     // the dark you paint a closet
  var CD = 0.36;                                        // interior depth
  [[0.03, 2.05, 0.90, 0.355, 1.025, 0],                 // back
   [CD, 2.05, 0.03, 0.18, 1.025, -0.435],               // north side
   [CD, 2.05, 0.03, 0.18, 1.025, 0.435],                // south side
   [CD, 0.02, 0.90, 0.18, 0.01, 0],                     // floor
   [CD, 0.03, 0.90, 0.18, 2.045, 0]                     // lid
  ].forEach(function (s) {
    var m = box(s[0], s[1], s[2], cloIn); m.position.set(s[3], s[4], s[5]); cloG.add(m);
  });
  var cloShelf = box(0.33, 0.03, 0.86, mat(0x8a7a5c, 0.9));
  var rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.86, 8),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.35 }));
  rod.rotation.x = Math.PI / 2; rod.position.set(0.20, 1.74, 0); cloG.add(rod);

  /* ---- 1997, in a cupboard -----------------------------------------------------
   * Everything in here had to exist in the nineties and nowhere after it. That is
   * the whole brief: a closet is where a house keeps the year it stopped updating. */
  var MONTH = new Date().getMonth() + 1;
  // ⚠️ the middle hanger is ALWAYS the windbreaker — colour-blocked in three bands,
  // which is the single most legible "this is the nineties" shape there is. The other
  // two still follow the season, so the closet keeps changing without losing the gag.
  var wear = MONTH >= 12 || MONTH <= 2 ? [0x6e2f2f, null, 0x2f4a6e] :
             MONTH <= 5 ? [0xd9c04a, null, 0x4a8ad9] :
             MONTH <= 8 ? [0xd97b4a, null, 0x4ad9b8] :
                          [0x8a5a2f, null, 0x2f8a5a];
  var WIND = [0x1fa6c8, 0xf2f0e6, 0xe8478a];            // teal / white / hot pink, 1993
  wear.forEach(function (colr, i) {
    var hang = new THREE.Group(); hang.position.set(0.20, 1.74, -0.24 + i * 0.24); cloG.add(hang);
    var wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), rod.material);
    wire.position.y = -0.05; hang.add(wire);
    if (colr === null) {                                 // the windbreaker
      WIND.forEach(function (bandC, b) {
        var band = box(0.085, 0.21, 0.20, mat(bandC, 0.72));
        band.position.y = -0.22 - b * 0.21; hang.add(band);
      });
      var sleeve = box(0.085, 0.42, 0.06, mat(WIND[0], 0.72));
      sleeve.position.set(0, -0.34, 0.12); sleeve.rotation.x = 0.18; hang.add(sleeve);
    } else {
      var coat = box(0.09, 0.62, 0.19, mat(colr, 0.9)); coat.position.y = -0.42; hang.add(coat);
      var arm = box(0.09, 0.4, 0.055, mat(colr, 0.9)); arm.position.set(0, -0.3, 0.115); arm.rotation.x = 0.16; hang.add(arm);
    }
  });
  // a Tamagotchi on its keychain, hooked over the end of the rod and long dead
  var tam = new THREE.Group(); tam.position.set(0.20, 1.66, 0.36); cloG.add(tam);
  var tamChain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 5), rod.material);
  tamChain.position.y = 0.045; tam.add(tamChain);
  var tamBody = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), mat(0x8ad94a, 0.5));
  tamBody.scale.set(1, 1.12, 0.55); tam.add(tamBody);
  var tamScr = new THREE.Mesh(new THREE.CircleGeometry(0.018, 12), mat(0x2a3326, 0.4));
  tamScr.position.set(0, 0.004, 0.021); tam.add(tamScr);
  tag(tamBody, "the Tamagotchi", null, "it died in 1998 and nobody has had the heart to press reset.");

  // the shelf, and what got shoved onto it
  cloShelf.position.set(0.19, 1.93, 0); cloG.add(cloShelf);   // 1.93: at 1.95 its underside sat on a wall face
  var gameT = canvasTex(96, 64, function (c, w, h) {   // a board-game lid, generic and loud
    c.fillStyle = "#c8322e"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#f2d24a"; c.fillRect(6, 8, w - 12, 20);
    c.fillStyle = "#1f5fa8"; c.beginPath(); c.arc(w * 0.28, h * 0.72, 11, 0, 7); c.fill();
    c.fillStyle = "#3aa85a"; c.fillRect(w * 0.52, h * 0.58, 26, 18);
  });
  [[0.02, 0.055, 0.06], [-0.01, 0.115, -0.14]].forEach(function (bx, i) {
    var g2 = box(0.30, 0.055, 0.30, new THREE.MeshStandardMaterial({ map: gameT, roughness: 0.9 }));
    g2.position.set(0.19 + bx[0], 1.965 + bx[1] - 0.055, bx[2]); g2.rotation.y = i ? 0.12 : -0.08;
    cloG.add(g2);
  });
  var vhsT = canvasTex(48, 96, function (c, w, h) {     // spines, hand-labelled
    c.fillStyle = "#17181a"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#e6e2d4"; c.fillRect(4, 12, w - 8, 30);
    c.strokeStyle = "#43506a"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(8, 22); c.lineTo(w - 10, 22); c.moveTo(8, 32); c.lineTo(w - 14, 32); c.stroke();
  });
  for (var vt = 0; vt < 4; vt++) {
    var vhs = box(0.11, 0.028, 0.19, new THREE.MeshStandardMaterial({ map: vhsT, roughness: 0.85 }));
    vhs.position.set(0.28, 1.982 + vt * 0.029, 0.30); vhs.rotation.y = (vt % 2) * 0.07;
    cloG.add(vhs);
  }
  tag(cloShelf, "the shelf", null, "board games with pieces missing, and tapes nobody can play any more.");

  // the floor of it: rollerblades kicked in, a Super Soaker stood in the corner
  [[0.10, -0.26, 0.5], [0.19, -0.06, -0.9]].forEach(function (rb) {
    var bl = new THREE.Group(); bl.position.set(0.10 + rb[0] * 0.3, 0.03, rb[1]); bl.rotation.y = rb[2]; cloG.add(bl);
    var boot = box(0.10, 0.13, 0.24, mat(0xe8e4da, 0.6)); boot.position.y = 0.10; bl.add(boot);
    var cuff = box(0.105, 0.06, 0.13, mat(0x2f3f8a, 0.6)); cuff.position.set(0, 0.185, -0.04); bl.add(cuff);
    for (var wl = 0; wl < 4; wl++) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10), mat(0xd8d24a, 0.5));
      wh.rotation.z = Math.PI / 2; wh.position.set(0, 0.026, -0.085 + wl * 0.057); bl.add(wh);
    }
    tag(boot, "the rollerblades", null, "somebody was very good at these for one summer.");
  });
  var soak = new THREE.Group(); soak.position.set(0.24, 0.0, -0.27); soak.rotation.set(0, 0.5, -0.24); cloG.add(soak);
  var skBody = box(0.075, 0.46, 0.10, mat(0x2fb8a8, 0.55)); skBody.position.y = 0.25; soak.add(skBody);
  var skTank = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12), mat(0xf2d24a, 0.5));
  skTank.position.set(0, 0.50, -0.01); soak.add(skTank);
  var skNoz = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.13, 8), mat(0xe8478a, 0.5));
  skNoz.rotation.x = Math.PI / 2; skNoz.position.set(0, 0.44, 0.10); soak.add(skNoz);
  var skGrip = box(0.06, 0.13, 0.05, mat(0xe8478a, 0.6)); skGrip.position.set(0, 0.10, 0.05); soak.add(skGrip);
  tag(skBody, "the Super Soaker", null, "the 50. still the best one. still has a bit of water in it.");
  var shoebox2 = box(0.3, 0.11, 0.18, mat(0x9a8a6a, 0.9)); shoebox2.position.set(0.26, 0.075, 0.30); shoebox2.rotation.y = 0.4; cloG.add(shoebox2);
  // the closet's own bulb — a pull-cord fixture that only reads when the door is open
  var cloBulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 }));
  cloBulb.position.set(0.16, 1.99, -0.30); cloG.add(cloBulb);
  // ⚠️ range 2.6 and it sits LOW (y 1.35), not up at the bulb. A 1.9-range lamp tucked
  // under the lid lit the shelf and left the floor of the closet black — which is
  // exactly where the rollerblades and the Super Soaker are. Dropping it to chest
  // height inside the box lights the whole depth; the bulb mesh stays up top.
  var cloLight = new THREE.PointLight(0xffd9a0, 0, 2.6, 1.5);
  cloLight.position.set(0.14, 1.35, -0.05); cloG.add(cloLight);
  // ⚠️⚠️ HINGE SOUTH **AND** ROTATION POSITIVE. Both halves matter and I got each of
  // them wrong once. The hall is at -x, so an opening door must sweep to -x; with the
  // pivot at +0.44 and the leaf at -0.42 that needs θ = +1.6, because R_y sends
  // (0,0,-0.42) to x' = -0.42·sinθ. The original (south hinge, θ = -1.6) and my first
  // "fix" (north hinge, θ = +1.6) BOTH sent it to +x — into the closet and out through
  // the back of the wall. It looked correct in renders purely because a door buried in
  // a wall is a door you can't see. Measured after: open slab lands x -5.22..-4.38,
  // out in the hall, at z 8.15 — south of the opening, so it never stands between the
  // hall camera and the thing it just revealed.
  var cloDoorP = new THREE.Group(); cloDoorP.position.set(0, 0, 0.44); cloG.add(cloDoorP);
  // ⚠️ LOUVERED, not a flat slab. A hollow-core closet door with angled slats is the
  // most period-correct object in this house — every hall closet built between about
  // 1975 and 2000 has one — and it is the cheapest possible read: 14 tilted bars in
  // two banks tell you "closet" before you've registered anything else in the frame.
  // The stiles and rails stay solid so the door still blocks the opening.
  // ⚠️ the slab sits at local x -0.03, not 0: flush with the jambs its face landed on
  // the same plane as theirs (-4.355 vs -4.357) and the two fought over 0.10m². Set
  // back into the reveal it clears them by 3cm, which is also where a door belongs.
  var cloDoor = box(0.045, 2.05, 0.84, mat(0x4a3524, 0.72)); cloDoor.position.set(-0.03, 1.025, -0.42); cloDoorP.add(cloDoor);
  var slatM2 = mat(0x3d2b1c, 0.8);
  [[0.30, 0.62], [1.16, 0.62]].forEach(function (bank) {     // two banks, gap for the rail
    for (var s2 = 0; s2 < 7; s2++) {
      var sl = box(0.055, 0.055, 0.70, slatM2);
      sl.position.set(-0.012, bank[0] + s2 * (bank[1] / 7), -0.42);
      sl.rotation.z = -0.42;                                  // tipped down, as they are
      cloDoorP.add(sl);
    }
  });
  [0.25, 0.92, 1.78].forEach(function (ry2) {                 // the rails between banks
    var rl2 = box(0.05, 0.07, 0.84, mat(0x45301f, 0.75));
    rl2.position.set(-0.004, ry2, -0.42); cloDoorP.add(rl2);
  });
  var cloKnob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.6 }));
  cloKnob.position.set(-0.04, 1.0, -0.76); cloDoorP.add(cloKnob);
  var cloOpen = false, cloAnim = 0;
  function closetToggle() { cloOpen = !cloOpen; AUDIO.ratchetSfx && AUDIO.ratchetSfx(); }
  [cloDoor, cloKnob].forEach(function (m) {
    tag(m, "the closet", closetToggle, "the hall closet");
  });
  tag(shoebox2, "another shoebox", null, "another shoebox — empty. for now.");
  // (the old "closet shelf" tag pointed at cloBack, the painted back plane that the
  //  real interior replaced — the shelf carries its own tag now, up where it's built)

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
  // ⚠️ THE SLAB IS SIZED FROM THE FRAME, not guessed. The jambs' inner faces sit at
  // ±0.51 and the lintel's underside at 2.19, so the clear opening is 1.02 x 2.19 —
  // and the old 0.98 x 2.08 slab left an 11cm GAP above the door you could see the
  // hall through. 1.00 x 2.16 leaves a 1cm reveal each side and 3cm at the head,
  // which is what a real door does. Derived from the frame constants below so the
  // two can never drift apart again.
  // ⚠️ FD_H is 2.185, not 2.16. The lintel's underside is at 2.19, so 2.16 left a 3cm
  // SLOT across the whole top of the door that you could see the porch through — a
  // "realistic reveal" is millimetres, not three centimetres, and I reasoned my way
  // into the wrong number. 5mm now, and a stop bead behind it (below) so even that
  // looks at wood.
  var FD_W = 1.00, FD_H = 2.185;
  var fPivot = new THREE.Group(); fPivot.position.set(-FD_W / 2, 0, 0.03); front.add(fPivot);
  var fDoor = box(FD_W, FD_H, 0.06, mat(0x5a3a24, 0.65)); fDoor.position.set(FD_W / 2, FD_H / 2, 0); fPivot.add(fDoor);
  // ⚠️⚠️ THE JAMBS LINE THE OPENING, they do not merely trim it — and this, not the
  // slab's size, is why you could see daylight round the door. The rough opening is
  // 1.26 wide through 10cm of WALL; the slab is 1.00 and hangs 4cm inside the hall;
  // and these boards were 0.09 deep sitting entirely in FRONT of the wall. So the
  // full thickness of the opening either side of the door was simply EMPTY, and at
  // any angle you looked straight through it to the porch. Sizing the door alone
  // could never have fixed that. 0.15 wide x 0.21 deep buries each board 2cm into the
  // wall and carries it past the slab into the hall: opening fully lined, edge to
  // edge (-6.35..-6.20 jamb, -6.20..-5.20 door, -5.20..-5.05 jamb).
  [[-0.575, 0], [0.575, 0]].forEach(function (j) {
    var jm = box(0.15, 2.2, 0.21, mat(0x241b12, 0.8)); jm.position.set(j[0], 1.1, -0.015); front.add(jm);
  });
  var lint = box(1.30, 0.13, 0.21, mat(0x241b12, 0.8)); lint.position.set(0, 2.255, -0.015); front.add(lint);
  // the head STOP: the bead a real door closes against. It sits behind the slab
  // (front-local z -0.03..-0.01; the slab occupies 0.00..0.06) and overlaps the head
  // gap from behind, so the remaining 5mm shows timber instead of the front garden.
  // ⚠️ it clears the swing: at the hinge end the slab is only 0.03 from the pivot
  // axis and the bead is 0.05, so the door never sweeps through it.
  var fStop = box(FD_W + 0.02, 0.05, 0.02, mat(0x241b12, 0.8));
  fStop.position.set(0, FD_H - 0.015, -0.02); front.add(fStop);
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
  fkT.position.set(FD_W - 0.15, 1.02, 0.06); fPivot.add(fkT); // rides the slab, obviously
  // ⚠️ THE SLOT RIDES fPivot, NOT front. It was parented to the DOORWAY, so opening
  // the door left a brass letterbox hanging in mid-air in the empty opening — which
  // is exactly what Kyle saw after stepping out and turning round. The knob two
  // lines up was already right ("rides the slab, obviously"); the slot was missed.
  // Local coords are fPivot's now: front-local (0,0.78,0.07) minus fPivot's own
  // (-0.49,0,0.03) offset = (0.49,0.78,0.04), and 0.045 clears the slab face at 0.03.
  var slot = box(0.26, 0.035, 0.02, new THREE.MeshStandardMaterial({ color: 0xc8a44a, roughness: 0.35, metalness: 0.6 }));
  slot.position.set(FD_W / 2, 0.78, 0.045); fPivot.add(slot);   // centred on the slab
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

  /* ---- THE KITCHEN (a FOURTH space) -------------------------------------------
   * Through the door on the west wall that has been taped shut since the hallway
   * opened. It is 1997 in here: speckled lino, oak-look cabinet doors, a laminate
   * counter with a rolled edge, and a fridge that hums like it knows something —
   * which is what its door plaque promised, so the fridge had better hum.
   *
   * Footprint x -13.00..-7.55, z -3.55..2.05. The driveway used to run through
   * exactly this; it moved west to make room. */
  var KX0 = -13.00, KX1 = -7.55, KZ0 = -3.55, KZ1 = 2.05, KCEIL = 2.62;
  var KCX = (KX0 + KX1) / 2, KCZ = (KZ0 + KZ1) / 2;
  var kitG = new THREE.Group(); add(kitG);
  function kadd(m) { kitG.add(m); return m; }
  function ktag(m, name, action, hint) {
    clickable(m, name, action, hint); m.userData.space = "kitchen"; return m;
  }

  // lino: speckled, waxed, and worn to a path where everyone walks
  var linoT = canvasTex(256, 256, function (c, w, h) {
    c.fillStyle = "#cfc6ae"; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 5000; i++) {
      var v = ["#b9ae92", "#ded6c0", "#a89d80", "#c8bfa6"][(Math.random() * 4) | 0];
      c.fillStyle = v; c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    c.strokeStyle = "rgba(140,130,106,0.5)"; c.lineWidth = 2;   // the tile grid
    [0, 128].forEach(function (g5) {
      c.beginPath(); c.moveTo(0, g5); c.lineTo(w, g5); c.stroke();
      c.beginPath(); c.moveTo(g5, 0); c.lineTo(g5, h); c.stroke();
    });
  });
  // ⚠️ repeat 11, not 6: the canvas draws a 2x2 tile grid, so at 6 the "tiles" were
  // 45cm across and read as a chequerboard floor rather than lino.
  var kFloor = new THREE.Mesh(new THREE.PlaneGeometry(KX1 - KX0, KZ1 - KZ0),
    ground(linoT, 11, 11, 0xffffff, 0.55, 0.6));
  kFloor.rotation.x = -Math.PI / 2; kFloor.position.set(KCX, 0.005, KCZ); kadd(kFloor);
  ktag(kFloor, "the kitchen floor", null, "lino. there is a worn track from the fridge to the kettle.");

  var kWallT = canvasTex(128, 128, function (c, w, h) {
    c.fillStyle = "#e4dcc6"; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 260; i++) {                       // faint sponge-paint mottle
      c.fillStyle = "rgba(198,186,156," + (0.1 + Math.random() * 0.16).toFixed(2) + ")";
      c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 0, 7); c.fill();
    }
  });
  var kWallM = ground(kWallT, 5, 2, 0xffffff, 0.96, 0.5);
  // shell: three solid walls, the fourth is the hall wall with the doorway in it
  [[KX0 - 0.05, KCZ, 0.1, KZ1 - KZ0], [KCX, KZ0 - 0.05, KX1 - KX0, 0.1], [KCX, KZ1 + 0.05, KX1 - KX0, 0.1]]
    .forEach(function (p) {
      var wl = box(p[2], 3.0, p[3], kWallM); wl.position.set(p[0], 1.5, p[1]); kadd(wl);
    });
  // ⚠️⚠️ +0.1, NOT +0.2. The kitchen walls are 0.1 thick, so a 0.1 overshoot per side
  // landed this slab's end faces EXACTLY on their outer faces — and on the east side
  // that outer face is x -7.45, which is the HALLWAY's wall surface. So the kitchen
  // ceiling's white edge was fighting the hall wall in a band just under the hall
  // ceiling: "the crown moldings flashing white" is this slab, seen from the hall,
  // through the wall it was supposed to stop inside. Overshooting to the wall CENTRE
  // buries it in solid wall with no face shared by anything.
  var kCeil = box(KX1 - KX0 + 0.1, 0.1, KZ1 - KZ0 + 0.1, mat(0xf0ead8, 0.98));
  kCeil.position.set(KCX, KCEIL + 0.05, KCZ); kadd(kCeil);
  // ⚠️ same skirting rule as the hall: BOXES standing proud, not planes at +0.001.
  // I copied the hall's bug into the kitchen the day I built it.
  [[KX0 + 0.01, KCZ, 0.02, KZ1 - KZ0], [KCX, KZ0 + 0.01, KX1 - KX0, 0.02],
   [KCX, KZ1 - 0.01, KX1 - KX0, 0.02]].forEach(function (b) {
    var sk = box(b[2], 0.1, b[3], mat(0xe8e2d0, 0.85));
    sk.position.set(b[0], 0.05, b[1]); kadd(sk);
  });

  // --- the run of units: laminate top, rolled edge, oak-look doors, kick board
  var lamT = canvasTex(128, 128, function (c, w, h) {
    c.fillStyle = "#b9a88a"; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) {
      c.fillStyle = ["rgba(90,76,54,0.5)", "rgba(210,198,172,0.5)", "rgba(140,124,96,0.5)"][(Math.random() * 3) | 0];
      c.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    }
  });
  var lamM = ground(lamT, 4, 1, 0xffffff, 0.35, 0.4);
  var oakT = canvasTex(96, 128, function (c, w, h) {
    c.fillStyle = "#9a6f42"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(110,74,40,0.55)"; c.lineWidth = 2;
    for (var g6 = 0; g6 < 9; g6++) {
      c.beginPath(); c.moveTo(4 + g6 * 11, 0);
      c.bezierCurveTo(10 + g6 * 11, h * 0.35, 0 + g6 * 11, h * 0.7, 6 + g6 * 11, h);
      c.stroke();
    }
    c.strokeStyle = "rgba(70,46,24,0.6)"; c.lineWidth = 4;      // the shaker frame
    c.strokeRect(7, 7, w - 14, h - 14);
  });
  var oakM = ground(oakT, 1, 1, 0xffffff, 0.62, 0.6);
  var CT_Y = 0.90, CT_D = 0.62;
  function counterRun(x0, x1, z, along) {      // along: "x" or "z"
    var len = along === "x" ? (x1 - x0) : (x1 - x0);
    var cx = along === "x" ? (x0 + x1) / 2 : z, cz = along === "x" ? z : (x0 + x1) / 2;
    var w1 = along === "x" ? len : CT_D, d1 = along === "x" ? CT_D : len;
    var carc = box(w1, 0.06, d1, lamM); carc.position.set(cx, CT_Y, cz); kadd(carc);
    var body = box(w1 - 0.02, CT_Y - 0.14, d1 - 0.04, oakM);
    body.position.set(cx, (CT_Y - 0.14) / 2 + 0.12, cz); kadd(body);
    var kick = box(w1 - 0.1, 0.12, d1 - 0.16, mat(0x4a3524, 0.8));
    kick.position.set(cx, 0.06, cz); kadd(kick);
    var n = Math.max(1, Math.round(len / 0.62));
    for (var i = 0; i < n; i++) {                                    // handles
      var t2 = (i + 0.5) / n;
      var hx = along === "x" ? x0 + t2 * len : cx + (CT_D / 2 + 0.02) * (z > KCX ? -1 : 1);
      var hz = along === "x" ? cz + (CT_D / 2 + 0.02) * (z > KCZ ? -1 : 1) : x0 + t2 * len;
      var hd = box(along === "x" ? 0.16 : 0.03, 0.03, along === "x" ? 0.03 : 0.16, mat(0x8f959b, 0.4));
      hd.position.set(hx, CT_Y - 0.24, hz); kadd(hd);
    }
    ktag(carc, "the counter", null, "wiped down. it is always wiped down.");
    return carc;
  }
  // ⚠️⚠️ THE FAR RUN IS TWO PIECES WITH A GAP FOR THE COOKER. As one unbroken run it
  // swallowed the cooker whole: 0.62 x 0.58m of EXACTLY coplanar top face at y 0.88,
  // which is the stove Kyle saw flashing. In plan it looked completely fine — the
  // bug is only visible if you sweep every pair of boxes for near-equal face heights.
  var cookX = KX1 - 2.55, COOK_W = 0.62, CT_TOP = CT_Y + 0.03;
  counterRun(KX0 + 0.05, cookX - COOK_W / 2 - 0.01, KZ0 + CT_D / 2 + 0.05, "x");
  counterRun(cookX + COOK_W / 2 + 0.01, KX1 - 1.9, KZ0 + CT_D / 2 + 0.05, "x");
  // ⚠️ and the west run STARTS past the far run's depth, not at the wall. An L of two
  // full-length runs double-fills the corner — another 0.62 x 0.62m coplanar pair at
  // y 0.93, plus the kick boards fighting at y 0.12 underneath it.
  counterRun(KZ0 + CT_D + 0.02, KZ1 - 2.6, KX0 + CT_D / 2 + 0.05, "z");

  // wall cupboards over the far run — and they STOP at the hood. A cupboard run that
  // carries on over the cooker buries the extractor inside itself, which is both
  // wrong and how real kitchens are actually laid out: hood, then open wall.
  var UP0 = KX0 + 0.05, UP1 = cookX - 0.42, UPC = (UP0 + UP1) / 2;
  var upper = box(UP1 - UP0, 0.72, 0.34, oakM);
  upper.position.set(UPC, 1.92, KZ0 + 0.22); kadd(upper);
  var upTrim = box(UP1 - UP0 + 0.04, 0.06, 0.38, mat(0x7d5a34, 0.7));
  upTrim.position.set(UPC, 2.31, KZ0 + 0.23); kadd(upTrim);
  ktag(upper, "the cupboards", null, "the good glasses are on the top shelf, which is the point of a top shelf.");
  // under-cupboard strip light — the thing that makes a kitchen feel like a kitchen
  var strip = new THREE.Mesh(new THREE.BoxGeometry(UP1 - UP0 - 0.24, 0.03, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe8b8, emissiveIntensity: 1.3, roughness: 0.4 }));
  strip.position.set(UPC, 1.55, KZ0 + 0.3); kadd(strip);
  var kUnder = new THREE.PointLight(0xffdda6, 1.1, 4.2, 1.9);
  kUnder.position.set(UPC, 1.42, KZ0 + 0.62); kadd(kUnder);
  var kStripOn = 1;   // the recipe box can turn the strip light off

  // --- the window over the sink, looking out at the side of the yard
  var kWinT = canvasTex(128, 96, function (c, w, h) {
    var sk2 = c.createLinearGradient(0, 0, 0, h);
    sk2.addColorStop(0, "#22314e"); sk2.addColorStop(1, "#4a5c6e");
    c.fillStyle = sk2; c.fillRect(0, 0, w, h);
    c.fillStyle = "#16210f"; c.fillRect(0, h * 0.62, w, h * 0.38);      // the side lawn
    c.fillStyle = "#1a1410";                                            // the fence
    for (var b2 = 0; b2 < 14; b2++) c.fillRect(b2 * 9 + 1, h * 0.44, 8, h * 0.2);
  });
  kWinT.colorSpace = THREE.SRGBColorSpace;
  var kWin = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.85),
    new THREE.MeshBasicMaterial({ map: kWinT }));
  kWin.position.set(KX0 + 0.045, 1.55, KCZ - 0.6); kWin.rotation.y = Math.PI / 2; kadd(kWin);
  [[0, 0.47, 1.3, 0.06], [0, -0.47, 1.3, 0.06], [-0.66, 0, 0.06, 1.0], [0.66, 0, 0.06, 1.0]]
    .forEach(function (f) {
      var fr = box(0.07, f[3], f[2], mat(0xe8e2d0, 0.8));
      fr.position.set(KX0 + 0.06, 1.55 + f[1], KCZ - 0.6 + f[0]); kadd(fr);
    });
  ktag(kWin, "the kitchen window", null, "over the sink, so somebody could watch the side yard while they scrubbed.");
  // ⚠️ THE OLD SINK WAS INSIDE THE CABINET. Its basin sat at y 0.76 — below the 0.87
  // underside of the counter slab — so it was invisible from every camera in the
  // house, and its two "lip" pieces multiplied their x offset by 0.0, which put both
  // in the same place. Dead geometry that nobody could see was wrong. It reads from
  // above now: a dark basin ON the counter surface via polygonOffset (bias the depth
  // test, never the position — the contact-shadow rule) inside a steel rim.
  var SK_X = KX0 + 0.36, SK_Z = KCZ - 0.6;
  var basin = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x64696d, roughness: 0.3, metalness: 0.5,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  basin.rotation.x = -Math.PI / 2; basin.position.set(SK_X, CT_TOP, SK_Z); kadd(basin);
  [[0, -0.19, 0.50, 0.04], [0, 0.19, 0.50, 0.04], [-0.23, 0, 0.04, 0.42], [0.23, 0, 0.04, 0.42]]
    .forEach(function (rb) {
      var bar = box(rb[2], 0.02, rb[3], mat(0xc0c6ca, 0.28));
      bar.position.set(SK_X + rb[0], CT_TOP + 0.008, SK_Z + rb[1]); kadd(bar);
    });
  var tap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), mat(0xb9bfc4, 0.3));
  tap.position.set(KX0 + 0.16, CT_TOP + 0.15, SK_Z); kadd(tap);
  var spout = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 8), mat(0xb9bfc4, 0.3));
  spout.rotation.z = Math.PI / 2; spout.position.set(KX0 + 0.29, CT_TOP + 0.28, SK_Z); kadd(spout);
  ktag(tap, "the tap", null, "it drips. everyone has stopped hearing it.");

  // --- the cooker + hood. Its top is FLUSH with the counter surface (CT_TOP) and it
  // fills the gap left in the run, so no two faces share a plane anywhere.
  var COOK_Z = KZ0 + CT_D / 2 + 0.05, COOK_FRONT = COOK_Z + (CT_D - 0.04) / 2;
  var cooker = box(COOK_W, CT_TOP, CT_D - 0.04, mat(0xe0e2de, 0.4));
  cooker.position.set(cookX, CT_TOP / 2, COOK_Z); kadd(cooker);
  var hob = box(COOK_W - 0.06, 0.03, 0.5, mat(0x24262a, 0.35));
  hob.position.set(cookX, CT_TOP + 0.015, COOK_Z); kadd(hob);
  [[-0.13, -0.11], [0.13, -0.11], [-0.13, 0.12], [0.13, 0.12]].forEach(function (rg) {
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 16), mat(0x15171a, 0.5));
    ring.rotation.x = -Math.PI / 2; ring.position.set(cookX + rg[0], CT_TOP + 0.042, COOK_Z + rg[1]); kadd(ring);
  });
  // ⚠️ door and glass each stand PROUD of what's behind them (+0.02, +0.025). The old
  // door was centred exactly on the cooker's own front face — a third coplanar pair.
  var ovenDoor = box(COOK_W - 0.08, 0.42, 0.03, mat(0x2a2d31, 0.35));
  ovenDoor.position.set(cookX, 0.46, COOK_FRONT + 0.02); kadd(ovenDoor);
  var ovenGlass = box(0.4, 0.24, 0.012, mat(0x14161a, 0.2));
  ovenGlass.position.set(cookX, 0.5, COOK_FRONT + 0.045); kadd(ovenGlass);
  var ovenBar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, COOK_W - 0.12, 8), mat(0xb9bfc4, 0.3));
  ovenBar.rotation.z = Math.PI / 2; ovenBar.position.set(cookX, 0.71, COOK_FRONT + 0.05); kadd(ovenBar);
  var hood = box(0.72, 0.26, 0.5, mat(0xd8dad6, 0.45));
  hood.position.set(cookX, 1.72, KZ0 + 0.3); kadd(hood);
  var hoodLip = box(0.78, 0.06, 0.56, mat(0xc4c6c2, 0.45));
  hoodLip.position.set(cookX, 1.58, KZ0 + 0.32); kadd(hoodLip);
  ktag(cooker, "the cooker", null, "four rings, one of which has always been the good one.");

  // --- THE FRIDGE, and it hums, because the hallway door promised it would
  var frX = KX1 - 0.95;
  var fridge = box(0.78, 1.72, 0.72, mat(0xe8e6dc, 0.42));
  fridge.position.set(frX, 0.86, KZ1 - 0.5); kadd(fridge);
  var frSplit = box(0.8, 0.02, 0.74, mat(0xbfbdb2, 0.5));
  frSplit.position.set(frX, 1.22, KZ1 - 0.5); kadd(frSplit);
  [[0.62, 0.5], [1.5, 0.28]].forEach(function (hh) {
    var hnd = box(0.04, hh[1], 0.04, mat(0xbfbdb2, 0.35));
    hnd.position.set(frX - 0.33, hh[0], KZ1 - 0.87); kadd(hnd);
  });
  // the door: magnets, a shopping list, and the kid's drawings of the games
  var frDoorT = canvasTex(192, 256, function (c, w, h) {
    c.fillStyle = "#e8e6dc"; c.fillRect(0, 0, w, h);
    function magnet(x, y, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
    c.save(); c.translate(w * 0.30, h * 0.30); c.rotate(-0.07);        // a crayon drawing
    c.fillStyle = "#f4efdd"; c.fillRect(-40, -34, 80, 68);
    c.strokeStyle = "#3a6a3a"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-26, 22); c.lineTo(-26, -6); c.lineTo(-6, -22); c.lineTo(14, -6); c.lineTo(14, 22); c.stroke();
    c.fillStyle = "#c8a23a"; c.fillRect(-14, 2, 12, 20);
    c.strokeStyle = "#c04a3a"; c.beginPath(); c.arc(24, -20, 8, 0, 7); c.stroke();
    c.fillStyle = "#5a5040"; c.font = "italic 11px Georgia, serif"; c.textAlign = "center";
    c.fillText("our house", 0, 30);
    c.restore();
    magnet(w * 0.30 - 40, h * 0.30 - 34, "#c94b3a"); magnet(w * 0.30 + 40, h * 0.30 + 32, "#3a6ac9");
    c.save(); c.translate(w * 0.66, h * 0.62); c.rotate(0.05);          // the list
    c.fillStyle = "#fdfaf0"; c.fillRect(-30, -40, 60, 80);
    c.fillStyle = "#4a4436"; c.font = "11px Georgia, serif"; c.textAlign = "left";
    ["milk", "bread", "the good", "  cereal", "batteries"].forEach(function (l, i) { c.fillText(l, -22, -22 + i * 15); });
    c.restore();
    magnet(w * 0.66, h * 0.62 - 40, "#e0b03a");
    c.fillStyle = "#3a3a3a"; c.font = "bold 9px sans-serif"; c.textAlign = "center";
    c.fillText("A B C D E F G", w * 0.5, h * 0.90);                     // alphabet magnets
  });
  var frDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 1.68),
    new THREE.MeshStandardMaterial({ map: frDoorT, roughness: 0.44 }));
  frDoor.position.set(frX, 0.86, KZ1 - 0.865); frDoor.rotation.y = Math.PI; kadd(frDoor);
  ktag(frDoor, "the fridge", null, "it hums like it knows something. it has always hummed like that.");
  var frGlow = new THREE.PointLight(0xbfe8d8, 0.28, 2.4, 2);
  frGlow.position.set(frX, 1.0, KZ1 - 1.0); kadd(frGlow);

  // --- the table, where the actual living gets done
  var tblT = box(1.15, 0.05, 0.78, lamM); tblT.position.set(KCX + 0.55, 0.74, KCZ + 1.05); kadd(tblT);
  [[-0.5, -0.32], [0.5, -0.32], [-0.5, 0.32], [0.5, 0.32]].forEach(function (l) {
    var lg = box(0.05, 0.72, 0.05, mat(0x8a6a44, 0.7));
    lg.position.set(KCX + 0.55 + l[0], 0.36, KCZ + 1.05 + l[1]); kadd(lg);
  });
  ktag(tblT, "the kitchen table", null, "homework, cereal, and every difficult conversation this house has had.");
  // ⚠️ chairs are GROUPS so they can be turned. Built inline they could only ever sit
  // square to the table, which is the one thing chairs in a lived-in kitchen never do.
  // (The old inline version also carried a third number per chair that nothing read.)
  function kChair(dx, dz, ry) {
    var c = new THREE.Group(); c.position.set(KCX + 0.55 + dx, 0, KCZ + 1.05 + dz); c.rotation.y = ry; kadd(c);
    var seat = box(0.4, 0.05, 0.4, mat(0xc4a86a, 0.75)); seat.position.y = 0.45; c.add(seat);
    var back = box(0.06, 0.46, 0.4, mat(0xc4a86a, 0.75)); back.position.set(-0.17, 0.68, 0); c.add(back);
    [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].forEach(function (cl) {
      var cle = box(0.04, 0.45, 0.04, mat(0xb09858, 0.75));
      cle.position.set(cl[0], 0.225, cl[1]); c.add(cle);
    });
    ktag(seat, "a kitchen chair", null, "somebody got up in a hurry and never pushed it back in.");
    return c;
  }
  kChair(-0.72, 0, 0);                       // tucked in
  kChair(0.80, 0.26, Math.PI + 0.42);        // pulled out and turned, mid-conversation
  // ⚠️ an OPEN bowl, not a sphere-cap. The dome version rendered as a 30cm orange
  // ham sitting on the table, with the fruit sealed invisibly inside it.
  var bowl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.09, 0.07, 16, 1, true), mat(0xb5793a, 0.6));
  bowl2.material.side = THREE.DoubleSide;
  bowl2.position.set(KCX + 0.55, 0.80, KCZ + 1.05); kadd(bowl2);
  var bowlBase = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), mat(0x9a6530, 0.6));
  bowlBase.rotation.x = -Math.PI / 2; bowlBase.position.set(KCX + 0.55, 0.768, KCZ + 1.05); kadd(bowlBase);
  var kFruit = [];
  [[0, 0.03, 0xd8a83a], [0.06, 0.04, 0xc04a3a], [-0.05, 0.03, 0x8aa83a]].forEach(function (fr2) {
    var fruit = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(fr2[2], 0.7));
    fruit.position.set(KCX + 0.55 + fr2[0], 0.84 + fr2[1], KCZ + 1.05 + fr2[0] * 0.6); kadd(fruit);
    kFruit.push(fruit);
  });

  // --- the small stuff, which is what actually sells a room
  // ⚠️ these all sit on CT_TOP, not CT_Y. CT_Y is the counter slab's CENTRE, so
  // everything placed against it was buried 3cm into the worktop — the kettle, the
  // toaster and the mug tree were all standing in the laminate.
  var kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.2, 14), mat(0xd8d5cc, 0.4));
  kettle.position.set(KX1 - 3.5, CT_TOP + 0.1, KZ0 + 0.4); kadd(kettle);
  var kSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.1, 8), mat(0xd8d5cc, 0.4));
  kSpout.rotation.z = -0.7; kSpout.position.set(KX1 - 3.41, CT_TOP + 0.18, KZ0 + 0.4); kadd(kSpout);
  ktag(kettle, "the kettle", null, "the kettle. it is basically always just boiled.");
  var toaster = box(0.26, 0.17, 0.16, mat(0xc8ccd0, 0.3));
  toaster.position.set(KX1 - 4.1, CT_TOP + 0.085, KZ0 + 0.38); kadd(toaster);
  var mugTree = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.06, 0.28, 8), mat(0x8a6a44, 0.7));
  mugTree.position.set(KX1 - 3.05, CT_TOP + 0.14, KZ0 + 0.36); kadd(mugTree);
  var kMugs = [];
  [[0.07, 0.2, 0xc94b3a], [-0.07, 0.16, 0x3a6ac9], [0.05, 0.12, 0xe0b03a]].forEach(function (mg) {
    var mug = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.033, 0.075, 10), mat(mg[2], 0.5));
    mug.position.set(KX1 - 3.05 + mg[0], CT_TOP + mg[1], KZ0 + 0.36 + mg[0] * 0.5); kadd(mug);
    kMugs.push(mug.material);
  });
  var kClock = new THREE.Mesh(new THREE.CircleGeometry(0.15, 22), new THREE.MeshBasicMaterial({
    map: canvasTex(64, 64, function (c, w, h) {
      c.fillStyle = "#f4efdd"; c.beginPath(); c.arc(32, 32, 32, 0, 7); c.fill();
      c.strokeStyle = "#3a3020"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(32, 32); c.lineTo(32, 13); c.stroke();
      c.beginPath(); c.moveTo(32, 32); c.lineTo(46, 38); c.stroke();
      c.fillStyle = "#3a3020";
      for (var t3 = 0; t3 < 12; t3++) {
        var a2 = t3 / 12 * 6.283;
        c.fillRect(32 + Math.sin(a2) * 27 - 1, 32 - Math.cos(a2) * 27 - 1, 2, 2);
      }
    }),
  }));
  kClock.position.set(KCX - 1.1, 2.05, KZ1 - 0.055); kClock.rotation.y = Math.PI; kadd(kClock);
  ktag(kClock, "the kitchen clock", null, "eleven minutes fast, on purpose, for reasons nobody remembers.");
  // the calendar, with one day circled
  var calT = canvasTex(96, 128, function (c, w, h) {
    c.fillStyle = "#f6f1e2"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#8a4a3a"; c.fillRect(0, 0, w, 26);
    c.fillStyle = "#f6f1e2"; c.font = "bold 13px Georgia, serif"; c.textAlign = "center";
    c.fillText("AUGUST", w / 2, 18);
    c.fillStyle = "#4a4436"; c.font = "8px Georgia, serif";
    for (var r2 = 0; r2 < 5; r2++) for (var c2 = 0; c2 < 7; c2++)
      c.fillText(String(r2 * 7 + c2 + 1), 8 + c2 * 13, 44 + r2 * 17);
    c.strokeStyle = "#c0392b"; c.lineWidth = 2;
    c.beginPath(); c.ellipse(8 + 3 * 13, 44 + 2 * 17 - 3, 9, 8, 0, 0, 7); c.stroke();
  });
  var cal = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4),
    new THREE.MeshStandardMaterial({ map: calT, roughness: 0.9 }));
  cal.position.set(KCX + 0.6, 1.7, KZ1 - 0.055); cal.rotation.y = Math.PI; kadd(cal);
  ktag(cal, "the calendar", null, "one day is circled in red and nobody will say which one it is.");

  /* ---- SHORT STAFFED: the apron on its hook by the window --------------------- */
  var apT = canvasTex(96, 144, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#c94b3a";                                   // diner red
    c.beginPath();                                              // bib + skirt
    c.moveTo(w * 0.32, 6); c.lineTo(w * 0.68, 6);
    c.lineTo(w * 0.68, h * 0.34); c.lineTo(w * 0.88, h * 0.42); c.lineTo(w * 0.88, h - 6);
    c.lineTo(w * 0.12, h - 6); c.lineTo(w * 0.12, h * 0.42); c.lineTo(w * 0.32, h * 0.34);
    c.closePath(); c.fill();
    c.strokeStyle = "#f2e2c4"; c.lineWidth = 3;                 // neck strap + ties
    c.beginPath(); c.moveTo(w * 0.32, 8); c.quadraticCurveTo(w * 0.5, -8, w * 0.68, 8); c.stroke();
    c.fillStyle = "#a83a2c"; c.fillRect(w * 0.24, h * 0.52, w * 0.52, h * 0.22); // the pocket
    c.strokeStyle = "#f2e2c4"; c.lineWidth = 2; c.strokeRect(w * 0.24, h * 0.52, w * 0.52, h * 0.22);
    c.fillStyle = "#f2e2c4"; c.font = "bold 10px Georgia, serif"; c.textAlign = "center";
    c.fillText("WING BARN", w * 0.5, h * 0.44);
    c.fillStyle = "rgba(90,60,30,0.4)";                         // one grease mark, earned
    c.beginPath(); c.ellipse(w * 0.62, h * 0.82, 8, 5, 0.4, 0, 7); c.fill();
  });
  var apron = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62),
    new THREE.MeshStandardMaterial({ map: apT, transparent: true, roughness: 0.95, side: THREE.DoubleSide }));
  apron.position.set(KX0 + 0.07, 1.42, 0.55); apron.rotation.y = Math.PI / 2; apron.rotation.z = 0.04; kadd(apron);
  var apHook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), mat(0x8f959b, 0.4));
  apHook.rotation.z = Math.PI / 2; apHook.position.set(KX0 + 0.05, 1.74, 0.55); kadd(apHook);
  var ssName = (function () { try { return localStorage.getItem("ss-name") || null; } catch (e) { return null; } })();
  var ssHint = ssName
    ? "SHORT STAFFED — " + ssName + "'s apron, still on the hook · click to take a shift"
    : "SHORT STAFFED — somebody's shift starts eventually · click to clock in";
  function ssGo() { window.location.href = "https://kylefriesmarketing.github.io/short-staffed/"; }
  [apron, apHook].forEach(function (m) { ktag(m, "SHORT STAFFED", ssGo, ssHint); });

  /* ---- HOME BREW: the batch on the counter, east of the cooker ---------------- */
  var brewG = new THREE.Group(); brewG.position.set(KX1 - 2.05, CT_Y + 0.03, KZ0 + 0.36); brewG.rotation.y = -0.2; kadd(brewG);
  var amberM = new THREE.MeshStandardMaterial({ color: 0x8a4d1a, roughness: 0.15, transparent: true, opacity: 0.85 });
  [[-0.07, 0], [0.02, -0.04], [0.09, 0.03], [0.0, 0.06]].forEach(function (bp, i) {
    var bot = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.15, 10), amberM);
    bot.position.set(bp[0], 0.075, bp[1]); brewG.add(bot);
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.02, 0.06, 8), amberM);
    neck.position.set(bp[0], 0.18, bp[1]); brewG.add(neck);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 8), mat(0xc9a23a, 0.35));
    cap.position.set(bp[0], 0.215, bp[1]); brewG.add(cap);
    if (i === 0) {   // one label, hand-stuck slightly crooked
      var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.055), new THREE.MeshStandardMaterial({
        map: canvasTex(48, 48, function (c, w, h) {
          c.fillStyle = "#f2e8d0"; c.fillRect(0, 0, w, h);
          c.strokeStyle = "#6a4a2a"; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4);
          c.fillStyle = "#6a4a2a"; c.font = "bold 9px Georgia, serif"; c.textAlign = "center";
          c.fillText("HOME", w / 2, 20); c.fillText("BREW", w / 2, 32);
        }), roughness: 0.9,
      }));
      lbl.position.set(bp[0], 0.09, bp[1] + 0.031); lbl.rotation.z = -0.06; brewG.add(lbl);
    }
  });
  var brewHas = (function () { try { return !!localStorage.getItem("mybrew-save-v1"); } catch (e) { return false; } })();
  var brewHint = brewHas
    ? "HOME BREW — the brewery's still running · click to check the tanks"
    : "HOME BREW — the first batch brews itself · click to open the brewery";
  function brewGo() { window.location.href = "https://kylefriesmarketing.github.io/home-brew/"; }
  brewG.traverse(function (o) { if (o.isMesh) ktag(o, "HOME BREW", brewGo, brewHint); });
  // ceiling light
  var kLampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.2, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.7, side: THREE.DoubleSide }));
  kLampShade.position.set(KCX, KCEIL - 0.28, KCZ); kadd(kLampShade);
  var kBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffdca6, emissiveIntensity: 1.6, roughness: 0.4 }));
  kBulb.position.set(KCX, KCEIL - 0.32, KCZ); kadd(kBulb);
  var kLight = new THREE.PointLight(0xffe0b4, 2.4, 8.5, 1.6);
  kLight.position.set(KCX, KCEIL - 0.4, KCZ); kadd(kLight);
  var kFill = new THREE.PointLight(0xffeccc, 0.45, 9, 2);
  kFill.position.set(KCX, 1.5, KCZ); kadd(kFill);

  /* ---- the kitchen, lived in ---------------------------------------------------
   * The room was furnished but nothing in it had ever been USED. Two of its own
   * labels were promises it didn't keep: the floor says "there is a worn track from
   * the fridge to the kettle" and the tap says "it drips". Both are true now. */

  // --- tiled backsplash. The single biggest visual gap: a bare painted wall between
  // the worktop and the wall units, where every real kitchen has tile.
  var tileT = canvasTex(128, 128, function (c, w, h) {
    c.fillStyle = "#cdc6b6"; c.fillRect(0, 0, w, h);                 // grout
    for (var ty = 0; ty < 4; ty++) for (var tx = 0; tx < 4; tx++) {
      c.fillStyle = ["#f2eddd", "#ebe5d2", "#f5f1e4", "#e7e0cd"][(tx * 3 + ty * 5) % 4];
      c.fillRect(tx * 32 + 2, ty * 32 + 2, 28, 28);
      c.fillStyle = "rgba(255,255,255,0.30)";                        // glaze highlight
      c.fillRect(tx * 32 + 4, ty * 32 + 4, 24, 5);
    }
    c.fillStyle = "#7f9fb2";                                         // two painted tiles
    c.fillRect(34, 34, 28, 28); c.fillRect(66, 2, 28, 28);
  });
  var splashN = new THREE.Mesh(new THREE.PlaneGeometry(KX1 - 1.9 - KX0, 1.50 - CT_TOP),
    ground(tileT, 6, 1, 0xffffff, 0.35, 0.9));
  splashN.position.set((KX0 + KX1 - 1.9) / 2, (CT_TOP + 1.50) / 2, KZ0 + 0.014); kadd(splashN);
  var splashW = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 0.19),
    ground(tileT, 4, 0.14, 0xffffff, 0.35, 0.9));
  splashW.rotation.y = Math.PI / 2;
  splashW.position.set(KX0 + 0.014, CT_TOP + 0.095, -1.73); kadd(splashW);
  ktag(splashN, "the tiles", null, "two of them are hand-painted blue. nobody remembers buying them.");

  // --- soft contact + wear decals. Same rule as outdoors: polygonOffset, never a
  // raised y, because the floor and the worktop are at different heights.
  function kDecal(tex, x, y, z, rx, rz, op, ry) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    m.rotation.x = -Math.PI / 2; if (ry) m.rotation.z = ry;
    m.position.set(x, y, z); m.renderOrder = 2; kadd(m); return m;
  }
  function radialTex(rgb, peak) {
    return canvasTex(64, 64, function (c, w, h) {
      var g = c.createRadialGradient(32, 32, 1, 32, 32, 32);
      g.addColorStop(0, "rgba(" + rgb + "," + peak + ")"); g.addColorStop(1, "rgba(" + rgb + ",0)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
  }
  // ⚠️ the wear texture peaks at 0.62 alpha, not 0.30. The material opacity MULTIPLIES
  // the map's alpha, so 0.30 x 0.32 gave an effective 0.10 — the track was in the
  // scene, visible, correctly placed, and completely impossible to see. Two numbers
  // that each look reasonable alone can multiply into nothing; check the product.
  var kShadeT = radialTex("0,0,0", 0.62), kWearT = radialTex("104,94,74", 0.62);
  [[KX1 - 0.95, KZ1 - 0.5, 0.52, 0.48, 0.55],   // the fridge
   [cookX, KZ0 + 0.36, 0.42, 0.40, 0.50],       // the cooker
   [KCX + 0.55, KCZ + 1.05, 0.70, 0.52, 0.34],  // the table
   [KX0 + 0.45, KZ1 - 0.55, 0.24, 0.24, 0.45]   // the bin, below
  ].forEach(function (s) { kDecal(kShadeT, s[0], 0.012, s[1], s[2], s[3], s[4]); });

  // ⚠️ the worn track is a STRING OF DECALS at real world positions, not a stripe
  // painted into the lino texture — the lino tiles 11x, so anything drawn into it
  // would repeat eleven times across the floor. Discs also dodge the question of
  // which way a rotated plane's UVs run, which is a coin flip worth not tossing.
  (function () {
    var WAY = [[-8.62, 0.92], [-9.30, 0.34], [-9.95, -0.42], [-10.52, -1.30],
               [-10.95, -2.20], [-11.10, -2.72], [-11.95, -2.10], [-12.35, -1.45]];
    for (var i = 0; i < WAY.length - 1; i++) {
      var a = WAY[i], b = WAY[i + 1];
      for (var t = 0; t < 1; t += 0.34) {
        var jx = (Math.random() - 0.5) * 0.13, jz = (Math.random() - 0.5) * 0.13;
        kDecal(kWearT, a[0] + (b[0] - a[0]) * t + jx, 0.010, a[1] + (b[1] - a[1]) * t + jz,
          0.34 + Math.random() * 0.12, 0.30 + Math.random() * 0.12, 0.52 + Math.random() * 0.16);
      }
    }
    kDecal(kWearT, -12.40, 0.010, -1.35, 0.38, 0.34, 0.62);   // standing at the sink
    kDecal(kWearT, -8.62, 0.010, 1.02, 0.36, 0.32, 0.58);     // and at the fridge door
  })();

  // --- the dish rack, still draining
  var rackG = new THREE.Group(); rackG.position.set(SK_X + 0.02, CT_TOP, SK_Z + 0.62); kadd(rackG);
  var rackBase = box(0.30, 0.015, 0.24, mat(0x9aa0a6, 0.45)); rackBase.position.y = 0.012; rackG.add(rackBase);
  for (var rw = 0; rw < 5; rw++) {                              // the wire dividers
    var wire = box(0.28, 0.012, 0.012, mat(0xb4bac0, 0.35));
    wire.position.set(0, 0.06, -0.09 + rw * 0.045); rackG.add(wire);
  }
  [[-0.05, 0.10, 0xf0ece0], [0.01, 0.11, 0xe8e2d2], [0.07, 0.095, 0xf2eee2]].forEach(function (pl) {
    var plate = new THREE.Mesh(new THREE.CylinderGeometry(pl[1], pl[1], 0.012, 18), mat(pl[2], 0.5));
    plate.rotation.x = Math.PI / 2; plate.rotation.z = 0.06;
    plate.position.set(0, 0.075, pl[0]); rackG.add(plate);
  });
  ktag(rackBase, "the dish rack", null, "washed last night. nobody has put them away.");

  // --- a tea towel over the oven bar, because that is where tea towels live
  var towelT = canvasTex(48, 64, function (c, w, h) {
    c.fillStyle = "#dfe6dc"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#8fa8bc"; c.lineWidth = 3;
    for (var s = 0; s < 4; s++) { c.beginPath(); c.moveTo(0, 10 + s * 15); c.lineTo(w, 10 + s * 15); c.stroke(); }
    c.strokeStyle = "#c07a6a"; c.beginPath(); c.moveTo(0, 46); c.lineTo(w, 46); c.stroke();
  });
  var towel = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.30),
    new THREE.MeshStandardMaterial({ map: towelT, roughness: 0.95, side: THREE.DoubleSide }));
  towel.position.set(cookX - 0.11, 0.57, COOK_FRONT + 0.062); towel.rotation.z = 0.05; kadd(towel);
  ktag(towel, "the tea towel", null, "damp. it is always slightly damp.");

  // --- the bin, and the plant on the windowsill
  var binG = new THREE.Group(); binG.position.set(KX0 + 0.45, 0, KZ1 - 0.55); kadd(binG);
  var binBody = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.52, 14, 1, true), mat(0x9fa4a8, 0.6));
  binBody.material.side = THREE.DoubleSide; binBody.position.y = 0.26; binG.add(binBody);
  var binLid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 14), mat(0x8b9094, 0.5));
  binLid.position.set(0.02, 0.545, -0.01); binLid.rotation.z = 0.09; binG.add(binLid);
  ktag(binLid, "the bin", null, "the pedal stopped working years ago. you use your hand like everyone else.");
  var sill = box(0.13, 0.03, 1.22, mat(0xece6d4, 0.85));
  sill.position.set(KX0 + 0.085, 1.11, KCZ - 0.6); kadd(sill);
  var potG = new THREE.Group(); potG.position.set(KX0 + 0.10, 1.125, KCZ - 1.02); kadd(potG);
  var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.09, 12), mat(0xb5673f, 0.7));
  pot.position.y = 0.045; potG.add(pot);
  var soil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 12), mat(0x3a2c20, 0.95));
  soil.position.y = 0.09; potG.add(soil);
  for (var lf = 0; lf < 7; lf++) {                               // a spider plant, thriving
    var a2 = lf * 0.9, ln = 0.11 + (lf % 3) * 0.045;
    var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.016, ln, 5), mat(lf % 2 ? 0x5d8a4a : 0x6f9c54, 0.85));
    leaf.position.set(Math.cos(a2) * 0.035, 0.10 + ln * 0.42, Math.sin(a2) * 0.035);
    leaf.rotation.set(Math.sin(a2) * 0.7, 0, -Math.cos(a2) * 0.7); potG.add(leaf);
  }
  ktag(pot, "the spider plant", null, "the one green thing in this house that nobody has managed to kill.");

  // --- the everyday clutter that says somebody shops here
  var cerealT = canvasTex(64, 96, function (c, w, h) {
    c.fillStyle = "#d8a13a"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#a8452e"; c.fillRect(0, h * 0.30, w, h * 0.22);
    c.fillStyle = "#fff4dc"; c.font = "bold 11px Georgia, serif"; c.textAlign = "center";
    c.fillText("BRAN", w / 2, h * 0.44);
    c.fillStyle = "rgba(255,255,255,0.55)"; c.beginPath(); c.arc(w / 2, h * 0.68, 13, 0, 7); c.fill();
  });
  var cereal = box(0.17, 0.29, 0.075, new THREE.MeshStandardMaterial({ map: cerealT, roughness: 0.9 }));
  cereal.position.set(KX1 - 4.62, CT_TOP + 0.145, KZ0 + 0.34); cereal.rotation.y = 0.13; kadd(cereal);
  ktag(cereal, "the cereal", null, "the boring kind. the good kind is hidden.");
  [[KX1 - 5.02, 0.055, 0x7d8a5e], [KX1 - 5.17, 0.047, 0xa85a3e]].forEach(function (tn) {
    var tin = new THREE.Mesh(new THREE.CylinderGeometry(tn[1], tn[1], 0.10, 12), mat(tn[2], 0.5));
    tin.position.set(tn[0], CT_TOP + 0.05, KZ0 + 0.30); kadd(tin);
  });

  // --- ANIMATED: the kettle steams and the tap drips (both view-only, ticked below)
  var puffT = radialTex("235,238,242", 0.5);
  var kSteam = [];
  for (var sp = 0; sp < 7; sp++) {
    var puff = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.10),
      new THREE.MeshBasicMaterial({ map: puffT, transparent: true, opacity: 0, depthWrite: false }));
    puff.renderOrder = 6; kadd(puff);
    kSteam.push({ m: puff, t: sp / 7 });
  }
  var dripDrop = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), mat(0xcfe4ee, 0.15));
  dripDrop.scale.set(1, 1.5, 1); kadd(dripDrop);
  var dripRing = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.03, 16),
    new THREE.MeshBasicMaterial({ color: 0xbcd8e6, transparent: true, opacity: 0, depthWrite: false }));
  dripRing.rotation.x = -Math.PI / 2; dripRing.position.set(SK_X, CT_TOP + 0.002, SK_Z);
  dripRing.renderOrder = 4; kadd(dripRing);
  var DRIP_TOP = CT_TOP + 0.26, DRIP_BOT = CT_TOP + 0.01, dripT = 0;
  function kitchenLife(dt, lampOn) {
    for (var i = 0; i < kSteam.length; i++) {          // steam off the kettle spout
      var s = kSteam[i];
      s.t += dt * 0.30;
      if (s.t > 1) s.t -= 1;
      var f = s.t;
      s.m.position.set(KX1 - 3.38 + Math.sin(f * 5.2 + i) * 0.045 * f,
                       CT_TOP + 0.24 + f * 0.42,
                       KZ0 + 0.40 + Math.cos(f * 4.1 + i) * 0.035 * f);
      s.m.scale.setScalar(0.5 + f * 1.7);
      s.m.material.opacity = 0.30 * Math.sin(f * Math.PI) * lampOn;
      s.m.quaternion.copy(camera.quaternion);          // billboard, so it never reads flat
    }
    dripT += dt;                                        // the tap, roughly every 2.4s
    var cyc = dripT % 2.4;
    if (cyc < 0.55) {
      var g = cyc / 0.55;
      dripDrop.visible = true;
      dripDrop.position.set(KX0 + 0.29, DRIP_TOP - (DRIP_TOP - DRIP_BOT) * g * g, SK_Z);
      dripRing.material.opacity = 0;
    } else {
      dripDrop.visible = false;
      var r2 = Math.min(1, (cyc - 0.55) / 0.7);         // the ripple it leaves
      dripRing.scale.setScalar(0.5 + r2 * 1.8);
      dripRing.material.opacity = 0.42 * (1 - r2) * lampOn;
    }
  }

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
  // ⚠️ the siding STANDS PROUD of the wall (−0.055, not −0.03). At −0.03 its outer
  // face landed on exactly the same plane as the wall's own outer face — over 10m²
  // of coplanar facade across the three segments, the largest z-fight in the house.
  // Real lap siding is nailed ON the sheathing, so standing it proud is both the fix
  // and the truth.
  [[W_IN - 0.1, FDO.x0], [FDO.x1, E_IN + 0.1]].forEach(function (p) {
    var sv = box(p[1] - p[0], 3.4, 0.04, sidingM);
    sv.position.set((p[0] + p[1]) / 2, 1.7, HOUSE_F - 0.055); yadd(sv);
  });
  // ⚠️ opening width only, same reason as the wall header it clads
  var sideHdr = box(FDO.x1 - FDO.x0, 3.4 - FDO.y1, 0.04, sidingM);
  sideHdr.position.set(FRONT_X, (FDO.y1 + 3.4) / 2, HOUSE_F - 0.055); yadd(sideHdr);
  var trimM = mat(0xe8e2d4, 0.85);
  [[-0.63, 0], [0.63, 0]].forEach(function (t) {   // door casing, proud of the siding
    var cs = box(0.12, 2.36, 0.06, trimM); cs.position.set(FRONT_X + t[0], 1.18, HOUSE_F - 0.09); yadd(cs);
  });
  var csHead = box(1.38, 0.12, 0.06, trimM); csHead.position.set(FRONT_X, 2.36, HOUSE_F - 0.09); yadd(csHead);
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
  var pdeckM = ground(deckT, 3, 2, 0xffffff, 0.95, 1.0);   // boards you can feel now
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
  // ⚠️⚠️ THE ROOF STOPS AT THE HOUSE (HOUSE_F), IT DOES NOT PASS THROUGH IT. It used
  // to reach z -3.32 — 13cm past the hall's inner face at -3.45 — so a 5.7m dark beam
  // poked through the north wall, crossed the whole hallway at 2.9m, and cut straight
  // across the taped door at the top of the stairs. From inside it read as a structural
  // beam that had no business being there; it is the PORCH ROOF, seen from indoors.
  // South edge is unchanged (PZ1 - 0.375) so the overhang over the steps is the same.
  var ROOF_S = PZ1 - 0.375;
  var proof = box(PX1 - PX0 + 0.5, 0.14, HOUSE_F - ROOF_S, mat(0x4a3a2e, 0.9));
  proof.position.set((PX0 + PX1) / 2, 2.92, (HOUSE_F + ROOF_S) / 2); yadd(proof);
  var pfascia = box(PX1 - PX0 + 0.5, 0.2, 0.07, postM);
  pfascia.position.set((PX0 + PX1) / 2, 2.82, PZ1 - 0.27); yadd(pfascia);
  var prail = box(PX1 - PX0, 0.07, 0.07, postM);
  prail.position.set((PX0 + PX1) / 2, 0.86, PZ1 + 0.05); yadd(prail);
  for (var bal = 0; bal < 17; bal++) {                 // balusters, skipping the steps
    var bxp = PX0 + 0.25 + bal * ((PX1 - PX0 - 0.5) / 16);
    if (bxp > FRONT_X - 0.75 && bxp < FRONT_X + 0.75) continue;
    var bl2 = box(0.05, 0.78, 0.05, postM); bl2.position.set(bxp, 0.45, PZ1 + 0.05); yadd(bl2);
  }
  // porch light by the door, and it is the one that answers the knock.
  // ⚠️ it was a dark box with a bright box inside it, and its OWN point light stands
  // 15cm away — so the housing blew out to a flat pale slab and read, from the porch,
  // as an untextured cube glued to the siding. (Caught by raycasting a shot rather
  // than by reading the code; a "correct" lamp can still photograph as a mistake.)
  // A carriage lantern reads as a lantern at any exposure: backplate, arm, four-sided
  // glass, a pyramid cap, and corner bars to break the silhouette.
  var PL_X = FRONT_X + 0.95, PL_Y = 2.06, PL_Z = HOUSE_F - 0.12;
  var plampM = mat(0x1d1710, 0.55);
  var plBack = box(0.15, 0.20, 0.025, plampM); plBack.position.set(PL_X, PL_Y + 0.05, PL_Z + 0.105); yadd(plBack);
  var plArm = box(0.035, 0.035, 0.10, plampM); plArm.position.set(PL_X, PL_Y + 0.12, PL_Z + 0.05); yadd(plArm);
  // ⚠️ STRAIGHT sides, not tapered: a 4-gon cylinder rotated 45° puts its corners at
  // r/√2 on the axes, so the corner bars only line up if the radius doesn't change.
  var PLR = 0.07, PLC = PLR / Math.SQRT2;
  var plampGlass = new THREE.Mesh(new THREE.CylinderGeometry(PLR, PLR, 0.16, 4),
    new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffd9a0, emissiveIntensity: 1.4, roughness: 0.45 }));
  plampGlass.rotation.y = Math.PI / 4; plampGlass.position.set(PL_X, PL_Y, PL_Z); yadd(plampGlass);
  var plCap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.088, 0.05, 4), plampM);
  plCap.rotation.y = Math.PI / 4; plCap.position.set(PL_X, PL_Y + 0.105, PL_Z); yadd(plCap);
  var plBase = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.055, 0.03, 4), plampM);
  plBase.rotation.y = Math.PI / 4; plBase.position.set(PL_X, PL_Y - 0.095, PL_Z); yadd(plBase);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
    var bar = box(0.012, 0.16, 0.012, plampM);
    bar.position.set(PL_X + c[0] * PLC, PL_Y, PL_Z + c[1] * PLC); yadd(bar);
  });
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
  /* ---- OUTDOOR MATERIALS ------------------------------------------------------
   * The interior got a relief pass and the outside never did: every surface out
   * here was one flat colour, which is why the yard read as coloured cardboard no
   * matter how much got planted on it. Same technique as room.js — paint the
   * surface on canvas, then derive a bump map FROM that canvas so the light has
   * something to catch.
   * ⚠️ bumpScale wants to be much larger than intuition suggests: these textures
   * stretch over tens of metres, so the derived slopes are very low frequency.
   * The room needed 0.9–2.4 on surfaces tiling every 2m; the road tiles every 8m. */
  function bumpFrom(tex, contrast) {
    var img = tex.image;
    if (!img || !img.width) return null;
    var W = Math.min(img.width, 256), H = Math.min(img.height, 256);
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var g2 = c.getContext("2d");
    g2.drawImage(img, 0, 0, W, H);
    var d; try { d = g2.getImageData(0, 0, W, H); } catch (e) { return null; }
    var p = d.data, k = contrast || 1.7;
    for (var i = 0; i < p.length; i += 4) {
      var lum = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
      var v = 128 + (lum - 128) * k;
      p[i] = p[i + 1] = p[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
      p[i + 3] = 255;
    }
    g2.putImageData(d, 0, 0);
    var bt = new THREE.CanvasTexture(c);
    bt.wrapS = bt.wrapT = THREE.RepeatWrapping;
    return bt;
  }
  function ground(tex, repX, repY, colour, rough, bumpScale) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repX, repY);
    tex.colorSpace = THREE.SRGBColorSpace;          // honest colours, same as the sky
    var m = new THREE.MeshStandardMaterial({ map: tex, color: colour || 0xffffff, roughness: rough == null ? 0.97 : rough });
    var b = bumpFrom(tex, 1.8);
    if (b) { b.repeat.copy(tex.repeat); m.bumpMap = b; m.bumpScale = bumpScale == null ? 1.2 : bumpScale; }
    return m;
  }
  var grassT = canvasTex(256, 256, function (c, w, h) {
    c.fillStyle = "#3f5c35"; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 1400; i++) {                       // blades, leaning
      var x = Math.random() * w, y = Math.random() * h, L = 3 + Math.random() * 5;
      var sh = ["#48693c", "#37502e", "#517446", "#2f4628"][(Math.random() * 4) | 0];
      c.strokeStyle = sh; c.lineWidth = 1 + Math.random();
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 3, y - L); c.stroke();
    }
    for (var p2 = 0; p2 < 12; p2++) {                       // worn and lush patches
      var px = Math.random() * w, py = Math.random() * h, pr = 14 + Math.random() * 30;
      var gr = c.createRadialGradient(px, py, 2, px, py, pr);
      var dry = Math.random() < 0.5;
      gr.addColorStop(0, dry ? "rgba(110,104,58,0.30)" : "rgba(72,110,58,0.28)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gr; c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
    }
    for (var m2 = 0; m2 < 5; m2++) {                        // mower stripes
      c.fillStyle = m2 % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.045)";
      c.fillRect(0, m2 * (h / 5), w, h / 5);
    }
  });
  var concT = canvasTex(256, 256, function (c, w, h) {
    c.fillStyle = "#8d8a80"; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 2600; i++) {                        // aggregate speckle
      c.fillStyle = "rgba(" + (120 + Math.random() * 70 | 0) + "," + (118 + Math.random() * 66 | 0) + "," + (110 + Math.random() * 60 | 0) + ",0.5)";
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    c.strokeStyle = "rgba(48,46,42,0.75)"; c.lineWidth = 3;  // the slab joints
    [0, 128].forEach(function (jy) { c.beginPath(); c.moveTo(0, jy); c.lineTo(w, jy); c.stroke(); });
    c.strokeStyle = "rgba(52,50,46,0.5)"; c.lineWidth = 2;   // and one crack, always
    c.beginPath(); c.moveTo(40, 130); c.lineTo(72, 168); c.lineTo(58, 214); c.stroke();
  });
  var asphT = canvasTex(256, 256, function (c, w, h) {
    c.fillStyle = "#33353b"; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 4200; i++) {
      var v = 40 + Math.random() * 46 | 0;
      c.fillStyle = "rgba(" + v + "," + (v + 2) + "," + (v + 6) + ",0.55)";
      c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    for (var s = 0; s < 3; s++) {                            // patched repairs
      c.fillStyle = "rgba(20,21,25,0.35)";
      c.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 18 + Math.random() * 30);
    }
  });
  var grassM = ground(grassT, 26, 14, 0x9fb894, 1, 1.6);

  /* Contact shade. Nothing outdoors casts a real shadow — yardSun deliberately
   * doesn't, because a shadow-casting directional over this much geometry is not
   * worth 6 more passes — so every tree, car and post was sitting ON the world
   * rather than in it. One shared soft-disc texture, one decal per object, exactly
   * the trick the bedroom already uses under its furniture.
   * ⚠️ polygonOffset, NOT a raised y. The ground pieces sit at several different
   * heights (lawn -0.45, path -0.43, road -0.51) and a fixed offset that clears one
   * of them z-fights or vanishes under another. Offsetting depth only means the
   * decal hugs whatever is actually beneath it. */
  var shadeTex = canvasTex(64, 64, function (c, w, h) {
    var g3 = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g3.addColorStop(0, "rgba(0,0,0,0.85)");
    g3.addColorStop(0.55, "rgba(0,0,0,0.42)");
    g3.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g3; c.fillRect(0, 0, w, h);
  });
  var shadeGeo = new THREE.PlaneGeometry(1, 1);
  function groundShade(x, z, rx, rz, op, y) {
    var m = new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({
      map: shadeTex, transparent: true, opacity: op == null ? 0.5 : op,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    }));
    m.rotation.x = -Math.PI / 2; m.scale.set(rx * 2, rz * 2, 1);
    m.position.set(x, y == null ? GROUND + 0.015 : y, z);
    m.renderOrder = 2;
    yadd(m); return m;
  }
  // ⚠️ tinted DOWN, not up. concT is already a mid-grey; brightening it made the
  // walk read as poured white against the lawn and pulled the eye off everything.
  var pathM = ground(concT, 2, 12, 0x9c988e, 0.95, 1.1);      // slabs down the walk
  var walkM = ground(concT, 26, 1.2, 0x948f86, 0.95, 1.0);    // the sidewalk runs the block
  var roadM = ground(asphT, 20, 3, 0xb8bcc4, 0.98, 0.9);
  var driveM = ground(asphT, 3, 14, 0xa8acb4, 0.95, 0.9);
  // ⚠️ TWO strips, not one big plane. A single lawn spanning the whole depth sits at
  // GROUND while the road sits at GROUND-0.06, so the grass rendered straight over
  // the top of the road and the street simply wasn't there.
  [[4.0, Z_WALK], [Z_FKERB, -52]].forEach(function (lz) {
    var lw = new THREE.Mesh(new THREE.PlaneGeometry(80, Math.abs(lz[0] - lz[1])), grassM);
    lw.rotation.x = -Math.PI / 2;
    lw.position.set(-5.0, GROUND, (lz[0] + lz[1]) / 2); lw.receiveShadow = true; yadd(lw);
  });
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
    // SIX blobs, not three, at two subdivision levels and two shades: three lumps
    // read as a clover, and the tree in our own front yard is close enough to tell
    var leafM2 = new THREE.MeshStandardMaterial({ color: leafC, roughness: 0.98, flatShading: true });
    leafM2.color.offsetHSL(0, 0, 0.06);
    [[0, 0, 0, 1.0, 1, 0], [spread * 0.42, h * 0.11, spread * 0.20, 0.74, 0, 1],
     [-spread * 0.38, h * 0.07, -spread * 0.26, 0.68, 0, 0], [spread * 0.16, h * 0.20, -spread * 0.30, 0.56, 1, 1],
     [-spread * 0.22, h * 0.17, spread * 0.32, 0.60, 0, 1], [spread * 0.05, h * -0.06, spread * 0.05, 0.80, 1, 0]]
      .forEach(function (b) {
        var blob = new THREE.Mesh(new THREE.IcosahedronGeometry(spread * 0.5 * b[3], b[4]), b[5] ? leafM2 : leafM);
        blob.position.set(b[0], b[1], b[2]);
        blob.scale.set(1, 0.82, 1); blob.rotation.set(b[0], b[2], 0);
        can.add(blob);
      });
    [[0.55, 0.5, 0.4], [-0.5, 0.62, -0.35]].forEach(function (br) {   // a couple of low limbs
      var limb = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.016, h * 0.028, h * 0.3, 5), barkM);
      limb.position.set(br[0] * spread * 0.3, h * br[1], br[2] * spread * 0.3);
      limb.rotation.set(br[2] * 0.9, 0, -br[0] * 0.9); g2.add(limb);
    });
    swayers.push({ o: can, ph: x * 0.7 + z * 0.3, amp: 0.012 + spread * 0.004 });
    groundShade(x, z, spread * 0.62, spread * 0.62, 0.5);   // dapple under the canopy
    return g2;
  }
  function shrubAt(x, z, r, c) {
    var s2 = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.98, flatShading: true }));
    s2.position.set(x, GROUND + r * 0.62, z); s2.scale.y = 0.74; yadd(s2);
    swayers.push({ o: s2, ph: x + z, amp: 0.01 });
    groundShade(x, z, r * 1.15, r * 1.15, 0.42);
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
    groundShade((x0 + x1) / 2, z, (x1 - x0) * 0.5 + 0.2, d * 0.85, 0.45);
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
  // ⚠️ the drive runs at x -15.2, well out from the house, because THE KITCHEN is
  // between them (x -13.0..-7.55). At its old -11.2 it drove straight through the
  // kitchen floor. It reaches the garage by an apron that turns east at the back.
  var drive = box(3.2, 0.06, 25.6, driveM); drive.position.set(-15.2, GROUND + 0.02, -6.0); yadd(drive);
  // ⚠️ the apron BEGINS where the drive ends (x -13.6) instead of straddling it. As a
  // 3.4m slab centred on the drive's edge it overlapped the drive by 1.7m at the same
  // height: 4.25m² of identical top AND bottom face, the biggest fight in the yard.
  var apron = box(1.7, 0.06, 2.6, driveM); apron.position.set(-12.75, GROUND + 0.02, 5.6); yadd(apron);
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
  var carG = new THREE.Group(); carG.position.set(-15.2, GROUND, -8.6); yadd(carG);
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
  (function () { var s5 = groundShade(0, 0, 1.15, 2.5, 0.55, 0.02); yardG.remove(s5); carG.add(s5); })();
  groundShade(FRONT_X + 1.5, Z_WALK + 0.6, 0.3, 0.3, 0.45);      // the mailbox post
  groundShade(FRONT_X - 2.3, -8.4, 0.55, 0.55, 0.4);             // the dropped bike
  groundShade(-2.6, Z_WALK - 1.4, 0.28, 0.28, 0.5);              // the streetlight

  // --- the street: sidewalk, kerb, an 8.8m road (was 6.2 and read as a lane)
  var road = box(78, 0.05, Z_ROADF - Z_KERB, roadM);
  road.position.set(-5.0, GROUND - 0.06, (Z_KERB + Z_ROADF) / 2); yadd(road);
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
  /* ⚠️ THE STREETLIGHT IS VICTORY LAP (Kyle's call, and the right one): the game
   * about a man who never leaves his home town, hung on the lamp that has buzzed
   * over this street forever. The crate in the hall stays as scenery; the DOORWAY
   * is out here now, under the light where you'd actually stand at 2am. */
  var vlSave = (function () {
    try {
      var m = JSON.parse(localStorage.getItem("vl-meta-v1") || "null");
      if (!m || !(m.runs > 0)) return null;
      var k = m.knows || {}, known = 0;
      ["window", "blind", "drop", "dog"].forEach(function (n) { if (k[n]) known++; });
      return { runs: m.runs, known: known };
    } catch (e) { return null; }
  })();
  var vlLampHint = vlSave
    ? "VICTORY LAP — " + vlSave.runs + " week" + (vlSave.runs === 1 ? "" : "s") + " tried, " +
      vlSave.known + "/4 of the town learned · one more"
    : "VICTORY LAP — an open town you keep not leaving · click to try the week";
  function vlGo() { window.location.href = "https://kylefriesmarketing.github.io/victory-lap/"; }
  [slPost, slHead, slLamp].forEach(function (m) { ytag(m, "VICTORY LAP", vlGo, vlLampHint); });
  // a flyer taped to the pole, the way game doorways get marked out here
  var vlFlyT = canvasTex(96, 128, function (c, w, h) {
    c.fillStyle = "#f2e8d0"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#8a4a3a"; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = "#8a4a3a"; c.font = "bold 15px Georgia, serif"; c.textAlign = "center";
    c.fillText("VICTORY", w / 2, 34); c.fillText("LAP", w / 2, 52);
    c.fillStyle = "#4a4436"; c.font = "italic 10px Georgia, serif";
    c.fillText("the 6 a.m. bus", w / 2, 82);
    c.fillText("leaves without you", w / 2, 96);
    c.fillStyle = "#b8b0a0"; c.fillRect(w * 0.3, 0, w * 0.4, 7); // the tape
  });
  var vlFly = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.40),
    new THREE.MeshStandardMaterial({ map: vlFlyT, roughness: 0.9 }));
  vlFly.position.set(-2.52, GROUND + 1.75, Z_WALK - 1.31); vlFly.rotation.y = Math.PI * 0.06;
  yadd(vlFly);
  ytag(vlFly, "VICTORY LAP", vlGo, vlLampHint);

  /* ---- FRESH CUT: the mower, abandoned mid-stripe on its own front lawn ------- */
  var mowG = new THREE.Group(); mowG.position.set(-7.15, GROUND + 0.02, -9.8); mowG.rotation.y = -0.5; yadd(mowG);
  // ⚠️ RED, all of it, and brighter than looks right in the hex — the night
  // lighting eats saturated reds, and the old green grass bag read as the mower's
  // body so the whole machine looked green from the porch.
  var mowDeck = box(0.44, 0.16, 0.62, mat(0xd94b38, 0.45)); mowDeck.position.y = 0.14; mowG.add(mowDeck);
  var mowTop = box(0.3, 0.1, 0.4, mat(0xc03a2c, 0.45)); mowTop.position.set(0, 0.26, -0.02); mowG.add(mowTop);
  [[-0.19, -0.24], [0.19, -0.24], [-0.19, 0.24], [0.19, 0.24]].forEach(function (wp) {
    var wh2 = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10), mat(0x1d1f22, 0.8));
    wh2.rotation.z = Math.PI / 2; wh2.position.set(wp[0], 0.075, wp[1]); mowG.add(wh2);
  });
  [[-0.14], [0.14]].forEach(function (hx) {   // the handle, leant back the way it's left
    var rail = box(0.035, 0.035, 0.85, mat(0x2a2d31, 0.5));
    rail.position.set(hx[0], 0.52, 0.62); rail.rotation.x = -0.85; mowG.add(rail);
  });
  var mowBar = box(0.34, 0.04, 0.04, mat(0x2a2d31, 0.5)); mowBar.position.set(0, 0.82, 0.95); mowG.add(mowBar);
  var mowBag = box(0.3, 0.26, 0.2, mat(0xa8382c, 0.85)); mowBag.position.set(0, 0.34, 0.34); mowG.add(mowBag);
  groundShade(-7.15, -9.8, 0.55, 0.6, 0.45);
  // (a mown stripe behind it was tried twice — glowing unlit, then muddy lit —
  // and cut. Kyle's right: the mower sells the job on its own.)
  var fcBagged = (function () { try { return parseInt(localStorage.getItem("fc-bagged") || "0", 10) || 0; } catch (e) { return 0; } })();
  var fcHint = fcBagged > 0
    ? "FRESH CUT — " + fcBagged + " bag" + (fcBagged === 1 ? "" : "s") + " on the kerb · the grass grew back"
    : "FRESH CUT — the lawn won't mow itself · click to start the mower";
  function fcGo() { window.location.href = "https://kylefriesmarketing.github.io/fresh-cut/"; }
  mowG.traverse(function (o) { if (o.isMesh) ytag(o, "FRESH CUT", fcGo, fcHint); });
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
    var sh2 = groundShade(0, 0, 1.15, 2.5, 0.55, 0.02);   // parented, so it rides the car
    yardG.remove(sh2); cg.add(sh2);
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
  // 256 wide, not 8 — a 8px strip can only ever be a vertical gradient, and the sky
  // needed cloud banding and a moon painted into it
  var skyC = document.createElement("canvas"); skyC.width = 256; skyC.height = 128;
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
  // ⚠️ 46 tall and centred LOW, not 96 tall and centred high. At 69m a 96m plane
  // spans ±35° of elevation while the camera only sees ~31° — so two thirds of the
  // texture, including the moon, was painted above the top of the frame. Sizing the
  // plane to the band you can actually see means texture v maps to sky you'll meet.
  var skyDome = new THREE.Mesh(new THREE.PlaneGeometry(200, 46),
    new THREE.MeshBasicMaterial({ map: skyTex }));
  skyDome.position.set(-5.0, GROUND + 12, -74); yadd(skyDome);
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
  /* Visible cones of light. Additive, depthWrite off, and open-ended so you can
   * stand inside one — this is the same trick the bedroom uses for the streetlight
   * shaft through the window, which is why the two read as the same weather.
   * ⚠️ renderOrder + depthWrite:false, or the cone z-fights the ground it lands on
   * and flickers as the camera drifts. */
  var beams = [];
  function beam(x, y, z, topR, botR, h, op) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, h, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffdca0, transparent: true, opacity: op, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
    m.position.set(x, y, z); m.renderOrder = 3; yadd(m);
    beams.push({ m: m, op: op });
    return m;
  }
  // ⚠️ 0.04, not 0.085. Additive over a 5m cone accumulates hard — at the value that
  // looked right in the code it rendered as a solid wedge of custard, not as light.
  beam(-3.66, GROUND + 2.5, Z_WALK - 1.4, 0.22, 2.6, 4.9, 0.040);      // the streetlight
  // ⚠️ the porch lamp's cone must STAY OUTSIDE THE HOUSE. At botR 1.15 centred on
  // HOUSE_F-0.30 it reached z -2.65 — nearly a metre INSIDE the hallway — and being
  // additive it washed the hall wall beside the front door into a pale grey wedge
  // that looked like a lighting bug indoors. Narrower (0.58) and set out to
  // HOUSE_F-0.72, its near edge stops at -3.64, clear of the wall's -3.55 face. A
  // tighter cone also suits a small lantern better than a 2.3m-wide floodlight did.
  beam(FRONT_X + 0.95, GROUND + 1.35, HOUSE_F - 0.72, 0.10, 0.58, 3.2, 0.042); // the porch lamp
  // and a breath of mist sitting on the lawn, which is what makes the beams read
  var mistT = canvasTex(128, 128, function (c, w, h) {
    var g4 = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g4.addColorStop(0, "rgba(206,220,240,0.30)"); g4.addColorStop(1, "rgba(206,220,240,0)");
    c.fillStyle = g4; c.fillRect(0, 0, w, h);
  });
  var mists = [];
  // wide and very faint — at 0.3-0.5 these read as puddles lying on the lawn
  [[-9, -12.5, 20, 0.13], [1.5, -14.5, 22, 0.11], [-15, -9, 17, 0.10], [5, -10, 18, 0.09]]
    .forEach(function (mp) {
      var mm = new THREE.Mesh(new THREE.PlaneGeometry(mp[2], mp[2] * 0.42),
        new THREE.MeshBasicMaterial({ map: mistT, transparent: true, opacity: mp[3],
          depthWrite: false, blending: THREE.AdditiveBlending }));
      mm.rotation.x = -Math.PI / 2; mm.position.set(mp[0], GROUND + 0.25, mp[1]);
      mm.renderOrder = 2; yadd(mm); mists.push({ m: mm, op: mp[3], ph: mp[0] });
    });
  var porchPhase = "evening";
  function setPhase(name) {
    if (!PORCH_SKY[name]) name = "evening";
    porchPhase = name;
    var s = PORCH_SKY[name];
    var W = 256, Hh = 128;
    var gr = skyCtx.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, s.top); gr.addColorStop(1, s.bot);
    skyCtx.fillStyle = gr; skyCtx.fillRect(0, 0, W, Hh);
    var night = name === "night" || name === "evening";
    if (night) {                                            // stars, but only when there are stars
      for (var st2 = 0; st2 < 220; st2++) {
        var sy = Math.random() * 86;
        skyCtx.fillStyle = "rgba(255,255,255," + (0.15 + Math.random() * 0.55 * (1 - sy / 110)).toFixed(2) + ")";
        skyCtx.fillRect(Math.random() * W, sy, 1, 1);
      }
      // the moon. Same moon the bedroom window paints, so the two views agree.
      // ⚠️ drawn as an ELLIPSE, not a circle. A 256x128 texture on a 200x46 plane
      // stretches everything 2.2x horizontally, so a round moon renders as a rugby
      // ball. Squashing it in texture space is what makes it round on screen.
      var mx = W * 0.42, my = 30, AR = 2.17;
      var halo = skyCtx.createRadialGradient(mx, my, 2, mx, my, 30);
      halo.addColorStop(0, "rgba(226,234,255,0.40)"); halo.addColorStop(1, "rgba(226,234,255,0)");
      skyCtx.save(); skyCtx.translate(mx, my); skyCtx.scale(1 / AR, 1); skyCtx.translate(-mx, -my);
      skyCtx.fillStyle = halo; skyCtx.beginPath(); skyCtx.arc(mx, my, 30 * AR, 0, 7); skyCtx.fill();
      skyCtx.restore();
      skyCtx.fillStyle = "#e8edff";
      skyCtx.beginPath(); skyCtx.ellipse(mx, my, 8.5 / AR, 8.5, 0, 0, 7); skyCtx.fill();
      skyCtx.fillStyle = "rgba(196,208,236,0.55)";          // a couple of seas
      skyCtx.beginPath(); skyCtx.ellipse(mx - 1.2, my - 1.8, 2.4 / AR, 2.4, 0, 0, 7); skyCtx.fill();
      skyCtx.beginPath(); skyCtx.ellipse(mx + 1.1, my + 2.6, 1.7 / AR, 1.7, 0, 0, 7); skyCtx.fill();
    }
    // cloud banding — long, thin, and lit from underneath at dusk
    var cl = night ? "rgba(196,208,232,0.13)" : name === "dusk" ? "rgba(255,206,164,0.30)" : "rgba(255,255,255,0.34)";
    for (var cb = 0; cb < 9; cb++) {
      var cy = 12 + cb * 9 + (cb % 3) * 3, cw = 60 + (cb * 37 % 120), cx = (cb * 71) % W;
      skyCtx.fillStyle = cl;
      skyCtx.beginPath(); skyCtx.ellipse(cx, cy, cw, 2.2 + (cb % 3), 0, 0, 7); skyCtx.fill();
      skyCtx.beginPath(); skyCtx.ellipse((cx + 150) % W, cy + 4, cw * 0.6, 1.6, 0, 0, 7); skyCtx.fill();
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
    // the beams and the mist only exist when there's a lamp to make them
    beams.forEach(function (b) { b.m.material.opacity = b.op * s.lamp; b.m.visible = s.lamp > 0.2; });
    mists.forEach(function (m) { m.m.material.opacity = m.op * (0.35 + 0.65 * s.lamp); });
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

  /* --- THE BACK YARD, BUILT FOR REAL -----------------------------------------
   * It was ONE PAINTED PLANE 2.6m behind the glass: a canvas with a fence, a tree
   * and a neighbour drawn on it. From the resting camera it read as a poster taped
   * to the window, and stepping toward the slider never changed a thing, because
   * there was no depth to reveal. Kyle picked "rebuild it real, like the front"
   * back in the graphics pass and this is that, finally: a lawn you can see across,
   * a board fence with real posts, a tree with a trunk you can walk your eye up, a
   * washing line, and the neighbour's roof beyond the fence.
   * ⚠️ the moon light lives INSIDE backG on purpose. three.js skips a whole subtree
   * when a parent is invisible, lights included — so the yard lighting switches
   * itself off with the hall, and never washes the bedroom the way the FRONT yard's
   * lights did before they were gated. Distance 15 from z+18 reaches z 3 at the
   * nearest, which is the hall's south end: moonlight through the glass, no further. */
  var backSkyT = canvasTex(256, 128, function (c, w, h) {
    var sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#0b1120"); sky.addColorStop(0.72, "#1d2740"); sky.addColorStop(1, "#2b3550");
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    for (var s = 0; s < 150; s++) {
      var sy = Math.random() * h * 0.8;
      c.fillStyle = "rgba(255,255,255," + (0.15 + Math.random() * 0.5 * (1 - sy / h)).toFixed(2) + ")";
      c.fillRect(Math.random() * w, sy, 1.4, 1.4);
    }
  });
  backSkyT.colorSpace = THREE.SRGBColorSpace;   // ⚠️ canvasTex leaves it LINEAR otherwise
  var backSky = new THREE.Mesh(new THREE.PlaneGeometry(90, 34),
    new THREE.MeshBasicMaterial({ map: backSkyT }));
  backSky.position.set(XC, GROUND + 12, Z_S + 34); backSky.rotation.y = Math.PI; badd(backSky);

  var backLawn = new THREE.Mesh(new THREE.PlaneGeometry(30, 17), grassM);  // shares the front lawn's material
  backLawn.rotation.x = -Math.PI / 2; backLawn.position.set(XC, GROUND, Z_S + 9.4); badd(backLawn);

  var bFenceM = mat(0x6a5540, 0.95);
  for (var fb = 0; fb < 46; fb++) {                       // board fence, board by board
    var bd = box(0.17, 1.65, 0.04, bFenceM);
    bd.position.set(XC - 11.5 + fb * 0.51, GROUND + 0.82, Z_S + 16.2); badd(bd);
  }
  [-11.4, -5.7, 0, 5.7, 11.4].forEach(function (px) {     // and its posts
    var po = box(0.13, 1.85, 0.13, mat(0x51402f, 0.95));
    po.position.set(XC + px, GROUND + 0.92, Z_S + 16.24); badd(po);
  });
  [GROUND + 0.35, GROUND + 1.42].forEach(function (ry) {  // rails
    var rl = box(23.4, 0.09, 0.05, mat(0x5e4a37, 0.95));
    rl.position.set(XC, ry, Z_S + 16.27); badd(rl);
  });

  (function () {                                          // the tree that drops things on the deck
    var tg = new THREE.Group(); tg.position.set(XC - 5.6, GROUND, Z_S + 11.4); badd(tg);
    var tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 4.4, 7), mat(0x3d2f22, 0.95));
    tr.position.y = 2.2; tg.add(tr);
    [[0, 4.9, 0, 1.5], [-1.0, 4.5, 0.5, 1.15], [1.1, 4.6, -0.4, 1.2],
     [0.3, 5.5, 0.6, 1.0], [-0.6, 5.4, -0.7, 0.95]].forEach(function (bl) {
      var lf = new THREE.Mesh(new THREE.IcosahedronGeometry(bl[3], 1), mat(bl[3] > 1.1 ? 0x2f4a2a : 0x35522f, 0.95));
      lf.position.set(bl[0], bl[1], bl[2]); lf.scale.y = 0.82; tg.add(lf);
    });
  })();

  [[-2.9, 0], [2.9, 0]].forEach(function (wp) {           // the washing line
    var wpo = box(0.09, 1.9, 0.09, mat(0x6a5540, 0.95));
    wpo.position.set(XC + wp[0], GROUND + 0.95, Z_S + 6.6); badd(wpo);
  });
  var wline = box(5.8, 0.015, 0.015, mat(0xcfc8b6, 0.8));
  wline.position.set(XC, GROUND + 1.82, Z_S + 6.6); badd(wline);
  var washing = [];
  [[-1.9, 0.34, 0xd8dce4], [-0.6, 0.42, 0xc9d2dc], [0.8, 0.30, 0xdfe6dc]].forEach(function (pg) {
    var cl = box(0.30, pg[1], 0.012, mat(pg[2], 0.95));
    cl.position.set(XC + pg[0], GROUND + 1.82 - pg[1] / 2, Z_S + 6.6); badd(cl); washing.push(cl);
  });

  (function () {                                          // next door's roof, one light still on
    var nb = box(9.5, 3.6, 6.0, mat(0x2a3242, 0.95));
    nb.position.set(XC + 8.2, GROUND + 1.8, Z_S + 21.5); badd(nb);
    var rf = new THREE.Mesh(new THREE.ConeGeometry(7.0, 2.3, 4), mat(0x222a36, 0.95));
    rf.rotation.y = Math.PI / 4; rf.position.set(XC + 8.2, GROUND + 4.7, Z_S + 21.5); badd(rf);
    var win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    win.position.set(XC + 6.4, GROUND + 2.1, Z_S + 18.45); win.rotation.y = Math.PI; badd(win);
  })();

  var backMoon = new THREE.PointLight(0x9fb4d8, 1.15, 15, 1.7);
  backMoon.position.set(XC, GROUND + 7.5, Z_S + 8.0); badd(backMoon);

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
  var blindSlats = [];   // the laundry basket can draw or open them
  for (var bl = 0; bl < 11; bl++) {
    var bx = XC - SD_W / 2 + 0.09 + bl * 0.105;                 // packed over the west half only
    var slat = new THREE.Mesh(new THREE.PlaneGeometry(0.10, SD_H - 0.12), slatM);
    slat.position.set(bx, SD_H / 2 - 0.04, SD_Z - 0.11);
    slat.rotation.y = 0.62 + (bl % 2) * 0.05;                    // turned, not flat — you see their edges
    badd(slat); blindSlats.push(slat);
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
  var backPorchOn = 1;   // the laundry basket can switch it off
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
  /* ⚠️⚠️ THE BI-FOLD LEAVES ARE GONE, and removing them is the fix that three attempts
   * at MOVING them could not buy. Two 2.05m panels standing out from the wall shadowed
   * the entire back-east wall at this camera's 21° grazing angle — everything south of
   * them measured 0/6 reachable no matter where it was put. I narrowed the wrong leaf
   * twice and the right leaf once, and the last attempt still blocked by TWO
   * MILLIMETRES. When three fixes in a row buy nothing, the object is the problem.
   * A laundry nook standing open is completely ordinary, it finally shows off the
   * washer and dryer that were always modelled in there, and it gives the back of the
   * hall the thing it was actually short of: somewhere to see INTO. The casing below
   * still frames the opening, so it reads as a nook and not a hole in the wall. */
  [-0.80, 0.80].forEach(function (bz) {          // the nook's casing, flat to the wall
    var cs2 = box(0.05, 2.08, 0.07, mat(0x6a5a42, 0.85));
    cs2.position.set(-0.02, 1.04, bz); launG.add(cs2);
  });
  var launHead = box(0.05, 0.07, 1.67, mat(0x6a5a42, 0.85));
  launHead.position.set(-0.02, 2.045, 0); launG.add(launHead);
  launG.children.forEach(function (m) {
    if (m.isMesh) tag(m, "the laundry", null, "the laundry. one sock has been down here since 1997.");
  });
  tag(sock, "the lost sock", null, "the sock. its twin is upstairs, which is not open yet.");

  // --- THE MUD ROOM: boots, leashes, a bowl, and the prints that prove a dog
  // ⚠️ z 6.60, NOT 7.75. The closet moved to 7.70 and landed straight on top of this:
  // the hook rail ran through the bottom of the closet door, the leash hung off that
  // rail in mid-air over the opening, and the boots stood inside the doorway. Nothing
  // was wrong with the mud room — it was here first. 6.60 is the gap between the
  // laundry (ends 6.10) and the closet opening (starts 7.24), so the back wall reads
  // laundry, mud room, closet in a row, which is the order a real back hall has them.
  var mudG = new THREE.Group(); mudG.position.set(E_IN - 0.26, 0, 6.60); add(mudG);
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
  /* ---- THE HALL AND THE BACK, LIVED IN ----------------------------------------
   * Same treatment the kitchen got. This block sits AFTER the kitchen on purpose:
   * kShadeT, kWearT and radialTex are declared there and this reuses them rather
   * than making a second set of identical decal textures. */
  function hDecal(addFn, tex, x, y, z, rx, rz, op) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 2; addFn(m); return m;
  }
  // contact shade under the heavy things, so they sit IN the hall instead of on it
  [[TBL_X, TBL_Z, 0.34, 0.26, 0.42],          // the hall table
   [-6.35, -2.55, 0.42, 0.36, 0.46],          // the moving boxes under the stairs
   [STAND_X, STAND_Z, 0.16, 0.16, 0.44],      // the umbrella stand
   [W_IN + 0.36, 7.5, 0.40, 0.62, 0.44],      // the chest freezer
   [E_IN - 0.62, 6.60, 0.34, 0.46, 0.34]      // the mud room's boots, in their new spot
  ].forEach(function (s) { hDecal(add, kShadeT, s[0], 0.010, s[1], s[2], s[3], s[4]); });

  // ⚠️ WEAR GOES WHERE FEET GO, and in a hall that is not the middle of the floor —
  // it is the doorways. A hall's traffic is a series of pinch points: the mat, the
  // foot of the stairs, and one patch outside every door somebody actually opens.
  [[FRONT_X, -2.75, 0.40, 0.34, 0.50],        // inside the front door
   [-6.95, -2.30, 0.42, 0.38, 0.52],          // the foot of the stairs
   [W_IN + 0.62, -0.35, 0.30, 0.34, 0.44],    // the kitchen door
   [W_IN + 0.62, 1.90, 0.28, 0.32, 0.38],     // the living room door
   [E_IN - 0.55, 0.10, 0.30, 0.38, 0.42],     // the bedroom doorway
   [XC, 8.10, 0.44, 0.32, 0.46],              // the slider
   [W_IN + 0.62, 6.30, 0.28, 0.32, 0.36]      // the garage door
  ].forEach(function (s) { hDecal(add, kWearT, s[0], 0.008, s[1], s[2], s[3], s[4]); });

  // the post, landed on the mat and not picked up
  var thePost = [];
  [[-0.10, -0.04, 0.13, 0xf0ead8], [0.06, 0.05, -0.31, 0xe6dcc4], [-0.02, 0.11, 0.62, 0xdfe8ee]]
    .forEach(function (lt) {
      var env = box(0.17, 0.006, 0.11, mat(lt[3], 0.95));
      env.position.set(FRONT_X + lt[0], 0.018, -3.00 + lt[1]); env.rotation.y = lt[2]; add(env);
      tag(env, "the post", null, "letters for somebody who used to live here. nobody has moved them.");
      thePost.push(env);
    });
  // the dish by the phone that every set of keys in this house ends up in
  var keyDish = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.022, 16), mat(0x6a4f7a, 0.55));
  keyDish.position.set(TBL_X + 0.16, 0.751, TBL_Z - 0.08); add(keyDish);
  [[-0.015, 0.55], [0.02, -0.3]].forEach(function (kk) {
    var key = box(0.012, 0.004, 0.05, mat(0xb8a24a, 0.4));
    key.position.set(TBL_X + 0.16 + kk[0], 0.762, TBL_Z - 0.08 + kk[0] * 0.6);
    key.rotation.y = kk[1]; add(key);
  });
  tag(keyDish, "the key dish", null, "every set of keys in this house ends up here eventually.");

  // ⚠️ MY "boots kicked off by the back door" USED TO BE HERE AND ARE GONE. The mud
  // room already had two pairs 40cm away — I added a third without checking, and two
  // boot piles that close together just read as clutter. The mud room's were here
  // first and are better placed; measure what a room already has before furnishing it.
  // ⚠️ moved clear of the closet door's swing: open, the leaf sweeps x -5.22..-4.38 at
  // z ~8.15, which is exactly where this used to stand
  var canG = new THREE.Group(); canG.position.set(XC + 0.75, 0, 8.50); canG.rotation.y = -0.5; add(canG);
  var canB = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.11, 0.20, 12), mat(0x3f6b52, 0.6));
  canB.position.y = 0.10; canG.add(canB);
  var canS = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.26, 8), mat(0x3f6b52, 0.6));
  canS.rotation.z = -0.9; canS.position.set(0.15, 0.16, 0); canG.add(canS);
  var canH = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 12, Math.PI), mat(0x3f6b52, 0.6));
  canH.rotation.y = Math.PI / 2; canH.position.set(-0.02, 0.21, 0); canG.add(canH);
  tag(canB, "the watering can", null, "it lives by the back door and gets used twice a summer.");

  // --- DUST, hanging in the light. A hall this still should have some.
  var dustT = radialTex("255,240,214", 0.85);
  var dust = [];
  for (var dm = 0; dm < 26; dm++) {
    var sp2 = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.016),
      new THREE.MeshBasicMaterial({ map: dustT, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending }));
    sp2.renderOrder = 7; add(sp2);
    dust.push({ m: sp2, x: XC + (Math.random() - 0.5) * 2.4, z: -2.6 + Math.random() * 10.4,
      y: 0.5 + Math.random() * 1.9, ph: Math.random() * 9, sp: 0.10 + Math.random() * 0.16 });
  }
  function hallLife(dt, t, lampOn) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.y += dt * d.sp * 0.10;
      if (d.y > 2.55) d.y = 0.35;
      d.m.position.set(d.x + Math.sin(t * 0.35 + d.ph) * 0.13, d.y,
                       d.z + Math.cos(t * 0.27 + d.ph * 1.3) * 0.11);
      // brightest near a bulb — dust you can only see when it drifts through the beam
      var near = Math.min(Math.abs(d.z - 1.9), Math.abs(d.z + 2.2), Math.abs(d.z - 6.4));
      d.m.material.opacity = 0.30 * lampOn * Math.max(0, 1 - near / 1.5) * (0.55 + 0.45 * Math.sin(t * 0.9 + d.ph));
      d.m.quaternion.copy(camera.quaternion);
    }
  }

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

  /* ---- STASHES: a "my stuff" box for every room of the house ------------------
   * The bedroom has the shoebox; Kyle's call is that every area deserves its own —
   * moving boxes in the hall, a laundry basket at the back, a toolbox on the
   * porch, a recipe box in the kitchen — each holding customizations that BELONG
   * to that room. One generic system: makeStash(key, title, opts) persists each
   * option's index in localStorage "room-stash-<key>" and applies it at build, so
   * a choice survives reloads exactly like the bedroom's paint does. */
  var stashPanel = null, stashOpenKey = null;
  function closeStash() { if (stashPanel) stashPanel.style.display = "none"; stashOpenKey = null; }
  function renderStash(st) {
    // a shared option may have been changed from a different container since this
    // one was last drawn — re-read it, or the button would show a stale label
    st.opts.forEach(function (o) { if (o.shared) o.i = readShared(o.shared) % o.vals.length; });
    var html = "<div style='font-weight:700;letter-spacing:.02em;margin-bottom:8px'>" + st.title + "</div>";
    st.opts.forEach(function (o, i) {
      html += "<div style='display:flex;justify-content:space-between;gap:12px;align-items:center;margin:5px 0'>" +
        "<span style='opacity:.82'>" + o.label + "</span>" +
        "<button type='button' data-si='" + i + "' style='font:12px Georgia,serif;color:#f2e2c4;" +
        "background:rgba(242,226,196,.10);border:1px solid rgba(242,226,196,.30);border-radius:999px;" +
        "padding:3px 11px;cursor:pointer'>" + o.vals[o.i].label + "</button></div>";
    });
    html += "<div style='text-align:right;margin-top:8px'><button type='button' data-si='x' " +
      "style='font:12px Georgia,serif;color:#f2e2c4;background:none;border:none;cursor:pointer;opacity:.6'>close</button></div>";
    stashPanel.innerHTML = html;
  }
  function openStash(st) {
    if (stashOpenKey === st.key) { closeStash(); return; }
    if (!stashPanel) {
      stashPanel = document.createElement("div");
      stashPanel.id = "stash-panel";
      stashPanel.style.cssText = "position:fixed;left:22px;bottom:26px;z-index:14;display:none;" +
        "min-width:220px;padding:12px 14px;border-radius:14px;" +
        "font:13px/1.5 Georgia,serif;color:#f2e2c4;background:rgba(28,22,16,.80);" +
        "border:1px solid rgba(242,226,196,.28);backdrop-filter:blur(6px);" +
        "-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 18px rgba(0,0,0,.42)";
      document.body.appendChild(stashPanel);
      // the room's pointerdown listener would fire a pick straight through the panel
      stashPanel.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      stashPanel.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("button") : null;
        if (!b) return;
        var si = b.getAttribute("data-si");
        if (si === "x") { closeStash(); return; }
        var st2 = stashByKey[stashOpenKey], o = st2.opts[+si];
        o.i = (o.i + 1) % o.vals.length;
        o.vals[o.i].apply();
        st2.save();
        AUDIO.clickSfx && AUDIO.clickSfx(1400);
        renderStash(st2);
      });
    }
    stashOpenKey = st.key;
    renderStash(st);
    stashPanel.style.display = "block";
  }
  /* ---- HOUSE LOOKS: whole-house themes, the way the bedroom has ROOM_THEMES -----
   * Kyle asked for room types out here too — "one option you should definitely have
   * is the room types such as cozy cabin like you do in the bedroom". The bedroom
   * swaps whole texture sets; the house can't, because it is painted procedurally
   * rather than from a library of wallpapers. So a look here is a GRADE: every keyed
   * material's own base colour lerped toward one tint by one amount.
   * ⚠️ that indirection is the whole trick. material.color MULTIPLIES the map, and
   * these materials each arrive with a base already tuned against their own texture
   * (grass 0x9fb894, siding 0xeae6da). Assigning flat colours per look would throw
   * that tuning away and every look would have to re-solve ten materials against ten
   * textures. Lerping from the CAPTURED base keeps every relationship and makes a new
   * look two numbers. */
  var LOOK_MATS = [hwallM, plankM, runner.material, oakM, kWallM, lamM,
                   sidingM, grassM, deckM, bFenceM, pdeckM];
  var LOOK_BASE = LOOK_MATS.map(function (m) { return m.color.getHex(); });
  var LOOKS = [
    { key: "asfound", name: "as found", icon: "🏚️" },
    { key: "cabin",   name: "cozy cabin",   icon: "🔥", tint: 0xffa552, amt: 0.34, bulb: 0xffc07a },
    { key: "seaside", name: "seaside",      icon: "🌊", tint: 0x8ecbe6, amt: 0.30, bulb: 0xe4f2ff },
    { key: "harvest", name: "harvest",      icon: "🍂", tint: 0xd87a3a, amt: 0.26, bulb: 0xffcf96 },
    { key: "moonlit", name: "moonlit",      icon: "🌙", tint: 0x7d95d4, amt: 0.38, bulb: 0xcfe0ff },
    { key: "greenhouse", name: "greenhouse", icon: "🌿", tint: 0x8fc47a, amt: 0.24, bulb: 0xeaffd8 },
  ];
  var lookBulb = 0xffd9a0;
  function applyLook(key) {
    var L = null;
    LOOKS.forEach(function (x) { if (x.key === key) L = x; });
    if (!L) L = LOOKS[0];
    var tint = L.tint != null ? new THREE.Color(L.tint) : null;
    LOOK_MATS.forEach(function (m, i) {
      var c = new THREE.Color(LOOK_BASE[i]);
      if (tint) c.lerp(tint, L.amt);
      m.color.copy(c);
    });
    lookBulb = L.bulb || 0xffd9a0;
    [bulbS, bulbN, bulbB].forEach(function (b) {
      b.light.color.setHex(lookBulb); b.bulb.material.emissive.setHex(lookBulb);
    });
  }

  var stashByKey = {};
  // ⚠️ a `shared` option keeps its index in its OWN localStorage key, not the stash's,
  // so the house look reads the same from whichever container you open — four copies
  // of one setting that disagreed would be worse than not offering it four times.
  function readShared(k) { try { return parseInt(localStorage.getItem(k) || "0", 10) || 0; } catch (e) { return 0; } }
  function makeStash(key, title, opts) {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem("room-stash-" + key) || "{}"); } catch (e) { }
    opts.forEach(function (o) {
      o.i = (o.shared ? readShared(o.shared) : (saved[o.k] | 0)) % o.vals.length;
      o.vals[o.i].apply();                    // a saved choice is live from frame one
    });
    var st = { key: key, title: title, opts: opts, save: function () {
      var s = {};
      opts.forEach(function (o) {
        if (o.shared) { try { localStorage.setItem(o.shared, String(o.i)); } catch (e) { } }
        else s[o.k] = o.i;
      });
      try { localStorage.setItem("room-stash-" + key, JSON.stringify(s)); } catch (e) { }
    } };
    stashByKey[key] = st;
    return st;
  }
  // every container offers the whole-house look, and they all mean the same thing
  function lookOption() {
    return { k: "look", label: "the house look", shared: "room-house-look",
      vals: LOOKS.map(function (L) {
        return { label: L.icon + " " + L.name, apply: function () { applyLook(L.key); } };
      }) };
  }

  // --- HALL: moving boxes that never got unpacked, by the closet
  var hBoxT = canvasTex(128, 96, function (c, w, h) {
    c.fillStyle = "#b08d5a"; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(140,104,60,0.6)"; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8);
    c.fillStyle = "#d8cfc0"; c.fillRect(w * 0.28, h * 0.34, w * 0.44, h * 0.3);
    c.fillStyle = "#4a3a26"; c.font = "bold 13px Georgia, serif"; c.textAlign = "center";
    c.fillText("HALL STUFF", w * 0.5, h * 0.54);
  });
  var hallBoxM = new THREE.MeshStandardMaterial({ map: hBoxT, roughness: 0.92 });
  // ⚠️ UNDER THE STAIRS, not down the south end. At (E_IN-0.42, 4.42) they sat
  // 0.7m from the camera's own position, behind both composed views — Kyle never
  // saw them. Under the tall end of the flight they're in the north view where the
  // eye already goes, and under-the-stairs is where moving boxes live anyway.
  // …and poking OUT from under the stair edge, x -6.35 not -6.92: dead under the
  // flight passed the NDC visibility check and then screenshotted as nothing at
  // all, because the treads stand between the camera and the void. Frustum maths
  // doesn't know about occlusion; screenshots do.
  var hallBoxes = new THREE.Group(); hallBoxes.position.set(-6.35, 0, -2.55); hallBoxes.rotation.y = 0.34; add(hallBoxes);
  var hb1 = box(0.56, 0.42, 0.46, hallBoxM); hb1.position.y = 0.21; hallBoxes.add(hb1);
  var hb2 = box(0.46, 0.36, 0.4, hallBoxM); hb2.position.set(0.06, 0.60, -0.02); hb2.rotation.y = 0.22; hallBoxes.add(hb2);
  var hallStash = makeStash("hall", "📦 the hall boxes", [
    lookOption(),
    { k: "post", label: "the post", vals: [
      { label: "still on the mat", apply: function () { thePost.forEach(function (e) { e.visible = true; }); } },
      { label: "picked up", apply: function () { thePost.forEach(function (e) { e.visible = false; }); } },
    ] },
    { k: "runner", label: "the runner", vals: [
      { label: "as woven", apply: function () { runner.material.color.set(0xffffff); } },
      { label: "sun-faded", apply: function () { runner.material.color.set(0xcfc4b4); } },
      { label: "midnight", apply: function () { runner.material.color.set(0x8898c8); } },
    ] },
    { k: "bulbs", label: "the bulbs", vals: [
      { label: "warm", apply: function () { [bulbS, bulbN, bulbB].forEach(function (b) { b.light.color.setHex(0xffd9a0); b.bulb.material.emissive.setHex(0xffd9a0); }); } },
      { label: "daylight", apply: function () { [bulbS, bulbN, bulbB].forEach(function (b) { b.light.color.setHex(0xcfe0ff); b.bulb.material.emissive.setHex(0xcfe0ff); }); } },
    ] },
  ]);
  [hb1, hb2].forEach(function (m) {
    tag(m, "the hall boxes", function () { openStash(hallStash); },
      "moving boxes, never unpacked — the hall's odds and ends live here");
  });

  // --- BACK: the laundry basket, which of course holds the back of the house
  var basketG = new THREE.Group(); basketG.position.set(-5.05, 0, 6.35); add(basketG);
  var bskM = mat(0xc8a86a, 0.9);
  var bskBody = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.20, 0.30, 12, 1, true), bskM);
  bskBody.position.y = 0.15; basketG.add(bskBody);
  var bskBase = new THREE.Mesh(new THREE.CircleGeometry(0.20, 12), bskM);
  bskBase.rotation.x = -Math.PI / 2; bskBase.position.y = 0.012; basketG.add(bskBase);
  var bskRim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 8, 16), mat(0xb08d5a, 0.85));
  bskRim.rotation.x = Math.PI / 2; bskRim.position.y = 0.30; basketG.add(bskRim);
  var bskWash = box(0.3, 0.1, 0.26, mat(0xd8cfc0, 0.95)); bskWash.position.y = 0.32; bskWash.rotation.y = 0.4; basketG.add(bskWash);
  var backStash = makeStash("back", "🧺 the laundry basket", [
    lookOption(),
    { k: "washing", label: "the washing", vals: [
      { label: "out on the line", apply: function () { washing.forEach(function (w) { w.visible = true; }); } },
      { label: "brought in", apply: function () { washing.forEach(function (w) { w.visible = false; }); } },
    ] },
    { k: "blinds", label: "the blinds", vals: [
      { label: "half drawn", apply: function () { blindSlats.forEach(function (s, i) { s.visible = true; s.rotation.y = 0.62 + (i % 2) * 0.05; }); } },
      { label: "open", apply: function () { blindSlats.forEach(function (s) { s.visible = true; s.rotation.y = 1.44; }); } },
      { label: "drawn", apply: function () { blindSlats.forEach(function (s, i) { s.visible = true; s.rotation.y = 0.08 + (i % 2) * 0.03; } ); } },
    ] },
    { k: "porch", label: "the porch light", vals: [
      { label: "left on", apply: function () { backPorchOn = 1; } },
      { label: "off", apply: function () { backPorchOn = 0; } },
    ] },
    // the closet moved to the back, so the laundry basket is the box that owns it
    { k: "closet", label: "the closet door", vals: [
      { label: "shut", apply: function () { cloOpen = false; } },
      { label: "ajar", apply: function () { cloOpen = true; } },
    ] },
    { k: "sock", label: "the lost sock", vals: [
      { label: "where it fell", apply: function () { sock.visible = true; } },
      { label: "found at last", apply: function () { sock.visible = false; } },
    ] },
  ]);
  basketG.children.forEach(function (m) {
    tag(m, "the laundry basket", function () { openStash(backStash); },
      "the laundry basket — the back of the house sorts itself out here");
  });

  // --- FRONT: the toolbox on the porch, because yards are maintained FROM porches
  // ⚠️ on the LAWN beside the path, not on the deck. Two failed spots first: at
  // (-4.05,-5.55) it was beside the resting eye, and even at the deck's front edge
  // it sat below the 55° cone (the street view looks steeply DOWN the yard —
  // anything within a metre of the camera is out of frame). NDC-swept five spots;
  // (-4.75,-9.0) lands x[0.17..0.39] y[-0.92..-0.63] — bottom-right, fully visible,
  // and a yard toolbox left out on the grass mid-job is the more honest object.
  var tbxG = new THREE.Group(); tbxG.position.set(-4.75, GROUND + 0.02, -9.0); tbxG.rotation.y = 0.55; yadd(tbxG);
  groundShade(-4.75, -9.0, 0.42, 0.3, 0.42);
  var tbxBody = box(0.5, 0.2, 0.24, mat(0xb03a2e, 0.55)); tbxBody.position.y = 0.1; tbxG.add(tbxBody);
  var tbxLid = box(0.5, 0.06, 0.24, mat(0x8f2d24, 0.55)); tbxLid.position.y = 0.23; tbxG.add(tbxLid);
  var tbxHandle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI), mat(0x2a2d31, 0.5));
  tbxHandle.position.y = 0.26; tbxG.add(tbxHandle);
  var trowel = box(0.05, 0.02, 0.2, mat(0x8f959b, 0.4)); trowel.position.set(0.3, 0.03, 0.05); trowel.rotation.y = 0.5; tbxG.add(trowel);
  var frontStash = makeStash("front", "🧰 the yard toolbox", [
    lookOption(),
    { k: "mower", label: "the mower", vals: [
      { label: "left out mid-job", apply: function () { mowG.visible = true; } },
      { label: "back in the shed", apply: function () { mowG.visible = false; } },
    ] },
    { k: "flag", label: "the mailbox flag", vals: [
      { label: "up — mail out", apply: function () { mbFlag.rotation.x = 0; } },
      { label: "down", apply: function () { mbFlag.rotation.x = 1.35; } },
    ] },
    { k: "bike", label: "the bike", vals: [
      { label: "dropped, as ever", apply: function () { bikeG.visible = true; } },
      { label: "put away for once", apply: function () { bikeG.visible = false; } },
    ] },
    { k: "mist", label: "the ground mist", vals: [
      { label: "rolling in", apply: function () { mists.forEach(function (m) { m.m.visible = true; }); } },
      { label: "a clear night", apply: function () { mists.forEach(function (m) { m.m.visible = false; }); } },
    ] },
  ]);
  [tbxBody, tbxLid, tbxHandle, trowel].forEach(function (m) {
    ytag(m, "the toolbox", function () { openStash(frontStash); },
      "the yard toolbox — the front of the house answers to this");
  });

  // --- KITCHEN: the recipe box, which holds the kitchen's opinions
  var rcpG = new THREE.Group(); rcpG.position.set(KX0 + 0.72, CT_Y + 0.03, KZ0 + 0.38); rcpG.rotation.y = 0.3; add(rcpG);
  var rcpBody = box(0.24, 0.14, 0.16, mat(0x8a6a44, 0.75)); rcpBody.position.y = 0.07; rcpG.add(rcpBody);
  var rcpLid = box(0.24, 0.04, 0.16, mat(0x7d5a34, 0.75)); rcpLid.position.set(0, 0.155, -0.015); rcpLid.rotation.x = -0.2; rcpG.add(rcpLid);
  var rcpCard = box(0.18, 0.1, 0.008, mat(0xf4efdd, 0.95)); rcpCard.position.set(0, 0.16, 0.02); rcpCard.rotation.x = -0.25; rcpG.add(rcpCard);
  var kitchenStash = makeStash("kitchen", "🗃️ the recipe box", [
    lookOption(),
    { k: "rack", label: "the washing up", vals: [
      { label: "still draining", apply: function () { rackG.visible = true; } },
      { label: "put away", apply: function () { rackG.visible = false; } },
    ] },
    { k: "strip", label: "the strip light", vals: [
      { label: "on", apply: function () { kStripOn = 1; } },
      { label: "off", apply: function () { kStripOn = 0; } },
    ] },
    { k: "mugs", label: "the mugs", vals: [
      { label: "primaries", apply: function () { [0xc94b3a, 0x3a6ac9, 0xe0b03a].forEach(function (c, i) { kMugs[i].color.setHex(c); }); } },
      { label: "pastels", apply: function () { [0xe8a0b0, 0xa0c8e8, 0xd8d0a0].forEach(function (c, i) { kMugs[i].color.setHex(c); }); } },
      { label: "all white", apply: function () { kMugs.forEach(function (m) { m.color.setHex(0xece8dc); }); } },
    ] },
    { k: "fruit", label: "the fruit bowl", vals: [
      { label: "full", apply: function () { kFruit.forEach(function (f) { f.visible = true; }); } },
      { label: "somebody ate them", apply: function () { kFruit.forEach(function (f) { f.visible = false; }); } },
    ] },
  ]);
  [rcpBody, rcpLid, rcpCard].forEach(function (m) {
    ktag(m, "the recipe box", function () { openStash(kitchenStash); },
      "the recipe box — the kitchen keeps its opinions in here");
  });

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
    krest: new THREE.Vector3(-8.30, 1.60, 0.60),    // standing in the kitchen, by the fridge
    klook: new THREE.Vector3(-11.7, 1.02, -1.30),   // looking across at the sink and the window
    kdoor1: new THREE.Vector3(-5.95, 1.66, -0.35),  // squared up to the kitchen door, hall side
    kdoor2: new THREE.Vector3(-7.20, 1.63, -0.35),  // in the doorway
    kdoorL: new THREE.Vector3(-9.4, 1.25, -0.6),    // what you see through it
    klookB: new THREE.Vector3(-6.1, 1.28, -0.85),   // turned round: the doorway, the hall beyond
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
  function enterKitchen() {
    if (mode !== "idle" || space !== "hall") return;
    mode = "kitchenIn"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.ratchetSfx && AUDIO.ratchetSfx();
    if (turnBtn) turnBtn.style.display = "none";
  }
  function leaveKitchen() {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "kitchen") return;
    mode = "kitchenOut"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
  }
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
  function restPos() { return space === "porch" ? P.porch : space === "kitchen" ? P.krest : P.rest; }
  function aimFor(f) {
    if (space === "porch") return f === "house" ? P.porchB : P.porchL;
    if (space === "kitchen") return f === "door" ? P.klookB : P.klook;
    return f === "south" ? P.lookS : P.look;
  }
  function flipOf(f) {
    if (space === "porch") return f === "street" ? "house" : "street";
    if (space === "kitchen") return f === "door" ? "room" : "door";
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
    if (stashOpenKey && mode !== "idle") closeStash();   // walking away shuts the box
    if (mode === "kitchenIn" || mode === "kitchenOut") {   // through the kitchen door
      tt = Math.min(1, tt + dt / 2.1);
      var kk = mode === "kitchenIn" ? tt : 1 - tt;
      // -2.0 rad: the slab swings INTO the kitchen, flat against its east wall,
      // clear of the walk line (positive would swing it into the camera's face)
      kDoorPivot.rotation.y = -2.0 * ease(Math.min(1, Math.max(0, (kk - 0.04) / 0.42)));
      if (mode === "kitchenIn") walk([c0, P.kdoor1, P.kdoor2, P.krest], [l0, P.kdoorL, P.klook, P.klook], tt);
      else walk([c0, P.kdoor2, P.kdoor1], [l0, P.kdoorL, P.look], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "kitchenIn") { space = "kitchen"; facing = turnTo = "room"; kDoorPivot.rotation.y = -2.0; }
        else {
          space = "hall"; facing = turnTo = "north"; kDoorPivot.rotation.y = 0;
          AUDIO.clickSfx && AUDIO.clickSfx(500);
        }
        turnK = 1; mode = "idle"; syncTurnBtn();
      }
      return true;
    }
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
    if (space === "hall" || space === "porch" || space === "kitchen") { // at rest: same parallax drift as the bedroom
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
    if (space === "bedroom" || mode === "entering" || mode === "leaving" ||
        mode === "out" || mode === "in" || mode === "kitchenIn" || mode === "kitchenOut") return;
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
    var show = space === "hall" || space === "porch" || space === "kitchen" || mode === "entering";
    turnBtn.style.display = show ? "block" : "none";
    var next = flipOf(mode === "turning" ? turnTo : facing);
    var LBL = { south: "the back of the house", north: "the front door",
                house: "the house", street: "the street",
                door: "the way out", room: "the kitchen" };
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
    porchLight.intensity = 1.5 * dim * backPorchOn;
    porchGlass.material.emissiveIntensity = 1.5 * dim * backPorchOn;
    for (var mi = 0; mi < moths.length; mi++) {   // and the things that love it
      moths[mi].m.visible = backPorchOn > 0;      // no lamp, no moths
      var mm = moths[mi], a = t * mm.sp + mm.ph;
      mm.m.position.set(XC + 1.35 + Math.cos(a) * mm.r,
                        2.24 + Math.sin(a * 1.7) * mm.r * 0.7,
                        Z_S + 0.3 + Math.sin(a) * mm.r * 0.5);
      mm.m.rotation.z = Math.sin(a * 9) * 0.5;
    }
    if (livDoor.userData.spill) // somebody's shows are on in there
      livDoor.userData.spill.material.opacity = livDoor.userData.spillOp * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.3)));
    if (kitDoor.userData.spill) kitDoor.userData.spill.material.opacity = kitDoor.userData.spillOp * (0.9 + 0.1 * Math.sin(t * 0.4));
    // the kitchen breathes with the house's dim, and the fridge glow flickers the
    // tiniest bit — that's the compressor cycling, which is the hum made visible
    kLight.intensity = 2.4 * dim;
    kFill.intensity = 0.45 * dim;
    kUnder.intensity = 1.1 * dim * kStripOn;
    strip.material.emissiveIntensity = 1.3 * dim * kStripOn;
    frGlow.intensity = (0.24 + 0.06 * Math.sin(t * 1.7)) * dim;
    kitchenLife(dt, dim);   // steam off the kettle, and the tap that drips
    hallLife(dt, t, dim * on);   // dust, visible only where it drifts through a bulb
    bGlow.material.opacity = 0.08 + 0.05 * Math.sin(t * 0.9); // the basement, breathing
    var target = cloOpen ? 1.6 : 0;   // +, to match the hinge moving to the north jamb
    cloAnim += (target - cloAnim) * Math.min(1, dt * 7);
    cloDoorP.rotation.y = cloAnim;
    // the closet's bulb comes up with the door, so the 1997 inside it is only lit
    // while you're actually looking at it — and never leaks into the hall when shut
    var cf = Math.min(1, Math.abs(cloAnim) / 1.2);
    cloLight.intensity = 2.8 * cf * dim;
    cloBulb.material.emissiveIntensity = 1.7 * cf * dim;
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
      fPivot.rotation.y = 0; kDoorPivot.rotation.y = 0; figT = 0; figG.visible = false;
      yardG.visible = false;   // camTick would do it next frame, but bfcache may not get one
      cloOpen = false; cloAnim = 0; cloDoorP.rotation.y = 0;
    },
    turn: turn, facing: function () { return facing; },
    stepOut: stepOut, stepIn: stepIn,
    kitchen: { enter: enterKitchen, leave: leaveKitchen },
    stashes: stashByKey, openStash: openStash, closeStash: closeStash,
    setPhase: setPhase, phase: function () { return porchPhase; },
    knock: knockCame,
    camTick: camTick, glowTick: glowTick, refreshPhotos: refreshPhotos
  };
}
