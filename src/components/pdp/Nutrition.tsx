import { ProductNutrition } from '@/types/woocommerce';

interface Props {
  nutrition?: ProductNutrition | null;
}

// `calories`/`sugar` are ACF text fields, not number fields, so an unset
// value can arrive as either null or an empty/whitespace string.
function hasValue(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

export default function Nutrition({ nutrition }: Props) {
  
  const { calories, sugar } = nutrition || {};
  const hasSugar = hasValue(sugar);
  const hasCalories = hasValue(calories);

  if (!hasSugar && !hasCalories) {
    return null;
  }

  return (
    <div className="product-nutrition">
      <h3 className="product-nutrition__heading">Nutrition</h3>

      {hasSugar && (
        <ul className="product-nutrition__badges">
          <li className="product-nutrition__badge">
            <span className="product-nutrition__badge-label">Sugar</span>
            <span className="product-nutrition__badge-value">{sugar}</span>
            <span className="product-nutrition__badge-unit">MG</span>
          </li>
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
