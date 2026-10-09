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

  const sub = { laws: 'write', politics: 'gov', commune: 'stores' };
  function subView(t, items, sec) {
    if (!items.some(([k]) => k === sub[t])) sub[t] = items[0][0];
    return `<nav class="subtabs" aria-label="Sections">${items.map(([k, l]) => `<button type="button" class="${k === sub[t] ? 'on' : ''}" data-sub="${t}:${k}" aria-pressed="${k === sub[t]}">${l}</button>`).join('')}</nav><div class="cols">${sec[sub[t]] || ''}</div>`;
  }
  const $ = (id) => document.getElementById(id);
  // the currency can be renamed: every 'scrip' on screen becomes whatever it is called now
  const cur = (t) => { const c = S && S.currency; if (!c || c === 'scrip') return t; return t.replace(/\bscrip\b/gi, (m) => (m[0] === 'S' ? c.charAt(0).toUpperCase() + c.slice(1) : c)); };
  const escRaw = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const esc = (s) => escRaw(cur(String(s == null ? '' : s)));
  const P = (id) => (id == null ? null : S.people[id]);
  const alive = (c) => c && (c.status === 'free' || c.status === 'detained');
  const isLeader = () => S.gov.leader === CC.PLAYER;
  const demo = () => CC.GOV[S.gov.type].demo;
  const name = (c) => (!c ? 'nobody' : c.isPlayer ? 'You' : `${c.first} ${c.last}`);
  const party = (id) => S.parties.find((p) => p.id === id && !p.dissolved);
  const R0 = (n) => Math.round(n);

  const CHIP = CC.NOUN;
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
    t.textContent = cur(msg);
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
      ['Treasury', R0(S.treasury), Math.max(0, Math.min(100, S.treasury)), S.treasury < 0, cur('Scrip in the commune treasury')],
      ['Wallet', R0(P(CC.PLAYER).scrip), Math.max(0, Math.min(100, P(CC.PLAYER).scrip)), false, cur('Your own scrip')],
      ['Approval', R0(ap), ap, ap < 35, 'How people feel about the government'],
      ['You', R0(st), st, st < 35, 'How people feel about you personally'],
      ['Fear', R0(fe), fe, false, 'Average fear'],
      ['Legitimacy', R0(S.legitimacy), S.legitimacy, S.legitimacy < 30, 'How rightful the government seems'],
      ['Outside eye', R0(S.attention), S.attention, S.attention > 70, 'How closely the outside world is watching'],
    ];
    let h = m.map(([k, v, w, low, tip]) => `<div class="meter${low ? ' low' : ''}" title="${esc(tip)}"><b>${k}</b><div class="v">${v}</div><div class="bar"><i style="width:${Math.max(0, Math.min(100, w))}%"></i></div></div>`).join('');
    if (S.exposure > 0 || S.secrets.length) h += `<div class="meter secret${S.exposure > 40 ? ' low' : ''}" title="Only you can see this: how close your secrets are to coming out"><b>Exposure</b><div class="v">${R0(S.exposure)}</div><div class="bar"><i style="width:${S.exposure}%"></i></div></div>`;
    $('meters').innerHTML = h;
    $('ap').innerHTML = `ACTIONS ${Array.from({ length: Math.max(S.apMax, S.ap) }, (_, i) => `<i class="${i < S.ap ? 'on' : ''}${i >= S.apMax ? ' extra' : ''}"></i>`).join('')}`;
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
    main.innerHTML = ({ today: viewToday, yard: viewYard, people: viewPeople, laws: viewLaws, politics: viewPolitics, commune: viewCommune, chronicle: viewChronicle }[tab] || viewToday)();
    wire(main);
    mountYards(main);
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
        const noted = v.options.some((o) => o.note);
        h += `<div class="event${v.proposal ? ' proposal' : ''}"><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p>`;
        h += noted ? `<div class="choices">${v.options.map((o) => `<div class="choice"><button type="button" class="btn${o.key === v.def ? '' : ' primaryish'}" data-event="${e.id}" data-key="${o.key}">${esc(o.label)}</button>${o.note ? `<p>${esc(o.note)}</p>` : ''}</div>`).join('')}</div>`
          : `<div class="row">${v.options.map((o) => `<button type="button" class="btn" data-event="${e.id}" data-key="${o.key}">${esc(o.label)}</button>`).join('')}</div>`;
        h += '</div>';
      }
      h += '</div></section>';
    }
    h += `<section class="panel yardpanel"><h2><span>The yard</span><span class="r"><button type="button" class="linkish" data-tabgo="yard">Open the full map</button></span></h2>${yardBox(true)}</section>`;
    h += '<div class="cols">';
    // report
    h += '<section class="panel report"><h2>Report</h2>';
    if (R) {
      h += `<div class="dateline">${R.day < 0 ? 'Day one' : `Day ${R.day + 1}`}</div><p class="muted small" style="margin-bottom:12px">${R.day < 0 ? CC.calendar(0).text : `What happened yesterday · ${CC.calendar(R.day).text}`}</p>`;
      const sec = (title, items, cls) => (items && items.length ? `<h3>${title}</h3><ul class="${cls || ''}">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
      h += sec('Headlines', R.headlines, 'headlines') + sec('Politics', R.politics) + sec('Justice', R.justice) + sec('Life in the yard', R.life) + sec('Mood', R.mood);
      if (R.election) h += `<h3>Election</h3>${electionBars(R.election.results, R.election.type === 'council')}`;
      if (R.stats && R.stats.shifts != null) h += `<p class="muted small" style="margin-top:12px">${esc(`${R.stats.shifts} work shifts · wages paid ${R.stats.wages || 0} scrip${R.stats.unpaid ? ` · ${R.stats.unpaid} shifts unpaid` : ''} · +${R.stats.food} food · +${R.stats.water} water · +${R.stats.mat} materials · upkeep ${R.stats.upkeep} scrip`)}</p>`;
    }
    h += '</section>';
    // your day
    const me = P(CC.PLAYER);
    h += '<div class="stack">';
    h += `<section class="panel"><h2>Your day <span class="r mono">${S.ap} of ${S.apMax} actions left</span></h2>`;
    if (S.apLost && me.status === 'free') h += `<p class="small warnline">${esc(`You lost ${S.apLost.n} action${S.apLost.n === 1 ? '' : 's'} today: ${S.apLost.why.join(', ')}.`)}</p>`;
    if (me.status === 'detained') h += `<p class="lead">You are in the lock-up for ${me.detained} more day${me.detained === 1 ? '' : 's'}. You can only wait.</p>`;
    h += S.dayNotes.length ? `<ul class="notes">${S.dayNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="empty">Nothing yet today. Click anyone in the yard to act on them, or use the buttons below.</p>';
    h += '<div class="quick" style="margin-top:12px">';
    h += abtn('work', {}) + abtn('speak', { tone: 'ideas' }, 'Talk about your ideas') + (isLeader() ? '' : abtn('speak', { tone: 'criticise' }, 'Criticise the government') + abtn('speak', { tone: 'praise' }, 'Praise the government')) + abtn('outsiders', {}, isLeader() ? 'Give an interview' : 'Talk to outsiders');
    if (isLeader()) h += abtn('address', {}) + abtn('festival', {});
    else h += abtn('rally', {});
    if (me.partner != null) h += abtn('child', {});
    h += '</div></section>';
    h += `<section class="panel"><h2>Your situation</h2>${situation()}</section>`;
    h += `<section class="panel"><h2><span>Your money</span><span class="r mono">${esc(R0(me.scrip) + ' scrip')}</span></h2>${wallet()}</section>`;
    h += '</div></div>';
    return h;
  }
  function wallet() {
    const me = P(CC.PLAYER), o = S.owned || {};
    const inc = [];
    inc.push(`Wages: ${S.gov.wage ? `${R0(S.gov.wage * (1 - S.gov.tax) * 10) / 10} scrip a shift after tax` : 'none'}`);
    if (isLeader()) inc.push(`Salary: ${S.gov.salary} scrip a day`);
    const costs = (o.aides || 0) * CC.SHOP.aide.upkeep + (o.guards ? CC.SHOP.guards.upkeep : 0);
    if (costs) inc.push(`Your staff cost ${costs} scrip a day`);
    let h = `<p class="small muted" style="margin-bottom:10px">${esc(inc.join(' · '))}</p>`;
    const have = [];
    if (o.aides) have.push(`${o.aides} aide${o.aides > 1 ? 's' : ''}`);
    if (o.guards) have.push('bodyguards');
    if (o.villa) have.push('your own container');
    if (o.clothes) have.push('good clothes');
    if (have.length) h += `<p class="small" style="margin-bottom:10px">You have ${esc(have.join(', '))}.</p>`;
    h += '<div class="acts">';
    h += abtn('overtime', {}, `Pay for an extra action today (${CC.otPrice()} scrip)`);
    h += abtn('hireAide', {}, `Hire an aide: +1 action every day (${CC.SHOP.aide.cost}, then ${CC.SHOP.aide.upkeep}/day)`);
    if (o.aides) h += abtn('fireAide', {}, 'Let an aide go', 'small');
    if (!o.guards) h += abtn('guards', {}, `Hire bodyguards (${CC.SHOP.guards.cost}, then ${CC.SHOP.guards.upkeep}/day)`); else h += abtn('dropGuards', {}, 'Dismiss your bodyguards', 'small');
    if (!o.villa) h += abtn('villa', {}, `A container of your own (${CC.SHOP.villa.cost})`);
    if (!o.clothes) h += abtn('clothes', {}, `Good clothes (${CC.SHOP.clothes.cost})`);
    if (S.buildings.bar) h += abtn('round', {});
    if (isLeader()) h += abtn('embezzle', {}, 'Help yourself to the treasury (up to 25)', 'danger');
    h += '</div>';
    h += `<p class="small muted" style="margin-top:8px">${esc('Aides: ' + CC.SHOP.aide.desc + ' Bodyguards: ' + CC.SHOP.guards.desc + ' Your own container: ' + CC.SHOP.villa.desc)} Gifts and bribes are on each person's page.</p>`;
    return h;
  }
  // ───────────────────────── the yard map ─────────────────────────
  function yardBox(compact) {
    return `<div class="yardwrap${compact ? ' compact' : ''}"><canvas class="yardcv" data-yard="${compact ? 'compact' : 'full'}" aria-label="Map of the commune: buildings and people, replaying yesterday"></canvas><div class="ytip" hidden></div></div>`;
  }
  function mountYards(root) {
    if (!window.CCYard) return;
    root.querySelectorAll('canvas[data-yard]').forEach((cv) => {
      window.CCYard.mount(cv, { compact: cv.dataset.yard === 'compact', colors: TRADE_COLOR, selected: selected, tip: cv.parentElement.querySelector('.ytip'), onPick: (id) => { selected = id; drawerOpen = true; renderDrawer(); } });
    });
  }
  function viewYard() {
    let h = `<section class="panel"><h2><span>The yard</span><span class="r">${esc(`${CC.containersUsed() + S.containers} containers · homes for ${CC.capacityHomes()} · ${S.people.filter(alive).length} people`)}</span></h2>`;
    h += `<div class="row yardctl"><button type="button" class="btn small" id="ypause">${window.CCYard && window.CCYard.paused ? 'Play' : 'Pause'}</button><label class="small muted" for="ycolor">Colour people by</label><select id="ycolor" class="plain" style="width:auto">${[['trade', 'Trade'], ['party', 'Party'], ['opinion', 'What they think of you'], ['mood', 'How they are doing']].map(([k, l]) => `<option value="${k}"${window.CCYard && window.CCYard.colorBy === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
    h += yardBox(false);
    h += `<div class="legend small">${legend()}</div>`;
    h += '<p class="small muted" style="margin-top:6px">The map replays yesterday: everyone leaves home at dawn, does their two things, and goes home at dusk. New buildings appear as soon as they are fitted out. Hover for names; click someone to open their page.</p>';
    h += '<div class="small" id="ycensus" style="margin-top:8px"></div></section>';
    return h;
  }
  function legend() {
    const by = window.CCYard ? window.CCYard.colorBy : 'trade';
    let items = [];
    if (by === 'trade') items = Object.entries(TRADE_COLOR).map(([k, c]) => [c, k === 'child' ? 'child' : CC.TRADES[k].label]);
    if (by === 'party') items = S.parties.filter((p) => !p.dissolved).map((p) => [p.color, p.name]).concat([['#9aa3a9', 'no party']]);
    if (by === 'opinion') items = [['var(--good)', 'likes you'], ['#9aa3a9', 'unsure'], ['var(--bad)', 'dislikes you']];
    if (by === 'mood') items = [['var(--good)', 'doing well'], ['var(--warn)', 'getting by'], ['var(--bad)', 'struggling']];
    items.push(['transparent', 'you (ringed)']);
    return items.map(([c, l]) => `<span><i style="background:${c}${c === 'transparent' ? ';border:2px solid var(--accent)' : ''}"></i>${esc(l)}</span>`).join('');
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
    const myP = CC.partnersOf(me).filter((id) => alive(P(id)));
    h += `<dt>Partner${myP.length > 1 ? 's' : ''}</dt><dd>${myP.length ? myP.map((id) => `<button type="button" class="linkish" data-person="${id}">${esc(name(P(id)))}</button>`).join(', ') : 'None'}${me.children.length ? ` · ${me.children.length} child${me.children.length > 1 ? 'ren' : ''}` : ''}</dd>`;
    h += `<dt>Friends</dt><dd>${me.friends.filter((f) => alive(P(f))).length}</dd>`;
    h += `<dt>Your ${esc('scrip')}</dt><dd class="mono">${R0(me.scrip)}</dd>`;
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
    if (CC.partnersOf(c).includes(CC.PLAYER)) tags.push('<span class="chip good">Partner</span>');
    if (!c.founder && S.day - c.arrived < CC.YEAR && !c.bornHere && !c.isPlayer) tags.push('<span class="chip">New</span>');
    if (S.playerPlot != null && c.plot === S.playerPlot && !c.isPlayer) tags.push('<span class="chip bad">Plotter</span>');
    const did = c.status === 'free' && c.today && c.today.length ? [...new Set(c.today)].map((b) => CC.BEH[b].short).join(' · ') : '';
    const gone = c.status === 'free' ? '' : `<div class="gone">${c.status === 'detained' ? '<span>Lock-up</span>' : STATUS_WORD[c.status] || c.status}</div>`;
    const mini = c.isPlayer ? '' : `<div class="mini"><span>you</span><div class="scale"><i style="left:${(c.opinion + 100) / 2}%"></i></div><span>govt</span><div class="scale"><i style="left:${(regime(c) + 100) / 2}%"></i></div></div>`;
    return `<button type="button" class="box st-${c.status}${c.isPlayer ? ' you' : ''}${selected === c.id ? ' sel' : ''}" data-person="${c.id}" style="--c:${TRADE_COLOR[c.age < 16 ? 'child' : c.trade] || '#777'}" aria-label="${esc(name(c))}">
      <div class="doors"></div><div class="body"><div class="nm">${esc(name(c))}</div><div class="role">${Math.floor(c.age)} · ${sexWord(c)} · ${c.age < 16 ? 'child' : esc(c.isPlayer ? (isLeader() ? 'leader' : 'citizen') : (CC.TRADES[c.trade] ? CC.TRADES[c.trade].label : c.trade))}${c.retired ? ' (retired)' : ''}</div>
      <div class="tags">${tags.join('')}</div>${mini}<div class="did">${esc(did)}</div></div>${gone}</button>`;
  }
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const regime = (c) => (isLeader() ? c.opinion : c.govt);
  const leaderIsP = () => S.gov.leader === CC.PLAYER;
  const sexWord = (c) => (c.age < 16 ? (CC.SEX_KID[c.sex] || 'child') : c.trans && c.sex !== 'x' ? 'trans ' + CC.SEX[c.sex] : CC.SEX[c.sex] || '');
  const attractWord = (c) => (c.orient === 'bi' ? 'anyone' : c.orient === 'gay' ? (c.sex === 'm' ? 'men' : c.sex === 'f' ? 'women' : 'people like them') : c.sex === 'm' ? 'women' : c.sex === 'f' ? 'men' : 'anyone');

  // ───────────────────────── drawer ─────────────────────────
  function renderDrawer() {
    const d = $('drawer');
    const c = P(selected);
    if (!c) { d.innerHTML = ''; return; }
    d.classList.toggle('closed', !drawerOpen && window.matchMedia('(max-width: 1060px)').matches);
    const p = party(c.party);
    const link = (id) => `<button type="button" class="linkish" data-person="${id}">${esc(P(id) ? (P(id).isPlayer ? 'You' : P(id).first) : '?')}</button>`;
    let h = `<button type="button" class="btn small close" data-close="1">Close</button><div class="who"><h3>${esc(name(c))}</h3>`;
    h += `<div class="sub">${Math.floor(c.age)} years old · ${c.age >= 16 ? esc(sexWord(c)) + (c.closeted ? ' (not living openly)' : '') + ' · ' : ''}${c.age < 16 ? esc(sexWord(c)) : c.isPlayer ? (isLeader() ? 'leader' : 'citizen') : esc(CC.TRADES[c.trade] ? CC.TRADES[c.trade].label : c.trade)}${c.founder ? ' · founding member' : ''}${!c.founder && !c.bornHere && S.day - c.arrived < CC.YEAR ? ' · newcomer' : ''}${c.bornHere ? ' · born here' : ''}${c.status !== 'free' ? ` · <b>${esc(STATUS_WORD[c.status] || c.status)}</b>` : ''}</div></div>`;
    h += '<dl class="kv">';
    if (!c.isPlayer) {
      h += `<dt>Motive</dt><dd><b>${esc(CC.MOTIVE[c.motive].name)}.</b> ${esc(CC.MOTIVE[c.motive].blurb)}</dd>`;
      h += `<dt>Accuracy</dt><dd>${c.accuracy} / 100 at reading what others want</dd>`;
      h += `<dt>Traits</dt><dd>${esc(c.traits.join(', '))}</dd>`;
      h += `<dt>Of you</dt><dd>${feel(c.opinion)} <span class="muted mono">(${R0(c.opinion)})</span></dd>`;
      if (!isLeader()) h += `<dt>Of the govt</dt><dd>${feel(c.govt)} <span class="muted mono">(${R0(c.govt)})</span></dd>`;
      h += `<dt>Fear</dt><dd class="mono">${R0(c.fear)}</dd>`;
      h += `<dt>Health</dt><dd class="mono">${R0(c.health)}${c.ill ? ' · ill' : ''}</dd>`;
      if (c.age < 16 && c.taught && Object.keys(c.taught).length) h += `<dt>Lessons</dt><dd>${esc(Object.entries(c.taught).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${CC.BEH[k].short.toLowerCase()} (${n} day${n === 1 ? '' : 's'})`).join(', '))}</dd>`;
      if (c.age >= 16) h += `<dt>Drawn to</dt><dd>${esc(attractWord(c))} <span class="muted">(${esc(CC.ORIENT[c.orient])})</span></dd>`;
      if (c.age >= 16 && c.status === 'free') h += `<dt>Wages</dt><dd>${c.unpaid ? '<b>Went unpaid yesterday</b>' : c.wage ? esc(`Earned ${R0(c.wage * 10) / 10} scrip yesterday`) : 'Did no paid work yesterday'}</dd>`;
    }
    h += `<dt>${esc('Scrip')}</dt><dd class="mono">${R0(c.scrip)}</dd>`;
    h += `<dt>Party</dt><dd>${p ? `<span class="chip party" style="--pc:${p.color}">${esc(p.name)}</span>${p.leader === c.id ? ' leader' : ''}` : 'None'}</dd>`;
    const fam = [];
    const ps = CC.partnersOf(c);
    if (ps.length) fam.push(`${ps.length > 1 ? 'partners' : 'partner'} ${ps.map(link).join(', ')}`);
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
    h += '<div class="grp">Personal</div>' + abtn('befriend', { id }) + abtn('help', { id }) + abtn('gift', { id });
    const mine = CC.partnersOf(me);
    if (mine.includes(id)) h += abtn('divorce', { id }, 'End your partnership', 'danger');
    else if (c.age >= 18) h += abtn('court', { id }, mine.length || CC.partnersOf(c).length ? 'Ask them to be another partner' : 'Ask them to be your partner');
    if (party(me.party)) h += abtn('invite', { id });
    h += '<div class="grp">In the shadows</div>' + abtn('bribe', { id }) + abtn('bribe', { id, amt: 30 }, 'Bribe them heavily (30 scrip)') + abtn('threaten', { id }) + abtn('smear', { id });
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
    const sec = {
      write: `<section class="panel wide"><h2>Write a law</h2>${builder()}</section>`,
      book: `<section class="panel wide"><h2><span>Statute book</span><span class="r">${S.laws.length} on the books${(S.repealed || []).length ? ` · ${S.repealed.length} repealed` : ''}</span></h2>${statute()}</section>`,
      punish: punishments(),
      const: `<section class="panel wide"><h2>Constitution</h2>${constitution()}</section>`,
    };
    return subView('laws', [['write', 'Write a law'], ['book', `Statute book <span class="n">${S.laws.length}</span>`], ['punish', 'Punishments'], ['const', 'Constitution']], sec);
  }
  // ───────────────────────── punishments ─────────────────────────
  const inv = { cat: 'execution', name: 'Beheading', part: 'a hand', days: 14, amount: 50, setting: 'public', harsh: 'standard' };
  function punishments() {
    const ab = S.gov.abolished || {};
    const used = (k) => S.laws.filter((L) => L.pun === k && CC.RULES[L.rule].violation).length;
    let h = `<section class="panel wide"><h2><span>Punishments</span><span class="r">${Object.keys(CC.PUN).length} lawful or abolished</span></h2>`;
    h += `<p class="small muted" style="margin-bottom:12px">These are the punishments your laws can use. ${isLeader() ? (demo() ? 'Changes go to a vote, like any amendment.' : 'You can decree changes; unpopular ones cost legitimacy.') : 'Only the leader can change them.'} Abolishing a punishment commutes every law that uses it to the harshest punishment still allowed, and you can no longer order it yourself.</p>`;
    h += '<div class="pungrid">';
    for (const [cat, C] of Object.entries(CC.PUN_CATS)) {
      const keys = Object.keys(CC.PUN).filter((k) => CC.PUN[k].cat === cat).sort((a, b) => CC.PUN[a].sev - CC.PUN[b].sev);
      if (!keys.length && cat === 'warning') continue;
      const off = !!ab[cat];
      h += `<div class="puncat${off ? ' off' : ''}"><div class="spread"><h3>${esc(C.label)}${off ? ' <span class="chip bad">Abolished</span>' : ''}</h3>${C.fixed ? '' : off ? abtn('amend', { change: { kind: 'abolish', value: cat, on: false } }, 'Restore', 'small') : abtn('amend', { change: { kind: 'abolish', value: cat } }, `Abolish all`, 'small danger')}</div>`;
      h += '<ul>';
      for (const k of keys) {
        const D = CC.PUN[k], gone = CC.isAbolished(k), mine = !!ab[k];
        h += `<li class="${gone ? 'off' : ''}"><span class="pname">${esc(D.custom ? D.name : D.label.charAt(0).toUpperCase() + D.label.slice(1))}${D.custom ? ' <span class="chip">yours</span>' : ''}${D.custom && D.setting === 'public' ? ' <span class="chip warn">public</span>' : ''}</span><span class="sev" title="Severity ${D.sev} of 100"><i style="width:${D.sev}%"></i></span><span class="small muted">${used(k) ? `${used(k)} law${used(k) === 1 ? '' : 's'}` : ''}</span>${k === 'warning' || off ? '<span></span>' : mine ? abtn('amend', { change: { kind: 'abolish', value: k, on: false } }, 'Restore', 'small') : abtn('amend', { change: { kind: 'abolish', value: k } }, 'Abolish', 'small')}</li>`;
      }
      h += '</ul></div>';
    }
    h += '</div></section>';
    // invent one
    const x = CC.makePunishment(inv);
    const why = CC.can('amend', { change: { kind: 'newpun', value: x } });
    h += `<section class="panel wide"><h2>Invent a punishment</h2><div class="invent">`;
    h += `<label class="field"><span>Kind</span><select class="plain" id="i-cat">${opt(Object.entries(CC.PUN_CATS).filter(([k]) => k !== 'warning').map(([k, C]) => [k, C.label + (ab[k] ? ' (abolished)' : '')]), inv.cat)}</select></label>`;
    h += `<label class="field"><span>Name it</span><input class="plain" id="i-name" maxlength="40" value="${escRaw(inv.name)}" placeholder="${escRaw({ execution: 'Beheading, the noose, incineration…', torture: 'Thumbscrews, the rack…', corporal: 'The red-hot poker, the birch…', mutilation: 'The cutting', prison: 'The pit, the hole…', humiliation: 'A day in the stocks, head-shaving…', labour: 'Hard labour, the quarry…', fine: 'The great fine', rights: 'Outlawry', exile: 'Banishment' }[inv.cat] || '')}"></label>`;
    if (inv.cat === 'mutilation') h += `<label class="field"><span>Body part</span><select class="plain" id="i-part">${opt(CC.BODY_PARTS.map((b) => [b, b]), inv.part)}</select></label>`;
    if (inv.cat === 'prison' || inv.cat === 'labour') h += `<label class="field"><span>How long</span><select class="plain" id="i-days">${opt([1, 3, 7, 14, 30, 60].map((d) => [String(d), `${d} day${d === 1 ? '' : 's'}`]), String(inv.days))}</select></label>`;
    if (inv.cat === 'fine') h += `<label class="field"><span>Amount</span><select class="plain" id="i-amount">${opt([20, 50, 100, 200].map((d) => [String(d), `${d} scrip`]), String(inv.amount))}</select></label>`;
    if (['execution', 'corporal', 'mutilation', 'torture'].includes(inv.cat)) h += `<label class="field"><span>Carried out</span><select class="plain" id="i-setting">${opt(Object.entries(CC.SETTINGS), inv.setting)}</select></label>`;
    if (inv.cat !== 'execution') h += `<label class="field"><span>Harshness</span><select class="plain" id="i-harsh">${opt([['mild', 'Milder'], ['standard', 'Standard'], ['severe', 'Severe']], inv.harsh)}</select></label>`;
    h += '</div>';
    h += `<p class="lbfull" style="margin-top:12px">A law could say: “…punished by <b>${esc(['execution', 'corporal', 'mutilation'].includes(x.cat) ? `${x.label}, ${CC.SETTINGS[x.setting]}` : x.label)}</b>.” <span class="small muted">Severity ${x.sev} of 100.</span></p>`;
    h += `<div class="row" style="margin-top:10px"><button type="button" class="btn primary" id="i-go"${why ? ` disabled title="${esc(why)}"` : ''}>${demo() ? 'Put it to a vote' : 'Make it lawful'}<span class="cost">1 AP</span></button>${why ? `<span class="small muted">${esc(why)}</span>` : ''}</div>`;
    h += '<p class="small muted" style="margin-top:8px">How it works in the game depends on its kind: executions kill, torture extracts names (true or not), corporal punishment and amputation injure (losing a hand, arm, foot or leg halves someone\u2019s work; losing the tongue silences them), imprisonment locks people up, and so on. Harsh punishments frighten people, cost legitimacy and draw the outside world\u2019s eye.</p></section>';
    return h;
  }
  const opt = (pairs, sel) => pairs.map(([k, l, dis]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(l)}</option>`).join('');
  const WAGES = [0, 1, 2, 3, 4, 5, 8], SALARIES = [0, 2, 5, 10, 20];
  const APPROACH = {
    ban: ['Ban it', 'Anyone who does it can be punished.'],
    require: ['Require it', 'Anyone who doesn’t can be punished.'],
    ration: ['Limit it', 'Allowed, but only so often.'],
    license: ['Permit only', `People need a ${CC.LICENSE_FEE}-scrip permit first.`],
    tax: ['Tax it', 'Allowed, but it costs them each time.'],
    subsidise: ['Pay for it', 'The treasury pays them each time.'],
    reward: ['Honour it', 'Public praise: people feel good about doing it.'],
    discourage: ['Discourage it', 'No punishment; schools are told to avoid it.'],
  };
  function builder() {
    if (CC.isAbolished(draft.pun) || !CC.PUN[draft.pun]) draft.pun = CC.legalPun(CC.PUN[draft.pun] ? draft.pun : 'fine');
    if (!draft.area || !CC.AREAS.some((a) => a.key === draft.area && a.beh.includes(draft.beh))) draft.area = CC.areaOf(draft.beh);
    const area = CC.AREAS.find((a) => a.key === draft.area);
    const B = CC.BEH[draft.beh];
    const rules = CC.rulesFor(draft.beh);
    if (!rules.includes(draft.rule)) draft.rule = rules[0];
    const R = CC.RULES[draft.rule];
    const sub = B.kind === 'subject';
    if (sub) draft.who = 'schools'; else if (draft.who === 'schools') draft.who = 'everyone';
    if (draft.autoName !== false) draft.name = CC.suggestLawName(draft.beh, draft.rule);
    const chip = (attr, val, label, on, title) => `<button type="button" class="lchip${on ? ' on' : ''}" data-${attr}="${esc(val)}" aria-pressed="${on}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
    let h = '<div class="lbgrid"><div class="lb">';
    h += `<div class="lbstep"><div class="lbh"><span class="lbn">1</span>Policy area</div><div class="lchips">${CC.AREAS.map((a) => chip('larea', a.key, a.label, a.key === draft.area, a.desc)).join('')}</div><p class="small muted">${esc(area.desc)}</p></div>`;
    h += `<div class="lbstep"><div class="lbh"><span class="lbn">2</span>About</div><div class="lchips">${area.beh.map((b) => chip('lbeh', b, CC.BEH[b].kind === 'subject' ? CC.BEH[b].short : cap(CHIP[b] || b), b === draft.beh)).join('')}</div></div>`;
    h += `<div class="lbstep"><div class="lbh"><span class="lbn">3</span>What the law does</div><div class="lchips">${rules.map((r) => chip('lrule', r, r === 'subsidise' && draft.beh === 'retire' ? 'Pay a pension' : r === 'reward' && sub ? 'Encourage it' : APPROACH[r][0], r === draft.rule)).join('')}</div><p class="small muted">${esc(draft.rule === 'subsidise' && draft.beh === 'retire' ? 'The treasury pays retired people every day.' : draft.rule === 'reward' && sub ? 'Schools are told to teach it; no punishment.' : APPROACH[draft.rule][1])}</p></div>`;
    h += `<div class="lbstep"><div class="lbh"><span class="lbn">4</span>Who it applies to</div>${sub ? '<p class="small">Schools: the law binds the teachers.</p>' : `<select id="b-who" class="plain" aria-label="Who">${opt(CC.whoOptions().map((o) => [o.key, o.label]), draft.who)}</select>`}</div>`;
    let n = 5;
    if (R.money) h += `<div class="lbstep"><div class="lbh"><span class="lbn">${n++}</span>${draft.rule === 'tax' ? 'Tax' : draft.beh === 'retire' ? 'Pension per day' : 'Payment'}</div><div class="lchips">${[1, 2, 3, 5, 10].map((v) => chip('lamt', v, `${v} scrip`, Number(draft.amount) === v)).join('')}</div></div>`;
    if (R.violation) {
      h += `<div class="lbstep"><div class="lbh"><span class="lbn">${n++}</span>Enforcement and punishment</div><div class="lbpair">`;
      h += `<label class="field"><span>Enforced by</span><select id="b-enf" class="plain">${opt(Object.entries(CC.ENF).map(([k, v]) => [k, v.label + (v.needs && !S.inst[v.needs] ? ' (not set up)' : '')]), draft.enf)}</select></label>`;
      h += `<label class="field"><span>Punished by</span><select id="b-pun" class="plain">${Object.entries(CC.PUN_CATS).map(([cat, C]) => { const ks = Object.keys(CC.PUN).filter((k) => CC.PUN[k].cat === cat && !CC.isAbolished(k)).sort((a, b) => CC.PUN[a].sev - CC.PUN[b].sev); return ks.length ? `<optgroup label="${esc(C.label)}">${opt(ks.map((k) => [k, CC.PUN[k].custom ? CC.PUN[k].name : CC.PUN[k].label]), draft.pun)}</optgroup>` : ''; }).join('')}</select></label>`;
      if (draft.pun === 'execution') h += `<label class="field"><span>Method</span><select id="b-method" class="plain">${opt(Object.entries(CC.METHODS), draft.method)}</select></label><label class="field"><span>Where</span><select id="b-setting" class="plain">${opt(Object.entries(CC.SETTINGS), draft.setting)}</select></label>`;
      h += '</div></div>';
    }
    const issue = CC.lawNameIssue(draft.name);
    h += `<div class="lbstep"><div class="lbh"><span class="lbn">${n++}</span>Name</div><div class="row"><input id="b-name" class="plain${issue ? ' invalid' : ''}" style="flex:1;min-width:180px" type="text" maxlength="48" value="${escRaw(draft.name)}" aria-label="Name of the law" aria-describedby="b-namewarn"${issue ? ' aria-invalid="true"' : ''}><button type="button" class="btn small" id="b-suggest">Suggest a name</button></div><div id="b-namewarn" class="namewarn" role="status"${issue ? '' : ' hidden'}>${esc(issue || '')}</div></div>`;
    h += '</div><div class="lbside">';
    h += `<div class="sentence lbfull"><span class="small muted mono">THE LAW READS</span><br>“${esc(draft.name)}”: ${esc(CC.describeLaw(CC._laws.buildLaw({ ...draft })))}</div>`;
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
      ['Decency Code', { who: 'everyone', rule: 'ban', beh: 'naked', enf: 'watch', pun: 'fine' }],
      ['Free Body Order', { who: 'adults', rule: 'require', beh: 'naked', enf: 'watch', pun: 'warning' }],
      ['Love Is Love Act', { who: 'everyone', rule: 'reward', beh: 'samesex' }],
      ['Natural Family Edict', { who: 'everyone', rule: 'ban', beh: 'samesex', enf: 'wardens', pun: 'detention' }],
      ['Open Hearts Charter', { who: 'adults', rule: 'reward', beh: 'polygamy' }],
      ['Sacred Bond Act', { who: 'everyone', rule: 'ban', beh: 'divorce', enf: 'wardens', pun: 'bigfine' }],
    ];
    h += `<div class="presets" style="margin-top:12px"><span>Or start from an example:</span>${PRE.map(([n], i) => `<button type="button" data-preset="${i}">${esc(n)}</button>`).join('')}</div>`;
    builder.PRE = PRE;
    return h + '</div></div>';
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
      const proposer = isLeader() ? CC.PLAYER : null;
      const v = CC.voteDetail(draft, { proposer, by: CC.PLAYER });
      if (v) out.push(voteBlock(v));
    }
    if (CC.RULES[draft.rule].violation) {
      const cr = CC.catchRate(L);
      out.push(`<div>Should catch about <b>${R0(cr * 100)}%</b> of law-breakers. ${esc(CC.ENF[draft.enf].note)}</div>`);
      if (CC.ENF[draft.enf].needs && !S.inst[CC.ENF[draft.enf].needs]) out.push(`<div class="warn">You haven't set up ${draft.enf === 'police' ? 'a secret police' : 'a camera network'}, so this would barely be enforced.</div>`);
      if (CC.HARSH_CATS.includes(CC.punCat(draft.pun))) out.push('<div class="warn">A punishment this harsh costs legitimacy the moment it passes, and the outside world will notice when it is used.</div>');
    }
    if (yes / Math.max(1, adults.length) < 0.3) out.push('<div class="warn">Most adults oppose this.</div>');
    if (!affected) out.push('<div class="warn">Nobody it applies to can do this, so it would do nothing.</div>');
    for (const x of CC.conflictsFor(L)) {
      if (x.kind === 'clash') out.push(`<div class="warn"><b>Contradicts “${esc(x.law.name)}”:</b> ${x.group.length} people can't obey both. ${S.gov.conflict === 'both' ? 'The constitution says both apply, so they will be punished whatever they do.' : `${esc(CC.CONFLICT[S.gov.conflict])}, so “${esc(x.winner.id === 1e9 ? draft.name || 'this law' : x.winner.name)}” would bind them.`}</div>`);
      else out.push(`<div>Mixed signals with “${esc(x.law.name)}”.</div>`);
    }
    return out.join('');
  }
  // how each councillor (or each party in the assembly) is likely to vote
  function voteBlock(v) {
    let h = `<div><b>${S.gov.type === 'council' ? 'Council' : 'Assembly'} forecast: ${v.yes} for, ${v.no} against${v.youVote ? ', plus your vote' : ''}.</b>`;
    if (v.type === 'council') {
      h += `<ul class="votes">${v.rows.map((r) => r.you ? '<li><span class="vlean you">You</span> <b>You</b> <span class="muted">your vote</span></li>' : `<li><span class="vlean ${r.score > 0 ? 'for' : 'against'}">${esc(r.lean)}</span> <button type="button" class="linkish" data-person="${r.id}">${esc(r.name)}</button>${r.party ? ` <span class="chip party" style="--pc:${r.color}">${esc(r.party.replace(/^The /, '').split(' ')[0])}</span>` : ''}${r.why ? ` <span class="muted">${esc(r.why)}</span>` : ''}</li>`).join('')}</ul>`;
    } else {
      h += `<ul class="votes">${v.groups.map((g) => `<li>${g.color ? `<span class="chip party" style="--pc:${g.color}">${esc(g.name)}</span>` : `<b>${esc(g.name)}</b>`} <span class="mono">${g.yes} for · ${g.no} against</span></li>`).join('')}</ul>`;
    }
    h += '<span class="small muted">A forecast, not a promise: on the day, some people change their minds.</span></div>';
    return h;
  }
  function statute() {
    const gone = (S.repealed || []).slice().reverse();
    const repealedHtml = gone.length ? `<div class="sect" style="margin-top:16px">Repealed</div><div class="stack">${gone.map((L) => {
      const by = L.repealedBy == null ? '' : L.repealedBy === CC.PLAYER ? ' by you' : P(L.repealedBy) ? ' by ' + P(L.repealedBy).first : '';
      return `<article class="law repealed"><div class="stamp" aria-hidden="true">Repealed</div><h3><span>${esc(L.name)}</span></h3><p>${esc(L.text || CC.describeLaw(L))}</p><div class="small muted">In force from day ${L.from + 1}. Repealed on day ${L.repealedDay + 1}${esc(by)}.</div></article>`;
    }).join('')}</div>` : '';
    if (!S.laws.length) return '<p class="empty">No laws. Anything goes.</p>' + repealedHtml;
    return '<div class="stack">' + S.laws.slice().reverse().map((L) => {
      const p = CC.lawPopularity(L);
      const pending = !CC.active({ ...L, from: L.from }) && S.day < L.from;
      const st = [];
      if (pending) st.push(`<div class="status">Takes effect on day ${L.from + 1}</div>`);
      for (const x of CC.conflictsFor(L).filter((y) => y.kind === 'clash')) {
        if (S.gov.conflict === 'both') st.push(`<div class="status bad">Contradicts “${esc(x.law.name)}”: nobody can obey both</div>`);
        else if (x.winner !== L) st.push(`<div class="status">Overridden by “${esc(x.law.name)}” for ${x.group.length} people</div>`);
      }
      const by = (L.by == null ? 'before your time' : L.by === CC.PLAYER ? 'you' : P(L.by) ? P(L.by).first : 'a former leader') + (L.proposedBy != null && L.proposedBy !== L.by && P(L.proposedBy) ? `, proposed by ${P(L.proposedBy).first}` : '');
      const yest = !pending && CC.RULES[L.rule].violation ? `<div class="small muted">Yesterday: broken ${L.brokenToday}, caught ${L.caughtToday}. Passed by ${esc(by)}.</div>` : `<div class="small muted">Passed by ${esc(by)}.</div>`;
      const rlabel = isLeader() ? (demo() ? 'Propose repeal' : 'Repeal') : 'Push for repeal';
      return `<article class="law${pending ? ' pending' : ''}"><h3><span>${esc(L.name)}</span>${abtn('repealLaw', { id: L.id }, rlabel, 'small')}</h3><p>${esc(CC.describeLaw(L))}</p><div class="support"><span>${p.pct}% for</span><div class="track" aria-hidden="true"><i style="width:${p.pct}%"></i></div><span>${p.yes}/${p.total}</span></div>${st.join('')}${yest}</article>`;
    }).join('') + '</div>' + repealedHtml;
  }
  function constitution() {
    const g = S.gov;
    const rows = [
      ['gate', 'Newcomers', Object.entries(CC.GATE), g.gate],
      ['tax', 'Work tax', [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5].map((v) => [String(v), `${R0(v * 100)}%`]), String(g.tax)],
      ['conflict', 'When laws contradict', Object.entries(CC.CONFLICT), g.conflict],
      ['exempt', 'The leader and the law', [['false', 'The leader is bound by the law'], ['true', 'The leader is above the law']], String(g.exempt)],
      ['wage', 'Wage per shift (from the treasury)', WAGES.map((v) => [String(v), v ? `${v} scrip` : 'Unpaid']), String(g.wage)],
      ['salary', "The leader's salary", SALARIES.map((v) => [String(v), v ? `${v} scrip a day` : 'None']), String(g.salary)],
    ];
    if (demo()) rows.push(['term', 'Elections every', [12, 24, 48].map((v) => [String(v), `${v} days`]), String(g.term)]);
    let h = '<div class="consti">';
    for (const [k, label, opts, cur] of rows) {
      h += `<div class="line"><label class="field"><span>${label}</span><select class="plain" id="c-${k}"${isLeader() ? '' : ' disabled'}>${opt(opts, cur)}</select></label>${isLeader() ? `<button type="button" class="btn" data-const="${k}"${S.ap < 1 ? ' disabled' : ''}>${demo() ? 'Propose' : 'Decree'}<span class="cost">1 AP</span></button>` : ''}</div>`;
    }
    h += `<div class="line"><label class="field"><span>Name of the currency</span><input class="plain" id="c-currency" maxlength="20" value="${escRaw(S.currency || 'scrip')}"${isLeader() ? '' : ' disabled'}></label>${isLeader() ? `<button type="button" class="btn" data-const="currency"${S.ap < 1 ? ' disabled' : ''}>${demo() ? 'Propose' : 'Decree'}<span class="cost">1 AP</span></button>` : ''}</div>`;
    h += '</div>';
    h += `<p class="small muted" style="margin-top:10px">${isLeader() ? (demo() ? 'Changes go to a vote. ' : 'You can decree changes, but unpopular ones cost legitimacy. ') : 'Only the leader can change the constitution. '}${esc(`Each shift earns the commune ${CC.SHIFT_VALUE} scrip; wages above that drain the treasury, wages below it fill it.`)} New laws take effect the day after they pass.</p>`;
    return h;
  }

  // ───────────────────────── politics ─────────────────────────
  function viewPolitics() {
    const sec = {};
    let h = '';
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
    sec.gov = h; h = '';
    // parties
    const me = P(CC.PLAYER);
    const live = S.parties.filter((p) => !p.dissolved);
    h += `<section class="panel wide"><h2><span>Parties</span><span class="r">${live.length}</span></h2><div class="pgrid">`;
    for (const p of live) {
      const mem = S.people.filter((c) => alive(c) && c.party === p.id && c.age >= 16);
      const lp = P(p.leader);
      const st = Object.entries(p.stance).filter(([, v]) => Math.abs(v) >= 0.2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      h += `<div class="pcard${p.outlawed ? ' outlawed' : ''}" style="--pc:${p.color}"><div class="spread"><h3>${esc(p.name)}${p.outlawed ? ' <span class="chip bad">Outlawed</span>' : ''}</h3><span class="small muted">${mem.length} member${mem.length === 1 ? '' : 's'}</span></div>`;
      h += `<div class="small">Led by ${lp ? (lp.isPlayer ? '<b>you</b>' : `<button type="button" class="linkish" data-person="${lp.id}">${esc(name(lp))}</button>`) : 'nobody'}${p.motive === 'power' ? ' · in it for power' : ''}</div>`;
      h += `<div class="stance">${st.map(([b, v]) => `<span class="chip ${v > 0 ? 'good' : 'bad'}${Math.abs(v) < 0.5 ? ' lean' : ''}">${Math.abs(v) < 0.5 ? 'leans ' : ''}${v > 0 ? 'for' : 'against'} ${esc(CHIP[b] || b)}</span>`).join('') || '<span class="small muted">No clear positions.</span>'}</div>`;
      h += `<div class="row">${me.party === p.id ? (p.leader === CC.PLAYER ? '<span class="small muted">You lead this party.</span>' + abtn('leaveParty', {}, 'Leave', 'small') + abtn('disbandParty', {}, 'Disband it', 'small danger') : abtn('challenge', {}, 'Challenge for the leadership', 'small') + abtn('leaveParty', {}, 'Leave', 'small')) : abtn('join', { party: p.id }, p.outlawed ? 'Join (illegally)' : 'Join', 'small')}<button type="button" class="btn small" data-pfilter-go="party:${p.id}">Members</button></div>`;
      if (me.party !== p.id && !p.outlawed) {
        const why = CC.can('outlawParty', { party: p.id, pun: 'fine' });
        h += `<div class="row outlaw"><label class="small muted" for="opun-${p.id}">Outlaw it, punishing party work with</label><select class="plain small" id="opun-${p.id}"${why ? ' disabled' : ''}>${opt(Object.keys(CC.PUN).filter((k) => !CC.isAbolished(k)).sort((a, b) => CC.PUN[a].sev - CC.PUN[b].sev).map((k) => [k, CC.PUN[k].custom ? CC.PUN[k].name : CC.PUN[k].label]), CC.legalPun('fine'))}</select><button type="button" class="btn small danger" data-outlaw="${p.id}"${why ? ` disabled title="${esc(why)}"` : ''}>${leaderIsP() && !demo() ? 'Outlaw it' : 'Put it to a vote'}<span class="cost">1 AP</span></button></div>${why ? `<p class="small muted">${esc(why)}</p>` : ''}`;
      }
      h += '</div>';
    }
    if (!live.length) h += '<p class="empty">No parties yet.</p>';
    h += `</div><div class="sect" style="margin-top:14px">Found a party</div><div class="row"><input id="partyname" class="plain" style="flex:1;min-width:160px" maxlength="32" placeholder="Party name" value="${esc(viewPolitics.pname || '')}"><button type="button" class="btn" id="foundbtn"${CC.can('found', { name: viewPolitics.pname || '' }) ? ` disabled title="${esc(CC.can('found', { name: viewPolitics.pname || '' }))}"` : ''}>Found it<span class="cost">1 AP</span></button></div><p class="small muted" style="margin-top:6px">It takes your platform as its policies.</p></section>`;
    sec.parties = h; h = '';
    sec.stance = stanceTable(); h = '';
    // shadows
    const odds = CC.coupOdds();
    const plot = S.playerPlot != null ? S.plots.find((x) => x.id === S.playerPlot) : null;
    h += `<section class="panel danger-zone wide"><h2>In the shadows</h2>`;
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
      for (const [k, v] of Object.entries(CC.INSTITUTIONS)) h += `<div class="spread"><span><b>${esc(v.label)}</b> <span class="small muted">${esc(`${v.desc} ${v.cost} scrip, then ${v.upkeep} a day.`)}</span></span>${S.inst[k] ? abtn('disband', { inst: k }, 'Disband', 'small') : abtn('establish', { inst: k }, 'Establish', 'small')}</div>`;
      h += '</div>';
    }
    h += `<div class="row" style="margin-top:14px">${abtn('walkAway', {}, isLeader() ? 'Hand over and leave the commune' : 'Leave the commune for good', 'danger small')}</div></section>`;
    sec.shadows = h;
    return subView('politics', [['gov', 'Government and elections'], ['parties', `Parties <span class="n">${live.length}</span>`], ['stance', 'Where they stand'], ['shadows', 'In the shadows']], sec);
  }

  // every issue, every party, you and the public
  function stanceTable() {
    const parties = S.parties.filter((p) => !p.dissolved);
    const mine = CC.playerStance() || {};
    const adults = S.people.filter((c) => alive(c) && !c.isPlayer && c.age >= 16);
    const pub = {};
    for (const b of CC.POLICY_BEH) pub[b] = { f: 0, a: 0 };
    for (const c of adults) { const d = CC.desires(c); for (const b of CC.POLICY_BEH) { if ((d[b] || 0) > 0.2) pub[b].f++; else if ((d[b] || 0) < -0.2) pub[b].a++; } }
    const cell = (v) => {
      const k = v >= 0.5 ? 'for' : v >= 0.2 ? 'lfor' : v <= -0.5 ? 'against' : v <= -0.2 ? 'lagainst' : 'neutral';
      const t = { for: 'For', lfor: 'Leans for', neutral: 'Neutral', lagainst: 'Leans against', against: 'Against' }[k];
      return `<td class="st ${k}">${t}</td>`;
    };
    const myParty = party(P(CC.PLAYER).party);
    const canEdit = !myParty || myParty.leader === CC.PLAYER;
    const rows = CC.POLICY_BEH.filter((b) => stanceAll || parties.some((p) => Math.abs(p.stance[b] || 0) >= 0.2) || Math.abs(mine[b] || 0) > 0);
    const groupOf = (b) => ({ day: 'Everyday life', life: 'Life events', subject: 'Schools' }[CC.BEH[b].kind]);
    let h = `<section class="panel wide"><h2><span>Where the parties stand</span><span class="r"><label class="small"><input type="checkbox" id="stanceall"${stanceAll ? ' checked' : ''}> Show every issue</label></span></h2>`;
    if (!stanceAll) h += '<p class="small muted" style="margin-bottom:8px">Showing issues where a party or you have a position. Tick "Show every issue" to set positions on the rest.</p>';
    h += '<div class="tablewrap"><table class="stances"><thead><tr><th scope="col">Issue</th>';
    for (const p of parties) h += `<th scope="col"><span class="pdot" style="--pc:${p.color}"></span>${esc(p.name.replace(/^The /, ''))}${p.outlawed ? ' <span class="muted">(outlawed)</span>' : ''}</th>`;
    h += '<th scope="col">You</th><th scope="col">The public</th></tr></thead><tbody>';
    let last = '';
    for (const b of rows) {
      const g = groupOf(b);
      if (g !== last) { h += `<tr class="grouprow"><th colspan="${parties.length + 3}">${g}</th></tr>`; last = g; }
      const pu = pub[b], tot = Math.max(1, adults.length);
      const v = mine[b] || 0;
      const youCell = canEdit ? `<td class="st ${v > 0 ? 'for' : v < 0 ? 'against' : 'neutral'}"><button type="button" class="platbtn" data-platc="${b}" data-v="${v}" title="Click to change">${v > 0 ? 'For' : v < 0 ? 'Against' : 'Neutral'}</button></td>` : cell(v);
      h += `<tr><th scope="row">${esc(CHIP[b] || b)}</th>${parties.map((p) => cell(p.stance[b] || 0)).join('')}${youCell}<td class="pub"><span class="pbar"><i class="f" style="width:${(pu.f / tot) * 100}%"></i><i class="a" style="width:${(pu.a / tot) * 100}%"></i></span><span class="mono small">${R0((pu.f / tot) * 100)}% for · ${R0((pu.a / tot) * 100)}% against</span></td></tr>`;
    }
    h += '</tbody></table></div>';
    h += `<p class="small muted" style="margin-top:8px">${canEdit ? 'The You column is your platform: click a cell to switch between For, Against and Neutral. People who agree warm to you when you speak and campaign, and a party you found takes it as its policies. ' : 'You follow your party\u2019s platform until you lead it. '}Party positions drift towards what their members want, unless you lead the party. "The public" is how many adults want more or less of each thing, whatever the law says.</p></section>`;
    return h;
  }
  let stanceAll = false;
  // ───────────────────────── commune ─────────────────────────
  function viewCommune() {
    const sec = {};
    let h = '';
    // map
    h += `<section class="panel" style="grid-column:1/-1"><h2><span>The yard</span><span class="r">${CC.containersUsed() + S.containers} containers · homes for ${CC.capacityHomes()} · ${S.people.filter(alive).length} people</span></h2>${yardBox(true)}</section>`;
    // resources and trade
    const pr = CC.price();
    h += `<section class="panel"><h2>Stores and trade</h2><div class="stats" style="margin-bottom:12px">
      <div class="stat"><b>Food</b><span>${R0(S.food)}</span></div><div class="stat"><b>Water</b><span>${R0(S.water)}</span></div><div class="stat"><b>Materials</b><span>${R0(S.materials)}</span></div><div class="stat"><b>Treasury</b><span>${R0(S.treasury)}</span></div><div class="stat"><b>Spare containers</b><span>${S.containers}</span></div><div class="stat"><b>Upkeep / day</b><span>${R0(S._upkeep || 0)}</span></div></div>`;
    if (S.sanctions) h += '<p class="small" style="color:var(--bad);margin-bottom:8px">Sanctions: everything costs 60% more.</p>';
    h += isLeader() ? `<div class="row">${abtn('buyFood', {}, `Buy 10 food (${R0(8 * pr)} scrip)`)}${abtn('buyWater', {}, `Buy 10 water (${R0(5 * pr)} scrip)`)}${abtn('buyContainer', {}, `Buy a container (${R0(20 * pr)} scrip)`)}${abtn('sellMat', {}, `Sell 5 materials (${R0(6 / pr)} scrip)`)}</div>` : '<p class="small muted">Only the leader can trade on behalf of the commune.</p>';
    const lastR = S.report && S.report.stats ? S.report.stats : {};
    h += `<p class="small muted" style="margin-top:10px">${esc(`Wage ${S.gov.wage} scrip a shift · work tax ${R0(S.gov.tax * 100)}% · leader's salary ${S.gov.salary} a day · yesterday's wage bill ${lastR.wages || 0}${lastR.unpaid ? `, ${lastR.unpaid} shifts unpaid` : ''} · gate: ${CC.GATE[S.gov.gate].toLowerCase()}`)}</p></section>`;
    // history
    h += `<section class="panel"><h2>Over time</h2>${spark()}<div class="stats" style="margin-top:12px"><div class="stat"><b>Births</b><span>${S.stats.births}</span></div><div class="stat"><b>Deaths</b><span>${S.stats.deaths}</span></div><div class="stat"><b>Arrivals</b><span>${S.stats.arrivals}</span></div><div class="stat"><b>Departures</b><span>${S.stats.departures}</span></div><div class="stat"><b>Executions</b><span>${S.stats.executions}</span></div><div class="stat"><b>Laws passed</b><span>${S.stats.laws}</span></div></div></section>`;
    sec.stores = h; h = '';
    // build
    h += `<section class="panel wide"><h2><span>Fit out a container</span><span class="r">${S.containers} spare · ${R0(S.materials)} materials</span></h2><div class="builds">`;
    for (const [k, B] of Object.entries(CC.BUILDINGS)) {
      h += `<div class="bcard"><h3><span>${esc(B.label)}</span><span class="mono small">×${S.buildings[k] || 0}</span></h3><p>${esc(B.desc)}</p><p class="mono small">${B.size} container${B.size > 1 ? 's' : ''} · ${B.mat} materials${B.upkeep ? ` · ${B.upkeep}/day` : ''}</p>${isLeader() ? `<div class="row">${abtn('build', { type: k }, 'Build', 'small')}${S.buildings[k] ? abtn('demolish', { type: k }, 'Strip out', 'small') : ''}</div>` : ''}</div>`;
    }
    h += '</div></section>';
    sec.build = h;
    sec.schools = schoolsPanel();
    return subView('commune', [['stores', 'The yard and stores'], ['build', 'Build'], ['schools', 'Schools']], sec);
  }
  function schoolsPanel() {
    const teachers = S.people.filter((c) => c.status === 'free' && c.trade === 'teacher' && c.age >= 16).length;
    const kids = S.people.filter((c) => alive(c) && c.age >= 6 && c.age < 16).length;
    let h = `<section class="panel wide"><h2><span>Schools</span><span class="r">${teachers} teacher${teachers === 1 ? '' : 's'} · ${kids} school-age child${kids === 1 ? '' : 'ren'}${S.buildings.school ? ' · a school' : ' · no school building'}</span></h2><ul class="subjects">`;
    for (const sub of CC.SUBJECTS) {
      const L = CC.subjectLaw(sub);
      const law = L ? { require: 'Compulsory', ban: 'Banned', reward: 'Encouraged', discourage: 'Discouraged' }[L.rule] : 'Up to teachers';
      const t = S.taught ? S.taught[sub] : null;
      h += `<li><span>${esc(CC.BEH[sub].short)}</span><span class="chip${L ? (L.rule === 'ban' ? ' bad' : L.rule === 'require' ? ' good' : ' warn') : ''}">${law}</span><span class="small ${t ? '' : 'muted'}">${t == null ? '' : t ? 'taught yesterday' : 'not taught yesterday'}</span></li>`;
    }
    h += '</ul><p class="small muted" style="margin-top:8px">Write laws on what schools teach in the Laws tab ("What schools teach"). Teachers who disagree with the law may defy it. What children learn shapes who they become at 16.</p></section>';
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
    root.querySelectorAll('[data-pfilter-go]').forEach((b) => b.addEventListener('click', () => { peopleFilter = b.dataset.pfilterGo; tab = 'people'; render(); }));
    root.querySelectorAll('[data-tabgo]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tabgo; render(); window.scrollTo({ top: 0 }); }));
    const yp = root.querySelector('#ypause'); if (yp) yp.addEventListener('click', () => { window.CCYard.setPaused(!window.CCYard.paused); yp.textContent = window.CCYard.paused ? 'Play' : 'Pause'; });
    const yc = root.querySelector('#ycolor'); if (yc) yc.addEventListener('change', () => { window.CCYard.setColorBy(yc.value); const lg = root.querySelector('.legend'); if (lg) lg.innerHTML = legend(); });
    root.querySelectorAll('[data-cfilter]').forEach((b) => b.addEventListener('click', () => { chronFilter = b.dataset.cfilter; render(); }));
    root.querySelectorAll('[data-plat]').forEach((b) => b.addEventListener('click', () => { CC.setPlatform(b.dataset.plat, Number(b.dataset.v)); save(); render(); }));
    root.querySelectorAll('[data-outlaw]').forEach((b) => b.addEventListener('click', () => { const id = Number(b.dataset.outlaw); const sel = root.querySelector('#opun-' + id); act('outlawParty', { party: id, pun: sel ? sel.value : 'fine' }); }));
    root.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { const [t, k] = b.dataset.sub.split(':'); sub[t] = k; render(); }));
    root.querySelectorAll('[data-platc]').forEach((b) => b.addEventListener('click', () => { const v = Number(b.dataset.v); CC.setPlatform(b.dataset.platc, v === 0 ? 1 : v > 0 ? -1 : 0); save(); render(); }));
    const ibind = (id, key, num) => { const el = root.querySelector('#' + id); if (el) el.addEventListener('change', () => { inv[key] = num ? Number(el.value) : el.value; render(); }); };
    const icat = root.querySelector('#i-cat'); if (icat) icat.addEventListener('change', () => { inv.cat = icat.value; inv.name = ''; render(); }); ibind('i-part', 'part'); ibind('i-days', 'days', true); ibind('i-amount', 'amount', true); ibind('i-setting', 'setting'); ibind('i-harsh', 'harsh');
    const iname = root.querySelector('#i-name'); if (iname) iname.addEventListener('change', () => { inv.name = iname.value; render(); });
    const igo = root.querySelector('#i-go'); if (igo) igo.addEventListener('click', () => { const nm2 = root.querySelector('#i-name'); if (nm2) inv.name = nm2.value; act('amend', { change: { kind: 'newpun', value: CC.makePunishment(inv) } }); });
    const sa = root.querySelector('#stanceall'); if (sa) sa.addEventListener('change', () => { stanceAll = sa.checked; render(); });
    const ps = root.querySelector('#psort'); if (ps) ps.addEventListener('change', () => { peopleSort = ps.value; render(); });
    const sd = root.querySelector('#standing'); if (sd) sd.addEventListener('change', () => { CC.setStanding(sd.checked); save(); render(); });
    const pn = root.querySelector('#partyname'); if (pn) pn.addEventListener('input', () => { viewPolitics.pname = pn.value; const fb = root.querySelector('#foundbtn'); const why = CC.can('found', { name: pn.value }); fb.disabled = !!why; fb.title = why || ''; });
    const fb = root.querySelector('#foundbtn'); if (fb) fb.addEventListener('click', () => { act('found', { name: viewPolitics.pname || '' }); viewPolitics.pname = ''; });
    // law builder
    const bind = (id, key, num) => { const el = root.querySelector('#' + id); if (el) el.addEventListener('change', () => { draft[key] = num ? Number(el.value) : el.value; refreshBuilder(); }); };
    bind('b-who', 'who'); bind('b-enf', 'enf'); bind('b-pun', 'pun'); bind('b-method', 'method'); bind('b-setting', 'setting');
    root.querySelectorAll('[data-larea]').forEach((b) => b.addEventListener('click', () => { const a = CC.AREAS.find((x) => x.key === b.dataset.larea); draft.area = a.key; if (!a.beh.includes(draft.beh)) draft.beh = a.beh[0]; refreshBuilder(); }));
    root.querySelectorAll('[data-lbeh]').forEach((b) => b.addEventListener('click', () => { draft.beh = b.dataset.lbeh; refreshBuilder(); }));
    root.querySelectorAll('[data-lrule]').forEach((b) => b.addEventListener('click', () => { draft.rule = b.dataset.lrule; refreshBuilder(); }));
    root.querySelectorAll('[data-lamt]').forEach((b) => b.addEventListener('click', () => { draft.amount = Number(b.dataset.lamt); refreshBuilder(); }));
    const sg = root.querySelector('#b-suggest'); if (sg) sg.addEventListener('click', () => { draft.autoName = true; refreshBuilder(); });
    const bn = root.querySelector('#b-name'); if (bn) bn.addEventListener('input', () => {
      draft.name = bn.value; draft.autoName = false;
      const issue = CC.lawNameIssue(draft.name);
      bn.classList.toggle('invalid', !!issue); if (issue) bn.setAttribute('aria-invalid', 'true'); else bn.removeAttribute('aria-invalid');
      const w = root.querySelector('#b-namewarn'); if (w) { w.hidden = !issue; w.textContent = issue || ''; }
      const btn = root.querySelector('[data-act="proposeLaw"]');
      if (btn) { btn.dataset.args = JSON.stringify({ spec: { ...draft } }); const why = CC.can('proposeLaw', { spec: { ...draft } }); btn.disabled = !!why; if (why) btn.title = why; else btn.removeAttribute('title'); }
    });
    root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { const [n, spec] = builder.PRE[Number(b.dataset.preset)]; Object.assign(draft, { amount: 3, enf: 'watch', pun: 'fine', method: 'firing', setting: 'private' }, spec, { name: CC.lawNameIssue(n) ? CC.uniqueLawName(n) : n, autoName: false, area: CC.areaOf(spec.beh) }); refreshBuilder(); }));
    root.querySelectorAll('[data-const]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.const; const el = root.querySelector('#c-' + k);
      let v = el.value; if (k === 'tax' || k === 'term' || k === 'wage' || k === 'salary') v = Number(v); if (k === 'exempt') v = v === 'true';
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
  // the laws you can choose to found the commune with, at no cost
  const FOUNDING_LAWS = [
    ['The Kettle Act', { who: 'everyone', rule: 'subsidise', beh: 'share', amount: 2 }, 'Pay people to share food'],
    ['Water Discipline', { who: 'everyone', rule: 'ration', beh: 'hoard', enf: 'watch', pun: 'fine' }, 'Extra water only once a day'],
    ['Quiet Hours Edict', { who: 'everyone', rule: 'ban', beh: 'music', enf: 'watch', pun: 'fine' }, 'No loud music after dark'],
    ['Busy Hands', { who: 'adults', rule: 'require', beh: 'work', enf: 'watch', pun: 'service' }, 'Every adult works every day'],
    ['Schooling Act', { who: 'children', rule: 'require', beh: 'study', enf: 'watch', pun: 'warning' }, 'Children must attend lessons'],
    ['Property Act', { who: 'everyone', rule: 'ban', beh: 'steal', enf: 'watch', pun: 'service' }, 'No theft'],
    ['Disarmament Rule', { who: 'everyone', rule: 'ban', beh: 'weapon', enf: 'watch', pun: 'confiscate' }, 'No weapons'],
    ['Decency Code', { who: 'everyone', rule: 'ban', beh: 'naked', enf: 'watch', pun: 'fine' }, 'Clothes on in the yard'],
    ['Free Body Order', { who: 'adults', rule: 'require', beh: 'naked', enf: 'watch', pun: 'warning' }, 'Adults go naked every day'],
    ['Love Is Love Act', { who: 'everyone', rule: 'reward', beh: 'samesex' }, 'Honour same-sex partnerships'],
    ['Natural Family Edict', { who: 'everyone', rule: 'ban', beh: 'samesex', enf: 'watch', pun: 'detention' }, 'Outlaw same-sex relationships'],
    ['Sacred Bond Act', { who: 'everyone', rule: 'ban', beh: 'divorce', enf: 'watch', pun: 'bigfine' }, 'Outlaw divorce'],
    ['One Partner Rule', { who: 'everyone', rule: 'ban', beh: 'polygamy', enf: 'watch', pun: 'fine' }, 'One partner each'],
    ['Open Hearts Charter', { who: 'adults', rule: 'reward', beh: 'polygamy' }, 'Honour taking more than one partner'],
    ['Stay Put Order', { who: 'everyone', rule: 'ban', beh: 'leave', enf: 'watch', pun: 'detention' }, 'Nobody leaves'],
    ['Free Speech Charter', { who: 'everyone', rule: 'reward', beh: 'criticise' }, 'Honour criticism of the government'],
  ];
  function showStart(canCancel) {
    const ov = $('overlay');
    let start = 'found';
    const me = { first: 'Alex', last: 'Rowe', sex: 'm', orient: 'bi', commune: 'The Yard' };
    const k = { type: 'founder', gate: 'vetted', tax: 0.1, wage: CC.DEFAULT_WAGE, salary: CC.DEFAULT_SALARY, conflict: 'newest', exempt: false, term: 24, currency: 'scrip', laws: [], abolished: [] };
    const step1 = () => {
      ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="st-title">
      <div><p class="small muted mono">GOOSEKNIGHTGAMING · ${CC.VERSION}</p><h2 id="st-title">CONTAINER <span>COMMUNE</span></h2>
      <p class="lead" style="margin-top:8px">A yard of shipping containers has broken away from the country to run itself. Write its laws, live with its people, and keep hold of power, or take it.</p></div>
      <div class="starts">
        <button type="button" class="start${start === 'found' ? ' on' : ''}" data-start="found"><h3>Found a commune</h3><p>You lead about two dozen settlers on day one. Write the founding constitution for free, then rule as you like: kindly, harshly, openly or in secret.</p></button>
        <button type="button" class="start${start === 'join' ? ' on' : ''}" data-start="join"><h3>Join an established commune</h3><p>You arrive as a newcomer in a commune of about 35, with an elected council, three parties and laws already in force. Rise, reform, or overthrow it.</p></button>
      </div>
      <div class="formrow">
        <label class="field"><span>Your first name</span><input class="plain" id="f-first" maxlength="20" value="${escRaw(me.first)}"></label>
        <label class="field"><span>Your surname</span><input class="plain" id="f-last" maxlength="20" value="${escRaw(me.last)}"></label>
        <label class="field"><span>You are a</span><select class="plain" id="f-sex">${opt([['m', 'Man'], ['f', 'Woman'], ['x', 'Non-binary person']], me.sex)}</select></label>
        <label class="field"><span>Drawn to</span><select class="plain" id="f-orient">${opt([['bi', 'Anyone'], ['straight', 'The opposite sex'], ['gay', 'The same sex']], me.orient)}</select></label>
        <label class="field"><span>Commune name</span><input class="plain" id="f-commune" maxlength="30" value="${escRaw(start === 'found' ? me.commune : 'Steel Haven')}"></label>
      </div>
      <div class="row"><button type="button" class="btn primary big" id="f-go">${start === 'found' ? 'Next: the constitution' : 'Begin'}</button>${canCancel ? '<button type="button" class="btn" id="f-cancel">Back to my game</button>' : ''}</div>
      <p class="small muted">Each day you get three actions (you can buy more). Click people to act on them; write laws in the Laws tab; then end the day and read what happened. The game saves itself in this browser.</p>
    </div>`;
      const read = () => { me.first = ov.querySelector('#f-first').value.trim() || 'Alex'; me.last = ov.querySelector('#f-last').value.trim() || 'Rowe'; me.sex = ov.querySelector('#f-sex').value; me.orient = ov.querySelector('#f-orient').value; me.commune = ov.querySelector('#f-commune').value.trim(); };
      ov.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => { read(); start = b.dataset.start; if (start === 'found' && me.commune === 'Steel Haven') me.commune = 'The Yard'; step1(); }));
      ov.querySelector('#f-go').addEventListener('click', () => { read(); if (start === 'found') step2(); else begin(); });
      const cancel = ov.querySelector('#f-cancel'); if (cancel) cancel.addEventListener('click', () => { ov.hidden = true; });
      setTimeout(() => ov.querySelector('#f-go').focus(), 50);
    };
    const step2 = () => {
      const row = (id, label, pairs, val, hint) => `<label class="field"><span>${label}</span><select class="plain" id="k-${id}">${opt(pairs, String(val))}</select>${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
      ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="k-title">
      <div><p class="small muted mono">${escRaw(me.commune || 'The Yard').toUpperCase()} · DAY ONE</p><h2 id="k-title">THE FOUNDING <span>CONSTITUTION</span></h2>
      <p class="lead" style="margin-top:8px">Set it up however you like. It costs nothing today. After today, changing any of it costs actions, and votes if you choose a democracy.</p></div>
      <div class="formrow">
        ${row('type', 'Government', Object.entries(CC.GOV).map(([key, g]) => [key, g.label]), k.type, 'Founder’s rule and dictatorship: you decree. Council and assembly: laws go to a vote and you face elections.')}
        ${row('gate', 'Newcomers', Object.entries(CC.GATE), k.gate)}
        ${row('conflict', 'When laws contradict', Object.entries(CC.CONFLICT), k.conflict)}
        ${row('exempt', 'The leader and the law', [['false', 'The leader is bound by the law'], ['true', 'The leader is above the law']], k.exempt)}
        ${row('tax', 'Work tax', [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5].map((v) => [String(v), `${R0(v * 100)}%`]), k.tax)}
        ${row('wage', 'Wage per shift', WAGES.map((v) => [String(v), v ? `${v} a shift` : 'Unpaid']), k.wage, `A shift earns the commune ${CC.SHIFT_VALUE}. Pay more and the treasury drains; less and it fills.`)}
        ${row('salary', "The leader's salary", SALARIES.map((v) => [String(v), v ? `${v} a day` : 'None']), k.salary)}
        ${row('term', 'Elections every', [12, 24, 48].map((v) => [String(v), `${v} days`]), k.term, 'Only matters in a democracy.')}
        <label class="field"><span>Name of the currency</span><input class="plain" id="k-currency" maxlength="20" value="${escRaw(k.currency)}"><small class="muted">Scrip, caps, bolts, crowns: whatever you like.</small></label>
      </div>
      <div><div class="sect">Founding laws <span class="r small">optional, free, up to 8</span></div>
      <div class="founding">${FOUNDING_LAWS.map(([n, spec, blurb], i) => `<label class="flaw"><input type="checkbox" data-flaw="${i}"${k.laws.includes(i) ? ' checked' : ''}><span><b>${escRaw(n)}</b><small>${escRaw(blurb)}</small></span></label>`).join('')}</div>
      <p class="small muted" style="margin-top:6px">You can write any other law, with any punishment, from the Laws tab once the commune is running.</p></div>
      <div><div class="sect">Abolish from day one <span class="r small">optional</span></div>
      <div class="founding">${['execution', 'torture', 'mutilation', 'corporal', 'exile', 'prison'].map((c) => `<label class="flaw"><input type="checkbox" data-fab="${c}"${k.abolished.includes(c) ? ' checked' : ''}><span><b>${escRaw(CC.PUN_CATS[c].label)}</b><small>No law may use it, and nor may you</small></span></label>`).join('')}</div>
      <p class="small muted" style="margin-top:6px">You can invent new punishments, or abolish more, from Laws, then Punishments.</p></div>
      <div class="row"><button type="button" class="btn primary big" id="k-go">Found ${escRaw(me.commune || 'The Yard')}</button><button type="button" class="btn" id="k-back">Back</button></div>
    </div>`;
      const read = () => {
        const g = (id) => ov.querySelector('#k-' + id).value;
        k.type = g('type'); k.gate = g('gate'); k.conflict = g('conflict'); k.exempt = g('exempt') === 'true';
        k.tax = Number(g('tax')); k.wage = Number(g('wage')); k.salary = Number(g('salary')); k.term = Number(g('term'));
        k.currency = ov.querySelector('#k-currency').value.trim() || 'scrip';
        k.laws = [...ov.querySelectorAll('[data-flaw]:checked')].map((x) => Number(x.dataset.flaw));
        k.abolished = [...ov.querySelectorAll('[data-fab]:checked')].map((x) => x.dataset.fab);
      };
      ov.querySelectorAll('[data-flaw]').forEach((x) => x.addEventListener('change', () => { if (ov.querySelectorAll('[data-flaw]:checked').length > 8) { x.checked = false; toast('Eight founding laws at most. Write the rest later.', true); } }));
      ov.querySelector('#k-back').addEventListener('click', () => { read(); step1(); });
      ov.querySelector('#k-go').addEventListener('click', () => { read(); begin(); });
      ov.scrollTop = 0;
    };
    const begin = () => {
      const o = { start, first: me.first, last: me.last, sex: me.sex, orient: me.orient, communeName: me.commune, seed: (Date.now() & 0x7fffffff) || 7 };
      if (start === 'found') {
        o.constitution = { type: k.type, gate: k.gate, conflict: k.conflict, exempt: k.exempt, tax: k.tax, wage: k.wage, salary: k.salary, term: k.term, abolished: k.abolished };
        o.currency = k.currency;
        o.laws = k.laws.map((i) => ({ ...FOUNDING_LAWS[i][1], name: FOUNDING_LAWS[i][0], enf: FOUNDING_LAWS[i][1].enf || 'watch', pun: FOUNDING_LAWS[i][1].pun || 'fine', amount: FOUNDING_LAWS[i][1].amount || 3, method: 'firing', setting: 'private' }));
      }
      S = CC.newGame(o);
      tab = 'today'; selected = CC.PLAYER; peopleFilter = 'all';
      ov.hidden = true; save(); render();
    };
    ov.hidden = false;
    step1();
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
  setInterval(() => {
    const el = document.getElementById('ycensus');
    if (!el || !window.CCYard) return;
    const c = window.CCYard.census();
    if (!c) return;
    el.textContent = 'Right now: ' + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(' · ');
  }, 1000);
  window.ContainerCommune = { get state() { return S; }, render };
  if (loadSaved()) { render(); if (S.over) showEnd(); }
  else { S = CC.newGame({ start: 'found', seed: 2026, first: 'Alex', last: 'Rowe', communeName: 'The Yard' }); render(); showStart(false); }
})();
