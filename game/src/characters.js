// Shared on-foot Actor (peds, cops, gang): body, health, knockback, building/car collision, run-over test.
import { buildHuman, animateHuman, randomOutfit } from './models.js';
import { rand, wrapPi, clamp } from './util.js';

export class Actor {
	constructor(game, kind, x, z, styleOverride) {
		const hp = kind === 'ped' ? 30 : kind === 'cop' ? 70 : 60;
		Object.assign(this, { game, kind, x, z, y: 0, yaw: rand() * Math.PI * 2, hp, maxHp: hp });
		this.rig = buildHuman(styleOverride ?? randomOutfit(rand, kind));
		this.group = this.rig.group;
		Object.assign(this, { t: rand() * 10, speed: 0, dead: false, deadT: 0, kx: 0, kz: 0, aim: false, punchT: 0, stun: 0, radius: 0.42, alive: true });
		game.scene.add(this.group);
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
	if (actor.hp <= 0) {
		actor.dead = true;
		actor.deadT = 0;
		actor.speed = 0;
		actor.rig.gun.visible = false;
		game.onActorKilled?.(actor, byPlayer);
		return true;
	}
	game.onActorHurt?.(actor, byPlayer);
	return false;
}

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

// Step an actor toward (tx, tz) at `speed` (negative backs away); returns the distance to the target.
export function walkTo(game, a, tx, tz, speed, dt) {
	const d = Math.hypot(tx - a.x, tz - a.z) || 1;
	moveActor(game, a, ((tx - a.x) / d) * speed * dt, ((tz - a.z) / d) * speed * dt);
	return d;
}

export function applyKnock(game, a, dt) {
	if (Math.abs(a.kx) + Math.abs(a.kz) > 0.05) {
		moveActor(game, a, a.kx * dt, a.kz * dt);
		const damp = Math.exp(-6 * dt);
		a.kx *= damp;
		a.kz *= damp;
	}
}

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
