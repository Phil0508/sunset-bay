// A shared on-foot actor: pedestrians, police officers and gang members are all Actors with a
// kind-specific brain elsewhere. This file owns what they have in common: the body (a posed
// low-poly human), health and death, knockback, colliding with buildings and parked cars, and
// being run over.
import { buildHuman, animateHuman, randomOutfit } from './models.js';
import { rand, wrapPi, clamp } from './util.js';

export class Actor {
  constructor(game, kind, x, z, styleOverride) {
    this.kind = kind;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.yaw = rand() * Math.PI * 2;
    this.hp = kind === 'ped' ? 30 : kind === 'cop' ? 70 : 60;
    this.maxHp = this.hp;
    this.rig = buildHuman(styleOverride ?? randomOutfit(rand, kind));
    this.group = this.rig.group;
    this.t = rand() * 10;
    this.speed = 0;
    this.dead = false;
    this.deadT = 0;
    this.kx = 0;
    this.kz = 0;
    this.aim = false;
    this.punchT = 0;
    this.stun = 0;
    this.radius = 0.42;
    this.alive = true;
    game.scene.add(this.group);
    this.game = game;
  }
}

/** Damage an actor. Returns true when this blow killed it. */
export function hurt(game, actor, amount, fromX, fromZ, byPlayer = false) {
  if (actor.dead) return false;
  actor.hp -= amount;
  game.fx.blood(actor.x, 1.2, actor.z);
  const d = Math.hypot(actor.x - fromX, actor.z - fromZ) || 1;
  actor.kx += ((actor.x - fromX) / d) * Math.min(6, amount * 0.25);
  actor.kz += ((actor.z - fromZ) / d) * Math.min(6, amount * 0.25);
  actor.stun = 0.25;
  actor.lastHurtByPlayer = byPlayer;
  if (actor.hp <= 0) {
    actor.dead = true;
    actor.deadT = 0;
    actor.speed = 0;
    actor.rig.gun.visible = false;
    actor.killedByPlayer = byPlayer;
    game.onActorKilled?.(actor, byPlayer);
    return true;
  }
  game.onActorHurt?.(actor, byPlayer);
  return false;
}

/** Move an actor by (dx, dz), sliding along buildings and out of parked or slow cars. */
export function moveActor(game, a, dx, dz) {
  let nx = a.x + dx;
  let nz = a.z + dz;
  const r = game.world.collide(nx, nz, a.radius);
  nx = r.x;
  nz = r.z;
  for (const car of game.vehicles.list) {
    if (car.speed > 3) continue;
    const ddx = nx - car.x;
    const ddz = nz - car.z;
    if (ddx * ddx + ddz * ddz > 16) continue;
    const s = Math.sin(car.psi);
    const c = Math.cos(car.psi);
    const along = ddx * s + ddz * c;
    const lat = ddx * -c + ddz * s;
    const hl = car.spec.len / 2 + a.radius;
    const hw = car.spec.wid / 2 + a.radius;
    if (Math.abs(along) < hl && Math.abs(lat) < hw) {
      const pushA = hl - Math.abs(along);
      const pushL = hw - Math.abs(lat);
      if (pushL < pushA) {
        const sgn = lat >= 0 ? 1 : -1;
        nx += -c * sgn * pushL;
        nz += s * sgn * pushL;
      } else {
        const sgn = along >= 0 ? 1 : -1;
        nx += s * sgn * pushA;
        nz += c * sgn * pushA;
      }
    }
  }
  a.x = nx;
  a.z = nz;
}

/** Apply knockback decay and keep the body inside the world. Call once per step for live and dead actors. */
export function applyKnock(game, a, dt) {
  if (Math.abs(a.kx) + Math.abs(a.kz) > 0.05) {
    moveActor(game, a, a.kx * dt, a.kz * dt);
    const damp = Math.exp(-6 * dt);
    a.kx *= damp;
    a.kz *= damp;
  }
}

/** Run-over test against every moving car; returns the car that hit it, if any. */
export function carHit(game, a) {
  for (const car of game.vehicles.list) {
    const sp = car.speed;
    if (sp < 3.2) continue;
    const dx = a.x - car.x;
    const dz = a.z - car.z;
    if (dx * dx + dz * dz > 20) continue;
    const s = Math.sin(car.psi);
    const c = Math.cos(car.psi);
    const along = dx * s + dz * c;
    const lat = dx * -c + dz * s;
    if (Math.abs(along) < car.spec.len / 2 + 0.3 && Math.abs(lat) < car.spec.wid / 2 + 0.35) return car;
  }
  return null;
}

export function syncActor(a, dt) {
  a.group.position.set(a.x, a.y, a.z);
  a.group.rotation.y = a.yaw;
  if (a.dead) {
    a.deadT += dt;
    const k = Math.min(1, a.deadT * 4);
    a.rig.root.rotation.x = -1.5 * k;
    a.rig.root.position.y = 0.18 * k;
    a.rig.blob.visible = false;
    const sink = clamp((a.deadT - 7) / 2, 0, 1);
    a.group.position.y = a.y - sink * 0.6;
    if (a.deadT > 9) {
      a.alive = false;
      a.game.scene.remove(a.group);
    }
    return;
  }
  a.t += dt;
  animateHuman(a.rig, a.t, a.speed, a.aim, a.punchT > 0 ? 1 - a.punchT / 0.3 : 0);
  if (a.punchT > 0) a.punchT -= dt;
}

export function turnToward(a, targetYaw, rate, dt) {
  const d = wrapPi(targetYaw - a.yaw);
  a.yaw = wrapPi(a.yaw + clamp(d, -rate * dt, rate * dt));
}
