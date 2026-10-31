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
 * Sourced directly from your live Qikink dashboard products:
 * 1. Unisex Terry Oversized Tee (ID: 64974906) - ₹633.20 cost / ₹1,499.00 selling
 * 2. Acrylic Poster (ID: 64938236) - ₹706.82 cost / ₹799.00 selling
 * 3. BaseBall Ottoman Cap (ID: 64938232) - ₹348.60 cost / ₹599.00 selling
 * 4. Unisex Oversized Jersey (ID: 64938230) - ₹168.00 cost / ₹499.00 selling
 */
export function getPresetQikinkTemplates(): QikinkProductImportItem[] {
  return [
    {
      name: "Unisex Terry Oversized Tee",
      slug: "unisex-terry-oversized-tee",
      description: "Heavyweight 240 GSM 100% French Terry cotton. Relaxed, dropped-shoulder silhouette featuring 'The Crow's Oath' front and back artwork.",
      category: "Cotton Apparels",
      qikink_product_id: "64974906",
      image_url: "https://admins.qikink.com/assets/mockups/terry-oversized-black.jpg",
      status: "published",
      variants: [
        {
          label: "Black / XS",
          colour: "Black",
          size: "XS",
          sku: "TR-OTEE-BLK-XS",
          qikink_sku: "64974906-BLK-XS",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          design_code: "TRENDERA_DL01_The_Crows_Oath_FRONT_300DPI",
          width_inches: "14",
          height_inches: "15.79",
          placement_sku: "fr",
          print_type_id: 1,
        },
        {
          label: "Black / S",
          colour: "Black",
          size: "S",
          sku: "TR-OTEE-BLK-S",
          qikink_sku: "64974906-BLK-S",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          design_code: "TRENDERA_DL01_The_Crows_Oath_FRONT_300DPI",
          width_inches: "14",
          height_inches: "15.79",
          placement_sku: "fr",
          print_type_id: 1,
        },
        {
          label: "Black / M",
          colour: "Black",
          size: "M",
          sku: "TR-OTEE-BLK-M",
          qikink_sku: "64974906-BLK-M",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          design_code: "TRENDERA_DL01_The_Crows_Oath_FRONT_300DPI",
          width_inches: "14",
          height_inches: "15.79",
          placement_sku: "fr",
          print_type_id: 1,
        },
        {
          label: "Black / L",
          colour: "Black",
          size: "L",
          sku: "TR-OTEE-BLK-L",
          qikink_sku: "64974906-BLK-L",
          cost_price: 633.20,
          selling_price: 1499.00,
          compare_at_price: 1999.00,
          design_code: "TRENDERA_DL01_The_Crows_Oath_FRONT_300DPI",
          width_inches: "14",
          height_inches: "15.79",
          placement_sku: "fr",
          print_type_id: 1,
        },
      ],
    },
    {
      name: "Acrylic Poster",
      slug: "acrylic-poster",
      description: "Ultra-high definition acrylic glass wall art. Crystal clear optical grade acrylic with rich, vibrant colors and polished edges.",
      category: "Accessories",
      qikink_product_id: "64938236",
      image_url: "https://admins.qikink.com/assets/mockups/acrylic-poster.jpg",
      status: "published",
      variants: [
        {
          label: "16x24 Inch",
          size: "16x24Inch",
          sku: "TR-POSTER-16X24",
          qikink_sku: "64938236-16X24",
          cost_price: 706.82,
          selling_price: 799.00,
          compare_at_price: 999.00,
          design_code: "file_00000000e5008211805f0d679e1e9542",
          width_inches: "16",
          height_inches: "24",
          placement_sku: "fr",
          print_type_id: 1,
        },
      ],
    },
    {
      name: "BaseBall Ottoman Cap",
      slug: "baseball-ottoman-cap",
      description: "Structured 6-panel Ottoman textured baseball cap with curved visor and adjustable closure. Premium DTF embroidery quality.",
      category: "Headwear",
      qikink_product_id: "64938232",
      image_url: "https://admins.qikink.com/assets/mockups/ottoman-cap.jpg",
      status: "published",
      variants: [
        {
          label: "Standard / Black",
          colour: "Black",
          size: "Standard",
          sku: "TR-CAP-OTM-STD",
          qikink_sku: "64938232-STD",
          cost_price: 348.60,
          selling_price: 599.00,
          compare_at_price: 799.00,
          design_code: "file_00000000e5008211805f0d679e1e9542",
          width_inches: "3",
          height_inches: "3",
          placement_sku: "fr",
          print_type_id: 1,
        },
      ],
    },
    {
      name: "Unisex Oversized Jersey",
      slug: "unisex-oversized-jersey",
      description: "Lightweight moisture-wicking breathable sports jersey. Engineered for an effortless oversized fit with sublimation graphics.",
      category: "Sportswear",
      qikink_product_id: "64938230",
      image_url: "https://admins.qikink.com/assets/mockups/oversized-jersey.jpg",
      status: "published",
      variants: [
        {
          label: "White / XS",
          colour: "White",
          size: "XS",
          sku: "TR-JERSEY-OVR-XS",
          qikink_sku: "64938230-XS",
          cost_price: 168.00,
          selling_price: 499.00,
          compare_at_price: 699.00,
          design_code: "file_00000000e5008211805f0d679e1e9542",
          width_inches: "10.24",
          height_inches: "10.24",
          placement_sku: "fr",
          print_type_id: 1,
        },
      ],
    },
  ];
}
