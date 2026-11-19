// Ball Rush on the server: the queue (everyone who presses PLAY at about the same time goes in one race; it says how many were found),
// the start line (a late PLAY still takes a bot's place until the gun), the race itself (six lanes, a pocket off each now and then, the
// same balls rolling down every lane at once: one that hits you knocks you back to the pocket behind you), the prizes. Bots only fill
// the empty places, and take over from a player who leaves.
import { PlayerState } from './schema.js';
import { CFG, WORLDS, PLACES, MATCH, matchLv, matchPower, matchPrize, clamp, BOT_NAMES } from '../../shared/config.js';
import { moveBudget } from '../../shared/physics.js';
import { ARENA, arenaPlan, laneX, startSpot, laneBallHit, laneRunClear, pocketAt, nextPocket, backSpot } from '../../shared/arena.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const BOT_SKIN = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
// how close to the gun a late PLAY can still take a bot's place (the fade into the race has to finish first)
const JOIN_MARGIN = 1500;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export class Match {
    constructor(room) {
        this.room = room;
        this.queue = null;
        this.matches = new Map();
        this.nextId = 1;
        // the maps take turns, so even a new player gets to see the later Rifts
        this.nextMap = Math.floor(Math.random() * WORLDS.length);
    }
    send(s, type, m) { this.room.sendTo(s, type, m); }

    // ----- the queue -----
    press(s, m) {
        if (s.match) return;
        const now = Date.now();
        // waiting already: nothing changes (pressing again can't hold the queue open)
        if (this.queue && this.queue.list.includes(s)) { this.tellQueue(); return; }
        // a race on its start line takes you at once, in a bot's place
        for (const mt of this.matches.values()) if (mt.phase === 'ready' && mt.humans.size < mt.spots && now < mt.goAt - JOIN_MARGIN) { this.joinMatch(mt, s); return; }
        if (!this.queue) {
            const qa = process.env.QA === '1' && !process.env.BLOXITY_GAME_ID;
            const w = m && Number.isInteger(m.map) && qa ? clamp(m.map, 0, WORLDS.length - 1) : (this.nextMap++) % WORLDS.length;
            this.queue = this.newQueue(now, w, m && finite(m.lv) && qa ? m.lv | 0 : 0);
        }
        const q = this.queue;
        q.list.push(s);
        s.queued = true;
        if (q.list.length >= CFG.matchSpots) q.startAt = Math.min(q.startAt, now + CFG.matchFull * 1000);
        // someone new gets a moment to see who else turns up, but it opens for so long at most
        else if (q.list.length > 1) q.startAt = Math.min(q.lastAt, Math.max(q.startAt, now + 3000));
        // (QA: no waiting about)
        if (m && m.now && process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) q.startAt = Math.min(q.startAt, now + 200);
        this.tellQueue();
    }
    newQueue(now, w, lvQa) { return { list: [], startAt: now + CFG.matchQueue * 1000, lastAt: now + (CFG.matchQueue + 12) * 1000, w, sec: 0, lvQa }; }
    cancel(s) {
        const q = this.queue;
        if (!q || !q.list.includes(s)) return;
        q.list.splice(q.list.indexOf(s), 1);
        s.queued = false;
        this.send(s, 'mQueue', { off: true });
        if (!q.list.length) this.queue = null; else this.tellQueue();
    }
    tellQueue() {
        const q = this.queue;
        if (!q) return;
        const lv = this.matchLevel(q.list, q), plan = arenaPlan(1, lv), msg = { found: q.list.length, spots: CFG.matchSpots, at: q.startAt, lv, segs: plan.n, map: q.w };
        for (const s of q.list) this.send(s, 'mQueue', msg);
    }
    matchLevel(list, q) {
        if (q && q.lvQa) return q.lvQa;
        if (!list.length) return 1;
        return Math.max(1, Math.round(list.reduce((a, s) => a + matchLv(s.profile), 0) / list.length));
    }

    // ----- a race -----
    startMatch(q) {
        const now = Date.now(), lv = this.matchLevel(q.list, q), id = this.nextId++, seed = 1 + Math.floor(Math.random() * 2e9);
        const plan = arenaPlan(seed, lv);
        const mt = { id, seed, lv, w: q.w, plan, spots: CFG.matchSpots, phase: 'ready', goAt: now + CFG.matchReady * 1000, endAt: 0, wrapAt: 0, racers: [], humans: new Set(), scoreAt: 0, finished: 0, firstAt: 0 };
        this.matches.set(id, mt);
        // the players on the line first, bots in every empty place
        q.list.forEach((s, i) => this.addHuman(mt, s, i));
        for (let i = q.list.length; i < mt.spots; i++) this.addBot(mt, i, null);
        for (const r of mt.racers) if (r.s) { r.s.queued = false; this.sendStart(mt, r); }
        return mt;
    }
    lane() { return { doneAt: 0, place: -1, out: false, outAt: 0, items: {} }; }
    addHuman(mt, s, spot) {
        const pos = startSpot(spot), p = s.profile;
        const r = { s, spot, power: matchPower(p), x: pos.x, z: pos.z, id: s.id, boostUntil: 0, ...this.lane() };
        mt.racers.push(r);
        mt.humans.add(s);
        s.match = mt; s.racer = r;
        this.room.toRace(s);
        s.player.match = mt.id; s.player.post = 255;
        s.last = { x: pos.x, y: 0, z: pos.z }; s.lastAt = Date.now(); s.homeAt = Date.now();
        return r;
    }
    addBot(mt, spot, from) {
        const id = 'mb' + mt.id + '_' + spot + '_' + Math.floor(Math.random() * 1e6), pl = new PlayerState();
        const taken = new Set(mt.racers.map((r) => r.name || (r.s && r.s.profile.name)));
        let name = from ? from.name : BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        for (let i = 0; !from && taken.has(name) && i < 20; i++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        const pos = startSpot(spot), x = from ? from.x : pos.x, z = from ? from.z : pos.z;
        Object.assign(pl, { name, bot: true, pid: this.room.freePid(), sp: from ? from.sp : Math.round(Math.pow(10, 1 + Math.max(1, mt.lv + rnd(-3, 3)) / 6)), wins: from ? from.wins : rnd(5, 900), x, y: 0, z, ry: pos.ry, t: Date.now(), world: mt.w, match: mt.id, shoe: from ? from.shoe : clamp(Math.floor(rnd(0, 3) + mt.lv / 10), 0, 15), trail: Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 6) : 0, aura: 0, team: from ? from.team : '' });
        pl.av = from && from.av ? from.av : BOT_SKIN();
        this.room.state.players.set(id, pl);
        const b = {
            s: null, id, pl, spot, name, power: from ? from.power : rnd(1.04, 1.16), x, z, vy: 0, y: 0,
            pace: mt.plan.D.botPace * rnd(0.95, 1.03), trip: mt.plan.D.botTrip * rnd(0.7, 1.3), stunUntil: 0, boostUntil: 0, tx: pos.x, wob: Math.random() * 6, seen: {}, wait: true, lastP: null,
            ...this.lane(),
        };
        if (from) { b.items = from.items; b.seen = from.seen || {}; }
        mt.racers.push(b);
        return b;
    }
    // a late PLAY: the race hasn't started, so you take a bot's place on the line
    joinMatch(mt, s) {
        const bot = mt.racers.find((r) => !r.s);
        if (!bot) return;
        this.removeBot(mt, bot);
        if (this.queue && this.queue.list.includes(s)) this.cancel(s);
        const r = this.addHuman(mt, s, bot.spot);
        this.sendStart(mt, r);
        for (const o of mt.humans) if (o !== s) this.send(o, 'mJoined', { name: s.profile.name, found: mt.humans.size, spot: r.spot });
    }
    removeBot(mt, b) {
        this.room.state.players.delete(b.id);
        mt.racers.splice(mt.racers.indexOf(b), 1);
    }
    sendStart(mt, r) {
        this.send(r.s, 'mStart', this.startMsg(mt, r));
        this.send(r.s, 'mQueue', { off: true });
    }
    startMsg(mt, r) {
        const pos = startSpot(r.spot);
        return { id: mt.id, seed: mt.seed, lv: mt.lv, w: mt.w, n: mt.spots, spot: r.spot, x: pos.x, z: pos.z, ry: pos.ry, goAt: mt.goAt, power: r.power, found: mt.humans.size, names: mt.racers.map((o) => ({ spot: o.spot, n: o.s ? o.s.profile.name : o.name })) };
    }
    // back from a dropped connection: what's going on now (whatever was said meanwhile never arrived)
    resync(s, home) {
        const mt = s.match, r = s.racer;
        if (this.queue && this.queue.list.includes(s)) this.tellQueue(); else this.send(s, 'mQueue', { off: true });
        if (!mt || !r) { this.send(s, 'mNone', home); return; }
        this.send(s, 'mSync', { start: this.startMsg(mt, r), phase: mt.phase, goAt: mt.goAt, endAt: mt.endAt, lanes: this.rows(mt), items: Object.keys(r.items).map(Number) });
    }
    // a human leaves (quits or drops): a bot carries on from where they were, under their name
    leave(s, quit) {
        const mt = s.match, r = s.racer;
        if (this.queue && this.queue.list.includes(s)) this.cancel(s);
        if (!mt) return;
        mt.humans.delete(s);
        s.match = null; s.racer = null;
        if (s.player) s.player.match = 0;
        if (r) {
            mt.racers.splice(mt.racers.indexOf(r), 1);
            // (even in the race's last moment: their row stays on the board, under their name)
            {
                const b = this.addBot(mt, r.spot, { name: s.profile.name, x: r.x, z: r.z, sp: s.profile.speed, wins: s.profile.totalWins, power: r.power, shoe: s.player ? s.player.shoe : 0, team: s.player ? s.player.team : '', av: s.player && s.player.av, items: r.items });
                b.doneAt = r.doneAt; b.place = r.place; b.out = r.out; b.outAt = r.outAt;
            }
        }
        if (!mt.humans.size) this.closeMatch(mt);
        else if (quit) for (const o of mt.humans) this.send(o, 'mLeft', { name: s.profile.name });
    }
    closeMatch(mt) {
        for (const r of [...mt.racers]) if (!r.s) this.room.state.players.delete(r.id);
        this.matches.delete(mt.id);
    }

    // where a player says they are: in their lane, never faster than they run; before the gun, on the line
    move(s, m, dt) {
        const mt = s.match, r = s.racer, L = s.last, now = Date.now();
        if (s.homeAt) {
            if (now - s.homeAt < 5000 && Math.hypot(m.x - L.x, m.z - L.z) > 8) return true;
            s.homeAt = 0;
        }
        if (r.out || r.doneAt) { if (r.doneAt && Math.hypot(m.x - L.x, m.z - L.z) < 40) return false; return true; }
        const cx = laneX(r.spot), boost = now < r.boostUntil + 400;
        let bad = !moveBudget(s, Math.hypot(m.x - L.x, m.z - L.z), MATCH.v * r.power * (boost ? MATCH.boostK : 1) * CFG.dashK * 1.15 + 4, dt) || Math.abs(m.x - cx) > ARENA.hw + ARENA.pw + 2.5 || m.y > 26 || m.y < -10 || m.z > 18 || m.z < mt.plan.finish - 12;
        // before the gun you can shuffle about your spot, no further
        if (mt.phase === 'ready' && m.z < -6) bad = true;
        if (bad) {
            if (now - s.snapAt > 300) {
                s.snapAt = now;
                this.send(s, 'snap', { x: L.x, y: 0, z: L.z });
                if (process.env.QA === '1') console.log('[match snap]', s.profile.name, 'from', [L.x, L.z].map((v) => +v.toFixed(1)), 'to', [m.x, m.z].map((v) => +v.toFixed(1)));
            }
            return true;
        }
        r.x = m.x; r.z = m.z;
        if (mt.phase === 'play' && !r.doneAt && m.z <= mt.plan.finish + 4) { this.finishRacer(mt, r, now); return false; }
        // (when the screen says it was there: its moves carry the server's clock)
        const ts = finite(m.ts) ? Math.max(now - 1500, Math.min(now + 50, m.ts)) : now;
        if (mt.phase === 'play' && now > (r.stunUntil || 0) && laneBallHit(mt.plan, m.x - cx, m.y, m.z, ts / 1000, BALL_PAD)) { this.bonk(s, r, now, true); return true; }
        return false;
    }
    // a ball had you: back to the pocket behind you (or the start line), a moment's daze. tell: the server saw it (your screen hears it
    // from here); else your screen said so ('mHit') and has put you there already
    bonk(s, r, now, tell) {
        const mt = s.match, sp = backSpot(mt.plan, r.spot, s.last.z);
        r.stunUntil = now + 1100; r.bonks = (r.bonks || 0) + 1;
        s.last = { x: sp.x, y: 0, z: sp.z }; s.homeAt = now; r.x = sp.x; r.z = sp.z;
        if (tell) this.send(s, 'mBonk', sp);
    }
    // (no pools in the lanes now)
    fell() {}
    // your screen saw a ball have you: you're back at the pocket behind you
    hit(s) {
        const mt = s.match, r = s.racer, now = Date.now();
        if (!mt || !r || mt.phase !== 'play' || r.doneAt || now < (r.stunUntil || 0) - 600) return;
        this.bonk(s, r, now, false);
    }
    // a boost pad in your lane: you have to be at it, and only once
    item(s, i) {
        const mt = s.match, r = s.racer, now = Date.now();
        if (!mt || !r || mt.phase !== 'play') return;
        const it = mt.plan.obs[i | 0];
        if (!it || it.kind !== 'boost' || r.items[i | 0]) return;
        if (Math.hypot(s.last.x - (laneX(r.spot) + it.x), s.last.z - it.z) > MATCH.r + 8) return;
        r.items[i | 0] = 1;
        r.boostUntil = now + MATCH.boostSecs * 1000;
    }
    // the portal: you're at it
    finish(s) {
        const mt = s.match, r = s.racer, now = Date.now();
        if (!mt || !r || mt.phase !== 'play' || r.doneAt || r.out || s.last.z > mt.plan.finish + 9) return;
        this.finishRacer(mt, r, now);
    }
    finishRacer(mt, r, now) {
        r.doneAt = now;
        r.place = mt.finished++;
        if (!mt.firstAt) {
            mt.firstAt = now;
            // the rest get a last few seconds
            mt.endAt = Math.min(mt.endAt, now + 12000);
        }
        for (const s of mt.humans) this.send(s, 'mDone', { spot: r.spot, place: r.place, endAt: mt.endAt, name: r.s ? r.s.profile.name : r.name });
    }
    // the dark reached someone: out where they stand
    outRacer(mt, r, now) {
        r.out = true; r.outAt = now;
        for (const s of mt.humans) this.send(s, 'mOut', { spot: r.spot, name: r.s ? r.s.profile.name : r.name, z: r.z });
    }

    // 20 times a second
    update(now, dt) {
        const q = this.queue;
        if (q) {
            if (now >= q.startAt) {
                this.queue = null;
                const rest = q.list.splice(CFG.matchSpots);
                if (q.list.length) this.startMatch(q);
                if (rest.length) { this.queue = this.newQueue(now, (this.nextMap++) % WORLDS.length, 0); this.queue.list = rest; this.tellQueue(); }
            } else {
                q.sec += dt;
                if (q.sec >= 1) { q.sec = 0; this.tellQueue(); }
            }
        }
        for (const mt of this.matches.values()) this.tick(mt, now, dt);
    }
    tick(mt, now, dt) {
        if (mt.phase === 'ready') {
            if (now >= mt.goAt) {
                mt.phase = 'play'; mt.endAt = now + mt.plan.secs * 1000;
                for (const s of mt.humans) this.send(s, 'mGo', { at: now, secs: mt.plan.secs });
            }
            return;
        }
        if (mt.phase === 'done') {
            if (now >= mt.wrapAt) this.endMatch(mt);
            return;
        }
        for (const r of mt.racers) if (!r.s) this.driveBot(mt, r, now, dt);
        this.flush(mt, now);
        if (now >= mt.endAt || mt.racers.every((r) => r.doneAt || r.out)) { mt.phase = 'done'; mt.wrapAt = now + 1400; this.flush(mt, now, true); for (const s of mt.humans) this.send(s, 'mTime', {}); }
    }
    rows(mt) { return mt.racers.map((r) => [r.spot, Math.round(r.z * 10) / 10, r.place, r.out ? 1 : 0]); }
    // how far along everyone is
    flush(mt, now, force) {
        if (force || now - mt.scoreAt > 400) {
            mt.scoreAt = now;
            const list = this.rows(mt);
            for (const s of mt.humans) this.send(s, 'mScore', { s: list });
        }
    }
    // a bot: on the line or out in a pocket it waits for the way up to the next pocket to clear (a careless one now and then goes anyway),
    // then runs up its lane's middle at its pace; coming to the next pocket, it ducks in if the way on isn't clear. A ball that has it
    // knocks it back like anyone. It grabs a boost now and then
    driveBot(mt, b, now, dt) {
        const pl = b.pl, cx = laneX(b.spot), plan = mt.plan, t = now / 1000;
        if (b.doneAt || b.out) { pl.anim = 0; pl.x = b.x; pl.z = b.z; pl.y = 0; pl.t = now; pl.spd = 0; return; }
        if (now < b.stunUntil) { pl.anim = 0; pl.x = b.x; pl.z = b.z; pl.y = 0; pl.t = now; pl.spd = 0; return; }
        const boost = now < b.boostUntil, v = MATCH.v * b.power * b.pace * (boost ? MATCH.boostK : 1);
        const P = pocketAt(plan, b.z, 0), N = nextPocket(plan, P ? P.z0 + 0.5 : b.z), zTo = N ? N.z1 - 3 : plan.finish + 3;
        let tx = cx, go = 0;
        if (b.wait) {
            // (on the line: in the lane's middle; in a pocket: out to its side)
            tx = P ? cx + P.side * (ARENA.safe + 2.2) : cx;
            if (Math.abs(b.x - tx) < 0.6 && (laneRunClear(plan, t, b.z, zTo, v * 0.95) || Math.random() < b.trip * dt)) { b.wait = false; b.lastP = P; }
        } else {
            go = v;
            if (P && P !== b.lastP && b.z < P.z1 - 1.5) {
                b.lastP = P;
                if (!laneRunClear(plan, t, b.z, zTo, v * 0.95) && Math.random() > b.trip * 0.5) { b.wait = true; go = 0; }
            }
        }
        b.z -= go * dt;
        b.x += Math.max(-v * dt, Math.min(v * dt, tx - b.x));
        // a boost on the way
        for (let i = 0; i < plan.obs.length; i++) {
            const o = plan.obs[i];
            if (o.kind !== 'boost' || b.seen[i] || b.z > o.z + 2 || b.z < o.z - 2) continue;
            b.seen[i] = 1;
            if (Math.random() < 0.7) { b.items[i] = 1; b.boostUntil = now + MATCH.boostSecs * 1000; }
        }
        if (laneBallHit(plan, b.x - cx, 0, b.z, t, 0.3)) { const sp = backSpot(plan, b.spot, b.z); b.x = sp.x; b.z = sp.z; b.stunUntil = now + 1100; b.wait = true; b.lastP = null; }
        const moving = go > 0 || Math.abs(tx - b.x) > 0.3;
        pl.anim = moving ? 1 : 0;
        pl.ry = go > 0 ? Math.PI : Math.atan2(tx - b.x, 0.01);
        pl.x = b.x; pl.y = 0; pl.z = b.z; pl.t = now; pl.spd = moving ? v : 0;
        if (b.z <= plan.finish + 3) this.finishRacer(mt, b, now);
    }
    endMatch(mt) {
        // first the ones who finished, in order; then how far the rest got
        const order = mt.racers.slice().sort((a, b) => {
            if (a.doneAt && b.doneAt) return a.place - b.place;
            if (a.doneAt) return -1;
            if (b.doneAt) return 1;
            return a.z - b.z;
        });
        order.forEach((r, i) => { r.place = i; });
        const total = Math.max(1, ARENA.startZ - mt.plan.finish);
        const rows = order.map((r) => ({ n: r.s ? r.s.profile.name : r.name, place: r.place, pct: Math.round(clamp((ARENA.startZ - r.z) / total, 0, 1) * 100), done: !!r.doneAt, out: !!r.out, bot: !r.s, spot: r.spot }));
        for (const s of [...mt.humans]) {
            const r = s.racer, prize = matchPrize(r.place, Math.round(mt.plan.n * clamp((ARENA.startZ - r.z) / total, 0, 1)), mt.lv, s.profile);
            this.room.onMatchEnd(s, r, prize, rows, mt);
            s.match = null; s.racer = null;
            s.player.match = 0;
        }
        this.closeMatch(mt);
    }
    info() { return { queue: this.queue ? this.queue.list.length : 0, matches: this.matches.size }; }
}
void PLACES;
// how far into a ball the server needs a racer (studs) before it calls it: the screen calls it at a touch
const BALL_PAD = 1.8;
