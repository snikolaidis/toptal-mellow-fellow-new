import { CannabinoidServing, Product, ProductNutrition } from '@/types/woocommerce';
import NutritionBadge, { NUTRITION_BADGE_PRESETS } from './NutritionBadge';
import { CaloriesIcon, CansIcon, OnsetIcon, SocialBuzzIcon } from './FeatureIcons';

interface Props {
  nutrition?: ProductNutrition | null;
  mG?: Product['mG'];
  pieces?: Product['pieces'];
  cannabinoids?: CannabinoidServing[];
  productTypes?: Product['mfproductTypes'];
}

// `calories`/`sugar` are ACF text fields, not number fields, so an unset
// value can arrive as either null or an empty/whitespace string.
function hasValue(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

// `mG` ("20mg") and `pieces` ("4-pk") are taxonomy term names, not numbers —
// pull the leading number off each and multiply for a per-pack mg total.
// Neither taxonomy is scoped to nutrition-bearing products, so an absent or
// unparseable term (e.g. a non-numeric pieces term) just hides the badge.
function parseLeadingNumber(name: string | null | undefined): number | null {
  const match = name?.match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function computePerPack(mG?: Props['mG'], pieces?: Props['pieces']): string | null {
  const mgValue = parseLeadingNumber(mG?.nodes?.[0]?.name);
  const pieceCount = parseLeadingNumber(pieces?.nodes?.[0]?.name);
  if (mgValue == null || pieceCount == null) return null;
  return String(mgValue * pieceCount);
}

// The badge labels are outlined vector artwork, and the only cannabinoid
// labels drawn are "DELTA-9 THC" and "CANNABIDIOL". Beverages are the one
// category whose data consistently uses those two (D9 + CBD, whole-milligram
// values); the rest of the catalogue leads with D8, THCp, CBG and others, often
// at sub-milligram doses, which these badges cannot label or display honestly.
// The feature tiles below are scoped to beverages for the same reason — the
// copy ("12oz Cans", onset window) only holds for drinks.
function isBeverageProduct(productTypes?: Props['productTypes']): boolean {
  return (productTypes?.nodes || []).some((t) => t.name?.toLowerCase() === 'beverage');
}

// `cannabinoid` is free text, so match case-insensitively and tolerate the
// handful of spellings seen in the data rather than an exact key.
function findCannabinoid(
  rows: CannabinoidServing[] | undefined,
  aliases: string[]
): string | null {
  const row = (rows || []).find((r) => {
    const key = (r.cannabinoid || '').trim().toLowerCase();
    return aliases.includes(key);
  });
  return row?.mg != null ? String(row.mg) : null;
}

// "12oz Cans" isn't backed by any field — no beverage has a volume or
// container-type taxonomy today — so it's fixed copy, scoped to beverages
// only. Pack count still comes from the real `pieces` term.
function cansLabel(pieces?: Props['pieces']): string {
  const count = parseLeadingNumber(pieces?.nodes?.[0]?.name);
  if (count == null) return '12oz Cans';
  return count === 1 ? 'Single 12oz Can' : `${count}-Pack 12oz Cans`;
}

export default function Nutrition({
  nutrition,
  mG,
  pieces,
  cannabinoids,
  productTypes,
}: Props) {
  const { calories, sugar } = nutrition || {};
  const hasSugar = hasValue(sugar);
  const hasCalories = hasValue(calories);
  const perPack = computePerPack(mG, pieces);

  const isBeverage = isBeverageProduct(productTypes);
  const thc = isBeverage ? findCannabinoid(cannabinoids, ['d9', 'delta-9', 'delta 9']) : null;
  const cbd = isBeverage ? findCannabinoid(cannabinoids, ['cbd', 'cannabidiol']) : null;
  const hasFeatureTiles = hasCalories || isBeverage;

  if (!hasSugar && !hasCalories && !perPack && !thc && !cbd && !isBeverage) {
    return null;
  }

  return (
    <div className="product-nutrition">
      <h3 className="product-nutrition__heading">Nutrition</h3>

      {/* Badge order follows the mockup: THC, CBD, per pack, sugar. */}
      {(thc || cbd || hasSugar || perPack) && (
        <ul className="product-nutrition__badges">
          {thc && (
            <li>
              <NutritionBadge preset={NUTRITION_BADGE_PRESETS.thc} value={thc} />
            </li>
          )}
          {cbd && (
            <li>
              <NutritionBadge preset={NUTRITION_BADGE_PRESETS.cbd} value={cbd} />
            </li>
          )}
          {perPack && (
            <li>
              <NutritionBadge preset={NUTRITION_BADGE_PRESETS.perPack} value={perPack} />
            </li>
          )}
          {hasSugar && (
            <li>
              <NutritionBadge preset={NUTRITION_BADGE_PRESETS.sugar} value={sugar} />
            </li>
          )}
        </ul>
      )}

      {hasFeatureTiles && (
        <ul className="product-nutrition__tiles">
          {isBeverage && (
            <li className="product-nutrition__tile product-nutrition__tile--social">
              <span className="product-nutrition__tile-icon"><SocialBuzzIcon /></span>
              <span className="product-nutrition__tile-label">Social Buzz</span>
            </li>
          )}
          {isBeverage && (
            <li className="product-nutrition__tile product-nutrition__tile--cans">
              <span className="product-nutrition__tile-icon"><CansIcon /></span>
              <span className="product-nutrition__tile-label">{cansLabel(pieces)}</span>
            </li>
          )}
          {isBeverage && (
            <li className="product-nutrition__tile product-nutrition__tile--onset">
              <span className="product-nutrition__tile-icon"><OnsetIcon /></span>
              <span className="product-nutrition__tile-label">15-30 min Onset</span>
            </li>
          )}
          {hasCalories && (
            <li className="product-nutrition__tile product-nutrition__tile--calories">
              <span className="product-nutrition__tile-icon"><CaloriesIcon /></span>
              <span className="product-nutrition__tile-label">{calories} Calories</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
