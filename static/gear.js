// Equipment page: all lab equipment laid out on a big table (top view, real footprints); more equipment means a longer table.
// On experiment start: needed equipment is highlighted here, then "flies" to the bench in the transition, where demoOrganize places and assembles it one by one.
// Uses studio.js: $, el, esc, S, TOP (models.js), pumpTop (pump.js).
"use strict";

const GEAR_W = 3600, GEAR_GAP = 200, GEAR_PAD = 160;          // table width 3.6 m; spacing; table margin (mm)
const GEAR = { pick: new Set(), pos: {}, inventory: null, others: null };

// Two tables on the equipment page (each fetched once from its own sandbox, independent of what is running):
//   top: common equipment (starting bench + shelf, picked by budget and collaborator focus);
//   bottom: the rest (large / specialised instruments from the standard bench: HPLC, NMR, MS, autoclave…).
// Equipment specific to the current experiment and on neither table goes on the bottom one; equipment in use on the bench is drawn translucent.
async function gearLoadInventory() {
  const strip = (devs) => Object.fromEntries(Object.entries(devs).map(([id, d]) => [id, { ...d, slot: null, anim: null }]));
  try {
    const r = await api("/api/sandbox/new", { sid: "gear_inventory", workbench: "workbench_standard", humans: 1, starter: true });
    GEAR.inventory = strip(r.frame.devices);
    const all = await api("/api/sandbox/new", { sid: "gear_all", workbench: "workbench_standard", humans: 1 });
    GEAR.others = Object.fromEntries(Object.entries(strip(all.frame.devices)).filter(([id]) => !GEAR.inventory[id]));
    if (S.view === "table") render();
  } catch (e) { /* if unavailable, show only the current experiment's equipment */ }
}
function gearCapture() {}                                  // legacy interface (studio.js still calls it)
gearLoadInventory();

function gearLayout(devs, y0 = 0) {                         // shelf-style layout: by depth, largest first; wrap when a row is full
  const items = Object.entries(devs).map(([id, d]) => ({ id, d, w: d.dims_mm[0], h: d.dims_mm[1] }))
    .sort((a, b) => (GEAR.pick.has(b.id) - GEAR.pick.has(a.id)) || b.h - a.h || b.w - a.w || a.id.localeCompare(b.id));   // needed ones go in the first row
  const pos = {};
  let x = GEAR_PAD, y = y0 + GEAR_PAD, rowH = 0;
  for (const it of items) {
    if (x + it.w > GEAR_W - GEAR_PAD && x > GEAR_PAD) { x = GEAR_PAD; y += rowH + GEAR_GAP + 120; rowH = 0; }
    pos[it.id] = { x: x + it.w / 2, y: y + it.h / 2, w: it.w, h: it.h };
    x += it.w + GEAR_GAP; rowH = Math.max(rowH, it.h);
  }
  return { pos, depth: y + rowH + GEAR_PAD + 120 - y0 };
}

function renderGear(f) {
  const box = $("gearArea");
  const cur = f.devices || {};
  const common = {}, other = {};
  for (const [id, d] of Object.entries(GEAR.inventory || {})) common[id] = cur[id] || d;
  for (const [id, d] of Object.entries(GEAR.others || {})) if (!common[id]) other[id] = cur[id] || d;
  for (const [id, d] of Object.entries(cur)) if (!common[id] && !other[id]) other[id] = d;   // specific to the current experiment
  const TITLE = 110, GAP = 140;
  const A = gearLayout(common, TITLE), yB = TITLE + A.depth + GAP, B = gearLayout(other, yB + TITLE);
  const total = yB + TITLE + B.depth;
  GEAR.pos = { ...A.pos, ...B.pos };
  const all = { ...common, ...other };
  const onBench = Object.entries(all).filter(([id, d]) => d.slot && cur[id]).length;
  box.innerHTML = `<div class="gear-head"><b>Equipment</b><span class="muted">${Object.keys(common).length} common · ${Object.keys(other).length} other · ${onBench} in use (translucent)</span>${GEAR.call ? `<span class="gear-call">${esc(GEAR.call)}</span>` : ""}</div>
    <svg id="gearSvg" viewBox="0 0 ${GEAR_W} ${total}" preserveAspectRatio="xMidYMin meet"></svg>`;
  const svg = $("gearSvg");
  const table = (y, d, title) => {
    el("text", { x: 40, y: y + 70, class: "gear-title" }, svg, title);
    el("rect", { x: 20, y: y + TITLE - 20, width: GEAR_W - 40, height: d, rx: 28, class: "gear-table" }, svg);
  };
  table(0, A.depth, `Common equipment (${Object.keys(common).length} items, ${(GEAR_W / 1000).toFixed(1)} m × ${(A.depth / 1000).toFixed(1)} m)`);
  table(yB, B.depth, `Other equipment (${Object.keys(other).length} items: large / specialised instruments, ${(GEAR_W / 1000).toFixed(1)} m × ${(B.depth / 1000).toFixed(1)} m)`);
  for (const [id, d] of Object.entries(all)) {
    const p = GEAR.pos[id], L = p.x - p.w / 2, T = p.y - p.h / 2;
    const need = typeof PREP !== "undefined" && PREP.need.has(id) && !GEAR.pick.size;
    const g = el("g", { "data-gear": id, class: `gear-dev ${GEAR.pick.has(id) ? "pick" : ""} ${need ? "need" : ""} ${d.slot && cur[id] ? "inuse" : ""}` }, svg);
    el("rect", { x: L - 14, y: T - 14, width: p.w + 28, height: p.h + 28, rx: 20, class: "gear-halo" }, g);
    el("rect", { x: L, y: T, width: p.w, height: p.h, rx: 14, class: "top-dev" }, g);
    try {
      if (d.category === "syringe_pump" && typeof pumpTop === "function") pumpTop(g, id, d, { x_mm: p.x, y_mm: p.y, w_mm: p.w, d_mm: p.h });
      else if (typeof TOP !== "undefined" && TOP[d.category]) TOP[d.category](g, { id, d, cx: p.x, cy: p.y, L, T, W: p.w, D: p.h });
    } catch (e) { /* some models depend on live state; if they can't be drawn, keep just the outline */ }
    const fs = Math.max(30, Math.min(44, (p.w + GEAR_GAP) / 6));
    el("text", { x: p.x, y: T + p.h + fs + 8, class: "gear-id", "font-size": fs }, g, id);
    const model = (d.model || d.category).replace(/^(Generic|generic) /, "");
    el("text", { x: p.x, y: T + p.h + fs * 2 + 10, class: "gear-model", "font-size": fs * 0.62 }, g,
      model.length > (p.w + GEAR_GAP) / (fs * 0.42) ? model.slice(0, Math.max(6, Math.floor((p.w + GEAR_GAP) / (fs * 0.42)) - 1)) + "…" : model);
    if (d.slot && cur[id]) el("text", { x: p.x, y: T - 22, class: "gear-tag" }, g, "In use (on the bench)");
  }
}

// transition: highlight needed equipment → fly to the bench → back to top view (then demoOrganize places them one by one)
async function gearTransfer(ids, title) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  GEAR.pick = new Set(ids);
  const prevView = S.view;
  setView("table");
  await wait(60);
  GEAR.call = `"${title || "Experiment"}" needs ${ids.length}: ${ids.join(", ")}`;
  render();
  $("tableView").scrollTop = 0;
  const firstOther = ids.find((id) => GEAR.others?.[id] || !GEAR.inventory?.[id]);   // needed item on the bottom table: scroll to it
  if (firstOther) document.querySelector(`#gearSvg [data-gear="${CSS.escape(firstOther)}"]`)?.scrollIntoView({ block: "center" });
  await wait(1400);                                        // let people see what is highlighted
  const stage = $("stage").getBoundingClientRect();
  const tx = stage.left + stage.width / 2, ty = stage.top + stage.height / 2;
  const flies = [];
  ids.forEach((id, i) => {
    const g = document.querySelector(`#gearSvg [data-gear="${CSS.escape(id)}"]`); if (!g) return;
    const r = g.getBoundingClientRect();
    const clone = document.createElement("div");
    clone.className = "gear-fly";
    clone.innerHTML = `<svg viewBox="${g.getBBox().x} ${g.getBBox().y} ${g.getBBox().width} ${g.getBBox().height}">${g.innerHTML}</svg><span>${esc(id)}</span>`;
    Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.appendChild(clone);
    g.style.opacity = ".15";
    flies.push(clone);
    setTimeout(() => {
      const dx = tx - (r.left + r.width / 2) + (i - (ids.length - 1) / 2) * 26, dy = ty - (r.top + r.height / 2);
      clone.style.transform = `translate(${dx}px, ${dy}px) scale(.55)`;
      clone.style.opacity = ".0";
    }, 80 + i * 140);
  });
  await wait(1100 + ids.length * 140);
  flies.forEach((c) => c.remove());
  GEAR.pick = new Set(); GEAR.call = "";
  setView("top");                                         // bench arrangement happens in top view
}
