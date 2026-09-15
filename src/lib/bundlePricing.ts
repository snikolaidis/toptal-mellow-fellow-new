// Single source of truth for "pre-discount" price math shared by the cart
// drawer, full cart page, checkout summaries (desktop/mobile), and the order
// payload — previously each had its own copy, which is how the byob bundle
// original-price bug got fixed in one place and reappeared in five others.

export interface PricedProduct {
  product: { price: string; regularPrice?: string };
}

export function parsePrice(value?: string): number {
  return value ? parseFloat(value.replace(/[^0-9.-]/g, '')) || 0 : 0;
}

// MSRP-based "was" price. Correct for a standalone product's own sale, or a
// free gift's advertised value — NOT for a bundle component, whose current
// price may already be bundle-discounted (see bundleItemOriginalPrice).
export function originalUnitPrice(item: PricedProduct): number {
  return parsePrice(item.product.regularPrice || item.product.price);
}

// A bundle component's pre-bundle-discount unit price: Bundle Builder's own
// frozen catalog price (extensions.bundle.base_price), correct for both
// "fixed" and "byob" modes. Falls back to MSRP if it's ever absent.
export function bundleItemOriginalPrice(item: PricedProduct & { bbBasePrice?: number }): number {
  return item.bbBasePrice ?? originalUnitPrice(item);
}
