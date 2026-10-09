/*
  CONTAINER COMMUNE — interface
  Renders the game into the page and turns clicks into game actions. All rules live in
  sim.js and politics.js; this file only reads the state and calls CC.act / CC.endDay.
*/
(() => {
  'use strict';
  const CC = window.CC;
  const KEY = 'container-commune.save.v1';
  let S = null;
  let tab = 'today', selected = 0, peopleFilter = 'all', peopleSort = 'name', chronFilter = 'all', drawerOpen = false;
  const draft = { name: 'Quiet Hours Edict', who: 'everyone', rule: 'ban', beh: 'music', enf: 'watch', pun: 'fine', amount: 3, method: 'firing', setting: 'private' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const P = (id) => (id == null ? null : S.people[id]);
  const alive = (c) => c && (c.status === 'free' || c.status === 'detained');
  const isLeader = () => S.gov.leader === CC.PLAYER;
  const demo = () => CC.GOV[S.gov.type].demo;
  const name = (c) => (!c ? 'nobody' : c.isPlayer ? 'You' : `${c.first} ${c.last}`);
  const party = (id) => S.parties.find((p) => p.id === id && !p.dissolved);
  const R0 = (n) => Math.round(n);

  const CHIP = { work: 'work', study: 'lessons', share: 'sharing food', hoard: 'hoarding water', trade: 'private trade', gather: 'meetings', worship: 'worship', music: 'loud music', drink: 'drinking', gamble: 'gambling', criticise: 'criticism', report: 'informing', steal: 'theft', protest: 'protest', organise: 'party work', weapon: 'weapons', uniform: 'the uniform', address: "leader's address", volunteer: 'care work', outside: 'talking to outsiders', partner: 'partnerships', child: 'having children', leave: 'leaving' };
  const TRADE_COLOR = { gardener: '#3f7a4f', cook: '#c4512b', mechanic: '#5b6670', labourer: '#a8862b', medic: '#2f7f7a', teacher: '#b8892b', warden: '#2f5d8a', organiser: '#7a3b5e', artist: '#a2557c', trader: '#8a6a4a', child: '#8b98a1' };
  const STATUS_WORD = { detained: 'Lock-up', exiled: 'Exiled', executed: 'Executed', fled: 'Left', dead: 'Died', disappeared: 'Disappeared' };

  // ───────────────────────── saving ─────────────────────────
  function save() { try { localStorage.setItem(KEY, CC.serialize()); } catch (e) { /* storage blocked: the game still runs */ } }
  function loadSaved() {
    try { const raw = localStorage.getItem(KEY); if (raw) { S = CC.load(raw); return true; } } catch (e) { /* ignore */ }
    return false;
  }

  // ───────────────────────── toasts ─────────────────────────
  function toast(msg, bad) {
    if (!msg) return;
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), bad ? 3500 : 4500);
  }
  function act(key, args) {
    const res = CC.act(key, args);
    toast(res.msg, !res.ok);
    save(); render();
    if (S.over) showEnd();
    return res;
  }
  // a button that runs an action, disabled with a reason if it can't run
  function abtn(key, args, label, cls) {
    const why = CC.can(key, args);
    const ap = CC.ACTIONS[key].ap;
    const data = esc(JSON.stringify(args || {}));
    return `<button type="button" class="btn ${cls || ''}" data-act="${key}" data-args="${data}"${why ? ` disabled title="${esc(why)}"` : ''}><span>${esc(label || CC.ACTIONS[key].label)}</span>${ap ? `<span class="cost">${ap} AP</span>` : ''}</button>`;
  }

  // ───────────────────────── header ─────────────────────────
  function renderHeader() {
    const cal = CC.calendar();
    $('ver').textContent = `${CC.VERSION} · ${S.name} · Day ${S.day + 1}, ${cal.text}`;
    const pop = S.people.filter(alive).length;
    const days = (stock, per) => Math.floor(stock / Math.max(1, per));
    const ad = S.people.filter(alive);
    const foodPer = ad.reduce((n, c) => n + (c.age < 16 ? 0.6 : 1), 0), waterPer = ad.reduce((n, c) => n + (c.age < 16 ? 0.5 : 0.8), 0);
    const ap = CC.approval(), st = CC.standing(), fe = CC.avgFear();
    const m = [
      ['People', pop, Math.min(100, (pop / Math.max(1, CC.capacityHomes())) * 100), CC.crowding() > 1.15, `${pop} people, homes for ${CC.capacityHomes()}`],
      ['Food', R0(S.food), Math.min(100, (S.food / CC.foodCap()) * 100), days(S.food, foodPer) < 3, `About ${days(S.food, foodPer)} days of food`],
      ['Water', R0(S.water), Math.min(100, (S.water / CC.waterCap()) * 100), days(S.water, waterPer) < 3, `About ${days(S.water, waterPer)} days of water`],
      ['Treasury', R0(S.treasury), Math.max(0, Math.min(100, S.treasury)), S.treasury < 0, 'Scrip in the commune treasury'],
      ['Approval', R0(ap), ap, ap < 35, 'How people feel about the government'],
      ['You', R0(st), st, st < 35, 'How people feel about you personally'],
      ['Fear', R0(fe), fe, false, 'Average fear'],
      ['Legitimacy', R0(S.legitimacy), S.legitimacy, S.legitimacy < 30, 'How rightful the government seems'],
      ['Outside eye', R0(S.attention), S.attention, S.attention > 70, 'How closely the outside world is watching'],
    ];
    let h = m.map(([k, v, w, low, tip]) => `<div class="meter${low ? ' low' : ''}" title="${esc(tip)}"><b>${k}</b><div class="v">${v}</div><div class="bar"><i style="width:${Math.max(0, Math.min(100, w))}%"></i></div></div>`).join('');
    if (S.exposure > 0 || S.secrets.length) h += `<div class="meter secret${S.exposure > 40 ? ' low' : ''}" title="Only you can see this: how close your secrets are to coming out"><b>Exposure</b><div class="v">${R0(S.exposure)}</div><div class="bar"><i style="width:${S.exposure}%"></i></div></div>`;
    $('meters').innerHTML = h;
    $('ap').innerHTML = `ACTIONS ${Array.from({ length: S.apMax }, (_, i) => `<i class="${i < S.ap ? 'on' : ''}"></i>`).join('')}`;
    $('end').disabled = !!S.over;
  }

  // ───────────────────────── tabs ─────────────────────────
  function renderTabs() {
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
      if (b.dataset.tab === 'today') b.innerHTML = `Today${S.pending.length ? `<span class="dot">${S.pending.length}</span>` : ''}`;
    });
  }
  function render() {
    if (!S) return;
    renderHeader(); renderTabs();
    const main = $('main');
    main.innerHTML = ({ today: viewToday, yard: viewPeople, laws: viewLaws, politics: viewPolitics, commune: viewCommune, chronicle: viewChronicle }[tab] || viewToday)();
    wire(main);
    renderDrawer();
  }

  // ───────────────────────── today ─────────────────────────
  function viewToday() {
    const R = S.report;
    let h = '';
    if (S.pending.length) {
      h += `<section class="panel"><h2>Decisions waiting <span class="r">unanswered ones take the first safe option at the end of the day</span></h2><div class="stack">`;
      for (const e of S.pending) {
        const v = CC.eventView(e);
        if (!v) continue;
        h += `<div class="event"><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p><div class="row">${v.options.map((o) => `<button type="button" class="btn${o.key === v.def ? '' : ''}" data-event="${e.id}" data-key="${o.key}">${esc(o.label)}</button>`).join('')}</div></div>`;
      }
      h += '</div></section>';
    }
    h += '<div class="cols">';
    // report
    h += '<section class="panel report"><h2>Report</h2>';
    if (R) {
      h += `<div class="dateline">${R.day < 0 ? 'Day one' : `Day ${R.day + 1}`}</div><p class="muted small" style="margin-bottom:12px">${R.day < 0 ? CC.calendar(0).text : `What happened yesterday · ${CC.calendar(R.day).text}`}</p>`;
      const sec = (title, items, cls) => (items && items.length ? `<h3>${title}</h3><ul class="${cls || ''}">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
      h += sec('Headlines', R.headlines, 'headlines') + sec('Politics', R.politics) + sec('Justice', R.justice) + sec('Life in the yard', R.life) + sec('Mood', R.mood);
      if (R.election) h += `<h3>Election</h3>${electionBars(R.election.results, R.election.type === 'council')}`;
      if (R.stats && R.stats.shifts != null) h += `<p class="muted small" style="margin-top:12px">${R.stats.shifts} work shifts · +${R.stats.food} food · +${R.stats.water} water · +${R.stats.mat} materials · upkeep ${R.stats.upkeep} scrip</p>`;
    }
    h += '</section>';
    // your day
    const me = P(CC.PLAYER);
    h += '<div class="stack">';
    h += `<section class="panel"><h2>Your day <span class="r mono">${S.ap} of ${S.apMax} actions left</span></h2>`;
    if (me.status === 'detained') h += `<p class="lead">You are in the lock-up for ${me.detained} more day${me.detained === 1 ? '' : 's'}. You can only wait.</p>`;
    h += S.dayNotes.length ? `<ul class="notes">${S.dayNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="empty">Nothing yet today. Click anyone in the yard to act on them, or use the buttons below.</p>';
    h += '<div class="quick" style="margin-top:12px">';
    h += abtn('work', {}) + abtn('speak', { tone: 'ideas' }, 'Talk about your ideas') + (isLeader() ? '' : abtn('speak', { tone: 'criticise' }, 'Criticise the government') + abtn('speak', { tone: 'praise' }, 'Praise the government')) + abtn('outsiders', {}, isLeader() ? 'Give an interview' : 'Talk to outsiders');
    if (isLeader()) h += abtn('address', {}) + abtn('festival', {});
    else h += abtn('rally', {});
    if (me.partner != null) h += abtn('child', {});
    h += '</div></section>';
    h += `<section class="panel"><h2>Your situation</h2>${situation()}</section>`;
    h += '</div></div>';
    return h;
  }
  function situation() {
    const me = P(CC.PLAYER);
    const lead = P(S.gov.leader);
    const role = isLeader() ? (demo() ? `Chair of the ${CC.GOV[S.gov.type].label.toLowerCase()}` : S.gov.type === 'founder' ? 'Founder and ruler' : 'Dictator') : S.gov.council.includes(CC.PLAYER) ? 'Councillor' : me.status === 'detained' ? 'Prisoner' : 'Citizen';
    const p = party(me.party);
    const plot = S.playerPlot != null ? S.plots.find((x) => x.id === S.playerPlot) : null;
    let h = '<dl class="kv">';
    h += `<dt>Role</dt><dd><b>${esc(role)}</b></dd>`;
    h += `<dt>Government</dt><dd>${esc(CC.GOV[S.gov.type].label)}${lead && !lead.isPlayer ? `, led by <button type="button" class="linkish" data-person="${lead.id}">${esc(name(lead))}</button>` : ''}</dd>`;
    if (demo() && S.gov.nextElection != null) h += `<dt>Election</dt><dd>${S.gov.nextElection - S.day <= 0 ? 'Tonight' : `In ${S.gov.nextElection - S.day} day${S.gov.nextElection - S.day === 1 ? '' : 's'}`}${S.standing || p ? '' : ' · you are not standing'}</dd>`;
    h += `<dt>Party</dt><dd>${p ? `<span class="chip party" style="--pc:${p.color}">${esc(p.name)}</span>${p.leader === CC.PLAYER ? ' (you lead it)' : ''}` : 'None'}</dd>`;
    h += `<dt>Partner</dt><dd>${me.partner != null ? `<button type="button" class="linkish" data-person="${me.partner}">${esc(name(P(me.partner)))}</button>` : 'None'}${me.children.length ? ` · ${me.children.length} child${me.children.length > 1 ? 'ren' : ''}` : ''}</dd>`;
    h += `<dt>Friends</dt><dd>${me.friends.filter((f) => alive(P(f))).length}</dd>`;
    h += `<dt>Your scrip</dt><dd class="mono">${R0(me.scrip)}</dd>`;
    if (plot) h += `<dt>Your plot</dt><dd>${plot.members.filter((id) => P(id) && P(id).status === 'free').length} plotters · see Politics</dd>`;
    if (me.novote > 0) h += '<dt>Vote</dt><dd>You have lost the vote</dd>';
    h += '</dl>';
    h += `<p class="small muted">${isLeader() ? 'You set the laws. Watch approval and legitimacy: if they fall far enough, someone will try to take the commune from you.' : 'You are not in charge. Win people over, join or found a party, stand for election, or plot.'}</p>`;
    return h;
  }
  function electionBars(results, seats) {
    const max = Math.max(1, ...results.map((r) => r.votes));
    return `<div class="bars">${results.map((r) => `<div class="barrow" style="--pc:${r.color}"><span>${esc(r.name)}</span><div class="b"><i style="width:${(r.votes / max) * 100}%"></i></div><span class="n">${r.votes}${seats ? ` · ${r.seats}s` : ''}</span></div>`).join('')}</div>`;
  }

  // ───────────────────────── people ─────────────────────────
  function viewPeople() {
    const all = S.people.slice();
    const filters = [['all', 'Everyone here'], ['adults', 'Adults'], ['children', 'Children'], ['elders', 'Elders'], ['friends', 'Your friends'], ['council', 'Council'], ['wardens', 'Wardens'], ['detained', 'Lock-up'], ['plot', 'Your plot'], ['gone', 'Gone']];
    for (const p of S.parties.filter((x) => !x.dissolved)) filters.push(['party:' + p.id, p.name]);
    const me = P(CC.PLAYER);
    const test = (c) => {
      const f = peopleFilter;
      if (f === 'gone') return !alive(c);
      if (!alive(c)) return false;
      if (f === 'all') return true;
      if (f === 'adults') return c.age >= 16;
      if (f === 'children') return c.age < 16;
      if (f === 'elders') return c.age >= 65;
      if (f === 'friends') return me.friends.includes(c.id);
      if (f === 'council') return S.gov.council.includes(c.id) || S.gov.leader === c.id;
      if (f === 'wardens') return c.trade === 'warden' && c.age >= 16;
      if (f === 'detained') return c.status === 'detained';
      if (f === 'plot') return S.playerPlot != null && c.plot === S.playerPlot;
      if (f.startsWith('party:')) return c.party === Number(f.slice(6));
      return true;
    };
    let xs = all.filter(test);
    xs.sort((a, b) => (b.isPlayer - a.isPlayer) || (peopleSort === 'opinion' ? b.opinion - a.opinion : peopleSort === 'age' ? b.age - a.age : peopleSort === 'govt' ? a.govt - b.govt : a.first.localeCompare(b.first)));
    let h = `<section class="panel"><h2><span>People</span><span class="r">${xs.length} shown · ${S.people.filter(alive).length} in the commune</span></h2>`;
    h += `<div class="filters">${filters.map(([k, l]) => `<button type="button" class="${peopleFilter === k ? 'on' : ''}" data-pfilter="${esc(k)}">${esc(l)}</button>`).join('')}</div>`;
    h += `<div class="row" style="margin-bottom:12px"><label class="small muted" for="psort">Sort</label><select id="psort" class="plain" style="width:auto">${[['name', 'Name'], ['opinion', 'Likes you most'], ['govt', 'Most against the government'], ['age', 'Oldest']].map(([k, l]) => `<option value="${k}"${peopleSort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
    h += `<div class="people">${xs.map(card).join('') || '<p class="empty">Nobody matches.</p>'}</div></section>`;
    return h;
  }
  function card(c) {
    const p = party(c.party);
    const tags = [];
    if (!c.isPlayer) tags.push(`<span class="chip m-${c.motive}" title="${esc(CC.MOTIVE[c.motive].name)}">${CC.MOTIVE[c.motive].short}</span>`);
    if (p) tags.push(`<span class="chip party" style="--pc:${p.color}" title="${esc(p.name)}">${esc(p.name.replace(/^The /, '').split(' ')[0])}</span>`);
    if (S.gov.leader === c.id) tags.push('<span class="chip warn">Leader</span>');
    else if (S.gov.council.includes(c.id)) tags.push('<span class="chip">Council</span>');
    if (c.partner != null && c.partner === CC.PLAYER) tags.push('<span class="chip good">Partner</span>');
    if (!c.founder && S.day - c.arrived < CC.YEAR && !c.bornHere && !c.isPlayer) tags.push('<span class="chip">New</span>');
    if (S.playerPlot != null && c.plot === S.playerPlot && !c.isPlayer) tags.push('<span class="chip bad">Plotter</span>');
    const did = c.status === 'free' && c.today && c.today.length ? [...new Set(c.today)].map((b) => CC.BEH[b].short).join(' · ') : '';
    const gone = c.status === 'free' ? '' : `<div class="gone">${c.status === 'detained' ? '<span>Lock-up</span>' : STATUS_WORD[c.status] || c.status}</div>`;
    const mini = c.isPlayer ? '' : `<div class="mini"><span>you</span><div class="scale"><i style="left:${(c.opinion + 100) / 2}%"></i></div><span>govt</span><div class="scale"><i style="left:${(regime(c) + 100) / 2}%"></i></div></div>`;
    return `<button type="button" class="box st-${c.status}${c.isPlayer ? ' you' : ''}${selected === c.id ? ' sel' : ''}" data-person="${c.id}" style="--c:${TRADE_COLOR[c.age < 16 ? 'child' : c.trade] || '#777'}" aria-label="${esc(name(c))}">
      <div class="doors"></div><div class="body"><div class="nm">${esc(name(c))}</div><div class="role">${Math.floor(c.age)} · ${c.age < 16 ? 'child' : esc(c.isPlayer ? (isLeader() ? 'leader' : 'citizen') : (CC.TRADES[c.trade] ? CC.TRADES[c.trade].label : c.trade))}${c.retired ? ' (retired)' : ''}</div>
      <div class="tags">${tags.join('')}</div>${mini}<div class="did">${esc(did)}</div></div>${gone}</button>`;
  }
  const regime = (c) => (isLeader() ? c.opinion : c.govt);

  // ───────────────────────── drawer ─────────────────────────
  function renderDrawer() {
    const d = $('drawer');
    const c = P(selected);
    if (!c) { d.innerHTML = ''; return; }
    d.classList.toggle('closed', !drawerOpen && window.matchMedia('(max-width: 1060px)').matches);
    const p = party(c.party);
    const link = (id) => `<button type="button" class="linkish" data-person="${id}">${esc(P(id) ? (P(id).isPlayer ? 'You' : P(id).first) : '?')}</button>`;
    let h = `<button type="button" class="btn small close" data-close="1">Close</button><div class="who"><h3>${esc(name(c))}</h3>`;
    h += `<div class="sub">${Math.floor(c.age)} years old · ${c.age < 16 ? 'child' : c.isPlayer ? (isLeader() ? 'leader' : 'citizen') : esc(CC.TRADES[c.trade] ? CC.TRADES[c.trade].label : c.trade)}${c.founder ? ' · founding member' : ''}${!c.founder && !c.bornHere && S.day - c.arrived < CC.YEAR ? ' · newcomer' : ''}${c.bornHere ? ' · born here' : ''}${c.status !== 'free' ? ` · <b>${esc(STATUS_WORD[c.status] || c.status)}</b>` : ''}</div></div>`;
    h += '<dl class="kv">';
    if (!c.isPlayer) {
      h += `<dt>Motive</dt><dd><b>${esc(CC.MOTIVE[c.motive].name)}.</b> ${esc(CC.MOTIVE[c.motive].blurb)}</dd>`;
      h += `<dt>Accuracy</dt><dd>${c.accuracy} / 100 at reading what others want</dd>`;
      h += `<dt>Traits</dt><dd>${esc(c.traits.join(', '))}</dd>`;
      h += `<dt>Of you</dt><dd>${feel(c.opinion)} <span class="muted mono">(${R0(c.opinion)})</span></dd>`;
      if (!isLeader()) h += `<dt>Of the govt</dt><dd>${feel(c.govt)} <span class="muted mono">(${R0(c.govt)})</span></dd>`;
      h += `<dt>Fear</dt><dd class="mono">${R0(c.fear)}</dd>`;
      h += `<dt>Health</dt><dd class="mono">${R0(c.health)}${c.ill ? ' · ill' : ''}</dd>`;
    }
    h += `<dt>Scrip</dt><dd class="mono">${R0(c.scrip)}</dd>`;
    h += `<dt>Party</dt><dd>${p ? `<span class="chip party" style="--pc:${p.color}">${esc(p.name)}</span>${p.leader === c.id ? ' leader' : ''}` : 'None'}</dd>`;
    const fam = [];
    if (c.partner != null) fam.push(`partner ${link(c.partner)}`);
    if (c.parents.length) fam.push(`parents ${c.parents.map(link).join(', ')}`);
    if (c.children.length) fam.push(`children ${c.children.map(link).join(', ')}`);
    if (fam.length) h += `<dt>Family</dt><dd>${fam.join('<br>')}</dd>`;
    const fr = c.friends.filter((f) => alive(P(f)));
    if (fr.length) h += `<dt>Friends</dt><dd>${fr.map(link).join(', ')}</dd>`;
    if (c.expecting) h += `<dt>Expecting</dt><dd>A child, in ${Math.max(0, c.expecting - S.day)} days</dd>`;
    h += '</dl>';
    if (!c.isPlayer && alive(c)) {
      h += `<div class="needs">${CC.NEEDS.map((n) => `<span>${n[0].toUpperCase() + n.slice(1)}</span><div class="meterbar"><i class="${c.needs[n] < 30 ? 'low' : ''}" style="width:${c.needs[n]}%"></i></div><span class="n">${R0(c.needs[n])}</span>`).join('')}</div>`;
      if (c.age >= 6) h += '<h4>Yesterday</h4><ul>' + (c.status !== 'free' ? '<li>In the lock-up.</li>' : (c.why || []).map(([b, why]) => `<li><b>${esc(CC.BEH[b].short)}</b>${why.length ? ` <span class="why">because ${esc(why.join(', '))}</span>` : ''}</li>`).join('') || '<li class="why">Nothing recorded.</li>') + '</ul>';
      if (S.laws.length && c.age >= 12) h += '<h4>On the laws</h4><ul>' + S.laws.map((L) => { const s = c.lawSupport[L.id] || 0; return `<li>${esc(L.name)}: <b>${s > 40 ? 'strongly for' : s > 0 ? 'for' : s > -40 ? 'against' : 'strongly against'}</b></li>`; }).join('') + '</ul>';
    }
    if (c.history.length) h += '<h4>History</h4><ul>' + c.history.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>';
    if (!c.isPlayer && alive(c)) h += personActions(c);
    d.innerHTML = h;
    wire(d);
  }
  function feel(o) { return o > 40 ? 'Admires' : o > 10 ? 'Likes' : o > -10 ? 'Unsure' : o > -40 ? 'Dislikes' : 'Hates'; }
  function personActions(c) {
    const id = c.id;
    const me = P(CC.PLAYER);
    let h = '<h4>Act</h4><div class="acts">';
    h += '<div class="grp">Personal</div>' + abtn('befriend', { id }) + abtn('help', { id });
    if (c.age >= 18 && c.partner == null && me.partner == null) h += abtn('court', { id });
    if (party(me.party)) h += abtn('invite', { id });
    h += '<div class="grp">In the shadows</div>' + abtn('bribe', { id }) + abtn('threaten', { id }) + abtn('smear', { id });
    if (S.playerPlot != null) h += abtn('recruit', { id });
    if (isLeader()) {
      h += '<div class="grp">As leader</div>';
      if (c.status === 'detained') h += abtn('pardon', { id });
      if (c.trade === 'warden') h += abtn('dismiss', { id }); else if (c.age >= 18) h += abtn('appoint', { id });
      if (c.status === 'free') h += abtn('arrest', { id, how: 'overt' }, 'Have them arrested openly', 'danger') + abtn('arrest', { id, how: 'secret' }, 'Have them taken quietly', 'danger');
      h += abtn('disappear', { id }, null, 'danger');
      if (c.status === 'detained' && !demo()) h += abtn('execute', { id, setting: 'private' }, 'Have them executed in private', 'danger') + abtn('execute', { id, setting: 'public' }, 'Have them executed in public', 'danger');
    }
    h += '</div>';
    return h;
  }

  // ───────────────────────── laws ─────────────────────────
  function viewLaws() {
    let h = '<div class="cols">';
    h += `<section class="panel"><h2>Write a law</h2>${builder()}</section>`;
    h += `<div class="stack"><section class="panel"><h2><span>Statute book</span><span class="r">${S.laws.length} on the books</span></h2>${statute()}</section>`;
    h += `<section class="panel"><h2>Constitution</h2>${constitution()}</section></div>`;
    h += '</div>';
    return h;
  }
  const opt = (pairs, cur) => pairs.map(([k, l, dis]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(l)}</option>`).join('');
  function builder() {
    const B = CC.BEH[draft.beh];
    const rules = CC.rulesFor(draft.beh);
    if (!rules.includes(draft.rule)) draft.rule = rules[0];
    const R = CC.RULES[draft.rule];
    const ruleLabel = (r) => ({ ban: 'may not', require: 'must', ration: B.kind === 'life' ? 'may only once' : 'may only once a day', license: 'need a permit to', tax: 'are taxed when they', subsidise: 'are paid when they', reward: 'are honoured when they' }[r]);
    let s = `<select id="b-who" aria-label="Who">${opt(CC.whoOptions().map((o) => [o.key, o.label]), draft.who)}</select> `;
    s += `<select id="b-rule" aria-label="Rule">${opt(rules.map((r) => [r, ruleLabel(r)]), draft.rule)}</select> `;
    s += `<select id="b-beh" aria-label="Behaviour">${opt(Object.keys(CC.BEH).map((b) => [b, CC.BEH[b].label]), draft.beh)}</select>`;
    if (R.money) s += `, <select id="b-amount" aria-label="Amount">${opt([1, 2, 3, 5, 10].map((n) => [String(n), `${n} scrip`]), String(draft.amount))}</select> a time`;
    if (R.violation) {
      s += `, enforced by <select id="b-enf" aria-label="Enforcement">${opt(Object.entries(CC.ENF).map(([k, v]) => [k, v.label + (v.needs && !S.inst[v.needs] ? ' (not set up)' : '')]), draft.enf)}</select>`;
      s += `, punished by <select id="b-pun" aria-label="Punishment">${opt(Object.entries(CC.PUN).map(([k, v]) => [k, v.label]), draft.pun)}</select>`;
      if (draft.pun === 'execution') s += ` by <select id="b-method" aria-label="Method">${opt(Object.entries(CC.METHODS), draft.method)}</select> <select id="b-setting" aria-label="Where">${opt(Object.entries(CC.SETTINGS), draft.setting)}</select>`;
    }
    s += '.';
    let h = `<label class="field" style="margin-bottom:10px"><span>Name</span><input id="b-name" class="plain" type="text" maxlength="48" value="${esc(draft.name)}"></label>`;
    h += `<div class="sentence">${s}</div>`;
    h += `<div class="forecast">${forecast()}</div>`;
    const label = isLeader() ? (demo() ? `Put it to the ${S.gov.type === 'council' ? 'council' : 'assembly'}` : 'Decree this law') : S.gov.type === 'council' ? 'Ask a councillor to propose it' : S.gov.type === 'assembly' ? 'Put it to the assembly' : 'Petition the ruler';
    h += `<div class="row">${abtn('proposeLaw', { spec: { ...draft } }, label, 'primary')}</div>`;
    const PRE = [
      ['Quiet Hours Edict', { who: 'everyone', rule: 'ban', beh: 'music', enf: 'watch', pun: 'fine' }],
      ['The Kettle Act', { who: 'everyone', rule: 'subsidise', beh: 'share', amount: 2 }],
      ['Water Discipline', { who: 'everyone', rule: 'ration', beh: 'hoard', enf: 'wardens', pun: 'fine' }],
      ['Busy Hands', { who: 'adults', rule: 'require', beh: 'work', enf: 'watch', pun: 'service' }],
      ['Loyalty Order', { who: 'everyone', rule: 'ban', beh: 'criticise', enf: 'wardens', pun: 'detention' }],
      ['One Child Rule', { who: 'everyone', rule: 'ration', beh: 'child', enf: 'wardens', pun: 'bigfine' }],
      ['No One Leaves', { who: 'everyone', rule: 'ban', beh: 'leave', enf: 'wardens', pun: 'longdet' }],
      ['Uniform Code', { who: 'everyone', rule: 'require', beh: 'uniform', enf: 'watch', pun: 'shaming' }],
    ];
    h += `<div class="presets" style="margin-top:12px"><span>Examples:</span>${PRE.map(([n], i) => `<button type="button" data-preset="${i}">${esc(n)}</button>`).join('')}</div>`;
    builder.PRE = PRE;
    return h;
  }
  function forecast() {
    const L = CC._laws.buildLaw({ ...draft, by: S.gov.leader }); L.id = 1e9;
    const live = S.people.filter(alive);
    const affected = live.filter((c) => CC.applies(L, c)).length;
    const adults = live.filter((c) => c.age >= 16 && !c.isPlayer);
    const sup = adults.map((c) => ({ c, s: CC.supportFor(c, L) })).sort((a, b) => a.s - b.s);
    const yes = sup.filter((x) => x.s > 0).length;
    const out = [];
    out.push(`<div>Applies to <b>${affected}</b> ${affected === 1 ? 'person' : 'people'}. Likely backed by <b>${yes} of ${adults.length}</b> adults.${sup.length && sup[0].s < -20 ? ` Strongest against: ${esc(sup[0].c.first)}.` : ''}${sup.length && sup[sup.length - 1].s > 20 ? ` Strongest for: ${esc(sup[sup.length - 1].c.first)}.` : ''}</div>`);
    if (demo()) {
      const v = CC.voteForecast(draft);
      if (v) out.push(`<div>Vote forecast in the ${S.gov.type === 'council' ? 'council' : 'assembly'}: <b>${v.yes} for, ${v.no} against</b>.</div>`);
    }
    if (CC.RULES[draft.rule].violation) {
      const cr = CC.catchRate(L);
      out.push(`<div>Should catch about <b>${R0(cr * 100)}%</b> of law-breakers. ${esc(CC.ENF[draft.enf].note)}</div>`);
      if (CC.ENF[draft.enf].needs && !S.inst[CC.ENF[draft.enf].needs]) out.push(`<div class="warn">You haven't set up ${draft.enf === 'police' ? 'a secret police' : 'a camera network'}, so this would barely be enforced.</div>`);
      if (['torture', 'execution', 'flogging'].includes(draft.pun)) out.push('<div class="warn">A punishment this harsh costs legitimacy the moment it passes, and the outside world will notice when it is used.</div>');
    }
    if (yes / Math.max(1, adults.length) < 0.3) out.push('<div class="warn">Most adults oppose this.</div>');
    if (!affected) out.push('<div class="warn">Nobody it applies to can do this, so it would do nothing.</div>');
    for (const x of CC.conflictsFor(L)) {
      if (x.kind === 'clash') out.push(`<div class="warn"><b>Contradicts “${esc(x.law.name)}”:</b> ${x.group.length} people can't obey both. ${S.gov.conflict === 'both' ? 'The constitution says both apply, so they will be punished whatever they do.' : `${esc(CC.CONFLICT[S.gov.conflict])}, so “${esc(x.winner.id === 1e9 ? draft.name || 'this law' : x.winner.name)}” would bind them.`}</div>`);
      else out.push(`<div>Mixed signals with “${esc(x.law.name)}”.</div>`);
    }
    return out.join('');
  }
  function statute() {
    if (!S.laws.length) return '<p class="empty">No laws. Anything goes.</p>';
    return '<div class="stack">' + S.laws.slice().reverse().map((L) => {
      const p = CC.lawPopularity(L);
      const pending = !CC.active({ ...L, from: L.from }) && S.day < L.from;
      const st = [];
      if (pending) st.push(`<div class="status">Takes effect on day ${L.from + 1}</div>`);
      for (const x of CC.conflictsFor(L).filter((y) => y.kind === 'clash')) {
        if (S.gov.conflict === 'both') st.push(`<div class="status bad">Contradicts “${esc(x.law.name)}”: nobody can obey both</div>`);
        else if (x.winner !== L) st.push(`<div class="status">Overridden by “${esc(x.law.name)}” for ${x.group.length} people</div>`);
      }
      const by = L.by == null ? 'before your time' : L.by === CC.PLAYER ? 'you' : P(L.by) ? P(L.by).first : 'a former leader';
      const yest = !pending && CC.RULES[L.rule].violation ? `<div class="small muted">Yesterday: broken ${L.brokenToday}, caught ${L.caughtToday}. Passed by ${esc(by)}.</div>` : `<div class="small muted">Passed by ${esc(by)}.</div>`;
      const rlabel = isLeader() ? (demo() ? 'Propose repeal' : 'Repeal') : 'Push for repeal';
      return `<article class="law${pending ? ' pending' : ''}"><h3><span>${esc(L.name)}</span>${abtn('repealLaw', { id: L.id }, rlabel, 'small')}</h3><p>${esc(CC.describeLaw(L))}</p><div class="support"><span>${p.pct}% for</span><div class="track" aria-hidden="true"><i style="width:${p.pct}%"></i></div><span>${p.yes}/${p.total}</span></div>${st.join('')}${yest}</article>`;
    }).join('') + '</div>';
  }
  function constitution() {
    const g = S.gov;
    const rows = [
      ['gate', 'Newcomers', Object.entries(CC.GATE), g.gate],
      ['tax', 'Work tax', [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5].map((v) => [String(v), `${R0(v * 100)}%`]), String(g.tax)],
      ['conflict', 'When laws contradict', Object.entries(CC.CONFLICT), g.conflict],
      ['exempt', 'The leader and the law', [['false', 'The leader is bound by the law'], ['true', 'The leader is above the law']], String(g.exempt)],
    ];
    if (demo()) rows.push(['term', 'Elections every', [12, 24, 48].map((v) => [String(v), `${v} days`]), String(g.term)]);
    let h = '<div class="consti">';
    for (const [k, label, opts, cur] of rows) {
      h += `<div class="line"><label class="field"><span>${label}</span><select class="plain" id="c-${k}"${isLeader() ? '' : ' disabled'}>${opt(opts, cur)}</select></label>${isLeader() ? `<button type="button" class="btn" data-const="${k}"${S.ap < 1 ? ' disabled' : ''}>${demo() ? 'Propose' : 'Decree'}<span class="cost">1 AP</span></button>` : ''}</div>`;
    }
    h += '</div>';
    h += `<p class="small muted" style="margin-top:10px">${isLeader() ? (demo() ? 'Changes go to a vote. ' : 'You can decree changes, but unpopular ones cost legitimacy. ') : 'Only the leader can change the constitution. '}New laws take effect the day after they pass.</p>`;
    return h;
  }

  // ───────────────────────── politics ─────────────────────────
  function viewPolitics() {
    let h = '<div class="cols">';
    // government
    const lead = P(S.gov.leader);
    h += `<section class="panel"><h2>Government</h2><dl class="kv"><dt>System</dt><dd><b>${esc(CC.GOV[S.gov.type].label)}</b>. ${esc(CC.GOV[S.gov.type].desc)}</dd>`;
    h += `<dt>Leader</dt><dd>${lead ? (lead.isPlayer ? '<b>You</b>' : `<button type="button" class="linkish" data-person="${lead.id}">${esc(name(lead))}</button>`) : 'Nobody'}${S.gov.since ? `, since day ${S.gov.since + 1}` : ''}</dd>`;
    h += `<dt>Legitimacy</dt><dd class="mono">${R0(S.legitimacy)} / 100</dd>`;
    if (demo()) h += `<dt>Next election</dt><dd>${S.gov.nextElection != null ? `Day ${S.gov.nextElection + 1} (in ${Math.max(0, S.gov.nextElection - S.day)} days)` : 'Not scheduled'}</dd>`;
    h += '</dl>';
    if (S.gov.type === 'council') h += `<div class="sect">Council</div><div class="council">${S.gov.council.map((id) => { const c = P(id); const p = c && party(c.party); return `<button type="button" class="seat" data-person="${id}" style="--pc:${p ? p.color : 'var(--muted)'}"><i></i>${esc(c ? (c.isPlayer ? 'You' : c.first + ' ' + c.last) : '?')}</button>`; }).join('') || '<span class="empty">Not yet elected.</span>'}</div>`;
    if (S.lastElection) h += `<div class="sect" style="margin-top:14px">Last election, day ${S.lastElection.day + 1}</div>${electionBars(S.lastElection.results, S.lastElection.type === 'council')}`;
    if (isLeader()) {
      h += '<div class="sect" style="margin-top:14px">Your powers</div><div class="row">';
      if (demo()) h += abtn('callElection', {}) + abtn('emergency', {}, 'Declare emergency rule', 'danger');
      else h += abtn('restore', { type: 'council' }, 'Restore democracy: a council') + abtn('restore', { type: 'assembly' }, 'Restore democracy: an assembly');
      h += abtn('stepDown', {}) + '</div>';
    }
    h += '</section>';
    // elections
    if (demo()) {
      const fc = CC.electionForecast();
      h += `<section class="panel"><h2>Election forecast</h2>${fc.length ? electionBars(fc.map((r) => ({ ...r })), S.gov.type === 'council') : '<p class="empty">Nobody is standing.</p>'}`;
      h += `<div class="row" style="margin-top:12px"><label class="row small"><input type="checkbox" id="standing"${S.standing ? ' checked' : ''}${party(P(CC.PLAYER).party) ? ' disabled' : ''}> Stand as an independent</label></div>`;
      h += `<p class="small muted" style="margin:6px 0 10px">${party(P(CC.PLAYER).party) ? 'You stand with your party.' : 'Join or found a party to stand on a party list, or stand alone.'} Campaigning works in the last 8 days before a vote.</p>`;
      h += `<div class="row">${abtn('campaign', {})}${abtn('rig', {}, 'Rig the election', 'danger')}</div></section>`;
    }
    // parties
    const me = P(CC.PLAYER);
    const live = S.parties.filter((p) => !p.dissolved);
    h += `<section class="panel"><h2><span>Parties</span><span class="r">${live.length}</span></h2><div class="stack">`;
    for (const p of live) {
      const mem = S.people.filter((c) => alive(c) && c.party === p.id && c.age >= 16);
      const lp = P(p.leader);
      const st = Object.entries(p.stance).filter(([, v]) => Math.abs(v) >= 0.3).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
      h += `<div class="pcard" style="--pc:${p.color}"><div class="spread"><h3>${esc(p.name)}</h3><span class="small muted">${mem.length} member${mem.length === 1 ? '' : 's'}</span></div>`;
      h += `<div class="small">Led by ${lp ? (lp.isPlayer ? '<b>you</b>' : `<button type="button" class="linkish" data-person="${lp.id}">${esc(name(lp))}</button>`) : 'nobody'}${p.motive === 'power' ? ' · in it for power' : ''}</div>`;
      h += `<div class="stance">${st.map(([b, v]) => `<span class="chip ${v > 0 ? 'good' : 'bad'}">${v > 0 ? 'for' : 'against'} ${esc(CHIP[b] || b)}</span>`).join('') || '<span class="small muted">No clear positions.</span>'}</div>`;
      h += `<div class="row">${me.party === p.id ? (p.leader === CC.PLAYER ? '<span class="small muted">You lead this party.</span>' + abtn('leaveParty', {}, 'Leave', 'small') : abtn('challenge', {}, 'Challenge for the leadership', 'small') + abtn('leaveParty', {}, 'Leave', 'small')) : abtn('join', { party: p.id }, 'Join', 'small')}<button type="button" class="btn small" data-pfilter-go="party:${p.id}">Members</button></div></div>`;
    }
    if (!live.length) h += '<p class="empty">No parties yet.</p>';
    h += `</div><div class="sect" style="margin-top:14px">Found a party</div><div class="row"><input id="partyname" class="plain" style="flex:1;min-width:160px" maxlength="32" placeholder="Party name" value="${esc(viewPolitics.pname || '')}"><button type="button" class="btn" id="foundbtn"${CC.can('found', { name: viewPolitics.pname || '' }) ? ` disabled title="${esc(CC.can('found', { name: viewPolitics.pname || '' }))}"` : ''}>Found it<span class="cost">1 AP</span></button></div><p class="small muted" style="margin-top:6px">It takes your platform as its policies.</p></section>`;
    // platform
    const pl = CC.playerStance();
    h += `<section class="panel"><h2>Your platform</h2><p class="small muted" style="margin-bottom:10px">What you stand for. People who agree warm to you when you speak and campaign.${party(me.party) && party(me.party).leader !== CC.PLAYER ? ' Your party has its own platform until you lead it.' : ''}</p><div class="platform">`;
    for (const b of CC.POLICY_BEH) {
      const v = S.platform[b] || 0;
      h += `<span>${esc(CHIP[b] || b)}</span><span class="seg" role="group" aria-label="${esc(CHIP[b])}"><button type="button" class="${v < 0 ? 'on against' : ''}" data-plat="${b}" data-v="-1">Against</button><button type="button" class="${!v ? 'on' : ''}" data-plat="${b}" data-v="0">–</button><button type="button" class="${v > 0 ? 'on for' : ''}" data-plat="${b}" data-v="1">For</button></span>`;
    }
    h += '</div></section>';
    // shadows
    const odds = CC.coupOdds();
    const plot = S.playerPlot != null ? S.plots.find((x) => x.id === S.playerPlot) : null;
    h += `<section class="panel danger-zone"><h2>In the shadows</h2>`;
    h += `<p class="small" style="margin-bottom:8px"><b>Exposure ${R0(S.exposure)} / 100.</b> Bribes, threats, rumours, rigging, secret arrests and plots all raise it. Above 25 there is a growing chance it all comes out.</p>`;
    if (S.secrets.length) h += `<ul class="notes small" style="margin-bottom:10px">${S.secrets.slice(-5).reverse().map((x) => `<li>Day ${x.day + 1}: you ${esc(x.text)}</li>`).join('')}</ul>`;
    if (!isLeader()) {
      if (plot) {
        const mem = plot.members.map(P).filter((c) => c && c.status === 'free');
        h += `<p class="small">Your plot: ${mem.map((c) => (c.isPlayer ? 'you' : `<button type="button" class="linkish" data-person="${c.id}">${esc(c.first)}</button>`)).join(', ')}.</p>`;
        h += `<p class="small" style="margin:6px 0">Your strength <b class="mono">${odds.strength.toFixed(1)}</b> against the government's loyal strength <b class="mono">${odds.security.toFixed(1)}</b>. Wardens count triple; armed people count more.</p>`;
        h += `<div class="row">${abtn('coup', {}, 'Launch the coup', 'danger')}</div><p class="small muted" style="margin-top:6px">Recruit people from their page in the People tab.</p>`;
      } else h += `<div class="row">${abtn('plot', {}, null, 'danger')}</div>`;
    } else {
      h += '<div class="sect">Institutions</div><div class="stack">';
      for (const [k, v] of Object.entries(CC.INSTITUTIONS)) h += `<div class="spread"><span><b>${esc(v.label)}</b> <span class="small muted">${esc(v.desc)} ${v.cost} scrip, then ${v.upkeep} a day.</span></span>${S.inst[k] ? abtn('disband', { inst: k }, 'Disband', 'small') : abtn('establish', { inst: k }, 'Establish', 'small')}</div>`;
      h += '</div>';
    }
    h += `<div class="row" style="margin-top:14px">${abtn('walkAway', {}, isLeader() ? 'Hand over and leave the commune' : 'Leave the commune for good', 'danger small')}</div></section>`;
    h += '</div>';
    return h;
  }

  // ───────────────────────── commune ─────────────────────────
  function viewCommune() {
    let h = '<div class="cols">';
    // map
    let blocks = '';
    for (const [k, n] of Object.entries(S.buildings)) {
      const B = CC.BUILDINGS[k];
      for (let i = 0; i < n; i++) blocks += `<div class="ctr" style="--c:${B.color};width:${B.size * 44 + (B.size - 1) * 4}px;${k === 'clinic' ? 'color:#1b2126;text-shadow:none' : ''}" title="${esc(B.label)}">${esc(B.short || B.label)}</div>`;
    }
    for (let i = 0; i < S.containers; i++) blocks += '<div class="ctr spare" style="width:44px" title="Spare container">spare</div>';
    h += `<section class="panel" style="grid-column:1/-1"><h2><span>The yard</span><span class="r">${CC.containersUsed() + S.containers} containers · homes for ${CC.capacityHomes()} · ${S.people.filter(alive).length} people</span></h2><div class="yardmap">${blocks}</div></section>`;
    // resources and trade
    const pr = CC.price();
    h += `<section class="panel"><h2>Stores and trade</h2><div class="stats" style="margin-bottom:12px">
      <div class="stat"><b>Food</b><span>${R0(S.food)}</span></div><div class="stat"><b>Water</b><span>${R0(S.water)}</span></div><div class="stat"><b>Materials</b><span>${R0(S.materials)}</span></div><div class="stat"><b>Treasury</b><span>${R0(S.treasury)}</span></div><div class="stat"><b>Spare containers</b><span>${S.containers}</span></div><div class="stat"><b>Upkeep / day</b><span>${R0(S._upkeep || 0)}</span></div></div>`;
    if (S.sanctions) h += '<p class="small" style="color:var(--bad);margin-bottom:8px">Sanctions: everything costs 60% more.</p>';
    h += isLeader() ? `<div class="row">${abtn('buyFood', {}, `Buy 10 food (${R0(8 * pr)} scrip)`)}${abtn('buyWater', {}, `Buy 10 water (${R0(5 * pr)} scrip)`)}${abtn('buyContainer', {}, `Buy a container (${R0(20 * pr)} scrip)`)}${abtn('sellMat', {}, `Sell 5 materials (${R0(6 / pr)} scrip)`)}</div>` : '<p class="small muted">Only the leader can trade on behalf of the commune.</p>';
    h += `<p class="small muted" style="margin-top:10px">Work tax ${R0(S.gov.tax * 100)}% · gate: ${esc(CC.GATE[S.gov.gate].toLowerCase())}</p></section>`;
    // history
    h += `<section class="panel"><h2>Over time</h2>${spark()}<div class="stats" style="margin-top:12px"><div class="stat"><b>Births</b><span>${S.stats.births}</span></div><div class="stat"><b>Deaths</b><span>${S.stats.deaths}</span></div><div class="stat"><b>Arrivals</b><span>${S.stats.arrivals}</span></div><div class="stat"><b>Departures</b><span>${S.stats.departures}</span></div><div class="stat"><b>Executions</b><span>${S.stats.executions}</span></div><div class="stat"><b>Laws passed</b><span>${S.stats.laws}</span></div></div></section>`;
    // build
    h += `<section class="panel" style="grid-column:1/-1"><h2><span>Fit out a container</span><span class="r">${S.containers} spare · ${R0(S.materials)} materials</span></h2><div class="builds">`;
    for (const [k, B] of Object.entries(CC.BUILDINGS)) {
      h += `<div class="bcard"><h3><span>${esc(B.label)}</span><span class="mono small">×${S.buildings[k] || 0}</span></h3><p>${esc(B.desc)}</p><p class="mono small">${B.size} container${B.size > 1 ? 's' : ''} · ${B.mat} materials${B.upkeep ? ` · ${B.upkeep}/day` : ''}</p>${isLeader() ? `<div class="row">${abtn('build', { type: k }, 'Build', 'small')}${S.buildings[k] ? abtn('demolish', { type: k }, 'Strip out', 'small') : ''}</div>` : ''}</div>`;
    }
    h += '</div></section></div>';
    return h;
  }
  function spark() {
    const hs = S.history.slice(-120);
    if (hs.length < 2) return '<p class="empty">The chart fills in as days pass.</p>';
    const W = 600, H = 160, pad = 28;
    const maxPop = Math.max(...hs.map((x) => x.pop), 10);
    const X = (i) => pad + (i / (hs.length - 1)) * (W - pad * 2);
    const Yp = (v) => H - pad - (v / maxPop) * (H - pad * 2);
    const Ya = (v) => H - pad - (v / 100) * (H - pad * 2);
    const line = (f, key) => hs.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${f(x[key]).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Population and approval over time">
      <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line)"/>
      <path d="${line(Ya, 'approval')}" fill="none" stroke="var(--blue)" stroke-width="2"/>
      <path d="${line(Ya, 'legitimacy')}" fill="none" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <path d="${line(Yp, 'pop')}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      <text x="${pad}" y="16" font-size="12" fill="var(--accent)" font-family="var(--font-mono)">people (max ${maxPop})</text>
      <text x="${pad + 170}" y="16" font-size="12" fill="var(--blue)" font-family="var(--font-mono)">approval</text>
      <text x="${pad + 260}" y="16" font-size="12" fill="var(--warn)" font-family="var(--font-mono)">legitimacy</text>
      <text x="${pad}" y="${H - 8}" font-size="11" fill="var(--muted)" font-family="var(--font-mono)">day ${hs[0].day + 1}</text>
      <text x="${W - pad}" y="${H - 8}" font-size="11" fill="var(--muted)" text-anchor="end" font-family="var(--font-mono)">day ${hs[hs.length - 1].day + 1}</text></svg>`;
  }

  // ───────────────────────── chronicle ─────────────────────────
  function viewChronicle() {
    const kinds = [['all', 'Everything'], ['politics', 'Politics'], ['election', 'Elections'], ['law', 'Laws'], ['justice', 'Justice'], ['life', 'Love and family'], ['birth', 'Births'], ['death', 'Deaths'], ['arrival', 'Arrivals'], ['depart', 'Departures'], ['scandal', 'Scandals']];
    const xs = S.chronicle.filter((e) => chronFilter === 'all' || e.kind === chronFilter).slice().reverse();
    let h = `<section class="panel"><h2>Chronicle</h2><div class="filters">${kinds.map(([k, l]) => `<button type="button" class="${chronFilter === k ? 'on' : ''}" data-cfilter="${k}">${l}</button>`).join('')}</div>`;
    h += xs.length ? `<ul class="log">${xs.map((e) => `<li class="k-${e.kind}"><span>Day ${e.day + 1}</span><div>${esc(e.text)}</div></li>`).join('')}</ul>` : '<p class="empty">Nothing yet.</p>';
    h += '</section>';
    h += `<section class="panel"><h2>Save</h2><p class="small muted" style="margin-bottom:10px">The game saves itself in this browser after every action. To move a game to another device, copy the save code and paste it there.</p>
      <div class="row" style="margin-bottom:8px"><button type="button" class="btn" id="exportbtn">Show save code</button><button type="button" class="btn" id="importbtn">Load from code</button><button type="button" class="btn danger" id="newbtn">Start a new commune</button></div>
      <textarea id="savecode" class="plain mono" rows="4" placeholder="Save code" style="font-size:11px"></textarea></section>`;
    return h;
  }

  // ───────────────────────── wiring ─────────────────────────
  function wire(root) {
    root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, JSON.parse(b.dataset.args || '{}'))));
    root.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', () => { selected = Number(b.dataset.person); drawerOpen = true; render(); if (window.matchMedia('(max-width: 1060px)').matches) $('drawer').scrollTop = 0; }));
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { drawerOpen = false; selected = window.matchMedia('(max-width: 1060px)').matches ? selected : CC.PLAYER; render(); }));
    root.querySelectorAll('[data-event]').forEach((b) => b.addEventListener('click', () => { const msg = CC.resolveEvent(Number(b.dataset.event), b.dataset.key); toast(msg); save(); render(); if (S.over) showEnd(); }));
    root.querySelectorAll('[data-pfilter]').forEach((b) => b.addEventListener('click', () => { peopleFilter = b.dataset.pfilter; render(); }));
    root.querySelectorAll('[data-pfilter-go]').forEach((b) => b.addEventListener('click', () => { peopleFilter = b.dataset.pfilterGo; tab = 'yard'; render(); }));
    root.querySelectorAll('[data-cfilter]').forEach((b) => b.addEventListener('click', () => { chronFilter = b.dataset.cfilter; render(); }));
    root.querySelectorAll('[data-plat]').forEach((b) => b.addEventListener('click', () => { CC.setPlatform(b.dataset.plat, Number(b.dataset.v)); save(); render(); }));
    const ps = root.querySelector('#psort'); if (ps) ps.addEventListener('change', () => { peopleSort = ps.value; render(); });
    const sd = root.querySelector('#standing'); if (sd) sd.addEventListener('change', () => { CC.setStanding(sd.checked); save(); render(); });
    const pn = root.querySelector('#partyname'); if (pn) pn.addEventListener('input', () => { viewPolitics.pname = pn.value; const fb = root.querySelector('#foundbtn'); const why = CC.can('found', { name: pn.value }); fb.disabled = !!why; fb.title = why || ''; });
    const fb = root.querySelector('#foundbtn'); if (fb) fb.addEventListener('click', () => { act('found', { name: viewPolitics.pname || '' }); viewPolitics.pname = ''; });
    // law builder
    const bind = (id, key, num) => { const el = root.querySelector('#' + id); if (el) el.addEventListener('change', () => { draft[key] = num ? Number(el.value) : el.value; refreshBuilder(); }); };
    bind('b-who', 'who'); bind('b-rule', 'rule'); bind('b-beh', 'beh'); bind('b-amount', 'amount', true); bind('b-enf', 'enf'); bind('b-pun', 'pun'); bind('b-method', 'method'); bind('b-setting', 'setting');
    const bn = root.querySelector('#b-name'); if (bn) bn.addEventListener('input', () => { draft.name = bn.value; const btn = root.querySelector('[data-act="proposeLaw"]'); if (btn) btn.dataset.args = JSON.stringify({ spec: { ...draft } }); });
    root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { const [n, spec] = builder.PRE[Number(b.dataset.preset)]; Object.assign(draft, { amount: 3, enf: 'watch', pun: 'fine', method: 'firing', setting: 'private' }, spec, { name: n }); refreshBuilder(); }));
    root.querySelectorAll('[data-const]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.const; const el = root.querySelector('#c-' + k);
      let v = el.value; if (k === 'tax') v = Number(v); if (k === 'term') v = Number(v); if (k === 'exempt') v = v === 'true';
      act('amend', { change: { kind: k, value: v } });
    }));
    const ex = root.querySelector('#exportbtn'); if (ex) ex.addEventListener('click', () => { const t = root.querySelector('#savecode'); t.value = CC.serialize(); t.select(); try { navigator.clipboard.writeText(t.value).then(() => toast('Save code copied.'), () => toast('Select the text and copy it.')); } catch (e) { toast('Select the text and copy it.'); } });
    const im = root.querySelector('#importbtn'); if (im) im.addEventListener('click', () => { const t = root.querySelector('#savecode'); try { S = CC.load(t.value.trim()); save(); selected = CC.PLAYER; render(); toast('Game loaded.'); } catch (e) { toast("That save code didn't work. Check you copied all of it.", true); } });
    const nb = root.querySelector('#newbtn'); if (nb) nb.addEventListener('click', () => showStart(true));
  }
  function refreshBuilder() {
    const main = $('main');
    const panel = main.querySelector('.panel');
    if (!panel) return render();
    panel.innerHTML = `<h2>Write a law</h2>${builder()}`;
    wire(panel);
  }

  // ───────────────────────── start and end ─────────────────────────
  function showStart(canCancel) {
    const ov = $('overlay');
    let start = 'found';
    ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="st-title">
      <div><p class="small muted mono">GOOSEKNIGHTGAMING · ${CC.VERSION}</p><h2 id="st-title">CONTAINER <span>COMMUNE</span></h2>
      <p class="lead" style="margin-top:8px">A yard of shipping containers has broken away from the country to run itself. Write its laws, live with its people, and keep hold of power, or take it.</p></div>
      <div class="starts">
        <button type="button" class="start on" data-start="found"><h3>Found a commune</h3><p>You lead about two dozen settlers on day one. No laws, no parties. Rule as you like: kindly, harshly, openly or in secret.</p></button>
        <button type="button" class="start" data-start="join"><h3>Join an established commune</h3><p>You arrive as a newcomer in a commune of about 35, with an elected council, three parties and laws already in force. Rise, reform, or overthrow it.</p></button>
      </div>
      <div class="formrow">
        <label class="field"><span>Your first name</span><input class="plain" id="f-first" maxlength="20" value="Alex"></label>
        <label class="field"><span>Your surname</span><input class="plain" id="f-last" maxlength="20" value="Rowe"></label>
        <label class="field"><span>Commune name</span><input class="plain" id="f-commune" maxlength="30" value="The Yard"></label>
      </div>
      <div class="row"><button type="button" class="btn primary big" id="f-go">Begin</button>${canCancel ? '<button type="button" class="btn" id="f-cancel">Back to my game</button>' : ''}</div>
      <p class="small muted">Each day you get three actions. Click people to act on them; write laws in the Laws tab; then end the day and read what happened. The game saves itself in this browser.</p>
    </div>`;
    ov.hidden = false;
    ov.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => {
      start = b.dataset.start;
      ov.querySelectorAll('[data-start]').forEach((x) => x.classList.toggle('on', x === b));
      ov.querySelector('#f-commune').value = start === 'found' ? 'The Yard' : 'Steel Haven';
    }));
    ov.querySelector('#f-go').addEventListener('click', () => {
      S = CC.newGame({ start, first: ov.querySelector('#f-first').value.trim() || 'Alex', last: ov.querySelector('#f-last').value.trim() || 'Rowe', communeName: ov.querySelector('#f-commune').value.trim(), seed: (Date.now() & 0x7fffffff) || 7 });
      tab = 'today'; selected = CC.PLAYER; peopleFilter = 'all';
      ov.hidden = true; save(); render();
    });
    const cancel = ov.querySelector('#f-cancel'); if (cancel) cancel.addEventListener('click', () => { ov.hidden = true; });
    setTimeout(() => ov.querySelector('#f-go').focus(), 50);
  }
  function showEnd() {
    const e = CC.epilogue();
    const ov = $('overlay');
    ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div><p class="small muted mono">THE END · DAY ${S.over.day + 1} · ${esc(e.cal.text.toUpperCase())}</p><h2 id="end-title">${esc(S.over.title.toUpperCase())}</h2><p class="lead" style="margin-top:8px">${esc(S.over.text)}</p></div>
      <div class="stats"><div class="stat"><b>Days</b><span>${e.days}</span></div><div class="stat"><b>Peak population</b><span>${e.peak}</span></div><div class="stat"><b>Still there</b><span>${e.pop}</span></div><div class="stat"><b>Births</b><span>${e.stats.births}</span></div><div class="stat"><b>Deaths</b><span>${e.stats.deaths}</span></div><div class="stat"><b>Executions</b><span>${e.stats.executions}</span></div><div class="stat"><b>Laws passed</b><span>${e.stats.laws}</span></div></div>
      <p>The commune ended as: <b>${esc(e.gov)}</b>, with ${e.laws} law${e.laws === 1 ? '' : 's'} on the books.</p>
      ${e.verdicts.length ? `<ul class="notes">${e.verdicts.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}
      <div class="row"><button type="button" class="btn primary big" id="end-new">Start a new commune</button><button type="button" class="btn" id="end-look">Look around</button></div></div>`;
    ov.hidden = false;
    ov.querySelector('#end-new').addEventListener('click', () => showStart(false));
    ov.querySelector('#end-look').addEventListener('click', () => { ov.hidden = true; });
  }

  // ───────────────────────── boot ─────────────────────────
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); window.scrollTo({ top: 0 }); }));
  $('end').addEventListener('click', () => {
    if (!S || S.over) return;
    const auto = S.pending.length;
    CC.endDay();
    tab = 'today';
    save(); render();
    if (auto) toast(`${auto} decision${auto > 1 ? 's were' : ' was'} made for you.`);
    if (S.over) showEnd();
    window.scrollTo({ top: 0 });
  });
  window.addEventListener('resize', () => { if (S) renderDrawer(); });
  window.ContainerCommune = { get state() { return S; }, render };
  if (loadSaved()) { render(); if (S.over) showEnd(); }
  else { S = CC.newGame({ start: 'found', seed: 2026, first: 'Alex', last: 'Rowe', communeName: 'The Yard' }); render(); showStart(false); }
})();
