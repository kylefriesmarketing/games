/* THE ROOM — the cross-game layer.
 *
 * Every game on this shelf writes its save to the same origin, which means the room
 * is the only place that can see all of them at once. None of these can be awarded
 * by a single game, because no single game knows the others exist.
 *
 * Pure-ish: `evaluate()` takes a snapshot of the world built by room.js and returns
 * results. The only state it owns is the visit log and which awards you've been shown.
 */
import { loadJSON, saveJSON } from "./util.js";

var KEY = "room-profile";

export function profileState() {
  var p = loadJSON(KEY) || {};
  if (!p.days) p.days = {};      // { "2026-07-26": 1, ... } — distinct days seen
  if (!p.ach) p.ach = {};        // { achId: isoDate } — when each was earned
  if (!p.seen) p.seen = {};      // which earned awards have been shown to you
  return p;
}
function save(p) { saveJSON(KEY, p); }

/* Call once per visit. Records the day and the first-ever visit. */
export function touchVisit(now) {
  var p = profileState();
  var d = (now || new Date());
  var key = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  if (!p.first) p.first = key;
  p.days[key] = 1;
  // remember the small hours — you can only earn Night Owl by actually being here
  if (d.getHours() >= 0 && d.getHours() < 5) p.lateNight = 1;
  save(p);
  return p;
}
export function daysVisited() { return Object.keys(profileState().days).length; }

/* ---- the awards ------------------------------------------------------------
 * check(c) reads the context room.js assembles. Keep them honest: each one should
 * be something you could only know by looking at the whole shelf. */
export var ACHIEVEMENTS = [
  { id: "door", icon: "🚪", name: "Opened the door", hint: "step into the room",
    check: function () { return true; } },
  { id: "three", icon: "📖", name: "Three ways in", hint: "reach an ending in three different games",
    check: function (c) { return c.gamesStarted >= 3; } },
  { id: "five", icon: "📚", name: "Five ways in", hint: "reach an ending in five different games",
    check: function (c) { return c.gamesStarted >= 5; } },
  { id: "shelf", icon: "🏆", name: "The whole shelf", hint: "start every story on the shelf",
    check: function (c) { return c.gamesStarted >= c.gamesTotal; } },
  { id: "finish", icon: "✅", name: "Finisher", hint: "see everything one game has to offer",
    check: function (c) { return c.anyComplete; } },
  { id: "twenty", icon: "🎭", name: "Twenty endings", hint: "twenty endings across the whole shelf",
    check: function (c) { return c.totalEndings >= 20; } },
  { id: "commander", icon: "🪖", name: "Commander", hint: "win a mission in AGE OF TOYS",
    check: function (c) { return c.toysMissions > 0; } },
  { id: "runner", icon: "🏃", name: "Made the dash", hint: "make a run in HOOD RUN",
    check: function (c) { return c.hoodRuns > 0; } },
  { id: "rift", icon: "🩸", name: "Bloodied", hint: "win a match in BLOODRIFT",
    check: function (c) { return c.riftWins > 0; } },
  { id: "lap", icon: "🚌", name: "One more week", hint: "get through a week in VICTORY LAP",
    check: function (c) { return c.lapWeeks > 0; } },
  { id: "neighbour", icon: "🤝", name: "Good neighbour", hint: "try one of Dumb Tony's games too",
    check: function (c) { return c.tonyVisits > 0; } },
  { id: "collector", icon: "🧺", name: "Collector", hint: "earn five of the treasures",
    check: function (c) { return c.collectibles >= 5; } },
  { id: "curator", icon: "💎", name: "Curator", hint: "earn ten of the treasures",
    check: function (c) { return c.collectibles >= 10; } },
  { id: "named", icon: "🖍️", name: "It's yours now", hint: "put your name on the wall",
    check: function (c) { return !!c.roomNamed; } },
  { id: "decorator", icon: "🛋️", name: "Interior decorator", hint: "save a room you like",
    check: function (c) { return c.savedRooms > 0; } },
  { id: "regular", icon: "🌙", name: "Regular", hint: "come back on three different days",
    check: function (c) { return c.days >= 3; } },
  { id: "resident", icon: "🏠", name: "Resident", hint: "come back on seven different days",
    check: function (c) { return c.days >= 7; } },
  { id: "owl", icon: "🦉", name: "Night owl", hint: "visit after midnight",
    check: function (c) { return !!c.lateNight; } },
  { id: "catfriend", icon: "🐱", name: "Friend of the cat", hint: "pet the sleeping cat",
    check: function (c) { return !!c.catPetted; } },
  { id: "gallery", icon: "🖼️", name: "Gallery night", hint: "change what hangs in a poster frame",
    check: function (c) { return !!c.posterSwapped; } },
];

/* Evaluate every award against the context, persist newly-earned ones, and report
   which are new since you were last shown. */
export function evaluate(c) {
  var p = profileState(), earned = [], fresh = [];
  ACHIEVEMENTS.forEach(function (a) {
    var got = false;
    try { got = !!a.check(c); } catch (e) { got = false; }
    if (!got) return;
    earned.push(a);
    if (!p.ach[a.id]) { p.ach[a.id] = new Date().toISOString().slice(0, 10); fresh.push(a); }
  });
  save(p);
  var unseen = earned.filter(function (a) { return !p.seen[a.id]; });
  return { earned: earned, fresh: fresh, unseen: unseen, total: ACHIEVEMENTS.length };
}
export function markSeen() {
  var p = profileState();
  ACHIEVEMENTS.forEach(function (a) { if (p.ach[a.id]) p.seen[a.id] = 1; });
  save(p);
}

/* A title that grows with the shelf — the card's one-line summary of you. */
export function rankFor(c) {
  var n = c.totalEndings;
  if (c.gamesStarted >= c.gamesTotal && n >= 30) return "Keeper of the Room";
  if (n >= 30) return "Long-time reader";
  if (n >= 20) return "Deep in the shelf";
  if (n >= 10) return "Getting comfortable";
  if (n >= 3) return "Finding your way";
  if (n >= 1) return "Just arrived";
  return "Nobody yet";
}
