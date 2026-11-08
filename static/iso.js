// Isometric (2.5D) view: the bench seen from a 45° corner, turnable in 90° steps.
// Instruments are boxes: the top face is the top-view drawing and the front face the front-view drawing, both mapped onto the
// box faces with an affine transform (an isometric projection maps rectangles to parallelograms exactly), so every instrument
// model is reused as is. Containers stand upright (their silhouette is the front-view vessel), tubing is routed in 3D along the
// bench and projected. Uses globals from studio.js / models.js / pump.js: S, el, best, fmt, benchBounds, drawDevice, drawVessel,
// vesselShape, liquidColor, roundedPath, pumpTube, pumpColor, pumpTop, TOP, TOP_ICON, topReading, targetOf, spreadLabels, LEG.
"use strict";

const ISO = { rot: 0, C: Math.cos(Math.PI / 6), S: 0.5, turned: false, autoFor: null, hover: null, hoverT: null };
const isoAvatarX = {};

// world (x, y = depth toward the viewer, z = height) → screen; rot turns the bench about its centre in 90° steps
function isoMaker(b) {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = ((ISO.rot % 4) + 4) % 4;
  const R = (dx, dy) => (r === 0 ? [dx, dy] : r === 1 ? [-dy, dx] : r === 2 ? [-dx, -dy] : [dy, -dx]);
  const lin = (vx, vy) => { const [u, v] = R(vx, vy); return { x: (u - v) * ISO.C, y: (u + v) * ISO.S }; };   // direction (no z)
  const proj = (x, y, z = 0) => { const [u, v] = R(x - cx, y - cy); return { x: (u - v) * ISO.C, y: (u + v) * ISO.S - z }; };
  const depth = (x, y) => { const [u, v] = R(x - cx, y - cy); return u + v; };   // larger = closer to the viewer
  const facing = (nx, ny) => { const [u, v] = R(nx, ny); return u + v > 0.01; }; // a vertical face with this outward normal is visible
  return { proj, lin, depth, facing };
}

// default corner: the one from which the most instrument fronts (displays) face the viewer, until the user turns it
function isoAutoRot(f, st) {
  const key = Object.entries(f.devices).map(([k, d]) => `${k}:${d.slot}:${d.rotation || 0}`).join("|");
  if (ISO.turned || ISO.autoFor === key) return;
  ISO.autoFor = key;
  const b = benchBounds(st);
  let bestR = 0, bestN = -1;
  for (let r = 0; r < 4; r++) {
    ISO.rot = r; const { facing } = isoMaker(b);
    let n = 0;
    for (const [id, d] of Object.entries(f.devices)) {
      if (!st.slots[d.slot]) continue;
      const a = (d.rotation || 0) * Math.PI / 180, used = Object.keys(d.connections || {}).length || Object.values(f.containers).some((c) => c.location === id);
      if (facing(-Math.sin(a), Math.cos(a))) n += used ? 2 : 1;          // instruments in use count double
    }
    if (n > bestN) { bestN = n; bestR = r; }
  }
  ISO.rot = bestR;
}

function renderIso(svg, f, st) {
  isoAutoRot(f, st);
  const b = benchBounds(st), P = isoMaker(b), { proj, lin, depth, facing } = P;
  const g = el("g", { class: "iso" }, svg);
  const pt = (q) => `${q.x},${q.y}`;
  const poly = (pts, cls, parent = g, ex = {}) => el("polygon", { points: pts.map(pt).join(" "), class: cls, ...ex }, parent);

  // ---------------------------------------------------------------- bench: legs, side faces, top
  const behind = el("g", {}, g), benchG = el("g", {}, g);         // people behind the bench are drawn first
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const legs = corners.map(([x, y]) => [x + (x === b.x0 ? 50 : -50), y + (y === b.y0 ? 50 : -50)])
    .sort((p, q) => depth(...p) - depth(...q));
  for (const [x, y] of legs) {
    const a = proj(x, y, -34), z = proj(x, y, -LEG);
    el("line", { x1: a.x, y1: a.y, x2: z.x, y2: z.y, class: "iso-leg" }, benchG);
  }
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = corners[i], [x1, y1] = corners[(i + 1) % 4], nx = y1 - y0, ny = -(x1 - x0);   // outward normal (clockwise corners)
    if (!facing(Math.sign(nx), Math.sign(ny))) continue;
    poly([proj(x0, y0, 0), proj(x1, y1, 0), proj(x1, y1, -34), proj(x0, y0, -34)], "iso-bench-side", benchG);
  }
  poly(corners.map(([x, y]) => proj(x, y, 0)), "iso-bench-top", benchG);
  for (const s of Object.values(st.slots)) if (S.mode === "sandbox")
    poly([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => proj(s.x_mm + i * s.w_mm / 2, s.y_mm + j * s.d_mm / 2, 0)), "iso-slot", benchG);

  // ---------------------------------------------------------------- scene items, back to front
  const items = [], world = {}, pos = {}, holders = {}, holderW = {};
  S.devBoxes = {};
  for (const [id, d] of Object.entries(f.devices)) {
    const s = st.slots[d.slot]; if (!s) continue;
    items.push({ kind: "dev", id, d, x: s.x_mm, y: s.y_mm, k: depth(s.x_mm, s.y_mm) });
  }
  const onSlot = {};
  for (const [cid, c] of Object.entries(f.containers)) {
    const s = st.slots[c.location]; if (!s) continue;
    const k = (onSlot[c.location] = (onSlot[c.location] || 0) + 1) - 1;
    const x = s.x_mm + k * 50, y = s.y_mm;
    items.push({ kind: "con", id: cid, c, x, y, k: depth(x, y) });
  }
  const act = f.activity;
  // people stand in front of the bench (+y): when that side faces away they are behind it and go under the bench top
  const peopleFront = facing(0, 1);
  f.executors.filter((e) => /human/.test(e.kind)).forEach((e, i) => items.push({ kind: "human", e, i, k: peopleFront ? Infinity : -Infinity }));
  for (const e of f.executors.filter((x) => x.kind === "robot_arm" && x.base_xy_mm)) items.push({ kind: "arm", e, k: depth(...e.base_xy_mm) });
  items.sort((p, q) => p.k - q.k);

  const vesselAt = (cid, c, wx, wy, wz, opts = {}) => {     // upright vessel standing at a world point
    const q = proj(wx, wy, wz);
    const r = drawVessel(g, cid, c, q.x, q.y, opts);
    g.lastElementChild?.setAttribute("data-depth", depth(wx, wy) + 1);
    world[cid] = { x: wx, y: wy, z: wz, h: r.h, w: r.w };
    pos[cid] = r;
  };
  const humans = items.filter((it) => it.kind === "human");

  for (const it of items) {
    if (it.kind === "dev") {
      const hs = isoDevice(g, P, it.id, it.d, it.x, it.y, f);
      holders[it.id] = hs.screen; holderW[it.id] = hs.world;
      const here = Object.entries(f.containers).filter(([, c]) => c.location === it.id);
      if (hs.screen.drawsVessel) { for (const [cid] of here) pos[cid] = hs.screen.vessel; continue; }
      // enclosure decks (OT-2, incubator): a grid like the top view; open platforms: spread along the width
      const h = hs.world, n = here.length, hd = f.devices[it.id], top0 = hd.category === "liquid_handler" ? 60 : 8;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * h.W / Math.max(1, h.D - top0)))), rows = Math.ceil(n / cols);
      const spot = (k) => {
        if (h.enclosure && n > 1) {
          const px = (h.W - 16) / cols, py = (h.D - top0 - 8) / rows;
          return [-h.W / 2 + 8 + px * (k % cols + 0.5), -h.D / 2 + top0 + py * (Math.floor(k / cols) + 0.5)];
        }
        return [h.spread ? -h.spread / 2 + (k + 0.5) * h.spread / n : 0, 0];
      };
      const wxy = ([u, v]) => [h.x + u * h.ex[0] + v * h.n[0], h.y + u * h.ex[1] + v * h.n[1]];
      here.map(([cid, c], k) => ({ cid, c, xy: wxy(spot(k)) })).sort((p, q) => depth(...p.xy) - depth(...q.xy)).forEach(({ cid, c, xy }) => {
        vesselAt(cid, c, xy[0], xy[1], h.z, { labelAbove: !h.enclosure });
        if (["incubator_shaker", "heater_shaker"].includes(hd.category) && (best(hd, "speed") ?? 0) > 20) g.lastElementChild?.classList.add("mdl-shake-ride");
      });
      hs.close?.();                                          // enclosure walls and glass go over what stands inside
    } else if (it.kind === "con") {
      const r = Math.min(60, 10 + 3.2 * Math.sqrt(it.c.capacity_mL)), q = proj(it.x, it.y, 0);
      el("ellipse", { cx: q.x, cy: q.y, rx: r, ry: Math.max(4, r * 0.35), class: "contact-shadow", "data-c": it.id }, g);
      vesselAt(it.id, it.c, it.x, it.y, 0);
    } else if (it.kind === "arm") isoArm(g, P, it.e, act);
  }
  for (const it of humans) isoHuman(peopleFront ? g : behind, P, b, it.e, it.i, act, world, holderW);   // after everything is placed

  // ---------------------------------------------------------------- tubing and probe cables, routed on the bench in 3D
  isoConnections(g, P, f, holderW, holders, world, pos);
  spreadLabels(g);
  S.geo = { mode: "iso", pos, holders, b, boxes: S.devBoxes, proj, world };
  // fit: the equipment on the bench (not the whole, often much larger bench), with room for labels and people
  const xs = [], ys = [];
  for (const q of Object.values(S.devBoxes)) { xs.push(q.L, q.L + q.W); ys.push(q.T, q.yb + 40); }
  for (const p of Object.values(pos)) if (p) { xs.push(p.x - 60, p.x + 60); ys.push(p.top - 60, p.y + 50); }
  for (const a of g.querySelectorAll(".avatar")) { const m = /translate\(([-\d.e]+),([-\d.e]+)\)/.exec(a.getAttribute("transform") || "");
    if (m) { xs.push(+m[1] - 80, +m[1] + 120); ys.push(+m[2] - 430, +m[2] + 40); } }
  if (!xs.length) for (const [x, y] of corners) { const q = proj(x, y, 0); xs.push(q.x); ys.push(q.y); }
  let x0 = Math.min(...xs) - 200, x1 = Math.max(...xs) + 200, y0 = Math.min(...ys) - 160, y1 = Math.max(...ys) + 160;
  if (x1 - x0 < 1400) { const c = (x0 + x1) / 2; x0 = c - 700; x1 = c + 700; }
  return { x: x0, y: y0, w: x1 - x0, h: Math.max(y1 - y0, (x1 - x0) * 0.5) };
}

// one instrument: plain side faces, top-view drawing on the top face, front-view drawing on the front face.
// Returns the container holder both in world coordinates (for routing / stacking) and on screen (for the animation layer).
function isoDevice(g, P, id, d, cx, cy, f) {
  const { proj, lin, depth, facing } = P;
  const [W, D, Hraw] = d.dims_mm, cat = d.category;
  let H = cat === "thermostatic_bath" ? Math.min(Hraw, 260) : Math.min(Hraw, 950);
  if (cat === "syringe_pump" && H <= W) H *= 0.64;                // lying pump: the syringe sits on the body's top
  const a = (d.rotation || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const ex = [ca, sa], n = [-sa, ca];                             // instrument's width axis and front normal (rotate like the top view)
  const at = (u, v, z = 0) => proj(cx + u * ex[0] + v * n[0], cy + u * ex[1] + v * n[1], z);   // u along width, v toward its front
  const P2 = (pts) => pts.map((q) => `${q.x},${q.y}`).join(" ");
  const grp = el("g", { "data-d": id, "data-depth": depth(cx, cy), class: "iso-dev" }, g);
  el("ellipse", { cx: proj(cx, cy).x, cy: proj(cx, cy).y, rx: Math.hypot(W, D) * 0.5, ry: Math.hypot(W, D) * 0.22, class: "contact-shadow" }, grp);
  // front-view drawing (detached for now): gives the holder height and the ports
  const e1 = lin(ex[0], ex[1]), e2 = lin(n[0], n[1]), fo = at(0, D / 2, 0);
  const frontShown = facing(n[0], n[1]);
  const frontG = el("g", { transform: `matrix(${e1.x},${e1.y},0,1,${fo.x},${fo.y})`, class: "iso-front" });
  const holderLocal = drawDevice(frontG, id, d, 0, 0);
  for (const t of frontG.querySelectorAll("text.lbl")) if (t.textContent === id) t.remove();   // the id label goes upright below
  for (const s of frontG.querySelectorAll("[data-d]")) s.removeAttribute("data-d");
  const hz = Math.max(0, -holderLocal.y), hu = holderLocal.x;
  // enclosure (OT-2, incubator: the holder sits well below the top): drawn open — the top-view drawing becomes the deck inside,
  // and the walls / front glass go on top as see-through, after the contents are placed (close())
  const enclosure = hz < H * 0.75 && H - hz > 80 && !holderLocal.drawsVessel;
  // vertical faces: front (+n), back (−n), right (+ex), left (−ex)
  const faces = [
    { nrm: n, pts: [[-W / 2, D / 2], [W / 2, D / 2]], front: true },
    { nrm: [-n[0], -n[1]], pts: [[W / 2, -D / 2], [-W / 2, -D / 2]] },
    { nrm: ex, pts: [[W / 2, D / 2], [W / 2, -D / 2]] },
    { nrm: [-ex[0], -ex[1]], pts: [[-W / 2, -D / 2], [-W / 2, D / 2]] },
  ];
  const wall = (fc, parent, cls) => {
    const [[u0, v0], [u1, v1]] = fc.pts;
    el("polygon", { points: P2([at(u0, v0, 0), at(u1, v1, 0), at(u1, v1, H), at(u0, v0, H)]), class: fc.front ? `${cls} front` : cls }, parent);
  };
  const topModel = (zTop) => {                                     // top-view model mapped (X along width, Y toward the front) onto z
    const o = proj(cx, cy, zTop);
    const tg = el("g", { transform: `matrix(${e1.x},${e1.y},${e2.x},${e2.y},${o.x},${o.y})`, class: "iso-top" }, grp);
    el("rect", { x: -W / 2, y: -D / 2, width: W, height: D, rx: 14, class: "top-dev" }, tg);
    if (typeof TOP !== "undefined" && TOP[cat]) TOP[cat](tg, { id, d, cx: 0, cy: 0, L: -W / 2, T: -D / 2, W, D });
    else if (cat === "syringe_pump") pumpTop(tg, id, d, { x_mm: 0, y_mm: 0 });
    else if (TOP_ICON[cat]) el("text", { x: 0, y: Math.min(W, D) * 0.12, class: "top-ico", "font-size": Math.max(40, Math.min(W, D) * 0.42) }, tg, TOP_ICON[cat]);
  };
  let close = null;
  if (!enclosure) {
    for (const fc of faces) if (facing(fc.nrm[0], fc.nrm[1])) wall(fc, grp, "iso-face");
    topModel(H);
    if (frontShown) grp.appendChild(frontG);
  } else {
    for (const fc of faces) if (!facing(fc.nrm[0], fc.nrm[1])) wall(fc, grp, "iso-face-inner");   // far walls: the inside of the box
    topModel(hz);
    close = () => {
      const lid = el("g", { class: "iso-lid", "data-d": id, "data-depth": depth(cx, cy) + 0.5 }, g);
      for (const fc of faces) if (facing(fc.nrm[0], fc.nrm[1])) wall(fc, lid, "iso-face-glass");
      if (frontShown) { lid.appendChild(frontG); frontG.classList.add("glassy"); }
      el("polygon", { points: P2([at(-W / 2, -D / 2, H), at(W / 2, -D / 2, H), at(W / 2, D / 2, H), at(-W / 2, D / 2, H)]), class: "iso-roof" }, lid);
    };
  }
  // holder: x offset along the width, height from the front drawing; mid depth (an enclosure's deck: its centre)
  const wx = enclosure ? cx : cx + hu * ex[0], wy = enclosure ? cy : cy + hu * ex[1];
  const toWorld = (q) => q && { x: cx + q.x * ex[0] + (D / 2) * n[0], y: cy + q.x * ex[1] + (D / 2) * n[1], z: Math.max(0, -q.y) };
  const world = { x: wx, y: wy, z: hz, ex, n, D, W, H, spread: holderLocal.spread, enclosure,
    port: toWorld(holderLocal.port), ports: holderLocal.ports && Object.fromEntries(Object.entries(holderLocal.ports).map(([k, q]) => [k, toWorld(q)])) };
  const hs = proj(wx, wy, hz);
  const screen = { ...holderLocal, x: hs.x, y: hs.y };
  if (world.port) screen.port = proj(world.port.x, world.port.y, world.port.z);
  if (world.ports) screen.ports = Object.fromEntries(Object.entries(world.ports).map(([k, q]) => [k, proj(q.x, q.y, q.z)]));
  if (holderLocal.vessel) {                                      // the model draws its own vessel (foam column): move it with the face
    const v = holderLocal.vessel, m = (px, py) => ({ x: fo.x + e1.x * px, y: fo.y + e1.y * px + py });
    const q = m(v.x, v.y);
    screen.vessel = { ...v, x: q.x, y: q.y, top: m(v.x, v.top).y, level: v.level != null ? m(v.x, v.level).y : undefined };
  }
  // outline for the animation layer (screen bounding box of the box) and upright label under the front corner
  const pts = [];
  for (const [u, v] of [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]]) for (const z of [0, H]) pts.push(at(u, v, z));
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), L = Math.min(...xs), T = Math.min(...ys);
  S.devBoxes[id] = { L, T, W: Math.max(...xs) - L, H: Math.max(...ys) - T, x: (L + Math.max(...xs)) / 2, yb: Math.max(...ys) };
  const lb = Math.max(...ys);
  el("text", { x: (L + Math.max(...xs)) / 2, y: lb + 30, class: "lbl" }, grp, id);
  const rd = typeof topReading === "function" ? topReading(d) : null;
  if (rd && !frontShown) el("text", { x: (L + Math.max(...xs)) / 2, y: lb + 52, class: "lbl-sub" }, grp, rd);
  grp.addEventListener("mousemove", (e) => { tip(e, deviceTip(id, d)); S.hoverDev = id; });
  grp.addEventListener("mouseenter", () => isoHover(id));
  grp.addEventListener("mouseleave", () => { hideTip(); if (S.hoverDev === id) S.hoverDev = null; isoHover(null); });
  void f;
  return { world, screen, close };
}

// pump tubing and probe cables: off the port, down to the bench in front of the instrument, along the bench (two legs, the
// second toward the vessel), up the vessel's side and over the rim. Several tubes into one vessel fan out across its mouth.
function isoConnections(g, P, f, holderW, holders, world, pos) {
  const { proj } = P, nIn = {};
  S.tubeEnds = {};
  for (const [id, d] of Object.entries(f.devices)) {
    const h = holderW[id]; if (!h) continue;
    for (const [port, cid] of Object.entries(d.connections)) {
      const v = world[cid], p = pos[cid]; if (!v || !p) continue;
      const k = (nIn[cid] = (nIn[cid] ?? -1) + 1);
      const a = h.ports?.[port] || h.port || { x: h.x, y: h.y, z: h.z };
      const out = 30 + k * 10;                                       // step out in front of the instrument, then down
      const a1 = { x: a.x + h.n[0] * out, y: a.y + h.n[1] * out };
      const r = (v.w || 40) / 2 + 8 + k * 7;
      const lane = { x: a1.x, y: v.y + r };                          // along the depth axis first, then across to the vessel
      const side = { x: v.x + (a1.x < v.x ? -r : r), y: v.y + r * 0.3 };
      const pts3 = [[a.x, a.y, a.z], [a1.x, a1.y, a.z], [a1.x, a1.y, 0], [lane.x, lane.y, 0], [side.x, lane.y, 0], [side.x, side.y, 0],
        [side.x, side.y, v.z + v.h + 18 + k * 6]];
      const pts = pts3.map(([x, y, z]) => proj(x, y, z)).map((q) => [q.x, q.y]);
      const z = pts[pts.length - 1], mx = p.x + (k - 1) * Math.min(6, p.w * 0.12), my = p.top + Math.min(p.h * 0.25, 14);
      if (d.category === "syringe_pump") {
        const dPath = roundedPath(pts, 14) + ` Q${z[0]},${z[1] - 16} ${(z[0] + mx) / 2},${z[1] - 14} T${mx},${my}`;
        if (port === "out") S.tubeEnds[id] = { x: mx, y: my };
        const src = d.connections.in && f.containers[d.connections.in];
        pumpTube(g, id, d, port, dPath, src ? liquidColor(src) : pumpColor(d.anim));
      } else {
        const px = p.x + (port === "pt1000" ? 10 : -10), tipY = p.y - Math.min(p.h * 0.35, 40);
        el("path", { d: roundedPath([...pts.slice(0, -1), [z[0], p.top - 60], [px, p.top - 60], [px, p.top - 40]], 14), class: "cable" }, g);
        el("line", { x1: px, y1: p.top - 40, x2: px, y2: tipY, class: "probe" }, g);
        el("circle", { cx: px, cy: tipY, r: 4, class: "probe-tip" }, g);
      }
    }
  }
  void holders;
}

// robot arm: base on the bench, two links reaching the tool point (elbow up), all in 3D then projected
function isoArm(g, P, e, act) {
  const { proj, depth } = P;
  const [bx, by] = e.base_xy_mm, [tx, ty, tz] = e.pos_mm || [bx, by, 300];
  const busy = act && act.executor === e.id;
  const grp = el("g", { class: `arm ${busy ? "busy" : "ghost"}`, "data-depth": depth(bx, by) }, g);
  const hd = Math.hypot(tx - bx, ty - by), dir = hd > 1 ? [(tx - bx) / hd, (ty - by) / hd] : [1, 0];
  const L = 380, sz = 260, wz = tz + 40, dz = wz - sz, dist = Math.min(Math.hypot(hd, dz), 2 * L - 1);
  const mr = hd / 2, mz = (sz + wz) / 2, hh = Math.sqrt(Math.max(0, L * L - (dist / 2) ** 2));
  const er = mr - (dz / (dist || 1)) * hh, ez = mz + Math.abs(hd / (dist || 1)) * hh;   // elbow above the line shoulder → wrist
  const w = (r, z) => proj(bx + dir[0] * r, by + dir[1] * r, z);
  const base = proj(bx, by, 0), sh = w(0, sz), el_ = w(er, ez), wr = w(hd, wz), tool = w(hd, tz);
  el("ellipse", { cx: base.x, cy: base.y, rx: 80, ry: 40, class: "arm-base" }, grp);
  el("rect", { x: base.x - 34, y: sh.y, width: 68, height: base.y - sh.y, rx: 18, class: "arm-base" }, grp);
  el("path", { d: `M${sh.x},${sh.y} L${el_.x},${el_.y} L${wr.x},${wr.y}`, class: "arm-link" }, grp);
  for (const [q, r] of [[sh, 30], [el_, 24], [wr, 18]]) el("circle", { cx: q.x, cy: q.y, r, class: "arm-joint" }, grp);
  el("path", { d: `M${tool.x - 22},${tool.y - 22} L${tool.x - 22},${tool.y + 6} M${tool.x + 22},${tool.y - 22} L${tool.x + 22},${tool.y + 6}`, class: "arm-finger" }, grp);
  el("text", { x: base.x, y: base.y + 60, class: "lbl" }, grp, e.id);
}

// a person standing on the floor in front of the bench, walking to what they work on
function isoHuman(g, P, b, e, i, act, world, holderW) {
  const { proj, depth } = P;
  const busy = act && act.executor === e.id;
  const eq = Object.values(world);
  let x = isoAvatarX[e.id] ?? (eq.length ? Math.min(...eq.map((w) => w.x)) - 150 - i * 250 : b.x0 + 200 + i * 300);
  if (busy) { const t = targetOf(act, world, holderW); if (t) x = t.x - 80; }
  isoAvatarX[e.id] = x;
  const y = b.y1 + 160, q = proj(x, y, -LEG);
  el("ellipse", { cx: q.x, cy: q.y, rx: 50, ry: 22, class: "contact-shadow" }, g);
  const a = el("g", { class: `avatar ${busy ? "walk" : ""}`, transform: `translate(${q.x},${q.y})`, "data-depth": depth(x, y) }, g);
  el("rect", { x: -34, y: -330, width: 68, height: 200, rx: 26, class: "body" }, a);
  el("rect", { x: -26, y: -140, width: 20, height: 140, rx: 8, fill: "#3d5a4a" }, a);
  el("rect", { x: 6, y: -140, width: 20, height: 140, rx: 8, fill: "#3d5a4a" }, a);
  el("circle", { cx: 0, cy: -372, r: 40, class: "head" }, a);
  el("rect", { x: -30, y: -386, width: 60, height: 16, rx: 7, class: "goggles" }, a);
  el("path", { d: busy ? "M30,-300 Q90,-330 110,-370" : "M30,-300 Q50,-240 40,-190", stroke: "#f3f3ea", "stroke-width": 16, fill: "none", "stroke-linecap": "round" }, a);
  el("circle", { cx: busy ? 110 : 40, cy: busy ? -370 : -190, r: 10, class: "glove" }, a);
  el("text", { x: 0, y: 30, class: "lbl" }, a, e.id);
}

// ---------------------------------------------------------------- occlusion: things in front of the focus become see-through
const isoBox = (n) => n.getBoundingClientRect();
const isoOverlap = (p, q) => p.left < q.right && p.right > q.left && p.top < q.bottom && p.bottom > q.top;
function isoBlockers(ids, cls) {
  const W = $("world"), nodes = [...W.querySelectorAll("[data-depth]")];
  const tgt = nodes.filter((n) => ids.has(n.getAttribute("data-d") || n.getAttribute("data-c")));
  if (!tgt.length) return;
  const dmin = Math.min(...tgt.map((n) => +n.getAttribute("data-depth"))), boxes = tgt.map(isoBox);
  for (const n of nodes) {
    if (tgt.includes(n) || +n.getAttribute("data-depth") <= dmin) continue;
    const r = isoBox(n);
    if (boxes.some((q) => isoOverlap(r, q))) n.classList.add(cls);
  }
}
// hover: moving between the parts of one instrument (faces, its vessels) fires leave / enter pairs; clearing only after a short
// pause, and only if nothing else was entered, keeps the see-through steady instead of flickering
function isoHover(id) {
  clearTimeout(ISO.hoverT);
  if (id) { if (ISO.hover !== id) { ISO.hover = id; isoXray(id); } return; }
  ISO.hoverT = setTimeout(() => { ISO.hover = null; isoXray(null); }, 120);
}
function isoXray(id) {
  for (const n of $("world").querySelectorAll(".xray-block")) n.classList.remove("xray-block");
  if (!id || S.view !== "iso") return;
  const f = S.frames[S.idx]; if (!f) return;
  const loc = f.containers[id]?.location, owner = f.devices[loc] ? loc : id;          // hovering a vessel on an instrument = that group
  const ids = new Set([id, owner, ...Object.entries(f.containers).filter(([, c]) => c.location === owner).map(([k]) => k)]);
  isoBlockers(ids, "xray-block");
}
function isoLayers(f) {                                // while a group works, whatever stands in front of it turns see-through
  if (typeof activeSeeds !== "function") return;
  const seeds = activeSeeds(f); if (!seeds.size) return;
  isoBlockers(focusGroupOf(f, seeds), "layer-block");
}

function isoTurn(k) {
  ISO.rot = (ISO.rot + k + 4) % 4; ISO.turned = true;
  if (S.view !== "iso") return;
  S.fitted.iso = false; S.vb = null; render();
}
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || S.view !== "iso") return;
  if (typeof SB !== "undefined" && SB.drag) return;              // carrying a device: E turns the device (bench.js)
  if (e.key === "[" || e.key === "q" || e.key === "Q") isoTurn(-1); else if (e.key === "]") isoTurn(1);
});
document.getElementById("isoLeft")?.addEventListener("click", () => isoTurn(-1));
document.getElementById("isoRight")?.addEventListener("click", () => isoTurn(1));
