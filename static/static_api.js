// Static backend for the GitHub Pages build (tools/build_site.py). Loaded before studio.js; studio.js `api()` defers here.
// Read-only endpoints are answered from pre-exported JSON under data/. "Start" replays a run recorded by the real simulator:
// frames and events are released by simulated time at the chosen speed, so the normal live-run UI (step list, progress,
// agent console, Enter-to-skip, conclusion and labour summary) works unchanged. Anything that needs the Python backend
// (bench edits, paper → plan, manual plans, the DeepSeek planner) reports that it isn't available online.
"use strict";

window.STATIC_DEMO = true;
const SD = { cache: {}, run: null };
const NOT_ONLINE = "Not available in the online demo (it replays recorded runs). Run the full app locally for this.";

async function sdLoad(file) {
  if (!(file in SD.cache)) {
    SD.cache[file] = fetch(`data/${file}`).then((r) => {
      if (!r.ok) throw new Error(`${NOT_ONLINE} (missing ${file})`);
      return r.json();
    });
  }
  return SD.cache[file];
}

function sdNow() {                                    // current simulated time of the replay
  const r = SD.run;
  if (r.status !== "running") return r.simT;
  return Math.min(r.tEnd, r.base + (performance.now() - r.real0) / 1000 * r.speed);
}
function sdRebase(simT) { const r = SD.run; r.base = simT; r.real0 = performance.now(); }

async function sdLiveStart(body) {
  const robot = body.robot ? "robot" : "human";
  const rec = await sdLoad(`runs/${body.experiment}__${robot}.json`);
  const asm = rec.assembly_steps || 0;                // one-off assembly is fast-forwarded, as on the live server
  const firstRun = rec.events.find((e) => e.type === "plan_step" && e.index > asm);
  const tEnd = rec.frames.length ? rec.frames[rec.frames.length - 1].t : 0;
  SD.run = { rec, speed: +body.speed || 1, status: "running", base: firstRun ? firstRun.t : 0, real0: performance.now(), tEnd, simT: 0 };
  return { ok: true, log: "recorded run" };
}

function sdLivePoll(q) {
  const r = SD.run;
  if (!r) return { status: "idle", frames: [], events: [], frame_next: 0, event_next: 0 };
  const fFrom = +q.get("frame") || 0, eFrom = +q.get("event") || 0;
  const t = sdNow();
  if (r.status === "running" && t >= r.tEnd) { r.status = r.rec.status || "finished"; r.simT = r.tEnd; }
  if (r.status === "stopped") r.simT = r.simT || t;
  const until = r.status === "running" ? t : (r.status === "stopped" ? r.simT : Infinity);
  let fTo = fFrom; while (fTo < r.rec.frames.length && r.rec.frames[fTo].t <= until) fTo++;
  let eTo = eFrom; while (eTo < r.rec.events.length && r.rec.events[eTo].t <= until) eTo++;
  const done = r.status !== "running";
  return { status: r.status, error: "", planner: "fixed", static: fFrom === 0 ? r.rec.static : null,
    frames: r.rec.frames.slice(fFrom, fTo), frame_next: fTo, events: r.rec.events.slice(eFrom, eTo), event_next: eTo,
    score: done && r.status !== "stopped" ? r.rec.score : null, summary: done ? r.rec.summary : null,
    submitted: done && r.status !== "stopped" ? r.rec.submitted : null, log: "recorded run (online demo)" };
}

window.STATIC_API = async function (path, body) {
  const u = new URL(path, location.href), p = u.pathname.replace(/^.*\/api\//, "/api/"), q = u.searchParams;
  switch (p) {
    case "/api/experiments": return sdLoad("experiments.json");
    case "/api/intro": return sdLoad("intro.json");
    case "/api/runs": return { runs: [] };
    case "/api/sandbox/catalog": return sdLoad("catalog.json");
    case "/api/sandbox/new": return sdLoad(`sandbox_${["gear_inventory", "gear_all"].includes(body?.sid) ? body.sid : "studio"}.json`);
    case "/api/sandbox/state": {
      const st = await sdLoad(`sandbox_${["gear_inventory", "gear_all"].includes(q.get("sid")) ? q.get("sid") : "studio"}.json`);
      return +q.get("since") ? { ...st, events: [] } : st;
    }
    case "/api/sandbox/pause": case "/api/sandbox/play": return { ok: true };
    case "/api/device_info": return sdLoad(`device_info/${q.get("profile")}.json`);
    case "/api/demo/prepare":
      if (body?.kind !== "experiment") throw new Error(NOT_ONLINE);
      return sdLoad(`prepare/${body.ref}.json`);
    case "/api/live/start": return sdLiveStart(body || {});
    case "/api/live/poll": return sdLivePoll(q);
    case "/api/live/speed": if (SD.run) { sdRebase(sdNow()); SD.run.speed = +body.speed || 1; } return { ok: true };
    case "/api/live/skip": {                          // Enter: jump to the start of the next plan step
      if (SD.run && SD.run.status === "running") {
        const t = sdNow(), nx = SD.run.rec.events.find((e) => e.type === "plan_step" && e.t > t + 1e-6);
        sdRebase(nx ? nx.t : SD.run.tEnd);
      }
      return { ok: true };
    }
    case "/api/live/stop": if (SD.run) { SD.run.simT = sdNow(); SD.run.status = "stopped"; } return { ok: true };
    default: throw new Error(NOT_ONLINE);
  }
};
