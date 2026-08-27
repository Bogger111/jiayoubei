import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

// 部署时通过 JIAYOUBEI_D1_ID 注入真实 D1 数据库 ID；本地开发/预览使用占位 ID，
// Miniflare 会为占位 ID 维护本地 SQLite 状态。
const JIAYOUBEI_D1_ID = process.env.JIAYOUBEI_D1_ID ?? "00000000-0000-4000-8000-000000000000";
const JIAYOUBEI_D1_NAME = process.env.JIAYOUBEI_D1_NAME ?? "jiayoubei-d1";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  // nodejs_compat 由 vinext/Cloudflare 插件自动注入；显式声明会导致重复标志错误。
  // 兼容日期固定为本地 wrangler 二进制支持的日期（云端接受更晚日期，但本地 miniflare 不接受）。
  compatibility_date: "2026-05-15",
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: JIAYOUBEI_D1_NAME,
          database_id: JIAYOUBEI_D1_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
