// Shared by the Shop mega menu's product column and the mood page chips row.
// Both used to name the same six files; this is the one copy, so a renamed or
// replaced asset cannot update in one and not the other.
export interface ProductIcon {
  src: string;
  width: number;
  height: number;
}

// Intrinsic file dimensions. Edibles is the one that is not square, so anything
// rendering these at a fixed box has to scale from both numbers rather than
// assume 1:1.
export const PRODUCT_ICONS: Record<string, ProductIcon> = {
  'disposable-vapes': {
    src: '/disposable-vapes-megamenu.png',
    width: 200,
    height: 200,
  },
  'vape-cartridges': {
    src: '/vape-cartridges-megamenu.png',
    width: 200,
    height: 200,
  },
  edibles: { src: '/edibles-megamenu.png', width: 200, height: 181 },
  drinks: { src: '/drinks-megamenu.png', width: 200, height: 200 },
  flower: { src: '/flower-megamenu.png', width: 200, height: 200 },
  concentrates: { src: '/concentrates-megamenu.png', width: 200, height: 200 },
  bundles: { src: '/bundles-icon.svg', width: 25, height: 28 },
  all: { src: '/shop-all-products-icon.svg', width: 25, height: 28 },
  // Keyed by name, not by its collection slug: the menu item points at
  // terp-sauce-2ml-syringes-thca-blends, which PROMOTED maps to this key.
  syringes: { src: '/syringes-icon.png', width: 386, height: 1126 },
};

// The optimizer rejects SVG unless dangerouslyAllowSVG is set, and does so at
// request time. Callers pass this as `unoptimized` to skip it.
export const isVectorIcon = (icon: ProductIcon) => icon.src.endsWith('.svg');

export const getProductIcon = (slug: string): ProductIcon | undefined =>
  PRODUCT_ICONS[slug];

export const scaleIcon = (icon: ProductIcon, height: number) => ({
  width: Math.round((icon.width / icon.height) * height),
  height,
});
