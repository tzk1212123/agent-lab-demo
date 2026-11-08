// More action animations for the #fx overlay (called at the end of renderFx in fx.js).
// Operations: stir bar drop, probe in / out and rinse, emptying and cleaning, drying, observing / reading graduations,
// condenser / distillation / balloon / inert-gas setup, TLC spotting.
// Instruments (only while they are actually working): stirring vortex, spectrophotometer beam, probe readings, baths,
// chromatographs, NMR, MS, photoreactor light, electrolysis bubbles, melting point / furnace / TGA heat, DLS laser,
// plate-reader scan, contact-angle / tensiometer drop and camera flash, foam rising, OT-2 pipetting, viscometer drip,
// pressure-reactor gauge, balance settling.
// Everything is positioned from S.geo (container points `pos`, holder points `holders`, instrument outlines `boxes`).
"use strict";

function fxWaveColor(nm) { return typeof mWaveColor === "function" ? mWaveColor(nm) : "#ffe9b0"; }

function fxMore(ctx) {
  const { g, f, TOP, pos, holders, a, P, top, color } = ctx;
  const boxes = S.geo.boxes || {};
  const E = fxEl;
  const here = (id) => Object.entries(f.containers).filter(([, c]) => c.location === id).map(([k]) => k);
  const on = (d, k) => (best(d, k) ?? 0) > 0;
  const lastCmd = (id) => {                                              // the device's most recent command up to this frame
    let c = null;
    for (const e of S.events || []) { if (e.seq >= (f.event_seq ?? Infinity)) break; if (e.type === "command" && e.device === id) c = e.command; }
    return c;
  };

  // ---------------------------------------------------------------- operations in progress
  if (a) {
    const s = a.skill;
    if (s === "add_stir_bar" && top(P.container)) {                       // a white stir bar dropped in
      const t = top(P.container);
      const bar = E("rect", { x: -9, y: -3, width: 18, height: 6, rx: 3, class: "fx-stirbar" }, g);
      E("animateMotion", { dur: "1.1s", repeatCount: "indefinite", path: `M${t.x + 40},${t.y - 120} Q${t.x + 10},${t.y - 140} ${t.x},${t.y + 14}` }, bar);
    } else if ((s === "attach_probe" || s === "detach_probe") && holders[P.device]) {
      const c = s === "attach_probe" ? top(P.container) : null;
      const anchor = c || holders[P.device];
      const dir = s === "attach_probe" ? 1 : -1;                          // probe slides down into / up out of the liquid
      const tip = E("line", { x1: anchor.x - 8, y1: anchor.y - 70, x2: anchor.x - 8, y2: anchor.y - 10, class: "fx-probe" }, g);
      E("animateTransform", { attributeName: "transform", type: "translate", values: `0 ${-40 * dir};0 ${20 * dir};0 ${-40 * dir}`, dur: "1.6s", repeatCount: "indefinite" }, tip);
    } else if (s === "rinse_probe" && holders[P.device]) {                // wash-bottle squirts over the probe
      const h = holders[P.device];
      const d = `M${h.x + 70},${h.y - 90} Q${h.x + 30},${h.y - 110} ${h.x},${h.y - 30}`;
      E("path", { d, class: "fx-stream", stroke: "#cfe9f7" }, g);
      ctx.movers(g, d, 5, "fx-drop", { fill: "#cfe9f7", r: 4 }, 0.9);
    } else if (s === "empty_and_clean" && top(P.container)) {            // tipped out to waste, then rinsed
      const t = top(P.container);
      const sink = TOP ? { x: S.geo.b.x0 - 200, y: t.y } : { x: S.geo.b.x0 - 220, y: 20 };
      const d = ctx.arcPath(t.x, t.y, sink.x, sink.y, TOP ? 60 : 80);
      E("path", { d, class: "fx-stream", stroke: color(P.container) }, g);
      ctx.movers(g, d, 5, "fx-drop", { fill: color(P.container), r: 5 }, 1.0);
      for (let i = 0; i < 4; i++) E("circle", { cx: t.x - 12 + i * 8, cy: t.y + 24, r: 4, class: "fx-bubble", style: `animation-delay:${i * 0.25}s` }, g);
    } else if (s === "dry" && top(P.container)) {                         // drying oven: heat haze
      const t = top(P.container);
      for (let i = 0; i < 3; i++) E("path", { d: `M${t.x - 20 + i * 20},${t.y} q8,-14 0,-28 q-8,-14 0,-28`, class: "fx-haze", style: `animation-delay:${i * 0.35}s` }, g);
    } else if ((s === "observe" || s === "read_volume") && top(P.container)) {   // looking closely at the vessel
      const t = top(P.container);
      E("circle", { cx: t.x + 46, cy: t.y + 20, r: 26, class: "fx-lens" }, g);
      E("line", { x1: t.x + 64, y1: t.y + 38, x2: t.x + 86, y2: t.y + 60, class: "fx-lens" }, g);
      if (s === "read_volume") E("line", { x1: t.x - 30, y1: t.y + 40, x2: t.x + 30, y2: t.y + 40, class: "fx-meniscus" }, g);
    } else if ((s === "attach_condenser" || s === "attach_distillation") && top(P.container)) {
      const t = top(P.container);
      const col = E("rect", { x: t.x - 10, y: t.y - 180, width: 20, height: 150, rx: 8, class: "fx-ghost" }, g);   // glassware lowered on
      E("animateTransform", { attributeName: "transform", type: "translate", values: "0 -60;0 0;0 0", dur: "1.8s", repeatCount: "indefinite" }, col);
      if (s === "attach_distillation" && top(P.receiver)) E("path", { d: ctx.arcPath(t.x, t.y - 170, top(P.receiver).x, top(P.receiver).y, 40), class: "fx-guide" }, g);
    } else if (s === "attach_gas_balloon" && top(P.container)) {          // balloon inflates on a needle
      const t = top(P.container);
      E("line", { x1: t.x, y1: t.y, x2: t.x, y2: t.y - 70, class: "fx-probe" }, g);
      E("circle", { cx: t.x, cy: t.y - 100, r: 30, class: "fx-balloon" }, g);
    } else if (s === "purge_inert" && top(P.container)) {                // evacuate ↔ backfill cycles
      const t = top(P.container);
      for (const [dx, cls] of [[-14, "fx-gas-out"], [14, "fx-gas-in"]])
        for (let i = 0; i < 3; i++) E("circle", { cx: t.x + dx, cy: t.y - 20, r: 4, class: cls, style: `animation-delay:${i * 0.4}s` }, g);
    } else if (s === "syringe_transfer" && top(P.src) && top(P.dst)) {   // needle / cannula: thin sealed line, no open pour
      const d = ctx.arcPath(top(P.src).x, top(P.src).y, top(P.dst).x, top(P.dst).y, 90);
      E("path", { d, class: "fx-cannula" }, g);
      ctx.movers(g, d, 4, "fx-drop", { fill: color(P.src), r: 3 }, 1.4);
    } else if (s === "dry_glassware" && top(P.container)) {             // heat gun / oven on the empty glassware
      const t = top(P.container);
      for (let i = 0; i < 3; i++) E("path", { d: `M${t.x - 20 + i * 20},${t.y + 20} q8,-14 0,-28 q-8,-14 0,-28`, class: "fx-haze", style: `animation-delay:${i * 0.3}s` }, g);
      E("path", { d: ctx.arcPath(t.x + 110, t.y - 40, t.x + 20, t.y + 10, 20), class: "fx-ray fx-hot" }, g);
    } else if ((s === "detach_condenser" || s === "detach_distillation") && top(P.container)) {   // glassware lifted off
      const t = top(P.container);
      const col = E("rect", { x: t.x - 10, y: t.y - 180, width: 20, height: 150, rx: 8, class: "fx-ghost" }, g);
      E("animateTransform", { attributeName: "transform", type: "translate", values: "0 0;0 -70;0 -70", dur: "1.8s", repeatCount: "indefinite" }, col);
    } else if (s === "open_to_air" && top(P.container)) {                 // septum off: air drifts in
      const t = top(P.container);
      for (let i = 0; i < 3; i++) E("circle", { cx: t.x - 10 + i * 10, cy: t.y - 20, r: 4, class: "fx-gas-in fx-air", style: `animation-delay:${i * 0.35}s` }, g);
    } else if (s === "move_plate" && top(P.src)) {                        // whole plate carried to the reader / deck
      const t = ctx.top(P.dst) || (S.geo.holders[P.dst] && { x: S.geo.holders[P.dst].x, y: S.geo.holders[P.dst].y });
      if (t) {
        const d = ctx.arcPath(top(P.src).x, top(P.src).y, t.x, t.y, 120);
        E("path", { d, class: "fx-guide", "marker-end": "url(#fxArrow)" }, g);
        const plate = E("rect", { x: -40, y: -10, width: 80, height: 20, rx: 4, class: "fx-ghost" }, g);
        E("animateMotion", { dur: "1.8s", repeatCount: "indefinite", path: d }, plate);
      }
    } else if (s === "service_device" && S.geo.holders[P.device]) {     // maintenance: wrench pulse on the instrument
      const h = S.geo.holders[P.device];
      E("circle", { cx: h.x, cy: h.y - 30, r: 34, class: "fx-ping" }, g);
      const w = E("text", { x: h.x, y: h.y - 20, class: "fx-tool" }, g); w.textContent = "🔧";
    } else if (s === "tlc" && top(P.container)) {                         // capillary spot onto a plate
      const t = top(P.container), px = t.x + 90, py = t.y + 10;
      E("rect", { x: px - 22, y: py - 40, width: 44, height: 70, rx: 3, class: "fx-tlc" }, g);
      E("circle", { cx: px, cy: py + 18, r: 4, class: "fx-spot" }, g);
      E("path", { d: ctx.arcPath(t.x, t.y, px, py + 14, 50), class: "fx-guide" }, g);
    }
  }

  // ---------------------------------------------------------------- instruments at work
  for (const [id, d] of Object.entries(f.devices)) {
    const b = boxes[id], h = holders[id];
    if (!b || !h) continue;
    const cat = d.category, onIt = here(id);
    const busy = on(d, "running");

    if ((cat === "hotplate_stirrer" || cat === "pressure_reactor") && (best(d, "speed") ?? 0) > 50) {   // stirring: vortex dip + swirling particles
      const rpm = best(d, "speed");
      for (const cid of onIt) {
        const p = pos[cid]; if (!p) continue;
        if (TOP) { E("ellipse", { cx: p.x, cy: p.y, rx: Math.max(10, p.w * 0.32), ry: Math.max(10, p.w * 0.32), class: "fx-swirl" }, g); continue; }
        const ys = p.level ?? (p.y - p.h * 0.4), half = p.w * 0.36, dip = Math.min(p.h * 0.25, 6 + rpm / 60);
        if (p.y - ys < 6) continue;                                       // (almost) empty: nothing to stir
        E("path", { d: `M${p.x - half},${ys} Q${p.x - half * 0.3},${ys} ${p.x},${ys + dip} Q${p.x + half * 0.3},${ys} ${p.x + half},${ys}`, class: "fx-vortex" }, g);
        const orbit = `M${p.x - half * 0.7},${ys + (p.y - ys) * 0.5} a${half * 0.7},${Math.max(4, (p.y - ys) * 0.12)} 0 1,0 ${half * 1.4},0 a${half * 0.7},${Math.max(4, (p.y - ys) * 0.12)} 0 1,0 ${-half * 1.4},0`;
        ctx.movers(g, orbit, 3, "fx-speck", { r: 2.5, fill: "#ffffff" }, Math.max(0.4, 60 / rpm * 1.2));
      }
    }
    if (cat === "spectrophotometer" && onIt.length) {                    // light beam through the cuvette at the set wavelength
      const y = TOP ? b.T + b.H * 0.5 : b.T + b.H * 0.35;
      E("line", { x1: b.L + b.W * 0.08, y1: y, x2: b.L + b.W * 0.92, y2: y, class: "fx-beam", stroke: fxWaveColor(best(d, "wavelength")) }, g);
    }
    if (["ph_meter", "conductivity_meter", "ion_meter", "orp_meter", "optrode"].includes(cat) && d.connections?.probe && top(d.connections.probe)) {
      const t = top(d.connections.probe);                                // live reading pulse at the probe tip
      E("circle", { cx: t.x - 10, cy: t.y + (TOP ? 0 : 30), r: 7, class: "fx-sense" }, g);
    }
    if (cat === "balance" && onIt.length) {                              // display settling while something sits on the pan
      E("rect", { x: b.L + b.W * 0.2, y: (TOP ? b.T + b.H * 0.8 : b.yb - 18), width: b.W * 0.6, height: 6, rx: 3, class: "fx-settle" }, g);
    }
    if (cat === "cold_bath") {                                           // cold vapour rolling off the bath
      for (let i = 0; i < 3; i++) E("ellipse", { cx: b.L + b.W * (0.3 + i * 0.2), cy: b.T, rx: 18, ry: 8, class: "fx-fog", style: `animation-delay:${i * 0.5}s` }, g);
    }
    if (["hplc", "gc", "gpc"].includes(cat) && busy) {                   // mobile phase / carrier gas flowing through the column
      const y = TOP ? b.T + b.H * 0.5 : b.T + b.H * 0.45;
      const path = `M${b.L + b.W * 0.1},${y} H${b.L + b.W * 0.9}`;
      ctx.movers(g, path, 6, "fx-drop", { fill: cat === "gc" ? "#ffe9b0" : "#9fd0e6", r: 4 }, 1.8);
      E("path", { d: `M${b.L + b.W * 0.12},${y + 30} h${b.W * 0.2} l8,-26 l8,26 h${b.W * 0.12} l6,-14 l6,14 h${b.W * 0.2}`, class: "fx-trace" }, g);
    }
    if (cat === "nmr" && busy) {                                         // RF pulse rings over the magnet
      for (let i = 0; i < 3; i++) E("circle", { cx: b.x, cy: TOP ? b.T + b.H / 2 : b.T + b.H * 0.25, r: 24, class: "fx-wave fx-cool", style: `animation-delay:${i * 0.4}s` }, g);
    }
    if (cat === "ms" && busy) {                                          // electrospray plume
      const sx = b.L + b.W * 0.15, sy = TOP ? b.T + b.H / 2 : b.T + b.H * 0.4;
      ctx.movers(g, `M${sx},${sy} Q${sx + b.W * 0.3},${sy - 30} ${b.L + b.W * 0.7},${sy}`, 7, "fx-drop", { fill: "#d8b4ff", r: 3 }, 1.0);
    }
    if (cat === "photoreactor" && on(d, "power")) {                      // blue light onto the vessel
      for (const cid of onIt.length ? onIt : [null]) {
        const p = cid && pos[cid];
        const tx = p ? p.x : b.x, ty = p ? p.y : b.T + b.H / 2;
        for (let i = -1; i <= 1; i++) E("line", { x1: b.L + b.W * 0.1, y1: ty - 30 + i * 20, x2: tx, y2: ty + i * 6, class: "fx-ray" }, g);
      }
    }
    if (cat === "potentiostat" && d.connections?.cell && top(d.connections.cell) && (busy || on(d, "current"))) {
      const t = top(d.connections.cell);                                 // gas bubbles at the electrodes
      for (let i = 0; i < 4; i++) E("circle", { cx: t.x - 12 + i * 8, cy: t.y + (TOP ? 0 : 40), r: 3, class: "fx-bubble", style: `animation-delay:${i * 0.3}s` }, g);
    }
    if (["melting_point", "furnace", "tga"].includes(cat) && (busy || (best(d, "temperature") ?? 22) > 80)) {
      for (let i = 0; i < 3; i++) E("path", { d: `M${b.L + b.W * (0.35 + i * 0.15)},${b.T - 4} q7,-14 0,-28 q-7,-14 0,-28`, class: "fx-haze", style: `animation-delay:${i * 0.3}s` }, g);
    }
    if (cat === "dls" && busy) {                                         // laser through the sample
      const y = TOP ? b.T + b.H * 0.4 : b.T + b.H * 0.1;
      E("line", { x1: b.L + b.W * 0.55, y1: y, x2: b.L + b.W * 0.96, y2: y, class: "fx-beam", stroke: "#ff3b3b" }, g);
    }
    if (cat === "plate_reader" && busy) {                                // read head scanning the plate
      const y = TOP ? b.T + b.H * 0.6 : b.yb - b.H * 0.3;
      const bar = E("rect", { x: b.L + b.W * 0.1, y: y - 10, width: 8, height: 20, rx: 3, class: "fx-scan" }, g);
      E("animate", { attributeName: "x", values: `${b.L + b.W * 0.1};${b.L + b.W * 0.62};${b.L + b.W * 0.1}`, dur: "1.6s", repeatCount: "indefinite" }, bar);
    }
    if ((cat === "contact_angle_stage" || cat === "tensiometer") && busy) {   // camera flash on the drop
      const p = onIt.map((k) => pos[k]).find(Boolean) || { x: b.x, y: b.T };
      E("circle", { cx: p.x, cy: (TOP ? p.y : p.y - 20), r: 30, class: "fx-flash" }, g);
    }
    if (cat === "foam_analyzer" && busy && lastCmd(id) === "record") {  // gas off, camera filming the foam collapse
      E("circle", { cx: b.L + b.W * 0.9, cy: TOP ? b.T + 20 : b.T + b.H * 0.25, r: 8, class: "fx-rec" }, g);
      E("circle", { cx: b.x, cy: TOP ? b.T + b.H / 2 : b.T + b.H * 0.5, r: 28, class: "fx-flash" }, g);
    } else if (cat === "foam_analyzer" && busy) {                        // gas stone at the bottom: bubble streams rising through the liquid
      const p = onIt.map((k) => pos[k]).find(Boolean);
      if (p && !TOP) {
        const ys = p.level ?? (p.y - p.h * 0.3);
        for (let i = 0; i < 9; i++) {
          const bx = p.x - p.w * 0.25 + (i % 3) * p.w * 0.25;
          const bub = E("circle", { cx: bx, cy: p.y - 8, r: 3 + (i % 3), class: "fx-rise" }, g);
          E("animate", { attributeName: "cy", values: `${p.y - 8};${ys}`, dur: `${1.1 + (i % 4) * 0.2}s`, begin: `${(i * 0.17).toFixed(2)}s`, repeatCount: "indefinite" }, bub);
        }
        E("ellipse", { cx: p.x, cy: ys - 4, rx: p.w * 0.42, ry: 6, class: "fx-froth" }, g);
      } else {
        const x = p ? p.x : b.x, y = p ? p.y : b.T + b.H * 0.6;
        for (let i = 0; i < 6; i++) E("circle", { cx: x - 15 + (i % 3) * 15, cy: y, r: 4 + (i % 2) * 2, class: "fx-bubble", style: `animation-delay:${i * 0.22}s` }, g);
      }
    }
    if (cat === "proxy_viscometer" && busy) {                            // viscous drip into the catch dish
      for (let i = 0; i < 2; i++) E("circle", { cx: b.L + b.W * 0.8, cy: (TOP ? b.T + b.H / 2 : b.T + b.H * 0.4), r: 5, class: "fx-fall fx-slow", fill: "#d9c79a", style: `animation-delay:${i * 0.9}s` }, g);
    }
    if (cat === "pressure_reactor" && (best(d, "pressure") ?? 1) > 1.5) {  // gauge needle trembling under pressure
      const gx = b.L + b.W * 0.85, gy = TOP ? b.T + b.H * 0.2 : b.T + b.H * 0.15;
      E("circle", { cx: gx, cy: gy, r: 16, class: "fx-gauge" }, g);
      const n = E("line", { x1: gx, y1: gy, x2: gx + 12, y2: gy - 8, class: "fx-needle" }, g);
      E("animateTransform", { attributeName: "transform", type: "rotate", values: `-8 ${gx} ${gy};8 ${gx} ${gy};-8 ${gx} ${gy}`, dur: "0.5s", repeatCount: "indefinite" }, n);
    }
  }
  fxCommands(ctx);                                                      // per-command actions (below)
}


// ---------------------------------------------------------------- per-command actions of the common instruments
// Lasting commands animate while the instrument is busy; instant ones (tare, blank, set wavelength …) play once ("fx-once")
// right after the command. The overlay redraws on every new command, so a one-shot replays exactly once.
function fxCommands(ctx) {
  const { g, f, TOP, pos, holders, top } = ctx;
  const boxes = S.geo.boxes || {}, E = fxEl;
  const failed = (e) => Object.values(e.result || {}).some((r) => r && r.ok === false);
  const last = {}; let newest = null;                                    // each device's latest successful command up to this frame
  for (const e of S.events || []) {
    if (e.seq >= (f.event_seq ?? Infinity)) break;
    if (e.type === "command" && !failed(e)) { last[e.device] = e; newest = e; }
  }
  const lastEv = (id) => last[id] || null;
  // one-shots play right after their command, and only while it is the newest one (so they don't replay on later redraws)
  const fresh = (ev, s = 8) => ev && ev === newest && f.t - ev.t < s;
  const tag = (x, y, text, cls = "fx-tag fx-once") => { const t = E("text", { x, y, class: cls }, g); t.textContent = text; return t; };
  const devOf = (cat) => Object.entries(f.devices).find(([, d]) => d.category === cat)?.[0];

  for (const [id, d] of Object.entries(f.devices)) {
    const b = boxes[id]; if (!b) continue;
    const ev = lastEv(id), cmd = ev?.command, P = ev?.params || {}, busy = (best(d, "running") ?? 0) > 0;
    const yTop = TOP ? b.T - 10 : b.T - 18;
    switch (d.category) {
      case "balance":
        if (cmd === "tare" && fresh(ev)) tag(b.x, yTop, "→ 0.0000 g ←");
        else if (cmd === "read" && fresh(ev, 4)) tag(b.x, yTop, "read");
        break;
      case "ph_meter": case "conductivity_meter":
        if (cmd === "read" && fresh(ev, 4)) E("rect", { x: b.L + b.W * 0.1, y: TOP ? b.T + 10 : b.T + 4, width: b.W * 0.5, height: TOP ? b.H * 0.4 : b.H * 0.6, rx: 6, class: "fx-blink fx-once" }, g);
        break;
      case "spectrophotometer": {
        const y = TOP ? b.T + b.H * 0.5 : b.T + b.H * 0.35;
        if (cmd === "blank" && fresh(ev)) {                                 // zeroing: white light, display to 0
          E("line", { x1: b.L + b.W * 0.08, y1: y, x2: b.L + b.W * 0.92, y2: y, class: "fx-beam fx-once", stroke: "#ffffff" }, g);
          tag(b.x, yTop, "BLANK → A 0.000");
        } else if (cmd === "set_wavelength" && fresh(ev)) {                // monochromator turning: colour sweep to the new wavelength
          const w = +P.wavelength || 550;
          for (let i = 0; i < 6; i++) E("rect", { x: b.L + b.W * (0.2 + i * 0.1), y: yTop - 18, width: b.W * 0.1, height: 10, fill: fxWaveColor(380 + i * 60), class: "fx-once" }, g);
          tag(b.x, yTop - 26, `λ → ${w} nm`);
        } else if (cmd === "measure" && fresh(ev, 4)) {
          E("circle", { cx: b.L + b.W * 0.92, cy: y, r: 12, class: "fx-flash fx-once" }, g);
        }
        break;
      }
      case "thermostatic_bath": {
        const T = best(d, "bath_temperature") ?? 22, sp = d.setpoints?.["set_temperature.temperature"];
        const on = cmd !== "stop" && (cmd === "start" || cmd === "set_temperature" || sp != null);
        if (on) {                                                           // circulation in the bath window
          const cx = b.x, cy = TOP ? b.T + b.H / 2 : b.T + b.H * 0.3, ry = TOP ? b.H * 0.25 : 14;
          ctx.movers(g, `M${cx - b.W * 0.3},${cy} a${b.W * 0.3},${ry} 0 1,0 ${b.W * 0.6},0 a${b.W * 0.3},${ry} 0 1,0 ${-b.W * 0.6},0`, 4, "fx-speck", { r: 3, fill: "#e8f6ff" }, 2.4);
          if (sp != null && Math.abs(sp - T) > 1) tag(b.x, yTop, `${sp > T ? "▲ heating" : "▼ cooling"} → ${sp} °C`, "fx-tag");
        }
        if (T > 35 || T < 15) for (let i = 0; i < 3; i++) E("path", { d: `M${b.L + b.W * (0.25 + i * 0.25)},${b.T + 6} q6,-12 0,-24 q-6,-12 0,-24`,
          class: T > 35 ? "fx-haze" : "fx-fog", style: `animation-delay:${i * 0.4}s` }, g);
        if (cmd === "stop" && fresh(ev)) tag(b.x, yTop, "circulation off");
        break;
      }
      case "heater_shaker": {
        const T = best(d, "temperature") ?? 22, sp = d.setpoints?.["set_temperature.temperature"];
        if (cmd !== "heater_off" && ((sp != null && sp > 30) || T > 30))     // heated block
          E("ellipse", { cx: b.x, cy: TOP ? b.T + b.H / 2 : b.T + b.H * 0.4, rx: b.W * 0.45, ry: TOP ? b.H * 0.4 : 8, class: "fx-glow", fill: "rgb(255,150,60)" }, g);
        if ((cmd === "open_latch" || cmd === "close_latch") && fresh(ev)) tag(b.x, yTop, cmd === "open_latch" ? "latch open" : "latch closed");
        break;
      }
      case "plate_reader": {
        if (cmd === "set_wavelength" && fresh(ev)) E("rect", { x: b.L + b.W * 0.08, y: TOP ? b.T + b.H * 0.55 : b.yb - b.H * 0.34, width: b.W * 0.6, height: 10, rx: 3, fill: fxWaveColor(+P.wavelength), class: "fx-once" }, g);
        const sp = d.setpoints?.["set_temperature.temperature"];
        if (sp != null && sp > 30) for (let i = 0; i < 2; i++) E("path", { d: `M${b.L + b.W * (0.4 + i * 0.2)},${b.T} q6,-12 0,-24 q-6,-12 0,-24`, class: "fx-haze", style: `animation-delay:${i * 0.5}s` }, g);
        break;
      }
      case "foam_analyzer": {
        const p = Object.entries(f.containers).filter(([, c]) => c.location === id).map(([k]) => pos[k]).find(Boolean);
        if (cmd === "measure" && fresh(ev, 4)) E("circle", { cx: b.x, cy: TOP ? b.T + b.H / 2 : b.T + b.H * 0.5, r: 30, class: "fx-flash fx-once" }, g);
        if ((busy || fresh(ev, 6)) && cmd === "drain" && p) {                                 // column emptied into the rig's waste bottle
          const d0 = ctx.arcPath(p.x, p.y - 6, b.L + b.W * 0.95, b.yb - 6, 20);
          E("path", { d: d0, class: "fx-stream", stroke: "#cfe9f7" }, g);
          ctx.movers(g, d0, 4, "fx-drop", { fill: "#cfe9f7", r: 4 }, 0.9);
        }
        if ((busy || fresh(ev, 6)) && cmd === "rinse" && p) {                                 // rinse water sprayed in from the top
          const d0 = `M${p.x + 60},${p.top - 50} Q${p.x + 20},${p.top - 60} ${p.x},${p.top + 10}`;
          E("path", { d: d0, class: "fx-stream", stroke: "#e8f6ff" }, g);
          ctx.movers(g, d0, 5, "fx-drop", { fill: "#e8f6ff", r: 4 }, 0.8);
        }
        break;
      }
      case "liquid_handler": {
        if (!busy && !fresh(ev, 6)) break;
        const head = (path, dur = 2.2) => {                                // pipette tip (with a drop) following a path
          const tip = E("g", {}, g);
          E("rect", { x: -7, y: -40, width: 14, height: 30, rx: 3, class: "fx-head" }, tip);
          E("line", { x1: 0, y1: -10, x2: 0, y2: 6, class: "fx-tip" }, tip);
          E("circle", { cx: 0, cy: 9, r: 4, class: "fx-drop", fill: "#9fd0e6" }, tip);
          E("animateMotion", { dur: `${dur}s`, repeatCount: "indefinite", path }, tip);
        };
        const lift = TOP ? 40 : 110;
        const at = (cid) => cid && top(cid);
        if (cmd === "transfer" && at(P.src) && at(P.dst)) {                // aspirate at src → up → across → dispense at dst
          const s0 = at(P.src), d0 = at(P.dst);
          head(`M${s0.x},${s0.y} V${s0.y - lift} H${d0.x} V${d0.y} V${d0.y - lift} H${s0.x} V${s0.y}`, 3);
        } else if (cmd === "mix" && at(P.container)) {                     // up and down in the same well
          const c = at(P.container);
          head(`M${c.x},${c.y} V${c.y - 40} V${c.y}`, 0.8);
        } else if (cmd === "deposit_droplets" && at(P.src)) {              // drops placed on the contact-angle stage
          const st = holders[devOf("contact_angle_stage")], s0 = at(P.src);
          if (st) {
            head(`M${s0.x},${s0.y} V${s0.y - lift} H${st.x} V${st.y - 20} V${st.y - lift} H${s0.x} V${s0.y}`, 3);
            for (let i = 0; i < 3; i++) E("circle", { cx: st.x - 20 + i * 20, cy: st.y - 30, r: 4, class: "fx-fall", fill: "#9fd0e6", style: `animation-delay:${i * 0.7}s` }, g);
          }
        } else if (cmd === "image_droplets") {                             // camera picked up, side images of the drops
          const st = holders[devOf("contact_angle_stage")] || { x: b.x, y: b.T + b.H * 0.5 };
          E("circle", { cx: st.x, cy: st.y - 20, r: 30, class: "fx-flash" }, g);
          tag(st.x, st.y - 70, "📷", "fx-tag");
        } else if (cmd === "measure_viscosity" && at(P.src)) {             // slow dispense onto the balance dish
          const v = holders[devOf("proxy_viscometer")] || holders[devOf("balance")], s0 = at(P.src);
          if (v) {
            head(`M${s0.x},${s0.y} V${s0.y - lift} H${v.x} V${v.y - 30}`, 4);
            for (let i = 0; i < 2; i++) E("circle", { cx: v.x, cy: v.y - 30, r: 5, class: "fx-fall fx-slow", fill: "#d9c79a", style: `animation-delay:${i * 0.9}s` }, g);
          }
        } else if (cmd === "home") {
          head(`M${b.x},${b.T + b.H * 0.3} L${b.L + b.W * 0.15},${b.T + b.H * 0.15}`, 1.2);
        } else {
          head(`M${b.L + b.W * 0.25},${b.T + b.H * 0.4} Q${b.x},${b.T + b.H * 0.25} ${b.L + b.W * 0.75},${b.T + b.H * 0.4}`, 1.8);
        }
        break;
      }
      case "incubator_shaker":
        if ((cmd === "start" || cmd === "stop") && fresh(ev)) tag(b.x, yTop, cmd === "start" ? "shaking on" : "shaking off");
        break;
      case "hotplate_stirrer":
        if ((cmd === "heater_off" || cmd === "stir_off") && fresh(ev)) tag(b.x, yTop, cmd === "heater_off" ? "heater off" : "stirring off");
        break;
    }
  }
}
