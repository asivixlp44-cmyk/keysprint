// The whole loop and its guards, headless: starts its own server (QA=1, a temporary data folder) and plays it over the
// network as real clients do. Run: npm --prefix tests run server
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { CFG, SPEED_PACKS, squadOf, WALLS_N, WORLDS, SHOES, TRAILS, AURAS, POSTS, UPGRADES, JAWBREAKERS, upgradeCost, walkOf, maxWalk, rebirthSpeed, rebirthMult, padWins, FIRST_PAD, clickGain, recSpeed, stageV, CODES, QUESTS, GIFTS, DAILY, matchInfo } from '../shared/config.js';
import { W, wallZ, postSpot, checkpoint, floorY, KEY_TOP, ZONES, RUN, BALLS, ballsBetween } from '../shared/world.js';
import { arenaPlan, startSpot, laneX, laneRunClear, ARENA } from '../shared/arena.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.TEST_PORT || 3212), URL_ = 'http://localhost:' + PORT;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a plain click's Speed at the start: +1
const PER = 1;
let pass = 0, fail = 0;
function ok(cond, what) { if (cond) { pass++; console.log('  ok  ' + what); } else { fail++; console.log('FAIL  ' + what); } }

class Bot {
    constructor(name) { this.name = name; this.msgs = {}; this.p = {}; this.x = 0; this.z = W.spawn.z; this.y = 0; this.seq = 0; this.snaps = 0; }
    async join(extra) {
        const c = new Client(URL_);
        this.room = await c.joinOrCreate('run', { uid: 'test_' + this.name, name: this.name, ...(extra || {}) });
        const R = this.room;
        for (const t of ['hello', 'pong', 'sq', 'toast', 'broke', 'code', 'boards', 'reward', 'padok', 'warped', 'reborn', 'warp', 'spun', 'bought', 'taskdone', 'questdone', 'hatched', 'died', 'revived', 'caught', 'escaped', 'mQueue', 'mStart', 'mGo', 'mScore', 'mDone', 'mOut', 'mBonk', 'mTime', 'mEnd', 'mBack', 'mJoined', 'mLeft', 'mSync', 'mNone', 'authed', 'emote', 'chat', 'candy', 'saved', 'adfail']) R.onMessage(t, (m) => { (this.msgs[t] = this.msgs[t] || []).push(m); });
        R.onMessage('profile', (m) => { Object.assign(this.p, m); this.profiles = (this.profiles || 0) + 1; });
        R.onMessage('lite', (m) => { Object.assign(this.p, m); });
        R.onMessage('snap', (m) => { this.snaps++; this.x = m.x; this.y = m.y; this.z = m.z; });
        await this.wait(() => this.p.now);
        const me = R.state.players.get(R.sessionId);
        this.x = me.x; this.z = me.z;
        return this;
    }
    send(t, m) { this.room.send(t, m || {}); }
    async wait(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms ?? 5000)) { const v = fn(); if (v) return v; await sleep(15); } return null; }
    got(t) { return (this.msgs[t] || []).length; }
    last(t) { const l = this.msgs[t]; return l && l[l.length - 1]; }
    clear(t) { this.msgs[t] = []; }
    move(x, y, z, ts, a, post, v) { y = Math.max(y, floorY(this.p.world || 0, z)); this.x = x; this.y = y; this.z = z; this.send('move', { x, y, z, ry: 0, a: a ?? 1, ts: ts ?? Date.now(), post, v }); }
    // a QA teleport: next move is checked from there (and a new life starts there)
    async tp(x, y, z) { y = Math.max(y, floorY(this.p.world || 0, z)); this.send('qa', { tp: [x, y, z] }); this.x = x; this.z = z; this.y = y; await sleep(60); this.move(x, y, z); await sleep(60); }
    // run in a straight line to (x, z) at v studs a second, a move every 100 ms
    async run(x, z, v, extra) {
        const sx = this.x, sz = this.z, d = Math.hypot(x - sx, z - sz), n = Math.max(1, Math.ceil(d / ((v || 30) * 0.1)));
        for (let i = 1; i <= n; i++) { this.move(sx + (x - sx) * i / n, 0, sz + (z - sz) * i / n, undefined, 1, undefined, extra); await sleep(100); }
    }
    click(n, post) { this.send('click', { n, post: post ?? -1, s: ++this.seq }); }
    // n clicks at a rate the bucket allows (about 10 a second)
    async clicks(n, post) { for (let i = 0; i < n; i += 3) { this.click(Math.min(3, n - i), post); await sleep(300); } await sleep(300); }
    me() { return this.room.state.players.get(this.room.sessionId); }
    leave() { return this.room.leave(); }
}

const srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(PORT), QA: '1', DATA_DIR: dataDir, NO_BOTS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(d); });
srv.stderr.on('data', (d) => { if (!/SAVE_SECRET/.test(String(d))) process.stderr.write(d); });
for (let i = 0; i < 60; i++) { try { const r = await fetch(URL_ + '/health'); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(150); }

try {
    console.log('--- a new player');
    const a = await new Bot('alice').join();
    a.send('qa', { noBalls: true });
    ok(a.p.speed === 0 && a.p.clicks === 0 && a.p.wins === 0 && a.p.rebirths === 0 && a.p.xp === undefined && a.p.lv === undefined, 'starts with nothing (no Levels, no XP: Speed is all)');
    ok(a.got('boards') === 1, 'told the leaderboards');
    a.send('ping', { c: 123 });
    await a.wait(() => a.last('pong'));
    ok(a.last('pong').c === 123 && Math.abs(a.last('pong').s - Date.now()) < 2000, 'ping answers with the server\'s clock');
    let bots = 0;
    a.room.state.players.forEach((p) => { if (p.bot) bots++; });
    ok(bots === CFG.bots - 1, 'a bot goes home for each real player (' + bots + ' left)');

    console.log('--- the bots run the Sprintway at their Speed\'s pace');
    {
        a.send('qa', { botsRun: true });
        let inRun = 0, tooFast = 0, maxRatio = 0;
        const t0 = Date.now();
        while (Date.now() - t0 < 16000) {
            a.room.state.players.forEach((p) => {
                if (!p.bot || p.match) return;
                if (p.z < wallZ(0) - 4) inRun++;
                if (p.anim === 1 && p.spd > 0) { maxRatio = Math.max(maxRatio, p.spd / walkOf(p.sp)); if (p.spd > walkOf(p.sp) + 0.05) tooFast++; }
            });
            if (inRun > 20 && Date.now() - t0 > 3000) break;
            await sleep(100);
        }
        ok(inRun > 0, 'they go up the course (' + inRun + ' looks at one in it)');
        ok(tooFast === 0 && maxRatio > 0.5, 'never faster than their Speed runs (at most x' + maxRatio.toFixed(2) + ' of it)');
    }

    console.log('--- clicks: +1 Speed each, every 20th a MEGA click (x' + CFG.megaK + ')');
    a.click(4);
    await a.wait(() => a.p.clicks >= 4);
    await sleep(100);
    ok(a.p.clicks === 4 && a.p.speed === 4 * PER, 'four clicks standing anywhere: +' + PER + ' Speed each (' + a.p.speed + ')');
    ok(a.p.ack >= 1, 'the answer says which clicks it has heard');
    ok(a.me().sp === a.p.speed, 'everyone sees your Speed (on your name tag)');
    await a.clicks(16);
    await a.wait(() => a.p.clicks >= 20);
    ok(a.p.clicks === 20 && a.p.megas === 1 && a.p.speed === 19 * PER + CFG.megaK * PER, 'the 20th click is a MEGA click: x' + CFG.megaK + ' (' + a.p.speed + ' Speed after 20)');
    ok(a.p.topSpeed >= a.p.speed, 'your top Speed is kept');
    // the bucket: a burst is cut down, then the clock refills it
    await sleep(2500);
    const ck0 = a.p.clicks;
    for (let i = 0; i < 6; i++) a.click(40);
    await sleep(500);
    ok(a.p.clicks - ck0 <= CFG.clickBurst + 10 && a.p.clicks - ck0 >= CFG.clickBurst - 2, 'a flood of clicks is cut down to the bucket (' + (a.p.clicks - ck0) + ' of 240)');
    a.send('click', { n: 9999, post: -1, s: ++a.seq });
    await sleep(300);
    ok(a.p.clicks - ck0 <= CFG.clickBurst + 20, 'and a huge batch is cut to 40 at most');

    console.log('--- Power Keys');
    const t0 = postSpot(0), t1 = postSpot(1);
    await sleep(3000);
    await a.tp(t0.x, KEY_TOP, t0.z);
    a.move(t0.x, KEY_TOP, t0.z, Date.now(), 3, 0);
    await sleep(80);
    const sp0 = a.p.speed, n0 = a.p.clicks, k0 = a.p.keyClicks;
    await a.clicks(9, 0);
    ok(a.p.clicks - n0 === 9 && a.p.keyClicks - k0 === 9, 'on the ' + POSTS[0].name + ': clicks counted as Power Key clicks (' + (a.p.keyClicks - k0) + ')');
    ok(a.p.speed - sp0 >= 9 * PER * POSTS[0].mult, 'its +' + POSTS[0].mult + ' a click (' + (a.p.speed - sp0) + ')');
    ok(a.me().post === 0 && a.me().anim === 3, 'everyone sees you clicking on it');
    await a.tp(t1.x, KEY_TOP, t1.z);
    a.move(t1.x, KEY_TOP, t1.z, Date.now(), 3, 1);
    await sleep(80);
    const sp1 = a.p.speed, n1 = a.p.clicks;
    await a.clicks(6, 1);
    ok(a.p.speed - sp1 < (a.p.clicks - n1) * PER * POSTS[1].mult && a.p.keyClicks - k0 === 9, 'the ' + POSTS[1].name + ' is shut until you have earned ' + POSTS[1].need + ' Wins (no x' + POSTS[1].mult + ')');
    a.send('qa', { wins: POSTS[1].need });
    await a.wait(() => a.p.totalWins >= POSTS[1].need);
    const sp2 = a.p.speed, n2 = a.p.clicks;
    await a.clicks(6, 1);
    const per2 = (a.p.speed - sp2) / Math.max(1, a.p.clicks - n2);
    ok(per2 >= POSTS[1].mult * PER - 1e-9, 'with them it opens: +' + POSTS[1].mult + ' a click (' + per2.toFixed(2) + ' each)');
    await a.tp(0, 0, W.spawn.z);
    const sp3 = a.p.speed, n3 = a.p.clicks;
    await a.clicks(6, 1);
    ok((a.p.speed - sp3) / Math.max(1, a.p.clicks - n3) < POSTS[1].mult * PER, 'a Power Key counts only standing on it');
    ok(a.got('caught') === 0 && a.got('escaped') === 0, 'nothing chases you on Home Row');

    console.log('--- your Speed is how fast you run (the move guard)');
    a.send('qa', { speed: 0 });
    await a.wait(() => a.p.speed === 0);
    await a.tp(0, 0, W.spawn.z);
    const sn0 = a.snaps;
    await a.run(0, W.spawn.z - 200, 80, 500);
    await sleep(200);
    ok(a.snaps > sn0, '0 Speed (run ' + maxWalk({ speed: 0 }) + '): running at 80 studs a second is sent back, whatever speed the screen says');
    a.send('qa', { speed: 5e6 });
    await a.wait(() => a.p.speed === 5e6);
    await a.tp(0, 0, W.spawn.z);
    const sn1 = a.snaps;
    await a.run(0, W.spawn.z - 200, 80);
    await sleep(200);
    ok(a.snaps === sn1, '5M Speed (run ' + maxWalk({ speed: 5e6 }).toFixed(1) + '): the same run is fine');
    ok(walkOf(0) === CFG.walk && [3, 6, 9, 12].every((k) => Math.abs(walkOf(recSpeed(0, k)) - stageV(k)) < 0.01) && walkOf(1e12) === CFG.vMax, 'every stage\'s Recommended Speed runs you at the pace it\'s laid out for (Stage 10: ' + recSpeed(0, 9) + ' Speed, ' + walkOf(recSpeed(0, 9)).toFixed(1) + ' studs a second)');
    const sn2 = a.snaps;
    a.move(0, 0, a.z - 300);
    await sleep(150);
    ok(a.snaps > sn2, 'too far in one go: sent back');
    await sleep(250);
    a.move(0, 40, a.z);
    await sleep(150);
    ok(a.snaps > sn2 + 1, 'too high: sent back');
    // the Sprintway climbs: its floor rises stage by stage (a Keyball Hill a long climb); a move under the floor is sent back, one on it isn't
    {
        const zc = checkpoint(4).z - 3, fy = floorY(0, zc), sn3 = a.snaps;
        ok(fy > 25 && floorY(0, W.spawn.z) === 0, 'the Sprintway climbs: Stage 5 starts ' + fy.toFixed(0) + ' studs over Home Row');
        await sleep(300);
        await a.tp(0, fy, zc);
        await sleep(400);
        a.room.send('move', { x: 0, y: fy - 45, z: zc - 1, ry: 0, a: 1, ts: Date.now() });
        await sleep(200);
        ok(a.snaps > sn3, 'a move under its floor: sent back');
        await sleep(400);
        const sn4 = a.snaps;
        a.room.send('move', { x: 0, y: fy + 1, z: zc - 1.5, ry: 0, a: 1, ts: Date.now() });
        await sleep(200);
        ok(a.snaps === sn4, 'a move on it, high over the clouds: fine');
        await a.tp(W.spawn.x, 0, W.spawn.z);
        await sleep(300);
    }

    console.log('--- the balls: in their line one flattens you (the server sees it); out on the side of a safe keyboard they roll by');
    {
        const e = await new Bot('bea').join();
        e.send('qa', { speed: 9000, reviveAt: 0 });
        await e.wait(() => e.p.speed === 9000);
        const Z1 = ZONES[1], sx = RUN.safeX + 3;
        await e.tp(sx, 0, Z1.z);
        // standing there for two balls' worth, a move every 100 ms
        let past = 0;
        const t0 = Date.now(), seen = new Set();
        while (Date.now() - t0 < BALLS.T * 2000 + 300) {
            e.move(sx, 0, Z1.z, undefined, 0);
            for (const zb of ballsBetween(Date.now() / 1000, Z1.z - 2, Z1.z + 2)) seen.add(Math.round((Date.now() / 1000 - (zb - Z1.z) / 40) / BALLS.T));
            await sleep(100);
        }
        past = seen.size;
        ok(e.got('died') === 0 && past >= 1, 'out on the side of a safe keyboard: the balls roll by (' + past + ' went past, no knock-out)');
        // in the line: the next ball has it, by the server's own look (the screen never said 'fell')
        await e.tp(0, 0, Z1.z);
        const t1 = Date.now();
        while (Date.now() - t1 < BALLS.T * 1000 + 1500 && !e.got('died')) { e.move(0, 0, Z1.z, undefined, 0); await sleep(100); }
        const dd = e.last('died');
        ok(!!dd && dd.srv === true && dd.why === 'ball' && dd.k === 0, 'standing in the balls\' line: flattened by the next one, the server\'s own call (' + (dd ? 'stage ' + (dd.k + 1) + ', ' + dd.why : 'nothing') + ')');
        ok(Math.abs(e.me().z - W.spawn.z) < 0.5, 'and on the server at the spawn, the revive on offer');
        e.send('fell', { k: 0, why: 'ball' });
        await sleep(300);
        ok(e.got('died') === 1 && e.p.deaths === 1, 'the screen\'s own word on it after the server\'s: still one death');
        e.send('revive');
        await e.wait(() => e.got('revived'));
        const rv0 = e.last('revived'), cp0 = checkpoint(0);
        ok(rv0 && rv0.x === cp0.x && Math.abs(rv0.x) > RUN.safeX, 'revived out on the side of the first checkpoint, clear of the balls');
        await e.leave();
    }

    console.log('--- the gates: passing one pays its Wins');
    a.send('qa', { speed: 9000 });
    await a.wait(() => a.p.speed === 9000);
    await a.tp(0, 0, wallZ(0) + 6);
    await a.run(0, wallZ(1) + 12, 30);
    a.send('pad', { k: 0 });
    await sleep(250);
    ok(a.got('padok') === 0, 'short of the arch: nothing');
    await a.run(0, wallZ(1) - 3, 30);
    a.send('pad', { k: 0 });
    await a.wait(() => a.got('padok'));
    const pk = a.last('padok');
    ok(pk && pk.k === 0 && pk.first && pk.wins === padWins(0, 0) * FIRST_PAD && a.p.wins >= pk.wins, 'through it: the first time each rebirth x' + FIRST_PAD + ' (' + (pk && pk.wins) + ' Wins)');
    ok(a.p.bests[0] === 1 && a.p.cleared === 1 && a.p.pads === 1, 'Stage 1 passed');
    a.send('pad', { k: 0 });
    await sleep(250);
    ok(a.got('padok') === 1, 'not again straight away (' + CFG.padCool + ' s)');
    a.send('pad', { k: 3 });
    await sleep(200);
    ok(a.got('padok') === 1, 'an arch you haven\'t reached: nothing');
    await a.run(0, wallZ(2) - 3, 34);
    a.send('pad', { k: 1 });
    await a.wait(() => a.got('padok') === 2);
    ok(a.got('padok') === 2 && a.last('padok').k === 1 && a.p.bests[0] === 2, 'run on through Stage 2: its arch pays too');
    // straight to the far side of a gate, never in its stage this life
    await a.tp(0, 0, wallZ(5) - 4);
    a.send('pad', { k: 4 });
    await sleep(250);
    ok(a.got('padok') === 2, 'past an arch without having come through its stage: nothing');

    console.log('--- dying and reviving');
    const c = await new Bot('carol').join();
    c.send('qa', { speed: 9000, noBalls: true });
    await c.wait(() => c.p.speed === 9000);
    await c.tp(0, 0, wallZ(0) + 4);
    await c.run(0, wallZ(1) - 8, 30);
    c.send('fell', { k: 9, why: 'ball' });
    await c.wait(() => c.got('died'));
    const d1 = c.last('died');
    ok(d1 && d1.k === 1 && d1.why === 'ball', 'a death further on than you\'ve been is counted where you were (stage ' + (d1 && d1.k + 1) + ')');
    ok(d1 && d1.free === true && d1.cost === 0 && d1.until > Date.now() + (CFG.reviveOffer - 2) * 1000, 'the first revive is FREE, on offer for ' + CFG.reviveOffer + ' s');
    await c.wait(() => c.p.deaths === 1);
    ok(Math.abs(c.me().z - W.spawn.z) < 0.5 && Math.abs(c.me().x - W.spawn.x) < 0.5 && c.p.deaths === 1, 'back at the spawn');
    // the screen's own moves from the spawn: fine (the guard starts afresh)
    const sn3 = c.snaps;
    c.x = W.spawn.x + 1.5; c.z = W.spawn.z;
    await c.run(W.spawn.x + 1.5, W.spawn.z - 6, 14);
    await sleep(150);
    ok(c.snaps === sn3, 'moving off from the spawn: no snap back');
    c.send('pad', { k: 0 });
    await sleep(200);
    ok(c.got('padok') === 0, 'at the spawn: no arch pays');
    c.send('revive');
    await c.wait(() => c.got('revived'));
    const rv = c.last('revived'), cp1 = checkpoint(1);
    ok(rv && rv.k === 1 && rv.z === cp1.z && rv.x === cp1.x && rv.free, 'revived into Stage 2, just inside its door, free');
    c.x = cp1.x; c.z = cp1.z;
    const sn4 = c.snaps;
    await c.run(0, cp1.z - 20, 30);
    await sleep(150);
    ok(c.snaps === sn4, 'and on from there');
    c.send('revive');
    await sleep(250);
    ok(c.got('revived') === 1, 'no offer open: no revive');
    // a second death within the free revive's cool-down: it costs Gems
    c.send('fell', { k: 1, why: 'pit' });
    await c.wait(() => c.got('died') === 2);
    c.send('fell', { k: 1, why: 'pit' });
    await sleep(150);
    ok(c.got('died') === 2, 'one death at a time');
    ok(c.last('died').free === false && c.last('died').cost === CFG.reviveGems, 'the next within ' + CFG.reviveFreeSecs / 60 + ' minutes costs ' + CFG.reviveGems + ' Gems');
    c.send('revive');
    await c.wait(() => c.got('broke'));
    ok(c.got('broke') === 1 && c.got('revived') === 1, 'no Gems: no revive (broke)');
    const cg = c.p.gems;
    c.send('qa', { gems: 20 });
    await c.wait(() => c.p.gems === cg + 20);
    c.send('revive');
    await c.wait(() => c.got('revived') === 2);
    await c.wait(() => c.p.revives === 2);
    ok(c.got('revived') === 2 && c.p.gems === cg + 20 - CFG.reviveGems && c.p.revives === 2, 'with them: revived for ' + CFG.reviveGems + ' Gems');
    // dying on the Home Row side of the first gate: Stage 1 at most; turning the offer down: you stay at the spawn
    await c.tp(0, 0, W.spawn.z);
    await sleep(400);
    c.send('fell', { k: 6 });
    await c.wait(() => c.got('died') === 3);
    ok(c.last('died').k === 0, 'never in a stage this life: the offer is Stage 1 at most');
    c.send('respawn');
    await c.wait(() => c.got('warped'));
    ok(c.last('warped').why === 'back' && Math.abs(c.last('warped').z - W.spawn.z) < 0.5, 'no thanks: you stay at the spawn');
    c.send('revive');
    await sleep(250);
    ok(c.got('revived') === 2, 'and the offer is gone');
    // the free revive comes round again
    c.send('qa', { reviveAt: Date.now() - 1000 });
    await sleep(100);
    await c.tp(0, 0, wallZ(0) + 4);
    await c.run(0, wallZ(1) + 20, 30);
    c.send('fell', { k: 0 });
    await c.wait(() => c.got('died') === 4);
    ok(c.last('died').free === true, 'every ' + CFG.reviveFreeSecs / 60 + ' minutes it\'s free again');
    // Boxity's death screen: the revive stays on offer while the player picks; a rewarded-ad token Boxity doesn't vouch for revives
    // nobody; BACK TO HOME ROW ends it
    ok(c.last('died').until - Date.now() > (CFG.reviveOffer - 10) * 1000, 'the revive stays on offer while the death screen is up (' + CFG.reviveOffer + ' s)');
    const rvBefore = c.got('revived');
    c.send('adrevive', { token: 'not-a-real-reward-token' });
    await c.wait(() => c.got('adfail'), 9000);
    ok(c.got('adfail') === 1 && c.got('revived') === rvBefore, 'a made-up rewarded-ad token: no revive');
    c.send('adskip', { token: 'not-a-real-reward-token' });
    c.send('adx2', { token: 'not-a-real-reward-token' });
    await sleep(2500);
    ok(!(c.p.x2Until > Date.now()), 'nor x2 Speed for a made-up token');
    const wBefore = c.got('warped');
    c.send('respawn');
    await c.wait(() => c.got('warped') > wBefore);
    ok(c.got('warped') > wBefore && Math.abs(c.last('warped').z - W.spawn.z) < 1, 'BACK TO HOME ROW: at the spawn, the offer gone');
    c.send('revive');
    await sleep(300);
    ok(c.got('revived') === rvBefore, 'and no revive after it');
    c.send('fell', { k: 0 });
    await c.wait(() => c.got('died') === 5);
    // dead, the offer still open, no revive: run back up from the spawn through Stage 1's gate: it pays
    c.x = W.spawn.x; c.z = W.spawn.z;
    await c.run(0, wallZ(1) - 3, 34);
    c.send('pad', { k: 0 });
    await c.wait(() => c.got('padok'));
    ok(c.got('padok') === 1 && c.last('padok').k === 0 && c.last('padok').wins === padWins(0, 0) * FIRST_PAD && c.last('padok').n === c.last('padok').wins, 'died, ran back through Stage 1\'s door without reviving: paid (' + (c.last('padok') && c.last('padok').wins) + ' Wins)');

    console.log('--- spending');
    a.send('shoe');
    await sleep(200);
    ok(a.p.shoe === 0, 'no footwear to buy');
    a.send('qa', { wins: 100000, gems: 2000 });
    await a.wait(() => a.p.wins >= 100000);
    ok(clickGain({ ...a.p, shoe: 6 }, false, 0) === clickGain({ ...a.p, shoe: 0 }, false, 0), 'a click\'s Speed doesn\'t look at footwear');
    for (const u of UPGRADES.slice(0, 3)) { a.send('upgrade', { id: u.id }); }
    await sleep(300);
    ok(UPGRADES.slice(0, 3).every((u) => a.p.ups[u.id] === 1), 'upgrades for Wins (' + UPGRADES.slice(0, 3).map((u) => u.name).join(', ') + ')');
    ok(maxWalk(a.p) > maxWalk({ speed: a.p.speed }) && clickGain(a.p, false, 0) > clickGain({ ...a.p, ups: {} }, false, 0), UPGRADES[0].name + ' more Speed a click, ' + UPGRADES[1].name + ' run faster');
    await sleep(200);
    const g0 = a.p.gems, wt = a.p.wins;
    a.send('trail', { i: 1 }); a.send('aura', { i: 1 });
    await sleep(300);
    ok(a.p.trail === 1 && a.p.aura === 1 && a.p.gems <= g0 - AURAS[1].gems + 10 && a.p.wins <= wt - TRAILS[1].wins + 10, 'a trail for Wins, an aura for Gems');
    const gp = POSTS.findIndex((x) => x.gems);
    a.send('post', { i: gp });
    await sleep(200);
    ok(a.p.posts[POSTS[gp].id] === 1, 'the ' + POSTS[gp].name + ' for Gems');
    a.send('hatch', { j: 0, n: 3 });
    await a.wait(() => a.got('hatched'));
    ok(a.last('hatched').got.length === 3 && a.p.hatched === 3 && a.p.team.length === 3, 'three ' + JAWBREAKERS[0].name + 's: three pets, on the team by themselves');
    a.send('hatch', { j: 99 });
    await sleep(150);
    ok(a.p.hatched === 3, 'an Egg that isn\'t there: nothing');

    console.log('--- rewards');
    a.send('daily');
    await a.wait(() => a.got('reward'));
    ok(a.p.daily.streak === 1, 'the daily reward, day 1');
    a.send('daily');
    await sleep(200);
    ok(a.p.daily.streak === 1, 'once a day');
    a.send('gift', { i: 0 });
    await sleep(200);
    ok(!a.p.gifts[0], 'a gift before its time: nothing');
    a.send('qa', { playSecs: GIFTS[0].min * 60 });
    await sleep(100);
    a.send('gift', { i: 0 });
    await a.wait(() => a.p.gifts && a.p.gifts[0]);
    ok(a.p.gifts[0], 'a gift at ' + GIFTS[0].min + ' minutes');
    const code = Object.keys(CODES)[0];
    a.send('code', { code: code.toLowerCase() });
    await a.wait(() => a.got('code'));
    ok(a.last('code').ok, 'the code ' + code + ' works');
    a.send('code', { code });
    await a.wait(() => a.got('code') === 2);
    ok(!a.last('code').ok, 'once');
    a.send('qa', { spins: 1 });
    await sleep(100);
    a.send('spin');
    await a.wait(() => a.got('spun'));
    ok(a.got('spun') === 1 && a.p.spinsUsed === 1, 'the wheel spins');
    ok(a.p.qi >= 2 && a.got('questdone') >= 2, 'quests pay as they\'re done (' + a.p.qi + ' done)');

    console.log('--- the +SPEED packs and SKIP');
    {
        a.send('qa', { gems: 200 });
        await sleep(200);
        const g1 = a.p.gems, sp1 = a.p.speed;
        a.send('spack', { i: 0 });
        await a.wait(() => a.p.gems === g1 - SPEED_PACKS[0].gems);
        await a.wait(() => a.p.speed > sp1);
        ok(a.p.gems === g1 - SPEED_PACKS[0].gems && Math.abs(a.p.speed - sp1 - Math.round(SPEED_PACKS[0].sp * clickGain(a.p, false, 0))) < 2, 'a Speed pack for ' + SPEED_PACKS[0].gems + ' Gems: ' + SPEED_PACKS[0].sp + ' clicks\' worth (+' + Math.round(a.p.speed - sp1) + ' Speed)');
        await sleep(450);
        a.send('spack', { i: 7 });
        await sleep(250);
        ok(a.p.gems === g1 - SPEED_PACKS[0].gems, 'a pack that isn\'t there: nothing');
        const g2 = a.p.gems;
        await a.tp(W.spawn.x, 0, W.spawn.z);
        await sleep(950);
        a.send('skip');
        await sleep(300);
        ok(a.p.gems === g2, 'SKIP on Home Row (not in a stage): nothing');
        await a.tp(0, 0, checkpoint(0).z - 3);
        await sleep(950);
        const nw = a.got('warped'), np = a.got('padok');
        a.send('skip');
        await a.wait(() => a.got('warped') > nw);
        ok(a.last('warped') && a.last('warped').z === checkpoint(1).z && a.last('warped').why === 'skip' && a.p.gems === g2 - CFG.skipGems, 'SKIP in Stage 1: just inside Stage 2, for ' + CFG.skipGems + ' Gems');
        await sleep(300);
        ok(a.got('padok') === np, 'the skipped gate pays nothing');
        await a.tp(0, 0, checkpoint(WALLS_N - 1).z - 3);
        await sleep(950);
        const g3 = a.p.gems;
        a.send('skip');
        await sleep(300);
        ok(a.p.gems === g3, 'the last stage can\'t be skipped');
        await a.tp(W.spawn.x, 0, W.spawn.z);
        await sleep(200);
    }

    console.log('--- rebirth and the worlds');
    a.send('qa', { speed: rebirthSpeed(0) - 1 });
    await a.wait(() => a.p.speed === rebirthSpeed(0) - 1);
    a.send('rebirth');
    await sleep(200);
    ok(a.p.rebirths === 0, 'below ' + rebirthSpeed(0) + ' Speed: no rebirth');
    a.send('qa', { speed: rebirthSpeed(0) });
    await a.wait(() => a.p.speed === rebirthSpeed(0));
    const wr = a.p.wins, gr = a.p.gems;
    a.send('rebirth');
    await a.wait(() => a.got('reborn'));
    await a.wait(() => a.p.rebirths === 1);
    ok(a.p.rebirths === 1 && a.p.speed === 0 && a.p.wins === wr && a.p.gems === gr, 'rebirth at ' + rebirthSpeed(0) + ' Speed: back to 0 Speed (a walk again), and it costs nothing');
    ok(a.last('reborn').next === rebirthSpeed(1), 'the next one wants ' + rebirthSpeed(1) + ' Speed');
    ok(a.p.ups.switch === 1 && a.p.hatched === 3 && a.p.trail === 1, 'upgrades, pets, trails kept');
    ok(clickGain(a.p, false, 0) > clickGain({ ...a.p, rebirths: 0 }, false, 0), 'every click x' + rebirthMult(1) + ' Speed');
    a.send('qa', { speed: rebirthSpeed(1) - 1 });
    await a.wait(() => a.p.speed === rebirthSpeed(1) - 1);
    a.send('rebirth');
    await sleep(200);
    ok(a.p.rebirths === 1, 'the second wants ' + rebirthSpeed(1) + ' Speed');
    a.send('world', { w: 1 });
    await sleep(200);
    ok(a.p.world === 0, 'the next world is shut until the last stage is passed');
    a.send('qa', { best: WALLS_N });
    await sleep(100);
    a.send('world', { w: 1 });
    await a.wait(() => a.got('warp'));
    await sleep(150);
    ok(a.p.world === 1 && a.me().world === 1, 'then it opens: ' + WORLDS[1].name);
    a.send('world', { w: 0 });
    await a.wait(() => a.got('warp') === 2);

    console.log('--- warps');
    await a.tp(0, 0, checkpoint(3).z - 4);
    await sleep(100);
    a.send('warp', { to: 'stage', k: 9 });
    await a.wait(() => a.last('warped') && a.last('warped').k === 3);
    ok(a.last('warped').z === checkpoint(3).z, 'TO STAGE goes no further than you\'ve been this rebirth (stage 4)');
    await sleep(800);
    a.send('warp', { to: 'post' });
    await a.wait(() => a.last('warped').z > 60);
    ok(Math.abs(a.last('warped').x - postSpot(POSTS.findIndex((x) => x.gems)).x) < 1, 'TRAIN goes to your best Power Key');

    console.log('--- someone else');
    const b = await new Bot('bob').join();
    await sleep(200);
    let seesA = false;
    b.room.state.players.forEach((p) => { if (p.name === 'alice') seesA = true; });
    ok(seesA, 'a second player sees the first');
    await a.wait(() => a.last('sq') && Math.abs(a.last('sq').sq - squadOf(2)) < 1e-9, 2000);
    ok(a.last('sq') && Math.abs(a.last('sq').sq - squadOf(2)) < 1e-9 && b.p.sq === squadOf(2), 'the squad boost: two others in the server, +' + Math.round(squadOf(2) * 100) + '% Speed a click for everyone');
    ok(clickGain(a.p, false, a.p.world, squadOf(2)) > clickGain(a.p, false, a.p.world, 0), 'and a click is worth that much more');

    console.log('--- Ball Rush: the queue, a late player, the race');
    a.send('qa', { speed: 500 });
    a.send('play', { map: 2 });
    await a.wait(() => a.last('mQueue'));
    ok(a.last('mQueue').found === 1 && a.last('mQueue').spots === CFG.matchSpots, 'the queue: 1 / ' + CFG.matchSpots + ' found');
    b.send('play');
    await b.wait(() => b.last('mQueue'));
    await a.wait(() => a.last('mQueue').found === 2);
    ok(a.last('mQueue').found === 2 && b.last('mQueue').found === 2, 'pressing PLAY about the same time: the same queue (2 found)');
    await a.wait(() => a.got('mStart'), 15000);
    await b.wait(() => b.got('mStart'), 3000);
    const ms = a.last('mStart'), plan = arenaPlan(ms.seed, ms.lv);
    ok(ms && b.got('mStart') && ms.id === b.last('mStart').id, 'one race for both');
    ok(ms.names.length === CFG.matchSpots, 'bots fill the empty places');
    // a late PLAY before the gun takes a bot's place
    c.send('play');
    await c.wait(() => c.got('mStart'), 3000);
    ok(c.got('mStart') && c.last('mStart').id === ms.id && a.got('mJoined') === 1, 'a late PLAY takes a bot\'s place on the line');
    // moving on the line before the gun
    const sa = startSpot(ms.spot);
    a.x = sa.x; a.z = sa.z;
    const sn5 = a.snaps;
    await a.run(sa.x, -20, 20);
    await sleep(200);
    ok(a.snaps > sn5, 'nobody runs before the gun');
    await a.wait(() => a.got('mGo'), 9000);
    ok(a.got('mGo') === 1, 'the gun');
    // carol leaves: a bot takes her place, under her name
    c.leave();
    await a.wait(() => a.got('mLeft'), 3000);
    ok(a.got('mLeft') === 1, 'carol left: everyone is told');
    // out of your lane
    a.x = sa.x; a.z = sa.z;
    const sn6 = a.snaps;
    a.move(sa.x + 30, 0, sa.z);
    await sleep(150);
    ok(a.snaps > sn6, 'out of your lane: sent back');
    // run the race: bob stands in his lane's way and a ball knocks him back to the start (the server sees it); alice dodges: on the
    // line, then out in each pocket, she waits for the way up to the next to clear, then runs for it
    const sb = b.last('mStart');
    b.x = startSpot(sb.spot).x; b.z = 0;
    const bz = plan.pockets[0].z1 + 6;
    const runB = (async () => {
        const t0 = Date.now();
        for (let z = 0; z > bz; z -= 2) { b.move(b.x, 0, z); await sleep(100); }
        while (!b.got('mBonk') && Date.now() - t0 < plan.balls.T * 1000 + 4000) { b.move(b.x, 0, bz, undefined, 0); await sleep(100); }
        // back on the start line: the balls sink through the grate before they get there
        b.x = startSpot(sb.spot).x; b.z = 0;
        const n0 = b.got('mBonk'), t1 = Date.now();
        while (Date.now() - t1 < plan.balls.T * 2000) { b.move(b.x, 0, 0, undefined, 0); await sleep(100); }
        return b.got('mBonk') - n0;
    })();
    const t0r = Date.now(), cxA = laneX(ms.spot), vA = 36, outA = ARENA.safe + 2.2;
    let ax = cxA, az = 0, aBonk = 0;
    const goA = async (tx, tz) => { while (Math.hypot(tx - ax, tz - az) > 0.25) { const d = Math.hypot(tx - ax, tz - az), st = Math.min(d, vA * 0.1); ax += (tx - ax) / d * st; az += (tz - az) / d * st; a.move(ax, 0, az); await sleep(100); if (a.got('mBonk') > aBonk) return false; } return true; };
    for (let i = 0; i <= plan.pockets.length && Date.now() - t0r < 90000; i++) {
        const N = plan.pockets[i], zTo = N ? N.z1 - 3 : plan.finish + 2, tw = Date.now();
        while (!laneRunClear(plan, Date.now() / 1000, az, zTo, vA * 0.85) && Date.now() - tw < 15000) { a.move(ax, 0, az, undefined, 0); await sleep(50); }
        if (!N) { await goA(cxA, plan.finish - 1); break; }
        if (!(await goA(cxA, N.z1 + 7)) || !(await goA(cxA + N.side * outA, N.z))) { aBonk = a.got('mBonk'); const m = a.last('mBonk'); ax = m.x; az = m.z; i = Math.max(-1, plan.pockets.findIndex((q) => Math.abs(q.z - az) < 1)) ; }
    }
    a.send('mFinish');
    await a.wait(() => a.got('mDone'), 3000);
    ok((a.msgs.mDone || []).some((m) => m.spot === ms.spot), 'dodging into the pockets: over the line, finished (' + ((Date.now() - t0r) / 1000).toFixed(1) + ' s, ' + a.got('mBonk') + ' knock-backs)');
    const bLate = await runB;
    const bb = b.msgs.mBonk && b.msgs.mBonk[0];
    ok(!!bb && Math.abs(bb.z - ARENA.startZ) < 0.5 && Math.abs(bb.x - startSpot(sb.spot).x) < 0.5, 'standing in your lane\'s way: a ball knocks you back to the start (the server\'s own call)');
    ok(bLate === 0, 'on the start line the balls never reach you (they sink through the grate)');
    await a.wait(() => a.got('mEnd'), 30000);
    const me_ = a.last('mEnd');
    ok(me_ && me_.place === 0, 'first through the portal wins (' + (me_ && me_.placeName) + ')');
    ok(me_ && me_.prize.wins > 0 && me_.prize.gems > 0 && me_.prize.speed > 0, 'a prize: ' + (me_ && me_.prize.wins) + ' Wins, ' + (me_ && me_.prize.gems) + ' Gems, ' + (me_ && me_.prize.speed) + ' Speed');
    // (the profile follows the result in its own message)
    await a.wait(() => a.p.matches === 1 && a.p.matchWins === 1, 1500);
    ok(a.p.matches === 1 && a.p.matchWins === 1, 'counted: 1 race, 1 win');
    const bE = await b.wait(() => b.last('mEnd'), 3000);
    ok(bE && bE.place > 0 && me_.rows.length === CFG.matchSpots, 'everyone placed, ' + me_.rows.length + ' rows');
    ok(me_.rows.some((r) => r.n === 'carol' && r.bot), 'carol\'s place was taken by a bot under her name');

    console.log('--- nonsense');
    for (const t of ['click', 'move', 'pad', 'warp', 'hatch', 'team', 'world', 'upgrade', 'code', 'mItem', 'mFell', 'revive', 'fell', 'respawn', 'candy', 'shoe', 'rebirth']) a.send(t, { n: 'x', x: 'NaN', k: {}, id: [1], w: 'a', code: 5, i: -1, why: 7 });
    a.send('move', { x: Infinity, y: 0, z: 0 });
    a.send('pad', { k: 1e9 }); a.send('fell', { k: -5 });
    await sleep(300);
    ok(a.me() && a.room.connection.isOpen, 'nonsense messages are ignored, the room carries on');

    console.log('--- saved');
    const wSaved = a.p.wins, rbSaved = a.p.rebirths, upSaved = a.p.ups.feet, hSaved = a.p.hatched;
    await a.leave();
    await sleep(400);
    const a2 = await new Bot('alice').join();
    ok(a2.p.wins === wSaved && a2.p.rebirths === rbSaved && a2.p.ups.feet === upSaved && a2.p.hatched === hSaved, 'rejoining: everything as it was' + (process.env.VERBOSE ? JSON.stringify([wSaved, a2.p.wins, rbSaved, a2.p.rebirths, upSaved, a2.p.ups, a2.p.hatched]) : ''));
    void QUESTS; void DAILY; void JAWBREAKERS; void upgradeCost; void SHOES;
} catch (e) {
    fail++;
    console.log('FAIL  threw: ' + (e && e.stack));
}
console.log(`\n${pass} passed, ${fail} failed`);
srv.kill();
process.exit(fail ? 1 : 0);
