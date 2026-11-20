// Boot and main loop: builds every system on one `game` object, fixed 60 Hz sim; ?seed=N, ?shot=chase|walk|fight|title.
import { STEP, POI, COUNTS, PLAYER, WANTED, WEAPONS } from './config.js';
import { seedRandom, clamp } from './util.js';
import { createRenderer } from './render.js';
import { createWorld } from './world.js';
import { createEffects } from './effects.js';
import { createVehicles } from './vehicles.js';
import { createPlayer } from './player.js';
import { createPeds } from './pedestrians.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createMenus } from './menus.js';
import { createMinimap } from './minimap.js';
import { createCamera } from './camera.js';
import { createInput } from './input.js';
import { initAudio, setEngine, setSiren, toggleMute } from './audio.js';
import { hasSave, readSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
seedRandom(Number(params.get('seed')) || 1);

const canvas = document.getElementById('view');
const r = createRenderer(canvas);
const game = {
	scene: r.scene,
	camera: r.camera,
	render: r,
	POI,
	money: 250,
	clock: Number(params.get('time')) || 17.5,
	time: 0,
	shake: 0,
	state: 'title',
	running: false,
	objective: null,
	respawnT: 0,
	autoInput: null,
};

game.input = createInput(canvas);
game.world = createWorld(game.scene);
game.fx = createEffects(game.scene);
game.vehicles = createVehicles(game);
game.player = createPlayer(game, POI.spawn[0], POI.spawn[1]);
game.hud = createHud(game);
game.peds = createPeds(game);
game.traffic = createTraffic(game);
game.police = createPolice(game);
game.combat = createCombat(game);
game.missions = createMissions(game);
game.cam = createCamera(game, game.camera);
game.minimap = createMinimap(game);

function populate(cx, cz) {
	game.traffic.parkCars(cx, cz, COUNTS.parked, 14);
	game.traffic.populate(cx, cz, COUNTS.traffic, 30);
	for (let k = 0; k < 2; k++) {
		const l = game.traffic.randomLane(cx, cz, 60, 220);
		if (l) game.traffic.spawnTrafficCar(l.x, l.z, l.ai, 'police');
	}
	game.peds.populate(cx, cz, COUNTS.peds);
	game.combat.scatterPickups(cx, cz, COUNTS.pickups);
}
populate(POI.spawn[0], POI.spawn[1]);
game.running = true;

let lastSky = -1;
let saveT = 0;

function step(dt) {
	game.time += dt;
	if (game.state !== 'paused') game.clock = (game.clock + dt * 0.0111) % 24;
	game.player.update(dt, game.input, game.cam);
	game.traffic.update(dt);
	game.police.update(dt);
	game.vehicles.update(dt, game.time);
	game.peds.update(dt);
	game.combat.update(dt);
	game.missions.update(dt);
	game.fx.update(dt);
	game.world.update(game.time);
	if (game.state === 'wasted' || game.state === 'busted') {
		game.respawnT -= dt;
		if (game.respawnT <= 0) respawn();
	}
	if (game.state === 'play' && !game.missions.active) {
		saveT += dt;
		if (saveT > 25) {
			saveT = 0;
			writeSave(game);
		}
	}
}
game.step = step;

function updateSky(force) {
	const key = Math.round(game.clock * 20);
	if (key === lastSky && !force) return;
	lastSky = key;
	r.setTime(game.clock);
	game.world.setNight(r.night);
}

const menus = createMenus({
	newGame: () => beginGame(false),
	continueGame: () => beginGame(true),
	resume: () => setPaused(false),
	save: () => writeSave(game),
	quit: () => location.reload(),
});

function resetWorldForPlay() {
	game.police.clear();
	game.combat.clearEnemies();
	game.objective = null;
}

function beginGame(load) {
	initAudio();
	menus.hideStart();
	resetWorldForPlay();
	game.player.health = PLAYER.health;
	game.player.ammo = PLAYER.ammo;
	game.player.mag.pistol = WEAPONS.pistol.mag;
	game.player.hasSmg = false;
	game.player.weapon = 'pistol';
	game.money = 250;
	game.missions.done = 0;
	let x = POI.spawn[0];
	let z = POI.spawn[1];
	let yaw = Math.PI;
	const save = load ? readSave() : null;
	if (save) {
		x = save.x;
		z = save.z;
		yaw = save.yaw ?? yaw;
		game.money = save.money ?? 250;
		game.player.health = clamp(save.health ?? 100, 20, 100);
		game.player.ammo = save.ammo ?? PLAYER.ammo;
		game.player.hasSmg = !!save.smg;
		game.clock = save.clock ?? game.clock;
		game.missions.done = save.missionsDone ?? 0;
	}
	game.player.teleport(x, z, yaw);
	game.cam.snap(yaw, 0.25);
	game.state = 'play';
	game.input.enabled = true;
	game.hud.show();
	updateSky(true);
	if (!save) {
		game.hud.say('Rosa', "Mara! Over here. Step into the gold marker and I'll tell you what the bay needs tonight.", 6, 0.5);
		game.hud.hint('Click the game to capture the mouse — WASD to move, Shift to run', 8);
	} else game.hud.toast('Game loaded');
	canvas.focus();
}

function setPaused(on) {
	if (on && game.state === 'play') {
		game.state = 'paused';
		menus.showPause();
		document.exitPointerLock?.();
		setEngine(0, 0);
		setSiren(0);
	} else if (!on && game.state === 'paused') {
		game.state = 'play';
		menus.hidePause();
	}
}

game.onPlayerDown = (kind) => {
	if (game.state !== 'play') return;
	game.state = kind;
	const fine = Math.min(game.money, kind === 'busted' ? WANTED.bustedFine : WANTED.wastedFine);
	game.money -= fine;
	menus.showEnd(kind, kind === 'busted' ? `The police fined you $${fine}` : `Hospital bills: $${fine}`);
	game.missions.onPlayerDown(kind);
	game.respawnT = 3.4;
	game.hud.setBust(0);
};

function respawn() {
	const kind = game.state;
	const [x, z] = kind === 'busted' ? POI.police : POI.hospital;
	game.police.clear();
	if (game.player.car) {
		const car = game.player.car;
		car.driver = null;
		car.controller = 'parked';
		game.player.car = null;
	}
	game.player.teleport(x, z, Math.PI);
	game.player.health = PLAYER.health;
	game.player.ammo = Math.max(game.player.ammo, kind === 'busted' ? 12 : 24);
	game.cam.snap(Math.PI, 0.25);
	menus.hideEnd();
	game.state = 'play';
}

game.input.onLockChange = (locked) => {
	if (!locked && game.state === 'play') setPaused(true);
};

window.addEventListener('blur', () => {
	if (game.state === 'play' && !shotName) setPaused(true);
});

let last = performance.now();
let acc = 0;
let attract = 0;

function frame(now) {
	const dt = Math.min(0.1, (now - last) / 1000);
	last = now;

	if (game.input.take('Escape')) {
		if (game.state === 'play') setPaused(true);
		else if (game.state === 'paused') setPaused(false);
	}
	if (game.input.take('KeyM')) game.hud.toast(toggleMute() ? 'Sound off' : 'Sound on');

	if (game.state !== 'paused') {
		acc += dt;
		let n = 0;
		for (; acc >= STEP && n < 6; n++, acc -= STEP) step(STEP);
		if (n === 6) acc = 0;
	}
	if (game.state === 'title') {
		attract += dt * 0.05;
		const px = Math.sin(attract) * 150;
		r.camera.position.set(px, 9 + Math.sin(attract * 1.7) * 2, 492);
		r.camera.lookAt(px + 50, 24, 330);
	} else {
		game.cam.update(dt);
	}
	updateSky(false);
	r.follow(r.camera.position);
	game.hud.update(dt);
	if (game.state !== 'title') game.minimap.draw();
	const car = game.player.car;
	if (game.state === 'play' && car) setEngine(clamp(Math.abs(car.f) / car.spec.top, 0, 1), 1);
	else setEngine(0, 0);
	r.renderer.render(game.scene, r.camera);
	requestAnimationFrame(frame);
}

menus.showStart(hasSave());

if (shotName) {
	stageShot(game, shotName, { menus });
	updateSky(true);
	r.follow(r.camera.position);
	game.hud.update(0);
	game.minimap.draw();
	r.renderer.render(game.scene, r.camera);
	requestAnimationFrame(() => {
		r.renderer.render(game.scene, r.camera);
		window.__shotReady = true;
	});
} else {
	updateSky(true);
	requestAnimationFrame(frame);
}
window.__game = game;
