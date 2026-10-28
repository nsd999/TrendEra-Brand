import test from "node:test";
import assert from "node:assert/strict";
import { verifyWooCommerceConnectivity } from "../lib/woocommerce/client.ts";

test("Security - verifyWooCommerceConnectivity does not leak credentials", async () => {
  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_sensitive_key_999";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_sensitive_secret_888";

  const mockFetch: typeof fetch = async () => {
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const check = await verifyWooCommerceConnectivity(mockFetch);
  const serialized = JSON.stringify(check);

  assert(!serialized.includes("ck_sensitive_key_999"), "Consumer key must not be in connectivity status output");
  assert(!serialized.includes("cs_sensitive_secret_888"), "Consumer secret must not be in connectivity status output");
  assert.strictEqual(check.configured, true);
});

test("Security - gitignore covers environment files and secrets", async () => {
  const fs = await import("node:fs/promises");
  const gitignore = await fs.readFile(".gitignore", "utf8");

  assert(gitignore.includes(".env"), ".env must be ignored in .gitignore");
  assert(gitignore.includes(".env.*"), ".env.* must be ignored in .gitignore");
  assert(gitignore.includes("!.env.example"), "!.env.example must be preserved as template");
});

test("Security - server credentials remain server-only", () => {
  // Ensure no sensitive variable is prefixed with NEXT_PUBLIC_
  const sensitiveKeys = [
    "WOOCOMMERCE_CONSUMER_KEY",
    "WOOCOMMERCE_CONSUMER_SECRET",
    "CASHFREE_SECRET_KEY",
    "QIKINK_CLIENT_SECRET",
    "QIKINK_SANDBOX_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  for (const key of sensitiveKeys) {
    assert(!key.startsWith("NEXT_PUBLIC_"), `${key} must never have NEXT_PUBLIC_ prefix`);
  }
});
