import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  verifyCashfreeWebhookSignature,
  createCashfreeOrder,
  CashfreeApiError,
} from "../lib/cashfree/client.ts";

test("Cashfree Webhook Signature - validates valid HMAC signatures", () => {
  const secret = "test_cashfree_secret_key_12345";
  const timestamp = "1730000000000";
  const rawBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "TR12345" } } });

  const signature = createHmac("sha256", secret).update(timestamp + rawBody, "utf8").digest("base64");
  const isValid = verifyCashfreeWebhookSignature(signature, timestamp, rawBody, secret);
  assert.equal(isValid, true);
});

test("Cashfree Webhook Signature - rejects tampered payloads", () => {
  const secret = "test_cashfree_secret_key_12345";
  const timestamp = "1730000000000";
  const rawBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "TR12345" } } });

  const signature = createHmac("sha256", secret).update(timestamp + rawBody, "utf8").digest("base64");
  const tamperedBody = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "TR67890" } } });

  const isValid = verifyCashfreeWebhookSignature(signature, timestamp, tamperedBody, secret);
  assert.equal(isValid, false);
});

test("Cashfree Order Validation - rejects invalid order ID or phone", async () => {
  process.env.CASHFREE_APP_ID = "test_app_id";
  process.env.CASHFREE_SECRET_KEY = "test_secret_key";
  process.env.CASHFREE_ENV = "sandbox";

  await assert.rejects(
    async () => {
      await createCashfreeOrder({
        order_id: "x", // too short (<3 chars)
        order_amount: 1499.00,
        order_currency: "INR",
        customer_details: { customer_id: "CUST1", customer_phone: "9876543210" },
        order_meta: { return_url: "https://example.com" },
      });
    },
    (err: unknown) => {
      assert(err instanceof CashfreeApiError);
      assert.match((err as Error).message, /Invalid order ID/);
      return true;
    },
  );

  await assert.rejects(
    async () => {
      await createCashfreeOrder({
        order_id: "TRVALID123",
        order_amount: 1499.00,
        order_currency: "INR",
        customer_details: { customer_id: "CUST1", customer_phone: "123" }, // invalid phone
        order_meta: { return_url: "https://example.com" },
      });
    },
    (err: unknown) => {
      assert(err instanceof CashfreeApiError);
      assert.match(err.message, /10-digit phone/);
      return true;
    },
  );
});
