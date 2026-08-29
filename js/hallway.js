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
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { mat, box, canvasTex, esc } from "./util.js";
function canvasTexLinear(w, h, draw) { return canvasTex(w, h, draw, true); }   // masks/dust/rain: see util.js
import * as PROFILE from "./profile.js";
import * as AUDIO from "./audio.js";

export function buildHallway(ctx) {
  var scene = ctx.scene, camera = ctx.camera, lookAt = ctx.lookAt,
      clickable = ctx.clickable, glow = ctx.glow;
  /* ⚠️ GROUNDING. The bedroom plants every free-standing thing on the floor with a
   * soft AO decal (contactShadow in room.js — one shared 64px radial canvas, opacity
   * driven, never colour). The newer spaces had almost none, and measured against the
   * bedroom rubric a couch with no shadow under it floats and a beanbag reads as a
   * balloon. The helper is passed through ctx; this wrapper adds the one thing the
   * bedroom version assumes — a floor at y 0 — by taking the floor height per call.
   * ⚠️ y must sit ABOVE any rug (the rugs are at +0.008..0.012) or the decal z-fights
   * the rug instead of shading it: +0.016 over the floor, the bedroom's convention. */
  /* ================= HERO PROPS: BAKED GLBs OVER THE BOX SKETCHES =================
   * The bedroom's furniture is baked models; the rest of the house was boxes. Each
   * call replaces one prop's procedural sketch with a generated GLB when (and only
   * when) the file arrives — a 404 keeps the boxes, exactly like the texture pass.
   * ⚠️ THE CONTACT SHADOW SURVIVES: plant()'s disc is child[0] of most prop
   * groups, and the hide list at each call site deliberately excludes it. Hide the
   * disc and the new prop floats — the grounding cue is the disc, not the mesh.
   * ⚠️ CLICKABILITY IS COPIED, NOT ASSUMED: picking raycasts the `pick` array,
   * so every GLB mesh goes through ctx.clickable with the old prop's own name,
   * action and hint, and inherits its userData.space. A silent swap that forgot
   * this would leave a prop you can see but not hover — the 74%-null-action audit
   * taught us how invisible that failure is.
   * ⚠️ fit.ry rotates BEFORE measuring, so the box fit is of the turned model.
   * Deferred + uncounted: never touches the boot gate. */
  var housePropLoader = null;
  function propSwap(key, parent, hide, fit, proto) {
    if (!housePropLoader) {
      var dr = new DRACOLoader(); dr.setDecoderPath("assets/lib/draco/");
      housePropLoader = new GLTFLoader(); housePropLoader.setDRACOLoader(dr);
    }
    housePropLoader.load("assets/props/house/" + key + ".glb", function (g) {
      try {
        var pd = proto || null;
        if (!pd) hide.forEach(function (m) { if (!pd && m.userData && m.userData.name) pd = m; });
        var inner = new THREE.Group();
        inner.rotation.y = fit.ry || 0;
        inner.add(g.scene);
        var bb = new THREE.Box3().setFromObject(inner);
        var size = bb.getSize(new THREE.Vector3());
        var sc = fit.w / Math.max(0.001, size.x);
        if (fit.d) sc = Math.min(sc, fit.d / Math.max(0.001, size.z));
        if (fit.h) sc = Math.min(sc, fit.h / Math.max(0.001, size.y));
        inner.scale.setScalar(sc);
        bb.setFromObject(inner);
        var c = bb.getCenter(new THREE.Vector3());
        inner.position.set((fit.x || 0) - c.x, (fit.y || 0) - bb.min.y, (fit.z || 0) - c.z);
        inner.traverse(function (o) {
          if (!o.isMesh) return;
          if (fit.tint && o.material && o.material.color) {
            o.material = o.material.clone(); o.material.color.multiplyScalar(1).multiply(new THREE.Color(fit.tint));
          }
          if (pd) { ctx.clickable(o, pd.userData.name, pd.userData.action, pd.userData.hint); o.userData.space = pd.userData.space; }
        });
        parent.add(inner);
        hide.forEach(function (m) { m.visible = false; });
        // fit.onPlaced(top): lets a call site re-seat loose props that sat on the
        // SKETCH’s surface — the fruit bowl was placed on a 0.74 table and the bake
        // came out 0.61: sixteen centimetres of floating fruit until this ran.
        if (fit.onPlaced) try { fit.onPlaced((fit.y || 0) + (bb.max.y - bb.min.y)); } catch (e2) { }
      } catch (e) { }
    }, undefined, function () { /* 404: the box sketch stays */ });
  }

  function plant(parent, rx, rz, op, floorY) {
    if (!ctx.contactShadow) return null;
    return ctx.contactShadow(parent, rx, rz, op, (floorY || 0) + 0.016);
  }
  /* ⚠️ EIGHT POINT LIGHTS BURNED AT FULL BRIGHTNESS AT DEEPEST NIGHT — every light
   * built as `new PointLight(c, i, d, k)` and never ticked ignored the one dial the
   * whole house answers to. Anything registered here gets `base * dim` every frame
   * from glowTick, so a new constant practical is one push() away from behaving. */
  var dimLights = [];

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

  /* ⚠️⚠️ EVERY WALL PANEL GETS ITS OWN REPEAT. BoxGeometry normalises UVs PER FACE, so
   * one shared material means one shared TILE COUNT on faces of wildly different size.
   * The hall's west wall alone is built from panels of 5.07, 2.55, 1.24 and 0.31 m and
   * the wallpaper's pinstripe measured 15.8, 8.0, 3.9 and 1.0 cm across them — a 16x
   * jump on ONE continuous wall, the panels meeting edge to edge at the door jambs.
   * paperWallM scales the repeat by the face's real size, so the pitch is the same
   * everywhere. A clone shares the texture's Source: no second GPU upload.
   * ⚠️ PHASE still resets at each panel edge, and that is fine — wallpaper is hung in
   * strips and a seam at a door jamb is what a real wall looks like. It is the PITCH
   * changing that read as broken.
   * ⚠️⚠️ ANY MATERIAL A HELPER MAKES MUST GO INTO LOOK_EXTRA. LOOK_MATS is a fixed
   * list built near the bottom of this file and the house LOOKS lerp material.color
   * over it — a material that is not in it silently stops taking the paint, which is
   * exactly the bug the comment on LOOK_MATS already records happening twice. */
  var LOOK_EXTRA = [];
  function paperWallM(lenU, lenV, rough) {
    var t = hwallT.clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(0.2, lenU) * 0.789, Math.max(0.2, lenV) * 0.471);  // the 5.07 m run's own measured density
    var m = new THREE.MeshStandardMaterial({ map: t, roughness: rough == null ? 0.95 : rough });
    LOOK_EXTRA.push(m); return m;
  }
  // the WEST wall is cut for the kitchen doorway — third hole in this house, same
  // lesson each time: a door you can walk through needs an opening, not a slab
  var KDO = { z0: -0.90, z1: 0.20, y1: 2.16 };
  // …and cut AGAIN for the garage doorway (FIFTH hole, same lesson as the other
  // four: the garage door was a decor slab on solid wall from the day it went up,
  // and the moment it became a door you could open it would have opened onto
  // wallpaper, exactly like the closet did).
  /* ⚠️ THE GARAGE DOOR MOVED SOUTH (z 5.08..6.12 -> 7.45..8.49) because the
   * staircase now runs up this wall and its low end lands at z 7.40. 8.49 leaves
   * 0.31 m of wall to the south corner at Z_S 8.8, which is enough for the jamb. */
  var GDO = { z0: 7.45, z1: 8.49, y1: 2.16 };
  /* …and a SIXTH hole for the living room, which is a real room on this side now.
   * ⚠️ IT GOES IN THIS LIST. I first built a SECOND west wall carrying only the
   * living room's opening — which is a full-height slab straight across the kitchen
   * and garage doorways. Three transitions started clipping through it at once
   * (kit 2, gar 1, and the living room walk itself). One wall, all the holes. */
  var LDO = { z0: 1.44, z1: 2.38, y1: 2.24 };
  [[Z_N, KDO.z0, 0, 3.4], [KDO.z1, LDO.z0, 0, 3.4], [LDO.z1, GDO.z0, 0, 3.4], [GDO.z1, Z_S, 0, 3.4],
   [KDO.z0, KDO.z1, KDO.y1, 3.4], [LDO.z0, LDO.z1, LDO.y1, 3.4],
   [GDO.z0, GDO.z1, GDO.y1, 3.4]].forEach(function (p) {
    var seg = box(0.1, p[3] - p[2], p[1] - p[0], paperWallM(p[1] - p[0], p[3] - p[2]));
    seg.position.set(W_IN - 0.05, (p[2] + p[3]) / 2, (p[0] + p[1]) / 2); add(seg);
  });
  // the hall's OWN east wall, south of where the bedroom stops — CUT for the closet.
  // ⚠️⚠️ FOURTH TIME THIS FILE HAS LEARNED IT: a door you can open needs a HOLE, not
  // a slab behind it. The closet door sits in the hall at x -4.40 and its shelf, rod
  // and coats sit at x -4.04 — with 10cm of solid wall in between. Opening it revealed
  // WALLPAPER, and had done since the day it was built. A ray fired east through the
  // closet reads: door @-4.40, WALL @-4.35, shelf @-4.04.
  var CLO_Z = 7.70, CDO = { z0: CLO_Z - 0.46, z1: CLO_Z + 0.46, y1: 2.16 };
  /* ⚠️ AND CUT AGAIN FOR THE LIVING ROOM, for the same reason the closet is cut: the
   * room is a real space on the other side of this wall and you walk through here to
   * reach it. LDO sits north of the closet with a metre of wall between them. */
  /* ⚠️ THE LIVING ROOM OPENING CAME BACK OUT OF THIS WALL. It was cut here twice —
   * first at z 4.72, where the washer and dryer stand (x -5.03..-4.39, z 4.80..6.10),
   * then at 6.20, the only clear metre left between the laundry and the closet. Both
   * were squeezes, and the room they led to sat where the bedroom camera stands. It is
   * on the WEST side now, behind the door that always said LIVING ROOM. */
  [[BED_END, CDO.z0, 0, 3.4],           // north of the closet
   [CDO.z1, Z_S + 0.1, 0, 3.4],         // south of it
   [CDO.z0, CDO.z1, CDO.y1, 3.4]]       // the header over it, opening-width only
    .forEach(function (p) {
      var seg = box(0.1, p[3] - p[2], p[1] - p[0], paperWallM(p[1] - p[0], p[3] - p[2]));
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
    var seg = box(p[1] - p[0], p[3] - p[2], 0.1, paperWallM(p[1] - p[0], p[3] - p[2]));
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
      var seg = box(p[1] - p[0], p[3] - p[2], 0.1, paperWallM(p[1] - p[0], p[3] - p[2]));
      seg.position.set((p[0] + p[1]) / 2, (p[2] + p[3]) / 2, Z_S + 0.05); add(seg);
    });
  // The ceiling is TWO pieces, not one, because the stairs go through it — same
  // trick as the floor being three pieces around the basement hole. The opening is
  // z -3.6..-1.45 over the west side, so you can look up the flight to the landing.
  var ceilM = mat(0x2a2f3d, 0.98);
  /* ⚠️ z1 WAS -1.45 AND IT IS 1.60 NOW. The void only ever had to clear the FIRST
   * flight, which stops at a half-landing 1.475 up. The second flight — the one that
   * actually reaches the floor above — switches back and climbs south, so the hole in
   * the ceiling has to run with it or the stairs go through the slab. */
  /* ⚠️ THE VOID FOLLOWED THE FLIGHT TO THE WEST WALL (Kyle, 2026-08-25: he did not
   * like where the stairs had moved to). STW is the spine — the hall ceiling's four
   * pieces, the storey's four floor pieces, the corridor wall runs, the shaft faces
   * and the up/down hitbox are all derived from it — so moving the flight is this
   * one line plus STAIR_X and UP_Z0, and everything else follows. */
  var STW = { x0: W_IN - 0.10, x1: W_IN + 1.02, z0: 2.60, z1: 7.45 }; // the stairwell void
  var CZ_S = Z_S + 0.15, CX_E = XC + (HW + 0.3) / 2;      // the ceiling's south + east edges
  var ceilA = box(HW + 0.3, 0.1, CZ_S - STW.z1, ceilM);   // everything south of the void
  ceilA.position.set(XC, CEIL + 0.05, (STW.z1 + CZ_S) / 2); add(ceilA);
  var ceilB = box(CX_E - STW.x1, 0.1, STW.z1 - STW.z0, ceilM); // the strip east of it
  ceilB.position.set((STW.x1 + CX_E) / 2, CEIL + 0.05, (STW.z0 + STW.z1) / 2); add(ceilB);
  // ⚠️ and a strip WEST of it, which never existed because the void used to be hard
  // against the west wall and had no west side. Without this the ceiling has a 1.03m
  // slot running the length of the stairwell.
  var CX_W = XC - (HW + 0.3) / 2;
  var ceilC = box(STW.x0 - CX_W, 0.1, STW.z1 - STW.z0, ceilM);
  ceilC.position.set((CX_W + STW.x0) / 2, CEIL + 0.05, (STW.z0 + STW.z1) / 2); add(ceilC);
  // and the ceiling north of the void, which is now inboard of the north wall
  var ceilD = box(HW + 0.3, 0.1, STW.z0 - (Z_N - 0.15), ceilM);
  ceilD.position.set(XC, CEIL + 0.05, ((Z_N - 0.15) + STW.z0) / 2); add(ceilD);
  // the stairwell's own lid + the two faces that close it, so the void is a shaft
  // and not a hole into nothing
  /* ⚠️ THE LID IS GONE. It capped the shaft at y 3.45 because there was nothing above
   * it — "the upstairs is real; it just isn't YOURS yet". It is yours now, and 3.45 is
   * exactly where the floor went, so the cap would have been the floor you stand on
   * with a staircase arriving underneath it. */
  // ⚠️ these sit ENTIRELY ON THE VOID SIDE of the ceiling's cut edge (x1-0.05, z1-0.05),
  // not centred on it. Centred, each one straddled the edge: half the shaft wall lay
  // inside the ceiling slab sharing its BOTTOM face at y 2.95 — 0.108m² and 0.062m² of
  // coplanar face right around the stairwell opening, which is the rim Kyle saw
  // flashing. Butted against the cut edge instead, nothing is coplanar and the reveal
  // of the opening reads properly.
  /* ⚠️ THESE WERE 0.45 TALL AND STOPPED AT y 3.40, five centimetres SHORT of the
   * boards at 3.455 — a slot around the shaft you could see the joist void through
   * while the stair camera flew up it. They span the whole gap now (ceiling top
   * 3.05 to the floor above). The north side stays open on purpose: that is where
   * you step off the flight onto the landing. */
  var stwE = box(0.1, 0.51, STW.z1 - STW.z0, paperWallM(STW.z1 - STW.z0, 0.51));
  stwE.position.set(STW.x1 - 0.05, 3.205, (STW.z0 + STW.z1) / 2); add(stwE);
  var stwS = box(STW.x1 - STW.x0, 0.51, 0.1, paperWallM(STW.x1 - STW.x0, 0.51));
  stwS.position.set((STW.x0 + STW.x1) / 2, 3.205, STW.z1 - 0.05); add(stwS);
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

  /* ⚠️ THE "LIVING ROOM" DOOR USED TO BE HERE, on the west wall at z 1.9, taped shut
   * and promising a room that could never be built behind it: the kitchen owns this
   * side from z -3.55 to 2.05 and the garage from 4.25 to 8.55, so the slab opened
   * straight into the kitchen's own floor. The room is real now and it is on the
   * EAST wall (see THE LIVING ROOM), so the fake door is gone rather than relabelled
   * — a door with nothing behind it is the thing we keep having to fix.
   * The linen cupboard that was drawn beside it stays; it is only a shallow press. */

  /* ---- THE LIVING ROOM, where the door always said it was ---------------------
   * ⚠️ THE HISTORY MATTERS. The door on this wall at z 1.9 was taped shut and promised
   * a room that could not exist: the kitchen ran to z 2.05 and the garage starts at
   * 4.25, leaving 2.2m — a corridor. I built it on the EAST instead and it was wrong
   * twice over: the doorway landed behind the washer, and the room sat where the
   * bedroom camera stands, so it had to be switched off whenever you were not in it.
   * The house got extended instead, which is what Kyle asked for: the kitchen's south
   * wall came north (KZ1 2.05 -> 0.30) and the drive moved west (x -16.8 -> -20.8).
   * Between them they open a real 9.6 x 3.6 footprint, and the door is back at z 1.9. */
  var LIV = { x0: -17.15, x1: W_IN, z0: 0.45, z1: 4.10, ce: 2.62 };
  // where the living room's SHELL stops: inside the hall wall, never flush with its
  // far face. Flush is a depth tie, and a depth tie flashes. (Fittings that belong to
  // this room — the door casing, the switch, the way-out hit — keep using LIV.x1.)
  var LIV_SE = LIV.x1 - 0.025;
  var livWallM = new THREE.MeshStandardMaterial({ map: hwallT, roughness: 0.94 });
  function ltag(m, name, action, hint) { clickable(m, name, action, hint); m.userData.space = 'living'; return m; }
  /* ⚠️ THE HOUSE DIMMER STOPPED AT THE DOORWAY. Every light in this room was built
   * inside the IIFE below and set exactly once, so the pull chain, the day/night
   * cycle and the look grade all reached the hall and the kitchen and then simply
   * stopped. Rather than hoist five variables out (and rename around the collisions
   * that would cause), the room publishes its handles into one holder that glowTick
   * can reach. A null guard keeps the tick honest if the room ever fails to build. */
  var livLightH = null, livOn = true, livingLife = null;
  (function () {
    /* ⚠️ ITS OWN MATERIAL, not the hall's. PlaneGeometry UVs run 0..1 whatever the
     * face measures, so sharing plankM gave this 9.7 x 3.65 m room the repeat tuned
     * for the 3.1 m-wide hall: 63 texels/m across against 561 along — an 8.9:1 stretch
     * that drew the boards 1.1 cm wide and turned the nail heads into 4.7 cm dashes.
     * Cloned at the hall's own measured density, so the boards match through the door
     * — which is what the tooltip has always claimed. */
    var livFloorT = plankT.clone(); livFloorT.needsUpdate = true;
    livFloorT.wrapS = livFloorT.wrapT = THREE.RepeatWrapping;
    livFloorT.repeat.set((LIV.x1 - LIV.x0) * 0.387, (LIV.z1 - LIV.z0) * 0.327);
    var livFloorM = new THREE.MeshStandardMaterial({ map: livFloorT, roughness: 0.9 });
    var livFloorB = bumpFrom(livFloorT, 1.8);
    if (livFloorB) { livFloorB.repeat.copy(livFloorT.repeat); livFloorM.bumpMap = livFloorB; livFloorM.bumpScale = 1.0; }
    var fl = new THREE.Mesh(new THREE.PlaneGeometry(LIV.x1 - LIV.x0, LIV.z1 - LIV.z0), livFloorM);
    fl.rotation.x = -Math.PI / 2; fl.position.set((LIV.x0 + LIV.x1) / 2, 0.005, (LIV.z0 + LIV.z1) / 2);
    fl.receiveShadow = true; add(fl);
    ltag(fl, 'the living room floor', null, 'same boards as the hall. they ran out halfway and matched it as best they could.');
    var ceil = box(LIV_SE - LIV.x0, 0.10, LIV.z1 - LIV.z0, mat(0xe8e4d8, 0.95));
    ceil.position.set((LIV.x0 + LIV_SE) / 2, LIV.ce + 0.05, (LIV.z0 + LIV.z1) / 2); add(ceil);
    [[LIV_SE - LIV.x0, LIV.ce, 0.10, (LIV.x0 + LIV_SE) / 2, LIV.ce / 2, LIV.z0 - 0.05],
     [0.10, LIV.ce, LIV.z1 - LIV.z0 + 0.2, LIV.x0 - 0.05, LIV.ce / 2, (LIV.z0 + LIV.z1) / 2],
     [LIV_SE - LIV.x0, LIV.ce, 0.10, (LIV.x0 + LIV_SE) / 2, LIV.ce / 2, LIV.z1 + 0.05]
    ].forEach(function (w) {
      var m2 = box(w[0], w[1], w[2], paperWallM(Math.max(w[0], w[2]), w[1], 0.94)); m2.position.set(w[3], w[4], w[5]); add(m2);
    });
    // the front window: this room looks down the drive at the street
    var LWZ = LIV.z0 + 1.30, LWW = 1.70, LWY0 = 0.95, LWY1 = 2.10;
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(LWW, LWY1 - LWY0),
      new THREE.MeshStandardMaterial({ color: 0x2a3a4e, emissive: 0x8fa6c8, emissiveIntensity: 0.4, roughness: 0.2 }));
    /* ⚠️ THE SIGN. PlaneGeometry's front normal is +Z; rotating it about Y by θ gives
     * (sinθ, 0, cosθ). At -π/2 that is due WEST — out through the wall this window is
     * set into — and the material is FrontSide, so the room's most centred object was
     * not drawn at all. +π/2 faces east, into the room. Check every rotated plane in
     * this file the same way: a window you cannot see reads as a window that is not there. */
    glass.position.set(LIV.x0 + 0.03, (LWY0 + LWY1) / 2, LWZ); glass.rotation.y = Math.PI / 2; add(glass);
    ltag(glass, 'the front window', null, 'looks down the drive at the street. you can see who is coming before they knock.');
    [LWY0 - 0.04, LWY1 + 0.04].forEach(function (fy) {
      var f2 = box(0.07, 0.08, LWW + 0.16, mat(0xe4e0d2, 0.8));
      f2.position.set(LIV.x0 + 0.07, fy, LWZ); add(f2);
    });
    [-1, 1].forEach(function (sd) {
      var jm = box(0.07, LWY1 - LWY0 + 0.16, 0.08, mat(0xe4e0d2, 0.8));
      jm.position.set(LIV.x0 + 0.07, (LWY0 + LWY1) / 2, LWZ + sd * (LWW / 2 + 0.04)); add(jm);
    });
    ltag(glass, 'the front window', null, 'the drive, the street, whoever is pulling in. this is the window people watch from.');
    /* the room runs east-west, so the couch takes the long north wall and the set
     * faces it from the south — and the resting camera looks ALONG that axis. */
    var woodM = mat(0x6b4b30, 0.8), fabM = mat(0x6d7a5e, 0.92), fab2 = mat(0x5d6a50, 0.92);
    var rugT = canvasTex(128, 128, function (c, w, h) {
      c.fillStyle = '#7a5548'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(226,214,186,0.45)'; c.lineWidth = 5; c.strokeRect(11, 11, w - 22, h - 22);
      c.strokeStyle = 'rgba(226,214,186,0.25)'; c.lineWidth = 2; c.strokeRect(22, 22, w - 44, h - 44);
      c.fillStyle = 'rgba(120,80,66,0.5)'; c.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.4);
    });
    rugT.colorSpace = THREE.SRGBColorSpace;
    var rug = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.1), new THREE.MeshStandardMaterial({
      map: rugT, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-12.60, 0.011, 2.28); add(rug);
    ltag(rug, 'the good rug', null, 'vacuumed in one direction only. everyone knows.');
    /* ⚠️ THREE CANVAS TEXTURES FOR THE WHOLE ROOM, against fourteen in the kitchen —
     * which is a SMALLER room — and the biggest object in it was five flat-coloured
     * boxes. A weave is the cheapest possible canvas and the one that pays best: at
     * this distance the eye reads nub and seam long before it reads shape. */
    var twT = canvasTex(256, 256, function (c, w, h) {
      c.fillStyle = '#6d7a5e'; c.fillRect(0, 0, w, h);
      for (var q = 0; q < 900; q++) {
        var qx = (q * 71) % w, qy = (q * 137) % h;
        c.fillStyle = q % 2 ? 'rgba(122,135,104,0.55)' : 'rgba(88,99,74,0.5)';
        c.fillRect(qx, qy, 3, 2);
      }
      c.strokeStyle = 'rgba(60,68,50,0.35)'; c.lineWidth = 1;
      for (var gx = 0; gx < w; gx += 6) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, h); c.stroke(); }
      c.strokeStyle = 'rgba(52,60,44,0.55)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();   // the cushion split
    });
    twT.colorSpace = THREE.SRGBColorSpace;
    twT.wrapS = twT.wrapT = THREE.RepeatWrapping; twT.repeat.set(2, 1);
    var tweedM = new THREE.MeshStandardMaterial({ map: twT, roughness: 0.94 });
    var twB = bumpFrom(twT, 1.5);
    if (twB) { twB.repeat.copy(twT.repeat); tweedM.bumpMap = twB; tweedM.bumpScale = 0.35; }
    var cg = new THREE.Group(); cg.position.set(-12.60, 0, 1.02); add(cg);
    plant(cg, 1.10, 0.50, 0.50, 0);          // the good couch: the room's biggest floor mass
    var cbase = box(2.35, 0.34, 0.86, tweedM); cbase.position.y = 0.24; cg.add(cbase);
    var cback = box(2.35, 0.62, 0.22, tweedM); cback.position.set(0, 0.58, -0.32); cg.add(cback);
    [-1, 1].forEach(function (sd2) {
      var arm = box(0.22, 0.30, 0.86, tweedM); arm.position.set(sd2 * 1.06, 0.50, 0); cg.add(arm);
      // the arm caps, worn shiny, which is the first thing that goes on a couch
      /* ⚠️ a half-cylinder shell has to lie ALONG the arm and open DOWNWARD. The old
       * rotation put its axis on X — across the couch rather than along it — and the
       * default thetaStart then aimed the shell sideways. rotation.x = π/2 alone puts
       * the axis on +Z (along the arm); under that same rotation local -Z maps to +Y,
       * so thetaStart must be +π/2 to keep the half that caps the arm from ABOVE.
       * ⚠️ thetaStart -π/2 keeps the other half and buries the cap inside the arm. */
      var cap3 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.86, 12, 1, false, Math.PI / 2, Math.PI), mat(0x60705a, 0.72));
      cap3.rotation.set(Math.PI / 2, 0, 0); cap3.position.set(sd2 * 1.06, 0.65, 0); cg.add(cap3);
    });
    [-0.58, 0.58].forEach(function (cx) {
      var cush = box(1.06, 0.14, 0.72, mat(0x7a8768, 0.92)); cush.position.set(cx, 0.44, 0.02); cg.add(cush); });
    cg.children.forEach(function (m) { ltag(m, 'the good couch', null, 'plastic came off it in 1994 and it has been downhill since.'); });
    // the baked couch, when its file exists; child[0] is plant()'s shadow disc — keep it
    propSwap('couch', cg, cg.children.slice(1), { w: 2.35, d: 1.15, ry: 0 });
    /* ⚠️ NO PI TURN ON THE GROUP. The screen is built on the cabinet's local -z face, so
     * turning the whole group put it on the SOUTH side — the television was facing the
     * wall and showing the couch its back. Left unturned the screen looks north at the
     * sofa, which is the only direction a television has ever pointed. The small yaw is
     * deliberate: nothing else in here is square either. */
    /* ⚠️ THIS IS WHAT THE RESTING CAMERA IS AIMED AT — the note on P.ldoorL says the
     * seating group was moved specifically so 'what you see through the door' is the
     * set — and it was THREE MESHES: a box, a box, and a flat plane. Thinner than the
     * kitchen's background cooker. A 1990s television is a piece of furniture: it has
     * a bulging glass face, a wood-veneer cabinet, a speaker grille, dial knobs you
     * turned by hand, a standby light and a bent aerial. It has them now.
     * ⚠️ THE FACE IS A SPHERE CAP, NOT A PLANE. A CRT bulges, and that curve is most
     * of what says CRT rather than flatscreen. R 1.15 with a 0.38 rad sweep gives a
     * 0.85 m face bulging 8 cm — geometry, not a texture trick. Its pole points -z
     * (rotation.x -PI/2 maps +Y to -Z), which is the direction the couch is in. */
    var sg = new THREE.Group(); sg.position.set(-12.60, 0, 3.58); sg.rotation.y = 0.06; add(sg);
    plant(sg, 0.62, 0.40, 0.50, 0);          // the set and its stand: the focal prop
    /* ⚠️ THE STAND WAS A SOLID BLOCK, so 'the video' — all three of its meshes — was
     * built inside it and rendered nowhere. A television stand of this era is an open
     * bay with the video in it; that is the whole reason it is a stand and not a table. */
    var stTop = box(1.30, 0.06, 0.46, woodM); stTop.position.y = 0.49; sg.add(stTop);
    /* ⚠️ SOLID SIDE PANELS PUT THE VIDEO STRAIGHT BACK OUT OF SIGHT. The resting
     * camera sits 71 degrees off this set is normal, so it looks almost ALONG the
     * stand is face — and a 0.46-deep bay behind a side panel is sealed from that
     * angle. Measured: 0 of 9 sample points on the video were visible. Four corner
     * posts hold the same top and leave the bay open from every direction, which is
     * what a stand of this era actually is. */
    [[-0.62, -0.20], [0.62, -0.20], [-0.62, 0.20], [0.62, 0.20]].forEach(function (pp3) {
      var post3 = box(0.06, 0.45, 0.06, woodM); post3.position.set(pp3[0], 0.235, pp3[1]); sg.add(post3); });
    // ⚠️ THE BACK PANEL WAS ACROSS THE OPENING. The screen is built on this group is
    // local -z face, so -z is the FRONT — and a back panel at -0.215 walls the bay off
    // from the only direction anyone looks at it. It goes at +0.215.
    var stBack = box(1.18, 0.42, 0.03, woodM); stBack.position.set(0, 0.25, 0.215); sg.add(stBack);
    var stFoot = box(1.30, 0.04, 0.46, woodM); stFoot.position.y = 0.02; sg.add(stFoot);
    var tvb = box(1.02, 0.76, 0.58, mat(0x2b2e33, 0.6)); tvb.position.y = 0.90; sg.add(tvb);
    var venr = box(1.04, 0.10, 0.60, mat(0x5a4632, 0.7)); venr.position.y = 1.24; sg.add(venr);
    /* ⚠️⚠️ I GOT THIS CAP 7.2 cm TOO DEEP AND BURIED THE PICTURE. At R 1.15 swept
     * 0.38 rad the sag is 1.15·(1-cos 0.38) = 0.082, and placing the sphere centre at
     * z 0.85 put the rim at -0.218 — INSIDE a cabinet whose front face is at -0.29. Only
     * the 12.6% of the glass past -0.29 escaped: a 30 cm glowing disc in the middle of
     * a dark 0.82 × 0.62 bezel opening seven times its size.
     * ⚠️ Pushing the same cap forward does not fix it — it would stand the tube 8.5 cm
     * out of a 0.58-deep cabinet and leave the bezel floating in front of the glass.
     * FLATTEN it instead: a much larger radius swept through a much smaller angle keeps
     * the same 0.854 m face (2·2.6·sin 0.165) but drops the sag to 0.035, so the rim
     * lands exactly on the cabinet face and the pole stands 3.5 cm proud — which is
     * what a CRT actually does. The bezel stays where it is and reads correctly. */
    var scr = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 24, 16, 0, Math.PI * 2, 0, 0.165),
      new THREE.MeshStandardMaterial({ color: 0x8fa6c8, emissive: 0x7f9dc4, emissiveIntensity: 0.7, roughness: 0.35 }));
    scr.position.set(0, 0.92, 2.2747); scr.rotation.x = -Math.PI / 2; sg.add(scr);
    // the bezel, four boards round the glass, standing 2 cm proud of it
    [[0.92, 0.05, 0, 0.335], [0.92, 0.05, 0, -0.335], [0.05, 0.72, 0.435, 0], [0.05, 0.72, -0.435, 0]]
      .forEach(function (bz) {
        var bm2 = box(bz[0], bz[1], 0.05, mat(0x33373d, 0.55));
        bm2.position.set(bz[2], 0.92 + bz[3], -0.285); sg.add(bm2);
      });
    // the speaker grille down the right-hand side, and the two dials under it
    var grl = box(0.14, 0.44, 0.02, mat(0x24272b, 0.85)); grl.position.set(0.43, 0.98, -0.30); sg.add(grl);
    for (var gs = 0; gs < 7; gs++) {
      var slat2 = box(0.12, 0.012, 0.012, mat(0x15171a, 0.9));
      slat2.position.set(0.43, 1.16 - gs * 0.056, -0.312); sg.add(slat2);
    }
    [[0.43, 0.70], [0.43, 0.60]].forEach(function (kn2, ki) {
      var dial = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.026, 14), mat(0x8a8f96, 0.4));
      dial.rotation.x = Math.PI / 2; dial.position.set(kn2[0], kn2[1], -0.305);
      dial.rotation.z = ki ? 0.6 : -1.1; sg.add(dial);
      var nub = box(0.006, 0.024, 0.008, mat(0x2b2e33, 0.5));
      nub.position.set(kn2[0] + (ki ? 0.012 : -0.018), kn2[1] + 0.016, -0.318); sg.add(nub);
    });
    var led2 = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff3a26, emissiveIntensity: 1.4, roughness: 0.4 }));
    led2.position.set(0.43, 0.52, -0.30); sg.add(led2);
    // the aerial, bent the way every aerial in the world ends up bent
    [[-0.22, 1.0, 0.42], [0.22, -1.0, 0.30]].forEach(function (ae) {
      var rod2 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.62, 6), mat(0x9aa1a9, 0.35));
      rod2.position.set(ae[0], 1.52, 0.10); rod2.rotation.z = ae[1] * ae[2]; sg.add(rod2);
      var rod3 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.34, 6), mat(0x9aa1a9, 0.35));
      rod3.position.set(ae[0] + ae[1] * 0.30, 1.80, 0.10); rod3.rotation.z = ae[1] * (ae[2] + 0.22); sg.add(rod3);
    });
    var aBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 12), mat(0x2b2e33, 0.5));
    aBase.position.set(0, 1.30, 0.10); sg.add(aBase);
    sg.children.forEach(function (m) { ltag(m, 'the big set', null, 'twenty-seven inches and it took two people to carry.'); });
    // the video, because there was always a video under the television
    // ⚠️ y 0.60 was inside the cabinet body (0.52..1.28). The bay's clear height runs
    // 0.04..0.46, so the video sits at 0.115 with its face at the bay's front edge.
    var vcr = box(0.86, 0.11, 0.40, mat(0x3a3f46, 0.5));
    vcr.position.set(-12.62, 0.115, 3.58); vcr.rotation.y = 0.06; add(vcr);
    var vslot = box(0.52, 0.016, 0.02, mat(0x15171a, 0.9));
    vslot.position.set(-12.63, 0.115, 3.375); vslot.rotation.y = 0.06; add(vslot);
    var vclk = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x0c1a14, emissive: 0x2bd07a, emissiveIntensity: 0.9, roughness: 0.5 }));
    // ⚠️ the cabinet is yawed, so the front face is at a DIFFERENT z at every x — my
    // arithmetic put this 7 mm inside the body. 3.351 is measured off the real surface
    // at this exact x (3.361), not derived.
    vclk.position.set(-12.33, 0.120, 3.351); vclk.rotation.y = Math.PI + 0.06; add(vclk);
    [vcr, vslot, vclk].forEach(function (m) {
      ltag(m, 'the video', null, 'still blinking 12:00. it has been blinking 12:00 since it came out of the box.');
    });
    var ct = box(1.20, 0.06, 0.56, woodM); ct.position.set(-12.60, 0.40, 2.30); add(ct);
    (function () { var sh = plant(g, 0.58, 0.38, 0.45, 0); if (sh) sh.position.set(-12.60, 0.016, 2.30); })();   // coffee table
    [[-0.53, -0.22], [0.53, -0.22], [-0.53, 0.22], [0.53, 0.22]].forEach(function (lp) {
      var lg2 = box(0.06, 0.40, 0.06, woodM); lg2.position.set(-12.60 + lp[0], 0.20, 2.30 + lp[1]); add(lg2); });
    ltag(ct, 'the coffee table', null, 'one ring you can still see, from before anyone used coasters.');
    var rem = box(0.06, 0.025, 0.17, mat(0x2b2e33, 0.6)); rem.position.set(-12.30, 0.445, 2.40); rem.rotation.y = 0.4; add(rem);
    ltag(rem, 'the remote', null, 'found. put it back where it was.');
    var lampG = new THREE.Group(); lampG.position.set(-16.35, 0, 3.50); add(lampG);
    plant(lampG, 0.28, 0.28, 0.40, 0);
    var lpole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.42, 8), mat(0x8a7a5a, 0.5));
    lpole.position.y = 0.71; lampG.add(lpole);
    var lbase = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.04, 12), mat(0x6a5a42, 0.6));
    lbase.position.y = 0.02; lampG.add(lbase);
    var lshade = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.26, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf0e2bc, emissive: 0xffd9a0, emissiveIntensity: 0.5,
        roughness: 0.9, side: THREE.DoubleSide }));
    lshade.position.y = 1.52; lampG.add(lshade);
    lampG.children.forEach(function (m) { ltag(m, 'the corner lamp', null, 'the only light anyone ever turns on in here.'); });
    var lLite = new THREE.PointLight(0xffd2a0, 0.85, 6.5, 1.9); lLite.position.set(-16.35, 1.52, 3.50); add(lLite);
    var lTv = new THREE.PointLight(0x9db8ff, 0.55, 5.5, 2.0); lTv.position.set(-12.60, 1.05, 3.30); add(lTv);
    /* ---- THE THINGS THAT MAKE IT LIVED IN --------------------------------------
     * ⚠️ MEASURED AGAINST THE BEDROOM, this room failed three of its tests outright.
     * The bedroom spreads 56 named props across four planes — 15 floor, 15 surface,
     * 25 wall, 1 ceiling. This room had 5 floor, 3 wall, and ZERO on surfaces or the
     * ceiling, which is an automatic fail: a room where nothing sits on anything and
     * nothing hangs overhead reads as furniture delivered, not a room used. It was
     * also 94% axis-aligned against the bedroom's 67%, so everything sat square to
     * the walls like a showroom. Everything below is on a surface, a wall or the
     * ceiling, and almost none of it is square. */
    var paperM = mat(0xe4dcc4, 0.95), brassM = new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.35, metalness: 0.6 });

    // ---- ON THE COFFEE TABLE ----
    var guideT = canvasTex(96, 128, function (c, w, h) {
      c.fillStyle = '#d8cdb4'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#8a2f2a'; c.fillRect(0, 0, w, 26);
      c.fillStyle = '#f2ece0'; c.font = 'bold 15px Georgia, serif'; c.textAlign = 'center';
      c.fillText('TV GUIDE', w / 2, 18);
      c.fillStyle = 'rgba(60,50,36,0.45)';
      for (var g = 0; g < 7; g++) c.fillRect(9, 40 + g * 11, w - 18 - (g % 3) * 12, 4);
      c.strokeStyle = 'rgba(60,50,36,0.5)'; c.lineWidth = 2; c.strokeRect(8, 34, w - 16, 84);
    });
    guideT.colorSpace = THREE.SRGBColorSpace;
    var guide = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.23),
      [mat(0xd8cdb4, 0.95), mat(0xd8cdb4, 0.95), new THREE.MeshStandardMaterial({ map: guideT, roughness: 0.95 }),
       mat(0xcdc2a8, 0.95), mat(0xd8cdb4, 0.95), mat(0xd8cdb4, 0.95)]);
    guide.position.set(-12.94, 0.436, 2.21); guide.rotation.y = 0.34; add(guide);
    ltag(guide, 'the TV guide', null, 'this week is circled. so is a week from 1996 that nobody has thrown out.');
    var mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.09, 14), mat(0xdfe6ea, 0.5));
    mug.position.set(-12.02, 0.475, 2.38); add(mug);
    var mugH = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 6, 12), mat(0xdfe6ea, 0.5));
    mugH.rotation.y = Math.PI / 2; mugH.position.set(-11.97, 0.478, 2.38); add(mugH);
    var mugTea = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 14), mat(0x53341c, 0.4));
    mugTea.position.set(-12.02, 0.515, 2.38); add(mugTea);
    [mug, mugH, mugTea].forEach(function (m) { ltag(m, 'the mug', null, 'gone cold an hour ago. it will be reheated and go cold again.'); });
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.037, 0.046, 16), new THREE.MeshStandardMaterial({
      color: 0x6a4a30, transparent: true, opacity: 0.30, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(-12.55, 0.432, 2.15); add(ring);
    ltag(ring, 'the ring', null, 'from before anyone in this house used a coaster. it is part of the table now.');
    var coasters = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.014, 14), mat(0x7a6a4a, 0.9));
    coasters.position.set(-11.72, 0.437, 2.14); coasters.rotation.y = 0.5; add(coasters);
    ltag(coasters, 'the coasters', null, 'bought after the ring. never once used before a drink went down.');

    // ---- A SIDE TABLE, AND WHAT LIVES ON IT ----
    var stG = new THREE.Group(); stG.position.set(-10.42, 0, 1.16); stG.rotation.y = -0.17; add(stG);
    plant(stG, 0.30, 0.30, 0.40, 0);
    var stTop = box(0.52, 0.05, 0.52, woodM); stTop.position.y = 0.60; stG.add(stTop);
    var stShelf = box(0.46, 0.03, 0.46, woodM); stShelf.position.y = 0.28; stG.add(stShelf);
    [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(function (lp) {
      var lg3 = box(0.05, 0.60, 0.05, woodM); lg3.position.set(lp[0], 0.30, lp[1]); stG.add(lg3); });
    stG.children.forEach(function (m) { ltag(m, 'the side table', null, 'wobbles. there is a folded envelope under one leg and it has been there for years.'); });
    // the telephone, cord and all
    var phG = new THREE.Group(); phG.position.set(-10.42, 0.625, 1.16); phG.rotation.y = 0.28; add(phG);
    var phBody = box(0.20, 0.055, 0.15, mat(0x2b2e33, 0.55)); phBody.position.y = 0.028; phG.add(phBody);
    var phCradle = box(0.21, 0.045, 0.06, mat(0x22252a, 0.55)); phCradle.position.set(0, 0.075, -0.04); phG.add(phCradle);
    var phHand = box(0.055, 0.04, 0.19, mat(0x22252a, 0.5)); phHand.position.set(0, 0.10, 0.01); phHand.rotation.z = 0.04; phG.add(phHand);
    for (var kd = 0; kd < 12; kd++) {
      var key = box(0.028, 0.008, 0.022, mat(0xdad4c4, 0.6));
      key.position.set(-0.05 + (kd % 3) * 0.05, 0.058, 0.005 + Math.floor(kd / 3) * 0.028); phG.add(key);
    }
    var cordC = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, 0.09, 0.09), new THREE.Vector3(0.16, 0.02, 0.16),
      new THREE.Vector3(0.26, -0.30, 0.10), new THREE.Vector3(0.20, -0.58, 0.02)], false, 'centripetal');
    var cord = new THREE.Mesh(new THREE.TubeGeometry(cordC, 18, 0.009, 5, false), mat(0x22252a, 0.6));
    phG.add(cord);
    phG.children.forEach(function (m) { ltag(m, 'the telephone', null, 'the cord reaches exactly as far as the doorway and no further. everyone knows the spot.'); });
    var pad2 = box(0.11, 0.01, 0.15, paperM); pad2.position.set(-10.16, 0.632, 1.34); pad2.rotation.y = 0.62; add(pad2);
    ltag(pad2, 'the message pad', null, 'a number, no name, and CALL BACK underlined twice.');
    // magazines on the lower shelf
    [[0x8a5a4a, 0.0, 0.22], [0x4a6a8a, 0.014, -0.14], [0x6a7a4a, 0.028, 0.35]].forEach(function (mg) {
      var mag = box(0.20, 0.012, 0.26, mat(mg[0], 0.92));
      mag.position.set(-10.42 + Math.sin(mg[2]) * 0.05, 0.30 + mg[1], 1.16 + Math.cos(mg[2]) * 0.04);
      mag.rotation.y = mg[2]; add(mag);
      ltag(mag, 'the magazines', null, 'nobody subscribes to any of these. they simply arrive.');
    });

    /* ⚠️ THE ONE ROOM WITH NO SKIRTING. The hall builds three boards under a double
     * warning about why they must be BOXES standing proud and not planes at +0.001
     * ('the running boards flashing'), and the kitchen copies it with a comment saying
     * so. This room got neither, so its walls met its floor at a bare seam.
     * ⚠️ Boxes, 0.02 proud. Do not 'simplify' this to a plane. */
    [[(LIV.x0 + LIV_SE) / 2, LIV.z0 + 0.01, LIV_SE - LIV.x0, 0.02],
     [(LIV.x0 + LIV_SE) / 2, LIV.z1 - 0.01, LIV_SE - LIV.x0, 0.02],
     [LIV.x0 + 0.01, (LIV.z0 + LIV.z1) / 2, 0.02, LIV.z1 - LIV.z0]].forEach(function (sk2) {
      var skb = box(sk2[2], 0.14, sk2[3], mat(0x241b12, 0.85));
      skb.position.set(sk2[0], 0.07, sk2[1]); add(skb);
    });
    // and the doorway gets the jambs and head every other doorway in the house has
    /* ⚠️⚠️ THIS CASING WAS BUILT INSIDE THE WALL, ON THE WRONG FACE OF IT. LIV.x1 IS
     * W_IN — the wall's HALL face — so a 0.10 board at LIV.x1-0.03 spanned
     * -7.530..-7.430: 0.080 buried in the hall wall, 0.020 poking into the HALL, its z
     * faces landing exactly on the opening's cut edges and its head's underside exactly
     * on the header's soffit. 0.443 m² of coincident wall around one doorway. The
     * living room's own face of that wall is x -7.550; the casing stands proud of THAT
     * now and shares no plane with anything. */
    var LCAS = 0.022, LCX = W_IN - 0.10 - LCAS / 2;   // back face butts the wall at -7.550
    [[LDO.z0 - 0.020], [LDO.z1 + 0.020]].forEach(function (jz) {
      var jm2 = box(LCAS, LDO.y1 - 0.03, 0.07, mat(0xd8d2c2, 0.8));
      jm2.position.set(LCX, (LDO.y1 - 0.03) / 2, jz[0]); add(jm2);
    });
    var jhd = box(LCAS, 0.08, LDO.z1 - LDO.z0 + 0.22, mat(0xd8d2c2, 0.8));
    jhd.position.set(LCX, LDO.y1 + 0.01, (LDO.z0 + LDO.z1) / 2); add(jhd);
    // ---- ON THE WALLS ----
    var frameM = mat(0x4a3524, 0.7);
    function wallPic(px, pz, ry, w2, h2, tilt, draw, name, hint) {
      var t4 = canvasTex(96, 96, draw); t4.colorSpace = THREE.SRGBColorSpace;
      var pic = new THREE.Mesh(new THREE.PlaneGeometry(w2 - 0.06, h2 - 0.06),
        new THREE.MeshStandardMaterial({ map: t4, roughness: 0.9 }));
      pic.position.set(px, 1.62, pz); pic.rotation.y = ry; pic.rotation.z = tilt; add(pic);
      /* ⚠️ box(w, h, d) maps straight to BoxGeometry(x, y, z), so box(0.03, h2, w2)
       * put the frame's WIDTH on z — a 42 cm blade sticking into the room at right
       * angles to its own picture, tilted about the wrong axis on top of that. The
       * picture is a plane in XY; its frame has to be too. */
      var fr = box(w2, h2, 0.03, frameM);
      /* ⚠️ 0.014 WAS NOT ENOUGH AND THE FRAME COVERED THE ART. The frame is 0.03 deep,
       * so half of it (0.015) reaches back toward the viewer — at an offset of 0.014
       * its near face ended up 1 mm PROUD of the picture plane, and since the frame is
       * a solid box the full size of the art, it hid all of it. 0.020 puts the near
       * face 5 mm behind the picture. Three pictures here, and the same arithmetic
       * caught six more elsewhere on the landing. */
      fr.position.set(px - Math.sin(ry) * 0.020, 1.62, pz - Math.cos(ry) * 0.020);
      fr.rotation.y = ry; fr.rotation.z = tilt; add(fr);
      [pic, fr].forEach(function (m) { ltag(m, name, null, hint); });
    }
    // three on the north wall, each hung a different amount of crooked
    wallPic(-14.30, LIV.z0 + 0.09, 0, 0.42, 0.34, 0.021, function (c, w, h) {
      c.fillStyle = '#cfd8c4'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#8aa07a'; c.fillRect(0, h * 0.58, w, h * 0.42);
      c.fillStyle = '#6a8a5a'; for (var t5 = 0; t5 < 6; t5++) { c.beginPath();
        c.moveTo(10 + t5 * 15, h * 0.60); c.lineTo(16 + t5 * 15, h * 0.34); c.lineTo(22 + t5 * 15, h * 0.60); c.fill(); }
      c.fillStyle = 'rgba(240,236,224,0.75)'; c.beginPath(); c.arc(w * 0.74, h * 0.24, 9, 0, 7); c.fill();
    }, 'the pines', 'bought at a yard sale because the frame was good. the picture stayed anyway.');
    wallPic(-13.10, LIV.z0 + 0.09, 0, 0.30, 0.36, -0.016, function (c, w, h) {
      c.fillStyle = '#e8e2d0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#b8ae96'; c.fillRect(8, 8, w - 16, h - 16);
      c.fillStyle = '#6a5a44'; c.beginPath(); c.arc(w / 2, h * 0.42, 15, 0, 7); c.fill();
      c.fillRect(w / 2 - 17, h * 0.56, 34, 26);
      c.fillStyle = '#3a2f22'; c.font = 'italic 11px Georgia, serif'; c.textAlign = 'center';
      c.fillText('1994', w / 2, h - 12);
    }, 'the school photo', 'the year of the bowl cut. it is never coming down and everybody knows why.');
    wallPic(-11.95, LIV.z0 + 0.09, 0, 0.36, 0.28, 0.013, function (c, w, h) {
      c.fillStyle = '#dfe6ea'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4a6a8a'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(6, h * 0.72); c.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.86, w - 6, h * 0.6); c.stroke();
      c.fillStyle = '#8a9aa8'; c.fillRect(0, h * 0.78, w, h * 0.22);
      c.fillStyle = 'rgba(90,120,150,0.5)'; c.beginPath(); c.arc(w * 0.22, h * 0.26, 12, 0, 7); c.fill();
    }, 'the lake picture', 'somebody was told it was worth something. nobody has ever checked.');
    // the wall clock, with real hands
    var clkG = new THREE.Group(); clkG.position.set(-15.85, 1.98, LIV.z0 + 0.10); clkG.rotation.z = -0.012; add(clkG);
    var clkFace = new THREE.Mesh(new THREE.CircleGeometry(0.135, 24), mat(0xf0ece0, 0.85));
    clkFace.position.z = 0.012; clkG.add(clkFace);
    var clkRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 8, 24), mat(0x6a4a30, 0.7));
    clkG.add(clkRim);
    for (var tk = 0; tk < 12; tk++) {
      var big = tk % 3 === 0;
      var tick = box(big ? 0.014 : 0.007, big ? 0.028 : 0.018, 0.004, mat(0x2b2e33, 0.7));
      var ang = tk / 12 * Math.PI * 2;
      tick.position.set(Math.sin(ang) * 0.112, Math.cos(ang) * 0.112, 0.016);
      tick.rotation.z = -ang; clkG.add(tick);
    }
    var hrH = box(0.010, 0.070, 0.004, mat(0x2b2e33, 0.7));
    hrH.position.set(0.019, 0.030, 0.019); hrH.rotation.z = -0.9; clkG.add(hrH);
    var mnH = box(0.008, 0.104, 0.004, mat(0x2b2e33, 0.7));
    mnH.position.set(-0.030, 0.038, 0.019); mnH.rotation.z = 0.62; clkG.add(mnH);
    clkG.children.forEach(function (m) { ltag(m, 'the clock', null, 'eleven minutes fast, like the one in the kitchen. the whole house runs early.'); });

    // ---- ON THE CEILING ----
    // ⚠️ the ceiling's underside is LIV.ce + 0.05 - 0.05 = LIV.ce; the plate's top
    // face sits 0.005 above the group, so the group belongs at ce + 0.005, not ce -
    // 0.02, which left the rose floating with daylight in the gap.
    var cfG = new THREE.Group(); cfG.position.set(-12.40, LIV.ce + 0.005, 2.30); add(cfG);
    var cfPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.05, 14), mat(0xdad4c4, 0.6));
    cfPlate.position.y = -0.03; cfG.add(cfPlate);
    var cfBowl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48),
      new THREE.MeshStandardMaterial({ color: 0xf2ead2, emissive: 0xffd9a0, emissiveIntensity: 0.42,
        roughness: 0.85, side: THREE.DoubleSide }));
    cfBowl.position.y = -0.16; cfG.add(cfBowl);
    var cfNut = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), brassM);
    cfNut.position.y = -0.30; cfG.add(cfNut);
    cfG.children.forEach(function (m) { ltag(m, 'the ceiling light', null, 'two dead flies in the bowl. it will be taken down and washed one of these days.'); });
    /* ⚠️ 21 NAMED PROPS AND ZERO ACTIONS — every ltag in this room passed null, the
     * only interior space in the house with nothing to do in it. The wall beside the
     * doorway was also the one stretch with no furniture on it at all, so the switch
     * solves both at once. */
    /* ⚠️ NOTHING IN THIS ROOM MOVED — the only interior space in the file with no
     * per-frame life, while the hall has dust, the kitchen has steam and a dripping
     * tap, and the basement has static and fish. The corner lamp throws the one hard
     * beam in here, so that is where the dust goes, exactly as the hall does it. */
    var lDust = [];
    for (var ld2 = 0; ld2 < 16; ld2++) {
      var dm2 = new THREE.Mesh(new THREE.SphereGeometry(0.007, 5, 4),
        new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.24, depthWrite: false }));
      dm2.position.set(-16.35 + (ld2 % 5 - 2) * 0.12, 0.5 + (ld2 % 7) * 0.18, 3.50 + (ld2 % 3 - 1) * 0.14);
      add(dm2);
      lDust.push({ m: dm2, x: dm2.position.x, z: dm2.position.z, y: dm2.position.y,
                   sp: 0.4 + (ld2 % 5) * 0.13, ph: ld2 * 1.7 });
    }
    livingLife = function (dt2, t2, lampOn) {
      for (var i2 = 0; i2 < lDust.length; i2++) {
        var d3 = lDust[i2];
        d3.y += dt2 * d3.sp * 0.08;
        if (d3.y > 1.72) d3.y = 0.42;
        d3.m.position.set(d3.x + Math.sin(t2 * 0.31 + d3.ph) * 0.10, d3.y,
                          d3.z + Math.cos(t2 * 0.24 + d3.ph * 1.3) * 0.09);
        d3.m.material.opacity = 0.24 * lampOn * (0.5 + 0.5 * Math.sin(t2 * 0.7 + d3.ph));
      }
    };
    /* ⚠️⚠️ THE LIVING ROOM WAS A ONE-WAY TRAP. leaveLiving() existed, was exported,
     * and was called by NOTHING — and the two things you would click to get out, the
     * door slab and its hit box, are registered through tag(), which stamps
     * userData.space = 'hall'. room.js's inSpace filter drops them from the pick list
     * the instant space becomes 'living', so from inside the room they are not even
     * candidates. Every other space has a back-hit (kBackHit, gBackHit, bBackHit,
     * bsUpHit, upDownHit); this room never got one.
     * ⚠️ MY OWN TESTS PASSED BECAUSE THEY CALLED hall.living.leave() THROUGH THE
     * EXPORT. That tests the API, not the player. A space is only leavable if
     * something a person can reach calls the function.
     * ⚠️ It sits where P.llookB aims — the view you get after turning round — because
     * the resting camera faces due WEST and anything by the door is ~160 degrees off
     * axis. That is the house's established pattern (kBackHit and bsUpHit are behind
     * their resting cameras too), and it is why the turn button MUST be enabled for
     * this space in the same patch. */
    var lOutHit = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.00, 0.98),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    lOutHit.position.set(LIV.x1 - 0.16, 1.04, (LDO.z0 + LDO.z1) / 2); add(lOutHit);
    ltag(lOutHit, 'the hallway', function () { leaveLiving(); },
      'back out to the hall.');
    var lswP = box(0.02, 0.13, 0.09, mat(0xf0ece0, 0.6));
    lswP.position.set(LIV.x1 - 0.02, 1.15, LDO.z1 + 0.42); add(lswP);
    var lswT = box(0.018, 0.038, 0.022, mat(0xdad4c4, 0.5));
    lswT.position.set(LIV.x1 - 0.035, 1.17, LDO.z1 + 0.42); lswT.rotation.z = 0.22; add(lswT);
    [lswP, lswT].forEach(function (m) {
      ltag(m, 'the light switch', function () {
        livOn = !livOn;
        lswT.rotation.z = livOn ? 0.22 : -0.22;
        AUDIO.clickSfx && AUDIO.clickSfx(livOn ? 1750 : 1150);
      }, 'painted over so many times the plate is part of the wall now.');
    });
    var cfLite = new THREE.PointLight(0xffd2a0, 0.62, 7.5, 1.9);
    livLightH = { lamp: lLite, tv: lTv, ceil: cfLite, shade: lshade.material, bowl: cfBowl.material, scr: scr.material };
    cfLite.position.set(-12.40, LIV.ce - 0.30, 2.30); add(cfLite);

    // ---- AND SOME THINGS ON THE FLOOR THAT ARE NOT FURNITURE ----
    var slipA = box(0.11, 0.055, 0.26, mat(0x6a5a4a, 0.95));
    slipA.position.set(-11.10, 0.028, 1.06); slipA.rotation.y = 0.42; add(slipA);
    var slipB = box(0.11, 0.055, 0.26, mat(0x6a5a4a, 0.95));
    slipB.position.set(-11.24, 0.028, 0.92); slipB.rotation.y = 0.86; add(slipB);
    [slipA, slipB].forEach(function (m) { ltag(m, 'the slippers', null, 'kicked off pointing in two different directions, which is how they always end up.'); });
    var basket = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.17, 0.30, 12, 1, true), mat(0x8a6a3a, 0.95));
    basket.position.set(-16.05, 0.15, 1.05); basket.rotation.y = 0.3; add(basket);
    var basketR = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.016, 6, 14), mat(0x7a5a30, 0.95));
    basketR.rotation.x = Math.PI / 2; basketR.position.set(-16.05, 0.30, 1.05); add(basketR);
    [[0x9a5f4a, 0.06, 0.35], [0x4a6a8a, 0.10, -0.4], [0x8a8a4a, 0.02, 1.1]].forEach(function (rl) {
      var roll = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), mat(rl[0], 0.92));
      roll.position.set(-16.05 + Math.sin(rl[2]) * 0.07, 0.19 + rl[1], 1.05 + Math.cos(rl[2]) * 0.06);
      roll.rotation.set(0.22, rl[2], 0.12); add(roll);
    });
    [basket, basketR].forEach(function (m) { ltag(m, 'the magazine basket', null, 'wicker, going soft at the rim. holds three newspapers and a catalogue from last spring.'); });

  })();
  var lDoorPivot = new THREE.Group(); lDoorPivot.position.set(W_IN - 0.03, 0, LDO.z0); add(lDoorPivot);
  /* ⚠️ CUT TO LDO, not to the house's stock 2.05. This doorway's head lining sits
   * ABOVE its opening instead of lining it the way the kitchen's and garage's do, so
   * the clear frame here is the full 0.94 x 2.24 — and a 2.05 slab left a 0.94 x 0.19
   * hole over the shut door (Kyle: the living room door doesn't fill the frame).
   * Derived so it cannot drift again. The hinge edge is still local z 0, so the swing
   * is untouched. */
  var lSlab = box(0.05, LDO.y1, LDO.z1 - LDO.z0, mat(0x4a3524, 0.72));
  lSlab.position.set(0, LDO.y1 / 2, (LDO.z1 - LDO.z0) / 2); lDoorPivot.add(lSlab);
  // ⚠️ mat() sets colour and roughness only, so metalness stays 0 — this was a
  // brass-COLOURED matte ball, while the kitchen's knob 120 lines away is real brass
  // and the ceiling rose's nut in this very room uses a proper brass material.
  var lKnob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xc8b06a, roughness: 0.3, metalness: 0.65 }));
  lKnob.position.set(-0.05, 1.00, 0.84); lDoorPivot.add(lKnob);
  var lSpill = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.96),
    new THREE.MeshBasicMaterial({ color: 0x9db8ff, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  lSpill.rotation.x = -Math.PI / 2; lSpill.position.set(W_IN - 0.16, 0.012, (LDO.z0 + LDO.z1) / 2); add(lSpill);
  var lSpillOp = 0.2;
  var lHit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.0, 0.98),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  lHit.position.set(W_IN - 0.02, 1.02, (LDO.z0 + LDO.z1) / 2); add(lHit);
  [lHit, lSlab].forEach(function (m) {
    tag(m, 'the living room', function () { enterLiving(); },
      'the living room — the good couch, the big set, and the window onto the drive');
  });

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
    m.userData.__swings = 1;   // hinged on the hall wall, opens INTO the kitchen
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
  /* ⚠️⚠️ THE FLIGHT MOVED OFF THE WEST WALL AND INTO THE MIDDLE OF THE HALL. Hard
   * against the wall is right for an eight-step stub that stops at z -3.0. A full
   * nineteen-riser run has to reach z 2.04, and along the west wall that is straight
   * across the kitchen doorway (z -0.90..0.20) AND the living room doorway (1.44..2.38)
   * — measured, the walk to the kitchen came out through the treads in both directions.
   * The hall is 3.10 wide, so a 0.92 flight down the centre leaves 1.03m each side,
   * which is a real landing strip past a real staircase. */
  /* ⚠️⚠️ AND NOT THE MIDDLE EITHER. Centred, the flight blocks the hall along its
   * LENGTH — every walk north (kitchen, porch) went straight through the treads.
   * The hall is full: the west wall has the kitchen (z -0.90..0.20), the living room
   * (1.44..2.38) and the garage (5.08..6.12); the east wall has the photo wall
   * (-2.85..1.15), the bedroom door (1.65..2.55) and the closet (7.24..8.16). The one
   * clear run long enough for a staircase is the EAST wall between the bedroom door
   * and the closet — 4.7m — so that is where it goes, climbing north. */
  /* ⚠️ THE FLIGHT IS ON THE WEST WALL AND CLIMBS NORTH. 1c4ea28 tested four
   * placements and rejected the west wall on a flight climbing SOUTH from z -3.0,
   * which does cross the kitchen and living-room doorways. Climbing NORTH from the
   * south end crosses neither: the nosing stops at z 2.53 and the living room's
   * doorway ends at 2.38. The only thing in the way was the garage door, and that
   * moved south. This puts the up-stair and the basement down-stair on the same
   * wall about a metre apart, which is what a real house does, and it frees the
   * whole east back wall (laundry, mud room, closet) to be read as one run.
   * RAIL_X is used now — it used to be declared here and never referenced, a fossil
   * of an earlier west-wall attempt. The rail goes on the OPEN side, which is east. */
  var STAIR_X = W_IN + 0.50, RAIL_X = STAIR_X + 0.50;
  /* ⚠️⚠️ ONE STRAIGHT FLIGHT, AND THE SWITCHBACK IS WHY. The old stub was eight
   * risers climbing NORTH — 1.48m, which is half a storey, ending at a landing with a
   * taped door on it. My first attempt at the rest was a switchback turning on that
   * landing and climbing back south above itself, which is what you would build in a
   * real house. It does not fit HERE: the well is 1.25m wide so the two flights have
   * to stack, and with a 3.45m total rise over a shared 2.1m run they end up 1.20m
   * apart where they cross. You cannot walk under that — measured, the camera came
   * out through the treads of the upper flight twice.
   * The hall is 8m long, so a single straight run solves it, and you arrive facing
   * down the landing instead of at a wall.
   * ⚠️⚠️ THE NUMBERS THAT USED TO BE IN THIS PARAGRAPH DESCRIBED A FLIGHT THAT WAS
   * NEVER BUILT — 'nineteen risers of 0.182 climbing SOUTH from z -3.0, about 31
   * degrees, arriving at z 2.04'. What is four lines below is SIXTEEN risers of
   * 3.45/16 = 0.2156 on a 0.275 going, which is 38.1 degrees, climbing NORTH from
   * z 7.05 to a top tread at z 2.925. Every figure was wrong including the direction.
   * A comment that lies is worse than no comment: the next session reads it, trusts
   * it, and builds against geometry that does not exist. If you change the flight,
   * change this paragraph in the same edit. */
  /* ⚠️ UP_Y is the FLOOR ABOVE and it is declared here, with the flight that reaches
   * it, because that is the one number both have to agree on. It is 3.45 because the
   * stairwell lid sat there, and the flight is sixteen risers of exactly 3.45/16 so
   * the top tread IS the floor rather than nearly it. (This paragraph said NINETEEN
   * for a while, three lines above sixteen. See the warning above.) */
  var UP_Y = 3.45;
  // sixteen risers of 0.216 on a 0.275 going: 38 degrees, which is steep and is what
  // a house of this age actually has when the hall is this full
  var UP_RISE = UP_Y / 16, UP_GO = 0.275, UP_Z0 = 7.24;   // low end z 7.08..7.40, nosing centre 2.84
  /* ⚠️ THE FLIGHT HAD A SLOT BETWEEN EVERY STEP. The rise is 0.2156 and the tread
   * box was 0.18 tall, so consecutive treads missed each other by 3.6 cm — sixteen
   * horizontal slits you could see the room beyond through, which is most of why
   * the staircase read as scaffolding rather than joinery (Kyle: you can see through
   * it). The box is now a hair TALLER than the rise so the steps overlap and close
   * the flight; the top face still lands exactly on (st+1)*UP_RISE, because that is
   * what makes the sixteenth tread BE the floor above. */
  var UP_TREAD_H = UP_RISE + 0.03;
  for (var st = 0; st < 16; st++) {
    var step = new THREE.Mesh(new THREE.BoxGeometry(0.92, UP_TREAD_H, UP_GO + 0.05), stairM);
    step.position.set(STAIR_X, (st + 1) * UP_RISE - UP_TREAD_H / 2, UP_Z0 - st * UP_GO);
    step.castShadow = step.receiveShadow = true; add(step);
    if (st === 3) tag(step, "the stairs up", function () { enterUpstairs(); },
      "her room, their room, and the attic. mind the third step.");
  }
  /* ⚠️ THE TOP TREAD ENDED AT z 2.7625 AND THE FLOOR STARTED AT 2.45 — a 31 cm hole
   * you walked over on the way up. A real stair finishes with a nosing that laps the
   * landing; one mesh closes it and is what the joinery would actually be. */
  var nosing = new THREE.Mesh(new THREE.BoxGeometry(0.92, UP_TREAD_H, 0.62), stairM);
  nosing.position.set(STAIR_X, UP_Y - UP_TREAD_H / 2, UP_Z0 - 16 * UP_GO);
  nosing.castShadow = nosing.receiveShadow = true; add(nosing);
  // the rail up the open side
  (function () {
    var rz0 = UP_Z0, rz1 = UP_Z0 - 15 * UP_GO, ry0 = UP_RISE + 0.86, ry1 = 16 * UP_RISE + 0.86;
    var rail = box(0.05, 0.05, Math.hypot(rz1 - rz0, ry1 - ry0), mat(0x3a2c1c, 0.7));
    rail.position.set(RAIL_X, (ry0 + ry1) / 2, (rz0 + rz1) / 2);
    rail.rotation.x = -Math.atan2(ry1 - ry0, rz1 - rz0); add(rail);
    for (var rp = 0; rp <= 5; rp++) {
      var t2 = rp / 5;
      var po = box(0.045, 0.90, 0.045, mat(0x3a2c1c, 0.7));
      po.position.set(RAIL_X, ry0 + t2 * (ry1 - ry0) - 0.45, rz0 + t2 * (rz1 - rz0)); add(po);
    }
  })();
  // The flight lands on a real landing and meets a real door — taped like every
  // other room in this house, because upstairs isn't yours yet either. (It used to
  // end in a flat black plane, which read as an unfinished wall rather than a way
  // up.) Top step surface is y 1.475, so everything up here is measured off that.
  /* ⚠️ THE HALF-LANDING AND ITS TAPED DOOR ARE GONE. They existed because the
   * flight stopped halfway and had to stop AT something — the door was the promise
   * that upstairs was real. The flight runs the whole way now, so a landing in the
   * middle of it would be a step 62cm deep and the door would open into thin air. */
  var LAND_Y = 1.475;   // kept: the UPSTAIRS sign and the wall art still hang off it
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
  /* ⚠️ THE SHAFT. A hole in a floor is not an opening until it has SIDES. Cutting
   * the lawn out from under the stairwell opened the view down — and also opened the
   * view SIDEWAYS, because below the boards the well had nothing around it: from
   * halfway down you looked out under the house and saw the front lawn past the edge
   * of the cut. Three walls (the south side is where the flight carries on into the
   * basement) close the joist space from the floor down to the basement ceiling, all
   * the way along the run so the whole descent is enclosed. */
  var shaftM = mat(0x4a443c, 0.95);
  var SH_Z0 = HOLE.z0 - 0.06, SH_Z1 = 2.75, SH_TOP = 0.02, SH_BOT = -0.34;
  [[HOLE.x0 - 0.05, 0.10, SH_Z1 - SH_Z0],
   [HOLE.x1 + 0.05, 0.10, SH_Z1 - SH_Z0]].forEach(function (w2) {
    var sw = box(w2[1], SH_TOP - SH_BOT, w2[2], shaftM);
    sw.position.set(w2[0], (SH_TOP + SH_BOT) / 2, (SH_Z0 + SH_Z1) / 2); add(sw);
  });
  var shN = box(HOLE.x1 - HOLE.x0 + 0.2, SH_TOP - SH_BOT, 0.10, shaftM);
  shN.position.set((HOLE.x0 + HOLE.x1) / 2, (SH_TOP + SH_BOT) / 2, SH_Z0); add(shN);

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

  /* ---- UPSTAIRS -----------------------------------------------------------------
   * The floor is at UP_Y 3.45, which is not a number I chose: it is where the
   * stairwell lid sat, and the exterior second storey runs y 3.02..5.95, so a floor
   * there and a ceiling at 5.70 gives 2.25m of head height inside a shell that was
   * already built. The footprint follows the house as it now stands — the west wing
   * (the living room, x -17.15..-7.45) got built downstairs, so the storey covers it
   * too rather than stopping where the old bedroom box used to end.
   * ⚠️ THE LANDING IS A SPINE, not a room with doors off its corners. Three rooms
   * hanging off one corridor is the only arrangement where all three are ADJACENT to
   * the space you arrive in — every layout where the rooms chain off each other
   * leaves the last one unreachable without walking through somebody's bedroom. */
  /* ⚠️ z1 REACHES 7.45, not 3.60. The storey has to cover its own staircase: the
   * flight climbs the east wall from z 7.05, and with the floor stopping at 3.60 the
   * south wall stood straight across the top third of it — the climb came out through
   * the wall at y 4.35 in both directions. A floor with a hole in it is not enough;
   * the WALLS have to clear the flight too. */
  /* ⚠️ INSET 0.25 FROM THE SHELL, ON EVERY SIDE. At -17.05 against a shell at -17.20
   * the interior wall landed 2cm from the exterior one, and from the landing you were
   * looking at LAPPED SIDING — the outside of your own house, indoors. The shell is
   * boxes with siding on every face; the interior has to sit clearly inboard of it so
   * the wallpaper is what you see and the siding is what the street sees. */
  var UPF = { x0: -16.95, x1: 4.17, z0: -3.30, z1: 7.35, fl: UP_Y, ce: UP_Y + 2.25 };
  var LAN = { z0: 1.05, z1: 2.45 };                       // the corridor band
  /* THE THREE ROOMS. The landing shipped with three doors and nothing behind them:
   * north of the corridor wall was one undivided slab of floor, so all three doors
   * opened into the same space, which is worse than a door that does not open at all.
   * They split the band UPF.z0..LAN.z0 across the door positions that already existed,
   * so each door lands roughly central in its own room and no corridor geometry moved. */
  var UPR = [
    { key: 'their', sp: 'room0', x0: UPF.x0, x1: -8.10, doorX: -12.20, name: 'their room' },
    { key: 'hers',  sp: 'room1', x0: -7.90,  x1: -0.30, doorX: -3.60,  name: 'her room' },
    { key: 'attic', sp: 'room2', x0: -0.10,  x1: UPF.x1, doorX: 1.90,  name: 'the attic' }
  ];
  var RZ0 = UPF.z0 + 0.10, RZ1 = LAN.z0 - 0.10;
  var upRoom = 0, roomDoors = [];        // the door pivots, so they can swing
  /* ⚠️ ALL THREE DOORS WERE IDENTICAL AND DEAD SHUT — same width, same colour, same
   * roughness, rotation zero on every axis, knob at the same offset — while 'their
   * room' hint says the door is ALWAYS HALF SHUT. The hint was right and the geometry
   * disagreed with it. Each door has a resting angle now, and the swing animates from
   * that angle rather than from zero, so a door that stands ajar goes back to ajar. */
  var roomDoorRest = [0.34, 0.0, 0.12];
  var upWallM = new THREE.MeshStandardMaterial({ map: hwallT, roughness: 0.95 });
  /* ⚠️ plankT is ONE SHARED TEXTURE OBJECT and Box/Plane UVs run 0..1 per face
   * whatever the face's size, so `repeat` is effectively per-mesh — and the landing
   * borrowed the HALL's. The hall floor is 3.10 x 12.25 at repeat (1.2, 4), about
   * 2.6 m per tile; the landing's biggest piece is 11.58 x 10.65, so the same repeat
   * stretched the grain nearly four times. It gets its own clone at the hall's
   * measured density (0.387 tiles/m in U, 0.327 in V) rather than the hall's numbers. */
  var upFloorT = plankT.clone(); upFloorT.needsUpdate = true;
  upFloorT.wrapS = upFloorT.wrapT = THREE.RepeatWrapping; upFloorT.repeat.set(4.5, 3.5);
  var upFloorM = new THREE.MeshStandardMaterial({ map: upFloorT, roughness: 0.9 });
  // what the storey above looks like from beneath: the hall ceiling’s own colour, so
  // the soffit over the stairwell matches the ceiling it continues
  var upSoffitM = mat(0x2a2f3d, 0.98);
  function utag(m, name, action, hint) { clickable(m, name, action, hint); m.userData.space = 'upstairs'; return m; }
  function grpU(g4, name, hint) { g4.children.forEach(function (m) { if (m.isMesh) utag(m, name, null, hint); }); }
  // ⚠️ and the same again upstairs: five light handles trapped in an IIFE, so the
  // whole storey ignored the pull chain and the hour.
  var upLightH = null, upOn = true;
  /* the three rooms publish their own practicals here. Each entry is
   *   { l: light, m: emissive material or null, i: base intensity, e: base emissive,
   *     sw: does the landing switch own it, on: is this fixture itself switched on }
   * `sw: false` is for the light coming through the gable window — that one is the
   * SUN, so it follows the house dimmer and nothing else. Lumping it in with the
   * bulbs would have let a light switch turn off the daylight. */
  var roomLights = [];
  function roomLite(l, m, i, e, sw) { var o = { l: l, m: m, i: i, e: e, sw: sw !== false, on: true }; roomLights.push(o); return o; }
  (function () {
    /* the floor, in four pieces around the stairwell — the sixth time this file has
     * had to say it, and the first time it was cheap because STW already exists. */
    var SH = { x0: STW.x0, x1: STW.x1, z0: STW.z0, z1: STW.z1 };
    [[UPF.x0, SH.x0, UPF.z0, UPF.z1],
     [SH.x1, UPF.x1, UPF.z0, UPF.z1],
     [SH.x0, SH.x1, SH.z1, UPF.z1],
     [SH.x0, SH.x1, UPF.z0, SH.z0]].forEach(function (r) {
      if (r[1] - r[0] < 0.02 || r[3] - r[2] < 0.02) return;
      var fl = new THREE.Mesh(new THREE.PlaneGeometry(r[1] - r[0], r[3] - r[2]), upFloorM);
      fl.rotation.x = -Math.PI / 2; fl.position.set((r[0] + r[1]) / 2, UPF.fl + 0.005, (r[2] + r[3]) / 2);
      /* ⚠️ the landing was the one floor in the house with no relief — the hall,
       * the kitchen, the living room and the garage all carry a bump. */
      var upB = bumpFrom(upFloorT, 1.8);
      if (upB) { upB.repeat.copy(upFloorT.repeat); fl.material = fl.material.clone(); fl.material.bumpMap = upB; fl.material.bumpScale = 0.9; }
      fl.receiveShadow = true; add(fl);
      /* ⚠️ A PlaneGeometry HAS ONE FACE. This one points up, so from underneath the
       * storey above had NO FLOOR — stand in the hall, look up the stairwell, and you
       * saw straight through the landing into the rooms above it (Kyle: you can see
       * through the floor of upstairs). The fix is not DoubleSide, which would hang
       * floorboards over the hall; it is the thing a house actually has under its
       * floorboards, a plastered soffit facing down. */
      var soff = new THREE.Mesh(new THREE.PlaneGeometry(r[1] - r[0], r[3] - r[2]), upSoffitM);
      soff.rotation.x = Math.PI / 2; soff.position.set((r[0] + r[1]) / 2, UPF.fl - 0.055, (r[2] + r[3]) / 2);
      add(soff);
      utag(fl, 'the landing', null, 'the boards up here were never carpeted. you can hear everyone.');
    });
    var ceil = box(UPF.x1 - UPF.x0, 0.10, UPF.z1 - UPF.z0, mat(0xe8e4d8, 0.95));
    ceil.position.set((UPF.x0 + UPF.x1) / 2, UPF.ce + 0.05, (UPF.z0 + UPF.z1) / 2); add(ceil);
    // the outer walls of the storey
    [[UPF.x1 - UPF.x0 + 0.2, 0.10, (UPF.x0 + UPF.x1) / 2, UPF.z0 - 0.05],
     [UPF.x1 - UPF.x0 + 0.2, 0.10, (UPF.x0 + UPF.x1) / 2, UPF.z1 + 0.05]].forEach(function (w) {
      var m2 = box(w[0], UPF.ce - UPF.fl, w[1], paperWallM(Math.max(w[0], w[1]), UPF.ce - UPF.fl));
      m2.position.set(w[2], (UPF.fl + UPF.ce) / 2, w[3]); add(m2);
    });
    [UPF.x0 - 0.05, UPF.x1 + 0.05].forEach(function (wx) {
      var m3 = box(0.10, UPF.ce - UPF.fl, UPF.z1 - UPF.z0, paperWallM(UPF.z1 - UPF.z0, UPF.ce - UPF.fl));
      m3.position.set(wx, (UPF.fl + UPF.ce) / 2, (UPF.z0 + UPF.z1) / 2); add(m3);
    });
    /* the corridor's north wall, with the three doorways cut into it. The stairwell
     * bay breaks it, which is why it is built as a list of runs rather than one slab. */
    var UP_DH = 2.045;                 // 5 mm reveal under a 2.05 opening
    var DOORS = [
      { x: -12.20, w: 0.95, name: 'their room', hint: 'their room. the door is always half shut and the radio is always on low.' },
      { x: -3.60,  w: 0.95, name: 'her room',   hint: 'her room. KEEP OUT is written on a card in three colours.' },
      { x: 1.90,   w: 0.95, name: 'the attic',  hint: 'the attic. it is warm in there and it smells like old paper.' }
    ];
    var edges = [UPF.x0];
    DOORS.forEach(function (d) { edges.push(d.x - d.w / 2, d.x + d.w / 2); });
    edges.push(STW.x0, STW.x1, UPF.x1);
    edges.sort(function (m, n) { return m - n; });
    for (var e = 0; e < edges.length - 1; e++) {
      var a0 = edges[e], a1 = edges[e + 1];
      if (a1 - a0 < 0.02) continue;
      /* ⚠️ this loop used to skip the x-band of the stairwell, 'because the bay is
       * open to the corridor'. True — but this wall is at z 1.00 and the well runs
       * z 2.45..7.30, 1.45 m SOUTH of it. The skip punched a 1.04 m hole through the
       * door wall into the sealed void behind it, for a shaft that never touches it. */
      var mid = (a0 + a1) / 2, isDoor = false;
      DOORS.forEach(function (d) { if (Math.abs(mid - d.x) < d.w / 2) isDoor = true; });
      var h0 = isDoor ? UPF.fl + 2.05 : UPF.fl, h1 = UPF.ce;
      if (h1 - h0 < 0.02) continue;
      var seg = box(a1 - a0, h1 - h0, 0.10, paperWallM(a1 - a0, h1 - h0));
      seg.position.set(mid, (h0 + h1) / 2, LAN.z0 - 0.05); add(seg);
    }
    /* ⚠️⚠️ THE CORRIDOR'S SOUTH WALL DID NOT EXIST. LAN.z1 appeared in this block only
     * as a position to hang things off — the hall table, the towels, the school photos,
     * the thermostat, twelve wall-mounted meshes in all — and nothing was ever built
     * there for them to hang ON. From the landing you looked straight past them into
     * the void over the stairwell. It is built as runs so the stairwell bay stays open,
     * which is where that skip actually belonged all along (the north wall had it by
     * mistake and punched a hole in itself for a shaft 1.45 m away).
     * ⚠️ It also has to stop at the ceiling of the FLIGHT, not the floor: the stairs
     * arrive through this line. */
    /* ⚠️ THE STAIRWELL IS A SLOT, NOT AN OPEN BAY. These runs skip STW.x0..STW.x1 so
     * you can step off the flight — but nothing ever closed the SIDES of the shaft
     * above the floor, so the moment a climbing eye rose past the boards it was
     * looking out over the 96 m² of bare floor south of the corridor that no room
     * uses (Kyle: you can see into an empty space that isn't being used). At rest
     * you never see it — the south wall hides it from both landing views — it is
     * entirely the transit: measured 76.9% of the frame at t=0.75 going up and 67.6%
     * coming down. Two boxes take every sampled frame to 0.0%.
     * ⚠️ they start 0.10 BELOW the floor: at eye height 3.34 a ray otherwise slips
     * under a floor-height wall through the floor/soffit gap and the leak comes back. */
    /* ⚠️ the north end BURIES itself 0.05 into the corridor south wall (which occupies
     * z 2.45..2.55). Butting it flush at LAN.z1 put both north faces on the plane
     * z = 2.450 and traded one leak for 20 flashing rays — the same mistake this whole
     * pass has been about. Overlap, never abut. */
    [STW.x0 - 0.13, STW.x1 + 0.13].forEach(function (wx) {
      var shw = box(0.10, (UPF.ce - UPF.fl) + 0.10, STW.z1 - LAN.z1 - 0.05, paperWallM(STW.z1 - LAN.z1 - 0.05, (UPF.ce - UPF.fl) + 0.10));
      shw.position.set(wx, (UPF.fl + UPF.ce) / 2 - 0.05, (LAN.z1 + 0.05 + STW.z1) / 2); add(shw);
    });
    [[UPF.x0, STW.x0], [STW.x1, UPF.x1]].forEach(function (r2) {
      if (r2[1] - r2[0] < 0.02) return;
      var sw2 = box(r2[1] - r2[0], UPF.ce - UPF.fl, 0.10, paperWallM(r2[1] - r2[0], UPF.ce - UPF.fl));
      sw2.position.set((r2[0] + r2[1]) / 2, (UPF.fl + UPF.ce) / 2, LAN.z1 + 0.05); add(sw2);
    });
    // the doors themselves, shut, each with its handle and its own light under it
    DOORS.forEach(function (d, di) {
      /* EACH DOOR IS A PIVOT GROUP, not a slab at a position. The camera has to pass
       * through this opening, and a shut 5cm board is as solid to the eye as a wall.
       * Hinged at its left jamb, the slab swings into the ROOM (+y rotation carries the
       * free edge to -z) so it never sweeps through a camera coming up the corridor. */
      var piv = new THREE.Group();
      piv.position.set(d.x - d.w / 2, UPF.fl, LAN.z0 - 0.05); add(piv);
      roomDoors[di] = piv; piv.rotation.y = roomDoorRest[di];
      /* ⚠️ the opening in the wall runs to UPF.fl + 2.05 and the slab was 2.02 tall,
       * so every door had a 3 cm slot 0.92 m wide clean through a 0.10 m wall, into
       * the sealed void above the ceiling. Derive the slab from the opening. */
      var slab = box(d.w - 0.03, UP_DH, 0.05, mat(0x4a3a2a, 0.72));
      slab.position.set(d.w / 2, UP_DH / 2, 0); piv.add(slab);
      var hstop = box(d.w + 0.02, 0.05, 0.02, mat(0xd8d2c2, 0.8));
      hstop.position.set(d.w / 2, 2.035, -0.035); piv.add(hstop);
      var pnl2 = box(d.w - 0.26, 0.72, 0.012, mat(0x3f3122, 0.75));
      pnl2.position.set(d.w / 2, 1.435, 0.032); piv.add(pnl2);
      var pnl3 = box(d.w - 0.26, 0.52, 0.012, mat(0x3f3122, 0.75));
      pnl3.position.set(d.w / 2, 0.52, 0.032); piv.add(pnl3);
      var kn = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), mat(0xc8b06a, 0.35));
      kn.position.set(d.w - 0.16, 1.00, 0.06); piv.add(kn);
      /* ⚠️⚠️ A CASING IS A BOARD ON THE WALL, NOT A BOARD IN IT. The +0.035 offset
       * was exactly the board's own half-thickness, so each jamb's inner face landed
       * on d.x ± d.w/2 — the wall's own cut plane, to 0.000 mm — with both faces
       * pointing the same way and both drawn. 0.214 m² of coincident, both-front-
       * facing wall per jamb, six jambs, dead in the doorway reveal you actually look
       * at. That is the flashing (Kyle: the new door frames look like they are
       * flashing) — and it was these three because they are the newest doors; every
       * older jamb in the house already stands 5 mm clear or buries itself 2 cm.
       * Same lesson as the skirting and the stairwell rim: give the part real
       * thickness and stand it PROUD, so the only plane it shares is its BACK face,
       * which is back-facing and culled. */
      var CAS = 0.022, CZ = LAN.z0 + CAS / 2;      // back face butts the wall at 1.050
      [[-1], [1]].forEach(function (jj) {
        var jm = box(0.07, 2.03, CAS, mat(0xd8d2c2, 0.8));
        jm.position.set(d.x + jj[0] * (d.w / 2 + 0.015), UPF.fl + 1.015, CZ); add(jm);
      });
      var hd = box(d.w + 0.19, 0.08, CAS, mat(0xd8d2c2, 0.8));
      hd.position.set(d.x, UPF.fl + 2.07, CZ); add(hd);
      var spill = new THREE.Mesh(new THREE.PlaneGeometry(d.w - 0.08, 0.30),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.13,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      spill.rotation.x = -Math.PI / 2; spill.position.set(d.x, UPF.fl + 0.012, LAN.z0 + 0.14); add(spill);
      [slab, pnl2, pnl3, kn].forEach(function (m) {
        utag(m, d.name, (function (n) { return function () { enterRoom(n); }; })(di), d.hint);
      });
    });
    // the rail around the stairwell, so the corridor has an edge and not a drop
    [[STW.x0 - 0.03, STW.z0, STW.x0 - 0.03, STW.z1], [STW.x1 + 0.03, STW.z0, STW.x1 + 0.03, STW.z1],
     [STW.x0, STW.z1 - 0.03, STW.x1, STW.z1 - 0.03]].forEach(function (rl) {   // ⚠️ MINUS: at +0.03 (z 7.48) this run stood inside the south wall, invisible and guarding nothing
      var len = Math.max(Math.abs(rl[2] - rl[0]), Math.abs(rl[3] - rl[1]));
      var along = Math.abs(rl[2] - rl[0]) > Math.abs(rl[3] - rl[1]);
      var top = box(along ? len : 0.05, 0.05, along ? 0.05 : len, mat(0x3a2c1c, 0.7));
      top.position.set((rl[0] + rl[2]) / 2, UPF.fl + 0.94, (rl[1] + rl[3]) / 2); add(top);
      for (var pz = 0; pz <= 3; pz++) {
        var t3 = pz / 3;
        var po = box(0.045, 0.92, 0.045, mat(0x3a2c1c, 0.7));
        po.position.set(rl[0] + t3 * (rl[2] - rl[0]), UPF.fl + 0.47, rl[1] + t3 * (rl[3] - rl[1])); add(po);
      }
    });
    // a window at each end of the corridor, and the bulb that is always left on
    /* ⚠️ same sign error as the living room's, twice: the west window faced west and
     * the east window faced east, so both were backface-culled from inside the house
     * and neither could be hovered. They also shared ONE name and one hint that
     * described both, 21 m apart — whichever you hovered, half the sentence was about
     * a window at the other end of the landing. */
    [[UPF.x0 + 0.04, Math.PI / 2, 'the window over the street',
      'the street. first one up opens it, whatever the month.'],
     [UPF.x1 - 0.04, -Math.PI / 2, 'the window over the yard',
      'the yard, the pool, the whole back of the house. this is the good one.']].forEach(function (wn) {
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(1.20, 1.00),
        new THREE.MeshStandardMaterial({ color: 0x2a3a4e, emissive: 0x7f9dc4, emissiveIntensity: 0.32, roughness: 0.25 }));
      gl.position.set(wn[0], UPF.fl + 1.45, (LAN.z0 + LAN.z1) / 2); gl.rotation.y = wn[1]; add(gl);
      utag(gl, wn[2], null, wn[3]);
    });
    /* ⚠️ leaveUpstairs() existed, was exported, and was called by NOTHING — you could
     * walk up and never walk down. Every other space in the house has a way back
     * (bsUpHit does exactly this for the basement); the landing simply never got one. */
    /* ⚠️ HALF THIS FLOOR WAS EMPTY AND UNLIT. Re-projected from the resting eye, the
     * 'facing east' view held two props and one window — and that window was
     * backface-culled at the time, so it held two props. Everything the landing had
     * was crammed into its west half. The airing cupboard is what is actually at the
     * east end of a landing like this, and it brings its own practical with it. */
    var acX = -0.60;
    var acDoor = box(0.86, 1.95, 0.05, mat(0x6a5744, 0.7));
    acDoor.position.set(acX, UPF.fl + 0.98, LAN.z1 - 0.03); add(acDoor);
    var acPnl = box(0.62, 0.68, 0.012, mat(0x5b4a39, 0.72));
    acPnl.position.set(acX, UPF.fl + 1.34, LAN.z1 - 0.06); add(acPnl);
    var acKnob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc8b06a, roughness: 0.3, metalness: 0.65 }));
    acKnob.position.set(acX + 0.31, UPF.fl + 0.98, LAN.z1 - 0.09); add(acKnob);
    [acDoor, acPnl, acKnob].forEach(function (m) {
      utag(m, 'the airing cupboard', null,
        'the warmest door in the house. towels, the immersion heater, and a cat if you leave it open.');
    });
    // the slice of warm light under it, because that cupboard is never actually cold
    var acSpill = new THREE.Mesh(new THREE.PlaneGeometry(0.80, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xffb877, transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    acSpill.rotation.x = -Math.PI / 2;
    acSpill.position.set(acX, UPF.fl + 0.014, LAN.z1 - 0.16); add(acSpill);
    var acLite = new THREE.PointLight(0xffb877, 0.30, 3.4, 2.0);
    acLite.position.set(acX, UPF.fl + 0.55, LAN.z1 - 0.30); add(acLite);
    dimLights.push({ l: acLite, base: 0.30 });
    // a chair on the landing that is not for sitting on, which every house has
    var lchG = new THREE.Group();
    lchG.position.set(1.85, UPF.fl, LAN.z0 + 0.42); lchG.rotation.y = -0.72; add(lchG);
    plant(lchG, 0.30, 0.30, 0.40, 0);
    var lcS = box(0.40, 0.045, 0.40, mat(0x7a6248, 0.8)); lcS.position.y = 0.44; lchG.add(lcS);
    var lcB = box(0.40, 0.50, 0.045, mat(0x7a6248, 0.8)); lcB.position.set(0, 0.70, -0.18); lchG.add(lcB);
    [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].forEach(function (lp3) {
      var lgl = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.44, 8), mat(0x7a6248, 0.8));
      lgl.position.set(lp3[0], 0.22, lp3[1]); lchG.add(lgl);
    });
    grpU(lchG, 'the landing chair', 'nobody sits on it. it holds whatever is on its way up or down.');
    var lcPile = box(0.30, 0.09, 0.26, mat(0xd8d2c2, 0.95));
    lcPile.position.set(1.85, UPF.fl + 0.51, LAN.z0 + 0.42); lcPile.rotation.y = -0.72 + 0.24; add(lcPile);
    // ⚠️ utag is (mesh, name, ACTION, hint) — this passed the hint as the action, so
    // clicking the ironing called a string and threw a TypeError. The audit rule at
    // the bottom of room.js now catches this shape for every pickable in the house.
    utag(lcPile, 'the ironing', null, 'folded on Sunday, still on the chair on Thursday.');
    var upDownHit = new THREE.Mesh(new THREE.BoxGeometry(1.10, 2.0, 1.10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    upDownHit.position.set((STW.x0 + STW.x1) / 2, UPF.fl + 1.0, STW.z0 + 0.55); add(upDownHit);
    utag(upDownHit, 'the stairs down', function () { leaveUpstairs(); },
      'back down to the hall. the third one from the bottom announces you.');
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffd9a0, emissiveIntensity: 1.1, roughness: 0.6 }));
    bulb.position.set(-6.10, UPF.ce - 0.30, (LAN.z0 + LAN.z1) / 2); add(bulb);
    var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.30, 5), mat(0x2b2e33, 0.6));
    cord.position.set(-6.10, UPF.ce - 0.13, (LAN.z0 + LAN.z1) / 2); add(cord);
    utag(bulb, 'the landing light', null, 'no shade. there was going to be a shade.');
    var upLite = new THREE.PointLight(0xffd2a0, 0.95, 9.5, 1.9);
    upLite.position.set(-6.10, UPF.ce - 0.45, (LAN.z0 + LAN.z1) / 2); add(upLite);
    /* ---- WHAT MAKES A LANDING A LANDING -----------------------------------------
     * ⚠️ MEASURED: this floor had 4 props on the floor, 1 on a wall, 1 on the ceiling
     * and ZERO on any surface, against the bedroom's 15/25/1/15 — and it was 100%
     * axis-aligned, which is the most rigid space in the house. A landing is not a
     * corridor with doors; it is where the airing cupboard is, where the hoover lives,
     * and where things get put down on the way past and stay there.
     * ⚠️ AND THE SECOND POINT LIGHT HAD NO FIXTURE. The bedroom pairs every one of its
     * seven point lights with something emissive you can see; this one lit the west end
     * of the corridor from nothing at all. It has a bulb now, on its own cord. */
    var upWoodM = mat(0x6b4b30, 0.8), upLinenM = mat(0xe0dccb, 0.95);

    // the second bulb, so the light at the west end comes from somewhere
    var bulb2 = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffd9a0, emissiveIntensity: 0.95, roughness: 0.6 }));
    bulb2.position.set(-13.20, UPF.ce - 0.34, (LAN.z0 + LAN.z1) / 2); add(bulb2);
    var cord2 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.34, 5), mat(0x2b2e33, 0.6));
    cord2.position.set(-13.20, UPF.ce - 0.15, (LAN.z0 + LAN.z1) / 2); add(cord2);
    var rose2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 12), mat(0xe8e4d8, 0.8));
    rose2.position.set(-13.20, UPF.ce - 0.015, (LAN.z0 + LAN.z1) / 2); add(rose2);
    [bulb2, cord2, rose2].forEach(function (m) { utag(m, 'the far bulb', null, 'this one buzzes. it has buzzed since it was put in and nobody minds any more.'); });
    // a smoke alarm, because every ceiling in a house like this has one
    var alarm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.035, 14), mat(0xf0ece0, 0.85));
    alarm.position.set(-9.30, UPF.ce - 0.02, 1.72); add(alarm);
    var alarmLed = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff3a2a, emissiveIntensity: 1.2, roughness: 0.5 }));
    alarmLed.position.set(-9.24, UPF.ce - 0.038, 1.78); add(alarmLed);
    [alarm, alarmLed].forEach(function (m) { utag(m, 'the smoke alarm', null, 'it chirped for a fortnight in 1998 before anyone worked out which one it was.'); });

    // ---- THE HALL TABLE, and everything that got put down on it ----
    var htG = new THREE.Group(); htG.position.set(-10.65, UPF.fl, LAN.z1 - 0.30); htG.rotation.y = 0.13; add(htG);
    plant(htG, 0.45, 0.28, 0.45, 0);         // group sits AT the floor, so local 0
    var htTop = box(0.86, 0.045, 0.34, upWoodM); htTop.position.y = 0.74; htG.add(htTop);
    var htRail = box(0.80, 0.03, 0.03, upWoodM); htRail.position.set(0, 0.22, 0); htG.add(htRail);
    [[-0.38, -0.13], [0.38, -0.13], [-0.38, 0.13], [0.38, 0.13]].forEach(function (lp) {
      var lg4 = box(0.045, 0.74, 0.045, upWoodM); lg4.position.set(lp[0], 0.37, lp[1]); htG.add(lg4); });
    htG.children.forEach(function (m) { utag(m, 'the hall table', null, 'too narrow to be useful and too useful to move. everything lands here first.'); });
    // folded towels, because the airing cupboard is always full
    [[0xe0dccb, 0.00, 0.0], [0xd4cfe0, 0.055, 0.06], [0xe0d4c8, 0.108, -0.04]].forEach(function (tw, ti) {
      var tl = box(0.30, 0.05, 0.22, mat(tw[0], 0.95));
      tl.position.set(-10.92 + tw[2], UPF.fl + 0.79 + tw[1], LAN.z1 - 0.30);
      tl.rotation.y = 0.13 + (ti - 1) * 0.055; add(tl);
      utag(tl, 'the folded towels', null, 'folded in thirds, which is the only correct way, and everyone has been told.');
    });
    // a dish of things with nowhere else to go
    var dish = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.035, 14), mat(0x7a8a9a, 0.55));
    dish.position.set(-10.36, UPF.fl + 0.775, LAN.z1 - 0.26); add(dish);
    utag(dish, 'the dish', null, 'two buttons, a watch battery and a key that opens nothing in this house.');
    [[0.02, 0.03, 0xc8a24a], [-0.03, -0.02, 0xb8b2a4], [0.01, -0.03, 0xc8a24a]].forEach(function (kb) {
      var kk = box(0.022, 0.006, 0.045, new THREE.MeshStandardMaterial({ color: kb[2], roughness: 0.4, metalness: 0.55 }));
      kk.position.set(-10.36 + kb[0], UPF.fl + 0.792, LAN.z1 - 0.26 + kb[1]);
      kk.rotation.y = kb[0] * 9; add(kk);
      utag(kk, 'the dish', null, 'two buttons, a watch battery and a key that opens nothing in this house.');
    });
    // a photo of the four of them, propped rather than hung
    var famT = canvasTex(96, 80, function (c, w, h) {
      c.fillStyle = '#e8e2d0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#9aa89a'; c.fillRect(6, 6, w - 12, h - 12);
      ['#6a5a44', '#7a6a52', '#5a4a38', '#8a7a62'].forEach(function (col, fi) {
        c.fillStyle = col;
        var fx = 18 + fi * 16, fy = h - 16 - (fi % 2) * 5;
        c.beginPath(); c.arc(fx, fy - 20, 6, 0, 7); c.fill();
        c.fillRect(fx - 7, fy - 14, 14, 16);
      });
    });
    famT.colorSpace = THREE.SRGBColorSpace;
    var famPic = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.16),
      new THREE.MeshStandardMaterial({ map: famT, roughness: 0.9 }));
    famPic.position.set(-10.02, UPF.fl + 0.86, LAN.z1 - 0.36); famPic.rotation.set(-0.16, 0.13, 0); add(famPic);
    var famFrame = box(0.23, 0.19, 0.02, upWoodM);
    /* ⚠️ THIS ONE WAS FULLY BURIED. Both meshes carry the same tilt, so transforming
     * the 0.01 world offset into the frame's own basis put the picture at local z
     * -0.0098 against a half-depth of 0.010 — inside the box, 0.2 mm off its back
     * face. ⚠️ AND THE FIRST PROPOSED FIX MOVED IT THE WRONG WAY: the camera rests at
     * z 2.15 and the picture is at LAN.z1 - 0.36 = 2.09, so cameraward is -z and the
     * frame has to go to a SMALLER z, not a larger one. */
    famFrame.position.set(-10.02, UPF.fl + 0.86, LAN.z1 - 0.375); famFrame.rotation.set(-0.16, 0.13, 0); add(famFrame);
    var famProp = box(0.02, 0.10, 0.02, upWoodM);
    famProp.position.set(-10.02, UPF.fl + 0.80, LAN.z1 - 0.31); famProp.rotation.x = 0.42; add(famProp);
    [famPic, famFrame, famProp].forEach(function (m) { utag(m, 'the four of them', null, 'taken at the lake. one of them is blinking and it is always the same one.'); });

    // ---- ON THE WALLS ----
    // the school photos, one per year, marching down the corridor and getting older
    [[-15.30, 0.30, 0.019], [-14.35, 0.34, -0.014], [-13.40, 0.30, 0.024],
     [-12.45, 0.36, -0.011], [-11.50, 0.30, 0.016]].forEach(function (sp2, si) {
      var t6 = canvasTex(64, 80, function (c, w, h) {
        c.fillStyle = '#e8e2d0'; c.fillRect(0, 0, w, h);
        c.fillStyle = ['#7a9ab0', '#9a8a70', '#8a9a7a', '#a08a90', '#7a8a9a'][si];
        c.fillRect(5, 5, w - 10, h - 10);
        c.fillStyle = '#5a4a38'; c.beginPath(); c.arc(w / 2, h * 0.40, 12 + si, 0, 7); c.fill();
        c.fillRect(w / 2 - 14 - si, h * 0.55, 28 + si * 2, h * 0.34);
        c.fillStyle = '#3a2f22'; c.font = 'italic 9px Georgia, serif'; c.textAlign = 'center';
        c.fillText(String(1992 + si), w / 2, h - 5);
      });
      t6.colorSpace = THREE.SRGBColorSpace;
      var ph2 = new THREE.Mesh(new THREE.PlaneGeometry(sp2[1] - 0.05, sp2[1] * 1.22 - 0.05),
        new THREE.MeshStandardMaterial({ map: t6, roughness: 0.9 }));
      ph2.position.set(sp2[0], UPF.fl + 1.58, LAN.z1 - 0.03); ph2.rotation.y = Math.PI; ph2.rotation.z = sp2[2]; add(ph2);
      var fr2 = box(sp2[1], sp2[1] * 1.22, 0.022, upWoodM);
      // ⚠️ the photo faces -Z (rotation.y = PI) and the camera is on the -Z side, so
      // the frame has to sit at a LARGER z than the photo, not a smaller one. At
      // -0.02 against the photo's -0.03 it stood 1 mm in front and hid all five.
      fr2.position.set(sp2[0], UPF.fl + 1.58, LAN.z1 - 0.012); fr2.rotation.z = sp2[2]; add(fr2);
      [ph2, fr2].forEach(function (m) { utag(m, 'the school photos', null,
        'one a year, all the way down the landing. you can watch the fringe get worse and then get better.'); });
    });
    // the airing cupboard door, and the switch nobody labels
    var swPlate = box(0.09, 0.13, 0.02, mat(0xf0ece0, 0.6));
    swPlate.position.set(-6.20, UPF.fl + 1.32, LAN.z1 - 0.02); add(swPlate);
    var swTog = box(0.022, 0.038, 0.018, mat(0xdad4c4, 0.5));
    swTog.position.set(-6.20, UPF.fl + 1.34, LAN.z1 - 0.035); swTog.rotation.x = 0.22; add(swTog);
    /* ⚠️ EVERY utag ON THIS FLOOR PASSED null AS ITS ACTION — seventeen of seventeen,
     * against 23% across the rest of the module. A switch you cannot flick is a
     * decal. This one owns the whole storey including the three rooms, which is why
     * the hint's joke lands: you really do just try one. */
    [swPlate, swTog].forEach(function (m) {
      utag(m, 'the landing switch', function () {
        upOn = !upOn;
        swTog.rotation.x = upOn ? 0.22 : -0.22;
        AUDIO.clickSfx && AUDIO.clickSfx(upOn ? 1750 : 1150);
      }, 'nobody has ever known which of the two switches does the stairs. you just try one.');
    });
    var therm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.028, 16), mat(0xe8e4d8, 0.7));
    therm.rotation.x = Math.PI / 2; therm.position.set(-8.10, UPF.fl + 1.44, LAN.z1 - 0.025); add(therm);
    var thermDial = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.042, 18), mat(0x8a8f96, 0.4));
    thermDial.position.set(-8.10, UPF.fl + 1.44, LAN.z1 - 0.041); add(thermDial);
    [therm, thermDial].forEach(function (m) { utag(m, 'the thermostat', null,
      'set to nineteen. moved to twenty-one by one person and back to nineteen by another, forever.'); });

    // ---- AND THE FLOOR, WHICH IS WHERE THINGS ACTUALLY END UP ----
    var hampG = new THREE.Group(); hampG.position.set(-16.10, UPF.fl, LAN.z0 + 0.42); hampG.rotation.y = -0.28; add(hampG);
    var hamp = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.46, 12, 1, true), mat(0xc4b48a, 0.95));
    hamp.position.y = 0.23; hampG.add(hamp);
    var hampR = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 6, 14), mat(0xb4a47a, 0.95));
    hampR.rotation.x = Math.PI / 2; hampR.position.y = 0.46; hampG.add(hampR);
    [[0xdfe6ea, 0.12, 0.4], [0x8a9ab0, 0.05, -0.7], [0xe0d4c8, 0.16, 1.2]].forEach(function (cl) {
      var lump = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), mat(cl[0], 0.95));
      lump.scale.set(1, 0.55, 1);
      lump.position.set(Math.sin(cl[2]) * 0.08, 0.44 + cl[1] * 0.3, Math.cos(cl[2]) * 0.07);
      lump.rotation.y = cl[2]; hampG.add(lump);
    });
    hampG.children.forEach(function (m) { utag(m, 'the laundry hamper', null,
      'the lid went missing years ago. it has been overfull ever since and nobody connects the two.'); });
    // the hoover, parked where it will be tripped over
    var hvG = new THREE.Group(); hvG.position.set(-3.15, UPF.fl, LAN.z0 + 0.34); hvG.rotation.y = 0.62; add(hvG);
    var hvBody = box(0.30, 0.22, 0.42, mat(0x9a4a3a, 0.6)); hvBody.position.y = 0.13; hvG.add(hvBody);
    var hvWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), mat(0x2b2e33, 0.6));
    hvWheel.rotation.z = Math.PI / 2; hvWheel.position.set(0, 0.055, -0.15); hvG.add(hvWheel);
    var hvPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.86, 8), mat(0x8a8f96, 0.4));
    hvPole.position.set(0, 0.60, 0.10); hvPole.rotation.x = -0.16; hvG.add(hvPole);
    var hvHandle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 12, Math.PI), mat(0x9a4a3a, 0.6));
    hvHandle.position.set(0, 1.02, 0.05); hvG.add(hvHandle);
    var hoseC = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.14, 0.20, 0.14), new THREE.Vector3(0.34, 0.34, 0.02),
      new THREE.Vector3(0.28, 0.62, -0.14), new THREE.Vector3(0.06, 0.74, -0.06)], false, 'centripetal');
    var hose = new THREE.Mesh(new THREE.TubeGeometry(hoseC, 20, 0.026, 6, false), mat(0x3a3f46, 0.7));
    hvG.add(hose);
    hvG.children.forEach(function (m) { utag(m, 'the hoover', null,
      'brought up two weekends ago for a job that took ten minutes. it lives here now.'); });
    // a runner down the middle, because bare boards up here is what you HEAR
    var runT2 = canvasTex(64, 256, function (c, w, h) {
      c.fillStyle = '#6a4a44'; c.fillRect(0, 0, w, h);
      /* ⚠️ SIDE STRIPES, NOT A strokeRect. This canvas is 1:4 on a 1:10.67 plane, so
       * it has to TILE along the run — and a rectangular border tiles into a fat bar
       * laid across the carpet every 3.5 m. Two vertical stripes tile invisibly. */
      c.fillStyle = 'rgba(214,198,166,0.5)'; c.fillRect(5, 0, 5, h); c.fillRect(w - 10, 0, 5, h);
      c.fillStyle = 'rgba(214,198,166,0.34)';
      for (var d2 = 0; d2 < 12; d2++) { c.save(); c.translate(w / 2, 18 + d2 * 21);
        c.rotate(Math.PI / 4); c.fillRect(-5, -5, 10, 10); c.restore(); }
      c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(w * 0.28, 0, w * 0.44, h);
    });
    runT2.colorSpace = THREE.SRGBColorSpace;
    // 64x256 is 1:4; the plane is 0.90 x 9.6, which is 1:10.67. Tile it 2.7 times
    // along the run and the 10 px diamonds land square instead of as long lozenges.
    runT2.wrapS = THREE.ClampToEdgeWrapping; runT2.wrapT = THREE.RepeatWrapping;
    runT2.repeat.set(1, 2.7);
    var upRun = new THREE.Mesh(new THREE.PlaneGeometry(0.90, 9.6), new THREE.MeshStandardMaterial({
      map: runT2, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    upRun.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    upRun.position.set(-9.60, UPF.fl + 0.008, (LAN.z0 + LAN.z1) / 2 - 0.06); add(upRun);
    utag(upRun, 'the landing runner', null,
      'laid so the boards stop announcing everyone. it works everywhere except the third board from the stairs.');
    var upLite2 = new THREE.PointLight(0xffd2a0, 0.55, 8.0, 1.9);
    upLightH = { a: upLite, b: upLite2, bulbA: bulb.material, bulbB: bulb2.material, led: alarmLed.material };
    upLite2.position.set(-13.20, UPF.ce - 0.45, (LAN.z0 + LAN.z1) / 2); add(upLite2);
  })();
  /* ---- BEHIND THE THREE DOORS -------------------------------------------------
   * Same rule as the rest of the house: four planes used (floor, surface, wall,
   * ceiling), nothing perfectly square to the walls, and every light paired with a
   * fixture you can actually see. Each room is one person's evidence. */
  (function () {
    [-8.00, -0.20].forEach(function (dx) {                 // the two dividing walls
      var dw = box(0.10, UPF.ce - UPF.fl, RZ1 - RZ0 + 0.24, paperWallM(RZ1 - RZ0 + 0.24, UPF.ce - UPF.fl));
      dw.position.set(dx, (UPF.fl + UPF.ce) / 2, (RZ0 + RZ1) / 2); add(dw);
    });
    function rtag(m, ri, name, hint) {
      clickable(m, name, null, hint); m.userData.space = UPR[ri].sp; return m;
    }
    /* ⚠️⚠️ AND ALL THREE ROOMS BEHIND THE DOORS WERE ONE-WAY TRAPS TOO, for a second,
     * worse reason: rtag() hard-codes null into clickable()'s action slot, so NOT ONE
     * mesh in room0/room1/room2 could carry a click at all. leaveRoom() had no caller.
     * Each room gets a hit box in its own doorway, tagged with its own space id so the
     * pick filter keeps it, sitting where P.rlookB aims — the doorway you see after
     * turning round, since the resting camera faces the far wall with the door ~4 m
     * behind it. */
    UPR.forEach(function (R2, ri) {
      var oh = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.00, 0.30),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      oh.position.set(R2.doorX, UPF.fl + 1.00, LAN.z0 - 0.22); add(oh);
      clickable(oh, 'the landing', function () { leaveRoom(); },
        'back out to the landing.');
      oh.userData.space = R2.sp;
    });
    function grp(ri, g2, name, hint) {
      g2.children.forEach(function (m) { if (m.isMesh) rtag(m, ri, name, hint); });
    }
    var fl = UPF.fl;

    /* ============== THEIR ROOM - the radio is always on low ============== */
    (function () {
      var R = UPR[0], cx = (R.x0 + R.x1) / 2;
      var woodM = mat(0x6b4b30, 0.8), sheetM = mat(0xe8e4d8, 0.95), quiltM = mat(0x7a6a8a, 0.94);
      var bg = new THREE.Group(); bg.position.set(cx - 0.75, fl, RZ0 + 1.50); bg.rotation.y = 0.02; add(bg);
      plant(bg, 0.95, 1.05, 0.60, 0);        // under-bed dark: the strongest grounding cue a bedroom has
      [[1.62, 0.30, 2.05, woodM, 0, 0.22, 0], [1.70, 0.86, 0.09, woodM, 0, 0.61, -1.02],
       [1.54, 0.24, 1.96, sheetM, 0, 0.49, 0], [1.60, 0.14, 1.42, quiltM, 0, 0.62, 0.26],
       [1.60, 0.07, 0.30, sheetM, 0, 0.68, -0.48]
      ].forEach(function (q) { var m = box(q[0], q[1], q[2], q[3]); m.position.set(q[4], q[5], q[6]); bg.add(m); });
      [-0.40, 0.40].forEach(function (px, pi) {
        var pil = box(0.62, 0.15, 0.36, sheetM);
        pil.position.set(px, 0.66, -0.76); pil.rotation.z = (pi ? -1 : 1) * 0.06; bg.add(pil);
      });
      grp(0, bg, 'their bed', 'made every morning before anyone else is up, and it shows.');
      // child[0] is the under-bed shadow — the strongest grounding cue the room has
      propSwap('bed', bg, bg.children.slice(1), { w: 1.70, d: 2.10, ry: 0 });
      [[-1.66, 0.06], [1.62, -0.05]].forEach(function (ns, ni) {
        var nx = cx - 0.75 + ns[0], nz = RZ0 + 0.70;
        var ng = new THREE.Group(); ng.position.set(nx, fl, nz); ng.rotation.y = ns[1]; add(ng);
        [[0.42, 0.04, 0.36, 0.54], [0.38, 0.46, 0.32, 0.29]].forEach(function (q) {
          var m = box(q[0], q[1], q[2], woodM); m.position.y = q[3]; ng.add(m); });
        var dr = box(0.34, 0.02, 0.01, mat(0xc8a24a, 0.4)); dr.position.set(0, 0.34, 0.165); ng.add(dr);
        grp(0, ng, 'the nightstands', 'his has a glass of water on it. hers has everything else.');
        if (ni === 0) {
          var clkT = canvasTex(64, 32, function (c, w, h) {
            c.fillStyle = '#160a06'; c.fillRect(0, 0, w, h);
            c.fillStyle = '#ff4a2a'; c.font = 'bold 19px monospace'; c.textAlign = 'center';
            c.fillText('6:12', w / 2, 24);
          });
          clkT.colorSpace = THREE.SRGBColorSpace;
          var clk = box(0.17, 0.09, 0.11, mat(0x2b2e33, 0.5));
          clk.position.set(nx, fl + 0.60, nz); clk.rotation.y = 0.42; add(clk);
          var cf = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.062),
            new THREE.MeshStandardMaterial({ map: clkT, emissive: 0xff4a2a, emissiveIntensity: 0.85, roughness: 0.5 }));
          cf.position.set(nx + 0.022, fl + 0.60, nz + 0.056); cf.rotation.y = 0.42; add(cf);
          [clk, cf].forEach(function (m) { rtag(m, 0, 'the clock radio',
            'set twenty minutes fast on purpose. they both know, and it still works.'); });
          var rl2 = new THREE.PointLight(0xff6a3a, 0.20, 1.7, 2.0);
          rl2.position.set(nx, fl + 0.63, nz + 0.10); add(rl2);
          // a clock radio is never off. It dims with the house and ignores the switch.
          roomLite(rl2, cf.material, 0.20, 0.85, false);
          var gls = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 12),
            new THREE.MeshStandardMaterial({ color: 0xcfe4ee, roughness: 0.15, transparent: true, opacity: 0.5 }));
          gls.position.set(nx - 0.11, fl + 0.60, nz - 0.05); add(gls);
          rtag(gls, 0, 'the glass of water', 'poured every night, drunk about a third of the time.');
        } else {
          var bk = box(0.14, 0.035, 0.20, mat(0x8a5a4a, 0.9));
          bk.position.set(nx, fl + 0.575, nz); bk.rotation.y = -0.32; add(bk);
          var bm = box(0.02, 0.003, 0.24, mat(0xc8443a, 0.8));
          bm.position.set(nx + 0.03, fl + 0.594, nz + 0.02); bm.rotation.y = -0.32; add(bm);
          [bk, bm].forEach(function (m) { rtag(m, 0, 'the book',
            'the same page since spring. the receipt is still the bookmark.'); });
          var lg = new THREE.Group(); lg.position.set(nx - 0.02, fl + 0.56, nz - 0.06); lg.rotation.y = 0.3; add(lg);
          var st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.032, 0.24, 8), mat(0xc8a24a, 0.4));
          st2.position.y = 0.12; lg.add(st2);
          var sh2 = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.12, 0.14, 14, 1, true),
            new THREE.MeshStandardMaterial({ color: 0xf0e2bc, emissive: 0xffd9a0, emissiveIntensity: 0.45,
              roughness: 0.9, side: THREE.DoubleSide }));
          sh2.position.y = 0.30; lg.add(sh2);
          grp(0, lg, 'the reading lamp', 'left on most nights. the other one has learned to sleep through it.');
          var nl2 = new THREE.PointLight(0xffd2a0, 0.62, 3.6, 1.9);
          nl2.position.set(nx, fl + 0.88, nz); add(nl2);
          var rlEnt = roomLite(nl2, sh2.material, 0.85, 0.58);
          // ⚠️ the hint said it gets left on most nights, and there was no way to turn
          // it off. A fixture whose own description is about being switched has to be.
          lg.children.forEach(function (m) {
            if (m.userData && m.userData.name) m.userData.action = function () {
              rlEnt.on = !rlEnt.on; AUDIO.clickSfx && AUDIO.clickSfx(rlEnt.on ? 1650 : 1100);
            };
          });
        }
      });
      var wg = new THREE.Group(); wg.position.set(R.x0 + 0.80, fl, RZ1 - 0.45); wg.rotation.y = -0.05; add(wg);
      plant(wg, 0.50, 0.35, 0.55, 0);
      [[1.24, 1.92, 0.58, 0.96], [1.32, 0.06, 0.64, 1.95]].forEach(function (q) {
        var m = box(q[0], q[1], q[2], woodM); m.position.y = q[3]; wg.add(m); });
      [-0.30, 0.30].forEach(function (dx2) {
        var pnl = box(0.54, 1.62, 0.02, mat(0x5d3f28, 0.8)); pnl.position.set(dx2, 0.98, 0.30); wg.add(pnl);
        var hn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 8), mat(0xc8a24a, 0.4));
        hn.position.set(dx2 + (dx2 > 0 ? -0.20 : 0.20), 0.98, 0.32); wg.add(hn);
      });
      var cse = box(0.52, 0.16, 0.34, mat(0x6a5a4a, 0.9)); cse.position.set(-0.28, 2.06, 0.02); cse.rotation.y = 0.10; wg.add(cse);
      grp(0, wg, 'the wardrobe', 'the left door does not stay shut. a folded coaster lives in the hinge.');
      var chg = new THREE.Group(); chg.position.set(cx + 2.35, fl, RZ0 + 2.30); chg.rotation.y = -0.58; add(chg);
      var cs = box(0.42, 0.05, 0.42, woodM); cs.position.y = 0.45; chg.add(cs);
      var cb = box(0.42, 0.52, 0.05, woodM); cb.position.set(0, 0.71, -0.19); chg.add(cb);
      [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(function (lp) {
        var l6 = box(0.04, 0.45, 0.04, woodM); l6.position.set(lp[0], 0.225, lp[1]); chg.add(l6); });
      grp(0, chg, 'the chair', 'nobody has sat on it since 1991. it is where clothes go that are not dirty enough to wash.');
      [[0x4a5a7a, 0.51, 0.10, 0.9], [0x8a6a5a, 0.57, -0.07, 0.3], [0x6a7a5a, 0.62, 0.03, 1.9]].forEach(function (gm) {
        var gar = new THREE.Mesh(new THREE.SphereGeometry(0.23, 9, 6), mat(gm[0], 0.94));
        gar.scale.set(1, 0.40, 0.88);
        gar.position.set(cx + 2.35 + gm[2], fl + gm[1], RZ0 + 2.28); gar.rotation.y = gm[3]; add(gar);
        rtag(gar, 0, 'the clothes on the chair', 'the third pile down is the one that actually gets worn.');
      });
      var dg = new THREE.Group(); dg.position.set(cx + 1.05, fl, RZ1 - 0.42); dg.rotation.y = 0.04; add(dg);
      plant(dg, 0.55, 0.30, 0.50, 0);
      [[1.35, 0.78, 0.50, 0.39], [1.42, 0.05, 0.56, 0.80]].forEach(function (q) {
        var m = box(q[0], q[1], q[2], woodM); m.position.y = q[3]; dg.add(m); });
      [0.22, 0.56].forEach(function (dy) {
        var fr2 = box(1.22, 0.02, 0.01, mat(0xc8a24a, 0.4)); fr2.position.set(0, dy, 0.255); dg.add(fr2); });
      var mir = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.72),
        new THREE.MeshStandardMaterial({ color: 0xbfd0da, roughness: 0.08, metalness: 0.85 }));
      mir.position.set(0, 1.28, -0.20); dg.add(mir);
      var mfr = box(0.96, 0.82, 0.03, woodM); mfr.position.set(0, 1.28, -0.225); dg.add(mfr);
      grp(0, dg, 'the dresser', 'the mirror is angled for somebody a bit shorter than either of them.');
      [[0x2f4f8a, 0.05, -0.30, 0.05], [0xc8a24a, 0.03, 0.10, 0.04], [0x9a3a3a, 0.045, 0.34, 0.03]].forEach(function (tk, ti) {
        var tr = new THREE.Mesh(new THREE.CylinderGeometry(tk[1], tk[1], tk[3], 10), mat(tk[0], 0.55));
        tr.position.set(cx + 1.05 + tk[2], fl + 0.84, RZ1 - 0.50); tr.rotation.set(0.1 * ti, 0, 0.06 * ti); add(tr);
        rtag(tr, 0, 'the things on the dresser', 'coins, a watch that stopped, and a button off something.');
      });
      var wgl = new THREE.Mesh(new THREE.PlaneGeometry(1.30, 1.05),
        new THREE.MeshStandardMaterial({ color: 0x2a3a4e, emissive: 0x7f9dc4, emissiveIntensity: 0.30, roughness: 0.25 }));
      wgl.position.set(cx - 0.30, fl + 1.42, RZ0 + 0.04); add(wgl);
      rtag(wgl, 0, 'their window', 'faces the road. they can tell whose car it is before it has parked.');
      [fl + 0.87, fl + 1.97].forEach(function (fy) {
        var f7 = box(1.44, 0.07, 0.06, mat(0xe4e0d2, 0.8)); f7.position.set(cx - 0.30, fy, RZ0 + 0.06); add(f7);
        rtag(f7, 0, 'their window', 'faces the road. they can tell whose car it is before it has parked.'); });
      [-0.68, 0.68].forEach(function (cxo, cxi) {
        var cur2 = box(0.30, 1.10, 0.05, mat(0x9a8a6a, 0.95));
        cur2.position.set(cx - 0.30 + cxo, fl + 1.42, RZ0 + 0.09); cur2.rotation.z = (cxi ? -1 : 1) * 0.012; add(cur2);
        rtag(cur2, 0, 'the curtains', 'they never quite meet in the middle. they have stopped trying.');
      });
      var ovh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf2ead6, emissive: 0xffd9a0, emissiveIntensity: 0.34,
          roughness: 0.85, transparent: true, opacity: 0.9 }));
      ovh.scale.y = 0.6; ovh.position.set(cx, UPF.ce - 0.20, RZ0 + 1.9); add(ovh);
      rtag(ovh, 0, 'their ceiling light', 'a paper globe. it has been meaning to be replaced since it went up.');
      var ol = new THREE.PointLight(0xffd2a0, 0.50, 7.5, 1.9);
      ol.position.set(cx, UPF.ce - 0.40, RZ0 + 1.9); add(ol);
      roomLite(ol, ovh.material, 0.72, 0.44);
      /* ⚠️ MEASURED 73% BoxGeometry and 3.47 meshes per prop, against the bedroom's
       * 37.5% and 5.8. Boxes are the fast way to say 'furniture' and the reason a room
       * reads as blocked-out rather than built. Everything below is deliberately round
       * — a radio, a hatbox, a rod, knobs — because those are the shapes a bedroom of
       * this vintage actually has, and each is built from parts rather than one lump. */
      var wl = new THREE.Group();
      wl.position.set(cx + 1.32, fl + 0.83, RZ1 - 0.52); wl.rotation.y = -0.34; add(wl);
      var wlBody = box(0.30, 0.19, 0.16, mat(0x6a4630, 0.55)); wlBody.position.y = 0.095; wl.add(wlBody);
      var wlTop = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.30, 14, 1, false, 0, Math.PI), mat(0x6a4630, 0.55));
      wlTop.rotation.z = Math.PI / 2; wlTop.position.y = 0.19; wl.add(wlTop);
      var wlSpk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 16), mat(0xd8c9a8, 0.9));
      wlSpk.rotation.x = Math.PI / 2; wlSpk.position.set(-0.06, 0.12, 0.082); wl.add(wlSpk);
      [[0.07, 0.10], [0.07, 0.055]].forEach(function (dl2, di2) {
        var kd = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.014, 12), mat(0x2b2419, 0.5));
        kd.rotation.x = Math.PI / 2; kd.position.set(dl2[0], dl2[1], 0.084);
        kd.rotation.z = di2 ? 0.8 : -0.4; wl.add(kd);
      });
      grp(0, wl, 'the wireless', 'older than both of them. it gets two stations and one of them is the shipping forecast.');
      // a hatbox on the wardrobe, which is where hatboxes go and stay
      var hb = new THREE.Group(); hb.position.set(R.x0 + 1.32, fl + 1.98, RZ1 - 0.50); hb.rotation.y = 0.42; add(hb);
      var hbB = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.20, 0.14, 20), mat(0xb8a898, 0.9));
      hbB.position.y = 0.07; hb.add(hbB);
      var hbL = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.035, 20), mat(0xa8968a, 0.9));
      hbL.position.y = 0.155; hb.add(hbL);
      var hbR = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.008, 6, 20), mat(0x8a5a5a, 0.8));
      hbR.rotation.x = Math.PI / 2; hbR.position.y = 0.10; hb.add(hbR);
      grp(0, hb, 'the hatbox', 'there is a hat in it. nobody has worn a hat since the wedding.');
      // the rod the curtains actually hang from, with a finial on each end
      var rodC = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.90, 10), mat(0x8a7a5a, 0.5));
      rodC.rotation.z = Math.PI / 2; rodC.position.set(cx - 0.30, fl + 2.02, RZ0 + 0.11); add(rodC);
      [-0.95, 0.95].forEach(function (fx) {
        var fin = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), mat(0xc8a24a, 0.4));
        fin.position.set(cx - 0.30 + fx, fl + 2.02, RZ0 + 0.11); add(fin);
        rtag(fin, 0, 'the curtain rod', 'one finial has been loose since it went up and is still loose.');
      });
      rtag(rodC, 0, 'the curtain rod', 'one finial has been loose since it went up and is still loose.');
      // drawer knobs — brass, round, and the reason a dresser reads as a dresser
      [[0.22, -0.36], [0.22, 0.36], [0.56, -0.36], [0.56, 0.36]].forEach(function (kk) {
        var dk = new THREE.Mesh(new THREE.SphereGeometry(0.020, 10, 8), mat(0xc8a24a, 0.35));
        dk.position.set(cx + 1.05 + kk[1], fl + kk[0], RZ1 - 0.42 + 0.26); add(dk);
        rtag(dk, 0, 'the dresser', 'the mirror is angled for somebody a bit shorter than either of them.');
      });
      // his slippers, exactly where they are stepped out of
      [[-0.09, 0.16], [0.09, -0.10]].forEach(function (sl) {
        var sli = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.20, 12, 1, false, 0, Math.PI), mat(0x5a4a3a, 0.95));
        sli.rotation.set(Math.PI / 2, 0, 0.2 + sl[0] * 2);
        sli.position.set(cx - 0.75 + sl[0] * 3.2, fl + 0.055, RZ0 + 2.75 + sl[1]); add(sli);
        rtag(sli, 0, 'his slippers', 'pointing two different directions, which is how they always end up.');
      });
      var rug2 = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.5), mat(0x7a5548, 0.96));
      rug2.rotation.x = -Math.PI / 2; rug2.rotation.z = 0.05;
      rug2.position.set(cx + 0.30, fl + 0.012, RZ0 + 2.55);
      rug2.material.polygonOffset = true; rug2.material.polygonOffsetFactor = -4; add(rug2);
      rtag(rug2, 0, 'the rug', 'bought to cover a mark on the boards that is still there underneath.');
    })();

    /* ============== HER ROOM - KEEP OUT, in three colours ============== */
    (function () {
      var R = UPR[1], cx = (R.x0 + R.x1) / 2;
      var pineM = mat(0xb99a6e, 0.85), duvetM = mat(0x8a5a8a, 0.94), sheetM = mat(0xe8e4d8, 0.95);
      var bg2 = new THREE.Group(); bg2.position.set(R.x0 + 1.30, fl, RZ0 + 1.30); bg2.rotation.y = -0.04; add(bg2);
      plant(bg2, 0.90, 1.00, 0.60, 0);
      [[1.02, 0.28, 1.94, pineM, 0, 0.20, 0], [1.08, 0.66, 0.07, pineM, 0, 0.53, -0.97],
       [0.96, 0.22, 1.86, sheetM, 0, 0.45, 0], [1.04, 0.17, 1.44, duvetM, 0.02, 0.60, 0.20]
      ].forEach(function (q) { var m = box(q[0], q[1], q[2], q[3]); m.position.set(q[4], q[5], q[6]); bg2.add(m); });
      var p2 = box(0.50, 0.14, 0.32, sheetM); p2.position.set(-0.10, 0.62, -0.72); p2.rotation.z = 0.08; bg2.add(p2);
      grp(1, bg2, 'her bed', 'made by pulling the duvet up over everything, which counts.');
      var ted = new THREE.Group(); ted.position.set(R.x0 + 1.12, fl + 0.72, RZ0 + 0.52); ted.rotation.y = 0.8; add(ted);
      var tb = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), mat(0xc9a06a, 0.96)); tb.scale.y = 1.2; ted.add(tb);
      var th = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), mat(0xc9a06a, 0.96)); th.position.y = 0.15; ted.add(th);
      [-0.055, 0.055].forEach(function (ex) {
        var er = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mat(0xc9a06a, 0.96));
        er.position.set(ex, 0.20, 0); ted.add(er); });
      var snt = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat(0x3a2c22, 0.6));
      snt.position.set(0, 0.14, 0.062); ted.add(snt);
      grp(1, ted, 'the bear', 'officially retired. unofficially still on the bed every single night.');
      var dg2 = new THREE.Group(); dg2.position.set(cx + 1.75, fl, RZ0 + 0.55); dg2.rotation.y = 0.06; add(dg2);
      plant(dg2, 0.60, 0.35, 0.45, 0);
      var dt = box(1.20, 0.05, 0.58, pineM); dt.position.y = 0.73; dg2.add(dt);
      [-0.55, 0.55].forEach(function (lx) {
        var sd = box(0.05, 0.73, 0.56, pineM); sd.position.set(lx, 0.365, 0); dg2.add(sd); });
      var dd = box(0.46, 0.16, 0.52, pineM); dd.position.set(0.30, 0.60, 0); dg2.add(dd);
      grp(1, dg2, 'her desk', 'homework happens here about a third of the time. the rest is drawing.');
      var hw = box(0.21, 0.006, 0.29, mat(0xf0ece0, 0.95));
      hw.position.set(cx + 1.52, fl + 0.762, RZ0 + 0.53); hw.rotation.y = 0.30; add(hw);
      rtag(hw, 1, 'the homework', 'due tomorrow. it has been due tomorrow for a while now.');
      var pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 6), mat(0x3a68b0, 0.5));
      pen.position.set(cx + 1.66, fl + 0.772, RZ0 + 0.44); pen.rotation.set(Math.PI / 2, 0, 0.55); add(pen);
      rtag(pen, 1, 'the pen', 'chewed at the end, like every pen in this house.');
      var potM = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.10, 12), mat(0x4f9a5e, 0.6));
      potM.position.set(cx + 2.14, fl + 0.78, RZ0 + 0.64); add(potM);
      rtag(potM, 1, 'the mug of pens', 'four that work, eleven that do not, and nobody ever sorts them.');
      [[0x3a68b0, 0.05, 0.1], [0xc4553f, -0.03, -0.2], [0xe0b23a, 0.015, 0.3]].forEach(function (pc) {
        var pn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 5), mat(pc[0], 0.5));
        pn2.position.set(cx + 2.14 + pc[1], fl + 0.87, RZ0 + 0.64 + pc[1] * 0.5);
        pn2.rotation.set(pc[2], 0, pc[1] * 2.6); add(pn2);
        rtag(pn2, 1, 'the mug of pens', 'four that work, eleven that do not, and nobody ever sorts them.');
      });
      var dl = new THREE.Group(); dl.position.set(cx + 1.28, fl + 0.755, RZ0 + 0.68); dl.rotation.y = -0.45; add(dl);
      var da = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 8), mat(0xc4553f, 0.5));
      da.position.set(0.04, 0.19, 0); da.rotation.z = 0.55; dl.add(da);
      var dh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.13, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xc4553f, emissive: 0xffd9a0, emissiveIntensity: 0.55,
          roughness: 0.7, side: THREE.DoubleSide }));
      dh.position.set(-0.13, 0.36, 0); dh.rotation.z = 2.45; dl.add(dh);
      var db = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.02, 12), mat(0xc4553f, 0.5)); dl.add(db);
      grp(1, dl, 'the desk lamp', 'angled at the wall and not the desk, because that is how she likes it.');
      var dlite = new THREE.PointLight(0xffd2a0, 0.66, 3.6, 1.9);
      dlite.position.set(cx + 1.14, fl + 1.08, RZ0 + 0.68); add(dlite);
      var dlEnt = roomLite(dlite, dh.material, 0.92, 0.72);
      dl.children.forEach(function (m) {
        if (m.userData && m.userData.name) m.userData.action = function () {
          dlEnt.on = !dlEnt.on; AUDIO.clickSfx && AUDIO.clickSfx(dlEnt.on ? 1650 : 1100);
        };
      });
      [[-1.55, 0x8a4fd0, 'BAND'], [-0.55, 0x2fb6c8, 'HORSES'], [0.75, 0xd8443a, 'TOUR']].forEach(function (po, poi) {
        var pt = canvasTex(64, 88, function (c, w, h) {
          c.fillStyle = '#' + po[1].toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h);
          c.fillStyle = 'rgba(255,255,255,0.20)'; c.beginPath(); c.arc(w / 2, h * 0.36, 16, 0, 7); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(0, h * 0.64, w, h * 0.36);
          c.fillStyle = '#f2ece0'; c.font = 'bold 11px Georgia, serif'; c.textAlign = 'center';
          c.fillText(po[2], w / 2, h * 0.82);
        });
        pt.colorSpace = THREE.SRGBColorSpace;
        var pm = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.60),
          new THREE.MeshStandardMaterial({ map: pt, roughness: 0.94 }));
        pm.position.set(cx + po[0], fl + 1.54 + poi * 0.04, RZ0 + 0.045);
        pm.rotation.z = (poi - 1) * 0.026; add(pm);
        rtag(pm, 1, 'her posters', 'taped at the corners. one corner always comes down in the night.');
      });
      var koT = canvasTex(96, 64, function (c, w, h) {
        c.fillStyle = '#f2ecd8'; c.fillRect(0, 0, w, h);
        c.font = 'bold 15px Georgia, serif'; c.textAlign = 'center';
        c.fillStyle = '#c4553f'; c.fillText('KEEP', w / 2, 27);
        c.fillStyle = '#3a68b0'; c.fillText('OUT', w / 2, 45);
        c.strokeStyle = '#4f9a5e'; c.lineWidth = 3; c.strokeRect(5, 5, w - 10, h - 10);
      });
      koT.colorSpace = THREE.SRGBColorSpace;
      var ko = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16),
        new THREE.MeshStandardMaterial({ map: koT, roughness: 0.95 }));
      ko.position.set(R.doorX, fl + 1.42, RZ1 + 0.055); ko.rotation.y = Math.PI; ko.rotation.z = 0.05; add(ko);
      rtag(ko, 1, 'KEEP OUT', 'three colours, because one colour would not have been serious enough.');
      (function () {
        var pts = [];
        for (var f8 = 0; f8 <= 8; f8++) {
          var t7 = f8 / 8;
          pts.push(new THREE.Vector3(R.x0 + 0.40 + t7 * (R.x1 - R.x0 - 0.8),
                                     fl + 2.00 - Math.sin(t7 * Math.PI) * 0.15, RZ0 + 0.07));
        }
        var cur = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        var wire = new THREE.Mesh(new THREE.TubeGeometry(cur, 32, 0.006, 5, false), mat(0x3a3f46, 0.7));
        add(wire); rtag(wire, 1, 'the fairy lights', 'up since one christmas and never once taken down.');
        for (var lb = 0; lb <= 8; lb++) {
          var pp = cur.getPointAt(lb / 8), col = [0xff8a2b, 0x8a4fd0, 0x2bd07a, 0xff5aa8][lb % 4];
          var lmp = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6),
            new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.85, roughness: 0.5 }));
          lmp.position.copy(pp); lmp.position.y -= 0.022; add(lmp);
          rtag(lmp, 1, 'the fairy lights', 'up since one christmas and never once taken down.');
        }
        var fli = new THREE.PointLight(0xffa0d0, 0.26, 4.5, 2.0);
        fli.position.set(cx, fl + 1.85, RZ0 + 0.35); add(fli);
        roomLite(fli, null, 0.26, 0);
      })();
      var bean = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 9), mat(0x4f9a5e, 0.95));
      bean.scale.set(1, 0.60, 0.92); bean.position.set(cx - 1.55, fl + 0.26, RZ1 - 0.80); bean.rotation.y = 0.75; add(bean);
      rtag(bean, 1, 'the beanbag', 'has taken the shape of one specific way of sitting and will not take another.');
      (function () { var sh = plant(g, 0.50, 0.46, 0.50, fl); if (sh) sh.position.set(cx - 1.55, fl + 0.016, RZ1 - 0.80); })();   // a round soft mass with no shadow reads as a balloon
      var shf = box(1.30, 0.04, 0.22, pineM);
      shf.position.set(cx + 0.55, fl + 1.30, RZ1 - 0.16); shf.rotation.z = -0.008; add(shf);
      rtag(shf, 1, 'her shelf', 'put up by somebody in a hurry. everything on it leans very slightly left.');
      [[0xd8443a, -0.42, 0.9], [0x3a68b0, -0.18, 0.2], [0xe0b23a, 0.10, 1.4]].forEach(function (bo) {
        var bk2 = box(0.035, 0.20, 0.15, mat(bo[0], 0.9));
        bk2.position.set(cx + 0.55 + bo[1], fl + 1.42, RZ1 - 0.16); bk2.rotation.z = bo[2] * 0.05; add(bk2);
        rtag(bk2, 1, 'her books', 'three she has read eleven times and one she has never opened.');
      });
      var jb = box(0.16, 0.08, 0.12, mat(0xc4553f, 0.7));
      jb.position.set(cx + 0.86, fl + 1.36, RZ1 - 0.16); jb.rotation.y = 0.25; add(jb);
      rtag(jb, 1, 'the jewellery box', 'plays one bar and a half of something, then gives up.');
      /* ⚠️ 2.93 meshes per prop — the lowest in the house — because most of what is
       * in here is one object doing one job. These two are deliberately assemblies:
       * a mobile is nothing BUT parts hanging off each other, and it is the only thing
       * in the room that occupies the air between the ceiling and the bed. */
      var mob = new THREE.Group();
      mob.position.set(R.x0 + 1.30, UPF.ce - 0.30, RZ0 + 1.05); mob.rotation.y = 0.7; add(mob);
      var mobRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.006, 6, 20), mat(0x8a7a5a, 0.6));
      mobRing.rotation.x = Math.PI / 2; mob.add(mobRing);
      var mobStr = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.22, 5), mat(0xd8d2c2, 0.8));
      mobStr.position.y = 0.11; mob.add(mobStr);
      [[0, 0.16, 0x2fb6c8, 'ico'], [2.1, 0.14, 0xff8a2b, 'sph'], [4.2, 0.19, 0xf0e2bc, 'cone']].forEach(function (mh) {
        var hx2 = Math.cos(mh[0]) * 0.15, hz2 = Math.sin(mh[0]) * 0.15;
        var thr = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, mh[1], 4), mat(0xd8d2c2, 0.8));
        thr.position.set(hx2, -mh[1] / 2, hz2); mob.add(thr);
        var shp = mh[3] === 'ico' ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), mat(mh[2], 0.7))
               : mh[3] === 'sph' ? new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), mat(mh[2], 0.7))
               : new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.06, 10), mat(mh[2], 0.7));
        shp.position.set(hx2, -mh[1] - 0.03, hz2); shp.rotation.set(0.3, mh[0], 0.2); mob.add(shp);
      });
      grp(1, mob, 'the mobile', 'hung over the cot and never taken down. it still turns when the door opens.');
      // the brush and the hand mirror, which live together and are never both found
      var brsh = new THREE.Group();
      brsh.position.set(cx + 1.94, fl + 0.775, RZ0 + 0.40); brsh.rotation.set(0, 0.9, 0); add(brsh);
      var brB = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), mat(0x8a4fd0, 0.6));
      brB.scale.set(1, 0.32, 0.62); brsh.add(brB);
      var brH = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.013, 0.11, 8), mat(0x8a4fd0, 0.6));
      brH.rotation.z = Math.PI / 2; brH.position.set(0.09, 0, 0); brsh.add(brH);
      for (var bz2 = 0; bz2 < 5; bz2++) {
        var bri = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.018, 4), mat(0x2b2e33, 0.7));
        bri.position.set(-0.028 + bz2 * 0.014, 0.016, 0); brsh.add(bri);
      }
      grp(1, brsh, 'the hairbrush', 'and the hand mirror that goes with it, which is under the bed.');
      var hcl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf2ead6, emissive: 0xffd9a0, emissiveIntensity: 0.30,
          roughness: 0.85, transparent: true, opacity: 0.9 }));
      hcl.scale.y = 0.62; hcl.position.set(cx, UPF.ce - 0.20, RZ0 + 1.9); add(hcl);
      rtag(hcl, 1, 'her ceiling light', 'the shade has a horse on it. it was chosen at six and defended ever since.');
      var hli = new THREE.PointLight(0xffd2a0, 0.44, 7.0, 1.9);
      hli.position.set(cx, UPF.ce - 0.40, RZ0 + 1.9); add(hli);
      roomLite(hli, hcl.material, 0.54, 0.36);
    })();

    /* ============== THE ATTIC - warm, and it smells like old paper ============== */
    (function () {
      var R = UPR[2], cx = (R.x0 + R.x1) / 2;
      var cardM = mat(0xb99a6e, 0.95), cardDk = mat(0x9d8058, 0.95);
      /* the roof coming down is the ONLY thing that makes this read as an attic rather
       * than a small bedroom - it has the same ceiling as every other room up here
       * until something slopes. */
      var slope = box(R.x1 - R.x0, 0.10, 3.1, mat(0x6a5a48, 0.95));
      slope.position.set(cx, fl + 1.76, RZ0 + 1.15); slope.rotation.x = -0.40; add(slope);
      rtag(slope, 2, 'the roof slope', 'you learn where you can stand up straight and you never forget it.');
      [[-1.30, 0.30, 0.55, 0.62, 'XMAS'], [-1.22, 0.82, 0.05, 0.55, 'BABY'],
       [0.55, 0.30, 0.42, 0.68, 'TAX'], [0.60, 0.78, -0.12, 0.42, 'KITCHEN'],
       [1.58, 0.30, 0.70, 0.32, 'DAD'], [-0.30, 0.30, -0.35, 0.94, 'SCHOOL']].forEach(function (bx) {
        var bg3 = new THREE.Group();
        bg3.position.set(cx + bx[0], fl + bx[1] - 0.30, RZ0 + 1.30 + bx[2]); bg3.rotation.y = bx[3]; add(bg3);
        if (bx[1] <= 0.31) plant(bg3, 0.34, 0.28, 0.45, 0);   // only the boxes ON the floor, not the stacked ones
        var bd = box(0.56, 0.44, 0.46, cardM); bd.position.y = 0.22; bg3.add(bd);
        var ld = box(0.58, 0.03, 0.48, cardDk); ld.position.y = 0.445; bg3.add(ld);
        var lt = canvasTex(64, 32, function (c, w, h) {
          c.fillStyle = '#e8e2cf'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#3a2f22'; c.font = 'bold 13px Georgia, serif'; c.textAlign = 'center';
          c.fillText(bx[4], w / 2, 21);
        });
        lt.colorSpace = THREE.SRGBColorSpace;
        var lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13),
          new THREE.MeshStandardMaterial({ map: lt, roughness: 0.95 }));
        lbl.position.set(0, 0.24, 0.232); bg3.add(lbl);
        grp(2, bg3, 'the boxes', 'labelled in marker by somebody who was very sure they would remember.');
      });
      var tg2 = new THREE.Group(); tg2.position.set(cx + 1.15, fl, RZ1 - 0.95); tg2.rotation.y = -0.36; add(tg2);
      plant(tg2, 0.48, 0.32, 0.50, 0);
      var trb = box(0.92, 0.44, 0.52, mat(0x5a4636, 0.9)); trb.position.y = 0.22; tg2.add(trb);
      var trl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.92, 14, 1, false, 0, Math.PI), mat(0x4a3a2c, 0.9));
      trl.rotation.z = Math.PI / 2; trl.position.y = 0.44; tg2.add(trl);
      [-0.30, 0.30].forEach(function (sx2) {
        var stp = box(0.05, 0.46, 0.54, mat(0x3a2c1c, 0.6)); stp.position.set(sx2, 0.23, 0); tg2.add(stp); });
      var ltc = box(0.10, 0.08, 0.03, new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.4, metalness: 0.55 }));
      ltc.position.set(0, 0.30, 0.27); tg2.add(ltc);
      grp(2, tg2, 'the trunk', 'came with the house. nobody living has ever had the key.');
      var abulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffd9a0, emissiveIntensity: 0.95, roughness: 0.6 }));
      abulb.position.set(cx - 0.30, fl + 1.60, RZ1 - 0.55); add(abulb);
      var aflex = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.62, 5), mat(0x2b2e33, 0.6));
      aflex.position.set(cx - 0.30, fl + 1.95, RZ1 - 0.55); add(aflex);
      [abulb, aflex].forEach(function (m) { rtag(m, 2, 'the attic bulb',
        'you pull the flex, not a switch, and you do it by feel because the switch is at the bottom.'); });
      var alite = new THREE.PointLight(0xffd2a0, 0.80, 5.6, 1.9);
      alite.position.set(cx - 0.30, fl + 1.55, RZ1 - 0.55); add(alite);
      var alEnt = roomLite(alite, abulb.material, 1.30, 1.15);   // attic: k=1.76 measured
      // the hint already says you pull the flex, not a switch. Now you can.
      [abulb, aflex].forEach(function (m) {
        m.userData.action = function () {
          alEnt.on = !alEnt.on; AUDIO.clickSfx && AUDIO.clickSfx(alEnt.on ? 1500 : 980);
        };
      });
      var agl = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54),
        new THREE.MeshStandardMaterial({ color: 0x3a4a5e, emissive: 0x8fa6c8, emissiveIntensity: 0.40, roughness: 0.3 }));
      agl.position.set(UPF.x1 - 0.09, fl + 1.24, RZ0 + 1.70); agl.rotation.y = -Math.PI / 2; add(agl);
      rtag(agl, 2, 'the gable window',
        'painted shut. the light through it is the best light in the house and nobody is ever up here to see it.');
      var afr = box(0.04, 0.62, 0.62, mat(0xd8d2c2, 0.85));
      afr.position.set(UPF.x1 - 0.11, fl + 1.24, RZ0 + 1.70); add(afr);
      rtag(afr, 2, 'the gable window',
        'painted shut. the light through it is the best light in the house and nobody is ever up here to see it.');
      var beam = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 2.3), new THREE.MeshBasicMaterial({
        color: 0xfff0d0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
      beam.position.set(UPF.x1 - 1.05, fl + 0.80, RZ0 + 1.70); beam.rotation.set(0, -Math.PI / 2, 0.44); add(beam);
      var awl = new THREE.PointLight(0x9fc0e0, 0.22, 4.0, 2.0);
      awl.position.set(UPF.x1 - 0.60, fl + 1.20, RZ0 + 1.70); add(awl);
      roomLite(awl, agl.material, 0.22, 0.40, false);   // this one is the sun
      var arug = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.70, 12), mat(0x7a5548, 0.96));
      arug.rotation.z = Math.PI / 2; arug.rotation.y = 0.26;
      arug.position.set(cx - 1.45, fl + 0.16, RZ1 - 0.42); add(arug);
      rtag(arug, 2, 'the rolled rug', 'it will go somewhere someday. so far it has gone up here.');
      var osh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.22, 12, 1, true), mat(0xc4b48a, 0.92));
      osh.position.set(cx + 0.05, fl + 0.16, RZ1 - 0.34); osh.rotation.set(1.32, 0.4, 0); add(osh);
      rtag(osh, 2, 'the old lampshade', 'replaced, not thrown away, which is the entire principle of this room.');
      /* ⚠️ MEASURED: 0 props resting on a surface, against the bedroom's 15 — an
       * automatic fail on the rubric and obvious once written down. An attic is
       * nothing BUT things put down on top of other things. These sit on the trunk
       * and on the box stack, so the room finally has a middle layer. */
      var album = box(0.30, 0.045, 0.24, mat(0x6a3f38, 0.85));
      album.position.set(cx + 1.05, fl + 0.49, RZ1 - 1.00); album.rotation.y = -0.36 + 0.14; add(album);
      var album2 = box(0.26, 0.035, 0.21, mat(0x3f5068, 0.85));
      album2.position.set(cx + 1.12, fl + 0.53, RZ1 - 0.94); album2.rotation.y = -0.36 - 0.22; add(album2);
      [album, album2].forEach(function (m) { rtag(m, 2, 'the albums',
        'photographs of people nobody left can name, kept anyway.'); });
      var tin = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.06, 16), mat(0xb8a05a, 0.4));
      tin.position.set(cx + 0.86, fl + 0.50, RZ1 - 1.14); tin.rotation.y = 0.5; add(tin);
      var tinL = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.012, 16), mat(0x9a8448, 0.4));
      tinL.position.set(cx + 0.88, fl + 0.535, RZ1 - 1.05); tinL.rotation.set(0.24, 0.5, 0.1); add(tinL);
      [tin, tinL].forEach(function (m) { rtag(m, 2, 'the biscuit tin',
        'there have never been biscuits in it. there are buttons and a tape measure.'); });
      var doll = new THREE.Group();
      doll.position.set(cx - 1.22, fl + 0.99, RZ0 + 1.35); doll.rotation.set(0.2, 0.9, 0.34); add(doll);
      var dBody = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 10), mat(0xd8b8a0, 0.85));
      doll.add(dBody);
      var dHead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0xe8ccb8, 0.8));
      dHead.position.y = 0.11; doll.add(dHead);
      var dHair = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8, 0, Math.PI * 2, 0, 1.4), mat(0x6a4a30, 0.9));
      dHair.position.y = 0.118; doll.add(dHair);
      doll.children.forEach(function (m) { rtag(m, 2, 'the doll',
        'sat on top of the BABY box, facing out, which somebody did on purpose.'); });
      var skates = box(0.22, 0.07, 0.09, mat(0xf0ece0, 0.7));
      skates.position.set(cx + 0.62, fl + 1.02, RZ0 + 1.18); skates.rotation.set(0, 0.42, 0.08); add(skates);
      var blade = box(0.20, 0.012, 0.012, new THREE.MeshStandardMaterial({ color: 0xc8cdd4, roughness: 0.25, metalness: 0.7 }));
      blade.position.set(cx + 0.62, fl + 0.98, RZ0 + 1.18); blade.rotation.set(0, 0.42, 0.08); add(blade);
      [skates, blade].forEach(function (m) { rtag(m, 2, 'the skates',
        'one size too small the winter they were bought and never worn since.'); });
      var tbx = box(0.28, 1.20, 0.28, cardDk);
      tbx.position.set(R.x0 + 0.42, fl + 0.60, RZ0 + 0.60); tbx.rotation.set(0.14, 0.3, 0.16); add(tbx);
      rtag(tbx, 2, 'the tree', 'in its box, leaning in the corner, waiting for the one week it is famous.');
      (function () { var sh = plant(g, 0.30, 0.30, 0.45, fl); if (sh) sh.position.set(R.x0 + 0.42, fl + 0.016, RZ0 + 0.60); })();
      /* the birdcage: round, empty, and hung on a nail at an angle nobody chose —
       * which is also the last of the off-axis the room was short of. */
      var cage = new THREE.Group();
      cage.position.set(cx - 1.62, fl + 1.05, RZ0 + 0.72); cage.rotation.set(0.16, 0.6, 0.22); add(cage);
      var cgTop = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, 1.0), mat(0xb8b2a2, 0.5));
      cgTop.position.y = 0.13; cage.add(cgTop);
      var cgBase = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.135, 0.03, 16), mat(0x8a7a5a, 0.6));
      cgBase.position.y = -0.02; cage.add(cgBase);
      for (var cb = 0; cb < 8; cb++) {
        var ang = cb / 8 * Math.PI * 2;
        var bar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.16, 4), mat(0xb8b2a2, 0.5));
        bar2.position.set(Math.cos(ang) * 0.118, 0.06, Math.sin(ang) * 0.118); cage.add(bar2);
      }
      var cgHook = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 5, 12), mat(0xb8b2a2, 0.5));
      cgHook.position.y = 0.26; cage.add(cgHook);
      grp(2, cage, 'the birdcage', 'empty for as long as anyone can remember, and nobody will throw it out.');
      var mags = new THREE.Group();
      mags.position.set(cx - 0.55, fl + 0.03, RZ1 - 0.72); mags.rotation.y = 0.78; add(mags);
      [[0x8a5a4a, 0, 0.06], [0x4a5a7a, 0.03, -0.14], [0xc4a04a, 0.06, 0.22]].forEach(function (mg) {
        var mgm = box(0.21, 0.028, 0.28, mat(mg[0], 0.92));
        mgm.position.set(0, mg[1], 0); mgm.rotation.y = mg[2]; mags.add(mgm);
      });
      grp(2, mags, 'the magazines', 'kept because of one article in one of them, and nobody remembers which.');
      var chr = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xc8443a, roughness: 0.25, metalness: 0.5 }));
      chr.position.set(R.x0 + 0.72, fl + 0.045, RZ0 + 0.78); add(chr);
      rtag(chr, 2, 'the loose bauble', 'escaped a box some year and has been rolling around up here ever since.');
      for (var dd2 = 0; dd2 < 26; dd2++) {
        var a2 = dd2 * 2.399, r2 = 0.35 + (dd2 % 7) * 0.11;
        var mo = new THREE.Mesh(new THREE.SphereGeometry(0.008, 5, 4),
          new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.30 }));
        mo.position.set(UPF.x1 - 0.45 - (dd2 % 5) * 0.16, fl + 0.55 + Math.sin(a2) * 0.55,
                        RZ0 + 1.70 + Math.cos(a2) * r2);
        add(mo);
      }
    })();
  })();

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
  /* ⚠️⚠️ THE GALLERY SIZES ITSELF TO THE ACHIEVEMENT LIST. It used to be a hard
   * two rows at a fixed 0.4 pitch — `z = 1.15 - col * 0.4` — which fitted the
   * twenty awards it was built for and nothing more. Six new ones landed on
   * 2026-08-11 (one per game that had no badge) and the last three columns
   * marched straight out through the north wall to z -3.65, hanging in the front
   * yard. Nobody saw it because you never stand north of the hall looking back.
   * Now the run of wall is FIXED and the layout adapts to fill it, so adding
   * awards re-flows the wall instead of posting them outside the house. */
  var PW_Z0 = 1.15, PW_Z1 = -2.85;          // the stretch of east wall the gallery owns
  var PW_N = PROFILE.ACHIEVEMENTS.length;
  var pwRows = 2, pwCols = Math.ceil(PW_N / pwRows);
  if ((pwCols - 1) * 0.40 > (PW_Z0 - PW_Z1)) { pwRows = 3; pwCols = Math.ceil(PW_N / pwRows); }
  var pwStep = Math.min(0.40, (PW_Z0 - PW_Z1) / Math.max(1, pwCols - 1));
  var pwY0 = pwRows > 2 ? 1.34 : 1.46, pwYStep = pwRows > 2 ? 0.50 : 0.48;
  var frames = [];
  PROFILE.ACHIEVEMENTS.forEach(function (a, i) {
    var row = i % pwRows, col = (i / pwRows) | 0;
    var z = PW_Z0 - col * pwStep, y = pwY0 + row * pwYStep;
    /* ⚠️ THE GALLERY WAS HUNG INSIDE THE WALL. At E_IN + 0.012 the frame box sat
     * BEHIND the wall face (the hall is west of E_IN, so proud means MORE negative)
     * and only the photo plane poked out — by one millimetre, which the depth buffer
     * cannot separate at this range. Every frame on the wall was a depth tie, and the
     * whole gallery shimmered as the camera drifted. Hung properly now: the frame
     * stands 12mm off the plaster like a real one. Same lesson as the skirting.
     * ⚠️ MORE NEGATIVE IS TOWARD THE ROOM on this wall. Getting the sign wrong here
     * buries the whole gallery again. */
    var fr = new THREE.Group(); fr.position.set(E_IN - 0.022, y, z); fr.rotation.z = (((i * 7) % 5) - 2) * 0.012; photoWall.add(fr);
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
  /* ⚠️ KZ1 WAS 2.05 AND IT IS 0.30 NOW, to make room for the living room on this
   * side of the house (Kyle: put it back behind the original door and extend the
   * house). Every single thing in this kitchen is measured off KZ1 — floor, walls,
   * ceiling, skirting, the counter run, the fridge, the bin, the clock and the
   * calendar — so the whole south end walks north together and nothing had to be
   * repositioned by hand. That is the entire reason it is a constant.
   * ⚠️ krest moved with it: the resting camera was at z 0.60, which is now OUTSIDE
   * the room. A space whose camera stands in the next room is not a space. */
  var KX0 = -13.00, KX1 = -7.55, KZ0 = -3.55, KZ1 = 0.30, KCEIL = 2.62;
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
  /* ⚠️ THE SINK WAS HANGING IN MID-AIR. This run ended at KZ1 - 2.6 = -2.30 while the
   * sink sits at z -2.225 and its basin covers -2.395..-2.055, so only 9.5 cm of a
   * 34 cm basin had any worktop under it — rays cast straight down from the basin, the
   * tap and the dish rack all missed every counter mesh and hit the lino 0.92 m below.
   * KZ1 - 0.85 = -0.55 is exactly the splashback's span, which is what the run was
   * always meant to match. Checked for collisions: the fridge, the table, the apron
   * and the doorway are all clear of the extension. */
  counterRun(KZ0 + CT_D + 0.02, KZ1 - 0.85, KX0 + CT_D / 2 + 0.05, "z");

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
  /* ⚠️ the fridge stands against the SOUTH wall, so when that wall came north for
   * the living room the fridge came with it — straight into the line the camera
   * walks from the doorway to its resting spot. It moved down the wall to the west
   * end, which is where a fridge goes anyway: beside the counter run, not in the
   * doorway. */
  var frX = KX1 - 3.35;
  var fridge = box(0.78, 1.72, 0.72, mat(0xe8e6dc, 0.42));
  fridge.position.set(frX, 0.86, KZ1 - 0.5); kadd(fridge);
  var frSplit = box(0.8, 0.02, 0.74, mat(0xbfbdb2, 0.5));
  frSplit.position.set(frX, 1.22, KZ1 - 0.5); kadd(frSplit);
  var frHnds = [];   // captured so the baked fridge can retire them with the rest
  [[0.62, 0.5], [1.5, 0.28]].forEach(function (hh) {
    var hnd = box(0.04, hh[1], 0.04, mat(0xbfbdb2, 0.35));
    hnd.position.set(frX - 0.33, hh[0], KZ1 - 0.87); kadd(hnd); frHnds.push(hnd);
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
  /* the baked fridge moved to the SOUTH-WEST CORNER and turned to FACE THE DOOR
   * (Kyle: a highlight piece when you walk in). The doorway is at z -0.90..0.20 on
   * the east wall and the fridge front now aims straight down that sightline —
   * magnets and the kid’s drawing greet you from across the room. ry = PI/2 maps
   * the bake’s +z front to +x (east); back sits near the west wall (KX0).
   * ⚠️ the PROCEDURAL fallback (a 404 keeps it) still stands in the old spot
   * against the south wall — fine, it was never the highlight. */
  propSwap("fridge", kitG, [fridge, frSplit, frDoor].concat(frHnds),
    { x: KX0 + 0.55, z: -0.15, w: 0.82, d: 0.88, h: 1.80, ry: Math.PI / 2 }, frDoor);
  /* ⚠️ the glow moved WITH the fridge to the SW corner — and the first attempt
   * read frGlow one line above its own , which is hoisted-undefined, and took
   * the whole module down at boot. Same class as the paperM trap: set the position
   * ON the declaration line, never before it. */
  var frGlow = new THREE.PointLight(0xbfe8d8, 0.28, 2.4, 2);
  frGlow.position.set(KX0 + 1.25, 1.0, -0.15); kadd(frGlow);

  // --- the table, where the actual living gets done
  var tblT = box(1.15, 0.05, 0.78, lamM); tblT.position.set(KCX + 0.55, 0.74, KCZ + 1.05); kadd(tblT);
  var tblLegs = [];   // captured so the baked table can retire them with the top
  [[-0.5, -0.32], [0.5, -0.32], [-0.5, 0.32], [0.5, 0.32]].forEach(function (l) {
    var lg = box(0.05, 0.72, 0.05, mat(0x8a6a44, 0.7));
    lg.position.set(KCX + 0.55 + l[0], 0.36, KCZ + 1.05 + l[1]); kadd(lg); tblLegs.push(lg);
  });
  ktag(tblT, "the kitchen table", null, "homework, cereal, and every difficult conversation this house has had.");
  /* ⚠️ h is capped just under the sketch's 0.74 top so the fruit bowl — placed on
   * the OLD surface height — keeps sitting on the table instead of floating over it. */
  propSwap('ktable', kitG, [tblT].concat(tblLegs),
    { x: KCX + 0.55, z: KCZ + 1.05, w: 1.15, d: 0.80, h: 0.76, ry: 0,
      onPlaced: function (top) {   // re-seat the bowl and fruit on the REAL top
        var dy = (top + 0.004) - 0.768;
        [bowl2, bowlBase].concat(kFruit).forEach(function (m) { m.position.y += dy; });
      } }, tblT);
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
  // ⚠️ THE CHAIR WAS INSIDE THE FRIDGE. When KZ1 came north the fridge moved west to
  // x -10.90 (AABB -11.29..-10.51) and this chair was left at -10.445: the seat, the
  // full height of the backrest and one whole leg were all inside the fridge door.
  kChair(-0.30, 0.10, 0);                    // tucked in, and clear of the fridge
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

  /* ---- SHORT STAFFED: the apron on its hook by the window ---------------------
   * The apron is painted in the visitor's OWN crew colour: the game stores the
   * picked colour as an INDEX in 'ss-color' (main.js:45), and the four apron hexes
   * are the game's 3D crew palette verbatim (world.js:13). Fresh visitors get
   * index 0 — Hazel's red. */
  var ssColIdx = (function () { try { var i5 = parseInt(localStorage.getItem("ss-color"), 10); return (i5 >= 0 && i5 < 4) ? i5 : 0; } catch (e) { return 0; } })();
  var ssApBase = ["#d94f38", "#3a76c4", "#e8b53a", "#5c9e4f"][ssColIdx];
  var ssApDark = ["#a83a2c", "#2a5a96", "#c2933a", "#477e3d"][ssColIdx];
  var apT = canvasTex(96, 144, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = ssApBase;
    c.beginPath();                                              // bib + skirt
    c.moveTo(w * 0.32, 6); c.lineTo(w * 0.68, 6);
    c.lineTo(w * 0.68, h * 0.34); c.lineTo(w * 0.88, h * 0.42); c.lineTo(w * 0.88, h - 6);
    c.lineTo(w * 0.12, h - 6); c.lineTo(w * 0.12, h * 0.42); c.lineTo(w * 0.32, h * 0.34);
    c.closePath(); c.fill();
    c.strokeStyle = "#fff6e8"; c.lineWidth = 3;                 // neck strap + ties, the game's --white
    c.beginPath(); c.moveTo(w * 0.32, 8); c.quadraticCurveTo(w * 0.5, -8, w * 0.68, 8); c.stroke();
    c.fillStyle = ssApDark; c.fillRect(w * 0.24, h * 0.52, w * 0.52, h * 0.22); // the pocket
    c.strokeStyle = "#fff6e8"; c.lineWidth = 2; c.strokeRect(w * 0.24, h * 0.52, w * 0.52, h * 0.22);
    c.fillStyle = "#fff6e8"; c.font = "bold 10px Georgia, serif"; c.textAlign = "center";
    // ⚠️ "WING BARN" appears nowhere in SHORT STAFFED. The diner is Hazel's —
    // strings.js:9: "Her name is on the sign. Her mother's recipes are on the menu."
    c.fillText("HAZEL'S", w * 0.5, h * 0.44);
    c.fillStyle = "rgba(90,60,30,0.4)";                         // one grease mark, earned
    c.beginPath(); c.ellipse(w * 0.62, h * 0.82, 8, 5, 0.4, 0, 7); c.fill();
  });
  var apron = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62),
    new THREE.MeshStandardMaterial({ map: apT, transparent: true, roughness: 0.95, side: THREE.DoubleSide }));
  apron.position.set(KX0 + 0.07, 1.42, -0.62); apron.rotation.y = Math.PI / 2; apron.rotation.z = 0.04; kadd(apron);
  var apHook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), mat(0x8f959b, 0.4));
  apHook.rotation.z = Math.PI / 2; apHook.position.set(KX0 + 0.05, 1.74, -0.62); kadd(apHook);
  var ssName = (function () { try { return localStorage.getItem("ss-name") || null; } catch (e) { return null; } })();
  var ssHint = ssName
    ? "SHORT STAFFED — " + ssName + "'s apron, still on the hook · click to take a shift"
    : "SHORT STAFFED — somebody's shift starts eventually · click to clock in";
  function ssGo() { window.location.href = "https://kylefriesmarketing.github.io/short-staffed/"; }
  [apron, apHook].forEach(function (m) { ktag(m, "SHORT STAFFED", ssGo, ssHint); });
  /* the ticket wheel — world.js:581, the most diner object there is — on a little
   * shelf under the hook, with one order ticket leaning by it (white body, gold top
   * stripe: the game's own HUD .tkt) and the wordless green open plate (world.js:639
   * — the game's sign is a red/green flip plate with no text, so no text here). */
  var ssShelf = box(0.16, 0.02, 0.30, mat(0x8a6a44, 0.75)); ssShelf.position.set(KX0 + 0.10, 1.02, -0.62); kadd(ssShelf);
  var ssPost = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.10, 8), mat(0x8f959b, 0.4));
  ssPost.position.set(KX0 + 0.10, 1.08, -0.70); kadd(ssPost);
  var ssWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 14), mat(0x8f959b, 0.35));
  ssWheel.rotation.z = Math.PI / 2; ssWheel.position.set(KX0 + 0.10, 1.155, -0.70); kadd(ssWheel);
  var ssWheelBits = [ssShelf, ssPost, ssWheel];
  for (var tk5 = 0; tk5 < 6; tk5++) {
    var ta5 = tk5 / 6 * Math.PI * 2;
    var card5 = box(0.002, 0.04, 0.03, mat(0xfff6e8, 0.9));
    card5.position.set(KX0 + 0.10, 1.155 + Math.cos(ta5) * 0.052, -0.70 + Math.sin(ta5) * 0.052);
    card5.rotation.x = ta5; kadd(card5); ssWheelBits.push(card5);
  }
  var ssTktT = canvasTex(64, 48, function (c, w, h) {
    c.fillStyle = "#fff6e8"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#e8b53a"; c.fillRect(0, 0, w, 6);                    // the gold top stripe
    c.fillStyle = "#3a2c1c";                                            // dish dots
    [14, 26, 38].forEach(function (dy) { c.beginPath(); c.arc(10, dy, 2.5, 0, 7); c.fill(); c.fillRect(17, dy - 2, 26 + (dy % 3) * 4, 4); });
    c.fillStyle = "#2a2620"; c.fillRect(8, h - 8, w - 16, 4);           // patience track
    c.fillStyle = "#5c9e4f"; c.fillRect(8, h - 8, (w - 16) * 0.7, 4);   // still green — the set is 5c9e4f/e8b53a/d94f38
  });
  var ssTkt = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.045),
    new THREE.MeshStandardMaterial({ map: ssTktT, roughness: 0.9 }));
  ssTkt.position.set(KX0 + 0.105, 1.06, -0.52); ssTkt.rotation.y = Math.PI / 2; ssTkt.rotation.x = -0.14; kadd(ssTkt); ssWheelBits.push(ssTkt);
  var ssPlate = box(0.006, 0.025, 0.04, mat(0x5c9e4f, 0.7));
  ssPlate.position.set(KX0 + 0.105, 1.045, -0.585); kadd(ssPlate); ssWheelBits.push(ssPlate);
  ssWheelBits.forEach(function (m) { ktag(m, "SHORT STAFFED", ssGo, "cook the tickets. make the rent. mind the bear."); });

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
          // HOME BREW's entire visual identity is chalk on #2c3a31; a cream label is not from it
          c.fillStyle = "#2c3a31"; c.fillRect(0, 0, w, h);
          c.strokeStyle = "#f4ead8"; c.lineWidth = 2; c.strokeRect(3, 3, w - 6, h - 6);
          c.fillStyle = "#f4ead8"; c.font = "bold 9px Georgia, serif"; c.textAlign = "center";
          c.fillText("HOME", w / 2, 20); c.fillText("BREW", w / 2, 32);
          c.save(); c.translate(4, 3); c.rotate(-0.3); c.fillStyle = "#e8d9a8"; c.fillRect(-4, -3, 12, 6); c.restore();   // the tape corner
        }), roughness: 0.9,
      }));
      lbl.position.set(bp[0], 0.09, bp[1] + 0.031); lbl.rotation.z = -0.06; brewG.add(lbl);
    }
  });
  /* the tier shelf: the game's five quality tiers as a graded flight (names, prices
   * and every hex from DATA.TIERS, my-brew 01_data.js:278-286) behind the bottles,
   * and the champion — "The Grand Ol' Sudsy" (01_data.js:82) — corked and set apart
   * in LEGENDARY gold #ffd98a. No brewery name sign: none exists in the source. */
  var brewTiers = [["swill", "#8a9a6a"], ["decent", "#c9c26a"], ["good", "#e8a33d"], ["great", "#e86a3d"], ["LEGENDARY", "#ffd98a"]];
  var brewMenu = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11),
    new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(128, 88, function (c, w, h) {
      c.fillStyle = "#2c3a31"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#f4ead8"; c.lineWidth = 2; c.strokeRect(3, 3, w - 6, h - 6);
      c.font = "bold 9px Georgia, serif"; c.textAlign = "left";
      var prices = ["$1.5", "$3", "$5", "$8", "$10"];
      brewTiers.forEach(function (t5, i5) {
        c.fillStyle = t5[1]; c.fillText(t5[0], 12, 20 + i5 * 13);
        c.fillStyle = "#f4ead8"; c.textAlign = "right"; c.fillText(prices[i5], w - 12, 20 + i5 * 13); c.textAlign = "left";
      });
      c.save(); c.translate(6, 4); c.rotate(-0.3); c.fillStyle = "#e8d9a8"; c.fillRect(-5, -3, 13, 6); c.restore();
    }) }));
  brewMenu.position.set(-0.01, 0.075, -0.115); brewMenu.rotation.x = -0.10; brewG.add(brewMenu);
  brewTiers.forEach(function (t5, i5) {   // the taster flight, Swill to LEGENDARY
    var col5 = parseInt(t5[1].slice(1), 16);
    var glass5 = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.03, 8),
      new THREE.MeshStandardMaterial({ color: col5, roughness: 0.3, emissive: col5, emissiveIntensity: 0.16 }));
    glass5.position.set(-0.08 + i5 * 0.031, 0.015, 0.135); brewG.add(glass5);
  });
  var champM = new THREE.MeshStandardMaterial({ color: 0xffd98a, roughness: 0.15, transparent: true, opacity: 0.9 });
  var champ = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.19, 12), champM);
  champ.position.set(0.19, 0.095, 0.03); brewG.add(champ);
  var champNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.07, 8), champM);
  champNeck.position.set(0.19, 0.22, 0.03); brewG.add(champNeck);
  var champCork = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 8), mat(0xb08a56, 0.9));
  champCork.position.set(0.19, 0.262, 0.03); brewG.add(champCork);
  var champTag = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.032),
    new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(64, 28, function (c, w, h) {
      c.fillStyle = "#2c3a31"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#f4ead8"; c.lineWidth = 1.5; c.strokeRect(2, 2, w - 4, h - 4);
      c.fillStyle = "#ffd98a"; c.font = "italic 8px Georgia, serif"; c.textAlign = "center";
      c.fillText("the grand", w / 2, 12); c.fillText("ol' sudsy", w / 2, 22);
    }) }));
  champTag.position.set(0.19, 0.05, 0.066); champTag.rotation.x = -0.18; brewG.add(champTag);
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
  // ⚠️ stays LINEAR: these are darkening/wear decals whose alpha ramps were tuned
  // against linear sampling; an sRGB decode would re-shape every ground shadow.
  function radialTex(rgb, peak) {
    return canvasTexLinear(64, 64, function (c, w, h) {
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
  [[KX1 - 3.35, KZ1 - 0.5, 0.52, 0.48, 0.55],   // the fridge
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
  /* ⚠️⚠️ THE KITCHEN WING WAS NEVER CLAD. The two runs above span W_IN to E_IN —
   * the HALL’s width — but the ground floor carries on west for the kitchen, whose
   * north wall IS the house’s front face there. From the street that whole bay showed
   * its interior wall material: half the house in lap siding, half in kitchen plaster,
   * with a hard seam at the porch. Nobody caught it in months because the porch camera
   * looks AWAY from the house — the only way to see your own front elevation is to
   * stand in the street and point a camera back at it. */
  var kSide = box((W_IN - 0.1) - (KX0 - 0.05), 3.0, 0.04, sidingM);
  kSide.position.set(((KX0 - 0.05) + (W_IN - 0.1)) / 2, 1.5, KZ0 - 0.175); yadd(kSide);
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
  var chLegs = [];
  [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]].forEach(function (l) {
    var lg = box(0.05, 0.4, 0.05, mat(0x5a6a50, 0.9));
    lg.position.set(PX0 + 0.85 + l[0], 0.2, PZ1 + 0.62 + l[1]); yadd(lg); chLegs.push(lg);
  });
  ytag(chSeat, "the porch chair", null, "one chair. there used to be two.");
  // the baked lawn chair — green and white webbing, the one every porch had.
  // back sits streetward of the seat, so the chair faces the front door (+z).
  propSwap('lawnchair', chSeat.parent, [chSeat, chBack].concat(chLegs),
    { x: PX0 + 0.85, z: PZ1 + 0.53, w: 0.60, h: 0.82, ry: 0 }, chSeat);
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
    /* ⚠️ MATCH THE COLOUR MAP'S ANISOTROPY. Every relief surface in the house — the
     * floors, the lawn, the road, the brick — sampled its colour at 4-8 and its bump
     * at three.js's default of 1, and floors are exactly the grazing-angle case
     * anisotropy exists for. The relief shimmered against a stable colour. */
    bt.anisotropy = tex.anisotropy || 4;
    return bt;
  }
  function ground(tex, repX, repY, colour, rough, bumpScale) {
    /* ⚠️⚠️ CLONE, DO NOT MUTATE THE TEXTURE YOU WERE HANDED. concT, asphT and tileT
     * each dress two or three surfaces at different repeats, and setting repeat on
     * the shared object means the LAST caller wins — every earlier material silently
     * re-tiles, while its bumpMap keeps the repeat it was born with, so the relief
     * slides off the colour. It was doing exactly that to the kitchen backsplash:
     * asked for 6x1, ended up 4x0.14, so the tile grid rendered as smeared bands.
     * A clone shares the Source (no second GPU upload) and owns its own repeat.
     * room.js:325 already documents this hazard and clones; this did not. */
    var t = tex.clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repX, repY);
    t.colorSpace = THREE.SRGBColorSpace;            // honest colours, same as the sky
    var m = new THREE.MeshStandardMaterial({ map: t, color: colour || 0xffffff, roughness: rough == null ? 0.97 : rough });
    var b = bumpFrom(t, 1.8);
    if (b) { b.repeat.copy(t.repeat); m.bumpMap = b; m.bumpScale = bumpScale == null ? 1.2 : bumpScale; }
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
  var grassM = ground(grassT, 26, 14, 0x9fb894, 1, 1.6);   // kept: the pool apron and anything else still sharing it

  /* ⚠️⚠️ WORLD-ALIGNED, not just per-plane. Thirteen lawn planes from 18 x 5 m to
   * 80 x 23 m shared one material and therefore one tile count, so the mower stripe
   * measured 6.7 cm on one plane and 59.3 cm on the one it abuts — a 9x change of
   * pitch across a seam you can stand on.
   * ⚠️ BUT the back lawn's planes deliberately OVERLAP (see the note at the back-lawn
   * fill), and that is only safe while both sides sample the SAME grass. Giving each
   * plane its own repeat would have made two overlapping planes disagree on tile
   * PHASE and z-fight between two different patterns — trading one bug for a worse
   * one. So the tiling is pinned to WORLD position instead: repeat scales with the
   * plane's size and offset cancels its origin, so any two planes agree everywhere
   * they meet or overlap, seams included.
   * The plane is rotated -PI/2 about X, so V runs against +Z — hence the sign. */
  function lawnM(wx, wz, cx, cz) {
    var ku = 0.325, kv = 0.74;                    // the 80 x 18.9 plane's own density
    var t = grassT.clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(wx * ku, wz * kv);
    t.offset.set((cx - wx / 2) * ku, -(cz + wz / 2) * kv);
    var m = new THREE.MeshStandardMaterial({ map: t, color: 0x9fb894, roughness: 1 });
    var b = bumpFrom(t, 1.8);
    if (b) { b.repeat.copy(t.repeat); b.offset.copy(t.offset); m.bumpMap = b; m.bumpScale = 1.6; }
    LOOK_EXTRA.push(m); return m;
  }

  /* Contact shade. Nothing outdoors casts a real shadow — yardSun deliberately
   * doesn't, because a shadow-casting directional over this much geometry is not
   * worth 6 more passes — so every tree, car and post was sitting ON the world
   * rather than in it. One shared soft-disc texture, one decal per object, exactly
   * the trick the bedroom already uses under its furniture.
   * ⚠️ polygonOffset, NOT a raised y. The ground pieces sit at several different
   * heights (lawn -0.45, path -0.43, road -0.51) and a fixed offset that clears one
   * of them z-fights or vanishes under another. Offsetting depth only means the
   * decal hugs whatever is actually beneath it. */
  var shadeTex = canvasTexLinear(64, 64, function (c, w, h) {
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
  /* ⚠️⚠️ AND THE NEAR STRIP HAS A HOLE IN IT, because the stairwell goes through
   * here. GROUND is -0.45 and this plane runs the full 80m — so it passes UNDER the
   * house and, at the top of the basement stairs, straight across the opening. The
   * floor's own hole was never the problem: looking down the stairwell you hit lawn
   * 45cm below the boards and the flight simply stopped (measured — a ray down the
   * well hit "y=-0.45 PlaneGeometry" at z 1.1 through 1.3, with eleven perfectly
   * good steps continuing below it).
   * It is invisible everywhere else because it is a single-sided plane: from the
   * basement, which sits at y -2.42 to -0.28, the camera is BELOW it and sees only
   * culled back faces. That is why this survived so long.
   * The cut is sized to the SIGHTLINE, not to the hole. Standing at the hall's rest
   * spot and looking down the well, the line of sight passes through the opening and
   * meets y -0.45 at z 0.05 — a third of a metre NORTH of the hole's own north edge
   * — so a hole the same size as the floor's would still have shown lawn through it.
   * Everything cut away here has hall floor directly over it, so nothing else in the
   * house can see the gap. */
  var LAWN_CUT = { x0: -7.50, x1: -6.20, z0: -0.70, z1: 1.90 };
  [[4.0, Z_WALK], [Z_FKERB, -52]].forEach(function (lz, li) {
    var zA = Math.min(lz[0], lz[1]), zB = Math.max(lz[0], lz[1]);
    var rects = (li === 0)
      ? [[-45, 35, zA, LAWN_CUT.z0],                    // north of the cut, full width
         [-45, 35, LAWN_CUT.z1, zB],                    // south of the cut, full width
         [-45, LAWN_CUT.x0, LAWN_CUT.z0, LAWN_CUT.z1],  // west sliver
         [LAWN_CUT.x1, 35, LAWN_CUT.z0, LAWN_CUT.z1]]   // east sliver
      : [[-45, 35, zA, zB]];
    rects.forEach(function (r) {
      if (r[1] - r[0] < 0.001 || r[3] - r[2] < 0.001) return;
      var lw = new THREE.Mesh(new THREE.PlaneGeometry(r[1] - r[0], r[3] - r[2]), lawnM(r[1] - r[0], r[3] - r[2], (r[0] + r[1]) / 2, (r[2] + r[3]) / 2));
      lw.rotation.x = -Math.PI / 2;
      lw.position.set((r[0] + r[1]) / 2, GROUND, (r[2] + r[3]) / 2); lw.receiveShadow = true; yadd(lw);
    });
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
  /* ⚠️ THE DRIVE MOVED WEST, from x -16.8..-13.6 to -20.8..-17.6, because it stood
   * exactly where the house needs to grow. The apron stretches to meet it rather
   * than the drive bending — a drive is a straight run from the kerb and the apron
   * is the bit that fans out at the top, which is also how it reads. */
  var drive = box(3.2, 0.06, 25.6, driveM); drive.position.set(-19.2, GROUND + 0.02, -6.0); yadd(drive);
  // ⚠️ the apron BEGINS where the drive ends (x -13.6) instead of straddling it. As a
  // 3.4m slab centred on the drive's edge it overlapped the drive by 1.7m at the same
  // height: 4.25m² of identical top AND bottom face, the biggest fight in the yard.
  var apron = box(5.7, 0.06, 2.6, driveM); apron.position.set(-14.75, GROUND + 0.02, 5.6); yadd(apron);
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
   /* ⚠️⚠️ DERIVED FROM GDO, NOT HARDCODED — this wall was SEALING THE DOOR.
    * The man door moved south to z 7.45..8.49. The INTERIOR wall was correctly
    * re-derived at the same time (see `[[4.35, GDO.z0], [GDO.z1, 8.45]]` further
    * down), but this exterior shell kept its old split and left its opening at
    * z 5.08..6.12 — so the real doorway was buried inside the solid 6.12..8.60
    * slab, and the garage walk (P.gdoor2 -> P.gmid) drove the camera through solid
    * wall on EVERY entry. Nothing noticed for months because no camera ever stood
    * outside the garage's east side to look at it.
    * The lesson is the pattern, not the numbers: a constant was made authoritative
    * on one side of a wall and left hardcoded on the other. Both sides read GDO now,
    * so they cannot disagree again. */
   [0.2, 3.0, GDO.z0 - 4.20, -7.65, 1.05, (4.20 + GDO.z0) / 2],        // east, north of the man door
   [0.2, 3.0, 8.60 - GDO.z1, -7.65, 1.05, (GDO.z1 + 8.60) / 2],        // east, south of it
   [0.2, 2.55 - GDO.y1, GDO.z1 - GDO.z0, -7.65,                        // east header over it
    (GDO.y1 + 2.55) / 2, (GDO.z0 + GDO.z1) / 2],
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
  /* ⚠️⚠️ THIS WAS BUILT WITH A NEGATIVE DEPTH. Z_KERB is -18.8 and Z_ROADF is -27.6,
   * so `Z_ROADF - Z_KERB` is -8.8 — the only degenerate dimension in all 2,724 meshes
   * in this file. A negative extent flips the winding on every face, and roadM is a
   * plain FrontSide material, so the whole box rendered inside-out: what you actually
   * saw was its UNDERSIDE, 5 cm below the intended surface, carrying a downward normal
   * — an unlit near-black band with the centre-line dashes floating above it. */
  var road = box(78, 0.05, Z_KERB - Z_ROADF, roadM);
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
    new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffb347, emissiveIntensity: 1.6, roughness: 0.5 }));   // --amber, the title-glow
  slLamp.position.set(-3.66, GROUND + 4.94, Z_WALK - 1.4); yadd(slLamp);
  var streetLight = new THREE.PointLight(0xffc98a, 1.5, 18, 1.6);   // the game's heat-scan warm
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
    c.fillStyle = "#efe6d0"; c.fillRect(0, 0, w, h);                          // --paper
    c.strokeStyle = "#9c3d2e"; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = "#1a1712"; c.font = "900 15px Impact, 'Arial Black', sans-serif"; c.textAlign = "center";   // the logo face
    c.fillText("VICTORY", w / 2, 34); c.fillText("LAP", w / 2, 52);
    c.fillStyle = "#6b4a2f"; c.font = "bold 9px Georgia, serif";
    c.fillText("H O P E W E L L", w / 2, 66);                                  // the town
    c.fillStyle = "#4a4436"; c.font = "italic 10px Georgia, serif";
    c.fillText("the 6 a.m. bus", w / 2, 84);
    c.fillText("leaves without you", w / 2, 98);
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
  /* ⚠️ THIS WAS A GREEN GREY-ALIEN HEAD IN A SERIF — a 90s-UFO cliche the game never
   * uses. QUARRY is seen entirely through THE MASK: amber CRT phosphor (#e8c88a) on
   * void black (#05070a), one typeface (Courier New), scanlines, and the object its
   * players actually collect is the TROPHY FANG — the same silhouette as the bedroom's
   * own buildFang collectible. The board now says what the game says. */
  var qSignT = canvasTex(128, 96, function (c, w, h) {
    c.fillStyle = "#05070a"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#e8c88a"; c.lineWidth = 4; c.strokeRect(5, 5, w - 10, h - 10);
    // the fang: a curved two-stroke tooth, cord-wrapped at the root
    c.strokeStyle = "#e8c88a"; c.lineWidth = 7; c.lineCap = "round";
    c.beginPath(); c.moveTo(w * 0.44, h * 0.62); c.quadraticCurveTo(w * 0.40, h * 0.30, w * 0.52, h * 0.18); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(w * 0.50, h * 0.62); c.quadraticCurveTo(w * 0.47, h * 0.36, w * 0.54, h * 0.22); c.stroke();
    c.strokeStyle = "#d97a4a"; c.lineWidth = 2;
    for (var wr = 0; wr < 3; wr++) { c.beginPath(); c.moveTo(w * 0.40, h * (0.58 + wr * 0.03)); c.lineTo(w * 0.52, h * (0.56 + wr * 0.03)); c.stroke(); }
    c.fillStyle = "#e8c88a"; c.font = "bold 15px 'Courier New', monospace"; c.textAlign = "center";
    c.fillText("QUARRY", w / 2, h - 16);
    c.fillStyle = "#d97a4a"; c.font = "bold 8px 'Courier New', monospace";
    c.fillText("SOMETHING CAME DOWN", w / 2, h - 6);
    // the mask's scanlines
    c.fillStyle = "rgba(0,0,0,0.16)";
    for (var sy = 6; sy < h - 6; sy += 3) c.fillRect(6, sy, w - 12, 1);
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
      emissive: 0x9a7f4e, emissiveIntensity: 0.85 }));
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
  /* ⚠️ fc-bagged is a ONE-SHOT FLAG — the game guards `if (getItem('fc-bagged'))
   * return;` and writes "1" exactly once — and this code was parsing it as an
   * integer and PLURALISING it. The count could never exceed one, so "N bags on the
   * kerb" was a fiction; what the flag actually means is "you have bagged at least
   * once". The real progress number lives in fc-save.done, so use that. */
  var fcLawns = (function () { try {
    var m = JSON.parse(localStorage.getItem("fc-save") || "null");
    var c = m && m.done ? Object.keys(m.done).length : 0;
    if (c && m.done.daily) c -= 1;
    return c;
  } catch (e) { return 0; } })();
  var fcHint = fcLawns > 0
    ? "FRESH CUT — " + fcLawns + " of 48 lawns cut · the grass grew back"
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

  /* ⚠️ OUR OWN FRONT WINDOWS, and they belong HERE rather than beside the siding that
   * carries them: nbWin is declared at the top of the neighbours block above, and a
   * var is undefined until its line runs. Pushing to it from the siding code 600 lines
   * earlier would throw — the same hoisting trap that ate an hour on paperWallM.
   * The house had exactly one pane on its whole front elevation and it was unlit, so
   * from the street it read as an empty building. These are facade windows: the walls
   * behind them are solid, which is why they can sit anywhere the elevation wants one.
   * Joining nbWin means the phase drives them with the neighbours for free — dim by
   * day, full after dark — and the house lights up when the street does. */
  /* ⚠️ MUNTINS ARE NOT DECORATION HERE. Shot from the pavement, a lit rectangle with
   * no bars across it reads as a glowing PANEL, not a window - photographed beside the
   * one existing 2x2 window on this elevation, that is the whole difference between a
   * house and a warehouse. The cross sits PROUD of the glass (z - 0.02, toward the
   * street) and the frame BEHIND it: on this elevation more-negative z is nearer. */
  function litWindow(x, y, w, h, z) {
    var m = new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffca82, emissiveIntensity: 1.1, roughness: 0.5 });
    var pane = box(w, h, 0.05, m); pane.position.set(x, y, z); yadd(pane);
    var fr = box(w + 0.14, h + 0.14, 0.03, trimM); fr.position.set(x, y, z + 0.015); yadd(fr);
    var v = box(0.055, h, 0.03, trimM); v.position.set(x, y, z - 0.02); yadd(v);
    var hz = box(w, 0.055, 0.03, trimM); hz.position.set(x, y, z - 0.02); yadd(hz);
    nbWin.push(m); return m;
  }
  litWindow(-12.20, 4.72, 1.25, 0.95, HOUSE_F - 0.10);
  litWindow(-8.60, 4.72, 1.25, 0.95, HOUSE_F - 0.10);
  litWindow(1.90, 4.72, 1.25, 0.95, HOUSE_F - 0.10);
  /* ⚠️ and the one the house already had: an opening at x -5.00..-3.80 whose glass
   * (bwGlass) faces the BACK yard, so from the street it was a black hole punched in
   * the middle of a row of lit windows - the only dark pane on the house. Sized to the
   * opening and set just proud of the siding so it plugs it. */
  litWindow(-4.40, 4.75, 1.20, 0.90, HOUSE_F - 0.06);
  // and two on the kitchen wing, whose face stands 0.15 further out than the hall’s,
  // so these clear KZ0 - 0.175 rather than the hall's HOUSE_F - 0.055
  litWindow(-11.80, 2.00, 1.15, 0.85, KZ0 - 0.24);
  litWindow(-9.20, 2.00, 1.15, 0.85, KZ0 - 0.24);

  /* ⚠️⚠️ THE EAST WING HAD NO OUTSIDE. From x -4.35 to +4.35 — nine metres, the whole
   * width of the bedroom — nothing stood on the house's front plane at all, so the
   * surface facing the street was the BEDROOM'S INTERIOR: its wallpaper, its pink
   * border stripe at y 2.60, its skirting. From the pavement the house showed a pale
   * papered panel where its front wall should be. It is invisible from indoors and
   * from the porch cameras, which is how it survived this long; it is unmissable the
   * moment anyone looks at the house from the front.
   * ⚠️ Safe to clad ONLY because the bedroom's portal camera (WIN_EYE) stands at
   * z = HOUSE_F - 0.10, already OUTSIDE this skin and aimed down the street at
   * z -26. A wall here cannot appear in the view out of the bedroom window. Check
   * that again before moving either number. */
  var eastW = 4.42 - (E_IN + 0.10);
  var eSide = box(eastW, 3.0, 0.04, sidingM);
  eSide.position.set((E_IN + 0.10 + 4.42) / 2, 1.5, HOUSE_F - 0.055); yadd(eSide);
  /* and the bedroom's own window, cut where the real one is (x 1.63..3.07, y 1.08..2.82).
   * This is the hero room, so from the street it is the window that should be burning. */
  litWindow(2.35, 1.95, 1.44, 1.74, HOUSE_F - 0.10);

  /* ⚠️ AND A 4.2 m NOTCH AT THE FRONT-WEST CORNER: the second storey and the eaves run
   * out to x -17.20, but the ground floor stopped at the kitchen's west wall (-13.05),
   * so there was a black gap under the overhang that you could see the neighbour's
   * house and the parked car through. Front and west return, both siding — that closes
   * it from the street and from the west approach, which are the only ways to see it. */
  /* ⚠️ the literal, NOT UP.x0: the UP box is declared 1,100 lines below this and
   * var hoists, so reading it here gets undefined. Same trap as paperM. */
  var UPX0 = -17.20;                         // === UP.x0, kept in step by hand
  var nW = (KX0 - 0.05) - (UPX0 + 0.08);
  var nFront = box(nW, 3.0, 0.04, sidingM);
  nFront.position.set((UPX0 + 0.08 + KX0 - 0.05) / 2, 1.5, HOUSE_F - 0.055); yadd(nFront);
  var nWest = box(0.04, 3.0, 3.80, sidingM);
  nWest.position.set(UPX0 + 0.10, 1.5, HOUSE_F - 0.055 + 1.90); yadd(nWest);

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
  var mistT = canvasTexLinear(128, 128, function (c, w, h) {
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
      /* ⚠️ hold the top colour across the first fifth: on a dome, v=0 is a single
       * POINT, so a gradient that starts changing immediately funnels into a dark
       * bullseye right overhead. A flat cap reads as open sky. */
      var bgr = bc.createLinearGradient(0, 0, 0, BH);
      bgr.addColorStop(0, s.top); bgr.addColorStop(0.20, s.top); bgr.addColorStop(1, s.bot);
      bc.fillStyle = bgr; bc.fillRect(0, 0, BW, BH);
      if (night) {
        for (var bst = 0; bst < 150; bst++) {
          var bsy = BH * 0.06 + Math.random() * BH * 0.70;   // off the pole: see CLOUDS
          bc.fillStyle = "rgba(255,255,255," + (0.15 + Math.random() * 0.5 * (1 - bsy / BH)).toFixed(2) + ")";
          bc.fillRect(Math.random() * BW, bsy, 1.3, 1.3);
        }
        // the same moon, squashed for THIS plane's stretch (90/34 vs 256/128 = 1.32)
        var bmx = BW * 0.62, bmy = 36, AR2 = 1.32;   // ⚠️ not higher — see CLOUDS below
        var bhalo = bc.createRadialGradient(bmx, bmy, 2, bmx, bmy, 26);
        bhalo.addColorStop(0, "rgba(226,234,255,0.4)"); bhalo.addColorStop(1, "rgba(226,234,255,0)");
        bc.save(); bc.translate(bmx, bmy); bc.scale(1 / AR2, 1); bc.translate(-bmx, -bmy);
        bc.fillStyle = bhalo; bc.beginPath(); bc.arc(bmx, bmy, 26 * AR2, 0, 7); bc.fill();
        bc.restore();
        bc.fillStyle = "#e8edff";
        bc.beginPath(); bc.ellipse(bmx, bmy, 7.5 / AR2, 7.5, 0, 0, 7); bc.fill();
      }
      /* ⚠⚠ CLOUDS ON A DOME ARE NOT CLOUDS ON A BILLBOARD. These were seven ellipses
       * up to 166px wide on a 256px canvas, drawn from y=14 down. On the old flat
       * plane they read as long soft streaks. Wrapped on the hemisphere, u IS the
       * compass and v IS the altitude — so every one of them became a complete RING
       * around the sky, all of them concentric on the zenith. Look straight up and
       * you got a bullseye (photographed).
       * Two rules keep them honest:
       *   1. compact in u — a puff is ~7% of the horizon, not 65%, so it reads as a
       *      cloud from any direction instead of a band that follows you round;
       *   2. nothing above v 0.30 — u collapses to a point at the pole, so anything
       *      painted up there is smeared into a disc no matter how small it is.
       * Each puff is drawn three times (x, x±BW) so one straddling the seam behind
       * you doesn't get sliced in half. */
      var CLOUDS = [[0.06, 0.40, 26], [0.19, 0.63, 19], [0.31, 0.36, 22],
                    [0.44, 0.71, 30], [0.55, 0.45, 17], [0.67, 0.58, 25],
                    [0.78, 0.34, 20], [0.88, 0.66, 28], [0.97, 0.50, 16]];
      bc.fillStyle = cl;
      CLOUDS.forEach(function (cd, ci) {
        var cx = cd[0] * BW, cy = cd[1] * BH, cw = cd[2] * 0.62, ch = 2.6 + (ci % 3) * 0.9;
        for (var wrap = -1; wrap <= 1; wrap++) {
          var wx = cx + wrap * BW;
          bc.beginPath(); bc.ellipse(wx, cy, cw, ch, 0, 0, 7); bc.fill();
          bc.beginPath(); bc.ellipse(wx - cw * 0.42, cy + ch * 0.5, cw * 0.55, ch * 0.72, 0, 0, 7); bc.fill();
          bc.beginPath(); bc.ellipse(wx + cw * 0.48, cy + ch * 0.4, cw * 0.48, ch * 0.66, 0, 0, 7); bc.fill();
        }
      });
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
  /* ⚠️⚠️ WEATHER DOES NOT FALL THROUGH A ROOF. The fall fields are one big box
   * over the whole lot, and the HOUSE STANDS INSIDE IT — so rain and snow came
   * down through the roof and fell in the hallway, the kitchen, the garage and
   * onto the porch you are standing on (Kyle: "it needs to not rain inside").
   * The yard group is visible from every indoor space except the bedroom, so it
   * was visible almost everywhere. These are the rectangles that have something
   * over them; a drop inside one is recycled instead of drawn.
   * The porch numbers come from the deck and its roof, the house from the shell
   * constants, so neither can drift from the geometry it is protecting. */
  var COVERED = [
    { x0: KX0 - 0.2, x1: 4.4, z0: Z_N - 0.25, z1: Z_S + 0.25, top: GROUND + 4.2 },   // kitchen + hall + garage + bedroom
    { x0: PX0 - 0.3, x1: PX1 + 0.3, z0: PZ1 - 0.2, z1: HOUSE_F + 0.1, top: 3.10 },   // the porch, under its roof
    /* ⚠️ THE HOUSE GREW TWICE AND ITS ROOF DID NOT. The first rect was written when
     * the house stopped at the kitchen (x0 KX0 - 0.2 = -13.20) and tops out at
     * GROUND + 4.2 = 3.75. Since then the living room reached west to -17.15, so it
     * rained on 3.95 m of it, and a whole second storey went up to y 5.70, so weather
     * fell through the landing. Both new entries are DERIVED from the constants that
     * build the geometry, exactly as the first one is, so they cannot drift apart
     * from it again. */
    { x0: LIV.x0 - 0.2, x1: KX0 - 0.15, z0: LIV.z0 - 0.2, z1: LIV.z1 + 0.2, top: LIV.ce + 0.5 },
    { x0: UPF.x0 - 0.2, x1: UPF.x1 + 0.2, z0: UPF.z0 - 0.2, z1: UPF.z1 + 0.2, top: UPF.ce + 0.10 },
  ];
  function underCover(x, y, z) {
    for (var ci = 0; ci < COVERED.length; ci++) {
      var c2 = COVERED[ci];
      if (y < c2.top && x > c2.x0 && x < c2.x1 && z > c2.z0 && z < c2.z1) return true;
    }
    return false;
  }
  function fallField(n, box, tex, size, color, op) {
    var geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      // ⚠️ the SEED has to dodge the roofs as well. Seeding blind and relying on
      // the tick to clean up means the first frame after "rain" is switched on
      // has drops hanging inside the hall — brief, but exactly when you look.
      for (var tries = 0; tries < 6; tries++) {
        pos[i * 3]     = box[0] + Math.random() * (box[1] - box[0]);
        pos[i * 3 + 1] = box[2] + Math.random() * (box[3] - box[2]);
        pos[i * 3 + 2] = box[4] + Math.random() * (box[5] - box[4]);
        if (!underCover(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])) break;
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ map: tex, color: color, size: size, transparent: true,
      opacity: op, depthWrite: false, sizeAttenuation: true });
    var p = new THREE.Points(geo, m); p.visible = false; p.frustumCulled = false; yadd(p);
    return { pts: p, geo: geo, mat: m, box: box };
  }
  // a drop: a soft vertical streak down the middle of an otherwise empty square
  var dropTex = canvasTexLinear(16, 16, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    var g5 = c.createLinearGradient(0, 0, 0, h);
    g5.addColorStop(0, "rgba(210,226,246,0)"); g5.addColorStop(0.35, "rgba(210,226,246,0.95)");
    g5.addColorStop(0.75, "rgba(210,226,246,0.75)"); g5.addColorStop(1, "rgba(210,226,246,0)");
    c.fillStyle = g5; c.fillRect(w * 0.42, 0, w * 0.16, h);
  });
  var flakeTex = canvasTexLinear(16, 16, function (c, w, h) {
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
    if (wxKind !== "storm") { boltF = 0; skyDome.material.color.setScalar(1); backSky.material.color.setScalar(1); yardHemi.intensity = phaseHemi; }
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
  function reseed(p, i, b) {                     // back to the top, somewhere new
    p[i + 1] = b[3];
    // ⚠️ up to 6 tries, then give up and place it anyway. An unbounded "keep
    // rolling until it misses the house" loop is a hang waiting for a day when
    // someone makes the covered area bigger than the field.
    for (var n = 0; n < 6; n++) {
      p[i]     = b[0] + Math.random() * (b[1] - b[0]);
      p[i + 2] = b[4] + Math.random() * (b[5] - b[4]);
      if (!underCover(p[i], b[3], p[i + 2])) return;
    }
  }
  function tickFall(f, dt, t, fall, sway) {
    var a = f.geo.attributes.position, p = a.array, b = f.box;
    for (var i = 0; i < p.length; i += 3) {
      p[i + 1] -= fall * dt;
      if (sway) p[i] += Math.sin(t * 0.8 + i) * sway * dt * 0.35;
      // fell below the field, or drifted in under a roof — either way, start again
      if (p[i + 1] < b[2] || underCover(p[i], p[i + 1], p[i + 2])) reseed(p, i, b);
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
      // ⚠️ skyDome is the FRONT backdrop. From the back lawn the entire sky is
      // backSky, and it sat at a flat baseline through every bolt — the grass lit up
      // and the thing supposedly doing the lighting did not.
      backSky.material.color.setScalar(1 + k * 1.7);
    } else if (skyDome.material.color.r !== 1) {
      yardHemi.intensity = phaseHemi; skyDome.material.color.setScalar(1); backSky.material.color.setScalar(1);
    }
  }

  // --- a car goes past now and then. It is the only thing in this house that is
  // ever in a hurry.
  var passG = parkedCar(0, (Z_KERB + Z_ROADF) / 2 - 2.1, Math.PI / 2, 0x5a5f66, 0x4b5057);
  var passHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe9b0, emissiveIntensity: 1.8, roughness: 0.4 }));
  passHead.position.set(0, 0.62, -2.0); passG.add(passHead);
  /* ⚠️ the headlight glow must NOT live inside passG: hiding the parked car removed
   * a light from the scene, which changes NUM_POINT_LIGHTS and recompiles every
   * shader program in the house — ON EVERY PASS, every 14-40 seconds. The light
   * lives on yardG at intensity 0 now and rides the car by position instead. */
  var passLite = new THREE.PointLight(0xffe0b0, 0, 12, 1.8); passLite.position.set(0, 0.9, -3.0); yardG.add(passLite);
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
  var tkBodyM = mat(0xf7f3e6, 0.55), tkTrimM = mat(0xef9ec0, 0.5);   // CY'S livery: cream body, the soft pink band (truck/tex.js livery())
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
  // on yardG, not truckG, for the same recompile reason as passLite above
  var tkLite = new THREE.PointLight(0xffd9a0, 0, 14, 1.7); tkLite.position.set(-0.3, 1.7, -2.2); yardG.add(tkLite);
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
  /* ⚠️⚠️ AND IT MUST NOT EXIST WHILE YOU ARE INSIDE THE HOUSE. The bedroom camera
   * rests at z 5.25, which is SOUTH of this south face at z 3.62 — outside the
   * set, looking in through the open side. At rest that is invisible because the
   * whole hall group is hidden from the bedroom. But the walk to the hallway sets
   * mode away from idle, the group snaps visible on frame one, and this panel
   * appears THREE QUARTERS OF A METRE IN FRONT OF THE LENS and is then flown
   * through (Kyle: "it glitches into the wall"). Measured: the flight passes
   * within 0.044m of it, and the near plane is 0.1, so it is sliced open.
   * It is exterior cladding. It exists to be seen from the back lawn and nowhere
   * else, so that is the only time it is up. */
  var bedShell = [];
  /* ⚠️⚠️ THE SECOND STOREY STOOD ON NOTHING. The shell above (UP) runs to z 7.60,
   * and east of the hall this ground floor stopped at z 3.69 — so 8.0 m x 3.9 m of
   * upstairs hung over open grass, 6 m from where you stand in the back yard. I
   * measured it rather than trusting the note: five rays cast straight down from
   * y 2.9 under the storey all hit the LAWN at y -0.45 and nothing in between.
   * The fix is not to shrink the storey (UPF runs the real floor to z 7.35, so a
   * shorter shell would leave the landing unclad) — it is that the ground floor was
   * always meant to be this deep. It reaches z 7.38 now and meets the hall's east
   * wall exactly at that wall's own 7.24 joint.
   * ⚠️ Checked for collisions first: everything in this band sits between x -4.4 and
   * -4.0, hard against the hall wall. From x -4.0 to 3.7 there was nothing at all. */
  [[7.94, 3.3, 0.14, -0.28, 1.2, 7.31],    // south face, carried back to meet the hall
   [0.14, 3.3, 10.98, 3.62, 1.2, 1.89],    // east face, the full new depth
   [8.3, 0.12, 11.15, -0.35, 3.02, 1.875]] // the lid the storey actually sits on
    .forEach(function (bs) {
      var shell = box(bs[0], bs[1], bs[2], sidingM);
      shell.position.set(bs[3], bs[4], bs[5]); badd(shell);
      bedShell.push(shell);
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
  /* ⚠⚠ A DOME, NOT A BILLBOARD. This was a 90x34 PLANE standing behind the fence,
   * so the sky was a band: black above it, black past both its edges, and nothing
   * at all if you turned your head (Kyle: "the sky isn't complete"). A hemisphere
   * covers every direction you can look, including straight up, and the gradient
   * maps the right way round by construction — SphereGeometry's v runs from the
   * top down, which is how the texture is painted.
   * Radius 90 so the FRONT yard's own backdrop (a plane at z -74) still sits
   * inside it and keeps rendering in front; the dome only closes the gaps. */
  var backSky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: backSkyT, side: THREE.BackSide, fog: false }));
  backSky.position.set(XC, GROUND - 1.2, Z_S + 6); badd(backSky);

  // ⚠️ the lawn is FOUR planes around a hole, not one — the pool is dug through it.
  // One plane meant a ray down the pool mouth hit GRASS at y GROUND before it ever
  // reached the water at -0.22: a pool painted over, the door-needs-a-hole lesson
  // in landscaping form. The apron's border slabs hide the seams.
  /* ⚠️ x0 was XC-15 (-20.9) and the west neighbours stand at x -21 to -28 — so they
   * were floating on nothing, with bare grass running to a fog edge behind them
   * (Kyle: "just empty green grass"). The lawn reaches past them now. It costs one
   * plane's worth of triangles and it is what makes the west side read as a street
   * of houses rather than a field with houses parked in it. */
  /* ⚠️ THIS PLANE IS THE NEIGHBOURHOOD'S GROUND, not just our lawn, and it kept
   * being the thing that ran out. It was XC-15 wide and stopped at Z_S+17.9 while
   * houses stood at z 27 to 34, so most of the street was floating over a fog edge.
   * It reaches well past every building now. The fence still marks OUR lot; the
   * grass simply carries on behind it the way grass does. */
  var LAWN = { x0: XC - 36, x1: XC + 26, z0: Z_S + 0.9, z1: Z_S + 52 };
  var PHOLE = { x0: XC + 1.55, x1: XC + 7.65, z0: Z_S + 5.9, z1: Z_S + 10.5 };  // the apron footprint
  [[LAWN.x0, LAWN.x1, LAWN.z0, PHOLE.z0], [LAWN.x0, LAWN.x1, PHOLE.z1, LAWN.z1],
   [LAWN.x0, PHOLE.x0, PHOLE.z0, PHOLE.z1], [PHOLE.x1, LAWN.x1, PHOLE.z0, PHOLE.z1]]
    .forEach(function (lp3) {
      var lw = new THREE.Mesh(new THREE.PlaneGeometry(lp3[1] - lp3[0], lp3[3] - lp3[2]), lawnM(lp3[1] - lp3[0], lp3[3] - lp3[2], (lp3[0] + lp3[1]) / 2, (lp3[2] + lp3[3]) / 2));
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

  /* ---- CLOSING THE LOT ---------------------------------------------------------
   * ⚠️⚠️ THE PERIMETER WAS NEVER CLOSED, and the earlier "the side runs reach the
   * house now" fix did not close it either — it only fixed the two BACK corners.
   * Measured by collecting every picket in the yard and grouping them into runs:
   *     west  x -17.5, z 9.0 .. 25.3
   *     east  x   5.5, z 9.0 .. 25.3
   *     back  z  25.0, x -17.5 .. 5.7
   * Three sides. The fourth is supposed to be the HOUSE — but the house only spans
   * x -7.62 .. 4.42 and the garage behind it x -12.20 .. -7.40, so the north edge
   * of the lot had two real holes you could walk straight out of:
   *     x -17.50 .. -12.20   5.3m, between the west fence and the garage
   *     x   4.42 ..   5.50   1.1m, between the house and the east fence
   * Both are fenced now, with a gate in the big one because that is what a side
   * return actually has — it is how the bins get out. */
  /* ⚠️ AND THE EAST SIDE RETURN. East of the hall the house stops at z 3.62 (that is
   * the bedroom back wall) while the side fence only began at z 8.95, so the lot was
   * open along an 8m stretch beside the bedroom — measured by walking the boundary
   * and firing sideways: one continuous miss from x -3.9 to 4.4. The ground there is
   * lawn all the way up, so the honest fix is to carry the east fence NORTH to the
   * house and turn it in, which is what a real side return does. */
  var ER_Z0 = 3.95, ER_X = XC + 11.55;
  for (var er = 0; er * 0.51 < (Z_S + 0.30) - ER_Z0; er++) {
    var eb = box(0.04, 1.65, 0.17, bFenceM);
    eb.position.set(ER_X, GROUND + 0.82, ER_Z0 + 0.10 + er * 0.51); badd(eb);
  }
  [GROUND + 0.35, GROUND + 1.42].forEach(function (ry4) {
    var rl4 = box(0.05, 0.09, (Z_S + 0.30) - ER_Z0, mat(0x5e4a37, 0.95));
    rl4.position.set(ER_X - 0.03, ry4, (ER_Z0 + Z_S + 0.30) / 2); badd(rl4);
  });
  var erPost = box(0.13, 1.85, 0.13, mat(0x51402f, 0.95));
  erPost.position.set(ER_X - 0.02, GROUND + 0.92, ER_Z0 + 0.04); badd(erPost);
  // and the turn back in to the house wall
  for (var et = 0; et * 0.51 < (ER_X - 3.70) - 0.1; et++) {
    var tb = box(0.17, 1.65, 0.04, bFenceM);
    tb.position.set(ER_X - 0.14 - et * 0.51, GROUND + 0.82, ER_Z0); badd(tb);
  }
  [GROUND + 0.35, GROUND + 1.42].forEach(function (ry5) {
    var rl5 = box(ER_X - 3.70, 0.09, 0.05, mat(0x5e4a37, 0.95));
    rl5.position.set((ER_X + 3.70) / 2, ry5, ER_Z0 + 0.03); badd(rl5);
  });

  var NF_Z = Z_S + 0.30;
  [[-17.50, -13.10], [-12.15, -12.10], [4.45, 5.55]].forEach(function (rn) {
    var span = rn[1] - rn[0];
    if (span < 0.06) return;
    for (var nf = 0; nf * 0.51 < span - 0.05; nf++) {
      var nb = box(0.17, 1.65, 0.04, bFenceM);
      nb.position.set(rn[0] + 0.10 + nf * 0.51, GROUND + 0.82, NF_Z); badd(nb);
    }
    [GROUND + 0.35, GROUND + 1.42].forEach(function (ry3) {
      var rl3 = box(span, 0.09, 0.05, mat(0x5e4a37, 0.95));
      rl3.position.set((rn[0] + rn[1]) / 2, ry3, NF_Z + 0.03); badd(rl3);
    });
    [rn[0] + 0.06, rn[1] - 0.06].forEach(function (px3) {
      var po3 = box(0.13, 1.85, 0.13, mat(0x51402f, 0.95));
      po3.position.set(px3, GROUND + 0.92, NF_Z + 0.02); badd(po3);
    });
  });
  // the side gate, standing open the way a side gate always is
  (function () {
    var gt = new THREE.Group();
    gt.position.set(-13.10, GROUND, NF_Z); gt.rotation.y = -0.9; badd(gt);
    for (var gf = 0; gf < 5; gf++) {
      var gb = box(0.15, 1.45, 0.04, bFenceM);
      gb.position.set(0.14 + gf * 0.19, 0.80, 0); gt.add(gb);
    }
    [0.42, 1.16].forEach(function (gy) {
      var gr = box(0.98, 0.08, 0.045, mat(0x5e4a37, 0.95));
      gr.position.set(0.55, gy, 0.02); gt.add(gr);
    });
    var brace = box(1.15, 0.07, 0.04, mat(0x5e4a37, 0.95));
    brace.position.set(0.55, 0.79, 0.03); brace.rotation.z = 0.66; gt.add(brace);
    var latch = box(0.09, 0.05, 0.03, mat(0x8a8f96, 0.4));
    latch.position.set(1.02, 1.00, 0.04); gt.add(latch);
    // ⚠️ children[0] is the innermost board, 15 cm from the hinge — the least likely
    // strip of a nine-mesh gate for a cursor to land on. Every other group out here
    // (the bike, the car, the grill) tags all its children.
    gt.children.forEach(function (m) {
      if (m.isMesh) btag(m, "the side gate", null, "it has never latched properly. everyone just lifts it.");
    });
  })();

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
  /* ⚠⚠ THESE WERE PAINTED NAVY, NOT LIT NAVY. The street was built when the back
   * yard was always night, so every neighbour's siding was hardcoded 0x2a3242 and
   * its roof 0x222a36 — colours that ARE dusk. Then time-of-day shipped: at noon
   * the lawn is bright green, the sky is blue, and the houses over the fence are
   * still black cut-outs (photographed). A painted-in shadow cannot brighten.
   * They wear ordinary daylight siding now and let the yard's own hemisphere and
   * sun do the darkening — which is what already makes the fence and the lawn read
   * correctly at every hour. Four bodies so the street isn't one repeated house. */
  var BHOUSE = [[0x8f99a8, 0x585f6b], [0x9c9184, 0x5e564c],
                [0x849aa0, 0x515f63], [0xa0928f, 0x635857]];
  var bhN = 0;
  /* ⚠️ THESE WERE THE ONLY BUILDINGS IN THE WORLD MADE OF FLAT COLOUR. The whole
   * back block contains ZERO canvas textures, while every house on the front street
   * wears the same lap-siding canvas — and the nearest of these stands closer to you
   * than the textured ones do. They wear it now.
   * ⚠️ IT IS NOT A DROP-IN: material.color MULTIPLIES the map, and sideT's base fill
   * is a mid grey around 0.55, so handing it the palette colour straight would come
   * out roughly half as bright as the flat version and the row would go muddy. Each
   * colour is divided back out by that factor and clamped. */
  var bClad = {};
  function bLighten(hex) {
    var r = Math.min(255, Math.round(((hex >> 16) & 255) / 0.55));
    var g3 = Math.min(255, Math.round(((hex >> 8) & 255) / 0.55));
    var b3 = Math.min(255, Math.round((hex & 255) / 0.55));
    return (r << 16) | (g3 << 8) | b3;
  }
  function bCladM(hex) {
    if (!bClad[hex]) bClad[hex] = new THREE.MeshStandardMaterial(
      { map: sideT, color: bLighten(hex), roughness: 0.95 });
    return bClad[hex];
  }
  var bRoofs = [];   // so the chimneys can stand ON their own roofs instead of near them
  function bHouse(hx, hz, hw, hh, hd, ry2, wins) {
    var hg = new THREE.Group(); hg.position.set(hx, GROUND, hz); hg.rotation.y = ry2; badd(hg);
    var pal = BHOUSE[bhN++ % BHOUSE.length];
    var bod = box(hw, hh, hd, bCladM(pal[0])); bod.position.y = hh / 2; hg.add(bod);
    var rf = new THREE.Mesh(new THREE.ConeGeometry(hw * 0.74, hh * 0.62, 4), mat(pal[1], 0.95));
    rf.rotation.y = Math.PI / 4; rf.position.y = hh + hh * 0.31; hg.add(rf);
    /* a 4-gon cone turned 45 degrees is a square pyramid: half-side = R*cos45, base
     * at local y hh, apex at hh + 0.62hh. Recording that is the whole chimney fix. */
    bRoofs.push({ x: hx, z: hz, ry: ry2, base: hh, rise: hh * 0.62, s: hw * 0.5233,
                  hw: hw, hd: hd });
    var hi = bhN;
    (wins || []).forEach(function (wn, wi) {
      /* ⚠️ ALL TWENTY-FIVE WINDOWS ON THIS BLOCK WERE LIT. Not one house had anybody
       * asleep, which reads as a stage set rather than a street at night. An explicit
       * third element wins; otherwise a deterministic ~55% are on. Deterministic
       * because the yard has to look the same every night — the rule the whole
       * section is built on. */
      var lit = wn.length > 2 ? !!wn[2] : (((hi * 7 + wi * 3) % 9) < 5);
      var win = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.75), lit
        ? new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffd9a0, emissiveIntensity: 1.1, roughness: 0.6 })
        : new THREE.MeshStandardMaterial({ color: 0x161c24, roughness: 0.5 }));
      win.position.set(wn[0], wn[1], -hd / 2 - 0.03); win.rotation.y = Math.PI; hg.add(win);
      if (lit) bWins.push(win.material);
    });
    return hg;
  }
  function bTree(tx, tz, sc) {
    var tg2 = new THREE.Group(); tg2.position.set(tx, GROUND, tz); tg2.scale.setScalar(sc || 1); badd(tg2);
    /* ⚠️ TWENTY-TWO CLONES, ALL FACING THE SAME WAY, AND NOT ONE OF THEM MOVED —
     * while every tree on the front street sways. Three deterministic lines (no rng:
     * the yard must look identical every night) turn 22 copies into 22 silhouettes
     * and put them in the wind with everything else. */
    tg2.rotation.y = (tx * 0.37 + tz * 0.19) % 6.283;
    var tr2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 3.6, 7), mat(0x3d2f22, 0.95));
    tr2.position.y = 1.8; tr2.rotation.z = (((tx + tz) % 7) - 3) * 0.012; tg2.add(tr2);
    swayers.push({ o: tg2, ph: tx * 0.7 + tz * 0.3, amp: 0.009 });
    [[0, 4.1, 0, 1.35], [-0.9, 3.8, 0.4, 1.0], [0.9, 3.9, -0.3, 1.05]].forEach(function (bl2) {
      var lf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(bl2[3], 1), mat(0x2f4a2a, 0.95));
      lf2.position.set(bl2[0], bl2[1], bl2[2]); lf2.scale.y = 0.82; tg2.add(lf2);
    });
  }
  bHouse(XC + 8.2, Z_S + 21.5, 9.5, 3.6, 6.0, 0, [[-1.8, 2.55, true], [1.4, 1.5, false]]);   // next door: upstairs still up, downstairs gone to bed
  bHouse(XC - 4.1, Z_S + 21.9, 7.8, 3.2, 5.6, 0.06, [[0.9, 1.4]]);              // the one behind the tree line
  bHouse(XC - 14.2, Z_S + 19.4, 8.6, 3.4, 5.8, -0.09, [[-1.2, 1.5, false], [1.6, 2.4, true]]); // the corner lot: whole house dark but the landing
  bHouse(XC + 17.6, Z_S + 8.0, 8.8, 3.4, 6.0, Math.PI / 2, [[-1.0, 1.5]]);      // east over the side fence
  /* ---- THE WEST STREET ---------------------------------------------------------
   * ⚠️⚠️ THE OLD ONES OVERLAPPED EACH OTHER. Three houses 8.2m long on a 7.0m
   * pitch: measured spans z 10.3..18.5, 17.2..25.6 and 25.2..33.2, so each one had
   * its neighbour's back wall inside it. That is what "way too close together"
   * looks like from the yard — one continuous smear of roof rather than houses.
   * A 13.6m pitch on an 8.2m house leaves a 5.4m gap, which is a side yard.
   * The row also runs the whole width the camera can see. Facing west from the
   * resting eye at Kyle's aspect the frame covers roughly z -10 to 38 out at the
   * house line, so anything inside that has to be filled or it reads as a field. */
  var WEST_X = XC - 18.0, WEST_X2 = XC - 27.4;
  [[Z_S - 7.2, 8.2, 3.2, [[-1.0, 1.5], [1.5, 2.4]]],
   [Z_S + 6.4, 8.6, 3.5, [[0.9, 1.4]]],
   [Z_S + 20.0, 8.0, 3.1, [[-1.2, 1.5], [1.4, 2.5]]],
   [Z_S + 33.6, 8.4, 3.4, [[1.0, 1.5]]],
   [Z_S + 47.2, 8.2, 3.3, [[-0.9, 1.4]]]].forEach(function (hs, hi) {
    bHouse(WEST_X + (hi % 2 ? 0.35 : -0.3), hs[0], hs[1], hs[2], 5.8,
           -Math.PI / 2 + (hi % 2 ? 0.04 : -0.03), hs[3]);
  });
  // the row behind it, offset half a pitch so the gaps are never lined up
  [[Z_S - 0.4, 8.4, 3.3, [[-1.0, 1.5]]],
   [Z_S + 13.2, 8.0, 3.6, [[0.9, 1.4], [-1.3, 2.4]]],
   [Z_S + 26.8, 8.6, 3.2, [[-1.1, 1.5]]],
   [Z_S + 40.4, 8.2, 3.4, [[1.0, 1.4]]]].forEach(function (hs, hi) {
    bHouse(WEST_X2 + (hi % 2 ? -0.4 : 0.3), hs[0], hs[1], hs[2], 5.6,
           -Math.PI / 2 + (hi % 2 ? -0.05 : 0.03), hs[3]);
  });
  /* ---- THE NEIGHBOURHOOD ---------------------------------------------------------
   * ⚠️ The front yard has a road, kerbs, a path, parked cars, hedges, nine layers of
   * overlap and fog to close it off. The back had houses on grass. Kyle: "the back
   * needs to look as good as the front yard", and the difference was never the
   * houses — it was that nobody else out there had a LOT. A house on a lawn reads as
   * a model; a house with a fence, a shed, a line of washing and a bin reads as
   * somewhere people live.
   * Everything below is boxes and it is all deterministic — no rng out here, because
   * the yard has to look the same every night. */
  var lotFenceM = mat(0x6a5540, 0.95), lotPostM = mat(0x51402f, 0.95);
  var shedM = mat(0x7e8a7a, 0.92), shedRoofM = mat(0x3f4a44, 0.9);
  var laneM = ground(asphT, 18, 3, 0xb0b4bc, 0.98, 0.9);
  var kerbM = mat(0xa8a49a, 0.96), benchM2 = mat(0x6d5636, 0.85);

  /* the back lane — every street of houses like this has one running behind it, and
   * it is what stops the far row from being the edge of the world */
  (function () {
    var LANE_X = XC - 33.0;
    var lane = box(3.6, 0.06, 62, laneM);
    lane.position.set(LANE_X, GROUND - 0.02, Z_S + 22); badd(lane);
    [-1.95, 1.95].forEach(function (kx) {
      var kb = box(0.22, 0.11, 62, kerbM);
      kb.position.set(LANE_X + kx, GROUND + 0.03, Z_S + 22); badd(kb);
    });
    // lamps down it, and the pool of light each one throws
    [Z_S - 4, Z_S + 14, Z_S + 32, Z_S + 50].forEach(function (lz) {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 8), mat(0x4a4f57, 0.5));
      pole.position.set(LANE_X + 2.3, GROUND + 2.3, lz); badd(pole);
      var arm = box(0.7, 0.07, 0.07, mat(0x4a4f57, 0.5));
      arm.position.set(LANE_X + 1.98, GROUND + 4.55, lz); badd(arm);
      var head = box(0.34, 0.12, 0.20, new THREE.MeshStandardMaterial({
        color: 0xf0e2bc, emissive: 0xffd9a0, emissiveIntensity: 0.9, roughness: 0.6 }));
      head.position.set(LANE_X + 1.66, GROUND + 4.48, lz); badd(head);
      bWins.push(head.material);   // dims and warms with the hour like every other light out here
    });
  })();

  /* the lot lines: a fence between every pair of neighbours, running back from the
   * house to the lane. This is the single biggest thing — it turns one field with
   * buildings on it into a row of gardens. */
  [[XC - 18.0, Z_S - 14.0], [XC - 18.0, Z_S - 0.4], [XC - 18.0, Z_S + 13.2],
   [XC - 18.0, Z_S + 26.8], [XC - 18.0, Z_S + 40.4], [XC - 18.0, Z_S + 54.0]].forEach(function (lt) {
    for (var lf = 0; lf < 18; lf++) {
      var pk = box(0.16, 1.42, 0.04, lotFenceM);
      pk.position.set(lt[0] - 0.6 - lf * 0.48, GROUND + 0.71, lt[1]); badd(pk);
    }
    [GROUND + 0.30, GROUND + 1.22].forEach(function (ry) {
      var rl = box(8.7, 0.07, 0.045, mat(0x5e4a37, 0.95));
      rl.position.set(lt[0] - 4.9, ry, lt[1] + 0.03); badd(rl);
    });
    var po = box(0.11, 1.62, 0.11, lotPostM);
    po.position.set(lt[0] - 0.55, GROUND + 0.81, lt[1]); badd(po);
  });

  /* what people keep in a back garden. One shed, one line, one bin per lot, walked
   * along the row so no two are identical and none of it is random. */
  [[Z_S - 7.2, 0], [Z_S + 6.4, 1], [Z_S + 20.0, 2], [Z_S + 33.6, 0], [Z_S + 47.2, 1]].forEach(function (lot) {
    var lz = lot[0], k = lot[1], bx = XC - 22.6;
    // the shed
    var sg2 = new THREE.Group();
    sg2.position.set(bx + (k === 1 ? 0.9 : -0.7), GROUND, lz + (k === 2 ? 3.2 : -3.0));
    sg2.rotation.y = -Math.PI / 2 + (k - 1) * 0.12; badd(sg2);
    var sb = box(1.9, 1.75, 1.45, shedM); sb.position.y = 0.88; sg2.add(sb);
    var sr = box(2.1, 0.10, 1.65, shedRoofM); sr.position.y = 1.82; sr.rotation.z = 0.07; sg2.add(sr);
    var sd = box(0.05, 1.35, 0.62, mat(0x5e6a5e, 0.85)); sd.position.set(0.96, 0.68, -0.3); sg2.add(sd);
    // the washing line
    var lp1 = box(0.07, 1.55, 0.07, lotPostM), lp2 = box(0.07, 1.55, 0.07, lotPostM);
    lp1.position.set(bx + 2.2, GROUND + 0.78, lz - 2.2); badd(lp1);
    lp2.position.set(bx + 2.2, GROUND + 0.78, lz + 2.6); badd(lp2);
    var lin = box(0.02, 0.02, 4.8, mat(0xd8d2c2, 0.5));
    lin.position.set(bx + 2.2, GROUND + 1.5, lz + 0.2); badd(lin);
    if (k !== 2) [[-1.1, 0.34, 0xe8e4d8], [0.2, 0.30, 0x9db8d6], [1.5, 0.36, 0xe0c9a8]].forEach(function (wg) {
      var sh2 = box(0.02, wg[1], 0.28, mat(wg[2], 0.9));
      sh2.position.set(bx + 2.2, GROUND + 1.5 - wg[1] / 2, lz + 0.2 + wg[0]); badd(sh2);
    });
    // a bin by the lane, and a patio slab by the back door
    var bin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.23, 0.72, 10), mat(k === 1 ? 0x3f5a3a : 0x2f4a6a, 0.7));
    bin.position.set(XC - 30.6, GROUND + 0.36, lz + (k === 0 ? 1.4 : -1.6)); badd(bin);
    var binLid = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 10), mat(0x2b2e33, 0.6));
    binLid.position.set(XC - 30.6, GROUND + 0.74, lz + (k === 0 ? 1.4 : -1.6)); badd(binLid);
    var slab = box(2.4, 0.05, 1.6, mat(0x9c988e, 0.95));
    slab.position.set(XC - 20.6, GROUND + 0.025, lz + 0.4); badd(slab);
  });

  /* ---- WHAT YOU CAN ACTUALLY SEE FROM THE YARD ----------------------------------
   * ⚠️⚠️ EVERYTHING ABOVE THIS IS BELOW THE FENCE LINE. Our own fence is 1.65 tall
   * and the resting eye is at y 1.28, so the sightline grazing its top rises to only
   * about y 1.23 by the time it reaches the neighbours. Probing each new prop from
   * the eye: shed body BLOCKED, shed roof BLOCKED, washing line BLOCKED, bench
   * BLOCKED, the lane BLOCKED, lot fence BLOCKED — all of them by our own fence at
   * 12.9m. They are worth keeping (they show through the picket gaps, and from the
   * porch and the side return) but they are NOT what makes the back read.
   * The front yard works because you look ALONG the ground at it. The back is looked
   * at OVER a fence, so the layer that does the work is everything above 1.25: roofs,
   * chimneys, poles, wires and canopies. That is what this section is. */

  /* chimneys and aerials — the cheapest roofline variety there is */
  [[XC - 18.3, Z_S - 7.2], [XC - 17.6, Z_S + 6.4], [XC - 18.4, Z_S + 20.0],
   [XC - 17.7, Z_S + 33.6], [XC - 18.2, Z_S + 47.2],
   [XC - 27.7, Z_S - 0.4], [XC - 27.0, Z_S + 13.2], [XC - 27.8, Z_S + 26.8]].forEach(function (ch, ci) {
    /* ⚠️ THE HEIGHT CAME FROM `ci % 3` AND NOT FROM THE ROOF IT STANDS ON, so six of
     * the eight stacks sat BELOW their own roof surface — chimneys buried in the
     * shingles — and two of the three aerials were half inside them. A pyramid's
     * surface is base + rise * (1 - max(|lx|,|lz|)/halfside), and bHouse now records
     * exactly those three numbers, so each stack can be put where the slope actually
     * is. It is placed 0.25 INTO the roof so the flashing has something to be. */
    var cz2 = ch[1] + (ci % 2 ? 1.6 : -1.4);
    var surf = 3.9;                       // the old constant, if no roof is under it
    for (var ri2 = 0; ri2 < bRoofs.length; ri2++) {
      var rr = bRoofs[ri2], dx2 = ch[0] - rr.x, dz2 = cz2 - rr.z;
      var ca = Math.cos(-rr.ry), sa = Math.sin(-rr.ry);
      var lx2 = dx2 * ca + dz2 * sa, lz2 = -dx2 * sa + dz2 * ca;
      if (Math.abs(lx2) > rr.hw / 2 + 0.1 || Math.abs(lz2) > rr.hd / 2 + 0.1) continue;
      var k4 = Math.max(Math.abs(lx2), Math.abs(lz2)) / rr.s;
      surf = rr.base + rr.rise * Math.max(0, 1 - k4);
      break;
    }
    var stH = 1.15 + (ci % 3) * 0.2;
    var stY = GROUND + surf + stH / 2 - 0.25;
    var st2 = box(0.46, stH, 0.46, mat(0x8a5a4a, 0.95));
    st2.position.set(ch[0], stY, cz2); badd(st2);
    var cap2 = box(0.56, 0.08, 0.56, mat(0x6a4a3a, 0.95));
    cap2.position.set(ch[0], stY + stH / 2 + 0.04, cz2); badd(cap2);
    if (ci % 3 === 1) {                       // and somebody still has the aerial up
      // and the aerial rides the same surface, one step down the slope from the stack
      var mY = GROUND + surf + 0.45;
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), mat(0x6a6f76, 0.5));
      mast.position.set(ch[0] + 1.1, mY, cz2 - 0.8); badd(mast);
      for (var ab = 0; ab < 4; ab++) {
        var arm2 = box(0.9, 0.03, 0.03, mat(0x6a6f76, 0.5));
        arm2.position.set(ch[0] + 1.1, mY + 0.28 + ab * 0.22, cz2 - 0.8); badd(arm2);
      }
    }
  });

  /* one neighbour with an upstairs, so the roofline is not a flat repeated shape */
  bHouse(XC - 18.1, Z_S + 13.2, 8.4, 6.1, 6.0, -Math.PI / 2 + 0.02,
         [[-1.1, 1.5], [1.4, 2.4], [-1.0, 4.6], [1.5, 4.7]]);

  /* the poles and the wires. The front yard has them and it is half of why the front
   * reads as a STREET — a line of verticals with something strung between them, all
   * of it well above any fence. */
  (function () {
    var poleM = mat(0x6a5a44, 0.95), wireM = mat(0x2b2e33, 0.6);
    var PX = XC - 20.9, tops = [];
    [Z_S - 10, Z_S + 3.6, Z_S + 17.2, Z_S + 30.8, Z_S + 44.4].forEach(function (pz, pi) {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 7.2, 8), poleM);
      pole.position.set(PX, GROUND + 3.6, pz); badd(pole);
      /* ⚠️ the crossarm ran 1.9 m along Z — the same direction as the wires, so it
       * lay ALONG the line instead of across it, and the three insulators were spaced
       * out along the run rather than across the arm. A crossarm is perpendicular by
       * definition; that is the whole point of it. */
      var cross = box(1.9, 0.12, 0.14, poleM);
      cross.position.set(PX, GROUND + 6.6, pz); badd(cross);
      [-0.8, 0, 0.8].forEach(function (ix) {
        var ins = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 6), mat(0x7fa08f, 0.5));
        ins.position.set(PX + ix, GROUND + 6.80, pz); badd(ins);
      });
      tops.push(pz);
    });
    // the spans, with a bit of sag so they are not laser lines
    for (var sp = 0; sp < tops.length - 1; sp++) {
      var z0 = tops[sp], z1 = tops[sp + 1], len = z1 - z0;
      [-0.8, 0, 0.8].forEach(function (ix) {
        for (var seg = 0; seg < 4; seg++) {
          var f0 = seg / 4, f1 = (seg + 1) / 4;
          var y0 = GROUND + 6.74 - 0.38 * Math.sin(Math.PI * f0), y1 = GROUND + 6.74 - 0.38 * Math.sin(Math.PI * f1);
          /* ⚠️ `+ ix * 0`. The lateral offset was multiplied by ZERO, then the next
           * two lines reassigned z and forced x back to PX — so all three wires of
           * every span were stacked in the same place, 48 meshes drawing 16 wires.
           * `w2` was cloned, positioned, and never added to the scene at all. */
          var w = box(0.035, 0.035, len / 4 + 0.02, wireM);
          w.position.set(PX + ix, (y0 + y1) / 2, z0 + len * (f0 + f1) / 2);
          w.rotation.x = Math.atan2(y1 - y0, len / 4);
          badd(w);
        }
      });
    }
  })();

  /* taller trees at three different distances — depth comes from overlap, which is
   * the same lesson the front yard's nine layers taught */
  [[XC - 15.4, Z_S + 2.0, 1.35], [XC - 15.8, Z_S + 24.0, 1.5], [XC - 16.1, Z_S + 44.0, 1.25],
   [XC - 25.2, Z_S - 4.0, 1.45], [XC - 25.6, Z_S + 18.0, 1.3], [XC - 25.1, Z_S + 38.0, 1.55],
   [XC - 34.6, Z_S + 8.0, 1.4], [XC - 35.0, Z_S + 30.0, 1.5]].forEach(function (t2) {
    bTree(t2[0], t2[1], t2[2]);
  });

  /* a bench on the verge, because the front has a porch chair and the back had
   * nowhere for anyone to be */
  [[XC - 30.2, Z_S + 3.0, 0.1], [XC - 30.4, Z_S + 30.5, -0.06]].forEach(function (bn) {
    var bg = new THREE.Group(); bg.position.set(bn[0], GROUND, bn[1]); bg.rotation.y = Math.PI / 2 + bn[2]; badd(bg);
    var seat = box(1.55, 0.07, 0.44, benchM2); seat.position.y = 0.45; bg.add(seat);
    var bk = box(1.55, 0.42, 0.06, benchM2); bk.position.set(0, 0.70, -0.20); bk.rotation.x = -0.14; bg.add(bk);
    [-0.62, 0.62].forEach(function (lx) {
      var lg3 = box(0.07, 0.45, 0.40, mat(0x3f4a44, 0.6)); lg3.position.set(lx, 0.22, 0); bg.add(lg3);
    });
  });

  // trees down the line, between the lots rather than on top of them
  [Z_S - 0.6, Z_S + 13.0, Z_S + 26.6, Z_S + 40.2].forEach(function (tz, ti) {
    bTree(XC - 13.4 + (ti % 2 ? 0.6 : -0.5), tz, 0.9 + (ti % 3) * 0.12);
  });
  [Z_S + 6.2, Z_S + 19.8, Z_S + 33.4].forEach(function (tz, ti) {
    bTree(XC - 22.6 + (ti % 2 ? -0.5 : 0.4), tz, 0.95 + (ti % 2) * 0.1);
  });
  bTree(XC - 7.4, Z_S + 18.9, 1.15); bTree(XC + 14.4, Z_S + 19.7, 0.9); bTree(XC + 3.1, Z_S + 19.9, 0.8);
  /* ⚠⚠ THE LEFT SIDE WAS EMPTY. Turn and face the back door and everything west of
   * the house fell away to bare lawn and then nothing (Kyle: "the left side has no
   * neighborhood") — there was ONE house over that fence and it sat too far back to
   * read. Two more along the west line, closer and staggered, plus trees to break
   * the roofline, so the yard is enclosed on the side you actually look at. */

  /* ⚠️ THESE LIVE DOWN HERE WITH THE OTHER bHouse CALLS AND THEY HAVE TO. They were
   * first written up beside the fence work, ~45 lines ABOVE `var BHOUSE` — and bHouse
   * is a hoisted function DECLARATION while its colour palette is a plain `var`, so the
   * call resolved fine and then died inside on BHOUSE.length of undefined. The whole
   * room failed to boot. Hoisting moves the function, never the data it reads. */
  bHouse(XC + 17.9, Z_S + 1.4, 8.6, 3.5, 6.0, Math.PI / 2, [[-1.3, 1.5], [1.4, 2.5]]);
  bHouse(XC + 18.2, Z_S + 15.6, 8.2, 3.2, 5.8, Math.PI / 2 - 0.05, [[0.8, 1.4]]);
  /* and the side you now turn to see: another row further out so there is depth
   * behind the near neighbours, plus trees to break the line. */
  bTree(XC + 13.2, Z_S + 4.2, 1.0); bTree(XC + 13.6, Z_S + 15.9, 1.1);
  bTree(XC + 12.9, Z_S + 10.4, 0.85);
  bTree(XC + 13.4, Z_S + 12.0, 0.9);
  // side fences: the lot actually closes now. Boards run along z, mirrored pair.
  /* ⚠⚠ THE SIDE RUNS NOW REACH THE HOUSE. They began at Z_S+1.1 and stopped short
   * of the back line, leaving a metre of open air at the house end and a hole at
   * each back corner — a fence with two gaps you could walk through (Kyle: "the
   * fence doesn't fully wrap around"). They run from the back wall of the house to
   * past the back fence now, so the lot is closed and both corners overlap. */
  var SIDE_Z0 = Z_S + 0.15, SIDE_N = 33;
  [[XC - 11.55, 1], [XC + 11.55, -1]].forEach(function (sf) {
    for (var sb2 = 0; sb2 < SIDE_N; sb2++) {
      var bd2 = box(0.04, 1.65, 0.17, bFenceM);
      bd2.position.set(sf[0], GROUND + 0.82, SIDE_Z0 + sb2 * 0.51); badd(bd2);
    }
    [SIDE_Z0 + 0.4, SIDE_Z0 + 5.2, SIDE_Z0 + 10.4, SIDE_Z0 + 15.6].forEach(function (pz2) {
      var po2 = box(0.13, 1.85, 0.13, mat(0x51402f, 0.95));
      po2.position.set(sf[0] + sf[1] * 0.04, GROUND + 0.92, pz2); badd(po2);
    });
    [GROUND + 0.35, GROUND + 1.42].forEach(function (ry3) {
      var rl2 = box(0.05, 0.09, SIDE_N * 0.51, mat(0x5e4a37, 0.95));
      rl2.position.set(sf[0] + sf[1] * 0.045, ry3, SIDE_Z0 + SIDE_N * 0.255); badd(rl2);
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
      var gp2 = new THREE.Mesh(new THREE.PlaneGeometry(gf[1] - gf[0], gf[3] - gf[2]), lawnM(gf[1] - gf[0], gf[3] - gf[2], (gf[0] + gf[1]) / 2, (gf[2] + gf[3]) / 2));
      gp2.rotation.x = -Math.PI / 2;
      gp2.position.set((gf[0] + gf[1]) / 2, GROUND, (gf[2] + gf[3]) / 2); badd(gp2);
    });

  /* ---- THE SECOND STOREY ---------------------------------------------------------
   * ⚠⚠ THE HOUSE READ AS A BUNGALOW WITH A STAIRCASE IN IT. From the back yard it
   * was a single flat-lidded box, which made the hall's UP staircase nonsense —
   * Kyle: "you can tell the upstairs door doesn't make sense, it would open to the
   * front lawn". There IS an upstairs: the bedroom is up there and its window
   * portal already looks out from GROUND+5.2. The volume was simply never built.
   * A two-storey core over the hall and bedroom, with the kitchen and garage
   * staying single-storey, is the ordinary shape of this house — and it is what
   * makes the staircase, the porch roof and the bedroom window agree with each
   * other. The window opening is cut where the portal camera actually stands. */
  // the upper floor stops at the bedroom back wall (z 3.70), it does NOT run to
  // the back of the hall. Carried to Z_S it overhung five metres of open lawn on
  // the east side, where the ground floor is only the bedroom — a second storey
  // floating on nothing. The hall rear stays single-storey, which is what a rear
  // extension looks like anyway.
  /* ⚠️ and the SHELL follows the floor: the storey now runs back over the hall to
   * z 7.60, which is also what the house looks like from the yard once there is a
   * staircase inside it. */
  /* ⚠️ x0 REACHES -17.20 TOO. The shell was drawn when the house stopped at the old
   * bedroom box; the ground floor has since grown a whole west wing (the living room
   * runs to x -17.15), and the upstairs floor with it. Left at -7.62 the shell WALL
   * stood inside the upstairs corridor — from the landing you looked straight at the
   * outside of your own house, 2m away, lapped siding and all. */
  var UP = { x0: -17.20, x1: 4.42, z0: Z_N - 0.10, z1: 7.60, y0: 3.02, y1: 5.95 };
  var upH = UP.y1 - UP.y0, upY = (UP.y0 + UP.y1) / 2;
  var BW = { x0: -5.05, x1: -3.75, y0: 4.28, y1: 5.24 };
  [[UP.x0, BW.x0, UP.y0, UP.y1], [BW.x1, UP.x1, UP.y0, UP.y1],
   [BW.x0, BW.x1, UP.y0, BW.y0], [BW.x0, BW.x1, BW.y1, UP.y1]].forEach(function (seg) {
    var w2 = box(seg[1] - seg[0], seg[3] - seg[2], 0.16, sidingM);
    w2.position.set((seg[0] + seg[1]) / 2, (seg[2] + seg[3]) / 2, UP.z0 + 0.08); badd(w2);
  });
  var upS = box(UP.x1 - UP.x0, upH, 0.16, sidingM);
  upS.position.set((UP.x0 + UP.x1) / 2, upY, UP.z1 - 0.08); badd(upS);
  [UP.x0 + 0.08, UP.x1 - 0.08].forEach(function (ex) {
    var w3 = box(0.16, upH, UP.z1 - UP.z0, sidingM);
    w3.position.set(ex, upY, (UP.z0 + UP.z1) / 2); badd(w3);
  });
  var bwGlass = new THREE.Mesh(new THREE.PlaneGeometry(BW.x1 - BW.x0 - 0.10, BW.y1 - BW.y0 - 0.10),
    /* ⚠️ warm, not 0x1a2436. The emissive was always amber but the DIFFUSE was night-
     * blue, so beside the neighbours' 0xffdca0 panes this one read as the only dark
     * window on the street — in the one house that is supposed to be awake. */
    /* ⚠️ this one is rotation.y = Math.PI - it faces the BACK yard, not the street.
     * Warming its diffuse to match the neighbours' panes does nothing to the front
     * elevation; the dark rectangle you see from the pavement is the OPENING it sits
     * behind, and that is filled by litWindow(-4.40, ...) instead. Left night-blue. */
    new THREE.MeshStandardMaterial({ color: 0x1a2436, emissive: 0xffd9a0, emissiveIntensity: 1.1, roughness: 0.25 }));
  bwGlass.position.set((BW.x0 + BW.x1) / 2, (BW.y0 + BW.y1) / 2, UP.z0 + 0.17);
  bwGlass.rotation.y = Math.PI; badd(bwGlass);
  /* ⚠️ EVERY WINDOW ON BOTH STREETS DIMS AND WARMS WITH THE HOUR through bWins —
   * except this one, which is YOURS, seen from your own back yard. It sat at a flat
   * 0.55 through every hour of the night. Registering it is one line; the base goes
   * to 1.1 so the shared `1.1 * s.lamp` term lands where the author intended rather
   * than doubling it. */
  bWins.push(bwGlass.material);
  var bwFrame = box(BW.x1 - BW.x0 + 0.10, 0.07, 0.06, mat(0xe4e0d2, 0.8));
  bwFrame.position.set((BW.x0 + BW.x1) / 2, BW.y0 - 0.02, UP.z0 + 0.19); badd(bwFrame);
  var roofM2 = mat(0x3a2f26, 0.92);
  /* ⚠⚠ A CONE IS A SQUARE ROOF. This was ConeGeometry(width*0.78) on a footprint
   * that is 12.0 wide and 7.3 deep, so the radius sized for the WIDTH stuck out
   * three metres past the front and back walls — a flat dark plate hanging over
   * the yard (photographed). The pitch was wrong too: 1.5 over a 9.4 radius is 9
   * degrees, against roughly 31 on every neighbour, so it read as a modern flat
   * lid on a 90s house.
   * Fix both by making the cone unit-sized and scaling it to the footprint. The
   * 45-degree turn is baked into the GEOMETRY, not the mesh — a rotated mesh
   * applies scale first and then spins the result, which would shear the roof off
   * its walls. With the turn in the geometry the four base corners lie on the
   * diagonals, so the eave EDGES run parallel to the walls (that is what makes it
   * a hip roof and not a diamond), and each axis scales independently.
   * Corner distance is half-extent x sqrt2, so +0.35 of overhang costs +0.49 here. */
  var upHW = (UP.x1 - UP.x0) / 2, upHD = (UP.z1 - UP.z0) / 2, upCX = (UP.x0 + UP.x1) / 2, upCZ = (UP.z0 + UP.z1) / 2;
  var eaves = box(upHW * 2 + 0.7, 0.14, upHD * 2 + 0.7, roofM2);
  eaves.position.set(upCX, UP.y1 + 0.07, upCZ); badd(eaves);
  var hipG = new THREE.ConeGeometry(1, 1, 4); hipG.rotateY(Math.PI / 4);
  var hip = new THREE.Mesh(hipG, roofM2);
  hip.scale.set((upHW + 0.35) * 1.41421, 2.4, (upHD + 0.35) * 1.41421);
  hip.position.set(upCX, UP.y1 + 1.34, upCZ); badd(hip);
  /* the back of the upstairs was one blank sheet of siding — the giveaway that a
   * storey is scenery rather than rooms. Two lit windows, registered in bWins so
   * they dim and warm with the hour like every other window on the street. */
  [UP.x0 + 3.1, UP.x0 + 8.6].forEach(function (wx2) {
    var uw = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffd9a0, emissiveIntensity: 1.1, roughness: 0.6 }));
    // ⚠️ UP.z1 is the wall SURFACE and upS is centred at UP.z1-0.08 with 0.16 of
    // thickness, so it occupies z [UP.z1-0.16, UP.z1]. At UP.z1-0.07 these panes sat
    // INSIDE the slab and rendered as nothing (photographed as a blank back wall).
    uw.position.set(wx2, 4.62, UP.z1 + 0.02); badd(uw);
    bWins.push(uw.material);
    var uf = box(1.18, 0.06, 0.05, mat(0xe4e0d2, 0.8));
    uf.position.set(wx2, 4.16, UP.z1 + 0.04); badd(uf);
  });
  var chim = box(0.55, 1.15, 0.55, mat(0x8a5a4a, 0.95));
  chim.position.set(UP.x0 + 1.9, UP.y1 + 0.6, UP.z1 - 1.6); badd(chim);
  var chimCap = box(0.66, 0.09, 0.66, mat(0x6a4a3a, 0.95));
  chimCap.position.set(UP.x0 + 1.9, UP.y1 + 1.2, UP.z1 - 1.6); badd(chimCap);

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
  /* ---- CLEAN THE ZOO: the toy zoo laid out on the lawn ---------------------------
   * Somebody carried the whole box outside and built a zoo on the grass: three
   * pens fenced with lolly sticks, a hand-lettered sign, and the animals sorted
   * into them — which is the game, in miniature, before you have played it.
   * West of the pool on open lawn, clear of the slip 'n slide and the grill. */
  var zooSave = (function () {
    try { var M = JSON.parse(localStorage.getItem("ctz-meta-v1") || "null");
      return (M && M.lifetime) || 0; } catch (e) { return 0; }
  })();
  var zooG = new THREE.Group(); zooG.position.set(XC - 2.35, GROUND, Z_S + 6.05);
  zooG.rotation.y = 0.28; badd(zooG);
  var zooParts = [];
  function zpush(m) { zooParts.push(m); return m; }
  // the pens: little stick fences, three of them in a row — and each pen carries a
  // habitat floor in the game's own hex (clean-the-zoo data.js:27-31): savanna,
  // arctic, farm. The animals stand in the right pen now; the hippo does not,
  // because escaping is the entire game.
  var stickM = mat(0xd8bc86, 0.9);
  [[-0.62, 0, 0.52, 0.46, 0x9a7c33], [0, 0, 0.46, 0.46, 0x9fb8cc], [0.58, 0, 0.50, 0.46, 0x7a6238]].forEach(function (pf) {
    var slab = box(pf[2] - 0.04, 0.008, pf[3] - 0.04, mat(pf[4], 0.95));
    slab.position.set(pf[0], 0.004, pf[1]); zooG.add(zpush(slab));
  });
  [[0.50, 0.10], [0.62, -0.10], [0.70, 0.06]].forEach(function (hy) {   // hay in the farm pen
    var hay5 = box(0.024, 0.014, 0.018, mat(0xe8cf8a, 0.95));
    hay5.position.set(hy[0], 0.015, hy[1]); hay5.rotation.y = hy[0] * 9; zooG.add(zpush(hay5));
  });
  [[-0.62, 0, 0.52, 0.46], [0, 0, 0.46, 0.46], [0.58, 0, 0.50, 0.46]].forEach(function (pen) {
    var px5 = pen[0], pz5 = pen[1], pw = pen[2], pd = pen[3];
    for (var sdi = 0; sdi < 4; sdi++) {
      var along = sdi < 2 ? pw : pd, horiz = sdi < 2;
      var n2 = Math.max(2, Math.round(along / 0.075));
      // ⚠️ every corner was built twice — once by the run along it and once by the run
      // across it — so 12 of the 88 sticks were exact duplicates, z-fighting with
      // themselves. The horizontal runs own the corners; the vertical runs start one in.
      for (var k2 = horiz ? 0 : 1; k2 <= (horiz ? n2 : n2 - 1); k2++) {
        var t2 = -0.5 + k2 / n2;
        var sx = horiz ? px5 + t2 * pw : px5 + (sdi === 2 ? -pw / 2 : pw / 2);
        var sz = horiz ? pz5 + (sdi === 0 ? -pd / 2 : pd / 2) : pz5 + t2 * pd;
        var stick = box(0.008, 0.075, 0.008, stickM);
        stick.position.set(sx, 0.037, sz); stick.rotation.y = (k2 % 3) * 0.12;
        zooG.add(zpush(stick));
      }
    }
  });
  // the animals. Each is a body, a head and legs — at 8cm tall the silhouette is
  // the whole read, so the giraffe gets a neck and the elephant gets a trunk.
  function toyAnimal(x, z, ry5, body, accent, kind) {
    var a = new THREE.Group(); a.position.set(x, 0, z); a.rotation.y = ry5; zooG.add(a);
    var bodyM2 = mat(body, 0.8), accM = mat(accent, 0.8);
    var tall = kind === "giraffe" ? 0.055 : 0.040;
    var torso = box(0.075, 0.042, 0.034, bodyM2); torso.position.y = tall; a.add(torso);
    [[-0.028, -0.012], [0.028, -0.012], [-0.028, 0.012], [0.028, 0.012]].forEach(function (lp5) {
      var leg = box(0.010, tall, 0.010, bodyM2); leg.position.set(lp5[0], tall / 2, lp5[1]); a.add(leg);
    });
    if (kind === "giraffe") {
      var neck = box(0.013, 0.062, 0.013, bodyM2);
      neck.position.set(0.030, tall + 0.048, 0); neck.rotation.z = -0.2; a.add(neck);
      var gh = box(0.024, 0.016, 0.018, bodyM2); gh.position.set(0.042, tall + 0.084, 0); a.add(gh);
      for (var sp5 = 0; sp5 < 4; sp5++) {
        var spot = box(0.016, 0.011, 0.036, accM);
        spot.position.set(-0.024 + sp5 * 0.018, tall + 0.012, 0); a.add(spot);
      }
    } else {
      var head = box(0.030, 0.028, 0.028, bodyM2); head.position.set(0.046, tall + 0.014, 0); a.add(head);
      if (kind === "elephant") {
        var trunk = box(0.010, 0.034, 0.010, bodyM2);
        trunk.position.set(0.062, tall - 0.004, 0); trunk.rotation.z = 0.35; a.add(trunk);
        [-0.014, 0.014].forEach(function (ez) {
          var ear = box(0.006, 0.026, 0.024, bodyM2); ear.position.set(0.040, tall + 0.018, ez); a.add(ear);
        });
      } else if (kind === "lion") {
        var mane = box(0.036, 0.038, 0.038, accM); mane.position.set(0.042, tall + 0.014, 0); a.add(mane);
      } else if (kind === "zebra") {
        for (var st5 = 0; st5 < 4; st5++) {
          var band = box(0.007, 0.043, 0.035, accM);
          band.position.set(-0.026 + st5 * 0.018, tall, 0); a.add(band);
        }
      } else if (kind === "penguin") {
        var bib = box(0.012, 0.030, 0.026, accM); bib.position.set(-0.034, tall, 0); a.add(bib);
      }
      var tail = box(0.018, 0.007, 0.007, bodyM2); tail.position.set(-0.044, tall + 0.014, 0); a.add(tail);
    }
    a.children.forEach(zpush);
    return a;
  }
  // every hex below is the game's own 3D palette (animals3d.js:601-603, 602) — the
  // savanna four share the savanna pen, the penguin gets the arctic slab, and the
  // hippo has ESCAPED (data.js:105 says savanna; the game says put it back).
  toyAnimal(-0.76, -0.11, 0.5, 0x9aa0a6, 0x7d8288, "elephant");
  toyAnimal(-0.52, 0.10, -0.9, 0xf0c05a, 0xb0782e, "giraffe");
  toyAnimal(-0.70, 0.09, 2.4, 0xe0a03a, 0x9a5f2a, "lion");
  toyAnimal(-0.48, -0.11, -0.4, 0xf0f0f4, 0x2a2a2e, "zebra");
  toyAnimal(0.02, -0.04, 2.6, 0x2b2e33, 0xf2efe4, "penguin");
  toyAnimal(0.86, 0.16, -1.5, 0x8a7a6a, 0x6a5a4a, "hippo");
  // the chicken — the game's tutorial animal (main.js:223), smallest bird tier,
  // placed nearest the sign the way the game introduces it first
  (function () {
    var ch = new THREE.Group(); ch.position.set(0.46, 0, -0.06); ch.rotation.y = -0.8; zooG.add(ch);
    var chBody = box(0.026, 0.020, 0.018, mat(0xf0ead8, 0.85)); chBody.position.y = 0.020; ch.add(chBody);
    var chBelly = box(0.020, 0.012, 0.019, mat(0xffffff, 0.85)); chBelly.position.set(0.002, 0.014, 0); ch.add(chBelly);
    var chHead = box(0.011, 0.012, 0.011, mat(0xf0ead8, 0.85)); chHead.position.set(0.015, 0.036, 0); ch.add(chHead);
    var chComb = box(0.007, 0.005, 0.004, mat(0xe03a3a, 0.85)); chComb.position.set(0.015, 0.0445, 0); ch.add(chComb);
    var chBeak = box(0.006, 0.004, 0.004, mat(0xe8b83a, 0.7)); chBeak.position.set(0.023, 0.036, 0); ch.add(chBeak);
    [-0.005, 0.005].forEach(function (lz) {
      var chLeg = box(0.002, 0.010, 0.002, mat(0xe8b83a, 0.7)); chLeg.position.set(0, 0.005, lz); ch.add(chLeg);
    });
    ch.children.forEach(zpush);
  })();
  // the sign, lettered by hand and pushed into the grass
  var zSignPost = box(0.010, 0.14, 0.010, stickM);
  zSignPost.position.set(-1.02, 0.07, -0.02); zooG.add(zpush(zSignPost));
  var zSign = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.13),
    new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide,
      map: canvasTex(128, 56, function (c, w, h) {
        c.fillStyle = "#f2ead6"; c.fillRect(0, 0, w, h);
        c.strokeStyle = "#8a6f3c"; c.lineWidth = 4; c.strokeRect(3, 3, w - 6, h - 6);
        c.fillStyle = "#3a5e3a"; c.font = "bold 19px Georgia, serif"; c.textAlign = "center";
        c.fillText("THE ZOO", w / 2, 25);
        c.font = "italic 11px Georgia, serif"; c.fillStyle = "#6a5a38";
        c.fillText("please do not tap", w / 2, 42);
      }) }));
  // ⚠️ at rotation.y 0.15 inside a group turned 0.28, the sign's normal was 65 degrees
  // off the only camera in the house that looks at it — a hand-lettered sign rendering
  // as an 8 px edge. 1.42 + the group's 0.28 puts it ~7 degrees off dead-on, which is
  // square enough to read and crooked enough to look pushed into the grass by hand.
  zSign.position.set(-1.02, 0.19, -0.02); zSign.rotation.y = 1.42; zooG.add(zSign);
  zSignPost.scale.y = 1.5; zSignPost.position.y = 0.10;
  /* ⚠️ 145 MESHES TAGGED AS ONE CLICKABLE — 88 fence sticks, 55 animal parts, the
   * sign and its post. The highlight follows whichever mesh the ray hits first, so
   * hovering the zoo usually lit up a single 8 mm fence stick rather than the zoo.
   * One invisible hit box over the pens is both cheaper and honest about what you are
   * pointing at. The parts stay in the scene; they just stop competing to BE it. */
  var zooHit = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.45, 0.62),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  zooHit.position.set(-0.02, 0.22, 0.02); zooG.add(zooHit);
  [zooHit].forEach(function (m) {
    btag(m, "CLEAN THE ZOO", function () { window.location.href = "https://kylefriesmarketing.github.io/clean-the-zoo/"; },
      zooSave
        ? "CLEAN THE ZOO — " + zooSave + " animal" + (zooSave === 1 ? "" : "s") + " home so far · click for the rest"
        : "CLEAN THE ZOO — 1,500 animals, ten habitats, one very long morning");
  });

  /* ---- SURF: the boogie board dropped on the pool deck ---------------------------
   * A pool is where a kid practises for the ocean. Laid flat on the west apron
   * where you'd actually drop it, deck up, leash coiled beside the tail. */
  var surfSave = (function () {
    try {
      var best = parseInt(localStorage.getItem("surf-best") || "0", 10) || 0;
      var car = JSON.parse(localStorage.getItem("surf-career") || "null");
      /* ⚠️ THIS READ car.rides AND car.waves, AND SURF WRITES NEITHER. Its newCareer()
       * returns { heats, stars, bestSet, lifetime: { waves, dist, barrel, ... } }, so
       * the count was structurally always 0 — and it was never displayed anyway. The
       * lifetime wave count is the number that means something. */
      return { best: best, rides: (car && car.lifetime && car.lifetime.waves) || 0 };
    } catch (e) { return { best: 0, rides: 0 }; }
  })();
  var bbG = new THREE.Group();
  /* the west apron is 0.95 deep and 2.9 long, and the coping eats the inner 0.18 —
   * so a 0.95 x 0.52 board only lies flat here along Z. Sat 2mm proud of the slab
   * (top GROUND+0.035) so it never z-fights the concrete. */
  /* ⚠️ NOT the middle of that apron — the diving board base sits at (POOL.x0-0.55,
   * PCZ) with its plank reaching out over the water, and the first placement put the
   * board directly under it: half the outline hidden behind a concrete block. The
   * NORTH half of the west apron is the clear stretch. Rotated 0.18, the footprint
   * is 0.34 x 0.51 from centre, which clears the coping at POOL.x0-0.09 and the
   * apron edge at POOL.x0-0.95 by 9cm each side. */
  // ⚠️ the true east extent of this outline is +0.339 from its origin — the worst
  // point is out on the tail-lobe bezier, not on the straight rail — so at -0.50 the
  // board overhung the pool coping by 19 mm. -0.58 leaves it 61 mm clear of the
  // coping face and 60 mm clear of the apron edge, measured off the real bounding
  // box rather than off the comment, which measured to the coping's centreline.
  bbG.position.set(POOL.x0 - 0.58, GROUND + 0.037, POOL.z0 + 0.60);
  bbG.rotation.y = 0.18;
  badd(bbG);
  var bbDeckT = canvasTex(128, 256, function (c, w, h) {
    c.fillStyle = "#f2d43a"; c.fillRect(0, 0, w, h);                 // that yellow
    c.fillStyle = "#e0483a"; c.fillRect(0, h * 0.42, w, h * 0.10);   // the stripes
    c.fillStyle = "#4fb99e"; c.fillRect(0, h * 0.54, w, h * 0.06);        // pal.glow: the wave face
    c.fillStyle = "#287f84"; c.fillRect(0, h * 0.615, w, h * 0.03);       // pal.shallow, right under it
    // the tail traction pad — the thing a SURF player stares at between waves
    c.fillStyle = "#202528";
    c.fillRect(w * 0.24, h * 0.84, w * 0.15, h * 0.13); c.fillRect(w * 0.425, h * 0.84, w * 0.15, h * 0.13); c.fillRect(w * 0.61, h * 0.84, w * 0.15, h * 0.13);
    c.fillStyle = "rgba(255,255,255,0.5)";                           // a sun-bleached logo
    c.font = "bold 21px Georgia, serif"; c.textAlign = "center";
    c.save(); c.translate(w / 2, h * 0.24); c.fillText("SURF", 0, 0); c.restore();
    c.fillStyle = "#f6f2e4";                                         // the nose panel
    c.fillRect(0, 0, w, h * 0.09);
    c.fillStyle = "#e0483a"; c.fillRect(0, h * 0.09, w, h * 0.016);
    c.fillStyle = "rgba(40,34,20,0.10)";                             // wax, never fully scraped
    for (var i = 0; i < 90; i++) c.fillRect((i * 37) % w, (i * 53) % h, 3, 3);
  });
  var bbDeck = new THREE.MeshStandardMaterial({ map: bbDeckT, roughness: 0.55 });
  /* ⚠⚠ A BOOGIE BOARD IS AN OUTLINE, NOT A BOX. Two builds got this wrong.
   * First it was box(0.50, 0.05, 0.98) — flat, which is right — then it was stood
   * on end against the coping, and box(0.50, 0.98, 0.05) with a half-disc nose.
   * Standing it up turned its SLICK BOTTOM to the camera, so the whole prop read
   * as a black rectangle folded against the wall (Kyle's words, and the photo
   * agrees). A box plus a half-disc was never the shape either: a real board has a
   * rounded nose, parallel rails and a CRESCENT tail, and the crescent is the part
   * your eye names the object by.
   * So: a real Shape, extruded. The bevel does the soft rails for free.
   * ⚠️ ExtrudeGeometry builds in XY and pushes along +Z, so rotateX(-PI/2) lays it
   * down: the shape's y becomes world -z (nose at -L) and the extrusion becomes
   * world +y (thickness up). Rotate the GEOMETRY, not the mesh — the mesh still
   * needs its own free rotation.y for the angle it was dropped at. */
  var bbW = 0.26, bbL = 0.95;
  var bbShape = new THREE.Shape();
  bbShape.moveTo(-bbW, 0.20);
  bbShape.lineTo(-bbW, bbL - 0.30);
  bbShape.bezierCurveTo(-bbW, bbL - 0.04, -bbW * 0.60, bbL, 0, bbL);          // the nose
  bbShape.bezierCurveTo(bbW * 0.60, bbL, bbW, bbL - 0.04, bbW, bbL - 0.30);
  bbShape.lineTo(bbW, 0.20);
  /* the crescent is a BROAD SHALLOW SCOOP, not a slot. Cut at 0.17 deep between
   * lobes at 0.72W it read as a tooth — two narrow prongs with a notch between. */
  bbShape.bezierCurveTo(bbW, 0.04, bbW * 0.99, 0, bbW * 0.86, 0);             // right tail lobe
  bbShape.bezierCurveTo(bbW * 0.56, 0, bbW * 0.46, 0.105, 0, 0.105);          // the crescent
  bbShape.bezierCurveTo(-bbW * 0.46, 0.105, -bbW * 0.56, 0, -bbW * 0.86, 0);
  bbShape.bezierCurveTo(-bbW * 0.99, 0, -bbW, 0.04, -bbW, 0.20);              // left tail lobe
  var bbGeo = new THREE.ExtrudeGeometry(bbShape, {
    depth: 0.036, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.011,
    bevelSegments: 2, curveSegments: 14 });
  bbGeo.rotateX(-Math.PI / 2);
  /* ⚠️ Extrude's own UVs are in WORLD UNITS (0..0.95), so the deck art would tile
   * itself to confetti. Reproject the caps as a plain planar map from the bounding
   * box, and flip v — canvasTex leaves flipY on, so v=1 is the TOP of the canvas,
   * which is where the nose panel and the logo are painted. */
  bbGeo.computeBoundingBox();
  var bbBox = bbGeo.boundingBox, bbPos = bbGeo.attributes.position;
  var bbUV = new Float32Array(bbPos.count * 2);
  var bbSX = bbBox.max.x - bbBox.min.x, bbSZ = bbBox.max.z - bbBox.min.z;
  for (var vi = 0; vi < bbPos.count; vi++) {
    bbUV[vi * 2] = (bbPos.getX(vi) - bbBox.min.x) / bbSX;
    bbUV[vi * 2 + 1] = (bbBox.max.z - bbPos.getZ(vi)) / bbSZ;
  }
  bbGeo.setAttribute("uv", new THREE.BufferAttribute(bbUV, 2));
  var bbBody = new THREE.Mesh(bbGeo, [bbDeck, mat(0x1f2329, 0.45)]);  // caps, then rails
  bbBody.position.z = bbL * 0.5;              // centre the board on its own group
  bbG.add(bbBody);
  var bbLeash = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 14), mat(0x2b2e33, 0.6));
  bbLeash.rotation.x = -Math.PI / 2;
  bbLeash.position.set(POOL.x0 - 0.94, GROUND + 0.0445, POOL.z0 + 1.24); badd(bbLeash);
  var bbCord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.46, 6), mat(0x2b2e33, 0.6));
  bbCord.rotation.set(Math.PI / 2, 0, -0.62);
  // the apron's top face is GROUND + 0.035. At 0.055 the cord floated 12 mm over it —
  // three quarters of its own diameter — which reads as a wire, not a leash lying down.
  bbCord.position.set(POOL.x0 - 0.80, GROUND + 0.043, POOL.z0 + 1.06); badd(bbCord);
  [bbBody, bbLeash, bbCord].forEach(function (m) {
    btag(m, "SURF", function () { window.location.href = "https://kylefriesmarketing.github.io/surf/"; },
      surfSave.best
        ? "SURF — best ride " + surfSave.best + " · the pool is practice. click for the ocean"
        : "SURF — the wave carries you because the water moves. click for the ocean");
  });

  /* ---- THE KILN: brick, banded, and still ticking as it cools -----------------
   * A reduction kiln does not live indoors. It sits on its own pad off the side of
   * the lawn with the shelf of waiting pots beside it — which is exactly where the
   * game's whole premise lives too: you load it blind, you fire it, and you do not
   * find out what the fire did until it is cold enough to open. */
  var kilnSave = (function () {
    try {
      var m = JSON.parse(localStorage.getItem("kiln-save") || "null");
      return m ? { firings: m.firings || 0, effects: Object.keys(m.effects || {}).length } : { firings: 0, effects: 0 };
    } catch (e) { return { firings: 0, effects: 0 }; }
  })();
  /* ⚠️ MEASURE THE FOOTPRINT, do not eyeball the lawn. The first spot (-9.50, 11.30)
   * put the 1.9x1.7 pad straight through the grill, which stands at x -8.9..-7.93,
   * z 11.3..12.1 — the kettle ended up sitting ON the pad. This spot is the gap
   * between the grill and the zoo pens (which start at z 14.39), tested by sampling
   * the whole pad footprint for anything standing above the grass. */
  var kilnG = new THREE.Group(); kilnG.position.set(-9.00, GROUND, 13.30); kilnG.rotation.y = 0.24; badd(kilnG);
  var padM = mat(0x8e8a80, 0.96), bandM = mat(0x5d6169, 0.42);
  /* ⚠️ THE KILN BODY WAS 244 PX OF ONE FLAT COLOUR, in a yard that draws a canvas
   * texture for a BEACH BALL. Six canvases in this block and the game prop had none.
   * Seven staggered courses of firebrick with a mortar grid, a soot plume climbing
   * from the spyhole, and a paler calcined crown where the lid sits — about twenty
   * draw ops, and the difference between a terracotta cylinder and a kiln. */
  var brickT = canvasTex(256, 512, function (c, w, h) {
    c.fillStyle = '#a8674a'; c.fillRect(0, 0, w, h);
    var rows = 7, rh = h / rows;
    for (var r5 = 0; r5 < rows; r5++) {
      var off = (r5 % 2) * (w / 8);
      for (var k5 = 0; k5 < 4; k5++) {
        var bx5 = off + k5 * (w / 4);
        c.fillStyle = ['#b06e4e', '#9e5f45', '#a86a4a', '#b47450'][(r5 + k5) % 4];
        c.fillRect(bx5 + 2, r5 * rh + 2, w / 4 - 4, rh - 4);
      }
    }
    c.strokeStyle = 'rgba(228,220,200,0.45)'; c.lineWidth = 3;
    for (var g5 = 0; g5 <= rows; g5++) { c.beginPath(); c.moveTo(0, g5 * rh); c.lineTo(w, g5 * rh); c.stroke(); }
    // the calcined crown, and the soot the spyhole has been throwing for years
    var cr = c.createLinearGradient(0, 0, 0, h * 0.18);
    cr.addColorStop(0, 'rgba(232,226,208,0.55)'); cr.addColorStop(1, 'rgba(232,226,208,0)');
    c.fillStyle = cr; c.fillRect(0, 0, w, h * 0.18);
    var so = c.createRadialGradient(w * 0.5, h * 0.46, 4, w * 0.5, h * 0.30, h * 0.26);
    so.addColorStop(0, 'rgba(24,18,14,0.62)'); so.addColorStop(1, 'rgba(24,18,14,0)');
    c.fillStyle = so; c.fillRect(w * 0.2, h * 0.05, w * 0.6, h * 0.5);
  });
  brickT.colorSpace = THREE.SRGBColorSpace;
  brickT.wrapS = brickT.wrapT = THREE.RepeatWrapping; brickT.repeat.set(3, 1);
  var brickM = new THREE.MeshStandardMaterial({ map: brickT, roughness: 0.92 });
  var kbBump = bumpFrom(brickT, 1.8);
  if (kbBump) { kbBump.repeat.copy(brickT.repeat); brickM.bumpMap = kbBump; brickM.bumpScale = 0.5; }
  var kPad = box(1.90, 0.07, 1.70, padM); kPad.position.y = 0.035; kilnG.add(kPad);
  var kBody = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.50, 1.02, 14), brickM);
  kBody.position.y = 0.58; kilnG.add(kBody);
  var kilnExtra = [];
  [0.28, 0.62, 0.96].forEach(function (by) {          // the steel bands that hold it together
    var bd = new THREE.Mesh(new THREE.TorusGeometry(0.485, 0.022, 6, 20), bandM);
    bd.rotation.x = Math.PI / 2; bd.position.y = by; kilnG.add(bd); kilnExtra.push(bd);
  });
  var kLid = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.47, 0.16, 14), brickM);
  kLid.position.y = 1.15; kilnG.add(kLid);
  var kDoor = box(0.05, 0.52, 0.40, mat(0x8f5740, 0.9));
  kDoor.position.set(0.47, 0.55, 0); kilnG.add(kDoor);
  // the spyhole: the only way in while it is running, and the reason the game is blind
  var spy = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12),
    new THREE.MeshStandardMaterial({ color: 0xffdcaa, emissive: 0xffa64d, emissiveIntensity: 1.5, roughness: 0.5 }));   // --hot / --fire, the-kiln :root
  spy.rotation.y = Math.PI / 2; spy.position.set(0.503, 0.70, 0); kilnG.add(spy);
  var flue = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.80, 10), bandM);
  flue.position.set(0, 1.60, 0); kilnG.add(flue);
  var flueCap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.11, 10), bandM);
  flueCap.position.set(0, 2.05, 0); kilnG.add(flueCap);
  // the shelf of pots waiting their turn, and two that already went through
  var shelfM = mat(0x7a6a52, 0.9);
  /* ⚠️ TWO BUGS IN FOUR LINES. (a) the pad's top face is y 0.07, and the shelf's own
   * legs stood on y 0 — one leg was on the concrete, one sunk into it, because the
   * shelf straddled the pad's edge. It stands wholly OFF the pad now, which is where
   * a pot table goes anyway. (b) both legs landed on the same centreline: the table
   * read [[-1.28, 0.26], [-0.52, 0.26]] and placed each at `0.30 + lg[1] - 0.26`, so
   * the offset evaluated to exactly zero twice — the fossil of a four-leg table whose
   * z column was never filled in. Four legs, two extra meshes, and the arithmetic
   * no-op is gone. */
  var kShelf = box(0.92, 0.05, 0.34, shelfM); kShelf.position.set(-1.42, 0.52, 0.30); kilnG.add(kShelf);
  [[-1.80, -0.12], [-1.80, 0.12], [-1.04, -0.12], [-1.04, 0.12]].forEach(function (lg) {
    var leg = box(0.06, 0.50, 0.06, shelfM); leg.position.set(lg[0], 0.25, 0.30 + lg[1]); kilnG.add(leg); kilnExtra.push(leg);
  });
  /* the comment above says two of these have already been through, and for a while
   * the code built three identical pots at three identical roughnesses in a dead
   * straight row. A fired pot has a glaze on it: 0.20 against raw bisque at 0.95.
   * The z and the turn vary too, because nobody puts pots down in a line. */
  /* the glazes are the game's own (the-kiln data.js:19-42): tenmoku near-black at
   * gloss 0.08, shino orange at 0.45, and the third pot is bare clay #b09680 at the
   * game's bare roughness 0.92 (pot.js:340/349) — still waiting its turn. */
  [[0x2c1a14, 0.10, 0.13, -1.70, 0.24, 0.08, 0.6],
   [0xe8ac66, 0.085, 0.11, -1.42, 0.34, 0.45, -0.9],
   [0xb09680, 0.095, 0.15, -1.13, 0.28, 0.92, 0.25]].forEach(function (pt) {
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(pt[1] * 0.78, pt[1], pt[2], 12), mat(pt[0], pt[5]));
    pot.position.set(pt[3], 0.545 + pt[2] / 2, pt[4]); pot.rotation.y = pt[6]; kilnG.add(pot);
    btag(pot, 'the pots', null, 'two came out of the last firing. the third one is waiting its turn.');
  });
  /* the cone pack — the game's central instrument (its own words, data.js:440; it
   * never says 'witness cones'). Four pyrometric cones in a clay pat: three standing
   * clay-grey, one bent flat and toasted — the down-cone colour the game paints
   * (main.js:681-684). */
  var conePat = box(0.07, 0.014, 0.032, mat(0xb09680, 0.92));
  conePat.position.set(-1.28, 0.552, 0.42); kilnG.add(conePat);
  [0, 1, 2, 3].forEach(function (ci) {
    var bent = ci === 2;
    var cone5 = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0045, 0.036, 4), mat(bent ? 0xd9c49a : 0x8d8377, 0.85));
    cone5.position.set(-1.303 + ci * 0.016, bent ? 0.564 : 0.577, 0.42);
    if (bent) cone5.rotation.z = Math.PI * 0.47; else cone5.rotation.y = ci * 0.4;
    kilnG.add(cone5);
    btag(cone5, "the cone pack", null, "the reduction pack reads 012, 010, 08, 06. the bend tells you what the fire did, after it has done it.");
  });
  btag(conePat, "the cone pack", null, "the reduction pack reads 012, 010, 08, 06. the bend tells you what the fire did, after it has done it.");
  // the kiln god, on the arch — the game's phrase (main.js:215)
  var godG = new THREE.Group(); godG.position.set(0.20, kLid.position.y + 0.08, 0.12); kilnG.add(godG);
  var godBody = new THREE.Mesh(new THREE.SphereGeometry(0.016, 7, 6), mat(0xb09680, 0.92));
  godBody.scale.set(1, 1.35, 0.9); godG.add(godBody);
  var godHead = new THREE.Mesh(new THREE.SphereGeometry(0.009, 7, 6), mat(0xb09680, 0.92));
  godHead.position.y = 0.026; godG.add(godHead);
  [-0.013, 0.013].forEach(function (gx) {
    var godArm = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), mat(0xb09680, 0.92));
    godArm.position.set(gx, 0.008, 0.004); godG.add(godArm);
  });
  godG.children.forEach(function (m) {
    btag(m, "the kiln god", null, "make something out of the scrap clay and put it on the arch, if you want. it will not help.");
  });
  var kBucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.24, 12), mat(0x4a5a68, 0.6));
  kBucket.position.set(0.62, 0.19, 0.66); kilnG.add(kBucket);   // 0.07 pad + half its own height
  // ⚠️ same stale-list problem: the kiln builds 17 meshes and this list named 8, so
  // the steel bands and the shelf legs answered no hover at all.
  [kBody, kLid, kDoor, spy, flue, flueCap, kShelf, kBucket].concat(kilnExtra).forEach(function (m) {
    btag(m, "THE KILN", function () { window.location.href = "https://kylefriesmarketing.github.io/the-kiln/"; },
      kilnSave.firings
        ? "THE KILN — " + kilnSave.firings + " firings, " + kilnSave.effects + " of 16 surfaces seen. click to load it again"
        : "THE KILN — load it blind, fire it, and wait. you find out when it is cold. click to fire");
  });
  btag(kPad, "the kiln pad", null, "poured one weekend so the kiln would stop sinking. it worked.");

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
  propSwap('grill', grillG, grillG.children.slice(), { w: 0.85, h: 1.05, ry: 0 });
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
    // intensity, never .visible — a light leaving the scene graph changes the
    // shader's light count and recompiles every program in the house on one click
    poolLight.intensity = poolLightOn ? 1.5 : 0; poolNiche.visible = poolLightOn;
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
  /* ⚠️ THE SLAB, JAMBS, SPILL AND PLAQUE WERE ALL HARDCODED TO z 5.08..6.12 while
   * the OPENING came from GDO — so moving GDO left the door itself behind in the
   * middle of the new staircase. They are derived now and cannot drift again. */
  var GDO_C = (GDO.z0 + GDO.z1) / 2;
  var gDoorPivot = new THREE.Group(); gDoorPivot.position.set(W_IN + 0.03, 0, GDO.z1 - 0.06); add(gDoorPivot);
  var gSlab = box(0.05, 2.05, 0.92, mat(0x3f4a52, 0.72)); gSlab.position.set(0, 1.025, -0.46); gDoorPivot.add(gSlab);
  var gKnob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.6 }));
  gKnob.position.set(0.05, 1.0, -0.80); gDoorPivot.add(gKnob);
  [[2.09, 0.08, 1.06, GDO_C], [1.02, 2.12, 0.08, GDO.z0], [1.02, 2.12, 0.08, GDO.z1]].forEach(function (j) {
    var jm = box(0.08, j[1], j[2], mat(0x241b12, 0.8));
    jm.position.set(W_IN + 0.045, j[0], j[3]); add(jm);
  });
  var gSpill = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  gSpill.rotation.x = -Math.PI / 2; gSpill.rotation.z = Math.PI / 2;
  gSpill.position.set(W_IN + 0.12, 0.012, GDO_C); add(gSpill);
  (function () {
    var pg = new THREE.Group(); pg.position.set(W_IN + 0.03, 0, GDO_C); add(pg);
    plaque(pg, "GARAGE", "mind your head");
  })();
  [gSlab, gKnob].forEach(function (m) {
    m.userData.__swings = 1;   // hinged on the hall wall, opens INTO the garage
    tag(m, "the garage door", function () { enterGarage(); },
      "the garage — one car, a workbench, and everything that didn't fit. click to go in");
  });
  // the way back: an invisible hitbox in the opening, garage side
  var gBackHit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.0, 1.0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  gBackHit.position.set(W_IN - 0.15, 1.03, 7.97); add(gBackHit);
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
  /* ⚠️ the machines are children [0..n-4]; the basket, the wash pile and the 1997
   * sock are the LAST THREE and they STAY — they are the joke, and the baked machines
   * would bury it. One bake serves both machines; the dryer instance is tinted a
   * shade warmer so the pair reads as two appliances that aged differently. */
  var launMachines = launG.children.slice(0, launG.children.length - 3);
  propSwap('washer', launG, launMachines,
    { x: 0, z: -0.34, w: 0.64, d: 0.64, h: 0.92, ry: -Math.PI / 2 }, launG.children[0]);
  propSwap('washer', launG, [],
    { x: 0, z: 0.34, w: 0.64, d: 0.64, h: 0.92, ry: -Math.PI / 2, tint: 0xf2e9d8 }, launG.children[0]);
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

  /* --- THE OVERFLOW CORNER: chest freezer + the shelves every house grows.
   * ⚠️ IT USED TO STAND IN THE HALL'S SOUTH-WEST CORNER, which is now the foot of
   * the staircase AND the garage doorway — it fouled tread 0 and stood in the new
   * opening. It has moved UNDER the flight, which is where a chest freezer and a
   * rack of bins actually live in a house like this. Measured against the stairs
   * above them: the freezer (top y 0.93) sits at z 4.58..5.82 where the lowest
   * tread overhead is 1.11, and the shelving (top 2.25) sits at z 3.0..4.15 where
   * the flight is 2.8-3.1 up. The garage was checked first and is full — a grid
   * search found no clear 0.7x1.3 floor anywhere but one column, and no free wall
   * at shelf height at all. */
  var FRZ_X = W_IN + 0.40, FRZ_Z = 5.20, SHV_X = W_IN + 0.24, SHV_Z = 3.60;
  var frz = box(1.24, 0.86, 0.66, mat(0xe8eae6, 0.5));
  frz.position.set(FRZ_X, 0.43, FRZ_Z); frz.rotation.y = Math.PI / 2; frz.castShadow = true; badd(frz);
  var frzLid = box(1.2, 0.07, 0.64, mat(0xdcdedb, 0.45));
  frzLid.position.set(FRZ_X, 0.89, FRZ_Z); frzLid.rotation.y = Math.PI / 2; badd(frzLid);
  var frzSeal = box(0.06, 0.04, 0.6, mat(0x9aa0a0, 0.6)); frzSeal.position.set(FRZ_X + 0.32, 0.72, FRZ_Z); badd(frzSeal);
  tag(frz, "the chest freezer", null, "the chest freezer. nobody remembers what is at the bottom of it.");
  tag(frzLid, "the chest freezer", null, "the chest freezer. nobody remembers what is at the bottom of it.");
  var shelfM = mat(0x7d8489, 0.6);
  [1.25, 1.72, 2.19].forEach(function (sy, si) {
    var sh = box(0.42, 0.04, 1.5, shelfM); sh.position.set(SHV_X, sy, SHV_Z); badd(sh);
    [[-0.6, 0x8a5a3a], [0.0, 0x4a6a8a], [0.55, 0x6a6a4a]].forEach(function (bn, bi) {
      if ((si + bi) % 3 === 2) return;                      // not every slot has a bin
      var bin = box(0.34, 0.26, 0.4, mat(bn[1], 0.85));
      bin.position.set(SHV_X, sy + 0.15, SHV_Z + bn[0]); badd(bin);
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
  // ⚠️ through ground() like every other floor: 1:1 over 4.5 x 4.1 m was 57 texels/m,
  // the blurriest floor in the house, in the one room you walk into at ground level.
  // 2x2 gives 114 and hands it the bump relief the others all have.
  var garFloorM = ground(garFloorT, 2, 2, 0xffffff, 0.98, 0.7);
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
  /* ⚠️ DERIVED FROM GDO, and it has to be: this run was hardcoded to split around the
   * man door at z 5.08..6.12, so when the doorway moved south to 7.45 the garage kept
   * a solid wall behind the new opening AND a 1.04 m hole in itself at the old one.
   * The wall now runs from the garage's north end to the doorway; south of GDO.z1
   * there is no wall left to build, which the guard handles. */
  [[4.35, GDO.z0], [GDO.z1, 8.45]].forEach(function (p) {   // east wall, split around the man door
    if (p[1] - p[0] < 0.02) return;
    var seg = box(0.24, 2.05, p[1] - p[0], garWallM);
    seg.position.set(-7.70, 1.025, (p[0] + p[1]) / 2); add(seg);
  });
  var gwN = box(1.10, 2.05, 0.12, garWallM); gwN.position.set(-8.15, 1.025, 4.41); add(gwN);
  var gwNh = box(3.40, 0.20, 0.12, garWallM); gwNh.position.set(-10.40, 1.95, 4.41); add(gwNh);
  // ⚠️ the sill's top is BURIED 2cm inside the floor slab, not flush with it — at a
  // shared y 0 the two top faces were coplanar across the whole opening strip,
  // which is the baseboard-flashing bug all over again.
  /* ⚠️ its own aspect: the sill is 3.40 x 0.40, so the floor material’s square 2x2
   * repeat drew the concrete 8.5x wider than tall across it. */
  var gSillT = garFloorT.clone(); gSillT.needsUpdate = true;
  gSillT.wrapS = gSillT.wrapT = THREE.RepeatWrapping; gSillT.repeat.set(2, 0.24);
  var gSillM = new THREE.MeshStandardMaterial({ map: gSillT, roughness: 0.98 });
  LOOK_EXTRA.push(gSillM);
  var gSill = box(3.40, 0.40, 0.10, gSillM); gSill.position.set(-10.40, -0.28, 4.41); add(gSill);
  var gThresh = box(0.46, 0.04, 1.04, mat(0x6b5638, 0.85)); gThresh.position.set(-7.62, 0.0, GDO_C); add(gThresh);   // ⚠️ GDO_C, not the old opening's hardcoded 5.60
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

  /* ⚠️ EVERYTHING BELOW SITS OUTSIDE THE NEWSPAPER LOOP, and it has to. The rod
   * first went in directly after the gtag line above — which is INSIDE a two-item
   * forEach that builds the two tied bundles — so the whole thing was constructed
   * TWICE in the same corner: two rods, two tackle boxes, two bobbers, z-fighting
   * against themselves. It read as one rod, which is why nothing looked wrong; the
   * giveaway was 16 pickables tagged BITE where the code tags 8.
   * When you append to this file, check what BRACE you are landing inside. */

  /* ---- BITE: the rod, stood in the corner where a rod actually lives ----------
   * Nobody hangs a rod on the wall in a garage like this — it leans in the corner
   * past the bench, with the tackle box at its foot and the bobber that came off
   * in the grass last August still in the tray. Leaned into the SOUTH-WEST corner
   * on purpose: it is what the arrival camera is already looking at, since grest
   * aims down the long diagonal at the bench and the pegboard. */
  var biteSave = (function () {
    try {
      var m = JSON.parse(localStorage.getItem("bite-save") || "null");
      return m ? { sp: Object.keys(m.journal || {}).length, casts: m.casts || 0,
                   mayor: !!(m.mayor && m.mayor.landed),
                   spooned: !!(m.mayor && m.mayor.hooked && !m.mayor.landed) } : { sp: 0, casts: 0, mayor: false, spooned: false };
    } catch (e) { return { sp: 0, casts: 0, mayor: false, spooned: false }; }
  })();
  var rodG = new THREE.Group();
  /* ⚠️ THE NORTH-WEST CORNER, not the south-west one it started in. From grest —
   * the spot the camera actually arrives at — the tarped project car stands square
   * in front of the far corner: probing the rod at four heights along its length,
   * only ONE of the four was unblocked, and the grip and the tackle box were both
   * behind the car. Same probe here reads 4 of 4. A prop nobody can see from the
   * one camera that looks at the room is not in the room. */
  rodG.position.set(-11.72, 0, 4.68);
  rodG.rotation.set(-0.10, 0, 0.16);      // tipped back into the corner, both ways
  add(rodG);
  var corkM = mat(0xc9a877, 0.9), rodM = mat(0x2b2f36, 0.55), lineM = mat(0xdfe6ee, 0.6);
  var grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.30, 10), corkM);
  grip.position.y = 0.15; rodG.add(grip);
  // ⚠️ steelM (color 0x454b52, roughness 0.4, metalness 0.6) is declared in this same
  // room and used at fourteen sites — the vice, the hammer, the saw, the brackets —
  // and the one machined object in it, a fishing reel, was matte grey plastic. At the
  // resting distance the reel is about 32 px, and the specular is the whole difference
  // between a lump and a mechanism.
  var seat = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.09, 10), steelM);
  seat.position.y = 0.345; rodG.add(seat);
  // the blank tapers — a rod that is the same width all the way up reads as a pole
  /* ⚠️ each segment is placed at sg[0] + 0.20 and is 0.50 long, so it spans
   * [sg[0] - 0.05, sg[0] + 0.45]. The old table started the blank at 0.50 while the
   * reel seat ended at 0.39 — an 11 cm hole in the rod at exactly the height the
   * first guide sits. 0.44 butts the seat and keeps the taper and the 0.05 overlap. */
  [[0.44, 0.014, 0.011], [0.89, 0.011, 0.008], [1.34, 0.008, 0.005]].forEach(function (sg) {
    var seg = new THREE.Mesh(new THREE.CylinderGeometry(sg[2], sg[1], 0.50, 8), rodM);
    seg.position.y = sg[0] + 0.20; rodG.add(seg);
  });
  var reel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.036, 14), steelM);
  reel.rotation.z = Math.PI / 2; reel.position.set(0.055, 0.30, 0); rodG.add(reel);
  var reelStem = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.012), steelM);
  reelStem.position.set(0.028, 0.30, 0); rodG.add(reelStem);
  var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 6), mat(0x2b2f36, 0.5));
  handle.rotation.x = Math.PI / 2; handle.position.set(0.088, 0.335, 0.03); rodG.add(handle);
  [0.62, 0.98, 1.34, 1.66].forEach(function (gy) {   // the guides
    var gd = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0022, 5, 10), steelM);
    /* ⚠️ three.js builds a torus in the XY plane with its hole axis on +Z. A Y
     * rotation swings that axis to +X — perpendicular to the blank — so the guides
     * were little wheels bolted to the side of the rod. X puts the hole on Y, which
     * is the direction the line actually runs. */
    gd.rotation.x = Math.PI / 2; gd.position.set(0, gy, 0); rodG.add(gd);
  });
  var line = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 1.30, 4), lineM);
  line.position.set(0.014, 1.00, 0); line.rotation.z = -0.012; rodG.add(line);
  // the tackle box, lid shut, one latch undone
  var tackG = new THREE.Group(); tackG.position.set(-11.28, 0, 4.94); tackG.rotation.y = -0.34; add(tackG);
  var tackBody = box(0.34, 0.16, 0.20, mat(0x2f6f4e, 0.7)); tackBody.position.y = 0.08; tackG.add(tackBody);
  /* the lid is OPEN now — hinged back ~57° at the rear edge — because the inside of
   * the lid is where the game keeps its heart: dad's note 'eights, kiddo.' and the
   * taped barometer (BITE-BIBLE:108-109, 250-253). The three lures in the tray are
   * the game's own (index.html:1743): the red-and-white spoon, the topwater frog,
   * the inline spinner. */
  var tackLid = box(0.35, 0.05, 0.21, mat(0x275c41, 0.7));
  tackLid.position.set(0, 0.258, -0.070); tackLid.rotation.x = -1.0; tackG.add(tackLid);
  var lidNote = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.045), new THREE.MeshStandardMaterial({
    roughness: 0.9, map: canvasTex(96, 44, function (c, w, h) {
      c.fillStyle = "#ece8de"; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#b8b2a4"; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
      c.fillStyle = "#3a342c"; c.font = "italic 13px cursive"; c.textAlign = "center";
      c.fillText("eights, kiddo.", w / 2, 27);
    }) }));
  lidNote.position.set(-0.06, 0.244, -0.048); lidNote.rotation.x = 0.57; tackG.add(lidNote);
  var baroRim = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 12), steelM);
  baroRim.position.set(0.08, 0.244, -0.048); baroRim.rotation.x = 2.14; tackG.add(baroRim);
  var baroFace = new THREE.Mesh(new THREE.CircleGeometry(0.013, 12), new THREE.MeshStandardMaterial({
    roughness: 0.6, map: canvasTex(32, 32, function (c, w, h) {
      c.fillStyle = "#ece8de"; c.beginPath(); c.arc(16, 16, 16, 0, 7); c.fill();
      c.strokeStyle = "#3a342c"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(16, 16); c.lineTo(24, 9); c.stroke();   // rising — go fish
    }) }));
  baroFace.position.set(0.08, 0.2465, -0.0445); baroFace.rotation.x = 0.57; tackG.add(baroFace);
  var luSpoon = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), mat(0xc8402c, 0.4));
  luSpoon.scale.set(1.1, 0.35, 0.65); luSpoon.position.set(-0.09, 0.167, 0.02); tackG.add(luSpoon);
  var luStripe = box(0.008, 0.007, 0.02, mat(0xece8de, 0.5));
  luStripe.position.set(-0.09, 0.169, 0.02); tackG.add(luStripe);
  var luFrog = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mat(0x5c8f3a, 0.6));
  luFrog.scale.set(1, 0.65, 1.15); luFrog.position.set(0.0, 0.167, -0.04); tackG.add(luFrog);
  var luSpin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6), mat(0xc9c02c, 0.5));
  luSpin.rotation.z = Math.PI / 2; luSpin.position.set(0.08, 0.166, 0.04); tackG.add(luSpin);
  var luBlade = box(0.014, 0.002, 0.009, mat(0xd8d8d0, 0.25));
  luBlade.position.set(0.10, 0.170, 0.045); luBlade.rotation.y = 0.5; tackG.add(luBlade);
  var tackHandle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 12), mat(0x1f4a34, 0.7));
  tackHandle.rotation.x = Math.PI / 2; tackHandle.position.set(0, 0.225, 0); tackG.add(tackHandle);
  var latch = box(0.03, 0.02, 0.012, mat(0xb8b2a4, 0.4)); latch.position.set(0.11, 0.16, 0.106); tackG.add(latch);
  var bob = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), mat(0xd24a30, 0.6));    // drawBobber's literal red
  bob.position.set(-11.02, 0.036, 4.78); add(bob);
  var bobTop = new THREE.Mesh(new THREE.SphereGeometry(0.0362, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xece8de, 0.6));
  // the white antenna stem the game draws on every bobber (its fillRect(-1.4,-14,2.8,6))
  var bobAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.028, 6), mat(0xece8de, 0.6));
  bobAnt.position.set(-11.02, 0.036 + 0.036 + 0.014, 4.78); add(bobAnt);
  bobTop.position.copy(bob.position); add(bobTop);
  // the whole rod, not just the bits I happened to name: the blank, the guides and
  // the line are most of what the eye lands on, and a prop you cannot click on the
  // part you are looking at reads as scenery
  var biteParts = [bob, bobTop, bobAnt];
  [rodG, tackG].forEach(function (gr) { gr.traverse(function (m) { if (m.isMesh) biteParts.push(m); }); });
  biteParts.forEach(function (m) {
    gtag(m, "BITE", function () { window.location.href = "https://kylefriesmarketing.github.io/bite/"; },
      biteSave.sp
        /* ⚠️ biteSave parses `casts` and `mayor` and then reads only `sp`. The mayor is
         * BITE's signature — the one fish nobody believes you caught — and it was sitting
         * parsed in a variable, unspent, one ternary away from being the best line here. */
        ? (biteSave.mayor
            ? "BITE — the mayor came up once. nobody believed it · click to go back down"
            : "BITE — " + biteSave.sp + " of 15 logged at Mud Lake. click to go back down")
        : "BITE — quiet fishing at Mud Lake. the water tells you everything. click to go");
  });
  // the bare bulb, and the clack it answers to
  /* THE MAYOR — 47 inches of her, as the wooden trophy nobody believes (her exact
   * palette and nine bars from bite index.html:160-165). If the save says she was
   * hooked and never landed, the red-and-white spoon hangs at her jaw — 'she has
   * the spoon now' (BITE-BIBLE:260). The book of mud lake sits under her. */
  var mayG = new THREE.Group(); mayG.position.set(-11.30, 0, 5.42); mayG.rotation.set(-0.22, -0.5, 0); add(mayG);
  var mayPlq = box(0.28, 0.115, 0.014, mat(0x6a4e30, 0.85)); mayPlq.position.y = 0.30; mayG.add(mayPlq);
  var mayFish = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.09), new THREE.MeshStandardMaterial({
    transparent: true, roughness: 0.8, map: canvasTex(192, 72, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      c.fillStyle = "#7e8a6d";                                    // her body
      c.beginPath(); c.moveTo(10, h * 0.5);
      c.quadraticCurveTo(w * 0.3, h * 0.08, w * 0.62, h * 0.22); c.quadraticCurveTo(w * 0.86, h * 0.32, w - 26, h * 0.42);
      c.lineTo(w - 6, h * 0.2); c.lineTo(w - 10, h * 0.5); c.lineTo(w - 6, h * 0.8); c.lineTo(w - 26, h * 0.58);
      c.quadraticCurveTo(w * 0.86, h * 0.68, w * 0.62, h * 0.8); c.quadraticCurveTo(w * 0.3, h * 0.94, 10, h * 0.5);
      c.fill();
      c.fillStyle = "#57604e";                                    // her back
      c.beginPath(); c.moveTo(14, h * 0.44); c.quadraticCurveTo(w * 0.3, h * 0.06, w * 0.62, h * 0.2);
      c.quadraticCurveTo(w * 0.4, h * 0.28, 14, h * 0.44); c.fill();
      c.fillStyle = "#cdd6bd";                                    // her belly
      c.beginPath(); c.ellipse(w * 0.36, h * 0.66, w * 0.24, h * 0.13, 0.06, 0, 7); c.fill();
      c.fillStyle = "#2b3026";                                    // the nine bars
      for (var br6 = 0; br6 < 9; br6++) c.fillRect(24 + br6 * 15, h * 0.24 + (br6 % 2) * 3, 4, h * 0.4);
      c.beginPath(); c.arc(26, h * 0.42, 3.5, 0, 7); c.fill();    // her eye
    }) }));
  mayFish.position.set(0, 0.30, 0.011); mayG.add(mayFish);
  if (biteSave.spooned) {
    var maySpoon = new THREE.Mesh(new THREE.SphereGeometry(0.008, 7, 5), mat(0xc8402c, 0.4));
    maySpoon.scale.set(1.1, 0.4, 0.7); maySpoon.position.set(-0.108, 0.268, 0.016); mayG.add(maySpoon);
  }
  var mayBook = box(0.12, 0.025, 0.16, mat(0x33290f, 0.85));
  mayBook.position.set(0.05, 0.0125, -0.28); mayBook.rotation.y = 0.3; mayG.add(mayBook);
  var mayBookLbl = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.028), new THREE.MeshStandardMaterial({
    transparent: true, roughness: 0.9, map: canvasTex(96, 26, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      c.fillStyle = "#e8e0cc"; c.font = "italic 11px Georgia, serif"; c.textAlign = "center";
      c.fillText("the book of mud lake", w / 2, 17);
    }) }));
  mayBookLbl.position.set(0.05, 0.0262, -0.28); mayBookLbl.rotation.x = -Math.PI / 2; mayBookLbl.rotation.z = 0.3; mayG.add(mayBookLbl);
  mayG.traverse(function (m) {
    if (m.isMesh) gtag(m, "BITE", function () { window.location.href = "https://kylefriesmarketing.github.io/bite/"; },
      "the bobber will tell you. everyone's seen the mayor once.");
  });
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
  // ⚠️ ce is -0.28, NOT -0.10: the bedroom's movables live at y 0 directly above,
  // and several GLBs sag below their own origin — Rex's toes and tail reach -0.15,
  // and at a -0.10 ceiling they dangled INTO the den, draped over the copper pipe
  // above the arcade corner like something out of a worse game. An 18cm joist
  // space (bedroom floor 0 down to slab top -0.20) swallows anything a player
  // drags around up there, which is exactly what a real joist space is for.
  var BSM = { x0: -7.40, x1: 3.30, z0: -2.40, z1: 4.60, fl: -2.42, ce: -0.28 };
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
  /* ⚠️ 128px textures at a FIXED repeat on walls of 10.70 m and 7.00 m: the north wall
   * ran 35.9 texels/m, the lowest of any surface in the house, on a wall you stand a
   * metre from — and it drew the blocks 117 x 25 cm when a real cinder block is
   * 40 x 20. Per-wall clones at a real-world course size instead. */
  function blockM(len, hgt) {                 // 42/128 of a tile is one block; target 0.40 m
    var t = cinderT.clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len * 0.820, hgt * 0.654);
    var m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.97 });
    LOOK_EXTRA.push(m); return m;
  }
  function plankWallM(len, hgt) {              // 16/128 of a tile is one plank; target 0.20 m
    var t = panelT.clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len * 0.625, Math.max(0.6, hgt) * 0.41);
    var m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    LOOK_EXTRA.push(m); return m;
  }
  var bsFloorM = mat(0x77756e, 0.98);
  var bsFloor = box(BSM.x1 - BSM.x0, 0.10, BSM.z1 - BSM.z0, bsFloorM);
  bsFloor.position.set((BSM.x0 + BSM.x1) / 2, BSM.fl - 0.05, (BSM.z0 + BSM.z1) / 2); add(bsFloor);
  bstag(bsFloor, "the basement floor", null, "cold through socks. everyone knows, everyone forgets.");
  var BSH = BSM.ce - BSM.fl, BSY = (BSM.ce + BSM.fl) / 2;
  var bwN = box(BSM.x1 - BSM.x0, BSH, 0.12, blockM(BSM.x1 - BSM.x0, BSH)); bwN.position.set((BSM.x0 + BSM.x1) / 2, BSY, BSM.z0 + 0.06); add(bwN);
  var bwW = box(0.12, BSH, BSM.z1 - BSM.z0, blockM(BSM.z1 - BSM.z0, BSH)); bwW.position.set(BSM.x0 + 0.06, BSY, (BSM.z0 + BSM.z1) / 2); add(bwW);
  var bwS = box(BSM.x1 - BSM.x0, BSH, 0.12, plankWallM(BSM.x1 - BSM.x0, BSH)); bwS.position.set((BSM.x0 + BSM.x1) / 2, BSY, BSM.z1 - 0.06); add(bwS);
  var bwE = box(0.12, BSH, BSM.z1 - BSM.z0, plankWallM(BSM.z1 - BSM.z0, BSH)); bwE.position.set(BSM.x1 - 0.06, BSY, (BSM.z0 + BSM.z1) / 2); add(bwE);
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
  var stringer = box(0.08, 1.15, 2.45, plankWallM(2.45, 1.15)); stringer.position.set(-6.51, BSM.fl + 0.95, 1.55); add(stringer);
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
  // the baked corduroy couch; the afghan goes with the sketch, which is a real loss —
  // if anyone ever bakes an afghan, it goes back on
  propSwap('dencouch', couchG, couchG.children.slice(), { w: 2.05, d: 1.0, ry: Math.PI });
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
  /* ⚠️ RepeatWrapping is REQUIRED here: this texture's offset.y is animated 0->1 at
   * 3.1 Hz (see bsmTick). Under three.js's default ClampToEdge an offset does not
   * wrap — it stretches the edge row across the uncovered band, so at offset 0.4 the
   * top 40% of the screen became one scanline smeared into hard vertical bars, and
   * the band grew and reset three times a second. The den TV was a strobe, not snow. */
  var staticT = canvasTex(64, 64, function (c, w, h) {
    for (var sp2 = 0; sp2 < w * h / 2; sp2++) {
      var vv = 90 + Math.random() * 165 | 0;
      c.fillStyle = "rgb(" + vv + "," + vv + "," + vv + ")";
      c.fillRect(Math.random() * w | 0, Math.random() * h | 0, 1, 1);
    }
  });
  staticT.wrapS = staticT.wrapT = THREE.RepeatWrapping;
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
  propSwap('pingpong', ppG, ppG.children.slice(), { w: 2.45, d: 1.40, ry: 0 });
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
  // ⚠️ 2.20, not 2.55: the crate sits at +0.85 and the sleeves fan to +0.92, so at
  // 2.55 they reached x 3.47 — through the paneling at 3.24 and out into the dirt.
  // ⚠️ 2.05 and not 2.20 either: the CRATE is the widest thing here (0.42 wide at
  // +0.85, so +1.06), not the record sleeves I sized the first correction against.
  // Measure the widest CHILD, not the one you happen to be thinking about.
  var rcG = new THREE.Group(); rcG.position.set(2.05, BSM.fl, 4.28); add(rcG);
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
  // the group already carries the face-the-wall PI turn; ry here only maps the bake's
  // forward (+z, handlebars) onto the sketch's long axis (x)
  // ⚠️ d 0.5 bound the first fit and shipped a 53 cm toy bike — the bake is deeper
  // than the sketch. Height is the axis that must match a bike; let depth follow.
  propSwap('exbike', bikeG2, bikeG2.children.slice(), { w: 1.10, d: 0.90, h: 1.02, ry: Math.PI / 2 });
  /* ---- THE ARCADE CORNER ---------------------------------------------------------
   * Two full-size cabinets against the block wall: BLOODRIFT (moved down from the
   * bedroom — a cabinet belongs in a den, and at 1.0 scale instead of the 0.85 the
   * bedroom's sightlines forced on it) and THE LAST ISSUE, built to match. Same
   * recipe as the original: angled control deck, emissive screen and marquee
   * pushed past the bloom threshold, side art on polygonOffset. Both attract
   * screens read your saves — same origin, same trick as everything else.
   * ⚠️ toe-in: the two machines angle 3 degrees toward each other, because
   * parallel cabinets read as furniture and angled ones read as an ARCADE. */
  var brSave = (function () {
    try {
      var p = JSON.parse(localStorage.getItem("br-profile-v1") || "null");
      if (!p || !p.chars) return { wins: 0, top: null };
      var wins = 0, top = null, topXp = -1;
      for (var id in p.chars) {
        var ch = p.chars[id] || {};
        wins += ch.wins || 0;
        if ((ch.xp || 0) > topXp) { topXp = ch.xp || 0; top = id; }
      }
      return { wins: wins, top: top };
    } catch (e) { return { wins: 0, top: null }; }
  })();
  var BR_TINTS = {
    /* ⚠️ VERIFIED AGAINST bloodrift/main.mjs:44-57 — the game's own faction table:
     *   THE VANGUARD #c9a227 (gold), APEX #d4af37, THE COURT #b8434e, THE SPIRAL
     *   DOMINION #3ec6b8 (teal). This table had the Vanguard BLUE and the Dominion
     *   PURPLE — so a player whose main is Zenith got a blue machine when the game
     *   would have told them their machine is gold. A save-reactive feature, wrong. */
    zenith: 0xc9a227, triage: 0xc9a227, centurion: 0xc9a227, joule: 0xc9a227, marrow: 0xc9a227,
    sovereign: 0xd4af37, terminus: 0xd4af37, halflight: 0xd4af37, chorus: 0xd4af37, kestrel: 0xd4af37,
    strigoi: 0xb8434e, lycaon: 0xb8434e, graft: 0xb8434e, khet: 0xb8434e, harrow: 0xb8434e,
    flux: 0x3ec6b8, vespra: 0x3ec6b8, ordnance: 0x3ec6b8, null: 0x3ec6b8, vyrm: 0x3ec6b8,
  };
  /* ---- THE LAST LOCAL: the bar neon on the den wall -------------------------------
   * A live game with NO presence in the house until now — the research fleet found it
   * missing. Copperhead, Montana: serve the tourists, save the bar, mind the pigs. A
   * 90s den had a beer neon on the panelling; this one says the bar's name in the
   * game's own neon (#ffd27f lettering, #ffb45e halo) over its Montana-night navy, with
   * the beer-neon cold blue for the town line. It hangs on the EAST wall, which the
   * den's resting camera faces dead-on (dot 1.0) and which was otherwise bare.
   * ⚠️ The game writes no localStorage at all, so there is nothing to read for a hint;
   * the click sets a visit flag the way the cross-origin games do. */
  var llT = canvasTex(256, 112, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    // the tube glow: draw the word three times — wide soft halo, tight halo, core
    c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "bold 30px Georgia, serif";
    c.shadowColor = "#ffb45e"; c.shadowBlur = 22; c.fillStyle = "rgba(255,180,94,0.55)";
    c.fillText("THE LAST LOCAL", w / 2, 40);
    c.shadowBlur = 9; c.fillStyle = "#ffd27f"; c.fillText("THE LAST LOCAL", w / 2, 40);
    c.shadowBlur = 0; c.fillStyle = "#fff1cc"; c.font = "bold 29px Georgia, serif"; c.fillText("THE LAST LOCAL", w / 2, 40);
    // the town line in the cold beer-neon blue
    c.font = "12px 'Courier New', monospace"; c.shadowColor = "#8fd8ff"; c.shadowBlur = 10;
    c.fillStyle = "#8fd8ff"; c.fillText("COPPERHEAD, MT \u00b7 OPEN LATE", w / 2, 80);
    c.shadowBlur = 0;
  });
  // ⚠️ BSM.x1 is the OUTER line; the east wall is a 0.12 slab whose inner face sits at
  // 3.18. Hung at x1 - 0.035 the sign was inside the plaster — every sightline from the
  // den rest hit the wall 8 cm in front of it. 3.145 puts the board 3.5 cm proud.
  var llG = new THREE.Group(); llG.position.set(3.145, BSM.fl + 1.28, 3.05); llG.rotation.y = -Math.PI / 2; add(llG);
  var llBoard = box(1.12, 0.46, 0.035, mat(0x17313a, 0.72)); llBoard.position.z = -0.018; llG.add(llBoard);   // Montana-night navy backing
  var llTube = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.46),
    new THREE.MeshStandardMaterial({ map: llT, emissive: 0xffffff, emissiveMap: llT, emissiveIntensity: 1.35,
      transparent: true, roughness: 0.6, depthWrite: false }));
  llTube.position.z = 0.004; llG.add(llTube);
  // a little varnished bar-top shelf under it, because a neon over nothing is a poster
  var llShelf = box(0.70, 0.03, 0.12, new THREE.MeshStandardMaterial({ color: 0x503620, roughness: 0.18, metalness: 0.05 }));
  llShelf.position.set(0, -0.30, 0.06); llG.add(llShelf);
  [[-0.22, 0xd69a32], [0.0, 0xe8a8b8], [0.21, 0x8fd8ff]].forEach(function (bt, bi) {   // three bottles: amber, the pig-pink, the cold blue
    var bo = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: bt[1], roughness: 0.25, transparent: true, opacity: 0.82 }));
    bo.position.set(bt[0], -0.205, 0.06); bo.rotation.y = bi * 0.7; llG.add(bo);
    var nk = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.014, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: bt[1], roughness: 0.25, transparent: true, opacity: 0.82 }));
    nk.position.set(bt[0], -0.095, 0.06); llG.add(nk);
  });
  // the light the neon actually throws — every practical in this house has one
  var llLite = new THREE.PointLight(0xffc070, 0.75, 2.8, 2.0);
  dimLights.push({ l: llLite, base: 0.75 });
  llLite.position.set(2.88, BSM.fl + 1.30, 3.05); add(llLite);
  function llGo() {
    try { localStorage.setItem("room-visited-lastlocal", "1"); } catch (e) { }
    window.location.href = "https://kylefriesmarketing.github.io/last-local/";
  }
  llG.traverse(function (m) {
    if (m.isMesh) bstag(m, "THE LAST LOCAL", llGo,
      "THE LAST LOCAL \u2014 serve the tourists, save the bar, mind the pigs. co-op, Copperhead MT \u00b7 click to clock in");
  });

  var tliSave = (function () {
    try { var rn = JSON.parse(localStorage.getItem("tli-runs") || "null"); return Array.isArray(rn) ? rn.length : 0; }
    catch (e) { return 0; }
  })();
  function makeCab(cx, cz, ry4, opts) {
    var cab = new THREE.Group(); cab.position.set(cx, BSM.fl, cz); cab.rotation.y = ry4; add(cab);
    var cabM2 = mat(0x22242c, 0.72), cabDark2 = mat(0x15161b, 0.8), cabTrim2 = mat(opts.trim, 0.5);
    var AW2 = 0.60, AD2 = 0.64;
    var kick2 = box(AW2 - 0.02, 0.10, AD2 - 0.08, cabDark2); kick2.position.y = 0.05; cab.add(kick2);
    var body2 = box(AW2, 0.78, AD2, cabM2); body2.position.y = 0.49; cab.add(body2);
    var coin2 = box(0.22, 0.14, 0.03, cabDark2); coin2.position.set(0, 0.42, AD2 / 2 + 0.005); cab.add(coin2);
    [-0.05, 0.05].forEach(function (sx2) {
      var slot2 = box(0.015, 0.045, 0.02, mat(0x0a0b0e, 0.9));
      slot2.position.set(sx2, 0.45, AD2 / 2 + 0.018); cab.add(slot2);
    });
    var deck = box(AW2, 0.045, 0.30, cabDark2);
    deck.position.set(0, 0.905, 0.26); deck.rotation.x = -0.40; cab.add(deck);
    [-0.145, 0.145].forEach(function (px3) {
      var ball2 = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), mat(0xd8d8dc, 0.35));
      ball2.position.set(px3 - 0.075, 0.965, 0.30); cab.add(ball2);
      var shaft2 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), mat(0x8a8f98, 0.4));
      shaft2.position.set(px3 - 0.075, 0.948, 0.30); cab.add(shaft2);
      for (var bi2 = 0; bi2 < 6; bi2++) {
        var btn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 12),
          mat(bi2 < 3 ? opts.btnA : opts.btnB, 0.4));
        btn2.position.set(px3 + 0.02 + (bi2 % 3) * 0.033, 0.958 + (bi2 < 3 ? 0.006 : -0.006), 0.325 - (bi2 < 3 ? 0 : 0.042));
        btn2.rotation.x = -0.40; cab.add(btn2);
      }
    });
    var scrBox = box(AW2, 0.46, 0.46, cabM2); scrBox.position.set(0, 1.15, -0.01); cab.add(scrBox);
    var scrT = canvasTex(256, 192, opts.screen);
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.345),
      new THREE.MeshStandardMaterial({ map: scrT, emissive: 0xffffff, emissiveMap: scrT, emissiveIntensity: 1.25, roughness: 0.4 }));
    scr.position.set(0, 1.16, AD2 / 2 - 0.09); scr.rotation.x = 0.10; cab.add(scr);
    var bez = box(0.52, 0.40, 0.02, cabDark2); bez.position.set(0, 1.16, AD2 / 2 - 0.105); cab.add(bez);
    var mqT = canvasTex(256, 72, opts.marquee);
    var mqBox = box(AW2, 0.18, 0.20, cabDark2); mqBox.position.set(0, 1.45, 0.14); cab.add(mqBox);
    var mq = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.145),
      new THREE.MeshStandardMaterial({ map: mqT, emissive: 0xffffff, emissiveMap: mqT, emissiveIntensity: 1.5, roughness: 0.5 }));
    mq.position.set(0, 1.45, 0.254); cab.add(mq);
    var crown2 = box(AW2 + 0.04, 0.05, AD2 - 0.04, cabTrim2); crown2.position.y = 1.565; cab.add(crown2);
    var sdT = canvasTex(128, 256, opts.side);
    [-1, 1].forEach(function (sd2) {
      var sm2 = new THREE.Mesh(new THREE.PlaneGeometry(AD2 - 0.02, 0.76),
        new THREE.MeshStandardMaterial({ map: sdT, roughness: 0.8,
          polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      sm2.position.set(sd2 * (AW2 / 2 + 0.004), 0.49, 0); sm2.rotation.y = sd2 * Math.PI / 2; cab.add(sm2);
    });
    var cl3 = new THREE.PointLight(opts.glow, 0.6, 3.0, 2);
    cl3.position.set(cx, BSM.fl + 1.05, cz + 0.62); add(cl3);
    dimLights.push({ l: cl3, base: 0.6 });
    cab.traverse(function (o) {
      if (o.isMesh) bstag(o, opts.name, function () { window.location.href = opts.url; }, opts.hint);
    });
    return cab;
  }
  var brTint2 = (brSave.top && BR_TINTS[brSave.top]) || 0xc4232f;
  makeCab(0.15, -1.88, 0.05, {
    name: "BLOODRIFT", url: "https://kylefriesmarketing.github.io/bloodrift/",
    hint: brSave.wins ? "BLOODRIFT — " + brSave.wins + " win" + (brSave.wins === 1 ? "" : "s") + " on this machine · click to fight"
                      : "BLOODRIFT — 20 fighters, four realities, one wound · click to fight",
    trim: 0x8e1526, btnA: 0xd94b52, btnB: 0xe0a83c, glow: brTint2,
    screen: function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "#1a0910"); grd.addColorStop(1, "#31060f");
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#ff5a6e"; g.lineWidth = 4; g.beginPath();
      var rx2 = w / 2; g.moveTo(rx2, 0);
      for (var y3 = 0; y3 <= h; y3 += 16) { rx2 = w / 2 + (((y3 / 16) % 2) ? 9 : -9); g.lineTo(rx2, y3); }
      g.stroke();
      g.strokeStyle = "rgba(255,150,170,0.35)"; g.lineWidth = 12; g.stroke();
      [[w * 0.26, -1], [w * 0.74, 1]].forEach(function (f4) {
        g.save(); g.translate(f4[0], h * 0.60); g.scale(f4[1], 1);
        g.fillStyle = f4[1] < 0 ? "#0d0508" : "#0a0409";
        g.beginPath(); g.arc(0, -46, 11, 0, 7); g.fill();
        g.fillRect(-13, -35, 26, 34);
        g.fillRect(-26, -30, 15, 9); g.fillRect(10, -22, 20, 8);
        g.fillRect(-15, -1, 11, 26); g.fillRect(6, -1, 11, 22);
        g.restore();
      });
      g.fillStyle = "#ffd9df"; g.textAlign = "center";
      g.font = "bold 27px Georgia, serif"; g.fillText("BLOODRIFT", w / 2, 30);
      g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, h - 26, w, 26);
      g.fillStyle = "#ffb9c4"; g.font = "bold 14px Georgia, serif";
      g.fillText(brSave.wins ? brSave.wins + " WIN" + (brSave.wins === 1 ? "" : "S") + " · INSERT COIN"
                             : "PRESS START · 20 FIGHTERS", w / 2, h - 8);
    },
    marquee: function (g, w, h) {
      g.fillStyle = "#12060a"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#" + brTint2.toString(16).padStart(6, "0");
      g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "bold 40px Georgia, serif";
      g.fillStyle = "#ffe3e8"; g.fillText("BLOODRIFT", w / 2, h / 2 + 2);
      g.strokeStyle = "#ff4d63"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(w / 2 - 7, 4); g.lineTo(w / 2 + 6, h / 2); g.lineTo(w / 2 - 5, h - 4); g.stroke();
    },
    side: function (g, w, h) {
      g.fillStyle = "#1b1d24"; g.fillRect(0, 0, w, h);
      var gr2 = g.createLinearGradient(0, 0, w, h);
      gr2.addColorStop(0, "rgba(196,35,47,0.75)"); gr2.addColorStop(1, "rgba(90,12,26,0.2)");
      g.fillStyle = gr2;
      g.beginPath(); g.moveTo(w * 0.5, 0);
      for (var y4 = 0; y4 <= h; y4 += 22) g.lineTo(w * (0.5 + (((y4 / 22) % 2) ? 0.16 : -0.16)), y4);
      for (var y5 = h; y5 >= 0; y5 -= 22) g.lineTo(w * (0.5 + (((y5 / 22) % 2) ? 0.30 : -0.30)), y5);
      g.closePath(); g.fill();
    },
  });
  makeCab(1.35, -1.88, -0.05, {
    name: "THE LAST ISSUE", url: "https://kylefriesmarketing.github.io/the-last-issue-demo/",
    hint: tliSave ? "THE LAST ISSUE — " + tliSave + " issue" + (tliSave === 1 ? "" : "s") + " printed · make another"
                  : "THE LAST ISSUE — build your own superhero, one issue at a time",
    trim: 0xb88a1e, btnA: 0xe0b03a, btnB: 0xc0392b, glow: 0xe8b93a,
    screen: function (g, w, h) {
      g.fillStyle = "#b4302c"; g.fillRect(0, 0, w, h);          // the cover red
      g.fillStyle = "rgba(255,255,255,0.10)";                    // halftone field
      for (var hd2 = 0; hd2 < 220; hd2++) g.fillRect((hd2 * 29) % w, (hd2 * 41) % h, 2, 2);
      g.fillStyle = "#1a1a22";                                   // the skyline
      for (var sk3 = 0; sk3 < 7; sk3++) g.fillRect(sk3 * 38 - 6, h - 44 - (sk3 * 17 % 38), 30, 60);
      g.save(); g.translate(w * 0.52, h * 0.52);                 // the hero, mid-fall
      g.fillStyle = "#0d0d14";
      g.beginPath(); g.arc(0, -24, 9, 0, 7); g.fill();
      g.fillRect(-10, -16, 20, 26);
      g.fillRect(-24, -14, 15, 7); g.fillRect(9, -10, 18, 7);
      g.fillRect(-12, 10, 9, 20); g.fillRect(4, 10, 9, 18);
      g.beginPath(); g.moveTo(-10, -14); g.lineTo(-30, 10); g.lineTo(-6, 6); g.closePath(); g.fill(); // the cape
      g.restore();
      g.fillStyle = "#e6c34a"; g.fillRect(0, 6, w, 30);          // the masthead bar
      g.fillStyle = "#1a1a22"; g.textAlign = "center";
      g.font = "bold 21px Georgia, serif"; g.fillText("THE LAST ISSUE", w / 2, 28);
      g.fillStyle = "#f2ead6"; g.fillRect(6, 44, 34, 24);        // the corner box
      g.fillStyle = "#1a1a22"; g.font = "bold 12px Georgia, serif"; g.fillText("No.1", 23, 60);
      g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, h - 26, w, 26);
      g.fillStyle = "#ffe9b0"; g.font = "bold 14px Georgia, serif";
      g.fillText(tliSave ? tliSave + " ISSUE" + (tliSave === 1 ? "" : "S") + " · INSERT COIN"
                         : "PRESS START · MAKE A HERO", w / 2, h - 8);
    },
    marquee: function (g, w, h) {
      g.fillStyle = "#e6c34a"; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(180,48,44,0.9)";                       // burst rays
      for (var br3 = 0; br3 < 12; br3++) {
        g.save(); g.translate(w / 2, h / 2); g.rotate(br3 / 12 * Math.PI * 2);
        g.fillRect(46, -3, 96, 6); g.restore();
      }
      g.fillStyle = "rgba(26,26,34,0.16)";
      for (var hd3 = 0; hd3 < 90; hd3++) g.fillRect((hd3 * 37) % w, (hd3 * 23) % h, 2, 2);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "bold 30px Georgia, serif";
      g.strokeStyle = "#1a1a22"; g.lineWidth = 5; g.strokeText("THE LAST ISSUE", w / 2, h / 2 + 2);
      g.fillStyle = "#f2ead6"; g.fillText("THE LAST ISSUE", w / 2, h / 2 + 2);
    },
    side: function (g, w, h) {
      g.fillStyle = "#1a1a22"; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(230,195,74,0.8)";
      for (var br4 = 0; br4 < 9; br4++) {
        g.save(); g.translate(w / 2, h * 0.32); g.rotate(br4 / 9 * Math.PI * 2);
        g.fillRect(20, -4, 90, 8); g.restore();
      }
      g.fillStyle = "#b4302c";
      g.beginPath(); g.arc(w / 2, h * 0.32, 22, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,0.12)";
      for (var hd4 = 0; hd4 < 160; hd4++) g.fillRect((hd4 * 31) % w, h * 0.6 + (hd4 * 17) % (h * 0.4), 2, 2);
    },
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

  /* ---- TOYBOX: LAST WATCH — the towers, still standing where they were left ---
   * The game is toy soldiers holding a line across a bedroom floor, so down here it
   * is exactly that: the playmat unrolled, block towers on the corners, and the men
   * facing the gap. Set up on the floor rather than a table on purpose — this is a
   * game that got played where there was room for it. */
  var lwSave = (function () {
    try {
      var pr = JSON.parse(localStorage.getItem("lw-prefs") || "null"), best = 0, maps = 0;
      /* ⚠️ lw-prefs.mapBests holds {wave, won} OBJECTS, not numbers. Math.max against
       * an object yields NaN, and NaN poisons every later comparison — so the prop's
       * hint reported a best of 0 no matter how far you had ever got. Tolerate a bare
       * number too: this key has already changed shape once. */
      if (pr && pr.mapBests) for (var k in pr.mapBests) { maps++;
        var mv = pr.mapBests[k]; best = Math.max(best, (typeof mv === 'number' ? mv : (mv && mv.wave)) || 0); }
      return { best: best, maps: maps };
    } catch (e) { return { best: 0, maps: 0 }; }
  })();
  /* ⚠️⚠️ THE LALLY COLUMN STOOD DEAD IN FRONT OF THIS. Measured from the resting eye
   * at (-5.30, -0.82, 3.30): the bearing to the pole is -20.8 degrees and the bearing
   * to the diorama was -21.0 — two tenths of a degree apart — so 15 of its 37 meshes,
   * the playmat and soldiers and towers among them, sat behind a 5.5 cm post.
   * ⚠️ THE OBVIOUS FIX DOES NOTHING: sliding it along that line (to -0.75, 1.55, say)
   * leaves the bearing IDENTICAL, because both points share the same slope from the
   * eye — the move has to be ACROSS the sightline, not along it. The diorama subtends
   * about 8.5 degrees at this range and the pole about 1, so it needs roughly 9.5 to
   * clear; this spot gives 9.2 at 4.24 m, which is the same distance as before so it
   * still reads the same size. */
  var lwG = new THREE.Group(); lwG.position.set(-1.15, BSM.fl, 2.45); lwG.rotation.y = -0.30; add(lwG);
  /* ⚠️ the old mat was flat #4a6a4e with one faint squiggle — colours that match
   * NOTHING in the game. Everything here is the game's own print (field.js:157-199,
   * data.js:24-48): felt #7bb661 shaded −16% at the edges, speckle so it reads as
   * felt not vinyl, the road as a #d9c49c under-print with a #f5e6ca surface and a
   * dashed white centre line, entering at 'the gap under the bed', snaking twice,
   * ending at the toy chest; dashed build-pad rings; one pond #71afd6. */
  var lwMatT = canvasTex(256, 196, function (c, w, h) {
    c.fillStyle = "#7bb661"; c.fillRect(0, 0, w, h);
    for (var sp6 = 0; sp6 < 850; sp6++) {   // felt speckle
      c.fillStyle = sp6 % 2 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
      c.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }
    var ed6 = c.createRadialGradient(w / 2, h / 2, h * 0.30, w / 2, h / 2, h * 0.74);
    ed6.addColorStop(0, "rgba(0,0,0,0)"); ed6.addColorStop(1, "rgba(18,30,14,0.30)");
    c.fillStyle = ed6; c.fillRect(0, 0, w, h);
    // the pond, off the road
    c.fillStyle = "#71afd6"; c.beginPath(); c.ellipse(214, 44, 17, 11, -0.2, 0, 7); c.fill();
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5; c.stroke();
    // the road: enters at the left edge, loops twice, ends at the chest
    function road6() {
      c.beginPath(); c.moveTo(-4, 158);
      c.bezierCurveTo(56, 150, 66, 112, 126, 112);
      c.bezierCurveTo(192, 112, 206, 152, 234, 142);
      c.bezierCurveTo(254, 134, 242, 96, 196, 84);
      c.bezierCurveTo(148, 72, 96, 98, 76, 66);
      c.bezierCurveTo(62, 42, 106, 30, 128, 26);
      c.stroke();
    }
    c.lineCap = "round"; c.lineJoin = "round";
    c.strokeStyle = "#d9c49c"; c.lineWidth = 20; road6();   // under-print
    c.strokeStyle = "#f5e6ca"; c.lineWidth = 17; road6();   // surface
    c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 1.6; c.setLineDash([6, 5]); road6(); c.setLineDash([]);
    // build pads: dashed rings beside the road, where the towers go
    c.strokeStyle = "rgba(255,255,255,0.38)"; c.lineWidth = 1.6; c.setLineDash([4, 4]);
    [[58, 122], [166, 58], [208, 170]].forEach(function (bp6) {
      c.beginPath(); c.arc(bp6[0], bp6[1], 10, 0, 7); c.stroke();
    });
    c.setLineDash([]);
  });
  lwMatT.colorSpace = THREE.SRGBColorSpace;
  var lwMat = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.94),
    new THREE.MeshStandardMaterial({ map: lwMatT, roughness: 0.97, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  lwMat.rotation.x = -Math.PI / 2; lwMat.position.y = 0.006; lwG.add(lwMat);
  var blockCols = [0xc4553f, 0x3f6bb0, 0xe0b23a, 0x4f9a5e];
  [[-0.44, -0.30, 4], [0.42, -0.26, 3], [-0.38, 0.32, 3], [0.46, 0.30, 5]].forEach(function (tw, ti) {
    for (var bl = 0; bl < tw[2]; bl++) {
      var blk = box(0.10, 0.055, 0.10, mat(blockCols[(ti + bl) % 4], 0.75));
      // ⚠️ the mat is at y 0.006 and the bottom block sat at 0.0005, so the whole
      // base course was buried. Same +0.006 the soldiers needed; measured, not guessed.
      blk.position.set(tw[0] + (bl % 2 ? 0.008 : -0.006), 0.034 + bl * 0.056, tw[1] + (bl % 3 ? -0.005 : 0.007));
      blk.rotation.y = (bl * 0.13) - 0.1; lwG.add(blk);
    }
  });
  // the men: two ranks facing the gap between the towers, one already down
  [[-0.16, -0.06, 0], [-0.02, -0.10, 0.2], [0.12, -0.05, -0.15],
   [-0.10, 0.10, 3.0], [0.06, 0.13, 3.2]].forEach(function (mn) {
    // ⚠️ the playmat is a plane at y 0.006 and each base is 0.006 thick standing on
    // y 0 — so all five bases were exactly at or under the mat, five meshes drawing
    // nothing. The man stands ON the mat, not in it.
    var man = new THREE.Group(); man.position.set(mn[0], 0.006, mn[1]); man.rotation.y = mn[2]; lwG.add(man);
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.006, 10), mat(0x4e6a3e, 0.85));
    base.position.y = 0.003; man.add(base);
    var bodyM = box(0.016, 0.044, 0.011, mat(0x4e6a3e, 0.85)); bodyM.position.y = 0.028; man.add(bodyM);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.009, 7, 6), mat(0x4e6a3e, 0.85));
    head.position.y = 0.057; man.add(head);
    var rifle = box(0.004, 0.004, 0.030, mat(0x3c5230, 0.85));
    rifle.position.set(0.010, 0.036, 0.012); rifle.rotation.x = 0.5; man.add(rifle);
  });
  /* ⚠️ 'one already down' — and then it was stood back UP. The standing man is
   * box(0.016, 0.044, ...); this one swaps x and y, so it is ALREADY lying down, and
   * the rotation.z of π/2 rotated it upright again into a 4.4 cm post. Drop the z
   * turn, keep the yaw, and lift it clear of the mat like the others. */
  var fallen = box(0.044, 0.016, 0.011, mat(0x4e6a3e, 0.85));
  fallen.position.set(0.24, 0.014, 0.04); fallen.rotation.set(0, 0.6, 0.10); lwG.add(fallen);
  // the toy chest at the end of the road — CHEST_HP is the loss condition (data.js:15)
  var lwChest = box(0.045, 0.028, 0.028, mat(0x7a5230, 0.8));
  lwChest.position.set(0, 0.020, -0.40); lwChest.rotation.y = 0.06; lwG.add(lwChest);
  var lwChestLid = box(0.047, 0.008, 0.030, mat(0x8a6242, 0.8));
  lwChestLid.position.set(0, 0.038, -0.40); lwChestLid.rotation.y = 0.06; lwG.add(lwChestLid);
  var lwLatch = box(0.006, 0.008, 0.003, mat(0xe0b23a, 0.5));
  lwLatch.position.set(0, 0.026, -0.385); lwG.add(lwLatch);
  // the Domino Wall — 'three dominoes, standing where you drew them' (data.js:369),
  // white slab #f2efe6 with the near-black band #2a2430 (view.js:167-170)
  [[0.08, 0.020, -0.35], [0.115, 0.043, -0.28], [0.15, 0.066, -0.21]].forEach(function (dm6) {
    var dom6 = box(0.017, 0.025, 0.0055, mat(0xf2efe6, 0.6));
    dom6.position.set(dm6[0], 0.0185, dm6[2]); dom6.rotation.y = dm6[1] * 12; lwG.add(dom6);
    var band6 = box(0.0175, 0.004, 0.006, mat(0x2a2430, 0.6));
    band6.position.set(dm6[0], 0.0185, dm6[2]); band6.rotation.y = dm6[1] * 12; lwG.add(band6);
  });
  // ⚠️ traverse, not children: each soldier is a GROUP of four little meshes, so a
  // pass over direct children tagged the mat and the blocks and skipped every man.
  lwG.traverse(function (m) {
    if (m.isMesh) bstag(m, "TOYBOX: LAST WATCH", function () { window.location.href = "https://kylefriesmarketing.github.io/last-watch/"; },
      lwSave.best
        ? "TOYBOX: LAST WATCH — furthest wave " + lwSave.best + ". the line held that long. click to stand it again"
        : "TOYBOX: LAST WATCH — the toys hold the line until morning, and kills pay marbles. click to take the watch");
  });

  /* ---- THE HAUNT: the box that only comes up once a year ----------------------
   * It lives in the basement eleven months of the year, which is the only honest
   * place for it. Flaps open because somebody was looking for the good skull. */
  var hauntSave = (function () {
    try { var m = JSON.parse(localStorage.getItem("haunt-save") || "null");
      return m ? { nights: m.nights || 0, guests: m.seasonGuests || 0 } : { nights: 0, guests: 0 };
    } catch (e) { return { nights: 0, guests: 0 }; }
  })();
  /* ⚠️ under the ping-pong table (Kyle) — which is where a box of decorations
   * actually ends up, and it is the one bit of floor in the den that is permanently
   * spoken for. The table top sits at y 0.76 with 2.45 x 1.36 of clearance under it,
   * and the box is 0.44 tall with its flaps reaching 0.58, so it fits with room to
   * spare. Nudged off the table's centre line so it reads as shoved under rather
   * than placed. */
  var hxG = new THREE.Group(); hxG.position.set(-2.38, BSM.fl, -0.62); hxG.rotation.y = -0.42; add(hxG);
  var cardM = mat(0xb99a6e, 0.95), cardDk = mat(0x9d8058, 0.95);
  var hxBody = box(0.60, 0.40, 0.44, cardM); hxBody.position.y = 0.20; hxG.add(hxBody);
  [[-0.31, 0.44, 0, 0.5], [0.31, 0.44, 0, -0.5]].forEach(function (fl) {   // flaps thrown open
    var flap = box(0.02, 0.28, 0.42, cardDk);
    flap.position.set(fl[0], fl[1], fl[2]); flap.rotation.z = fl[3]; hxG.add(flap);
  });
  var hxLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshStandardMaterial({
    map: canvasTex(256, 90, function (c, w, h) {
      c.fillStyle = "#e8e2cf"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#3a2f22"; c.font = "bold 44px Georgia, serif"; c.textAlign = "center";
      c.fillText("HALLOWEEN", w / 2, 58);
    }), roughness: 0.95 }));
  hxLabel.position.set(0, 0.22, 0.222); hxG.add(hxLabel);
  var skull = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), mat(0xe6e0cc, 0.7));
  skull.scale.set(1, 1.08, 0.92); skull.position.set(0.16, 0.46, 0.06); hxG.add(skull);
  var jaw = box(0.10, 0.03, 0.07, mat(0xdcd5bf, 0.7)); jaw.position.set(0.16, 0.395, 0.075); hxG.add(jaw);
  /* ⚠️ BOTH EYES WERE SEALED INSIDE THE SKULL. Normalised against the ellipsoid
   * (semi-axes 0.075/0.081/0.069 after the scale), the old centres summed to 0.275 —
   * a quarter of the way out, so two whole meshes rendered nowhere. They sit ON the
   * surface now, along a forward-and-slightly-up direction, so a hemisphere of each
   * shows. Anything placed by eye inside a SCALED sphere wants this check. */
  [[-0.0225, 0.013, 0.0649], [0.0225, 0.013, 0.0649]].forEach(function (ey) {
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), mat(0x1b1a18, 0.9));
    eye.position.set(0.16 + ey[0], 0.46 + ey[1], 0.06 + ey[2]); hxG.add(eye);
  });
  // the string of lights, half of it still in the box
  var lampC = [0xff8a2b, 0x8a4fd0, 0x2bd07a];
  for (var lb = 0; lb < 9; lb++) {
    var t2 = lb / 8;
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6),
      new THREE.MeshStandardMaterial({ color: lampC[lb % 3], emissive: lampC[lb % 3], emissiveIntensity: 0.55, roughness: 0.5 }));
    lamp.position.set(-0.34 - t2 * 0.44, 0.44 - t2 * 0.40 + Math.sin(t2 * 3.1) * 0.05, 0.02 + t2 * 0.20);
    /* ⚠️ THE HALLOWEEN BOX IGNORED THE CALENDAR IT IS LITERALLY ABOUT. MONTH is
     * declared at this function's top level and the module already uses it three
     * times as a real prop swap — the closet's seasonal coats, the December wreath.
     * In October the string is UP; the rest of the year it is a box of dark bulbs. */
    lamp.material.emissiveIntensity = MONTH === 10 ? 1.15 : 0.22;
    hxG.add(lamp);
  }
  /* ⚠️ nine emissive bulbs and not one PointLight — the only emissive practical in
   * the basement without one, against five of five everywhere else in the room. An
   * emissive material lights nothing; it just looks bright. Parented to hxG so they
   * ride the group, and kept to 1.1-1.5 m so they stay under the ping-pong table
   * instead of washing the den. */
  var hxOct = MONTH === 10 ? 1 : 0.28;   // the lights answer the month too, or they lie
  var hxLite = new THREE.PointLight(0xff8a2b, 0.9 * hxOct, 1.5, 2); hxLite.position.set(-0.55, 0.30, 0.12); hxG.add(hxLite);
  var hxLite2 = new THREE.PointLight(0x8a4fd0, 0.5 * hxOct, 1.1, 2); hxLite2.position.set(-0.20, 0.42, 0.05); hxG.add(hxLite2);
  dimLights.push({ l: hxLite, base: 0.9 * hxOct }, { l: hxLite2, base: 0.5 * hxOct });
  var bat = box(0.18, 0.01, 0.07, mat(0x211f26, 0.85));
  bat.position.set(-0.12, 0.455, -0.16); bat.rotation.set(0.1, 0.4, 0.16); hxG.add(bat);
  /* the three artefacts of running the place (every colour from the-haunt source):
   * the polaroid off the wall of got-got (ui.js:218-254 — cream #f4efe2 frame, flash
   * over #0c0a14, 'the scream barn' caption), the walkie the narrator lives in
   * (ui.js:31-32 — amber #b8924a on near-black), and the marquee with three letters
   * left: 'SCM' in 0xffdca0 (view.js:252-254). The marquee glows by the month like
   * the light string above. */
  var hxPol = new THREE.Mesh(new THREE.PlaneGeometry(0.089, 0.111), new THREE.MeshStandardMaterial({
    roughness: 0.85, map: canvasTex(96, 120, function (c, w, h) {
      c.fillStyle = "#f4efe2"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#0c0a14"; c.fillRect(8, 8, w - 16, h - 40);
      var fl6 = c.createRadialGradient(w / 2, 42, 3, w / 2, 42, 34);
      fl6.addColorStop(0, "rgba(255,252,240,0.95)"); fl6.addColorStop(1, "rgba(255,252,240,0)");
      c.fillStyle = fl6; c.fillRect(8, 8, w - 16, h - 40);
      [["#3a2c4a", 30], ["#4a2c2c", 47], ["#2c3a4a", 64]].forEach(function (fg6) {   // the got-got
        c.fillStyle = fg6[0]; c.fillRect(fg6[1], 44, 9, 18);
        c.fillStyle = "#d8b894"; c.beginPath(); c.arc(fg6[1] + 4.5, 40, 4, 0, 7); c.fill();
      });
      c.fillStyle = "#3a3428"; c.font = "italic 10px cursive"; c.textAlign = "center";
      c.fillText("the scream barn", w / 2, h - 20);
      c.fillStyle = "#6a6252"; c.font = "8px cursive";
      c.fillText('"AAAAAA" — everyone', w / 2, h - 8);
    }) }));
  hxPol.position.set(0.05, 0.062, 0.247); hxPol.rotation.x = -0.16; hxPol.rotation.z = 0.05; hxG.add(hxPol);
  var hxWk = box(0.05, 0.16, 0.03, mat(0x0a0805, 0.75));
  hxWk.position.set(-0.10, 0.48, 0.14); hxWk.rotation.y = 0.25; hxG.add(hxWk);
  var hxWkGrille = box(0.036, 0.05, 0.004, mat(0xb8924a, 0.6));
  hxWkGrille.position.set(-0.098, 0.51, 0.156); hxWkGrille.rotation.y = 0.25; hxG.add(hxWkGrille);
  var hxWkAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), mat(0x1b1a18, 0.7));
  hxWkAnt.position.set(-0.115, 0.60, 0.135); hxG.add(hxWkAnt);
  var hxMarqT = canvasTex(192, 48, function (c, w, h) {
    c.fillStyle = "#150e08"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffdca0"; c.font = "bold 26px 'Courier New', monospace"; c.textAlign = "center";
    c.shadowColor = "#ffdca0"; c.shadowBlur = 10;
    c.fillText("S C M", w / 2, 26); c.shadowBlur = 0;
    c.fillStyle = "#e8dcc0"; c.font = "9px 'Courier New', monospace";
    c.fillText("the scream barn · route 9 · hazel park", w / 2, 41);
  });
  var hxMarq = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.015), new THREE.MeshStandardMaterial({
    color: 0x2a1c10, roughness: 0.85, map: hxMarqT, emissiveMap: hxMarqT, emissive: 0xffffff,
    emissiveIntensity: 0.9 * hxOct }));
  hxMarq.position.set(-0.22, 0.10, 0.27); hxMarq.rotation.x = -0.35; hxMarq.rotation.y = 0.10; hxG.add(hxMarq);
  /* ⚠️ this used to be a hand-written list of five meshes out of eighteen, so the two
   * FLAPS — the pieces whose whole job is to say 'this box is open' — and the entire
   * light string were invisible to the raycaster. A hand-written list goes stale the
   * moment anybody adds a mesh; traverse the group, the way its neighbour already does. */
  hxG.traverse(function (m) {
    if (!m.isMesh) return;
    bstag(m, "THE HAUNT", function () { window.location.href = "https://kylefriesmarketing.github.io/the-haunt/"; },
      hauntSave.nights
        ? "THE HAUNT — " + hauntSave.nights + " nights run. click to open the gate again"
        : "THE HAUNT — you run the haunted house. timing is the whole trick. click to open");
  });
  // light: a warm floor lamp by the couch, and a bare bulb over the stairs
  var lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.35, 8), mat(0x8a6a44, 0.7));
  lampPole.position.set(1.85, BSM.fl + 0.675, 3.85); add(lampPole);
  var lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.24, 12, 1, true), mat(0xd8b46a, 0.8));
  lampShade.position.set(1.85, BSM.fl + 1.42, 3.85); add(lampShade);
  var bsLamp = new THREE.PointLight(0xffd9a0, 2.1, 5.2, 1.8);
  bsLamp.position.set(1.85, BSM.fl + 1.3, 3.85); add(bsLamp);
  dimLights.push({ l: bsLamp, base: 2.1 });
  bstag(lampShade, "the lamp", null, "the click of it is the sound of the evening starting.");
  var bsBulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 1.4, roughness: 0.4 }));
  bsBulb.position.set(-6.97, BSM.ce - 0.28, 2.35); add(bsBulb);
  var bsStairLite = new THREE.PointLight(0xffe0b0, 1.25, 3.9, 1.8);
  bsStairLite.position.set(-6.97, BSM.ce - 0.35, 2.35); add(bsStairLite);
  dimLights.push({ l: bsStairLite, base: 1.25 });
  var bsUpHit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 1.3),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  bsUpHit.position.set(-6.9, BSM.fl + 0.95, 2.3); add(bsUpHit);
  clickable(bsUpHit, "the stairs up", function () { leaveBasement(); }, "back up to the hall — mind the low bit");
  bsUpHit.userData.space = "basement";
  // the den breathes: static crawls, fish patrol, the tank light sways
  function bsmTick(t) {
    if (crtOn) {
      staticT.offset.y = (t * 3.1) % 1;   // wraps because staticT is RepeatWrapping — see its declaration
      crtScr.material.emissiveIntensity = 0.62 + Math.sin(t * 23) * 0.08 + Math.sin(t * 7.3) * 0.05;
      tvLite.intensity = 0.5 + Math.sin(t * 19) * 0.08;
    }
    for (var af2 = 0; af2 < aqFish.length; af2++) {
      var fo2 = aqFish[af2];
      fo2.m.position.x = 2.82 + Math.sin(t * 0.5 + fo2.ph) * 0.28;
      fo2.m.rotation.y = Math.cos(t * 0.5 + fo2.ph) > 0 ? 0 : Math.PI;
    }
    if (aqLite.intensity > 0) aqLite.intensity = 1.1 + Math.sin(t * 1.3) * 0.12;
  }
  var crtOn = true;
  function setCrt(on3) {
    crtOn = !!on3;
    crtScr.material.emissiveIntensity = crtOn ? 0.7 : 0.0;
    crtScr.material.color.setHex(crtOn ? 0x8a8f96 : 0x14161a);
    tvLite.intensity = crtOn ? 0.5 : 0;   // not .visible — see setPoolLight
  }
  function setTank(mode3) {   // 0 green · 1 blue · 2 lights out
    var col = mode3 === 1 ? 0x7fb4e8 : 0x77d9a8;
    aqLite.intensity = mode3 !== 2 ? 1.1 : 0;   // not .visible — see setPoolLight
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
  /* ================= THE HOUSE GETS REAL ART (2026-08-29, ~24cr) =================
   * The bedroom always looked better than the rest of the house for one measurable
   * reason: hallway.js referenced assets/ ZERO times — every surface out here was
   * procedural canvas paint. These are generated textures for the twelve biggest
   * surfaces, palette-matched to each canvas painter's own hexes so every tint,
   * LOOK lerp and phase grade composes exactly as before.
   * HOW THE SWAP WORKS — and why it is this and not new materials: each image is
   * drawn INTO the texture's existing canvas. The canvas IS the texture's Source,
   * and every clone (paperWallM / lawnM / blockM / plankWallM all clone) shares it,
   * so ONE draw updates every wall panel at its own calibrated repeat. No material
   * is created, so LOOK_MATS stays complete and the paint system never notices.
   * ⚠️ the canvas is RESIZED to the image (256 -> 512): sharper, same object.
   * ⚠️ materials with a DERIVED bump (bumpFrom snapshots the canvas at build)
   * get their bump REGENERATED, or the old procedural board-edges ghost under the
   * new art as phantom relief.
   * ⚠️ fetched OUTSIDE the boot counter on purpose: the house is hidden while
   * the door card is up, so these streaming in late is invisible, and the door
   * must not wait on 640 KB of wallpaper. A 404 simply keeps the procedural paint.
   * ⚠️ palette rule for future additions: match the PAINTER's colours, not the
   * rendered ones — tints multiply on top and must keep meaning the same thing. */
  var HOUSE_ART = [
    ["hwall", hwallT], ["plank", plankT], ["runner", runT], ["lino", linoT],
    ["kwall", kWallT], ["tile", tileT], ["side", sideT], ["grass", grassT],
    ["deck", deckT], ["cinder", cinderT], ["panel", panelT], ["garfloor", garFloorT],
    // batch 2 (2026-08-29): garage walls, chimney brick, front walk, road, cabinets.
    // oak ships with its baked knob CROPPED OFF: oakM stretches ONE tile across long
    // upper-cabinet runs, and a stretched knob reads as a dinner plate.
    ["garwall", garWallT], ["brick", brickT], ["conc", concT], ["asph", asphT], ["oak", oakT],
  ];
  function houseArtSwap(tex, img) {
    var cv = tex.image;
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext("2d").drawImage(img, 0, 0);
    tex.needsUpdate = true;
    /* ⚠️⚠️ NUDGE CONSUMERS FOUND BY SCENE TRAVERSE, NOT A REGISTRY. The first
     * version walked LOOK_MATS — and for TWO of the twelve textures the art NEVER
     * REACHED THE SCREEN, silently: linoT's and tileT's only consumers are ground()
     * clones, and ground() never joins LOOK_EXTRA. r160 only re-uploads a texture
     * whose OWN version changed while bound (setTexture2D gates on
     * texture.version !== __version before the shared-Source check is even reached),
     * so a canvas swap the bound clones were never told about draws the OLD pixels
     * forever — no error, and the canvas itself reads back as swapped. The kitchen
     * floor and backsplash shipped exactly that way and the review caught it.
     * The traverse finds every rendered material whatever list it lives in, and it
     * also catches the bump-cloned landing pieces and livFloorM, which are in NO
     * registry at all. A registry is a claim; the scene is the truth. */
    var touched = 0;
    scene.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        if (!m.map || m.map.image !== cv) return;
        m.map.needsUpdate = true; touched++;
        if (m.bumpMap && m.bumpMap.image !== cv) {
          var nb = bumpFrom(m.map, 1.7);
          if (nb) { nb.repeat.copy(m.map.repeat); nb.offset.copy(m.map.offset); m.bumpMap = nb; }
        }
      });
    });
    // and the unrendered base + registry entries, so a later consumer starts fresh
    LOOK_MATS.forEach(function (m) {
      if (m.map && m.map.image === cv) m.map.needsUpdate = true;
    });
    return touched;
  }
  HOUSE_ART.forEach(function (pair) {
    var img = new Image();
    img.onload = function () { try { houseArtSwap(pair[1], img); } catch (e) { } };
    img.src = "assets/tex/house/" + pair[0] + ".jpg";
  });
  var LOOK_MATS = [hwallM, plankM, runner.material, oakM, kWallM, lamM,
                   sidingM, grassM, deckM, bFenceM, pdeckM,
                   garWallM, garFloorM, benchM, poolConcM, panelM,
    // ⚠️ the reward retinted the whole house EXCEPT the two newest rooms: the living
    // room's walls and the landing's were never in the list, so the paint stopped at
    // two doorways. All three are declared at function scope, so LOOK_BASE captures
    // their base hex on the next line with no other change.
    livWallM, upWallM, upFloorM]
    // ⚠️ the per-panel materials paperWallM/lawnM/blockM/plankWallM build at construction
    // time. Without this the looks would repaint the house and stop dead at every
    // wall and every blade of grass — the same failure the note above records.
    .concat(LOOK_EXTRA);
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
    krest: new THREE.Vector3(-8.55, 1.60, -0.60),   // standing in the kitchen, by the fridge
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
    /* ⚠️⚠️ AND A THIRD WAY TO LOOK, because the back yard only ever had two and both
     * of them face EAST-ish. Projecting each prop's centre from the resting eye at
     * Kyle's aspect, facing "pool" and facing "house":
     *     the pool, the tiki torches   IN frame on pool
     *     the grill                    IN frame on house
     *     THE KILN                     out on both (ndc x -0.71 and -2.34)
     *     CLEAN THE ZOO                out on both (-1.94, -25.05)
     *     the slip 'n slide            out on both
     * The entire west half of the yard — the kiln, the zoo, the slide, the washing
     * line — was content nobody could turn toward, which is why Kyle could see every
     * other new game and not this one. The turn is a three-cycle now. */
    blookW: new THREE.Vector3(-13.60, 0.80, 13.10),  // and west: the kiln, the zoo, the line
    bdoor1: new THREE.Vector3(-5.34, 1.66, 7.85),   // squared up to the slider's clear pane
    bdoor2: new THREE.Vector3(-5.34, 1.58, 9.35),   // in the opening
    bdoorL: new THREE.Vector3(-3.20, 0.55, 14.6),   // what you see through it: the glow
    /* ---- up ---- the climb needs waypoints ON the treads, not a straight line from
     * the bottom of the hall to the top of the house: a two-point lerp cuts the corner
     * of the switchback and goes through the ceiling slab beside the void. */
    /* ⚠️ you walk PAST the flight and board it at the bottom, which is at the NORTH
     * end because it climbs south. A path straight from the hall to the foot goes
     * through every tread on the way. */
    // ⚠️ these five follow STAIR_X. The flight is on the WEST wall now, so the
    // approach comes from the EAST side of the hall instead of crossing it.
    up1: new THREE.Vector3(-5.00, 1.70, 6.10),      // out into the hall, facing the foot
    up2: new THREE.Vector3(-6.60, 1.70, 7.10),      // squared onto the bottom tread
    up3: new THREE.Vector3(-6.95, 2.55, 6.00),      // a few treads up
    up4: new THREE.Vector3(-6.95, 3.95, 4.40),      // halfway
    /* ⚠️ THE WAY BACK DOWN HAS TO BE ON SCREEN FROM HERE. Standing at the stair head
     * (x -6.95) the stairwell is 88 degrees off the corridor view — measured, the
     * down-hitbox drew ZERO pixels at rest and only appeared at full mouse deflection,
     * in the extreme corner, and never at all once you turned east. That is a room you
     * cannot leave. Stepping east to the hall centreline puts the opening in the lower
     * left of the resting view: 220 sampled rays land on it, closest at screen
     * (-0.44, -0.02). Swept x -6.95..-4.60 by z 1.60..2.00; this is the best cell. */
    uprest: new THREE.Vector3(-5.90, 5.07, 1.80),   // off the top and out onto the landing
    uplook: new THREE.Vector3(-15.60, 4.55, 1.60),  // down the corridor, west
    uplookB: new THREE.Vector3(2.60, 4.55, 1.60),   // and the other way, east
    upL1: new THREE.Vector3(-6.95, 2.20, -3.30),    // what you see on the way up: straight up the flight
    upL2: new THREE.Vector3(-8.60, 4.70, 1.70),
    /* the three rooms share ONE set of keyframes, rewritten on the way in - they
     * differ only by x, so three fixed sets would be the same numbers typed out three
     * times and wrong in one of them. */
    rd1: new THREE.Vector3(0, 0, 0), rd2: new THREE.Vector3(0, 0, 0),
    rrest: new THREE.Vector3(0, 0, 0), rlook: new THREE.Vector3(0, 0, 0),
    rlookB: new THREE.Vector3(0, 0, 0), rmid: new THREE.Vector3(0, 0, 0),
    ldoor1: new THREE.Vector3(-6.30, 1.66, 1.91),   // squared up to the living room door, hall side
    ldoor2: new THREE.Vector3(-7.60, 1.62, 1.91),   // in the doorway
    // ⚠️ these AIM AT THE FURNITURE, which sounds obvious and was not: the seating
    // group moved to the west half so the set would stop standing in front of the
    // window, and the camera was left looking east at the empty half of the floor.
    ldoorL: new THREE.Vector3(-11.60, 1.15, 2.60),   // what you see through it: the set
    // ⚠️ look ALONG the room, not across it. The couch is on the north wall and the
    // set on the south, so any camera standing between them frames one and puts the
    // other behind its own head. From the east end looking west both are in shot.
    lrest:  new THREE.Vector3(-8.95, 1.62, 2.30),    // the east end of the room
    llook:  new THREE.Vector3(-16.80, 1.08, 2.30),   // straight down it: couch, set, lamp
    llookB: new THREE.Vector3(-7.40, 1.34, 1.95),   // turned round: the way back to the hall
    grest: new THREE.Vector3(-7.92, 1.64, 4.68),    // the corner the door swing keeps clear
    glook: new THREE.Vector3(-11.70, 1.30, 7.55),   // down the long diagonal: pegboard, bench, tarp
    glookB: new THREE.Vector3(-7.40, 1.15, 5.70),   // turned round: the door back to the hall
    /* ⚠️ CORNER-CUTTING IS WHAT PUTS A CAMERA IN A WALL. Going straight from the
     * doorway to grest crosses the jamb (a solid slab at x -7.75..-7.55, z 4.2..5.08)
     * and the door beside it, because the turn south starts before the camera is
     * actually through the opening. gmid holds it on the doorway's own line until
     * it is inside, and only then does it swing round to the resting corner. */
    gmid: new THREE.Vector3(-7.95, 1.63, 5.52),     // through first, THEN turn
    /* ⚠️ THERE WAS A cellarT HERE AT z 1.36 AND IT WAS WRONG. I added it believing
     * the stairs were a solid block with a flat top at y 0.60 — which is what a ray
     * cast down the well reports, because downHit, the invisible click target for
     * "the stairs down", is exactly that shape. A MeshBasicMaterial with
     * visible:false renders nothing and blocks nothing, but it still answers a
     * raycast. The stairs are eleven real steps and always were.
     * The waypoint's real effect was to aim the descent at z 1.36 — six centimetres
     * PAST the hole, which ends at HOLE.z1 = 1.3 — so it dropped the camera through
     * solid floor instead of down the opening. The original waypoints thread the
     * hole correctly and are left to do it. */
    gdoor1: new THREE.Vector3(-5.98, 1.66, 7.97),   // squared up to the garage door, hall side
    gdoor2: new THREE.Vector3(-7.25, 1.62, 7.97),   // in the doorway
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
  /* ⚠️⚠️ THE STAIRS STAND IN THE WAY OF THE WALK HOME, and only of that one walk.
   * Every `leave` in this file drops you AT the doorway you came through and lets the
   * idle drift glide you back to P.rest over the next couple of seconds — so the
   * camera is legitimately anywhere along the hall's west side when you click the
   * bedroom door. The bedroom door is the only destination EAST of the flight
   * (x -3.15 against treads spanning x -5.31..-4.39, z 2.76..7.21), so a walk that
   * starts south of the flight and ends east of it cuts straight through the treads.
   * Measured: coming in from the yard and clicking the door immediately put the
   * camera through a tread at (-5.31, 1.66, 5.29). Coming out of the garage does it
   * too. Routing via P.rest first goes round the newel the way a person would.
   * ⚠️ the decision is taken ONCE, here — testing camera.position per frame would
   * change the waypoint list mid-move and rebuild the curve under the walk. */
  var leaveViaRest = false;
  function leave() {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "hall") return;
    leaveViaRest = camera.position.z > P.rest.z + 0.35;
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
  function enterRoom(i) {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "upstairs") return;
    upRoom = i;
    var R = UPR[i], cx = (R.x0 + R.x1) / 2, ey = UPF.fl + 1.62;
    P.rd1.set(R.doorX, ey, LAN.z0 + 0.62);
    P.rd2.set(R.doorX, ey, LAN.z0 - 0.24);
    P.rmid.set((R.doorX + cx) / 2, ey, RZ1 - 0.90);
    P.rrest.set(cx, ey, RZ0 + 2.85);
    P.rlook.set(cx, ey - 0.30, RZ0 - 2.2);
    P.rlookB.set(R.doorX, ey - 0.16, LAN.z0 + 0.55);
    mode = "roomIn"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.clickSfx && AUDIO.clickSfx(430);
    if (turnBtn) turnBtn.style.display = "none";
  }
  function leaveRoom() {
    if (mode !== "idle" && mode !== "turning") return;
    if (!isRoomSp(space)) return;
    mode = "roomOut"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
  }
  function enterUpstairs() {
    if (mode !== "idle" || space !== "hall") return;
    mode = "upIn"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.ratchetSfx && AUDIO.ratchetSfx();
    if (turnBtn) turnBtn.style.display = "none";
  }
  function leaveUpstairs() {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "upstairs") return;
    mode = "upOut"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
  }
  function enterLiving() {
    if (mode !== "idle" || space !== "hall") return;
    mode = "livingIn"; tt = 0;
    c0.copy(camera.position); l0.copy(lookAt);
    AUDIO.ratchetSfx && AUDIO.ratchetSfx();
    if (turnBtn) turnBtn.style.display = "none";
  }
  function leaveLiving() {
    if (mode !== "idle" && mode !== "turning") return;
    if (space !== "living") return;
    mode = "livingOut"; tt = 0;
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
  function isRoomSp(sp) { return sp === 'room0' || sp === 'room1' || sp === 'room2'; }
  function restPos() {
    return space === "porch" ? P.porch : space === "kitchen" ? P.krest
         : space === "garage" ? P.grest : space === "back" ? P.brest
         : space === "living" ? P.lrest : space === "upstairs" ? P.uprest
         : space === "basement" ? P.bsrest : isRoomSp(space) ? P.rrest : P.rest;
  }
  function aimFor(f) {
    if (space === "porch") return f === "house" ? P.porchB : P.porchL;
    if (space === "kitchen") return f === "door" ? P.klookB : P.klook;
    if (space === "garage") return f === "door" ? P.glookB : P.glook;
    if (space === "living") return f === "door" ? P.llookB : P.llook;
    if (space === "upstairs") return f === "east" ? P.uplookB : P.uplook;
    if (isRoomSp(space)) return f === "door" ? P.rlookB : P.rlook;
    if (space === "back") return f === "house" ? P.blookB : f === "yard" ? P.blookW : P.blook;
    if (space === "basement") return f === "stairs" ? P.bslookB : P.bslook;
    return f === "south" ? P.lookS : P.look;
  }
  function flipOf(f) {
    if (space === "porch") return f === "street" ? "house" : "street";
    if (space === "kitchen" || space === "garage" || space === "living") return f === "door" ? "room" : "door";
    if (space === "upstairs") return f === "west" ? "east" : "west";
    if (isRoomSp(space)) return f === "door" ? "far" : "door";
    // pool -> yard -> house -> pool: the only three-way turn in the house, because
    // the back yard is the only space with content on three sides of you
    if (space === "back") return f === "pool" ? "yard" : f === "yard" ? "house" : "pool";
    if (space === "basement") return f === "den" ? "stairs" : "den";
    return f === "north" ? "south" : "north";
  }
  function ease(x) { return x * x * (3 - 2 * x); }
  var _v = new THREE.Vector3(), _w = new THREE.Vector3();
  /* ---- THE WIRE ----------------------------------------------------------------
   * ⚠️⚠️ THIS USED TO BE PIECEWISE-LINEAR WITH THE EASE APPLIED PER LEG, which is
   * two separate stutters wearing one coat:
   *   - ease(x - i) runs 0..1 INSIDE EVERY LEG, so the camera decelerated to a
   *     standstill at each waypoint and accelerated away again. Three legs, two
   *     dead stops in the middle of one 2.3s move.
   *   - every leg got the same SLICE OF TIME regardless of its LENGTH. The walk
   *     into the hallway is 4.46m, then 1.70m, then 1.93m, all in 0.77s each.
   * Measured on that path: speed ranged 0.05 to 8.72 m/s and the worst single
   * lurch was 44.3 m/s^2. That is Kyle's "not smooth" exactly, and no amount of
   * moving the waypoints would have fixed it.
   * Now it is ONE curve through the same waypoints, sampled by ARC LENGTH
   * (getPointAt, not getPoint) so the speed is constant along it, with ONE ease
   * over the whole move so it accelerates away once and settles once. A wire.
   * ⚠️ 'centripetal' is not a detail. Uniform Catmull-Rom loops and overshoots
   * when the waypoint spacing is uneven — and it is very uneven here, 4.46m
   * against 1.70m — which would swing the camera out through a wall on the bend.
   * Centripetal parameterisation is the variant that provably cannot self-
   * intersect or cusp.
   * ⚠️ The curve is rebuilt only when the WAYPOINTS change, not per frame: the
   * arc-length lookup table behind getPointAt costs ~200 samples to build. c0 is
   * captured once when a walk starts, so the signature is stable for its whole
   * duration. */
  var _wPos = null, _wLook = null, _wSig = "";
  function walk(pts, lks, t) {
    var sig = pts.length + "/" + lks.length;
    for (var i = 0; i < pts.length; i++) sig += "|" + pts[i].x.toFixed(3) + "," + pts[i].y.toFixed(3) + "," + pts[i].z.toFixed(3);
    for (var j = 0; j < lks.length; j++) sig += "!" + lks[j].x.toFixed(3) + "," + lks[j].y.toFixed(3) + "," + lks[j].z.toFixed(3);
    if (sig !== _wSig) {
      _wSig = sig;
      _wPos = new THREE.CatmullRomCurve3(pts.map(function (q) { return q.clone(); }), false, "centripetal");
      _wLook = new THREE.CatmullRomCurve3(lks.map(function (q) { return q.clone(); }), false, "centripetal");
      /* ⚠️ getPointAt walks a LOOKUP TABLE of arc lengths, and the default is 200
       * entries. A 2.3s move at 60fps asks for 138 samples, so consecutive frames
       * kept landing in the same bucket and the camera micro-stuttered along the
       * wire — measured as a 56 m/s^2 spike that was pure table quantisation, not
       * motion. 600 entries puts four frames between buckets. Set it BEFORE the
       * first getPointAt or the stale table is already cached. */
      _wPos.arcLengthDivisions = 600; _wLook.arcLengthDivisions = 600;
    }
    /* ⚠️ SEEN IN THE WILD, CAUSE NEVER PINNED: an intermittent boot-window state where
     * t arrives non-finite and CatmullRomCurve3.getPointAt(NaN) indexes points[NaN] —
     * an undefined-x crash deep inside three that kills the camera for the rest of the
     * session, because the real rAF loop hits the same throw every frame. Twice this
     * was chased and twice it would not reproduce on demand. So: a non-finite t is
     * treated as ARRIVAL (t=1 completes the move and hands control back to idle, which
     * self-heals; t=0 would re-pin the camera to the start of a walk forever), and it
     * shouts to the console so a live occurrence finally leaves a fingerprint. */
    if (!isFinite(t)) { try { console.error("[house] walk() got non-finite t in mode " + mode + " — completing the move"); } catch (e) {} t = 1; }
    var k = ease(Math.min(1, Math.max(0, t)));
    _wPos.getPointAt(k, _v);
    _wLook.getPointAt(k, _w);
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
    // the bedroom's OUTSIDE is only ever looked at from the back lawn — and if it
    // is up at any other time it is a wall across the walk to the hallway
    var claddingUp = space === "back" || mode === "backIn" || mode === "backOut";
    for (var bsV = 0; bsV < bedShell.length; bsV++) bedShell[bsV].visible = claddingUp;
    // ⚠️ the livG gate is GONE, and that is the whole point of the move: on the west
    // side the room is nowhere near the bedroom camera, so it is simply part of the house.
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
    if (mode === "roomIn" || mode === "roomOut") {       // through one of the three doors
      tt = Math.min(1, tt + dt / 2.1);
      /* the door swings open ahead of the camera and shuts behind it - a door that
       * reacts to you is the entire reason it is a door and not a wall with a knob */
      var sw = mode === "roomIn" ? tt * 2.6 : 1 - (tt - 0.42) * 2.4;
      if (roomDoors[upRoom]) {
        var rest = roomDoorRest[upRoom];
        roomDoors[upRoom].rotation.y = rest + ease(Math.max(0, Math.min(1, sw))) * (1.92 - rest);
      }
      if (mode === "roomIn") walk([c0, P.rd1, P.rd2, P.rmid, P.rrest],
                                  [l0, P.rlook, P.rlook, P.rlook, P.rlook], tt);
      else walk([c0, P.rmid, P.rd2, P.rd1, P.uprest], [l0, P.rlookB, P.uplook, P.uplook, P.uplook], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "roomIn") { space = UPR[upRoom].sp; facing = turnTo = "far"; }
        else { space = "upstairs"; facing = turnTo = "west"; AUDIO.clickSfx && AUDIO.clickSfx(500); }
        turnK = 1; mode = "idle"; syncTurnBtn();
      }
      return true;
    }
    if (mode === "upIn" || mode === "upOut") {           // up the stairs, or back down
      // 3.2s: it is two flights and a turn, and rushing it reads as a lift
      tt = Math.min(1, tt + dt / 3.2);
      if (mode === "upIn") walk([c0, P.up1, P.up2, P.up3, P.up4, P.uprest],
                                [l0, P.upL1, P.upL1, P.upL2, P.uplook, P.uplook], tt);
      else walk([c0, P.up4, P.up3, P.up2, P.up1], [l0, P.upL2, P.upL1, P.look, P.look], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "upIn") { space = "upstairs"; facing = turnTo = "west"; }
        else { space = "hall"; facing = turnTo = "north"; AUDIO.clickSfx && AUDIO.clickSfx(500); }
        turnK = 1; mode = "idle"; syncTurnBtn();
      }
      return true;
    }
    if (mode === "livingIn" || mode === "livingOut") {   // through to the living room
      tt = Math.min(1, tt + dt / 2.1);
      var lk = mode === "livingIn" ? tt : 1 - tt;
      lDoorPivot.rotation.y = 2.05 * ease(Math.min(1, Math.max(0, (lk - 0.04) / 0.34)));
      if (mode === "livingIn") walk([c0, P.ldoor1, P.ldoor2, P.lrest], [l0, P.ldoorL, P.llook, P.llook], tt);
      else walk([c0, P.ldoor2, P.ldoor1], [l0, P.ldoorL, P.lookS], tt);
      camera.position.copy(_v); lookAt.copy(_w); camera.lookAt(lookAt);
      if (tt >= 1) {
        if (mode === "livingIn") { space = "living"; facing = turnTo = "room"; lDoorPivot.rotation.y = 2.05; }
        else {
          space = "hall"; facing = turnTo = "south"; lDoorPivot.rotation.y = 0;
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
      if (mode === "garageIn") walk([c0, P.gdoor1, P.gdoor2, P.gmid, P.grest], [l0, P.gdoorL, P.glook, P.glook, P.glook], tt);
      else walk([c0, P.gmid, P.gdoor2, P.gdoor1], [l0, P.gdoorL, P.gdoorL, P.lookS], tt);
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
      /* the pane is fully open by the time the camera reaches the opening — same
       * contract as every hinged door in the house, translated not rotated.
       * ⚠️ THE WINDOW HAD TO NARROW WHEN THE WALK BECAME A CURVE. The old walk gave
       * each leg an equal SLICE OF TIME, so the camera crossed the threshold at
       * t 0.68 on the way in. Arc-length pacing spends time in proportion to
       * DISTANCE instead, and the leg out to the lawn is much the longer one, so
       * the crossing moved to t 0.75 — by which point this pane had slid a third of
       * the way back and the camera clipped its edge (measured: the camera at
       * x -5.36 inside a pane spanning -6.34..-5.30). Closing later and faster puts
       * the pane clear of the opening for the whole crossing again.
       * Any door schedule tuned against the OLD pacing has this hazard; this was
       * the only one whose margin was thin enough to actually fail. */
      slideK(ease(Math.min(1, Math.max(0, (bk - 0.02) / 0.18))));
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
        walk(leaveViaRest ? [c0, P.rest, P.door2, P.door1] : [c0, P.door2, P.door1],
             leaveViaRest ? [l0, P.look, P.doorL, BED_LOOK] : [l0, P.doorL, BED_LOOK], tt);
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
    if (space === "hall" || space === "porch" || space === "kitchen" || space === "garage" || space === "back" || space === "basement" || space === "living" || space === "upstairs" || isRoomSp(space)) { // at rest: same parallax drift as the bedroom
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
        mode === "livingIn" || mode === "livingOut" || mode === "upIn" || mode === "upOut" ||
        mode === "roomIn" || mode === "roomOut" ||
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
    /* ⚠️ THE TURN BUTTON WAS HIDDEN IN FIVE OF THE TWELVE SPACES — living, upstairs
     * and the three rooms — even though flipOf(), aimFor() and the P.llookB/P.rlookB
     * keyframes all support turning in them. So half the landing was unlookable, two
     * of its three doors sat permanently behind the camera, and the way back out of
     * every one of those rooms was off screen. This is the other half of the one-way
     * trap fix: the back-hits above are only reachable once you can face them. */
    var show = space === "hall" || space === "porch" || space === "kitchen" ||
               space === "garage" || space === "back" || space === "basement" ||
               space === "living" || space === "upstairs" || isRoomSp(space) ||
               mode === "entering";
    turnBtn.style.display = show ? "block" : "none";
    var next = flipOf(mode === "turning" ? turnTo : facing);
    // ⚠️ kitchen and garage share the room/door facing tokens, so "room" has to be
    // resolved per-space or the button in the garage offers you the kitchen
    /* ⚠️ 'room' is shared by the kitchen, the garage AND now the living room, and
     * 'door'/'far'/'west'/'east' had no entries at all for the new spaces — an enabled
     * button with no label reads 'the other way', which is a button that lies. */
    var LBL = { south: "the back of the house", north: "the front door", pool: "the pool",
                den: "the den", stairs: "the stairs up",
                house: "the house", street: "the street",
                west: "the far end", east: "the other end",
                far: isRoomSp(space) ? "the rest of the room" : "the far wall",
                door: isRoomSp(space) ? "the door" : space === "living" ? "the way back" : "the way out",
                room: space === "garage" ? "the garage" : space === "living" ? "the living room" : "the kitchen" };
    turnBtn.textContent = "⟲  turn around — " + (LBL[next] || "the other way");
    turnBtn.setAttribute("aria-label", "Turn around to face " + (LBL[next] || "the other way"));
  }

  var SPACE_BOUNDS = {
    hall:     { x: [W_IN - 0.15, -3.90], z: [Z_N - 0.20, Z_S + 0.20], y: [-0.15, CEIL + 0.60] },
    kitchen:  { x: [KX0 - 0.15, KX1 + 0.15], z: [KZ0 - 0.15, KZ1 + 0.15], y: [-0.15, KCEIL + 0.50] },
    garage:   { x: [-12.20, -7.40], z: [4.25, 8.55], y: [-0.15, 2.25] },
    living:   { x: [LIV.x0 - 0.20, LIV.x1 + 0.20], z: [LIV.z0 - 0.20, LIV.z1 + 0.20], y: [-0.15, LIV.ce + 0.30] },
    upstairs: { x: [UPF.x0 - 0.20, UPF.x1 + 0.20], z: [UPF.z0 - 0.20, UPF.z1 + 0.20], y: [UPF.fl - 0.20, UPF.ce + 0.30] },
    room0:    { x: [UPR[0].x0 - 0.20, UPR[0].x1 + 0.20], z: [UPF.z0 - 0.20, LAN.z0 + 0.25], y: [UPF.fl - 0.20, UPF.ce + 0.30] },
    room1:    { x: [UPR[1].x0 - 0.20, UPR[1].x1 + 0.20], z: [UPF.z0 - 0.20, LAN.z0 + 0.25], y: [UPF.fl - 0.20, UPF.ce + 0.30] },
    room2:    { x: [UPR[2].x0 - 0.20, UPR[2].x1 + 0.20], z: [UPF.z0 - 0.20, LAN.z0 + 0.25], y: [UPF.fl - 0.20, UPF.ce + 0.30] },
    basement: { x: [BSM.x0 - 0.15, BSM.x1 + 0.15], z: [BSM.z0 - 0.15, BSM.z1 + 0.15],
                y: [BSM.fl - 0.15, BSM.ce + 0.10] },
    porch:    { x: [-60, 60], z: [-62, HOUSE_F + 0.60], y: [GROUND - 0.20, GROUND + 14] },
    back:     { x: [-32, 26], z: [Z_S - 0.70, 46], y: [GROUND - 1.60, GROUND + 12] },
  };

  /* ⚠️⚠️ PER-SPACE LIGHT GATING WAS HERE, AND IT WAS A NET LOSS — DO NOT REBUILD IT.
   * Hiding the lights a room cannot see looked like free performance: fewer lights in
   * the fragment shader. It is not, because three.js bakes NUM_POINT_LIGHTS into the
   * program key. Give twelve spaces twelve different light counts and every material
   * in the house recompiles the first time you walk into each one. Measured on a cold
   * cache, walking bedroom->hall->kitchen->living->basement->garage->upstairs->room1:
   * 81 shader programs grew to 149, and the first frame in each NEW count cost
   * 141-289 ms while a space that happened to REUSE a count (living and garage both
   * land on the hall’s 29) cost 15-18 ms and compiled nothing. That is the stutter
   * you feel walking through the house.
   * The light count must stay CONSTANT. Today it has exactly two states — the bedroom
   * (hallway group hidden) and everywhere else — which is what shipped for months.
   * If you want fewer lights per fragment, the only safe shape is a FIXED-SIZE POOL:
   * N lights that never leave the scene and get repositioned per space, so the count
   * never moves. Gating by .visible, or by hiding a group that contains lights, is the
   * thing that costs. (The same trap is why the passing car, the ice cream truck, the
   * pool light, the CRT and the aquarium drive INTENSITY and never .visible.) */

  /* ---- per-frame life ---------------------------------------------------------
   * dim comes from the room (the bed's "five more minutes" fades the whole
   * house); the hall breathes with it. The TV flicker under the living room
   * door never stops. Nobody has ever seen the TV. */
  function glowTick(t, dt, dim) {
    var on = lightsOn ? 1 : 0.06;
    var breathe = 0.94 + 0.06 * Math.sin(t * 0.8);
    [bulbS, bulbN, bulbB].forEach(function (b) {
      b.light.intensity = 3.4 * dim * on * breathe;
      b.bulb.material.emissiveIntensity = 2.0 * dim * on;
      if (b.halo) b.halo.material.opacity = 0.34 * dim * on * breathe;
    });
    hallFill.intensity = 0.72 * dim * on;
    for (var dl6 = 0; dl6 < dimLights.length; dl6++) dimLights[dl6].l.intensity = dimLights[dl6].base * dim;
    /* the living room and the landing, which used to be outside every ticker in the
     * file. Same `dim * on * breathe` term as the hall bulbs so they read as being on
     * the same electrical supply, because they are. */
    if (livingLife) livingLife(dt, t, livOn ? dim : dim * 0.15);
    if (livLightH) {
      var lon = livOn ? 1 : 0.05;
      // living: 23.9 luma post-sRGB, k=2.35 measured to reach 33 — moody but readable
      livLightH.lamp.intensity = 1.70 * dim * lon * breathe;
      livLightH.ceil.intensity = 1.25 * dim * lon * breathe;
      livLightH.shade.emissiveIntensity = 0.50 * dim * lon;
      livLightH.bowl.emissiveIntensity = 0.42 * dim * lon;
      // the set flickers on its own schedule — a CRT does not breathe with the house
      var fl2 = 0.86 + 0.14 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.3));
      livLightH.tv.intensity = 0.85 * dim * fl2;
      livLightH.scr.emissiveIntensity = 0.70 * dim * fl2;
    }
    if (upLightH) {
      var uon = upOn ? 1 : 0.05;
      // the landing dropped 36 luma in the sRGB fix — the biggest fall in the house
      upLightH.a.intensity = 1.90 * dim * uon * breathe;
      upLightH.b.intensity = 1.10 * dim * uon * breathe;
      upLightH.bulbA.emissiveIntensity = 1.10 * dim * uon;
      upLightH.bulbB.emissiveIntensity = 0.95 * dim * uon;
      /* ⚠️ THE SMOKE ALARM'S LED WAS A CONSTANT. It is the cheapest possible ambient
       * system and the most convincing: a 120 ms blink every 42 seconds, which is what
       * the real ones do, and the only thing moving up here at 3 a.m. */
      var blip = (t % 42) < 0.12 ? 2.0 : 0.22;
      upLightH.led.emissiveIntensity = blip;
    }
    // and the three rooms behind the doors, on the same supply as everything else
    for (var rli = 0; rli < roomLights.length; rli++) {
      var e3 = roomLights[rli];
      var k3 = e3.sw ? (upOn ? 1 : 0.05) * (e3.on ? 1 : 0.04) : 1;
      e3.l.intensity = e3.i * dim * k3 * breathe;
      if (e3.m) e3.m.emissiveIntensity = e3.e * dim * k3;
    }
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
    // somebody's shows are on in there. ⚠️ this used to read livDoor.userData.spill —
    // the placeholder door on the west wall — and that variable no longer exists, so
    // it threw on the first tick and took the whole hall ticker with it.
    lSpill.material.opacity = lSpillOp * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.3)));
    if (kitDoor.userData.spill) kitDoor.userData.spill.material.opacity = kitDoor.userData.spillOp * (0.9 + 0.1 * Math.sin(t * 0.4));
    // the kitchen breathes with the house's dim, and the fridge glow flickers the
    // tiniest bit — that's the compressor cycling, which is the hum made visible
    /* kitchen: measured 128 mean luma against the bedroom's 40 — three families too
     * bright, mostly its own lights. Binary-searched to ~88 at k=0.42 of the old set. */
    kLight.intensity = 0.60 * dim;
    kFill.intensity = 0.20 * dim;
    kUnder.intensity = 0.55 * dim * kStripOn;
    strip.material.emissiveIntensity = 0.9 * dim * kStripOn;
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
      passLite.position.set(passX + passDir * 3, 0.9, passG.position.z);
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
      tkLite.position.set(tx + 0.3, TRUCK_Y + 1.7, (Z_KERB + Z_ROADF) / 2 + 2.1 + 2.2);
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
    } else if (truckG.position.x === 0 && truckG.position.z === 0) {
      // ⚠️ it starts life at the ORIGIN, which is inside the house. Invisible, so
      // nobody ever saw it — but it is a porch clickable sitting in the bedroom,
      // and the moment the audit started checking hidden objects it said so.
      // Park it up the street where it waits anyway.
      truckG.position.set(52, TRUCK_Y, (Z_KERB + Z_ROADF) / 2 + 2.1);
      truckG.rotation.y = Math.PI;
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
    living: { enter: enterLiving, leave: leaveLiving },
    upstairs: { enter: enterUpstairs, leave: leaveUpstairs },
    room0: { enter: function () { enterRoom(0); }, leave: leaveRoom },
    room1: { enter: function () { enterRoom(1); }, leave: leaveRoom },
    room2: { enter: function () { enterRoom(2); }, leave: leaveRoom },
    garage: { enter: enterGarage, leave: leaveGarage, roll: toggleRoll,
      rollA: function () { return rollA; } },
    back: { enter: enterBack, leave: leaveBack },
    // `box` is the den's real extent so room.js can PROVE nothing upstairs hangs
    // through the ceiling into it — see the clearance check in audit().
    basement: { enter: enterBasement, leave: leaveBasement, box: BSM },
    /* Where each space physically IS, derived from the same constants that build
     * it so the two can never drift. audit() checks every clickable against its
     * own space's box — before this, 461 of the house's 746 pickables (the hall,
     * kitchen, garage, basement, porch and back yard) had NO geometric check at
     * all: the audit returned early for anything that wasn't the bedroom, so six
     * of seven rooms could put a button through a wall and nothing would say so.
     * ⚠️ the hall's east edge is -3.90, not E_IN (-4.35): the closet is a real
     * recess cut INTO that wall and its shelf, rod and floor junk legitimately
     * live past the wall line.
     * ⚠️ the porch box is enormous on x because the ice cream truck is a porch
     * clickable that drives from x +52 to -52. */
    bounds: SPACE_BOUNDS,
    stashes: stashByKey, openStash: openStash, closeStash: closeStash,
    setPhase: setPhase, phase: function () { return porchPhase; },
    knock: knockCame,
    portalBegin: portalBegin, portalEnd: portalEnd, aimPortal: aimPortal,
    setPortalLive: setPortalLive,
    setWeather: setYardWeather, setSeason: setYardSeason,
    camTick: camTick, glowTick: glowTick, refreshPhotos: refreshPhotos,
    // audit hooks: the per-panel materials the helpers build are invisible from
    // outside, and whether the house LOOKS reach them is exactly the thing that
    // breaks silently. applyLook lets a test paint the house and measure it.
    lookMats: function () { return LOOK_MATS.length; }, applyLook: applyLook
  };
}
