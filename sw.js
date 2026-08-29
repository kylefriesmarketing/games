/* THE HOUSE — service worker.
 *
 * Two strategies on purpose, because this room is ~11MB of props but its code
 * changes several times a day:
 *
 *   code (html/js/json)  → NETWORK FIRST, cache as fallback.  A deploy is live the
 *                          moment you reload; the cache only steps in when offline.
 *                          (Cache-first here is the classic PWA trap: it pins an old
 *                          room.js in place until someone remembers to bump a version.)
 *   assets (glb/img/lib) → CACHE FIRST.  These are big, they're named for their
 *                          contents, and they effectively never change — so serve them
 *                          instantly and only hit the network on a miss.
 */
/* ⚠️⚠️ TWO BUCKETS, ON PURPOSE. These used to share one, so every version bump —
 * several a day — deleted 13 MB of props along with the code and every visitor
 * re-downloaded the entire house. The shell is bumped freely; the asset bucket is
 * bumped only when a prop is re-exported under a name it already had. */
var SHELL_CACHE = "the-room-shell-v78"; // v78: every room takes wallpaper now
var ASSET_CACHE = "the-room-assets-v1"; // bump ONLY when an existing asset changes
var CACHE = SHELL_CACHE;                // kept: older code in this file reads it
var SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg",
  // room.js imports these at parse time — miss one and the offline room won't boot
  "./js/room.js", "./js/util.js", "./js/stickers.js", "./js/collectibles.js",
  "./js/profile.js", "./js/audio.js", "./js/post.js", "./js/hallway.js",
  // ⚠️ and these, which the importmap resolves at parse time too. The comment above
  // was already right about the consequence and the list was missing the biggest one.
  "./assets/lib/three.module.min.js",
  "./assets/lib/jsm/loaders/GLTFLoader.js",
  "./assets/lib/jsm/loaders/DRACOLoader.js",
  "./assets/lib/jsm/utils/BufferGeometryUtils.js"];

// heavy, effectively-immutable things worth keeping on disk
function isAsset(url) {
  return /\.(glb|jpg|jpeg|png|svg|webp|wasm|bin)$/i.test(url.pathname) ||
         url.pathname.indexOf("/assets/lib/") >= 0;
}

self.addEventListener("install", function (e) {
  // never let one missing file abort the whole install
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  // ⚠️ delete only STALE SHELLS. The old line deleted every cache that was not the
  // current one, which took the asset bucket with it on every single deploy.
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k === SHELL_CACHE || k === ASSET_CACHE) return null;
      if (k.indexOf("the-room-assets-") === 0) return null;   // a future asset bucket
      return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;   // the games live on their own origins

  if (isAsset(url)) {
    // stale-while-revalidate: hand back the cached copy immediately (these are
    // megabytes of props, so the wait matters), but always re-fetch in the
    // background so the NEXT load is current. Plain cache-first would pin an old
    // prop forever whenever one is re-exported under the same name — which is
    // exactly what happened when the textures were shrunk.
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(ASSET_CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit || Response.error(); });
      return hit || net;
    }));
    return;
  }

  e.respondWith(                                 // network first, fall back to cache
    // ⚠️ cache:"no-cache" forces REVALIDATION. GitHub Pages serves everything with
    // max-age=600, and the browser's HTTP cache sits IN FRONT of this fetch — so
    // "network first" was quietly reading a 10-minute-old local copy and every
    // deploy looked broken for ten minutes ("it's not live yet"). no-cache sends a
    // conditional request instead: a changed file arrives at once, an unchanged one
    // costs a cheap 304.
    fetch(req, { cache: "no-cache" }).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        /* ⚠️⚠️ THIS USED TO HAND index.html TO ANY UNCACHED REQUEST — INCLUDING A
         * JAVASCRIPT MODULE. An offline visitor whose room.js was not in the cache
         * got HTML with a JS content type, the module failed to parse, __roomBoot was
         * never set, and the entry card sat there polling forever over the only route
         * to the games. Falling back to the document is only ever correct for a
         * NAVIGATION. */
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    })
  );
});
