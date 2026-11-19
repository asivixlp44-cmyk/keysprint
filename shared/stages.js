// The Ball Run: what every stage of the Sprintway is. A narrow keyboard path climbs into the sky; giant balls (balls of keycaps) roll
// down it from a chute at the very top, one every BALLS.T seconds, all the way to the bin at the bottom. Wide keyboards cross the path
// now and then, sticking out on both sides of it: the safe keyboards. Stand out on one, clear of the path's line, and a ball rolls
// past you; anywhere on the path (or in its line) a ball flattens you. So: wait beside the path until a ball has gone by, then RUN
// up to the next safe keyboard before the next ball gets there. Each stage is three runs (two safe keyboards between its checkpoints);
// the runs get longer stage by stage, so the further up, the more Speed it takes to make it in time. shared/world.js lays it out and
// says where the balls are; both sides read the same numbers (the client draws it and judges it on your screen, the server checks).
import { rngFrom } from './config.js';

// the path's half width; a safe keyboard's half width (out to its ends) and depth; a checkpoint's depth (it starts a stage: its
// Recommended Speed board, its trophy and the Wins passing it pays); runs a stage; a ball's radius; the line out from the path's
// middle past which a ball never touches you (on a wide keyboard)
export const RUN = { pw: 9.6, sw: 36, sd: 20, cd: 26, gaps: 3, r: 8.2 };
// how many runs each stage has (stage 1 stays at three): the later ones are longer
export const RUNS = [3, 3, 3, 4, 3, 4, 4, 3, 5, 4, 4, 5, 4, 5, 5];
RUN.safeX = RUN.r + 0.9;
// one ball leaves the chute every T seconds and rolls down at v studs a second (the same everywhere: the stages' runs are sized for it)
export const BALLS = { T: 6.5, v: 40 };
// the kind every stage is (one kind: the Ball Run). title / tip: what the stage bar and the first toast say
export const STAGE_TYPES = {
    ballrun: { title: 'Ball Run', tip: 'Giant balls roll down the path! Wait on the side of a safe keyboard, then RUN when a ball has passed.' },
};
export const stageType = () => 'ballrun';
// (kept so old callers link: a ball's size as the art reads it)
export const BALL = { r: RUN.r };

// ----- tests on the ground, shared -----
export function inRect(o, x, z) { return x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1; }
export const onPlat = (p, x, z, pad) => Math.abs(x - p.x) < p.sx / 2 + (pad || 0) && Math.abs(z - p.z) < p.sz / 2 + (pad || 0);
void rngFrom;
