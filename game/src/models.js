// Low-poly models: boxes and prisms merged into one vertex-coloured geometry each; no image files.
import * as THREE from 'three';
import { CAR_TYPES, PALETTE } from './config.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

function boxTris(p) {
	const hw = p.w / 2;
	const hh = p.h / 2;
	const hd = p.d / 2;
	const hwt = hw * (p.tx ?? 1);
	const hdt = hd * (p.tz ?? 1);
	const ts = p.ts ?? 0;
	const b0 = [-hw, -hh, -hd], b1 = [hw, -hh, -hd], b2 = [hw, -hh, hd], b3 = [-hw, -hh, hd];
	const t0 = [-hwt, hh, -hdt + ts], t1 = [hwt, hh, -hdt + ts], t2 = [hwt, hh, hdt + ts], t3 = [-hwt, hh, hdt + ts];
	const faces = [
		[t0, t3, t2], [t0, t2, t1],
		[b0, b1, b2], [b0, b2, b3],
		[b3, b2, t2], [b3, t2, t3],
		[b1, b0, t0], [b1, t0, t1],
		[b2, b1, t1], [b2, t1, t2],
		[b0, b3, t3], [b0, t3, t0],
	];
	const out = [];
	for (const f of faces) for (const v of f) out.push(v[0], v[1], v[2]);
	return out;
}

function cylTris(p) {
	const geo = new THREE.CylinderGeometry(p.r, p.rt ?? p.r, p.l, p.seg ?? 8).toNonIndexed();
	if (p.axis === 'x') geo.rotateZ(Math.PI / 2);
	else if (p.axis === 'z') geo.rotateX(Math.PI / 2);
	const arr = Array.from(geo.attributes.position.array);
	geo.dispose();
	return arr;
}

// Merge parts { w,h,d | r,rt,l,axis; x,y,z; rx,ry,rz; c; tx,tz,ts (taper) } into one vertex-coloured geometry.
export function mergeParts(parts) {
	const pos = [];
	const col = [];
	const c = new THREE.Color();
	for (const p of parts) {
		c.set(p.c ?? 0xffffff);
		_e.set(p.rx || 0, p.ry || 0, p.rz || 0);
		_q.setFromEuler(_e);
		_v.set(p.x || 0, p.y || 0, p.z || 0);
		_m.compose(_v, _q, _one);
		const tris = p.r ? cylTris(p) : boxTris(p);
		for (let i = 0; i < tris.length; i += 3) {
			_v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(_m);
			pos.push(_v.x, _v.y, _v.z);
			col.push(c.r, c.g, c.b);
		}
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	geo.computeVertexNormals();
	geo.computeBoundingSphere();
	return geo;
}

export const vertexMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

const GLASS = 0x2c3e55;
const DARK = 0x16181d;
const carCache = {};

function carParts(type) {
	const s = CAR_TYPES[type];
	const L = s.len;
	const W = s.wid;
	const paint = [];
	const detail = [];
	const wheelR = type === 'pickup' ? 0.42 : 0.35;
	const wheelX = W / 2 - 0.02;
	const wz = L / 2 - 1;
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) detail.push({ r: wheelR, l: 0.3, axis: 'x', x: sx * wheelX, y: wheelR, z: sz * wz, c: DARK });
	detail.push({ w: W + 0.3, h: 0.02, d: L + 0.5, y: 0.03, c: 0x101215 }); // soft shadow patch under the car
	for (const sz of [-1, 1]) {
		detail.push({ w: W, h: 0.22, d: 0.18, y: 0.5, z: (sz * L) / 2, c: DARK });
		for (const sx of [-1, 1]) detail.push({ w: 0.42, h: 0.17, d: 0.06, x: sx * (W / 2 - 0.4), y: 0.82, z: sz * (L / 2 + 0.02), c: sz > 0 ? 0xfff3b8 : 0xd8261e });
	}
	if (type === 'sports') {
		paint.push({ w: W, h: 0.5, d: L, y: 0.62, tx: 0.92 });
		paint.push({ w: W * 0.82, h: 0.09, d: L * 0.34, y: 1.22, z: -0.25, c: 0xffffff });
		detail.push({ w: W * 0.8, h: 0.38, d: L * 0.4, y: 1, z: -0.25, tx: 0.82, tz: 0.65, c: GLASS });
		paint.push({ w: W + 0.05, h: 0.08, d: 0.5, y: 1.05, z: -L / 2 + 0.2 }); // spoiler
		for (const sx of [-0.6, 0.6]) detail.push({ w: 0.08, h: 0.28, d: 0.1, x: sx, y: 0.88, z: -L / 2 + 0.2, c: DARK });
		return { paint, detail };
	}
	if (type === 'pickup') {
		paint.push({ w: W, h: 0.7, d: L * 0.55, y: 0.78, z: L * 0.22 });
		paint.push({ w: W * 0.82, h: 0.1, d: 1.3, y: 1.78, z: L * 0.12 });
		detail.push({ w: W * 0.84, h: 0.55, d: 1.45, y: 1.45, z: L * 0.12, tx: 0.9, tz: 0.8, c: GLASS });
		for (const sx of [-1, 1]) paint.push({ w: 0.1, h: 0.5, d: L * 0.38, x: sx * (W / 2 - 0.05), y: 1, z: -L * 0.26 });
		paint.push({ w: W, h: 0.5, d: 0.1, y: 1, z: -L / 2 + 0.05 });
		detail.push({ w: W - 0.2, h: 0.1, d: L * 0.38, y: 0.74, z: -L * 0.26, c: 0x2a2a2e });
		return { paint, detail };
	}
	paint.push({ w: W, h: 0.64, d: L, y: 0.68 });
	paint.push({ w: W * 0.8, h: 0.1, d: L * 0.38, y: 1.66, z: -0.2, c: type === 'police' ? 0x16181d : 0xffffff });
	detail.push({ w: W * 0.86, h: 0.52, d: L * 0.5, y: 1.32, z: -0.2, tx: 0.88, tz: 0.78, c: GLASS });
	if (type === 'taxi') {
		detail.push({ w: 0.7, h: 0.22, d: 0.3, y: 1.84, z: -0.2, c: 0xfff6c0 });
		detail.push({ w: W + 0.02, h: 0.1, d: L * 0.8, y: 0.62, c: 0x16181d });
	}
	if (type === 'police') {
		for (const sx of [-1, 1]) detail.push({ w: 0.06, h: 0.4, d: L * 0.46, x: sx * (W / 2 + 0.005), y: 0.7, z: -0.1, c: 0x16181d });
		detail.push({ w: W * 0.9, h: 0.12, d: 0.5, y: 1, z: L / 2 - 0.9, c: 0x16181d });
	}
	return { paint, detail };
}

export function carGeometry(type) {
	if (!carCache[type]) {
		const p = carParts(type);
		carCache[type] = { paint: mergeParts(p.paint), detail: mergeParts(p.detail) };
	}
	return carCache[type];
}

const sirenGeo = new THREE.BoxGeometry(0.55, 0.2, 0.3);
const siren = (color) => new THREE.MeshBasicMaterial({ color });
export const sirenMats = { red: siren(0xff2a2a), blue: siren(0x2a5aff), off: siren(0x331818) };

export function buildCarMesh(type, color) {
	const g = carGeometry(type);
	const paintMat = new THREE.MeshLambertMaterial({ color });
	const group = new THREE.Group();
	const body = new THREE.Mesh(g.paint, paintMat);
	const detail = new THREE.Mesh(g.detail, vertexMaterial);
	group.add(body, detail);
	let bars = null;
	if (type === 'police') {
		bars = [sirenMats.red, sirenMats.blue].map((m, i) => new THREE.Mesh(sirenGeo, m).translateX(i ? -0.3 : 0.3).translateY(1.82).translateZ(-0.2));
		group.add(...bars);
	}
	return { group, paintMat, bars };
}

const outfitCache = new Map();

function outfit(shirt, pants, skin, hair, sleeves) {
	const key = [shirt, pants, skin, hair, sleeves].join('-');
	let o = outfitCache.get(key);
	if (o) return o;
	const body = mergeParts([
		{ w: 0.52, h: 0.58, d: 0.28, y: 1.24, c: shirt },
		{ w: 0.28, h: 0.3, d: 0.27, y: 1.68, c: skin },
		{ w: 0.3, h: 0.12, d: 0.3, y: 1.82, c: hair },
		{ w: 0.22, h: 0.04, d: 0.02, y: 1.72, z: 0.14, c: 0x2a2018 },
		{ w: 0.54, h: 0.1, d: 0.3, y: 0.97, c: pants },
	]);
	const arm = mergeParts([
		{ w: 0.15, h: 0.3, d: 0.15, y: -0.15, c: shirt },
		{ w: 0.12, h: 0.3, d: 0.12, y: -0.45, c: sleeves ? shirt : skin },
	]);
	const leg = mergeParts([
		{ w: 0.21, h: 0.5, d: 0.21, y: -0.25, c: pants },
		{ w: 0.22, h: 0.1, d: 0.3, y: -0.55, z: 0.04, c: 0x15151a },
	]);
	o = { body, arm, leg };
	outfitCache.set(key, o);
	return o;
}

const gunGeo = mergeParts([{ w: 0.07, h: 0.13, d: 0.3, y: -0.6, z: 0.18, c: 0x25262b }]);
const blobGeo = new THREE.CircleGeometry(0.55, 10).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

// A walking character from style { shirt, pants, skin, hair, sleeves, armed }.
export function buildHuman(style) {
	const o = outfit(style.shirt, style.pants, style.skin, style.hair, !!style.sleeves);
	const group = new THREE.Group();
	const root = new THREE.Group(); // rotated when knocked down
	group.add(root);
	const body = new THREE.Mesh(o.body, vertexMaterial);
	const armL = new THREE.Mesh(o.arm, vertexMaterial);
	const armR = new THREE.Mesh(o.arm, vertexMaterial);
	const legL = new THREE.Mesh(o.leg, vertexMaterial);
	const legR = new THREE.Mesh(o.leg, vertexMaterial);
	armL.position.set(0.34, 1.48, 0);
	armR.position.set(-0.34, 1.48, 0);
	legL.position.set(0.12, 0.95, 0);
	legR.position.set(-0.12, 0.95, 0);
	root.add(body, armL, armR, legL, legR);
	const gun = new THREE.Mesh(gunGeo, vertexMaterial);
	gun.visible = !!style.armed;
	armR.add(gun);
	const blob = new THREE.Mesh(blobGeo, blobMat);
	blob.position.y = 0.04;
	group.add(blob);
	return { group, root, armL, armR, legL, legR, gun, blob };
}

export function randomOutfit(rand, kind) {
	const pick = (l) => l[Math.floor(rand() * l.length)];
	if (kind === 'cop') return { shirt: 0x1f3a6e, pants: 0x14213d, skin: pick(PALETTE.skin), hair: 0x0f1a33, sleeves: true, armed: true };
	if (kind === 'gang') return { shirt: rand() < 0.5 ? 0x9a1f2b : 0x22252b, pants: 0x15151a, skin: pick(PALETTE.skin), hair: pick(PALETTE.hair), sleeves: rand() < 0.5, armed: true };
	if (kind === 'mara') return { shirt: 0x2fb8c8, pants: 0x2c3a55, skin: PALETTE.skin[1], hair: 0x2a1408, sleeves: false, armed: true };
	return { shirt: pick(PALETTE.shirts), pants: pick(PALETTE.pants), skin: pick(PALETTE.skin), hair: pick(PALETTE.hair), sleeves: rand() < 0.4, armed: false };
}

export function animateHuman(rig, t, speed, aim, punch) {
	const swing = Math.sin(t * (4 + speed * 1.3)) * Math.min(1, speed / 3) * 0.9;
	rig.legL.rotation.x = swing;
	rig.legR.rotation.x = -swing;
	rig.armL.rotation.x = -swing * 0.8;
	rig.armR.rotation.x = aim ? -1.5 : swing * 0.8;
	if (punch > 0) rig.armR.rotation.x = -1.2 - Math.sin(punch * Math.PI) * 0.4;
	rig.root.position.y = Math.abs(Math.sin(t * (4 + speed * 1.3))) * Math.min(1, speed / 4) * 0.05;
}
