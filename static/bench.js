// Manual bench: starts as an empty workbench (via /api/sandbox); ↓ opens the bottom equipment drawer; drag equipment onto the bench.
// Uses globals from studio.js: S, $, esc, el, api, render, reset, applyVB, togglePanel, TOP_ICON, benchBounds.
"use strict";

const _q = new URLSearchParams(location.search);
const SB = { sid: _q.get("gallery") ? "gallery" : "studio", seq: 0, cat: null, group: "all", drag: null };

// ---------------------------------------------------------------- equipment groups and display names
const CAT_ZH = {
  balance: "Balance", cold_bath: "Cold bath", conductivity_meter: "Conductivity meter", contact_angle_stage: "Contact-angle stage", dls: "DLS",
  flow_reactor: "Flow reactor", fluorimeter: "Fluorimeter", ftir: "FTIR", furnace: "Muffle furnace", gas_burette: "Gas burette", gc: "GC",
  gpc: "GPC", heater_shaker: "Heater-shaker", hotplate_stirrer: "Hotplate stirrer", hplc: "HPLC", incubator_shaker: "Incubator shaker",
  ion_meter: "Ion meter", liquid_handler: "Liquid handler", melting_point: "Melting point", microwave_reactor: "Microwave reactor", ms: "MS",
  nmr: "NMR", optrode: "Optrode", orp_meter: "ORP meter", ph_meter: "pH meter", photoreactor: "Photoreactor",
  plate_reader: "Plate reader", potentiostat: "Potentiostat", pressure_reactor: "Pressure reactor", proxy_viscometer: "Viscometer",
  rotary_evaporator: "Rotary evaporator", spectrophotometer: "Spectrophotometer", syringe_pump: "Syringe pump", tensiometer: "Tensiometer",
  tga: "TGA", thermostatic_bath: "Thermostatic bath", xrd: "XRD", foam_analyzer: "Foam analyzer",
};
const GROUPS = [
  ["all", "All"], ["vessel", "Vessels"], ["heat", "Heating / reaction"], ["liquid", "Liquid handling"], ["measure", "Measurement / analysis"],
];
const GROUP_OF = {
  hotplate_stirrer: "heat", heater_shaker: "heat", thermostatic_bath: "heat", cold_bath: "heat", furnace: "heat",
  microwave_reactor: "heat", photoreactor: "heat", pressure_reactor: "heat", flow_reactor: "heat", incubator_shaker: "heat",
  rotary_evaporator: "heat",
  liquid_handler: "liquid", syringe_pump: "liquid", gas_burette: "liquid",
};
const groupOf = (card) => card.kind === "container" ? "vessel" : (GROUP_OF[card.category] || "measure");
const VESSEL_ICON = (type) => /beaker/.test(type) ? "🥛" : /bottle|jar/.test(type) ? "🧴" : /vial|tube|cuvette|well/.test(type) ? "🧪"
  : /crucible|pan|holder/.test(type) ? "⚱" : "⚗";

// ---------------------------------------------------------------- sandbox data
const sbApi = (action, body) => api(`/api/sandbox/${action}`, body ? { sid: SB.sid, ...body } : undefined);
async function startSandbox() {
  reset("sandbox");
  try { await api(`/api/sandbox/state?sid=${SB.sid}`); }                // on page refresh, keep using the existing bench
  catch {
    await api("/api/sandbox/new", { sid: SB.sid, workbench: SB.sid === "gallery" ? "workbench_empty" : "workbench_standard", humans: 1,
                                    starter: SB.sid === "gallery" ? "" : true });     // start: empty bench, common instruments in the store
    if (SB.sid === "gallery") await buildGallery();
  }
  SB.seq = 0;
  clearInterval(S.sbPoll); S.sbPoll = setInterval(sbPoll, 500); await sbPoll();
}
async function sbPoll() {
  if (S.mode !== "sandbox") { clearInterval(S.sbPoll); return; }
  let st; try { st = await api(`/api/sandbox/state?sid=${SB.sid}&since=${SB.seq}`); } catch { return; }
  if (S.mode !== "sandbox") return;
  S.static = st.static; S.frames = [st.frame]; S.idx = 0;
  if (st.event_seq < SB.seq) S.events = [];                               // after undo / rebuild the sequence restarts
  S.events.push(...st.events); if (S.events.length > 400) S.events = S.events.slice(-400);
  SB.seq = st.event_seq;
  S.status = st.playing ? "running" : "idle"; S.sbPlaying = st.playing;
  $("btnPlay").textContent = st.playing ? "❚❚" : "▶";
  render(); drawGhost();
}
// Model gallery (/studio?gallery=1): every model laid out in rows on an empty bench, for checking all instrument models
async function buildGallery() {
  const c = await api("/api/sandbox/catalog");
  let x = 900, y = 0, rowD = 0;
  for (const p of c.profiles) {
    const [W, D] = p.dims_mm;
    if (x + W > 6200) { x = 900; y += rowD + 260; rowD = 0; }
    await sbApi("add_device", { id: p.profile.replace(/[^a-z0-9]+/gi, "_").slice(0, 24), profile: p.profile, x_mm: Math.round(x + W / 2), y_mm: Math.round(y + D / 2) });
    x += W + 160; rowD = Math.max(rowD, D);
  }
}
function sbTogglePlay() {
  const speed = Math.min(10, Math.max(1, +$("selPlaySpeed").value || 1));   // 1× = real time, max 10×
  (S.sbPlaying ? sbApi("pause", {}) : sbApi("play", { speed })).then(sbPoll).catch((e) => toast(e.message, true));
}
let _toastT = null;
function toast(text, bad) {
  const t = $("benchToast"); t.textContent = text; t.className = `bench-toast ${bad ? "bad" : ""}`; t.hidden = false;
  clearTimeout(_toastT); _toastT = setTimeout(() => (t.hidden = true), bad ? 5000 : 2500);
}

// ---------------------------------------------------------------- equipment drawer
async function loadCatalog() {
  if (SB.cat) return SB.cat;
  const c = await api("/api/sandbox/catalog");
  const cards = [];
  for (const [type, v] of Object.entries(c.container_presets))
    cards.push({ kind: "container", key: type, name: v.label, sub: `${v.capacity_mL} mL`, icon: VESSEL_ICON(type), r: 8 + 2.6 * Math.sqrt(v.capacity_mL) });
  for (const p of c.profiles)
    cards.push({ kind: "device", key: p.profile, category: p.category, name: CAT_ZH[p.category] || p.category, sub: p.model,
                 icon: TOP_ICON[p.category] || "▣", dims: p.dims_mm });
  SB.cat = cards;
  return cards;
}
function renderDrawer() {
  $("drTabs").innerHTML = GROUPS.map(([k, t]) => `<button data-g="${k}" class="${SB.group === k ? "on" : ""}">${t}</button>`).join("");
  for (const b of $("drTabs").querySelectorAll("button")) b.onclick = () => { SB.group = b.dataset.g; renderDrawer(); $("drRow").scrollLeft = 0; };
  const cards = (SB.cat || []).filter((c) => SB.group === "all" || groupOf(c) === SB.group);
  $("drRow").innerHTML = cards.map((c, i) => `<div class="dr-card ${c.kind}" data-i="${SB.cat.indexOf(c)}" title="Drag onto the bench">
      <div class="ic">${esc(c.icon)}</div><div class="nm">${esc(c.name)}</div><div class="sb">${esc(c.sub)}</div></div>`).join("")
    || `<span class="muted">No equipment</span>`;
  for (const d of $("drRow").querySelectorAll(".dr-card")) d.addEventListener("pointerdown", (e) => startDrag(e, SB.cat[+d.dataset.i]));
}
async function toggleDrawer(force) {
  const dr = $("drawer"), open = force ?? dr.hidden;
  if (open && S.mode !== "sandbox") await startSandbox();               // ↓ while viewing a replay / run: back to the manual bench
  if (open) { await loadCatalog(); renderDrawer(); }
  dr.hidden = !open;
}

// ---------------------------------------------------------------- drag and drop
function worldPoint(e) {
  const svg = $("world"), m = svg.getScreenCTM(); if (!m) return null;
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(m.inverse());
}
function overWorld(e) {
  const r = $("stage").getBoundingClientRect(), dr = $("drawer").getBoundingClientRect();
  const inStage = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  const inDrawer = !$("drawer").hidden && e.clientY >= dr.top && e.clientX >= dr.left && e.clientX <= dr.right;
  return inStage && !inDrawer && S.view === "top";
}
const rectsOverlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
function deviceRect(f, st, id) {
  const d = f.devices[id], s = st.slots[d.slot]; if (!s) return null;
  const [W, D] = d.dims_mm; return { x0: s.x_mm - W / 2, x1: s.x_mm + W / 2, y0: s.y_mm - D / 2, y1: s.y_mm + D / 2 };
}
// what happens if dropped here: { ok, why, action }
const CELL = 100;                                  // bench grid cell (mm), same as backend agent_lab/grid.py
function dropPlan(card, p) {
  const f = S.frames[S.idx], st = S.static; if (!f || !st || !p) return { ok: false, why: "Bench not loaded yet" };
  if (card.kind === "device-move" && p.x < (benchBounds(st).x0 - 20)) {         // dragged back to the store on the left
    return card.slot && st.slots[card.slot] ? { ok: true, store: true, why: "Back to the store", at: p } : { ok: false, why: "Already in the store", at: p };
  }
  if (card.kind === "device" || card.kind === "device-move") {
    const rot = SB.drag?.rot || 0, [w0, d0] = rot % 180 ? [card.dims[1], card.dims[0]] : card.dims;
    const fw = Math.max(1, Math.ceil(w0 / CELL - 1e-9)), fd = Math.max(1, Math.ceil(d0 / CELL - 1e-9));   // occupy whole cells
    const cx = Math.round((p.x - fw * CELL / 2) / CELL) * CELL + fw * CELL / 2, cy = Math.round((p.y - fd * CELL / 2) / CELL) * CELL + fd * CELL / 2;
    const W = fw * CELL, D = fd * CELL, r = { x0: cx - W / 2, x1: cx + W / 2, y0: cy - D / 2, y1: cy + D / 2, cx, cy, rot, w0, d0 };
    for (const [id, s] of Object.entries(st.slots)) {
      if (id === card.slot) continue;                                  // when moving, don't compare with its own old spot
      const q = { x0: s.x_mm - s.w_mm / 2, x1: s.x_mm + s.w_mm / 2, y0: s.y_mm - s.d_mm / 2, y1: s.y_mm + s.d_mm / 2 };
      if (rectsOverlap(r, { x0: q.x0 + 1, x1: q.x1 - 1, y0: q.y0 + 1, y1: q.y1 - 1 })) return { ok: false, why: `Overlaps ${id}`, rect: r };
    }
    return { ok: true, rect: r };
  }
  // containers: onto a device, onto an empty slot, or a new slot on empty bench space
  for (const id of Object.keys(f.devices)) {
    const r = deviceRect(f, st, id);
    if (r && p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1) {
      const busy = Object.entries(f.containers).find(([k, c]) => c.location === id && k !== card.moveId);
      return { ok: true, location: id, why: busy ? `${id} already holds ${busy[0]} (backend decides if more fit)` : `Place on ${id}`, at: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 } };
    }
  }
  const devSlots = new Set(Object.values(f.devices).map((d) => d.slot));
  for (const [id, s] of Object.entries(st.slots)) {
    if (devSlots.has(id)) continue;
    if (Math.abs(p.x - s.x_mm) <= s.w_mm / 2 && Math.abs(p.y - s.y_mm) <= s.d_mm / 2) return { ok: true, location: id, at: { x: s.x_mm, y: s.y_mm } };
  }
  const sx = Math.round((p.x - CELL) / CELL) * CELL + CELL, sy = Math.round((p.y - CELL) / CELL) * CELL + CELL;   // a new container slot takes 2×2 cells
  p = { x: sx, y: sy };
  const r = { x0: sx - CELL + 1, x1: sx + CELL - 1, y0: sy - CELL + 1, y1: sy + CELL - 1 };
  for (const [id, s] of Object.entries(st.slots)) {
    const q = { x0: s.x_mm - s.w_mm / 2, x1: s.x_mm + s.w_mm / 2, y0: s.y_mm - s.d_mm / 2, y1: s.y_mm + s.d_mm / 2 };
    if (rectsOverlap(r, q)) return { ok: false, why: `Too close to ${id}`, at: p };
  }
  return { ok: true, newSlot: true, at: p };
}
function startDrag(e, card) {
  e.preventDefault();
  const g = $("dragGhost");
  g.innerHTML = `<span class="ic">${esc(card.icon)}</span> ${esc(card.name)}`;
  const moving = card.kind.endsWith("-move");
  g.hidden = moving;                                   // moving bench items: counts as a drag only after a few pixels, otherwise a click
  SB.drag = { card, plan: null, p: null, rot: card.rot0 || 0, last: e, x0: e.clientX, y0: e.clientY, moved: !moving };
  moveDrag(e);
  document.addEventListener("pointermove", moveDrag);
  document.addEventListener("pointerup", endDrag, { once: true });
}
function moveDrag(e) {
  if (!SB.drag) return;
  SB.drag.last = e;
  if (!SB.drag.moved) {
    if (Math.hypot(e.clientX - SB.drag.x0, e.clientY - SB.drag.y0) < 5) return;
    SB.drag.moved = true; $("dragGhost").hidden = false; hideTip();
  }
  const g = $("dragGhost"); g.style.left = `${e.clientX + 12}px`; g.style.top = `${e.clientY + 12}px`;
  if (overWorld(e)) { SB.drag.p = worldPoint(e); SB.drag.plan = dropPlan(SB.drag.card, SB.drag.p); }
  else { SB.drag.p = null; SB.drag.plan = null; }
  g.classList.toggle("bad", !!SB.drag.plan && !SB.drag.plan.ok);
  g.dataset.why = SB.drag.plan?.why || (SB.drag.p ? "" : "Drag onto the bench");
  drawGhost();
}
function drawGhost() {
  const ov = $("benchOverlay"); ov.innerHTML = "";
  ov.setAttribute("viewBox", $("world").getAttribute("viewBox") || "0 0 1 1");
  const d = SB.drag; if (!d || !d.plan) return;
  const cls = `ghost ${d.plan.ok ? "ok" : "bad"}`;
  if ((d.card.kind === "device" || d.card.kind === "device-move") && d.plan.rect) {
    const r = d.plan.rect;
    el("rect", { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0, rx: 6, class: cls }, ov);
    el("rect", { x: r.cx - r.w0 / 2, y: r.cy - r.d0 / 2, width: r.w0, height: r.d0, rx: 12, class: "ghost-body" }, ov);
  } else if (d.plan.store) {
    el("rect", { x: d.plan.at.x - 80, y: d.plan.at.y - 60, width: 160, height: 120, rx: 12, class: cls }, ov);
  } else if (d.plan.at) {
    el("circle", { cx: d.plan.at.x, cy: d.plan.at.y, r: d.card.r, class: cls }, ov);
  }
}
function uniqueId(base, taken) { let k = 1; while (taken.has(`${base}_${k}`)) k++; return `${base}_${k}`; }
async function endDrag(e) {
  document.removeEventListener("pointermove", moveDrag);
  const d = SB.drag; SB.drag = null; $("dragGhost").hidden = true; drawGhost();
  if (!d || !d.moved || !d.plan) return;
  if (!d.plan.ok) return toast(`Can't place: ${d.plan.why}`, true);
  const f = S.frames[S.idx], st = S.static;
  try {
    if (d.plan.store) {
      await sbApi("store_device", { id: d.card.moveId });
      toast(`${d.card.moveId} returned to the store`);
    } else if (d.card.kind === "device-move") {               // move a bench device (with containers on it and attached tubing)
      const r = await sbApi("move_device", { id: d.card.moveId, x_mm: d.plan.rect.cx, y_mm: d.plan.rect.cy, rotation: d.plan.rect.rot });
      toast(`Moved ${d.card.moveId}${r.rotation !== d.card.rot0 ? ` (rotated to ${r.rotation}°)` : ""}`);
    } else if (d.card.kind === "container-move") {     // move a container: the executor places it (like place_container in a plan; takes time, passes safety checks)
      let loc = d.plan.location;
      if (loc === f.containers[d.card.moveId]?.location) return;
      if (d.plan.newSlot) {
        loc = uniqueId("slot_bench", new Set(Object.keys(st.slots)));
        await sbApi("add_slot", { id: loc, x_mm: Math.round(d.plan.at.x), y_mm: Math.round(d.plan.at.y) });
      }
      const r = await sbApi("task", { skill: "place_container", params: { container: d.card.moveId, location: loc } });
      if (r.ok === false) toast(`Not placed: ${(r.reasons || []).join("; ") || r.detail || ""}`, true);
      else toast(`${r.executor || "Executor"} placed ${d.card.moveId} on ${loc}`);
    } else if (d.card.kind === "device") {
      const id = uniqueId(d.card.category, new Set(Object.keys(f.devices)));
      await sbApi("add_device", { id, profile: d.card.key, x_mm: d.plan.rect.cx, y_mm: d.plan.rect.cy, rotation: d.plan.rect.rot });
      toast(`Placed ${id} (${d.card.sub})`);
    } else {
      let loc = d.plan.location;
      if (d.plan.newSlot) {
        loc = uniqueId("slot_bench", new Set(Object.keys(st.slots)));
        await sbApi("add_slot", { id: loc, x_mm: Math.round(d.plan.at.x), y_mm: Math.round(d.plan.at.y) });
      }
      const id = uniqueId(d.card.key.split("_")[0], new Set(Object.keys(f.containers)));
      await sbApi("add_container", { item: { id, type: d.card.key, location: loc } });
      toast(`Placed ${id} (${d.card.name}) → ${loc}`);
    }
  } catch (err) { toast(err.message, true); }
  await sbPoll();
}

// press and drag devices / containers on the bench (top view, manual bench)
function startMove(e, kind, id) {
  if (S.mode !== "sandbox" || S.view !== "top" || e.button !== 0) return;
  e.stopPropagation();                                 // don't pan the view
  const f = S.frames[S.idx];
  if (kind === "device") {
    const d = f.devices[id];
    startDrag(e, { kind: "device-move", moveId: id, slot: d.slot, dims: d.dims_mm, rot0: d.rotation || 0, category: d.category,
                   icon: "✥", name: `Move ${id}` });
  } else {
    const c = f.containers[id];
    startDrag(e, { kind: "container-move", moveId: id, r: 8 + 2.6 * Math.sqrt(c.capacity_mL), icon: "✥", name: `Move ${id}` });
  }
}

async function rotateKey() {
  if (SB.drag) { SB.drag.rot = (SB.drag.rot + 90) % 360; moveDrag(SB.drag.last); return; }   // while dragging: rotate the ghost
  if (S.mode !== "sandbox" || !S.hoverDev) return toast("Hover over the device to rotate, then press E", true);
  try { const r = await sbApi("rotate_device", { id: S.hoverDev, degrees: 90 }); toast(`${S.hoverDev} rotated to ${r.rotation}°`); }
  catch (err) { toast(err.message, true); }
  await sbPoll();
}

// ---------------------------------------------------------------- keyboard and handles
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (e.key === "ArrowRight") { e.preventDefault(); togglePanel(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); toggleDrawer(); }
  else if (e.key === "Escape") { if (!$("drawer").hidden) toggleDrawer(false); }
  else if (e.key === "e" || e.key === "E") { if (S.view === "iso" && !SB.drag) isoTurn(1); else rotateKey(); }   // 2.5D view: E turns the view
});
$("panelHandle").onclick = () => togglePanel();
$("drawerHandle").onclick = () => toggleDrawer();
$("btnBench").onclick = () => { toggleDrawer(false); startSandbox(); };
$("drRow").addEventListener("wheel", (e) => {                         // mouse wheel scrolls the drawer horizontally
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { $("drRow").scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });
api("/api/sandbox/catalog").then((c) => { SB.shelf = new Set(c.shelf_ids || []); if (typeof render === "function") render(); }).catch(() => {});
