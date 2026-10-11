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
  // (V6) the yard as it is: asphalt with painted lines, a concrete plaza, containers with
  // depth, rust and door bars, lamp posts, a chain-link fence (or a wall). Its own palette,
  // the same in light and dark mode: it is a place, not a page.
  const YC = { asphalt: '#3a3f43', asphalt2: '#34383c', road: '#2c3034', plaza: '#8f8a80', plaza2: '#86817a', paint: '#e7b53b', white: '#e9e4d8', fence: '#9aa1a6', shadow: 'rgba(0,0,0,0.38)' };
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
    // asphalt, with grain and the odd crack and oil stain
    g.fillStyle = YC.asphalt; g.fillRect(0, 0, L.W, L.H);
    for (let i = 0; i < (L.W * L.H) / 40; i++) { const x = hash(i * 3) * L.W, y = hash(i * 7 + 1) * L.H, k = hash(i * 11); g.fillStyle = k < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.05)'; g.fillRect(x, y, 1.3, 1.3); }
    for (let i = 0; i < 7; i++) { const x = hash(i * 91) * L.W, y = hash(i * 37 + 5) * L.H, r = 6 + hash(i * 13) * 16; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.6, hash(i) * 3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { let x = hash(i * 17 + 3) * L.W, y = hash(i * 29 + 7) * L.H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (hash(i * 5 + k) - 0.5) * 24; y += (hash(i * 7 + k * 3) - 0.3) * 14; g.lineTo(x, y); } g.stroke(); }
    const season = Math.floor((S.day % CC.YEAR) / (CC.YEAR / 4));
    if (season === 3) { g.fillStyle = 'rgba(235,240,245,0.16)'; g.fillRect(0, 0, L.W, L.H); }
    if (season === 1) { g.fillStyle = 'rgba(220,180,90,0.05)'; g.fillRect(0, 0, L.W, L.H); }
    // the road along the side: darker, with a dashed white line
    g.fillStyle = YC.road; g.fillRect(L.margin, L.margin, L.road, L.H - L.margin * 2);
    g.strokeStyle = 'rgba(233,228,216,0.55)'; g.lineWidth = 1.5; g.setLineDash([7, 7]);
    g.beginPath(); g.moveTo(L.roadX, L.margin + 6); g.lineTo(L.roadX, L.H - L.margin - 6); g.stroke(); g.setLineDash([]);
    // the aisles between rows of containers: a painted yellow walkway edge
    g.strokeStyle = 'rgba(231,181,59,0.45)'; g.lineWidth = 1.2;
    const rowsY = [...new Set(L.items.map((it) => it.door.plaza ? null : it.door.y).filter((y) => y != null))];
    for (const y of rowsY) { g.setLineDash([10, 6]); g.beginPath(); g.moveTo(L.roadX + L.road / 2 + 4, y); g.lineTo(L.W - L.margin, y); g.stroke(); }
    g.setLineDash([]);
    // the plaza: poured concrete in slabs, with the commune's name painted on it
    const P = L.plaza;
    g.fillStyle = YC.shadow; g.fillRect(P.x + 2, P.y + 2, P.w, P.h);
    g.fillStyle = YC.plaza; g.fillRect(P.x, P.y, P.w, P.h);
    for (let i = 0; i < 260; i++) { g.fillStyle = hash(i * 5 + 2) < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; g.fillRect(P.x + hash(i * 3 + 1) * P.w, P.y + hash(i * 7) * P.h, 2, 2); }
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
    for (let x = P.x + 36; x < P.x + P.w; x += 36) { g.beginPath(); g.moveTo(x + 0.5, P.y); g.lineTo(x + 0.5, P.y + P.h); g.stroke(); }
    g.beginPath(); g.moveTo(P.x, P.y + P.h / 2 + 0.5); g.lineTo(P.x + P.w, P.y + P.h / 2 + 0.5); g.stroke();
    g.strokeStyle = YC.paint; g.lineWidth = 2; g.strokeRect(P.x + 3, P.y + 3, P.w - 6, P.h - 6);
    g.save(); g.fillStyle = YC.white; g.globalAlpha = 0.22; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `400 ${Math.min(P.h * 0.5, P.w / Math.max(6, S.name.length) * 1.4)}px "Allerta Stencil", Impact, sans-serif`;
    g.fillText(S.name.toUpperCase(), P.x + P.w * 0.5, P.y + P.h * 0.56); g.restore();
    // the stage: a little timber platform; the standpipe with its puddle
    const sx0 = L.stage.x - 18, sy0 = L.stage.y - 10;
    g.fillStyle = YC.shadow; g.fillRect(sx0 + 2, sy0 + 2, 36, 9);
    g.fillStyle = '#7a5532'; g.fillRect(sx0, sy0, 36, 9);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; for (let x = sx0 + 6; x < sx0 + 36; x += 6) { g.beginPath(); g.moveTo(x + 0.5, sy0); g.lineTo(x + 0.5, sy0 + 9); g.stroke(); }
    const pud = g.createRadialGradient(L.pipe.x, L.pipe.y + 3, 0, L.pipe.x, L.pipe.y + 3, 12);
    pud.addColorStop(0, 'rgba(90,120,150,0.55)'); pud.addColorStop(1, 'rgba(90,120,150,0)');
    g.fillStyle = pud; g.beginPath(); g.ellipse(L.pipe.x, L.pipe.y + 3, 12, 7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f6fa3'; g.beginPath(); g.arc(L.pipe.x, L.pipe.y, 3.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9fd0f5'; g.fillRect(L.pipe.x - 1, L.pipe.y - 1, 2, 2);
    g.fillStyle = 'rgba(233,228,216,0.75)'; g.font = '600 9px "IBM Plex Mono", monospace'; g.textAlign = 'center';
    if (!L.compact) { g.fillText('STAGE', L.stage.x, L.stage.y + 11); g.fillText('STANDPIPE', L.pipe.x, L.pipe.y + 16); }
    // lamp posts round the plaza (they light up at night)
    L.lamps = [];
    for (let k = 0; k < 4; k++) L.lamps.push({ x: P.x + P.w * (0.12 + k * 0.26), y: k % 2 ? P.y + 6 : P.y + P.h - 6 });
    L.lamps.push({ x: L.roadX, y: L.gate.y - 30 }, { x: L.roadX, y: L.gate.y + 30 });
    for (const lp of L.lamps) { g.fillStyle = YC.shadow; g.beginPath(); g.arc(lp.x + 1.5, lp.y + 1.5, 3, 0, Math.PI * 2); g.fill(); g.fillStyle = '#5b6266'; g.beginPath(); g.arc(lp.x, lp.y, 3, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f3e3b0'; g.beginPath(); g.arc(lp.x, lp.y, 1.4, 0, Math.PI * 2); g.fill(); }
    // the fence: chain-link on posts, or a concrete wall if one has been built; the gate
    const walled = !!S.buildings.wall;
    const gx = 4, gy1 = L.gate.y - 14, gy2 = L.gate.y + 14;
    const fencePath = () => { g.beginPath(); g.moveTo(gx, gy1); g.lineTo(gx, 4); g.lineTo(L.W - 4, 4); g.lineTo(L.W - 4, L.H - 4); g.lineTo(gx, L.H - 4); g.lineTo(gx, gy2); };
    if (walled) { g.strokeStyle = '#b8b2a6'; g.lineWidth = 5; fencePath(); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; fencePath(); g.stroke(); }
    else {
      g.strokeStyle = YC.fence; g.lineWidth = 1; g.setLineDash([1, 2]); fencePath(); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#c3c8cc';
      const posts = [[gx, gy1], [gx, 4], [L.W - 4, 4], [L.W - 4, L.H - 4], [gx, L.H - 4], [gx, gy2]];
      for (let i = 0; i + 1 < posts.length; i++) { const [ax, ay] = posts[i], [bx, by] = posts[i + 1], n = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / 40)); for (let k = 0; k <= n; k++) g.fillRect(ax + (bx - ax) * k / n - 1, ay + (by - ay) * k / n - 1, 2.5, 2.5); }
    }
    g.fillStyle = YC.paint; g.fillRect(gx - 2, gy1 - 3, 5, 4); g.fillRect(gx - 2, gy2 - 1, 5, 4);
    g.strokeStyle = YC.paint; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(gx, gy1); g.lineTo(gx, gy2); g.stroke(); g.setLineDash([]);
    g.save(); g.translate(gx + 9, L.gate.y); g.rotate(-Math.PI / 2); g.fillStyle = YC.white; g.font = '600 9px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillText('GATE', 0, 3); g.restore();
    // spare containers, stacked at the end of the plaza
    const spare = S.containers || 0;
    const sw = Math.min(L.cl, W_SPARE), sh = Math.min(L.cw, 14);
    const sxs = P.x + P.w - sw - 8;
    const SPARE_COL = ['#7d8a91', '#a35b3a', '#5f7d5c', '#8a7350'];
    for (let i = 0; i < Math.min(spare, 6); i++) {
      const col = Math.floor(i / 2), lay = i % 2;
      const x = sxs - col * 4 - lay * 3, y = P.y + P.h - 10 - sh - col * (sh + 4) - lay * 4;
      if (y < P.y + 2) break;
      box(g, x, y, sw, sh, SPARE_COL[i % SPARE_COL.length], true, false, i + 50);
    }
    if (spare) { g.fillStyle = YC.white; g.font = '600 9px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.fillText(`${spare} SPARE`, P.x + P.w - 8, P.y + P.h - 2); }
    // buildings
    L.items.forEach((it, idx) => {
      const B = it.type === 'villa' ? { color: '#d9a62b', short: 'Yours' } : CC.BUILDINGS[it.type];
      box(g, it.x, it.y, it.w, it.h, B.color, false, it.top, idx);
      const light = it.type === 'clinic' || it.type === 'villa' || it.type === 'school';
      g.save();
      g.fillStyle = light ? '#1b2126' : '#fff';
      g.shadowColor = light ? 'transparent' : 'rgba(0,0,0,0.6)'; g.shadowBlur = 2;
      const label = (B.short || B.label).toUpperCase();
      if (it.size > 1) {
        g.font = `400 ${L.cw < 15 ? 9 : 11}px "Allerta Stencil", "IBM Plex Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
        if (g.measureText(label).width > it.w - 4) g.font = '600 7px "IBM Plex Mono", monospace';
        g.fillText(label, it.x + it.w / 2, it.y + it.h / 2);
      } else if (L.cw >= 15) {
        g.translate(it.x + it.w / 2, it.y + it.h / 2); g.rotate(-Math.PI / 2);
        g.font = '400 9px "Allerta Stencil", "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label.slice(0, 7), 0, 0.5);
      }
      g.restore();
      if (it.type === 'home') {
        const n = L.crowd[L.items.indexOf(it)] || 0;
        if (n > 2) { g.fillStyle = v.colors.bad; g.beginPath(); g.arc(it.x + it.w - 3, it.top ? it.y + 3 : it.y + it.h - 3, 2.5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 0.8; g.stroke(); }
      }
    });
  }
  // a container seen from above: a shadow, the roof with its ribs, a lit edge and a shaded
  // side (it stands 2.6 m tall), rust and wear, and the door end with its locking bars
  function box(g, x, y, w, h, color, horizontal, doorDown, seed) {
    const sd = seed || 0;
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(x + 3, y + 3, w, h);
    g.fillStyle = shade(color, -0.32); g.fillRect(x, y, w, h);                  // the visible side, in shadow
    g.fillStyle = color; g.fillRect(x, y, w - (horizontal ? 0 : 2), h - (horizontal ? 2 : 0)); // the roof
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1;
    g.beginPath();
    if (horizontal) for (let i = x + 3; i < x + w - 1; i += 3.5) { g.moveTo(i + 0.5, y + 1); g.lineTo(i + 0.5, y + h - 3); }
    else for (let i = y + 3; i < y + h - 1; i += 3.5) { g.moveTo(x + 1, i + 0.5); g.lineTo(x + w - 3, i + 0.5); }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    if (horizontal) for (let i = x + 4.5; i < x + w - 1; i += 3.5) { g.moveTo(i + 0.5, y + 1); g.lineTo(i + 0.5, y + h - 3); }
    else for (let i = y + 4.5; i < y + h - 1; i += 3.5) { g.moveTo(x + 1, i + 0.5); g.lineTo(x + w - 3, i + 0.5); }
    g.stroke();
    // a lit top edge
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, y, horizontal ? w : 1.5, horizontal ? 1.5 : h);
    // rust and wear
    for (let i = 0; i < 4; i++) {
      const rx = x + 2 + hash(sd * 31 + i * 7) * (w - 6), ry = y + 2 + hash(sd * 17 + i * 13) * (h - 6), rr = 1.2 + hash(sd * 7 + i) * 2.5;
      g.fillStyle = `rgba(${120 + (hash(sd + i) * 40) | 0},55,25,${0.25 + hash(sd * 3 + i) * 0.3})`;
      g.beginPath(); g.ellipse(rx, ry, rr, rr * 0.7, 0, 0, Math.PI * 2); g.fill();
    }
    if (!horizontal) {
      // the door end: darker band with two locking bars
      const dy = doorDown ? y + h - 4 : y;
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x, dy, w, 4);
      g.fillStyle = 'rgba(220,220,220,0.55)';
      g.fillRect(x + w * 0.3, dy + 0.8, 1, 2.4); g.fillRect(x + w * 0.7 - 1, dy + 0.8, 1, 2.4);
    }
  }
  // a colour lighter or darker
  function shade(hexCol, k) {
    const c = hexCol.replace('#', ''), n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    r = f(r); gg = f(gg); b = f(b);
    return `rgb(${r},${gg},${b})`;
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
    // (V6) people as little figures seen from above: a shadow, shoulders in their colour, a head
    const SKIN = ['#f1c9a5', '#e0ac85', '#c68b62', '#9a6646', '#6e4630', '#f3d6bd'];
    for (const x of pos) {
      if (!x.vis) continue;
      const c = x.c;
      const r = (c.isPlayer ? 4.6 : c.age < 16 ? 2.7 : 3.5) * (L.compact ? 1 : 1.3);
      let fill = dotColor(v, c, TRADE);
      const naked = x.act === 'naked' && !x.walking;
      const skin = SKIN[Math.floor(hash(c.id * 41 + 3) * SKIN.length)];
      if (naked) fill = skin;
      // a walking bob
      const bob = x.walking ? Math.sin(p * 900 + c.id) * 0.6 : 0;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x.x + 1.8, x.y + 2.2, r * 1.05, r * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = fill; g.beginPath(); g.ellipse(x.x, x.y + bob, r * 1.12, r * 0.82, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = c.isPlayer ? 1.6 : 0.8;
      g.strokeStyle = c.status === 'detained' ? v.colors.warn : x.act === 'uniform' ? '#2f5d8a' : 'rgba(0,0,0,0.55)';
      if (x.act === 'uniform') g.lineWidth = 2;
      g.stroke();
      g.fillStyle = skin; g.beginPath(); g.arc(x.x, x.y - r * 0.15 + bob, r * 0.58, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.6; g.stroke();
      if (c.isPlayer) {
        // you: a yellow ring and a little marker above
        g.strokeStyle = '#f2b632'; g.lineWidth = 1.6; g.beginPath(); g.arc(x.x, x.y, r + 3, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#f2b632'; g.beginPath(); g.moveTo(x.x, x.y - r - 4); g.lineTo(x.x - 3.5, x.y - r - 9.5); g.lineTo(x.x + 3.5, x.y - r - 9.5); g.closePath(); g.fill();
      }
      if (x.act === 'protest' && !x.walking) { g.strokeStyle = '#ddd'; g.lineWidth = 1; g.beginPath(); g.moveTo(x.x + 3, x.y - 1); g.lineTo(x.x + 3, x.y - 10); g.stroke(); g.fillStyle = v.colors.bad; g.fillRect(x.x + 3, x.y - 11, 6, 4); }
      if (x.act === 'weapon' && !x.walking) { g.fillStyle = '#1b1b1b'; g.fillRect(x.x + 3, x.y - 1, 4, 1.6); }
      if (sel === c.id || (v.hover && v.hover.c === c)) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.setLineDash([3, 2]); g.beginPath(); g.arc(x.x, x.y, r + 4.5, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    }
    // night: the yard goes dark except where the light is - lamp posts, lit windows, string lights over the plaza
    if (night > 0) {
      const nc = v.night || (v.night = document.createElement('canvas'));
      if (nc.width !== v.cv.width || nc.height !== v.cv.height) { nc.width = v.cv.width; nc.height = v.cv.height; }
      const n = nc.getContext('2d');
      n.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      n.globalCompositeOperation = 'source-over'; n.clearRect(0, 0, L.W, L.H);
      n.fillStyle = `rgba(6, 12, 30, ${0.62 * night})`; n.fillRect(0, 0, L.W, L.H);
      n.globalCompositeOperation = 'destination-out';
      const hole = (hx, hy, rad, a) => { const gr = n.createRadialGradient(hx, hy, 0, hx, hy, rad); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); n.fillStyle = gr; n.fillRect(hx - rad, hy - rad, rad * 2, rad * 2); };
      for (const lp of L.lamps || []) hole(lp.x, lp.y, 42, 0.85);
      const lit = L.items.filter((it) => it.type === 'home' || it.type === 'villa' || (it.type === 'bar' && p > 0.82 && p < 0.97));
      for (const it of lit) hole(it.x + it.w / 2, it.door.y, 16, 0.7);
      n.globalCompositeOperation = 'source-over';
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(nc, 0, 0); g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      // warm light from the lamps and the windows
      g.globalCompositeOperation = 'lighter';
      for (const lp of L.lamps || []) { const gr = g.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, 34); gr.addColorStop(0, `rgba(255,200,120,${0.35 * night})`); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(lp.x - 34, lp.y - 34, 68, 68); }
      for (const it of lit) { const wy = it.top ? it.y + it.h - 8 : it.y + 5; g.fillStyle = `rgba(255, 205, 120, ${0.9 * night})`; g.fillRect(it.x + it.w / 2 - 2, wy, 4, 3); const gr = g.createRadialGradient(it.x + it.w / 2, it.door.y, 0, it.x + it.w / 2, it.door.y, 12); gr.addColorStop(0, `rgba(255,190,100,${0.3 * night})`); gr.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = gr; g.fillRect(it.x + it.w / 2 - 12, it.door.y - 12, 24, 24); }
      // string lights across the plaza, swaying a little
      const P = L.plaza;
      for (let k = 0; k < 3; k++) {
        const y0 = P.y + P.h * (0.25 + k * 0.25), sag = 7 + k * 2, sway = Math.sin(p * 40 + k) * 1.2;
        // the wire they hang from
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = `rgba(20,20,20,${0.6 * night})`; g.lineWidth = 0.8; g.beginPath();
        for (let i = 0; i <= 36; i++) { const t = i / 36, bx = P.x + 8 + (P.w - 16) * t, by = y0 + Math.sin(t * Math.PI) * sag + sway * Math.sin(t * Math.PI) - 1.5; if (i) g.lineTo(bx, by); else g.moveTo(bx, by); }
        g.stroke();
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i <= 18; i++) {
          const t = i / 18, bx = P.x + 8 + (P.w - 16) * t, by = y0 + Math.sin(t * Math.PI) * sag + sway * Math.sin(t * Math.PI);
          const col = ['255,90,70', '255,210,90', '120,200,255', '140,255,150'][(i + k) % 4];
          g.fillStyle = `rgba(${col},${0.95 * night})`; g.beginPath(); g.arc(bx, by, 1.4, 0, Math.PI * 2); g.fill();
          const gr = g.createRadialGradient(bx, by, 0, bx, by, 6); gr.addColorStop(0, `rgba(${col},${0.35 * night})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(bx - 6, by - 6, 12, 12);
        }
      }
      g.globalCompositeOperation = 'source-over';
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
    let best = null, bd = v.L.compact ? 10 : 12;
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
    // jump the replayed day to a moment (0 = dawn, 1 = night): for the screenshots and tests
    setTime(pp) { const base = (paused ? pausedAt : performance.now()) - T0; offset = base - pp * LOOP; },
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
