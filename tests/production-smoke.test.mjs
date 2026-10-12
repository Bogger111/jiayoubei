import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

test("production start serves the dashboard", { timeout: 45_000 }, async () => {
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
  } finally {
    if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    else child.kill("SIGTERM");
  }
});
