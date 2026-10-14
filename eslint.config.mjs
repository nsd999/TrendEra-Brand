import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals.default,
  ...nextTs.default,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
