// Looks at the game from set places: the spawn (its dais, the FREE GIFT chest, the Sprintway's gate up the way), a Power Key, the drain
// at the bottom of the path, a checkpoint with its arch, trophy and "Recommended Speed" board, a safe keyboard with a ball rolling by, the
// path climbing into the sky, the finish with its portal and the ball chute, every world's Home Row. A camera on the world; draws and
// triangles with each. Run: node tests/look.mjs (W, H, Q, BOTS)
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: process.env.BOTS ? '' : '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5733/', { w: +(process.env.W || 1280), h: +(process.env.H || 720), q: process.env.Q || 'medium', uid: 'look' + Date.now() });
const log = async (name) => { const f = await shot(page, name); console.log(name, JSON.stringify(await page.evaluate(() => { const s = window.__qa.state(), d = window.__qa.diag(); return { x: s.x, z: s.z, stage: s.stage, ...d }; }))); return f; };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
// stand somewhere out of the balls' line, looking (yaw, pitch, distance)
const at = (x, z, yaw, pitch, dist) => ev((a) => { const q = window.__qa; q.close(); q.teleport(a.x, 0, a.z, Math.PI); q.look(a.yaw, a.pitch, a.dist); }, { x, z, yaw, pitch, dist });
await sleep(800);
await ev(() => { const q = window.__qa; q.close(); q.give({ speed: 1e30, noShade: true }); });
await sleep(600);
await ev(() => window.__qa.close());
await log('a_spawn');
await ev(() => { const q = window.__qa; q.tpPost(0); q.look(0.5, 0.25, 18); });
await sleep(1500);
await log('b_powerkey');
await at(14, 40, 0.3, 0.16, 22);
await sleep(900);
await log('c_gate_drain');
const Z = await ev(() => window.__qa.zones());
// the Stage 2 checkpoint: its arch, the trophy (west), the Recommended Speed board (east)
const cp1 = Z.find((o) => o.cp && o.k === 1);
await at(13, cp1.z + 9, 0.1, 0.12, 22);
await sleep(900);
await log('d_checkpoint');
// a safe keyboard, a ball coming by
const s2 = Z[2];
await at(13, s2.z, -0.6, 0.15, 22);
await page.waitForFunction((z) => window.__qa.balls(z - 50, z).length > 0, { timeout: 15000, polling: 60 }, s2.z).catch(() => {});
await log('e_safe_ball');
// the path climbing on up, from a checkpoint halfway
const cp7 = Z.find((o) => o.cp && o.k === 7);
await at(-13, cp7.z - 6, -0.1, 0.1, 26);
await sleep(900);
await log('f_climb');
// the top: the finish, its portal, the chute
const fin = Z[Z.length - 1];
await at(-13, fin.z + 8, -0.25, 0.12, 26);
await sleep(900);
await log('g_finish');
for (const w of [1, 2, 3]) {
    await ev((ww) => { const q = window.__qa; q.give({ openWorlds: true }); q.send('world', { w: ww }); }, w);
    await sleep(3500);
    await ev(() => { window.__qa.close(); window.__qa.look(0, 0.2, 22); });
    await sleep(500);
    await log('h_world' + w);
}
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
