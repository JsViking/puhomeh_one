// Чиптюн на WebAudio — без звуковых файлов: эффекты + фоновая музыка с секвенсором.
let ctx = null;
let sfxBus, musicBus, musicFilter, pulse25, pulse12, noiseBuf;

const STORAGE_KEY = 'nekomachi.music';
let musicEnabled = true;
try { musicEnabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* приватный режим */ }

export function init() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      sfxBus = ctx.createGain();
      sfxBus.connect(ctx.destination);
      // Музыка: свой регулятор громкости + фильтр (ночью звук становится «глуше»)
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 18000;
      musicBus = ctx.createGain();
      musicBus.gain.value = musicEnabled ? 0.55 : 0;
      musicBus.connect(musicFilter).connect(ctx.destination);
      pulse25 = pulseWave(0.25);
      pulse12 = pulseWave(0.125);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* без звука — не страшно */ }
}

// Прямоугольная волна с заданной скважностью — тот самый звук NES/Game Boy
function pulseWave(duty) {
  const N = 64, real = new Float32Array(N), imag = new Float32Array(N);
  for (let n = 1; n < N; n++) real[n] = (2 * Math.sin(Math.PI * n * duty)) / (Math.PI * n);
  return ctx.createPeriodicWave(real, imag);
}

function note(freq, t, dur, { type = 'square', wave = null, vol = 0.05, slide = 0, dest = sfxBus, release = 0 } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (wave) o.setPeriodicWave(wave); else o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  if (release) {
    // «органный» вариант: держим громкость и быстро гасим в конце
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol * 0.7, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  } else {
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + release + 0.02);
}

function noise(t, dur, { vol = 0.05, type = 'highpass', freq = 7000, dest = musicBus } = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

// ---------- Звуковые эффекты ----------
export function pickup() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [988, 1319, 1568].forEach((f, i) => note(f, t + i * 0.055, 0.09));
}

export function win() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.56], [1047, 0.68]].forEach(([f, dt], i) =>
    note(f, t + dt, i === 5 ? 0.5 : 0.14, { vol: 0.06 }));
  [[262, 0], [330, 0.24], [392, 0.48]].forEach(([f, dt]) => note(f, t + dt, 0.22, { type: 'triangle', vol: 0.08 }));
}

export function meow() {
  if (!ctx) return;
  const t = ctx.currentTime;
  note(620, t, 0.1, { type: 'triangle', vol: 0.12, slide: 880 });
  note(880, t + 0.1, 0.28, { type: 'triangle', vol: 0.1, slide: 460 });
}

export function bark() {
  if (!ctx) return;
  const t = ctx.currentTime;
  note(420, t, 0.07, { wave: pulse25, vol: 0.09, slide: 220 });
  note(460, t + 0.12, 0.08, { wave: pulse25, vol: 0.09, slide: 230 });
}

export function hurt() {
  if (!ctx) return;
  const t = ctx.currentTime;
  note(660, t, 0.25, { type: 'square', vol: 0.06, slide: 180 });
  noise(t, 0.15, { vol: 0.08, type: 'bandpass', freq: 900, dest: sfxBus });
}

export function lose() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [[523, 0], [494, 0.18], [466, 0.36], [440, 0.54]].forEach(([f, dt], i) =>
    note(f, t + dt, i === 3 ? 0.7 : 0.16, { wave: pulse25, vol: 0.06, slide: i === 3 ? 330 : 0 }));
  [[131, 0], [110, 0.54]].forEach(([f, dt], i) => note(f, t + dt, i ? 0.7 : 0.4, { type: 'triangle', vol: 0.1 }));
}

// ---------- Фоновая музыка ----------
// Две песни: обычная (городская) и новогодняя. Запись: такты по 16 шестнадцатых, [нота, длительность].

const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function freq(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  const midi = (Number(m[2]) + 1) * 12 + NOTE_IDX[m[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

// Мажорная пентатоника ре (D E F# A B) — звучит как японская деревенская мелодия.
const TOWN = [
  [['A4', 2], ['D5', 2], ['E5', 2], ['F#5', 2], ['A5', 4], ['F#5', 2], ['E5', 2]],
  [['D5', 2], ['E5', 2], ['F#5', 2], ['E5', 2], ['D5', 4], ['B4', 4]],
  [['A4', 2], ['B4', 2], ['D5', 2], ['E5', 2], ['F#5', 2], ['A5', 2], ['B5', 2], ['A5', 2]],
  [['F#5', 4], ['E5', 2], ['D5', 2], ['E5', 8]],
  [['B5', 2], ['A5', 2], ['F#5', 2], ['A5', 2], ['B5', 4], ['D6', 4]],
  [['B5', 2], ['A5', 2], ['F#5', 2], ['E5', 2], ['F#5', 8]],
  [['D5', 2], ['E5', 2], ['F#5', 2], ['A5', 2], ['F#5', 2], ['E5', 2], ['D5', 2], ['B4', 2]],
  [['A4', 4], ['B4', 2], ['E5', 2], ['D5', 8]],
];
const TOWN_CHORDS = [
  ['D3', 'D4', 'F#4', 'A4'], ['B2', 'B3', 'D4', 'F#4'], ['G2', 'G3', 'B3', 'D4'], ['A2', 'A3', 'C#4', 'E4'],
  ['G2', 'G3', 'B3', 'D4'], ['D3', 'D4', 'F#4', 'A4'], ['E3', 'E4', 'G4', 'B4'], ['A2', 'D4', 'F#4', 'A4'],
];

// «Jingle Bells» (Джеймс Пьерпонт, 1857 — общественное достояние), припев, до мажор.
const JINGLE_A = [['E5', 2], ['E5', 2], ['E5', 4], ['E5', 2], ['E5', 2], ['E5', 4]];
const JINGLE_B = [['E5', 2], ['G5', 2], ['C5', 3], ['D5', 1], ['E5', 8]];
const JINGLE_C = [['F5', 2], ['F5', 2], ['F5', 3], ['F5', 1], ['F5', 2], ['E5', 2], ['E5', 2], ['E5', 1], ['E5', 1]];
const JINGLE = [
  JINGLE_A, JINGLE_B, JINGLE_C,
  [['E5', 2], ['D5', 2], ['D5', 2], ['E5', 2], ['D5', 4], ['G5', 4]],
  JINGLE_A, JINGLE_B, JINGLE_C,
  [['G5', 2], ['G5', 2], ['F5', 2], ['D5', 2], ['C5', 8]],
];
const C_MAJ = ['C3', 'C4', 'E4', 'G4'], F_MAJ = ['F2', 'F3', 'A3', 'C4'], G_MAJ = ['G2', 'G3', 'B3', 'D4'];
const JINGLE_CHORDS = [C_MAJ, C_MAJ, F_MAJ, G_MAJ, C_MAJ, C_MAJ, F_MAJ, C_MAJ];

function compile(melody, chords, bpm, style) {
  const at = new Map();
  melody.forEach((bar, b) => {
    let s = b * 16;
    for (const [n, len] of bar) { at.set(s, [freq(n), len]); s += len; }
  });
  return { at, chords: chords.map((c) => c.map(freq)), steps: 16 * melody.length, step: 60 / bpm / 4, style };
}
const SONGS = {
  standard: compile(TOWN, TOWN_CHORDS, 116, 'town'),
  winter: compile(JINGLE, JINGLE_CHORDS, 132, 'jingle'),
};
let song = SONGS.standard;

let playing = false, step = 0, nextTime = 0, timer = null;

function playStep(s, t) {
  const STEP = song.step;
  const bar = Math.floor(s / 16), i = s % 16;
  const [bass, ...tones] = song.chords[bar];
  const m = song.at.get(s);

  if (song.style === 'jingle') {
    if (m) {
      note(m[0], t, m[1] * STEP * 0.9, { wave: pulse25, vol: 0.05, dest: musicBus, release: 0.05 });
      note(m[0] * 2, t, 0.35, { type: 'triangle', vol: 0.035, dest: musicBus }); // колокольчик на октаву выше
    }
    // бас «ум-па»: тоника на долю, квинта на слабую
    if (i % 4 === 0) note(i % 8 === 0 ? bass : bass * 1.5, t, STEP * 2.5, { type: 'triangle', vol: 0.14, dest: musicBus, release: 0.03 });
    // аккорд на слабые восьмые
    if (i % 4 === 2) tones.forEach((f) => note(f * 2, t, STEP * 1.2, { wave: pulse12, vol: 0.01, dest: musicBus }));
    // бубенцы саней и лёгкий бит
    if (i % 2 === 0) noise(t, 0.06, { vol: i % 4 === 0 ? 0.045 : 0.03, freq: 7500 });
    if (i % 4 === 3) noise(t, 0.035, { vol: 0.02, freq: 9500 });
    if (i === 4 || i === 12) noise(t, 0.09, { vol: 0.045, type: 'bandpass', freq: 2500 });
    if (i === 0 || i === 8) note(140, t, 0.12, { type: 'sine', vol: 0.16, slide: 45, dest: musicBus });
    return;
  }

  if (m) {
    note(m[0], t, m[1] * STEP * 0.9, { wave: pulse25, vol: 0.05, dest: musicBus, release: 0.05 });
    // «эхо» на октаву выше тихо и с задержкой — типичный приём 8-бит композиторов
    note(m[0] * 2, t + STEP * 1.5, m[1] * STEP * 0.5, { wave: pulse12, vol: 0.012, dest: musicBus });
  }
  // бас: восьмые, корень/октава
  if (i % 2 === 0) note(i % 4 === 0 ? bass : bass * 2, t, STEP * 1.6, { type: 'triangle', vol: 0.14, dest: musicBus, release: 0.03 });
  // арпеджио аккорда шестнадцатыми
  note(tones[i % 3] * 2, t, STEP * 0.8, { wave: pulse12, vol: 0.014, dest: musicBus });
  // ударные из шума и синуса
  if (i % 2 === 0) noise(t, 0.03, { vol: 0.025 });
  if (i === 4 || i === 12) noise(t, 0.12, { vol: 0.06, type: 'bandpass', freq: 1800 });
  if (i === 0 || i === 8 || (i === 10 && bar % 2 === 1)) note(150, t, 0.12, { type: 'sine', vol: 0.18, slide: 45, dest: musicBus });
}

function schedule() {
  // Если вкладка была в фоне — не «догоняем» пропущенные шаги пачкой
  if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + 0.15) {
    playStep(step, nextTime);
    nextTime += song.step;
    step = (step + 1) % song.steps;
  }
}

// Переключить песню: 'standard' | 'winter'. Если музыка играет — новая начинается сразу с начала.
export function setSong(name) {
  const next = SONGS[name] ?? SONGS.standard;
  if (next === song) return;
  song = next;
  step = 0;
  if (ctx && playing) nextTime = ctx.currentTime + 0.1;
}

export function startMusic() {
  if (!ctx || playing) return;
  playing = true;
  step = 0;
  nextTime = ctx.currentTime + 0.08;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(musicEnabled ? 0.55 : 0, ctx.currentTime);
  timer = setInterval(schedule, 25);
  schedule();
}

export function stopMusic() {
  if (!playing) return;
  playing = false;
  clearInterval(timer);
}

export const isMusicOn = () => musicEnabled;

export function toggleMusic() {
  musicEnabled = !musicEnabled;
  try { localStorage.setItem(STORAGE_KEY, musicEnabled ? 'on' : 'off'); } catch { /* ignore */ }
  if (ctx) musicBus.gain.setTargetAtTime(musicEnabled ? 0.55 : 0, ctx.currentTime, 0.05);
  return musicEnabled;
}

// Ночью музыка звучит мягче: закрываем фильтр
let lastNight = -1;
export function setNight(n) {
  if (!ctx || Math.abs(n - lastNight) < 0.01) return;
  lastNight = n;
  musicFilter.frequency.setTargetAtTime(18000 * Math.pow(1500 / 18000, n), ctx.currentTime, 0.1);
}
