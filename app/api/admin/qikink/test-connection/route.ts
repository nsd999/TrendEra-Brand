import { NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin/auth";
import { testQikinkConnection } from "@/lib/qikink/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthorizedAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized admin access." }, { status: 401 });
  }

  try {
    const status = await testQikinkConnection();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Connection probe failed",
      },
      { status: 500 },
    );
  }
}

