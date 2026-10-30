import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedAdmin } from "../lib/admin/auth.ts";
import { QikinkError } from "../lib/qikink/errors.ts";

test("Security - QikinkError redacts secret strings and Bearer tokens", () => {
  const secretKey = "3c806b75812e7d011fa714d601b36d8cb5588a6312de97bebd9d26b060a4c538";
  const err = new QikinkError(`Failed with secret: ${secretKey} and Bearer abc123def456token`);
  assert.equal(err.message.includes(secretKey), false);
  assert.match(err.message, /\[REDACTED\]/);
});

test("Security - Admin authorization strictly verifies Bearer token", async () => {
  process.env.QIKINK_ADMIN_API_TOKEN = "super_secret_trendera_admin_token_2026";
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  // No authorization header
  const reqNoAuth = new Request("https://trenderabrand.store/api/admin/qikink/products");
  assert.equal(await isAuthorizedAdmin(reqNoAuth), false);

  // Wrong token
  const reqWrongAuth = new Request("https://trenderabrand.store/api/admin/qikink/products", {
    headers: { Authorization: "Bearer wrong_token_value" },
  });
  assert.equal(await isAuthorizedAdmin(reqWrongAuth), false);

  // Correct token
  const reqValidAuth = new Request("https://trenderabrand.store/api/admin/qikink/products", {
    headers: { Authorization: "Bearer super_secret_trendera_admin_token_2026" },
  });
  assert.equal(await isAuthorizedAdmin(reqValidAuth), true);

  // Restore
  delete process.env.QIKINK_ADMIN_API_TOKEN;
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
});
