// Save and load through localStorage: position, money, ammo, health, clock and mission progress.
// Wrapped in try/catch because private windows and file:// pages may refuse storage.
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

export function clearSave() {
  try {
    localStorage.removeItem(KEYS.start);
  } catch {
    /* nothing to do */
  }
}
