// A world in the sky: Home Row at the south end and the Sprintway going off to the north (-z): a narrow keyboard path climbing into
// the sky, crossed by wide keyboards (shared/stages.js has the Ball Run's rules). Every stage starts on a checkpoint keyboard (passing
// the next one pays the stage's Wins) and has two safe keyboards on the way; between them the path climbs. Giant balls roll down the
// path from the chute at the top to the bin at the bottom (on the checkpoint by Home Row), one every BALLS.T seconds, the same on
// every screen and on the server (server time). Both sides build from these numbers: the client draws it and moves you on it, the
// server checks where you say you are and whether a ball had you.
import { WORLDS, WALLS_N, POSTS, JAWBREAKERS, stageV, CFG } from './config.js';
import { stageType, STAGE_TYPES, RUN, RUNS, BALLS, BALL } from './stages.js';

export const W = {
    spawn: { x: 0, z: 100 },
    plaza: { x0: -124, x1: 124, z0: 44, z1: 152 },
    halfW: RUN.sw,                // how far out the course goes either side (its widest: a checkpoint or a safe keyboard)
    gateH: 22,
    gateT: 3,
    first: 22,                    // the first checkpoint's middle (just through the Sprintway's gate from Home Row)
    padR: 6.5,
    lockGap: 1.6,
    archSlack: 4,                 // how far short of a checkpoint's middle the server still counts you on it (its last word is a moment old)
};
export { RUN, BALLS };
// the gate's opening between Home Row and the first checkpoint (its towers' inner faces)
export const MOUTH = { hw: 18.4 };
// a checkpoint arch's pillars: their middles this far out either side (they stand on the keyboard's two ends)
export const GATE_X = RUN.sw + 0.7;

// ----- the layout. The balls roll faster the higher up the course they are (ballV: a stage's ball speed, near its Recommended Speed's
// pace), so the higher you climb the more your Speed counts. A run (the path between two wide keyboards) is as long as someone at the
// stage's Recommended Speed covers, set off the moment a ball has gone by, before the next one gets to the far end: about three
// quarters of a ball's gap at the start, more every stage (so the margin shrinks from about a second to half of one and the top stages
// need your whole Recommended Speed and good timing), less the moment to step on and off the path, less the ball's own length -----
export const ballV = (k) => +(32 + 0.66 * stageV(Math.max(0, Math.min(WALLS_N - 1, k)))).toFixed(2);
export function runLen(k) {
    const v = stageV(k), vb = ballV(k), slack = (0.76 + 0.014 * k) * BALLS.T - 0.5 - (2 * RUN.r + 2) / vb;
    return Math.round(slack / (1 / v + 1 / vb));
}
// the wide keyboards, south to north: { z0 (north edge), z1 (south edge), z (middle), k (the stage it's in), cp (a checkpoint: stage
// k starts on it), hw (its half width) }; GZ: the checkpoints' middles (stage k runs from GZ[k] to GZ[k + 1])
export const ZONES = [];
const GZ = [], LEN = [];
{
    let z = W.first;
    for (let k = 0; k <= WALLS_N; k++) {
        GZ.push(z);
        ZONES.push({ z0: z - RUN.cd / 2, z1: z + RUN.cd / 2, z, k, cp: true, hw: RUN.sw });
        if (k === WALLS_N) break;
        const G = runLen(k);
        let e = z - RUN.cd / 2;
        for (let i = 1; i < (RUNS[k] || RUN.gaps); i++) {
            e -= G;
            ZONES.push({ z0: e - RUN.sd, z1: e, z: e - RUN.sd / 2, k, cp: false, i, hw: RUN.sw });
            e -= RUN.sd;
        }
        const zn = e - G - RUN.cd / 2;
        LEN.push(z - zn);
        z = zn;
    }
}
ZONES.forEach((o, i) => { o.idx = i; });
// the checkpoint at the start of stage k (k = WALLS_N: the finish, the top of the course)
export const wallZ = (k) => GZ[Math.max(0, Math.min(WALLS_N, k))];
export const stageLen = (k) => LEN[k];
// which stage a point is in (-1: Home Row and the first checkpoint's south half; WALLS_N: past the finish's middle)
export function stageAt(z) { if (z > GZ[0]) return -1; for (let k = 0; k < WALLS_N; k++) if (z > GZ[k + 1]) return k; return WALLS_N; }
// stage k's end: the next checkpoint's middle (being on it pays the stage's Wins)
export const archZ = (k) => wallZ(k + 1);
export const passedArch = (k, z, slack) => k >= 0 && k < WALLS_N && z <= archZ(k) + (slack || 0);
// where a revive (or SKIP) puts you in stage k: out on the east side of its checkpoint, clear of the balls
export const checkpoint = (k) => ({ x: RUN.safeX + 4.5, z: wallZ(Math.max(0, k)) - 2 });
// the course's north edge for a runner (the finish keyboard's far side); the chute stands further up the path
export const northEnd = ZONES[ZONES.length - 1].z0;
export const CHUTE = { z: northEnd - 30 };
// the drain the balls drop into at the bottom: a round hole in the first checkpoint's south half, right in the path's line, a raised
// rim round it (go round it)
export const BIN = { x: 0, z: W.first + 4.4, r: 8.8, h: 1.4 };
// the portal to the next world: on the finish keyboard, east of the path, facing south
export const endPortal = { x: 19, z: wallZ(WALLS_N) - 5, r: 6 };
// the wide keyboard a point is on (m: slack along z), or null on the path
export function zoneAt(z, m) { m = m || 0; for (const o of ZONES) if (z <= o.z1 + m && z >= o.z0 - m) return o; return null; }
// the next wide keyboard north of z (its south edge north of z), or null past the last
export function nextZone(z) { for (const o of ZONES) if (o.z1 < z - 0.01) return o; return null; }
// the wide keyboard nearest z along the course
export function nearZone(z) { let b = null, d = 1e9; for (const o of ZONES) { const e = z > o.z1 ? z - o.z1 : z < o.z0 ? o.z0 - z : 0; if (e < d) { d = e; b = o; } } return b; }
// out on a wide keyboard, clear of the balls' line?
export const safeAt = (x, z) => Math.abs(x) > RUN.safeX && !!zoneAt(z, 0);

// ----- the climb: flat on every wide keyboard, the path rising between them (a little more each stage). floorY(w, z): the floor's
// height at z (0 on Home Row and the first checkpoint); archY(w, k): checkpoint k's. The same in every world -----
const FP = [];            // [z north end of a run, z south end, height at the south end, height at the north end]
{
    let h = 0;
    for (let i = 0; i + 1 < ZONES.length; i++) {
        const a = ZONES[i], b = ZONES[i + 1], rise = +(2.2 + 0.18 * a.k).toFixed(2);
        FP.push([b.z1, a.z0, h, h + rise]);
        a.y = h; h += rise;
    }
    ZONES[ZONES.length - 1].y = h;
    FP.top = h;
}
export function floorY(w, z) {
    if (z >= ZONES[0].z0) return 0;
    for (const [zn, zs, h0, h1] of FP) {
        if (z > zs) return h0;
        if (z >= zn) return h0 + (h1 - h0) * (zs - z) / (zs - zn);
    }
    return FP.top;
}
export const archY = (w, k) => ZONES.find((o) => o.cp && o.k === Math.max(0, Math.min(WALLS_N, k)) && (k < WALLS_N || o.idx === ZONES.length - 1)).y;
// a run's rise per stud (0 on a wide keyboard)
export function slopeAt(w, z) { for (const [zn, zs, h0, h1] of FP) if (z < zs && z > zn) return (h1 - h0) / (zs - zn); return 0; }
// where the floor's slope changes (every wide keyboard's two edges), for the art
export const floorBreakZ = () => ZONES.flatMap((o) => [o.z0, o.z1]).sort((a, b) => a - b);
export const lockZOf = () => -1e9;
export const inGauntlet = (z) => z < W.plaza.z0;

// ----- the balls: one leaves the chute every BALLS.T seconds (on server time t, seconds) and rolls down the path to the drain, at each
// stage's own ball speed (ballV) while it's in that stage. tauOf(z): how long a ball takes from the chute to z; zOfTau: where a ball is
// that long after it left. Every ball follows the same timetable, BALLS.T after the one before -----
const BZ = [], BV = [], BT = [];
{
    // the course from the chute down (z rising): above the finish at the last stage's speed, each stage at its own, the first
    // checkpoint's south half (down to the drain) at the first stage's
    const edges = [CHUTE.z, ...GZ.slice().reverse(), BIN.z], speeds = [];
    for (let i = 0; i + 1 < edges.length; i++) speeds.push(ballV(Math.min(WALLS_N - 1, WALLS_N - i)));
    let tt = 0;
    for (let i = 0; i + 1 < edges.length; i++) { BZ.push(edges[i]); BV.push(speeds[i]); BT.push(tt); tt += (edges[i + 1] - edges[i]) / speeds[i]; }
    BZ.push(BIN.z); BT.push(tt);
}
const TAU_END = BT[BT.length - 1];
export function tauOf(z) {
    if (z <= BZ[0]) return 0;
    for (let i = 0; i < BV.length; i++) if (z <= BZ[i + 1]) return BT[i] + (z - BZ[i]) / BV[i];
    return TAU_END;
}
export function zOfTau(tau) {
    if (tau <= 0) return BZ[0];
    for (let i = 0; i < BV.length; i++) if (tau <= BT[i + 1]) return BZ[i] + (tau - BT[i]) * BV[i];
    return BIN.z;
}
// how fast a ball rolls at z
export function ballSpeedAt(z) { for (let i = 0; i < BV.length; i++) if (z <= BZ[i + 1]) return BV[i]; return BV[BV.length - 1]; }
// the balls between z0 and z1 (z0 < z1) at t: their z's (centres) in out, north to south
export function ballsBetween(t, z0, z1, out) {
    out = out || [];
    out.length = 0;
    const ta = tauOf(Math.max(z0, CHUTE.z)), tb = tauOf(Math.min(z1, BIN.z));
    for (let i = Math.ceil((t - tb) / BALLS.T); i <= Math.floor((t - ta) / BALLS.T); i++) { const tau = t - i * BALLS.T; if (tau >= 0 && tau <= TAU_END) out.push(zOfTau(tau)); }
    return out;
}
// a ball's height off the floor where it is (its centre); sinking into the drain at the end
export function ballY(w, z) { return floorY(w, z) + RUN.r - Math.max(0, Math.min(RUN.r * 2 + 0.5, (z - (BIN.z - 4)) * 4.2)); }
// does a ball have someone standing at x, y (their feet), z at t? pad: how much closer than touching it takes (the server gives the
// benefit of the doubt). A ball is a sphere rolling down the path's middle; someone is a column 0.7 round, five studs tall
const _b = [];
export function ballHit(w, x, y, z, t, pad) {
    const reach = RUN.r + 0.7 - (pad || 0);
    if (Math.abs(x) > reach) return false;
    ballsBetween(t, z - reach, z + reach, _b);
    for (const zb of _b) {
        const cy = ballY(w, zb), dy = Math.max(0, y - cy, cy - (y + 5)), d2 = x * x + (z - zb) * (z - zb) + dy * dy;
        if (d2 < reach * reach) return true;
    }
    return false;
}
// is it safe to set off now from z (out beside the path on a wide keyboard) for zTo further north (where you'll be out of the balls'
// line again), running at v? (lag: how long stepping onto the path takes.) You get to zTo at tp; every ball ahead of you now must still
// be ahead of you (by a ball's reach) then. A ball going past you now: not yet
const _c = [];
export function runClear(t, z, zTo, v, lag) {
    const reach = RUN.r + 1.4;
    lag = lag ?? Math.min(0.45, 6 / Math.max(1, v));
    const tp = lag + Math.max(0, z - zTo) / Math.max(0.1, v);
    ballsBetween(t, CHUTE.z, z + reach, _c);
    for (const zb of _c) {
        if (zb > z - reach) return false;
        if (zOfTau(tauOf(zb) + tp) > zTo - reach) return false;
    }
    return true;
}
// how long until the next ball's front edge reaches z, from t
export function ballEta(t, z) {
    const tz = tauOf(z - RUN.r), u = ((t - tz) % BALLS.T + BALLS.T) % BALLS.T;
    return u === 0 ? 0 : BALLS.T - u;
}

// ----- a stage's plan: its kind and its safe keyboards (the same for everyone) -----
const planCache = new Map();
export function stagePlan(w, k) {
    const key = w * 100 + k;
    if (planCache.has(key)) return planCache.get(key);
    const list = ZONES.filter((o) => !o.cp && o.k === k).map((o) => ({ kind: 'safe', z: o.z, z0: o.z0, z1: o.z1, hw: o.hw }));
    const plan = { w, k, type: stageType(w, k), list, lakes: [], plats: [], icy: [], candies: [], run: runLen(k) };
    planCache.set(key, plan);
    return plan;
}
export { stageType, STAGE_TYPES, BALL };
// (no rifts or ice on the Sprintway now: kept so old callers link)
export const inPool = () => false;
export const onIce = () => false;

// what stands on Home Row: a big open deck floored with giant keys. From the spawn you look north up the keys to the Sprintway's
// gate; the Power Keys in one long row across the north-west (their signs facing you), the giant keyball on its stand by the gate,
// the Upgrade booth and the Rebirth shrine in the north-east, the Eggs in an arc down the east side, the Worlds portal and the
// Ball Rush gate in the south-west, a leaderboard on the west, east and south edges. Every sign is clear of the others.
export const tongueBar = { x: 56, z: 56, r: 14 };
export const upgradeShed = { x: 92, z: 56, r: 14 };
export const worldsPortal = { x: -72, z: 134, r: 8 };
export const playGate = { x: -32, z: 134, r: 9 };
export const boards = [{ x: -120, z: 104 }, { x: 120, z: 104 }, { x: 0, z: 148 }];
const POST_SPOTS = [];
for (let i = 0; i < 9; i++) POST_SPOTS.push([-30 - i * 10.8, 70]);
export const postSpot = (i) => ({ x: POST_SPOTS[i][0], z: POST_SPOTS[i][1] });
export const POST_R = 4.2;       // a Power Key: stand on it and every click counts +N
// a Power Key's top (it's a giant keycap: KEY_TOP high, you step up onto it)
export const BELT = { w: 8.4, l: 8.4 };
export const KEY_TOP = 1.2;
// the Power Key you're standing on, or -1
export function postAt(x, z, r) { for (let i = 0; i < POSTS.length; i++) { const s = POST_SPOTS[i]; if (Math.abs(s[0] - x) < (r ?? BELT.w / 2 + 0.3) && Math.abs(s[1] - z) < BELT.l / 2 + 0.3) return i; } return -1; }
// are you near this Power Key? (not "which is nearest": near enough to two, you're still near the one you're on)
export const nearPost = (i, x, z, r) => { const s = POST_SPOTS[i]; return !!s && (s[0] - x) ** 2 + (s[1] - z) ** 2 < r * r; };
// the Eggs: an arc round (80, 108), opening towards the spawn
const JB_SPOTS = [];
for (let i = 0; i < 8; i++) { const a = (-70 + i * 20) * Math.PI / 180; JB_SPOTS.push([+(80 - 38 * Math.cos(a)).toFixed(2), +(108 + 38 * Math.sin(a)).toFixed(2)]); }
export const jbSpot = (i) => ({ x: JB_SPOTS[i][0], z: JB_SPOTS[i][1] });
export const JB_R = 6.5;
// the giant keyball on its stand by the Sprintway's gate (west of it); the FREE GIFT chest by the spawn
export const ballStand = { x: -46, z: 54, r: 7.5 };
export const scorpionRest = { x: ballStand.x, z: ballStand.z, w: 16, d: 16 };
export const giftSpot = { x: -15, z: 92 };
void JAWBREAKERS;

// ----- a world's physics: flat ground, boxes for what stands on it, and how far you can go (the path's rails, the wide keyboards) -----
const cache = new Map();
export function hubFor(w) {
    if (cache.has(w)) return cache.get(w);
    const Wd = WORLDS[w] || WORLDS[0], solids = [];
    const box = (x, y0, y1, z, sx, sz, o) => solids.push({ min: [x - sx / 2, y0, z - sz / 2], max: [x + sx / 2, y1, z + sz / 2], ...(o || {}) });
    for (const q of [upgradeShed, tongueBar]) {
        box(q.x, 0, 10, q.z - 8, 24, 3);                                                  // the back
        box(q.x, 0, 4.4, q.z + 3, 21.6, 4.4);                                             // the counter
        for (const sx of [-1, 1]) { box(q.x + sx * 11.5, 0, 6, q.z - 3.2, 1.5, 9); box(q.x + sx * 11.5, 0, 10, q.z + 5.6, 1.5, 1.5); }
        box(q.x, 10, 16.5, q.z - 1.4, 25, 15);                                            // the roof
    }
    for (const s of [-1, 1]) box(worldsPortal.x + s * 8, 0, 18, worldsPortal.z, 2.4, 2.4);
    for (const s of [-1, 1]) box(playGate.x + s * 8, 0, 18, playGate.z, 2.4, 2.4);
    for (const b of boards) { if (b.x) box(b.x, 0, 14, b.z, 1.6, 24); else box(b.x, 0, 14, b.z, 24, 1.6); }
    // a Power Key: the giant keycap itself (you step up onto it), its sign's post behind it at the north end
    for (let i = 0; i < POST_SPOTS.length; i++) { const s = POST_SPOTS[i]; box(s[0], 0, KEY_TOP, s[1], BELT.w, BELT.l); box(s[0], 0, 9, s[1] - BELT.l / 2 - 1.4, 1.2, 1.2); }
    for (let i = 0; i < JB_SPOTS.length; i++) { const s = JB_SPOTS[i]; box(s[0], 0, 8, s[1], 3.4, 3.4); }
    // the keyball's stand (and the ball on it)
    box(ballStand.x, 0, 20, ballStand.z, 9, 9, { noStep: true });
    // the drain the balls drop into, at the bottom of the path (its rim: no stepping over it)
    box(BIN.x, 0, BIN.h, BIN.z, BIN.r * 2 - 1, BIN.r * 2 - 1, { noStep: true });
    // every checkpoint's arch: its pillars at the keyboard's two ends; the trophies' plinths beside the checkpoints (west side); the
    // portal's pillars at the top
    for (const Z of ZONES) if (Z.cp) { const gz = Z.idx === 0 ? Z.z0 + 3.2 : Z.z; for (const sx of [-1, 1]) box(sx * GATE_X, Z.y, Z.y + 30, gz, 7.4, 6.6); }
    for (let k = 1; k <= WALLS_N; k++) { const z = wallZ(k) + 5.5, y = archY(w, k); box(-(RUN.safeX + 9), y, y + 3, z, 3, 3); }
    { const y = archY(w, WALLS_N); for (const s of [-1, 1]) box(endPortal.x + s * 7, y, y + 18, endPortal.z, 2.4, 2.4); }
    const T = { w, Wd, solids };
    const floorAt = (x, z) => floorY(w, z);
    T.make = (lock) => ({ solids, floor: 0, floorAt, clamp(b) { clampHub(b, lock); } });
    T.world = T.make(null);
    cache.set(w, T);
    return T;
}
// how far you can go: Home Row's edges; between it and the first checkpoint, the gate's opening; on the course, out to a wide
// keyboard's ends where you're on one, else between the path's rails (walk off a wide keyboard beside the path and it keeps you on it)
function clampHub(b, lock) {
    const P = W.plaza, pw = RUN.pw - 0.8, first = ZONES[0];
    if (b.z >= P.z0) {
        if (b.x < P.x0 + 1) { b.x = P.x0 + 1; if (b.vx < 0) b.vx = 0; } else if (b.x > P.x1 - 1) { b.x = P.x1 - 1; if (b.vx > 0) b.vx = 0; }
        if (b.z > P.z1 - 1) { b.z = P.z1 - 1; if (b.vz > 0) b.vz = 0; }
    } else if (b.z > first.z1) {
        if (Math.abs(b.x) > MOUTH.hw) {
            if (b.z > P.z0 - 3) { b.z = P.z0 + 0.01; if (b.vz < 0) b.vz = 0; }
            else if (Math.abs(b.x) < first.hw - 1 && b.z < first.z1 + 2.5) { b.z = first.z1; if (b.vz > 0) b.vz = 0; }
            else { b.x = Math.sign(b.x) * MOUTH.hw; b.vx = 0; }
        }
    } else {
        const Z = zoneAt(b.z, 0);
        if (Z) { const lim = Z.hw - 1.5; if (Math.abs(b.x) > lim) { b.x = Math.sign(b.x) * lim; b.vx = 0; } }
        else if (Math.abs(b.x) > pw) {
            const N = nearZone(b.z), e = N ? (b.z > N.z1 ? b.z - N.z1 : N.z0 - b.z) : 99;
            if (N && e < 2.5) { b.z = b.z > N.z1 ? N.z1 : N.z0; if (b.z === N.z1 ? b.vz > 0 : b.vz < 0) b.vz = 0; }
            else { b.x = Math.sign(b.x) * pw; b.vx = 0; }
        }
    }
    if (b.z < northEnd + 1) { b.z = northEnd + 1; if (b.vz < 0) b.vz = 0; }
    if (lock && b.z < lock.z) { b.z = lock.z; if (b.vz < 0) b.vz = 0; }
}
void CFG;
