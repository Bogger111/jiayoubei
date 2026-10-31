import assert from 'node:assert/strict';
import { createIsolatedAuthRuntime } from './isolated-runtime.mjs';

const testCode = 'Only-For-Tests-2026';
const secret = 'fixture-signing-secret-for-isolated-test-2026';
const runtime = await createIsolatedAuthRuntime({ bindings: { AUTH_MODE: 'demo', PUBLIC_DEMO_MODE: 'bootstrap', PUBLIC_DEMO_SIGNING_KEY: secret } });
const origin = 'https://demo.test';
const get = (path, headers = {}) => runtime.dispatchFetch(origin + path, { headers });
const post = (path, fields, headers = {}) => runtime.dispatchFetch(origin + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields).toString() });
const schema = 'CREATE TABLE family_settings(family_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(family_id,key))';
try {
  await runtime.ready;
  const db = await runtime.getD1Database('DB');
  await db.prepare(schema).run();
  assert.equal((await get('/api/bootstrap')).status, 401);
  assert.match(await (await get('/')).text(), /设置评委访问码/);
  assert.match(await (await get('/competition/index.html')).text(), /设置评委访问码/);
  assert.equal((await (await get('/__demo/status')).json()).configured, false);
  assert.equal((await post('/__demo/setup', { code: testCode, confirm: testCode }, { Origin: 'https://elsewhere.test' })).status, 403);
  assert.equal((await post('/__demo/setup', { code: testCode, confirm: 'mismatch' })).status, 400);
  const setup = await post('/__demo/setup', { code: testCode, confirm: testCode });
  assert.equal(setup.status, 303);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  assert.match(setup.headers.get('set-cookie'), /HttpOnly/);
  assert.match(setup.headers.get('set-cookie'), /Secure/);
  const record = await db.prepare("SELECT value FROM family_settings WHERE family_id='_jiayoubei_public_demo' AND key='access_code_v1'").first();
  assert.ok(record && !record.value.includes(testCode));
  assert.equal((await (await get('/__demo/status')).json()).configured, true);
  assert.equal((await post('/__demo/setup', { code: 'Other-Only-Test-2026', confirm: 'Other-Only-Test-2026' })).status, 404);
  assert.equal((await get('/api/bootstrap')).status, 401);
  assert.equal((await get('/api/bootstrap', { Cookie: cookie + 'tamper' })).status, 401);
  assert.equal((await get('/api/bootstrap', { Cookie: cookie })).status, 200);
  for (let i = 0; i < 8; i++) assert.equal((await post('/__demo/unlock', { code: 'Incorrect-Access-Code' }, { 'CF-Connecting-IP': '198.51.100.1' })).status, 401);
  assert.equal((await post('/__demo/unlock', { code: testCode }, { 'CF-Connecting-IP': '198.51.100.1' })).status, 429);
  const unlock = await post('/__demo/unlock', { code: testCode }, { 'CF-Connecting-IP': '198.51.100.2' });
  assert.equal(unlock.status, 303);
  assert.equal((await get('/api/bootstrap', { Cookie: unlock.headers.get('set-cookie').split(';')[0] })).status, 200);
  console.log('PASS private setup, code hashing, session authorization, tampering, origin checks and rate limit');

  const live = await createIsolatedAuthRuntime({ bindings: { AUTH_MODE: 'demo', PUBLIC_DEMO_MODE: 'enabled', PUBLIC_DEMO_SIGNING_KEY: secret } });
  try {
    await live.ready; const liveDb = await live.getD1Database('DB'); await liveDb.prepare(schema).run();
    assert.equal((await live.dispatchFetch(origin + '/')).status, 503);
    assert.equal((await live.dispatchFetch(origin + '/__demo/setup')).status, 404);
    await liveDb.prepare("INSERT INTO family_settings(family_id,key,value,updated_at) VALUES('_jiayoubei_public_demo','access_code_v1',?,datetime('now'))").bind(record.value).run();
    assert.equal((await live.dispatchFetch(origin + '/__demo/setup')).status, 404);
    assert.equal((await live.dispatchFetch(origin + '/__demo/status')).status, 404);
    assert.match(await (await live.dispatchFetch(origin + '/')).text(), /欢迎来到家有备/);
    assert.equal((await live.dispatchFetch(origin + '/api/bootstrap')).status, 401);
    const response = await live.dispatchFetch(origin + '/__demo/unlock', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: testCode }).toString() });
    assert.equal(response.status, 303);
    assert.equal((await live.dispatchFetch(origin + '/api/bootstrap', { headers: { Cookie: response.headers.get('set-cookie').split(';')[0] } })).status, 200);
    console.log('PASS public mode disables setup and admits valid visitors');
  } finally { await live.dispose(); }
} finally { await runtime.dispose(); }
