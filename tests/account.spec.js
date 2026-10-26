// The account (src/account.js) against a pretend Firebase: page.route answers its log-in (identitytoolkit and
// securetoken) and its Realtime Database, so the test needs no internet. Two browser contexts are two computers.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const CFG = { apiKey: 'test-key', authDomain: 'gubbe-test.firebaseapp.com', databaseURL: 'https://gubbe-test-default-rtdb.example.com' };
const ignorable = (text) => /fonts\.(googleapis|gstatic)\.com/.test(text);

// the server: accounts by e-mail, tokens, and the saves by uid
function fakeFirebase() {
  const users = {}, tokens = {}, refresh = {}, saves = {};
  let n = 0;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS' };
  const reply = (route, status, body) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const fail = (route, message) => reply(route, 400, { error: { code: 400, message } });
  const signIn = (route, uid) => {
    const t = 'tok' + ++n, r = 'ref' + n;
    tokens[t] = uid; refresh[r] = uid;
    return reply(route, 200, { localId: uid, idToken: t, refreshToken: r, expiresIn: '3600' });
  };
  async function handle(route) {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.searchParams.get('key') && url.searchParams.get('key') !== CFG.apiKey) return fail(route, 'API_KEY_INVALID');
    if (url.host === 'identitytoolkit.googleapis.com') {
      const { email, password } = JSON.parse(req.postData());
      if (url.pathname.endsWith(':signUp')) {
        if (users[email]) return fail(route, 'EMAIL_EXISTS');
        if (password.length < 6) return fail(route, 'WEAK_PASSWORD : Password should be at least 6 characters');
        users[email] = { password, uid: 'u' + Object.keys(users).length };
        return signIn(route, users[email].uid);
      }
      const u = users[email];
      if (!u || u.password !== password) return fail(route, 'INVALID_LOGIN_CREDENTIALS');
      return signIn(route, u.uid);
    }
    if (url.host === 'securetoken.googleapis.com') {
      const uid = refresh[new URLSearchParams(req.postData()).get('refresh_token')];
      if (!uid) return fail(route, 'INVALID_REFRESH_TOKEN');
      const t = 'tok' + ++n;
      tokens[t] = uid;
      return reply(route, 200, { id_token: t, refresh_token: 'ref' + n, expires_in: '3600', user_id: uid }).then(() => { refresh['ref' + n] = uid; });
    }
    // the database: saves/<uid>.json, only with that uid's token
    const m = /^\/saves\/([^/]+)\.json$/.exec(url.pathname);
    if (!m || tokens[url.searchParams.get('auth')] !== m[1]) return reply(route, 401, { error: 'Permission denied' });
    if (req.method() === 'PUT') { saves[m[1]] = JSON.parse(req.postData()); return reply(route, 200, saves[m[1]]); }
    return reply(route, 200, saves[m[1]] || null);
  }
  return { users, saves, handle };
}

// waits until cond is true on the page (it may load again on the way: the old page is marked, so it doesn't count)
async function settle(page, cond) {
  for (let i = 0; i < 900; i++) {
    try { if (await page.evaluate(`!window.oldPage && !!window.gubbeTest && (${cond})()`)) return; } catch (e) { /* (loading again) */ }
    await page.waitForTimeout(200);
  }
  throw new Error('the page never got to: ' + cond);
}
const mark = (page) => page.evaluate(() => { window.oldPage = true; });
// a computer: its own browser context (its own localStorage), the game open, and the pretend server's address
async function computer(browser, fb) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text() + ' ' + (m.location().url || ''))) errors.push('console: ' + m.text()); });
  // (no frame loop: nothing here needs the game to run, and two games drawing at once would slow everything down)
  await page.addInitScript((cfg) => { window.GUBBE_FIREBASE = cfg; window.requestAnimationFrame = () => 0; }, CFG);
  for (const host of ['https://identitytoolkit.googleapis.com/**', 'https://securetoken.googleapis.com/**', CFG.databaseURL + '/**']) await page.route(host, fb.handle);
  await page.goto(GAME, { waitUntil: 'commit' });
  await settle(page, '() => true');
  return { ctx, page, errors };
}
const fill = async (page, name, pass) => { await page.fill('#acName', name); await page.fill('#acPass', pass); };
const kassa = (page) => page.evaluate(() => JOBS.earned);

test('konto: skapa ett konto, spara, och få tillbaka allt på en annan dator', async ({ browser }) => {
  test.setTimeout(300000);
  const fb = fakeFirebase(), open = [];
  try {
  const A = await computer(browser, fb);
  open.push(A.ctx);

  // the name is the same whatever its capitals; other letters than a–z are written out
  const mail = await A.page.evaluate(() => [ACCOUNT.debug.email('Elvin'), ACCOUNT.debug.email('elvin'), ACCOUNT.debug.email('Åsa')]);
  expect(mail[0]).toBe('elvin@gubbe-test.firebaseapp.com');
  expect(mail[1]).toBe(mail[0]);
  expect(mail[2]).toBe('x.c3a57361@gubbe-test.firebaseapp.com');

  // on the first computer: some money and XP, then a new account from the start sign
  await A.page.evaluate(() => { JOBS.reward(1234); PROGRESS.gain(300); });
  const earned = await kassa(A.page);
  await A.page.click('#playAccount');
  expect(await A.page.evaluate(() => [ACCOUNT.isOpen, paused()])).toEqual([true, true]);
  await fill(A.page, 'Elvin', '123');
  await A.page.click('#acNew');
  await expect(A.page.locator('#acMsg')).toHaveText(/minst 6 tecken/);
  await fill(A.page, 'Elvin', 'hemligt1');
  await A.page.click('#acNew');
  await A.page.waitForFunction(() => ACCOUNT.debug.synced, null, { polling: 100 });
  await expect(A.page.locator('#acMsg')).toHaveText(/Kontot är skapat/);
  expect(await A.page.textContent('#acctText')).toBe('Elvin');
  const uid = fb.users['elvin@gubbe-test.firebaseapp.com'].uid;
  expect(fb.saves[uid].rev).toBe(1);
  expect(fb.saves[uid].data['gubbe-kassa']).toBe(String(earned));

  await A.page.evaluate(() => ACCOUNT.close());
  // a change goes up by itself (here at once, not in 20 seconds)
  await A.page.evaluate(() => { JOBS.reward(100); return ACCOUNT.debug.save(); });
  await expect.poll(() => fb.saves[uid].data['gubbe-kassa']).toBe(String(earned + 100));
  // nothing changed: nothing sent
  const rev = fb.saves[uid].rev;
  await A.page.evaluate(() => ACCOUNT.debug.save());
  expect(fb.saves[uid].rev).toBe(rev);

  // another computer: a wrong password, a taken name, then the right one, and the page comes back with everything
  const B = await computer(browser, fb);
  open.push(B.ctx);
  expect(await kassa(B.page)).not.toBe(earned + 100);
  await B.page.click('#playAccount');
  await fill(B.page, 'elvin', 'fel-lösen');
  await B.page.click('#acLogin');
  await expect(B.page.locator('#acMsg')).toHaveText('Fel namn eller lösenord.');
  await fill(B.page, 'ELVIN', 'vadsomhelst');
  await B.page.click('#acNew');
  await expect(B.page.locator('#acMsg')).toHaveText(/redan taget/);
  await fill(B.page, 'elvin', 'hemligt1');
  await mark(B.page);
  await B.page.click('#acLogin');
  await settle(B.page, '() => ACCOUNT.debug.synced');
  expect(await kassa(B.page)).toBe(earned + 100);
  expect(await B.page.evaluate(() => [ACCOUNT.name, PROGRESS.debug.S.xp, document.getElementById('toast').textContent])).toEqual(['Elvin', 300, expect.stringMatching(/Välkommen tillbaka/)]);

  // played on B, then the first computer opens the game again: it takes the newer save
  await B.page.evaluate(() => { JOBS.reward(500); return ACCOUNT.debug.save(); });
  await expect.poll(() => fb.saves[uid].data['gubbe-kassa']).toBe(String(earned + 600));
  expect(await A.page.evaluate(() => ACCOUNT.debug.S.rev)).toBeLessThan(fb.saves[uid].rev);
  await A.page.reload({ waitUntil: 'commit' });
  await settle(A.page, '() => ACCOUNT.debug.synced');
  expect(await kassa(A.page)).toBe(earned + 600);
  expect(await A.page.evaluate(() => ACCOUNT.debug.S.rev)).toBeGreaterThanOrEqual(fb.saves[uid].rev - 1);

  // logging out saves first, then the game starts over on that computer; the save stays on the server
  await B.page.evaluate(() => { PROGRESS.gain(50); ACCOUNT.open(); });
  await mark(B.page);
  await B.page.click('#acOut');
  await settle(B.page, '() => true');
  expect(await B.page.evaluate(() => [ACCOUNT.name, PROGRESS.debug.S.xp, localStorage.getItem('gubbe-konto'), document.getElementById('playAccount').textContent])).toEqual([null, 0, null, 'Logga in']);
  expect(JSON.parse(fb.saves[uid].data['gubbe-niva']).xp).toBe(350);

  expect(A.errors).toEqual([]);
  // (the wrong password and the taken name were answered 400, as Firebase does, and the browser says so)
  expect(B.errors.filter((e) => !/status of 400/.test(e))).toEqual([]);
  } finally { for (const c of open) await c.close(); }
});
