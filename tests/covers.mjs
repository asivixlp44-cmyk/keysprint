// The two store covers (1920x1080, 800x800), rendered from the game itself at High: a runner on the Sprintway of Retro Ridge running
// for their life down the keyboard path, a giant ball of keycaps rolling down right behind them, the safe keyboard it came past in
// the background and the path climbing on into the sky, with the title, the +1 SPEED badge, Speed pops and the tagline over it in the
// game's lettering. How: no floating numbers or name tag, the HUD hidden; the runner waits on the path of Stage 1's first run until a
// ball is a good way up it, then runs down it towards the camera (which is in front of them, looking back up the path); the frame is
// held (the game's next animation frame is kept back) the moment the ball is the wanted distance behind them (a run that misses it, or
// a flattening, goes again). Then the lettering.
// Run: node tests/covers.mjs   (TEST_PORT / VITE_PORT move it)
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, ROOT, TEST_PORT } from './lib.mjs';

await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
const dir = path.join(ROOT, 'covers');
fs.mkdirSync(dir, { recursive: true });

// ----- the lettering (SVG: a thick navy outline under a gradient fill, a hard drop under that) -----
const N = '#141428', F = "'Russo One', 'Arial Black', sans-serif";
let gid = 0;
// one line of words, centred: spans [{ t, c: [top, bottom] }], baseline y, outline width
const words = (spans, size, y, stroke, ls) => {
    const id = 'w' + (gid++);
    const grads = spans.map((s, i) => `<linearGradient id="${id}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.c[0]}"/><stop offset="1" stop-color="${s.c[1]}"/></linearGradient>`).join('');
    const line = (fill, extra) => `<text x="50%" y="${y}" text-anchor="middle" font-family="${F}" font-size="${size}" letter-spacing="${ls}" ${extra}>${spans.map((s, i) => `<tspan fill="${fill || `url(#${id}${i})`}">${s.t}</tspan>`).join(' ')}</text>`;
    const out = `stroke="${N}" stroke-width="${stroke * 2}" stroke-linejoin="round"`;
    return `<defs>${grads}</defs>${line(N, out + ` transform="translate(0 ${Math.round(size * 0.075)})"`)}${line(N, out)}${line('', '')}`;
};
// a "+25" popping off the runner: the game's bolt, then the number white to gold (like the game's own click numbers)
const pop = ([px, py, size, rot, text]) => {
    const id = 'p' + (gid++), tw = size * (0.62 * text.length + 0.7), th = size * 1.3, x = size * 0.66, y = th * 0.5 + size * 0.36, b = size * 0.84;
    const num = (extra) => `<text x="${x}" y="${y}" font-family="${F}" font-size="${size}" stroke="${N}" stroke-width="${size * 0.16}" stroke-linejoin="round" ${extra}>${text}</text>`;
    return `<svg style="position:absolute;left:${px}%;top:${py}%;transform:translate(-50%,-50%) rotate(${rot}deg);overflow:visible;filter:drop-shadow(0 ${size * 0.06}px ${size * 0.08}px rgba(0,0,40,.45))" width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}">`
        + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stop-color="#ffffff"/><stop offset="1" stop-color="#ffd23a"/></linearGradient></defs>`
        + `<g transform="translate(0 ${th * 0.5 - size * 0.42}) scale(${b / 100})"><path d="M58 0 L14 58 L44 58 L30 100 L82 36 L52 36 L66 0 Z" fill="#3ad8ff" stroke="${N}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/><path d="M58 6 L22 54 L36 54" fill="none" stroke="#c8f6ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`
        + num(`fill="${N}" transform="translate(0 ${size * 0.06})"`) + num(`paint-order="stroke" fill="url(#${id})"`) + '</svg>';
};
// the whole overlay for a w x h cover: pops, the title (two lines on the square), the badge over it, the tagline ribbon at the bottom
function lettering(w, h, pops) {
    const sq = w < 1000, L = sq ? { badge: 40, bh: 62, t: 116, gap: 104, top: 18, st: 9 } : { badge: 50, bh: 76, t: 150, gap: 0, top: 22, st: 10 };
    const y1 = L.bh + 6 + L.t * 0.86, H = sq ? y1 + L.gap + 40 : y1 + 40;
    const CREAM = ['#ffffff', '#ffe2b8'], ORANGE = ['#ffd27a', '#ff6a1a'];
    const title = sq ? words([{ t: 'KEY', c: CREAM }], L.t, y1, L.st, 4) + words([{ t: 'SPRINT', c: ORANGE }], L.t, y1 + L.gap, L.st, 3)
        : words([{ t: 'KEY', c: CREAM }, { t: 'SPRINT', c: ORANGE }], L.t, y1, L.st, 3);
    const tag = sq ? 40 : 66;
    return `<div id="cover" style="position:fixed;inset:0;z-index:99;pointer-events:none;overflow:hidden">${pops.map(pop).join('')}`
        + `<svg style="position:absolute;left:0;top:${L.top}px;overflow:visible;filter:drop-shadow(0 10px 18px rgba(0,0,40,.45))" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">${title}</svg>`
        + `<div style="position:absolute;left:50%;top:${L.top}px;transform:translateX(-50%) rotate(-2deg);height:${L.bh}px;box-sizing:border-box;padding:${L.badge * 0.12}px ${L.bh * 0.42}px 0;border-radius:${L.bh * 0.3}px;border:${sq ? 5 : 6}px solid ${N};background:linear-gradient(#7dff6b,#22b83a 60%,#0e7a2a);box-shadow:0 ${sq ? 6 : 8}px 0 ${N},0 12px 22px rgba(40,10,0,.4);display:flex;align-items:center;gap:${L.bh * 0.2}px;font-family:${F};font-size:${L.badge}px;line-height:1;color:#fff;white-space:nowrap;text-shadow:0 3px 0 rgba(0,40,40,.55)"><span style="color:#ffe24a">+1</span><span>SPEED EVERY CLICK</span></div>`
        + `<div style="position:absolute;left:50%;bottom:${sq ? 22 : 34}px;transform:translateX(-50%);white-space:nowrap;font-family:${F};font-size:${tag}px;line-height:1;padding:${tag * 0.26}px ${tag * 0.55}px ${tag * 0.12}px;border-radius:${tag * 0.32}px;background:linear-gradient(rgba(34,40,78,.95),rgba(18,20,44,.95));border:${sq ? 5 : 6}px solid #ffd23a;box-shadow:0 8px 0 ${N},0 14px 26px rgba(30,10,0,.5);color:#fff;letter-spacing:.02em">${sq ? '' : 'CLICK FOR SPEED · '}<span style="color:#7dff6b">RUN</span> FROM THE GIANT BALLS!</div></div>`;
}

// ----- the shots: Stage 1's first run. cam: [yaw, pitch, distance] (yaw near 0: in front of a runner coming down the path, looking
// back up it); x: where across the path the runner runs; gap: how far behind the runner the ball's middle is (studs, a range); strides:
// where in the run cycle
const SHOTS = [
    { w: 1920, h: 1080, name: 'cover-1920x1080.png', cam: [0.2, 0.22, 15], x: -3.4, gap: [10.5, 13.5], strides: [0.9, 3.95],
        pops: [[22, 50, 118, -8, '+250'], [78, 47, 96, 7, '+25'], [14, 70, 78, -5, '+25'], [86, 68, 70, 6, '+25']] },
    { w: 800, h: 800, name: 'cover-800x800.png', cam: [0.24, 0.2, 17], x: -3.4, gap: [10.5, 13.5], strides: [0.9, 3.95],
        pops: [[14, 56, 76, -9, '+250'], [86, 54, 64, 8, '+25']] },
];
try {
    // ONLY=800 renders just the cover whose file name has that in it
    for (const s of SHOTS.filter((o) => !process.env.ONLY || o.name.includes(process.env.ONLY))) {
        const page = await open(browser, 'http://localhost:5733/', { w: s.w, h: s.h, dpr: 1, q: 'high', uid: 'cover' + s.w + Date.now() });
        // the guide's chevrons gone (they stop for a seasoned clicker), a rainbow trail
        await qa(page, () => { const q = window.__qa; q.noWatch(true); q.close(); window.__noFloat = true; q.give({ wins: 5e6, gems: 3000, speed: 20, best: 9, clicks: 10000 }); });
        await sleep(2500);
        await qa(page, () => { window.__qa.send('trail', { i: 8 }); });
        await sleep(800);
        await qa(page, () => {
            const q = window.__qa; q.close();
            const me = q.me(); if (me && me.label) me.label.visible = false;
            for (const sel of ['#hud', '#touch', '#toasts', '#bigText', '#popup', '#winPop', '#lvlUp', '#fps', '#tips', '#wallBar', '#revive', '#padHint', '#promptBtn', '#flyLayer', '#queueBar', '#flash']) { const e = document.querySelector(sel); if (e) e.style.display = 'none'; }
        });
        const got = await page.evaluate(async (s) => {
            const q = window.__qa, Z1 = q.zones()[1], zStart = Z1.z1 + 4;
            const stride = () => { const m = q.me(), r = m && m.blox && m.blox.motion ? m.blox.motion.anim.loco.phase : 0; return s.strides.some((x) => { const d = Math.abs(r - x); return Math.min(d, Math.PI * 2 - d) < 0.15; }); };
            let wait = false, running = false;
            // (Stage 1's own pace: the ball rolls faster than the runner, so it closes in)
            const place = () => { q.camFree(true); q.give({ speed: 20, reviveAt: 0 }); q.key("KeyS", false); q.teleport(s.x, 0, zStart, 0); q.look(s.cam[0], s.cam[1], s.cam[2]); running = false; };
            place();
            const t0 = performance.now();
            return await new Promise((res) => {
                const f = () => {
                    const b = q.P.b, st = q.state();
                    q.look(s.cam[0], s.cam[1], s.cam[2]);
                    // the nearest ball up the path from the runner
                    const up = q.balls(b.z - 140, b.z).filter((z) => z < b.z), gap = up.length ? b.z - Math.max(...up) : 1e9;
                    // (a ball a good way up the path: run for it, down towards the camera)
                    if (!wait && !running && !st.dead && gap > 62 && gap < 90) { running = true; q.key('KeyS', true); }
                    if (!wait && running && !st.dead && gap >= s.gap[0] && gap <= s.gap[1] && b.z > zStart + 6) {
                        // hold this frame: the game's next one is kept back (and given back after the screenshot)
                        window.__raf = window.requestAnimationFrame; window.__held = [];
                        window.requestAnimationFrame = (cb) => { window.__held.push(cb); return 0; };
                        return res({ gap: +gap.toFixed(1), secs: +((performance.now() - t0) / 1000).toFixed(1) });
                    }
                    if (performance.now() - t0 > 240000) return res({ failed: true });
                    // flattened, or down at the first checkpoint with no shot: again (the death card's BACK TO HOME ROW first)
                    if (!wait && (st.dead || (running && (gap < s.gap[0] - 0.5 || b.z > 10)))) {
                        wait = true;
                        q.key('KeyS', false);
                        setTimeout(() => { if (q.P.dead) q.actions.giveUp(); setTimeout(() => { wait = false; place(); }, 3600); }, st.dead ? 400 : 50);
                    }
                    requestAnimationFrame(f);
                };
                requestAnimationFrame(f);
            });
        }, s);
        await sleep(150);
        await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d.firstChild); }, lettering(s.w, s.h, s.pops));
        await page.evaluate(() => document.fonts.ready);
        await sleep(300);
        await page.screenshot({ path: path.join(dir, s.name), type: 'png' });
        console.log('wrote', s.name, JSON.stringify(got), page.errors);
        await page.evaluate(() => { if (window.__raf) window.requestAnimationFrame = window.__raf; for (const cb of window.__held || []) requestAnimationFrame(cb); window.__qa.key('KeyS', false); });
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
