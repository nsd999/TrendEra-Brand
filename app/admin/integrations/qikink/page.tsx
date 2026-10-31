"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import type { QikinkProductImportItem } from "@/lib/qikink/types";

type TabId =
  | "overview"
  | "connection"
  | "import"
  | "catalogue"
  | "variants"
  | "categories"
  | "fulfillment"
  | "tracking"
  | "history"
  | "diagnostics";

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
    width_inches?: number | string | null;
    height_inches?: number | string | null;
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

type SyncLog = {
  id: string;
  sync_type: string;
  status: string;
  items_count: number;
  details: Record<string, unknown>;
  error_message?: string;
  created_at: string;
};

type DiagnosticItem = {
  name: string;
  status: string;
  healthy: boolean;
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
  remediation?: string;
};

type DiagnosticsResponse = {
  timestamp: string;
  allHealthy: boolean;
  checks: Record<string, DiagnosticItem>;
};

export default function QikinkAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [dbProducts, setDbProducts] = useState<DbProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [presetTemplates, setPresetTemplates] = useState<QikinkProductImportItem[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [selectedProductNames, setSelectedProductNames] = useState<Set<string>>(new Set());
  const [csvInput, setCsvInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch("/api/admin/auth/status");
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
      if (data.authenticated) {
        loadData();
      }
    } catch {
      setIsAuthenticated(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        setPasscodeInput("");
        loadData();
      } else {
        setLoginError(data.error || "Authentication failed.");
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Network error.");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      setIsAuthenticated(false);
      setStatusMessage({ text: "Logged out successfully.", type: "info" });
    } catch {
      setIsAuthenticated(false);
    }
  };

  const loadData = async () => {
    try {
      const pRes = await fetch("/api/admin/qikink/products");
      if (pRes.ok) {
        const pData = await pRes.json();
        setDbProducts(pData.storeProducts || []);
        setPresetTemplates(pData.presetTemplates || []);
        setSyncLogs(pData.recentLogs || []);
        if (pData.configurationError) {
          setConfigError(pData.configurationError);
        } else {
          setConfigError(null);
        }
      }
    } catch {
      // Handled silently
    }

    try {
      const oRes = await fetch("/api/admin/qikink/tracking");
      if (oRes.ok) {
        const oData = await oRes.json();
        setOrders(oData.orders || []);
      }
    } catch {
      // Handled silently
    }
  };

  const runDiagnostics = () => {
    startTransition(async () => {
      setStatusMessage({ text: "Executing comprehensive 11-point system probe...", type: "info" });
      try {
        const res = await fetch("/api/admin/diagnostics");
        const data = (await res.json()) as DiagnosticsResponse;
        setDiagnostics(data);
        if (data.allHealthy) {
          setStatusMessage({ text: "All 11 diagnostic checks passed successfully!", type: "success" });
        } else {
          setStatusMessage({
            text: "Diagnostics complete: Issues detected. Review the Diagnostics tab for remediation instructions.",
            type: "error",
          });
        }
      } catch (err) {
        setStatusMessage({ text: `Diagnostic execution error: ${err instanceof Error ? err.message : "Failed"}`, type: "error" });
      }
    });
  };

  const handleTestConnection = () => {
    startTransition(async () => {
      setStatusMessage({ text: "Testing Qikink Live API connection...", type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/test-connection", { method: "POST" });
        const data = await res.json();
        setConnection(data);
        if (data.connected && data.authenticated) {
          setStatusMessage({
            text: `Qikink API active! Mode: ${data.mode.toUpperCase()} (Latency: ${data.latencyMs ?? 0}ms)`,
            type: "success",
          });
        } else {
          setStatusMessage({
            text: `Qikink connection failed: ${data.error || "Authentication probe failed"}`,
            type: "error",
          });
        }
      } catch (err) {
        setStatusMessage({
          text: `Qikink probe error: ${err instanceof Error ? err.message : "Network error"}`,
          type: "error",
        });
      }
    });
  };

  const handlePushSelected = () => {
    const toPush = presetTemplates.filter((p) => selectedProductNames.has(p.name));
    if (toPush.length === 0) {
      setStatusMessage({ text: "Select at least one product to publish.", type: "error" });
      return;
    }

    startTransition(async () => {
      setStatusMessage({ text: `Publishing ${toPush.length} product(s) to TrendEra catalogue...`, type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
            text: `Successfully published! Created: ${data.result.createdProducts}, Updated: ${data.result.updatedProducts}, Variants: ${data.result.createdVariants}`,
            type: "success",
          });
          await loadData();
        } else {
          setStatusMessage({
            text: `Publication failed: ${data.error || data.result?.errors?.join("; ") || "Unknown error"}`,
            type: "error",
          });
        }
      } catch (err) {
        setStatusMessage({ text: `Publish error: ${err instanceof Error ? err.message : "Error"}`, type: "error" });
      }
    });
  };

  const handlePushSingle = (product: QikinkProductImportItem) => {
    startTransition(async () => {
      setStatusMessage({ text: `Publishing '${product.name}' to TrendEra catalogue...`, type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "push_to_trendera",
            product,
            preserveExistingPrices: true,
            status: "published",
          }),
        });
        const data = await res.json();
        if (data.success && data.result) {
          const v = data.result;
          setStatusMessage({
            text: `Verified database write! '${v.name}' published (${v.validSkusCount}/${v.variantsCount} verified SKUs).`,
            type: "success",
          });
          await loadData();
        } else {
          setStatusMessage({ text: `Publication failed: ${data.error || "Database rejection"}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `Publication error: ${err instanceof Error ? err.message : "Error"}`, type: "error" });
      }
    });
  };

  const handleParseCsv = () => {
    if (!csvInput.trim()) {
      setStatusMessage({ text: "Please paste CSV content first.", type: "error" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/qikink/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "import_csv", csvContent: csvInput }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.products)) {
          setPresetTemplates((prev) => [...data.products, ...prev]);
          setCsvInput("");
          setStatusMessage({
            text: `Successfully parsed and validated ${data.count} product(s) from CSV! You can now review and publish them.`,
            type: "success",
          });
          setActiveTab("catalogue");
        } else {
          setStatusMessage({ text: `CSV validation error: ${data.error}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `CSV parsing error: ${err instanceof Error ? err.message : "Error"}`, type: "error" });
      }
    });
  };

  const handleSyncTrackingAll = () => {
    startTransition(async () => {
      setStatusMessage({ text: "Syncing tracking details from Qikink for all active orders...", type: "info" });
      try {
        const res = await fetch("/api/admin/qikink/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        setStatusMessage({ text: `Tracking error: ${err instanceof Error ? err.message : "Error"}`, type: "error" });
      }
    });
  };

  const handleSyncSingleOrder = (orderId: string) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/qikink/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync_order", orderId }),
        });
        const data = await res.json();
        if (data.success && data.result.synced) {
          setStatusMessage({ text: `Order updated! Status: ${data.result.status || "Synced"}`, type: "success" });
          await loadData();
        } else {
          setStatusMessage({ text: `Sync note: ${data.result?.error || data.error || "No update found"}`, type: "error" });
        }
      } catch (err) {
        setStatusMessage({ text: `Sync error: ${err instanceof Error ? err.message : "Failed"}`, type: "error" });
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedProductNames.size === presetTemplates.length) {
      setSelectedProductNames(new Set());
    } else {
      setSelectedProductNames(new Set(presetTemplates.map((p) => p.name)));
    }
  };

  const toggleSelectProduct = (name: string) => {
    const next = new Set(selectedProductNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelectedProductNames(next);
  };

  const filteredPresets = presetTemplates.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.variants.some((v) => v.sku.toLowerCase().includes(searchTerm.toLowerCase()) || v.qikink_sku.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  // Unauthenticated screen
  if (isAuthenticated === false) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#f7f7f7] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#202020] bg-[#0d0d0d] p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black font-extrabold text-lg">
              T
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">TrendEra Admin</h1>
              <p className="text-xs text-neutral-400">Qikink Integration &amp; Fulfillment Portal</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-neutral-400 font-semibold mb-2">
                Admin Passcode
              </label>
              <input
                type="password"
                placeholder="Enter server admin passcode"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                className="w-full rounded-xl border border-[#292929] bg-[#141414] px-4 py-3 text-sm text-white placeholder-neutral-500 focus:border-white focus:outline-none transition"
                autoFocus
              />
            </div>

            {loginError && (
              <div className="rounded-xl border border-rose-900/50 bg-rose-950/40 p-3 text-xs text-rose-300">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || !passcodeInput.trim()}
              className="w-full rounded-xl bg-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-black hover:bg-neutral-200 transition disabled:opacity-50 cursor-pointer"
            >
              Unlock Dashboard
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-neutral-500">
            Protected by server-side HMAC session cookies. Configured via QIKINK_ADMIN_API_TOKEN.
          </p>
        </div>
      </main>
    );
  }

  // Loading state
  if (isAuthenticated === null) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#f7f7f7] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <p className="text-xs text-neutral-400 tracking-wider uppercase font-semibold">Verifying session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-[#f7f7f7] pb-24 font-sans selection:bg-neutral-800">
      {/* Top Header */}
      <header className="border-b border-[#202020] bg-[#0a0a0a]/90 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black font-extrabold text-base">
                T
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold tracking-tight text-white">TrendEra × Qikink</h1>
                  <span className="rounded-full bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                    Direct Open API
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Custom Architecture · Standalone Integration (No WooCommerce / No WP)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={runDiagnostics}
                disabled={isPending}
                className="inline-flex items-center rounded-xl border border-[#333] bg-[#141414] px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-[#1a1a1a] hover:border-neutral-400 transition cursor-pointer"
              >
                Run Diagnostics ⚙
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isPending}
                className="inline-flex items-center rounded-xl bg-white px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Probing..." : "Test Connection"}
              </button>

              <Link
                href="/shop"
                target="_blank"
                className="inline-flex items-center rounded-xl border border-[#333] bg-[#141414] px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-[#1a1a1a] transition"
              >
                View Store ↗
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center rounded-xl border border-neutral-800 bg-transparent px-3 py-2 text-xs text-neutral-400 hover:text-white hover:border-neutral-600 transition cursor-pointer"
                title="Lock session"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-4 flex gap-1 overflow-x-auto border-t border-[#1a1a1a] pt-2 scrollbar-none">
            {[
              { id: "overview", label: "1. Overview" },
              { id: "connection", label: "2. Qikink Connection" },
              { id: "import", label: "3. Product Import" },
              { id: "catalogue", label: "4. Catalogue" },
              { id: "variants", label: "5. Variants & SKUs" },
              { id: "categories", label: "6. Categories" },
              { id: "fulfillment", label: "7. Order Fulfillment" },
              { id: "tracking", label: "8. Tracking" },
              { id: "history", label: "9. Sync History" },
              { id: "diagnostics", label: "10. Diagnostics" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-white text-black"
                    : "text-neutral-400 hover:text-white hover:bg-[#151515]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Status Notification Banner */}
        {statusMessage && (
          <div
            className={`rounded-xl p-4 text-xs flex items-center justify-between border ${
              statusMessage.type === "success"
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60"
                : statusMessage.type === "error"
                  ? "bg-rose-950/40 text-rose-300 border-rose-800/60"
                  : "bg-blue-950/40 text-blue-300 border-blue-800/60"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-xs opacity-70 hover:opacity-100 cursor-pointer ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* Configuration Error Banner */}
        {configError && (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-300 flex items-start justify-between">
            <div>
              <strong className="font-semibold block mb-1">Configuration Required:</strong>
              <p>{configError}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("diagnostics")}
              className="text-[11px] underline ml-4 hover:text-white cursor-pointer"
            >
              View Diagnostics →
            </button>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-5">
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">Store Catalogue</span>
                <div className="mt-2 text-2xl font-bold text-white">{dbProducts.length}</div>
                <p className="mt-1 text-xs text-neutral-500">Products saved in Supabase database</p>
              </div>

              <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-5">
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">Published Live</span>
                <div className="mt-2 text-2xl font-bold text-emerald-400">
                  {dbProducts.filter((p) => p.status === "published").length}
                </div>
                <p className="mt-1 text-xs text-neutral-500">Active products visible on /shop</p>
              </div>

              <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-5">
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">Ready Candidates</span>
                <div className="mt-2 text-2xl font-bold text-white">{presetTemplates.length}</div>
                <p className="mt-1 text-xs text-neutral-500">Preset Qikink templates verified</p>
              </div>

              <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-5">
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">Customer Orders</span>
                <div className="mt-2 text-2xl font-bold text-white">{orders.length}</div>
                <p className="mt-1 text-xs text-neutral-500">Total recorded store orders</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handlePushSelected}
                  disabled={isPending || selectedProductNames.size === 0}
                  className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
                >
                  Publish Selected ({selectedProductNames.size})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedProductNames(new Set(presetTemplates.map((p) => p.name)));
                    setActiveTab("catalogue");
                  }}
                  className="rounded-xl border border-[#333] bg-[#141414] px-4 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-[#1a1a1a] transition cursor-pointer"
                >
                  Select All Candidate Products
                </button>

                <button
                  type="button"
                  onClick={runDiagnostics}
                  className="rounded-xl border border-[#333] bg-[#141414] px-4 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-[#1a1a1a] transition cursor-pointer"
                >
                  Run Diagnostics Probe
                </button>

                <button
                  type="button"
                  onClick={handleSyncTrackingAll}
                  className="rounded-xl border border-[#333] bg-[#141414] px-4 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-[#1a1a1a] transition cursor-pointer"
                >
                  Sync Order Tracking
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QIKINK CONNECTION */}
        {activeTab === "connection" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">Qikink API Connection</h2>
                  <p className="text-xs text-neutral-400 mt-1">Direct token exchange with Qikink Custom Open API</p>
                </div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isPending}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
                >
                  Probe Connection
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 pt-2">
                <div className="rounded-xl border border-[#1f1f1f] bg-[#121212] p-4">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Mode</span>
                  <div className="text-sm font-bold text-white mt-1">
                    {connection ? connection.mode.toUpperCase() : "LIVE"}
                  </div>
                </div>

                <div className="rounded-xl border border-[#1f1f1f] bg-[#121212] p-4">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Status</span>
                  <div className="text-sm font-bold mt-1">
                    {connection ? (
                      connection.authenticated ? (
                        <span className="text-emerald-400">Authenticated (HTTP 200)</span>
                      ) : (
                        <span className="text-rose-400">Failed</span>
                      )
                    ) : (
                      <span className="text-neutral-400">Not probed yet</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[#1f1f1f] bg-[#121212] p-4">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">Latency</span>
                  <div className="text-sm font-bold text-white mt-1">
                    {connection?.latencyMs ? `${connection.latencyMs} ms` : "—"}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#1f1f1f] bg-[#121212] p-4 text-xs space-y-2">
                <div className="flex justify-between text-neutral-400">
                  <span>Live Base URL:</span>
                  <span className="font-mono text-neutral-300">https://api.qikink.com</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Sandbox Base URL:</span>
                  <span className="font-mono text-neutral-300">https://sandbox.qikink.com</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Live Order Submission Safety Lock:</span>
                  <span className="font-mono text-amber-400">QIKINK_LIVE_ORDERS_ENABLED=false (Locked)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PRODUCT IMPORT */}
        {activeTab === "import" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Import Products from CSV</h2>
              <p className="text-xs text-neutral-400">
                Paste CSV data conforming to the Qikink product catalogue schema. Every purchasable variant must include an exact manufacturing Qikink SKU.
              </p>

              <div className="rounded-xl border border-[#222] bg-[#121212] p-3 text-[11px] text-neutral-400 space-y-1">
                <strong>Expected CSV Headers:</strong>
                <p className="font-mono text-neutral-300">
                  Product Name, Description, Category, Image URL, Variant Label, Size, Colour, SKU, Qikink SKU, Cost Price, Selling Price, Compare At Price, Mockup Link
                </p>
              </div>

              <textarea
                rows={8}
                placeholder="Product Name,Category,Cost Price,Selling Price,SKU,Qikink SKU,Variant Label&#10;Unisex Terry Oversized Tee,Cotton Apparels,633.20,1499.00,TR-OTEE-BLK-XS,64974906-BLK-XS,Black / XS"
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                className="w-full rounded-xl border border-[#292929] bg-[#121212] p-4 text-xs font-mono text-white placeholder-neutral-600 focus:border-white focus:outline-none"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleParseCsv}
                  disabled={isPending || !csvInput.trim()}
                  className="rounded-xl bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
                >
                  Parse &amp; Validate CSV
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRODUCT CATALOGUE */}
        {activeTab === "catalogue" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Filter products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="rounded-xl border border-[#292929] bg-[#121212] px-4 py-2 text-xs text-white placeholder-neutral-500 focus:border-white focus:outline-none w-64"
                />
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="rounded-xl border border-[#333] bg-[#141414] px-3 py-2 text-xs text-neutral-300 hover:bg-[#1a1a1a] transition cursor-pointer"
                >
                  {selectedProductNames.size === presetTemplates.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              <button
                type="button"
                onClick={handlePushSelected}
                disabled={isPending || selectedProductNames.size === 0}
                className="rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
              >
                Publish Selected to Store ({selectedProductNames.size})
              </button>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPresets.map((product) => {
                const isSelected = selectedProductNames.has(product.name);
                const dbMatch = dbProducts.find((p) => p.slug === product.slug || p.name === product.name);
                const minPrice = Math.min(...product.variants.map((v) => Number(v.selling_price)));

                return (
                  <div
                    key={product.name}
                    className={`rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-emerald-500/80 bg-[#0f1411]"
                        : "border-[#202020] bg-[#0d0d0d] hover:border-[#333]"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectProduct(product.name)}
                            className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
                          />
                          <span className="text-xs uppercase tracking-wider font-semibold text-neutral-400">
                            {product.category || "Apparel"}
                          </span>
                        </label>
                        {dbMatch ? (
                          <span className="rounded-full bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                            Live on Store
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-900 border border-[#2c2c2c] px-2 py-0.5 text-[10px] font-semibold text-neutral-400">
                            Ready to Publish
                          </span>
                        )}
                      </div>

                      {product.image_url && (
                        <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-xl bg-[#161616] border border-[#222]">
                          <Image
                            src={product.image_url}
                            alt={product.name}
                            fill
                            sizes="(max-width: 640px) 100vw, 33vw"
                            className="object-cover"
                          />
                        </div>
                      )}

                      <h3 className="text-base font-bold text-white">{product.name}</h3>
                      <p className="mt-1 text-xs text-neutral-400 line-clamp-2">{product.description}</p>

                      <div className="mt-4 flex items-center justify-between text-xs">
                        <span className="text-neutral-500">Retail Price:</span>
                        <strong className="text-white text-sm">₹{minPrice.toFixed(2)}</strong>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-neutral-500">Variants:</span>
                        <span className="text-neutral-300 font-semibold">{product.variants.length} verified SKUs</span>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-[#202020] pt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handlePushSingle(product)}
                        disabled={isPending}
                        className="w-full rounded-xl bg-white py-2 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
                      >
                        Push to TrendEra
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: VARIANTS AND SKUS */}
        {activeTab === "variants" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Variant &amp; SKU Inspection</h2>
              <p className="text-xs text-neutral-400">
                Audited manufacturing Qikink SKUs, fulfillment cost prices, retail prices, and profit margins.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#222] text-neutral-400">
                      <th className="py-3 px-3">Product</th>
                      <th className="py-3 px-3">Variant Label</th>
                      <th className="py-3 px-3">TrendEra SKU</th>
                      <th className="py-3 px-3">Qikink SKU</th>
                      <th className="py-3 px-3">Cost</th>
                      <th className="py-3 px-3">Retail</th>
                      <th className="py-3 px-3">Margin</th>
                      <th className="py-3 px-3">Print Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a1a]">
                    {presetTemplates.flatMap((p) =>
                      p.variants.map((v) => {
                        const margin = Number(v.selling_price) - Number(v.cost_price);
                        const marginPercent = Math.round((margin / Number(v.selling_price)) * 100);
                        return (
                          <tr key={v.sku} className="hover:bg-[#121212]">
                            <td className="py-3 px-3 font-semibold text-white">{p.name}</td>
                            <td className="py-3 px-3 text-neutral-300">{v.label}</td>
                            <td className="py-3 px-3 font-mono text-neutral-400">{v.sku}</td>
                            <td className="py-3 px-3 font-mono text-emerald-400">{v.qikink_sku}</td>
                            <td className="py-3 px-3 text-neutral-400">₹{Number(v.cost_price).toFixed(2)}</td>
                            <td className="py-3 px-3 font-bold text-white">₹{Number(v.selling_price).toFixed(2)}</td>
                            <td className="py-3 px-3 text-emerald-400 font-semibold">{marginPercent}%</td>
                            <td className="py-3 px-3 text-neutral-400">
                              {v.width_inches && v.height_inches ? `${v.width_inches}" × ${v.height_inches}"` : "Standard"}
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: CATEGORIES */}
        {activeTab === "categories" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Category Taxonomy</h2>
              <p className="text-xs text-neutral-400">
                Products grouped by collection categories for the customer storefront navigation.
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from(new Set(presetTemplates.map((p) => p.category || "Apparel"))).map((cat) => {
                  const count = presetTemplates.filter((p) => (p.category || "Apparel") === cat).length;
                  return (
                    <div key={cat} className="rounded-xl border border-[#222] bg-[#121212] p-4">
                      <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Category</span>
                      <div className="text-sm font-bold text-white mt-1">{cat}</div>
                      <p className="text-xs text-neutral-400 mt-1">{count} product(s) assigned</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: ORDER FULFILLMENT */}
        {activeTab === "fulfillment" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">Customer Store Orders</h2>
                  <p className="text-xs text-neutral-400">Verified Cashfree payments &amp; automated Qikink submission</p>
                </div>
                <button
                  type="button"
                  onClick={loadData}
                  className="rounded-xl border border-[#333] bg-[#141414] px-3.5 py-1.5 text-xs text-neutral-200 hover:bg-[#1a1a1a] transition cursor-pointer"
                >
                  Refresh Orders
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 text-xs">
                  No customer orders recorded yet. Orders created via /checkout will appear here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#222] text-neutral-400">
                        <th className="py-3 px-3">Order #</th>
                        <th className="py-3 px-3">Customer</th>
                        <th className="py-3 px-3">Total</th>
                        <th className="py-3 px-3">Payment</th>
                        <th className="py-3 px-3">Qikink ID</th>
                        <th className="py-3 px-3">Submission</th>
                        <th className="py-3 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                      {orders.map((o) => (
                        <tr key={o.id} className="hover:bg-[#121212]">
                          <td className="py-3 px-3 font-mono font-semibold text-white">{o.order_number}</td>
                          <td className="py-3 px-3 text-neutral-300">
                            <div>{o.customer_name}</div>
                            <div className="text-[10px] text-neutral-500">{o.customer_phone}</div>
                          </td>
                          <td className="py-3 px-3 font-bold text-white">₹{Number(o.total_amount).toFixed(2)}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                o.payment_status === "paid"
                                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                                  : "bg-amber-950/60 text-amber-400 border border-amber-800/60"
                              }`}
                            >
                              {o.payment_method.toUpperCase()} ({o.payment_status})
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-neutral-400">{o.qikink_order_id || "—"}</td>
                          <td className="py-3 px-3 text-neutral-400">{o.qikink_submission_status}</td>
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              onClick={() => handleSyncSingleOrder(o.id)}
                              className="text-xs text-neutral-300 underline hover:text-white cursor-pointer"
                            >
                              Sync Tracking
                            </button>
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

        {/* TAB 8: TRACKING */}
        {activeTab === "tracking" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">Fulfillment Tracking</h2>
                  <p className="text-xs text-neutral-400">Live shipping status, AWB numbers, and courier tracking links</p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncTrackingAll}
                  disabled={isPending}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
                >
                  Sync All Active Orders
                </button>
              </div>

              {orders.filter((o) => o.qikink_awb || o.qikink_status).length === 0 ? (
                <div className="text-center py-12 text-neutral-500 text-xs">
                  No active tracking details yet. Once orders are submitted and printed, AWB numbers will appear here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#222] text-neutral-400">
                        <th className="py-3 px-3">Order #</th>
                        <th className="py-3 px-3">Courier</th>
                        <th className="py-3 px-3">AWB</th>
                        <th className="py-3 px-3">Qikink Status</th>
                        <th className="py-3 px-3">Tracking</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                      {orders
                        .filter((o) => o.qikink_awb || o.qikink_status)
                        .map((o) => (
                          <tr key={o.id} className="hover:bg-[#121212]">
                            <td className="py-3 px-3 font-mono font-semibold text-white">{o.order_number}</td>
                            <td className="py-3 px-3 text-neutral-300">{o.qikink_courier || "Standard"}</td>
                            <td className="py-3 px-3 font-mono text-emerald-400">{o.qikink_awb || "—"}</td>
                            <td className="py-3 px-3 text-neutral-300">{o.qikink_status || "Processing"}</td>
                            <td className="py-3 px-3">
                              {o.qikink_tracking_url ? (
                                <Link
                                  href={o.qikink_tracking_url}
                                  target="_blank"
                                  className="text-emerald-400 underline hover:text-emerald-300"
                                >
                                  Track Package ↗
                                </Link>
                              ) : (
                                <span className="text-neutral-500">—</span>
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

        {/* TAB 9: SYNC HISTORY */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Synchronization Audit Trail</h2>
              <p className="text-xs text-neutral-400">
                Authoritative history of product publications and tracking updates logged to qikink_sync_logs.
              </p>

              {syncLogs.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 text-xs">
                  No synchronization entries logged yet. Publications and tracking syncs will be recorded here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#222] text-neutral-400">
                        <th className="py-3 px-3">Timestamp</th>
                        <th className="py-3 px-3">Operation</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Items</th>
                        <th className="py-3 px-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                      {syncLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[#121212]">
                          <td className="py-3 px-3 text-neutral-400">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 font-semibold uppercase text-white">{log.sync_type}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                log.status === "success"
                                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                                  : "bg-rose-950/60 text-rose-400 border border-rose-800/60"
                              }`}
                            >
                              {log.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-neutral-300">{log.items_count}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-neutral-400 max-w-xs truncate">
                            {JSON.stringify(log.details)}
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

        {/* TAB 10: DIAGNOSTICS */}
        {activeTab === "diagnostics" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">System Diagnostics Panel</h2>
                  <p className="text-xs text-neutral-400">
                    Live probe of all 11 architecture components (Supabase, Qikink Open API, Commerce engine)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runDiagnostics}
                  disabled={isPending}
                  className="rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-black hover:bg-neutral-200 transition cursor-pointer disabled:opacity-50"
                >
                  Run Full Probe
                </button>
              </div>

              {!diagnostics ? (
                <div className="text-center py-12 text-neutral-500 text-xs">
                  Click &quot;Run Full Probe&quot; to test Supabase, Qikink, and commerce subsystems.
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {Object.entries(diagnostics.checks).map(([key, item]) => (
                    <div
                      key={key}
                      className={`rounded-xl border p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        item.healthy
                          ? "border-emerald-900/60 bg-emerald-950/20"
                          : "border-rose-900/60 bg-rose-950/20"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-white font-semibold">{item.name}</strong>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              item.healthy
                                ? "bg-emerald-900/80 text-emerald-300"
                                : "bg-rose-900/80 text-rose-300"
                            }`}
                          >
                            {item.status}
                          </span>
                          {item.latencyMs !== undefined && (
                            <span className="text-[10px] text-neutral-500">({item.latencyMs}ms)</span>
                          )}
                        </div>
                        <p className={item.healthy ? "text-emerald-300/80" : "text-rose-300/80"}>
                          {item.message}
                        </p>
                        {item.remediation && (
                          <p className="text-[11px] text-amber-300/90 font-mono mt-1">
                            Action: {item.remediation}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SQL Migration Reference Box */}
            <div className="rounded-2xl border border-[#202020] bg-[#0d0d0d] p-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Supabase Migration File
              </h3>
              <p className="text-xs text-neutral-400">
                If the diagnostic indicates pending migrations or missing columns, run the consolidated script in your Supabase SQL Editor:
              </p>
              <div className="rounded-xl border border-[#222] bg-[#121212] p-3 text-xs font-mono text-emerald-400">
                supabase/migrations/0005_consolidated_repair_and_rls.sql
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
