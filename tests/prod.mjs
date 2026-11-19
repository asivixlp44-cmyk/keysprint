// The production build with real input only: no QA hooks, the keyboard, mouse and touch as a player uses them, the game's
// own words on screen as the only way to know what happened. Run: node tests/prod.mjs (it builds first)
import { execSync } from 'node:child_process';
import { startServer, stopAll, launch, open, sleep, shot, ROOT, TEST_PORT } from './lib.mjs';
import { wallZ, ZONES, runClear, BALLS } from '../shared/world.js';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const parse = (t) => { const n = parseFloat(String(t).replace(/,/g, '')); return /K$/.test(t) ? n * 1000 : /M$/.test(t) ? n * 1e6 : /B$/.test(t) ? n * 1e9 : n; };
const num = async (page, sel) => parse(await text(page, sel));
const visible = (page, sel) => page.$eval(sel, (e) => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).catch(() => false);
const fill = (page) => page.$eval('#wbFill', (e) => parseFloat((e.style.transform.match(/scaleX\(([\d.]+)\)/) || [0, 0])[1]));
const toasts = (page) => page.$eval('#toasts', (e) => e.textContent);
const center = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
async function waitFor(fn, secs, every) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const v = await fn(); if (v) return v; await sleep(every || 150); } return null; }
const modalUp = (page) => page.$eval('#modal', (e) => !e.hidden && !!e.querySelector('.panel'));
const closeModal = async (page) => { if (await page.$eval('#modal', (e) => !e.hidden)) { await page.click('#modal [data-close]').catch(() => {}); await sleep(250); } };
// where you are on the Sprintway, from the stage bar at the top ("STAGE N", how far through it to its gate): { k, z }, or null off it
async function whereRun(page) {
    if (!(await visible(page, '#wallBar'))) return null;
    const m = (await text(page, '#wbName')).match(/STAGE (\d+)/);
    if (!m) return null;
    const k = +m[1] - 1, f = await fill(page);
    return { k, z: wallZ(k) - f * (wallZ(k) - wallZ(k + 1)) };
}
// what a click gives right now, from the Speed bar ("+2 / CLICK")
const perClick = async (page) => parse((await text(page, '#lvTxt')).replace(/^\+/, '').replace(/ \/ CLICK$/, ''));
// ----- the Sprintway with real keys (or the stick): when to run comes from the balls' own timetable (shared/world.js, on the server's
// clock: this machine's), where you are along the course from the stage bar; the path's rails keep you straight. io.set({ up, left,
// right }): the keys W / A / D held, or the stick pushed that way -----
// (one look at the page, not three: the runs are timed on it)
const zNow = (page) => page.evaluate(() => { const bar = document.querySelector('#wallBar'); if (!bar || bar.hidden || getComputedStyle(bar).display === 'none') return null; const m = document.querySelector('#wbName').textContent.match(/STAGE (\d+)/); if (!m) return null; const t = document.querySelector('#wbFill').style.transform.match(/scaleX\(([\d.]+)\)/); return { k: +m[1] - 1, f: t ? parseFloat(t[1]) : 0 }; }).then((r) => (r ? wallZ(r.k) - r.f * (wallZ(r.k) - wallZ(r.k + 1)) : null));
const holdFor = async (io, dir, ms) => { await io.set(dir); await sleep(ms); await io.set({}); };
// to the first checkpoint the way a player gets there quickest: B ("to your best stage"; on a phone, Teleport's Stage 1), which puts you out
// on its east side. Returns where you are
async function toFirstCheckpoint(page, io, secs) {
    await io.toStage();
    const t0 = Date.now();
    let z = null;
    while (Date.now() - t0 < secs * 1000 && z === null) { await sleep(100); z = await zNow(page); }
    await sleep(900);
    return z === null ? null : await zNow(page);
}
// one run, from out on the side (side: 1 east, -1 west) of wide keyboard F up to the next one Z: wait until the way's clear, in onto the
// path (up and across: the keyboard's edge holds you until you're on it), up it hugging the rail on your side, and out to Z's side
// (stop: where to stop running up, a checkpoint's middle to be paid for it). 'dead' if a ball got you
async function runTo(page, io, F, Z, v, secs, stop, side) {
    const t0 = Date.now(), inward = side > 0 ? { left: true } : { right: true }, outward = side > 0 ? { right: true } : { left: true };
    // (up to the keyboard's north end first: its edge holds you there, beside the path)
    await io.set({ up: true });
    let z = await zNow(page);
    while (Date.now() - t0 < 2500 && z > F.z0 + 0.6) { await sleep(40); z = (await zNow(page)) ?? z; }
    await io.set({});
    await sleep(150);
    z = (await zNow(page)) ?? z;
    while (Date.now() - t0 < secs * 1000 && !runClear(Date.now() / 1000, z, Z.z1 - 5, v * 0.8, 1.0)) { await sleep(30); z = (await zNow(page)) ?? z; }
    await io.set({ up: true, ...inward });
    while (Date.now() - t0 < secs * 1000) { z = (await zNow(page)) ?? z; if (z < F.z0 - 1.5) break; await sleep(25); }
    await io.set({ up: true, ...outward });
    while (Date.now() - t0 < secs * 1000) { if (await visible(page, '#revive')) { await io.set({}); return 'dead'; } z = (await zNow(page)) ?? z; if (z < (stop ?? Z.z1 - 3)) break; await sleep(25); }
    await holdFor(io, outward, Math.max(300, 9 / v * 1000));
    await sleep(300);
    return (await visible(page, '#revive')) ? 'dead' : 'ok';
}
// Stage 1 by hand: to the first checkpoint, its three runs (two safe keyboards, then the Stage 2 checkpoint: Wins). Returns what it saw
async function runStage1(page, io, v) {
    const seen = { inRun: false, arch: false, toast: '', dead: false, wins: 0, toastMs: 0, pushedBy: [], runs: 0, at: null };
    const w0 = await num(page, '#winsVal');
    // every toast, when it came and went (a few at once push the oldest out early)
    await page.evaluate(() => {
        window.__toasts = [];
        new MutationObserver((ms) => { const now = performance.now(); for (const m of ms) { for (const n of m.addedNodes) window.__toasts.push({ t: n.textContent, at: now, el: n }); for (const n of m.removedNodes) { const r = window.__toasts.find((x) => x.el === n && !x.gone); if (r) r.gone = now; } } }).observe(document.querySelector('#toasts'), { childList: true });
    });
    seen.at = await toFirstCheckpoint(page, io, 20);
    await shot(page, 'prod-cp0-' + (page.viewport().width));
    if (process.env.PROD_DEBUG) console.log('   at the first checkpoint:', JSON.stringify(await whereRun(page)), await page.$eval('#wallBar', (e) => e.hidden + ' ' + e.className), (await text(page, '#wbName')));
    seen.inRun = seen.at !== null && /STAGE 1/.test(await text(page, '#wbName').catch(() => ''));
    for (let i = 1; i <= 3 && seen.inRun; i++) {
        const r = await runTo(page, io, ZONES[i - 1], ZONES[i], v, 40, i === 3 ? wallZ(1) - 3 : null, 1);
        if (r === 'dead') { seen.dead = true; break; }
        seen.runs++;
    }
    await sleep(900);
    seen.wins = (await num(page, '#winsVal')) - w0;
    // the "+N Wins" toast: shown, for how long, and what came on top of it
    const tl = await page.evaluate(() => { const now = performance.now(), L = window.__toasts, i = L.findIndex((x) => /\+\d+ Wins/.test(x.t)); if (i < 0) return null; const w = L[i]; return { t: w.t, ms: Math.round((w.gone || now) - w.at), after: L.slice(i + 1).filter((x) => x.at < (w.gone || now) + 1).map((x) => x.t.slice(0, 40)) }; });
    if (tl) { seen.arch = true; seen.toast = tl.t; seen.toastMs = tl.ms; seen.pushedBy = tl.after; }
    return seen;
}
// from the west side of a wide keyboard, step into the balls' line and stand there: the next ball has you (the death card)
async function standInLine(page, io, v) {
    await holdFor(io, { left: true }, 38 / v * 1000);
    return waitFor(() => visible(page, '#revive'), BALLS.T + 3, 80);
}

// always this code, not a build left over from before
execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
await startServer(TEST_PORT, {});
const browser = await launch();
try {
    console.log('--- desktop, keyboard and mouse');
    const url = 'http://localhost:' + TEST_PORT + '/';
    const page = await open(browser, url, { w: 1280, h: 720, uid: 'prod' + Date.now() });
    console.log('  load + join', page.loadSecs, 's');
    check(await page.evaluate(() => !window.__qa), 'no QA hooks in the build');
    check(await visible(page, '#hud') && await visible(page, '#menuGrid') && await visible(page, '#botArea'), 'no start menu: straight in the world, the HUD up');
    check(/^0 SPEED$/.test((await text(page, '#powerLine')).trim()) && /^\+1 \/ CLICK$/.test(await text(page, '#lvTxt')) && /^STAGE 2 AT 20$/.test(await text(page, '#lvNum')) && /^Your Max Speed: 16$/.test(await text(page, '#csMax')) && /^ALL YOUR BOOSTS: x1$/.test((await text(page, '#boostLine')).trim()) && (await text(page, '#autoTxt')) === 'OFF', 'the HUD\'s words: "' + (await text(page, '#powerLine')).trim() + '", "' + await text(page, '#lvTxt') + '", "' + await text(page, '#lvNum') + '", "' + await text(page, '#csMax') + '", "' + (await text(page, '#boostLine')).trim() + '", AUTO ' + await text(page, '#autoTxt'));
    // what a click is worth: all your boosts (x1 to start)
    const boost = parseFloat((await text(page, '#boostVal')).slice(1)) || 1;
    await sleep(1200);
    // the first thing: a click is Speed, +1 times all your boosts. E ten times
    const p0 = await num(page, '#powerVal');
    for (let i = 0; i < 10; i++) { await page.keyboard.press('KeyE'); await sleep(140); }
    await sleep(400);
    const p1 = await num(page, '#powerVal');
    check(Math.abs(p1 - p0 - 10 * boost) < 0.6 * boost, 'E ten times: +' + (p1 - p0) + ' Speed (all your boosts x' + boost + '): ' + (await text(page, '#powerLine')).trim());
    // the CLICK button by the mouse, nine times; then a click on the world itself, the 20th: a MEGA click (x10)
    const cbc = await center(page, '#clickBtn');
    for (let i = 0; i < 9; i++) { await page.mouse.click(cbc.x, cbc.y); await sleep(140); }
    await sleep(400);
    const p2 = await num(page, '#powerVal');
    check(Math.abs(p2 - p1 - 9 * boost) < 0.6 * boost, 'the CLICK button nine times: +' + (p2 - p1) + ' Speed');
    await page.mouse.click(900, 300); await sleep(500);
    const p3 = await num(page, '#powerVal');
    check(Math.abs(p3 - p2 - 10 * boost) < 0.6 * boost, 'a click on the world, the 20th: a MEGA click, +' + (p3 - p2) + ' Speed (x10)');
    check(/^STAGE 3 AT 90$/.test(await text(page, '#lvNum')) && /Fast enough for Stage 2/.test(await toasts(page)), 'past 20 Speed: "Fast enough for Stage 2", the bar on to "' + await text(page, '#lvNum') + '"');
    await sleep(600);
    // up the Sprintway by hand: Stage 1's three runs, waiting out on the side of each wide keyboard for a ball to go by (Wins at the
    // Stage 2 checkpoint); then a step into the balls' line: flattened
    const kb = { set: async (d) => { for (const [k, on] of [['KeyW', d.up], ['KeyA', d.left], ['KeyD', d.right]]) { if (on) await page.keyboard.down(k); else await page.keyboard.up(k); } }, toStage: () => page.keyboard.press('KeyB') };
    const vTop = parse((await text(page, '#csMax')).match(/[\d.]+/)[0]);
    const run = await runStage1(page, kb, vTop);
    check(run.inRun, 'onto the Sprintway: STAGE 1 at the top (out beside the path at ' + (run.at !== null ? Math.round(run.at) : '?') + ')');
    check(run.runs === 3 && !run.dead, 'dodging by hand: out on the side of each safe keyboard while a ball rolls by, then a run (' + run.runs + ' of 3 runs)');
    check(run.arch && run.wins >= 3, 'onto the Stage 2 checkpoint: "' + run.toast + '", ' + await text(page, '#winsVal') + ' Wins');
    check(run.toastMs >= 1000, 'the Wins toast stays up to be read: ' + run.toastMs + ' ms' + (run.pushedBy.length ? ' (then ' + run.pushedBy.join(' | ') + ')' : ''));
    check(!!(await standInLine(page, kb, vTop)), 'a step into the balls\' line: the next ball flattens you');
    await shot(page, 'prod-dead');
    const rvT = (await page.$eval('#rvTxt', (e) => e.innerText)).replace(/\s+/g, ' ');
    check(/Stage 2/.test(rvT) && (await text(page, '#rvTag')) === 'FREE' && (await visible(page, '#rvHome')), 'the death card in the middle: "' + rvT + '" ' + await text(page, '#rvTag') + ', BACK TO Home Row beside it');
    // (the buttons wait for Boxity's death-screen countdown: 0 at once with the stand-in SDK)
    await waitFor(async () => !(await page.$eval('#revive', (e) => e.classList.contains('wait'))), 8);
    await page.click('#rvBtn');
    const back = await waitFor(async () => { const r = await whereRun(page); return r && r.k === 1 && !(await visible(page, '#revive')) && r; }, 5);
    check(!!back, 'the revive by its button: back in stage 2 (' + (back ? Math.round(back.z) : '?') + ')');
    // in a stage: SKIP on the stage bar, asks first (Gems); Cancel
    check(await visible(page, '#bSkip'), 'in a stage: SKIP on the stage bar');
    await page.click('#bSkip'); await sleep(250);
    const skq = await page.$eval('#confirm', (e) => !e.hidden && /SKIP/.test(e.textContent) && /💎/.test(e.textContent));
    await page.click('#confirm [data-no]').catch(() => {}); await sleep(200);
    check(skq && await page.$eval('#confirm', (e) => e.hidden), 'SKIP asks first, for Gems; Cancel');
    await sleep(500);
    await shot(page, 'prod-revived');
    // Custom Speed: home, typed into (the keys go to the box, not the game), then a run to the Sprintway: slower, by the time it takes
    await page.keyboard.press('KeyR');
    await waitFor(async () => !(await visible(page, '#wallBar')), 5);
    await sleep(1500);
    const walkTime = async () => {
        // (round the drain: left a moment first, as far at either speed)
        const cur = parse((await text(page, '#csCur')).match(/[\d.]+/)[0]);
        await page.keyboard.down('KeyA'); await sleep(15 / cur * 1000); await page.keyboard.up('KeyA');
        const t0 = Date.now();
        await page.keyboard.down('KeyW');
        const got = await waitFor(() => visible(page, '#wallBar'), 25, 50);
        await page.keyboard.up('KeyW');
        const secs = (Date.now() - t0) / 1000;
        await page.keyboard.press('KeyR');
        await waitFor(async () => !(await visible(page, '#wallBar')), 5);
        await sleep(1500);
        return got ? secs : 99;
    };
    const fast = await walkTime();
    const max0 = await text(page, '#csMax');
    await page.click('#csIn', { clickCount: 3 });
    const s0 = await num(page, '#powerVal');
    await page.keyboard.type('8');
    await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE');
    await page.keyboard.down('KeyW'); await sleep(600); await page.keyboard.up('KeyW');
    await sleep(300);
    const s1 = await num(page, '#powerVal');
    const typed = await page.$eval('#csIn', (e) => e.value);
    await page.keyboard.press('Enter');
    await sleep(300);
    check(s1 === s0 && typed === '8', 'typing in the Custom Speed box (E and W too): no click, no run (' + s0 + ' → ' + s1 + '), the box says ' + typed);
    check(/Current: 8$/.test(await text(page, '#csCur')) && /Running speed: 8/.test(await toasts(page)), 'OK: "' + await text(page, '#csCur') + '" (' + max0 + ')');
    const slow = await walkTime();
    check(slow < 99 && slow > fast * 1.4, 'and it runs slower: ' + slow.toFixed(1) + ' s to the Sprintway, against ' + fast.toFixed(1) + ' s at the top');
    await page.click('#csIn', { clickCount: 3 });
    await page.keyboard.type('999');    await page.click('#csIn', { clickCount: 3 });
    await page.keyboard.type('999');
    await page.click('#csOk');
    await sleep(300);
    const top = (await text(page, '#csMax')).match(/\d+/)[0];
    check((await text(page, '#csCur')) === 'Current: ' + top, '999 and OK: back to the top: "' + await text(page, '#csCur') + '"');
    // a code typed in: some Wins to spend
    await page.click('#bCodes'); await sleep(300);
    await page.type('#codeIn', 'enter'); await page.keyboard.press('Enter'); await sleep(600);
    check(/Code redeemed/.test(await toasts(page)), 'a code typed in (the Codes button): ' + ((await toasts(page)).match(/Code redeemed[^🏆🎯✅]*/) || [''])[0]);
    await closeModal(page);
    // an upgrade
    await page.click('#bWork'); await sleep(300);
    const ub = await page.$('#modal [data-act="upgrade"].g-green');
    if (ub) await ub.click();
    check(!!ub && !!(await waitFor(async () => /Upgraded/.test(await toasts(page)), 4)), 'an upgrade bought by its button');
    await closeModal(page);
    // an Egg, from the Pets panel
    await page.click('#bPals'); await sleep(300);
    await page.click('#modal [data-tab="jaws"]'); await sleep(250);
    await page.click('#modal [data-act="hatch"][data-n="1"]');
    const hatched = await waitFor(() => visible(page, '#hatch'), 3);
    await sleep(1200);
    await shot(page, 'prod-hatch');
    check(!!hatched, 'an Egg hatched (Pets, Eggs)');
    await waitFor(async () => !(await visible(page, '#hatch')), 5);
    await closeModal(page);
    // every menu button opens its panel, its X closes it; the tabs of the tabbed ones
    let allOpen = true;
    for (const b of ['#bRebirth', '#bWork', '#bPals', '#bTele', '#bQuests', '#bDaily', '#bSpin', '#bCodes', '#bSettings', '#bShop', '#bGift', '#winsBox', '#gemsBox', '#bStats', '#bLvPlus', '#bSpeed']) {
        await page.click(b); await sleep(220);
        if (!(await modalUp(page))) { check(false, b + ' opens its panel'); allOpen = false; }
        const tabs = await page.$$eval('#modal [data-tab]', (e) => e.map((x) => x.dataset.tab));
        for (const t of tabs) {
            await page.click('#modal [data-tab="' + t + '"]'); await sleep(150);
            if (!(await page.$eval('#modal [data-tab="' + t + '"]', (e) => e.classList.contains('on')))) { check(false, b + ': its ' + t + ' tab'); allOpen = false; }
        }
        await page.click('#modal [data-close]'); await sleep(160);
        if (await page.$eval('#modal', (e) => !e.hidden)) { check(false, b + ': its X closes it'); allOpen = false; }
    }
    check(allOpen, 'every menu button opens its panel (each tab of Pets, Teleport, Shop too), its X closes it');
    const snd0 = await page.$eval('#soundIc', (e) => e.className);
    await page.click('#bSound'); await sleep(250);
    const snd1 = await page.$eval('#soundIc', (e) => e.className);
    check(snd1 !== snd0 && /Sound off/.test(await toasts(page)), 'Sound: off by its button (' + snd1 + ')');
    await page.click('#bSound'); await sleep(250);
    check((await page.$eval('#soundIc', (e) => e.className)) === snd0, 'and on again');
    await page.click('#bX2'); await sleep(250);
    const x2q = await page.$eval('#confirm', (e) => !e.hidden && /2X SPEED/.test(e.textContent));
    await page.click('#confirm [data-no]').catch(() => {}); await sleep(200);
    check(x2q && await page.$eval('#confirm', (e) => e.hidden), '2X SPEED asks first; Cancel');
    await page.click('#bW2'); await sleep(250);
    const w2q = await page.$eval('#confirm', (e) => !e.hidden && /x2 WINS/.test(e.textContent));
    await page.click('#confirm [data-no]').catch(() => {}); await sleep(200);
    check(w2q && await page.$eval('#confirm', (e) => e.hidden), 'x2 WINS asks first; Cancel');
    // a Speed pack (the Speed button under the bar: the Shop's Speed tab), with Gems from a code
    await page.click('#bCodes'); await sleep(300);
    await page.type('#codeIn', 'click'); await page.keyboard.press('Enter'); await sleep(700);
    await closeModal(page);
    const spL = (await text(page, '#spdT')).trim();
    await page.click('#bSpeed'); await sleep(300);
    const spTab = await page.$eval('#modal [data-tab="speed"]', (e) => e.classList.contains('on')).catch(() => false);
    const sk0 = await num(page, '#powerVal');
    const pack = await page.$('#modal [data-act="spack"][data-i="0"]');
    const packTxt = pack ? await page.$eval('#modal .card b.o1', (e) => e.textContent) : '';
    if (pack) await pack.click();
    const sk1 = await waitFor(async () => { const v = await num(page, '#powerVal'); return v > sk0 + 100 && v; }, 4);
    check(spTab && !!pack && !!sk1, 'the Speed button ("' + spL + '") opens the Shop on Speed; a pack bought with Gems from a code: "' + packTxt + '", ' + sk0 + ' → ' + sk1);
    await closeModal(page);
    await page.click('#bSpin'); await sleep(250);
    const canSpin = await page.$eval('#modal [data-act="spin"]', (e) => !e.disabled).catch(() => false);
    if (canSpin) { await page.click('#modal [data-act="spin"]'); await sleep(3900); check(/YOU WON/.test(await text(page, '#popT')), 'the wheel by its button: ' + await text(page, '#popS')); } else check(false, 'a spin to use');
    await closeModal(page);
    // the Train button: to your best Power Key by itself; every click on it is +N times your boosts (the Speed bar says so)
    const off = await perClick(page);
    await page.click('#bTread');
    check(/To your best Power Key/.test(await toasts(page)), 'the Train button: ' + ((await toasts(page)).match(/To your best Power Key!?/) || [''])[0]);
    const per = await waitFor(async () => { const v = await perClick(page); return v > off && v; }, 8);
    check(!!per, 'onto a Power Key by itself: "' + await text(page, '#lvTxt') + '" (off it: +' + off + ')');
    await sleep(400);
    const k0 = await num(page, '#powerVal');
    for (let i = 0; i < 5; i++) { await page.keyboard.press('KeyE'); await sleep(150); }
    await sleep(400);
    const k1 = await num(page, '#powerVal');
    check(per && Math.abs(k1 - k0 - 5 * per) < 0.6 * per, 'five clicks on it: +' + Math.round(k1 - k0) + ' Speed (+' + per + ' a click)');
    await shot(page, 'prod-key');
    // Auto Click: on by its button, it clicks by itself (3 a second to start); off again
    await page.click('#autoBtn'); await sleep(300);
    check((await text(page, '#autoTxt')) === 'ON' && /Auto Click ON/.test(await toasts(page)), 'AUTO: ' + await text(page, '#autoTxt') + ', "' + ((await toasts(page)).match(/Auto Click ON[^🏆⌨️]*/) || [''])[0].trim() + '"');
    const a0 = await num(page, '#powerVal');
    await sleep(2000);
    const a1 = await num(page, '#powerVal');
    const autoN = (a1 - a0) / (per || 1);
    check(autoN >= 4 && autoN <= 9, 'and it clicks by itself: ' + autoN.toFixed(1) + ' clicks\' worth in 2 s');
    await page.click('#autoBtn'); await sleep(300);
    check((await text(page, '#autoTxt')) === 'OFF', 'AUTO off again');
    // the daily reward; claim it with its button
    await page.click('#bDaily'); await sleep(300);
    const canDaily = await page.$eval('#modal [data-act="daily"]', (e) => !e.disabled).catch(() => false);
    if (canDaily) { await page.click('#modal [data-act="daily"]'); await sleep(600); check(/Next reward/.test(await page.$eval('#modal', (e) => e.textContent)), 'the daily reward claimed by its button'); } else check(false, 'a daily reward to claim');
    await closeModal(page);
    // a race, all of it, with real input
    await page.click('#bPlay'); await sleep(400);
    check(await visible(page, '#queueBar') && /1 \/ 6 found/.test(await text(page, '#qFound')), 'RACE: the queue says who was found: ' + await text(page, '#qFound'));
    await page.click('#qCancel'); await sleep(400);
    check(!(await visible(page, '#queueBar')), 'cancel: out of the queue');
    await page.click('#bPlay');
    const inM = await waitFor(() => visible(page, '#matchHud'), 20);
    check(!!inM, 'the queue runs out: the course, the start line');
    await shot(page, 'prod-line');
    const go = await waitFor(async () => /RUN/.test(await text(page, '#countdown')), 12);
    check(!!go, 'the count, the gun');
    await page.keyboard.down('KeyW'); await page.keyboard.down('Space');
    const wl = await waitFor(async () => { const rows = await page.$$eval('#scores .sr.me em', (e) => e.map((x) => x.textContent)); return rows.length && (parseInt(rows[0], 10) >= 10 || /✓|❄️/.test(rows[0])); }, 25);
    check(!!wl, 'W and SPACE: up the lane on the board: ' + await page.$$eval('#scores .sr.me em', (e) => e.map((x) => x.textContent).join()));
    await shot(page, 'prod-race');
    const res = await waitFor(() => page.$eval('#modal', (e) => !e.hidden && /Race again/.test(e.textContent)), 140);
    await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
    check(!!res, 'the race ends: the results, with a prize');
    await shot(page, 'prod-results');
    await closeModal(page);
    check(!(await visible(page, '#matchHud')) && await visible(page, '#menuGrid'), 'back in the world');
    check(page.errors.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 4)));
    await page.close();

    console.log('--- what the game tells Bloxity (an SDK stand-in)');
    const STUB = 'window.__log = []; window.Legion = { SDK: { init() { window.__log.push("init"); }, portal: { isEmbeddedInLegion() { return false; } }, game: { loadingStep() {}, updateRoom(r) { window.__log.push(r ? "room:yes" : "room:no"); }, loadingEnd() { window.__log.push("loadingEnd"); window.__startHidden = document.querySelector("#start").hidden; } }, on() {}, off() {} } };';
    const sdkPage = await open(browser, url, { w: 1280, h: 720, uid: 'prodsdk' + Date.now(), sdkStub: STUB });
    await sleep(800);
    const lg = await sdkPage.evaluate(() => window.__log);
    check(lg.filter((x) => x === 'loadingEnd').length === 1, 'loadingEnd() is called once: ' + lg.join(', '));
    check(lg.indexOf('room:yes') >= 0 && lg.indexOf('room:yes') < lg.indexOf('loadingEnd'), 'after it has joined a server, with no menu in between');
    check(await sdkPage.evaluate(() => window.__startHidden === true), 'with the loading screen already gone');
    check(sdkPage.errors.length === 0, 'no console errors: ' + JSON.stringify(sdkPage.errors.slice(0, 4)));
    await sdkPage.close();

    console.log('--- a phone in portrait, touch only');
    const ph = await open(browser, url, { w: 390, h: 844, dpr: 2, touch: true, uid: 'prodph' + Date.now() });
    console.log('  load + join', ph.loadSecs, 's');
    await sleep(1500);
    check(await visible(ph, '#stick') && await visible(ph, '#lickBtn') && await visible(ph, '#jumpBtn') && await visible(ph, '#clickBtn') && await visible(ph, '#autoBtn'), 'the stick, DASH, JUMP, CLICK! and AUTO are there');
    const stick = await ph.$eval('#stick', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
    const cdp = await ph.createCDPSession();
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const tapAt = async (p, id) => { await touch('touchStart', [{ x: p.x, y: p.y, id }]); await sleep(50); await touch('touchEnd', []); };
    // the thumbs: the stick (id 1, pushed up, or up and to the left), JUMP held (id 2)
    const th = { dx: 0, dy: -stick.r, jump: null };
    const thumbs = () => [{ x: stick.x + th.dx, y: stick.y + th.dy, id: 1 }, ...(th.jump ? [{ x: th.jump.x, y: th.jump.y, id: 2 }] : [])];
    // CLICK! by touch, three taps; then a tap on the world: a click too
    const pw0 = await num(ph, '#powerVal'), cbp = await center(ph, '#clickBtn');
    for (let i = 0; i < 3; i++) { await tapAt(cbp, 5 + i); await sleep(160); }
    await sleep(400);
    const pw1 = await num(ph, '#powerVal');
    check(pw1 >= pw0 + 2.5, 'CLICK! by touch, three taps: Speed ' + pw0 + ' → ' + pw1);
    await tapAt({ x: 200, y: 480 }, 9); await sleep(500);
    check(await num(ph, '#powerVal') > pw1, 'a tap on the world is a click: ' + await text(ph, '#powerVal'));
    // (the stick pulled down a moment: away from the Sprintway, to test DASH with a thumb on it)
    th.dx = 0; th.dy = stick.r * 0.8;
    await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]);
    await touch('touchMove', thumbs());
    await sleep(500);
    // a thumb on the stick, the other on DASH (a touch list: a new finger in it goes down; touchEnd lifts the fingers it lists)
    const lb = await center(ph, '#lickBtn');
    await touch('touchMove', [...thumbs(), { x: lb.x, y: lb.y, id: 2 }]);
    await sleep(60);
    const f0 = await ph.$eval('#lickFill', (e) => e.style.transform);
    await touch('touchEnd', [{ x: lb.x, y: lb.y, id: 2 }]);
    await sleep(100);
    check(/scaleY\(0\.[0-8]/.test(await ph.$eval('#lickFill', (e) => e.style.transform)) || /scaleY\(0\.[0-8]/.test(f0), 'DASH with a thumb still on the stick: the button empties and fills back');
    await touch('touchEnd', []);
    await sleep(400);
    // the stick up the Sprintway: Stage 1's three runs by thumb, then into the balls' line
    let held = false;
    const pad = {
        set: async (d) => {
            const up = !!d.up, lr = (d.right ? 1 : 0) - (d.left ? 1 : 0);
            th.dx = lr * stick.r * (up ? 0.65 : 0.85); th.dy = up ? -stick.r * (lr ? 0.65 : 0.85) : 0;
            if (up || lr) { if (!held) { held = true; await touch('touchStart', thumbs()); } else await touch('touchMove', thumbs()); }
            else if (held) { held = false; await touch('touchEnd', []); }
        },
        // (Teleport, then its Stage 1)
        toStage: async () => { await tapAt(await center(ph, '#bTele'), 7); await sleep(500); await tapAt(await center(ph, '#modal [data-act="tp"][data-k="0"]'), 8); },
    };
    const vPh = parse((await text(ph, '#csMax')).match(/[\d.]+/)[0]);
    const prun = await runStage1(ph, pad, vPh);
    check(prun.inRun, 'the stick runs onto the Sprintway: STAGE 1');
    check(prun.runs === 3 && !prun.dead && prun.wins >= 3, 'the stick dodges Stage 1\'s balls, onto the Stage 2 checkpoint: ' + await text(ph, '#winsVal') + ' Wins (' + prun.runs + ' runs)');
    check(prun.arch && prun.toastMs >= 1000, 'its "' + prun.toast + '" toast stays up to be read: ' + prun.toastMs + ' ms' + (prun.pushedBy.length ? ' (pushed out by ' + prun.pushedBy.join(' | ') + ')' : ''));
    const pdead = await standInLine(ph, pad, vPh);
    check(!!pdead, 'into the balls\' line: flattened');
    await shot(ph, 'prod-phone-dead');
    if (pdead) {
        await sleep(300);
        await waitFor(async () => !(await ph.$eval('#revive', (e) => e.classList.contains('wait'))), 8);
        await tapAt(await center(ph, '#rvBtn'), 3);
        const pb = await waitFor(async () => { const r = await whereRun(ph); return r && r.k === 1 && r; }, 5);
        check(!!pb, 'the revive button by touch: back in stage 2');
    }
    await sleep(500);
    await shot(ph, 'prod-phone');
    await tapAt(await center(ph, '#bWork'), 3); await sleep(350);
    check(await modalUp(ph), 'a menu button by touch (Upgrade)');
    await sleep(300);
    await tapAt(await center(ph, '#modal [data-close]'), 4); await sleep(350);
    check(await ph.$eval('#modal', (e) => e.hidden), 'its X by touch');
    // a thumb on the stick, the other on a button: a browser makes no click for a second finger
    const t1 = await center(ph, '#bQuests');
    await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]); await sleep(120);
    await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }, { x: t1.x, y: t1.y, id: 2 }]); await sleep(60);
    await touch('touchEnd', [{ x: stick.x, y: stick.y, id: 1 }]); await sleep(120);
    await touch('touchEnd', []); await sleep(400);
    check(await modalUp(ph), 'a button pressed with a thumb still on the stick');
    check(ph.errors.length === 0, 'no console errors: ' + JSON.stringify(ph.errors.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
