// Syringe pump: simple geometric model (front / top view) + animation driven by simulation state.
// Models only change proportions: wide flat ones (e.g. NE-1000) are drawn horizontal — syringe lying on the body, pusher moves sideways;
// tall thin ones (e.g. Cavro XLP 6000) are drawn vertical — valve on top, syringe standing in front, plunger moves up and down.
// Uses globals from studio.js: S, el, esc, fmt, best.
"use strict";

const PUMP = {
  shown: {},      // device → displayed syringe volume (mL), for smooth transitions
  valveAng: {},   // device → displayed valve angle
  conn: {},       // "device.port" → last seen container (detects connect / disconnect)
  connAt: {},     // "device.port" → time connected (wall clock ms)
  ghosts: {},     // "device.port" → { d, at }: just-removed tube, plays retract animation
  flash: {},      // device → { kind: done/stop/reject, at, text }
  phase: {},      // device → previous action
  prefills: {},   // device → previous prefill count
  prefillAt: {},  // device → time of the latest prefill
  evSeen: -1,     // last processed event index
  tw: [],         // tweens in progress
};
const PHASE_ZH = { idle: "Idle", valve: "Switching valve", draw: "Drawing", push: "Infusing", paused: "Paused" };
const now = () => performance.now();

// ---------------------------------------------------------------- tweens (update attributes per frame, continuous across redraws)
function tween(key, store, target, dur, apply) {
  const from = store[key] ?? target;
  const t = { from, to: target, t0: now(), dur, apply, key, store };
  PUMP.tw.push(t);
  apply(from);
}
function anim1(from, to, dur, apply) {           // one-shot tween that needs no memory across redraws
  const box = { v: from };
  PUMP.tw.push({ from, to, t0: now(), dur: Math.max(1, dur), apply, key: "v", store: box });
  apply(from);
}
function _pumpLoop() {
  const n = now(), keep = [];
  for (const t of PUMP.tw) {
    const k = Math.min(1, (n - t.t0) / t.dur), e = k < 1 ? 1 - (1 - k) ** 3 : 1;
    const v = t.from + (t.to - t.from) * e;
    t.store[t.key] = v;
    try { t.apply(v); } catch { /* element removed by a redraw */ }
    if (k < 1) keep.push(t);
  }
  PUMP.tw = keep;
  requestAnimationFrame(_pumpLoop);
}
requestAnimationFrame(_pumpLoop);

// ongoing animations (tube flow, blinking) keep phase across redraws: negative animation-delay aligned to the wall clock
const phaseDelay = (period) => `-${((now() / 1000) % period).toFixed(3)}s`;

// ---------------------------------------------------------------- state and events
function pumpColor(a) {
  const c = a?.rgb;                                  // same as containers: the agent view can't see true colour; only the operator view shows it
  return S.operator && c ? `color-mix(in srgb, rgb(${c.join(",")}) 72%, var(--water))` : "var(--water)";
}
// called before each redraw: handle new events (rejected, stopped, connect / disconnect) and action changes (done)
function pumpPrepare(f) {
  if (!f) return;
  const seq = f.event_seq ?? 0;
  if (seq < PUMP.evSeen) PUMP.evSeen = -1;                      // replay scrubbed backwards
  for (const e of S.events) {
    if (e.seq == null || e.seq <= PUMP.evSeen || e.seq >= seq) continue;
    const d = f.devices[e.device];
    if (!d || d.category !== "syringe_pump") continue;
    if (e.type === "command_rejected") PUMP.flash[e.device] = { kind: "reject", at: now(), text: (e.violations || [])[0]?.message || "Command rejected" };
    else if (e.type === "command" && e.command === "stop") PUMP.flash[e.device] = { kind: "stop", at: now(), text: "Stopped" };
  }
  PUMP.evSeen = Math.max(PUMP.evSeen, seq - 1);
  for (const [id, d] of Object.entries(f.devices)) {
    if (d.category !== "syringe_pump" || !d.anim) continue;
    const a = d.anim, prev = PUMP.phase[id];
    if (prev && prev !== "idle" && prev !== "paused" && a.phase === "idle" && !a.alarm && PUMP.flash[id]?.kind !== "stop")
      PUMP.flash[id] = { kind: "done", at: now(), text: "Done" };
    PUMP.phase[id] = a.phase;
    if (PUMP.prefills[id] != null && a.prefills > PUMP.prefills[id]) PUMP.prefillAt[id] = now();
    PUMP.prefills[id] = a.prefills;
    for (const port of ["in", "out"]) {                          // connect / disconnect
      const k = `${id}.${port}`, cur = d.connections[port] || null, old = PUMP.conn[k];
      if (old === undefined) { PUMP.conn[k] = cur; continue; }
      if (cur && cur !== old) PUMP.connAt[k] = now();
      if (old && cur !== old && PUMP.lastPath?.[k]) PUMP.ghosts[k] = { d: PUMP.lastPath[k], at: now() };
      PUMP.conn[k] = cur;
    }
  }
}
function pumpStatus(id, d) {
  const a = d.anim || {}, fl = PUMP.flash[id], age = fl ? now() - fl.at : 1e9;
  if (a.alarm) return { led: "alarm", line1: "Alarm", line2: a.alarm };
  if (fl && age < 2200) {
    if (fl.kind === "reject") return { led: "alarm", line1: "Rejected", line2: fl.text, shake: age < 500 };
    if (fl.kind === "stop") return { led: "stop", line1: "Stopped", line2: "" };
    if (fl.kind === "done") return { led: "done", line1: "Done", line2: `Total ${fmt(best(d, "dispensed_volume") ?? 0, 4)} mL` };
  }
  if (a.phase === "paused") return { led: "paused", line1: "Paused", line2: a.left_mL != null ? `${fmt(a.left_mL, 3)} mL left` : "" };
  if (a.phase === "push" || a.phase === "draw") return { led: "run", line1: `${PHASE_ZH[a.phase]} ${fmt(a.rate_mL_min, 3)}`, line2: "mL/min" };
  if (a.phase === "valve") return { led: "run", line1: "Valve → " + (a.port === "in" ? "reservoir" : "outlet"), line2: "" };
  return { led: "idle", line1: "Idle", line2: `Total ${fmt(best(d, "dispensed_volume") ?? 0, 4)} mL` };
}
const LED_COLOR = { idle: "#5b7a68", run: "#5fd35f", paused: "#ffc24a", done: "#b9f0a0", stop: "#e66767", alarm: "#e66767" };

// ---------------------------------------------------------------- syringe (shared by both orientations)
// draw a syringe at (x0,y0), axis = "h" (needle left) or "v" (needle up); returns the needle position
function drawSyringe(g, id, a, x0, y0, len, thick, axis, rodLen) {
  const cap = a.capacity_mL || 60, ml = a.syringe_mL ?? 0;
  const H = axis === "h";
  // barrel + graduations
  el("rect", H ? { x: x0, y: y0, width: len, height: thick, rx: thick * 0.25, class: "syr-barrel" } : { x: x0, y: y0, width: thick, height: len, rx: thick * 0.25, class: "syr-barrel" }, g);
  for (let i = 1; i < 6; i++) {
    const p = (H ? x0 : y0) + len * i / 6;
    el("line", H ? { x1: p, x2: p, y1: y0, y2: y0 + thick * (i % 3 ? 0.25 : 0.45), class: "syr-tick" } : { x1: x0, x2: x0 + thick * (i % 3 ? 0.25 : 0.45), y1: p, y2: p, class: "syr-tick" }, g);
  }
  const liq = el("rect", { class: "syr-liquid", fill: pumpColor(a) }, g);
  const head = el("rect", { class: "syr-head" }, g);
  const rod = el("rect", { class: "syr-rod" }, g);
  const flange = el("rect", { class: "syr-flange" }, g);
  const pusher = el("rect", { class: "pump-pusher" }, g);
  const pad = Math.max(1.5, thick * 0.1), hw = Math.max(3, len * 0.025);
  const place = (v) => {
    const k = Math.max(0, Math.min(1, v / cap)), fill = (len - 2 * pad - hw) * k;
    if (H) {
      const hx = x0 + pad + fill;
      liq.setAttribute("x", x0 + pad); liq.setAttribute("y", y0 + pad); liq.setAttribute("width", Math.max(0, fill)); liq.setAttribute("height", thick - 2 * pad);
      head.setAttribute("x", hx); head.setAttribute("y", y0 + pad * 0.5); head.setAttribute("width", hw); head.setAttribute("height", thick - pad);
      rod.setAttribute("x", hx + hw); rod.setAttribute("y", y0 + thick * 0.4); rod.setAttribute("width", rodLen); rod.setAttribute("height", thick * 0.2);
      flange.setAttribute("x", hx + hw + rodLen); flange.setAttribute("y", y0 - thick * 0.15); flange.setAttribute("width", hw); flange.setAttribute("height", thick * 1.3);
      pusher.setAttribute("x", hx + 2 * hw + rodLen); pusher.setAttribute("y", y0 - thick * 0.2); pusher.setAttribute("width", thick * 0.45); pusher.setAttribute("height", thick * 1.6);
    } else {
      const hy = y0 + pad + fill;
      liq.setAttribute("x", x0 + pad); liq.setAttribute("y", y0 + pad); liq.setAttribute("width", thick - 2 * pad); liq.setAttribute("height", Math.max(0, fill));
      head.setAttribute("x", x0 + pad * 0.5); head.setAttribute("y", hy); head.setAttribute("width", thick - pad); head.setAttribute("height", hw);
      rod.setAttribute("x", x0 + thick * 0.4); rod.setAttribute("y", hy + hw); rod.setAttribute("width", thick * 0.2); rod.setAttribute("height", rodLen);
      flange.setAttribute("x", x0 - thick * 0.15); flange.setAttribute("y", hy + hw + rodLen); flange.setAttribute("width", thick * 1.3); flange.setAttribute("height", hw);
      pusher.setAttribute("x", x0 - thick * 0.3); pusher.setAttribute("y", hy + 2 * hw + rodLen); pusher.setAttribute("width", thick * 1.6); pusher.setAttribute("height", thick * 0.45);
    }
  };
  const prefill = now() - (PUMP.prefillAt[id] ?? -1e9) < 900;
  tween(id, PUMP.shown, ml, prefill ? 700 : 450, place);
  return H ? { x: x0, y: y0 + thick / 2 } : { x: x0 + thick / 2, y: y0 };
}
// selector valve: disc + handle pointing at the current port; returns both port positions
function drawValve(g, id, a, cx, cy, r, inAng, outAng) {
  el("circle", { cx, cy, r, class: "pump-valve" }, g);
  const hand = el("line", { class: "pump-valve-hand" }, g);
  el("circle", { cx, cy, r: r * 0.28, class: "pump-valve-hub" }, g);
  const target = a.valve === "in" ? inAng : outAng;
  tween(id, PUMP.valveAng, target, 450, (ang) => {
    hand.setAttribute("x1", cx); hand.setAttribute("y1", cy);
    hand.setAttribute("x2", cx + Math.cos(ang) * r * 1.25); hand.setAttribute("y2", cy + Math.sin(ang) * r * 1.25);
  });
  return { in: { x: cx + Math.cos(inAng) * r, y: cy + Math.sin(inAng) * r }, out: { x: cx + Math.cos(outAng) * r, y: cy + Math.sin(outAng) * r } };
}
function pumpScreen(g, x, y, w, h, st, fs) {
  el("rect", { x, y, width: w, height: h, rx: Math.min(6, h * 0.2), class: "screen" }, g);
  el("text", { x: x + fs * 0.5, y: y + h * (st.line2 ? 0.45 : 0.62), class: "screen-t", "font-size": fs }, g, st.line1);
  if (st.line2) el("text", { x: x + fs * 0.5, y: y + h * 0.85, class: "screen-s", "font-size": fs * 0.72 }, g, st.line2);
}
function pumpLed(g, id, x, y, r, st) {
  el("circle", { cx: x, cy: y, r, fill: LED_COLOR[st.led], class: `pump-led ${st.led === "alarm" || st.led === "paused" ? "blink" : ""}`,
    style: `animation-delay:${phaseDelay(0.8)}` }, g);
}

// ---------------------------------------------------------------- front view
function pumpFront(grp, id, d, x, yb) {
  const a = d.anim || { capacity_mL: 60, syringe_mL: 0, valve: "out", phase: "idle" };
  const [W, , Hraw] = d.dims_mm, H = Math.min(Hraw, 950), L = x - W / 2, T = yb - H;
  const st = pumpStatus(id, d), hasValve = a.refill_mode === "valve";
  if (st.shake) grp.setAttribute("class", "pump-shake");
  const ports = {};
  if (H <= W) {                                       // horizontal
    const bodyT = T + H * 0.36;
    el("rect", { x: L, y: bodyT, width: W, height: yb - bodyT, rx: Math.min(12, W * 0.05), class: "dev-body" }, grp);
    el("rect", { x: L + W * 0.04, y: bodyT - H * 0.06, width: W * 0.92, height: H * 0.06, rx: 2, class: "dev-dark" }, grp);   // rail
    pumpScreen(grp, L + W * 0.05, bodyT + (yb - bodyT) * 0.14, W * 0.46, (yb - bodyT) * 0.66, st, Math.max(8, Math.min(16, W * 0.055)));
    for (let i = 0; i < 6; i++) el("circle", { cx: L + W * (0.6 + (i % 3) * 0.08), cy: bodyT + (yb - bodyT) * (0.32 + Math.floor(i / 3) * 0.3), r: Math.min(W, H) * 0.035, class: "knob" }, grp);
    pumpLed(grp, id, L + W * 0.92, bodyT + (yb - bodyT) * 0.3, Math.min(W, H) * 0.04, st);
    const thick = H * 0.2, x0 = L + W * 0.09, len = W * 0.45;
    const tip = drawSyringe(grp, id, a, x0, T + H * 0.08, len, thick, "h", W * 0.3);
    el("rect", { x: tip.x - W * 0.05, y: tip.y - thick * 0.12, width: W * 0.05, height: thick * 0.24, class: "syr-nozzle" }, grp);
    if (hasValve) Object.assign(ports, drawValve(grp, id, a, tip.x - W * 0.07, tip.y, thick * 0.45, -Math.PI / 2, Math.PI));
    else ports.in = ports.out = { x: tip.x - W * 0.05, y: tip.y };
  } else {                                            // vertical
    const headH = H * 0.13;
    el("rect", { x: L, y: T + headH, width: W, height: H - headH, rx: Math.min(10, W * 0.12), class: "dev-body" }, grp);
    el("rect", { x: L - W * 0.04, y: T, width: W * 1.08, height: headH, rx: 6, class: "dev-panel" }, grp);
    if (hasValve) Object.assign(ports, drawValve(grp, id, a, x, T + headH * 0.5, headH * 0.36, Math.PI, 0));
    else ports.in = ports.out = { x, y: T + headH * 0.5 };
    const thick = W * 0.4, len = H * 0.36;
    el("rect", { x: x - thick * 0.12, y: T + headH, width: thick * 0.24, height: H * 0.03, class: "syr-nozzle" }, grp);
    el("rect", { x: x - W * 0.08, y: T + headH + H * 0.42, width: W * 0.16, height: H * 0.36, rx: 3, class: "dev-dark" }, grp);   // plunger slot
    drawSyringe(grp, id, a, x - thick / 2, T + headH + H * 0.03, len, thick, "v", H * 0.18);
    pumpScreen(grp, L + W * 0.06, yb - H * 0.12, W * 0.88, H * 0.09, st, Math.max(5, Math.min(12, W * 0.085)));
    pumpLed(grp, id, L + W * 0.85, T + headH + H * 0.04, W * 0.06, st);
  }
  if (st.led === "alarm" && (d.anim?.alarm || PUMP.flash[id]?.kind === "reject"))
    el("text", { x, y: T - 16, class: "pump-alert" }, grp, `⚠ ${st.line2 || st.line1}`);
  return { x, y: T, port: ports.out, ports };
}

// ---------------------------------------------------------------- top view
function pumpTop(g, id, d, s) {
  const a = d.anim || { capacity_mL: 60, syringe_mL: 0, valve: "out", phase: "idle" };
  const [W, D] = d.dims_mm, st = pumpStatus(id, d);
  const grp = el("g", st.shake ? { class: "pump-shake" } : {}, g);
  const L = s.x_mm - W / 2, T = s.y_mm - D / 2, ports = {};
  if (W >= D * 0.9) {                                 // horizontal: the lying syringe is visible from above
    const thick = D * 0.26, x0 = L + W * 0.09;
    const tip = drawSyringe(grp, id, a, x0, T + D * 0.14, W * 0.45, thick, "h", W * 0.3);
    if (a.refill_mode === "valve") Object.assign(ports, drawValve(grp, id, a, tip.x - W * 0.06, tip.y, thick * 0.4, -Math.PI / 2, Math.PI));
    else ports.in = ports.out = { x: tip.x - W * 0.03, y: tip.y };
    pumpLed(grp, id, L + W * 0.9, T + D * 0.75, Math.min(W, D) * 0.05, st);
  } else {                                            // vertical: only the valve head is visible from above
    Object.assign(ports, a.refill_mode === "valve" ? drawValve(grp, id, a, s.x_mm, T + D * 0.3, Math.min(W, D) * 0.28, Math.PI, 0)
      : { in: { x: s.x_mm, y: T + D * 0.3 }, out: { x: s.x_mm, y: T + D * 0.3 } });
    pumpLed(grp, id, s.x_mm, T + D * 0.78, Math.min(W, D) * 0.08, st);
  }
  if (st.led === "alarm") el("text", { x: s.x_mm, y: T - 14, class: "pump-alert" }, grp, `⚠ ${st.line2 || st.line1}`);
  return ports;
}

// ---------------------------------------------------------------- tubing (grows on connect, retracts on disconnect, liquid flow)
function pumpTube(g, id, d, port, pathD, liquid) {
  const k = `${id}.${port}`, a = d.anim || {};
  (PUMP.lastPath = PUMP.lastPath || {})[k] = pathD;
  // FEP / PTFE tubing is see-through: the tube shows the colour of the liquid in it; idle tubes are fainter
  const busy = a.phase === "push" || a.phase === "draw";
  const tube = el("path", { d: pathD, class: `tube ${busy ? "busy" : ""}`, style: liquid ? `stroke:${liquid}` : "" }, g);
  const born = now() - (PUMP.connAt[k] ?? -1e9);
  if (born < 800) {                                   // just connected: tube grows out of the pump port
    const len = tube.getTotalLength?.() || 600;
    tube.style.strokeDasharray = `${len}`;
    anim1(len * (1 - born / 800), 0, 800 - born, (v) => { tube.style.strokeDashoffset = `${v}`; });
  }
  // liquid flows in this tube: infusing goes out (outward), drawing uses the current port (toward the pump)
  const prefill = port === "in" && now() - (PUMP.prefillAt[id] ?? -1e9) < 1200;
  const active = a.phase === "push" && port === "out" || a.phase === "draw" && a.port === port || prefill;
  if (active) {
    const rate = prefill ? 60 : a.rate_mL_min || 1;
    const period = Math.max(0.25, 1.4 / (1 + Math.log10(1 + rate)));
    const inward = a.phase === "draw" || prefill;
    el("path", { d: pathD, class: `tube-flow ${inward ? "inward" : ""}`, stroke: pumpColor(a),
      style: `animation-duration:${period.toFixed(2)}s;animation-delay:${phaseDelay(period)}` }, g);
  }
  if (a.alarm && /空气|吸空|\bair\b|dry/i.test(a.alarm) && port === (a.port || "in"))   // drew air; Chinese terms match older recordings
    el("path", { d: pathD, class: "tube-bubbles", style: `animation-delay:${phaseDelay(1.2)}` }, g);
}
function pumpGhosts(g) {
  for (const [k, gh] of Object.entries(PUMP.ghosts)) {
    const age = now() - gh.at;
    if (age > 800) { delete PUMP.ghosts[k]; continue; }
    const p = el("path", { d: gh.d, class: "tube" }, g);            // just removed: tube retracts into the pump port
    const len = p.getTotalLength?.() || 600;
    p.style.strokeDasharray = `${len}`;
    anim1(-len * age / 800, -len, 800 - age, (v) => { p.style.strokeDashoffset = `${v}`; });
  }
}
