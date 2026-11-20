// Effects: pooled particles (one instanced mesh), bullet tracers and a skid-mark ring buffer.
import * as THREE from 'three';
import { rand, rr } from './util.js';

const POOL = 420;
const SKIDS = 520;
const TRACERS = 12;

export function createEffects(scene) {
	const fx = {};
	const dummy = new THREE.Object3D();
	const color = new THREE.Color();

	const geo = new THREE.BoxGeometry(1, 1, 1);
	const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
	const mesh = new THREE.InstancedMesh(geo, mat, POOL);
	mesh.frustumCulled = false;
	scene.add(mesh);
	const P = Array.from({ length: POOL }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, rot: 0 }));
	let cursor = 0;
	const hide = (m, i) => {
		dummy.scale.setScalar(0);
		dummy.position.set(0, -50, 0);
		dummy.updateMatrix();
		m.setMatrixAt(i, dummy.matrix);
	};
	for (let i = 0; i < POOL; i++) {
		hide(mesh, i);
		mesh.setColorAt(i, color.setHex(0xffffff));
	}

	fx.emit = (x, y, z, vx, vy, vz, s0, s1, life, hex) => {
		Object.assign(P[cursor], { on: true, x, y, z, vx, vy, vz, s0, s1, life: 0, max: life, rot: rand() * 6.28 });
		mesh.setColorAt(cursor, color.setHex(hex));
		cursor = (cursor + 1) % POOL;
		mesh.instanceColor.needsUpdate = true;
	};

	fx.smoke = (x, y, z, dark = 0.5) => {
		const g = Math.round(70 + dark * 120);
		fx.emit(x + rr(-0.3, 0.3), y, z + rr(-0.3, 0.3), rr(-0.4, 0.4), rr(1.2, 2.2), rr(-0.4, 0.4), 0.4, 1.8, rr(0.9, 1.4), (g << 16) | (g << 8) | g);
	};
	fx.dust = (x, z, strength = 1) => {
		for (let k = 0; k < 2 * strength; k++) fx.emit(x + rr(-0.4, 0.4), 0.2, z + rr(-0.4, 0.4), rr(-1, 1), rr(0.4, 1.2), rr(-1, 1), 0.3, 1.2, rr(0.5, 0.9), 0xd8c9a0);
	};
	fx.muzzle = (x, y, z) => {
		fx.emit(x, y, z, 0, 0, 0, 0.45, 0.05, 0.07, 0xfff0a0);
		fx.emit(x, y, z, 0, 0, 0, 0.25, 0.02, 0.1, 0xff9a30);
	};
	fx.sparks = (x, y, z, n = 5) => {
		for (let k = 0; k < n; k++) fx.emit(x, y, z, rr(-3, 3), rr(0.5, 3), rr(-3, 3), 0.14, 0.02, rr(0.15, 0.3), 0xffd35a);
	};
	fx.explosion = (x, y, z) => {
		for (let k = 0; k < 26; k++) fx.emit(x, y + 0.5, z, rr(-6, 6), rr(1, 8), rr(-6, 6), 1.2, 0.2, rr(0.5, 1.1), k % 3 ? 0xff7a1a : 0xffd35a);
		for (let k = 0; k < 14; k++) fx.emit(x, y + 1, z, rr(-3, 3), rr(2, 6), rr(-3, 3), 1.6, 3.4, rr(1.2, 2), 0x2a2a2e);
	};
	fx.blood = (x, y, z) => {
		for (let k = 0; k < 4; k++) fx.emit(x, y, z, rr(-2, 2), rr(0.5, 2.5), rr(-2, 2), 0.12, 0.04, rr(0.2, 0.4), 0xb01e2a);
	};

	const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
	const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
	const tracers = [];
	for (let i = 0; i < TRACERS; i++) {
		const m = new THREE.Mesh(tracerGeo, tracerMat);
		m.visible = false;
		m.frustumCulled = false;
		scene.add(m);
		tracers.push({ m, life: 0 });
	}
	let tracerCursor = 0;
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	fx.tracer = (ax, ay, az, bx, by, bz) => {
		const t = tracers[tracerCursor];
		tracerCursor = (tracerCursor + 1) % TRACERS;
		a.set(ax, ay, az);
		b.set(bx, by, bz);
		t.m.position.copy(a).add(b).multiplyScalar(0.5);
		t.m.lookAt(b);
		t.m.scale.set(1, 1, a.distanceTo(b));
		t.m.visible = true;
		t.life = 0.07;
	};

	const skidGeo = new THREE.PlaneGeometry(0.34, 1.1).rotateX(-Math.PI / 2);
	const skidMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0d, transparent: true, opacity: 0.4, depthWrite: false });
	const skids = new THREE.InstancedMesh(skidGeo, skidMat, SKIDS);
	skids.frustumCulled = false;
	for (let i = 0; i < SKIDS; i++) hide(skids, i);
	scene.add(skids);
	let skidCursor = 0;
	fx.skid = (x, z, psi) => {
		dummy.position.set(x, 0.045, z);
		dummy.rotation.set(0, psi, 0);
		dummy.scale.set(1, 1, 1);
		dummy.updateMatrix();
		skids.setMatrixAt(skidCursor, dummy.matrix);
		skidCursor = (skidCursor + 1) % SKIDS;
		skids.instanceMatrix.needsUpdate = true;
	};

	fx.update = (dt) => {
		for (let i = 0; i < POOL; i++) {
			const p = P[i];
			if (!p.on) continue;
			p.life += dt;
			if (p.life >= p.max) {
				p.on = false;
				hide(mesh, i);
				continue;
			}
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.z += p.vz * dt;
			p.vy -= (p.s1 > p.s0 ? -0.5 : 6) * dt;
			const t = p.life / p.max;
			const s = p.s0 + (p.s1 - p.s0) * t;
			dummy.position.set(p.x, Math.max(0.05, p.y), p.z);
			dummy.rotation.set(0, p.rot, 0);
			dummy.scale.setScalar(s);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
		for (const t of tracers) {
			if (!t.m.visible) continue;
			t.life -= dt;
			if (t.life <= 0) t.m.visible = false;
		}
	};

	return fx;
}
