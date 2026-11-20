// Pedestrians walk a graph of sidewalk corners, panic at danger, and can be hit, run over and killed.
import { Actor, hurt, moveActor, walkTo, applyKnock, carHit, syncActor, turnToward } from './characters.js';
import { GRID, PITCH, SIDEWALK_OFFSET, lineC, COUNTS } from './config.js';
import { rand, rr, ri, dist } from './util.js';

const OFF = SIDEWALK_OFFSET;
const nodeXZ = (n) => [lineC(n.i) + n.sx * OFF + n.jx, lineC(n.j) + n.sz * OFF + n.jz];

function valid(i, j, sx, sz) {
	if (i < 0 || j < 0 || i > GRID || j > GRID) return false;
	if (i === 0 && sx < 0) return false;
	if (i === GRID && sx > 0) return false;
	if (j === 0 && sz < 0) return false;
	return true;
}

function neighbours(n) {
	const out = [];
	const push = (i, j, sx, sz, cross) => {
		if (valid(i, j, sx, sz)) out.push({ i, j, sx, sz, cross, jx: rr(-0.6, 0.6), jz: rr(-0.6, 0.6) });
	};
	if (n.sx > 0) push(n.i + 1, n.j, -1, n.sz, false);
	else push(n.i - 1, n.j, 1, n.sz, false);
	if (n.sz > 0) push(n.i, n.j + 1, n.sx, -1, false);
	else push(n.i, n.j - 1, n.sx, 1, false);
	push(n.i, n.j, -n.sx, n.sz, true);
	push(n.i, n.j, n.sx, -n.sz, true);
	return out;
}

export function createPeds(game) {
	const list = [];
	const api = { list };

	function chooseNext(a) {
		const opts = neighbours(a.node);
		let pool = opts.filter((o) => !(o.i === a.prev?.i && o.j === a.prev?.j && o.sx === a.prev?.sx && o.sz === a.prev?.sz));
		if (!pool.length || rand() < 0.06) pool = opts;
		let total = 0;
		for (const o of pool) total += o.cross ? 0.3 : 1;
		let r = rand() * total;
		for (const o of pool) {
			r -= o.cross ? 0.3 : 1;
			if (r <= 0) return o;
		}
		return pool[0];
	}

	api.spawn = (x, z, opts = {}) => {
		const a = new Actor(game, 'ped', x, z);
		a.state = opts.stationary ? 'idle' : 'walk';
		a.walkSpeed = rr(1.3, 1.9);
		a.keep = !!opts.keep;
		a.owner = !!opts.owner;
		a.panic = 0;
		a.fx = 0;
		a.fz = 0;
		a.node = null;
		a.target = null;
		list.push(a);
		return a;
	};

	function spawnOnNode(i, j) {
		const sx = rand() < 0.5 ? 1 : -1;
		const sz = rand() < 0.5 ? 1 : -1;
		if (!valid(i, j, sx, sz)) return null;
		const n = { i, j, sx, sz, jx: rr(-0.6, 0.6), jz: rr(-0.6, 0.6) };
		const [x, z] = nodeXZ(n);
		const a = api.spawn(x, z);
		a.node = n;
		a.target = chooseNext(a);
		a.prev = n;
		return a;
	}

	function snap(a) {
		const bi = Math.round((a.x - lineC(0)) / PITCH);
		const bj = Math.round((a.z - lineC(0)) / PITCH);
		let best = null;
		let bd = 1e9;
		for (let di = -1; di <= 1; di++) {
			for (let dj = -1; dj <= 1; dj++) {
				for (const sx of [-1, 1]) {
					for (const sz of [-1, 1]) {
						const i = bi + di;
						const j = bj + dj;
						if (!valid(i, j, sx, sz)) continue;
						const n = { i, j, sx, sz, jx: 0, jz: 0 };
						const [x, z] = nodeXZ(n);
						const d = dist(x, z, a.x, a.z);
						if (d < bd) {
							bd = d;
							best = n;
						}
					}
				}
			}
		}
		a.node = best;
		a.prev = best;
		a.target = best ? chooseNext(a) : null;
	}

	api.alarm = (x, z, radius) => {
		for (const a of list) {
			if (a.dead) continue;
			const d = dist(a.x, a.z, x, z);
			if (d > radius) continue;
			a.state = 'flee';
			a.panic = rr(3.5, 6.5);
			const dx = a.x - x;
			const dz = a.z - z;
			const l = Math.hypot(dx, dz) || 1;
			a.fx = dx / l;
			a.fz = dz / l;
		}
	};

	const discard = (a) => {
		a.alive = false;
		game.scene.remove(a.group);
		list.splice(list.indexOf(a), 1);
	};

	const drop = (a) => {
		if (rand() < 0.5) game.pickups?.spawn('cash', a.x, a.z, ri(15, 90));
	};

	api.update = (dt) => {
		const p = game.player;
		if (list.length < COUNTS.peds && game.running) {
			const bi = Math.round((p.x - lineC(0)) / PITCH);
			const bj = Math.round((p.z - lineC(0)) / PITCH);
			for (let tries = 0; tries < 3 && list.length < COUNTS.peds; tries++) {
				const a = spawnOnNode(bi + ri(-3, 3), bj + ri(-3, 3));
				if (!a) continue;
				const d = dist(a.x, a.z, p.x, p.z);
				if (d < 40 || d > 160) discard(a);
			}
		}
		for (const car of game.vehicles.list) {
			if (car.speed < 10) continue;
			const s = Math.sin(car.psi);
			const c = Math.cos(car.psi);
			for (const a of list) {
				if (a.dead || a.state === 'flee') continue;
				const dx = a.x - car.x;
				const dz = a.z - car.z;
				if (dx * dx + dz * dz > 300) continue;
				const along = dx * s + dz * c;
				const lat = dx * -c + dz * s;
				if (along > -3 && along < 16 && Math.abs(lat) < 4.5) {
					a.state = 'flee';
					a.panic = rr(3, 5);
					a.fx = -c * Math.sign(lat || 1);
					a.fz = s * Math.sign(lat || 1);
				}
			}
		}
		for (let i = list.length - 1; i >= 0; i--) {
			const a = list[i];
			if (a.dead) {
				applyKnock(game, a, dt);
				syncActor(a, dt);
				if (!a.alive) list.splice(i, 1);
				continue;
			}
			const hitter = carHit(game, a);
			if (hitter) {
				if (!a.runOver) {
					a.runOver = true;
					const sp = hitter.speed;
					a.kx += hitter.vx * 0.7;
					a.kz += hitter.vz * 0.7;
					// the crime is reported below, so the damage itself is not flagged as the player's
					const killed = hurt(game, a, sp * 4.5, hitter.x, hitter.z, false);
					game.fx.blood(a.x, 1, a.z);
					if (hitter.driver === 'player') game.police.crime(killed ? 'killPed' : 'hitPed', a.x, a.z);
					if (killed) drop(a);
					api.alarm(a.x, a.z, 18);
					if (killed) {
						syncActor(a, dt);
						continue;
					}
				}
			} else a.runOver = false;
			if (a.stun > 0) a.stun -= dt;
			if (dist(a.x, a.z, p.x, p.z) > 190 && !a.keep) {
				discard(a);
				continue;
			}
			let speed = 0;
			if (a.state === 'flee') {
				a.panic -= dt;
				speed = 5.2;
				moveActor(game, a, a.fx * speed * dt, a.fz * speed * dt);
				turnToward(a, Math.atan2(a.fx, a.fz), 10, dt);
				if (a.panic <= 0) {
					a.state = a.owner ? 'idle' : 'walk';
					if (a.state === 'walk') snap(a);
				}
			} else if (a.state === 'goto') {
				// a mission passenger walking to a car
				if (dist(a.x, a.z, a.goal[0], a.goal[1]) > 2.1) {
					walkTo(game, a, a.goal[0], a.goal[1], (speed = 3), dt);
					turnToward(a, Math.atan2(a.goal[0] - a.x, a.goal[1] - a.z), 8, dt);
				} else a.arrived = true;
			} else if (a.state === 'walk' && a.target) {
				const [tx, tz] = nodeXZ(a.target);
				const dx = tx - a.x;
				const dz = tz - a.z;
				const d = Math.hypot(dx, dz);
				if (d < 0.7) {
					a.prev = a.node;
					a.node = a.target;
					a.target = chooseNext(a);
				} else {
					speed = a.walkSpeed;
					moveActor(game, a, (dx / d) * speed * dt, (dz / d) * speed * dt);
					turnToward(a, Math.atan2(dx, dz), 7, dt);
				}
			} else if (a.state === 'walk' && !a.target) snap(a);
			a.speed = speed;
			applyKnock(game, a, dt);
			syncActor(a, dt);
		}
	};

	api.populate = (cx, cz, n) => {
		const bi = Math.round((cx - lineC(0)) / PITCH);
		const bj = Math.round((cz - lineC(0)) / PITCH);
		let guard = 0;
		while (list.length < n && guard++ < 200) {
			const a = spawnOnNode(bi + ri(-4, 4), bj + ri(-4, 4));
			if (a && dist(a.x, a.z, cx, cz) < 8) discard(a);
		}
	};

	return api;
}
