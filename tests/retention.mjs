// What keeps a new player: from the live stats, half the sessions made 3 clicks or fewer and lasted about 80 s, while players who
// clicked 50+ times stayed five times as long. So: a first visit has Auto Click ON (Speed grows with no input), the choice to turn it
// off sticks, it keeps clicking in a hidden tab, and the stage bar says what to do about the balls. Run: node tests/retention.mjs
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
try {
    // a first visit: no choice stored
    const page = await open(browser, 'http://localhost:5733/', { w: 1280, h: 720, q: 'medium', autoOn: true, uid: 'ret' + Date.now() });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
    const s0 = await qa(page, () => window.__qa.state());
    await sleep(5000);
    const s1 = await qa(page, () => window.__qa.state());
    check(s0.auto === true && /ON/.test(await page.$eval('#autoTxt', (e) => e.textContent)), 'a first visit: Auto Click is ON (the AUTO button says so)');
    check(s1.clicks - s0.clicks >= 9 && s1.speed - s0.speed >= 9, 'with no input at all: ' + (s1.clicks - s0.clicks) + ' clicks and +' + Math.round(s1.speed - s0.speed) + ' Speed in 5 s');
    // the server counted them too (not only the screen)
    await sleep(800);
    const srv = await qa(page, () => ({ shown: window.__qa.S.speed, pend: window.__qa.S.pendN }));
    check(srv.pend === 0 || srv.pend === undefined || srv.pend < 4, 'and the server has heard them (' + (srv.pend || 0) + ' still on their way)');
    // a hidden tab: the frame loop stops, the clicks go on
    await qa(page, () => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        window.__raf0 = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    });
    const h0 = await qa(page, () => window.__qa.S.clicks);
    await sleep(5200);
    const h1 = await qa(page, () => window.__qa.S.clicks);
    await qa(page, () => { delete document.hidden; window.requestAnimationFrame = window.__raf0; });
    check(h1 - h0 >= 8, 'a hidden tab (no frames): the clicks go on, ' + (h1 - h0) + ' in 5 s');
    // turning it off sticks (this device's choice, kept for the next visit)
    await sleep(500);
    await page.click('#autoBtn');
    await sleep(400);
    check((await qa(page, () => window.__qa.state().auto)) === false, 'the AUTO button turns it off');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.querySelector('#start') || document.querySelector('#start').hidden, { timeout: 120000, polling: 200 });
    check((await qa(page, () => window.__qa.state().auto)) === false, 'and it stays off on the next visit');
    // the stage bar's words for a newer player
    await qa(page, () => { const q = window.__qa; q.noWatch(true); q.close(); q.actions.toggleAuto(false); q.give({ speed: 20 }); const Z = q.zones()[1]; q.teleport(13, 0, Z.z0 + 3, Math.PI); q.look(0, 0.2, 20); });
    await sleep(1500);
    const words = async () => page.$eval('#wbHp', (e) => e.textContent);
    const seen = new Set();
    for (let i = 0; i < 40; i++) { seen.add((await words()).trim()); await sleep(250); }
    console.log('   the stage bar said:', JSON.stringify([...seen]));
    check([...seen].some((w) => /WAIT|GO!/.test(w)), 'out on a safe keyboard the stage bar says to wait, then GO');
    await qa(page, () => { const q = window.__qa; q.give({ reviveAt: 0 }); q.teleport(0, 0, q.zones()[1].z + 2, Math.PI); });
    await sleep(600);
    const inLine = (await words()).trim();
    check(/SIDE|BALL/.test(inLine), 'standing in the balls\' line it says so: "' + inLine + '"');
    check(page.errors.length === 0, 'no console errors ' + JSON.stringify(page.errors));
} catch (e) { console.error(e); fails++; }
console.log(fails ? fails + ' FAILED' : 'all good');
await browser.close(); stopAll();
process.exit(fails ? 1 : 0);
