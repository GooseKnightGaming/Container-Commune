/*
  CONTAINER COMMUNE — simulation core
  People, needs, laws, justice, economy and the life cycle (partnerships, births, ageing,
  newcomers, departures, deaths). Politics lives in politics.js. No DOM code in here.

  The whole game state is one plain object (S) so it can be saved as JSON.
*/
(function (root) {
  'use strict';
  const CC = root.CC;
  const { BEH, DAY_BEH, WHO, RULES, ENF, PUN, TRAITS, MOTIVE, BUILDINGS, NEEDS, YEAR } = CC;
  const PLAYER = 0;
  CC.PLAYER = PLAYER;
  let S = null;

  // ───────────────────────── helpers ─────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rnd() { S.rs = (Math.imul(S.rs, 1664525) + 1013904223) >>> 0; return S.rs / 4294967296; }
  const chance = (p) => rnd() < p;
  const pick = (a) => (a.length ? a[Math.floor(rnd() * a.length)] : undefined);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const P = (id) => (id == null ? null : S.people[id]);
  const alive = (c) => c && (c.status === 'free' || c.status === 'detained');
  const here = () => S.people.filter(alive);
  const free = () => S.people.filter((c) => c.status === 'free');
  const npcFree = () => S.people.filter((c) => c.status === 'free' && !c.isPlayer);
  const adultsHere = () => here().filter((c) => c.age >= 16);
  const has = (c, t) => c.traits.includes(t);
  const player = () => S.people[PLAYER];
  const leaderIsPlayer = () => S.gov.leader === PLAYER;
  const regimeOp = (c) => (leaderIsPlayer() ? c.opinion : c.govt);
  const nm = (c) => (c.isPlayer ? 'you' : c.first);
  const Nm = (c) => (c.isPlayer ? 'You' : c.first);
  const was = (c) => (c.isPlayer ? 'were' : 'was');
  const list = (names) => (names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
  function blame(c, d) { c.govt = clamp(c.govt + d, -100, 100); if (leaderIsPlayer()) c.opinion = clamp(c.opinion + d, -100, 100); }
  function log(text, kind) { S.chronicle.push({ day: S.day, text, kind: kind || 'event' }); if (S.chronicle.length > 400) S.chronicle.shift(); }
  CC.isOfficial = (c) => c.trade === 'warden' || S.gov.council.includes(c.id) || S.gov.leader === c.id;
  CC._internals = { clamp, rnd, chance, pick, shuffle, P, alive, here, free, npcFree, adultsHere, has, player, leaderIsPlayer, regimeOp, nm, Nm, was, list, blame, log };

  // ───────────────────────── people ─────────────────────────
  const TRADE_W = { gardener: 4, cook: 2, mechanic: 2, labourer: 3, medic: 1.2, teacher: 1, warden: 1.6, organiser: 1, artist: 1, trader: 1 };
  function randTrade() {
    const tot = Object.values(TRADE_W).reduce((a, b) => a + b, 0);
    let r = rnd() * tot;
    for (const [k, w] of Object.entries(TRADE_W)) { r -= w; if (r <= 0) return k; }
    return 'labourer';
  }
  const CLASH = [['Lazy', 'Diligent'], ['Timid', 'Hot-headed'], ['Loyal', 'Rebellious'], ['Loyal', 'Cynic'], ['Idealist', 'Cynic'], ['Generous', 'Light-fingered']];
  function randTraits(n) {
    const all = Object.keys(TRAITS);
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 50) {
      const t = pick(all);
      if (out.includes(t) || CLASH.some(([a, b]) => (t === a && out.includes(b)) || (t === b && out.includes(a)))) continue;
      out.push(t);
    }
    return out;
  }
  function pickFirst() {
    const used = new Set(S.people.filter(alive).map((c) => c.first));
    const pool = CC.FIRST.filter((n) => !used.has(n));
    return pool.length ? pick(pool) : pick(CC.FIRST);
  }
  function makePerson(o) {
    o = o || {};
    const age = o.age != null ? o.age : 20 + rnd() * 40;
    const c = {
      id: S.people.length, first: o.first || pickFirst(), last: o.last || pick(CC.LAST), age,
      trade: o.trade || (age < 16 ? 'child' : randTrade()), traits: o.traits || randTraits(2),
      motive: o.motive || pick(['self', 'self', 'others', 'believed']),
      accuracy: o.accuracy != null ? o.accuracy : Math.round(20 + rnd() * 70),
      needs: Object.fromEntries(NEEDS.map((n) => [n, 55 + rnd() * 30])),
      opinion: o.opinion != null ? o.opinion : 0, govt: o.govt != null ? o.govt : 20, fear: 10,
      scrip: o.scrip != null ? o.scrip : Math.round(5 + rnd() * 20), health: 80 + rnd() * 20,
      status: 'free', detained: 0, service: 0, partner: null, parents: o.parents || [], children: [], friends: [], grudges: {},
      party: null, founder: !!o.founder, arrived: o.arrived != null ? o.arrived : S.day, bornHere: !!o.bornHere,
      licenses: [], lawSupport: {}, plot: null, bias: {}, today: [], why: [], history: [], life: {}, expecting: 0,
      edu: o.edu != null ? o.edu : rnd() * 50, novote: 0, isPlayer: !!o.isPlayer, retired: age >= 65, lobby: 0, bribed: 0, smeared: 0, armed: false,
    };
    for (const b of Object.keys(BEH)) c.bias[b] = (rnd() - 0.5) * 2;
    if (c.age >= 65 && !o.trade) c.trade = pick(['gardener', 'cook', 'artist', 'teacher']);
    S.people.push(c);
    return c;
  }
  function befriend(a, b) {
    if (!a || !b || a === b) return;
    if (!a.friends.includes(b.id)) a.friends.push(b.id);
    if (!b.friends.includes(a.id)) b.friends.push(a.id);
  }
  function pair(a, b) { a.partner = b.id; b.partner = a.id; befriend(a, b); a.life.partner = (a.life.partner || 0) + 1; b.life.partner = (b.life.partner || 0) + 1; }
  function addChild(a, b, o) {
    const kid = makePerson(Object.assign({ last: pick([a.last, b ? b.last : a.last]), parents: b ? [a.id, b.id] : [a.id], trade: 'child' }, o));
    const inherited = [...a.traits, ...(b ? b.traits : [])];
    kid.traits = [inherited.length ? pick(inherited) : null, ...randTraits(3)].filter((t, i, arr) => t && arr.indexOf(t) === i)
      .filter((t, i, arr) => !CLASH.some(([x, y]) => (t === x && arr.slice(0, i).includes(y)) || (t === y && arr.slice(0, i).includes(x)))).slice(0, 2);
    if (chance(0.5)) kid.motive = pick([a, b || a]).motive;
    a.children.push(kid.id); if (b) b.children.push(kid.id);
    befriend(kid, a); if (b) befriend(kid, b);
    kid.opinion = Math.round((a.opinion + (b ? b.opinion : a.opinion)) / 2);
    kid.govt = Math.round((a.govt + (b ? b.govt : a.govt)) / 2);
    return kid;
  }
  CC._people = { makePerson, befriend, pair, addChild, randTraits };

  // ───────────────────────── the commune's numbers ─────────────────────────
  const capacityHomes = () => (S.buildings.home || 0) * 2;
  const crowding = () => here().length / Math.max(1, capacityHomes());
  const containersUsed = () => Object.entries(S.buildings).reduce((n, [k, v]) => n + v * BUILDINGS[k].size, 0);
  const foodCap = () => 150 + (S.buildings.garden || 0) * 20 + (S.buildings.canteen || 0) * 40;
  const waterCap = () => 60 + (S.buildings.tank || 0) * 40;
  function approval() {
    const xs = adultsHere().filter((c) => !c.isPlayer);
    return xs.length ? xs.reduce((n, c) => n + (regimeOp(c) + 100) / 2, 0) / xs.length : 0;
  }
  function standing() {
    const xs = adultsHere().filter((c) => !c.isPlayer);
    return xs.length ? xs.reduce((n, c) => n + (c.opinion + 100) / 2, 0) / xs.length : 0;
  }
  function avgFear() { const xs = here().filter((c) => !c.isPlayer); return xs.length ? xs.reduce((n, c) => n + c.fear, 0) / xs.length : 0; }
  function wellbeing() {
    const xs = here().filter((c) => !c.isPlayer);
    return xs.length ? xs.reduce((n, c) => n + NEEDS.reduce((m, k) => m + c.needs[k], 0) / NEEDS.length, 0) / xs.length : 0;
  }
  function calendar(day) {
    const d = day == null ? S.day : day;
    const year = Math.floor(d / YEAR) + 1, season = CC.SEASONS[Math.floor((d % YEAR) / (YEAR / 4))];
    return { day: d, year, season, text: `${season}, Year ${year}` };
  }
  function wardenCount() { return free().filter((c) => c.trade === 'warden' && c.age >= 16 && !c.isPlayer).length + (S.buildings.post || 0); }
  function enforcementCapacity() { const need = Math.max(1, here().length / 10); return clamp(wardenCount() / need, 0.25, 1.3); }
  CC._numbers = { capacityHomes, crowding, containersUsed, foodCap, waterCap };

  // ───────────────────────── groups and laws ─────────────────────────
  function whoInfo(who) {
    if (WHO[who]) return WHO[who];
    if (who.startsWith('party:')) {
      const p = S.parties.find((x) => x.id === Number(who.slice(6)));
      return { label: `Members of ${p ? p.name : 'a dissolved party'}`, test: (c) => p && c.party === p.id, spec: 3 };
    }
    if (who.startsWith('trade:')) {
      const t = who.slice(6);
      return { label: CC.TRADES[t] ? CC.TRADES[t].plural : t, test: (c) => c.trade === t && c.age >= 16, spec: 3 };
    }
    return WHO.everyone;
  }
  function whoOptions() {
    const out = Object.entries(WHO).map(([k, v]) => ({ key: k, label: v.label }));
    for (const t of CC.TRADE_LIST) out.push({ key: 'trade:' + t, label: CC.TRADES[t].plural });
    for (const p of S.parties.filter((x) => !x.dissolved)) out.push({ key: 'party:' + p.id, label: `Members of ${p.name}` });
    return out;
  }
  function eligible(c, b) {
    const B = BEH[b];
    if (c.age < B.minAge || c.age > B.maxAge) return false;
    if (b === 'partner') return c.age >= 18;
    if (b === 'child') return c.partner != null || c.children.length > 0;
    return true;
  }
  const applies = (L, c) => whoInfo(L.who).test(c, S) && eligible(c, L.beh);
  const active = (L) => S.day >= (L.from || 0);
  const exempt = (c) => S.gov.exempt && S.gov.leader === c.id;
  function clashes(A, B) { return A.id !== B.id && A.beh === B.beh && [A.rule, B.rule].sort().join('+') === 'ban+require'; }
  function mixed(A, B) {
    if (A.id === B.id || A.beh !== B.beh) return false;
    const r = [A.rule, B.rule];
    return (r.includes('ban') && (r.includes('subsidise') || r.includes('reward'))) || (r.includes('require') && r.includes('tax'));
  }
  function winner(A, B) {
    const rule = S.gov.conflict;
    const newer = A.id > B.id ? A : B;
    if (rule === 'specific') { const a = whoInfo(A.who).spec, b = whoInfo(B.who).spec; return a === b ? newer : a > b ? A : B; }
    if (rule === 'harshest') { const a = RULES[A.rule].violation ? PUN[A.pun].sev : 0, b = RULES[B.rule].violation ? PUN[B.pun].sev : 0; return a === b ? newer : a > b ? A : B; }
    if (rule === 'popular') { const a = lawPopularity(A).pct, b = lawPopularity(B).pct; return a === b ? newer : a > b ? A : B; }
    if (rule === 'both') return null;
    return newer;
  }
  function governs(L, c) {
    if (!active(L) || !applies(L, c) || exempt(c)) return false;
    if (S.gov.conflict === 'both') return true;
    for (const M of S.laws) if (M !== L && active(M) && clashes(L, M) && applies(M, c) && winner(L, M) === M) return false;
    return true;
  }
  function trapped(c, includePending) {
    if (S.gov.conflict !== 'both') return null;
    for (const A of S.laws) for (const B of S.laws) {
      if (A.id < B.id && clashes(A, B) && applies(A, c) && applies(B, c) && !exempt(c) && (includePending || (active(A) && active(B)))) return [A, B];
    }
    return null;
  }
  function conflictsFor(L) {
    const out = [];
    for (const M of S.laws) {
      if (M === L || M.id === L.id) continue;
      const group = S.people.filter((c) => alive(c) && applies(L, c) && applies(M, c));
      if (!group.length) continue;
      if (clashes(L, M)) out.push({ law: M, kind: 'clash', group, winner: winner(L, M) });
      else if (mixed(L, M)) out.push({ law: M, kind: 'mixed', group });
    }
    return out;
  }
  function catchRate(L) {
    let p = ENF[L.enf].catch;
    if (L.enf === 'wardens') p *= enforcementCapacity();
    if (L.enf === 'police' && !S.inst.police) p = 0.05;
    if (L.enf === 'cameras' && !S.inst.cameras) p = 0.05;
    if (L.beh === 'leave' && S.buildings.wall) p = Math.min(0.95, p * 1.6 + 0.1);
    if (S.treasury < 0 && L.enf !== 'honour') p *= 0.5;
    return clamp(p, 0, 0.95);
  }
  function ruleText(L) {
    const B = BEH[L.beh];
    switch (L.rule) {
      case 'ban': return `may not ${B.label}`;
      case 'require': return B.kind === 'life' ? `must ${B.label} within a year` : `must ${B.label} every day`;
      case 'ration':
        if (L.beh === 'child') return 'may have only one child';
        if (L.beh === 'partner') return 'may form only one partnership in their life';
        return `may ${B.label} only once a day`;
      case 'license': return `need a ${CC.LICENSE_FEE}-scrip permit to ${B.label}`;
      case 'tax': return `pay ${L.amount} scrip in tax each time they ${B.label}`;
      case 'subsidise': return `are paid ${L.amount} scrip each time they ${B.label}`;
      case 'reward': return `are publicly honoured when they ${B.label}`;
    }
    return '';
  }
  function punText(L) {
    if (L.pun === 'execution') return `execution by ${CC.METHODS[L.method]}, ${CC.SETTINGS[L.setting]}`;
    return PUN[L.pun].label;
  }
  function describeLaw(L) {
    let s = `${whoInfo(L.who).label} ${ruleText(L)}`;
    if (RULES[L.rule].violation) s += `, enforced by ${ENF[L.enf].label}, punished by ${punText(L)}`;
    return s + '.';
  }
  function rulesFor(b) {
    const B = BEH[b];
    return Object.keys(RULES).filter((r) => !(B.kind === 'life' && (r === 'tax' || r === 'subsidise' || r === 'reward') && b === 'leave') && !(b === 'leave' && r === 'ration'));
  }

  // ───────────────────────── wants and views ─────────────────────────
  function likeOf(c, b) {
    const B = BEH[b];
    if (B.kind !== 'day') return lifeLike(c, b);
    let u = c.age < 16 && B.childBase != null ? B.childBase : B.base;
    for (const n in B.needs) u += B.needs[n] * (100 - c.needs[n]) * 0.45;
    for (const t of c.traits) u += TRAITS[t].likes[b] || 0;
    u += MOTIVE[c.motive].likes[b] || 0;
    switch (b) {
      case 'work': if (c.scrip < 10) u += 10; if (c.retired) u -= 16; break;
      case 'study': if (c.age >= 16) u -= 12; if (S.buildings.school) u += 6; break;
      case 'trade': if (c.scrip < 10) u += 8; break;
      case 'criticise': u += Math.max(0, -regimeOp(c)) * 0.4 + (c.plot != null ? 20 : 0); break;
      case 'protest': u += Math.max(0, -regimeOp(c) - 15) * 0.6 + (S.rally && regimeOp(c) < -5 ? 45 : 0); break;
      case 'organise': u += c.party != null ? 26 : -12; break;
      case 'address': u += S.addressToday ? 24 : -80; u += regimeOp(c) * 0.15; break;
      case 'uniform': u += regimeOp(c) * 0.1; break;
      case 'drink': if (!S.buildings.bar) u -= 10; break;
      case 'worship': if (S.buildings.hall) u += 5; break;
      case 'gather': if (S.buildings.hall) u += 4; if (S.buildings.canteen) u += 2; break;
      case 'volunteer': if (S.buildings.clinic) u += 4; break;
      case 'steal': if (c.scrip < 5) u += 8; break;
      case 'weapon': u += c.fear * 0.1; break;
      case 'outside': u += Math.max(0, -regimeOp(c)) * 0.15; break;
      case 'gamble': if (c.scrip < 3) u -= 20; break;
    }
    return u;
  }
  function lifeLike(c, b) {
    let u = 0;
    if (b === 'partner') { u = 30; if (has(c, 'Romantic')) u += 15; if (has(c, 'Family-minded')) u += 10; }
    if (b === 'child') { u = 22; if (has(c, 'Family-minded')) u += 25; if (c.children.length >= 2) u -= 15; if (crowding() > 1.2) u -= 10; }
    if (b === 'leave') u = leaveWant(c);
    return u;
  }
  function needAvg(c) { return NEEDS.reduce((m, k) => m + c.needs[k], 0) / NEEDS.length; }
  function leaveWant(c) {
    let u = -40 + Math.max(0, -regimeOp(c)) * 0.45 + (100 - c.needs.freedom) * 0.2 + (60 - needAvg(c)) * 0.4 + (c.plot != null ? 10 : 0);
    if (has(c, 'Rebellious')) u += 6;
    if (c.family_loss) u += 25;
    if (crowding() > 1.3) u += 8;
    return u;
  }
  function valueOf(c, b) {
    let v = BEH[b].value;
    for (const t of c.traits) if (TRAITS[t].values && TRAITS[t].values[b] !== undefined) v = TRAITS[t].values[b];
    return v;
  }
  function avgLike(b) {
    if (S._avgDay !== S.day || !S._avg) { S._avg = {}; S._avgDay = S.day; }
    if (S._avg[b] === undefined) {
      const xs = here().filter((c) => !c.isPlayer && eligible(c, b));
      S._avg[b] = xs.length ? xs.reduce((n, x) => n + likeOf(x, b), 0) / xs.length : 0;
    }
    return S._avg[b];
  }
  function othersView(c, b) {
    const truth = clamp(avgLike(b) / 40, -1, 1.5);
    if (c.motive === 'others') return truth;
    if (c.motive === 'believed') { const own = clamp(likeOf(c, b) / 40, -1, 1.5); return (truth * c.accuracy + (own + c.bias[b]) * (100 - c.accuracy)) / 100; }
    return 0;
  }
  const POLICY_BEH = DAY_BEH.concat(['partner', 'child']);
  function desires(c) {
    if (c._dd === S.day && c._des) return c._des;
    const d = {};
    for (const b of POLICY_BEH) {
      const own = clamp(likeOf(c, b) / 40, -1, 1.2);
      d[b] = clamp(own * (c.motive === 'self' ? 0.9 : 0.4) + valueOf(c, b) * 0.7 + othersView(c, b) * 0.4, -1, 1);
    }
    c._des = d; c._dd = S.day;
    return d;
  }
  function agreement(c, stance) {
    const d = desires(c);
    let num = 0, den = 0;
    for (const b in stance) { if (!stance[b]) continue; num += (d[b] || 0) * stance[b]; den += Math.abs(stance[b]); }
    return den ? num / den : 0;
  }

  // how much citizen c supports law L (-100 .. 100)
  function supportFor(c, L) {
    const R = RULES[L.rule], b = L.beh, B = BEH[b];
    const own = B.kind === 'day' ? clamp(likeOf(c, b) / 40, -1, 1.5) : clamp(lifeLike(c, b) / 40, -1, 1.5);
    const others = othersView(c, b);
    const V = valueOf(c, b);
    const selfW = c.motive === 'self' ? 1.5 : 0.6;
    const mine = applies(L, c);
    let s = 0;
    if (mine) s += R.dir * own * 34 * selfW;
    s += R.dir * V * 30;
    s += R.dir * others * 22;
    if (R.violation) {
      const fair = Math.max(0, -V) * 40 + 12;
      const excess = PUN[L.pun].sev - fair;
      s -= Math.max(0, excess) * 0.45 * (has(c, 'Paranoid') ? 0.3 : 1) * (has(c, 'Busybody') ? 0.6 : 1) * (has(c, 'Loyal') ? 0.6 : 1);
      if (L.pun === 'torture' || L.pun === 'execution' || L.pun === 'flogging') s -= has(c, 'Paranoid') ? 5 : 25;
      if (L.pun === 'execution' && L.setting === 'public') s -= 10;
      if (L.enf === 'police') s += has(c, 'Paranoid') || has(c, 'Loyal') ? 10 : -20;
      if (L.enf === 'informants') s += has(c, 'Paranoid') ? 8 : -12;
      if (L.enf === 'cameras') s += has(c, 'Paranoid') ? 8 : -8;
      if (L.enf === 'watch') s += has(c, 'Busybody') ? 10 : -3;
    }
    const restrictive = R.dir < 0;
    const targeted = L.who !== 'everyone' && L.who !== 'adults';
    if (targeted) {
      if (mine && restrictive) s -= 15;
      if (!mine && restrictive && c.motive === 'self') s += 4;
      if (!mine && !restrictive && c.motive === 'self') s -= 6;
    }
    if (L.who.startsWith('party:')) { const pid = Number(L.who.slice(6)); if (c.party === pid) s += restrictive ? -25 : 10; else if (c.party != null && restrictive) s += 6; }
    if (L.who === 'notofficials' && restrictive) s += CC.isOfficial(c) ? 6 : -12;
    if (R.money) s *= 0.6 + (L.amount || 3) / 10;
    if (S.gov.exempt && restrictive && R.violation) s -= 6;
    return Math.round(clamp(s, -100, 100));
  }
  function lawPopularity(L) {
    const xs = adultsHere().filter((c) => !c.isPlayer);
    const yes = xs.filter((c) => (c.lawSupport[L.id] != null ? c.lawSupport[L.id] : supportFor(c, L)) > 0).length;
    return { yes, total: xs.length, pct: Math.round((100 * yes) / Math.max(1, xs.length)) };
  }
  function recomputeSupport() { for (const c of here()) for (const L of S.laws) c.lawSupport[L.id] = supportFor(c, L); }

  function deterrent(c, L) {
    let cost = PUN[L.pun].sev * catchRate(L) * (0.6 + c.fear / 100) * (has(c, 'Timid') ? 1.6 : 1) * (has(c, 'Rebellious') ? 0.6 : 1) * 1.1;
    if ((c.lawSupport[L.id] || 0) > 25) cost += 14;
    if (L.enf === 'honour' && c.motive === 'others') cost += 8;
    if (has(c, 'Loyal')) cost += 6;
    return cost;
  }
  function lawTerms(c, b, count) {
    let u = 0; const why = [];
    for (const L of S.laws) {
      if (L.beh !== b || !governs(L, c)) continue;
      if (L.rule === 'ban') { const d = deterrent(c, L); u -= d; if (d > 12) why.push(`risky under “${L.name}”`); }
      if (L.rule === 'require') { const d = deterrent(c, L); u += count ? 0 : d; if (d > 12 && !count) why.push(`required by “${L.name}”`); }
      if (L.rule === 'ration' && count >= 1) u -= deterrent(c, L);
      if (L.rule === 'license' && !c.licenses.includes(L.id)) u -= deterrent(c, L);
      if (L.rule === 'tax') { u -= L.amount * 3; if (L.amount >= 5) why.push(`taxed by “${L.name}”`); }
      if (L.rule === 'subsidise' && S.treasury >= L.amount) { u += L.amount * 3; why.push(`paid by “${L.name}”`); }
      if (L.rule === 'reward') { u += 12; why.push(`honoured by “${L.name}”`); }
    }
    return { u, why };
  }
  function explain(c, b) {
    const out = [];
    const B = BEH[b];
    let topNeed = null, topVal = 0;
    for (const n in B.needs || {}) { const v = B.needs[n] * (100 - c.needs[n]); if (v > topVal) { topVal = v; topNeed = n; } }
    if (topNeed && c.needs[topNeed] < 50) out.push(`${CC.NEED_WORD[topNeed]} (${topNeed} ${Math.round(c.needs[topNeed])})`);
    for (const t of c.traits) if ((TRAITS[t].likes[b] || 0) >= 10) out.push(t);
    if ((MOTIVE[c.motive].likes[b] || 0) >= 10) out.push(c.motive === 'others' ? 'acts for others' : c.motive === 'self' ? 'looks after number one' : 'thinks it helps others');
    if ((b === 'criticise' || b === 'protest') && regimeOp(c) < -20) out.push('angry with the government');
    if (b === 'work' && c.scrip < 10) out.push('short of scrip');
    if (b === 'organise' && c.party != null) out.push('party member');
    if (b === 'address' && regimeOp(c) > 20) out.push('supports the government');
    return out;
  }

  // ───────────────────────── laws: passing and repealing ─────────────────────────
  function buildLaw(spec) {
    return {
      id: S.nextLawId, name: (spec.name || '').trim() || 'Unnamed Act', who: spec.who || 'everyone', rule: spec.rule || 'ban', beh: spec.beh || 'music',
      enf: spec.enf || 'wardens', pun: spec.pun || 'fine', amount: spec.amount || 3, method: spec.method || 'firing', setting: spec.setting || 'private',
      from: S.day + 1, passedDay: S.day, by: spec.by != null ? spec.by : S.gov.leader, brokenToday: 0, caughtToday: 0, brokenTotal: 0,
    };
  }
  function enact(L, R) {
    L.id = S.nextLawId++;
    S.laws.push(L);
    S.stats.laws++;
    for (const c of here()) c.lawSupport[L.id] = supportFor(c, L);
    const pop = lawPopularity(L);
    if (pop.pct < 30) S.legitimacy = clamp(S.legitimacy - 3, 0, 100);
    if (L.pun === 'torture' || L.pun === 'execution') { S.legitimacy = clamp(S.legitimacy - 4, 0, 100); S.attention = clamp(S.attention + 3, 0, 100); }
    const trap = conflictsFor(L).filter((x) => x.kind === 'clash');
    if (trap.length && S.gov.conflict === 'both') { S.legitimacy = clamp(S.legitimacy - 10, 0, 100); log(`“${L.name}” and “${trap[0].law.name}” can't both be obeyed. Word is spreading.`, 'law'); }
    else if (trap.length) log(`“${L.name}” clashes with “${trap[0].law.name}”. “${trap[0].winner.name}” wins where they overlap.`, 'law');
    // the people who back a law think better of whoever passed it
    for (const c of here()) { const s = c.lawSupport[L.id] || 0; if (L.by === PLAYER) c.opinion = clamp(c.opinion + s * 0.05, -100, 100); if (L.by === S.gov.leader) c.govt = clamp(c.govt + s * 0.04, -100, 100); }
    log(`“${L.name}” passed: ${describeLaw(L)}`, 'law');
    if (R) R.politics.push(`New law: “${L.name}”. ${describeLaw(L)} Backed by ${pop.yes} of ${pop.total} adults. In force from tomorrow.`);
    return L;
  }
  function repeal(L, R, by) {
    S.laws = S.laws.filter((x) => x !== L);
    for (const c of S.people) {
      const sup = c.lawSupport[L.id] || 0;
      if (by === PLAYER) c.opinion = clamp(c.opinion - sup * 0.06, -100, 100);
      c.govt = clamp(c.govt - sup * 0.05, -100, 100);
      delete c.lawSupport[L.id];
      c.licenses = c.licenses.filter((x) => x !== L.id);
    }
    log(`“${L.name}” was repealed.`, 'law');
    if (R) R.politics.push(`“${L.name}” was repealed.`);
  }
  CC._laws = { buildLaw, enact, repeal };

  // ───────────────────────── the day ─────────────────────────
  function choose(c) {
    const slots = c.age >= 6 ? 2 : 0;
    const done = [], reasons = [];
    if (c.service > 0 && c.age >= 16) { done.push('work'); reasons.push(['work', ['community service']]); c.service--; }
    let guard = 0;
    while (done.length < slots && guard++ < 6) {
      let best = null, bestU = -Infinity, bestWhy = null;
      for (const b of DAY_BEH) {
        const B = BEH[b];
        if (!eligible(c, b)) continue;
        if (b === 'address' && !S.addressToday) continue;
        const count = done.filter((x) => x === b).length;
        if (count && !B.repeat) continue;
        for (const L of S.laws) {
          if (L.rule === 'license' && L.beh === b && governs(L, c) && !c.licenses.includes(L.id) && c.scrip >= CC.LICENSE_FEE && likeOf(c, b) > 20) {
            c.licenses.push(L.id); c.scrip -= CC.LICENSE_FEE; S.treasury += CC.LICENSE_FEE; c._boughtLicense = L.name;
          }
        }
        const lt = lawTerms(c, b, count);
        const u = likeOf(c, b) + lt.u + rnd() * 16 - count * 12;
        if (u > bestU) { bestU = u; best = b; bestWhy = lt.why; }
      }
      if (!best) break;
      done.push(best);
      reasons.push([best, explain(c, best).concat(bestWhy)]);
    }
    return { done, reasons };
  }

  function dayActions(R) {
    const prod = { food: 0, water: 0, mat: 0, treasury: 0, heal: 0, teach: 0, cook: 0, gardenUsed: 0 };
    S._prod = prod;
    const people = npcFree();
    for (const c of S.people) { c.today = []; c.why = []; c._boughtLicense = null; c._trap = null; c.armed = false; }
    for (const c of people) {
      const { done, reasons } = choose(c);
      c.today = done; c.why = reasons;
      if (c._boughtLicense) R.life.push(`${c.first} bought a permit under “${c._boughtLicense}”.`);
    }
    const me = player();
    if (me.status === 'free') { me.today = S.pdid.slice(); me.why = S.pdid.map((b) => [b, ['your choice']]); }

    const gardenSlots = (S.buildings.garden || 0) * 3;
    const gatherers = [], drinkers = [], reporters = [], misShare = [], goodShare = [], protesters = [], talkers = [];
    let shifts = 0;
    for (const c of people) {
      for (const b of c.today) {
        const N = c.needs;
        for (const L of S.laws) {
          if (L.beh !== b || !governs(L, c)) continue;
          if (L.rule === 'tax') { const pay = Math.min(c.scrip, L.amount); c.scrip -= pay; S.treasury += pay; }
          if (L.rule === 'subsidise') { if (S.treasury >= L.amount) { c.scrip += L.amount; S.treasury -= L.amount; } else { c.govt -= 1; S._unpaid = (S._unpaid || 0) + 1; } }
          if (L.rule === 'reward') { c.govt += 1; N.belonging += 5; }
        }
        switch (b) {
          case 'work': {
            shifts++; N.purpose += 30;
            const half = c.retired ? 0.5 : 1;
            const gross = 3, tax = gross * S.gov.tax;
            c.scrip += gross - tax; S.treasury += tax;
            switch (c.trade) {
              case 'gardener': prod.food += (prod.gardenUsed < gardenSlots ? 8 : 2) * half; prod.gardenUsed++; break;
              case 'cook': if (S.buildings.canteen) prod.cook += 0.05; else prod.food += 1; break;
              case 'mechanic': prod.mat += (S.buildings.workshop ? 3 : 2) * half; prod.treasury += 0.5; break;
              case 'labourer': prod.mat += 1 * half; prod.water += 3 * half; break;
              case 'medic': prod.heal += (S.buildings.clinic ? 14 : 7) * half; break;
              case 'teacher': prod.teach += (S.buildings.school ? 2 : 1) * half; break;
              case 'warden': N.safety += 5; break;
              case 'organiser': prod.treasury += 1; break;
              case 'artist': for (const x of shuffle(people.slice()).slice(0, 3)) x.needs.belonging += 6; break;
              case 'trader': prod.treasury += 1; prod.food += 1; break;
              default: prod.food += 1;
            }
            break;
          }
          case 'study': N.purpose += 20; c.edu = clamp(c.edu + (S.buildings.school ? 2 : 1) * (0.5 + Math.min(1.5, prod.teach / 3 + 0.3)), 0, 100); break;
          case 'share': {
            const others = people.filter((x) => x !== c);
            if (!others.length) break;
            const neediest = others.slice().sort((a, d) => a.needs.food - d.needs.food)[0];
            const target = c.motive === 'others' || rnd() * 100 < c.accuracy ? neediest : pick(others);
            target.needs.food += 25; N.food -= 15; N.belonging += 15;
            target.grudges[c.id] = (target.grudges[c.id] || 0) - 5;
            if (target.needs.food > 75 && c.motive === 'believed') misShare.push(c); else if (target.needs.food < 45) goodShare.push(c);
            break;
          }
          case 'hoard': N.water += 35; S.water -= 3; break;
          case 'trade': { N.belonging += 5; c.scrip += 3; const p = pick(people.filter((x) => x !== c)); if (p) p.scrip += 2; break; }
          case 'gather': N.belonging += 20 + (S.buildings.hall ? 5 : 0); gatherers.push(c); break;
          case 'worship': N.belonging += 15 + (S.buildings.hall ? 5 : 0); N.purpose += 10; break;
          case 'music': {
            N.freedom += 25;
            const v = pick(people.filter((x) => x !== c && !c.friends.includes(x.id)));
            if (v) { v.needs.belonging -= 4; v.grudges[c.id] = (v.grudges[c.id] || 0) + 10; if ((has(v, 'Busybody') || has(v, 'Paranoid')) && chance(0.5)) R.life.push(`${v.first} complained about ${c.first}'s music.`); }
            break;
          }
          case 'drink': N.belonging += 12; N.freedom += 10; drinkers.push(c); break;
          case 'gamble': N.freedom += 10; { const d = chance(0.45) ? 6 : -5; c.scrip = Math.max(0, c.scrip + d); } break;
          case 'criticise': N.freedom += 15; for (const f of c.friends) { const x = P(f); if (x && x.status === 'free' && !x.isPlayer) x.govt = clamp(x.govt - 2, -100, 100); if (x && leaderIsPlayer() && !x.isPlayer) x.opinion = clamp(x.opinion - 2, -100, 100); } break;
          case 'report': reporters.push(c); N.safety += 10; break;
          case 'steal': {
            N.food += 30;
            if (chance(0.5)) { S.food -= 3; R.life.push(`${c.first} took food from the stores.`); }
            else { const v = pick(people.filter((x) => x !== c)); if (v) { v.needs.food -= 15; v.grudges[c.id] = (v.grudges[c.id] || 0) + 30; c.scrip += 2; R.life.push(`${c.first} stole from ${v.first}.`); } }
            break;
          }
          case 'protest': N.freedom += 20; N.belonging += 10; protesters.push(c); break;
          case 'organise': {
            N.purpose += 20; N.belonging += 10;
            const party = S.parties.find((p) => p.id === c.party);
            if (party) {
              party.activity = (party.activity || 0) + 1;
              const t = pick(c.friends.map(P).filter((x) => x && x.status === 'free' && !x.isPlayer && x.party == null && x.age >= 16));
              if (t && agreement(t, party.stance) > 0.12 && chance(0.35)) { t.party = party.id; R.politics.push(`${c.first} brought ${t.first} into ${party.name}.`); }
            }
            break;
          }
          case 'weapon': N.safety += 25; c.armed = true; break;
          case 'uniform': N.belonging += 8; N.freedom -= 5; break;
          case 'address': N.belonging += 5; c.govt = clamp(c.govt + (has(c, 'Cynic') ? -3 : 3), -100, 100); if (leaderIsPlayer()) c.opinion = clamp(c.opinion + (has(c, 'Cynic') ? -3 : 3), -100, 100); break;
          case 'volunteer': N.purpose += 20; N.belonging += 10; prod.heal += 4; break;
          case 'outside': N.freedom += 15; talkers.push(c); S.attention = clamp(S.attention + 0.6 + (wellbeing() < 45 ? 0.6 : 0), 0, 100); break;
        }
      }
    }
    // fights at the bar
    const fought = new Set();
    for (const d of drinkers) {
      if (!has(d, 'Hot-headed') || fought.has(d.id) || !chance(0.22)) continue;
      const o = pick(drinkers.filter((x) => x !== d && !fought.has(x.id))) || pick(people.filter((x) => x !== d && !fought.has(x.id)));
      if (!o) continue;
      fought.add(d.id); fought.add(o.id);
      const hurt = d.armed || o.armed ? 30 : 10;
      d.needs.safety -= 25; o.needs.safety -= 25; o.health -= hurt; o.grudges[d.id] = (o.grudges[d.id] || 0) + 20;
      R.life.push(`${d.first} started a fight with ${o.first} at the bar${hurt > 20 ? ', and a weapon came out' : ''}.`);
    }
    if (gatherers.length >= 2) {
      const avg = gatherers.reduce((n, x) => n + x.govt, 0) / gatherers.length;
      for (const g of gatherers) g.govt += (avg - g.govt) * 0.3;
      if (avg < -20) R.life.push(`${gatherers.length} people met up, and the talk turned against the government.`);
    }
    if (misShare.length) R.life.push(`${list(misShare.map((c) => c.first))} gave away ${misShare.length > 1 ? 'their dinners' : 'their dinner'} to people who weren't hungry, and went to bed hungry.`);
    if (goodShare.length) R.life.push(`${list(goodShare.map((c) => c.first))} shared food with people who needed it.`);
    S._reporters = reporters; S._protesters = protesters; S._talkers = talkers;
    R.stats = { shifts };
  }

  // ───────────────────────── justice ─────────────────────────
  function violationsToday() {
    const out = [];
    for (const L of S.laws) {
      if (!RULES[L.rule].violation || BEH[L.beh].kind !== 'day' || !active(L)) continue;
      for (const c of free()) {
        if (!governs(L, c)) continue;
        if (c.isPlayer && S.day === S.startDay) continue;
        const n = c.today.filter((x) => x === L.beh).length;
        const broke = (L.rule === 'ban' && n > 0) || (L.rule === 'require' && n === 0) || (L.rule === 'ration' && n > 1) || (L.rule === 'license' && n > 0 && !c.licenses.includes(L.id));
        if (broke) { out.push({ c, L }); L.brokenToday++; L.brokenTotal++; }
      }
    }
    return out;
  }
  function justice(R) {
    S.laws.forEach((L) => { L.brokenToday = 0; L.caughtToday = 0; });
    const vio = violationsToday();
    const caught = [];
    for (const v of vio) {
      let p = catchRate(v.L);
      if (v.c.isPlayer && leaderIsPlayer()) p *= 0.3;
      if (CC.isOfficial(v.c) && (v.L.enf === 'wardens' || v.L.enf === 'police')) p *= 0.6;
      if (!chance(p)) continue;
      if (!v.c.isPlayer && v.L.enf === 'wardens' && v.c.scrip >= 10 && (has(v.c, 'Light-fingered') || has(v.c, 'Ambitious') || v.c.motive === 'self') && chance(0.4)) {
        v.c.scrip -= 10; R.justice.push(`${v.c.first} was caught breaking “${v.L.name}” but bribed the warden.`); continue;
      }
      caught.push({ ...v, how: 'caught' });
    }
    // neighbours' reports; low-accuracy believed-others citizens often get it wrong
    const vLaws = S.laws.filter((L) => RULES[L.rule].violation && active(L) && BEH[L.beh].kind === 'day');
    const dismissed = [];
    for (const rep of S._reporters || []) {
      const real = vio.filter((v) => v.c !== rep && !caught.some((k) => k.c === v.c));
      if (real.length && rnd() * 100 < rep.accuracy) {
        const v = real.sort((a, b) => (rep.grudges[b.c.id] || 0) - (rep.grudges[a.c.id] || 0))[0];
        caught.push({ ...v, how: `reported by ${rep.first}` });
      } else {
        const pool = free().filter((x) => x !== rep && !vio.some((v) => v.c === x));
        const t = pool.sort((a, b) => (rep.grudges[b.id] || 0) - (rep.grudges[a.id] || 0) + (rnd() - 0.5) * 20)[0];
        if (!t) continue;
        const L = vLaws.find((L2) => governs(L2, t));
        if (!L) { if (chance(0.3)) R.life.push(`${rep.first} tried to report ${nm(t)}, but there's no law against anything ${nm(t)} did.`); continue; }
        const trust = { honour: 0, watch: 0.5, wardens: 0.25, informants: 0.6, cameras: 0.1, police: 0.85 }[L.enf];
        if (chance(trust)) caught.push({ c: t, L, how: `falsely reported by ${rep.first}`, innocent: true });
        else dismissed.push(`${rep.first} accused ${nm(t)}`);
      }
    }
    // informants and secret police arrest the wrong people sometimes
    for (const L of vLaws) {
      const wrong = L.enf === 'police' ? 0.15 : L.enf === 'informants' ? 0.12 : 0;
      if (!wrong || !chance(wrong)) continue;
      const t = pick(free().filter((x) => governs(L, x) && !vio.some((v) => v.c === x && v.L === L)));
      if (t) caught.push({ c: t, L, how: L.enf === 'police' ? 'picked up by the secret police' : 'named by a paid informant', innocent: true });
    }
    if (dismissed.length) R.justice.push(dismissed.length === 1 ? `${dismissed[0]} of breaking a law; it was dismissed.` : `${dismissed.length} accusations were dismissed (${dismissed.join('; ')}).`);
    const done = new Set();
    for (const k of caught) {
      if (done.has(k.c.id) || k.c.status !== 'free') continue;
      done.add(k.c.id);
      k.L.caughtToday++;
      if (k.c.isPlayer && leaderIsPlayer()) {
        CC.queueEvent('selfcaught', { law: k.L.id });
        R.justice.push(`The wardens caught you breaking your own law, “${k.L.name}”.`);
        continue;
      }
      applyPunishment(k.c, k.L.pun, { why: `for “${k.L.name}”`, how: k.how, innocent: k.innocent, method: k.L.method, setting: k.L.setting, R, vio, done });
    }
    const caughtReal = caught.filter((k) => !k.innocent).length;
    if (vio.length && !caught.length) R.justice.push(`${vio.length} law${vio.length > 1 ? 's were' : ' was'} broken today and nobody was caught.`);
    else if (vio.length) R.justice.push(`In all, ${vio.length} law-breaking${vio.length > 1 ? 's' : ''} today; ${caughtReal} caught.`);
    const trappedNow = free().filter((c) => trapped(c, false));
    if (trappedNow.length) R.headlines.push(`${trappedNow.length === 1 ? '1 citizen is' : trappedNow.length + ' citizens are'} bound by laws that contradict each other. Whatever they do, they break one.`);
  }

  // punish anyone (by law, by order, or after a plot)
  function applyPunishment(c, pun, ctx) {
    const R = ctx.R || S.report;
    const tag = ctx.innocent ? ` (${Nm(c)} ${c.isPlayer ? 'were' : 'was'} innocent.)` : '';
    const what = `${Nm(c)} ${was(c)} ${ctx.how} ${ctx.why}`;
    if (c.isPlayer) return punishPlayer(pun, ctx, what, R);
    const friends = c.friends.map(P).filter((x) => x && x.status === 'free' && !x.isPlayer);
    const family = [c.partner, ...c.parents, ...c.children].map(P).filter((x) => x && x.status === 'free' && !x.isPlayer);
    const hurt = (who, amt) => who.forEach((x) => blame(x, -amt));
    const everyoneFear = (n) => here().forEach((x) => { x.fear = clamp(x.fear + n, 0, 100); });
    if (ctx.innocent) { S.legitimacy = clamp(S.legitimacy - Math.max(0.5, PUN[pun].sev / 25), 0, 100); blame(c, -(6 + PUN[pun].sev / 5)); hurt(friends, 2 + PUN[pun].sev / 12); }
    if (c.age < 16) { S.legitimacy = clamp(S.legitimacy - 2, 0, 100); hurt(here().filter((x) => !x.isPlayer), 2); }
    switch (pun) {
      case 'warning': blame(c, -2); R.justice.push(`${what}: a warning.${tag}`); break;
      case 'fine': case 'bigfine': {
        const amt = pun === 'fine' ? 10 : 30;
        if (c.scrip >= amt) { c.scrip -= amt; S.treasury += amt; R.justice.push(`${what}: fined ${amt} scrip.${tag}`); }
        else { S.treasury += c.scrip; c.scrip = 0; c.service = 1; R.justice.push(`${what}: couldn't pay the fine, so does community service tomorrow.${tag}`); }
        blame(c, -5); break;
      }
      case 'service': c.service = 1; blame(c, -6); R.justice.push(`${what}: community service tomorrow.${tag}`); break;
      case 'shaming': c.needs.belonging -= 30; blame(c, -10); hurt(friends, 3); R.justice.push(`${what}: shamed in front of the whole yard.${tag}`); break;
      case 'confiscate': S.treasury += c.scrip; c.scrip = 0; blame(c, -18); hurt(family, 5); R.justice.push(`${what}: everything they owned was confiscated.${tag}`); break;
      case 'novote': c.novote = YEAR; blame(c, -12); R.justice.push(`${what}: lost the vote for a year.${tag}`); break;
      case 'detention': case 'longdet': {
        const days = pun === 'detention' ? 2 : 7;
        c.status = 'detained'; c.detained = days; blame(c, -(pun === 'detention' ? 15 : 25)); hurt(friends, 5); hurt(family, 10); everyoneFear(pun === 'detention' ? 2 : 4);
        R.justice.push(`${what}: ${days === 2 ? 'two days' : 'a week'} in the lock-up.${tag}`); break;
      }
      case 'exile':
        c.status = 'exiled'; c.history.push(`Exiled on day ${S.day}`); hurt(friends, 15); hurt(family, 40); everyoneFear(6);
        S.legitimacy = clamp(S.legitimacy - 2, 0, 100); S.attention = clamp(S.attention + 1, 0, 100);
        R.headlines.push(`${what}, and was exiled.${tag}`); log(`${c.first} ${c.last} was exiled ${ctx.why}.`, 'justice'); departFamily(c, R); break;
      case 'flogging':
        c.health -= 35; blame(c, -40); hurt(friends, 12); hurt(family, 25); everyoneFear(8); S.legitimacy = clamp(S.legitimacy - 4, 0, 100); S.attention = clamp(S.attention + 3, 0, 100);
        R.headlines.push(`${what}, and was flogged in the yard.${tag}`); log(`${c.first} ${c.last} was flogged ${ctx.why}.`, 'justice'); break;
      case 'torture': {
        blame(c, -100); hurt(friends, 20); hurt(family, 40); everyoneFear(10); S.legitimacy = clamp(S.legitimacy - 6, 0, 100); S.attention = clamp(S.attention + 5, 0, 100);
        const pool = (ctx.vio || []).filter((v) => v.c !== c && v.c.status === 'free');
        const names = [];
        const n = 1 + (chance(0.5) ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const truthful = pool.length && chance(0.5);
          const t = truthful ? pick(pool).c : pick(free().filter((x) => x !== c && !names.some((m) => m.x === x)));
          if (t && !names.some((m) => m.x === t)) names.push({ x: t, guilty: (ctx.vio || []).some((v) => v.c === t) });
        }
        // anyone in a plot may give the plot up
        if (c.plot != null && chance(0.7)) CC.exposePlot && CC.exposePlot(c.plot, R, 'under torture');
        c.status = 'detained'; c.detained = 3; c.health -= 25;
        R.headlines.push(`${what} and interrogated under torture. ${c.first} named ${names.length ? list(names.map((m) => nm(m.x))) : 'nobody'}.${names.length ? ' (' + names.map((m) => `${Nm(m.x)} ${m.guilty ? (m.x.isPlayer ? 'had' : 'had') + ' broken a law' : (m.x.isPlayer ? 'were' : 'was') + ' innocent'}`).join('; ') + '.)' : ''}${tag}`);
        log(`${c.first} ${c.last} was interrogated under torture.`, 'justice');
        for (const m of names) {
          if (ctx.done && ctx.done.has(m.x.id)) continue;
          if (ctx.done) ctx.done.add(m.x.id);
          if (m.x.isPlayer) { if (!leaderIsPlayer()) punishPlayer('detention', { why: 'after being named under torture', how: 'arrested' }, 'You were arrested after being named under torture', R); continue; }
          m.x.status = 'detained'; m.x.detained = 2; blame(m.x, m.guilty ? -15 : -35);
          if (!m.guilty) { S.legitimacy = clamp(S.legitimacy - 3, 0, 100); hurt(m.x.friends.map(P).filter((x) => x && x.status === 'free' && !x.isPlayer), 10); }
        }
        break;
      }
      case 'execution': {
        const pub = ctx.setting === 'public';
        c.status = 'executed'; c.history.push(`Executed on day ${S.day}`); S.stats.executions++;
        hurt(friends, 40); hurt(family, 80); everyoneFear(pub ? 30 : 10);
        S.legitimacy = clamp(S.legitimacy - (pub ? 14 : 8), 0, 100); S.attention = clamp(S.attention + (pub ? 8 : 4), 0, 100);
        const loved = friends.filter((x) => (x.grudges[c.id] || 0) < 10);
        for (const x of loved) if (x.age >= 16 && chance(0.5)) x.grudge_regime = true;
        R.headlines.push(`${what}, and was executed by ${CC.METHODS[ctx.method || 'firing']} ${CC.SETTINGS[ctx.setting || 'private']}.${tag}`);
        if (loved.length >= 2) R.headlines.push(`${list(loved.slice(0, 4).map((x) => x.first))} won't forget it.`);
        log(`${c.first} ${c.last} was executed ${ctx.why}.`, 'justice');
        widow(c, R);
        break;
      }
      case 'disappear': {
        c.status = 'disappeared'; c.history.push(`Disappeared on day ${S.day}`);
        hurt(family, 60); hurt(friends, 25); everyoneFear(8);
        R.headlines.push(`${c.first} ${c.last} has not been seen since last night.`);
        log(`${c.first} ${c.last} disappeared.`, 'justice');
        widow(c, R);
        break;
      }
    }
    c.govt = clamp(c.govt, -100, 100); c.opinion = clamp(c.opinion, -100, 100);
    S.legitimacy = clamp(S.legitimacy, 0, 100);
  }
  function punishPlayer(pun, ctx, what, R) {
    const me = player();
    switch (pun) {
      case 'warning': R.justice.push(`${what}: a warning.`); break;
      case 'fine': case 'bigfine': {
        const amt = pun === 'fine' ? 10 : 30;
        if (me.scrip >= amt) { me.scrip -= amt; S.treasury += amt; R.justice.push(`${what}: fined ${amt} scrip.`); }
        else { me.scrip = 0; S.apPenalty += 1; R.justice.push(`${what}: you couldn't pay, so tomorrow you lose an action to community service.`); }
        break;
      }
      case 'service': S.apPenalty += 1; R.justice.push(`${what}: community service costs you an action tomorrow.`); break;
      case 'shaming': for (const c of here()) if (!c.isPlayer) c.opinion = clamp(c.opinion - 5, -100, 100); R.justice.push(`${what}: shamed in front of the whole yard.`); break;
      case 'confiscate': me.scrip = 0; R.justice.push(`${what}: everything you owned was confiscated.`); break;
      case 'novote': me.novote = YEAR; R.justice.push(`${what}: you lost the vote for a year.`); break;
      case 'detention': case 'longdet': case 'torture': {
        const days = pun === 'detention' ? 2 : pun === 'torture' ? 3 : 7;
        me.status = 'detained'; me.detained = days;
        R.headlines.push(`${what}: ${days} days in the lock-up.`);
        if (pun === 'torture' && S.playerPlot != null && CC.exposePlot) CC.exposePlot(S.playerPlot, R, 'under torture');
        log(`You were detained ${ctx.why}.`, 'you');
        for (const c of here()) if (!c.isPlayer && c.friends.includes(PLAYER)) c.govt = clamp(c.govt - 6, -100, 100);
        break;
      }
      case 'flogging': me.health -= 40; S.apPenalty += 2; R.headlines.push(`${what}, and were flogged in the yard.`); for (const c of here()) if (!c.isPlayer) { c.opinion = clamp(c.opinion + 4, -100, 100); c.govt = clamp(c.govt - 3, -100, 100); } break;
      case 'exile': CC.gameOver('exiled', `${what}, and were exiled from the commune.`); break;
      case 'execution': CC.gameOver('executed', `${what}, and were executed by ${CC.METHODS[ctx.method || 'firing']} ${CC.SETTINGS[ctx.setting || 'private']}.`); break;
      case 'disappear': CC.gameOver('executed', 'You were taken in the night and never seen again.'); break;
    }
  }
  CC.applyPunishment = applyPunishment;

  // ───────────────────────── economy ─────────────────────────
  function economy(R) {
    const prod = S._prod;
    S.food += prod.food + 4;
    S.materials += prod.mat;
    S.treasury += prod.treasury;
    const seasonIdx = Math.floor((S.day % YEAR) / (YEAR / 4));
    const rain = 10 + [6, 2, 5, 8][seasonIdx] + (S.buildings.tank || 0) * 8;   // the standpipe plus rain off the roofs
    S.water += rain + prod.water;
    // upkeep: enforcement, buildings, institutions
    let upkeep = 0;
    const scale = Math.max(1, here().length / 20);
    for (const L of S.laws) if (RULES[L.rule].violation && active(L)) upkeep += ENF[L.enf].upkeep * scale;
    for (const [k, v] of Object.entries(S.buildings)) upkeep += (BUILDINGS[k].upkeep || 0) * v;
    for (const [k, on] of Object.entries(S.inst)) if (on) upkeep += CC.INSTITUTIONS[k].upkeep;
    S.treasury -= Math.round(upkeep * 10) / 10;
    S._upkeep = upkeep;
    if (S.treasury < 0) {
      R.headlines.push(`The treasury is empty (${Math.round(S.treasury)} scrip). Enforcement is working at half strength.`);
      for (const c of free()) if (c.trade === 'warden' && !c.isPlayer && chance(0.04)) { c.trade = 'labourer'; R.politics.push(`${c.first} quit as a warden: nobody is paying them.`); }
      if (S.treasury < -60 && S.inst.police && chance(0.1)) { S.inst.police = false; R.headlines.push('The secret police went unpaid and melted away.'); log('The secret police disbanded, unpaid.', 'politics'); }
      if (S.treasury < -60 && S.inst.cameras && chance(0.1)) { S.inst.cameras = false; R.headlines.push('The cameras went dark: nobody paid for them.'); }
    }
    // eating and drinking
    const people = here();
    const cook = Math.min(0.25, prod.cook);
    const foodDemand = people.reduce((n, c) => n + (c.isPlayer ? 1 : c.age < 16 ? 0.6 : 1), 0) * (1 - cook);
    const waterDemand = people.reduce((n, c) => n + (c.age < 16 ? 0.5 : 0.8), 0);
    const fr = Math.min(1, S.food / Math.max(1, foodDemand)), wr = Math.min(1, S.water / Math.max(1, waterDemand));
    S.food -= foodDemand * fr; S.water -= waterDemand * wr;
    S._fed = { fr, wr };
    const crowd = crowding();
    for (const c of people) {
      if (c.isPlayer) continue;
      const N = c.needs;
      N.food += 38 * fr - 32; N.water += 38 * wr - 32;
      if (c.age < 6) { N.belonging = clamp(N.belonging + 5, 0, 85); N.purpose = clamp(N.purpose + 5, 0, 85); N.freedom = clamp(N.freedom + 2, 0, 90); }
      else { N.belonging -= 12; N.purpose -= c.age < 16 ? 8 : 14; }
      N.safety -= 4;
      let squeeze = 0;
      for (const L of S.laws) if (governs(L, c) && RULES[L.rule].violation && (c.lawSupport[L.id] || 0) < 0) squeeze += 4;
      N.freedom += 6 - squeeze;
      if (crowd > 1) { N.belonging -= 6 * (crowd - 1); N.freedom -= 3 * (crowd - 1); }
      if (has(c, 'Paranoid') && (S.inst.police || S.laws.some((L) => L.enf === 'police' || L.enf === 'wardens'))) N.safety += 8;
      if (c.status === 'detained') { N.freedom -= 25; N.belonging -= 10; }
      for (const n of NEEDS) N[n] = clamp(N[n], 0, 100);
    }
    const days = (stock, dem) => (dem > 0 ? stock / dem : 99);
    if (fr >= 1 && days(S.food, foodDemand) < 3) R.headlines.push(`Food stores are low: about ${Math.max(0, Math.floor(days(S.food, foodDemand)))} days left.`);
    if (wr >= 1 && days(S.water, waterDemand) < 3) R.headlines.push(`Water is low: about ${Math.max(0, Math.floor(days(S.water, waterDemand)))} days left.`);
    if (S._unpaid) { R.headlines.push(`The treasury couldn't pay ${S._unpaid} subsidies today. People noticed.`); S._unpaid = 0; }
    if (fr < 1) R.headlines.push(fr < 0.5 ? 'The food has run out. Most people went to bed hungry.' : 'Food is short. Not everyone ate today.');
    if (wr < 1) R.headlines.push('The water tanks ran dry today.');
    S.food = clamp(S.food, 0, foodCap()); S.water = clamp(S.water, 0, waterCap());
    S.materials = Math.max(0, S.materials);
    S._heal = prod.heal;
    R.stats.food = Math.round(prod.food + 2); R.stats.water = Math.round(rain + prod.water); R.stats.mat = Math.round(prod.mat); R.stats.upkeep = Math.round(upkeep);
  }

  // ───────────────────────── life: health, love, births, ageing, comings and goings ─────────────────────────
  function widow(c, R) {
    const p = P(c.partner);
    if (p && p.partner === c.id) { p.partner = null; p.needs.belonging -= 40; p.family_loss = true; }
    c.partner = null;
    for (const k of c.children.map(P)) if (k && alive(k)) k.family_loss = true;
  }
  function departFamily(c, R) {
    widow(c, R);
    for (const k of c.children.map(P)) {
      if (k && alive(k) && k.age < 16 && !k.parents.some((pid) => { const p = P(pid); return p && alive(p) && p !== c; })) {
        k.status = 'fled'; R.life.push(`${k.first} went with ${c.first}.`);
      }
    }
  }
  function nightLife(R) {
    const people = here();
    const crowd = crowding();
    // health, illness, healing
    let heal = S._heal || 0;
    const sick = [];
    for (const c of people) {
      if (c.isPlayer) continue;
      if (c.needs.food < 15 || c.needs.water < 15) c.health -= 5;
      else c.health += 2;
      const illP = 0.003 + Math.max(0, crowd - 1) * 0.008 + (c.age >= 65 ? 0.004 : 0) + (c.age < 3 ? 0.002 : 0);
      if (chance(illP)) { c.health -= 25; c.ill = true; R.life.push(`${c.first} fell ill.`); }
      if (c.health < 70) sick.push(c);
      c.health = clamp(c.health, -10, 100);
    }
    sick.sort((a, b) => a.health - b.health);
    for (const c of sick) { if (heal <= 0) break; const h = Math.min(heal, 20); c.health += h; heal -= h; if (c.health > 60) c.ill = false; }
    // deaths
    for (const c of people) {
      if (c.isPlayer) continue;
      let p = 0;
      if (c.age > 60) p += Math.pow(c.age - 60, 2) * 0.00002;
      if (c.health < 25) p += (25 - c.health) * 0.004 * (S.buildings.clinic ? 0.6 : 1);
      if (c.health <= 0) p = 1;
      if (chance(p)) {
        c.status = 'dead'; c.history.push(`Died on day ${S.day}`); S.stats.deaths++;
        const how = c.health <= 0 && (c.needs.food < 15 || c.needs.water < 15) ? 'of hunger and thirst' : c.age > 70 ? 'of old age' : 'after an illness';
        R.headlines.push(`${c.first} ${c.last} died ${how}, aged ${Math.floor(c.age)}.`);
        log(`${c.first} ${c.last} died ${how}, aged ${Math.floor(c.age)}.`, 'death');
        for (const f of c.friends.map(P)) if (f && alive(f) && !f.isPlayer) f.needs.belonging -= 15;
        widow(c, R);
        if (how === 'of hunger and thirst') for (const x of here()) blame(x, -6);
      }
    }
    // partnerships
    const singles = shuffle(npcFree().filter((c) => c.age >= 18 && c.partner == null));
    const taken = new Set();
    for (const c of singles) {
      if (taken.has(c.id) || !chance(0.05)) continue;
      const pool = singles.filter((d) => d !== c && !taken.has(d.id) && Math.abs(d.age - c.age) <= 14 && !c.parents.includes(d.id) && !d.parents.includes(c.id) && !(c.parents.length && c.parents.some((p) => d.parents.includes(p))));
      if (!pool.length) continue;
      const d = pool.find((x) => c.friends.includes(x.id)) || pick(pool);
      let affinity = (c.friends.includes(d.id) ? 0.5 : 0.15) + (has(c, 'Romantic') || has(d, 'Romantic') ? 0.2 : 0) + (c.party != null && c.party === d.party ? 0.1 : 0) - ((c.grudges[d.id] || 0) + (d.grudges[c.id] || 0)) / 100;
      if (!chance(Math.max(0, affinity) * 0.5)) continue;
      // the law
      let deter = 0, lawHit = [];
      for (const L of S.laws) {
        if (L.beh !== 'partner' || !RULES[L.rule].violation) continue;
        for (const x of [c, d]) {
          if (!governs(L, x)) continue;
          const broke = L.rule === 'ban' || (L.rule === 'ration' && (x.life.partner || 0) >= 1) || (L.rule === 'license' && !x.licenses.includes(L.id));
          if (L.rule === 'license' && !x.licenses.includes(L.id) && x.scrip >= CC.LICENSE_FEE) { x.licenses.push(L.id); x.scrip -= CC.LICENSE_FEE; S.treasury += CC.LICENSE_FEE; continue; }
          if (broke) { deter += deterrent(x, L); lawHit.push({ c: x, L }); }
        }
      }
      for (const L of S.laws) if (L.beh === 'partner' && (L.rule === 'tax' || L.rule === 'subsidise' || L.rule === 'reward') && governs(L, c)) {
        if (L.rule === 'tax') { const pay = Math.min(c.scrip, L.amount); c.scrip -= pay; S.treasury += pay; deter += L.amount * 2; }
        if (L.rule === 'subsidise') { c.scrip += L.amount; S.treasury -= L.amount; deter -= L.amount * 2; }
        if (L.rule === 'reward') deter -= 10;
      }
      const want = lifeLike(c, 'partner') + rnd() * 20;
      if (want - deter <= 0) continue;
      pair(c, d); taken.add(c.id); taken.add(d.id);
      R.life.push(`${c.first} and ${d.first} have become partners${lawHit.length ? ', against the law' : ''}.`);
      log(`${c.first} ${c.last} and ${d.first} ${d.last} became partners.`, 'life');
      for (const v of lawHit) punishLife(v.c, v.L, R, 'forming a partnership');
    }
    // break-ups
    for (const c of npcFree()) {
      const p = P(c.partner);
      if (!p || c.id > p.id || !alive(p)) continue;
      const strain = ((c.grudges[p.id] || 0) + (p.grudges[c.id] || 0)) / 100 + (c.needs.belonging < 20 ? 0.01 : 0);
      if (chance(0.0015 + strain * 0.02)) {
        c.partner = null; p.partner = null; c.needs.belonging -= 20; p.needs.belonging -= 20;
        R.life.push(`${c.first} and ${p.first} have split up.`);
        log(`${c.first} ${c.last} and ${p.first} ${p.last} split up.`, 'life');
      }
    }
    // children
    for (const c of npcFree()) {
      const p = P(c.partner);
      if (!p || c.id > p.id || p.status !== 'free' || c.expecting || p.isPlayer) continue;
      if (c.age > 50 && p.age > 50) continue;
      if (Math.min(c.age, p.age) < 18) continue;
      let pr = 0.008 * (has(c, 'Family-minded') || has(p, 'Family-minded') ? 2 : 1) * (crowding() > 1.1 ? 0.25 : 1) * (S._fed && S._fed.fr < 0.8 ? 0.3 : 1) * (c.children.length >= 3 ? 0.3 : 1);
      if (!chance(pr)) continue;
      let deter = 0;
      for (const L of S.laws) {
        if (L.beh !== 'child' || !RULES[L.rule].violation) continue;
        for (const x of [c, p]) {
          if (!governs(L, x)) continue;
          const broke = L.rule === 'ban' || (L.rule === 'ration' && x.children.length >= 1) || (L.rule === 'license' && !x.licenses.includes(L.id));
          if (broke) deter += deterrent(x, L);
        }
      }
      for (const L of S.laws) if (L.beh === 'child' && governs(L, c)) { if (L.rule === 'tax') deter += L.amount * 3; if (L.rule === 'subsidise') deter -= L.amount * 3; if (L.rule === 'reward') deter -= 10; }
      if (lifeLike(c, 'child') + rnd() * 20 - deter <= 0) continue;
      c.expecting = S.day + 10; p.expecting = c.expecting;
      if (chance(0.5)) R.life.push(`${c.first} and ${p.first} are expecting a child.`);
    }
    for (const c of here()) {
      if (!c.expecting || c.expecting > S.day) continue;
      const p = P(c.partner);
      const other = p && p.expecting === c.expecting ? p : null;
      if (other && other.id < c.id) continue;
      c.expecting = 0; if (other) other.expecting = 0;
      const baby = addChild(c, other, { age: 0, bornHere: true, arrived: S.day });
      S.stats.births++;
      R.headlines.push(`${c.first}${other ? ' and ' + other.first : ''} welcomed a baby, ${baby.first}.`);
      log(`${baby.first} ${baby.last} was born to ${c.first}${other ? ' and ' + other.first : ''}.`, 'birth');
      if (crowding() > 1.3 && !S.buildings.clinic && chance(0.05)) { baby.health = 20; }
      for (const L of S.laws) {
        if (L.beh !== 'child' || !RULES[L.rule].violation) continue;
        for (const x of [c, other].filter(Boolean)) {
          if (!governs(L, x)) continue;
          const broke = L.rule === 'ban' || (L.rule === 'ration' && x.children.length > 1) || (L.rule === 'license' && !x.licenses.includes(L.id));
          if (broke) punishLife(x, L, R, 'having a child');
        }
      }
      for (const L of S.laws) if (L.beh === 'child' && governs(L, c)) {
        if (L.rule === 'subsidise') { c.scrip += L.amount; S.treasury -= L.amount; }
        if (L.rule === 'tax') { const pay = Math.min(c.scrip, L.amount); c.scrip -= pay; S.treasury += pay; }
      }
    }
    // ageing
    for (const c of here()) {
      const before = Math.floor(c.age);
      c.age += 1 / YEAR;
      const after = Math.floor(c.age);
      if (c.novote > 0) c.novote--;
      if (c.isPlayer) continue;
      if (before < 16 && after >= 16) {
        const parentTrade = c.parents.map(P).filter(Boolean).map((x) => x.trade).filter((t) => CC.TRADES[t]);
        c.trade = c.edu > 65 ? pick(['medic', 'teacher', 'organiser', 'mechanic']) : chance(0.4) && parentTrade.length ? pick(parentTrade) : randTrade();
        R.life.push(`${c.first} came of age and became a ${CC.TRADES[c.trade].label}.`);
        log(`${c.first} ${c.last} came of age.`, 'life');
      }
      if (before < 65 && after >= 65) { c.retired = true; R.life.push(`${c.first} turned 65 and is taking things easier.`); }
    }
    // leaving
    leaving(R);
    // newcomers at the gate
    arrivals(R);
    // detention capacity
    const held = here().filter((c) => c.status === 'detained' && !c.isPlayer);
    const cap = (S.buildings.lockup || 0) * 4 + 2;
    if (held.length > cap) { for (const c of held) c.health -= 4; R.justice.push(`The lock-up holds ${cap} but ${held.length} are detained. They are kept in cold containers.`); }
  }
  function punishLife(c, L, R, doing) {
    if (!chance(catchRate(L) + 0.25)) return;
    if (c.isPlayer && leaderIsPlayer()) return;
    applyPunishment(c, L.pun, { why: `for ${doing} against “${L.name}”`, how: 'caught', method: L.method, setting: L.setting, R });
  }
  function leaving(R) {
    const leaveLaws = S.laws.filter((L) => L.beh === 'leave' && RULES[L.rule].violation && active(L));
    for (const c of npcFree()) {
      if (c.age < 16) continue;
      let want = leaveWant(c);
      if (S.laws.some((L) => L.beh === 'leave' && L.rule === 'require' && governs(L, c))) want += 60;
      for (const L of S.laws) if (applies(L, c) && RULES[L.rule].violation && PUN[L.pun].sev >= 70 && (c.lawSupport[L.id] || 0) < -40) want += 15;
      const trap = trapped(c, true);
      if (trap && PUN[trap[0].pun].sev + PUN[trap[1].pun].sev >= 80) { want += 70; c._trap = trap; }
      let deter = 0;
      for (const L of leaveLaws) if (L.rule === 'ban' && governs(L, c)) deter += deterrent(c, L);
      if (want - deter > 0 && chance(0.3)) {
        const ban = leaveLaws.find((L) => L.rule === 'ban' && governs(L, c));
        if (ban && chance(catchRate(ban))) {
          R.justice.push(`${c.first} tried to slip out at night and was stopped.`);
          applyPunishment(c, ban.pun, { why: `for trying to leave against “${ban.name}”`, how: 'caught', method: ban.method, setting: ban.setting, R });
        } else {
          c.status = 'fled'; c.history.push(`Left on day ${S.day}`); S.stats.departures++;
          S.attention = clamp(S.attention + (ban ? 3 : 1), 0, 100);
          R.headlines.push(c._trap ? `${c.first} ${c.last} fled in the night rather than face “${c._trap[0].name}” and “${c._trap[1].name}”.` : `${c.first} ${c.last} left the commune${ban ? ', slipping past the guards' : ''}.`);
          log(`${c.first} ${c.last} left the commune.`, 'depart');
          const p = P(c.partner);
          if (p && p.status === 'free' && !p.isPlayer && (regimeOp(p) < 10 || chance(0.6))) { p.status = 'fled'; S.stats.departures++; R.life.push(`${p.first} went too.`); for (const k of p.children.map(P)) if (k && alive(k) && k.age < 16) k.status = 'fled'; }
          departFamily(c, R);
        }
      }
    }
  }
  function arrivalGroup() {
    const roll = rnd();
    const ages = () => 20 + rnd() * 30;
    const a = { age: ages(), last: pick(CC.LAST) };
    if (roll < 0.5) return [a];
    const b = { age: a.age + (rnd() - 0.5) * 10, last: chance(0.5) ? a.last : pick(CC.LAST), couple: true };
    if (roll < 0.8) return [a, b];
    const kids = 1 + Math.floor(rnd() * 3);
    const out = [a, b];
    for (let i = 0; i < kids; i++) out.push({ age: 1 + rnd() * 13, last: a.last, kid: true });
    return out;
  }
  function describeGroup(g) {
    const adults = g.filter((x) => !x.kid).length, kids = g.filter((x) => x.kid).length;
    if (adults === 1) return 'A lone traveller';
    if (!kids) return 'A couple';
    return `A family of ${g.length}`;
  }
  function admitGroup(g, R) {
    const made = [];
    for (const o of g) {
      const c = makePerson({ age: o.age, last: o.last, opinion: 10, govt: 20, arrived: S.day, trade: o.kid ? 'child' : undefined });
      made.push(c);
    }
    const adults = made.filter((c) => c.age >= 16);
    if (adults.length === 2) pair(adults[0], adults[1]);
    for (const k of made.filter((c) => c.age < 16)) { k.parents = adults.map((a) => a.id); for (const a of adults) { a.children.push(k.id); befriend(a, k); } }
    // they make a friend or two
    for (const c of made) for (const f of shuffle(npcFree().filter((x) => !made.includes(x))).slice(0, 1)) befriend(c, f);
    S.stats.arrivals += made.length;
    for (const c of made) for (const L of S.laws) c.lawSupport[L.id] = supportFor(c, L);
    log(`${describeGroup(g)} arrived: ${list(made.map((c) => `${c.first} ${c.last}`))}.`, 'arrival');
    return made;
  }
  function arrivals(R) {
    if (S.gov.gate === 'closed') return;
    const rep = clamp((wellbeing() / 60) * (0.5 + S.legitimacy / 120) * (S.attention > 60 ? 0.7 : 1), 0.2, 1.5);
    if (!chance(0.08 * rep * (crowding() > 1.2 ? 0.5 : 1) * clamp(1.6 - here().length / 50, 0.15, 1))) return;
    const g = arrivalGroup();
    g.forEach((o) => { o.first = pickFirst(); });
    const traitsPreview = g.filter((x) => !x.kid).map(() => randTraits(2));
    g.filter((x) => !x.kid).forEach((o, i) => { o.traits = traitsPreview[i]; o.trade = randTrade(); });
    if (S.gov.gate === 'open') {
      const made = admitGroup(g.map((o) => ({ ...o })), R);
      made.forEach((c, i) => { if (g[i].traits) c.traits = g[i].traits; if (g[i].trade) c.trade = g[i].trade; if (g[i].first) c.first = g[i].first; });
      R.headlines.push(`${describeGroup(g)} arrived at the gate and moved in: ${list(made.map((c) => c.first))}.`);
    } else if (leaderIsPlayer()) {
      CC.queueEvent('gate', { group: g });
    } else {
      const lead = P(S.gov.leader);
      const harsh = lead && (has(lead, 'Paranoid') || has(lead, 'Hot-headed'));
      const risky = g.some((o) => o.traits && (o.traits.includes('Rebellious') || o.traits.includes('Light-fingered')));
      if (crowding() < 1.2 && !(harsh && risky) && chance(harsh ? 0.4 : 0.8)) {
        const made = admitGroup(g, R);
        made.forEach((c, i) => { if (g[i].traits) c.traits = g[i].traits; if (g[i].trade) c.trade = g[i].trade; if (g[i].first) c.first = g[i].first; });
        R.life.push(`${describeGroup(g)} was let in at the gate: ${list(made.map((c) => c.first))}.`);
      } else R.life.push(`${describeGroup(g)} was turned away at the gate.`);
    }
  }
  CC._life = { admitGroup, describeGroup, departFamily, widow };

  // ───────────────────────── opinions ─────────────────────────
  function updateOpinions(R, before) {
    recomputeSupport();
    const baseFear = S.laws.reduce((n, L) => n + (RULES[L.rule].violation && active(L) ? ENF[L.enf].fear : 0), 0) + (S.inst.police ? 10 : 0) + (S.gov.type === 'dictatorship' ? 8 : 0);
    const leader = P(S.gov.leader);
    for (const c of here()) {
      if (c.isPlayer) continue;
      let d = (needAvg(c) - 60) * 0.02;
      const felt = S.laws.filter((L) => applies(L, c) || c.motive !== 'self');
      if (felt.length) d += (felt.reduce((n, L) => n + (c.lawSupport[L.id] || 0), 0) / felt.length) * 0.03 + felt.filter((L) => (c.lawSupport[L.id] || 0) < -30).length * -0.25;
      if (S.treasury < 0 && c.trade === 'warden') d -= 1.5;
      const fr = c.friends.map(P).filter((x) => x && x.status === 'free' && !x.isPlayer);
      if (fr.length) d += (fr.reduce((n, x) => n + x.govt, 0) / fr.length - c.govt) * 0.06;
      if (has(c, 'Loyal')) d += 0.6;
      if (has(c, 'Rebellious') && S.gov.type === 'dictatorship') d -= 0.8;
      if (CC.GOV[S.gov.type].demo && has(c, 'Idealist')) d += 0.3;
      if (!CC.GOV[S.gov.type].demo && has(c, 'Idealist')) d -= 0.6;
      if (c.grudge_regime) d -= 0.5;
      if (leader && !leader.isPlayer) {
        if (c.party != null && c.party === leader.party) d += 0.5;
        else if (c.party != null) d -= 0.3;
      }
      d += (S.legitimacy - 50) * 0.005;
      d -= c.govt * 0.02;
      c.govt = clamp(c.govt + d, -100, 100);
      if (leaderIsPlayer()) c.opinion = c.govt;
      else {
        // your personal standing: friendship, your platform, and slow fading
        let e = -c.opinion * 0.01;
        if (c.friends.includes(PLAYER)) e += 0.4;
        const pl = CC.playerStance ? CC.playerStance() : null;
        if (pl && Object.keys(pl).length) e += agreement(c, pl) * 0.8;
        if (fr.length) e += (fr.reduce((n, x) => n + x.opinion, 0) / fr.length - c.opinion) * 0.03;
        c.opinion = clamp(c.opinion + e, -100, 100);
      }
      c.fear = clamp(c.fear + (baseFear - c.fear) * 0.12, 0, 100);
      if (c.lobby > 0) c.lobby = Math.max(0, c.lobby - 3);
      if (c.bribed > 0) c.bribed--;
      if (c.family_loss && chance(0.05)) c.family_loss = false;
    }
    S.legitimacy = clamp(S.legitimacy + (approval() - S.legitimacy) * 0.04, 0, 100);
    S.attention = clamp(S.attention - 0.3, 0, 100);
    S.exposure = clamp(S.exposure - 0.4, 0, 100);
    const after = { approval: approval(), legit: S.legitimacy, fear: avgFear(), standing: standing() };
    const arrow = (a, b) => (b - a > 0.5 ? `up ${Math.round(b - a)}` : b - a < -0.5 ? `down ${Math.round(a - b)}` : 'steady');
    R.mood.unshift(`Government approval ${arrow(before.approval, after.approval)} to ${Math.round(after.approval)}. Your standing ${arrow(before.standing, after.standing)} to ${Math.round(after.standing)}. Fear ${arrow(before.fear, after.fear)} to ${Math.round(after.fear)}. Legitimacy ${arrow(before.legit, after.legit)} to ${Math.round(after.legit)}.`);
    if (S.laws.length) {
      const ranked = S.laws.map((L) => ({ L, p: lawPopularity(L) })).sort((a, b) => a.p.pct - b.p.pct);
      const worst = ranked[0], best = ranked[ranked.length - 1];
      if (worst.p.pct < 40) R.mood.push(`Most resented law: “${worst.L.name}” (${worst.p.pct}% back it).`);
      if (best.p.pct >= 60 && best !== worst) R.mood.push(`Most popular law: “${best.L.name}” (${best.p.pct}% back it).`);
      const voices = adultsHere().filter((c) => !c.isPlayer);
      const strong = [];
      for (const c of voices) for (const L of S.laws) strong.push({ c, L, s: c.lawSupport[L.id] || 0 });
      strong.sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
      const q = strong.find((x) => Math.abs(x.s) > 40 && chance(0.6)) || strong[0];
      if (q && Math.abs(q.s) > 30) R.mood.push(quote(q.c, q.L, q.s));
    }
    const plotters = here().filter((c) => c.plot != null && !c.isPlayer).length;
    if (plotters >= 3 && chance(0.4)) R.mood.push('There are whispers of a plot.');
  }
  function quote(c, L, s) {
    const pos = [`“Say what you like about ‘${L.name}’, it works,” says ${c.first}.`, `“‘${L.name}’ is the best thing we've done,” says ${c.first}.`, `“We needed ‘${L.name}’,” says ${c.first}.`];
    const neg = [`“‘${L.name}’ has to go,” says ${c.first}.`, `“Who asked for ‘${L.name}’?” says ${c.first}.`, `“I didn't leave one country to be told what to do by another,” says ${c.first}, about ‘${L.name}’.`];
    if (c.motive === 'believed' && s > 0) return `“Everyone secretly wants ‘${L.name}’,” says ${c.first}, who is quite sure of it.`;
    return pick(s > 0 ? pos : neg);
  }

  // ───────────────────────── the turn ─────────────────────────
  function endDay() {
    if (!S || S.over) return null;
    CC.resolveDefaults();
    const R = (S.report = { day: S.day, headlines: [], justice: [], life: [], politics: [], mood: [], stats: {} });
    const before = { approval: approval(), legit: S.legitimacy, fear: avgFear(), standing: standing() };
    recomputeSupport();
    dayActions(R);
    justice(R);
    economy(R);
    if (!S.over) nightLife(R);
    if (!S.over) CC.politics(R);
    if (!S.over) updateOpinions(R, before);
    morning(R);
    const pop = here().length;
    S.peakPop = Math.max(S.peakPop, pop);
    S.history.push({ day: S.day, pop, approval: Math.round(approval()), standing: Math.round(standing()), legitimacy: Math.round(S.legitimacy), fear: Math.round(avgFear()), food: Math.round(S.food), treasury: Math.round(S.treasury) });
    if (S.history.length > 400) S.history.shift();
    if (!S.over) CC.checkEndings(R);
    return R;
  }
  function morning(R) {
    S.day++;
    S.addressToday = false; S.rally = false; S.pdid = []; S.campaignToday = 0; S.dayNotes = [];
    for (const c of S.people) if (c.status === 'detained') { c.detained--; if (c.detained <= 0) { c.status = 'free'; if (c.isPlayer) R.headlines.push('You were released from the lock-up.'); } }
    const me = player();
    S.ap = me.status === 'free' ? Math.max(0, S.apMax - S.apPenalty) : 0;
    S.apPenalty = 0;
    for (const L of S.laws) if (L.from === S.day) R.headlines.push(`“${L.name}” is now in force.`);
    if (S.day % YEAR === 0) { R.headlines.push(`A new year begins: Year ${Math.floor(S.day / YEAR) + 1}.`); yearlyCensus(R); }
    CC.morningEvents && CC.morningEvents(R);
  }
  // laws that require a life event are checked once a year
  function yearlyCensus(R) {
    for (const L of S.laws) {
      if (L.rule !== 'require' || BEH[L.beh].kind !== 'life' || !active(L)) continue;
      for (const c of free()) {
        if (!governs(L, c)) continue;
        const did = L.beh === 'partner' ? c.partner != null : L.beh === 'child' ? c.children.some((k) => P(k) && S.day - P(k).arrived < YEAR + 1) : false;
        if (!did && L.beh !== 'leave') { if (c.isPlayer && leaderIsPlayer()) continue; applyPunishment(c, L.pun, { why: `for not obeying “${L.name}” this year`, how: 'named in the census', method: L.method, setting: L.setting, R }); }
        if (L.beh === 'leave' && !c.isPlayer && chance(0.5)) { c.status = 'fled'; R.headlines.push(`${c.first} left, as “${L.name}” requires.`); }
      }
    }
  }

  // ───────────────────────── exports ─────────────────────────
  CC.useState = (s) => { S = s; CC.S = s; if (CC._politicsUse) CC._politicsUse(s); };
  CC.getState = () => S;
  Object.assign(CC, {
    endDay, approval, standing, avgFear, wellbeing, calendar, whoInfo, whoOptions, eligible, applies, active, governs, conflictsFor, catchRate,
    describeLaw, ruleText, punText, rulesFor, likeOf, valueOf, desires, agreement, supportFor, lawPopularity, recomputeSupport, explain,
    enforcementCapacity, wardenCount, crowding, containersUsed, capacityHomes, foodCap, waterCap, needAvg, POLICY_BEH, leaveWant, trapped,
  });
})(typeof window !== 'undefined' ? window : globalThis);
