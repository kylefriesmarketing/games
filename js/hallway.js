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
  // …and cut AGAIN for the garage doorway (FIFTH hole, same lesson as the other
  // four: the garage door was a decor slab on solid wall from the day it went up,
  // and the moment it became a door you could open it would have opened onto
  // wallpaper, exactly like the closet did).
  var GDO = { z0: 5.08, z1: 6.12, y1: 2.16 };
  [[Z_N, KDO.z0, 0, 3.4], [KDO.z1, GDO.z0, 0, 3.4], [GDO.z1, Z_S, 0, 3.4],
   [KDO.z0, KDO.z1, KDO.y1, 3.4], [GDO.z0, GDO.z1, GDO.y1, 3.4]].forEach(function (p) {
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

  // THE SHOES, back OUT in front of the closet where the bi-fold leaves room for them
  // (Kyle: "then the shoes can go back in front of it"). x -0.28 is 28cm out from the
  // jamb line — clear of the folded leaves, which stack to x -0.46.
  // ⚠️ z -0.40..0.04, NOT out to 0.28: the folded leaves stack over z 8.03..8.19 and
  // the southern-most shoe was standing under them. Shoes belong in front of the
  // OPENING, which is the northern two-thirds once the door has folded away.
  [[-0.40, 0x2f3a48, 0.06], [-0.26, 0x2f3a48, -0.10],
   [-0.10, 0x5e3a2e, 0.22], [0.04, 0x5e3a2e, -0.06]].forEach(function (sh) {
    var sg = new THREE.Group(); sg.position.set(-0.28, 0.0, sh[0]); sg.rotation.y = sh[2]; cloG.add(sg);
    var sole = box(0.11, 0.025, 0.25, mat(0x1d1f22, 0.85)); sole.position.y = 0.013; sg.add(sole);
    var upper = box(0.10, 0.07, 0.16, mat(sh[1], 0.8)); upper.position.set(0, 0.058, -0.03); sg.add(upper);
    var toe2 = box(0.10, 0.045, 0.09, mat(sh[1], 0.8)); toe2.position.set(0, 0.045, 0.085); sg.add(toe2);
    tag(sole, "the shoes", null, "kicked off at the back door and never once put away.");
  });
  // the floor of it: rollerblades kicked in, a Super Soaker stood in the corner
  // ⚠️ pushed to the BACK (x 0.26) now that the shoes have the front row at x 0.11 —
  // different depth bands, so nothing has to share floor with anything
  // ⚠️ mild rotations (0.25 / -0.30) and x 0.29. At 0.5 / -0.9 a 0.10x0.24 boot swells
  // its bounding box to 0.16 wide and the pair reached out of the back band into the
  // front one, colliding with the boombox and the sleeping bag. A rotated box is wider
  // than the box.
  [[0.567, -0.10, 0.25], [0.567, 0.05, -0.30]].forEach(function (rb) {
    var bl = new THREE.Group(); bl.position.set(0.10 + rb[0] * 0.3, 0.03, rb[1]); bl.rotation.y = rb[2]; cloG.add(bl);
    var boot = box(0.10, 0.13, 0.24, mat(0xe8e4da, 0.6)); boot.position.y = 0.10; bl.add(boot);
    var cuff = box(0.105, 0.06, 0.13, mat(0x2f3f8a, 0.6)); cuff.position.set(0, 0.185, -0.04); bl.add(cuff);
    for (var wl = 0; wl < 4; wl++) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10), mat(0xd8d24a, 0.5));
      wh.rotation.z = Math.PI / 2; wh.position.set(0, 0.026, -0.085 + wl * 0.057); bl.add(wh);
    }
    tag(boot, "the rollerblades", null, "somebody was very good at these for one summer.");
  });
  /* --- the rest of the closet floor. The shoes moved out front, which left the whole
   * front band (x ~0.13) empty, and an empty closet floor is a wasted closet. Two
   * depth bands: the SOAKER and BLADES live at the back (x 0.26-0.28), everything
   * below sits at x 0.13, so nothing ever shares floor with anything. */
  // the boombox, mains lead never coiled once
  var bbx = new THREE.Group(); bbx.position.set(0.11, 0, 0.21); bbx.rotation.y = 0.12; cloG.add(bbx);
  var bbBody = box(0.14, 0.16, 0.30, mat(0x2f3238, 0.45)); bbBody.position.y = 0.08; bbx.add(bbBody);
  [-0.09, 0.09].forEach(function (sp) {                       // the two speakers
    var spk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), mat(0x1a1c20, 0.6));
    spk.rotation.z = Math.PI / 2; spk.position.set(-0.071, 0.08, sp); bbx.add(spk);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.006, 6, 16), mat(0x8f959b, 0.4));
    rim.rotation.y = Math.PI / 2; rim.position.set(-0.072, 0.08, sp); bbx.add(rim);
  });
  var bbDeck = box(0.012, 0.06, 0.10, mat(0x4a4f57, 0.4));    // the tape deck
  bbDeck.position.set(-0.072, 0.10, 0); bbx.add(bbDeck);
  [0.03, 0.055, 0.08].forEach(function (bz2) {
    var btn = box(0.01, 0.012, 0.018, mat(0xb4bac0, 0.35));
    btn.position.set(-0.072, 0.035, bz2 - 0.055); bbx.add(btn);
  });
  var bbHandle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 14, Math.PI), mat(0x1a1c20, 0.5));
  bbHandle.rotation.set(Math.PI / 2, 0, Math.PI / 2); bbHandle.position.set(0, 0.16, 0); bbx.add(bbHandle);
  tag(bbBody, "the boombox", null, "six D batteries and it still ate them in a weekend.");
  // a basketball, gone soft
  var ball = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 12), mat(0xc4632a, 0.85));
  ball.position.set(0.10, 0.068, -0.32); cloG.add(ball);
  [0, Math.PI / 2].forEach(function (br) {                     // the seams
    var sm2 = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.0035, 5, 20), mat(0x2a1c12, 0.8));
    sm2.rotation.set(Math.PI / 2, br, 0); sm2.position.copy(ball.position); cloG.add(sm2);
  });
  tag(ball, "the basketball", null, "nobody in this house was ever any good at basketball.");
  // board games, stacked on the floor because the shelf is full
  [[0, 0x2f6a8a], [0.045, 0xc8322e]].forEach(function (gb, i) {
    var g3 = box(0.135, 0.042, 0.27, mat(gb[1], 0.9));
    g3.position.set(0.13, 0.022 + gb[0], -0.10); g3.rotation.y = i ? 0.10 : -0.06; cloG.add(g3);
    if (!i) tag(g3, "more board games", null, "the shelf was full. these are the ones with pieces missing.");
  });
  // the sleeping bag, rolled since the last time anyone slept over
  // ⚠️ STOOD ON END in the back corner, not lying down. Lying along z it ate 0.34 of
  // the eighty centimetres of floor this closet has, and a closet with six things in
  // it cannot spare that. Upright it occupies a 0.16 circle and reads exactly the same.
  var bag = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.34, 14), mat(0x3f6b8a, 0.95));
  bag.position.set(0.27, 0.17, 0.30); bag.rotation.z = 0.06; cloG.add(bag);
  [-0.09, 0.09].forEach(function (ty) {
    var strap = new THREE.Mesh(new THREE.TorusGeometry(0.080, 0.008, 6, 14), mat(0x2a2f36, 0.8));
    strap.rotation.x = Math.PI / 2; strap.position.set(0.27, 0.17 + ty, 0.30); cloG.add(strap);
  });
  tag(bag, "the sleeping bag", null, "rolled since the last sleepover, which was a while ago now.");

  // ⚠️ leaned 0.14, not 0.24, and set forward to x 0.22. A 0.5m-tall object tilted by
  // 0.24rad throws its top 12cm sideways — enough to push the tank clean through the
  // closet's back wall (measured x max -3.94 against a back face at -4.02). When you
  // lean a tall thing, the base has to come forward by height·sin(tilt).
  // ⚠️ lean 0.06 — barely leaning at all. The interior is only 0.34 deep and this thing
  // is half a metre tall, so every 0.1rad of tilt costs 5cm of depth it hasn't got: at
  // 0.14 the tank still ended up buried in the back panel. Tall + shallow = upright.
  var soak = new THREE.Group(); soak.position.set(0.245, 0.0, -0.31); soak.rotation.set(0, 0.35, -0.06); cloG.add(soak);
  var skBody = box(0.075, 0.46, 0.10, mat(0x2fb8a8, 0.55)); skBody.position.y = 0.25; soak.add(skBody);
  var skTank = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12), mat(0xf2d24a, 0.5));
  skTank.position.set(0, 0.50, -0.01); soak.add(skTank);
  var skNoz = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.13, 8), mat(0xe8478a, 0.5));
  skNoz.rotation.x = Math.PI / 2; skNoz.position.set(0, 0.44, 0.10); soak.add(skNoz);
  var skGrip = box(0.06, 0.13, 0.05, mat(0xe8478a, 0.6)); skGrip.position.set(0, 0.10, 0.05); soak.add(skGrip);
  tag(skBody, "the Super Soaker", null, "the 50. still the best one. still has a bit of water in it.");
  // the shoebox went UP to the shelf — the floor belongs to the shoes now
  var shoebox2 = box(0.28, 0.11, 0.17, mat(0x9a8a6a, 0.9)); shoebox2.position.set(0.20, 2.00, -0.26); shoebox2.rotation.y = 0.25; cloG.add(shoebox2);
  // the closet's own bulb — a pull-cord fixture that only reads when the door is open
  var cloBulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 }));
  cloBulb.position.set(0.16, 1.99, -0.30); cloG.add(cloBulb);
  // ⚠️ range 2.6 and it sits LOW (y 1.35), not up at the bulb. A 1.9-range lamp tucked
  // under the lid lit the shelf and left the floor of the closet black — which is
  // exactly where the rollerblades and the Super Soaker are. Dropping it to chest
  // height inside the box lights the whole depth; the bulb mesh stays up top.
  // ⚠️ up at the front-top (y 1.88) and gentler (decay 1.15, range 3.0), not chest-high
  // and hot. At y 1.35 it sat ~10cm off the coats and blew the windbreaker to pure
  // white — a closet lamp is above and in front of what it lights, and its falloff has
  // to reach the floor two metres down, which a 1.5 decay never did.
  var cloLight = new THREE.PointLight(0xffd9a0, 0, 3.0, 1.15);
  cloLight.position.set(0.05, 1.88, 0.02); cloG.add(cloLight);
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
  /* ⚠️⚠️ A BI-FOLD, not a single leaf (Kyle's call, and the right one twice over). A
   * 0.84m slab swinging into a 3.1m hall had nowhere to go that wasn't in the way —
   * hinged north it stood between the eye and the closet, hinged south it stood across
   * the slider. A bi-fold folds to HALF that, tucks against its own jamb, and is the
   * most nineties thing a hall closet can wear.
   * The kinematics are the whole trick: leaf B counter-rotates at TWICE leaf A's
   * angle, so at A = 86° the pair has folded face-to-face perpendicular to the wall.
   * Measured open: the stack reaches x -4.84, which is 0.46 into the hall instead of
   * 0.84, and it leaves the interior facing the room.
   * ⚠️ no bottom rail — Kyle: "remove the board at the bottom of the closet door". It
   * read as a plank lying across the doorway, so the slab below the lower louvre bank
   * is plain now. */
  var slatM2 = mat(0x3d2b1c, 0.8), bfRail = mat(0x45301f, 0.75);
  function bfLeaf(parent, zc) {          // one louvered leaf, 0.46 wide, centred on zc
    var sl0 = box(0.04, 2.05, 0.46, mat(0x4a3524, 0.72));
    sl0.position.set(-0.03, 1.025, zc); parent.add(sl0);
    [[0.30, 0.62], [1.16, 0.62]].forEach(function (bank) {
      for (var s2 = 0; s2 < 7; s2++) {
        // ⚠️ centred ON the slab (x -0.03), not offset to one side. Off-centre the
        // slats only broke one face, and a folded bi-fold shows you its BACK — which
        // came up as a blank brown panel. Straddling the slab louvres both faces.
        var sl = box(0.055, 0.05, 0.38, slatM2);
        sl.position.set(-0.03, bank[0] + s2 * (bank[1] / 7), zc);
        sl.rotation.z = -0.42;                                // tipped down, as they are
        parent.add(sl);
      }
    });
    [0.92, 1.83].forEach(function (ry2) {                     // mid rail and head rail only
      var rl2 = box(0.045, 0.06, 0.46, bfRail);
      rl2.position.set(-0.006, ry2, zc); parent.add(rl2);
    });
    return sl0;
  }
  var cloDoor = bfLeaf(cloDoorP, -0.23);                      // leaf A, on the jamb
  var bfB = new THREE.Group(); bfB.position.set(0, 0, -0.46); cloDoorP.add(bfB);
  var cloDoorB = bfLeaf(bfB, -0.23);                          // leaf B, hinged to A
  var bfHinge = box(0.03, 1.9, 0.03, mat(0x8f959b, 0.4));     // the piano hinge between them
  bfHinge.position.set(-0.05, 1.02, 0); bfB.add(bfHinge);
  var cloKnob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.6 }));
  cloKnob.position.set(-0.055, 1.0, -0.14); bfB.add(cloKnob);   // the pull, on the leading leaf
  // ⚠️ OPEN by default. It's the one door down here that works, and everything worth
  // looking at is inside it — shut, it's a brown rectangle. The stash still closes it.
  var cloOpen = true, cloAnim = 0;
  function closetToggle() { cloOpen = !cloOpen; AUDIO.ratchetSfx && AUDIO.ratchetSfx(); }
  [cloDoor, cloDoorB, cloKnob].forEach(function (m) {   // both leaves open it
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
  // ⚠️ THE CHAIN CAME OFF. It hung across the top since the hall was built —
  // "opening soon" — and the basement is open now, so it hangs coiled on the
  // south rail post the way an unhooked chain actually lives. The full flight
  // is ELEVEN risers: the original five stopped at y -1.0 in a room that needs
  // to reach -2.42, a staircase into nothing.
  for (var ds = 0; ds < 11; ds++) {
    var dstep = new THREE.Mesh(new THREE.BoxGeometry(HOLE.x1 - HOLE.x0 - 0.06, 0.16, 0.24), stairM);
    dstep.position.set((HOLE.x0 + HOLE.x1) / 2, -0.1 - ds * 0.21, HOLE.z0 + 0.16 + ds * 0.19); add(dstep);
  }
  // rails: SOUTH and EAST only — the north edge is the mouth you walk in through
  (function () {
    var hr = new THREE.Mesh(new THREE.BoxGeometry((HOLE.x1 - HOLE.x0) + 0.1, 0.05, 0.05), mat(0x3a2c1c, 0.7));
    hr.position.set((HOLE.x0 + HOLE.x1) / 2 + 0.05, 0.62, HOLE.z1 + 0.03); add(hr);
    var hp = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.045), mat(0x3a2c1c, 0.7));
    hp.position.set(HOLE.x1, 0.31, HOLE.z1 + 0.03); add(hp);
  })();
  var eastRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, HOLE.z1 - HOLE.z0 + 0.1), mat(0x3a2c1c, 0.7));
  eastRail.position.set(HOLE.x1 + 0.02, 0.62, (HOLE.z0 + HOLE.z1) / 2); add(eastRail);
  var bGlow = new THREE.Mesh(new THREE.PlaneGeometry(HOLE.x1 - HOLE.x0, HOLE.z1 - HOLE.z0),
    new THREE.MeshBasicMaterial({ color: 0x77d9a8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
  bGlow.rotation.x = -Math.PI / 2; bGlow.position.set((HOLE.x0 + HOLE.x1) / 2, 0.02, (HOLE.z0 + HOLE.z1) / 2); add(bGlow);
  var chain = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 0.05), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.7, roughness: 0.45 }));
  chain.position.set(HOLE.x1, 0.38, HOLE.z1 + 0.03); chain.rotation.x = 0.1; add(chain);
  var downHit = box(HOLE.x1 - HOLE.x0, 0.6, HOLE.z1 - HOLE.z0, new THREE.MeshBasicMaterial({ visible: false }));
  downHit.position.set((HOLE.x0 + HOLE.x1) / 2, 0.3, (HOLE.z0 + HOLE.z1) / 2); add(downHit);
  tag(downHit, "the stairs down", function () { enterBasement(); },
    "the basement — the light's on down there. click to go down");
  tag(chain, "the chain", null, "unhooked. it only ever said 'not yet', and it isn't 'not yet' anymore.");

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
  // ⚠️ the garage shell is SEVEN boxes now, not one. The old solid cuboid meant the
  // big door had siding behind it — roll the door up and you'd be looking at wall.
  // A door you can open needs a hole (sixth time this file has learned it), so the
  // north face is two strips and a header around a real 3.4 x 2.3 opening.
  // ⚠️ the EAST wall is three pieces too — the man door to the hall goes through
  // it. Built solid, its inward face sealed the doorway with siding: from the
  // garage you looked at lap boards where the hall should be. (A box's faces all
  // point OUTWARD, so a solid shell is visible from inside wherever the interior
  // walls don't stand in front of it.)
  [[4.7, 3.0, 0.2, -9.9, 1.05, 8.5],       // back
   [0.2, 3.0, 4.4, -12.15, 1.05, 6.4],     // west
   [0.2, 3.0, 0.88, -7.65, 1.05, 4.64],    // east, north of the man door
   [0.2, 3.0, 2.48, -7.65, 1.05, 7.36],    // east, south of it
   [0.2, 0.46, 1.04, -7.65, 2.32, 5.60],   // east header over it
   [1.15, 2.3, 0.2, -8.125, 0.70, 4.30],   // north, east of the opening
   [0.15, 2.3, 0.2, -12.175, 0.70, 4.30],  // north, the sliver west of it
   [4.7, 0.7, 0.2, -9.9, 2.20, 4.30],      // north header over the opening
   [4.7, 0.1, 4.4, -9.9, 2.50, 6.4]]       // lid under the roof
    .forEach(function (s6) {
      var seg = box(s6[0], s6[1], s6[2], garM); seg.position.set(s6[3], s6[4], s6[5]); yadd(seg);
    });
  var garRoof = box(5.1, 0.16, 4.8, mat(0x3a2f26, 0.9)); garRoof.position.set(-9.9, 3.08 + GROUND, 6.4); yadd(garRoof);
  // ⚠️ the big door is no longer a painted slab here — it is FOUR REAL PANELS on a
  // track, built with the garage interior further down (rollPanels), living in
  // yardG so the same door reads from the drive and from inside. It can open.
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

  /* ---- QUARRY: the sign on the neighbour's lawn ------------------------------
   * An alien-hunting sim, so it gets a yard sign — the kind people stake out for a
   * contractor or a candidate, except this one is a warning. Planted across the
   * street on the lawn of the house opposite, which is the right distance: far
   * enough to be somebody else's business, close enough to read from the porch.
   * ⚠️ it is EMISSIVE (0.55). At 26m on an unlit lawn a painted board is a grey
   * smudge; the glow is what makes it legible at all, and a sign that glows faintly
   * in the dark is on-theme for a game about things landing in the night. */
  var qSignT = canvasTex(128, 96, function (c, w, h) {
    c.fillStyle = "#101a14"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#5ce89a"; c.lineWidth = 5; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = "#5ce89a";                                   // the head
    c.beginPath(); c.ellipse(w / 2, h * 0.44, 17, 22, 0, 0, 7); c.fill();
    c.fillStyle = "#101a14";                                   // and the eyes
    c.beginPath(); c.ellipse(w / 2 - 7, h * 0.44, 4.5, 8, 0.45, 0, 7); c.fill();
    c.beginPath(); c.ellipse(w / 2 + 7, h * 0.44, 4.5, 8, -0.45, 0, 7); c.fill();
    c.fillStyle = "#5ce89a"; c.font = "bold 13px Georgia, serif"; c.textAlign = "center";
    c.fillText("QUARRY", w / 2, h - 12);
  });
  qSignT.colorSpace = THREE.SRGBColorSpace;
  var qSignG = new THREE.Group(); qSignG.position.set(-8.5, GROUND, -31.0); qSignG.rotation.y = 0.16; yadd(qSignG);
  [-0.38, 0.38].forEach(function (sx) {                        // the two stakes
    var stk = box(0.05, 1.15, 0.05, mat(0x4a4438, 0.9));
    stk.position.set(sx, 0.575, 0); qSignG.add(stk);
  });
  // ⚠️ 1.24 x 0.92 and emissive 0.85 — sized for 26 METRES, not for how it looks in
  // isolation. At that range the board subtends about 2.5°, so a "realistic" yard sign
  // is thirty pixels of grey; the glow and the extra 20% are the whole difference
  // between a landmark you notice from the porch and a smudge on somebody's lawn.
  var qBoard = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.92, 0.04),
    new THREE.MeshStandardMaterial({ map: qSignT, roughness: 0.75,
      emissive: 0x3f9a68, emissiveIntensity: 0.85 }));
  qBoard.position.set(0, 1.14, 0.03); qSignG.add(qBoard);
  groundShade(-8.5, -31.0, 0.5, 0.22, 0.4);
  function qGo() { window.location.href = "https://kylefriesmarketing.github.io/quarry/"; }
  [qBoard].concat(qSignG.children.filter(function (m) { return m !== qBoard; }))
    .forEach(function (m) {
      ytag(m, "QUARRY", qGo, "QUARRY — something came down out past the treeline · click to go hunting");
    });

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
    /* ⚠️ the BACK sky is the SAME sky. It shipped as a separate always-night
     * painting, so at noon the street baked in daylight while the pool sat under
     * stars — two worlds on one lot (Kyle: the house is its own world, the back
     * yard is part of the neighborhood). Painted here, from the same palette, so
     * the two horizons can never disagree again. Guarded because setPhase runs
     * once before the back yard exists; the sync call at the end of the pool
     * section repaints it the moment it does. */
    if (typeof backSkyT !== "undefined" && backSkyT) {
      var bc = backSkyT.image.getContext("2d"), BW = 256, BH = 128;
      var bgr = bc.createLinearGradient(0, 0, 0, BH);
      bgr.addColorStop(0, s.top); bgr.addColorStop(1, s.bot);
      bc.fillStyle = bgr; bc.fillRect(0, 0, BW, BH);
      if (night) {
        for (var bst = 0; bst < 150; bst++) {
          var bsy = Math.random() * BH * 0.72;
          bc.fillStyle = "rgba(255,255,255," + (0.15 + Math.random() * 0.5 * (1 - bsy / BH)).toFixed(2) + ")";
          bc.fillRect(Math.random() * BW, bsy, 1.3, 1.3);
        }
        // the same moon, squashed for THIS plane's stretch (90/34 vs 256/128 = 1.32)
        var bmx = BW * 0.62, bmy = 26, AR2 = 1.32;
        var bhalo = bc.createRadialGradient(bmx, bmy, 2, bmx, bmy, 26);
        bhalo.addColorStop(0, "rgba(226,234,255,0.4)"); bhalo.addColorStop(1, "rgba(226,234,255,0)");
        bc.save(); bc.translate(bmx, bmy); bc.scale(1 / AR2, 1); bc.translate(-bmx, -bmy);
        bc.fillStyle = bhalo; bc.beginPath(); bc.arc(bmx, bmy, 26 * AR2, 0, 7); bc.fill();
        bc.restore();
        bc.fillStyle = "#e8edff";
        bc.beginPath(); bc.ellipse(bmx, bmy, 7.5 / AR2, 7.5, 0, 0, 7); bc.fill();
      }
      for (var bcb = 0; bcb < 7; bcb++) {
        var bcy = 14 + bcb * 12, bcw = 56 + (bcb * 41 % 110);
        bc.fillStyle = cl;
        bc.beginPath(); bc.ellipse((bcb * 77) % BW, bcy, bcw, 2.4 + (bcb % 3), 0, 0, 7); bc.fill();
      }
      backSkyT.needsUpdate = true;
      backMoon.intensity = night ? 1.15 : name === "dusk" ? 0.55 : 0.2;
      if (typeof bWins !== "undefined" && bWins) bWins.forEach(function (bw2) { bw2.emissiveIntensity = 1.1 * s.lamp; });
    }
    yardHemi.intensity = s.hemi; yardHemi.color.setHex(s.hemiC);
    phaseHemi = s.hemi;                       // the baseline a lightning flash lifts from
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

  /* ---- WEATHER AND SEASON, OUT HERE --------------------------------------------
   * The bedroom has had rain streaks on its glass and a drift of snow/petals for a
   * while. The street had neither — so "a rainy night" was a texture on a window in
   * front of a bone-dry lawn, and now that the window is a real camera on that lawn
   * you would see the lie. One house, one sky: room.js owns the setting, this owns
   * what it looks like outdoors.
   *
   * Both fields are THREE.Points — one draw call each, and a square point carrying a
   * streak texture reads as a drop at this distance. Both live in yardG, so they are
   * skipped from indoors exactly like everything else out here. */
  function fallField(n, box, tex, size, color, op) {
    var geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      pos[i * 3]     = box[0] + Math.random() * (box[1] - box[0]);
      pos[i * 3 + 1] = box[2] + Math.random() * (box[3] - box[2]);
      pos[i * 3 + 2] = box[4] + Math.random() * (box[5] - box[4]);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ map: tex, color: color, size: size, transparent: true,
      opacity: op, depthWrite: false, sizeAttenuation: true });
    var p = new THREE.Points(geo, m); p.visible = false; p.frustumCulled = false; yadd(p);
    return { pts: p, geo: geo, mat: m, box: box };
  }
  // a drop: a soft vertical streak down the middle of an otherwise empty square
  var dropTex = canvasTex(16, 16, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    var g5 = c.createLinearGradient(0, 0, 0, h);
    g5.addColorStop(0, "rgba(210,226,246,0)"); g5.addColorStop(0.35, "rgba(210,226,246,0.95)");
    g5.addColorStop(0.75, "rgba(210,226,246,0.75)"); g5.addColorStop(1, "rgba(210,226,246,0)");
    c.fillStyle = g5; c.fillRect(w * 0.42, 0, w * 0.16, h);
  });
  var flakeTex = canvasTex(16, 16, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    var g6 = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g6.addColorStop(0, "rgba(255,255,255,1)"); g6.addColorStop(0.5, "rgba(255,255,255,0.75)");
    g6.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g6; c.fillRect(0, 0, w, h);
  });
  // ⚠️ the box is centred on where BOTH cameras stand (the porch at x -5.7 and the
  // bedroom window at x -4.4, both looking north up the lawn) — a field spread evenly
  // over the whole 80m street would be too thin to see where anyone is actually looking.
  // ⚠️ z runs to +19 now, not -2: the box used to stop at the house, so it rained
  // on the street while the pool sat bone dry — one sky, both yards.
  var RAIN_BOX = [-23, 13, GROUND, GROUND + 13, -33, 19];
  var rainF = fallField(3400, RAIN_BOX, dropTex, 0.26, 0xc4d6ec, 0.5);
  var seaF  = fallField(760, [-23, 13, GROUND, GROUND + 11, -33, 19], flakeTex, 0.1, 0xffffff, 0.75);
  var SEASON_FALL = {   // matched to room.js's SEASON_LOOKS so indoors and out agree
    winter: { color: 0xeaf2ff, size: 0.11, fall: 0.9,  sway: 0.55, op: 0.85 },
    spring: { color: 0xffc4dc, size: 0.10, fall: 0.7,  sway: 1.1,  op: 0.72 },
    autumn: { color: 0xe8944a, size: 0.12, fall: 0.85, sway: 0.95, op: 0.72 },
  };
  // ⚠️ seeded from the light setPhase("evening") just set, NOT a literal: this `var`
  // runs after that call, so a hardcoded value here would be written over the real
  // one and every lightning flash would key off the wrong baseline.
  var wxKind = "clear", seaKind = null, boltT = 7, boltF = 0, phaseHemi = yardHemi.intensity;
  function setYardWeather(k) {
    wxKind = (k === "rain" || k === "storm") ? k : "clear";
    rainF.pts.visible = wxKind !== "clear";
    rainF.mat.opacity = wxKind === "storm" ? 0.62 : 0.5;
    if (wxKind !== "storm") { boltF = 0; skyDome.material.color.setScalar(1); yardHemi.intensity = phaseHemi; }
  }
  function setYardSeason(k) {
    var L = SEASON_FALL[k];
    seaKind = L ? k : null;
    seaF.pts.visible = !!L;
    if (L) { seaF.mat.color.setHex(L.color); seaF.mat.size = L.size; seaF.mat.opacity = L.op; seaF.mat.needsUpdate = true; }
  }
  // ⚠️ `fall` is METRES PER SECOND, plainly. The first version multiplied by dt*60*0.06
  // as well, which made 11 mean 39.6 — the rain crossed the whole 13m field in a third
  // of a second and read as tracer fire rather than weather.
  function tickFall(f, dt, t, fall, sway) {
    var a = f.geo.attributes.position, p = a.array, b = f.box;
    for (var i = 0; i < p.length; i += 3) {
      p[i + 1] -= fall * dt;
      if (sway) p[i] += Math.sin(t * 0.8 + i) * sway * dt * 0.35;
      if (p[i + 1] < b[2]) {                       // back to the top, somewhere new
        p[i + 1] = b[3];
        p[i]     = b[0] + Math.random() * (b[1] - b[0]);
        p[i + 2] = b[4] + Math.random() * (b[5] - b[4]);
      }
    }
    a.needsUpdate = true;
  }
  function tickSky(t, dt) {
    if (rainF.pts.visible) tickFall(rainF, dt, t, 11, 0.4);
    if (seaF.pts.visible) {
      var L = SEASON_FALL[seaKind];
      tickFall(seaF, dt, t, L.fall, L.sway);
    }
    if (wxKind !== "storm") return;
    // ⚠️ the flash MULTIPLIES the phase's own values and always returns to them.
    // Writing absolute intensities here would fight setPhase and leave the street
    // stuck bright the next time the hour changed.
    boltT -= dt;
    if (boltT <= 0) { boltT = 6 + Math.random() * 11; boltF = 1; }
    if (boltF > 0) {
      boltF = Math.max(0, boltF - dt * 2.6);
      var k = boltF * boltF;
      yardHemi.intensity = phaseHemi * (1 + k * 2.4);
      skyDome.material.color.setScalar(1 + k * 1.7);
    } else if (skyDome.material.color.r !== 1) {
      yardHemi.intensity = phaseHemi; skyDome.material.color.setScalar(1);
    }
  }

  // --- a car goes past now and then. It is the only thing in this house that is
  // ever in a hurry.
  var passG = parkedCar(0, (Z_KERB + Z_ROADF) / 2 - 2.1, Math.PI / 2, 0x5a5f66, 0x4b5057);
  var passHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe9b0, emissiveIntensity: 1.8, roughness: 0.4 }));
  passHead.position.set(0, 0.62, -2.0); passG.add(passHead);
  var passLite = new THREE.PointLight(0xffe0b0, 0, 12, 1.8); passLite.position.set(0, 0.9, -3.0); passG.add(passLite);
  var passX = 999, passDir = 1, passWait = 6 + Math.random() * 14;

  /* ---- HERE COMES THE TRUCK: the hidden one ------------------------------------
   * An ice cream truck comes down the street every five minutes and is gone in
   * fifteen seconds. Catch it and you play the game; miss it and you wait. Nothing
   * advertises it — no poster, no shelf entry, no hint text anywhere in the house.
   * The JINGLE is the only tell, and it is audible from every room, because the
   * mechanic is that you hear it somewhere else and run for the door. Bedroom to
   * porch is two transitions, about five seconds, so fifteen is genuinely catchable
   * and genuinely missable. That gap is the whole game.
   * ⚠️ it drives on the FAR side of the road (z = ROADF side), the lane a truck
   * heading that way would use, and the same lane the passing car uses. */
  var TRUCK_CYCLE = 300, TRUCK_WINDOW = 15;      // five minutes; fifteen seconds
  // ⚠️ the road is NOT at GROUND — it is sunk (see `road`, GROUND-0.06, 0.05 thick),
  // so a truck placed at GROUND floats 3-4cm over its own lane. Drive off the road's
  // top face, not the lawn's.
  var TRUCK_Y = GROUND - 0.06 + 0.025;
  var truckG = new THREE.Group(); truckG.visible = false; yadd(truckG);
  var tkBodyM = mat(0xf2f0e6, 0.55), tkTrimM = mat(0xe4487a, 0.5);
  var tkBox = box(4.5, 1.75, 2.0, tkBodyM); tkBox.position.set(0, 1.35, 0); truckG.add(tkBox);
  var tkCab = box(1.5, 1.25, 1.9, tkBodyM); tkCab.position.set(2.7, 1.05, 0); truckG.add(tkCab);
  var tkWind = box(0.06, 0.62, 1.7, mat(0x2a3340, 0.25)); tkWind.position.set(3.44, 1.32, 0); truckG.add(tkWind);
  var tkStripe = box(4.52, 0.26, 2.02, tkTrimM); tkStripe.position.set(0, 1.05, 0); truckG.add(tkStripe);
  // The serving hatch. ⚠️ at emissiveIntensity 1.5 this was the brightest thing in
  // the whole street — a featureless white slab that read as a bug, not a window.
  // The glow belongs in the POINT LIGHT below; the hatch only has to look lit.
  var tkServe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.95, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xffeec4, emissive: 0xffcf82, emissiveIntensity: 0.42, roughness: 0.5 }));
  tkServe.position.set(-0.3, 1.55, -1.02); truckG.add(tkServe);
  // …and things INSIDE it, so it isn't a blank rectangle: a counter, a menu board
  // and the freezer's shoulder.
  var tkSill = box(2.3, 0.09, 0.22, mat(0xd8d2c0, 0.55)); tkSill.position.set(-0.3, 1.05, -1.10); truckG.add(tkSill);
  var tkMenu = box(0.62, 0.5, 0.03, mat(0x3b2f26, 0.8)); tkMenu.position.set(-1.18, 1.62, -1.06); truckG.add(tkMenu);
  [[-1.18, 1.76], [-1.18, 1.62], [-1.18, 1.48]].forEach(function (ln) {
    var l = box(0.44, 0.035, 0.02, mat(0xf3e6c8, 0.6)); l.position.set(ln[0], ln[1], -1.08); truckG.add(l);
  });
  var tkFrz = box(1.0, 0.42, 0.3, mat(0xbdb6a4, 0.6)); tkFrz.position.set(0.28, 1.34, -0.94); truckG.add(tkFrz);
  var tkAwn = box(2.5, 0.08, 0.55, tkTrimM); tkAwn.position.set(-0.3, 2.12, -1.22); tkAwn.rotation.x = 0.32; truckG.add(tkAwn);
  // a giant cone on the roof, because of course. ⚠️ ConeGeometry is 0.85 tall about
  // its CENTRE and rotation.z=π puts the tip DOWN, so the tip sits at y−0.425 — at
  // y 2.75 that left it hanging 10cm over a 2.225 roof.
  var tkCone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 12), mat(0xe8c48a, 0.8));
  tkCone.rotation.z = Math.PI; tkCone.position.set(-0.9, 2.62, 0); truckG.add(tkCone);
  var tkScoop = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 11), mat(0xf6b8cc, 0.65));
  tkScoop.position.set(-0.9, 3.16, 0); truckG.add(tkScoop);
  var tkHorn = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.36, 10), mat(0xd8d2c0, 0.5));
  tkHorn.rotation.z = -Math.PI / 2; tkHorn.position.set(1.9, 2.41, 0); truckG.add(tkHorn);
  [[1.55, 0.9], [1.55, -0.9], [-1.5, 0.9], [-1.5, -0.9]].forEach(function (w) {
    var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12), mat(0x1d1f22, 0.8));
    wh.rotation.x = Math.PI / 2; wh.position.set(w[0], 0.42, w[1]); truckG.add(wh);
  });
  var tkHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe9b0, emissiveIntensity: 1.8, roughness: 0.4 }));
  tkHead.position.set(3.5, 0.85, 0); truckG.add(tkHead);
  var tkLite = new THREE.PointLight(0xffd9a0, 0, 14, 1.7); tkLite.position.set(-0.3, 1.7, -2.2); truckG.add(tkLite);
  truckG.children.forEach(function (m) {
    ytag(m, "HERE COMES THE TRUCK", function () {
      window.location.href = "https://kylefriesmarketing.github.io/here-comes-the-truck/";
    }, "HERE COMES THE TRUCK — you caught it. click before it's gone");
  });
  // ⚠️ the truck starts its first run at 40s, not at 300. A five-minute wait before
  // the mechanic even exists means most visitors never learn it is there.
  var truckT = TRUCK_CYCLE - 40, truckJing = 0, truckSeen = false;

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
  /* ⚠️ THE BEDROOM NEEDS AN OUTSIDE NOW. Its walls are inward-facing planes — a
   * doll-house — and no view before this one could tell: from the hall you look
   * north or south along the corridor, from the porch you look at the street, and
   * the old painted-backdrop yard stood exactly where this sightline runs. Stand
   * on the back lawn, turn round, and the room's whole lit interior floated in
   * the night beside the house: neon sign, bookshelf, beanbag, no walls. Three
   * siding panels and a roof slab, in backG so they gate with everything else
   * out here. (sidingM is the front porch's own cladding — one house, one skin.) */
  [[8.0, 3.3, 0.14, -0.35, 1.2, 3.62],     // south face, sealing the hall-bedroom gap too
   [0.14, 3.3, 7.3, 3.62, 1.2, 0.05],      // east face
   [8.3, 0.12, 7.5, -0.35, 3.02, 0.05]]    // the lid
    .forEach(function (bs) {
      var shell = box(bs[0], bs[1], bs[2], sidingM);
      shell.position.set(bs[3], bs[4], bs[5]); badd(shell);
    });
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

  // ⚠️ the lawn is FOUR planes around a hole, not one — the pool is dug through it.
  // One plane meant a ray down the pool mouth hit GRASS at y GROUND before it ever
  // reached the water at -0.22: a pool painted over, the door-needs-a-hole lesson
  // in landscaping form. The apron's border slabs hide the seams.
  var LAWN = { x0: XC - 15, x1: XC + 15, z0: Z_S + 0.9, z1: Z_S + 17.9 };
  var PHOLE = { x0: XC + 1.55, x1: XC + 7.65, z0: Z_S + 5.9, z1: Z_S + 10.5 };  // the apron footprint
  [[LAWN.x0, LAWN.x1, LAWN.z0, PHOLE.z0], [LAWN.x0, LAWN.x1, PHOLE.z1, LAWN.z1],
   [LAWN.x0, PHOLE.x0, PHOLE.z0, PHOLE.z1], [PHOLE.x1, LAWN.x1, PHOLE.z0, PHOLE.z1]]
    .forEach(function (lp3) {
      var lw = new THREE.Mesh(new THREE.PlaneGeometry(lp3[1] - lp3[0], lp3[3] - lp3[2]), grassM);
      lw.rotation.x = -Math.PI / 2;
      lw.position.set((lp3[0] + lp3[1]) / 2, GROUND, (lp3[2] + lp3[3]) / 2); badd(lw);
    });

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

  // the washing line — shifted WEST of centre when the pool went in: its old east
  // post stood 15cm off the water. Towels by a pool, fine; the good sheets, no.
  [[-5.5, 0], [0.3, 0]].forEach(function (wp) {
    var wpo = box(0.09, 1.9, 0.09, mat(0x6a5540, 0.95));
    wpo.position.set(XC + wp[0], GROUND + 0.95, Z_S + 6.6); badd(wpo);
  });
  var wline = box(5.8, 0.015, 0.015, mat(0xcfc8b6, 0.8));
  wline.position.set(XC - 2.6, GROUND + 1.82, Z_S + 6.6); badd(wline);
  var washing = [];
  [[-4.5, 0.34, 0xd8dce4], [-3.2, 0.42, 0xc9d2dc], [-1.8, 0.30, 0xdfe6dc]].forEach(function (pg) {
    var cl = box(0.30, pg[1], 0.012, mat(pg[2], 0.95));
    cl.position.set(XC + pg[0], GROUND + 1.82 - pg[1] / 2, Z_S + 6.6); badd(cl); washing.push(cl);
  });

  /* --- THE NEIGHBORHOOD, ALL THE WAY ROUND ---------------------------------------
   * Kyle's rule: the house is its own world, and the back yard is part of the
   * neighborhood — not a diorama behind the fence. So: neighbour houses on every
   * property line (their windows dim with the hour exactly like the front street's),
   * side fences that actually close the lot, telephone poles carrying sagging lines
   * along the back easement, and trees between the roofs. bWins collects every lit
   * window so setPhase can drive them all with one loop, same as nbWin out front. */
  var bWins = [];
  function bHouse(hx, hz, hw, hh, hd, ry2, wins) {
    var hg = new THREE.Group(); hg.position.set(hx, GROUND, hz); hg.rotation.y = ry2; badd(hg);
    var bod = box(hw, hh, hd, mat(0x2a3242, 0.95)); bod.position.y = hh / 2; hg.add(bod);
    var rf = new THREE.Mesh(new THREE.ConeGeometry(hw * 0.74, hh * 0.62, 4), mat(0x222a36, 0.95));
    rf.rotation.y = Math.PI / 4; rf.position.y = hh + hh * 0.31; hg.add(rf);
    (wins || []).forEach(function (wn) {
      var win = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.75),
        new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffd9a0, emissiveIntensity: 1.1, roughness: 0.6 }));
      win.position.set(wn[0], wn[1], -hd / 2 - 0.03); win.rotation.y = Math.PI; hg.add(win);
      bWins.push(win.material);
    });
    return hg;
  }
  function bTree(tx, tz, sc) {
    var tg2 = new THREE.Group(); tg2.position.set(tx, GROUND, tz); tg2.scale.setScalar(sc || 1); badd(tg2);
    var tr2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 3.6, 7), mat(0x3d2f22, 0.95));
    tr2.position.y = 1.8; tg2.add(tr2);
    [[0, 4.1, 0, 1.35], [-0.9, 3.8, 0.4, 1.0], [0.9, 3.9, -0.3, 1.05]].forEach(function (bl2) {
      var lf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(bl2[3], 1), mat(0x2f4a2a, 0.95));
      lf2.position.set(bl2[0], bl2[1], bl2[2]); lf2.scale.y = 0.82; tg2.add(lf2);
    });
  }
  bHouse(XC + 8.2, Z_S + 21.5, 9.5, 3.6, 6.0, 0, [[-1.8, 2.55], [1.4, 1.5]]);   // next door (kept its light)
  bHouse(XC - 4.1, Z_S + 21.9, 7.8, 3.2, 5.6, 0.06, [[0.9, 1.4]]);              // the one behind the tree line
  bHouse(XC - 14.2, Z_S + 19.4, 8.6, 3.4, 5.8, -0.09, [[-1.2, 1.5], [1.6, 2.4]]); // the corner lot
  bHouse(XC + 17.6, Z_S + 8.0, 8.8, 3.4, 6.0, Math.PI / 2, [[-1.0, 1.5]]);      // east over the side fence
  bHouse(XC - 17.9, Z_S + 5.6, 8.2, 3.2, 5.6, -Math.PI / 2, [[0.8, 1.4]]);      // west, across the drive
  bTree(XC - 7.4, Z_S + 18.9, 1.15); bTree(XC + 14.4, Z_S + 19.7, 0.9); bTree(XC + 3.1, Z_S + 19.9, 0.8);
  // side fences: the lot actually closes now. Boards run along z, mirrored pair.
  [[XC - 11.55, 1], [XC + 11.55, -1]].forEach(function (sf) {
    for (var sb2 = 0; sb2 < 30; sb2++) {
      var bd2 = box(0.04, 1.65, 0.17, bFenceM);
      bd2.position.set(sf[0], GROUND + 0.82, Z_S + 1.1 + sb2 * 0.51); badd(bd2);
    }
    [Z_S + 2.4, Z_S + 8.1, Z_S + 13.8].forEach(function (pz2) {
      var po2 = box(0.13, 1.85, 0.13, mat(0x51402f, 0.95));
      po2.position.set(sf[0] + sf[1] * 0.04, GROUND + 0.92, pz2); badd(po2);
    });
    [GROUND + 0.35, GROUND + 1.42].forEach(function (ry3) {
      var rl2 = box(0.05, 0.09, 15.3, mat(0x5e4a37, 0.95));
      rl2.position.set(sf[0] + sf[1] * 0.045, ry3, Z_S + 8.75); badd(rl2);
    });
  });
  // telephone poles on the back easement, lines sagging between them
  [[XC - 11.8, Z_S + 16.6], [XC + 11.8, Z_S + 16.6]].forEach(function (tp2) {
    var pole3 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 5.4, 8), mat(0x4a3a2a, 0.95));
    pole3.position.set(tp2[0], GROUND + 2.7, tp2[1]); badd(pole3);
    var arm = box(1.3, 0.09, 0.09, mat(0x4a3a2a, 0.95));
    arm.position.set(tp2[0], GROUND + 4.9, tp2[1]); badd(arm);
  });
  [[GROUND + 4.92, -0.45], [GROUND + 4.92, 0.45]].forEach(function (wl2) {
    [-1, 1].forEach(function (hs2) {   // two half-spans meeting lower in the middle = the sag
      var seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 11.85, 5), mat(0x1d1f22, 0.9));
      seg2.rotation.z = Math.PI / 2 + hs2 * 0.055;
      seg2.position.set(XC + hs2 * 5.9, wl2[0] - 0.16, Z_S + 16.6 + wl2[1]); badd(seg2);
    });
  });
  /* --- one continuous ground. The front lawn ends at z 4.0 and the back lawn
   * began at z 9.7 — the strip between them, both SIDES of the house, was void:
   * stand by the pool, look past the garage, and the world stopped at a black
   * band. Four fill planes tie every edge to every other edge, all meeting at
   * exact seams (adjacent, never overlapping — coplanar overlap is the baseboard
   * bug at landscape scale). */
  // ⚠️ every joint LAPS by ~5cm. Edge-to-edge, a ray down the exact seam line slips
  // between both planes (measured: a hole at x -14, z 9.70 precisely). Coplanar
  // overlap is safe HERE ONLY because both sides are the same material — the
  // z-fight resolves to the same green either way, so it cannot flicker.
  [[-45, 35, 4.0, 9.74], [-45, -20.86, 9.66, 26.74], [9.06, 35, 9.66, 26.74], [-45, 35, 26.66, 44]]
    .forEach(function (gf) {
      var gp2 = new THREE.Mesh(new THREE.PlaneGeometry(gf[1] - gf[0], gf[3] - gf[2]), grassM);
      gp2.rotation.x = -Math.PI / 2;
      gp2.position.set((gf[0] + gf[1]) / 2, GROUND, (gf[2] + gf[3]) / 2); badd(gp2);
    });

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
  // ⚠️ the EAST pane is the one that moves (the blinds bunch over the west half),
  // so it gets a handle var and a remembered home x — the walk-out slides it west
  // over its neighbour, exactly like a real slider.
  var sdPaneE = null;
  [-1, 1].forEach(function (s) {
    var pane = new THREE.Mesh(new THREE.PlaneGeometry(SD_W / 2 - 0.08, SD_H - 0.06), glassM2);
    pane.position.set(XC + s * SD_W / 4, SD_H / 2, SD_Z + s * 0.03); badd(pane);
    if (s === 1) sdPaneE = pane;
  });
  var sdHandle = box(0.035, 0.30, 0.05, alu); sdHandle.position.set(XC + 0.16, 1.02, SD_Z - 0.06); badd(sdHandle);
  var SD_PANE_X = sdPaneE.position.x, SD_HANDLE_X = sdHandle.position.x, SD_SLIDE = SD_W / 2 - 0.10;
  function slideK(k2) {   // 0 shut .. 1 open: pane and handle travel together
    sdPaneE.position.x = SD_PANE_X - SD_SLIDE * k2;
    sdHandle.position.x = SD_HANDLE_X - SD_SLIDE * k2;
  }
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
      tag(m, "the sliding door", function () { enterBack(); },
        "the back yard — there's a pool out there. click to go out");
    });
  // the way back in: an invisible hitbox over the opening, yard side
  var bBackHit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.0, 0.25),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  bBackHit.position.set(XC + 0.56, SD_H / 2, Z_S + 0.28); badd(bBackHit);
  clickable(bBackHit, "the house", function () { leaveBack(); }, "back inside — it's warmer than it looks out here");
  bBackHit.userData.space = "back";
  tag(blindRail, "the blinds", null, "vertical blinds, half drawn. they have always been half drawn.");

  /* ---- THE POOL -----------------------------------------------------------------
   * The back yard's whole reason to walk out there. In-ground, east of the washing
   * line: concrete apron, coping, a liner you can see through the water, and the
   * night-pool glow — the water is faintly emissive and a cyan light sits under the
   * surface, INSIDE backG so it gates itself with the hall like the back moon does.
   * Everything out here is tagged space "back" (btag): visible through the glass
   * from the hall, clickable only once you've stepped out. */
  function btag(m, name, action, hint) { clickable(m, name, action, hint); m.userData.space = "back"; return m; }
  var POOL = { x0: XC + 2.4, x1: XC + 6.8, z0: Z_S + 6.75, z1: Z_S + 9.65 };  // -3.5..0.9 x, 15.55..18.45 z
  var PCX = (POOL.x0 + POOL.x1) / 2, PCZ = (POOL.z0 + POOL.z1) / 2;
  var poolConcM = mat(0xa8a49a, 0.95);
  // ⚠️ four border slabs, NOT one big one — a single slab would seal the pool mouth
  // shut exactly the way the first version of every doorway in this house did.
  [[POOL.x0 - 0.95, POOL.x1 + 0.95, POOL.z0 - 0.85, POOL.z0],
   [POOL.x0 - 0.95, POOL.x1 + 0.95, POOL.z1, POOL.z1 + 0.85],
   [POOL.x0 - 0.95, POOL.x0, POOL.z0, POOL.z1],
   [POOL.x1, POOL.x1 + 0.95, POOL.z0, POOL.z1]]
    .forEach(function (ap2) {
      var slab2 = box(ap2[1] - ap2[0], 0.06, ap2[3] - ap2[2], poolConcM);
      slab2.position.set((ap2[0] + ap2[1]) / 2, GROUND + 0.005, (ap2[2] + ap2[3]) / 2); badd(slab2);
      btag(slab2, "the pool deck", null, "warm all day, cold the second the sun goes. feet remember.");
    });
  // coping lip around the water
  [[PCX, POOL.z0 - 0.09, POOL.x1 - POOL.x0 + 0.36, 0.18], [PCX, POOL.z1 + 0.09, POOL.x1 - POOL.x0 + 0.36, 0.18],
   [POOL.x0 - 0.09, PCZ, 0.18, POOL.z1 - POOL.z0], [POOL.x1 + 0.09, PCZ, 0.18, POOL.z1 - POOL.z0]]
    .forEach(function (cp) {
      var lip = box(cp[2], 0.09, cp[3], mat(0xc8c4b8, 0.9));
      lip.position.set(cp[0], GROUND + 0.045, cp[1]); badd(lip);
    });
  // the basin: liner walls and floor, pale tile-blue with a darker waterline band
  var linerM = mat(0xbfe4ea, 0.85), linerD = mat(0x8ec4d0, 0.85);
  var pFloor = box(POOL.x1 - POOL.x0, 0.08, POOL.z1 - POOL.z0, linerM);
  pFloor.position.set(PCX, GROUND - 1.30, PCZ); badd(pFloor);
  [[PCX, POOL.z0 + 0.05, POOL.x1 - POOL.x0, 0.10], [PCX, POOL.z1 - 0.05, POOL.x1 - POOL.x0, 0.10],
   [POOL.x0 + 0.05, PCZ, 0.10, POOL.z1 - POOL.z0], [POOL.x1 - 0.05, PCZ, 0.10, POOL.z1 - POOL.z0]]
    .forEach(function (pw) {
      var wall2 = box(pw[2], 1.30, pw[3], linerM);
      wall2.position.set(pw[0], GROUND - 0.65, pw[1]); badd(wall2);
      var band = box(pw[2] === 0.10 ? 0.11 : pw[2] + 0.01, 0.10, pw[3] === 0.10 ? 0.11 : pw[3] + 0.01, linerD);
      band.position.set(pw[0], GROUND - 0.16, pw[1]); badd(band);
    });
  // the water. Caustic net drawn WHITE so colour comes from material.color (the rule),
  // faint emissive so it reads lit from within after dark.
  // ⚠️ mid-grey base, WHITE net. The first draw was white lines on a white fill —
  // the map multiplied to a flat cyan sheet and the caustics never existed on
  // screen. The net only reads if the base sits well below it.
  var waterT = canvasTex(256, 256, function (c, w, h) {
    c.fillStyle = "#b6c2c6"; c.fillRect(0, 0, w, h);
    c.lineWidth = 2;
    for (var n2 = 0; n2 < 26; n2++) {                       // wobbly cells, the caustic net
      var cx2 = (n2 * 53) % w, cy2 = (n2 * 91) % h, rr = 18 + (n2 % 5) * 8;
      c.strokeStyle = "rgba(255,255,255," + (0.45 + (n2 % 4) * 0.16) + ")";
      c.beginPath();
      for (var a2 = 0; a2 <= 12; a2++) {
        var th = a2 / 12 * Math.PI * 2, wob = rr + Math.sin(th * 3 + n2) * 5;
        var px2 = cx2 + Math.cos(th) * wob, py2 = cy2 + Math.sin(th) * wob * 0.7;
        if (a2 === 0) c.moveTo(px2, py2); else c.lineTo(px2, py2);
      }
      c.stroke();
    }
  });
  waterT.wrapS = waterT.wrapT = THREE.RepeatWrapping; waterT.repeat.set(2, 2);
  var waterM = new THREE.MeshStandardMaterial({
    map: waterT, color: 0x3fb4cc, transparent: true, opacity: 0.62, roughness: 0.15,
    emissive: 0x1a7d8c, emissiveIntensity: 0.5, depthWrite: false,
  });
  var water = new THREE.Mesh(new THREE.PlaneGeometry(POOL.x1 - POOL.x0 - 0.06, POOL.z1 - POOL.z0 - 0.06), waterM);
  water.rotation.x = -Math.PI / 2; water.position.set(PCX, GROUND - 0.22, PCZ); badd(water);
  btag(water, "the pool", null, "the pool. heated by June, allegedly.");
  var poolLight = new THREE.PointLight(0x7fd8e8, 1.5, 6.5, 1.8);
  poolLight.position.set(PCX, GROUND - 0.7, PCZ); badd(poolLight);
  var poolNiche = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8f4fa, emissive: 0xaef0ff, emissiveIntensity: 1.6, roughness: 0.3 }));
  poolNiche.position.set(PCX, GROUND - 0.62, POOL.z0 + 0.11); badd(poolNiche);
  // ladder in the north-east corner (alu is the slider's own material, two blocks up)
  [[-0.14], [0.14]].forEach(function (lr) {
    var rail2 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.15, 8), alu);
    rail2.position.set(POOL.x1 - 0.35 + lr[0], GROUND + 0.22, POOL.z0 + 0.16); badd(rail2);
    var bend = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), alu);
    bend.rotation.x = Math.PI / 2; bend.position.set(POOL.x1 - 0.35 + lr[0], GROUND + 0.79, POOL.z0 + 0.28); badd(bend);
  });
  for (var rg2 = 0; rg2 < 3; rg2++) {
    var rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 8), alu);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(POOL.x1 - 0.35, GROUND - 0.05 - rg2 * 0.32, POOL.z0 + 0.16);
    badd(rung); btag(rung, "the ladder", null, "the ladder nobody uses. everyone jumps.");
  }
  // diving board at the west end, over the deep half
  var dbBase = box(0.5, 0.34, 0.42, poolConcM); dbBase.position.set(POOL.x0 - 0.55, GROUND + 0.17, PCZ); badd(dbBase);
  var dbPlank = box(1.45, 0.06, 0.38, mat(0xe4e0d2, 0.7));
  dbPlank.position.set(POOL.x0 + 0.25, GROUND + 0.37, PCZ); badd(dbPlank);
  btag(dbPlank, "the diving board", null, "the rule is one bounce. the record is four.");
  // floats: the inner tube and the beach ball, adrift (the cooler decides who's out)
  var ringT = canvasTex(128, 16, function (c, w, h) {
    c.fillStyle = "#e05a4a"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#f4efdd"; for (var st4 = 0; st4 < 4; st4++) c.fillRect(st4 * 32, 0, 16, h);
  });
  ringT.wrapS = THREE.RepeatWrapping;
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 10, 22),
    new THREE.MeshStandardMaterial({ map: ringT, roughness: 0.6 }));
  ring.rotation.x = -Math.PI / 2; badd(ring);
  btag(ring, "the inner tube", null, "first one in gets it. that is the whole law.");
  var ballT = canvasTex(96, 48, function (c, w, h) {
    ["#e05a4a", "#f4efdd", "#3a68b0", "#f4efdd", "#e0b03a", "#f4efdd"].forEach(function (col, i7) {
      c.fillStyle = col; c.fillRect(i7 * 16, 0, 16, h);
    });
  });
  var bball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10),
    new THREE.MeshStandardMaterial({ map: ballT, roughness: 0.5 }));
  badd(bball);
  btag(bball, "the beach ball", null, "it always drifts to the exact middle, just out of reach.");
  var floatT = 0, floatMode = 0;   // 0 both out · 1 ring only · 2 ball only · 3 put away
  // loungers + the cooler on the south apron
  [[PCX - 0.9], [PCX + 0.35]].forEach(function (lg2) {
    var lgG = new THREE.Group(); lgG.position.set(lg2[0], GROUND, POOL.z1 + 0.62); badd(lgG);
    var seat = box(0.52, 0.05, 1.1, mat(0x3a6ac9, 0.8)); seat.position.set(0, 0.24, 0.1); lgG.add(seat);
    var bck = box(0.52, 0.05, 0.5, mat(0x3a6ac9, 0.8));
    bck.position.set(0, 0.38, -0.62); bck.rotation.x = -0.6; lgG.add(bck);
    [[-0.21, 0.42], [0.21, 0.42], [-0.21, -0.35], [0.21, -0.35]].forEach(function (lp2) {
      var leg2 = box(0.045, 0.24, 0.045, mat(0xd8d2c4, 0.5)); leg2.position.set(lp2[0], 0.12, lp2[1]); lgG.add(leg2);
    });
    lgG.children.forEach(function (m) { btag(m, "the loungers", null, "one for reading, one for the towels. it rotates."); });
  });
  // 🧊 THE COOLER — the back yard's stash
  var coolG = new THREE.Group(); coolG.position.set(PCX + 1.35, GROUND, POOL.z1 + 0.58); coolG.rotation.y = -0.3; badd(coolG);
  var coolBody = box(0.52, 0.34, 0.34, mat(0xb03a2e, 0.6)); coolBody.position.y = 0.17; coolG.add(coolBody);
  var coolLid = box(0.54, 0.09, 0.36, mat(0xece8dc, 0.5)); coolLid.position.y = 0.385; coolG.add(coolLid);
  var coolHandle = box(0.06, 0.04, 0.30, mat(0xece8dc, 0.5)); coolHandle.position.set(0.30, 0.24, 0); coolG.add(coolHandle);
  // the grill, at a dad-approved distance from anything flammable
  var grillG = new THREE.Group(); grillG.position.set(XC - 2.6, GROUND, Z_S + 2.9); grillG.rotation.y = 0.5; badd(grillG);
  var kettle = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10), mat(0x1d1f22, 0.55));
  kettle.scale.y = 0.72; kettle.position.y = 0.68; grillG.add(kettle);
  var kLid2 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), mat(0x8a8f96, 0.4));
  kLid2.position.y = 0.93; grillG.add(kLid2);
  [[-0.16, 0.1], [0.16, 0.1], [0, -0.19]].forEach(function (gl2) {
    var leg3 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), mat(0x2b2e33, 0.5));
    leg3.position.set(gl2[0], 0.31, gl2[1]); grillG.add(leg3);
  });
  var gShelf2 = box(0.34, 0.03, 0.22, mat(0x6b5638, 0.85)); gShelf2.position.set(0.42, 0.62, 0); grillG.add(gShelf2);
  grillG.children.forEach(function (m) { btag(m, "the grill", null, "dad has a system. do not ask about the system."); });
  // the slip 'n slide, still out from the weekend
  var slideStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 4.4),
    new THREE.MeshStandardMaterial({ color: 0xe8d24a, roughness: 0.35,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  slideStrip.rotation.x = -Math.PI / 2; slideStrip.rotation.z = 0.12;
  slideStrip.position.set(XC - 5.2, GROUND + 0.012, Z_S + 4.6); badd(slideStrip);
  btag(slideStrip, "the slip 'n slide", null, "the bruises were worth it. every single one.");
  [[XC - 5.0, Z_S + 2.2, 0.9], [XC - 4.4, Z_S + 1.5, 0.4]].forEach(function (hs) {
    var hose = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 8), mat(0x2f5e3a, 0.7));
    hose.rotation.z = Math.PI / 2; hose.rotation.y = hs[2]; hose.position.set(hs[0], GROUND + 0.03, hs[1]); badd(hose);
  });
  // tiki torches at the pool's south corners — lit or out is the cooler's call
  var flames = [];
  [[POOL.x0 - 0.5, POOL.z1 + 0.5], [POOL.x1 + 0.5, POOL.z1 + 0.5]].forEach(function (tk2) {
    var pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.45, 8), mat(0x8a6a44, 0.9));
    pole2.position.set(tk2[0], GROUND + 0.72, tk2[1]); badd(pole2);
    var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.045, 0.16, 8), mat(0x5e4a37, 0.9));
    cup.position.set(tk2[0], GROUND + 1.5, tk2[1]); badd(cup);
    var fl2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 7),
      new THREE.MeshStandardMaterial({ color: 0xffc86a, emissive: 0xff9a3a, emissiveIntensity: 2.2, roughness: 0.5 }));
    fl2.position.set(tk2[0], GROUND + 1.66, tk2[1]); badd(fl2); flames.push(fl2);
    btag(pole2, "the tiki torches", null, "for ambience, and for wasps that enjoy ambience.");
  });
  function setFloats(m2) {
    floatMode = m2;
    ring.visible = m2 === 0 || m2 === 1;
    bball.visible = m2 === 0 || m2 === 2;
  }
  var poolLightOn = true;
  function setPoolLight(on2) {
    poolLightOn = !!on2;
    poolLight.visible = poolLightOn; poolNiche.visible = poolLightOn;
    waterM.emissiveIntensity = poolLightOn ? 0.5 : 0.12;
  }
  function setTorches(on2) { flames.forEach(function (f3) { f3.visible = !!on2; }); }
  setFloats(0);
  // the water breathes and the floats drift — ticked from glowTick (both loops)
  function poolTick(t, dt) {
    waterT.offset.x = Math.sin(t * 0.10) * 0.05 + t * 0.006;
    waterT.offset.y = Math.cos(t * 0.083) * 0.04;
    floatT += dt;
    if (ring.visible) {
      ring.position.set(PCX - 0.75 + Math.sin(floatT * 0.16) * 0.45,
        GROUND - 0.20 + Math.sin(floatT * 0.9) * 0.015, PCZ + Math.cos(floatT * 0.13) * 0.5);
      ring.rotation.z = floatT * 0.03;
    }
    if (bball.visible) {
      bball.position.set(PCX + 1.05 + Math.cos(floatT * 0.11) * 0.5,
        GROUND - 0.10 + Math.sin(floatT * 1.15 + 2) * 0.02, PCZ - 0.35 + Math.sin(floatT * 0.09) * 0.55);
      bball.rotation.y = floatT * 0.12;
    }
    for (var fi2 = 0; fi2 < flames.length; fi2++) {
      if (!flames[fi2].visible) continue;
      flames[fi2].material.emissiveIntensity = 2.0 + Math.sin(t * 9 + fi2 * 2.4) * 0.5;
      flames[fi2].scale.y = 1 + Math.sin(t * 11 + fi2) * 0.14;
    }
    if (poolLightOn) poolLight.intensity = 1.5 + Math.sin(t * 1.7) * 0.18;
  }
  // the back yard exists now — repaint its sky from the current phase, so it joins
  // the neighborhood mid-hour instead of waking up under yesterday's stars
  setPhase(porchPhase);

  // --- THE GARAGE: the tape came off. It's a real room now, through a real door.
  // ⚠️ z 5.60, not 6.30. The shelving and its bins start at z 6.8 on this same wall,
  // and from the hall camera a west-wall object at LARGER z sits closer to frame
  // centre — so at 6.30 the shelf uprights and the orange bins were landing right on
  // the garage door's near jamb. Pulling it north moves it toward the frame edge and
  // opens a clear 0.7m gap between the two. (Kyle: "so it and its frame is not
  // covered by the shelf and boxes".)
  // Same construction as the kitchen door: the slab hangs on a real hinge (north
  // jamb, swings INTO the garage); jambs, spill and plaque stay on the wall.
  var gDoorPivot = new THREE.Group(); gDoorPivot.position.set(W_IN + 0.03, 0, 6.06); add(gDoorPivot);
  var gSlab = box(0.05, 2.05, 0.92, mat(0x3f4a52, 0.72)); gSlab.position.set(0, 1.025, -0.46); gDoorPivot.add(gSlab);
  var gKnob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.6 }));
  gKnob.position.set(0.05, 1.0, -0.80); gDoorPivot.add(gKnob);
  [[2.09, 0.08, 1.06, 5.60], [1.02, 2.12, 0.08, 5.08], [1.02, 2.12, 0.08, 6.12]].forEach(function (j) {
    var jm = box(0.08, j[1], j[2], mat(0x241b12, 0.8));
    jm.position.set(W_IN + 0.045, j[0], j[3]); add(jm);
  });
  var gSpill = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  gSpill.rotation.x = -Math.PI / 2; gSpill.rotation.z = Math.PI / 2;
  gSpill.position.set(W_IN + 0.12, 0.012, 5.60); add(gSpill);
  (function () {
    var pg = new THREE.Group(); pg.position.set(W_IN + 0.03, 0, 5.60); add(pg);
    plaque(pg, "GARAGE", "mind your head");
  })();
  [gSlab, gKnob].forEach(function (m) {
    tag(m, "the garage door", function () { enterGarage(); },
      "the garage — one car, a workbench, and everything that didn't fit. click to go in");
  });
  // the way back: an invisible hitbox in the opening, garage side
  var gBackHit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.0, 1.0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  gBackHit.position.set(W_IN - 0.15, 1.03, 5.60); add(gBackHit);
  clickable(gBackHit, "the hallway", function () { leaveGarage(); }, "back to the hall");
  gBackHit.userData.space = "garage";

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
  // ⚠️ and the casing is gone too (Kyle: "remove the laundry leaf on the wall
  // completely"). The leaves went first, then their frame — which was still a pale
  // 2.08m slab standing on the wall doing the same job of interrupting the run. The
  // laundry is simply an alcove now: appliances, a basket, and a sock.
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
  // ⚠️ z 6.30 (Kyle: slide it over) and THE BOOTS ARE NOT HERE ANY MORE — they moved
  // into the closet, which is where shoes by a back door actually go. What's left is
  // the wall-mounted half: the hook rail, the leash, and the dog bowl on the floor.
  // The rail sits at y 1.6 and the leash hangs to 1.14, both clear over the dryer
  // (0.9 tall) that this now overlaps in plan.
  var mudG = new THREE.Group(); mudG.position.set(E_IN - 0.26, 0, 6.30); add(mudG);
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

  /* ---- THE GARAGE, INSIDE -------------------------------------------------------
   * One car, a workbench, and everything that didn't fit — the hint was already
   * true, it just needed the room built behind it. The interior lives inside the
   * exterior shell's footprint (x -12.10..-7.60, z 4.35..8.45) with its own
   * inward-facing walls, because the exterior box's faces are front-side only and
   * simply don't exist from in here.
   * Floor at y 0 like the hall — the kid walks in here too, and he has no idea
   * what a step down is. Ceiling at 2.05: garages are low, and it makes the roll
   * door's track believable. */
  var garWallT = canvasTex(128, 128, function (c, w, h) {
    c.fillStyle = "#a8a396"; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(0,0,0,0.07)"; c.fillRect(0, h * 0.62, w, 3);   // the drywall seam
    for (var i = 0; i < 14; i++) {                                     // years of scuffs
      c.fillStyle = "rgba(60,56,48," + (0.04 + (i % 3) * 0.02) + ")";
      c.fillRect((i * 37) % w, (i * 53) % h, 5 + (i % 4) * 3, 2 + (i % 3));
    }
  });
  garWallT.wrapS = garWallT.wrapT = THREE.RepeatWrapping; garWallT.repeat.set(3, 1);
  var garWallM = new THREE.MeshStandardMaterial({ map: garWallT, roughness: 0.95 });
  var garFloorT = canvasTex(256, 256, function (c, w, h) {
    c.fillStyle = "#8e8c86"; c.fillRect(0, 0, w, h);
    for (var i = 0; i < 240; i++) {                                    // concrete mottle
      c.fillStyle = "rgba(" + (i % 2 ? "255,255,255" : "40,40,44") + "," + (0.025 + (i % 5) * 0.008) + ")";
      c.fillRect((i * 71) % w, (i * 97) % h, 2 + (i % 5), 2 + (i % 3));
    }
    c.strokeStyle = "rgba(40,40,44,0.5)"; c.lineWidth = 2;             // expansion grooves
    c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
    c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    c.strokeStyle = "rgba(30,30,34,0.4)"; c.lineWidth = 1;             // one honest crack
    c.beginPath(); c.moveTo(w * 0.15, h * 0.9); c.lineTo(w * 0.3, h * 0.62); c.lineTo(w * 0.34, h * 0.4); c.stroke();
  });
  var garFloorM = new THREE.MeshStandardMaterial({ map: garFloorT, roughness: 0.98 });
  var benchM = mat(0x8a6f4a, 0.85), steelM = new THREE.MeshStandardMaterial({ color: 0x454b52, roughness: 0.4, metalness: 0.6 });
  function gtag(m, name, action, hint) { clickable(m, name, action, hint); m.userData.space = "garage"; return m; }
  // shell
  var gFloor = box(4.50, 0.10, 4.10, garFloorM); gFloor.position.set(-9.85, -0.05, 6.40); add(gFloor);
  gtag(gFloor, "the garage floor", null, "bare concrete. it remembers every project.");
  var gCeil = box(4.50, 0.08, 4.10, mat(0x8f7b5e, 0.95)); gCeil.position.set(-9.85, 2.09, 6.40); add(gCeil);
  [5.4, 7.4].forEach(function (jz) {
    var joist = box(4.50, 0.09, 0.14, mat(0x5e4c38, 0.9)); joist.position.set(-9.85, 2.00, jz); add(joist);
  });
  var gwW = box(0.12, 2.05, 4.10, garWallM); gwW.position.set(-12.04, 1.025, 6.40); add(gwW);
  var gwS = box(4.50, 2.05, 0.12, garWallM); gwS.position.set(-9.85, 1.025, 8.39); add(gwS);
  // ⚠️ 0.24 thick, centred -7.70: the exterior shell's inward face sits at -7.75,
  // and a 0.12 wall at -7.66 left that face 3cm PROUD of the drywall — the whole
  // east side of the room rendered as exterior siding. The interior wall has to
  // swallow the shell's face, not stand behind it.
  [[0.73, 4.715], [2.33, 7.285]].forEach(function (p) {   // east wall, split around the man door
    var seg = box(0.24, 2.05, p[0], garWallM); seg.position.set(-7.70, 1.025, p[1]); add(seg);
  });
  var gwN = box(1.10, 2.05, 0.12, garWallM); gwN.position.set(-8.15, 1.025, 4.41); add(gwN);
  var gwNh = box(3.40, 0.20, 0.12, garWallM); gwNh.position.set(-10.40, 1.95, 4.41); add(gwNh);
  // ⚠️ the sill's top is BURIED 2cm inside the floor slab, not flush with it — at a
  // shared y 0 the two top faces were coplanar across the whole opening strip,
  // which is the baseboard-flashing bug all over again.
  var gSill = box(3.40, 0.40, 0.10, garFloorM); gSill.position.set(-10.40, -0.28, 4.41); add(gSill);
  var gThresh = box(0.46, 0.04, 1.04, mat(0x6b5638, 0.85)); gThresh.position.set(-7.62, 0.0, 5.60); add(gThresh);
  /* ---- the big door: four real panels on a track. It opens. --------------------
   * Lives in yardG so the SAME door reads from the driveway and from inside —
   * one door, one truth, like the truck. applyRoll walks each panel along a
   * vertical run, round the bend, and back along the ceiling. */
  var panT = canvasTex(64, 32, function (c, w, h) {
    c.fillStyle = "#b9bcb4"; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(255,255,255,0.18)"; c.fillRect(0, 2, w, 3);
    c.fillStyle = "rgba(40,44,40,0.45)"; c.fillRect(0, h - 4, w, 4);
    c.strokeStyle = "rgba(40,44,40,0.3)"; c.lineWidth = 2; c.strokeRect(6, 7, w * 0.42 - 8, h - 14); c.strokeRect(w * 0.5 + 2, 7, w * 0.42 - 8, h - 14);
  });
  var panM = new THREE.MeshStandardMaterial({ map: panT, roughness: 0.7 });
  var rollPanels = [], ROLL_C0 = [-0.1625, 0.4125, 0.9875, 1.5625];  // closed panel centres
  for (var rp = 0; rp < 4; rp++) {
    var pg2 = new THREE.Group(); pg2.position.set(-10.40, ROLL_C0[rp], 4.30); yadd(pg2);
    var pb = box(3.36, 0.555, 0.05, panM); pg2.add(pb);
    if (rp === 0) { var hdl = box(0.22, 0.05, 0.04, steelM); hdl.position.set(0, -0.16, 0.05); pg2.add(hdl); }
    gtag(pb, "the big door", function () { toggleRoll(); },
      "the big door — years of WD-40 say it still rolls");
    rollPanels.push(pg2);
  }
  [[-12.06, 0.95, 4.44, 0.05, 1.75, 0.06], [-8.74, 0.95, 4.44, 0.05, 1.75, 0.06],
   [-12.06, 1.70, 5.75, 0.05, 0.06, 2.60], [-8.74, 1.70, 5.75, 0.05, 0.06, 2.60]]
    .forEach(function (tr) {
      var t2 = box(tr[3], tr[4], tr[5], steelM); t2.position.set(tr[0], tr[1], tr[2]); add(t2);
    });
  var rollA = 0, rollTarget = 0;
  function applyRoll(a) {
    for (var i = 0; i < 4; i++) {
      var t3 = ROLL_C0[i] + a * 2.7, p3 = rollPanels[i];
      if (t3 <= 1.56) { p3.position.y = t3; p3.position.z = 4.30; p3.rotation.x = 0; }
      else {
        // ⚠️ the horizontal run tops out at y 1.62, NOT higher: the interior header
        // hangs from 1.85, and a 0.575 panel pivoting mid-bend sweeps ~0.2 above its
        // own centre — cap it here and the sweep peaks at 1.83, just under the wood.
        var e = t3 - 1.56;
        p3.rotation.x = Math.min(1, e / 0.45) * (Math.PI / 2);
        p3.position.y = Math.min(1.56 + e * 0.5, 1.62);
        p3.position.z = 4.30 + Math.max(0, e - 0.12);
      }
    }
  }
  function toggleRoll() {
    rollTarget = rollTarget > 0.5 ? 0 : 1;
    AUDIO.ratchetSfx && AUDIO.ratchetSfx();
  }
  // --- the workbench, and the wall of intentions above it
  var bTop = box(0.60, 0.07, 2.20, benchM); bTop.position.set(-11.70, 0.90, 6.30); add(bTop);
  gtag(bTop, "the workbench", null, "the workbench. every scar on it was a Saturday.");
  [[-11.94, 5.28], [-11.46, 5.28], [-11.94, 7.32], [-11.46, 7.32]].forEach(function (lp) {
    var leg = box(0.09, 0.86, 0.09, mat(0x6b5638, 0.9)); leg.position.set(lp[0], 0.43, lp[1]); add(leg);
  });
  var bShelf = box(0.56, 0.04, 2.00, mat(0x6b5638, 0.9)); bShelf.position.set(-11.70, 0.28, 6.30); add(bShelf);
  var oilCan = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), mat(0x3a5e3a, 0.6));
  oilCan.position.set(-11.72, 0.38, 5.70); add(oilCan);
  var bCrate = box(0.34, 0.22, 0.30, mat(0x8a6a44, 0.9)); bCrate.position.set(-11.70, 0.41, 6.90); add(bCrate);
  // the vice, which has outlived three of everything else
  var vBase = box(0.16, 0.08, 0.12, steelM); vBase.position.set(-11.70, 0.975, 5.42); add(vBase);
  [[5.35], [5.49]].forEach(function (vj) {
    var jaw = box(0.14, 0.10, 0.05, steelM); jaw.position.set(-11.70, 1.06, vj[0]); add(jaw);
  });
  var vScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.20, 8), steelM);
  vScrew.rotation.x = Math.PI / 2; vScrew.position.set(-11.70, 1.02, 5.60); add(vScrew);
  var vHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), steelM);
  vHandle.position.set(-11.70, 1.02, 5.70); add(vHandle);
  gtag(vBase, "the vice", null, "the vice. it has held pipes, pinewood, and one very sorry walkman.");
  // the bench project — what's clamped mid-build is the coffee can's business
  function projGroup() { var g7 = new THREE.Group(); g7.position.set(-11.68, 0.935, 6.55); add(g7); return g7; }
  var bpBird = projGroup();
  var bhBody = box(0.16, 0.16, 0.14, mat(0xa88a5e, 0.9)); bhBody.position.y = 0.08; bpBird.add(bhBody);
  [[-0.045, 0.19], [0.045, 0.19]].forEach(function (r5, i5) {
    var ro = box(0.11, 0.02, 0.16, mat(0x7a5c38, 0.9)); ro.position.set(r5[0], r5[1], 0); ro.rotation.z = i5 ? -0.6 : 0.6; bpBird.add(ro);
  });
  var bhHole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 10), mat(0x241b12, 0.9));
  bhHole.rotation.x = Math.PI / 2; bhHole.position.set(0, 0.09, 0.075); bpBird.add(bhHole);
  var bpDerby = projGroup();
  var dbody = box(0.07, 0.035, 0.24, mat(0xb03a2e, 0.55)); dbody.position.y = 0.045; bpDerby.add(dbody);
  var dnose = box(0.07, 0.02, 0.10, mat(0xb03a2e, 0.55)); dnose.position.set(0, 0.065, -0.05); bpDerby.add(dnose);
  [[-0.045, 0.08], [0.045, 0.08], [-0.045, -0.08], [0.045, -0.08]].forEach(function (dw) {
    var wl = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8), mat(0x1d1f22, 0.8));
    wl.rotation.z = Math.PI / 2; wl.position.set(dw[0], 0.018, dw[1]); bpDerby.add(wl);
  });
  var bpRocket = projGroup();
  var rkB = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 10), mat(0xe4e0d2, 0.6));
  rkB.position.y = 0.12; bpRocket.add(rkB);
  var rkN = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 10), mat(0xb03a2e, 0.55));
  rkN.position.y = 0.28; bpRocket.add(rkN);
  for (var rf = 0; rf < 3; rf++) {
    var fin = box(0.015, 0.07, 0.05, mat(0xb03a2e, 0.55));
    var fa = rf / 3 * Math.PI * 2;
    fin.position.set(Math.cos(fa) * 0.04, 0.035, Math.sin(fa) * 0.04); fin.rotation.y = -fa; bpRocket.add(fin);
  }
  bpDerby.visible = bpRocket.visible = false;
  [bpBird, bpDerby, bpRocket].forEach(function (bp) {
    bp.children.forEach(function (m) { gtag(m, "the project", null, "the bench project. it is nearly done. it has been nearly done for a while."); });
  });
  // THE COFFEE CAN OF BOLTS — the garage keeps its opinions in here (the stash)
  var canG = new THREE.Group(); canG.position.set(-11.72, 0.935, 7.15); add(canG);
  var canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 14), mat(0xa83226, 0.6));
  canBody.position.y = 0.075; canG.add(canBody);
  var canLid = new THREE.Mesh(new THREE.CylinderGeometry(0.071, 0.071, 0.015, 14), mat(0xc8c2b2, 0.5));
  canLid.position.y = 0.155; canG.add(canLid);
  var canLbl = new THREE.Mesh(new THREE.CylinderGeometry(0.0705, 0.0705, 0.07, 14),
    new THREE.MeshStandardMaterial({ map: canvasTex(128, 32, function (c, w, h) {
      c.fillStyle = "#e8e0cc"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#3a3020"; c.font = "bold 20px Georgia, serif"; c.textAlign = "center";
      c.fillText("B O L T S", w / 2, 23);
    }), roughness: 0.8 }));
  canLbl.position.y = 0.08; canG.add(canLbl);
  for (var bnum = 0; bnum < 3; bnum++) {
    var bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.045, 6), steelM);
    bolt.rotation.z = Math.PI / 2; bolt.rotation.y = bnum * 1.1;
    bolt.position.set(0.10 + bnum * 0.035, 0.008, 0.05 - bnum * 0.04); canG.add(bolt);
  }
  // --- pegboard: every tool gets an outline, so it can be missed properly
  var pegT = canvasTex(256, 128, function (c, w, h) {
    c.fillStyle = "#c9a86b"; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(60,48,30,0.5)";
    for (var px = 8; px < w; px += 12) for (var py = 8; py < h; py += 12) { c.beginPath(); c.arc(px, py, 1.6, 0, 7); c.fill(); }
    c.strokeStyle = "rgba(250,248,240,0.85)"; c.lineWidth = 3;
    function outline(x0) { c.strokeRect(x0, 30, 10, 62); }               // handle silhouettes
    outline(48); c.strokeRect(38, 18, 30, 16);                            // hammer head
    outline(108); c.beginPath(); c.arc(113, 24, 12, 0, 7); c.stroke();    // wrench ring
    outline(168); c.strokeRect(158, 90, 30, 18);                          // saw grip
    c.beginPath(); c.arc(225, 55, 14, 0, 7); c.stroke();                  // the missing socket
    c.font = "10px Georgia, serif"; c.fillStyle = "rgba(250,248,240,0.7)"; c.textAlign = "center";
    c.fillText("10mm", 225, 85);
  });
  var pegB = box(0.02, 0.85, 2.10, new THREE.MeshStandardMaterial({ map: pegT, roughness: 0.9 }));
  pegB.position.set(-11.96, 1.52, 6.30); add(pegB);
  gtag(pegB, "the pegboard", null, "every tool has a painted outline so it can be missed properly. the 10mm has been missing since 1996.");
  // three of the four tools are even where they belong
  var hamH = box(0.03, 0.30, 0.05, benchM); hamH.position.set(-11.92, 1.48, 5.85); add(hamH);
  var hamHd = box(0.05, 0.09, 0.13, steelM); hamHd.position.set(-11.92, 1.66, 5.85); add(hamHd);
  var wrH = box(0.025, 0.28, 0.06, steelM); wrH.position.set(-11.92, 1.50, 6.30); add(wrH);
  var wrRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.016, 6, 12), steelM);
  wrRing.rotation.y = Math.PI / 2; wrRing.position.set(-11.92, 1.70, 6.30); add(wrRing);
  var sawB = box(0.015, 0.36, 0.10, steelM); sawB.position.set(-11.92, 1.42, 6.72); add(sawB);
  var sawH = box(0.03, 0.12, 0.09, benchM); sawH.position.set(-11.92, 1.66, 6.72); add(sawH);
  [hamH, hamHd, wrH, wrRing, sawB, sawH].forEach(function (m) {
    gtag(m, "the tools", null, "hammer, wrench, saw. present and accounted for.");
  });
  // --- shelves on the south wall, and the dad trick: jars screwed to the plank by their lids
  [[1.15], [1.70]].forEach(function (sy) {
    var plank = box(3.00, 0.05, 0.28, mat(0x6b5638, 0.9)); plank.position.set(-10.30, sy[0], 8.24); add(plank);
    [-11.6, -10.3, -9.0].forEach(function (bx2) {
      var br = box(0.04, 0.16, 0.22, steelM); br.position.set(bx2, sy[0] - 0.10, 8.30); add(br);
    });
  });
  [[-11.45, 0xb8b2a4], [-11.05, 0xb8b2a4], [-10.65, 0x8a4a3a]].forEach(function (pc2) {
    var can2 = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.20, 12), mat(pc2[1], 0.55));
    can2.position.set(pc2[0], 1.825, 8.24); add(can2);
    gtag(can2, "the paint cans", null, "one of these is the touch-up for the hall. nobody remembers which.");
  });
  [[-10.15, 0xc03a30], [-9.95, 0x3a68b0]].forEach(function (sc2) {
    var spr = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 10), mat(0xd8d2c0, 0.4));
    spr.position.set(sc2[0], 1.815, 8.24); add(spr);
    var cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), mat(sc2[1], 0.5));
    cap2.position.set(sc2[0], 1.92, 8.24); add(cap2);
  });
  var jarGlass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.25, transparent: true, opacity: 0.72 });
  for (var jn = 0; jn < 4; jn++) {
    var jar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 10), jarGlass);
    jar.position.set(-9.6 + jn * 0.24, 1.605, 8.24); add(jar);
    gtag(jar, "the screw jars", null, "jars screwed to the shelf by their lids. the single greatest idea any dad has ever had.");
  }
  [[-9.4, 1.325, "XMAS"], [-8.95, 1.325, "CABLES"]].forEach(function (bx3) {
    var cb = box(0.36, 0.30, 0.26, mat(0xb08d5a, 0.92)); cb.position.set(bx3[0], bx3[1], 8.24); add(cb);
    // ⚠️ MeshStandard, not Basic: an unlit label renders full-bright and reads as a
    // backlit sign in a dark garage (captured — XMAS glowed like a marquee)
    var lb = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.10),
      new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(96, 40, function (c, w, h) {
        c.fillStyle = "#d8cfc0"; c.fillRect(0, 0, w, h);
        c.fillStyle = "#4a3a26"; c.font = "bold 17px Georgia, serif"; c.textAlign = "center";
        c.fillText(bx3[2], w / 2, 27);
      }) }));
    lb.rotation.y = Math.PI; lb.position.set(bx3[0], bx3[1], 8.10); add(lb);
  });
  // --- the project, under its tarp, which is where projects live
  var carPrimM = mat(0x7d8085, 0.9);
  var carBodyG = new THREE.Group(); carBodyG.position.set(-9.55, 0, 6.75); add(carBodyG);
  var pcB = box(1.60, 0.46, 3.20, carPrimM); pcB.position.y = 0.62; carBodyG.add(pcB);
  var pcC = box(1.44, 0.40, 1.60, carPrimM); pcC.position.set(0, 1.02, 0.15); carBodyG.add(pcC);
  var pcW = box(1.30, 0.26, 1.50, mat(0x22282e, 0.3)); pcW.position.set(0, 1.05, 0.15); carBodyG.add(pcW);
  var pcFender = box(0.10, 0.30, 0.85, mat(0xc05a3a, 0.6)); pcFender.position.set(-0.78, 0.55, -1.0); carBodyG.add(pcFender);
  carBodyG.children.forEach(function (m) {
    gtag(m, "the project car", null, "primer, one red fender, and a promise.");
  });
  carBodyG.visible = false;
  [[-0.72, -1.15], [0.72, -1.15], [-0.72, 1.15], [0.72, 1.15]].forEach(function (tp) {
    var ty = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.22, 12), mat(0x1a1c1e, 0.85));
    ty.rotation.z = Math.PI / 2; ty.position.set(-9.55 + tp[0], 0.30, 6.75 + tp[1]); add(ty);
  });
  // ⚠️ the first tarp was untextured boxes and photographed as a navy SHIPPING
  // CRATE — the single worst thing in the room. Fold lines and hem shadow live in
  // the MAP; the map is drawn in white so material.color still tints it and the
  // coffee can's colour options keep working (color MULTIPLIES the map — the rule).
  var tarpT = canvasTex(256, 128, function (c, w, h) {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h);
    for (var f2 = 0; f2 < 9; f2++) {                       // slack folds, roughly diagonal
      c.strokeStyle = "rgba(30,34,44," + (0.10 + (f2 % 3) * 0.05) + ")";
      c.lineWidth = 2 + (f2 % 2);
      c.beginPath();
      c.moveTo((f2 * 37) % w, 0);
      c.quadraticCurveTo((f2 * 37) % w + 26, h * 0.5, (f2 * 41) % w, h);
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1;   // highlight beside each crease
      c.beginPath();
      c.moveTo((f2 * 37) % w + 4, 0);
      c.quadraticCurveTo((f2 * 37) % w + 30, h * 0.5, (f2 * 41) % w + 4, h);
      c.stroke();
    }
    c.fillStyle = "rgba(20,22,28,0.28)"; c.fillRect(0, h - 12, w, 12);  // hem shadow
  });
  tarpT.wrapS = tarpT.wrapT = THREE.RepeatWrapping; tarpT.repeat.set(2, 1);
  var tarpM = new THREE.MeshStandardMaterial({ map: tarpT, color: 0x5d7089, roughness: 0.95 });
  var tarpG = new THREE.Group(); tarpG.position.set(-9.55, 0, 6.75); add(tarpG);
  // lower and more stepped than the first try: hood, roof, deck — a car shape, draped
  var tpMain = box(1.80, 0.44, 3.42, tarpM); tpMain.position.y = 0.62; tarpG.add(tpMain);
  var tpHood = box(1.70, 0.16, 1.05, tarpM); tpHood.position.set(0, 0.92, -1.05); tarpG.add(tpHood);
  var tpHump = box(1.46, 0.40, 1.55, tarpM); tpHump.position.set(0, 1.04, 0.35); tarpG.add(tpHump);
  var tpSkirt = box(1.92, 0.26, 3.54, tarpM); tpSkirt.position.y = 0.34; tarpG.add(tpSkirt);
  [[-0.90, -1.70, 0.22], [0.90, -1.70, -0.22], [-0.90, 1.70, -0.22], [0.90, 1.70, 0.22]].forEach(function (sk) {
    var flap = box(0.32, 0.30, 0.05, tarpM);
    flap.position.set(sk[0], 0.30, sk[1]); flap.rotation.x = sk[2]; flap.rotation.y = 0.4 * (sk[0] > 0 ? -1 : 1); tarpG.add(flap);
  });
  tarpG.children.forEach(function (m) {
    gtag(m, "the project", null, "under that tarp is the project. it will run again. this has been true for eleven years.");
  });
  var oilT = canvasTex(128, 96, function (c, w, h) {
    var g8 = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g8.addColorStop(0, "rgba(24,22,20,0.62)"); g8.addColorStop(0.7, "rgba(24,22,20,0.30)"); g8.addColorStop(1, "rgba(24,22,20,0)");
    c.fillStyle = g8; c.fillRect(0, 0, w, h);
  });
  // ⚠️ polygonOffset, not a raised y — the contact-shadow lesson. A decal at a fixed
  // height over a floor it doesn't own is how you get an invisible stain.
  var oilStain = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.75),
    new THREE.MeshBasicMaterial({ map: oilT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  oilStain.rotation.x = -Math.PI / 2; oilStain.position.set(-9.55, 0.006, 5.45); oilStain.renderOrder = 1; add(oilStain);
  gtag(oilStain, "the oil stain", null, "the car marks its territory.");
  // --- the rest of any honest garage
  var bikeM = mat(0x2b3a8c, 0.6);
  [[1.70], [1.02]].forEach(function (bw) {
    var wh2 = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 18), mat(0x1d1f22, 0.8));
    wh2.position.set(-8.20, bw[0], 8.26); add(wh2);
  });
  var bkFrame1 = box(0.055, 0.56, 0.055, bikeM); bkFrame1.position.set(-8.20, 1.36, 8.26); bkFrame1.rotation.z = 0.24; add(bkFrame1);
  var bkFrame2 = box(0.055, 0.44, 0.055, bikeM); bkFrame2.position.set(-8.27, 1.26, 8.26); bkFrame2.rotation.z = -0.38; add(bkFrame2);
  var bkCross = box(0.055, 0.34, 0.055, bikeM); bkCross.position.set(-8.13, 1.30, 8.26); bkCross.rotation.z = 0.9; add(bkCross);
  var bkSeat = box(0.16, 0.05, 0.07, mat(0x1d1f22, 0.7)); bkSeat.position.set(-8.34, 1.44, 8.26); add(bkSeat);
  var bkBars = box(0.32, 0.045, 0.06, steelM); bkBars.position.set(-8.16, 1.94, 8.26); add(bkBars);
  var bkHook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 10), steelM);
  bkHook.position.set(-8.20, 2.02, 8.26); add(bkHook);
  [bkFrame1, bkFrame2, bkBars].forEach(function (m) {
    gtag(m, "the bike", null, "hung up for winter in 1997. it is beginning to suspect.");
  });
  var leanG = new THREE.Group(); leanG.position.set(-11.86, 0, 4.72); add(leanG);
  [[0, 0x6b5638, "rake"], [0.22, 0x8a8f96, "shovel"], [0.44, 0xb8a06a, "broom"]].forEach(function (ln2, i6) {
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.5, 8), mat(0x8a6f4a, 0.9));
    pole.position.set(0.05, 0.75, ln2[0]); pole.rotation.x = 0.05; pole.rotation.z = -0.13; leanG.add(pole);
    var head = box(i6 === 0 ? 0.03 : 0.16, i6 === 0 ? 0.30 : 0.20, i6 === 2 ? 0.10 : 0.03, mat(ln2[1], 0.85));
    head.position.set(0.14, i6 === 2 ? 0.10 : 0.14, ln2[0]); leanG.add(head);
  });
  leanG.children.forEach(function (m) {
    gtag(m, "the leaning tools", null, "rake, shovel, push broom. the order changes; the leaning doesn't.");
  });
  var dartT = canvasTex(96, 96, function (c, w, h) {
    ["#2b2e33", "#c8c2b2", "#a83226", "#c8c2b2", "#2f5e3a"].forEach(function (col, ri) {
      c.fillStyle = col; c.beginPath(); c.arc(w / 2, h / 2, 44 - ri * 9, 0, 7); c.fill();
    });
  });
  var dart = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 20),
    new THREE.MeshStandardMaterial({ map: dartT, roughness: 0.85 }));
  dart.rotation.z = Math.PI / 2; dart.position.set(-7.80, 1.30, 7.05); add(dart);
  gtag(dart, "the dartboard", null, "501, straight in, double out. nobody in this house has ever finished a game.");
  var pennT = new THREE.CanvasTexture(document.createElement("canvas"));
  pennT.image.width = 128; pennT.image.height = 48;
  pennT.colorSpace = THREE.SRGBColorSpace;
  function pennantDraw(bg, txt) {
    var c = pennT.image.getContext("2d");
    c.clearRect(0, 0, 128, 48);
    c.fillStyle = bg; c.beginPath(); c.moveTo(0, 0); c.lineTo(128, 24); c.lineTo(0, 48); c.closePath(); c.fill();
    c.fillStyle = "rgba(250,246,232,0.92)"; c.font = "bold 13px Georgia, serif";
    c.fillText(txt, 8, 29);
    pennT.needsUpdate = true;
  }
  pennantDraw("#2f5e3a", "HAZEL PARK");
  var penn = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.22),
    new THREE.MeshBasicMaterial({ map: pennT, transparent: true }));
  penn.rotation.y = -Math.PI / 2; penn.position.set(-7.79, 1.80, 7.05); add(penn);
  gtag(penn, "the pennant", null, "they were never good. that was never the point.");
  var frG = new THREE.Group(); frG.position.set(-8.14, 0, 7.90); add(frG);
  var frBody = box(0.62, 1.30, 0.60, mat(0xe8eae6, 0.5)); frBody.position.y = 0.71; frG.add(frBody);
  var frBase = box(0.62, 0.08, 0.60, mat(0x2b2e33, 0.8)); frBase.position.y = 0.04; frG.add(frBase);
  var frHandle = box(0.03, 0.5, 0.05, mat(0xc4c8c4, 0.4)); frHandle.position.set(-0.33, 0.85, -0.20); frG.add(frHandle);
  [[0.55, 0xc03a30], [0.72, 0x3a68b0], [0.93, 0xe0b03a]].forEach(function (mg) {
    var m2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8), mat(mg[1], 0.4));
    m2.rotation.z = Math.PI / 2; m2.position.set(-0.315, mg[0], 0.08); frG.add(m2);
  });
  frG.children.forEach(function (m) {
    gtag(m, "the garage fridge", null, "the garage fridge. it has held exactly: pop, film, and one birthday cake overflow. summer lives in here.");
  });
  [[0.36, 0.11, 0.28, 0.055], [0.34, 0.10, 0.26, 0.165]].forEach(function (np) {
    var st3 = box(np[0], np[1], np[2], mat(0xcfc8b4, 0.95)); st3.position.set(-8.05, np[3], 7.30); add(st3);
    gtag(st3, "the newspapers", null, "tied and ready for a paper drive that stopped happening in 1998.");
  });
  // the bare bulb, and the clack it answers to
  var garOn = true;
  var gShade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.10, 14, 1, true), mat(0x3a5e3a, 0.6));
  gShade.position.set(-9.60, 1.93, 6.20); add(gShade);
  var gBulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 1.6, roughness: 0.4 }));
  gBulb.position.set(-9.60, 1.85, 6.20); add(gBulb);
  var gChain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 6), mat(0xd8d2c0, 0.8));
  gChain.position.set(-9.51, 1.78, 6.20); add(gChain);
  var gBead = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), mat(0xd8d2c0, 0.7));
  gBead.position.set(-9.51, 1.66, 6.20); add(gBead);
  var garLite = new THREE.PointLight(0xffe0b0, 1.7, 6.5, 1.9);
  garLite.position.set(-9.60, 1.80, 6.20); add(garLite);
  function togGarLight() { garOn = !garOn; AUDIO.clickSfx && AUDIO.clickSfx(garOn ? 1200 : 700); }
  [gChain, gBead, gBulb].forEach(function (m) { gtag(m, "the pull chain", togGarLight, "the pull chain — clack."); });

  /* ---- THE BASEMENT ---------------------------------------------------------------
   * The den. Wood paneling on two walls, block on the other two, joists and duct
   * overhead, a lally column holding the whole house up, and the good furniture
   * that got demoted: plaid couch, CRT on a wheeled cart, ping-pong table, the
   * record console, an exercise bike facing the wall in shame. The cold green
   * glow the hall promised for months is the AQUARIUM — the light down there
   * really did already work.
   * Footprint: under the hall and the bedroom (x -7.4..3.3, z -2.4..4.6), floor
   * at -2.42, ceiling hung at -0.10 just under the hall floor. Everything is in
   * `g`, so it gates with the hall; all three lights are distance-capped so they
   * cannot climb through the floor and re-light the corridor. */
  var bstag = function (m, name, action, hint) { clickable(m, name, action, hint); m.userData.space = "basement"; return m; };
  var BSM = { x0: -7.40, x1: 3.30, z0: -2.40, z1: 4.60, fl: -2.42, ce: -0.10 };
  var panelT = canvasTex(128, 128, function (c, w, h) {
    c.fillStyle = "#7a5a38"; c.fillRect(0, 0, w, h);
    for (var pv = 0; pv < w; pv += 16) {                    // vertical plank grooves
      c.fillStyle = "rgba(46,30,16,0.55)"; c.fillRect(pv, 0, 2, h);
      c.fillStyle = "rgba(255,220,170,0.07)"; c.fillRect(pv + 2, 0, 3, h);
    }
    for (var pg2 = 0; pg2 < 26; pg2++) {                    // grain flecks
      c.fillStyle = "rgba(40,26,12,0.18)";
      c.fillRect((pg2 * 37) % w, (pg2 * 53) % h, 1.5, 5 + (pg2 % 4) * 3);
    }
  });
  panelT.wrapS = panelT.wrapT = THREE.RepeatWrapping; panelT.repeat.set(4, 1);
  var panelM = new THREE.MeshStandardMaterial({ map: panelT, roughness: 0.85 });
  var cinderT = canvasTex(128, 128, function (c, w, h) {
    c.fillStyle = "#8a8c88"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(50,52,50,0.5)"; c.lineWidth = 2;
    for (var cy3 = 0; cy3 <= h; cy3 += 21) { c.beginPath(); c.moveTo(0, cy3); c.lineTo(w, cy3); c.stroke(); }
    for (var rw2 = 0; rw2 < 6; rw2++) for (var cx3 = ((rw2 % 2) ? 21 : 0); cx3 <= w; cx3 += 42) {
      c.beginPath(); c.moveTo(cx3, rw2 * 21); c.lineTo(cx3, rw2 * 21 + 21); c.stroke();
    }
  });
  cinderT.wrapS = cinderT.wrapT = THREE.RepeatWrapping; cinderT.repeat.set(3, 1.4);
  var cinderM = new THREE.MeshStandardMaterial({ map: cinderT, roughness: 0.97 });
  var bsFloorM = mat(0x77756e, 0.98);
  var bsFloor = box(BSM.x1 - BSM.x0, 0.10, BSM.z1 - BSM.z0, bsFloorM);
  bsFloor.position.set((BSM.x0 + BSM.x1) / 2, BSM.fl - 0.05, (BSM.z0 + BSM.z1) / 2); add(bsFloor);
  bstag(bsFloor, "the basement floor", null, "cold through socks. everyone knows, everyone forgets.");
  var BSH = BSM.ce - BSM.fl, BSY = (BSM.ce + BSM.fl) / 2;
  var bwN = box(BSM.x1 - BSM.x0, BSH, 0.12, cinderM); bwN.position.set((BSM.x0 + BSM.x1) / 2, BSY, BSM.z0 + 0.06); add(bwN);
  var bwW = box(0.12, BSH, BSM.z1 - BSM.z0, cinderM); bwW.position.set(BSM.x0 + 0.06, BSY, (BSM.z0 + BSM.z1) / 2); add(bwW);
  var bwS = box(BSM.x1 - BSM.x0, BSH, 0.12, panelM); bwS.position.set((BSM.x0 + BSM.x1) / 2, BSY, BSM.z1 - 0.06); add(bwS);
  var bwE = box(0.12, BSH, BSM.z1 - BSM.z0, panelM); bwE.position.set(BSM.x1 - 0.06, BSY, (BSM.z0 + BSM.z1) / 2); add(bwE);
  bstag(bwS, "the paneling", null, "real simulated wood. the finest kind.");
  // ceiling in three pieces around the stairwell notch, joists and a duct below it
  [[BSM.x0, BSM.x1, BSM.z0, 0.35], [BSM.x0, BSM.x1, 1.30, BSM.z1], [-6.55, BSM.x1, 0.35, 1.30]]
    .forEach(function (cp2) {
      var cs = box(cp2[1] - cp2[0], 0.08, cp2[3] - cp2[2], mat(0x241f1a, 0.98));
      cs.position.set((cp2[0] + cp2[1]) / 2, BSM.ce + 0.04, (cp2[2] + cp2[3]) / 2); add(cs);
    });
  [-1.2, 1.0, 3.2].forEach(function (jz2) {
    var js2 = box(BSM.x1 - BSM.x0, 0.09, 0.13, mat(0x3a2c1c, 0.95));
    js2.position.set((BSM.x0 + BSM.x1) / 2, BSM.ce - 0.05, jz2); add(js2);
  });
  var duct = box(BSM.x1 - BSM.x0 - 0.8, 0.26, 0.34, new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.4, metalness: 0.5 }));
  duct.position.set((BSM.x0 + BSM.x1) / 2 - 0.4, BSM.ce - 0.24, 2.15); add(duct);
  [[-0.62, 0x8a4a3a], [-0.50, 0x707880]].forEach(function (pp2) {
    var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, BSM.x1 - BSM.x0 - 0.4, 8),
      new THREE.MeshStandardMaterial({ color: pp2[1], roughness: 0.5, metalness: 0.4 }));
    pipe.rotation.z = Math.PI / 2; pipe.position.set((BSM.x0 + BSM.x1) / 2, BSM.ce - 0.16, pp2[0]); add(pipe);
  });
  var lally = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, BSH, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a2f2a, roughness: 0.5, metalness: 0.3 }));
  lally.position.set(-2.4, BSY, 2.2); add(lally);
  bstag(lally, "the pole", null, "holds the whole house up. also holds the record for being run into.");
  var stringer = box(0.08, 1.15, 2.45, panelM); stringer.position.set(-6.51, BSM.fl + 0.95, 1.55); add(stringer);
  // the den rug, couch, coffee table
  var rugT = canvasTex(128, 96, function (c, w, h) {
    c.fillStyle = "#5d3a2a"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(216,180,120,0.5)"; c.lineWidth = 5; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = "rgba(30,18,10,0.25)"; c.fillRect(w * 0.3, h * 0.28, w * 0.4, h * 0.44);
  });
  var bsRug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4),
    new THREE.MeshStandardMaterial({ map: rugT, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  bsRug.rotation.x = -Math.PI / 2; bsRug.position.set(0.7, BSM.fl + 0.006, 3.0); bsRug.renderOrder = 1; add(bsRug);
  var plaidM = mat(0x6e4a30, 0.95);
  var couchG = new THREE.Group(); couchG.position.set(0.6, BSM.fl, 4.02); add(couchG);
  var cBase = box(2.05, 0.42, 0.85, plaidM); cBase.position.y = 0.28; couchG.add(cBase);
  var cBack = box(2.05, 0.55, 0.24, plaidM); cBack.position.set(0, 0.72, 0.32); couchG.add(cBack);
  [[-1.06], [1.06]].forEach(function (ar2) {
    var arm2 = box(0.24, 0.36, 0.85, plaidM); arm2.position.set(ar2[0], 0.62, 0); couchG.add(arm2);
  });
  [-0.62, 0.05, 0.72].forEach(function (cu2) {
    var cush = box(0.6, 0.13, 0.72, mat(0x7d5638, 0.95)); cush.position.set(cu2, 0.54, -0.03); couchG.add(cush);
  });
  var afghan = box(0.72, 0.05, 0.55, mat(0x8a2f2a, 0.98));
  afghan.position.set(-0.55, 1.02, 0.30); afghan.rotation.x = -0.25; couchG.add(afghan);
  couchG.children.forEach(function (m) { bstag(m, "the couch", null, "it eats remotes. it has eaten three."); });
  var ctG = new THREE.Group(); ctG.position.set(0.6, BSM.fl, 2.92); add(ctG);
  var ctTop = box(1.05, 0.06, 0.55, mat(0x6b5638, 0.85)); ctTop.position.y = 0.40; ctG.add(ctTop);
  [[-0.46, -0.2], [0.46, -0.2], [-0.46, 0.2], [0.46, 0.2]].forEach(function (cl2) {
    var lg3 = box(0.06, 0.38, 0.06, mat(0x4a3524, 0.9)); lg3.position.set(cl2[0], 0.19, cl2[1]); ctG.add(lg3);
  });
  var bgBox = box(0.36, 0.06, 0.26, mat(0x3a68b0, 0.7)); bgBox.position.set(0.28, 0.46, 0.06); bgBox.rotation.y = 0.2; ctG.add(bgBox);
  bstag(bgBox, "the board game", null, "the rules are in the box. the ARGUMENTS are eternal.");
  // 🎲 THE CIGAR BOX — the den keeps its opinions in here
  var cigG = new THREE.Group(); cigG.position.set(0.15, BSM.fl + 0.43, 2.86); cigG.rotation.y = -0.25; add(cigG);
  var cigBody = box(0.26, 0.07, 0.17, mat(0x5e3a20, 0.75)); cigBody.position.y = 0.035; cigG.add(cigBody);
  var cigLid = box(0.26, 0.02, 0.17, mat(0x7a4a2a, 0.7)); cigLid.position.set(0, 0.08, -0.012); cigLid.rotation.x = -0.12; cigG.add(cigLid);
  var cigBand = box(0.27, 0.03, 0.05, mat(0xe0b03a, 0.6)); cigBand.position.set(0, 0.045, 0.062); cigG.add(cigBand);
  // the TV cart, mid-room the way basement TVs are, screen at the couch
  var cartG = new THREE.Group(); cartG.position.set(0.6, BSM.fl, 1.62); add(cartG);
  [[0.36], [0.02]].forEach(function (sh2) {
    var shl = box(0.95, 0.05, 0.6, mat(0x2b2e33, 0.6)); shl.position.y = sh2[0] + 0.4; cartG.add(shl);
  });
  [[-0.43, -0.25], [0.43, -0.25], [-0.43, 0.25], [0.43, 0.25]].forEach(function (cp3) {
    var pst = box(0.05, 0.78, 0.05, mat(0x2b2e33, 0.6)); pst.position.set(cp3[0], 0.39, cp3[1]); cartG.add(pst);
    var whl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8), mat(0x1d1f22, 0.5));
    whl.rotation.z = Math.PI / 2; whl.position.set(cp3[0], 0.045, cp3[1]); cartG.add(whl);
  });
  var crt = box(0.66, 0.52, 0.56, mat(0x4a4438, 0.7)); crt.position.set(0, 1.05, -0.02); cartG.add(crt);
  var staticT = canvasTex(64, 64, function (c, w, h) {
    for (var sp2 = 0; sp2 < w * h / 2; sp2++) {
      var vv = 90 + Math.random() * 165 | 0;
      c.fillStyle = "rgb(" + vv + "," + vv + "," + vv + ")";
      c.fillRect(Math.random() * w | 0, Math.random() * h | 0, 1, 1);
    }
  });
  var crtScr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.40),
    new THREE.MeshStandardMaterial({ map: staticT, emissiveMap: staticT, color: 0x8a8f96,
      emissive: 0xbfc8d8, emissiveIntensity: 0.7, roughness: 0.3 }));
  crtScr.position.set(0, 1.06, 0.27); cartG.add(crtScr);
  var conSole = box(0.34, 0.07, 0.24, mat(0x3a3f45, 0.6)); conSole.position.set(0.02, 0.475, 0.12); cartG.add(conSole);
  [[-0.28, 0.9, 0x3a3f45], [0.18, 0.55, 0x3a3f45]].forEach(function (pd2) {
    var pad = box(0.13, 0.035, 0.09, mat(pd2[2], 0.5));
    pad.position.set(pd2[0], 0.045, 0.55); pad.rotation.y = pd2[1]; cartG.add(pad);
  });
  for (var kt2 = 0; kt2 < 3; kt2++) {
    var cart2 = box(0.12, 0.035, 0.16, mat([0x8a8f96, 0xb8934a, 0x4a6349][kt2], 0.6));
    cart2.position.set(-0.25 + kt2 * 0.06, 0.455 + kt2 * 0.037, -0.1); cart2.rotation.y = kt2 * 0.14; cartG.add(cart2);
  }
  var tvLite = new THREE.PointLight(0xbfd8e8, 0.55, 3.2, 1.9);
  tvLite.position.set(0.6, BSM.fl + 1.1, 2.1); add(tvLite);
  cartG.children.forEach(function (m) {
    bstag(m, "the TV", null, "channel 3, holding its breath. it is waiting for a player.");
  });
  // ping-pong, north half
  var ppG = new THREE.Group(); ppG.position.set(-2.1, BSM.fl, -0.75); add(ppG);
  var ppT = canvasTex(128, 76, function (c, w, h) {
    c.fillStyle = "#2f6a4a"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#e8e4d8"; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = "#e8e4d8"; c.fillRect(w / 2 - 1, 2, 2, h - 4);
  });
  var ppTop = box(2.45, 0.05, 1.36, new THREE.MeshStandardMaterial({ map: ppT, roughness: 0.7 }));
  ppTop.position.y = 0.76; ppG.add(ppTop);
  [[-1.1, -0.55], [1.1, -0.55], [-1.1, 0.55], [1.1, 0.55]].forEach(function (pl2) {
    var lg4 = box(0.07, 0.74, 0.07, mat(0x2b2e33, 0.6)); lg4.position.set(pl2[0], 0.37, pl2[1]); ppG.add(lg4);
  });
  var net = box(0.02, 0.14, 1.44, mat(0x1d1f22, 0.9)); net.position.y = 0.855; ppG.add(net);
  [[-0.7, 0.35, 0xb03a2e], [0.85, -0.3, 0x2b4a8c]].forEach(function (pdl) {
    var pad2 = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 10), mat(pdl[2], 0.6));
    pad2.position.set(pdl[0], 0.80, pdl[1]); ppG.add(pad2);
    var hdl = box(0.03, 0.02, 0.09, mat(0x8a6a44, 0.8)); hdl.position.set(pdl[0], 0.80, pdl[1] + (pdl[1] > 0 ? 0.12 : -0.12)); ppG.add(hdl);
  });
  var ppBall = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6), mat(0xf4efdd, 0.4));
  ppBall.position.set(0.3, 0.805, 0.1); ppG.add(ppBall);
  ppG.children.forEach(function (m) {
    bstag(m, "the ping-pong table", null, "best of five. best of seven. best of ELEVEN, fine.");
  });
  // the aquarium — the green light the hall has been promising for months
  var aqCab = box(0.9, 0.62, 0.42, mat(0x4a3524, 0.85)); aqCab.position.set(2.82, BSM.fl + 0.31, 2.55); add(aqCab);
  var aqGlass = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x9fd8c8, roughness: 0.1, transparent: true, opacity: 0.35 }));
  aqGlass.position.set(2.82, BSM.fl + 0.90, 2.55); add(aqGlass);
  var aqWater = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.4, 0.30),
    new THREE.MeshStandardMaterial({ color: 0x77d9a8, emissive: 0x3fae76, emissiveIntensity: 0.85, roughness: 0.3, transparent: true, opacity: 0.55 }));
  aqWater.position.set(2.82, BSM.fl + 0.87, 2.55); add(aqWater);
  var aqGravel = box(0.76, 0.05, 0.30, mat(0x6a5540, 0.95)); aqGravel.position.set(2.82, BSM.fl + 0.685, 2.55); add(aqGravel);
  var aqFish = [];
  [[0.2, 0.94, 0xe0713a], [-0.18, 0.82, 0xe0b03a]].forEach(function (ff2) {
    var fsh = box(0.06, 0.03, 0.015, mat(ff2[2], 0.5));
    fsh.position.set(2.82 + ff2[0], BSM.fl + ff2[1], 2.55); add(fsh); aqFish.push({ m: fsh, ph: ff2[0] * 9 });
  });
  var aqLite = new THREE.PointLight(0x77d9a8, 1.1, 3.4, 1.8);
  aqLite.position.set(2.82, BSM.fl + 1.05, 2.55); add(aqLite);
  [aqGlass, aqWater].forEach(function (m) {
    bstag(m, "the aquarium", null, "the cold green glow, explained. two fish, zero names that stuck.");
  });
  // the record console and its crate
  var rcG = new THREE.Group(); rcG.position.set(2.55, BSM.fl, 4.28); add(rcG);
  var rcBody = box(1.1, 0.55, 0.44, mat(0x5e4028, 0.8)); rcBody.position.y = 0.34; rcG.add(rcBody);
  [[-0.48], [0.48]].forEach(function (rl3) {
    var lg5 = box(0.05, 0.14, 0.05, mat(0x3a2c1c, 0.8)); lg5.position.set(rl3[0], 0.07, 0); rcG.add(lg5);
  });
  var platter = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 16), mat(0x1d1f22, 0.5));
  platter.position.set(-0.22, 0.625, 0); rcG.add(platter);
  var crate = box(0.42, 0.3, 0.34, mat(0x8a6a44, 0.9)); crate.position.set(0.85, 0.15, -0.02); rcG.add(crate);
  for (var rv2 = 0; rv2 < 5; rv2++) {
    var slv = box(0.02, 0.26, 0.26, mat([0xb03a2e, 0x2b4a8c, 0xe0b03a, 0x2f5e3a, 0x8a4a6a][rv2], 0.85));
    slv.position.set(0.72 + rv2 * 0.05, 0.32, -0.02); slv.rotation.z = 0.05 * rv2; rcG.add(slv);
  }
  rcG.children.forEach(function (m) { bstag(m, "the records", null, "side B of everything. the good side."); });
  // the exercise bike, facing the wall (the cigar box can grant it forgiveness)
  var bikeG2 = new THREE.Group(); bikeG2.position.set(2.62, BSM.fl, -1.72); bikeG2.rotation.y = Math.PI; add(bikeG2);
  var bkBase2 = box(0.7, 0.08, 0.22, mat(0x8a8f96, 0.5)); bkBase2.position.y = 0.06; bikeG2.add(bkBase2);
  var bkPost1 = box(0.07, 0.62, 0.07, mat(0x8a8f96, 0.5)); bkPost1.position.set(0.22, 0.38, 0); bikeG2.add(bkPost1);
  var bkPost2 = box(0.07, 0.5, 0.07, mat(0x8a8f96, 0.5)); bkPost2.position.set(-0.24, 0.32, 0); bikeG2.add(bkPost2);
  var bkSeat2 = box(0.2, 0.06, 0.14, mat(0x1d1f22, 0.7)); bkSeat2.position.set(-0.24, 0.60, 0); bikeG2.add(bkSeat2);
  var bkBars2 = box(0.1, 0.05, 0.34, mat(0x1d1f22, 0.7)); bkBars2.position.set(0.22, 0.72, 0); bikeG2.add(bkBars2);
  var bkWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14), mat(0x2b2e33, 0.5));
  bkWheel.rotation.z = Math.PI / 2; bkWheel.position.set(0.05, 0.24, 0); bikeG2.add(bkWheel);
  bikeG2.children.forEach(function (m) {
    bstag(m, "the exercise bike", null, "january's big idea. it faces the wall now, and it knows why.");
  });
  // utility corner: water heater, furnace, and the boxes that never made the move
  var whG = new THREE.Group(); whG.position.set(-6.62, BSM.fl, -1.62); add(whG);
  var whBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.55, 14), mat(0xd8d2c4, 0.6));
  whBody.position.y = 0.815; whG.add(whBody);
  var whCap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.3, 10), mat(0x9aa2ab, 0.5));
  whCap.position.y = 1.72; whG.add(whCap);
  whG.children.forEach(function (m) { bstag(m, "the water heater", null, "everyone's showers, single file."); });
  var furn = box(0.85, 1.15, 0.6, mat(0x707880, 0.6)); furn.position.set(-5.3, BSM.fl + 0.575, -1.85); add(furn);
  var fDuct = box(0.3, 0.75, 0.3, new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.4, metalness: 0.5 }));
  fDuct.position.set(-5.3, BSM.fl + 1.85, -1.85); add(fDuct);
  bstag(furn, "the furnace", null, "it kicks on like it's clearing its throat.");
  [[-6.85, 3.85, 0, "SCHOOL"], [-6.35, 3.95, 0.3, "MISC"]].forEach(function (bb2) {
    var bx4 = box(0.42, 0.34, 0.32, mat(0xb08d5a, 0.92)); bx4.position.set(bb2[0], BSM.fl + 0.17 + (bb2[2] ? 0 : 0), bb2[1]); bx4.rotation.y = bb2[2]; add(bx4);
    bstag(bx4, "the boxes", null, "sealed since the last house. opening them admits defeat.");
  });
  var rolled = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 10), mat(0x5d3a2a, 0.95));
  rolled.position.set(-7.15, BSM.fl + 0.8, 3.3); rolled.rotation.z = 0.06; add(rolled);
  bstag(rolled, "the rolled rug", null, "it will go somewhere someday. today it leans.");
  // posters on the paneling
  [[-1.4, "SPRING FLING '96", "#2b4a8c", "#f4efdd"], [-3.6, "LAKESIDE", "#2f5e3a", "#e8e4d8"]].forEach(function (po3) {
    var poT = canvasTex(96, 128, function (c, w, h) {
      c.fillStyle = po3[2]; c.fillRect(0, 0, w, h);
      c.strokeStyle = po3[3]; c.lineWidth = 3; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = po3[3]; c.font = "bold 13px Georgia, serif"; c.textAlign = "center";
      c.fillText(po3[1], w / 2, 34);
      c.beginPath(); c.moveTo(20, 96); c.lineTo(48, 60); c.lineTo(76, 96); c.closePath(); c.fill();
    });
    var pom = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.68),
      new THREE.MeshStandardMaterial({ map: poT, roughness: 0.9 }));
    pom.position.set(po3[0], BSM.fl + 1.55, BSM.z1 - 0.13); pom.rotation.y = Math.PI; pom.rotation.z = 0.02; add(pom);
    bstag(pom, "the posters", null, "load-bearing nostalgia.");
  });
  // the hopper window, high on the north wall — street level is up there
  var hopFrame = box(0.86, 0.44, 0.08, mat(0x4a4438, 0.8)); hopFrame.position.set(-4.5, BSM.ce - 0.45, BSM.z0 + 0.10); add(hopFrame);
  var hopGlass = box(0.74, 0.32, 0.03, new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.2 }));
  hopGlass.position.set(-4.5, BSM.ce - 0.45, BSM.z0 + 0.13); add(hopGlass);
  bstag(hopGlass, "the little window", null, "shins go by, sometimes. that's the whole channel.");
  // light: a warm floor lamp by the couch, and a bare bulb over the stairs
  var lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.35, 8), mat(0x8a6a44, 0.7));
  lampPole.position.set(1.85, BSM.fl + 0.675, 3.85); add(lampPole);
  var lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.24, 12, 1, true), mat(0xd8b46a, 0.8));
  lampShade.position.set(1.85, BSM.fl + 1.42, 3.85); add(lampShade);
  var bsLamp = new THREE.PointLight(0xffd9a0, 1.5, 4.6, 1.8);
  bsLamp.position.set(1.85, BSM.fl + 1.3, 3.85); add(bsLamp);
  bstag(lampShade, "the lamp", null, "the click of it is the sound of the evening starting.");
  var bsBulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 1.4, roughness: 0.4 }));
  bsBulb.position.set(-6.97, BSM.ce - 0.28, 2.35); add(bsBulb);
  var bsStairLite = new THREE.PointLight(0xffe0b0, 0.9, 3.6, 1.8);
  bsStairLite.position.set(-6.97, BSM.ce - 0.35, 2.35); add(bsStairLite);
  var bsUpHit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 1.3),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  bsUpHit.position.set(-6.9, BSM.fl + 0.95, 2.3); add(bsUpHit);
  clickable(bsUpHit, "the stairs up", function () { leaveBasement(); }, "back up to the hall — mind the low bit");
  bsUpHit.userData.space = "basement";
  // the den breathes: static crawls, fish patrol, the tank light sways
  function bsmTick(t) {
    if (crtOn) {
      staticT.offset.y = (t * 3.1) % 1;
      crtScr.material.emissiveIntensity = 0.62 + Math.sin(t * 23) * 0.08 + Math.sin(t * 7.3) * 0.05;
      tvLite.intensity = 0.5 + Math.sin(t * 19) * 0.08;
    }
    for (var af2 = 0; af2 < aqFish.length; af2++) {
      var fo2 = aqFish[af2];
      fo2.m.position.x = 2.82 + Math.sin(t * 0.5 + fo2.ph) * 0.28;
      fo2.m.rotation.y = Math.cos(t * 0.5 + fo2.ph) > 0 ? 0 : Math.PI;
    }
    if (aqLite.visible) aqLite.intensity = 1.1 + Math.sin(t * 1.3) * 0.12;
  }
  var crtOn = true;
  function setCrt(on3) {
    crtOn = !!on3;
    crtScr.material.emissiveIntensity = crtOn ? 0.7 : 0.0;
    crtScr.material.color.setHex(crtOn ? 0x8a8f96 : 0x14161a);
    tvLite.visible = crtOn;
  }
  function setTank(mode3) {   // 0 green · 1 blue · 2 lights out
    var col = mode3 === 1 ? 0x7fb4e8 : 0x77d9a8;
    aqLite.visible = mode3 !== 2;
    aqLite.color.setHex(col);
    aqWater.material.emissive.setHex(mode3 === 2 ? 0x0a201a : (mode3 === 1 ? 0x2f6a9c : 0x3fae76));
    aqWater.material.emissiveIntensity = mode3 === 2 ? 0.15 : 0.85;
  }
  function setAfghan(mode4) {  // 0 plaid red · 1 orange · 2 folded away
    afghan.visible = mode4 !== 2;
    afghan.material.color.setHex(mode4 === 1 ? 0xc4742a : 0x8a2f2a);
  }
  function setBike(faceTv) { bikeG2.rotation.y = faceTv ? 0.35 : Math.PI; }

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
      // locked entries are skipped by the cycler, so without this the player would
      // never learn there are more looks waiting behind the treasures
      if (o.note) {
        var n = o.note();
        if (n) html += "<div style='margin:-2px 0 6px;opacity:.5;font-size:11.5px'>" + n + "</div>";
      }
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
        o.i = nextUnlocked(o, o.i);
        o.vals[o.i].apply();
        st2.save();
        AUDIO.clickSfx && AUDIO.clickSfx(1400);
        renderStash(st2);
      });
    }
    // now that room.js is fully built, the treasure count is real: if a stored choice
    // is no longer owned (saves cleared, a new look added above your total), fall back
    // to "as found" before the panel can offer it as the current setting.
    st.opts.forEach(function (o) {
      if (o.locked && o.locked(o.i)) { o.i = 0; o.vals[0].apply(); st.save(); }
    });
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
                   sidingM, grassM, deckM, bFenceM, pdeckM,
                   garWallM, garFloorM, benchM, poolConcM, panelM];   // garage, pool deck, den paneling too
  var LOOK_BASE = LOOK_MATS.map(function (m) { return m.color.getHex(); });
  // `need` = treasures required, the same currency the bedroom's ROOM_THEMES spend.
  // The bedroom ladder tops out at 9 of 21; the house goes all the way to 21, so the
  // last look is the reward for a treasure from EVERY game in the house.
  var LOOKS = [
    { key: "asfound", name: "as found", icon: "🏚️", need: 0 },
    { key: "cabin",   name: "cozy cabin",   icon: "🔥", need: 0,  tint: 0xffa552, amt: 0.34, bulb: 0xffc07a },
    { key: "seaside", name: "seaside",      icon: "🌊", need: 3,  tint: 0x8ecbe6, amt: 0.30, bulb: 0xe4f2ff },
    { key: "harvest", name: "harvest",      icon: "🍂", need: 6,  tint: 0xd87a3a, amt: 0.26, bulb: 0xffcf96 },
    { key: "moonlit", name: "moonlit",      icon: "🌙", need: 10, tint: 0x7d95d4, amt: 0.38, bulb: 0xcfe0ff },
    { key: "greenhouse", name: "greenhouse", icon: "🌿", need: 14, tint: 0x8fc47a, amt: 0.24, bulb: 0xeaffd8 },
    { key: "firstlight", name: "first light", icon: "🌅", need: 18, tint: 0xffcf9a, amt: 0.30, bulb: 0xffe8c8 },
    { key: "midnight", name: "midnight",    icon: "🌌", need: 21, tint: 0x5a6bab, amt: 0.44, bulb: 0xc4d6ff },
  ];
  // how many of the room's treasures the player has earned; room.js owns the table,
  // so it hands us a reader rather than us duplicating twenty-one save conditions
  var treasures = ctx.treasures || function () { return 0; };
  function lookLocked(i) { return (LOOKS[i].need || 0) > treasures(); }
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
  // advance one step, then keep going past anything still locked. Bounded by the
  // list length, so an all-locked option can never spin forever — and index 0 of
  // every option is unlocked by construction, which is what makes that safe.
  function nextUnlocked(o, from) {
    var i = (from + 1) % o.vals.length;
    for (var n = 0; o.locked && o.locked(i) && n < o.vals.length; n++) i = (i + 1) % o.vals.length;
    return i;
  }
  function makeStash(key, title, opts) {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem("room-stash-" + key) || "{}"); } catch (e) { }
    opts.forEach(function (o) {
      o.i = (o.shared ? readShared(o.shared) : (saved[o.k] | 0)) % o.vals.length;
      // ⚠️ NO lock check here. Stashes are built during buildHallway, which room.js
      // calls long before its COLLECT table exists, so the treasure count reads 0 at
      // this moment for everyone — gating here would quietly reset every player's
      // saved look to "as found" on every single load. The check lives in openStash,
      // where the count is real.
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
      locked: lookLocked,
      note: function () {                       // tell them there IS more, and the price
        var t = treasures(), next = null;
        LOOKS.forEach(function (L) {
          if ((L.need || 0) > t && (next === null || L.need < next)) next = L.need;
        });
        return next === null ? "every look unlocked"
          : "next look at " + next + " treasures — you have " + t;
      },
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
    { k: "closet", label: "the closet door", vals: [   // open first: it's the default now
      { label: "open", apply: function () { cloOpen = true; } },
      { label: "shut", apply: function () { cloOpen = false; } },
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

  // --- GARAGE: the coffee can of bolts, which holds the garage's opinions
  var garStash = makeStash("garage", "☕ the coffee can", [
    lookOption(),
    { k: "proj", label: "the bench project", vals: [
      { label: "the birdhouse", apply: function () { bpBird.visible = true; bpDerby.visible = bpRocket.visible = false; } },
      { label: "the derby car", apply: function () { bpDerby.visible = true; bpBird.visible = bpRocket.visible = false; } },
      { label: "the rocket", apply: function () { bpRocket.visible = true; bpBird.visible = bpDerby.visible = false; } },
    ] },
    { k: "tarp", label: "the tarp", vals: [
      { label: "dusty blue", apply: function () { tarpG.visible = true; carBodyG.visible = false; tarpM.color.setHex(0x5d7089); } },
      { label: "canvas tan", apply: function () { tarpG.visible = true; carBodyG.visible = false; tarpM.color.setHex(0xb8a577); } },
      { label: "forest green", apply: function () { tarpG.visible = true; carBodyG.visible = false; tarpM.color.setHex(0x4a6349); } },
      { label: "off — let it breathe", apply: function () { tarpG.visible = false; carBodyG.visible = true; } },
    ] },
    { k: "pennant", label: "the pennant", vals: [
      { label: "HAZEL PARK", apply: function () { pennantDraw("#2f5e3a", "HAZEL PARK"); } },
      { label: "MARLINS", apply: function () { pennantDraw("#2a6a72", "MARLINS"); } },
      { label: "VARSITY", apply: function () { pennantDraw("#6e2a38", "VARSITY"); } },
      { label: "CHAMPS '91", apply: function () { pennantDraw("#8a6a2a", "CHAMPS '91"); } },
    ] },
    { k: "stain", label: "the oil stain", vals: [
      { label: "still there", apply: function () { oilStain.visible = true; } },
      { label: "scrubbed out", apply: function () { oilStain.visible = false; } },
    ] },
  ]);
  canG.children.forEach(function (m) {
    gtag(m, "the coffee can", function () { openStash(garStash); },
      "the coffee can of bolts — the garage keeps its opinions in here");
  });

  // --- BACK YARD: the cooler, which holds the summer's settings
  var backyardStash = makeStash("backyard", "🧊 the cooler", [
    lookOption(),
    { k: "float", label: "the floats", vals: [
      { label: "both out", apply: function () { setFloats(0); } },
      { label: "just the tube", apply: function () { setFloats(1); } },
      { label: "just the ball", apply: function () { setFloats(2); } },
      { label: "put away", apply: function () { setFloats(3); } },
    ] },
    { k: "plight", label: "the pool light", vals: [
      { label: "on", apply: function () { setPoolLight(true); } },
      { label: "off", apply: function () { setPoolLight(false); } },
    ] },
    { k: "torch", label: "the tiki torches", vals: [
      { label: "lit", apply: function () { setTorches(true); } },
      { label: "out", apply: function () { setTorches(false); } },
    ] },
    { k: "wash", label: "the washing line", vals: [
      { label: "still out", apply: function () { washing.forEach(function (w2) { w2.visible = true; }); } },
      { label: "taken in", apply: function () { washing.forEach(function (w2) { w2.visible = false; }); } },
    ] },
  ]);
  coolG.children.forEach(function (m) {
    btag(m, "the cooler", function () { openStash(backyardStash); },
      "the cooler — pop on top, mystery at the bottom");
  });

  // --- BASEMENT: the cigar box, which holds the den's opinions
  var basementStash = makeStash("basement", "🎲 the cigar box", [
    lookOption(),
    { k: "crt", label: "the TV", vals: [
      { label: "static on", apply: function () { setCrt(true); } },
      { label: "off", apply: function () { setCrt(false); } },
    ] },
    { k: "tank", label: "the aquarium light", vals: [
      { label: "green", apply: function () { setTank(0); } },
      { label: "blue", apply: function () { setTank(1); } },
      { label: "lights out", apply: function () { setTank(2); } },
    ] },
    { k: "afghan", label: "the afghan", vals: [
      { label: "plaid red", apply: function () { setAfghan(0); } },
      { label: "burnt orange", apply: function () { setAfghan(1); } },
      { label: "folded away", apply: function () { setAfghan(2); } },
    ] },
    { k: "bike", label: "the exercise bike", vals: [
      { label: "facing the wall", apply: function () { setBike(false); } },
      { label: "facing the TV (brave)", apply: function () { setBike(true); } },
    ] },
  ]);
  cigG.children.forEach(function (m) {
    bstag(m, "the cigar box", function () { openStash(basementStash); },
      "the cigar box — the den keeps its opinions in here");
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
    cellar1: new THREE.Vector3(-5.95, 1.68, 0.60),  // squared to the hole, hall side
    cellar2: new THREE.Vector3(-6.97, 1.25, 0.45),  // over the mouth of it
    cellar3: new THREE.Vector3(-6.97, -0.60, 1.40), // mid-flight, under the floor now
    cellar4: new THREE.Vector3(-6.97, -1.35, 2.55), // nearly down
    bsrest: new THREE.Vector3(-5.30, -0.82, 3.30),  // standing in the den
    bslook: new THREE.Vector3(1.60, -1.75, 1.45),   // the couch, the cart, the glow
    bslookB: new THREE.Vector3(-6.97, -1.05, 1.60), // turned round: the stairs up
    brest: new THREE.Vector3(-4.55, 1.28, 13.9),    // on the back lawn, pool-side of the line
    blook: new THREE.Vector3(-1.20, -0.45, 17.1),   // the water
    blookB: new THREE.Vector3(-5.60, 1.45, 9.4),    // turned round: the slider, the lit house
    bdoor1: new THREE.Vector3(-5.34, 1.66, 7.85),   // squared up to the slider's clear pane
    bdoor2: new THREE.Vector3(-5.34, 1.58, 9.35),   // in the opening
    bdoorL: new THREE.Vector3(-3.20, 0.55, 14.6),   // what you see through it: the glow
    grest: new THREE.Vector3(-7.92, 1.64, 4.68),    // the corner the door swing keeps clear
    glook: new THREE.Vector3(-11.70, 1.30, 7.55),   // down the long diagonal: pegboard, bench, tarp
    glookB: new THREE.Vector3(-7.40, 1.15, 5.70),   // turned round: the door back to the hall
    gdoor1: new THREE.Vector3(-5.98, 1.66, 5.60),   // squared up to the garage door, hall side
    gdoor2: new THREE.Vector3(-7.25, 1.62, 5.60),   // in the doorway
    gdoorL: new THREE.Vector3(-10.6, 0.90, 6.90),   // what you see through it
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
  function enterGarage() {
    if (mode !== "idle" || space !== "hall") return;
    mode = "garageIn"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.ratchetSfx && AUDIO.ratchetSfx();
    if (turnBtn) turnBtn.style.display = "none";
  }
  function leaveGarage() {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "garage") return;
    mode = "garageOut"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
  }
  function enterBasement() {
    if (mode !== "idle" || space !== "hall") return;
    mode = "basementIn"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.clickSfx && AUDIO.clickSfx(600);   // the first tread always announces you
    if (turnBtn) turnBtn.style.display = "none";
  }
  function leaveBasement() {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "basement") return;
    mode = "basementOut"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
  }
  function enterBack() {
    if (mode !== "idle" || space !== "hall") return;
    mode = "backIn"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.ratchetSfx && AUDIO.ratchetSfx();   // the slider's latch has a voice too
    if (turnBtn) turnBtn.style.display = "none";
  }
  function leaveBack() {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "back") return;
    mode = "backOut"; tt = 0;
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
  function restPos() {
    return space === "porch" ? P.porch : space === "kitchen" ? P.krest
         : space === "garage" ? P.grest : space === "back" ? P.brest
         : space === "basement" ? P.bsrest : P.rest;
  }
  function aimFor(f) {
    if (space === "porch") return f === "house" ? P.porchB : P.porchL;
    if (space === "kitchen") return f === "door" ? P.klookB : P.klook;
    if (space === "garage") return f === "door" ? P.glookB : P.glook;
    if (space === "back") return f === "house" ? P.blookB : P.blook;
    if (space === "basement") return f === "stairs" ? P.bslookB : P.bslook;
    return f === "south" ? P.lookS : P.look;
  }
  function flipOf(f) {
    if (space === "porch") return f === "street" ? "house" : "street";
    if (space === "kitchen" || space === "garage") return f === "door" ? "room" : "door";
    if (space === "back") return f === "pool" ? "house" : "pool";
    if (space === "basement") return f === "den" ? "stairs" : "den";
    return f === "north" ? "south" : "north";
  }
  function ease(x) { return x * x * (3 - 2 * x); }
  var _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function walk(pts, lks, t) { // piecewise keyframe path, eased per leg
    var n = pts.length - 1, x = Math.min(0.9999, Math.max(0, t)) * n, i = x | 0, f = ease(x - i);
    _v.lerpVectors(pts[i], pts[i + 1], f);
    _w.lerpVectors(lks[i], lks[i + 1], f);
  }
  /* ---- THE VIEW FROM THE BOY'S WINDOW ------------------------------------------
   * The bedroom window used to be three painted canvas layers of a street that did
   * not exist. It looks at THIS street now: room.js renders the yard through a
   * second camera into a texture, and hangs that in the window.
   *
   * The bedroom is not modelled above the hall — the two rooms are separate
   * footprints dropped in the same world — so this is a portal, not a hole. These
   * numbers place the camera where the boy's window WOULD be: over the porch roof,
   * a little to the right of the front door, looking down the lawn at the road.
   *
   * ⚠️ room.js must make the yard visible for that one render and hide it again
   * immediately, for the reason camTick documents below: yardHemi and yardSun have
   * no falloff and light the bedroom straight through the walls if they are left
   * up. portalBegin/portalEnd are that bracket — always pair them. */
  // ⚠️ THE PORCH ROOF IS RIGHT UNDER THIS WINDOW (a slab at y 2.99 reaching out to
  // about z -6.6). At GROUND+4.05 the eye cleared it by 0.6m and it swallowed the
  // BOTTOM HALF of the frame as an unlit black wedge. Measured by raycasting a fan
  // down the frame, not by squinting at it. At GROUND+5.2 — a believable second
  // storey — with the aim raised to match, the roof reads as a strip of your own
  // shingles along the sill, which is exactly what an upstairs window should show.
  var WIN_EYE = new THREE.Vector3(FRONT_X + 1.30, GROUND + 5.20, HOUSE_F - 0.10);
  var WIN_AIM = new THREE.Vector3(FRONT_X + 0.20, GROUND + 0.91, Z_ROADF + 1.5);
  // set by room.js whenever the window is showing the real view, so the street
  // keeps living while you are indoors looking at it
  var portalLive = false;
  function setPortalLive(on) { portalLive = !!on; }
  function portalBegin() {
    var was = { g: g.visible, y: yardG.visible };
    g.visible = true; yardG.visible = true;
    return was;
  }
  function portalEnd(was) { g.visible = was.g; yardG.visible = was.y; }
  /* `sway` is the room camera's own lateral drift. Translating the EYE while the
   * aim stays put is what a real window does when you move your head: the lawn
   * slides further than the houses across the road, and the frame crops. Yawing
   * both together would just pan the world and read as a video playing on a wall. */
  function aimPortal(cam, sway) {
    cam.position.set(WIN_EYE.x + sway * 0.62, WIN_EYE.y + sway * 0.05, WIN_EYE.z);
    cam.lookAt(WIN_AIM);
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
    if (mode === "garageIn" || mode === "garageOut") {   // through the garage door
      tt = Math.min(1, tt + dt / 2.1);
      var gk = mode === "garageIn" ? tt : 1 - tt;
      // -2.0 rad: the slab swings INTO the garage, toward the cleared corner by the
      // roll door — the fridge and the newspapers live at the OTHER end for this
      gDoorPivot.rotation.y = 2.0 * ease(Math.min(1, Math.max(0, (gk - 0.04) / 0.42)));
      if (mode === "garageIn") walk([c0, P.gdoor1, P.gdoor2, P.grest], [l0, P.gdoorL, P.glook, P.glook], tt);
      else walk([c0, P.gdoor2, P.gdoor1], [l0, P.gdoorL, P.lookS], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "garageIn") { space = "garage"; facing = turnTo = "room"; gDoorPivot.rotation.y = 2.0; }
        else {
          space = "hall"; facing = turnTo = "south"; gDoorPivot.rotation.y = 0;
          AUDIO.clickSfx && AUDIO.clickSfx(500);
        }
        turnK = 1; mode = "idle"; syncTurnBtn();
      }
      return true;
    }
    if (mode === "basementIn" || mode === "basementOut") {   // down the hole, into the den
      tt = Math.min(1, tt + dt / 2.7);
      if (mode === "basementIn")
        walk([c0, P.cellar1, P.cellar2, P.cellar3, P.cellar4, P.bsrest],
             [l0, new THREE.Vector3(-6.97, -1.2, 2.1), new THREE.Vector3(-6.8, -1.5, 2.5), P.bslook, P.bslook, P.bslook], tt);
      else
        walk([c0, P.cellar4, P.cellar3, P.cellar2, P.cellar1],
             [l0, new THREE.Vector3(-6.97, 0.4, 0.9), new THREE.Vector3(-6.97, 1.2, 0.4), P.look, P.look], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "basementIn") { space = "basement"; facing = turnTo = "den"; }
        else { space = "hall"; facing = turnTo = "north"; AUDIO.clickSfx && AUDIO.clickSfx(500); }
        turnK = 1; mode = "idle"; syncTurnBtn();
      }
      return true;
    }
    if (mode === "backIn" || mode === "backOut") {   // through the slider, onto the lawn
      tt = Math.min(1, tt + dt / 2.4);
      var bk = mode === "backIn" ? tt : 1 - tt;
      // the pane is fully open by the time the camera reaches the opening —
      // same contract as every hinged door in the house, translated not rotated
      slideK(ease(Math.min(1, Math.max(0, (bk - 0.04) / 0.42))));
      if (mode === "backIn") walk([c0, P.bdoor1, P.bdoor2, P.brest], [l0, P.bdoorL, P.blook, P.blook], tt);
      else walk([c0, P.bdoor2, P.bdoor1], [l0, P.bdoorL, P.lookS], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "backIn") { space = "back"; facing = turnTo = "pool"; slideK(1); }
        else {
          space = "hall"; facing = turnTo = "south"; slideK(0);
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
    if (space === "hall" || space === "porch" || space === "kitchen" || space === "garage" || space === "back" || space === "basement") { // at rest: same parallax drift as the bedroom
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
        mode === "out" || mode === "in" || mode === "kitchenIn" || mode === "kitchenOut" ||
        mode === "garageIn" || mode === "garageOut" || mode === "backIn" || mode === "backOut" ||
        mode === "basementIn" || mode === "basementOut") return;
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
    var show = space === "hall" || space === "porch" || space === "kitchen" ||
               space === "garage" || space === "back" || space === "basement" || mode === "entering";
    turnBtn.style.display = show ? "block" : "none";
    var next = flipOf(mode === "turning" ? turnTo : facing);
    // ⚠️ kitchen and garage share the room/door facing tokens, so "room" has to be
    // resolved per-space or the button in the garage offers you the kitchen
    var LBL = { south: "the back of the house", north: "the front door", pool: "the pool",
                den: "the den", stairs: "the stairs up",
                house: "the house", street: "the street",
                door: "the way out", room: space === "garage" ? "the garage" : "the kitchen" };
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
    // the garage bulb answers its own chain, not the hall switch
    var gon = garOn ? 1 : 0.03;
    garLite.intensity = 1.7 * dim * gon * breathe;
    gBulb.material.emissiveIntensity = 1.6 * dim * gon;
    gSpill.material.opacity = 0.12 * dim * gon;
    poolTick(t, dt);   // the water never stops, even seen through the glass
    bsmTick(t);        // and neither do the static or the fish
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
    // ⚠️ leaf B counter-rotates at TWICE leaf A — that ratio IS what makes a bi-fold
    // fold instead of swing. Any other multiple and the two leaves tear apart at the
    // hinge or scissor through each other.
    var target = cloOpen ? 1.50 : 0;
    cloAnim += (target - cloAnim) * Math.min(1, dt * 7);
    cloDoorP.rotation.y = cloAnim;
    bfB.rotation.y = -2 * cloAnim;
    // the big garage door rolls the same lazy way — slower, it weighs a lot more
    if (Math.abs(rollTarget - rollA) > 0.0004) {
      rollA += (rollTarget - rollA) * Math.min(1, dt * 1.6);
      applyRoll(rollA);
    }
    // the closet's bulb comes up with the door, so the 1997 inside it is only lit
    // while you're actually looking at it — and never leaks into the hall when shut
    var cf = Math.min(1, Math.abs(cloAnim) / 1.2);
    cloLight.intensity = 1.35 * cf * dim;
    cloBulb.material.emissiveIntensity = 1.7 * cf * dim;
    // somebody on the path, briefly
    if (figT > 0) { figT -= dt; figG.visible = true; figG.position.x = FRONT_X + 0.35 + Math.sin(t * 0.7) * 0.05; }
    else if (figG.visible) figG.visible = false;

    /* ---- the street, alive ---------------------------------------------------
     * Skipped from indoors when nothing is looking at it — the yard group is
     * hidden there, so none of it is visible and none of it should cost anything.
     * ⚠️ EXCEPT when the bedroom window is showing the real street. That window is
     * a second camera on this same yard, and this early-return froze everything it
     * looks at: the passing cars parked themselves, the lamp stopped flickering,
     * and the ice cream truck sat at the origin for good — the one game you are
     * meant to CATCH could never come past the window. */
    if (!yardG.visible && !portalLive) return;
    tickSky(t, dt);
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

    /* --- the ice cream truck. Five minutes of nothing, fifteen seconds of chance. */
    truckT += dt;
    var inRun = (truckT % TRUCK_CYCLE) < TRUCK_WINDOW;
    if (inRun) {
      var f = (truckT % TRUCK_CYCLE) / TRUCK_WINDOW;          // 0..1 across the window
      var tx = 52 - f * 104;                                   // east to west, 104m in 15s
      truckG.visible = true;
      truckG.position.set(tx, TRUCK_Y, (Z_KERB + Z_ROADF) / 2 + 2.1);
      // ⚠️ the body is 4.5 long on LOCAL X with the cab at +x, and it drives toward
      // −x. π (not −π/2, which parked it broadside across both lanes) points the
      // cab down the road AND swings the serving window round to face the house.
      truckG.rotation.y = Math.PI;
      tkLite.intensity = 1.4 * PORCH_SKY[porchPhase].lamp;
      // ⚠️ the jingle is retriggered on a timer, not looped, because each call
      // SCHEDULES its phrase ahead on the audio clock — calling it every frame would
      // stack seven oscillators per frame and turn the street into a chord organ.
      truckJing -= dt;
      if (truckJing <= 0) {
        truckJing = 1.55;                                      // just over the phrase
        // gain from how near it is, and halved indoors: you hear it through the
        // walls, which is the entire point of the thing
        var near = Math.max(0, 1 - Math.abs(tx + 5.7) / 46);
        var muff = (space === "porch") ? 1 : 0.45;
        AUDIO.truckJingle && AUDIO.truckJingle(near * near * muff);
      }
      if (!truckSeen && space === "porch") {                   // it only counts if you're out
        truckSeen = true;
        try { localStorage.setItem("room-truck-seen", "1"); } catch (e) { }
      }
    } else if (truckG.visible) {
      truckG.visible = false; tkLite.intensity = 0; truckJing = 0;
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
      gDoorPivot.rotation.y = 0; rollTarget = 0; rollA = 0; applyRoll(0);
      slideK(0);
    },
    turn: turn, facing: function () { return facing; },
    stepOut: stepOut, stepIn: stepIn,
    kitchen: { enter: enterKitchen, leave: leaveKitchen },
    garage: { enter: enterGarage, leave: leaveGarage, roll: toggleRoll,
      rollA: function () { return rollA; } },
    back: { enter: enterBack, leave: leaveBack },
    basement: { enter: enterBasement, leave: leaveBasement },
    stashes: stashByKey, openStash: openStash, closeStash: closeStash,
    setPhase: setPhase, phase: function () { return porchPhase; },
    knock: knockCame,
    portalBegin: portalBegin, portalEnd: portalEnd, aimPortal: aimPortal,
    setPortalLive: setPortalLive,
    setWeather: setYardWeather, setSeason: setYardSeason,
    camTick: camTick, glowTick: glowTick, refreshPhotos: refreshPhotos
  };
}
