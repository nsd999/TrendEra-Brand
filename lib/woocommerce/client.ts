import "server-only";

export type WooCommerceImage = {
  id: number;
  src: string;
  name?: string;
  alt?: string;
};

export type WooCommerceAttribute = {
  id: number;
  name: string;
  position?: number;
  visible?: boolean;
  variation?: boolean;
  options: string[];
};

export type WooCommerceVariation = {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  status: string;
  purchasable: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder" | string;
  stock_quantity: number | null;
  manage_stock: boolean;
  attributes: Array<{ id: number; name: string; option: string }>;
  image?: WooCommerceImage | null;
};

export type WooCommerceRawProduct = {
  id: number;
  name: string;
  slug: string;
  permalink?: string;
  type: "simple" | "variable" | "grouped" | "external" | string;
  status: "draft" | "pending" | "private" | "publish" | string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  purchasable: boolean;
  total_sales?: number;
  stock_status: "instock" | "outofstock" | "onbackorder" | string;
  stock_quantity: number | null;
  manage_stock: boolean;
  images: WooCommerceImage[];
  attributes: WooCommerceAttribute[];
  default_attributes?: Array<{ id: number; name: string; option: string }>;
  variations?: number[];
  categories?: Array<{ id: number; name: string; slug: string }>;
  meta_data?: Array<{ id: number; key: string; value: unknown }>;
};

export type NormalizedProductVariant = {
  id: string;
  label: string;
  sku: string;
  price: number;
  regularPrice?: number;
  salePrice?: number;
  stockQuantity: number | null;
  inStock: boolean;
  attributes: Record<string, string>;
  image?: string;
};

export type NormalizedProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  type: "simple" | "variable";
  price: number;
  regularPrice?: number;
  salePrice?: number;
  inStock: boolean;
  images: Array<{ id: number; src: string; alt: string }>;
  variants: NormalizedProductVariant[];
  sku: string;
};

export type WooCommerceOrderLineItem = {
  product_id: number;
  variation_id?: number;
  quantity: number;
  name?: string;
  price?: string;
  subtotal?: string;
  total?: string;
  sku?: string;
  meta_data?: Array<{ key: string; value: string }>;
};

export type WooCommerceBillingAddress = {
  first_name: string;
  last_name?: string;
  company?: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
};

export type WooCommerceShippingAddress = {
  first_name: string;
  last_name?: string;
  company?: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone?: string;
};

export type WooCommerceCreateOrderInput = {
  payment_method: string;
  payment_method_title: string;
  set_paid: boolean;
  status?: "pending" | "processing" | "on-hold" | "completed" | "cancelled" | "refunded" | "failed";
  billing: WooCommerceBillingAddress;
  shipping: WooCommerceShippingAddress;
  line_items: WooCommerceOrderLineItem[];
  customer_note?: string;
  meta_data?: Array<{ key: string; value: unknown }>;
};

export type WooCommerceRawOrder = {
  id: number;
  number: string;
  order_key?: string;
  status: string;
  currency: string;
  total: string;
  total_tax?: string;
  billing: WooCommerceBillingAddress;
  shipping: WooCommerceShippingAddress;
  payment_method: string;
  payment_method_title: string;
  transaction_id?: string;
  date_created?: string;
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    subtotal: string;
    total: string;
    sku: string;
    price: number;
  }>;
  meta_data: Array<{ id: number; key: string; value: unknown }>;
};

export class WooCommerceApiError extends Error {
  readonly code:
    | "CONFIG_MISSING"
    | "HOST_UNREACHABLE"
    | "CHALLENGE_BLOCKED"
    | "AUTH_FAILED"
    | "NOT_FOUND"
    | "NETWORK_TIMEOUT"
    | "INVALID_RESPONSE"
    | "UPSTREAM_ERROR";
  readonly httpStatus: number;
  readonly retrySafe: boolean;

  constructor(
    message: string,
    code:
      | "CONFIG_MISSING"
      | "HOST_UNREACHABLE"
      | "CHALLENGE_BLOCKED"
      | "AUTH_FAILED"
      | "NOT_FOUND"
      | "NETWORK_TIMEOUT"
      | "INVALID_RESPONSE"
      | "UPSTREAM_ERROR",
    httpStatus: number = 500,
    retrySafe: boolean = false,
  ) {
    super(message);
    this.name = "WooCommerceApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retrySafe = retrySafe;
  }
}

export function getWooCommerceConfig() {
  const rawUrl = process.env.WOOCOMMERCE_URL?.trim() || "https://trenderabrand.infinityfreeapp.com";
  let baseUrl = rawUrl.replace(/\/+$/, "");
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`;
  }
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY?.trim() || "";
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET?.trim() || "";

  return {
    baseUrl,
    consumerKey,
    consumerSecret,
    isConfigured: Boolean(consumerKey && consumerSecret),
  };
}

/**
 * Builds request URL for WooCommerce REST API.
 * Supports both pretty permalinks (/wp-json/wc/v3/...) and standard rest_route fallback.
 */
function buildApiUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  useRestRouteFallback = false,
): URL {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  let url: URL;

  if (useRestRouteFallback) {
    url = new URL(baseUrl);
    url.searchParams.set("rest_route", cleanPath);
  } else {
    url = new URL(`${baseUrl}/wp-json${cleanPath}`);
  }

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

/**
 * Executes a safe, bounded fetch to WooCommerce.
 * Redacts secrets, detects InfinityFree anti-bot challenge HTML, and handles timeouts.
 */
export async function wooCommerceFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
    authenticated?: boolean;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<T> {
  const { baseUrl, consumerKey, consumerSecret, isConfigured } = getWooCommerceConfig();
  const {
    method = "GET",
    body,
    query = {},
    authenticated = true,
    timeoutMs = 8000,
    fetchImpl = fetch,
  } = options;

  if (authenticated && !isConfigured) {
    throw new WooCommerceApiError(
      "WooCommerce server credentials (WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET) are not configured.",
      "CONFIG_MISSING",
      503,
      true,
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "TrendEra-Storefront/1.0",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  // Use standard HTTP Basic Authentication over HTTPS
  if (authenticated && isConfigured) {
    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Try pretty URL first
  const targetUrl = buildApiUrl(baseUrl, path, query, false);

  try {
    let response: Response;
    try {
      response = await fetchImpl(targetUrl.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (networkError) {
      if (networkError instanceof Error && networkError.name === "AbortError") {
        throw new WooCommerceApiError(
          `WooCommerce request timed out after ${timeoutMs}ms.`,
          "NETWORK_TIMEOUT",
          504,
          true,
        );
      }
      throw new WooCommerceApiError(
        "WooCommerce host is currently unreachable.",
        "HOST_UNREACHABLE",
        502,
        true,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text().catch(() => "");

    // Check if hosting provider returned the InfinityFree anti-bot challenge
    if (rawText.includes("/aes.js") || rawText.includes("slowAES") || rawText.includes("This site requires Javascript")) {
      throw new WooCommerceApiError(
        "WooCommerce hosting provider (InfinityFree) security challenge intercepted the request.",
        "CHALLENGE_BLOCKED",
        502,
        false,
      );
    }

    // Check if pretty permalinks failed with 404
    if (response.status === 404 && !path.startsWith("?rest_route=")) {
      // Attempt rest_route fallback
      const fallbackUrl = buildApiUrl(baseUrl, path, query, true);
      try {
        const fallbackRes = await fetchImpl(fallbackUrl.toString(), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
          signal: controller.signal,
        });

        const fallbackText = await fallbackRes.text().catch(() => "");
        if (fallbackText.includes("/aes.js") || fallbackText.includes("slowAES")) {
          throw new WooCommerceApiError(
            "WooCommerce hosting provider security challenge intercepted the request.",
            "CHALLENGE_BLOCKED",
            502,
            false,
          );
        }

        if (fallbackRes.ok) {
          try {
            return JSON.parse(fallbackText) as T;
          } catch {
            throw new WooCommerceApiError(
              "WooCommerce returned invalid JSON response.",
              "INVALID_RESPONSE",
              502,
              false,
            );
          }
        }
      } catch (fallbackErr) {
        if (fallbackErr instanceof WooCommerceApiError) throw fallbackErr;
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new WooCommerceApiError(
        "WooCommerce API authentication failed. Verify Consumer Key and Consumer Secret.",
        "AUTH_FAILED",
        response.status,
        false,
      );
    }

    if (response.status === 404) {
      throw new WooCommerceApiError(
        "Requested WooCommerce endpoint or resource was not found.",
        "NOT_FOUND",
        404,
        false,
      );
    }

    if (!response.ok) {
      throw new WooCommerceApiError(
        `WooCommerce upstream error (HTTP ${response.status}).`,
        "UPSTREAM_ERROR",
        response.status,
        response.status >= 500,
      );
    }

    if (!contentType.includes("json") && rawText.trim().startsWith("<")) {
      throw new WooCommerceApiError(
        "WooCommerce returned HTML instead of JSON.",
        "INVALID_RESPONSE",
        502,
        false,
      );
    }

    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new WooCommerceApiError(
        "WooCommerce returned malformed JSON response.",
        "INVALID_RESPONSE",
        502,
        false,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalizes a raw WooCommerce product and optional variations into a clean storefront model.
 */
export function normalizeWooCommerceProduct(
  raw: WooCommerceRawProduct,
  variations: WooCommerceVariation[] = [],
): NormalizedProduct {
  const images = (raw.images || []).map((img) => ({
    id: img.id,
    src: img.src,
    alt: img.alt || img.name || raw.name,
  }));

  const mainPrice = Number(raw.price) || Number(raw.regular_price) || 0;
  const regularPrice = raw.regular_price ? Number(raw.regular_price) : undefined;
  const salePrice = raw.sale_price ? Number(raw.sale_price) : undefined;
  const inStock = raw.stock_status === "instock";

  let variants: NormalizedProductVariant[] = [];

  if (raw.type === "variable" && variations.length > 0) {
    variants = variations
      .filter((v) => v.status === "publish" && v.purchasable)
      .map((v) => {
        const attrMap: Record<string, string> = {};
        for (const attr of v.attributes || []) {
          attrMap[attr.name] = attr.option;
        }
        const labelParts = Object.values(attrMap);
        const label = labelParts.length > 0 ? labelParts.join(" / ") : `Variant #${v.id}`;
        const vPrice = Number(v.price) || Number(v.regular_price) || mainPrice;

        return {
          id: String(v.id),
          label,
          sku: v.sku || `${raw.sku || raw.id}-${v.id}`,
          price: vPrice,
          regularPrice: v.regular_price ? Number(v.regular_price) : undefined,
          salePrice: v.sale_price ? Number(v.sale_price) : undefined,
          stockQuantity: v.manage_stock ? v.stock_quantity : null,
          inStock: v.stock_status === "instock",
          attributes: attrMap,
          image: v.image?.src || images[0]?.src,
        };
      });
  } else {
    // Simple product has a single default variant
    variants = [
      {
        id: String(raw.id),
        label: "Default",
        sku: raw.sku || `PRD-${raw.id}`,
        price: mainPrice,
        regularPrice,
        salePrice,
        stockQuantity: raw.manage_stock ? raw.stock_quantity : null,
        inStock,
        attributes: {},
        image: images[0]?.src,
      },
    ];
  }

  return {
    id: String(raw.id),
    name: raw.name,
    slug: raw.slug,
    description: raw.description,
    shortDescription: raw.short_description,
    type: raw.type === "variable" ? "variable" : "simple",
    price: mainPrice,
    regularPrice,
    salePrice,
    inStock,
    images,
    variants,
    sku: raw.sku || `PRD-${raw.id}`,
  };
}

/**
 * Retrieves published products from WooCommerce.
 */
export async function getWooCommerceProducts(
  options: {
    page?: number;
    perPage?: number;
    search?: string;
    category?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<NormalizedProduct[]> {
  const { page = 1, perPage = 20, search, category, fetchImpl } = options;

  const rawProducts = await wooCommerceFetch<WooCommerceRawProduct[]>("/wc/v3/products", {
    query: {
      status: "publish",
      page,
      per_page: perPage,
      search,
      category,
    },
    fetchImpl,
  });

  if (!Array.isArray(rawProducts)) {
    return [];
  }

  const normalizedList: NormalizedProduct[] = [];

  for (const raw of rawProducts) {
    if (raw.type === "variable" && Array.isArray(raw.variations) && raw.variations.length > 0) {
      try {
        const variations = await wooCommerceFetch<WooCommerceVariation[]>(
          `/wc/v3/products/${raw.id}/variations`,
          { query: { per_page: 50 }, fetchImpl },
        );
        normalizedList.push(normalizeWooCommerceProduct(raw, Array.isArray(variations) ? variations : []));
      } catch {
        normalizedList.push(normalizeWooCommerceProduct(raw, []));
      }
    } else {
      normalizedList.push(normalizeWooCommerceProduct(raw));
    }
  }

  return normalizedList;
}

/**
 * Retrieves a single published product by ID or slug.
 */
export async function getWooCommerceProduct(
  idOrSlug: string | number,
  fetchImpl?: typeof fetch,
): Promise<NormalizedProduct | null> {
  let raw: WooCommerceRawProduct | null = null;

  if (typeof idOrSlug === "number" || /^\d+$/.test(idOrSlug)) {
    try {
      raw = await wooCommerceFetch<WooCommerceRawProduct>(`/wc/v3/products/${idOrSlug}`, { fetchImpl });
    } catch (err) {
      if (err instanceof WooCommerceApiError && err.code === "NOT_FOUND") return null;
      throw err;
    }
  } else {
    const list = await wooCommerceFetch<WooCommerceRawProduct[]>("/wc/v3/products", {
      query: { slug: idOrSlug, status: "publish" },
      fetchImpl,
    });
    raw = Array.isArray(list) && list.length > 0 ? list[0] : null;
  }

  if (!raw || raw.status !== "publish") return null;

  if (raw.type === "variable" && Array.isArray(raw.variations) && raw.variations.length > 0) {
    try {
      const variations = await wooCommerceFetch<WooCommerceVariation[]>(
        `/wc/v3/products/${raw.id}/variations`,
        { query: { per_page: 50 }, fetchImpl },
      );
      return normalizeWooCommerceProduct(raw, Array.isArray(variations) ? variations : []);
    } catch {
      return normalizeWooCommerceProduct(raw, []);
    }
  }

  return normalizeWooCommerceProduct(raw);
}

/**
 * Creates a WooCommerce order in pending (or specified) state.
 */
export async function createWooCommerceOrder(
  input: WooCommerceCreateOrderInput,
  fetchImpl?: typeof fetch,
): Promise<WooCommerceRawOrder> {
  return wooCommerceFetch<WooCommerceRawOrder>("/wc/v3/orders", {
    method: "POST",
    body: input,
    fetchImpl,
  });
}

/**
 * Retrieves a WooCommerce order by ID.
 */
export async function getWooCommerceOrder(
  orderId: number | string,
  fetchImpl?: typeof fetch,
): Promise<WooCommerceRawOrder> {
  return wooCommerceFetch<WooCommerceRawOrder>(`/wc/v3/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    fetchImpl,
  });
}

/**
 * Updates a WooCommerce order status and/or metadata (e.g. after Cashfree verified payment or Qikink submission).
 */
export async function updateWooCommerceOrder(
  orderId: number | string,
  update: {
    status?: "pending" | "processing" | "on-hold" | "completed" | "cancelled" | "refunded" | "failed";
    set_paid?: boolean;
    transaction_id?: string;
    meta_data?: Array<{ key: string; value: unknown }>;
  },
  fetchImpl?: typeof fetch,
): Promise<WooCommerceRawOrder> {
  return wooCommerceFetch<WooCommerceRawOrder>(`/wc/v3/orders/${encodeURIComponent(orderId)}`, {
    method: "PUT",
    body: update,
    fetchImpl,
  });
}

/**
 * Safe diagnostic connectivity test that checks reachability and auth without leaking secrets.
 */
export async function verifyWooCommerceConnectivity(fetchImpl?: typeof fetch): Promise<{
  configured: boolean;
  reachable: boolean;
  authenticated: boolean;
  catalogueCount: number | null;
  statusMessage: string;
  isChallengeBlocked: boolean;
  httpStatus?: number;
}> {
  const { isConfigured } = getWooCommerceConfig();

  if (!isConfigured) {
    return {
      configured: false,
      reachable: false,
      authenticated: false,
      catalogueCount: null,
      statusMessage: "WooCommerce environment variables (WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET) are missing.",
      isChallengeBlocked: false,
    };
  }

  try {
    const products = await wooCommerceFetch<WooCommerceRawProduct[]>("/wc/v3/products", {
      query: { per_page: 1 },
      fetchImpl,
      timeoutMs: 8000,
    });

    const count = Array.isArray(products) ? products.length : 0;
    return {
      configured: true,
      reachable: true,
      authenticated: true,
      catalogueCount: count,
      statusMessage: count === 0 ? "Connected successfully. WooCommerce catalogue is currently empty ([])" : `Connected successfully. Found products.`,
      isChallengeBlocked: false,
      httpStatus: 200,
    };
  } catch (error) {
    if (error instanceof WooCommerceApiError) {
      return {
        configured: true,
        reachable: error.code !== "HOST_UNREACHABLE" && error.code !== "NETWORK_TIMEOUT",
        authenticated: error.code !== "AUTH_FAILED" && error.code !== "CONFIG_MISSING",
        catalogueCount: null,
        statusMessage: error.message,
        isChallengeBlocked: error.code === "CHALLENGE_BLOCKED",
        httpStatus: error.httpStatus,
      };
    }
    return {
      configured: true,
      reachable: false,
      authenticated: false,
      catalogueCount: null,
      statusMessage: error instanceof Error ? error.message : "Unknown connectivity failure",
      isChallengeBlocked: false,
    };
  }
}
