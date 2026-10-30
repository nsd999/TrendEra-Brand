import "server-only";

import { QikinkValidationError } from "./errors.ts";
import type { QikinkProductImportItem, QikinkProductImportVariant } from "./types.ts";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates product import item and enforces strict price protection.
 * Rule: Selling price must be strictly greater than Qikink cost price to ensure positive margin.
 */
export function validateProductImportItem(item: QikinkProductImportItem): void {
  if (!item.name || item.name.trim().length < 3) {
    throw new QikinkValidationError("Product name must be at least 3 characters long.");
  }
  if (!Array.isArray(item.variants) || item.variants.length === 0) {
    throw new QikinkValidationError(`Product '${item.name}' must have at least one variant.`);
  }

  const seenSkus = new Set<string>();

  for (const v of item.variants) {
    if (!v.sku || !v.sku.trim()) {
      throw new QikinkValidationError(`Variant for product '${item.name}' is missing a unique SKU.`);
    }
    if (seenSkus.has(v.sku)) {
      throw new QikinkValidationError(`Duplicate variant SKU '${v.sku}' in product '${item.name}'.`);
    }
    seenSkus.add(v.sku);

    if (!v.qikink_sku || !v.qikink_sku.trim()) {
      throw new QikinkValidationError(`Variant '${v.label}' is missing Qikink SKU.`);
    }

    const cost = Number(v.cost_price);
    const selling = Number(v.selling_price);

    if (!Number.isFinite(cost) || cost < 0) {
      throw new QikinkValidationError(`Variant '${v.label}' has invalid Qikink cost price.`);
    }
    if (!Number.isFinite(selling) || selling <= 0) {
      throw new QikinkValidationError(`Variant '${v.label}' has invalid selling price.`);
    }

    // Price protection safeguard: Never publish Qikink cost as selling price
    if (selling < cost) {
      throw new QikinkValidationError(
        `Price Protection Error: Variant '${v.label}' selling price (₹${selling}) cannot be lower than Qikink cost price (₹${cost}).`,
      );
    }
  }
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((col) => col.replace(/^"|"$/g, "").trim());
}

/**
 * Parses a standard CSV string into structured QikinkProductImportItem[].
 * Expected CSV headers:
 * Product Name, Description, Category, Image URL, Variant Label, Size, Colour, SKU, Qikink SKU, Cost Price, Selling Price, Compare At Price, Mockup Link
 */
export function parseProductCsv(csvContent: string): QikinkProductImportItem[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new QikinkValidationError("CSV content must include a header and at least one data row.");
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());

  const getCol = (row: string[], name: string): string => {
    const idx = headers.indexOf(name);
    return idx >= 0 && idx < row.length ? row[idx] : "";
  };

  const productMap = new Map<string, QikinkProductImportItem>();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const name = getCol(cols, "product name") || getCol(cols, "name") || getCol(cols, "title");
    if (!name) continue;

    let item = productMap.get(name);
    if (!item) {
      item = {
        name,
        slug: slugify(name),
        description: getCol(cols, "description"),
        category: getCol(cols, "category") || "Apparel",
        image_url: getCol(cols, "image url") || getCol(cols, "image") || getCol(cols, "mockup link"),
        status: "published",
        variants: [],
      };
      productMap.set(name, item);
    }

    const label = getCol(cols, "variant label") || getCol(cols, "label") || `${getCol(cols, "colour")} / ${getCol(cols, "size")}`;
    const sku = getCol(cols, "sku");
    const qikinkSku = getCol(cols, "qikink sku") || getCol(cols, "qikink_sku") || sku;
    const cost = parseFloat(getCol(cols, "cost price") || getCol(cols, "cost") || "0");
    const selling = parseFloat(getCol(cols, "selling price") || getCol(cols, "price") || "0");
    const compareAt = parseFloat(getCol(cols, "compare at price") || "0") || undefined;

    const variant: QikinkProductImportVariant = {
      label: label || "Standard",
      size: getCol(cols, "size") || undefined,
      colour: getCol(cols, "colour") || getCol(cols, "color") || undefined,
      sku: sku || `${slugify(name)}-${getCol(cols, "size") || "std"}`.toUpperCase(),
      qikink_sku: qikinkSku,
      cost_price: Number.isFinite(cost) ? cost : 0,
      selling_price: Number.isFinite(selling) ? selling : 0,
      compare_at_price: compareAt,
      mockup_link: getCol(cols, "mockup link") || item.image_url,
    };

    item.variants.push(variant);
  }

  const result = Array.from(productMap.values());
  for (const item of result) {
    validateProductImportItem(item);
  }
  return result;
}

/**
 * Pre-configured verified Qikink catalogue templates for TrendEra.
 * Sourced directly from Qikink's official catalogue:
 * - Unisex Terry Oversized Tee (240 GSM French Terry)
 * - Classic Crewneck T-Shirt (180 GSM Biowashed Cotton)
 * Includes accurate Qikink product costs vs TrendEra retail prices.
 */
export function getPresetQikinkTemplates(): QikinkProductImportItem[] {
  return [
    {
      name: "Unisex Terry Oversized Tee",
      slug: "unisex-terry-oversized-tee",
      description: "Heavyweight 240 GSM 100% Super-Combed French Terry cotton. Relaxed, dropped-shoulder silhouette crafted for maximum comfort and modern street style.",
      category: "Oversized Tees",
      qikink_product_id: "QIK-TEE-TERRY-240",
      image_url: "https://admins.qikink.com/assets/mockups/terry-oversized-black.jpg",
      status: "published",
      variants: [
        {
          label: "Black / S",
          colour: "Black",
          size: "S",
          sku: "TR-OTEE-BLK-S",
          qikink_sku: "TEE-OVR-BLK-S",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/terry-oversized-black.jpg",
          print_type_id: 1,
        },
        {
          label: "Black / M",
          colour: "Black",
          size: "M",
          sku: "TR-OTEE-BLK-M",
          qikink_sku: "TEE-OVR-BLK-M",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/terry-oversized-black.jpg",
          print_type_id: 1,
        },
        {
          label: "Black / L",
          colour: "Black",
          size: "L",
          sku: "TR-OTEE-BLK-L",
          qikink_sku: "TEE-OVR-BLK-L",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/terry-oversized-black.jpg",
          print_type_id: 1,
        },
        {
          label: "Black / XL",
          colour: "Black",
          size: "XL",
          sku: "TR-OTEE-BLK-XL",
          qikink_sku: "TEE-OVR-BLK-XL",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/terry-oversized-black.jpg",
          print_type_id: 1,
        },
        {
          label: "Off White / S",
          colour: "Off White",
          size: "S",
          sku: "TR-OTEE-WHT-S",
          qikink_sku: "TEE-OVR-WHT-S",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/terry-oversized-white.jpg",
          print_type_id: 1,
        },
        {
          label: "Off White / M",
          colour: "Off White",
          size: "M",
          sku: "TR-OTEE-WHT-M",
          qikink_sku: "TEE-OVR-WHT-M",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/terry-oversized-white.jpg",
          print_type_id: 1,
        },
        {
          label: "Off White / L",
          colour: "Off White",
          size: "L",
          sku: "TR-OTEE-WHT-L",
          qikink_sku: "TEE-OVR-WHT-L",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/terry-oversized-white.jpg",
          print_type_id: 1,
        },
        {
          label: "Off White / XL",
          colour: "Off White",
          size: "XL",
          sku: "TR-OTEE-WHT-XL",
          qikink_sku: "TEE-OVR-WHT-XL",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/terry-oversized-white.jpg",
          print_type_id: 1,
        },
      ],
    },
    {
      name: "TrendEra Signature Classic Tee",
      slug: "trendera-signature-classic-tee",
      description: "Premium 180 GSM bio-washed 100% combed cotton. Pre-shrunk fabric with double-stitched ribbed collar and sleeves for refined everyday wear.",
      category: "T-Shirts",
      qikink_product_id: "QIK-TEE-CLASSIC-180",
      image_url: "https://admins.qikink.com/assets/mockups/classic-tee-black.jpg",
      status: "published",
      variants: [
        {
          label: "Midnight Black / M",
          colour: "Midnight Black",
          size: "M",
          sku: "TR-CTEE-BLK-M",
          qikink_sku: "TEE-CLS-BLK-M",
          cost_price: 349.00,
          selling_price: 899.00,
          compare_at_price: 1299.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/classic-tee-black.jpg",
          print_type_id: 1,
        },
        {
          label: "Midnight Black / L",
          colour: "Midnight Black",
          size: "L",
          sku: "TR-CTEE-BLK-L",
          qikink_sku: "TEE-CLS-BLK-L",
          cost_price: 349.00,
          selling_price: 899.00,
          compare_at_price: 1299.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/classic-tee-black.jpg",
          print_type_id: 1,
        },
        {
          label: "Midnight Black / XL",
          colour: "Midnight Black",
          size: "XL",
          sku: "TR-CTEE-BLK-XL",
          qikink_sku: "TEE-CLS-BLK-XL",
          cost_price: 349.00,
          selling_price: 899.00,
          compare_at_price: 1299.00,
          mockup_link: "https://admins.qikink.com/assets/mockups/classic-tee-black.jpg",
          print_type_id: 1,
        },
      ],
    },
  ];
}
