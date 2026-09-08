import { CannabinoidServing, Product, ProductNutrition } from '@/types/woocommerce';
import NutritionBadge, { NUTRITION_BADGE_PRESETS } from './NutritionBadge';

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

function isBeverage(productTypes?: Props['productTypes']): boolean {
  return (productTypes?.nodes || []).some((t) => t.name?.toLowerCase() === 'beverage');
}

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

export default function Nutrition({ nutrition, mG, pieces, cannabinoids, productTypes }: Props) {

  const { calories, sugar } = nutrition || {};
  const hasSugar = hasValue(sugar);
  const hasCalories = hasValue(calories);
  const perPack = computePerPack(mG, pieces);

  const showCannabinoids = isBeverage(productTypes);
  const thc = showCannabinoids ? findCannabinoid(cannabinoids, ['d9', 'delta-9', 'delta 9']) : null;
  const cbd = showCannabinoids ? findCannabinoid(cannabinoids, ['cbd', 'cannabidiol']) : null;

  if (!hasSugar && !hasCalories && !perPack && !thc && !cbd) {
    return null;
  }

  return (
    <div className="product-nutrition">
      <h3 className="product-nutrition__heading">Nutrition</h3>

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

      {hasCalories && (
        <ul className="product-nutrition__tiles">
          <li className="product-nutrition__tile product-nutrition__tile--calories">
            <span className="product-nutrition__tile-value">{calories}</span>
            <span className="product-nutrition__tile-label">Calories</span>
          </li>
        </ul>
      )}
    </div>
  );
}
