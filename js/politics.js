/*
  CONTAINER COMMUNE — politics, the player, events and endings
  Government, parties, elections, AI leaders, plots and coups, secret rule, scandals,
  the outside world, player actions, choice events, new games and saving.
*/
(function (root) {
  'use strict';
  const CC = root.CC;
  const { BEH, RULES, PUN, YEAR } = CC;
  const PLAYER = CC.PLAYER;
  let S = null;
  CC._politicsUse = (s) => { S = s; };
  const I = CC._internals;
  const { clamp, rnd, chance, pick, shuffle, P, alive, here, free, npcFree, adultsHere, has, player, leaderIsPlayer, regimeOp, nm, Nm, list, blame, log, partnersOf, livePartners, sameSex, attracted, money } = I;
  const owned = () => S.owned || (S.owned = { aides: 0, guards: false, villa: false, clothes: false });
  const demo = () => CC.GOV[S.gov.type].demo;
  const fmt = (n) => Math.round(n);
  function note(text) { S.dayNotes.push(text); }
  function secret(text, amount) { S.exposure = clamp(S.exposure + amount, 0, 100); S.secrets.push({ day: S.day, text }); if (S.secrets.length > 12) S.secrets.shift(); }

  // ───────────────────────── parties ─────────────────────────
  function partyById(id) { return S.parties.find((p) => p.id === id && !p.dissolved); }
  function partyOf(c) { return c && c.party != null ? partyById(c.party) : null; }
  function members(p) { return here().filter((c) => c.party === p.id && c.age >= 16); }
  function cleanStance(st) { const o = {}; for (const b of CC.POLICY_BEH) if (st[b] && Math.abs(st[b]) >= 0.05) o[b] = Math.round(clamp(st[b], -1, 1) * 100) / 100; return o; }
  function newParty(name, leaderId, stance, motive) {
    const used = S.parties.map((p) => p.color);
    const color = CC.PARTY_COLORS.find((c) => !used.includes(c)) || pick(CC.PARTY_COLORS);
    const p = { id: S.nextPartyId++, name, color, leader: leaderId, stance: cleanStance(stance), motive: motive || 'ideological', discipline: 0.6, founded: S.day, activity: 0, dissolved: false };
    S.parties.push(p);
    const L = P(leaderId); if (L) L.party = p.id;
    log(`${name} was founded by ${L ? (L.isPlayer ? 'you' : L.first + ' ' + L.last) : 'its members'}.`, 'politics');
    return p;
  }
  function stanceFromDesires(c) {
    const d = CC.desires(c), st = {};
    const keys = Object.keys(d).sort((a, b) => Math.abs(d[b]) - Math.abs(d[a])).slice(0, 7);
    for (const b of keys) if (Math.abs(d[b]) > 0.25) st[b] = Math.sign(d[b]) * Math.min(1, Math.abs(d[b]) + 0.2);
    return st;
  }
  function partyAgreement(a, b) {
    let num = 0, den = 0;
    for (const k of CC.POLICY_BEH) { const x = a.stance[k] || 0, y = b.stance[k] || 0; num += x * y; den += Math.max(Math.abs(x), Math.abs(y)); }
    return den ? num / den : 0;
  }
  function playerStance() {
    const p = partyOf(player());
    if (p && p.leader === PLAYER) return p.stance;
    return S.platform;
  }
  CC.playerStance = playerStance;
  function partyTick(R) {
    for (const p of S.parties.filter((x) => !x.dissolved)) {
      const mem = members(p);
      if (p.outlawed) for (const c of mem) if (!c.isPlayer && c.id !== p.leader && chance(has(c, 'Rebellious') || has(c, 'Idealist') ? 0.015 : 0.06)) { c.party = null; if (chance(0.4)) R.politics.push(`${c.first} quietly left ${p.name}, now that it's outlawed.`); }
      if (!mem.length) { p.dissolved = true; log(`${p.name} dissolved: it had no members left.`, 'politics'); R.politics.push(`${p.name} has dissolved.`); continue; }
      const L = P(p.leader);
      if (!L || !alive(L) || L.party !== p.id) {
        const me = player();
        const meScore = me.party === p.id ? mem.reduce((n, c) => n + (c.isPlayer ? 0 : c.opinion), 0) / Math.max(1, mem.length - 1) : -999;
        const npcs = mem.filter((c) => !c.isPlayer).map((c) => ({ c, s: (has(c, 'Ambitious') ? 25 : 0) + (has(c, 'Idealist') ? 10 : 0) + c.friends.filter((f) => mem.some((m) => m.id === f)).length * 6 + rnd() * 10 }));
        npcs.sort((a, b) => b.s - a.s);
        if (meScore > 35 || !npcs.length) { p.leader = PLAYER; R.politics.push(`You are now the leader of ${p.name}.`); S.platform = { ...p.stance }; }
        else { p.leader = npcs[0].c.id; R.politics.push(`${npcs[0].c.first} now leads ${p.name}.`); }
      }
      if (p.leader !== PLAYER) {
        // policies drift towards what members want
        const avg = {};
        for (const b of CC.POLICY_BEH) avg[b] = mem.filter((c) => !c.isPlayer).reduce((n, c) => n + (CC.desires(c)[b] || 0), 0) / Math.max(1, mem.length);
        const rate = p.motive === 'power' ? 0.06 : 0.025;
        for (const b of CC.POLICY_BEH) {
          const cur = p.stance[b] || 0;
          const next = cur + (avg[b] * 1.3 - cur) * rate;
          if (Math.abs(next) >= 0.05 || cur) p.stance[b] = Math.round(clamp(next, -1, 1) * 100) / 100;
        }
        p.stance = cleanStance(p.stance);
      }
    }
    // joining and leaving
    const live = S.parties.filter((x) => !x.dissolved && !x.outlawed);
    for (const c of npcFree()) {
      if (c.age < 16) continue;
      const cur = partyOf(c);
      if (cur) {
        if (cur.leader === c.id) continue;
        if (CC.agreement(c, cur.stance) < -0.05 && chance(0.05)) { c.party = null; R.politics.push(`${c.first} left ${cur.name}.`); }
        continue;
      }
      if (!live.length) continue;
      const keen = (has(c, 'Idealist') ? 3 : 1) * (has(c, 'Ambitious') ? 2 : 1);
      if (!chance(0.015 * keen)) continue;
      const best = live.map((p) => ({ p, a: CC.agreement(c, p.stance) + (p.leader === PLAYER ? c.opinion / 200 : 0) })).sort((a, b) => b.a - a.a)[0];
      if (best && best.a > 0.2) { c.party = best.p.id; if (chance(0.5)) R.politics.push(`${c.first} joined ${best.p.name}.`); }
    }
    // new parties form in democracies
    if (demo() && live.length < 5 && S.day % 6 === 0) {
      const founder = shuffle(npcFree().filter((c) => c.age >= 18 && c.party == null && (has(c, 'Idealist') || has(c, 'Ambitious'))))[0];
      if (founder) {
        const st = stanceFromDesires(founder);
        const fans = npcFree().filter((c) => c !== founder && c.age >= 16 && c.party == null && CC.agreement(c, st) > 0.3);
        const clash = live.some((p) => partyAgreement(p, { stance: st }) > 0.6);
        if (fans.length >= 2 && !clash) {
          const used = S.parties.map((p) => p.name);
          const name = CC.PARTY_NAMES.find((n) => !used.includes(n)) || `${founder.last} List`;
          const p = newParty(name, founder.id, st, has(founder, 'Ambitious') && founder.motive === 'self' ? 'power' : 'ideological');
          for (const f of fans.slice(0, 3)) f.party = p.id;
          R.politics.push(`${founder.first} ${founder.last} founded a new party, ${name}, with ${list(fans.slice(0, 3).map((c) => c.first))}.`);
        }
      }
    }
  }

  // ───────────────────────── votes ─────────────────────────
  // why a voter leans the way they do: each part is a number of points for (+) or against (-)
  function voterParts(v, L, proposer, isRepeal) {
    const parts = [];
    let own = v.lawSupport[L.id] != null && isRepeal ? v.lawSupport[L.id] : CC.supportFor(v, L);
    if (isRepeal) own = -own;
    parts.push({ k: 'own', v: own, t: own > 0 ? (isRepeal ? 'wants it gone' : 'thinks it is a good law') : (isRepeal ? 'wants to keep it' : 'thinks it is a bad law') });
    const party = partyOf(v);
    if (party && party.stance[L.beh] != null) { const x = (isRepeal ? -1 : 1) * party.stance[L.beh] * RULES[L.rule].dir * 25 * party.discipline; parts.push({ k: 'party', v: x, t: `${party.name} line: ${x > 0 ? 'for' : 'against'}` }); }
    if (proposer != null && proposer === S.gov.leader) {
      const g = regimeOp(v) * 0.12; parts.push({ k: 'govt', v: g, t: g > 0 ? 'backs the government' : 'distrusts the government' });
      if (v.fear > 40) parts.push({ k: 'fear', v: (v.fear - 40) * 0.3, t: 'afraid to say no' });
    }
    if (proposer === PLAYER || L.by === PLAYER) {
      parts.push({ k: 'you', v: v.opinion * 0.15, t: v.opinion > 0 ? 'likes you' : 'dislikes you' });
      if (v.lobby) parts.push({ k: 'lobby', v: v.lobby, t: 'you have worked on them' });
      if (v.bribed) parts.push({ k: 'bribe', v: 20, t: 'took your money' });
    }
    if (S._petitionBoost) parts.push({ k: 'petition', v: S._petitionBoost, t: 'the petition' });
    return parts;
  }
  function voterLawScore(v, L, proposer, isRepeal, noise) {
    let s = voterParts(v, L, proposer, isRepeal).reduce((n, p) => n + p.v, 0);
    if (noise) s += (rnd() - 0.5) * 16;
    return s;
  }
  function vote(L, voters, proposer, isRepeal, noise) {
    let yes = 0, no = 0; const ayes = [], noes = [];
    for (const v of voters) {
      let s;
      if (v.isPlayer && S._pvote !== undefined) {
        if (S._pvote == null) continue;
        s = S._pvote === 'yes' ? 1 : -1;
      } else if (v.isPlayer) {
        if (proposer === PLAYER) s = 100;
        else { const st = playerStance()[L.beh] || 0; s = st * RULES[L.rule].dir * 50 * (isRepeal ? -1 : 1); if (!st) s = isRepeal ? -1 : -1; }
      } else s = voterLawScore(v, L, proposer, isRepeal, noise);
      if (s > 0) { yes++; ayes.push(v); } else { no++; noes.push(v); }
    }
    return { yes, no, passed: yes > no, ayes, noes };
  }
  function lawVoters() {
    if (S.gov.type === 'council') return S.gov.council.map(P).filter((c) => c && c.status === 'free');
    if (S.gov.type === 'assembly') return adultsHere().filter((c) => c.status === 'free' && c.novote <= 0);
    return [];
  }
  CC.lawVoters = lawVoters;
  CC.voteForecast = function (spec) {
    const L = CC._laws.buildLaw({ ...spec, by: PLAYER }); L.id = -1;
    const voters = lawVoters();
    if (!voters.length) return null;
    const r = vote(L, voters, leaderIsPlayer() ? PLAYER : null, false, false);
    return { yes: r.yes, no: r.no, total: voters.length, who: S.gov.type };
  };
  // who would vote which way on a law (or its repeal), and why
  CC.voteDetail = function (spec, opts) {
    opts = opts || {};
    if (!demo()) return null;
    const L = opts.law || CC._laws.buildLaw({ ...spec, by: opts.by != null ? opts.by : PLAYER });
    if (!opts.law) L.id = -1;
    const proposer = opts.proposer !== undefined ? opts.proposer : leaderIsPlayer() ? PLAYER : null;
    const voters = lawVoters();
    if (!voters.length) return null;
    const lean = (s) => (s > 15 ? 'for' : s > 0 ? 'leaning for' : s > -15 ? 'leaning against' : 'against');
    const rows = voters.map((v) => {
      if (v.isPlayer) return { id: v.id, you: true, name: 'You', score: 0, lean: 'your vote', why: '' };
      const parts = voterParts(v, L, proposer, !!opts.repeal);
      const score = parts.reduce((n, p) => n + p.v, 0);
      const why = parts.filter((p) => Math.abs(p.v) >= 6 && Math.sign(p.v) === Math.sign(score)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 2).map((p) => p.t);
      const pa = partyOf(v);
      return { id: v.id, name: `${v.first} ${v.last}`, party: pa ? pa.name : null, color: pa ? pa.color : null, score, lean: lean(score), why: why.join('; ') };
    });
    const npc = rows.filter((r) => !r.you);
    const yes = npc.filter((r) => r.score > 0).length, no = npc.length - yes;
    if (S.gov.type === 'council') return { type: 'council', rows: rows.sort((a, b) => b.score - a.score), yes, no, total: voters.length, youVote: rows.some((r) => r.you) };
    const groups = {};
    for (const r of npc) { const k = r.party || 'No party'; const g = groups[k] || (groups[k] = { name: k, color: r.color, yes: 0, no: 0 }); if (r.score > 0) g.yes++; else g.no++; }
    return { type: 'assembly', groups: Object.values(groups).sort((a, b) => b.yes + b.no - (a.yes + a.no)), yes, no, total: voters.length, youVote: rows.some((r) => r.you) };
  };

  // decide a law: returns {passed, text}
  function decideLaw(L, proposerId, R) {
    const autocracy = !demo();
    const leaderProposes = proposerId === S.gov.leader;
    if (autocracy) {
      if (leaderProposes) { CC._laws.enact(L, R); return { passed: true, text: `Decreed “${L.name}”.` }; }
      return { passed: false, text: 'Only the ruler can make laws.' };
    }
    const voters = lawVoters();
    const res = vote(L, voters, proposerId, false, true);
    const where = S.gov.type === 'council' ? 'The council' : 'The assembly';
    if (res.passed) { CC._laws.enact(L, R); return { passed: true, text: `${where} passed “${L.name}”, ${res.yes} to ${res.no}.`, res }; }
    const t = `${where} voted down “${L.name}”, ${res.yes} to ${res.no}.`;
    log(t, 'law'); if (R) R.politics.push(t);
    return { passed: false, text: t, res };
  }
  function decideRepeal(L, proposerId, R) {
    if (!demo()) {
      if (proposerId === S.gov.leader) { CC._laws.repeal(L, R, proposerId); return { passed: true, text: `Repealed “${L.name}”.` }; }
      return { passed: false, text: 'Only the ruler can repeal laws.' };
    }
    const res = vote(L, lawVoters(), proposerId, true, true);
    const where = S.gov.type === 'council' ? 'The council' : 'The assembly';
    if (res.passed) { CC._laws.repeal(L, R, proposerId); return { passed: true, text: `${where} repealed “${L.name}”, ${res.yes} to ${res.no}.` }; }
    const t = `${where} kept “${L.name}”, ${res.no} to ${res.yes}.`;
    log(t, 'law'); if (R) R.politics.push(t);
    return { passed: false, text: t };
  }

  // ───────────────────────── leaders and elections ─────────────────────────
  function setLeader(id, how, R) {
    const old = S.gov.leader;
    if (old === id) return;
    S.gov.leader = id; S.gov.since = S.day;
    const L = P(id);
    for (const c of here()) {
      if (c.isPlayer) continue;
      if (id === PLAYER) { c.govt = c.opinion; continue; }
      let g = 0;
      if (L && c.party != null && c.party === L.party) g += 35;
      if (L && c.friends.includes(id)) g += 20;
      g -= (c.grudges[id] || 0) * 0.5;
      if (how === 'election') g += 10;
      if (how === 'coup') g += c.plot != null ? 40 : -20;
      if (how === 'coup' && has(c, 'Loyal')) g -= 10;
      c.govt = clamp(g, -100, 100);
    }
    if (how === 'election') S.legitimacy = clamp(Math.max(S.legitimacy, 55), 0, 100);
    if (how === 'coup') S.legitimacy = 22;
    if (how === 'succession') S.legitimacy = clamp(S.legitimacy * 0.85, 0, 100);
    const who = id === PLAYER ? 'You' : L ? `${L.first} ${L.last}` : 'Nobody';
    log(`${who} ${id === PLAYER ? 'became' : 'became'} leader (${how}).`, 'politics');
    if (R) R.headlines.push(id === PLAYER ? `You are now the leader of ${S.name}.` : `${who} is now the leader of ${S.name}.`);
  }
  CC.setLeader = setLeader;
  function lists() {
    const out = [];
    for (const p of S.parties.filter((x) => !x.dissolved && !x.outlawed)) {
      const mem = members(p).filter((c) => c.status === 'free' || c.isPlayer);
      if (!mem.length) continue;
      const lead = P(p.leader);
      const people = mem.slice().sort((a, b) => (b.id === p.leader) - (a.id === p.leader) || (has(b, 'Ambitious') - has(a, 'Ambitious')) || b.opinion - a.opinion);
      out.push({ key: 'p' + p.id, name: p.name, color: p.color, party: p, leader: lead, stance: p.stance, people });
    }
    const me = player();
    if (S.standing && me.party == null && me.status === 'free') out.push({ key: 'you', name: 'You (independent)', color: '#1b2126', party: null, leader: me, stance: S.platform, people: [me] });
    if (!out.length) {
      // no parties: the most ambitious citizens stand as independents
      const indies = npcFree().filter((c) => c.age >= 18).sort((a, b) => (has(b, 'Ambitious') * 30 + b.govt) - (has(a, 'Ambitious') * 30 + a.govt)).slice(0, 3);
      for (const c of indies) out.push({ key: 'i' + c.id, name: `${c.first} ${c.last} (independent)`, color: '#5b6670', party: null, leader: c, stance: stanceFromDesires(c), people: [c] });
    }
    return out;
  }
  function listScore(v, li, noise) {
    let s = CC.agreement(v, li.stance) * 40;
    if (li.party && v.party === li.party.id) s += 25;
    const lead = li.leader;
    if (lead) {
      if (lead.isPlayer) s += v.opinion * 0.35 + S.campaign * 2 + (v.bribed ? 30 : 0);
      else {
        s += (v.friends.includes(lead.id) ? 15 : 0) - (v.grudges[lead.id] || 0) * 0.3 - (lead.smeared || 0) * 0.8;
        if (S.gov.leader === lead.id) s += regimeOp(v) * 0.25 + (v.fear > 50 ? v.fear * 0.15 : 0);
      }
    }
    if (noise) s += rnd() * 10;
    return s;
  }
  function tally(noise) {
    const L = lists();
    const votes = Object.fromEntries(L.map((l) => [l.key, 0]));
    const voters = adultsHere().filter((c) => c.status === 'free' && c.novote <= 0);
    let cast = 0;
    for (const v of voters) {
      if (v.isPlayer) { const mine = L.find((l) => l.leader === v || (l.party && l.party.id === v.party)); if (mine) { votes[mine.key]++; cast++; } continue; }
      if (noise && chance(0.12)) continue;
      let best = null, bs = -Infinity;
      for (const li of L) { const sc = listScore(v, li, noise); if (sc > bs) { bs = sc; best = li; } }
      if (best) { votes[best.key]++; cast++; }
    }
    return { L, votes, cast, eligible: voters.length };
  }
  function dhondt(L, votes, seats) {
    const won = Object.fromEntries(L.map((l) => [l.key, 0]));
    for (let i = 0; i < seats; i++) {
      let best = null, bq = -1;
      for (const l of L) {
        const cap = l.people.filter((c) => c.status === 'free').length;
        if (won[l.key] >= cap) continue;
        const q = votes[l.key] / (won[l.key] + 1);
        if (q > bq) { bq = q; best = l; }
      }
      if (best) won[best.key]++;
    }
    return won;
  }
  function chooseChair(L, won, votes) {
    if (S.gov.type === 'assembly') return L.slice().sort((a, b) => votes[b.key] - votes[a.key])[0];
    const ranked = L.filter((l) => won[l.key] > 0).sort((a, b) => won[b.key] - won[a.key] || votes[b.key] - votes[a.key]);
    for (const top of ranked) {
      if (won[top.key] >= 3) return top;
      let seats = won[top.key];
      const partners = ranked.filter((l) => l !== top).map((l) => ({ l, a: top.party && l.party ? partyAgreement(top.party, l.party) : CC.agreement(l.leader, top.stance) })).sort((a, b) => b.a - a.a);
      for (const p of partners) { if (p.a < 0.05) break; seats += won[p.l.key]; if (seats >= 3) { top.coalition = p.l.name; return top; } }
    }
    return ranked[0];
  }
  CC.electionForecast = function () {
    const t = tally(false);
    const won = S.gov.type === 'council' ? dhondt(t.L, t.votes, 5) : {};
    return t.L.map((l) => ({ name: l.name, color: l.color, votes: t.votes[l.key], seats: won[l.key] || 0, leader: l.leader ? (l.leader.isPlayer ? 'You' : l.leader.first + ' ' + l.leader.last) : '', isYou: !!(l.leader && l.leader.isPlayer) })).sort((a, b) => b.votes - a.votes);
  };
  function runElection(R) {
    const t = tally(true);
    if (!t.L.length) { S.gov.nextElection = S.day + S.gov.term; return; }
    // rigging moves a fifth of the other votes to your list
    const mine = t.L.find((l) => l.leader && l.leader.isPlayer);
    if (S.rigged && mine) {
      let moved = 0;
      for (const l of t.L) if (l !== mine) { const m = Math.round(t.votes[l.key] * 0.22); t.votes[l.key] -= m; moved += m; }
      t.votes[mine.key] += moved;
    }
    const won = S.gov.type === 'council' ? dhondt(t.L, t.votes, 5) : {};
    const chairList = chooseChair(t.L, won, t.votes);
    const chair = chairList ? chairList.leader : null;
    const council = [];
    if (S.gov.type === 'council') for (const l of t.L) council.push(...l.people.filter((c) => c.status === 'free').slice(0, won[l.key]).map((c) => c.id));
    const results = t.L.map((l) => ({ name: l.name, color: l.color, votes: t.votes[l.key], seats: won[l.key] || 0, leader: l.leader ? (l.leader.isPlayer ? 'You' : `${l.leader.first} ${l.leader.last}`) : '' })).sort((a, b) => b.votes - a.votes);
    S.lastElection = { day: S.day, type: S.gov.type, results, cast: t.cast, eligible: t.eligible, chair: chair ? chair.id : null, coalition: chairList && chairList.coalition, rigged: !!S.rigged };
    R.election = S.lastElection;
    const summary = results.map((r) => `${r.name} ${r.votes}${S.gov.type === 'council' ? ` (${r.seats} seat${r.seats === 1 ? '' : 's'})` : ''}`).join(', ');
    R.headlines.push(`Election results: ${summary}.`);
    log(`Election: ${summary}.`, 'election');
    if (S.rigged && chance(0.35)) secret('rigged the election', 30);
    S.rigged = false; S.campaign = 0;
    for (const c of here()) c.smeared = 0;
    if (!chair) return;
    if (leaderIsPlayer() && chair.id !== PLAYER) {
      CC.queueEvent('lost', { chair: chair.id, council, summary, coalition: chairList.coalition || null });
      R.headlines.push(`You lost. ${chair.first} ${chair.last} has the votes to lead${chairList.coalition ? ` in coalition with ${chairList.coalition}` : ''}.`);
      return;
    }
    S.gov.council = council;
    S.gov.nextElection = S.day + S.gov.term;
    if (chair.id !== S.gov.leader) setLeader(chair.id, 'election', R);
    else { R.headlines.push(chair.isPlayer ? 'You were re-elected.' : `${chair.first} ${chair.last} was re-elected.`); S.legitimacy = clamp(S.legitimacy + 8, 0, 100); }
  }
  CC.runElection = runElection;

  // ───────────────────────── security, plots and coups ─────────────────────────
  function security() {
    let s = 0;
    for (const c of free()) {
      if (c.age < 16 || c.plot != null) continue;
      if (c.isPlayer) { if (leaderIsPlayer()) s += 1 + (owned().guards ? 2 : 0); continue; }
      const op = regimeOp(c);
      if (op < -20) continue;
      const loyal = op > 20;
      s += (c.trade === 'warden' ? (loyal ? 3 : 1.5) : loyal ? 0.5 : 0.15) * (c.armed ? 1.3 : 1);
    }
    s += S.legitimacy / 20;
    if (S.inst.police) s += 8;
    if (S.buildings.wall) s += 2;
    s += CC.avgFear() / 15;
    return s;
  }
  function plotStrength(pl) {
    let s = 0;
    for (const id of pl.members) {
      const c = P(id);
      if (!c || c.status !== 'free') continue;
      if (c.isPlayer) { s += 1.5 + Math.max(0, CC.standing() - 50) / 20 + (owned().guards ? 2 : 0); continue; }
      s += (c.trade === 'warden' ? 3 : 1) * (c.armed ? 1.4 : 1) * (has(c, 'Hot-headed') ? 1.2 : 1);
    }
    return s;
  }
  CC.coupOdds = function () { const pl = S.plots.find((p) => p.id === S.playerPlot); return { strength: pl ? plotStrength(pl) : 0, security: security(), members: pl ? pl.members.filter((id) => P(id) && P(id).status === 'free').length : 0 }; };
  function plotById(id) { return S.plots.find((p) => p.id === id); }
  function disband(pl) { for (const id of pl.members) { const c = P(id); if (c && c.plot === pl.id) c.plot = null; } S.plots = S.plots.filter((x) => x !== pl); if (S.playerPlot === pl.id) S.playerPlot = null; }
  CC.exposePlot = function (id, R, how) {
    const pl = plotById(id);
    if (!pl) return;
    if (leaderIsPlayer()) { if (!pl.known) { pl.known = true; CC.queueEvent('plot', { plot: pl.id, how }); } return; }
    regimeCrush(pl, R, how);
  };
  function regimeCrush(pl, R, how) {
    const lead = P(S.gov.leader);
    const harsh = lead && (has(lead, 'Paranoid') || has(lead, 'Hot-headed') || S.gov.type === 'dictatorship');
    const names = pl.members.map(P).filter((c) => c && alive(c));
    const who = list(names.map((c) => (c.isPlayer ? 'you' : c.first)));
    R.headlines.push(`A plot against ${lead ? lead.first : 'the government'} was uncovered${how ? ' ' + how : ''}. ${who.charAt(0).toUpperCase() + who.slice(1)} ${names.length > 1 || (names[0] && names[0].isPlayer) ? 'were' : 'was'} arrested.`);
    log(`A plot was uncovered: ${list(names.map((c) => (c.isPlayer ? 'you' : c.first + ' ' + c.last)))}.`, 'politics');
    disband(pl);
    for (const c of names) {
      const isOrg = c.id === pl.org;
      const pun = harsh ? (isOrg ? (S.gov.type === 'dictatorship' ? 'execution' : 'exile') : (chance(0.5) ? 'exile' : 'longdet')) : 'longdet';
      CC.applyPunishment(c, pun, { why: 'for plotting against the government', how: 'arrested', setting: 'public', method: 'firing', R });
      if (!harsh && !c.isPlayer && c.status === 'detained') c.novote = YEAR;
    }
  }
  function plotTick(R) {
    const leaderId = S.gov.leader;
    // form
    for (const c of npcFree()) {
      if (c.age < 18 || c.plot != null || c.id === leaderId) continue;
      if (regimeOp(c) > -55) continue;
      if (!(has(c, 'Rebellious') || has(c, 'Ambitious') || has(c, 'Hot-headed') || has(c, 'Idealist') || c.grudge_regime)) continue;
      if (!chance(0.03)) continue;
      const kind = leaderIsPlayer() && has(c, 'Hot-headed') && c.opinion < -75 && chance(0.35) ? 'kill' : 'coup';
      const pl = { id: S.nextPlotId++, org: c.id, members: [c.id], target: leaderId, kind, day: S.day, known: false, leaks: 0 };
      S.plots.push(pl); c.plot = pl.id;
    }
    for (const pl of S.plots.slice()) {
      const org = P(pl.org);
      if (!org || !alive(org)) { disband(pl); continue; }
      if (pl.target !== S.gov.leader) {
        if (pl.org === PLAYER || regimeOp(org) < -30) pl.target = S.gov.leader; else { disband(pl); continue; }
      }
      if (pl.org === PLAYER) continue;
      // recruit
      for (const id of pl.members.slice()) {
        const m = P(id);
        if (!m || m.status !== 'free') continue;
        for (const f of m.friends.map(P)) {
          if (!f || f.status !== 'free' || f.plot != null || f.age < 16 || f.isPlayer || f.id === S.gov.leader) continue;
          if (regimeOp(f) < -30 && chance(0.25)) { f.plot = pl.id; pl.members.push(f.id); }
          else if (regimeOp(f) > 20 && chance(0.06)) pl.leaks++;
        }
      }
      // invite the player
      const me = player();
      if (!leaderIsPlayer() && me.status === 'free' && me.plot == null && !pl.invited && org.opinion > 30 && (S.pdid.includes('criticise') || me.friends.includes(org.id)) && chance(0.2)) {
        pl.invited = true; CC.queueEvent('invite', { plot: pl.id });
      }
    }
    // detect and launch
    const informants = S.laws.some((L) => L.enf === 'informants' && CC.active(L));
    for (const pl of S.plots.slice()) {
      const n = pl.members.filter((id) => P(id) && P(id).status === 'free').length;
      if (!n) { disband(pl); continue; }
      let det = 0.008 * n + (S.inst.police ? 0.08 : 0) + (informants ? 0.04 : 0) + pl.leaks * 0.08;
      if (pl.org === PLAYER) det += S.exposure / 400;
      if (!pl.known && chance(det)) { CC.exposePlot(pl.id, R, ''); continue; }
      if (pl.org === PLAYER) continue;
      const st = plotStrength(pl), sec = security();
      if (n >= 3 && st >= sec * 0.85 && chance(0.25)) launchCoup(pl, R);
      else if (pl.kind === 'kill' && n >= 2 && chance(0.08)) launchCoup(pl, R);
    }
  }
  function launchCoup(pl, R) {
    const st = plotStrength(pl), sec = security();
    const org = P(pl.org);
    if (pl.kind === 'kill' && leaderIsPlayer()) {
      const p = clamp(0.35 - sec * 0.012, 0.05, 0.5);
      if (chance(p * (owned().guards ? 0.3 : 1))) { CC.gameOver('assassinated', `${org.first} ${org.last} and their friends got to you in the night. The commune will have to go on without you.`); return; }
      R.headlines.push(`Someone tried to kill you last night. ${owned().guards ? 'Your bodyguards' : 'Your people'} stopped them: ${list(pl.members.map(P).filter(Boolean).map((c) => c.first))}.`);
      log('An attempt on your life failed.', 'politics');
      pl.known = true; CC.queueEvent('plot', { plot: pl.id, how: 'after a failed attempt on your life' });
      return;
    }
    const success = st * (0.5 + rnd()) > sec * (0.5 + rnd());
    const oldId = S.gov.leader, old = P(oldId);
    if (!success) {
      R.headlines.push(`A coup failed overnight. ${org.isPlayer ? 'Your' : org.first + "'s"} plotters were outnumbered by those loyal to ${old && old.isPlayer ? 'you' : old ? old.first : 'the government'}.`);
      if (leaderIsPlayer()) { pl.known = true; CC.queueEvent('plot', { plot: pl.id, how: 'after their coup failed' }); }
      else regimeCrush(pl, R, 'after their coup failed');
      return;
    }
    const names = pl.members.map(P).filter((c) => c && c.status === 'free');
    disband(pl);
    S.gov.type = 'dictatorship'; S.gov.council = []; S.gov.nextElection = null;
    log(`Coup: ${org.isPlayer ? 'you' : org.first + ' ' + org.last} seized power.`, 'politics');
    if (org.isPlayer) {
      R.headlines.push(`Your coup succeeded. ${old ? old.first + ' ' + old.last + ' was' : 'The old government was'} driven out, and the commune is yours.`);
      setLeader(PLAYER, 'coup', R);
      if (old && !old.isPlayer) { old.status = 'exiled'; old.history.push(`Exiled after a coup on day ${S.day}`); CC._life.departFamily(old, R); }
      S.attention = clamp(S.attention + 5, 0, 100);
      return;
    }
    R.headlines.push(`Coup. Overnight, ${org.first} ${org.last} and ${names.length - 1} others seized the yard. ${org.first} now rules alone.`);
    setLeader(org.id, 'coup', R);
    if (old && old.isPlayer) {
      const harsh = has(org, 'Hot-headed') || has(org, 'Paranoid') || org.motive === 'self';
      if (harsh && chance(0.45)) { CC.gameOver('executed', `${org.first}'s people took you from your bed. You were executed in the yard at dawn.`); return; }
      if (harsh) { CC.gameOver('exiled', `${org.first} had you marched out of the gate at first light. You were exiled from the commune you led.`); return; }
      CC.applyPunishment(old, 'longdet', { why: 'after the coup', how: 'locked up', R });
      R.headlines.push('You are a prisoner now. When you get out, you will be just another citizen.');
    } else if (old) { old.status = 'exiled'; old.history.push(`Exiled after a coup on day ${S.day}`); CC._life.departFamily(old, R); }
    S.attention = clamp(S.attention + 5, 0, 100);
  }

  // ───────────────────────── protests, AI leaders, succession ─────────────────────────
  function protestTick(R) {
    const ps = (S._protesters || []).slice();
    if (S.pdid.includes('protest') && player().status === 'free') ps.push(player());
    if (!ps.length) return;
    const adults = adultsHere().length;
    const big = ps.length >= Math.max(3, adults * 0.2);
    const worst = S.laws.map((L) => ({ L, p: CC.lawPopularity(L) })).sort((a, b) => a.p.pct - b.p.pct)[0];
    const target = worst && worst.p.pct < 40 ? `“${worst.L.name}”` : 'the government';
    if (!big) { R.politics.push(`${list(ps.map((c) => (c.isPlayer ? 'you' : c.first)))} protested against ${target}.`); return; }
    R.headlines.push(`${ps.length} people protested in the yard against ${target}${ps.some((c) => c.isPlayer) ? ', and you were among them' : ''}.`);
    log(`${ps.length} people protested against ${target}.`, 'politics');
    if (leaderIsPlayer()) { CC.queueEvent('protest', { count: ps.length, law: worst && worst.p.pct < 40 ? worst.L.id : null, ids: ps.map((c) => c.id) }); return; }
    const lead = P(S.gov.leader);
    const harsh = lead && (has(lead, 'Paranoid') || has(lead, 'Hot-headed') || S.gov.type === 'dictatorship');
    if (harsh && CC.wardenCount() >= 1) {
      const hit = shuffle(ps.slice()).slice(0, 3);
      R.headlines.push(`${lead.first}'s wardens broke up the protest and arrested ${list(hit.map((c) => (c.isPlayer ? 'you' : c.first)))}.`);
      for (const c of hit) CC.applyPunishment(c, 'detention', { why: 'for protesting', how: 'arrested', R });
      for (const c of ps) if (!c.isPlayer) blame(c, -8);
      S.attention = clamp(S.attention + 2, 0, 100);
    } else if (worst && worst.p.pct < 35 && chance(0.6)) {
      R.headlines.push(`${lead ? lead.first : 'The government'} gave way to the protesters.`);
      decideRepeal(worst.L, S.gov.leader, R);
    }
  }
  const TOPIC_NEG = { retire: 'Working Life', transition: 'Birth Sex', teach_religion: 'Secular Schools', teach_relations: 'Innocence', teach_gender: 'Parental Rights', teach_politics: 'Neutral Classroom', teach_loyalty: 'Free Minds', teach_outside: 'Inward Schools', teach_trades: 'Academic Schools', teach_history: 'Fresh Start', samesex: 'Natural Family', naked: 'Public Decency', polygamy: 'One Partner', divorce: 'Sacred Bond', partner: 'Single Life', child: 'Family Limits', leave: 'Stay Put', organise: 'Party Ban', worship: 'Secular Yard' };
  const TOPIC_POS = { retire: 'Pension', transition: 'Gender Recognition', teach_religion: 'Faith Schools', teach_relations: 'Relationships Education', teach_gender: 'Inclusive Schools', teach_politics: 'Civic Education', teach_loyalty: 'Loyal Youth', teach_outside: 'Wider World', teach_trades: 'Skilled Hands', teach_history: 'Our Story', samesex: 'Love Is Love', naked: 'Free Body', polygamy: 'Open Hearts', divorce: 'Free to Leave', partner: 'Partnership', child: 'Growing Family', worship: 'Faith', criticise: 'Free Speech', protest: 'Right to Protest', outside: 'Open Door' };
  const TOPIC = { naked: 'Clothing', samesex: 'Partnership', polygamy: 'Marriage', divorce: 'Divorce', music: 'Quiet Hours', drink: 'Sober Yard', gamble: 'Fair Play', criticise: 'Respect', steal: 'Property', hoard: 'Water Discipline', share: 'Kettle', work: 'Busy Hands', worship: 'Faith', protest: 'Public Order', organise: 'Party', weapon: 'Disarmament', uniform: 'Uniform', address: 'Attendance', volunteer: 'Care', outside: 'Gate Silence', report: 'Vigilance', gather: 'Assembly', trade: 'Market', study: 'Schooling', partner: 'Partnership', child: 'Family' };
  function aiLawName(b, rule) {
    const kind = rule === 'subsidise' || rule === 'reward' ? pick(['Act', 'Charter', 'Scheme']) : pick(['Act', 'Order', 'Edict', 'Rule', 'Decree']);
    const topic = (RULES[rule].dir < 0 ? TOPIC_NEG[b] : TOPIC_POS[b]) || TOPIC[b] || BEH[b].short;
    return CC.uniqueLawName(`The ${topic} ${kind}`);
  }
  CC.aiLawName = aiLawName;
  // a sensible name for a law, without touching the game's dice
  CC.suggestLawName = function (b, rule) {
    const kind = { ban: 'Ban', require: 'Act', ration: 'Rule', license: 'Permit Act', tax: 'Levy', subsidise: b === 'retire' ? 'Scheme' : 'Grant', reward: 'Charter', discourage: 'Guidance' }[rule] || 'Act';
    const title = (t) => t.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bIn\b/g, 'in').replace(/\bThe\b/g, 'the').replace(/\bTo\b/g, 'to');
    const topic = RULES[rule] && RULES[rule].dir > 0 && TOPIC_POS[b] ? TOPIC_POS[b] : title(CC.NOUN[b] || BEH[b].short).replace(/^the /, '');
    return CC.uniqueLawName(`The ${topic} ${kind}`);
  };
  function aiGovern(R) {
    const lead = P(S.gov.leader);
    if (!lead || lead.isPlayer || lead.status !== 'free') return;
    const harsh = has(lead, 'Paranoid') || has(lead, 'Hot-headed') || (lead.motive === 'self' && has(lead, 'Ambitious'));
    const party = partyOf(lead);
    const stance = party ? party.stance : stanceFromDesires(lead);
    // economy and buildings
    if (S.treasury < 10 && S.gov.tax < 0.3) { S.gov.tax = Math.round((S.gov.tax + 0.05) * 100) / 100; R.politics.push(`${lead.first} raised the work tax to ${Math.round(S.gov.tax * 100)}%.`); }
    if (S.treasury > 120 && S.gov.tax > 0.05 && !harsh) { S.gov.tax = Math.round((S.gov.tax - 0.05) * 100) / 100; R.politics.push(`${lead.first} cut the work tax to ${Math.round(S.gov.tax * 100)}%.`); }
    aiBuild(lead, harsh, R);
    if (S.day % 3 !== 0) return;
    // repeal what people hate (unless it's theirs and they're harsh)
    const hated = S.laws.map((L) => ({ L, p: CC.lawPopularity(L) })).filter((x) => x.p.pct < 25).sort((a, b) => a.p.pct - b.p.pct)[0];
    if (hated && (!harsh || chance(0.3)) && (stance[hated.L.beh] || 0) * RULES[hated.L.rule].dir < 0.4) { decideRepeal(hated.L, lead.id, R); return; }
    // a new law from the platform
    const covered = new Set(S.laws.map((L) => L.beh));
    const options = Object.entries(stance).filter(([b, v]) => Math.abs(v) >= 0.45 && !covered.has(b) && b !== 'address').sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!options.length || !chance(0.5)) return;
    const [b, v] = options[0];
    const spec = { who: 'everyone', beh: b, by: lead.id, amount: 2 };
    if (v < 0) {
      spec.rule = harsh || v < -0.8 ? 'ban' : pick(['ban', 'tax', 'ration']);
      spec.enf = harsh ? (S.inst.police ? 'police' : CC.wardenCount() ? 'wardens' : 'watch') : CC.wardenCount() ? pick(['wardens', 'watch']) : 'watch';
      spec.pun = harsh ? (S.gov.type === 'dictatorship' ? pick(['longdet', 'flogging', 'exile']) : pick(['detention', 'bigfine'])) : pick(['fine', 'warning', 'service']);
      if (spec.rule === 'tax') spec.amount = 3;
      if (b === 'organise' && S.gov.type === 'dictatorship' && party) spec.who = 'notofficials';
    } else {
      spec.rule = harsh && ['work', 'uniform', 'worship', 'study'].includes(b) ? 'require' : S.treasury > 40 ? 'subsidise' : 'reward';
      spec.enf = CC.wardenCount() ? 'wardens' : 'watch'; spec.pun = harsh ? 'service' : 'warning';
    }
    spec.name = aiLawName(b, spec.rule);
    const L = CC._laws.buildLaw(spec);
    const res = decideLaw(L, lead.id, R);
    if (!demo() && res.passed) R.politics.push(`${lead.first} decreed “${L.name}”.`);
    // harsh rulers outlaw rival parties
    if (harsh && !demo() && chance(0.05)) {
      const rival = S.parties.filter((p) => !p.dissolved && !p.outlawed && (!party || p.id !== party.id)).sort((a, b) => members(b).length - members(a).length)[0];
      if (rival && members(rival).length >= 2) {
        const L2 = CC._laws.buildLaw({ name: CC.uniqueLawName(`The ${rival.name.replace(/^The /, '')} Ban`), who: 'party:' + rival.id, rule: 'ban', beh: 'organise', enf: S.inst.police ? 'police' : 'wardens', pun: pick(['detention', 'longdet', 'exile']), outlaws: rival.id, by: lead.id });
        decideLaw(L2, lead.id, R);
        return;
      }
    }
    // the slide to dictatorship
    if (demo() && harsh && has(lead, 'Ambitious') && S.legitimacy < 35 && security() > 10 && chance(0.08)) {
      S.gov.type = 'dictatorship'; S.gov.council = []; S.gov.nextElection = null; S.legitimacy = clamp(S.legitimacy - 20, 0, 100);
      R.headlines.push(`${lead.first} ${lead.last} declared emergency rule. The council is dissolved and elections are suspended.`);
      log(`${lead.first} ${lead.last} declared emergency rule.`, 'politics');
      for (const c of here()) if (!c.isPlayer && has(c, 'Idealist')) { c.govt -= 30; c.grudge_regime = true; }
    }
  }
  function aiBuild(lead, harsh, R) {
    const pop = here().length;
    for (let i = 0; i < 3 && S.food < pop * 2 && S.treasury >= 8 * price(); i++) { S.treasury -= 8 * price(); S.food += 10; if (i === 0) R.politics.push(`${lead.first} bought food from outside.`); }
    for (let i = 0; i < 3 && S.water < pop * 1.5 && S.treasury >= 5 * price(); i++) { S.treasury -= 5 * price(); S.water += 10; if (i === 0) R.politics.push(`${lead.first} bought water from outside.`); }
    if (S.treasury < 0) { const sub = S.laws.find((L) => L.rule === 'subsidise'); if (sub) { decideRepeal(sub, lead.id, R); return; } }
    const want = [];
    if (CC.crowding() > 1.05) want.push('home');
    if (S.food < here().length * 2) want.push('garden');
    if (S.water < here().length * 2) want.push('tank');
    if (!S.buildings.clinic && here().length > 20) want.push('clinic');
    if (harsh && !S.buildings.lockup) want.push('lockup');
    for (const k of want) {
      const B = CC.BUILDINGS[k];
      if (S.containers >= B.size && S.materials >= B.mat) { S.containers -= B.size; S.materials -= B.mat; S.buildings[k] = (S.buildings[k] || 0) + 1; R.politics.push(`${lead.first} had a ${B.label.toLowerCase()} fitted out.`); return; }
      if (S.containers < B.size && S.treasury > 40 + 20 * B.size) { const n = B.size; S.treasury -= 20 * n * price(); S.containers += n; R.politics.push(`${lead.first} bought ${n} container${n > 1 ? 's' : ''}.`); return; }
    }
    if (harsh && S.gov.type === 'dictatorship' && !S.inst.police && S.treasury > 80) { S.inst.police = true; S.treasury -= CC.INSTITUTIONS.police.cost; R.headlines.push(`${lead.first} set up a secret police.`); log(`${lead.first} ${lead.last} set up a secret police.`, 'politics'); }
    if (S.gov.gate !== 'closed' && harsh && CC.crowding() > 1.3) { S.gov.gate = 'closed'; R.politics.push(`${lead.first} closed the gate to newcomers.`); }
    else if (S.gov.gate === 'closed' && !harsh && CC.crowding() < 0.9) { S.gov.gate = 'vetted'; R.politics.push(`${lead.first} reopened the gate to vetted newcomers.`); }
  }
  function succession(R) {
    const lead = P(S.gov.leader);
    if (lead && alive(lead)) return;
    if (lead && lead.isPlayer) return;
    let next = null;
    if (demo()) {
      const ranked = S.parties.filter((p) => !p.dissolved).map((p) => ({ p, n: members(p).length })).sort((a, b) => b.n - a.n);
      for (const r of ranked) { const l = P(r.p.leader); if (l && l.status === 'free') { next = l; break; } }
      S.gov.nextElection = Math.min(S.gov.nextElection || S.day + 3, S.day + 3);
    }
    if (!next) next = npcFree().filter((c) => c.age >= 18).sort((a, b) => (CC.isOfficial(b) * 20 + has(b, 'Ambitious') * 15 + b.govt) - (CC.isOfficial(a) * 20 + has(a, 'Ambitious') * 15 + a.govt))[0];
    if (!next) return;
    R.headlines.push(`With ${lead ? lead.first + ' gone' : 'no leader'}, ${next.isPlayer ? 'you take' : next.first + ' ' + next.last + ' takes'} charge${demo() ? ' until the snap election' : ''}.`);
    setLeader(next.id, 'succession', R);
  }

  // ───────────────────────── scandals and the outside world ─────────────────────────
  function scandalTick(R) {
    if (S.exposure <= 25) return;
    const talkers = (S._talkers || []).length, gossips = here().filter((c) => has(c, 'Gossip')).length;
    if (!chance(((S.exposure - 25) / 250) * (1 + talkers * 0.15 + gossips * 0.04))) return;
    const items = S.secrets.slice(-3).map((s) => s.text);
    R.headlines.push(`Scandal: it has come out that you ${list(items.length ? items : ['abused your position'])}.`);
    log(`Scandal: you ${list(items)}.`, 'scandal');
    for (const c of here()) if (!c.isPlayer) c.opinion = clamp(c.opinion - (has(c, 'Loyal') ? 8 : 20), -100, 100);
    S.attention = clamp(S.attention + 6, 0, 100);
    S.exposure = 5; S.secrets = [];
    if (!leaderIsPlayer()) return;
    for (const c of here()) if (!c.isPlayer) c.govt = c.opinion;
    S.legitimacy = clamp(S.legitimacy - 25, 0, 100);
    if (demo()) {
      const voters = lawVoters().filter((c) => !c.isPlayer);
      const yes = voters.filter((c) => -c.opinion * 0.6 + 15 + (has(c, 'Idealist') ? 15 : 0) - (c.fear > 50 ? 20 : 0) > 0).length;
      R.headlines.push(`A vote of no confidence: ${yes} for, ${voters.length - yes} against.`);
      if (yes > voters.length / 2) {
        const others = lists().filter((l) => l.leader && !l.leader.isPlayer && l.leader.status === 'free');
        const next = others.sort((a, b) => b.people.length - a.people.length)[0];
        if (next) { setLeader(next.leader.id, 'succession', R); R.headlines.push('You have been removed from office.'); S.gov.nextElection = S.day + 6; }
      }
    } else for (const c of here()) if (!c.isPlayer && chance(0.3)) c.grudge_regime = true;
  }
  function price() { return S.sanctions ? 1.6 : 1; }
  CC.price = price;
  function attentionTick(R) {
    if (S.attention >= 50 && S.day - (S.flags.journalists || -99) > 30) { S.flags.journalists = S.day; if (leaderIsPlayer()) CC.queueEvent('journalists', {}); else R.politics.push('Journalists came to the gate. The government sent them away.'); }
    if (S.attention >= 75 && !S.sanctions) { S.sanctions = true; R.headlines.push('The outside world has placed sanctions on the commune. Everything you buy costs more.'); log('Sanctions were imposed.', 'world'); }
    if (S.attention < 55 && S.sanctions) { S.sanctions = false; R.headlines.push('Sanctions have been lifted.'); }
    if (S.attention >= 95 && (S.gov.type === 'dictatorship' || S.stats.executions >= 3) && chance(0.15)) {
      CC.gameOver('absorbed', 'The outside world had seen enough. At dawn the police came through the gate, and the land was taken back. Container Commune is over.');
    }
  }

  // ───────────────────────── the night's politics ─────────────────────────
  CC.politics = function (R) {
    partyTick(R);
    protestTick(R);
    if (S.over) return;
    succession(R);
    aiGovern(R);
    plotTick(R);
    if (S.over) return;
    if (demo() && S.gov.nextElection != null && S.day >= S.gov.nextElection) runElection(R);
    scandalTick(R);
    attentionTick(R);
    if (S.over) return;
    // harsh dictators pick up critics, with or without a law
    const lead = P(S.gov.leader);
    if (lead && !lead.isPlayer && S.gov.type === 'dictatorship' && (has(lead, 'Paranoid') || has(lead, 'Hot-headed'))) {
      const critics = free().filter((c) => c.today.includes('criticise') || c.today.includes('protest'));
      for (const c of critics) if (chance(c.isPlayer ? (owned().guards ? 0.12 : 0.3) : 0.15)) CC.applyPunishment(c, 'detention', { why: 'for questioning', how: 'taken by the wardens', R });
    }
  };


  // ───────────────────────── proposals: citizens bring laws to you ─────────────────────────
  const SOCIAL = ['samesex', 'naked', 'polygamy', 'divorce', 'transition', 'retire', ...CC.SUBJECTS];
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const SAY = {
    samesex: { neg: ["It isn't natural, and it isn't how I was raised.", 'Children need a mother and a father. The law should say so.', "I don't want it in my yard."],
      pos: ["Who someone loves is nobody's business but theirs.", 'Love is love. The law should say so out loud.', 'We left the old country to stop being told who to love.'],
      req: ['Why should anyone settle for the old ways? Everyone should try it.', "This yard should be the boldest place on earth."] },
    naked: { neg: ['There are children in this yard. Put some clothes on.', "I don't want to see that over breakfast.", 'Some of us still have standards.'],
      pos: ['Clothes are just another uniform.', 'We came here to be free. All the way free.', "Bodies are bodies. Nobody here should be ashamed of theirs."],
      req: ['Nobody hides anything here. Not even under a shirt.', 'Clothes are a cage. Take them off, all of you.'] },
    polygamy: { neg: ["One partner each. That's how a family works.", "It's greed, that's all it is.", 'It breaks hearts and it breaks homes.'],
      pos: ['Why should love be rationed like water?', 'Some of us have more than one person in our hearts.', "It's working for us. Leave us alone."],
      req: ['One partner each is a waste of love.', 'Bigger households, stronger yard. Everyone should share.'] },
    divorce: { neg: ['A promise is a promise.', 'Nobody walks out on a family in this yard.', 'Make it hard, and people will try harder.'],
      pos: ["Nobody should be trapped with someone they've stopped loving.", 'People change. The law should let them.'],
      req: ['Every partnership should be renewed or ended. No one stays by habit.'] },
  };
  Object.assign(SAY, {
    transition: { neg: ['You are what you were born. The law should say so.', "I don't understand it, and I don't want it in my yard.", 'Let people be, but not in the paperwork.'],
      pos: ['People know who they are better than any rule does.', 'Nobody should have to hide who they are here.', 'If someone tells you who they are, believe them.'],
      req: ['Everyone should question what they were told about themselves.'] },
    retire: { neg: ['Every pair of hands is needed. Nobody stops working while they can still stand.', "A commune can't carry people who've stopped pulling their weight."],
      pos: ["They built this place. They've earned a rest.", 'Pay people a decent pension and let the young ones take over.'],
      req: ['Make way for the young. Past a certain age, step back.', 'Old hands slow the work down. Retire them.'] },
  });
  function sayFor(b, rule) {
    const B = BEH[b], noun = CC.NOUN[b] || B.label;
    if (B.kind === 'subject') {
      const subj = B.short.toLowerCase();
      if (rule === 'require') return pick([`Every child should learn ${subj}. Make it compulsory.`, `If schools won't teach ${subj}, make them.`]);
      if (rule === 'reward') return pick([`Our children need more ${subj}.`, `Schools should be doing more ${subj}.`]);
      if (rule === 'ban') return pick([`Schools have no business teaching ${subj}.`, `Keep ${subj} out of our classrooms.`, `That's for parents to teach, not schools.`]);
      return pick([`Less ${subj} in schools, please.`, `There's too much ${subj} in lessons already.`]);
    }
    const set = SAY[b];
    const dir = RULES[rule].dir;
    if (set) return pick(rule === 'require' && set.req ? set.req : dir < 0 ? set.neg : set.pos);
    if (rule === 'require') return pick([`Everyone should ${B.label}. No exceptions.`, `If people won't ${B.label} on their own, make them.`]);
    if (dir < 0) return pick([`People ${B.label} and the rest of us pay for it.`, `Enough. It's time someone put a stop to ${noun}.`, `I'm sick of ${noun}. Everyone is.`]);
    return pick([`If we want more people to ${B.label}, we should make it worth their while.`, `${cap(noun)} is good for all of us.`, `Reward the people who ${B.label}. Simple.`]);
  }
  const PUN_BY_SEV = Object.keys(PUN).sort((a, b) => PUN[a].sev - PUN[b].sev);
  function proposalFrom(c) {
    const d = CC.desires(c);
    const cands = [];
    for (const b of CC.POLICY_BEH) {
      if (b === 'address') continue;
      const v = d[b] || 0;
      if (Math.abs(v) < 0.35) continue;
      if (S.laws.some((L) => L.beh === b && Math.sign(RULES[L.rule].dir) === Math.sign(v))) continue;
      cands.push({ b, v, w: Math.abs(v) * (SOCIAL.includes(b) ? 2.5 : 1) });
    }
    if (!cands.length) return null;
    let r = rnd() * cands.reduce((n, x) => n + x.w, 0), pickd = cands[0];
    for (const x of cands) { r -= x.w; if (r <= 0) { pickd = x; break; } }
    const { b, v } = pickd;
    const harsh = has(c, 'Paranoid') || has(c, 'Hot-headed') || (has(c, 'Devout') && v < 0) || (has(c, 'Loyal') && S.gov.type === 'dictatorship');
    const rules = CC.rulesFor(b);
    let rule;
    if (v < 0) rule = Math.abs(v) > 0.6 || harsh ? 'ban' : pick(['tax', 'ration', 'license', 'ban'].filter((x) => rules.includes(x)));
    else rule = (Math.abs(v) > 0.75 && chance(SOCIAL.includes(b) ? 0.3 : harsh ? 0.35 : 0.1) && b !== 'leave') ? 'require' : S.treasury > 40 && chance(0.5) ? 'subsidise' : 'reward';
    if (BEH[b].kind === 'subject') rule = v < 0 ? (Math.abs(v) > 0.6 || harsh ? 'ban' : 'discourage') : Math.abs(v) > 0.6 ? 'require' : 'reward';
    if (!rules.includes(rule)) rule = rules.includes('ban') && v < 0 ? 'ban' : 'reward';
    // who it is for
    let who = BEH[b].minAge >= 16 ? 'adults' : 'everyone';
    if (b === 'retire') who = pick(['elders', 'over60', 'everyone']);
    if (BEH[b].kind === 'subject') who = 'schools';
    else if (chance(0.3)) {
      if (['naked', 'uniform', 'drink', 'outside', 'weapon', 'gamble', 'work', 'worship'].includes(b)) who = pick(['men', 'women']);
      else if (['trade', 'outside', 'organise'].includes(b)) who = 'newcomers';
      else if (b === 'study' && v > 0) who = 'children';
      else if (b === 'weapon' && v < 0) who = 'notofficials';
      else if (b === 'organise' && v < 0 && c.party != null) { const opp = S.parties.find((p) => !p.dissolved && p.id !== c.party); if (opp) who = 'party:' + opp.id; }
    }
    const spec = { name: aiLawName(b, rule), who, rule, beh: b, amount: Math.abs(v) > 0.7 ? 5 : pick([2, 3]), proposedBy: c.id, enf: 'watch', pun: 'fine', method: pick(['firing', 'hanging', 'injection']), setting: has(c, 'Hot-headed') ? 'public' : 'private' };
    if (RULES[rule].violation) {
      spec.enf = harsh ? (S.inst.police ? 'police' : CC.wardenCount() ? 'wardens' : 'watch') : c.motive === 'others' && chance(0.3) ? 'honour' : CC.wardenCount() && chance(0.5) ? 'wardens' : 'watch';
      const extreme = harsh && Math.abs(v) > 0.85 && ((has(c, 'Devout') && has(c, 'Paranoid')) || (has(c, 'Hot-headed') && has(c, 'Paranoid')) || (has(c, 'Devout') && has(c, 'Hot-headed'))) && chance(0.4);
      spec.pun = extreme ? pick(['execution', 'torture', 'flogging']) : harsh ? (chance(0.5) ? pick(['longdet', 'flogging', 'exile']) : pick(['bigfine', 'shaming', 'detention'])) : chance(0.6) ? pick(['warning', 'fine', 'service']) : pick(['bigfine', 'shaming', 'novote', 'detention']);
    }
    return spec;
  }
  function softer(spec) {
    const s2 = { ...spec, name: CC.uniqueLawName(spec.name.replace(/^The /, 'The Lesser ')) };
    if (BEH[spec.beh].kind === 'subject') { if (spec.rule === 'require') { s2.rule = 'reward'; return s2; } if (spec.rule === 'ban') { s2.rule = 'discourage'; return s2; } return null; }
    if (RULES[spec.rule].violation) {
      const i = PUN_BY_SEV.indexOf(spec.pun);
      if (i <= 1) { if (spec.rule === 'require') { s2.rule = 'reward'; } else if (CC.rulesFor(spec.beh).includes('tax')) { s2.rule = 'tax'; s2.amount = 2; } else return null; }
      else { s2.pun = PUN_BY_SEV[Math.max(0, i - 4)]; s2.enf = spec.enf === 'police' ? 'wardens' : 'watch'; }
      return s2;
    }
    if (spec.rule === 'subsidise') { s2.rule = 'reward'; return s2; }
    if (spec.rule === 'tax' && spec.amount > 1) { s2.amount = 1; return s2; }
    return null;
  }
  function counterFrom(spec, proposerId) {
    const dir = RULES[spec.rule].dir;
    const cands = npcFree().filter((c) => c.age >= 18 && c.id !== proposerId).map((c) => ({ c, v: CC.desires(c)[spec.beh] || 0 })).filter((x) => Math.sign(x.v) === -Math.sign(dir) && Math.abs(x.v) >= 0.3).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    if (!cands.length) return null;
    const c = cands[0].c;
    let rule = dir < 0 ? (S.treasury > 40 && chance(0.4) ? 'subsidise' : 'reward') : (Math.abs(cands[0].v) > 0.6 && CC.rulesFor(spec.beh).includes('ban') ? 'ban' : CC.rulesFor(spec.beh).includes('tax') ? 'tax' : 'ban');
    if (BEH[spec.beh].kind === 'subject') rule = dir < 0 ? 'reward' : Math.abs(cands[0].v) > 0.6 ? 'ban' : 'discourage';
    const cs = { name: aiLawName(spec.beh, rule), who: spec.who, rule, beh: spec.beh, amount: 2, enf: 'watch', pun: 'fine', method: 'firing', setting: 'private', proposedBy: c.id };
    return { spec: cs, by: c.id, say: sayFor(spec.beh, rule) };
  }
  function proposalMode() {
    if (leaderIsPlayer()) return 'decide';
    if ((S.gov.type === 'council' && S.gov.council.includes(PLAYER)) || (S.gov.type === 'assembly' && player().novote <= 0)) return 'vote';
    return 'petition';
  }
  function maybeProposal() {
    if (S.pending.some((e) => e.kind === 'proposal') || player().status !== 'free') return;
    if (!chance(leaderIsPlayer() ? 0.24 : 0.12)) return;
    const pool = shuffle(npcFree().filter((c) => c.age >= 18 && c.id !== S.gov.leader));
    pool.sort((a, b) => (has(b, 'Ambitious') + has(b, 'Idealist') + has(b, 'Devout') + has(b, 'Busybody') + (b.party != null)) - (has(a, 'Ambitious') + has(a, 'Idealist') + has(a, 'Devout') + has(a, 'Busybody') + (a.party != null)) + (rnd() - 0.5) * 3);
    // sometimes it's a call to repeal a law people hate
    const hated = S.laws.filter((L) => S.day >= L.from + 2).map((L) => ({ L, p: CC.lawPopularity(L) })).filter((x) => x.p.pct < 45).sort((a, b) => a.p.pct - b.p.pct)[0];
    if (hated && chance(0.3)) {
      const by = pool.filter((c) => (c.lawSupport[hated.L.id] || 0) < -30)[0];
      if (by) { CC.queueEvent('proposal', { repeal: hated.L.id, by: by.id, say: pick([`“‘${hated.L.name}’ has done enough damage. Scrap it.”`, `“Nobody asked for ‘${hated.L.name}’. Get rid of it.”`, `“Repeal ‘${hated.L.name}’ and people will thank you.”`]) }); return; }
    }
    for (const c of pool.slice(0, 6)) {
      const spec = proposalFrom(c);
      if (!spec) continue;
      const counter = counterFrom(spec, c.id);
      CC.queueEvent('proposal', { spec, by: c.id, say: sayFor(spec.beh, spec.rule), soft: softer(spec), counter });
      return;
    }
  }
  function forecastLine(spec, repealId) {
    if (repealId != null) {
      const L = S.laws.find((x) => x.id === repealId);
      if (!L) return '';
      const p = CC.lawPopularity(L);
      const vd = CC.voteDetail(null, { law: L, repeal: true, proposer: leaderIsPlayer() ? PLAYER : null });
      return `${100 - p.pct}% of adults want it gone.${vd ? ` ${S.gov.type === 'council' ? 'Council' : 'Assembly'} forecast: ${vd.yes} for repeal, ${vd.no} against.` : ''}`;
    }
    const L = CC._laws.buildLaw({ ...spec, by: PLAYER }); L.id = -1;
    const xs = adultsHere().filter((c) => !c.isPlayer);
    const yes = xs.filter((c) => CC.supportFor(c, L) > 0).length;
    let t = `Backed by about ${yes} of ${xs.length} adults.`;
    const vd = CC.voteDetail(spec, { proposer: leaderIsPlayer() ? PLAYER : null, by: leaderIsPlayer() ? PLAYER : spec.proposedBy });
    if (vd) t += ` ${S.gov.type === 'council' ? 'Council' : 'Assembly'} forecast: ${vd.yes} for, ${vd.no} against${vd.youVote ? ', before your vote' : ''}.`;
    if (vd && vd.type === 'council') t += ' ' + vd.rows.filter((r) => !r.you).map((r) => `${r.name.split(' ')[0]}: ${r.lean}`).join(', ') + '.';
    return t;
  }
  CC.proposalForecast = forecastLine;

  // ───────────────────────── events ─────────────────────────
  CC.queueEvent = function (kind, data) {
    if (S.pending.some((e) => e.kind === kind && JSON.stringify(e.data) === JSON.stringify(data))) return;
    S.pending.push({ id: S.nextEventId++, kind, data, day: S.day });
  };
  CC.morningEvents = function (R) {
    maybeProposal();
    if (!leaderIsPlayer()) {
      if (demo() && player().party == null && !S.pending.some((e) => e.kind === 'partyInvite') && chance(0.04)) {
        const pl = playerStance();
        const fit = S.parties.filter((p) => !p.dissolved && p.leader !== PLAYER).map((p) => ({ p, a: Object.keys(pl).length ? partyAgreement(p, { stance: pl }) : 0, o: members(p).reduce((n, c) => n + c.opinion, 0) / Math.max(1, members(p).length) })).sort((a, b) => b.a + b.o / 100 - (a.a + a.o / 100))[0];
        if (fit && (fit.a > 0.2 || fit.o > 25)) CC.queueEvent('partyInvite', { party: fit.p.id });
      }
      return;
    }
    const season = Math.floor((S.day % YEAR) / (YEAR / 4));
    if ((season === 2 || season === 3) && chance(0.025)) CC.queueEvent('storm', {});
    if (chance(0.015)) CC.queueEvent('offer', {});
    if (S.plots.some((p) => !p.known && p.org !== PLAYER) && chance(0.06)) CC.queueEvent('defector', {});
    const hated = S.laws.map((L) => ({ L, p: CC.lawPopularity(L) })).filter((x) => x.p.pct < 25)[0];
    if (hated && chance(0.08)) CC.queueEvent('petition', { law: hated.L.id });
  };
  function plotPeople(d) { const pl = plotById(d.plot); return pl ? pl.members.map(P).filter((c) => c && alive(c)) : []; }
  const EVENTS = {
    gate: {
      make: (d) => {
        const g = d.group;
        const adults = g.filter((x) => !x.kid);
        const desc = adults.map((o) => `${o.first} ${o.last}, ${Math.floor(o.age)}, a ${CC.TRADES[o.trade] ? CC.TRADES[o.trade].label : 'worker'} (${(o.traits || []).join(', ')})`).join('; ');
        const kids = g.filter((x) => x.kid);
        return { title: `${CC._life.describeGroup(g)} at the gate`, text: `${desc}${kids.length ? `, with ${kids.length} child${kids.length > 1 ? 'ren' : ''}` : ''}. Homes are ${CC.crowding() > 1 ? 'already overcrowded' : 'available'}.`, options: [{ key: 'admit', label: 'Let them in' }, { key: 'refuse', label: 'Turn them away' }], def: 'refuse' };
      },
      resolve: (d, key) => {
        if (key === 'admit') {
          const made = CC._life.admitGroup(d.group, S.report);
          made.forEach((c, i) => { if (d.group[i].traits) c.traits = d.group[i].traits; if (d.group[i].trade) c.trade = d.group[i].trade; if (d.group[i].first) c.first = d.group[i].first; c.opinion = 25; c.govt = 25; });
          for (const c of here()) if (!c.isPlayer && c.motive === 'others') c.opinion += 1;
          return `You let ${list(made.map((c) => c.first))} in.`;
        }
        for (const c of here()) if (!c.isPlayer && (c.motive === 'others' || has(c, 'Generous'))) c.opinion -= 1;
        return 'You turned them away.';
      },
    },
    protest: {
      make: (d) => {
        const L = S.laws.find((x) => x.id === d.law);
        return { title: `${d.count} people are protesting in the yard`, text: L ? `They want “${L.name}” gone.` : 'They are angry with your government.', options: [L ? { key: 'concede', label: `Repeal “${L.name}”` } : { key: 'concede', label: 'Meet them and promise change' }, { key: 'ignore', label: 'Ignore them' }, { key: 'crack', label: 'Send in the wardens' }], def: 'ignore' };
      },
      resolve: (d, key) => {
        const ps = d.ids.map(P).filter((c) => c && c.status === 'free' && !c.isPlayer);
        if (key === 'concede') {
          const L = S.laws.find((x) => x.id === d.law);
          if (L) CC._laws.repeal(L, S.report, PLAYER);
          for (const c of ps) c.opinion = clamp(c.opinion + 12, -100, 100);
          S.legitimacy = clamp(S.legitimacy + 4, 0, 100);
          for (const c of here()) if (!c.isPlayer && has(c, 'Loyal')) c.opinion -= 3;
          return L ? `You repealed “${L.name}”. The protesters went home pleased.` : 'You met the protesters. They will hold you to your word.';
        }
        if (key === 'ignore') { for (const c of ps) c.opinion = clamp(c.opinion - 5, -100, 100); return 'You ignored the protest. It will come back bigger.'; }
        if (!CC.wardenCount()) { for (const c of ps) c.opinion -= 6; return 'You have no wardens to send. The protesters laughed.'; }
        const hit = shuffle(ps.slice()).slice(0, 3);
        for (const c of hit) CC.applyPunishment(c, 'detention', { why: 'for protesting', how: 'arrested', R: S.report });
        for (const c of ps) c.opinion = clamp(c.opinion - 12, -100, 100);
        for (const c of here()) if (!c.isPlayer) c.fear = clamp(c.fear + 6, 0, 100);
        S.attention = clamp(S.attention + 3, 0, 100);
        return `The wardens broke up the protest and arrested ${list(hit.map((c) => c.first))}.`;
      },
    },
    plot: {
      make: (d) => {
        const ppl = plotPeople(d);
        const opts = [{ key: 'pardon', label: 'Pardon them' }, { key: 'detain', label: 'Lock them up for a week' }, { key: 'exile', label: 'Exile them' }, { key: 'execute', label: 'Execute them' }].filter((o) => !((o.key === 'detain' && CC.isAbolished('longdet')) || (o.key === 'exile' && CC.isAbolished('exile')) || (o.key === 'execute' && CC.isAbolished('execution'))));
        return { title: 'A plot against you', text: `It was uncovered ${d.how || 'by people loyal to you'}. The plotters: ${list(ppl.map((c) => c.first + ' ' + c.last))}.`, options: opts, def: opts.some((o) => o.key === 'detain') ? 'detain' : 'pardon' };
      },
      resolve: (d, key) => {
        const ppl = plotPeople(d);
        const pl = plotById(d.plot); if (pl) disband(pl);
        if (key === 'pardon') { for (const c of ppl) { c.opinion = clamp(c.opinion + 15, -100, 100); c.grudge_regime = false; } for (const c of here()) if (!c.isPlayer) c.fear = clamp(c.fear - 5, 0, 100); return `You pardoned ${list(ppl.map((c) => c.first))}.`; }
        const pun = key === 'detain' ? 'longdet' : key;
        for (const c of ppl) CC.applyPunishment(c, pun, { why: 'for plotting against you', how: 'convicted', setting: 'public', method: 'firing', R: S.report });
        return `The plotters were ${key === 'detain' ? 'locked up' : key === 'exile' ? 'exiled' : 'executed'}.`;
      },
    },
    selfcaught: {
      make: (d) => { const L = S.laws.find((x) => x.id === d.law) || { name: 'your law', pun: 'fine' }; return { title: 'Caught by your own wardens', text: `You broke “${L.name}”. The punishment is ${CC.PUN[L.pun] ? CC.PUN[L.pun].label : 'set by law'}.`, options: [{ key: 'accept', label: 'Accept the punishment' }, { key: 'pardon', label: 'Pardon yourself' }], def: 'pardon' }; },
      resolve: (d, key) => {
        const L = S.laws.find((x) => x.id === d.law);
        if (key === 'accept' && L) {
          for (const c of here()) if (!c.isPlayer) c.opinion = clamp(c.opinion + 6, -100, 100);
          S.legitimacy = clamp(S.legitimacy + 6, 0, 100);
          if (CC.punCat(L.pun) === 'execution' || CC.punCat(L.pun) === 'exile') { CC.gameOver(CC.punCat(L.pun) === 'exile' ? 'exiled' : 'executed', `You were caught breaking your own law, “${L.name}”, and accepted the punishment: ${CC.punText(L)}.`); return 'You accepted it.'; }
          CC.applyPunishment(player(), L.pun, { why: `for “${L.name}”`, how: 'caught', R: S.report, method: L.method, setting: L.setting });
          return 'You took your punishment like anyone else. People noticed.';
        }
        for (const c of here()) if (!c.isPlayer) c.opinion = clamp(c.opinion - 6, -100, 100);
        S.legitimacy = clamp(S.legitimacy - 8, 0, 100);
        return 'You pardoned yourself. People noticed that too.';
      },
    },
    lost: {
      make: (d) => { const c = P(d.chair); return { title: 'You lost the election', text: `${d.summary}. ${c ? c.first + ' ' + c.last : 'Your rival'} has the votes to take over${d.coalition ? ` in coalition with ${d.coalition}` : ''}.`, options: [{ key: 'accept', label: 'Accept the result' }, { key: 'refuse', label: 'Refuse to step down' }, { key: 'walk', label: 'Walk away from the commune' }], def: 'accept' }; },
      resolve: (d, key) => {
        if (key === 'accept') {
          S.gov.council = d.council; S.gov.nextElection = S.day + S.gov.term;
          setLeader(d.chair, 'election', S.report);
          for (const c of here()) if (!c.isPlayer) c.opinion = clamp(c.opinion + 6, -100, 100);
          return 'You handed over power. You are an ordinary citizen now, free to campaign for next time.';
        }
        if (key === 'walk') { CC.gameOver('retired', 'You lost the election and walked out of the gate. The commune went on without you.'); return ''; }
        S.gov.type = 'dictatorship'; S.gov.council = []; S.gov.nextElection = null;
        S.legitimacy = clamp(S.legitimacy - 40, 0, 100);
        for (const c of here()) if (!c.isPlayer) { c.opinion = clamp(c.opinion - (has(c, 'Loyal') ? 0 : 25), -100, 100); c.govt = c.opinion; if (has(c, 'Idealist') || has(c, 'Rebellious')) c.grudge_regime = true; }
        log('You refused to accept the election result.', 'politics');
        return 'You refused to step down. The election is void and you rule by force now.';
      },
    },
    journalists: {
      make: () => ({ title: 'Journalists at the gate', text: 'A news crew wants to film inside the commune.', options: [{ key: 'in', label: 'Let them in' }, { key: 'tour', label: 'Give them a guided tour' }, { key: 'away', label: 'Turn them away' }], def: 'away' }),
      resolve: (d, key) => {
        const good = CC.wellbeing() > 55 && S.stats.executions === 0 && S.legitimacy > 50;
        if (key === 'in') { S.attention = clamp(S.attention + (good ? -15 : 15), 0, 100); return good ? 'They liked what they saw. The story was kind.' : 'They filmed everything. The story was not kind.'; }
        if (key === 'tour') { S.attention = clamp(S.attention - 5, 0, 100); secret('staged a tour for the press', 6); return 'They saw what you showed them.'; }
        S.attention = clamp(S.attention + 8, 0, 100); return 'You turned them away. They reported that too.';
      },
    },
    storm: {
      make: () => ({ title: 'Storm damage', text: 'A storm tore through the yard last night. One of the homes is letting in water.', options: [{ key: 'repair', label: `Repair it (8 materials)` }, { key: 'leave', label: 'Leave it' }], def: 'leave' }),
      resolve: (d, key) => {
        if (key === 'repair' && S.materials >= 8) { S.materials -= 8; return 'Repaired.'; }
        if (S.buildings.home > 0) S.buildings.home--;
        return 'The home was lost. People are more crowded now.';
      },
    },
    offer: {
      make: () => ({ title: 'A supermarket offer', text: 'A supermarket chain will deliver 40 food if you let them put adverts on the outer walls.', options: [{ key: 'yes', label: 'Accept' }, { key: 'no', label: 'Decline' }], def: 'no' }),
      resolve: (d, key) => {
        if (key === 'yes') { S.food += 40; S.attention = clamp(S.attention + 2, 0, 100); for (const c of here()) if (!c.isPlayer && (has(c, 'Idealist') || has(c, 'Rebellious'))) c.opinion -= 4; return 'The food arrived. So did the adverts.'; }
        return 'You declined.';
      },
    },
    defector: {
      make: () => ({ title: 'A warden comes to see you', text: 'They know of a plot, and will give you names for 20 scrip.', options: [{ key: 'pay', label: 'Pay (20 scrip)' }, { key: 'no', label: 'Send them away' }], def: 'no' }),
      resolve: (d, key) => {
        if (key !== 'pay') return 'You sent them away.';
        if (S.treasury < 20) return "The treasury can't cover it.";
        S.treasury -= 20;
        const pl = S.plots.filter((p) => p.org !== PLAYER && !p.known).sort((a, b) => b.members.length - a.members.length)[0];
        if (!pl) return 'The names were worthless.';
        CC.exposePlot(pl.id, S.report, 'by a paid informer');
        return 'You have the names.';
      },
    },
    invite: {
      make: (d) => { const pl = plotById(d.plot); const o = pl && P(pl.org); return { title: 'An invitation', text: `${o ? o.first + ' ' + o.last : 'Someone'} takes you aside. They are planning to overthrow the government, and want you in.`, options: [{ key: 'join', label: 'Join the plot' }, { key: 'no', label: 'Say no' }, { key: 'report', label: 'Report them to the government' }], def: 'no' }; },
      resolve: (d, key) => {
        const pl = plotById(d.plot);
        if (!pl) return 'It came to nothing.';
        if (key === 'join') { pl.members.push(PLAYER); player().plot = pl.id; return 'You are part of the plot now.'; }
        if (key === 'report') {
          const ppl = pl.members.map(P).filter((c) => c && alive(c));
          regimeCrush(pl, S.report, 'after you reported it');
          for (const c of here()) if (!c.isPlayer) { if (regimeOp(c) > 20) c.opinion += 8; else c.opinion -= 6; }
          return `You reported ${list(ppl.map((c) => c.first))}.`;
        }
        return 'You said no, and kept it to yourself.';
      },
    },
    petition: {
      make: (d) => { const L = S.laws.find((x) => x.id === d.law); const p = L ? CC.lawPopularity(L) : { pct: 0 }; return { title: 'A petition', text: L ? `${100 - p.pct}% of adults want “${L.name}” repealed.` : 'A petition reached you.', options: [{ key: 'repeal', label: 'Repeal it' }, { key: 'keep', label: 'Keep it' }], def: 'keep' }; },
      resolve: (d, key) => {
        const L = S.laws.find((x) => x.id === d.law);
        if (!L) return '';
        if (key === 'repeal') { CC._laws.repeal(L, S.report, PLAYER); return `You repealed “${L.name}”.`; }
        for (const c of here()) if (!c.isPlayer && (c.lawSupport[L.id] || 0) < -20) c.opinion -= 3;
        return 'You kept it.';
      },
    },
    proposal: {
      make: (d) => {
        const c = P(d.by);
        const who = c ? `${c.first} ${c.last}` : 'A citizen';
        const role = c ? `, ${c.age < 16 ? 'a child' : CC.TRADES[c.trade] ? 'a ' + CC.TRADES[c.trade].label : 'a citizen'}${partyOf(c) ? ' in ' + partyOf(c).name : ''}` : '';
        const mode = proposalMode();
        if (d.repeal != null) {
          const L = S.laws.find((x) => x.id === d.repeal);
          if (!L) return { title: 'A proposal', text: 'The law in question is already gone.', options: [{ key: 'reject', label: 'Fine' }], def: 'reject' };
          const opts = mode === 'decide' ? [{ key: 'pass', label: demo() ? `Put the repeal to the ${S.gov.type === 'council' ? 'council' : 'assembly'}` : 'Repeal it', note: forecastLine(null, L.id) }, { key: 'reject', label: 'Keep the law' }]
            : mode === 'vote' ? [{ key: 'yes', label: 'Vote to repeal', note: forecastLine(null, L.id) }, { key: 'no', label: 'Vote to keep it' }, { key: 'abstain', label: 'Abstain' }]
            : [{ key: 'sign', label: 'Sign the petition', note: forecastLine(null, L.id) }, { key: 'reject', label: "Don't sign" }];
          return { title: `${who} wants “${L.name}” repealed`, text: `${d.say} says ${who}${role}. The law: ${CC.describeLaw(L)}`, options: opts, def: mode === 'vote' ? 'abstain' : 'reject', proposal: true };
        }
        const law = (spec) => CC.describeLaw(CC._laws.buildLaw({ ...spec, by: PLAYER }));
        const opts = [];
        if (mode === 'decide') {
          const verb = demo() ? `Put it to the ${S.gov.type === 'council' ? 'council' : 'assembly'}` : 'Decree it';
          opts.push({ key: 'pass', label: `${verb} as proposed`, note: `“${d.spec.name}”: ${law(d.spec)} ${forecastLine(d.spec)}` });
          if (d.soft) opts.push({ key: 'soft', label: demo() ? 'Put a softer version to the vote' : 'Decree a softer version', note: `“${d.soft.name}”: ${law(d.soft)} ${forecastLine(d.soft)}` });
          const cc = d.counter && P(d.counter.by);
          if (cc && alive(cc)) opts.push({ key: 'counter', label: `Side with ${cc.first} instead`, note: `“${d.counter.say}” says ${cc.first} ${cc.last}. “${d.counter.spec.name}”: ${law(d.counter.spec)} ${forecastLine(d.counter.spec)}` });
          opts.push({ key: 'reject', label: 'Throw it out', note: 'No new law. ' + (c ? c.first + ' will be disappointed.' : '') });
        } else if (mode === 'vote') {
          opts.push({ key: 'yes', label: 'Vote for it', note: `${law(d.spec)} ${forecastLine(d.spec)}` }, { key: 'no', label: 'Vote against it' }, { key: 'abstain', label: 'Abstain' });
        } else {
          opts.push({ key: 'sign', label: 'Sign the petition', note: `${law(d.spec)} ${forecastLine(d.spec)}` }, { key: 'reject', label: "Don't sign" });
        }
        const title = mode === 'decide' ? `${who} proposes “${d.spec.name}”` : mode === 'vote' ? `${S.gov.type === 'council' ? 'Council' : 'Assembly'} vote: “${d.spec.name}”` : `A petition: “${d.spec.name}”`;
        const lead = mode === 'vote' ? `${who}${role} has put a law to the ${S.gov.type === 'council' ? 'council' : 'assembly'}.` : mode === 'petition' ? `${who}${role} is collecting signatures.` : '';
        return { title, text: `${lead ? lead + ' ' : ''}“${d.say}” says ${c ? c.first : 'they'}.`, options: opts, def: mode === 'vote' ? 'abstain' : 'reject', proposal: true };
      },
      resolve: (d, key) => {
        const c = P(d.by);
        const R = S.report;
        const mode = proposalMode();
        const warm = (x, n) => { if (x && !x.isPlayer) x.opinion = clamp(x.opinion + n, -100, 100); };
        if (d.repeal != null) {
          const L = S.laws.find((x) => x.id === d.repeal);
          if (!L) return '';
          if (mode === 'decide') {
            if (key !== 'pass') { warm(c, -5); for (const x of here()) if (!x.isPlayer && (x.lawSupport[L.id] || 0) < -30) x.opinion -= 1; return `You kept “${L.name}”.`; }
            warm(c, 8); return decideRepeal(L, PLAYER, R).text;
          }
          if (mode === 'vote') {
            S._pvote = key === 'yes' ? 'yes' : key === 'no' ? 'no' : null;
            const t = decideRepeal(L, d.by, R).text; delete S._pvote;
            warm(c, key === 'yes' ? 6 : key === 'no' ? -6 : 0); return t;
          }
          if (key === 'sign') { warm(c, 6); S._petitionBoost = 8; }
          else if (chance(0.6)) return 'You kept your name off it. The petition ran out of steam.';
          const lead = P(S.gov.leader);
          let t;
          if (demo()) t = decideRepeal(L, d.by, R).text;
          else if (lead && -(lead.lawSupport[L.id] || 0) + (key === 'sign' ? 10 : 0) > 20) { CC._laws.repeal(L, R, lead.id); t = `${lead.first} repealed “${L.name}”.`; }
          else t = `${lead ? lead.first : 'The ruler'} ignored the petition. “${L.name}” stays.`;
          delete S._petitionBoost;
          return (key === 'sign' ? 'You signed. ' : '') + t;
        }
        const enactFrom = (spec, credit) => {
          const sp = { ...spec, name: CC.lawNameIssue(spec.name) ? CC.uniqueLawName(spec.name) : spec.name };
          const L = CC._laws.buildLaw({ ...sp, by: credit });
          return L;
        };
        if (mode === 'decide') {
          if (key === 'reject') { warm(c, -6); const cc = d.counter && P(d.counter.by); warm(cc, 2); return `You threw out “${d.spec.name}”.`; }
          const spec = key === 'soft' && d.soft ? d.soft : key === 'counter' && d.counter ? d.counter.spec : d.spec;
          const res = decideLaw(enactFrom(spec, PLAYER), PLAYER, R);
          if (key === 'counter') { warm(P(d.counter.by), res.passed ? 10 : 4); warm(c, -8); }
          else warm(c, res.passed ? (key === 'soft' ? 4 : 10) : 3);
          return res.text;
        }
        if (mode === 'vote') {
          S._pvote = key === 'yes' ? 'yes' : key === 'no' ? 'no' : null;
          const res = decideLaw(enactFrom(d.spec, d.by), d.by, R);
          delete S._pvote;
          warm(c, key === 'yes' ? 6 : key === 'no' ? -6 : 0);
          return `You ${key === 'yes' ? 'voted for it' : key === 'no' ? 'voted against it' : 'abstained'}. ${res.text}`;
        }
        if (key === 'sign') { warm(c, 6); S._petitionBoost = 8; } else warm(c, -2);
        if (key !== 'sign' && chance(0.6)) return `You kept your name off it. The petition ran out of steam.`;
        const L = enactFrom(d.spec, d.by);
        let t;
        if (S.gov.type === 'council') {
          const sponsor = S.gov.council.map(P).filter((x) => x && x.status === 'free' && !x.isPlayer).map((x) => ({ x, s: x.id === d.by ? 100 : CC.supportFor(x, L) })).sort((a, b) => b.s - a.s)[0];
          t = sponsor && sponsor.s > 10 ? `${sponsor.x.first} ${sponsor.x.id === d.by ? 'put it' : 'took it'} to the council. ${decideLaw(L, sponsor.x.id, R).text}` : 'No councillor would take it up.';
        } else if (S.gov.type === 'assembly') t = decideLaw(L, d.by, R).text;
        else {
          const lead = P(S.gov.leader);
          if (lead && CC.supportFor(lead, L) + (key === 'sign' ? 10 : 0) > 20) { L.by = lead.id; CC._laws.enact(L, R); t = `${lead.first} liked it and decreed “${L.name}”.`; }
          else t = `${lead ? lead.first : 'The ruler'} ignored it.`;
        }
        delete S._petitionBoost;
        return (key === 'sign' ? 'You signed. ' : 'You kept your name off it. ') + t;
      },
    },
    partyInvite: {
      make: (d) => { const p = partyById(d.party); return { title: `${p ? p.name : 'A party'} wants you`, text: p ? `${P(p.leader) ? P(p.leader).first : 'Its leader'} asks you to join ${p.name}.` : '', options: [{ key: 'join', label: 'Join' }, { key: 'no', label: 'Decline' }], def: 'no' }; },
      resolve: (d, key) => { const p = partyById(d.party); if (key === 'join' && p) { player().party = p.id; return `You joined ${p.name}.`; } return 'You declined.'; },
    },
  };
  CC.eventView = function (e) { const E = EVENTS[e.kind]; return E ? { id: e.id, kind: e.kind, ...E.make(e.data) } : null; };
  CC.resolveEvent = function (id, key) {
    const e = S.pending.find((x) => x.id === id);
    if (!e) return '';
    S.pending = S.pending.filter((x) => x !== e);
    const msg = EVENTS[e.kind] ? EVENTS[e.kind].resolve(e.data, key) : '';
    if (msg) note(msg);
    return msg;
  };
  CC.resolveDefaults = function () {
    for (const e of S.pending.slice()) {
      if (e.day >= S.day) continue;
      const v = CC.eventView(e);
      CC.resolveEvent(e.id, v ? v.def : null);
    }
  };

  // ───────────────────────── endings ─────────────────────────
  CC.gameOver = function (kind, text) {
    if (S.over) return;
    const titles = { executed: 'Executed', exiled: 'Exiled', assassinated: 'Assassinated', absorbed: 'Taken back', collapse: 'Collapse', exodus: 'Exodus', retired: 'You walked away', died: 'You died' };
    S.over = { kind, title: titles[kind] || 'The end', text, day: S.day };
    log(text, 'end');
  };
  CC.checkEndings = function () {
    const pop = here().filter((c) => !c.isPlayer).length;
    if (pop < 3) CC.gameOver('collapse', 'Almost everyone is gone. The containers stand empty, and the commune is over.');
    else if (S.peakPop >= 12 && here().length < S.peakPop * 0.25) CC.gameOver('exodus', `From a peak of ${S.peakPop}, only ${here().length} remain. The commune has emptied out.`);
    if (player().health <= 0) CC.gameOver('died', 'Your body gave out.');
  };
  CC.epilogue = function () {
    const xs = S.people.filter((c) => !c.isPlayer && (alive(c) || c.status === 'fled' || c.status === 'exiled'));
    const fans = xs.filter((c) => c.age >= 16).sort((a, b) => b.opinion - a.opinion);
    const verdicts = [];
    if (fans[0]) verdicts.push(`“The best thing that ever happened to us,” says ${fans[0].first} ${fans[0].last}.`);
    if (fans.length > 2) verdicts.push(`“${fans[Math.floor(fans.length / 2)].opinion > 0 ? 'Fair, mostly' : 'Could have been worse'},” says ${fans[Math.floor(fans.length / 2)].first} ${fans[Math.floor(fans.length / 2)].last}.`);
    if (fans.length > 1 && fans[fans.length - 1].opinion < 0) verdicts.push(`“Good riddance,” says ${fans[fans.length - 1].first} ${fans[fans.length - 1].last}.`);
    return { days: S.day, cal: CC.calendar(), peak: S.peakPop, pop: here().length, stats: S.stats, gov: CC.GOV[S.gov.type].label, laws: S.laws.length, verdicts };
  };

  // ───────────────────────── player actions ─────────────────────────
  const need = (ok, why) => (ok ? null : why);
  function freeMe() { return player().status === 'free' ? null : 'You are in the lock-up.'; }
  function lead() { return leaderIsPlayer() ? null : 'Only the leader can do this.'; }
  function target(id) { const c = P(id); return c && c.status === 'free' && !c.isPlayer ? c : null; }
  const A = {};
  // personal
  // you do something the law may tax, pay or honour
  function pdo(b) { S.pdid.push(b); const n = CC.lawMoney(player(), b); return n.length ? ` You ${list(n)}.` : ''; }
  const style = () => (owned().clothes ? 1.3 : 1);
  A.work = {
    label: 'Work a shift', ap: 1, check: () => freeMe(),
    run: () => { const r = CC.payShift(player()); const extra = pdo('work'); return (r.ok ? (r.paid ? `You worked a shift and earned ${r.paid} scrip.` : 'You worked a shift. The commune pays no wages.') : 'You worked a shift, but the treasury could not pay you.') + extra; },
  };
  A.speak = {
    label: 'Speak in the yard', ap: 1, check: () => freeMe(),
    run: ({ tone }) => {
      const mast = S.buildings.mast && leaderIsPlayer();
      const aud = here().filter((c) => !c.isPlayer && c.age >= 12 && (mast || c.friends.includes(PLAYER) || chance(0.5)));
      const st = playerStance();
      let moved = 0;
      for (const c of aud) {
        let d = 0;
        if (tone === 'ideas') d = (Object.keys(st).length ? CC.agreement(c, st) * 12 + 1 : 1) * style();
        if (tone === 'praise') { d = has(c, 'Loyal') ? 4 : regimeOp(c) < -20 ? -4 : 0; c.govt = clamp(c.govt + 2, -100, 100); }
        if (tone === 'criticise') { d = Math.max(-6, -regimeOp(c) * 0.08) + (has(c, 'Loyal') ? -6 : 0) + (has(c, 'Rebellious') ? 3 : 0); c.govt = clamp(c.govt - 3, -100, 100); }
        c.opinion = clamp(c.opinion + d, -100, 100); if (d > 0) moved++;
      }
      let extra = '';
      if (tone === 'criticise') extra += pdo('criticise');
      extra += pdo('gather');
      return `${aud.length} people listened${mast ? ' over the broadcast' : ''}. ${moved} warmed to you.${extra}`;
    },
  };
  A.befriend = {
    label: 'Get to know them', ap: 1, check: ({ id }) => freeMe() || need(target(id), 'They are not around.'),
    run: ({ id }) => {
      const c = target(id);
      if (c.opinion < -40) { c.opinion += 3; return `${c.first} doesn't want to know.`; }
      c.opinion = clamp(c.opinion + 10 + (c.party != null && c.party === player().party ? 5 : 0), -100, 100);
      if (c.opinion > 25 && !c.friends.includes(PLAYER)) { CC._people.befriend(c, player()); return `You and ${c.first} are friends now.`; }
      return `You spent time with ${c.first}. They think a little better of you.`;
    },
  };
  A.help = {
    label: 'Help them out (5 scrip)', ap: 1, check: ({ id }) => freeMe() || need(target(id), 'They are not around.') || need(player().scrip >= 5, 'You need 5 scrip.'),
    run: ({ id }) => { const c = target(id); player().scrip -= 5; c.scrip += 5; c.needs.food = clamp(c.needs.food + 20, 0, 100); c.needs.belonging = clamp(c.needs.belonging + 10, 0, 100); c.opinion = clamp(c.opinion + 12, -100, 100); for (const f of c.friends.map(P)) if (f && !f.isPlayer) f.opinion += 2; return `You helped ${c.first}. Their friends heard about it.`; },
  };
  A.court = {
    label: 'Ask them to be your partner', ap: 1,
    check: ({ id }) => freeMe() || need(target(id) && target(id).age >= 18, 'They are not around.') || need(!partnersOf(player()).includes(id), 'You are already partners.')
      || need(target(id) && (partnersOf(target(id)).length === 0 || CC.likeOf(target(id), 'polygamy') > 0), 'They are already spoken for.'),
    run: ({ id }) => {
      const c = target(id), me = player();
      const extra = partnersOf(me).length > 0 || partnersOf(c).length > 0;
      if (!attracted(c, me)) { c.opinion = clamp(c.opinion + 2, -100, 100); return `${c.first} is fond of you, but not in that way.`; }
      if (c.opinion < 45 || !c.friends.includes(PLAYER)) { c.opinion += 3; return `${c.first} likes you, but not like that. Not yet, anyway.`; }
      if (extra && CC.likeOf(c, 'polygamy') < -10 && !partnersOf(c).length) { c.opinion -= 4; return `${c.first} won't share you with anyone.`; }
      CC._people.pair(me, c, extra);
      for (const q of livePartners(me)) if (q !== c && !q.isPlayer && CC.likeOf(q, 'polygamy') < 0) { q.grudges[PLAYER] = (q.grudges[PLAYER] || 0) + 25; q.opinion -= 20; }
      log(extra ? `You took ${c.first} ${c.last} as another partner.` : `You and ${c.first} ${c.last} became partners.`, 'life');
      const kinds = ['partner']; if (sameSex(me, c)) kinds.push('samesex'); if (extra) kinds.push('polygamy');
      const notes = [];
      for (const b of kinds) {
        notes.push(...CC.lawMoney(me, b));
        for (const L of S.laws) if (L.beh === b && RULES[L.rule].violation && CC.governs(L, me) && (L.rule === 'ban' || (L.rule === 'license' && !me.licenses.includes(L.id)) || (L.rule === 'ration' && (me.life[b] || 0) > 1)) && chance(CC.catchRate(L) + 0.25)) {
          if (leaderIsPlayer()) CC.queueEvent('selfcaught', { law: L.id }); else CC.applyPunishment(me, L.pun, { why: `for ${b === 'samesex' ? 'a same-sex partnership' : b === 'polygamy' ? 'taking another partner' : 'forming a partnership'} against “${L.name}”`, how: 'caught', R: S.report, method: L.method, setting: L.setting });
          break;
        }
      }
      return `${extra ? `${c.first} is your partner too now.` : `You and ${c.first} are partners now.`}${notes.length ? ' You ' + list(notes) + '.' : ''}`;
    },
  };
  A.divorce = {
    label: 'End your partnership', ap: 1, check: ({ id }) => freeMe() || need(partnersOf(player()).includes(id), 'You are not partners.'),
    run: ({ id }) => {
      const me = player(), c = P(id);
      CC._people.unpair(me, c);
      me.life.divorce = (me.life.divorce || 0) + 1; me.lastDivorce = S.day; c.life.divorce = (c.life.divorce || 0) + 1; c.lastDivorce = S.day;
      if (!c.isPlayer) { c.opinion = clamp(c.opinion - 30, -100, 100); c.grudges[PLAYER] = (c.grudges[PLAYER] || 0) + 20; c.needs.belonging -= 20; }
      log(`You and ${c.first} ${c.last} split up.`, 'life');
      const notes = CC.lawMoney(me, 'divorce');
      for (const L of S.laws) if (L.beh === 'divorce' && RULES[L.rule].violation && CC.governs(L, me) && (L.rule === 'ban' || (L.rule === 'license' && !me.licenses.includes(L.id)) || (L.rule === 'ration' && me.life.divorce > 1)) && chance(CC.catchRate(L) + 0.25)) {
        if (leaderIsPlayer()) CC.queueEvent('selfcaught', { law: L.id }); else CC.applyPunishment(me, L.pun, { why: `for divorcing against “${L.name}”`, how: 'caught', R: S.report, method: L.method, setting: L.setting });
        break;
      }
      return `You and ${c.first} are no longer partners.${notes.length ? ' You ' + list(notes) + '.' : ''}`;
    },
  };
  A.child = {
    label: 'Try for a child', ap: 1, check: () => freeMe() || need(player().partner != null, 'You need a partner.') || need(!player().expecting, 'You are already expecting.'),
    run: () => { const me = player(), p = P(me.partner); if (!chance(0.5)) return 'Not this time.'; me.expecting = S.day + 10; p.expecting = me.expecting; return `You and ${p.first} are expecting a child.`; },
  };
  A.outsiders = {
    label: 'Talk to outsiders', ap: 1, check: () => freeMe(),
    run: () => {
      pdo('outside');
      if (leaderIsPlayer()) { const good = CC.wellbeing() > 55 && S.legitimacy > 50; S.attention = clamp(S.attention + (good ? -4 : 5), 0, 100); return good ? 'You gave an interview. It went well.' : 'You gave an interview. It did not go well.'; }
      S.attention = clamp(S.attention + 3, 0, 100);
      const lead = P(S.gov.leader); if (lead && (S.gov.type === 'dictatorship' || S.stats.executions)) S.legitimacy = clamp(S.legitimacy - 3, 0, 100);
      return 'You told a journalist what life is really like inside.';
    },
  };
  A.rally = {
    label: 'Organise a protest', ap: 1, check: () => freeMe() || need(!leaderIsPlayer(), 'You are the government.'),
    run: () => { S.rally = true; pdo('protest'); return 'You spread the word. Anyone unhappy with the government will join you in the yard today.'; },
  };
  A.walkAway = { label: 'Leave the commune for good', ap: 0, check: () => null, run: () => { CC.gameOver('retired', leaderIsPlayer() ? 'You handed over the keys and walked out of the gate.' : 'You packed a bag and walked out of the gate.'); return ''; } };
  // parties and elections
  A.join = {
    label: 'Join this party', ap: 1, check: ({ party }) => freeMe() || need(partyById(party), 'No such party.') || need(player().party !== party, 'You are already a member.'),
    run: ({ party }) => { const old = partyOf(player()); if (old && old.leader === PLAYER) old.leader = null; player().party = party; const p = partyById(party); for (const c of members(p)) if (!c.isPlayer) c.opinion += 3; return `You joined ${p.name}.`; },
  };
  A.invite = {
    label: 'Invite them to your party', ap: 1,
    check: ({ id }) => freeMe() || need(target(id) && target(id).age >= 16, 'They are not around.') || need(partyOf(player()), 'You are not in a party.') || need(target(id) && target(id).party !== player().party, 'They are already a member.'),
    run: ({ id }) => {
      const c = target(id), mine = partyOf(player()), theirs = partyOf(c);
      const pull = c.opinion * 0.6 + CC.agreement(c, mine.stance) * 40 + (c.friends.includes(PLAYER) ? 15 : 0);
      const stay = theirs ? 25 + CC.agreement(c, theirs.stance) * 40 + (theirs.leader === c.id ? 100 : 0) : 10;
      if (pull > stay) { c.party = mine.id; return `${c.first} joined ${mine.name}${theirs ? `, leaving ${theirs.name}` : ''}.`; }
      c.opinion = clamp(c.opinion + 2, -100, 100);
      return `${c.first} said no${theirs ? `; they're sticking with ${theirs.name}` : ' for now'}.`;
    },
  };
  A.disbandParty = {
    label: 'Disband your party', ap: 1, check: () => freeMe() || need(partyOf(player()) && partyOf(player()).leader === PLAYER, 'You do not lead a party.'),
    run: () => {
      const p = partyOf(player());
      const mem = members(p).filter((c) => !c.isPlayer);
      p.dissolved = true;
      for (const c of members(p)) c.party = null;
      player().party = null;
      for (const c of mem) c.opinion = clamp(c.opinion - (c.friends.includes(PLAYER) ? 4 : 10), -100, 100);
      log(`You disbanded ${p.name}.`, 'politics');
      return `You disbanded ${p.name}. ${mem.length ? `Its ${mem.length} other member${mem.length === 1 ? ' is' : 's are'} on their own now, and not all of them are happy about it.` : ''}`;
    },
  };
  // why a party can't be outlawed (or null if it can)
  function outlawBlock(p) {
    if (!p || p.dissolved) return 'No such party.';
    if (player().party === p.id) return "That's your own party.";
    if (p.outlawed) return 'It is already outlawed.';
    const lead = P(S.gov.leader);
    if (lead && !lead.isPlayer && lead.party === p.id) return 'They are the ruling party.';
    if (S.gov.type === 'council' && S.gov.council.filter((id) => P(id) && P(id).party === p.id).length >= 3) return 'They hold a majority on the council.';
    if (members(p).length > adultsHere().length / 2) return 'Most adults are members.';
    return null;
  }
  CC.outlawBlock = (id) => outlawBlock(partyById(id));
  A.outlawParty = {
    label: 'Try to outlaw this party', ap: 1,
    check: ({ party }) => freeMe() || outlawBlock(partyById(party)) || need(leaderIsPlayer() || demo(), 'Only the ruler can outlaw a party here. Petition them, or take power.'),
    run: ({ party, pun }) => {
      const p = partyById(party), R = S.report;
      const spec = { name: CC.uniqueLawName(`The ${p.name.replace(/^The /, '')} Ban`), who: 'party:' + p.id, rule: 'ban', beh: 'organise', enf: CC.wardenCount() ? 'wardens' : 'watch', pun: CC.PUN[pun] ? pun : 'fine', method: 'firing', setting: 'private', outlaws: p.id, by: PLAYER };
      const L = CC._laws.buildLaw(spec);
      for (const c of members(p)) if (!c.isPlayer) { c.opinion = clamp(c.opinion - 15, -100, 100); c.grudges[PLAYER] = (c.grudges[PLAYER] || 0) + 10; }
      if (leaderIsPlayer() || S.gov.type === 'assembly' || S.gov.council.includes(PLAYER)) return decideLaw(L, PLAYER, R).text;
      const sponsor = S.gov.council.map(P).filter((c) => c && c.status === 'free' && c.party !== p.id).map((c) => ({ c, s: CC.supportFor(c, L) + c.opinion * 0.3 + c.lobby })).sort((a, b) => b.s - a.s)[0];
      if (!sponsor || sponsor.s < 10) return 'No councillor would put it forward. Word has got round that you tried.';
      return `${sponsor.c.first} put it to the council. ${decideLaw(L, sponsor.c.id, R).text}`;
    },
  };
  A.leaveParty = { label: 'Leave your party', ap: 1, check: () => freeMe() || need(player().party != null, 'You are not in a party.'), run: () => { const p = partyOf(player()); if (p && p.leader === PLAYER) p.leader = null; player().party = null; return `You left ${p ? p.name : 'your party'}.`; } };
  A.found = {
    label: 'Found a party', ap: 1, check: ({ name }) => freeMe() || need((name || '').trim().length >= 2, 'Give it a name.') || need(Object.keys(S.platform).length >= 2, 'Set at least two positions in your platform first.'),
    run: ({ name }) => {
      const old = partyOf(player()); if (old && old.leader === PLAYER) old.leader = null;
      const p = newParty(name.trim(), PLAYER, S.platform, 'ideological');
      const fans = npcFree().filter((c) => c.age >= 16 && c.opinion > 15 && CC.agreement(c, p.stance) > 0.15 && (c.party == null || c.friends.includes(PLAYER))).sort((a, b) => b.opinion - a.opinion).slice(0, 3);
      for (const f of fans) f.party = p.id;
      return fans.length ? `You founded ${p.name}. ${list(fans.map((c) => c.first))} joined straight away.` : `You founded ${p.name}. Nobody has joined yet.`;
    },
  };
  A.challenge = {
    label: 'Challenge for the party leadership', ap: 1, check: () => freeMe() || need(partyOf(player()) && partyOf(player()).leader !== PLAYER, 'You need to be a member of a party you do not lead.'),
    run: () => {
      const p = partyOf(player()), cur = P(p.leader);
      const mem = members(p).filter((c) => !c.isPlayer);
      let mine = 0;
      for (const c of mem) { const forMe = c.opinion + CC.agreement(c, S.platform) * 30 + rnd() * 10; const forThem = (c.friends.includes(cur.id) ? 25 : 10) + CC.agreement(c, p.stance) * 30 + rnd() * 10; if (forMe > forThem) mine++; }
      if (mine > mem.length / 2) { p.leader = PLAYER; for (const b of Object.keys(S.platform)) p.stance[b] = S.platform[b]; log(`You took the leadership of ${p.name}.`, 'politics'); return `You won the members' vote ${mine} to ${mem.length - mine}. You lead ${p.name} now.`; }
      if (cur) cur.grudges[PLAYER] = (cur.grudges[PLAYER] || 0) + 20;
      return `You lost the members' vote, ${mine} to ${mem.length - mine}. ${cur ? cur.first : 'The leader'} won't forget it.`;
    },
  };
  A.campaign = {
    label: 'Campaign', ap: 1,
    check: () => freeMe() || need(demo() && S.gov.nextElection != null, 'There are no elections.') || need(S.gov.nextElection - S.day <= 8, 'The election is more than 8 days away.') || need(S.standing || partyOf(player()), 'Stand for election or join a party first.'),
    run: () => {
      S.campaign += style();
      const extra = pdo('organise');
      const st = playerStance();
      let n = 0;
      for (const c of shuffle(adultsHere().filter((x) => !x.isPlayer)).slice(0, Math.ceil(adultsHere().length * 0.35))) { c.opinion = clamp(c.opinion + (CC.agreement(c, st) * 6 + 2) * style(), -100, 100); n++; }
      return `You knocked on ${n} doors.${extra}`;
    },
  };
  // shadows
  A.bribe = {
    label: 'Bribe them (10 scrip)', ap: 1,
    check: ({ id, amt }) => { const a = amt || 10; return freeMe() || need(target(id), 'They are not around.') || need(player().scrip >= a || (leaderIsPlayer() && S.treasury >= a), `You need ${a} scrip.`); },
    run: ({ id, amt }) => {
      const c = target(id), a = amt || 10, big = a >= 30;
      const fromTreasury = player().scrip < a;
      if (fromTreasury) S.treasury -= a; else player().scrip -= a;
      const refuse = (c.motive === 'others' && c.accuracy > 60) || has(c, 'Devout') || (has(c, 'Loyal') && !leaderIsPlayer());
      if (refuse && chance(big ? 0.25 : 0.4)) { c.opinion = clamp(c.opinion - 15, -100, 100); secret(`tried to bribe ${c.first}`, big ? 16 : 12); return `${c.first} refused your money, and looked at you differently.`; }
      c.scrip += a; c.bribed = big ? 24 : 12; c.lobby += big ? 55 : 30; c.opinion = clamp(c.opinion + (big ? 16 : 8), -100, 100);
      secret(`bribed ${c.first}${fromTreasury ? ' with public money' : ''}`, (fromTreasury ? 8 : 4) * (big ? 1.5 : 1));
      return big ? `${c.first} pocketed the money fast. They're yours for a while.` : `${c.first} took the money. They'll remember who their friends are.`;
    },
  };
  A.gift = {
    label: 'Give them a gift (15 scrip)', ap: 1,
    check: ({ id }) => freeMe() || need(target(id), 'They are not around.') || need(player().scrip >= 15, 'You need 15 scrip.'),
    run: ({ id }) => {
      const c = target(id); player().scrip -= 15; c.scrip += 15;
      c.opinion = clamp(c.opinion + 12 + (c.motive === 'self' ? 4 : 0), -100, 100); c.lobby += 8; c.needs.belonging = clamp(c.needs.belonging + 8, 0, 100);
      for (const p of livePartners(c)) if (!p.isPlayer) p.opinion += 2;
      return `You gave ${c.first} a gift. They were touched.`;
    },
  };
  // your own money
  const otPrice = () => CC.OVERTIME_BASE * Math.pow(2, S.otToday || 0);
  CC.otPrice = otPrice;
  A.overtime = {
    label: 'Pay for an extra action today', ap: 0, check: () => freeMe() || need(player().scrip >= otPrice(), `Costs ${otPrice()} scrip.`),
    run: () => { const pr = otPrice(); player().scrip -= pr; S.otToday = (S.otToday || 0) + 1; S.ap += 1; return `You paid ${pr} scrip to have someone else do your chores. One more action today.`; },
  };
  A.hireAide = {
    label: 'Hire an aide', ap: 0, check: () => freeMe() || need(owned().aides < CC.SHOP.aide.max, 'You have as many aides as you can use.') || need(player().scrip >= CC.SHOP.aide.cost, `Costs ${CC.SHOP.aide.cost} scrip.`),
    run: () => { player().scrip -= CC.SHOP.aide.cost; owned().aides++; S.apMax = 3 + owned().aides; S.ap += 1; log('You hired an aide.', 'you'); return `You hired an aide. One more action every day, for ${CC.SHOP.aide.upkeep} scrip a day.`; },
  };
  A.fireAide = { label: 'Let an aide go', ap: 0, check: () => need(owned().aides > 0, 'You have no aides.'), run: () => { owned().aides--; S.apMax = 3 + owned().aides; S.ap = Math.min(S.ap, S.apMax + (S.otToday || 0)); return 'You let your aide go.'; } };
  A.guards = {
    label: 'Hire bodyguards', ap: 0, check: () => freeMe() || need(!owned().guards, 'You already have bodyguards.') || need(player().scrip >= CC.SHOP.guards.cost, `Costs ${CC.SHOP.guards.cost} scrip.`),
    run: () => { player().scrip -= CC.SHOP.guards.cost; owned().guards = true; for (const c of here()) if (!c.isPlayer && has(c, 'Paranoid')) c.opinion -= 2; return `Two large people now follow you everywhere, for ${CC.SHOP.guards.upkeep} scrip a day.`; },
  };
  A.dropGuards = { label: 'Dismiss your bodyguards', ap: 0, check: () => need(owned().guards, 'You have no bodyguards.'), run: () => { owned().guards = false; return 'You sent your bodyguards home.'; } };
  A.villa = {
    label: 'Get a container of your own', ap: 0, check: () => freeMe() || need(!owned().villa, 'You already have one.') || need(player().scrip >= CC.SHOP.villa.cost, `Costs ${CC.SHOP.villa.cost} scrip.`),
    run: () => {
      player().scrip -= CC.SHOP.villa.cost; owned().villa = true;
      const hard = CC.wellbeing() < 45;
      let n = 0;
      for (const c of here()) if (!c.isPlayer && (c.motive === 'others' || has(c, 'Idealist'))) { c.opinion = clamp(c.opinion - (hard ? 8 : 4), -100, 100); n++; }
      log('You had a container of your own fitted out.', 'you');
      return `Your own container: insulated, private, with a door that locks.${n ? ` ${hard ? 'With people going short, ' : ''}${n} people think less of you for it.` : ''}`;
    },
  };
  A.clothes = {
    label: 'Buy good clothes', ap: 0, check: () => freeMe() || need(!owned().clothes, 'You already look the part.') || need(player().scrip >= CC.SHOP.clothes.cost, `Costs ${CC.SHOP.clothes.cost} scrip.`),
    run: () => { player().scrip -= CC.SHOP.clothes.cost; owned().clothes = true; return 'You look the part now. People listen a little harder.'; },
  };
  A.round = {
    label: 'Buy a round at the bar (12 scrip)', ap: 1, check: () => freeMe() || need(S.buildings.bar, 'There is no bar.') || need(player().scrip >= 12, 'You need 12 scrip.'),
    run: () => {
      player().scrip -= 12; const extra = pdo('drink');
      let n = 0;
      for (const c of here()) if (!c.isPlayer && c.age >= 18 && CC.likeOf(c, 'drink') > 5 && chance(0.7)) { c.opinion = clamp(c.opinion + 5, -100, 100); c.needs.belonging = clamp(c.needs.belonging + 6, 0, 100); n++; }
      return `You bought a round. ${n} people raised a glass to you.${extra}`;
    },
  };
  A.embezzle = {
    label: 'Help yourself to the treasury', ap: 1, check: () => freeMe() || lead() || need(S.treasury >= 10, 'There is not enough in the treasury to hide a theft.'),
    run: () => { const amt = Math.min(25, Math.floor(S.treasury)); S.treasury -= amt; player().scrip += amt; secret(`took ${amt} scrip from the treasury`, 12); return `You moved ${amt} scrip from the treasury into your own pocket. Nobody saw. Probably.`; },
  };
  A.threaten = {
    label: 'Threaten them', ap: 1, check: ({ id }) => freeMe() || need(target(id), 'They are not around.'),
    run: ({ id }) => {
      const c = target(id);
      c.fear = clamp(c.fear + 30, 0, 100); c.opinion = clamp(c.opinion - 20, -100, 100);
      c.lobby += c.fear > 50 && !has(c, 'Rebellious') ? 20 : -10;
      secret(`threatened ${c.first}`, has(c, 'Hot-headed') || has(c, 'Gossip') ? 14 : 6);
      return c.fear > 50 ? `${c.first} went pale. They'll do as they're told.` : `${c.first} glared at you. That may not have worked.`;
    },
  };
  A.smear = {
    label: 'Spread rumours about them', ap: 1, check: ({ id }) => freeMe() || need(target(id), 'They are not around.'),
    run: ({ id }) => {
      const c = target(id);
      c.smeared = (c.smeared || 0) + 20;
      for (const x of here()) if (!x.isPlayer && chance(0.4)) { x.grudges[c.id] = (x.grudges[c.id] || 0) + 6; if (S.gov.leader === c.id) x.govt = clamp(x.govt - 3, -100, 100); }
      secret(`spread lies about ${c.first}`, 5);
      if (chance(0.2)) { for (const x of here()) if (!x.isPlayer) x.opinion -= 4; return `The rumours about ${c.first} spread, but people know where they came from.`; }
      return `The rumours about ${c.first} are spreading.`;
    },
  };
  A.plot = {
    label: 'Start a plot against the government', ap: 1, check: () => freeMe() || need(!leaderIsPlayer(), 'You are the government.') || need(S.playerPlot == null, 'You already have a plot.'),
    run: () => { const pl = { id: S.nextPlotId++, org: PLAYER, members: [PLAYER], target: S.gov.leader, kind: 'coup', day: S.day, known: false, leaks: 0 }; S.plots.push(pl); S.playerPlot = pl.id; player().plot = pl.id; secret('plotted against the government', 3); return 'You have begun to plot. Now you need people.'; },
  };
  A.recruit = {
    label: 'Recruit them to your plot', ap: 1, check: ({ id }) => freeMe() || need(S.playerPlot != null, 'Start a plot first.') || need(target(id) && target(id).plot == null, 'They are not available.') || need(target(id) && target(id).id !== S.gov.leader, 'That is the leader.'),
    run: ({ id }) => {
      const c = target(id), pl = plotById(S.playerPlot);
      secret(`recruited plotters`, 4);
      if (regimeOp(c) < -20 && c.opinion > 10) { c.plot = pl.id; pl.members.push(c.id); return `${c.first} is in.`; }
      if (regimeOp(c) > 25 || has(c, 'Loyal')) {
        if (chance(0.5)) { pl.leaks += 2; secret(`tried to recruit ${c.first}, who went to the government`, 15); return `${c.first} refused, and went straight to the wardens.`; }
        return `${c.first} refused. Hopefully they'll keep quiet.`;
      }
      return `${c.first} isn't ready to risk it.`;
    },
  };
  A.coup = {
    label: 'Launch the coup', ap: 2, check: () => freeMe() || need(S.playerPlot != null, 'You have no plot.'),
    run: () => { const pl = plotById(S.playerPlot); const R = S.report; const before = R.headlines.length; launchCoup(pl, R); return R.headlines.slice(before).join(' ') || 'It is done.'; },
  };
  // the leader's powers
  A.address = {
    label: 'Give an address', ap: 1, check: () => freeMe() || lead(),
    run: () => {
      S.addressToday = true;
      const mast = S.buildings.mast;
      let n = 0;
      for (const c of here()) { if (c.isPlayer || !(mast || chance(0.6))) continue; const d = has(c, 'Cynic') ? -3 : has(c, 'Loyal') ? 6 : 3; c.opinion = clamp(c.opinion + d, -100, 100); c.govt = c.opinion; c.needs.belonging = clamp(c.needs.belonging + 5, 0, 100); n++; }
      return `You addressed ${n} people${mast ? ' over the broadcast mast' : ' in the yard'}.`;
    },
  };
  A.festival = {
    label: 'Hold a festival (20 food, 15 scrip)', ap: 1, check: () => freeMe() || lead() || need(S.food >= 20 && S.treasury >= 15, 'You need 20 food and 15 scrip.'),
    run: () => { S.food -= 20; S.treasury -= 15; for (const c of here()) if (!c.isPlayer) { c.needs.belonging = clamp(c.needs.belonging + 25, 0, 100); c.needs.freedom = clamp(c.needs.freedom + 10, 0, 100); c.opinion = clamp(c.opinion + 4, -100, 100); c.govt = c.opinion; } return 'The whole yard came out. It was a good night.'; },
  };
  A.build = {
    label: 'Fit out a building', ap: 1,
    check: ({ type }) => freeMe() || lead() || need(CC.BUILDINGS[type], 'Unknown building.') || need(S.containers >= CC.BUILDINGS[type].size, `Needs ${CC.BUILDINGS[type].size} spare container${CC.BUILDINGS[type].size > 1 ? 's' : ''}.`) || need(S.materials >= CC.BUILDINGS[type].mat, `Needs ${CC.BUILDINGS[type].mat} materials.`),
    run: ({ type }) => { const B = CC.BUILDINGS[type]; S.containers -= B.size; S.materials -= B.mat; S.buildings[type] = (S.buildings[type] || 0) + 1; log(`A ${B.label.toLowerCase()} was fitted out.`, 'build'); return `The ${B.label.toLowerCase()} is ready.`; },
  };
  A.demolish = {
    label: 'Strip out a building', ap: 1, check: ({ type }) => freeMe() || lead() || need(S.buildings[type] > 0, 'There is none to strip out.'),
    run: ({ type }) => { const B = CC.BUILDINGS[type]; S.buildings[type]--; S.containers += B.size; S.materials += Math.floor(B.mat / 2); return `The ${B.label.toLowerCase()} was stripped back to a bare container.`; },
  };
  A.buyContainer = { label: 'Buy a container', ap: 0, check: () => lead() || need(S.treasury >= 20 * price(), `Needs ${Math.round(20 * price())} scrip.`), run: () => { S.treasury -= 20 * price(); S.containers++; return 'A container arrived on a lorry.'; } };
  A.buyFood = { label: 'Buy 10 food', ap: 0, check: () => lead() || need(S.treasury >= 8 * price(), `Needs ${Math.round(8 * price())} scrip.`), run: () => { S.treasury -= 8 * price(); S.food += 10; return 'Bought 10 food.'; } };
  A.buyWater = { label: 'Buy 10 water', ap: 0, check: () => lead() || need(S.treasury >= 5 * price(), `Needs ${Math.round(5 * price())} scrip.`), run: () => { S.treasury -= 5 * price(); S.water += 10; return 'Bought 10 water.'; } };
  A.sellMat = { label: 'Sell 5 materials', ap: 0, check: () => lead() || need(S.materials >= 5, 'Needs 5 materials.'), run: () => { S.materials -= 5; S.treasury += Math.round(6 / price()); return `Sold 5 materials for ${Math.round(6 / price())} scrip.`; } };
  A.establish = {
    label: 'Establish', ap: 1, check: ({ inst }) => freeMe() || lead() || need(CC.INSTITUTIONS[inst], '?') || need(!S.inst[inst], 'Already established.') || need(S.treasury >= CC.INSTITUTIONS[inst].cost, `Needs ${CC.INSTITUTIONS[inst].cost} scrip.`),
    run: ({ inst }) => { const I2 = CC.INSTITUTIONS[inst]; S.treasury -= I2.cost; S.inst[inst] = true; if (inst === 'police') { for (const c of here()) if (!c.isPlayer) { c.fear = clamp(c.fear + 10, 0, 100); if (!has(c, 'Paranoid') && !has(c, 'Loyal')) c.opinion -= 6; } S.attention = clamp(S.attention + 4, 0, 100); } if (inst === 'cameras') S.attention = clamp(S.attention + 3, 0, 100); log(`A ${I2.label.toLowerCase()} was established.`, 'politics'); return `${I2.label} established.`; },
  };
  A.disband = { label: 'Disband', ap: 1, check: ({ inst }) => freeMe() || lead() || need(S.inst[inst], 'Not established.'), run: ({ inst }) => { S.inst[inst] = false; for (const c of here()) if (!c.isPlayer) c.fear = clamp(c.fear - 8, 0, 100); return `${CC.INSTITUTIONS[inst].label} disbanded.`; } };
  A.appoint = {
    label: 'Make them a warden', ap: 0, check: ({ id }) => lead() || need(target(id) && target(id).age >= 18, 'They are not around.') || need(target(id) && target(id).trade !== 'warden', 'Already a warden.'),
    run: ({ id }) => { const c = target(id); if (c.opinion < 5 && !has(c, 'Loyal')) return `${c.first} refused the job.`; c.trade = 'warden'; return `${c.first} is a warden now.`; },
  };
  A.dismiss = { label: 'Dismiss as warden', ap: 0, check: ({ id }) => lead() || need(target(id) && target(id).trade === 'warden', 'Not a warden.'), run: ({ id }) => { const c = target(id); c.trade = 'labourer'; c.opinion -= 10; return `${c.first} is no longer a warden.`; } };
  A.pardon = {
    label: 'Release them', ap: 0, check: ({ id }) => lead() || need(P(id) && P(id).status === 'detained', 'They are not detained.'),
    run: ({ id }) => { const c = P(id); c.status = 'free'; c.detained = 0; c.opinion = clamp(c.opinion + 20, -100, 100); for (const f of [c.partner, ...c.parents, ...c.children].map(P)) if (f && !f.isPlayer) f.opinion += 8; return `You released ${c.first}.`; },
  };
  A.arrest = {
    label: 'Have them arrested', ap: 1, check: ({ id, how }) => freeMe() || lead() || need(how === 'secret' || !CC.isAbolished('detention'), 'Imprisonment has been abolished. You could still have them taken quietly.') || need(target(id), 'They are not around.') || need(CC.wardenCount() > 0 || S.inst.police, 'You need wardens or a secret police.'),
    run: ({ id, how }) => {
      const c = target(id);
      c.status = 'detained'; c.detained = 7; c.opinion = clamp(c.opinion - 30, -100, 100); c.govt = c.opinion;
      for (const f of c.friends.map(P)) if (f && !f.isPlayer) f.opinion -= 6;
      for (const x of here()) if (!x.isPlayer) x.fear = clamp(x.fear + 3, 0, 100);
      if (how === 'secret') { secret(`had ${c.first} locked up without charge`, S.inst.police ? 10 : 18); return `${c.first} was taken quietly in the night.`; }
      S.legitimacy = clamp(S.legitimacy - 6, 0, 100); S.attention = clamp(S.attention + 1, 0, 100);
      log(`You had ${c.first} ${c.last} arrested without charge.`, 'justice');
      return `${c.first} was arrested in front of everyone. No law was needed.`;
    },
  };
  A.disappear = {
    label: 'Make them disappear', ap: 1, check: ({ id }) => freeMe() || lead() || need(P(id) && alive(P(id)) && !P(id).isPlayer, 'They are not around.') || need(S.inst.police || CC.wardenCount() >= 2, 'You need a secret police or at least two wardens.'),
    run: ({ id }) => { const c = P(id); CC.applyPunishment(c, 'disappear', { why: '', how: 'taken', R: S.report }); secret(`made ${c.first} disappear`, 25); return `${c.first} is gone.`; },
  };
  A.execute = {
    label: 'Have them executed', ap: 1, check: ({ id }) => freeMe() || lead() || need(!CC.isAbolished('execution'), 'Execution has been abolished. Restore it in the constitution first.') || need(!demo(), 'Not while there is a council or assembly to answer to.') || need(P(id) && P(id).status === 'detained', 'Only someone already in the lock-up.'),
    run: ({ id, setting }) => { const c = P(id); c.status = 'free'; CC.applyPunishment(c, 'execution', { why: 'on your orders', how: 'executed', setting: setting || 'private', method: 'firing', R: S.report }); S.legitimacy = clamp(S.legitimacy - 8, 0, 100); return `${c.first} ${c.last} was executed.`; },
  };
  A.rig = {
    label: 'Rig the next election', ap: 1, check: () => freeMe() || need(demo() && S.gov.nextElection != null && S.gov.nextElection - S.day <= 10, 'There is no election within 10 days.') || need(!S.rigged, 'Already arranged.') || need(leaderIsPlayer() || S.standing || partyOf(player()), 'You are not standing.'),
    run: () => { S.rigged = true; secret('rigged the election', 20); return 'The ballot box will say what you need it to say.'; },
  };
  A.callElection = { label: 'Call an early election', ap: 1, check: () => freeMe() || lead() || need(demo(), 'There are no elections.'), run: () => { S.gov.nextElection = S.day + 3; return 'The election will be held in three days.'; } };
  A.emergency = {
    label: 'Declare emergency rule', ap: 2, check: () => freeMe() || lead() || need(demo(), 'You already rule alone.'),
    run: () => {
      const opp = here().filter((c) => !c.isPlayer && c.age >= 16 && c.opinion < -10).reduce((n, c) => n + (has(c, 'Idealist') || has(c, 'Rebellious') ? 1.5 : 1) * (c.trade === 'warden' ? 2 : 1), 0);
      const sec = security();
      log('You declared emergency rule.', 'politics');
      if (opp > sec * 1.2) {
        const R = S.report;
        R.headlines.push('You declared emergency rule, and the commune rose against you.');
        const others = lists().filter((l) => l.leader && !l.leader.isPlayer && l.leader.status === 'free').sort((a, b) => b.people.length - a.people.length);
        if (others[0]) setLeader(others[0].leader.id, 'succession', R);
        CC.applyPunishment(player(), 'longdet', { why: 'for trying to seize power', how: 'arrested', R });
        return 'The commune rose against you. You have been arrested.';
      }
      S.gov.type = 'dictatorship'; S.gov.council = []; S.gov.nextElection = null;
      S.legitimacy = clamp(S.legitimacy - 35, 0, 100);
      for (const c of here()) if (!c.isPlayer) { c.fear = clamp(c.fear + 20, 0, 100); if (has(c, 'Idealist') || has(c, 'Rebellious')) { c.opinion -= 30; c.grudge_regime = true; } else if (!has(c, 'Loyal')) c.opinion -= 10; c.govt = c.opinion; }
      return 'Emergency rule. The council is dissolved and elections are suspended. You rule alone.';
    },
  };
  A.restore = {
    label: 'Restore democracy', ap: 2, check: ({ type }) => freeMe() || lead() || need(!demo(), 'There is already a democracy.') || need(type === 'council' || type === 'assembly', 'Choose a council or an assembly.'),
    run: ({ type }) => { S.gov.type = type; S.gov.nextElection = S.day + 6; S.gov.council = []; S.legitimacy = clamp(S.legitimacy + 15, 0, 100); for (const c of here()) if (!c.isPlayer) { if (has(c, 'Idealist')) { c.opinion += 15; c.grudge_regime = false; } c.govt = c.opinion; } log(`You restored democracy: ${CC.GOV[type].label}.`, 'politics'); return `${CC.GOV[type].label}. The first election will be in six days; until then you remain in charge.`; },
  };
  A.stepDown = {
    label: 'Step down', ap: 1, check: () => freeMe() || lead(),
    run: () => {
      const R = S.report;
      const cands = npcFree().filter((c) => c.age >= 18).sort((a, b) => b.opinion - a.opinion);
      if (!demo()) { S.gov.type = 'council'; S.gov.nextElection = S.day + 4; }
      const next = S.gov.council.map(P).filter((c) => c && c.status === 'free' && !c.isPlayer).sort((a, b) => b.opinion - a.opinion)[0] || cands[0];
      if (next) setLeader(next.id, 'succession', R);
      for (const c of here()) if (!c.isPlayer) c.opinion += 5;
      log('You stepped down.', 'politics');
      return `You stepped down. ${next ? next.first + ' ' + next.last + ' is in charge for now.' : ''}`;
    },
  };
  A.proposeLaw = {
    label: 'Pass a law', ap: 1, check: ({ spec }) => freeMe() || CC.lawNameIssue(spec && spec.name),
    run: ({ spec }) => {
      const R = S.report;
      if (leaderIsPlayer()) { const L = CC._laws.buildLaw({ ...spec, by: PLAYER }); return decideLaw(L, PLAYER, R).text; }
      // as a citizen: petition
      const L = CC._laws.buildLaw({ ...spec, by: PLAYER });
      if (S.gov.type === 'council') {
        const sponsor = S.gov.council.map(P).filter((c) => c && c.status === 'free').map((c) => ({ c, s: c.isPlayer ? 100 : CC.supportFor(c, L) + c.opinion * 0.3 + c.lobby })).sort((a, b) => b.s - a.s)[0];
        if (!sponsor || sponsor.s < 15) return 'No councillor would put your proposal forward.';
        const res = decideLaw(L, sponsor.c.isPlayer ? PLAYER : sponsor.c.id, R);
        return `${sponsor.c.isPlayer ? 'You put it to the council.' : sponsor.c.first + ' put it to the council for you.'} ${res.text}`;
      }
      if (S.gov.type === 'assembly') { const res = decideLaw(L, PLAYER, R); return `You put it to the assembly. ${res.text}`; }
      const lead = P(S.gov.leader);
      if (!lead) return 'There is nobody to petition.';
      const s = CC.supportFor(lead, L) + player().opinion * 0.2 + (lead.lobby || 0);
      if (s > 25) { L.by = lead.id; CC._laws.enact(L, R); return `${lead.first} liked your idea and decreed it.`; }
      return `${lead.first} turned your petition down.`;
    },
  };
  A.repealLaw = {
    label: 'Repeal', ap: 1, check: ({ id }) => freeMe() || need(S.laws.some((L) => L.id === id), 'No such law.'),
    run: ({ id }) => {
      const L = S.laws.find((x) => x.id === id); const R = S.report;
      if (leaderIsPlayer() || demo()) {
        if (!leaderIsPlayer() && S.gov.type === 'council' && !S.gov.council.includes(PLAYER)) {
          const sponsor = S.gov.council.map(P).filter((c) => c && c.status === 'free').sort((a, b) => (-(b.lawSupport[L.id] || 0) + b.opinion * 0.3) - (-(a.lawSupport[L.id] || 0) + a.opinion * 0.3))[0];
          if (!sponsor || -(sponsor.lawSupport[L.id] || 0) + sponsor.opinion * 0.3 < 15) return 'No councillor would put your repeal forward.';
          return decideRepeal(L, sponsor.id, R).text;
        }
        return decideRepeal(L, leaderIsPlayer() ? PLAYER : null, R).text;
      }
      const lead = P(S.gov.leader);
      if (lead && -(lead.lawSupport[L.id] || 0) + player().opinion * 0.2 > 25) { CC._laws.repeal(L, R, lead.id); return `${lead.first} agreed and repealed it.`; }
      return `${lead ? lead.first : 'The ruler'} turned your petition down.`;
    },
  };
  // constitution
  const CONST_SUPPORT = (c, ch) => {
    switch (ch.kind) {
      case 'gate': {
        if (ch.value === 'open') return (c.motive === 'others' ? 20 : c.motive === 'believed' ? 10 : -5) - (has(c, 'Paranoid') ? 25 : 0) + (!c.founder && S.day - c.arrived < YEAR ? 20 : 0) - Math.max(0, CC.crowding() - 1) * 30;
        if (ch.value === 'closed') return (has(c, 'Paranoid') ? 25 : 0) + (c.motive === 'self' ? 10 : -15) - (!c.founder && S.day - c.arrived < YEAR ? 30 : 0);
        return 5;
      }
      case 'tax': return (S.gov.tax - ch.value) * 100 * (c.motive === 'self' ? 1.5 : 0.8) + (S.treasury < 20 && ch.value > S.gov.tax ? 15 : 0);
      case 'conflict': return ch.value === 'both' ? -10 : 5;
      case 'term': return ch.value > S.gov.term ? regimeOp(c) * 0.2 - 5 : 5 - regimeOp(c) * 0.2;
      case 'exempt': return ch.value ? -30 + (has(c, 'Loyal') ? 25 : 0) : 15;
      case 'type': return ch.value === 'assembly' ? 10 + (has(c, 'Idealist') ? 20 : 0) - (has(c, 'Loyal') ? 5 : 0) : 5 + (has(c, 'Loyal') ? 5 : 0);
      case 'wage': return (ch.value - S.gov.wage) * 12 * (c.motive === 'self' ? 1.3 : 0.8) * (c.age >= 16 && !c.retired ? 1 : 0.4) - (S.treasury < 20 && ch.value > S.gov.wage ? 12 : 0) + (S.treasury < 0 && ch.value < S.gov.wage ? 6 : 0);
      case 'salary': return (S.gov.salary - ch.value) * 3 + (has(c, 'Loyal') ? 6 : 0) - 2;
      case 'currency': return 6 + (has(c, 'Rebellious') ? 4 : 0) - (has(c, 'Cynic') ? 8 : 0);
      case 'abolish': {
        const sev = CC.PUN_CATS[ch.value] ? CC.PUN_CATS[ch.value].base : PUN[ch.value] ? PUN[ch.value].sev : 50;
        const v = (sev - 50) * 0.5 + (has(c, 'Idealist') ? 20 : 0) + (c.motive === 'others' ? 8 : 0) - (has(c, 'Paranoid') ? 22 : 0) - (has(c, 'Hot-headed') ? 14 : 0) - (has(c, 'Loyal') ? 4 : 0) - (has(c, 'Busybody') ? 6 : 0);
        return ch.on === false ? -v : v;
      }
      case 'newpun': { const sev = ch.value && ch.value.sev || 50; return -(sev - 35) * 0.5 + (has(c, 'Paranoid') ? 16 : 0) + (has(c, 'Hot-headed') ? 12 : 0) - (has(c, 'Idealist') ? 20 : 0) - (c.motive === 'others' ? 8 : 0); }
    }
    return 0;
  };
  function applyConst(ch) {
    if (ch.kind === 'gate') S.gov.gate = ch.value;
    if (ch.kind === 'tax') S.gov.tax = ch.value;
    if (ch.kind === 'conflict') S.gov.conflict = ch.value;
    if (ch.kind === 'term') S.gov.term = ch.value;
    if (ch.kind === 'exempt') S.gov.exempt = ch.value;
    if (ch.kind === 'type') { S.gov.type = ch.value; S.gov.nextElection = S.day + 6; S.gov.council = []; }
    if (ch.kind === 'wage') S.gov.wage = ch.value;
    if (ch.kind === 'salary') S.gov.salary = ch.value;
    if (ch.kind === 'currency') S.currency = cleanCurrency(ch.value);
    if (ch.kind === 'abolish') {
      S.gov.abolished = S.gov.abolished || {};
      const harsh = (CC.PUN_CATS[ch.value] ? CC.PUN_CATS[ch.value].base : PUN[ch.value] ? PUN[ch.value].sev : 0) >= 70;
      if (ch.on === false) { delete S.gov.abolished[ch.value]; if (harsh) { S.legitimacy = clamp(S.legitimacy - 3, 0, 100); S.attention = clamp(S.attention + 2, 0, 100); } }
      else { S.gov.abolished[ch.value] = true; CC.commuteLaws(S.report); if (harsh) { S.legitimacy = clamp(S.legitimacy + 4, 0, 100); S.attention = clamp(S.attention - 3, 0, 100); } }
    }
    if (ch.kind === 'newpun') {
      const x = { ...ch.value, key: 'x_' + (S.nextPunId = (S.nextPunId || 0) + 1) };
      S.puns = (S.puns || []).concat([x]);
      CC.registerPunishments(S);
      if (x.sev >= 76) { S.legitimacy = clamp(S.legitimacy - 3, 0, 100); S.attention = clamp(S.attention + 3, 0, 100); }
    }
  }
  // build an invented punishment from what the player typed and chose
  CC.makePunishment = function (o) {
    const cat = CC.PUN_CATS[o.cat] && o.cat !== 'warning' ? o.cat : 'humiliation';
    const name = String(o.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const part = CC.BODY_PARTS.includes(o.part) ? o.part : 'a hand';
    const days = clamp(Math.round(Number(o.days) || 7), 1, 60);
    const amount = clamp(Math.round(Number(o.amount) || 50), 1, 500);
    const setting = o.setting === 'public' ? 'public' : 'private';
    const low = (t) => (t && /^[A-Z][a-z]/.test(t) && !/^[A-Z][a-z]+ [A-Z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
    let label = low(name);
    if (!label) label = { fine: `a fine of ${amount} scrip`, labour: `${days} days of hard labour`, rights: 'loss of all rights', humiliation: 'a day in the stocks', prison: `${days} days in the lock-up`, exile: 'banishment', corporal: 'a beating', mutilation: `amputation of ${part}`, torture: 'torture', execution: 'death' }[cat];
    if (cat === 'execution' && name && !/death|execution|execut/i.test(name)) label = `execution by ${low(name)}`;
    if (cat === 'mutilation' && name && !/amput|cut|remov|lose|loss/i.test(name)) label = `${low(name)} (amputation of ${part})`;
    if (cat === 'prison' && name) label = `${low(name)} (${days} days)`;
    if (cat === 'labour' && name) label = `${low(name)} (${days} days)`;
    if (cat === 'fine' && name) label = `${low(name)} (${amount} scrip)`;
    let sev = CC.PUN_CATS[cat].base;
    if (cat === 'prison') sev = clamp(36 + days * 1.2, 38, 80);
    if (cat === 'labour') sev = clamp(14 + days * 1.5, 14, 45);
    if (cat === 'fine') sev = clamp(10 + amount / 4, 10, 45);
    if (cat === 'mutilation' && /finger|ear/.test(part)) sev = 80;
    if (o.harsh === 'severe') sev = Math.min(cat === 'execution' ? 100 : 99, sev + 6);
    if (o.harsh === 'mild') sev = Math.max(4, sev - 6);
    if (cat === 'execution') sev = 100;
    return { name: name || label.charAt(0).toUpperCase() + label.slice(1), label, cat, sev: Math.round(sev), part: cat === 'mutilation' ? part : undefined, days: cat === 'prison' || cat === 'labour' ? days : undefined, amount: cat === 'fine' ? amount : undefined, setting };
  };
  function cleanCurrency(v) { return String(v || '').trim().replace(/\s+/g, ' ').slice(0, 20) || 'scrip'; }
  CC.cleanCurrency = cleanCurrency;
  function constLabel(ch) {
    if (ch.kind === 'gate') return CC.GATE[ch.value];
    if (ch.kind === 'tax') return `A work tax of ${Math.round(ch.value * 100)}%`;
    if (ch.kind === 'conflict') return CC.CONFLICT[ch.value];
    if (ch.kind === 'term') return `Elections every ${ch.value} days`;
    if (ch.kind === 'exempt') return ch.value ? 'The leader is above the law' : 'The leader is bound by the law';
    if (ch.kind === 'type') return CC.GOV[ch.value].label;
    if (ch.kind === 'wage') return ch.value ? `Wages of ${ch.value} scrip a shift` : 'No wages: work is unpaid';
    if (ch.kind === 'salary') return ch.value ? `A leader's salary of ${ch.value} scrip a day` : 'The leader takes no salary';
    if (ch.kind === 'currency') return `The currency is called “${cleanCurrency(ch.value)}”`;
    if (ch.kind === 'abolish') { const nm2 = CC.PUN_CATS[ch.value] ? CC.PUN_CATS[ch.value].label.toLowerCase() : PUN[ch.value] ? PUN[ch.value].label : ch.value; return ch.on === false ? `Restore ${nm2}` : `Abolish ${nm2}`; }
    if (ch.kind === 'newpun') return `Make ${ch.value ? ch.value.label : 'a new punishment'} a lawful punishment`;
    return '';
  }
  CC.constLabel = constLabel;
  A.amend = {
    label: 'Amend the constitution', ap: 1, check: ({ change }) => freeMe() || lead() || need(!(change && change.kind === 'currency' && !String(change.value || '').trim()), 'Give the currency a name.')
      || need(!(change && change.kind === 'abolish' && change.value === 'warning'), 'Warnings cannot be abolished.')
      || need(!(change && change.kind === 'newpun' && Object.values(PUN).some((x) => x.label === change.value.label)), 'There is already a punishment like that.')
      || need(!(change && change.kind === 'newpun' && S.gov.abolished && S.gov.abolished[change.value.cat]), `${change && change.value && CC.PUN_CATS[change.value.cat] ? CC.PUN_CATS[change.value.cat].label : 'That kind of punishment'} has been abolished. Restore it first.`),
    run: ({ change }) => {
      const label = constLabel(change);
      if (!demo()) {
        const xs = adultsHere().filter((c) => !c.isPlayer);
        const pct = xs.filter((c) => CONST_SUPPORT(c, change) > 0).length / Math.max(1, xs.length);
        applyConst(change);
        if (pct < 0.4) S.legitimacy = clamp(S.legitimacy - (0.4 - pct) * 25, 0, 100);
        for (const c of xs) c.opinion = clamp(c.opinion + CONST_SUPPORT(c, change) * 0.08, -100, 100);
        log(`Constitution: ${label}.`, 'politics');
        return `Decreed: ${label}. ${Math.round(pct * 100)}% of adults approve.`;
      }
      const voters = change.kind === 'type' ? adultsHere().filter((c) => c.status === 'free' && c.novote <= 0) : lawVoters();
      let yes = 0;
      for (const v of voters) { const s = v.isPlayer ? 1 : CONST_SUPPORT(v, change) + v.opinion * 0.15 + v.lobby + (rnd() - 0.5) * 12; if (s > 0) yes++; }
      const passed = yes > voters.length / 2;
      if (passed) { applyConst(change); log(`Constitution: ${label}.`, 'politics'); }
      return `${change.kind === 'type' ? 'Referendum' : S.gov.type === 'council' ? 'The council' : 'The assembly'}: ${label}, ${yes} for, ${voters.length - yes} against. ${passed ? 'Passed.' : 'Rejected.'}`;
    },
  };
  CC.ACTIONS = A;
  CC.can = function (key, args) {
    if (!S || S.over) return 'The game is over.';
    const a = A[key];
    if (!a) return 'Unknown action.';
    const why = a.check(args || {});
    if (why) return why;
    if (a.ap > S.ap) return a.ap === 1 ? 'No actions left today.' : `Needs ${a.ap} actions.`;
    return null;
  };
  CC.act = function (key, args) {
    const why = CC.can(key, args);
    if (why) return { ok: false, msg: why };
    S.ap -= A[key].ap;
    const msg = A[key].run(args || {});
    if (msg) note(msg);
    if (!S.over) CC.checkEndings();
    return { ok: true, msg };
  };
  CC.setPlatform = function (b, v) {
    if (v) S.platform[b] = v; else delete S.platform[b];
    const p = partyOf(player());
    if (p && p.leader === PLAYER) { if (v) p.stance[b] = v; else delete p.stance[b]; }
  };
  CC.setStanding = function (on) { S.standing = !!on; };

  // ───────────────────────── new games ─────────────────────────
  function baseState(opts) {
    return {
      v: CC.VERSION, rs: (opts.seed >>> 0) || ((Date.now() & 0xffffffff) >>> 0) || 1, day: 0, startDay: 0, name: opts.communeName || 'Container Commune', start: opts.start,
      people: [], laws: [], nextLawId: 1, parties: [], nextPartyId: 1, plots: [], nextPlotId: 1, playerPlot: null, pending: [], nextEventId: 1,
      food: 90, water: 80, materials: 30, treasury: 50, containers: 4, buildings: {}, inst: { police: false, cameras: false },
      gov: { type: 'founder', leader: PLAYER, council: [], term: 24, nextElection: null, conflict: 'newest', gate: 'vetted', tax: 0.1, exempt: false, since: 0, wage: CC.DEFAULT_WAGE, salary: CC.DEFAULT_SALARY, abolished: {} },
      puns: [], nextPunId: 0,
      currency: 'scrip', repealed: [], owned: { aides: 0, guards: false, villa: false, clothes: false }, built: [], otToday: 0,
      legitimacy: 75, attention: 5, exposure: 0, secrets: [], sanctions: false, flags: {}, peakPop: 0,
      ap: 3, apMax: 3, apPenalty: 0, pdid: [], dayNotes: [], platform: {}, standing: false, campaign: 0, rigged: false, addressToday: false, rally: false,
      report: null, chronicle: [], history: [], over: null, lastElection: null,
      stats: { births: 0, deaths: 0, arrivals: 0, departures: 0, executions: 0, laws: 0 },
    };
  }
  function spreadFriends(xs, n) { for (const c of xs) for (let i = 0; i < n; i++) { const d = pick(xs); if (d !== c) CC._people.befriend(c, d); } }
  const ADULT_TRADES = ['gardener', 'gardener', 'gardener', 'cook', 'mechanic', 'labourer', 'labourer', 'medic', 'teacher', 'warden', 'trader', 'artist', 'gardener', 'labourer', 'mechanic', 'cook', 'organiser', 'warden', 'labourer', 'medic', 'teacher', 'trader', 'artist', 'gardener', 'labourer', 'mechanic', 'warden', 'organiser'];
  CC.newGame = function (opts) {
    const s = baseState(opts);
    CC.useState(s);
    const mk = CC._people.makePerson;
    const me = mk({ isPlayer: true, first: opts.first || 'Alex', last: opts.last || 'Rowe', age: 30, trade: 'organiser', traits: [], motive: 'others', accuracy: 70, founder: opts.start === 'found', arrived: 0, scrip: opts.start === 'found' ? 30 : 15, sex: opts.sex || 'm', orient: opts.orient || 'bi' });
    me.needs = { food: 70, water: 70, belonging: 70, freedom: 70, purpose: 70, safety: 70 };
    const founding = opts.start === 'found';
    const nCouples = founding ? 6 : 10, nSingles = founding ? 7 : 9;
    const adults = [];
    let ti = 0;
    for (let i = 0; i < nCouples; i++) {
      const sa = chance(0.5) ? 'm' : 'f', same = chance(0.1);
      const a = mk({ founder: founding || chance(0.6), age: 22 + rnd() * 34, trade: ADULT_TRADES[ti++ % ADULT_TRADES.length], arrived: founding ? 0 : -Math.floor(rnd() * 40) - 25, sex: sa });
      const b = mk({ founder: a.founder, age: clamp(a.age + (rnd() - 0.5) * 10, 19, 80), trade: ADULT_TRADES[ti++ % ADULT_TRADES.length], arrived: a.arrived, sex: same ? sa : sa === 'm' ? 'f' : 'm' });
      a.orient = CC._people.fitOrient(a, b); b.orient = CC._people.fitOrient(a, b);
      CC._people.pair(a, b); adults.push(a, b);
      if (i < (founding ? 3 : 5)) { const kids = 1 + Math.floor(rnd() * 2); for (let k = 0; k < kids; k++) { const kid = CC._people.addChild(a, b, { age: 1 + rnd() * 14, arrived: a.arrived }); kid.founder = a.founder; } }
    }
    for (let i = 0; i < nSingles; i++) {
      const c = mk({ founder: founding || chance(0.5), age: i === 0 ? 67 + rnd() * 6 : 18 + rnd() * 40, trade: ADULT_TRADES[ti++ % ADULT_TRADES.length], arrived: founding ? 0 : -Math.floor(rnd() * 40) - 25 });
      adults.push(c);
    }
    const npcs = S_people().filter((c) => !c.isPlayer);
    spreadFriends(npcs, 2);
    for (const c of npcs) {
      if (founding) { c.opinion = Math.round(25 + rnd() * 35); c.govt = c.opinion; }
      else { c.opinion = Math.round(rnd() * 10); }
      c.age = Math.max(0, c.age);
    }
    if (founding) {
      s.name = opts.communeName || 'The Yard';
      s.buildings = { home: 12, garden: 2, tank: 2, canteen: 1, workshop: 1 };
      s.containers = 4; s.materials = 30; s.food = 90; s.water = 80; s.treasury = 50;
      s.gov.type = 'founder'; s.gov.leader = PLAYER; s.legitimacy = 75;
      for (const c of npcs.slice(0, 6)) CC._people.befriend(c, me);
      log(`You founded ${s.name} with ${npcs.length} others.`, 'politics');
      // the founding constitution costs nothing: it is how the commune starts
      const k = opts.constitution || {};
      if (CC.GOV[k.type]) s.gov.type = k.type;
      if (CC.GATE[k.gate]) s.gov.gate = k.gate;
      if (CC.CONFLICT[k.conflict]) s.gov.conflict = k.conflict;
      for (const f of ['tax', 'wage', 'salary', 'term']) if (typeof k[f] === 'number' && isFinite(k[f])) s.gov[f] = k[f];
      if (typeof k.exempt === 'boolean') s.gov.exempt = k.exempt;
      for (const a of k.abolished || []) if (CC.PUN_CATS[a] && a !== 'warning') { s.gov.abolished[a] = true; if (CC.PUN_CATS[a].base >= 70) s.legitimacy = clamp(s.legitimacy + 2, 0, 100); }
      if (opts.currency) s.currency = cleanCurrency(opts.currency);
      if (s.gov.type === 'council' || s.gov.type === 'assembly') { s.gov.nextElection = Math.min(12, s.gov.term); s.standing = true; s.legitimacy = 82; }
      // a founding council sits until the first election: you and the four settlers who think most of you
      if (s.gov.type === 'council') s.gov.council = [PLAYER, ...npcs.filter((c) => c.age >= 18).sort((a, b) => b.opinion - a.opinion).slice(0, 4).map((c) => c.id)];
      if (s.gov.type === 'dictatorship') { s.legitimacy = 55; for (const c of npcs) if (has(c, 'Idealist') || has(c, 'Rebellious')) { c.opinion -= 20; c.govt = c.opinion; } }
      if (s.gov.exempt) for (const c of npcs) if (!has(c, 'Loyal')) { c.opinion -= 4; c.govt = c.opinion; }
      for (const spec of (opts.laws || []).slice(0, 8)) {
        if (!spec || !BEH[spec.beh] || !RULES[spec.rule] || CC.lawNameIssue(spec.name)) continue;
        const L = CC._laws.buildLaw({ ...spec, by: PLAYER });
        L.from = 0; L.passedDay = 0; L.id = s.nextLawId++; s.laws.push(L); s.stats.laws++;
        log(`Founding law: “${L.name}”. ${CC.describeLaw(L)}`, 'law');
      }
      log(`The founding constitution: ${CC.GOV[s.gov.type].label}; ${CC.GATE[s.gov.gate].toLowerCase()}; work tax ${Math.round(s.gov.tax * 100)}%; ${constLabel({ kind: 'wage', value: s.gov.wage }).toLowerCase()}; ${constLabel({ kind: 'salary', value: s.gov.salary }).toLowerCase()}.`, 'politics');
    } else {
      s.name = opts.communeName || 'Steel Haven';
      s.buildings = { home: 18, garden: 3, tank: 3, canteen: 1, workshop: 1, clinic: 1, school: 1, hall: 1, bar: 1, lockup: 1, post: 1 };
      s.containers = 2; s.materials = 40; s.food = 120; s.water = 110; s.treasury = 90; s.gov.tax = 0.15;
      s.gov.type = 'council'; s.legitimacy = 62; s.attention = 10;
      // three parties
      const P1 = newParty('Order and Supply', null, { work: 0.8, steal: -1, hoard: -0.8, criticise: -0.5, protest: -0.8, uniform: 0.4, weapon: -0.6, report: 0.4, music: -0.6, outside: -0.4 }, 'power');
      const P2 = newParty('The Yard Collective', null, { share: 1, volunteer: 0.8, gather: 0.6, hoard: -0.6, trade: -0.3, report: -0.6, protest: 0.4, criticise: 0.3, weapon: -0.5, child: 0.4 }, 'ideological');
      const P3 = newParty('The Free Containers', null, { music: 0.8, drink: 0.6, gamble: 0.5, trade: 0.8, criticise: 0.6, uniform: -0.8, address: -0.6, report: -0.8, outside: 0.5 }, 'ideological');
      for (const c of npcs.filter((x) => x.age >= 16)) {
        const best = [P1, P2, P3].map((p) => ({ p, a: CC.agreement(c, p.stance) })).sort((a, b) => b.a - a.a)[0];
        if (best.a > 0.1 && chance(0.75)) c.party = best.p.id;
      }
      for (const p of [P1, P2, P3]) {
        let mem = members(p);
        if (mem.length < 2) { for (const c of npcs.filter((x) => x.age >= 18 && x.party == null).slice(0, 3)) c.party = p.id; mem = members(p); }
        const leadC = mem.sort((a, b) => has(b, 'Ambitious') - has(a, 'Ambitious') || b.age - a.age)[0];
        if (leadC) { p.leader = leadC.id; if (p === P1 && !leadC.traits.includes('Paranoid') && chance(0.5)) leadC.traits[1] = 'Paranoid'; }
      }
      // existing laws
      const enactQuiet = (spec) => { const L = CC._laws.buildLaw(spec); L.by = null; L.from = 0; L.passedDay = -20; L.id = s.nextLawId++; s.laws.push(L); };
      enactQuiet({ name: 'Quiet Hours Edict', who: 'everyone', rule: 'ban', beh: 'music', enf: 'wardens', pun: 'fine', by: null });
      enactQuiet({ name: 'Water Discipline', who: 'everyone', rule: 'ration', beh: 'hoard', enf: 'wardens', pun: 'fine', by: null });
      enactQuiet({ name: "Newcomers' Levy", who: 'newcomers', rule: 'tax', beh: 'trade', amount: 3, by: null });
      enactQuiet({ name: 'Respect Order', who: 'everyone', rule: 'ban', beh: 'criticise', enf: 'watch', pun: 'fine', by: null });
      enactQuiet({ name: 'Fair Share Act', who: 'everyone', rule: 'subsidise', beh: 'share', amount: 2, by: null });
      // the council was elected before you arrived
      const R0 = { headlines: [], politics: [], justice: [], life: [], mood: [] };
      s.gov.leader = null;
      runElection(R0);
      s.lastElection.day = -4;
      const chair = P(s.gov.leader);
      for (const c of npcs) c.govt = Math.round((c.party != null && chair && c.party === chair.party ? 35 : (rnd() - 0.5) * 30));
      s.gov.nextElection = 10;
      const host = pick(npcs.filter((c) => c.age >= 18));
      CC._people.befriend(host, me); host.opinion = 30;
      me.arrived = 0;
      log(`You arrived at ${s.name}, invited by ${host.first} ${host.last}.`, 'you');
    }
    s.peakPop = here().length;
    CC.syncBuilt();
    for (const c of here()) for (const L of s.laws) c.lawSupport[L.id] = CC.supportFor(c, L);
    s.report = { day: -1, headlines: [founding ? `Day one. You and ${npcs.length} others have moved into the containers. The yard is yours to shape.` : `You have arrived at ${s.name}, a commune of ${npcs.length}. You are a newcomer: no vote yet in anyone's mind, no friends but ${P(me.friends[0]).first}, and a council that was elected without you.`], justice: [], life: [], politics: [], mood: [], stats: {} };
    return s;
  };
  function S_people() { return S.people; }

  // ───────────────────────── saving ─────────────────────────
  CC.serialize = () => JSON.stringify(S, (k, v) => (k.startsWith('_') ? undefined : v));
  CC.load = (json) => { const s = typeof json === 'string' ? JSON.parse(json) : json; CC.useState(s); migrate(s); return s; };
  // bring a save from an older version up to date
  function migrate(s) {
    if (s.gov.wage == null) s.gov.wage = CC.DEFAULT_WAGE;
    if (s.gov.salary == null) s.gov.salary = CC.DEFAULT_SALARY;
    s.currency = s.currency || 'scrip'; s.repealed = s.repealed || []; s.otToday = s.otToday || 0;
    s.gov.abolished = s.gov.abolished || {}; s.puns = s.puns || []; s.nextPunId = s.nextPunId || 0; CC.registerPunishments(s);
    s.owned = s.owned || { aides: 0, guards: false, villa: false, clothes: false };
    const sexOf = (n) => (CC.FIRST_M.includes(n) ? 'm' : CC.FIRST_F.includes(n) ? 'f' : chance(0.15) ? 'x' : chance(0.5) ? 'm' : 'f');
    for (const c of s.people) { if (!c.extra) c.extra = []; if (c.wage == null) c.wage = 0; if (!c.sex) c.sex = c.isPlayer ? 'm' : sexOf(c.first); }
    for (const c of s.people) {
      if (c.orient) continue;
      const p = c.partner != null ? s.people[c.partner] : null;
      c.orient = c.isPlayer ? 'bi' : p ? CC._people.fitOrient(c, p) : CC._people.randOrient(c.sex);
    }
    if (!s.built || !s.built.length) { s.built = []; }
    CC.syncBuilt();
    s.v = CC.VERSION;
  }
})(typeof window !== 'undefined' ? window : globalThis);
