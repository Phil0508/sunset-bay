// The city: road grid, procedural buildings, props, sea, hills, and collision / line-of-sight queries.
import * as THREE from 'three';
import { GRID, PITCH, ROAD_W, BLOCK, SIDEWALK, lineC, WORLD, PALETTE } from './config.js';
import { rand, rr, ri, pick } from './util.js';
import { mergeParts, vertexMaterial } from './models.js';

const TILE = 16; // world units covered by one repeat of the 4x4-window facade texture

function canvasTex(c) {
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

function paintFacade(lit) {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d');
	g.fillStyle = lit ? '#000' : '#fff';
	g.fillRect(0, 0, 128, 128);
	let seed = 7;
	const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	for (let cy = 0; cy < 4; cy++) {
		for (let cx = 0; cx < 4; cx++) {
			const on = r() < 0.42;
			const x = cx * 32 + 6;
			const y = cy * 32 + 5;
			if (lit && !on) continue;
			g.fillStyle = lit ? '#ffcf6e' : on ? '#8fb6d6' : '#3a516d';
			g.fillRect(x, y, 20, 20);
			if (!lit) {
				g.fillStyle = 'rgba(255,255,255,0.25)';
				g.fillRect(x, y, 20, 5);
			}
		}
	}
	const tex = canvasTex(c);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.anisotropy = 4;
	return tex;
}

function makeSign(text, w, h, bg, fg) {
	const c = document.createElement('canvas');
	c.width = 512;
	c.height = Math.round((512 * h) / w);
	const g = c.getContext('2d');
	g.fillStyle = bg;
	g.fillRect(0, 0, c.width, c.height);
	g.strokeStyle = fg;
	g.lineWidth = 8;
	g.strokeRect(8, 8, c.width - 16, c.height - 16);
	g.fillStyle = fg;
	g.font = `bold ${Math.round(c.height * 0.5)}px system-ui, sans-serif`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText(text, c.width / 2, c.height / 2 + 4, c.width - 40);
	return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTex(c) }));
}

const SPECIAL = {
	'5,7': 'office',
	'9,4': 'tower',
	'2,9': 'garage',
	'10,1': 'villa',
	'0,2': 'warehouse',
	'1,2': 'warehouse',
	'11,10': 'cafe',
	'5,5': 'park',
	'6,5': 'park',
	'3,10': 'park',
	'8,8': 'park',
	'1,6': 'park',
	'10,6': 'park',
};

export function createWorld(scene) {
	const world = { blocks: [], night: 0 };
	const root = new THREE.Group();
	scene.add(root);

	const grass = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f9a52 }));
	grass.position.y = -0.06;
	root.add(grass);

	const span = lineC(GRID) - lineC(0) + ROAD_W;
	const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3e46 }));
	asphalt.position.y = -0.01;
	root.add(asphalt);

	const sand = new THREE.Mesh(new THREE.PlaneGeometry(span + 40, WORLD.seaZ - (lineC(GRID) + 7) + 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xecd9a2 }));
	sand.position.set(0, 0.01, (lineC(GRID) + 7 + WORLD.seaZ) / 2);
	root.add(sand);
	const wet = new THREE.Mesh(new THREE.PlaneGeometry(span + 40, 14).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc9b57e }));
	wet.position.set(0, 0.02, WORLD.seaZ - 6);
	root.add(wet);

	const sea = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1800, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f9bc4 }));
	sea.position.set(0, -0.35, WORLD.seaZ + 900 - 4);
	root.add(sea);

	const slabGeo = new THREE.BoxGeometry(1, 1, 1);
	const slabs = new THREE.InstancedMesh(slabGeo, new THREE.MeshLambertMaterial({ color: 0xb9b5aa }), GRID * GRID + 4);
	const dummy = new THREE.Object3D();
	let si = 0;
	const put = (mesh, k, x, y, z, ry = 0, sc = 1) => {
		dummy.position.set(x, y, z);
		dummy.rotation.set(0, ry, 0);
		dummy.scale.set(sc, sc, sc);
		dummy.updateMatrix();
		mesh.setMatrixAt(k, dummy.matrix);
	};
	const placeSlab = (cx, cz, w, d, h = 0.28) => {
		dummy.position.set(cx, h / 2, cz);
		dummy.scale.set(w, h, d);
		dummy.rotation.set(0, 0, 0);
		dummy.updateMatrix();
		slabs.setMatrixAt(si++, dummy.matrix);
	};
	for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) placeSlab((lineC(i) + lineC(i + 1)) / 2, (lineC(j) + lineC(j + 1)) / 2, BLOCK, BLOCK);
	placeSlab(0, lineC(GRID) + 7 + 11, span + 14, 22);
	slabs.count = si;
	root.add(slabs);

	const facadeMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: paintFacade(false), emissiveMap: paintFacade(true), emissive: 0xffffff, emissiveIntensity: 0 });
	const P = [];
	const UV = [];
	const C = [];
	const col = new THREE.Color();
	const wall = (ax, az, bx, bz, y0, y1, color, uoff) => {
		const len = Math.hypot(bx - ax, bz - az);
		const u0 = uoff;
		const u1 = uoff + len / TILE;
		const v0 = y0 / TILE;
		const v1 = y1 / TILE;
		// outward normal comes from winding: a->b is walked clockwise seen from above
		P.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
		UV.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
		for (let k = 0; k < 6; k++) C.push(color.r, color.g, color.b);
	};
	const roofQuad = (x0, z0, x1, z1, y, color) => {
		P.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
		for (let k = 0; k < 6; k++) {
			UV.push(0.01, 0.01);
			C.push(color.r, color.g, color.b);
		}
	};
	const addBox = (x0, z0, x1, z1, y0, h, color, uoff) => {
		wall(x0, z1, x1, z1, y0, y0 + h, color, uoff); // +z face
		wall(x1, z0, x0, z0, y0, y0 + h, color, uoff + 0.3); // -z face
		wall(x1, z1, x1, z0, y0, y0 + h, color, uoff + 0.6); // +x face
		wall(x0, z0, x0, z1, y0, y0 + h, color, uoff + 0.9); // -x face
		col.copy(color).multiplyScalar(0.8);
		roofQuad(x0, z0, x1, z1, y0 + h, col);
	};
	const SLAB = 0.28;
	const roofProps = [];
	const addBuilding = (box, color, tiers) => {
		const { x0, z0, x1, z1, h } = box;
		addBox(x0, z0, x1, z1, SLAB, h, color, rand());
		let top = SLAB + h;
		if (tiers && h > 26) {
			const ix = (x1 - x0) * 0.16;
			const iz = (z1 - z0) * 0.16;
			const th = h * 0.32;
			addBox(x0 + ix, z0 + iz, x1 - ix, z1 - iz, top, th, color, rand());
			top += th;
			roofProps.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: top, antenna: true });
		} else if (h > 12) {
			roofProps.push({ x: (x0 + x1) / 2 + rr(-3, 3), z: (z0 + z1) / 2 + rr(-3, 3), y: top, antenna: false });
		}
	};

	const parks = [];
	const signs = [];
	for (let i = 0; i < GRID; i++) {
		world.blocks[i] = [];
		for (let j = 0; j < GRID; j++) {
			const bx0 = lineC(i) + ROAD_W / 2;
			const bz0 = lineC(j) + ROAD_W / 2;
			const bx1 = lineC(i + 1) - ROAD_W / 2;
			const bz1 = lineC(j + 1) - ROAD_W / 2;
			const m = SIDEWALK + 2;
			const ix0 = bx0 + m;
			const iz0 = bz0 + m;
			const ix1 = bx1 - m;
			const iz1 = bz1 - m;
			const blk = { i, j, boxes: [], kind: 'normal' };
			world.blocks[i][j] = blk;
			const kind = SPECIAL[`${i},${j}`];
			const dd = Math.hypot(i - 8.5, j - 4.5);
			const downtown = Math.exp(-(dd * dd) / 11);
			const beach = j >= 10;
			const palette = downtown > 0.35 ? PALETTE.downtown : beach ? PALETTE.beach : PALETTE.buildings;
			const mk = (x0, z0, x1, z1, h) => {
				const box = { x0, z0, x1, z1, h };
				blk.boxes.push(box);
				return box;
			};
			const make = (x0, z0, x1, z1, h, color) => {
				const b = mk(x0, z0, x1, z1, h);
				addBuilding(b, new THREE.Color(color ?? pick(palette)), true);
			};
			if (kind) {
				blk.kind = kind;
				switch (kind) {
					case 'park':
				parks.push({ x: (bx0 + bx1) / 2, z: (bz0 + bz1) / 2 });
						break;
					case 'office':
				make(ix0, iz1 - 24, ix1, iz1, 11, 0x5fc4c0);
				make(ix0, iz0, ix1, iz0 + 14, 8, 0xf2e2b8);
				signs.push({ text: "ROSA'S COURIER CO.", w: 15, h: 3.2, x: (ix0 + ix1) / 2, y: 8.2, z: iz1 + 0.15, ry: 0, bg: '#173a4a', fg: '#ffd35a' });
						break;
					case 'tower':
				make(ix0 + 4, iz0 + 4, ix1 - 4, iz1 - 4, 86, 0x6f93b8);
				signs.push({ text: 'SKYLINE TOWER', w: 22, h: 4.4, x: ix0 + 3.8, y: 11, z: (iz0 + iz1) / 2, ry: -Math.PI / 2, bg: '#10243a', fg: '#9fe6ff' });
						break;
					case 'garage':
				make(ix0, iz0 + 6, ix1, iz1 - 6, 8, 0xd98a3a);
				signs.push({ text: 'HARBOR GARAGE', w: 18, h: 3.6, x: ix0 - 0.15, y: 6, z: (iz0 + iz1) / 2, ry: -Math.PI / 2, bg: '#2a2d33', fg: '#ffb347' });
						break;
					case 'cafe':
				make(ix0, iz0 + 8, ix1 - 8, iz1 - 8, 7, 0xffd1c1);
				signs.push({ text: 'PIER 9 CAFE', w: 14, h: 3, x: ix0 - 0.15, y: 5.4, z: (iz0 + iz1) / 2, ry: -Math.PI / 2, bg: '#0f5a73', fg: '#fff4d1' });
						break;
					case 'villa':
				make(ix0 + 6, iz0 + 14, ix1 - 6, iz1 - 6, 9, 0xf4eadb);
						break;
					case 'warehouse':
				make(ix0, iz0, ix1, (iz0 + iz1) / 2 - 2, 9, 0x8c8f96);
				make(ix0, (iz0 + iz1) / 2 + 2, ix1, iz1, 12, 0x7a7e86);
						break;
				}
				continue;
			}
			const hmax = beach ? 15 : 12 + 62 * downtown;
			const hmin = beach ? 6 : 8;
			const layout = rand();
			const hh = () => rr(hmin, Math.max(hmin + 2, hmax)) * (0.7 + 0.5 * rand());
			if (layout < 0.3) {
				make(ix0, iz0, ix1, iz1, hh());
			} else if (layout < 0.62) {
				const split = rr(0.4, 0.6);
				if (rand() < 0.5) {
					const zm = iz0 + (iz1 - iz0) * split;
					make(ix0, iz0, ix1, zm - 1.5, hh());
					make(ix0, zm + 1.5, ix1, iz1, hh());
				} else {
					const xm = ix0 + (ix1 - ix0) * split;
					make(ix0, iz0, xm - 1.5, iz1, hh());
					make(xm + 1.5, iz0, ix1, iz1, hh());
				}
			} else {
				const xm = (ix0 + ix1) / 2;
				const zm = (iz0 + iz1) / 2;
				make(ix0, iz0, xm - 1.5, zm - 1.5, hh());
				make(xm + 1.5, iz0, ix1, zm - 1.5, hh());
				make(ix0, zm + 1.5, xm - 1.5, iz1, hh());
				if (rand() < 0.8) make(xm + 1.5, zm + 1.5, ix1, iz1, hh());
			}
		}
	}

	const bGeo = new THREE.BufferGeometry();
	bGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
	bGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
	bGeo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
	bGeo.computeVertexNormals();
	bGeo.computeBoundingSphere();
	const buildings = new THREE.Mesh(bGeo, facadeMat);
	root.add(buildings);

	const roofParts = [];
	for (const r of roofProps) {
		roofParts.push({ w: 2.6, h: 1.4, d: 2.2, x: r.x, y: r.y + 0.7, z: r.z, c: 0x9a9a9a });
		if (r.antenna) roofParts.push({ w: 0.25, h: 9, d: 0.25, x: r.x + 1.5, y: r.y + 4.5, z: r.z + 1.5, c: 0xcc3b3b });
	}
	if (roofParts.length) root.add(new THREE.Mesh(mergeParts(roofParts), vertexMaterial));

	const parkMat = new THREE.MeshLambertMaterial({ color: 0x58a05a });
	for (const p of parks) {
		const pad = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 7, 0.1, BLOCK - 7), parkMat);
		pad.position.set(p.x, 0.32, p.z);
		root.add(pad);
	}

	for (const s of signs) {
		const m = makeSign(s.text, s.w, s.h, s.bg, s.fg);
		m.position.set(s.x, s.y, s.z);
		m.rotation.y = s.ry;
		root.add(m);
	}

	const markGeo = new THREE.BoxGeometry(1, 1, 1);
	const marks = new THREE.InstancedMesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 9000);
	let mi = 0;
	const yellow = new THREE.Color(0xf2c230);
	const white = new THREE.Color(0xe8e8e8);
	const mark = (x, z, sx, sz, color) => {
		if (mi >= 9000) return;
		dummy.position.set(x, 0.03, z);
		dummy.scale.set(sx, 0.02, sz);
		dummy.updateMatrix();
		marks.setMatrixAt(mi, dummy.matrix);
		marks.setColorAt(mi, color);
		mi += 1;
	};
	for (let a = 0; a <= GRID; a++) {
		for (let s = 0; s < GRID; s++) {
			const c0 = lineC(s) + ROAD_W / 2 + 2;
			const c1 = lineC(s + 1) - ROAD_W / 2 - 2;
			for (let t = c0; t < c1 - 3; t += 7) {
				mark(lineC(a), t + 1.5, 0.22, 3, yellow); // road along z at x = line a
				mark(t + 1.5, lineC(a), 3, 0.22, yellow); // road along x at z = line a
			}
		}
		for (let b = 0; b <= GRID; b++) {
			const cx = lineC(a);
			const cz = lineC(b);
			for (let k = -2; k <= 2; k++) {
				const o = k * 2.4;
				mark(cx + o, cz - ROAD_W / 2 - 1.2, 0.9, 2.2, white);
				mark(cx + o, cz + ROAD_W / 2 + 1.2, 0.9, 2.2, white);
				mark(cx - ROAD_W / 2 - 1.2, cz + o, 2.2, 0.9, white);
				mark(cx + ROAD_W / 2 + 1.2, cz + o, 2.2, 0.9, white);
			}
		}
	}
	marks.count = mi;
	marks.instanceMatrix.needsUpdate = true;
	root.add(marks);

	const palmTrunkGeo = mergeParts([{ r: 0.14, rt: 0.26, l: 6.2, y: 3.1, c: 0x7d5c3c, seg: 6 }]);
	const crown = [];
	const tmp = new THREE.Vector3();
	const eul = new THREE.Euler();
	for (let k = 0; k < 7; k++) {
		const a = (k / 7) * Math.PI * 2;
		eul.set(0, a, -0.38);
		tmp.set(1.5, 0, 0).applyEuler(eul);
		crown.push({ w: 3.1, h: 0.08, d: 0.75, x: tmp.x, y: 6.25 + tmp.y, z: tmp.z, ry: a, rz: -0.38, c: k % 2 ? 0x3f9a4a : 0x56b05a, tx: 0.7 });
	}
	crown.push({ w: 0.5, h: 0.4, d: 0.5, y: 6.2, c: 0x6b4a2a });
	const palmCrownGeo = mergeParts(crown);
	const palmSpots = [];
	const addPalm = (x, z) => palmSpots.push([x, z]);
	for (let x = lineC(0) + 6; x < lineC(GRID); x += 13) addPalm(x, lineC(GRID) + 11);
	for (let x = lineC(0) + 10; x < lineC(GRID); x += 26) addPalm(x + rr(-2, 2), lineC(GRID) + 20);
	for (const p of parks) for (let k = 0; k < 11; k++) addPalm(p.x + rr(-22, 22), p.z + rr(-22, 22));
	for (let k = 0; k < 40; k++) addPalm(rr(-400, 400), rr(WORLD.seaZ - 60, WORLD.seaZ - 24));
	for (let a = 0; a <= GRID; a++) {
		for (let s = 0; s < GRID; s++) {
			if (rand() < 0.55) continue;
			const t = lineC(s) + ROAD_W / 2 + 14 + rr(0, 26);
			const side = rand() < 0.5 ? 9.8 : -9.8;
			if (rand() < 0.5) addPalm(lineC(a) + side, t);
			else addPalm(t, lineC(a) + side);
		}
	}
	const trunks = new THREE.InstancedMesh(palmTrunkGeo, vertexMaterial, palmSpots.length);
	const crowns = new THREE.InstancedMesh(palmCrownGeo, vertexMaterial, palmSpots.length);
	palmSpots.forEach(([x, z], k) => {
		put(trunks, k, x, 0.28, z, rand() * 6.28, rr(0.8, 1.3));
		crowns.setMatrixAt(k, dummy.matrix);
	});
	root.add(trunks, crowns);

	const poleGeo = mergeParts([
		{ w: 0.2, h: 6.4, d: 0.2, y: 3.2, c: 0x4a4e55 },
		{ w: 1.5, h: 0.14, d: 0.14, x: -0.65, y: 6.35, c: 0x4a4e55 },
	]);
	const bulbGeo = new THREE.BoxGeometry(0.5, 0.16, 0.3);
	const lampSpots = [];
	for (let a = 0; a <= GRID; a++) {
		for (let b = 0; b <= GRID; b++) {
			if ((a + b) % 2 === 0) lampSpots.push([lineC(a) + 7.6, lineC(b) + 7.6]);
			else lampSpots.push([lineC(a) - 7.6, lineC(b) - 7.6]);
		}
	}
	for (let a = 0; a <= GRID; a += 2) for (let s = 0; s < GRID; s++) lampSpots.push([lineC(a) + 7.4, (lineC(s) + lineC(s + 1)) / 2 + 3]);
	const poles = new THREE.InstancedMesh(poleGeo, vertexMaterial, lampSpots.length);
	const bulbMat = new THREE.MeshBasicMaterial({ color: 0x9a9a8a });
	const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
	lampSpots.forEach(([x, z], k) => {
		put(poles, k, x, 0.28, z);
		put(bulbs, k, x - 1.3, 6.53, z);
	});
	root.add(poles, bulbs);
	world.bulbMat = bulbMat;

	const benchGeo = mergeParts([
		{ w: 1.6, h: 0.1, d: 0.5, y: 0.5, c: 0x8a5a33 },
		{ w: 1.6, h: 0.5, d: 0.08, y: 0.8, z: -0.22, c: 0x8a5a33 },
		{ w: 0.1, h: 0.5, d: 0.5, x: 0.7, y: 0.25, c: 0x3a3d44 },
		{ w: 0.1, h: 0.5, d: 0.5, x: -0.7, y: 0.25, c: 0x3a3d44 },
	]);
	const binGeo = mergeParts([{ r: 0.28, rt: 0.32, l: 0.9, y: 0.45, c: 0x3f8f6b, seg: 7 }]);
	const benchSpots = [];
	for (let x = lineC(0) + 20; x < lineC(GRID); x += 40) benchSpots.push([x, lineC(GRID) + 14, 0]);
	for (const p of parks) for (let k = 0; k < 4; k++) benchSpots.push([p.x + rr(-16, 16), p.z + rr(-16, 16), rr(0, 6)]);
	const benches = new THREE.InstancedMesh(benchGeo, vertexMaterial, benchSpots.length);
	benchSpots.forEach(([x, z, r], k) => put(benches, k, x, 0.3, z, r));
	const binSpots = [];
	for (let k = 0; k < 90; k++) {
		const a = ri(0, GRID);
		const t = rr(lineC(0), lineC(GRID));
		if (rand() < 0.5) binSpots.push([lineC(a) + 9.6, t]);
		else binSpots.push([t, lineC(a) - 9.6]);
	}
	const bins = new THREE.InstancedMesh(binGeo, vertexMaterial, binSpots.length);
	binSpots.forEach(([x, z], k) => put(bins, k, x, 0.28, z));
	root.add(benches, bins);

	const pierParts = [];
	const pierLen = WORLD.maxZ - (WORLD.seaZ - 6);
	pierParts.push({ w: WORLD.pierHalf * 2, h: 0.3, d: pierLen, x: WORLD.pierX, y: 0.6, z: WORLD.seaZ - 6 + pierLen / 2, c: 0x9a7048 });
	for (let z = WORLD.seaZ + 4; z < WORLD.maxZ; z += 10) {
		for (const sx of [-1, 1]) {
			pierParts.push({ w: 0.35, h: 3, d: 0.35, x: WORLD.pierX + sx * (WORLD.pierHalf - 0.3), y: -0.5, z, c: 0x5c4026 });
			pierParts.push({ w: 0.12, h: 1, d: 0.12, x: WORLD.pierX + sx * (WORLD.pierHalf - 0.15), y: 1.3, z, c: 0xe9e2d0 });
		}
	}
	pierParts.push({ w: 12, h: 0.3, d: 12, x: WORLD.pierX, y: 0.62, z: WORLD.maxZ - 6, c: 0x8a6440 });
	root.add(new THREE.Mesh(mergeParts(pierParts), vertexMaterial));

	const hillParts = [];
	const haze = [0x7a9a86, 0x86a193, 0x93a89f, 0x6f8f7c];
	// each hill is two or three overlapping rounded mounds (stacked, shrinking frusta), hazier with height
	for (let k = 0; k < 24; k++) {
		const a = (k / 24) * Math.PI * 2;
		if (Math.sin(a) < -0.35) continue; // none out to sea (south)
		const r = 790 + rand() * 90;
		for (let m = ri(2, 3); m > 0; m--) {
			const w = rr(110, 220);
			const h = rr(35, 120);
			const x = Math.cos(a) * r + rr(-90, 90);
			const z = -Math.sin(a) * r * 0.9 - 40 + rr(-40, 40);
			for (let t = 0; t < 6; t++) {
				hillParts.push({ r: Math.max(0.05, Math.cos(t * 0.26)) * w, rt: Math.max(0.05, Math.cos(t * 0.26 + 0.26)) * w, l: h / 6, x, y: -6 + (h / 6) * (t + 0.5), z, c: haze[(k + m + (t >> 1)) % 4], seg: 10 });
			}
		}
	}
	root.add(new THREE.Mesh(mergeParts(hillParts), vertexMaterial));

	const out = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
	const cx0 = lineC(0);
	const cx1 = lineC(GRID);
	const blockAt = (x, z) => {
		if (x < cx0 || z < cx0 || x >= cx1 || z >= cx1) return null;
		return world.blocks[Math.floor((x - cx0) / PITCH)][Math.floor((z - cx0) / PITCH)];
	};

	/** Push a circle out of walls, buildings, the sea and the world edge. Result lives in a shared object. */
	world.collide = (x, z, r) => {
		out.hit = false;
		out.nx = 0;
		out.nz = 0;
		const hit = (nx, nz) => {
			out.hit = true;
			out.nx += nx;
			out.nz += nz;
		};
		if (x < WORLD.minX + r) { x = WORLD.minX + r; hit(1, 0); }
		if (x > WORLD.maxX - r) { x = WORLD.maxX - r; hit(-1, 0); }
		if (z < WORLD.minZ + r) { z = WORLD.minZ + r; hit(0, 1); }
		if (z > WORLD.maxZ - r) { z = WORLD.maxZ - r; hit(0, -1); }
		if (z > WORLD.seaZ - r) {
			const dx = x - WORLD.pierX;
			if (z > WORLD.seaZ + 0.2) {
				const lim = WORLD.pierHalf - r;
				if (dx > lim) { x = WORLD.pierX + lim; hit(-1, 0); }
				else if (dx < -lim) { x = WORLD.pierX - lim; hit(1, 0); }
			} else if (Math.abs(dx) > WORLD.pierHalf - r * 0.5) {
				z = WORLD.seaZ - r;
				hit(0, -1);
			}
		}
		const blk = blockAt(x, z);
		if (blk) {
			for (let pass = 0; pass < 2; pass++) {
				for (const b of blk.boxes) {
					const px = x < b.x0 ? b.x0 : x > b.x1 ? b.x1 : x;
					const pz = z < b.z0 ? b.z0 : z > b.z1 ? b.z1 : z;
					const dx = x - px;
					const dz = z - pz;
					const d2 = dx * dx + dz * dz;
					if (d2 >= r * r) continue;
					if (d2 > 1e-8) {
						const d = Math.sqrt(d2);
						const push = r - d;
						x += (dx / d) * push;
						z += (dz / d) * push;
						hit(dx / d, dz / d);
					} else {
						const l = x - b.x0;
						const rr2 = b.x1 - x;
						const t = z - b.z0;
						const bt = b.z1 - z;
						const m = Math.min(l, rr2, t, bt);
						if (m === l) { x = b.x0 - r; hit(-1, 0); }
						else if (m === rr2) { x = b.x1 + r; hit(1, 0); }
						else if (m === t) { z = b.z0 - r; hit(0, -1); }
						else { z = b.z1 + r; hit(0, 1); }
					}
				}
			}
		}
		out.x = x;
		out.z = z;
		const nl = Math.hypot(out.nx, out.nz);
		if (nl > 0) {
			out.nx /= nl;
			out.nz /= nl;
		}
		return out;
	};

	world.solidAt = (x, y, z) => {
		if (y < 0) return true;
		const blk = blockAt(x, z);
		if (!blk) return false;
		for (const b of blk.boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.h + 0.3) return true;
		return false;
	};

	world.los = (ax, az, bx, bz) => {
		const d = Math.hypot(bx - ax, bz - az);
		const n = Math.ceil(d / 3);
		for (let k = 1; k < n; k++) {
			const t = k / n;
			if (world.solidAt(ax + (bx - ax) * t, 1.2, az + (bz - az) * t)) return false;
		}
		return true;
	};

	world.setNight = (n) => {
		world.night = n;
		facadeMat.emissiveIntensity = n * 1.15;
		bulbMat.color.setRGB(0.6 + 0.4 * n, 0.6 + 0.35 * n, 0.55 + 0.1 * n - 0.15 * n * n);
	};
	world.setNight(0);

	world.update = (t) => {
		sea.position.y = -0.35 + Math.sin(t * 0.8) * 0.06;
	};

	return world;
}
