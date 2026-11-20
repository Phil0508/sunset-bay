// All tuning numbers and story data in one place: grid, cars, weapons, wanted rules, POIs, missions.

export const STEP = 1 / 60;

/** City grid: 13 road lines each way make 12 x 12 blocks. Line i sits at (i - 6) * PITCH. */
export const GRID = 12;
export const PITCH = 70;
export const ROAD_W = 14;
export const BLOCK = PITCH - ROAD_W;
export const SIDEWALK = 3;
export const lineC = (i) => (i - 6) * PITCH;
export const at = (i, j) => [lineC(i), lineC(j)];

export const WORLD = {
	minX: -452,
	maxX: 452,
	minZ: -452,
	maxZ: 600,
	seaZ: 522, // the shoreline: beyond this only the pier is walkable
	pierHalf: 4.2,
	pierX: lineC(11),
};

export const LANE_OFFSET = 3.5;
export const CURB_OFFSET = 5.9;
export const SIDEWALK_OFFSET = 8.5;

export const CAR_TYPES = {
	sedan: { name: 'Bayliner', len: 4.4, wid: 1.9, accel: 17, top: 36, steer: 2.3, grip: 7.5, hp: 100, mass: 1, colors: [0x3d7ccc, 0xc9d1d9, 0x8a3b3b, 0x3f8f6b, 0x5a5a66, 0xd9a441] },
	taxi: { name: 'Sunbeam Cab', len: 4.5, wid: 1.9, accel: 16, top: 34, steer: 2.2, grip: 7.5, hp: 100, mass: 1, colors: [0xf2c230] },
	pickup: { name: 'Dunehauler', len: 5, wid: 2, accel: 15, top: 33, steer: 2, grip: 7, hp: 120, mass: 1.35, colors: [0xb3472c, 0x2f5d8a, 0xdadada, 0x4b6b3a] },
	sports: { name: 'Coral GT', len: 4.3, wid: 1.9, accel: 26, top: 56, steer: 2.6, grip: 8.5, hp: 90, mass: 0.9, colors: [0xe03a5e, 0xf2c230, 0x2fb8c8, 0xf2f2f2] },
	police: { name: 'Bay Patrol', len: 4.6, wid: 1.95, accel: 24, top: 47, steer: 2.5, grip: 8, hp: 130, mass: 1.15, colors: [0xf0f0f4] },
};

export const AMBIENT_TYPES = ['sedan', 'sedan', 'sedan', 'pickup', 'taxi', 'sedan', 'pickup', 'sports'];

export const PLAYER = {
	walk: 3.4,
	run: 7.2,
	jump: 6.6,
	gravity: 19,
	radius: 0.45,
	health: 100,
	ammo: 36, // reserve rounds; each gun also holds a magazine
	punchDamage: 14,
	punchCooldown: 0.45,
};

export const WEAPONS = {
	pistol: { name: 'PISTOL', dmg: 26, cd: 0.28, mag: 12, reload: 1, spread: 1 },
	smg: { name: 'SMG', dmg: 12, cd: 0.09, mag: 30, reload: 1.5, spread: 2.4 },
};

export const COUNTS = {
	traffic: 34,
	parked: 26,
	peds: 38,
	pickups: 14,
};

export const WANTED = {
	/** Seconds out of any cop's sight (and 55+ away) before one star is lost. */
	decay: 9,
	copSight: 60,
	spawnMin: 40,
	spawnMax: 80,
	grace: 7, // extra seconds before a star can fade, so the first cruisers arrive
	bustedFine: 250,
	wastedFine: 200,
};

export const POI = {
	spawn: [lineC(5.5) + 6, lineC(8) - 8.5],
	dispatch: [lineC(5.5), lineC(8) - 8.5],
	hospital: [lineC(6.5), lineC(6) + 8.5],
	police: [lineC(8.5), lineC(6) - 8.5],
	taxi: { x: lineC(5.5) - 9, z: lineC(8) - 5.7, psi: Math.PI / 2 },
	fare: { pickup: at(3, 8.5), dest: at(9, 4.5) },
	hot: { car: { x: lineC(10) + 5.7, z: lineC(1.5), psi: 0 }, garage: at(2, 9.5) },
	drop: { pickup: at(1, 2.5), dest: at(11, 11.5) },
};

export const MISSIONS = [
	{
		title: 'First Fare',
		reward: 300,
		intro: [
			['Rosa', "Mara, you're up. Plenty of people want a ride and nobody wants to drive. Take the Sunbeam cab parked by the curb."],
			['Rosa', "Pick up my cousin at the marker, drop her at Skyline Tower. Don't bump anything — she tips by the smoothness."],
		],
		outro: ['Rosa', 'Smooth work. Cousin says five stars. Come by the office when you want a real job.'],
	},
	{
		title: 'Hot Wheels',
		reward: 600,
		intro: [
			['Rosa', "A collector in the hills owns a Coral GT he never drives. A client in the harbour wants it. You see where this goes."],
			['Rosa', 'Grab the sports car, bring it to Harbor Garage. The owner is loitering nearby — expect police if he screams.'],
		],
		outro: ['Rosa', "Beautiful. The client's happy and the collector will never know. Probably."],
	},
	{
		title: 'Bay Heat',
		reward: 500,
		intro: [
			['Rosa', 'Bad news, Mara. Someone tipped the harbour police about last night. Three stars worth of attention.'],
			['Rosa', "Lose them. Break line of sight, stay out of view, and don't come back until you're clean."],
		],
		outro: ['Rosa', "Cops are chasing shadows now. Nice driving. You're getting good at this."],
	},
	{
		title: 'The Drop',
		reward: 1200,
		intro: [
			['Rosa', 'Last one for tonight, and it is the big one. A package waits at the old cannery. The Razor Kings consider it theirs.'],
			['Rosa', 'Take it, fight your way out, and run it to Pier 9. Police were told. Everyone was told. Good luck.'],
		],
		outro: ['Rosa', "You did it. The whole bay will hear about this. Take the money — and the sunset. You earned both."],
	},
];

export const PALETTE = {
	buildings: [0xe8d5c4, 0xf2b5a0, 0x9fd3c7, 0xf6e3a1, 0xc8c0e0, 0xd9d9d9, 0xe69f7a, 0x8fb8de, 0xf0e6d2, 0xd08f8f],
	downtown: [0x9db4c8, 0xb8c6d3, 0x7f98ae, 0xc9d2da, 0x8aa0b4, 0xa8b2bc],
	beach: [0xffd1c1, 0xfff0b3, 0xb8ecd9, 0xffc6e0, 0xcfe8ff, 0xffe0a8],
	skin: [0xf1c9a5, 0xd9a07a, 0xb07a52, 0x8a5a3a, 0x5e3b27],
	shirts: [0xe0524a, 0x3f7fd0, 0x4cb06b, 0xf2c230, 0xaa66cc, 0xf08a3a, 0x3cc7c0, 0xeeeeee, 0xd04a8f],
	pants: [0x2c3a55, 0x4a4a52, 0x7a6a4a, 0x1f1f26, 0x3c5a6e],
	hair: [0x1b1410, 0x3a2412, 0x6b4a2a, 0xd8c08a, 0x8a2a1a],
};

export const KEYS = {
	start: 'sunsetbay.save.v1',
};
