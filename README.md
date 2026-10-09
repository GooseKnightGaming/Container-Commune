# Container Commune

A society sim by GooseKnightGaming. A yard of shipping containers has broken away from the country to run itself. Write its laws, live with its people, and keep hold of power, or take it.

Current version: **V1**. Plain HTML, CSS and JavaScript. No libraries, no build step.

## Play locally
Open `index.html` in a browser.

## Put it on GitHub Pages
1. Create a repository and upload `index.html`, `style.css`, `README.md` and the `js` folder (`data.js`, `sim.js`, `politics.js`, `ui.js`).
2. In the repository, go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then save.
3. The game appears at `https://<your-username>.github.io/<repository-name>/` after a minute or two.

The game saves itself in the browser. The Chronicle tab has a save code you can copy to move a game to another device.

## Two ways to start
- **Found a commune.** You lead about two dozen settlers. No laws, no parties. Founder's rule: you decree.
- **Join an established commune.** You arrive as a newcomer in a commune of about 35 with an elected council, three parties and five laws already in force. You have no power at all.

## How a day works
1. Read the report: what happened yesterday.
2. Spend your **3 actions**. Most actions are on people: click anyone to get to know them, help them, court them, invite them to your party, bribe, threaten, smear, recruit to a plot, or (as leader) arrest, release or worse.
3. Write laws in the Laws tab, manage your party and platform in Politics, build and trade in Commune.
4. **End the day.** Citizens choose what to do, the law catches some of them, people eat, fall in love, have children, arrive, leave, die, vote and plot.

## Laws
A law is a sentence built from parts: **who** + **rule** + **behaviour**, enforced by **enforcement**, punished by **punishment**.

- **Who:** all citizens, adults, children, elders, newcomers, founders, partnered or single people, parents, officials, people in no party, any trade, or the members of any party.
- **Rules:** may not, must, only once (a day, or in a lifetime for partnerships and children), need a permit, taxed, paid, honoured.
- **Behaviours (25):** work, lessons, sharing food, hoarding water, private trade, meetings, worship, loud music, drinking, gambling, criticising the government, informing on neighbours, theft, protest, party work, carrying weapons, the uniform, the leader's address, care work, talking to outsiders, forming partnerships, having children, leaving.
- **Enforcement:** honour system, neighbourhood watch, wardens, paid informants, cameras, secret police.
- **Punishments:** warning, fines, community service, shaming, confiscation, loss of vote, detention, exile, flogging, torture, execution (by firing squad, hanging or lethal injection, in private or in public).

Laws take effect the day after they pass. The constitution sets what happens when two laws contradict.

## Citizens
Every citizen has needs, two traits, a trade, friends and family, a party (or none), an opinion of you and of the government, and fear. Their **motive** is the heart of the game:
- **Self:** looks after their own needs first.
- **Others:** acts for what other people actually need.
- **Believed-others:** acts for what they *think* others need. Their **accuracy** decides how often they're wrong.

People partner up and split up, have children, grow up (16 is adulthood), get old and die. Newcomers arrive at the gate depending on how good life looks and your gate policy.

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
- `js/data.js` — all the content: behaviours, groups, rules, enforcement, punishments, traits, trades, buildings, names. Edit this to add things.
- `js/sim.js` — people, needs, laws, justice, economy, the life cycle.
- `js/politics.js` — government, parties, elections, plots, coups, scandals, events, your actions, new games and saving.
- `js/ui.js` — the interface.
- `style.css` — the look.

## Changelog
**V1**
- First full version: two starts, 25 behaviours, law builder with groups by party and trade, 13 punishments, 4 government types, parties, elections, coups, secret rule, scandals, partnerships, births, ageing, newcomers, events and endings.
