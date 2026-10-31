import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/cv/wasm/**",
    "public/cv/vision_bundle.js",
    "public/integrations/vendor/**",
    "deliverables/demo/showcase.js",
    "public/showcase-offline/showcase.js",
    "test-results/**",
  ]),
]);

export default eslintConfig;
