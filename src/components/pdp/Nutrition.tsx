import { ProductNutrition } from '@/types/woocommerce';

interface Props {
  nutrition?: ProductNutrition | null;
}

// Units per field. The ACF values are bare numbers ("40", "0"), so the unit is
// added here — sugar in mg and carbs in g, as specified.
const ROWS: Array<{ key: keyof ProductNutrition; label: string; unit: string }> = [
  { key: 'calories', label: 'Calories (per serving)', unit: '' },
  { key: 'carbs', label: 'Carbs (per serving)', unit: 'g' },
  { key: 'sugar', label: 'Sugar (per serving)', unit: 'mg' },
];

// The fields are ACF text, not number, so an unset value can arrive as null or
// an empty/whitespace string.
function hasValue(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

// Only append the unit to a purely numeric value, so one an editor has already
// typed with a unit ("12g") isn't doubled up.
function formatValue(value: string, unit: string): string {
  const trimmed = value.trim();
  return unit && /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}${unit}` : trimmed;
}

export default function Nutrition({ nutrition }: Props) {
  const rows = ROWS.filter(({ key }) => hasValue(nutrition?.[key]));
  if (rows.length === 0) return null;

  return (
    <table className="product-nutrition">
      <caption className="product-nutrition__caption">Nutrition</caption>
      <tbody>
        {rows.map(({ key, label, unit }) => (
          <tr key={key} className="product-nutrition__row">
            <th scope="row" className="product-nutrition__label">
              {label}
            </th>
            <td className="product-nutrition__value">{formatValue(nutrition![key]!, unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
