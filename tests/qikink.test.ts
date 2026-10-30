import test from "node:test";
import assert from "node:assert/strict";
import {
  createQikinkOrder,
  getQikinkOrderList,
  getQikinkMode,
  slugify,
  validateProductImportItem,
  parseProductCsv,
  type QikinkCreateOrderInput,
  type QikinkProductImportItem,
} from "../lib/qikink/client.ts";

test("Qikink Mode Detection - respects QIKINK_ENVIRONMENT=live", () => {
  const originalEnv = process.env.QIKINK_ENVIRONMENT;
  const originalSandbox = process.env.QIKINK_SANDBOX_MODE;

  process.env.QIKINK_ENVIRONMENT = "live";
  assert.equal(getQikinkMode(), "live");

  process.env.QIKINK_ENVIRONMENT = "sandbox";
  assert.equal(getQikinkMode(), "sandbox");

  delete process.env.QIKINK_ENVIRONMENT;
  process.env.QIKINK_SANDBOX_MODE = "false";
  assert.equal(getQikinkMode(), "live");

  process.env.QIKINK_SANDBOX_MODE = "true";
  assert.equal(getQikinkMode(), "sandbox");

  // Restore
  if (originalEnv) process.env.QIKINK_ENVIRONMENT = originalEnv;
  else delete process.env.QIKINK_ENVIRONMENT;
  if (originalSandbox) process.env.QIKINK_SANDBOX_MODE = originalSandbox;
  else delete process.env.QIKINK_SANDBOX_MODE;
});

test("Qikink Order Validation - rejects invalid order numbers", async () => {
  const invalidInput: QikinkCreateOrderInput = {
    order_number: "TR_INVALID_ORDER_NUMBER_TOO_LONG_123456789",
    gateway: "Prepaid",
    total_order_value: 999,
    line_items: [{ sku: "SKU1", price: "999.00", quantity: 1, print_type_id: 1 }],
    shipping_address: {
      first_name: "Sai",
      last_name: "Dheeraj",
      address1: "Street 1",
      phone: "9876543210",
      email: "test@example.com",
      city: "Hyderabad",
      zip: "500081",
      province: "Telangana",
      country_code: "IN",
    },
  };

  await assert.rejects(
    async () => {
      await createQikinkOrder(invalidInput);
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /order number must be 1–15 letters, digits, or underscores/);
      return true;
    },
  );
});

test("Qikink Order Validation - rejects empty line items", async () => {
  const emptyItemsInput: QikinkCreateOrderInput = {
    order_number: "TRVALID123",
    gateway: "Prepaid",
    total_order_value: 999,
    line_items: [],
    shipping_address: {
      first_name: "Sai",
      last_name: "Dheeraj",
      address1: "Street 1",
      phone: "9876543210",
      email: "test@example.com",
      city: "Hyderabad",
      zip: "500081",
      province: "Telangana",
      country_code: "IN",
    },
  };

  await assert.rejects(
    async () => {
      await createQikinkOrder(emptyItemsInput);
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /At least one Qikink line item is required/);
      return true;
    },
  );
});

test("Qikink Order List Query - enforces strict parameter validation", async () => {
  const origEnv = process.env.QIKINK_ENVIRONMENT;
  process.env.QIKINK_ENVIRONMENT = "live";
  process.env.QIKINK_CLIENT_ID = "mock_client";
  process.env.QIKINK_CLIENT_SECRET = "mock_secret";

  // Invalid date format
  await assert.rejects(
    async () => {
      await getQikinkOrderList({ live_date_min: "28/10/2026" });
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /YYYY-MM-DD/);
      return true;
    },
  );

  // Invalid numeric id
  await assert.rejects(
    async () => {
      await getQikinkOrderList({ id: "abc" });
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /must be numeric/);
      return true;
    },
  );

  // Unsupported status
  await assert.rejects(
    async () => {
      await getQikinkOrderList({ status: "InvalidStatusXYZ" });
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /Unsupported Qikink order status/);
      return true;
    },
  );

  if (origEnv) process.env.QIKINK_ENVIRONMENT = origEnv;
  else delete process.env.QIKINK_ENVIRONMENT;
});

test("Qikink Price Protection - rejects selling price lower than Qikink cost", () => {
  const invalidProduct: QikinkProductImportItem = {
    name: "Test Shirt",
    description: "Sample",
    variants: [
      {
        label: "Black / S",
        sku: "TR-TEST-BLK-S",
        qikink_sku: "QIK-TEST-BLK-S",
        cost_price: 633.20,
        selling_price: 499.00, // Below cost!
      },
    ],
  };

  assert.throws(
    () => {
      validateProductImportItem(invalidProduct);
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /Price Protection Error.*cannot be lower than Qikink cost price/);
      return true;
    },
  );
});

test("Qikink Slugify - generates clean URL slugs", () => {
  assert.equal(slugify("Unisex Terry Oversized Tee"), "unisex-terry-oversized-tee");
  assert.equal(slugify("TrendEra Signature Classic Tee #01!"), "trendera-signature-classic-tee-01");
});

test("Qikink CSV Parser - parses valid CSV data into structured catalogue", () => {
  const csv = `Product Name,Description,Category,Variant Label,Size,Colour,SKU,Qikink SKU,Cost Price,Selling Price
Unisex Terry Oversized Tee,Heavyweight French Terry,Oversized Tees,Black / M,M,Black,TR-OTEE-BLK-M,TEE-OVR-BLK-M,633.20,1499.00
Unisex Terry Oversized Tee,Heavyweight French Terry,Oversized Tees,Black / L,L,Black,TR-OTEE-BLK-L,TEE-OVR-BLK-L,633.20,1499.00`;

  const parsed = parseProductCsv(csv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "Unisex Terry Oversized Tee");
  assert.equal(parsed[0].variants.length, 2);
  assert.equal(parsed[0].variants[0].sku, "TR-OTEE-BLK-M");
  assert.equal(parsed[0].variants[0].qikink_sku, "TEE-OVR-BLK-M");
  assert.equal(parsed[0].variants[0].cost_price, 633.20);
  assert.equal(parsed[0].variants[0].selling_price, 1499.00);
});

