import { NextResponse } from "next/server";
import { isAuthorizedAdmin, getAdminSecret } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const isAuth = await isAuthorizedAdmin(request);
  const isServerConfigured = Boolean(getAdminSecret());

  return NextResponse.json({
    authenticated: isAuth,
    serverConfigured: isServerConfigured,
  });
}
