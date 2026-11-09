// Paper → plan check results: are instruments / operations / reactions / reagents all covered; gaps are flagged (shown on the plan generation page, genplan.js).
// Uses globals from studio.js: $, esc, api, S; from bench.js: toast, startSandbox.
"use strict";

const PAPER = { last: null };

function paperRow(ok, name, sub, detail) {
  return `<div class="pc-row ${ok ? "ok" : "miss"}"><span class="pc-mark">${ok ? "✓" : "✗"}</span>
    <span class="pc-name">${esc(name)}${sub ? ` <span class="muted">${esc(sub)}</span>` : ""}</span>
    ${detail ? `<div class="pc-detail">${esc(detail)}</div>` : ""}</div>`;
}
// one compatibility signal + the plan's labels (auto / needs human, open / closed) and where the LLM decides
function paperSignal(r) {
  const c = r.check, lb = r.labels || {};
  const lvl = c.level || "approximate";
  const head = {compatible: "✓ Compatible: the simulator can run this paper",
                approximate: "≈ Runs, with approximations",
                incompatible: "✗ Not compatible: the simulator can't stand in for this paper"}[lvl];
  const why = (c.reasons || []).map((x) => `<li>${esc(x)}</li>`).join("");
  const tags = lvl === "incompatible" ? "" : `<div class="pc-tags">
      <span class="tag">${lb.execution === "auto" ? "auto" : lb.execution === "needs_human" ? "needs human" : "?"}</span>
      <span class="tag">${c.loop === "closed" ? "closed loop" : "open loop"}</span></div>`;
  const pts = (c.points || []).map((p) => `<li>🧠 <b>${esc(p.id)}</b>: ${esc(p.question)} <span class="muted">(adjusts ${esc(p.adjusts.join(", "))}${p.rule ? "; fallback rule " + esc(p.rule) : ""})</span></li>`).join("");
  const lost = c.closed_loop_lost ? `<div class="pc-bad">The paper is closed-loop, but its decisions couldn't be compiled: this plan runs open-loop on the paper's final conditions.</div>` : "";
  const hum = lb.execution === "needs_human" && (lb.human_reasons || []).length ? `<div class="muted">Needs a human: ${esc(lb.human_reasons.join("; "))}</div>` : "";
  return `<div class="pc-verdict ${lvl === "compatible" ? "good" : lvl === "incompatible" ? "bad" : "warn"}">${head}</div>
      ${why ? `<ul class="muted pc-why">${why}</ul>` : ""}${tags}${hum}
      ${pts ? `<div class="muted">LLM decision points:</div><ul class="pc-why">${pts}</ul>` : ""}${lost}`;
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
      ${paperSignal(r)}
      <div class="muted">Plan: ${r.plan_steps} steps; ${Math.round(cov.fraction_executable * 100)}% executable (mapped ${cov.mapped}, approximated ${cov.approximated}, unsupported ${cov.unsupported})</div>
      ${c.fetch_from_drawer.length ? `<div class="muted">Add from the equipment drawer: ${esc(c.fetch_from_drawer.join(", "))}</div>` : ""}
    </div>
    <h4>Instruments ${m.instruments ? `<span class="pc-bad">${m.instruments} missing</span>` : ""}</h4>${inst}
    ${stp ? `<h4>Operations <span class="pc-bad">${m.steps} missing</span></h4>${stp}` : ""}
    <h4>Reactions ${m.reactions ? `<span class="pc-bad">${m.reactions} missing</span>` : ""}</h4>${rx}
    <h4>Reagents ${m.materials ? `<span class="pc-bad">${m.materials} missing</span>` : ""}</h4>${mt}
    <div class="row2"><a class="link" href="/paper" target="_blank">Compile details ↗</a></div>`;
}
