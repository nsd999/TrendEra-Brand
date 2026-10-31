import "server-only";

export type QikinkMode = "sandbox" | "live";

export type QikinkTokenResponse = {
  ClientId?: string;
  Accesstoken?: string;
  expires_in?: number;
  message?: string;
};

export type QikinkDesign = {
  design_code: string;
  width_inches: string;
  height_inches: string;
  placement_sku: string;
  design_link: string;
  mockup_link: string;
};

export type QikinkLineItem = {
  sku: string;
  price: string;
  quantity: number;
  print_type_id: number;
  design?: QikinkDesign | null;
};

export type QikinkShippingAddress = {
  first_name: string;
  last_name?: string;
  address1: string;
  address2?: string;
  phone: string;
  email: string;
  city: string;
  zip: string;
  province: string;
  country?: string;
  country_code: string;
};

export type QikinkCreateOrderInput = {
  order_number: string;
  gateway: "Prepaid" | "COD";
  total_order_value: number;
  line_items: QikinkLineItem[];
  shipping_address: QikinkShippingAddress;
};

export type QikinkOrderResponse = {
  order_id?: number | string;
  status_code?: string | number;
  code?: string | number;
  message?: string;
  msg?: string;
  error?: string;
};

export type QikinkShippingInfo = {
  first_name?: string;
  last_name?: string;
  city?: string;
  zip?: string;
  province?: string;
  country_code?: string;
  awb?: string | null;
  tracking_link?: string | null;
  courier_provider_name?: string | null;
};

export type QikinkOrder = {
  order_id: number;
  number: string;
  created_on: string;
  live_date: string | null;
  status: string;
  shipping_type: string;
  payment_type: string;
  total_order_value: string;
  shipping?: QikinkShippingInfo;
  line_items?: Array<{
    sku: string;
    quantity: string;
    price: string;
  }>;
};

export type QikinkOrderListQuery = {
  order_reference_no?: string;
  status?: string;
  id?: string;
  ids?: string;
  params?: string;
  live_date_min?: string;
  live_date_max?: string;
  page_no?: number;
};

export type QikinkOrderListResponse = {
  success?: boolean;
  data?: QikinkOrder[];
  pagination?: {
    page: number;
    per_page: number;
    total_results: number;
    total_pages: number;
    has_next: boolean;
  };
  filters?: Record<string, string>;
  message?: string;
};

export type QikinkConnectionStatus = {
  connected: boolean;
  mode: QikinkMode;
  liveApiUrl: string;
  sandboxApiUrl: string;
  authenticated: boolean;
  tokenExpiresInSeconds?: number;
  latencyMs?: number;
  lastChecked: string;
  error?: string;
};

export type QikinkProductImportVariant = {
  label: string;
  size?: string;
  colour?: string;
  sku: string;
  qikink_sku: string;
  cost_price: number;
  selling_price: number;
  compare_at_price?: number;
  mockup_link?: string;
  design_code?: string;
  design_link?: string;
  width_inches?: string;
  height_inches?: string;
  placement_sku?: string;
  print_type_id?: number;
};

export type QikinkProductImportItem = {
  name: string;
  slug?: string;
  description: string;
  category?: string;
  qikink_product_id?: string;
  image_url?: string;
  status?: "draft" | "published";
  variants: QikinkProductImportVariant[];
};

export type QikinkSyncResult = {
  success: boolean;
  createdProducts: number;
  updatedProducts: number;
  createdVariants: number;
  updatedVariants: number;
  errors: string[];
};

export type QikinkTrackingSyncResult = {
  orderId: string;
  orderNumber: string;
  qikinkOrderId?: string;
  status?: string;
  awb?: string | null;
  courier?: string | null;
  trackingUrl?: string | null;
  synced: boolean;
  error?: string;
};
