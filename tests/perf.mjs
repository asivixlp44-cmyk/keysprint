// Measured frame rates: desktop, a simulated weak laptop (CPU throttled 4x, 1366x768, Low), a simulated phone (touch, 844x390 and 390x844
// at 2x, Low, CPU 4x), each running the Sprintway fast, clicking away on a Power Key, at a checkpoint, beside the giant balls rolling by, at the spawn, and in a race with every bot; and
// a CPU profile of the unminified dev build. Run with Chrome on the integrated chip: LOW_GPU=1 node tests/perf.mjs [profile]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, measure, OUT, TEST_PORT } from './lib.mjs';

const PROFILE = process.argv[2] === 'profile';
const DEV = [
    { name: 'Desktop 1920x1080 High', w: 1920, h: 1080, q: 'high' },
    { name: 'Desktop 1600x900 Medium', w: 1600, h: 900, q: 'medium' },
    { name: 'Weak laptop 1366x768 Low, CPU 4x', w: 1366, h: 768, q: 'low', cpu: 4 },
    { name: 'Phone 844x390 @2x, Low, CPU 4x', w: 844, h: 390, dpr: 2, q: 'low', cpu: 4, touch: true },
    { name: 'Phone 390x844 @2x, Low, CPU 4x', w: 390, h: 844, dpr: 2, q: 'low', cpu: 4, touch: true },
];
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
const results = [];
const fmtM = (m) => `${m.fps} FPS${m.paced ? ' (every other refresh of ' + m.refresh + ')' : ''}, p50 ${m.p50} p95 ${m.p95} worst ${m.max} ms, ${m.over50} over 50 ms, work ${m.avgMs} ms, ${m.calls} calls, ${Math.round((m.tris || 0) / 1000)}k tris`;
// clicking on a Power Key: Auto Click on, and ten clicks a second by hand on top (the numbers, the key going down, the sounds)
const clicking = (page, on) => qa(page, (v) => { window.__qa.actions.toggleAuto(v); clearInterval(window.__clk); if (v) window.__clk = setInterval(() => window.__qa.click(1), 100); }, on);
try {
    // ONLY=2 runs just that one (0-based)
    for (const D of (PROFILE ? [DEV[2]] : process.env.ONLY ? [DEV[+process.env.ONLY]] : DEV)) {
        console.log('\n=== ' + D.name);
        const page = await open(browser, 'http://localhost:5733/', { ...D, uid: 'perf' + Date.now() });
        console.log('  load + join: ' + page.loadSecs + ' s; ' + await qa(page, () => window.__qa.gpu()));
        // a team, good shoes, some way along: what a player has after a while
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.give({ wins: 2000, shoe: 5, best: 8, allPals: true, speed: 60000 }); });
        await sleep(1500);
        const row = { name: D.name, load: page.loadSecs };
        // up the Sprintway at speed on the autopilot's feet: the stages going by, your team after you
        await qa(page, () => { window.__qa.close(); window.__qa.perf(true); window.__qa.auto(true); });
        await sleep(3000);
        if (PROFILE) {
            const c = await page.createCDPSession();
            await c.send('Profiler.enable');
            await c.send('Profiler.setSamplingInterval', { interval: 500 });
            await c.send('Profiler.start');
            await sleep(12000);
            const { profile } = await c.send('Profiler.stop');
            const self = new Map(), total = profile.samples.length;
            const byId = new Map(profile.nodes.map((n) => [n.id, n]));
            for (const s of profile.samples) { const n = byId.get(s).callFrame; const k = n.functionName + ' ' + n.url.split('/').pop().split('?')[0] + ':' + n.lineNumber; self.set(k, (self.get(k) || 0) + 1); }
            const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26);
            console.log('  CPU profile (self time):');
            for (const [k, v] of top) console.log('   ' + (v / total * 100).toFixed(1).padStart(5) + '%  ' + k);
            const reads = [...self.entries()].filter(([k]) => /getBoundingClientRect|getComputedStyle|offsetParent|offsetWidth|offsetHeight|clientWidth/.test(k)).reduce((a, [, v]) => a + v, 0);
            const audioCalls = [...self.entries()].filter(([k]) => /createOscillator|createGain|createBiquad|createBufferSource|setValueAtTime|exponentialRamp|\bconnect\b/.test(k)).reduce((a, [, v]) => a + v, 0);
            console.log('  layout and style reads: ' + (reads / total * 100).toFixed(2) + '%, audio-node calls: ' + (audioCalls / total * 100).toFixed(2) + '%');
            fs.writeFileSync(path.join(OUT, 'cpu.cpuprofile'), JSON.stringify(profile));
            console.log('  sections:', JSON.stringify(await qa(page, () => window.__qa.sections())));
        }
        row.run = await measure(page, 6);
        console.log('  running the Sprintway: ' + fmtM(row.run));
        // on a Power Key, clicking
        await qa(page, () => { window.__qa.auto(false); window.__qa.close(); if (window.__qa.P.down) window.__qa.actions.giveUp(); window.__qa.send('warp', { to: 'spawn' }); });
        await sleep(1500);
        await qa(page, () => { window.__qa.tpPost(0); window.__qa.look(0, 0.2, 20); });
        await sleep(700);
        await clicking(page, true);
        await sleep(800);
        await qa(page, () => window.__qa.perf(true));
        row.hang = await measure(page, 6);
        console.log('  clicking on a Power Key: ' + fmtM(row.hang));
        await clicking(page, false);
        // at a checkpoint far up the Sprintway, out on its side (the stages behind, the path on up past it)
        await qa(page, () => { window.__qa.give({ speed: 50000, noShade: true }); });
        await sleep(200);
        await qa(page, () => { window.__qa.teleport(13, 0, window.__qa.checkpoint(9).z + 8, Math.PI); window.__qa.look(0.15, 0.15, 20); });
        await sleep(900);
        await qa(page, () => window.__qa.perf(true));
        row.wall = await measure(page, 5);
        console.log('  at a checkpoint: ' + fmtM(row.wall));
        // out on the side of a safe keyboard while the giant balls roll by close (a ball's whole gap: one goes past)
        await qa(page, () => { const q = window.__qa; q.close(); q.give({ speed: 20, reviveAt: 0 }); const Z = q.zones()[4]; q.teleport(13, 0, Z.z, Math.PI); q.look(-0.7, 0.18, 18); });
        await sleep(1200);
        row.chase = await measure(page, 6.5);
        console.log('  beside the balls: ' + fmtM(row.chase));
        await qa(page, () => window.__qa.auto(false));
        // the spawn: what greets you
        await qa(page, () => { window.__qa.close(); window.__qa.send('warp', { to: 'spawn' }); });
        await sleep(1400);
        await qa(page, () => { window.__qa.close(); window.__qa.look(0, 0.2, 20); window.__qa.perf(true); });
        row.spawn = await measure(page, 5);
        console.log('  at the spawn: ' + fmtM(row.spawn));
        // a race: every bot
        await qa(page, () => window.__qa.play({ map: 0, lv: 20, now: true }));
        await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 30000 });
        await qa(page, () => window.__qa.auto(true));
        await sleep(2500);
        await qa(page, () => window.__qa.perf(true));
        row.race = await measure(page, 6);
        console.log('  in a race: ' + fmtM(row.race));
        await page.waitForFunction(() => !window.__qa.state().match, { timeout: 170000 });
        await qa(page, () => { window.__qa.close(); window.__qa.auto(false); });
        row.spikes = await qa(page, () => window.__qa.spikes());
        row.slow = await qa(page, () => window.__qa.slow());
        console.log('  spikes:', JSON.stringify(row.spikes.slice(-6)), 'slow:', JSON.stringify(row.slow.slice(-3)));
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) console.log('  errors:', errs.slice(0, 4));
        results.push(row);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(results, null, 1));
process.exit(0);
