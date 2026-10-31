import { mkdir, readFile, readdir, realpath, rm } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { Miniflare } from "miniflare";
export async function createIsolatedAuthRuntime(options = {}) {
  const root = options.persistPath ?? resolve(
    tmpdir(),
    `jiayoubei-auth-${crypto.randomUUID().slice(0, 8)}`,
  );
  if (dirname(root).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !/^jiayoubei-auth-[a-f0-9]{8}$/.test(basename(root))) throw new Error("Unexpected isolated runtime path");
  await mkdir(root, { recursive: true });
  const config = JSON.parse(
    await readFile("dist/server/wrangler.json", "utf8"),
  );
  const directory = resolve("dist/server");
  const paths = (await readdir(directory, { recursive: true }))
    .filter((path) => path.endsWith(".js"))
    .sort((a, b) =>
      a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b),
    );
  const modules = await Promise.all(
    paths.map(async (path) => ({
      type: "ESModule",
      path: resolve(directory, path),
      contents: await readFile(resolve(directory, path), "utf8"),
    })),
  );
  const runtime = new Miniflare({
    modules,
    modulesRoot: directory,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    bindings: {
      ...(config.vars ?? {}),
      AUTH_MODE: "real",
      AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      AI_API_KEY: "",
      ...(options.bindings ?? {}),
    },
    d1Databases: { DB: "isolated-auth" },
    d1Persist: root,
    ...(options.r2Buckets ? {r2Buckets:options.r2Buckets,r2Persist:root} : {}),
    cf: false,
    serviceBindings: {
      ASSETS: () => new Response("Not found", { status: 404 }),
    },
  });
  let disposal;
  return {
    persistPath: root,
    ready: runtime.ready,
    dispatchFetch: runtime.dispatchFetch.bind(runtime),
    getD1Database: runtime.getD1Database.bind(runtime),
    dispose() {
      disposal ??= (async () => {
        await runtime.dispose();
        if (options.keepFiles) return;
        const actualRoot = await realpath(root);
        const actualTemp = await realpath(tmpdir());
        if (
          dirname(actualRoot).toLowerCase() !== actualTemp.toLowerCase() ||
          !/^jiayoubei-auth-[a-f0-9]{8}$/.test(basename(actualRoot))
        )
          throw new Error("Refusing to clean up an unexpected test directory");
        await rm(actualRoot, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      })();
      return disposal;
    },
  };
}
