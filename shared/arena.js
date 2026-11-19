// Ball Rush: one race's course, worked out from its seed on the server and on every player's screen. Six lanes side by side, each a
// narrow keyboard path with a nook (a pocket) off it every so often, on alternating sides: the same in every lane, so it's fair. Giant
// balls fly out of the finish portal and roll down every lane at the same moment (one every D.ballT seconds), sinking through the grate
// just ahead of the start line. Duck into a pocket while one goes by, then run for the next; a ball that hits you knocks you back to
// the pocket behind you. First through the portal wins; when the clock runs out, the furthest up.
import { rngFrom, matchInfo, WORLDS, CFG } from './config.js';

// laneW: lane to lane; hw: a lane's path, half its width; pw: how far a pocket goes out past the path's edge; pd: a pocket's depth (along
// z); seg: a stretch (one pocket each); first: where the first stretch starts; r: a ball's radius; grate: where the balls sink away
export const ARENA = { laneW: 27, hw: 5.2, pw: 7.4, pd: 10, seg: 40, first: -18, finishBack: 18, startZ: 0, grate: -7, r: 5.6 };
// further from the lane's middle than this (in a pocket) and a ball misses you
ARENA.safe = ARENA.r + 0.9;
export const laneX = (spot) => (spot - (CFG.matchSpots - 1) / 2) * ARENA.laneW;
export const segZ = (i) => ARENA.first - i * ARENA.seg;
export const finishZ = (n) => segZ(n) - ARENA.finishBack;
export const startSpot = (spot) => ({ x: laneX(spot), z: ARENA.startZ, ry: Math.PI });

export function arenaPlan(seed, lv) {
    const r = rngFrom(seed), D = matchInfo(lv), n = D.segs, obs = [], pockets = [];
    // a pocket in every stretch, near its far end, on alternating sides (the first one's side from the seed)
    const s0 = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) { const z = segZ(i) - ARENA.seg * 0.62; pockets.push({ i, z, z0: z - ARENA.pd / 2, z1: z + ARENA.pd / 2, side: i % 2 ? -s0 : s0 }); }
    // boost arrows on the way now and then (a burst of speed: the next pocket sooner)
    for (let i = 1; i < n; i += 3) obs.push({ kind: 'boost', seg: i, z: segZ(i) - ARENA.seg * 0.2, x: (r() - 0.5) * 3 });
    const finish = finishZ(n);
    return { seed, lv, D, n, obs, pockets, secs: D.secs, finish, top: finish - 14, balls: { T: D.ballT, v: D.ballV } };
}
// the balls in every lane at server time t (seconds): their z's between z0 and z1 (the same in each lane), south to north
export function laneBalls(plan, t, z0, z1, out) {
    out = out || [];
    out.length = 0;
    const { T, v } = plan.balls, SP = T * v, s = ((t * v) % SP + SP) % SP, a = Math.max(z0, plan.top), b = Math.min(z1, ARENA.grate);
    for (let i = Math.max(0, Math.ceil((a - plan.top - s) / SP)); plan.top + s + i * SP <= b; i++) out.push(plan.top + s + i * SP);
    return out;
}
// a ball's centre's height where it is (sinking away through the grate at the end)
export const laneBallY = (z) => ARENA.r - Math.max(0, Math.min(ARENA.r * 2 + 0.5, (z - (ARENA.grate - 5)) * 2.4));
// does a ball have someone dx from their lane's middle, feet at y, at z, at t? (pad: how much closer than touching it takes)
const _b = [];
export function laneBallHit(plan, dx, y, z, t, pad) {
    const reach = ARENA.r + 0.7 - (pad || 0);
    if (Math.abs(dx) > reach) return false;
    laneBalls(plan, t, z - reach, z + reach, _b);
    for (const zb of _b) { const cy = laneBallY(zb), dy = Math.max(0, y - cy, cy - (y + 5)); if (dx * dx + (z - zb) ** 2 + dy * dy < reach * reach) return true; }
    return false;
}
// set off now from z (in a pocket, or on the start line) for zTo further up, at v: you get there before any ball coming down closes on
// you? (lag: stepping out of the pocket)
const _c = [];
export function laneRunClear(plan, t, z, zTo, v, lag) {
    const reach = ARENA.r + 1.2, vb = plan.balls.v;
    lag = lag ?? Math.min(0.35, 4 / Math.max(1, v));
    laneBalls(plan, t, plan.top, z + reach, _c);
    // (setting off at once or a moment later: clear either way)
    for (const lg of [lag, 0]) for (const zb of _c) {
        // one at you now (not one already gone down through the grate)
        if (zb > z - reach) { if (zb < ARENA.grate - 0.5) return false; continue; }
        // where it closes on you (it touches you with its middle reach further up than you: no harm only if it's gone down through the
        // grate by then)
        const tc = (z - zb - reach + v * lg) / (v + vb), zm = z - v * Math.max(0, tc - lg);
        if (zm > zTo && zm - reach < ARENA.grate - 0.5) return false;
    }
    return true;
}
// the pocket at z (m: slack along z), or null
export function pocketAt(plan, z, m) { m = m || 0; for (const p of plan.pockets) if (z <= p.z1 + m && z >= p.z0 - m) return p; return null; }
// the next pocket up from z (its near edge north of z), or null (the finish next)
export function nextPocket(plan, z) { for (const p of plan.pockets) if (p.z1 < z - 0.01) return p; return null; }
// where a ball knocks you back to: out in the pocket behind you (or on the start line)
export function backSpot(plan, spot, z) {
    const cx = laneX(spot);
    let best = null;
    for (const p of plan.pockets) if (p.z0 > z - 1 && (!best || p.z < best.z)) best = p;
    return best ? { x: cx + best.side * (ARENA.safe + 2.2), z: best.z } : { x: cx, z: ARENA.startZ };
}
// a lane's physics: no walls to bump into; you stay on its path, or out in a pocket where there is one (walk off a pocket's end beside
// the path and it keeps you in it)
export function arenaPhysics(spot, plan) {
    const cx = laneX(spot), finish = plan.finish, edge = ARENA.hw - 0.8, out = ARENA.hw + ARENA.pw - 0.8;
    return {
        solids: [], floor: 0,
        clamp(b) {
            const dx = b.x - cx, P = pocketAt(plan, b.z, 0);
            let lo = -edge, hi = edge;
            if (P) { if (P.side > 0) hi = out; else lo = -out; }
            if (dx < lo || dx > hi) {
                const N = !P && Math.abs(dx) > edge ? plan.pockets.find((p) => Math.abs(b.z - p.z1) < 2.5 || Math.abs(b.z - p.z0) < 2.5) : null;
                if (N && Math.sign(dx) === N.side) { const s = b.z > N.z1 ? N.z1 : N.z0; b.z = s; if (s === N.z1 ? b.vz > 0 : b.vz < 0) b.vz = 0; }
                else { b.x = cx + Math.max(lo, Math.min(hi, dx)); b.vx = 0; }
            }
            if (b.z > 14) { b.z = 14; if (b.vz > 0) b.vz = 0; }
            if (b.z < finish - 8) { b.z = finish - 8; if (b.vz < 0) b.vz = 0; }
        },
    };
}
export { WORLDS };
