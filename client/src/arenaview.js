// Ball Rush on screen: six lanes side by side down a stretch of keyboard over the clouds, each lane a narrow path of giant keycaps railed
// in its racer's colour, a pocket off it every so often (alternating sides, the same in every lane) with a glowing line where the balls
// can't reach, a grate across every lane just ahead of the start line (the balls sink away through it), boost arrows now and then, and
// at the far end a great warp gate with a portal in it: the finish, and where the giant balls come flying out of, down every lane at once.
import { T, V3, scene } from './engine.js';
import { Kit, batchKits, rng, glowVCMaterial, nearFade } from './geo.js';
import { buildBlobs, releaseBlobs } from './blobs.js';
import { Signs, big, GOLD } from './signs.js';
import { CU } from './clock.js';
import {
    horizon, hullMaterial, propMaterial, decalQuads, energyQuads, decal, energyQuad, halo, decalMaterial, energyMaterial,
    flameMesh, railRun, styleOf, lookOf, floorQuad, shade, mixC, CASE,
} from './world.js';
import { buildJelly } from './keycaps.js';
import { keyballGeo } from './stagefx.js';
import { CFG } from '../../shared/config.js';
import { ARENA, laneX, laneBalls, laneBallY } from '../../shared/arena.js';

const SPOTS = CFG.matchSpots;
// a boost pad's half size (x across, z along), round its x in the lane
export const LANE_BOOST = { hw: 3, hd: 3.2 };
// (kept for old callers: the race had swinging hammers)
export const LANE_BLADE = { pivot: 10.6, arm: 8.6 };
const m4 = new T.Matrix4(), q4 = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3(1, 1, 1), e3 = new T.Euler();

export function buildArena(plan, w, spotsCol, low, mySpot) {
    const Wd = lookOf(w), st = styleOf(Wd), R = rng(w * 53 + 3), group = new T.Group(), signs = new Signs(4, 448, 152);
    const fl = [], lights = [], D = decalQuads(), E = energyQuads(), ctx = { Wd, st, R, low, fl, lights, D };
    const S0 = new Kit(), P0 = new Kit({ glow: true }), kits = [S0], propKits = [P0];
    const L2 = ARENA.laneW / 2, hwAll = SPOTS * L2, XA = hwAll + 0.6, back = 30, end = plan.finish - 18, hw = ARENA.hw, pw = ARENA.pw;
    // stretches of the course, each its own kit (culled on its own)
    const SEG = 120, stretches = [];
    for (let z = back; z > end; z -= SEG) { const S = new Kit(), P = new Kit({ glow: true }); stretches.push({ z1: z, z0: Math.max(end, z - SEG), S, P }); kits.push(S); propKits.push(P); }
    const at = (z) => stretches.find((s) => z <= s.z1 && z >= s.z0) || stretches[stretches.length - 1];
    // the deck: each lane's plate in its racer's colour (yours brighter), in bands; the case under it all
    for (const S of stretches) {
        for (let s = 0; s < SPOTS; s++) {
            const cx = laneX(s), c0 = mixC(shade(Wd.floor, 0.62), spotsCol[s], s === mySpot ? 0.5 : 0.3);
            for (let z = S.z1; z > S.z0; z -= 12) floorQuad(S.S, cx - L2, cx + L2, Math.max(S.z0, z - 12), z, 0.02, Math.floor(z / 12) & 1 ? c0 : shade(c0, 0.9));
        }
        S.S.box(0, -CASE / 2, (S.z0 + S.z1) / 2, (XA + 2.6) * 2, CASE, S.z1 - S.z0, Wd.wall2, { tile: 8 });
    }
    // the rails between the lanes: low walls of hull lit along the top in the colours either side of them, a post now and then
    for (let s = 1; s < SPOTS; s++) {
        const x = -hwAll + s * ARENA.laneW;
        for (const S of stretches) {
            const zm = (S.z0 + S.z1) / 2, len = S.z1 - S.z0;
            S.S.box(x, 0.6, zm, 0.8, 1.2, len, Wd.wall2, { tile: 8 });
            S.P.box(x - 0.22, 1.24, zm, 0.34, 0.1, len, spotsCol[s - 1], { glow: 1 });
            S.P.box(x + 0.22, 1.24, zm, 0.34, 0.1, len, spotsCol[s], { glow: 1 });
            for (let z = S.z1 - 12; z > S.z0 + 2; z -= low ? 48 : 24) S.S.box(x, 1.1, z, 1.1, 2.2, 1.6, Wd.wall, { tile: 8 });
        }
    }
    // the course's edges, the case's ends
    for (const S of stretches) for (const sx of [-1, 1]) railRun(S.S, S.P, sx, XA, S.z0, S.z1, ctx, (z) => z > back - 4);
    for (const z of [back + 1.3, end - 1.3]) S0.box(0, -CASE / 2 + 0.3, z, (XA + 2.6) * 2, CASE + 0.6, 2.6, Wd.wall2, { tile: 8 });
    // each lane's path: a low kerb down each edge in its racer's colour (open where a pocket goes off it); each pocket: a wall round
    // its far side and ends, the glowing line past which the balls can't reach you
    const lo = ARENA.grate - 1, hi = plan.finish + 4;
    for (let s = 0; s < SPOTS; s++) {
        const cx = laneX(s), kc = spotsCol[s];
        for (const side of [-1, 1]) {
            const cuts = plan.pockets.filter((p) => p.side === side).map((p) => [p.z0, p.z1]).sort((a, b) => b[1] - a[1]);
            let top = lo;
            const kerb = (z0, z1) => { if (z0 - z1 < 0.3) return; const K = at((z0 + z1) / 2); K.S.box(cx + side * (hw + 0.45), 0.35, (z0 + z1) / 2, 0.9, 0.7, z0 - z1, Wd.wall, { tile: 8 }); K.P.box(cx + side * (hw + 0.45), 0.74, (z0 + z1) / 2, 0.95, 0.1, z0 - z1, kc, { glow: 1 }); };
            for (const [a, b] of cuts) { kerb(top, b); top = a; }
            kerb(top, hi);
        }
        for (const p of plan.pockets) {
            const K = at(p.z), xo = cx + p.side * (hw + pw + 0.4), xm = cx + p.side * (hw + pw / 2);
            K.S.box(xo, 0.8, p.z, 0.9, 1.6, ARENA.pd + 1.8, Wd.wall2, { tile: 8 });
            for (const zz of [p.z0 - 0.45, p.z1 + 0.45]) K.S.box(xm, 0.8, zz, pw + 1.2, 1.6, 0.9, Wd.wall2, { tile: 8 });
            K.P.box(xo, 1.66, p.z, 1.0, 0.12, ARENA.pd + 1.9, kc, { glow: 1 });
            K.P.box(cx + p.side * ARENA.safe, 0.06, p.z, 0.45, 0.06, ARENA.pd - 1, mixC(Wd.glow, 0x7dff6b, 0.4), { glow: 1 });
        }
    }
    // the grate across every lane just ahead of the start line: dark slats, a band of stripes either side
    for (let s = 0; s < SPOTS; s++) {
        const cx = laneX(s), z = ARENA.grate - 2.5;
        S0.box(cx, 0.03, z, hw * 2 + 0.4, 0.06, 6, 0x101018);
        for (let i = 0; i < 7; i++) P0.box(cx, 0.1, z - 2.6 + i * 0.86, hw * 2, 0.08, 0.3, st.metal);
        for (const dz of [-3.3, 3.3]) P0.box(cx, 0.08, z + dz, hw * 2 + 0.4, 0.06, 0.5, Wd.hazard2, { glow: 1, shade: 0.8 });
    }
    // the start: a line of light across, a little gate over each lane lit inside in its racer's colour; the race's name over it all
    for (let s = 0; s < SPOTS; s++) {
        const cx = laneX(s), z = ARENA.startZ - 2.2;
        P0.box(cx, 0.08, z, hw * 2 + 1, 0.08, 0.7, 0xffffff, { glow: 1 });
        for (const sx of [-1, 1]) {
            S0.box(cx + sx * (hw + 1.4), 4, z, 1.1, 8, 1.1, Wd.wall2, { tile: 8 });
            P0.box(cx + sx * (hw + 0.82), 4, z, 0.08, 7.4, 0.6, spotsCol[s], { glow: 1 });
        }
        P0.box(cx, 8.3, z, hw * 2 + 3.8, 0.8, 1.2, spotsCol[s], { glow: 1 });
        P0.box(cx, 9.3, z, 1.1, 1.1, 0.4, Wd.trim, { glow: 1, rz: Math.PI / 4 });
        P0.box(cx, 0.06, ARENA.startZ + 4, 3, 0.06, 3, spotsCol[s], { glow: 1, ry: Math.PI / 4 });
    }
    signs.add([big('BALL RUSH', GOLD, 100, '#2a0a14'), { t: 'duck into the pockets, first to the portal!', c: '#ffffff', s: '#2a0a14', px: 40 }], 26, new V3(0, 17, ARENA.startZ - 6), false, 140);
    // boost arrows
    for (const o of plan.obs) {
        if (o.kind !== 'boost') continue;
        const K = at(o.z);
        for (let s = 0; s < SPOTS; s++) {
            const cx = laneX(s);
            decal(D, 1, cx + o.x, 0.09, o.z, LANE_BOOST.hw, LANE_BOOST.hd, mixC(Wd.floor, 0x000000, 0.55), mixC(spotsCol[s], 0xffffff, 0.3), 1, 0);
            K.S.box(cx + o.x, 0.04, o.z, LANE_BOOST.hw * 2 + 0.6, 0.08, LANE_BOOST.hd * 2 + 0.6, Wd.rim, { tile: 8 });
        }
    }
    // the finish: a chequered band across every lane, a great warp gate over the course (two pylons banded in the world's accent, a
    // beacon on each, a lintel with lights along it), a portal of light filling it: the balls come out of it
    {
        const K = at(plan.finish), z = plan.finish, zg = z - 6, tx = hwAll + 2.6;
        for (let s = 0; s < SPOTS; s++) { const cx = laneX(s); for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) K.P.box(cx - 4 + i * 2, 0.06, z + 1.2 - j * 2.4, 2, 0.06, 2.4, (i + j) % 2 ? 0x1a1030 : 0xffffff, { glow: (i + j) % 2 ? 0 : 1 }); }
        for (const sx of [-1, 1]) {
            const x = sx * tx;
            K.S.box(x, 10, zg, 5.2, 36, 6.4, Wd.wall, { tile: 8 });
            K.P.box(x, 17.5, zg, 5.6, 3, 6.8, Wd.banner);
            K.S.box(x, 28.4, zg, 6.2, 0.8, 7.4, Wd.wall2, { tile: 8 });
            K.P.box(x - sx * 2.66, 12, zg, 0.1, 22, 1.6, Wd.trim, { glow: 1 });
            K.P.box(x, 29.5, zg, 2.2, 0.9, 2.2, 0x3a404c, {});
            K.P.box(x, 30.5, zg, 1.4, 1.2, 1.4, 0xff3a2a, { glow: 1, soft: !low });
            lights.push([x, 30.5, zg, 3.2, 0xff4a3a]);
        }
        K.S.box(0, 25, zg, hwAll * 2 + 0.4, 4, 5, Wd.wall2, { tile: 8 });
        K.P.box(0, 27.2, zg, hwAll * 2 + 1, 0.4, 5.4, Wd.moss ?? 0xffffff, { soft: !low });
        for (let x = -hwAll + 2, i = 0; x <= hwAll - 2; x += 4, i++) K.P.box(x, 27.7, zg, 0.6, 0.5, 0.6, [0xff3a2a, 0xffc21a, 0xffffff, Wd.glow ?? 0x7af0ff][i % 4], { glow: 1 });
        K.P.box(0, 22.9, zg + 2.55, hwAll * 2, 0.4, 0.1, Wd.trim, { glow: 1 });
        energyQuad(E, 3, 0, 0.2, zg, hwAll * 2, 22.6, Wd.trim, Wd.glow, 1, 22.6 / (hwAll * 2));
        signs.add([big('FINISH!', GOLD, 118, '#3a1a00')], 24, new V3(0, 31, z - 4), false, 400);
    }
    const farKits = [new Kit({ glow: true }), new Kit({ glow: true })];
    horizon(Wd, farKits, rng(w * 41 + 5), back + 260, end - 200, low);
    propKits.push(...farKits);
    for (const f of fl) halo(E, f[0], f[1] + f[3] * 0.7, f[2], f[3] * 2.4, f[4], 1);
    for (const l of lights) halo(E, l[0], l[1], l[2], l[3], l[4], 0.5);
    // The keycap floor: keyboard rows down every lane's path and into its pockets, each row staggered on the one before like a real
    // keyboard's; clear of the grate, the start and the finish, the boost arrows. Low quality: bigger keys, fewer of them
    const KP = low ? 5.2 : 4.3, kr = low ? 2.35 : 1.9, keys = [];
    const clearAt = (x, z, r) => {
        if (z + r > ARENA.grate - 6 || z - r < plan.finish + 3) return true;
        for (const o of plan.obs) if (o.kind === 'boost' && Math.abs(z - o.z) < LANE_BOOST.hd + r + 0.4 && Math.abs(x - o.x) < LANE_BOOST.hw + r + 0.4) return true;
        return false;
    };
    for (let s = 0; s < SPOTS; s++) {
        const cx = laneX(s);
        let row = 0;
        for (let z = ARENA.grate - 6 - kr; z - kr > plan.finish + 3; z -= KP, row++) {
            const p = plan.pockets.find((q) => z < q.z1 - kr * 0.6 && z > q.z0 + kr * 0.6), x0 = p && p.side < 0 ? -(hw + pw) + 0.6 : -hw + 0.6, x1 = p && p.side > 0 ? hw + pw - 0.6 : hw - 0.6;
            for (let x = x0 + kr + (row % 2) * KP * 0.5; x <= x1 - kr + 0.01; x += KP) {
                if (clearAt(x, z, kr)) continue;
                const inP = p && Math.abs(x) > hw;
                keys.push({ x: cx + x, z, r: kr, c: inP ? Wd.keys[2] : Wd.keys[R() < 0.72 ? 0 : 1] });
            }
        }
    }
    const jelly = buildJelly(group, keys, { low });
    // the balls: one instanced mesh for every lane's (the same z in each)
    const NB = SPOTS * 4, ballG = keyballGeo(Wd, low, ARENA.r), ballMat = nearFade(glowVCMaterial(CU.uNow), 'ks-keyball-r', 4, 9);
    const ballM = new T.InstancedMesh(ballG, ballMat, NB);
    ballM.count = 0; ballM.castShadow = !low; ballM.receiveShadow = true; ballM.frustumCulled = false;
    ballM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(ballM);
    // ----- build it -----
    buildBlobs(group, () => Math.random());
    const hullMesh = batchKits(kits, hullMaterial(), true);
    if (hullMesh) group.add(hullMesh);
    const propMesh = batchKits(propKits, propMaterial(), true);
    if (propMesh) group.add(propMesh);
    const decalMat = decalMaterial(Wd, low), decalGeo = D.geometry(), decals = new T.Mesh(decalGeo, decalMat);
    decals.frustumCulled = false; decals.renderOrder = 1;
    group.add(decals);
    const energyMat = energyMaterial(), energyG = E.geometry(), energy = new T.Mesh(energyG, energyMat);
    energy.frustumCulled = false; energy.renderOrder = 3;
    group.add(energy);
    const flames = flameMesh(fl, 0xfff0b0, group);
    signs.build(group);
    group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    group.updateMatrixWorld(true);
    scene.add(group);
    const zs = [];
    const view = {
        group, jelly, balls: ballM,
        // t: the server's seconds (the balls' clock); camZ: where the camera is along the course (only the balls near it are drawn)
        update(t, camZ) {
            laneBalls(plan, t, (camZ ?? 0) - 320, (camZ ?? 0) + 60, zs);
            let n = 0;
            for (const z of zs) {
                if (n + SPOTS > NB) break;
                e3.set(z / ARENA.r, 0, 0); q4.setFromEuler(e3);
                for (let s = 0; s < SPOTS; s++) { v3.set(laneX(s), laneBallY(z), z); m4.compose(v3, q4, s3); ballM.setMatrixAt(n++, m4); }
            }
            ballM.count = n;
            ballM.instanceMatrix.needsUpdate = true;
        },
        dispose() {
            releaseBlobs(group);
            signs.dispose();
            if (hullMesh) (hullMesh.isBatchedMesh ? hullMesh.dispose() : hullMesh.geometry.dispose());
            if (propMesh) (propMesh.isBatchedMesh ? propMesh.dispose() : propMesh.geometry.dispose());
            decalGeo.dispose(); decalMat.dispose(); energyG.dispose(); energyMat.dispose();
            if (flames) { flames.geometry.dispose(); flames.material.dispose(); flames.dispose(); }
            ballG.dispose(); ballMat.dispose(); ballM.dispose();
            jelly.dispose();
            scene.remove(group);
        },
    };
    view.update(CU.uNow.value, 0);
    return view;
}
