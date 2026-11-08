// Plan generation page: drop a paper link → background job (/api/paper/job_start) → poll /api/paper/job,
// live display: full text, experimental section, LLM reasoning (streamed), its structured output, check / fix, compile, instrument check.
"use strict";

const GEN = { id: null, ev: 0, offs: { reasoning: 0, content: 0, tool_args: 0 }, timer: null, result: null };
const GEN_STAGES = [["fetch", "Fetch full text, find experimental section"], ["llm", "LLM reads the paper and works out each step"], ["compile", "Compile into experiment and runnable plan"], ["check", "Check instruments / operations / reactions / reagents"]];

function genOpen(url) {
  clearTimeout(GEN.timer);
  Object.assign(GEN, { id: null, ev: 0, offs: { reasoning: 0, content: 0, tool_args: 0 }, result: null });
  $("genPage").hidden = false;
  $("genUrl").textContent = url;
  $("genStages").innerHTML = GEN_STAGES.map(([k, t]) => `<li data-st="${k}"><i></i><span>${esc(t)}</span><small></small></li>`).join("");
  for (const id of ["genExcerpt", "genThink", "genOut", "genLog", "genCheck"]) $(id).innerHTML = "";
  $("genThink").innerHTML = `<span class="muted">Waiting for paper text…</span>`;
  $("genUse").disabled = true; $("genClock").textContent = "0 s";
  api("/api/paper/job_start", { url, provider: "deepseek" })
    .then((r) => { GEN.id = r.id; genPoll(); })
    .catch((e) => genLog(`Failed to start: ${e.message}`, "bad"));
}

function genLog(text, cls = "") { $("genLog").insertAdjacentHTML("beforeend", `<div class="gl ${cls}">${esc(text)}</div>`); $("genLog").scrollTop = 1e9; }

function genStage(stage, state, note) {
  const li = document.querySelector(`#genStages li[data-st="${stage}"]`); if (!li) return;
  li.className = state; if (note != null) li.querySelector("small").textContent = note;
  if (state === "on") for (const x of document.querySelectorAll("#genStages li")) {   // earlier stages count as done
    if (x === li) break; if (x.className !== "bad") x.className = "done";
  }
}

function genAppend(id, text) {
  if (!text) return;
  const box = $(id);
  if (box.dataset.started !== "1") { box.innerHTML = ""; box.dataset.started = "1"; }
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.append(document.createTextNode(text));
  if (near) box.scrollTop = box.scrollHeight;
}

async function genPoll() {
  if (!GEN.id || $("genPage").hidden) return;
  try {
    const q = new URLSearchParams({ id: GEN.id, ev: GEN.ev, ...GEN.offs });
    const r = await api(`/api/paper/job?${q}`);
    $("genClock").textContent = `${Math.round(r.elapsed_s)} s`;
    for (const e of r.events) {
      if (e.type === "stage") { genStage(e.stage, "on"); genLog(`${e.t} s · ${e.text}`); }
      else if (e.type === "fetched") {
        genStage("fetch", "done", `${e.host || ""} · ${e.src_kind || ""} · experimental section ${e.chars} chars`);
        $("genExcerpt").textContent = e.excerpt + (e.chars > e.excerpt.length ? "\n……" : "");
        if (e.note) genLog(e.note);
        $("genThink").innerHTML = `<span class="muted">LLM is reading… (deep thinking, usually 0.5–2 min)</span>`;
      } else if (e.type === "round" && e.n > 1) genLog(`Round ${e.n}: fixing per check feedback`, "warn");
      else if (e.type === "validated") {
        if (e.ok) { genLog(`Structure check passed: ${e.steps} steps, ${e.materials} materials`, "good"); genStage("llm", "done"); }
        else genLog(`Structure check failed; sent back to the LLM to fix:\n${e.errors}`, "warn");
      } else if (e.type === "note") genLog(e.text, "warn");
      else if (e.type === "done") genLog(`Done: plan has ${e.plan_steps} steps. ${e.verdict || ""}`, "good");
      else if (e.type === "error") genLog(`Error: ${e.text}`, "bad");
    }
    GEN.ev += r.events.length;
    genAppend("genThink", r.text.reasoning);
    genAppend("genOut", (r.text.content || "") + (r.text.tool_args || ""));
    GEN.offs = { reasoning: r.lens.reasoning, content: r.lens.content, tool_args: r.lens.tool_args };
    if (r.status === "done") {
      GEN.result = r.result;
      for (const x of document.querySelectorAll("#genStages li")) x.className = "done";
      renderPaperCheck(r.result, $("genCheck"));
      $("genUse").disabled = false;
      return;
    }
    if (r.status === "error") { genStage(r.stage, "bad", r.error); return; }
  } catch (e) { genLog(`Polling failed: ${e.message}`, "bad"); }
  GEN.timer = setTimeout(genPoll, 500);
}

$("genClose").onclick = () => { $("genPage").hidden = true; clearTimeout(GEN.timer); };
$("genUse").onclick = () => {
  if (!GEN.result) return;
  demoPaperDone(GEN.result);
  $("genPage").hidden = true;
  toast("Plan ready: press ▶ Start at top right");
};
