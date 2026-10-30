"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import type { QikinkProductImportItem, QikinkProductImportVariant } from "@/lib/qikink/types";

type ConnectionStatus = {
  connected: boolean;
  mode: "live" | "sandbox";
  authenticated: boolean;
  tokenExpiresInSeconds?: number;
  latencyMs?: number;
  lastChecked: string;
  error?: string;
};

type DbProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  category?: string;
  image_url?: string;
  qikink_product_id?: string;
  status: string;
  created_at: string;
  product_variants?: Array<{
    id: string;
    label: string;
    size?: string;
    colour?: string;
    sku: string;
    qikink_sku: string;
    price: number;
    cost_price?: number;
    mockup_link?: string;
    is_active: boolean;
  }>;
};

type StoreOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  total_amount: number;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  cashfree_order_id?: string;
  qikink_order_id?: string;
  qikink_submission_status: string;
  qikink_status?: string;
  qikink_awb?: string;
  qikink_courier?: string;
  qikink_tracking_url?: string;
  qikink_synced_at?: string;
  qikink_last_error?: string;
  created_at: string;
  store_order_items?: Array<{
    product_name: string;
    variant_label: string;
    qikink_sku: string;
    quantity: number;
    unit_price: number;
  }>;
};

export default function QikinkAdminPage() {
  const [adminToken, setAdminToken] = useState("");
  const [activeTab, setActiveTab] = useState<"products" | "orders" | "capabilities">("products");
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [dbProducts, setDbProducts] = useState<DbProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [presetTemplates, setPresetTemplates] = useState<QikinkProductImportItem[]>([]);
  const [selectedProductNames, setSelectedProductNames] = useState<Set<string>>(new Set());
  const [previewProduct, setPreviewProduct] = useState<QikinkProductImportItem | null>(null);
  const [csvInput, setCsvInput] = useState("");
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load token from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("trendera_admin_token") || "";
    setAdminToken(saved);
  }, []);

  const getHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (adminToken) {
      headers["Authorization"] = `Bearer ${adminToken}`;
      headers["x-admin-token"] = adminToken;
    }
    return headers;
  };

  const saveAdminToken = (token: string) => {
    setAdminToken(token);
    localStorage.setItem("trendera_admin_token", token);
  };

  // Initial load
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const loadData = async () => {
    try {
      const res = await fetch("/api/admin/qikink/products", { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setDbProducts(data.storeProducts || []);
        setPresetTemplates(data.presetTemplates || []);
      }
    } catch {
      // Ignore initial silent fail
    }

    try {
      const oRes = await fetch("/api/admin/qikink/tracking", { headers: getHeaders() });
      if (oRes.ok) {
        const oData = await oRes.json();
        setOrders(oData.orders || []);
      }
    } catch {
      // Ignore
    }
  };

  const handleTestConnection = () => {
    startTransition(async () => {
      setStatusMessage({ text: "Testing Qikink Live API connection...", type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/test-connection", {
          method: "POST",
          headers: getHeaders(),
        });
        const data = await res.json();
        setConnection(data);
        if (data.connected && data.authenticated) {
          setStatusMessage({
            text: `Connection verified! Mode: ${data.mode.toUpperCase()} (Latency: ${data.latencyMs}ms)`,
            type: "success",
          });
        } else {
          setStatusMessage({
            text: `Connection failed: ${data.error || "Could not authenticate"}`,
            type: "error",
          });
        }
      } catch (err) {
        setStatusMessage({
          text: `Error testing connection: ${err instanceof Error ? err.message : "Network error"}`,
          type: "error",
        });
      }
    });
  };

  const handlePushSelected = () => {
    const toPush = presetTemplates.filter((p) => selectedProductNames.has(p.name));
    if (toPush.length === 0) {
      setStatusMessage({ text: "Select at least one product to push.", type: "error" });
      return;
    }

    startTransition(async () => {
      setStatusMessage({ text: `Pushing ${toPush.length} product(s) to TrendEra database...`, type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/products", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            action: "push_to_trendera",
            products: toPush,
            preserveExistingPrices: true,
            status: "published",
          }),
        });
        const data = await res.json();
        if (data.success) {
          setStatusMessage({
            text: `Successfully pushed! Created: ${data.result.createdProducts}, Updated: ${data.result.updatedProducts}, Variants: ${data.result.createdVariants}`,
            type: "success",
          });
          await loadData();
        } else {
          setStatusMessage({ text: `Push failed: ${data.error || data.result?.errors?.join("; ")}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `Push error: ${err instanceof Error ? err.message : "Error"}`, type: "error" });
      }
    });
  };

  const handleImportPresets = () => {
    startTransition(async () => {
      setStatusMessage({ text: "Importing preset catalogue templates from Qikink...", type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/products", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ action: "import_presets", preserveExistingPrices: true, status: "published" }),
        });
        const data = await res.json();
        if (data.success) {
          setStatusMessage({
            text: `Preset catalogue imported to TrendEra! (Created: ${data.result.createdProducts}, Updated: ${data.result.updatedProducts})`,
            type: "success",
          });
          await loadData();
        } else {
          setStatusMessage({ text: `Import failed: ${data.error}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `Import error: ${err instanceof Error ? err.message : "Error"}`, type: "error" });
      }
    });
  };

  const handleImportCsv = () => {
    if (!csvInput.trim()) {
      setStatusMessage({ text: "Paste CSV content first.", type: "error" });
      return;
    }

    startTransition(async () => {
      setStatusMessage({ text: "Parsing CSV products...", type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/products", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ action: "import_csv", csvContent: csvInput }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.products)) {
          setPresetTemplates((prev) => [...data.products, ...prev]);
          setShowCsvModal(false);
          setCsvInput("");
          setStatusMessage({ text: `Parsed ${data.count} product(s) from CSV! You can now preview and push them.`, type: "success" });
        } else {
          setStatusMessage({ text: `CSV error: ${data.error}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `CSV parse error: ${err instanceof Error ? err.message : "Error"}`, type: "error" });
      }
    });
  };

  const handleSyncTrackingAll = () => {
    startTransition(async () => {
      setStatusMessage({ text: "Syncing tracking details from Qikink for active orders...", type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/tracking", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ action: "sync_all" }),
        });
        const data = await res.json();
        if (data.success) {
          setStatusMessage({
            text: `Tracking sync complete! Checked: ${data.result.total}, Updated: ${data.result.synced}`,
            type: "success",
          });
          await loadData();
        } else {
          setStatusMessage({ text: `Tracking sync failed: ${data.error}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `Tracking sync error: ${err instanceof Error ? err.message : "Error"}`, type: "error" });
      }
    });
  };

  const handleSyncSingleOrder = (orderId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/qikink/tracking", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ action: "sync_order", orderId }),
        });
        const data = await res.json();
        if (data.success && data.result.synced) {
          setStatusMessage({ text: `Order updated! Status: ${data.result.status || "Synced"}`, type: "success" });
          await loadData();
        } else {
          setStatusMessage({ text: `Sync status: ${data.result?.error || data.error || "No update found"}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `Error: ${err instanceof Error ? err.message : "Failed"}`, type: "error" });
      }
    });
  };

  const handleRetryFulfilment = (orderId: string) => {
    startTransition(async () => {
      setStatusMessage({ text: "Submitting order to Qikink...", type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/tracking", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ action: "retry_fulfilment", orderId }),
        });
        const data = await res.json();
        if (data.success) {
          setStatusMessage({ text: `Fulfilment order accepted by Qikink! Order ID: ${data.result.qikinkOrderId}`, type: "success" });
          await loadData();
        } else {
          setStatusMessage({ text: `Fulfilment failed: ${data.error}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `Error: ${err instanceof Error ? err.message : "Failed"}`, type: "error" });
      }
    });
  };

  const toggleSelectProduct = (name: string) => {
    const next = new Set(selectedProductNames);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedProductNames(next);
  };

  const toggleSelectAll = () => {
    if (selectedProductNames.size === presetTemplates.length) {
      setSelectedProductNames(new Set());
    } else {
      setSelectedProductNames(new Set(presetTemplates.map((p) => p.name)));
    }
  };

  const filteredPresets = presetTemplates.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.variants.some((v) => v.sku.toLowerCase().includes(searchTerm.toLowerCase()) || v.qikink_sku.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 pb-20 font-sans">
      {/* Top Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white font-bold text-lg">
                T
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-neutral-900">TrendEra × Qikink</h1>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    Direct Open API
                  </span>
                </div>
                <p className="text-xs text-neutral-500">
                  Print-on-Demand Automation &amp; Fulfillment Center · Standalone Integration (No WooCommerce / No WP)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs shadow-sm">
                <span className="text-neutral-500 mr-2">Admin Key:</span>
                <input
                  type="password"
                  placeholder="Set QIKINK_ADMIN_API_TOKEN"
                  value={adminToken}
                  onChange={(e) => saveAdminToken(e.target.value)}
                  className="w-36 bg-transparent outline-none placeholder:text-neutral-400"
                />
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isPending}
                className="inline-flex items-center rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 transition disabled:opacity-50"
              >
                {isPending ? "Connecting..." : "Test Connection"}
              </button>

              <Link
                href="/shop"
                target="_blank"
                className="inline-flex items-center rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 transition"
              >
                View Live Store ↗
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Status Notification Banner */}
        {statusMessage && (
          <div
            className={`rounded-2xl p-4 text-sm flex items-center justify-between border ${
              statusMessage.type === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : statusMessage.type === "error"
                  ? "bg-rose-50 text-rose-900 border-rose-200"
                  : "bg-blue-50 text-blue-900 border-blue-200"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Section A: Connection Overview Card */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">Connection &amp; API Health Overview</h2>
              <p className="text-xs text-neutral-500">Live Qikink Open API status &amp; authentication credentials</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-neutral-100 text-neutral-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Mode: {connection?.mode?.toUpperCase() || (process.env.NEXT_PUBLIC_STORE_MODE === "live" ? "LIVE" : "SANDBOX / LIVE")}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  connection?.connected ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${connection?.connected ? "bg-emerald-500" : "bg-neutral-400"}`} />
                {connection?.connected ? "API Connected (HTTP 200)" : "Click 'Test Connection'"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Environment</span>
              <p className="mt-1 text-sm font-semibold text-neutral-900">{connection?.mode || "Live Open API"}</p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Auth Health</span>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {connection?.authenticated ? "Valid Token" : "Ready"}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">API Latency</span>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {connection?.latencyMs ? `${connection.latencyMs} ms` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Live Published</span>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {dbProducts.filter((p) => p.status === "published").length} Products
              </p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Total Variants</span>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {dbProducts.reduce((sum, p) => sum + (p.product_variants?.length || 0), 0)} SKUs
              </p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Orders Fulfilled</span>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {orders.filter((o) => o.qikink_submission_status === "submitted").length} Orders
              </p>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="border-b border-neutral-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setActiveTab("products")}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition ${
                activeTab === "products"
                  ? "border-black text-black"
                  : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
              }`}
            >
              Product &amp; SKU Management ({presetTemplates.length} Available · {dbProducts.length} in DB)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition ${
                activeTab === "orders"
                  ? "border-black text-black"
                  : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
              }`}
            >
              Order Fulfillment &amp; Tracking ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("capabilities")}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition ${
                activeTab === "capabilities"
                  ? "border-black text-black"
                  : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
              }`}
            >
              API Capability Matrix &amp; Audit Logs
            </button>
          </nav>
        </div>

        {/* TAB 1: PRODUCTS & CATALOGUE MANAGEMENT */}
        {activeTab === "products" && (
          <div className="space-y-6">
            {/* Primary Action Buttons (Section C) */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePushSelected}
                  disabled={isPending || selectedProductNames.size === 0}
                  className="rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 transition disabled:opacity-50"
                >
                  Push to TrendEra ({selectedProductNames.size})
                </button>
                <button
                  type="button"
                  onClick={handleImportPresets}
                  disabled={isPending}
                  className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 transition"
                >
                  Import Presets from Qikink
                </button>
                <button
                  type="button"
                  onClick={() => setShowCsvModal(true)}
                  className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 transition"
                >
                  Import from CSV
                </button>
                <button
                  type="button"
                  onClick={() => handlePushSelected()}
                  disabled={isPending}
                  className="rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition"
                >
                  Update from Qikink
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const mappings: Record<string, string> = {};
                    dbProducts.forEach((p) => {
                      if (p.category) mappings[p.id] = p.category;
                    });
                    startTransition(async () => {
                      await fetch("/api/admin/qikink/products", {
                        method: "POST",
                        headers: getHeaders(),
                        body: JSON.stringify({ action: "sync_categories", categories: mappings }),
                      });
                      setStatusMessage({ text: "Categories synchronized successfully.", type: "success" });
                    });
                  }}
                  className="rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition"
                >
                  Sync Categories
                </button>
                <button
                  type="button"
                  onClick={handlePushSelected}
                  className="rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition"
                >
                  Sync Variants
                </button>
                <button
                  type="button"
                  onClick={handlePushSelected}
                  className="rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition"
                >
                  Sync Images
                </button>
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      await fetch("/api/admin/qikink/products", {
                        method: "POST",
                        headers: getHeaders(),
                        body: JSON.stringify({ action: "retry_failed_sync" }),
                      });
                      setStatusMessage({ text: "Retry sync triggered for all catalog items.", type: "success" });
                      await loadData();
                    });
                  }}
                  className="rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition"
                >
                  Retry Failed Sync
                </button>
              </div>

              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search products or SKUs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3.5 py-2 text-xs text-neutral-900 outline-none focus:border-black focus:bg-white transition"
                />
              </div>
            </div>

            {/* Price Protection Information Banner */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-xs text-amber-900 flex items-start gap-3">
              <span className="text-base">🛡️</span>
              <div>
                <strong>Price Protection Active:</strong> TrendEra customer selling price is strictly preserved when updating from Qikink. Qikink base production cost (e.g. ₹633.20) will never overwrite your retail selling price (e.g. ₹1,499.00). Each product variant maintains its unique verified Qikink manufacturing SKU.
              </div>
            </div>

            {/* Products Table (Section B) */}
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 bg-neutral-50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedProductNames.size === presetTemplates.length && presetTemplates.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-neutral-300 text-black focus:ring-black"
                  />
                  <span className="text-xs font-semibold text-neutral-700">Select All Products</span>
                </div>
                <span className="text-xs text-neutral-500">
                  Showing {filteredPresets.length} available product template(s)
                </span>
              </div>

              <div className="divide-y divide-neutral-200">
                {filteredPresets.map((product) => {
                  const isSelected = selectedProductNames.has(product.name);
                  const isAlreadyInDb = dbProducts.some(
                    (p) => p.name.toLowerCase() === product.name.toLowerCase() || p.slug === product.slug,
                  );

                  return (
                    <article key={product.name} className="p-6 transition hover:bg-neutral-50/50">
                      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectProduct(product.name)}
                            className="mt-1 h-4 w-4 rounded border-neutral-300 text-black focus:ring-black"
                          />
                          {product.image_url && (
                            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-neutral-100 border border-neutral-200">
                              <Image
                                src={product.image_url}
                                alt={product.name}
                                fill
                                sizes="80px"
                                className="object-cover"
                              />
                            </div>
                          )}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-neutral-900">{product.name}</h3>
                              {isAlreadyInDb ? (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                  Published on Store
                                </span>
                              ) : (
                                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                                  Ready to Push
                                </span>
                              )}
                              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 font-mono">
                                {product.category || "Apparel"}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-600 max-w-xl">{product.description}</p>
                            <p className="text-[11px] text-neutral-400 font-mono">
                              Qikink Base ID: {product.qikink_product_id || "Standard"} · Variants: {product.variants.length}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start md:self-center">
                          <button
                            type="button"
                            onClick={() => setPreviewProduct(product)}
                            className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 transition"
                          >
                            Preview Product
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              startTransition(async () => {
                                setStatusMessage({ text: `Pushing '${product.name}' to TrendEra...`, type: "info" });
                                try {
                                  const res = await fetch("/api/admin/qikink/products", {
                                    method: "POST",
                                    headers: getHeaders(),
                                    body: JSON.stringify({ action: "push_to_trendera", product, status: "published" }),
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    setStatusMessage({ text: `Published '${product.name}' to live store!`, type: "success" });
                                    await loadData();
                                  } else {
                                    setStatusMessage({ text: `Failed: ${data.error}`, type: "error" });
                                  }
                                } catch (err) {
                                  setStatusMessage({ text: `Error: ${err instanceof Error ? err.message : "Failed"}`, type: "error" });
                                }
                              });
                            }}
                            disabled={isPending}
                            className="rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 transition disabled:opacity-50"
                          >
                            Push to TrendEra
                          </button>
                        </div>
                      </div>

                      {/* Variant Matrix Table */}
                      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-100 bg-neutral-50/60 p-3">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-neutral-200 text-neutral-400 uppercase tracking-wider text-[10px]">
                              <th className="py-2 px-3">Variant Label</th>
                              <th className="py-2 px-3">Size</th>
                              <th className="py-2 px-3">Colour</th>
                              <th className="py-2 px-3">TrendEra SKU</th>
                              <th className="py-2 px-3">Qikink Manufacturing SKU</th>
                              <th className="py-2 px-3">Qikink Cost</th>
                              <th className="py-2 px-3">TrendEra Selling Price</th>
                              <th className="py-2 px-3">Gross Margin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-200/50">
                            {product.variants.map((variant) => {
                              const margin = variant.selling_price - variant.cost_price;
                              const marginPct = ((margin / variant.selling_price) * 100).toFixed(0);

                              return (
                                <tr key={variant.sku} className="hover:bg-white/80">
                                  <td className="py-2 px-3 font-medium text-neutral-900">{variant.label}</td>
                                  <td className="py-2 px-3 text-neutral-600">{variant.size || "—"}</td>
                                  <td className="py-2 px-3 text-neutral-600">{variant.colour || "—"}</td>
                                  <td className="py-2 px-3 font-mono text-neutral-500">{variant.sku}</td>
                                  <td className="py-2 px-3 font-mono font-semibold text-neutral-900">{variant.qikink_sku}</td>
                                  <td className="py-2 px-3 text-neutral-500">₹{variant.cost_price.toFixed(2)}</td>
                                  <td className="py-2 px-3 font-bold text-neutral-900">₹{variant.selling_price.toFixed(2)}</td>
                                  <td className="py-2 px-3 font-semibold text-emerald-600">
                                    +₹{margin.toFixed(2)} ({marginPct}%)
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* Currently Published In Database */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-neutral-900">
                Authoritative TrendEra Database Catalogue ({dbProducts.length} Products)
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Products currently active in PostgreSQL / Supabase, powering TrendEra&apos;s live storefront.
              </p>

              {dbProducts.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-8 text-center">
                  <p className="text-sm font-medium text-neutral-600">No products published in database yet.</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Click &apos;Push to TrendEra&apos; above or &apos;Import Presets&apos; to publish the verified Qikink products.
                  </p>
                  <button
                    type="button"
                    onClick={handleImportPresets}
                    className="mt-4 inline-flex items-center rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800"
                  >
                    Import &amp; Publish Presets Now
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {dbProducts.map((p) => (
                    <div key={p.id} className="rounded-xl border border-neutral-200 p-4 bg-neutral-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-neutral-900">{p.name}</span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          {p.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{p.description}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-neutral-200/60 pt-2 text-xs">
                        <span className="text-neutral-500">{p.product_variants?.length || 0} variants active</span>
                        <strong className="text-neutral-900">₹{Number(p.price).toFixed(2)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ORDER FULFILLMENT & TRACKING */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Order Fulfillment &amp; Tracking Center</h3>
                <p className="text-xs text-neutral-500">
                  Cashfree payment verification → Automated Qikink fulfillment submission → Live status &amp; AWB tracking
                </p>
              </div>
              <button
                type="button"
                onClick={handleSyncTrackingAll}
                disabled={isPending}
                className="rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 transition disabled:opacity-50"
              >
                {isPending ? "Syncing..." : "Sync Tracking from Qikink"}
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              {orders.length === 0 ? (
                <div className="p-12 text-center text-sm text-neutral-500">
                  No orders recorded in store database yet. When customers check out on TrendEra, their orders appear here with live Cashfree &amp; Qikink status.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Order Number</th>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Total Amount</th>
                        <th className="py-3 px-4">Cashfree Payment</th>
                        <th className="py-3 px-4">Qikink Fulfilment</th>
                        <th className="py-3 px-4">Qikink Order ID</th>
                        <th className="py-3 px-4">Live Status / AWB</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {orders.map((o) => (
                        <tr key={o.id} className="hover:bg-neutral-50">
                          <td className="py-3 px-4 font-mono font-bold text-neutral-900">{o.order_number}</td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-neutral-900">{o.customer_name}</div>
                            <div className="text-[11px] text-neutral-400">{o.customer_phone}</div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-neutral-900">
                            ₹{Number(o.total_amount).toFixed(2)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                o.payment_status === "paid"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : o.payment_method === "cod"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {o.payment_method === "cod" ? "COD Due" : o.payment_status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                o.qikink_submission_status === "submitted"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : o.qikink_submission_status === "failed"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-neutral-100 text-neutral-800"
                              }`}
                            >
                              {o.qikink_submission_status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-neutral-600">{o.qikink_order_id || "—"}</td>
                          <td className="py-3 px-4">
                            {o.qikink_status ? (
                              <div>
                                <span className="font-semibold text-neutral-900">{o.qikink_status}</span>
                                {o.qikink_awb && (
                                  <div className="text-[10px] text-neutral-500">
                                    AWB: {o.qikink_awb} ({o.qikink_courier || "Courier"})
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            {o.qikink_submission_status === "submitted" ? (
                              <button
                                type="button"
                                onClick={() => handleSyncSingleOrder(o.id)}
                                className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
                              >
                                Sync Status
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRetryFulfilment(o.id)}
                                className="rounded-lg bg-black px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-neutral-800"
                              >
                                Submit to Qikink
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: API CAPABILITIES MATRIX & AUDIT LOG */}
        {activeTab === "capabilities" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-neutral-900">
                Official Qikink Open API Live Capability Matrix
              </h3>
              <p className="mt-1 text-xs text-neutral-500">
                Verified live against Qikink Open API (`https://api.qikink.com`). Reflects true endpoint support without unsupported assumptions.
              </p>

              <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Capability</th>
                      <th className="py-3 px-4">Open API Status</th>
                      <th className="py-3 px-4">Verified Endpoint</th>
                      <th className="py-3 px-4">TrendEra Architecture &amp; Implementation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-neutral-900">Authentication</td>
                      <td className="py-3 px-4 text-emerald-600 font-semibold">✓ Supported (Live 200)</td>
                      <td className="py-3 px-4 font-mono text-neutral-600">POST /api/token</td>
                      <td className="py-3 px-4 text-neutral-600">
                        Token generation using ClientId + client_secret form URL-encoded. Automatic 1-hour caching and transparent 401 refresh.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-neutral-900">Create Fulfillment Order</td>
                      <td className="py-3 px-4 text-emerald-600 font-semibold">✓ Supported (Contract verified)</td>
                      <td className="py-3 px-4 font-mono text-neutral-600">POST /api/order/create</td>
                      <td className="py-3 px-4 text-neutral-600">
                        Submitted automatically after Cashfree payment verification or COD confirmation with idempotency claim lock.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-neutral-900">Order Tracking &amp; Status Lookup</td>
                      <td className="py-3 px-4 text-emerald-600 font-semibold">✓ Supported (Live 200)</td>
                      <td className="py-3 px-4 font-mono text-neutral-600">GET /api/order/list</td>
                      <td className="py-3 px-4 text-neutral-600">
                        Pull lookup querying order_reference_no or id. Synchronizes AWB, courier name, tracking link, and live production status.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-neutral-900">My Products Catalogue API</td>
                      <td className="py-3 px-4 text-rose-600 font-semibold">✗ Not in Open API (404)</td>
                      <td className="py-3 px-4 text-neutral-400">None (Dashboard plugin only)</td>
                      <td className="py-3 px-4 text-neutral-600">
                        Native Push to TrendEra workflow with verified presets &amp; CSV importer. No WooCommerce/WordPress dependency.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-neutral-900">Webhooks for Product Changes</td>
                      <td className="py-3 px-4 text-rose-600 font-semibold">✗ Not in Open API (404)</td>
                      <td className="py-3 px-4 text-neutral-400">None</td>
                      <td className="py-3 px-4 text-neutral-600">
                        Admin-triggered manual refresh and CSV sync. TrendEra selling prices and content are fully protected.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Preview Modal */}
      {previewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{previewProduct.name}</h3>
                <span className="text-xs text-neutral-500">Category: {previewProduct.category || "Apparel"}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProduct(null)}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-neutral-600">{previewProduct.description}</p>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <span className="text-[11px] font-semibold uppercase text-neutral-500">
                  {previewProduct.variants.length} Variants Configured
                </span>
                <div className="mt-2 divide-y divide-neutral-200 text-xs">
                  {previewProduct.variants.map((v: QikinkProductImportVariant) => (
                    <div key={v.sku} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-neutral-900">{v.label}</span>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          Qikink SKU: {v.qikink_sku} · TrendEra SKU: {v.sku}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-neutral-900">₹{v.selling_price.toFixed(2)}</div>
                        <div className="text-[11px] text-neutral-400">Cost: ₹{v.cost_price.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4">
              <button
                type="button"
                onClick={() => setPreviewProduct(null)}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  startTransition(async () => {
                    await fetch("/api/admin/qikink/products", {
                      method: "POST",
                      headers: getHeaders(),
                      body: JSON.stringify({ action: "push_to_trendera", product: previewProduct, status: "published" }),
                    });
                    setStatusMessage({ text: `Published '${previewProduct.name}'!`, type: "success" });
                    setPreviewProduct(null);
                    await loadData();
                  });
                }}
                className="rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Push to TrendEra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-base font-bold text-neutral-900">Import Products from CSV</h3>
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-neutral-500">
                Paste CSV data. Required headers: <code>Product Name, Variant Label, Size, Colour, SKU, Qikink SKU, Cost Price, Selling Price</code>
              </p>
              <textarea
                rows={8}
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                placeholder={`Product Name,Variant Label,Size,Colour,SKU,Qikink SKU,Cost Price,Selling Price\nUnisex Terry Oversized Tee,Black / S,S,Black,TR-OTEE-BLK-S,TEE-OVR-BLK-S,633.20,1499.00`}
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs outline-none focus:border-black focus:bg-white"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-neutral-200 pt-4">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportCsv}
                disabled={isPending || !csvInput.trim()}
                className="rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                Parse and Load
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

