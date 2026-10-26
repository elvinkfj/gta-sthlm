'use strict';

  /* ================= input ================= */
  function requestLock() {
    if (isTouch || !canvas.requestPointerLock || paused()) return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* drag-to-look still works */ }
  }
  function look(dx, dy) {
    camYaw -= dx * 0.0032;
    camPitch = clamp(camPitch + dy * 0.0028, -0.4, 1.2);
    lastLook = performance.now();
  }
  function setTouchMode(on) {
    isTouch = on;
    document.body.classList.toggle('touch', on);
    el.touch.hidden = !(on && started);
    lastPrompt = undefined;
    sizeMap();
  }
  // (mood false: ten in the morning in the sun, as the tests want it)
  function startGame(mood) {
    if (started) return;
    started = true;
    el.start.hidden = true;
    document.body.classList.add('playing');
    camYaw = player.rot;
    initAudio();
    setTouchMode(isTouch);
    requestLock();
    // a time and weather of its own each time, not always the morning sun (in a friend's room, theirs come with it)
    if (mood !== false && !(MP.inRoom && !MP.host)) {
      WEATHER.surprise(); DAYNIGHT.surprise();
      const h = DAYNIGHT.hour, clock = String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
      const when = h >= 22 || h < 5 ? ' på natten' : h < 9 ? ' på morgonen' : h >= 18 ? ' på kvällen' : '';
      toast('Klockan är ' + clock + when + (WEATHER.kind === 1 ? '. Det regnar och åskar!' : WEATHER.kind === 2 ? '. Det snöar!' : '.'));
    }
  }
  $('play').addEventListener('click', startGame);
  $('pickerClose').addEventListener('click', () => { closePicker(); requestLock(); });
  $('picker').addEventListener('click', (e) => { if (e.target === $('picker')) closePicker(); });

  const NO_SCROLL = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  function onKey(code, repeat, t) {
    if (bigmap.open) {
      if (code === 'Escape' || code === 'KeyK') closeBigmap();
      return;
    }
    if (pickerOpen) {
      if (code === 'Escape') closePicker();
      else if (code === 'KeyB' && !repeat) pickerB(t);
      const m = /^Digit(\d)$/.exec(code), list = pickerSecret ? SECRET : PICKABLE;
      if (m) { const i = (Number(m[1]) + 9) % 10; if (list[i]) chooseModel(list[i]); }
      return;
    }
    if (!started) { if (code === 'Enter' || code === 'Space') startGame(); return; }
    if (repeat) return;
    // under arrest most keys do nothing: you can still look at the map, the help and the sound, and E moves things on
    if (policeStop && policeStop.locked && !['KeyE', 'Enter', 'KeyH', 'KeyT', 'KeyK', 'KeyQ'].includes(code) && !(policeStop.phase === 'jail' && code === 'Space')) return;
    if (code === 'KeyE' || code === 'Enter') { if (!useKey() && !MP.use() && !STORY.use() && !FLY.use() && !CHUTE.use() && !METRO.use() && !GARAGE.use() && !RIDES.use() && !LIFT.use() && !SPLASH.use() && !VENDORS.use()) toggleCar(); }
    else if (/^(Digit|Numpad)[0-5]$/.test(code)) LIFT.digit(Number(code.slice(-1)));
    else if (code === 'Space') { if (!CHUTE.pull()) jumpQueued = true; }
    else if (code === 'KeyH') el.help.hidden = !el.help.hidden;
    else if (code === 'KeyT') toggleMute();
    else if (code === 'KeyF') { if (!tankFire() && (driving || !SPLASH.toss())) horn(); }
    else if (code === 'KeyR') resetToRoad();
    else if (code === 'KeyB') pickerB(t);
    else if (code === 'KeyM') playerShift(1);
    else if (code === 'KeyN') playerShift(-1);
    else if (code === 'KeyG') toggleGearbox();
    else if (code === 'KeyL') toggleSiren();
    else if (code === 'KeyK') openBigmap();
    else if (code === 'KeyQ') POST.cycle();
    else if (code === 'KeyJ') { if (!STORY.key() && !WORKSHOP.key() && !GARAGE.key() && !PARTY.noJobs()) JOBS.key(); }
    else if (code === 'KeyV') VENDORS.letGo();
    else if (code === 'KeyO') DAYNIGHT.key();
    else if (code === 'KeyU') WEATHER.key();
    else if (code === 'KeyI') PROGRESS.toggle();
    else if (code === 'KeyZ') setBlink(1);
    else if (code === 'KeyX') setBlink(2);
    else if (code === 'KeyC') setBlink(3);
    else if (code === 'KeyP') MP.openPanel();
  }
  window.addEventListener('keydown', (e) => {
    if (ACCOUNT.keydown(e)) return;
    if (STORY.keydown(e)) return;
    if (MP.keydown(e)) return;
    if (METRO.keydown(e)) return;
    if (WORKSHOP.keydown(e)) return;
    if (GARAGE.keydown(e)) return;
    if (JOBS.keydown(e)) return;
    if (PROGRESS.keydown(e)) return;
    if (bigmap.open) { if (e.code === 'Escape' || e.code === 'KeyK') { e.preventDefault(); onKey(e.code, e.repeat); } return; }
    if (pickerOpen) { if (e.code === 'Escape' || e.code === 'KeyB' || /^Digit\d$/.test(e.code)) { e.preventDefault(); onKey(e.code, e.repeat, e.timeStamp); } return; }
    // (P opens the friends' sign and focuses a field in it: the key itself must not type a "p" there)
    if (NO_SCROLL.includes(e.code) || (started && e.code === 'KeyP')) e.preventDefault();
    if (started) keys[e.code] = true;
    onKey(e.code, e.repeat, e.timeStamp);
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  let dragging = false, lastTouchAt = 0;
  canvas.addEventListener('mousedown', (e) => {
    if (!started || paused() || performance.now() - lastTouchAt < 800) return;
    // with the mouse caught in the game, a click throws a water balloon (if you have any)
    if (e.button === 0 && document.pointerLockElement === canvas && SPLASH.toss()) return;
    dragging = true;
    requestLock();
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!started || paused()) return;
    if (document.pointerLockElement === canvas || dragging) look(e.movementX || 0, e.movementY || 0);
  });
  // (a lock asked for just before a board or the big map opened lets go again, or the mouse couldn't reach them)
  document.addEventListener('pointerlockchange', () => {
    const on = document.pointerLockElement === canvas;
    if (on && paused()) document.exitPointerLock();
    document.body.classList.toggle('locked', on);
  });

  let lookId = null, lookX = 0, lookY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    lastTouchAt = performance.now();
    if (!isTouch) setTouchMode(true);
    if (lookId !== null) return;
    lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    look((e.clientX - lookX) * 1.6, (e.clientY - lookY) * 1.6);
    lookX = e.clientX; lookY = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  const stick = $('stick'), knob = $('knob');
  let stickId = null;
  function moveStick(e) {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 12, l = Math.hypot(dx, dy);
    if (l > max) { dx *= max / l; dy *= max / l; }
    joy.x = dx / max; joy.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
  const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  el.btnJump.addEventListener('pointerdown', (e) => { e.preventDefault(); if (CHUTE.pull()) return; touchBrake = true; jumpQueued = true; });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.btnJump.addEventListener(ev, () => { touchBrake = false; });
  el.btnUse.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!useKey() && !MP.use() && !STORY.use() && !FLY.use() && !CHUTE.use() && !METRO.use() && !GARAGE.use() && !RIDES.use() && !LIFT.use() && !SPLASH.use() && !VENDORS.use()) toggleCar(); });
  $('btnCars').addEventListener('pointerdown', (e) => { e.preventDefault(); openPicker(); });
  $('btnThrow').addEventListener('pointerdown', (e) => { e.preventDefault(); SPLASH.toss(); });
  $('btnJob').addEventListener('pointerdown', (e) => { e.preventDefault(); if (!tankFire() && !WORKSHOP.key() && !GARAGE.key() && !PARTY.noJobs()) JOBS.key(); });
  el.btnUp.addEventListener('pointerdown', (e) => { e.preventDefault(); playerShift(1); });
  el.blinkL.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setBlink(1); });
  el.blinkR.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); setBlink(2); });
  el.btnDown.addEventListener('pointerdown', (e) => { e.preventDefault(); playerShift(-1); });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    sizeMap();
    drawBigmap();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { signTex.redraw(); tTex.redraw(); polisTex.redraw(); if (nkSign) nkSign.userData.tex.redraw(); sizeMap(); drawBigmap(); }).catch(() => {});
  }

  // start sign distances from where you stand
  $('dGamla').textContent = fmtKm(Math.hypot(SPAWN.x + 262, SPAWN.z + 606));
  $('dSoder').textContent = fmtKm(Math.hypot(SPAWN.x - 150, SPAWN.z - 1420));
  $('dGloben').textContent = fmtKm(Math.hypot(SPAWN.x - GLOBE.x, SPAWN.z - GLOBE.z));
  buildPicker();
