import Image from 'next/image';
import Link from 'next/link';
import { Product } from '@/types/woocommerce';

interface Props {
  options: Product[];
  currentProductId: string;
  baseName: string;
}

// Strips the shared part of a sibling product's name so the tile shows only
// what differs (e.g. the flavour or pack size).
function optionLabel(name: string, base: string): string {
  if (base && name.includes(base)) {
    return name.replace(base, '').replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim() || name;
  }
  const packMatch = name.match(/\(([^)]*pack[^)]*)\)/i);
  if (packMatch) return packMatch[1];
  return name;
}

export default function AvailableOptions({ options, currentProductId, baseName }: Props) {
  // A single option is just the current product, so there's nothing to choose.
  if (options.length <= 1) {
    return null;
  }

  return (
    <div className="available-options">
      <span className="available-options__label">Available Options</span>
      <div className="available-options__list">
        {options.map((item) => (
          <Link
            key={item.id}
            href={`/products/${item.slug}`}
            scroll={false}
            prefetch
            className={`available-options__item ${
              item.id === currentProductId ? 'available-options__item--current' : ''
            }`}
            title={item.name}
          >
            <div className="available-options__image-wrap">
              <Image
                src={item.image?.sourceUrl || '/placeholder-product.png'}
                alt={item.name}
                fill
                sizes="90px"
                className="available-options__image"
              />
            </div>
            <span className="available-options__name">
              {optionLabel(item.name, baseName)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
