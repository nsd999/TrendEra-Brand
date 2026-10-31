import { NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/lib/admin/auth";
import { testQikinkConnection } from "@/lib/qikink/client";
import { runSupabaseDiagnostics, type ComponentDiagnostic } from "@/lib/supabase/diagnostic";
import { getStorefrontClient } from "@/lib/supabase/admin";
import { parseProductCsv, validateProductImportItem, getPresetQikinkTemplates } from "@/lib/qikink/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const isAuth = await isAuthorizedAdmin(request);

  // 1. Supabase diagnostics
  const supabaseReport = await runSupabaseDiagnostics();

  // 2. Qikink diagnostics
  let qikinkAuthDiag: ComponentDiagnostic;
  let qikinkLiveDiag: ComponentDiagnostic;
  try {
    const qikinkStatus = await testQikinkConnection();
    qikinkAuthDiag = {
      name: "Qikink Authentication",
      status: qikinkStatus.authenticated ? "Valid" : "Invalid",
      healthy: qikinkStatus.authenticated,
      latencyMs: qikinkStatus.latencyMs,
      message: qikinkStatus.authenticated
        ? `Authentication token active (${qikinkStatus.mode} mode, expires in ${qikinkStatus.tokenExpiresInSeconds ?? 0}s).`
        : `Authentication failed: ${qikinkStatus.error ?? "Invalid credentials"}.`,
      remediation: qikinkStatus.authenticated
        ? undefined
        : "Verify QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET in server environment variables.",
    };

    qikinkLiveDiag = {
      name: "Qikink Live API",
      status: qikinkStatus.connected ? "Available" : "Unavailable",
      healthy: qikinkStatus.connected,
      message: qikinkStatus.connected
        ? `Qikink endpoint reachable (${qikinkStatus.latencyMs ?? 0}ms latency).`
        : `Could not reach Qikink endpoint: ${qikinkStatus.error ?? "Connection probe failed"}.`,
      remediation: qikinkStatus.connected
        ? undefined
        : "Check network connectivity from Vercel to api.qikink.com.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Qikink check failed";
    qikinkAuthDiag = {
      name: "Qikink Authentication",
      status: "Invalid",
      healthy: false,
      message: msg,
      remediation: "Verify Qikink environment variables.",
    };
    qikinkLiveDiag = {
      name: "Qikink Live API",
      status: "Unavailable",
      healthy: false,
      message: msg,
    };
  }

  // 3. Admin authorization check
  const adminAuthDiag: ComponentDiagnostic = {
    name: "Admin Authorization",
    status: isAuth ? "Valid" : "Invalid",
    healthy: isAuth,
    message: isAuth
      ? "Caller is authorized with a valid admin session or token."
      : "Caller is unauthorized or admin session has expired.",
    remediation: isAuth
      ? undefined
      : "Sign in with the configured QIKINK_ADMIN_API_TOKEN.",
  };

  // 4. Product import engine probe
  let productImportDiag: ComponentDiagnostic;
  try {
    const presets = getPresetQikinkTemplates();
    if (!presets || presets.length === 0) {
      throw new Error("No preset templates defined.");
    }
    // Test validation on the first preset
    validateProductImportItem(presets[0]);
    // Test CSV parsing on a sample snippet
    const sampleCsv =
      "Product Name,Category,Cost Price,Selling Price,SKU,Qikink SKU,Variant Label\nTest Tee,Apparel,500,1200,TEST-SKU,QIK-SKU,Standard";
    const parsed = parseProductCsv(sampleCsv);
    if (parsed.length !== 1 || parsed[0].variants.length !== 1) {
      throw new Error("CSV parser did not produce expected variant structure.");
    }

    productImportDiag = {
      name: "Product Import",
      status: "Functional",
      healthy: true,
      message: `Product import parser, schema validator, and SKU verifier are functioning (${presets.length} preset candidates ready).`,
      details: { presetsCount: presets.length },
    };
  } catch (err) {
    productImportDiag = {
      name: "Product Import",
      status: "Failed",
      healthy: false,
      message: `Product import validation failure: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  // 5. Storefront query probe
  let storefrontDiag: ComponentDiagnostic;
  try {
    const storefrontClient = getStorefrontClient();
    if (!storefrontClient) {
      storefrontDiag = {
        name: "Storefront Product Query",
        status: "Failed",
        healthy: false,
        message: "Cannot run storefront query: Supabase client is unconfigured.",
        remediation: "Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      };
    } else {
      const { data, error } = await storefrontClient
        .from("products")
        .select("id,name,status,product_variants(id,label,price,is_active)")
        .eq("status", "published")
        .limit(5);

      if (error) {
        storefrontDiag = {
          name: "Storefront Product Query",
          status: "Failed",
          healthy: false,
          message: `Storefront query error: ${error.message}. Check RLS policies on products and product_variants.`,
          remediation: "Apply migration 0005 to grant anon SELECT on active variants of published products.",
        };
      } else {
        const count = data?.length ?? 0;
        storefrontDiag = {
          name: "Storefront Product Query",
          status: "Functional",
          healthy: true,
          message: `Storefront query executed successfully (${count} published product(s) returned).`,
          details: { publishedProductsFound: count },
        };
      }
    }
  } catch (err) {
    storefrontDiag = {
      name: "Storefront Product Query",
      status: "Failed",
      healthy: false,
      message: err instanceof Error ? err.message : "Storefront probe error.",
    };
  }

  const allChecks = [
    qikinkAuthDiag,
    qikinkLiveDiag,
    supabaseReport.configuration,
    supabaseReport.connection,
    supabaseReport.productsTable,
    supabaseReport.variantsTable,
    supabaseReport.syncLogsTable,
    supabaseReport.migration,
    adminAuthDiag,
    productImportDiag,
    storefrontDiag,
  ];

  const allHealthy = allChecks.every((c) => c.healthy);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    allHealthy,
    checks: {
      qikinkAuth: qikinkAuthDiag,
      qikinkLive: qikinkLiveDiag,
      supabaseConfig: supabaseReport.configuration,
      supabaseConn: supabaseReport.connection,
      productsTable: supabaseReport.productsTable,
      variantsTable: supabaseReport.variantsTable,
      syncLogsTable: supabaseReport.syncLogsTable,
      migration: supabaseReport.migration,
      adminAuth: adminAuthDiag,
      productImport: productImportDiag,
      storefrontQuery: storefrontDiag,
    },
  });
}

