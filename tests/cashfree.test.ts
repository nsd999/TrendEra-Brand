import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createCashfreeOrder,
  verifyCashfreeWebhookSignature,
  CashfreeApiError,
} from "../lib/cashfree/client.ts";

test("Cashfree - valid webhook signature returns true", () => {
  const secret = "test_cashfree_secret_key_123456";
  const timestamp = "1729000000000";
  const rawBody = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: { order_id: "TRABC123DEF4" },
      payment: { payment_status: "SUCCESS" },
    },
  });

  const signature = createHmac("sha256", secret)
    .update(timestamp + rawBody, "utf8")
    .digest("base64");

  const valid = verifyCashfreeWebhookSignature(signature, timestamp, rawBody, secret);
  assert.strictEqual(valid, true);
});

test("Cashfree - tampered body rejects webhook signature", () => {
  const secret = "test_cashfree_secret_key_123456";
  const timestamp = "1729000000000";
  const originalBody = '{"type":"PAYMENT_SUCCESS_WEBHOOK"}';
  const tamperedBody = '{"type":"PAYMENT_SUCCESS_WEBHOOK","tampered":true}';

  const signature = createHmac("sha256", secret)
    .update(timestamp + originalBody, "utf8")
    .digest("base64");

  const valid = verifyCashfreeWebhookSignature(signature, timestamp, tamperedBody, secret);
  assert.strictEqual(valid, false);
});

test("Cashfree - invalid timestamp rejects webhook signature", () => {
  const secret = "test_cashfree_secret_key_123456";
  const timestamp = "invalid_timestamp";
  const rawBody = "{}";

  const signature = "some_signature";
  const valid = verifyCashfreeWebhookSignature(signature, timestamp, rawBody, secret);
  assert.strictEqual(valid, false);
});

test("Cashfree - validates order creation input", async () => {
  process.env.CASHFREE_APP_ID = "CF_TEST_APP";
  process.env.CASHFREE_SECRET_KEY = "CF_TEST_SECRET";
  process.env.CASHFREE_ENV = "sandbox";

  // Invalid order ID
  await assert.rejects(
    async () => {
      await createCashfreeOrder({
        order_id: "!",
        order_amount: 100,
        order_currency: "INR",
        customer_details: { customer_id: "C1", customer_phone: "9876543210" },
        order_meta: { return_url: "https://example.com" },
      });
    },
    (err: unknown) => {
      assert(err instanceof CashfreeApiError);
      assert.match(err.message, /Invalid order ID/);
      return true;
    },
  );

  // Invalid amount (negative or zero)
  await assert.rejects(
    async () => {
      await createCashfreeOrder({
        order_id: "TRVALID123",
        order_amount: -50,
        order_currency: "INR",
        customer_details: { customer_id: "C1", customer_phone: "9876543210" },
        order_meta: { return_url: "https://example.com" },
      });
    },
    (err: unknown) => {
      assert(err instanceof CashfreeApiError);
      assert.match(err.message, /Invalid order amount/);
      return true;
    },
  );

  // Unsupported currency
  await assert.rejects(
    async () => {
      await createCashfreeOrder({
        order_id: "TRVALID123",
        order_amount: 100,
        // @ts-expect-error testing invalid currency
        order_currency: "USD",
        customer_details: { customer_id: "C1", customer_phone: "9876543210" },
        order_meta: { return_url: "https://example.com" },
      });
    },
    (err: unknown) => {
      assert(err instanceof CashfreeApiError);
      assert.match(err.message, /Only INR is currently supported/);
      return true;
    },
  );

  // Invalid customer phone (not 10 digits)
  await assert.rejects(
    async () => {
      await createCashfreeOrder({
        order_id: "TRVALID123",
        order_amount: 100,
        order_currency: "INR",
        customer_details: { customer_id: "C1", customer_phone: "123" },
        order_meta: { return_url: "https://example.com" },
      });
    },
    (err: unknown) => {
      assert(err instanceof CashfreeApiError);
      assert.match(err.message, /Valid customer ID and 10-digit phone/);
      return true;
    },
  );
});

test("Cashfree - successful order creation returns session and ID", async () => {
  process.env.CASHFREE_APP_ID = "CF_TEST_APP";
  process.env.CASHFREE_SECRET_KEY = "CF_TEST_SECRET";
  process.env.CASHFREE_ENV = "sandbox";

  const mockFetch: typeof fetch = async (url, init) => {
    assert.strictEqual(init?.method, "POST");
    const headers = init?.headers as Record<string, string>;
    assert.strictEqual(headers["x-client-id"], "CF_TEST_APP");
    assert.strictEqual(headers["x-client-secret"], "CF_TEST_SECRET");

    return new Response(
      JSON.stringify({
        order_id: "TRSUCCESS123",
        order_status: "ACTIVE",
        payment_session_id: "session_mock_12345",
        order_amount: 999.0,
        order_currency: "INR",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await createCashfreeOrder(
    {
      order_id: "TRSUCCESS123",
      order_amount: 999.0,
      order_currency: "INR",
      customer_details: { customer_id: "CUST_1", customer_phone: "9876543210" },
      order_meta: { return_url: "https://trenderabrand.store/checkout/return?order_id={order_id}" },
    },
    mockFetch,
  );

  assert.strictEqual(result.order_id, "TRSUCCESS123");
  assert.strictEqual(result.payment_session_id, "session_mock_12345");
  assert.strictEqual(result.order_status, "ACTIVE");
});
