// 2D instrument geometry library: front view + top view.
// One drawing style per instrument category, scaled only by the model's size (width W × depth D × height H), so switching models changes proportions, not style.
// Front view: MODELS[category].front(g, c) → returns the container holder point; c = { id, d, x, yb, L, T, W, H }
// Top view: MODELS[category].top(g, c); c = { id, d, cx, cy, L, T, W, D }
// Uses globals from studio.js: el, fmt, best. Syringe pumps are in pump.js.
"use strict";

// ---------------------------------------------------------------- parts
const M = {
  rect(g, x, y, w, h, cls, ex = {}) {
    return el("rect", { x, y, width: Math.max(0, w), height: Math.max(0, h), rx: ex.rx ?? Math.min(12, Math.min(w, h) * 0.12), class: cls, ...ex }, g);
  },
  circ(g, cx, cy, r, cls, ex = {}) { return el("circle", { cx, cy, r: Math.max(0, r), class: cls, ...ex }, g); },
  line(g, x1, y1, x2, y2, cls, ex = {}) { return el("line", { x1, y1, x2, y2, class: cls, ...ex }, g); },
  path(g, d, cls, ex = {}) { return el("path", { d, class: cls, ...ex }, g); },
  text(g, x, y, s, size, cls = "mdl-t", anchor = "middle") { return el("text", { x, y, "font-size": size, class: cls, "text-anchor": anchor }, g, s); },
  screen(g, x, y, w, h, l1, l2) {
    M.rect(g, x, y, w, h, "screen", { rx: Math.min(6, h * 0.2) });
    const fs = Math.max(5, Math.min(22, h * (l2 ? 0.36 : 0.5), w / Math.max(4, String(l1).length) * 1.6));
    el("text", { x: x + fs * 0.4, y: y + h * (l2 ? 0.46 : 0.66), class: "screen-t", "font-size": fs }, g, l1);
    if (l2) el("text", { x: x + fs * 0.4, y: y + h * 0.84, class: "screen-s", "font-size": fs * 0.7 }, g, l2);
  },
  led(g, cx, cy, r, on, color = "#5fd35f") { M.circ(g, cx, cy, r, "mdl-led", { fill: on ? color : "#4a6656" }); },
  knob(g, cx, cy, r) { M.circ(g, cx, cy, r, "knob"); M.line(g, cx, cy, cx, cy - r * 0.8, "mdl-knob-mark"); },
  vents(g, x, y, w, n, gap) { for (let i = 0; i < n; i++) M.line(g, x, y + i * gap, x + w, y + i * gap, "mdl-vent"); },
  window(g, x, y, w, h) { return M.rect(g, x, y, w, h, "mdl-glass", { rx: Math.min(8, Math.min(w, h) * 0.08) }); },
  glow(T, lo = 40, hi = 900) {                        // temperature → glow colour and intensity
    const k = Math.max(0, Math.min(1, ((T ?? 22) - lo) / (hi - lo)));
    return { k, color: `rgb(255,${Math.round(190 - 130 * k)},${Math.round(90 - 60 * k)})` };
  },
};
const mOn = (d, f) => (best(d, f) ?? 0) > 0;
function mWaveColor(nm) {                             // visible wavelength → display colour (UV / IR shown violet / deep red)
  const w = Math.max(380, Math.min(700, nm || 550));
  const stops = [[380, [130, 0, 200]], [440, [40, 60, 255]], [490, [0, 200, 255]], [530, [60, 230, 60]], [580, [255, 230, 0]], [620, [255, 120, 0]], [700, [220, 0, 0]]];
  for (let i = 1; i < stops.length; i++) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i];
    if (w <= b) { const k = (w - a) / (b - a); return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(",")})`; }
  }
  return "rgb(220,0,0)";
}
const mNum = (d, f, n = 3) => { const v = best(d, f); return typeof v === "number" ? fmt(v, n) : "—"; };

// ---------------------------------------------------------------- front view
const FRONT = {
  cold_bath({ g, x, L, T, W, H, d }) {                          // Dewar cold bath
    M.path(g, `M${L},${T + 10} V${T + H - W * 0.3} Q${L},${T + H} ${x},${T + H} Q${L + W},${T + H} ${L + W},${T + H - W * 0.3} V${T + 10} Z`, "mdl-metal");
    M.rect(g, L - 6, T, W + 12, 14, "dev-dark", { rx: 5 });
    const t = best(d, "bath_temperature") ?? 22, cold = Math.max(0, Math.min(1, (22 - t) / 100));
    M.rect(g, L + 10, T + 18, W - 20, H * 0.5, "mdl-liquid", { fill: `rgb(${200 - 60 * cold},${225 - 20 * cold},${245})`, rx: 6 });
    M.text(g, x, T + H * 0.86, `${mNum(d, "bath_temperature")} °C`, Math.max(10, W * 0.1), "mdl-t-dark");
    return { x, y: T + H * 0.45, inBath: { x: L + 10, y: T + 18, w: W - 20, h: H * 0.32 } };
  },
  contact_angle_stage({ g, x, L, T, W, H, d, yb }) {            // contact-angle stage: camera + sample stage + backlight
    M.rect(g, L, yb - H * 0.3, W, H * 0.3, "dev-body");
    M.rect(g, L + 2, yb - H * 0.95, W * 0.22, H * 0.4, "dev-dark");                         // camera
    M.circ(g, L + W * 0.24, yb - H * 0.75, H * 0.14, "mdl-lens");
    M.rect(g, L + W * 0.8, yb - H * 0.9, W * 0.18, H * 0.5, "mdl-lamp");                    // backlight
    M.rect(g, x - W * 0.2, yb - H * 0.42, W * 0.4, H * 0.12, "mdl-metal");                  // sample stage
    const ang = best(d, "contact_angle");
    if (typeof ang === "number") M.text(g, x, T - 6, `θ ${fmt(ang, 3)}°`, Math.max(9, W * 0.1), "mdl-t");
    return { x, y: yb - H * 0.42 };
  },
  dls({ g, x, L, T, W, H, d }) {                                // particle sizer: box + sample chamber top right
    M.rect(g, L, T + H * 0.1, W, H * 0.9, "dev-body");
    M.rect(g, L + W * 0.58, T, W * 0.36, H * 0.2, "dev-panel");                             // sample chamber lid
    M.rect(g, L + W * 0.06, T + H * 0.3, W * 0.48, H * 0.12, "mdl-stripe");
    M.screen(g, L + W * 0.06, T + H * 0.5, W * 0.48, H * 0.32, `${mNum(d, "z_average")} nm`, `PDI ${mNum(d, "pdi", 2)}`);
    M.led(g, L + W * 0.88, T + H * 0.5, W * 0.025, mOn(d, "running"));
    return { x: L + W * 0.76, y: T };
  },
  fluorimeter({ g, x, L, T, W, H, d }) {                        // fluorimeter: wide body + two monochromators + central sample chamber
    M.rect(g, L, T + H * 0.25, W, H * 0.75, "dev-body");
    M.rect(g, L + W * 0.05, T + H * 0.05, W * 0.3, H * 0.25, "dev-dark");
    M.rect(g, L + W * 0.65, T + H * 0.05, W * 0.3, H * 0.25, "dev-dark");
    M.rect(g, L + W * 0.4, T + H * 0.12, W * 0.2, H * 0.16, "dev-panel");                   // sample chamber
    if ((best(d, "intensity") ?? 0) > 0) {                                                  // excitation in, emission out
      M.line(g, L + W * 0.35, T + H * 0.17, L + W * 0.47, T + H * 0.2, "mdl-beam-line", { stroke: mWaveColor(best(d, "excitation")) });
      M.line(g, L + W * 0.53, T + H * 0.2, L + W * 0.65, T + H * 0.17, "mdl-beam-line", { stroke: mWaveColor(best(d, "emission")) });
    }
    M.screen(g, L + W * 0.06, T + H * 0.45, W * 0.38, H * 0.38, `${mNum(d, "intensity", 4)}`, `Ex ${mNum(d, "excitation")} / Em ${mNum(d, "emission")}`);
    return { x, y: T + H * 0.12 };
  },
  ftir({ g, x, L, T, W, H, d }) {                               // FTIR: body + ATR crystal and pressure arm top right
    M.rect(g, L, T + H * 0.2, W, H * 0.8, "dev-body");
    M.rect(g, L + W * 0.55, T + H * 0.12, W * 0.38, H * 0.1, "mdl-metal");                  // ATR stage
    M.path(g, `M${L + W * 0.9},${T + H * 0.12} V${T - H * 0.1} H${L + W * 0.72} V${T + H * 0.04}`, "mdl-arm");
    M.screen(g, L + W * 0.07, T + H * 0.35, W * 0.42, H * 0.4, mOn(d, "running") ? "Scanning" : "Ready", "FTIR");
    M.vents(g, L + W * 0.58, T + H * 0.45, W * 0.32, 4, H * 0.1);
    return { x: L + W * 0.74, y: T + H * 0.12 };
  },
  furnace({ g, x, L, T, W, H, d, yb }) {                        // muffle furnace: door window glows with temperature, controller bottom right
    M.rect(g, L, T, W, H, "dev-body");
    M.vents(g, L + W * 0.15, T + H * 0.06, W * 0.5, 3, H * 0.03);
    const cw = { x: L + W * 0.08, y: T + H * 0.18, w: W * 0.6, h: H * 0.5 };
    M.rect(g, cw.x, cw.y, cw.w, cw.h, "dev-dark");                                         // chamber
    const gl = M.glow(best(d, "temperature"), 60, 1000);
    if (gl.k > 0) M.rect(g, cw.x, cw.y, cw.w, cw.h, "mdl-hot", { fill: gl.color, "fill-opacity": 0.2 + 0.6 * gl.k });
    M.rect(g, cw.x - 6, cw.y + cw.h + 6, cw.w + 12, H * 0.05, "mdl-metal");                 // door handle
    M.screen(g, L + W * 0.74, T + H * 0.22, W * 0.2, H * 0.16, `${mNum(d, "temperature", 4)}`, "°C");
    M.led(g, L + W * 0.84, T + H * 0.5, W * 0.025, mOn(d, "running"), "#ff7a3d");
    return { x: cw.x + cw.w / 2, y: cw.y + cw.h - 4 };
  },
  gpc({ g, x, L, T, W, H, d }) {                                // GPC: solvent bottles + three stacked modules + column oven
    for (let i = 0; i < 3; i++) M.rect(g, L + W * (0.1 + i * 0.28), T, W * 0.2, H * 0.14, "mdl-bottle");
    for (let i = 0; i < 3; i++) M.rect(g, L, T + H * (0.16 + i * 0.2), W * 0.62, H * 0.18, "dev-body");
    M.rect(g, L + W * 0.66, T + H * 0.16, W * 0.34, H * 0.84, "dev-body");                  // column oven + detector
    M.rect(g, L + W * 0.7, T + H * 0.22, W * 0.26, H * 0.4, "dev-dark");
    M.screen(g, L + W * 0.05, T + H * 0.78, W * 0.55, H * 0.18, `Mn ${mNum(d, "Mn", 4)}`, `PDI ${mNum(d, "PDI", 3)}`);
    return { x: L + W * 0.31, y: T + H * 0.16 };
  },
  heater_shaker({ g, x, L, T, W, H, d, yb }) {                  // heater-shaker module: base + aluminium block + side clamps
    M.rect(g, L, yb - H * 0.55, W, H * 0.55, "dev-body");
    M.rect(g, L + W * 0.1, T, W * 0.8, H * 0.45, "mdl-metal", (best(d, "speed") ?? 0) > 50 ? { class: "mdl-metal mdl-shake" } : {});
    const latch = mOn(d, "latch");
    M.rect(g, L + W * 0.02, T + (latch ? 0 : H * 0.15), W * 0.06, H * 0.3, "dev-dark");
    M.rect(g, L + W * 0.92, T + (latch ? 0 : H * 0.15), W * 0.06, H * 0.3, "dev-dark");
    M.text(g, x, yb - H * 0.18, `${mNum(d, "temperature")}° ${mNum(d, "speed", 4)} rpm`, Math.max(7, W * 0.075), "mdl-t");
    return { x, y: T, spread: W * 0.7 };
  },
  incubator_shaker({ g, x, L, T, W, H, d }) {                   // incubator shaker: cabinet + glass door + shaking platform
    M.rect(g, L, T, W, H, "dev-body");
    M.window(g, L + W * 0.06, T + H * 0.08, W * 0.88, H * 0.62);
    M.rect(g, L + W * 0.1, T + H * 0.58, W * 0.8, H * 0.05, (best(d, "speed") ?? 0) > 20 ? "mdl-metal mdl-shake" : "mdl-metal");   // shaking platform
    M.screen(g, L + W * 0.06, T + H * 0.76, W * 0.4, H * 0.16, `${mNum(d, "temperature")} °C`, `${mNum(d, "speed", 4)} rpm`);
    M.knob(g, L + W * 0.8, T + H * 0.84, H * 0.05);
    return { x, y: T + H * 0.58, spread: W * 0.75 };
  },
  liquid_handler({ g, x, L, T, W, H, d, yb }) {                 // liquid handler: deck + columns + gantry + pipetting head
    M.rect(g, L, yb - H * 0.1, W, H * 0.1, "dev-body");
    M.rect(g, L, T, W * 0.06, H * 0.9, "dev-body"); M.rect(g, L + W * 0.94, T, W * 0.06, H * 0.9, "dev-body");
    M.rect(g, L, T, W, H * 0.08, "dev-body");
    M.window(g, L + W * 0.06, T + H * 0.08, W * 0.88, H * 0.82);
    M.rect(g, L + W * 0.08, T + H * 0.14, W * 0.84, H * 0.05, "mdl-metal");                 // gantry beam
    const hx = L + W * (mOn(d, "running") ? 0.62 : 0.3);
    M.rect(g, hx - W * 0.05, T + H * 0.12, W * 0.1, H * 0.22, "dev-dark");                  // pipetting head
    M.line(g, hx - W * 0.02, T + H * 0.34, hx - W * 0.02, T + H * 0.44, "mdl-tip"); M.line(g, hx + W * 0.02, T + H * 0.34, hx + W * 0.02, T + H * 0.44, "mdl-tip");
    M.text(g, L + W * 0.1, yb - H * 0.03, "OT-2", Math.max(10, W * 0.04), "mdl-t-dark", "start");
    return { x, y: yb - H * 0.1, spread: W * 0.82 };
  },
  optrode({ g, x, L, T, W, H, d, yb }) {                        // optrode: small box + coiled fibre + probe holder
    M.rect(g, L, T, W, H, "dev-body");
    M.circ(g, L + W * 0.3, T + H * 0.5, H * 0.3, "mdl-fiber");
    const A = best(d, "absorbance"), wl = best(d, "wavelength");
    M.screen(g, L + W * 0.5, T + H * 0.15, W * 0.45, H * 0.6, A == null ? "—" : `A ${fmt(A, 3)}`, wl ? `${fmt(wl, 3)} nm` : "");
    M.rect(g, L + W - 10, T - 140, 6, 140, "dev-dark");
    if (A != null && wl) M.circ(g, L + W - 7, T - 140, 9, "mdl-beam", { fill: mWaveColor(wl) });      // light at the measuring wavelength
    return { x, y: T, port: { x: L + W - 7, y: T - 140 } };
  },
  plate_reader({ g, x, L, T, W, H, d, yb }) {                   // plate reader: body + plate carrier sticking out front
    M.rect(g, L, T, W, H, "dev-body");
    M.rect(g, L + W * 0.08, yb - H * 0.32, W * 0.6, H * 0.08, "mdl-metal");                 // plate carrier
    M.screen(g, L + W * 0.08, T + H * 0.12, W * 0.5, H * 0.32, mOn(d, "running") ? "Reading" : "Ready", `${mNum(d, "temperature")} °C`);
    M.led(g, L + W * 0.85, T + H * 0.2, W * 0.025, mOn(d, "running"));
    M.vents(g, L + W * 0.7, T + H * 0.4, W * 0.22, 4, H * 0.06);
    return { x: L + W * 0.38, y: yb - H * 0.32, spread: W * 0.55 };
  },
  pressure_reactor({ g, x, L, T, W, H, d, yb }) {               // autoclave: controller base + stand + vessel + head with pressure gauge
    M.rect(g, L, yb - H * 0.18, W, H * 0.18, "dev-body");
    M.screen(g, L + W * 0.08, yb - H * 0.15, W * 0.45, H * 0.12, `${mNum(d, "temperature")} °C`, `${mNum(d, "pressure")} bar`);
    M.rect(g, L + W * 0.82, T + H * 0.1, W * 0.08, H * 0.72, "dev-dark");                   // stand
    const vx = x - W * 0.08, vw = W * 0.5, vt = T + H * 0.26, vh = H * 0.5;
    M.rect(g, vx - vw / 2, vt, vw, vh, "mdl-steel", { rx: vw * 0.12 });                     // vessel
    const gl = M.glow(best(d, "temperature"), 40, 350);
    if (gl.k > 0) M.rect(g, vx - vw / 2, vt + vh * 0.45, vw, vh * 0.55, "mdl-hot", { fill: gl.color, "fill-opacity": 0.15 + 0.5 * gl.k, rx: vw * 0.12 });
    M.rect(g, vx - vw * 0.6, vt - H * 0.08, vw * 1.2, H * 0.08, "mdl-steel");               // head
    for (let i = 0; i < 5; i++) M.circ(g, vx - vw * 0.5 + i * vw * 0.25, vt - H * 0.04, H * 0.012, "mdl-bolt");
    const gx = vx + vw * 0.2, gy = vt - H * 0.17, gr = W * 0.09;                            // pressure gauge
    M.line(g, gx, gy + gr, gx, vt - H * 0.08, "mdl-arm");
    M.circ(g, gx, gy, gr, "mdl-gauge");
    const p = Math.max(0, Math.min(1, (best(d, "pressure") ?? 1) / 200)), a = Math.PI * (0.75 + 1.5 * p);
    M.line(g, gx, gy, gx + Math.cos(a) * gr * 0.8, gy + Math.sin(a) * gr * 0.8, "mdl-needle");
    return { x: vx, y: vt + vh - 6 };
  },
  proxy_viscometer({ g, x, L, T, W, H, d, yb }) {               // proxy viscometer: small block + catch dish + spout
    M.rect(g, L, yb - H * 0.5, W, H * 0.5, "dev-body");
    M.rect(g, x - W * 0.3, yb - H * 0.62, W * 0.6, H * 0.12, "mdl-metal");
    M.rect(g, L + W * 0.75, T, W * 0.1, H * 0.4, "dev-dark");
    M.screen(g, L + W * 0.06, yb - H * 0.42, W * 0.6, H * 0.3, `${mNum(d, "apparent_viscosity", 3)} mPa·s`, "");
    M.led(g, L + W * 0.82, yb - H * 0.28, W * 0.04, mOn(d, "running"));
    return { x, y: yb - H * 0.62 };
  },
  tensiometer({ g, x, L, T, W, H, d, yb }) {                    // pendant-drop tensiometer: optical rail + camera + light + central needle
    M.rect(g, L, yb - H * 0.12, W, H * 0.12, "dev-body");
    M.rect(g, L + W * 0.02, yb - H * 0.45, W * 0.2, H * 0.3, "dev-dark");
    M.circ(g, L + W * 0.23, yb - H * 0.3, H * 0.07, "mdl-lens");
    M.rect(g, L + W * 0.8, yb - H * 0.45, W * 0.16, H * 0.3, "mdl-lamp");
    M.rect(g, L + W * 0.62, T - H * 0.08, W * 0.03, yb - H * 0.12 - (T - H * 0.08), "dev-dark");      // column
    M.rect(g, x - W * 0.04, T - H * 0.06, (L + W * 0.65) - (x - W * 0.04), H * 0.05, "dev-dark");   // arm
    M.rect(g, x - W * 0.03, T, W * 0.06, H * 0.35, "mdl-steel");                            // syringe
    M.line(g, x, T + H * 0.35, x, T + H * 0.5, "mdl-tip");
    const st = best(d, "surface_tension");
    if (typeof st === "number") M.text(g, x, T - 8, `γ ${fmt(st, 3)} mN/m`, Math.max(9, W * 0.04), "mdl-t");
    return { x, y: yb - H * 0.12 };
  },
  tga({ g, x, L, T, W, H, d }) {                                // TGA: body + furnace tube on top + autosampler tray in front
    M.rect(g, L, T + H * 0.3, W, H * 0.7, "dev-body");
    M.rect(g, L + W * 0.3, T, W * 0.4, H * 0.32, "mdl-steel", { rx: W * 0.06 });            // furnace
    if (mOn(d, "running")) M.rect(g, L + W * 0.3, T, W * 0.4, H * 0.32, "mdl-hot", { fill: "#ff8a3d", "fill-opacity": 0.35, rx: W * 0.06 });
    M.rect(g, L + W * 0.1, T + H * 0.36, W * 0.8, H * 0.06, "mdl-metal");                   // sample tray
    M.screen(g, L + W * 0.08, T + H * 0.52, W * 0.42, H * 0.28, mOn(d, "running") ? "Heating" : "Ready", "TGA");
    M.vents(g, L + W * 0.6, T + H * 0.55, W * 0.3, 4, H * 0.06);
    return { x, y: T + H * 0.36 };
  },
  xrd({ g, x, L, T, W, H, d }) {                                // XRD: cabinet + glass door + goniometer + warning light
    M.rect(g, L, T, W, H, "dev-body");
    M.window(g, L + W * 0.06, T + H * 0.08, W * 0.62, H * 0.62);
    const gx = L + W * 0.37, gy = T + H * 0.52, gr = Math.min(W * 0.26, H * 0.3);
    M.path(g, `M${gx - gr},${gy} A${gr},${gr} 0 0 1 ${gx + gr},${gy}`, "mdl-arc");           // goniometer circle
    const scan = mOn(d, "running") ? { class: "mdl-swing", style: `transform-origin:${gx}px ${gy}px` } : {};
    const arms = el("g", scan, g);                                                          // tube + detector swing about the sample while scanning
    M.rect(arms, gx - gr * 0.95, gy - gr * 0.55, gr * 0.4, gr * 0.22, "mdl-steel", { transform: `rotate(-25 ${gx - gr * 0.75} ${gy - gr * 0.45})` });
    M.rect(arms, gx + gr * 0.55, gy - gr * 0.55, gr * 0.4, gr * 0.22, "dev-dark", { transform: `rotate(25 ${gx + gr * 0.75} ${gy - gr * 0.45})` });
    M.rect(g, gx - gr * 0.15, gy - 6, gr * 0.3, 12, "mdl-metal");                          // sample stage
    M.rect(g, L + W * 0.74, T + H * 0.1, W * 0.2, H * 0.6, "dev-dark");
    M.screen(g, L + W * 0.76, T + H * 0.14, W * 0.16, H * 0.12, mOn(d, "running") ? "Scan" : "Ready", "XRD");
    M.circ(g, L + W * 0.84, T - H * 0.03, W * 0.025, "mdl-led", { fill: mOn(d, "running") ? "#ffb347" : "#4a6656" });
    return { x: gx, y: gy - 6 };
  },
};

// benchtop meter (pH / conductivity / ion / ORP): sloped body + screen + keys + electrode stand on the right (base, rod, arm, clamp)
function frontMeter({ g, x, L, T, W, H, d, yb }, line1, line2) {
  const bodyH = Math.max(H, 60), top = yb - bodyH, bw = W * 0.7;
  M.path(g, `M${L},${yb} V${top + bodyH * 0.35} L${L + bw * 0.25},${top} H${L + bw} V${yb} Z`, "dev-body");
  M.screen(g, L + bw * 0.28, top + bodyH * 0.12, bw * 0.62, bodyH * 0.42, line1, line2);
  for (let i = 0; i < 3; i++) M.circ(g, L + bw * (0.18 + i * 0.25), top + bodyH * 0.75, Math.min(bw, bodyH) * 0.06, "knob");
  const sx = L + W * 0.86, rodTop = yb - 230;
  M.rect(g, L + W * 0.74, yb - 12, W * 0.26, 12, "dev-dark", { rx: 4 });                   // base
  M.rect(g, sx - 4, rodTop, 8, yb - 12 - rodTop, "mdl-steel", { rx: 3 });                   // rod
  M.rect(g, sx - 70, rodTop + 20, 78, 10, "mdl-steel", { rx: 4 });                          // arm
  M.rect(g, sx - 76, rodTop + 14, 16, 22, "dev-dark", { rx: 4 });                           // electrode clamp
  return { x: L + bw / 2, y: top, port: { x: sx - 68, y: rodTop + 36 } };
}
FRONT.ph_meter = (c) => frontMeter(c, `pH ${mNum(c.d, "ph")}`, `${mNum(c.d, "temperature")} °C`);
FRONT.conductivity_meter = (c) => frontMeter(c, mNum(c.d, "conductivity"), "mS/cm");
FRONT.ion_meter = (c) => frontMeter(c, `${mNum(c.d, "potential")}`, "mV");
FRONT.orp_meter = (c) => frontMeter(c, `${mNum(c.d, "potential")}`, "mV ORP");
FRONT.photoreactor = ({ g, x, L, T, W, H, d, yb }) => {          // photoreactor: base + column + lamp head (heat sink) + light cone
  const lit = mOn(d, "power");
  M.rect(g, L, yb - H * 0.1, W, H * 0.1, "dev-body");
  M.rect(g, L + W * 0.85, T + H * 0.05, W * 0.06, H * 0.85, "mdl-steel", { rx: 3 });
  M.rect(g, x - W * 0.05, T + H * 0.08, W * 0.85, H * 0.05, "mdl-steel", { rx: 3 });
  M.rect(g, x - W * 0.2, T + H * 0.1, W * 0.4, H * 0.22, "dev-dark");
  for (let i = 0; i < 5; i++) M.line(g, x - W * 0.16 + i * W * 0.08, T + H * 0.12, x - W * 0.16 + i * W * 0.08, T + H * 0.3, "mdl-fin");
  if (lit) M.path(g, `M${x - W * 0.18},${T + H * 0.32} L${x - W * 0.45},${yb - H * 0.1} H${x + W * 0.45} L${x + W * 0.18},${T + H * 0.32} Z`, "mdl-hot", { fill: "#5aa2ff", "fill-opacity": 0.28 });
  M.rect(g, x - W * 0.18, T + H * 0.31, W * 0.36, H * 0.03, "mdl-lamp-top", { fill: lit ? "#7db8ff" : "#3d5a4a" });
  return { x, y: yb - H * 0.1 };
};

// foam analyser: base + backlight + glass foam column (liquid level and foam layer drawn from sim data) + side camera; rising bubbles in the liquid while foaming
FRONT.foam_analyzer = ({ g, id, x, L, T, W, H, d, yb }) => {
  const a = d.anim || {}, baseH = H * 0.12;
  M.rect(g, L, yb - baseH, W, baseH, "dev-body");
  M.rect(g, L + W * 0.12, T, W * 0.5, H - baseH, "mdl-lamp", { "fill-opacity": 0.55 });            // backlight
  const cx = L + W * 0.37, cw = W * 0.26, ct = T + H * 0.06, ch = H - baseH - H * 0.08;            // column
  const cap = a.capacity_mL || 300, liq = Math.max(0, a.liquid_mL || 0), foam = Math.max(0, a.foam_mL || 0);
  const hl = ch * Math.min(1, liq / cap), hf = Math.min(ch - hl, ch * foam / cap);
  if (hl > 0) M.rect(g, cx - cw / 2 + 2, ct + ch - hl, cw - 4, hl, "mdl-liquid", { fill: "#9fd0e6", rx: 2 });
  if (hf > 0.5) {
    const fy = ct + ch - hl - hf;
    M.rect(g, cx - cw / 2 + 2, fy, cw - 4, hf, "mdl-foam", { rx: 2 });
    const rb = Math.max(1.2, Math.min(cw * 0.12, (a.bubble_mm || 0.3) * 4));                       // coarser bubbles drawn larger
    const nx = Math.max(2, Math.floor((cw - 6) / (rb * 2.2))), ny = Math.max(1, Math.floor(hf / (rb * 2.2)));
    for (let j = 0; j < Math.min(ny, 40); j++) for (let i = 0; i < nx; i++)
      M.circ(g, cx - cw / 2 + 4 + rb + i * (cw - 8 - 2 * rb) / Math.max(1, nx - 1) + (j % 2) * rb * 0.5, fy + rb + j * rb * 2.2, rb * (0.75 + 0.25 * ((i * 7 + j * 3) % 4) / 3), "mdl-bubble");
  }
  if (a.phase === "sparge" || a.phase === "stir") {                                                   // bubbles rising in the liquid
    for (let i = 0; i < 6; i++) M.circ(g, cx - cw * 0.3 + (i % 3) * cw * 0.3, ct + ch - 4, Math.max(1.5, cw * 0.05), "mdl-rise",
      { style: `animation-delay:-${((performance.now() / 1000 + i * 0.27) % 1.2).toFixed(2)}s; --rise:${-Math.max(4, hl - 4)}px` });
  }
  M.rect(g, cx - cw / 2, ct, cw, ch, "mdl-glass", { rx: 4 });
  for (let i = 1; i < 10; i++) M.line(g, cx + cw / 2 - cw * 0.18, ct + ch * i / 10, cx + cw / 2, ct + ch * i / 10, "syr-tick");   // graduations
  M.rect(g, L + W * 0.82, T + H * 0.38, W * 0.035, yb - baseH - (T + H * 0.38), "mdl-steel", { rx: 2 });   // camera mount
  M.rect(g, L + W * 0.72, T + H * 0.3, W * 0.22, H * 0.16, "dev-dark");                              // camera
  M.circ(g, L + W * 0.72, T + H * 0.38, Math.min(W, H) * 0.035, "mdl-lens");
  M.screen(g, L + W * 0.66, yb - baseH * 0.85, W * 0.3, baseH * 0.7, `${mNum(d, "foam_height_mm", 3)} mm`,
           (best(d, "half_life") ? `t½ ${fmt(best(d, "half_life") / 60, 3)} min` : (a.phase && a.phase !== "idle" ? { sparge: "Sparging", stir: "Stirring", record: "Recording" }[a.phase] || "" : "")));
  return { x: cx, y: ct + ch, drawsVessel: true, vessel: { x: cx, y: ct + ch, w: cw / 2, h: ch, top: ct } };
};

// ---------------------------------------------------------------- top view
function topMeter(g, c, stand = true) {                         // benchtop meter: body + screen + electrode stand
  const { L, T, W, D } = c;
  M.rect(g, L + W * 0.1, T + D * 0.12, W * 0.55, D * 0.45, "screen");
  for (let i = 0; i < 3; i++) M.circ(g, L + W * (0.2 + i * 0.18), T + D * 0.76, Math.min(W, D) * 0.05, "knob");
  if (stand) { M.circ(g, L + W * 0.85, T + D * 0.3, Math.min(W, D) * 0.1, "mdl-metal"); M.line(g, L + W * 0.85, T + D * 0.3, L + W * 0.85, T - D * 0.15, "mdl-arm"); }
}
const TOP = {
  hotplate_stirrer(g, { L, T, W, D, cx, d }) {
    const gl = M.glow(best(d, "plate_temperature"), 35, 340);
    M.circ(g, cx, T + D * 0.38, Math.min(W, D) * 0.4, "mdl-plate", gl.k > 0 ? { fill: `color-mix(in srgb, ${gl.color} ${Math.round(20 + 70 * gl.k)}%, #e8ecef)` } : {});
    M.knob(g, L + W * 0.25, T + D * 0.86, Math.min(W, D) * 0.07); M.knob(g, L + W * 0.75, T + D * 0.86, Math.min(W, D) * 0.07);
    M.rect(g, L + W * 0.38, T + D * 0.8, W * 0.24, D * 0.1, "screen");
  },
  heater_shaker(g, { L, T, W, D }) {
    M.rect(g, L + W * 0.1, T + D * 0.1, W * 0.8, D * 0.8, "mdl-metal");
    for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) M.circ(g, L + W * (0.18 + k * 0.128), T + D * (0.22 + r * 0.19), Math.min(W, D) * 0.035, "mdl-well");
    M.rect(g, L, T + D * 0.3, W * 0.06, D * 0.4, "dev-dark"); M.rect(g, L + W * 0.94, T + D * 0.3, W * 0.06, D * 0.4, "dev-dark");
  },
  thermostatic_bath(g, { L, T, W, D, d }) {
    const t = best(d, "bath_temperature") ?? 22, hot = Math.max(0, Math.min(1, (t - 22) / 70)), cold = Math.max(0, Math.min(1, (22 - t) / 22));
    M.rect(g, L + W * 0.08, T + D * 0.28, W * 0.84, D * 0.64, "mdl-liquid", { fill: `rgb(${150 + 100 * hot},${200 - 60 * hot + 30 * cold},${230 - 120 * hot + 25 * cold})` });
    M.rect(g, L + W * 0.08, T + D * 0.05, W * 0.84, D * 0.18, "dev-dark");
    M.rect(g, L + W * 0.15, T + D * 0.08, W * 0.4, D * 0.12, "screen");
  },
  cold_bath(g, { cx, cy, W, D, d }) {
    const r = Math.min(W, D) / 2, cold = Math.max(0, Math.min(1, (22 - (best(d, "bath_temperature") ?? 22)) / 100));
    M.circ(g, cx, cy, r, "mdl-metal"); M.circ(g, cx, cy, r * 0.8, "mdl-liquid", { fill: `rgb(${200 - 60 * cold},${225 - 20 * cold},245)` });
  },
  balance(g, { L, T, W, D, cx }) {
    M.rect(g, L + W * 0.08, T + D * 0.06, W * 0.84, D * 0.66, "mdl-glass");                 // draft shield
    M.circ(g, cx, T + D * 0.4, Math.min(W, D) * 0.25, "mdl-plate");
    M.rect(g, L + W * 0.2, T + D * 0.8, W * 0.6, D * 0.12, "screen");
  },
  ph_meter: (g, c) => topMeter(g, c), conductivity_meter: (g, c) => topMeter(g, c), ion_meter: (g, c) => topMeter(g, c), orp_meter: (g, c) => topMeter(g, c),
  optrode(g, c) { const { L, T, W, D } = c; M.rect(g, L + W * 0.5, T + D * 0.2, W * 0.4, D * 0.5, "screen"); M.circ(g, L + W * 0.28, T + D * 0.5, Math.min(W, D) * 0.2, "mdl-fiber"); },
  spectrophotometer(g, { L, T, W, D }) {
    M.rect(g, L + W * 0.55, T + D * 0.12, W * 0.38, D * 0.55, "dev-dark");                  // sample chamber lid
    M.rect(g, L + W * 0.08, T + D * 0.15, W * 0.4, D * 0.35, "screen");
    for (let i = 0; i < 4; i++) M.circ(g, L + W * (0.12 + i * 0.1), T + D * 0.72, Math.min(W, D) * 0.03, "knob");
  },
  fluorimeter(g, { L, T, W, D }) {
    M.rect(g, L + W * 0.05, T + D * 0.12, W * 0.3, D * 0.5, "dev-dark"); M.rect(g, L + W * 0.65, T + D * 0.12, W * 0.3, D * 0.5, "dev-dark");
    M.rect(g, L + W * 0.4, T + D * 0.2, W * 0.2, D * 0.34, "dev-panel");
    M.rect(g, L + W * 0.08, T + D * 0.72, W * 0.35, D * 0.18, "screen");
  },
  dls(g, { L, T, W, D, d }) {
    M.rect(g, L + W * 0.55, T + D * 0.08, W * 0.38, D * 0.28, "dev-panel"); M.circ(g, L + W * 0.74, T + D * 0.22, Math.min(W, D) * 0.07, "dev-dark");
    M.rect(g, L + W * 0.08, T + D * 0.5, W * 0.84, D * 0.08, "mdl-stripe");
    M.led(g, L + W * 0.15, T + D * 0.85, Math.min(W, D) * 0.03, mOn(d, "running"));
  },
  ftir(g, { L, T, W, D }) {
    M.circ(g, L + W * 0.72, T + D * 0.3, Math.min(W, D) * 0.12, "mdl-metal"); M.circ(g, L + W * 0.72, T + D * 0.3, Math.min(W, D) * 0.04, "mdl-crystal");
    M.line(g, L + W * 0.72, T + D * 0.3, L + W * 0.92, T + D * 0.1, "mdl-arm");
    M.rect(g, L + W * 0.08, T + D * 0.15, W * 0.38, D * 0.3, "screen");
    M.vents(g, L + W * 0.1, T + D * 0.6, W * 0.8, 4, D * 0.08);
  },
  furnace(g, { L, T, W, D, d }) {
    M.vents(g, L + W * 0.15, T + D * 0.15, W * 0.55, 5, D * 0.1);
    M.rect(g, L + W * 0.05, T + D * 0.88, W * 0.65, D * 0.08, "mdl-metal");                 // furnace door
    M.rect(g, L + W * 0.76, T + D * 0.6, W * 0.18, D * 0.3, "screen");
    const gl = M.glow(best(d, "temperature"), 60, 1000);
    if (gl.k > 0) M.rect(g, L + W * 0.12, T + D * 0.1, W * 0.6, D * 0.6, "mdl-hot", { fill: gl.color, "fill-opacity": 0.12 + 0.3 * gl.k });
  },
  gc(g, { L, T, W, D }) {
    M.rect(g, L + W * 0.1, T + D * 0.25, W * 0.6, D * 0.6, "dev-dark");                      // column oven door
    for (let i = 0; i < 2; i++) M.circ(g, L + W * (0.3 + i * 0.25), T + D * 0.12, Math.min(W, D) * 0.05, "mdl-metal");   // injection ports
    M.circ(g, L + W * 0.84, T + D * 0.18, Math.min(W, D) * 0.1, "mdl-plate");                // autosampler tower
    M.rect(g, L + W * 0.76, T + D * 0.5, W * 0.18, D * 0.3, "screen");
  },
  hplc(g, c) { TOP.gpc(g, c); },
  gpc(g, { L, T, W, D }) {
    for (let i = 0; i < 3; i++) M.circ(g, L + W * (0.2 + i * 0.3), T + D * 0.2, Math.min(W, D) * 0.08, "mdl-bottle");   // solvent bottles
    M.rect(g, L + W * 0.1, T + D * 0.42, W * 0.8, D * 0.18, "dev-dark");
    M.rect(g, L + W * 0.1, T + D * 0.68, W * 0.8, D * 0.2, "dev-panel");                     // autosampler lid
  },
  ms(g, { L, T, W, D, cx }) {
    M.circ(g, L + W * 0.3, T + D * 0.3, Math.min(W, D) * 0.15, "mdl-steel");                  // ion source
    M.rect(g, L + W * 0.5, T + D * 0.15, W * 0.4, D * 0.7, "dev-dark");                       // flight tube
    M.rect(g, L + W * 0.08, T + D * 0.62, W * 0.35, D * 0.25, "screen");
  },
  nmr(g, { cx, cy, W, D }) {
    const r = Math.min(W, D) / 2;
    M.circ(g, cx, cy, r * 0.95, "mdl-magnet"); M.circ(g, cx, cy, r * 0.7, "mdl-magnet2"); M.circ(g, cx, cy, r * 0.42, "mdl-magnet"); M.circ(g, cx, cy, r * 0.12, "dev-dark");
  },
  melting_point(g, { L, T, W, D }) {
    for (let i = 0; i < 3; i++) M.rect(g, L + W * (0.3 + i * 0.14), T + D * 0.12, W * 0.04, D * 0.25, "dev-dark");
    M.rect(g, L + W * 0.12, T + D * 0.5, W * 0.76, D * 0.35, "screen");
  },
  microwave_reactor(g, { L, T, W, D, cx, d }) {
    M.circ(g, L + W * 0.38, T + D * 0.42, Math.min(W, D) * 0.25, "dev-dark");
    if (mOn(d, "power")) M.circ(g, L + W * 0.38, T + D * 0.42, Math.min(W, D) * 0.25, "mdl-hot", { fill: "#ffb347", "fill-opacity": 0.35 });
    M.circ(g, L + W * 0.38, T + D * 0.42, Math.min(W, D) * 0.1, "mdl-metal");
    M.rect(g, L + W * 0.72, T + D * 0.15, W * 0.2, D * 0.55, "screen");
  },
  photoreactor(g, { cx, cy, W, D, d }) {
    const r = Math.min(W, D) / 2;
    M.circ(g, cx, cy, r * 0.9, "mdl-metal");
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; M.line(g, cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, "mdl-fin"); }
    M.circ(g, cx, cy, r * 0.4, "mdl-lamp-top", { fill: mOn(d, "power") ? "#7db8ff" : "#3d5a4a" });
  },
  flow_reactor(g, { L, T, W, D, d }) {
    M.rect(g, L, T, W * 0.38, D, "dev-body");
    for (let i = 0; i < 2; i++) M.circ(g, L + W * (0.1 + i * 0.17), T + D * 0.25, Math.min(W, D) * 0.07, "mdl-metal");
    M.rect(g, L + W * 0.04, T + D * 0.55, W * 0.3, D * 0.3, "screen");
    const ccx = L + W * 0.7, ccy = T + D * 0.5;
    for (let i = 0; i < 4; i++) M.circ(g, ccx, ccy, Math.min(W, D) * (0.08 + i * 0.06), "mdl-coil", { "stroke-opacity": mOn(d, "pumping") ? 1 : 0.6 });
  },
  potentiostat(g, { L, T, W, D }) {
    M.rect(g, L + W * 0.08, T + D * 0.15, W * 0.5, D * 0.5, "screen");
    ["#e66767", "#5aa2ff", "#5fd35f"].forEach((col, i) => M.circ(g, L + W * (0.7 + (i % 2) * 0.14), T + D * (0.3 + Math.floor(i / 2) * 0.3), Math.min(W, D) * 0.06, "mdl-led", { fill: col }));
  },
  pressure_reactor(g, { L, T, W, D, d }) {
    const vx = L + W * 0.42, vy = T + D * 0.45, r = Math.min(W, D) * 0.3;
    M.circ(g, vx, vy, r, "mdl-steel");
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; M.circ(g, vx + Math.cos(a) * r * 0.8, vy + Math.sin(a) * r * 0.8, r * 0.08, "mdl-bolt"); }
    M.circ(g, vx + r * 0.2, vy - r * 0.25, r * 0.25, "mdl-gauge");
    M.rect(g, L + W * 0.78, T + D * 0.1, W * 0.14, D * 0.8, "dev-dark");
    M.rect(g, L + W * 0.1, T + D * 0.84, W * 0.55, D * 0.12, "screen");
  },
  rotary_evaporator(g, { L, T, W, D }) {
    M.circ(g, L + W * 0.3, T + D * 0.55, Math.min(W, D) * 0.28, "mdl-liquid", { fill: "#9fd0e6" });   // water bath
    M.rect(g, L + W * 0.62, T + D * 0.1, W * 0.14, D * 0.5, "dev-dark");                              // lift tower
    M.circ(g, L + W * 0.82, T + D * 0.25, Math.min(W, D) * 0.12, "mdl-glass");                          // condenser
    M.line(g, L + W * 0.69, T + D * 0.35, L + W * 0.35, T + D * 0.5, "mdl-arm");
  },
  incubator_shaker(g, { L, T, W, D }) {
    M.rect(g, L + W * 0.05, T + D * 0.05, W * 0.9, D * 0.72, "mdl-glass");
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) M.circ(g, L + W * (0.17 + k * 0.22), T + D * (0.17 + r * 0.22), Math.min(W, D) * 0.07, "mdl-clamp");
    M.rect(g, L + W * 0.1, T + D * 0.84, W * 0.4, D * 0.1, "screen");
  },
  tga(g, { L, T, W, D }) {
    M.circ(g, L + W * 0.5, T + D * 0.3, Math.min(W, D) * 0.18, "mdl-steel");
    M.circ(g, L + W * 0.5, T + D * 0.3, Math.min(W, D) * 0.07, "dev-dark");
    for (let i = 0; i < 10; i++) { const a = Math.PI * (0.15 + i * 0.07); M.circ(g, L + W * 0.5 + Math.cos(a) * W * 0.35, T + D * 0.35 + Math.sin(a) * D * 0.45, Math.min(W, D) * 0.025, "mdl-well"); }
    M.rect(g, L + W * 0.08, T + D * 0.06, W * 0.22, D * 0.14, "screen");
  },
  xrd(g, { L, T, W, D, cx, cy }) {
    M.rect(g, L + W * 0.05, T + D * 0.05, W * 0.65, D * 0.9, "mdl-glass");
    const r = Math.min(W, D) * 0.28, gx = L + W * 0.38;
    M.circ(g, gx, cy, r, "mdl-arc"); M.circ(g, gx, cy, r * 0.12, "mdl-metal");
    M.line(g, gx, cy, gx - r * 0.9, cy - r * 0.35, "mdl-arm"); M.line(g, gx, cy, gx + r * 0.9, cy - r * 0.35, "mdl-arm");
    M.rect(g, L + W * 0.75, T + D * 0.1, W * 0.2, D * 0.8, "dev-dark");
  },
  gas_burette(g, { cx, cy, W, D }) { M.rect(g, cx - W * 0.45, cy - D * 0.45, W * 0.9, D * 0.9, "dev-dark"); M.circ(g, cx, cy, Math.min(W, D) * 0.2, "mdl-glass"); },
  liquid_handler(g, { L, T, W, D }) {
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++)
      M.rect(g, L + 20 + k * (W - 40) / 3, T + 20 + r * (D - 40) / 4, (W - 40) / 3 - 8, (D - 40) / 4 - 8, "mdl-deck", { rx: 6 });
    M.rect(g, L + 6, T + D * 0.06, W - 12, D * 0.05, "mdl-metal");                           // gantry
    M.text(g, L + 26, T + 44, "OT-2", 24, "mdl-t", "start");
  },
  contact_angle_stage(g, { L, T, W, D, cx, cy }) {
    M.rect(g, L + W * 0.02, cy - D * 0.2, W * 0.22, D * 0.4, "dev-dark"); M.rect(g, L + W * 0.8, cy - D * 0.2, W * 0.18, D * 0.4, "mdl-lamp");
    M.rect(g, cx - W * 0.18, cy - D * 0.25, W * 0.36, D * 0.5, "mdl-metal");
  },
  proxy_viscometer(g, { L, T, W, D, cx, cy }) { M.circ(g, cx, cy, Math.min(W, D) * 0.3, "mdl-metal"); M.rect(g, L + W * 0.75, T + D * 0.2, W * 0.1, D * 0.3, "dev-dark"); },
  tensiometer(g, { L, T, W, D, cx, cy }) {
    M.rect(g, L, cy - D * 0.1, W, D * 0.2, "mdl-metal");
    M.rect(g, L + W * 0.02, cy - D * 0.3, W * 0.2, D * 0.6, "dev-dark"); M.rect(g, L + W * 0.8, cy - D * 0.3, W * 0.16, D * 0.6, "mdl-lamp");
    M.circ(g, cx, cy, Math.min(W, D) * 0.08, "mdl-steel");
  },
  foam_analyzer(g, { L, T, W, D, d }) {
    const a = d.anim || {}, r = Math.min(W, D) * 0.16;
    M.rect(g, L + W * 0.08, T + D * 0.1, W * 0.55, D * 0.12, "mdl-lamp", { "fill-opacity": 0.6 });
    M.circ(g, L + W * 0.36, T + D * 0.48, r * 1.15, "mdl-glass");
    M.circ(g, L + W * 0.36, T + D * 0.48, r, (a.foam_mL || 0) > 0.5 ? "mdl-foam" : "mdl-liquid", (a.foam_mL || 0) > 0.5 ? {} : { fill: "#9fd0e6" });
    M.rect(g, L + W * 0.72, T + D * 0.38, W * 0.2, D * 0.2, "dev-dark"); M.circ(g, L + W * 0.72, T + D * 0.48, r * 0.3, "mdl-lens");
    M.rect(g, L + W * 0.1, T + D * 0.8, W * 0.5, D * 0.12, "screen");
  },
  plate_reader(g, { L, T, W, D }) {
    M.rect(g, L + W * 0.15, T + D * 0.62, W * 0.55, D * 0.36, "mdl-metal");                  // extended plate carrier
    for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) M.circ(g, L + W * (0.2 + k * 0.085), T + D * (0.68 + r * 0.075), Math.min(W, D) * 0.015, "mdl-well");
    M.rect(g, L + W * 0.1, T + D * 0.1, W * 0.45, D * 0.3, "screen");
  },
};

const MODELS = {};
for (const k of new Set([...Object.keys(FRONT), ...Object.keys(TOP)])) MODELS[k] = { front: FRONT[k], top: TOP[k] };
