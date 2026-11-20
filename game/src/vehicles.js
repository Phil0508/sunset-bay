// Cars: one Car class for the player's ride, traffic, police, parked cars and mission cars. Each
// frame a controller (the player, traffic AI or police AI) writes `car.input`, and the same arcade
// physics moves every car: throttle, brake and reverse along the heading, lateral grip that the
// handbrake loosens into drifts, building collisions, car-to-car impulses, damage, smoke, fire.
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';
import { buildCarMesh, sirenMats } from './models.js';
import { clamp, rand, rr, wrapPi } from './util.js';
import { sfxCrash } from './audio.js';

let nextId = 1;

export class Car {
  constructor(type, color, x, z, psi, controller = 'parked') {
    this.id = nextId++;
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.x = x;
    this.z = z;
    this.psi = psi;
    this.vx = 0;
    this.vz = 0;
    this.f = 0; // forward speed, refreshed every step
    this.l = 0; // lateral slide speed
    this.steerS = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.hp = this.spec.hp;
    this.controller = controller;
    this.driver = null; // 'player' | 'npc' | null
    this.alive = true;
    this.burn = 0;
    this.exploded = false;
    this.smokeT = 0;
    this.skidT = 0;
    this.owner = false; // someone is watching this parked car
    this.mission = null;
    this.color = color;
    const m = buildCarMesh(type, color);
    this.group = m.group;
    this.paintMat = m.paintMat;
    this.bars = m.bars;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = psi;
    this.radius = this.spec.wid / 2 + 0.05;
    const off = this.spec.len / 2 - 0.95;
    this.circles = [off, -off];
    this.speedKmh = 0;
    this.crashCooldown = 0;
    this.siren = false;
    this.targetSpeed = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get wrecked() {
    return this.hp <= 0;
  }
}

export function createVehicles(game) {
  const list = [];
  const api = { list };

  api.spawn = (type, color, x, z, psi, controller = 'parked') => {
    const car = new Car(type, color ?? CAR_TYPES[type].colors[Math.floor(rand() * CAR_TYPES[type].colors.length)], x, z, psi, controller);
    game.scene.add(car.group);
    list.push(car);
    return car;
  };

  api.remove = (car) => {
    car.alive = false;
    game.scene.remove(car.group);
    car.paintMat.dispose();
    const k = list.indexOf(car);
    if (k >= 0) list.splice(k, 1);
  };

  api.damage = (car, amount, source) => {
    if (car.hp <= 0 || amount <= 0) return;
    car.hp -= amount;
    car.lastHurtBy = source;
    if (car.hp <= 0) {
      car.hp = 0;
      car.burn = 0;
      car.paintMat.color.multiplyScalar(0.25);
      game.onCarWrecked?.(car);
    } else if (car.hp < car.spec.hp * 0.5) {
      const k = 0.55 + (car.hp / car.spec.hp) * 0.9;
      car.paintMat.color.setHex(car.color).multiplyScalar(k);
    }
  };

  api.nearest = (x, z, maxDist, filter) => {
    let best = null;
    let bd = maxDist;
    for (const c of list) {
      if (filter && !filter(c)) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };

  function stepCar(car, dt) {
    const sleeping = car.controller === 'parked' && car.speed < 0.15 && !car.input.throttle;
    if (sleeping) {
      car.vx = car.vz = 0;
      return;
    }
    const spec = car.spec;
    const inp = car.input;
    const wrecked = car.hp <= 0;
    const throttle = wrecked ? 0 : inp.throttle;
    const brake = wrecked ? 0.4 : inp.brake;
    const steerIn = wrecked ? 0 : inp.steer;

    // 1. steering rotates the heading (the velocity keeps its old direction, so slides emerge)
    car.steerS += (steerIn - car.steerS) * Math.min(1, dt * 9);
    const fPrev = car.vx * Math.sin(car.psi) + car.vz * Math.cos(car.psi);
    const aF = Math.abs(fPrev);
    let rate = spec.steer * car.steerS * clamp(aF / 5, 0, 1) / (1 + aF / 38);
    if (inp.handbrake) rate *= 1.55;
    car.psi = wrapPi(car.psi - rate * Math.sign(fPrev || 1) * dt);

    // 2. decompose velocity in the new basis
    const dx = Math.sin(car.psi);
    const dz = Math.cos(car.psi);
    const rx = -dz;
    const rz = dx;
    let f = car.vx * dx + car.vz * dz;
    let l = car.vx * rx + car.vz * rz;

    // 3. longitudinal forces
    if (throttle > 0) {
      if (f < -0.5) f += 30 * throttle * dt;
      else f += spec.accel * throttle * (1 - clamp(f / spec.top, 0, 1) ** 2) * dt;
    }
    if (brake > 0) {
      if (f > 0.6) f = Math.max(0, f - 30 * brake * dt);
      else if (!wrecked) f -= spec.accel * 0.55 * brake * dt;
      else f *= 1 - 3 * dt;
      f = Math.max(f, -spec.top * 0.28);
    }
    const drag = 0.12 + (inp.handbrake ? 0.7 : 0);
    f -= f * drag * dt;
    if (!throttle && !brake) {
      const roll = 1.6 * dt;
      f = Math.abs(f) < roll ? 0 : f - Math.sign(f) * roll;
    }
    // 4. lateral grip
    const grip = spec.grip * (inp.handbrake ? 0.16 : 1);
    l *= Math.exp(-grip * dt);

    car.f = f;
    car.l = l;
    car.vx = dx * f + rx * l;
    car.vz = dz * f + rz * l;

    // 5. integrate and collide
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    for (const off of car.circles) {
      const cx = car.x + dx * off;
      const cz = car.z + dz * off;
      const r = game.world.collide(cx, cz, car.radius);
      if (!r.hit) continue;
      car.x += r.x - cx;
      car.z += r.z - cz;
      const vn = car.vx * r.nx + car.vz * r.nz;
      if (vn < 0) {
        car.vx -= 1.25 * vn * r.nx;
        car.vz -= 1.25 * vn * r.nz;
        const impact = -vn;
        if (impact > 4 && car.crashCooldown <= 0) {
          car.crashCooldown = 0.25;
          api.damage(car, (impact - 3.5) * 1.5, 'wall');
          game.fx.sparks(cx, 0.8, cz, 6);
          if (car.driver === 'player' || Math.hypot(car.x - game.player.x, car.z - game.player.z) < 40) sfxCrash(impact / 8);
          if (car.driver === 'player') game.shake = Math.max(game.shake, Math.min(0.6, impact / 25));
        }
      }
    }
    car.crashCooldown -= dt;

    // skid marks and dust when the car slides
    const slide = Math.abs(l);
    if ((slide > 3.5 || (inp.handbrake && Math.abs(f) > 8)) && Math.abs(f) > 5) {
      car.skidT -= dt;
      if (car.skidT <= 0) {
        car.skidT = 0.045;
        const w = car.spec.wid / 2 - 0.2;
        const back = -car.spec.len / 2 + 0.9;
        game.fx.skid(car.x + dx * back + rx * w, car.z + dz * back + rz * w, car.psi);
        game.fx.skid(car.x + dx * back - rx * w, car.z + dz * back - rz * w, car.psi);
        game.fx.dust(car.x + dx * back, car.z + dz * back, 1);
      }
    }
  }

  function carVsCar(a, b) {
    const dxm = a.x - b.x;
    const dzm = a.z - b.z;
    const reach = (a.spec.len + b.spec.len) / 2 + 0.5;
    if (dxm * dxm + dzm * dzm > reach * reach) return;
    const ad = [Math.sin(a.psi), Math.cos(a.psi)];
    const bd = [Math.sin(b.psi), Math.cos(b.psi)];
    const ma = a.spec.mass;
    const mb = b.spec.mass;
    for (const oa of a.circles) {
      for (const ob of b.circles) {
        const ax = a.x + ad[0] * oa;
        const az = a.z + ad[1] * oa;
        const bx = b.x + bd[0] * ob;
        const bz = b.z + bd[1] * ob;
        const dx = ax - bx;
        const dz = az - bz;
        const rr2 = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr2 * rr2) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d;
        const nz = dz / d;
        const pen = rr2 - d;
        const wa = mb / (ma + mb);
        const wb = ma / (ma + mb);
        a.x += nx * pen * wa;
        a.z += nz * pen * wa;
        b.x -= nx * pen * wb;
        b.z -= nz * pen * wb;
        const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rv < 0) {
          const j = (-(1 + 0.3) * rv) / (1 / ma + 1 / mb);
          a.vx += (j / ma) * nx;
          a.vz += (j / ma) * nz;
          b.vx -= (j / mb) * nx;
          b.vz -= (j / mb) * nz;
          const impact = -rv;
          if (impact > 3.5 && a.crashCooldown <= 0 && b.crashCooldown <= 0) {
            a.crashCooldown = b.crashCooldown = 0.3;
            api.damage(a, (impact - 3) * 1.3 * (mb / ma), b);
            api.damage(b, (impact - 3) * 1.3 * (ma / mb), a);
            game.fx.sparks((ax + bx) / 2, 0.8, (az + bz) / 2, 6);
            if (a.driver === 'player' || b.driver === 'player' || Math.hypot(ax - game.player.x, az - game.player.z) < 40) sfxCrash(impact / 8);
            if (a.driver === 'player' || b.driver === 'player') game.shake = Math.max(game.shake, Math.min(0.6, impact / 25));
            game.onCarCrash?.(a, b, impact);
          }
          // A shove wakes a parked car and gives it an owner's grudge.
          if (a.controller === 'parked') a.hit = true;
          if (b.controller === 'parked') b.hit = true;
        }
        return;
      }
    }
  }

  api.update = (dt, t) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const car = list[i];
      // The mission engine may keep a car alive; everything else burns out after a while.
      stepCar(car, dt);
      if (car.hp <= 0) {
        car.burn += dt;
        car.smokeT -= dt;
        if (car.smokeT <= 0) {
          car.smokeT = 0.07;
          game.fx.smoke(car.x, 1.0, car.z, 0.1);
          if (car.burn < 6) game.fx.emit(car.x + rr(-0.5, 0.5), 0.9, car.z + rr(-0.8, 0.8), 0, 2, 0, 0.5, 0.1, 0.4, 0xff8a1a);
        }
        if (car.burn > 6 && !car.exploded) {
          car.exploded = true;
          game.explode?.(car.x, car.z, 9, 75, car);
        }
        if (car.burn > 40 && car.driver === null && Math.hypot(car.x - game.player.x, car.z - game.player.z) > 40 && !car.mission) {
          api.remove(car);
          continue;
        }
      } else if (car.hp < car.spec.hp * 0.35) {
        car.smokeT -= dt;
        if (car.smokeT <= 0) {
          car.smokeT = 0.18;
          game.fx.smoke(car.x + Math.sin(car.psi) * car.spec.len * 0.3, 1.0, car.z + Math.cos(car.psi) * car.spec.len * 0.3, 0.8);
        }
      }
      if (car.bars) {
        const on = car.siren && car.hp > 0;
        const ph = Math.floor(t * 6) % 2 === 0;
        car.bars[0].material = on ? (ph ? sirenMats.red : sirenMats.off) : sirenMats.off;
        car.bars[1].material = on ? (ph ? sirenMats.off : sirenMats.blue) : sirenMats.off;
      }
    }
    for (let i = 0; i < list.length; i += 1) for (let k = i + 1; k < list.length; k += 1) carVsCar(list[i], list[k]);
    for (const car of list) {
      car.group.position.set(car.x, 0, car.z);
      const pitch = clamp(-(car.f - (car.prevF ?? 0)) * 0.012, -0.05, 0.05);
      car.prevF = car.f;
      car.group.rotation.set(pitch, car.psi, clamp(car.steerS * car.f * 0.0016, -0.07, 0.07), 'YXZ');
      car.speedKmh = Math.abs(car.f) * 3.6;
    }
  };

  api.carRotationEuler = new THREE.Euler();
  return api;
}
