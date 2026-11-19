// A world of Keysprint on screen (shared/world.js has where everything stands): Home Row, a big deck floored with giant keys over a sea
// of clouds (the spawn pad and the FREE GIFT box by it, the row of giant Power Keys you click on, the Eggs on their pedestals, the
// Upgrades and the Rebirth booths, the Worlds portal, the Ball Rush gate and the leaderboards' monitors) inside a low keyboard
// bezel, a giant keyball turning on its stand, two giant keycap mascots and the Sprintway's gate on its north side, a giant coffee mug
// and a row of giant pencils standing in the clouds outside; through the gate the Sprintway: a narrow path of giant keys (keycaps.js)
// climbing into the sky between low bezels with little LEDs and keycap bollards, crossed by wide keyboards (a checkpoint starting
// each stage under a great arch with "STAGE N" on its screen, a "Recommended Speed" board and a golden trophy for the Wins it pays;
// two safe keyboards in each stage, their sides marked off by glowing lines), all of it in a moulded case floating over the clouds;
// the drain the balls drop into at the bottom, the chute they roll out of at the top (stagefx.js draws the balls). Round it all, out
// to the haze, giant keyboards floating in the sky and puffs of cloud.
// Static things are merged per stretch (Home Row, each stage) into two batches: the case (a texture of moulded plastic) and props (lit,
// glowing, swaying). Everything that glows or moves is one draw for the whole world: the plates and stripes (decals), portals and
// halos (energy), the beacons, the Eggs, the arches' screens; the Power Keys are one instanced mesh; the balls are stagefx.js's.
import { T, V3, scene, matte, texFrom, fitFont, prompts, drawLines, linesHeight, groundAt, GROUND_Y } from './engine.js';
import { Kit, glowVCMaterial, nearFade, batchKits, rng } from './geo.js';
import { buildBlobs, releaseBlobs } from './blobs.js';
import { Signs, big, GOLD, LIME, WHITE, RED, AQUA, PINK } from './signs.js';
import { CU } from './clock.js';
import { buildJelly, keyRows, setKeyLegend, KEY_TOP } from './keycaps.js';
import { buildStageFx, STAND_TOP } from './stagefx.js';
import * as SW from '../../shared/world.js';
import * as SG from '../../shared/stages.js';
import * as CF from '../../shared/config.js';
// (the shared data read through their namespaces: what the stages no longer use may lose its exports while they change)
const { W, tongueBar, upgradeShed, worldsPortal, playGate, boards, wallZ, postSpot, BELT, POST_R, jbSpot, JB_R, hubFor, northEnd, endPortal, STAGE_TYPES, floorY, archY, slopeAt, RUN, ZONES, BIN, CHUTE, ballStand } = SW;
const bladeAt = () => 0;
// a Power Key's top (you step up onto it)
const PKEY_TOP = SW.KEY_TOP || 1.2;
const slopeOf = (ctx, z) => slopeAt(ctx.w | 0, z);
// (where things stand on Home Row that only the art and its prompts need: the Big Mouse's mousepad, the gift box)
const SCORP = SW.scorpionRest || { x: -46, z: 52, w: 40, d: 14 }, GIFT_AT = SW.giftSpot || { x: -15, z: 92 };
const { WORLDS, WALLS_N, POSTS, JAWBREAKERS, padWins, stageName, fmt, postLabel } = CF;
// the Speed a stage is laid out for (its "Recommended Speed" board)
const recSpeed = (w, k) => CF.recSpeed(w, k);

export const shade = (c, k) => new T.Color(c).multiplyScalar(k).getHex();
export const mixC = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
const tc = new T.Color();
const col3 = (c) => { tc.set(c); return [tc.r, tc.g, tc.b]; };
export function floorQuad(kit, x0, x1, z0, z1, y, c) { kit.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c, { uv: [x0 / 8, z1 / 8, x1 / 8, z0 / 8] }); }
// ----- the climb: building on the Sprintway's floor (shared/world.js floorY) -----
// a kit seen dy higher: everything put into it through box / quad / faceTo is lifted (a thing built for the flat, standing on the floor)
export function lifted(K, dy) {
    if (!dy) return K;
    const up = (p) => [p[0], p[1] + dy, p[2]];
    return {
        box: (x, y, z, sx, sy, sz, c, o) => K.box(x, y + dy, z, sx, sy, sz, c, o),
        quad: (a, b, c, d, col, o) => K.quad(up(a), up(b), up(c), up(d), col, o),
        faceTo: (a, b, c, d, w, col, o) => K.faceTo(up(a), up(b), up(c), up(d), w, col, o),
    };
}
// where the floor's slope changes in world w (every ramp's and hill's two ends)
const breaksCache = new Map();
export function floorBreaks(w) {
    let b = breaksCache.get(w);
    if (b) return b;
    b = SW.floorBreakZ();
    breaksCache.set(w, b);
    return b;
}
// the pieces of z0..z1 (z0 < z1) the floor runs straight over
function floorPieces(FB, z0, z1) {
    const out = [];
    let a = z0;
    for (const c of FB) if (c > z0 + 0.01 && c < z1 - 0.01) { out.push([a, c]); a = c; }
    out.push([a, z1]);
    return out;
}
// a box along z from z0 to z1 riding the floor fy: its foot dy over the floor, sy tall, sx wide, its middle at x (tilted up a ramp)
export function ride(K, FB, fy, x, z0, z1, dy, sx, sy, c, o) {
    for (const [a, b] of floorPieces(FB, z0, z1)) {
        const hN = fy(a), hS = fy(b), len = b - a, rise = hN - hS;
        if (Math.abs(rise) < 1e-3) K.box(x, hS + dy + sy / 2, (a + b) / 2, sx, sy, len, c, o);
        else { const th = Math.atan(rise / len); K.box(x, (hN + hS) / 2 + (dy + sy / 2) / Math.cos(th), (a + b) / 2, sx, sy, Math.hypot(len, rise) + 0.02, c, { ...(o || {}), rx: th }); }
    }
}
// a flat strip of floor from x0 to x1, z0 to z1, dy over the floor (riding it)
export function rideQuad(K, FB, fy, x0, x1, z0, z1, dy, c, o) {
    for (const [a, b] of floorPieces(FB, z0, z1)) { const hN = fy(a) + dy, hS = fy(b) + dy; K.quad([x0, hS, b], [x1, hS, b], [x1, hN, a], [x0, hN, a], c, { uv: [x0 / 8, b / 8, x1 / 8, a / 8], ...(o || {}) }); }
}
// ----- the keyboard's case under the Sprintway down one side (sx), its outer face at xOut, from z0 north to z1: a slab of moulded
// plastic SLAB deep under the floor (the Sprintway floats over the clouds), a painted band under the kerb, a row of little vent slots
// along it, its underside and a rubber foot now and then under it. skip(z): no foot there -----
export const SLAB = 6;
export function causeway(S, P, sx, xOut, z0, z1, ctx, skip) {
    const { Wd, low } = ctx, st = ctx.st || styleOf(Wd), fy = ctx.fy, FB = ctx.FB, X = sx * (xOut + 0.16), wallC = mixC(Wd.wall, Wd.wall2, 0.18), under = shade(Wd.wall2, 0.72);
    if (!fy || z1 - z0 < 0.1) return;
    for (const [a, b] of floorPieces(FB, z0, z1)) {
        const hN = fy(a), hS = fy(b);
        S.faceTo([X, hS - SLAB, b], [X, hN - SLAB, a], [X, hN, a], [X, hS, b], [sx, 0, 0], wallC, { uv: [b / 8, (hS - SLAB) / 8, a / 8, hN / 8] });
        S.faceTo([X, hS - SLAB, b], [0, hS - SLAB, b], [0, hN - SLAB, a], [X, hN - SLAB, a], [0, -1, 0], under, { uv: [0, b / 8, X / 8, a / 8] });
    }
    ride(P, FB, fy, sx * (xOut + 0.3), z0, z1, -1.5, 0.4, 0.7, Wd.trim);
    ride(P, FB, fy, sx * (xOut + 0.34), z0, z1, -2.3, 0.4, 0.3, Wd.banner);
    // vent slots along its side, a rubber foot under it every so often
    const vg = low ? 12 : 6;
    for (let z = Math.ceil(z0 / vg) * vg; z < z1; z += vg) {
        const Pq = lifted(P, fy(z));
        Pq.box(sx * (xOut + 0.22), -4.2, z, 0.2, 0.55, vg * 0.55, st.dark);
        if (!(skip && skip(z)) && Math.round(z / vg) % 4 === 0) Pq.box(sx * (xOut - 1.6), -SLAB - 0.35, z, 2.6, 0.7, 2.6, st.dark, { soft: !low });
    }
}

// the Sprintway's edge: its kerb's inner face, the kerb's width, the rail's height; how deep the keyboard's case goes
export const XIN = 17.6, WT = 2.6, WH = 3.2, CASE = 7.5;
// a wrecking arm: its pivot over the way, the boom down to the middle of its head (its x is bladeAt * (halfW - 3))
export const BLADE_PIVOT = 22.4, BLADE_ARM = 20.4;

// ----- each world's look beyond its colours (shared/config.js WORLDS has those) -----
// metal / dark: metal and its shadows; lamp: lights; crystal: what glows (reactor cores, gems); accent / accent2: painted stripes and
// panels; rock / rock2: rocks and far things, lit side and under; glowRock: what glows on them (0 none); bulbs: the little lights
// strung on cables; cap: what tops things (white trims); flame / flame2: beacons, lens and flash; wood / wood2: boxes, panels and
// frames; cloth / cloth2: booth canopies in stripes; leaf / leaf2: potted plants; trunk: their pots; cactus: desk cacti; steel: bright
// brushed metal; glass: windows and screens; stripeA / stripeB: the two-tone racing stripes, light and dark
const STYLES = {
    retro: { metal: 0x8a8478, dark: 0x3a3028, lamp: 0xfff4dc, crystal: 0xffd23a, accent: 0xff7a2a, accent2: 0x3ab4e8, rock: 0xf0eadc, rock2: 0xc8bca4, glowRock: 0, bulbs: [0xff7a2a, 0xffd23a, 0xffffff, 0x3ab4e8, 0x7dff6b], cap: 0xfffaf0, flame: 0xffb43a, flame2: 0xfff4c0, panel: 0x3ab4e8, wood: 0xff8a3a, wood2: 0x8a4a1a, cloth: 0xff8a3a, cloth2: 0xfff6e8, leaf: 0x5ac84a, leaf2: 0x3a9a3a, trunk: 0xf4ecda, cactus: 0x5ab84a, steel: 0xd8d2c4, glass: 0xbfe8ff, stripeA: 0xfff6e8, stripeB: 0xff8a3a },
    pastel: { metal: 0x9a8aa8, dark: 0x4a2a44, lamp: 0xfff0fa, crystal: 0xff7ad8, accent: 0x7ae8d8, accent2: 0xff5aa8, rock: 0xf4e4ee, rock2: 0xc8a8bc, glowRock: 0, bulbs: [0xff8ac4, 0xffffff, 0x7ae8d8, 0xc8a0ff, 0xfff07a], cap: 0xffffff, flame: 0xff7ac8, flame2: 0xfff0fa, panel: 0x7ae8d8, wood: 0xffb8dc, wood2: 0xa88aff, cloth: 0xff8ac4, cloth2: 0xffffff, leaf: 0x7ae8a8, leaf2: 0x3ab88a, trunk: 0xffffff, cactus: 0x5ac89a, steel: 0xeee2ee, glass: 0xd8f4ff, stripeA: 0xffffff, stripeB: 0xff8ac4 },
    arctic: { metal: 0x6a8aa8, dark: 0x1a2a40, lamp: 0xe8f8ff, crystal: 0x7af0ff, accent: 0xff5a7a, accent2: 0x1e5ad8, rock: 0xe4f2fa, rock2: 0xa4c0d6, glowRock: 0, bulbs: [0x3a8ae8, 0xffffff, 0x7af0ff, 0xff5a7a, 0xaee8ff], cap: 0xffffff, flame: 0x5ae0ff, flame2: 0xf0fcff, panel: 0x1e7ad8, wood: 0xdfe8f0, wood2: 0x3a8ae8, cloth: 0x3a8ae8, cloth2: 0xffffff, leaf: 0x3a9a8a, leaf2: 0x2a6a6a, trunk: 0xeef6fa, cactus: 0x4a9a8a, steel: 0xd8e4ee, glass: 0xd8f8ff, stripeA: 0xffffff, stripeB: 0x3a8ae8 },
    galaxy: { metal: 0x4a3e6a, dark: 0x140e26, lamp: 0xc8b8ff, crystal: 0x3af0ff, accent: 0x3af0ff, accent2: 0xff6af0, rock: 0x6a5a9a, rock2: 0x342a58, glowRock: 0x7af0ff, bulbs: [0x3af0ff, 0xb46aff, 0xff6af0, 0xffffff, 0x7dff6b], cap: 0x8a7ac8, flame: 0xff4ad8, flame2: 0xe8e0ff, panel: 0x6a3ad8, wood: 0x3a2e62, wood2: 0x7af0ff, cloth: 0x6a3ad8, cloth2: 0x3af0ff, leaf: 0x2a8a8a, leaf2: 0x1a5a6a, trunk: 0x3a2e62, cactus: 0x2a8a7a, steel: 0x6a5e9a, glass: 0x7af0ff, stripeA: 0x2e2458, stripeB: 0x3af0ff },
    hazard: { metal: 0x6a7280, dark: 0x22252e, lamp: 0xfff2c8, crystal: 0x7dff4a, accent: 0xff5a1a, accent2: 0x2ab8b0, rock: 0xc8c6be, rock2: 0x8a8880, glowRock: 0, bulbs: [0xffc21a, 0xff5a1a, 0xffffff, 0x2ab8b0, 0x7dff4a], cap: 0xf4f4f0, flame: 0xff9a14, flame2: 0xfff4c0, panel: 0x2ab8b0, wood: 0x3a7ad8, wood2: 0x22457a, cloth: 0xffc21a, cloth2: 0x22222c, leaf: 0x46b43a, leaf2: 0x2a8030, trunk: 0xf4f4f0, cactus: 0x4aa846, steel: 0xb8c0cc, glass: 0x9ae4ff, stripeA: 0x1a1a22, stripeB: 0xffc21a },
    biolab: { metal: 0x8a7a98, dark: 0x3a1e34, lamp: 0xfff0fa, crystal: 0xff5ad8, accent: 0x3ad8c8, accent2: 0xff3a8a, rock: 0xe8d4e0, rock2: 0xa88aa0, glowRock: 0, bulbs: [0xff5aa8, 0xffffff, 0x3ad8c8, 0xe07aff, 0xffd0e8], cap: 0xffffff, flame: 0xff4aa8, flame2: 0xfff0fa, panel: 0x3ad8c8, wood: 0xf8f4f8, wood2: 0xff6ab4, cloth: 0xff5aa8, cloth2: 0xffffff, leaf: 0x3ad8a0, leaf2: 0x1a9a7a, trunk: 0xffffff, cactus: 0x3ab88a, steel: 0xe0d4e4, glass: 0xc8f4ff, stripeA: 0xffffff, stripeB: 0xff5aa8 },
    cryo: { metal: 0x5a7a9a, dark: 0x1a2a40, lamp: 0xe8f8ff, crystal: 0x7af0ff, accent: 0xff5a7a, accent2: 0x1e5ad8, rock: 0xdfeef8, rock2: 0x9ab8d0, glowRock: 0, bulbs: [0x1e5ad8, 0xffffff, 0x7af0ff, 0xff5a7a, 0xaee8ff], cap: 0xffffff, flame: 0x5ae0ff, flame2: 0xf0fcff, panel: 0x1e7ad8, wood: 0xdfe8f0, wood2: 0x1e5ad8, cloth: 0x1e5ad8, cloth2: 0xffffff, leaf: 0x3a9a8a, leaf2: 0x2a6a6a, trunk: 0xeef6fa, cactus: 0x4a9a8a, steel: 0xd0dde8, glass: 0xd8f8ff, stripeA: 0x1e3a8a, stripeB: 0xffffff },
    void: { metal: 0x4a3e6a, dark: 0x140e26, lamp: 0xc8b8ff, crystal: 0x3af0ff, accent: 0x3af0ff, accent2: 0xff6af0, rock: 0x6a5a9a, rock2: 0x342a58, glowRock: 0x7af0ff, bulbs: [0x3af0ff, 0xb46aff, 0xff6af0, 0xffffff, 0x6a3ad8], cap: 0x8a7ac8, flame: 0xb46aff, flame2: 0xe8e0ff, panel: 0x6a3ad8, wood: 0x3a2e62, wood2: 0x7af0ff, cloth: 0x6a3ad8, cloth2: 0x3af0ff, leaf: 0x2a8a8a, leaf2: 0x1a5a6a, trunk: 0x3a2e62, cactus: 0x2a8a7a, steel: 0x6a5e9a, glass: 0x7af0ff, stripeA: 0x2e2458, stripeB: 0x3af0ff },
};
export const styleOf = (Wd) => STYLES[Wd.id] || STYLES.retro;
// a world's colours as drawn (config.js WORLDS, with a few tuned here for the look)
const LOOK = {};
export const lookOf = (w) => { const Wd = WORLDS[w] || WORLDS[0]; return LOOK[Wd.id] ? { ...Wd, ...LOOK[Wd.id] } : Wd; };

// ----- the keyboard's case: one material for every merged block of a world (its colour is in the vertices), a texture of moulded
// plastic: a fine speckled grain, long soft seams (8 x 4 studs, every other row offset by half), lit along their top and shaded along
// their foot, a little screw hole at the ends of some, a row of vent slots on a few; one texture tile is 8 x 8 studs (tile: 8) -----
let hullMat = null;
function paintHull() {
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), R = rng(7717);
    x.fillStyle = 'rgb(236,236,238)'; x.fillRect(0, 0, N, N);
    // the grain: a fine speckle of lighter and darker dots (matte, textured plastic)
    for (let i = 0; i < 9000; i++) { const v = R(); x.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.5})` : `rgba(60,64,80,${(0.5 - v) * 0.14})`; x.fillRect(R() * N, R() * N, 1 + R() * 2, 1 + R() * 2); }
    // two rows of long panels (256 px: 4 studs high), the second offset by half
    for (let row = 0; row < 2; row++) {
        const y0 = row * 256, h = 256, off = row ? 256 : 0;
        for (const dx of [0, N, -N]) {
            const bx = off + dx - 256;
            for (let k = 0; k < 2; k++) {
                const px = bx + k * N, w = N, tone = (R() - 0.5) * 10;
                if (px > N || px + w < 0) continue;
                x.save(); x.beginPath(); x.roundRect(px + 4, y0 + 4, w - 8, h - 8, 26); x.clip();
                const gr = x.createLinearGradient(0, y0, 0, y0 + h);
                gr.addColorStop(0, `rgba(255,255,255,${0.16 + tone * 0.005})`); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(40,46,70,0.12)');
                x.fillStyle = gr; x.fillRect(px, y0, w, h);
                x.restore();
                // the seam round it: a dark groove, lit along its lower lip
                x.lineWidth = 5; x.strokeStyle = 'rgba(40,44,60,0.32)'; x.beginPath(); x.roundRect(px + 3, y0 + 3, w - 6, h - 6, 28); x.stroke();
                x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.moveTo(px + 30, y0 + 9); x.lineTo(px + w - 30, y0 + 9); x.stroke();
            }
        }
        // a vent of slots on some rows, a screw hole at one end
        const r2 = rng(row * 977 + 5);
        if (r2() < 0.7) { const vx = 60 + r2() * 260, vy = y0 + 150; for (let i = 0; i < 7; i++) { x.fillStyle = 'rgba(30,34,50,0.42)'; x.beginPath(); x.roundRect(vx + i * 22, vy, 12, 56, 6); x.fill(); x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(vx + i * 22 + 2, vy + 56, 9, 3); } }
        const hx = 40 + r2() * 430, hy = y0 + 40;
        x.fillStyle = 'rgba(40,46,60,0.4)'; x.beginPath(); x.arc(hx + 1.5, hy + 2, 8, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(hx, hy, 6.5, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(40,46,60,0.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(hx - 4, hy); x.lineTo(hx + 4, hy); x.moveTo(hx, hy - 4); x.lineTo(hx, hy + 4); x.stroke();
    }
    return c;
}
export function hullMaterial() {
    if (!hullMat) {
        const map = texFrom(paintHull(), true);
        map.anisotropy = 8;
        hullMat = matte({ color: 0xffffff, vertexColors: true, map });
    }
    return hullMat;
}

// ----- custom quads: meshes whose every vertex says what it is (a decal's kind and where in it the vertex is, its colours) -----
export class Quads {
    constructor(spec) { this.spec = spec; this.d = {}; for (const [k] of spec) this.d[k] = []; this.idx = []; this.n = 0; }
    vert(v) { for (const [k, s] of this.spec) { const a = v[k], arr = this.d[k]; for (let i = 0; i < s; i++) arr.push(a ? a[i] ?? 0 : 0); } return this.n++; }
    quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
    geometry() {
        const g = new T.BufferGeometry();
        for (const [k, s] of this.spec) g.setAttribute(k, new T.Float32BufferAttribute(this.d[k], s));
        g.setIndex(this.idx);
        g.computeBoundingSphere();
        return g;
    }
}
const DECAL = [['position', 3], ['aK', 4], ['aC1', 3], ['aC2', 3], ['aOn', 1]];
const ENERGY = [['position', 3], ['aOff', 2], ['aK', 4], ['aC1', 3], ['aC2', 3], ['aOn', 1]];
export const decalQuads = () => new Quads(DECAL);
export const energyQuads = () => new Quads(ENERGY);
// a flat decal (kind) over x/z, its local corners -1..1 (north is -1)
export function decal(Q, kind, cx, y, cz, hx, hz, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), b = Q.n;
    for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) Q.vert({ position: [cx + sx * hx, y, cz + sz * hz], aK: [kind, sx, sz, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] });
    Q.quad(b, b + 1, b + 2, b + 3);
    return b;
}
// a portal standing up, facing +z (and its back facing -z): an oval vortex w x h, its bottom at y0
export function portalDecal(Q, cx, y0, cz, w, h, c1, c2) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y1 = y0 + h;
    decalUp(Q, 6, [x0, y0, cz], [x1, y0, cz], [x1, y1, cz], [x0, y1, cz], c1, c2, 1, h / w);
    decalUp(Q, 6, [x1, y0, cz - 0.04], [x0, y0, cz - 0.04], [x0, y1, cz - 0.04], [x1, y1, cz - 0.04], c1, c2, 1, h / w);
}
// a decal standing up: corners a (bottom left), b (bottom right), c (top right), d (top left) as seen from its front
export function decalUp(Q, kind, a, b, c, d, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), i = Q.n;
    [[a, -1, 1], [b, 1, 1], [c, 1, -1], [d, -1, -1]].forEach(([p, u, v]) => Q.vert({ position: p, aK: [kind, u, v, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }));
    Q.quad(i, i + 1, i + 2, i + 3);
    return i;
}
// energy: a standing quad facing +z (or turned by ry), local 0..1 across and up
export function energyQuad(Q, kind, cx, y0, cz, w, h, c1, c2, on, aux, ry) {
    const C1 = col3(c1), C2 = col3(c2), b = Q.n, ca = Math.cos(ry || 0), sa = Math.sin(ry || 0);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const lx = (u - 0.5) * w; Q.vert({ position: [cx + lx * ca, y0 + v * h, cz - lx * sa], aK: [kind, u, v, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }); }
    Q.quad(b, b + 1, b + 2, b + 3);
    return b;
}
// a halo: a soft glow turned to the camera (in the shader), r its size
export function halo(Q, x, y, z, r, c, k) {
    const C = col3(c), b = Q.n;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) Q.vert({ position: [x, y, z], aOff: [u * r, v * r], aK: [4, u, v, k ?? 1], aC1: C, aC2: C, aOn: [1] });
    Q.quad(b, b + 1, b + 2, b + 3);
}
// a geometry's triangles into energy quads (beams, rings): its uv as the local coordinates
export function energyGeo(Q, g, kind, m4, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), p = g.attributes.position, uv = g.attributes.uv, b = Q.n, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m4); Q.vert({ position: [v.x, v.y, v.z], aK: [kind, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }); }
    if (g.index) for (let i = 0; i < g.index.count; i++) Q.idx.push(b + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) Q.idx.push(b + i);
    return b;
}
const FOG_V = '#include <fog_pars_vertex>', FOG_F = '#include <fog_pars_fragment>';
// The floor's lights, unlit, in one draw: pits (each sector's own), boost chevrons, Win Pads, rings, treadmill belts and their screens,
// portals, ice, hazard stripes. aK.x: the kind, aK.yz: where in it, aK.w: a spare number; aOn: on (a pad ready, a belt open)
// a hazard-stripe band standing up (kind 8): corners a (bottom left), b, c, d as seen from its front; cA/cB: the two stripes
export const stripeUp = (Q, a, b, c, d, cA, cB) => decalUp(Q, 8, a, b, c, d, cA, cB, 1, 0);
// the same lying flat
export const stripeFlat = (Q, cx, y, cz, hx, hz, cA, cB) => decal(Q, 8, cx, y, cz, hx, hz, cA, cB, 1, 0);
// a band of stripes on a wall along z at x, facing face (+1: +x, -1: -x), from z0 to z1, y0..y1 over the floor fy (riding it)
export function rideStripe(Q, FB, fy, x, z0, z1, y0, y1, face, cA, cB) {
    for (const [a, b] of floorPieces(FB || [], z0, z1)) {
        const hN = fy ? fy(a) : 0, hS = fy ? fy(b) : 0;
        if (face < 0) stripeUp(Q, [x, hN + y0, a], [x, hS + y0, b], [x, hS + y1, b], [x, hN + y1, a], cA, cB);
        else stripeUp(Q, [x, hS + y0, b], [x, hN + y0, a], [x, hN + y1, a], [x, hS + y1, b], cA, cB);
    }
}
// a band of stripes across the way (along x, x0 < x1) at z, facing face (+1: +z, -1: -z), y0..y1
export function stripeZ(Q, x0, x1, y0, y1, z, face, cA, cB) {
    if (face > 0) stripeUp(Q, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], cA, cB);
    else stripeUp(Q, [x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], cA, cB);
}
export function decalMaterial(Wd, low) {
    const mode = { retro: 0, pastel: 0, arctic: 2, galaxy: 3 }[Wd.id] ?? 0;
    return new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uMode: { value: mode }, uLow: { value: low ? 1 : 0 } }, { uNow: CU.uNow }]),
        vertexShader: `attribute vec4 aK; attribute vec3 aC1; attribute vec3 aC2; attribute float aOn;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying vec3 vW;
            ${FOG_V}
            void main() {
                vK = aK; vC1 = aC1; vC2 = aC2; vOn = aOn;
                vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
                vec4 mvPosition = viewMatrix * wp;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform float uNow; uniform float uMode; uniform float uLow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying vec3 vW;
            ${FOG_F}
            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            float rr(vec2 q, vec2 b, float r) { vec2 d = abs(q) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
            void main() {
                float k = vK.x, t = uNow; vec2 q = vK.yz; vec3 c = vec3(0.0);
                if (k < 0.5) {
                    // a gap: the sea of clouds below (white, or candy pink), icy water, or the void, its edge lit
                    vec2 p = vW.xz;
                    float edge = smoothstep(0.86, 1.0, abs(q.y)) + smoothstep(0.97, 1.0, abs(q.x)) * vK.w;
                    // a slow swirl and bubbles rising and popping
                    float n = sin(p.x * 0.33 + t * 0.7 + sin(p.y * 0.29 + t * 0.4) * 2.0) * sin(p.y * 0.41 - t * 0.5 + sin(p.x * 0.23) * 1.5);
                    vec2 g = floor(p * 0.45), f = fract(p * 0.45) - 0.5; float h = hash(g), ph = fract(t * 0.45 + h);
                    float bub = (1.0 - smoothstep(0.05 + 0.22 * ph, 0.09 + 0.24 * ph, length(f - (vec2(hash(g + 1.3), hash(g + 2.7)) - 0.5) * 0.3))) * step(0.55, h);
                    // a glossy streak drifting over it (painted, not a reflection)
                    float gloss = smoothstep(0.86, 1.0, sin(p.x * 0.16 + p.y * 0.11 - t * 0.9 + sin(p.y * 0.07) * 2.0));
                    if (uMode < 0.5) {
                        // the clouds far below: soft puffs drifting slowly by, lit on top, blue-grey in their hollows, a gap of sky here and there
                        vec2 cp = p * 0.06 + vec2(t * 0.02, t * 0.035);
                        float c1 = sin(cp.x * 3.1 + sin(cp.y * 2.3) * 1.6) * sin(cp.y * 2.7 - sin(cp.x * 1.9) * 1.4);
                        float c2 = sin(cp.x * 7.3 - t * 0.05 + sin(cp.y * 6.1) * 1.2) * sin(cp.y * 6.7 + sin(cp.x * 5.3) * 1.1);
                        float puff = smoothstep(-0.55, 0.75, c1 * 0.65 + c2 * 0.35);
                        c = mix(vC1 * 0.8, mix(vC2, vec3(1.0), 0.4), puff);
                        c *= 0.92 + 0.12 * smoothstep(0.2, 0.9, c2);
                        bub = 0.0; gloss = 0.0;
                    } else if (uMode < 1.5) {
                        // bio-ooze: a thick violet ooze full of drifting cells, each a pink membrane round a glowing nucleus
                        vec2 cp = p * 0.12 + vec2(sin(t * 0.11 + p.y * 0.03) * 0.6, t * 0.04);
                        vec2 ci = floor(cp), cf = fract(cp) - 0.5;
                        vec2 co = (vec2(hash(ci + 7.0), hash(ci + 9.0)) - 0.5) * 0.45 + 0.08 * vec2(sin(t * 0.9 + hash(ci) * 9.0), cos(t * 0.7 + hash(ci) * 7.0));
                        float cr = length(cf - co), cs = 0.2 + 0.12 * hash(ci + 3.0);
                        c = mix(vC1 * 0.6, vC1 * 1.0, smoothstep(-0.8, 0.9, n));
                        c = mix(c, mix(vC2, vec3(1.0, 0.6, 0.9), 0.4), smoothstep(0.03, 0.0, abs(cr - cs)) * 0.85);
                        c = mix(c, mix(vC2, vec3(1.0), 0.5) * 1.2, (1.0 - smoothstep(cs * 0.25, cs * 0.4, cr)) * 0.9);
                        c = mix(c, vC2 * 0.9, (1.0 - smoothstep(cs * 0.9, cs, cr)) * 0.18);
                    } else if (uMode < 2.5) {
                        // coolant: deep icy blue, light rippling over it (painted caustics), chunks of ice drifting, frost round the edge
                        float cs = abs(sin(p.x * 0.42 + t * 1.1 + sin(p.y * 0.37 + t * 0.7) * 1.8) * sin(p.y * 0.45 - t * 0.9 + sin(p.x * 0.31) * 1.6));
                        c = mix(vC1 * 0.6, vC1 * 1.05, smoothstep(-0.7, 0.9, n));
                        c += mix(vC2, vec3(1.0), 0.4) * smoothstep(0.55, 0.95, cs) * 0.45;
                        vec2 gl = p * 0.1 + vec2(t * 0.025, t * 0.01); vec2 lid = floor(gl), lf = fract(gl) - 0.5;
                        vec2 lr = vec2(lf.x * 0.8 + lf.y * 0.6, lf.y * 0.8 - lf.x * 0.6);
                        float ice = step(0.72, hash(lid)) * step(max(abs(lr.x), abs(lr.y) * 1.3), 0.17 + 0.08 * hash(lid + 2.0));
                        c = mix(c, vec3(0.93, 0.98, 1.0), ice * 0.92);
                        c = mix(c, vec3(1.0), smoothstep(0.7, 1.0, max(abs(q.x) * vK.w, abs(q.y))) * 0.35);
                        bub = 0.0;
                    } else {
                        // the void: a violet abyss, mist turning in a slow spiral, stars twinkling far below
                        float sw = sin(atan(q.y, q.x) * 3.0 + length(q) * 6.0 - t * 0.8) * 0.5 + 0.5;
                        c = mix(vC1 * 0.9, vC2 * 0.55, smoothstep(0.1, 1.0, n) * 0.6 + sw * 0.25);
                        vec2 gs = floor(p * 1.4); float st = step(0.965, hash(gs)) * (0.5 + 0.5 * sin(t * 3.0 + hash(gs + 4.0) * 30.0));
                        c += vec3(0.8, 0.95, 1.0) * st * 0.9;
                        bub *= 0.4;
                    }
                    c = mix(c, mix(vC2, vec3(1.0), 0.5), bub * (1.0 - ph) * 0.8);
                    c += vec3(1.0) * gloss * 0.22;
                    c = mix(c, mix(vC2, vec3(1.0), 0.35) * 1.15, clamp(edge, 0.0, 1.0) * 0.8);
                } else if (k < 1.5) {
                    // a boost pad: chevrons running north, a bright frame
                    float d = rr(q, vec2(1.0), 0.25);
                    if (d > 0.0) discard;
                    float f = fract((q.y + abs(q.x) * 0.55) * 1.4 + t * 1.8);
                    float chev = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.42, 0.5, f)) * step(abs(q.x), 0.78);
                    c = mix(vC1, vC2, chev);
                    c = mix(c, vec3(1.0), (1.0 - smoothstep(0.0, 0.04, -d - 0.08)) * 0.9);
                    c = mix(c, vC1 * 0.6, 1.0 - smoothstep(0.0, 0.03, -d));
                    c *= 1.0 + 0.15 * sin(t * 6.0);
                } else if (k < 2.5) {
                    // a Win Pad: a gold plate, rays turning under a pulse of light, a green rim (grey while it cools down)
                    vec2 vP = q;
                    float d = rr(vP, vec2(0.92), 0.2), r = length(vP), a = atan(vP.y, vP.x);
                    if (d > 0.0) discard;
                    c = mix(vec3(1.0, 0.36, 0.01), vec3(1.0, 0.62, 0.03), smoothstep(0.1, 0.9, r));
                    c = mix(c, vec3(1.0, 0.85, 0.22), smoothstep(0.6, 0.85, sin(a * 8.0 - t * 1.3)) * 0.5 * (1.0 - smoothstep(0.2, 0.92, r)));
                    c = mix(c, vec3(1.0, 0.95, 0.55), smoothstep(0.1, 0.0, abs(fract(r - t * 0.45) - 0.5)) * 0.42);
                    c = mix(c, vec3(0.08, 0.8, 0.1), smoothstep(-0.1, -0.08, d));
                    c = mix(c, vec3(1.0), smoothstep(-0.05, -0.03, d));
                    c = mix(vec3(dot(c, vec3(0.3, 0.5, 0.2))) * 0.62, c, vOn);
                } else if (k < 3.5) {
                    // a ring on the floor: two rings, a band of little keycaps turning between them; in the middle a compass rose (the
                    // spawn), nothing (aux + 2: a laser's danger ring, its band bold flashing dashes) or a keycap emblem (aux + 4: a chest's
                    // stand). aux & 1: the band turns the other way
                    float r = length(q);
                    if (r > 1.0) discard;
                    float vr = floor(vK.w * 0.5 + 0.01), dir = mod(vK.w, 2.0) > 0.5 ? -1.0 : 1.0;
                    float ring = smoothstep(0.035, 0.0, abs(r - 0.96)) + smoothstep(0.03, 0.0, abs(r - 0.72));
                    float ga = atan(q.y, q.x) + t * 0.15 * dir, seg = ga * 16.0 / 6.2832, f = fract(seg) - 0.5, band = step(0.75, r) * step(r, 0.93), mark;
                    if (vr > 0.5 && vr < 1.5) mark = step(0.8, r) * step(r, 0.89) * step(abs(f), 0.22) * (0.5 + 0.3 * sin(t * 6.0));
                    else { float kd = rr(vec2(f * 0.33, r - 0.84), vec2(0.105, 0.065), 0.03); mark = band * (smoothstep(0.016, 0.0, abs(kd)) + step(kd, -0.035) * 0.4); }
                    float rose = 0.0, side = 0.0, emb = 0.0;
                    if (vr < 0.5) {
                        // the compass rose: four long points (north, east, south, west), four short ones between, each lit on one side
                        for (int i = 0; i < 8; i++) {
                            float a0 = float(i) * 0.7854, L = mod(float(i), 2.0) < 0.5 ? 0.68 : 0.42;
                            vec2 d0 = vec2(cos(a0), sin(a0));
                            float u = dot(q, d0), v = dot(q, vec2(-d0.y, d0.x));
                            if (u > 0.0 && u < L && abs(v) < L * 0.2 * (1.0 - u / L) && (rose < 0.5 || L > 0.5)) { rose = 1.0; side = step(0.0, v); }
                        }
                        ring += smoothstep(0.025, 0.0, abs(r - 0.42)) * 0.7 + (1.0 - smoothstep(0.04, 0.06, r));
                    } else if (vr > 1.5) {
                        // a keycap emblem: a big rounded square, a smaller one filled inside it
                        emb = smoothstep(0.025, 0.0, abs(rr(q, vec2(0.36), 0.1))) + step(rr(q - vec2(0.0, 0.03), vec2(0.25), 0.08), 0.0) * 0.5;
                    }
                    float v = clamp(ring + mark + rose + emb, 0.0, 1.0);
                    if (v < 0.06) discard;
                    c = mix(vC1 * 0.7, mix(vC1, vec3(1.0), 0.45) * 1.2, v);
                    if (rose > 0.5) c = mix(vC1 * 0.8, mix(vC1, vec3(1.0), 0.7), side);
                    c *= 0.9 + 0.1 * sin(t * 2.0 + r * 6.0);
                } else if (k < 4.5) {
                    // a treadmill's belt: slats running back, the edges lit in its colour (a shut one: still, dark, its lights red)
                    float run = vOn, sl = fract(q.y * 7.0 - t * 1.6 * run);
                    c = mix(vec3(0.06, 0.065, 0.09), vec3(0.16, 0.17, 0.22), smoothstep(0.0, 0.06, sl) * (1.0 - smoothstep(0.85, 0.92, sl)));
                    float side = smoothstep(0.8, 0.86, abs(q.x));
                    float dash = step(0.5, fract(q.y * 4.0 - t * 1.6 * run));
                    vec3 acc = mix(vec3(1.0, 0.18, 0.12), vC2, run);
                    c = mix(c, acc * (0.7 + 0.5 * dash), side);
                    float chev = fract((q.y + abs(q.x) * 0.5) * 2.0 + t * 0.6 * run);
                    c += acc * 0.18 * smoothstep(0.0, 0.05, chev) * (1.0 - smoothstep(0.18, 0.25, chev)) * step(abs(q.x), 0.5);
                    c *= mix(0.55, 1.0, run);
                } else if (k > 7.5) {
                    // hazard stripes: diagonal bands of the two colours (in the world's own units, so every band on every wall and floor lines
                    // up the same), a dark line along the long edges, a little worn here and there
                    float u = fract((vW.x + vW.y + vW.z) * 0.38);
                    float sm = 0.04;
                    c = mix(vC1, vC2, smoothstep(0.5 - sm, 0.5 + sm, u) * (1.0 - smoothstep(1.0 - sm, 1.0, u)) + (1.0 - smoothstep(0.0, sm, u)) * 0.0);
                    c *= 0.94 - 0.08 * step(0.93, hash(floor(vW.xz * 0.7 + vW.y)));
                    c = mix(c, vC1 * 0.5, smoothstep(0.86, 0.94, abs(q.y)));
                    c *= 0.9;
                } else if (k > 6.5) {
                    // ice: pale blue, frosted, long streaks of shine sliding over it, sparkles, cracks
                    vec2 p = vW.xz;
                    float n = sin(p.x * 0.11 + sin(p.y * 0.07) * 2.0) * sin(p.y * 0.09 + p.x * 0.03);
                    c = mix(vec3(0.62, 0.82, 0.97), vec3(0.86, 0.95, 1.0), 0.5 + 0.5 * n);
                    float streak = smoothstep(0.9, 1.0, sin(p.x * 0.2 + p.y * 0.35 - t * 0.6));
                    c += vec3(1.0) * streak * 0.25;
                    vec2 cg = abs(fract(p * 0.08 + 0.3 * sin(p.yx * 0.05)) - 0.5);
                    c = mix(c, vec3(0.5, 0.7, 0.9), smoothstep(0.47, 0.5, max(cg.x, cg.y)) * 0.6);
                    vec2 sg = floor(p * 1.6); c += vec3(1.0) * step(0.985, hash(sg)) * (0.5 + 0.5 * sin(t * 4.0 + hash(sg + 3.0) * 20.0)) * 0.7;
                    c = mix(c, vec3(1.0), smoothstep(0.9, 1.0, abs(q.x)) * 0.5);
                } else if (k > 5.5) {
                    // a portal: a vortex of its two colours turning in an oval, a white-hot eye, a glowing rim (aux: its height over width)
                    vec2 d = vec2(q.x, -q.y);
                    float r = length(d);
                    if (r > 1.0) discard;
                    vec2 p = vec2(d.x, d.y * vK.w);
                    float pr = length(p), an = atan(p.y, p.x), tw = an + pr * 3.2 - t * 1.6;
                    float arms = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(tw * 3.0)), fine = 0.5 + 0.5 * sin(an * 7.0 - pr * 11.0 + t * 3.1);
                    float lip = smoothstep(0.35, 0.5, abs(fract(tw * 3.0 / 6.2832) - 0.5));
                    c = mix(vC1 * 0.28, vC1 * 1.05, arms);
                    c = mix(c, vC2, arms * fine * 0.5);
                    c = mix(c, mix(vC2, vec3(1.0), 0.4), (1.0 - lip) * arms * 0.5);
                    c = mix(c, vec3(1.0), smoothstep(0.55, 0.0, pr) * 0.8);
                    c = mix(c, vC2 * 1.25, smoothstep(0.82, 0.97, r));
                    c *= 0.92 + 0.12 * sin(t * 2.0 + pr * 4.0);
                } else {
                    // a treadmill's screen: bars bouncing to a beat, a frame (shut: a red cross)
                    vec2 p = vec2(q.x, -q.y) * 0.5 + 0.5;
                    float fr = step(0.92, max(abs(q.x), abs(q.y)));
                    float col = floor(p.x * 7.0), h = 0.25 + 0.6 * abs(sin(t * (2.0 + hash(vec2(col, vK.w)) * 3.0) + col * 1.7));
                    float bar = step(p.y * 1.1, h) * step(0.15, fract(p.x * 7.0)) * step(fract(p.x * 7.0), 0.85) * step(0.12, p.y);
                    c = mix(vec3(0.03, 0.04, 0.08), vC2 * mix(0.7, 1.25, p.y), bar * vOn);
                    float x1 = smoothstep(0.1, 0.0, abs(q.x - q.y)) + smoothstep(0.1, 0.0, abs(q.x + q.y));
                    c = mix(c, vec3(1.0, 0.2, 0.15), x1 * step(abs(q.x), 0.6) * (1.0 - vOn));
                    c = mix(c, vC1, fr);
                }
                gl_FragColor = vec4(c, 1.0);
                #include <fog_fragment>
                #include <colorspace_fragment>
            }`,
        fog: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
}
// Light that's added on top, unlit, in one draw: gate barriers, the beams over Win Pads, the launch gantry's ring, portals and the halos
// round every flame. aOn 0: a barrier is gone, a beam dim
export function energyMaterial() {
    return new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uNow: CU.uNow }]),
        vertexShader: `attribute vec2 aOff; attribute vec4 aK; attribute vec3 aC1; attribute vec3 aC2; attribute float aOn; uniform float uNow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying float vD; varying vec3 vW;
            ${FOG_V}
            void main() {
                vK = aK; vC1 = aC1; vC2 = aC2; vOn = aOn;
                if (aK.x < 0.5 && aOn < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
                vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
                vec4 mvPosition = viewMatrix * wp;
                if (aK.x > 3.5) mvPosition.xy += aOff * (1.0 + 0.1 * sin(uNow * 9.0 + wp.x * 1.7 + wp.z * 0.9) * aK.w);
                vD = -mvPosition.z;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform float uNow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying float vD; varying vec3 vW;
            ${FOG_F}
            void main() {
                float k = vK.x, t = uNow, a = 0.0; vec2 q = vK.yz; vec3 c = vC1;
                if (k < 0.5) {
                    // a gate's barrier: a lattice of light flowing up, bright at its edges, a lock in the middle
                    vec2 p = vec2(q.x * vK.w, q.y * 22.0);
                    vec2 g = p * vec2(0.26, 0.3) + vec2(0.0, -t * 0.25); g.x += mod(floor(g.y), 2.0) * 0.5; vec2 f = fract(g) - 0.5;
                    float line = 1.0 - smoothstep(0.0, 0.035, abs(abs(f.x) + abs(f.y) - 0.5));
                    float flow = 0.5 + 0.5 * sin(p.y * 0.5 - t * 3.2 + sin(p.x * 0.35 + t) * 2.0);
                    float streak = pow(0.5 + 0.5 * sin(p.x * 1.1 + sin(p.y * 0.15 - t * 0.7) * 2.0), 10.0) * (0.5 + 0.5 * sin(p.y * 0.35 - t * 5.0));
                    float edge = smoothstep(0.9, 1.0, abs(q.x * 2.0 - 1.0)) + smoothstep(0.93, 1.0, q.y);
                    float foot = smoothstep(0.12, 0.0, q.y);
                    vec2 lc = vec2((q.x - 0.5) * vK.w, (q.y - 0.42) * 22.0); float lr = length(lc);
                    float lock = smoothstep(0.35, 0.0, abs(lr - 3.2)) + smoothstep(0.3, 0.0, abs(length(vec2(lc.x, max(0.0, lc.y - 2.2))) - 1.5)) * step(2.2, lc.y)
                        + (1.0 - smoothstep(0.5, 0.65, length(lc - vec2(0.0, 0.4)))) + step(abs(lc.x), 0.28) * step(-1.4, lc.y) * step(lc.y, 0.4);
                    lock = clamp(lock, 0.0, 1.0) * (0.7 + 0.3 * sin(t * 3.0));
                    c = mix(vC1, vC2, flow * 0.45 + line * 0.55 + edge * 0.5);
                    float near = smoothstep(0.55, 1.0, max(abs(q.x * 2.0 - 1.0), q.y)) + foot;
                    a = 0.04 + line * (0.07 + 0.1 * flow + 0.25 * near) + streak * 0.22 + edge * 0.65 + foot * 0.4 + lock * 0.85;
                    a *= 0.85 + 0.15 * sin(t * 2.3 + q.x * 9.0);
                } else if (k < 1.5) {
                    // a beam of light up from a Win Pad (dim while it cools down)
                    a = pow(1.0 - q.y, 1.3) * (0.7 + 0.2 * sin(t * 3.0 - q.y * 22.0)) * smoothstep(10.0, 34.0, vD) * (0.2 + 0.8 * vOn);
                    c = mix(vC1, vC2, q.y);
                } else if (k < 2.5) {
                    // the launch gantry's ring of energy, swirling round inside the stone
                    if (vW.y < 0.05) discard;
                    float sw = 0.5 + 0.5 * sin(q.x * 6.2832 * 7.0 + q.y * 6.0 - t * 2.4);
                    float sw2 = 0.5 + 0.5 * sin(q.x * 6.2832 * 13.0 - q.y * 4.0 + t * 3.6);
                    c = mix(vC1, vC2, sw * 0.6 + sw2 * 0.4);
                    a = smoothstep(0.0, 0.7, q.y) * (0.35 + 0.65 * sw * sw2 + 0.4 * smoothstep(0.82, 1.0, q.y));
                    a *= smoothstep(1.0, 0.94, q.y);
                } else if (k < 3.5) {
                    // a portal: a swirl round a bright middle
                    // (aux: its height over its width; a wide one is a curtain of light, a tall one an oval)
                    vec2 d = (q - 0.5) * 2.0, p = vec2(d.x, d.y * vK.w);
                    float r = vK.w < 0.6 ? max(abs(d.x) * 0.92, abs(d.y)) : length(d), pr = length(p) * (vK.w < 0.6 ? 1.0 : 1.3), an = atan(p.y, p.x);
                    float sw = sin(an * 4.0 + pr * 7.0 - t * 3.5) * 0.5 + 0.5, sw2 = sin(an * 7.0 - pr * 5.0 + t * 2.1) * 0.5 + 0.5;
                    if (vK.w < 0.6) { sw = 0.5 + 0.5 * sin(d.x * 9.0 + sin(d.y * 3.0 + t) * 2.0 - t * 2.5); sw2 = 0.5 + 0.5 * sin(d.y * 6.0 - t * 3.0 + d.x * 4.0); }
                    c = mix(vC1, vC2, sw * 0.7 + sw2 * 0.3);
                    c = mix(c, vec3(1.0), smoothstep(0.4, 0.0, pr) * 0.4);
                    a = (1.0 - smoothstep(0.82, 1.0, r)) * (0.3 + 0.35 * sw + 0.25 * smoothstep(0.6, 0.95, r));
                } else {
                    // a halo round a flame
                    float r = length(q);
                    a = pow(max(0.0, 1.0 - r), 2.2) * 0.42 * (0.85 + 0.15 * sin(t * 7.0 + vW.x * 3.0)) * smoothstep(3.0, 9.0, vD);
                }
                #ifdef USE_FOG
                a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
                #endif
                if (a < 0.004) discard;
                gl_FragColor = vec4(c * a, 1.0);
                #include <colorspace_fragment>
            }`,
        fog: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
}
// a portal on its own (a race's finish): a swirl in a w x h plane
export function portalMesh(w, h, c1, c2) {
    const Q = energyQuads();
    energyQuad(Q, 3, 0, -h / 2, 0, w, h, c1, c2, 1, h / w);
    const mesh = new T.Mesh(Q.geometry(), energyMaterial());
    mesh.renderOrder = 3;
    return mesh;
}

// ----- warning beacons: every beacon of a sector, one draw (the list's entries: [x, y, z, size, colour]; called flames in the code,
// where torches stood). Each a domed lens on a dark collar, a bright flash sweeping round it as its mirror turns (in the shader), every
// beacon at its own phase -----
function flameGeo() {
    const pos = [], aP = [], n = 6, R0 = 0.5, H0 = 0.82;
    // aP.x: 0 the collar, 1 the lens, 2 the dome's tip; aP.y: how far round (0..1)
    const ring = (r, y) => { const o = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; o.push([Math.cos(a) * r, y, Math.sin(a) * r, i / n]); } return o; };
    const band = (A, B, part) => { for (let i = 0; i < n; i++) { const a = A[i], b = A[i + 1], c = B[i + 1], d = B[i]; pos.push(a[0], a[1], a[2], d[0], d[1], d[2], b[0], b[1], b[2], b[0], b[1], b[2], d[0], d[1], d[2], c[0], c[1], c[2]); aP.push(part, a[3], part, d[3], part, b[3], part, b[3], part, d[3], part, c[3]); } };
    const c0 = ring(R0 * 1.18, -0.05), l0 = ring(R0, 0.2), l1 = ring(R0, H0), d1 = ring(R0 * 0.62, H0 + 0.3);
    band(c0, l0, 0); band(l0, l1, 1); band(l1, d1, 1);
    const tip = [0, H0 + 0.42, 0];
    for (let i = 0; i < n; i++) { const a = d1[i], b = d1[i + 1]; pos.push(a[0], a[1], a[2], ...tip, b[0], b[1], b[2]); aP.push(1, a[3], 2, a[3], 1, b[3]); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('aP', new T.Float32BufferAttribute(aP, 2));
    return g;
}
export function flameMesh(list, tip, parent) {
    if (!list.length) return null;
    const m = new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uTip: { value: new T.Color(tip) } }, { uNow: CU.uNow }]),
        vertexShader: `attribute vec2 aP; uniform float uNow; uniform vec3 uTip; varying vec3 vC;
            ${FOG_V}
            void main() {
                vec3 ip = instanceMatrix[3].xyz; float sd = ip.x * 1.7 + ip.z * 0.9 + ip.y;
                vec3 p = position;
                // the flash: a bright lobe sweeping round as the mirror turns (each beacon its own phase), a softer one behind it
                float a = aP.y * 6.2832 - uNow * 4.2 - sd;
                float fl = pow(max(0.0, cos(a)), 6.0) + 0.35 * pow(max(0.0, cos(a + 3.1416)), 10.0);
                vec3 lens = mix(instanceColor * 0.62, mix(instanceColor, uTip, 0.65) * 1.45, fl);
                vC = aP.x < 0.5 ? vec3(0.13, 0.14, 0.17) : aP.x > 1.5 ? mix(instanceColor, uTip, 0.5) * 1.2 : lens;
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `varying vec3 vC;
            ${FOG_F}
            void main() { gl_FragColor = vec4(vC, 1.0);
                #include <fog_fragment>
                #include <colorspace_fragment>
            }`,
        fog: true, side: T.DoubleSide,
    });
    const g = flameGeo(), mesh = new T.InstancedMesh(g, m, list.length), o = new T.Object3D(), c = new T.Color();
    list.forEach((f, i) => { o.position.set(f[0], f[1], f[2]); o.rotation.set(0, (f[0] * 7 + f[2]) % 6.28, 0); o.scale.setScalar(f[3]); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, c.set(f[4])); });
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
}

// ----- Star Capsules and cargo pods. One geometry each; aP says which part a vertex is (0 the shell, 1 the bands, 2 what glows),
// and each instance has its two colours (instanceColor the shell, aB the bands and the glow). The Eggs in Home Row turn
// slowly and bob over their stands (spin 1); the cargo pods sliding across a race's lanes don't (spin 0) -----
const SHELL = 0x00ff00, BAND = 0xff0000, GLOWP = 0x0000ff;
function partGeo(k) {
    const g = k.geometry(), col = g.attributes.color, n = col.count, part = new Float32Array(n);
    // which part: its strongest channel; then the colour is just its shading
    for (let i = 0; i < n; i++) { const r = col.getX(i), gg = col.getY(i), b = col.getZ(i); part[i] = b > r && b > gg ? 2 : r > gg ? 1 : 0; const sh = Math.max(r, gg, b); col.setXYZ(i, sh, sh, sh); }
    g.setAttribute('aP', new T.BufferAttribute(part, 1));
    return g;
}
// an egg: wide at its foot and rounded to a point, a band of the second colour round its belly and a thinner one over it, spots that
// glow scattered over its top half
function capsuleGeo(low) {
    const k = new Kit(), n = low ? 8 : 12, one = () => 0.5;
    const prof = [[0.42, 0], [0.8, 0.16], [1.0, 0.5], [1.05, 0.86], [1.0, 1.22], [0.88, 1.58], [0.66, 1.92], [0.38, 2.18], [0.12, 2.32]];
    stack(k, 0, 0, prof.map(([r, y]) => [r, y, SHELL]), n, one);
    // (the bands stand a hair proud of the shell)
    stack(k, 0, 0, [[1.06, 0.72, BAND], [1.075, 0.86, BAND], [1.06, 1.0, BAND]], n, one);
    stack(k, 0, 0, [[0.95, 1.34, BAND], [0.93, 1.42, BAND]], n, one);
    const spots = low ? 4 : 7;
    for (let i = 0; i < spots; i++) {
        const a = i / spots * Math.PI * 2 + (i % 2) * 0.5, y = 1.55 + (i % 3) * 0.2, r = 0.9 - (i % 3) * 0.12;
        k.box(Math.cos(a) * r, y, Math.sin(a) * r, 0.3, 0.26, 0.12, GLOWP, { ry: -a + Math.PI / 2 });
    }
    return partGeo(k);
}
// a cargo pod: a ribbed container, a lit stripe round it (as wide and deep as 2.04, 1.34 high: a race scales it to its lane)
function crateGeo(low) {
    const k = new Kit();
    k.box(0, 0.67, 0, 1.9, 1.3, 1.9, SHELL, { soft: !low });
    for (const s of [-1, 1]) { k.box(s * 0.62, 0.67, 0, 0.2, 1.34, 2.0, BAND); k.box(0, 0.67, s * 0.62, 2.0, 1.34, 0.2, BAND); }
    k.box(0, 0.1, 0, 2.04, 0.2, 2.04, BAND); k.box(0, 1.26, 0, 2.04, 0.16, 2.04, BAND);
    k.box(0, 0.67, 0, 2.02, 0.14, 2.02, GLOWP);
    if (!low) for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * 0.95, 0.67, sz * 0.95, 0.2, 1.36, 0.2, BAND);
    return partGeo(k);
}
function podMaterial(spin, key) {
    const m = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow;
        const rot = spin ? 'float ca = cos(uNow * 0.55 + instanceMatrix[3].x), sa = sin(uNow * 0.55 + instanceMatrix[3].x); mat2 Rr = mat2(ca, -sa, sa, ca);' : '';
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aP; attribute vec3 aB; uniform float uNow; varying float vP; varying vec3 vB; varying vec3 vLp; varying float vSh;')
            .replace('#include <beginnormal_vertex>', spin ? `#include <beginnormal_vertex>\n{ ${rot} objectNormal.xz = Rr * objectNormal.xz; }` : '#include <beginnormal_vertex>')
            .replace('#include <begin_vertex>', `#include <begin_vertex>\nvP = aP; vB = aB; vLp = position; vSh = color.r; ${spin ? `{ ${rot} transformed.xz = Rr * transformed.xz; transformed.y += sin(uNow * 1.4 + instanceMatrix[3].x) * 0.12; }` : ''}`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNow; varying float vP; varying vec3 vB; varying vec3 vLp; varying float vSh;')
            .replace('#include <color_fragment>', `#include <color_fragment>
// the shell: the instance's colour, panel seams round it; the bands: their own colour, a sheen line across them (painted); the glow
float seam = ${spin ? '0.0' : 'smoothstep(0.9, 0.97, fract(vLp.y * 2.6 + 0.2)) * step(vP, 0.5)'};
vec3 shell = diffuseColor.rgb * (1.0 - 0.22 * seam);
vec3 band = vSh * vB * (1.0 + 0.35 * smoothstep(0.75, 1.0, sin(vLp.x * 7.0 + vLp.y * 5.0 + vLp.z * 7.0)));
float glw = step(1.5, vP);
diffuseColor.rgb = vP < 0.5 ? shell : glw > 0.5 ? mix(vB, vec3(1.0), 0.45) * (0.85 + 0.15 * sin(uNow * 3.0 + vLp.y * 4.0)) : band;
if (length(vViewPosition) < 10.0) { float dk = 1.0 - smoothstep(5.0, 10.0, length(vViewPosition)); if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < dk * 2.0) discard; }`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * (0.14 + 0.2 * step(0.5, vP) + 0.75 * glw);`);
    };
    m.customProgramCacheKey = () => key;
    return m;
}
// a sector of them in one draw: list [{ x, y, z, s (size), c1 (shell), c2 (bands), ry }]; spin: Star Capsules (turning), else cargo
// pods; cap: room for more (moving ones)
export function presentMesh(list, low, parent, spin, cap) {
    const g = spin ? capsuleGeo(low) : crateGeo(low), n = Math.max(1, cap ?? list.length), B = new Float32Array(n * 3), c = new T.Color();
    g.setAttribute('aB', new T.InstancedBufferAttribute(B, 3));
    const mesh = new T.InstancedMesh(g, podMaterial(spin, spin ? 'sbe-capsule' : 'sbe-pod'), n), o = new T.Object3D();
    // (the instance colour has to be there before the program is built: the shader reads it)
    mesh.setColorAt(0, c.set(0xffffff));
    list.forEach((J, i) => {
        o.position.set(J.x, J.y, J.z); o.rotation.set(0, J.ry || 0, 0); o.scale.set(J.sx ?? J.s, J.sy ?? J.s, J.sz ?? J.s); o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, c.set(J.c1)); c.set(J.c2); B[i * 3] = c.r; B[i * 3 + 1] = c.g; B[i * 3 + 2] = c.b;
    });
    mesh.count = list.length;
    mesh.frustumCulled = false; mesh.castShadow = !low; mesh.receiveShadow = !low;
    parent.add(mesh);
    return mesh;
}
// ----- a swinging hammer: a steel pole from its pivot (local 0, 0, 0) banded in hazard colours, a heavy head swinging across x: a dark
// steel block in a collar of the sector's accent, a rubber bumper either end (the way it swings), a warning lamp in its face -----
export function bladeGeo(Wd, armLen, scale) {
    const k = new Kit({ glow: true }), L = armLen, s = scale || 1, st = styleOf(Wd);
    k.box(0, -0.4, 0, 1.8 * s, 1.4 * s, 1.8 * s, st.metal, { soft: true });
    const rl = L - 2.6 * s, segs = Math.max(4, Math.round(rl / 2.4)), sl = rl / segs;
    for (let i = 0; i < segs; i++) {
        const y = -1.1 - (i + 0.5) * sl, w = 0.6 * s;
        k.box(0, y, 0, w, sl + 0.04, w, i % 2 ? st.stripeA : st.stripeB);
    }
    k.box(0, -L, 0, 2.5 * s, 2.7 * s, 1.6 * s, st.dark, { soft: true });
    k.box(0, -L, 0, 2.62 * s, 0.8 * s, 1.72 * s, Wd.banner, { soft: true });
    for (const sx of [-1, 1]) {
        k.box(sx * 1.6 * s, -L, 0, 0.8 * s, 2.2 * s, 1.3 * s, st.metal, { soft: true });
        k.box(sx * 2.15 * s, -L, 0, 0.5 * s, 1.9 * s, 1.1 * s, 0x2a2a30, { soft: true });
    }
    for (const sz of [1, -1]) k.box(0, -L + 0.75 * s, sz * 0.82 * s, 0.6 * s, 0.4 * s, 0.12 * s, st.flame, { glow: 1 });
    return k.geometry();
}
const propMats = new Map();
// the props' material of a scene (shared by the wrecking arms' instances: the same program as the batches)
export function propMaterial() { let m = propMats.get(0); if (!m) { m = glowVCMaterial(CU.uNow); propMats.set(0, m); } return m; }
// the arms: the props' material, dissolving in a fine checker as one swings close to the camera (in a lane it would fill the screen)
export function bladeMaterial() {
    let m = propMats.get(1);
    if (!m) { m = nearFade(glowVCMaterial(CU.uNow), 'sbe-arm', 6, 13); propMats.set(1, m); }
    return m;
}

// ----- leaderboards: three holo screens on one texture, one draw -----
function boardAtlas() {
    const c = document.createElement('canvas'); c.width = 1536; c.height = 600;
    return { c, t: texFrom(c), keys: ['', '', ''] };
}
function drawBoard(A, i, title, rows, Wd) {
    const key = JSON.stringify(rows || []);
    if (key === A.keys[i]) return;
    A.keys[i] = key;
    const x = A.c.getContext('2d'), Wb = 768, H = 900, s = 512 / Wb;
    x.setTransform(s, 0, 0, 600 / H, i * 512, 0);
    const glow = '#' + new T.Color(Wd.glow).getHexString(), acc = '#' + new T.Color(Wd.banner).getHexString();
    // a wall monitor: a deep navy screen, scanlines, a header bar in the sector's colour, a steel bezel with a status light
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16224a'); g.addColorStop(1, '#0a1026');
    x.fillStyle = g; x.fillRect(0, 0, Wb, H);
    for (let k = 0; k < H; k += 6) { x.fillStyle = 'rgba(120,200,255,0.035)'; x.fillRect(0, k, Wb, 2); }
    const hg = x.createLinearGradient(0, 30, 0, 140); hg.addColorStop(0, acc); hg.addColorStop(1, 'rgba(0,0,0,0.25)');
    x.fillStyle = hg; x.fillRect(26, 28, Wb - 52, 108);
    x.lineWidth = 16; x.strokeStyle = '#8a94a6'; x.strokeRect(8, 8, Wb - 16, H - 16);
    x.lineWidth = 4; x.strokeStyle = '#d8dee8'; x.strokeRect(17, 17, Wb - 34, H - 34);
    x.fillStyle = '#5aff7a'; x.beginPath(); x.arc(Wb - 46, H - 40, 8, 0, Math.PI * 2); x.fill();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    fitFont(x, title, Wb - 110, 70, 400, '"Russo One", Fredoka, sans-serif', 0.2);
    x.lineWidth = 12; x.strokeStyle = '#0a1026'; x.strokeText(title, Wb / 2, 84); x.fillStyle = '#ffffff'; x.fillText(title, Wb / 2, 84);
    x.fillStyle = glow; x.fillRect(60, 148, Wb - 120, 4);
    (rows || []).slice(0, 9).forEach((r, k) => {
        const y = 196 + k * 76;
        x.fillStyle = k % 2 ? 'rgba(120,200,255,0.05)' : 'rgba(120,200,255,0.12)'; x.fillRect(38, y - 33, Wb - 76, 66);
        x.textAlign = 'left'; x.lineWidth = 8; x.strokeStyle = '#0a1026';
        const name = '#' + (k + 1) + ' ' + r.n;
        fitFont(x, name, Wb - 320, 42, 700, 'Fredoka, sans-serif', 0);
        x.fillStyle = k === 0 ? '#ffd23a' : k === 1 ? '#e8ecf4' : k === 2 ? '#ffa86a' : '#ffffff';
        x.strokeText(name, 54, y); x.fillText(name, 54, y);
        x.textAlign = 'right'; x.font = '700 42px Fredoka, sans-serif'; x.strokeText(fmt(r.v), Wb - 54, y); x.fillStyle = glow; x.fillText(fmt(r.v), Wb - 54, y);
    });
    if (!rows || !rows.length) { x.textAlign = 'center'; x.font = '700 46px Fredoka, sans-serif'; x.fillStyle = '#bfe8ff'; x.fillText('Be the first!', Wb / 2, 224); }
    x.setTransform(1, 0, 0, 1, 0, 0);
    A.t.needsUpdate = true;
}

// ----- shapes -----
// rings from the bottom up, each [radius, height, colour], many-sided and a little uneven, flat-shaded; the top ring closes with a
// cap. A kit of these is part of the sector's one batch: more shapes, not more draws.
export function stack(kit, x, z, rings, sides, R, sq, glow) {
    const wob = rings.map(() => { const w = []; for (let i = 0; i < sides; i++) w.push(0.86 + R() * 0.28); return w; });
    const at = (r, i) => { const a = i / sides * Math.PI * 2 + 0.3, k = rings[r][0] * wob[r][i % sides]; return [x + Math.cos(a) * k, rings[r][1], z + Math.sin(a) * k * (sq || 1)]; };
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) kit.quad(at(r, i + 1), at(r, i), at(r + 1, i), at(r + 1, i + 1), rings[r][2], { c2: rings[r + 1][2], glow: glow || 0 });
    const t = rings.length - 1, top = [x, rings[t][1] + rings[t][0] * 0.08, z];
    for (let i = 0; i < sides; i++) kit.quad(at(t, i + 1), at(t, i), top, top, rings[t][2], { glow: glow || 0 });
}
// the same, upside down (a hanging thing's underside): rings from the top down
function hang(kit, x, z, rings, sides, R, glow) {
    const wob = rings.map(() => { const w = []; for (let i = 0; i < sides; i++) w.push(0.8 + R() * 0.4); return w; });
    const at = (r, i) => { const a = i / sides * Math.PI * 2 + 0.3, k = rings[r][0] * wob[r][i % sides]; return [x + Math.cos(a) * k, rings[r][1], z + Math.sin(a) * k]; };
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) kit.quad(at(r, i), at(r, i + 1), at(r + 1, i + 1), at(r + 1, i), rings[r][2], { c2: rings[r + 1][2], glow: glow || 0 });
    const top = [x, rings[0][1], z];
    for (let i = 0; i < sides; i++) kit.quad(at(0, i), top, top, at(0, i + 1), rings[0][2], { glow: glow || 0 });
}
// an asteroid: a lumpy ball (its middle at x, y, z; half sizes sx, sy, sz), lighter on top, dark under; glow: a Kit glow number
// (5.xx: it drifts up and down)
const LUMP = [-1, -0.58, -0.08, 0.46, 0.86];
export function lump(kit, x, y, z, sx, sy, sz, R, cTop, cBot, glow, sides) {
    const N = sides || 7, rings = LUMP.map((t) => { const r = Math.sqrt(1 - t * t * 0.9), w = []; for (let i = 0; i < N; i++) w.push(r * (0.76 + R() * 0.46)); return w; });
    const at = (l, i) => { const a = (i % N) / N * Math.PI * 2, r = rings[l][i % N]; return [x + Math.cos(a) * r * sx, y + LUMP[l] * sy, z + Math.sin(a) * r * sz]; };
    const cols = LUMP.map((t) => mixC(cBot, cTop, (t + 1) / 2)), L = LUMP.length - 1, g = glow || 0;
    for (let l = 0; l < L; l++) for (let i = 0; i < N; i++) kit.quad(at(l, i + 1), at(l, i), at(l + 1, i), at(l + 1, i + 1), cols[l], { c2: cols[l + 1], glow: g });
    const top = [x, y + sy, z], bot = [x, y - sy * 1.06, z];
    for (let i = 0; i < N; i++) { kit.quad(at(L, i + 1), at(L, i), top, top, cTop, { glow: g }); kit.quad(at(0, i), at(0, i + 1), bot, bot, cBot, { glow: g }); }
}
// a cluster of crystals leaning out of whatever they grow from
function crystals(P, x, y, z, s, c, R) {
    const n = 3 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
        const a = R() * 6.28, h = s * (0.8 + R() * 1.2), w = s * (0.22 + R() * 0.14), lean = 0.15 + R() * 0.45;
        P.box(x + Math.cos(a) * s * 0.25, y + h * 0.42, z + Math.sin(a) * s * 0.25, w, h, w, i % 2 ? c : mixC(c, 0xffffff, 0.35), { glow: 1, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean, ry: a });
    }
}
// a round pylon (a column, a jar's neck): an eight-sided column with a collar at its foot and its top, bands of colour c round it
function pylon(kit, x, z, h, r, body, c, y0, glow) {
    const y = y0 || 0, one = () => 0.5, g = glow || 0;
    stack(kit, x, z, [[r * 1.3, y, shade(body, 0.7)], [r * 1.3, y + r * 0.5, shade(body, 0.8)], [r, y + r * 0.7, body], [r, y + h - r * 0.6, shade(body, 1.06)], [r * 1.22, y + h - r * 0.4, shade(body, 0.85)], [r * 1.22, y + h, shade(body, 0.9)]], 8, one, 1, g);
    for (const f of [0.34, 0.66]) stack(kit, x, z, [[r * 1.05, y + h * f - r * 0.2, c], [r * 1.05, y + h * f + r * 0.2, c]], 8, one, 1, g);
}
// a lab light post: a steel foot, a slim pole, a floodlight head with its lit face (its halo is added to lights)
function lampPost(P, lights, x, z, h, st, Wd) {
    P.box(x, 0.35, z, 1.4, 0.7, 1.4, st.metal, { soft: true });
    P.box(x, 0.85, z, 1.46, 0.3, 1.46, Wd.trim);
    P.box(x, h / 2, z, 0.4, h, 0.4, st.steel);
    P.box(x, h - 0.15, z, 0.9, 0.3, 0.9, st.dark);
    P.box(x, h + 0.5, z, 1.1, 0.7, 1.1, st.dark, { soft: true });
    P.box(x, h + 0.12, z, 0.9, 0.12, 0.9, st.lamp, { glow: 1 });
    P.box(x, h + 0.92, z, 0.5, 0.18, 0.5, Wd.banner, { glow: 1 });
    lights.push([x, h + 0.2, z, 2.6, st.lamp]);
}
// a potted palm (the lab's office plants): a white pot with a rim of the sector's colour, a ringed trunk curving up, a crown of
// fronds arching out and drooping (they sway in the air from the vents: glow 4). y0: its foot
export function palm(P, x, z, h, st, R, low, y0) {
    const y0p = y0 || 0, a0 = R() * 6.28, lean = 0.06 + R() * 0.14, n = low ? 3 : 5, sd = low ? 5 : 6, one = () => 0.5, r0 = h * 0.05, pr = h * 0.16;
    stack(P, x, z, [[pr * 0.78, y0p, shade(st.trunk, 0.8)], [pr, y0p + pr * 1.3, st.trunk], [pr * 1.08, y0p + pr * 1.42, st.panel], [pr * 1.08, y0p + pr * 1.6, st.panel]], sd + 2, one);
    P.box(x, y0p + pr * 1.5, z, pr * 1.6, 0.1, pr * 1.6, 0x4a3424);
    const y = y0p + pr * 1.5, hh = h - pr * 1.5;
    const cx = (f) => x + Math.cos(a0) * lean * hh * f * f, cz = (f) => z + Math.sin(a0) * lean * hh * f * f;
    for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n, r = r0 * (1 - f0 * 0.35);
        stack(P, cx((f0 + f1) / 2), cz((f0 + f1) / 2), [[r * 1.14, y + f0 * hh, 0x7a5a3a], [r * 0.9, y + f1 * hh + 0.06, 0x9a7650]], sd, one);
    }
    const tx = cx(1), tz = cz(1), ty = y + hh, nf = low ? 6 : 8;
    for (let i = 0; i < nf; i++) {
        const a = i / nf * Math.PI * 2 + R() * 0.5, ca = Math.cos(a), sa = Math.sin(a), L1 = h * (0.22 + R() * 0.06), L2 = h * (0.24 + R() * 0.07);
        const p1 = 0.25 + R() * 0.3, p2 = -0.5 - R() * 0.35, c = i % 2 ? st.leaf : st.leaf2, wd = h * 0.09;
        const y1 = ty + 0.2;
        P.box(tx + ca * Math.cos(p1) * L1 / 2, y1 + Math.sin(p1) * L1 / 2, tz + sa * Math.cos(p1) * L1 / 2, L1, 0.16, wd, c, { ry: -a, rz: p1, order: 'YZX', glow: 4 });
        const ex = tx + ca * Math.cos(p1) * L1, ey = y1 + Math.sin(p1) * L1, ez = tz + sa * Math.cos(p1) * L1;
        P.box(ex + ca * Math.cos(p2) * L2 / 2, ey + Math.sin(p2) * L2 / 2, ez + sa * Math.cos(p2) * L2 / 2, L2, 0.14, wd * 0.72, shade(c, 1.1), { ry: -a, rz: p2, order: 'YZX', glow: 4 });
    }
}
// a potted cactus (somebody's desk plant, grown huge on the lab's goo): a ribbed column in a pot, an arm or two bending up. y0: its foot
export function cactus(P, x, z, h, st, R, low, y0) {
    const yp = y0 || 0, r = h * 0.11, sd = low ? 6 : 8, c = st.cactus, c2 = shade(st.cactus, 0.74), one = () => 0.5, pr = r * 1.9;
    stack(P, x, z, [[pr * 0.8, yp, shade(st.trunk, 0.8)], [pr, yp + pr * 1.1, st.trunk], [pr * 1.06, yp + pr * 1.2, st.accent], [pr * 1.06, yp + pr * 1.34, st.accent]], sd, one);
    const y = yp + pr * 1.25;
    stack(P, x, z, [[r * 1.05, y - 0.2, c2], [r, y + h * 0.82, c], [r * 0.62, y + h, shade(c, 1.08)]], sd, one);
    const arms = low ? 1 : 1 + (R() < 0.6 ? 1 : 0), a0 = R() * 6.28;
    for (let i = 0; i < arms; i++) {
        const ang = a0 + i * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang), ay = y + h * (0.32 + R() * 0.22), out = r * 2.5, ah = h * (0.26 + R() * 0.14), ra = r * 0.7;
        P.box(x + ca * out * 0.5, ay, z + sa * out * 0.5, out, ra * 1.7, ra * 1.7, c, { ry: -ang });
        stack(P, x + ca * out, z + sa * out, [[ra, ay - ra * 0.8, c2], [ra, ay + ah * 0.8, c], [ra * 0.6, ay + ah, shade(c, 1.08)]], sd, one);
    }
}
// a chemical drum: a steel barrel with two rolled ribs, a hazard label round its belly (band), a lid with a bung. s: its size
function jar(P, x, z, s, c, band, y0) {
    const y = y0 || 0, one = () => 0.5;
    stack(P, x, z, [[0.92 * s, y, shade(c, 0.75)], [0.95 * s, y + 0.12 * s, c], [0.95 * s, y + 0.62 * s, c], [1.0 * s, y + 0.66 * s, shade(c, 1.1)], [0.95 * s, y + 0.72 * s, c], [0.96 * s, y + 0.9 * s, band], [0.96 * s, y + 1.4 * s, band], [0.95 * s, y + 1.44 * s, c], [1.0 * s, y + 1.5 * s, shade(c, 1.1)], [0.95 * s, y + 1.56 * s, c], [0.95 * s, y + 2.0 * s, c], [0.82 * s, y + 2.06 * s, shade(c, 0.85)]], 10, one);
    P.box(x + 0.4 * s, y + 2.1 * s, z, 0.3 * s, 0.14 * s, 0.3 * s, shade(c, 0.6));
}
// a server rack: a tall dark cabinet, a grille door, rows of little lights blinking (glow 2: they bob, which here reads as a flicker
// of the whole row), a cable bundle snaking from its top
function tent(P, x, z, ry, s, st) {
    const ca = Math.cos(ry), sa = Math.sin(ry), at = (f, r, y) => [x + sa * f + ca * r, y, z + ca * f - sa * r], W2 = 2.4 * s, D2 = 2.0 * s, H2 = 6.2 * s;
    for (let i = 0; i < 2; i++) {
        const r = (i - 0.5) * (W2 + 0.3);
        const c = at(0, r, H2 / 2);
        P.box(c[0], c[1], c[2], W2, H2, D2, st.dark, { ry, soft: true });
        for (let j = 0; j < 7; j++) {
            const q = at(D2 / 2 + 0.04, r, 0.8 + j * 0.78 * s);
            P.box(q[0], q[1], q[2], W2 * 0.82, 0.42 * s, 0.08, 0x2e3240, { ry });
            const l = at(D2 / 2 + 0.1, r - W2 * 0.3, 0.8 + j * 0.78 * s);
            P.box(l[0], l[1], l[2], 0.18, 0.14, 0.06, st.bulbs[(i * 3 + j) % st.bulbs.length], { ry, glow: 1 });
            const l2 = at(D2 / 2 + 0.1, r - W2 * 0.12, 0.8 + j * 0.78 * s);
            if ((i + j) % 2) P.box(l2[0], l2[1], l2[2], 0.18, 0.14, 0.06, 0x5aff7a, { ry, glow: 1 });
        }
        const tp = at(0, r, H2 + 0.12);
        P.box(tp[0], tp[1], tp[2], W2 + 0.1, 0.24, D2 + 0.1, st.metal, { ry });
    }
    const cb = at(-D2 * 0.2, 0, H2 + 0.9);
    P.box(cb[0], cb[1], cb[2], 0.5, 1.6, 0.5, 0x1a1c22, { ry, rz: 0.3 });
}
// a cable strung across the way: sagging from (x0, y, z) to (x1, y, z), little warning lights hanging from it in the sector's colours
// (they sway in the draught: glow 4 for the cable, 1 for the bulbs)
function bunting(K, x0, x1, y, z, sag, cols, gap) {
    const n = Math.max(2, Math.round((x1 - x0) / ((gap || 2.4) * 1.4))), yAt = (u) => y - sag * 4 * u * (1 - u);
    for (let s = 0; s < 4; s++) {
        const u0 = s / 4, u1 = (s + 1) / 4, xa = x0 + (x1 - x0) * u0, xb = x0 + (x1 - x0) * u1, ya = yAt(u0), yb = yAt(u1);
        K.box((xa + xb) / 2, (ya + yb) / 2, z, Math.hypot(xb - xa, yb - ya) + 0.1, 0.16, 0.16, 0x1e2028, { rz: Math.atan2(yb - ya, xb - xa) });
    }
    for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, x = x0 + (x1 - x0) * u, yy = yAt(u), c = cols[i % cols.length];
        K.box(x, yy - 0.3, z, 0.22, 0.4, 0.22, 0x1e2028);
        K.box(x, yy - 0.75, z, 0.5, 0.55, 0.5, c, { glow: 1, soft: true });
    }
}
// a heap of concrete rubble
function rocks(P, x, z, s, st, R, y0) {
    const y = y0 || 0, n = 2 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) { const a = R() * 6.28, d = i ? s * (0.6 + R() * 0.5) : 0, r = s * (i ? 0.45 + R() * 0.3 : 0.8); lump(P, x + Math.cos(a) * d, y + r * 0.5, z + Math.sin(a) * d, r * 1.1, r * 0.75, r, R, st.rock, st.rock2, 0, 6); }
}
// a specimen tank: a steel base and lid, a glass column (pale, a little lit) with goo up to most of it, a blob floating in it (glow 6:
// glowing and drifting up and down), bubbles
function tank(P, x, z, h, r, st, Wd, low, glowC) {
    const one = () => 0.5, sd = low ? 8 : 10;
    stack(P, x, z, [[r * 1.2, 0, st.dark], [r * 1.2, 1.2, st.metal], [r * 1.05, 1.3, st.steel]], sd, one);
    stack(P, x, z, [[r, 1.3, mixC(glowC, 0xffffff, 0.25)], [r, 1.3 + h * 0.72, mixC(glowC, 0xffffff, 0.35)]], sd, one, 1, 1);
    stack(P, x, z, [[r, 1.3 + h * 0.72, mixC(st.glass, 0xffffff, 0.4)], [r, 1.3 + h, mixC(st.glass, 0xffffff, 0.55)]], sd, one, 1, 0);
    stack(P, x, z, [[r * 1.15, 1.3 + h, st.metal], [r * 1.15, 2.1 + h, st.steel], [r * 0.5, 2.6 + h, st.dark]], sd, one);
    lump(P, x, 1.3 + h * 0.45, z + r * 0.2, r * 0.45, r * 0.4, r * 0.45, () => 0.5, mixC(glowC, 0xffffff, 0.6), glowC, 6.3 + Math.abs(x * 0.013) % 0.6, 6);
    if (!low) for (let i = 0; i < 3; i++) P.box(x + Math.cos(i * 2.2) * r * 0.75, 2.2 + i * h * 0.2, z + r * 0.86, 0.22, 0.22, 0.1, 0xffffff, { glow: 2 });
    for (const a of [0.4, 2.5, 4.6]) P.box(x + Math.cos(a) * r * 1.02, 1.3 + h / 2, z + Math.sin(a) * r * 1.02, 0.24, h, 0.24, st.steel);
    void Wd;
}
// a giant pencil standing on its eraser: a pink eraser, a metal band, a six-sided yellow body (the world's banner in Pastel and the
// rest), a wooden point and its lead. y0: its foot; h: its body's height
function pencil(P, x, z, h, r, st, Wd, y0) {
    const one = () => 0.5, y = y0 || 0, body = Wd.id === 'retro' ? 0xffd23a : Wd.banner;
    stack(P, x, z, [[r, y, 0xff8aa8], [r, y + r * 1.4, 0xff8aa8], [r * 1.04, y + r * 1.4, st.steel], [r * 1.04, y + r * 2.4, st.steel], [r, y + r * 2.4, body], [r, y + h, body], [r * 0.12, y + h + r * 2.2, 0xe8c08a]], 6, one);
    stack(P, x, z, [[r * 0.34, y + h + r * 1.45, 0x3a3a44], [r * 0.08, y + h + r * 2.4, 0x2a2a34]], 6, one);
}
// a giant retro computer: a beige box with a curved screen glowing in the world's colour, a keyboard in front of it
function computer(P, x, z, sz, st, Wd) {
    const f = sz > 0 ? 1 : -1;
    P.box(x, 3.4, z, 6.4, 5.6, 6.0, Wd.wall, { soft: true });
    P.box(x, 0.4, z, 6.8, 0.8, 6.4, Wd.wall2);
    P.box(x, 3.7, z + f * 3.02, 4.8, 3.6, 0.1, st.dark);
    P.box(x, 3.7, z + f * 3.08, 4.2, 3.0, 0.1, mixC(Wd.glow, 0x0a1a2a, 0.55), { glow: 1 });
    for (let i = 0; i < 3; i++) P.box(x - 1.3, 4.6 - i * 0.7, z + f * 3.14, 1.4 + i * 0.6, 0.24, 0.06, Wd.glow, { glow: 1 });
    P.box(x + 2.2, 1.3, z + f * 3.02, 0.5, 0.5, 0.1, 0x46ff6a, { glow: 1 });
    P.box(x, 0.35, z + f * 5.2, 6, 0.5, 2.4, Wd.wall, { soft: true });
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) P.box(x - 2.6 + i * 0.74, 0.7, z + f * (4.6 + j * 0.9), 0.6, 0.24, 0.7, Wd.keys[(i + j) % 3]);
}
// a heap of giant loose keycaps, tumbled about
function keycapPile(P, x, z, R, Wd, low) {
    const n = low ? 4 : 7;
    for (let i = 0; i < n; i++) {
        const a = R() * 6.28, d = i ? 1.2 + R() * 3 : 0, k = 2.2 + R() * 1.2, kc = Wd.keys[i % 3], px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, up = i === n - 1 ? k * 0.55 : 0;
        P.box(px, k * 0.28 + up, pz, k, k * 0.55, k, kc, { ry: R() * 3, rx: (R() - 0.5) * 0.3, soft: !low });
        P.box(px, k * 0.6 + up, pz, k * 0.76, k * 0.1, k * 0.76, shade(kc, 1.1), { ry: R() * 3 });
    }
}
// what stands about Home Row: cups of giant pencils, retro computers, heaps of keycaps, boxes, potted plants, a vending machine,
// traffic cones with a wet-floor sign and a mop bucket, a rock heap
function prop(P, Dk, lights, kind, x, z, R, st, Wd, low) {
    if (kind === 'pencils' || kind === 'tanks') {
        stack(P, x, z, [[3.2, 0, st.dark], [3.4, 5.5, Wd.banner], [3.5, 5.9, st.cap]], low ? 8 : 12, () => 0.5);
        const n = low ? 3 : 5;
        for (let i = 0; i < n; i++) { const a = i / n * 6.28, r = 0.55; pencil(P, x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5, 7 + (i % 3) * 1.6, r, st, Wd, 4.6); }
        return;
    }
    if (kind === 'monitor' || kind === 'racks') { computer(P, x, z, z > 100 ? -1 : 1, st, Wd); lights.push([x, 4, z, 4, Wd.glow]); return; }
    if (kind === 'keycaps' || kind === 'drums') { keycapPile(P, x, z, R, Wd, low); return; }
    propOld(P, Dk, lights, kind, x, z, R, st, Wd, low);
}
// the coffee mug of a giant at (x, z), standing in the clouds: a round mug in the world's banner colour, a stripe, coffee in it, its
// handle, steam curling up out of it (glow 5: it drifts)
function mug(P, Dk, x, z, s, st, Wd, low) {
    const one = () => 0.5, r = 6 * s, h = 9 * s, g0 = groundAt(x, z), sd = low ? 12 : 18;
    stack(P, x, z, [[r * 0.94, g0, shade(Wd.banner, 0.8)], [r, g0 + 0.6, Wd.banner], [r, g0 + h, Wd.banner], [r * 1.04, g0 + h + 0.3, st.cap]], sd, one);
    stack(P, x, z, [[r * 1.01, g0 + h * 0.55, st.cap], [r * 1.01, g0 + h * 0.66, st.cap]], sd, one);
    P.box(x, g0 + h - 0.6, z, r * 1.75, 0.2, r * 1.75, 0x4a2a14, { ry: 0.3 });
    // the handle: a thick ring of boxes on its east side
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI, hx = x + r + Math.cos(a) * r * 0.45 + r * 0.12, hy = g0 + h * 0.5 + Math.sin(a) * h * 0.3; P.box(hx, hy, z, 1.4 * s, 1.8 * s, 1.6 * s, Wd.banner, { rz: a }); }
    if (!low) for (let i = 0; i < 3; i++) lump(Dk, x + (i - 1) * r * 0.3, g0 + h + 2 + i * 2.4, z, r * 0.3, 1.2, r * 0.3, () => 0.5, 0xffffff, 0xe8eef4, 5.2 + i * 0.2, 6);
}
// a mascot: a giant smiling keycap on a pedestal over the wall at (x, z), facing Home Row (+z): a chunky cap in the world's colourway,
// a big round letter on its top, two big eyes and a wide smile on its front, rosy cheeks, stubby arms (one waving towards the
// Sprintway: side sx), little stars twinkling over it. s: its size
function keycapMascot(P, Dk, x, z, s, sx, st, Wd, low) {
    const y0 = 6.4, B = 6.4 * s, kc = Wd.keys[sx > 0 ? 2 : 1], top = shade(kc, 1.12);
    P.box(x, y0 + 1.3 * s, z, 8 * s, 2.6 * s, 8 * s, Wd.wall2, { soft: !low });
    P.box(x, y0 + 2.7 * s, z, 8.6 * s, 0.3 * s, 8.6 * s, st.cap);
    // the cap: a wide foot, tapering up to its dished top
    const cy = y0 + 2.85 * s;
    P.box(x, cy + B * 0.45, z, B * 1.5, B * 0.9, B * 1.5, kc, { soft: !low });
    P.box(x, cy + B * 1.05, z, B * 1.28, B * 0.32, B * 1.28, kc, { soft: !low });
    P.box(x, cy + B * 1.24, z, B * 1.14, B * 0.08, B * 1.14, top);
    P.box(x, cy + B * 1.29, z - B * 0.1, B * 0.5, B * 0.04, B * 0.16, Wd.legend);
    P.box(x, cy + B * 1.29, z + B * 0.12, B * 0.16, B * 0.04, B * 0.5, Wd.legend);
    // the face on its front
    const fz = z + B * 0.76, ey = cy + B * 0.62;
    for (const ex of [-1, 1]) {
        P.box(x + ex * B * 0.32, ey, fz, B * 0.3, B * 0.34, 0.5, 0xffffff, { soft: !low });
        P.box(x + ex * B * 0.3, ey - B * 0.04, fz + 0.3, B * 0.15, B * 0.19, 0.2, 0x141826);
        P.box(x + ex * B * 0.27, ey + B * 0.04, fz + 0.42, B * 0.05, B * 0.05, 0.1, 0xffffff, { glow: 1 });
        P.box(x + ex * B * 0.56, ey - B * 0.24, fz - 0.1, B * 0.16, B * 0.09, 0.3, 0xff7aa8);
    }
    for (let i = 0; i < 7; i++) { const u = (i / 6 - 0.5) * 2, mxp = x + u * B * 0.3, my = ey - B * 0.3 - (1 - u * u) * B * 0.1; P.box(mxp, my, fz + 0.1 - Math.abs(u) * 0.2, B * 0.1, B * 0.06, 0.3, 0x141826, { rz: -u * 0.5 }); }
    // stubby arms: one resting, one raised and waving towards the Sprintway
    P.box(x - sx * B * 0.95, cy + B * 0.35, z, B * 0.55, B * 0.24, B * 0.24, kc, { rz: sx * 0.5, soft: !low });
    P.box(x + sx * B * 0.95, cy + B * 0.8, z, B * 0.6, B * 0.24, B * 0.24, kc, { rz: sx * 0.9, soft: !low, glow: 3.2 });
    P.box(x + sx * B * 1.18, cy + B * 1.12, z, B * 0.3, B * 0.3, B * 0.3, kc, { soft: !low, glow: 3.2 });
    if (!low) for (let i = 0; i < 3; i++) Dk.box(x + (i - 1) * 2.4 * s, cy + B * 1.6 + (i % 2) * 1.2, z, 0.7 * s, 0.7 * s, 0.7 * s, Wd.glow, { glow: 2, rz: Math.PI / 4 });
}
// a Power Key's shape: a giant keycap, a square foot tapering to a smaller top (lighter: its colour in the vertices), its foot sunk a
// little in the floor, its top at h
function powerKeyGeo(w, h) {
    const sink = 0.45, rb = (w / 2) * Math.SQRT2, rt = (w / 2 - 0.7) * Math.SQRT2;
    const g = new T.CylinderGeometry(rt, rb, h + sink, 4, 1, false).rotateY(Math.PI / 4).translate(0, (h - sink) / 2, 0).toNonIndexed();
    g.computeVertexNormals();
    const n = g.attributes.normal, col = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) { const k = n.getY(i) > 0.9 ? 1.08 : n.getY(i) < -0.9 ? 0.5 : 0.8; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    return g;
}
// (Home Row's other props, as they were)
function propOld(P, Dk, lights, kind, x, z, R, st, Wd, low) {
    if (kind === 'crates') {
        const n = low ? 3 : 5;
        for (let i = 0; i < n; i++) {
            const s = 1.9 + R() * 0.8, a = R() * 6.28, d = i ? 1.7 + R() * 1.8 : 0, up = i === n - 1 ? s : 0, px = x + Math.cos(a) * d * (up ? 0.2 : 1), pz = z + Math.sin(a) * d * (up ? 0.2 : 1), ry = R() * 0.7;
            if (i % 3 === 2 && !up) { jar(P, px, pz, s * 0.45, st.panel, st.stripeB); continue; }
            P.box(px, s / 2 + up, pz, s, s, s, st.wood, { ry, soft: !low });
            for (const yy of [0.1, 0.9]) P.box(px, s * yy + up, pz, s * 1.04, s * 0.12, s * 1.04, st.wood2, { ry });
            P.box(px, s / 2 + up, pz, s * 1.06, s * 0.22, s * 1.06, st.stripeB, { ry });
        }
    } else if (kind === 'plants') {
        palm(P, x, z, 9 + R() * 4, st, R, low);
        if (!low) { cactus(P, x + 4, z + 1.5, 3.4 + R() * 1.5, st, R, low); palm(Dk, x - 3.6, z + 2.4, 6 + R() * 2, st, R, low); }
    } else if (kind === 'vending') {
        const f = x > 0 ? -1 : 1;
        P.box(x, 3.6, z, 2.6, 7.2, 4.4, Wd.banner, { soft: true, ry: 0 });
        P.box(x + f * 1.32, 4.4, z - 0.4, 0.1, 4.6, 2.8, mixC(st.glass, 0xffffff, 0.3), { glow: 1 });
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) P.box(x + f * 1.38, 2.8 + r * 1.05, z - 1.3 + c * 0.9, 0.1, 0.5, 0.6, st.bulbs[(r + c) % st.bulbs.length], { glow: 1 });
        P.box(x + f * 1.34, 6.7, z, 0.1, 0.7, 4.0, 0xffffff, { glow: 1 });
        P.box(x + f * 1.35, 1.1, z - 0.4, 0.1, 0.8, 2.4, st.dark);
        P.box(x + f * 1.35, 4.4, z + 1.6, 0.1, 2.0, 0.6, st.metal);
        lights.push([x + f * 2.2, 4.4, z, 3.2, st.lamp]);
    } else if (kind === 'cones') {
        for (let i = 0; i < (low ? 3 : 5); i++) { const a = i * 1.3, d = 2.2 + (i % 2) * 1.4, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d; P.box(cx, 0.1, cz, 1.4, 0.2, 1.4, 0x1e2028); stack(P, cx, cz, [[0.62, 0.2, 0xff6a1a], [0.42, 0.8, 0xffffff], [0.36, 1.0, 0xff6a1a], [0.12, 1.7, 0xff6a1a]], 8, () => 0.5); }
        P.box(x, 1.3, z, 1.6, 2.6, 0.12, 0xffd21a, { rx: 0.25 }); P.box(x, 1.3, z - 0.7, 1.6, 2.6, 0.12, 0xffd21a, { rx: -0.25 });
        P.box(x, 1.5, z + 0.07, 0.8, 0.8, 0.06, 0x1a1a22, { rx: 0.25, rz: Math.PI / 4 });
        stack(P, x + 2.8, z - 2.2, [[0.8, 0.2, 0xffc21a], [0.95, 1.4, 0xffc21a]], 8, () => 0.5);
        P.box(x + 2.8, 1.3, z - 2.2, 1.5, 0.1, 1.5, 0x6a8aa0, { glow: 1 });
        P.box(x + 2.8, 3.0, z - 2.0, 0.16, 4.2, 0.16, 0xb8865a, { rx: 0.25 });
    } else {
        rocks(P, x, z, 2.2 + R() * 1.5, st, R);
    }
}
// ----- far away, round the Sprintway out to the haze: giant keyboards floating in the sky (a case, rows of keys on it, tilted a little,
// a cloud under some), big puffs of cloud, now and then a giant floating keycap; in RGB Galaxy the keyboards' keys glow. kits: a few
// along the way (each culled on its own); from z0 north to z1 -----
export function horizon(Wd, kits, R, z0, z1, low) {
    const n = kits.length, span = z0 - z1, step = low ? 230 : 150, night = Wd.id === 'galaxy';
    const cloudTop = night ? 0x8a7ac8 : 0xffffff, cloudBot = night ? 0x3a2a6a : mixC(Wd.hazard, 0xc8d4e4, 0.5);
    for (let z = z0; z > z1; z -= step) for (const sx of [-1, 1]) {
        const s = 22 + R() * 40, x = sx * Math.max(230 + R() * 400, s * 1.6 + 175), zz = z - R() * step * 0.8, gy = groundAt(x, zz), pick = R();
        const kit = kits[Math.min(n - 1, Math.max(0, Math.floor((z0 - zz) / span * n)))];
        if (pick < 0.55 || (low && pick < 0.7)) {
            // a giant keyboard: its case, rows of keys (a long spacebar in the front row), a little tilt
            const w = s * (2.2 + R() * 0.8), d = s * (0.85 + R() * 0.25), y = gy + 24 + R() * 90, ry = (R() - 0.5) * 0.7, rows = low ? 3 : 4, cols = low ? 7 : 10;
            const cr = Math.cos(ry), sr = Math.sin(ry), at = (u, v) => [x + u * cr + v * sr, zz - u * sr + v * cr];
            kit.box(x, y, zz, w, s * 0.14, d, Wd.wall, { ry });
            kit.box(x, y - s * 0.09, zz, w * 0.96, s * 0.05, d * 0.94, Wd.wall2, { ry });
            const kw = w / (cols + 0.6), kd = d / (rows + 0.6);
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                const space = r === rows - 1 && c > 1 && c < cols - 2;
                if (space && c !== 2) continue;
                const u = (c - (cols - 1) / 2) * kw + (space ? (cols - 5) / 2 * kw : 0), v = (r - (rows - 1) / 2) * kd, [px, pz] = at(u, v);
                const kc = Wd.keys[space ? 1 : (r + c) % 5 === 0 ? 2 : (r * 3 + c) % 4 === 0 ? 1 : 0];
                kit.box(px, y + s * 0.12, pz, space ? kw * (cols - 4) * 0.94 : kw * 0.84, s * 0.1, kd * 0.82, kc, night ? { ry, glow: (r + c) % 3 === 0 ? 1 : 0 } : { ry });
            }
            if (!low && R() < 0.5) lump(kit, x, y - s * 0.5, zz, s * 0.9, s * 0.3, s * 0.6, R, cloudTop, cloudBot, 5.1 + R() * 0.4, 7);
        } else if (pick < 0.88) {
            // a big puff of cloud
            const cy = gy + 6 + R() * 40;
            lump(kit, x, cy, zz, s * 1.1, s * 0.42, s * 0.8, R, cloudTop, cloudBot, 5.1 + R() * 0.5, low ? 6 : 8);
            if (!low) lump(kit, x + s * 0.6, cy + s * 0.2, zz + s * 0.2, s * 0.6, s * 0.32, s * 0.5, R, cloudTop, cloudBot, 5.2 + R() * 0.5, 7);
        } else {
            // a giant keycap floating on its own, turning slowly
            const k = s * 0.7, y = gy + 30 + R() * 70, kc = Wd.keys[Math.floor(R() * 3)];
            kit.box(x, y, zz, k, k * 0.5, k, kc, { ry: R() * 3 });
            kit.box(x, y + k * 0.3, zz, k * 0.78, k * 0.12, k * 0.78, shade(kc, 1.08), { ry: R() * 3 });
        }
    }
}
// ----- the Sprintway's edge: down one side (sx -1 west, 1 east), its kerb's inner face at xIn, from z0 north up to z1, riding the
// floor (ctx.fy; flat where there's none, like a race's lanes): a kerb at the runners' height with a strip of paint, the case's raised
// bezel (its accent stripe, a soft cap), little status LEDs along its top, and now and then a chunky keycap bollard on it. skip(z): no
// bollard there (a gate's frame, a spacebar's dock) -----
export function railRun(S, P, sx, xIn, z0, z1, ctx, skip) {
    const { Wd, st, low } = ctx, len = z1 - z0, Q = ctx.dk || P, xc = sx * (xIn + WT / 2), fy = ctx.fy || (() => 0), FB = ctx.FB || [];
    if (len <= 0.1) return;
    if (!ctx.fy) S.box(xc, -CASE / 2, (z0 + z1) / 2, WT, CASE, len, Wd.wall2, { tile: 8 });
    ride(S, FB, fy, xc, z0, z1, 0, WT + 0.3, 0.6, shade(Wd.floor2, 0.92), { tile: 8 });
    ride(P, FB, fy, sx * (xIn - 0.04), z0, z1, 0.13, 0.08, 0.34, Wd.banner);
    const xw = sx * (xIn + WT - 0.55), wh = 2.2, top = 0.6 + wh;
    ride(S, FB, fy, xw, z0, z1, 0.6, 1.1, wh, Wd.wall, { tile: 8 });
    ride(P, FB, fy, xw - sx * 0.05, z0, z1, 1.15, 1.2, 0.36, Wd.trim);
    ride(P, FB, fy, xw, z0, z1, top, 1.36, 0.3, st.cap, { soft: !low });
    // the status LEDs along its top, in the world's colours
    const mg = low ? 16 : 9, mn = Math.floor(len / mg), led = [Wd.glow, Wd.sea2, Wd.banner];
    for (let i = 0; i < mn; i++) {
        const z = z0 + (i + 0.5) * mg;
        lifted(Q, fy(z)).box(xw, top + 0.33, z, 0.46, 0.14, 0.9, led[i % 3], { glow: 1 });
    }
    // keycap bollards on the bezel: a chunky key in the world's colourway, a lighter top
    const pg = low ? 66 : 44, pn = Math.max(1, Math.floor(len / pg)), psp = len / pn;
    for (let i = 0; i < pn; i++) {
        const z = z0 + (i + 0.5) * psp;
        if (skip && skip(z)) continue;
        const Pq = lifted(P, fy(z)), kc = Wd.keys[(i + (sx > 0 ? 1 : 0)) % 3];
        Pq.box(xw, top + 1.35, z, 2.7, 2.1, 2.7, kc, { soft: !low });
        Pq.box(xw, top + 2.5, z, 2.1, 0.3, 2.1, shade(kc, 1.1), { soft: !low });
    }
}
// ----- lettering fixed to things (the gates' "STAGE N", the "Recommended Level" boards): one atlas, one draw, the leaderboards' own
// program (MeshBasicMaterial with a map). Each label is painted once into a cell (wide 4:1, else 2:1); its quads face +z (back: -z,
// still reading the right way round) -----
class Plaques {
    constructor(low, frame) { this.frame = frame || '#ffc23a'; this.k = low ? 0.75 : 1; this.cells = []; this.byKey = new Map(); this.q = []; }
    // a label: lines (signs.js style), wide or not, its screen (0 a gate's plaque, 1 a holo board)
    cell(key, lines, wide, look) { let c = this.byKey.get(key); if (c === undefined) { c = this.cells.length; this.cells.push({ lines, wide, look }); this.byKey.set(key, c); } return c; }
    // label c on a w x h quad, its middle at x, y, z, facing +z (back: -z)
    quad(c, x, y, z, w, h, back) { this.q.push([c, x, y, z, w, h, back]); }
    build(parent) {
        if (!this.q.length) return null;
        const CW = Math.round(384 * this.k), CH = Math.round(96 * this.k), AW = CW * 4, at = [];
        let cx = 0, cy = 0;
        for (const c of this.cells) { const w = c.wide ? CW : CW / 2; if (cx + w > AW) { cx = 0; cy += CH; } at.push([cx, cy, w]); cx += w; }
        const AH = cy + CH, cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
        const x = cv.getContext('2d');
        this.cells.forEach((c, i) => {
            const [px, py, w] = at[i];
            x.save(); x.translate(px, py);
            // a lit screen: deep navy, scanlines, a frame in the sector's colour, a soft glow in its middle
            const g = x.createLinearGradient(0, 0, 0, CH);
            if (c.look) { g.addColorStop(0, '#1c2c5a'); g.addColorStop(1, '#0a1230'); } else { g.addColorStop(0, '#16224a'); g.addColorStop(1, '#070c20'); }
            x.fillStyle = g; x.fillRect(0, 0, w, CH);
            const rg = x.createRadialGradient(w / 2, CH / 2, 2, w / 2, CH / 2, w * 0.5); rg.addColorStop(0, 'rgba(120,200,255,0.18)'); rg.addColorStop(1, 'rgba(120,200,255,0)');
            x.fillStyle = rg; x.fillRect(0, 0, w, CH);
            const lw = Math.max(3, CH * 0.06);
            for (let i = 0; i < CH; i += 4) { x.fillStyle = 'rgba(140,210,255,0.05)'; x.fillRect(lw, i, w - lw * 2, 1.5); }
            x.lineWidth = lw; x.strokeStyle = this.frame; x.strokeRect(lw / 2, lw / 2, w - lw, CH - lw);
            x.lineWidth = Math.max(1, lw * 0.35); x.strokeStyle = 'rgba(200,236,255,0.55)'; x.strokeRect(lw * 1.6, lw * 1.6, w - lw * 3.2, CH - lw * 3.2);
            // the words, as big as fit, in the middle
            const W0 = c.wide ? 768 : 384, H0 = linesHeight(c.lines), s = Math.min((w - lw * 3) / W0, (CH - lw * 2) / H0);
            x.translate((w - W0 * s) / 2, (CH - H0 * s) / 2); x.scale(s, s);
            drawLines(x, c.lines, W0);
            x.restore();
        });
        const tex = texFrom(cv), pos = [], uv = [], idx = [];
        for (const [c, qx, qy, qz, w, h, back] of this.q) {
            const [px, py, cw] = at[c], u0 = px / AW, u1 = (px + cw) / AW, v1 = 1 - py / AH, v0 = 1 - (py + CH) / AH, b = pos.length / 3, sx = back ? -1 : 1;
            pos.push(qx - sx * w / 2, qy - h / 2, qz, qx + sx * w / 2, qy - h / 2, qz, qx + sx * w / 2, qy + h / 2, qz, qx - sx * w / 2, qy + h / 2, qz);
            uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
            idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
        g.computeBoundingSphere();
        const mesh = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
        mesh.frustumCulled = false;
        parent.add(mesh);
        this.mesh = mesh; this.tex = tex;
        return mesh;
    }
    dispose() { if (!this.mesh) return; this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose(); }
}

// A stage's security door across the Sprintway at z: a massive steel-framed pillar either side on its plinth (bands of the sector's
// colour, a keypad screen and a green status light on the faces the runners see, a warning beacon on top), the blast door slid back
// into each pillar (its hazard-striped edge showing), angled braces in the opening's top corners, the header beam across the top with
// a lit screen with the stage's number on both faces (label: a Plaques cell), hazard stripes along its foot, a cable of warning lights
// in front; hazard stripes across the floor under it. GATE: the header's underside, its depth, the pillars' tops (ARCH: kept for old
// callers)
export const GATE = { under: 19.4, beam: 4.6, top: 27.5 };
export const ARCH = { spring: 11, crown: GATE.under, ring: 2.6, top: GATE.top };
function stageGate(S0_, P0_, z, ctx, label, y0, hwG) {
    y0 = y0 || 0;
    const { Wd, st, low } = ctx, hw = hwG || W.halfW, U = GATE.under, TOP = GATE.top, DD = 4.4, S = lifted(S0_, y0), P = lifted(P0_, y0), Q = lifted(ctx.dk || P0_, y0), D = ctx.D;
    const fl = { push: (f) => ctx.fl.push([f[0], f[1] + y0, f[2], f[3], f[4]]) }, PL = { quad: (c, x, y, zz, w, h, back) => ctx.PL.quad(c, x, y + y0, zz, w, h, back) };
    const frameC = Wd.wall2, plate = mixC(st.steel, Wd.wall2, 0.25);
    for (const sx of [-1, 1]) {
        const tx = sx * (hw + 3.2);
        S.box(tx, -CASE / 2 + 0.6, z, 7.4, CASE + 1.2, 6.6, frameC, { tile: 8 });
        P.box(tx, 1.1, z, 7.2, 2.2, 6.4, st.dark);
        P.box(tx, 2.35, z, 6.6, 0.3, 5.8, st.cap);
        S.box(tx, 2.2 + (TOP - 2.2) / 2, z, 5.6, TOP - 2.2, 5.0, frameC, { tile: 8 });
        // bands of the sector's colour round the pillar
        P.box(tx, 7.6, z, 5.76, 1.3, 5.16, Wd.banner);
        P.box(tx, 16.2, z, 5.76, 0.5, 5.16, st.cap);
        // on the faces the runners see: a steel plate, a keypad screen, a green status light (open)
        for (const sz of [1, -1]) {
            P.box(tx, 13, z + sz * 2.52, 3.6, 6.4, 0.1, plate);
            P.box(tx, 13.6, z + sz * 2.6, 2.2, 1.6, 0.1, st.panel, { glow: 1 });
            P.box(tx, 11.4, z + sz * 2.6, 0.8, 0.8, 0.1, 0x46ff6a, { glow: 1 });
        }
        // the blast door slid back into the pillar: its edge, hazard-striped, standing just proud of the pillar's inner face
        P.box(sx * (hw + 0.55), U / 2 + 0.1, z, 0.6, U - 0.2, 1.6, st.steel);
        if (D) {
            const xe = sx * (hw + 0.22);
            if (sx < 0) stripeUp(D, [xe, y0 + 0.3, z + 0.7], [xe, y0 + 0.3, z - 0.7], [xe, y0 + U - 0.4, z - 0.7], [xe, y0 + U - 0.4, z + 0.7], st.stripeA, st.stripeB);
            else stripeUp(D, [xe, y0 + 0.3, z - 0.7], [xe, y0 + 0.3, z + 0.7], [xe, y0 + U - 0.4, z + 0.7], [xe, y0 + U - 0.4, z - 0.7], st.stripeA, st.stripeB);
        }
        // a brace across the opening's top corner
        P.box(sx * (hw - 0.9), U - 1.5, z, 4.6, 1.3, DD - 0.4, st.metal, { rz: sx * Math.PI / 4 });
        P.box(tx, TOP + 0.35, z, 6.6, 0.7, 6.0, st.cap);
        // the beacon on top
        P.box(tx, TOP + 1.2, z, 2.3, 1.0, 2.3, st.dark, { soft: !low });
        fl.push([tx, TOP + 1.6, z, 2.0, st.flame]);
        if (!low) for (const dz of [-2.2, 2.2]) Q.box(tx, TOP + 1.0, z + dz, 4.6, 0.5, 0.5, st.metal);
    }
    // the header across the top, a coping, hazard stripes along its foot on both faces
    S.box(0, U + GATE.beam / 2, z, (hw + 3.2) * 2, GATE.beam, DD, frameC, { tile: 8 });
    P.box(0, U + GATE.beam + 0.25, z, (hw + 3.2) * 2 + 1.2, 0.5, DD + 0.8, st.cap, { soft: !low });
    if (D) for (const sz of [1, -1]) stripeZ(D, -(hw + 0.4), hw + 0.4, y0 + U + 0.05, y0 + U + 1.0, z + sz * (DD / 2 + 0.04), sz, st.stripeA, st.stripeB);
    else P.box(0, U + 0.4, z, (hw + 3.2) * 2 - 6, 0.5, DD + 0.1, Wd.banner);
    // the screen on both faces, a dark steel frame round it
    const ph = 3.5, pw = ph * 4, py = U + GATE.beam / 2;
    for (const sz of [1, -1]) { P.box(0, py, z + sz * 2.25, pw + 0.8, ph + 0.6, 0.3, st.dark); PL.quad(label, 0, py, z + sz * 2.42, pw, ph, sz < 0); }
    // a cable of warning lights from pillar top to pillar top in front of it
    bunting(Q, -(hw + 3.2), hw + 3.2, TOP - 0.2, z + 3.4, 2.4, st.bulbs, low ? 3.2 : 2.2);
    // the stripes across the floor
    if (D) stripeFlat(D, 0, y0 + 0.06, z, hw, 0.65, st.stripeA, st.stripeB);
    else P.box(0, 0.04, z, hw * 2, 0.08, 1.2, Wd.trim, { shade: 0.9 });
}
// a golden trophy over a steel plinth (beside the door that pays a stage's Wins): a cup on a stem, two handles, a gem on its front,
// a star over it
function trophy(S0_, P0_, x, z, ctx, y0) {
    const S = lifted(S0_, y0 || 0), P = lifted(P0_, y0 || 0);
    const { Wd, st, low } = ctx, G = 0xffc21e, G2 = 0xffe27a, y = 3.0, k = 1.45, cy = (v) => y + 0.24 + (v - 0.24) * k;
    pylon(P, x, z, y, 1.5, st.metal, st.stripeB);
    P.box(x, y + 0.12, z, 3.3, 0.24, 3.3, st.cap, { soft: !low });
    P.box(x, cy(0.45), z, 1.8 * k, 0.42 * k, 1.8 * k, st.dark, { soft: !low });
    P.box(x, cy(0.82), z, 1.2 * k, 0.32 * k, 1.2 * k, G);
    P.box(x, cy(1.3), z, 0.46 * k, 0.9 * k, 0.46 * k, G2);
    stack(P, x, z, [[0.42 * k, cy(1.72), G], [1.0 * k, cy(2.2), G], [1.28 * k, cy(3.2), G2], [1.42 * k, cy(3.5), 0xfff2a0]], low ? 6 : 8, () => 0.5, 1, 0);
    for (const sx of [-1, 1]) {
        P.box(x + sx * 1.62 * k, cy(2.7), z, 0.3 * k, 1.2 * k, 0.32 * k, G);
        for (const hy of [2.2, 3.2]) P.box(x + sx * 1.38 * k, cy(hy), z, 0.6 * k, 0.26 * k, 0.32 * k, G);
    }
    P.box(x, cy(2.55), z + 1.15 * k, 0.62 * k, 0.62 * k, 0.16, Wd.banner, { glow: 1, rz: Math.PI / 4 });
    P.box(x, cy(3.62), z, 0.9 * k, 0.12, 0.9 * k, 0xfff6c0, { glow: 1 });
    P.box(x, cy(4.5), z, 0.85 * k, 0.85 * k, 0.24, G2, { glow: 2, rz: Math.PI / 4 }); P.box(x, cy(4.5), z, 0.24, 0.85 * k, 0.85 * k, G2, { glow: 2, rx: Math.PI / 4 });
}
// a "Recommended Level" monitor on a steel stand at the side of the way, facing the runners coming (label: a Plaques cell)
function recBoard(P0_, x, z, ctx, label, y0) {
    const { st, Wd } = ctx, P = lifted(P0_, y0 || 0), PL = { quad: (c, xx, y, zz, w, h, back) => ctx.PL.quad(c, xx, y + (y0 || 0), zz, w, h, back) };
    P.box(x, 0.3, z, 5.6, 0.6, 1.4, st.dark, { soft: true });
    for (const dx of [-2.15, 2.15]) P.box(x + dx, 3.9, z, 0.4, 7.6, 0.4, st.steel);
    P.box(x, 6.1, z, 5.3, 3.0, 0.4, st.dark, { soft: true });
    P.box(x, 7.7, z, 5.7, 0.26, 0.56, st.metal); P.box(x, 4.5, z, 5.7, 0.26, 0.56, st.metal);
    P.box(x, 7.98, z, 0.9, 0.34, 0.5, Wd.banner, { glow: 1 });
    PL.quad(label, x, 6.1, z + 0.22, 4.6, 2.3, false);
}
// the FREE GIFT supply crate by the spawn (front facing ry): its lid thrown back, light pouring out of it, wrapped in hazard tape, a
// ribbon in the sector's colour round it
function giftCrate(P, D, x, z, ry, low, Wd, st) {
    const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry), at = (f, r, y) => [x + fx * f + rx * r, y, z + fz * f + rz * r];
    const k = 1.3, W2 = 3.2 * k, D2 = 2.2 * k, H2 = 1.8 * k, body = st.wood, band = st.stripeB, rib = Wd.banner, bx = (p, sx, sy, sz, c, o) => P.box(p[0], p[1], p[2], sx, sy, sz, c, { ry, ...(o || {}) });
    bx(at(0, 0, H2 / 2), W2, H2, D2, body, { soft: !low });
    for (const r of [-1.0, 1.0]) bx(at(0, r * k, H2 / 2), 0.34 * k, H2 + 0.06, D2 + 0.06, band);
    bx(at(0, 0, 0.12 * k), W2 + 0.06, 0.24 * k, D2 + 0.06, band);
    bx(at(0, 0, H2 - 0.02), W2 - 0.36, 0.34 * k, D2 - 0.36, 0xfff2a0, { glow: 1 });
    bx(at(D2 / 2 + 0.03, 0, H2 / 2), 0.5 * k, H2 + 0.04, 0.08, rib);
    bx(at(D2 / 2 + 0.08, 0, H2 - 0.45 * k), 0.62 * k, 0.62 * k, 0.1, st.flame, { glow: 1, rz: Math.PI / 4 });
    // the lid, open on its hinge along the back: tipped back past upright
    const ph = 1.9, lt = 0.5 * k, hf = -D2 / 2, lf = (D2 / 2) * Math.cos(ph) - (lt / 2) * Math.sin(ph), ly = (D2 / 2) * Math.sin(ph) + (lt / 2) * Math.cos(ph), lid = { rx: -ph, ry, order: 'YXZ' };
    P.box(...at(hf + lf, 0, H2 + ly), W2 + 0.04, lt, D2, body, { ...lid, soft: !low });
    for (const r of [-1.0, 1.0]) P.box(...at(hf + lf, r * k, H2 + ly), 0.34 * k, lt + 0.06, D2 + 0.04, band, lid);
    P.box(...at(hf + lf, 0, H2 + ly), 0.5 * k, lt + 0.08, D2 + 0.06, rib, lid);
    // a bow on the front of the ribbon
    for (const s of [-1, 1]) bx(at(D2 / 2 + 0.12, s * 0.42 * k, H2 + 0.05), 0.7 * k, 0.42 * k, 0.14, rib, { rz: s * 0.5 });
    void D;
}
// the lab's mascot, a giant smiling flask on a pedestal over the wall at (x, z), facing Home Row (+z): a round-bottom flask half full
// of glowing goo (the sector's), a long neck with a lip and a cork, two big eyes and a wide smile, rosy cheeks, stubby arms (one waving
// towards the Sprintway: side sx), bubbles floating up out of it (glow 2). s: its size
function flaskMascot(P, Dk, x, z, s, sx, st, Wd, low) {
    const one = () => 0.5, sd = low ? 10 : 14, B = 6.2 * s, y0 = 6.4, cy = y0 + 2.6 * s + B, goo = Wd.hazard2, glass = mixC(st.glass, 0xffffff, 0.55);
    // the pedestal
    P.box(x, y0 + 1.3 * s, z, 7 * s, 2.6 * s, 7 * s, Wd.wall2, { soft: !low });
    P.box(x, y0 + 2.7 * s, z, 7.6 * s, 0.3 * s, 7.6 * s, st.cap);
    // the belly: goo below its middle (glowing), glass above
    const ring = (t) => [B * Math.sin(t), cy - B * Math.cos(t)];
    const gooR = [], glsR = [];
    for (let i = 0; i <= 6; i++) { const [r, y] = ring(0.12 + i / 6 * (Math.PI * 0.55 - 0.12)); gooR.push([r, y, i < 2 ? shade(goo, 0.82) : goo]); }
    for (let i = 0; i <= 5; i++) { const [r, y] = ring(Math.PI * 0.55 + i / 5 * (Math.PI * 0.86 - Math.PI * 0.55)); glsR.push([r, y, glass]); }
    stack(P, x, z, [[B * 0.35, cy - B * 1.0 + 0.05, shade(goo, 0.7)], ...gooR], sd, one, 1, 1);
    // (the goo's surface: a flat disc where the glass begins)
    P.box(x, gooR[gooR.length - 1][1] - 0.05, z, gooR[gooR.length - 1][0] * 1.7, 0.1, gooR[gooR.length - 1][0] * 1.7, mixC(goo, 0xffffff, 0.3), { glow: 1 });
    stack(P, x, z, [...glsR, [B * 0.36, cy + B * 0.95, glass]], sd, one, 1, 0);
    // the neck, the lip, a cork
    const ny = cy + B * 0.95, nr = B * 0.34;
    stack(P, x, z, [[nr, ny, glass], [nr, ny + 4.6 * s, glass], [nr * 1.25, ny + 4.7 * s, st.cap], [nr * 1.25, ny + 5.3 * s, st.cap]], sd, one);
    stack(P, x, z, [[nr * 0.9, ny + 5.3 * s, 0xb8865a], [nr * 0.95, ny + 6.6 * s, 0xc8966a]], 8, one);
    // the face (on the glass, over the goo line): eyes, pupils with a highlight, a smile, cheeks
    const fz = z + B * 0.93, ey = cy + B * 0.32;
    for (const ex of [-1, 1]) {
        P.box(x + ex * B * 0.3, ey, fz - 0.3, B * 0.26, B * 0.32, 0.6, 0xffffff, { soft: !low });
        P.box(x + ex * B * 0.28, ey - B * 0.03, fz + 0.04, B * 0.13, B * 0.17, 0.2, 0x141826);
        P.box(x + ex * B * 0.25, ey + B * 0.04, fz + 0.16, B * 0.05, B * 0.05, 0.1, 0xffffff, { glow: 1 });
        P.box(x + ex * B * 0.52, ey - B * 0.22, fz - 0.9, B * 0.16, B * 0.09, 0.3, 0xff7aa8);
    }
    for (let i = 0; i < 7; i++) { const u = (i / 6 - 0.5) * 2, mxp = x + u * B * 0.3, my = ey - B * 0.3 - (1 - u * u) * B * 0.12; P.box(mxp, my, fz - 0.15 - Math.abs(u) * 0.3, B * 0.1, B * 0.06, 0.3, 0x141826, { rz: -u * 0.5 }); }
    // stubby arms: one resting, one raised and waving towards the Sprintway
    P.box(x - sx * B * 1.05, cy - B * 0.1, z, B * 0.55, B * 0.22, B * 0.22, glass, { rz: sx * 0.5, soft: !low });
    P.box(x + sx * B * 1.0, cy + B * 0.45, z, B * 0.6, B * 0.22, B * 0.22, glass, { rz: sx * 0.9, soft: !low, glow: 3.2 });
    P.box(x + sx * B * 1.22, cy + B * 0.78, z, B * 0.3, B * 0.3, B * 0.3, glass, { soft: !low, glow: 3.2 });
    // bubbles floating up out of its neck
    if (!low) for (let i = 0; i < 4; i++) Dk.box(x + (i % 2 ? 0.6 : -0.5) * s, ny + (7.4 + i * 1.6) * s, z, (0.7 - i * 0.1) * s, (0.7 - i * 0.1) * s, (0.7 - i * 0.1) * s, mixC(goo, 0xffffff, 0.4), { glow: 2, soft: true });
}
// Home Row's keycap carpets (x0, x1, z0, z1): your first steps clack
export const JELLY_BEDS = [[W.plaza.x0, W.plaza.x1, W.plaza.z0, W.plaza.z1]];
export const onJellyBed = (x, z) => JELLY_BEDS.some((b) => x > b[0] - 1 && x < b[1] + 1 && z > b[2] - 1 && z < b[3] + 1);
// the keys of a stage (or a bed): keyboard rows across in the sector's colourway, unless something in the way or a pad wants the
// room. clear(x, z) says where not
function jellyRows(out, Wd, R, low, x0, x1, z0, z1, clear, o) { keyRows(out, Wd.keys, R, low, x0, x1, z0, z1, clear, o); }

export function buildHub(wi, opts) {
    const Tw = hubFor(wi), Wd = lookOf(wi), st = styleOf(Wd), R = rng(wi * 97 + 11), low = !!opts.low, id = Wd.id, one = () => 0.5;
    setKeyLegend(Wd.legend, Wd.legendGlow, Wd.rgb, Wd.glow);
    const group = new T.Group(), signs = low ? new Signs(6, 352, 120) : new Signs(6, 448, 152), fl = [], lights = [], ctx = { Wd, st, R, low, fl, lights };
    const D = decalQuads(), E = energyQuads(), domes = [], hubKeys = [];
    ctx.D = D;
    // a kit per stretch: Home Row, then each stage of the Sprintway
    const S0 = new Kit(), P0 = new Kit({ glow: true }), stretchS = [S0], stretchP = [P0];
    // the detail kits (small things), drawn only close up: Home Row's, then one per stage
    const D0 = new Kit({ glow: true }), detail = [D0], NEAR_D = low ? 120 : 175;
    D0.far = low ? 150 : 230;
    // ----- Home Row: a big open deck floored with giant keys almost everywhere (the world's colourway), its deck showing only round the
    // spawn pad and under what stands on it -----
    const P = W.plaza, tile = 12, GIFT = GIFT_AT;
    for (let x = P.x0; x < P.x1; x += tile) for (let z = P.z0; z < P.z1; z += tile) {
        const x1 = Math.min(P.x1, x + tile), z1 = Math.min(P.z1, z + tile);
        floorQuad(S0, x, x1, z, z1, 0, (Math.floor(x / tile) + Math.floor(z / tile)) & 1 ? Wd.floor : Wd.floor2);
    }
    // where no key goes: the pad, the gift, the Power Keys, the booths, the Eggs, the portals' pillars, the boards, the Big Mouse's
    // mousepad, the light posts and what stands round the edge (circles [x, z, r] and boxes [x0, x1, z0, z1])
    const LAMPS = [[-10, 58], [10, 58], [-10, 74], [10, 74], [P.x0 + 3, P.z1 - 3], [P.x1 - 3, P.z1 - 3], [P.x0 + 3, 80], [P.x1 - 3, 80]];
    const SPOTS = [[-104, 124, 'pencils'], [-108, 146, 'monitor'], [-52, 147, 'keycaps'], [-15, 140, 'crates'], [26, 146, 'plants'], [86, 146, 'monitor'], [108, 134, 'pencils'], [108, 76, 'vending'], [-106, 88, 'plants'], [100, 92, 'keycaps'], [26, 60, 'cones']];
    const noC = [[W.spawn.x, W.spawn.z, 11.5], [GIFT.x, GIFT.z, 5.2], ...LAMPS.map(([x, z]) => [x, z, 1.8]), ...SPOTS.map(([x, z]) => [x, z, 6.5])];
    for (let i = 0; i < JAWBREAKERS.length; i++) { const s = jbSpot(i); noC.push([s.x, s.z, 4.8]); }
    for (const p of [worldsPortal, playGate]) for (const sx of [-1, 1]) noC.push([p.x + sx * 8, p.z, 2.8]);
    const noB = [[SCORP.x - SCORP.w / 2 - 1, SCORP.x + SCORP.w / 2 + 1, SCORP.z - SCORP.d / 2 - 1, SCORP.z + SCORP.d / 2 + 1]];
    for (let i = 0; i < POSTS.length; i++) { const s = postSpot(i); noB.push([s.x - BELT.w / 2 - 1.6, s.x + BELT.w / 2 + 1.6, s.z - BELT.l / 2 - 2.4, s.z + BELT.l / 2 + 0.9]); }
    for (const q of [tongueBar, upgradeShed]) noB.push([q.x - 13.6, q.x + 13.6, q.z - 10.2, q.z + 7.4]);
    for (const b of boards) noB.push(b.x ? [b.x - 1.6, b.x + 1.6, b.z - 14, b.z + 14] : [b.x - 14, b.x + 14, b.z - 1.6, b.z + 1.6]);
    const keyless = (x, z, m) => noC.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r + m) ** 2) || noB.some(([a, b, c, d]) => x > a - m && x < b + m && z > c - m && z < d + m);
    keyRows(hubKeys, Wd.keys, R, low, P.x0 + 1.2, P.x1 - 1.2, P.z0 + 0.6, P.z1 - 1.2, (x, z) => keyless(x, z, 2.2), { pitch: low ? 6.6 : 5.4, h: 0.45 });
    // the spawn: a round pad, a ring of two-tone stripes round its edge, a glowing compass rose on it
    {
        const n = low ? 12 : 20, R0 = 10.4, y1 = 0.12, cx = W.spawn.x, cz = W.spawn.z, pt = (i, r, y) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; };
        for (let i = 0; i < n; i++) {
            const am = (i + 0.5) / n * Math.PI * 2;
            P0.faceTo(pt(i, R0, -0.2), pt(i + 1, R0, -0.2), pt(i + 1, R0, y1), pt(i, R0, y1), [Math.cos(am), 0, Math.sin(am)], st.dark);
            P0.faceTo(pt(i, R0, y1), pt(i + 1, R0, y1), [cx, y1, cz], [cx, y1, cz], [0, 1, 0], st.metal);
            P0.faceTo(pt(i, R0 - 1.0, y1 + 0.02), pt(i + 1, R0 - 1.0, y1 + 0.02), pt(i + 1, R0 - 0.45, y1 + 0.02), pt(i, R0 - 0.45, y1 + 0.02), [0, 1, 0], i % 2 ? st.stripeA : st.stripeB);
        }
        decal(D, 3, cx, y1 + 0.05, cz, 8.9, 8.9, st.panel, 0, 1, 0);
    }
    // the FREE GIFT box by the spawn, turned to face the runners there, its light glowing (a halo over it)
    giftCrate(P0, D0, GIFT.x, GIFT.z, 0.95, low, Wd, st);
    halo(E, GIFT.x, 3.2, GIFT.z, 5, 0xffd23a, 0.6);
    signs.add([big('FREE GIFT', GOLD, 104, '#141a3a')], 7.5, new V3(GIFT.x, 7.6, GIFT.z), true, 90);
    // Home Row's edge: a low bezel, stripes along it, a rail on posts along its top (close up), its deck's edge down to the clouds
    const mx = (P.x0 + P.x1) / 2, mz = (P.z0 + P.z1) / 2, Wd2 = P.x1 - P.x0, D2 = P.z1 - P.z0;
    const edge = (x, z, sx, sz) => {
        S0.box(x, 1.0, z, sx, 2.6, sz, Wd.wall, { tile: 8 });
        const ax = sx > sz;
        P0.box(x, 1.65, z, ax ? sx : sx + 0.1, 0.4, ax ? sz + 0.1 : sz, Wd.trim);
        P0.box(x, 2.42, z, sx + 0.4, 0.24, sz + 0.4, st.cap);
        // hazard stripes along its inner face
        if (ax) stripeZ(D, x - sx / 2, x + sx / 2, 0.15, 1.1, z - sz / 2 - 0.05, -1, st.stripeA, st.stripeB);
        else if (x < 0) stripeUp(D, [x + sx / 2 + 0.05, 0.15, z + sz / 2], [x + sx / 2 + 0.05, 0.15, z - sz / 2], [x + sx / 2 + 0.05, 1.1, z - sz / 2], [x + sx / 2 + 0.05, 1.1, z + sz / 2], st.stripeA, st.stripeB);
        else stripeUp(D, [x - sx / 2 - 0.05, 0.15, z - sz / 2], [x - sx / 2 - 0.05, 0.15, z + sz / 2], [x - sx / 2 - 0.05, 1.1, z + sz / 2], [x - sx / 2 - 0.05, 1.1, z - sz / 2], st.stripeA, st.stripeB);
        const L = ax ? sx : sz, n = Math.floor(L / 6);
        D0.box(x, 3.9, z, ax ? sx : 0.24, 0.24, ax ? 0.24 : sz, st.steel);
        for (let i = 0; i <= n; i++) { const o = -L / 2 + i * (L / n); D0.box(ax ? x + o : x, 3.2, ax ? z : z + o, 0.24, 1.4, 0.24, st.steel); }
    };
    edge(mx, P.z1 + 1.2, Wd2 + 4.8, 2.4); edge(P.x0 - 1.2, mz, 2.4, D2); edge(P.x1 + 1.2, mz, 2.4, D2);
    // (the floor's foundation: its top a little under the tiles, never level with them: two faces at one height flicker)
    S0.box(0, -1.05, mz + 1.4, Wd2 + 4.8, 1.6, D2 + 4.4, Wd.wall2, { tile: 8 });
    for (const sx of [-1, 1]) S0.box(sx * 22.4, -1.05, 40, 10.2, 1.6, 9, Wd.wall2, { tile: 8 });
    for (const [x, z] of LAMPS) lampPost(P0, lights, x, z, 7, st, Wd);
    // round the outside of the bezel, standing in the clouds: giant pencils and floodlight masts
    for (const [x, z] of [[P.x0 - 10, 56], [P.x0 - 12, 90], [P.x0 - 10, 128], [P.x1 + 10, 60], [P.x1 + 12, 96], [P.x1 + 10, 132], [-80, P.z1 + 10], [-30, P.z1 + 12], [24, P.z1 + 10], [76, P.z1 + 11]].filter((_, i) => !low || i % 2 === 0)) {
        const g0 = groundAt(x, z), r = 3.4 + R() * 1.4, h = 10 + R() * 8;
        if (R() < 0.62) {
            pencil(P0, x, z, h + 4, r * 0.62, st, Wd, g0 - 0.5);
        } else {
            P0.box(x, g0 + h, z, 0.6, h * 2, 0.6, st.metal);
            P0.box(x, g0 + h * 2 + 0.6, z, 3.6, 1.4, 1.2, st.dark);
            P0.box(x, g0 + h * 2 + 0.6, z + 0.62, 3.2, 1.0, 0.1, st.lamp, { glow: 1 });
            lights.push([x, g0 + h * 2 + 0.6, z + 1, 4, st.lamp]);
        }
    }
    // the giant keyball on its stand by the Sprintway's gate (stagefx.js turns the ball on it): a round plinth stepping up, a collar of
    // the world's colour, little lights round it, a cup on top for the ball to sit in
    {
        const x = ballStand.x, z = ballStand.z, top = STAND_TOP;
        stack(S0, x, z, [[5.6, 0, st.dark], [5.4, 0.9, st.dark], [4.4, 1.3, st.metal], [3.4, 2.2, st.metal], [3.0, top - 1.4, st.metal], [4.2, top - 0.9, Wd.wall2], [4.6, top - 0.2, Wd.wall2], [3.8, top, st.cap]], low ? 10 : 16, one);
        stack(P0, x, z, [[4.48, 1.2, Wd.banner], [4.48, 1.45, Wd.banner]], low ? 10 : 16, one, 1, 1);
        for (let i = 0; i < (low ? 6 : 10); i++) { const a = i / (low ? 6 : 10) * Math.PI * 2; D0.box(x + Math.cos(a) * 5.2, 1.05, z + Math.sin(a) * 5.2, 0.5, 0.3, 0.5, st.bulbs[i % st.bulbs.length], { glow: 1 }); }
        signs.add([big('WATCH OUT!', RED, 96, '#2a0606'), { t: 'giant balls roll down the Sprintway: hide on the side keyboards!', c: '#ffffff', s: '#141a3a', px: 38 }], 17, new V3(x, top + RUN.r * 2 + 6, z + 2), false, 160);
    }

    // ----- the north side: the Sprintway's gate (two tall towers striped two-tone, a header beam with its name across them, a cable of
    // little lights), a bezel wall either side with towers at the corners and a giant keycap mascot on each wall waving the runners on;
    // beyond the wall a giant coffee mug (east) and a row of giant pencils (west), standing in the clouds -----
    const GX = 23, GH = 34;
    for (const sx of [-1, 1]) {
        const x0 = 28, x1 = P.x1 + 3, wz = 40, xm = sx * (x0 + x1) / 2, len = x1 - x0;
        // (low: the Sprintway climbing into the sky shows over it from all over Home Row)
        S0.box(xm, 3, wz, len, 6, 5, Wd.wall, { tile: 8 });
        S0.box(xm, 0.6, wz + 0.2, len, 1.6, 5.8, Wd.wall2, { tile: 8 });
        stripeZ(D, xm - len / 2, xm + len / 2, 1.5, 2.7, wz + 2.6, 1, st.stripeA, st.stripeB);
        P0.box(xm, 4.7, wz + 2.56, len, 0.3, 0.1, Wd.banner);
        P0.box(xm, 6.15, wz, len + 0.6, 0.4, 5.8, st.cap);
        for (let x = x0 + 3; x < x1 - 1; x += 9) D0.box(sx * x, 6.7, wz + 2.0, 0.8, 0.4, 0.8, st.lamp, { glow: 1 });
        // a control tower at the corner: a steel block, a glass control room on top, a roof, an antenna with a red light
        const tx = sx * (P.x1 + 1), tw = 9, th = 22;
        S0.box(tx, th / 2, wz, tw, th, tw, Wd.wall2, { tile: 8 });
        P0.box(tx, th * 0.4, wz, tw + 0.2, 1.2, tw + 0.2, Wd.banner);
        P0.box(tx, th + 2.3, wz, tw + 1.4, 4.2, tw + 1.4, shade(st.glass, 0.4), { glow: 0 });
        for (const ox of [-1, 1]) for (const oz of [-1, 1]) P0.box(tx + ox * (tw / 2 + 0.6), th + 2.3, wz + oz * (tw / 2 + 0.6), 0.5, 4.3, 0.5, st.dark);
        P0.box(tx, th + 4.7, wz, tw + 2.4, 0.7, tw + 2.4, st.cap, { soft: !low });
        P0.box(tx, th + 2.3, wz + (tw / 2 + 0.75), tw * 0.8, 1.2, 0.1, st.lamp, { glow: 1 });
        P0.box(tx, th + 8.4, wz, 0.4, 7, 0.4, st.metal);
        P0.box(tx, th + 12.1, wz, 1.0, 0.9, 1.0, 0xff3a2a, { glow: 1 });
        // a keycap mascot on each long wall: a giant smiling keycap, stubby arms waving
        keycapMascot(P0, D0, sx * 76, wz + 0.5, 1, sx, st, Wd, low);
        // the gate tower: a tall tower striped two-tone on its face, a light strip up it, a beacon on top
        const gx = sx * GX;
        S0.box(gx, GH / 2 - 0.7, wz, 8.4, GH + 1.4, 7.4, Wd.wall2, { tile: 8 });
        P0.box(gx, 1.0, wz, 9.2, 2.0, 8.2, st.dark);
        stripeZ(D, gx - 3.2, gx + 3.2, 2.4, 13, wz + 3.75, 1, st.stripeA, st.stripeB);
        P0.box(gx - sx * 3.6, 19, wz + 3.76, 0.5, 26, 0.1, Wd.glow, { glow: 1 });
        for (const y of [14.4, 26]) P0.box(gx, y, wz, 8.8, 1.0, 7.8, Wd.banner);
        P0.box(gx, 20, wz + 3.78, 4.6, 4.6, 0.12, st.dark);
        P0.box(gx, 20, wz + 3.84, 3.2, 3.2, 0.1, st.panel, { glow: 1 });
        P0.box(gx, GH + 0.5, wz, 9.4, 1.0, 8.4, st.cap, { soft: !low });
        P0.box(gx, GH + 1.6, wz, 2.6, 1.2, 2.6, st.dark, { soft: !low });
        fl.push([gx, GH + 2.1, wz, 2.6, st.flame]);
    }
    {
        const by = 29, bz = 40, w = GX * 2 + 4;
        S0.box(0, by, bz, w, 4.4, 5, Wd.wall2, { tile: 8 });
        P0.box(0, by + 2.5, bz, w + 1.2, 0.6, 5.8, st.cap, { soft: !low });
        stripeZ(D, -GX + 4.2, GX - 4.2, by - 2.15, by - 1.0, bz + 2.55, 1, st.stripeA, st.stripeB);
        bunting(D0, -GX + 4, GX - 4, by - 2.4, bz + 2.8, 3.2, st.bulbs, low ? 3.2 : 2.2);
        signs.add([big('THE SPRINTWAY', GOLD, 112, '#141a3a'), { t: 'dodge the giant balls: wait on the side, then RUN!', c: '#ffffff', s: '#141a3a', px: 40 }], 28, new V3(0, by + 7.4, bz + 3), false, 320);
    }
    // the giant's coffee mug (north-east, outside the wall), steam curling out of it
    mug(P0, D0, 64, 12, 1, st, Wd, low);
    // the west, outside the wall: a row of giant pencils standing in the clouds, a giant eraser lying by them
    for (let i = 0; i < (low ? 4 : 7); i++) { const x = -60 - i * 9, h = 9 + ((i * 37) % 7) * 1.6; pencil(P0, x, 14, h, 2.6, st, Wd, groundAt(x, 14) - 0.5); }
    P0.box(-60 - (low ? 3 : 6) * 4.5, groundAt(-80, 24) + 1.4, 24, 11, 2.8, 4.8, 0xff8aa8, { ry: 0.2, soft: !low });

    // ----- the Sprintway: a narrow path of keys climbing into the sky, crossed by wide keyboards (shared/world.js ZONES), everything
    // standing on the floor where it is (floorY: flat on a wide keyboard, the path rising between them); under it all the keyboard's
    // moulded case, floating over the clouds -----
    const pw = RUN.pw, pads = [], blades = [], gates = [], PL = new Plaques(low, '#' + new T.Color(Wd.glow).getHexString());
    ctx.PL = PL;
    const fy = (z) => floorY(wi, z), FB = floorBreaks(wi), cwS = [], cwP = [];
    ctx.fy = fy; ctx.FB = FB; ctx.w = wi;
    const plateC = shade(Wd.keys[1], 0.28), wallC = mixC(Wd.wall, Wd.wall2, 0.18), underC = shade(Wd.wall2, 0.72);
    // (the keys out on a wide keyboard's sides, clear of the balls: mostly the world's accent colour)
    const sideWd = { ...Wd, keys: [Wd.keys[2], Wd.keys[0], Wd.keys[2]] }, safeC = mixC(Wd.glow, 0x7dff6b, 0.35);
    // each stage its own colours: the keys (and the safe sides) tinted a different way stage by stage
    const TINTS = [0xffffff, 0xff9a6a, 0x7ad8ff, 0xb8ff7a, 0xffd23a, 0xff7ad8, 0x9a8aff, 0x6affc8];
    let SK = Wd, SS = sideWd;
    const tintFor = (k) => { const t = TINTS[k % TINTS.length], m = k ? 0.3 : 0; SK = { ...Wd, keys: Wd.keys.map((c) => mixC(c, t, m)) }; SS = { ...sideWd, keys: sideWd.keys.map((c) => mixC(c, TINTS[(k + 3) % TINTS.length], k ? 0.35 : 0)) }; };
    const lay = (k0, y, sloped) => { for (let i = k0; i < domes.length; i++) { const d = domes[i]; d.y = KEY_TOP + (y ?? fy(d.z)); if (sloped) { const sl = slopeAt(wi, d.z); if (sl) d.rx = Math.atan(sl); } } };
    // a bezel along x (a wide keyboard's north or south edge, outside it): a kerb, the raised bezel, its trim and soft cap. side: 1 the
    // keyboard is north of it (its south edge), -1 south of it
    const railX = (S, P, z, side, x0, x1, y) => {
        const L = x1 - x0, xc = (x0 + x1) / 2, zk = z + side * WT / 2, zw = z + side * (WT - 0.55);
        if (L < 0.2) return;
        S.box(xc, y + 0.3, zk, L, 0.6, WT + 0.3, shade(Wd.floor2, 0.92), { tile: 8 });
        S.box(xc, y + 1.7, zw, L, 2.2, 1.1, Wd.wall, { tile: 8 });
        P.box(xc, y + 1.33, zw - side * 0.05, L, 0.36, 1.2, Wd.trim);
        P.box(xc, y + 2.95, zw, L + 0.3, 0.3, 1.36, st.cap, { soft: !low });
    };
    // a run of the path from z0 north to z1 (z0 > z1 going north: z1 < z0): the plate, a deck strip down each edge, the keys (tilted up
    // the slope), the bezels (short of the wide keyboards' own at each end), the case under it
    const buildRun = (zN, zS, Sk, Pk, Ck, Cq) => {
        if (zS - zN < 0.5) return;
        rideQuad(Sk, FB, fy, -pw - 0.5, pw + 0.5, zN, zS, -1.15, plateC);
        for (const sx of [-1, 1]) ride(Sk, FB, fy, sx * (pw - 0.45), zN, zS, -1.17, 1.3, 1.17, Wd.floor, { tile: 8 });
        const k0 = domes.length;
        jellyRows(domes, SK, R, low, -pw + 1.0, pw - 1.0, zN, zS, null);
        lay(k0, null, true);
        for (const sx of [-1, 1]) { railRun(Sk, Pk, sx, pw, zN + WT, zS - WT, ctx, null); causeway(Ck, Cq, sx, pw + WT, zN, zS, ctx, null); }
    };
    // a wide keyboard (flat at its height): the plate and keys (the balls' line down the middle in the world's keys, the safe sides in
    // its accent, a glowing line between), bezels round it, the case under it; a checkpoint's arch, trophy and board
    const buildZone = (Z, Sk, Pk, Dk, Ck, Cq) => {
        const y = Z.y, hw = Z.hw, S = lifted(Sk, y), Pq = lifted(Pk, y), zc = Z.z, sx0 = RUN.safeX, lim = hw - 1.5;
        const gz = Z.idx === 0 ? Z.z0 + 3.2 : zc, trophyZ = zc + 5.5, troX = -(sx0 + 9), boardX = sx0 + 11;
        const clear = (x, z) => (Z.cp && Math.abs(z - gz) < 2.6) || (Z.cp && Z.k >= 1 && Math.abs(x - troX) < 3.2 && Math.abs(z - trophyZ) < 3.2)
            || (Z.cp && Math.abs(x - boardX) < 3.6 && Math.abs(z - (zc + 6)) < 1.8) || (Z.idx === 0 && Math.hypot(x - BIN.x, z - BIN.z) < BIN.r + 1.8)
            || (Z.k === WALLS_N && Math.abs(x - endPortal.x) < 9 && Math.abs(z - endPortal.z) < 2.4);
        floorQuad(S, -lim - 0.5, lim + 0.5, Z.z0, Z.z1, -1.15, plateC);
        // the deck: round its edges, along the safe lines
        S.box(0, -0.585, Z.z0 + 0.35, lim * 2 + 1, 1.17, 0.7, Wd.floor, { tile: 8 });
        S.box(0, -0.585, Z.z1 - 0.35, lim * 2 + 1, 1.17, 0.7, Wd.floor, { tile: 8 });
        for (const sx of [-1, 1]) {
            S.box(sx * (lim + 0.15), -0.585, zc, 0.7, 1.17, Z.z1 - Z.z0, Wd.floor, { tile: 8 });
            S.box(sx * sx0, -0.585, zc, 1.4, 1.17, Z.z1 - Z.z0 - 1.4, Wd.floor, { tile: 8 });
            Pq.box(sx * sx0, 0.04, zc, 0.55, 0.08, Z.z1 - Z.z0 - 2, safeC, { glow: 1 });
        }
        const k0 = domes.length;
        jellyRows(domes, SK, R, low, -sx0 + 0.75, sx0 - 0.75, Z.z0 + 0.7, Z.z1 - 0.7, clear);
        jellyRows(domes, SS, R, low, -lim + 0.6, -sx0 - 0.75, Z.z0 + 0.7, Z.z1 - 0.7, clear);
        jellyRows(domes, SS, R, low, sx0 + 0.75, lim - 0.6, Z.z0 + 0.7, Z.z1 - 0.7, clear);
        lay(k0, y, false);
        // the bezels: along its ends, and along its north and south edges either side of the path (outside it)
        for (const sx of [-1, 1]) railRun(Sk, Pk, sx, lim + 0.6, Z.z0 - WT, Z.z1 + WT, ctx, null);
        for (const sx of [-1, 1]) {
            const xa = sx < 0 ? -(lim + 0.6) : pw, xb = sx < 0 ? -pw : lim + 0.6;
            if (Z.idx > 0) railX(Sk, Pk, Z.z1, 1, xa, xb, y);
            railX(Sk, Pk, Z.z0, -1, xa, xb, y);
        }
        // the case under it (a block of moulded plastic), its trim
        Ck.box(0, y - SLAB / 2, zc, (lim + 0.6 + WT) * 2, SLAB, Z.z1 - Z.z0 + WT * 2, wallC, { tile: 8 });
        lifted(Cq, y).box(0, -1.9, zc, (lim + 0.6 + WT) * 2 + 0.3, 0.6, Z.z1 - Z.z0 + WT * 2 + 0.3, Wd.trim);
        lifted(Cq, y).box(0, -SLAB - 0.35, zc, (lim + WT) * 1.4, 0.7, (Z.z1 - Z.z0) * 0.7, underC);
        if (!Z.cp) return;
        // a checkpoint: the arch across it with its stage's number (the first: over its north end, the drain under its south half),
        // the stage's name over it; the finish's own words
        const k = Z.k;
        if (k < WALLS_N) {
            stageGate(Sk, Pk, gz, ctx, PL.cell('s' + (k + 1), [big('STAGE ' + (k + 1), GOLD, 120, '#0a1026')], true, 0), y, SW.GATE_X - 3.2);
            const nameSign = signs.add([{ t: 'BALL RUN', c: '#ffe24a', s: '#141a3a', px: 38 }, big(stageName(wi, k), WHITE, 84, '#141a3a')], 15, new V3(0, y + GATE.under + GATE.beam + 4.8, gz + 3.5), false, 150);
            gates.push({ k, z: gz, nameSign });
            // its Recommended Speed (on the east side, facing the runners coming up)
            const rs = recSpeed(wi, k);
            if (rs > 0) recBoard(Pk, boardX, zc + 6, ctx, PL.cell('r' + rs, [{ t: 'RECOMMENDED SPEED', c: '#9af0ff', s: '#0a1026', px: 40 }, big(fmt(rs), WHITE, 96, '#0a1026', 'bolt')], false, 1), y);
        } else stageGate(Sk, Pk, gz, ctx, PL.cell('fin', [big('FINISH!', LIME, 120, '#062a06')], true, 0), y, SW.GATE_X - 3.2);
        // reaching it pays the stage before's Wins: a golden trophy on the west side, the Wins over it, a gold plate under it (grey while
        // it cools down)
        if (k >= 1) {
            trophy(Sk, Pk, troX, trophyZ, ctx, y);
            const padSign = signs.add([big('+' + fmt(padWins(wi, k - 1)) + ' WINS', GOLD, 96, '#141a3a', 'crown')], 8.5, new V3(troX, y + 13, trophyZ), true, 110);
            pads.push({ k: k - 1, sign: padSign, x: troX, z: trophyZ, di: decal(D, 2, troX, y + 0.12, trophyZ, 2.5, 2.5, 0, 0, 1, 0) });
        }
    };
    // the stages, a set of kits each: its zones (the last stage: the finish too) and the runs north of them
    for (let k = 0; k < WALLS_N; k++) {
        const Sk = new Kit(), Pk = new Kit({ glow: true }), Dk = new Kit({ glow: true }), Ck = new Kit(), Cq = new Kit({ glow: true });
        stretchS.push(Sk); stretchP.push(Pk); cwS.push(Ck); cwP.push(Cq);
        Dk.far = NEAR_D; detail.push(Dk); ctx.dk = Dk;
        tintFor(k);
        const zl = ZONES.filter((o) => o.k === k || (k === WALLS_N - 1 && o.k === WALLS_N));
        for (const Z of zl) buildZone(Z, Sk, Pk, Dk, Ck, Cq);
        for (const Z of zl) { const N = ZONES[Z.idx + 1]; if (N) buildRun(N.z1, Z.z0, Sk, Pk, Ck, Cq); }
        // the last stage: the path on past the finish to the chute
        if (k === WALLS_N - 1) buildRun(CHUTE.z - 2, northEnd, Sk, Pk, Ck, Cq);
        ctx.dk = null;
    }
    // ----- between Home Row and the first checkpoint: the gate's floor, keys over it; the drain the balls drop into (a round hole with a
    // dark well, a raised rim striped two-tone, little red lights round it) -----
    {
        const z0 = ZONES[0].z1, z1 = W.plaza.z0 + 0.5;
        floorQuad(S0, -27, 27, z0, z1, -1.15, plateC);
        const k0 = domes.length;
        jellyRows(domes, Wd, R, low, -18, 18, z0 + 0.4, z1 - 0.6, (x, z) => Math.hypot(x - BIN.x, z - BIN.z) < BIN.r + 1.8);
        lay(k0, 0, false);
        for (const sx of [-1, 1]) S0.box(sx * 22.5, -0.585, (z0 + z1) / 2, 9, 1.17, z1 - z0, Wd.floor, { tile: 8 });
        S0.box(0, -SLAB / 2, (z0 + z1) / 2, 54, SLAB, z1 - z0, wallC, { tile: 8 });
        const n = low ? 14 : 24, rr = BIN.r, cx = BIN.x, cz = BIN.z, pt = (i, r, y) => { const a = i / n * Math.PI * 2; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; };
        for (let i = 0; i < n; i++) {
            const am = (i + 0.5) / n * Math.PI * 2;
            // the well's wall going down, its dark floor, the rim's outside, its top (striped)
            P0.faceTo(pt(i + 1, rr - 0.9, -7), pt(i, rr - 0.9, -7), pt(i, rr - 0.9, BIN.h), pt(i + 1, rr - 0.9, BIN.h), [-Math.cos(am), 0, -Math.sin(am)], 0x101018);
            P0.faceTo(pt(i, rr - 0.9, -6.9), pt(i + 1, rr - 0.9, -6.9), [cx, -6.9, cz], [cx, -6.9, cz], [0, 1, 0], 0x08080c);
            P0.faceTo(pt(i, rr + 0.4, 0), pt(i + 1, rr + 0.4, 0), pt(i + 1, rr + 0.4, BIN.h), pt(i, rr + 0.4, BIN.h), [Math.cos(am), 0, Math.sin(am)], st.dark);
            P0.faceTo(pt(i, rr + 0.4, BIN.h), pt(i + 1, rr + 0.4, BIN.h), pt(i + 1, rr - 0.9, BIN.h), pt(i, rr - 0.9, BIN.h), [0, 1, 0], i % 2 ? st.stripeA : st.stripeB);
            if (i % 3 === 0) D0.box(...pt(i + 0.5, rr + 0.55, BIN.h * 0.55), 0.4, 0.4, 0.4, 0xff3a2a, { glow: 1 });
        }
        signs.add([big('BALL DRAIN', RED, 88, '#2a0606'), { t: 'the balls end up here: go round it!', c: '#ffffff', s: '#141a3a', px: 36 }], 11, new V3(cx, 10, cz + 4), true, 120);
    }
    // ----- the chute at the top the balls roll out of: a great tower over the path, its round mouth (a dark tunnel) facing down the
    // path, a ring of lights round it, stripes and a beacon on top -----
    {
        const P9 = stretchP[stretchP.length - 1], S9 = stretchS[stretchS.length - 1], z = CHUTE.z, top = fy(z), S = lifted(S9, top), Pq = lifted(P9, top);
        const TW = 30, TH = 30, TD = 14, zf = z + 1.2, rr = RUN.r + 1.4, cy = RUN.r, n = low ? 16 : 28;
        S.box(0, TH / 2, z - TD / 2 + 1.2, TW, TH, TD, Wd.wall2, { tile: 8 });
        Pq.box(0, TH + 0.4, z - TD / 2 + 1.2, TW + 1.2, 0.8, TD + 1.2, st.cap, { soft: !low });
        for (const sx of [-1, 1]) { Pq.box(sx * (TW / 2 - 1.5), TH / 2, zf + 0.05, 2.4, TH - 2, 0.3, Wd.banner); fl.push([sx * (TW / 2 - 2), top + TH + 1.4, z - 4, 2.4, st.flame]); }
        const pt = (i, r, zz) => { const a = i / n * Math.PI * 2; return [Math.cos(a) * r, cy + Math.sin(a) * r, zz]; };
        for (let i = 0; i < n; i++) {
            P9.faceTo(...[pt(i, rr, zf + 0.06), pt(i + 1, rr, zf + 0.06), [0, cy, zf + 0.06], [0, cy, zf + 0.06]].map((q) => [q[0], q[1] + top, q[2]]), [0, 0, 1], 0x0a0a10);
            P9.faceTo(...[pt(i, rr + 1.4, zf + 0.1), pt(i + 1, rr + 1.4, zf + 0.1), pt(i + 1, rr, zf + 0.1), pt(i, rr, zf + 0.1)].map((q) => [q[0], q[1] + top, q[2]]), [0, 0, 1], i % 2 ? st.stripeA : st.stripeB);
            if (i % 2 === 0) { const q = pt(i + 0.5, rr + 2.2, zf + 0.2); lifted(P9, top).box(q[0], q[1], q[2], 0.7, 0.7, 0.3, st.bulbs[(i / 2) % st.bulbs.length], { glow: 1 }); }
        }
        signs.add([big('BALL CHUTE', GOLD, 96, '#141a3a')], 18, new V3(0, top + TH + 6, zf + 1), false, 160);
    }
    // ----- the portal to the next world, on the finish keyboard east of the path: two pillars, a lintel, the swirl, its words -----
    {
        const P9 = stretchP[stretchP.length - 1], S9 = stretchS[stretchS.length - 1], z = endPortal.z, x = endPortal.x, nextW = WORLDS[wi + 1], top = archY(wi, WALLS_N), S = lifted(S9, top), Pq = lifted(P9, top);
        for (const sx of [-1, 1]) {
            S.box(x + sx * 7, 9, z, 2.4, 18, 2.4, Wd.wall2, { tile: 8 });
            Pq.box(x + sx * 7, 0.8, z, 3.4, 1.6, 3.4, st.dark);
            for (const y of [6, 12]) Pq.box(x + sx * 7, y, z, 2.6, 0.7, 2.6, Wd.banner);
            Pq.box(x + sx * 7, 18.6, z, 2.0, 1.0, 2.0, st.dark, { soft: !low }); fl.push([x + sx * 7, top + 19, z, 1.6, st.flame]);
        }
        S.box(x, 18.2, z, 17, 2.2, 2.8, Wd.wall2, { tile: 8 });
        Pq.box(x, 19.5, z, 17.6, 0.5, 3.3, st.cap, { soft: true });
        portalDecal(D, x, top + 0.2, z, 11.6, 16.6, Wd.glow, nextW ? nextW.glow : 0xffffff);
        signs.add([big(nextW ? 'ON TO ' + nextW.name.toUpperCase() + '!' : 'ALL WORLDS CLEARED!', GOLD, 92, '#141a3a')], 16, new V3(x, top + 24.5, z + 1.5), false, 150);
    }
    // ----- the Upgrades and the Rebirth booths. A back wall with monitors on it, side walls, a flat canopy on posts with a light strip
    // along its front, lights either side, a counter of what's on offer, a sign on the roof -----
    const kiosk = (q, hullC, canopyC, canopy2) => {
        const x = q.x, z = q.z, w = 24, hw2 = w / 2, zf = z + 5.6, zb = z - 8.4;
        S0.box(x, 0.15, z - 1.4, w + 2, 0.3, 17, st.dark, { tile: 8 });
        S0.box(x, 5, zb + 1.5, w, 10, 3, hullC, { tile: 8 });
        S0.box(x, 0.9, zb + 1.6, w + 0.2, 1.8, 3.2, Wd.wall2, { tile: 8 });
        P0.box(x, 10.15, zb + 1.5, w + 0.6, 0.3, 3.6, st.cap);
        // monitors on the back wall: dark screens with readouts in the sector's colours
        for (let i = 0; i < 3; i++) {
            const rx = x - 7 + i * 7;
            P0.box(rx, 6.2, zb + 3.06, 5.2, 3.6, 0.2, st.dark);
            P0.box(rx, 6.2, zb + 3.18, 4.6, 3.0, 0.06, shade(st.panel, 0.35), { glow: 1 });
            for (let j = 0; j < 3; j++) P0.box(rx - 1.2 + j * 1.2, 5.6 + (j % 2) * 0.5, zb + 3.23, 0.7, 0.9 + j * 0.4, 0.04, [st.crystal, st.panel, Wd.glow][j], { glow: 1 });
        }
        stripeZ(D, x - hw2 + 0.5, x + hw2 - 0.5, 1.9, 2.8, zb + 3.04, 1, st.stripeA, st.stripeB);
        for (const sx of [-1, 1]) {
            S0.box(x + sx * (hw2 - 0.5), 3, z - 3.2, 1.5, 6, 9, hullC, { tile: 8 });
            P0.box(x + sx * (hw2 - 0.5), 5, zf, 0.7, 10, 0.7, st.steel);
            P0.box(x + sx * (hw2 - 0.5), 0.4, zf, 1.4, 0.8, 1.4, st.dark);
            lights.push([x + sx * (hw2 + 0.6), 8, zf + 0.6, 2.2, st.lamp]);
            P0.box(x + sx * (hw2 + 0.5), 8, zf + 0.6, 0.9, 0.5, 0.9, st.dark);
            P0.box(x + sx * (hw2 + 0.5), 7.7, zf + 0.6, 0.7, 0.12, 0.7, st.lamp, { glow: 1 });
        }
        // the canopy: a flat roof in two colours, a light strip along its front edge
        P0.box(x, 10.4, z - 1.4, w + 2.4, 0.5, 15, canopyC, { soft: !low });
        P0.box(x, 10.75, z - 1.4, w + 1.4, 0.3, 13.6, canopy2);
        P0.box(x, 10.2, zf + 0.7, w + 2.6, 0.7, 1.0, st.dark);
        P0.box(x, 10.2, zf + 1.24, w + 2.2, 0.3, 0.1, Wd.glow, { glow: 1 });
        bunting(D0, x - w / 2 - 0.6, x + w / 2 + 0.6, 9.7, zf + 1.3, 0.8, st.bulbs, 2.2);
        // the counter
        S0.box(x, 2.1, z + 3, w - 2.4, 4.2, 4.4, hullC, { tile: 8 });
        P0.box(x, 4.35, z + 3, w - 1.6, 0.5, 4.8, st.steel, { soft: !low });
        stripeZ(D, x - w / 2 + 1.5, x + w / 2 - 1.5, 0.4, 1.3, z + 5.23, 1, st.stripeA, st.stripeB);
    };
    {
        const q = tongueBar, x = q.x, z = q.z;
        kiosk(q, Wd.wall, Wd.wall2, st.cap);
        // the Upgrade Lab: what each upgrade is on the counter (a sneaker, a syringe of adrenaline, a clipboard of notes, a boot, a keycard,
        // a crate)
        P0.box(x - 8, 4.95, z + 3, 2.4, 0.5, 1.2, 0xffffff, { soft: !low }); P0.box(x - 8, 4.74, z + 3, 2.5, 0.18, 1.3, st.panel);
        P0.box(x - 4.2, 5.5, z + 3, 0.5, 1.6, 0.5, mixC(st.glass, 0xffffff, 0.4), { rz: 0.5 }); P0.box(x - 4.2, 5.4, z + 3, 0.34, 1.0, 0.34, 0xffd21a, { glow: 1, rz: 0.5 }); P0.box(x - 3.7, 6.2, z + 3, 0.12, 0.8, 0.12, st.steel, { rz: 0.5 });
        P0.box(x - 0.6, 4.9, z + 3, 2.0, 0.16, 2.6, 0x8a5a3a); P0.box(x - 0.6, 5.0, z + 3, 1.7, 0.08, 2.2, 0xffffff); for (let i = 0; i < 4; i++) P0.box(x - 0.6, 5.06, z + 2.2 + i * 0.5, 1.2, 0.04, 0.12, 0x3a4a6a);
        P0.box(x + 3, 5.4, z + 3, 1.2, 1.6, 1.0, st.dark, { soft: !low }); P0.box(x + 3.3, 4.85, z + 3, 1.8, 0.5, 1.0, st.dark, { soft: !low });
        P0.box(x + 6.4, 5.2, z + 3, 1.6, 1.0, 0.1, 0xffffff, { rx: -0.3 }); P0.box(x + 6.4, 5.25, z + 3.05, 1.4, 0.3, 0.1, Wd.banner, { glow: 1, rx: -0.3 });
        P0.box(x + 9.2, 5.2, z + 3, 1.4, 1.4, 1.4, st.wood, { soft: !low }); P0.box(x + 9.2, 5.2, z + 3, 1.46, 0.3, 1.46, st.stripeB);
        // on the roof: a great glowing arrow pointing up
        const ay = 19.4;
        P0.box(x, ay - 1, z - 1, 2, 4, 1.4, st.crystal, { glow: 1 });
        P0.box(x - 1.1, ay + 1.6, z - 1, 1.2, 3.2, 1.4, st.crystal, { glow: 1, rz: -0.8 }); P0.box(x + 1.1, ay + 1.6, z - 1, 1.2, 3.2, 1.4, st.crystal, { glow: 1, rz: 0.8 });
        P0.box(x, 13, z - 1, 0.6, 5, 0.6, st.steel);
        signs.add([big('UPGRADES', LIME, 118, '#062a06'), { t: 'more Speed, faster clicks, more Wins: for good', c: '#ffffff', s: '#141a3a', px: 40 }], 14, new V3(x, 26, z + 4), false, 150);
    }
    {
        // the Rebirth Reactor (when the game has its panel to open: opts.rebirth), else more upgrades
        const q = upgradeShed, x = q.x, z = q.z, reb = !!opts.rebirth, cc = st.crystal;
        kiosk(q, Wd.wall, st.accent2, st.cap);
        // beakers of coloured goo on the counter
        for (let i = 0; i < 5; i++) { const c = [0x7ae8ff, 0xff5ac0, 0xffd23a, 0x7dff6b, 0xffffff][i], bx0 = x - 8 + i * 4; stack(P0, bx0, z + 3, [[0.62, 4.6, mixC(st.glass, 0xffffff, 0.5)], [0.62, 5.6, mixC(st.glass, 0xffffff, 0.5)], [0.3, 6.3, mixC(st.glass, 0xffffff, 0.5)], [0.3, 6.9, mixC(st.glass, 0xffffff, 0.5)]], 8, one); stack(P0, bx0, z + 3, [[0.64, 4.62, c], [0.64, 5.3, c]], 8, one, 1, 1); }
        // on the roof: the reactor: a glowing core turning in a ring of little ones, a steel cage round it
        const cy = 20;
        P0.box(x, cy, z - 1, 2.8, 2.8, 2.8, cc, { glow: 2, rx: Math.PI / 4, rz: Math.PI / 4 });
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P0.box(x + Math.cos(a) * 3.3, cy + Math.sin(a) * 3.3, z - 1, 0.7, 0.7, 0.7, st.bulbs[i % st.bulbs.length], { glow: 1, rz: a + Math.PI / 4 }); }
        for (const ox of [-1, 1]) { P0.box(x + ox * 4.6, cy - 2, z - 1, 0.5, 9, 0.5, st.steel); }
        P0.box(x, cy + 2.6, z - 1, 9.7, 0.5, 0.5, st.steel); P0.box(x, 15.4, z - 1, 9.7, 0.5, 0.5, st.steel);
        lights.push([x, cy, z - 1, 6, cc]);
        signs.add(reb ? [big('REBIRTH', PINK, 118, '#2a0a24'), { t: 'start again stronger: a bigger multiplier, for good', c: '#ffffff', s: '#2a0a24', px: 40 }] : [big('THE KEY SHOP', AQUA, 118, '#06142a'), { t: 'upgrades: more Speed and Wins', c: '#ffffff', s: '#06142a', px: 40 }], 12.5, new V3(x, 26.4, z + 4), false, 150);
    }
    // ----- the Power Keys: giant keycaps in a row (one instanced mesh: each goes down under a click and springs back up), a dark socket
    // round each, a ring glowing round it when it's open; a sign on a post behind each says what a click on it is worth ("+2 / CLICK"),
    // and a shut one what opens it -----
    const lockLines = (c) => (c.gems ? [big(c.gems + ' GEMS', PINK, 72, '#2a0a24')] : [{ t: 'REQUIRES', c: '#ffffff', s: '#3a0a0a', px: 40 }, big(fmt(c.need) + ' WINS', RED, 72)]);
    const keyGeo = powerKeyGeo(BELT.w, PKEY_TOP), keyMat = matte({ color: 0xffffff, vertexColors: true }), keyM = new T.InstancedMesh(keyGeo, keyMat, POSTS.length);
    keyM.castShadow = !low; keyM.receiveShadow = true; keyM.frustumCulled = false;
    const keyDip = new Float32Array(POSTS.length), keyCol = new T.Color(), keyO = new T.Object3D();
    const placeKey = (i) => { const sp = postSpot(i); keyO.position.set(sp.x, -keyDip[i], sp.z); keyO.updateMatrix(); keyM.setMatrixAt(i, keyO.matrix); };
    const postSigns = POSTS.map((c, i) => {
        const sp = postSpot(i), bw = BELT.w, bl = BELT.l, pz = sp.z - bl / 2 - 1.4;
        S0.box(sp.x, 0.06, sp.z, bw + 1.8, 0.12, bl + 1.8, st.dark, { tile: 8 });
        P0.box(sp.x, 0.16, sp.z, bw + 1.2, 0.1, bl + 1.2, shade(c.c, 0.5));
        // the sign's post and its board
        P0.box(sp.x, 4.6, pz, 1.2, 9.2, 1.2, st.steel);
        P0.box(sp.x, 0.4, pz, 2.2, 0.8, 2.2, st.dark);
        P0.box(sp.x, 9.6, pz, bw + 1.2, 3.8, 0.7, shade(c.c, 0.85), { soft: true });
        P0.box(sp.x, 9.6, pz + 0.38, bw + 0.5, 3.2, 0.1, 0x141a3a);
        P0.box(sp.x, 11.7, pz, bw + 1.6, 0.4, 1.0, c.c2, { glow: 1 });
        const ring = decal(D, 3, sp.x, 0.24, sp.z, bw / 2 + 1.5, bl / 2 + 1.5, c.c, 0, 1, 4);
        keyM.setColorAt(i, keyCol.set(c.c));
        placeKey(i);
        if (c.rgb) lights.push([sp.x, 2, sp.z, 5, c.c2]);
        const name = signs.add([big(postLabel(c), i < 7 ? LIME : PINK, 62, '#10300a', 'bolt'), { t: c.name, c: '#ffffff', s: '#141a3a', px: 36 }], 9.4, new V3(sp.x, 9.8, pz + 0.7), false, 92);
        const lock = signs.add(lockLines(c), 7, new V3(sp.x, PKEY_TOP + 2.6, sp.z + 1), false, 80);
        return { name, lock, i, open: null, ring };
    });
    keyM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(keyM);
    let keyLt = 0;
    // ----- the Eggs: each an egg turning in a containment cage over a steel pedestal (glowing plate, posts, a ring on top), a ring on the
    // floor round its foot, its name and price over it -----
    const giftList = JAWBREAKERS.map((J, i) => {
        const s = jbSpot(i), r = 2.1 + i * 0.06, cr = 3.0, ct = 4.4 + r * 2.8 + 0.6;
        stack(S0, s.x, s.z, [[3.4, 0, st.dark], [3.2, 0.8, st.dark], [2.4, 1.2, st.metal], [1.8, 3, st.metal], [2.3, 3.6, st.dark], [2.2, 4.1, st.dark]], 8, one);
        P0.box(s.x, 4.2, s.z, 4.2, 0.3, 4.2, J.c2, { glow: 1, soft: true });
        for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2 + 0.26; P0.box(s.x + Math.cos(a) * cr, (4.35 + ct) / 2, s.z + Math.sin(a) * cr, 0.22, ct - 4.35, 0.22, st.steel); }
        stack(P0, s.x, s.z, [[cr + 0.2, ct, st.metal], [cr + 0.2, ct + 0.5, st.metal], [cr * 0.5, ct + 1.1, J.c2], [cr * 0.2, ct + 1.3, J.c2]], 6, one);
        decal(D, 3, s.x, 0.08, s.z, 5.4, 5.4, J.c2, 0, 1, (i % 2) + 4);
        signs.add([big(J.name, WHITE, 72, '#141a3a'), big(fmt(J.wins) + ' WINS', GOLD, 64, '#141a3a', 'crown')], 8.2, new V3(s.x, ct + 4.4, s.z), true, 82);
        return { x: s.x, y: 4.5, z: s.z, s: r * 1.15, c1: J.c1, c2: J.c2 };
    });
    const cores = presentMesh(giftList, low, group, true);
    // ----- the Worlds portal (a vault door rolled open, a swirl in its round frame) and the Ball Rush gate (pillars, stripes, red
    // beacons, a curtain of light): two pillars and a lintel each, a swirl in each -----
    const arch = (p, c1, c2, title, sub, g1, vault) => {
        for (const sx of [-1, 1]) {
            S0.box(p.x + sx * 8, 10, p.z, 2.6, 19.6, 2.6, Wd.wall2, { tile: 8 });
            P0.box(p.x + sx * 8, 0.9, p.z, 3.6, 1.8, 3.6, st.dark);
            for (let j = 0; j < 3; j++) P0.box(p.x + sx * 8, 5 + j * 5, p.z, 2.75, 0.7, 2.75, j % 2 ? Wd.banner : st.cap);
            P0.box(p.x + sx * 8, 20.4, p.z, 2.0, 1.0, 2.0, st.dark, { soft: true });
            fl.push([p.x + sx * 8, 20.8, p.z, 1.4, g1]);
            if (!vault) for (const sz of [1, -1]) stripeUp(D, ...(sz > 0 ? [[p.x + sx * 8 - 1.3, 1.9, p.z + 1.33], [p.x + sx * 8 + 1.3, 1.9, p.z + 1.33], [p.x + sx * 8 + 1.3, 4.5, p.z + 1.33], [p.x + sx * 8 - 1.3, 4.5, p.z + 1.33]] : [[p.x + sx * 8 + 1.3, 1.9, p.z - 1.33], [p.x + sx * 8 - 1.3, 1.9, p.z - 1.33], [p.x + sx * 8 - 1.3, 4.5, p.z - 1.33], [p.x + sx * 8 + 1.3, 4.5, p.z - 1.33]]), st.stripeA, st.stripeB);
        }
        S0.box(p.x, 19.2, p.z, 19.6, 2.4, 2.8, Wd.wall2, { tile: 8 });
        P0.box(p.x, 20.6, p.z, 20.4, 0.5, 3.4, st.cap, { soft: true });
        if (!vault) { stripeZ(D, p.x - 7, p.x + 7, 18.05, 18.75, p.z + 1.43, 1, st.stripeA, st.stripeB); stripeZ(D, p.x - 7, p.x + 7, 18.05, 18.75, p.z - 1.43, -1, st.stripeA, st.stripeB); }
        else {
            // the vault door's round frame: a ring of steel round the swirl, bolts round it; the door itself rolled aside (a great round
            // slab with spokes, standing on edge by the east pillar)
            const N = low ? 14 : 20, rc = 8.4, cy = 9.6;
            for (let i = 0; i < N; i++) { const a = (i + 0.5) / N * Math.PI * 2, L = 2 * Math.PI * rc / N + 0.1; P0.box(p.x + Math.cos(a) * rc, cy + Math.sin(a) * rc * 1.05, p.z, L, 1.3, 2.0, i % 2 ? st.steel : st.metal, { rz: a + Math.PI / 2 }); }
            // (standing on its edge beside the frame, swung open towards Home Row: a solid disc, a rim, spokes, a hub wheel)
            const dx = p.x + 14.2, dz = p.z + 3.4, dr = 6.8, dy = dr + 0.2, M = low ? 12 : 18, ptD = (i, r, zz) => { const a = i / M * Math.PI * 2; return [dx + Math.cos(a) * r, dy + Math.sin(a) * r, zz]; };
            for (let i = 0; i < M; i++) {
                for (const sz of [1, -1]) P0.faceTo(ptD(i, dr, dz + sz * 0.6), ptD(i + 1, dr, dz + sz * 0.6), [dx, dy, dz + sz * 0.6], [dx, dy, dz + sz * 0.6], [0, 0, sz], sz > 0 ? st.steel : st.metal);
                const a = (i + 0.5) / M * Math.PI * 2, L = 2 * Math.PI * dr / M + 0.1;
                P0.box(dx + Math.cos(a) * dr, dy + Math.sin(a) * dr, dz, L, 0.9, 1.6, st.metal, { rz: a + Math.PI / 2 });
            }
            for (let i = 0; i < 3; i++) P0.box(dx, dy, dz + 0.75, dr * 1.7, 0.45, 0.2, st.dark, { rz: i / 3 * Math.PI });
            P0.box(dx, dy, dz + 0.95, 2.2, 2.2, 0.6, st.dark, { soft: !low, rz: Math.PI / 4 });
            P0.box(dx, dy, dz + 1.3, 3.4, 0.3, 0.3, Wd.banner); P0.box(dx, dy, dz + 1.3, 0.3, 3.4, 0.3, Wd.banner);
            P0.box(dx, 0.4, dz, 4, 0.8, 2.4, st.dark);
        }
        portalDecal(D, p.x, 0.3, p.z, 13.6, 17.6, c1, c2);
        signs.add(sub ? [big(title, RED, 104, '#2a0606'), { t: sub, c: '#ffffff', s: '#141a3a', px: 40 }] : [big(title, AQUA, 118, '#06142a')], 13, new V3(p.x, 24.8, p.z), false, 170);
    };
    arch(worldsPortal, Wd.glow, 0xffffff, 'WORLDS', null, st.flame, true);
    arch(playGate, 0xff3a5a, 0xffd0d8, 'BALL RUSH', 'walk in, or press RACE', 0xff3a2a, false);
    // ----- the leaderboards: big wall monitors on steel stands -----
    const BA = boardAtlas(), boardG = [];
    const TITLES = ['MOST WINS', 'FASTEST', 'RACES WON'];
    boards.forEach((bd, i) => {
        const side = bd.x !== 0;
        P0.box(bd.x, 7.5, bd.z, side ? 1.2 : 25, 14, side ? 25 : 1.2, st.dark, { soft: !low });
        P0.box(bd.x, 14.8, bd.z, side ? 1.8 : 26.4, 0.6, side ? 26.4 : 1.8, st.metal);
        P0.box(bd.x, 0.3, bd.z, side ? 2.4 : 27, 0.6, side ? 27 : 2.4, st.dark);
        for (const s of [-1, 1]) {
            const px = bd.x + (side ? 0 : s * 13.4), pz = bd.z + (side ? s * 13.4 : 0);
            P0.box(px, 8, pz, 0.8, 16, 0.8, st.steel);
            P0.box(px, 16.4, pz, 1.0, 0.6, 1.0, Wd.banner, { glow: 1 });
            P0.box(px, 0.5, pz, 1.6, 1.0, 1.6, st.dark);
        }
        const g = new T.PlaneGeometry(23, 13), uv = g.attributes.uv, dir = side ? (bd.x < 0 ? 1 : -1) : -1;
        for (let v = 0; v < uv.count; v++) uv.setX(v, (uv.getX(v) + i) / 3);
        g.rotateY(side ? (bd.x < 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI);
        g.translate(bd.x + (side ? dir * 0.66 : 0), 7.4, bd.z + (side ? 0 : dir * 0.66));
        boardG.push(g);
        drawBoard(BA, i, TITLES[i], [], Wd);
    });
    const boardMesh = new T.Mesh(mergeG(boardG), new T.MeshBasicMaterial({ map: BA.t, toneMapped: false }));
    for (const g of boardG) g.dispose();
    group.add(boardMesh);
    // ----- what stands about Home Row: cups of pencils, retro computers, heaps of keycaps, boxes, plants, a vending machine, cones -----
    for (const [x, z, kind] of SPOTS) prop(P0, D0, lights, kind, x, z, R, st, Wd, low);
    const farKits = [new Kit({ glow: true }), new Kit({ glow: true }), new Kit({ glow: true }), new Kit({ glow: true })];
    horizon(Wd, farKits, rng(wi * 41 + 5), 260, northEnd - 200, low);
    stretchP.push(...farKits);
    // ----- build it -----
    const decalMat = decalMaterial(Wd, low), decalGeo = D.geometry(), decals = new T.Mesh(decalGeo, decalMat);
    decals.frustumCulled = false; decals.renderOrder = 1;
    group.add(decals);
    for (const f of fl) halo(E, f[0], f[1] + f[3] * 0.7, f[2], f[3] * 2.4, f[4], 1);
    for (const l of lights) halo(E, l[0], l[1], l[2], l[3], l[4], 0.5);
    const energyMat = energyMaterial(), energyG = E.geometry(), energy = new T.Mesh(energyG, energyMat);
    energy.frustumCulled = false; energy.renderOrder = 3;
    group.add(energy);
    const flames = flameMesh(fl, st.flame2, group);
    const bladeG = bladeGeo(Wd, BLADE_ARM), bladeM = new T.InstancedMesh(bladeG, bladeMaterial(), Math.max(1, blades.length));
    {
        const o = new T.Object3D();
        blades.forEach((b, i) => { o.position.set(0, BLADE_PIVOT + (b.y || 0), b.z); o.rotation.set(0, 0, 0); o.updateMatrix(); bladeM.setMatrixAt(i, o.matrix); });
        bladeM.count = blades.length;
        bladeM.instanceMatrix.setUsage(T.DynamicDrawUsage);
        bladeM.frustumCulled = false; bladeM.castShadow = !low; bladeM.receiveShadow = true;
        group.add(bladeM);
    }
    const courseKeys = buildJelly(group, domes, { low }), squareKeys = buildJelly(group, hubKeys, { low, chunkX: 36, near: low ? 42 : 80, far: low ? 200 : 300 });
    const jelly = {
        meshes: [...courseKeys.meshes, ...squareKeys.meshes], count: courseKeys.count + squareKeys.count,
        update(c, force) { courseKeys.update(c, force); squareKeys.update(c, force); },
        showAll() { courseKeys.showAll(); squareKeys.showAll(); },
        dispose() { courseKeys.dispose(); squareKeys.dispose(); },
    };
    // (the lasers, the sliding force gates and the rest that moves in the stages)
    const stageFx = buildStageFx(group, wi, Wd, st, low);
    buildBlobs(group, () => Math.random());
    const hullMesh = batchKits(stretchS, hullMaterial(), true);
    if (hullMesh) group.add(hullMesh);
    const propMesh = batchKits(stretchP, propMaterial(), true);
    if (propMesh) group.add(propMesh);
    // (the little things throw no shadow worth drawing twice)
    const detailMesh = batchKits(detail, propMaterial(), false);
    if (detailMesh) group.add(detailMesh);
    const cwHull = batchKits(cwS, hullMaterial(), false), cwProp = batchKits(cwP, propMaterial(), false);
    if (cwHull) { cwHull.castShadow = false; group.add(cwHull); }
    if (cwProp) { cwProp.castShadow = false; group.add(cwProp); }
    signs.build(group);
    PL.build(group);
    // nothing here moves as a whole: its matrices are worked out once, not every frame
    group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    group.updateMatrixWorld(true);
    scene.add(group);
    // ----- prompts: the Upgrades, the Rebirth booth, the Worlds vault, the Ball Rush gate, an Egg, a Power Key with a price, the
    // FREE GIFT box (when the game has its panel to open: opts.gift) -----
    const PR = [];
    PR.push({ pos: new V3(tongueBar.x, 0, tongueBar.z + 4), r: tongueBar.r, label: () => 'Upgrades', act: () => opts.shed(), zone: 'world' });
    PR.push({ pos: new V3(upgradeShed.x, 0, upgradeShed.z + 4), r: upgradeShed.r, label: () => (opts.rebirth ? 'Rebirth' : 'Upgrades'), act: () => (opts.rebirth ? opts.rebirth() : opts.shed()), zone: 'world' });
    PR.push({ pos: new V3(worldsPortal.x, 0, worldsPortal.z), r: worldsPortal.r, label: () => 'Worlds', act: () => opts.worlds(), zone: 'world' });
    PR.push({ pos: new V3(playGate.x, 0, playGate.z), r: playGate.r, label: () => 'Ball Rush', act: () => opts.play(), zone: 'world' });
    JAWBREAKERS.forEach((J, i) => { const s = jbSpot(i); PR.push({ pos: new V3(s.x, 0, s.z), r: JB_R + 2.2, label: () => J.name, act: () => opts.jaw(i), zone: 'world' }); });
    for (const v of postSigns) { const s = postSpot(v.i); if (POSTS[v.i].gems) PR.push({ pos: new V3(s.x, 0, s.z), r: POST_R + 1, label: () => 'Open the ' + POSTS[v.i].name, act: () => opts.post(v.i), zone: 'world', on: () => !v.open }); }
    if (opts.gift) PR.push({ pos: new V3(GIFT.x, 0, GIFT.z), r: 4.5, label: () => 'Free Gifts', act: () => opts.gift(), zone: 'world' });
    prompts.length = 0; prompts.push(...PR);
    // ----- what changes -----
    const dOn = decalGeo.attributes.aOn, padK = new Float32Array(WALLS_N).fill(1);
    const setOn = (attr, from, n, v) => { for (let i = 0; i < n; i++) attr.setX(from + i, v); attr.addUpdateRange(from, n); attr.needsUpdate = true; };
    const bo = new T.Object3D(), bm = new T.Matrix4();
    const view = {
        T: Tw, w: wi, group, sea: null, pads, signs, gates, blades: bladeM, cores, jelly, sliders: stageFx.sliders, slideM: stageFx.slideMesh, stageFx, plaques: PL,
        setBoards(m) { drawBoard(BA, 0, TITLES[0], m.wins, Wd); drawBoard(BA, 1, TITLES[1], m.speed, Wd); drawBoard(BA, 2, TITLES[2], m.race, Wd); },
        // what you've got: which Power Keys are open (a shut one dark, its ring out, its price showing)
        setProgress(p, postOpenFn) {
            for (const v of postSigns) {
                const open = !!postOpenFn(p, v.i);
                if (open === v.open) continue;
                v.open = open;
                signs.show(v.lock, !open);
                setOn(dOn, v.ring, 4, open ? 1 : 0);
                keyM.setColorAt(v.i, keyCol.set(POSTS[v.i].c).multiplyScalar(open ? 1 : 0.45));
                keyM.instanceColor.needsUpdate = true;
            }
        },
        // a click on Power Key i: it goes down (k: how hard; it springs back up in update)
        pressKey(i, k) { if (i >= 0 && i < keyDip.length) keyDip[i] = Math.max(keyDip[i], Math.min(0.62, 0.42 * (k || 1))); },
        // how far down Power Key i is now (whoever stands on it goes down with it)
        keyDip: (i) => keyDip[i] || 0,
        // stage k's gate cooling down (it paid a moment ago): the gold plate under its trophy goes grey
        setPad(k, on) {
            const v = on ? 1 : 0, P2 = pads[k];
            if (!P2 || padK[k] === v) return;
            padK[k] = v;
            setOn(dOn, P2.di, 4, v);
        },
        // (the gates never shut: kept for old callers)
        setGates() {},
        // every frame: the lasers and arms near the camera move (the rest stay as they are)
        update(t, camX, camZ, lt) {
            stageFx.update(t, lt ?? t, camZ ?? 0);
            // the Power Keys springing back up after their clicks
            const now = lt ?? t, dk = Math.min(0.1, Math.max(0, now - keyLt));
            keyLt = now;
            let kd = false;
            for (let i = 0; i < keyDip.length; i++) {
                if (keyDip[i] === 0) continue;
                keyDip[i] *= Math.exp(-dk * 12);
                if (keyDip[i] < 0.003) keyDip[i] = 0;
                placeKey(i); kd = true;
            }
            if (kd) keyM.instanceMatrix.needsUpdate = true;
            let any = false;
            for (const b of blades) {
                if (Math.abs(b.z - camZ) > 250) continue;
                const s = Math.max(-1, Math.min(1, bladeAt(b.o, t) * (W.halfW - 3) / BLADE_ARM));
                bo.position.set(0, BLADE_PIVOT + (b.y || 0), b.z); bo.rotation.set(0, 0, Math.asin(s)); bo.updateMatrix();
                bladeM.setMatrixAt(b.i, bm.copy(bo.matrix));
                any = true;
            }
            if (any) bladeM.instanceMatrix.needsUpdate = true;
        },
        dispose() {
            releaseBlobs(group);
            signs.dispose();
            PL.dispose();
            jelly.dispose();
            stageFx.dispose();
            cores.geometry.dispose(); cores.material.dispose(); cores.dispose();
            decalGeo.dispose(); decalMat.dispose();
            energyG.dispose(); energyMat.dispose();
            if (flames) { flames.geometry.dispose(); flames.material.dispose(); flames.dispose(); }
            bladeG.dispose(); bladeM.dispose();
            keyGeo.dispose(); keyMat.dispose(); keyM.dispose();
            if (hullMesh) (hullMesh.isBatchedMesh ? hullMesh.dispose() : hullMesh.geometry.dispose());
            if (propMesh) (propMesh.isBatchedMesh ? propMesh.dispose() : propMesh.geometry.dispose());
            if (detailMesh) (detailMesh.isBatchedMesh ? detailMesh.dispose() : detailMesh.geometry.dispose());
            for (const cm of [cwHull, cwProp]) if (cm) (cm.isBatchedMesh ? cm.dispose() : cm.geometry.dispose());
            BA.t.dispose(); boardMesh.geometry.dispose(); boardMesh.material.dispose();
            scene.remove(group);
        },
    };
    return view;
}
function mergeG(list) {
    const n = list.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    let o = 0;
    for (const g of list) { pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); for (let i = 0; i < g.index.count; i++) idx.push(o + g.index.getX(i)); o += g.attributes.position.count; }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
}
