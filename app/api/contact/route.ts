import { NextResponse } from "next/server";
import { z } from "zod";
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(25).optional().default(""),
  message: z.string().trim().min(5).max(3000),
  website: z.string().optional().default(""),
});
export async function POST(request: Request) {
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true });
  const apiKey = process.env.RESEND_API_KEY, to = process.env.CONTACT_TO_EMAIL, from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !to || !from) return NextResponse.json({ error: "Message delivery is not configured yet. Please contact us on WhatsApp." }, { status: 503 });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: parsed.data.email, subject: `TrendEra website enquiry from ${parsed.data.name}`, text: `Name: ${parsed.data.name}\nEmail: ${parsed.data.email}\nPhone: ${parsed.data.phone || "Not provided"}\n\nMessage:\n${parsed.data.message}` }),
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "We could not send your message right now. Please try WhatsApp instead." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
