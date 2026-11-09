// Paper → plan check results: are instruments / operations / reactions / reagents all covered; gaps are flagged (shown on the plan generation page, genplan.js).
// Uses globals from studio.js: $, esc, api, S; from bench.js: toast, startSandbox.
"use strict";

const PAPER = { last: null };

function paperRow(ok, name, sub, detail) {
  return `<div class="pc-row ${ok ? "ok" : "miss"}"><span class="pc-mark">${ok ? "✓" : "✗"}</span>
    <span class="pc-name">${esc(name)}${sub ? ` <span class="muted">${esc(sub)}</span>` : ""}</span>
    ${detail ? `<div class="pc-detail">${esc(detail)}</div>` : ""}</div>`;
}
function renderPaperCheck(r, target) {
  const c = r.check, src = r.source || {};
  const inst = c.instruments.map((x) => x.status === "ok"
    ? paperRow(true, `${x.name} ${x.device}`, x.where === "drawer" ? "Add from the equipment drawer" : "In the store", x.model)
    : paperRow(false, `Missing: ${x.detail}`, `Step ${x.step}`, x.text)).join("") || `<div class="muted">The plan uses no devices</div>`;
  const stp = (c.steps || []).map((x) => paperRow(false, `Missing: ${x.name}`, `Step ${x.step}`, `${x.detail}${x.text ? " — \"" + x.text + "\"" : ""}`)).join("");
  const rx = c.reactions.map((x) => x.status === "ok"
    ? paperRow(true, x.name, x.assumed ? "Modelled, some parameters assumed" : "Modelled", (x.notes || []).slice(0, 2).join("; "))
    : paperRow(false, `Missing: ${x.name}`, "Could not be modelled", (x.notes || []).join("; "))).join("") || `<div class="muted">No chemical reactions (mainly physical processes / measurements)</div>`;
  const mt = c.materials.map((x) => x.status === "ok"
    ? paperRow(true, x.name, x.estimated ? "Some properties estimated" : "", "")
    : paperRow(false, `Missing: ${x.name}`, "Not definable in the database", (x.notes || []).join("; "))).join("");
  const m = c.missing, cov = c.coverage;
  (target || $("genCheck")).innerHTML = `
    <div class="pc-head"><b>${esc(r.title)}</b>
      <div class="muted">${esc(src.host || "")} · ${esc(src.kind || "")} · ${esc(src.note || "")}</div>
      <div class="pc-verdict ${m.instruments || m.steps || m.reactions || m.materials || (r.blocking || []).length ? "warn" : "good"}">${esc(c.verdict)}</div>
      <div class="muted">Plan: ${r.plan_steps} steps; ${Math.round(cov.fraction_executable * 100)}% executable (mapped ${cov.mapped}, approximated ${cov.approximated}, unsupported ${cov.unsupported})</div>
      ${c.fetch_from_drawer.length ? `<div class="muted">Add from the equipment drawer: ${esc(c.fetch_from_drawer.join(", "))}</div>` : ""}
    </div>
    <h4>Instruments ${m.instruments ? `<span class="pc-bad">${m.instruments} missing</span>` : ""}</h4>${inst}
    ${stp ? `<h4>Operations <span class="pc-bad">${m.steps} missing</span></h4>${stp}` : ""}
    <h4>Reactions ${m.reactions ? `<span class="pc-bad">${m.reactions} missing</span>` : ""}</h4>${rx}
    <h4>Reagents ${m.materials ? `<span class="pc-bad">${m.materials} missing</span>` : ""}</h4>${mt}
    <div class="row2"><a class="link" href="/paper" target="_blank">Compile details ↗</a></div>`;
}
