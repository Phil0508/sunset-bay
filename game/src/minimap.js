// Minimap: a round canvas that rotates with the camera (roads, shore, cars, police, peds, marker).
import { GRID, ROAD_W, WORLD, lineC } from './config.js';

const SIZE = 220;
const RANGE = 130; // world units from the centre to the rim

export function createMinimap(game) {
	const canvas = document.getElementById('minimap');
	const ctx = canvas.getContext('2d');
	const s = SIZE / 2 / RANGE;
	const api = {};

	api.draw = () => {
		const p = game.player;
		const yaw = game.cam.yaw;
		const cy = Math.cos(yaw);
		const sy = Math.sin(yaw);
		const C = SIZE / 2;
		const toScreen = (x, z) => {
			const dx = x - p.x;
			const dz = z - p.z;
			return [C + (-cy * dx + sy * dz) * s, C + (-sy * dx - cy * dz) * s];
		};
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, SIZE, SIZE);
		ctx.save();
		ctx.beginPath();
		ctx.arc(C, C, C - 1, 0, Math.PI * 2);
		ctx.clip();
		ctx.fillStyle = '#2d3b36';
		ctx.fillRect(0, 0, SIZE, SIZE);
		ctx.setTransform(-cy * s, -sy * s, sy * s, -cy * s, C, C);
		ctx.translate(-p.x, -p.z);
		ctx.fillStyle = '#e3cf94';
		ctx.fillRect(-600, lineC(GRID) + 7, 1200, WORLD.seaZ - lineC(GRID) - 7);
		ctx.fillStyle = '#2a8fb8';
		ctx.fillRect(-600, WORLD.seaZ, 1200, 400);
		ctx.fillStyle = '#9a7048';
		ctx.fillRect(WORLD.pierX - WORLD.pierHalf, WORLD.seaZ - 6, WORLD.pierHalf * 2, WORLD.maxZ - WORLD.seaZ + 6);
		ctx.fillStyle = '#3a4a42';
		for (let i = 0; i < GRID; i++) {
			for (let j = 0; j < GRID; j++) {
				const x = lineC(i) + ROAD_W / 2;
				const z = lineC(j) + ROAD_W / 2;
				if (Math.abs(x - p.x) > RANGE + 70 || Math.abs(z - p.z) > RANGE + 70) continue;
				ctx.fillRect(x, z, 70 - ROAD_W, 70 - ROAD_W);
			}
		}
		ctx.strokeStyle = '#8b8f96';
		ctx.lineWidth = ROAD_W;
		ctx.beginPath();
		for (let i = 0; i <= GRID; i++) {
			ctx.moveTo(lineC(i), lineC(0));
			ctx.lineTo(lineC(i), lineC(GRID));
			ctx.moveTo(lineC(0), lineC(i));
			ctx.lineTo(lineC(GRID), lineC(i));
		}
		ctx.stroke();
		ctx.strokeStyle = '#a9adb4';
		ctx.lineWidth = ROAD_W * 0.55;
		ctx.stroke();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		const dot = (x, z, r, color) => {
			const [sx, sz] = toScreen(x, z);
			if ((sx - C) ** 2 + (sz - C) ** 2 > (C - 3) ** 2) return;
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(sx, sz, r, 0, Math.PI * 2);
			ctx.fill();
		};
		for (const a of game.peds.list) if (!a.dead) dot(a.x, a.z, 1.6, 'rgba(230,230,230,0.55)');
		for (const c of game.vehicles.list) {
			if (c === p.car) continue;
			if (c.type === 'police' && c.controller === 'police') dot(c.x, c.z, 4.2, Math.floor(performance.now() / 250) % 2 ? '#ff3b3b' : '#3b6bff');
			else dot(c.x, c.z, 3, c.mission ? '#ff9de0' : '#f4f4f4');
		}
		for (const c of game.police.cops) if (!c.dead) dot(c.x, c.z, 3, '#4d7cff');
		for (const e of game.combat.enemies) if (!e.dead) dot(e.x, e.z, 3.4, '#ff3030');
		const arrow = (x, y, rot, pts) => {
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(rot);
			ctx.beginPath();
			pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
			ctx.closePath();
			ctx.stroke();
			ctx.fill();
			ctx.restore();
		};
		const t = game.missions.target;
		if (t) {
			let [mx, mz] = toScreen(t.x, t.z);
			let dx = mx - C;
			let dz = mz - C;
			const d = Math.hypot(dx, dz);
			const lim = C - 9;
			const col = `#${t.color.toString(16).padStart(6, '0')}`;
			ctx.fillStyle = col;
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 2;
			if (d > lim) {
				mx = C + (dx / d) * lim;
				mz = C + (dz / d) * lim;
				arrow(mx, mz, Math.atan2(dz, dx) + Math.PI / 2, [[0, -7], [6, 6], [-6, 6]]);
			} else {
				ctx.beginPath();
				ctx.arc(mx, mz, 6, 0, Math.PI * 2);
				ctx.stroke();
				ctx.fill();
			}
		}
		ctx.fillStyle = '#55f08a';
		ctx.strokeStyle = '#06210f';
		arrow(C, C, yaw - p.yaw, [[0, -9], [6.5, 7], [0, 3.5], [-6.5, 7]]);
		ctx.restore();
		const [nx, nz] = [C - sy * (C - 12), C + cy * (C - 12)];
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#fff';
		ctx.font = 'bold 13px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('N', nx, nz);
	};

	return api;
}
