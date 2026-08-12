/* THE ROOM — everything you can hear.
 *
 * All of it is synthesised: the lofi tape is eight bars rendered offline once and
 * looped forever, the rain is shaped white noise, and every click, snore, knock and
 * thunderclap is built from oscillators. No audio files ship with this room.
 *
 * The context can't exist until a real gesture unlocks it, so nothing here runs
 * until start() is called from the entry card or the boombox.
 */

var audioOn = false, ac = null, acNodes = null;
function buildAudio(initialRain) {
  ac = new (window.AudioContext || window.webkitAudioContext)();
  var master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  // rain: looped white noise, band-shaped
  var len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var rain = ac.createBufferSource(); rain.buffer = buf; rain.loop = true;
  var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400;
  var hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 300;
  var rg = ac.createGain(); rg.gain.value = initialRain; // the hour decides how hard it pours
  rain.connect(lp); lp.connect(hp); hp.connect(rg); rg.connect(master); rain.start();
  // the tape: an 8-bar lofi loop rendered offline once, then looped forever
  renderTune(ac.sampleRate, function (buf) {
    var tape = ac.createBufferSource(); tape.buffer = buf; tape.loop = true;
    var tg = ac.createGain(); tg.gain.value = 0.42;
    tape.connect(tg); tg.connect(master); tape.start();
  });
  acNodes = { master: master, rain: rg };
}
// Composes the boombox tape: 72bpm swung lofi, Dm7-G7-Cmaj7-Am7, two bars each.
function renderTune(sampleRate, done) {
  var beat = 60 / 72, bar = beat * 4, lenS = bar * 8;
  var oc = new OfflineAudioContext(2, Math.ceil(lenS * sampleRate), sampleRate);
  var warm = oc.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 3800;
  var out = oc.createGain(); out.gain.value = 0.9;
  out.connect(warm); warm.connect(oc.destination);
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.001, t + a + d);
  }
  function tone(f, t, dur, peak, type, pan) { // EP-ish: fundamental + soft octave shimmer
    var o = oc.createOscillator(); o.type = type || "sine"; o.frequency.value = f;
    var o2 = oc.createOscillator(); o2.frequency.value = f * 2.003;
    var g = oc.createGain(), g2 = oc.createGain();
    var p = oc.createStereoPanner(); p.pan.value = pan || 0; p.connect(out);
    env(g, t, 0.012, peak, dur); env(g2, t, 0.012, peak * 0.28, dur * 0.6);
    o.connect(g); g.connect(p); o2.connect(g2); g2.connect(p);
    o.start(t); o.stop(t + dur + 0.2); o2.start(t); o2.stop(t + dur + 0.2);
  }
  function noiseSrc(dur) {
    var b = oc.createBuffer(1, Math.ceil(dur * sampleRate), sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var s = oc.createBufferSource(); s.buffer = b; return s;
  }
  function kick(t) {
    var o = oc.createOscillator(); o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    var g = oc.createGain(); env(g, t, 0.004, 0.5, 0.22);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
  }
  function snare(t) {
    var n = noiseSrc(0.16);
    var f = oc.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.8;
    var g = oc.createGain(); env(g, t, 0.002, 0.16, 0.13);
    n.connect(f); f.connect(g); g.connect(out); n.start(t);
    var o = oc.createOscillator(); o.frequency.value = 185;
    var og = oc.createGain(); env(og, t, 0.002, 0.1, 0.08);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.2);
  }
  function hat(t, loud) {
    var n = noiseSrc(0.05);
    var f = oc.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7200;
    var g = oc.createGain(); env(g, t, 0.001, loud ? 0.05 : 0.028, 0.035);
    n.connect(f); f.connect(g); g.connect(out); n.start(t);
  }
  (function vinyl() { // sparse crackle across the whole tape
    var b = oc.createBuffer(1, Math.ceil(lenS * sampleRate), sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) if (Math.random() < 0.00012) d[i] = (Math.random() * 2 - 1) * 0.6;
    var s = oc.createBufferSource(); s.buffer = b;
    var f = oc.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 5200;
    var g = oc.createGain(); g.gain.value = 0.5;
    s.connect(f); f.connect(g); g.connect(out); s.start(0);
  })();
  var N = { A1: 55, C2: 65.41, D2: 73.42, G2: 98, A2: 110,
            C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
            C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440 };
  var chords = [
    { b: N.D2, v: [N.D3, N.F3, N.A3, N.C4] },  // Dm7
    { b: N.G2, v: [N.D3, N.F3, N.G3, N.B3] },  // G7
    { b: N.C2, v: [N.C3, N.E3, N.G3, N.B3] },  // Cmaj7
    { b: N.A1, v: [N.A2, N.C3, N.E3, N.G3] }   // Am7
  ];
  var sw = beat * 0.08; // the swing push
  chords.forEach(function (ch, c) {
    var t0 = c * bar * 2;
    ch.v.forEach(function (f, vi) { // rolled chord on the one, softer answer mid-phrase
      var pan = (vi - 1.5) * 0.22;
      tone(f, t0 + 0.001 + vi * 0.014, 2.4, 0.075, "sine", pan);
      tone(f, t0 + bar + beat * 1.5 + sw + vi * 0.01, 1.6, 0.05, "sine", pan);
    });
    [0, beat * 2, bar, bar + beat * 2].forEach(function (bt, i) { // bass on 1 and 3
      tone(ch.b, t0 + bt + 0.001, i % 2 ? 0.5 : 0.7, 0.17, "sine", 0);
    });
    for (var b2 = 0; b2 < 2; b2++) {
      var bt0 = t0 + b2 * bar;
      kick(bt0); kick(bt0 + beat * 2);
      if (b2 === 1 && c === 3) kick(bt0 + beat * 3.5 + sw); // fill into the loop seam
      snare(bt0 + beat); snare(bt0 + beat * 3);
      for (var e = 0; e < 8; e++) hat(bt0 + e * beat * 0.5 + (e % 2 ? sw : 0), e % 4 === 0);
    }
  });
  [ // the melody drifts in for the back half
    { t: bar * 4 + beat * 0.5 + sw, f: N.E4, d: 0.9 },
    { t: bar * 4 + beat * 2, f: N.D4, d: 1.4 },
    { t: bar * 5 + beat * 1.5 + sw, f: N.B3, d: 1.1 },
    { t: bar * 6 + beat * 0.5 + sw, f: N.G4, d: 0.8 },
    { t: bar * 6 + beat * 2, f: N.E4, d: 1.6 },
    { t: bar * 7 + beat * 1.5 + sw, f: N.A4, d: 0.7 },
    { t: bar * 7 + beat * 2.5 + sw, f: N.G4, d: 1.8 }
  ].forEach(function (m) { tone(m.f, m.t, m.d, 0.055, "triangle", 0.15); });
  oc.startRendering().then(done);
}
// thunder, if the box is on. strength ~1 = overhead crack, ~0.3 = far grumble
export function rumble(strength) {
  if (!ac || !audioOn) return;
  var s = strength == null ? 1 : strength;
  var secs = 1.0 + (1 - s) * 1.3; // distant thunder rolls longer
  var len = ac.sampleRate * secs, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = ac.createBufferSource(); src.buffer = buf;
  var f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 70 + 80 * s;
  var g = ac.createGain(); g.gain.value = 0.08 + 0.17 * s;
  src.connect(f); f.connect(g); g.connect(acNodes.master); src.start();
}
export function clickSfx(freq) { // a dry little switch tick
  if (!ac || !audioOn) return;
  var o = ac.createOscillator(); o.type = "square"; o.frequency.value = freq || 1600;
  var g = ac.createGain();
  g.gain.setValueAtTime(0.035, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.04);
  o.connect(g); g.connect(acNodes.master); o.start(); o.stop(ac.currentTime + 0.06);
}
export function ratchetSfx() { // winding the robot: five quick spring clicks
  if (!ac || !audioOn) return;
  for (var i = 0; i < 5; i++) {
    var t0 = ac.currentTime + i * 0.065;
    var o = ac.createOscillator(); o.type = "square"; o.frequency.value = 540 + i * 55;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.03, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
    o.connect(g); g.connect(acNodes.master); o.start(t0); o.stop(t0 + 0.05);
  }
}
export function snoreSfx() { // a low purr in, a breathy sigh out
  if (!ac || !audioOn) return;
  var t0 = ac.currentTime;
  var o = ac.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(64, t0); o.frequency.linearRampToValueAtTime(46, t0 + 1.0);
  var g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
  o.connect(g); g.connect(acNodes.master); o.start(t0); o.stop(t0 + 1.3);
  var len = ac.sampleRate * 0.9, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i / len);
  var n = ac.createBufferSource(); n.buffer = b;
  var f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 480;
  var ng = ac.createGain();
  ng.gain.setValueAtTime(0.0001, t0 + 1.25);
  ng.gain.exponentialRampToValueAtTime(0.03, t0 + 1.65);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
  n.connect(f); f.connect(ng); ng.connect(acNodes.master); n.start(t0 + 1.25);
}
export function knockSfx() { // knuckles on a hollow door: two firm, one shy
  if (!ac || !audioOn) return;
  [0, 0.24, 0.46].forEach(function (at, i) {
    var t0 = ac.currentTime + at;
    var o = ac.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(115 - i * 10, t0);
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.09);
    var g = ac.createGain();
    g.gain.setValueAtTime(i === 2 ? 0.09 : 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.connect(g); g.connect(acNodes.master); o.start(t0); o.stop(t0 + 0.2);
  });
}

/* THE ICE CREAM TRUCK'S JINGLE. One phrase, called once a second by the truck for
 * as long as it is on the street, with a gain the truck computes from how far away
 * it is — so it swells as it comes and thins out as it goes.
 * ⚠️ this is the ONLY sound in the house that is meant to be heard from a room you
 * are not in. It is the whole mechanic: you hear it upstairs, you run outside. So
 * it is NOT gated on which space you are in, only on distance, and the truck passes
 * a muffled gain when you're indoors rather than silencing it.
 * The timbre matters more than the notes — a truck jingle is a cheap tinny music
 * box, so: triangle carrier for the body, a quiet square an octave up for the rasp,
 * hard attack, short decay, no sustain. A sine would sound like a flute. */
var JINGLE = [ // a rise-and-fall phrase in G, deliberately nursery-simple
  [784, 0.00, 0.20], [988, 0.20, 0.20], [1175, 0.40, 0.28], [988, 0.68, 0.18],
  [784, 0.86, 0.30], [659, 1.16, 0.18], [784, 1.34, 0.40],
];
export function truckJingle(gain) {
  if (!ac || !audioOn) return;
  var vol = Math.max(0, Math.min(1, gain == null ? 1 : gain));
  if (vol < 0.01) return;
  JINGLE.forEach(function (n) {
    var t0 = ac.currentTime + n[1], dur = n[2];
    [["triangle", 1, 0.055], ["square", 2, 0.012]].forEach(function (v) {
      var o = ac.createOscillator(); o.type = v[0]; o.frequency.value = n[0] * v[1];
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v[2] * vol, t0 + 0.012);   // hard attack
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);          // short decay
      o.connect(g); g.connect(acNodes.master); o.start(t0); o.stop(t0 + dur + 0.05);
    });
  });
}

/* ---- what the room is allowed to touch ---------------------------------- */
export function ready() { return !!ac; }
export function isOn() { return audioOn; }
/* First real gesture: build the graph and start the tape. */
export function start(initialRain) {
  if (!ac) buildAudio(initialRain == null ? 0.05 : initialRain);
  audioOn = true; ac.resume();
  return true;
}
/* The boombox switch: returns the new state so the caller can colour its LED. */
export function toggle(initialRain) {
  if (!ac) buildAudio(initialRain == null ? 0.05 : initialRain);
  audioOn = !audioOn;
  if (audioOn) ac.resume(); else ac.suspend();
  return audioOn;
}
/* Leaving the tab shouldn't leave the tape playing to an empty room. */
export function followVisibility(hidden) {
  if (!ac || !audioOn) return;
  if (hidden) ac.suspend(); else ac.resume();
}
/* The hour of the day decides how hard it pours. */
export function setRain(v) { if (acNodes && acNodes.rain) acNodes.rain.gain.value = v; }
