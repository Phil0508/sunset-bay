// The camera rig. On foot it orbits behind Mara's shoulder with mouse look and pulls in when she
// aims or a wall is in the way; in a car it swings round behind the heading, pulls back and widens
// the field of view with speed, and shakes on impact.
import * as THREE from 'three';
import { clamp, wrapPi, smooth, rand } from './util.js';

export function createCamera(game, camera) {
  const cam = { yaw: 0, pitch: 0.22, dist: 5.2, idle: 0, fov: 62, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const targetOf = () => {
    const p = game.player;
    return p.car ? p.car : p;
  };

  cam.snap = (yaw = cam.yaw, pitch = cam.pitch) => {
    cam.yaw = yaw;
    cam.pitch = pitch;
    cam.settled = false;
    cam.update(0.0001, true);
  };

  cam.update = (dt, snap = false) => {
    const p = game.player;
    const look = game.input.drain();
    const sens = 0.0024;
    const car = p.car;
    if (game.state === 'play' || game.state === 'busted' || game.state === 'wasted') {
      if (game.state === 'play') {
        cam.yaw -= look.dx * sens;
        cam.pitch = clamp(cam.pitch + look.dy * sens, car ? -0.1 : -0.35, car ? 0.6 : 1.0);
        if (Math.abs(look.dx) + Math.abs(look.dy) > 0) cam.idle = 0;
        else cam.idle += dt;
      }
    }

    let targetDist;
    let height;
    let fov = 62;
    let px;
    let py;
    let pz;
    let sideOff = 0;
    if (car) {
      const sp = Math.abs(car.f);
      // swing behind the car when the driver is not looking around
      const want = car.psi + (car.f < -4 ? Math.PI : 0);
      if (cam.idle > 1.2 || snap) {
        cam.yaw = snap ? car.psi : wrapPi(cam.yaw + wrapPi(want - cam.yaw) * (1 - Math.exp(-(sp > 2 ? 3.2 : 0.8) * dt)));
        cam.pitch = smooth(cam.pitch, 0.2, 2, dt);
      }
      targetDist = 8.2 + sp * 0.09 + (car.type === 'pickup' ? 1 : 0);
      height = 1.5;
      fov = 62 + Math.min(18, sp * 0.33);
      px = car.x;
      py = 1.2;
      pz = car.z;
    } else {
      const aiming = game.input.mouse.right || p.aimT > 0;
      targetDist = aiming ? 3.1 : 5.2;
      height = 1.55;
      sideOff = aiming ? 0.75 : 0.35;
      px = p.x;
      py = p.y + 0.6;
      pz = p.z;
    }
    cam.dist = snap ? targetDist : smooth(cam.dist, targetDist, 5, dt);
    cam.fov = snap ? fov : smooth(cam.fov, fov, 4, dt);
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    const rx = -fz;
    const rz = fx;
    // desired camera position: behind and above, nudged over the shoulder
    const hx = px + rx * sideOff;
    const hz = pz + rz * sideOff;
    const hy = py + height;
    let cx = hx - fx * cp * cam.dist;
    let cy = hy + sp * cam.dist;
    let cz = hz - fz * cp * cam.dist;
    // pull in if a building is in the way
    const steps = 14;
    let free = 1;
    for (let k = 1; k <= steps; k += 1) {
      const t = k / steps;
      const x = hx + (cx - hx) * t;
      const y = hy + (cy - hy) * t;
      const z = hz + (cz - hz) * t;
      if (game.world.solidAt(x, y, z)) {
        free = Math.max(0.12, (k - 1.5) / steps);
        break;
      }
    }
    cx = hx + (cx - hx) * free;
    cy = hy + (cy - hy) * free;
    cz = hz + (cz - hz) * free;
    cy = Math.max(0.5, cy);
    if (game.shake > 0.001) {
      cx += (rand() - 0.5) * game.shake;
      cy += (rand() - 0.5) * game.shake;
      cz += (rand() - 0.5) * game.shake;
      game.shake *= Math.exp(-6 * dt);
    }
    cam.pos.set(cx, cy, cz);
    camera.position.copy(cam.pos);
    const ahead = car ? Math.min(6, Math.abs(car.f) * 0.12) : 0;
    cam.look.set(px + fx * (6 + ahead) + rx * sideOff, py + 0.8 - sp * 6 + (car ? 0.4 : 0.9), pz + fz * (6 + ahead) + rz * sideOff);
    camera.lookAt(cam.look);
    if (Math.abs(camera.fov - cam.fov) > 0.05) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    void targetOf;
  };

  /** Ray through the crosshair, starting just in front of the player so nothing behind her is hit. */
  cam.aimRay = () => {
    camera.getWorldDirection(dir);
    const p = game.player;
    tmp.copy(cam.pos);
    const d = Math.hypot(cam.pos.x - p.x, cam.pos.z - p.z);
    tmp.addScaledVector(dir, Math.max(0.5, d * 0.85));
    return { ox: tmp.x, oy: tmp.y, oz: tmp.z, dx: dir.x, dy: dir.y, dz: dir.z };
  };

  return cam;
}
