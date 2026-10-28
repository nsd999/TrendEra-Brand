import test from "node:test";
import assert from "node:assert/strict";
import {
  getWooCommerceConfig,
  wooCommerceFetch,
  normalizeWooCommerceProduct,
  getWooCommerceProducts,
  createWooCommerceOrder,
  updateWooCommerceOrder,
  verifyWooCommerceConnectivity,
  WooCommerceApiError,
  type WooCommerceRawProduct,
  type WooCommerceVariation,
} from "../lib/woocommerce/client.ts";

test("WooCommerce - config validation without credentials", () => {
  const previousKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const previousSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  delete process.env.WOOCOMMERCE_CONSUMER_KEY;
  delete process.env.WOOCOMMERCE_CONSUMER_SECRET;

  const cfg = getWooCommerceConfig();
  assert.strictEqual(cfg.isConfigured, false);
  assert.strictEqual(cfg.baseUrl.startsWith("https://"), true);

  process.env.WOOCOMMERCE_CONSUMER_KEY = previousKey;
  process.env.WOOCOMMERCE_CONSUMER_SECRET = previousSecret;
});

test("WooCommerce - detects missing credentials on authenticated fetch", async () => {
  const previousKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const previousSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  delete process.env.WOOCOMMERCE_CONSUMER_KEY;
  delete process.env.WOOCOMMERCE_CONSUMER_SECRET;

  await assert.rejects(
    async () => {
      await wooCommerceFetch("/wc/v3/products", { authenticated: true });
    },
    (err: unknown) => {
      assert(err instanceof WooCommerceApiError);
      assert.strictEqual(err.code, "CONFIG_MISSING");
      assert.strictEqual(err.httpStatus, 503);
      return true;
    },
  );

  process.env.WOOCOMMERCE_CONSUMER_KEY = previousKey;
  process.env.WOOCOMMERCE_CONSUMER_SECRET = previousSecret;
});

test("WooCommerce - detects InfinityFree anti-bot challenge HTML", async () => {
  const challengeHtml = `<html><body><script type="text/javascript" src="/aes.js"></script><script>slowAES.decrypt()</script></body></html>`;
  const mockFetch: typeof fetch = async () => {
    return new Response(challengeHtml, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_test123";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_test456";

  await assert.rejects(
    async () => {
      await wooCommerceFetch("/wc/v3/products", { fetchImpl: mockFetch });
    },
    (err: unknown) => {
      assert(err instanceof WooCommerceApiError);
      assert.strictEqual(err.code, "CHALLENGE_BLOCKED");
      return true;
    },
  );
});

test("WooCommerce - handles network timeout safely", async () => {
  const mockFetch: typeof fetch = async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_test123";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_test456";

  await assert.rejects(
    async () => {
      await wooCommerceFetch("/wc/v3/products", { fetchImpl: mockFetch, timeoutMs: 100 });
    },
    (err: unknown) => {
      assert(err instanceof WooCommerceApiError);
      assert.strictEqual(err.code, "NETWORK_TIMEOUT");
      assert.strictEqual(err.httpStatus, 504);
      return true;
    },
  );
});

test("WooCommerce - handles 401 unauthorized", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ code: "woocommerce_rest_cannot_view", message: "Sorry" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_invalid";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_invalid";

  await assert.rejects(
    async () => {
      await wooCommerceFetch("/wc/v3/products", { fetchImpl: mockFetch });
    },
    (err: unknown) => {
      assert(err instanceof WooCommerceApiError);
      assert.strictEqual(err.code, "AUTH_FAILED");
      assert.strictEqual(err.httpStatus, 401);
      return true;
    },
  );
});

test("WooCommerce - successful empty catalogue returns [] without error", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_valid";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_valid";

  const products = await getWooCommerceProducts({ fetchImpl: mockFetch });
  assert(Array.isArray(products));
  assert.strictEqual(products.length, 0);
});

test("WooCommerce - normalizes simple product correctly", () => {
  const raw: WooCommerceRawProduct = {
    id: 101,
    name: "Classic TrendEra Tee",
    slug: "classic-trendera-tee",
    type: "simple",
    status: "publish",
    description: "<p>Premium oversized tee.</p>",
    short_description: "Oversized cotton tee",
    sku: "TE-TEE-01",
    price: "799.00",
    regular_price: "999.00",
    sale_price: "799.00",
    on_sale: true,
    purchasable: true,
    stock_status: "instock",
    stock_quantity: 15,
    manage_stock: true,
    images: [{ id: 1, src: "https://example.com/tee.jpg", alt: "Front view" }],
    attributes: [],
  };

  const normalized = normalizeWooCommerceProduct(raw);
  assert.strictEqual(normalized.id, "101");
  assert.strictEqual(normalized.name, "Classic TrendEra Tee");
  assert.strictEqual(normalized.price, 799);
  assert.strictEqual(normalized.regularPrice, 999);
  assert.strictEqual(normalized.inStock, true);
  assert.strictEqual(normalized.variants.length, 1);
  assert.strictEqual(normalized.variants[0].sku, "TE-TEE-01");
  assert.strictEqual(normalized.variants[0].price, 799);
});

test("WooCommerce - normalizes variable product with variations", () => {
  const raw: WooCommerceRawProduct = {
    id: 202,
    name: "TrendEra Hoodie",
    slug: "trendera-hoodie",
    type: "variable",
    status: "publish",
    description: "Cozy fleece hoodie.",
    short_description: "Fleece hoodie",
    sku: "TE-HD",
    price: "1499.00",
    regular_price: "1799.00",
    sale_price: "1499.00",
    on_sale: true,
    purchasable: true,
    stock_status: "instock",
    stock_quantity: null,
    manage_stock: false,
    images: [{ id: 10, src: "https://example.com/hoodie.jpg", alt: "Hoodie" }],
    attributes: [
      { id: 1, name: "Size", options: ["S", "M", "L"], variation: true },
      { id: 2, name: "Color", options: ["Black"], variation: true },
    ],
    variations: [301, 302],
  };

  const variations: WooCommerceVariation[] = [
    {
      id: 301,
      sku: "TE-HD-BLK-M",
      price: "1499.00",
      regular_price: "1799.00",
      sale_price: "1499.00",
      on_sale: true,
      status: "publish",
      purchasable: true,
      stock_status: "instock",
      stock_quantity: 5,
      manage_stock: true,
      attributes: [
        { id: 1, name: "Size", option: "M" },
        { id: 2, name: "Color", option: "Black" },
      ],
    },
    {
      id: 302,
      sku: "TE-HD-BLK-L",
      price: "1499.00",
      regular_price: "1799.00",
      sale_price: "1499.00",
      on_sale: true,
      status: "publish",
      purchasable: true,
      stock_status: "outofstock",
      stock_quantity: 0,
      manage_stock: true,
      attributes: [
        { id: 1, name: "Size", option: "L" },
        { id: 2, name: "Color", option: "Black" },
      ],
    },
  ];

  const normalized = normalizeWooCommerceProduct(raw, variations);
  assert.strictEqual(normalized.id, "202");
  assert.strictEqual(normalized.type, "variable");
  assert.strictEqual(normalized.variants.length, 2);

  const mVariant = normalized.variants.find((v) => v.id === "301");
  assert(mVariant);
  assert.strictEqual(mVariant.label, "M / Black");
  assert.strictEqual(mVariant.inStock, true);
  assert.strictEqual(mVariant.stockQuantity, 5);

  const lVariant = normalized.variants.find((v) => v.id === "302");
  assert(lVariant);
  assert.strictEqual(lVariant.inStock, false);
});

test("WooCommerce - order creation and status update", async () => {
  let createdPayload: unknown;
  let updatedPayload: unknown;

  const mockFetch: typeof fetch = async (url, init) => {
    const urlStr = url.toString();
    if (init?.method === "POST" && urlStr.includes("/wc/v3/orders")) {
      createdPayload = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({
          id: 5501,
          number: "5501",
          status: "pending",
          currency: "INR",
          total: "1499.00",
          billing: (createdPayload as { billing: unknown }).billing,
          shipping: (createdPayload as { shipping: unknown }).shipping,
          line_items: (createdPayload as { line_items: unknown }).line_items,
          meta_data: (createdPayload as { meta_data: unknown }).meta_data,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    if (init?.method === "PUT" && urlStr.includes("/wc/v3/orders/5501")) {
      updatedPayload = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({
          id: 5501,
          number: "5501",
          status: (updatedPayload as { status?: string })?.status || "processing",
          currency: "INR",
          total: "1499.00",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_test";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_test";

  const order = await createWooCommerceOrder(
    {
      payment_method: "cashfree",
      payment_method_title: "Cashfree Payments",
      set_paid: false,
      status: "pending",
      billing: {
        first_name: "Sai",
        last_name: "Dheeraj",
        address_1: "Street 1",
        city: "Hyderabad",
        state: "Telangana",
        postcode: "500081",
        country: "IN",
        email: "test@example.com",
        phone: "919876543210",
      },
      shipping: {
        first_name: "Sai",
        last_name: "Dheeraj",
        address_1: "Street 1",
        city: "Hyderabad",
        state: "Telangana",
        postcode: "500081",
        country: "IN",
      },
      line_items: [
        {
          product_id: 202,
          variation_id: 301,
          quantity: 1,
          price: "1499.00",
        },
      ],
      meta_data: [{ key: "_order_number", value: "TRTEST1234" }],
    },
    mockFetch,
  );

  assert.strictEqual(order.id, 5501);
  assert.strictEqual(order.status, "pending");

  const updated = await updateWooCommerceOrder(
    5501,
    {
      status: "processing",
      set_paid: true,
      transaction_id: "CF_ORDER_12345",
      meta_data: [{ key: "_qikink_order_id", value: "QIK_9999" }],
    },
    mockFetch,
  );

  assert.strictEqual(updated.status, "processing");
  assert((updatedPayload as { set_paid?: boolean })?.set_paid === true);
});

test("WooCommerce - verifyWooCommerceConnectivity reports status safely", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  process.env.WOOCOMMERCE_CONSUMER_KEY = "ck_test";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "cs_test";

  const check = await verifyWooCommerceConnectivity(mockFetch);
  assert.strictEqual(check.configured, true);
  assert.strictEqual(check.reachable, true);
  assert.strictEqual(check.authenticated, true);
  assert.strictEqual(check.catalogueCount, 0);
  assert.strictEqual(check.isChallengeBlocked, false);
});
