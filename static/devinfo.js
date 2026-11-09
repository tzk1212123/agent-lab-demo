// Double-click any device (top view / 2.5D view / equipment page) → details: intro, how it is simulated, model setting (swappable when the category has other models), specs, commands, readings, sources.
// Backend: /api/device_info?profile=…; model swap: sandbox action change_model (only while arranging the bench, not during a run).
"use strict";

const DEVINFO = { id: null };

function devinfoFind(id) {
  const f = S.frames?.[S.idx];
  return f?.devices?.[id] || GEAR.inventory?.[id] || GEAR.others?.[id] || null;
}

async function devinfoOpen(id) {
  const d = devinfoFind(id); if (!d) return;
  DEVINFO.id = id;
  $("devInfo").hidden = false;
  $("diBody").innerHTML = `<div class="muted">Loading model profile…</div>`;
  $("diTitle").textContent = id;
  if (!d.profile) { $("diBody").innerHTML = `<div class="muted">No model profile for this device (old data).</div>`; return; }
  try {
    const r = await api(`/api/device_info?profile=${encodeURIComponent(d.profile)}`);
    devinfoRender(id, d, r);
  } catch (e) { $("diBody").innerHTML = `<div class="pc-bad">${esc(e.message)}</div>`; }
}

function devinfoKV(obj) {
  const rows = Object.entries(obj || {}).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(Array.isArray(v) ? v.join(" – ") : typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`);
  return rows.length ? `<table class="di-kv">${rows.join("")}</table>` : `<div class="muted">—</div>`;
}

function devinfoRender(id, d, r) {
  $("diTitle").innerHTML = `${esc(id)} <span class="muted">· ${esc(r.category_zh)} · ${esc(`${r.manufacturer} ${r.model}`)}</span>
    <span class="di-badge ${r.verified ? "ok" : ""}">${r.verified ? "Specs verified" : "Specs not fully verified"}</span>`;
  const canSwap = S.mode === "sandbox" && !S.sbPlaying;
  const alts = r.alternatives.length > 1
    ? `<div class="di-alts">${r.alternatives.map((a) => `<label class="${a.current ? "cur" : ""}"><input type="radio" name="diModel" value="${esc(a.profile)}" ${a.current ? "checked" : ""}>
        <b>${esc(a.model)}</b> <span class="muted">${(a.dims_mm || []).slice(0, 3).join(" × ")} mm${a.verified ? "" : " · unverified"}</span></label>`).join("")}</div>
       <button id="diSwap" ${canSwap ? "" : "disabled"}>Switch to selected model</button>
       <span class="muted">${canSwap ? "Position and orientation stay; remove attached tubing / containers on top first" : "Can't switch during a run / replay; go back to arranging the bench"}</span>`
    : `<div class="muted">Only one model in this category (${esc(`${r.manufacturer} ${r.model}`)}); nothing to switch to. To add a model, write a profile in agent_lab/devices/profiles/.</div>`;
  const cmds = Object.entries(r.commands).map(([k, c]) => `<tr><th>${esc(k)}</th><td>${esc(c.description)}${Object.keys(c.params).length
    ? `<div class="muted">${Object.entries(c.params).map(([p, ps]) => `${esc(p)}${ps.unit ? ` (${esc(ps.unit)}${ps.min != null ? `, ${ps.min}–${ps.max}` : ""})` : ""}`).join("; ")}</div>` : ""}</td></tr>`).join("");
  const live = Object.entries(d.fields || {}).map(([k, v]) => [k, v.best?.v]).filter(([, v]) => v != null);
  $("diBody").innerHTML = `
    <section><h4>Intro</h4><p>${esc(r.use)}</p>${r.notes.length ? `<p class="muted">${r.notes.map(esc).join("<br>")}</p>` : ""}</section>
    <section><h4>How it's simulated</h4><p>${esc(r.simulation)}</p>${Object.keys(r.sim_assumptions).length ? `<details><summary>Model assumptions</summary>${devinfoKV(r.sim_assumptions)}</details>` : ""}
      ${r.to_calibrate.length ? `<p class="muted">To calibrate against measurements: ${r.to_calibrate.map(esc).join("; ")}</p>` : ""}</section>
    <section><h4>Model</h4>${alts}</section>
    <section><h4>Specs</h4>${devinfoKV({ "Size (W × D × H, mm)": (r.dims_mm || []).join(" × "), ...r.spec })}</section>
    ${live.length ? `<section><h4>Current readings</h4>${devinfoKV(Object.fromEntries(live.map(([k, v]) => [k, typeof v === "number" ? fmt(v, 4) : v])))}</section>` : ""}
    <section><h4>Commands</h4>${cmds ? `<table class="di-kv">${cmds}</table>` : `<div class="muted">—</div>`}</section>
    <section><h4>Comms</h4>${devinfoKV(r.comms)}</section>
    ${r.sources.length ? `<section><h4>Sources</h4><ul>${r.sources.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : ""}`;
  const btn = $("diSwap");
  if (btn) btn.onclick = async () => {
    const p = document.querySelector('input[name="diModel"]:checked')?.value;
    if (!p || p === d.profile) return toast("That is already the current model");
    try {
      await sbApi("change_model", { id, profile: p }); await sbPoll();
      toast(`${id} switched to ${r.alternatives.find((a) => a.profile === p)?.model || p}`);
      devinfoOpen(id);
    } catch (e) { toast(e.message, true); }
  };
}

document.addEventListener("dblclick", (e) => {
  const card = e.target.closest?.(".dr-card.device");          // model card in the equipment drawer: show its profile (not on the bench yet, no id)
  if (card) {
    const c = SB.cat?.[+card.dataset.i]; if (!c) return;
    DEVINFO.id = null; $("devInfo").hidden = false; $("diBody").innerHTML = `<div class="muted">Loading model profile…</div>`;
    api(`/api/device_info?profile=${encodeURIComponent(c.key)}`).then((r) => {
      devinfoRender(`Model: ${c.name}`, { profile: c.key, fields: {} }, r);
      const b = $("diSwap"); if (b) { b.disabled = true; b.nextElementSibling.textContent = "This is a drawer model; place it on the bench, then double-click it to switch"; }
    }).catch((err) => { $("diBody").innerHTML = `<div class="pc-bad">${esc(err.message)}</div>`; });
    return;
  }
  const v = e.target.closest?.("#world [data-c]");                 // vessel: details next to the pointer until it leaves the vessel
  if (v) {
    const cid = v.getAttribute("data-c"), c = S.frames[S.idx]?.containers?.[cid];
    if (c && typeof vesselTip === "function") { e.preventDefault(); tip(e, vesselTip(cid, c)); }
    return;
  }
  const g = e.target.closest?.("[data-d], [data-gear]");
  if (!g) return;
  e.preventDefault();
  devinfoOpen(g.getAttribute("data-d") || g.getAttribute("data-gear"));
});
$("diClose").onclick = () => { $("devInfo").hidden = true; };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("devInfo").hidden) $("devInfo").hidden = true; });
