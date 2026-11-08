// Auto-focus: when a group of equipment starts working, the view glides to that assembled group.
// "Group" = working devices / containers being handled, plus everything linked to them via tubing / probe connections and "placed on a device".
// Flies only when the group changes; the user's own zoom / pan is not pulled back afterwards. G key or ◎ button focuses manually.
// Uses globals from studio.js: S, $, best, applyVB, placeBubble, baseY, benchBounds.
"use strict";

const FOCUS = { key: null, ids: new Set(), anim: null, auto: true };

// ---------------------------------------------------------------- find "the working group"
function activeSeeds(f) {
  const seeds = new Set();
  for (const [id, d] of Object.entries(f.devices)) {
    const ph = d.anim?.phase;
    if ((ph && ph !== "idle") || (best(d, "running") ?? 0) > 0 || (best(d, "pumping") ?? 0) > 0 || (best(d, "power") ?? 0) > 0
        || (d.category === "hotplate_stirrer" && ((best(d, "plate_temperature") ?? 22) > 35 || (best(d, "speed") ?? 0) > 50)))
      seeds.add(id);
  }
  const a = f.activity;                                    // operation the executor is doing
  if (a) for (const v of Object.values(a.params || {})) if (typeof v === "string" && (f.devices[v] || f.containers[v])) seeds.add(v);
  return seeds;
}
function focusGroupOf(f, seeds) {
  const adj = {};
  const link = (a, b) => { (adj[a] = adj[a] || new Set()).add(b); (adj[b] = adj[b] || new Set()).add(a); };
  for (const [id, d] of Object.entries(f.devices)) for (const cid of Object.values(d.connections || {})) if (f.containers[cid]) link(id, cid);
  for (const [cid, c] of Object.entries(f.containers)) if (f.devices[c.location]) link(cid, c.location);
  const seen = new Set([...seeds]), stack = [...seeds];
  while (stack.length) for (const n of adj[stack.pop()] || []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  for (const n of [...seen]) if (f.containers[n]?.location === "storage") seen.delete(n);     // items in the store don't count
  return seen;
}

// ---------------------------------------------------------------- bounding box (in the current view's geometry)
function groupBox(f, ids) {
  const st = S.static, geo = S.geo; if (!st || !geo) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (ax, ay, bx, by) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
  for (const id of ids) {
    const d = f.devices[id];
    if (d) {
      const s = st.slots[d.slot]; if (!s) continue;
      const [W, D, H] = d.dims_mm;
      if (geo.mode === "top") add(s.x_mm - W / 2, s.y_mm - D / 2, s.x_mm + W / 2, s.y_mm + D / 2 + 40);
      else if (geo.mode === "iso") { const q = geo.boxes[id]; if (q) add(q.L, q.T - 60, q.L + q.W, q.yb + 50); }
      else { const yb = baseY(geo.b, s.y_mm); add(s.x_mm - W / 2, yb - Math.min(H, 950) - 60, s.x_mm + W / 2, yb + 60); }
      continue;
    }
    const p = geo.pos?.[id];
    if (p) {
      if (geo.mode === "top") add(p.x - p.w - 10, p.y - p.w - 10, p.x + p.w + 10, p.y + p.w + 30);
      else add(p.x - p.w - 10, (p.top ?? p.y - p.h) - 40, p.x + p.w + 10, p.y + 60);
    }
  }
  if (!isFinite(x0)) return null;
  if (geo.mode === "front") y0 -= 180;                     // tubing arches up in front view; leave extra room above
  return { x0, y0, x1, y1 };
}
function fitBox(bx) {
  const svg = $("world"), r = svg.getBoundingClientRect(), aspect = r.width / Math.max(1, r.height);
  let w = (bx.x1 - bx.x0) * 1.35, h = (bx.y1 - bx.y0) * 1.35;
  w = Math.max(w, 700); h = Math.max(h, 420);              // don't zoom in too far on small groups
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  const cx = (bx.x0 + bx.x1) / 2, cy = (bx.y0 + bx.y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// ---------------------------------------------------------------- glide there
function flyTo(vb, ms = 700) {
  const from = { ...(S.vb || vb) }, t0 = performance.now();
  FOCUS.anim = { from, to: vb, t0, ms };
  const step = (t) => {
    if (FOCUS.anim?.t0 !== t0 || FOCUS.anim.done) return;   // interrupted by a new flight or user input / already there
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    S.vb = { x: from.x + (vb.x - from.x) * e, y: from.y + (vb.y - from.y) * e, w: from.w + (vb.w - from.w) * e, h: from.h + (vb.h - from.h) * e };
    applyVB(); placeBubble();
    if (k < 1) next(); else { FOCUS.anim.done = true; FOCUS.anim = null; }
  };
  // per-frame callbacks pause when the page is hidden: a timer backs them up, interpolating by time; whichever fires first wins
  let tok = 0;
  const next = () => {
    const my = ++tok;
    const go = (t) => { if (my !== tok) return; tok++; step(t); };   // only the first of the two callbacks takes effect
    requestAnimationFrame(go); setTimeout(() => go(performance.now()), 40);
  };
  next();
}
function focusGroup(f, ids, ms) {
  const bx = groupBox(f, ids); if (!bx) return false;
  flyTo(fitBox(bx), ms); return true;
}

// called after every redraw: fly over when the group changes
function autoFocus(f) {
  if (!f || S.view === "table" || !S.geo || S.geo.mode !== S.view) return;
  const seeds = activeSeeds(f);
  if (!seeds.size) { FOCUS.key = null; FOCUS.ids = new Set(); return; }
  const ids = focusGroupOf(f, seeds), key = `${S.view}|${[...ids].sort().join(",")}`;
  if (key === FOCUS.key) return;
  const shrank = FOCUS.key && [...ids].every((n) => FOCUS.ids.has(n));   // some devices in the same group stopped: no need to fly
  FOCUS.key = key; FOCUS.ids = ids;
  if (FOCUS.auto && !shrank) focusGroup(f, ids);
}
// manual: G key / ◎ button — focus the working group; if nothing is working, focus everything connected by tubing / placed on devices
function focusNow() {
  const f = S.frames[S.idx]; if (!f) return;
  let seeds = activeSeeds(f);
  if (!seeds.size) seeds = new Set(Object.keys(f.devices).filter((id) => Object.keys(f.devices[id].connections || {}).length
    || Object.values(f.containers).some((c) => c.location === id)));
  if (!seeds.size || !focusGroup(f, focusGroupOf(f, seeds))) $("fit").click();
}

// user zoom / pan: interrupts an ongoing flight
for (const ev of ["wheel", "pointerdown"]) $("world").addEventListener(ev, () => { FOCUS.anim = null; }, { passive: true });
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (e.key === "g" || e.key === "G") focusNow();
});
$("focusBtn")?.addEventListener("click", focusNow);
$("chkAutoFocus")?.addEventListener("change", (e) => { FOCUS.auto = e.target.checked; if (FOCUS.auto) { FOCUS.key = null; } });

// ---------------------------------------------------------------- front-view layering
// While a group is working: it shows normally; equipment in front of it (closer to the viewer, overlapping horizontally) becomes a translucent outline; the rest fades.
function frontLayers(f, st) {
  const seeds = activeSeeds(f); if (!seeds.size) return;
  const ids = focusGroupOf(f, seeds);
  const slotOf = (id) => {
    if (f.devices[id]) return st.slots[f.devices[id].slot];
    const loc = f.containers[id]?.location;
    return st.slots[loc] || (f.devices[loc] ? st.slots[f.devices[loc].slot] : null);
  };
  let yFront = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const id of ids) {
    const s = slotOf(id); if (!s) continue;
    yFront = Math.max(yFront, s.y_mm + s.d_mm / 2); x0 = Math.min(x0, s.x_mm - s.w_mm / 2); x1 = Math.max(x1, s.x_mm + s.w_mm / 2);
  }
  if (!isFinite(yFront)) return;
  for (const node of $("world").querySelectorAll("[data-d], [data-c]")) {
    const id = node.getAttribute("data-d") || node.getAttribute("data-c");
    if (ids.has(id)) continue;
    const s = slotOf(id); if (!s) continue;
    const inFront = s.y_mm - s.d_mm / 2 >= yFront - 1, overlap = s.x_mm - s.w_mm / 2 < x1 && s.x_mm + s.w_mm / 2 > x0;
    node.classList.add(inFront && overlap ? "layer-block" : "layer-dim");
  }
}

// Hover see-through: in front view, hovering an instrument / container makes things in front of it translucent
function frontXray(id) {
  if (S.view === "iso" && typeof isoXray === "function") return isoXray(id);
  for (const n of $("world").querySelectorAll(".xray-block")) n.classList.remove("xray-block");
  if (!id || S.view !== "front") return;
  const f = S.frames[S.idx], st = S.static; if (!f || !st) return;
  const slotOf = (k) => {
    if (f.devices[k]) return st.slots[f.devices[k].slot];
    const loc = f.containers[k]?.location;
    return st.slots[loc] || (f.devices[loc] ? st.slots[f.devices[loc].slot] : null);
  };
  const s0 = slotOf(id); if (!s0) return;
  const yFront = s0.y_mm + s0.d_mm / 2, x0 = s0.x_mm - s0.w_mm / 2, x1 = s0.x_mm + s0.w_mm / 2;
  for (const node of $("world").querySelectorAll("[data-d], [data-c]")) {
    const k = node.getAttribute("data-d") || node.getAttribute("data-c");
    if (k === id || f.containers[k]?.location === id) continue;
    const s = slotOf(k); if (!s) continue;
    if (s.y_mm - s.d_mm / 2 >= yFront - 1 && s.x_mm - s.w_mm / 2 < x1 && s.x_mm + s.w_mm / 2 > x0) node.classList.add("xray-block");
  }
  for (const a of $("world").querySelectorAll(".arm.ghost")) a.classList.add("xray-block");
}
