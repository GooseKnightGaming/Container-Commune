/*
  CONTAINER COMMUNE — the yard map
  Draws the commune from above on a canvas: every fitted-out container where it was built,
  spare containers stacked by the gate, and every citizen walking through yesterday again,
  from home to their two activities and back, while the light goes from dawn to night.
  Read-only: it never changes the game. ui.js mounts it and tells it who to highlight.
*/
(() => {
  'use strict';
  const CC = window.CC;
  const LOOP = 42000;                 // one replayed day, in milliseconds
  const W_SPARE = 44;                 // spare containers are drawn lying down, this long
  const views = [];
  let raf = 0, paused = false, pausedAt = 0, offset = 0, colorBy = 'trade';
  const T0 = performance.now();
  const now = () => (paused ? pausedAt : performance.now()) - T0 - offset;

  const hash = (n) => { let x = (n + 1) * 2654435761; x ^= x >>> 13; x = Math.imul(x, 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const alive = (c) => c && (c.status === 'free' || c.status === 'detained');

  const WORKPLACE = { gardener: 'garden', cook: 'canteen', mechanic: 'workshop', labourer: 'tank', medic: 'clinic', teacher: 'school', warden: 'post', organiser: 'hall', artist: 'plaza', trader: 'gate' };
  const PLACE = { study: 'school', share: 'canteen', hoard: 'tank', trade: 'plaza', gather: 'hall|canteen', worship: 'hall', music: 'home', drink: 'bar', gamble: 'bar', criticise: 'plaza', report: 'post', steal: 'canteen', protest: 'protest', organise: 'hall', weapon: 'home', uniform: 'plaza', address: 'stage', volunteer: 'clinic', outside: 'gate', naked: 'plaza' };
  const DOING = { work: 'at work', study: 'at lessons', share: 'sharing food', hoard: 'filling extra water', trade: 'trading', gather: 'meeting friends', worship: 'worshipping', music: 'playing loud music', drink: 'at the bar', gamble: 'gambling', criticise: 'complaining about the government', report: 'reporting a neighbour', steal: 'stealing', protest: 'protesting', organise: 'doing party work', weapon: 'carrying a weapon', uniform: 'in uniform', address: "at the leader's address", volunteer: 'caring for the sick', outside: 'talking to outsiders at the gate', naked: 'naked in the yard' };

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }

  // ───────────────────────── layout ─────────────────────────
  function build(v) {
    const S = CC.S;
    const W = Math.max(280, Math.floor(v.cv.parentElement.clientWidth));
    const compact = !!v.opts.compact;
    const gap = 3, aisle = compact ? 12 : 16, road = W < 520 ? 16 : 22, margin = 10;
    const x0min = margin + road + 6;
    const spareW = 80;                                       // room at the plaza's end for spare containers
    const availW = W - x0min - margin - 8;
    // what stands in the yard, in the order it was fitted out
    const items = (CC.syncBuilt ? CC.syncBuilt() : []).map((type) => ({ type, size: CC.BUILDINGS[type].size }));
    if (S.owned && S.owned.villa) items.push({ type: 'villa', size: 1 });
    const total = items.reduce((n, it) => n + it.size, 0);
    // how many rows: a compact map stays two rows deep, the full map grows to look like a yard
    const want = compact ? 2 : total > 44 ? 6 : total > 16 ? 4 : 2;
    const minCw = W < 520 ? 11 : 14, maxCw = compact ? 18 : 30;
    let perRow = Math.max(4, Math.ceil(total / want) + 1);
    perRow = Math.min(perRow, Math.floor((availW + gap) / (minCw + gap)));
    const cw = Math.max(minCw, Math.min(maxCw, Math.floor((availW + gap) / perRow) - gap));
    const cl = Math.round(cw * 2.3);
    const plazaH = compact ? 70 : W < 520 ? 84 : 110;
    const blockW = perRow * (cw + gap) - gap;
    const x0 = Math.max(x0min, Math.floor(x0min + (availW - blockW) / 2));
    const rows = [{ used: 0, items: [] }, { used: 0, items: [] }];
    for (const it of items) {
      let best = -1;
      for (let r = 0; r < rows.length; r++) if (rows[r].used + it.size <= perRow && (best < 0 || rows[r].used < rows[best].used)) best = r;
      if (best < 0) { rows.push({ used: 0, items: [] }, { used: 0, items: [] }); best = rows.length - 2; }
      it.slot = rows[best].used; rows[best].used += it.size; rows[best].items.push(it); it.row = best;
    }
    void spareW;
    const nTop = Math.ceil(rows.length / 2), nBot = Math.floor(rows.length / 2);
    // vertical bands
    let y = margin;
    const rowY = [], laneY = [];
    for (let d = nTop - 1; d >= 0; d--) { rowY[d * 2] = y; y += cl; laneY[d * 2] = d === 0 ? null : y + aisle / 2; if (d > 0) y += aisle; }
    const plaza = { x: x0min - 6, y, w: W - margin - (x0min - 6), h: plazaH };
    y += plazaH;
    for (let d = 0; d < nBot; d++) { if (d > 0) { laneY[d * 2 + 1] = y + aisle / 2; y += aisle; } else laneY[1] = null; rowY[d * 2 + 1] = y; y += cl; }
    const H = y + margin;
    const roadX = margin + road / 2;
    // place items
    for (const it of items) {
      const top = it.row % 2 === 0;
      it.x = x0 + it.slot * (cw + gap); it.w = it.size * cw + (it.size - 1) * gap; it.y = rowY[it.row]; it.h = cl;
      it.top = top;
      const lane = laneY[it.row];
      it.door = { x: it.x + it.w / 2, y: lane == null ? (top ? plaza.y + 9 : plaza.y + plaza.h - 9) : lane, plaza: lane == null };
    }
    const byType = {};
    for (const it of items) (byType[it.type] = byType[it.type] || []).push(it);
    v.L = { W, H, cw, cl, gap, aisle, road, roadX, margin, plaza, items, byType, rows, x0, compact, perRow };
    v.L.stage = { x: plaza.x + plaza.w * 0.42, y: plaza.y + 14 };
    v.L.gate = { x: margin + 2, y: plaza.y + plaza.h / 2 };
    v.L.pipe = { x: plaza.x + plaza.w * 0.6, y: plaza.y + plaza.h * 0.5 };
    homes(v);
    paintStatic(v);
  }
  function homes(v) {
    const S = CC.S, L = v.L;
    const hs = L.byType.home || [];
    const key = (c) => {
      if (c.isPlayer && S.owned && S.owned.villa) return 'villa';
      if (c.age < 16) { const p = c.parents.map((id) => S.people[id]).find((x) => alive(x)); if (p) return key(p); }
      return c.partner != null && alive(S.people[c.partner]) ? Math.min(c.id, c.partner) : c.id;
    };
    const keys = [...new Set(S.people.filter(alive).map(key))].filter((k) => k !== 'villa').sort((a, b) => a - b);
    const idx = new Map(keys.map((k, i) => [k, i]));
    L.homeOf = {};
    for (const c of S.people.filter(alive)) {
      const k = key(c);
      if (k === 'villa' && L.byType.villa) L.homeOf[c.id] = L.byType.villa[0];
      else L.homeOf[c.id] = hs.length ? hs[idx.get(k) % hs.length] : null;
    }
    L.crowd = {};
    for (const h of hs) L.crowd[L.items.indexOf(h)] = 0;
    for (const id in L.homeOf) { const h = L.homeOf[id]; if (h && h.type === 'home') L.crowd[L.items.indexOf(h)]++; }
  }

  // ───────────────────────── the still picture ─────────────────────────
  function paintStatic(v) {
    const S = CC.S, L = v.L;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    v.cv.width = Math.round(L.W * dpr); v.cv.height = Math.round(L.H * dpr);
    v.cv.style.width = L.W + 'px'; v.cv.style.height = L.H + 'px';
    const off = (v.bg = v.bg || document.createElement('canvas'));
    off.width = v.cv.width; off.height = v.cv.height;
    const g = off.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    v.dpr = dpr;
    const ink = css('--ink'), line = css('--line'), surf = css('--surface'), surf2 = css('--surface-2'), muted = css('--muted');
    v.colors = { ink, line, surf, surf2, muted, accent: css('--accent'), blue: css('--blue'), bad: css('--bad'), good: css('--good'), warn: css('--warn') };
    // ground: gravel
    g.fillStyle = surf2; g.fillRect(0, 0, L.W, L.H);
    g.fillStyle = line;
    for (let i = 0; i < (L.W * L.H) / 260; i++) { const x = hash(i * 3) * L.W, y = hash(i * 7 + 1) * L.H; g.globalAlpha = 0.25 + hash(i) * 0.35; g.fillRect(x, y, 1.2, 1.2); }
    g.globalAlpha = 1;
    const season = Math.floor((S.day % CC.YEAR) / (CC.YEAR / 4));
    if (season === 3) { g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, L.W, L.H); }
    if (season === 1) { g.fillStyle = 'rgba(220,180,90,0.06)'; g.fillRect(0, 0, L.W, L.H); }
    // the road along the side, and the plaza
    g.fillStyle = surf; g.globalAlpha = 0.85;
    g.fillRect(L.margin, L.margin, L.road, L.H - L.margin * 2);
    g.globalAlpha = 1;
    const P = L.plaza;
    g.fillStyle = surf; g.fillRect(P.x, P.y, P.w, P.h);
    g.strokeStyle = line; g.lineWidth = 1; g.setLineDash([4, 4]);
    g.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1); g.setLineDash([]);
    // the commune's name, painted on the concrete
    g.save(); g.fillStyle = ink; g.globalAlpha = 0.07; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `400 ${Math.min(P.h * 0.5, P.w / Math.max(6, S.name.length) * 1.4)}px "Allerta Stencil", Impact, sans-serif`;
    g.fillText(S.name.toUpperCase(), P.x + P.w * 0.5, P.y + P.h * 0.56); g.restore();
    // stage, standpipe, notice board
    g.fillStyle = ink; g.globalAlpha = 0.75; g.fillRect(L.stage.x - 14, L.stage.y - 8, 28, 6); g.globalAlpha = 1;
    g.fillStyle = v.colors.blue; g.beginPath(); g.arc(L.pipe.x, L.pipe.y, 3.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = muted; g.font = '600 9px "IBM Plex Mono", monospace'; g.textAlign = 'center';
    if (!L.compact) { g.fillText('STAGE', L.stage.x, L.stage.y + 9); g.fillText('STANDPIPE', L.pipe.x, L.pipe.y + 13); }
    // the fence (a wall if one has been built) with the gate
    const walled = !!S.buildings.wall;
    g.strokeStyle = walled ? ink : muted; g.lineWidth = walled ? 3 : 1.2; g.setLineDash(walled ? [] : [2, 3]);
    const gx = 4, gy1 = L.gate.y - 14, gy2 = L.gate.y + 14;
    g.beginPath();
    g.moveTo(gx, gy1); g.lineTo(gx, 4); g.lineTo(L.W - 4, 4); g.lineTo(L.W - 4, L.H - 4); g.lineTo(gx, L.H - 4); g.lineTo(gx, gy2);
    g.stroke(); g.setLineDash([]);
    g.fillStyle = v.colors.accent; g.fillRect(gx - 2, gy1 - 3, 5, 4); g.fillRect(gx - 2, gy2 - 1, 5, 4);
    g.save(); g.translate(gx + 9, L.gate.y); g.rotate(-Math.PI / 2); g.fillStyle = muted; g.font = '600 9px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillText('GATE', 0, 3); g.restore();
    // spare containers, stacked at the end of the plaza
    const spare = S.containers || 0;
    const sw = Math.min(L.cl, W_SPARE), sh = Math.min(L.cw, 14);
    const sx = P.x + P.w - sw - 8;
    for (let i = 0; i < Math.min(spare, 6); i++) {
      const col = Math.floor(i / 2), lay = i % 2;
      const x = sx - col * 4 - lay * 3, y = P.y + P.h - 10 - sh - col * (sh + 4) - lay * 4;
      if (y < P.y + 2) break;
      box(g, x, y, sw, sh, '#9aa3a9', true);
    }
    if (spare) { g.fillStyle = muted; g.font = '600 9px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.fillText(`${spare} SPARE`, P.x + P.w - 8, P.y + P.h - 2 - (spare > 1 ? 0 : 0)); }
    // buildings
    for (const it of L.items) {
      const B = it.type === 'villa' ? { color: '#d9a62b', short: 'Yours' } : CC.BUILDINGS[it.type];
      box(g, it.x, it.y, it.w, it.h, B.color, false, it.top);
      const light = it.type === 'clinic' || it.type === 'villa' || it.type === 'school';
      g.save();
      g.fillStyle = light ? '#1b2126' : '#fff';
      g.shadowColor = light ? 'transparent' : 'rgba(0,0,0,0.55)'; g.shadowBlur = 2;
      const label = (B.short || B.label).toUpperCase();
      if (it.size > 1) {
        g.font = `600 ${L.cw < 15 ? 8 : 9.5}px "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
        if (g.measureText(label).width > it.w - 4) g.font = '600 7px "IBM Plex Mono", monospace';
        g.fillText(label, it.x + it.w / 2, it.y + it.h / 2);
      } else if (L.cw >= 15) {
        g.translate(it.x + it.w / 2, it.y + it.h / 2); g.rotate(-Math.PI / 2);
        g.font = '600 8px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label.slice(0, 7), 0, 0.5);
      }
      g.restore();
      if (it.type === 'home') {
        const n = L.crowd[L.items.indexOf(it)] || 0;
        if (n > 2) { g.fillStyle = v.colors.bad; g.beginPath(); g.arc(it.x + it.w - 3, it.top ? it.y + 3 : it.y + it.h - 3, 2.5, 0, Math.PI * 2); g.fill(); }
      }
    }
  }
  // a container seen from above: roof ribs, a door end and a shadow
  function box(g, x, y, w, h, color, horizontal, doorDown) {
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 2, y + 2, w, h);
    g.fillStyle = color; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1;
    g.beginPath();
    if (horizontal) for (let i = x + 3; i < x + w - 1; i += 4) { g.moveTo(i + 0.5, y + 1); g.lineTo(i + 0.5, y + h - 1); }
    else for (let i = y + 3; i < y + h - 1; i += 4) { g.moveTo(x + 1, i + 0.5); g.lineTo(x + w - 1, i + 0.5); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, horizontal ? w : 2, horizontal ? 2 : h);
    if (!horizontal) { g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(x, doorDown ? y + h - 3 : y, w, 3); }
  }

  // ───────────────────────── where people are ─────────────────────────
  function spotFor(v, c, b, slot) {
    const S = CC.S, L = v.L, P = L.plaza;
    const r1 = hash(c.id * 13 + slot * 7), r2 = hash(c.id * 31 + slot * 3 + 1);
    const plazaPt = () => ({ x: P.x + 20 + r1 * (P.w - 40 - L.cl - 10), y: P.y + 16 + r2 * (P.h - 30), plaza: true });
    if (b === 'home' || b == null) { const h = L.homeOf[c.id]; return h ? atDoor(h, c, slot) : plazaPt(); }
    if (b === 'lockup') { const lk = L.byType.lockup; return lk ? atDoor(lk[c.id % lk.length], c, slot, true) : { x: P.x + 10 + r1 * 14, y: P.y + P.h - 10 - r2 * 14, plaza: true }; }
    let place = b === 'work' ? WORKPLACE[c.trade] || 'plaza' : PLACE[b] || 'plaza';
    if (place.includes('|')) place = place.split('|').find((p) => L.byType[p]) || 'plaza';
    if (place === 'gate') return { x: L.gate.x + 14 + r1 * 16, y: L.gate.y - 12 + r2 * 24, plaza: true };
    if (place === 'protest') return { x: L.stage.x - 40 + r1 * 80, y: L.stage.y + 12 + r2 * 26, plaza: true, protest: true };
    if (place === 'stage') return { x: L.stage.x - 46 + r1 * 92, y: L.stage.y + 14 + r2 * 30, plaza: true };
    if (place === 'home') return spotFor(v, c, 'home', slot);
    if (place === 'plaza' || !L.byType[place]) return plazaPt();
    const list = L.byType[place];
    return atDoor(list[Math.floor(hash(c.id * 5 + slot) * list.length)], c, slot);
  }
  function atDoor(it, c, slot, tight) {
    const r1 = hash(c.id * 17 + slot * 11), r2 = hash(c.id * 23 + slot * 5 + 2);
    const spread = tight ? it.w * 0.5 : it.w * 0.9 + 6;
    return { x: it.x + it.w / 2 + (r1 - 0.5) * spread, y: it.door.y + (it.top ? 1 : -1) * (r2 * (it.door.plaza ? 10 : 4)), plaza: it.door.plaza, item: it };
  }
  // route between two spots: along the aisles and the side road
  function route(v, a, b) {
    const L = v.L;
    if (a.plaza && b.plaza) return [a, b];
    if (!a.plaza && !b.plaza && Math.abs(a.y - b.y) < 6) return [a, b];
    const pts = [a];
    pts.push({ x: L.roadX, y: a.y });
    pts.push({ x: L.roadX, y: b.y });
    pts.push(b);
    return pts;
  }
  function along(pts, t) {
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
    let want = total * t;
    for (let i = 1; i < pts.length; i++) { if (want <= seg[i - 1] || i === pts.length - 1) { const k = seg[i - 1] ? Math.min(1, want / seg[i - 1]) : 1; return { x: lerp(pts[i - 1].x, pts[i].x, k), y: lerp(pts[i - 1].y, pts[i].y, k) }; } want -= seg[i - 1]; }
    return pts[pts.length - 1];
  }
  function planFor(v, c) {
    const S = CC.S;
    let acts;
    if (c.status === 'detained') acts = ['lockup', 'lockup'];
    else if (c.age < 6) acts = ['home', 'home'];
    else { acts = (c.today || []).slice(0, 2); if (acts.length === 0) acts = ['home', 'home']; if (acts.length === 1) acts.push(acts[0] === 'work' && c.age >= 16 ? 'work' : 'home'); }
    const home = spotFor(v, c, c.status === 'detained' ? 'lockup' : 'home', 0);
    const A = spotFor(v, c, acts[0], 1), B = spotFor(v, c, acts[1], 2);
    return { acts, home, A, B, rHA: route(v, home, A), rAB: route(v, A, B), rBH: route(v, B, home) };
  }
  function positionAt(v, c, plan, p) {
    const o = hash(c.id * 3 + 9) * 0.05;
    const seg = (a, b) => (p - a - o) / (b - a);
    const wob = (pt, k) => ({ x: pt.x + Math.sin(p * 90 + c.id) * k, y: pt.y + Math.cos(p * 70 + c.id * 2) * k * 0.6 });
    if (c.status === 'detained') return { ...wob(plan.home, 1.2), act: 'lockup', vis: true };
    if (p < 0.1 + o) return { ...plan.home, act: 'home', vis: p > 0.07 };
    if (p < 0.18 + o) return { ...along(plan.rHA, ease(seg(0.1, 0.18))), act: plan.acts[0], walking: true, vis: true };
    if (p < 0.45 + o) return { ...wob(plan.A, 1.4), act: plan.acts[0], vis: true, at: plan.A };
    if (p < 0.53 + o) return { ...along(plan.rAB, ease(seg(0.45, 0.53))), act: plan.acts[1], walking: true, vis: true };
    if (p < 0.78 + o) return { ...wob(plan.B, 1.4), act: plan.acts[1], vis: true, at: plan.B };
    if (p < 0.86 + o) return { ...along(plan.rBH, ease(seg(0.78, 0.86))), act: 'home', walking: true, vis: true };
    return { ...plan.home, act: 'home', vis: p < 0.93 };
  }

  // ───────────────────────── drawing ─────────────────────────
  function dotColor(v, c, TRADE) {
    if (colorBy === 'party') { const p = CC.S.parties.find((x) => x.id === c.party && !x.dissolved); return p ? p.color : '#9aa3a9'; }
    if (colorBy === 'opinion') { const o = c.isPlayer ? 100 : c.opinion; return o > 25 ? v.colors.good : o < -25 ? v.colors.bad : '#9aa3a9'; }
    if (colorBy === 'mood') { const n = CC.needAvg ? CC.needAvg(c) : 50; return n > 60 ? v.colors.good : n < 40 ? v.colors.bad : v.colors.warn; }
    return TRADE[c.age < 16 ? 'child' : c.trade] || '#777';
  }
  function draw(v, p) {
    const S = CC.S, L = v.L, g = v.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(v.bg, 0, 0);
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const people = S.people.filter(alive);
    if (!v.plans || v.planDay !== S.day || v.planN !== people.length) { v.plans = {}; for (const c of people) v.plans[c.id] = planFor(v, c); v.planDay = S.day; v.planN = people.length; }
    const TRADE = v.opts.colors || {};
    const pos = [];
    // night: lit windows
    const night = p < 0.12 ? (0.12 - p) / 0.12 : p > 0.82 ? Math.min(1, (p - 0.82) / 0.12) : 0;
    for (const c of people) {
      const pl = v.plans[c.id];
      if (!pl) continue;
      const q = positionAt(v, c, pl, p);
      pos.push({ c, ...q });
    }
    // protest banner
    const protesting = pos.filter((x) => x.vis && x.act === 'protest' && !x.walking);
    if (protesting.length >= 2) {
      g.fillStyle = v.colors.bad; g.font = '700 10px "IBM Plex Mono", monospace'; g.textAlign = 'center';
      g.fillText(`PROTEST · ${protesting.length}`, L.stage.x, L.stage.y + 50);
    }
    const sel = v.opts.selected;
    for (const x of pos) {
      if (!x.vis) continue;
      const c = x.c;
      const r = c.isPlayer ? 4.6 : c.age < 16 ? 2.6 : 3.4;
      let fill = dotColor(v, c, TRADE);
      if (x.act === 'naked' && !x.walking) fill = '#e7b593';
      g.beginPath(); g.arc(x.x, x.y, r, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      g.lineWidth = c.isPlayer ? 2 : 1;
      g.strokeStyle = c.status === 'detained' ? v.colors.warn : x.act === 'uniform' ? '#2f5d8a' : c.isPlayer ? v.colors.accent : 'rgba(0,0,0,0.45)';
      if (x.act === 'uniform') g.lineWidth = 2;
      g.stroke();
      if (x.act === 'protest' && !x.walking) { g.strokeStyle = v.colors.bad; g.lineWidth = 1; g.beginPath(); g.moveTo(x.x + 2, x.y - 2); g.lineTo(x.x + 2, x.y - 9); g.stroke(); g.fillStyle = v.colors.bad; g.fillRect(x.x + 2, x.y - 10, 5, 3); }
      if (x.act === 'weapon' && !x.walking) { g.fillStyle = v.colors.bad; g.fillRect(x.x + 3, x.y - 1, 3, 1.5); }
      if (sel === c.id || (v.hover && v.hover.c === c)) { g.strokeStyle = v.colors.ink; g.lineWidth = 1.5; g.beginPath(); g.arc(x.x, x.y, r + 3.5, 0, Math.PI * 2); g.stroke(); }
    }
    if (night > 0) {
      g.fillStyle = `rgba(8, 16, 34, ${0.42 * night})`; g.fillRect(0, 0, L.W, L.H);
      g.fillStyle = `rgba(255, 210, 120, ${0.85 * night})`;
      for (const it of L.items) if (it.type === 'home' || it.type === 'villa' || (it.type === 'bar' && p > 0.82 && p < 0.97)) { const wy = it.top ? it.y + it.h - 8 : it.y + 5; g.fillRect(it.x + it.w / 2 - 2, wy, 4, 3); }
    }
    v.pos = pos;
    // the clock
    const hr = 5 + p * 20, h = Math.floor(hr) % 24, m = Math.floor((hr % 1) * 60);
    const label = `YESTERDAY ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    g.font = '600 10px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    const tw = g.measureText(label).width;
    g.fillStyle = v.colors.surf; g.globalAlpha = 0.85; g.fillRect(L.W - tw - 18, 8, tw + 10, 16); g.globalAlpha = 1;
    g.fillStyle = v.colors.ink; g.fillText(label, L.W - 13, 20);
    if (v.clock) v.clock.textContent = label;
  }
  function frame() {
    raf = 0;
    for (let i = views.length - 1; i >= 0; i--) if (!views[i].cv.isConnected) views.splice(i, 1);
    if (!views.length || !CC.S) return;
    const p = ((now() % LOOP) + LOOP) % LOOP / LOOP;
    for (const v of views) { try { draw(v, p); } catch (e) { /* a bad frame should never break the game */ } }
    raf = requestAnimationFrame(frame);
  }

  // ───────────────────────── interaction ─────────────────────────
  function hitTest(v, mx, my) {
    let best = null, bd = 10;
    for (const x of v.pos || []) { if (!x.vis) continue; const d = Math.hypot(x.x - mx, x.y - my); if (d < bd) { bd = d; best = x; } }
    if (best) return { person: best };
    for (const it of v.L.items) if (mx >= it.x && mx <= it.x + it.w && my >= it.y && my <= it.y + it.h) return { item: it };
    return null;
  }
  function describe(hit) {
    const S = CC.S;
    if (hit.person) {
      const c = hit.person.c;
      const nm = c.isPlayer ? 'You' : `${c.first} ${c.last}`;
      const act = hit.person.act;
      const what = act === 'lockup' ? 'in the lock-up' : act === 'home' ? (hit.person.walking ? 'heading home' : 'at home') : (hit.person.walking ? 'on the way: ' : '') + (DOING[act] || act);
      return `<b>${esc(nm)}</b> · ${esc(Math.floor(c.age))} · ${esc(c.age < 16 ? 'child' : CC.TRADES[c.trade] ? CC.TRADES[c.trade].label : c.isPlayer ? 'you' : c.trade)}<br>${esc(what)}`;
    }
    const it = hit.item;
    if (it.type === 'villa') return '<b>Your own container</b><br>Private, and locked.';
    const B = CC.BUILDINGS[it.type];
    let extra = '';
    if (it.type === 'home' && curView) { const n = curView.L.crowd[curView.L.items.indexOf(it)] || 0; extra = `<br>${n} ${n === 1 ? 'person lives' : 'people live'} here${n > 2 ? ', crowded' : ''}`; }
    return `<b>${esc(B.label)}</b><br>${esc(B.desc)}${extra}`;
  }
  let curView = null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  function wire(v) {
    const tip = v.tip;
    const pt = (e) => { const r = v.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    v.cv.addEventListener('mousemove', (e) => {
      const { x, y } = pt(e);
      const hit = hitTest(v, x, y);
      v.hover = hit && hit.person ? hit.person : null;
      v.cv.style.cursor = hit && hit.person ? 'pointer' : 'default';
      if (!tip) return;
      if (!hit) { tip.hidden = true; return; }
      curView = v;
      tip.innerHTML = describe(hit);
      tip.hidden = false;
      const left = Math.min(v.L.W - 200, Math.max(0, x + 12));
      tip.style.left = left + 'px'; tip.style.top = Math.max(0, y + 14) + 'px';
    });
    v.cv.addEventListener('mouseleave', () => { v.hover = null; if (tip) tip.hidden = true; });
    v.cv.addEventListener('click', (e) => {
      const { x, y } = pt(e);
      const hit = hitTest(v, x, y);
      if (hit && hit.person && v.opts.onPick) v.opts.onPick(hit.person.c.id);
    });
  }

  // ───────────────────────── public ─────────────────────────
  function mount(canvas, opts) {
    const v = { cv: canvas, ctx: canvas.getContext('2d'), opts: opts || {}, tip: opts && opts.tip };
    build(v);
    wire(v);
    views.push(v);
    if (!raf) raf = requestAnimationFrame(frame);
    if (opts && opts.clock) v.clock = opts.clock;
    return v;
  }
  function rebuildAll() { for (const v of views) if (v.cv.isConnected) { build(v); v.plans = null; } }
  window.addEventListener('resize', () => { clearTimeout(rebuildAll.t); rebuildAll.t = setTimeout(rebuildAll, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuildAll);
  window.CCYard = {
    mount,
    rebuild: rebuildAll,
    setPaused(on) { if (on && !paused) { pausedAt = performance.now(); paused = true; } else if (!on && paused) { offset += performance.now() - pausedAt; paused = false; } },
    get paused() { return paused; },
    setColorBy(k) { colorBy = k; },
    get colorBy() { return colorBy; },
    // where everyone is at this moment, for a text summary under the map
    census() {
      const v = views.find((x) => x.cv.isConnected);
      if (!v || !v.pos) return null;
      const out = {};
      for (const x of v.pos) { if (!x.vis) { out.asleep = (out.asleep || 0) + 1; continue; } const k = x.act === 'lockup' ? 'in the lock-up' : x.act === 'home' ? 'at home' : DOING[x.act] || x.act; out[k] = (out[k] || 0) + 1; }
      return out;
    },
  };
})();
