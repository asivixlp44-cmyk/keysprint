import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, updateSky, SUN_DIRECTION, GPU_NAME, setMood, setFogScale, updateEffects, floatText, setFloatCap, billboard, prompts, VIEW,
} from './engine.js';
import { S, actions, net, prof } from './state.js';
import { CU, setEpoch, rel } from './clock.js';
import { initAudio, resumeAudio, audioAway, audioDebug, startMusic, sfx, setVolume, audioSuspended, setMusicMode, setMusicIntensity, toggleMusic, toggleSound, playAsmr, prerenderMusic, allowLiveMusic, musicLite } from './audio.js';
import { buildAsmr, adoptAsmr } from './asmr.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar } from './avatar.js';
import { pad, pollGamepad, onGamepadConnection, rumble } from './gamepad.js';
import { padNav } from './padnav.js';
import * as FX from './fx.js';
import { render, updateFx, setQuality, getQuality, autoQualityAllowed, shadowDue, setResScale, getResScale, fxWarmGroup, fxShowAll, updateAmbient, setSpeedLines, confetti, screenConfetti, shieldFx } from './fx.js';
import { buildHub, onJellyBed } from './world.js';
import { jellyHit, jellyPressBegin, jellyPress, jellyPressEnd } from './keycaps.js';
import { buildArena } from './arenaview.js';
import { installIcons } from './icons.js';
import * as SH from './shadows.js';
import { chipBurst, chipsWarm, chipsTick } from './bits.js';
import { beginPals, endPals, palsWarm, Team } from './pals.js';
import { Char, pumpAvatars, avatarsPending } from './chars.js';
import { Track, pingSend, onPong, pingEvery } from './smooth.js';
import {
    toast, bigText, popup, notEnough, animateCounters, bump, updateHud, openPanel, openJaw, panelIs, refreshPanels, closeTop, anyPopup, codeResult, warmPanels,
    measureHud, onSpun, askConfirm, flyWins, clickTick, autoState, queueState, matchHud, setScores, showCount, matchResults, questDone, dashFill, stageBar, hatchShow, reviveShow, reviveHide, reviveOpen, reviveCount, reviveBusy, walkTop,
} from './ui.js';
// (namespaces: shared/ is being remade alongside, and a name missing for a moment mustn't stop the page loading)
import * as CF from '../../shared/config.js';
import * as WD from '../../shared/world.js';
import * as SG from '../../shared/stages.js';
import { newBody, stepBody } from '../../shared/physics.js';
import { ARENA, arenaPlan, arenaPhysics, laneX, laneBalls, laneBallHit, laneRunClear, pocketAt, nextPocket, backSpot } from '../../shared/arena.js';
const {
    CFG, WORLDS, WALLS_N, POSTS, postOpen, postLabel, JAWBREAKERS, TASKS, QUESTS, UPGRADES, upgradeCost, clickGain, isMega, autoRateOf, strideOf, jumpPowerOf, stageName, dailyStatus, fmt, clamp, titleOf, rebirthMult, stageV,
    matchInfo, MATCH, SPOT_COL, SPOT_CSS, maxWalk, rebirthPct, recSpeed, nextRec,
} = CF;
const { W, wallZ, northEnd, endPortal, postSpot, postAt, BELT, KEY_TOP, jbSpot, upgradeShed, tongueBar, playGate, worldsPortal, stageAt, stagePlan, checkpoint, STAGE_TYPES, RUN, ZONES, zoneAt, nextZone, nearZone, runClear, ballHit, ballsBetween, ballSpeedAt } = WD;
// the Sprintway climbs (its floor's height here)
const floorY = WD.floorY || (() => 0);
// the floor's height under z where you are (0 in a race: its lanes are flat)
const flY = (z) => (A ? 0 : floorY(S.world || 0, z));

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => new Promise((r) => setTimeout(r, 0));
const RND = Math.random;
// a dash and a boost together make you go at most this much faster
const BURST = 2.0;

// =====================================================================================
// The world you're in (its gates are always open: nothing holds you back but the lasers, the keyballs and the drop into the clouds)
// =====================================================================================
let view = null, A = null;
const lockBox = { z: -1e9 };
const gates = { open: WALLS_N };
const worldOpts = {
    // (the UPGRADES booth calls shed (and tongues, its old name); the FREE GIFT chest by the spawn; the REBIRTH booth)
    tongues: () => openPanel('work'),
    shed: () => openPanel('work'),
    gift: () => openPanel('gifts'),
    rebirth: () => openPanel('rebirth'),
    worlds: () => openPanel('worlds'),
    play: () => pressPlay(),
    jaw: (i) => openJaw(i),
    post: (i) => buyPost(i),
};
function buyPost(i) {
    const c = POSTS[i];
    if (!c.gems) return;
    askConfirm('⌨️', c.name, 'Stand on it and every click is ' + postLabel(c) + ' Speed, for good.', c.gems + ' 💎', () => net.send('post', { i }));
}
function buildView(w) {
    if (view && view.w === w) return view;
    if (view) { view.dispose(); view = null; }
    worldOpts.low = getQuality() === 'low';
    view = buildHub(w, worldOpts);
    P.hub = view.T.make(lockBox); if (!A) P.world = P.hub;
    setMood(WORLDS[w].mood, true);
    setFogScale(1);
    view.setProgress(S, postOpen);
    view.setBoards(boards);
    updateGates();
    return view;
}
function setProgress() { if (view) view.setProgress(S, postOpen); }
// every gate open, always (a world's drawing told once)
function updateGates() { if (view && view.setGates) view.setGates(WALLS_N); }
// a world switch: behind the fade, built, drawn once with nothing culled (its shaders and textures on the
// graphics card before you see it)
async function drawHidden(group) {
    const culled = [];
    group.traverse((o) => { if ((o.isMesh || o.isPoints) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1200)]); } catch (e) { /* compiles when drawn */ }
    render();
    for (const o of culled) o.frustumCulled = true;
}
async function switchWorld(w, x, z) {
    switching = true;
    holdFpsWatch(6);
    closeTop(); closeTop();
    await fadeOut();
    try { buildView(w); await drawHidden(view.group); } catch (e) { console.error('[world]', e); noteError('[world] ' + (e && e.message)); }
    for (const r of remotes.values()) r.char.setVisible(false);
    switching = false;
    teleport(x, 0, z, Math.PI);
    fadeIn();
    bigText(WORLDS[w].icon + ' ' + WORLDS[w].name.toUpperCase(), '#7af4ff');
}

// =====================================================================================
// You: the shared physics (shared/physics.js) on your screen, every frame
// =====================================================================================
const P = {
    b: newBody(W.spawn.x, 0, W.spawn.z), facing: Math.PI, moving: false, world: null, hub: null,
    jumpPress: -9, lastJump: -9, minVy: 0, auto: null, frozen: false, snaps: 0, groundY: 0, floatT: -9, sndT: -9,
    portalAt: -9, gateAt: -9, endAt: -9, stunUntil: -9, boostUntil: -9, dashUntil: -9, dashReady: 0, holdDash: false, pilotDash: false,
    tread: -1, distAcc: 0, lastX: W.spawn.x, lastZ: W.spawn.z, clickK: 0, clickSnd: -9,
    padT: new Float64Array(WALLS_N).fill(-99), fellAt: -9, v: CFG.walk, stepK: 0,
    vx: 0, vy: 0, vz: 0,
    // dying: a moment's flash (dead), then a bubble at the spawn (nothing hurts you till shieldUntil); the stage you were last in (archFrom:
    // a step into the next one, past its gate's line, is that gate passed)
    dead: false, shieldUntil: -9, archFrom: -1,
};
// your Custom Speed (this device's: 0 is your top speed, whatever your Speed makes it); Auto Click, on or off (this device's)
S.cs = Math.max(0, Math.round(+(storageGet('ks1_cs') || 0)) || 0);
// (a first visit has no choice stored: Auto Click starts ON, so Speed grows from the first second; the AUTO button turns it off and that sticks)
{ const au = storageGet('ks1_auto'); S.auto = au === null ? true : au === '1'; }
const myTeam = new Team();
let me = null, localAvatarReq = 0;
function buildMe() {
    if (me) me.dispose();
    me = new Char({ name: S.name, lv: S.speed, tr: titleOf(S.cleared), labelW: 4.8 });
    if (me.setShoe) me.setShoe(S.shoe || 0);
    setupLocalAvatar();
}
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !me) { a.dispose(); return; }
    me.wear(a);
    if (me.setShoe) me.setShoe(S.shoe || 0);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (me && me.blox && av) { me.blox.setProportions(av.proportions); me.blox.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
function teleport(x, y, z, yaw) {
    const b = P.b;
    b.x = x; b.y = A ? y : Math.max(y || 0, flY(z)); b.z = z; b.vx = b.vy = b.vz = 0; b.onGround = true; b.pound = false;
    camSnap = true;
    P.tpN = (P.tpN || 0) + 1;
    P.tread = -1; P.passed = -1; P.archFrom = stageAt(z);
    P.lastX = x; P.lastZ = z; P.distAcc = 0;
    // (the autopilot: whatever run it was on is over)
    P.pGo = null; P.pWaitT = undefined; P.pSide = 0;
    if (me && me.trail) me.trail.reset();
    if (yaw !== undefined) { P.facing = yaw; cam.yaw = yaw + Math.PI; }
    sendMove(true);
}
const goTo = (to, k) => { if (!A && !P.dead) { flushClicks(); net.send('warp', { to, k }); } };
actions.respawn = () => goTo('spawn');
actions.go = goTo;

// =====================================================================================
// A click: on your screen straight away (its number, its sound, the key going down), on its way to the server a few times a second
// =====================================================================================
const pending = [];
// what's on its way: clicks (n), the Power Key they were made on (post), the Speed they're worth (sp)
const out = { n: 0, post: -1, sp: 0 };
let seq = 0, outAt = 0, lowQ = false;
// your Speed and clicks as they are on your screen: the server's, plus what it hasn't seen yet
const speedNow = () => (S.speed || 0) + (S.pendSp || 0);
const clicksNow = () => (S.clicks || 0) + (S.pendN || 0);
const fmtNum = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
function panOf(x, z) {
    const dx = x - camera.position.x, dz = z - camera.position.z;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    return clamp((dx * rx + dz * rz) / 40, -0.8, 0.8);
}
function flushClicks() {
    if (out.n) {
        pending.push({ s: ++seq, sp: out.sp, n: out.n });
        net.send('click', { n: out.n, post: out.post, s: seq });
        out.n = 0; out.sp = 0;
    }
    outAt = performance.now();
}
// a click: +1 Speed (times all your boosts, a Power Key's +N, a MEGA click's x10), a "+N" beside you, the key under you clacks down.
// how: 'btn' (the CLICK button), 'key' (E), 'tap' (a tap on the world), 'auto' (Auto Click). Not in a race, not knocked out
function doClick(how) {
    if (!running || A || P.dead || switching || !gotProfile) return false;
    const t = clockT, b = P.b, post = P.tread;
    if (post !== out.post && out.n) flushClicks();
    const was = speedNow(), mega = isMega(clicksNow() + 1, S);
    const gain = clickGain(S, S.x2, S.world, S.sq) * (post >= 0 ? POSTS[post].mult : 1) * (mega ? CFG.megaK : 1);
    out.n++; out.post = post; out.sp += gain;
    S.pendSp = (S.pendSp || 0) + gain; S.pendN = (S.pendN || 0) + 1;
    P.clickK = 1;
    clickTick(how !== 'auto', mega);
    // the key under you goes down: a Power Key the whole of it, else the keycaps of the floor round your feet
    if (post >= 0 && view && view.pressKey) view.pressKey(post, mega ? 1.6 : 1);
    else if (b.onGround) jellyHit(b.x, b.z, mega ? 2.4 : 1.1);
    if (me) me.squash(mega ? 0.55 : 0.16);
    if (!window.__noStepSound && (how !== 'auto' || t - P.clickSnd > 0.09)) { P.clickSnd = t; playAsmr(post >= 0 ? 'space' : 'step', how === 'auto' ? 0.24 : 0.42, 0.95 + RND() * 0.15); }
    if (mega) { playAsmr('boost', 0.5, 1.2); if (!lowQ) FX.ring(FX.tmpV.set(b.x, b.y + 0.3, b.z), 0xffe24a, 8, 0.35); shake = Math.max(shake, 0.12); rumble(0.25, 60); }
    // (the numbers are one instanced glyph sheet, a single draw for them all). Beside you, as the camera sees you, left and right in
    // turn, at chest height: clear of the tag over your head
    // (on Low, at most ten a second: a slow machine's clicking costs half the numbers)
    if ((mega || t - P.floatT > (lowQ ? 0.1 : 0.05)) && !window.__noFloat) {
        P.floatT = t; P.floatSide = -(P.floatSide || 1);
        const sd = P.floatSide * (2.2 + RND() * 1.6), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
        floatText((mega ? 'MEGA +' : '+') + fmtNum(gain), mega ? '#ffe24a' : post >= 0 ? '#7dff6b' : '#ffffff', FX.tmpV.set(P.vx + rx * sd, P.vy + 3.6 + RND() * 1.8, P.vz + rz * sd), mega ? 4.6 : 3, mega, 'speed');
    }
    // fast enough for the next stage now: say so
    const nr = nextRec(was);
    if (nr > 0 && speedNow() >= recSpeed(S.world || 0, nr)) speedUp(nr);
    if (out.n >= 12) flushClicks();
    return true;
}
actions.click = doClick;
// your Speed reached stage k's Recommended Speed: a word, a sound, a sparkle (and you run faster)
let speedUpShown = -1;
const speedMark = () => { const k = nextRec(speedNow()); return (k < 0 ? WALLS_N : k) - 1; };
function speedUp(k) {
    if (k <= speedUpShown) return;
    speedUpShown = k;
    sfx('levelup');
    toast('⚡ Fast enough for Stage ' + (k + 1) + '! You run at ' + Math.round(maxWalk({ ...S, speed: speedNow() })) + ' now', '#7af4ff');
    if (me) FX.sparkleColumn(P.b, 0x7af4ff);
}
// Auto Click: clicks by itself (Auto Clicker Pro makes it quicker), anywhere but in a race; the button (or A) turns it on and off
let autoAcc = 0;
function autoClicks(dt) {
    if (!S.auto || A || P.dead || switching) { autoAcc = 0; return; }
    autoAcc += dt * autoRateOf(S);
    for (let k = 0; autoAcc >= 1 && k < 4; k++) { autoAcc -= 1; doClick('auto'); }
}
// (the frame loop stops in a hidden tab; once a second this clicks for it, no effects, the server's click bucket still the limit)
setInterval(() => {
    if (!document.hidden || !S.auto || !running || A || P.dead || switching || !gotProfile) return;
    autoAcc += autoRateOf(S);
    for (let k = 0; autoAcc >= 1 && k < 12; k++) { autoAcc -= 1; out.n++; out.post = P.tread; const g = clickGain(S, S.x2, S.world, S.sq) * (P.tread >= 0 ? POSTS[P.tread].mult : 1) * (isMega(clicksNow() + 1, S) ? CFG.megaK : 1); out.sp += g; S.pendSp = (S.pendSp || 0) + g; S.pendN = (S.pendN || 0) + 1; }
    autoAcc = Math.min(autoAcc, 1);
    flushClicks();
}, 1000);
actions.toggleAuto = (on) => {
    S.auto = on === undefined ? !S.auto : !!on;
    storageSet('ks1_auto', S.auto ? '1' : '0');
    autoState(S.auto);
    toast(S.auto ? '🤖 Auto Click ON: ' + autoRateOf(S) + ' clicks a second' : '🤖 Auto Click off', S.auto ? '#7dff6b' : '#c8d0dc');
};
// DASH: a burst of speed
function dash() {
    const t = clockT;
    if (P.frozen) return;
    if (t < P.dashReady || (A && A.phase !== 'play')) return;
    P.dashUntil = t + CFG.dashSecs; P.dashReady = t + CFG.dashCool;
    fovKick = Math.max(fovKick, 5);
    playAsmr('whoosh', 0.5, 1.1 + RND() * 0.1);
    rumble(0.3, 80);
    if (me) me.stretch(0.4);
    FX.ring(FX.tmpV.set(P.b.x, P.b.y + 0.4, P.b.z), 0x7af4ff, 7, 0.35);
}
actions.dash = dash;
const padReady = (k) => clockT - P.padT[k] >= CFG.padCool;

// ----- moving -----
// (the same objects every frame: read straight away, never kept)
const meSt = { x: 0, y: 0, z: 0, ry: 0, snapRy: true, air: false, moving: false, speed: 0, vy: 0, jump: false, airJump: false, pose: null, lick: 0, tilt: 0, sprint: false };
const remSt = { x: 0, y: 0, z: 0, ry: 0, air: false, moving: false, speed: 0, vy: 0, far: false, pose: null, lick: 0, sprint: false };
let teamRef = null, teamStr = '';
function updateMe(dt) {
    const t = clockT, b = P.b;
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    // the camera's stick: slow near the middle for aiming, quick at the edge
    if (pad.rx || pad.ry) {
        if (!anyPopup()) { cam.yaw -= pad.rx * Math.abs(pad.rx) * 3.2 * dt * camSens; cam.pitch = clamp(cam.pitch + pad.ry * Math.abs(pad.ry) * 2 * dt * camSens, -0.5, 1.3); }
    }
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = fx * f + rx * r, mz = fz * f + rz * r;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    let hold = !!(keys.Space || touchJump || (pad.held.has('A') && !padNav.hud));
    let pressed = t - P.jumpPress < 0.15;
    // the QA autopilot drives instead
    P.pilotDash = false;
    if (P.auto) { const a = pilot(dt); mx = a.mx; mz = a.mz; hold = a.hold; pressed = a.jump; }
    // sent to a Power Key (the Train button): a few steps onto it by yourself, unless you steer
    if (P.walkTo) {
        const dx = P.walkTo.x - b.x, dz = P.walkTo.z - b.z, d = Math.hypot(dx, dz);
        if (mx * mx + mz * mz > 0.01 || t > P.walkTo.until || d < 0.6 || postAt(b.x, b.z) >= 0) P.walkTo = null;
        else { mx = dx / d; mz = dz / d; }
    }
    const outRace = A && A.out;
    P.frozen = anyPopup() || switching || (A && A.phase === 'wait') || t < P.stunUntil || P.dead || outRace || (A && A.done);
    if (P.frozen) { mx = 0; mz = 0; pressed = false; hold = false; }
    P.moving = mx * mx + mz * mz > 0.01;
    if (P.moving) { b.lastMx = mx; b.lastMz = mz; }
    // holding JUMP keeps jumping
    if (hold && b.onGround && !pressed && t - P.lastJump > 0.12) pressed = true;
    const dashing = t < P.dashUntil, boosted = t < P.boostUntil;
    // (how fast you run: your Custom Speed, under the top your Speed gives; a dash and a boost on top, never past BURST of the top)
    const base = A ? MATCH.v * (A.power || 1) * (boosted ? MATCH.boostK : 1) : walkTop() * (boosted ? 1.45 : 1);
    P.v = Math.min(base * (dashing ? CFG.dashK : 1), (A ? MATCH.v * MATCH.boostK : maxWalk(S)) * BURST);
    const inp = { mx, mz, jump: pressed, hold, power: jumpPowerOf(S), double: false, speed: P.v / CFG.walk, grip: 1 };
    if (!b.onGround) P.minVy = Math.min(P.minVy, b.vy);
    const px = b.x, pz = b.z;
    // your body moves in real time down to 10 frames a second (a slow frame is two steps): the frame clock stops at 20, and
    // below that a weak device would run in slow motion while the Wobblers, on the server's clock, don't
    const dtB = Math.max(dt, Math.min(0.1, frameDt));
    let ev = stepBody(b, inp, dtB > 0.05 ? dtB / 2 : dtB, P.world);
    if (dtB > 0.05) { const ev2 = stepBody(b, inp.jump ? { ...inp, jump: false } : inp, dtB / 2, P.world); if (!ev) ev = ev2; }
    if (ev === 1 || ev === 2) {
        // that press is used up: one press, one jump
        P.jumpPress = -9; P.lastJump = t;
        me.stretch(0.6);
        playAsmr('jump', 0.3, 1.05 + RND() * 0.1);
        P.minVy = 0;
        fovKick = Math.max(fovKick, 2.2);
    } else if (ev === 3 || ev === 4) {
        const k = clamp(-P.minVy / 60, 0.3, 1.4);
        me.squash(k);
        jellyHit(b.x, b.z, 0.9 + k * 1.1);
        playAsmr('land', 0.5, 0.9);
        if (!lowQ && k > 0.6) FX.dust(FX.tmpV.set(b.x, b.y + 0.2, b.z), 6, 0.6);
        P.minVy = 0;
    }
    if (P.moving) P.facing = lerpA(P.facing, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
    // steps on the ground: a stride at a time (longer the faster you go)
    const moved = Math.hypot(b.x - px, b.z - pz);
    if (b.onGround && P.moving && !A && moved < 6) {
        P.distAcc += moved;
        const st = strideOf(P.v);
        const onJ = b.z < W.plaza.z0 || onJellyBed(b.x, b.z);
        while (P.distAcc >= st) {
            P.distAcc -= st;
            if (!window.__noStepSound && t - P.sndT > (lowQ ? 0.16 : 0.07)) { P.sndT = t; playAsmr(onJ ? 'step' : 'crunch', onJ ? 0.42 : 0.34, 0.95 + RND() * 0.2); }
            // a step on the jelly flicks up a drop of it behind your heel
            if (!lowQ && onJ && b.z < W.plaza.z0) { const c = WORLDS[S.world || 0].keys; FX.splash(FX.tmpV.set(b.x + (RND() - 0.5) * 0.7, b.y, b.z + 0.4), c[(RND() * 3) | 0], P.v > 30 ? 2 : 1, 0.35); }
        }
    }
    // the jelly under you: a ripple every couple of studs you run (a squish in a race, where steps aren't counted)
    if (b.onGround && P.moving && moved < 6) {
        P.jellyAcc = (P.jellyAcc || 0) + moved;
        if (P.jellyAcc > 2.4) {
            P.jellyAcc = 0;
            jellyHit(b.x + (RND() - 0.5) * 0.8, b.z, 0.85);
            if (A && !window.__noStepSound && t - P.sndT > (lowQ ? 0.2 : 0.11)) { P.sndT = t; playAsmr('step', 0.36, 0.95 + RND() * 0.2); }
        }
    }
    // on a Power Key: every click there counts +N (stepping onto a locked one says what opens it)
    if (!A) {
        const i = postAt(b.x, b.z);
        if (i < 0) P.tread = -1;
        else if (i !== P.tread && b.onGround && b.y > KEY_TOP - 0.4) {
            if (postOpen(S, i)) {
                if (out.n) flushClicks();
                P.tread = i;
                playAsmr('belt', 0.3, 1.2);
                if (!keysSeen.has(i)) { keysSeen.add(i); toast('⌨️ ' + POSTS[i].name + ': every click here is ' + postLabel(POSTS[i]) + '!', '#7dff6b'); }
            } else if (t - (P.lockT || -9) > 3) { P.lockT = t; const c = POSTS[i]; toast('🔒 ' + c.name + (c.gems ? ': open it with ' + c.gems + ' Gems' : ' opens when you have earned ' + fmt(c.need) + ' Wins (you have ' + fmt(S.totalWins || 0) + ')'), '#ff9a8a'); }
        }
    }
    if (!A) hubTouch(t, dt); else raceTouch(t, dt);
    if (b.y < -40) { if (A) teleport(laneX(A.spot), 0, b.z + 2, Math.PI); else if (b.z < W.plaza.z0) die(Math.max(0, Math.min(WALLS_N - 1, stageAt(b.z))), 'ball'); else goTo('spawn'); }
    if (b.onGround) P.groundY = b.y;
    S.inGauntlet = !A && b.z < W.plaza.z0;
    // where you're drawn: where you are (a Power Key goes down a little under you with every click)
    const dx = b.x, dz = b.z, ry = P.facing, dy = b.y - (P.tread >= 0 && b.onGround && view && view.keyDip ? view.keyDip(P.tread) : 0);
    P.vx = dx; P.vy = dy; P.vz = dz;
    P.stepK = Math.max(0, P.stepK - dt * 6);
    P.clickK = Math.max(0, P.clickK - dt * 8);
    const onTread = false;
    if (me) {
        const q = meSt; q.x = dx; q.y = dy; q.z = dz; q.ry = ry; q.air = !b.onGround; q.moving = P.moving && b.onGround;
        q.speed = Math.hypot(b.vx, b.vz); q.vy = b.vy; q.jump = ev === 1; q.airJump = ev === 2; q.pose = A && A.out ? 'down' : null; q.lick = 0; q.tilt = 0; q.sprint = dashing || q.speed > 30;
        me.update(dt, t, q);
    }
    // your Familiars
    if (!A) { if (S.team !== teamRef) { teamRef = S.team; teamStr = (S.team || []).join(','); } myTeam.set(teamStr); myTeam.update(dt, t, b.x, b.y, b.z, ry, onTread || (P.moving && b.onGround)); }
    sendMove(false);
}
const lerpA = (a, b2, k) => { let d = (b2 - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
function updateClicks(dt) {
    // what's gone to the server: a few times a second
    if (performance.now() - outAt > 120 && out.n) flushClicks();
    autoClicks(dt);
    // the DASH button fills back up after a dash
    const t = clockT;
    dashFill(clamp(1 - (P.dashReady - t) / CFG.dashCool, 0, 1));
    const holding = P.holdDash || keys.ShiftLeft || keys.ShiftRight || keys.Enter || pad.held.has('X') || pad.held.has('RT') || P.pilotDash;
    if (holding && t >= P.dashReady && P.moving) dash();
}
const keysSeen = new Set();
// ----- what you're standing on: a checkpoint reached, the balls, the portal at the top; on Home Row its two gates -----
function hubTouch(t) {
    const b = P.b;
    if (!view || switching || P.dead) return;
    if (b.z < W.plaza.z0) {
        const k = stageAt(b.z);
        archCheck(t, b, k);
        ballTouch(t, Math.max(0, Math.min(WALLS_N - 1, k)), b);
        // the top: on to the next world
        if (Math.abs(b.z - endPortal.z) < 2 && Math.abs(b.x - endPortal.x) < endPortal.r) { if (t - P.endAt > 3 && !anyPopup()) { sfx('whoosh'); openPanel('tele', 'worlds'); } P.endAt = t; }
    } else {
        P.archFrom = -1;
        ballVeil(0); ballHint = '';
        // walking through the portal's gate, or the gate's
        if (Math.abs(b.x - worldsPortal.x) < 7 && Math.abs(b.z - worldsPortal.z) < 1.6) { if (t - P.portalAt > 3 && !anyPopup()) { sfx('whoosh'); openPanel('tele', 'worlds'); } P.portalAt = t; }
        if (Math.abs(b.x - playGate.x) < 7 && Math.abs(b.z - playGate.z) < 1.6) { if (t - P.gateAt > 3 && !S.queued && !anyPopup()) { sfx('whoosh'); pressPlay(); } P.gateAt = t; }
    }
}
// onto the next checkpoint (into the next stage, heading north, a stud or two past its middle): Wins. The server checks it saw you
// there, in that stage this life; each checkpoint pays again only after a cool-down
function archCheck(t, b, k) {
    if (k === P.archFrom) return;
    if (k === P.archFrom + 1 && k >= 1) {
        if (b.z > wallZ(k) - 1.5) return;
        if (padReady(k - 1)) { P.padT[k - 1] = t; flushClicks(); sendMove(true); net.send('pad', { k: k - 1 }); }
    }
    P.archFrom = k;
}
// ----- the balls (shared/world.js has where they are, on the server's clock: the same on every screen). One rolling by makes the
// ground shake and rumble, and whooshes as it passes; standing in its line (on the path, or the middle of a wide keyboard) the
// screen's edges glow as the next one closes in; out on the side of a wide keyboard, once one's gone by and the way's clear, a new
// runner is told to GO; a ball that touches you flattens you -----
const ballsNear = [], tipsShown = new Set();
// (the stage bar's words for a newer player: what to do right now about the balls; '' for everyone else and off the Sprintway)
let ballHint = '', ballDanger = false;
let eggTold = false, veilK = -1, rollT = 0, lastAhead = 1e9, passT = -9, goSaid = -9;
function ballVeil(k) { if (Math.abs(k - veilK) > 0.03 || (k === 0 && veilK !== 0)) { veilK = k; $('#veil').style.opacity = k.toFixed(2); } }
function ballTouch(t, k, b) {
    const nowS = net.now() / 1000, w = S.world || 0, safe = t < P.shieldUntil;
    if (!tipsShown.has('ballrun') && b.z < W.first - 6) { tipsShown.add('ballrun'); toast('⚽ ' + STAGE_TYPES.ballrun.tip, '#ffe24a'); }
    ballsBetween(nowS, b.z - 160, b.z + 50, ballsNear);
    let ahead = 1e9, near = 1e9;
    for (const zb of ballsNear) { const d = b.z - zb; if (Math.abs(d) < near) near = Math.abs(d); if (d > -RUN.r * 0.5 && d < ahead) ahead = d; }
    // its rumble, louder the closer it is; the ground shakes as it rolls by
    if (near < 46) {
        const kk = 1 - near / 46;
        shake = Math.max(shake, 0.22 * kk * kk);
        if (t - rollT > 0.22) { rollT = t; if (!window.__noStepSound) playAsmr('thud', 0.1 + 0.42 * kk * kk, 0.5 + RND() * 0.08, clamp(-b.x / 20, -0.6, 0.6)); }
    }
    // the one that was coming at you has gone by (the nearest ahead is the next one now): a whoosh
    if (lastAhead < RUN.r * 2 && ahead > lastAhead + 30) { passT = t; if (Math.abs(b.x) < RUN.safeX + 12) playAsmr('whoosh', 0.55, 0.7 + RND() * 0.1); rumble(0.25, 90); }
    lastAhead = ahead;
    // in its line: the edges glow as it closes in (from about a second and a half away)
    const inLine = Math.abs(b.x) < RUN.safeX, eta = ahead < 1e8 ? Math.max(0, ahead - RUN.r) / ballSpeedAt(b.z) : 9;
    ballVeil(inLine && !safe ? clamp(1 - (eta - 0.25) / 1.4, 0, 1) * 0.8 : 0);
    // out on the side of a wide keyboard, just after one's gone by, and the way to the next is clear: GO! (for new runners)
    const Z = !inLine && zoneAt(b.z, 0);
    // what to do now, said plainly
    if ((S.cleared || 0) < 10) {
        const inZone = !!zoneAt(b.z, 0), N2 = inZone ? ZONES[zoneAt(b.z, 0).idx + 1] : null;
        if (inLine && inZone) { ballHint = eta < 4 ? '⚠ BALL! GO TO THE SIDE!' : '👉 Step to the SIDE!'; ballDanger = eta < 4; }
        else if (!inZone) { ballHint = '🏃 RUN to the next keyboard!'; ballDanger = false; }
        else if (N2 && runClear(nowS, b.z, N2.z1 - 5, P.v * 0.95)) { ballHint = '✅ GO! RUN UP THE PATH!'; ballDanger = false; }
        else { ballHint = '⏳ WAIT: let the ball pass'; ballDanger = false; }
    } else { ballHint = ''; ballDanger = false; }
    if (Z && t - passT < 1.2 && t - goSaid > 3 && (S.cleared || 0) < 60) {
        const N = ZONES[Z.idx + 1];
        if (N && runClear(nowS, b.z, N.z1 - 5, P.v * 0.95)) { goSaid = t; bigText('GO!', '#7dff6b'); }
    }
    if (!safe && ballHit(w, b.x, b.y, b.z, nowS)) { if (!window.__noFloat) floatText('SPLAT!', '#ff9a8a', FX.tmpV.set(b.x, b.y + 8, b.z), 5, true); die(k, 'ball'); }
}
function knock(b, word) {
    P.stunUntil = clockT + 0.7;
    rumble(0.7, 180);
    b.z += 5; b.vz = 18; b.vy = 18; b.onGround = false;
    playAsmr('bonk', 0.7, 1);
    shake = Math.max(shake, 0.5);
    if (me) me.squash(1);
    if (!window.__noFloat) floatText(word, '#ff9a8a', FX.tmpV.set(b.x, b.y + 8, b.z), 5, true);
    if (A) net.send('mHit', {});
}
// A ball flattened you: KNOCKED OUT. A flash, then Boxity's death screen (it shows ads round
// the game while you're down) and our own card in the middle of the screen: REVIVE into the stage (FREE every few minutes, a rewarded
// ad, or Gems) or BACK TO HOME ROW. Both wait for Boxity's countdown (death.respawn() is true only once it's over), and nothing ever
// respawns you by itself. The server hears which stage it was straight away ('fell'), puts you at the spawn on its side and offers the
// revive ('died'); you stay where it happened on your screen until you pick. (srv: the server saw the ball have you first)
const SHIELD = 3;
let death = null, deathCount = 0, deathWhy = 'pit', deathBusy = false;
function die(k, why, srv) {
    const b = P.b;
    if (P.dead || A || switching || (!srv && clockT < P.shieldUntil)) return;
    P.dead = true;
    b.vx = b.vz = 0;
    if (why === 'pit') { playAsmr('splash', 0.6, 0.9); FX.splash(FX.tmpV.set(b.x, b.y + 0.4, b.z), WORLDS[S.world || 0].hazard2, lowQ ? 8 : 16, 1); }
    else if (why === 'ball') { playAsmr('smash', 0.75, 0.75); if (me) me.squash(1.2); FX.ring(FX.tmpV.set(b.x, b.y + 0.4, b.z), 0xfff0c8, 10, 0.45); }
    else if (why === 'boulder' || why === 'rock' || why === 'door') { playAsmr('smash', 0.7, 0.8); if (me) me.squash(1); FX.ring(FX.tmpV.set(b.x, b.y + 0.4, b.z), 0xfff0c8, 9, 0.45); }
    else { sfx('zap'); FX.ring(FX.tmpV.set(b.x, b.y + 1.2, b.z), 0xff3a5a, 7, 0.4); }
    rumble(0.8, 220); shake = Math.max(shake, 0.55);
    // (the flash's animation started over: one forced style flush, once a death, never in a plain frame)
    const fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    flushClicks();
    P.deaths = (P.deaths || 0) + 1;
    deathWhy = why; deathBusy = false;
    ballVeil(0); P.pGo = null;
    if (!srv) net.send('fell', { k, why });
    // Boxity's death screen and its countdown (0 at once outside Boxity): the card shows it on its buttons
    closeTop(); closeTop();
    death = BX.deathShow();
    deathCount = 4;
    const unsub = death.onCountdown((n) => { deathCount = Math.max(0, n | 0); reviveCount(deathCount); });
    death.unsub = unsub;
    reviveShow({ k, why, free: (S.freeReviveAt || 0) <= net.now(), cost: CFG.reviveGems || 5, until: net.now() + (CFG.reviveOffer || 120) * 1000, ads: BX.adsAvailable(), count: deathCount, stage: stageName(S.world || 0, k), hazard: WORLDS[S.world || 0].hazard2 });
    reviveCount(deathCount);
    adShown = '';
    BX.gameplayEnd();
}
// the death screen goes (respawned, or something else took over: a race, a world switch, a rebirth); never respawns you by itself
function endDeath(respawned) {
    if (death && death.unsub) { try { death.unsub(); } catch (e) { /* gone */ } }
    if (death && !respawned) BX.deathHide();
    death = null; deathBusy = false; deathAsk = null; clearTimeout(deathAskT);
    reviveHide();
    if (P.dead) { P.dead = false; if (running && !A) { if (anyPopup()) adNow('panel'); else { adNow(); BX.gameplayStart(); } } }
}
// a revive asked for: the server answers 'revived' (or 'broke' / 'adfail'). No answer in 5 s (its offer gone, a message lost while
// the connection came back): asked once more; still none: back to Home Row (Boxity's death screen was let go when it was asked)
let deathAsk = null, deathAskT = 0;
function askRevive(type, msg) {
    deathAsk = { type, msg, tries: 1 };
    net.send(type, msg);
    clearTimeout(deathAskT);
    deathAskT = setTimeout(reviveWatch, 5000);
}
function reviveWatch() {
    if (!P.dead || !deathBusy || !deathAsk) return;
    if (deathAsk.tries < 2 && deathAsk.type === 'revive') { deathAsk.tries++; net.send(deathAsk.type, deathAsk.msg); deathAskT = setTimeout(reviveWatch, 5000); return; }
    toast('📶 No answer from the server: back to Home Row', '#ffe24a');
    net.send('respawn', {});
    toHome();
}
// a button on the card: only once Boxity's countdown is over (respawn() says so); false: not yet
function deathGo() {
    if (!death || deathBusy) return false;
    if (!death.respawn()) return false;
    return true;
}
// the bubble round you while it lasts (fading out at its end)
let shieldOn = false;
function updateShield(t) {
    const left = P.shieldUntil - t;
    if (left > 0 && !A) { shieldOn = true; shieldFx(P.vx, P.vy + 2.8, P.vz, Math.min(1, left / 0.5), t, 4.2); }
    else if (shieldOn) { shieldOn = false; shieldFx(0, 0, 0, 0); }
}

// ----- the guide: chevrons on the ground, flowing from you to what to do next -----
const GUIDE_N = 12;
let guide = null, guideOn = false;
const guideM = new T.Matrix4(), guideQ = new T.Quaternion(), guideV = new V3(), guideS = new V3(1, 1, 1), guideUp = new V3(0, 1, 0);
function guideMesh() {
    const s = new T.Shape();
    s.moveTo(-2.2, -1); s.lineTo(0, 0.8); s.lineTo(2.2, -1); s.lineTo(2.2, 0.2); s.lineTo(0, 2); s.lineTo(-2.2, 0.2); s.closePath();
    const g = new T.ShapeGeometry(s).rotateX(-Math.PI / 2);
    const m = new T.InstancedMesh(g, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false }), GUIDE_N);
    m.frustumCulled = false; m.renderOrder = 2; m.count = 0;
    scene.add(m);
    return m;
}
function bestPost() {
    let best = 0;
    for (let i = 0; i < POSTS.length; i++) if (postOpen(S, i) && POSTS[i].mult >= POSTS[best].mult) best = i;
    return best;
}
// the furthest stage you've reached in this world (where TO STAGE and the Teleport's last stop go)
const frontier = () => Math.max(0, Math.min(WALLS_N - 1, (S.bests && S.bests[S.world || 0]) || 0));
// short of Speed for the stage ahead (well under its Recommended Speed): a while on a Power Key first
function needTraining() {
    const k = frontier();
    return k > 0 && speedNow() < recSpeed(S.world || 0, k) * 0.85;
}
function guideTarget() {
    const g = guideGoal(), b = P.b;
    if ((b.z > 54) !== (g.z > 54)) {
        if (b.z > 54) { if (Math.abs(b.x) > 13) return { x: 0, z: 56 }; } else if (b.z >= W.plaza.z0 - 6) return { x: clamp(b.x, -9, 9), z: 56 };
    }
    // through the Sprintway's gate beside the drain, never across it
    if (b.z > ZONES[0].z1 - 1 && g.z < ZONES[0].z1 && Math.abs(b.x) < 12.5) return { x: g.x >= 0 ? 14 : -14, z: Math.max(b.z, 37) };
    return g;
}
function guideGoal() {
    const b = P.b, Q = QUESTS[S.qi];
    if (b.z < W.plaza.z0) {
        // on the Sprintway: the side of the next wide keyboard (at the top, the portal to the next world)
        const Z = zoneAt(b.z, 0), N = Z ? ZONES[Z.idx + 1] : nextZone(b.z), sd = b.x >= 0 ? 1 : -1;
        if (!N) return { x: endPortal.x, z: endPortal.z };
        return { x: sd * (RUN.safeX + 3.5), z: N.z0 + 3 };
    }
    if (Q && Q.kind === 'matches') return { x: playGate.x, z: playGate.z + 6 };
    if (Q && Q.kind === 'upgrades' && UPGRADES.some((u) => S.wins >= upgradeCost(u, (S.ups && S.ups[u.id]) || 0))) return { x: tongueBar.x, z: tongueBar.z + 8 };
    if (Q && Q.kind === 'hatch' && S.wins >= JAWBREAKERS[0].wins) { const s = jbSpot(0); return { x: s.x, z: s.z + 5 }; }
    if (needTraining()) { const s = postSpot(bestPost()); return { x: s.x, z: s.z }; }
    return { x: 14, z: wallZ(0) - 6 };
}
function updateGuide(t) {
    if (!guide) guide = guideMesh();
    const b = P.b;
    const on = !A && !switching && !anyPopup() && !(P.tread >= 0 && needTraining()) && !P.dead && (S.clicks || 0) < 5000;
    const g = on ? guideTarget() : null;
    if (!g) { if (guideOn) { guideOn = false; guide.count = 0; guide.visible = false; } return; }
    const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz);
    if (d < 7) { guide.count = 0; guide.visible = false; guideOn = false; return; }
    guideOn = true; guide.visible = true;
    const ux = dx / d, uz = dz / d, gap = 6, off = (t * 11) % gap, y = (b.onGround ? b.y : P.groundY) + 0.42;
    guideQ.setFromAxisAngle(guideUp, Math.atan2(ux, uz) + Math.PI);
    let n = 0;
    for (let i = 0; i < GUIDE_N; i++) {
        const s = 3 + i * gap + off;
        if (s > d - 2) break;
        const fade = Math.min(1, (d - 2 - s) / 3) * Math.min(1, (s - 1) / 2);
        guide.setMatrixAt(n++, guideM.compose(guideV.set(b.x + ux * s, y, b.z + uz * s), guideQ, guideS.setScalar(Math.max(0.05, fade))));
    }
    guide.count = n;
    guide.instanceMatrix.needsUpdate = true;
}
// the stage you're in, at the top of the screen: its name, how far through it to its gate, its Recommended Speed when you're under it
let stageNameK = -1, stageNameS = '', stageTxtS = '';
function stageHud() {
    const b = P.b;
    if (A || b.z > W.plaza.z0 + 2) { stageBar(false); return; }
    const k = stageAt(b.z), w = S.world || 0;
    if (k < 0 || k >= WALLS_N) { stageBar(false); return; }
    const z0 = wallZ(k), z1 = wallZ(k + 1), f = clamp((z0 - b.z) / (z0 - z1), 0, 1), rec = recSpeed(w, k), low = speedNow() < rec;
    // (the words made again only when the stage or your Speed against it changes)
    const nk = w * 1000 + k * 2 + (low ? 1 : 0);
    if (nk !== stageNameK) { stageNameK = nk; stageNameS = 'STAGE ' + (k + 1) + ' · ' + stageName(w, k); stageTxtS = low ? 'Recommended Speed ' + fmt(rec) : k + 1 < WALLS_N ? 'to the next checkpoint!' : 'to the finish!'; }
    stageBar(true, stageNameS, f, ballHint || stageTxtS, low || ballDanger, k);
}
// =====================================================================================
// Ball Rush: the queue, the start line, your race
// =====================================================================================
let qaMap = null;
function pressPlay() {
    if (A || switching || P.dead) return;
    if (S.queued) { net.send('unplay', {}); return; }
    sfx('queue');
    flushClicks();
    net.send('play', qaMap || {});
}
actions.pressPlay = pressPlay;
let enteringMatch = false;
async function enterMatch(m) {
    enteringMatch = true;
    switching = true;
    holdFpsWatch(6);
    closeTop(); closeTop();
    endDeath(false);
    S.queued = false; queueState(null);
    flushClicks();
    await fadeOut();
    if (A) leaveMatchView();
    const plan = arenaPlan(m.seed, m.lv);
    A = { id: m.id, seed: m.seed, lv: m.lv, w: m.w, plan, spot: m.spot, power: m.power, phase: 'wait', goAt: m.goAt, endsAt: 0, scores: [], names: m.names || [], found: m.found, D: matchInfo(m.lv), done: false, sent: false, out: false, items: {}, countShown: -1 };
    S.matchId = m.id;
    P.tread = -1; P.boostUntil = -9; P.stunUntil = -9; P.dead = false; P.shieldUntil = -9; P.rWait = true; P.rLast = null; P.bonkT = -9;
    if (view) view.group.visible = false;
    try {
        A.view = buildArena(plan, m.w, SPOT_COL, getQuality() === 'low', m.spot);
        P.world = arenaPhysics(m.spot, plan);
        setMood(WORLDS[m.w].mood, true);
        setFogScale(1);
        for (const r of remotes.values()) r.char.setVisible(false);
        await drawHidden(A.view.group);
        const t0 = performance.now();
        while (avatarsPending() && performance.now() - t0 < 1500) await sleep(30);
    } catch (e) { console.error('[race]', e); noteError('[race] ' + (e && e.message)); }
    switching = false; enteringMatch = false;
    teleport(m.x, 0, m.z, m.ry);
    fadeIn();
    document.body.classList.add('inmatch');
    matchHud({ on: true, names: A.names, spot: A.spot, lv: A.lv, map: WORLDS[A.w].name });
    if (!anyPopup()) adNow();
    setScores(A);
    setMusicMode('climb');
    A.music = 0; setMusicIntensity(0);
    if (pendingSync && pendingSync.start.id === A.id) applySync(pendingSync);
    pendingSync = null;
}
// back from a dropped connection into a race: the clock, who's where, as they are now
let pendingSync = null;
function applySync(m) {
    if (m.phase === 'play') { A.phase = 'play'; A.endsAt = m.endAt; showCount(null); } else if (m.phase === 'done') A.phase = 'done';
    A.scores = m.lanes || [];
    const mine = A.scores.find((r) => r[0] === A.spot);
    if (mine && mine[3]) A.out = true;
    for (const i of m.items || []) A.items[i] = 1;
    setScores(A);
}
function leaveMatchView() {
    if (A && A.view) A.view.dispose();
    A = null; S.matchId = 0;
}
async function leaveMatch(m, results) {
    if (!A) return;
    switching = true;
    // (a question still open, "Leave the race?" say, has nothing left to ask)
    closeTop(); closeTop();
    await fadeOut();
    leaveMatchView();
    document.body.classList.remove('inmatch');
    matchHud({ on: false }); showCount(null); stageBar(false);
    $('#veil').style.opacity = '0';
    if (view) view.group.visible = true;
    if (m.w !== (view && view.w)) buildView(m.w); else updateGates(true);
    P.world = P.hub;
    setMood(WORLDS[m.w].mood, true);
    switching = false;
    teleport(m.x, 0, m.z, Math.PI);
    setMusicMode('plaza'); musicZoneNow = 'plaza';
    setMusicIntensity(1);
    fadeIn();
    if (results) matchResults(results); else if (!anyPopup()) adNow();
}
// the start line's count, the clock; the balls coming down your lane (the edges glow while you're in one's way)
const raceBalls = [];
function matchTick(dt) {
    const nowS = net.now();
    if (A.phase === 'wait') {
        const left = Math.ceil((A.goAt - nowS) / 1000);
        if (left !== A.countShown) { A.countShown = left; showCount(left > 0 ? String(left) : null); if (left > 0 && left <= 3) sfx('tick3'); }
        cam.yaw += (0 - cam.yaw) * (1 - Math.exp(-(dt || 0.016) * 5.5));
        // the gun's message has had a second to get here and hasn't: the clock says it went
        if (nowS > A.goAt + 1000) { A.phase = 'play'; A.endsAt = A.goAt + A.D.secs * 1000; if (!anyPopup()) adNow(); }
    } else if (A.phase === 'play') {
        const left = Math.max(0, Math.ceil((A.endsAt - nowS) / 1000));
        if (left !== A.leftShown) { A.leftShown = left; matchHud({ left }); if (left <= 5 && left > 0) sfx('tick3'); }
    }
    const b = P.b, t = clockT;
    if (A.view) A.view.update(nowS / 1000, b.z);
    // the nearest ball coming at you down your lane: its rumble, the ground shaking, the edges glowing while you're in its line
    laneBalls(A.plan, nowS / 1000, b.z - 120, b.z + 30, raceBalls);
    let ahead = 1e9, near = 1e9;
    for (const zb of raceBalls) { const d = b.z - zb; if (Math.abs(d) < near) near = Math.abs(d); if (d > -ARENA.r * 0.5 && d < ahead) ahead = d; }
    if (near < 34 && A.phase === 'play' && !A.done) { const kk = 1 - near / 34; shake = Math.max(shake, 0.16 * kk * kk); if (t - (A.rollT || 0) > 0.26) { A.rollT = t; if (!window.__noStepSound) playAsmr('thud', 0.08 + 0.3 * kk * kk, 0.62 + RND() * 0.08); } }
    const inLine = Math.abs(b.x - laneX(A.spot)) < ARENA.safe, eta = ahead < 1e8 ? Math.max(0, ahead - ARENA.r) / A.plan.balls.v : 9;
    const vk = A.done || A.phase !== 'play' || !inLine ? 0 : clamp(1 - (eta - 0.2) / 1.2, 0, 1) * 0.7;
    if (Math.abs(vk - (A.veil ?? -1)) > 0.03) { A.veil = vk; $('#veil').style.opacity = vk.toFixed(2); }
    // the music builds: calm on the line, the full chase at the gun, everything when the clock's nearly out
    const mk = A.phase !== 'play' || A.done ? (A.phase === 'wait' ? 0 : 1) : (A.leftShown !== undefined && A.leftShown <= 10) || vk > 0.4 ? 2 : 1;
    if (mk !== A.music) { A.music = mk; setMusicIntensity(mk); }
    void dt;
}
// what's in your lane: a ball (it knocks you back to the pocket behind you), a boost, the portal
function raceBonk(sp) {
    const b = P.b, t = clockT;
    P.stunUntil = t + 1.0; P.bonkT = t;
    if (!window.__noFloat) floatText('BONK!', '#ff9a8a', FX.tmpV.set(b.x, b.y + 7, b.z), 5, true);
    playAsmr('smash', 0.7, 0.85); rumble(0.7, 200); shake = Math.max(shake, 0.5);
    if (me) me.squash(1);
    teleport(sp.x, 0, sp.z, Math.PI);
}
function raceTouch(t) {
    const b = P.b, cx = laneX(A.spot), plan = A.plan;
    if (A.phase !== 'play' || A.out || A.done) return;
    const nowS = net.now() / 1000;
    for (let i = 0; i < plan.obs.length; i++) {
        const o = plan.obs[i];
        if (o.kind !== 'boost' || A.items[i] || Math.abs(b.z - o.z) > 4 || Math.hypot(b.x - (cx + o.x), b.z - o.z) > MATCH.r) continue;
        A.items[i] = 1;
        net.send('mItem', { i });
        P.boostUntil = t + MATCH.boostSecs;
        playAsmr('boost', 0.6, 1);
        bigText('BOOST!', '#7dff6b');
        fovKick = Math.max(fovKick, 5);
    }
    if (t > (P.bonkT ?? -9) + 1.2 && laneBallHit(plan, b.x - cx, b.y, b.z, nowS)) {
        const sp = backSpot(plan, A.spot, b.z);
        flushClicks(); net.send('mHit', { z: b.z });
        raceBonk(sp);
        return;
    }
    if (!A.sent && b.z <= plan.finish + 4) { A.sent = true; flushClicks(); sendMove(true); net.send('mFinish', {}); }
}

// =====================================================================================
// The QA autopilot: plays the loop by itself (trains, buys, runs the Rift, takes its pads; in a race, runs for the end)
// =====================================================================================
let pilotBuyAt = 0;
// the autopilot in a race: on the line or out in a pocket, wait for the way up to the next pocket to clear; then up the lane's middle,
// ducking into the next pocket when the way on isn't clear
function pilotRace(b) {
    const plan = A.plan, cx = laneX(A.spot), nowS = net.now() / 1000, v = Math.max(8, P.v) * 0.95;
    const Pk = pocketAt(plan, b.z, 0), N = nextPocket(plan, Pk ? Pk.z0 + 0.5 : b.z), zTo = N ? N.z1 - 3 : plan.finish + 2;
    if (clockT < (P.stunUntil || 0)) { P.rWait = true; return { stop: true }; }
    if (P.rWait !== false) {
        const tx = Pk ? cx + Pk.side * (ARENA.safe + 2.2) : cx;
        if (Math.abs(b.x - tx) > 0.7) return { x: tx, z: b.z, side: true };
        if (laneRunClear(plan, nowS, b.z, zTo, v)) { P.rWait = false; P.rLast = Pk; return { x: cx, z: zTo }; }
        return { stop: true };
    }
    if (Pk && Pk !== P.rLast && b.z < Pk.z1 - 1.5) { P.rLast = Pk; if (!laneRunClear(plan, nowS, b.z, zTo, v)) { P.rWait = true; return { x: cx + Pk.side * (ARENA.safe + 2.2), z: b.z, side: true }; } }
    return { x: cx, z: zTo };
}
// the autopilot on the Sprintway: out to the side of each wide keyboard (a few studs in from its north edge), wait there until the way
// to the next one is clear (shared/world.js runClear, at its own pace), then run for it up its side of the path and step out to the
// side as it gets there. Waiting half a minute with the way never clear: too slow for this stage, back to Home Row to train
function pilotBall(b, t) {
    const nowS = net.now() / 1000, out = RUN.safeX + 3.5;
    if (!P.pSide) P.pSide = b.x >= 0 ? 1 : -1;
    const side = P.pSide;
    if (P.pGo != null) {
        const G = ZONES[P.pGo];
        // (there, or a run that's behind it now: over)
        // (its wait for the next run starts now)
        if (!G || G.z1 < b.z - 400 || G.z0 > b.z + 2 || (b.z <= G.z0 + 4.5 && Math.abs(b.x) > RUN.safeX + 0.5)) { P.pGo = null; P.pWaitT = t; }
        else return { x: b.z < G.z1 + 4 ? side * out : side * 3, z: G.z0 + 3 };
    }
    // (through the gate from Home Row: round the drain on its side, then out to the first checkpoint's north end)
    const first = ZONES[0];
    if (b.z > first.z1 - 1) return Math.abs(b.x) < 12.5 ? { x: side * 14, z: Math.max(b.z, 37) } : { x: side * out, z: first.z0 + 3 };
    const Z = zoneAt(b.z, 0.5);
    if (!Z) { const N = nearZone(b.z); return { x: side * 3, z: N ? (b.z > N.z1 ? N.z1 - 3 : N.z0 + 3) : b.z }; }
    const N = ZONES[Z.idx + 1];
    if (!N) return { x: endPortal.x, z: endPortal.z + 0.5 };
    const spot = { x: side * out, z: Z.z0 + 3 };
    if (Math.hypot(b.x - spot.x, b.z - spot.z) > 1.6) { P.pWaitT = t; return spot; }
    if (runClear(nowS, b.z, N.z1 - 5, P.v * 0.95)) { P.pGo = N.idx; P.pWaitT = t; return { x: side * 3, z: N.z0 + 3 }; }
    if (t - (P.pWaitT ?? t) > 30) { P.pWaitT = t; goTo('spawn'); }
    return { x: spot.x, z: spot.z, stop: true };
}
function pilot() {
    const o = { mx: 0, mz: 0, jump: false, hold: false }, b = P.b, t = clockT;
    if (switching || anyPopup()) return o;
    let tgt = null;
    if (A) {
        if (A.phase !== 'play' || A.out || A.done) { P.rWait = true; return o; }
        const a = pilotRace(b);
        if (a.stop) return o;
        tgt = a;
        P.pilotDash = false;
    } else if (view) {
        // knocked out: back into the stage (a revive) as a player would, or back to Home Row when it can't pay
        if (reviveOpen() && t - (P.pilotRv || -9) > 1.5) { P.pilotRv = t; if ((S.freeReviveAt || 0) <= net.now() || (S.gems || 0) >= (CFG.reviveGems || 5)) actions.revive(); else actions.giveUp(); }
        if (t > pilotBuyAt) {
            pilotBuyAt = t + 1.2;
            if (rebirthPct(S) >= 100 && b.z > W.plaza.z0) net.send('rebirth', {});
            else if (QUESTS[S.qi] && QUESTS[S.qi].kind === 'hatch' && S.wins >= JAWBREAKERS[0].wins) net.send('hatch', { j: 0, n: 1 });
            else if (QUESTS[S.qi] && QUESTS[S.qi].kind === 'upgrades') { const u = UPGRADES.find((x) => S.wins >= upgradeCost(x, (S.ups && S.ups[x.id]) || 0)); if (u) net.send('upgrade', { id: u.id }); }
            else if (QUESTS[S.qi] && QUESTS[S.qi].kind === 'trail' && S.wins >= 15) net.send('trail', { i: 1 });
            else if (S.wins >= JAWBREAKERS[0].wins * 2 && (S.hatched || 0) < 5) net.send('hatch', { j: 0, n: 1 });
        }
        tgt = guideTarget();
        // on a Power Key: click away while it's short of Speed for the stage ahead
        if (P.tread >= 0 && needTraining()) { if (t - (P.pilotClickAt || -9) > 0.11) { P.pilotClickAt = t; doClick('btn'); } return o; }
        if (b.z < W.plaza.z0) {
            tgt = pilotBall(b, t);
            P.pilotDash = false;
            if (tgt && tgt.stop) return o;
        }
    }
    if (tgt) {
        const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz);
        // (heading up the Sprintway: mostly forward, steering to the side as it comes)
        if (d > 0.8) { if (b.z < W.plaza.z0 || A) { const sx = clamp(dx * 0.25, -1, 1), sz = dz < 0 ? -1 : 1; const l = Math.hypot(sx, sz); o.mx = sx / l; o.mz = sz / l; if (Math.abs(dz) < 2) { o.mx = dx / d; o.mz = dz / d; } } else { o.mx = dx / d; o.mz = dz / d; } }
        // in the air over where it means to land: ease off going forward (as a player does)
        if (o.brake) { o.mz = 0; o.mx = clamp(dx * 0.4, -1, 1); }
    }
    cam.yaw = A || b.z < W.plaza.z0 ? 0 : cam.yaw;
    return o;
}

// =====================================================================================
// The camera: close behind you (drag to turn, wheel / pinch to zoom); wider the faster you go
// =====================================================================================
const cam = { yaw: 0, pitch: 0.2, dist: isTouch ? 22 : 20 };
let camD = 18, camSens = 1, camSnap = true, shake = 0, fovKick = 0, speedFov = 0;
const dirV = new V3(), pivotV = new V3(), backV = new V3(), camPos = new V3(), lookV = new V3();
let pivotY = 5;
// (chaseCam: how far the camera has risen over something at your back; nothing chases you now, so 0. camFree: QA, the covers)
let chaseCam = 0, camFree = false;
function lookDir(out_) { const p = cam.pitch + chaseCam * 0.3, cp = Math.cos(p); return out_.set(-Math.sin(cam.yaw) * cp, -Math.sin(p), -Math.cos(cam.yaw) * cp); }
const LZD = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZD).normalize(), LY = LZD.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZD, p.dot(LZD));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZD, 200);
}
const AX = [0, 1, 2], oA = [0, 0, 0], dA = [0, 0, 0];
function rayHit(o, d, maxT) {
    let best = maxT;
    oA[0] = o.x; oA[1] = o.y; oA[2] = o.z; dA[0] = d.x; dA[1] = d.y; dA[2] = d.z;
    for (const c of P.world.solids) {
        if (c.max[1] - c.min[1] < 3 || Math.max(c.max[0] - c.min[0], c.max[2] - c.min[2]) < 2.2) continue;
        // (a pillar right behind you doesn't pull the camera in front of your face: only what's taller than you are wide counts)
        if (Math.abs(c.min[2] - o.z) > 60 && Math.abs(c.max[2] - o.z) > 60) continue;
        let t0 = 0, t1 = best, miss = false;
        for (const a of AX) {
            if (Math.abs(dA[a]) < 1e-9) { if (oA[a] < c.min[a] || oA[a] > c.max[a]) { miss = true; break; } continue; }
            let ta = (c.min[a] - oA[a]) / dA[a], tb = (c.max[a] - oA[a]) / dA[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { miss = true; break; }
        }
        if (!miss && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}
function updateCamera(dt) {
    const b = P.b, portrait = VIEW.portrait;
    lookDir(dirV);
    const fx = P.vx, fz = P.vz, gy = (b.y + (P.vy - b.y) * 0.72) + 5.2;
    if (camSnap || (pivotV.x - fx) ** 2 + (pivotV.z - fz) ** 2 > 900) { pivotV.set(fx, gy, fz); pivotY = gy; camSnap = false; }
    else {
        const kx = 1 - Math.exp(-dt * 16);
        pivotV.x += (fx - pivotV.x) * kx; pivotV.z += (fz - pivotV.z) * kx;
        pivotY += (gy - pivotY) * (1 - Math.exp(-dt * (b.onGround ? 10 : 6)));
        pivotV.y = pivotY;
    }
    backV.copy(dirV).negate();
    let lim = cam.dist + chaseCam * 2.5 + (portrait ? 7 : 0) + Math.min(10, Math.max(0, b.y - P.groundY) * 0.08) + speedFov * 0.3;
    // (QA only, the store covers: camFree keeps the camera where it was asked, through whatever is in the way)
    if (!camFree) lim = Math.min(lim, rayHit(pivotV, backV, lim + 1) - 0.8);
    // the Rift's sides, a gate still shut, a race's outer rails: the camera stays on your side of them
    if (A) {
        const m = CFG.matchSpots * ARENA.laneW / 2 - 0.8;
        if (Math.abs(backV.x) > 1e-4) lim = Math.min(lim, (Math.sign(backV.x) * m - pivotV.x) / backV.x);
    } else if (pivotV.z - backV.z * -lim < W.plaza.z0 + 4 || pivotV.z < W.plaza.z0 + 4) {
        const m = W.halfW - 0.8;
        if (Math.abs(backV.x) > 1e-4 && pivotV.z + backV.z * lim < W.plaza.z0 + 4) lim = Math.min(lim, (Math.sign(backV.x) * m - pivotV.x) / backV.x);
        if (backV.z < -1e-4) lim = Math.min(lim, (lockBox.z - 0.4 - pivotV.z) / backV.z);
    }
    lim = Math.max(2, lim);
    camD = lim < camD ? lim : camD + (lim - camD) * (1 - Math.exp(-dt * 4));
    camPos.copy(pivotV).addScaledVector(backV, camD);
    { const cf = flY(camPos.z) + 0.8; if (camPos.y < cf) camPos.y = cf; }
    camera.position.copy(camPos);
    camera.lookAt(lookV.copy(camPos).addScaledVector(dirV, 30));
    if (shake > 0.001) { const s = shake * shake * 0.8; camera.position.x += (RND() * 2 - 1) * s; camera.position.y += (RND() * 2 - 1) * s; shake = Math.max(0, shake - dt * 2.4); }
    // every takeoff and dash widens the view a touch, easing back; and the faster you run, the wider it stays
    fovKick = Math.max(0, fovKick - dt * 9);
    const hv = Math.hypot(b.vx, b.vz), sfTarget = clamp((hv - 22) * 0.16, 0, 9);
    speedFov += (sfTarget - speedFov) * Math.min(1, dt * 2.5);
    const want = (portrait ? 86 : 70) + fovKick + speedFov;
    if (Math.abs(camera.fov - want) > 0.01) { camera.fov += (want - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    if (me) me.root.visible = camD > 2.2;
}

// =====================================================================================
// Input
// =====================================================================================
const keys = {};
const touchMove = { x: 0, y: 0 };
let running = false, touchJump = false;
actions.onPanel = (open, kind) => {
    for (const k in keys) keys[k] = false; touchJump = false; P.holdDash = false;
    // (knocked out: Boxity's death screen is what's up; endDeath reports play again)
    if (!running || P.dead) return;
    if (open) { adNow(kind === 'results' ? 'results' : 'panel'); BX.gameplayEnd(); } else { adNow(); BX.gameplayStart(); }
};
// which of the declared screens is up now (Boxity puts its banners round it; gameplay has none: the developer's choice).
// A knocked-out player's death screen draws over these
let adShown = '';
function adNow(kind) {
    const k = kind || (A && A.phase === 'wait' ? 'lobby' : 'gameplay');
    if (k === adShown) return;
    adShown = k;
    BX.adScreen(k);
}
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); if (e.key === 'Escape') closeTop(); return; }
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!running) return;
    if (e.code === 'Escape' && !e.repeat) { if (closeTop()) return; if (BX.isEmbedded()) BX.showPortalMenu(); else openPanel('settings'); return; }
    keys[e.code] = true;
    if (e.repeat || anyPopup()) return;
    if (e.code === 'Space') P.jumpPress = clockT;
    // (E: a click; F: the revive offer first, while it's up, else what you're next to)
    if (e.code === 'KeyE' && !A) doClick('key');
    if (e.code === 'KeyF') { if (!A && reviveOpen()) actions.revive(); else if (activePrompt) usePrompt(); }
    if (e.code === 'KeyR' && reviveOpen()) { actions.giveUp(); return; }
    if (e.code === 'Enter' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash();
    if (e.code === 'KeyM') actions.toggleSound();
    if (A) return;
    if (e.code === 'KeyR') goTo('spawn');
    if (e.code === 'KeyB') goStage();
    if (e.code === 'KeyQ') openPanel('quests');
    if (e.code === 'KeyC') openPanel('spin');
    if (e.code === 'KeyG') openPanel('shop');
    if (e.code === 'KeyT') openPanel('tele');
    if (e.code === 'KeyJ') openPanel('inv');
    if (e.code === 'KeyU') openPanel('work');
    // (never P: on CrazyGames it opens Boxity's pause menu)
    if (e.code === 'KeyV') pressPlay();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touchJump = false; drags.clear(); pinchD = 0; P.holdDash = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const drags = new Map();
let pinchD = 0, holdId = null;
canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!running || anyPopup()) return;
    canvas.setPointerCapture(e.pointerId);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, at: performance.now() });
    if (drags.size === 2) { const [a, b] = [...drags.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); P.holdDash = false; holdId = null; }
});
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) { d.moved = true; if (holdId === e.pointerId) { holdId = null; P.holdDash = false; } }
    if (drags.size === 2) {
        const [a, b] = [...drags.values()], nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) cam.dist = clamp(cam.dist * pinchD / Math.max(20, nd), 10, 46);
        pinchD = nd;
    } else if (d.moved) {
        const k = (e.pointerType === 'touch' ? 0.0068 : 0.0045) * camSens;
        cam.yaw -= (e.clientX - d.x) * k;
        cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.5, 1.3);
    }
    d.x = e.clientX; d.y = e.clientY;
});
// a quick tap on the world (no drag, the left button or a finger) is a click
const endDrag = (e) => { const d = drags.get(e.pointerId); if (d && !d.moved && e.type === 'pointerup' && drags.size === 1 && performance.now() - d.at < 450 && (e.pointerType !== 'mouse' || e.button === 0) && running && !anyPopup()) doClick('tap'); drags.delete(e.pointerId); if (drags.size < 2) pinchD = 0; if (holdId === e.pointerId) { holdId = null; P.holdDash = false; } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 10, 46); e.preventDefault(); }, { passive: false });
(function touchControls() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null, rect = null;
    const set = (e) => {
        const r = rect;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; rect = stick.getBoundingClientRect(); stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const jb = $('#jumpBtn'), wb = $('#lickBtn');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); jb.setPointerCapture(e.pointerId); P.jumpPress = clockT; touchJump = true; jb.classList.add('on'); });
    const jEnd = () => { touchJump = false; jb.classList.remove('on'); };
    jb.addEventListener('pointerup', jEnd); jb.addEventListener('pointercancel', jEnd);
    wb.addEventListener('pointerdown', (e) => { e.preventDefault(); wb.setPointerCapture(e.pointerId); wb.classList.add('on'); dash(); P.holdDash = true; });
    const wEnd = () => { wb.classList.remove('on'); P.holdDash = false; };
    wb.addEventListener('pointerup', wEnd); wb.addEventListener('pointercancel', wEnd);
    // the big CLICK button: a click on every press (pointerdown: as quick as a finger can tap, a second finger too); a keyboard or a
    // controller pressing it clicks as well
    const cb = $('#clickBtn');
    cb.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!running || anyPopup()) return; cb.classList.add('on'); doClick('btn'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) cb.addEventListener(ev, () => cb.classList.remove('on'));
    cb.addEventListener('click', (e) => { cb.blur(); if (e.detail === 0) doClick('btn'); });
})();

// A button: a click. A browser makes no click for a second finger, though, and a thumb on the stick is the first: then the lift of
// that finger is the tap.
let touchesDown = 0;
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchesDown++; }, true);
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => { if (e.pointerType === 'touch') touchesDown = Math.max(0, touchesDown - 1); }, true);
addEventListener('blur', () => { touchesDown = 0; });
function tapOn(el, fn) {
    let id = null, at = 0;
    el.addEventListener('pointerdown', (e) => { id = e.pointerType === 'touch' && touchesDown > 1 ? e.pointerId : null; });
    el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== id) return;
        id = null;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { at = performance.now(); fn(); }
    });
    el.addEventListener('pointercancel', () => { id = null; });
    el.addEventListener('click', () => { if (performance.now() - at > 700) fn(); });
}
actions.tapOn = tapOn;
// ----- proximity prompts (the Upgrades, the Rebirth booth, the portal, the race gate, an Egg, a Power Key with a price) -----
let activePrompt = null, promptX = -1, promptY = -1;
const pv = new V3();
function updatePrompt() {
    let best = null, bd = 1e9;
    const b = P.b;
    if (!A && !anyPopup() && b.y < 6 && b.z > W.plaza.z0 - 4) for (const p of prompts) { if (p.on && !p.on()) continue; const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z); if (d < p.r && d < bd) { bd = d; best = p; } }
    activePrompt = best;
    const el = $('#promptBtn');
    if (!best) { if (!el.hidden) el.hidden = true; return; }
    pv.copy(best.pos).setY(best.pos.y + 6).project(camera);
    if (pv.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    const lbl = best.label();
    if ($('#promptTxt').textContent !== lbl) $('#promptTxt').textContent = lbl;
    const px = Math.round(clamp((pv.x + 1) / 2, 0.24, 0.76) * VIEW.w), py = Math.round(clamp((1 - pv.y) / 2, 0.24, 0.74) * VIEW.h);
    if (px !== promptX || py !== promptY) { promptX = px; promptY = py; el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -110%)`; }
}
function usePrompt() { if (activePrompt) { sfx('click'); activePrompt.act(); } }
tapOn($('#promptBtn'), usePrompt);

// ----- controller -----
let padMode = false, padSeen = 0, padTipsShown = false, padMenu = false, padHud = false;
function setPadMode(on) {
    if (padMode === on) return;
    padMode = on;
    document.body.classList.toggle('pad', on);
    $('#promptBtn').querySelector('kbd').textContent = on ? 'Y' : 'F';
    if (!on) { padNav.clear(); setPadMenu(false); }
    else if (running && !padTipsShown) { padTipsShown = true; showTips(); }
}
function setPadMenu(on) {
    if (padMenu !== on) { padMenu = on; document.body.classList.toggle('padmenu', on); }
    const h = on && padNav.hud && !anyPopup();
    if (padHud !== h) { padHud = h; document.body.classList.toggle('padhud', h); }
}
// a mouse, a key, a finger: the ring and the controller's hints get out of the way until the controller's used again
const padOff = () => { if (padMode) setPadMode(false); };
addEventListener('keydown', padOff, true);
addEventListener('pointerdown', padOff, true);
addEventListener('pointermove', (e) => { if (padMode && e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) padOff(); }, true);
onGamepadConnection((g, on) => {
    if (on) { toast('🎮 Controller ready!', '#7dff6b'); setPadMode(true); } else { toast('🎮 Controller disconnected', '#ffc27a'); setPadMode(false); }
});
const ZOOMS = [14, 20, 30];
function padButtons(dt) {
    if (!pad.connected) return;
    if (pad.lastUsed !== padSeen) {
        padSeen = pad.lastUsed;
        setPadMode(true);
        // a button on a controller doesn't count as a tap for the browser's sound rules everywhere
        if (pad.pressed.size && audioSuspended()) resumeAudio();
    }
    if (!running) return;
    const menu = padNav.frame(performance.now(), dt, padMode);
    setPadMenu(!!menu && padMode);
    if (!padMode) return;
    if (pad.pressed.has('START')) { if (!closeTop()) openPanel('settings'); return; }
    if (menu === 'back') { closeTop(); return; }
    if (menu) return;
    if (pad.pressed.has('A')) P.jumpPress = clockT;
    if (pad.pressed.has('X') || pad.pressed.has('RT') || pad.pressed.has('LT')) dash();
    // B or RB: a click (held B doesn't repeat: a press is a click)
    if (pad.pressed.has('B') || pad.pressed.has('RB')) doClick('key');
    for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT']) if (pad.pressed.has(d)) { padNav.enterHud(d); return; }
    if (pad.pressed.has('R3')) { const i = ZOOMS.findIndex((z) => z >= cam.dist - 0.5); cam.dist = ZOOMS[(i + 1) % ZOOMS.length] || ZOOMS[0]; }
    if (A) return;
    if (pad.pressed.has('Y')) { if (reviveOpen()) actions.revive(); else if (activePrompt) usePrompt(); else goStage(); }
    if (pad.pressed.has('LB')) pressPlay();
    if (pad.pressed.has('BACK')) openPanel('quests');
    if (pad.pressed.has('L3')) goTo('spawn');
}

// =====================================================================================
// Everyone else in your world or your race (smoothed on the server's clock)
// =====================================================================================
const remotes = new Map();
const smp = { x: 0, y: 0, z: 0, ry: 0, a: 0, speed: 0 };
class Remote {
    constructor(p, id) {
        this.id = id;
        this.char = new Char({ name: p.name, lv: p.lv, tr: p.title });
        this.char.setAvatar(p.av);
        this.av = p.av; this.track = new Track(); this.air = false; this.prevY = p.y; this.vy = 0; this.minVy = 0; this.here = false;
        this.team = new Team(); this.shoe = -1; this.p = p; this.clk = p.clk;
    }
    update(p, dt, t) {
        this.p = p;
        this.track.push(p.t, p.x, p.y, p.z, p.ry, p.anim);
        const matchNow = A ? A.id : 0;
        this.here = p.match === matchNow && (matchNow > 0 || p.world === S.world);
        if (!this.here || switching) { this.char.setVisible(false); this.onGround = false; return; }
        const rt = net.now() - this.track.delayFor(dt);
        if (!this.track.sample(rt, smp, dt)) { smp.x = p.x; smp.y = p.y; smp.z = p.z; smp.ry = p.ry; smp.a = p.anim; smp.speed = 0; }
        // past a gate that's shut for you, in your world: out of sight anyway, the barrier's in the way
        const behind = !A && smp.z < lockBox.z - 8;
        const air = smp.a === 2, vy = dt > 0 ? (smp.y - this.prevY) / dt : 0;
        this.vy += (vy - this.vy) * Math.min(1, dt * 12);
        if (air) this.minVy = Math.min(this.minVy, this.vy);
        if (this.air && !air) { this.char.squash(0.6); this.minVy = 0; }
        if (!this.air && air && this.vy > 3) this.char.stretch(0.5);
        this.air = air; this.prevY = smp.y;
        if (p.av !== this.av) { this.av = p.av; this.char.setAvatar(p.av); }
        if (p.shoe !== this.shoe && this.char.setShoe) { this.shoe = p.shoe; this.char.setShoe(p.shoe); }
        // (their tag, when something on it has changed)
        const raceId = A ? A.id : 0;
        // (their Speed on it: once a second at most, and only when its two figures change)
        if (p.name !== this.tagName || p.title !== this.tagTr || raceId !== this.tagRace || (p.sp !== this.tagSp && t - (this.tagAt || -9) > 1)) { this.tagAt = t; this.tagSp = p.sp; this.tagName = p.name; this.tagTr = p.title; this.tagRace = raceId; this.char.setLabel(p.name, p.sp, p.title, A ? SPOT_CSS[A.names.find((n) => n.n === p.name)?.spot ?? 0] : undefined); }
        this.char.setTrail(p.trail); this.char.setAura(p.aura);
        // (right up against the camera a rival would fill the screen and hide you: they aren't drawn there)
        const d2 = camera.position.distanceToSquared(FX.tmpV.set(smp.x, smp.y + 3, smp.z)), near = !behind && d2 < (lowQ ? 150 * 150 : 240 * 240) && d2 > 64;
        this.char.setVisible(near);
        if (near) {
            this.char.fitLabel(Math.sqrt(d2));
            const far = d2 > 90 * 90;
            // on a Power Key: its key goes down as their clicks come in
            const onKey = p.post !== 255 && p.anim === 3 && !A;
            if (onKey && p.clk !== this.clk && view && view.pressKey && d2 < 120 * 120) view.pressKey(p.post, 0.8);
            this.clk = p.clk;
            const x = smp.x, y = smp.y, z = smp.z, ry = smp.ry;
            const down = smp.a === 4, spd = smp.speed;
            const q = remSt; q.x = x; q.y = y; q.z = z; q.ry = ry; q.air = air; q.moving = (smp.a === 1 || smp.speed > 2) && !down; q.speed = spd; q.vy = this.vy; q.far = far; q.pose = down ? 'down' : null; q.lick = 0; q.sprint = spd > 30;
            this.char.update(dt, t, q);
            if (!far && !A) { this.team.set(p.team); this.team.update(dt, t, smp.x, smp.y, smp.z, this.char.root.rotation.y, q.moving); }
            if (!far && q.moving && !q.air && d2 < 60 * 60 && t - (this.sndT || -9) > 0.28) {
                this.sndT = t;
                const onJ = !!A || z < W.plaza.z0 || onJellyBed(x, z);
                if (onJ) jellyHit(x, z, 0.7);
                if (d2 < 40 * 40) playAsmr(onJ ? 'step' : 'crunch', 0.12 * (1 - Math.sqrt(d2) / 45), 0.95 + RND() * 0.2, panOf(x, z));
            }
            this.x = x; this.y = y; this.z = z;
        }
        this.onGround = !air;
    }
    dispose() { this.char.dispose(); }
}
const seenIds = new Set();
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    seenIds.clear();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) { if (S.name !== p.name) { S.name = p.name; if (me) me.setLabel(S.name, speedNow(), titleOf(S.cleared)); } return; }
        seenIds.add(id);
        let r = remotes.get(id);
        if (!r) { r = new Remote(p, id); remotes.set(id, r); }
        r.update(p, dt, t);
    });
    for (const [id, r] of remotes) if (!seenIds.has(id)) { r.dispose(); remotes.delete(id); }
}

// =====================================================================================
// HUD buttons
// =====================================================================================
let switching = false;
// (the button lets go of the keyboard: SPACE jumps, it never presses the last button clicked again)
const bind = (sel, fn) => { const el = $(sel); tapOn(el, () => { sfx('click'); el.blur(); fn(); }); };
// the left column's big buttons
bind('#bRebirth', () => openPanel('rebirth'));
bind('#bWork', () => openPanel('work'));
bind('#bPals', () => openPanel('inv'));
bind('#bTele', () => openPanel('tele'));
bind('#bSound', () => actions.toggleSound());
bind('#bTread', () => actions.toTread());
let treadAskAt = -9;
actions.toTread = () => { if (A || P.dead) return; treadAskAt = clockT; goTo('post'); toast('⌨️ To your best Power Key!', '#7af4ff'); };
bind('#autoBtn', () => actions.toggleAuto());
bind('#bSpeed', () => openPanel('shop', 'speed'));
// the round ones up top
bind('#bQuests', () => openPanel('quests'));
bind('#bDaily', () => openPanel('daily'));
bind('#bSpin', () => openPanel('spin'));
bind('#bCodes', () => openPanel('shop', 'codes'));
bind('#bSettings', () => openPanel('settings'));
// the right column, top right
bind('#bShop', () => openPanel('shop'));
bind('#bX2', () => { if (S.x2) { toast('⚡ 2X SPEED is on: ' + Math.ceil(((S.x2Until || 0) - net.now()) / 60000) + ' min left', '#7dff6b'); return; } askConfirm('⚡', '2X SPEED', 'Double Speed from every click for ' + CFG.boostP2Mins + ' minutes' + (BX.adsAvailable() ? ' (or ' + CFG.adX2Mins + ' minutes for a short ad)' : '') + '.', '💎 ' + CFG.boostP2Gems, () => net.send('x2', {}), BX.adsAvailable() ? { label: '▶ FREE', act: () => actions.adX2() } : null); });
bind('#bGift', () => openPanel('gifts'));
bind('#bPlay', () => pressPlay());
// x2 WINS (Gems), STATS, the bar's + (Upgrades), the three +SPEED buttons (Gems), SKIP the stage you're in (Gems)
bind('#bW2', () => { if ((S.w2Until || 0) > net.now()) { toast('🏆 x2 WINS is on: ' + Math.ceil(((S.w2Until || 0) - net.now()) / 60000) + ' min left', '#7dff6b'); return; } askConfirm('🏆', 'x2 WINS', 'Double the Wins from every checkpoint for ' + CFG.boostW2Mins + ' minutes.', '💎 ' + CFG.boostW2Gems, () => net.send('w2', {})); });
bind('#bStats', () => openPanel('stats'));
bind('#bLvPlus', () => openPanel('work'));
bind('#bSkip', () => { if (A || P.dead) return; askConfirm('⏩', 'SKIP THIS STAGE?', 'Jump straight past this stage\'s gate (it pays no Wins).', '💎 ' + (CFG.skipGems || 8), () => net.send('skip', {}), BX.adsAvailable() ? { label: '▶ FREE', act: () => actions.adSkip() } : null); });
bind('#questLine', () => openPanel('quests'));
bind('#winsBox', () => openPanel('boards'));
bind('#gemsBox', () => openPanel('shop'));
bind('#rvBtn', () => actions.revive());
bind('#rvAd', () => actions.adRevive());
bind('#rvHome', () => actions.giveUp());
bind('#qCancel', () => net.send('unplay', {}));
bind('#bQuit', () => askConfirm('🏳️', 'Leave the race?', 'A bot takes your place and you get no prize.', 'Leave', () => net.send('quit', {})));
// Custom Speed: type a running speed (up to the top your Speed gives), OK or Enter. The keys go to the box, never to your feet; a phone
// shows its number pad
(function customSpeed() {
    const box = $('#csIn');
    const apply = (quiet) => {
        const v = parseInt(box.value, 10), top = maxWalk(S);
        if (!isFinite(v)) { updateHud(); return; }
        const c = clamp(v, 8, Math.floor(top));
        // (your top speed: 0, so it keeps up with your Speed)
        S.cs = c >= Math.floor(top) ? 0 : c;
        storageSet('ks1_cs', String(S.cs));
        box.value = String(Math.round(walkTop()));
        updateHud();
        if (quiet === true) return;
        toast('🏃 Running speed: ' + Math.round(walkTop()) + (S.cs ? '' : ' (your max)'), '#7af4ff');
    };
    box.addEventListener('focus', () => { for (const k in keys) keys[k] = false; touchJump = false; P.holdDash = false; box.select(); });
    box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { apply(); box.blur(); } else if (e.key === 'Escape') { box.blur(); updateHud(); } });
    box.addEventListener('input', () => { const d = box.value.replace(/\D/g, '').slice(0, 3); if (d !== box.value) box.value = d; });
    box.addEventListener('change', apply);
    tapOn($('#csOk'), () => { sfx('click'); apply(); box.blur(); });
    // − / + (touch screens): a step a tap, held it keeps going; applied at once, the box shows the speed
    const step = (d) => { const top = Math.floor(maxWalk(S)), v = clamp((parseInt(box.value, 10) || Math.round(walkTop())) + d, 8, top); box.value = String(v); apply(true); sfx('tick'); };
    for (const [id, d] of [['#csDn', -1], ['#csUp', 1]]) {
        const el = $(id); let t0 = 0, t1 = 0;
        const stop = () => { clearTimeout(t0); clearInterval(t1); };
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); stop(); step(d); t0 = setTimeout(() => { t1 = setInterval(() => step(d), 70); }, 380); });
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, stop);
        el.addEventListener('click', (e) => { if (e.detail === 0) step(d); });
    }
})();
function goStage() {
    if (A || P.dead) return;
    if (S.inGauntlet) actions.toTread(); else goTo('stage', frontier());
}
function fadeOut() { $('#fade').style.opacity = 1; return sleep(260); }
function fadeIn() { $('#fade').style.opacity = 0; }
let showFps = false;
actions.fpsOn = () => showFps;
actions.toggleFps = () => { showFps = !showFps; $('#fps').hidden = !showFps; };
let boards = { wins: [], speed: [], race: [] };
actions.boards = () => boards;
actions.world = (w) => { if (w === S.world) { closeTop(); goTo('spawn'); return; } net.send('world', { w }); };
actions.toggleMusic = () => toggleMusic();
actions.toggleSound = () => { const on = toggleSound(); toast(on ? '🔊 Sound on' : '🔇 Sound off', '#7de8ff'); updateHud(); };
// the revive offer taken (the server says yes: 'revived'; no Gems: 'broke')
let reviveAskAt = -9;
actions.revive = () => {
    if (!reviveOpen() || A || deathBusy || deathCount > 0) return;
    const free = (S.freeReviveAt || 0) <= net.now(), cost = CFG.reviveGems || 5;
    // (short of Gems: say so here, before the death screen is let go)
    if (!free && (S.gems || 0) < cost) { sfx('denied'); toast('💎 Not enough Gems to revive: ' + (cost - (S.gems || 0)) + ' more', '#ff9a8a'); return; }
    if (!deathGo()) return;
    deathBusy = true; reviveAskAt = clockT;
    reviveBusy('Reviving…');
    askRevive('revive', {});
};
// a rewarded ad for a FREE revive: the server checks Boxity's token before it revives you
let adAsking = false;
actions.adRevive = async () => {
    if (!reviveOpen() || A || deathBusy || adAsking || deathCount > 0) return;
    if (!BX.adsAvailable()) { toast('No ad right now: try again later!', '#ff9a8a'); return; }
    adAsking = true;
    const r = await BX.showRewarded('revive');
    adAsking = false;
    if (!(r && r.status === 'completed' && r.rewardToken)) { toast('No ad was watched: try again later!', '#ff9a8a'); return; }
    if (!reviveOpen() || !deathGo()) return;
    deathBusy = true; reviveAskAt = clockT;
    reviveBusy('Reviving…');
    // (a reward token is good once: never sent twice; no answer and it's back to Home Row)
    askRevive('adrevive', { token: r.rewardToken });
};
// back to Home Row (the server has you there already)
actions.giveUp = () => {
    if (!reviveOpen() || deathBusy || deathCount > 0) return;
    if (!deathGo()) return;
    net.send('respawn', {});
    toHome();
};
function toHome() {
    endDeath(true);
    teleport(W.spawn.x, 0, W.spawn.z, Math.PI);
    P.shieldUntil = clockT + SHIELD;
    sfx('respawn');
}
// a FREE skip for an ad, x2 Speed for an ad (both granted on the server once Boxity's token checks out)
actions.adsOk = () => BX.adsAvailable();
actions.adSkip = async () => {
    if (A || P.dead || adAsking) return;
    if (!BX.adsAvailable()) { toast('No ad right now: try again later!', '#ff9a8a'); return; }
    adAsking = true;
    const r = await BX.showRewarded('skip-stage');
    adAsking = false;
    if (r && r.status === 'completed' && r.rewardToken) { flushClicks(); net.send('adskip', { token: r.rewardToken }); } else toast('No ad was watched: try again later!', '#ff9a8a');
};
actions.adX2 = async () => {
    if (adAsking) return;
    if (!BX.adsAvailable()) { toast('No ad right now: try again later!', '#ff9a8a'); return; }
    adAsking = true;
    const r = await BX.showRewarded('x2-speed');
    adAsking = false;
    if (r && r.status === 'completed' && r.rewardToken) net.send('adx2', { token: r.rewardToken }); else toast('No ad was watched: try again later!', '#ff9a8a');
};
actions.openBoard = (id) => { if (!BX.openLeaderboard(id || 'wins')) toast('The full leaderboards are on Bloxity', '#ffffff'); };
actions.myZ = () => P.b.z;
addEventListener('resize', () => measureHud());

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
// Hosted on Boxity: every connect resolves a pod through the Boxity matchmaker (never the fixed <id>.host route), a new Client from each
// answer, retried with a backoff while a server wakes up (up to a minute). Locally: the server that serves the page (or the dev server's
// game port). The page never works out where it is from its own address: Boxity tells it (BX.env()).
let relayId = '';
async function serverEndpoint() {
    if (BLOXITY_GAME_ID && BX.bloxity.available()) {
        const t0 = Date.now();
        let wait = 1200;
        while (Date.now() - t0 < 60000) {
            const r = await BX.resolveEndpoint(BLOXITY_GAME_ID);
            if (r && r.endpoint) { relayId = r.roomId || ''; if (r.cold) loadingText('Waking up a server…'); return r.endpoint; }
            loadingText('Waking up a server…');
            await sleep(wait); wait = Math.min(8000, wait * 1.6);
        }
        throw new Error('the Boxity matchmaker did not answer');
    }
    // (VITE_SERVER_URL: local test runs only, a game server on another local port)
    return import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:3205` : location.origin);
}
// a room by its id (?roomId= from Boxity's Open Rooms, a friend's invite, a CrazyGames invite): 'relay~colyseus' joins that pod's room
// straight away; a bare id is looked up in the room directory first (a bare joinById could land on another pod)
async function joinById(roomParam, opts) {
    const [relay, rid] = roomParam.includes('~') ? roomParam.split('~') : ['', roomParam];
    if (relay) { const c = new Client(BX.env().playUrl.replace(/^http/, 'ws') + '/v1/ws/' + relay); relayId = relay; return c.joinById(rid, opts); }
    if (BLOXITY_GAME_ID) {
        const r = await fetch(BX.env().playUrl + '/v1/dir/' + BLOXITY_GAME_ID + '/list').then((x) => x.json()).catch(() => null);
        const e = r && Array.isArray(r.rooms) ? r.rooms.find((x) => x.id === rid || x.roomId === rid || x.colyseusRoomId === rid) : null;
        if (e && e.joinUrl) return new Client(e.joinUrl).joinById(rid, opts);
    }
    return null;
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    // (knocked out: you stay where it happened on your screen; the server has you at the spawn until you pick)
    if (switching || P.dead) return;
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const b = P.b, tread = P.tread >= 0 && b.onGround && !P.moving;
    const a = tread ? 3 : !b.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), ry: +P.facing.toFixed(3), a, v: Math.round(Math.hypot(b.vx, b.vz)) };
    if (tread) m.post = P.tread;
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    m.ts = Math.round(net.now());
    net.send('move', m);
}
function playerUid() {
    let uid = storageGet('ks1_uid');
    if (!uid) { uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); storageSet('ks1_uid', uid); }
    return uid;
}
// an answer from the server: its numbers, plus what you've clicked since that it hasn't seen yet
function reconcile(m) {
    if (m.ack !== undefined) while (pending.length && pending[0].s <= m.ack) pending.shift();
    let x = out.sp, n = out.n;
    for (const p of pending) { x += p.sp; n += p.n; }
    S.pendSp = x; S.pendN = n;
    delete m.ack;
}
// a rebirth or a world switch: nothing on its way counts any more
function clearPending() { pending.length = 0; out.n = 0; out.sp = 0; S.pendSp = 0; S.pendN = 0; }
let gotProfile = false, lastGems = 0, lastWins = 0, lastReb = -1, epochSet = false, connLost = false;
async function connect(name, endpoint) {
    const id = BX.identity();
    const opts = { uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()), save: storageGet('ks1_save') || '' };
    let room = null;
    // Boxity's Join button and invites open the game with ?roomId=: that room first (gone or full: normal matchmaking)
    const wantRoom = new URLSearchParams(location.search).get('roomId');
    if (wantRoom && !connect.tried) { connect.tried = true; try { room = await joinById(wantRoom, opts); } catch (e) { room = null; } }
    if (!room) { const url = endpoint || await serverEndpoint(); room = await new Client(url).joinOrCreate('run', opts); }
    net.room = room;
    net.bloxity = false;
    BX.updateRoom(relayId ? relayId + '~' + room.roomId : room.roomId);
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); if (!epochSet) { epochSet = true; setEpoch(m.now - 300000); } net.bloxity = !!m.bloxity; pingSend(); });
    room.onDrop(() => { toast('📶 Connection lost: reconnecting…', '#ffe24a'); });
    room.onReconnect(() => { toast('📶 Back online!', '#7dff6b'); });
    room.onMessage('pong', onPong);
    room.onMessage('profile', (m) => {
        const first = !gotProfile;
        if (m.save) storageSet('ks1_save', m.save);
        delete m.now;
        const prevWorld = S.world, prevShoe = S.shoe;
        // (which Power Keys were open: the Wins in this message may open the next one)
        const wasOpen = first ? null : POSTS.map((c, i) => postOpen(S, i));
        reconcile(m);
        Object.assign(S, m);
        if (wasOpen) for (let i = POSTS.length - 1; i > 0; i--) if (!wasOpen[i] && !POSTS[i].gems && postOpen(S, i)) { popup('🔓', POSTS[i].name.toUpperCase() + ' OPEN!', 'Stand on it: every click is ' + postLabel(POSTS[i]) + '. Press Train!', '#7dff6b'); sfx('reward'); break; }
        S.x2 = (S.x2Until || 0) > net.now();
        S.profileAt = Date.now();
        if (first) speedUpShown = speedMark();
        gotProfile = true;
        if (!first && m.gems > lastGems) { bump('#gemsBox'); sfx('gem'); }
        if (!first && m.wins > lastWins + 0.5) bump('#winsBox');
        lastGems = m.gems; lastWins = m.wins;
        if (me) { me.setLabel(S.name, speedNow(), titleOf(S.cleared)); me.setTrail(S.trail); me.setAura(S.aura); if (prevShoe !== S.shoe && me.setShoe) me.setShoe(S.shoe); }
        setProgress();
        if (lastReb !== S.rebirths) { lastReb = S.rebirths; document.body.classList.toggle('reborn', S.rebirths > 0); }
        // a world switch made elsewhere (another tab) shows up here
        if (!first && running && !switching && !A && prevWorld !== S.world && view && view.w !== S.world) switchWorld(S.world, W.spawn.x, W.spawn.z);
        refreshPanels();
        updateHud();
    });
    // while running: only what changes then, four times a second
    room.onMessage('lite', (m) => {
        if (m.save) storageSet('ks1_save', m.save);
        reconcile(m);
        S.wins = m.wins; S.totalSpeed = m.totalSpeed; S.speed = m.speed; S.topSpeed = m.topSpeed; S.clicks = m.clicks; S.megas = m.megas; S.keyClicks = m.keyClicks; S.cleared = m.cleared; S.deaths = m.deaths;
        if (me) me.setLabel(S.name, speedNow(), titleOf(S.cleared));
        if (m.qv !== undefined) S.qv = m.qv;
        if (m.sq !== undefined) S.sq = m.sq;
        if (m.bests) S.bests = m.bests;
        S.profileAt = S.profileAt || Date.now();
        updateHud();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    // the squad boost: players came or went
    room.onMessage('sq', (m) => { const was = S.sq || 0; S.sq = +m.sq || 0; if (gotProfile && S.sq > was) toast('🤝 Squad Boost: +' + Math.round(S.sq * 100) + '% Speed a click!', '#7dff6b'); updateHud(); });
    // (short of Gems for a revive you just asked for: a toast, the offer stays up; anything else: the "not enough" question)
    // (short of Gems for a revive already asked for: the death screen's been let go, so it's back to Home Row)
    room.onMessage('broke', (m) => { if (clockT - reviveAskAt < 4 && P.dead) { sfx('denied'); toast('💎 Not enough Gems to revive' + (m.need ? ': ' + m.need + ' more' : ''), '#ff9a8a'); net.send('respawn', {}); toHome(); } else notEnough(m); });
    // a revive ad the server couldn't check: back to Home Row (the death screen's been let go)
    room.onMessage('adfail', () => { if (P.dead) { net.send('respawn', {}); toHome(); } });
    room.onMessage('code', (m) => codeResult(m));
    room.onMessage('boards', (m) => { boards = m; if (view) view.setBoards(m); if (panelIs('boards')) refreshPanels(); });
    room.onMessage('reward', (m) => { popup(m.gems && !/pc|wc/.test(m.text) ? '💎' : '🧰', m.why || 'Reward!', m.text, '#ffe24a', true); sfx('reward'); confetti(P.b); if (/wc/.test(m.text)) flyWins(8); });
    room.onMessage('padok', (m) => onPadOk(m));
    room.onMessage('warped', (m) => {
        if ((m.why === 'fell' || m.why === 'back') && P.dead) endDeath(!death);
        const tread = clockT - treadAskAt < 3;
        warpTo(m.x, m.y, m.z).then(() => { if (tread && !A) { treadAskAt = -9; const s = postSpot(bestPost()); P.walkTo = { x: s.x, z: s.z, until: clockT + 2.5 }; } });
    });
    // dead (you told it: 'fell'): the revive offer, top middle, till it runs out
    // the server's word on the offer (FREE or Gems, how long it stays open): the card says so
    room.onMessage('died', (m) => { if (A) return; if (!P.dead && m.srv) die(m.k | 0, m.why || 'ball', true); if (!P.dead) return; S.freeReviveAt = m.freeAt || 0; reviveShow({ k: m.k | 0, why: deathWhy, free: !!m.free, cost: m.cost || CFG.reviveGems || 5, until: m.until || net.now() + (CFG.reviveOffer || 120) * 1000, ads: BX.adsAvailable(), count: deathCount, stage: stageName(S.world || 0, m.k | 0), hazard: WORLDS[S.world || 0].hazard2 }); });
    // revived: into the stage you died in (behind a short fade), in a bubble for a moment
    room.onMessage('revived', (m) => {
        endDeath(true);
        sfx('revive');
        P.revives = (P.revives || 0) + 1;
        warpTo(m.x, m.y || 0, m.z).then(() => { P.shieldUntil = clockT + SHIELD; bigText('STAGE ' + ((m.k | 0) + 1) + '! RUN!', '#7dff6b'); });
    });
    room.onMessage('reborn', (m) => {
        sfx('rankup');
        popup('🔄', 'REBIRTH ' + m.r + '!', 'Every click now gives x' + rebirthMult(m.r) + ' Speed', '#e0a8ff');
        screenConfetti(90);
        clearPending();
        S.speed = 0; speedUpShown = 0;
        P.padT.fill(-99);
        endDeath(false);
        teleport(m.x, 0, m.z, Math.PI);
        updateGates();
    });
    room.onMessage('warp', (m) => { S.world = m.w; clearPending(); P.padT.fill(-99); endDeath(false); switchWorld(m.w, m.x, m.z); });
    room.onMessage('spun', (m) => onSpun(m));
    room.onMessage('hatched', (m) => { hatchShow(m); });
    room.onMessage('bought', (m) => {
        sfx('buy');
        screenConfetti(60);
        if (m.what === 'upgrade') toast('⬆️ Upgraded!', '#7dff6b');
        else if (m.what === 'post') toast('⌨️ The ' + POSTS[m.i].name + ' is yours: stand on it and click!', '#7dff6b');
    });
    room.onMessage('taskdone', (m) => { sfx('task'); toast('✅ Daily task done: ' + TASKS[m.k].text + '! Claim it in Quests', '#7dff6b'); });
    room.onMessage('questdone', (m) => { sfx('task'); questDone(m); if (m.wins) flyWins(m.wins); });
    room.onMessage('authed', (m) => { S.name = m.name; });
    room.onMessage('snap', (m) => { P.snaps++; teleport(m.x, m.y, m.z); });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r && r.char.blox) playEmoteOn(r.char.blox, m.id); });
    room.onMessage('chat', (m) => { if (BX.hasChat()) return; const r = remotes.get(m.s); if (r) chatBubble(r.char.root, m.text); else if (m.s === room.sessionId && me) chatBubble(me.root, m.text); });
    // ----- Ball Rush -----
    room.onMessage('mQueue', (m) => {
        if (m.off) { S.queued = false; queueState(null); return; }
        const was = S.queued ? S.qFound : 0;
        S.queued = true; S.qFound = m.found;
        if (was && m.found > was) sfx('found');
        queueState(m);
    });
    room.onMessage('mStart', (m) => enterMatch(m));
    room.onMessage('mSync', (m) => { if (A && A.id === m.start.id) applySync(m); else { pendingSync = m; enterMatch(m.start); } });
    room.onMessage('mNone', (m) => { if (A) leaveMatch(m, null); });
    room.onMessage('mJoined', (m) => { toast('🏃 ' + m.name + ' joined the race!', '#7af4ff'); sfx('found'); if (A) { const n = A.names.find((x) => x.spot === m.spot); if (n) n.n = m.name; setScores(A); } });
    room.onMessage('mLeft', (m) => { toast(m.name + ' left: a bot takes over', '#c8d0dc'); });
    room.onMessage('mGo', (m) => {
        if (!A) return;
        A.phase = 'play'; A.endsAt = m.at + m.secs * 1000;
        if (!anyPopup()) adNow();
        showCount('RUN!'); setTimeout(() => showCount(null), 800);
        sfx('go');
        matchHud({ left: m.secs });
    });
    room.onMessage('mScore', (m) => { if (!A) return; A.scores = m.s; setScores(A); });
    // the server saw a ball have you (your screen didn't): back to the pocket behind you
    room.onMessage('mBonk', (m) => { if (A && !A.done && clockT - (P.bonkT ?? -9) > 1.2) raceBonk({ x: m.x, z: m.z }); });
    room.onMessage('mOut', (m) => {
        if (!A) return;
        if (m.spot === A.spot) { A.out = true; sfx('caught'); rumble(0.9, 300); bigText('OUT!', '#ff9ac8'); }
        else toast('⚽ ' + m.name + ' is out!', '#ff9ac8');
        const row = A.scores.find((r) => r[0] === m.spot);
        if (row) row[3] = 1;
        setScores(A);
    });
    room.onMessage('mDone', (m) => {
        if (!A) return;
        A.endsAt = m.endAt;
        if (m.spot === A.spot) { A.done = true; sfx('win'); screenConfetti(90); bigText(m.place === 0 ? 'YOU WIN!' : 'FINISHED!', '#ffe24a'); }
        else toast('🏁 ' + m.name + ' hit ENTER!', '#ffe24a');
        const row = A.scores.find((r) => r[0] === m.spot);
        if (row) row[2] = m.place;
        setScores(A);
    });
    room.onMessage('mTime', () => { if (A) { A.phase = 'done'; showCount('TIME!'); sfx('whoosh'); } });
    room.onMessage('mEnd', (m) => leaveMatch(m, m));
    room.onMessage('mBack', (m) => leaveMatch(m, null));
    room.onLeave((code) => {
        if (code === 4000) { $('#connectErr').textContent = 'You joined from somewhere else.'; }
        else $('#connectErr').textContent = 'Lost the connection to the server.';
        $('#start').hidden = false; $('#connectErr').hidden = false; $('#retryBtn').hidden = false; $('#loading').textContent = '';
        running = false; connLost = true;
        audioAway(true);
    });
    return room;
}
// a quick way round: behind a short fade (no moves go out meanwhile: the server has you where you're going already)
async function warpTo(x, y, z) {
    if (A || enteringMatch) return;
    switching = true;
    await fadeOut();
    if (A || enteringMatch) return;
    switching = false;
    teleport(x, y || 0, z, Math.PI);
    fadeIn();
    FX.sparkleColumn(P.b, 0x7dff6b);
}
// through a stage's gate: "+N Wins", trophies flying into the counter
function onPadOk(m) {
    const n = m.n ?? m.wins ?? 0;
    sfx('trophy');
    toast('🏆 +' + fmt(n) + ' Wins' + (m.first ? ' · first time at this checkpoint: x3!' : ''), '#ffe24a', false, true);
    flyWins(n);
    FX.coinBurst(FX.tmpV.set(P.b.x, P.b.y + 3, P.b.z));
    if (!lowQ) screenConfetti(m.first ? 30 : 10);
    S.wins += n; S.totalWins = (S.totalWins || 0) + n;
    // (a new player can afford the first Egg after two checkpoints, and nothing says so)
    if (!S.hatched && S.wins >= JAWBREAKERS[0].wins && !eggTold) { eggTold = true; setTimeout(() => toast('🥚 You can afford an Egg! Press R to go home and hatch a pet: it boosts every click', '#ffe24a'), 2200); }
    P.padT[m.k] = clockT;
    if (view && view.setPad) view.setPad(m.k, false);
    const best = (S.bests && S.bests[S.world || 0]) || 0;
    if (m.k + 1 > best) S.bests = { ...S.bests, [S.world || 0]: m.k + 1 };
    updateHud();
    setTimeout(offerDaily, 2500);
}
// the daily reward pops up only on the ground, between things
function offerDaily() {
    if (!running || A || !P.b.onGround || anyPopup() || offerDaily.done || P.b.z < W.plaza.z0) return;
    if (!dailyStatus(S.daily, net.now()).can) return;
    offerDaily.done = true;
    openPanel('daily');
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const lb = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#10203a', px: 44 }], 9, 1024, new V3(0, 11, 0), group);
    group.userData.bubbleLbl = lb;
    setTimeout(() => { if (group.userData.bubbleLbl === lb) { group.remove(lb); lb.material.map.dispose(); group.userData.bubbleLbl = null; } }, BX.bubbleSeconds() * 1000);
}
// a Boxity chat line over its sender's head (found by their Boxity account id; a newer line replaces it)
function onBoxityChat(m) {
    let root = null;
    if (m.isLocalPlayer) root = me && me.root;
    else { const uid = String(m.userId || '').replace(/^legion_/, ''); const room = net.room; if (uid && room && room.state) room.state.players.forEach((p, id) => { if (p.bx && p.bx === uid) { const r = remotes.get(id); if (r) root = r.char.root; } }); }
    if (!root) return;
    const text = BX.bubbleText(m);
    if (!BX.attachBubble(T, root, text)) chatBubble(root, text);
}

// =====================================================================================
// Every frame
// =====================================================================================
let clockT = 0, slowT = 0, pingT = 0, metaT = 20;
// who's pressing the keys down this frame: you, the nearest others
const pressBalls = [];
function jellyPresses() {
    jellyPressBegin();
    const b = P.b, lift = b.onGround ? 0 : Math.max(0, b.y - (P.groundY || 0));
    jellyPress(P.vx, P.vz, 2.9, clamp(1 - lift / 2.5, 0, 1));
    let n = 1;
    if (!A) { ballsBetween(net.now() / 1000, P.vz - 90, P.vz + 70, pressBalls); for (const zb of pressBalls) { if (n >= 3) break; jellyPress(0, zb, RUN.r * 0.7, 1); n++; } }
    for (const r of remotes.values()) {
        if (n >= 5) break;
        if (!r.here || r.x === undefined || Math.abs(r.z - P.vz) > 80 || Math.abs(r.x - P.vx) > 80) continue;
        jellyPress(r.x, r.z, 2.9, (r.y || 0) > 1.5 ? 0 : 1);
        n++;
    }
    jellyPressEnd();
}
// Home Row's song on Home Row, the run song on the Sprintway (it changes over at the next bar); a race has its own
let musicZoneNow = 'plaza';
function musicZone() {
    if (A || switching || !running) return;
    const z = P.b.z < W.plaza.z0 ? 'run' : 'plaza';
    if (z !== musicZoneNow) { musicZoneNow = z; setMusicMode(z); }
}
function update(dt) {
    clockT += dt;
    const t = clockT;
    CU.uNow.value = rel(net.now());
    if (lowQ !== (getQuality() === 'low')) { lowQ = !lowQ; setFloatCap(lowQ ? 4 : 12); }
    pumpAvatars();
    beginPals();
    updateMe(dt);
    updateShield(t);
    updateClicks(dt);
    updatePrompt();
    syncRemotes(dt, t);
    jellyPresses();
    stageHud();
    musicZone();
    updateGuide(t);
    contactShadows();
    endPals();
    chipsTick();
    // (the blades swing on the server's own seconds: the same clock the hits below use)
    if (view && !A) view.update(net.now() / 1000, camera.position.x, camera.position.z, clockT);
    updateEffects(dt);
    updateFx(dt);
    S.powerShown = speedNow();
    S.key = P.tread;
    S.runV = P.v;
    animateCounters(dt);
    if (A) matchTick(dt);
    slowT -= dt;
    if (slowT <= 0) {
        slowT = 1;
        S.x2 = (S.x2Until || 0) > net.now();
        // (each gate's trophy plate greyed while its Wins are cooling down)
        if (view && !A && view.setPad) for (let k = 0; k < WALLS_N; k++) view.setPad(k, padReady(k));
        updateHud();
    }
    pingT -= dt;
    if (pingT <= 0) { pingT = pingEvery(); pingSend(); }
    metaT -= dt;
    if (metaT <= 0) { metaT = 30; sendMeta(); }
}
// the contact shadows (Low quality): under you and everyone near
function contactShadows() {
    SH.shadowsOn(lowQ);
    if (!lowQ) { SH.begin(); SH.end(); return; }
    SH.begin();
    SH.add(P.vx, 0, P.vz, Math.max(0, P.vy), 3);
    for (const r of remotes.values()) if (r.here && r.x !== undefined) SH.add(r.x, 0, r.z, Math.max(0, r.y), 3);
    SH.end();
}
const AMB = { retro: { color: 0xfff4dc, dir: 0.08, snow: false }, pastel: { color: 0xffd8f0, dir: 0.12, snow: false }, arctic: { color: 0xeaf8ff, dir: 0.16, snow: true }, galaxy: { color: 0xc8b8ff, dir: 0.22, snow: false } };
function updateCameraAll(dt) {
    updateCamera(dt);
    const t = clockT;
    if (shadowDue()) snapShadow(FX.tmpV.set(P.b.x, P.b.y, P.b.z));
    updateSky(camera.position, t, dt);
    const w = A ? A.w : S.world;
    updateAmbient(camera.position, t, AMB[WORLDS[w || 0].mood] || AMB.retro);
    // speed lines at the edges: running fast, dashing, boosted
    const hv = Math.hypot(P.b.vx, P.b.vz);
    // (not on Low: drawing them is a canvas's worth of work every frame)
    setSpeedLines(lowQ ? 0 : clamp((hv - 30) / 40, 0, 1), dt);
}

// ----- play stats: how the game runs on this device and any error it hit -----
const fpsWin = { sum: 0, n: 0 }, errSeen = new Set(), errQueue = [];
let metaFirst = true, loadSecs = 0, lastFps = 60;
function noteError(msg, src, line, col) {
    const file = src ? String(src).split('/').pop().split('?')[0] : '';
    const k = String(msg || '?').slice(0, 150) + (file ? ' @' + file + ':' + (line || 0) + ':' + (col || 0) : '');
    if (errSeen.has(k) || errSeen.size >= 20) return;
    errSeen.add(k); errQueue.push(k);
}
window.addEventListener('error', (e) => noteError(e.message, e.filename, e.lineno, e.colno));
window.addEventListener('unhandledrejection', (e) => noteError('promise: ' + ((e.reason && e.reason.message) || e.reason)));
addEventListener('pagehide', () => { if (running) sendMeta(); });
let gpuNameCache = null;
function gpuName() {
    if (gpuNameCache !== null) return gpuNameCache;
    gpuNameCache = GPU_NAME.slice(0, 90) + (renderer.getContext().getContextAttributes().antialias ? '' : ' (no AA)');
    return gpuNameCache;
}
function sendMeta() {
    const m = { touch: isTouch, fps: fpsWin.n ? Math.round(fpsWin.sum / fpsWin.n) : lastFps, q: getQuality(), errs: errQueue.splice(0, 5) };
    fpsWin.sum = 0; fpsWin.n = 0;
    if (metaFirst) { metaFirst = false; Object.assign(m, { gpu: gpuName(), load: loadSecs, dpr: Math.round(devicePixelRatio * 100) / 100, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 }); }
    net.send('meta', m);
}

// ----- the smoothness watch (every half second): the resolution adapts first, then the quality -----
const fpsWatch = { t: 0, avg: 60, low: 0, good: 0, trial: null, cpuUntil: 0, fails: 0, upAt: -99, upFrom: 1, ceil: 1, ceilUntil: 0, holdUntil: 0, lows: 0 };
// a world switch builds things for a moment: the watcher looks away for a few seconds
function holdFpsWatch(secs) { fpsWatch.holdUntil = fpsWatch.t + (secs || 4); fpsWatch.avg = Math.max(fpsWatch.avg, 58); }
let watchOff = false;
function watchFps(fps) {
    if (!running || document.hidden || watchOff) return;
    const w = fpsWatch;
    w.t += 0.5;
    // a single stall (one slow half-second) doesn't count: only two in a row do
    w.lows = fps < 45 ? w.lows + 1 : 0;
    if (w.lows === 1 && fps < 45) return;
    w.avg += (fps - w.avg) * 0.35;
    if (w.t < 3 || w.t < w.holdUntil) return;
    if (w.t > w.ceilUntil) w.ceil = 1;
    if (w.trial) {
        if (w.t - w.trial.at < 2) return;
        if (w.avg < w.trial.fps * 1.06) { setResScale(w.trial.prev); w.fails++; w.cpuUntil = w.t + Math.min(240, 30 * w.fails); } else w.fails = 0;
        w.trial = null;
        return;
    }
    const scale = getResScale();
    // high frame rates first: below 54 a 60 Hz screen is already missing frames
    if (w.avg < 54 && w.t > w.cpuUntil && scale > 0.56) {
        if (w.t - w.upAt < 6) { w.ceil = w.upFrom; w.ceilUntil = w.t + 60; }
        w.trial = { at: w.t, fps: w.avg, prev: scale };
        setResScale(scale * 0.85);
        w.good = 0;
        return;
    }
    if (w.avg >= 57) {
        w.good += 0.5;
        if (w.good >= 6 && scale < w.ceil - 0.01) { w.good = 0; w.upAt = w.t; w.upFrom = scale; setResScale(Math.min(w.ceil, scale / 0.88)); }
    } else w.good = 0;
    if (!autoQualityAllowed()) return;
    w.low = w.avg < 45 && (scale <= 0.56 || w.t < w.cpuUntil) ? w.low + 0.5 : 0;
    if (w.low < 3) return;
    w.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true, w.t < 45);
    if (next === 'low') musicLite(true);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
// Even frame pacing: on a fast screen (120 Hz and up) a frame that misses the refresh waits for the next one, so
// a game running between half and full rate shows frames of uneven length (a stutter, though the FPS is high).
// When most frames miss and some don't, it draws every other refresh instead: an even 72 on a 144 Hz screen.
const ivs = [];
let refreshMs = 0, paceN = 0, strikes = 0, pacedAt = 0, paced = false, trial = false;
function noteInterval(ms) { if (ms > 2 && ms < 60 && ivs.length < 400) ivs.push(ms); }
function paceFrames() {
    if (!running || document.hidden || isTouch) return;
    const now = performance.now();
    if (paced) { if (now - pacedAt > 30000) { paced = false; skipOdd = false; trial = true; ivs.length = 0; } return; }
    if (ivs.length < 200) return;
    paceN++;
    const s = ivs.slice().sort((a, b) => a - b), p10 = s[Math.floor(s.length * 0.1)];
    refreshMs = refreshMs ? Math.min(refreshMs, p10) : p10;
    const late = s.filter((v) => v > refreshMs * 1.5).length / s.length;
    ivs.length = 0;
    const uneven = refreshMs < 9 && late > 0.25 && late < 0.9;
    strikes = uneven ? strikes + 1 : 0;
    if ((trial && uneven) || (paceN > 3 && strikes >= 2 && fpsWatch.t >= fpsWatch.holdUntil)) {
        paced = true; skipOdd = true; pacedAt = now; strikes = 0;
        console.info('[pace] every other refresh (' + Math.round(500 / refreshMs) + ' FPS), ' + Math.round(late * 100) + '% of frames were late');
    }
    trial = false;
}
const perf = { n: 0, sum: 0, max: 0, last: 0 };
const spikes = [], slowParts = [];
let secAvg = {};
let frameErrors = 0, lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, skipOdd = false, oddFrame = false;
let rafN = 0, frameDt = 0;
// scrolled out of view in a feed (the page doesn't count as hidden then): no sound, nothing worked out or drawn
let offscreen = false, paused = false;
if ('IntersectionObserver' in window) new IntersectionObserver((es) => { offscreen = !es[es.length - 1].isIntersecting; audioAway(offscreen || connLost); }).observe($('#app'));
function frame(now) {
    requestAnimationFrame(frame);
    if (offscreen || paused) { lastFrame = 0; return; }
    rafN++;
    if (skipOdd) { oddFrame = !oddFrame; if (oddFrame) return; }
    frameDt = (now - (lastFrame || now)) / 1000;
    const dt = Math.min(0.05, frameDt);
    if (lastFrame && !skipOdd) noteInterval(now - lastFrame);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) {
        const fps = fpsFrames / fpsAcc;
        lastFps = Math.round(fps);
        if (running && !document.hidden) { fpsWin.sum += fps; fpsWin.n++; }
        if (showFps) $('#fps').textContent = lastFps + ' FPS';
        if (isTouch && !skipOdd && fps > 100) skipOdd = true;
        // drawing every other refresh only makes sense on a fast screen keeping up: if the refreshes themselves are slow, draw them all
        if (skipOdd && rafN / fpsAcc < 95) { skipOdd = false; paced = false; pacedAt = 0; }
        rafN = 0;
        paceFrames();
        watchFps(fps); fpsAcc = 0; fpsFrames = 0;
    }
    if (lastFrame && now - lastFrame > 45 && spikes.length < 60) spikes.push({ at: Math.round(now), ms: Math.round(now - lastFrame), work: +perf.last.toFixed(1), res: getResScale() });
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    if (epochSet) CU.uNow.value = rel(net.now());
    pollGamepad();
    padButtons(dt);
    if (running) {
        const w0 = performance.now();
        try {
            prof.start();
            update(dt);
            prof.mark('update');
            updateCameraAll(dt);
            // the jelly in view (its chunks are re-chosen only when the camera's view of them changes)
            if (A) { if (A.view && A.view.jelly) A.view.jelly.update(camera); } else if (view && view.jelly) view.jelly.update(camera);
            prof.mark('camera+sky');
            render();
            prof.mark('render');
        } catch (e) {
            if (frameErrors++ < 5) console.error('[frame]', e);
            const at = String((e && e.stack) || '').split('\n').find((l) => /:\d+:\d+/.test(l)) || '';
            noteError('[frame] ' + ((e && e.message) || e), '', 0, 0);
            if (at) noteError('[frame at] ' + at.trim().slice(-120));
        }
        const w = performance.now() - w0;
        perf.n++; perf.sum += w; perf.max = Math.max(perf.max, w); perf.last = w;
        for (let i = 0; i < prof.parts.length; i += 2) secAvg[prof.parts[i]] = (secAvg[prof.parts[i]] || 0) + prof.parts[i + 1];
        secAvg.n = (secAvg.n || 0) + 1;
        if (w > 50 && slowParts.length < 20) { const o = {}; for (let i = 0; i < prof.parts.length; i += 2) o[prof.parts[i]] = +(o[prof.parts[i]] || 0) + +prof.parts[i + 1].toFixed(1); slowParts.push({ at: Math.round(now), ms: Math.round(w), calls: renderer.info.render.calls, prog: renderer.info.programs.length, ...o }); }
    }
}

// =====================================================================================
// Boot: build everything behind the loading screen, join, play (no start menu)
// =====================================================================================
function loadingText(t) { window.__gameRunning = true; const el = $('#loading'); el.textContent = t; delete el.dataset.pre; }
let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('ks1_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            loadingText('Waking up a server…');
            await sleep(2000 * (attempt + 1));
        }
    }
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => { const t0 = performance.now(); (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })(); });
}
async function play() {
    if (joining || running) return;
    joining = true;
    $('#connectErr').hidden = true; $('#retryBtn').hidden = true;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        loadingText('Joining a server…');
        $('#loadBar').style.width = '92%';
        BX.loadingStep('Joining a server…');
        await joinTask;
        const t0 = performance.now();
        while (!gotProfile && performance.now() - t0 < 6000) await sleep(50);
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        loadingText('');
        $('#connectErr').hidden = false;
        $('#connectErr').textContent = 'Could not reach the game server. Check your connection and try again.';
        $('#retryBtn').hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    if (connLost) { BX.loadingEnd(); return; }
    // your world (the one you were in last time)
    if (S.world !== view.w) buildView(S.world);
    updateGates(true);
    setProgress();
    running = true;
    S.joinedAt = Date.now();
    if (!me) buildMe();
    me.setTrail(S.trail); me.setAura(S.aura);
    const p = net.room.state.players.get(net.room.sessionId);
    teleport(p ? p.x : W.spawn.x, 0, p ? p.z : W.spawn.z, Math.PI);
    cam.yaw = 0; cam.pitch = 0.2;
    loadingText('Almost there…');
    $('#loadBar').style.width = '100%';
    await primeFrames();
    if (connLost) { BX.loadingEnd(); return; }
    // everyone's avatar made behind the loading screen too
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 2000) await sleep(30); }
    fpsAcc = 0; fpsFrames = 0;
    // until a song's first loop is rendered it plays note by note (~100 audio nodes a second): fine on a PC, not on
    // a phone or a weak laptop (Low), which waits for the loop in silence
    allowLiveMusic(getQuality() !== 'low');
    startMusic();
    setMusicMode('plaza');
    $('#start').hidden = true;
    $('#start').style.opacity = '';
    $('#hud').hidden = false;
    measureHud();
    updateHud();
    showTips();
    autoState(S.auto);
    const fresh = !S.clicks && !S.pads;
    if (fresh) {
        setTimeout(() => bigText('YOUR SPEED GROWS!', '#ffe24a'), 500);
        setTimeout(() => toast(isTouch ? '⌨️ Tap CLICK (or the world) for Speed, then run the Sprintway and dodge the giant balls! Every checkpoint: Wins!' : '⌨️ Click (or press E) for Speed, then run the Sprintway (WASD) and dodge the giant balls! Every checkpoint: Wins!', '#ffffff'), 1600);
        setTimeout(() => toast('🤖 Auto Click is ON: free Speed every second. Press CLICK! for even more!', '#7dff6b'), 3600);
    } else toast('👋 Welcome back, ' + (S.name || 'Clicker') + '!' + (S.auto ? ' 🤖 Auto Click is on.' : ''), '#ffffff');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Tap anywhere for sound!', '#7de8ff'); }, 3500);
    // the daily reward: straight away for someone back, after the first gate for someone new
    if (!fresh) setTimeout(offerDaily, 1500);
    canvas.focus();
    loadSecs = Math.round(performance.now() / 100) / 10;
    metaT = 8;
    BX.loadingEnd();
    adNow();
    BX.gameplayStart();
    console.info('[Bloxity] environment:', BX.env().env, '· SDK', BX.bloxity.ready ? 'ready' : 'missing');
}
async function primeFrames() {
    $('#start').style.opacity = '0.985';
    $('#hud').hidden = false;
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* compiles on first use */ }
    for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
    const gl = renderer.getContext();
    if (!gl.fenceSync) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const t0 = performance.now();
    while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 1500) await sleep(15);
    gl.deleteSync(sync);
}
let tipsT0 = 0, tipsT1 = 0;
function showTips() {
    if (isTouch && !padMode) return;
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = padMode
        ? k('B', 'Click') + k('L stick', 'Run') + k('A', 'Jump') + k('RT', 'DASH') + k('R stick', 'Camera') + k('Y', 'Revive / use') + k('LB', 'Race') + k('D-pad', 'Menus')
        : k('E / tap', 'Click') + k('WASD', 'Run') + k('Space', 'Jump') + k('Shift', 'DASH') + k('Drag', 'Camera') + k('F', 'Revive / use') + k('V', 'Race') + k('T', 'Teleport') + k('R', 'Home');
    el.hidden = false; el.style.opacity = 1;
    clearTimeout(tipsT0); clearTimeout(tipsT1);
    tipsT0 = setTimeout(() => { el.style.opacity = 0; }, 12000);
    tipsT1 = setTimeout(() => { el.hidden = true; }, 12900);
}
function unlockAudioOnGesture() {
    // (kept on: a phone call or another app can stop the sound again, and only a touch brings it back)
    const unlock = () => { if (audioSuspended()) resumeAudio(); };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => { setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true); musicLite(v === 'Low'); }));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        // Boxity's "Reset Character": straight back to Home Row (the death screen has its own buttons while you're knocked out)
        if (event === 'respawn_request') { if (running && !P.dead) goTo('spawn'); }
        else if (event === 'open_daily') openPanel('daily');
        else if (event === 'chat_message_sent' && data && !BX.hasChat()) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { if (me) playEmoteOn(me.blox, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
    if (BX.hasChat()) BX.onChat(onBoxityChat);
    // an ad break (Boxity may start one at any time): everything stops and goes quiet, then carries on
    BX.onAdBreak(() => { paused = true; audioAway(true); for (const k in keys) keys[k] = false; touchJump = false; P.holdDash = false; }, () => { paused = false; lastFrame = 0; audioAway(offscreen || connLost); });
}
// The HUD's words and emoji painted for a few frames behind the loading screen, in the fonts and sizes
// the game uses: the first time a glyph (an emoji above all, on Windows) is drawn costs a long pause.
async function warmHudText() {
    const lines = [['🔄✨🌈🌍⚙️🎁❄️🌟🧰🚀🛸🌙🪐🌌🌀🔁🖥️🍬❄️⚡🔘👟🤖💥🧦🍀🎒🥚🤝⏩⌫⌨️👆🚪', 2.3], ['🔊🔇🏆🎯✅⭐🎡🏁👟🎟️🏠🔥📍🚩🍀♥', 1.8], ['🥉🥈🥇🔒🔓💬👋🏃🎉📶🐾💎⚡⬆️🏳️🎮⏱️', 1.4], ['⚡🍀🏠🎟️✓✕−+🎮🚩🔥📍💎🏆🚀🌀🔒', 2.6]];
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;width:3000px;opacity:0.01;pointer-events:none;z-index:1';
    d.innerHTML = lines.map(([em, s]) => `<div style="font-size:${s}rem;white-space:nowrap">${em}</div>`).join('')
        + [['var(--chunky)', 3, 400, 'o'], ['var(--chunky)', 2, 400, 'o'], ['var(--font)', 2.3, 700, 'o'], ['var(--font)', 1.1, 700, 'o1']]
            .map(([f, s, w, c]) => `<div class="${c}" style="font-family:${f};font-size:${s}rem;font-weight:${w};white-space:nowrap">CLICK! AUTO ON OFF PER CLICK MEGA SPEED 2X RUN · MAX Running at OK PETS TRAIL &amp; AURA UPGRADES REBIRTHS x / CLICK NEXT Stage RACE CLAIM! KNOCKED OUT! REVIVE at Stage 0123456789 FREE! WATCH AD BACK TO Home Row Shop SHOP Rebirth Upgrade Pets Teleport Train Sound WINS OPEN! ALL YOUR BOOSTS: CUSTOM SPEED Your Max Speed: Current: STATS SKIP FREE SPIN Next in SPIN! Ball Rush Squad Boost: MIN left x2 +1.5 K M B / %</div>`).join('');
    document.body.appendChild(d);
    for (let i = 0; i < 3; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 150); });
    d.remove();
    // and once in a canvas (name tags, chat bubbles and signs are drawn there)
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 140;
    const cx = cv.getContext('2d');
    for (const px of [36, 44, 52, 70, 76]) { cx.font = '700 ' + px + 'px Fredoka, "Arial Rounded MT Bold", sans-serif'; cx.fillText('💬💎🔒🔓🏆🚀⭐✓🥚⌨️⚡ 0123456789 KM Speed Wins Stage CLICK', 4, 100); }
}
// The sound bank: made by a worker on another core while the world is built here (on a weak phone that was over a second of loading
// on this thread). Should the worker not start, or not answer in time, it's made here as before.
function startSounds(low) {
    const here = () => buildAsmr(pause, low);
    let w = null;
    try { w = new Worker(new URL('./asmr-worker.js', import.meta.url), { type: 'module' }); } catch (e) { return null; }
    return new Promise((done) => {
        let over = false;
        const end = (res) => { if (over) return; over = true; clearTimeout(tm); try { w.terminate(); } catch (e) { /* gone */ } if (res) { adoptAsmr(res, low); done(); } else here().then(done, done); };
        const tm = setTimeout(() => end(null), 20000);
        w.onmessage = (e) => end(e.data && e.data.bank ? e.data : null);
        w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); end(null); };
        w.postMessage({ low });
    });
}
async function prepareWorld() {
    const sounds = startSounds(getQuality() === 'low');
    const step = (t, k) => { loadingText(t); BX.loadingStep(t); if (k) $('#loadBar').style.width = Math.round(k * 100) + '%'; };
    step('Loading fonts…', 0.08);
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('400 40px "Lilita One"')]), sleep(1500)]); } catch (e) { /* fallback font */ }
    await warmHudText();
    step('Polishing the keycaps…', 0.18);
    buildView(0);
    SH.initShadows();
    await pause();
    step('Tuning the switches…', 0.36);
    if (!sounds) await buildAsmr(pause, getQuality() === 'low');
    musicLite(getQuality() === 'low');
    prerenderMusic();
    // every HUD screen and panel painted once, invisibly (the browser compiles how to draw them now): below, while the shaders compile
    const warmUi = async () => {
        const hud = $('#hud');
        hud.hidden = false; hud.classList.add('warmui');
        measureHud();
        const lite = getQuality() === 'low', endPanels = warmPanels(lite);
        for (let i = 0; i < (lite ? 2 : 4); i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
        endPanels();
        hud.classList.remove('warmui'); hud.hidden = true;
    };
    // the warm-up: every shader the game uses (the Sprintway's, the lasers', the pets', a race's, every effect, the bubble) compiled and drawn
    // once now, not in play
    step('Getting ready to run…', 0.75);
    const extras = [fxWarmGroup()];
    for (const g of extras) { g.position.set(0, -60, 0); scene.add(g); }
    beginPals(); chipsWarm(); palsWarm();
    let warmA = null;
    try { warmA = buildArena(arenaPlan(7, 14), 0, SPOT_COL, getQuality() === 'low', 0); } catch (e) { console.warn('[warm]', e); }
    try {
        const base = await Promise.race([loadBase(), sleep(4000)]);
        const a = base ? await createAvatar(null) : null;
        if (a) { a.root.position.set(0, -60, 10); a.update(1 / 60, { t: 0 }); scene.add(a.root); extras.push(a.root); }
    } catch (e) { /* the avatar's shaders compile when it first shows */ }
    fxShowAll(true);
    if (view && view.jelly) view.jelly.showAll();
    if (view && view.stageFx) view.stageFx.showAll(true);
    if (warmA && warmA.jelly) warmA.jelly.showAll();
    camera.position.set(0, 60, 130); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    gpuName();
    // (the shaders compile on the graphics side: the panels are warmed meanwhile, instead of one after the other)
    step('Warming up your fingers…', 0.85);
    const compiling = Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]).catch(() => { /* later */ });
    try { await warmUi(); } catch (e) { console.warn('[warm ui]', e); }
    await compiling;
    const culled = [];
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    render();
    for (const o of culled) o.frustumCulled = true;
    await pause();
    fxShowAll(false);
    if (view && view.stageFx) view.stageFx.showAll(false);
    for (const g of extras) scene.remove(g);
    if (warmA) warmA.dispose();
    beginPals(); endPals();
    setMood(WORLDS[view.w].mood, true);
    if (sounds) await sounds;
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
async function boot() {
    installIcons();
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    // ONE identity listener (bloxity.js holds the only onUserChanged subscription): a sign-in mid-game is verified on this same
    // connection (the server swaps in the account's progress), so nobody is pulled out of their room
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    BX.onEnvironmentChanged(() => console.info('[Bloxity] environment:', BX.env().env));
    addEventListener('pagehide', () => { try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#retryBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// =====================================================================================
// QA: the autopilot and hooks for the test scripts
// =====================================================================================
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        P, S, cam, net, scene, camera, Raycaster: T.Raycaster, me: () => me, renderer: () => renderer, audio: () => audioDebug(), actions, view: () => view, match: () => A, gates,
        state: () => ({ world: S.world, x: +P.b.x.toFixed(2), y: +P.b.y.toFixed(2), z: +P.b.z.toFixed(2), onGround: P.b.onGround, wins: S.wins, gems: S.gems, speed: speedNow(), clicks: clicksNow(), auto: !!S.auto, v: +P.v.toFixed(1), rebirths: S.rebirths, shoe: S.shoe, cleared: S.cleared, escapes: S.escapes, catches: S.catches, megas: S.megas, pads: S.pads, bests: S.bests, gateOpen: gates.open, stage: stageAt(P.b.z), tread: P.tread, key: P.tread, down: P.dead, dead: P.dead, deaths: P.deaths || 0, revives: P.revives || 0, shield: clockT < P.shieldUntil, revive: reviveOpen(), walk: +walkTop().toFixed(1), maxWalk: +maxWalk(S).toFixed(1), cs: S.cs, rebirthPct: rebirthPct(S), snaps: P.snaps, programs: renderer.info.programs.length, prompt: activePrompt && activePrompt.label(), q: getQuality(), others: remotes.size, qi: S.qi, queued: !!S.queued, match: A ? { phase: A.phase, lv: A.lv, w: A.w, spot: A.spot, n: A.plan.n, secs: A.D.secs, done: A.done, out: A.out, scores: A.scores, finish: A.plan.finish } : null, matches: S.matches, matchWins: S.matchWins, hatched: S.hatched, team: S.team }),
        auto: (on) => { P.auto = on === false ? null : true; },
        key: (code, down) => { keys[code] = !!down; if (down && code === 'Space') P.jumpPress = clockT; },
        jump: () => { P.jumpPress = clockT; },
        dash,
        // (the server's QA teleport ends a knock-out there too: the card goes with it)
        teleport: (x, y, z, yaw) => { net.send('qa', { tp: [x, y, z] }); if (P.dead) endDeath(false); teleport(x, y, z, yaw); },
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; },
        camFree: (on) => { camFree = on !== false; },
        quality: (q) => setQuality(q),
        give: (o) => net.send('qa', o),
        send: (type, m) => net.send(type, m || {}),
        panel: (k, tab) => openPanel(k, tab),
        close: () => { let n = 0; while (closeTop() && n < 9) n++; return n; },
        world: (w) => switchWorld(w, W.spawn.x, W.spawn.z),
        play: (m) => { qaMap = m || null; pressPlay(); },
        perf: (reset) => { const r = { frames: perf.n, avgMs: +(perf.sum / Math.max(1, perf.n)).toFixed(2), maxMs: +perf.max.toFixed(1), fps: lastFps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, paced: skipOdd }; if (reset) { perf.n = 0; perf.sum = 0; perf.max = 0; } return r; },
        diag: () => { renderer.info.reset(); renderer.info.autoReset = false; render(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio: renderer.getPixelRatio(), programs: renderer.info.programs.length }; renderer.info.autoReset = true; return r; },
        errors: () => [...errSeen],
        noWatch: (on) => { watchOff = on === undefined ? true : !!on; },
        hud: (on) => { $('#hud').style.display = on ? '' : 'none'; $('#touch').style.display = on ? '' : 'none'; },
        mood: (m) => setMood(m, true),
        res: (k) => setResScale(k),
        gpu: () => gpuName(),
        spikes: () => spikes.splice(0),
        slow: () => slowParts.splice(0),
        sections: () => { const n = secAvg.n || 1, o = {}; for (const k in secAvg) if (k !== 'n') o[k] = +(secAvg[k] / n).toFixed(2); secAvg = {}; return o; },
        avatars: () => avatarsPending(),
        remotes: () => remotes,
        delays: () => [...remotes.values()].map((r) => Math.round(r.track.delay)),
        ui: { toast, bigText, popup, hatchShow, reviveShow, reviveHide, flyWins },
        die: (k, why) => die(k, why || 'pit'),
        padNav,
        guideTarget,
        checkpoint,
        northEnd,
        stageType: (k) => stagePlan(S.world || 0, k).type,
        stagePlan: (k) => stagePlan(S.world || 0, k),
        balls: (z0, z1) => ballsBetween(net.now() / 1000, z0 ?? -1e5, z1 ?? 1e5, []),
        runClear: (z, zTo, v) => runClear(net.now() / 1000, z, zTo, v ?? P.v),
        zones: () => ZONES,
        tpPost: (i) => { const sp = postSpot(i || 0); net.send('qa', { tp: [sp.x, KEY_TOP, sp.z] }); teleport(sp.x, KEY_TOP, sp.z, Math.PI); },
        click: (n) => { let k = 0; for (let i = 0; i < (n || 1); i++) if (doClick('btn')) k++; return k; },
        wallZ,
    };
}
void panelIs; void refreshPanels; void toggleMusic; void popup; void flyWins; void chipBurst; void sun; void BELT; void jellyHit; void stageV;
