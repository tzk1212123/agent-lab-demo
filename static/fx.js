// ================================================================ animation layer and narration
// The scene (#world) is redrawn every frame; animations live in a separate #fx overlay, redrawn only when "what is happening" changes,
// so CSS / SMIL animations play continuously: pouring, moving containers, adding solids, pump dosing, heating, boiling, rotavap…
// Uses globals from studio.js: S, el, fmt, esc, best, liquidColor, baseY, LEG.

const FX_NS = "http://www.w3.org/2000/svg";
const SKILL_TEXT = {
  place_container: (p, L) => `placing ${L(p.container)} on ${L(p.location)}`,
  transfer_liquid: (p, L) => p._all || p.volume < 0 ? `pouring all of ${L(p.src)} into ${L(p.dst)}` : `transferring ${fmt(p.volume, 3)} mL from ${L(p.src)} to ${L(p.dst)}`,
  transfer_solid: (p, L) => `weighing ${fmt(p.mass, 4)} g from ${L(p.src)} into ${L(p.dst)}`,
  add_stir_bar: (p, L) => `adding a stir bar to ${L(p.container)}`,
  attach_probe: (p, L) => `attaching ${p.device} ${p.port} to ${L(p.container)}`,
  detach_probe: (p) => `detaching ${p.device} ${p.port}`,
  connect_tube: (p, L) => `connecting ${p.device} ${p.port} tubing to ${L(p.container)}`,
  rinse_probe: (p) => `rinsing the ${p.device} probe`,
  empty_and_clean: (p, L) => `emptying and cleaning ${L(p.container)}`,
  dilute_to_mark: (p, L) => `diluting ${L(p.container)} to the mark with water`,
  filter: (p, L) => `vacuum-filtering ${L(p.src)}: solid stays in ${L(p.filter)}, filtrate to ${L(p.dst)}`,
  dry: (p, L) => `drying ${L(p.container)}`,
  observe: (p, L) => `observing ${L(p.container)}`,
  read_volume: (p, L) => `reading the graduation on ${L(p.container)}`,
  separate_phases: (p, L) => `separating phases: aqueous to ${L(p.aq_dst)}, organic to ${L(p.org_dst)}`,
  attach_condenser: (p, L) => `fitting a reflux condenser to ${L(p.container)}`,
  attach_distillation: (p, L) => `fitting a distillation setup to ${L(p.container)}, distillate to ${L(p.receiver)}`,
  purge_inert: (p, L) => `evacuating ${L(p.container)} and backfilling with inert gas`,
  attach_gas_balloon: (p, L) => `attaching a ${p.gas} balloon to ${L(p.container)}`,
  column_chromatography: (p, L) => `running ${L(p.src)} through a column, collecting ${p.target} in ${L(p.dst)}`,
  recrystallize: (p, L) => `recrystallising ${L(p.src)}, crystals to ${L(p.dst)}`,
  tlc: (p, L) => `spotting a TLC plate from ${L(p.container)}`,
};

function fxLabel(f) {
  return (id) => {
    const c = f.containers[id];
    if (c) return `${id}${c.label && c.label !== id ? ` (${c.label.replace(/[（(].*?[）)]/g, "").slice(0, 14)})` : ""}`;
    return id;
  };
}

// —— narration: what is being done now, what devices are doing
function narrate(f) {
  const L = fxLabel(f);
  const lines = [];
  const a = f.activity;
  if (a) {
    const who = a.executor_kind === "robot_arm" ? `🤖 ${a.executor}` : a.executor_kind === "real_human" ? `🧑‍🔬 ${a.executor} (offline)`
      : a.executor_kind === "passive" ? "⏳" : `🧑‍🔬 ${a.executor}`;
    const txt = (SKILL_TEXT[a.skill] || ((p) => `${a.skill} (${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(", ")})`))(a.params, L);
    const dur = Math.max(1, a.t_end - a.t_start), prog = Math.max(0, Math.min(1, (f.t - a.t_start) / dur));
    lines.push({ who, txt, prog, left: Math.max(0, a.t_end - f.t) });
  }
  const dev = [];
  for (const [id, d] of Object.entries(f.devices)) {
    const c = d.category;
    if (c === "hotplate_stirrer") {
      const sp = d.setpoints?.["set_temperature.temperature"], T = best(d, "probe_temperature") ?? best(d, "plate_temperature");
      const heating = (best(d, "plate_temperature") ?? 22) > 35;
      const rpm = best(d, "speed") ?? 0;
      if (heating) dev.push(`🔥 ${id} heating${sp != null ? ` → ${fmt(sp, 3)} °C` : ""} (now ${fmt(T, 3)} °C)`);
      if (rpm > 50) dev.push(`🌀 ${id} stirring ${fmt(rpm, 3)} rpm`);
    } else if (c === "syringe_pump" && (best(d, "running") ?? 0) > 0) {
      dev.push(`💧 ${id} dosing (${fmt(best(d, "dispensed_volume"), 3)} mL added)`);
    } else if (c === "thermostatic_bath" && f.containers && Object.values(f.containers).some((x) => x.location === id)) {
      dev.push(`🌡 ${id} holding ${fmt(best(d, "bath_temperature"), 3)} °C`);
    } else if (c === "cold_bath" && best(d, "bath_temperature") != null) {
      dev.push(`🧊 ${id} cold bath ${fmt(best(d, "bath_temperature"), 3)} °C (${best(d, "mixture") ?? ""})`);
    } else if (c === "rotary_evaporator" && (best(d, "running") ?? 0) > 0) {
      dev.push(`↻ ${id} evaporating (${fmt(best(d, "pressure"), 3)} mbar, ${fmt(best(d, "evaporated"), 3)} mL removed)`);
    } else if (c === "microwave_reactor" && (best(d, "running") ?? 0) > 0) {
      dev.push(`📡 ${id} microwave ${fmt(best(d, "temperature"), 3)} °C / ${fmt(best(d, "pressure"), 2)} bar`);
    } else if (c === "flow_reactor" && (best(d, "pumping") ?? 0) > 0) {
      dev.push(`➰ ${id} continuous flow ${fmt(best(d, "flow_total"), 3)} mL/min, τ ${fmt((best(d, "residence_time") ?? 0) / 60, 2)} min`);
    } else if (c === "photoreactor" && (best(d, "power") ?? 0) > 0) {
      dev.push(`💡 ${id} light ${fmt(best(d, "power"), 3)}%`);
    } else if (c === "potentiostat" && (best(d, "current") ?? 0) > 0) {
      dev.push(`⚡ ${id} electrolysis ${fmt(best(d, "current"), 3)} mA`);
    } else if (c === "liquid_handler" && (best(d, "running") ?? 0) > 0) {
      dev.push(`🤖 ${id}: ${best(d, "last_action") ?? "moving"}`);
    } else if (c === "heater_shaker" && (best(d, "speed") ?? 0) > 0) {
      dev.push(`〰 ${id} shaking ${fmt(best(d, "speed"), 4)} rpm (latch ${best(d, "latch") === "closed" ? "closed" : "open"})`);
    } else if (c === "contact_angle_stage" && (best(d, "running") ?? 0) > 0) {
      dev.push(`📷 ${id} imaging droplet`);
    } else if (c === "proxy_viscometer" && (best(d, "running") ?? 0) > 0) {
      dev.push(`⚖ ${id} balance recording dispense curve (10 s)`);
    } else if (["hplc", "gc", "nmr", "ms", "ftir", "melting_point"].includes(c) && (best(d, "running") ?? 0) > 0) {
      dev.push(`🔬 ${id} analysing…`);
    }
  }
  for (const [cid, c] of Object.entries(f.containers)) {
    if (!S.operator || !c.truth) continue;
    if ((c.attachments || []).includes("condenser") && c.truth.temperature_C > 60) dev.push(`♨ ${cid} refluxing (${fmt(c.truth.temperature_C, 3)} °C)`);
    if (c.truth.precipitate) dev.push(`❄ ${cid} has precipitate`);
  }
  return { lines, dev };
}

function renderNarration(f) {
  const box = document.getElementById("narr");
  if (!box) return;
  if (!f || S.mode === "live" || S.mode === "replay") { box.hidden = true; return; }   // run / replay: status goes into the top-right run panel
  const { lines, dev } = narrate(f);
  let h = "";
  if (lines.length) {
    const l = lines[0];
    h += `<div class="n-main"><span class="n-who">${esc(l.who)}</span> is ${esc(l.txt)}`
      + `<span class="n-left">${l.left > 1 ? `about ${fmt(l.left, 2)} s left` : ""}</span></div>`
      + `<div class="n-bar"><i style="width:${(l.prog * 100).toFixed(0)}%"></i></div>`;
  } else {
    const ev = (S.events || []).filter((e) => e.seq < f.event_seq && !e.truth_only &&
      /command|record|task_finished|robot|operator|divergence|plan_/.test(e.type)).slice(-1)[0];
    const recent = ev && typeof summ === "function" ? summ(ev) : "";
    h += `<div class="n-main n-idle">${recent ? `Just now: ${esc(recent)}` : (dev.length ? "Waiting: devices running" : "Idle")}</div>`;
  }
  if (dev.length) h += `<div class="n-dev">${dev.slice(0, 5).map(esc).join(" · ")}</div>`;
  box.innerHTML = h;
  box.hidden = false;
}

// —— animation layer
function fxEl(tag, attrs, parent) {
  const e = document.createElementNS(FX_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function arcPath(x0, y0, x1, y1, lift = 140) {
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - lift;
  return `M${x0},${y0} Q${mx},${my} ${x1},${y1}`;
}
function movers(g, d, n, cls, attrs, dur = 1.4) {
  for (let i = 0; i < n; i++) {
    const m = fxEl(attrs.shape || "circle", { class: cls, ...(attrs.shape === "rect" ? { x: -4, y: -4, width: 8, height: 8, rx: 2 } : { r: attrs.r || 5 }),
      fill: attrs.fill || "#9fd0e6" }, g);
    fxEl("animateMotion", { dur: `${dur}s`, repeatCount: "indefinite", path: d, begin: `${(i * dur / n).toFixed(2)}s` }, m);
  }
}

function targetPoint(f, loc) {
  const geo = S.geo; if (!geo) return null;
  if (geo.mode === "top") {
    if (geo.holders[loc]) return { x: geo.holders[loc].x, y: geo.holders[loc].y };
    const s = S.static?.slots?.[loc];
    if (s) return { x: s.x_mm, y: s.y_mm };
    if (loc === "storage") return { x: geo.b.x0 - 260, y: geo.b.y0 + 300 };
    return null;
  }
  if (geo.holders[loc]) return { x: geo.holders[loc].x, y: geo.holders[loc].y };
  const st = S.static, s = st?.slots?.[loc];
  if (s) return { x: s.x_mm, y: baseY(geo.b, s.y_mm) };
  if (loc === "storage") return { x: geo.b.x0 - 360, y: -(geo.b.y1 - geo.b.y0) * DEPTH + 60 };
  return null;
}

function fxSignature(f) {
  const a = f.activity;
  const devs = Object.entries(f.devices).map(([id, d]) => [id, d.category,
    Math.round(best(d, "plate_temperature") ?? 0) > 35, (best(d, "running") ?? 0) > 0, (best(d, "pumping") ?? 0) > 0, d.anim?.phase ?? "",
    (best(d, "power") ?? 0) > 0, d.connections?.out ?? "", d.connections?.probe ?? "", d.connections?.cell ?? "",
    (best(d, "speed") ?? 0) > 50, (best(d, "current") ?? 0) > 0, Math.round(best(d, "wavelength") ?? 0), (best(d, "pressure") ?? 1) > 1.5,
    Math.round((best(d, "temperature") ?? 22) / 40)]);
  const hot = Object.entries(f.containers).map(([k, c]) => [k, c.location, Math.round(c.truth?.temperature_C ?? 22) > 60,
    (c.attachments || []).join(",")]);
  let nCmd = 0;                                       // a new device command (e.g. sparge → record) can change the animation
  for (const e of S.events || []) { if (e.seq >= (f.event_seq ?? Infinity)) break; if (e.type === "command") nCmd++; }
  return JSON.stringify([S.view, S.operator, a && [a.skill, a.params, a.executor], devs, hot, (f.executors || []).map((e) => e.id), nCmd,
    S.vb && [S.vb.x, S.vb.y, S.vb.w, S.vb.h]]);
}

function renderFx(f) {
  const svg = document.getElementById("fx");
  if (!svg) return;
  if (!f || S.view === "table" || !S.geo || S.geo.mode !== S.view) { svg.innerHTML = ""; S.fxSig = null; return; }
  const TOP = S.geo.mode === "top";
  const v = S.vb; if (v) svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  const sig = fxSignature(f);
  if (sig === S.fxSig) return;                // unchanged: let running animations continue
  S.fxSig = sig;
  svg.innerHTML = "";
  const g = fxEl("g", {}, svg);
  const pos = S.geo.pos, holders = S.geo.holders;
  const a = f.activity;
  const P = a?.params || {};
  const top = (cid) => pos[cid] && (TOP ? { x: pos[cid].x, y: pos[cid].y } : { x: pos[cid].x, y: pos[cid].top - 6 });
  const LIFT = TOP ? 0.35 : 1;          // arcs lift less in top view
  const color = (cid) => (f.containers[cid] ? liquidColor(f.containers[cid]) : "#9fd0e6");

  // ---- current tasks
  if (a) {
    const s = a.skill;
    if ((s === "transfer_liquid" || s === "dilute_to_mark") && (top(P.src) || s === "dilute_to_mark") && top(P.dst || P.container)) {
      const dst = top(P.dst || P.container);
      const src = s === "dilute_to_mark" ? { x: dst.x + 120, y: dst.y - 160 } : top(P.src);
      const d = arcPath(src.x, src.y, dst.x, dst.y, 120 * LIFT);
      fxEl("path", { d, class: "fx-stream", stroke: color(P.src || "water") }, g);
      movers(g, d, 6, "fx-drop", { fill: color(P.src || "water"), r: 5 }, 1.2);
      fxEl("circle", { cx: dst.x, cy: dst.y + 10, r: 16, class: "fx-splash" }, g);
    } else if (s === "transfer_solid" && top(P.src) && top(P.dst)) {
      const d = arcPath(top(P.src).x, top(P.src).y, top(P.dst).x, top(P.dst).y, 110 * LIFT);
      fxEl("path", { d, class: "fx-guide" }, g);
      movers(g, d, 5, "fx-grain", { shape: "rect", fill: "#f4f1e6" }, 1.5);
    } else if (s === "place_container" && pos[P.container]) {
      const t = targetPoint(f, P.location);
      if (t) {
        const p0 = pos[P.container];
        const d = TOP ? arcPath(p0.x, p0.y, t.x, t.y, 80) : arcPath(p0.x, p0.y - p0.h / 2, t.x, t.y - p0.h / 2, 200);
        fxEl("path", { d, class: "fx-guide", "marker-end": "url(#fxArrow)" }, g);
        const ghost = fxEl("rect", { x: -18, y: -24, width: 36, height: 48, rx: 8, class: "fx-ghost" }, g);
        fxEl("animateMotion", { dur: "1.8s", repeatCount: "indefinite", path: d }, ghost);
      }
    } else if (s === "filter" && top(P.src)) {
      const ft = top(P.filter) || top(P.dst);
      if (ft) {
        const d = arcPath(top(P.src).x, top(P.src).y, ft.x, ft.y, 100 * LIFT);
        fxEl("path", { d, class: "fx-stream", stroke: color(P.src) }, g);
        movers(g, d, 4, "fx-grain", { shape: "rect", fill: "#f4f1e6" }, 1.6);
      }
    } else if (s === "separate_phases" && top(P.src)) {
      for (const [k, col] of [["aq_dst", color(P.src)], ["org_dst", "#e8d98a"]]) {
        const t = top(P[k]); if (!t) continue;
        const d = arcPath(top(P.src).x, top(P.src).y + (TOP ? 0 : 30), t.x, t.y, 60 * LIFT + (TOP ? 40 : 0));
        fxEl("path", { d, class: "fx-stream", stroke: col }, g);
        movers(g, d, 4, "fx-drop", { fill: col, r: 4 }, 1.4);
      }
    } else if ((s === "column_chromatography" || s === "recrystallize") && top(P.src) && top(P.dst)) {
      const d = arcPath(top(P.src).x, top(P.src).y, top(P.dst).x, top(P.dst).y, 160 * LIFT);
      fxEl("path", { d, class: "fx-guide" }, g);
      movers(g, d, 5, s === "recrystallize" ? "fx-grain" : "fx-drop", s === "recrystallize" ? { shape: "rect", fill: "#ffffff" } : { fill: "#e8d98a" }, 1.8);
    } else if ((s === "attach_probe" || s === "connect_tube") && holders[P.device] && top(P.container)) {
      const h = holders[P.device], t = top(P.container);
      fxEl("path", { d: arcPath(h.x, h.y - (TOP ? 0 : 20), t.x, t.y, 120 * LIFT), class: "fx-link" }, g);
    }
    // container being handled: pulse ring
    for (const cid of [P.container, P.src, P.dst, P.filter].filter(Boolean)) {
      if (!pos[cid]) continue;
      if (TOP) fxEl("circle", { cx: pos[cid].x, cy: pos[cid].y, r: pos[cid].w + 18, class: "fx-ping" }, g);
      else fxEl("ellipse", { cx: pos[cid].x, cy: pos[cid].y + 4, rx: pos[cid].w + 16, ry: 12, class: "fx-ping" }, g);
    }
  }

  // ---- top view: human walks along the bench front to the work spot (remembers the last spot, moves smoothly)
  if (TOP) {
    S.avx = S.avx || {};
    const humans = (f.executors || []).filter((e) => /human/.test(e.kind));
    const yRow = S.geo.b.y1 + 55;
    humans.forEach((e, i) => {
      const busy = a && a.executor === e.id;
      let tx = S.avx[e.id] ?? (S.geo.b.x0 + 150 + i * 160);
      let tgt = null;
      if (busy) {
        for (const k of ["dst", "container", "filter", "location", "src"]) {
          const v = P[k];
          if (v && pos[v]) { tgt = pos[v]; break; }
          if (v && holders[v]) { tgt = holders[v]; break; }
        }
        if (tgt) tx = tgt.x;
      }
      const x0 = S.avx[e.id] ?? tx;
      const av = fxEl("g", { class: "fx-avatar" }, g);
      const head = fxEl("circle", { cx: x0, cy: yRow, r: 36, class: "fx-head" }, av);
      const name = fxEl("text", { x: x0, y: yRow + 64, class: "fx-name" }, av);
      name.textContent = e.id + (busy ? " (busy)" : "");
      if (x0 !== tx) {
        for (const [el_, attr] of [[head, "cx"], [name, "x"]])
          fxEl("animate", { attributeName: attr, from: x0, to: tx, dur: "0.9s", fill: "freeze" }, el_);
      }
      if (busy && tgt) {
        const arm = fxEl("line", { x1: tx, y1: yRow - 36, x2: tgt.x, y2: tgt.y + 20, class: "fx-reach" }, av);
        fxEl("animate", { attributeName: "x1", from: x0, to: tx, dur: "0.9s", fill: "freeze" }, arm);
      }
      S.avx[e.id] = tx;
    });
  }

  // ---- ongoing device actions
  for (const [id, d] of Object.entries(f.devices)) {
    const h = holders[id]; if (!h) continue;
    const here = Object.entries(f.containers).filter(([, c]) => c.location === id).map(([k]) => k);
    if (d.category === "hotplate_stirrer" && (best(d, "plate_temperature") ?? 22) > 35) {
      const T = best(d, "plate_temperature");
      const hot = Math.min(1, (T - 35) / 200);
      if (TOP) fxEl("circle", { cx: h.x, cy: h.y - 20, r: 72, class: "fx-glow", fill: `rgb(255,${Math.round(170 - 110 * hot)},60)` }, g);
      else fxEl("ellipse", { cx: h.x, cy: h.y + 2, rx: 60, ry: 10, class: "fx-glow", fill: `rgb(255,${Math.round(170 - 110 * hot)},60)` }, g);
    }
    if (d.category === "syringe_pump" && (best(d, "running") ?? 0) > 0 && (!d.anim || d.anim.phase === "push")
        && d.connections?.out && top(d.connections.out)) {            // the outlet drips only when infusing (not when withdrawing / refilling)
      const t = top(d.connections.out);
      for (let i = 0; i < 3; i++) {
        const dr = TOP ? fxEl("circle", { cx: t.x, cy: t.y, r: 10, class: "fx-ripple", style: `animation-delay:${i * 0.33}s` }, g)
          : fxEl("circle", { cx: S.tubeEnds?.[id]?.x ?? t.x + 6, cy: (S.tubeEnds?.[id]?.y ?? t.y - 40) + 4, r: 4, class: "fx-fall", fill: color(d.connections.in), style: `animation-delay:${i * 0.33}s` }, g);
        void dr;
      }
    }
    if (d.category === "rotary_evaporator" && (best(d, "running") ?? 0) > 0) {
      fxEl("path", { d: `M${h.x - 26},${h.y - 30} a26,26 0 1,1 0,1`, class: "fx-rotate" }, g);
    }
    if (d.category === "microwave_reactor" && (best(d, "power") ?? 0) > 0) {
      for (let i = 0; i < 3; i++) fxEl("circle", { cx: h.x, cy: h.y - 20, r: 20, class: "fx-wave", style: `animation-delay:${i * 0.4}s` }, g);
    }
    if (d.category === "flow_reactor" && (best(d, "pumping") ?? 0) > 0) {
      const cx = h.x + 60, cy = h.y - 40;
      const d0 = `M${cx - 60},${cy} a60,24 0 1,1 120,0 a60,24 0 1,1 -120,0`;
      movers(g, d0, 6, "fx-drop", { fill: "#c9a3e6", r: 4 }, 2.4);
    }
    if (d.category === "gas_burette" && d.connections?.in) {
      const t = top(d.connections.in);
      if (t) for (let i = 0; i < 3; i++) fxEl("circle", { cx: t.x - 8 + i * 8, cy: t.y + 30, r: 3, class: "fx-bubble", style: `animation-delay:${i * 0.5}s` }, g);
    }
    void here;
  }
  // ---- boiling / reflux
  for (const [cid, c] of Object.entries(f.containers)) {
    const p = pos[cid]; if (!p || !c.truth) continue;
    const T = c.truth.temperature_C ?? 22;
    if (T > 60 && (c.truth.volume_mL ?? 0) > 0) {
      for (let i = 0; i < 4; i++) fxEl("circle", TOP ? { cx: p.x + Math.cos(i * 1.6) * p.w * 0.45, cy: p.y + Math.sin(i * 1.6) * p.w * 0.45, r: 4,
        class: "fx-ripple", style: `animation-delay:${i * 0.3}s` } : { cx: p.x - p.w * 0.4 + i * p.w * 0.27, cy: p.y - 8, r: 3, class: "fx-bubble",
        style: `animation-delay:${i * 0.3}s` }, g);
    }
    if (!TOP && (c.attachments || []).includes("condenser") && T > 60) {
      for (let i = 0; i < 2; i++) fxEl("circle", { cx: p.x, cy: p.top - 60, r: 3, class: "fx-fall", fill: "#bfe3f2", style: `animation-delay:${i * 0.6}s` }, g);
    }
  }
  if (typeof fxMore === "function") fxMore({ g, f, TOP, pos, holders, a, P, top, color, arcPath, movers });   // fxmore.js
}
