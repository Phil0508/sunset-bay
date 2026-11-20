// Traffic: cars follow right-hand lanes along the grid, choose a turn at each intersection, obey the
// traffic lights, slow for cars and people ahead, and are respawned around the player so the city
// always looks busy without simulating every street. The same lane driver is reused by patrolling
// and pursuing police cars.
import * as THREE from 'three';
import { GRID, PITCH, ROAD_W, LANE_OFFSET, CURB_OFFSET, lineC, COUNTS, AMBIENT_TYPES, CAR_TYPES } from './config.js';
import { rand, rr, ri, pick, clamp, wrapPi, dist } from './util.js';
import { vertexMaterial, mergeParts } from './models.js';

const C0 = lineC(0);
const CYCLE = 20;

const aiDir = (ai) => (ai.axis === 'z' ? [0, ai.dir] : [ai.dir, 0]);
const laneCoord = (ai) => {
  const [dx, dz] = aiDir(ai);
  return lineC(ai.line) + (ai.axis === 'z' ? -dz : dx) * LANE_OFFSET;
};
const validLine = (v) => v >= 0 && v <= GRID;

/** Which turns are possible at the intersection `k` ahead of a lane-following car. */
function planTurn(ai, k, choose) {
  const options = [];
  if (validLine(k + ai.dir)) options.push({ turn: 's', w: 0.62, nAxis: ai.axis, dir: ai.dir });
  const newAxis = ai.axis === 'z' ? 'x' : 'z';
  // a right turn points along the new axis: south-bound turns toward -x, east-bound toward +z, ...
  const rightDir = ai.axis === 'z' ? -ai.dir : ai.dir;
  if (validLine(ai.line + rightDir)) options.push({ turn: 'r', w: 0.19, nAxis: newAxis, dir: rightDir });
  if (validLine(ai.line - rightDir)) options.push({ turn: 'l', w: 0.19, nAxis: newAxis, dir: -rightDir });
  if (!options.length) options.push({ turn: 'u', w: 1, nAxis: ai.axis, dir: -ai.dir });
  let chosen;
  if (choose) chosen = choose(options, k);
  if (!chosen) {
    let total = 0;
    for (const o of options) total += o.w;
    let r = rand() * total;
    chosen = options[0];
    for (const o of options) {
      r -= o.w;
      if (r <= 0) {
        chosen = o;
        break;
      }
    }
  }
  return { k, axis: ai.axis, turn: chosen.turn, dir: chosen.dir, newAxis: chosen.nAxis };
}

/** Unit heading (x, z) a lane option would give the car; used by police to pick a route. */
export const optionHeading = (o) => (o.nAxis === 'z' ? [0, o.dir] : [o.dir, 0]);

export function createTraffic(game) {
  const api = { time: 0 };

  // ----- traffic lights: two glowing heads per intersection, recoloured as the phase changes
  const headGeo = new THREE.BoxGeometry(0.55, 1.3, 0.55);
  const poleGeo = mergeParts([{ w: 0.2, h: 4.6, d: 0.2, y: 2.3, c: 0x3a3d44 }]);
  const count = (GRID + 1) * (GRID + 1) * 2;
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
  const poles = new THREE.InstancedMesh(poleGeo, vertexMaterial, count);
  const dummy = new THREE.Object3D();
  let n = 0;
  const headIndex = [];
  for (let i = 0; i <= GRID; i += 1) {
    headIndex[i] = [];
    for (let j = 0; j <= GRID; j += 1) {
      const spots = [
        [lineC(i) + 8, lineC(j) - 8],
        [lineC(i) - 8, lineC(j) + 8],
      ];
      headIndex[i][j] = [];
      for (const [x, z] of spots) {
        dummy.position.set(x, 0.28, z);
        dummy.updateMatrix();
        poles.setMatrixAt(n, dummy.matrix);
        dummy.position.set(x, 5.3, z);
        dummy.updateMatrix();
        heads.setMatrixAt(n, dummy.matrix);
        headIndex[i][j].push(n);
        n += 1;
      }
    }
  }
  game.scene.add(heads, poles);
  const COL = { green: new THREE.Color(0x2fe05a), yellow: new THREE.Color(0xffc933), red: new THREE.Color(0xff3b30) };

  /** State of the light a car moving along `axis` sees at intersection (i, j). */
  const lightState = (axis, i, j) => {
    const off = ((i + j) % 2) * (CYCLE / 2);
    const t = (api.time + off + (axis === 'x' ? CYCLE / 2 : 0)) % CYCLE;
    if (t < 8) return 'green';
    if (t < 10) return 'yellow';
    return 'red';
  };
  api.lightState = lightState;

  let lastPaint = -1;
  const repaint = () => {
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        const [a, b] = headIndex[i][j];
        heads.setColorAt(a, COL[lightState('z', i, j)]);
        heads.setColorAt(b, COL[lightState('x', i, j)]);
      }
    }
    heads.instanceColor.needsUpdate = true;
  };
  repaint();

  // ----- lane following
  /**
   * Drive `car` along its lane for one step. ai = { axis, line, dir, plan }.
   * opts: cruise (m/s), ignoreLights, choose(options) for steering a route.
   */
  api.driveLane = (car, dt, opts = {}) => {
    const ai = car.ai;
    const [dx, dz] = aiDir(ai);
    const s = ai.axis === 'z' ? car.z : car.x;
    const idx = (s - C0) / PITCH;
    let k = ai.dir > 0 ? Math.floor(idx) + 1 : Math.ceil(idx) - 1;
    k = clamp(k, 0, GRID);
    const dd = Math.max(0, (C0 + k * PITCH - s) * ai.dir);
    if (!ai.plan || ai.plan.k !== k || ai.plan.axis !== ai.axis) ai.plan = planTurn(ai, k, opts.choose);
    const plan = ai.plan;

    // commit a turn when the car reaches its trigger distance
    const trigger = plan.turn === 'r' ? 6.5 : plan.turn === 'l' ? 1.6 : plan.turn === 'u' ? 2 : -1;
    if (plan.turn !== 's' && dd < trigger) {
      ai.axis = plan.newAxis;
      if (plan.turn !== 'u') ai.line = k;
      ai.dir = plan.dir;
      ai.plan = null;
      return api.driveLane(car, dt, opts);
    }

    // speed budget
    let allowed = opts.cruise ?? 13;
    if (plan.turn !== 's' && dd < 26) allowed = Math.min(allowed, 7);
    if (!opts.ignoreLights && dd > 2.5 && dd < 60) {
      const li = ai.axis === 'z' ? ai.line : k;
      const lj = ai.axis === 'z' ? k : ai.line;
      const st = lightState(ai.axis, li, lj);
      if (st === 'red' || (st === 'yellow' && dd > Math.max(3, car.f * 1.1))) {
        allowed = Math.min(allowed, Math.sqrt(Math.max(0, 2 * 5 * (dd - 8))));
      }
    }
    // cars ahead
    const sx = dx;
    const sz = dz;
    for (const o of game.vehicles.list) {
      if (o === car || o.hp <= 0) continue;
      const ox = o.x - car.x;
      const oz = o.z - car.z;
      if (ox * ox + oz * oz > 900) continue;
      const along = ox * sx + oz * sz;
      const lat = ox * -sz + oz * sx;
      // blocking means overlapping our lane: the curb lane where cars park is 2.4 m to the side
      if (along > 0 && Math.abs(lat) < (car.spec.wid + o.spec.wid) / 2 + 0.1) {
        const gap = along - (car.spec.len + o.spec.len) / 2;
        const ofw = o.vx * sx + o.vz * sz;
        allowed = Math.min(allowed, Math.max(0, ofw) + (gap - 3.5) * 1.6);
        if (gap < 2) allowed = 0;
      }
    }
    // people ahead
    const p = game.player;
    const consider = (x, z) => {
      const ox = x - car.x;
      const oz = z - car.z;
      const along = ox * sx + oz * sz;
      if (along < 0 || along > 14) return;
      const lat = ox * -sz + oz * sx;
      if (Math.abs(lat) < 2.2) allowed = Math.min(allowed, Math.max(0, (along - 3.2) * 1.4));
    };
    if (!p.car) consider(p.x, p.z);
    for (const a of game.peds.list) if (!a.dead) consider(a.x, a.z);

    // control
    const err = allowed - car.f;
    car.input.throttle = err > 0.4 ? clamp(err / 3.5, 0.25, 1) : 0;
    car.input.brake = err < -1 ? clamp(-err / 6, 0.1, 1) : 0;
    car.input.handbrake = false;
    // steering: chase a point on the lane ahead
    const look = clamp(5 + Math.abs(car.f) * 0.55, 6, 17);
    const lane = laneCoord(ai);
    const tx = ai.axis === 'z' ? lane : car.x + dx * look;
    const tz = ai.axis === 'z' ? car.z + dz * look : lane;
    const want = Math.atan2(tx - car.x, tz - car.z);
    const e = wrapPi(want - car.psi);
    car.input.steer = clamp(-e * 1.9, -1, 1);
    return { dd, allowed };
  };

  // ----- spawning
  const farFromCars = (x, z, d) => {
    for (const c of game.vehicles.list) if (Math.abs(c.x - x) < d && Math.abs(c.z - z) < d) return false;
    return true;
  };

  api.spawnTrafficCar = (x, z, ai, type) => {
    const t = type ?? pick(AMBIENT_TYPES);
    const [dx, dz] = aiDir(ai);
    const car = game.vehicles.spawn(t, undefined, x, z, Math.atan2(dx, dz), 'traffic');
    car.ai = ai;
    car.driver = 'npc';
    car.cruise = rr(10.5, 15);
    car.vx = dx * 6;
    car.vz = dz * 6;
    return car;
  };

  /** A random lane position near (cx, cz), at least `minD` from the point. */
  function randomLane(cx, cz, minD, maxD) {
    for (let tries = 0; tries < 20; tries += 1) {
      const axis = rand() < 0.5 ? 'x' : 'z';
      const dir = rand() < 0.5 ? 1 : -1;
      const perp = axis === 'z' ? cx : cz;
      const along = axis === 'z' ? cz : cx;
      const line = clamp(Math.round((perp - C0) / PITCH) + ri(-3, 3), 0, GRID);
      const s = clamp(along + rr(-maxD, maxD), C0 + 14, C0 + GRID * PITCH - 14);
      const ai = { axis, line, dir, plan: null };
      const lane = laneCoord(ai);
      // keep clear of intersection boxes
      const rem = ((s - C0) % PITCH + PITCH) % PITCH;
      if (rem < ROAD_W / 2 + 3 || rem > PITCH - ROAD_W / 2 - 3) continue;
      const x = axis === 'z' ? lane : s;
      const z = axis === 'z' ? s : lane;
      const d = dist(x, z, cx, cz);
      if (d < minD || d > maxD) continue;
      if (!farFromCars(x, z, 7)) continue;
      return { x, z, ai };
    }
    return null;
  }
  api.randomLane = randomLane;

  /** Give a car that left the lanes (a police car mid-chase) the nearest lane to follow again. */
  api.snapLane = (car) => {
    const sx = Math.sin(car.psi);
    const cz = Math.cos(car.psi);
    const axis = Math.abs(sx) > Math.abs(cz) ? 'x' : 'z';
    const dir = (axis === 'x' ? Math.sign(sx) : Math.sign(cz)) || 1;
    const perp = axis === 'x' ? car.z : car.x;
    car.ai = { axis, line: clamp(Math.round((perp - C0) / PITCH), 0, GRID), dir, plan: null };
  };

  api.populate = (cx, cz, nCars, minD = 25) => {
    let guard = 0;
    let live = game.vehicles.list.filter((c) => c.controller === 'traffic').length;
    while (live < nCars && guard++ < 120) {
      const l = randomLane(cx, cz, minD, 240);
      if (!l) continue;
      api.spawnTrafficCar(l.x, l.z, l.ai);
      live += 1;
    }
  };

  api.parkCars = (cx, cz, nCars, minD = 14) => {
    let guard = 0;
    let made = 0;
    while (made < nCars && guard++ < 200) {
      const axis = rand() < 0.5 ? 'x' : 'z';
      const side = rand() < 0.5 ? 1 : -1;
      const perp = axis === 'z' ? cx : cz;
      const along = axis === 'z' ? cz : cx;
      const line = clamp(Math.round((perp - C0) / PITCH) + ri(-4, 4), 0, GRID);
      const s = clamp(along + rr(-260, 260), C0 + 20, C0 + GRID * PITCH - 20);
      const rem = ((s - C0) % PITCH + PITCH) % PITCH;
      if (rem < ROAD_W / 2 + 8 || rem > PITCH - ROAD_W / 2 - 8) continue;
      const dir = axis === 'z' ? -side : side;
      const lat = lineC(line) + side * CURB_OFFSET;
      const x = axis === 'z' ? lat : s;
      const z = axis === 'z' ? s : lat;
      if (dist(x, z, cx, cz) < minD || !farFromCars(x, z, 5.5)) continue;
      const type = rand() < 0.15 ? 'sports' : pick(['sedan', 'sedan', 'pickup', 'sedan', 'taxi']);
      const car = game.vehicles.spawn(type, undefined, x, z, Math.atan2(axis === 'z' ? 0 : dir, axis === 'z' ? dir : 0), 'parked');
      car.owner = rand() < 0.4;
      made += 1;
    }
  };

  api.update = (dt) => {
    api.time += dt;
    const phase = Math.floor(api.time / (CYCLE / 4));
    if (phase !== lastPaint) {
      lastPaint = phase;
      repaint();
    }
    const p = game.player;
    const list = game.vehicles.list;
    let live = 0;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const car = list[i];
      if (car.controller !== 'traffic') continue;
      live += 1;
      if (car.hp <= 0) {
        car.controller = 'wreck';
        car.ai = null;
        continue;
      }
      if (car.driver === 'player') continue;
      const r = api.driveLane(car, dt, { cruise: car.cruise });
      void r;
      // unstick / recycle
      if (car.speed < 0.5 && car.input.throttle > 0.1) car.stuck = (car.stuck ?? 0) + dt;
      else car.stuck = 0;
      if (car.stuck > 9) {
        car.input.throttle = 0;
        car.input.brake = 1;
        car.input.steer = rand() < 0.5 ? 1 : -1;
        if (car.stuck > 11) car.stuck = 0;
      }
      const d = dist(car.x, car.z, p.x, p.z);
      if (d > 280 || (car.stuck > 8 && d > 70)) {
        game.vehicles.remove(car);
        live -= 1;
      }
    }
    api.respawnT = (api.respawnT ?? 0) - dt;
    if (live < COUNTS.traffic && api.respawnT <= 0 && game.running) {
      api.respawnT = 0.4;
      const l = randomLane(p.x, p.z, 90, 250);
      if (l) api.spawnTrafficCar(l.x, l.z, l.ai);
    }
    // parked cars thin out far away and come back near the player
    api.parkT = (api.parkT ?? 0) - dt;
    if (api.parkT <= 0 && game.running) {
      api.parkT = 1.5;
      const parked = list.filter((c) => c.controller === 'parked' && !c.mission && c.driver === null);
      for (const c of parked) {
        if (dist(c.x, c.z, p.x, p.z) > 320) game.vehicles.remove(c);
      }
      if (parked.length < COUNTS.parked) api.parkCars(p.x, p.z, 1, 70);
    }
  };

  api.CAR_TYPES = CAR_TYPES;
  return api;
}
