import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
const svg = await readFile(
  new URL("../public/favicon.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  for (const [size, name] of [
    [192, "icon-192.png"],
    [512, "icon-512.png"],
    [180, "apple-touch-icon.png"],
  ]) {
    const data = await page.evaluate(
      async ({ size, source }) => {
        const bitmap = new Image();
        bitmap.src = source;
        await bitmap.decode();
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        context.fillStyle = "#EAF1E9";
        context.fillRect(0, 0, size, size);
        context.drawImage(bitmap, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      {
        size,
        source: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      },
    );
    await writeFile(
      new URL(`../public/${name}`, import.meta.url),
      Buffer.from(data, "base64"),
    );
    console.log(`Generated ${name} (${size} × ${size}).`);
  }
} finally {
  await browser.close();
}
