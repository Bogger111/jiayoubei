/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { processCareDue } from "../lib/server/care-service";
import { publicDemoGate } from "./demo-access";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PUBLIC_DEMO_MODE?: string;
  PUBLIC_DEMO_SIGNING_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async scheduled(_controller: unknown, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processCareDue());
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const gated = await publicDemoGate(request, env);
    if (gated) return gated;
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // When the hosting platform routes assets through the Worker, apply the
    // same gate. Some platforms serve public assets directly; keep public/
    // free of private data. Unknown paths belong to the application router.
    if (request.method === "GET" || request.method === "HEAD") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
