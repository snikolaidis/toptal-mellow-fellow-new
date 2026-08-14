import { Product } from '@/types/woocommerce';
import Link from 'next/link';

interface Props {
  product?: Product;
}

export default function Breadcrumb({ product }: Props) {

  const categories = product?.productCategories?.nodes || [];
  const category = categories[0];

  const strainName = product?.strainNames?.nodes?.[0]?.name;

  return (
    <nav className="breadcrumb" aria-label="breadcrumbs">
      <ul>
        <li>
          <Link href="/">Home</Link>
        </li>
        <li>
          <Link href="/shop">Shop</Link>
        </li>
        {category.slug && category.name && (
          <li>
            <Link href={`/shop?category=${category.slug}`}>{category.name}</Link>
          </li>
        )}
        {strainName && (
          <li className="is-active">
            <a href="" aria-current="page">
              {strainName}
            </a>
          </li>
        )}
      </ul>      
    </nav>
  )
}