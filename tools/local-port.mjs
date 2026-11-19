// Picks the port start-local.bat uses. Prints "running <port>" when Keysprint already answers on a port, else "free <port>":
// 3205 first, then the next free one, so another local game or test server sitting on 3205 never gets opened as Keysprint.
// No dependencies (runs before npm install).
import net from 'node:net';

const BASE = 3205;
const LAST = 3211; // 3212 is the test suite's port

const isOurs = async (port) => {
    try {
        const r = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1500) });
        return (await r.json()).game === 'keysprint';
    } catch (e) {
        return false;
    }
};
const isFree = (port) => new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port);
});

for (let port = BASE; port <= LAST; port++) {
    if (await isOurs(port)) { console.log('running', port); process.exit(0); }
    if (await isFree(port)) { console.log('free', port); process.exit(0); }
}
console.log('none', BASE);
process.exit(1);
