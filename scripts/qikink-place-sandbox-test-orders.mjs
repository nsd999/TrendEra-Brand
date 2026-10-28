#!/usr/bin/env node
/**
 * Qikink Open API Sandbox 3-Order Activation Utility
 *
 * Qikink Requirement:
 * "To get approved, please place at least 3 test orders using our Sandbox API, then click 'Request Live API Credentials' again."
 *
 * Usage:
 *   node scripts/qikink-place-sandbox-test-orders.mjs <CLIENT_SECRET> [BASE_SKU]
 * Or set QIKINK_CLIENT_ID and QIKINK_SANDBOX_SECRET in your environment.
 */

import { randomBytes } from "node:crypto";

const SANDBOX_BASE = "https://sandbox.qikink.com";
const CLIENT_ID = process.env.QIKINK_CLIENT_ID?.trim() || "955328218983736";
const CLIENT_SECRET = process.argv[2] || process.env.QIKINK_SANDBOX_SECRET?.trim();
const BASE_SKU = process.argv[3] || process.env.QIKINK_SANDBOX_TEST_SKU?.trim() || "FS_RN_HS_CT_180_M_002"; // Standard Qikink Sandbox Round Neck Tee SKU

async function run() {
  console.log("=================================================");
  console.log("TrendEra — Qikink Open API Sandbox Verification");
  console.log("=================================================");
  console.log(`Target: ${SANDBOX_BASE}`);
  console.log(`Client ID: ${CLIENT_ID}`);

  if (!CLIENT_SECRET) {
    console.error("\n❌ Error: Sandbox Client Secret is missing.");
    console.log("\nTo run this script, provide your secret:");
    console.log("  node scripts/qikink-place-sandbox-test-orders.mjs <YOUR_SANDBOX_SECRET>\n");
    console.log("Or set QIKINK_SANDBOX_SECRET in your environment.\n");
    process.exit(1);
  }

  console.log("Client Secret: [CONFIGURED - REDACTED]");

  // 1. Authenticate to get Access Token
  console.log("\n1. Requesting Sandbox Access Token...");
  const form = new URLSearchParams();
  form.set("ClientId", CLIENT_ID);
  form.set("client_secret", CLIENT_SECRET);

  let token = "";
  try {
    const tokenRes = await fetch(`${SANDBOX_BASE}/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    });

    const tokenData = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenData?.Accesstoken) {
      console.error(`\n❌ Token request failed (HTTP ${tokenRes.status}):`, tokenData);
      process.exit(1);
    }

    token = tokenData.Accesstoken;
    console.log("✔ Access Token received successfully.");
  } catch (err) {
    console.error("\n❌ Connection error:", err.message);
    process.exit(1);
  }

  // 2. Submit 3 test orders
  console.log("\n2. Placing 3 Sandbox Test Orders to meet Qikink approval criteria...");
  const results = [];

  for (let i = 1; i <= 3; i++) {
    const orderNumber = `TR_SBX_${randomBytes(3).toString("hex").toUpperCase()}`;
    console.log(`\nSubmitting Order ${i}/3: ${orderNumber}...`);

    const payload = {
      order_number: orderNumber,
      qikink_shipping: "1",
      gateway: "COD",
      total_order_value: "100.00",
      line_items: [
        {
          search_from_my_products: 0,
          sku: BASE_SKU,
          quantity: "1",
          price: "100.00",
          print_type_id: "1",
        },
      ],
      shipping_address: {
        first_name: "Test",
        last_name: `Customer ${i}`,
        address1: "Plot 10, Hi-Tech City Road",
        address2: "",
        phone: "9876543210",
        email: "test@trenderabrand.store",
        city: "Hyderabad",
        zip: "500081",
        province: "Telangana",
        country_code: "IN",
      },
    };

    try {
      const orderRes = await fetch(`${SANDBOX_BASE}/api/order/create`, {
        method: "POST",
        headers: {
          ClientId: CLIENT_ID,
          Accesstoken: token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const orderData = await orderRes.json().catch(() => null);
      if (!orderRes.ok || !orderData?.order_id) {
        console.warn(`  ⚠ Order ${i} response (HTTP ${orderRes.status}):`, orderData);
        results.push({ orderNumber, success: false, error: orderData?.error || "Submission failed" });
      } else {
        console.log(`  ✔ Order ${i} accepted! Qikink Order ID: ${orderData.order_id}`);
        results.push({ orderNumber, success: true, qikinkOrderId: orderData.order_id });
      }
    } catch (err) {
      console.error(`  ❌ Order ${i} error:`, err.message);
      results.push({ orderNumber, success: false, error: err.message });
    }
  }

  console.log("\n=================================================");
  console.log("Summary of Sandbox Submissions:");
  console.log("=================================================");
  results.forEach((r, idx) => {
    if (r.success) {
      console.log(`Order ${idx + 1}: ${r.orderNumber} -> Qikink ID: ${r.qikinkOrderId} (SUCCESS)`);
    } else {
      console.log(`Order ${idx + 1}: ${r.orderNumber} -> Failed: ${r.error}`);
    }
  });

  const successfulCount = results.filter((r) => r.success).length;
  if (successfulCount >= 3) {
    console.log("\n🎉 ALL 3 SANDBOX TEST ORDERS PLACED SUCCESSFULLY!");
    console.log("👉 Next Step: Go to https://dashboard.qikink.com/integrations/open_api");
    console.log("👉 Click the orange 'Request Live API Credentials' button to get your live account approved.\n");
  } else {
    console.log(`\nPlaced ${successfulCount}/3 orders. Check SKU or credentials if any failed.`);
  }
}

run();
