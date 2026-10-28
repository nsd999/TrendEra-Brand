import test from "node:test";
import assert from "node:assert/strict";
import { validateRequestedCartItems } from "../lib/woocommerce/catalogue.ts";

test("Checkout - empty cart is rejected", async () => {
  const result = await validateRequestedCartItems([]);
  assert.strictEqual(result.valid, false);
  assert.match(result.error ?? "", /Cart is empty/);
});

test("Checkout - validates items against authoritative WooCommerce catalogue", async () => {
  const mockFetch: typeof fetch = async (url) => {
    const urlStr = url.toString();
    if (urlStr.includes("/wc/v3/products")) {
      return new Response(
        JSON.stringify([
          {
            id: 101,
            name: "Classic Tee",
            slug: "classic-tee",
            type: "simple",
            status: "publish",
            price: "599.00",
            regular_price: "799.00",
            stock_status: "instock",
            stock_quantity: 10,
            manage_stock: true,
            sku: "TE-TEE-01",
            images: [],
            attributes: [],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_test";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_test";

  const result = await validateRequestedCartItems(
    [{ variantId: "101", quantity: 2 }],
    mockFetch,
  );

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.source, "woocommerce");
  assert(result.validatedItems);
  assert.strictEqual(result.validatedItems.length, 1);
  assert.strictEqual(result.validatedItems[0].unitPrice, 599);
  assert.strictEqual(result.validatedItems[0].quantity, 2);
  assert.strictEqual(result.totalAmount, 1198);
});

test("Checkout - rejects items when requested quantity exceeds available stock", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify([
        {
          id: 101,
          name: "Classic Tee",
          slug: "classic-tee",
          type: "simple",
          status: "publish",
          price: "599.00",
          stock_status: "instock",
          stock_quantity: 3,
          manage_stock: true,
          sku: "TE-TEE-01",
          images: [],
          attributes: [],
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_test";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_test";

  const result = await validateRequestedCartItems(
    [{ variantId: "101", quantity: 5 }],
    mockFetch,
  );

  assert.strictEqual(result.valid, false);
  assert.match(result.error ?? "", /Only 3 units available/);
});

test("Checkout - rejects out-of-stock items", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify([
        {
          id: 101,
          name: "Classic Tee",
          slug: "classic-tee",
          type: "simple",
          status: "publish",
          price: "599.00",
          stock_status: "outofstock",
          stock_quantity: 0,
          manage_stock: true,
          sku: "TE-TEE-01",
          images: [],
          attributes: [],
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_test";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_test";

  const result = await validateRequestedCartItems(
    [{ variantId: "101", quantity: 1 }],
    mockFetch,
  );

  assert.strictEqual(result.valid, false);
  assert.match(result.error ?? "", /currently out of stock/);
});
