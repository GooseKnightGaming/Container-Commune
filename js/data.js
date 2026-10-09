/*
  CONTAINER COMMUNE — content
  Everything the game knows about: behaviours, groups, rules, enforcement, punishments,
  traits, trades, buildings, government types and names. Edit this file to add content.
*/
(function (root) {
  'use strict';
  const CC = (root.CC = root.CC || {});
  CC.VERSION = 'V1';
  CC.YEAR = 24;                       // days in a year (4 seasons of 6 days)
  CC.SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  CC.ADULT = 16;                      // age of majority: can work, vote and stand
  CC.ELDER = 65;
  CC.NEEDS = ['food', 'water', 'belonging', 'freedom', 'purpose', 'safety'];
  CC.NEED_WORD = { food: 'hungry', water: 'thirsty', belonging: 'lonely', freedom: 'feeling hemmed in', purpose: 'restless', safety: 'feeling unsafe' };

  /*
    BEHAVIOURS — what citizens can do, and what laws can be about.
    kind: 'day' (chosen daily) or 'life' (a life event, checked at night)
    base: how much people like doing it with no reason either way
    needs: which needs it meets (and how strongly)
    value: whether the average citizen thinks it's good for the commune (-1.5 .. 1)
    minAge / maxAge: who can do it at all
  */
  CC.BEH = {
    work:      { label: 'work a shift', short: 'Worked', base: 24, needs: { purpose: 0.9 }, value: 1, minAge: 16, repeat: true },
    study:     { label: 'attend lessons', short: 'Lessons', base: 2, childBase: 28, needs: { purpose: 0.6 }, value: 0.8, minAge: 6 },
    share:     { label: 'share food', short: 'Shared food', base: 4, needs: { belonging: 0.5 }, value: 1, minAge: 8 },
    hoard:     { label: 'take extra water', short: 'Took extra water', base: 0, needs: { water: 1.3 }, value: -0.8, minAge: 8, repeat: true },
    trade:     { label: 'trade privately', short: 'Traded', base: 10, needs: { belonging: 0.3 }, value: 0.3, minAge: 16, repeat: true },
    gather:    { label: 'hold meetings', short: 'Met friends', base: 10, needs: { belonging: 0.8 }, value: 0.1, minAge: 6 },
    worship:   { label: 'worship', short: 'Worshipped', base: -4, needs: { belonging: 0.4, purpose: 0.4 }, value: 0, minAge: 6 },
    music:     { label: 'play loud music after dark', short: 'Loud music', base: 2, needs: { freedom: 0.8 }, value: -0.5, minAge: 10 },
    drink:     { label: 'drink at the bar', short: 'At the bar', base: 6, needs: { belonging: 0.5, freedom: 0.4 }, value: -0.3, minAge: 18, repeat: true },
    gamble:    { label: 'gamble', short: 'Gambled', base: -2, needs: { freedom: 0.3 }, value: -0.4, minAge: 18 },
    criticise: { label: 'criticise the government', short: 'Criticised the government', base: -8, needs: { freedom: 0.6 }, value: -0.4, minAge: 10 },
    report:    { label: 'report neighbours', short: 'Reported someone', base: -22, needs: { safety: 0.6 }, value: -0.2, minAge: 10 },
    steal:     { label: 'steal', short: 'Stole', base: -16, needs: { food: 0.9 }, value: -1.5, minAge: 8, repeat: true },
    protest:   { label: 'protest', short: 'Protested', base: -30, needs: { freedom: 0.7, belonging: 0.2 }, value: -0.3, minAge: 14 },
    organise:  { label: 'organise politically', short: 'Party work', base: -12, needs: { purpose: 0.5, belonging: 0.3 }, value: 0, minAge: 16 },
    weapon:    { label: 'carry a weapon', short: 'Carried a weapon', base: -14, needs: { safety: 0.9 }, value: -0.6, minAge: 16 },
    uniform:   { label: 'wear the commune uniform', short: 'Wore the uniform', base: -12, needs: { belonging: 0.2 }, value: 0.2, minAge: 6 },
    address:   { label: "attend the leader's address", short: 'Heard the address', base: -10, needs: { belonging: 0.2 }, value: 0.3, minAge: 6 },
    volunteer: { label: 'care for the sick and elderly', short: 'Volunteered', base: 0, needs: { purpose: 0.5, belonging: 0.3 }, value: 1, minAge: 12 },
    outside:   { label: 'talk to outsiders', short: 'Talked to outsiders', base: -6, needs: { freedom: 0.4 }, value: -0.2, minAge: 16 },
    partner:   { label: 'form a partnership', short: 'Partnered', kind: 'life', value: 0.6, minAge: 18 },
    child:     { label: 'have a child', short: 'Had a child', kind: 'life', value: 0.5, minAge: 18, maxAge: 50 },
    leave:     { label: 'leave the commune', short: 'Left', kind: 'life', value: -0.6, minAge: 16 },
  };
  for (const k in CC.BEH) { CC.BEH[k].kind = CC.BEH[k].kind || 'day'; CC.BEH[k].maxAge = CC.BEH[k].maxAge || 200; }
  CC.DAY_BEH = Object.keys(CC.BEH).filter((k) => CC.BEH[k].kind === 'day');

  /* GROUPS a law can apply to. Party and trade groups are added at runtime. */
  CC.WHO = {
    everyone:    { label: 'All citizens', test: () => true, spec: 0 },
    adults:      { label: 'Adults', test: (c) => c.age >= 16, spec: 1 },
    children:    { label: 'Children', test: (c) => c.age < 16, spec: 2 },
    elders:      { label: 'Elders (65 and over)', test: (c) => c.age >= 65, spec: 2 },
    newcomers:   { label: 'Newcomers (here under a year)', test: (c, S) => !c.founder && S.day - c.arrived < 24 && !c.bornHere, spec: 2 },
    founders:    { label: 'Founding members', test: (c) => c.founder, spec: 2 },
    notfounders: { label: 'Everyone except founders', test: (c) => !c.founder, spec: 1 },
    partnered:   { label: 'Partnered citizens', test: (c) => c.partner != null, spec: 2 },
    single:      { label: 'Single adults', test: (c) => c.partner == null && c.age >= 18, spec: 2 },
    parents:     { label: 'Parents', test: (c) => c.children.length > 0, spec: 2 },
    officials:   { label: 'Officials (council and wardens)', test: (c, S) => CC.isOfficial(c), spec: 2 },
    notofficials:{ label: 'Everyone except officials', test: (c, S) => !CC.isOfficial(c), spec: 1 },
    noparty:     { label: 'People in no party', test: (c) => c.party == null && c.age >= 16, spec: 2 },
  };

  /* RULES: what a law does to a behaviour. dir: how it pushes people (+ encourage, - discourage). */
  CC.RULES = {
    ban:       { label: 'may not',           dir: -1,   violation: true },
    require:   { label: 'must',              dir: 1,    violation: true },
    ration:    { label: 'only once',         dir: -0.4, violation: true },
    license:   { label: 'need a permit to',  dir: -0.5, violation: true },
    tax:       { label: 'are taxed to',      dir: -0.6, money: true },
    subsidise: { label: 'are paid to',       dir: 0.6,  money: true },
    reward:    { label: 'are honoured for',  dir: 0.4 },
  };
  CC.LICENSE_FEE = 15;

  /* ENFORCEMENT: catch = share of law-breakers caught; upkeep = scrip per law per day. */
  CC.ENF = {
    honour:    { label: 'the honour system',       catch: 0.05, upkeep: 0,   fear: 0,  note: 'Only the willing comply.' },
    watch:     { label: 'the neighbourhood watch', catch: 0.25, upkeep: 0.5, fear: 2,  note: 'Busybodies thrive; feuds follow.' },
    wardens:   { label: 'paid wardens',            catch: 0.45, upkeep: 2,   fear: 5,  note: 'Needs wardens. Wardens can be bribed.' },
    informants:{ label: 'paid informants',         catch: 0.55, upkeep: 2.5, fear: 8,  note: 'Distrust everywhere. False reports.' },
    cameras:   { label: 'cameras',                 catch: 0.65, upkeep: 1,   fear: 6,  note: 'Needs a camera network. Outsiders notice.', needs: 'cameras' },
    police:    { label: 'the secret police',       catch: 0.8,  upkeep: 3,   fear: 14, note: 'Needs a secret police. Fear soars; arrests the wrong people.', needs: 'police' },
  };

  /* PUNISHMENTS, mildest to harshest. sev 0-100. */
  CC.PUN = {
    warning:   { label: 'a warning', sev: 3 },
    fine:      { label: 'a fine of 10 scrip', sev: 12 },
    bigfine:   { label: 'a fine of 30 scrip', sev: 22 },
    service:   { label: 'community service', sev: 16 },
    shaming:   { label: 'public shaming', sev: 26 },
    confiscate:{ label: 'confiscation of everything they own', sev: 32 },
    novote:    { label: 'loss of the vote for a year', sev: 20 },
    detention: { label: 'two days in the lock-up', sev: 40 },
    longdet:   { label: 'a week in the lock-up', sev: 55 },
    exile:     { label: 'exile', sev: 70 },
    flogging:  { label: 'flogging', sev: 75 },
    torture:   { label: 'interrogation under torture', sev: 85 },
    execution: { label: 'execution', sev: 100 },
  };
  CC.METHODS = { firing: 'firing squad', hanging: 'hanging', injection: 'lethal injection' };
  CC.SETTINGS = { private: 'in private', public: 'in public, in the yard' };

  /* TRAITS: likes = how much they want to do a behaviour; values = what they think is good for the commune. */
  CC.TRAITS = {
    Diligent:        { likes: { work: 22, study: 10 } },
    Lazy:            { likes: { work: -22, drink: 10, music: 6, gamble: 6 } },
    Devout:          { likes: { worship: 34, drink: -8, gamble: -10 }, values: { worship: 0.9, gamble: -1, drink: -0.8 } },
    Rebellious:      { likes: { criticise: 22, music: 12, protest: 14, uniform: -20, address: -14 }, values: { criticise: 0.8, music: 0.5, protest: 0.6, leave: 0.5 } },
    Gossip:          { likes: { gather: 20, criticise: 5, report: 6, outside: 6 } },
    'Light-fingered':{ likes: { steal: 26, gamble: 8 } },
    Generous:        { likes: { share: 26, volunteer: 18 } },
    Busybody:        { likes: { report: 26 }, values: { report: 0.8 } },
    Paranoid:        { likes: { report: 16, weapon: 14 }, values: { criticise: -1, report: 0.8, weapon: 0.4 } },
    Ambitious:       { likes: { trade: 20, work: 8, organise: 14 } },
    Timid:           { likes: { criticise: -22, protest: -24, weapon: -10 } },
    'Hot-headed':    { likes: { drink: 14, criticise: 10, protest: 10, weapon: 10 } },
    Romantic:        { likes: { gather: 6, music: 4 } },
    'Family-minded': { likes: { volunteer: 6 }, values: { child: 1, partner: 0.9 } },
    Loyal:           { likes: { uniform: 16, address: 16, criticise: -14 }, values: { uniform: 0.8, address: 0.6, criticise: -0.8, report: 0.4 } },
    Idealist:        { likes: { organise: 22, protest: 8 }, values: { organise: 0.7, protest: 0.4 } },
    Cynic:           { likes: { address: -16, uniform: -10, gamble: 6 }, values: { address: -0.6, uniform: -0.4 } },
  };
  CC.MOTIVE = {
    self:     { name: 'Self', short: 'S', blurb: 'Looks after their own needs first.', likes: { hoard: 10, steal: 6, share: -14, trade: 6, volunteer: -10 } },
    others:   { name: 'Others', short: 'O', blurb: 'Acts for what other people actually need.', likes: { share: 14, hoard: -16, steal: -10, volunteer: 10 } },
    believed: { name: 'Believed-others', short: 'B', blurb: 'Acts for what they think other people need, which is not always right.', likes: { share: 10, report: 16, volunteer: 6 } },
  };

  /* TRADES: what a work shift produces. */
  CC.TRADES = {
    gardener:  { label: 'gardener', plural: 'Gardeners' },
    cook:      { label: 'cook', plural: 'Cooks' },
    mechanic:  { label: 'mechanic', plural: 'Mechanics' },
    labourer:  { label: 'labourer', plural: 'Labourers' },
    medic:     { label: 'medic', plural: 'Medics' },
    teacher:   { label: 'teacher', plural: 'Teachers' },
    warden:    { label: 'warden', plural: 'Wardens' },
    organiser: { label: 'organiser', plural: 'Organisers' },
    artist:    { label: 'artist', plural: 'Artists' },
    trader:    { label: 'trader', plural: 'Traders' },
  };
  CC.TRADE_LIST = Object.keys(CC.TRADES);

  /* BUILDINGS: size = shipping containers used; mat = materials to fit out; upkeep = scrip per day. */
  CC.BUILDINGS = {
    home:     { short: 'Home', label: 'Home', size: 1, mat: 4, upkeep: 0, color: '#8a6a4a', desc: 'Sleeps 2. Crowding lowers mood, health and births.' },
    garden:   { short: 'Garden', label: 'Container garden', size: 1, mat: 6, upkeep: 0, color: '#3f7a4f', desc: 'Three gardeners can work each one at full yield.' },
    tank:     { short: 'Water', label: 'Water tank', size: 1, mat: 5, upkeep: 0, color: '#2f6f9a', desc: '+8 rainwater a day; stores 40 more water.' },
    canteen:  { short: 'Canteen', label: 'Canteen', size: 2, mat: 8, upkeep: 0, color: '#c4512b', desc: 'Cooks make food go further. People gather here.' },
    workshop: { short: 'Workshop', label: 'Workshop', size: 2, mat: 8, upkeep: 0, color: '#6b6f78', desc: 'Mechanics make more materials.' },
    clinic:   { short: 'Clinic', label: 'Clinic', size: 2, mat: 12, upkeep: 1, color: '#e7e7e7', desc: 'Medics heal more; fewer deaths; safer births.' },
    school:   { short: 'School', label: 'School', size: 2, mat: 10, upkeep: 1, color: '#d9a62b', desc: 'Lessons count double. Children grow up skilled.' },
    hall:     { short: 'Hall', label: 'Meeting hall', size: 3, mat: 14, upkeep: 0.5, color: '#7a3b5e', desc: 'Meetings, worship and votes. Belonging.' },
    bar:      { short: 'Bar', label: 'Bar', size: 1, mat: 6, upkeep: 0, color: '#a8862b', desc: 'Fun and gossip. Drink and fights.' },
    lockup:   { short: 'Lock-up', label: 'Lock-up', size: 1, mat: 6, upkeep: 0.5, color: '#3a3f46', desc: 'Holds 4 detainees.' },
    post:     { short: 'Wardens', label: 'Warden post', size: 1, mat: 6, upkeep: 1, color: '#2f5d8a', desc: 'Counts as one extra warden on patrol.' },
    mast:     { short: 'Mast', label: 'Broadcast mast', size: 1, mat: 10, upkeep: 0.5, color: '#b3261e', desc: "Your addresses reach the whole commune." },
    wall:     { short: 'Wall', label: 'Gate and wall', size: 2, mat: 16, upkeep: 0.5, color: '#4a4a4a', desc: 'Leaving unseen is much harder. Outsiders notice.' },
  };

  CC.INSTITUTIONS = {
    police:  { label: 'Secret police', cost: 40, upkeep: 4, desc: 'Allows enforcement by the secret police. Finds plots. Feared.' },
    cameras: { label: 'Camera network', cost: 50, upkeep: 2, desc: 'Allows enforcement by cameras. Outsiders notice.' },
  };

  CC.GOV = {
    founder:      { label: "Founder's rule", demo: false, desc: 'The founder decrees laws alone.' },
    council:      { label: 'Elected council', demo: true, desc: 'Five councillors, elected by party. Laws need three votes. The council picks the chair.' },
    assembly:     { label: 'Direct democracy', demo: true, desc: 'Every adult votes on every law and elects the chair.' },
    dictatorship: { label: 'Dictatorship', demo: false, desc: 'One ruler, no elections.' },
  };
  CC.GATE = { open: 'Open gate', vetted: 'Vetted entry', closed: 'Closed gate' };
  CC.CONFLICT = {
    newest:   'The newest law wins',
    specific: 'The most specific law wins',
    harshest: 'The harshest law wins',
    popular:  'The more popular law wins',
    both:     'Both apply (no rule)',
  };

  CC.FIRST = ['Maggie', 'Tomás', 'Priya', 'Dev', 'Sam', 'Ellie', 'Mo', 'Gwen', 'Kofi', 'Aoife', 'Barry', 'Lena', 'Rhian', 'Jun', 'Zainab', 'Callum', 'Nana', 'Lily', 'Theo', 'Ruby',
    'Ade', 'Bea', 'Cal', 'Dina', 'Ezra', 'Fern', 'Gus', 'Hana', 'Idris', 'Jas', 'Kit', 'Leon', 'Mira', 'Nico', 'Ola', 'Pip', 'Quinn', 'Rosa', 'Saul', 'Tess',
    'Una', 'Vik', 'Wren', 'Yusuf', 'Zoe', 'Alfie', 'Bryn', 'Cerys', 'Darius', 'Effie', 'Femi', 'Gita', 'Hal', 'Imani', 'Joel', 'Kasia', 'Lorcan', 'Maya', 'Noor', 'Oisín',
    'Paz', 'Rafi', 'Sian', 'Tariq', 'Ugo', 'Vera', 'Will', 'Xan', 'Yara', 'Zak', 'Asha', 'Bilal', 'Chloe', 'Dafydd', 'Esi', 'Farah', 'Grace', 'Hugo', 'Ines', 'Jude'];
  CC.LAST = ['Doyle', 'Reyes', 'Nair', 'Patel', 'Okafor', 'Brooks', 'Hassan', 'Pryce', 'Mensah', 'Kelly', 'Shaw', 'Novak', 'Morgan', 'Wei', 'Ali', 'Fraser', 'Owusu', 'Evans',
    'Hughes', 'Khan', 'Murphy', 'Walsh', 'Adeyemi', 'Kowalski', 'Lewis', 'Begum', 'Byrne', 'Clarke', 'Dlamini', 'Farah', 'Gill', 'Ivanova', 'Jones', 'Lin', 'Mahmood', 'Nwosu', 'Quinn', 'Rossi', 'Singh', 'Taylor'];

  CC.PARTY_NAMES = ['The Yard Collective', 'Order and Supply', 'The Free Containers', 'Common Ground', 'The Steel Union', 'The Hearth Party', 'Open Gate', 'The Night Watch', 'Rust and Roses', 'The Kettle League', 'New Dock', 'The Quiet Majority'];
  CC.PARTY_COLORS = ['#c4512b', '#2f5d8a', '#3f7a4f', '#a8862b', '#7a3b5e', '#5b6670', '#b3261e', '#2f7f7a'];
})(typeof window !== 'undefined' ? window : globalThis);
