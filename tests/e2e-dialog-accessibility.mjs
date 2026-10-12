import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(`${baseURL}/authorizations`, { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false), true, "dialog should receive initial focus");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false), true, "focus must remain trapped in dialog");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  const request = page.getByRole("button", { name: /打开入户智能门锁/ }).first();
  await request.focus();
  await request.click();
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await request.evaluate((element) => element === document.activeElement), true, "focus should return to the authorization request");
} finally {
  await browser.close();
}
