"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget?: "_self" | "_blank" | "_top" }) => Promise<unknown>;
    };
  }
}

export type CheckoutLine = { variantId: string; quantity: number };
export type CheckoutProduct = { id: string; name: string; label: string; price: number; sku: string };

export function TrendEraCheckout({ products }: { products: CheckoutProduct[] }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [address, setAddress] = useState({ first_name: "", last_name: "", address1: "", address2: "", phone: "", email: "", city: "", zip: "", province: "", country: "India", country_code: "IN" });
  const [sdkReady, setSdkReady] = useState(false);

  const selected = products.filter(p => (cart[p.id] ?? 0) > 0);
  const total = selected.reduce((sum, p) => sum + p.price * cart[p.id], 0);
  function updateCart(id: string, quantity: number) {
    setCart(previous => ({ ...previous, [id]: Math.max(0, Math.min(5, quantity)) }));
  }
  function setCustomerField(field: keyof typeof customer, value: string) {
    setCustomer(previous => ({ ...previous, [field]: value }));
    if (field === "email") setAddress(previous => ({ ...previous, email: value }));
    if (field === "phone") setAddress(previous => ({ ...previous, phone: value }));
    if (field === "name") {
      const parts = value.trim().split(/\s+/);
      setAddress(previous => ({ ...previous, first_name: parts[0] ?? "", last_name: parts.slice(1).join(" ") }));
    }
  }
  function setAddressField(field: keyof typeof address, value: string) {
    setAddress(previous => ({ ...previous, [field]: value }));
  }

  async function submitOrder() {
    if (!selected.length) { setMessage("Choose at least one product first."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "online",
          customer,
          shippingAddress: address,
          items: selected.map(p => ({ variantId: p.id, quantity: cart[p.id] })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create checkout.");
      if (result.payment?.provider !== "cashfree" || !result.payment.paymentSessionId) {
        throw new Error(result.error || "Payment session could not be confirmed. Do not submit payment again; contact TrendEra.");
      }
      if (!window.Cashfree) throw new Error("Secure payment checkout is still loading. Please wait a moment and try again.");
      const cashfree = window.Cashfree({ mode: result.payment.environment === "production" ? "production" : "sandbox" });
      await cashfree.checkout({ paymentSessionId: result.payment.paymentSessionId, redirectTarget: "_self" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed. Please try again.");
      setBusy(false);
    }
  }

  const inputClass = "mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-3 text-sm text-black outline-none focus:border-black";
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
      <Script src="https://sdk.cashfree.com/js/v3/cashfree.js" strategy="afterInteractive" onReady={() => setSdkReady(true)} />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Your selection</h2>
        {products.length === 0 ? (
          <div className="rounded-2xl border border-black/10 p-6 text-sm text-black/65">No published, purchasable products are available yet. TrendEra checkout will become available when the verified catalogue is published.</div>
        ) : (
          products.map(product => (
            <article key={product.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 p-4">
              <div><h3 className="font-medium">{product.name}</h3><p className="mt-1 text-sm text-black/55">{product.label}</p><p className="mt-2 text-sm font-semibold">₹{product.price.toFixed(2)}</p></div>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={"Remove one " + product.name} onClick={() => updateCart(product.id, (cart[product.id] ?? 0) - 1)} className="h-9 w-9 rounded-full border border-black/15">−</button>
                <span className="w-4 text-center text-sm">{cart[product.id] ?? 0}</span>
                <button type="button" aria-label={"Add one " + product.name} onClick={() => updateCart(product.id, (cart[product.id] ?? 0) + 1)} className="h-9 w-9 rounded-full border border-black/15" disabled={(cart[product.id] ?? 0) >= 5}>+</button>
              </div>
            </article>
          ))
        )}
        <div className="flex justify-between border-t border-black/10 pt-4 text-base font-semibold"><span>Subtotal</span><span>₹{total.toFixed(2)}</span></div>
        <p className="text-xs leading-5 text-black/50">Final payable amount is calculated and validated by the server. Any applicable shipping charges must be configured in the store pricing rules before launch.</p>
      </section>

      <section className="rounded-2xl border border-black/10 p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Delivery details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Full name<input className={inputClass} autoComplete="name" required value={customer.name} onChange={e => setCustomerField("name", e.target.value)} /></label>
          <label className="text-sm">Email<input className={inputClass} type="email" autoComplete="email" required value={customer.email} onChange={e => setCustomerField("email", e.target.value)} /></label>
          <label className="text-sm sm:col-span-2">Mobile number<input className={inputClass} type="tel" autoComplete="tel" inputMode="tel" required value={customer.phone} onChange={e => setCustomerField("phone", e.target.value)} /></label>
          <label className="text-sm sm:col-span-2">Address line 1<input className={inputClass} autoComplete="address-line1" required value={address.address1} onChange={e => setAddressField("address1", e.target.value)} /></label>
          <label className="text-sm sm:col-span-2">Address line 2 (optional)<input className={inputClass} autoComplete="address-line2" value={address.address2} onChange={e => setAddressField("address2", e.target.value)} /></label>
          <label className="text-sm">City<input className={inputClass} autoComplete="address-level2" required value={address.city} onChange={e => setAddressField("city", e.target.value)} /></label>
          <label className="text-sm">State<input className={inputClass} autoComplete="address-level1" required value={address.province} onChange={e => setAddressField("province", e.target.value)} /></label>
          <label className="text-sm">PIN / postal code<input className={inputClass} autoComplete="postal-code" inputMode="numeric" required value={address.zip} onChange={e => setAddressField("zip", e.target.value)} /></label>
        </div>
        <div className="mt-6 rounded-xl bg-black/[0.03] p-4 text-sm"><strong>Payment method</strong><p className="mt-1 text-black/60">Secure online payment through Cashfree. Card, UPI and other methods depend on your Cashfree account configuration.</p></div>
        {message && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{message}</p>}
        <button type="button" onClick={submitOrder} disabled={busy || !sdkReady || products.length === 0 || selected.length === 0} className="mt-5 w-full rounded-full bg-black px-5 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "Preparing secure payment…" : !sdkReady ? "Loading secure checkout…" : "Continue to Cashfree · ₹" + total.toFixed(2)}
        </button>
        <p className="mt-3 text-center text-xs text-black/50">Your payment is confirmed only after server-side verification.</p>
      </section>
    </div>
  );
}
