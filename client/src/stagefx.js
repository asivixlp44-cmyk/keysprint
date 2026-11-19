// The giant balls rolling down the Sprintway's path (shared/world.js says where each one is, on the server's clock: the same on every
// screen), one draw for all of them: only the few nearest the camera are placed each frame. Each is a ball of keycaps in the world's
// colourway (dark gaps between the keys, a legend dot on most), spinning like a wheel as it rolls (a round cap on each side, its axle
// across the path), sinking into the drain at the bottom. Slot 0 is the giant keyball turning on its stand on Home Row. Lambert, a
// little self-lit; it fades out right in front of the lens, so one rolling past the camera never fills the screen.
import { T } from './engine.js';
import { CU } from './clock.js';
import { glowVCMaterial, nearFade } from './geo.js';
import * as SW from '../../shared/world.js';

const { RUN, ballsBetween, ballY, ballStand } = SW;
const m4 = new T.Matrix4(), q4 = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3(1, 1, 1), e3 = new T.Euler();
const mixC = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
const hash2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
// (the old lasers' colours, by world: kept for whoever reads them)
export const laserColors = (Wd) => { const id = Wd && Wd.id; return id === 'pastel' ? { c: 0x22ff6a, core: 0xeafff0 } : id === 'arctic' ? { c: 0xff2a6a, core: 0xffe8f0 } : id === 'galaxy' ? { c: 0xff3ad8, core: 0xffeaff } : { c: 0xff2a24, core: 0xfff0e8 }; };
// how high the ball on Home Row's stand sits (its stand's top, world.js builds it)
export const STAND_TOP = 6.2;

// a ball of keycaps: rows of keys round it from one side cap to the other (its axle along x), a colour a face, round normals; in RGB
// Galaxy the gaps between the keys glow
export function keyballGeo(Wd, low, radius) {
    const R = radius || RUN.r, g0 = new T.SphereGeometry(R, low ? 26 : 44, low ? 16 : 26).rotateZ(Math.PI / 2), g = g0.toNonIndexed();
    g0.dispose();
    const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), glow = new Float32Array(n), night = Wd.id === 'galaxy';
    const K = Wd.keys.map((c) => new T.Color(c)), gap = new T.Color(night ? Wd.glow : mixC(Wd.keys[1], 0x101018, 0.62)), dot = new T.Color(Wd.legend);
    const cap = new T.Color(Wd.banner), D = 180 / Math.PI, rows = 6, cols = 12;
    for (let f = 0; f < n; f += 3) {
        v3.set(0, 0, 0); for (let v = f; v < f + 3; v++) { v3.x += p.getX(v); v3.y += p.getY(v); v3.z += p.getZ(v); }
        v3.normalize();
        const th = Math.acos(Math.max(-1, Math.min(1, v3.x))) * D, ph = (Math.atan2(v3.y, v3.z) + Math.PI) / (Math.PI * 2);
        const r = th / 180 * rows, ri = Math.floor(r), c = ph * cols + (ri % 2) * 0.5, ci = Math.floor(c), fr = r - ri, fc = c - ci;
        let cc, gl = 0;
        if (th < 16 || th > 164) cc = cap;
        else if (fr < 0.13 || fr > 0.87 || fc < 0.11 || fc > 0.89) { cc = gap; gl = night ? 1 : 0; }
        else {
            const h = hash2(ri, ci % cols);
            cc = K[h < 0.55 ? 0 : h < 0.82 ? 1 : 2];
            if (Math.abs(fr - 0.5) < 0.12 && Math.abs(fc - 0.5) < 0.1 && h > 0.25) cc = dot;
        }
        for (let v = f; v < f + 3; v++) { col[v * 3] = cc.r; col[v * 3 + 1] = cc.g; col[v * 3 + 2] = cc.b; glow[v] = gl; }
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('aGlow', new T.BufferAttribute(glow, 1));
    return g;
}

export function buildStageFx(group, wi, Wd, st, low) {
    const N = 5, zs = [];
    const geo = keyballGeo(Wd, low, RUN.r), mat = nearFade(glowVCMaterial(CU.uNow), 'ks-keyball2', 5, 11);
    const mesh = new T.InstancedMesh(geo, mat, N + 1);
    mesh.castShadow = !low; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 1;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(mesh);
    const place = (i, x, y, z, roll, yaw) => { e3.set(roll, yaw || 0, 0, 'YXZ'); q4.setFromEuler(e3); v3.set(x, y, z); m4.compose(v3, q4, s3); mesh.setMatrixAt(i, m4); };
    place(0, ballStand.x, STAND_TOP + RUN.r, ballStand.z, 0, 0);
    let all = false;
    return {
        mesh, balls: zs,
        // every frame: the balls near the camera (camZ) where they are at server time t (lt: the frame clock, for the one on its stand)
        update(t, lt, camZ) {
            place(0, ballStand.x, STAND_TOP + RUN.r, ballStand.z, (lt || 0) * 0.5, 0.6);
            ballsBetween(t, camZ - (all ? 1e5 : 560), camZ + (all ? 1e5 : 180), zs);
            if (zs.length > N) { zs.sort((a, b) => Math.abs(a - camZ) - Math.abs(b - camZ)); zs.length = N; }
            for (let i = 0; i < zs.length; i++) { const z = zs[i]; place(i + 1, 0, ballY(wi, z), z, z / RUN.r, 0); }
            mesh.count = zs.length + 1;
            mesh.instanceMatrix.needsUpdate = true;
        },
        // (warming up behind the loading screen: every slot drawn)
        showAll(on) { all = !!on; },
        dispose() { geo.dispose(); mat.dispose(); mesh.dispose(); group.remove(mesh); },
    };
}
