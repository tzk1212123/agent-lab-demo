// Landing pages: the intro (what the simulator is, what the LLM does, how to use it), then a shortcuts page.
// Intro (top right) reopens the intro; "?" opens the shortcuts page at any time.
"use strict";
function welcomeClose() { $("welcome").hidden = true; }
function keysOpen() { $("welcome").hidden = true; $("keys").hidden = false; }
function keysClose() { $("keys").hidden = true; }
$("wlGo").onclick = keysOpen;                                   // after the intro comes the shortcuts page
$("ksGo").onclick = keysClose;
$("ksBack").onclick = () => { keysClose(); $("welcome").hidden = false; };
$("introBtn").onclick = (e) => { e.preventDefault(); keysClose(); $("welcome").hidden = false; };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("welcome").hidden) keysOpen();
  else if (e.key === "Escape" && !$("keys").hidden) keysClose();
  else if (e.key === "?" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    if ($("keys").hidden) { $("welcome").hidden = true; $("keys").hidden = false; } else keysClose();
  }
});
$("welcome").addEventListener("click", (e) => { if (e.target === $("welcome")) keysOpen(); });
$("keys").addEventListener("click", (e) => { if (e.target === $("keys")) keysClose(); });
api("/api/intro").then((d) => {                                 // numbers come from test results (python -m agent_lab.intro)
  const c = d.counts, pb = c.paper_bench;
  const k = [[d.runs_total || c.experiments, "experiments run and scored"], [c.device_categories, "instrument types"],
    [c.device_models, "instrument models"], [pb ? pb.papers : c.paper_plans, "paper procedures reproduced"]];
  $("wlKpis").innerHTML = k.map(([v, l]) => `<div class="wl-kpi"><b>${esc(v ?? "—")}</b><span>${esc(l)}</span></div>`).join("");
}).catch(() => {});
