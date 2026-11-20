// Seedable random, clamps, angle maths. Heading psi points along (sin psi, cos psi); increasing psi turns left.

let state = 12345;

export function seedRandom(n) {
	state = (n >>> 0) || 1;
}

export function rand() {
	state = (state + 0x6d2b79f5) | 0;
	let t = Math.imul(state ^ (state >>> 15), 1 | state);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rr = (a, b) => a + (b - a) * rand();
export const ri = (a, b) => Math.floor(rr(a, b + 1));
export const pick = (list) => list[Math.floor(rand() * list.length)];
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const smooth = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function wrapPi(a) {
	while (a > Math.PI) a -= Math.PI * 2;
	while (a <= -Math.PI) a += Math.PI * 2;
	return a;
}

export function formatClock(hours) {
	const h = Math.floor(hours) % 24;
	const m = Math.floor((hours - Math.floor(hours)) * 60);
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
