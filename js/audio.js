// Sound effects. Every sound is synthesized here with the Web Audio API: no
// audio files. Music is out of scope (owner, 2026-11-16).
//
// Driven only from main.js (and the preview page spikes/sounds.html):
//   unlock()              on the Play tap (a user gesture); builds everything
//   update(dt, s, info)   once per frame: the continuous layers follow the rider state
//   event(ev)             things that happen: takeoff, land, break, gate, crash, ...
//   ui(name)              menu clicks
//   setPaused(on)         fades the continuous layers out and ducks the one-shots
//   resume()              when the page comes back from the background
// Game logic never calls this file. Every level, pitch and time is in the
// `audio` group of js/tuning.js.
import { T } from './tuning.js';
import { trickValue } from './tricks.js';

const CATS = { board: 'volBoard', wind: 'volWind', impacts: 'volImpacts', tricks: 'volTricks', meter: 'volMeter', voice: 'volVoice', ui: 'volUi' };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const LOOKAHEAD = 0.15;    // seconds ahead that rhythmic beats (ready pulse, heartbeat, warning) are scheduled
const rnd = (a, b) => a + Math.random() * (b - a);

// Vowel formants (F1, F2, F3 in Hz) for an adult female voice; scaled by voice.brightness.
const VOWELS = {
  a: [850, 1220, 2810], e: [560, 2100, 2900], i: [330, 2650, 3300],
  o: [520, 920, 2700], u: [380, 870, 2650], uh: [700, 1350, 2800], h: [900, 1500, 3000],
};

export function createAudio() {
  let ctx = null, master, duck, analyser, peakBuf;
  const cat = {};
  const buf = {};
  let L = null;                       // continuous layers
  let enabled = true, volume = 1, paused = false;
  const voices = [];                  // one-shots playing now
  const heard = {};                   // events received, by type (for console checks)
  let rider = null;

  // per-run tracking for state-driven sounds
  const trk = {
    air: false, halves: 0, flipHalves: 0, boosting: false, lastBump: -9,
    meter: 'idle', readyAt: 0, readyNext: 0, readyBeat: 0, heartNext: 0, warnNext: 0,
    finishFade: 1, phase: 'menu', quietAir: false,
  };
  const voiceMem = { last: -99, kind: '', variant: '' };

  // ---------------------------------------------------------------- setup
  function ready() { return !!ctx && ctx.state !== 'closed'; }

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC({ latencyHint: 'interactive' });
      build();
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    // iOS: playing a buffer inside the gesture is what really unlocks output
    const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start();
    return true;
  }
  function resume() { if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {}); }

  function build() {
    const sr = ctx.sampleRate;
    const make = (secs, fill) => { const b = ctx.createBuffer(1, Math.floor(sr * secs), sr); fill(b.getChannelData(0), sr); return b; };
    buf.white = make(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    buf.pink = make(2, (d) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    });
    buf.brown = make(2, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    // short impact buffers: a soft snow thud and a sharp crack, each with its own decay baked in
    buf.thud = make(0.5, (d, r) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.06 * (Math.random() * 2 - 1)) / 1.06; d[i] = l * 4 * Math.exp(-i / (r * 0.09)); } });
    buf.crack = make(0.25, (d, r) => { for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (r * 0.018)); });

    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; peakBuf = new Float32Array(analyser.fftSize);
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
    duck = ctx.createGain(); duck.connect(master);
    for (const c of Object.keys(CATS)) { cat[c] = ctx.createGain(); cat[c].connect(c === 'ui' ? master : duck); }
    applyVolumes();

    // ---- continuous layers: all start now at zero gain and run for good
    const t = ctx.currentTime;
    const loop = (name) => { const s = ctx.createBufferSource(); s.buffer = buf[name]; s.loop = true; s.start(t, rnd(0, 1.9)); return s; };
    const gain = (to) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(to); return g; };
    const filter = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    L = {};
    // 1. board: slow band (brown noise, low-passed) and fast band (white, band-passed)
    L.slowSrc = loop('brown'); L.slowF = filter('lowpass', 500); L.slowG = gain(cat.board);
    L.slowSrc.connect(L.slowF).connect(L.slowG);
    L.fastSrc = loop('white'); L.fastF = filter('bandpass', 2600, 0.6); L.fastLo = filter('lowshelf', 300); L.fastLo.gain.value = 6; L.fastG = gain(cat.board);
    L.fastSrc.connect(L.fastF).connect(L.fastLo).connect(L.fastG);
    // 2. carve: harsh resonant scrape, panned
    L.carveSrc = loop('white'); L.carveHP = filter('highpass', 1400); L.carveF = filter('bandpass', 3600, 2.2);
    L.carvePan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; L.carveG = gain(cat.board);
    L.carveSrc.connect(L.carveHP).connect(L.carveF);
    if (L.carvePan) { L.carveF.connect(L.carvePan).connect(L.carveG); } else L.carveF.connect(L.carveG);
    // 3. brake: louder spray with a rough, fluttering edge
    L.brakeSrc = loop('white'); L.brakeF = filter('bandpass', 1700, 0.9); L.brakeG = gain(cat.board);
    L.brakeAM = ctx.createGain(); L.brakeAM.gain.value = 0.7;
    L.brakeLfo = ctx.createOscillator(); L.brakeLfo.frequency.value = 23; const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.3;
    L.brakeLfo.connect(lfoDepth).connect(L.brakeAM.gain); L.brakeLfo.start(t);
    L.brakeSrc.connect(L.brakeF).connect(L.brakeAM).connect(L.brakeG);
    // 5. deep snow: muffled heavy powder
    L.deepSrc = loop('brown'); L.deepF = filter('lowpass', 380, 1.2); L.deepG = gain(cat.board);
    L.deepSrc.connect(L.deepF).connect(L.deepG);
    // 6. wind: pink noise through a slowly wandering band-pass
    L.windSrc = loop('pink'); L.windF = filter('bandpass', 650, 1.1); L.windG = gain(cat.wind);
    L.windLfo = ctx.createOscillator(); L.windLfo.frequency.value = 0.21; const wDepth = ctx.createGain(); wDepth.gain.value = 180;
    L.windLfo.connect(wDepth).connect(L.windF.frequency); L.windLfo.start(t);
    L.windSrc.connect(L.windF).connect(L.windG);
    // 7. jump charge tone
    L.chargeOsc = ctx.createOscillator(); L.chargeOsc.type = 'triangle'; L.chargeOsc.frequency.value = 220;
    L.chargeOsc2 = ctx.createOscillator(); L.chargeOsc2.type = 'sine'; L.chargeOsc2.frequency.value = 440;
    L.chargeG = gain(cat.tricks); L.chargeOsc.connect(L.chargeG); const c2 = ctx.createGain(); c2.gain.value = 0.35; L.chargeOsc2.connect(c2).connect(L.chargeG);
    L.chargeOsc.start(t); L.chargeOsc2.start(t);
  }

  function applyVolumes() {
    if (!ready()) return;
    const A = T.audio, t = ctx.currentTime;
    master.gain.setTargetAtTime(enabled ? A.master * volume : 0, t, 0.03);
    for (const [c, key] of Object.entries(CATS)) cat[c].gain.setTargetAtTime(A[key], t, 0.03);
    duck.gain.setTargetAtTime(paused ? A.pauseDuck : 1, t, paused ? 0.08 : 0.15);
  }

  // ---------------------------------------------------------------- one-shot helpers
  // shot(category, level, seconds, build): build(out, t) wires nodes into `out`
  // and returns the sources to start/stop. At most T.audio.maxVoices play at once.
  function shot(c, level, dur, buildFn, delay = 0) {
    if (!ready() || level <= 0.0005) return null;
    const t = ctx.currentTime + delay + 0.005;
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) { voices[i].out.disconnect(); voices.splice(i, 1); }
    if (voices.length >= T.audio.maxVoices) {
      let q = 0; for (let i = 1; i < voices.length; i++) if (voices[i].level < voices[q].level) q = i;
      if (voices[q].level > level) return null;            // the new one is the quietest: drop it
      kill(voices[q]); voices.splice(q, 1);
    }
    const out = ctx.createGain(); out.gain.value = level; out.connect(cat[c]);
    const srcs = buildFn(out, t) || [];
    for (const s of srcs) { s.start(s._at ?? t, s._offset ?? 0); s.stop(t + dur + 0.05); }
    const v = { out, level, end: t + dur + 0.1, srcs };
    voices.push(v);
    return v;
  }
  function kill(v) {
    const t = ctx.currentTime;
    v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.01);
    for (const s of v.srcs) { try { s.stop(t + 0.06); } catch { /* already stopped */ } }
    setTimeout(() => v.out.disconnect(), 120);
  }
  const noise = (name = 'white', rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf[name]; s.loop = name !== 'thud' && name !== 'crack'; s.playbackRate.value = rate; s._offset = s.loop ? rnd(0, 1.5) : 0; return s; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  // envelope: silent, rise to `peak` over a, fall to silence over d
  function env(t, a, d, peak = 1, to = null) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    if (to) g.connect(to); return g;
  }
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; };
  const at = (src, t) => { src._at = t; return src; };

  // A tone with an envelope. glide: end frequency.
  function tone(out, t, f, a, d, { type = 'sine', peak = 1, glide = null, glideTime = null } = {}) {
    const o = osc(type, f);
    if (glide) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(glide, t + (glideTime ?? a + d)); }
    chain(o, env(t, a, d, peak, out)); return at(o, t);
  }
  // A burst of filtered noise.
  function burst(out, t, name, type, f, q, a, d, { peak = 1, sweep = null, rate = 1 } = {}) {
    const n = noise(name, rate), fl = filt(type, f, q);
    if (sweep) { fl.frequency.setValueAtTime(f, t); for (const [ff, tt] of sweep) fl.frequency.exponentialRampToValueAtTime(ff, t + tt); }
    chain(n, fl, env(t, a, d, peak, out)); return at(n, t);
  }
  // A short knock: a pitched body plus a click. Wood or plastic depending on f and q.
  function knock(out, t, f, d, peak = 1) {
    return [tone(out, t, f, 0.002, d, { type: 'triangle', peak: peak * 0.8, glide: f * 0.92 }), burst(out, t, 'crack', 'bandpass', f * 2.2, 3, 0.001, d * 0.6, { peak })];
  }
  // Metal: inharmonic partials ringing.
  function metal(out, t, f, d, peak = 1) {
    return [1, 1.47, 2.09, 2.76, 3.56].map((k, i) => tone(out, t, f * k, 0.002, d / (1 + i * 0.4), { peak: peak / (1 + i * 0.6) }));
  }
  // A whoosh: noise through a band-pass sweeping up then down.
  function whoosh(out, t, f0, f1, dur, q = 1.2, name = 'white') {
    return burst(out, t, name, 'bandpass', f0, q, dur * 0.45, dur * 0.55, { sweep: [[f1, dur * 0.45], [f0 * 0.8, dur]] });
  }
  // Snow patters: little soft taps scattered over `span` seconds.
  function patter(out, t, n, span, f = 1100, peak = 1) {
    const s = [];
    for (let i = 0; i < n; i++) s.push(burst(out, t + rnd(0.05, span), 'crack', 'bandpass', f * rnd(0.7, 1.4), 2, 0.002, rnd(0.02, 0.05), { peak: peak * rnd(0.4, 1) }));
    return s;
  }
  // A low drum-like boom.
  function boom(out, t, f, d, peak = 1) { return tone(out, t, f, 0.004, d, { peak, glide: f * 0.5, glideTime: d }); }

  // Notes of a short sting / blip.
  function notes(out, t, list, { type = 'square', len = 0.11, gap = 0.08, filter = 3500, peak = 0.5 } = {}) {
    const lp = filt('lowpass', filter); lp.connect(out);
    return list.map((f, i) => tone(lp, t + i * gap, f, 0.005, len, { type, peak }));
  }

  // ---------------------------------------------------------------- voice
  // Formant voice: a buzzy source through three vowel resonances, plus breath.
  function vocal(out, t, v, { pitch, dur, vowels, breath = 0.15, a = 0.02, peak = 1 }) {
    const scale = v.brightness;
    const src = osc('sawtooth', pitch[0] * v.pitch);
    src.frequency.setValueAtTime(pitch[0] * v.pitch, t);
    for (let i = 1; i < pitch.length; i++) src.frequency.linearRampToValueAtTime(pitch[i] * v.pitch, t + dur * i / (pitch.length - 1));
    const vib = osc('sine', 5.5), vibG = ctx.createGain(); vibG.gain.value = v.pitch * 0.025; vib.connect(vibG).connect(src.frequency);
    const air = noise('white');
    const airG = ctx.createGain(); airG.gain.value = breath;
    const srcG = ctx.createGain(); srcG.gain.value = 1 - breath * 0.6;
    const sum = ctx.createGain();
    src.connect(srcG).connect(sum); air.connect(airG).connect(sum);
    const e = env(t, a, dur, peak, out);
    [[0, 6, 1], [1, 9, 0.55], [2, 12, 0.25]].forEach(([k, q, g]) => {
      const f = filt('bandpass', VOWELS[vowels[0]][k] * scale, q);
      f.frequency.setValueAtTime(VOWELS[vowels[0]][k] * scale, t);
      for (let i = 1; i < vowels.length; i++) f.frequency.linearRampToValueAtTime(VOWELS[vowels[i]][k] * scale, t + dur * i / (vowels.length - 1));
      const fg = ctx.createGain(); fg.gain.value = g * 2.2;
      sum.connect(f).connect(fg).connect(e);
    });
    return [at(src, t), at(vib, t), at(air, t)];
  }

  // Each reaction has variants; the one just played is never picked again next.
  const REACTIONS = {
    grunt: {
      hup: (o, t, v) => vocal(o, t, v, { pitch: [0.95, 1.05, 0.85], dur: 0.16, vowels: ['h', 'uh', 'uh'], breath: 0.35 }),
      hah: (o, t, v) => vocal(o, t, v, { pitch: [1.0, 0.8], dur: 0.14, vowels: ['h', 'a'], breath: 0.4 }),
    },
    whoop: {
      woo: (o, t, v) => vocal(o, t, v, { pitch: [1.1, 1.2 * v.lift, 1.55 * v.lift, 1.4 * v.lift], dur: 0.5, vowels: ['u', 'u', 'o', 'u'], breath: 0.08 }),
      wooHoo: (o, t, v) => [
        ...vocal(o, t, v, { pitch: [1.1, 1.35 * v.lift], dur: 0.22, vowels: ['u', 'o'], breath: 0.08 }),
        ...vocal(o, t + 0.24, v, { pitch: [1.5 * v.lift, 1.75 * v.lift, 1.5 * v.lift], dur: 0.36, vowels: ['h', 'u', 'u'], breath: 0.12 })],
      yeah: (o, t, v) => vocal(o, t, v, { pitch: [1.2, 1.5 * v.lift, 1.25], dur: 0.42, vowels: ['i', 'e', 'a', 'a'], breath: 0.1 }),
    },
    oof: {
      oof: (o, t, v) => vocal(o, t, v, { pitch: [1.0, 0.7], dur: 0.2, vowels: ['u', 'u'], breath: 0.45, a: 0.005 }),
      ugh: (o, t, v) => vocal(o, t, v, { pitch: [0.9, 0.95, 0.65], dur: 0.24, vowels: ['uh', 'uh', 'h'], breath: 0.4, a: 0.005 }),
    },
    laugh: {
      haha: (o, t, v) => [0, 1, 2].flatMap((i) => vocal(o, t + i * 0.13, v, { pitch: [1.35 - i * 0.06, 1.2 - i * 0.06], dur: 0.09, vowels: ['h', 'a'], breath: 0.6, a: 0.008, peak: 1 - i * 0.2 })),
      hehe: (o, t, v) => [0, 1].flatMap((i) => vocal(o, t + i * 0.14, v, { pitch: [1.45, 1.3], dur: 0.1, vowels: ['h', 'e'], breath: 0.65, a: 0.008 })),
    },
  };
  // kind: grunt | whoop | oof | laugh. big: always react (adrenaline fire, crash).
  // Returns the variant played, or null if she stayed quiet.
  function react(kind, big = false, force = false) {
    const v = rider?.voice;
    if (!v || !ready()) return null;
    const now = ctx.currentTime;
    if (!force && !big) {
      if (now - voiceMem.last < v.minGap) return null;
      if (kind === voiceMem.kind) return null;              // never the same reaction twice in a row
      if (Math.random() > v.chance) return null;
    }
    const opts = Object.keys(REACTIONS[kind]).filter((k) => `${kind}.${k}` !== voiceMem.variant);
    const pick = opts[Math.floor(Math.random() * opts.length)];
    voiceMem.last = now; voiceMem.kind = kind; voiceMem.variant = `${kind}.${pick}`;
    played[`voice.${kind}`] = (played[`voice.${kind}`] || 0) + 1;
    shot('voice', 0.5, 0.8, (o, t) => REACTIONS[kind][pick](o, t, v));
    return pick;
  }

  // ---------------------------------------------------------------- the sound list
  // Every sound by name. `o` holds options (speed, charge, impact, value, ...).
  // The preview page and summit.audio.test(name) use these directly.
  const A = () => T.audio;
  const S = {
    // 4. boost whoosh
    boost: () => shot('board', A().boostLevel, A().boostTime, (o, t) => [whoosh(o, t, 300, 1400, A().boostTime, 0.9), boom(o, t, 90, 0.2, 0.4)]),
    // 5. edge bump
    edgeBump: () => shot('board', A().edgeBumpLevel, 0.3, (o, t) => [boom(o, t, 75, 0.22), burst(o, t, 'thud', 'lowpass', 500, 0.7, 0.003, 0.2, { peak: 1.2 })]),
    // 8. take-offs
    popKicker: (p = {}) => {
      const c = p.charge ?? 0;
      return shot('impacts', A().clackLevel * (1 + A().popChargedGain * c), 0.35, (o, t) => [
        ...knock(o, t, 520, 0.09), ...knock(o, t + 0.012, 780, 0.06, 0.6),
        burst(o, t, 'white', 'highpass', 2500, 0.7, 0.003, 0.1, { peak: 0.35 }),
        ...(c > 0 ? [boom(o, t, 110, 0.18, 0.4 + 0.6 * c)] : [])]);
    },
    popNatural: (p = {}) => {
      const c = p.charge ?? 0;
      return shot('impacts', A().puffLevel * (1 + A().popChargedGain * c), 0.4, (o, t) => [
        burst(o, t, 'pink', 'lowpass', 1200, 0.8, 0.02, 0.25, { sweep: [[600, 0.25]] }),
        ...(c > 0 ? [boom(o, t, 120, 0.15, 0.3 + 0.6 * c)] : [])]);
    },
    pop: (p = {}) => shot('impacts', A().popLevel * (1 + A().popChargedGain * (p.charge ?? 0)), 0.25, (o, t) => [
      burst(o, t, 'thud', 'lowpass', 900, 0.8, 0.002, 0.14, { peak: 1.4 }), boom(o, t, 140, 0.1, 0.6)]),
    // 9. spin and flip whooshes
    spin: () => shot('tricks', A().spinLevel, 0.28, (o, t) => [whoosh(o, t, 700, 2200, 0.26, 1.4)]),
    flip: () => shot('tricks', A().flipLevel, 0.38, (o, t) => [whoosh(o, t, 220, 750, 0.36, 1.1, 'pink')]),
    // 10. landings
    land: (p = {}) => {
      const k = clamp((p.impact ?? 8) / A().landImpactFull, 0.15, 1.4);
      const sloppy = (p.sloppy ?? 0) > A().landSloppy;
      return shot('impacts', A().landLevel * k, 0.5, (o, t) => [
        boom(o, t, 95, 0.16 + 0.1 * k), burst(o, t, 'thud', 'lowpass', 700, 0.7, 0.002, 0.2, { peak: 1.3 }),
        ...(sloppy
          ? [0, 0.06, 0.13, 0.21].map((d, i) => burst(o, t + d, 'white', 'bandpass', rnd(1500, 2600), 1.6, 0.01, 0.07, { peak: 0.5 - i * 0.08 }))
          : [burst(o, t + 0.01, 'white', 'highpass', 3500, 0.7, 0.002, 0.05, { peak: 0.55 })])]);
    },
    landSloppy: (p = {}) => S.land({ ...p, sloppy: 1 }),
    // 17. adrenaline landing: the normal landing plus a boom and a sparkle
    landAdrenaline: (p = {}) => {
      S.land(p);
      shot('impacts', A().adrBoomLevel, 0.9, (o, t) => [boom(o, t, 62, 0.75), burst(o, t, 'brown', 'lowpass', 220, 1, 0.01, 0.6)]);
      return shot('meter', A().adrSparkleLevel, 0.6, (o, t) => [0, 1, 2, 3, 4, 5].map((i) => tone(o, t + 0.03 + i * 0.05, rnd(2600, 5200), 0.003, 0.18, { peak: 0.6 })));
    },
    // 11. trick landed blip: higher and longer for bigger tricks
    trick: (p = {}) => {
      const value = p.value ?? (p.trick ? trickValue(p.trick) : 200);
      const k = clamp(Math.log(1 + value / 100) / Math.log(1 + A().trickTopValue / 100));
      const n = 2 + Math.round(k * 3), base = A().trickNote * (1 + k * 0.6);
      const steps = [1, 1.26, 1.5, 2, 2.52];
      return shot('tricks', A().trickLevel, 0.15 + n * 0.08, (o, t) => notes(o, t, steps.slice(0, n).map((s) => base * s), { gap: 0.065, len: 0.09 + k * 0.08, peak: 0.45 }));
    },
    // 12. meter charged shimmer
    charged: () => shot('meter', A().chargedLevel, 0.7, (o, t) => {
      const trem = osc('sine', 14), tg = ctx.createGain(); tg.gain.value = 0.5; const out = ctx.createGain(); out.gain.value = 0.5; trem.connect(tg).connect(out.gain); out.connect(o);
      return [at(trem, t), ...[1568, 2093, 2637, 3136].map((f, i) => tone(out, t + i * 0.03, f * rnd(0.997, 1.003), 0.04, 0.5, { peak: 0.45 }))];
    }),
    // 13. adrenaline ready: one pulse beat. quiet: the settled level.
    readyBeat: (p = {}) => shot('meter', A().readyLevel * (p.quiet ? A().readyQuiet : 1), 0.4, (o, t) => [
      tone(o, t, A().readyNote, 0.01, 0.28, { peak: 0.8 }), tone(o, t, A().readyNote * 2, 0.01, 0.16, { peak: 0.25 })], p.delay),
    // 14. adrenaline fired surge
    surge: () => shot('meter', A().surgeLevel, A().surgeTime + 0.2, (o, t) => {
      const d = A().surgeTime, lp = filt('lowpass', 200, 4); lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(5000, t + d * 0.8); lp.connect(o);
      const e = env(t, d * 0.75, d * 0.3, 1, lp);
      const s1 = osc('sawtooth', 110), s2 = osc('sawtooth', 111.5);
      for (const s of [s1, s2]) { s.frequency.setValueAtTime(s.frequency.value, t); s.frequency.exponentialRampToValueAtTime(s.frequency.value * 4, t + d * 0.8); s.connect(e); }
      return [at(s1, t), at(s2, t), whoosh(o, t, 400, 3000, d, 0.8), boom(o, t + d * 0.72, 70, 0.4, 0.8)];
    }),
    // 15. heartbeat: lub-dub
    heartbeat: (p = {}) => shot('meter', A().heartLevel, 0.4, (o, t) => [boom(o, t, 58, 0.12), boom(o, t + 0.15, 52, 0.1, 0.7)], p.delay),
    // 16. running-out warning beep, and the power down
    warn: (p = {}) => shot('meter', A().warnLevel, 0.15, (o, t) => [tone(o, t, p.high ? 1320 : 1100, 0.004, 0.08, { type: 'square', peak: 0.35 })], p.delay),
    powerDown: () => shot('meter', A().powerDownLevel, 1, (o, t) => {
      const lp = filt('lowpass', 3000, 3); lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(150, t + 0.8); lp.connect(o);
      const e = env(t, 0.01, 0.85, 1, lp), s = osc('sawtooth', 520);
      s.frequency.setValueAtTime(520, t); s.frequency.exponentialRampToValueAtTime(70, t + 0.85); s.connect(e);
      return [at(s, t)];
    }),
    // 18. signs
    trailpost: () => shot('impacts', A().signLevel, 0.4, (o, t) => [...knock(o, t, 640, 0.12, 1.2), ...knock(o, t + 0.02, 410, 0.15, 0.8), burst(o, t, 'crack', 'highpass', 1800, 0.7, 0.001, 0.08, { peak: 1.2 })]),
    trailmap: () => shot('impacts', A().signLevel, 0.6, (o, t) => [...knock(o, t, 300, 0.2, 1.2), ...knock(o, t + 0.03, 470, 0.14, 0.9), ...patter(o, t + 0.05, 5, 0.25, 900, 0.6), burst(o, t, 'crack', 'bandpass', 1200, 1, 0.001, 0.15, { peak: 1 })]),
    caution: () => shot('impacts', A().signLevel, 0.9, (o, t) => [...metal(o, t, 610, 0.7, 0.5), burst(o, t, 'crack', 'highpass', 2500, 0.7, 0.001, 0.05, { peak: 1.3 })]),
    // 19. snowmen
    snowmanSmall: () => {
      shot('impacts', A().patterLevel, 0.9, (o, t) => patter(o, t + 0.08, 9, 0.7, 1300));
      return shot('impacts', A().snowmanLevel, 0.5, (o, t) => [boom(o, t, 120, 0.15, 0.6), burst(o, t, 'thud', 'lowpass', 900, 0.8, 0.003, 0.3, { peak: 1.5 }),
        ...[0, 0.03, 0.07].map((d) => burst(o, t + d, 'white', 'bandpass', rnd(900, 1500), 1.5, 0.005, 0.06, { peak: 0.5 }))]);
    },
    snowmanBig: () => {
      shot('impacts', A().patterLevel * 1.3, 1.4, (o, t) => patter(o, t + 0.12, 16, 1.2, 1000));
      return shot('impacts', A().snowmanLevel, 0.9, (o, t) => [boom(o, t, 70, 0.35), burst(o, t, 'thud', 'lowpass', 500, 0.8, 0.006, 0.45, { peak: 1.8, rate: 0.7 }),
        burst(o, t + 0.02, 'pink', 'lowpass', 1500, 0.7, 0.05, 0.5, { peak: 0.5 }),
        ...[0, 0.04, 0.09, 0.15].map((d) => burst(o, t + d, 'white', 'bandpass', rnd(700, 1200), 1.5, 0.005, 0.07, { peak: 0.45 }))]);
    },
    // 20. tree (needs milestone 1)
    tree: () => {
      shot('impacts', A().showerLevel, 1.8, (o, t) => [burst(o, t + 0.1, 'pink', 'lowpass', 2200, 0.6, 0.25, 1.3), ...patter(o, t + 0.15, 14, 1.3, 1000)]);
      return shot('impacts', A().treeLevel, 0.7, (o, t) => [boom(o, t, 60, 0.3), burst(o, t, 'thud', 'lowpass', 350, 0.8, 0.003, 0.35, { peak: 1.6 }),
        ...knock(o, t + 0.04, 260, 0.12, 0.7), ...[0, 0.025, 0.05, 0.09].map((d) => burst(o, t + 0.05 + d, 'crack', 'bandpass', rnd(1800, 3200), 1.5, 0.001, 0.04, { peak: 1.2 }))]);
    },
    // 21. red side fence (needs milestone 1)
    fence: () => shot('impacts', A().fenceLevel, 0.5, (o, t) => [burst(o, t, 'crack', 'bandpass', 1500, 2.5, 0.001, 0.08, { peak: 1.6 }), boom(o, t, 160, 0.08, 0.5),
      ...[1, 2, 3, 4, 5, 6].map((i) => burst(o, t + i * 0.035, 'crack', 'bandpass', 2400 * rnd(0.9, 1.1), 4, 0.001, 0.03, { peak: 0.9 * Math.exp(-i * 0.35) }))]),
    // 22. crash tumble and respawn (needs milestone 1)
    tumble: () => {
      let last = null;
      for (let i = 0; i < A().tumbleThuds; i++) {
        last = shot('impacts', A().tumbleLevel * (1 - i * 0.15), 0.35, (o, t) => [boom(o, t, rnd(80, 110), 0.12, 0.7), burst(o, t, 'thud', 'lowpass', rnd(500, 800), 0.8, 0.003, 0.18, { peak: 1.3 }),
          burst(o, t, 'pink', 'bandpass', 1400, 1, 0.01, 0.12, { peak: 0.4 })], i * A().tumbleGap * rnd(0.85, 1.15));
      }
      return last;
    },
    respawn: () => shot('impacts', A().respawnLevel, 0.5, (o, t) => [boom(o, t, 100, 0.3, 0.8), burst(o, t, 'brown', 'lowpass', 400, 0.8, 0.04, 0.3)]),
    // 23. countdown
    count: () => shot('ui', A().countLevel, 0.2, (o, t) => [tone(o, t, A().countNote, 0.004, 0.14, { type: 'square', peak: 0.35 }), tone(o, t, A().countNote * 2, 0.004, 0.08, { peak: 0.2 })]),
    go: () => shot('ui', A().countLevel, 0.5, (o, t) => [tone(o, t, A().goNote, 0.004, 0.4, { type: 'square', peak: 0.3 }), tone(o, t, A().goNote / 2, 0.004, 0.4, { type: 'triangle', peak: 0.5 })]),
    // 24. start gate release
    start: () => shot('impacts', A().startLevel, 0.6, (o, t) => [...metal(o, t, 380, 0.25, 0.4), ...knock(o, t, 220, 0.1, 1), whoosh(o, t + 0.05, 300, 1600, 0.5, 0.9)]),
    // 25. gates
    gate: () => shot('ui', A().gateLevel, 0.15, (o, t) => [tone(o, t, 2093, 0.002, 0.06, { peak: 0.6 }), tone(o, t + 0.035, 3136, 0.002, 0.06, { peak: 0.45 })]),
    gateMiss: () => shot('ui', A().gateMissLevel, 0.35, (o, t) => {
      const lp = filt('lowpass', 900); lp.connect(o);
      return [tone(lp, t, 98, 0.01, 0.28, { type: 'sawtooth', peak: 0.8 }), tone(lp, t, 103, 0.01, 0.28, { type: 'square', peak: 0.5 })];
    }),
    // 26. finish horn and chime
    finish: () => shot('ui', A().finishLevel, 1.4, (o, t) => {
      const lp = filt('lowpass', 2400); lp.connect(o);
      return [...[523, 659, 784].map((f) => tone(lp, t, f, 0.03, 0.55, { type: 'sawtooth', peak: 0.28 })),
        ...[1047, 1319, 1568, 2093].map((f, i) => tone(o, t + 0.25 + i * 0.07, f, 0.003, 0.8, { peak: 0.3 }))];
    }),
    // 27. result stings
    stingGold: () => shot('ui', A().stingLevel, 1.3, (o, t) => [...notes(o, t, [784, 988, 1175, 1568], { gap: 0.11, len: 0.16, peak: 0.4 }), ...[1568, 1976, 2349].map((f) => tone(o, t + 0.45, f, 0.005, 0.8, { peak: 0.25 }))]),
    stingSilver: () => shot('ui', A().stingLevel, 1, (o, t) => [...notes(o, t, [659, 784, 988, 1319], { gap: 0.12, len: 0.15, peak: 0.38, filter: 2600 }), tone(o, t + 0.48, 1319, 0.005, 0.5, { peak: 0.25 })]),
    stingBronze: () => shot('ui', A().stingLevel, 0.9, (o, t) => [...notes(o, t, [523, 659, 784], { gap: 0.13, len: 0.16, peak: 0.36, filter: 2000, type: 'triangle' }), tone(o, t + 0.39, 784, 0.005, 0.4, { type: 'triangle', peak: 0.3 })]),
    stingBest: () => shot('ui', A().stingLevel, 1.3, (o, t) => [...notes(o, t, [1047, 1319, 1568, 2093, 2637], { gap: 0.06, len: 0.1, peak: 0.35 }),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => tone(o, t + 0.3 + i * 0.06, rnd(3000, 6000), 0.003, 0.25, { peak: 0.2 }))]),
    stingNone: () => shot('ui', A().stingLevel * 0.8, 0.6, (o, t) => notes(o, t, [523, 659], { gap: 0.12, len: 0.15, peak: 0.32, type: 'triangle', filter: 2000 })),
    // 29. menus
    click: () => shot('ui', A().clickLevel, 0.06, (o, t) => [tone(o, t, 1500, 0.001, 0.03, { peak: 0.5 }), burst(o, t, 'crack', 'bandpass', 3000, 1.5, 0.001, 0.015, { peak: 0.5 })]),
    back: () => shot('ui', A().backLevel, 0.1, (o, t) => [tone(o, t, 1000, 0.001, 0.06, { peak: 0.5, glide: 650 }), burst(o, t, 'crack', 'bandpass', 2000, 1.5, 0.001, 0.015, { peak: 0.4 })]),
    // 28. voice (always plays; react() applies the chattiness rules)
    'voice.grunt': () => react('grunt', false, true),
    'voice.whoop': () => react('whoop', false, true),
    'voice.oof': () => react('oof', false, true),
    'voice.laugh': () => react('laugh', false, true),
  };
  const VOICE_TESTS = new Set(['voice.grunt', 'voice.whoop', 'voice.oof', 'voice.laugh']);   // counted inside react()

  // count every sound played, by name (summit.audio.played, for console checks)
  const played = {};
  for (const [name, fn] of Object.entries(S)) if (!VOICE_TESTS.has(name)) S[name] = (p) => { played[name] = (played[name] || 0) + 1; return fn(p); };

  // ---------------------------------------------------------------- events from main.js
  function event(ev) {
    heard[ev.type] = (heard[ev.type] || 0) + 1;
    if (!ready()) return;
    const A = T.audio;
    switch (ev.type) {
      case 'takeoff': {
        // ev.charge: 0..1 if she popped; ev.surface: 'kicker' (man-made) or 'snow' (roller, ledge)
        const charge = ev.popped ? (ev.charge ?? 0) : 0;
        trk.quietAir = false;
        if (ev.surface === 'kicker') S.popKicker({ charge }); else if (ev.popped) S.pop({ charge });
        else trk.quietAir = true;           // natural lift-off: the puff waits until it is a real jump (update())
        if (ev.popped && charge >= A.voiceBigPop) react('grunt');
        break;
      }
      case 'land': {
        // a tiny unpopped hop (bumps, the deep-snow edge) makes no take-off or landing sound
        if (trk.quietAir && (ev.trick?.airTime ?? 1) < A.minAir) { trk.quietAir = false; break; }
        trk.quietAir = false;
        const p = { impact: ev.impact, sloppy: ev.sloppy ?? 0 };
        if (trk.meter === 'adrenaline') S.landAdrenaline(p); else S.land(p);
        const value = ev.value ?? (ev.trick ? trickValue(ev.trick) : 0);
        if (ev.trick?.name) S.trick({ value });
        if (value >= A.voiceBigTrick) react('whoop');
        break;
      }
      case 'break': {
        const kind = ev.item?.type;
        if (kind === 'snowman-small') S.snowmanSmall(); else if (kind === 'snowman-big') S.snowmanBig();
        else if (kind === 'trailmap') S.trailmap(); else if (kind === 'caution') S.caution(); else S.trailpost();
        if (kind?.startsWith('snowman')) react('laugh');
        break;
      }
      case 'gate': (ev.passed ? S.gate : S.gateMiss)(); break;
      case 'crash': {
        // ev.obstacle: 'tree' | 'fence' | 'sign' | 'rock' | ... (milestone 1)
        if (ev.obstacle === 'tree') S.tree(); else if (ev.obstacle === 'fence') S.fence(); else if (ev.obstacle === 'sign') S.trailpost();
        else shot('impacts', A.treeLevel * 0.8, 0.4, (o, t) => [boom(o, t, 80, 0.2), ...knock(o, t, 340, 0.1, 0.8)]);
        S.tumble(); react('oof', true);
        break;
      }
      case 'respawn': S.respawn(); break;
      case 'count': (ev.n > 0 ? S.count : S.go)(); break;      // ev.n: 3, 2, 1, then 0 for "go"
      case 'start': S.start(); break;
      case 'finish': S.finish(); break;
      case 'results': {
        // ev.medal: 'gold' | 'silver' | 'bronze' | null; ev.newBest
        const sting = { gold: S.stingGold, silver: S.stingSilver, bronze: S.stingBronze }[ev.medal] || S.stingNone;
        sting(); if (ev.newBest) setTimeout(() => S.stingBest(), 900);
        break;
      }
      case 'adrenaline': react('whoop', true); break;          // fired; the surge itself comes from the meter state in update()
      default: break;
    }
  }

  function ui(name) { heard['ui.' + name] = (heard['ui.' + name] || 0) + 1; if (ready()) (name === 'back' ? S.back : S.click)(); }

  // ---------------------------------------------------------------- per-frame state
  // s: the rider state. info: { phase, height (metres above the snow), meter (state name), adrenalineLeft }.
  function update(dt, s, info = {}) {
    if (!ready() || !L) return;
    const A = T.audio, t = ctx.currentTime;
    applyVolumes();

    if (info.phase !== trk.phase) {
      if (info.phase === 'finished') trk.finishFade = 1;
      if (info.phase === 'riding' && trk.phase === 'countdown') trk.finishFade = 1;
      trk.phase = info.phase;
    }
    if (info.phase === 'finished') trk.finishFade = Math.max(0, trk.finishFade - dt / T.race.finishCoast);
    const on = (info.phase === 'riding' || info.phase === 'finished') && !paused ? trk.finishFade : 0;
    const ground = s.air ? 0 : 1;
    const speed = s.speed;
    const adr = info.meter === 'adrenaline';

    // 1. board: two bands crossfaded at boardSplit
    const k = clamp((speed - A.boardSplit) / A.boardBlend + 0.5);
    const deepK = clamp(s.out / 2);
    const deepMul = 1 - deepK * (1 - A.deepBoardCut);
    const slowLvl = A.boardSlowLevel * clamp(0.35 + 0.65 * speed / A.boardSplit, 0, 1.1);
    const fastLvl = A.boardFastLevel * (1 + 0.4 * clamp((speed - A.boardSplit) / (A.boardTop - A.boardSplit)));
    const bright = adr ? A.boardAdrBright : 1;
    set(L.slowG.gain, on * ground * (1 - k) * slowLvl * deepMul);
    set(L.fastG.gain, on * ground * k * fastLvl * deepMul);
    set(L.slowF.frequency, A.boardSlowCutoff * (0.7 + 0.3 * clamp(speed / A.boardSplit)) * bright);
    set(L.fastF.frequency, A.boardFastCutoff * (0.85 + 0.45 * clamp((speed - A.boardSplit) / (A.boardTop - A.boardSplit))) * bright);
    const rate = adr ? A.boardAdrRate : 1;
    set(L.slowSrc.playbackRate, rate); set(L.fastSrc.playbackRate, rate);

    // 2. carve
    const lock = clamp(Math.abs(s.heading) / T.ride.maxHeading);
    set(L.carveG.gain, on * ground * lock ** 1.5 * clamp((speed - A.carveMinSpeed) / 6, 0.1) * A.carveLevel * deepMul);
    set(L.carveF.frequency, A.carveFreq * (0.85 + 0.3 * lock)); L.carveF.Q.value = A.carveQ;
    if (L.carvePan) set(L.carvePan.pan, Math.sign(s.heading) * A.carvePan * lock);

    // 3. brake
    set(L.brakeG.gain, on * ground * (s.braking ? 1 : 0) * A.brakeLevel * clamp(0.3 + speed / 25, 0, 1.2));
    set(L.brakeF.frequency, A.brakeFreq);

    // 4. boost: a whoosh on each start
    if (s.boosting && !trk.boosting && on && ground) S.boost();
    trk.boosting = s.boosting;

    // 5. deep snow and the edge bump
    set(L.deepG.gain, on * ground * deepK * A.deepLevel * clamp(0.3 + speed / 20));
    set(L.deepF.frequency, A.deepCutoff);
    if (on && s.out > T.ride.edgeWidth && t - trk.lastBump > A.edgeBumpGap) { S.edgeBump(); trk.lastBump = t; }

    // 6. wind
    const height = info.height ?? 0;
    const airExtra = s.air ? Math.min(A.windAirMax, height * A.windPerMetre + s.airTime * A.windPerSecond) : 0;
    set(L.windG.gain, on * (A.windLevel * clamp((speed - A.windMinSpeed) / (A.windTop - A.windMinSpeed)) + airExtra));
    L.windF.frequency.value = A.windFreq * (1 + 0.5 * airExtra);

    // 7. jump charge tone
    const f = A.chargeLow * (A.chargeHigh / A.chargeLow) ** clamp(s.charge);
    set(L.chargeG.gain, on && s.charging ? A.chargeLevel * (0.4 + 0.6 * s.charge) : 0, 0.02);
    set(L.chargeOsc.frequency, f, 0.01); set(L.chargeOsc2.frequency, f * 2, 0.01);

    // 8. a natural lift-off gets its puff once it has lasted long enough to be a jump
    if (s.air && trk.quietAir === true && s.airTime >= A.minAir) { S.popNatural({ charge: 0 }); trk.quietAir = 'puffed'; }

    // 9. spin and flip whooshes, counted from the rider state
    if (s.air && !trk.air) { trk.halves = 0; trk.flipHalves = 0; }
    trk.air = s.air;
    if (s.air && !paused) {
      const halves = Math.floor(Math.abs(s.spin) / Math.PI);
      if (halves > trk.halves) { S.spin(); trk.halves = halves; }
      const flips = Math.floor(Math.abs(s.flip) / (Math.PI * 2) + 0.5);  // whoosh as she goes upside down
      if (flips > trk.flipHalves) { S.flip(); trk.flipHalves = flips; }
    }

    // 12-16. meter and adrenaline, from the meter state
    const m = info.meter ?? 'idle';
    if (m !== trk.meter) {
      if (m === 'charged' && trk.meter === 'idle') S.charged();
      if (m === 'full') { trk.readyAt = t; trk.readyNext = t; trk.readyBeat = 0; }
      if (m === 'adrenaline') { S.surge(); trk.heartNext = t + A.surgeTime * 0.8; trk.warnNext = 0; }
      if (m !== 'adrenaline') trk.warnNext = 0;
      if (trk.meter === 'adrenaline' && m !== 'adrenaline') S.powerDown();
      trk.meter = m;
    }
    // Beats are scheduled a little ahead on the audio clock, so they keep exact
    // time whatever the frame rate does.
    const ahead = t + LOOKAHEAD;
    if (!paused && on) {
      if (m === 'full') {
        while (trk.readyNext <= ahead) {
          S.readyBeat({ quiet: trk.readyBeat >= A.readyBeats, delay: Math.max(0, trk.readyNext - t) });
          trk.readyBeat++; trk.readyNext += T.meter.readyBeat;
        }
      }
      if (m === 'adrenaline') {
        while (trk.heartNext <= ahead) { S.heartbeat({ delay: Math.max(0, trk.heartNext - t) }); trk.heartNext += A.heartGap; }
        const left = info.adrenalineLeft ?? 9;
        if (left <= A.warnTime) {
          if (!trk.warnNext) trk.warnNext = t;
          const end = t + left;
          while (trk.warnNext <= ahead && trk.warnNext < end) {
            const leftThen = end - trk.warnNext;
            S.warn({ high: leftThen < A.warnTime / 2, delay: Math.max(0, trk.warnNext - t) });
            trk.warnNext += A.warnGap * (leftThen < A.warnTime / 2 ? 0.6 : 1);
          }
        }
      }
    } else {
      // paused or not riding: pick the beats up again from now
      trk.readyNext = Math.max(trk.readyNext, t); trk.heartNext = Math.max(trk.heartNext, t); if (trk.warnNext) trk.warnNext = Math.max(trk.warnNext, t);
    }
  }
  function set(param, v, tc) {
    param.setTargetAtTime(v, ctx.currentTime, tc ?? (paused ? T.audio.fadeTime / 3 : 0.05));
  }

  // ---------------------------------------------------------------- controls
  function setPaused(on) {
    paused = on;
    if (!ready()) return;
    applyVolumes();
    if (on && L) for (const g of [L.slowG, L.fastG, L.carveG, L.brakeG, L.deepG, L.windG, L.chargeG]) {
      g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime, T.audio.fadeTime / 3);
    }
  }
  function resetRun() {
    Object.assign(trk, { air: false, halves: 0, flipHalves: 0, boosting: false, lastBump: -9, meter: 'idle', readyBeat: 0, finishFade: 1, quietAir: false });
  }
  function peak() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(peakBuf);
    let p = 0; for (let i = 0; i < peakBuf.length; i++) p = Math.max(p, Math.abs(peakBuf[i]));
    return p;
  }
  function test(name, opts) {
    if (!S[name]) return `unknown sound "${name}". Try one of: ${Object.keys(S).join(', ')}`;
    unlock(); return S[name](opts) ? name : `${name} (silent: dropped, or level is 0)`;
  }

  return {
    unlock, resume, update, event, ui, react, setPaused, resetRun, peak, test,
    get ctx() { return ctx; },
    get names() { return Object.keys(S); },
    get heard() { return { ...heard }; },
    get played() { return { ...played }; },
    get playing() { return voices.filter((v) => v.end > (ctx?.currentTime ?? 0)).length; },
    setRider(r) { rider = r; },
    setEnabled(on) { enabled = on; applyVolumes(); },
    setVolume(v) { volume = clamp(v); applyVolumes(); },
  };
}
