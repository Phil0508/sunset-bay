// Mara Voss, the player: third-person on foot (walk, run, jump, punch, shoot), and driving any car
// she gets into. Entering a traffic car or a watched parked car is a crime and feeds the wanted
// level; exiting drops her beside the driver's door.
import { PLAYER } from './config.js';
import { Actor, moveActor, syncActor, carHit } from './characters.js';
import { randomOutfit } from './models.js';
import { clamp, rand, smooth, wrapPi } from './util.js';
import { sfxPunch, sfxClick } from './audio.js';

export class Player extends Actor {
  constructor(game, x, z) {
    super(game, 'player', x, z, randomOutfit(rand, 'mara'));
    this.hp = this.maxHp = PLAYER.health;
    this.radius = PLAYER.radius;
    this.health = PLAYER.health;
    this.ammo = PLAYER.ammo;
    this.vy = 0;
    this.vxs = 0;
    this.vzs = 0;
    this.car = null;
    this.shootCd = 0;
    this.punchCd = 0;
    this.aimT = 0;
    this.hitCd = 0;
    this.enterCd = 0;
    this.sprint = false;
    this.rig.gun.visible = true;
  }
}

export function createPlayer(game, x, z) {
  const p = new Player(game, x, z);
  p.game = game;

  p.heal = (n) => {
    p.health = clamp(p.health + n, 0, PLAYER.health);
  };

  /** Damage from bullets, falls, blasts. Cars absorb half of what hits the driver. */
  p.damage = (amount, fx, fz) => {
    if (p.health <= 0 || game.state !== 'play') return;
    p.health -= p.car ? amount * 0.5 : amount;
    game.hud.flashHurt();
    if (!p.car) game.fx.blood(p.x, 1.2, p.z);
    if (fx !== undefined && !p.car) {
      const d = Math.hypot(p.x - fx, p.z - fz) || 1;
      p.vxs += ((p.x - fx) / d) * 1.5;
      p.vzs += ((p.z - fz) / d) * 1.5;
    }
    if (p.health <= 0) {
      p.health = 0;
      game.onPlayerDown('wasted');
    }
  };

  p.nearestEnterable = () => {
    return game.vehicles.nearest(p.x, p.z, 4.4, (c) => c.hp > -1 && !(c.hp <= 0 && c.burn > 1.5) && c.driver !== 'player');
  };

  p.enter = (car) => {
    const wasNpc = car.driver === 'npc';
    if (wasNpc) {
      // pull the driver out: a pedestrian jumps out and runs
      const ped = game.peds.spawn(car.x - Math.cos(car.psi) * 2.2, car.z + Math.sin(car.psi) * 2.2);
      ped.state = 'flee';
      ped.panic = 6;
      ped.fx = -Math.cos(car.psi);
      ped.fz = Math.sin(car.psi);
      game.police.crime(car.type === 'police' ? 'carjackPolice' : 'carjack', car.x, car.z);
    } else if (car.controller === 'parked') {
      game.police.theft(car);
    }
    car.driver = 'player';
    car.controller = 'player';
    car.ai = null;
    car.siren = false;
    p.car = car;
    p.group.visible = false;
    p.enterCd = 0.4;
    game.onEnterCar?.(car);
  };

  p.exit = () => {
    const car = p.car;
    if (!car) return;
    const s = Math.sin(car.psi);
    const c = Math.cos(car.psi);
    const left = [c, -s];
    const w = car.spec.wid / 2 + 0.9;
    const tries = [
      [car.x + left[0] * w, car.z + left[1] * w],
      [car.x - left[0] * w, car.z - left[1] * w],
      [car.x - s * (car.spec.len / 2 + 1), car.z - c * (car.spec.len / 2 + 1)],
      [car.x + s * (car.spec.len / 2 + 1), car.z + c * (car.spec.len / 2 + 1)],
    ];
    let spot = tries[0];
    for (const t of tries) {
      const r = game.world.collide(t[0], t[1], p.radius);
      if (!r.hit) {
        spot = t;
        break;
      }
    }
    p.x = spot[0];
    p.z = spot[1];
    p.yaw = car.psi;
    p.group.visible = true;
    car.driver = null;
    car.controller = 'parked';
    car.input = { throttle: 0, brake: 0.2, steer: 0, handbrake: false };
    p.car = null;
    p.enterCd = 0.3;
    game.onExitCar?.(car);
  };

  p.update = (dt, input, cam) => {
    p.shootCd -= dt;
    p.punchCd -= dt;
    p.hitCd -= dt;
    p.enterCd -= dt;
    p.aimT -= dt;
    if (game.state !== 'play') {
      if (p.car) p.car.input = { throttle: 0, brake: 0.5, steer: 0, handbrake: false };
      return;
    }

    // interact
    if (input.take('KeyE') && p.enterCd <= 0) {
      if (p.car) p.exit();
      else {
        const car = p.nearestEnterable();
        if (car) p.enter(car);
      }
    }

    if (p.car) {
      const car = p.car;
      const inp = car.input;
      const auto = game.autoInput; // scripted driving for screenshot scenes
      inp.throttle = auto ? auto.throttle : input.down('KeyW', 'ArrowUp') ? 1 : 0;
      inp.brake = auto ? 0 : input.down('KeyS', 'ArrowDown') ? 1 : 0;
      inp.steer = auto ? auto.steer : input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
      inp.handbrake = auto ? false : input.down('Space');
      p.x = car.x;
      p.z = car.z;
      p.yaw = car.psi;
      p.speed = car.speed;
      if (car.hp <= 0 && car.burn > 3.5) p.exit();
      input.take('KeyF');
      input.takeClick();
      return;
    }

    // ----- on foot
    const fwdIn = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const strafe = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const cy = cam.yaw;
    const fx = Math.sin(cy);
    const fz = Math.cos(cy);
    const rx = -Math.cos(cy);
    const rz = Math.sin(cy);
    let mx = fx * fwdIn + rx * strafe;
    let mz = fz * fwdIn + rz * strafe;
    const ml = Math.hypot(mx, mz);
    const aiming = input.mouse.right || p.aimT > 0;
    p.aim = aiming;
    if (ml > 0) {
      mx /= ml;
      mz /= ml;
    }
    const running = input.down('ShiftLeft', 'ShiftRight') && !aiming;
    const top = ml > 0 ? (running ? PLAYER.run : PLAYER.walk) : 0;
    p.vxs = smooth(p.vxs, mx * top, 11, dt);
    p.vzs = smooth(p.vzs, mz * top, 11, dt);
    const before = [p.x, p.z];
    moveActor(game, p, p.vxs * dt, p.vzs * dt);
    p.speed = Math.hypot(p.x - before[0], p.z - before[1]) / dt;
    if (aiming) {
      let d = wrapPi(cy - p.yaw);
      p.yaw = wrapPi(p.yaw + clamp(d, -16 * dt, 16 * dt));
    } else if (ml > 0) {
      const d = wrapPi(Math.atan2(mx, mz) - p.yaw);
      p.yaw = wrapPi(p.yaw + clamp(d, -12 * dt, 12 * dt));
    }
    // jump
    if (p.y <= 0.001 && input.take('Space')) p.vy = PLAYER.jump;
    p.vy -= PLAYER.gravity * dt;
    p.y = Math.max(0, p.y + p.vy * dt);
    if (p.y === 0 && p.vy < 0) p.vy = 0;

    // fight and shoot
    if (input.take('KeyF') && p.punchCd <= 0) {
      p.punchCd = PLAYER.punchCooldown;
      p.punchT = 0.3;
      sfxPunch();
      game.combat.punch();
    }
    const wantsFire = input.mouse.left || input.takeClick();
    if (wantsFire && p.shootCd <= 0) {
      if (p.ammo > 0) {
        p.shootCd = PLAYER.pistolCooldown;
        p.ammo -= 1;
        p.aimT = 1.4;
        game.combat.playerShoot();
      } else {
        p.shootCd = 0.35;
        sfxClick();
        game.hud.toast('Out of ammo — find an ammo box');
      }
    }

    // run over by a car
    const hitter = carHit(game, p);
    if (hitter && p.hitCd <= 0) {
      p.hitCd = 0.6;
      p.damage(hitter.speed * 2.2, hitter.x, hitter.z);
      p.vxs += hitter.vx * 0.4;
      p.vzs += hitter.vz * 0.4;
    }
    syncActor(p, dt);
    if (p.health <= 0) p.dead = false;
  };

  /** Place the player somewhere on foot (respawns, loads, shots). */
  p.teleport = (x, z, yaw = 0) => {
    if (p.car) {
      p.car.driver = null;
      p.car.controller = 'parked';
      p.car = null;
    }
    p.x = x;
    p.z = z;
    p.y = 0;
    p.yaw = yaw;
    p.vxs = p.vzs = 0;
    p.group.visible = true;
    p.dead = false;
  };

  return p;
}
