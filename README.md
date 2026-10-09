# Container Commune

A society sim by GooseKnightGaming. A yard of shipping containers has broken away from the country to run itself. Write its laws, live with its people, and keep hold of power, or take it.

Current version: **V3**. Plain HTML, CSS and JavaScript. No libraries, no build step.

## Play locally
Open `index.html` in a browser.

## Put it on GitHub Pages
1. Create a repository and upload `index.html`, `style.css`, `README.md` and the `js` folder (`data.js`, `sim.js`, `politics.js`, `yard.js`, `ui.js`).
2. In the repository, go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then save.
3. The game appears at `https://<your-username>.github.io/<repository-name>/` after a minute or two.

The game saves itself in the browser. The Chronicle tab has a save code you can copy to move a game to another device. Older saves load into the current version and are brought up to date automatically.

## Two ways to start
- **Found a commune.** You lead about two dozen settlers. First you write the founding constitution, for free: the kind of government, the gate, the work tax, wages, your salary, what happens when laws contradict, whether you're above the law, the name of the currency, and up to eight founding laws. After day one, changing any of it costs actions (and votes, in a democracy).
- **Join an established commune.** You arrive as a newcomer in a commune of about 35 with an elected council, three parties and five laws already in force. You have no power at all.

## How a day works
1. Read the report: what happened yesterday. Watch it happen again on the **Yard** map.
2. Answer any decisions waiting, including laws your citizens bring you.
3. Spend your **3 actions** (you can pay for more). Most actions are on people: click anyone to get to know them, help them, court them, invite them to your party, bribe, threaten, smear, recruit to a plot, or (as leader) arrest, release or worse.
4. Write laws in the Laws tab, manage your party and platform in Politics, build and trade in Commune.
5. **End the day.** Citizens choose what to do, the law catches some of them, people eat, fall in love, have children, arrive, leave, die, vote and plot.

## Laws
A law is a sentence built from parts: **who** + **rule** + **behaviour**, enforced by **enforcement**, punished by **punishment**.

- **Who:** all citizens, adults, children, elders, everyone 60 and over, retired citizens, trans citizens, men, women, non-binary citizens, people in same-sex relationships, newcomers, founders, partnered or single people, parents, officials, people in no party, any trade, or the members of any party.
- **Rules:** may not, must, only once (a day, or in a lifetime for partnerships and children), need a permit, taxed, paid, honoured.
- **What schools teach (8 subjects):** religion, sex and relationships, gender identity, politics and debate, loyalty to the leader, the outside world, practical trades, and the commune's own story. Schools must teach it, may not teach it, are encouraged to, or are discouraged from it. Teachers who disagree may defy the law. What children are taught shapes who they become at 16 (more devout, more loyal, more idealistic, more rebellious, more skilled), and parents care a lot.
- **Behaviours (29):** work, lessons, sharing food, hoarding water, private trade, meetings, worship, loud music, drinking, gambling, criticising the government, informing on neighbours, theft, protest, party work, carrying weapons, the uniform, the leader's address, care work, talking to outsiders, going about naked, retiring, living as a gender other than the one assigned at birth, forming partnerships, same-sex relationships, taking more than one partner, divorce, having children, leaving.
- **Enforcement:** honour system, neighbourhood watch, wardens, paid informants, cameras, secret police.
- **Punishments:** warning, fines, community service, shaming, confiscation, loss of vote, detention, exile, flogging, torture, execution (by firing squad, hanging or lethal injection, in private or in public).

Laws take effect the day after they pass. The constitution sets what happens when two laws contradict. Every law needs its own name: the builder flags a name that's already on the books. Repealed laws stay in the statute book, stamped REPEALED.

Retirement is a choice people make as they get older, so you can ban it, require it (for elders, or everyone over 60), pay a daily pension, tax it or honour it. Some citizens are trans or questioning: you can recognise and honour transition, pay for it, or ban it, in which case trans people may stop living openly, leave, or be punished.

So you can outlaw same-sex relationships or require them, make everyone go naked or ban it (or only for men, or only for women), require everyone to take more than one partner, and make divorce legal, paid, rationed, or punishable by death. People react according to who they are: their orientation, their traits and their values.

**Proposals.** Citizens bring you laws, NationStates-style. As leader you can pass them as written, pass a softer version, side with someone who wants the opposite, or throw them out. As a councillor (or in a direct democracy) you vote. As an ordinary citizen you can sign the petition or not.

**Vote forecasts.** In a democracy, the builder shows how each councillor is likely to vote and why (their own view, their party line, how they feel about you, whether you've bribed or lobbied them). In an assembly it shows the split by party.

## Citizens
Every citizen has a sex (man, woman or non-binary), an orientation (straight, gay or bisexual), needs, two traits, a trade, friends and family, a party (or none), an opinion of you and of the government, and fear. Their **motive** is the heart of the game:
- **Self:** looks after their own needs first.
- **Others:** acts for what other people actually need.
- **Believed-others:** acts for what they *think* others need. Their **accuracy** decides how often they're wrong.

People partner up with people they're drawn to, sometimes take more than one partner, split up or divorce, have children, grow up (16 is adulthood), get old and die. Newcomers arrive at the gate depending on how good life looks and your gate policy.

## Money
- **The currency** is called whatever you like (scrip by default).
- **Wages:** every shift earns the commune 3. The treasury pays each worker the wage set in the constitution, minus the work tax. Pay more than 3 and the treasury drains; pay less and it fills. When the treasury can't pay, workers go unpaid and resent it. Laws that pay or tax a behaviour apply to you too.
- **The leader's salary** is paid from the treasury each day.
- **Your own money** buys: an extra action today (the price doubles each time), aides (one more action every day, for a daily wage), bodyguards, a container of your own, good clothes, gifts, rounds at the bar and bribes. As leader you can also help yourself to the treasury, secretly.

## Government and politics
- **Systems:** founder's rule, elected council (5 seats, by party), direct democracy, dictatorship.
- **Parties** form, gain and lose members, change their policies, and choose leaders. You can join one, challenge for its leadership, or found your own with your platform.
- **Elections** happen on a term. If you lose as leader: accept it, refuse it (and rule by force), or walk away.
- **Overtly:** declare emergency rule, set up a secret police, decree whatever you like.
- **Secretly:** bribe, threaten, spread rumours, rig elections, arrest people quietly, make people disappear. Your **exposure** meter rises with every secret. Past 25 there is a growing chance it all comes out in a scandal, and a democracy may vote you out.
- **From below:** criticise, organise protests, talk to journalists, start a plot, recruit, and launch a coup when your strength beats the government's loyal strength.

AI leaders govern when you don't: they pass laws from their party's platform, repeal hated ones, build, buy food, crack down on protest, and sometimes slide into dictatorship themselves.

## Endings
Executed, exiled, assassinated, overthrown, taken back by the outside world, collapse, exodus, or walking away. Otherwise the commune goes on.

## Files
- `js/data.js` — all the content: behaviours, groups, rules, enforcement, punishments, traits, trades, buildings, the shop, names. Edit this to add things.
- `js/sim.js` — people, needs, laws, justice, economy, the life cycle.
- `js/politics.js` — government, parties, elections, plots, coups, scandals, events, your actions, new games and saving.
- `js/yard.js` — the animated yard map.
- `js/ui.js` — the interface.
- `style.css` — the look.

## Parties
Join, leave, found or challenge for the leadership of a party. If you lead one, you can disband it. You can try to outlaw a rival party, unless it's the ruling party, holds a council majority, or counts most adults as members: as ruler you can simply decree it; in a democracy it goes to a vote. An outlawed party can't stand for election, its members bleed away, and party work is punished by whatever you chose. Harsh rulers will do the same to their rivals, possibly yours. The Politics tab has a full table of where every party, you and the public stand on every issue.

## Changelog
**V3**
- Laws on retirement (bans, requirements, pensions), gender identity, and what schools can, can't, should and shouldn't teach, with lasting effects on children.
- Disband your own party; try to outlaw a rival. Outlawed parties fade, and AI rulers can outlaw parties too.
- "Where the parties stand": every issue, every party, your platform and public opinion. Party cards list every position, including the ones they only lean on.
- The Commune tab shows the school curriculum and what was taught yesterday.

**V2**
- The Yard: a live map of the commune. Buildings appear where they're fitted out, spare containers stack by the gate, and every citizen walks through yesterday again, from home to their two activities and back, from dawn to night. Colour people by trade, party, opinion of you or how they're doing. A smaller map sits on the Today tab.
- Founding constitution: set it all up for free when you found a commune, including founding laws and the currency's name.
- Citizens propose laws to you (pass, soften, side with the opposition, or throw out), and you vote or sign petitions when you're not in charge.
- Per-councillor vote forecasts with reasons.
- New laws on nudity, same-sex relationships, polygamy and divorce; laws for men, women and non-binary citizens; sex and orientation for everyone.
- Wages are real: paid from the treasury per shift, set in the constitution, unpaid when the treasury is empty. Laws that pay or tax a behaviour now apply to you as well.
- Your own money: rename the currency, buy extra actions, aides, bodyguards, a private container, clothes, gifts, heavier bribes, rounds at the bar, and embezzle as leader.
- Duplicate law names are flagged and blocked. Repealed laws are kept and stamped REPEALED.

**V1**
- First full version: two starts, 25 behaviours, law builder with groups by party and trade, 13 punishments, 4 government types, parties, elections, coups, secret rule, scandals, partnerships, births, ageing, newcomers, events and endings.
