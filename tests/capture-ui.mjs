import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const label = process.env.UI_CAPTURE_LABEL ?? "review";
const output = fileURLToPath(new URL(`../test-results/ui-${label}/`, import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const observations = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [name, route] of [["dashboard", "/"], ["events", "/events"], ["tasks", "/tasks"], ["task-detail", "/tasks/T002"], ["event-detail", "/events/E001"], ["assistant", "/ai"], ["members", "/members"], ["devices", "/devices"], ["device-detail", "/devices/D005"], ["services", "/services"], ["audit", "/audit"], ["notifications", "/notifications"], ["vision", "/cv"], ["authorization", "/authorizations"], ["settings", "/settings"], ["demo", "/demo"]]) {
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
      await page.locator("h1").first().waitFor();
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      observations.push({ name, width, status: response?.status(), url: page.url(), ...await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        heading: document.querySelector("h1")?.textContent,
      })), errors: [...errors] });
    }
    await page.close();
  }
  await writeFile(`${output}/observations.json`, JSON.stringify(observations, null, 2));
  console.log(JSON.stringify({ output, observations }));
} finally {
  await browser.close();
}
