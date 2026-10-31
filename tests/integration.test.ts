import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { inspectSupabaseConfig } from "../lib/supabase/admin.ts";
import {
  parseProductCsv,
  validateProductImportItem,
  getPresetQikinkTemplates,
} from "../lib/qikink/products.ts";
import {
  isAuthorizedAdmin,
  createAdminSessionToken,
  verifyAdminSessionToken,
  getAdminSecret,
  isRateLimited,
  recordFailedAttempt,
  clearFailedAttempts,
} from "../lib/admin/auth.ts";
import { QikinkValidationError, QikinkError } from "../lib/qikink/errors.ts";
import { verifyCashfreeWebhookSignature } from "../lib/cashfree/client.ts";
import type { QikinkProductImportItem } from "../lib/qikink/types.ts";

test("Integration 1: Supabase variable inspection identifies missing variables", () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const result = inspectSupabaseConfig();
  assert.equal(result.isConfigured, false);
  assert.equal(result.hasUrl, false);
  assert.equal(result.hasServiceRoleKey, false);
  assert.ok(result.missingVariables.includes("NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(result.missingVariables.includes("SUPABASE_SERVICE_ROLE_KEY"));

  // Restore
  if (origUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
  if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
});

test("Integration 2: Supabase variable inspection succeeds when variables configured", () => {
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origPub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  const result = inspectSupabaseConfig();
  assert.equal(result.isConfigured, true);
  assert.equal(result.hasUrl, true);
  assert.equal(result.hasPublishableKey, true);
  assert.equal(result.hasServiceRoleKey, true);
  assert.equal(result.missingVariables.length, 0);
  assert.equal(result.urlHost, "example-project.supabase.co");

  // Restore
  if (origUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
  else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (origPub) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = origPub;
  else delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("Integration 3: Product CSV parsing handles standard multi-variant products", () => {
  const csv = `Product Name,Description,Category,Image URL,Variant Label,Size,Colour,SKU,Qikink SKU,Cost Price,Selling Price
Graphic Hood,Heavy cotton hoodie,Cotton Apparels,https://example.com/h.jpg,Black / S,S,Black,TR-HOOD-BLK-S,QIK-HOOD-BLK-S,850.00,1999.00
Graphic Hood,Heavy cotton hoodie,Cotton Apparels,https://example.com/h.jpg,Black / M,M,Black,TR-HOOD-BLK-M,QIK-HOOD-BLK-M,850.00,1999.00`;

  const parsed = parseProductCsv(csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "Graphic Hood");
  assert.equal(parsed[0].variants.length, 2);
  assert.equal(parsed[0].variants[0].sku, "TR-HOOD-BLK-S");
  assert.equal(parsed[0].variants[0].qikink_sku, "QIK-HOOD-BLK-S");
  assert.equal(parsed[0].variants[0].cost_price, 850);
  assert.equal(parsed[0].variants[0].selling_price, 1999);
});

test("Integration 4: Invalid CSV rejection (header only or missing rows)", () => {
  assert.throws(
    () => parseProductCsv("Product Name,SKU,Price"),
    (err: Error) => err instanceof QikinkValidationError,
  );
});

test("Integration 5: Missing SKU rejection", () => {
  const item: QikinkProductImportItem = {
    name: "Valid Tee",
    description: "Good quality tee",
    status: "published",
    variants: [
      {
        label: "Black / S",
        sku: "",
        qikink_sku: "QIK-TEE-BLK-S",
        cost_price: 300,
        selling_price: 800,
      },
    ],
  };

  assert.throws(
    () => validateProductImportItem(item),
    (err: Error) => err.message.includes("missing a unique SKU"),
  );
});

test("Integration 6: Missing Qikink manufacturing SKU rejection", () => {
  const item: QikinkProductImportItem = {
    name: "Valid Tee",
    description: "Good quality tee",
    status: "published",
    variants: [
      {
        label: "Black / S",
        sku: "TR-TEE-BLK-S",
        qikink_sku: "",
        cost_price: 300,
        selling_price: 800,
      },
    ],
  };

  assert.throws(
    () => validateProductImportItem(item),
    (err: Error) => err.message.includes("missing Qikink SKU"),
  );
});

test("Integration 7: Duplicate variant SKU protection within product", () => {
  const item: QikinkProductImportItem = {
    name: "Duplicate Variant Tee",
    description: "Testing duplicates",
    status: "published",
    variants: [
      {
        label: "Black / S",
        sku: "TR-TEE-DUP",
        qikink_sku: "QIK-TEE-1",
        cost_price: 300,
        selling_price: 800,
      },
      {
        label: "Black / M",
        sku: "TR-TEE-DUP",
        qikink_sku: "QIK-TEE-2",
        cost_price: 300,
        selling_price: 800,
      },
    ],
  };

  assert.throws(
    () => validateProductImportItem(item),
    (err: Error) => err.message.includes("Duplicate variant SKU"),
  );
});

test("Integration 8: Price protection prevents selling price lower than Qikink cost", () => {
  const item: QikinkProductImportItem = {
    name: "Negative Margin Tee",
    description: "Should fail validation",
    status: "published",
    variants: [
      {
        label: "Black / S",
        sku: "TR-TEE-NEG",
        qikink_sku: "QIK-TEE-NEG",
        cost_price: 700,
        selling_price: 500, // Lower than cost
      },
    ],
  };

  assert.throws(
    () => validateProductImportItem(item),
    (err: Error) => err.message.includes("Price Protection Error"),
  );
});

test("Integration 9: All 4 preset candidate products pass strict validation", () => {
  const presets = getPresetQikinkTemplates();
  assert.equal(presets.length, 4);

  const expectedNames = [
    "Unisex Terry Oversized Tee",
    "Acrylic Poster",
    "BaseBall Ottoman Cap",
    "Unisex Oversized Jersey",
  ];

  for (const name of expectedNames) {
    const found = presets.find((p) => p.name === name);
    assert.ok(found, `Preset product '${name}' not found`);
    assert.doesNotThrow(() => validateProductImportItem(found!));
    assert.ok(found!.variants.length > 0);
    for (const v of found!.variants) {
      assert.ok(v.sku.length > 0);
      assert.ok(v.qikink_sku.length > 0);
      assert.ok(v.selling_price > v.cost_price);
    }
  }
});

test("Integration 10: Admin authorization rejects requests when server token is missing", async () => {
  const orig = process.env.QIKINK_ADMIN_API_TOKEN;
  delete process.env.QIKINK_ADMIN_API_TOKEN;
  delete process.env.ADMIN_SECRET_KEY;

  assert.equal(getAdminSecret(), null);
  const req = new Request("https://trenderabrand.store/api/admin/qikink/products");
  assert.equal(await isAuthorizedAdmin(req), false);

  if (orig) process.env.QIKINK_ADMIN_API_TOKEN = orig;
});

test("Integration 11: Admin session token creation and verification", () => {
  const secret = "test_admin_secret_key_trendera_12345";
  const sessionToken = createAdminSessionToken(secret);
  assert.ok(sessionToken.includes("."));
  assert.equal(verifyAdminSessionToken(sessionToken, secret), true);
  assert.equal(verifyAdminSessionToken(sessionToken, "wrong_secret"), false);
  assert.equal(verifyAdminSessionToken("corrupted.token", secret), false);
});

test("Integration 12: Admin login rate limiting", () => {
  const testIp = "192.168.1.100";
  clearFailedAttempts(testIp);

  assert.equal(isRateLimited(testIp), false);
  recordFailedAttempt(testIp);
  recordFailedAttempt(testIp);
  recordFailedAttempt(testIp);
  recordFailedAttempt(testIp);
  assert.equal(isRateLimited(testIp), false);
  recordFailedAttempt(testIp);
  assert.equal(isRateLimited(testIp), true);

  clearFailedAttempts(testIp);
  assert.equal(isRateLimited(testIp), false);
});

test("Integration 13: Cashfree webhook signature verification", () => {
  const payload = '{"order_id":"TR123456","order_amount":1499.00,"order_status":"PAID"}';
  const timestamp = "1730419200";
  const secret = "cashfree_secret_sandbox_abc123";

  const signature = createHmac("sha256", secret).update(timestamp + payload).digest("base64");

  assert.equal(verifyCashfreeWebhookSignature(signature, timestamp, payload, secret), true);
  assert.equal(verifyCashfreeWebhookSignature(signature, "tampered_timestamp", payload, secret), false);
  assert.equal(verifyCashfreeWebhookSignature(signature, timestamp, '{"tampered":true}', secret), false);
});

test("Integration 14: Error redaction removes sensitive credentials from logs", () => {
  const clientSecret = "3c806b75812e7d011fa714d601b36d8cb5588a6312de97bebd9d26b060a4c538";
  const err = new QikinkError(`API call failed: secret=${clientSecret} Bearer my_bearer_token`);
  assert.equal(err.message.includes(clientSecret), false);
  assert.ok(err.message.includes("[REDACTED]"));
});
