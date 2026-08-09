import { Product } from '@/types/woocommerce';

interface Props {
  product: Product;
}

export default function ProductCoaLink({ product }: Props) {

  if (!product.productDetails?.coaLink) {
    return null;
  }
  
  return (
    <a
      href={product.productDetails.coaLink}
      target="_blank"
      rel="noopener noreferrer"
      className="coa-button"
    >
      See Test Results
    </a>
  );
}