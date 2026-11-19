// The balls bite, on a real screen: standing on the path between two wide keyboards, the next ball flattens you; out on the side of a
// safe keyboard they roll by; in the middle of one (still in their line) one has you; a revive's bubble keeps you safe a moment; and the
// path climbs (running up it you're always on its floor). Run: node tests/hazards.mjs
import { startServer, startVite, stopAll, launch, open, shot, sleep, qa, TEST_PORT } from './lib.mjs';
import { ZONES, RUN, BALLS, floorY } from '../shared/world.js';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
let bad = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) bad++; };
try {
    const page = await open(b, 'http://localhost:5733/', { w: 1280, h: 720, q: 'medium', uid: 'haz' + Date.now() });
    const deaths = () => qa(page, () => window.__qa.P.deaths || 0);
    // knocked out: the death card stays up until a button is pressed (once Boxity's countdown is over): BACK TO HOME ROW
    const back = async () => { await page.waitForFunction(() => !document.querySelector('#revive').classList.contains('wait'), { timeout: 8000 }).catch(() => {}); await qa(page, () => { if (window.__qa.P.dead) window.__qa.actions.giveUp(); }); await sleep(800); };
    const waitDeath = async (d0, secs) => { for (let i = 0; i < secs * 5; i++) { await sleep(200); if ((await deaths()) > d0) return true; } return false; };
    await qa(page, () => { const q = window.__qa; q.noWatch(true); q.close(); q.give({ speed: 2000, reviveAt: 0 }); });
    await sleep(800);
    const Z1 = ZONES[1], Z2 = ZONES[2];
    // on the path, in the balls' way
    let d0 = await deaths();
    await qa(page, (z) => { const q = window.__qa; q.close(); q.teleport(0, 0, z, Math.PI); q.look(0, 0.2, 18); }, Z1.z0 - 20);
    const flat = await waitDeath(d0, BALLS.T + 2);
    console.log('  ', await shot(page, 'haz-path'));
    check(flat, 'standing on the path: the next ball flattens you');
    const card = await qa(page, () => document.querySelector('#dcWhy').textContent);
    check(/giant ball/.test(card), 'the death card says so: "' + card + '"');
    await back(); await sleep(1500);
    // out on the side of a safe keyboard: two balls go by
    d0 = await deaths();
    await qa(page, (a) => { const q = window.__qa; q.close(); q.teleport(a.x, 0, a.z, Math.PI); q.look(-0.6, 0.15, 22); }, { x: RUN.safeX + 3, z: Z2.z });
    let seen = 0, near = false;
    for (let i = 0; i < BALLS.T * 2 * 5 + 5; i++) {
        await sleep(200);
        const n = await qa(page, (z) => window.__qa.balls(z - 6, z + 6).length, Z2.z);
        if (n && !near) { seen++; if (seen === 1) console.log('  ', await shot(page, 'haz-safe')); }
        near = n > 0;
    }
    check((await deaths()) === d0 && seen >= 1, 'out on the side of a safe keyboard: ' + seen + ' ball' + (seen === 1 ? '' : 's') + ' rolled by, no knock-out');
    // the middle of a safe keyboard: still in their line
    d0 = await deaths();
    await qa(page, (z) => { const q = window.__qa; q.close(); q.teleport(0, 0, z, Math.PI); }, Z2.z);
    check(await waitDeath(d0, BALLS.T + 2), 'in the middle of a safe keyboard (the balls\' line): flattened');
    // a revive: the bubble keeps you safe a moment (stood in the line straight away)
    await page.waitForFunction(() => !document.querySelector('#revive').classList.contains('wait'), { timeout: 8000 }).catch(() => {});
    await qa(page, () => window.__qa.actions.revive());
    await sleep(1400);
    d0 = await deaths();
    const rv = await qa(page, () => { const q = window.__qa, s = q.state(); q.teleport(0, s.y, s.z, Math.PI); return { shield: s.shield, z: s.z }; });
    const eta = await qa(page, (z) => { const b2 = window.__qa.balls(z - 200, z); return b2.length ? (z - Math.max(...b2)) : 999; }, rv.z);
    await sleep(1600);
    check(rv.shield && (await deaths()) === d0, 'revived: a moment in a bubble, safe even in the balls\' line (next ball ' + Math.round(eta) + ' studs off)');
    await back(); await sleep(1000);
    // the path climbs: up it on the autopilot, always on its floor
    await qa(page, () => { const q = window.__qa; q.close(); q.give({ speed: 2e5, reviveAt: 0 }); const cp = q.checkpoint(0); q.teleport(cp.x, 0, cp.z, Math.PI); q.auto(true); });
    let under = 0, maxY = 0, samples = 0;
    for (let i = 0; i < 60; i++) {
        await sleep(200);
        const s = await qa(page, () => window.__qa.state());
        if (s.dead) continue;
        samples++; maxY = Math.max(maxY, s.y);
        if (s.onGround && s.y < floorY(0, s.z) - 0.4) under++;
    }
    await qa(page, () => window.__qa.auto(false));
    console.log('  ', await shot(page, 'haz-climb'));
    check(samples > 20 && under === 0 && maxY > 4, 'the path climbs: up to ' + maxY.toFixed(1) + ' studs, never under its floor (' + samples + ' looks)');
    check(page.errors.length === 0, 'no console errors ' + JSON.stringify(page.errors));
} catch (e) { console.error(e); bad++; }
console.log(bad ? bad + ' FAILED' : 'all good');
await b.close(); stopAll();
process.exit(bad ? 1 : 0);
