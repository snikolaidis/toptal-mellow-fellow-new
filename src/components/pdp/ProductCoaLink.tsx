import { Product } from '@/types/woocommerce';

interface Props {
  product: Product;
}

export default function ProductCoaLink({ product }: Props) {

  if (!product.productDetails?.coaLink) {
    return null;
  }
  
  return (
    <div className="product-coa-box">
      <h2 className="product-coa-box__title">
        Every batch lab tested.
      </h2>
      <p className="product-coa-box__description">
        Independent labs verify potency, purity and federal compliance on every batch we ship. Scan the QR code on the can or click below to see this batch's full certificate of analysis.
      </p>
      <a
        href={product.productDetails.coaLink}
        target="_blank"
        rel="noopener noreferrer"
        className="product-coa-box__button"
      >
        View this batch's COA
      </a>
    </div>
  );
}