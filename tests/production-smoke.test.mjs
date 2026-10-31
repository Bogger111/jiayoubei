import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import test from "node:test";

const port = 3010;

async function waitForHttp(child, output) {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`production server exited early (${child.exitCode})\n${output.join("")}`);
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok) return response;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`production server did not become ready\n${output.join("")}`);
}

test("production start serves the dashboard, household hub and pinned local demos", { timeout: 45_000 }, async () => {
  const output = [];
  const windows = process.platform === "win32";
  const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = windows ? ["/d", "/s", "/c", `npm run start -- --port ${port}`] : ["run", "start", "--", "--port", String(port)];
  const child = spawn(command, args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, NO_COLOR: "1" },
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  try {
    const response = await waitForHttp(child, output);
    const html = await response.text();
    assert.match(html, /家有备/);
    const hub = await fetch(`http://localhost:${port}/home-agent`);
    assert.equal(hub.status, 200);
    assert.match(await hub.text(), /家有备/);
    const experience = await fetch(`http://localhost:${port}/experience`);
    assert.equal(experience.status, 200);
    assert.match(await experience.text(), /家有备/);
    const manifest = JSON.parse(await readFile(new URL("../third_party/manifest.json", import.meta.url), "utf8"));
    for (const entry of manifest.flatMap((project) => project.files).filter((entry) => entry.local.startsWith("public/"))) {
      const asset = await fetch(`http://localhost:${port}/${entry.local.slice(7)}`);
      assert.equal(asset.status, 200, entry.local);
      assert.deepEqual(Buffer.from(await asset.arrayBuffer()), await readFile(new URL("../" + entry.local, import.meta.url)), entry.local);
    }
    const deck = await fetch(`http://localhost:${port}/competition/`);
    assert.equal(deck.status, 200);
    assert.equal(await deck.text(), await readFile(new URL("../家有备-创客比赛.html", import.meta.url), "utf8"));
  } finally {
    if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    else child.kill("SIGTERM");
  }
});
