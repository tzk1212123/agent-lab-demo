// agent lab · studio: 2D illustrated multi-view display (front / top / equipment table), shared by live runs and replays.
"use strict";

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const UNIT = { degC: "°C" };
function fmt(v, d = 4) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (typeof v !== "number") return Array.isArray(v) ? `${v.length} peaks` : String(v);
  if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e5)) return v.toExponential(2);
  return Number(v.toPrecision(d)).toString();
}
const fmtT = (t) => t == null ? "—" : `${Math.floor(t / 3600) ? Math.floor(t / 3600) + ":" : ""}${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function el(tag, attrs = {}, parent, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
async function api(path, body) {
  if (window.STATIC_API) return window.STATIC_API(path, body);      // GitHub Pages build: answer from pre-exported JSON (static_api.js)
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

const S = {
  view: "table", mode: "idle", operator: true, static: null, frames: [], events: [], idx: 0,   // operator: operator view only (shows simulated truth)
  frameNext: 0, eventNext: 0, status: "idle", score: null, follow: true, playing: false, poll: null,
  vb: null, fitted: { front: false, top: false },
};
const frame = () => S.frames[S.idx];

// ================================================================ geometry
const DEPTH = 0.55;              // front view: height per mm of depth (2.5D); back rows sit visibly higher, reducing occlusion
const LEG = 330;                 // table leg length
function benchBounds(st) {
  const sl = Object.values(st.slots), xs = [], ys = [];
  for (const s of sl) { xs.push(s.x_mm - s.w_mm / 2 - 60, s.x_mm + s.w_mm / 2 + 60); ys.push(s.y_mm - s.d_mm / 2 - 40, s.y_mm + s.d_mm / 2 + 40); }
  if (st.bench) return { ...st.bench };            // fixed-size bench: draw the top at this size (floor-standing instruments sit beside it)
  if (!xs.length) { xs.push(0, 3000); ys.push(0, 1200); }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
// devices in the store: the shelf shows only the common ones (catalogue shelf_ids); the rest count as warehouse, fetched from the equipment drawer when needed
const storedDevices = (f, st) => Object.entries(f.devices).filter(([id, d]) => !st.slots[d.slot]
  && (typeof SB === "undefined" || !SB.shelf || SB.shelf.has(id)));
// front view: further back (smaller y) is drawn higher
const baseY = (b, y) => -(b.y1 - y) * DEPTH;

// container shape: returns {w, h, path (outline, origin at bottom centre, up is negative), inner (liquid area), neckY}
function vesselShape(type, cap) {
  const t = type || "";
  const sq = Math.sqrt(Math.max(cap, 1));
  if (t.startsWith("cuvette")) return box(14, 46, 1);
  if (t.startsWith("separatory_funnel")) { const w = 18 + 3.2 * sq, h = 2.2 * w; return { w, h, kind: "funnel",
    path: `M${-w * 0.12},${-h} L${-w * 0.12},${-h * 0.88} Q${-w / 2},${-h * 0.72} ${-w / 2},${-h * 0.5} Q${-w / 2},${-h * 0.25} ${-w * 0.06},${-h * 0.12} L${-w * 0.06},0 L${w * 0.06},0 L${w * 0.06},${-h * 0.12} Q${w / 2},${-h * 0.25} ${w / 2},${-h * 0.5} Q${w / 2},${-h * 0.72} ${w * 0.12},${-h * 0.88} L${w * 0.12},${-h} Z`,
    inner: `M${-w * 0.42},${-h * 0.82} Q${-w / 2 + 3},${-h * 0.6} ${-w / 2 + 3},${-h * 0.5} Q${-w / 2 + 3},${-h * 0.27} ${-w * 0.05},${-h * 0.13} L${w * 0.05},${-h * 0.13} Q${w / 2 - 3},${-h * 0.27} ${w / 2 - 3},${-h * 0.5} Q${w / 2 - 3},${-h * 0.6} ${w * 0.42},${-h * 0.82} Z`,
    top: -h, stopcock: true }; }
  if (t.startsWith("round_bottom")) { const r = 8 + 2.3 * sq, nh = r * 1.1, nw = r * 0.42; return { w: 2 * r, h: 2 * r + nh, kind: "rbf",
    path: `M${-nw / 2},${-2 * r - nh} L${-nw / 2},${-1.85 * r} A${r},${r} 0 1 0 ${nw / 2},${-1.85 * r} L${nw / 2},${-2 * r - nh} Z`,
    inner: `M${-r + 3},${-r} A${r - 3},${r - 3} 0 1 0 ${r - 3},${-r} A${r - 3},${r - 3} 0 1 0 ${-r + 3},${-r} Z`, top: -2 * r - nh, bulb: r }; }
  if (t.startsWith("vial")) return bottle(10 + 3 * sq, 2.2 * (10 + 3 * sq), 0.7, 8);
  if (t.startsWith("solvent_bottle")) return bottle(20 + 2.2 * sq, 1.9 * (20 + 2.2 * sq), 0.35, 16);
  if (t.startsWith("hplc_vial")) return bottle(13, 34, 0.55, 6);
  if (t.startsWith("crucible")) { const w = 62, h = 46; return { w, h, kind: "crucible",
    path: `M${-w / 2},${-h} L${w / 2},${-h} L${w * 0.32},0 L${-w * 0.32},0 Z`,
    inner: `M${-w / 2 + 4},${-h + 6} L${w / 2 - 4},${-h + 6} L${w * 0.3},-3 L${-w * 0.3},-3 Z`, top: -h }; }
  if (t.startsWith("volumetric_flask")) { const r = 6 + 2.4 * sq, nh = 3.3 * r, nw = 0.36 * r; return { w: 2 * r, h: 2 * r + nh, kind: "vol",
    path: `M${-nw},${-2 * r - nh} L${-nw},${-1.8 * r} A${r},${r} 0 1 0 ${nw},${-1.8 * r} L${nw},${-2 * r - nh} Z`,
    inner: `M${-nw + 2},${-2 * r - nh + 4} L${-nw + 2},${-1.8 * r} A${r - 3},${r - 3} 0 1 0 ${nw - 2},${-1.8 * r} L${nw - 2},${-2 * r - nh + 4} Z`,
    mark: -2 * r - nh * 0.45, top: -2 * r - nh, bulb: r }; }
  if (t.startsWith("erlenmeyer")) { const w = 22 + 4 * sq, h = 1.55 * w, nw = 0.36 * w; return { w, h, kind: "erl",
    path: `M${-nw / 2},${-h} L${-nw / 2},${-h * 0.7} L${-w / 2},${-6} Q${-w / 2},0 ${-w / 2 + 6},0 L${w / 2 - 6},0 Q${w / 2},0 ${w / 2},-6 L${nw / 2},${-h * 0.7} L${nw / 2},${-h} Z`,
    inner: `M${-nw / 2 + 3},${-h + 3} L${-nw / 2 + 3},${-h * 0.7} L${-w / 2 + 4},-6 L${w / 2 - 4},-6 L${nw / 2 - 3},${-h * 0.7} L${nw / 2 - 3},${-h + 3} Z`, top: -h }; }
  if (t.startsWith("wash_bottle")) { const s = bottle(16 + 2.6 * sq, 1.7 * (16 + 2.6 * sq), 0.4, 14); s.nozzle = true; return s; }
  if (t.startsWith("reagent_jar")) return bottle(20 + 4 * sq, 1.0 * (20 + 4 * sq), 0.8, 12);
  if (t.startsWith("dropper")) { const s = bottle(14 + 3 * sq, 1.8 * (14 + 3 * sq), 0.45, 10); s.dropper = true; return s; }
  if (t.startsWith("reagent_bottle") || t.startsWith("reservoir")) return bottle(16 + 2.9 * sq, 1.65 * (16 + 2.9 * sq), 0.45, 14);
  if (t.startsWith("coffee_cup")) { const w = 84, h = 100; return { w, h, kind: "cup",
    path: `M${-w / 2},${-h} L${w / 2},${-h} L${w * 0.4},0 L${-w * 0.4},0 Z`,
    inner: `M${-w / 2 + 8},${-h + 8} L${w / 2 - 8},${-h + 8} L${w * 0.4 - 7},-7 L${-w * 0.4 + 7},-7 Z`, top: -h, thick: true }; }
  const w = 28 + 2.7 * sq; return box(w, 1.3 * w, 0, true);   // beaker
}
function box(w, h, r = 0, lip = false) {
  return { w, h, kind: "box", path: `M${-w / 2 - (lip ? 4 : 0)},${-h} L${-w / 2},${-h + (lip ? 4 : 0)} L${-w / 2},${-r} Q${-w / 2},0 ${-w / 2 + r},0 L${w / 2 - r},0 Q${w / 2},0 ${w / 2},${-r} L${w / 2},${-h} Z`,
    inner: `M${-w / 2 + 3},${-h + 4} L${-w / 2 + 3},-3 L${w / 2 - 3},-3 L${w / 2 - 3},${-h + 4} Z`, top: -h };
}
function bottle(w, h, neck, capH) {
  const nw = w * neck, sh = h * 0.78;
  return { w, h, kind: "bottle", capH, nw,
    path: `M${-nw / 2},${-h} L${-nw / 2},${-sh} Q${-w / 2},${-sh + 4} ${-w / 2},${-sh + 16} L${-w / 2},-5 Q${-w / 2},0 ${-w / 2 + 5},0 L${w / 2 - 5},0 Q${w / 2},0 ${w / 2},-5 L${w / 2},${-sh + 16} Q${w / 2},${-sh + 4} ${nw / 2},${-sh} L${nw / 2},${-h} Z`,
    inner: `M${-w / 2 + 3},${-sh + 14} L${-w / 2 + 3},-3 L${w / 2 - 3},-3 L${w / 2 - 3},${-sh + 14} Z`, top: -h };
}

// polyline through pts with rounded corners (radius r, clipped to half of each segment)
function roundedPath(pts, r) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1);
    if (l1 < 0.5 || l2 < 0.5) continue;
    const q = Math.min(r, l1 / 2, l2 / 2);
    d += ` L${x1 - (x1 - x0) / l1 * q},${y1 - (y1 - y0) / l1 * q} Q${x1},${y1} ${x1 + (x2 - x1) / l2 * q},${y1 + (y2 - y1) / l2 * q}`;
  }
  const z = pts[pts.length - 1];
  return d + ` L${z[0]},${z[1]}`;
}
// ================================================================ drawing: containers
let clipSeq = 0;
function liquidColor(c) {
  if (S.operator && c.truth.rgb) return `color-mix(in srgb, rgb(${c.truth.rgb.join(",")}) 72%, var(--water))`;
  return "var(--water)";
}
function drawVessel(g, cid, c, x, y, opts = {}) {
  const shp = vesselShape(c.type, c.capacity_mL);
  const vol = S.operator ? c.truth.volume_mL : c.ledger_mL;
  const frac = Math.max(0, Math.min(1, vol / c.capacity_mL));
  const grp = el("g", { transform: `translate(${x},${y})`, "data-c": cid }, g);
  const id = `cl${clipSeq++}`;
  const cp = el("clipPath", { id }, grp);
  el("path", { d: shp.inner }, cp);
  const H = shp.h;
  if (vol > 1e-6) {
    let level;
    if (shp.kind === "rbf") level = -2 * shp.bulb * Math.min(1, Math.pow(frac / 0.8, 0.8)) + 3;
    else if (shp.kind === "funnel") level = -H * 0.13 - (H * 0.69) * Math.min(1, Math.pow(frac, 0.7));
    else if (shp.kind === "vol") level = frac >= 0.88 ? -(2 * shp.bulb) - (frac - 0.88) / 0.12 * (shp.h - 2 * shp.bulb) * 0.6 : -(2 * shp.bulb) * Math.sqrt(frac / 0.88);
    else if (shp.kind === "erl") level = -H * 0.7 * (1 - Math.pow(1 - frac, 0.65));
    else level = -H * frac * 0.92;
    const orgV = S.operator ? (c.truth.org_mL || 0) : (c.ledger_org_mL || 0);
    if (orgV > 0 && vol > 0) {
      const dens = { ethyl_acetate: 0.902, dichloromethane: 1.326, diethyl_ether: 0.713, hexane: 0.655, toluene: 0.867 }[c.org_solvent] ?? 0.9;
      const hTot = -level, hO = hTot * Math.min(1, orgV / vol), hA = hTot - hO;   // layer heights (up is positive)
      const layers = dens < 1.0 ? [["aq", 0, hA], ["org", hA, hTot]] : [["org", 0, hO], ["aq", hO, hTot]];
      for (const [kind, h0, h1] of layers)
        el("rect", { x: -shp.w, y: -h1, width: shp.w * 2, height: h1 - h0 + (h0 === 0 ? 2 : 0), class: "liquid",
          fill: kind === "aq" ? liquidColor(c) : "#e8d98a", "fill-opacity": kind === "aq" ? 1 : 0.8, "clip-path": `url(#${id})` }, grp);
      const yb = -layers[0][2];
      el("line", { x1: -shp.w, x2: shp.w, y1: yb, y2: yb, stroke: "#fff", "stroke-opacity": 0.6, "stroke-width": 1.5, "clip-path": `url(#${id})` }, grp);
    } else {
      el("rect", { x: -shp.w, y: level, width: shp.w * 2, height: -level + 2, class: "liquid", fill: liquidColor(c), "clip-path": `url(#${id})` }, grp);
    }
    el("rect", { x: -shp.w * 0.3, y: level, width: shp.w * 0.12, height: Math.max(0, -level - 6), class: "liquid-hi", "clip-path": `url(#${id})` }, grp);
  }
  if (S.operator && c.truth.precipitate) {
    const n = Math.min(14, 4 + Math.round(c.truth.turbidity * 400));
    for (let i = 0; i < n; i++) el("circle", { cx: (Math.sin(i * 7.3) * 0.38) * shp.w, cy: -4 - (i % 3) * 3, r: 2.4, class: "ppt", "clip-path": `url(#${id})` }, grp);
  }
  if (vol <= 1e-6 && c.truth && Object.keys(c.truth.totals_mmol || {}).length && S.operator) {
    for (let i = 0; i < 9; i++) el("rect", { x: -shp.w * 0.32 + (i % 5) * shp.w * 0.15, y: -8 - Math.floor(i / 5) * 6, width: 6, height: 5, class: "crystal",
      transform: `rotate(${(i * 37) % 60 - 30})`, "clip-path": `url(#${id})` }, grp);
  }
  el("path", { d: shp.path, class: "glass", "stroke-width": shp.thick ? 6 : 3 }, grp);
  if (shp.mark) el("line", { x1: -shp.w * 0.2, x2: shp.w * 0.2, y1: shp.mark, y2: shp.mark, class: "glass-thin" }, grp);
  if (shp.stopcock) el("rect", { x: -10, y: -H * 0.08, width: 20, height: 7, rx: 3, class: "cap" }, grp);
  if ((c.attachments || []).includes("condenser")) {
    const top = shp.top ?? -H;
    el("rect", { x: -9, y: top - 230, width: 18, height: 230, rx: 6, class: "glass", "stroke-width": 2 }, grp);
    el("rect", { x: -16, y: top - 210, width: 32, height: 170, rx: 10, fill: "#9fd0e6", "fill-opacity": 0.25, stroke: "#e8f2df", "stroke-width": 2 }, grp);
    el("path", { d: `M16,${top - 60} q22,0 22,18 M-16,${top - 200} q-22,0 -22,-18`, class: "tube" }, grp);
  }
  if (shp.kind === "bottle") {
    el("rect", { x: -shp.nw / 2 - 3, y: -H - shp.capH, width: shp.nw + 6, height: shp.capH + 2, rx: 3, class: "cap" }, grp);
    if (shp.nozzle) el("path", { d: `M0,${-H - shp.capH} Q2,${-H - shp.capH - 26} ${shp.w * 0.55},${-H - shp.capH - 20}`, class: "glass-thin", "stroke-width": 3 }, grp);
    if (shp.dropper) el("ellipse", { cx: 0, cy: -H - shp.capH - 10, rx: shp.nw * 0.35, ry: 11, class: "cap" }, grp);
  }
  if (c.stir_bar && vol > 0) el("rect", { x: -9, y: -6, width: 18, height: 4, rx: 2, fill: "#f3f3ea", class: S.stirring.has(cid) ? "spin" : "" }, grp);
  if (S.activeIds.has(cid)) el("rect", { x: -shp.w / 2 - 10, y: -H - 14, width: shp.w + 20, height: H + 22, rx: 10, class: "active-ring" }, grp);
  if ((c.truth?.temperature_C ?? 22) > 45 && vol > 0) for (let i = -1; i <= 1; i++)
    el("path", { d: `M${i * 12},${-H - 10} q5,-10 0,-20 q-5,-10 0,-20`, class: "heat", style: `animation-delay:${i * 0.25}s` }, grp);
  if (!(c.type || "").startsWith("well")) {               // single wells of a plate: no per-well labels (they pile up)
    const ly = opts.labelAbove ? -H - 52 : 30;            // vessel sitting on an instrument: label above it, not over the instrument's screen
    el("text", { x: 0, y: ly, class: "lbl" }, grp, cid);
    el("text", { x: 0, y: ly + 22, class: "lbl-sub" }, grp, `${fmt(vol, 3)} mL`);
  }
  grp.addEventListener("mouseenter", () => { if (S.view === "iso") isoHover(cid); else if (typeof frontXray === "function" && S.view === "front") frontXray(cid); });
  grp.addEventListener("mouseleave", () => { hideTip(); if (S.view === "iso") isoHover(null); else if (typeof frontXray === "function") frontXray(null); });
  return { x, y, top: y - H, w: shp.w, h: H, level: y - H * frac };   // level: liquid surface (for vortex / bubbles)
}
function vesselTip(cid, c) {
  let h = `<b>${esc(cid)}</b> · ${esc(c.type)}<br>${esc(c.label)}<br>Ledger volume ${fmt(c.ledger_mL)} mL (estimated)`;
  if (S.operator) h += `<br><i>Truth</i>: ${fmt(c.truth.volume_mL)} mL · ${fmt(c.truth.temperature_C)} °C · pH ${fmt(c.truth.pH)}${c.truth.precipitate ? " · precipitate" : ""}`
    + `<br>${Object.entries(c.truth.totals_mmol).map(([k, v]) => `${esc(k)} ${fmt(v, 3)}`).join(", ")} mmol`;
  return h;
}

// ================================================================ drawing: device sprites
const best = (d, f) => d.fields[f]?.best?.v;
function screen(g, x, y, w, h, line1, line2) {
  el("rect", { x, y, width: w, height: h, rx: 6, class: "screen" }, g);
  el("text", { x: x + 8, y: y + h / 2 + (line2 ? -1 : 6), class: "screen-t" }, g, line1);
  if (line2) el("text", { x: x + 8, y: y + h - 6, class: "screen-s" }, g, line2);
}
function drawDevice(g, id, d, x, yb) {
  const [W, , Hraw] = d.dims_mm;
  const H = d.category === "thermostatic_bath" ? Math.min(Hraw, 260) : Math.min(Hraw, 950);
  const grp = el("g", { "data-d": id }, g);
  const L = x - W / 2, T = yb - H;
  const cat = d.category;
  if (S.devBoxes && !g.closest?.(".stored-dev")) S.devBoxes[id] = { L, T, W, H, x, yb };   // instrument outline for the animation layer
  el("ellipse", { cx: x, cy: yb, rx: W * 0.56, ry: Math.max(5, Math.min(18, W * 0.05)), class: "contact-shadow" }, grp);   // contact shadow on the bench top
  const holder = { x, y: T };        // container holder point (bottom centre)
  if (typeof FRONT !== "undefined" && FRONT[cat]) {
    Object.assign(holder, FRONT[cat]({ g: grp, id, d, x, yb, L, T, W, H }));
  } else if (cat === "hotplate_stirrer") {
    el("rect", { x: L, y: T, width: W, height: H, rx: 12, class: "dev-body" }, grp);
    el("rect", { x: L - 6, y: T - 8, width: W + 12, height: 12, rx: 5, class: "dev-panel" }, grp);
    const pt = best(d, "plate_temperature") ?? 22;
    if (pt > 30) el("rect", { x: L - 6, y: T - 8, width: W + 12, height: 12, rx: 5, fill: "#ff7a3d", "fill-opacity": Math.min(0.8, (pt - 30) / 120) }, grp);
    screen(grp, L + 12, T + 14, W * 0.55, H - 30, `${fmt(pt, 3)}°`, `${fmt(best(d, "speed"), 3)} rpm`);
    el("circle", { cx: L + W - 30, cy: T + H / 2, r: 14, class: "knob" }, grp);
    holder.y = T - 8;
  } else if (cat === "thermostatic_bath") {
    const bt = best(d, "bath_temperature") ?? 22;
    el("rect", { x: L, y: T, width: W, height: H, rx: 12, class: "dev-body" }, grp);
    const hot = Math.max(0, Math.min(1, (bt - 22) / 70)), cold = Math.max(0, Math.min(1, (22 - bt) / 22));
    el("rect", { x: L + 10, y: T + 10, width: W - 20, height: H * 0.62, rx: 6, fill: `rgb(${150 + 100 * hot},${200 - 60 * hot + 30 * cold},${230 - 120 * hot + 25 * cold})`, class: "bath-liquid" }, grp);
    screen(grp, L + 14, T + H * 0.72, W - 28, H * 0.2, `${fmt(bt, 3)} °C`, `set ${fmt(d.setpoints["set_temperature.temperature"], 3)}`);
    holder.y = T + H * 0.45; holder.inBath = { x: L + 10, y: T + 10, w: W - 20, h: H * 0.35 };
  } else if (cat === "balance") {
    el("rect", { x: L, y: yb - 70, width: W, height: 70, rx: 10, class: "dev-body" }, grp);
    el("rect", { x: L + 10, y: T, width: W - 20, height: H - 70, rx: 8, fill: "rgba(220,240,230,.12)", stroke: "#d8e6cf", "stroke-width": 2 }, grp);
    el("rect", { x: x - 55, y: yb - 82, width: 110, height: 8, rx: 3, class: "dev-panel" }, grp);
    screen(grp, L + 14, yb - 58, W - 28, 44, `${fmt(best(d, "mass"), 6)} g`);
    holder.y = yb - 82;
  } else if (cat === "syringe_pump") {
    Object.assign(holder, pumpFront(grp, id, d, x, yb));
  } else if (cat === "spectrophotometer") {
    el("rect", { x: L, y: T, width: W, height: H, rx: 14, class: "dev-body" }, grp);
    el("rect", { x: L + W * 0.55, y: T + 16, width: W * 0.36, height: H * 0.55, rx: 6, class: "dev-dark" }, grp);
    screen(grp, L + 12, T + 18, W * 0.45, H * 0.4, `A ${fmt(best(d, "absorbance"), 3)}`, `${fmt(best(d, "wavelength"), 3)} nm`);
    holder.x = L + W * 0.73; holder.y = T + 16 + H * 0.5;
  } else if (cat === "hplc") {
    for (let i = 0; i < 4; i++) el("rect", { x: L, y: T + i * H / 4, width: W, height: H / 4 - 4, rx: 8, class: "dev-body" }, grp);
    el("rect", { x: L + 16, y: T - 26, width: W - 32, height: 26, rx: 4, class: "dev-panel" }, grp);
    const ch = best(d, "chromatogram");
    const sx = L + 16, sy = T + H / 4 + 10, sw = W - 32, sh = H / 4 - 24;
    el("rect", { x: sx, y: sy, width: sw, height: sh, rx: 5, class: "screen" }, grp);
    if (Array.isArray(ch) && ch.length) {
      const mx = Math.max(...ch.map((p) => p.area)); let dpath = `M${sx},${sy + sh - 4}`;
      for (let i = 0; i <= 60; i++) { const t = i / 6; let yv = 0; for (const p of ch) yv += p.area / mx * Math.exp(-((t - p.rt_min) ** 2) / 0.02);
        dpath += ` L${sx + i / 60 * sw},${sy + sh - 4 - Math.min(1, yv) * (sh - 10)}`; }
      el("path", { d: dpath, class: "chrom" }, grp);
    } else el("text", { x: sx + 8, y: sy + sh / 2 + 5, class: "screen-s" }, grp, best(d, "running") ? "Running…" : "No chromatogram");
    holder.y = T - 26;
  } else if (cat === "rotary_evaporator") {
    el("rect", { x: L, y: yb - 120, width: W, height: 120, rx: 14, class: "dev-body" }, grp);
    el("rect", { x: L + 20, y: yb - 200, width: W * 0.45, height: 90, rx: 10, fill: "#9fd0e6", "fill-opacity": .5, stroke: "#d8e6cf", "stroke-width": 2 }, grp);
    el("rect", { x: L + W * 0.62, y: T, width: 24, height: H - 120, rx: 6, class: "dev-dark" }, grp);
    el("path", { d: `M${L + W * 0.62},${T + 40} L${L + W * 0.3},${yb - 190}`, stroke: "#e8f2df", "stroke-width": 10, "stroke-linecap": "round" }, grp);
    for (let i = 0; i < 6; i++) el("ellipse", { cx: L + W * 0.75, cy: T + 30 + i * 22, rx: 30, ry: 8, fill: "none", stroke: "#e8f2df", "stroke-width": 2 }, grp);
    screen(grp, L + W * 0.55, yb - 100, W * 0.4, 70, `${fmt(best(d, "pressure"), 3)} mbar`, `${fmt(best(d, "bath_temperature"), 3)} °C · ${fmt(best(d, "evaporated"), 3)} mL`);
    holder.x = L + W * 0.3; holder.y = yb - 150;
  } else if (cat === "photoreactor") {
    const on = (best(d, "power") ?? 0) > 0;
    el("rect", { x: L, y: yb - 40, width: W, height: 40, rx: 10, class: "dev-body" }, grp);
    el("rect", { x: x - 36, y: T, width: 72, height: 70, rx: 12, class: "dev-dark" }, grp);
    if (on) el("path", { d: `M${x - 30},${T + 70} L${x - 90},${yb - 40} L${x + 90},${yb - 40} L${x + 30},${T + 70} Z`, fill: "#5aa2ff", "fill-opacity": .28 }, grp);
    el("circle", { cx: x, cy: T + 55, r: 14, fill: on ? "#7db8ff" : "#3d5a4a" }, grp);
    holder.y = yb - 40;
  } else if (cat === "microwave_reactor") {
    const on = (best(d, "power") ?? 0) > 0, run = (best(d, "running") ?? 0) > 0;
    el("rect", { x: L, y: T, width: W, height: H, rx: 14, class: "dev-body" }, grp);
    el("rect", { x: L + W * 0.12, y: T + H * 0.12, width: W * 0.5, height: H * 0.6, rx: 10, class: "dev-dark" }, grp);   // reaction cavity
    if (on) el("rect", { x: L + W * 0.12, y: T + H * 0.12, width: W * 0.5, height: H * 0.6, rx: 10, fill: "#ffb347", "fill-opacity": .3 }, grp);
    screen(grp, L + W * 0.66, T + H * 0.12, W * 0.28, H * 0.6, `${fmt(best(d, "temperature"), 3)} °C`,
      `${fmt(best(d, "pressure"), 2)} bar · ${fmt(best(d, "power"), 3)} W${run ? "" : " · standby"}`);
    holder.x = L + W * 0.37; holder.y = T + H * 0.62;
  } else if (cat === "flow_reactor") {
    const fill = Math.min(1, (best(d, "coil_filled") ?? 0) / 10), on = (best(d, "pumping") ?? 0) > 0;
    el("rect", { x: L, y: T, width: W * 0.38, height: H, rx: 10, class: "dev-body" }, grp);     // pump module
    el("rect", { x: L + W * 0.42, y: T + H * 0.25, width: W * 0.58, height: H * 0.75, rx: 10, class: "dev-body" }, grp);
    for (let i = 0; i < 2; i++) el("rect", { x: L + 12 + i * W * 0.17, y: T + 10, width: W * 0.13, height: 26, rx: 5, class: "dev-dark" }, grp);
    const cx = L + W * 0.71, cy = T + H * 0.62;
    for (let i = 0; i < 5; i++) el("ellipse", { cx, cy, rx: W * 0.08 + i * W * 0.035, ry: H * 0.06 + i * H * 0.04, fill: "none",
      stroke: i < Math.round(fill * 5) ? "#c9a3e6" : "#e8f2df", "stroke-width": 3, "stroke-opacity": on ? 1 : 0.6 }, grp);
    screen(grp, L + 8, T + 44, W * 0.34, H - 56, `${fmt(best(d, "flow_total"), 3)} mL/min`,
      `${fmt(best(d, "temperature"), 3)} °C · τ ${fmt((best(d, "residence_time") ?? 0) / 60, 2)} min`);
    holder.port = { x: L + W - 10, y: T + H * 0.25 };
  } else if (cat === "potentiostat") {
    el("rect", { x: L, y: T, width: W, height: H, rx: 10, class: "dev-body" }, grp);
    screen(grp, L + 10, T + 8, W - 20, H - 16, `${fmt(best(d, "current"), 3)} mA`, `${fmt(best(d, "voltage"), 3)} V · ${fmt(best(d, "charge"), 3)} C`);
    holder.port = { x: L + W - 10, y: T };
  } else if (cat === "nmr") {
    el("rect", { x: L + W * 0.15, y: T + 20, width: W * 0.7, height: H - 20, rx: W * 0.3, fill: "#d8e2cf", stroke: "#8d9c86", "stroke-width": 4 }, grp);
    el("ellipse", { cx: x, cy: T + 22, rx: W * 0.35, ry: 18, fill: "#eef3e6", stroke: "#8d9c86", "stroke-width": 3 }, grp);
    el("rect", { x: x - 8, y: T - 30, width: 16, height: 50, rx: 4, class: "dev-dark" }, grp);
    const sp = best(d, "spectrum");
    screen(grp, L + W * 0.2, T + H * 0.45, W * 0.6, 70, "1H NMR", Array.isArray(sp) ? `${sp.length} peaks` : (best(d, "running") ? "Acquiring…" : "Standby"));
    holder.y = T - 30;
  } else if (cat === "ms" || cat === "gc") {
    el("rect", { x: L, y: T, width: W, height: H, rx: 12, class: "dev-body" }, grp);
    el("rect", { x: L + 14, y: T + 14, width: W * 0.4, height: H * 0.35, rx: 6, class: "dev-dark" }, grp);
    const sp = best(d, cat === "ms" ? "spectrum" : "chromatogram");
    const sx = L + W * 0.5, sy = T + 14, sw = W * 0.45, sh = H * 0.35;
    el("rect", { x: sx, y: sy, width: sw, height: sh, rx: 5, class: "screen" }, grp);
    if (Array.isArray(sp) && sp.length) {
      const key = cat === "ms" ? "intensity" : "area", pos = cat === "ms" ? "mz" : "rt_min";
      const mx = Math.max(...sp.map((p) => p[key])), xs = sp.map((p) => p[pos]);
      const lo = Math.min(...xs) * 0.9, hi = Math.max(...xs) * 1.1 + 1e-9;
      for (const p of sp) { const px = sx + 6 + (p[pos] - lo) / (hi - lo) * (sw - 12);
        el("line", { x1: px, x2: px, y1: sy + sh - 4, y2: sy + sh - 4 - (sh - 10) * p[key] / mx, class: "chrom" }, grp); }
    } else el("text", { x: sx + 6, y: sy + sh / 2 + 5, class: "screen-s" }, grp, best(d, "running") ? "Running…" : "Standby");
    el("text", { x: L + 20, y: T + H * 0.6, class: "lbl-sub", "text-anchor": "start" }, grp, cat === "ms" ? "ESI-QTOF" : "GC-FID");
    holder.x = L + W * 0.25; holder.y = T;
  } else if (cat === "melting_point") {
    el("rect", { x: L, y: T, width: W, height: H, rx: 12, class: "dev-body" }, grp);
    const mr = best(d, "melting_range");
    screen(grp, L + 10, T + 10, W - 20, H * 0.45, Array.isArray(mr) ? `${mr[0]}–${mr[1]}` : "—", "°C melting range");
    holder.y = T;
  } else if (cat === "gas_burette") {
    el("rect", { x: x - 10, y: yb - 40, width: 20, height: 40, class: "dev-dark" }, grp);
    el("rect", { x: x - 14, y: T, width: 28, height: H - 40, rx: 8, class: "glass", "stroke-width": 2 }, grp);
    const gv = Math.max(0, Math.min(100, best(d, "gas_volume") ?? 0));
    el("rect", { x: x - 11, y: T + 4 + (H - 48) * gv / 100, width: 22, height: (H - 48) * (1 - gv / 100), fill: "#9fd0e6", "fill-opacity": .6 }, grp);
    for (let i = 0; i <= 10; i++) el("line", { x1: x + 6, x2: x + 14, y1: T + 4 + (H - 48) * i / 10, y2: T + 4 + (H - 48) * i / 10, stroke: "#e8f2df" }, grp);
    holder.port = { x, y: yb - 40 };
  } else {   // benchtop meters: pH, conductivity, etc.
    el("rect", { x: L, y: T, width: W, height: H, rx: 10, class: "dev-body" }, grp);
    el("rect", { x: L + W - 18, y: T - 140, width: 8, height: 140, class: "dev-dark" }, grp);   // electrode stand
    let txt, sub;
    if (cat === "ph_meter") { txt = `pH ${fmt(best(d, "ph"), 3)}`; sub = `${fmt(best(d, "temperature"), 3)} °C`; }
    else if (cat === "conductivity_meter") { txt = fmt(best(d, "conductivity"), 3); sub = "mS/cm"; }
    else {   // other meter-type devices: show the first numeric reading
      const f = Object.entries(d.fields).find(([, v]) => typeof v.best?.v === "number");
      txt = f ? fmt(f[1].best.v, 4) : "—"; sub = f ? `${f[0]} ${UNIT[f[1].best.u] ?? f[1].best.u}` : cat;
    }
    screen(grp, L + 10, T + 8, W - 30, H - 16, txt, sub);
    holder.port = { x: L + W - 14, y: T - 140 };
  }
  el("text", { x, y: yb + 30, class: "lbl" }, grp, id);                 // model goes in the hover tooltip; front view labels only the id
  grp.addEventListener("mousemove", () => { S.hoverDev = id; });
  grp.addEventListener("mouseenter", () => typeof frontXray === "function" && frontXray(id));
  grp.addEventListener("mouseleave", () => { hideTip(); if (S.hoverDev === id) S.hoverDev = null; if (typeof frontXray === "function") frontXray(null); });
  return holder;
}
function deviceTip(id, d) {
  const rows = Object.entries(d.fields).map(([k, v]) => `${esc(k)}: <b>${fmt(v.best?.v)}</b> ${esc(UNIT[v.best?.u] ?? v.best?.u ?? "")} <span style="opacity:.7">[${esc(v.best?.k ?? "—")} · ${esc(v.status)}]</span>`).join("<br>");
  return `<b>${esc(id)}</b> · ${esc(d.model)} (${esc(d.mode)})<br>${rows}`;
}

// ================================================================ front view
function renderFront(svg, f, st) {
  const b = benchBounds(st);
  const backY = -(b.y1 - b.y0) * DEPTH;
  const g = el("g", {}, svg);
  // grid and height ruler
  for (let z = 0; z <= 800; z += 100) {
    el("line", { x1: b.x0 - 700, x2: b.x1 + 80, y1: backY - z, y2: backY - z, class: "grid" }, g);
    el("text", { x: b.x1 + 90, y: backY - z + 5, class: "zlabel" }, g, `Z ${z} mm`);
  }
  // store (cabinet on the left)
  const cx0 = b.x0 - 1150, cx1 = b.x0 - 90;
  el("rect", { x: cx0, y: backY - 640, width: cx1 - cx0, height: LEG + 640 - backY, rx: 14, class: "shelf" }, g);
  el("text", { x: cx0 + 20, y: backY - 600, class: "area-t" }, g, "Store");
  const shelves = [LEG - 20, backY + 60, backY - 260].map((y) => y);
  for (const y of shelves) el("rect", { x: cx0 + 10, y: y, width: cx1 - cx0 - 20, height: 10, class: "shelf-board" }, g);
  {                                                  // instruments in the store: shrunk on the top two shelves; press and drag onto the bench (top view)
    const stored = storedDevices(f, st), perRow = Math.max(1, Math.ceil(stored.length / 2)), cellW = (cx1 - cx0 - 40) / perRow;
    stored.forEach(([id, d], i) => {
      const row = Math.floor(i / perRow), col = i % perRow, yb = shelves[row === 0 ? 2 : 1], [W, , H] = d.dims_mm;
      const k = Math.min(1, (cellW - 20) / W, 250 / Math.min(H, 950)), x = cx0 + 20 + cellW * (col + 0.5);
      const wrap = el("g", { transform: `translate(${x},${yb}) scale(${k}) translate(${-x},${-yb})`, class: "stored-dev" }, g);
      drawDevice(wrap, id, d, x, yb);
    });
  }
  // workbench
  el("polygon", { points: `${b.x0},0 ${b.x1},0 ${b.x1 - 40},${backY} ${b.x0 + 40},${backY}`, class: "bench-top" }, g);
  el("rect", { x: b.x0, y: 0, width: b.x1 - b.x0, height: 34, class: "bench-front" }, g);
  for (const lx of [b.x0 + 40, b.x1 - 70]) el("rect", { x: lx, y: 34, width: 30, height: LEG - 34, class: "bench-leg" }, g);
  el("text", { x: b.x0 + 60, y: backY + 30, class: "area-t" }, g, "Bench");

  // draw objects back to front by depth
  const items = [];
  for (const [id, d] of Object.entries(f.devices)) {
    const s = st.slots[d.slot];
    if (s) {
      const [w, dp, h] = d.dims_mm, rd = (d.rotation || 0) % 180 === 90;
      items.push({ kind: "dev", id, d: rd ? { ...d, dims_mm: [dp, w, h] } : d, x: s.x_mm, y: s.y_mm });
    }
  }
  const pos = {}; const holders = {};
  // devices and containers interleaved by depth, back to front: front items cover back ones (containers drawn right after their device)
  const storageOrder = Object.keys(f.containers).filter((k) => f.containers[k].location === "storage");
  const perShelf = Math.max(3, Math.ceil(storageOrder.length / 3));
  const onSlot = {};
  const depthOf = (c) => st.slots[c.location]?.y_mm ?? ((st.slots[f.devices[c.location]?.slot]?.y_mm ?? 0) + 0.01);
  const ordered = Object.entries(f.containers).sort((a, z) => depthOf(a[1]) - depthOf(z[1]));
  for (const [cid, c] of ordered) if (c.location !== "storage") items.push({ kind: "con", id: cid, c, y: depthOf(c) });
  items.sort((a, z) => a.y - z.y || (a.kind === "dev" ? -1 : 1));
  const drawCon = (cid, c) => {
    let x, y;
    if (c.location === "storage") {
      const i = storageOrder.indexOf(cid), row = Math.floor(i / perShelf), col = i % perShelf;
      x = cx0 + 60 + col * ((cx1 - cx0 - 100) / Math.max(1, perShelf - 1)); y = shelves[row] ?? shelves[2];
    } else if (holders[c.location]?.drawsVessel) {   // the device model draws this container itself (e.g. foam column)
      pos[cid] = holders[c.location].vessel; return;
    } else if (holders[c.location]) {
      const h = holders[c.location]; x = h.x; y = h.y;
      if (h.spread) {                                 // liquid-handler deck, shaker platform, plate carrier: containers spread out horizontally
        const all = ordered.filter(([, cc]) => cc.location === c.location).map(([k]) => k), n = all.length, k = all.indexOf(cid);
        x = h.x - h.spread / 2 + (k + 0.5) * h.spread / n;
      }
    } else if (st.slots[c.location]) {
      const s = st.slots[c.location]; const k = (onSlot[c.location] = (onSlot[c.location] || 0) + 1) - 1;
      x = s.x_mm + k * 50; y = baseY(b, s.y_mm);
      const r = Math.min(60, 10 + 3.2 * Math.sqrt(c.capacity_mL));           // container on the bench top: contact shadow
      el("ellipse", { cx: x, cy: y, rx: r, ry: Math.max(4, r * 0.18), class: "contact-shadow", "data-c": cid }, g);
    } else return;
    pos[cid] = drawVessel(g, cid, c, x, y, { labelAbove: !!holders[c.location] });
    const hd = f.devices[c.location];                   // flasks / plates ride along on a running shaker
    if (hd && ["incubator_shaker", "heater_shaker"].includes(hd.category) && (best(hd, "speed") ?? 0) > 20)
      g.querySelector(`[data-c="${cid}"]`)?.classList.add("mdl-shake-ride");
    const h = holders[c.location];
    if (h && h.inBath) el("rect", { x: h.inBath.x, y: h.inBath.y, width: h.inBath.w, height: h.inBath.h, rx: 6, fill: "#9fd0e6", "fill-opacity": 0.35 }, g);
  };
  for (const cid of storageOrder) drawCon(cid, f.containers[cid]);       // store cabinet is furthest back
  for (const it of items) {
    if (it.kind === "dev") holders[it.id] = drawDevice(g, it.id, it.d, it.x, baseY(b, it.y));
    else drawCon(it.id, it.c);
  }
  // connections: probes and tubing. Tubing runs like on a real bench: off the pump port to the side of the pump, down to the
  // bench top, along it, up the outside of the vessel and over the rim; several tubes on one vessel bundle side by side.
  const tubeK = {}, tubeSide = (cid, side) => { const k = `${cid}${side}`; tubeK[k] = (tubeK[k] ?? -1) + 1; return tubeK[k]; };
  S.tubeEnds = {};
  for (const [id, d] of Object.entries(f.devices)) {
    const h = holders[id]; if (!h) continue;
    for (const [port, cid] of Object.entries(d.connections)) {
      const p = pos[cid]; if (!p) continue;
      if (d.category === "syringe_pump") {
        const a = h.ports?.[port] || h.port || { x: h.x, y: h.y }, bx = S.devBoxes[id];
        const side = a.x < p.x ? -1 : 1, k = tubeSide(cid, side);         // vessel side the tube comes up on
        const left = bx ? a.x < bx.x : side > 0;                            // leave the pump body on the side nearest its port
        const exitX = bx ? (left ? bx.L - 6 - k * 5 : bx.L + bx.W + 6 + k * 5) : a.x;
        const lane = Math.max(bx ? bx.yb : a.y, p.y) + 8 + k * 6;          // lying on the bench in front of both
        const rx = p.x + side * (p.w / 2 + 6 + k * 6), ry = p.top - 16 - k * 5;
        const mx = p.x + side * Math.min(p.w * 0.3, 4 + k * 6), my = p.top + Math.min(p.h * 0.25, 14);
        const tubeD = roundedPath([[a.x, a.y], [exitX, a.y], [exitX, lane], [rx, lane], [rx, ry]], 10)
          + ` Q${rx},${ry - 14} ${(rx + mx) / 2},${ry - 12} T${mx},${my}`;
        if (port === "out") S.tubeEnds[id] = { x: mx, y: my };
        const src = d.connections.in && f.containers[d.connections.in];
        pumpTube(g, id, d, port, tubeD, src ? liquidColor(src) : pumpColor(d.anim));
      } else {
        const a = h.port || { x: h.x, y: h.y - 20 }, bx = S.devBoxes[id];
        const tipY = p.y - Math.min(p.h * 0.35, 40);
        const px = p.x + (port === "pt1000" ? 10 : -10);
        // probe cable: off the meter, along the bench, up a clamp next to the vessel and down into it
        const side = a.x < p.x ? -1 : 1, k = tubeSide(cid, side);
        const exitX = bx ? (a.x < bx.x ? bx.L - 6 : bx.L + bx.W + 6) : a.x;
        const lane = Math.max(bx ? bx.yb : a.y, p.y) + 8 + k * 6, rx = p.x + side * (p.w / 2 + 10 + k * 6);
        el("path", { d: roundedPath([[a.x, a.y], [exitX, a.y], [exitX, lane], [rx, lane], [rx, p.top - 60], [px, p.top - 60], [px, p.top - 40]], 12), class: "cable" }, g);
        el("line", { x1: px, y1: p.top - 40, x2: px, y2: tipY, class: "probe" }, g);
        el("circle", { cx: px, cy: tipY, r: 4, class: "probe-tip" }, g);
      }
    }
  }
  drawArms(g, f, "front", b);
  drawAvatars(g, f, pos, holders, 0, LEG);
  spreadLabels(g);
  S.geo = { mode: "front", pos, holders, b, boxes: S.devBoxes };   // used by the animation layer
  return { x: b.x0 - 1190, y: backY - 700, w: b.x1 - b.x0 + 1330, h: LEG + 740 - backY };
}

// front-view label de-cluttering: when ids (and the small volume text below) overlap, later ones shift down a line, up to 3 times
function spreadLabels(g) {                                  // detect overlap in screen coordinates (container text is in its own translated group; local coords don't compare)
  // first move labels to the top layer (same position) so back-row container names aren't covered by front-row instruments
  const layer = el("g", { class: "lbl-layer" }, g), gm = g.getCTM();
  for (const t of [...g.querySelectorAll("text.lbl, text.lbl-sub")]) {
    if (t.closest(".stored-dev") || t.closest(".lbl-layer")) continue;
    const m = gm && t.getCTM() ? gm.inverse().multiply(t.parentNode.getCTM()) : null;
    const w = el("g", m ? { transform: `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})` } : {}, layer);
    w.appendChild(t);
  }
  const units = [];
  for (const t of layer.querySelectorAll("text.lbl")) {
    const sub0 = t.parentNode.nextElementSibling?.firstElementChild;
    if (sub0?.classList.contains("lbl-sub")) t.after(sub0);   // put the name and its volume text back in the same group
  }
  for (const t of layer.querySelectorAll("text.lbl")) {
    const sub = t.nextElementSibling?.classList.contains("lbl-sub") ? t.nextElementSibling : null;
    const r1 = t.getBoundingClientRect();
    if (!r1.width) return;                                   // not laid out yet (panel hidden): skip
    const r2 = sub ? sub.getBoundingClientRect() : r1;
    const k = t.getScreenCTM()?.d || 1;                      // screen pixels / local unit
    units.push({ t, sub, k, x: Math.min(r1.left, r2.left), y: r1.top, w: Math.max(r1.right, r2.right) - Math.min(r1.left, r2.left),
                 h: Math.max(r1.bottom, r2.bottom) - r1.top });
  }
  units.sort((a, z) => a.y - z.y || a.x - z.x);
  const placed = [];
  const hit = (u, dy) => placed.some((p) => u.x < p.x + p.w + 3 && u.x + u.w + 3 > p.x && u.y + dy < p.y + p.h && u.y + dy + u.h > p.y);
  for (const u of units) {
    let dy = 0;
    for (let n = 0; n < 3 && hit(u, dy); n++) dy += u.h * 0.55;
    if (dy) for (const node of [u.t, u.sub]) if (node) node.setAttribute("y", +node.getAttribute("y") + dy / u.k);
    placed.push({ ...u, y: u.y + dy });
  }
}

// ================================================================ top view
const TOP_ICON = { hotplate_stirrer: "🔥", balance: "⚖", ph_meter: "pH", conductivity_meter: "κ", spectrophotometer: "λ",
  thermostatic_bath: "🌡", hplc: "📈", gc: "📈", nmr: "🧲", ms: "m/z", rotary_evaporator: "↻", photoreactor: "💡",
  potentiostat: "⚡", gas_burette: "🫧", melting_point: "🌡", optrode: "λ", ion_meter: "mV", orp_meter: "mV",
  flow_reactor: "➰", microwave_reactor: "📡", ftir: "IR", fluorimeter: "✦", cold_bath: "🧊", syringe_pump: "💉",
  heater_shaker: "〰", contact_angle_stage: "📷", proxy_viscometer: "⚖" };
// deck-type devices: containers on top are laid out in a grid (OT-2 stock tubes, plate wells; Heater-Shaker reservoir wells…)
const DECK_DEVICES = new Set(["liquid_handler", "heater_shaker", "contact_angle_stage", "proxy_viscometer"]);
function topReading(d) {
  const v = (f, n = 3) => { const x = best(d, f); return x == null ? null : fmt(x, n); };
  switch (d.category) {
    case "hotplate_stirrer": { const T = v("probe_temperature") ?? v("plate_temperature"); const r = best(d, "speed") ?? 0;
      return `${T ?? "—"} °C${r > 50 ? ` · ${fmt(r, 3)} rpm` : ""}`; }
    case "balance": { const m = best(d, "mass"); return m == null ? null : `${(Math.abs(m) < 5e-4 ? 0 : m).toFixed(4)} g`; }
    case "ph_meter": return v("ph", 3) && `pH ${v("ph", 3)}`;
    case "conductivity_meter": return v("conductivity") && `${v("conductivity")} mS/cm`;
    case "spectrophotometer": case "optrode": return v("absorbance") && `A ${v("absorbance")}`;
    case "thermostatic_bath": case "cold_bath": return v("bath_temperature") && `${v("bath_temperature")} °C`;
    case "syringe_pump": return (best(d, "running") ?? 0) > 0 ? `dosing ${v("dispensed_volume")} mL` : (v("dispensed_volume") ? `added ${v("dispensed_volume")} mL` : null);
    case "rotary_evaporator": return (best(d, "running") ?? 0) > 0 ? `${v("pressure")} mbar` : null;
    case "microwave_reactor": return (best(d, "running") ?? 0) > 0 ? `${v("temperature")} °C ${fmt(best(d, "pressure"), 2)} bar` : null;
    case "flow_reactor": return (best(d, "pumping") ?? 0) > 0 ? `${v("flow_total")} mL/min` : null;
    case "potentiostat": return (best(d, "current") ?? 0) > 0 ? `${v("current")} mA` : null;
    case "photoreactor": return (best(d, "power") ?? 0) > 0 ? `light ${v("power")}%` : null;
    case "gas_burette": return v("gas_volume") && `${v("gas_volume")} mL`;
    case "ion_meter": case "orp_meter": return v("potential") && `${v("potential")} mV`;
    case "fluorimeter": return v("intensity") && `I ${v("intensity")}`;
    case "liquid_handler": return (best(d, "running") ?? 0) > 0 ? "running" : null;
    case "heater_shaker": { const r = best(d, "speed") ?? 0; return r > 0 ? `${fmt(r, 4)} rpm` : `latch ${best(d, "latch") === "closed" ? "closed" : "open"}`; }
    case "contact_angle_stage": { const a = best(d, "contact_angle"), sd = best(d, "contact_angle_sd");
      return a == null ? `free spots ${best(d, "spots_left") ?? "—"}` : `θ ${fmt(a, 3)}°${sd != null ? ` ± ${fmt(sd, 2)}` : ""}`; }
    case "proxy_viscometer": { const e = best(d, "viscosity_at_ref") ?? best(d, "apparent_viscosity");
      return e == null ? `${fmt(best(d, "dish_mass") ?? 0, 3)} g` : `η ${fmt(e, 3)} mPa·s`; }
    case "hplc": case "gc": case "nmr": case "ms": case "ftir": case "melting_point":
      return (best(d, "running") ?? 0) > 0 ? "analysing…" : null;
  }
  return null;
}
function renderTop(svg, f, st) {
  const b = benchBounds(st);
  const g = el("g", {}, svg);
  const sx0 = b.x0 - 640;
  const stored = storedDevices(f, st), devRows = Math.ceil(stored.length / 3), shelfH = Math.max(b.y1 - b.y0, 70 + devRows * 200 + Math.ceil(Object.values(f.containers).filter((c) => c.location === "storage").length / 3) * 175 + 60);
  el("rect", { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, rx: 18, class: "bench-top" }, g);
  el("rect", { x: sx0, y: b.y0, width: 580, height: shelfH, rx: 14, class: "shelf" }, g);
  el("text", { x: sx0 + 18, y: b.y0 + 40, class: "area-t" }, g, "Store");
  stored.forEach(([id, d], i) => {                   // instruments in the store: shrunk; press and drag onto the bench
    const [W, D] = d.dims_mm, k = Math.min(1, 160 / W, 150 / D);
    const cx = sx0 + 100 + (i % 3) * 190, cy = b.y0 + 140 + Math.floor(i / 3) * 200;
    const grp = el("g", { "data-d": id, class: "stored-dev" }, g);
    const mg = el("g", { transform: `translate(${cx},${cy}) scale(${k}) translate(${-W / 2},${-D / 2})` }, grp);
    el("rect", { x: 0, y: 0, width: W, height: D, rx: 14, class: "top-dev" }, mg);
    if (typeof TOP !== "undefined" && TOP[d.category]) TOP[d.category](mg, { id, d, cx: W / 2, cy: D / 2, L: 0, T: 0, W, D });
    else if (d.category === "syringe_pump") pumpTop(mg, id, d, { x_mm: W / 2, y_mm: D / 2 });
    el("text", { x: cx, y: cy + D * k / 2 + 24, class: "lbl" }, grp, id);
    grp.addEventListener("pointerdown", (e) => typeof startMove === "function" && startMove(e, "device", id));
    grp.addEventListener("mouseleave", hideTip);
  });
  if (S.mode === "sandbox") {                       // bench grid (100 mm cells, heavy line every 5)
    const C = 100, gx0 = Math.ceil(b.x0 / C), gx1 = Math.floor(b.x1 / C), gy0 = Math.ceil(b.y0 / C), gy1 = Math.floor(b.y1 / C);
    for (let i = gx0; i <= gx1; i++) el("line", { x1: i * C, x2: i * C, y1: b.y0, y2: b.y1, class: i % 5 ? "grid-cell" : "grid-cell major" }, g);
    for (let j = gy0; j <= gy1; j++) el("line", { x1: b.x0, x2: b.x1, y1: j * C, y2: j * C, class: j % 5 ? "grid-cell" : "grid-cell major" }, g);
  }
  for (const s of Object.values(st.slots)) el("rect", { x: s.x_mm - s.w_mm / 2, y: s.y_mm - s.d_mm / 2, width: s.w_mm, height: s.d_mm, rx: 8, class: "top-slot" }, g);
  const dpos = {};
  for (const [id, d] of Object.entries(f.devices)) {
    const s = st.slots[d.slot]; if (!s) continue;
    const [W0, D0] = d.dims_mm, rot = d.rotation || 0;
    const [W, D] = rot % 180 === 90 ? [D0, W0] : [W0, D0];          // footprint by orientation (for text and reading bars)
    dpos[id] = { x: s.x_mm, y: s.y_mm };
    S.devBoxes[id] = { L: s.x_mm - W / 2, T: s.y_mm - D / 2, W, H: D, x: s.x_mm, yb: s.y_mm + D / 2 };   // for the animation layer
    const grp = el("g", { "data-d": id }, g);
    const mg = el("g", rot ? { transform: `rotate(${rot} ${s.x_mm} ${s.y_mm})` } : {}, grp);   // the model itself rotates with orientation
    el("rect", { x: s.x_mm - W0 / 2, y: s.y_mm - D0 / 2, width: W0, height: D0, rx: 14, class: "top-dev" }, mg);
    const topModel = typeof TOP !== "undefined" ? TOP[d.category] : null;
    if (topModel) topModel(mg, { id, d, cx: s.x_mm, cy: s.y_mm, L: s.x_mm - W0 / 2, T: s.y_mm - D0 / 2, W: W0, D: D0 });
    else {
      if (["hotplate_stirrer", "balance"].includes(d.category)) el("circle", { cx: s.x_mm, cy: s.y_mm - D * 0.12, r: Math.min(W, D) * 0.33, class: "top-plate" }, grp);
      if (d.category === "liquid_handler") {          // OT-2 deck: 3 × 4 slot grid
        for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 3; c2++)
          el("rect", { x: s.x_mm - W / 2 + 20 + c2 * (W - 40) / 3, y: s.y_mm - D / 2 + 20 + r * (D - 40) / 4, width: (W - 40) / 3 - 8,
                       height: (D - 40) / 4 - 8, rx: 6, fill: "none", stroke: "#b9c2cf", "stroke-dasharray": "6 5" }, grp);
        el("text", { x: s.x_mm - W / 2 + 26, y: s.y_mm - D / 2 + 44, class: "lbl", "text-anchor": "start" }, grp, "OT-2");
      }
      if (d.category === "thermostatic_bath") el("rect", { x: s.x_mm - W / 2 + 12, y: s.y_mm - D / 2 + 12, width: W - 24, height: D * 0.6, rx: 8, fill: "#9fd0e6", "fill-opacity": .6 }, grp);
    }
    el("text", { x: s.x_mm, y: s.y_mm + D / 2 + 26, class: "lbl" }, grp, id);
    if (d.category === "syringe_pump") {
      const ports = pumpTop(mg, id, d, s), a = rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      dpos[id].ports = Object.fromEntries(Object.entries(ports).map(([k, q]) => [k, {      // port positions rotate too
        x: s.x_mm + (q.x - s.x_mm) * ca - (q.y - s.y_mm) * sa, y: s.y_mm + (q.x - s.x_mm) * sa + (q.y - s.y_mm) * ca }]));
    }
    grp.addEventListener("mouseenter", () => { S.hoverDev = id; });
    grp.addEventListener("pointerdown", (e) => typeof startMove === "function" && startMove(e, "device", id));
    grp.addEventListener("mouseleave", () => { if (S.hoverDev === id) S.hoverDev = null; });
    const ico = d.category === "syringe_pump" || topModel ? null : TOP_ICON[d.category];
    if (ico && !DECK_DEVICES.has(d.category)) el("text", { x: s.x_mm, y: s.y_mm + Math.min(D, W) * 0.12, class: "top-ico", "font-size": Math.max(40, Math.min(W, D) * 0.42) }, grp, ico);
    else if (ico) el("text", { x: s.x_mm + W / 2 - 22, y: s.y_mm - D / 2 + 40, class: "top-ico", "font-size": 30 }, grp, ico);
    const rd = topReading(d);
    if (rd) {
      const fs = Math.max(22, Math.min(34, W * 0.13));
      el("rect", { x: s.x_mm - W / 2 + 6, y: s.y_mm + D / 2 - fs - 14, width: W - 12, height: fs + 10, rx: 6, class: "top-read-bg" }, grp);
      el("text", { x: s.x_mm, y: s.y_mm + D / 2 - 11, class: "top-read", "font-size": fs }, grp, rd);
    }
    grp.addEventListener("mouseleave", hideTip);
  }
  const store = Object.keys(f.containers).filter((k) => f.containers[k].location === "storage");
  const cpos = {}, onSlot = {}, deckCount = {};
  for (const c of Object.values(f.containers)) if (dpos[c.location]) deckCount[c.location] = (deckCount[c.location] || 0) + 1;
  for (const [cid, c] of Object.entries(f.containers)) {
    let p;
    if (c.location === "storage") { const i = store.indexOf(cid); p = { x: sx0 + 100 + (i % 3) * 190, y: b.y0 + 140 + devRows * 200 + Math.floor(i / 3) * 175 }; }
    else if (dpos[c.location] && DECK_DEVICES.has(f.devices[c.location].category)) {
      const d = f.devices[c.location], [W, D] = d.dims_mm, k = (onSlot[c.location] = (onSlot[c.location] || 0) + 1) - 1;
      const n = deckCount[c.location], top = d.category === "liquid_handler" ? 60 : 8;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * W / Math.max(1, D - top)))), rows = Math.ceil(n / cols);
      const px = (W - 16) / cols, py = (D - top - 8) / rows;
      p = { x: dpos[c.location].x - W / 2 + 8 + px * (k % cols + 0.5), y: dpos[c.location].y - D / 2 + top + py * (Math.floor(k / cols) + 0.5),
            rmax: 0.42 * Math.min(px, py) };
    }
    else if (dpos[c.location]) { const d = f.devices[c.location]; p = { x: dpos[c.location].x, y: dpos[c.location].y - d.dims_mm[1] * 0.12 }; }
    else if (st.slots[c.location]) { const s = st.slots[c.location]; const k = (onSlot[c.location] = (onSlot[c.location] || 0) + 1) - 1; p = { x: s.x_mm + k * 40, y: s.y_mm }; }
    else continue;
    cpos[cid] = p;
    const r = Math.min(8 + 2.6 * Math.sqrt(c.capacity_mL), p.rmax ?? Infinity);
    const vol = S.operator ? c.truth.volume_mL : c.ledger_mL;
    const grp = el("g", { "data-c": cid }, g);
    if (vol > 0) el("circle", { cx: p.x, cy: p.y, r: r * (0.4 + 0.6 * Math.sqrt(Math.min(1, vol / c.capacity_mL))), fill: liquidColor(c) }, grp);
    el("circle", { cx: p.x, cy: p.y, r, class: "glass" }, grp);
    if (S.activeIds.has(cid)) el("circle", { cx: p.x, cy: p.y, r: r + 12, class: "active-ring" }, grp);
    if (p.rmax) el("text", { x: p.x, y: p.y + r + Math.max(9, r * 0.9), class: "lbl", "font-size": Math.max(9, Math.min(20, p.rmax * 0.75)) }, grp, cid);
    else el("text", { x: p.x, y: p.y + r + 22, class: "lbl" }, grp, cid);
    grp.addEventListener("pointerdown", (e) => typeof startMove === "function" && startMove(e, "container", cid));
      grp.addEventListener("mouseleave", hideTip);
  }
  const topK = {};
  for (const [id, d] of Object.entries(f.devices)) for (const [port, cid] of Object.entries(d.connections)) {
    const a0 = dpos[id], q = cpos[cid]; if (!a0 || !q) continue;
    const a = a0.ports?.[port] || a0;
    if (d.category === "syringe_pump") {                                // top view: tubing lies flat on the bench with soft corners
      const src = d.connections.in && f.containers[d.connections.in];
      const k = (topK[cid] = (topK[cid] ?? -1) + 1);
      const pts = Math.abs(q.y - a.y) > 120 ? [[a.x, a.y], [a.x, q.y], [q.x, q.y]]           // vessel in another row: an L
        : (() => { const lane = Math.max(a.y, q.y) + 110 + k * 12, ex = q.x + (k - 1.5) * 10;   // same row: out in front of the
            return [[a.x, a.y], [a.x, lane], [ex, lane], [ex, q.y]]; })();                         // instruments, then into the vessel
      pumpTube(g, id, d, port, roundedPath(pts, 40), src ? liquidColor(src) : pumpColor(d.anim));
      continue;
    }
    const pd = `M${a.x},${a.y} Q${(a.x + q.x) / 2},${Math.min(a.y, q.y) - 90} ${q.x},${q.y}`;
    el("path", { d: pd, class: "cable" }, g);
  }
  drawArms(g, f, "top", b);
  S.geo = { mode: "top", b, holders: dpos, boxes: S.devBoxes,
            pos: Object.fromEntries(Object.entries(cpos).map(([k, p]) => {
              const r = Math.min(8 + 2.6 * Math.sqrt(f.containers[k].capacity_mL), p.rmax ?? Infinity);
              return [k, { x: p.x, y: p.y, w: r, h: 2 * r, top: p.y }];
            })) };
  // executors in top view: dots
  // executors (human) are drawn by the animation layer: walking along the bench front to the work spot
  return { x: sx0 - 40, y: b.y0 - 60, w: b.x1 - sx0 + 80, h: Math.max(b.y1 - b.y0, shelfH) + 240 };
}

// ================================================================ robot arm
function drawArms(g, f, mode, b) {
  const act = f.activity;
  for (const e of f.executors.filter((x) => x.kind === "robot_arm" && x.base_xy_mm)) {
    const [bx, by] = e.base_xy_mm, [px, py, pz] = e.pos_mm || [bx, by, 300];
    const busy = act && act.executor === e.id;
    const grp = el("g", { class: `arm ${busy ? "busy" : ""} ${mode === "front" && !busy ? "ghost" : ""}` }, g);   // front view: translucent when idle so it doesn't hide instruments
    if (mode === "top") {
      el("circle", { cx: bx, cy: by, r: e.reach_mm, class: "arm-reach" }, grp);
      el("line", { x1: bx, y1: by, x2: px, y2: py, class: "arm-link" }, grp);
      el("circle", { cx: bx, cy: by, r: 60, class: "arm-base" }, grp);
      el("circle", { cx: px, cy: py, r: 22, class: "arm-tool" }, grp);
      el("text", { x: bx, y: by + 95, class: "lbl" }, grp, e.id);
    } else {
      const X0 = bx, Y0 = baseY(b, by);                 // base on the bench top
      const sh = { x: X0, y: Y0 - 260 };                 // shoulder
      const tx = px, ty = baseY(b, py) - pz;             // end effector
      const L = 380, dx = tx - sh.x, dy = ty - sh.y, d = Math.min(Math.hypot(dx, dy), 2 * L - 1);
      const mx = (sh.x + tx) / 2, my = (sh.y + ty) / 2, h = Math.sqrt(Math.max(0, L * L - (d / 2) ** 2));
      const el_x = mx + (dy / (d || 1)) * h * (dx >= 0 ? 1 : -1), el_y = my - Math.abs(dx / (d || 1)) * h;   // elbow points up
      el("rect", { x: X0 - 70, y: Y0 - 40, width: 140, height: 40, rx: 10, class: "arm-base" }, grp);
      el("rect", { x: X0 - 34, y: sh.y, width: 68, height: Y0 - 40 - sh.y, rx: 18, class: "arm-base" }, grp);
      el("path", { d: `M${sh.x},${sh.y} L${el_x},${el_y} L${tx},${ty - 40}`, class: "arm-link" }, grp);
      for (const [cx, cy, r] of [[sh.x, sh.y, 30], [el_x, el_y, 24], [tx, ty - 40, 18]]) el("circle", { cx, cy, r, class: "arm-joint" }, grp);
      el("path", { d: `M${tx - 22},${ty - 22} L${tx - 22},${ty + 6} M${tx + 22},${ty - 22} L${tx + 22},${ty + 6}`, class: "arm-finger" }, grp);
      el("text", { x: X0, y: Y0 + 30, class: "lbl" }, grp, e.id);
      // speech bubble above the arm removed too
    }
  }
}

// ================================================================ executor avatars
const TARGET_KEYS = ["dst", "container", "filter", "location", "device", "src"];
function targetOf(act, ...maps) {
  for (const k of TARGET_KEYS) {
    const v = act.params[k];
    for (const m of maps) if (v && m[v]) return m[v];
  }
  return null;
}
const lastAvatarX = {};
function drawAvatars(g, f, pos, holders, benchY, floorY) {
  const act = f.activity;
  const humans = f.executors.filter((e) => /human/.test(e.kind));
  humans.forEach((e, i) => {
    let x = lastAvatarX[e.id] ?? (benchBounds(S.static).x0 + 120 + i * 140);
    const busy = act && act.executor === e.id;
    if (busy) {
      const tgt = targetOf(act, pos, holders);
      if (tgt) x = tgt.x - 70;
    }
    lastAvatarX[e.id] = x;
    const a = el("g", { class: `avatar ${busy ? "walk" : ""}` }, g);
    S.avShown = S.avShown || {};                     // walk smoothly: tween from the last shown position to the target (~1.2 m/s, continuous across redraws)
    const from = S.avShown[e.id] ?? x, dist = Math.abs(x - from);
    if (typeof tween === "function" && dist > 1) tween(e.id, S.avShown, x, Math.max(300, Math.min(2500, dist / 1.2)), (v) => a.setAttribute("transform", `translate(${v},${floorY})`));
    else { S.avShown[e.id] = x; a.setAttribute("transform", `translate(${x},${floorY})`); }
    el("rect", { x: -34, y: -330, width: 68, height: 200, rx: 26, class: "body" }, a);
    el("rect", { x: -26, y: -140, width: 20, height: 140, rx: 8, fill: "#3d5a4a" }, a);
    el("rect", { x: 6, y: -140, width: 20, height: 140, rx: 8, fill: "#3d5a4a" }, a);
    el("circle", { cx: 0, cy: -372, r: 40, class: "head" }, a);
    el("rect", { x: -30, y: -386, width: 60, height: 16, rx: 7, class: "goggles" }, a);
    el("path", { d: busy ? "M30,-300 Q90,-330 110,-370" : "M30,-300 Q50,-240 40,-190", stroke: "#f3f3ea", "stroke-width": 16, fill: "none", "stroke-linecap": "round" }, a);
    el("circle", { cx: busy ? 110 : 40, cy: busy ? -370 : -190, r: 10, class: "glove" }, a);
    el("text", { x: 0, y: 30, class: "lbl" }, a, e.id);
    // speech bubble removed (too distracting): see the plan progress bar on the right for the current action
  });
}

// ================================================================ equipment table
function renderTable(f) {
  const devRows = Object.entries(f.devices).map(([id, d]) => `<tr><td><b>${esc(id)}</b></td><td>${esc(d.category)}</td><td>${esc(d.model)}${d.verified ? "" : " (specs unverified)"}</td>
    <td>${esc(d.slot)}</td><td>${d.dims_mm.join(" × ")}</td><td>${esc(d.mode)}</td>
    <td>${Object.entries(d.connections).map(([p, c]) => `${esc(p)}→${esc(c)}`).join("<br>") || "—"}</td>
    <td>${Object.entries(d.fields).map(([k, v]) => `${esc(k)} ${esc(fmt(v.best?.v))} <i class="k ${esc(v.best?.k)}"></i>`).join("<br>")}</td></tr>`).join("");
  const ctRows = Object.entries(f.containers).map(([cid, c]) => `<tr><td><b>${esc(cid)}</b></td><td>${esc(c.type)}</td><td>${esc(c.label)}</td><td>${esc(c.location)}</td>
    <td>${fmt(c.ledger_mL)} / ${fmt(c.capacity_mL)} mL</td>
    ${S.operator ? `<td>${c.truth.rgb ? `<span class="sw" style="background:rgb(${c.truth.rgb.join(",")})"></span> ` : ""}${fmt(c.truth.volume_mL)} mL · ${fmt(c.truth.temperature_C)} °C · pH ${fmt(c.truth.pH)}</td>` : ""}
    <td>${esc(c.attachments.join(", ")) || "—"}</td></tr>`).join("");
  $("tableView").innerHTML = `<h4>Devices</h4><table><tr><th>id</th><th>Category</th><th>Model</th><th>Slot</th><th>Size mm</th><th>Backend</th><th>Connections</th><th>Readings</th></tr>${devRows}</table>
    <h4>Containers and reagents</h4><table><tr><th>id</th><th>Type</th><th>Label</th><th>Location</th><th>Ledger volume</th>${S.operator ? "<th>Truth (hidden from agent)</th>" : ""}<th>Connections</th></tr>${ctRows}</table>
    <h4>Executors</h4><table><tr><th>id</th><th>Type</th><th>Skills</th><th>Tasks</th><th>Active time</th></tr>${f.executors.map((e) => `<tr><td>${esc(e.id)}</td><td>${esc(e.kind)}</td><td>${esc(e.skills.join(", "))}</td><td>${e.tasks}</td><td>${fmt(e.active_time_s, 3)} s</td></tr>`).join("")}</table>`;
}

// ================================================================ main render
function render() {
  const f = frame(), st = S.static;
  $("expTitle").textContent = S.mode === "sandbox" ? (st?.experiment ? `Arranging: ${st.experiment.title}` : "Manual bench") : st?.experiment ? `${st.experiment.title} · seed ${st.experiment.seed}` : "No experiment loaded";
  $("simTime").textContent = f ? fmtT(f.t) : "—";
  const stat = S.mode === "replay" ? "Replay" : S.mode === "sandbox" ? (S.status === "running" ? "Running" : "Paused") : ({ running: "Running", finished: "Finished", error: "Error", stopped: "Stopped", idle: "Idle" }[S.status] ?? S.status);
  $("status").textContent = stat; $("status").className = `pill ${S.mode === "replay" ? "" : S.status}`;
  $("scrub").max = Math.max(0, S.frames.length - 1); $("scrub").value = S.idx;
  $("banner").hidden = !f?.halted; $("banner").textContent = f?.halted ?? "";
  updateRunBtn();
  if (!f || !st) return;
  S.activeIds = new Set(f.activity ? Object.values(f.activity.params).filter((v) => typeof v === "string") : []);
  S.stirring = new Set();
  for (const d of Object.values(f.devices)) if (d.category === "hotplate_stirrer" && (best(d, "speed") ?? 0) > 50)
    for (const [cid, c] of Object.entries(f.containers)) if (c.location === Object.keys(f.devices).find((k) => f.devices[k] === d)) S.stirring.add(cid);
  const svg = $("world");
  svg.innerHTML = ""; clipSeq = 0; S.bubbleAnchor = null;
  S.devBoxes = {};
  if (typeof pumpPrepare === "function") { pumpPrepare(f); PUMP.tw = []; }
  if (typeof gearCapture === "function") gearCapture(f);
  document.body.classList.toggle("view-prep", S.view === "table");   // the prep library is a plain page: zoom / pan / drawer buttons are hidden
  $("tableView").hidden = S.view !== "table"; svg.style.display = S.view === "table" ? "none" : "block";
  if (S.view === "table") { if (typeof renderGear === "function") renderGear(f); else renderTable(f); if ($("agentConsole")) $("agentConsole").hidden = true; }   // equipment page: all equipment on one big table
  else {
    document.body.classList.toggle("view-iso", S.view === "iso");
    const box = S.view === "front" ? renderFront(svg, f, st) : S.view === "iso" ? renderIso(svg, f, st) : renderTop(svg, f, st);
    if (typeof pumpGhosts === "function") pumpGhosts(svg);
    if (S.view === "front" && typeof frontLayers === "function") frontLayers(f, st);
    if (S.view === "iso" && typeof isoLayers === "function") { isoLayers(f); isoXray(ISO.hover); }   // keep the hover see-through across redraws
    if (typeof demoTick === "function") demoTick(f);
    if (typeof renderConsole === "function") renderConsole(f);
    if (typeof autoFocus === "function") autoFocus(f);
    if (!S.fitted[S.view] || !S.vb) { S.vb = { ...box }; S.fitted[S.view] = true; S.home = { ...box }; }
    applyVB();
  }
  placeBubble();
  renderSide(f, st);
  if (typeof renderFx === "function") { renderFx(f); renderNarration(f); }
}
function applyVB() {
  const v = S.vb; $("world").setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  const fx = document.getElementById("fx"); if (fx) fx.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  const ov = document.getElementById("benchOverlay"); if (ov) ov.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
}
function placeBubble() {
  const b = $("bubble");
  if (!S.bubbleAnchor || S.view !== "front") { b.hidden = true; return; }
  const svg = $("world"), m = svg.getScreenCTM(); if (!m) return;
  const p = svg.createSVGPoint(); p.x = S.bubbleAnchor.x; p.y = S.bubbleAnchor.y;
  const q = p.matrixTransform(m), r = $("stage").getBoundingClientRect();
  b.innerHTML = S.bubbleAnchor.text; b.hidden = false;
  b.style.left = `${q.x - r.left}px`; b.style.top = `${q.y - r.top}px`;
}

function renderSide(f, st) {
  const a = f.activity;
  if (a) {
    const p = Math.max(0, Math.min(1, (f.t - a.t_start) / Math.max(0.1, a.t_end - a.t_start)));
    $("activity").innerHTML = `<div class="act ${a.is_human ? "human" : ""}"><b>${esc(a.executor)}</b> <span class="muted">${esc(a.executor_kind)}</span>${a.is_human ? " · needs human" : ""}<br>
      ${esc(a.skill)} (${esc(Object.entries(a.params).map(([k, v]) => `${k}=${v}`).join(", "))})<div class="prog"><div style="width:${(p * 100).toFixed(0)}%"></div></div></div>`;
  } else $("activity").innerHTML = `<span class="muted">${f.halted ? "E-stopped" : "Devices running / waiting"}</span>`;
  const rows = [];
  for (const [id, d] of Object.entries(f.devices)) for (const [k, v] of Object.entries(d.fields)) {
    const q = v.best; if (!q || q.v == null || q.u === "bool") continue;
    const bad = v.status === "real_stale" || v.status === "real_missing";
    rows.push(`<div class="rd"><span class="n">${esc(id)}.${esc(k)}</span><span class="v ${bad ? "bad" : ""}">${esc(fmt(q.v))} ${esc(UNIT[q.u] ?? q.u)}</span>
      <span class="k"><i class="k ${esc(q.k)}"></i>${esc(q.k)} · ${esc(v.status)}</span></div>`);
  }
  $("readings").innerHTML = rows.join("") || `<span class="muted">No readings yet</span>`;
  const ex = st.experiment;
  $("goal").textContent = ex ? ex.goal : "";
  let h = "";
  if (f.submitted) h += `<div>Submitted: <b>${esc(f.submitted.quantity)} = ${fmt(f.submitted.value, 5)} ${esc(f.submitted.unit)}</b></div><div class="muted">${esc((f.submitted.method || "").slice(0, 160))}</div>`;
  else h += `<div class="muted">No result submitted yet</div>`;
  const sc = S.idx === S.frames.length - 1 ? S.score : null;
  if (S.operator && sc && sc.submitted !== undefined) h += `<div class="${sc.pass ? "pass" : "fail"}">${sc.pass ? "Pass" : "Fail"}: truth ${fmt(sc.truth, 5)}${sc.error != null ? `, error ${fmt(sc.error, 3)}` : ""}</div>`;
  // real/twin divergence and expectation divergence alerts: those still unresolved before the current frame
  const alerts = new Map();
  for (const e of S.events) {
    if (e.seq >= f.event_seq) break;
    const k = `${e.device}.${e.field}`;
    if (e.type === "twin_divergence" || e.type === "expectation_divergence") alerts.set(k, e);
    else if (e.type === "twin_reconverged" || e.type === "expectation_reconverged") alerts.delete(k);
  }
  if (alerts.size) h += `<div class="alerts">${[...alerts.values()].map((e) => `<div class="fail">${esc(summ(e))}</div>`).join("")}</div>`;
  $("result").innerHTML = h;
  const ev = S.events.filter((e) => e.seq < f.event_seq && !e.truth_only).slice(-1)[0];
  if (ev) $("ticker").innerHTML = `<span class="${/rejected|blocked|emergency|divergence/.test(ev.type) ? "bad" : ""}">${fmtT(ev.t)} · ${esc(ev.type)} · ${esc(summ(ev))}</span>`;
}
function summ(e) {
  switch (e.type) {
    case "task_started": return `${e.executor} starts ${e.skill}`;
    case "task_finished": return `${e.executor} ${e.result?.ok ? "finished" : "failed"} ${e.skill}: ${e.result?.detail ?? ""}`;
    case "robot_primitives": return `${e.executor} (${e.driver}) ${e.skill} → ${e.n} motion primitives${e.ok ? "" : " (failed)"}`;
    case "task_card_issued": return `Task card to offline operator ${e.executor}: ${e.card?.task}`;
    case "operator_reported": return `${e.executor} reported: ${JSON.stringify(e.reported)}`;
    case "twin_divergence": return `⚠ Real device and twin disagree: ${e.device}.${e.field} real ${fmt(e.real)} vs twin ${fmt(e.twin)} (tolerance ${fmt(e.tolerance)})`;
    case "expectation_divergence": return `⚠ Reading disagrees with twin assumptions: ${e.device}.${e.field} measured ${fmt(e.measured)} vs expected ${fmt(e.expected)} (${e.container}) — possibly a physical deviation (dosing / concentration / weighing)`;
    case "expectation_reconverged": return `${e.device}.${e.field} reading matches expectation again`;
    case "twin_reconverged": return `${e.device}.${e.field} real device and twin agree again`;
    case "command": return `${e.device}.${e.command}(${Object.entries(e.params || {}).map(([k, v]) => `${k}=${v}`).join(", ")})`;
    case "command_rejected": return `${e.device}.${e.command} rejected: ${(e.violations || []).map((v) => v.message).join("; ")}`;
    case "agent_tool_call": return `agent calls ${e.tool}`;
    case "agent_thought": return `agent thinking: ${(e.content || e.reasoning || "").slice(0, 80)}`;
    case "decision": return `Check ${e.ref} = ${e.value == null ? "—" : fmt(e.value, 4)}, target ${e.op} ${e.target} → ${e.verdict}`;
    case "result_submitted": return `Submitted ${e.quantity} = ${fmt(e.value, 5)} ${e.unit}`;
    case "record": return `Recorded ${e.label}`;
    default: return "";
  }
}

// ================================================================ interaction: zoom and pan
function svgPoint(evt) {
  const svg = $("world"), m = svg.getScreenCTM().inverse(), p = svg.createSVGPoint();
  p.x = evt.clientX; p.y = evt.clientY; return p.matrixTransform(m);
}
$("world").addEventListener("wheel", (e) => {
  if (!S.vb) return; e.preventDefault();
  const k = e.deltaY > 0 ? 1.12 : 1 / 1.12, p = svgPoint(e);
  S.vb = { x: p.x - (p.x - S.vb.x) * k, y: p.y - (p.y - S.vb.y) * k, w: S.vb.w * k, h: S.vb.h * k }; applyVB(); placeBubble();
}, { passive: false });
let drag = null;
$("world").addEventListener("pointerdown", (e) => { if (!S.vb) return; drag = { p: svgPoint(e), vb: { ...S.vb } }; $("world").classList.add("dragging"); $("world").setPointerCapture(e.pointerId); });
$("world").addEventListener("pointermove", (e) => {
  if (!drag) return; const p = svgPoint(e);
  S.vb.x -= p.x - drag.p.x; S.vb.y -= p.y - drag.p.y; applyVB(); placeBubble();
});
$("world").addEventListener("pointerup", () => { drag = null; $("world").classList.remove("dragging"); });
function zoomBy(k) { if (!S.vb) return; const cx = S.vb.x + S.vb.w / 2, cy = S.vb.y + S.vb.h / 2; S.vb = { x: cx - S.vb.w * k / 2, y: cy - S.vb.h * k / 2, w: S.vb.w * k, h: S.vb.h * k }; applyVB(); placeBubble(); }
$("zoomIn").onclick = () => zoomBy(1 / 1.25); $("zoomOut").onclick = () => zoomBy(1.25);
$("fit").onclick = () => { if (S.home) { S.vb = { ...S.home }; applyVB(); placeBubble(); } };
function setView(v) {
  S.view = v; S.vb = null; S.fitted[v] = false;
  for (const b of document.querySelectorAll(".tabs button")) b.classList.toggle("on", b.dataset.view === v);
  render();
}
for (const b of document.querySelectorAll(".tabs button")) b.onclick = () => setView(b.dataset.view);
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (e.key === "1") setView("front"); else if (e.key === "2") setView("top"); else if (e.key === "3") setView("table"); else if (e.key === "4") setView("iso");
  else if (e.key === "f" || e.key === "F") $("fit").click();
  else if (e.key === "+" || e.key === "=") zoomBy(1 / 1.25); else if (e.key === "-") zoomBy(1.25);
  else if (e.key === " ") { e.preventDefault(); togglePlay(); }
});
window.addEventListener("resize", placeBubble);
// sidebar toggle: wide window = hide/show, narrow window (≤ 980 px) = open/close drawer; refit the view afterwards
function togglePanel() {
  const narrow = window.matchMedia("(max-width: 980px)").matches;
  document.body.classList.toggle(narrow ? "panel-open" : "panel-hidden");
  const shown = narrow ? document.body.classList.contains("panel-open") : !document.body.classList.contains("panel-hidden");
  const hd = document.getElementById("panelHandle"); if (hd) hd.textContent = shown ? "›" : "‹";
  setTimeout(() => document.getElementById("fit")?.click(), 30);
}
document.getElementById("btnPanel")?.addEventListener("click", togglePanel);
document.addEventListener("keydown", (e) => {
  if ((e.key === "p" || e.key === "P") && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) togglePanel();
});
document.querySelector("details.more")?.addEventListener("toggle", (e) => {   // open the menu toward whichever side has room
  const d = e.currentTarget, m = d.querySelector(".menu");
  if (!d.open) return;
  m.style.left = ""; m.style.right = "";
  const r = m.getBoundingClientRect();
  if (r.left < 8) { m.style.left = "0"; m.style.right = "auto"; }
  else if (r.right > window.innerWidth - 8) { m.style.right = "0"; m.style.left = "auto"; }
});
document.addEventListener("click", (e) => {        // close the page menu on outside click
  const m = document.querySelector("details.more");
  if (m && m.open && !m.contains(e.target)) m.open = false;
});
let _fitTimer = null;
window.addEventListener("resize", () => { clearTimeout(_fitTimer); _fitTimer = setTimeout(() => document.getElementById("fit")?.click(), 150); });
function tip(e, html) { const t = $("tip"); t.innerHTML = html; t.hidden = false; t.style.left = `${Math.min(innerWidth - t.offsetWidth - 10, e.clientX + 14)}px`; t.style.top = `${e.clientY + 14}px`; }
function hideTip() { $("tip").hidden = true; }

// ================================================================ data: live and replay
function reset(mode) { clearInterval(S.sbPoll); if (mode !== "live") clearInterval(S.poll); Object.assign(S, { mode, static: null, frames: [], events: [], idx: 0, frameNext: 0, eventNext: 0, score: null, follow: true, playing: false }); $("chkFollow").checked = true; $("btnPlay").textContent = "▶"; S.fitted = { front: false, top: false }; S.vb = null; }
// three experiment phases: arranging (drag / rotate on the bench) → running (view only) → after abort / finish, back to arranging
async function loadExperimentBench(exp) {
  try {
    await api("/api/sandbox/new", { sid: "studio", experiment: exp, seed: $("inSeed").value, humans: $("inHumans").value });
    if (typeof SB !== "undefined") SB.sid = "studio";
    await startSandbox();
    if (typeof demoOrganizeFor === "function") await demoOrganizeFor(exp);   // place only what's needed, by docking relations
    if (typeof toast === "function") toast("Bench loaded: drag equipment, press E to rotate, then click ▶ Start");
  } catch (e) { $("hint").textContent = e.message; }
}
function benchLayout() {                         // current bench layout: device positions (per device), container slots, orientation, devices on the shelf
  const st = S.static, f = S.frames[S.idx];
  const devices = {}, stored = [], slots = {}, devSlots = new Set();
  for (const [id, d] of Object.entries(f.devices)) {
    const s = st.slots[d.slot];
    if (s) { devices[id] = { x_mm: s.x_mm, y_mm: s.y_mm, w_mm: s.w_mm, d_mm: s.d_mm }; devSlots.add(d.slot); }
    else stored.push(id);
  }
  for (const [k, s] of Object.entries(st.slots)) if (!devSlots.has(k)) slots[k] = { x_mm: s.x_mm, y_mm: s.y_mm, w_mm: s.w_mm, d_mm: s.d_mm };
  return { devices, slots, stored, only_listed_slots: true, bench: st.bench || null,
           rotations: Object.fromEntries(Object.entries(f.devices).map(([k, d]) => [k, d.rotation || 0])) };
}
async function startLive() {
  $("hint").textContent = "";
  const gen = S.mode === "sandbox" && /^gen_/.test(S.static?.experiment?.id || "") ? S.static.experiment.id : null;
  if (gen) {                                       // experiment compiled from a paper: run its compiled plan (with the bench layout too)
    try {
      if (S.sbPlaying) await api("/api/sandbox/pause", { sid: "studio" });
      await api("/api/paper/run", { exp_id: gen, speed: $("selSpeed").value, seed: $("inSeed").value, layout: benchLayout() });
    } catch (e) { $("hint").textContent = e.message; if (typeof toast === "function") toast(e.message, true); return; }
    if (typeof toggleDrawer === "function") toggleDrawer(false);
    reset("live"); startPolling(); return;
  }
  const exp = $("selExp").value;
  if (!(S.mode === "sandbox" && S.static?.experiment?.id === exp)) await loadExperimentBench(exp);   // load the bench first, run with the aligned layout
  if (typeof DEMO !== "undefined" && $("selPlanner").value !== "fixed") {   // LLM plans by itself: no pre-written steps
    DEMO.prep = null; DEMO.choice = null; DEMO.running = true; DEMO.done = false;
    $("demoSteps").innerHTML = ""; $("demoChoice").innerHTML = ""; $("planProg").hidden = true;
  }
  if (typeof DEMO !== "undefined" && $("selPlanner").value === "fixed") {   // plan steps (for the right progress bar and left step list)
    try { DEMO.prep = await api("/api/demo/prepare", { kind: "experiment", ref: exp }); DEMO.current = 0; DEMO.done = false; DEMO.summaryShown = false; DEMO.running = true; demoRenderSteps(); }
    catch { DEMO.prep = null; }
  }
  const layout = S.mode === "sandbox" && S.static?.experiment?.id === exp ? benchLayout() : null;
  try {
    if (S.sbPlaying) await api("/api/sandbox/pause", { sid: "studio" });
    const extra = typeof DEMO !== "undefined" && DEMO.prep && $("selPlanner").value === "fixed" ? { plan: DEMO.prep.plan, assembly_steps: DEMO.prep.assembly_steps || 0 } : {};
    await api("/api/live/start", { experiment: exp, seed: $("inSeed").value, humans: $("inHumans").value, robot: $("selRobot").value, operators: $("inOperators").value, planner: $("selPlanner").value, speed: $("selSpeed").value, layout, ...extra });
  } catch (e) { $("hint").textContent = e.message; if (typeof toast === "function") toast(e.message, true); return; }
  if (typeof toggleDrawer === "function") toggleDrawer(false);
  reset("live"); startPolling();
}
async function stopLive() { try { await api("/api/live/stop", {}); } catch { /* already stopped */ } }
function updateRunBtn() {
  const b = $("runBtn"); if (!b) return;
  let txt = "", cls = "primary run-btn";
  if (S.mode === "sandbox" && ((typeof DEMO !== "undefined" && DEMO.choice) || S.static?.experiment)) txt = "▶ Start";     // experiment picked in the prep library: start directly
  else if (S.mode === "sandbox") { txt = S.sbPlaying ? "❚❚ Pause" : "▶ Run"; cls = S.sbPlaying ? "run-btn" : "primary run-btn"; }   // manual bench: time runs / stops
  else if (S.mode === "live" && S.status === "running") { txt = "■ Abort"; cls = "run-btn stop"; }
  else if (S.mode === "live" || S.mode === "replay") txt = "↺ Back to arranging";
  b.hidden = !txt; b.textContent = txt; b.className = cls;
}
function startPolling() { clearInterval(S.poll); S.poll = setInterval(poll, 400); poll(); }
async function poll() {
  let p; try { p = await api(`/api/live/poll?frame=${S.frameNext}&event=${S.eventNext}`); } catch { return; }
  if (p.status === "idle") { clearInterval(S.poll); return; }
  if (p.static) S.static = p.static;
  S.frames.push(...(p.frames || [])); S.events.push(...(p.events || []));
  S.frameNext = p.frame_next; S.eventNext = p.event_next; S.status = p.status; S.score = p.score;
  $("hint").textContent = p.error ? `Error: ${p.error}` : `Log: ${p.log}`;
  if (S.follow) S.idx = Math.max(0, S.frames.length - 1);
  render();
  if (p.status !== "running") {
    clearInterval(S.poll); loadRuns();
    if (typeof demoFinish === "function" && DEMO.prep && DEMO.running) {   // demo: show conclusion, don't return to arranging automatically
      render(); demoFinish(p); return;
    }
    if (p.status === "stopped" && typeof startSandbox === "function") {      // after abort, back to arranging to adjust and restart
      await startSandbox();
      if (typeof toast === "function") toast("Experiment aborted: back to arranging; adjust equipment and start again");
    }
  }
}
async function loadReplay(path) {
  if (!path) return;
  clearInterval(S.poll);
  const r = await api(`/api/replay?path=${encodeURIComponent(path)}`);
  reset("replay"); Object.assign(S, { static: r.static, frames: r.frames, events: r.events, score: r.score, follow: false });
  $("chkFollow").checked = false; render();
  if (S.frames.length > 1) togglePlay();
}
let lastStep = 0;
function togglePlay() {
  if (S.mode === "sandbox") { sbTogglePlay(); return; }
  S.playing = !S.playing; $("btnPlay").textContent = S.playing ? "❚❚" : "▶";
  if (S.playing && S.idx >= S.frames.length - 1 && S.mode === "replay") S.idx = 0;
  if (S.playing) requestAnimationFrame(step);
}
function step(ts) {
  if (!S.playing) return;
  if (ts - lastStep > 500 / +$("selPlaySpeed").value) {      // replay: 2 × speed frames per second
    lastStep = ts;
    if (S.idx < S.frames.length - 1) { S.idx++; render(); } else if (S.mode === "replay") { togglePlay(); return; }
  }
  requestAnimationFrame(step);
}
async function loadRuns() {
  const r = await api("/api/runs");
  const cur = $("selRun").value;
  $("selRun").innerHTML = `<option value="">— pick a record —</option>` + r.runs.map((x) => `<option value="${esc(x.path)}">${esc(x.mtime)} ${esc(x.path.replace(/^runs\//, "").replace(".frames.jsonl", ""))}</option>`).join("");
  $("selRun").value = cur;
}
async function init() {
  const ex = await api("/api/experiments");
  const byId = Object.fromEntries(ex.experiments.map((e) => [e.id, e]));
  const show = (ex.showcase || []).filter((s) => byId[s.id]);
  const fillExp = (all) => {                       // by default list only the 6 demo experiments; "Show all" lists everything
    const cur = $("selExp").value;
    const top = show.map((s) => `<option value="${esc(s.id)}">${s.auto ? "Auto" : "Needs human"} · ${esc(byId[s.id].title)}</option>`).join("");
    const rest = ex.experiments.filter((e) => !show.some((s) => s.id === e.id)).map((e) => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join("");
    $("selExp").innerHTML = all ? `<optgroup label="Demo experiments">${top}</optgroup><optgroup label="All experiments">${rest}</optgroup>` : top;
    if (cur && [...$("selExp").options].some((o) => o.value === cur)) $("selExp").value = cur;
    $("expMore").textContent = all ? `Collapse (only ${show.length})` : `Show all (${ex.experiments.length})`;
    S.expAll = all;
  };
  fillExp(true);                                   // hidden dropdown: holds all experiments (the prep library drives its value)
  $("expMore").onclick = (e) => { e.preventDefault(); fillExp(!S.expAll); };
  const names = { fixed: "Fixed procedure (baseline)", deepseek: "DeepSeek agent", claude: "Claude agent" };
  $("selPlanner").innerHTML = Object.entries(ex.planners).map(([k, ok]) => `<option value="${k}" ${ok ? "" : "disabled"}>${names[k]}${ok ? "" : " (not configured)"}</option>`).join("");
  await loadRuns();
  $("selRobot").value = "xarm6_standard";          // robot arm executes by default
  $("btnStart").onclick = () => startChosen();     // same entry point as ▶ Start at top right
  $("btnStop").onclick = stopLive;
  $("selExp").onchange = () => loadExperimentBench($("selExp").value);
  $("runBtn").onclick = () => {
    if (S.mode === "sandbox" && typeof DEMO !== "undefined" && DEMO.choice) startChosen();
    else if (S.mode === "sandbox" && !S.static?.experiment) togglePlay();
    else if (S.mode === "sandbox") startLive();
    else if (S.mode === "live" && S.status === "running") stopLive();
    else startSandbox();
  };
  $("selRun").onchange = () => loadReplay($("selRun").value);
  $("selSpeed").onchange = () => S.mode === "live" && api("/api/live/speed", { speed: $("selSpeed").value });
  $("scrub").oninput = () => { S.idx = +$("scrub").value; S.follow = S.idx === S.frames.length - 1; $("chkFollow").checked = S.follow; render(); };
  $("chkFollow").onchange = () => { S.follow = $("chkFollow").checked; if (S.follow) { S.idx = S.frames.length - 1; render(); } };
  $("btnPlay").onclick = togglePlay;
  const params = new URLSearchParams(location.search);
  if (params.get("run")) { await loadReplay(params.get("run")); return; }
  const p = await api("/api/live/poll?frame=0&event=0");
  if (p.status === "running") { reset("live"); startPolling(); }       // attach only to a run in progress; finished ones are not reattached (the page opens as the demo bench)
  else await startSandbox();                                             // start: a freely arrangeable workbench
}
const runInit = () => init().catch((e) => { $("hint").textContent = `Init failed: ${e.message}`; });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runInit);   // wait for all scripts (bench.js etc.)
else runInit();
