"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Verification = {
  status?: "pending" | "paid";
  orderNumber?: string;
  fulfilment?: "submitted" | "needs_review";
  error?: string;
};

export function CashfreeReturnStatus({ orderId }: { orderId: string }) {
  const [result, setResult] = useState<Verification>({});
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function verify() {
      try {
        const response = await fetch("/api/payments/cashfree/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
          cache: "no-store",
        });
        const data = await response.json() as Verification;
        if (cancelled) return;
        setResult(data);
        if (data.status === "paid" || attempts >= 5) {
          setChecking(false);
          return;
        }
      } catch {
        if (cancelled) return;
        setResult({ error: "We could not confirm the payment yet." });
        if (attempts >= 5) {
          setChecking(false);
          return;
        }
      }
      attempts += 1;
      timer = setTimeout(verify, 3000);
    }

    if (orderId) void verify();
    else {
      setResult({ error: "The payment order reference is missing." });
      setChecking(false);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  const paid = result.status === "paid";

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-xl items-center px-5 py-16">
      <section className="w-full rounded-2xl border border-black/10 bg-white p-7 text-center shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">TrendEra · Secure checkout</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-black">
          {paid ? "Payment confirmed" : checking ? "Verifying your payment" : "Payment not confirmed yet"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/65">
          {paid
            ? result.fulfilment === "needs_review"
              ? "Your payment is confirmed. Your order is saved, and fulfilment is being reviewed. You do not need to pay again."
              : "Your payment has been verified. Your order is being processed."
            : checking
              ? "Please keep this page open while we securely check the payment status with Cashfree. Do not retry payment during verification."
              : "Cashfree has not confirmed this order as paid yet. If you completed payment, wait a little and check again before attempting another payment."}
        </p>
        {result.orderNumber && <p className="mt-4 text-sm text-black/70">Order reference: <strong>{result.orderNumber}</strong></p>}
        {!paid && !checking && result.error && <p role="status" className="mt-3 text-sm text-amber-800">{result.error}</p>}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {!paid && !checking && (
            <button
              type="button"
              onClick={() => { setChecking(true); setResult({}); window.location.reload(); }}
              className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white"
            >
              Check again
            </button>
          )}
          <Link href="/shop" className="rounded-full border border-black/15 px-6 py-3 text-sm font-medium text-black">
            Return to shop
          </Link>
        </div>
      </section>
    </main>
  );
}
