import { CashfreeReturnStatus } from "@/components/cashfree-return-status";

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const params = await searchParams;
  const orderId = typeof params.order_id === "string" ? params.order_id : "";
  return <CashfreeReturnStatus orderId={orderId} />;
}
