// The story: four jobs from dispatcher Rosa. Each mission is a small step machine with an objective
// line for the HUD, a glowing marker in the world and pass / fail rules. Missions start by stepping
// into the gold marker at Rosa's office; completing one pays money, saves the game and unlocks the
// next. Dying or being busted fails the active mission, which can then be retried.
import * as THREE from 'three';
import { MISSIONS, POI, WANTED } from './config.js';
import { dist } from './util.js';
import { sfxJingle } from './audio.js';
import { writeSave } from './save.js';

export function createMissions(game) {
  const api = { done: 0, active: null, target: null, free: false };

  // ------------------------------------------------------------ marker
  const marker = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.4;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 46, 20, 1, true), beamMat);
  beam.position.y = 23;
  marker.add(ring, beam);
  marker.visible = false;
  game.scene.add(marker);

  const setMarker = (x, z, color = 0xffd23f, radius = 5) => {
    marker.visible = true;
    marker.position.set(x, 0, z);
    ring.scale.set(radius, 1, radius);
    beam.scale.set(radius * 0.55, 1, radius * 0.55);
    ringMat.color.setHex(color);
    beamMat.color.setHex(color);
    api.target = { x, z, color };
  };
  const hideMarker = () => {
    marker.visible = false;
    api.target = null;
  };

  const say = (lines) => lines.forEach(([who, text], i) => game.hud.say(who, text, 5.5, i * 5.8));

  // ------------------------------------------------------------ helpers
  const mission = () => MISSIONS[api.active.index];

  function objective(text, x, z) {
    game.objective = { text, x, z };
  }

  function cleanupEntities() {
    for (const e of api.active?.entities ?? []) {
      if (e.group && e.alive !== undefined && e.kind) {
        e.keep = false;
      }
    }
  }

  function finish(ok, reason) {
    const m = mission();
    const a = api.active;
    api.active = null;
    hideMarker();
    game.objective = null;
    for (const item of a.items ?? []) game.pickups.remove(item);
    if (ok) {
      const bonus = a.bonus ?? 0;
      const total = m.reward + bonus;
      game.money += total;
      api.done = Math.max(api.done, a.index + 1);
      game.hud.banner('MISSION PASSED', `${m.title}  +$${total}`, 'good');
      sfxJingle(true);
      game.hud.say(m.outro[0], m.outro[1], 6, 1.2);
      writeSave(game);
    } else {
      game.hud.banner('MISSION FAILED', reason, 'bad');
      sfxJingle(false);
    }
    cleanupEntities();
  }
  api.fail = (reason) => {
    if (api.active) finish(false, reason);
  };

  // ------------------------------------------------------------ the four missions
  const defs = [
    // 1. First Fare ---------------------------------------------------
    {
      start() {
        const t = POI.taxi;
        const car = game.vehicles.spawn('taxi', 0xf2c230, t.x, t.z, t.psi, 'parked');
        car.mission = 'fare';
        const a = api.active;
        a.car = car;
        a.step = 0;
        game.hud.hint('Walk to the cab and press E to get in', 8);
      },
      update(dt) {
        const a = api.active;
        const p = game.player;
        const car = a.car;
        if (car.hp <= 0) return api.fail('The cab was wrecked');
        if (a.step === 0) {
          objective('Get in the Sunbeam cab', car.x, car.z);
          setMarker(car.x, car.z, 0x4cc9f0, 3.2);
          if (p.car === car) {
            a.step = 1;
            const [x, z] = POI.fare.pickup;
            a.ped = game.peds.spawn(x + 6, z, { stationary: true, keep: true });
            a.ped.state = 'idle';
            game.hud.hint('W / S gas and brake, A / D steer, Space handbrake', 8);
          }
        } else if (a.step === 1) {
          const [x, z] = POI.fare.pickup;
          if (p.car !== car) {
            objective('Get back in the cab', car.x, car.z);
            setMarker(car.x, car.z, 0x4cc9f0, 3.2);
            return;
          }
          objective("Pick up Rosa's cousin", x, z);
          setMarker(x, z, 0xffd23f, 6);
          if (dist(car.x, car.z, x, z) < 8 && car.speed < 7) {
            a.step = 2;
            game.peds.list.splice(game.peds.list.indexOf(a.ped), 1);
            game.scene.remove(a.ped.group);
            game.hud.toast('Passenger aboard');
            game.hud.hint('Drive smoothly — damage costs you tip', 6);
          }
        } else if (a.step === 2) {
          const [x, z] = POI.fare.dest;
          if (p.car !== car) {
            objective('Get back in the cab', car.x, car.z);
            setMarker(car.x, car.z, 0x4cc9f0, 3.2);
            return;
          }
          objective('Take her to Skyline Tower', x, z);
          setMarker(x, z, 0xffd23f, 6.5);
          a.bonus = Math.round(100 * (car.hp / car.spec.hp));
          if (dist(car.x, car.z, x, z) < 8.5 && car.speed < 7) finish(true);
        }
        void dt;
      },
    },
    // 2. Hot Wheels ---------------------------------------------------
    {
      start() {
        const h = POI.hot.car;
        const car = game.vehicles.spawn('sports', 0xff3d7f, h.x, h.z, h.psi, 'parked');
        car.mission = 'hot';
        const a = api.active;
        a.car = car;
        a.step = 0;
        a.owner = game.peds.spawn(h.x + 4, h.z + 2, { stationary: true, keep: true, owner: true });
        a.owner.state = 'idle';
        a.watch = game.peds.spawn(h.x - 3, h.z + 7, { stationary: true, keep: true, owner: true });
        a.watch.state = 'idle';
      },
      update() {
        const a = api.active;
        const p = game.player;
        const car = a.car;
        if (car.hp <= 0) return api.fail('The Coral GT was destroyed');
        if (a.step === 0) {
          objective('Steal the pink Coral GT', car.x, car.z);
          setMarker(car.x, car.z, 0xff3d7f, 3.4);
          if (p.car === car) {
            a.step = 1;
            game.police.crime('carjack', car.x, car.z);
            game.hud.hint('The owner saw you — lose any police on the way', 7);
          }
        } else {
          const [x, z] = POI.hot.garage;
          if (p.car !== car) {
            objective('Get back in the Coral GT', car.x, car.z);
            setMarker(car.x, car.z, 0xff3d7f, 3.4);
            return;
          }
          objective('Deliver the Coral GT to Harbor Garage', x, z);
          setMarker(x, z, 0xffd23f, 6.5);
          if (dist(car.x, car.z, x, z) < 8.5 && car.speed < 8) {
            a.bonus = Math.round(150 * (car.hp / car.spec.hp));
            finish(true);
          }
        }
      },
    },
    // 3. Bay Heat -----------------------------------------------------
    {
      start() {
        const a = api.active;
        const [x, z] = POI.dispatch;
        const car = game.vehicles.spawn('sedan', 0x3d7ccc, x + 5, z + 2.8, 0, 'parked');
        car.mission = 'getaway';
        car.psi = Math.PI / 2;
        a.car = car;
        a.clean = 0;
        game.police.setLevel(3);
        game.hud.hint('Break line of sight and stay hidden to drop the stars', 8);
      },
      update(dt) {
        const a = api.active;
        const p = game.player;
        if (game.police.level > 0) {
          a.clean = 0;
          objective(`Lose the police (${game.police.level} star${game.police.level > 1 ? 's' : ''})`, p.x, p.z);
          if (!p.car && a.car.hp > 0) setMarker(a.car.x, a.car.z, 0x4cc9f0, 3.2);
          else hideMarker();
        } else {
          hideMarker();
          objective('The cops are gone — stay low', p.x, p.z);
          a.clean += dt;
          if (a.clean > 2.5) {
            a.bonus = 0;
            finish(true);
          }
        }
      },
    },
    // 4. The Drop -----------------------------------------------------
    {
      start() {
        const a = api.active;
        const [x, z] = POI.drop.pickup;
        a.step = 0;
        a.gang = [];
        const spots = [[-6, -4], [6, -3], [-3, 6], [7, 5], [0, -9]];
        for (const [dx, dz] of spots) a.gang.push(game.combat.spawnGang(x + dx, z + dz, { mission: 'drop' }));
        a.items = [game.pickups.spawn('package', x, z, 0)];
        a.package = a.items[0];
        game.hud.hint('Park nearby, get out (E) and shoot your way to the package', 8);
        game.pickups.spawn('ammo', x - 14, z + 10, 24);
        game.pickups.spawn('health', x + 14, z + 10, 35);
      },
      update() {
        const a = api.active;
        const p = game.player;
        if (a.step === 0) {
          const [x, z] = POI.drop.pickup;
          const left = a.gang.filter((g) => !g.dead).length;
          objective(left ? `Fight through the Razor Kings (${left} left) and take the package` : 'Take the package', x, z);
          setMarker(x, z, 0xff4040, 5);
        } else {
          const [x, z] = POI.drop.dest;
          objective('Deliver the package to Pier 9', x, z);
          setMarker(x, z, 0xffd23f, 7);
          if (dist(p.x, p.z, x, z) < 9 && (!p.car || p.car.speed < 12)) finish(true);
        }
      },
    },
  ];

  api.onPackage = (item) => {
    const a = api.active;
    if (!a || a.index !== 3 || a.package !== item) return;
    game.pickups.remove(item);
    a.items = [];
    a.package = null;
    a.step = 1;
    game.police.setLevel(2);
    game.hud.toast('Package secured — police alerted');
    game.hud.say('Rosa', 'They know you have it. Pier 9, now. Keep moving!', 5, 0);
    const [x, z] = POI.drop.dest;
    for (const [dx, dz] of [[-8, 4], [8, -4], [4, 9]]) a.gang.push(game.combat.spawnGang(x + dx, z + dz, { mission: 'drop', alert: 0 }));
  };

  api.onKill = () => {};

  api.start = (index) => {
    api.active = { index, step: 0, entities: [], items: [] };
    defs[index].start();
    game.hud.banner(MISSIONS[index].title.toUpperCase(), 'New job from Rosa', 'info');
    say(MISSIONS[index].intro);
  };

  api.onPlayerDown = (why) => {
    if (api.active) api.fail(why === 'busted' ? 'You were busted' : 'You were wasted');
  };

  api.update = (dt) => {
    ring.rotation.y += dt * 0.8;
    beamMat.opacity = 0.2 + Math.sin(performance.now() / 300) * 0.05;
    const p = game.player;
    if (game.state !== 'play') return;
    if (api.active) {
      defs[api.active.index].update(dt);
      return;
    }
    if (api.done >= MISSIONS.length) {
      hideMarker();
      game.objective = { text: 'All jobs done — Sunset Bay is yours. Free roam!', x: p.x, z: p.z };
      return;
    }
    const [x, z] = POI.dispatch;
    const m = MISSIONS[api.done];
    objective(`Rosa has a job: "${m.title}" — step into the gold marker`, x, z);
    setMarker(x, z, 0xffd23f, 4.2);
    const d = dist(p.x, p.z, x, z);
    if (d < (p.car ? 6 : 3.6) && (!p.car || p.car.speed < 12)) api.start(api.done);
  };

  void WANTED;
  return api;
}
