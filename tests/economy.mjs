// A simulated typical first session on the real formulas (shared/config.js) and the real stages (shared/world.js): clicks for Speed on
// its best Power Key (by hand, MANUAL clicks a second, with Auto Click on top once it's found it), runs the Sprintway from the spawn
// stage after stage at its Speed's pace (Auto Click still clicking); dies now and then (more often in a stage laid out for more Speed
// than it has: its gaps are sized to that pace); revives when it's free (or for Gems now and then), else runs again from the start;
// trains when it's stuck; follows the quests (rebirths, races, Power Key clicks when one asks; rebirths too when it's been stuck a long
// while), buys what helps. It isn't a person, but it tells when things come.
// It plays one session out loud (seed 1), then the same over many seeds and prints the pacing table (medians, and the 10%..90% spread).
// node tests/economy.mjs [minutes]   (env: MANUAL clicks/s by hand while training, AUTO_AT s before it turns Auto Click on, SKILL 0..1
// how well it plays, SEEDS how many runs)
import {
    CFG, WORLDS, WALLS_N, POSTS, JAWBREAKERS, UPGRADES, upgradeCost, palsOf, PALS, teamMax, teamMult, clickGain, isMega, autoRateOf, padPay, maxWalk, rebirthSpeed, rebirthMult, postOpen,
    matchPrize, matchLv, matchInfo, worldOpen, TRAILS, fmt, clock, recSpeed, QUESTS, GIFTS, rewardSpeed, stageV, jumpV, SPIN, spinPrize, PLACES,
} from '../shared/config.js';
import { W, wallZ, stageLen, ZONES, runClear, BALLS } from '../shared/world.js';

const MINS = Number(process.argv[2] || 30), MANUAL = Number(process.env.MANUAL || 5), AUTO_AT = Number(process.env.AUTO_AT ?? 40), SKILL = Number(process.env.SKILL ?? 0.5), SEEDS = Number(process.env.SEEDS || 25);

// ----- each stage's speed gate, from its real layout and the balls' real timetable: the run speed that leaves a comfortable window to
// set off in on each of its three runs (0.7 s of every ball's gap), and the least that leaves any at all (a perfectly timed run) -----
function windowAt(k, v) {
    let worst = 1e9;
    for (const Z of ZONES.filter((o) => o.k === k)) {
        const N = ZONES[Z.idx + 1];
        if (!N) continue;
        let ok = 0, n = 0;
        for (let t = 0; t < BALLS.T; t += 0.05) { n++; if (runClear(1000 + t, Z.z0 + 3, N.z1 - 5, v)) ok++; }
        worst = Math.min(worst, ok / n * BALLS.T);
    }
    return worst;
}
function gateOf(k) {
    const find = (need) => { let lo = 4, hi = 220; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (windowAt(k, m) >= need) hi = m; else lo = m; } return hi; };
    return { typ: find(0.7), per: find(0.12) };
}
const GATE = Array.from({ length: WALLS_N }, (_, k) => gateOf(k));
const GATES = WORLDS.map(() => GATE);
// how likely a try at a stage is to end under a ball even fast enough (a run misjudged; more further in, less for a better player)
const RISK = { ballrun: 0.06 };

function simulate(seed, say) {
    const p = { world: 0, speed: 0, topSpeed: 0, totalWins: 0, rebirths: 0, trail: 0, aura: 0, ups: {}, wins: 0, gems: 0, clicks: 0, megas: 0, keyClicks: 0, team: [], pals: {}, bests: {}, padsDone: {}, matches: 0, hatched: 0, upgrades: 0, pads: 0, spinsUsed: 0, podium: 0, matchWins: 0, qi: 0 };
    let t = 0, rng = seed, freeAt = 0, deaths = 0, revives = 0, gemRevives = 0, spun = 0, raceAt = 0, stuckK = -1, stuckSince = 0, at = 0, autoAcc = 0;
    const R = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    const seen = new Map(), padAt = {}, tries = {}, gifts = new Set();
    const log = (s) => { if (say) console.log(clock(t).padStart(6), s); };
    const once = (k, s) => { if (!seen.has(k)) { seen.set(k, t); if (s) log(s); } };
    // Wins earned (spent or not, they count towards the Power Keys)
    const gainWins = (n) => { p.wins += n; p.totalWins += n; for (let i = 1; i < POSTS.length; i++) if (!POSTS[i].gems && postOpen(p, i)) once('post' + i, 'the ' + POSTS[i].name + ' opens (+' + POSTS[i].mult + ' a click): ' + fmt(p.totalWins) + ' Wins earned'); };
    const passChance = (k) => {
        const G = GATES[p.world][k], u = maxWalk(p), d = k / (WALLS_N - 1);
        let c = 1 - RISK.ballrun * (1 + d * 0.8) * (1.4 - SKILL * 0.8);
        if (G.typ > 0) c *= u >= G.typ ? 1 : u <= G.per ? 0.02 : 0.02 + 0.98 * Math.pow((u - G.per) / (G.typ - G.per), 1.5);
        // the first tries at a stage: still learning it
        return c * Math.min(1, 0.55 + 0.15 * (tries[p.world + ':' + k] || 0) + SKILL * 0.2);
    };
    const addSpeed = (n) => {
        p.speed += n; if (p.speed > p.topSpeed) p.topSpeed = p.speed;
        for (let k = 1; k < WALLS_N; k++) if (p.speed >= recSpeed(0, k)) once('rec' + k + ':' + p.rebirths); else break;
        if (!p.rebirths) for (let k = 1; k < WALLS_N; k++) if (p.speed >= recSpeed(0, k)) once('rec' + k); else break;
    };
    // n clicks (on Power Key post, or -1)
    const clicks = (n, post) => {
        const k = post >= 0 ? POSTS[post].mult : 1, g = clickGain(p, false, p.world, 0) * k;
        for (let i = 0; i < n; i++) { p.clicks++; const m = isMega(p.clicks, p); if (m) p.megas++; if (post >= 0) p.keyClicks++; addSpeed(g * (m ? CFG.megaK : 1)); }
    };
    const autoOn = () => t >= AUTO_AT;
    // Auto Click over dt seconds (wherever it is)
    const autoFor = (dt, post) => { if (!autoOn()) return; autoAcc += dt * autoRateOf(p); const n = Math.floor(autoAcc); autoAcc -= n; clicks(n, post); };
    const reward = (r) => { const s = rewardSpeed(r, p); if (s) addSpeed(s); gainWins(r.wins || 0); p.gems += r.gems || 0; };
    const questValue = (kind) => (kind === 'best' ? p.bests[0] || 0 : kind === 'spins' ? p.spinsUsed : kind === 'hatch' ? p.hatched : Math.floor(p[kind] || 0));
    const quests = () => { for (let i = 0; i < 4 && p.qi < QUESTS.length && questValue(QUESTS[p.qi].kind) >= QUESTS[p.qi].n; i++) { reward(QUESTS[p.qi]); p.qi++; } };
    const quest = () => QUESTS[p.qi] || {};
    const bestPost = () => { let b = 0; for (let i = 0; i < POSTS.length; i++) if (postOpen(p, i) && POSTS[i].mult >= POSTS[b].mult) b = i; return b; };
    const best = () => p.bests[p.world] || 0;
    const bestTeam = () => {
        const own = PALS.filter((a) => p.pals[a.id] > 0).sort((a, b) => b.mult - a.mult), team = [];
        for (const a of own) for (let c = 0; c < p.pals[a.id] && team.length < teamMax(p); c++) team.push(a.id);
        p.team = team;
    };
    // what it buys: more Speed a click first (it's what opens the stages), then the rest; a trail when a quest asks
    const WANT = ['switch', 'auto', 'feet', 'mega', 'luck', 'spring', 'den'];
    const shop = () => {
        if (quest().kind === 'trail' && !p.trail && p.wins >= TRAILS[1].wins) { p.wins -= TRAILS[1].wins; p.trail = 1; once('tr1', 'trail: ' + TRAILS[1].name); }
        for (let go = true; go;) {
            go = false;
            for (const id of WANT) {
                const u = UPGRADES.find((x) => x.id === id), n = p.ups[id] || 0, c = upgradeCost(u, n);
                if (n < u.max && p.wins >= c * (id === 'switch' ? 1 : 1.6)) { p.wins -= c; p.ups[id] = n + 1; p.upgrades++; once('up' + id + n, n ? '' : 'upgrade: ' + u.name); go = true; break; }
            }
            if (go) continue;
            for (let j = JAWBREAKERS.length - 1; j >= 0; j--) {
                const J = JAWBREAKERS[j];
                if (p.wins < J.wins * (p.hatched ? 3 : 1)) continue;
                p.wins -= J.wins; p.hatched++;
                const list = palsOf(j), total = list.reduce((a, x) => a + x.odds, 0);
                let r = R() * total, a = list[0];
                for (const x of list) { r -= x.odds; if (r < 0) { a = x; break; } }
                p.pals[a.id] = (p.pals[a.id] || 0) + 1;
                bestTeam();
                once('jb' + j, 'opened the ' + J.name + ': ' + a.name + ', team x' + teamMult(p.team));
                go = true;
                break;
            }
            if (go) continue;
            const tr = TRAILS[p.trail + 1];
            if (tr && p.wins >= tr.wins * 2.5) { p.wins -= tr.wins; p.trail++; once('tr' + p.trail, 'trail: ' + tr.name + ' x' + tr.mult); go = true; }
        }
    };
    // clicking on its best Power Key for so long (by hand, and Auto Click), a second at a time (its Speed climbs as it goes)
    const train = (secs) => { const b = bestPost(); for (let s = 0; s < secs; s++) { clicks(MANUAL, b); autoFor(1, b); t += 1; } };
    // one go at the Sprintway, from stage `from` (0: from the spawn). Returns where it died (or WALLS_N: all the way)
    const runFrom = (from) => {
        const w = p.world;
        if (from === 0) { const dt = (W.spawn.z - wallZ(0)) / maxWalk(p); autoFor(dt, -1); t += dt; }
        for (let k = from; k < WALLS_N; k++) {
            const u = maxWalk(p), len = stageLen(k), key = w + ':' + k, c = passChance(k);
            tries[key] = (tries[key] || 0) + 1;
            const dies = R() > c, part = dies ? 0.25 + R() * 0.6 : 1;
            // running it; out on the side of each wide keyboard waiting for a ball to go by and the way to clear (about half a ball's gap a
            // run, three runs); Auto Click clicking all the while
            const waits = 3 * BALLS.T * 0.55, dt = (len * part) / u + waits * part;
            autoFor(dt, -1); t += dt;
            if (dies) { deaths++; return k; }
            // through its end gate: Wins (x3 the first time each rebirth), every 30 s at most
            if (t - (padAt[key] || -99) >= CFG.padCool) {
                padAt[key] = t;
                const first = !p.padsDone[key];
                p.padsDone[key] = 1;
                gainWins(padPay(p, w, k, first, false)); p.pads++;
            }
            if (k + 1 > best()) {
                p.bests[w] = k + 1;
                once('w' + w + 'k' + k, WORLDS[w].name + ' stage ' + (k + 1) + ' passed (Recommended Speed ' + fmt(recSpeed(w, k)) + '): ' + fmt(p.speed) + ' Speed (run ' + u.toFixed(0) + ')' + (p.rebirths ? ', rebirth ' + p.rebirths : '') + ', ' + fmt(p.wins) + ' Wins, ' + tries[key] + ' tries');
            }
            quests(); shop();
        }
        return WALLS_N;
    };
    const rebirth = (why) => {
        if (p.speed < rebirthSpeed(p.rebirths)) return false;
        const sp = p.speed;
        p.rebirths++; p.speed = 0; p.padsDone = {};
        once('rb' + p.rebirths, 'REBIRTH ' + p.rebirths + ' at ' + fmt(sp) + ' Speed (' + why + '): x' + rebirthMult(p.rebirths) + ', ' + POSTS[bestPost()].name + ' +' + POSTS[bestPost()].mult + ' a click');
        quests();
        return true;
    };
    // a Ball Rush race (somewhere in the top four)
    const race = () => {
        raceAt = t;
        const lv = matchLv(p), D = matchInfo(lv), place = Math.floor(R() * 4), prize = matchPrize(place, D.segs, lv, p);
        t += D.secs * 0.5 + 12;
        gainWins(prize.wins); p.gems += prize.gems; addSpeed(prize.speed); p.matches++;
        if (place <= 2) p.podium++;
        if (place === 0) p.matchWins++;
        once('race' + p.matches, 'race ' + p.matches + ' (' + D.segs + ' stretches): ' + PLACES[place] + ', +' + fmt(prize.wins) + ' Wins');
    };
    const end = MINS * 60;
    log('start');
    while (t < end) {
        for (let i = 0; i < GIFTS.length; i++) if (!gifts.has(i) && t >= GIFTS[i].min * 60) { gifts.add(i); reward(GIFTS[i]); }
        // the free spins (one to start with, one every few minutes): the plain Speed prize
        while (spun * CFG.spinMins * 60 <= t) { spun++; p.spinsUsed++; addSpeed(spinPrize(SPIN[0], p).speed); }
        quests(); shop();
        // the quest says rebirth: it does; says race, or click on a Power Key: it does that
        const Q = quest();
        if (Q.kind === 'rebirths' && rebirth('the quest')) { at = 0; continue; }
        if ((Q.kind === 'matches' || Q.kind === 'podium' || Q.kind === 'matchWins') && t > raceAt + 60) { race(); continue; }
        if (Q.kind === 'keyClicks' || (Q.kind === 'topSpeed' && Q.n <= 150) || Q.kind === 'clicks' || Q.kind === 'megas') { train(10); continue; }
        // stuck: the stage it dies in is laid out for much more Speed. Train (half a minute or so at a time); after a long while stuck,
        // rebirth
        const k = Math.min(WALLS_N - 1, best());
        if (best() < WALLS_N && passChance(k) < 0.3 && at === 0) {
            if (stuckK !== k) { stuckK = k; stuckSince = t; }
            if (t - stuckSince > 180 && rebirth('stuck at stage ' + (k + 1))) { stuckK = -1; continue; }
            once('stuck' + p.world + ':' + k + ':' + p.rebirths, 'stuck at stage ' + (k + 1) + ' (Recommended Speed ' + fmt(recSpeed(p.world, k)) + ', has ' + fmt(p.speed) + '): clicking');
            train(30);
            continue;
        }
        const died = runFrom(at);
        if (died >= WALLS_N) {
            at = 0;
            if (WORLDS[p.world + 1] && worldOpen(p, p.world + 1)) { p.world++; once('world' + p.world, 'on to ' + WORLDS[p.world].name); }
            // (the next world wants more rebirths: it rebirths as soon as it can, and trains for the next)
            else if (WORLDS[p.world + 1] && !rebirth('for ' + WORLDS[p.world + 1].name)) train(30);
            continue;
        }
        // died in stage `died`: back at the spawn. A free revive takes it back there; Gems now and then for a far one; else from the start
        t += 3;
        if (t >= freeAt) { freeAt = t + CFG.reviveFreeSecs; revives++; at = died; }
        else if (died >= 6 && p.gems >= CFG.reviveGems && R() < 0.5) { p.gems -= CFG.reviveGems; gemRevives++; at = died; }
        else at = 0;
        if (t > raceAt + 360) race();
    }
    log(`end: ${fmt(p.speed)} Speed (top ${fmt(p.topSpeed)}), rebirths ${p.rebirths}, ${WORLDS[p.world].name} stage ${best()}, ${fmt(p.wins)} Wins, ${p.gems} Gems, ${fmt(p.clicks)} clicks (${p.megas} MEGA), ${deaths} deaths (${revives} free revives, ${gemRevives} for Gems), team x${teamMult(p.team)}, quest ${p.qi}/${QUESTS.length}`);
    return seen;
}

// ----- one session out loud, then the pacing over many -----
simulate(1, true);
const runs = Array.from({ length: SEEDS }, (_, i) => simulate(1 + i * 7919, false));
const q = (key, f) => { const v = runs.map((s) => (s.has(key) ? s.get(key) : Infinity)).sort((a, b) => a - b), x = v[Math.min(v.length - 1, Math.floor(f * v.length))]; return x === Infinity ? '  -  ' : clock(x); };
const row = (name, key) => '  ' + name.padEnd(34) + q(key, 0.5).padStart(7) + '   (' + q(key, 0.1) + ' .. ' + q(key, 0.9) + ')';
console.log('\nPACING: a brand-new player (skill ' + SKILL + ', ' + MANUAL + ' clicks/s by hand while training, Auto Click from ' + AUTO_AT + ' s; ' + SEEDS + ' runs of ' + MINS + ' min): median   (10% .. 90%)');
for (const r of [1, 2, 3]) console.log(row('rebirth ' + r, 'rb' + r));
for (let i = 1; i < 7; i++) console.log(row('the ' + POSTS[i].name + ' (+' + POSTS[i].mult + ' a click)', 'post' + i));
console.log(row('a new world (' + WORLDS[1].name + ')', 'world1'));
console.log('  stage   rec Speed   rec first reached       stage passed            gate (run needed / stage pace)');
for (let k = 0; k < WALLS_N; k++) {
    console.log('  ' + String(k + 1).padStart(5) + fmt(recSpeed(0, k)).padStart(12) + '   ' + (k ? (q('rec' + k, 0.5) + ' (' + q('rec' + k, 0.1) + '..' + q('rec' + k, 0.9) + ')') : '   -').padEnd(23) +
        (q('w0k' + k, 0.5) + ' (' + q('w0k' + k, 0.1) + '..' + q('w0k' + k, 0.9) + ')').padEnd(24) + GATES[0][k].typ.toFixed(0).padStart(4) + ' / ' + stageV(k).toFixed(0));
}
