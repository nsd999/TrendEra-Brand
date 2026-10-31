import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  clearFailedAttempts,
  createAdminSessionToken,
  getAdminSecret,
  isRateLimited,
  recordFailedAttempt,
} from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Please wait 15 minutes before retrying." },
      { status: 429 },
    );
  }

  const adminSecret = getAdminSecret();
  if (!adminSecret) {
    return NextResponse.json(
      { error: "Server admin passcode is not configured in environment variables (QIKINK_ADMIN_API_TOKEN)." },
      { status: 503 },
    );
  }

  let body: { passcode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const inputPasscode = body.passcode?.trim() || "";
  if (!inputPasscode) {
    return NextResponse.json({ error: "Passcode is required." }, { status: 400 });
  }

  const inputBuf = Buffer.from(inputPasscode, "utf8");
  const secretBuf = Buffer.from(adminSecret, "utf8");

  const isMatch = inputBuf.length === secretBuf.length && timingSafeEqual(inputBuf, secretBuf);

  if (!isMatch) {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: "Invalid admin passcode." }, { status: 401 });
  }

  clearFailedAttempts(ip);
  const sessionToken = createAdminSessionToken(adminSecret);

  const response = NextResponse.json({ success: true, message: "Admin authenticated." });
  response.cookies.set({
    name: "trendera_admin_session",
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60, // 24 hours
  });

  return response;
}

