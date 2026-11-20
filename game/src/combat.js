// Combat: fists and a pistol. Bullets are hitscan rays walked in half-metre steps against buildings,
// cars and bodies. Also home to the Razor Kings gang members who fight Mara in "The Drop", the ammo
// / health / cash pickups, and explosions from burning cars.
import * as THREE from 'three';
import { PLAYER, lineC, GRID } from './config.js';
import { Actor, hurt, moveActor, applyKnock, carHit, syncActor, turnToward } from './characters.js';
import { mergeParts, vertexMaterial } from './models.js';
import { rand, rr, ri, dist, wrapPi } from './util.js';
import { sfxShot, sfxBang, sfxPickup } from './audio.js';

const RANGE = 75;

const pickupGeos = {
  ammo: mergeParts([
    { w: 0.5, h: 0.28, d: 0.34, y: 0.2, c: 0x3a3f2f },
    { w: 0.12, h: 0.2, d: 0.12, x: -0.12, y: 0.44, c: 0xf2c230 },
    { w: 0.12, h: 0.2, d: 0.12, x: 0.12, y: 0.44, c: 0xf2c230 },
  ]),
  health: mergeParts([
    { w: 0.5, h: 0.4, d: 0.5, y: 0.3, c: 0xffffff },
    { w: 0.34, h: 0.06, d: 0.1, y: 0.51, c: 0xe0242e },
    { w: 0.1, h: 0.06, d: 0.34, y: 0.51, c: 0xe0242e },
  ]),
  cash: mergeParts([
    { w: 0.5, h: 0.12, d: 0.3, y: 0.15, c: 0x3fae5a },
    { w: 0.2, h: 0.14, d: 0.32, y: 0.15, c: 0xdff5e1 },
  ]),
  package: mergeParts([
    { w: 0.7, h: 0.45, d: 0.5, y: 0.35, c: 0x7a4a24 },
    { w: 0.1, h: 0.12, d: 0.52, y: 0.62, c: 0xf2c230 },
    { w: 0.72, h: 0.06, d: 0.08, y: 0.4, c: 0xf2c230 },
  ]),
};

export function createCombat(game) {
  const api = { enemies: [], pickups: [] };

  // ------------------------------------------------------------ pickups
  game.pickups = {
    spawn(kind, x, z, amount = 0, extra = {}) {
      const mesh = new THREE.Mesh(pickupGeos[kind], vertexMaterial);
      mesh.position.set(x, 0.3, z);
      game.scene.add(mesh);
      const item = { kind, x, z, amount, mesh, t: rand() * 6, life: kind === 'cash' ? 40 : Infinity, ...extra };
      api.pickups.push(item);
      return item;
    },
    remove(item) {
      game.scene.remove(item.mesh);
      const k = api.pickups.indexOf(item);
      if (k >= 0) api.pickups.splice(k, 1);
    },
  };

  api.scatterPickups = (cx, cz, n) => {
    for (let k = 0; k < n; k += 1) {
      const i = ri(1, GRID - 1);
      const j = ri(1, GRID - 1);
      const sx = rand() < 0.5 ? 1 : -1;
      const x = lineC(i) + sx * 8.5;
      const z = lineC(j) + rr(-20, 20);
      if (dist(x, z, cx, cz) < 10) continue;
      game.pickups.spawn(k % 2 ? 'health' : 'ammo', x, z, k % 2 ? 35 : 12);
    }
    const [dx, dz] = game.POI.dispatch;
    game.pickups.spawn('ammo', dx + 4, dz + 2, 18);
    game.pickups.spawn('health', dx - 4, dz + 2, 35);
  };

  function updatePickups(dt) {
    const p = game.player;
    for (let i = api.pickups.length - 1; i >= 0; i -= 1) {
      const it = api.pickups[i];
      it.t += dt;
      it.mesh.rotation.y = it.t * 2;
      it.mesh.position.y = 0.35 + Math.sin(it.t * 3) * 0.1;
      it.life -= dt;
      if (it.life <= 0) {
        game.pickups.remove(it);
        continue;
      }
      if (p.car || game.state !== 'play') continue;
      if (Math.hypot(p.x - it.x, p.z - it.z) > 1.7) continue;
      if (it.kind === 'ammo') {
        p.ammo = Math.min(99, p.ammo + it.amount);
        game.hud.toast(`+${it.amount} ammo`);
      } else if (it.kind === 'health') {
        if (p.health >= PLAYER.health) continue;
        p.heal(it.amount);
        game.hud.toast('+ health');
      } else if (it.kind === 'cash') {
        game.money += it.amount;
        game.hud.toast(`+$${it.amount}`);
      } else if (it.kind === 'package') {
        game.missions.onPackage?.(it);
        continue;
      }
      sfxPickup();
      game.pickups.remove(it);
    }
  }

  // ------------------------------------------------------------ hitscan
  const result = { kind: 'none', x: 0, y: 0, z: 0, target: null };

  const eachActor = (fn) => {
    for (const a of game.peds.list) fn(a);
    for (const a of game.police.cops) fn(a);
    for (const a of api.enemies) fn(a);
  };

  /** Walk a ray; returns the first thing hit. `skipCar` is the shooter's own car. */
  function trace(ox, oy, oz, dx, dy, dz, shooter, skipCar) {
    const len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
    result.kind = 'none';
    result.target = null;
    const step = 0.5;
    const p = game.player;
    for (let s = 0; s < RANGE; s += step) {
      const x = ox + dx * s;
      const y = oy + dy * s;
      const z = oz + dz * s;
      result.x = x;
      result.y = y;
      result.z = z;
      if (game.world.solidAt(x, y, z)) {
        result.kind = 'world';
        return result;
      }
      if (y > 0 && y < 1.95) {
        let hit = null;
        eachActor((a) => {
          if (hit || a.dead || a === shooter) return;
          if ((a.x - x) ** 2 + (a.z - z) ** 2 < 0.3) hit = a;
        });
        if (!hit && shooter !== p && !p.car && p.health > 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < 0.3) hit = p;
        if (hit) {
          result.kind = 'actor';
          result.target = hit;
          return result;
        }
      }
      if (y < 1.7) {
        for (const car of game.vehicles.list) {
          if (car === skipCar) continue;
          const cx = x - car.x;
          const cz = z - car.z;
          if (cx * cx + cz * cz > 14) continue;
          const sn = Math.sin(car.psi);
          const cs = Math.cos(car.psi);
          const along = cx * sn + cz * cs;
          const lat = cx * -cs + cz * sn;
          if (Math.abs(along) < car.spec.len / 2 && Math.abs(lat) < car.spec.wid / 2) {
            result.kind = 'car';
            result.target = car;
            return result;
          }
        }
      }
    }
    return result;
  }

  function applyHit(hit, dmg, shooter, byPlayer) {
    if (hit.kind === 'actor') {
      const a = hit.target;
      const head = hit.y > 1.5;
      if (a === game.player) a.damage(dmg, shooter.x, shooter.z);
      else {
        hurt(game, a, head ? dmg * 1.8 : dmg, shooter.x, shooter.z, byPlayer);
        game.fx.sparks(hit.x, hit.y, hit.z, 3);
      }
    } else if (hit.kind === 'car') {
      const car = hit.target;
      game.vehicles.damage(car, byPlayer ? 9 : 6, shooter);
      game.fx.sparks(hit.x, hit.y, hit.z, 5);
      if (car.driver === 'player') game.player.damage(5, shooter.x, shooter.z);
    } else if (hit.kind === 'world') {
      game.fx.sparks(hit.x, Math.max(0.2, hit.y), hit.z, 4);
    }
  }

  api.playerShoot = () => {
    const p = game.player;
    const ray = game.cam.aimRay();
    // a small spread that tightens while standing still
    const sp = p.speed > 2 ? 0.015 : 0.006;
    const hit = trace(ray.ox, ray.oy, ray.oz, ray.dx + rr(-sp, sp), ray.dy + rr(-sp, sp), ray.dz + rr(-sp, sp), p, p.car);
    const mx = p.x + Math.sin(p.yaw) * 0.6 + Math.cos(p.yaw) * -0.15;
    const mz = p.z + Math.cos(p.yaw) * 0.6 - Math.sin(p.yaw) * -0.15;
    game.fx.muzzle(mx, 1.35 + p.y, mz);
    game.fx.tracer(mx, 1.35 + p.y, mz, hit.x, hit.y, hit.z);
    sfxShot(1);
    game.peds.alarm(p.x, p.z, 38);
    game.police.crime('shoot', p.x, p.z);
    p.yaw = game.cam.yaw;
    applyHit(hit, PLAYER.pistolDamage, p, true);
    for (const e of api.enemies) if (!e.dead && dist(e.x, e.z, p.x, p.z) < 45) e.alert = 6;
    for (const c of game.police.cops) if (!c.dead && dist(c.x, c.z, p.x, p.z) < 60) game.police.crime('shoot', p.x, p.z);
  };

  /** Any non-player shooter (cop or gang member) fires at the player. */
  api.enemyShoot = (a, accuracy) => {
    const p = game.player;
    const tx = p.x + rr(-accuracy, accuracy);
    const tz = p.z + rr(-accuracy, accuracy);
    const ox = a.x + Math.sin(a.yaw) * 0.6;
    const oz = a.z + Math.cos(a.yaw) * 0.6;
    const ty = p.car ? 0.9 : 1.1 + p.y;
    const hit = trace(ox, 1.35, oz, tx - ox, ty - 1.35 + rr(-0.15, 0.15), tz - oz, a, null);
    game.fx.muzzle(ox, 1.35, oz);
    game.fx.tracer(ox, 1.35, oz, hit.x, hit.y, hit.z);
    if (dist(a.x, a.z, p.x, p.z) < 50) sfxShot(0.6);
    applyHit(hit, a.kind === 'cop' ? 7 : 8, a, false);
    a.punchT = 0;
  };

  api.punch = () => {
    const p = game.player;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let best = null;
    let bd = 1.9;
    eachActor((a) => {
      if (a.dead) return;
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > bd) return;
      if ((dx * fx + dz * fz) / (d || 1) < 0.3) return;
      best = a;
      bd = d;
    });
    game.peds.alarm(p.x, p.z, 12);
    if (best) {
      hurt(game, best, PLAYER.punchDamage, p.x, p.z, true);
      game.fx.sparks(best.x, 1.2, best.z, 3);
    }
  };

  // ------------------------------------------------------------ explosions
  game.explode = (x, z, radius, dmg, source) => {
    game.fx.explosion(x, 0.5, z);
    sfxBang();
    game.shake = Math.max(game.shake, Math.max(0, 0.7 - dist(x, z, game.player.x, game.player.z) / 60));
    const near = (ax, az) => Math.max(0, 1 - dist(x, z, ax, az) / radius);
    eachActor((a) => {
      const f = near(a.x, a.z);
      if (f > 0 && !a.dead) hurt(game, a, dmg * f, x, z, false);
    });
    const p = game.player;
    const fp = near(p.x, p.z);
    if (fp > 0) {
      const inCar = p.car && p.car === source;
      if (inCar) p.exit();
      p.damage(dmg * fp * 0.9, x, z);
    }
    for (const car of game.vehicles.list) {
      if (car === source) continue;
      const f = near(car.x, car.z);
      if (f > 0) {
        game.vehicles.damage(car, dmg * f, 'blast');
        car.vx += ((car.x - x) / radius) * 6 * f;
        car.vz += ((car.z - z) / radius) * 6 * f;
      }
    }
    game.peds.alarm(x, z, 45);
    game.police.crime('explosion', x, z);
  };

  // ------------------------------------------------------------ gang members
  api.spawnGang = (x, z, opts = {}) => {
    const a = new Actor(game, 'gang', x, z);
    a.home = [x, z];
    a.alert = opts.alert ?? 0;
    a.fireCd = rr(0.6, 1.6);
    a.strafe = rand() < 0.5 ? 1 : -1;
    a.strafeT = rr(1, 2.5);
    a.mission = opts.mission ?? null;
    a.aware = false;
    a.hp = a.maxHp = 58;
    api.enemies.push(a);
    return a;
  };

  function updateEnemy(a, dt) {
    const p = game.player;
    const d = dist(a.x, a.z, p.x, p.z);
    const los = d < 70 && game.world.los(a.x, a.z, p.x, p.z);
    if ((d < 34 && los) || a.alert > 0) a.aware = true;
    if (a.alert > 0) a.alert -= dt;
    if (d > 110 && !a.mission) a.aware = false;
    let speed = 0;
    a.aim = false;
    if (a.aware && game.state === 'play') {
      const toYaw = Math.atan2(p.x - a.x, p.z - a.z);
      turnToward(a, toYaw, 9, dt);
      if (d > 13 || !los) {
        speed = 4.2;
        const dx = (p.x - a.x) / (d || 1);
        const dz = (p.z - a.z) / (d || 1);
        moveActor(game, a, dx * speed * dt, dz * speed * dt);
      } else if (d < 6) {
        speed = 2.5;
        moveActor(game, a, ((a.x - p.x) / (d || 1)) * speed * dt, ((a.z - p.z) / (d || 1)) * speed * dt);
      } else {
        a.strafeT -= dt;
        if (a.strafeT <= 0) {
          a.strafeT = rr(1, 2.5);
          a.strafe *= -1;
        }
        speed = 2;
        const dx = (p.z - a.z) / (d || 1);
        const dz = -(p.x - a.x) / (d || 1);
        moveActor(game, a, dx * a.strafe * speed * dt, dz * a.strafe * speed * dt);
      }
      if (los && d < 34) {
        a.aim = true;
        a.fireCd -= dt;
        if (a.fireCd <= 0) {
          a.fireCd = rr(0.8, 1.5);
          api.enemyShoot(a, 0.6 + d * 0.05);
        }
      }
    } else {
      const dh = dist(a.x, a.z, a.home[0], a.home[1]);
      if (dh > 3) {
        speed = 1.5;
        moveActor(game, a, ((a.home[0] - a.x) / dh) * speed * dt, ((a.home[1] - a.z) / dh) * speed * dt);
        turnToward(a, Math.atan2(a.home[0] - a.x, a.home[1] - a.z), 6, dt);
      }
    }
    a.speed = speed;
  }

  game.onActorHurt = (a, byPlayer) => {
    if (!byPlayer) return;
    if (a.kind === 'ped') {
      game.peds.alarm(a.x, a.z, 16);
      game.police.crime('punch', a.x, a.z);
    } else if (a.kind === 'cop') game.police.crime('hitCop', a.x, a.z);
    else if (a.kind === 'gang') a.alert = 8;
  };

  game.onActorKilled = (a, byPlayer) => {
    if (a.kind === 'gang') {
      if (rand() < 0.6) game.pickups.spawn('ammo', a.x, a.z, 10);
      game.missions.onKill?.(a);
    }
    if (!byPlayer) return;
    if (a.kind === 'ped') {
      game.police.crime('killPed', a.x, a.z);
      if (rand() < 0.5) game.pickups.spawn('cash', a.x, a.z, ri(15, 90));
    } else if (a.kind === 'cop') {
      game.police.crime('killCop', a.x, a.z);
      game.pickups.spawn('ammo', a.x, a.z, 8);
    }
  };

  api.update = (dt) => {
    for (let i = api.enemies.length - 1; i >= 0; i -= 1) {
      const a = api.enemies[i];
      if (!a.dead) {
        const hitter = carHit(game, a);
        if (hitter && !a.runOver) {
          a.runOver = true;
          a.kx += hitter.vx * 0.6;
          a.kz += hitter.vz * 0.6;
          hurt(game, a, hitter.speed * 4, hitter.x, hitter.z, hitter.driver === 'player');
        } else if (!hitter) a.runOver = false;
        if (!a.dead) updateEnemy(a, dt);
      }
      applyKnock(game, a, dt);
      syncActor(a, dt);
      if (!a.alive) api.enemies.splice(i, 1);
    }
    updatePickups(dt);
  };

  api.clearEnemies = () => {
    for (const a of api.enemies) game.scene.remove(a.group);
    api.enemies.length = 0;
  };

  void wrapPi;
  return api;
}
