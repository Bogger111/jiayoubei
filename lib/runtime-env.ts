import { env } from "cloudflare:workers";

export function readRuntimeEnv(key: string): string {
  const workerEnv = env as unknown as Record<string, unknown>;
  const workerValue = workerEnv[key];
  if (typeof workerValue === "string") return workerValue.trim();
  return (process.env[key] ?? "").trim();
}
