import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { createIsolatedAuthRuntime } from './isolated-runtime.mjs';

const code = 'Browser-Test-Code-2026';
const runtime = await createIsolatedAuthRuntime({ bindings: { AUTH_MODE: 'demo', PUBLIC_DEMO_MODE: 'bootstrap', PUBLIC_DEMO_SIGNING_KEY: 'browser-test-signing-secret-2026-123456789' } });
let server, browser;
try {
  await runtime.ready;
  const db = await runtime.getD1Database('DB');
  await db.prepare('CREATE TABLE family_settings(family_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(family_id,key))').run();
  server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const result = await runtime.dispatchFetch(`http://127.0.0.1:${server.address().port}${req.url}`, { method: req.method, headers: req.headers, body, redirect: 'manual' });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch { res.writeHead(500); res.end('test bridge failed'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext(), page = await ctx.newPage();
  await page.goto(origin + '/');
  await page.getByRole('heading', { name: '设置评委访问码' }).waitFor();
  await page.locator('#code').fill(code); await page.locator('#confirm').fill(code);
  const setup = page.waitForResponse(r => r.url().endsWith('/__demo/setup') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '设置并进入' }).click();
  assert.equal((await setup).status(), 303);
  assert.equal((await page.goto(origin + '/api/bootstrap')).status(), 200);
  await ctx.clearCookies();
  await page.goto(origin + '/');
  await page.getByRole('heading', { name: '欢迎来到家有备' }).waitFor();
  await page.locator('#code').fill('Wrong-Browser-Code-2026');
  const failed = page.waitForResponse(r => r.url().endsWith('/__demo/unlock') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '进入家有备' }).click();
  assert.equal((await failed).status(), 401);
  await page.getByRole('alert').getByText('访问码不正确，请重试。').waitFor();
  await page.locator('#code').fill(code);
  const unlock = page.waitForResponse(r => r.url().endsWith('/__demo/unlock') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '进入家有备' }).click();
  assert.equal((await unlock).status(), 303);
  assert.equal((await page.goto(origin + '/api/bootstrap')).status(), 200);
  await ctx.close();
  console.log('PASS browser form setup, wrong-code feedback, correct-code login and authorized data');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await runtime.dispose();
}
