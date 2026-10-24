'use strict';

  /* ================= playing with friends ================= */
  // Up to eight players in the same Stockholm. One of you opens a room and gets a code of four letters; the others type
  // the code in (or open the link with it) and join. The browsers talk straight to each other over WebRTC, with PeerJS's
  // free server only there to introduce them, and the one who opened the room passes everything on to the rest. Each of
  // you keeps your own traffic, police and Dalahästar. What goes between you is where you are and what you drive, and how:
  // its lamps, blinkers, siren, dents and the tank's gun. The horn and the chat go too, and you can ride along in a
  // friend's car. The others are shown a moment (DELAY) behind, smoothly in between the updates that come 15 times a second.
  const MP = (() => {
    const PROTO = 1, MAX = 8, SEND_MS = 66, DELAY = 140, PREFIX = 'gubbe-pa-vagen-', ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const PEER_SRC = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
    const COLORS = [0x2f6fdb, 0xc8102e, 0x2e8b57, 0xf2b705, 0x6a3d9a, 0xe46f2a, 0x1f9aa8, 0xb03a74, 0xe8e8e8, 0x222428];
    const COLOR_NAMES = ['Blå', 'Röd', 'Grön', 'Gul', 'Lila', 'Orange', 'Turkos', 'Rosa', 'Vit', 'Svart'];
    const store = {
      get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch { /* a private window: forgotten next time */ } }
    };
    const params = new URLSearchParams(location.search);
    const E = {
      panel: $('mp'), setup: $('mpSetup'), room: $('mpRoom'), name: $('mpName'), colors: $('mpColors'), code: $('mpCode'), host: $('mpHost'), join: $('mpJoin'),
      codeBig: $('mpCodeBig'), codeHint: $('mpCodeHint'), share: $('mpShare'), copy: $('mpCopy'), list: $('mpList'), play: $('mpPlay'), leave: $('mpLeave'),
      status: $('mpStatus'), chatLog: $('mpChatLog'), sayInput: $('mpSayInput'), tag: $('mpTagText'), friends: $('btnFriends'), hudLog: $('chatLog'), bar: $('chatBar'), barInput: $('chatInput')
    };
    const S = {
      peer: null, go: null, host: false, code: '', joining: '', myId: '', hostId: '', hostConn: null, conns: new Map(), players: new Map(), busy: false, timer: 0,
      name: (store.get('gubbe-namn') || '').slice(0, 14), ride: null, near: null, lastCar: null, panel: false, chat: false
    };
    // you, as one of the riders in a car (the others are the players themselves)
    const me = { id: '', ident: playerId, mesh: null, seat: null };
    const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
    const colour = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d);
    const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 14);
    const cleanText = (t) => String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
    const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
    const inRoom = () => !!S.code;
    // the games you play together (src/party.js): what a game message may hold, what to do with one, and whether one is on
    let gameHooks = null;

    /* ---------- how you look ---------- */
    const look = () => ({ skin: playerId.skin, shirt: playerId.shirt, pants: playerId.pants, hair: playerId.hair, hat: playerId.hat, hatColor: playerId.hatColor, sleeves: playerId.sleeves });
    function cleanLook(o) {
      o = o && typeof o === 'object' ? o : {};
      return {
        skin: colour(o.skin, SKINS[0]), shirt: colour(o.shirt, COLORS[0]), pants: colour(o.pants, PANTS[0]), hair: colour(o.hair, HAIRS[1]),
        hat: o.hat === 'cap' || o.hat === 'beanie' ? o.hat : null, hatColor: colour(o.hatColor, 0xf7c600), sleeves: !!o.sleeves
      };
    }
    // put a person model in other clothes
    function dress(model, id) {
      model.inner.children[0].geometry = id.bodyGeo;
      model.legL.children[0].geometry = model.legR.children[0].geometry = id.legGeo;
      model.armL.children[0].geometry = model.armR.children[0].geometry = id.armGeo;
    }
    function applyShirt(col) {
      if (col === playerId.shirt) return;
      const id = makeIdentity({ ...look(), shirt: col });
      for (const k of ['bodyGeo', 'legGeo', 'armGeo', 'driverGeo']) playerId[k] = id[k];
      playerId.shirt = col;
      delete playerId.riderGeo;
      dress(player.model, playerId);
      if (driving) setOccupant(driving, playerId);
      store.set('gubbe-trojfarg', String(col));
      if (inRoom()) { event('look', { look: look() }); renderList(); }
    }
    {
      const saved = Number(store.get('gubbe-trojfarg'));
      if (COLORS.includes(saved)) applyShirt(saved);
    }

    /* ---------- connecting ---------- */
    const ICE = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
      { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
    ];
    // the line to the server, kept up while you are in a room: it can drop when the phone sleeps or the tab is in the background,
    // and while it is down nobody new can find the room. Called up again until it is back
    function keepLine() {
      const peer = S.peer;
      if (!peer || peer.destroyed || !peer.disconnected || !inRoom()) return;
      try { peer.reconnect(); } catch { /* tried again in a moment */ }
    }
    setInterval(keepLine, 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) keepLine(); });
    window.addEventListener('online', keepLine);

    /* ---------- the second way through ---------- */
    // some networks won't let a direct connection through, and the free TURN servers often don't answer. Then the game's
    // messages go via a free, open MQTT broker instead: a little slower, but it gets through almost everywhere.
    // The room listens on several brokers at once; whoever joins uses the first one that answers. ?relay=wss://… picks another
    const RELAY_SRC = ['https://cdn.jsdelivr.net/npm/mqtt@5.10.4/dist/mqtt.min.js', 'https://unpkg.com/mqtt@5.10.4/dist/mqtt.min.js'];
    const BROKERS = params.get('relay') ? [params.get('relay')] : ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
    const TOPIC = 'gubbe-pa-vagen/' + PROTO + '/', RELAY_ID = /^[\w-]{1,64}$/;
    const R = { clients: [], conns: new Map(), out: null, me: '', room: '' };
    let mqttLib = null;
    function loadMqtt() {
      if (window.mqtt) return Promise.resolve(window.mqtt);
      if (mqttLib) return mqttLib;
      mqttLib = new Promise((resolve, reject) => {
        let i = 0;
        const next = () => {
          if (i >= RELAY_SRC.length) { mqttLib = null; reject(new Error('mqtt')); return; }
          const s = document.createElement('script');
          s.src = RELAY_SRC[i++]; s.async = true;
          s.onload = () => (window.mqtt ? resolve(window.mqtt) : next());
          s.onerror = () => { s.remove(); next(); };
          document.head.append(s);
        };
        next();
      });
      return mqttLib;
    }
    // a connection over the broker that looks like a PeerJS one to the rest of the code: peer, open, send, close, on
    function relayConn(cl, peer, topic) {
      const ls = {};
      const conn = {
        peer, open: true, relay: true, seen: performance.now(),
        on(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); return conn; },
        emit(ev, a) { for (const fn of ls[ev] || []) fn(a); },
        send(m) { if (conn.open && cl.connected) cl.publish(topic, JSON.stringify({ f: R.me, m })); },
        close() {
          if (!conn.open) return;
          conn.open = false;
          try { if (cl.connected) cl.publish(topic, JSON.stringify({ f: R.me, bye: 1 })); } catch { /* gone already */ }
          if (R.conns.get(peer) === conn) R.conns.delete(peer);
          conn.emit('close');
        }
      };
      return conn;
    }
    const readRelay = (buf) => { try { const o = JSON.parse(String(buf)); return o && typeof o === 'object' && typeof o.f === 'string' && RELAY_ID.test(o.f) ? o : null; } catch { return null; } };
    // the room: listen on every broker for those knocking
    async function relayListen(code, me) {
      relayDown();
      try { await loadMqtt(); } catch { return; }
      if (!inRoom() || !S.host || S.myId !== me) return;
      R.me = me; R.room = code;
      for (const url of BROKERS) {
        let cl;
        try { cl = window.mqtt.connect(url, { connectTimeout: 8000, reconnectPeriod: 4000, keepalive: 30 }); } catch { continue; }
        R.clients.push(cl);
        cl.on('error', () => { /* it tries again by itself */ });
        cl.on('connect', () => cl.subscribe(TOPIC + code + '/h'));
        cl.on('message', (topic, buf) => {
          const o = readRelay(buf);
          if (!o || !inRoom() || !S.host || o.f === R.me) return;
          let conn = R.conns.get(o.f);
          if (o.bye) { if (conn) conn.close(); return; }
          if (!o.m || typeof o.m !== 'object') return;
          if (!conn || conn.cl !== cl) {
            if (o.m.t !== 'hi') return;
            if (conn) conn.close();
            conn = relayConn(cl, o.f, TOPIC + code + '/c/' + o.f);
            conn.cl = cl;
            R.conns.set(o.f, conn);
            accept(conn);
          }
          conn.seen = performance.now();
          conn.emit('data', o.m);
        });
      }
    }
    // joining: the first broker that answers, a door to the room on it
    async function relayKnock(code, me) {
      try { await loadMqtt(); } catch { return null; }
      let cl = R.clients[0];
      if (!cl || !cl.connected) {
        relayDown();
        for (const url of BROKERS) {
          if (S.joining !== code || S.myId !== me) return null;
          const c = await new Promise((res) => {
            let c0;
            try { c0 = window.mqtt.connect(url, { connectTimeout: 6000, reconnectPeriod: 0, keepalive: 30 }); } catch { res(null); return; }
            const t = setTimeout(() => fin(false), 7000);
            function fin(ok) { clearTimeout(t); if (ok) { res(c0); return; } try { c0.end(true); } catch { /* never was */ } res(null); }
            c0.once('connect', () => fin(true));
            c0.once('error', () => fin(false));
          });
          if (c) { cl = c; break; }
        }
        if (!cl || !cl.connected) return null;
        R.clients.push(cl);
        cl.options.reconnectPeriod = 4000;
        cl.on('error', () => { /* it tries again by itself */ });
        cl.on('message', (topic, buf) => {
          const o = readRelay(buf), conn = R.out;
          if (!o || !conn || o.f !== conn.peer) return;
          if (o.bye) { conn.close(); return; }
          if (!o.m || typeof o.m !== 'object') return;
          conn.seen = performance.now();
          conn.emit('data', o.m);
        });
        cl.on('connect', () => cl.subscribe(TOPIC + code + '/c/' + me));
        await new Promise((res) => cl.subscribe(TOPIC + code + '/c/' + me, () => res()));
      }
      // (knocking again: the same door, so that a late answer to the first knock still finds it)
      if (R.out && R.out.open && R.room === code && R.me === me) return R.out;
      R.me = me; R.room = code;
      if (R.out) R.out.close();
      R.out = relayConn(cl, PREFIX + code.toLowerCase(), TOPIC + code + '/h');
      return R.out;
    }
    function relayDown() {
      const all = [...R.conns.values(), R.out].filter(Boolean);
      R.conns.clear(); R.out = null;
      for (const c of all) c.close();
      for (const cl of R.clients) try { cl.end(false); } catch { /* gone already */ }
      R.clients = [];
    }
    // a relay connection that has gone quiet (the game sends 15 times a second) has gone
    setInterval(() => {
      const now = performance.now();
      for (const c of [...R.conns.values(), R.out]) if (c && c.open && now - c.seen > 25000) c.close();
    }, 2000);
    let peerLib = null;
    function loadPeer() {
      if (window.Peer) return Promise.resolve(window.Peer);
      if (peerLib) return peerLib;
      peerLib = new Promise((resolve, reject) => {
        let i = 0;
        const next = () => {
          if (i >= PEER_SRC.length) { peerLib = null; reject(new Error('peerjs')); return; }
          const s = document.createElement('script');
          s.src = PEER_SRC[i++]; s.async = true;
          s.onload = () => (window.Peer ? resolve(window.Peer) : next());
          s.onerror = () => { s.remove(); next(); };
          document.head.append(s);
        };
        next();
      });
      return peerLib;
    }
    function newPeer(id) {
      // ?peerserver=host:port uses a PeerJS server of your own instead of the free one
      // several ways through: STUN servers to find each other's address, and TURN servers that pass the traffic on when two networks won't let it straight through
      const opts = { debug: 0, config: { iceServers: ICE } }, own = params.get('peerserver');
      if (own) { const [host, port] = own.split(':'), p = Number(port) || 443; Object.assign(opts, { host, port: p, path: '/', secure: p === 443 }); }
      const peer = id ? new window.Peer(id, opts) : new window.Peer(opts);
      // the server only introduces players; if the line to it drops, the room carries on and it is called up again
      peer.on('disconnected', () => setTimeout(() => {
        if (S.peer === peer && !peer.destroyed && peer.disconnected) try { peer.reconnect(); } catch { /* tried again at the next drop */ }
      }, 1500));
      return peer;
    }
    function status(msg, err) { E.status.textContent = msg || ''; E.status.classList.toggle('err', !!err); }
    function busy(on) { S.busy = on; E.host.disabled = E.join.disabled = on; }
    function fail(msg) {
      const peer = S.peer;
      S.peer = null; S.hostConn = null; S.go = null;
      relayDown();
      if (peer) try { peer.destroy(); } catch { /* already gone */ }
      busy(false);
      status(msg, true);
    }
    function trouble(err) {
      // once you are in a room it carries on between the players already in it: only meeting new ones needs the server
      if (inRoom()) return;
      const t = err && err.type;
      fail(t === 'peer-unavailable' ? 'Hittade inget rum med koden ' + S.joining + '. Kolla koden, och att din vän har rummet öppet.'
        : t === 'browser-incompatible' ? 'Den här webbläsaren kan inte spela med vänner. Prova Chrome, Safari, Firefox eller Edge.'
        : 'Kunde inte nå servern som kopplar ihop spelarna. Kolla att du är uppkopplad och försök igen om en stund.');
    }
    function readyName() {
      S.name = cleanName(E.name.value);
      E.name.value = S.name;
      if (!S.name) { status('Skriv ditt namn först, så att dina vänner ser vem du är.', true); E.name.focus(); return false; }
      store.set('gubbe-namn', S.name);
      return true;
    }
    const noLib = 'Kunde inte hämta det som behövs för att spela med vänner. Kolla att du är uppkopplad mot internet.';
    const newCode = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
    // PeerJS's server is down or can't be reached (or the library wouldn't load): the room is opened on the brokers
    // alone, and it is closed again if none of them answers either
    async function relayRoom(code, go) {
      const peer = S.peer;
      S.peer = null;
      if (peer) try { peer.destroy(); } catch { /* already gone */ }
      status('Skapar rummet en annan väg …');
      try { await loadMqtt(); } catch { if (S.go === go) fail(noLib); return; }
      if (S.go !== go || inRoom()) return;
      S.host = true; S.myId = S.hostId = PREFIX + code.toLowerCase();
      enter(code);
      setTimeout(() => {
        if (S.go !== go || !inRoom() || R.clients.some((cl) => cl.connected)) return;
        leave();
        status('Kunde inte nå servrarna som kopplar ihop spelarna. Kolla att du är uppkopplad och försök igen om en stund.', true);
      }, 12000);
    }
    async function hostRoom(tries = 0) {
      if ((S.busy && !tries) || inRoom() || !readyName()) return;
      busy(true); status('Skapar ett rum …');
      const go = {}, code = newCode();
      S.go = go;
      let peer = null;
      try { await loadPeer(); peer = newPeer(PREFIX + code.toLowerCase()); } catch { /* the other way, then */ }
      if (S.go !== go) { if (peer) peer.destroy(); return; }
      if (!peer) { relayRoom(code, go); return; }
      S.peer = peer;
      const slow = setTimeout(() => { if (S.peer === peer && !inRoom()) relayRoom(code, go); }, 10000);
      peer.on('open', (id) => { if (S.peer === peer && !inRoom()) { clearTimeout(slow); S.host = true; S.myId = S.hostId = id; enter(code); } });
      peer.on('connection', (conn) => { if (S.peer === peer) accept(conn); });
      peer.on('error', (err) => {
        // once you are in a room it carries on between the players already in it: only meeting new ones needs the server
        if (S.peer !== peer || inRoom()) return;
        clearTimeout(slow);
        // someone already has that code: draw another
        if (err.type === 'unavailable-id' && tries < 4) { S.peer = null; peer.destroy(); hostRoom(tries + 1); return; }
        relayRoom(code, go);
      });
    }
    async function joinRoom(raw) {
      const code = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      E.code.value = code;
      if (S.busy || inRoom()) return;
      if (code.length !== 4) { status('Rumskoden är fyra bokstäver. Fråga vännen som skapade rummet.', true); E.code.focus(); return; }
      if (!readyName()) return;
      busy(true); S.joining = code; status('Går med i rum ' + code + ' …');
      const go = {};
      S.go = go;
      const live = () => S.go === go && !inRoom();
      let iceFailed = false, noRoom = false, tries = 0, retry = null, begun = false, knocking = false;
      const wait = setTimeout(() => {
        if (!live()) return;
        clearTimeout(retry);
        fail(iceFailed ? 'Hittade rum ' + code + ', men era nätverk släpper inte igenom anslutningen. Prova ett annat nät, till exempel mobilens.'
          : noRoom ? 'Hittade inget rum med koden ' + code + '. Kolla koden, och att din vän har rummet öppet.'
          : 'Rum ' + code + ' svarar inte. Kolla koden, och att din vän har spelet öppet och framme på skärmen.');
      }, 32000);
      // knock on the room's door: first straight through, then (if nothing has come back) via the broker, and again
      const knock = async () => {
        if (!live()) return;
        const n = tries++;
        if (n < 4) retry = setTimeout(knock, n === 0 ? 6000 : 8000);
        let conn;
        if (n === 0 && S.peer) {
          conn = S.peer.connect(PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
          conn.on('iceStateChanged', (st) => { if (st === 'failed') iceFailed = true; });
        } else {
          if (n === 1) status('Går med i rum ' + code + ' en annan väg …');
          // (finding a broker can take longer than the next knock: one at a time)
          if (knocking) return;
          knocking = true;
          const me = S.myId;
          try { conn = await relayKnock(code, me); } finally { knocking = false; }
          if (!conn || !live() || S.myId !== me) return;
        }
        const hi = () => conn.send({ t: 'hi', v: PROTO, name: S.name, look: look(), ver: VERSION.nr });
        if (conn === S.hostConn) { hi(); return; }
        if (S.hostConn && S.hostConn !== conn) try { S.hostConn.close(); } catch { /* gone already */ }
        S.hostConn = conn;
        conn.on('data', (m) => clientData(conn, m, code, wait));
        conn.on('close', () => { if (S.hostConn === conn && inRoom()) hostGone(); });
        conn.on('error', () => { /* the close, or the wait running out, deals with it */ });
        if (conn.relay) hi(); else conn.on('open', hi);
      };
      const begin = () => { if (begun || !live()) return; begun = true; knock(); };
      // without PeerJS's server: only via the brokers, with an id of your own
      const relayOnly = async () => {
        if (!live() || begun) return;
        const peer = S.peer;
        S.peer = null;
        if (peer) try { peer.destroy(); } catch { /* already gone */ }
        try { await loadMqtt(); } catch { if (live()) { clearTimeout(wait); fail(noLib); } return; }
        if (!live() || begun) return;
        S.myId = 'r-' + Math.random().toString(36).slice(2, 12);
        tries = Math.max(tries, 1);
        begin();
      };
      let peer = null;
      try { await loadPeer(); peer = newPeer(); } catch { /* the other way, then */ }
      if (S.go !== go) { if (peer) peer.destroy(); return; }
      if (!peer) { relayOnly(); return; }
      S.peer = peer;
      setTimeout(() => { if (S.peer === peer && !peer.open) relayOnly(); }, 10000);
      peer.on('open', (id) => {
        // (it fires again when the line to the server comes back: the connection to the room is still there)
        if (S.peer !== peer || S.hostConn || begun) return;
        S.myId = id;
        begin();
        loadMqtt().catch(() => {});
      });
      peer.on('error', (err) => {
        if (S.peer !== peer || inRoom()) return;
        // (the room may still be there on the brokers, if its PeerJS couldn't reach the server either)
        if (err.type === 'peer-unavailable') { noRoom = true; return; }
        if (err.type === 'browser-incompatible' && !window.RTCPeerConnection) { clearTimeout(wait); trouble(err); return; }
        if (!begun) relayOnly();
      });
    }
    const info = (P) => ({ id: P.id, name: P.name, look: P.look, ver: P.ver });
    const meInfo = () => ({ id: S.myId, name: S.name, look: look(), ver: VERSION.nr });
    // their version, when it isn't yours (0: from before the versions were shown)
    const otherVer = (P) => (P.ver === VERSION.nr ? '' : P.ver ? 'version ' + P.ver : 'äldre version');
    function broadcast(m, except) {
      for (const [id, c] of S.conns) if (id !== except && c.open) try { c.send(m); } catch { /* its close event drops it */ }
    }
    // you have the room: everyone else is connected to you, and you pass on what each of them sends
    function accept(conn) {
      conn.on('data', (m) => hostData(conn, m));
      conn.on('close', () => dropConn(conn));
      conn.on('error', () => dropConn(conn));
    }
    function hostData(conn, m) {
      if (!m || typeof m !== 'object' || !inRoom()) return;
      const id = conn.peer, P = S.players.get(id);
      if (m.t === 'hi') {
        // the same player again on a new connection: carry on over that one
        if (P) {
          const old = S.conns.get(id);
          if (old !== conn) { S.conns.set(id, conn); if (old) try { old.close(); } catch { /* gone already */ } }
          conn.send({ t: 'welcome', v: PROTO, host: S.myId, time: DAYNIGHT.hour, players: [meInfo(), ...[...S.players.values()].filter((p) => p !== P).map(info)] });
          return;
        }
        const no = m.v !== PROTO ? 'old' : S.players.size + 1 >= MAX ? 'full' : '';
        if (no) { try { conn.send({ t: 'no', why: no }); } catch { /* gone already */ } setTimeout(() => conn.close(), 1000); return; }
        S.conns.set(id, conn);
        const np = addPlayer(id, m.name, m.look, m.ver);
        conn.send({ t: 'welcome', v: PROTO, host: S.myId, time: DAYNIGHT.hour, players: [meInfo(), ...[...S.players.values()].filter((p) => p !== np).map(info)] });
        broadcast({ t: 'join', ...info(np) }, id);
        toast(np.name + ' kom in i rummet.' + (otherVer(np) ? ' Hen har ' + otherVer(np) + ', du har version ' + VERSION.nr + '.' : ''));
        return;
      }
      if (!P) return;
      if (m.t === 's') { if (take(P, m.d)) broadcast({ t: 's', id, d: m.d.slice(0, 12) }, id); }
      else if (m.t === 'e') { const e = cleanEvent(m, id); if (e) { heard(P, e); broadcast(e, id); } }
    }
    function dropConn(conn) {
      if (S.conns.get(conn.peer) !== conn) return;
      S.conns.delete(conn.peer);
      try { conn.close(); } catch { /* closed already */ }
      removePlayer(conn.peer, true);
      broadcast({ t: 'left', id: conn.peer });
    }
    function clientData(conn, m, code, wait) {
      if (!m || typeof m !== 'object' || S.hostConn !== conn) return;
      if (m.t === 'welcome') {
        if (inRoom()) return;
        clearTimeout(wait);
        S.host = false; S.hostId = String(m.host || conn.peer);
        for (const i of Array.isArray(m.players) ? m.players.slice(0, MAX) : []) if (i && typeof i.id === 'string' && i.id !== S.myId && !S.players.has(i.id)) addPlayer(i.id, i.name, i.look, i.ver);
        // (the time of day is the host's)
        DAYNIGHT.heard(true, m.time);
        enter(code);
        return;
      }
      if (m.t === 'no') { clearTimeout(wait); fail(m.why === 'full' ? 'Rummet är fullt. Det får plats åtta spelare.' : 'Ni har olika versioner av spelet. Ladda om sidan, alla som ska spela.'); return; }
      if (!inRoom()) return;
      const P = S.players.get(m.id);
      if (m.t === 's') { if (P) take(P, m.d); }
      else if (m.t === 'e') { if (P) heard(P, m); }
      else if (m.t === 'join') { if (!P && typeof m.id === 'string' && m.id !== S.myId && S.players.size + 1 < MAX) { const np = addPlayer(m.id, m.name, m.look, m.ver); toast(np.name + ' kom in i rummet.' + (otherVer(np) ? ' Hen har ' + otherVer(np) + ', du har version ' + VERSION.nr + '.' : '')); } }
      else if (m.t === 'left') { if (P) removePlayer(P.id, true); }
    }
    function hostGone() {
      const H = S.players.get(S.hostId), who = H ? H.name : 'Den som hade rummet';
      leave();
      toast(who + ' stängde rummet.');
      status(who + ' stängde rummet. Skapa ett eget rum, eller gå med i ett annat.', true);
    }
    function enter(code) {
      S.code = code; S.joining = '';
      busy(false); status('');
      clearInterval(S.timer);
      S.timer = setInterval(send, SEND_MS);
      showRoom(); hud();
      if (!S.host) toast('Du är med i rum ' + code + '.');
      else relayListen(code, S.myId);
    }
    function leave() {
      if (S.ride) unride(true);
      for (const id of [...S.players.keys()]) removePlayer(id, false);
      clearInterval(S.timer);
      const peer = S.peer;
      Object.assign(S, { peer: null, go: null, host: false, code: '', joining: '', myId: '', hostId: '', hostConn: null, lastCar: null, near: null });
      S.conns.clear();
      relayDown();
      if (peer) try { peer.destroy(); } catch { /* already gone */ }
      seats();
      busy(false); showSetup(); hud();
    }
    window.addEventListener('pagehide', () => { if (S.peer) try { S.peer.destroy(); } catch { /* closing anyway */ } });
    // (back to the page from the browser's history: that room is gone)
    window.addEventListener('pageshow', (e) => { if (e.persisted && inRoom()) { leave(); status('Du lämnade rummet.'); } });

    /* ---------- the other players ---------- */
    function addPlayer(id, name, lk, ver) {
      const L = cleanLook(lk), ident = makeIdentity(L);
      const person = makePerson(ident, player.x, player.z, null);
      person.remote = true; person.keep = true; person.asleep = true; person.model.group.visible = false;
      const P = { id, name: cleanName(name) || 'Vän', look: L, ident, person, car: null, snaps: [], offset: null, st: null, stars: 0, tag: makeTag(), tagKey: '', mesh: null, seat: null, badge: null, ver: Number.isInteger(ver) ? ver : 0 };
      drawTag(P);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { P.tagKey = ''; drawTag(P); }).catch(() => {});
      S.players.set(id, P);
      renderList(); hud();
      return P;
    }
    function removePlayer(id, announce) {
      const P = S.players.get(id);
      if (!P) return;
      S.players.delete(id);
      dropCar(P);
      removePerson(P.person);
      if (P.mesh && P.mesh.parent) P.mesh.parent.remove(P.mesh);
      if (P.heli) { scene.remove(P.heli.group, P.heli.beam, P.heli.patch); P.heli.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      if (P.chute) { scene.remove(P.chute); P.chute.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      scene.remove(P.tag); P.tag.material.map.dispose(); P.tag.material.dispose();
      if (announce) toast(P.name + ' lämnade rummet.');
      renderList(); hud();
    }
    function dropCar(P) {
      const c = P.car;
      if (!c) return;
      if (S.ride === c) unride(true);
      removeCar(c);
      P.car = null;
    }
    // the name over a friend's head (or car), and their stars when the police are after them; seen through walls. In a game
    // their part in it goes before the name, and the sign takes its colour
    function makeTag() {
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 96;
      const tex = new THREE.CanvasTexture(cv);
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: false }));
      s.center.set(0.5, 0); s.renderOrder = 20; s.visible = false;
      // (layer 1: drawn for the camera, but not in the mirror image in the water)
      s.layers.set(1);
      scene.add(s);
      return s;
    }
    function drawTag(P) {
      const b = P.badge, key = P.name + ':' + P.look.shirt + ':' + P.stars + ':' + (b ? b.text + b.bg : '');
      if (key === P.tagKey) return;
      P.tagKey = key;
      const cv = P.tag.material.map.image, g = cv.getContext('2d'), stars = '★'.repeat(P.stars);
      g.clearRect(0, 0, cv.width, cv.height);
      g.font = '900 34px Overpass, Arial, sans-serif';
      const bw = b ? Math.min(150, g.measureText(b.text).width) + 14 : 0;
      g.font = '900 46px Overpass, Arial, sans-serif';
      const tw = Math.min(330 - bw, g.measureText(P.name).width);
      g.font = '900 38px Arial, sans-serif';
      const sw = stars ? g.measureText(stars).width + 14 : 0, w = Math.min(cv.width - 8, 86 + bw + tw + sw), x0 = (cv.width - w) / 2;
      roundRect(g, x0, 8, w, 78, 24); g.fillStyle = b ? b.bg : '#0a5ba8'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
      g.beginPath(); g.arc(x0 + 40, 47, 15, 0, TAU); g.fillStyle = hex(P.look.shirt); g.fill(); g.lineWidth = 4; g.stroke();
      g.textBaseline = 'middle';
      if (b) { g.fillStyle = '#f7c600'; g.font = '900 34px Overpass, Arial, sans-serif'; g.fillText(b.text, x0 + 66, 50, 150); }
      g.fillStyle = '#ffffff'; g.font = '900 46px Overpass, Arial, sans-serif';
      g.fillText(P.name, x0 + 66 + bw, 50, 330 - bw);
      if (stars) { g.fillStyle = '#f7c600'; g.font = '900 38px Arial, sans-serif'; g.fillText(stars, x0 + 66 + bw + tw + 14, 49); }
      P.tag.material.map.needsUpdate = true;
    }
    // d: [time, x, y, z, heading, vx, vz, flags (1 on the ground, 2 in a vehicle, 4 handcuffed, 8 under a parachute), stars, riding with (id or 0), car or 0]
    // car: [id, model, colour, x, z, heading, vx, vz, steering, gear, throttle, flags (1 brakes, 2 reversing, 4 blue lights,
    //       8 engine dead, 16 at the wheel), blinkers, engine health, turret, wheel slip, the workshop's rims and springs (WORKSHOP.netCode)]
    // then, flying the helicopter (FLY), [x, y, z, heading, pitch, roll, rotor] (left out by games from before it)
    function take(P, d) {
      if (!Array.isArray(d) || d.length < 11) return false;
      const t = num(d[0], NaN), a = P.snaps;
      if (!isFinite(t) || (a.length && t <= a[a.length - 1].t)) return false;
      const pos = (v) => clamp(num(v), -9000, 9000), vel = (v) => clamp(num(v), -150, 150);
      const s = {
        t, x: pos(d[1]), y: clamp(num(d[2]), -10, 400), z: pos(d[3]), rot: num(d[4]), vx: vel(d[5]), vz: vel(d[6]), f: num(d[7]) | 0,
        stars: clamp(num(d[8]) | 0, 0, 5), ride: typeof d[9] === 'string' ? d[9] : '', c: null, hc: null
      };
      const hc = d[11];
      if (Array.isArray(hc) && hc.length >= 7) s.hc = { x: pos(hc[0]), y: clamp(num(hc[1]), -5, 400), z: pos(hc[2]), h: num(hc[3]), p: clamp(num(hc[4]), -1, 1), r: clamp(num(hc[5]), -1, 1), rot: clamp(num(hc[6]), 0, 1) };
      const c = d[10];
      if (Array.isArray(c) && c.length >= 16 && typeof c[0] === 'string') {
        s.c = {
          id: c[0].slice(0, 12), m: typeof c[1] === 'string' && Object.prototype.hasOwnProperty.call(MODEL, c[1]) ? c[1] : 'halvkombi', col: num(c[2]), x: pos(c[3]), z: pos(c[4]), h: num(c[5]),
          vx: vel(c[6]), vz: vel(c[7]), st: clamp(num(c[8]), -1, 1), g: clamp(num(c[9]) | 0, 0, 9), th: clamp(num(c[10]), -1, 1), f: num(c[11]) | 0,
          b: clamp(num(c[12]) | 0, 0, 3), hp: clamp(num(c[13], 100), 0, 100), a: num(c[14]), slip: clamp(num(c[15]), 0, 30), tune: clamp(num(c[16]) | 0, 0, 127)
        };
      }
      // (each colour is a geometry of its own: only the ones the model comes in, gold and the workshop's paints)
      if (s.c && !MODEL[s.c.m].colors.includes(s.c.col) && s.c.col !== 0xc9a227 && !WORKSHOP.paints.includes(s.c.col)) s.c.col = MODEL[s.c.m].colors[0];
      a.push(s);
      if (a.length > 40) a.shift();
      // how far their clock is from ours, plus the quickest a message has come through
      const off = performance.now() - t;
      if (P.offset === null || off < P.offset) P.offset = off;
      return true;
    }
    function mix(A, B, k, ex) {
      const D = k < 0.5 ? A : B;
      const o = {
        x: lerp(A.x, B.x, k) + A.vx * ex, y: lerp(A.y, B.y, k), z: lerp(A.z, B.z, k) + A.vz * ex, rot: lerpAngle(A.rot, B.rot, k),
        vx: lerp(A.vx, B.vx, k), vz: lerp(A.vz, B.vz, k), f: D.f, stars: D.stars, ride: D.ride, c: D.c, hc: D.hc
      };
      const ha = A.hc, hb = B.hc;
      if (ha && hb) o.hc = { x: lerp(ha.x, hb.x, k) + A.vx * ex, y: lerp(ha.y, hb.y, k), z: lerp(ha.z, hb.z, k) + A.vz * ex, h: lerpAngle(ha.h, hb.h, k), p: lerp(ha.p, hb.p, k), r: lerp(ha.r, hb.r, k), rot: lerp(ha.rot, hb.rot, k) };
      const ca = A.c, cb = B.c;
      if (ca && cb && ca.id === cb.id) {
        o.c = Object.assign({}, D.c, {
          x: lerp(ca.x, cb.x, k) + ca.vx * ex, z: lerp(ca.z, cb.z, k) + ca.vz * ex, h: lerpAngle(ca.h, cb.h, k),
          vx: lerp(ca.vx, cb.vx, k), vz: lerp(ca.vz, cb.vz, k), st: lerp(ca.st, cb.st, k), a: lerpAngle(ca.a, cb.a, k)
        });
      }
      return o;
    }
    // where a player was at (their) time rt: in between two updates, or a little way on from the last one
    function sample(P, rt) {
      const a = P.snaps;
      if (!a.length) return null;
      while (a.length > 2 && a[1].t < rt - 400) a.shift();
      let i = a.length - 1;
      while (i > 0 && a[i].t > rt) i--;
      const A = a[i], B = a[i + 1];
      if (!B || rt <= A.t) return mix(A, A, 0, B ? 0 : clamp((rt - A.t) / 1000, 0, 0.25));
      return mix(A, B, (rt - A.t) / (B.t - A.t), 0);
    }
    function place(P, st, dt) {
      P.st = st;
      const cs = st.c;
      if (cs) {
        let c = P.car;
        // (new paint from the workshop: the car is built again in its new colour)
        if (!c || c.netId !== cs.id || c.M.id !== cs.m || c.color !== cs.col) {
          dropCar(P);
          c = makeCar(MODEL[cs.m], cs.col);
          Object.assign(c, { remote: true, keep: true, netId: cs.id, owner: P, x: cs.x, z: cs.z, h: cs.h });
          c.group.position.set(c.x, 0, c.z); c.group.rotation.y = c.h;
          P.car = c;
        }
        // at the wheel, or the car stands where they left it
        const on = !!(cs.f & 16);
        if (on !== (c.occupant === P.ident)) setOccupant(c, on ? P.ident : null);
        if (c.tuneNet !== cs.tune) { c.tuneNet = cs.tune; WORKSHOP.look(c, cs.tune); }
        c.x = cs.x; c.z = cs.z; c.h = cs.h; c.steer = cs.st;
        c.vx = on ? cs.vx : 0; c.vz = on ? cs.vz : 0;
        c.wheelRot += ((c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h)) * dt) / c.M.R;
        c.gear = Math.min(cs.g, c.M.gears - 1); c.thr = on ? cs.th : 0; c.throttle = Math.abs(c.thr);
        c.braking = !!(cs.f & 1); c.reversing = !!(cs.f & 2); c.siren = !!(cs.f & 4); c.dead = !!(cs.f & 8);
        c.health = cs.hp; c.blink = cs.b; c.aimWant = cs.a; c.slip = on ? cs.slip : 0;
      } else if (P.car) dropCar(P);
      // in their helicopter: the red Bell 429 where they fly it
      const hc = st.hc;
      if (hc) {
        if (!P.heli) P.heli = buildHeli(true);
        const M = P.heli;
        M.group.visible = true;
        M.group.position.set(hc.x, hc.y, hc.z); M.body.rotation.set(hc.p, hc.h, hc.r);
        P.spin = (P.spin || 0) + dt * 41 * hc.rot;
        M.rotor.rotation.y = P.spin; M.tail.rotation.x = P.spin * 5.3; M.beacon.visible = clock % 1.2 < 0.12;
      } else if (P.heli) P.heli.group.visible = false;
      // under a parachute: the canopy over them
      if (st.f & 8) {
        if (!P.chute) P.chute = CHUTE.canopy();
        P.chute.visible = true; P.chute.position.set(st.x, st.y, st.z); P.chute.rotation.y = st.rot;
      } else if (P.chute) P.chute.visible = false;
      const p = P.person, hide = !!(st.f & 2) || !!st.ride;
      p.asleep = hide; p.model.group.visible = !hide;
      p.x = st.x; p.y = st.y; p.z = st.z; p.rot = st.rot; p.vx = st.vx; p.vz = st.vz;
      p.grounded = !!(st.f & 1); p.cuffed = !!(st.f & 4);
      // soaked by a water balloon: they stay wet while they say so (SPLASH dries them off)
      p.wetT = st.f & 16 ? 1 : Math.min(p.wetT || 0, 0.2);
      if (st.stars !== P.stars) { P.stars = st.stars; drawTag(P); }
    }
    // what you send 15 times a second (see take)
    function state() {
      if (driving) S.lastCar = driving;
      const c = driving || (S.lastCar && S.lastCar.group.parent ? S.lastCar : null);
      if (!c) S.lastCar = null;
      if (c && !c.netId) c.netId = Math.random().toString(36).slice(2, 10);
      const hidden = !!driving || !!S.ride || FLY.on || METRO.riding || !!(policeStop && policeStop.riding);
      const car = c ? [c.netId, c.M.id, c.color, r2(c.x), r2(c.z), r3(c.h), r2(c.vx), r2(c.vz), r3(c.steer), c.gear | 0, r2(c.thr || 0),
        (c.braking ? 1 : 0) | (c.reversing ? 2 : 0) | (c.siren ? 4 : 0) | (c.dead ? 8 : 0) | (c === driving ? 16 : 0), c.blink | 0, Math.round(c.health), r3(c.aim || 0), r1(c.slip || 0), WORKSHOP.netCode(c)] : 0;
      return [Math.round(performance.now()), r2(player.x), r2(player.y), r2(player.z), r3(player.rot), r2(player.vx), r2(player.vz),
        (player.grounded ? 1 : 0) | (hidden ? 2 : 0) | (player.cuffed ? 4 : 0) | (CHUTE.open ? 8 : 0) | (SPLASH.wet ? 16 : 0), stars(), S.ride ? S.ride.owner.id : 0, car, FLY.on ? FLY.net() : 0];
    }
    function send() {
      if (!inRoom()) return;
      const d = state();
      if (S.host) broadcast({ t: 's', id: S.myId, d });
      else if (S.hostConn && S.hostConn.open) try { S.hostConn.send({ t: 's', d }); } catch { /* its close event deals with it */ }
    }
    // the horn, the chat, a dent, the tank's gun, new clothes, water balloons and (from the host) the time of day go to everyone at once
    function event(k, extra) {
      if (!inRoom()) return;
      const m = Object.assign({ t: 'e', k }, extra);
      if (S.host) broadcast(Object.assign(m, { id: S.myId }));
      else if (S.hostConn && S.hostConn.open) try { S.hostConn.send(m); } catch { /* its close event deals with it */ }
    }
    // an event as it may be passed on: only what it should hold, and not too often
    function cleanEvent(m, id) {
      const k = m.k, e = { t: 'e', k, id };
      if (k === 'horn') return e;
      if (k === 'chat') { const text = cleanText(m.m); return text ? Object.assign(e, { m: text }) : null; }
      if (k === 'dent') return typeof m.c === 'string' && Array.isArray(m.a) && m.a.length === 8 ? Object.assign(e, { c: m.c.slice(0, 12), a: m.a.map((v) => num(v)) }) : null;
      if (k === 'fire') return Object.assign(e, { a: num(m.a) });
      if (k === 'look') return Object.assign(e, { look: cleanLook(m.look) });
      if (k === 'wb') return Array.isArray(m.p) && m.p.length === 3 && Array.isArray(m.v) && m.v.length === 3 ? Object.assign(e, { p: m.p.map((v) => num(v)), v: m.v.map((v) => num(v)), c: num(m.c) }) : null;
      if (k === 'wet') return typeof m.by === 'string' ? Object.assign(e, { by: m.by.slice(0, 64) }) : null;
      if (k === 'game') { const g = gameHooks ? gameHooks.clean(m.g) : null; return g ? Object.assign(e, { g }) : null; }
      return null;
    }
    function heard(P, m) {
      const atWheel = P.car && P.car.occupant === P.ident;
      if (m.k === 'horn') {
        const at = atWheel ? P.car : P.person, M = atWheel ? P.car.M : null, s = placeSound(at.x, at.z, 140);
        if (s.level > 0.01) beep(M && M.moped ? [740] : M && M.bus ? [220, 277] : M && M.sport ? [523, 659] : [392, 494], 0.05 * s.level + 0.004, M && M.moped ? 0.3 : 0.45, s.pan);
      } else if (m.k === 'chat') {
        const text = cleanText(m.m);
        if (text) { chat(P.name, P.look.shirt, text); if (audio && !muted) beep([988, 1319], 0.012, 0.09); }
      } else if (m.k === 'dent') {
        const a = m.a;
        if (P.car && P.car.netId === m.c && Array.isArray(a) && a.length === 8 && a.every((v) => typeof v === 'number' && isFinite(v))) {
          dentCar(P.car, clamp(a[0], -9, 9), clamp(a[1], -2, 6), clamp(a[2], -9, 9), clamp(a[3], -1, 1), clamp(a[4], -1, 1), clamp(a[5], 0, 0.7), clamp(a[6], 0, 1.5), clamp(a[7], 0, 80));
        }
      } else if (m.k === 'fire') {
        const now = performance.now();
        if (atWheel && P.car.M.mil === 'tank' && !(now - (P.firedAt || -1e9) < 2000)) { P.firedAt = now; P.car.aim = num(m.a); fireCannon(P.car, true); }
      } else if (m.k === 'look') {
        const now = performance.now();
        if (now - (P.lookAt || -1e9) < 800) return;
        P.lookAt = now;
        P.look = cleanLook(m.look); P.ident = makeIdentity(P.look);
        dress(P.person.model, P.ident);
        if (atWheel) setOccupant(P.car, P.ident);
        drawTag(P); renderList();
      } else if (m.k === 'time') DAYNIGHT.heard(P.id === S.hostId, m.h);
      else if (m.k === 'wb') SPLASH.heard(P, m);
      else if (m.k === 'wet') SPLASH.wetBy(P, m.by);
      else if (m.k === 'game') {
        const g = gameHooks ? gameHooks.clean(m.g) : null;
        if (g) gameHooks.heard(P.id, g);
      }
    }

    /* ---------- riding along ---------- */
    // the seats a passenger can have, beside the driver first, in the car's own frame
    function seatsOf(c) {
      const d = c.geo.driver, r = c.geo.rear, M = c.M;
      if (rides(M)) return [{ x: 0, y: d.y + 0.04, z: d.z - 0.52 }];
      if (M.bus) return [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: i % 2 ? d.x : -d.x, y: d.y, z: d.z - 2.4 - Math.floor(i / 2) * 1.5 }));
      if (Math.abs(d.x) < 0.25) return [{ x: 0, y: d.y, z: d.z - 0.95 }];
      const s = [{ x: -d.x, y: d.y, z: d.z }];
      if (r) s.push({ x: -r.x, y: r.y, z: r.z }, { x: r.x, y: r.y, z: r.z });
      return s;
    }
    // the car someone drives (or last drove), as this game sees it
    function carOf(id) {
      if (id === S.myId) return driving || (S.lastCar && S.lastCar.group.parent ? S.lastCar : null);
      const P = S.players.get(id);
      return P ? P.car : null;
    }
    // everyone riding with someone sits in that car: in the order of their ids, so that every game seats them alike
    function seats() {
      me.id = S.myId; me.ident = playerId;
      const all = [me, ...S.players.values()], groups = new Map();
      for (const R of all) {
        R.seat = null;
        const car = R === me ? S.ride : R.st && R.st.ride ? carOf(R.st.ride) : null;
        if (!car) continue;
        if (!groups.has(car)) groups.set(car, []);
        groups.get(car).push(R);
      }
      for (const [car, list] of groups) {
        const spots = seatsOf(car);
        list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        list.forEach((R, i) => { if (spots[i]) R.seat = { car, spot: spots[i], n: i }; });
      }
      for (const R of all) {
        if (!R.seat) { if (R.mesh && R.mesh.parent) R.mesh.parent.remove(R.mesh); continue; }
        const { car, spot } = R.seat, geo = rides(car.M) ? riderGeometry(R.ident) : R.ident.driverGeo;
        if (!R.mesh) R.mesh = new THREE.Mesh(geo, personMat);
        R.mesh.geometry = geo;
        if (R.mesh.parent !== car.body) car.body.add(R.mesh);
        R.mesh.position.set(spot.x, spot.y, spot.z);
      }
    }
    // a friend's car with them at the wheel, near enough to get in, and not going too fast to
    function rideable() {
      if (driving || S.ride || FLY.on || CHUTE.on || RIDES.on || !started || (policeStop && policeStop.locked) || player.y > 1.5) return null;
      let best = null, bd = Infinity;
      for (const P of S.players.values()) {
        const c = P.car;
        if (!c || c.occupant !== P.ident || Math.hypot(c.vx, c.vz) > 6) continue;
        const dx = player.x - c.x, dz = player.z - c.z, d = dx * dx + dz * dz;
        if (d > 100 || d >= bd) continue;
        const co = Math.cos(c.h), si = Math.sin(c.h), lx = dx * co - dz * si, lz = dx * si + dz * co;
        if (Math.abs(lx) < c.M.W / 2 + 1.6 && Math.abs(lz) < c.M.L / 2 + 1.2 && (!c.M.boat || player.y < 0.5)) { bd = d; best = c; }
      }
      return best;
    }
    function ride(c) {
      const taken = [...S.players.values()].filter((P) => P.st && P.st.ride === c.owner.id).length;
      if (taken >= seatsOf(c).length) { toast('Det finns ingen plats kvar i ' + c.M.def + '.'); return; }
      S.ride = c;
      player.model.group.visible = false;
      player.vx = player.vz = player.vy = 0;
      lastLook = -1e9;
      seats();
      toast('Du åker med ' + c.owner.name + '.' + (isTouch ? '' : ' E kliver ur.'));
    }
    // out on the passenger's side if there is room
    function rideExit(c) {
      if (c.M.boat) return boatExitSpot(c);
      const co = Math.cos(c.h), si = Math.sin(c.h), side = c.geo.driver.x > 0 ? -1 : 1, hw = c.M.W / 2 + 0.8;
      for (const [lx, lz] of [[side * hw, c.geo.driver.z], [side * hw, 0]]) {
        const x = c.x + lx * co + lz * si, z = c.z - lx * si + lz * co;
        if (personFits(x, z) && !blockedAt(x, z, 0.36) && !cars.some((o) => o !== c && byCar(o, x, z, 0.3))) return { x, z };
      }
      return exitSpot(c);
    }
    function unride(force) {
      const c = S.ride;
      if (!c) return true;
      let out = rideExit(c) || (force ? spotNear(c.x, c.z) : null);
      // far out on the water: put ashore at the nearest street corner instead of on the water
      if (!out && force) {
        let bd = Infinity;
        for (const n of nodes) { const d = Math.hypot(n.x - c.x, n.z - c.z); if (d < bd && personFits(n.x, n.z)) { bd = d; out = { x: n.x, z: n.z }; } }
      }
      if (!out && !force) { toast(c.M.boat ? 'Vänta tills båten ligger vid en kaj, så kan du kliva i land.' : 'Det finns ingen plats att kliva ur här.'); return false; }
      S.ride = null;
      seats();
      player.model.group.visible = true;
      if (out) { player.x = out.x; player.z = out.z; camTarget.set(out.x, 1.6, out.z); }
      const sp = Math.hypot(c.vx, c.vz);
      player.y = 0; player.rot = c.h; player.vx = c.vx * 0.5; player.vz = c.vz * 0.5; player.vy = 0;
      if (sp > 5 && !c.M.boat) { player.vy = 4.5; player.grounded = false; player.knockT = 1.2; toast('Du hoppade ur i farten!'); }
      return true;
    }
    function use() {
      if (S.ride) { unride(false); return true; }
      if (S.near) { ride(S.near); return true; }
      return false;
    }
    // somewhere to stand near (x, z)
    function spotNear(x, z) {
      for (const r of [2.5, 4, 6, 9, 13, 18, 25, 35, 50, 70, 100]) for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (personFits(px, pz) && !blockedAt(px, pz, 0.4) && !STATION.inside(px, pz) && !cars.some((c) => byCar(c, px, pz, 0.4))) return { x: px, z: pz };
      }
      return null;
    }
    // straight to a friend: out of your car and onto the pavement beside them
    function goTo(P) {
      if (policeStop && policeStop.locked) { status('Det går inte nu, du är gripen.', true); return; }
      if (gameHooks && gameHooks.busy()) { status('Det går inte mitt i en lek. Vänta tills den är slut.', true); return; }
      // (the game stands still behind the sign: bring everyone up to date first)
      update(0);
      if (!P.st) { status(P.name + ' har inte kommit in i spelet än.', true); return; }
      const at = P.car && P.car.occupant === P.ident ? P.car : (P.st.ride && carOf(P.st.ride)) || P.person;
      const spot = spotNear(at.x, at.z);
      if (!spot) { status('Hittade ingen plats bredvid ' + P.name + ' just nu. Försök igen om en stund.', true); return; }
      if (S.ride) unride(true);
      FLY.bail(); CHUTE.bail(); METRO.bail(); RIDES.bail(); WORKSHOP.bail();
      if (driving && !exitCar()) { closePanel(); return; }
      player.x = spot.x; player.z = spot.z; player.y = 0; player.vx = player.vz = player.vy = 0;
      player.rot = camYaw = Math.atan2(at.x - spot.x, at.z - spot.z);
      camTarget.set(player.x, 1.6, player.z);
      closePanel();
      if (!started) startGame();
      toast('Du är hos ' + P.name + '.');
    }

    /* ---------- every frame ---------- */
    function update(dt) {
      if (!inRoom()) { S.near = null; return; }
      const now = performance.now();
      for (const P of S.players.values()) {
        if (P.offset === null) continue;
        // (the clocks drift a little, and the way between you can get slower: let the offset creep up, the next quick
        // message pulls it back. Running out of updates for a while means the lag has grown: catch up faster)
        P.offset += dt * 3;
        const behind = now - P.offset - DELAY - P.snaps[P.snaps.length - 1].t;
        if (behind > 60) P.offset += Math.min(behind, 400) * dt * 1.5;
        try {
          const st = sample(P, now - P.offset - DELAY);
          if (st) place(P, st, dt);
        } catch (err) {
          // (whatever it was, it is not worth the game: forget what came from them and wait for the next update)
          P.snaps.length = 0; P.offset = null;
        }
      }
      if (S.ride && (!S.ride.group.parent || driving || (policeStop && policeStop.locked))) unride(true);
      seats();
      S.near = rideable();
      // a friend standing in your way: you can't walk through them
      if (!driving && !S.ride) for (const P of S.players.values()) {
        const p = P.person;
        if (!p.model.group.visible) continue;
        const dx = player.x - p.x, dz = player.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.49 && d2 > 1e-6 && Math.abs(p.y - player.y) < 1.5) {
          const d = Math.sqrt(d2), x = player.x + (dx / d) * (0.7 - d), z = player.z + (dz / d) * (0.7 - d);
          if (personFits(x, z)) { player.x = x; player.z = z; }
        }
      }
      for (const P of S.players.values()) {
        const t = P.tag, st = P.st;
        if (!st) { t.visible = false; continue; }
        const rc = st.ride ? carOf(st.ride) : null, wheel = P.car && P.car.occupant === P.ident ? P.car : null, c = wheel || rc;
        let x = P.person.x, y = P.person.y + 2.12, z = P.person.z;
        if (st.hc) { x = st.hc.x; y = st.hc.y + 4.2; z = st.hc.z; }
        else if (c) { x = c.x; z = c.z; y = (c.M.boat ? WATER_Y + 2.4 : c.parts[c.parts.length - 1].top + 0.75) + (wheel ? 0 : 0.6 * (1 + (P.seat ? P.seat.n : 0))); }
        else if (st.f & 2) y = P.person.y + 2.6;
        // (a little bigger on a short screen, a phone on its side, so the name can be read)
        const d = Math.hypot(x - camera.position.x, z - camera.position.z), k = clamp(1.1 - d / 700, 0.62, 1) * clamp(600 / window.innerHeight, 1, 1.6);
        // (someone hiding from you in a game: no name through the walls)
        t.visible = d < 1200 && !(P.badge && P.badge.hide);
        t.position.set(x, y, z);
        t.scale.set(0.046 * k * (512 / 96), 0.046 * k, 1);
      }
    }

    /* ---------- the chat ---------- */
    function chat(name, col, text) {
      for (const box of [E.hudLog, E.chatLog]) {
        const line = document.createElement('div'), who = document.createElement('span'), dot = document.createElement('i');
        if (box === E.hudLog) line.className = 'chat-line';
        who.className = 'chat-name'; dot.style.background = hex(col);
        who.append(dot, name);
        line.append(who, text);
        box.append(line);
        while (box.children.length > (box === E.hudLog ? 5 : 40)) box.firstChild.remove();
        if (box === E.hudLog) setTimeout(() => line.remove(), 12000);
      }
      E.chatLog.scrollTop = E.chatLog.scrollHeight;
    }
    function say(raw) {
      const text = cleanText(raw);
      if (!text || !inRoom()) return;
      chat(S.name, playerId.shirt, text);
      event('chat', { m: text });
    }
    function openChat() {
      if (!inRoom() || S.chat || paused()) return;
      S.chat = true; E.bar.hidden = false; E.barInput.value = '';
      for (const k in keys) keys[k] = false;
      E.barInput.focus();
    }
    function closeChat() {
      if (!S.chat) return;
      S.chat = false; E.bar.hidden = true; E.barInput.blur();
    }
    E.bar.addEventListener('submit', (e) => { e.preventDefault(); say(E.barInput.value); closeChat(); });
    E.barInput.addEventListener('blur', () => setTimeout(closeChat, 0));
    // (pressing the button would take the focus from the input and close the bar before the click: keep it)
    E.bar.addEventListener('mousedown', (e) => { if (e.target !== E.barInput) e.preventDefault(); });
    $('mpSay').addEventListener('submit', (e) => { e.preventDefault(); say(E.sayInput.value); E.sayInput.value = ''; });

    /* ---------- the room sign ---------- */
    COLORS.forEach((col, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.style.background = hex(col); b.dataset.col = String(col);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', COLOR_NAMES[i]);
      b.addEventListener('click', () => { applyShirt(col); swatches(); });
      E.colors.append(b);
    });
    function swatches() { for (const b of E.colors.children) b.setAttribute('aria-checked', String(Number(b.dataset.col) === playerId.shirt)); }
    const web = /^https?:$/.test(location.protocol);
    const link = () => location.origin + location.pathname + '?rum=' + S.code + (params.get('peerserver') ? '&peerserver=' + encodeURIComponent(params.get('peerserver')) : '');
    function showSetup() { E.setup.hidden = false; E.room.hidden = true; E.name.value = S.name; swatches(); }
    function showRoom() {
      E.setup.hidden = true; E.room.hidden = false;
      E.codeBig.textContent = S.code;
      E.share.hidden = !web;
      E.codeHint.textContent = S.host ? 'Skicka koden' + (web ? ' eller länken' : '') + ' till dina vänner, så kan de gå med.' : 'Du är med i rummet, och dina vänner ser dig nu.';
      E.copy.textContent = navigator.share && isTouch ? 'Dela länken' : 'Kopiera länken';
      E.play.textContent = started ? 'Tillbaka till spelet' : 'Spela';
      renderList();
    }
    function renderList() {
      E.list.textContent = '';
      if (!inRoom()) return;
      const row = (name, col, note, P) => {
        const li = document.createElement('li'), dot = document.createElement('span'), nm = document.createElement('span');
        dot.className = 'mp-dot'; dot.style.background = hex(col); nm.textContent = name;
        li.append(dot, nm);
        if (note) { const sm = document.createElement('small'); sm.textContent = note; li.append(sm); }
        if (P) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'btn-sign small alt'; b.textContent = 'Gå till'; b.setAttribute('aria-label', 'Gå till ' + P.name);
          b.addEventListener('click', () => goTo(P));
          li.append(b);
        }
        E.list.append(li);
      };
      row(S.name, playerId.shirt, (S.host ? 'du, har rummet' : 'du') + ', version ' + VERSION.nr, null);
      for (const P of S.players.values()) row(P.name, P.look.shirt, [P.id === S.hostId ? 'har rummet' : '', otherVer(P)].filter(Boolean).join(', '), P);
      // someone on another version of the game: things may be missing or go wrong between you
      if ([...S.players.values()].some(otherVer)) {
        const li = document.createElement('li');
        li.className = 'mp-warn';
        li.textContent = 'Ni har olika versioner av spelet. Den som har en äldre version behöver hämta den nya och ladda om sidan, annars kan saker saknas eller bli fel mellan er.';
        E.list.append(li);
      }
    }
    function hud() {
      const n = S.players.size + 1;
      E.tag.textContent = inRoom() ? 'Vänner: rum ' + S.code + ', ' + n + ' spelare' : 'Spela med vänner';
      E.friends.textContent = inRoom() ? 'Vänner ' + n : 'Vänner';
    }
    function openPanel() {
      if (S.panel) return;
      if (pickerOpen) closePicker();
      if (bigmap.open) closeBigmap();
      closeChat();
      S.panel = true; E.panel.hidden = false;
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      for (const k in keys) keys[k] = false;
      joy.x = joy.y = 0;
      if (inRoom()) showRoom(); else showSetup();
      if (!isTouch) (inRoom() ? E.sayInput : S.name ? E.host : E.name).focus();
    }
    function closePanel() {
      if (!S.panel) return;
      S.panel = false; E.panel.hidden = true;
      if (E.panel.contains(document.activeElement)) document.activeElement.blur();
      if (started) requestLock();
    }
    E.host.addEventListener('click', () => hostRoom());
    $('mpJoinForm').addEventListener('submit', (e) => { e.preventDefault(); joinRoom(E.code.value); });
    E.code.addEventListener('input', () => { const v = E.code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); if (v !== E.code.value) E.code.value = v; });
    E.name.addEventListener('change', () => { S.name = cleanName(E.name.value); if (S.name) store.set('gubbe-namn', S.name); });
    E.copy.addEventListener('click', async () => {
      const url = link();
      if (navigator.share && isTouch) {
        try { await navigator.share({ title: 'Gubbe på Vägen', text: 'Spela med mig i Stockholm! Rumskod ' + S.code + '.', url }); return; } catch { /* closed, or not allowed: copy it instead */ }
      }
      try { await navigator.clipboard.writeText(url); status('Länken är kopierad. Klistra in den till dina vänner.'); } catch { status('Länken: ' + url); }
    });
    E.play.addEventListener('click', () => {
      closePanel();
      if (started) return;
      startGame();
      // just joined: start beside the one who has the room (placed first, as the game stood still behind the sign)
      update(0);
      const H = S.players.get(S.hostId);
      if (!S.host && H && H.st && Math.hypot(H.st.x - player.x, H.st.z - player.z) > 40) goTo(H);
    });
    E.leave.addEventListener('click', () => { leave(); status('Du lämnade rummet.'); });
    $('mpClose').addEventListener('click', closePanel);
    E.panel.addEventListener('click', (e) => { if (e.target === E.panel) closePanel(); });
    $('playFriends').addEventListener('click', openPanel);
    E.friends.addEventListener('pointerdown', (e) => { e.preventDefault(); openPanel(); });
    // a link with ?rum=ABCD opens the sign ready to join that room
    {
      const want = (params.get('rum') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      if (want.length === 4) {
        E.code.value = want;
        openPanel();
        status('Skriv ditt namn och tryck Gå med, så kommer du in i rum ' + want + '.');
        if (S.name && !isTouch) E.join.focus();
      }
    }
    // keys while the sign or the chat is open go to them, not to the game
    function keydown(e) {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (S.panel) { if (e.code === 'Escape' || (!typing && e.code === 'KeyP')) { e.preventDefault(); closePanel(); } return true; }
      if (S.chat) { if (e.code === 'Escape') { e.preventDefault(); closeChat(); } return true; }
      if (typing) return true;
      if (e.code === 'KeyY' && started && !e.repeat && inRoom() && !paused()) { e.preventDefault(); openChat(); return true; }
      return false;
    }
    hud();

    return {
      update, use, keydown, openPanel, closePanel, event, unride: () => unride(true),
      get ride() { return S.ride; }, get panelOpen() { return S.panel; },
      prompt() { return S.ride ? 'Kliv ur' : S.near ? 'Åk med ' + S.near.owner.name : null; },
      // a dent in your car, for the others to see
      dent(c, a) { if (c.netId) event('dent', { c: c.netId, a: a.map(r3) }); },
      drawMini(g, px, pz, u) {
        for (const P of S.players.values()) {
          if (!P.st || (P.badge && P.badge.hide)) continue;
          const c = P.car && P.car.occupant === P.ident ? P.car : null;
          let x = c ? c.x : P.person.x, z = c ? c.z : P.person.z;
          // (further off than the map reaches: on its edge, in their direction)
          const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz), R = 116;
          if (d > R) { x = px + (dx / d) * R; z = pz + (dz / d) * R; }
          g.beginPath(); g.arc(x, z, 6 * u, 0, TAU);
          g.fillStyle = hex(P.look.shirt); g.fill(); g.lineWidth = 2.2 * u; g.strokeStyle = '#ffffff'; g.stroke();
          if (P.badge && P.badge.ring) { g.beginPath(); g.arc(x, z, 10.5 * u, 0, TAU); g.lineWidth = 3 * u; g.strokeStyle = Math.floor(clock * 4) % 2 ? '#e0102e' : '#2f6bff'; g.stroke(); }
        }
      },
      drawBig(g, toX, toY, text) {
        for (const P of S.players.values()) {
          if (!P.st || (P.badge && P.badge.hide)) continue;
          const c = P.car && P.car.occupant === P.ident ? P.car : null, X = toX(c ? c.x : P.person.x), Y = toY(c ? c.z : P.person.z);
          g.beginPath(); g.arc(X, Y, 7.5, 0, TAU);
          g.fillStyle = hex(P.look.shirt); g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.stroke();
          if (P.badge && P.badge.ring) { g.beginPath(); g.arc(X, Y, 12.5, 0, TAU); g.lineWidth = 3.5; g.strokeStyle = Math.floor(clock * 4) % 2 ? '#e0102e' : '#2f6bff'; g.stroke(); }
          text((P.badge ? P.badge.text + ' ' : '') + P.name, X, Y - 16, '800 13px Overpass, sans-serif', P.badge ? P.badge.bg : '#0a5ba8');
        }
      },
      // for the games you play together (src/party.js)
      games(hooks) { gameHooks = hooks; },
      get inRoom() { return inRoom(); }, get host() { return S.host; }, get myId() { return S.myId; }, get hostId() { return S.hostId; }, get myName() { return S.name; },
      // everyone else in the room, and where you see them: in a car (its length and width) or on foot
      friends() {
        return [...S.players.values()].map((P) => {
          const st = P.st, wheel = P.car && P.car.occupant === P.ident ? P.car : null, c = st ? wheel || (st.ride ? carOf(st.ride) : null) : null;
          const at = !st ? null : c ? { x: c.x, y: 0, z: c.z, h: c.h, L: c.M.L, W: c.M.W } : { x: P.person.x, y: P.person.y, z: P.person.z, h: 0, L: 0, W: 0 };
          return { id: P.id, name: P.name, shirt: P.look.shirt, at };
        });
      },
      // their part in a game, on the sign over their head and on the maps (ring: a flashing ring round their dot; hide:
      // neither the sign nor the dot, while they hide from you)
      badge(id, text, bg, ring, hide) {
        const P = S.players.get(id);
        if (!P) return;
        P.badge = text ? { text, bg, ring: !!ring, hide: !!hide } : null;
        drawTag(P);
      },
      // a line in the chat from the game itself
      note(text) { chat('Leken', 0xf7c600, text); },
      // for the tests
      debug: { S, get players() { return [...S.players.values()]; }, hostRoom, joinRoom, leave, say, goTo, seatsOf, addPlayer, take }
    };
  })();
