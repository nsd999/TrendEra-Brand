import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedAdmin } from "@/lib/admin/auth";
import {
  getPresetQikinkTemplates,
  parseProductCsv,
  pushProductToTrendEra,
  syncAllProducts,
  syncProductCategories,
  syncProductImages,
  type QikinkProductImportItem,
} from "@/lib/qikink/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server configuration is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  if (!(await isAuthorizedAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized admin access." }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { data: dbProducts, error: dbError } = await supabase
    .from("products")
    .select("id,name,slug,description,price,category,image_url,qikink_product_id,status,created_at,product_variants(id,label,size,colour,sku,qikink_sku,price,cost_price,mockup_link,is_active)")
    .order("created_at", { ascending: false });

  if (dbError) {
    return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
  }

  const { data: recentLogs } = await supabase
    .from("qikink_sync_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    storeProducts: dbProducts ?? [],
    presetTemplates: getPresetQikinkTemplates(),
    recentLogs: recentLogs ?? [],
  });
}

export async function POST(request: Request) {
  if (!(await isAuthorizedAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized admin access." }, { status: 401 });
  }

  let body: {
    action: string;
    product?: QikinkProductImportItem;
    products?: QikinkProductImportItem[];
    csvContent?: string;
    categories?: Record<string, string>;
    productId?: string;
    imageUrl?: string;
    variantMockups?: Record<string, string>;
    preserveExistingPrices?: boolean;
    status?: "draft" | "published";
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { action } = body;

  try {
    switch (action) {
      case "import_csv": {
        if (!body.csvContent) {
          return NextResponse.json({ error: "CSV content is required." }, { status: 400 });
        }
        const parsed = parseProductCsv(body.csvContent);
        return NextResponse.json({ success: true, count: parsed.length, products: parsed });
      }

      case "push_to_trendera": {
        if (body.product) {
          const res = await pushProductToTrendEra(body.product, {
            preserveExistingPrices: body.preserveExistingPrices ?? true,
            status: body.status ?? "published",
          });
          return NextResponse.json({ success: true, result: res });
        }
        if (Array.isArray(body.products) && body.products.length > 0) {
          const res = await syncAllProducts(body.products, {
            preserveExistingPrices: body.preserveExistingPrices ?? true,
            status: body.status ?? "published",
          });
          return NextResponse.json({ success: true, result: res });
        }
        return NextResponse.json({ error: "No product data provided to push." }, { status: 400 });
      }

      case "import_presets": {
        const presets = getPresetQikinkTemplates();
        const res = await syncAllProducts(presets, {
          preserveExistingPrices: body.preserveExistingPrices ?? true,
          status: body.status ?? "published",
        });
        return NextResponse.json({ success: true, result: res });
      }

      case "sync_categories": {
        if (!body.categories || Object.keys(body.categories).length === 0) {
          return NextResponse.json({ error: "No category mappings provided." }, { status: 400 });
        }
        const res = await syncProductCategories(body.categories);
        return NextResponse.json({ success: true, result: res });
      }

      case "sync_images": {
        if (!body.productId || !body.imageUrl) {
          return NextResponse.json({ error: "productId and imageUrl are required." }, { status: 400 });
        }
        const res = await syncProductImages(body.productId, body.imageUrl, body.variantMockups);
        return NextResponse.json({ success: true, result: res });
      }

      case "sync_variants": {
        if (!body.product) {
          return NextResponse.json({ error: "Product with variant data is required." }, { status: 400 });
        }
        const res = await pushProductToTrendEra(body.product, {
          preserveExistingPrices: body.preserveExistingPrices ?? true,
        });
        return NextResponse.json({ success: true, result: res });
      }

      case "retry_failed_sync": {
        const presets = getPresetQikinkTemplates();
        const res = await syncAllProducts(presets, { preserveExistingPrices: true });
        return NextResponse.json({ success: true, result: res });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute product action." },
      { status: 500 },
    );
  }
}

