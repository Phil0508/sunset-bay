// The law: crimes build a 0-5 star level; cruisers spawn out of sight, route in and ram; officers arrest or shoot.
import { WANTED } from './config.js';
import { Actor, moveActor, applyKnock, carHit, syncActor, turnToward, hurt } from './characters.js';
import { rand, rr, clamp, dist, wrapPi } from './util.js';
import { setSiren } from './audio.js';

const THRESHOLD = [0, 1, 3, 6, 10, 15];
const POINTS = { carjack: 1.2, carjackPolice: 3.2, theft: 1.1, hitPed: 1, killPed: 2, punch: 0.5, shoot: 0.4, hitCop: 2, killCop: 3.5, explosion: 1, ramCop: 0.8 };
const ALWAYS_SEEN = new Set(['hitCop', 'killCop', 'carjackPolice', 'ramCop']);

export function createPolice(game) {
	const api = { cops: [], level: 0, points: 0, decayT: 0, crimeCd: 0, bust: 0, seen: false };

	const levelFor = (pts) => THRESHOLD.filter((t) => pts >= t).length - 1;

	const policeCars = () => game.vehicles.list.filter((c) => c.type === 'police' && c.hp > 0);

	function witnessed(x, z) {
		for (const a of game.peds.list) if (!a.dead && dist(a.x, a.z, x, z) < 28) return true;
		for (const c of policeCars()) if (dist(c.x, c.z, x, z) < 80) return true;
		for (const c of api.cops) if (!c.dead && dist(c.x, c.z, x, z) < 70) return true;
		return false;
	}

	api.crime = (type, x, z) => {
		if (game.state !== 'play') return;
		if (type === 'shoot') {
			if (api.crimeCd > 0) return;
			api.crimeCd = 2.2;
		}
		if (!ALWAYS_SEEN.has(type) && !witnessed(x, z)) return;
		const before = api.level;
		api.points = Math.min(THRESHOLD[5] + 1, api.points + (POINTS[type] ?? 0.5));
		api.level = levelFor(api.points);
		api.decayT = -WANTED.grace;
		if (api.level > before) {
			game.hud.flashWanted();
			game.hud.toast(api.level === 1 ? 'Wanted: police are looking for you' : `Wanted level ${api.level}`);
		}
	};

	/** Stealing a parked car only counts when someone is around to see it. */
	api.theft = (car) => {
		if (car.mission) return;
		if (car.owner) {
			for (const a of game.peds.list) if (!a.dead && dist(a.x, a.z, car.x, car.z) < 26) return api.crime('theft', car.x, car.z);
		}
		for (const c of policeCars()) if (dist(c.x, c.z, car.x, car.z) < 60) return api.crime('theft', car.x, car.z);
	};

	api.setLevel = (n) => {
		api.level = n;
		api.points = THRESHOLD[n];
		api.decayT = -WANTED.grace;
		api.bust = 0;
	};

	api.engage = (car) => Object.assign(car, { controller: 'police', siren: true, rv: 1, reverseT: 0 });

	api.clear = () => {
		for (const c of api.cops) game.scene.remove(c.group);
		api.cops.length = 0;
		for (const car of policeCars()) if (car.controller === 'police') game.vehicles.remove(car);
		api.setLevel(0);
	};

	game.onCarCrash = (a, b, impact) => {
		if (impact < 5) return;
		const player = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
		const other = player === a ? b : a;
		if (player && other.type === 'police') {
			api.crime('ramCop', player.x, player.z);
			other.pauseT = 2.2 - api.level * 0.25; // back off a moment after each ram
		}
	};

	game.onCarWrecked = (car) => {
		if (car.type === 'police' && car.lastHurtBy && (car.lastHurtBy.driver === 'player' || car.lastHurtBy === game.player)) api.crime('killCop', car.x, car.z);
	};

	function spawnCop(x, z) {
		const a = new Actor(game, 'cop', x, z);
		Object.assign(a, { fireCd: rr(0.8, 1.8), side: rand() < 0.5 ? 1 : -1, progressT: 0.5, lastPos: [x, z], hp: 65, maxHp: 65 });
		api.cops.push(a);
		return a;
	}

	function freeSpot(cx, cz, minD, maxD) {
		for (let k = 0; k < 24; k++) {
			const ang = rand() * Math.PI * 2;
			const d = rr(minD, maxD);
			const x = cx + Math.cos(ang) * d;
			const z = cz + Math.sin(ang) * d;
			const r = game.world.collide(x, z, 0.6);
			if (r.hit) continue;
			return [x, z];
		}
		return null;
	}

	function updateCop(a, dt) {
		const p = game.player;
		const d = dist(a.x, a.z, p.x, p.z);
		const los = d < 70 && game.world.los(a.x, a.z, p.x, p.z);
		a.aim = false;
		let speed = 0;
		if (api.level === 0) {
			a.fireCd = 1;
			return;
		}
		const target = p.car && p.car.speed > 14 ? 6.2 : 5.2;
		if (d > 1.6 || !los) {
			speed = target;
			let dx = (p.x - a.x) / (d || 1);
			let dz = (p.z - a.z) / (d || 1);
			if (!los) {
				// slide round walls: blend in a sideways push that flips when progress stalls
				const sx = -dz * a.side;
				const sz = dx * a.side;
				dx = dx * 0.6 + sx * 0.8;
				dz = dz * 0.6 + sz * 0.8;
				const l = Math.hypot(dx, dz) || 1;
				dx /= l;
				dz /= l;
			}
			moveActor(game, a, dx * speed * dt, dz * speed * dt);
			turnToward(a, Math.atan2(dx, dz), 9, dt);
		} else turnToward(a, Math.atan2(p.x - a.x, p.z - a.z), 9, dt);
		a.progressT -= dt;
		if (a.progressT <= 0) {
			a.progressT = 0.6;
			if (dist(a.x, a.z, a.lastPos[0], a.lastPos[1]) < 0.8 && d > 3) a.side *= -1;
			a.lastPos = [a.x, a.z];
		}
		if (api.level >= 2 && los && d < 30 && game.state === 'play') {
			a.aim = true;
			a.fireCd -= dt;
			if (a.fireCd <= 0) {
				a.fireCd = rr(1, 1.8) - api.level * 0.08;
				game.combat.enemyShoot(a, 1 + d * 0.07);
			}
		}
		a.speed = speed;
	}

	function driveRoute(car, dt) {
		const p = game.player;
		if (!car.ai) game.traffic.snapLane(car);
		const far = dist(car.x, car.z, p.x, p.z) > 50;
		game.traffic.pursue(car, dt, p.x + (p.car?.vx ?? 0) * 0.8, p.z + (p.car?.vz ?? 0) * 0.8, car.spec.top * (far ? 1 : 0.8 + api.level * 0.03));
	}

	function driveRam(car, dt) {
		const p = game.player;
		const lead = clamp(dist(car.x, car.z, p.x, p.z) / 35, 0.3, 1.2);
		const tvx = p.car ? p.car.vx : 0;
		const tvz = p.car ? p.car.vz : 0;
		const tx = p.x + tvx * lead;
		const tz = p.z + tvz * lead;
		const d = dist(car.x, car.z, tx, tz);
		let want = Math.atan2(tx - car.x, tz - car.z);
		// building probes ahead: steer toward the freer side
		const probe = (ang) => {
			const a = car.psi + ang;
			return game.world.solidAt(car.x + Math.sin(a) * 9, 1, car.z + Math.cos(a) * 9);
		};
		if (probe(0) || (probe(0.5) && probe(-0.5))) {
			const leftFree = !probe(0.7);
			const rightFree = !probe(-0.7);
			if (leftFree !== rightFree) want = car.psi + (leftFree ? 0.9 : -0.9);
			else want = car.psi + 1.2 * car.rv;
		} else if (probe(0.5)) want = car.psi - 0.5;
		else if (probe(-0.5)) want = car.psi + 0.5;
		const e = wrapPi(want - car.psi);
		car.input.handbrake = false;
		car.input.steer = clamp(-e * 2.2, -1, 1);
		if (car.pauseT > 0 || car.reverseT > 0) {
			const backing = car.pauseT <= 0; // after a ram: coast; when stuck: back out
			car.input.throttle = 0;
			car.input.brake = backing ? 1 : 0.3;
			if (backing) {
				car.reverseT -= dt;
				car.input.steer = -clamp(e, -1, 1);
			} else car.pauseT -= dt;
			return;
		}
		const cruise = car.spec.top * (0.9 + api.level * 0.02);
		car.input.throttle = d < 7 && car.f > 10 && !(p.car && p.car.speed > 6) ? 0.2 : Math.abs(e) > 1.6 ? 0.5 : 1;
		car.input.brake = car.f > cruise ? 0.5 : Math.abs(e) > 1.3 && car.f > 10 ? 0.5 : 0;
		if (car.speed < 1.5) car.stuckT = (car.stuckT ?? 0) + dt;
		else car.stuckT = 0;
		if (car.stuckT > 1.2) {
			car.reverseT = 0.9;
			car.rv = rand() < 0.5 ? 1 : -1;
			car.stuckT = 0;
		}
	}

	function updateCar(car, dt) {
		const p = game.player;
		const d = dist(car.x, car.z, p.x, p.z);
		if (api.level === 0) {
			car.siren = false;
			if (car.controller === 'police') {
				car.controller = 'traffic';
				game.traffic.snapLane(car);
				car.cruise = 11;
			}
			return;
		}
		if (car.controller === 'traffic') api.engage(car);
		if (car.controller !== 'police') return;
		car.siren = true;
		car.lostT = d > 60 && !(d < 100 && game.world.los(car.x, car.z, p.x, p.z)) ? (car.lostT ?? 0) + dt : 0;
		if (car.lostT > 3.5 || d > 150) {
			game.vehicles.remove(car); // out of touch with the chase: a fresh cruiser spawns behind the player
			api.spawnT = 0;
			return;
		}
		// rubber-band: a cruiser well behind a fleeing player claws speed back
		if (d > 60 && car.speed > 12 && car.speed < car.spec.top * 1.1) {
			car.vx *= 1 + 0.6 * dt;
			car.vz *= 1 + 0.6 * dt;
		}
		const direct = d < 100 && game.world.los(car.x, car.z, p.x, p.z);
		if (direct) driveRam(car, dt);
		else {
			car.reverseT = 0;
			driveRoute(car, dt);
		}
		if (!p.car && d < 13 && car.speed < 9 && car.f > -1) {
			const footNow = api.cops.filter((c) => !c.dead).length;
			if (footNow < 3 + api.level) {
				car.controller = 'parked';
				car.input = { throttle: 0, brake: 0.6, steer: 0, handbrake: false };
				car.siren = true;
				car.driver = null;
				for (let k = 0; k < 2; k++) spawnCop(car.x + Math.cos(car.psi) * (2 + k), car.z - Math.sin(car.psi) * (2 + k));
			}
		}
	}

	api.update = (dt) => {
		api.crimeCd -= dt;
		const p = game.player;
		if (game.state !== 'play') {
			setSiren(0);
			for (const a of api.cops) {
				applyKnock(game, a, dt);
				syncActor(a, dt);
			}
			return;
		}
		if (api.level > 0) {
			const cars = policeCars().filter((c) => c.controller === 'police');
			const want = Math.min(6, api.level + (api.level >= 3 ? 1 : 0));
			api.spawnT = (api.spawnT ?? 0) - dt;
			if (cars.length < want && api.spawnT <= 0) {
				api.spawnT = 1.2;
				let l = null;
				for (let k = 0; k < 12 && !l; k++) {
					l = game.traffic.randomLane(p.x, p.z, WANTED.spawnMin, WANTED.spawnMax);
					// against a fleeing player, start behind them and heading the same way
					const v = p.car && p.car.speed > 12 ? p.car : null;
					if (l && v) {
						const hx = l.ai.axis === 'x' ? l.ai.dir : 0;
						const hz = l.ai.axis === 'z' ? l.ai.dir : 0;
						if ((l.x - p.x) * v.vx + (l.z - p.z) * v.vz > 0 || hx * v.vx + hz * v.vz < 0) l = null;
					}
				}
				if (l) {
					const car = game.traffic.spawnTrafficCar(l.x, l.z, l.ai, 'police');
					api.engage(car);
					car.vx *= 3; // already rolling when it appears
					car.vz *= 3;
				}
			}
			const feet = api.cops.filter((c) => !c.dead).length;
			const wantFeet = p.car ? Math.max(0, api.level - 2) : Math.min(6, 1 + api.level);
			api.footT = (api.footT ?? 0) - dt;
			if (feet < wantFeet && api.footT <= 0) {
				api.footT = 3;
				const s = freeSpot(p.x, p.z, 55, 90);
				if (s && !game.world.los(s[0], s[1], p.x, p.z)) spawnCop(s[0], s[1]);
			}
		}
		let nearestSiren = 9999;
		for (const car of policeCars()) {
			if (car.driver === 'player') continue;
			updateCar(car, dt);
			if (car.siren) nearestSiren = Math.min(nearestSiren, dist(car.x, car.z, p.x, p.z));
		}
		setSiren(nearestSiren < 200 ? clamp(1 - nearestSiren / 200, 0, 1) : 0);
		let seen = false;
		let held = false;
		for (let i = api.cops.length - 1; i >= 0; i--) {
			const a = api.cops[i];
			if (!a.dead) {
				const hitter = carHit(game, a);
				if (hitter && !a.runOver) {
					a.runOver = true;
					a.kx += hitter.vx * 0.6;
					a.kz += hitter.vz * 0.6;
					hurt(game, a, hitter.speed * 4, hitter.x, hitter.z, hitter.driver === 'player');
				} else if (!hitter) a.runOver = false;
				if (!a.dead) {
					updateCop(a, dt);
					const d = dist(a.x, a.z, p.x, p.z);
					if (d < WANTED.copSight && game.world.los(a.x, a.z, p.x, p.z)) seen = true;
					if (api.level > 0 && d < (p.car ? 3.4 : 1.9) && p.health > 0 && (!p.car || p.car.speed < 3.5)) held = true;
				}
			}
			applyKnock(game, a, dt);
			syncActor(a, dt);
			if (!a.alive) api.cops.splice(i, 1);
			else if (api.level === 0 && dist(a.x, a.z, p.x, p.z) > 90) {
				game.scene.remove(a.group);
				api.cops.splice(i, 1);
			}
		}
		for (const car of policeCars()) {
			if (car.controller !== 'police') continue;
			const d = dist(car.x, car.z, p.x, p.z);
			if (d < 40 || (d < 75 && game.world.los(car.x, car.z, p.x, p.z))) seen = true;
			if (api.level > 0 && d < 4.8 && p.car && p.car !== car && p.car.speed < 3.5) held = true;
		}
		api.seen = seen;
		if (held) api.bust += dt / 2.6;
		else api.bust = Math.max(0, api.bust - dt * 0.6);
		game.hud.setBust(api.bust);
		if (api.bust >= 1) {
			api.bust = 0;
			game.onPlayerDown('busted');
		}
		if (api.level > 0) {
			if (seen) api.decayT = 0;
			else {
				api.decayT += dt;
				if (api.decayT >= WANTED.decay) {
					api.decayT = 0;
					api.points = THRESHOLD[api.level - 1];
					api.level -= 1;
					game.hud.toast(api.level === 0 ? 'You lost the cops' : `Wanted level ${api.level}`);
				}
			}
		}
	};

	return api;
}
