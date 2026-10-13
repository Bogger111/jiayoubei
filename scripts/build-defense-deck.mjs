import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, "test-results/defense-assets");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const assets = {};
const base = process.env.BASE_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Capture the local demonstration application only.");
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  for (const [name, route] of [
    ["overview", "/"], ["task", "/tasks/T002"],
    ["authorization", "/authorizations"], ["vision", "/cv"],
  ]) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    await page.locator("h1").first().waitFor();
    if (name === "authorization") {
      const close = page.getByRole("button", { name: "关闭", exact: true });
      if (await close.count()) await close.click();
    }
    const mainClip = name === "task" || name === "authorization" || name === "vision"
      ? await page.locator(".page-content").evaluate(node => {
        const r = node.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, innerHeight - r.top) };
      })
      : undefined;
    const image = await page.screenshot({ type: "png", clip: mainClip, path: resolve(directory, name + ".png") });
    assets[name] = "data:image/png;base64," + image.toString("base64");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const phone = await page.screenshot({ type: "png", path: resolve(directory, "phone.png") });
  assets.phone = "data:image/png;base64," + phone.toString("base64");
} finally {
  await browser.close();
}
for (const [name, path] of [
  ["help", "presentations/assets/task-help.png"],
]) {
  assets[name] = "data:image/png;base64," + (await readFile(resolve(root, path))).toString("base64");
}
assets.logo = "data:image/svg+xml;base64," + (await readFile(resolve(root, "public/favicon.svg"))).toString("base64");
let html = await readFile(resolve(root, "presentations/defense.template.html"), "utf8");
html = html.replace(/\{\{asset:(\w+)\}\}/g, (_, name) => {
  if (!assets[name]) throw new Error("Missing presentation asset: " + name);
  return assets[name];
});
await mkdir(resolve(root, "public/defense"), { recursive: true });
await writeFile(resolve(root, "public/defense/index.html"), html);
await writeFile(resolve(root, "家有备-中期答辩.html"), html);
console.log(JSON.stringify({ slides: 19, bytes: Buffer.byteLength(html), standalone: resolve(root, "家有备-中期答辩.html"), url: base + "/defense/" }));
