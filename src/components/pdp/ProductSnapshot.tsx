import { Product, ProductNutrition } from '@/types/woocommerce';
import SnapshotBadge from './SnapshotBadge';
import { CaloriesIcon, CansIcon, OnsetIcon, SocialBuzzIcon } from './FeatureIcons';

interface Props {
  nutrition?: ProductNutrition | null;
  mG?: Product['mG'];
  size?: Product['size'];
  pieces?: Product['pieces'];
  topCannabinoids?: string[];
  productTypes?: Product['mfproductTypes'];
}

// Badge label for each `top3Cannabinoids` choice key. Keys are lower-cased
// because the stored values aren't consistently cased ("THCp", "CBDv").
// Doubles as the alt text for the artwork below.
const CANNABINOID_LABELS: Record<string, string> = {
  d8: 'DELTA-8 THC',
  d9: 'DELTA-9 THC',
  d10: 'DELTA-10 THC',
  d11: 'DELTA-11 THC',
  cbd: 'CANNABIDIOL',
  cbda: 'CBDA',
  cbg: 'CANNABIGEROL',
  cbn: 'CANNABINOL',
  cbc: 'CANNABICHROMENE',
  cbdv: 'CBDV',
  cbga: 'CBGA',
  h4cbd: 'H4CBD',
  thca: 'THCA',
  thcb: 'THCB',
  thch: 'THCH',
  thcp: 'THCP',
  thcv: 'THCV',
};

// Full chemical names, used for the hover tooltip.
const CANNABINOID_NAMES: Record<string, string> = {
  d8: 'DELTA-8 THC',
  d9: 'DELTA-9 THC',
  d10: 'DELTA-10 THC',
  d11: 'DELTA-11 THC',
  cbd: 'CANNABIDIOL',
  cbda: 'CANNABIDIOLIC ACID',
  cbg: 'CANNABIGEROL',
  cbga: 'CANNABIGEROLIC ACID',
  cbn: 'CANNABINOL',
  cbc: 'CANNABICHROMENE',
  cbdv: 'CANNABIDIVARIN',
  h4cbd: 'HEXAHYDROCANNABIDIOL',
  thca: 'TETRAHYDROCANNABINOLIC ACID',
  thcb: 'TETRAHYDROCANNABUTOL',
  thch: 'TETRAHYDROCANNABIHEXOL',
  thcp: 'TETRAHYDROCANNABIPHOROL',
  thcv: 'TETRAHYDROCANNABIVARIN',
};

const CANNABINOID_BADGES = new Set([
  'cbc', 'cbd', 'cbda', 'cbdv', 'cbg', 'cbn', 'd8', 'd9', 'd10', 'd11',
  'h4cbd', 'thca', 'thcb', 'thch', 'thcp', 'thcv',
]);

interface CannabinoidBadge {
  key: string;
  label: string;
  name: string; // Full chemical name, for the hover tooltip.
  src: string | null; // Artwork path, or null when this cannabinoid still needs the drawn badge.
}

// Keys with no label at all are dropped rather than guessed at — those would
// be a content fix in WP.
function resolveCannabinoids(keys: string[] | undefined): CannabinoidBadge[] {
  const badges: CannabinoidBadge[] = [];
  for (const raw of keys || []) {
    const key = raw.trim().toLowerCase();
    const label = CANNABINOID_LABELS[key];
    if (!label || badges.some((b) => b.key === key)) continue;
    badges.push({
      key,
      label,
      name: CANNABINOID_NAMES[key] || label,
      src: CANNABINOID_BADGES.has(key) ? `/noid-badges/${key}.svg` : null,
    });
  }
  return badges.slice(0, 3);
}

// `calories` is an ACF text field, not a number field, so an unset value can
// arrive as either null or an empty/whitespace string.
function hasValue(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

// `mG` ("20mg"), `size` ("2mL", "3.5g", "1oz") and `pieces` ("4-pk") are
// taxonomy term names, not numbers — pull the leading number off each.
// None of them is scoped to nutrition-bearing products, so an absent or
// unparseable term just hides the badge.
function parseLeadingNumber(name: string | null | undefined): number | null {
  const match = name?.match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

// A product carries either an mG term or a size term, never both, and either
// is shown as-is. Neither multiplies up by `pieces`: most multi-item products
// are bundles of mixed contents, where a computed pack total would
// misrepresent what's inside.
//
// mG is labelled "TOTAL" rather than per-serving or per-pack because what it
// counts varies by product type — 1500mg across 30 gummies, 5000mg in a
// roll-on gel, but 20mg in one seltzer can. "TOTAL" is the only reading true
// of all of them, and understating a dose is the safer way to be imprecise.
interface BadgeAmount {
  label: string;
  value: string;
  unit: string;
}

function computeAmount(mG?: Props['mG'], size?: Props['size']): BadgeAmount | null {
  const mgValue = parseLeadingNumber(mG?.nodes?.[0]?.name);
  if (mgValue != null) {
    return { label: 'TOTAL', value: String(mgValue), unit: 'MG' };
  }

  // Size terms carry their own unit, and its case varies ("2mL", "2G", "1oz").
  const sizeTerm = size?.nodes?.[0]?.name?.trim();
  const sizeMatch = sizeTerm?.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/i);
  if (sizeMatch) {
    return { label: 'SIZE', value: sizeMatch[1], unit: sizeMatch[2].toUpperCase() };
  }

  return null;
}

// The feature tiles are scoped to beverages: their copy ("12oz Cans", the
// onset window, "Social Buzz") only holds for drinks.
function isBeverageProduct(productTypes?: Props['productTypes']): boolean {
  return (productTypes?.nodes || []).some((t) => t.name?.toLowerCase() === 'beverage');
}

// "12oz Cans" isn't backed by any field — no beverage has a volume or
// container-type taxonomy today — so it's fixed copy, scoped to beverages
// only. Pack count still comes from the real `pieces` term.
function cansLabel(pieces?: Props['pieces']): string {
  const count = parseLeadingNumber(pieces?.nodes?.[0]?.name);
  if (count == null) return '12oz Cans';
  return count === 1 ? 'Single 12oz Can' : `${count}-Pack 12oz Cans`;
}

export default function ProductSnapshot({
  nutrition,
  mG,
  size,
  pieces,
  topCannabinoids,
  productTypes,
}: Props) {
  const { calories } = nutrition || {};
  const hasCalories = hasValue(calories);
  const amount = computeAmount(mG, size);
  const cannabinoids = resolveCannabinoids(topCannabinoids);

  const isBeverage = isBeverageProduct(productTypes);
  const hasFeatureTiles = hasCalories || isBeverage;

  if (!hasCalories && !amount && cannabinoids.length === 0 && !isBeverage) {
    return null;
  }

  return (
    <div className="product-snapshot">
      <h3 className="product-snapshot__heading">
        Product Snapshot
      </h3>

      {(cannabinoids.length > 0 || amount) && (
        <ul className="product-snapshot__badges">
          {cannabinoids.map(({ key, label, name, src }) => (
            <li key={key}>
              {src ? (
                <img
                  className="snapshot-badge snapshot-badge--noid"
                  src={src}
                  alt={label}
                  title={name}
                  width={100}
                  height={100}
                />
              ) : (
                <SnapshotBadge label={label} title={name} />
              )}
            </li>
          ))}
          {amount && (
            <li>
              <SnapshotBadge label={amount.label} value={amount.value} unit={amount.unit} />
            </li>
          )}
        </ul>
      )}

      {hasFeatureTiles && (
        <ul className="product-snapshot__tiles">
          {isBeverage && (
            <li className="product-snapshot__tile product-snapshot__tile--social">
              <span className="product-snapshot__tile-icon"><SocialBuzzIcon /></span>
              <span className="product-snapshot__tile-label">Social Buzz</span>
            </li>
          )}
          {isBeverage && (
            <li className="product-snapshot__tile product-snapshot__tile--cans">
              <span className="product-snapshot__tile-icon"><CansIcon /></span>
              <span className="product-snapshot__tile-label">{cansLabel(pieces)}</span>
            </li>
          )}
          {isBeverage && (
            <li className="product-snapshot__tile product-snapshot__tile--onset">
              <span className="product-snapshot__tile-icon"><OnsetIcon /></span>
              <span className="product-snapshot__tile-label">15-30 min Onset</span>
            </li>
          )}
          {hasCalories && (
            <li className="product-snapshot__tile product-snapshot__tile--calories">
              <span className="product-snapshot__tile-icon"><CaloriesIcon /></span>
              <span className="product-snapshot__tile-label">{calories} Calories</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
