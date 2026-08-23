/* THE HOUSE — the lens.
 *
 * The room was drawn flat: every light source faked its halo with an additive
 * sprite, because a real glow needs the frame itself to spill. This is that pass —
 * scene into an HDR buffer, pull the brightest pixels, blur them twice, lay them
 * back over the frame, then vignette and grade before the tone map.
 *
 * No EffectComposer (the addon isn't vendored) — just render targets and three
 * small shaders, so it stays a couple hundred lines and one file.
 *
 * ⚠️ COLOUR CORRECTNESS hinges on one three.js fact: tone mapping is only applied
 * when the render target is null. So the scene lands in our buffer as LINEAR HDR,
 * and the COMPOSITE shader — the one that draws to the canvas — applies ACES and
 * the sRGB transfer itself via the tonemapping/colorspace includes. The
 * intermediate materials all set toneMapped = false. Get this wrong and the room
 * is either double-graded or washed out.
 *
 * ⚠️ sceneRT.samples = 4 or the pass silently costs you the canvas's MSAA and
 * every edge in the room goes jaggy.
 */
import * as THREE from "three";

var VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

// pull only what's brighter than the threshold — in LINEAR light, before tone mapping
var BRIGHT = [
  "uniform sampler2D tDiffuse; uniform float threshold; uniform float softness;",
  "varying vec2 vUv;",
  "void main(){",
  "  vec3 c = texture2D(tDiffuse, vUv).rgb;",
  "  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));",
  "  gl_FragColor = vec4(c * smoothstep(threshold, threshold + softness, l), 1.0);",
  "}",
].join("\n");

// separable 9-tap gaussian
var BLUR = [
  "uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 texel;",
  "varying vec2 vUv;",
  "void main(){",
  "  vec2 o1 = dir * texel * 1.3846153846;",
  "  vec2 o2 = dir * texel * 3.2307692308;",
  "  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;",
  "  s += (texture2D(tDiffuse, vUv + o1).rgb + texture2D(tDiffuse, vUv - o1).rgb) * 0.3162162162;",
  "  s += (texture2D(tDiffuse, vUv + o2).rgb + texture2D(tDiffuse, vUv - o2).rgb) * 0.0702702703;",
  "  gl_FragColor = vec4(s, 1.0);",
  "}",
].join("\n");

// scene + bloom, graded, vignetted, THEN tone mapped to the canvas.
// ⚠️ ACES and the sRGB transfer are written out by hand ON PURPOSE. Using three's
// `#include <tonemapping_pars_fragment>` blows up with "redefinition / function
// already has a body" — r160 already injects those pars for a toneMapped material,
// so the include lands twice and the shader fails to compile (a silent BLACK frame,
// diagnosed only from the console). Owning the maths means no version can break it.
var COMPOSITE = [
  "uniform sampler2D tScene; uniform sampler2D tBloom;",
  "uniform float bloomStrength; uniform float vignette; uniform float lift;",
  "uniform float exposure; uniform vec3 tint;",
  // the second grade: the SPACE you are standing in. It multiplies with the per-hour
  // tint/lift above rather than replacing it — the hour owns the whole house, the room
  // owns its own identity, and neither fights the other. Identity (1,1,1)/1 = off.
  "uniform vec3 spaceTint; uniform float spaceLift;",
  // film grain: animated hash noise, luminance-weighted so shadows grain more than
  // highlights (that is where film actually grains, and where banding lives). 0 = off.
  "uniform float grainAmt; uniform float uTime;",
  "varying vec2 vUv;",
  "vec3 rrtOdtFit(vec3 v){",
  "  vec3 a = v * (v + 0.0245786) - 0.000090537;",
  "  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;",
  "  return a / b;",
  "}",
  "vec3 aces(vec3 c){", // three's ACESFilmicToneMapping, same matrices
  "  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);",
  "  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);",
  "  return clamp(OUT * rrtOdtFit(IN * c), 0.0, 1.0);",
  "}",
  "vec3 toSRGB(vec3 c){",
  "  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));",
  "}",
  "void main(){",
  "  vec3 c = texture2D(tScene, vUv).rgb;",
  "  c += texture2D(tBloom, vUv).rgb * bloomStrength;",
  "  c *= tint * lift * spaceTint * spaceLift;",
  "  vec2 q = vUv - 0.5;",
  "  c *= 1.0 - dot(q, q) * vignette;",   // corners fall off — the room gets a frame
  // ⚠️ the /0.6 is three's, not a fudge: its ACESFilmicToneMapping does
  // `color *= toneMappingExposure / 0.6`. Leave it out and the whole room renders
  // at 60% exposure — measured 58.4 → 39.4 mean luma against the un-posted frame.
  "  vec3 outc = toSRGB(aces(c * exposure / 0.6));",
  // grain AFTER the tone map, in display space — before it, the ACES shoulder eats it.
  // The hash is cheap and unrepeating enough at one draw per frame; time is quantised
  // to 24fps steps so the grain flickers like film rather than boiling like static.
  "  if (grainAmt > 0.0) {",
  "    float gt = floor(uTime * 24.0);",
  "    float h = fract(sin(dot(vUv * vec2(917.13, 533.7) + gt * 0.37, vec2(12.9898, 78.233))) * 43758.5453);",
  "    float lum = dot(outc, vec3(0.2126, 0.7152, 0.0722));",
  "    outc += (h - 0.5) * grainAmt * (1.0 - lum * 0.75);",
  "  }",
  "  gl_FragColor = vec4(outc, 1.0);",
  "}",
].join("\n");

export function createPost(renderer, scene, camera) {
  var gl = renderer.getContext();
  var isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  var api = { available: false, enabled: false, p: null, render: null, setSize: null, setGrade: null, cost: null };
  if (!isWebGL2) return api; // half-float MSAA targets are a WebGL2 story; the room just renders plain

  var p = {
    bloomThreshold: 0.62,   // LINEAR. The room is dark, but the day window is bright —
    bloomSoftness: 0.42,    // measured so walls/floor never bloom, only real light sources
    bloomStrength: 0.72,
    vignette: 0.34,
    grain: 0.0,             // film grain amount; 0 = off (the flagship pass sets it)
    lift: 1.0,
    tint: new THREE.Color(1, 1, 1),
    bloomScale: 4,          // bloom buffers at 1/4 res
  };
  api.p = p;

  var quad = new THREE.BufferGeometry();
  quad.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  quad.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  var fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var fsScene = new THREE.Scene();
  var fsMesh = new THREE.Mesh(quad, null);
  fsMesh.frustumCulled = false;
  fsScene.add(fsMesh);

  function rt(w, h, samples) {
    var t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: samples > 0, stencilBuffer: false,
    });
    if (samples > 0) t.samples = samples; // ⚠️ without this the whole room goes jaggy
    return t;
  }
  var size = new THREE.Vector2();
  renderer.getSize(size);
  var dpr = renderer.getPixelRatio();
  var W = Math.max(1, Math.floor(size.x * dpr)), H = Math.max(1, Math.floor(size.y * dpr));
  var sceneRT = rt(W, H, 4);
  var bw = Math.max(1, Math.floor(W / p.bloomScale)), bh = Math.max(1, Math.floor(H / p.bloomScale));
  var bloomA = rt(bw, bh, 0), bloomB = rt(bw, bh, 0);

  var brightMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, threshold: { value: p.bloomThreshold }, softness: { value: p.bloomSoftness } },
    vertexShader: VERT, fragmentShader: BRIGHT, depthTest: false, depthWrite: false,
  });
  brightMat.toneMapped = false;
  var blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, texel: { value: new THREE.Vector2(1 / bw, 1 / bh) } },
    vertexShader: VERT, fragmentShader: BLUR, depthTest: false, depthWrite: false,
  });
  blurMat.toneMapped = false;
  var compMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: sceneRT.texture }, tBloom: { value: bloomB.texture },
      bloomStrength: { value: p.bloomStrength }, vignette: { value: p.vignette },
      lift: { value: p.lift }, tint: { value: new THREE.Vector3(1, 1, 1) },
      spaceTint: { value: new THREE.Vector3(1, 1, 1) }, spaceLift: { value: 1 },
      grainAmt: { value: 0 }, uTime: { value: 0 },
      exposure: { value: renderer.toneMappingExposure },
    },
    vertexShader: VERT, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false,
  });
  // false: the composite does ACES + sRGB itself. Leaving it true makes three inject a
  // SECOND copy of the tone-mapping pars and the shader refuses to compile.
  compMat.toneMapped = false;

  function pass(mat, target) {
    fsMesh.material = mat;
    renderer.setRenderTarget(target || null);
    renderer.render(fsScene, fsCam);
  }

  api.available = true;
  api.enabled = true;

  api.setSize = function () {
    renderer.getSize(size);
    dpr = renderer.getPixelRatio();
    W = Math.max(1, Math.floor(size.x * dpr)); H = Math.max(1, Math.floor(size.y * dpr));
    sceneRT.setSize(W, H);
    bw = Math.max(1, Math.floor(W / p.bloomScale)); bh = Math.max(1, Math.floor(H / p.bloomScale));
    bloomA.setSize(bw, bh); bloomB.setSize(bw, bh);
    blurMat.uniforms.texel.value.set(1 / bw, 1 / bh);
  };

  // a gentle per-hour wash — the room's own lamp, not an Instagram filter
  api.setGrade = function (r, g, b, lift) {
    compMat.uniforms.tint.value.set(r, g, b);
    compMat.uniforms.lift.value = lift == null ? 1 : lift;
  };
  // the space's own grade, multiplied with the hour's. Lerped by the caller.
  api.setSpaceGrade = function (r, g, b, lift) {
    compMat.uniforms.spaceTint.value.set(r, g, b);
    compMat.uniforms.spaceLift.value = lift == null ? 1 : lift;
  };
  api.setTime = function (t) { compMat.uniforms.uTime.value = t; };

  api.render = function () {
    if (!api.enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    // 1) the room, into HDR (linear — tone mapping does not run for a non-null target)
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    // 2) pull the bright bits
    brightMat.uniforms.tDiffuse.value = sceneRT.texture;
    brightMat.uniforms.threshold.value = p.bloomThreshold;
    brightMat.uniforms.softness.value = p.bloomSoftness;
    pass(brightMat, bloomA);
    // 3) blur them, twice, separably
    blurMat.uniforms.tDiffuse.value = bloomA.texture; blurMat.uniforms.dir.value.set(1, 0);
    pass(blurMat, bloomB);
    blurMat.uniforms.tDiffuse.value = bloomB.texture; blurMat.uniforms.dir.value.set(0, 1);
    pass(blurMat, bloomA);
    blurMat.uniforms.tDiffuse.value = bloomA.texture; blurMat.uniforms.dir.value.set(1, 0);
    pass(blurMat, bloomB);
    blurMat.uniforms.tDiffuse.value = bloomB.texture; blurMat.uniforms.dir.value.set(0, 1);
    pass(blurMat, bloomA);
    // 4) lay it back over the frame, grade, vignette, tone map to the canvas
    compMat.uniforms.tScene.value = sceneRT.texture;
    compMat.uniforms.tBloom.value = bloomA.texture;
    compMat.uniforms.bloomStrength.value = p.bloomStrength;
    compMat.uniforms.vignette.value = p.vignette;
    compMat.uniforms.grainAmt.value = p.grain;
    compMat.uniforms.exposure.value = renderer.toneMappingExposure; // stay in step with the room
    pass(compMat, null);
  };

  // GPU cost, honestly measured. ⚠️ gl.finish() + wall clock does NOT work in Chrome
  // (it reports post as *faster* than off, which is impossible) — use the timer query.
  api.cost = function (frames) {
    var ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (!ext) return Promise.resolve(null);
    var n = frames || 30, q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    for (var i = 0; i < n; i++) api.render();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    return new Promise(function (res) {
      (function poll() {
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return setTimeout(poll, 16);
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return res(null);
        res(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 / n); // ms per frame
      })();
    });
  };

  api.dispose = function () {
    sceneRT.dispose(); bloomA.dispose(); bloomB.dispose();
    brightMat.dispose(); blurMat.dispose(); compMat.dispose(); quad.dispose();
  };
  return api;
}
