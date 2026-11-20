// Renderer, fog and the sky: a vertex-coloured dome plus sun, hemisphere light and stars follow the clock.
import * as THREE from 'three';
import { lerp } from './util.js';

const KEYS = [
	[0, 0x070b1f, 0x1a2347, 0x6a7bb8, 0.25, 0x2a3566, 0x15151f, 0.6, 1],
	[5.5, 0x2a3b6e, 0xf09a6a, 0xffa066, 0.9, 0x6a78a8, 0x3a3040, 0.7, 0.6],
	[7.5, 0x4a90d9, 0xcfe3f2, 0xfff0d0, 2.4, 0xbcd8f5, 0x6f8a58, 1, 0],
	[12, 0x3a86e0, 0xbfe0f7, 0xffffff, 2.8, 0xcfe6ff, 0x7a9a60, 1.1, 0],
	[16.5, 0x4a82cc, 0xf5d9a8, 0xffd9a0, 2.4, 0xcbd8ee, 0x8a7a5a, 1, 0],
	[18.2, 0x4c5f9f, 0xff8f5a, 0xff9a55, 1.9, 0xb08a9a, 0x5a4a50, 0.9, 0.25],
	[19.5, 0x2b2a5e, 0xd8566a, 0xe0605a, 1, 0x6a5a8a, 0x2a2430, 0.7, 0.75],
	[21, 0x0f1230, 0x3a2d58, 0x6a7bb8, 0.3, 0x2a3566, 0x15151f, 0.6, 1],
	[24, 0x070b1f, 0x1a2347, 0x6a7bb8, 0.25, 0x2a3566, 0x15151f, 0.6, 1],
];

const cA = new THREE.Color();
const cB = new THREE.Color();

function mixColor(out, a, b, t) {
	cA.setHex(a);
	cB.setHex(b);
	return out.copy(cA).lerp(cB, t);
}

export function createRenderer(canvas) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
	const scene = new THREE.Scene();
	scene.fog = new THREE.Fog(0xf5b48a, 140, 820);
	const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.2, 2600);
	camera.position.set(0, 10, 0);

	const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
	const hemi = new THREE.HemisphereLight(0xcbd8ee, 0x8a7a5a, 1);
	scene.add(sun, sun.target, hemi);

	const domeGeo = new THREE.SphereGeometry(1500, 24, 12);
	const domeColors = new Float32Array(domeGeo.attributes.position.count * 3);
	domeGeo.setAttribute('color', new THREE.BufferAttribute(domeColors, 3));
	const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
	dome.renderOrder = -10;
	scene.add(dome);

	const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(60, 20), new THREE.MeshBasicMaterial({ color: 0xfff1c0, fog: false, depthWrite: false }));
	sunDisc.renderOrder = -9;
	scene.add(sunDisc);

	const starGeo = new THREE.BufferGeometry();
	const stars = [];
	for (let k = 0; k < 260; k++) {
		const a = Math.random() * Math.PI * 2;
		const e = Math.acos(Math.random() * 0.95);
		stars.push(Math.cos(a) * Math.sin(e) * 1400, Math.cos(e) * 1400, Math.sin(a) * Math.sin(e) * 1400);
	}
	starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
	const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
	const starPoints = new THREE.Points(starGeo, starMat);
	scene.add(starPoints);

	const sunDir = new THREE.Vector3();
	const top = new THREE.Color();
	const hor = new THREE.Color();
	const sunCol = new THREE.Color();
	const tmp = new THREE.Color();
	const glow = new THREE.Color();

	const api = { renderer, scene, camera, night: 0, sunDir };

	api.setTime = (hour) => {
		const h = ((hour % 24) + 24) % 24;
		let k = 0;
		while (k < KEYS.length - 2 && h >= KEYS[k + 1][0]) k += 1;
		const a = KEYS[k];
		const b = KEYS[k + 1];
		const t = (h - a[0]) / (b[0] - a[0]);
		mixColor(top, a[1], b[1], t);
		mixColor(hor, a[2], b[2], t);
		mixColor(sunCol, a[3], b[3], t);
		const sunInt = lerp(a[4], b[4], t);
		mixColor(hemi.color, a[5], b[5], t);
		mixColor(hemi.groundColor, a[6], b[6], t);
		hemi.intensity = lerp(a[7], b[7], t);
		api.night = lerp(a[8], b[8], t);
		sun.color.copy(sunCol);
		sun.intensity = sunInt;
		const theta = ((h - 6) / 12) * Math.PI;
		const day = Math.sin(theta);
		const elev = Math.max(0.04, Math.abs(day)) * (day >= 0 ? 1 : 0.6);
		const el = Math.asin(Math.min(0.95, elev * 0.95));
		sunDir.set(Math.cos(theta) * Math.cos(el), Math.sin(el), 0.45 * Math.cos(el)).normalize();
		scene.fog.color.copy(hor);
		const pos = domeGeo.attributes.position;
		for (let v = 0; v < pos.count; v++) {
			const y = pos.getY(v) / 1500;
			const s = Math.min(1, Math.max(0, y)) ** 0.55;
			tmp.copy(hor).lerp(top, s);
			if (y < 0) tmp.copy(hor).multiplyScalar(0.8);
			const dx = pos.getX(v) / 1500;
			const dz = pos.getZ(v) / 1500;
			const d = Math.max(0, dx * sunDir.x + y * sunDir.y + dz * sunDir.z);
			const g = d ** 10 * (1 - api.night * 0.6) * 0.7;
			glow.copy(sunCol).multiplyScalar(g);
			domeColors[v * 3] = tmp.r + glow.r;
			domeColors[v * 3 + 1] = tmp.g + glow.g;
			domeColors[v * 3 + 2] = tmp.b + glow.b;
		}
		domeGeo.attributes.color.needsUpdate = true;
		starMat.opacity = Math.max(0, api.night - 0.55) * 2;
		sunDisc.material.color.copy(sunCol).lerp(new THREE.Color(0xffffff), 0.35);
		sunDisc.visible = api.night < 0.9;
	};

	api.follow = (pos) => {
		dome.position.copy(pos);
		starPoints.position.copy(pos);
		sunDisc.position.copy(pos).addScaledVector(sunDir, 1350);
		sunDisc.lookAt(pos);
		sun.position.copy(pos).addScaledVector(sunDir, 200);
		sun.target.position.copy(pos);
	};

	api.resize = () => {
		const w = window.innerWidth;
		const h = window.innerHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	};
	api.resize();
	window.addEventListener('resize', api.resize);
	api.setTime(17.5);
	return api;
}
