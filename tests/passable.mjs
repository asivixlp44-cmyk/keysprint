// Every stage of every world, passable: the autopilot starts at a stage's start (out on the side of its checkpoint) at the stage's
// Recommended Speed (the pace that Speed runs you at, no upgrades) and has to reach the next checkpoint, paid by the server, dodging the
// giant balls the way a player does (out on the side of each wide keyboard until one's gone by and the way's clear, then run). A ball
// that has it knocks it out; it takes the death card's revive back into the stage (its Speed put back to the Recommended one) and goes
// again. The deaths it took on each stage are printed: they say which stages are too hard. Run: node tests/passable.mjs [world]
// (ONLY=k,k to pick stages, counted from 0; TRIES=n deaths before a stage counts as not passed, default 10)
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
import { WORLDS, WALLS_N, QUESTS, recSpeed, rebirthSpeed, maxWalk } from '../shared/config.js';
import { stageType } from '../shared/stages.js';
import { ZONES, runClear, BALLS } from '../shared/world.js';
const worlds = process.argv[2] !== undefined ? [+process.argv[2]] : [0, 1, 2, 3];
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const TRIES = +(process.env.TRIES || 10), SECS = 150;
// the layout on its own (no runner): each stage's three runs, how long in every ball's gap you can set off and make the next wide
// keyboard at the Recommended Speed's pace (the tightest of the three)
console.log('the layout: the tightest window to set off in, of the three runs in each stage, at its Recommended Speed (seconds of every ' + BALLS.T + ')');
{
    const cells = [];
    for (let k = 0; k < WALLS_N; k++) {
        const v = maxWalk({ speed: recSpeed(0, k) });
        let worst = 1e9;
        for (const Z of ZONES.filter((o) => o.k === k)) {
            const N = ZONES[Z.idx + 1];
            if (!N) continue;
            let ok = 0, n = 0;
            for (let t = 0; t < BALLS.T; t += 0.02) { n++; if (runClear(1000 + t, Z.z0 + 3, N.z1 - 5, v * 0.95)) ok++; }
            worst = Math.min(worst, ok / n * BALLS.T);
        }
        cells.push((k + 1) + ': ' + worst.toFixed(2) + (worst < 0.3 ? ' TIGHT' : ''));
    }
    console.log('  ' + cells.join(', '));
}
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5733/', { w: 960, h: 540, q: 'low', uid: 'pass' + Date.now() });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
let fails = 0;
const table = [];
await sleep(800);
await ev((qn) => { const q = window.__qa; q.close(); q.noWatch(true); q.give({ openWorlds: true, qi: qn }); }, QUESTS.length);
for (const w of worlds) {
    await ev((ww) => { const q = window.__qa; q.auto(false); q.close(); q.give({ openWorlds: true }); q.send('world', { w: ww }); }, w);
    await sleep(3500);
    const row = [];
    for (let k = 0; k < WALLS_N; k++) {
        if (only && !only.includes(k)) continue;
        // the Recommended Speed; rebirths enough that the autopilot never rebirths at the spawn (that would start it at 0 Speed)
        const sp = recSpeed(w, k), type = stageType(w, k);
        let reb = 0; while (rebirthSpeed(reb) <= sp * 1.5) reb++;
        const set = { speed: sp, rebirths: reb, best: k, gems: 1e5, reviveAt: 0, ups: { feet: 0, spring: 0 } };
        // (a death at the very end of the last stage: let it land first, or its word to the server comes after the move below)
        // (still knocked out from the last stage: the death card's BACK TO HOME ROW, once Boxity's countdown is over)
        for (let i = 0; i < 40; i++) { await ev(() => { const q = window.__qa; q.auto(false); if (q.P.dead) q.actions.giveUp(); }); if (!(await ev(() => window.__qa.state().dead))) break; await sleep(200); }
        await sleep(600);
        await ev((s) => { const q = window.__qa; q.auto(false); q.close(); q.give(s); }, set);
        await sleep(500);
        await ev((kk) => { const q = window.__qa, cp = q.checkpoint(kk); q.teleport(cp.x, 0, cp.z, Math.PI); q.look(0, 0.2, 22); }, k);
        await sleep(700);
        const s0 = await ev(() => window.__qa.state());
        const t0 = Date.now();
        await ev(() => window.__qa.auto(true));
        let ok = false, paid = false, deaths = 0, lastDeaths = s0.deaths, revives0 = s0.revives, why = '', top = 0;
        while (Date.now() - t0 < SECS * 1000) {
            await sleep(300);
            // (a panel or a question would stop the autopilot's feet: it says no thanks)
            const s = await ev(() => { const q = window.__qa; q.close(); return q.state(); });
            top = Math.max(top, s.walk);
            if (s.deaths > lastDeaths) {
                deaths += s.deaths - lastDeaths; lastDeaths = s.deaths;
                // back to the Recommended Speed for the next go
                await ev((st) => window.__qa.give({ speed: st.speed, reviveAt: 0 }), set);
                if (deaths > TRIES) { why = 'more than ' + TRIES + ' deaths'; break; }
            }
            if (!s.dead && s.stage > k && s.stage <= k + 2 && !s.match) { ok = true; paid = s.wins > s0.wins; break; }
        }
        // (the server's word on it: a moment behind)
        if (ok && !paid) for (let i = 0; i < 10 && !paid; i++) { await sleep(200); paid = (await ev(() => window.__qa.state().wins)) > s0.wins; }
        const revives = (await ev(() => window.__qa.state().revives)) - revives0;
        await ev(() => window.__qa.auto(false));
        if (!ok && !why) why = 'not through in ' + SECS + ' s';
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        const good = ok && paid;
        console.log((good ? '  ok  ' : 'FAIL  ') + WORLDS[w].name + ' stage ' + (k + 1) + ' ' + type + ' (Speed ' + sp + ', run ' + maxWalk({ speed: sp }).toFixed(1) + '): ' + (ok ? 'through in ' + secs + ' s' + (paid ? '' : ' but the server never paid') : why) + ', ' + deaths + ' death' + (deaths === 1 ? '' : 's') + (revives ? ', ' + revives + ' revive' + (revives === 1 ? '' : 's') : '') + (top > maxWalk({ speed: sp }) + 0.5 ? ' (up to ' + top + ' studs/s)' : ''));
        row.push({ k, type, deaths, ok: good });
        if (!good) { fails++; await shot(page, 'pass-w' + w + '-k' + k + '-' + type); }
        // (the next stage's start: no revive offer left over from this one)
        await ev(() => { const q = window.__qa; if (q.state().revive) q.ui.reviveHide(); });
    }
    table.push({ w, row });
}
console.log('\ndeaths per stage (x: not passed)');
for (const { w, row } of table) console.log('  ' + WORLDS[w].name.padEnd(16) + row.map((r) => (r.ok ? String(r.deaths) : 'x' + r.deaths).padStart(4)).join(''));
const all = table.flatMap((t) => t.row.map((r) => ({ ...r, w: t.w }))).sort((a, b) => b.deaths - a.deaths).slice(0, 6).filter((r) => r.deaths > 0);
if (all.length) console.log('hardest: ' + all.map((r) => WORLDS[r.w].name + ' ' + (r.k + 1) + ' ' + r.type + ' ' + r.deaths).join(', '));
console.log('errors', page.errors);
console.log(fails ? fails + ' stages not passed' : 'every stage passed');
await b.close(); stopAll();
process.exit(fails ? 1 : 0);
