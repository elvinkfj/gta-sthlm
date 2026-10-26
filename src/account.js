'use strict';

  /* ================= your account ================= */
  // Log in with a name and a password, and what you have (the level, the garage, the tuned cars, the Kassa and the rest:
  // the game's own keys in localStorage, SAVE) is kept on a server and comes back wherever you play. The server is a
  // Firebase project (free) and there is no library: its REST API, with fetch, for logging in (identitytoolkit, with a
  // name turned into an e-mail address in the project's own domain; nobody gets any mail) and for the save (the Realtime
  // Database, saves/<uid>, which only you may read and write: the rules are in README).
  // The save has a number, rev, one higher each time it is sent. A higher one on the server than this browser last had
  // (you played on another computer) is put into localStorage and the page loads again, so every part reads it as it
  // starts. Otherwise what changed here is sent every 20 seconds, and when the page is closed. Until the first look at
  // the server has gone well nothing is sent, so an old save here never covers a newer one there.
  const FIREBASE = {
    // from the Firebase console: Project settings → General → Your apps → firebaseConfig (see README)
    apiKey: '',
    authDomain: '',
    databaseURL: ''
  };
  const ACCOUNT = (() => {
    // (the tests put a pretend server here)
    const CFG = window.GUBBE_FIREBASE || FIREBASE, ready = !!(CFG.apiKey && CFG.authDomain && CFG.databaseURL);
    const SESSION_KEY = 'gubbe-konto', BACKUP_KEY = 'gubbe-konto-forut', HELLO_KEY = 'gubbe-konto-hej', EVERY = 20;
    const SAVE = ['gubbe-niva', 'gubbe-garage', 'gubbe-verkstad', 'gubbe-kassa', 'gubbe-gatlopp', 'gubbe-dalahastar', 'gubbe-kaknas', 'gubbe-dagens', 'gubbe-pasar', 'gubbe-namn', 'gubbe-trojfarg'];
    const ls = {
      get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* a private window */ } },
      del(k) { try { localStorage.removeItem(k); } catch (e) { /* a private window */ } }
    };
    // who is logged in here: { name, uid, refresh, token, exp, rev, hash, at }
    let S = null;
    try { S = JSON.parse(ls.get(SESSION_KEY) || 'null'); } catch (e) { S = null; }
    if (S && !(S.uid && S.refresh)) S = null;
    const keep = () => (S ? ls.set(SESSION_KEY, JSON.stringify(S)) : ls.del(SESSION_KEY));

    /* ---------- the save ---------- */
    const read = () => { const o = {}; for (const k of SAVE) { const v = ls.get(k); if (v !== null) o[k] = v; } return o; };
    // (the level and the day's challenges are saved every few seconds: what they have now first)
    const snapshot = () => { PROGRESS.flush(); DAILY.flush(); return read(); };
    const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

    /* ---------- talking to Firebase ---------- */
    // a name is the same whatever its capitals; letters other than a–z are written as their bytes in hex after "x."
    // (a name can't hold a dot, so no two names give the same address)
    const NAME_OK = /^[\p{L}\p{N}_-]{3,14}$/u;
    function email(name) {
      const n = name.trim().toLowerCase();
      const local = /^[a-z0-9_-]+$/.test(n) ? n : 'x.' + Array.from(new TextEncoder().encode(n), (b) => b.toString(16).padStart(2, '0')).join('');
      return local + '@' + CFG.authDomain;
    }
    async function post(url, body, form) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
        body: form ? new URLSearchParams(body).toString() : JSON.stringify(body)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'HTTP ' + r.status);
      return j;
    }
    const auth = (what, name, pass) => post('https://identitytoolkit.googleapis.com/v1/accounts:' + what + '?key=' + encodeURIComponent(CFG.apiKey), { email: email(name), password: pass, returnSecureToken: true });
    // a token lasts an hour; a new one comes with the refresh token. One the server won't take any more (the account gone,
    // or its password changed) logs you out here, but keeps what you have
    async function token() {
      if (S.token && Date.now() < S.exp) return S.token;
      let j;
      try { j = await post('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(CFG.apiKey), { grant_type: 'refresh_token', refresh_token: S.refresh }, true); }
      catch (e) {
        if (/TOKEN|USER|INVALID/.test(e.message)) { S = null; keep(); render(); say('Du är utloggad. Logga in igen.'); }
        throw e;
      }
      S.token = j.id_token; S.refresh = j.refresh_token; S.exp = Date.now() + (Number(j.expires_in) - 120) * 1000; keep();
      return S.token;
    }
    const where = (tok) => CFG.databaseURL.replace(/\/+$/, '') + '/saves/' + S.uid + '.json?auth=' + encodeURIComponent(tok);
    async function pull() {
      const r = await fetch(where(await token()));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    /* ---------- keeping it in step ---------- */
    let synced = false, busy = false, failed = 0;
    // what to do to localStorage as the page goes, after the others have saved theirs (PROGRESS and DAILY keep what they
    // have in memory when the page closes, and that would cover the save just taken, or bring back what logging out wiped)
    let last = null;
    const reload = (f) => { last = f; f(); location.reload(); };
    // (first, and after logging in) a newer save on the server comes here; then what is here goes up
    async function sync() {
      if (!S) return;
      const cloud = await pull();
      if (cloud && Number(cloud.rev) > (S.rev || 0) && cloud.data) { take(cloud); return; }
      synced = true;
      await save();
    }
    function take(cloud) {
      // (what was here is put aside first, in case)
      ls.set(BACKUP_KEY, JSON.stringify(snapshot()));
      // (the name as it was written when the account was made)
      S.rev = Number(cloud.rev); S.at = Number(cloud.t) || Date.now(); if (typeof cloud.name === 'string' && cloud.name) S.name = cloud.name;
      try { sessionStorage.setItem(HELLO_KEY, S.name); } catch (e) { /* no greeting then */ }
      reload(() => { for (const k of SAVE) { const v = cloud.data[k]; if (typeof v === 'string') ls.set(k, v); else ls.del(k); } S.hash = hash(JSON.stringify(read())); keep(); });
    }
    // sends what is here, if it changed (or always, with force); keepalive: as the page closes, with the token there is
    async function save(force, keepalive) {
      if (!S || !synced || busy) return false;
      const data = snapshot(), h = hash(JSON.stringify(data));
      if (!force && h === S.hash) return true;
      busy = true;
      try {
        const tok = keepalive ? S.token : await token(), rev = (S.rev || 0) + 1, t = Date.now();
        if (!tok) return false;
        const r = await fetch(where(tok), { method: 'PUT', keepalive: !!keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rev, t, name: S.name, data }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        S.rev = rev; S.hash = h; S.at = t; keep(); failed = 0;
        render();
        return true;
      } finally { busy = false; }
    }
    function tryLater(e) {
      // (offline, or the server down: try again next time round, without a word unless it goes on)
      if (++failed === 3) { const t = 'Kunde inte spara på kontot. Kolla att du har internet.'; say(t, true); if (started) toast(t); }
      if (window.console) console.warn('konto:', e && e.message);
    }
    setInterval(() => { if (!S || !ready) return; (synced ? save() : sync()).catch(tryLater); }, EVERY * 1000);
    const bye = () => { if (last) last(); else if (S && synced && Date.now() < S.exp) save(false, true).catch(() => {}); };
    window.addEventListener('pagehide', bye);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bye(); });

    /* ---------- the sign ---------- */
    const E = {
      box: $('account'), close: $('acClose'), off: $('acOff'), form: $('acForm'), name: $('acName'), pass: $('acPass'), login: $('acLogin'),
      make: $('acNew'), inside: $('acIn'), who: $('acWho'), saved: $('acSaved'), save: $('acSave'), out: $('acOut'), msg: $('acMsg'),
      tag: $('acctTag'), tagText: $('acctText'), start: $('playAccount')
    };
    let open = false, waiting = false;
    const say = (t, bad) => { E.msg.textContent = t || ''; E.msg.classList.toggle('bad', !!bad); };
    const clock = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    function render() {
      E.off.hidden = ready; E.form.hidden = !ready || !!S; E.inside.hidden = !S;
      E.tagText.textContent = S ? S.name : 'Logga in';
      E.start.textContent = S ? 'Inloggad: ' + S.name : 'Logga in';
      if (S) {
        E.who.textContent = S.name;
        E.saved.textContent = !synced ? 'Hämtar det du sparat …' : S.at ? 'Senast sparat ' + clock(S.at) + '. Allt sparas av sig självt medan du spelar.' : '';
      }
      for (const b of [E.login, E.make, E.save, E.out]) b.disabled = waiting;
    }
    function openBox() {
      if (open) return;
      if (pickerOpen) closePicker();
      if (bigmap.open) closeBigmap();
      if (MP.panelOpen) MP.closePanel();
      open = true; E.box.hidden = false;
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      for (const k in keys) keys[k] = false;
      joy.x = joy.y = 0;
      say(''); render();
      if (!isTouch && ready && !S) (E.name.value ? E.pass : E.name).focus();
    }
    function closeBox() {
      if (!open) return;
      open = false; E.box.hidden = true; E.pass.value = '';
      if (started) requestLock();
    }
    const WHY = {
      EMAIL_EXISTS: 'Det namnet är redan taget. Välj ett annat, eller logga in om det är ditt.',
      INVALID_LOGIN_CREDENTIALS: 'Fel namn eller lösenord.', EMAIL_NOT_FOUND: 'Fel namn eller lösenord.', INVALID_PASSWORD: 'Fel namn eller lösenord.',
      TOO_MANY_ATTEMPTS_TRY_LATER: 'För många försök. Vänta en stund och försök igen.',
      USER_DISABLED: 'Det här kontot är avstängt.', OPERATION_NOT_ALLOWED: 'Inloggning med lösenord är inte påslagen i Firebase (se README).'
    };
    async function enter(make) {
      const name = E.name.value.trim(), pass = E.pass.value;
      if (!NAME_OK.test(name)) { say('Namnet ska vara 3–14 bokstäver eller siffror, utan mellanslag.', true); return; }
      if (pass.length < 6) { say('Lösenordet måste ha minst 6 tecken.', true); return; }
      waiting = true; say(make ? 'Skapar kontot …' : 'Loggar in …'); render();
      try {
        const j = await auth(make ? 'signUp' : 'signInWithPassword', name, pass);
        S = { name, uid: j.localId, refresh: j.refreshToken, token: j.idToken, exp: Date.now() + (Number(j.expiresIn) - 120) * 1000, rev: 0, hash: 0, at: 0 };
        keep(); synced = false; E.pass.value = '';
        // a new account takes what you have here; an old one brings back its own (and the page loads again)
        await sync();
        say(make ? 'Kontot är skapat. Allt du har sparas nu på det.' : 'Du är inloggad. Det du har här sparas nu på kontot.');
      } catch (e) {
        const code = String(e.message || '').split(/[ :]/)[0];
        say(WHY[code] || (/WEAK_PASSWORD/.test(e.message) ? 'Lösenordet måste ha minst 6 tecken.' : 'Det gick inte (' + (e.message || 'inget svar') + '). Har du internet?'), true);
        if (S && !synced) { S = null; keep(); }
      } finally { waiting = false; render(); }
    }
    async function leave() {
      waiting = true; say('Sparar och loggar ut …'); render();
      try {
        if (synced && !(await save(true))) throw new Error('inte sparat');
      } catch (e) { waiting = false; say('Kunde inte spara, så du är kvar inloggad. Försök igen när du har internet.', true); render(); return; }
      // the next one to play here starts from the beginning
      S = null; keep();
      reload(() => { for (const k of SAVE) ls.del(k); });
    }
    E.form.addEventListener('submit', (e) => { e.preventDefault(); if (!waiting) enter(false); });
    E.make.addEventListener('click', () => { if (!waiting) enter(true); });
    E.save.addEventListener('click', () => {
      waiting = true; render();
      (synced ? save(true) : sync()).then(() => say('Sparat!'), (e) => say('Kunde inte spara (' + e.message + ').', true)).finally(() => { waiting = false; render(); });
    });
    E.out.addEventListener('click', () => { if (!waiting) leave(); });
    E.close.addEventListener('click', closeBox);
    E.box.addEventListener('click', (e) => { if (e.target === E.box) closeBox(); });
    E.tag.addEventListener('click', openBox);
    E.start.addEventListener('click', openBox);
    function keydown(e) {
      if (!open) return false;
      if (e.code === 'Escape') { e.preventDefault(); closeBox(); }
      return true;
    }

    render();
    // (just loaded what you saved somewhere else)
    let hello = null;
    try { hello = sessionStorage.getItem(HELLO_KEY); sessionStorage.removeItem(HELLO_KEY); } catch (e) { /* no greeting */ }
    if (S && hello) toast('Välkommen tillbaka, ' + S.name + '! Allt du sparat på kontot är här.');
    if (S && ready) sync().catch(tryLater).finally(render);

    return {
      keydown, open: openBox, close: closeBox,
      get isOpen() { return open; }, get name() { return S && S.name; }, get ready() { return ready; },
      // for the tests
      debug: { email, snapshot, save, sync, SAVE, get S() { return S; }, get synced() { return synced; } }
    };
  })();
