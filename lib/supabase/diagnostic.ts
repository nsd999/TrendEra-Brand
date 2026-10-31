import "server-only";

import { getAdminClient, inspectSupabaseConfig } from "./admin.ts";

export type ComponentDiagnostic = {
  name: string;
  status: "Valid" | "Invalid" | "Available" | "Unavailable" | "Connected" | "Failed" | "Accessible" | "Applied" | "Pending" | "Functional";
  healthy: boolean;
  message: string;
  details?: Record<string, unknown>;
  remediation?: string;
  latencyMs?: number;
};

export type FullDiagnosticReport = {
  timestamp: string;
  allHealthy: boolean;
  supabase: {
    configuration: ComponentDiagnostic;
    connection: ComponentDiagnostic;
    productsTable: ComponentDiagnostic;
    variantsTable: ComponentDiagnostic;
    syncLogsTable: ComponentDiagnostic;
    migration: ComponentDiagnostic;
  };
  qikink: {
    authentication: ComponentDiagnostic;
    liveApi: ComponentDiagnostic;
  };
  commerce: {
    adminAuth: ComponentDiagnostic;
    productImport: ComponentDiagnostic;
    storefrontQuery: ComponentDiagnostic;
  };
};

export async function runSupabaseDiagnostics(): Promise<{
  configuration: ComponentDiagnostic;
  connection: ComponentDiagnostic;
  productsTable: ComponentDiagnostic;
  variantsTable: ComponentDiagnostic;
  syncLogsTable: ComponentDiagnostic;
  migration: ComponentDiagnostic;
}> {
  const config = inspectSupabaseConfig();

  // 1. Configuration check
  const configDiag: ComponentDiagnostic = {
    name: "Supabase Configuration",
    status: config.isConfigured ? "Valid" : "Invalid",
    healthy: config.isConfigured,
    message: config.isConfigured
      ? `Supabase configuration is complete (${config.urlHost ?? "configured"}).`
      : `Missing required environment variable(s): ${config.missingVariables.join(", ")}.`,
    details: {
      hasUrl: config.hasUrl,
      hasPublishableKey: config.hasPublishableKey,
      hasServiceRoleKey: config.hasServiceRoleKey,
      missingVariables: config.missingVariables,
      host: config.urlHost,
    },
    remediation: config.isConfigured
      ? undefined
      : `Configure the missing variables in Vercel Project Settings → Environment Variables (or .env.local): ${config.missingVariables.join(", ")}.`,
  };

  if (!config.hasUrl || !config.hasServiceRoleKey) {
    const unavail = (name: string): ComponentDiagnostic => ({
      name,
      status: "Failed",
      healthy: false,
      message: "Cannot check table: Supabase URL or Service-Role Key is not configured.",
      remediation: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.",
    });

    return {
      configuration: configDiag,
      connection: {
        name: "Supabase Connection",
        status: "Failed",
        healthy: false,
        message: "Connection failed: Supabase credentials are missing.",
        remediation: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      productsTable: unavail("Products Table"),
      variantsTable: unavail("Variants Table"),
      syncLogsTable: unavail("Sync Logs Table"),
      migration: {
        name: "Database Migration",
        status: "Pending",
        healthy: false,
        message: "Cannot verify migrations without database connectivity.",
        remediation: "Configure Supabase credentials and apply migrations in supabase/migrations/.",
      },
    };
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch (err) {
    return {
      configuration: configDiag,
      connection: {
        name: "Supabase Connection",
        status: "Failed",
        healthy: false,
        message: err instanceof Error ? err.message : "Client initialization failed.",
      },
      productsTable: { name: "Products Table", status: "Failed", healthy: false, message: "Client error." },
      variantsTable: { name: "Variants Table", status: "Failed", healthy: false, message: "Client error." },
      syncLogsTable: { name: "Sync Logs Table", status: "Failed", healthy: false, message: "Client error." },
      migration: { name: "Database Migration", status: "Pending", healthy: false, message: "Client error." },
    };
  }

  // 2. Connection probe
  let connectionDiag: ComponentDiagnostic;
  try {
    const probeStart = Date.now();
    const { error } = await supabase.from("products").select("id").limit(1);
    const latencyMs = Date.now() - probeStart;

    if (error && error.code === "PGRST301") {
      connectionDiag = {
        name: "Supabase Connection",
        status: "Failed",
        healthy: false,
        latencyMs,
        message: "Authentication failure: SUPABASE_SERVICE_ROLE_KEY is invalid or rejected by Supabase.",
        remediation: "Verify the SUPABASE_SERVICE_ROLE_KEY copied from Supabase Dashboard → Settings → API.",
      };
    } else if (error && (error.message.includes("fetch failed") || error.message.includes("ENOTFOUND"))) {
      connectionDiag = {
        name: "Supabase Connection",
        status: "Failed",
        healthy: false,
        latencyMs,
        message: "Network connection failure: Cannot resolve or connect to Supabase URL.",
        remediation: "Check NEXT_PUBLIC_SUPABASE_URL and verify project is active (not paused).",
      };
    } else {
      connectionDiag = {
        name: "Supabase Connection",
        status: "Connected",
        healthy: true,
        latencyMs,
        message: `Successfully connected to Supabase (${latencyMs}ms latency).`,
      };
    }
  } catch (err) {
    connectionDiag = {
      name: "Supabase Connection",
      status: "Failed",
      healthy: false,
      message: err instanceof Error ? err.message : "Connection failed.",
      remediation: "Verify network access and NEXT_PUBLIC_SUPABASE_URL.",
    };
  }

  // 3. Products table probe
  let productsDiag: ComponentDiagnostic;
  let productsColumnsOk = false;
  try {
    const { error } = await supabase
      .from("products")
      .select("id,name,slug,price,status,qikink_product_id,category,image_url")
      .limit(1);

    if (error) {
      if (error.code === "42P01" || error.message.includes("relation \"public.products\" does not exist")) {
        productsDiag = {
          name: "Products Table",
          status: "Failed",
          healthy: false,
          message: "Table 'public.products' does not exist in the connected database.",
          remediation: "Run supabase/migrations/0001_initial_schema.sql in your Supabase SQL Editor.",
        };
      } else if (error.message.includes("column") && error.message.includes("does not exist")) {
        productsDiag = {
          name: "Products Table",
          status: "Failed",
          healthy: false,
          message: `Products table is missing migration columns: ${error.message}`,
          remediation: "Run supabase/migrations/0004_qikink_direct_integration.sql to add qikink_product_id, category, and image_url.",
        };
      } else {
        productsDiag = {
          name: "Products Table",
          status: "Failed",
          healthy: false,
          message: `Products table error: ${error.message}`,
        };
      }
    } else {
      productsColumnsOk = true;
      const { count } = await supabase.from("products").select("id", { count: "exact", head: true });
      productsDiag = {
        name: "Products Table",
        status: "Accessible",
        healthy: true,
        message: `Products table accessible with all required columns (${count ?? 0} total records).`,
        details: { count },
      };
    }
  } catch (err) {
    productsDiag = {
      name: "Products Table",
      status: "Failed",
      healthy: false,
      message: err instanceof Error ? err.message : "Products table query failed.",
    };
  }

  // 4. Product Variants table probe
  let variantsDiag: ComponentDiagnostic;
  let variantsColumnsOk = false;
  try {
    const { error } = await supabase
      .from("product_variants")
      .select("id,sku,qikink_sku,price,cost_price,is_active,mockup_link")
      .limit(1);

    if (error) {
      if (error.code === "42P01" || error.message.includes("does not exist")) {
        variantsDiag = {
          name: "Variants Table",
          status: "Failed",
          healthy: false,
          message: "Table 'public.product_variants' does not exist.",
          remediation: "Run supabase/migrations/0002_qikink_pod.sql in your Supabase SQL Editor.",
        };
      } else if (error.message.includes("cost_price")) {
        variantsDiag = {
          name: "Variants Table",
          status: "Failed",
          healthy: false,
          message: "Variants table is missing 'cost_price' column from migration 0004.",
          remediation: "Run supabase/migrations/0004_qikink_direct_integration.sql to add cost_price.",
        };
      } else {
        variantsDiag = {
          name: "Variants Table",
          status: "Failed",
          healthy: false,
          message: `Variants table error: ${error.message}`,
        };
      }
    } else {
      variantsColumnsOk = true;
      const { count } = await supabase.from("product_variants").select("id", { count: "exact", head: true });
      variantsDiag = {
        name: "Variants Table",
        status: "Accessible",
        healthy: true,
        message: `Variants table accessible with all required columns (${count ?? 0} total variants).`,
        details: { count },
      };
    }
  } catch (err) {
    variantsDiag = {
      name: "Variants Table",
      status: "Failed",
      healthy: false,
      message: err instanceof Error ? err.message : "Variants table query failed.",
    };
  }

  // 5. Sync logs table probe
  let syncLogsDiag: ComponentDiagnostic;
  let syncLogsOk = false;
  try {
    const { error } = await supabase
      .from("qikink_sync_logs")
      .select("id,sync_type,status,created_at")
      .limit(1);

    if (error) {
      syncLogsDiag = {
        name: "Sync Logs Table",
        status: "Failed",
        healthy: false,
        message: `Sync logs table 'public.qikink_sync_logs' is missing: ${error.message}`,
        remediation: "Run supabase/migrations/0004_qikink_direct_integration.sql in your Supabase SQL Editor.",
      };
    } else {
      syncLogsOk = true;
      const { count } = await supabase.from("qikink_sync_logs").select("id", { count: "exact", head: true });
      syncLogsDiag = {
        name: "Sync Logs Table",
        status: "Accessible",
        healthy: true,
        message: `Sync logs table accessible (${count ?? 0} historical entries).`,
        details: { count },
      };
    }
  } catch (err) {
    syncLogsDiag = {
      name: "Sync Logs Table",
      status: "Failed",
      healthy: false,
      message: err instanceof Error ? err.message : "Sync logs table query failed.",
    };
  }

  // 6. Overall migration status
  const allTablesOk = productsColumnsOk && variantsColumnsOk && syncLogsOk;
  const migrationDiag: ComponentDiagnostic = {
    name: "Database Migration",
    status: allTablesOk ? "Applied" : "Pending",
    healthy: allTablesOk,
    message: allTablesOk
      ? "All required tables, enhanced columns, and sync audit structures are verified and applied."
      : "Database migrations are pending or partially applied. Missing required tables or columns.",
    remediation: allTablesOk
      ? undefined
      : "Open Supabase Dashboard → SQL Editor and run the consolidated migration script.",
  };

  return {
    configuration: configDiag,
    connection: connectionDiag,
    productsTable: productsDiag,
    variantsTable: variantsDiag,
    syncLogsTable: syncLogsDiag,
    migration: migrationDiag,
  };
}
