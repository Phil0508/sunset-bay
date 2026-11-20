// Save/load via localStorage (try/catch: private windows and file:// may refuse storage).
import { KEYS } from './config.js';

export function hasSave() {
	try {
		return !!localStorage.getItem(KEYS.start);
	} catch {
		return false;
	}
}

export function readSave() {
	try {
		const raw = localStorage.getItem(KEYS.start);
		if (!raw) return null;
		const data = JSON.parse(raw);
		return data && typeof data === 'object' ? data : null;
	} catch {
		return null;
	}
}

export function writeSave(game) {
	const p = game.player;
	const data = {
		v: 1,
		x: p.x,
		z: p.z,
		yaw: p.yaw,
		money: game.money,
		health: Math.round(p.health),
		ammo: p.ammo,
		smg: p.hasSmg,
		clock: game.clock,
		missionsDone: game.missions.done,
		time: Date.now(),
	};
	try {
		localStorage.setItem(KEYS.start, JSON.stringify(data));
		return true;
	} catch {
		return false;
	}
}
