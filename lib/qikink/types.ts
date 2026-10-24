export type QikinkGateway = "online" | "cash_on_delivery";

export interface QikinkDesign {
  design_code: string;
  width_inches?: number;
  height_inches?: number;
  placement_sku?: string;
  design_link?: string;
  mockup_link?: string;
}

export interface QikinkLineItem {
  search_from_my_products: boolean;
  price: string;
  quantity: number;
  sku: string;
  designs?: QikinkDesign[];
}

export interface QikinkShippingAddress {
  first_name: string;
  last_name?: string;
  address1: string;
  address2?: string;
  phone: string;
  email: string;
  city: string;
  zip: string;
  province: string;
  country: string;
  country_code: string;
  name?: string;
}

export interface QikinkCreateOrderInput {
  order_number: string;
  qikink_shipping: 0 | 1;
  gateway: QikinkGateway;
  total_order_value: string;
  line_items: QikinkLineItem[];
  shipping_address?: QikinkShippingAddress;
}

export interface QikinkCreateOrderResult {
  code: number;
  order_id?: string | number;
  msg?: string;
}
