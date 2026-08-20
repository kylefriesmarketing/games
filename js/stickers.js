/* THE HOUSE — the wall stickers.
 * Twelve decals, each drawn with plain canvas calls around a centred origin
 * (roughly -56..56). Pure drawing: no room state, no THREE — the caller bakes
 * these into a texture. Add one here and it appears in the drawer automatically.
 */
import { poly } from "./util.js";

export var STICKER_DESIGNS = [
  { id: "star", label: "★", draw: function (g) { g.fillStyle = "#ffd23e"; g.beginPath();
    for (var i = 0; i < 10; i++) { var r = i % 2 ? 22 : 52, a = -Math.PI / 2 + i * Math.PI / 5; g[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); } },
  { id: "heart", label: "♥", draw: function (g) { g.fillStyle = "#ff5a8a"; g.beginPath(); g.moveTo(0, 40);
    g.bezierCurveTo(-55, -6, -30, -52, 0, -20); g.bezierCurveTo(30, -52, 55, -6, 0, 40); g.closePath(); g.fill(); } },
  { id: "rocket", label: "🚀", draw: function (g) { g.fillStyle = "#e8e8ee"; g.beginPath(); g.moveTo(0, -52);
    g.quadraticCurveTo(20, -20, 18, 22); g.lineTo(-18, 22); g.quadraticCurveTo(-20, -20, 0, -52); g.fill();
    g.fillStyle = "#ff6a4a"; g.beginPath(); g.moveTo(-18, 22); g.lineTo(-34, 42); g.lineTo(-12, 30); g.fill();
    g.beginPath(); g.moveTo(18, 22); g.lineTo(34, 42); g.lineTo(12, 30); g.fill();
    g.fillStyle = "#5ac8e0"; g.beginPath(); g.arc(0, -18, 9, 0, 7); g.fill();
    g.fillStyle = "#ffb23e"; g.beginPath(); g.moveTo(0, 52); g.lineTo(-9, 24); g.lineTo(9, 24); g.fill(); } },
  { id: "planet", label: "🪐", draw: function (g) { g.fillStyle = "#c98af0"; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
    g.strokeStyle = "#ffd23e"; g.lineWidth = 7; g.save(); g.rotate(-0.4); g.beginPath(); g.ellipse(0, 0, 52, 16, 0, 0, 7); g.stroke(); g.restore(); } },
  // built from separate fills of one colour — they merge into a single silhouette,
  // which is far easier to keep readable than one long hand-plotted outline
  { id: "dino", label: "🦖", draw: function (g) {
    g.fillStyle = "#5ac86a";
    g.beginPath(); g.moveTo(-12, -2);                       // tail
    g.quadraticCurveTo(-36, -4, -56, 12);
    g.quadraticCurveTo(-34, 12, -10, 18); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(0, 6, 24, 18, 0, 0, 7); g.fill();   // body
    g.beginPath(); g.moveTo(10, -6);                        // neck + head, facing right
    g.quadraticCurveTo(16, -32, 32, -34);
    g.lineTo(52, -32); g.quadraticCurveTo(58, -26, 52, -20); // snout
    g.lineTo(34, -17); g.quadraticCurveTo(22, -13, 20, 2);
    g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-6, 16); g.lineTo(-16, 44);      // back leg
    g.lineTo(0, 44); g.lineTo(6, 18); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(12, 16); g.lineTo(8, 44);        // front leg
    g.lineTo(24, 44); g.lineTo(24, 16); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(20, 0); g.lineTo(32, 8);         // the famous little arm
    g.lineTo(21, 10); g.closePath(); g.fill();
    [[-8, -12], [2, -14]].forEach(function (p) {             // ridges along the back
      g.beginPath(); g.moveTo(p[0] - 6, p[1] + 4); g.lineTo(p[0], p[1] - 6);
      g.lineTo(p[0] + 6, p[1] + 4); g.closePath(); g.fill();
    });
    g.fillStyle = "#f4fff4"; g.beginPath(); g.arc(40, -27, 4.5, 0, 7); g.fill();  // eye
    g.fillStyle = "#1a1a1a"; g.beginPath(); g.arc(41, -27, 2.4, 0, 7); g.fill();
    g.strokeStyle = "#2f7f3c"; g.lineWidth = 2; g.beginPath();                    // mouth line
    g.moveTo(52, -21); g.lineTo(35, -18); g.stroke(); } },
  { id: "lightning", label: "⚡", draw: function (g) { g.fillStyle = "#ffd23e"; g.beginPath(); g.moveTo(8, -52);
    g.lineTo(-22, 6); g.lineTo(-2, 6); g.lineTo(-10, 52); g.lineTo(24, -12); g.lineTo(2, -12); g.closePath(); g.fill(); } },
  { id: "smiley", label: "☺", draw: function (g) { g.fillStyle = "#ffd23e"; g.beginPath(); g.arc(0, 0, 46, 0, 7); g.fill();
    g.fillStyle = "#1a1a1a"; g.beginPath(); g.arc(-16, -10, 6, 0, 7); g.arc(16, -10, 6, 0, 7); g.fill();
    g.lineWidth = 6; g.strokeStyle = "#1a1a1a"; g.beginPath(); g.arc(0, 4, 22, 0.2, Math.PI - 0.2); g.stroke(); } },
  { id: "ghost", label: "👻", draw: function (g) { g.fillStyle = "#eef0f6"; g.beginPath(); g.moveTo(-32, 44);
    g.lineTo(-32, -6); g.quadraticCurveTo(-32, -48, 0, -48); g.quadraticCurveTo(32, -48, 32, -6); g.lineTo(32, 44);
    g.lineTo(20, 32); g.lineTo(10, 44); g.lineTo(0, 32); g.lineTo(-10, 44); g.lineTo(-20, 32); g.closePath(); g.fill();
    g.fillStyle = "#1a1a1a"; g.beginPath(); g.arc(-12, -8, 5, 0, 7); g.arc(12, -8, 5, 0, 7); g.fill(); } },
  // five outlined petals, not six overlapping ones — without the gaps and the
  // darker edge they fuse into a solid ring and it reads as a donut
  { id: "flower", label: "❀", draw: function (g) {
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i / 5 * Math.PI * 2;
      g.save(); g.translate(Math.cos(a) * 25, Math.sin(a) * 25); g.rotate(a + Math.PI / 2);
      g.fillStyle = "#ff8ac8"; g.strokeStyle = "#d95a9a"; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 13, 21, 0, 0, 7); g.fill(); g.stroke();
      g.restore();
    }
    g.fillStyle = "#ffd23e"; g.strokeStyle = "#d9a017"; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill(); g.stroke(); } },
  { id: "moon", label: "🌙", draw: function (g) { g.fillStyle = "#ffe08a"; g.beginPath(); g.arc(0, 0, 40, 0, 7); g.fill();
    g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(16, -8, 36, 0, 7); g.fill();
    g.globalCompositeOperation = "source-over"; } },
  { id: "diamond", label: "◆", draw: function (g) { poly(g, 4, 46, -Math.PI / 2, "#5ad8e0"); poly(g, 4, 24, -Math.PI / 2, "#bff0f6"); } },
  { id: "peace", label: "☮", draw: function (g) { g.strokeStyle = "#7ac86a"; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 42, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(0, -42); g.lineTo(0, 42); g.moveTo(0, 0); g.lineTo(-30, 30); g.moveTo(0, 0); g.lineTo(30, 30); g.stroke(); } },
];
