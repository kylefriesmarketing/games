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
var CACHE = "the-room-v28"; // v28: you can turn and face the west yard — where the kiln always was
var SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg",
  // room.js imports these at parse time — miss one and the offline room won't boot
  "./js/room.js", "./js/util.js", "./js/stickers.js", "./js/collectibles.js",
  "./js/profile.js", "./js/audio.js", "./js/post.js", "./js/hallway.js"];

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
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
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
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit; });
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
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match("./index.html");   // offline deep-link still opens the room
      });
    })
  );
});
