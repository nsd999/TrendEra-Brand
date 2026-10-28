import test from "node:test";
import assert from "node:assert/strict";
import {
  createQikinkOrder,
  getQikinkOrderList,
  type QikinkCreateOrderInput,
} from "../lib/qikink/client.ts";

test("Qikink - rejects invalid order numbers", async () => {
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

test("Qikink - rejects empty line items", async () => {
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

test("Qikink - order list query enforces parameter validation", async () => {
  process.env.QIKINK_SANDBOX_MODE = "false";
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

  // Re-enable sandbox
  process.env.QIKINK_SANDBOX_MODE = "true";
});

test("Qikink - order lookup blocked in sandbox mode as documented", async () => {
  process.env.QIKINK_SANDBOX_MODE = "true";

  await assert.rejects(
    async () => {
      await getQikinkOrderList({});
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /not available in the sandbox/);
      return true;
    },
  );
});
