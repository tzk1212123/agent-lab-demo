// Prep library (first view on page load): top strip picks the experiment (6 demo ones; expand for all plus paper-generated plans) + executor / speed;
// below are two equipment tables (gear.js); devices needed by the selected experiment get a dashed outline. Then ▶ Start at top right.
"use strict";

const PREP = { ex: null, all: false, need: new Set(), needText: "", key: "" };

function prepInit(ex) {
  PREP.ex = ex;
  $("prepBar").innerHTML = `
    <div class="prep-head"><b>Prep library</b><span class="muted">${window.STATIC_DEMO ? "Pick an experiment, then press ▶ Start at top right to replay its recorded run" : "Pick an experiment (or ← import a paper / fill in a plan on the left), then press ▶ Start at top right"}</span></div>
    <div id="prepList" class="prep-list"></div>
    <div class="prep-row">
      <span id="prepSel" class="prep-sel"></span>
      <span class="sp"></span>
      <span class="prep-opts"><label>Executor<select id="prepExec"><option value="xarm6_standard">Robot arm (xArm 6)</option><option value="">Human</option></select></label>
      <label title="Who watches the run (anomalies) and makes the closed-loop decisions">Monitoring &amp; decisions<select id="prepOverseer"><option value="llm">LLM (DeepSeek)</option><option value="rule">Rules only</option></select></label>
      <label>Speed<select id="prepSpeed" title="1× = same timing as a real experiment (including waits)"><option value="1">1× real time</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option></select></label></span>
    </div>`;
  const sync = (a, b) => { $(a).onchange = () => { $(b).value = $(a).value; $(b).onchange?.(); }; };   // keep in sync with the same settings in the right panel
  $("selRobot").value = "xarm6_standard";                 // robot arm executes by default
  $("prepExec").value = $("selRobot").value; $("prepSpeed").value = $("selSpeed").value;
  sync("prepExec", "selRobot"); sync("prepSpeed", "selSpeed");
  const back = (a, b) => $(a).addEventListener("change", () => { $(b).value = $(a).value; });
  back("selRobot", "prepExec"); back("selSpeed", "prepSpeed");
  prepRenderList();
}

function prepRenderList() {
  const ex = PREP.ex; if (!ex) return;
  const byId = Object.fromEntries(ex.experiments.map((e) => [e.id, e]));
  const c = DEMO.choice;
  const on = (kind, ref) => c && c.kind === kind && c.ref === ref ? "on" : "";
  // badges: who runs it (auto / needs human) and loop type (open: fully planned in advance; closed: decisions during the run)
  const loopB = (id) => { const l = byId[id]?.loop; return l ? [[l === "closed" ? "Closed loop" : "Open loop", `loop-${l}`]] : []; };
  const chip = (kind, ref, title, badges = []) => `<button class="prep-chip ${on(kind, ref)}" data-kind="${kind}" data-ref="${esc(ref)}" title="${esc(title)}">
      ${badges.map(([t, cls]) => `<i class="${cls}" title="${cls === "loop-closed" ? "Closed loop: later stages depend on earlier results; the LLM decides at the decision points" : cls === "loop-open" ? "Open loop: the whole procedure is written in advance; the LLM monitors" : ""}">${t}</i>`).join("")}<span>${esc(title)}</span></button>`;
  const show = (ex.showcase || []).filter((s) => byId[s.id]);
  let h = `<div class="prep-chips">${show.map((s) => chip("experiment", s.id, byId[s.id].title, [[s.auto ? "Auto" : "Needs human", s.auto ? "auto" : "hum"], ...loopB(s.id)])).join("")}
    <button id="prepMore" class="prep-more" ${window.STATIC_DEMO ? "hidden" : ""}>${PREP.all ? "Collapse" : `Show all (${ex.experiments.length} experiments + ${(ex.papers || []).length} paper plans)`}</button></div>`;
  if (PREP.all) {
    const rest = ex.experiments.filter((e) => !show.some((s) => s.id === e.id));
    h += `<div class="prep-group"><h5>All experiments</h5><div class="prep-chips small">${rest.map((e) => chip("experiment", e.id, e.title, loopB(e.id))).join("")}</div></div>
      <div class="prep-group"><h5>Paper-generated plans</h5><div class="prep-chips small">${(ex.papers || []).map((p) => chip("paper", p.id, p.title)).join("") || `<span class="muted">None yet</span>`}</div></div>`;
  }
  if (c && !["experiment", "paper"].includes(c.kind)) h += `<div class="prep-chips"><button class="prep-chip on" disabled><i class="hum">Manual</i><span>${esc(c.title)}</span></button></div>`;
  $("prepList").innerHTML = h;
  $("prepMore").onclick = () => { PREP.all = !PREP.all; prepRenderList(); };
  for (const b of $("prepList").querySelectorAll(".prep-chip[data-ref]")) b.onclick = () =>
    prepSelect({ kind: b.dataset.kind, ref: b.dataset.ref, title: b.title });
  $("prepSel").innerHTML = c ? `Selected: <b>${esc(c.title)}</b>${PREP.needText ? ` <span class="muted">· ${esc(PREP.needText)}</span>` : ""}` : `<span class="muted">No experiment selected</span>`;
}

// select an experiment / plan: make it the current plan and look up which devices it needs (outlined on the tables)
async function prepSelect(choice) {
  if (S.mode === "live" && S.status === "running") return toast("An experiment is running; abort it before switching", true);
  DEMO.choice = choice;
  if (choice.kind === "experiment" && [...$("selExp").options].some((o) => o.value === choice.ref)) $("selExp").value = choice.ref;
  demoChoiceShow();
}
async function prepSync() {                               // DEMO.choice changed (picked here, imported on the left, or filled in): refresh list and needed devices
  const c = DEMO.choice;
  const key = c ? `${c.kind}:${c.ref}:${c.plan ? JSON.stringify(c.plan).length : ""}` : "";
  if (key === PREP.key) { prepRenderList(); return; }
  PREP.key = key; PREP.need = new Set(); PREP.needText = c ? "Checking needed devices…" : "";
  prepRenderList(); if (S.view === "table") render();
  if (!c) return;
  try {
    const p = await api("/api/demo/prepare", { kind: c.kind, ref: c.ref, plan: c.plan || null });
    if (PREP.key !== key) return;
    PREP.need = new Set(p.layout.used_devices);
    PREP.needText = `Needs ${p.layout.used_devices.length} devices: ${p.layout.used_devices.join(", ")} (dashed outlines below)`;
  } catch (e) { PREP.needText = `Could not pre-arrange: ${e.message}`; }
  prepRenderList(); if (S.view === "table") render();
}

// ▶ Start at top right: run the selected plan (fixed procedure / paper / manual → demo flow; LLM planner selected → LLM plans as it goes)
function startChosen() {
  const c = DEMO.choice;
  if (!c) return toast("Pick an experiment in the prep library first", true);
  if ($("selPlanner").value !== "fixed" && c.kind === "experiment") { $("selExp").value = c.ref; return startLive(); }
  demoStart({ robot: !!$("selRobot").value, speed: $("selSpeed").value });
}
