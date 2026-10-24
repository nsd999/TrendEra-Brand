import test from "node:test";
import assert from "node:assert/strict";
import { validateQikinkOrderInput } from "../../lib/qikink/validation.mjs";

const validOrder = () => ({
  order_number: "TE20261024001",
  qikink_shipping: 1,
  gateway: "online",
  total_order_value: "1299.00",
  line_items: [{
    search_from_my_products: false,
    price: "1299.00",
    quantity: 1,
    sku: "Mrnhs-Bk-L",
    designs: [{
      design_code: "DESIGN01",
      width_inches: 1.5,
      height_inches: 2.4,
      placement_sku: "fr",
      design_link: "https://example.com/design.png",
    }],
  }],
  shipping_address: {
    first_name: "Test",
    last_name: "Customer",
    address1: "1 Test Road",
    phone: "9999999999",
    email: "test@example.com",
    city: "Hyderabad",
    zip: "500001",
    province: "Telangana",
    country: "India",
    country_code: "IN",
  },
});

test("accepts a valid Qikink create-order payload", () => {
  assert.equal(validateQikinkOrderInput(validOrder()), null);
});

test("rejects order numbers longer than Qikink's 15-character limit", () => {
  const order = validOrder();
  order.order_number = "TRENDERA-ORDER-2026";
  assert.match(validateQikinkOrderInput(order), /1–15 alphanumeric/);
});

test("rejects non-decimal price strings", () => {
  const order = validOrder();
  order.line_items[0].price = "₹1299";
  assert.match(validateQikinkOrderInput(order), /price must be/);
});

test("rejects invalid quantities", () => {
  const order = validOrder();
  order.line_items[0].quantity = 0;
  assert.match(validateQikinkOrderInput(order), /quantity must be/);
});

test("requires shipping address when Qikink handles shipping", () => {
  const order = validOrder();
  delete order.shipping_address;
  assert.match(validateQikinkOrderInput(order), /shipping_address is required/);
});

test("rejects non-HTTP(S) design links", () => {
  const order = validOrder();
  order.line_items[0].designs[0].design_link = "javascript:alert(1)";
  assert.match(validateQikinkOrderInput(order), /HTTP\(S\) URL/);
});

test("rejects unsupported payment gateways", () => {
  const order = validOrder();
  order.gateway = "free";
  assert.match(validateQikinkOrderInput(order), /gateway must be/);
});
