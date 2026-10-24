const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isAmount = (value) => typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value);
const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

export function validateQikinkOrderInput(input) {
  if (!input || typeof input !== "object") return "Order payload must be an object.";
  if (!isNonEmptyString(input.order_number) || !/^[A-Za-z0-9]{1,15}$/.test(input.order_number)) {
    return "order_number must contain 1–15 alphanumeric characters.";
  }
  if (input.qikink_shipping !== 0 && input.qikink_shipping !== 1) return "qikink_shipping must be 0 or 1.";
  if (input.gateway !== "online" && input.gateway !== "cash_on_delivery") return "gateway must be online or cash_on_delivery.";
  if (!isAmount(input.total_order_value)) return "total_order_value must be a non-negative decimal string.";
  if (!Array.isArray(input.line_items) || input.line_items.length < 1 || input.line_items.length > 100) {
    return "line_items must contain between 1 and 100 items.";
  }

  for (const [index, item] of input.line_items.entries()) {
    if (!item || typeof item !== "object") return `line_items[${index}] must be an object.`;
    if (typeof item.search_from_my_products !== "boolean") return `line_items[${index}].search_from_my_products must be boolean.`;
    if (!isNonEmptyString(item.sku) || item.sku.length > 100) return `line_items[${index}].sku is invalid.`;
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) return `line_items[${index}].quantity must be an integer from 1 to 20.`;
    if (!isAmount(item.price)) return `line_items[${index}].price must be a non-negative decimal string.`;
    if (item.designs !== undefined && !Array.isArray(item.designs)) return `line_items[${index}].designs must be an array when provided.`;
    for (const [designIndex, design] of (item.designs ?? []).entries()) {
      if (!design || typeof design !== "object" || !isNonEmptyString(design.design_code) || design.design_code.length > 15) {
        return `line_items[${index}].designs[${designIndex}].design_code is invalid.`;
      }
      for (const key of ["design_link", "mockup_link"]) {
        if (design[key] !== undefined && !isHttpUrl(design[key])) return `line_items[${index}].designs[${designIndex}].${key} must be an HTTP(S) URL.`;
      }
      for (const key of ["width_inches", "height_inches"]) {
        if (design[key] !== undefined && (!Number.isFinite(design[key]) || design[key] <= 0 || design[key] > 100)) {
          return `line_items[${index}].designs[${designIndex}].${key} is invalid.`;
        }
      }
    }
  }

  if (input.qikink_shipping === 1) {
    const address = input.shipping_address;
    if (!address || typeof address !== "object") return "shipping_address is required when Qikink shipping is enabled.";
    for (const key of ["first_name", "address1", "phone", "email", "city", "zip", "province", "country_code"]) {
      if (!isNonEmptyString(address[key])) return `shipping_address.${key} is required.`;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email)) return "shipping_address.email is invalid.";
    if (address.country_code.length !== 2) return "shipping_address.country_code must be a 2-character country code.";
  }
  return null;
}
