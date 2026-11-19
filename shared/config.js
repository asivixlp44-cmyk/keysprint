// Keysprint: the game's data and formulas, shared by the client and the server.
// The loop: every CLICK (the big button, E, a tap on the world, or Auto Click) is +1 Speed, times all your boosts, and every 20th is a
// MEGA click (x10). Your Speed is how fast you run: the more you click, the faster your feet. Stand on a Power Key in Home Row and every
// click counts +N. Then run the Sprintway, a narrow keyboard path climbing into the sky: giant balls roll down it from the top, one
// after another, and wide keyboards cross it now and then. Wait out on the side of one while a ball rolls past, then RUN up to the next
// before the next ball gets there: the runs get longer stage by stage, so the further up, the more Speed it takes. A ball that gets you
// knocks you out and Boxity's death screen counts down; then revive to the stage you were in (FREE every 3 minutes, a short ad, or
// Gems) or go back to Home Row. Every checkpoint you reach pays Wins; Wins buy upgrades, trails and Eggs for pets, and the Wins you've earned all told open the better
// Power Keys. Rebirth at enough Speed for a permanent multiplier; clearing the last stage of a world opens the next.
// And RACE: Ball Rush, six lanes, the Backspace wave erasing the keys behind you, first to ENTER wins.
// Everything is bought with Wins or Gems, all earned in the game. There are no in-app purchases.
export const lookup = (o) => Object.assign(Object.create(null), o);

export const CFG = {
    maxPlayers: 16,
    // moving: base walk speed (0 Speed), gravity, the fastest fall, a jump's power; the fastest your Speed ever makes you run
    walk: 16, vMax: 92, grav: 110, fallMax: 210, airDash: 46, hopV: 22, power: 58,
    // clicks the server counts: this many a second at most, a couple of seconds' worth saved for a hiccup in the network
    clickRate: 16, clickBurst: 32,
    // Auto Click: clicks a second by itself (Auto Clicker Pro adds autoStep a level)
    autoRate: 3, autoStep: 0.5,
    // a MEGA click: every megaEvery-th click (Mega Keys bring it sooner, never sooner than megaMin), worth megaK clicks
    megaEvery: 20, megaMin: 10, megaK: 10,
    // a footstep on the ground: a stride (longer the faster you go): just the sound and the keys' ripple now
    stride: 4.2, strideHz: 4,
    // a stage's gate pays again after this long
    padCool: 30,
    // DASH: how much faster, how long, how long before the next
    dashK: 1.65, dashSecs: 0.6, dashCool: 2.4,
    // knocked out: one FREE revive (back to the stage you were in) every so many seconds, else a rewarded ad or Gems; the offer stays
    // open this long while Boxity's death screen is up (the player picks: nothing respawns them by itself)
    reviveFreeSecs: 180, reviveGems: 5, reviveOffer: 120,
    // a rewarded ad's x2 Speed: this many minutes
    adX2Mins: 10,
    // the server keeps this many bots about when it's quiet (one leaves per player who joins)
    bots: 3,
    boostP2Gems: 25, boostP2Mins: 15, boostW2Gems: 40, boostW2Mins: 10,
    spinMins: 7, spinMax: 3,
    // Ball Rush: places, how long the queue stays open, how long the start line waits
    matchSpots: 6, matchQueue: 9, matchFull: 3, matchReady: 6,
    // SKIP: the stage you're in, for Gems (you land just inside the next gate; the skipped gate pays nothing)
    skipGems: 8,
    // the squad boost: every other real player in your server adds this much Speed a click, up to sqMax
    sqEach: 0.1, sqMax: 0.5,
};

// ----- jump power -> height (studs) -----
export const jumpH = (p) => Math.max(0, p) * Math.max(0, p) / 392;
export const jumpV = (p) => Math.sqrt(2 * CFG.grav * jumpH(p));

export const RARITIES = lookup({
    common: { name: 'Common', color: '#c8d0dc' }, uncommon: { name: 'Uncommon', color: '#7dff6b' }, rare: { name: 'Rare', color: '#3ab4ff' }, epic: { name: 'Epic', color: '#b45aff' },
    legendary: { name: 'Legendary', color: '#ffc42a' }, mythic: { name: 'Mythic', color: '#ff4a8a' },
});

// ----- (footwear: not part of this game; one plain entry so the profile's field and the avatar code have something to read) -----
export const SHOES = [{ id: 'none', name: 'Sneakers', rarity: 'common', add: 0, wins: 0, c1: 0xf4f6fa, c2: 0xff8a3a, glow: 0, wing: 0 }];
export const shoeOf = () => SHOES[0];

// ----- a click: +1 Speed, times all your boosts -----
export const CLICK = 1;
// (the names older callers know it by)
export const STEP = CLICK;
export const X20 = CLICK;
export const upLevel = (p, id) => (p && p.ups && p.ups[id]) || 0;
export const rebirthMult = (r) => 1 + 0.5 * (r || 0);

// ----- Speed is how fast you run. Every stage of the Sprintway is laid out for a walking pace (stageV: its gaps and its hazards' timing),
// and has a Recommended Speed: the Speed that runs you at that pace. Between them your pace climbs smoothly with the log of your Speed -----
// the walking pace each stage is laid out for (studs a second)
const PACE = [16, 18.2, 22.6, 27, 31.4, 35.8, 40.2, 44.6, 51.2, 57.8, 64.4, 71, 77.6, 84.2, 90.8];
// the Speed each stage is laid out for (its "Recommended Speed" sign): every world the same curve
const REC_SPEED = [0, 20, 90, 300, 800, 2000, 5000, 11000, 22000, 40000, 70000, 120000, 200000, 350000, 600000];
const KNOT = REC_SPEED.map((s, k) => [Math.log10(1 + s), PACE[k]]);
// how fast this much Speed runs you (studs a second, before Turbo Sneakers), never past vMax
export function walkOf(speed) {
    const x = Math.log10(1 + Math.max(0, speed || 0));
    if (x <= 0) return CFG.walk;
    let i = 0;
    while (i < KNOT.length - 2 && x > KNOT[i + 1][0]) i++;
    const [x0, v0] = KNOT[i], [x1, v1] = KNOT[i + 1];
    return Math.min(CFG.vMax, v0 + (v1 - v0) * (x - x0) / (x1 - x0));
}
// your top running speed (studs/s): your Speed's, Turbo Sneakers +2% each on top
export const maxWalk = (p) => walkOf(p && p.speed) * (1 + 0.02 * upLevel(p, 'feet'));
export const WALLS_N = 15;
export const recSpeed = (w, k) => REC_SPEED[Math.max(0, Math.min(WALLS_N - 1, k | 0))];
// how fast the stage is meant to be run (its gaps and layout are sized for this)
export const stageV = (k) => PACE[Math.max(0, Math.min(WALLS_N - 1, k | 0))];
// how far up the stages' Speeds you are: 0 at 0 Speed, k at stage k's Recommended Speed, a fraction between (past the last: on up)
export function speedRank(speed) {
    const x = Math.log10(1 + Math.max(0, speed || 0));
    let i = 0;
    while (i < KNOT.length - 2 && x > KNOT[i + 1][0]) i++;
    return Math.max(0, i + (x - KNOT[i][0]) / (KNOT[i + 1][0] - KNOT[i][0]));
}
// the next stage whose Recommended Speed is over yours (or -1: fast enough for every stage)
export const nextRec = (speed) => REC_SPEED.findIndex((s) => s > (speed || 0));
// rebirth: this much Speed the first time, x2.5 each time after; how far you are (0..100). It costs nothing (but your Speed)
export const rebirthSpeed = (r) => Math.round(10000 * Math.pow(2.5, r || 0));
export const rebirthPct = (p) => Math.min(100, Math.floor((p.speed || 0) / rebirthSpeed(p.rebirths) * 100));
export const rebirthCost = () => 0;

// the Upgrades, for Wins (kept when you rebirth). switch: +15% Speed a click; feet: +2% top running speed; auto: Auto Click goes
// faster; mega: a MEGA click comes one click sooner
export const UPGRADES = [
    { id: 'switch', name: 'Clicky Switches', icon: '🔘', text: 'More Speed from every click', base: 6, grow: 2.3, max: 18, stat: (n) => '+' + n * 15 + '% Speed a click' },
    { id: 'feet', name: 'Turbo Sneakers', icon: '👟', text: 'Run faster', base: 40, grow: 3.4, max: 10, stat: (n) => '+' + n * 2 + '% run speed' },
    { id: 'auto', name: 'Auto Clicker Pro', icon: '🤖', text: 'Auto Click clicks faster', base: 15, grow: 2.6, max: 8, stat: (n) => (CFG.autoRate + n * CFG.autoStep) + ' clicks a second' },
    { id: 'mega', name: 'Mega Keys', icon: '💥', text: 'MEGA clicks (x' + CFG.megaK + ') come sooner', base: 30, grow: 2.7, max: CFG.megaEvery - CFG.megaMin, stat: (n) => 'every ' + (CFG.megaEvery - n) + 'th click' },
    { id: 'spring', name: 'Spring Socks', icon: '🧦', text: 'You jump higher and further', base: 18, grow: 2.6, max: 6, stat: (n) => '+' + n * 5 + '% jump' },
    { id: 'luck', name: 'Lucky Keycap', icon: '🍀', text: 'More Wins from every checkpoint', base: 25, grow: 2.6, max: 12, stat: (n) => '+' + n * 10 + '% Wins' },
    { id: 'den', name: 'Pet Backpack', icon: '🎒', text: 'Room for one more pet on your team', base: 120, grow: 8, max: 3, stat: (n) => (3 + n) + ' on your team' },
];
export const upgradeById = lookup(Object.fromEntries(UPGRADES.map((u) => [u.id, u])));
export const upgradeCost = (u, n) => Math.round(u.base * Math.pow(u.grow, n));
export const jumpPowerOf = (p) => CFG.power * Math.sqrt(1 + 0.05 * upLevel(p, 'spring'));
// Auto Click's clicks a second; every how many clicks a MEGA one comes; is click number n (counted all told) a MEGA one?
export const autoRateOf = (p) => CFG.autoRate + CFG.autoStep * upLevel(p, 'auto');
export const megaEveryOf = (p) => Math.max(CFG.megaMin, CFG.megaEvery - upLevel(p, 'mega'));
export const isMega = (n, p) => n > 0 && n % megaEveryOf(p) === 0;
export const teamMax = (p) => 3 + upLevel(p, 'den');

// ----- trails and auras: what you wear, and what it's worth. Trails for Wins, auras for Gems. Both more Speed -----
export const TRAILS = [
    { id: 'none', name: 'No Trail', rarity: 'common', wins: 0, gems: 0, c1: 0xffffff, mult: 1 },
    { id: 'dust', name: 'Click Sparks', rarity: 'common', wins: 15, gems: 0, c1: 0xfff4c8, mult: 1.1 },
    { id: 'ion', name: 'Keystroke Streak', rarity: 'uncommon', wins: 90, gems: 0, c1: 0x7ad8ff, mult: 1.25 },
    { id: 'comet', name: 'Pixel Dust', rarity: 'uncommon', wins: 450, gems: 0, c1: 0x8aff5a, mult: 1.5 },
    { id: 'solar', name: 'Neon Line', rarity: 'rare', wins: 2500, gems: 0, c1: 0xffe03a, mult: 2 },
    { id: 'plasma', name: 'Bubblegum Ribbon', rarity: 'epic', wins: 15000, gems: 0, c1: 0xff6ac8, mult: 3 },
    { id: 'nebula', name: 'Frost Trail', rarity: 'epic', wins: 1e5, gems: 0, c1: 0xaef4ff, mult: 5 },
    { id: 'nova', name: 'Starfall', rarity: 'legendary', wins: 8e5, gems: 0, c1: 0xb06aff, mult: 9 },
    { id: 'rainbow', name: 'RGB Wave', rarity: 'mythic', wins: 1e7, gems: 0, c1: 0xffffff, rainbow: 1, mult: 16 },
];
export const trailById = lookup(Object.fromEntries(TRAILS.map((s) => [s.id, s])));
export const AURAS = [
    { id: 'none', name: 'No Aura', rarity: 'common', wins: 0, gems: 0, c1: 0xffffff, mult: 1 },
    { id: 'ice', name: 'Static Charge', rarity: 'uncommon', wins: 0, gems: 20, c1: 0xd8f0ff, mult: 1.25 },
    { id: 'corona', name: 'Turbo Glow', rarity: 'rare', wins: 0, gems: 60, c1: 0xff7a2a, mult: 1.6 },
    { id: 'aurora', name: 'Pastel Halo', rarity: 'epic', wins: 0, gems: 150, c1: 0xffa8e0, mult: 2.2 },
    { id: 'pulsar', name: 'Frost Ring', rarity: 'legendary', wins: 0, gems: 350, c1: 0x7ae0ff, mult: 3.2 },
    { id: 'rainbow', name: 'RGB Overdrive', rarity: 'mythic', wins: 0, gems: 800, c1: 0xffffff, rainbow: 1, mult: 5 },
];
export const auraById = lookup(Object.fromEntries(AURAS.map((s) => [s.id, s])));

// ----- the Power Keys in Home Row: giant keycaps you stand on. Every click on one counts +N (its sign: "+2 / CLICK" is twice a plain
// click, times all your boosts). need: the Wins you've earned all told (never spent down) that open it; gems: its price instead.
// c: the cap's colour, c2: its legend and trim; label: the word on it -----
export const POSTS = [
    { id: 'esc', name: 'Esc Key', label: 'ESC', mult: 1, need: 0, gems: 0, c: 0xf6efe0, c2: 0xff7a2a },
    { id: 'tab', name: 'Tab Key', label: 'TAB', mult: 2, need: 10, gems: 0, c: 0xffd23a, c2: 0x5a3a10 },
    { id: 'shift', name: 'Shift Key', label: 'SHIFT', mult: 3, need: 60, gems: 0, c: 0x7ad8ff, c2: 0x0a3a6a },
    { id: 'caps', name: 'Caps Key', label: 'CAPS', mult: 5, need: 300, gems: 0, c: 0xff8ac4, c2: 0x5a0a3a },
    { id: 'enter', name: 'Enter Key', label: 'ENTER', mult: 8, need: 1500, gems: 0, c: 0x7dff6b, c2: 0x0a4a1a },
    { id: 'space', name: 'Space Key', label: 'SPACE', mult: 12, need: 25000, gems: 0, c: 0xffffff, c2: 0x2a2a3a },
    { id: 'turbo', name: 'Turbo Key', label: 'TURBO', mult: 20, need: 1000000, gems: 0, c: 0xff5a3a, c2: 0xfff07a },
    { id: 'gold', name: 'Golden Key', label: 'GOLD', mult: 35, need: 0, gems: 120, c: 0xffc42a, c2: 0x5a3a00 },
    { id: 'rgb', name: 'RGB Key', label: 'RGB', mult: 60, need: 0, gems: 400, c: 0x2a2440, c2: 0x7af0ff, rgb: 1 },
];
// what a Power Key's sign says: "+2 / CLICK"
export const postLabel = (c) => '+' + c.mult + ' / CLICK';
export const postOpen = (p, i) => { const c = POSTS[i]; return !!c && (c.gems ? !!(p.posts && p.posts[c.id]) : (p.totalWins || 0) >= c.need); };
// the next Power Key your Wins will open (or null)
export const nextPost = (p) => POSTS.find((c) => !c.gems && (p.totalWins || 0) < c.need) || null;

// ----- pets: little keyboard critters that follow you. Out of Eggs (eight of them), five in each -----
// ear: 0 none, 1 pointed, 2 floppy, 3 long; horn 0 none, 1 one, 2 antlers; tail 0..2; spike 0/1; ant: 1 a pair of antennae with
// glowing tips (client/src/pals.js builds them all from one model)
// (the eggs are called JAWBREAKERS in the code: the list every system already knows). c1: the shell, c2: the bands, c3: the glow
const PT = ['common', 'uncommon', 'rare', 'epic', 'legendary'], PM = [0.1, 0.18, 0.3, 0.55, 1], ODDS = [50, 30, 14, 5, 1];
const JB = (id, name, wins, c1, c2, c3, list) => ({ id, name, wins, c1, c2, c3, list });
const pal = (name, c1, c2, ear, horn, tail, spike, ant) => ({ name, c1, c2, ear, horn, tail, spike: spike || 0, ant: ant || 0 });
export const JAWBREAKERS = [
    JB('rookie', 'Keycap Egg', 5, 0xf6efe0, 0xff8a3a, 0xfff6e8, [pal('Tabby Tab', 0xf4c48a, 0xfff4e8, 1, 0, 2), pal('Shift Pup', 0xe8d8c0, 0x8a5a3a, 2, 0, 1), pal('Hop Bunny', 0xfafafa, 0xffb0c8, 3, 0, 0), pal('Clack Hamster', 0xe8b878, 0xfff0d8, 1, 0, 0), pal('Pixel Chick', 0xffe04a, 0xff8a3a, 0, 0, 0)]),
    JB('lunar', 'Retro Egg', 40, 0xe6dcc6, 0x6a8a3a, 0xfff8e0, [pal('Beige Bear', 0xd8c8a8, 0x8a6a4a, 1, 0, 0), pal('Floppy Frog', 0x8ad84a, 0x2a4a8a, 0, 0, 0, 1), pal('Cassette Fox', 0xff8a3a, 0x2a2a34, 1, 0, 2), pal('Dial-up Duck', 0xfff07a, 0xff8a1a, 0, 0, 0), pal('Arcade Owl', 0x8a6ad8, 0x7af0ff, 1, 0, 0, 0, 1)]),
    JB('comet', 'Pastel Egg', 260, 0xffc8e4, 0xa88aff, 0xfff0fa, [pal('Mochi Cat', 0xfff0f6, 0xffa8c8, 1, 0, 2), pal('Sprinkle Pup', 0xffd0e8, 0x7ae8d8, 2, 0, 1), pal('Cotton Lamb', 0xfffaff, 0xd8b8ff, 2, 0, 0, 0), pal('Gumdrop Snail', 0xa8f0d8, 0xff8ac8, 0, 0, 0, 1, 1), pal('Pastel Unicorn', 0xfff4ff, 0xff8ad8, 1, 1, 2)]),
    JB('solar', 'Arctic Egg', 1700, 0xeaf8ff, 0x3a8ae8, 0xf4fcff, [pal('Polar Cub', 0xf8fcff, 0xaed8f0, 1, 0, 0), pal('Snowy Owl', 0xffffff, 0x2a4a6a, 1, 0, 0), pal('Frost Ferret', 0xd8f0ff, 0x6ad8ff, 0, 0, 2, 0, 1), pal('Ice Ram', 0xe8f4ff, 0x7ab4d8, 2, 2, 0), pal('Blizzard Wolf', 0xa8d8f0, 0x1e4ab8, 1, 0, 2, 1)]),
    JB('plasma', 'Neon Egg', 11000, 0x2a2440, 0x7dff6b, 0xe8ffe0, [pal('Neon Kitty', 0x3a2a5a, 0x7dff6b, 1, 0, 2), pal('Glow Gecko', 0x2a3a2a, 0xb8ff4a, 0, 0, 2, 1), pal('Laser Lynx', 0xff5a8a, 0xfff07a, 1, 0, 1, 0, 1), pal('Volt Hound', 0x3a6ad8, 0xffe03a, 1, 0, 2), pal('Neon Griffin', 0x7af0ff, 0xff4ad8, 1, 0, 1, 1)]),
    JB('nebula', 'Golden Egg', 75000, 0xffc42a, 0xfff07a, 0xfff8d8, [pal('Gold Hamster', 0xffd84a, 0xfff4c8, 1, 0, 0), pal('Royal Corgi', 0xf0b04a, 0xffffff, 1, 0, 1), pal('Treasure Tiger', 0xff9a2a, 0x3a2a1a, 1, 0, 2), pal('Crown Stag', 0xffe07a, 0xb8862a, 1, 2, 1), pal('Golden Dragon', 0xffc42a, 0xff5a1a, 3, 2, 2, 1)]),
    JB('quantum', 'Cosmic Egg', 500000, 0x3a2a7a, 0xffd23a, 0xe8e0ff, [pal('Star Pup', 0x4a3a9a, 0xfff4c8, 2, 0, 1), pal('Comet Cat', 0x2a2440, 0x7af4ff, 1, 0, 2), pal('Nebula Owl', 0x5a6ad8, 0xff8ad8, 1, 0, 0), pal('Galaxy Stag', 0x3a2a7a, 0xffd23a, 1, 2, 1), pal('Cosmic Wyvern', 0x3ad8ff, 0xd85aff, 3, 2, 2, 1)]),
    JB('galactic', 'RGB Egg', 3500000, 0x1e1a2e, 0xff4ad8, 0xffffff, [pal('RGB Kitten', 0xf0f0ff, 0xff4ad8, 1, 0, 2), pal('Prism Fox', 0x7af0ff, 0xff7af0, 1, 0, 2), pal('Spectrum Griffin', 0xffe04a, 0x3ab4ff, 1, 0, 1, 1), pal('Chroma Phoenix', 0xff4a8a, 0x7af0ff, 1, 1, 2, 1), pal('RGB Dragon', 0x8aff3a, 0xb46aff, 3, 2, 2, 1, 1)]),
];
export const PALS = [];
JAWBREAKERS.forEach((J, j) => J.list.forEach((a, i) => {
    const k = Math.pow(2.3, j);
    PALS.push({ ...a, id: J.id + i, jb: j, tier: i, rarity: PT[i], odds: ODDS[i], mult: Math.round((1 + PM[i] * k) * 100) / 100 });
}));
export const palById = lookup(Object.fromEntries(PALS.map((a) => [a.id, a])));
export const palsOf = (j) => PALS.filter((a) => a.jb === j);
// your team's worth: what each pet adds, together
export function teamMult(team) {
    let m = 1;
    for (const id of team || []) { const a = palById[id]; if (a) m += a.mult - 1; }
    return Math.round(m * 100) / 100;
}
// a finished Egg's collection pays this many Gems
export const jbGems = (j) => 5 + j * 5;

// ----- the Speed a click gives (before a Power Key's +N and a MEGA click's x10): +1, times rebirths, pets, trail, aura, Clicky
// Switches, the world, x2, and the squad boost (sq: 0..sqMax, from the other players in your server; the server says how much) -----
export function clickGain(p, x2, w, sq) {
    const world = WORLDS[w === undefined ? (p.world || 0) : w] || WORLDS[0];
    return CLICK * rebirthMult(p.rebirths) * teamMult(p.team) * (TRAILS[p.trail | 0] || TRAILS[0]).mult * (AURAS[p.aura | 0] || AURAS[0]).mult * (1 + 0.15 * upLevel(p, 'switch')) * world.pow * (x2 ? 2 : 1) * (1 + Math.max(0, Math.min(CFG.sqMax, sq || 0)));
}
// "All Your Boosts: x3.5": everything that multiplies a click's Speed together
export const allBoosts = (p, x2, w, sq) => clickGain(p, x2, w, sq) / CLICK;
// the squad boost for this many other real players in the server
export const squadOf = (others) => Math.min(CFG.sqMax, Math.max(0, others | 0) * CFG.sqEach);
// ----- Speed packs for Gems: sp is in clicks (what that many clicks give you now, without a Power Key), so a pack is always worth the
// same share of your progress -----
export const SPEED_PACKS = [{ id: 's1', gems: 5, sp: 300 }, { id: 's2', gems: 15, sp: 1000 }, { id: 's3', gems: 40, sp: 3000 }];
export const padPay = (p, w, k, first, w2) => Math.max(1, Math.round(padWins(w, k) * (first ? FIRST_PAD : 1) * (1 + 0.1 * upLevel(p, 'luck')) * (w2 ? 2 : 1)));

// ----- the worlds: 15 stages each, every one laid out for a higher Speed and paying more than the last. Clearing the last opens the
// next. pow: a click's worth there; wins: what its gates pay -----
// keys: the keycap colourway of the keyboard floor (legend: the letters on them, legendGlow 0..1: how much they glow, rgb 0..1: how
// much of a rainbow wave runs through the glow); floor/floor2/path/rim: Home Row's deck, its guide lines and its edge; wall/wall2: the
// keyboard case of the Sprintway, light and dark; trim: its accent stripe; moss: what caps the tops of things; hazard/hazard2: the drop
// (the sea of clouds below, ice water, the void); sea/sea2: the world's two accent colours (the menus' cards use sea); glow: portals and
// lights; banner: the accent colour (flags, stripes, chevrons)
export const WORLDS = [
    {
        id: 'retro', name: 'Retro Ridge', rank: 'I', icon: '🖥️', pow: 1, wins: 1, mood: 'retro',
        floor: 0xf4ecda, floor2: 0xe8dec8, path: 0xff8a3a, rim: 0x6a4a2a, wall: 0xdccfb4, wall2: 0x8a7a62, trim: 0xff7a2a, moss: 0xfff8ea, hazard: 0xd8eeff, hazard2: 0xffffff, sea: 0xff7a2a, sea2: 0x3ab4e8, glow: 0xffd23a,
        keys: [0xf8f2e4, 0xe4d8c0, 0xff8a3a], legend: 0x3a2a18, legendGlow: 0, rgb: 0, banner: 0xff5a3a,
        stages: ['First Roll', 'Side Step', 'Rolling Start', 'Bumper Row', 'Quick Feet', 'Ball Alley', 'Roll Call', 'Dodge Lane', 'Big Rollers', 'Fast Lane', 'Rumble Row', 'Thunder Path', 'Spin Cycle', 'Ball Storm', 'The Summit'],
    },
    {
        id: 'pastel', name: 'Pastel Peaks', rank: 'II', icon: '🍬', pow: 4, wins: 120, mood: 'pastel',
        floor: 0xfff2f8, floor2: 0xf8e2ee, path: 0xff7ac0, rim: 0x8a4a7a, wall: 0xffc8e4, wall2: 0xc87ab0, trim: 0x7ae8d8, moss: 0xfff0ff, hazard: 0xffd8ee, hazard2: 0xffffff, sea: 0xff5aa8, sea2: 0x7ae8d8, glow: 0xff9ae0,
        keys: [0xfff4fa, 0xffb8dc, 0xa88aff], legend: 0x5a2a5a, legendGlow: 0, rgb: 0, banner: 0x7ae8d8,
        stages: ['Sugar Roll', 'Gumball Lane', 'Candy Steps', 'Bonbon Alley', 'Jellybean Dash', 'Sprinkle Run', 'Taffy Twist', 'Marshmallow Row', 'Lolly Rollers', 'Cotton Candy Climb', 'Fudge Rumble', 'Sherbet Sprint', 'Toffee Storm', 'Sundae Rush', 'Sugar Summit'],
    },
    {
        id: 'arctic', name: 'Arctic Keys', rank: 'III', icon: '❄️', pow: 16, wins: 14000, mood: 'arctic',
        floor: 0xf0f8fc, floor2: 0xe2eef6, path: 0x3ab4e8, rim: 0x2a4a6a, wall: 0xdcf0ff, wall2: 0x6a9ac0, trim: 0x1e6ad8, moss: 0xffffff, hazard: 0x2a6ac0, hazard2: 0xbff4ff, sea: 0x1e7ad8, sea2: 0x7ae8ff, glow: 0x7af0ff,
        keys: [0xffffff, 0xcdeeff, 0x3a8ae8], legend: 0x0a2a5a, legendGlow: 0, rgb: 0, banner: 0xff5a7a,
        stages: ['Frost Roll', 'Snowball Lane', 'Icicle Steps', 'Penguin Alley', 'Igloo Dash', 'Sleet Run', 'Glacier Glide', 'Polar Row', 'Avalanche Rollers', 'Blizzard Climb', 'Aurora Rumble', 'Frozen Sprint', 'Snowstorm', 'Iceberg Rush', 'Frost Summit'],
    },
    {
        id: 'galaxy', name: 'RGB Galaxy', rank: 'IV', icon: '🌌', pow: 64, wins: 1.7e6, mood: 'galaxy',
        floor: 0x3a3260, floor2: 0x302a54, path: 0x241e44, rim: 0x14102a, wall: 0x2a2448, wall2: 0x18142e, trim: 0x7af0ff, moss: 0xd8c8ff, hazard: 0x14062e, hazard2: 0xb46aff, sea: 0x6a3ad8, sea2: 0x3af0ff, glow: 0xb48aff,
        keys: [0x1e1a2e, 0x2e2848, 0x7af0ff], legend: 0x9af4ff, legendGlow: 1, rgb: 1, banner: 0xff4ad8,
        stages: ['Neon Roll', 'Comet Lane', 'Star Steps', 'Orbit Alley', 'Pulsar Dash', 'Nebula Run', 'Meteor Twist', 'Plasma Row', 'Planet Rollers', 'Galaxy Climb', 'Quasar Rumble', 'Warp Sprint', 'Supernova Storm', 'Black Hole Rush', 'RGB Summit'],
    },
];
// what passing a stage's gate pays (x the world's Wins)
const STAGE_WINS = [1, 1, 2, 3, 5, 7, 10, 14, 19, 26, 35, 47, 63, 84, 112];
export const stageName = (w, k) => WORLDS[w].stages[k];
export const padWins = (w, k) => STAGE_WINS[k] * WORLDS[w].wins;
// the first time through a gate each rebirth pays this much more
export const FIRST_PAD = 3;
// a world opens when the last gate of the one before is passed and you've been reborn enough times (worldReb)
const WORLD_REB = [0, 1, 4, 8];
export const worldReb = (w) => WORLD_REB[w] || 0;
export const worldOpen = (p, w) => w === 0 || (((p.bests && p.bests[w - 1]) || 0) >= WALLS_N && (p.rebirths || 0) >= worldReb(w));
// (the gates never lock: kept so old callers still link)
export const stageNeed = () => 0;
export function gateLock() { return WALLS_N; }
// how fast you run, studs a second: your top running speed (the screen's Custom Speed may ask for less: min(custom, this))
export const runSpeed = (p) => maxWalk(p || {});
// a footstep on the ground: a stride, longer the faster you go
export const strideOf = (v) => Math.max(CFG.stride, v / CFG.strideHz);

// ----- a title over your head: how far you've come (stages cleared, all told) -----
const TITLES = [[0, 'Key Rookie'], [3, 'Tapper'], [8, 'Clicker'], [15, 'Fast Fingers'], [25, 'Keysmith'], [40, 'Speed Typist'], [60, 'Turbo Clicker'], [100, 'Key Legend'], [160, 'Lord of the Keys']];
export const titleOf = (cleared) => { let t = TITLES[0][1]; for (const [n, name] of TITLES) if ((cleared || 0) >= n) t = name; return t; };

// ----- Ball Rush: what a race is like at a level. Longer and tougher as you get faster, and better paid -----
// your level for this: how far up the stages' Speeds you are, plus what you've left behind in rebirths
export const matchLv = (p) => 1 + Math.round(2.4 * speedRank(p.speed)) + 3 * (p.rebirths || 0);
export function matchInfo(lv) {
    const L = Math.max(1, lv | 0), segs = Math.min(14, 5 + Math.floor(L / 6));
    return {
        segs,
        // the clock runs out long after a good run (there's waiting in the pockets); that's for the ones who stop
        secs: Math.round(Math.min(180, 30 + segs * 9)),
        // the balls: one every ballT seconds down every lane, rolling ballV studs a second (more often and faster at higher levels)
        ballT: +Math.max(3.2, 3.8 - L * 0.01).toFixed(2), ballV: +Math.min(40, 30 + L * 0.2).toFixed(1),
        // how good the bots are: how they run, how often one sets off when it shouldn't (a chance a second)
        botPace: Math.min(1, 0.86 + L * 0.004), botTrip: Math.max(0.03, 0.12 - L * 0.002),
    };
}
// in a race your Speed counts only so much (a log scale): a new player with quick feet can beat a veteran
export const matchPower = (p) => Math.round((1 + Math.min(0.2, Math.log10(1 + (p.speed || 0)) * 0.015)) * 100) / 100;
export const MATCH = { v: 27, boostSecs: 1.6, boostK: 1.45, stunSecs: 0.7, r: 3.2 };
export const PLACES = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const PLACE_K = [4.5, 3.2, 2.4, 1.8, 1.4, 1.1], PLACE_GEMS = [8, 5, 3, 2, 1, 1];
export function matchPrize(place, segs, lv, p) {
    const best = padWins(p.world || 0, Math.min(WALLS_N - 1, Math.max(0, ((p.bests && p.bests[p.world || 0]) || 1) - 1)));
    const k = PLACE_K[place] ?? 1.1, grow = 1 + Math.min(1.5, (lv | 0) * 0.015);
    return {
        wins: Math.max(1, Math.round((1 + best) * k * grow)),
        gems: (PLACE_GEMS[place] ?? 1) + (place === 0 ? Math.min(12, Math.floor((lv | 0) / 12)) : 0),
        // Speed: so many clicks' worth (x the place's share x how far you got)
        speed: Math.max(1, Math.round(clickGain(p, false, p.world || 0, 0) * 40 * k * Math.min(2.5, 0.5 + (segs || 0) / 6))),
    };
}
// everyone's colour in a race: their lane, their lights, their name on the board
export const SPOT_COL = [0xff4a6a, 0x3ab4ff, 0xffd23a, 0x46ec50, 0xc45aff, 0xff8a2a];
export const SPOT_CSS = SPOT_COL.map((c) => '#' + c.toString(16).padStart(6, '0'));

// ----- the wheel: one spin's prizes (weights). sp: clicks' worth of Speed -----
export const SPIN = [
    { w: 22, sp: 120, text: 'Speed', color: '#3ad8ff' }, { w: 18, wins: 1, text: 'Wins', color: '#ffd028' }, { w: 14, gems: 5, text: '5 Gems', color: '#b45aff' },
    { w: 12, sp: 400, text: 'Big Speed', color: '#7ae8ff' }, { w: 10, wins: 3, text: 'Big Wins', color: '#ff9a1a' }, { w: 10, x2: 10, text: 'x2 Speed', color: '#46ec50' },
    { w: 8, gems: 15, text: '15 Gems', color: '#7a4aff' }, { w: 6, wins: 10, text: 'Huge Wins', color: '#ff4a8a' },
];
// a spin's prize grows with what you've reached
export function spinPrize(s, p) {
    const best = padWins(p.world || 0, Math.min(WALLS_N - 1, Math.max(0, ((p.bests && p.bests[p.world || 0]) || 1) - 1)));
    return { speed: s.sp ? Math.max(1, Math.round(s.sp * clickGain(p, false, p.world || 0, 0))) : 0, wins: s.wins ? Math.round(s.wins * (1 + best)) : 0, gems: s.gems || 0, x2: s.x2 || 0 };
}

// ----- daily tasks -----
// (pads: gates passed from Stage 5 on; keys: clicks on a Power Key)
export const TASKS = lookup({
    wins: { text: 'Collect Wins', icon: '🏆', n: 40, gems: 6, wins: 6 },
    clicks: { text: 'Click 1,500 times', icon: '👆', n: 1500, gems: 5, wins: 4 },
    cleared: { text: 'Reach Sprintway checkpoints', icon: '🏁', n: 12, gems: 6, wins: 5 },
    megas: { text: 'Land 25 MEGA clicks', icon: '💥', n: 25, gems: 6, wins: 5 },
    pads: { text: 'Reach checkpoints from Stage 5 on', icon: '⚽', n: 5, gems: 6, wins: 6 },
    matches: { text: 'Race in Ball Rush', icon: '🥇', n: 3, gems: 8, wins: 6 },
    hatch: { text: 'Hatch Eggs', icon: '🥚', n: 5, gems: 5, wins: 4 },
    spins: { text: 'Spin the Wheel', icon: '🎡', n: 2, gems: 5, wins: 3 },
    keys: { text: 'Click 600 times on a Power Key', icon: '⌨️', n: 600, gems: 5, wins: 4 },
    rebirth: { text: 'Rebirth', icon: '🔁', n: 1, gems: 8, wins: 6 },
});
const TASK_POOL = ['clicks', 'cleared', 'megas', 'pads', 'matches', 'hatch', 'spins', 'keys', 'rebirth'];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayLeft = (ms) => 86400 - Math.floor(ms / 1000) % 86400;
export function tasksFor(day) {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = rngFrom(h >>> 0), pool = TASK_POOL.slice(), out = ['wins'];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
}

// ----- quests: always a next goal (shown at the top of the screen); they pay as soon as they're done -----
// kind: what's counted (best: stages passed in the world you're in; topSpeed: the most Speed you've had; keyClicks: clicks on a Power
// Key; totalWins: Wins earned all told, what opens the Power Keys)
export const QUESTS = [
    { kind: 'topSpeed', n: 150, text: 'Click to gain Speed: reach 150 Speed!', gems: 2 },
    { kind: 'best', n: 1, text: 'Dodge a ball: reach the Stage 2 checkpoint', wins: 1 },
    { kind: 'clicks', n: 300, text: 'Click 300 times (Auto Click helps!)', gems: 2 },
    { kind: 'best', n: 2, text: 'Hide on a safe keyboard, then run: pass Stage 2', gems: 3 },
    { kind: 'upgrades', n: 1, text: 'Buy an upgrade', gems: 3 },
    { kind: 'best', n: 3, text: 'Dodge the rolling balls: pass Stage 3', wins: 3 },
    { kind: 'totalWins', n: 10, text: 'Earn 10 Wins: the Tab Key opens (+2 / click)!', gems: 3 },
    { kind: 'hatch', n: 1, text: 'Hatch an Egg for a pet', wins: 2 },
    { kind: 'best', n: 4, text: 'Faster balls ahead: pass Stage 4', gems: 4 },
    { kind: 'megas', n: 10, text: 'Land 10 MEGA clicks (every 20th click!)', gems: 3 },
    { kind: 'topSpeed', n: 5000, text: 'Reach 5,000 Speed', wins: 6 },
    { kind: 'best', n: 6, text: 'Pass Stage 6', gems: 4 },
    { kind: 'matches', n: 1, text: 'Press RACE: run Ball Rush', gems: 5 },
    { kind: 'totalWins', n: 60, text: 'Earn 60 Wins: the Shift Key opens (+3 / click)!', gems: 4 },
    { kind: 'topSpeed', n: 25000, text: 'Reach 25K Speed', gems: 5 },
    { kind: 'best', n: 8, text: 'Pass Stage 8', wins: 20 },
    { kind: 'trail', n: 1, text: 'Get a trail', wins: 8 },
    { kind: 'best', n: 10, text: 'Pass Stage 10', gems: 8 },
    { kind: 'totalWins', n: 300, text: 'Earn 300 Wins: the Caps Key opens (+5 / click)!', gems: 6 },
    { kind: 'rebirths', n: 1, text: 'Rebirth: x1.5 Speed a click for good', gems: 10 },
    { kind: 'topSpeed', n: 100000, text: 'Reach 100K Speed', wins: 40 },
    { kind: 'keyClicks', n: 500, text: 'Click 500 times on a Power Key', wins: 10 },
    { kind: 'podium', n: 1, text: 'Finish a race in the top 3', gems: 8 },
    { kind: 'best', n: 12, text: 'Pass Stage 12', gems: 12 },
    { kind: 'spins', n: 5, text: 'Spin the wheel 5 times', gems: 6 },
    { kind: 'topSpeed', n: 500000, text: 'Reach 500K Speed', wins: 120 },
    { kind: 'best', n: 15, text: 'Pass all 15 stages: a new world!', gems: 40 },
    { kind: 'rebirths', n: 2, text: 'Rebirth twice', gems: 12 },
    { kind: 'totalWins', n: 1500, text: 'Earn 1,500 Wins: the Enter Key opens (+8 / click)!', gems: 12 },
    { kind: 'rebirths', n: 3, text: 'Rebirth 3 times', gems: 15 },
    { kind: 'clicks', n: 10000, text: 'Click 10,000 times', wins: 120 },
    { kind: 'matchWins', n: 1, text: 'Win a race', gems: 15 },
    { kind: 'topSpeed', n: 5000000, text: 'Reach 5M Speed', gems: 20 },
    { kind: 'rebirths', n: 5, text: 'Rebirth 5 times', gems: 30 },
    { kind: 'matchWins', n: 5, text: 'Win 5 races', gems: 30 },
    { kind: 'hatch', n: 50, text: 'Hatch 50 Eggs', gems: 40 },
    { kind: 'clicks', n: 100000, text: 'Click 100,000 times', gems: 60 },
];

// ----- rewards: the 7-day daily reward, playtime gifts, codes, the Gem shop -----
// (speed: so many clicks' worth of Speed at what a click gives you now)
export const DAILY = [
    { speed: 150 }, { spins: 2 }, { wins: 15 }, { gems: 10 }, { speed: 600 }, { x2: 30 }, { wins: 150, gems: 30 },
];
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
// FREE gifts for playing (minutes into this session)
export const GIFTS = [
    { min: 2, speed: 200 }, { min: 5, wins: 12 }, { min: 9, spins: 1 }, { min: 14, gems: 8 }, { min: 20, wins: 50 }, { min: 30, x2: 15 }, { min: 45, wins: 200, gems: 10 },
];
export const CODES = lookup({
    KEYSPRINT: { speed: 300 }, CLICK: { gems: 5 }, ENTER: { wins: 10 }, BLOXITY: { spins: 2 }, LEGION: { gems: 5 }, TURBO: { wins: 8, speed: 150 }, SPACEBAR: { speed: 400 },
});
export const PACKS = [
    { id: 'p1', gems: 10, wins: 20 }, { id: 'p2', gems: 30, wins: 90 }, { id: 'p3', gems: 80, wins: 320 },
];
// a reward's Speed: so many clicks' worth at what a click gives you now (no Power Key, no x2, no squad: the same whenever you take it)
export const rewardSpeed = (r, p) => (r.speed ? Math.max(1, Math.round(r.speed * clickGain(p || {}, false, (p && p.world) || 0, 0))) : 0);
// HTML: a Win (a trophy) and Speed (a bolt) are drawn (classes "wc", "pc"), Gems are 💎
export function rewardText(r, plain) {
    return [r.speed ? fmt(r.speed) + (plain ? ' Speed' : ' <i class="pc"></i>') : '', r.wins ? fmtComma(r.wins) + (plain ? ' Wins' : ' <i class="wc"></i>') : '', r.gems ? r.gems + ' 💎' : '', r.spins ? r.spins + (r.spins > 1 ? ' spins' : ' spin') : '', r.x2 ? 'x2 Speed ' + r.x2 + ' min' : ''].filter(Boolean).join(' + ');
}

// ----- Boxity leaderboards (declared by the client right after init, reported by the server from server-owned state). The first
// declaration creates a board; later edits happen in the Boxity dashboard, so these ids and settings are permanent -----
export const LEADERBOARDS = [
    { id: 'wins', label: 'Wins', order: 'desc', mode: 'sum', format: 'compact', reset: 'weekly' },
    { id: 'speed', label: 'Top Speed', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
    { id: 'clicks', label: 'Clicks', order: 'desc', mode: 'sum', format: 'compact', reset: 'weekly' },
    { id: 'stage', label: 'Highest Stage', order: 'desc', mode: 'best', format: 'number', reset: 'weekly' },
    { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
    { id: 'races', label: 'Races Won', order: 'desc', mode: 'sum', format: 'number', reset: 'weekly' },
];
// the Highest Stage board's score: stages cleared, counted across the worlds (Stage 15 of Retro Ridge is 15, Stage 1 of Pastel Peaks 16)
export const stageScore = (p) => { let s = 0; for (let w = 0; w < WORLDS.length; w++) s = Math.max(s, w * WALLS_N + (((p && p.bests && p.bests[w]) || 0) | 0)); return s; };

export const BOT_NAMES = [
    'ClickyCleo', 'TapTom', 'KeyKai', 'ShiftSam', 'CapsCal', 'EnterEmi', 'TabTess', 'SpaceSid', 'EscEli', 'AltAva',
    'CtrlCody', 'FnFinn', 'DeleteDee', 'HomeHana', 'PgUpPip', 'NumNico', 'QwertyQuin', 'AsdfAsh', 'ZxcZed', 'TurboTia',
];

// ----- helpers -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 100) / 100) + u[i];
}
// a small number with a decimal when it has one (a click's "+1.5"), a big one as fmt
export const fmtStep = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
export const fmtComma = (v) => { const s = String(Math.floor(v || 0)); return s.length < 4 || /e/.test(s) ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
