'use strict';


  /* ================= sound ================= */
  // Engines are synthesised from the firing frequency (rpm / 60 × cylinders / 2). Each engine type mixes it differently:
  // saw/sub/harm are the oscillator levels, noise the intake hiss, clatter the diesel knock, lope the uneven beat of a
  // V8 at idle, drive how hard the sound is distorted, cut/open the muffler (low-pass) and how far it opens with revs,
  // turbo the whistle, pops the crackle when you lift off at high revs.
  const ENGINE_SOUNDS = {
    i4: { cyl: 4, saw: 0.55, sub: 0.25, harm: 0.12, noise: 0.05, clatter: 0, lope: 0.05, drive: 1.6, cut: 240, open: 2.4, q: 0.9, turbo: 0, pops: 0, vol: 0.85 },
    i5: { cyl: 5, saw: 0.5, sub: 0.35, harm: 0.16, noise: 0.05, clatter: 0, lope: 0.24, lopeRatio: 0.5, drive: 2.2, cut: 260, open: 2.8, q: 1.3, turbo: 0.12, pops: 0, vol: 0.9 },
    i4t: { cyl: 4, saw: 0.55, sub: 0.25, harm: 0.16, noise: 0.07, clatter: 0, lope: 0.04, drive: 2.2, cut: 300, open: 3, q: 1.1, turbo: 0.55, pops: 0.15, vol: 0.9 },
    diesel: { cyl: 4, saw: 0.42, sub: 0.45, harm: 0.08, noise: 0.14, clatter: 0.55, lope: 0.08, drive: 2.6, cut: 190, open: 2.1, q: 0.8, turbo: 0.3, pops: 0, vol: 0.95 },
    bus: { cyl: 6, saw: 0.36, sub: 0.75, harm: 0.05, noise: 0.16, clatter: 0.45, lope: 0.1, drive: 3, cut: 120, open: 1.5, q: 0.7, turbo: 0.45, pops: 0, vol: 1.2 },
    flat6: { cyl: 6, saw: 0.6, sub: 0.3, harm: 0.38, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.08, clatter: 0, lope: 0.12, drive: 4.2, cut: 420, open: 4.6, q: 2.2, turbo: 0.85, pops: 0.6, vol: 1.0 },
    v8: { cyl: 8, saw: 0.6, sub: 0.8, subRatio: 0.25, harm: 0.18, noise: 0.08, clatter: 0, lope: 0.6, lopeRatio: 0.5, drive: 5, cut: 300, open: 3.4, q: 2.6, turbo: 0, pops: 1, vol: 1.15 },
    // electric motor: a clean whine that climbs with speed, no firing pulses at all
    ev: { cyl: 18, saw: 0, sub: 0, harm: 0.5, harmWave: 'sine', harmRatio: 1, noise: 0.05, clatter: 0, lope: 0, drive: 1, cut: 900, open: 1.6, q: 0.6, turbo: 0, pops: 0, vol: 0.55 },
    v10: { cyl: 10, saw: 0.55, sub: 0.2, harm: 0.55, harmWave: 'sawtooth', harmRatio: 2, noise: 0.06, clatter: 0, lope: 0.05, drive: 3.4, cut: 650, open: 6, q: 3, turbo: 0, pops: 0.8, vol: 1.0 },
    // BMW's straight six: smooth and even, a silky rasp at the top with a little turbo whistle
    i6: { cyl: 6, saw: 0.55, sub: 0.3, harm: 0.32, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.06, clatter: 0, lope: 0.03, drive: 2.6, cut: 330, open: 3.8, q: 1.5, turbo: 0.35, pops: 0.25, vol: 0.95 },
    // Ferrari's flat-plane V8: fires evenly like two fours, so no V8 burble, just a hard scream that climbs to 8 000
    v8flat: { cyl: 8, saw: 0.6, sub: 0.28, harm: 0.5, harmWave: 'sawtooth', harmRatio: 2, noise: 0.07, clatter: 0, lope: 0.03, drive: 3.8, cut: 620, open: 5.5, q: 2.8, turbo: 0.45, pops: 0.7, vol: 1.0 },
    // the F40's twin-turbo V8: flat-plane and raw, a loud whistle as the turbos come in, and the wastegates chattering
    // when you lift off on boost
    f40: { cyl: 8, saw: 0.62, sub: 0.3, harm: 0.46, harmWave: 'sawtooth', harmRatio: 2, noise: 0.12, clatter: 0, lope: 0.05, drive: 4.6, cut: 480, open: 4.6, q: 2.4, turbo: 1.7, pops: 0.9, flutter: 1, vol: 1.05 },
    // a 50 cc two-stroke single: fires on every turn, a thin buzzy rasp through the expansion pipe that goes
    // ring-ding-ding at idle, and the variator keeps it screaming while you ride
    // the tank's MTU V12 diesel: a deep rumble, the turbines whining over it and the clatter of the tracks
    tank: { cyl: 12, saw: 0.38, sub: 0.85, harm: 0.1, noise: 0.22, clatter: 0.65, lope: 0.12, drive: 3.4, cut: 170, open: 1.6, q: 0.8, turbo: 0.9, pops: 0, vol: 1.35 },
    // the jet ski's supercharged Rotax triple: a hard, high rasp with the supercharger whining over it
    jetski: { cyl: 3, saw: 0.5, sub: 0.22, harm: 0.42, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.22, clatter: 0, lope: 0.04, drive: 2.8, cut: 520, open: 3.4, q: 1.4, turbo: 1.1, pops: 0, vol: 0.85 },
    // a big V8 outboard: a deep burble through the water at idle that turns into a growl
    outboard: { cyl: 8, saw: 0.5, sub: 0.6, subRatio: 0.25, harm: 0.15, noise: 0.16, clatter: 0, lope: 0.4, lopeRatio: 0.5, drive: 3.2, cut: 240, open: 2.6, q: 1.7, turbo: 0, pops: 0.25, vol: 1.0 },
    twostroke: { cyl: 2, saw: 0.7, sub: 0.12, harm: 0.5, harmWave: 'square', harmRatio: 2, noise: 0.2, clatter: 0, lope: 0.22, lopeRatio: 1, drive: 3.2, cut: 950, open: 2.8, q: 3.8, turbo: 0, pops: 0.35, vol: 0.62 },
    // a V12 without turbos (the Aventador's, the LaFerrari's, the Countach's): smooth, and a high scream at the top
    v12: { cyl: 12, saw: 0.55, sub: 0.2, harm: 0.6, harmWave: 'sawtooth', harmRatio: 2, noise: 0.05, clatter: 0, lope: 0.02, drive: 3.6, cut: 760, open: 6.5, q: 3.2, turbo: 0, pops: 0.6, vol: 1.0 },
    // a V12 with turbos (the Huayra's AMG, the DBS's): deeper, rounder, the turbos hissing over it
    v12t: { cyl: 12, saw: 0.55, sub: 0.35, harm: 0.45, harmWave: 'sawtooth', harmRatio: 2, noise: 0.07, clatter: 0, lope: 0.03, drive: 3.4, cut: 520, open: 5, q: 2.6, turbo: 0.75, pops: 0.6, flutter: 0.4, vol: 1.05 },
    // the Chiron's W16 with four turbos: a deep, heavy roar, and a rush of air and whistles from the turbos
    w16: { cyl: 16, saw: 0.5, sub: 0.55, subRatio: 0.5, harm: 0.3, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.12, clatter: 0, lope: 0.05, drive: 3.2, cut: 380, open: 3.8, q: 1.8, turbo: 1.4, pops: 0.3, flutter: 0.6, vol: 1.1 },
    // the GT-R's V6 with two turbos: a hard, hissing growl
    v6: { cyl: 6, saw: 0.58, sub: 0.3, harm: 0.3, harmWave: 'sawtooth', harmRatio: 1.5, noise: 0.08, clatter: 0, lope: 0.08, drive: 3, cut: 320, open: 3.6, q: 1.6, turbo: 0.9, pops: 0.5, vol: 0.95 }
  };
  const TRAFFIC_VOICES = 3;
  let audio = null, muted = false;
  function shaperCurve(k) {
    const n = 512, c = new Float32Array(n), d = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / d; }
    return c;
  }
  function makeEngineVoice(ctx, dest, noiseBuf) {
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { out.connect(pan); pan.connect(dest); } else out.connect(dest);
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
    const shaper = ctx.createWaveShaper(); shaper.oversample = '2x';
    const mix = ctx.createGain();
    mix.connect(shaper); shaper.connect(filt); filt.connect(out);
    const osc = (type) => { const o = ctx.createOscillator(); o.type = type; o.start(); return o; };
    const gain = (to) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(to); return g; };
    const a = osc('sawtooth'), b = osc('square'), h = osc('triangle');
    const ga = gain(mix), gb = gain(mix), gh = gain(mix);
    a.connect(ga); b.connect(gb); h.connect(gh);
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true; noise.start(0, Math.random() * 1.5);
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 0.9;
    const gn = gain(mix); noise.connect(nf); nf.connect(gn);
    // diesel knock: noise switched on and off by a square wave at the firing frequency
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1900; cf.Q.value = 1.6;
    const gc = gain(mix); noise.connect(cf); cf.connect(gc);
    const knock = osc('square'), gk = ctx.createGain(); gk.gain.value = 0; knock.connect(gk); gk.connect(gc.gain);
    // uneven firing: the whole mix swells and dips at crank speed
    const lope = osc('sine'), gl = ctx.createGain(); gl.gain.value = 0; lope.connect(gl); gl.connect(mix.gain);
    const turbo = osc('sine'), gt = gain(out); turbo.connect(gt);
    return { ctx, out, pan, filt, shaper, mix, a, b, h, ga, gb, gh, nf, gn, gc, gk, knock, lope, gl, turbo, gt, profile: null, P: null, car: null, boost: 0, prevLoad: 0 };
  }
  function setProfile(v, key) {
    if (v.profile === key) return;
    const P = ENGINE_SOUNDS[key], t = v.ctx.currentTime;
    v.profile = key; v.P = P;
    v.h.type = P.harmWave || 'triangle';
    v.shaper.curve = shaperCurve(P.drive);
    v.filt.Q.value = P.q;
    v.ga.gain.setValueAtTime(P.saw, t); v.gb.gain.setValueAtTime(P.sub, t); v.gh.gain.setValueAtTime(P.harm, t); v.gn.gain.setValueAtTime(P.noise, t);
    v.gc.gain.setValueAtTime(P.clatter * 0.5, t); v.gk.gain.setValueAtTime(P.clatter * 0.5, t);
    v.mix.gain.setValueAtTime(1 - P.lope * 0.5, t); v.gl.gain.setValueAtTime(P.lope * 0.5, t);
  }
  function driveVoice(v, c, level, pan, t) {
    const P = v.P, M = c.M, rpm = Math.max(1, c.rpm), T = 0.025;
    const f = (rpm / 60) * (P.cyl / 2), rf = clamp(rpm / M.red, 0, 1.05), load = c.load || 0;
    v.a.frequency.setTargetAtTime(f, t, T);
    v.b.frequency.setTargetAtTime(f * (P.subRatio || 0.5), t, T);
    v.h.frequency.setTargetAtTime(f * (P.harmRatio || 2), t, T);
    v.knock.frequency.setTargetAtTime(f, t, T);
    v.lope.frequency.setTargetAtTime((rpm / 60) * (P.lopeRatio || 0.5), t, T);
    v.nf.frequency.setTargetAtTime(Math.min(8000, f * 4 + 200), t, T);
    v.filt.frequency.setTargetAtTime(Math.min(12000, P.cut + f * P.open * (0.55 + load * 0.6)), t, 0.05);
    v.boost += ((load > 0.5 && rf > 0.35 ? rf : 0) - v.boost) * 0.08;
    v.turbo.frequency.setTargetAtTime(1400 + rpm * 0.9, t, 0.08);
    v.gt.gain.setTargetAtTime(P.turbo * v.boost * 0.02 * level, t, 0.08);
    let g = c.dead ? 0 : P.vol * level * (0.42 + 0.38 * load + 0.25 * rf);
    if (c.limiter && Math.random() < 0.5) g *= 0.2; // stutter against the rev limiter
    v.out.gain.setTargetAtTime(g * 0.12, t, c.limiter ? 0.01 : 0.05);
    if (v.pan) v.pan.pan.setTargetAtTime(pan, t, 0.05);
    // crackle and pops from the exhaust when you lift off at high revs
    if (P.pops && v.prevLoad > 0.6 && load < 0.1 && rf > 0.45 && !c.dead) pops(P.pops * level, pan, rf);
    if (P.flutter && v.prevLoad > 0.6 && load < 0.1 && v.boost > 0.25 && !c.dead) flutter(P.flutter * level, pan);
    v.prevLoad = load;
  }
  function noiseBurst(t, dur, peak, type, freq, q, pan, attack = 0.005) {
    const ctx = audio.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = audio.noise; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(audio.fx); } else g.connect(audio.fx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
    return f;
  }
  function tone(t, type, f0, f1, dur, peak, pan) {
    const ctx = audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(audio.fx); } else g.connect(audio.fx);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function pops(level, pan, rf) {
    if (!audio || muted) return;
    const t0 = audio.ctx.currentTime;
    let t = t0 + 0.04;
    const n = 3 + Math.floor(Math.random() * 5 * rf);
    for (let i = 0; i < n; i++) {
      t += 0.03 + Math.random() * 0.11;
      noiseBurst(t, 0.05 + Math.random() * 0.04, (0.12 + Math.random() * 0.2) * level, 'lowpass', 700 + Math.random() * 900, 1.5, pan, 0.002);
    }
  }
  // a cannon: a crack, a deep boom rolling away, and the thud you feel
  function cannonSound(x, z, size) {
    if (!audio || muted) return;
    const s = placeSound(x, z, 700);
    if (s.level < 0.003) return;
    const t = audio.ctx.currentTime, L = Math.min(1, s.level * size);
    noiseBurst(t, 0.18, 0.6 * L, 'highpass', 1500, 0.5, s.pan, 0.001);
    const f = noiseBurst(t, 1.8, 0.9 * L, 'lowpass', 1200, 0.7, s.pan, 0.004);
    f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(110, t + 1.4);
    tone(t, 'sine', 85, 26, 1.1, 0.9 * L, s.pan);
  }
  // the wastegates chattering as you lift off on boost: a hiss, then a quick flutter
  function flutter(level, pan) {
    if (!audio || muted) return;
    const t0 = audio.ctx.currentTime + 0.02;
    noiseBurst(t0, 0.35, 0.09 * level, 'highpass', 2200, 0.7, pan, 0.01);
    for (let i = 0; i < 6; i++) noiseBurst(t0 + 0.05 + i * 0.045, 0.035, (0.07 - i * 0.008) * level, 'bandpass', 1300 + Math.random() * 500, 1.2, pan, 0.003);
  }
  // where a sound is relative to the camera: left/right pan, and how loud it is with distance
  function placeSound(x, z, range) {
    const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz) || 1;
    const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    return { pan: clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85, level: Math.pow(clamp(1 - d / range, 0, 1), 2), d };
  }
  function initAudio() {
    if (audio) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = muted ? 0 : 1;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      const fx = ctx.createGain(); fx.gain.value = 1; fx.connect(master);
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      audio = { ctx, master, fx, noise, player: null, traffic: [], siren: null, tyre: null };
      audio.player = makeEngineVoice(ctx, master, noise);
      for (let i = 0; i < TRAFFIC_VOICES; i++) audio.traffic.push(makeEngineVoice(ctx, master, noise));
      // tyre screech: narrow band of noise
      {
        const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; src.start();
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 5;
        const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 2300; f2.gain.value = 8;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(f2); f2.connect(g); g.connect(master);
        audio.tyre = { g, f };
        // the water rushing past a boat's hull and the hiss of its spray
        const src2 = ctx.createBufferSource(); src2.buffer = noise; src2.loop = true; src2.start(0, 0.7);
        const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 900; wf.Q.value = 0.5;
        const wg = ctx.createGain(); wg.gain.value = 0;
        src2.connect(wf); wf.connect(wg); wg.connect(master);
        audio.water = { g: wg, f: wf };
      }
      // siren: a square wave whose pitch sweeps (wail) or warbles fast (yelp)
      {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 700; o.start();
        const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 702; o2.start();
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
        const g = ctx.createGain(); g.gain.value = 0;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        o.connect(f); o2.connect(f); f.connect(g);
        if (p) { g.connect(p); p.connect(master); } else g.connect(master);
        audio.siren = { o, o2, g, p, phase: 0 };
      }
      // the helicopter: the thud of the blades (low noise chopped at the blade rate) over the whine of the turbines
      {
        const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; src.start();
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.8;
        const chop = ctx.createGain(); chop.gain.value = 0.35;
        const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 21; lfo.start();
        const lg = ctx.createGain(); lg.gain.value = -0.35; lfo.connect(lg); lg.connect(chop.gain);
        const thump = ctx.createOscillator(); thump.type = 'sine'; thump.frequency.value = 42; thump.start();
        const tg = ctx.createGain(); tg.gain.value = 0.25; thump.connect(tg); tg.connect(chop);
        const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 3150; whine.start();
        const wg = ctx.createGain(); wg.gain.value = 0;
        const g = ctx.createGain(); g.gain.value = 0;
        const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        src.connect(lp); lp.connect(chop); chop.connect(g); whine.connect(wg); wg.connect(g);
        if (p) { g.connect(p); p.connect(master); } else g.connect(master);
        audio.rotor = { g, wg, p };
      }
    } catch { audio = null; }
  }
  function updateAudio(dt) {
    if (!audio) return;
    const t = audio.ctx.currentTime, quiet = paused() || !started;
    // your own car
    const pv = audio.player;
    if (driving && !quiet) {
      setProfile(pv, driving.M.eng);
      driveVoice(pv, driving, 1, 0, t);
      const sp = Math.hypot(driving.vx, driving.vz);
      audio.tyre.g.gain.setTargetAtTime(sp > 2 ? clamp((driving.slip - 2.4) * 0.03, 0, 0.16) : 0, t, 0.05);
      audio.tyre.f.frequency.setTargetAtTime(1000 + Math.min(600, driving.slip * 40), t, 0.1);
      airBrake(driving, 0, 1);
      if (driving.M.boat) { audio.water.g.gain.setTargetAtTime(0.03 + clamp(sp / 22, 0, 1) * 0.22, t, 0.1); audio.water.f.frequency.setTargetAtTime(500 + sp * 90, t, 0.1); audio.tyre.g.gain.setTargetAtTime(0, t, 0.05); }
      else audio.water.g.gain.setTargetAtTime(0, t, 0.1);
    } else {
      pv.out.gain.setTargetAtTime(0, t, 0.08); pv.gt.gain.setTargetAtTime(0, t, 0.08); audio.water.g.gain.setTargetAtTime(0, t, 0.1);
      audio.tyre.g.gain.setTargetAtTime(0, t, 0.05);
    }
    // the nearest few cars in traffic, each with its own engine sound
    const near = [];
    if (!quiet) for (const c of cars) {
      if (c === driving || !c.occupant || c.dead) continue;
      const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
      if (d < 70) near.push({ c, d });
    }
    near.sort((a, b) => a.d - b.d);
    const want = near.slice(0, TRAFFIC_VOICES).map((n) => n.c);
    for (const v of audio.traffic) if (v.car && !want.includes(v.car)) v.car = null;
    for (const c of want) if (!audio.traffic.some((v) => v.car === c)) { const v = audio.traffic.find((x) => !x.car); if (v) v.car = c; }
    for (const v of audio.traffic) {
      if (!v.car) { v.out.gain.setTargetAtTime(0, t, 0.1); v.gt.gain.setTargetAtTime(0, t, 0.1); continue; }
      const s = placeSound(v.car.x, v.car.z, 70);
      setProfile(v, v.car.M.eng);
      driveVoice(v, v.car, s.level * 0.8, s.pan, t);
      airBrake(v.car, s.pan, s.level);
    }
    // the loudest police siren
    let siren = null, sl = 0, sp = 0, yelp = false;
    if (!quiet) for (const c of cars) {
      if (!c.siren) continue;
      const s = placeSound(c.x, c.z, 320);
      if (s.level > sl) { sl = s.level; sp = s.pan; siren = c; yelp = c.yelp; }
    }
    const S = audio.siren;
    if (siren) {
      S.phase += dt * (yelp ? 3.2 : 0.28);
      const k = yelp ? Math.abs(((S.phase % 1) * 2) - 1) : 0.5 - 0.5 * Math.cos(S.phase * TAU);
      const f = 640 + k * (yelp ? 700 : 760);
      S.o.frequency.setTargetAtTime(f, t, 0.01); S.o2.frequency.setTargetAtTime(f * 1.003, t, 0.01);
      S.g.gain.setTargetAtTime(0.045 * sl + (siren === driving ? 0.02 : 0), t, 0.05);
      if (S.p) S.p.pan.setTargetAtTime(sp, t, 0.05);
    } else S.g.gain.setTargetAtTime(0, t, 0.08);
    // the helicopter overhead, heard from far off; your own, when its rotor turns, louder still
    const R = audio.rotor, own = FLY.sound();
    const ownLv = own ? own.rotor * Math.pow(clamp(1 - Math.hypot(own.x - camera.position.x, own.y - camera.position.y, own.z - camera.position.z) / 400, 0, 1), 2) : 0;
    if (ownLv > 0.01 && !quiet) {
      R.g.gain.setTargetAtTime(0.7 * ownLv, t, 0.1); R.wg.gain.setTargetAtTime(0.02 * ownLv, t, 0.1);
      if (R.p) R.p.pan.setTargetAtTime(0, t, 0.1);
    } else if (heli && !quiet) {
      const s = placeSound(heli.x, heli.z, 700), d3 = Math.hypot(s.d, heli.y - camera.position.y), lv = Math.pow(clamp(1 - d3 / 700, 0, 1), 2);
      R.g.gain.setTargetAtTime(0.9 * lv, t, 0.1); R.wg.gain.setTargetAtTime(0.012 * lv, t, 0.1);
      if (R.p) R.p.pan.setTargetAtTime(s.pan * 0.7, t, 0.1);
    } else R.g.gain.setTargetAtTime(0, t, 0.2);
  }
  // buses hiss when the air brakes hold them at a stop
  function airBrake(c, pan, level) {
    const sp = Math.hypot(c.vx, c.vz);
    if (c.M.bus && c.hadBrake && sp < 0.3 && !muted && level > 0.02) noiseBurst(audio.ctx.currentTime, 0.9, 0.12 * level, 'bandpass', 3200, 0.6, pan, 0.02);
    c.hadBrake = c.M.bus && (sp >= 0.3 ? c.braking || c.hadBrake : false);
  }
  function onShift(c, dir) {
    if (!audio || muted) return;
    const t = audio.ctx.currentTime, P = ENGINE_SOUNDS[c.M.eng];
    noiseBurst(t, 0.06, 0.03, 'lowpass', 380, 1, 0); // gearbox clunk
    if (dir > 0 && P.turbo > 0.4 && audio.player.boost > 0.35) noiseBurst(t + 0.02, 0.4, 0.07, 'highpass', 1900, 0.7, 0, 0.02); // blow-off valve
  }
  function crashSound(x, z, speed, glass) {
    if (!audio || muted) return;
    const s = placeSound(x, z, 120);
    if (s.level < 0.01) return;
    const t = audio.ctx.currentTime, k = Math.min(1, speed / 18) * s.level;
    // crunch of metal and plastic, a low thump, and a few panels ringing
    const f = noiseBurst(t, 0.35 + k * 0.3, 0.5 * k, 'lowpass', 3200, 0.8, s.pan, 0.003);
    f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.3);
    tone(t, 'sine', 120, 38, 0.32, 0.5 * k, s.pan);
    for (let i = 0; i < 3 + Math.round(k * 3); i++) {
      const f0 = 180 + Math.random() * 900;
      tone(t + Math.random() * 0.08, 'triangle', f0, f0 * 0.93, 0.25 + Math.random() * 0.35, 0.05 * k, s.pan);
    }
    if (glass) {
      noiseBurst(t + 0.01, 0.5, 0.3 * s.level, 'highpass', 3600, 0.7, s.pan, 0.002);
      for (let i = 0; i < 10; i++) { const f0 = 2600 + Math.random() * 4000; tone(t + 0.02 + Math.random() * 0.45, 'sine', f0, f0, 0.06 + Math.random() * 0.08, 0.04 * s.level, s.pan); }
    }
  }
  function beep(freqs, vol, len, pan = 0) {
    if (!audio || muted) return;
    const t = audio.ctx.currentTime;
    for (const f of freqs) {
      const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.setValueAtTime(vol, t + len - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      if (pan && audio.ctx.createStereoPanner) { const p = audio.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(audio.fx); } else g.connect(audio.fx);
      o.start(t); o.stop(t + len + 0.02);
    }
  }
  // The indicators: c.blink is 1 for left, 2 for right and 3 for the hazard lights. They are lit for 0.4 s of every
  // 0.75 s (80 flashes a minute, starting lit), and in your own car the relay ticks. Like a real stalk, a left or right
  // signal drops back by itself once the car has turned that way and the wheel comes back to the middle
  function updateBlink(c, dt) {
    const bl = c.blink || 0, ind = c.mat.userData.ind;
    let lit = false;
    if (bl) { c.blinkT = (c.blinkT || 0) + dt; lit = c.blinkT % 0.75 < 0.4; } else c.blinkT = 0;
    ind.x = lit && bl & 1 ? IND_GLOW : 0; ind.y = lit && bl & 2 ? IND_GLOW : 0;
    if (c === driving && lit !== !!c.blinkLit) blinkTick(lit);
    c.blinkLit = lit;
    if (c === driving && (bl === 1 || bl === 2)) {
      c.blinkTurn = (c.blinkTurn || 0) + wrapAngle(c.h - (c.blinkH ?? c.h)) * (bl === 1 ? 1 : -1);
      if (c.blinkTurn > 0.5 && Math.abs(c.steer) < 0.08) c.blink = 0;
    }
    c.blinkH = c.h;
  }
  function setBlink(k) {
    const c = driving;
    if (!c || c.M.boat || paused()) return;
    c.blink = c.blink === k ? 0 : k; c.blinkT = 0; c.blinkTurn = 0;
  }
  function blinkTick(on) {
    if (!audio || muted) return;
    const t = audio.ctx.currentTime;
    noiseBurst(t, 0.022, on ? 0.1 : 0.075, 'bandpass', on ? 2900 : 2100, 4, 0, 0.001);
    tone(t, 'square', on ? 1500 : 1150, on ? 900 : 700, 0.018, 0.02, 0);
  }
  function horn() {
    if (!driving) return;
    beep(driving.M.moped ? [740] : driving.M.bus ? [220, 277] : driving.M.sport ? [523, 659] : [392, 494], driving.M.moped ? 0.035 : 0.05, driving.M.moped ? 0.3 : 0.45);
    MP.event('horn');
  }
  function honkAt(x, z) {
    const s = placeSound(x, z, 70);
    if (s.level > 0) beep([415, 523], 0.04 * s.level + 0.003, 0.3, s.pan);
  }
  function toggleMute() {
    muted = !muted;
    el.sound.textContent = muted ? 'Ljud av' : 'Ljud på';
    if (audio) audio.master.gain.setTargetAtTime(muted ? 0 : 1, audio.ctx.currentTime, 0.05);
  }
