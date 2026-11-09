// ================================================================ what a viewer should understand at a glance
// One subtitle line at the bottom of the bench (what is happening now, in plain words), numbers floating up where they happen
// (+0.16 mL over a pump, pH 7.14 over the meter), and the LLM's decisions: 🧠 over the instrument it read, a dashed line to what it
// adjusts, its one-line conclusion as the subtitle, and 🧠 marks on the timeline. Everything is derived from the run log
// (live, replay and the static site alike). Uses globals from studio.js / fx.js / demo.js: S, $, el, esc, fmt, fmtT, SKILL_TEXT, fxLabel, DEMO.
"use strict";

const CAP = { seen: new Map(), floated: new Set(), marks: "" };
const CAP_HOLD = { decide: 7000, monitor: 6000, command: 2600, record: 3200 };   // ms a moment stays on screen (live)
const CAP_SIM = { decide: 40, monitor: 40, command: 6, record: 10 };              // the same in simulated seconds (replay / scrubbing)

function capLive(f) { return S.mode === "live" && S.idx === S.frames.length - 1; }
function capSeen(e) {                                     // wall-clock time this event first reached the screen
  if (!CAP.seen.has(e.seq)) CAP.seen.set(e.seq, performance.now());
  return CAP.seen.get(e.seq);
}
function capFresh(e, f, kind) {                           // is this event still "just now"?
  return capLive(f) ? performance.now() - capSeen(e) < CAP_HOLD[kind] : f.t - e.t < CAP_SIM[kind];
}
function capEvents(f) {                                   // events up to the frame on screen
  const live = capLive(f);
  return (S.events || []).filter((e) => !e.truth_only && (live || e.seq < (f.event_seq ?? Infinity)));
}

// ---------------------------------------------------------------- words
function capName(id, f) {                                 // "v1 (beaker)", "pump_2", "the pH meter"
  const d = f.devices[id];
  if (d) return id;
  return f.containers[id]?.label ? capShort(id, f) : id;            // "the mixing beaker", not "mix (Mixing beaker )"
}
function capShort(id, f) {                                // "Cyan dye 1.00×10⁻⁴ M" → "cyan dye"; falls back to the id
  const c = f.containers[id]; if (!c?.label) return id;
  return c.label.replace(/\s+[\d.,]+\s*(×|x|mL|L|M|mM|%|g)\b.*$/u, "").replace(/\s*[（(].*$/, "").toLowerCase() || id;
}
function capCmdText(e, f) {                               // "pump_1 adds 9.49 mL of deionized water to the mixing beaker"
  const cn = f.devices[e.device]?.connections || {}, p = e.params || {};
  if (/^(dispense|infuse)$/.test(e.command) && p.volume != null && (cn.in || cn.out))
    return `${e.device} adds ${fmt(p.volume, 3)} mL${cn.in ? ` of ${capShort(cn.in, f)}` : ""}${cn.out ? ` to the ${capShort(cn.out, f)}` : ""}`;
  return `${e.device} ${(CAP_CMD[e.command] || (() => e.command.replace(/_/g, " ")))(p)}`;
}
function capVar(name) { return name.replace(/_(mL|uL|g|s|min|C)$/i, "").replace(/_/g, " "); }
function capVarUnit(name, step) {
  const u = step?.sets?.[name]?.unit || (/_mL$/i.test(name) ? "mL" : /_g$/i.test(name) ? "g" : "");
  return u ? ` ${u}` : "";
}
function capDecideStep(id) { return DEMO.prep?.steps?.find((s) => s.id === id)?.step; }
function capDecision(e) {                                 // "add yellow 0.161 mL, add cyan 0.179 mL" / "target reached"
  if (e.stop) return "stop — a human should check the data";
  if (e.done) return "goal reached, no more rounds";
  const st = capDecideStep(e.step_id);
  const v = Object.entries(e.vars || {}).filter(([, x]) => +x > 0).map(([k, x]) => `${capVar(k)} ${+(+x).toFixed(3)}${capVarUnit(k, st)}`);
  return v.length ? v.join(", ") : "no change";
}
function capShortReason(s) { const t = capFirstSentence(s).replace(/[;,:]$/, ""); return t.length > 70 ? `${t.slice(0, 68).replace(/\s+\S*$/, "")}…` : t; }
function capFirstSentence(s) { const m = /^(.{12,160}?[.;!?])(\s|$)/.exec(s || ""); return m ? m[1] : (s || "").slice(0, 160); }

const CAP_CMD = {
  dispense: (p) => `adds ${fmt(p.volume, 3)} mL`, infuse: (p) => `pumps in ${fmt(p.volume, 3)} mL`, withdraw: (p) => `draws back ${fmt(p.volume, 3)} mL`,
  set_temperature: (p) => `heats to ${p.temperature} °C`, heater_on: () => "starts heating", heater_off: () => "stops heating",
  set_speed: (p) => `sets stirring to ${p.speed ?? p.rpm} rpm`, stir_on: () => "starts stirring", stir_off: () => "stops stirring",
  set_wavelength: (p) => `reads at ${p.wavelength} nm`, measure: () => "measures", read: () => "takes a reading", start: () => "starts", stop: () => "stops",
  sparge: (p) => `bubbles gas through for ${p.duration_s} s to raise a foam`, record: (p) => `films for ${Math.round((p.duration_s || 0) / 60)} min`,
  drain: () => "drains", rinse: () => "rinses", inject: () => "injects a sample", run: () => "runs",
};
function capWho(a) {
  return a.executor_kind === "robot_arm" ? `🤖 Robot arm` : a.executor_kind === "passive" ? "⏳" : /human/.test(a.executor_kind || "") ? `🧑‍🔬 ${a.is_human ? "A person" : a.executor}` : a.executor;
}

// the subtitle: the most telling thing happening now
function captionNow(f) {
  if (f.halted) return { cls: "warn", text: `⛔ Stopped: ${f.halted}` };
  const evs = capEvents(f);
  let think = null, done = null, mon = null, cmd = null, rec = null, step = null;
  for (const e of evs) {
    if (e.type === "overseer" && e.role === "decide" && e.phase === "thinking") think = e;
    else if (e.type === "overseer" && e.role === "decide" && e.phase === "done") { done = e; if (think && think.step_id === e.step_id) think = null; }
    else if (e.type === "overseer" && e.role === "monitor" && e.phase === "done" && (e.ok === false || e.action)) mon = e;
    else if (e.type === "command") cmd = e;
    else if (e.type === "record") rec = e;
    else if (e.type === "plan_step") step = e;
  }
  const who = (e) => e.source === "llm" ? "🧠 The LLM" : "⚙ The plan's rule";
  if (think) return { cls: "llm", text: `${who(think)} reads the measurements and decides: ${think.question || "what next?"}` };
  if (done && capFresh(done, f, "decide"))
    return { cls: "llm", text: `${who(done)} decided: ${capDecision(done)}${done.reason ? ` — ${capShortReason(done.reason)}` : ""}` };
  if (mon && capFresh(mon, f, "monitor")) return { cls: "warn", text: `⚠ ${capFirstSentence(mon.detail || (mon.problems || []).join("; "))}` };
  const a = f.activity;
  if (a && a.executor_kind !== "passive") {
    const L = (id) => capName(id, f);
    const txt = (SKILL_TEXT[a.skill] || ((p) => `${a.skill.replace(/_/g, " ")}`))(a.params, L);
    return { cls: "", text: `${capWho(a)} is ${txt}` };
  }
  const busy = cmd && (best(f.devices[cmd.device] || { fields: {} }, "running") ?? 0) > 0;   // a pump still dosing keeps its line
  if (cmd && (busy || capFresh(cmd, f, "command"))) return { cls: "", text: capCmdText(cmd, f) };
  if (rec && capFresh(rec, f, "record")) {
    const v = Object.entries(rec.data || {}).slice(0, 3).map(([k, q]) => `${k.split(".").pop().replace(/_/g, " ")} ${typeof q.value === "number" ? +q.value.toPrecision(4) : q.value}`);
    return { cls: "", text: `📋 Reading recorded: ${v.join(" · ")}` };
  }
  const ps = step && DEMO.prep?.steps?.find((s) => s.index === step.index)?.step;
  if (ps?.kind === "wait") return { cls: "dim", text: `⏳ Waiting ${fmtT(ps.seconds)}${ps.note ? ` (${ps.note})` : ""} — sped up, nothing to do by hand` };
  if (ps?.kind === "wait_until") return { cls: "dim", text: `⏳ Waiting until ${ps.condition?.ref} ${ps.condition?.op} ${ps.condition?.value}` };
  if (ps?.kind === "wait_stable") return { cls: "dim", text: `⏳ Waiting for ${ps.ref} to settle` };
  const n = typeof narrate === "function" ? narrate(f).dev : [];
  return n.length ? { cls: "dim", text: n[0] } : null;
}

function renderCaption(f) {
  let box = document.getElementById("caption");
  if (!box) { box = document.createElement("div"); box.id = "caption"; box.className = "caption"; $("stage").appendChild(box); }
  const on = f && (S.mode === "live" || S.mode === "replay") && S.view !== "table";
  const c = on ? captionNow(f) : null;
  box.hidden = !c;
  if (!c) return;
  const html = esc(c.text);
  if (box.dataset.t !== c.text) { box.innerHTML = html; box.dataset.t = c.text; box.className = `caption ${c.cls}`; }
  renderFloats(f);
  renderMarks();
}

// ---------------------------------------------------------------- numbers that float up where things happen
function capAnchor(id) {                                  // screen point (inside #stage) above a device or container
  const g = S.geo; if (!g) return null;
  let x, y;
  const b = S.devBoxes?.[id], p = g.pos?.[id];
  if (p) { x = p.x; y = (p.top ?? p.y) - 20; } else if (b) { x = b.x ?? b.L + b.W / 2; y = b.T - 30; } else return null;
  const svg = $("world"), m = svg.getScreenCTM(); if (!m) return null;
  const q = svg.createSVGPoint(); q.x = x; q.y = y;
  const s = q.matrixTransform(m), r = $("stage").getBoundingClientRect();
  return { x: s.x - r.left, y: s.y - r.top };
}
function capFloat(id, text, cls) {
  const at = capAnchor(id); if (!at) return;
  const d = document.createElement("div");
  d.className = `cap-float ${cls || ""}`; d.textContent = text;
  d.style.left = `${at.x}px`; d.style.top = `${at.y}px`;
  $("stage").appendChild(d);
  setTimeout(() => d.remove(), 2600);
}
function renderFloats(f) {
  if (!capLive(f) && !S.playing) return;                  // scrubbing by hand: no flurry of old numbers
  for (const e of capEvents(f)) {
    if (CAP.floated.has(e.seq) || !capFresh(e, f, e.type === "record" ? "record" : "command")) continue;
    if (e.type === "command" && /^(dispense|infuse)$/.test(e.command) && e.params?.volume != null)
      capFloat(f.devices[e.device]?.connections?.out || e.device, `+${fmt(e.params.volume, 3)} mL ${capShort(f.devices[e.device]?.connections?.in, f) || ""}`.trim(), "add");
    else if (e.type === "task_started" && e.skill === "transfer_liquid" && e.params?.dst)
      capFloat(e.params.dst, e.params.volume < 0 || e.params._all ? "+ all" : `+${fmt(e.params.volume, 3)} mL`, "add");
    else if (e.type === "record") {
      for (const [k, q] of Object.entries(e.data || {}).slice(0, 3)) {
        const dev = k.split(".")[0];
        if (q && typeof q.value === "number") capFloat(dev, `${k.split(".").pop().replace(/_/g, " ")} ${+q.value.toPrecision(4)}`, "read");
      }
    } else continue;
    CAP.floated.add(e.seq);
  }
}

// ---------------------------------------------------------------- the LLM's moment in the scene: 🧠 over what it read → what it adjusts
function capAdjusted(st) {                                // [device or container, variable] the decision sets amounts for
  const names = Object.keys(st?.sets || {}), out = [];
  for (const s of DEMO.prep?.steps || []) {
    const txt = JSON.stringify(s.step.params || {});
    const n = names.find((x) => txt.includes(`"$${x}"`)); if (!n) continue;
    const id = s.step.kind === "command" ? s.step.device : s.step.params?.src || s.step.params?.dst;
    if (id && !out.some(([i]) => i === id)) out.push([id, n]);
  }
  return out;
}
function renderLlmLink(svg, f) {
  if (!f || S.view !== "iso" && S.view !== "top") return;
  const evs = capEvents(f);
  let think = null, done = null, rec = null;
  for (const e of evs) {
    if (e.type === "overseer" && e.role === "decide" && e.phase === "thinking") think = e;
    else if (e.type === "overseer" && e.role === "decide" && e.phase === "done") { done = e; if (think?.step_id === e.step_id) think = null; }
    else if (e.type === "record") rec = e;
  }
  const e = think || (done && capFresh(done, f, "decide") ? done : null);
  if (!e || !S.geo) return;
  const src = rec ? Object.keys(rec.data || {})[0]?.split(".")[0] : null;
  const pt = (id) => { const p = S.geo.pos?.[id], b = S.devBoxes?.[id]; return p ? { x: p.x, y: (p.top ?? p.y) - 10 } : b ? { x: b.x ?? b.L + b.W / 2, y: b.T - 10 } : null; };
  const a = src && pt(src);
  const g = el("g", { class: "llm-link" }, svg);
  if (a) {
    const st = capDecideStep(e.step_id);
    for (const [id, v] of capAdjusted(st)) {
      const b = pt(id); if (!b) continue;
      const amt = e === done ? +(e.vars || {})[v] : null;
      if (e === done && !(amt > 0)) continue;                  // nothing more from this one this round
      const my = Math.min(a.y, b.y) - 120;
      el("path", { d: `M${a.x},${a.y - 40} Q${(a.x + b.x) / 2},${my} ${b.x},${b.y}`, class: "llm-arc" }, g);
      el("text", { x: b.x, y: b.y - 8, class: "llm-tag" }, g, e === done ? `+${+amt.toFixed(3)}${capVarUnit(v, st)}` : "?");
    }
    el("text", { x: a.x, y: a.y - 40, class: "llm-brain" }, g, "🧠");
  }
}

// ---------------------------------------------------------------- 🧠 marks on the timeline: where the LLM decided
function renderMarks() {
  const scrub = $("scrub"); if (!scrub) return;
  let bar = document.getElementById("scrubMarks");
  if (!bar) { bar = document.createElement("div"); bar.id = "scrubMarks"; bar.className = "scrub-marks"; scrub.parentNode.insertBefore(bar, scrub.nextSibling); }
  const n = S.frames.length;
  if (n < 2 || !(S.mode === "live" || S.mode === "replay")) { bar.innerHTML = ""; CAP.marks = ""; return; }
  const ds = (S.events || []).filter((e) => e.type === "overseer" && e.role === "decide" && e.phase === "done");
  const key = `${n}:${ds.length}`;
  if (key === CAP.marks) return;
  CAP.marks = key;
  let i = 0;
  const pos = ds.map((e) => { while (i < n - 1 && (S.frames[i].event_seq ?? 0) <= e.seq) i++; return i / (n - 1); });
  const r = scrub.getBoundingClientRect(), pr = bar.parentNode.getBoundingClientRect();
  bar.style.left = `${r.left - pr.left}px`; bar.style.width = `${r.width}px`;
  bar.innerHTML = pos.map((p, k) => `<i style="left:${(p * 100).toFixed(2)}%" title="LLM decision ${k + 1}: ${esc(capDecision(ds[k]))}">🧠</i>`).join("");
}
