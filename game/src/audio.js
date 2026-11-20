// All sound is synthesised with WebAudio at runtime: no audio files. An engine hum that follows the
// driven car's speed, a two-tone siren that follows the nearest police car, gunshots and thumps
// from filtered noise, pickup blips, UI ticks and a small looping chord-and-arpeggio tune.

let ctx = null;
let master = null;
let musicGain = null;
let noiseBuf = null;
let engine = null;
let siren = null;
let muted = false;
let musicTimer = null;
let nextBeat = 0;
let beatIndex = 0;

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export function initAudio() {
  if (ctx) {
    ctx.resume?.();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(comp).connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.16;
  musicGain.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;

  // Engine: a saw and a square an octave down through a low-pass.
  const eg = ctx.createGain();
  eg.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  const o2 = ctx.createOscillator();
  o2.type = 'square';
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(eg).connect(master);
  o1.start();
  o2.start();
  engine = { o1, o2, eg, lp };

  // Siren: a triangle swept by a slow LFO.
  const sg = ctx.createGain();
  sg.gain.value = 0;
  const so = ctx.createOscillator();
  so.type = 'triangle';
  so.frequency.value = 800;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1.3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 200;
  lfo.connect(lfoGain).connect(so.frequency);
  so.connect(sg).connect(master);
  so.start();
  lfo.start();
  siren = { sg };

  startMusic();
}

function tone(type, freq, t0, dur, vol, dest, attack = 0.01) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(t0, dur, vol, freq, q, type = 'bandpass', dest = master) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t0);
  s.stop(t0 + dur + 0.05);
}

export function sfxClick() {
  if (!ctx) return;
  tone('square', 880, ctx.currentTime, 0.05, 0.12, master);
}

export function sfxPickup() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone('square', 880, t, 0.09, 0.16, master);
  tone('square', 1320, t + 0.08, 0.14, 0.16, master);
}

export function sfxShot(volume = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.2, 0.55 * volume, 1800, 0.7);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  g.gain.setValueAtTime(0.5 * volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.2);
}

export function sfxPunch() {
  if (!ctx) return;
  noise(ctx.currentTime, 0.1, 0.4, 300, 1.2);
}

export function sfxCrash(strength = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.35, Math.min(0.7, 0.2 * strength), 500, 0.5);
  tone('sawtooth', 90, t, 0.25, Math.min(0.4, 0.12 * strength), master);
}

export function sfxBang() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 1.1, 0.8, 220, 0.4, 'lowpass');
  tone('sine', 60, t, 0.8, 0.5, master);
}

export function sfxJingle(good) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = good ? [60, 64, 67, 72] : [64, 60, 55, 48];
  notes.forEach((n, i) => tone('triangle', mtof(n), t + i * 0.13, 0.4, 0.22, master));
}

/** speed01 0..1; volume 0..1 (0 when not driving). */
export function setEngine(speed01, volume) {
  if (!ctx || !engine) return;
  const f = 38 + speed01 * 120;
  const t = ctx.currentTime;
  engine.o1.frequency.setTargetAtTime(f, t, 0.05);
  engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  engine.lp.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.08);
  engine.eg.gain.setTargetAtTime(volume * (0.08 + speed01 * 0.1), t, 0.1);
}

export function setSiren(volume) {
  if (!ctx || !siren) return;
  siren.sg.gain.setTargetAtTime(volume * 0.1, ctx.currentTime, 0.2);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.55;
  return muted;
}

// ------------------------------------------------------------- music
const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [48, 52, 55, 59], // Cmaj7
  [55, 59, 62, 65], // G7
];
const ARP = [0, 2, 3, 2, 1, 3, 2, 1];

function startMusic() {
  nextBeat = ctx.currentTime + 0.2;
  beatIndex = 0;
  const beat = 60 / 96 / 2; // eighth notes
  musicTimer = setInterval(() => {
    while (nextBeat < ctx.currentTime + 0.4) {
      const step = beatIndex % 32;
      const chord = CHORDS[Math.floor(step / 8)];
      const inBar = step % 8;
      if (inBar === 0) {
        for (const n of chord) tone('triangle', mtof(n), nextBeat, beat * 7.5, 0.1, musicGain, 0.4);
        tone('sine', mtof(chord[0] - 12), nextBeat, beat * 3.6, 0.5, musicGain, 0.02);
      }
      if (inBar === 4) tone('sine', mtof(chord[0] - 12), nextBeat, beat * 3, 0.4, musicGain, 0.02);
      tone('square', mtof(chord[ARP[inBar]] + 12), nextBeat, beat * 0.9, 0.05, musicGain, 0.005);
      if (inBar % 2 === 1) noise(nextBeat, 0.05, 0.05, 7000, 1, 'highpass', musicGain);
      beatIndex += 1;
      nextBeat += beat;
    }
  }, 120);
}

export function stopMusic() {
  clearInterval(musicTimer);
}
