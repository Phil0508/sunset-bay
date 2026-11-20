// Deterministic screenshot scenes behind ?shot=chase|walk|fight|title (&seed=N). Each one builds a
// moment of the real game (same systems, same rules), steps the simulation a fixed number of
// ticks and leaves the camera where a player would have it, so the same seed always gives the
// same frame. The page sets window.__shotReady when the frame has been painted.
import { STEP, POI, lineC } from './config.js';

function enterPlay(game, menus) {
  menus.hideStart();
  game.state = 'play';
  game.hud.show();
  game.input.enabled = false;
}

function run(game, steps) {
  for (let k = 0; k < steps; k += 1) game.step(STEP);
}

const SCENES = {
  // A pink Coral GT with three police cruisers on its tail, mission HUD up.
  chase(game, { menus }) {
    enterPlay(game, menus);
    game.missions.done = 1;
    game.money = 1150;
    game.missions.start(1); // Hot Wheels
    const car = game.missions.active.car;
    car.x = 150;
    car.z = -3.5;
    car.psi = -Math.PI / 2;
    car.vx = -30;
    car.vz = 0;
    for (const c of game.vehicles.list) {
      if (c !== car && Math.abs(c.z) < 9 && c.x > 40 && c.x < 260) game.vehicles.remove(c);
    }
    game.player.teleport(car.x, car.z, car.psi);
    game.player.enter(car);
    game.autoInput = { throttle: 1, steer: 0 };
    run(game, 70);
    // the cruisers join once the Coral GT is up to speed, a few car lengths behind it
    for (let k = 0; k < 3; k += 1) {
      const p = game.traffic.spawnTrafficCar(car.x + 15 + k * 13, k === 1 ? 3.5 : -3.5, { axis: 'x', line: 6, dir: -1, plan: null }, 'police');
      p.controller = 'police';
      p.siren = true;
      p.rv = 1;
      p.reverseT = 0;
      p.vx = -38;
    }
    game.police.setLevel(3);
    run(game, 12);
    game.police.setLevel(3);
    game.hud.clearBanner();
    // swing the camera round in front of the car so the pursuit is in frame
    game.cam.snap(car.psi, 0.2);
    game.cam.yaw = car.psi + Math.PI - 0.55;
    game.cam.idle = 0;
    game.cam.update(0.001);
  },

  // Mara outside Rosa's office at golden hour: marker beam, taxi, pedestrians, HUD.
  walk(game, { menus }) {
    enterPlay(game, menus);
    game.money = 250;
    const [x, z] = POI.spawn;
    const yaw = -Math.PI / 2 + 0.3; // facing west along the street, sunset ahead
    game.player.teleport(x + 3, z + 1, yaw);
    game.hud.say('Rosa', "Mara! Over here. Step into the gold marker and I'll tell you what the bay needs tonight.", 30, 0);
    run(game, 90);
    game.cam.snap(yaw, 0.3);
  },

  // The Drop, step one: a firefight with the Razor Kings at the cannery.
  fight(game, { menus }) {
    enterPlay(game, menus);
    game.missions.done = 3;
    game.money = 2050;
    game.missions.start(3);
    const [px, pz] = POI.drop.pickup;
    game.player.teleport(px - 3, pz + 15, 0);
    game.player.ammo = 22;
    for (const e of game.combat.enemies) e.alert = 30;
    run(game, 40);
    const target = game.combat.enemies.find((e) => !e.dead) ?? { x: px, z: pz };
    const yaw = Math.atan2(target.x - game.player.x, target.z - game.player.z);
    game.player.yaw = yaw;
    game.cam.snap(yaw, 0.2);
    game.player.aimT = 1.5;
    game.player.health = 71;
    game.police.setLevel(2);
    run(game, 2);
    game.hud.clearBanner();
    game.cam.snap(yaw, 0.2);
    game.combat.playerShoot();
    run(game, 1);
    game.cam.snap(yaw, 0.2);
  },

  // The title screen over the attract-mode camera.
  title(game, { menus }) {
    game.state = 'title';
    run(game, 160);
    menus.showStart(false);
    game.render.camera.position.set(-40, 9, 492);
    game.render.camera.lookAt(10, 24, 330);
  },
};

export function stageShot(game, name, helpers) {
  const scene = SCENES[name];
  if (!scene) return;
  scene(game, helpers);
  void lineC;
}
