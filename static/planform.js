// Manual plan: table editor (one step per row) ⇄ standard JSON plan. Format: docs/plan_format.md
// Backend: /api/plan/to_table (existing plan → table + dropdown hints), /api/plan/table (table → plan, row checks + dry run)
const PF = { exp: null, rows: [], hints: null, plan: null, issues: {}, goal: "" };
const PF_KINDS = { task: "Operation (skill)", command: "Instrument command", wait: "Wait", wait_until: "Wait until",
  repeat_until: "Repeat until", record: "Record readings", wait_stable: "Wait for stable reading",
  decide: "Decision point (closed loop)", vars: "Plan variables" };
// extra (not shown as a cell): JSON for monitoring slots and decision-point specs; kept with the row and in the CSV
const PF_COLS = ["depth", "kind", "target", "action", "params", "condition", "note", "extra"];

function pfBlankRow(kind = "command") { return { depth: "0", kind, target: "", action: "", params: "", condition: "", note: "", extra: "" }; }

async function pfInit() {
  const ex = await api("/api/experiments");
  const show = new Set((ex.showcase || []).map((s) => s.id));
  const opt = (e) => `<option value="${esc(e.id)}">${esc(e.title)}</option>`;
  $("pfExp").innerHTML = `<optgroup label="Demo experiments">${ex.experiments.filter((e) => show.has(e.id)).map(opt).join("")}</optgroup>`
    + `<optgroup label="Other experiments (bench and reagents)">${ex.experiments.filter((e) => !show.has(e.id)).map(opt).join("")}</optgroup>`;
  $("pfOpen").onclick = () => pfOpen($("pfExp").value);
  $("pfClose").onclick = () => { $("pfModal").hidden = true; };
  $("pfLoad").onclick = () => pfLoad(PF.exp, false);
  $("pfBlank").onclick = () => pfLoad(PF.exp, true);
  $("pfAdd").onclick = () => { PF.rows.push(pfBlankRow()); pfDirty(); pfRender(); };
  $("pfCheck").onclick = pfCheck;
  $("pfUse").onclick = pfUse;
  $("pfExport").onclick = pfExport;
  $("pfImport").onchange = pfImport;
  $("pfGoal").oninput = () => { PF.goal = $("pfGoal").value; pfDirty(); };
}

async function pfOpen(exp) {
  $("pfModal").hidden = false;
  if (PF.exp !== exp || !PF.hints) await pfLoad(exp, false);
}

async function pfLoad(exp, blank) {
  try {
    let r;
    try { r = await api("/api/plan/to_table", { kind: "experiment", ref: exp, blank }); }
    catch (e) { r = await api("/api/plan/to_table", { kind: "experiment", ref: exp, blank: true }); toast("No existing plan for this experiment; here's a blank table", true); }
    PF.exp = exp; PF.hints = r.hints; PF.rows = r.rows.length ? r.rows : [pfBlankRow("task")];
    PF.goal = r.goal || ""; $("pfGoal").value = PF.goal;
    $("pfTitle").textContent = $("pfExp").selectedOptions[0]?.textContent || exp;
    pfDirty(); pfRender();
  } catch (e) { toast(e.message, true); }
}

function pfDirty() { PF.plan = null; PF.issues = {}; $("pfUse").disabled = true; $("pfStatus").innerHTML = ""; }

function pfDatalists() {
  const h = PF.hints || { skills: {}, devices: {}, containers: [] };
  const fields = Object.entries(h.devices).flatMap(([d, v]) => (v.fields || []).map((f) => `${d}.${f}`));
  const dl = (id, vals) => `<datalist id="${id}">${vals.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`;
  let html = dl("pfSkills", Object.keys(h.skills)) + dl("pfDevices", Object.keys(h.devices)) + dl("pfFields", fields);
  for (const [d, v] of Object.entries(h.devices)) html += dl(`pfCmd_${d}`, Object.keys(v.commands));
  return html;
}

function pfHint(row) {                                     // placeholder hints for parameter cells
  const h = PF.hints; if (!h) return "";
  if (row.kind === "task") return (h.skills[row.target] || []).map((p) => `${p}=`).join(", ");
  if (row.kind === "command") return ((h.devices[row.target]?.commands || {})[row.action] || []).map((p) => `${p}=`).join(", ");
  return { wait: "seconds=60", wait_until: "timeout_s=600", repeat_until: "max_iterations=50",
    wait_stable: "tolerance=0.2, window_s=120, timeout_s=3600" }[row.kind] || "";
}

function pfRender() {
  const kindSel = (k) => Object.entries(PF_KINDS).map(([v, t]) => `<option value="${v}" ${v === k ? "selected" : ""}>${t}</option>`).join("");
  const tgtList = (r) => ({ task: "pfSkills", command: "pfDevices", record: "pfFields", wait_stable: "pfFields" }[r.kind] || "");
  const tgtPh = (r) => ({ task: "skill, e.g. place_container", command: "device id", record: "readings, separate with |", wait_stable: "reading, e.g. balance_1.mass" }[r.kind] || "—");
  const actPh = (r) => ({ command: "command name", record: "label" }[r.kind] || "—");
  const needCond = (r) => r.kind === "wait_until" || r.kind === "repeat_until";
  const body = PF.rows.map((r, i) => {
    const iss = PF.issues[String(i + 1)] || [];
    return `<tr class="${iss.length ? "bad" : ""} ${r.depth === "1" ? "inloop" : ""}" data-i="${i}">
      <td class="n">${i + 1}</td>
      <td><input type="checkbox" data-k="depth" ${r.depth === "1" ? "checked" : ""} title="Belongs to the nearest &quot;Repeat until&quot; above"></td>
      <td><select data-k="kind">${kindSel(r.kind)}</select></td>
      <td><input data-k="target" value="${esc(r.target)}" list="${tgtList(r)}" placeholder="${tgtPh(r)}" ${tgtList(r) || r.kind === "task" ? "" : "disabled"}></td>
      <td><input data-k="action" value="${esc(r.action)}" list="${r.kind === "command" ? `pfCmd_${esc(r.target)}` : ""}" placeholder="${actPh(r)}" ${r.kind === "command" || r.kind === "record" ? "" : "disabled"}></td>
      <td><input data-k="params" value="${esc(r.params)}" placeholder="${esc(pfHint(r))}" class="wide"></td>
      <td><input data-k="condition" value="${esc(r.condition)}" placeholder="${needCond(r) ? "e.g. ph_1.ph >= 7" : "—"}" ${needCond(r) ? "" : "disabled"}></td>
      <td><input data-k="note" value="${esc(r.note)}"></td>
      <td class="ops"><button data-op="up" title="Move up">↑</button><button data-op="ins" title="Insert row below">＋</button><button data-op="del" title="Delete">✕</button></td>
    </tr>${iss.length ? `<tr class="iss"><td></td><td colspan="8">${iss.map(esc).join("<br>")}</td></tr>` : ""}`;
  }).join("");
  $("pfTable").innerHTML = `<thead><tr><th>#</th><th title="Inside loop">In loop</th><th>Type</th><th>Target</th><th>Action / label</th><th>Params (name=value, …)</th><th>Condition</th><th>Note</th><th></th></tr></thead><tbody>${body}</tbody>`;
  $("pfLists").innerHTML = pfDatalists();
  const general = PF.issues["0"];
  if (general) $("pfStatus").innerHTML = `<div class="pc-bad">${general.map(esc).join("<br>")}</div>`;
}

document.addEventListener("input", (e) => {
  const tr = e.target.closest?.("#pfTable tr[data-i]"); if (!tr) return;
  const r = PF.rows[+tr.dataset.i], k = e.target.dataset.k; if (!r || !k) return;
  r[k] = k === "depth" ? (e.target.checked ? "1" : "0") : e.target.value;
  pfDirty();
  if (k === "kind" || k === "depth") pfRender();
  else if (k === "target" || k === "action") {               // device / command changed: only update hints, don't interrupt typing
    const p = tr.querySelector('[data-k="params"]'); if (p) p.placeholder = pfHint(r);
    const a = tr.querySelector('[data-k="action"]'); if (a && r.kind === "command") a.setAttribute("list", `pfCmd_${r.target}`);
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("#pfTable button[data-op]"); if (!b) return;
  const i = +b.closest("tr").dataset.i;
  if (b.dataset.op === "del") PF.rows.splice(i, 1);
  else if (b.dataset.op === "ins") PF.rows.splice(i + 1, 0, pfBlankRow());
  else if (b.dataset.op === "up" && i > 0) [PF.rows[i - 1], PF.rows[i]] = [PF.rows[i], PF.rows[i - 1]];
  if (!PF.rows.length) PF.rows.push(pfBlankRow());
  pfDirty(); pfRender();
});

async function pfCheck() {
  $("pfStatus").innerHTML = `<span class="muted">Checking: static checks + a full dry run in the simulator…</span>`;
  try {
    const r = await api("/api/plan/table", { experiment: PF.exp, rows: PF.rows, goal: PF.goal });
    PF.issues = r.issues || {}; PF.plan = r.ok ? r.plan : null;
    pfRender();
    const n = Object.values(PF.issues).reduce((a, x) => a + x.length, 0);
    const dr = r.dry_run;
    $("pfStatus").innerHTML += r.ok
      ? `<div class="pc-ok">Passed: ${r.plan.steps.length} top-level steps, dry run executed ${dr?.steps_executed ?? "?"} steps, simulated time ${dr ? Math.round(dr.duration_s / 60) : "?"} min${dr?.human_tasks ? `, ${dr.human_tasks} steps need a human` : ""}. Plan is ready to use.</div>`
      : `<div class="pc-bad">Failed: ${n} problems, marked under the affected rows.</div>`;
    $("pfUse").disabled = !r.ok;
  } catch (e) { $("pfStatus").innerHTML = `<div class="pc-bad">${esc(e.message)}</div>`; }
}

function pfUse() {
  if (!PF.plan) return;
  DEMO.choice = { kind: "manual", ref: PF.exp, plan: PF.plan, title: `${$("pfTitle").textContent} (manual plan)` };
  demoChoiceShow();
  $("pfModal").hidden = true;
  toast("Manual plan selected: press ▶ Start at top right");
}

function pfCsv(rows) {
  const q = (v) => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? "");
  return [PF_COLS.join(","), ...rows.map((r) => PF_COLS.map((c) => q(r[c] ?? "")).join(","))].join("\n") + "\n";
}
function pfExport() {                                       // export CSV (opens in Excel; fill in and import again)
  const blob = new Blob(["﻿" + pfCsv(PF.rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${PF.exp || "plan"}.plan.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function pfImport(e) {
  const f = e.target.files?.[0]; if (!f) return;
  const text = await f.text(); e.target.value = "";
  try {
    const r = await api("/api/plan/table", { experiment: PF.exp, csv: text, goal: PF.goal });
    PF.rows = (r.rows || []).map((x) => ({ ...pfBlankRow(), ...x }));
    PF.issues = r.issues || {}; PF.plan = r.ok ? r.plan : null;
    pfRender(); $("pfUse").disabled = !r.ok;
    $("pfStatus").innerHTML += r.ok ? `<div class="pc-ok">Imported and checked (${PF.rows.length} rows).</div>` : `<div class="pc-bad">Imported ${PF.rows.length} rows; problem rows are marked.</div>`;
  } catch (err) { toast(err.message, true); }
}

pfInit().catch((e) => toast(`Manual plan init failed: ${e.message}`, true));
